import { applyMove, createGame } from "../public/game/engine.js";

type Variant = "3d" | "classic";
type Seat = 0 | 1 | 2;
type Player = { name: string; tokenHash: string };
type Game = ReturnType<typeof createGame>;
type Room = {
  code: string;
  variant: Variant;
  bestOf: 1 | 3 | 5;
  version: number;
  game: Game;
  players: [Player | null, Player | null];
  scores: [number, number];
  round: number;
  ready: [boolean, boolean];
  matchWinner: null | 0 | 1 | 2;
  status: "waiting" | "playing" | "finished";
};
type Row = { state: string; version: number; expires_at: number; last_seen_1: number; last_seen_2: number };
export type PublicRoom = Omit<Room, "players"> & { players: [{name: string; connected: boolean} | null, {name: string; connected: boolean} | null] };
export type RoomEnvelope = { code: string; seat: Seat; room: PublicRoom; token?: string };
const ROOM_TTL = 24 * 60 * 60 * 1000;
const PRESENCE_TTL = 20_000;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
// A poll writes "last seen" at most this often (Workers Free write budget). Presence lasts 20 s.
const SEEN_WRITE_MS = 12_000;
// Global cap on live rooms, so a flood cannot use up the free D1 write budget.
export const MAX_ROOMS = 300;
type Limiter = { limit(options: { key: string }): Promise<{ success: boolean }> };
/** Per-IP limit in the Workers rate-limit binding; a refused request never touches D1. Missing in tests and plain local dev. */
export async function rateLimit(request: Request, limiter: Limiter | undefined): Promise<void> {
  const ip = request.headers.get("cf-connecting-ip");
  if (!limiter || !ip) return;
  if (!(await limiter.limit({ key: ip })).success) throw new RoomError(429, "The room server is temporarily unavailable. Please try again.");
}
const TOKEN_FORMAT = /^[A-Za-z0-9_-]{48}$/;
/** A malformed room key is refused before any D1 read. */
function checkToken(token?: string) {
  if (token && !TOKEN_FORMAT.test(token)) throw new RoomError(401, "Your room key is invalid. Rejoin with the room code.");
}

export class RoomError extends Error {
  status: number;
  room?: PublicRoom;
  constructor(status: number, message: string, room?: PublicRoom) {
    super(message);
    this.name = "RoomError";
    this.status = status;
    this.room = room;
  }
}

function nameOf(value: unknown): string {
  if (typeof value !== "string") throw new RoomError(400, "Enter a player name.");
  const clean = value.replace(/[\u0000-\u001f\u007f-\u009f]/g, "").trim().slice(0, 24);
  if (!clean) throw new RoomError(400, "Enter a player name.");
  return clean;
}

export function normalizeRoomCode(value: unknown): string {
  if (typeof value !== "string") throw new RoomError(400, "Enter a six-character room code.");
  const clean = value.trim().toUpperCase();
  if (!/^[A-HJ-NP-Z2-9]{6}$/.test(clean)) throw new RoomError(400, "Enter a valid six-character room code.");
  return clean;
}

function randomString(length: number, alphabet: string): string {
  const result: string[] = [];
  const limit = 256 - (256 % alphabet.length);
  while (result.length < length) {
    const bytes = crypto.getRandomValues(new Uint8Array(length * 2));
    for (const byte of bytes) {
      if (byte < limit) result.push(alphabet[byte % alphabet.length]);
      if (result.length === length) break;
    }
  }
  return result.join("");
}

function newToken(): string {
  return randomString(48, "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_");
}

async function hashToken(token: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function seatOf(room: Room, token?: string): Promise<Seat> {
  if (!token) return 0;
  checkToken(token);
  const hash = await hashToken(token);
  const index = room.players.findIndex((player) => player?.tokenHash === hash);
  if (index < 0) throw new RoomError(403, "This room key does not belong to a player in this room.");
  return (index + 1) as Seat;
}

function readState(row: Row): Room {
  const room = JSON.parse(row.state) as Room;
  room.version = row.version;
  return room;
}

function publicRoom(room: Room, row: Row, now = Date.now()): PublicRoom {
  return {
    ...room,
    players: room.players.map((p, index) => p ? {
      name: p.name,
      connected: now - (index === 0 ? row.last_seen_1 : row.last_seen_2) < PRESENCE_TTL,
    } : null) as PublicRoom["players"],
  };
}

async function findRow(db: D1Database, code: string): Promise<Row> {
  const row = await db.prepare("SELECT state, version, expires_at, last_seen_1, last_seen_2 FROM arena_rooms WHERE code = ?").bind(code).first<Row>();
  if (!row || row.expires_at < Date.now()) throw new RoomError(404, "This room has expired or does not exist.");
  return row;
}

async function touch(db: D1Database, code: string, row: Row, seat: Seat): Promise<void> {
  if (!seat) return;
  const field = seat === 1 ? "last_seen_1" : "last_seen_2";
  const now = Date.now();
  if (now - row[field] > SEEN_WRITE_MS) {
    await db.prepare(`UPDATE arena_rooms SET ${field} = ?, expires_at = ? WHERE code = ?`).bind(now, now + ROOM_TTL, code).run();
  }
  row[field] = now;
}

async function commit(db: D1Database, previous: Room, next: Room, row: Row, seat: Seat): Promise<RoomEnvelope> {
  const now = Date.now();
  next.version = previous.version + 1;
  // Only game-changing actions advance the revision; heartbeats do not.
  const result = await db.prepare("UPDATE arena_rooms SET state = ?, version = ?, updated_at = ?, expires_at = ? WHERE code = ? AND version = ?")
    .bind(JSON.stringify(next), next.version, now, now + ROOM_TTL, next.code, previous.version).run();
  if (result.meta.changes !== 1) {
    const latest = await findRow(db, next.code);
    throw new RoomError(409, "The room changed. Your board has been refreshed; try again.", publicRoom(readState(latest), latest));
  }
  await touch(db, next.code, row, seat);
  return { code: next.code, seat, room: publicRoom(next, row) };
}

export async function createRoomRecord(db: D1Database, input: Record<string, unknown>): Promise<RoomEnvelope> {
  const name = nameOf(input.name);
  if (input.variant !== "3d" && input.variant !== "classic") throw new RoomError(400, "Choose 3D or Classic.");
  if (![1, 3, 5].includes(Number(input.bestOf))) throw new RoomError(400, "Choose a single game, best of three, or best of five.");
  const token = newToken();
  const tokenHash = await hashToken(token);
  const now = Date.now();
  const live = await db.prepare("SELECT COUNT(*) AS n FROM arena_rooms WHERE expires_at >= ?").bind(now).first<{ n: number }>();
  if ((live?.n ?? 0) >= MAX_ROOMS) throw new RoomError(503, "Could not reserve a room. Please try again.");
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomString(6, CODE_ALPHABET);
    const room: Room = {
      code, variant: input.variant, bestOf: Number(input.bestOf) as 1 | 3 | 5, version: 1,
      game: createGame(input.variant), players: [{name, tokenHash}, null], scores: [0, 0],
      round: 1, ready: [false, false], matchWinner: null, status: "waiting",
    };
    const result = await db.prepare("INSERT OR IGNORE INTO arena_rooms (code, version, state, created_at, updated_at, expires_at, last_seen_1, last_seen_2) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(code, 1, JSON.stringify(room), now, now, now + ROOM_TTL, now, 0).run();
    if (result.meta.changes === 1) {
      // Bounded cleanup of expired rooms after a create; writes only when some exist.
      await db.prepare("DELETE FROM arena_rooms WHERE code IN (SELECT code FROM arena_rooms WHERE expires_at < ? LIMIT 50)").bind(now).run().catch(() => {});
      const row: Row = {state: JSON.stringify(room), version: 1, expires_at: now + ROOM_TTL, last_seen_1: now, last_seen_2: 0};
      return { code, token, seat: 1, room: publicRoom(room, row) };
    }
  }
  throw new RoomError(503, "Could not reserve a room. Please try again.");
}

export async function getRoomRecord(db: D1Database, rawCode: string, token?: string): Promise<RoomEnvelope> {
  const code = normalizeRoomCode(rawCode);
  checkToken(token);
  const row = await findRow(db, code);
  const room = readState(row);
  const seat = await seatOf(room, token);
  await touch(db, code, row, seat);
  return {code, seat, room: publicRoom(room, row)};
}

export async function actOnRoom(db: D1Database, rawCode: string, token: string | undefined, input: Record<string, unknown>): Promise<RoomEnvelope> {
  const code = normalizeRoomCode(rawCode);
  checkToken(token);
  const row = await findRow(db, code);
  const room = readState(row);
  const seat = await seatOf(room, token);
  const next = structuredClone(room);
  const action = input.action;

  if (action === "join") {
    if (seat) {
      await touch(db, code, row, seat);
      return {code, seat, room: publicRoom(room, row)};
    }
    if (input.spectate === true) return {code, seat: 0, room: publicRoom(room, row)};
    if (room.players[1]) throw new RoomError(409, "This room already has two players. You can join as a spectator.", publicRoom(room, row));
    const newSeatToken = newToken();
    next.players[1] = {name: nameOf(input.name), tokenHash: await hashToken(newSeatToken)};
    next.status = "playing";
    const response = await commit(db, room, next, row, 2);
    response.token = newSeatToken;
    return response;
  }

  if (!seat) throw new RoomError(403, "Spectators cannot play or restart a match.");

  if (action === "reconnect") {
    await touch(db, code, row, seat);
    return {code, seat, room: publicRoom(room, row)};
  }

  if (action === "leave") {
    const field = seat === 1 ? "last_seen_1" : "last_seen_2";
    await db.prepare(`UPDATE arena_rooms SET ${field} = 0 WHERE code = ?`).bind(code).run();
    row[field] = 0;
    return {code, seat, room: publicRoom(room, row)};
  }

  if (input.version !== room.version) throw new RoomError(409, "The room changed. Your board has been refreshed; try again.", publicRoom(room, row));

  if (action === "move") {
    if (room.status !== "playing" || room.game.winner !== null) throw new RoomError(409, room.status === "waiting" ? "Waiting for the second player." : "This round is finished.", publicRoom(room, row));
    if (room.game.turn !== seat) throw new RoomError(403, "It is the other player's turn.");
    if (!Number.isInteger(input.stack)) throw new RoomError(400, "Choose an available stack.");
    try { next.game = applyMove(room.game, input.stack as number); }
    catch { throw new RoomError(400, "That stack is full or unavailable."); }
    if (next.game.winner !== null) {
      next.status = "finished";
      next.ready = [false, false];
      if (next.game.winner === 1 || next.game.winner === 2) {
        const winner = next.game.winner as 1 | 2;
        next.scores[winner - 1]++;
        if (next.scores[winner - 1] >= Math.ceil(next.bestOf / 2)) next.matchWinner = winner;
      } else if (next.bestOf === 1) {
        next.matchWinner = 0;
      }
    }
    return commit(db, room, next, row, seat);
  }

  if (action === "ready") {
    if (room.status !== "finished") throw new RoomError(409, "Finish this round before starting another.", publicRoom(room, row));
    if (room.ready[seat - 1]) return {code, seat, room: publicRoom(room, row)};
    next.ready[seat - 1] = true;
    if (next.ready.every(Boolean)) {
      const newMatch = room.matchWinner !== null;
      next.game = createGame(room.variant, room.game.startingPlayer === 1 ? 2 : 1);
      next.status = "playing";
      next.scores = newMatch ? [0, 0] : room.scores;
      next.round = newMatch ? 1 : room.round + 1;
      next.matchWinner = null;
      next.ready = [false, false];
    }
    return commit(db, room, next, row, seat);
  }

  throw new RoomError(400, "Unknown room action.");
}

export function roomErrorResponse(error: unknown): Response {
  const known = error instanceof RoomError;
  if (!known) console.error("Room request failed", error);
  return Response.json({ error: known ? error.message : "The room server is temporarily unavailable. Please try again.", ...(known && error.room ? {room: error.room} : {}) }, {
    status: known ? error.status : 503,
    headers: {"Cache-Control": "no-store"},
  });
}

export async function readRoomBody(request: Request): Promise<Record<string, unknown>> {
  if (Number(request.headers.get("content-length") || 0) > 4096) throw new RoomError(413, "Request too large.");
  const text = await request.text();
  if (text.length > 4096) throw new RoomError(413, "Request too large.");
  let body;
  try { body = JSON.parse(text); } catch { throw new RoomError(400, "Invalid request."); }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new RoomError(400, "Invalid request.");
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) throw new RoomError(403, "Cross-origin room requests are not allowed.");
  return body;
}

export function roomToken(request: Request): string | undefined {
  const header = request.headers.get("authorization");
  if (!header) return undefined;
  if (!header.startsWith("Bearer ")) throw new RoomError(401, "Invalid room key.");
  return header.slice(7);
}
