import { RequestError, allowedOrigin, configured, readDeclaration, validateDeclaration,
  digest, verifyCaptcha, sendAcknowledgement, limitedText } from './declaration.mjs';

const HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' };
const json = (data, status = 200, origin = '') => new Response(JSON.stringify(data), {
  status, headers: { ...HEADERS, ...(origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}) },
});
const failure = (error, origin = '') => json({ ok: false, error: error instanceof RequestError
  ? error.code : 'temporarily-unavailable' }, error instanceof RequestError ? error.status : 503, origin);

export function createWorker({ captcha = verifyCaptcha } = {}) {
  return {
    async fetch(request, env) {
      const url = new URL(request.url), origin = request.headers.get('Origin') || '';
      const permitted = allowedOrigin(origin, env.ALLOW_LOCAL_TEST_ORIGINS === 'true');
      if (url.pathname === '/api/withdrawals') {
        if (!permitted) return json({ ok: false, error: 'forbidden' }, 403);
        if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: {
          'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type', Vary: 'Origin', 'Cache-Control': 'no-store',
        } });
        if (request.method !== 'POST') return json({ ok: false, error: 'method-not-allowed' }, 405, origin);
        if (!configured(env)) return json({ ok: false, error: 'not-configured' }, 503, origin);
        try {
          const { declaration, token } = await readDeclaration(request);
          const ip = request.headers.get('CF-Connecting-IP');
          if (!ip || ip.length > 64) throw new RequestError('temporarily-unavailable', 503);
          if (!(await env.WITHDRAWAL_IP_LIMIT.limit({ key: await digest(ip) })).success)
            throw new RequestError('rate-limited', 429);
          if (!await captcha(env, token, ip)) throw new RequestError('captcha-failed', 422);
          const inbox = env.INBOX.get(env.INBOX.idFromName('withdrawal-inbox-v1'));
          const response = await inbox.fetch(new Request('https://withdrawal-inbox.invalid/receive', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(declaration),
          }));
          return new Response(response.body, { status: response.status, headers: { ...HEADERS,
            'Access-Control-Allow-Origin': origin, Vary: 'Origin' } });
        } catch (error) { return failure(error, origin); }
      }
      if (url.pathname === '/api/config') {
        if (request.method !== 'GET') return json({ ok: false, error: 'method-not-allowed' }, 405);
        return configured(env) ? json({ enabled: true, siteKey: env.TURNSTILE_SITE_KEY })
          : json({ enabled: false, error: 'not-configured' }, 503);
      }
      if (!['/', '/index.html', '/app.js', '/style.css'].includes(url.pathname))
        return json({ ok: false, error: 'not-found' }, 404);
      if (!['GET', 'HEAD'].includes(request.method)) return json({ ok: false, error: 'method-not-allowed' }, 405);
      if (!configured(env)) return json({ ok: false, error: 'not-configured' }, 503);
      const response = await env.ASSETS.fetch(request), headers = new Headers(response.headers);
      headers.set('Cache-Control', 'no-store');
      headers.set('Referrer-Policy', 'no-referrer');
      headers.set('X-Content-Type-Options', 'nosniff');
      headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; connect-src 'self' https://challenges.cloudflare.com; style-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
      return new Response(response.body, { status: response.status, headers });
    },
  };
}

export default createWorker();

const DAY = 86400000, RETENTION = 30 * DAY, RETRY_WINDOW = 23 * 3600000;
const DAILY_RECIPIENT_ATTEMPTS = 40, QUEUE_LIMIT = 128;
const RETRIES = [60000, 300000, 1800000, 0];
const recordKey = id => `record:${id}`;
const recoveryKey = id => `held:${id}`;
const utcDay = time => new Date(time).toISOString().slice(0, 10);
const nextDay = time => Date.parse(`${utcDay(time)}T00:00:00Z`) + DAY + 1000;

/** One private object serializes receipt, budget and send state. No public read/admin endpoint. */
export class WithdrawalInbox {
  constructor(ctx, env, dependencies = {}) {
    this.storage = ctx.storage; this.env = env; this.lock = Promise.resolve();
    this.now = dependencies.now || Date.now;
    this.send = dependencies.send || sendAcknowledgement;
  }
  exclusive(action) {
    const result = this.lock.then(action); this.lock = result.catch(() => {}); return result;
  }
  fetch(request) {
    return this.exclusive(async () => {
      try {
        if (!configured(this.env)) throw new RequestError('not-configured', 503);
        if (request.method !== 'POST' || new URL(request.url).pathname !== '/receive')
          throw new RequestError('not-found', 404);
        const raw = await limitedText(request.body, 4096);
        let value;
        try { value = JSON.parse(raw); } catch { throw new RequestError('invalid-request'); }
        const { declaration } = validateDeclaration({ ...value, turnstileToken: 'internally-verified' });
        const fingerprint = await digest(JSON.stringify(declaration));
        await this.maintenance();
        let record = await this.storage.get(recordKey(declaration.requestId));
        if (record && record.fingerprint !== fingerprint) throw new RequestError('request-id-conflict', 409);
        if (!record) {
          const held = await this.env.RECOVERY.get(recoveryKey(declaration.requestId), 'json');
          if (held) {
            if (held.fingerprint !== fingerprint) throw new RequestError('request-id-conflict', 409);
            return json({ ok: true, received: true, receipt: { id: declaration.requestId,
              receivedAt: held.receivedAt, acknowledgement: 'pending' } }, 202);
          }
          const queue = await this.storage.get('queue') || [];
          const usage = await this.usage();
          if (queue.length >= QUEUE_LIMIT || usage.recipients + 2 > DAILY_RECIPIENT_ATTEMPTS)
            throw new RequestError('temporarily-busy', 429);
          const now = this.now();
          record = { id: declaration.requestId, fingerprint, receivedAt: new Date(now).toISOString(),
            createdAt: now, declaration, state: 'pending', attempts: 0, nextAttemptAt: now };
          // Commit the exact notice and receipt time before any send can happen.
          await this.storage.put({ [recordKey(record.id)]: record, queue: [...queue, record.id] });
          await this.storage.setAlarm(now + 60000);
        }
        record = await this.attempt(record);
        await this.schedule();
        return json({ ok: true, received: true, receipt: { id: record.id, receivedAt: record.receivedAt,
          acknowledgement: record.state === 'accepted' ? 'accepted-for-sending' : 'pending' } },
        record.state === 'accepted' ? 200 : 202);
      } catch (error) { return failure(error); }
    });
  }
  async usage() {
    const day = utcDay(this.now()), stored = await this.storage.get('usage');
    return stored?.day === day ? stored : { day, recipients: 0 };
  }
  async removeQueued(id) {
    const queue = await this.storage.get('queue') || [];
    await this.storage.put('queue', queue.filter(value => value !== id));
  }
  async hold(record) {
    try {
      // Private KV provides the documented authenticated dashboard/CLI recovery route.
      // No HTTP read endpoint is exposed, and the original receipt time is preserved.
      await this.env.RECOVERY.put(recoveryKey(record.id), JSON.stringify({ ...record, state: 'held' }));
      const held = { id: record.id, fingerprint: record.fingerprint, receivedAt: record.receivedAt,
        state: 'held', expiresAt: this.now() + RETENTION };
      const completed = await this.storage.get('completed') || [];
      await this.storage.put({ [recordKey(record.id)]: held,
        completed: [...completed, { id: record.id, expiresAt: held.expiresAt }] });
      await this.removeQueued(record.id);
      return held;
    } catch {
      // A failed export must leave the notice discoverable in the inbox and retryable.
      record.state = 'recovery-pending'; record.nextAttemptAt = this.now() + 1800000;
      await this.storage.put(recordKey(record.id), record);
      return record;
    }
  }
  async attempt(record) {
    const now = this.now();
    if (record.state === 'recovery-pending') return record.nextAttemptAt <= now ? this.hold(record) : record;
    if (record.state !== 'pending') return record;
    if (now - record.createdAt >= RETRY_WINDOW || record.attempts >= RETRIES.length) {
      return this.hold(record);
    }
    if (record.nextAttemptAt > now) return record;
    const usage = await this.usage();
    if (usage.recipients + 2 > DAILY_RECIPIENT_ATTEMPTS) {
      record.nextAttemptAt = nextDay(now); await this.storage.put(recordKey(record.id), record); return record;
    }
    record.attempts++; record.nextAttemptAt = now + RETRIES[record.attempts - 1];
    // Count even failed/ambiguous attempts, conservatively reserving two recipients.
    await this.storage.put({ [recordKey(record.id)]: record,
      usage: { ...usage, recipients: usage.recipients + 2 } });
    try {
      const mailId = await this.send(this.env, record.declaration, record.receivedAt);
      const accepted = { id: record.id, fingerprint: record.fingerprint, receivedAt: record.receivedAt,
        state: 'accepted', mailId, expiresAt: now + RETENTION };
      const completed = await this.storage.get('completed') || [];
      await this.storage.put({ [recordKey(record.id)]: accepted,
        completed: [...completed, { id: record.id, expiresAt: accepted.expiresAt }] });
      await this.removeQueued(record.id);
      return accepted; // Personal-data payload is removed after API acceptance, not merely attempted send.
    } catch {
      if (record.attempts >= RETRIES.length) return this.hold(record);
      await this.storage.put(recordKey(record.id), record);
      return record;
    }
  }
  async maintenance() {
    const now = this.now(), completed = await this.storage.get('completed') || [], keep = [];
    for (const item of completed) {
      if (item.expiresAt <= now) await this.storage.delete(recordKey(item.id)); else keep.push(item);
    }
    if (keep.length !== completed.length) await this.storage.put('completed', keep);
  }
  async schedule() {
    const queue = await this.storage.get('queue') || [], completed = await this.storage.get('completed') || [];
    let at = Infinity;
    for (const id of queue) {
      const record = await this.storage.get(recordKey(id));
      if (record?.state === 'pending') at = Math.min(at, record.nextAttemptAt, record.createdAt + RETRY_WINDOW);
      if (record?.state === 'recovery-pending') at = Math.min(at, record.nextAttemptAt);
    }
    for (const item of completed) at = Math.min(at, item.expiresAt);
    if (Number.isFinite(at)) await this.storage.setAlarm(Math.max(this.now() + 1000, at));
    else await this.storage.deleteAlarm();
  }
  alarm() {
    return this.exclusive(async () => {
      if (!configured(this.env)) { await this.storage.deleteAlarm(); return; }
      await this.maintenance();
      const queue = await this.storage.get('queue') || [];
      // At most one outbound call per alarm; don't hold the object behind a long network loop.
      for (const id of queue) {
        const record = await this.storage.get(recordKey(id));
        if (record?.state === 'recovery-pending' && record.nextAttemptAt <= this.now()) {
          await this.hold(record); break;
        }
        if (record?.state === 'pending' && (record.nextAttemptAt <= this.now()
            || record.createdAt + RETRY_WINDOW <= this.now())) { await this.attempt(record); break; }
      }
      await this.schedule();
    });
  }
}
