import { clampTarget, createGame, stepGame } from './physics';
import { TABLE, type Body, type GameState, type Side, type Targets, type Vec2 } from './types';
import type { NetworkEvent, RoomAction, RoomSnapshot, RoomStatus } from './network-types';

// Pure room rules. The Durable Object in room-do.ts owns one RoomRecord per
// room code, feeds it socket input and runs `tick` while a match is live.
// Everything here is synchronous so it can be unit-tested without Workers.

export const ROOM_LIFETIME = 2 * 60 * 60 * 1000;
export const DISCONNECT_AFTER = 6000;
const MAX_CATCHUP = 0.25;
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_EVENTS = 48;

type PrivatePlayer = { name: string; token: string; lastSeq: number; ready: boolean; left: boolean };
export type RoomRecord = {
  code: string;
  state: GameState;
  players: [PrivatePlayer | null, PrivatePlayer | null];
  targets: Targets;
  status: RoomStatus;
  pausedBy: Side | null;
  simTime: number;
  accumulator: number;
  events: NetworkEvent[];
  eventCounter: number;
  matchId: number;
  version: number;
  updatedAt: number;
};

/** Whether a seat currently has a live, recently heard-from socket. */
export type Presence = (side: Side) => boolean;

export class RoomError extends Error {
  constructor(message: string, public readonly status = 400) { super(message); this.name = 'RoomError'; }
}

export const MESSAGES = {
  notFound: 'No room with that code. It may have expired. Check the code or start a new room.',
  full: 'This room is full. Start a new room to play.',
  session: 'Your place in this room has expired. Join again with the code.',
} as const;

export function isRoomCode(input: string): boolean {
  return /^[A-Z2-9]{6}$/.test(input);
}

export function cleanCode(input: string): string {
  const code = input.toUpperCase().replace(/[\s-]/g, '');
  if (!isRoomCode(code)) throw new RoomError('Enter the six-character room code.');
  return code;
}

export function cleanName(value: unknown): string {
  if (typeof value !== 'string') return 'Player';
  return value.replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 20) || 'Player';
}

export function randomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return [...bytes].map(value => CODE_ALPHABET[value % CODE_ALPHABET.length]).join('');
}

function newPlayer(name: unknown): PrivatePlayer {
  return { name: cleanName(name), token: crypto.randomUUID() + crypto.randomUUID(), lastSeq: -1, ready: false, left: false };
}

function homeTargets(state: GameState): Targets {
  return state.mallets.map(mallet => ({ x: mallet.x, y: mallet.y })) as Targets;
}

export function expired(room: RoomRecord, now: number): boolean {
  return now - room.updatedAt > ROOM_LIFETIME;
}

export function createRoom(code: string, name: unknown, score: unknown, now: number): { room: RoomRecord; token: string } {
  const targetScore = typeof score === 'number' && [3, 5, 7, 11].includes(score) ? score : 7;
  const player = newPlayer(name);
  const state = createGame(targetScore, crypto.getRandomValues(new Uint32Array(1))[0]);
  const room: RoomRecord = {
    code, state, players: [player, null], targets: homeTargets(state),
    status: 'waiting', pausedBy: null, simTime: now, accumulator: 0,
    events: [], eventCounter: 0, matchId: 1, version: 0, updatedAt: now,
  };
  return { room, token: player.token };
}

export function authenticate(room: RoomRecord, token: unknown): Side | null {
  if (typeof token !== 'string' || token.length < 30 || token.length > 100) return null;
  const found = room.players.findIndex(player => player?.token === token);
  return found < 0 ? null : found as Side;
}

/** A free seat, or the seat of a player who explicitly left. */
export function joinRoom(room: RoomRecord, name: unknown, now: number): { side: Side; token: string } {
  const free = room.players.findIndex(player => !player);
  const abandoned = room.players.findIndex(player => player?.left);
  const index = free >= 0 ? free : abandoned;
  if (index < 0) throw new RoomError(MESSAGES.full, 409);
  const seat = index as Side;
  const player = newPlayer(name);
  const takeover = room.players[seat] !== null;
  room.players[seat] = player;
  if (takeover || room.status === 'finished') freshMatch(room, now);
  else restartFaceoff(room);
  room.status = 'disconnected';
  room.pausedBy = null;
  room.simTime = now;
  touch(room, now);
  return { side: seat, token: player.token };
}

export function seatSnapshot(room: RoomRecord, side: Side, presence: Presence, now: number, since = 0): RoomSnapshot {
  return {
    code: room.code,
    state: compactState(room.state),
    players: room.players.map((player, seat) => ({
      name: player?.name ?? 'Waiting',
      connected: Boolean(player && !player.left && presence(seat as Side)),
      ready: player?.ready ?? false,
      present: !!player,
      left: player?.left ?? false,
    })) as RoomSnapshot['players'],
    status: room.status, serverTime: now, revision: room.version,
    ackSeq: room.players[side]?.lastSeq ?? -1,
    events: room.events.filter(item => item.id > since).map(item => ({ id: item.id, event: { ...item.event } })),
    matchId: room.matchId, pausedBy: room.pausedBy,
  };
}

const round = (value: number) => Math.round(value * 10000) / 10000;
const compactBody = (body: Body): Body => ({ x: round(body.x), y: round(body.y), vx: round(body.vx), vy: round(body.vy) });

function compactState(state: GameState): GameState {
  return {
    ...state, puck: compactBody(state.puck), mallets: [compactBody(state.mallets[0]), compactBody(state.mallets[1])],
    scores: [...state.scores], timer: round(state.timer), elapsed: round(state.elapsed),
  };
}

function touch(room: RoomRecord, now: number): void {
  room.version++;
  room.updatedAt = now;
}

function both(room: RoomRecord, presence: Presence): boolean {
  return room.players.every((player, seat) => player && !player.left && presence(seat as Side));
}

function restartFaceoff(room: RoomRecord): void {
  const previous = room.state;
  const state = createGame(previous.targetScore, previous.seed);
  state.scores = [...previous.scores];
  state.elapsed = previous.elapsed;
  state.tick = previous.tick;
  state.serveSide = previous.serveSide;
  state.lastScorer = previous.lastScorer;
  state.timer = 1.8;
  room.state = state;
  room.targets = homeTargets(state);
  room.accumulator = 0;
}

function freshMatch(room: RoomRecord, now: number): void {
  room.state = createGame(room.state.targetScore, (room.state.seed + 104729) >>> 0);
  room.targets = homeTargets(room.state);
  room.players.forEach(player => { if (player) player.ready = false; });
  room.pausedBy = null;
  room.matchId++;
  room.accumulator = 0;
  room.simTime = now;
}

/** Run the authoritative simulation up to `now`, using only accepted input. */
export function advance(room: RoomRecord, now: number, presence: Presence): void {
  if (room.status !== 'playing') { room.simTime = now; room.accumulator = 0; return; }
  if (!both(room, presence)) {
    room.status = 'disconnected'; room.simTime = now; room.accumulator = 0; touch(room, now); return;
  }
  room.accumulator += Math.min(MAX_CATCHUP, Math.max(0, now - room.simTime) / 1000);
  room.simTime = now;
  let count = 0;
  while (room.accumulator + 1e-10 >= TABLE.fixedDt && count++ < 61) {
    const events = stepGame(room.state, room.targets, TABLE.fixedDt);
    for (const event of events) room.events.push({ id: ++room.eventCounter, event });
    room.accumulator -= TABLE.fixedDt;
    if (room.state.phase === 'finished') { room.status = 'finished'; room.accumulator = 0; touch(room, now); break; }
  }
  if (room.events.length > MAX_EVENTS) room.events.splice(0, room.events.length - MAX_EVENTS);
}

/** Resolve reconnects, resumes and rematches once both seats are back. */
export function settle(room: RoomRecord, now: number, presence: Presence): void {
  const together = both(room, presence);
  if (room.status === 'disconnected' && together) {
    room.status = room.state.phase === 'finished' ? 'finished' : room.pausedBy !== null ? 'paused' : 'playing';
    if (room.status === 'playing') restartFaceoff(room);
    room.simTime = now;
    touch(room, now);
  }
  // Both votes may have arrived across a disconnect. Reconnection must not
  // strand two disabled rematch buttons.
  if (room.status === 'finished' && together && room.players.every(player => player?.ready)) {
    freshMatch(room, now);
    room.status = 'playing';
    touch(room, now);
  }
}

export type Input = { seq: number; target?: Vec2; action?: RoomAction };

export function parseInput(value: unknown): Input | null {
  if (!value || typeof value !== 'object') return null;
  const data = value as Record<string, unknown>;
  if (!Number.isSafeInteger(data.s) || (data.s as number) < 0) return null;
  if (data.t === 'in') {
    if (typeof data.x !== 'number' || typeof data.y !== 'number' || !Number.isFinite(data.x) || !Number.isFinite(data.y)
      || Math.abs(data.x) > 1000 || Math.abs(data.y) > 1000) return null;
    return { seq: data.s as number, target: { x: data.x, y: data.y } };
  }
  const allowed: RoomAction[] = ['rematch', 'leave', 'pause', 'resume'];
  if (data.t === 'act' && allowed.includes(data.a as RoomAction)) return { seq: data.s as number, action: data.a as RoomAction };
  return null;
}

/** Apply one seat's input. Late or repeated sequence numbers are ignored. */
export function applyInput(room: RoomRecord, side: Side, input: Input, now: number, presence: Presence): void {
  const player = room.players[side];
  if (!player) return;
  // Advance only using previously accepted inputs. A late packet cannot rewrite a goal.
  advance(room, now, presence);
  if (input.seq <= player.lastSeq) return;
  player.lastSeq = input.seq;
  if (input.target) room.targets[side] = clampTarget(side, input.target);
  if (input.action) applyAction(room, side, input.action, now, presence);
}

/** A seat's room action (pause, resume, rematch, leave), without a sequence number. */
export function applyAction(room: RoomRecord, side: Side, action: RoomAction, now: number, presence: Presence): void {
  const player = room.players[side];
  if (!player) return;
  advance(room, now, presence);
  if (action === 'leave') { player.left = true; player.ready = false; if (room.status !== 'waiting') room.status = 'disconnected'; }
  if (action === 'pause' && room.status === 'playing') { room.status = 'paused'; room.pausedBy = side; }
  if (action === 'resume' && room.status === 'paused' && both(room, presence)) {
    room.pausedBy = null; room.status = 'playing'; room.simTime = now; restartFaceoff(room);
  }
  if (action === 'rematch' && room.status === 'finished') player.ready = true;
  touch(room, now);
  settle(room, now, presence);
}

/** Mark a returning seat as present again after a reconnect. */
export function rejoin(room: RoomRecord, side: Side, now: number): void {
  const player = room.players[side];
  if (player?.left) { player.left = false; touch(room, now); }
}
