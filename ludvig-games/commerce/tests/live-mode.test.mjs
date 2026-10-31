import test from 'node:test';
import assert from 'node:assert/strict';
import { OFFERS, configurationFromEnv, createLicenseResolver, normalizeConfiguration } from '../license.mjs';

// Synthetic fixtures only. No live provider product IDs have been configured.
const KEY = '00000000-0000-4000-8000-000000000099';
function products(testMode) {
  const offset = testMode ? 100 : 500;
  return Object.fromEntries(OFFERS.map((offer, index) => [offer.id, {
    productId: String(offset + index), variantId: String(offset + 100 + index), testMode,
    checkout: `https://example.lemonsqueezy.com/checkout/buy/00000000-0000-4000-8000-${String(offset + index).padStart(12, '0')}`,
  }]));
}
function env(testMode) {
  return { TEST_MODE: String(testMode), LS_STORE_ID: '555', LS_TEST_PRODUCTS: JSON.stringify(products(true)), LS_LIVE_PRODUCTS: JSON.stringify(products(false)) };
}
const ready = value => createLicenseResolver(configurationFromEnv(value)).catalog().ready;

test('explicit mode selects only its own complete product set and reports its environment', () => {
  for (const testMode of [true, false]) {
    const resolver = createLicenseResolver(configurationFromEnv(env(testMode)));
    assert.equal(resolver.catalog().ready, true);
    assert.equal(resolver.catalog().environment, testMode ? 'test' : 'live');
    assert.equal(resolver.catalog().products[0].checkout, products(testMode).ritkaos.checkout);
  }
  for (const mode of [undefined, '', 'TRUE', '0']) assert.equal(ready({ ...env(true), TEST_MODE: mode }), false);
  assert.equal(ready({ ...env(false), LS_LIVE_PRODUCTS: undefined }), false);
  assert.equal(ready({ ...env(true), LS_TEST_PRODUCTS: undefined }), false);
  assert.equal(ready({ ...env(false), LS_LIVE_PRODUCTS: '{' }), false);
  assert.equal(ready({ ...env(false), LS_LIVE_PRODUCTS: JSON.stringify(products(true)) }), false);
});

test('mode declarations do not permit copying inspected test products, variants or checkout links into live', () => {
  for (const [field, value] of [
    ['productId', '1488399'], ['variantId', '2319096'],
    ['checkout', 'https://ludviggames.lemonsqueezy.com/buy/66dad681-02da-408d-8021-5247f823fe73'],
    ['checkout', products(false).ritkaos.checkout + '?test=1'],
  ]) {
    const configured = products(false); configured.ritkaos[field] = value;
    assert.equal(normalizeConfiguration({ storeId: '504842', environment: 'live', products: configured }), null);
  }
});

test('supplied opposite catalogue must be valid and have disjoint product, variant and checkout identifiers', () => {
  for (const testMode of [true, false]) {
    for (const field of ['productId', 'variantId', 'checkout']) {
      const selected = products(testMode), opposite = products(!testMode);
      selected.ritkaos[field] = opposite.pigeon[field];
      const config = { storeId: '555', environment: testMode ? 'test' : 'live', products: selected, oppositeProducts: opposite };
      assert.equal(normalizeConfiguration(config), null);
    }
    const configured = env(testMode);
    configured[testMode ? 'LS_LIVE_PRODUCTS' : 'LS_TEST_PRODUCTS'] = '{';
    assert.equal(ready(configured), false);
  }
});

test('live resolution accepts only exact live allowlist and never grants a test purchase', async () => {
  for (const testPurchase of [false, true]) {
    const item = products(testPurchase).bundle;
    const resolver = createLicenseResolver({ ...configurationFromEnv(env(false)), fetchImpl: async () => Response.json({
      valid: true, license_key: { key: KEY, status: 'inactive', expires_at: null },
      meta: { store_id: 555, product_id: item.productId, variant_id: item.variantId },
    }) });
    if (testPurchase) await assert.rejects(resolver.resolve(KEY), error => error.code === 'invalid-license');
    else assert.deepEqual(await resolver.resolve(KEY), { ok: true, environment: 'live', entitlements: ['ritkaos', 'pigeon', 'karts'] });
  }
});
