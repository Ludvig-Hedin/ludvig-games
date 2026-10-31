import { DurableObject } from 'cloudflare:workers';
import { createLicenseResolver, configurationFromEnv, LicenseError, LIMITS } from './license.mjs';
import { allowedOrigin, json, safeFailure, readLicenseRequest, preflight } from './http.mjs';
import { createGrantSigner, readGrantRequest } from './grant.mjs';

const signers = new WeakMap();
function signerFor(env) {
  if (signers.has(env)) return signers.get(env);
  let signer = null;
  try {
    if (typeof env.LS_GRANT_PRIVATE_JWK !== 'string' || env.LS_GRANT_PRIVATE_JWK.length > 4096) throw new Error();
    const config = configurationFromEnv(env);
    signer = createGrantSigner({ privateJwk: JSON.parse(env.LS_GRANT_PRIVATE_JWK), kid: env.LS_GRANT_KEY_ID,
      environment: config.environment, storeId: config.storeId });
  } catch { /* Missing/invalid operator key disables grants, not ordinary licence restoration. */ }
  signers.set(env, signer);
  return signer;
}

/** Standalone Worker on the existing games Free account. No static site/old API activation. */
export default {
  async fetch(request, env) {
    const url = new URL(request.url), origin = request.headers.get('origin') || '';
    if (origin && !allowedOrigin(origin, env.ALLOW_LOCAL_TEST_ORIGINS === 'true')) return json({ ok: false, error: 'forbidden' }, 403);
    if (url.pathname === '/api/store' && request.method === 'GET') {
      const catalog = createLicenseResolver(configurationFromEnv(env)).catalog();
      const signer = signerFor(env);
      catalog.grantReady = catalog.ready && !!env.LICENSE_IP_LIMIT && !!env.LICENSES && !!signer && await signer.ready();
      if (!env.LICENSE_IP_LIMIT || !env.LICENSES) {
        catalog.ready = false;
        for (const product of catalog.products) product.checkout = '';
      }
      return json(catalog, 200, origin);
    }
    const grant = url.pathname === '/api/licenses/grant';
    if (url.pathname !== '/api/licenses/resolve' && !grant) return json({ ok: false, error: 'not-found' }, 404, origin);
    if (!origin || !allowedOrigin(origin, env.ALLOW_LOCAL_TEST_ORIGINS === 'true')) return json({ ok: false, error: 'forbidden' }, 403);
    if (request.method === 'OPTIONS') return preflight(origin);
    if (request.method !== 'POST') return json({ ok: false, error: 'method-not-allowed' }, 405, origin);
    try {
      const config = configurationFromEnv(env);
      if (!env.LICENSE_IP_LIMIT || !env.LICENSES || !createLicenseResolver(config).catalog().ready) throw new LicenseError('store-unavailable');
      const signer = grant ? signerFor(env) : null;
      if (grant && (!signer || !await signer.ready())) throw new LicenseError('grant-unavailable');
      const input = grant ? await readGrantRequest(request) : { key: await readLicenseRequest(request) };
      const ip = request.headers.get('CF-Connecting-IP');
      if (!ip) throw new LicenseError('rate-limited', 429);
      const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip));
      const limiterKey = [...new Uint8Array(hash)].map(x => x.toString(16).padStart(2, '0')).join('');
      if (!(await env.LICENSE_IP_LIMIT.limit({ key: limiterKey })).success) throw new LicenseError('rate-limited', 429);
      const stub = env.LICENSES.get(env.LICENSES.idFromName(`${config.environment}-license-resolver`));
      const internal = new Request(`https://internal.invalid/${grant ? 'grant' : 'resolve'}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
      const result = await stub.fetch(internal);
      const body = await result.text();
      return new Response(body, { status: result.status, headers: json({}, 200, origin).headers });
    } catch (error) { return safeFailure(error, origin); }
  },
};

export class Licenses extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.environment = configurationFromEnv(env).environment;
    this.signer = signerFor(env);
    this.resolver = createLicenseResolver({ ...configurationFromEnv(env), takeBudget: () => ctx.storage.transaction(async storage => {
      const time = Date.now(), prior = await storage.get('outbound-window');
      const current = prior && time >= prior.at && time - prior.at < 60000 ? prior : { at: time, count: 0 };
      if (current.count >= LIMITS.outboundPerMinute) return false;
      await storage.put('outbound-window', { at: current.at, count: current.count + 1 });
      return true;
    }) });
  }
  async fetch(request) {
    const pathname = new URL(request.url).pathname;
    if (request.method !== 'POST' || !['/resolve', '/grant'].includes(pathname)) return json({ ok: false, error: 'not-found' }, 404);
    try {
      if (pathname === '/resolve') return json(await this.resolver.resolve(await readLicenseRequest(request)));
      if (!this.signer || !await this.signer.ready()) throw new LicenseError('grant-unavailable');
      const { key, audience, challenge } = await readGrantRequest(request);
      // The proof's entitlement comes only from the shared exact provider-product allowlist.
      const result = await this.resolver.resolve(key);
      if (!result.entitlements.includes('ritkaos')) throw new LicenseError('invalid-license', 422);
      const proof = await this.signer({ entitlements: result.entitlements, audience, challenge });
      return json({ ok: true, environment: this.environment, proof });
    }
    catch (error) { return safeFailure(error); }
  }
}
