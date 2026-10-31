import test from 'node:test';
import assert from 'node:assert/strict';
import { createLicenseResolver, normalizeLicense, normalizeConfiguration, configurationFromEnv, OFFERS, LicenseError } from '../license.mjs';
import { readLicenseRequest, allowedOrigin } from '../http.mjs';

const KEY = '38b1460a-5104-4067-a91d-77b872934d51';
const OTHER = '38b1460a-5104-4067-a91d-77b872934d52';
const THIRD = '38b1460a-5104-4067-a91d-77b872934d53';
function configuration() {
  return { storeId: '555', environment: 'test', products: Object.fromEntries(OFFERS.map((offer, index) => [offer.id, {
    productId: String(100 + index), variantId: String(200 + index),
    checkout: `https://example.lemonsqueezy.com/buy/00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    testMode: true,
  }])) };
}
function providerBody(overrides = {}) {
  return { valid: true, error: null, license_key: { key: KEY, status: 'active', expires_at: null },
    meta: { store_id: 555, product_id: 100, variant_id: 200, customer_name: 'Must not escape', customer_email: 'private@example.invalid' }, ...overrides };
}
const response = body => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
const rejected = (promise, code) => assert.rejects(promise, error => error instanceof LicenseError && error.code === code);

test('configuration fails closed with placeholders, missing products, mode mismatch or unsafe checkout', () => {
  assert.equal(createLicenseResolver().catalog().ready, false);
  assert.equal(createLicenseResolver({ ...configuration(), environment: 'live' }).catalog().ready, false);
  assert.equal(normalizeConfiguration({ ...configuration(), storeId: 'STORE_ID' }), null);
  const missing = configuration(); delete missing.products.karts;
  assert.equal(normalizeConfiguration(missing), null);
  for (const url of ['http://example.lemonsqueezy.com/buy/' + KEY, 'https://example.lemonsqueezy.com.evil.invalid/buy/' + KEY, 'https://example.lemonsqueezy.com/buy/' + KEY + '?redirect=evil']) {
    const config = configuration(); config.products.pigeon.checkout = url;
    assert.equal(normalizeConfiguration(config), null);
  }
  const testOnly = configuration(); testOnly.products.pigeon.testMode = false;
  assert.equal(normalizeConfiguration(testOnly), null);
  const sameProduct = configuration(); sameProduct.products.pigeon.productId = sameProduct.products.ritkaos.productId;
  assert.equal(normalizeConfiguration(sameProduct), null);
  const sameCheckout = configuration(); sameCheckout.products.pigeon.checkout = sameCheckout.products.ritkaos.checkout;
  assert.equal(normalizeConfiguration(sameCheckout), null);
  assert.equal(configurationFromEnv({ TEST_MODE: 'false' }).environment, 'live');
  const officialCheckout = configuration();
  officialCheckout.products.ritkaos.checkout = officialCheckout.products.ritkaos.checkout.replace('/buy/', '/checkout/buy/');
  assert.ok(normalizeConfiguration(officialCheckout));
});

test('valid native licence uses fixed endpoint/form, exact allowlist and returns no customer data', async () => {
  const resolver = createLicenseResolver({ ...configuration(), fetchImpl: async (url, options) => {
    assert.equal(url, 'https://api.lemonsqueezy.com/v1/licenses/validate');
    assert.equal(options.method, 'POST');
    assert.equal(options.redirect, 'error');
    assert.equal(options.body.get('license_key'), KEY);
    assert.equal(options.headers.Authorization, undefined);
    return response(providerBody());
  } });
  const result = await resolver.resolve('  ' + KEY.toUpperCase() + '  ');
  assert.deepEqual(result, { ok: true, environment: 'test', entitlements: ['ritkaos'] });
  assert.equal(JSON.stringify(result).includes('private@'), false);
  assert.equal(JSON.stringify(result).includes(KEY), false);
  assert.equal(resolver.catalog().products.length, 4);
});

test('unused inactive key is valid; bundle and each exact variant unlock only their mapped content', async () => {
  for (let index = 0; index < OFFERS.length; index++) {
    const body = providerBody(); body.license_key.status = 'inactive'; body.meta.product_id = 100 + index; body.meta.variant_id = 200 + index;
    const resolver = createLicenseResolver({ ...configuration(), fetchImpl: async () => response(body) });
    assert.deepEqual((await resolver.resolve(KEY)).entitlements, OFFERS[index].entitlements);
  }
});

test('wrong store/product/variant, disabled/expired, false valid and mismatched returned key fail closed', async () => {
  const mutations = [
    b => b.meta.store_id = 556, b => b.meta.product_id = 101, b => b.meta.variant_id = 201,
    b => b.license_key.status = 'disabled', b => b.license_key.status = 'expired',
    b => b.license_key.expires_at = '2000-01-01T00:00:00Z', b => b.license_key.expires_at = 'invalid',
    b => b.valid = false, b => b.license_key.key = OTHER,
  ];
  for (const mutate of mutations) {
    const body = providerBody(); mutate(body);
    const resolver = createLicenseResolver({ ...configuration(), fetchImpl: async () => response(body) });
    await rejected(resolver.resolve(KEY), 'invalid-license');
  }
});

test('cross-environment product IDs are rejected rather than trusting absence of test_mode', async () => {
  const body = providerBody(); body.meta.product_id = 999999; body.meta.variant_id = 888888;
  const resolver = createLicenseResolver({ ...configuration(), fetchImpl: async () => response(body) });
  await rejected(resolver.resolve(KEY), 'invalid-license');
});

test('malformed key/config never calls provider', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; return response(providerBody()); };
  await rejected(createLicenseResolver({ fetchImpl }).resolve(KEY), 'store-unavailable');
  const resolver = createLicenseResolver({ ...configuration(), fetchImpl });
  for (const key of ['', 'RK-1234-1234-1234', KEY + 'x', null, { key: KEY }]) await rejected(resolver.resolve(key), 'invalid-license');
  assert.equal(calls, 0);
  assert.equal(normalizeLicense(KEY), KEY);
});

test('provider outage, rate limit, wrong response type/JSON and oversized body return safe failures', async () => {
  const cases = [
    [async () => { throw new Error('PRIVATE provider failure'); }, 'temporarily-unavailable'],
    [async () => new Response('', { status: 503 }), 'temporarily-unavailable'],
    [async () => new Response('', { status: 429 }), 'rate-limited'],
    [async () => new Response('', { status: 422 }), 'invalid-license'],
    [async () => new Response('not json', { headers: { 'Content-Type': 'application/json' } }), 'temporarily-unavailable'],
    [async () => new Response('{}'), 'temporarily-unavailable'],
    [async () => new Response('x'.repeat(17000), { headers: { 'Content-Type': 'application/json' } }), 'temporarily-unavailable'],
  ];
  for (const [fetchImpl, code] of cases) await rejected(createLicenseResolver({ ...configuration(), fetchImpl }).resolve(KEY), code);
});

test('timeout aborts provider operation', async () => {
  const fetchImpl = async (_url, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
  await rejected(createLicenseResolver({ ...configuration(), fetchImpl, limits: { timeoutMs: 10 } }).resolve(KEY), 'temporarily-unavailable');
});

test('simultaneous duplicate validation shares one call; callers cannot mutate cached ownership', async () => {
  let complete, started, calls = 0;
  const begun = new Promise(resolve => started = resolve);
  const resolver = createLicenseResolver({ ...configuration(), fetchImpl: async () => { calls++; started(); await new Promise(resolve => complete = resolve); return response(providerBody()); } });
  const first = resolver.resolve(KEY), second = resolver.resolve(KEY);
  await begun;
  complete();
  const results = await Promise.all([first, second]);
  assert.equal(calls, 1);
  results[0].entitlements.push('karts');
  assert.deepEqual((await resolver.resolve(KEY)).entitlements, ['ritkaos']);
});

test('success cache expires and bounded LRU eviction requires another validation', async () => {
  let calls = 0, time = 1000;
  const resolver = createLicenseResolver({ ...configuration(), now: () => time, limits: { cacheEntries: 1 }, fetchImpl: async (_u, options) => {
    calls++; const body = providerBody(); body.license_key.key = options.body.get('license_key'); return response(body);
  } });
  await resolver.resolve(KEY); await resolver.resolve(KEY); assert.equal(calls, 1);
  await resolver.resolve(OTHER); await resolver.resolve(KEY); assert.equal(calls, 3);
  time += 30001; await resolver.resolve(KEY); assert.equal(calls, 4);
});

test('global outbound bound rejects new keys and resets after a minute; cache hits do not consume it', async () => {
  let time = 1000;
  const resolver = createLicenseResolver({ ...configuration(), now: () => time, limits: { outboundPerMinute: 1 }, fetchImpl: async (_u, options) => {
    const body = providerBody(); body.license_key.key = options.body.get('license_key'); return response(body);
  } });
  await resolver.resolve(KEY); await resolver.resolve(KEY);
  await rejected(resolver.resolve(OTHER), 'rate-limited');
  time += 60001; await resolver.resolve(OTHER);
});

test('global durable budget denial and in-flight concurrency bound fail without provider call', async () => {
  let calls = 0;
  await rejected(createLicenseResolver({ ...configuration(), takeBudget: async () => false, fetchImpl: async () => { calls++; return response(providerBody()); } }).resolve(KEY), 'rate-limited');
  assert.equal(calls, 0);
  let release, started;
  const begun = new Promise(resolve => started = resolve);
  const resolver = createLicenseResolver({ ...configuration(), limits: { inFlight: 1 }, fetchImpl: async () => { started(); await new Promise(r => release = r); return response(providerBody()); } });
  const first = resolver.resolve(KEY);
  await begun;
  await rejected(resolver.resolve(THIRD), 'rate-limited');
  release(); await first;
});

test('HTTP body shape/type/size and exact origin limits', async () => {
  const request = (body, type = 'application/json') => new Request('http://localhost/api/licenses/resolve', { method: 'POST', headers: { 'Content-Type': type }, body });
  assert.equal(await readLicenseRequest(request(JSON.stringify({ key: KEY }))), KEY);
  await rejected(readLicenseRequest(request(JSON.stringify({ key: KEY, product: 'bundle' }))), 'bad-request');
  await rejected(readLicenseRequest(request('x'.repeat(300))), 'too-large');
  await rejected(readLicenseRequest(request('{}', 'application/x-www-form-urlencoded')), 'json-required');
  assert.equal(allowedOrigin('https://games.ludvighedin.com'), true);
  assert.equal(allowedOrigin('https://games.ludvighedin.com.evil.invalid'), false);
  assert.equal(allowedOrigin('http://localhost:4322'), false);
  assert.equal(allowedOrigin('http://localhost:4322', true), true);
  assert.equal(allowedOrigin('http://localhost:9999', true), false);
});
