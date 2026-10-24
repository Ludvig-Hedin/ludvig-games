/**
 * Cloudflare host for Ritkaos. One Durable Object keeps every room, like the single Node process in server.mjs.
 * Workers Free: the Lobby hibernates. Sockets use ctx.acceptWebSocket, "ping" is answered by the runtime without
 * waking it, and the 250 ms game tick only runs while a room has a running timer. When nothing is pending the
 * Lobby saves its rooms to storage and may sleep; on wake it restores them and rebinds the live sockets.
 */
import { DurableObject } from 'cloudflare:workers';
import { Game } from '../lib/game.mjs';
import { networkKey, setSalt } from '../lib/network.mjs';
import { t } from '../lib/i18n.mjs';
import { storeInfo } from '../lib/store.mjs';
import { snapshot, restore, isEmpty } from '../lib/snapshot.mjs';

const MAX_PEERS = 250;
const CLIENT_IP = 'X-Ritkaos-Client-IP';
const TICK_MS = 250, QUIET_MS = 2000, CHUNK = 100000;
const ROOM_TYPES = new Set(['create', 'join', 'quick']);
const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});
const text = (body, status) => new Response(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

export default {
  async fetch(request, env) {
    const url = new URL(request.url), { pathname } = url;
    if (pathname === '/health') return json({ ok: true, game: 'ritkaos' });
    // Ritkaos+: prices, whether codes work, and the checkout link (if CHECKOUT_URL is set). Never the secret.
    if (pathname === '/api/store') return json(storeInfo({ secret: env.RITKAOS_UNLOCK_SECRET, checkout: env.CHECKOUT_URL }));
    if (pathname === '/ws' || pathname === '/api/rooms') {
      // Everything that can be refused is refused here, before the Lobby wakes.
      if (pathname === '/ws') {
        if (request.headers.get('Upgrade') !== 'websocket') return text('Service Unavailable', 503);
        // Same-origin browser clients only. Non-browser clients remain subject to all game validation.
        const origin = request.headers.get('Origin');
        if (origin) {
          try { if (new URL(origin).host !== url.host) return text('Forbidden', 403); }
          catch { return text('Bad Request', 400); }
        }
      }
      const ip = request.headers.get('CF-Connecting-IP') || '';
      if (ip && env.CONNECT_LIMIT && !(await env.CONNECT_LIMIT.limit({ key: ip })).success) return text('Too Many Requests', 429);
      // Hand the visitor's address to the Lobby, overwriting anything the client sent. The Lobby only keeps a salted hash.
      const headers = new Headers(request.headers);
      headers.set(CLIENT_IP, ip);
      return env.LOBBY.get(env.LOBBY.idFromName('main')).fetch(new Request(request, { headers }));
    }
    return text('Finns inte. Öppna spelets startsida.', 404);
  },
};

export class Lobby extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.game = new Game({ secret: env.RITKAOS_UNLOCK_SECRET });
    this.peers = new Map(); // WebSocket -> peer adapter used by Game.
    this.tickTimer = null; this.quietTimer = null; this.dirty = false; this.chunks = 0;
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    ctx.blockConcurrencyWhile(async () => {
      let salt = await ctx.storage.get('salt');
      if (!salt) { salt = crypto.getRandomValues(new Uint8Array(16)); await ctx.storage.put('salt', salt); }
      setSalt(salt);
      this.chunks = (await ctx.storage.get('snap:n')) || 0;
      if (this.chunks) {
        const parts = await ctx.storage.get(Array.from({ length: this.chunks }, (_, i) => 'snap:' + i));
        try { restore(this.game, Array.from({ length: this.chunks }, (_, i) => parts.get('snap:' + i) || '').join('')); }
        catch { /* A broken snapshot only costs the old rooms. */ }
      }
      for (const ws of ctx.getWebSockets()) this.rebind(ws);
      this.schedule();
    });
  }

  async fetch(request) {
    const url = new URL(request.url);
    const network = networkKey(request.headers.get(CLIENT_IP));
    if (url.pathname === '/api/rooms') return json({ rooms: this.game.listRooms({ network }) });
    if (request.headers.get('Upgrade') !== 'websocket' || this.ctx.getWebSockets().length >= MAX_PEERS) return text('Service Unavailable', 503);
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ network, token: '' });
    const peer = this.peerFor(server);
    peer.timeout = setTimeout(() => { if (!peer.session) peer.close(1008); }, 10000);
    return new Response(null, { status: 101, webSocket: client });
  }

  peerFor(ws) {
    let peer = this.peers.get(ws);
    if (peer) return peer;
    peer = {
      ws, session: null, closed: false, timeout: null,
      send: data => { if (!peer.closed) try { ws.send(JSON.stringify(data)); } catch { /* Socket already gone. */ } },
      close: (code = 1000) => { if (peer.closed) return; peer.closed = true; try { ws.close(code); } catch { /* Already closed. */ } this.finish(peer); },
    };
    this.peers.set(ws, peer);
    return peer;
  }

  /** After a wake: give a live socket back its player. A player the snapshot lost gets a fresh welcome. */
  rebind(ws) {
    const peer = this.peerFor(ws), { token = '', network = null } = ws.deserializeAttachment() || {};
    if (!token) return;
    const p = this.game.sessions.get(token);
    if (p) { p.peer = peer; p.connected = true; p.disconnectedAt = 0; peer.session = p; return; }
    peer.session = this.game.connect(peer, token, { network });
    ws.serializeAttachment({ network, token: peer.session.token });
  }

  finish(peer) {
    clearTimeout(peer.timeout);
    if (!this.peers.delete(peer.ws)) return;
    if (peer.session) this.game.disconnect(peer.session, peer);
    this.touch();
  }

  async webSocketMessage(ws, data) {
    const peer = this.peerFor(ws);
    if (data === 'ping') { try { ws.send('pong'); } catch { /* Gone. */ } return; }
    let packet, session = peer.session;
    try {
      if (typeof data !== 'string' || data.length > 128 * 1024) throw new Error(t(session?.lang, 'invalid'));
      packet = JSON.parse(data);
      if (!packet || typeof packet.type !== 'string' || packet.type.length > 40) throw new Error(t(session?.lang, 'invalid'));
      if (!session) {
        if (packet.type !== 'hello') throw new Error(t(packet.data?.lang, 'helloFirst'));
        const { network = null } = ws.deserializeAttachment() || {};
        session = peer.session = this.game.connect(peer, packet.data?.token, { network, lang: packet.data?.lang }); clearTimeout(peer.timeout);
        ws.serializeAttachment({ network, token: session.token });
        this.game.unlock(session, packet.data?.codes).then(() => this.touch(), () => {}); return;
      }
      const request = packet.request;
      const ack = data => { if (Number.isSafeInteger(request)) peer.send({ type: 'ack', request, ok: true, data }); };
      const fail = e => { if (Number.isSafeInteger(request)) peer.send({ type: 'ack', request, ok: false, error: e.message || t(session?.lang, 'generic') }); };
      // Per-network limit on opening and joining rooms, on top of the per-player limits in Game.
      if (ROOM_TYPES.has(packet.type) && this.env.ROOM_LIMIT && session.network && !(await this.env.ROOM_LIMIT.limit({ key: session.network })).success) {
        fail(new Error(t(session.lang, 'slowDown'))); return;
      }
      const result = this.game.handle(session, packet.type, packet.data);
      // Code redemption is async (Web Crypto); everything else answers right away.
      if (result instanceof Promise) result.then(ack, fail).finally(() => this.touch()); else ack(result);
    } catch (e) {
      if (Number.isSafeInteger(packet?.request)) peer.send({ type: 'ack', request: packet.request, ok: false, error: e.message || t(session?.lang, 'generic') });
      else if (!session) peer.close(1008);
    } finally { this.touch(); }
  }

  webSocketClose(ws) { const peer = this.peerFor(ws); peer.closed = true; try { ws.close(); } catch { /* Already closed. */ } this.finish(peer); }
  webSocketError(ws) { const peer = this.peerFor(ws); peer.closed = true; this.finish(peer); }

  touch() { this.dirty = true; this.schedule(); }

  /** Tick only while a timer is running. When quiet, save once; with nothing pending the runtime can hibernate. */
  schedule() {
    if (this.game.needsTick()) {
      clearTimeout(this.quietTimer); this.quietTimer = null;
      if (!this.tickTimer) this.tickTimer = setTimeout(() => { this.tickTimer = null; this.dirty = true; this.game.tick(); this.schedule(); }, TICK_MS);
      return;
    }
    clearTimeout(this.tickTimer); this.tickTimer = null;
    this.game.tick(); // Lazy cleanup of empty rooms and old sessions; nothing timed is running.
    if (!this.dirty) return;
    clearTimeout(this.quietTimer);
    this.quietTimer = setTimeout(() => { this.quietTimer = null; this.save().catch(() => { this.dirty = true; }); }, QUIET_MS);
  }

  async save() {
    if (this.game.needsTick()) { this.schedule(); return; }
    this.dirty = false;
    const storage = this.ctx.storage;
    if (isEmpty(this.game)) {
      if (this.chunks) await storage.delete(['snap:n', ...Array.from({ length: this.chunks }, (_, i) => 'snap:' + i)]);
      this.chunks = 0; return;
    }
    const body = snapshot(this.game), parts = {};
    const count = Math.max(1, Math.ceil(body.length / CHUNK));
    for (let i = 0; i < count; i++) parts['snap:' + i] = body.slice(i * CHUNK, (i + 1) * CHUNK);
    parts['snap:n'] = count;
    // Storage puts accept at most 128 keys; a full server stays far below that.
    const keys = Object.keys(parts);
    for (let i = 0; i < keys.length; i += 128) await storage.put(Object.fromEntries(keys.slice(i, i + 128).map(k => [k, parts[k]])));
    if (this.chunks > count) await storage.delete(Array.from({ length: this.chunks - count }, (_, i) => 'snap:' + (count + i)));
    this.chunks = count;
  }
}
