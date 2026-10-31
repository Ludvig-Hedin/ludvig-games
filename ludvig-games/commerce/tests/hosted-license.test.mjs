import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { normalizeLicense } from '../license.mjs';
import { verifyGrant } from '../grant.mjs';

test('hosted test Worker restores the real bundle and signs only its bound Ritkaos proof', {
  skip: !process.env.LS_TEST_LICENSE_FILE, timeout: 30000,
}, async () => {
  const privateDirectory = path.join(os.homedir(), '.config/ludvig-games-commerce');
  assert.equal(process.env.LS_TEST_LICENSE_FILE, path.join(privateDirectory, 'test-native-license.txt'));
  const key = normalizeLicense(await readFile(process.env.LS_TEST_LICENSE_FILE, 'utf8'));
  assert.ok(key, 'private test fixture is required');
  const config = JSON.parse(await readFile(path.join(privateDirectory, 'test-desktop-public.json'), 'utf8'));
  assert.equal(config.TEST_MODE, 'true');
  assert.equal(config.LS_STORE_ID, '504842');
  const base = 'https://ludvig-games-store-test.ludvighedin.workers.dev';
  const origin = 'https://games.ludvighedin.com';
  async function request(endpoint, data, expected = 200, requestOrigin = origin) {
    const response = await fetch(base + endpoint, { method: data ? 'POST' : 'GET', redirect: 'error',
      signal: AbortSignal.timeout(7000), headers: { Origin: requestOrigin, 'Content-Type': 'application/json' },
      ...(data ? { body: JSON.stringify(data) } : {}) });
    assert.equal(response.status, expected, 'hosted request must return the expected status');
    if (expected !== 200) return;
    assert.ok((response.headers.get('content-type') || '').includes('application/json'));
    const body = await response.text();
    assert.ok(body.length < 16384 && !body.includes(key), 'responses must be bounded and omit bearer keys');
    return JSON.parse(body);
  }
  const store = await request('/api/store');
  assert.equal(store.environment, 'test');
  assert.equal(store.ready, true);
  assert.equal(store.grantReady, true);
  assert.deepEqual(store.products.map(value => value.id), ['ritkaos', 'pigeon', 'karts', 'bundle']);
  await request('/api/store', undefined, 403, 'https://untrusted.example');
  const resolved = await request('/api/licenses/resolve', { key });
  assert.equal(resolved.ok, true);
  assert.equal(resolved.environment, 'test');
  assert.deepEqual(resolved.entitlements, ['ritkaos', 'pigeon', 'karts']);
  const audience = randomUUID(), challenge = randomUUID();
  const signed = await request('/api/licenses/grant', { key, audience, challenge });
  assert.equal(signed.ok, true);
  assert.equal(signed.environment, 'test');
  assert.ok(typeof signed.proof === 'string' && signed.proof.length < 2048);
  const options = { publicKeys: JSON.parse(config.LS_GRANT_PUBLIC_KEYS), environment: 'test',
    storeId: '504842', audience, challenge };
  const verified = await verifyGrant(signed.proof, options);
  assert.deepEqual(verified.entitlements, ['ritkaos']);
  await assert.rejects(verifyGrant(signed.proof, { ...options, challenge: randomUUID() }));
  await assert.rejects(verifyGrant(signed.proof, { ...options, environment: 'live' }));
  await request('/api/licenses/grant', { key, audience, challenge: 'invalid' }, 400);
});
