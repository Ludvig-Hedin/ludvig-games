import { DurableObject } from 'cloudflare:workers';
import { createLicenseResolver, configurationFromEnv, LicenseError, LIMITS } from './license.mjs';
import { allowedOrigin, json, safeFailure, readLicenseRequest, preflight } from './http.mjs';

/** Standalone test Worker on the existing games Free account. No static site/old API activation. */
export default {
  async fetch(request, env) {
    const url = new URL(request.url), origin = request.headers.get('origin') || '';
    if (origin && !allowedOrigin(origin, env.ALLOW_LOCAL_TEST_ORIGINS === 'true')) return json({ ok: false, error: 'forbidden' }, 403);
    if (url.pathname === '/api/store' && request.method === 'GET') {
      const catalog = createLicenseResolver(configurationFromEnv(env)).catalog();
      if (!env.LICENSE_IP_LIMIT || !env.LICENSES) {
        catalog.ready = false;
        for (const product of catalog.products) product.checkout = '';
      }
      return json(catalog, 200, origin);
    }
    if (url.pathname !== '/api/licenses/resolve') return json({ ok: false, error: 'not-found' }, 404, origin);
    if (!origin || !allowedOrigin(origin, env.ALLOW_LOCAL_TEST_ORIGINS === 'true')) return json({ ok: false, error: 'forbidden' }, 403);
    if (request.method === 'OPTIONS') return preflight(origin);
    if (request.method !== 'POST') return json({ ok: false, error: 'method-not-allowed' }, 405, origin);
    try {
      if (!env.LICENSE_IP_LIMIT || !env.LICENSES || env.TEST_MODE !== 'true') throw new LicenseError('store-unavailable');
      const key = await readLicenseRequest(request);
      const ip = request.headers.get('CF-Connecting-IP');
      if (!ip) throw new LicenseError('rate-limited', 429);
      const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip));
      const limiterKey = [...new Uint8Array(hash)].map(x => x.toString(16).padStart(2, '0')).join('');
      if (!(await env.LICENSE_IP_LIMIT.limit({ key: limiterKey })).success) throw new LicenseError('rate-limited', 429);
      const stub = env.LICENSES.get(env.LICENSES.idFromName('test-license-resolver'));
      const internal = new Request('https://internal.invalid/resolve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key }) });
      const result = await stub.fetch(internal);
      const body = await result.text();
      return new Response(body, { status: result.status, headers: json({}, 200, origin).headers });
    } catch (error) { return safeFailure(error, origin); }
  },
};

export class Licenses extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.resolver = createLicenseResolver({ ...configurationFromEnv(env), takeBudget: () => ctx.storage.transaction(async storage => {
      const time = Date.now(), prior = await storage.get('outbound-window');
      const current = prior && time >= prior.at && time - prior.at < 60000 ? prior : { at: time, count: 0 };
      if (current.count >= LIMITS.outboundPerMinute) return false;
      await storage.put('outbound-window', { at: current.at, count: current.count + 1 });
      return true;
    }) });
  }
  async fetch(request) {
    if (request.method !== 'POST' || new URL(request.url).pathname !== '/resolve') return json({ ok: false, error: 'not-found' }, 404);
    try { return json(await this.resolver.resolve(await readLicenseRequest(request))); }
    catch (error) { return safeFailure(error); }
  }
}
