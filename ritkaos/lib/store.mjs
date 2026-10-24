// Ritkaos+ catalogue and unlock codes. The game is always free; these are optional extras.
// Codes look like RK-XXXX-XXXX-XXXX: 60 bits of Crockford base32 holding a version, a product bitmask,
// a random nonce and a truncated HMAC-SHA256 made with a server secret. Web Crypto only, so the same
// code runs in Cloudflare Workers and Node 22. Without a secret every code is rejected (fail closed).
export const PRODUCTS = [
  { id: 'plus', kind: 'bundle', price: 79 },
  { id: 'nineties', kind: 'pack', price: 25 }, { id: 'office', kind: 'pack', price: 25 },
  { id: 'holidays', kind: 'pack', price: 19 }, { id: 'food', kind: 'pack', price: 19 },
  { id: 'internet', kind: 'pack', price: 29 },
  { id: 'blind', kind: 'mode', price: 19 }, { id: 'speed', kind: 'mode', price: 19 }, { id: 'telephone', kind: 'mode', price: 29 },
  { id: 'cosmetics', kind: 'cosmetic', price: 29 },
];
// Bit order is part of every code ever sold. Only ever append; never reorder or remove.
const BITS = ['plus', 'nineties', 'office', 'holidays', 'food', 'internet', 'blind', 'speed', 'telephone', 'cosmetics'];
export const PRODUCT_IDS = PRODUCTS.map(p => p.id);
export const PAID_PACKS = PRODUCTS.filter(p => p.kind === 'pack').map(p => p.id);
export const PAID_MODES = PRODUCTS.filter(p => p.kind === 'mode').map(p => p.id);
export const BRUSHES = ['marker', 'crayon', 'neon'];
const VERSION = 1n, ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ', MAC_BITS = 34n, NONCE_BITS = 14n, MASK_BITS = 10n;
const encoder = new TextEncoder();
/** A secret shorter than 16 characters counts as missing. */
export const validSecret = s => typeof s === 'string' && s.length >= 16 ? s : '';
/** Only https checkout links are offered to players. */
export const validCheckout = u => typeof u === 'string' && /^https:\/\/[^\s"'<>]+$/i.test(u.trim()) ? u.trim() : '';
/** Everything owned, with Ritkaos+ expanded to every product. */
export const expand = owned => owned.has('plus') ? [...PRODUCT_IDS] : PRODUCT_IDS.filter(id => owned.has(id));
export const owns = (owned, id) => owned.has(id) || owned.has('plus');

/** Uppercases, drops dashes and spaces, reads O as 0 and I/L as 1, and strips the RK prefix. */
export function normalizeCode(code) {
  if (typeof code !== 'string' || code.length > 40) return '';
  let s = code.toUpperCase().replace(/[^0-9A-Z]/g, '');
  if (s.length === 14 && s.startsWith('RK')) s = s.slice(2);
  s = s.replace(/O/g, '0').replace(/[IL]/g, '1');
  return s.length === 12 && [...s].every(c => ALPHABET.includes(c)) ? s : '';
}
const format = s => `RK-${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}`;
const toBase32 = n => Array.from({ length: 12 }, (_, i) => ALPHABET[Number((n >> BigInt(5 * (11 - i))) & 31n)]).join('');
const fromBase32 = s => [...s].reduce((n, c) => (n << 5n) | BigInt(ALPHABET.indexOf(c)), 0n);
const keys = new Map();
function key(secret) {
  if (!keys.has(secret)) keys.set(secret, crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']));
  return keys.get(secret);
}
async function mac(secret, header) {
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await key(secret), encoder.encode(`ritkaos-unlock:${header.toString(16)}`)));
  const top = sig.slice(0, 5).reduce((n, b) => (n << 8n) | BigInt(b), 0n);
  return top >> (40n - MAC_BITS);
}
/** Makes a code for one or more product ids. Used by scripts/mint-code.mjs and tests. */
export async function mintCode(secret, products, nonce) {
  if (!validSecret(secret)) throw new Error('RITKAOS_UNLOCK_SECRET is missing or shorter than 16 characters.');
  const list = [...new Set(products)];
  if (!list.length || list.some(id => !BITS.includes(id))) throw new Error(`Unknown product. Use: ${BITS.join(', ')}`);
  const mask = list.reduce((m, id) => m | (1n << BigInt(BITS.indexOf(id))), 0n);
  const n = BigInt(nonce ?? crypto.getRandomValues(new Uint16Array(1))[0]) & ((1n << NONCE_BITS) - 1n);
  const header = (VERSION << (MASK_BITS + NONCE_BITS)) | (mask << NONCE_BITS) | n;
  return format(toBase32((header << MAC_BITS) | await mac(secret, header)));
}
/** Returns the product ids in a valid code, or null. Never throws. */
export async function verifyCode(secret, code) {
  try {
    const s = normalizeCode(code); if (!validSecret(secret) || !s) return null;
    const n = fromBase32(s), header = n >> MAC_BITS, given = n & ((1n << MAC_BITS) - 1n);
    if (header >> (MASK_BITS + NONCE_BITS) !== VERSION) return null;
    const mask = (header >> NONCE_BITS) & ((1n << MASK_BITS) - 1n);
    if (!mask || given !== await mac(secret, header)) return null;
    return BITS.filter((_, i) => mask & (1n << BigInt(i)));
  } catch { return null; }
}
/** What /api/store sends to the browser: prices, whether codes work, and the checkout link if any. */
export const storeInfo = ({ secret, checkout }) => ({ ready: !!validSecret(secret), checkout: validCheckout(checkout), products: PRODUCTS });
