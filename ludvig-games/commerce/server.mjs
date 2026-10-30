import http from 'node:http';
import { Readable } from 'node:stream';
import { realpath, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLicenseResolver, configurationFromEnv, LicenseError } from './license.mjs';
import { allowedOrigin, json, safeFailure, readLicenseRequest, preflight } from './http.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public');
const resolver = createLicenseResolver(configurationFromEnv(process.env));
const perIp = new Map();
const contentTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wasm': 'application/wasm' };
function admit(ip) {
  const now = Date.now();
  for (const [key, value] of perIp) if (now - value.at >= 60000) perIp.delete(key);
  let entry = perIp.get(ip);
  if (!entry) { if (perIp.size >= 64) return false; entry = { at: now, count: 0 }; perIp.set(ip, entry); }
  if (entry.count >= 6) return false;
  entry.count++; return true;
}
async function staticResponse(url, method) {
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); } catch { return new Response('Not found', { status: 404 }); }
  if (pathname.split('/').some(part => part.startsWith('.')) || pathname.includes('\0')) return new Response('Not found', { status: 404 });
  let candidate = path.resolve(root, '.' + pathname);
  try {
    if ((await stat(candidate)).isDirectory()) candidate = path.join(candidate, 'index.html');
    const actual = await realpath(candidate), realRoot = await realpath(root);
    if (!actual.startsWith(realRoot + path.sep)) return new Response('Not found', { status: 404 });
    const type = contentTypes[path.extname(actual)];
    if (!type) return new Response('Not found', { status: 404 });
    return new Response(method === 'HEAD' ? null : await readFile(actual), { headers: { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' } });
  } catch { return new Response('Not found', { status: 404 }); }
}
export const server = http.createServer(async (incoming, outgoing) => {
  let response;
  const origin = incoming.headers.origin || '';
  try {
    const url = new URL(incoming.url || '/', 'http://127.0.0.1:4322');
    if (origin && !allowedOrigin(origin, true)) response = json({ ok: false, error: 'forbidden' }, 403);
    else if (url.pathname === '/api/store' && incoming.method === 'GET') response = json(resolver.catalog(), 200, origin);
    else if (url.pathname === '/api/licenses/resolve') {
      if (!origin || !allowedOrigin(origin, true)) throw new LicenseError('forbidden', 403);
      if (incoming.method === 'OPTIONS') response = preflight(origin);
      else {
        if (incoming.method !== 'POST') throw new LicenseError('method-not-allowed', 405);
        const request = new Request(url, { method: 'POST', headers: incoming.headers, body: Readable.toWeb(incoming), duplex: 'half' });
        const key = await readLicenseRequest(request);
        if (!admit(incoming.socket.remoteAddress || 'unknown')) throw new LicenseError('rate-limited', 429);
        response = json(await resolver.resolve(key), 200, origin);
      }
    } else if (url.pathname.startsWith('/api/')) response = json({ ok: false, error: 'not-found' }, 404, origin);
    else if (['GET', 'HEAD'].includes(incoming.method)) response = await staticResponse(url, incoming.method);
    else response = json({ ok: false, error: 'method-not-allowed' }, 405);
  } catch (error) { response = safeFailure(error, allowedOrigin(origin, true) ? origin : ''); }
  outgoing.writeHead(response.status, Object.fromEntries(response.headers));
  if (incoming.method === 'HEAD' || response.status === 204) outgoing.end();
  else outgoing.end(Buffer.from(await response.arrayBuffer()));
});
server.requestTimeout = 10000;
server.headersTimeout = 10000;
const port = Number(process.env.PORT || 4322);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid local port.');
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  server.listen(port, '127.0.0.1', () => console.log(`Test commerce preview: http://127.0.0.1:${port}; configured=${resolver.catalog().ready}`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit()));
}
