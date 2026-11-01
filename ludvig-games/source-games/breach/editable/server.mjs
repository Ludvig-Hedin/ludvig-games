#!/usr/bin/env node
/** Static game server and optional same-origin multiplayer relay. */
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve, extname, sep } from 'node:path';
import { networkInterfaces } from 'node:os';
import { randomUUID, randomInt } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';

const BASE = dirname(fileURLToPath(import.meta.url));
const MAX_PLAYERS = 4;
const MAX_PAYLOAD = 65536;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.glb': 'model/gltf-binary', '.zip': 'application/zip' };
const cleanName = value => String(value || 'Operator').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 18) || 'Operator';
const safeSend = (ws, value) => {
  if (ws.readyState !== WebSocket.OPEN || ws.bufferedAmount > 262144) return false;
  try { ws.send(JSON.stringify(value)); return true; } catch { return false; }
};

export function createGameServer({ publicDir = resolve(BASE, 'dist'), allowedOrigins = process.env.ALLOWED_ORIGIN || '', maxRooms = 100 } = {}) {
  const root = resolve(publicDir);
  const rooms = new Map();
  const clients = new Set();
  const originAllowList = allowedOrigins.split(',').map(s => s.trim()).filter(Boolean);
  const server = http.createServer(async (req, res) => {
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, { Allow: 'GET, HEAD' }); res.end('Method not allowed'); return; }
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (pathname.includes('\0')) { res.writeHead(400); res.end('Invalid path'); return; }
      if (pathname === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(req.method === 'HEAD' ? '' : JSON.stringify({ ok: true, game: 'BREACH', rooms: rooms.size }));
        return;
      }
      const filename = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
      if (filename !== root && !filename.startsWith(root + sep)) { res.writeHead(403); res.end('Forbidden'); return; }
      const info = await stat(filename);
      if (!info.isFile()) { res.writeHead(404); res.end('Not found'); return; }
      let body = await readFile(filename);
      if (extname(filename) === '.html') {
        const html = body.toString('utf8');
        body = Buffer.from(html.replace(/<head([^>]*)>/i, '<head$1><meta name="breach-relay" content="same">'));
      }
      res.writeHead(200, {
        'Content-Type': MIME[extname(filename)] || 'application/octet-stream',
        'Content-Length': body.length,
        'Cache-Control': extname(filename) === '.html' ? 'no-cache' : 'public, max-age=3600',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'same-origin'
      });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch (error) {
      res.writeHead(error?.code === 'ENOENT' ? 404 : 400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(error?.code === 'ENOENT' ? 'Not found' : 'Invalid request');
    }
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD + 2048, perMessageDeflate: false });
  server.on('upgrade', (req, socket, head) => {
    let path;
    try { path = new URL(req.url, 'http://localhost').pathname; } catch { socket.destroy(); return; }
    if (path !== '/signal' || clients.size >= maxRooms * MAX_PLAYERS + 50) { socket.write('HTTP/1.1 404 Not Found\r\n\r\n'); socket.destroy(); return; }
    const origin = req.headers.origin;
    if (origin) {
      let allowed = originAllowList.includes(origin);
      try { allowed ||= new URL(origin).host === req.headers.host; } catch { /* Reject malformed origin. */ }
      if (!allowed) { socket.write('HTTP/1.1 403 Forbidden\r\n\r\n'); socket.destroy(); return; }
    }
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
  });

  function roster(room) { return Array.from(room.players.values(), p => ({ id: p.id, name: p.name })); }
  function announce(room, message, exclude) { for (const player of room.players.values()) if (player.id !== exclude) safeSend(player.ws, message); }
  function remove(client) {
    if (client.removed) return;
    client.removed = true;
    clients.delete(client);
    clearTimeout(client.handshakeTimer);
    const room = client.room;
    client.room = null;
    if (!room || !rooms.has(room.code)) return;
    room.players.delete(client.id);
    if (room.host === client) {
      rooms.delete(room.code);
      for (const player of room.players.values()) {
        player.room = null;
        safeSend(player.ws, { kind: 'roomClosed', reason: 'The host left the room. Create or join another room.' });
        player.ws.close(4000, 'Host left');
      }
      room.players.clear();
    } else {
      announce(room, { kind: 'left', id: client.id });
      announce(room, { kind: 'roster', peers: roster(room), hostId: room.host.id });
    }
  }
  wss.on('connection', ws => {
    const client = { ws, id: 'p-' + randomUUID(), name: 'Operator', room: null, alive: true, removed: false, window: Date.now(), count: 0, bytes: 0 };
    clients.add(client);
    client.handshakeTimer = setTimeout(() => { if (!client.room) ws.close(4001, 'Join timeout'); }, 15000);
    ws.on('pong', () => { client.alive = true; });
    ws.on('error', () => remove(client));
    ws.on('close', () => remove(client));
    ws.on('message', (raw, isBinary) => {
      if (isBinary || raw.length > MAX_PAYLOAD + 2048 || client.removed) { ws.close(1009, 'Invalid message'); return; }
      const now = Date.now();
      if (now - client.window > 1000) { client.window = now; client.count = 0; client.bytes = 0; }
      client.count++;
      client.bytes += raw.length;
      if (client.count > 160 || client.bytes > 1024 * 1024) { ws.close(1008, 'Rate limit'); return; }
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { ws.close(1007, 'Invalid JSON'); return; }
      if (!msg || typeof msg !== 'object' || Array.isArray(msg)) return;
      if (msg.kind === 'ping') { safeSend(ws, { kind: 'pong', time: typeof msg.time === 'number' ? msg.time : now }); return; }
      if (!client.room) {
        if (!['host', 'join'].includes(msg.kind)) return;
        if (msg.version !== 1) { safeSend(ws, { kind: 'error', message: 'Game versions do not match. Reload the game.' }); ws.close(4002, 'Version mismatch'); return; }
        client.name = cleanName(msg.name);
        let room;
        if (msg.kind === 'host') {
          if (rooms.size >= maxRooms) { safeSend(ws, { kind: 'error', message: 'The server is full. Try again later.' }); ws.close(4003, 'Server full'); return; }
          let code;
          do { code = String(randomInt(100000, 1000000)); } while (rooms.has(code));
          room = { code, host: client, players: new Map(), createdAt: now };
          rooms.set(code, room);
        } else {
          const code = String(msg.code || '').replace(/[\s-]/g, '');
          room = /^\d{6}$/.test(code) ? rooms.get(code) : null;
          if (!room) { safeSend(ws, { kind: 'error', message: 'Room not found. Check the code and make sure the host is still online.' }); ws.close(4004, 'Room not found'); return; }
          if (room.players.size >= MAX_PLAYERS) { safeSend(ws, { kind: 'error', message: 'This room is full (four players).' }); ws.close(4005, 'Room full'); return; }
        }
        clearTimeout(client.handshakeTimer);
        client.room = room;
        room.players.set(client.id, client);
        safeSend(ws, { kind: 'ready', id: client.id, code: room.code, isHost: room.host === client, host: { id: room.host.id, name: room.host.name }, peers: roster(room) });
        if (room.host !== client) announce(room, { kind: 'joined', peer: { id: client.id, name: client.name } }, client.id);
        announce(room, { kind: 'roster', peers: roster(room), hostId: room.host.id });
        return;
      }
      if (msg.kind !== 'data' || typeof msg.data === 'undefined') return;
      const room = client.room;
      const packet = { kind: 'data', from: client.id, data: msg.data };
      if (room.host === client) {
        if (typeof msg.target === 'string') {
          const target = room.players.get(msg.target);
          if (target && target !== client) safeSend(target.ws, packet);
        } else announce(room, packet, client.id);
      } else safeSend(room.host.ws, packet);
    });
  });
  const heartbeat = setInterval(() => {
    for (const client of clients) {
      if (!client.alive) { client.ws.terminate(); remove(client); continue; }
      client.alive = false;
      try { client.ws.ping(); } catch { remove(client); }
    }
  }, 20000);
  heartbeat.unref();
  async function close() {
    clearInterval(heartbeat);
    for (const client of clients) client.ws.terminate();
    await new Promise(done => wss.close(done));
    if (server.listening) await new Promise(done => server.close(done));
  }
  return { server, wss, rooms, clients, close };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const portFlag=process.argv.indexOf('--port');
  const hostFlag=process.argv.indexOf('--host');
  const port = Number(portFlag>=0?process.argv[portFlag+1]:(process.env.PORT || 8080));
  const host = hostFlag>=0?process.argv[hostFlag+1]:'0.0.0.0';
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer between 1 and 65535.');
  const app = createGameServer();
  app.server.listen(port, host, () => {
    console.log(`BREACH is ready: http://localhost:${port}`);
    for (const addresses of Object.values(networkInterfaces())) for (const address of addresses || []) {
      if (address.family === 'IPv4' && !address.internal) console.log(`Same Wi-Fi: http://${address.address}:${port}`);
    }
    console.log('Create a room, then share its six-digit code. Keep this terminal and the host tab open.');
  });
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await app.close(); process.exit(0); });
}
