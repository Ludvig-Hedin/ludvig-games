/** Test-only native Lemon Squeezy validation. No merchant secret or customer data is returned. */
export const OFFERS = Object.freeze([
  { id: 'ritkaos', name: 'Ritkaos+', price: 59, entitlements: ['ritkaos'] },
  { id: 'pigeon', name: 'Pigeon style pack', price: 39, entitlements: ['pigeon'] },
  { id: 'karts', name: 'Karts style pack', price: 39, entitlements: ['karts'] },
  { id: 'bundle', name: 'Ludvig Games extras bundle', price: 99, entitlements: ['ritkaos', 'pigeon', 'karts'] },
]);
export const RECOVERY_URL = 'https://app.lemonsqueezy.com/my-orders';
export const PROVIDER_URL = 'https://api.lemonsqueezy.com/v1/licenses/validate';
export const LIMITS = Object.freeze({ inputBytes: 256, responseBytes: 16384, timeoutMs: 5000, cacheMs: 30000, cacheEntries: 256, inFlight: 8, outboundPerMinute: 20 });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const positiveId = value => /^(?:[1-9][0-9]{0,15})$/.test(String(value ?? '')) ? String(value) : '';

export function normalizeLicense(value) {
  return typeof value === 'string' && value.length <= 80 && UUID.test(value.trim()) ? value.trim().toLowerCase() : '';
}

function checkoutUrl(value) {
  try {
    if (typeof value !== 'string' || value.length > 2048) return '';
    const url = new URL(value);
    if (url.protocol !== 'https:' || !url.hostname.endsWith('.lemonsqueezy.com') || url.username || url.password || url.port || url.hash) return '';
    const path = /^\/(?:checkout\/)?buy\/([^/]+)$/.exec(url.pathname);
    if (!path || !UUID.test(path[1])) return '';
    if ([...url.searchParams.keys()].some(k => !['test', 'embed', 'media', 'logo'].includes(k))) return '';
    if (url.searchParams.has('test') && url.searchParams.get('test') !== '1') return '';
    if (['embed', 'media', 'logo'].some(k => url.searchParams.has(k) && !['0', '1'].includes(url.searchParams.get(k)))) return '';
    return url.href;
  } catch { return ''; }
}

/** Configuration must come from inspected test products. A declaration cannot prove provider mode. */
export function normalizeConfiguration({ storeId, environment, products } = {}) {
  if (environment !== 'test' || !positiveId(storeId) || !products || typeof products !== 'object' || Array.isArray(products)) return null;
  if (Object.keys(products).length !== OFFERS.length) return null;
  const pairs = new Set(), productIds = new Set(), checkoutPaths = new Set();
  const normalized = {};
  for (const offer of OFFERS) {
    const product = products[offer.id];
    const productId = positiveId(product?.productId), variantId = positiveId(product?.variantId);
    const checkout = checkoutUrl(product?.checkout);
    if (!productId || !variantId || !checkout || product.testMode !== true || pairs.has(`${productId}:${variantId}`) || productIds.has(productId)) return null;
    const checkoutPath = new URL(checkout).origin + new URL(checkout).pathname;
    if (checkoutPaths.has(checkoutPath)) return null;
    pairs.add(`${productId}:${variantId}`);
    productIds.add(productId); checkoutPaths.add(checkoutPath);
    normalized[offer.id] = { productId, variantId, checkout };
  }
  return { storeId: positiveId(storeId), environment: 'test', products: normalized };
}

export function configurationFromEnv(env = {}) {
  let products;
  try { products = JSON.parse(env.LS_TEST_PRODUCTS || 'null'); } catch { products = null; }
  return { storeId: env.LS_STORE_ID, environment: env.TEST_MODE === 'true' ? 'test' : '', products };
}

export class LicenseError extends Error {
  constructor(code, status = 503) { super(code); this.name = 'LicenseError'; this.code = code; this.status = status; }
}

export async function readLimitedBody(body, maxBytes, signal) {
  if (!body) throw new LicenseError('bad-request', 400);
  const reader = body.getReader();
  const parts = [];
  let size = 0;
  try {
    while (true) {
      if (signal?.aborted) throw new LicenseError('temporarily-unavailable');
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw new LicenseError('too-large', 413); }
      parts.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.byteLength; }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

async function hashKey(key) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key));
  return [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, '0')).join('');
}

export function createLicenseResolver({ storeId, environment, products, fetchImpl = fetch, now = Date.now, takeBudget, limits = {} } = {}) {
  const config = normalizeConfiguration({ storeId, environment, products });
  const settings = { ...LIMITS, ...limits };
  const cache = new Map(), inFlight = new Map();
  let windowStart = now(), spent = 0;
  const reserve = takeBudget || (() => {
    const time = now();
    if (time - windowStart >= 60000 || time < windowStart) { windowStart = time; spent = 0; }
    if (spent >= settings.outboundPerMinute) return false;
    spent++; return true;
  });

  function catalog() {
    return {
      environment: 'test', ready: !!config, recoveryUrl: RECOVERY_URL,
      products: OFFERS.map(({ id, name, price }) => ({ id, name, price, currency: 'SEK', checkout: config?.products[id].checkout || '' })),
    };
  }

  async function verify(key) {
    if (!await reserve()) throw new LicenseError('rate-limited', 429);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), settings.timeoutMs);
    try {
      const response = await fetchImpl(PROVIDER_URL, {
        method: 'POST', redirect: 'error', signal: controller.signal,
        headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ license_key: key }),
      });
      if (response.status === 429) throw new LicenseError('rate-limited', 429);
      if (response.status >= 500) throw new LicenseError('temporarily-unavailable');
      if (!response.ok) throw new LicenseError('invalid-license', 422);
      if (!/^application\/json\b/i.test(response.headers.get('content-type') || '')) throw new LicenseError('temporarily-unavailable');
      let data;
      try { data = JSON.parse(await readLimitedBody(response.body, settings.responseBytes, controller.signal)); }
      catch { throw new LicenseError('temporarily-unavailable'); }
      const license = data?.license_key, meta = data?.meta;
      // Inactive means valid with zero activations, not an invalid purchase. No device limit is imposed.
      if (data.valid !== true || !['active', 'inactive'].includes(license?.status) || normalizeLicense(license?.key) !== key) throw new LicenseError('invalid-license', 422);
      if (license.expires_at !== null && license.expires_at !== undefined && (!Number.isFinite(Date.parse(license.expires_at)) || Date.parse(license.expires_at) <= now())) throw new LicenseError('invalid-license', 422);
      if (positiveId(meta?.store_id) !== config.storeId) throw new LicenseError('invalid-license', 422);
      const offer = OFFERS.find(item => config.products[item.id].productId === positiveId(meta?.product_id) && config.products[item.id].variantId === positiveId(meta?.variant_id));
      if (!offer) throw new LicenseError('invalid-license', 422);
      return { ok: true, entitlements: [...offer.entitlements], environment: 'test' };
    } catch (error) {
      if (error instanceof LicenseError) throw error;
      throw new LicenseError('temporarily-unavailable');
    } finally { clearTimeout(timeout); }
  }

  async function resolve(value) {
    if (!config) throw new LicenseError('store-unavailable');
    const key = normalizeLicense(value);
    if (!key) throw new LicenseError('invalid-license', 422);
    const hashed = await hashKey(key), time = now();
    const hit = cache.get(hashed);
    if (hit && time < hit.expires) return { ...hit.result, entitlements: [...hit.result.entitlements] };
    if (hit) cache.delete(hashed);
    if (inFlight.has(hashed)) return inFlight.get(hashed).then(result => ({ ...result, entitlements: [...result.entitlements] }));
    if (inFlight.size >= settings.inFlight) throw new LicenseError('rate-limited', 429);
    const task = verify(key).then(result => {
      for (const [id, entry] of cache) if (entry.expires <= now()) cache.delete(id);
      while (cache.size >= settings.cacheEntries) cache.delete(cache.keys().next().value);
      cache.set(hashed, { result, expires: now() + settings.cacheMs });
      return result;
    }).finally(() => inFlight.delete(hashed));
    inFlight.set(hashed, task);
    return task.then(result => ({ ...result, entitlements: [...result.entitlements] }));
  }
  return { resolve, catalog };
}
