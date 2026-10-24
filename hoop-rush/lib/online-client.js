// Browser side of an online room (24 Oct 2026, docs/p2p-online.md in the hub
// repo). Play goes device to device over WebRTC data channels: the room server
// only pairs the two seats and relays connection setup. The host (seat 0)
// runs the authoritative rules from arena-rules.ts in its browser: it times,
// simulates and scores every shot, and sends a state message whenever
// something visible changes. The guest sends shots, ready, rematch and leave.
// The public interface (createRoom, RoomLink and its callbacks) is unchanged.

import { PeerLink, CONNECT_FAILED } from './p2p.js';
import {
  ArenaError, advance, createRoom as createArena, joinRoom, leave, rematch, setReady, shoot, touch, view,
} from './arena-rules.ts';

const TICK_MS = 100;
const MIN_BROADCAST_MS = 90;

/** Test seam: Node tests replace the link and fetch. */
export const linkTransport = {
  link: (code, handlers) => new PeerLink(code, handlers),
  fetch: (url, init) => fetch(url, init),
};

const BUSY_MESSAGE = 'Online play is full right now. Try again in a little while.';

export async function createRoom(name) {
  let response;
  try {
    response = await linkTransport.fetch('/api/rooms', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
      cache: 'no-store', signal: AbortSignal.timeout(12000),
    });
  } catch { throw new Error('Could not reach the room. Check your connection.'); }
  const data = await response.json().catch(() => ({}));
  // 429, 503 or Cloudflare's 1027 daily-limit page carry no JSON: show the busy message.
  const busy = response.status === 429 || response.status === 503;
  if (!response.ok || !data.code) throw new Error(data.message || (busy ? BUSY_MESSAGE : 'Could not start a room. Try again.'));
  // The lobby view before the link opens; the host's RoomLink builds the real room.
  const { room } = await createArena(data.code, name, Date.now());
  return { room: data.code, token: data.token, seat: 0, state: view(room, Date.now(), seat => seat === 0, 6000) };
}

export class RoomLink {
  constructor({ room, token = null, name = '', onWelcome, onState, onNack, onEnd, onStatus, onOffset }) {
    Object.assign(this, { room, token, name, onWelcome, onState, onNack, onEnd, onStatus, onOffset });
    this.link = null; this.closed = false; this.welcomed = false; this.seat = 0; this.role = null;
    this.arena = null; this.loop = null; this.lastKey = ''; this.lastSent = 0; this.bestRtt = Infinity;
  }

  get serverMessages() { return this.link?.serverMessages ?? 0; }
  get isHost() { return this.role === 'host'; }
  /** Call after storing the link: callbacks may run right away. */
  start() { void this.open(); return this; }
  get isOpen() { return this.welcomed && (this.isHost || !!this.link?.open); }

  async open() {
    this.onStatus?.('connecting');
    const link = linkTransport.link(this.room, {
      onPeers: peers => this.peers(peers),
      onOpen: () => this.linkOpen(),
      // After a result there is nothing to reconnect to, so say nothing.
      onDown: () => { if (!this.isHost && !this.closed && this.last?.status !== 'finished') this.onStatus?.('reconnecting'); },
      onLost: reason => this.linkLost(reason),
      onMessage: (_kind, data) => this.message(data),
      onTerminal: message => this.finish(410, message),
    });
    this.link = link;
    let welcome;
    try { welcome = await link.start(this.token ? { t: 'hello', token: this.token } : { t: 'join', name: this.name }); }
    catch (error) { link.dispose(); this.finish(error.status || 503, error.message); return; }
    if (this.closed) { link.dispose(); return; }
    this.token = welcome.token;
    this.seat = welcome.side;
    this.session = { room: welcome.code, token: welcome.token, seat: welcome.side };
    this.role = welcome.side === 0 ? 'host' : 'guest';
    if (this.isHost) {
      const { room } = await createArena(welcome.code, welcome.seats?.[0]?.name || this.name, Date.now());
      this.arena = room;
      this.welcomed = true;
      this.onOffset?.(0);
      this.onStatus?.('open');
      this.loop = setInterval(() => this.tick(), TICK_MS);
      this.onWelcome?.(this.session, this.snapshot());
      await this.peers(this.latestPeers || welcome);
    }
    // The data channel may have opened while the room was being set up.
    if (this.link?.open) this.linkOpen();
  }

  send(message) {
    if (this.closed || !this.welcomed && !this.isHost) return false;
    if (this.isHost) { this.apply(this.seat, message); return true; }
    return !!this.link?.send('r', message);
  }

  finish(status, message) {
    if (this.closed) return;
    this.stop();
    this.onEnd?.(status, message);
  }

  stop(leaving = false) {
    if (this.closed) return;
    if (leaving) {
      if (this.isHost && this.arena) { this.apply(this.seat, { t: 'leave' }); }
      else this.link?.send('r', { t: 'leave' });
    }
    this.closed = true;
    this.onStatus?.('closed');
    clearInterval(this.loop); this.loop = null;
    const link = this.link;
    if (link) { if (leaving) link.leave(); else link.dispose(); }
  }

  // ---- seats from the room server ----

  async peers(peers) {
    if (this.closed) return;
    this.latestPeers = peers;
    if (!this.role) return;
    if (this.role === 'guest' && peers.side === 0) {
      // Host handover: the host left. The match is over for this player.
      this.markLeft(0);
      this.stop(true);
      return;
    }
    if (!this.isHost || !this.arena) return;
    const otherSeat = this.seat === 0 ? 1 : 0;
    const other = peers.seats?.[otherSeat];
    const now = Date.now();
    const inRoom = this.arena.players[otherSeat];
    if (other?.present && !other.left && (!inRoom || inRoom.left)) {
      // Hold broadcasts while the seats change, so the friend never sees a half-built room.
      this.resetting = true;
      try {
        let room = this.arena;
        if (room.status !== 'waiting') {
          // A new friend after a finished or forfeited match starts a fresh lobby.
          ({ room } = await createArena(this.room, room.players[this.seat]?.name || this.name, now));
        }
        try { await joinRoom(room, other.name, now, this.present); } catch { /* A full lobby stays as it is. */ }
        this.arena = room;
      } finally { this.resetting = false; }
    } else if (other?.left && inRoom && !inRoom.left) {
      leave(this.arena, otherSeat, now);
    }
    this.broadcast(true);
  }

  present = seat => seat === this.seat || !!this.link?.open;

  linkOpen() {
    if (this.closed || !this.role || (this.isHost && !this.arena)) return;
    if (this.isHost) { this.broadcast(true); return; }
    this.onStatus?.('open');
    for (let i = 0; i < 3; i++) setTimeout(() => this.link?.send('r', { t: 'time', c: Date.now() }), i * 120);
  }

  linkLost(reason) {
    if (this.closed) return;
    if (this.isHost) {
      const otherSeat = this.seat === 0 ? 1 : 0;
      const other = this.arena?.players[otherSeat];
      if (other && !other.left) leave(this.arena, otherSeat, Date.now());
      this.broadcast(true);
      return;
    }
    if (reason && reason !== 'left') { this.finish(503, reason || CONNECT_FAILED); return; }
    this.markLeft(0);
  }

  /** Show that the other player left, using the last state we have. */
  markLeft(seat) {
    const state = this.last;
    if (!state) { this.finish(410, 'Your friend left.'); return; }
    const players = state.players.map((p, i) => i === seat && p ? { ...p, left: true, connected: false } : p);
    this.last = { ...state, players, serverNow: state.serverNow + 1 };
    this.onState?.(this.last);
  }

  // ---- messages over the data channel ----

  message(data) {
    if (this.closed || !data || typeof data !== 'object') return;
    if (this.isHost) {
      if (data.t === 'time') { this.link.send('r', { t: 'time', c: data.c, s: Date.now() }); return; }
      if (['shot', 'ready', 'rematch', 'leave'].includes(data.t)) this.apply(this.seat === 0 ? 1 : 0, data);
      return;
    }
    if (data.t === 'state' && data.state) {
      this.last = data.state;
      if (!this.welcomed) { this.welcomed = true; this.onWelcome?.(this.session, data.state); }
      else this.onState?.(data.state);
    } else if (data.t === 'time') {
      const now = Date.now(), rtt = now - data.c;
      if (rtt >= 0 && rtt <= this.bestRtt + 30) { this.bestRtt = Math.min(this.bestRtt, rtt); this.onOffset?.(data.s - (data.c + now) / 2); }
    } else if (data.t === 'nack') {
      this.onNack?.(data);
    }
  }

  // ---- host ----

  apply(seat, data) {
    const room = this.arena;
    if (!room) return;
    const now = Date.now();
    touch(room, now, this.present);
    advance(room, now);
    try {
      if (data.t === 'shot') { if (shoot(room, seat, data, now) === 'duplicate') return; }
      else if (data.t === 'ready') setReady(room, seat, now);
      else if (data.t === 'rematch') rematch(room, seat, now);
      else if (data.t === 'leave') leave(room, seat, now);
      else return;
    } catch (error) {
      if (!(error instanceof ArenaError)) throw error;
      const nack = { t: 'nack', id: typeof data.id === 'string' ? data.id : null, action: data.t, code: error.code, message: error.message };
      if (seat === this.seat) this.onNack?.(nack); else this.link?.send('r', nack);
      return;
    }
    this.broadcast(true);
  }

  tick() {
    if (this.closed || !this.arena) return;
    const now = Date.now();
    touch(this.arena, now, this.present);
    advance(this.arena, now);
    this.broadcast(false);
  }

  snapshot() { return view(this.arena, Date.now(), this.present); }

  broadcast(force) {
    if (!this.arena || this.resetting) return;
    const now = Date.now();
    const state = view(this.arena, now, this.present);
    const key = JSON.stringify({ ...state, serverNow: 0 });
    if (key === this.lastKey && !force) return;
    if (!force && now - this.lastSent < MIN_BROADCAST_MS) return;
    this.lastKey = key;
    this.lastSent = now;
    if (this.link?.open) this.link.send('r', { t: 'state', state });
    this.last = state;
    this.onState?.(state);
  }
}
