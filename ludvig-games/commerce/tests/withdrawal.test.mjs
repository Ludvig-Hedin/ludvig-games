import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createWorker, WithdrawalInbox } from '../../withdrawal/worker.mjs';
import { validateDeclaration, acknowledgement, sendAcknowledgement, verifyCaptcha,
  SERVICE_ORIGIN, OPERATOR } from '../../withdrawal/declaration.mjs';

if (!globalThis.crypto) globalThis.crypto = webcrypto;
const ID = '00000000-0000-4000-8000-000000000001';
const MAIL_ID = '00000000-0000-4000-8000-000000000099';
const START = Date.parse('2026-11-01T10:00:00.000Z');
const input = changes => ({ requestId: ID, name: 'Test Buyer', orderDetails: 'Order TEST-42',
  email: 'buyer@example.com', turnstileToken: 'synthetic-token', ...changes });
const copy = value => value === undefined ? undefined : structuredClone(value);
class Storage {
  values = new Map(); alarmAt = null;
  async get(key) { return copy(this.values.get(key)); }
  async put(key, value) {
    if (typeof key === 'object') { for (const [k, v] of Object.entries(key)) this.values.set(k, copy(v)); }
    else this.values.set(key, copy(value));
  }
  async delete(key) { return this.values.delete(key); }
  async setAlarm(time) { this.alarmAt = time; }
  async deleteAlarm() { this.alarmAt = null; }
}
function setup({ fail = false } = {}) {
  const storage = new Storage(), mails = [], recovery = new Map();
  let now = START, failSend = fail, captchaCalls = 0, recoveryFails = false;
  const env = { WITHDRAWAL_ENABLED: 'true', RESEND_API_KEY: 're_synthetic_not_a_real_key',
    TURNSTILE_SECRET: 'synthetic-secret-not-real', TURNSTILE_SITE_KEY: 'synthetic-site-key',
    WITHDRAWAL_IP_LIMIT: { limit: async () => ({ success: true }) },
    ASSETS: { fetch: async () => new Response('asset') },
    RECOVERY: { get: async key => copy(recovery.get(key)), put: async (key, value) => {
      if (recoveryFails) throw new Error('synthetic KV failure');
      recovery.set(key, JSON.parse(value));
    } },
  };
  const inbox = new WithdrawalInbox({ storage }, env, { now: () => now,
    send: async (_env, declaration, receivedAt) => {
      const recorded = await storage.get(`record:${declaration.requestId}`);
      assert.equal(recorded.receivedAt, receivedAt);
      assert.deepEqual(recorded.declaration, declaration, 'persist content before sending');
      mails.push({ declaration: copy(declaration), receivedAt, payload: acknowledgement(declaration, receivedAt) });
      if (failSend) throw new Error('synthetic provider detail must not leave the service');
      return MAIL_ID;
    },
  });
  env.INBOX = { idFromName: name => name, get: () => inbox };
  const worker = createWorker({ captcha: async () => { captchaCalls++; return true; } });
  const request = (body = input(), headers = {}) => new Request(SERVICE_ORIGIN + '/api/withdrawals', {
    method: 'POST', headers: { Origin: SERVICE_ORIGIN, 'Content-Type': 'application/json',
      'CF-Connecting-IP': '192.0.2.1', ...headers }, body: JSON.stringify(body),
  });
  return { storage, env, inbox, mails, worker, request, recovery, get captchaCalls() { return captchaCalls; },
    failRecovery: () => { recoveryFails = true; }, restoreRecovery: () => { recoveryFails = false; },
    advance: ms => { now += ms; }, recover: () => { failSend = false; } };
}

test('default-off service rejects submissions and does not serve an active form', async () => {
  const s = setup(); s.env.WITHDRAWAL_ENABLED = 'false';
  for (const url of ['/', '/api/config']) {
    const response = await s.worker.fetch(new Request(SERVICE_ORIGIN + url), s.env);
    assert.equal(response.status, 503);
  }
  assert.equal((await s.worker.fetch(s.request(), s.env)).status, 503);
  assert.equal(s.mails.length, 0); assert.equal(s.storage.values.size, 0);
});

test('strict fields reject header injection, unexpected credentials and oversized bodies', async () => {
  for (const body of [input({ name: 'Buyer\r\nBcc: other@example.com' }), input({ email: 'a@example.com\nBcc:x@example.com' }),
    input({ requestId: 'not-a-uuid' }), input({ name: '' }), input({ orderDetails: 'x'.repeat(501) }),
    { ...input(), licenseKey: 'not-requested' }, { ...input(), constructor: 'not-accepted' }]) {
    assert.throws(() => validateDeclaration(body));
  }
  const s = setup();
  const large = new Request(SERVICE_ORIGIN + '/api/withdrawals', { method: 'POST',
    headers: { Origin: SERVICE_ORIGIN, 'Content-Type': 'application/json' }, body: 'x'.repeat(8193) });
  assert.equal((await s.worker.fetch(large, s.env)).status, 413);
  assert.equal(s.mails.length, 0);
});

test('origin, method, required bindings, IP and CAPTCHA fail before recording', async () => {
  const s = setup();
  for (const origin of ['', 'https://evil.invalid', 'https://games.ludvighedin.com.evil.invalid'])
    assert.equal((await s.worker.fetch(s.request(input(), { Origin: origin }), s.env)).status, 403);
  const get = new Request(SERVICE_ORIGIN + '/api/withdrawals', { headers: { Origin: SERVICE_ORIGIN } });
  assert.equal((await s.worker.fetch(get, s.env)).status, 405);
  assert.equal((await s.worker.fetch(s.request(input(), { 'CF-Connecting-IP': '' }), s.env)).status, 503);
  for (const binding of ['RESEND_API_KEY', 'TURNSTILE_SECRET', 'TURNSTILE_SITE_KEY', 'WITHDRAWAL_IP_LIMIT', 'INBOX', 'ASSETS', 'RECOVERY']) {
    const env = { ...s.env }; delete env[binding];
    assert.equal((await s.worker.fetch(s.request(), env)).status, 503, binding);
  }
  const denied = createWorker({ captcha: async () => false });
  const response = await denied.fetch(s.request(), s.env);
  assert.equal(response.status, 422); assert.equal((await response.json()).error, 'captcha-failed');
  assert.equal(s.storage.values.size, 0); assert.equal(s.mails.length, 0);
});

test('acknowledgement safely contains the complete declaration and timestamp, with operator copy', () => {
  const { declaration } = validateDeclaration(input({ name: '<img src=x onerror=alert(1)>' }));
  const payload = acknowledgement(declaration, new Date(START).toISOString());
  assert.deepEqual(payload.to, ['buyer@example.com']); assert.deepEqual(payload.bcc, [OPERATOR]);
  assert.equal(payload.reply_to, OPERATOR);
  assert.match(payload.text, /I withdraw from the contract identified below/);
  assert.ok(payload.text.includes(declaration.name)); assert.ok(payload.text.includes(declaration.orderDetails));
  assert.ok(payload.text.includes(declaration.email)); assert.ok(payload.text.includes(new Date(START).toISOString()));
  assert.ok(payload.html.includes('&lt;img')); assert.ok(!payload.html.includes('<img'));
  assert.ok(!payload.subject.includes(declaration.name));
});

test('successful concurrent replay sends once, rejects altered content and removes personal payload', async () => {
  const s = setup();
  const responses = await Promise.all([s.worker.fetch(s.request(), s.env), s.worker.fetch(s.request(), s.env)]);
  assert.deepEqual(responses.map(r => r.status), [200, 200]);
  const receipts = await Promise.all(responses.map(r => r.json()));
  assert.deepEqual(receipts[0], receipts[1]); assert.equal(s.mails.length, 1);
  assert.equal(receipts[0].receipt.acknowledgement, 'accepted-for-sending');
  assert.equal(receipts[0].receipt.receivedAt, new Date(START).toISOString());
  const record = await s.storage.get(`record:${ID}`);
  assert.equal(record.declaration, undefined); assert.equal(record.state, 'accepted');
  const publicReply = JSON.stringify(receipts[0]);
  for (const privateValue of ['buyer@example.com', 'Test Buyer', s.env.RESEND_API_KEY, s.env.TURNSTILE_SECRET])
    assert.ok(!publicReply.includes(privateValue));
  const changed = await s.worker.fetch(s.request(input({ orderDetails: 'A different purchase' })), s.env);
  assert.equal(changed.status, 409); assert.equal(s.mails.length, 1);
  assert.equal(JSON.stringify([...s.storage.values.values()]).includes('192.0.2.1'), false);
});

test('failed send stays pending, retry retains receipt time and does not claim delivered', async () => {
  const s = setup({ fail: true });
  const first = await s.worker.fetch(s.request(), s.env), body = await first.json();
  assert.equal(first.status, 202); assert.equal(body.receipt.acknowledgement, 'pending');
  let record = await s.storage.get(`record:${ID}`);
  assert.equal(record.declaration.email, 'buyer@example.com'); assert.equal(record.attempts, 1);
  assert.ok(!JSON.stringify(body).includes('synthetic provider detail'));
  assert.equal((await s.worker.fetch(s.request(), s.env)).status, 202);
  assert.equal(s.mails.length, 1, 'rapid replay must not create another attempt');
  s.advance(60001); s.recover(); await s.inbox.alarm();
  record = await s.storage.get(`record:${ID}`);
  assert.equal(record.state, 'accepted'); assert.equal(record.declaration, undefined);
  assert.equal(s.mails[1].receivedAt, body.receipt.receivedAt);
  assert.equal((await s.worker.fetch(s.request(), s.env)).status, 200);
});

test('daily recipient budget rejects new notices before recording and expiry holds ambiguous sends', async () => {
  const s = setup(); await s.storage.put('usage', { day: '2026-11-01', recipients: 40 });
  assert.equal((await s.worker.fetch(s.request(), s.env)).status, 429);
  assert.equal(await s.storage.get(`record:${ID}`), undefined); assert.equal(s.mails.length, 0);
  const pending = setup({ fail: true }); await pending.worker.fetch(pending.request(), pending.env);
  pending.advance(24 * 3600000); await pending.inbox.alarm();
  assert.equal((await pending.storage.get(`record:${ID}`)).state, 'held');
  assert.equal((await pending.storage.get(`record:${ID}`)).declaration, undefined);
  assert.equal(pending.recovery.get(`held:${ID}`).declaration.email, 'buyer@example.com');
  assert.equal(pending.mails.length, 1, 'never automatically retry past provider idempotency window');
  assert.deepEqual(await pending.storage.get('queue'), []);
});

test('failed recovery export retains the notice and retries privately without another mail attempt', async () => {
  const s = setup({ fail: true }); await s.worker.fetch(s.request(), s.env);
  s.failRecovery(); s.advance(24 * 3600000); await s.inbox.alarm();
  assert.equal((await s.storage.get(`record:${ID}`)).state, 'recovery-pending');
  assert.equal((await s.storage.get(`record:${ID}`)).declaration.orderDetails, 'Order TEST-42');
  assert.deepEqual(await s.storage.get('queue'), [ID]);
  s.restoreRecovery(); s.advance(1800001); await s.inbox.alarm();
  assert.equal(s.recovery.get(`held:${ID}`).receivedAt, new Date(START).toISOString());
  assert.equal((await s.storage.get(`record:${ID}`)).declaration, undefined);
  assert.equal(s.mails.length, 1);
  s.advance(31 * 86400000); await s.inbox.alarm();
  const replay = await s.worker.fetch(s.request(), s.env), body = await replay.json();
  assert.equal(replay.status, 202);
  assert.equal(body.receipt.receivedAt, new Date(START).toISOString());
  assert.equal(s.mails.length, 1, 'expired minimal metadata must not overwrite an unresolved held notice');
});

test('completed minimal metadata expires while held requests remain available for operator recovery', async () => {
  const s = setup(); await s.worker.fetch(s.request(), s.env); s.advance(31 * 86400000); await s.inbox.alarm();
  assert.equal(await s.storage.get(`record:${ID}`), undefined);
  assert.deepEqual(await s.storage.get('completed'), []);
});

test('disabling the service also stops queued mail without deleting received declarations', async () => {
  const s = setup({ fail: true }); await s.worker.fetch(s.request(), s.env);
  s.env.WITHDRAWAL_ENABLED = 'false'; s.advance(60001); await s.inbox.alarm();
  assert.equal(s.mails.length, 1); assert.equal(s.storage.alarmAt, null);
  assert.equal((await s.storage.get(`record:${ID}`)).declaration.email, 'buyer@example.com');
});

test('provider adapters use fixed bounded endpoints and idempotency; redirect is never followed', async () => {
  const { declaration } = validateDeclaration(input()); let calls = 0;
  const env = { WITHDRAWAL_ENABLED: 'true', RESEND_API_KEY: 're_synthetic_not_a_real_key', TURNSTILE_SECRET: 'synthetic-secret-not-real' };
  const fakeSend = async (url, options) => {
    calls++; assert.equal(url, 'https://api.resend.com/emails'); assert.equal(options.method, 'POST');
    assert.equal(options.redirect, 'manual'); assert.equal(options.headers['Idempotency-Key'], `games-withdrawal/${ID}`);
    const body = JSON.parse(options.body); assert.equal(body.from, `Ludvig Games <${OPERATOR}>`);
    assert.deepEqual(body.bcc, [OPERATOR]); return Response.json({ id: MAIL_ID });
  };
  assert.equal(await sendAcknowledgement(env, declaration, new Date(START).toISOString(), fakeSend), MAIL_ID);
  assert.equal(calls, 1);
  await assert.rejects(sendAcknowledgement(env, declaration, new Date(START).toISOString(), async () => {
    calls++; return new Response(null, { status: 302, headers: { Location: 'https://evil.invalid' } });
  }));
  assert.equal(calls, 2);
  const captcha = result => async (url, options) => {
    assert.equal(url, 'https://challenges.cloudflare.com/turnstile/v0/siteverify');
    assert.equal(options.redirect, 'manual'); return Response.json(result);
  };
  assert.equal(await verifyCaptcha(env, 'token', '192.0.2.1', captcha({ success: true, action: 'withdrawal', hostname: 'evil.invalid' })), false);
  assert.equal(await verifyCaptcha(env, 'token', '192.0.2.1', captcha({ success: true, action: 'withdrawal', hostname: 'games.ludvighedin.com' })), true);
});

test('actual Worker engine and SQLite inbox persist one acknowledgement across repeat events', {
  skip: process.env.GAMES_WITHDRAWAL_ENGINE !== 'true', timeout: 30000,
}, async () => {
  // Reuse the installed engine. Both outbound hosts are intercepted; network is disabled.
  const require = createRequire(new URL('../../../desktop/package.json', import.meta.url));
  const { Miniflare, NoOpLog, createFetchMock } = require('miniflare');
  const fetchMock = createFetchMock(); fetchMock.disableNetConnect();
  let sends = 0;
  fetchMock.get('https://challenges.cloudflare.com').intercept({
    path: '/turnstile/v0/siteverify', method: 'POST',
  }).reply(200, JSON.stringify({ success: true, action: 'withdrawal', hostname: 'games.ludvighedin.com' }),
  { headers: { 'Content-Type': 'application/json' } }).persist();
  fetchMock.get('https://api.resend.com').intercept({ path: '/emails', method: 'POST' }).reply(() => {
    sends++;
    return { statusCode: 200, data: JSON.stringify({ id: MAIL_ID }),
      responseOptions: { headers: { 'Content-Type': 'application/json' } } };
  }).persist();
  const directory = fileURLToPath(new URL('../../withdrawal/', import.meta.url));
  const mf = new Miniflare({
    host: '127.0.0.1', port: 0, log: new NoOpLog(), modulesRoot: directory,
    modules: ['worker.mjs', 'declaration.mjs'].map(name => ({ type: 'ESModule', path: directory + name })),
    compatibilityDate: '2026-07-30',
    bindings: { WITHDRAWAL_ENABLED: 'true', RESEND_API_KEY: 're_synthetic_not_a_real_key',
      TURNSTILE_SECRET: 'synthetic-secret-not-real', TURNSTILE_SITE_KEY: 'synthetic-site-key' },
    serviceBindings: { ASSETS: async () => new Response('synthetic asset') },
    kvNamespaces: ['RECOVERY'],
    durableObjects: { INBOX: { className: 'WithdrawalInbox', useSQLite: true } }, durableObjectsPersist: false,
    ratelimits: { WITHDRAWAL_IP_LIMIT: { namespace_id: '4203', simple: { limit: 2, period: 60 } } },
    fetchMock,
  });
  try {
    const submit = () => mf.dispatchFetch(SERVICE_ORIGIN + '/api/withdrawals', { method: 'POST',
      headers: { Origin: 'https://games.ludvighedin.com', 'CF-Connecting-IP': '192.0.2.1',
        'Content-Type': 'application/json' }, body: JSON.stringify(input()) });
    const first = await submit(), body = await first.json();
    assert.equal(first.status, 200, body.error || 'real Worker must reach the SQLite inbox and fake mail API');
    assert.equal(body.receipt.acknowledgement, 'accepted-for-sending');
    assert.ok(Number.isFinite(Date.parse(body.receipt.receivedAt))); assert.equal(sends, 1);
    const second = await submit(); assert.equal(second.status, 200);
    assert.deepEqual(await second.json(), body); assert.equal(sends, 1);
    assert.equal(JSON.stringify(body).includes('buyer@example.com'), false);
    assert.equal((await submit()).status, 429); assert.equal(sends, 1);
  } finally {
    try { await mf.dispose(); } finally { await fetchMock.close(); }
  }
});

test('actual SQLite holds a failed notice in privately readable KV after bounded retries', {
  skip: process.env.GAMES_WITHDRAWAL_ENGINE !== 'true', timeout: 30000,
}, async () => {
  const require = createRequire(new URL('../../../desktop/package.json', import.meta.url));
  const { Miniflare, NoOpLog, createFetchMock } = require('miniflare');
  const fetchMock = createFetchMock(); fetchMock.disableNetConnect();
  let sends = 0;
  fetchMock.get('https://challenges.cloudflare.com').intercept({
    path: '/turnstile/v0/siteverify', method: 'POST',
  }).reply(200, JSON.stringify({ success: true, action: 'withdrawal', hostname: 'games.ludvighedin.com' }),
  { headers: { 'Content-Type': 'application/json' } }).persist();
  fetchMock.get('https://api.resend.com').intercept({ path: '/emails', method: 'POST' }).reply(() => {
    sends++;
    return { statusCode: 503, data: JSON.stringify({ error: 'synthetic outage' }),
      responseOptions: { headers: { 'Content-Type': 'application/json' } } };
  }).persist();
  const directory = fileURLToPath(new URL('../../withdrawal/', import.meta.url));
  // Only this virtual local fixture advances time or invokes alarms. The deployed module has no such route.
  const fixture = `import worker, { WithdrawalInbox } from './worker.mjs'; export default worker;
    export class FixtureInbox extends WithdrawalInbox {
      constructor(ctx, env) { let time = Date.now(); super(ctx, env, { now: () => time });
        this.advance = delta => { time += delta; }; }
      async fetch(request) {
        if (new URL(request.url).pathname === '/fixture-advance') {
          this.advance(Number(await request.text())); await super.alarm(); return new Response('advanced');
        }
        return super.fetch(request);
      }
    }`;
  const mf = new Miniflare({ host: '127.0.0.1', port: 0, log: new NoOpLog(), modulesRoot: directory,
    modules: [{ type: 'ESModule', path: directory + 'local-recovery-fixture.mjs', contents: fixture },
      ...['worker.mjs', 'declaration.mjs'].map(name => ({ type: 'ESModule', path: directory + name }))],
    compatibilityDate: '2026-07-30',
    bindings: { WITHDRAWAL_ENABLED: 'true', RESEND_API_KEY: 're_synthetic_not_a_real_key',
      TURNSTILE_SECRET: 'synthetic-secret-not-real', TURNSTILE_SITE_KEY: 'synthetic-site-key' },
    serviceBindings: { ASSETS: async () => new Response('synthetic asset') },
    kvNamespaces: ['RECOVERY'],
    durableObjects: { INBOX: { className: 'FixtureInbox', useSQLite: true } }, durableObjectsPersist: false,
    ratelimits: { WITHDRAWAL_IP_LIMIT: { namespace_id: '4203', simple: { limit: 2, period: 60 } } }, fetchMock,
  });
  try {
    const request = () => mf.dispatchFetch(SERVICE_ORIGIN + '/api/withdrawals', { method: 'POST',
      headers: { Origin: SERVICE_ORIGIN, 'CF-Connecting-IP': '192.0.2.1', 'Content-Type': 'application/json' },
      body: JSON.stringify(input()) });
    const first = await request(), receipt = await first.json(); assert.equal(first.status, 202);
    const namespace = await mf.getDurableObjectNamespace('INBOX');
    const inbox = namespace.get(namespace.idFromName('withdrawal-inbox-v1'));
    for (const delay of [60001, 300001, 1800001])
      await inbox.fetch('https://internal.invalid/fixture-advance', { method: 'POST', body: String(delay) });
    assert.equal(sends, 4);
    const kv = await mf.getKVNamespace('RECOVERY'), held = await kv.get(`held:${ID}`, 'json');
    assert.equal(held.state, 'held'); assert.equal(held.receivedAt, receipt.receipt.receivedAt);
    assert.equal(held.declaration.orderDetails, 'Order TEST-42');
    assert.equal(held.declaration.email, 'buyer@example.com');
    assert.equal((await kv.list({ prefix: 'held:' })).keys.length, 1, 'operator can discover and read held notices privately');
    await inbox.fetch('https://internal.invalid/fixture-advance', { method: 'POST', body: String(31 * 86400000) });
    const replay = await request(); assert.equal(replay.status, 202);
    assert.equal((await replay.json()).receipt.receivedAt, receipt.receipt.receivedAt);
    assert.equal(sends, 4);
    assert.equal((await mf.dispatchFetch(SERVICE_ORIGIN + `/held:${ID}`)).status, 404);
  } finally {
    try { await mf.dispose(); } finally { await fetchMock.close(); }
  }
});
