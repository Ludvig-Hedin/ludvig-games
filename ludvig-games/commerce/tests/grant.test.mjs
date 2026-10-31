import test from 'node:test';
import assert from 'node:assert/strict';
import { createGrantSigner, verifyGrant, readGrantRequest, GRANT_LIMITS, GRANT_ISSUER } from '../grant.mjs';

// These keys are generated in memory for this run only and never written or printed.
const pair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
const privateJwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
const publicJwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
const NOW = 1800000000000;
const AUDIENCE = '00000000-0000-4000-8000-000000000001';
const CHALLENGE = '00000000-0000-4000-8000-000000000002';
const OTHER = '00000000-0000-4000-8000-000000000003';
const KEY = '00000000-0000-4000-8000-000000000004';
const options = () => ({ publicKeys: { 'games-v1': publicJwk }, environment: 'test', storeId: '504842',
  audience: AUDIENCE, challenge: CHALLENGE, now: () => NOW });
const signer = changes => createGrantSigner({ privateJwk, kid: 'games-v1', environment: 'test',
  storeId: '504842', now: () => NOW, ...changes });
const input = () => ({ entitlements: ['ritkaos', 'pigeon', 'karts'], audience: AUDIENCE, challenge: CHALLENGE });
const rejected = promise => assert.rejects(promise, error => error.code === 'invalid-grant' && error.status === 422);
const encode = value => Buffer.from(value).toString('base64url');
async function trustedToken(payload) {
  const encoded = encode(JSON.stringify(payload));
  const signature = await crypto.subtle.sign('Ed25519', pair.privateKey, new TextEncoder().encode(encoded));
  return `${encoded}.${encode(new Uint8Array(signature))}`;
}

test('valid proof contains only scoped Ritkaos entitlement and verifies with the pinned public key', async () => {
  const sign = signer();
  assert.equal(await sign.ready(), true);
  const token = await sign(input());
  const payload = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString());
  assert.deepEqual(payload, { v: 1, iss: GRANT_ISSUER, kid: 'games-v1', environment: 'test', storeId: '504842',
    game: 'ritkaos', entitlements: ['ritkaos'], audience: AUDIENCE, challenge: CHALLENGE,
    issuedAt: NOW, expiresAt: NOW + GRANT_LIMITS.lifetimeMs });
  assert.deepEqual(await verifyGrant(token, options()), { entitlements: ['ritkaos'], expiresAt: NOW + 60000 });
  assert.equal(JSON.stringify(payload).includes(KEY), false);
});

test('proof cannot cross connection, audience, environment, store or trusted key set', async () => {
  const token = await signer()(input());
  for (const change of [{ audience: OTHER }, { challenge: OTHER }, { environment: 'live' },
    { storeId: '1' }, { publicKeys: {} }, { publicKeys: { 'games-v1': privateJwk } }]) {
    await rejected(verifyGrant(token, { ...options(), ...change }));
  }
  const other = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  await rejected(verifyGrant(token, { ...options(), publicKeys: { 'games-v1': await crypto.subtle.exportKey('jwk', other.publicKey) } }));
});

test('expiry is strict and only two seconds of future issue-clock skew are accepted', async () => {
  const token = await signer()(input());
  await rejected(verifyGrant(token, { ...options(), now: () => NOW + 60000 }));
  await rejected(verifyGrant(token, { ...options(), now: () => NOW - 2001 }));
  assert.equal((await verifyGrant(token, { ...options(), now: () => NOW - 2000 })).expiresAt, NOW + 60000);
  const payload = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString());
  for (const change of [{ expiresAt: NOW + 60001 }, { expiresAt: NOW }, { issuedAt: -1 },
    { issuedAt: NOW + 2001, expiresAt: NOW + 60000 }, { issuedAt: 1.5 }]) {
    await rejected(verifyGrant(await trustedToken({ ...payload, ...change }), options()));
  }
});

test('tampering, extra claims, noncanonical tokens and malformed signatures fail closed', async () => {
  const token = await signer()(input()), [body, signature] = token.split('.');
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
  const changed = encode(JSON.stringify({ ...payload, challenge: OTHER })) + '.' + signature;
  await rejected(verifyGrant(changed, { ...options(), challenge: OTHER }));
  for (const change of [{ v: 2 }, { iss: 'https://evil.example' }, { game: 'pigeon' },
    { entitlements: ['ritkaos', 'pigeon'] }, { email: 'must-not-be-signed@example.com' }, { license_key: KEY }]) {
    await rejected(verifyGrant(await trustedToken({ ...payload, ...change }), options()));
  }
  for (const bad of ['', 'x'.repeat(2049), `${body}.${signature}.extra`, `${body}=.${signature}`,
    `${body}.AAAA`, `!.${signature}`, `${encode('null')}.${signature}`, `${encode(JSON.stringify(payload, null, 2))}.${signature}`]) {
    await rejected(verifyGrant(bad, options()));
  }
});

test('missing signer configuration and non-Ritkaos or malformed signing inputs cannot issue a proof', async () => {
  for (const change of [{ privateJwk: undefined }, { kid: '' }, { environment: '' }, { storeId: '' }]) {
    assert.throws(() => signer(change), error => error.code === 'grant-unavailable');
  }
  const sign = signer();
  for (const change of [{ entitlements: ['pigeon'] }, { entitlements: ['ritkaos', 'unknown'] },
    { audience: 'not-a-connection' }, { challenge: '' }]) await rejected(sign({ ...input(), ...change }));
});

test('signing stays bounded even when the provider licence result is cached', async () => {
  let time = NOW;
  const sign = signer({ now: () => time });
  for (let index = 0; index < GRANT_LIMITS.signaturesPerMinute; index++) await sign(input());
  await assert.rejects(sign(input()), error => error.code === 'rate-limited' && error.status === 429);
  time += 60000;
  assert.equal(typeof await sign(input()), 'string');
});

test('grant HTTP input has one exact bounded shape and accepts no entitlement claims', async () => {
  const request = (value, type = 'application/json', headers = {}) => new Request('https://service.invalid/api/licenses/grant', {
    method: 'POST', headers: { 'Content-Type': type, ...headers }, body: typeof value === 'string' ? value : JSON.stringify(value),
  });
  const body = { key: KEY, audience: AUDIENCE, challenge: CHALLENGE };
  assert.deepEqual(await readGrantRequest(request(body)), body);
  for (const value of [{ ...body, entitlements: ['ritkaos'] }, { ...body, audience: 'bad' },
    { ...body, key: '' }, [], 'null', '{']) {
    await assert.rejects(readGrantRequest(request(value)), error => error.code === 'bad-request');
  }
  await assert.rejects(readGrantRequest(request(body, 'text/html')), error => error.status === 415);
  await assert.rejects(readGrantRequest(request('x'.repeat(513))), error => error.status === 413);
  await assert.rejects(readGrantRequest(request(body, 'application/json', { 'Content-Length': '513' })), error => error.status === 413);
});
