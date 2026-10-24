import { createGame, serveGame, stepGame } from './engine.js';
import { PeerLink, CONNECT_FAILED } from './p2p.js';
import { advance, applyAction, applyInput, createRoom, joinRoom, publicRoom, rejoin, settle } from '../server/rooms.ts';

// Online play goes device to device (docs/p2p-online.md). The room server only
// pairs the seats. The host (seat 0) runs the authoritative match in the
// browser with the same rules the server used before, and sends the guest a
// snapshot about 20 times a second over the unordered channel. The guest sends
// its controls the same way, and serves and actions over the reliable channel.

const STORAGE_KEY = 'rally-club-online-session-v1';
const HOST_TICK_MS = 50;
const GUEST_SEND_MS = 50;
const KEEPALIVE_MS = 400;
const EVENTS_PER_SNAPSHOT = 6;
const ACTION_TIMEOUT_MS = 8000;
const INPUT = { x: 0, depth: 1.58, aim: 0, power: .48, spin: 'flat', swing: false, serve: false };
const copy = value => JSON.parse(JSON.stringify(value));
const now = () => performance.now();
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

/** Test seam: replace the link factory and room creation in Node tests. */
export const transport = {
  link: (code, handlers) => new PeerLink(code, handlers),
  fetch: (url, init) => fetch(url, init),
};

const BUSY_MESSAGE = 'Online play is full right now. Try again in a little while.';
function failure(message, status) { const error = new Error(message); error.status = status; return error; }

export class OnlineRoom {
  constructor({ onState = () => {}, onStatus = () => {} } = {}) {
    this.onState = onState;
    this.onStatus = onStatus;
    this.code = '';
    this.side = 0;
    this.name = '';
    this.opponentName = 'Friend';
    this.token = '';
    this.latency = 0;
    this.connected = false;
    this.status = 'waiting';
    this.detail = '';
    this.players = [null, null];
    this.rematchVotes = [false, false];
    this.snapshot = null;
    this.info = null;
    this.input = { ...INPUT };
    this.link = null;
    this._room = null;          // host only: the authoritative match
    this._seats = null;
    this._bestOf = 3;
    this._seq = 0;
    this._hostSeq = 0;
    this._actionId = 0;
    this._pending = new Map();
    this._timers = [];
    this._disposed = false;
    this._receivedAt = 0;
    this._servePending = false;
    this._swingUntil = 0;
    this._sent = '';
    this._sentAt = 0;
    this._predicted = null;
    this._rendered = null;
    this._round = 0;
    this._lastStatus = '';
    this._publishedKey = '';
    this._publishedAt = 0;
    this._pingAt = 0;
    this._lost = false;
  }

  get isHost() { return this.side === 0; }
  get serverMessages() { return this.link?.serverMessages ?? 0; }

  async create({ name = 'Player 1', bestOf = 3 } = {}) {
    this._reset();
    let response;
    try {
      response = await transport.fetch('/api/rooms', { method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, bestOf }), signal: AbortSignal.timeout(12000) });
    } catch { throw failure('Could not reach the server. Check your connection.', 503); }
    const data = await response.json().catch(() => ({}));
    // 429, 503 or Cloudflare's 1027 daily-limit page carry no JSON: show the busy message.
    const busy = response.status === 429 || response.status === 503;
    if (!response.ok || !data.token) throw failure(data.error || (busy ? BUSY_MESSAGE : 'Could not start a room. Try again.'), response.status || 503);
    return this._begin(data.code, { t: 'hello', token: data.token });
  }

  async join({ code, name = 'Player 2' } = {}) {
    this._reset();
    const normalized = String(code || '').trim().toUpperCase().replace(/[\s-]/g, '');
    if (!/^[A-HJ-NP-Z2-9]{6}$/.test(normalized)) throw failure('Enter the six-character room code.', 400);
    const saved = this._saved();
    return this._begin(normalized, saved?.code === normalized ? { t: 'hello', token: saved.token } : { t: 'join', name });
  }

  async resume(code) {
    const saved = this._saved();
    if (!saved?.code || !saved?.token || (code && saved.code !== String(code).trim().toUpperCase())) return null;
    this._reset();
    try { return await this._begin(saved.code, { t: 'hello', token: saved.token }); }
    catch (error) { if ([401, 404].includes(error.status)) this._clearSaved(saved.code); this.connected = false; throw error; }
  }

  start() { return this._action('start'); }
  rematch() { return this._action('rematch'); }

  async leave() {
    const code = this.code;
    if (!this.isHost) this.link?.send('r', { t: 'act', id: ++this._actionId, a: 'leave' });
    this._clearSaved(code);
    const link = this.link;
    this._stop();
    link?.leave();
    this.token = ''; this.code = '';
  }

  // Stop without leaving the seat (component unmount).
  dispose() { const link = this.link; this._stop(); link?.dispose(); }

  setInput(input) {
    if (!input || typeof input !== 'object') return;
    const struck = input.swing && !this.input.swing;
    if (struck) this._swingUntil = now() + 120;
    if (this.isHost) {
      this.input = { ...this.input, ...input };
      if (this._room) applyInput(this._room, 0, ++this._hostSeq, this.input, Date.now(), this._presence);
      return;
    }
    if (input.serve && !this._servePending) { this._servePending = true; this.link?.send('r', { t: 'serve' }); }
    this.input = { ...this.input, ...input, serve: false };
    if (struck) this._sendInput(true);
  }

  getRenderState(dt = 1 / 60) {
    if (this.isHost) {
      if (!this._room) return this.snapshot;
      advance(this._room, Date.now(), this._presence);
      this._publish(false);
      return this._room.state;
    }
    if (!this._predicted || !this.snapshot) return this.snapshot;
    const fresh = now() - this._receivedAt < 400;
    if (this.info?.status === 'playing' && !this.info.suspended && fresh) {
      const inputs = copy(this.info.inputs || [INPUT, INPUT]);
      inputs[this.side] = { ...this.input, swing: this.input.swing || now() < this._swingUntil, serve: false };
      stepGame(this._predicted, inputs, clamp(dt, 0, 1 / 30));
    }
    const next = this._predicted;
    if (!this._rendered) this._rendered = copy(next);
    const output = this._rendered;
    const smoothing = 1 - Math.exp(-clamp(dt, 0, .05) * 30);
    const ball = next.ball, visualBall = output.ball;
    const gap = ball && visualBall ? Math.hypot(ball.x - visualBall.x, ball.y - visualBall.y, ball.z - visualBall.z) : 9;
    const snap = output.phase !== next.phase || gap > .35 || !fresh;
    if (ball && visualBall) {
      const prior = { x: visualBall.x, y: visualBall.y, z: visualBall.z };
      Object.assign(visualBall, ball);
      if (!snap) {
        visualBall.x = prior.x + (ball.x - prior.x) * smoothing;
        visualBall.y = prior.y + (ball.y - prior.y) * smoothing;
        visualBall.z = prior.z + (ball.z - prior.z) * smoothing;
      }
    }
    if (next.paddles) output.paddles = next.paddles.map((p, i) => {
      const old = output.paddles?.[i];
      if (!old || snap) return { ...p };
      return { ...p, x: old.x + (p.x - old.x) * smoothing, y: old.y + (p.y - old.y) * smoothing, z: old.z + (p.z - old.z) * smoothing };
    });
    // Presentation may predict motion, never an official score or match outcome.
    for (const key of Object.keys(next)) if (!['ball', 'paddles', 'score', 'games', 'winner', 'lastPoint', 'events'].includes(key)) output[key] = next[key];
    for (const key of ['score', 'games', 'winner', 'lastPoint', 'events']) output[key] = this.snapshot[key];
    return output;
  }

  // ---- setup ----

  _reset() {
    this.dispose();
    this._disposed = false;
    Object.assign(this, { token: '', code: '', snapshot: null, info: null, _room: null, _seats: null, _predicted: null, _rendered: null, _seq: 0, _hostSeq: 0, _servePending: false, _round: 0, _sent: '', _lastStatus: '', _publishedKey: '', detail: '', _lost: false });
    this.input = { ...INPUT };
  }

  _stop() {
    this._disposed = true;
    this.connected = false;
    this._timers.forEach(clearInterval); this._timers = [];
    for (const item of this._pending.values()) { clearTimeout(item.timer); item.reject(failure('This room is closed.', 0)); }
    this._pending.clear();
    this.link = null;
  }

  async _begin(code, hello) {
    const link = transport.link(code, {
      onPeers: peers => this._peers(peers),
      onOpen: () => this._linkOpen(),
      onDown: () => this._linkDown(),
      onLost: reason => this._linkLost(reason),
      onMessage: (kind, data) => this._message(kind, data),
      onTerminal: message => this._terminal(message),
    });
    this.link = link;
    const welcome = await link.start(hello);
    if (this._disposed) { link.dispose(); throw failure('Room request canceled.', 0); }
    this.code = welcome.code;
    this.token = welcome.token;
    this.side = welcome.side;
    this._bestOf = Number(welcome.meta?.bestOf) || 3;
    this.name = welcome.seats?.[this.side]?.name || 'Player';
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ code: this.code, token: this.token, name: this.name })); } catch { /* This tab still works. */ }
    this._role = this.isHost ? 'host' : 'guest';
    this._peers(welcome);
    this._timers.push(setInterval(() => this._hostTick(), HOST_TICK_MS), setInterval(() => this._sendInput(false), GUEST_SEND_MS));
    return this.info;
  }

  /** Seats changed on the room server (join, leave, socket drop, host handover). */
  _peers(peers) {
    if (this._disposed) return;
    this.side = peers.side;
    this._seats = peers.seats;
    const other = peers.seats?.[this.side === 0 ? 1 : 0];
    if (this.isHost && this._role === 'guest') {
      // Host handover: the host left, so the room made this player seat 0.
      this._role = 'host';
      this._room = null;
      this.info = this.info && { ...this.info, side: 0, suspended: true };
      this._setStatus('left', `${this.players?.[0]?.name || 'Your friend'} left the match.`);
      if (!(other?.present && !other.left)) return;
    }
    if (this.isHost) {
      if (!this._room) {
        const { room } = createRoom(this.code, peers.seats?.[0]?.name || this.name, this._bestOf, Date.now());
        this._room = room;
      }
      const room = this._room;
      if (other?.present && !other.left) {
        const guest = room.players[1];
        if (!guest) { joinRoom(room, other.name, Date.now()); this._lost = false; }
        else if (guest.left && this._lost && guest.name === other.name && room.status !== 'waiting') { rejoin(room, 1, Date.now()); this._lost = false; }
        else if (guest.left) { joinRoom(room, other.name, Date.now()); this._lost = false; }
      } else if (other?.left && room.players[1] && !room.players[1].left) {
        try { applyAction(room, 1, 'leave', Date.now(), this._presence); } catch { /* Already gone. */ }
      }
      this._publish(true);
    } else if (!this.info || !this.link?.open) {
      // Until the host's first snapshot arrives, show the lobby from the room's seats.
      this._guestPlaceholder(peers);
      if (peers.seats?.[0]?.left) this._setStatus('left', `${peers.seats[0].name} left the match.`);
    }
  }

  _guestPlaceholder(peers) {
    const players = (peers.seats || []).map(s => s && { name: s.name, connected: s.connected, left: s.left });
    const state = this.snapshot || createGame({ mode: 'online', bestOf: this._bestOf });
    this._accept({ code: this.code, revision: 0, side: this.side, status: this.info?.status || 'waiting', state, players, bestOf: this._bestOf, serverTime: Date.now(), inputs: [INPUT, INPUT], suspended: false, rematchVotes: [false, false], round: this.info?.round || 0, ackSeq: -1 }, true);
  }

  _presence = side => side === this.side || !!this.link?.open;

  _linkOpen() {
    this._lost = false;
    if (this.isHost && this._room) {
      if (this._room.players[1]?.left && this._room.status !== 'waiting') rejoin(this._room, 1, Date.now());
      this._publish(true);
    }
  }

  _linkDown() {
    if (this.isHost) this._publish(true);
    else if (this.info) this._setStatus('reconnecting', `Waiting for ${this.players?.[0]?.name || 'the host'}…`);
  }

  _linkLost(reason) {
    if (this._disposed) return;
    this._lost = true;
    const message = reason === 'left' ? null : (reason || CONNECT_FAILED);
    if (this.isHost && this._room) {
      if (this._room.players[1] && !this._room.players[1].left && this._room.status !== 'waiting') {
        try { applyAction(this._room, 1, 'leave', Date.now(), this._presence); } catch { /* Already gone. */ }
      }
      this._publish(true);
      if (message && this._room.status === 'waiting') this._setStatus('error', message);
    } else {
      const host = this.players?.[0]?.name || 'Your friend';
      if (message) this._setStatus('error', message);
      else this._setStatus('left', `${host} left the match.`);
      if (this.info) { this.info = { ...this.info, suspended: true, players: this.info.players.map((p, i) => i === 0 && p ? { ...p, left: true, connected: false } : p) }; this.onState(this.snapshot, this.info); }
    }
  }

  _terminal(message) {
    this._clearSaved(this.code);
    for (const item of this._pending.values()) { clearTimeout(item.timer); item.reject(failure(message, 0)); }
    this._pending.clear();
    this._setStatus('error', message);
  }

  // ---- host ----

  _hostTick() {
    const room = this._room;
    if (!room || this._disposed) return;
    advance(room, Date.now(), this._presence);
    settle(room, Date.now(), this._presence);
    this._publish(false);
  }

  _hostKey() {
    const r = this._room;
    return JSON.stringify([r.status, r.round, r.suspended, r.state.score, r.state.games, r.state.phase, r.rematch, r.players.map(p => p && [p.name, p.left])]);
  }

  /** Send the guest a snapshot (u every tick, r when something durable changed) and update this screen. */
  _publish(force) {
    const room = this._room;
    if (!room) return;
    const t = Date.now();
    const key = this._hostKey();
    const changed = key !== this._publishedKey;
    if (!force && !changed && t - this._publishedAt < HOST_TICK_MS - 5) return;
    this._publishedAt = t;
    this._publishedKey = key;
    if (this.link?.open) {
      const guestView = publicRoom(room, 1, t, this._presence, room.state.eventId - EVENTS_PER_SNAPSHOT);
      this.link.send(changed || force ? 'r' : 'u', { t: 'snap', room: guestView });
    }
    if (changed || force || t - (this._hostShown || 0) > 100) {
      this._hostShown = t;
      this._accept(publicRoom(room, 0, t, this._presence, 0), true);
    }
  }

  _guestAction(id, action) {
    const room = this._room;
    let error = null;
    try { applyAction(room, 1, action, Date.now(), this._presence); settle(room, Date.now(), this._presence); }
    catch (caught) { error = caught; }
    this.link?.send('r', { t: 'ack', id, ...(error ? { error: error.message, status: error.status } : {}) });
    this._publish(true);
  }

  // ---- guest ----

  _sendInput(force) {
    if (this._disposed || this.isHost || !this.link?.open || this.info?.status !== 'playing') return;
    const t = now();
    const input = {
      x: Math.round(this.input.x * 1000) / 1000, depth: Math.round(this.input.depth * 1000) / 1000,
      aim: Math.round(this.input.aim * 1000) / 1000, power: Math.round(this.input.power * 100) / 100,
      spin: this.input.spin, swing: this.input.swing || t < this._swingUntil, serve: false,
    };
    const key = JSON.stringify(input);
    if (!force && key === this._sent && t - this._sentAt < KEEPALIVE_MS) return;
    if (this.link.send('u', { t: 'in', s: ++this._seq, input, ping: Date.now() })) { this._sent = key; this._sentAt = t; }
  }

  _message(kind, data) {
    if (this._disposed || !data) return;
    if (this.isHost) {
      const room = this._room;
      if (!room) return;
      if (data.t === 'in') {
        applyInput(room, 1, data.s, data.input, Date.now(), this._presence);
        if (data.ping && Date.now() - this._pingAt > 1000) { this._pingAt = Date.now(); this.link.send('u', { t: 'pong', ping: data.ping }); }
      } else if (data.t === 'serve') {
        // A serve is a one-off command, consumed once when it is the guest's serve.
        advance(room, Date.now(), this._presence);
        if (room.status === 'playing' && !room.suspended && serveGame(room.state, 1)) this._publish(true);
      } else if (data.t === 'act' && ['start', 'rematch', 'leave', 'resume'].includes(data.a)) {
        this._guestAction(data.id, data.a);
      }
      return;
    }
    if (data.t === 'snap' && data.room) this._accept({ ...data.room, side: this.side });
    else if (data.t === 'pong' && data.ping) { const rtt = Date.now() - data.ping; this.latency = Math.round(this.latency ? this.latency * .75 + rtt * .25 : rtt); }
    else if (data.t === 'ack') {
      const item = this._pending.get(data.id);
      if (!item) return;
      this._pending.delete(data.id); clearTimeout(item.timer);
      if (data.error) item.reject(failure(data.error, data.status)); else item.resolve(this.info);
    }
  }

  _action(action) {
    if (!this.code) return Promise.reject(failure('Join a room first.', 0));
    if (this.isHost) {
      try { applyAction(this._room, 0, action, Date.now(), this._presence); settle(this._room, Date.now(), this._presence); }
      catch (error) { return Promise.reject(error); }
      this._publish(true);
      return Promise.resolve(this.info);
    }
    if (!this.link?.open) return Promise.reject(failure(action === 'start' ? 'Waiting for the host to start.' : 'Reconnecting… Try again in a moment.', 503));
    const id = ++this._actionId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this._pending.delete(id); reject(failure('Your friend did not answer. Try again.', 504)); }, ACTION_TIMEOUT_MS);
      this._pending.set(id, { resolve, reject, timer });
      this.link.send('r', { t: 'act', id, a: action });
    });
  }

  // ---- shared ----

  _accept(data, local = false) {
    if (this._disposed || !data) return;
    this.info = data;
    this.snapshot = data.state;
    this.players = data.players || [null, null];
    this.rematchVotes = data.rematchVotes || [false, false];
    this.name = this.players[this.side]?.name || this.name;
    this.opponentName = this.players[1 - this.side]?.name || 'Friend';
    this.connected = true;
    this._receivedAt = now();
    if (this._round !== data.round) { this._rendered = null; this._round = data.round; }
    if (data.state.phase !== 'ready' || data.state.server !== this.side) this._servePending = false;
    if (!this.isHost) {
      this._predicted = copy(data.state);
      if (data.status === 'playing' && !data.suspended && this.latency > 0) {
        const inputs = copy(data.inputs || [INPUT, INPUT]);
        inputs[this.side] = { ...this.input, swing: this.input.swing || now() < this._swingUntil, serve: false };
        stepGame(this._predicted, inputs, Math.min(this.latency / 2000, .075));
      }
    }
    const opponent = this.players[1 - this.side];
    if (this.status !== 'error' || !local) {
      if (data.suspended) this._setStatus(opponent?.left ? 'left' : 'reconnecting', opponent?.left ? `${opponent.name} left the match.` : `Waiting for ${opponent?.name || 'your friend'}…`);
      else if (!(this.status === 'left' && !this.isHost && !this.link?.open)) this._setStatus(data.status, '');
    }
    this.onState(data.state, data);
  }

  _setStatus(status, detail = '') {
    this.status = status;
    this.detail = detail;
    const key = `${status}:${detail}`;
    if (key !== this._lastStatus) { this._lastStatus = key; this.onStatus(status, detail); }
  }

  _saved() { try { return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null'); } catch { return null; } }
  _clearSaved(code) { try { const saved = this._saved(); if (saved && (!code || saved.code === code)) sessionStorage.removeItem(STORAGE_KEY); } catch { /* Storage may be disabled. */ } }
}
