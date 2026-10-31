import test from 'node:test';
import assert from 'node:assert/strict';
import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { normalizeLicense, readLimitedBody } from '../license.mjs';

const requested = !!process.env.LS_TEST_LICENSE_FILE || process.env.LS_EXPECT_DISABLED !== undefined;

// Root must first disable the exact test licence and wait beyond the 30-second
// successful-validation cache. This test never changes merchant state.
test('disabled test bundle grants no hosted entitlements or Ritkaos ownership', {
  skip: !requested, timeout: 45000,
}, async () => {
  assert.ok(process.env.LS_EXPECT_DISABLED === 'true', 'explicit disabled-state opt-in is required');
  const fixture = path.join(os.homedir(), '.config/ludvig-games-commerce/test-native-license.txt');
  assert.ok(process.env.LS_TEST_LICENSE_FILE === fixture, 'only the fixed private fixture is permitted');
  const info = await lstat(fixture);
  assert.ok(info.isFile() && !info.isSymbolicLink() && info.uid === process.getuid()
    && (info.mode & 0o777) === 0o600 && info.size <= 256, 'private fixture must be owned and protected');
  assert.ok(await realpath(fixture) === fixture, 'private fixture must not traverse a symlink');
  const key = normalizeLicense(await readFile(fixture, 'utf8'));
  assert.ok(key, 'private test fixture must be valid');

  const base = 'https://ludvig-games-store-test.ludvighedin.workers.dev';
  async function request(endpoint, data, expectedStatus) {
    const signal = AbortSignal.timeout(7000);
    const response = await fetch(base + endpoint, {
      method: data ? 'POST' : 'GET', redirect: 'error', signal,
      headers: { Origin: 'https://games.ludvighedin.com', 'Content-Type': 'application/json' },
      ...(data ? { body: JSON.stringify(data) } : {}),
    });
    assert.ok(response.status === expectedStatus, 'hosted request returned an unexpected status');
    assert.ok((response.headers.get('content-type') || '').includes('application/json'), 'hosted response must be JSON');
    const body = await readLimitedBody(response.body, 16384, signal);
    assert.ok(!body.toLowerCase().includes(key), 'hosted response must not echo the bearer key');
    let result;
    try { result = JSON.parse(body); }
    catch { throw new Error('hosted response must contain valid JSON'); }
    assert.ok(result && typeof result === 'object' && !Array.isArray(result), 'hosted response must be an object');
    return result;
  }

  const catalog = await request('/api/store', undefined, 200);
  assert.ok(catalog.environment === 'test' && catalog.ready === true && catalog.grantReady === true,
    'the exact test service must be configured before a negative licence check');
  for (const [endpoint, data] of [
    ['/api/licenses/resolve', { key }],
    ['/api/licenses/grant', { key, audience: randomUUID(), challenge: randomUUID() }],
  ]) {
    const result = await request(endpoint, data, 422);
    assert.ok(result.ok === false && result.error === 'invalid-license', 'disabled licence must be rejected');
    assert.ok(!Object.hasOwn(result, 'entitlements') && !Object.hasOwn(result, 'proof'),
      'a rejected licence must return neither ownership nor a signed proof');
  }

  const ws = new WebSocket('wss://ritkaos.ludvighedin.workers.dev/ws');
  let welcome, owned, ownedMessages = 0, protocolFailure = false, pending;
  function rejectPending() {
    if (!pending) return;
    clearTimeout(pending.timer); pending.reject(new Error('hosted Ritkaos connection ended')); pending = undefined;
  }
  ws.addEventListener('error', rejectPending);
  ws.addEventListener('close', rejectPending);
  ws.addEventListener('message', event => {
    try {
      if (typeof event.data !== 'string' || event.data.length > 262144
          || event.data.toLowerCase().includes(key)) throw new Error('unsafe packet');
      const packet = JSON.parse(event.data);
      if (packet.type === 'welcome') welcome = packet.data;
      if (packet.type === 'owned') { owned = packet.data?.products; ownedMessages++; }
      if (packet.type === 'ack' && packet.request === 1 && pending) {
        const current = pending; pending = undefined; clearTimeout(current.timer); current.resolve(packet);
      }
    } catch {
      protocolFailure = true; rejectPending();
    }
  });
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('hosted Ritkaos connection deadline')), 5000);
      ws.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
      ws.addEventListener('error', () => { clearTimeout(timer); reject(new Error('hosted Ritkaos connection failed')); }, { once: true });
      ws.addEventListener('close', () => { clearTimeout(timer); reject(new Error('hosted Ritkaos closed before connecting')); }, { once: true });
    });
    ws.send(JSON.stringify({ type: 'hello', data: { lang: 'en', codes: [] } }));
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline && (!welcome || ownedMessages === 0) && !protocolFailure)
      await new Promise(resolve => setTimeout(resolve, 25));
    assert.ok(!protocolFailure && welcome?.licenseEnvironment === 'test' && ownedMessages > 0
      && Array.isArray(owned) && owned.length === 0, 'a fresh test connection must start without ownership');
    const beforeRedeem = ownedMessages;
    const rejected = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending = undefined; reject(new Error('hosted Ritkaos request deadline')); }, 7000);
      pending = { resolve, reject, timer };
      ws.send(JSON.stringify({ type: 'redeem', data: { code: key }, request: 1 }));
    });
    assert.ok(!protocolFailure && rejected.ok === false, 'hosted Ritkaos must refuse the disabled key');
    assert.ok(ownedMessages > beforeRedeem && Array.isArray(owned) && owned.length === 0,
      'hosted Ritkaos must explicitly report no ownership after refusing the key');
  } finally {
    rejectPending();
    if (ws.readyState !== WebSocket.CLOSED) {
      const closed = new Promise(resolve => {
        const timer = setTimeout(() => resolve(false), 2000);
        ws.addEventListener('close', () => { clearTimeout(timer); resolve(true); }, { once: true });
      });
      try { ws.close(); } catch { /* An in-flight connection may already be closing. */ }
      assert.ok(await closed || ws.readyState === WebSocket.CLOSED, 'owned test socket cleanup must complete');
    }
  }
});
