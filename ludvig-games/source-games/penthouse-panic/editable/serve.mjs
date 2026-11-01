#!/usr/bin/env node
// Zero-dependency local server. Only the public dist/ directory is served.
import http from 'node:http';
import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { networkInterfaces } from 'node:os';
import { spawn } from 'node:child_process';

const major = Number(process.versions.node.split('.')[0]);
if (major < 20) {
  console.error('Penthouse Panic behöver Node.js 20 eller senare. Hämta en aktuell LTS-version på https://nodejs.org/');
  process.exit(1);
}
const requestedPort = process.env.PORT || '8080';
if (!/^\d+$/.test(requestedPort) || Number(requestedPort) < 1 || Number(requestedPort) > 65535) {
  console.error('PORT måste vara ett heltal mellan 1 och 65535. Standardporten är 8080.');
  process.exit(1);
}
const port = Number(requestedPort);
let root;
try { root = await realpath(fileURLToPath(new URL('./dist/', import.meta.url))); }
catch {
  console.error('Mappen dist saknas. Packa upp hela ZIP-filen och behåll mappstrukturen.');
  process.exit(1);
}
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.webmanifest': 'application/manifest+json'
};

function reply(request, response, status, message) {
  if (response.headersSent) { response.destroy(); return; }
  response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  response.end(request.method === 'HEAD' ? undefined : message + '\n');
}

function isInsidePublicDirectory(filename) {
  const relative = path.relative(root, filename);
  return relative !== '' && !relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative)
    && !relative.split(path.sep).some(segment => segment.startsWith('.'));
}

const server = http.createServer(async (request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.setHeader('Allow', 'GET, HEAD');
    reply(request, response, 405, 'Metoden stöds inte.');
    return;
  }
  let pathname;
  try { pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname); }
  catch { reply(request, response, 400, 'Ogiltig adress.'); return; }
  if (pathname.includes('\0') || pathname.includes('\\') || pathname.split('/').some(segment => segment.startsWith('.'))) {
    reply(request, response, 403, 'Åtkomst nekad.');
    return;
  }
  const relativePath = pathname.replace(/^\/+/, '') || 'index.html';
  let filename = path.resolve(root, relativePath);
  if (!isInsidePublicDirectory(filename)) { reply(request, response, 403, 'Åtkomst nekad.'); return; }
  try {
    let information = await stat(filename);
    if (information.isDirectory()) {
      filename = path.join(filename, 'index.html');
      information = await stat(filename);
    }
    // Resolve symlinks before opening, so links cannot expose files outside dist/.
    filename = await realpath(filename);
    if (!isInsidePublicDirectory(filename)) { reply(request, response, 403, 'Åtkomst nekad.'); return; }
    if (!information.isFile()) { reply(request, response, 404, 'Filen hittades inte.'); return; }
    response.writeHead(200, {
      'Content-Type': mime[path.extname(filename).toLowerCase()] || 'application/octet-stream',
      'Content-Length': information.size,
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin'
    });
    if (request.method === 'HEAD') { response.end(); return; }
    const stream = createReadStream(filename);
    stream.on('error', () => response.destroy());
    request.on('aborted', () => stream.destroy());
    stream.pipe(response);
  } catch (error) {
    reply(request, response, error.code === 'EACCES' ? 403 : 404, error.code === 'EACCES' ? 'Åtkomst nekad.' : 'Filen hittades inte.');
  }
});

server.on('error', error => {
  if (error.code === 'EADDRINUSE') console.error(`Port ${port} används redan. Stäng den andra servern eller välj en annan port med miljövariabeln PORT.`);
  else console.error(`Servern kunde inte starta: ${error.message}`);
  process.exitCode = 1;
});

server.listen(port, '0.0.0.0', () => {
  const local = `http://localhost:${port}/`;
  console.log('\nPENTHOUSE PANIC\n');
  console.log(`Spela på den här datorn: ${local}`);
  const addresses = new Set(Object.values(networkInterfaces()).flat().filter(address => address && address.family === 'IPv4' && !address.internal).map(address => address.address));
  for (const address of addresses) console.log(`Öppna på samma wifi:     http://${address}:${port}/`);
  console.log('\nBehåll det här fönstret öppet medan du spelar. Avsluta med Ctrl+C.\n');
  if (process.argv.includes('--open')) {
    const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
    const args = process.platform === 'win32' ? ['/c', 'start', '', local] : [local];
    const child = spawn(command, args, { stdio: 'ignore', windowsHide: true });
    child.on('error', () => console.log(`Öppna länken manuellt: ${local}`));
    child.unref();
  }
});

function stop() {
  server.close(() => process.exit(0));
  server.closeAllConnections();
}
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
