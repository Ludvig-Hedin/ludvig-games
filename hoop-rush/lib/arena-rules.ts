import { simulateShot } from "./physics.mjs";

// Authoritative rules for one private 1v1 room. Pure functions over a plain
// Room object: the Durable Object in arena-room.ts owns the only copy, so
// every call runs one at a time and no compare-and-swap is needed. Browsers
// send aim and power only; the server times, simulates and scores each shot.

export type Seat = 0 | 1;
export type Status = "waiting" | "countdown" | "playing" | "settling" | "finished";
export type Player = { name: string; tokenHash: string; ready: boolean; lastSeen: number; lastShot: number; left: boolean };
export type Shot = {
  id: string; seat: Seat; aim: number; power: number; shotAt: number;
  scoreAt: number | null; resolvedAt: number; scored: boolean; swish: boolean; points: number;
};
export type Room = {
  code: string; status: Status; round: number; players: [Player | null, Player | null];
  startAt: number; endAt: number; settleAt: number; duration: number;
  baseScores: [number, number]; baseShots: [number, number]; events: Shot[];
  baseMade: [number, number]; baseCombo: [number, number]; baseMaxCombo: [number, number];
  shotIds: string[];
  winner: Seat | null; resultReason: "score" | "forfeit" | "disconnect" | "draw" | null;
  finishedAt: number | null;
  overtime: number; emptyOvertimes: number; createdAt: number; expiresAt: number;
};
export type Presence = (seat: Seat) => boolean;
type Simulate = typeof simulateShot;

export const ROOM_LIFETIME = 24 * 60 * 60 * 1000;
export const SHOT_RECOVERY = 420;
/** A seat that has been away this long during a live match loses by disconnect. */
export const ABANDON_AFTER = 20000;
/** In the lobby, a seat away this long can be taken by someone new. */
export const LOBBY_REPLACE_AFTER = 8000;
const MAX_SHOT_IDS = 600;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export const MESSAGES = {
  notFound: "No room with that code.",
  expired: "That room has expired.",
  full: "That room is full.",
  started: "That match has already started.",
  session: "That room session has ended.",
  closed: "Wait for the countdown.",
  recovering: "Your next ball is not ready yet.",
  badShot: "That shot could not be sent.",
} as const;

export class ArenaError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function randomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join("");
}

export function isRoomCode(value: unknown): value is string {
  return typeof value === "string" && /^[A-HJ-NP-Z2-9]{6}$/.test(value);
}

function randomToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function hashToken(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function cleanName(value: unknown, seat: Seat) {
  const name = typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f<>]/g, "").trim().slice(0, 18) : "";
  return name || `Player ${seat + 1}`;
}

function newPlayer(name: unknown, seat: Seat, tokenHash: string, now: number): Player {
  return { name: cleanName(name, seat), tokenHash, ready: false, lastSeen: now, lastShot: 0, left: false };
}

export async function createRoom(code: string, name: unknown, now: number) {
  const token = randomToken();
  const room: Room = {
    code, status: "waiting", round: 1,
    players: [newPlayer(name, 0, await hashToken(token), now), null],
    startAt: 0, endAt: 0, settleAt: 0, duration: 60,
    baseScores: [0, 0], baseShots: [0, 0], baseMade: [0, 0], baseCombo: [0, 0], baseMaxCombo: [0, 0],
    events: [], shotIds: [],
    winner: null, resultReason: null, finishedAt: null, overtime: 0, emptyOvertimes: 0,
    createdAt: now, expiresAt: now + ROOM_LIFETIME,
  };
  return { room, token, seat: 0 as Seat };
}

/** Takes a free seat, or a lobby seat whose player has been gone for a while. */
export async function joinRoom(room: Room, name: unknown, now: number, present: Presence) {
  if (room.status !== "waiting") throw new ArenaError(409, "match_started", MESSAGES.started);
  const away = (seat: Seat) => {
    const player = room.players[seat];
    return !player || player.left || (!present(seat) && now - player.lastSeen > LOBBY_REPLACE_AFTER);
  };
  const seat: Seat | null = !room.players[0] ? 0 : !room.players[1] ? 1 : away(1) ? 1 : away(0) ? 0 : null;
  if (seat === null) throw new ArenaError(409, "room_full", MESSAGES.full);
  const token = randomToken();
  room.players[seat] = newPlayer(name, seat, await hashToken(token), now);
  for (const player of room.players) if (player) player.ready = false;
  return { seat, token };
}

export async function authenticate(room: Room, token: unknown): Promise<Seat | null> {
  if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token)) return null;
  const tokenHash = await hashToken(token);
  if (room.players[0]?.tokenHash === tokenHash && !room.players[0].left) return 0;
  if (room.players[1]?.tokenHash === tokenHash && !room.players[1].left) return 1;
  return null;
}

/** Keeps lastSeen current for seats with a live socket. */
export function touch(room: Room, now: number, present: Presence) {
  for (const seat of [0, 1] as Seat[]) {
    const player = room.players[seat];
    if (player && !player.left && present(seat)) player.lastSeen = now;
  }
}

function outcomeClock(room: Room, now: number) {
  return room.status === "finished" && typeof room.finishedAt === "number" ? Math.min(now, room.finishedAt) : now;
}

function scoreOf(room: Room, now: number): [number, number] {
  now = outcomeClock(room, now);
  const scores: [number, number] = [...room.baseScores];
  for (const shot of room.events) {
    if (shot.scored && shot.scoreAt !== null && shot.scoreAt <= now) scores[shot.seat] += shot.points;
  }
  return scores;
}

function shotsOf(room: Room): [number, number] {
  const counts: [number, number] = [...room.baseShots];
  for (const shot of room.events) counts[shot.seat]++;
  return counts;
}

function statsOf(room: Room, now: number) {
  now = outcomeClock(room, now);
  const made: [number, number] = [...room.baseMade];
  const combo: [number, number] = [...room.baseCombo];
  const maxCombo: [number, number] = [...room.baseMaxCombo];
  const pending = [false, false];
  // Streaks follow release order, not the order differently arced balls land.
  // An unresolved earlier shot blocks streak processing so a pending miss is
  // never revealed early and a later make cannot overstate the streak.
  const releases = [...room.events].sort((left, right) => left.shotAt - right.shotAt);
  for (const shot of releases) {
    const isMade = shot.scored && shot.scoreAt !== null && shot.scoreAt <= now;
    if (isMade) made[shot.seat]++;
    if (pending[shot.seat]) continue;
    if (shot.resolvedAt > now) { pending[shot.seat] = true; continue; }
    combo[shot.seat] = isMade ? combo[shot.seat] + 1 : 0;
    maxCombo[shot.seat] = Math.max(maxCombo[shot.seat], combo[shot.seat]);
  }
  return { made, combo, maxCombo };
}

function startRound(room: Room, now: number) {
  room.status = "countdown";
  room.startAt = now + 3000;
  room.duration = 60;
  room.endAt = room.startAt + room.duration * 1000;
  room.settleAt = room.endAt + 3000;
  room.baseScores = [0, 0]; room.baseShots = [0, 0];
  room.baseMade = [0, 0]; room.baseCombo = [0, 0]; room.baseMaxCombo = [0, 0];
  room.events = []; room.shotIds = [];
  room.overtime = 0; room.emptyOvertimes = 0;
  room.winner = null; room.resultReason = null; room.finishedAt = null;
  for (const player of room.players) if (player) player.lastShot = 0;
}

function finish(room: Room, now: number, winner: Seat | null, reason: Room["resultReason"]) {
  room.status = "finished";
  room.finishedAt = now;
  room.winner = winner;
  room.resultReason = reason;
  for (const player of room.players) if (player) player.ready = false;
}

const live = (room: Room) => room.status === "countdown" || room.status === "playing" || room.status === "settling";
const connectedAt = (room: Room, seat: Seat, now: number) => {
  const player = room.players[seat];
  return !!player && !player.left && now - player.lastSeen < ABANDON_AFTER;
};

// Deterministic for a given room and server time. Call touch() first so
// lastSeen reflects the sockets that are open right now.
export function advance(room: Room, now: number) {
  const before = room.status;
  if (room.status === "finished") {
    // A friend who closed the game after the result cannot be waited for.
    let changed = false;
    for (const seat of [0, 1] as Seat[]) {
      const player = room.players[seat];
      if (player && !player.left && now - player.lastSeen >= ABANDON_AFTER) { player.left = true; player.ready = false; changed = true; }
    }
    return changed;
  }
  if (live(room)) {
    const connected = [connectedAt(room, 0, now), connectedAt(room, 1, now)];
    if (connected[0] !== connected[1]) {
      finish(room, now, connected[0] ? 0 : 1, "disconnect");
      return true;
    }
  }
  if (room.status === "countdown" && now >= room.startAt) room.status = "playing";
  if (room.status === "playing" && room.overtime > 0) {
    let firstBasket = Infinity;
    for (const shot of room.events) {
      if (shot.scored && shot.scoreAt !== null && shot.scoreAt <= now) firstBasket = Math.min(firstBasket, shot.scoreAt);
    }
    if (firstBasket < room.endAt) {
      // Sudden death closes new shots at the first real hoop crossing.
      // Balls already released get their actual flight time to finish.
      room.endAt = firstBasket;
      room.settleAt = Math.max(firstBasket + 3000, ...room.events.map((shot) => shot.resolvedAt + 100));
    }
  }
  if (room.status === "playing" && now >= room.endAt) room.status = "settling";
  if (room.status === "settling" && now >= room.settleAt) {
    const scores = scoreOf(room, now);
    const connected = [connectedAt(room, 0, now), connectedAt(room, 1, now)];
    if (room.overtime > 0) room.emptyOvertimes = room.events.some((shot) => shot.scored) ? 0 : room.emptyOvertimes + 1;
    if (scores[0] !== scores[1]) {
      finish(room, now, scores[0] > scores[1] ? 0 : 1, "score");
    } else if (connected[0] && connected[1] && room.emptyOvertimes < 2) {
      // Every last-period shot has settled before another period begins.
      const stats = statsOf(room, now);
      room.baseScores = scores;
      room.baseShots = shotsOf(room);
      room.baseMade = stats.made; room.baseCombo = stats.combo; room.baseMaxCombo = stats.maxCombo;
      room.events = [];
      room.overtime++;
      room.duration = 15;
      room.startAt = now + 3000;
      room.endAt = room.startAt + 15000;
      room.settleAt = room.endAt + 3000;
      room.status = "countdown";
    } else {
      finish(room, now, null, "draw");
    }
    return true;
  }
  return room.status !== before;
}

function validShot(body: Record<string, unknown>) {
  if (typeof body.id !== "string" || !/^[A-Za-z0-9_-]{6,80}$/.test(body.id)) return null;
  if (typeof body.aim !== "number" || !Number.isFinite(body.aim) || body.aim < -1 || body.aim > 1) return null;
  if (typeof body.power !== "number" || !Number.isFinite(body.power) || body.power < 0.12 || body.power > 1) return null;
  // No other browser field (score, timestamps, velocity, result) is read.
  return { id: body.id, aim: body.aim, power: body.power };
}

/** Returns "duplicate" for a replayed shot ID; throws ArenaError when rejected. */
export function shoot(room: Room, seat: Seat, body: Record<string, unknown>, now: number, simulate: Simulate = simulateShot) {
  const input = validShot(body);
  if (!input) throw new ArenaError(400, "invalid_shot", MESSAGES.badShot);
  if (body.round !== undefined && body.round !== room.round) throw new ArenaError(409, "stale_round", MESSAGES.closed);
  if (body.overtime !== undefined && body.overtime !== room.overtime) throw new ArenaError(409, "stale_period", MESSAGES.closed);
  if (room.shotIds.includes(`${seat}:${input.id}`)) return "duplicate" as const;
  if (room.status !== "playing" || now < room.startAt || now >= room.endAt) throw new ArenaError(409, "shooting_closed", MESSAGES.closed);
  const player = room.players[seat]!;
  if (now - player.lastShot < SHOT_RECOVERY) throw new ArenaError(429, "ball_not_ready", MESSAGES.recovering);
  const simulated = simulate({ aim: input.aim, power: input.power, shotTime: (now - room.startAt) / 1000, challenge: "classic" });
  const scoreTime = simulated.scoreTime;
  const validScore = simulated.scored && typeof scoreTime === "number" && Number.isFinite(scoreTime) && scoreTime > 0 && scoreTime < 10;
  const flight = simulated.flightTime;
  const resolvedSeconds = validScore ? scoreTime! : typeof flight === "number" && Number.isFinite(flight) && flight > 0 ? Math.min(flight, 10) : 4.5;
  const shot: Shot = {
    id: input.id, seat, aim: input.aim, power: input.power, shotAt: now,
    scored: !!validScore,
    swish: !!(validScore && simulated.swish),
    scoreAt: validScore ? now + Math.round(scoreTime! * 1000) : null,
    resolvedAt: now + Math.round(resolvedSeconds * 1000),
    points: room.overtime === 0 && now >= room.endAt - 10000 ? 3 : 2,
  };
  room.events.push(shot);
  room.shotIds.push(`${seat}:${input.id}`);
  if (room.shotIds.length > MAX_SHOT_IDS) room.shotIds.splice(0, room.shotIds.length - MAX_SHOT_IDS);
  player.lastShot = now;
  room.settleAt = Math.max(room.settleAt, shot.resolvedAt + 100);
  return "accepted" as const;
}

export function setReady(room: Room, seat: Seat, now: number) {
  if (room.status !== "waiting") throw new ArenaError(409, "already_started", MESSAGES.started);
  room.players[seat]!.ready = true;
  if (room.players.every((player) => player?.ready && !player.left)) startRound(room, now);
}

export function rematch(room: Room, seat: Seat, now: number) {
  if (room.status !== "finished") throw new ArenaError(409, "match_not_finished", MESSAGES.started);
  room.players[seat]!.ready = true;
  if (room.players.every((player) => player?.ready && !player.left)) {
    room.round++;
    startRound(room, now);
  }
}

export function leave(room: Room, seat: Seat, now: number) {
  const player = room.players[seat]!;
  if (room.status === "waiting") {
    room.players[seat] = null;
    for (const other of room.players) if (other) other.ready = false;
    return;
  }
  // Pending balls stay visible, but outcomes are frozen at finishedAt.
  if (room.status !== "finished") finish(room, now, seat === 0 ? 1 : 0, "forfeit");
  player.left = true;
  player.ready = false;
}

export function expired(room: Room, now: number) {
  return room.expiresAt <= now;
}

/** Seat-independent public view. Never includes tokens or future outcomes. */
export function view(room: Room, now: number, present: Presence, shotWindow = 3000) {
  const visibleAt = outcomeClock(room, now);
  return {
    room: room.code,
    status: room.status,
    round: room.round,
    startAt: room.startAt,
    endAt: room.endAt,
    settleAt: room.settleAt,
    duration: room.duration,
    scores: scoreOf(room, now),
    shots: shotsOf(room),
    ...statsOf(room, now),
    players: room.players.map((player, seat) => player ? {
      name: player.name,
      ready: player.ready,
      left: player.left,
      connected: !player.left && present(seat as Seat),
    } : null),
    winner: room.winner,
    finishedAt: room.finishedAt,
    resultReason: room.resultReason,
    overtime: room.overtime,
    serverNow: now,
    recentShots: room.events.filter((shot) => shot.shotAt >= now - shotWindow).map((shot) => ({
      id: shot.id,
      seat: shot.seat,
      aim: shot.aim,
      power: shot.power,
      shotAt: shot.shotAt,
      scored: shot.scored && shot.scoreAt !== null && shot.scoreAt <= visibleAt,
    })),
  };
}

export type RoomView = ReturnType<typeof view>;

export function isLive(room: Room) {
  return live(room);
}
