/** Turns a client IP into an opaque network key. Raw addresses are never stored or sent anywhere. */
import { createHash, randomBytes } from 'node:crypto';
let salt = null; // Created lazily: Workers forbid random values at module scope.
/** The Cloudflare Lobby keeps one salt in storage, so network keys survive hibernation. */
export function setSalt(bytes) { salt = bytes; }
const isV4 = s => /^\d{1,3}(\.\d{1,3}){3}$/.test(s) && s.split('.').every(n => Number(n) < 256);
function expandV6(s) {
  if (!/^[0-9a-f:.]+$/.test(s) || !s.includes(':')) return null;
  let tail = [];
  const v4 = s.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (v4) {
    if (!isV4(v4[1])) return null;
    const n = v4[1].split('.').map(Number); tail = [n[0] << 8 | n[1], n[2] << 8 | n[3]];
    s = s.slice(0, -v4[1].length); if (s.endsWith(':') && !s.endsWith('::')) s = s.slice(0, -1);
  }
  const parts = s.split('::'); if (parts.length > 2) return null;
  const parse = x => x ? x.split(':').map(h => /^[0-9a-f]{1,4}$/.test(h) ? parseInt(h, 16) : NaN) : [];
  const head = parse(parts[0]), rest = parts.length === 2 ? parse(parts[1]) : [], used = head.length + rest.length + tail.length;
  if (parts.length === 1 ? used !== 8 : used > 7) return null;
  const out = [...head, ...Array(8 - used).fill(0), ...rest, ...tail];
  return out.some(Number.isNaN) ? null : out;
}
/** IPv4: the full address. IPv6: the /64 prefix. With lan=true, loopback and private ranges count as one "local" network. */
export function networkPrefix(ip, { lan = false } = {}) {
  let s = String(ip || '').trim().toLowerCase().replace(/^\[|\]$/g, '').replace(/%.*$/, '');
  if (!s) return null;
  if (!isV4(s)) {
    const h = expandV6(s); if (!h) return null;
    if (h.slice(0, 5).every(x => x === 0) && h[5] === 0xffff) s = [h[6] >> 8, h[6] & 255, h[7] >> 8, h[7] & 255].join('.');
    else {
      const local = h.slice(0, 7).every(x => x === 0) && h[7] === 1 || (h[0] & 0xfe00) === 0xfc00 || (h[0] & 0xffc0) === 0xfe80;
      return lan && local ? 'local' : 'v6:' + h.slice(0, 4).map(x => x.toString(16)).join(':');
    }
  }
  const [a, b] = s.split('.').map(Number);
  if (lan && (a === 127 || a === 10 || a === 192 && b === 168 || a === 172 && b >= 16 && b <= 31 || a === 169 && b === 254)) return 'local';
  return 'v4:' + s;
}
export function networkKey(ip, options) {
  const prefix = networkPrefix(ip, options); if (!prefix) return null;
  salt ??= randomBytes(16);
  return createHash('sha256').update(salt).update(prefix).digest('base64url').slice(0, 22);
}
