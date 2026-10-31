import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

// Reuse the installed Mac runtime engine. All outbound requests are mocked;
// no actual licence, private config, Cloudflare account or provider is used.
const require = createRequire(new URL('../../../desktop/package.json', import.meta.url));
const { Miniflare, NoOpLog, createFetchMock } = require('miniflare');
const directory = fileURLToPath(new URL('../', import.meta.url));
const syntheticKey = index => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;

test('actual SQLite licence DO resolves through the Worker, caches and enforces its shared provider budget', {
  timeout: 30000,
}, async () => {
  const bindings = parseEnv(await readFile(new URL('../.env.test.example', import.meta.url), 'utf8'));
  const fetchMock = createFetchMock();
  fetchMock.disableNetConnect();
  let providerCalls = 0;
  fetchMock.get('https://api.lemonsqueezy.com').intercept({
    path: '/v1/licenses/validate', method: 'POST',
  }).reply(() => {
    providerCalls++;
    // Requests below are sequential. Avoid depending on the proxy's streaming
    // body representation; the unit test separately checks the outbound form.
    const key = syntheticKey(providerCalls - 1);
    return { statusCode: 200, responseOptions: { headers: { 'Content-Type': 'application/json' } },
      data: JSON.stringify({ valid: true, error: null,
        license_key: { key, status: 'inactive', expires_at: null },
        meta: { store_id: 504842, product_id: 1488399, variant_id: 2319096,
          customer_email: 'synthetic@example.invalid', customer_name: 'Synthetic fixture' },
      }) };
  }).persist();
  const mf = new Miniflare({
    host: '127.0.0.1', port: 0, log: new NoOpLog(),
    modulesRoot: directory,
    modules: ['worker.mjs', 'license.mjs', 'http.mjs', 'grant.mjs'].map(name => ({
      type: 'ESModule', path: fileURLToPath(new URL('../' + name, import.meta.url)),
    })),
    // The installed engine is 2026-07-30. This does not establish later hosted
    // compatibility-date behavior; it exercises the real source and storage API.
    compatibilityDate: '2026-07-30',
    bindings,
    durableObjects: { LICENSES: { className: 'Licenses', useSQLite: true } },
    durableObjectsPersist: false,
    ratelimits: { LICENSE_IP_LIMIT: { namespace_id: '4201', simple: { limit: 6, period: 60 } } },
    fetchMock,
  });
  try {
    const namespace = await mf.getDurableObjectNamespace('LICENSES');
    const resolver = namespace.get(namespace.idFromName('test-license-resolver'));
    async function direct(index, expectedStatus = 200) {
      const response = await resolver.fetch('https://internal.invalid/resolve', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: syntheticKey(index) }),
      });
      const result = await response.json();
      assert.equal(response.status, expectedStatus,
        `direct DO result: ${result.error || 'ok'}; intercepted provider calls: ${providerCalls}`);
      if (expectedStatus === 200) assert.deepEqual(result, {
        ok: true, environment: 'test', entitlements: ['ritkaos', 'pigeon', 'karts'],
      });
      return result;
    }

    // This first request executes the real constructor, SQLite transaction and
    // outbound validation path. A zero-call failure narrows it before provider I/O.
    await direct(0);
    assert.equal(providerCalls, 1);
    const response = await mf.dispatchFetch('https://store.example.invalid/api/licenses/resolve', {
      method: 'POST', headers: { Origin: 'https://games.ludvighedin.com',
        'CF-Connecting-IP': '192.0.2.1', 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: syntheticKey(0) }),
    });
    const body = await response.text();
    assert.equal(response.status, 200, 'public Worker must route to the same real DO');
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), 'https://games.ludvighedin.com');
    assert.equal(body.includes(syntheticKey(0)) || body.includes('synthetic@example.invalid'), false);
    assert.deepEqual(JSON.parse(body), { ok: true, environment: 'test', entitlements: ['ritkaos', 'pigeon', 'karts'] });
    assert.equal(providerCalls, 1, 'the Worker/DO path reuses the same cached validation');

    // Distinct keys bypass cache. The global budget must persist across real DO
    // events and stop the twenty-first outbound request before it reaches fetch.
    for (let index = 1; index < 20; index++) await direct(index);
    assert.deepEqual(await direct(20, 429), { ok: false, error: 'rate-limited' });
    assert.equal(providerCalls, 20);
    const forbidden = await mf.dispatchFetch('https://store.example.invalid/api/licenses/resolve', {
      method: 'POST', headers: { Origin: 'https://untrusted.example', 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: syntheticKey(21) }),
    });
    assert.equal(forbidden.status, 403);
    assert.equal(providerCalls, 20);
  } finally {
    try { await mf.dispose(); }
    finally { await fetchMock.close(); }
  }
});
