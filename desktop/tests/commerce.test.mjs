import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { createDesktopCommerce, publicStoreEnvironment } from "../runtime/commerce.mjs";
import { OFFERS, configurationFromEnv, normalizeConfiguration } from "../../ludvig-games/commerce/license.mjs";

const moduleRoot = fileURLToPath(new URL("../../ludvig-games/commerce", import.meta.url));
const KEY = "00000000-0000-4000-8000-000000000099";
const fixtureKeys = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
const fixturePublicKeys = JSON.stringify({ fixture: await crypto.subtle.exportKey("jwk", fixtureKeys.publicKey) });
function environment(testMode = true) {
  const products = Object.fromEntries(OFFERS.map((offer, index) => [offer.id, {
    productId: String(700 + index), variantId: String(800 + index), testMode,
    checkout: `https://example.lemonsqueezy.com/checkout/buy/00000000-0000-4000-8000-${String(700 + index).padStart(12, "0")}`,
  }]));
  return { TEST_MODE: String(testMode), LS_STORE_ID: "555", LS_GRANT_PUBLIC_KEYS: fixturePublicKeys,
    [testMode ? "LS_TEST_PRODUCTS" : "LS_LIVE_PRODUCTS"]: JSON.stringify(products) };
}
async function request(store, { url = "/api/store", method = "GET", origin,
  host = "127.0.0.1:47800", remote = "127.0.0.1", body = "", type = "application/json" } = {}) {
  const req = Readable.from(body ? [Buffer.from(body)] : []);
  Object.assign(req, { url, method, headers: { host, "content-type": type, ...(origin ? { origin } : {}) }, socket: { remoteAddress: remote } });
  const result = {};
  const res = { writeHead(status, headers) { result.status = status; result.headers = headers; }, end(value) { result.body = value ? JSON.parse(String(value)) : null; } };
  result.handled = await store.handle(req, res, 47800);
  return result;
}
const provider = async () => Response.json({ valid: true, license_key: { key: KEY, status: "inactive", expires_at: null },
  meta: { store_id: 555, product_id: 703, variant_id: 803 } });

test("desktop catalogue and native key use the same shared entitlement resolver in each explicit mode", async () => {
  for (const testMode of [true, false]) {
    const store = await createDesktopCommerce({ moduleRoot, environment: environment(testMode), fetchImpl: provider });
    const catalogue = await request(store);
    assert.equal(catalogue.status, 200);
    assert.equal(catalogue.body.ready, true);
    assert.equal(catalogue.body.environment, testMode ? "test" : "live");
    assert.ok(normalizeConfiguration(configurationFromEnv(store.environment)), "Ritkaos receives valid mode configuration too");
    const restored = await request(store, { url: "/api/licenses/resolve", method: "POST", origin: "http://127.0.0.1:47800", body: JSON.stringify({ key: KEY }) });
    assert.equal(restored.status, 200);
    assert.deepEqual(restored.body.entitlements, ["ritkaos", "pigeon", "karts"]);
    assert.equal(JSON.stringify(restored).includes(KEY), false);
  }
});

test("desktop licence endpoints reject LAN clients, rebinding hosts, cross-origin writes and missing origin", async () => {
  let calls = 0;
  const store = await createDesktopCommerce({ moduleRoot, environment: environment(), fetchImpl: async () => { calls++; return provider(); } });
  for (const changes of [{ remote: "192.168.1.3" }, { host: "evil.example:47800" },
    { origin: "https://evil.example" }, { origin: undefined }]) {
    const result = await request(store, { url: "/api/licenses/resolve", method: "POST", origin: "http://127.0.0.1:47800", body: JSON.stringify({ key: KEY }), ...changes });
    assert.equal(result.status, 403);
  }
  assert.equal((await request(store, { remote: "192.168.1.3" })).status, 403);
  assert.equal((await request(store, { origin: "https://evil.example" })).status, 403);
  assert.equal(calls, 0);
});

test("desktop readiness accepts both Ed25519 export labels and rejects other algorithms", async () => {
  const key = JSON.parse(fixturePublicKeys).fixture;
  for (const alg of ["EdDSA", "Ed25519"]) {
    const env = { ...environment(), LS_GRANT_PUBLIC_KEYS: JSON.stringify({ fixture: { ...key, alg } }) };
    const store = await createDesktopCommerce({ moduleRoot, environment: env });
    assert.equal((await request(store)).body.ready, true);
  }
  const env = { ...environment(), LS_GRANT_PUBLIC_KEYS: JSON.stringify({ fixture: { ...key, alg: "RS256" } }) };
  const store = await createDesktopCommerce({ moduleRoot, environment: env });
  assert.equal((await request(store)).body.ready, false);
});

test("missing configuration or staged modules stays closed without breaking unrelated free routes", async () => {
  for (const root of [moduleRoot, "/missing/staged/commerce"]) {
    const store = await createDesktopCommerce({ moduleRoot: root });
    assert.equal((await request(store)).body.ready, false);
    assert.equal((await request(store, { url: "/pigeon/" })).handled, false);
    assert.equal((await request(store, { url: "/api/licenses/resolve", method: "POST", origin: "http://127.0.0.1:47800", body: JSON.stringify({ key: KEY }) })).status, 503);
    assert.equal(store.environment.TEST_MODE, undefined);
    assert.equal(store.environment.LS_LIVE_PRODUCTS, undefined);
  }
  assert.deepEqual(publicStoreEnvironment({ ...environment(), LS_API_KEY: "never-stage-this", RITKAOS_UNLOCK_SECRET: "legacy-private" }), environment());
});

test("desktop request parsing, methods and inbound budget remain bounded", async () => {
  const store = await createDesktopCommerce({ moduleRoot, environment: environment(), fetchImpl: provider });
  assert.equal((await request(store, { method: "POST" })).status, 405);
  const input = { url: "/api/licenses/resolve", method: "POST", origin: "http://127.0.0.1:47800" };
  assert.equal((await request(store, { ...input, type: "text/html", body: "{}" })).status, 415);
  assert.equal((await request(store, { ...input, body: JSON.stringify({ key: KEY, product: "bundle" }) })).status, 400);
  assert.equal((await request(store, { ...input, body: JSON.stringify({ key: "a".repeat(300) }) })).status, 413);
  for (let i = 0; i < 3; i++) assert.equal((await request(store, { ...input, body: JSON.stringify({ key: KEY }) })).status, 200);
  assert.equal((await request(store, { ...input, body: JSON.stringify({ key: KEY }) })).status, 429);
});
