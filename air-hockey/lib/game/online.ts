import { clampTarget, cloneGame, createGame, stepGame } from './physics';
import { TABLE, type Body, type GameEvent, type GameState, type Side, type Targets, type Vec2 } from './types';
import type { OnlineSession, OnlineStatus, RoomAction, RoomPlayer, RoomSnapshot } from './network-types';
import { advance, applyAction, applyInput, createRoom, joinRoom, rejoin, seatSnapshot, settle, type RoomRecord } from './room-server';
import { PeerLink, CONNECT_FAILED } from './p2p.js';

export type { OnlineSession, OnlineStatus, RoomAction, RoomSnapshot } from './network-types';

// Online play goes device to device (docs/p2p-online.md in the hub repo). The
// room server only pairs the seats and relays WebRTC setup. The host (seat 0)
// runs the authoritative 240 Hz match in its browser with the same room rules
// the server used before, and sends the guest a snapshot about 20 times a
// second on the unordered channel, plus one on the reliable channel whenever
// the score, status or seats change. The guest sends its mallet target the same
// way and pause, resume, rematch and leave on the reliable channel.

const STORAGE_KEY = 'air-online-session-v1';
const HOST_TICK_MS = 50;
const GUEST_SEND_MS = 50;
const KEEPALIVE_MS = 400;
const EVENTS_PER_SNAPSHOT = 8;
const REMOTE_BUFFER_MS = 90;
const ACTION_TIMEOUT_MS = 8000;

type Handlers = {
  onPeers?: (peers: Peers) => void; onOpen?: () => void; onDown?: () => void;
  onLost?: (reason: string) => void; onMessage?: (kind: 'u' | 'r', data: Wire) => void; onTerminal?: (message: string) => void;
};
type Seat = { name: string; present: boolean; connected: boolean; left: boolean } | null;
type Peers = { t: string; side: Side; code?: string; token?: string; host: Side | null; seats: [Seat, Seat]; meta?: { targetScore?: number } };
type Link = { open: boolean; serverMessages: number; start(hello: unknown): Promise<Peers & { code: string; token: string }>; send(kind: 'u' | 'r', data: Wire): boolean; leave(): void; dispose(): void };
type Wire = { t: string; [key: string]: unknown };
type HistoryFrame = { at: number; snapshot: RoomSnapshot };
const BUSY_MESSAGE = 'Online play is full right now. Try again in a little while.';
type Pending = { resolve: () => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> };

/** Test seam: Node tests replace the link and fetch. */
export const transport = {
  link: (code: string, handlers: Handlers): Link => new PeerLink(code, handlers) as Link,
  fetch: (input: string, init?: RequestInit): Promise<Response> => fetch(input, init),
};
export const CONNECT_FAILED_MESSAGE: string = CONNECT_FAILED;

export class RoomRequestError extends Error {
  constructor(message: string, public readonly status: number) { super(message); this.name = 'RoomRequestError'; }
}

function normalize(code: string): string {
  const normalized = code.toUpperCase().replace(/[\s-]/g, '');
  if (!/^[A-Z2-9]{6}$/.test(normalized)) throw new RoomRequestError('Enter the six-character room code.', 400);
  return normalized;
}

function move(body: Body, target: Vec2, dt: number): void {
  const dx = target.x - body.x, dy = target.y - body.y;
  const length = Math.hypot(dx, dy);
  const distance = Math.min(length, TABLE.maxMalletSpeed * dt);
  if (length < 0.00001 || dt <= 0) { body.vx = 0; body.vy = 0; return; }
  body.vx = (dx / length) * (distance / dt);
  body.vy = (dy / length) * (distance / dt);
  body.x += dx / length * distance;
  body.y += dy / length * distance;
}

export class OnlineGame {
  session: OnlineSession;
  snapshot: RoomSnapshot | null = null;
  ping = 0;
  status: OnlineStatus = 'connecting';
  lastError: string | null = null;
  onSnapshot?: (snapshot: RoomSnapshot) => void;
  onEvents?: (events: GameEvent[]) => void;
  onStatus?: (status: OnlineStatus) => void;

  private link: Link;
  private room: RoomRecord | null = null;
  private role: 'host' | 'guest';
  private targetScore: number;
  private target: Vec2;
  private targetSet = false;
  private seq = 0;
  private hostSeq = 0;
  private actionId = 0;
  private pending = new Map<number, Pending>();
  private timers: ReturnType<typeof setInterval>[] = [];
  private disposed = false;
  private lastEvent = 0;
  private receivedAt = 0;
  private sentKey = '';
  private sentAt = 0;
  private publishedKey = '';
  private publishedAt = 0;
  private shownAt = 0;
  private pingAt = 0;
  private lost = false;
  private history: HistoryFrame[] = [];
  private renderState: GameState | null = null;
  private ownBody: Body | null = null;

  private constructor(link: Link, welcome: Peers & { code: string; token: string }) {
    this.link = link;
    this.session = { code: welcome.code, token: welcome.token, side: welcome.side };
    this.role = welcome.side === 0 ? 'host' : 'guest';
    this.targetScore = Number(welcome.meta?.targetScore) || 7;
    this.target = { x: 0, y: welcome.side === 0 ? 5.4 : -5.4 };
    this.persist();
    this.peers(welcome);
    this.timers.push(setInterval(() => this.hostTick(), HOST_TICK_MS), setInterval(() => this.sendInput(false), GUEST_SEND_MS));
  }

  get isHost(): boolean { return this.session.side === 0; }
  get serverMessages(): number { return this.link.serverMessages; }

  static async create(name = 'Player', targetScore = 7): Promise<OnlineGame> {
    let response: Response;
    try {
      response = await transport.fetch('/api/rooms', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, targetScore }), cache: 'no-store', signal: AbortSignal.timeout(12000),
      });
    } catch { throw new RoomRequestError('Could not reach the server. Check your connection.', 503); }
    const data = await response.json().catch(() => ({})) as { code?: string; token?: string; error?: string };
    // 429, 503 or Cloudflare's 1027 daily-limit page carry no JSON: show the busy message.
    const busy = response.status === 429 || response.status === 503;
    if (!response.ok || !data.code || !data.token) throw new RoomRequestError(data.error ?? (busy ? BUSY_MESSAGE : 'Could not start a room. Try again.'), response.status || 503);
    return OnlineGame.open(data.code, { t: 'hello', token: data.token });
  }

  static async join(code: string, name = 'Player'): Promise<OnlineGame> {
    return OnlineGame.open(normalize(code), { t: 'join', name });
  }

  static async reconnect(session: OnlineSession): Promise<OnlineGame> {
    try { return await OnlineGame.open(session.code, { t: 'hello', token: session.token }); }
    catch (error) {
      if (error instanceof RoomRequestError && [401, 404].includes(error.status) && OnlineGame.savedSession()?.token === session.token) OnlineGame.clearSession();
      throw error;
    }
  }

  private static async open(code: string, hello: Wire): Promise<OnlineGame> {
    let game: OnlineGame | null = null;
    const early: Array<() => void> = [];
    const later = (fn: () => void) => { if (game) fn(); else early.push(fn); };
    const link = transport.link(code, {
      onPeers: peers => later(() => game!.peers(peers)),
      onOpen: () => later(() => game!.linkOpen()),
      onDown: () => later(() => game!.linkDown()),
      onLost: reason => later(() => game!.linkLost(reason)),
      onMessage: (kind, data) => later(() => game!.message(kind, data)),
      onTerminal: message => later(() => game!.terminal(message)),
    });
    let welcome;
    try { welcome = await link.start(hello); }
    catch (error) {
      link.dispose();
      const e = error as { message?: string; status?: number };
      throw new RoomRequestError(e.message || 'Could not reach the room.', e.status ?? 503);
    }
    game = new OnlineGame(link, welcome);
    early.splice(0).forEach(fn => fn());
    return game;
  }

  static savedSession(): OnlineSession | null {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw) as OnlineSession;
      return typeof data.code === 'string' && /^[A-Z2-9]{6}$/.test(data.code) && typeof data.token === 'string' && (data.side === 0 || data.side === 1) ? data : null;
    } catch { return null; }
  }

  static clearSession(): void { try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* Private browsing can disable storage. */ } }

  setTarget(target: Vec2): void {
    if (!Number.isFinite(target.x) || !Number.isFinite(target.y)) return;
    this.target = clampTarget(this.session.side, target);
    this.targetSet = true;
    if (this.isHost && this.room) applyInput(this.room, 0, { seq: ++this.hostSeq, target: this.target }, Date.now(), this.presence);
  }

  action(action: RoomAction): Promise<void> {
    if (this.disposed) return Promise.reject(new Error('This room is closed.'));
    if (action === 'leave') { this.leave(); return Promise.resolve(); }
    if (this.isHost) {
      if (this.room) { applyAction(this.room, 0, action, Date.now(), this.presence); this.publish(true); }
      return Promise.resolve();
    }
    if (!this.link.open) return Promise.reject(new Error('Reconnecting… Try again in a moment.'));
    const id = ++this.actionId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('Your friend did not answer. Try again.')); }, ACTION_TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, timer });
      this.link.send('r', { t: 'act', id, a: action });
    });
  }

  sample(dt: number): GameState | null {
    if (this.isHost) {
      if (!this.room) return this.snapshot?.state ?? null;
      this.hostStep();
      return this.room.state;
    }
    if (!this.snapshot) return null;
    const source = this.snapshot.state;
    const predicted = cloneGame(source);
    const now = performance.now();
    const age = Math.max(0, now - this.receivedAt);
    const mayPredict = this.status === 'playing' && source.phase === 'playing' && age < 500;
    if (mayPredict) {
      // Extrapolation is deliberately short. Long outages freeze instead of inventing play.
      let remaining = Math.min(0.12, (age + this.ping * 0.5) / 1000);
      const other = this.session.side === 0 ? 1 : 0;
      const targets: Targets = [
        { x: source.mallets[0].x, y: source.mallets[0].y },
        { x: source.mallets[1].x, y: source.mallets[1].y },
      ];
      targets[this.session.side] = this.target;
      targets[other] = clampTarget(other, {
        x: source.mallets[other].x + source.mallets[other].vx * remaining,
        y: source.mallets[other].y + source.mallets[other].vy * remaining,
      });
      while (remaining >= TABLE.fixedDt && predicted.phase === 'playing') {
        stepGame(predicted, targets, TABLE.fixedDt);
        remaining -= TABLE.fixedDt;
      }
    }

    if (!this.ownBody) this.ownBody = { ...source.mallets[this.session.side] };
    if (this.status === 'playing') {
      const legalTarget = { ...this.target };
      if (source.phase !== 'playing' && Math.abs(legalTarget.y) < 1.35) legalTarget.y = this.session.side === 0 ? 1.35 : -1.35;
      move(this.ownBody, legalTarget, Math.min(0.05, Math.max(0, dt)));
    } else {
      Object.assign(this.ownBody, source.mallets[this.session.side]);
    }
    predicted.mallets[this.session.side] = { ...this.ownBody };

    const other = this.session.side === 0 ? 1 : 0;
    const renderTime = now - REMOTE_BUFFER_MS - Math.min(this.ping * 0.5, 80);
    let before = this.history[0], after = this.history[this.history.length - 1];
    for (const frame of this.history) {
      if (frame.at <= renderTime) before = frame;
      if (frame.at >= renderTime) { after = frame; break; }
    }
    if (before && after && before.snapshot.matchId === after.snapshot.matchId && before.snapshot.state.phase === after.snapshot.state.phase) {
      const weight = after.at === before.at ? 1 : Math.max(0, Math.min(1, (renderTime - before.at) / (after.at - before.at)));
      const a = before.snapshot.state.mallets[other], b = after.snapshot.state.mallets[other];
      predicted.mallets[other] = { ...b, x: a.x + (b.x - a.x) * weight, y: a.y + (b.y - a.y) * weight };
    }

    // Physics may anticipate crossing the line; the result remains the host's.
    predicted.scores = [...source.scores];
    predicted.phase = source.phase;
    predicted.timer = Math.max(0, source.timer - (this.status === 'playing' ? age / 1000 : 0));
    predicted.lastScorer = source.lastScorer;
    if (this.renderState && source.phase === 'playing' && this.renderState.phase === source.phase) {
      const error = Math.hypot(predicted.puck.x - this.renderState.puck.x, predicted.puck.y - this.renderState.puck.y);
      if (error < 1.5 && mayPredict) {
        const weight = 1 - Math.exp(-40 * Math.min(dt, 0.05));
        predicted.puck.x = this.renderState.puck.x + (predicted.puck.x - this.renderState.puck.x) * weight;
        predicted.puck.y = this.renderState.puck.y + (predicted.puck.y - this.renderState.puck.y) * weight;
      }
    }
    this.renderState = predicted;
    return predicted;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.timers.forEach(clearInterval); this.timers = [];
    this.pending.forEach(item => { clearTimeout(item.timer); item.reject(new Error('This room is closed.')); });
    this.pending.clear();
    this.history.length = 0;
    this.link.dispose();
    this.onSnapshot = undefined; this.onEvents = undefined; this.onStatus = undefined;
  }

  private leave(): void {
    if (!this.isHost) this.link.send('r', { t: 'act', id: ++this.actionId, a: 'leave' });
    const link = this.link;
    this.disposed = true;
    this.timers.forEach(clearInterval); this.timers = [];
    link.leave();
  }

  private persist(): void { try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(this.session)); } catch { /* This tab still works. */ } }

  private setStatus(status: OnlineStatus): void {
    if (this.status !== status) { this.status = status; this.onStatus?.(status); }
  }

  private presence = (side: Side): boolean => side === this.session.side || this.link.open;

  // ---- seats (from the room server) ----

  private peers(peers: Peers): void {
    if (this.disposed) return;
    this.session = { ...this.session, side: peers.side };
    this.persist();
    const other = peers.seats?.[peers.side === 0 ? 1 : 0];
    if (this.isHost && this.role === 'guest') {
      // Host handover: the host left, so the room made this player seat 0.
      this.role = 'host';
      this.room = null;
      this.markOtherLeft();
      if (!(other?.present && !other.left)) return;
    }
    if (this.isHost) {
      const now = Date.now();
      if (!this.room) this.room = createRoom(this.session.code, peers.seats?.[0]?.name || 'Player', this.targetScore, now).room;
      const room = this.room;
      const guest = room.players[1];
      if (other?.present && !other.left) {
        if (!guest || guest.left) {
          if (guest?.left && this.lost && guest.name === other.name) rejoin(room, 1, now);
          else joinRoom(room, other.name, now);
          this.lost = false;
        }
      } else if (other?.left && guest && !guest.left) {
        applyAction(room, 1, 'leave', now, this.presence);
      }
      settle(room, now, this.presence);
      this.publish(true);
    } else if (!this.link.open) {
      // Until the host's first snapshot arrives, show the lobby from the room's seats.
      const players = (peers.seats || []).map(s => ({ name: s?.name ?? 'Waiting', connected: !!s?.connected, ready: false, present: !!s, left: !!s?.left })) as [RoomPlayer, RoomPlayer];
      const state = this.snapshot?.state ?? createGame(this.targetScore);
      this.accept({ code: this.session.code, state, players, status: this.snapshot?.status ?? 'waiting', serverTime: Date.now(), revision: 0, ackSeq: -1, events: [], matchId: this.snapshot?.matchId ?? 0, pausedBy: null });
      if (peers.seats?.[0]?.left) this.markOtherLeft();
    }
  }

  private markOtherLeft(): void {
    if (!this.snapshot) return;
    const other = this.session.side === 0 ? 1 : 0;
    const players = this.snapshot.players.map((p, i) => i === other ? { ...p, left: true, connected: false } : p) as [RoomPlayer, RoomPlayer];
    this.snapshot = { ...this.snapshot, players, status: 'disconnected' };
    this.setStatus('disconnected');
    this.onSnapshot?.(this.snapshot);
  }

  private linkOpen(): void {
    this.lost = false;
    if (this.isHost && this.room) {
      if (this.room.players[1]?.left && this.room.status !== 'waiting') rejoin(this.room, 1, Date.now());
      settle(this.room, Date.now(), this.presence);
      this.publish(true);
    }
  }

  private linkDown(): void {
    if (this.isHost) { if (this.room) { advance(this.room, Date.now(), this.presence); this.publish(true); } }
    else if (this.snapshot) { this.lastError = 'Connection interrupted. Reconnecting…'; this.setStatus('reconnecting'); }
  }

  private linkLost(reason: string): void {
    if (this.disposed) return;
    this.lost = true;
    const message = reason === 'left' ? null : (reason || CONNECT_FAILED);
    if (this.isHost && this.room) {
      const guest = this.room.players[1];
      if (guest && !guest.left && this.room.status !== 'waiting') applyAction(this.room, 1, 'leave', Date.now(), this.presence);
      this.publish(true);
      if (message && this.room.status === 'waiting' && guest) this.terminal(message);
    } else if (message) this.terminal(message);
    else this.markOtherLeft();
  }

  private terminal(message: string): void {
    this.lastError = message;
    this.setStatus('error');
    this.pending.forEach(item => { clearTimeout(item.timer); item.reject(new Error(message)); });
    this.pending.clear();
    OnlineGame.clearSession();
  }

  // ---- host ----

  private hostStep(): void {
    const room = this.room!;
    const now = Date.now();
    advance(room, now, this.presence);
    settle(room, now, this.presence);
    const fresh = room.events.filter(item => item.id > this.lastEvent);
    if (fresh.length) { this.lastEvent = fresh[fresh.length - 1].id; this.onEvents?.(fresh.map(item => item.event)); }
    this.publish(false);
  }

  private hostTick(): void {
    if (this.disposed || !this.isHost || !this.room) return;
    this.hostStep();
  }

  private hostKey(): string {
    const r = this.room!;
    return JSON.stringify([r.status, r.matchId, r.state.scores, r.state.phase, r.pausedBy, r.players.map(p => p && [p.name, p.ready, p.left])]);
  }

  /** Send the guest a snapshot (u each tick, r when something durable changed) and refresh this screen. */
  private publish(force: boolean): void {
    const room = this.room;
    if (!room) return;
    const now = Date.now();
    const key = this.hostKey();
    const changed = key !== this.publishedKey;
    if (!force && !changed && now - this.publishedAt < HOST_TICK_MS - 5) return;
    this.publishedAt = now;
    this.publishedKey = key;
    if (this.link.open) this.link.send(changed || force ? 'r' : 'u', { t: 'snap', room: seatSnapshot(room, 1, this.presence, now, room.eventCounter - EVENTS_PER_SNAPSHOT) });
    if (changed || force || now - this.shownAt > 100) {
      this.shownAt = now;
      this.snapshot = seatSnapshot(room, 0, this.presence, now, room.eventCounter);
      if (this.status !== 'error') this.setStatus(room.status);
      this.onSnapshot?.(this.snapshot);
    }
  }

  // ---- guest ----

  private sendInput(force: boolean): void {
    if (this.disposed || this.isHost || !this.link.open || this.status !== 'playing') return;
    const t = performance.now();
    const x = Math.round(this.target.x * 1000) / 1000, y = Math.round(this.target.y * 1000) / 1000;
    const key = `${x},${y}`;
    if (!force && key === this.sentKey && t - this.sentAt < KEEPALIVE_MS) return;
    if (this.link.send('u', { t: 'in', s: ++this.seq, x, y, ping: Date.now() })) { this.sentKey = key; this.sentAt = t; }
  }

  private message(kind: 'u' | 'r', data: Wire): void {
    if (this.disposed || !data) return;
    if (this.isHost) {
      const room = this.room;
      if (!room) return;
      if (data.t === 'in' && typeof data.x === 'number' && typeof data.y === 'number' && Number.isSafeInteger(data.s)) {
        applyInput(room, 1, { seq: data.s as number, target: { x: data.x, y: data.y } }, Date.now(), this.presence);
        if (typeof data.ping === 'number' && Date.now() - this.pingAt > 1000) { this.pingAt = Date.now(); this.link.send('u', { t: 'pong', ping: data.ping }); }
      } else if (data.t === 'act' && ['pause', 'resume', 'rematch', 'leave'].includes(data.a as string)) {
        applyAction(room, 1, data.a as RoomAction, Date.now(), this.presence);
        this.link.send('r', { t: 'ack', id: data.id });
        this.publish(true);
      }
      return;
    }
    if (data.t === 'snap' && data.room) this.accept(data.room as RoomSnapshot);
    else if (data.t === 'pong' && typeof data.ping === 'number') { const rtt = Date.now() - data.ping; this.ping = this.ping ? this.ping * 0.8 + rtt * 0.2 : rtt; }
    else if (data.t === 'ack') {
      const item = this.pending.get(data.id as number);
      if (item) { this.pending.delete(data.id as number); clearTimeout(item.timer); item.resolve(); }
    }
  }

  private accept(snapshot: RoomSnapshot): void {
    const previous = this.snapshot;
    if (previous && snapshot.matchId === previous.matchId && snapshot.revision < previous.revision) return;
    const reset = !previous || previous.matchId !== snapshot.matchId || previous.status !== snapshot.status || previous.state.phase !== snapshot.state.phase;
    this.snapshot = snapshot;
    this.receivedAt = performance.now();
    if (!this.targetSet || reset) {
      const position = snapshot.state.mallets[this.session.side];
      this.ownBody = { ...position };
      if (!this.targetSet || snapshot.state.phase === 'faceoff') this.target = { x: position.x, y: position.y };
    } else if (this.ownBody && snapshot.status === 'playing') {
      const authoritative = snapshot.state.mallets[this.session.side];
      const error = Math.hypot(this.ownBody.x - authoritative.x, this.ownBody.y - authoritative.y);
      if (error > TABLE.maxMalletSpeed * (Math.min(this.ping, 300) / 1000 + 0.2)) {
        this.ownBody = { ...authoritative };
        move(this.ownBody, this.target, Math.min(0.1, this.ping / 2000));
      }
    }
    if (reset) { this.history.length = 0; this.renderState = null; }
    this.history.push({ at: this.receivedAt - this.ping * 0.5, snapshot });
    if (this.history.length > 16) this.history.shift();
    if (!previous) this.lastEvent = snapshot.events.at(-1)?.id ?? 0;
    const fresh = snapshot.events.filter(item => item.id > this.lastEvent);
    if (fresh.length) { this.lastEvent = fresh[fresh.length - 1].id; this.onEvents?.(fresh.map(item => item.event)); }
    if (this.status !== 'error') { this.lastError = null; this.setStatus(snapshot.status); }
    this.onSnapshot?.(snapshot);
  }
}
