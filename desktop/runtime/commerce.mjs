// The desktop purchase API stays on this Mac. Only licence validation reaches Lemon Squeezy.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Readable } from "node:stream";

const ENV_KEYS = ["TEST_MODE", "LS_STORE_ID", "LS_TEST_PRODUCTS", "LS_LIVE_PRODUCTS", "LS_GRANT_PUBLIC_KEYS"];
// Node omits undefined spawn env values. Empty strings would look like a supplied,
// malformed opposite-mode catalogue and reject an otherwise valid configuration.
const CLOSED_ENV = Object.freeze(Object.fromEntries(ENV_KEYS.map(key => [key, undefined])));
const loopback = value => ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(value);

/** Public product configuration only, never merchant tokens or an unlock secret. */
export function publicStoreEnvironment(value = {}) {
  return Object.fromEntries(ENV_KEYS.filter(key => typeof value[key] === "string")
    .filter(key => key !== "LS_GRANT_PUBLIC_KEYS" || publicKeys(value[key]))
    .map(key => [key, value[key]]));
}

function publicKeys(text) {
  try {
    if (typeof text !== "string" || text.length > 8192) return null;
    const keys = JSON.parse(text);
    if (!keys || typeof keys !== "object" || Array.isArray(keys) || !Object.keys(keys).length || Object.keys(keys).length > 4) return null;
    if (Object.entries(keys).some(([kid, key]) => !/^[a-zA-Z0-9_-]{1,64}$/.test(kid)
      || !key || key.kty !== "OKP" || key.crv !== "Ed25519" || !/^[a-zA-Z0-9_-]{43}$/.test(key.x || "")
      || Buffer.from(key.x, "base64url").toString("base64url") !== key.x
      || (key.alg !== undefined && key.alg !== "EdDSA")
      || Object.keys(key).some(name => !["kty", "crv", "x", "alg", "key_ops", "ext", "kid"].includes(name))
      || (key.key_ops !== undefined && (!Array.isArray(key.key_ops) || key.key_ops.some(op => op !== "verify"))))) return null;
    return keys;
  } catch { return null; }
}

function localRequest(req, port, requireOrigin) {
  if (!loopback(req.socket.remoteAddress)) return false;
  const host = req.headers.host;
  if (![ `127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}` ].includes(host)) return false;
  const origin = req.headers.origin;
  return origin ? origin === `http://${host}` : !requireOrigin;
}

/** Import staged shared modules, with an explicit source directory available to focused tests. */
export async function createDesktopCommerce({ moduleRoot, environment = {}, fetchImpl } = {}) {
  let resolver, http, limitedBody, verifyGrant;
  const supplied = publicStoreEnvironment(environment);
  try {
    const license = await import(pathToFileURL(path.join(moduleRoot, "license.mjs")).href);
    http = await import(pathToFileURL(path.join(moduleRoot, "http.mjs")).href);
    limitedBody = license.readLimitedBody;
    resolver = license.createLicenseResolver({ ...license.configurationFromEnv(supplied),
      ...(fetchImpl ? { fetchImpl } : {}) });
  } catch {
    // An older or incomplete desktop bundle keeps free games available.
  }
  try { ({ verifyGrant } = await import(pathToFileURL(path.join(moduleRoot, "grant.mjs")).href)); }
  catch { /* An unstaged verifier leaves federated paid restoration unavailable. */ }
  let trustedGrantKeys = publicKeys(supplied.LS_GRANT_PUBLIC_KEYS);
  try {
    if (!verifyGrant || !trustedGrantKeys) trustedGrantKeys = null;
    else for (const key of Object.values(trustedGrantKeys))
      await crypto.subtle.importKey("jwk", key, { name: "Ed25519" }, false, ["verify"]);
  } catch { trustedGrantKeys = null; }
  const ready = resolver?.catalog().ready === true && !!trustedGrantKeys;
  const catalogue = () => {
    const value = resolver?.catalog() || { environment: "", ready: false, products: [], recoveryUrl: "https://app.lemonsqueezy.com/my-orders" };
    if (!ready) { value.ready = false; for (const product of value.products) product.checkout = ""; }
    return value;
  };
  let windowAt = Date.now(), checks = 0;
  const admit = () => {
    const now = Date.now();
    if (now - windowAt >= 60000) { windowAt = now; checks = 0; }
    return ++checks <= 6;
  };
  const send = (res, response) => response.arrayBuffer().then(body => {
    if (res.destroyed || res.writableEnded) return;
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(body));
  });
  const fail = (res, code, status) => {
    res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" });
    res.end(JSON.stringify({ ok: false, error: code }));
  };
  return {
    // Clear inherited store values when the staged configuration is absent or invalid.
    environment: { ...CLOSED_ENV, ...(ready ? supplied : {}) },
    catalog: catalogue,
    async obtainGrant({ key, audience, challenge }) {
      const mode = catalogue().environment, keys = trustedGrantKeys;
      if (!ready || !keys || !verifyGrant || !limitedBody || !["test", "live"].includes(mode)
          || ![key, audience, challenge].every(value => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value))
          || !admit()) throw new Error("grant-unavailable");
      const endpoint = `https://ludvig-games-store${mode === "test" ? "-test" : ""}.ludvighedin.workers.dev/api/licenses/grant`;
      const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 5000);
      try {
        const response = await (fetchImpl || fetch)(endpoint, { method: "POST", redirect: "error", credentials: "omit",
          signal: controller.signal, headers: { "Content-Type": "application/json", Accept: "application/json", Origin: "https://games.ludvighedin.com" },
          body: JSON.stringify({ key, audience, challenge }) });
        if (!response.ok || !/^application\/json\b/i.test(response.headers.get("content-type") || "")) throw new Error("grant-unavailable");
        const value = JSON.parse(await limitedBody(response.body, 2048, controller.signal));
        if (value.ok !== true || value.environment !== mode || typeof value.proof !== "string" || value.proof.length > 2048) throw new Error("grant-unavailable");
        const verified = await verifyGrant(value.proof, { publicKeys: keys, environment: mode,
          storeId: supplied.LS_STORE_ID, audience, challenge });
        if (!verified?.entitlements?.includes("ritkaos")) throw new Error("grant-unavailable");
        return value.proof;
      } catch { throw new Error("grant-unavailable"); }
      finally { clearTimeout(timeout); }
    },
    async handle(req, res, port) {
      const pathname = new URL(req.url, "http://local").pathname;
      if (!["/api/store", "/api/licenses/resolve"].includes(pathname)) return false;
      if (!localRequest(req, port, pathname === "/api/licenses/resolve")) {
        fail(res, "forbidden", 403); return true;
      }
      if (pathname === "/api/store") {
        if (req.method !== "GET") { fail(res, "method-not-allowed", 405); return true; }
        const value = catalogue();
        res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" });
        res.end(JSON.stringify(value)); return true;
      }
      if (req.method !== "POST") { fail(res, "method-not-allowed", 405); return true; }
      if (!ready || !http) { fail(res, "store-unavailable", 503); return true; }
      if (!admit()) { fail(res, "rate-limited", 429); return true; }
      try {
        const request = new Request(`http://${req.headers.host}${req.url}`, {
          method: "POST", headers: req.headers, body: Readable.toWeb(req), duplex: "half",
        });
        const key = await http.readLicenseRequest(request);
        await send(res, http.json(await resolver.resolve(key)));
      } catch (error) { await send(res, http.safeFailure(error)); }
      return true;
    },
  };
}

export async function loadDesktopCommerce(bundleDir) {
  const moduleRoot = path.join(bundleDir, "hub", "commerce");
  let environment = {};
  try {
    const file = path.join(moduleRoot, "config.json");
    if (fs.statSync(file).size <= 64 * 1024) environment = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch { /* Missing public store configuration means free-only mode. */ }
  return createDesktopCommerce({ moduleRoot, environment });
}
