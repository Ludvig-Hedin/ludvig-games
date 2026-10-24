/** Multiplayer room rules, free of Cloudflare APIs so Node tests can drive them.
    A socket here is anything with send(text) and close(code, reason). The room never runs game rules and never
    relays gameplay: games talk device to device over WebRTC data channels (docs/p2p-online.md). The room keeps
    membership, host and meta, and relays the WebRTC offers, answers and ICE candidates ("sig") between peers. */

export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // No I, L, O, 0 or 1.
export const ROOM = {
  maxPeers: 16,
  // Signaling and meta frames per peer per 10 s window: 20 in a two-player room, 10 more per extra peer
  // (a full mesh needs one offer or answer plus candidates per pair). Excess is dropped; a peer that
  // sends more than abuseFactor times its allowance in one window is disconnected.
  rateBase: 10,
  ratePerPeer: 10,
  rateWindowMs: 10e3,
  abuseFactor: 3,
  // Hard cap over a longer window, so no client can trickle frames forever: normal play needs a burst of
  // signaling at the start and a few meta changes after that. Going over it closes the socket.
  longBase: 150,
  longPerPeer: 30,
  longWindowMs: 10 * 60e3,
  maxData: 4096, // bytes of JSON payload per signaling message
  maxFrame: 4096 + 160, // payload plus envelope
  maxMeta: 1024,
  // Meta changes that may cost a storage write and a lobby report, per room per window. Later changes in the
  // window still reach every player (relaying them costs nothing extra), but they are not saved or reported
  // until a later counted change, join or leave carries them along.
  metaBudget: 10,
  metaWindowMs: 10 * 60e3,
  graceMs: 8000, // a dropped peer keeps its slot this long so one reconnect is seamless
};
// Rooms report only on change (no heartbeat), so a room counts as stale after 3 h without any change.
// maxRooms caps active rooms across every game (the lobby refuses new rooms past it), so cost stays bounded.
export const LOBBY = { reserveMs: 30e3, staleMs: 3 * 60 * 60e3, pendingMs: 10e3, listLimit: 50, maxRooms: 300 };
// The exact ping frame the client sends; the Durable Object answers it without waking (auto-response).
export const PING = '{"t":"ping"}';
export const PONG = '{"t":"pong"}';
export const CLOSE = { replaced: 4000, badRequest: 4400, notFound: 4404, full: 4409, rateLimited: 4429, unavailable: 4503 };

export function makeCode(random = Math.random) {
  let code = '';
  for (let i = 0; i < 4; i++) code += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)];
  return code;
}

export function normalizeCode(value) {
  const code = String(value ?? '').trim().toUpperCase();
  return /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/.test(code) ? code : null;
}

export function clampMax(value, fallback = 8) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(ROOM.maxPeers, Math.max(2, Math.round(n)));
}

export const GAME_ID = /^[a-z0-9][a-z0-9-]{0,47}$/;

const isPlainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const utf8Length = text => new TextEncoder().encode(text).length;

function safeSend(socket, message) {
  if (!socket) return;
  try { socket.send(typeof message === 'string' ? message : JSON.stringify(message)); } catch { /* Socket already gone. */ }
}

export class Room {
  constructor() { this.reset(); }

  reset() {
    this.open = false;
    this.code = null;
    this.peers = new Map();
    this.max = 8;
    this.public = false;
    this.meta = {};
    this.seed = 0;
    this.sequence = 0;
    this.metaStart = 0;
    this.metaCount = 0;
  }

  /** True while this window's meta budget lasts (see ROOM.metaBudget). */
  spendMeta(now) {
    if (now - this.metaStart >= ROOM.metaWindowMs) { this.metaStart = now; this.metaCount = 0; }
    return ++this.metaCount <= ROOM.metaBudget;
  }

  init({ code, max, public: visible, seed }) {
    this.reset();
    Object.assign(this, { open: true, code, max: clampMax(max), public: Boolean(visible), seed: seed >>> 0 });
  }

  get host() {
    let oldest = null;
    for (const peer of this.peers.values()) if (!oldest || peer.sequence < oldest.sequence) oldest = peer;
    return oldest?.id ?? null;
  }

  info() {
    return { players: this.peers.size, max: this.max, meta: this.meta, public: this.public };
  }

  list() {
    return [...this.peers.values()].sort((a, b) => a.sequence - b.sequence).map(describe);
  }

  broadcast(message, except = null) {
    const text = JSON.stringify(message);
    for (const peer of this.peers.values()) if (peer.id !== except) safeSend(peer.socket, text);
  }

  welcome(peer) {
    safeSend(peer.socket, {
      t: 'welcome', code: this.code, self: describe(peer), peers: this.list(), host: this.host,
      seed: this.seed, meta: this.meta, max: this.max, public: this.public,
    });
  }

  /** Returns { error } or { changed }. The same id joining again takes over the old slot silently. */
  join({ id, name, socket }, now) {
    if (!this.open) return { error: 'not-found' };
    const existing = this.peers.get(id);
    if (existing) {
      const old = existing.socket;
      existing.socket = socket;
      existing.goneAt = null;
      if (old && old !== socket) try { old.close(CLOSE.replaced, 'replaced'); } catch { /* Already closed. */ }
      this.welcome(existing);
      return { changed: false };
    }
    if (this.peers.size >= this.max) return { error: 'full' };
    const peer = { id, name, joinedAt: now, sequence: this.sequence++, socket, goneAt: null, windowStart: 0, count: 0, longStart: 0, longCount: 0 };
    this.peers.set(id, peer);
    this.welcome(peer);
    this.broadcast({ t: 'join', peer: describe(peer) }, id);
    return { changed: true };
  }

  remove(id) {
    const peer = this.peers.get(id);
    if (!peer) return { changed: false, empty: !this.peers.size };
    const hostBefore = this.host;
    this.peers.delete(id);
    if (!this.peers.size) {
      // Empty rooms are forgotten, so the code can be reused later.
      this.reset();
      return { changed: true, empty: true };
    }
    this.broadcast({ t: 'leave', peer: describe(peer) });
    if (this.host !== hostBefore) this.broadcast({ t: 'host', id: this.host });
    return { changed: true, empty: false };
  }

  /** Explicit leave: the slot is freed at once. */
  leave(id, socket) {
    const peer = this.peers.get(id);
    if (!peer || peer.socket !== socket) return { changed: false, empty: !this.peers.size };
    return this.remove(id);
  }

  /** Unexpected disconnect: keep the slot for a short grace period. */
  drop(id, socket, now) {
    const peer = this.peers.get(id);
    if (!peer || peer.socket !== socket) return false;
    peer.socket = null;
    peer.goneAt = now;
    return true;
  }

  /** Remove peers whose grace period ended. */
  sweep(now) {
    let changed = false;
    for (const peer of [...this.peers.values()]) {
      if (peer.goneAt !== null && now - peer.goneAt >= ROOM.graceMs) changed = this.remove(peer.id).changed || changed;
    }
    return { changed, empty: !this.open };
  }

  nextSweep() {
    let next = Infinity;
    for (const peer of this.peers.values()) if (peer.goneAt !== null) next = Math.min(next, peer.goneAt + ROOM.graceMs);
    return next;
  }

  /** Frames allowed per peer per window; grows with the room because a mesh needs signaling per pair. */
  allowance() {
    return ROOM.rateBase + ROOM.ratePerPeer * Math.max(1, this.peers.size - 1);
  }

  /** 'ok', 'drop' (over the allowance) or 'abuse' (far over it, or over the long cap; the caller closes the socket). */
  allow(peer, now) {
    if (now - peer.windowStart >= ROOM.rateWindowMs) { peer.windowStart = now; peer.count = 0; }
    if (now - (peer.longStart || 0) >= ROOM.longWindowMs) { peer.longStart = now; peer.longCount = 0; }
    const extra = Math.max(1, this.peers.size - 1);
    if (++peer.longCount > ROOM.longBase + ROOM.longPerPeer * extra) return 'abuse';
    const count = ++peer.count, allowance = this.allowance();
    if (count <= allowance) return 'ok';
    return count > allowance * ROOM.abuseFactor ? 'abuse' : 'drop';
  }

  /** Plain data for storage, so a hibernated room can wake with the same peers, host and meta. */
  snapshot() {
    if (!this.open) return null;
    return {
      code: this.code, max: this.max, public: this.public, meta: this.meta, seed: this.seed, sequence: this.sequence,
      peers: [...this.peers.values()].map(({ id, name, joinedAt, sequence, goneAt }) => ({ id, name, joinedAt, sequence, goneAt })),
    };
  }

  /** Rebuild from snapshot(); socketFor(id) returns the peer's live socket or null. */
  restore(saved, socketFor = () => null, now = Date.now()) {
    this.reset();
    if (!saved || !saved.code) return;
    Object.assign(this, { open: true, code: saved.code, max: clampMax(saved.max), public: Boolean(saved.public), meta: isPlainObject(saved.meta) ? saved.meta : {}, seed: saved.seed >>> 0, sequence: saved.sequence | 0 });
    for (const p of saved.peers || []) {
      const socket = socketFor(p.id) || null;
      // A peer whose socket vanished while the room slept gets the normal grace period from now.
      const goneAt = socket ? null : (p.goneAt ?? now);
      this.peers.set(p.id, { id: p.id, name: p.name, joinedAt: p.joinedAt, sequence: p.sequence, socket, goneAt, windowStart: 0, count: 0, longStart: 0, longCount: 0 });
    }
  }

  /** Handle one client frame. Returns { changed, empty } when the lobby should hear about it, plus abuse: true
      when the caller should close this socket. Gameplay frames ('send', 'to') are ignored: they go peer to peer. */
  handle(id, socket, raw, now) {
    const none = { changed: false, empty: false };
    const peer = this.peers.get(id);
    if (!peer || peer.socket !== socket || typeof raw !== 'string') return none;
    if (raw === PING) { safeSend(socket, PONG); return none; }
    const verdict = this.allow(peer, now);
    if (verdict === 'abuse') return { changed: false, empty: false, abuse: true };
    if (verdict === 'drop') return none;
    if (raw.length > ROOM.maxFrame || utf8Length(raw) > ROOM.maxFrame) { safeSend(socket, { t: 'error', code: 'too-big' }); return none; }
    let message;
    try { message = JSON.parse(raw); } catch { return none; }
    if (!isPlainObject(message)) return none;
    switch (message.t) {
      case 'sig': {
        // WebRTC offer, answer or ICE candidates for one other peer.
        const target = typeof message.to === 'string' ? this.peers.get(message.to) : null;
        if (target && target.id !== id && isPlainObject(message.data)) safeSend(target.socket, { t: 'sig', from: id, data: message.data });
        return none;
      }
      case 'meta': {
        const text = isPlainObject(message.meta) ? JSON.stringify(message.meta) : null;
        if (!text || utf8Length(text) > ROOM.maxMeta) { safeSend(socket, { t: 'error', code: 'meta-too-big' }); return none; }
        if (text === JSON.stringify(this.meta)) return none; // Unchanged: nothing to tell anyone.
        this.meta = message.meta;
        this.broadcast({ t: 'meta', meta: this.meta });
        return { changed: this.spendMeta(now), empty: false };
      }
      case 'ping': // A ping with a different spelling than PING; normally auto-answered before it gets here.
        safeSend(socket, PONG);
        return none;
      case 'bye':
        return this.leave(id, socket);
      default:
        return none;
    }
  }
}

function describe(peer) {
  return { id: peer.id, name: peer.name, joinedAt: peer.joinedAt };
}

/** Quick match and room list for one game. Rooms report { players, max, meta, public } on change (no heartbeat). */
export class Lobby {
  constructor() { this.rooms = new Map(); }

  /** Plain data for storage, so quick match survives the lobby object being evicted from memory. */
  snapshot() { return [...this.rooms.values()]; }
  restore(saved) {
    this.rooms = new Map();
    for (const room of Array.isArray(saved) ? saved : []) if (room && typeof room.code === 'string') this.rooms.set(room.code, { pending: [], meta: {}, ...room });
  }

  sweep(now) {
    for (const [code, room] of this.rooms) {
      room.pending = room.pending.filter(at => now - at < LOBBY.pendingMs);
      const abandoned = room.players === 0 && !room.pending.length && now - room.createdAt >= LOBBY.reserveMs;
      if (abandoned || now - room.updatedAt >= LOBBY.staleMs) this.rooms.delete(code);
    }
  }

  reserve({ max, public: visible }, now, random = Math.random) {
    this.sweep(now);
    for (let attempt = 0; attempt < 64; attempt++) {
      const code = makeCode(random);
      if (this.rooms.has(code)) continue;
      this.rooms.set(code, { code, players: 0, max: clampMax(max), meta: {}, public: Boolean(visible), createdAt: now, updatedAt: now, pending: [] });
      return code;
    }
    return null;
  }

  /** Fullest open public room, or a new public room when allowed. */
  quick({ max, allowCreate = true }, now, random = Math.random) {
    this.sweep(now);
    let best = null;
    for (const room of this.rooms.values()) {
      if (!room.public || room.meta?.open === false) continue;
      const filled = room.players + room.pending.length;
      if (filled >= room.max) continue;
      if (!best || filled > best.filled || (filled === best.filled && room.createdAt < best.room.createdAt)) best = { room, filled };
    }
    if (best) {
      best.room.pending.push(now);
      return { code: best.room.code, created: false };
    }
    if (!allowCreate) return { error: 'rate-limited' };
    const code = this.reserve({ max, public: true }, now, random);
    if (!code) return { error: 'unavailable' };
    this.rooms.get(code).pending.push(now);
    return { code, created: true };
  }

  report(code, { players, max, meta, public: visible }, now) {
    if (!players) { this.rooms.delete(code); return; }
    const room = this.rooms.get(code) ?? { code, players: 0, createdAt: now, pending: [] };
    const joined = players - room.players;
    if (joined > 0) room.pending.splice(0, joined);
    Object.assign(room, { players, max: clampMax(max), meta: isPlainObject(meta) ? meta : {}, public: Boolean(visible), updatedAt: now });
    this.rooms.set(code, room);
  }

  /** A quick-match candidate turned out to be gone or full. */
  reject(code, reason, now) {
    const room = this.rooms.get(code);
    if (!room) return;
    if (reason === 'full') Object.assign(room, { players: room.max, pending: [], updatedAt: now });
    else this.rooms.delete(code);
  }

  list(now) {
    this.sweep(now);
    return [...this.rooms.values()]
      .filter(room => room.public && room.players > 0 && room.players < room.max && room.meta?.open !== false)
      .sort((a, b) => b.players - a.players || a.createdAt - b.createdAt)
      .slice(0, LOBBY.listLimit)
      .map(({ code, players, max, meta }) => ({ code, players, max, meta }));
  }
}

/** Every game's lobby in one place, so active rooms can be capped across the whole site (LOBBY.maxRooms).
    Counts every room the lobby knows: public and private, reserved or running. Rooms leave the count when they
    report empty, when a reservation goes unused, or after LOBBY.staleMs without any report. */
export class Registry {
  constructor() { this.games = new Map(); }

  lobby(game) {
    let lobby = this.games.get(game);
    if (!lobby) { lobby = new Lobby(); this.games.set(game, lobby); }
    return lobby;
  }

  active(now) {
    let total = 0;
    for (const [game, lobby] of this.games) {
      lobby.sweep(now);
      if (!lobby.rooms.size) this.games.delete(game);
      total += lobby.rooms.size;
    }
    return total;
  }

  full(now) { return this.active(now) >= LOBBY.maxRooms; }

  /** A code for a new room, or null when the site is at its room cap (or no code is free). */
  reserve(game, options, now, random = Math.random) {
    if (this.full(now)) return null;
    return this.lobby(game).reserve(options, now, random);
  }

  quick(game, { max, allowCreate = true }, now, random = Math.random) {
    const capped = this.full(now);
    const match = this.lobby(game).quick({ max, allowCreate: allowCreate && !capped }, now, random);
    return match.error && allowCreate && capped ? { error: 'unavailable' } : match;
  }

  report(game, code, info, now) { this.lobby(game).report(code, info, now); }
  reject(game, code, reason, now) { this.lobby(game).reject(code, reason, now); }
  list(game, now) { return this.games.has(game) ? this.lobby(game).list(now) : []; }

  snapshot() { return Object.fromEntries([...this.games].map(([game, lobby]) => [game, lobby.snapshot()])); }
  restore(saved) {
    this.games = new Map();
    if (!saved || typeof saved !== 'object') return;
    for (const [game, rooms] of Object.entries(saved)) { const lobby = new Lobby(); lobby.restore(rooms); if (lobby.rooms.size) this.games.set(game, lobby); }
  }
}
