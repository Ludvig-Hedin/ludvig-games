import { createGame, serveGame, stepGame } from "../game/engine.js";

// Pure room rules. The Durable Object in room-do.ts owns one Room per code,
// feeds it socket input and calls `advance` on a 12 Hz loop while a match is
// live. Everything here is synchronous so it runs in Node tests unchanged.

export const ROOM_LIFETIME = 2 * 60 * 60 * 1000;
export const DISCONNECT_AFTER = 6000;
const INPUT_EXPIRES = 450;
const DEFAULT_INPUT = { x: 0, depth: 1.58, aim: 0, power: .48, spin: "flat", swing: false, serve: false };
const SPINS = new Set(["flat", "top", "back", "left", "right"]);
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export type Side = 0 | 1;
export type Input = typeof DEFAULT_INPUT;
export type Player = { token: string; name: string; inputAt: number; seq: number; input: Input; servePressed: boolean; left: boolean };
export type Room = {
  code: string; status: "waiting" | "playing" | "finished"; players: [Player | null, Player | null];
  state: any; bestOf: number; lastTick: number; createdAt: number; updatedAt: number;
  rematch: boolean[]; round: number; suspended: boolean;
};
export type Action = "start" | "rematch" | "leave" | "resume";
/** Whether a seat has a live, recently heard-from socket. */
export type Presence = (side: Side) => boolean;

export class RoomError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}

export const MESSAGES = {
  notFound: "No room with that code. It may have expired. Check the code or start a new room.",
  full: "This room is full. Start a new room to play.",
  session: "Your place in this room has expired. Join again with the code.",
  started: "This match has already started. Start a new room to play.",
} as const;

export const cleanName = (value: unknown) => String(value ?? "Player").normalize("NFKC").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 20) || "Player";
const number = (value: unknown, low: number, high: number, fallback: number) => typeof value === "number" && Number.isFinite(value) ? Math.max(low, Math.min(high, value)) : fallback;

export function sanitizeInput(value: any = {}): Input {
  return { x: number(value.x, -1.15, 1.15, 0), depth: number(value.depth, 1.35, 1.95, 1.58), aim: number(value.aim, -1, 1, 0), power: number(value.power, 0, 1, .48), spin: SPINS.has(value.spin) ? value.spin : "flat", swing: value.swing === true, serve: value.serve === true };
}

export function isRoomCode(code: string) { return /^[A-HJ-NP-Z2-9]{6}$/.test(code); }
export function makeCode() { return Array.from(crypto.getRandomValues(new Uint8Array(6)), v => ALPHABET[v % 32]).join(""); }
function makeToken() { return Array.from(crypto.getRandomValues(new Uint8Array(32)), v => v.toString(16).padStart(2, "0")).join(""); }
function newPlayer(name: unknown, now: number): Player { return { name: cleanName(name), token: makeToken(), inputAt: now, seq: -1, input: { ...DEFAULT_INPUT }, servePressed: false, left: false }; }
const seed = () => crypto.getRandomValues(new Uint32Array(1))[0];

export const expired = (room: Room, now: number) => now - room.updatedAt > ROOM_LIFETIME;
const touch = (room: Room, now: number) => { room.updatedAt = now; };
const together = (room: Room, presence: Presence) => room.players.every((p, side) => p && !p.left && presence(side as Side));

export function createRoom(code: string, name: unknown, bestOf: unknown, now: number) {
  const format = typeof bestOf === "number" && [3, 5, 7].includes(bestOf) ? bestOf : 3;
  const host = newPlayer(name, now);
  const room: Room = {
    code, status: "waiting", players: [host, null], state: createGame({ mode: "online", bestOf: format, seed: seed() }),
    bestOf: format, lastTick: now, createdAt: now, updatedAt: now, rematch: [false, false], round: 1, suspended: false,
  };
  return { room, token: host.token };
}

export function authenticate(room: Room, token: unknown): Side | null {
  if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token)) return null;
  const side = room.players.findIndex(p => p?.token === token);
  return side < 0 ? null : side as Side;
}

/** Take the free guest seat, or the seat of a player who explicitly left. */
export function joinRoom(room: Room, name: unknown, now: number): { side: Side; token: string } {
  const abandoned = room.players.findIndex(p => p?.left);
  if (!room.players[1]) {
    if (room.status !== "waiting") throw new RoomError(MESSAGES.started, 409);
    const guest = newPlayer(name, now);
    room.players[1] = guest;
    touch(room, now);
    return { side: 1, token: guest.token };
  }
  if (abandoned < 0) throw new RoomError(MESSAGES.full, 409);
  // Someone left: start over in the lobby with the newcomer in that seat.
  const player = newPlayer(name, now);
  room.players[abandoned] = player;
  room.status = "waiting";
  room.state = createGame({ mode: "online", bestOf: room.bestOf, seed: seed() });
  room.round += 1;
  room.rematch = [false, false];
  room.suspended = false;
  room.lastTick = now;
  touch(room, now);
  return { side: abandoned as Side, token: player.token };
}

export function rejoin(room: Room, side: Side, now: number) {
  const player = room.players[side];
  if (player?.left) { player.left = false; touch(room, now); }
}

function activeInput(player: Player | null, now: number): Input {
  if (!player) return { ...DEFAULT_INPUT };
  // Serve is an acknowledged action, never a held control replayed by physics.
  return { ...player.input, swing: player.input.swing && now - player.inputAt < INPUT_EXPIRES, serve: false };
}

/** Advance the authoritative match up to `now` with previously accepted input. */
export function advance(room: Room, now: number, presence: Presence) {
  const previousTick = room.lastTick;
  room.lastTick = now;
  if (room.status !== "playing") return;
  const present = together(room, presence);
  if (room.suspended !== !present) { room.suspended = !present; touch(room, now); }
  if (!present) return;
  // Split at engine limits and control-expiry boundaries, so a late tick
  // neither discards an earlier swing nor extends it through the whole gap.
  let cursor = Math.max(previousTick, now - 1000);
  while (cursor < now) {
    let end = Math.min(now, cursor + 500);
    for (const player of room.players) {
      const expiry = player!.inputAt + INPUT_EXPIRES;
      if (expiry > cursor && expiry < end) end = expiry;
    }
    stepGame(room.state, room.players.map(p => activeInput(p, cursor)), (end - cursor) / 1000);
    cursor = end;
  }
  if (room.state.phase === "matchover") { room.status = "finished"; touch(room, now); }
}

/** One seat's controls. Late or repeated sequence numbers are ignored. */
export function applyInput(room: Room, side: Side, seq: unknown, raw: unknown, now: number, presence: Presence) {
  const player = room.players[side];
  if (!player || !Number.isSafeInteger(seq) || (seq as number) <= player.seq) return;
  advance(room, now, presence);
  const input = sanitizeInput(raw);
  const servePressed = input.serve && !player.servePressed;
  player.servePressed = input.serve;
  player.input = { ...input, serve: false };
  player.inputAt = now;
  player.seq = seq as number;
  // Consume a new serve once, at acceptance time after prior time was simulated.
  if (servePressed && room.status === "playing" && together(room, presence)) serveGame(room.state, side);
}

export function applyAction(room: Room, side: Side, action: Action, now: number, presence: Presence) {
  const player = room.players[side];
  if (!player) throw new RoomError(MESSAGES.session, 401);
  advance(room, now, presence);
  if (action === "start") {
    if (side !== 0) throw new RoomError("The host starts the match.", 403);
    if (room.status !== "waiting") throw new RoomError("The match has already started.", 409);
    const guest = room.players[1];
    if (!guest || guest.left || !presence(1)) throw new RoomError("Wait for your friend to join.", 409);
    room.status = "playing";
    room.lastTick = now;
    room.suspended = false;
  } else if (action === "resume") {
    player.input = { ...player.input, swing: false, serve: false };
    player.servePressed = false;
    player.inputAt = now;
    player.seq = -1;
  } else if (action === "rematch") {
    if (room.status !== "finished") throw new RoomError("Finish the current match first.", 409);
    room.rematch[side] = true;
    if (room.rematch.every(Boolean) && together(room, presence)) restart(room, now);
  } else if (action === "leave") {
    player.input = { ...player.input, swing: false, serve: false };
    player.servePressed = false;
    if (room.status === "waiting" && side === 1) room.players[1] = null;
    else { player.left = true; if (room.status === "playing") room.suspended = true; }
  }
  touch(room, now);
}

/** Rematch votes may arrive across a drop; restart once both are back. */
export function settle(room: Room, now: number, presence: Presence) {
  if (room.status === "finished" && room.rematch.every(Boolean) && together(room, presence)) restart(room, now);
}

function restart(room: Room, now: number) {
  room.state = createGame({ mode: "online", bestOf: room.bestOf, seed: seed() });
  room.status = "playing";
  room.round += 1;
  room.rematch = [false, false];
  room.lastTick = now;
  room.suspended = false;
  room.players.forEach(p => { if (p) { p.input = { ...DEFAULT_INPUT }; p.inputAt = now; p.servePressed = false; p.seq = -1; } });
  touch(room, now);
}

const round = (v: number) => Math.round(v * 1e5) / 1e5;
const compactBody = (body: Record<string, any>) => Object.fromEntries(Object.entries(body).map(([k, v]) => [k, typeof v === "number" && !Number.isInteger(v) ? round(v) : v]));

/** What one seat sees. Never contains seat tokens. Events are only those after `since`. */
export function publicRoom(room: Room, side: Side, now: number, presence: Presence, since = 0) {
  const state = room.state;
  const players = room.players.map((p, seat) => p ? { name: p.name, connected: !p.left && presence(seat as Side), left: p.left } : null);
  return {
    code: room.code, revision: room.updatedAt, side, status: room.status,
    state: { ...state, ball: compactBody(state.ball), paddles: state.paddles.map(compactBody), events: state.events.filter((e: any) => e.id > since) },
    players, bestOf: room.bestOf, serverTime: now, inputs: room.players.map(p => p ? p.input : { ...DEFAULT_INPUT }),
    suspended: room.suspended, rematchVotes: room.rematch, round: room.round, ackSeq: room.players[side]?.seq ?? -1,
  };
}
