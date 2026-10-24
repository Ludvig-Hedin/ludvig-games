import { newGame, placeFleet, fireShot, type Fleet, type GameState, type Player, type Shot } from "./game";

export type OnlinePlayer = { name: string; ready: boolean; connected: boolean };
export type OnlineState = {
  code: string;
  version: number;
  player: Player;
  phase: "waiting" | "placement" | "battle" | "finished";
  turn: Player;
  winner: Player | null;
  players: [OnlinePlayer | null, OnlinePlayer | null];
  ownFleet: Fleet | null;
  ownShots: Shot[];
  enemyShots: Shot[];
  opponentSunk: Fleet;
  rematch: [boolean, boolean];
  lastAction: { player: Player; shot: Shot } | null;
  opponentLeft: boolean;
};

type RoomData = {
  game: GameState;
  names: [string, string | null];
  rematch: [boolean, boolean];
  left: [boolean, boolean];
  requests: [string[], string[]];
  lastAction: { player: Player; shot: Shot } | null;
  lastMove: [number, number];
  round: number;
};
export type RoomRow = {
  code: string;
  version: number;
  data: string;
  p0_hash: string;
  p1_hash: string | null;
  p0_seen: number;
  p1_seen: number;
  created_at: number;
  updated_at: number;
  expires_at: number;
};

type DB = Pick<D1Database, "prepare" | "batch">;
/** Workers rate-limit binding (per IP). Missing in tests and plain local dev. */
export type Limiter = { limit(options: { key: string }): Promise<{ success: boolean }> };
export type Limits = { create?: Limiter; join?: Limiter };
export class RoomError extends Error {
  status: number;
  code: string;
  constructor(message: string, status = 400, code = "invalid_request") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const ROOM_LIFETIME = 24 * 60 * 60 * 1000;
// Global cap on live rooms, so a flood cannot fill the free D1 write budget.
export const MAX_ROOMS = 300;
// How often a poll may write a "last seen" time. "Connected" means seen in the last 30 s.
const SEEN_WRITE_MS = 15_000;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const headers = { "Content-Type": "application/json", "Cache-Control": "no-store, max-age=0", "X-Content-Type-Options": "nosniff" };
export function json(value: unknown, status = 200) { return new Response(JSON.stringify(value), { status, headers }); }
export function apiError(error: unknown) {
  if (error instanceof RoomError) return json({ error: error.message, code: error.code }, error.status);
  // The response never includes database errors, stored game state or bearer tokens.
  console.error("Room service error", error instanceof Error ? error.message : "Unknown error");
  return json({ error: "The room service is temporarily unavailable. Please try again.", code: "service_unavailable" }, 503);
}
export async function readBody(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw new RoomError("Send JSON to this endpoint.", 415);
  }
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) throw new RoomError("This request must come from the game.", 403);
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > 12_000) throw new RoomError("The request is too large.", 413);
  if (!request.body) throw new RoomError("Invalid JSON.");
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let text = "", bytes = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > 12_000) {
        await reader.cancel();
        throw new RoomError("The request is too large.", 413);
      }
      text += decoder.decode(part.value, { stream: true });
    }
    text += decoder.decode();
  } finally { reader.releaseLock(); }
  let result: unknown;
  try { result = JSON.parse(text); } catch { throw new RoomError("Invalid JSON."); }
  if (!result || typeof result !== "object" || Array.isArray(result)) throw new RoomError("Invalid request.");
  return result as Record<string, unknown>;
}
function normalizeName(name: unknown, fallback: string) {
  if (name === undefined || name === null || name === "") return fallback;
  if (typeof name !== "string") throw new RoomError("Enter a valid commander name.");
  const clean = name.replace(/[\u0000-\u001f\u007f-\u009f<>]/g, "").replace(/\s+/g, " ").trim();
  if (clean.length > 24) throw new RoomError("Keep your name under 25 characters.");
  return clean || fallback;
}
function normalizeCode(code: string) {
  const normalized = code.toUpperCase().replace(/[\s-]/g, "");
  if (!/^[A-HJ-NP-Z2-9]{6}$/.test(normalized)) throw new RoomError("Enter a valid six-character room code.", 400, "invalid_code");
  return normalized;
}
function secretToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), n => n.toString(16).padStart(2, "0")).join("");
}
function sessionToken(input: Record<string, unknown>) {
  if (input.resumeToken === undefined) return secretToken();
  if (typeof input.resumeToken !== "string" || !/^[a-f0-9]{64}$/.test(input.resumeToken)) throw new RoomError("Invalid room resume token.");
  return input.resumeToken;
}
async function hash(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, "0")).join("");
}
function roomCode() {
  // Rejection sampling avoids modulo bias while keeping codes easy to read aloud.
  let code = "";
  while (code.length < 6) {
    for (const byte of crypto.getRandomValues(new Uint8Array(12))) {
      if (byte < Math.floor(256 / ALPHABET.length) * ALPHABET.length) code += ALPHABET[byte % ALPHABET.length];
      if (code.length === 6) return code;
    }
  }
  return code;
}
function unpack(row: RoomRow) { return JSON.parse(row.data) as RoomData; }
export function publicRoomState(row: RoomRow, player: Player, now = Date.now()): OnlineState {
  const data = unpack(row);
  const opponent: Player = player === 0 ? 1 : 0;
  const sunkIds = new Set(data.game.shots[player].filter(s => s.result === "sunk").map(s => s.sunk?.id));
  const players = data.names.map((name, i) => name === null ? null : ({
    name,
    ready: data.game.fleets[i] !== null,
    connected: !data.left[i] && now - (i === 0 ? row.p0_seen : row.p1_seen) < 30_000,
  })) as [OnlinePlayer | null, OnlinePlayer | null];
  return {
    code: row.code,
    version: row.version,
    player,
    phase: data.game.phase === "finished" ? "finished" : row.p1_hash ? data.game.phase : "waiting",
    turn: data.game.turn,
    winner: data.game.winner,
    players,
    ownFleet: data.game.fleets[player],
    ownShots: data.game.shots[player],
    enemyShots: data.game.shots[opponent],
    opponentSunk: (data.game.fleets[opponent] ?? []).filter(ship => sunkIds.has(ship.id)),
    rematch: data.rematch,
    lastAction: data.lastAction,
    opponentLeft: data.left[opponent],
  };
}
async function load(db: DB, code: string): Promise<RoomRow> {
  const row = await db.prepare("SELECT * FROM naval_rooms WHERE code = ? AND expires_at > ?").bind(code, Date.now()).first<RoomRow>();
  if (!row) throw new RoomError("This room does not exist or has expired.", 404, "room_not_found");
  return row;
}
function bearer(request: Request) {
  const match = /^Bearer ([a-f0-9]{64})$/.exec(request.headers.get("authorization") ?? "");
  if (!match) throw new RoomError("Rejoin from the browser where you entered this room.", 401, "unauthorized");
  return match[1];
}
async function authorize(row: RoomRow, request: Request): Promise<Player> {
  const digest = await hash(bearer(request));
  if (digest === row.p0_hash) return 0;
  if (digest === row.p1_hash) return 1;
  throw new RoomError("This room session is no longer valid.", 401, "unauthorized");
}
async function heartbeat(db: DB, row: RoomRow, player: Player) {
  const now = Date.now();
  // Heartbeats deliberately do not increment the game version or overwrite its JSON.
  if (now - (player === 0 ? row.p0_seen : row.p1_seen) > SEEN_WRITE_MS) {
    await db.prepare(player === 0 ? "UPDATE naval_rooms SET p0_seen = ? WHERE code = ?" : "UPDATE naval_rooms SET p1_seen = ? WHERE code = ?")
      .bind(now, row.code).run();
  }
  if (player === 0) row.p0_seen = now; else row.p1_seen = now;
}
/** Per-IP limit in the Workers rate-limit binding. Rejected requests never touch D1. */
async function rateLimit(limiter: Limiter | undefined, request: Request) {
  const ip = request.headers.get("cf-connecting-ip");
  if (!limiter || !ip) return; // Direct local development has no trusted edge address.
  const { success } = await limiter.limit({ key: ip });
  if (!success) throw new RoomError("Too many attempts. Please wait a minute.", 429, "rate_limited");
}
export async function createRoom(db: DB, request: Request, input: Record<string, unknown>, limits: Limits = {}) {
  await rateLimit(limits.create, request);
  const name = normalizeName(input.name, "Commander 1");
  const token = sessionToken(input);
  const digest = await hash(token);
  const now = Date.now();
  const data: RoomData = {
    game: newGame(), names: [name, null], rematch: [false, false], left: [false, false], requests: [[], []], lastAction: null, lastMove: [0, 0], round: 0,
  };
  for (let attempt = 0; attempt < 8; attempt++) {
    // A token persisted before the first HTTP request makes response-loss safe.
    const prior = await db.prepare("SELECT * FROM naval_rooms WHERE p0_hash = ?").bind(digest).first<RoomRow>();
    if (prior) {
      if (prior.expires_at <= Date.now() || unpack(prior).left[0]) throw new RoomError("This room session has ended. Create a new room.", 410, "room_closed");
      await heartbeat(db, prior, 0);
      return { code: prior.code, token, player: 0 as Player, state: publicRoomState(prior, 0) };
    }
    if (attempt === 0) {
      const live = await db.prepare("SELECT COUNT(*) AS n FROM naval_rooms WHERE expires_at > ?").bind(now).first<{ n: number }>();
      if ((live?.n ?? 0) >= MAX_ROOMS) throw new RoomError("Could not create a room. Please try again.", 503, "service_unavailable");
    }
    const code = roomCode();
    const row: RoomRow = { code, version: 1, data: JSON.stringify(data), p0_hash: digest, p1_hash: null, p0_seen: now, p1_seen: 0, created_at: now, updated_at: now, expires_at: now + ROOM_LIFETIME };
    const result = await db.prepare("INSERT OR IGNORE INTO naval_rooms (code, version, data, p0_hash, p1_hash, p0_seen, p1_seen, created_at, updated_at, expires_at) VALUES (?, 1, ?, ?, NULL, ?, 0, ?, ?, ?)")
      .bind(code, row.data, digest, now, now, now, row.expires_at).run();
    if (result.meta.changes > 0) {
      // Bounded cleanup; schema is exclusively managed by migrations.
      await db.prepare("DELETE FROM naval_rooms WHERE code IN (SELECT code FROM naval_rooms WHERE expires_at <= ? LIMIT 32)").bind(now).run()
        .catch(() => { /* Cleanup is best-effort; a created room remains recoverable. */ });
      return { code, token, player: 0 as Player, state: publicRoomState(row, 0, now) };
    }
  }
  throw new RoomError("Could not create a room. Please try again.", 503);
}
export async function joinRoom(db: DB, request: Request, rawCode: string, input: Record<string, unknown>, limits: Limits = {}) {
  const code = normalizeCode(rawCode);
  await rateLimit(limits.join, request);
  const name = normalizeName(input.name, "Commander 2");
  const token = sessionToken(input);
  const digest = await hash(token);
  for (let attempt = 0; attempt < 4; attempt++) {
    const row = await load(db, code);
    const data = unpack(row);
    const returningPlayer = row.p0_hash === digest ? 0 : row.p1_hash === digest ? 1 : null;
    if (returningPlayer !== null) {
      if (data.left[returningPlayer]) throw new RoomError("You have left this room.", 410, "room_closed");
      await heartbeat(db, row, returningPlayer);
      return { code, token, player: returningPlayer as Player, state: publicRoomState(row, returningPlayer) };
    }
    if (row.p1_hash) throw new RoomError("This room already has two commanders.", 409, "room_full");
    if (data.left[0] || data.game.phase === "finished") throw new RoomError("The host has left this room.", 410, "room_closed");
    data.names[1] = name;
    const now = Date.now();
    const nextData = JSON.stringify(data);
    const result = await db.prepare("UPDATE naval_rooms SET data = ?, p1_hash = ?, p1_seen = ?, updated_at = ?, version = version + 1 WHERE code = ? AND version = ? AND p1_hash IS NULL AND expires_at > ?")
      .bind(nextData, digest, now, now, code, row.version, now).run();
    if (result.meta.changes > 0) {
      row.data = nextData; row.p1_hash = digest; row.p1_seen = now; row.updated_at = now; row.version++;
      return { code, token, player: 1 as Player, state: publicRoomState(row, 1, now) };
    }
  }
  throw new RoomError("The room changed. Try joining again.", 409, "conflict");
}
export async function getRoom(db: DB, request: Request, rawCode: string) {
  const code = normalizeCode(rawCode);
  bearer(request); // A malformed token is refused before any D1 read.
  const row = await load(db, code);
  const player = await authorize(row, request);
  await heartbeat(db, row, player);
  return publicRoomState(row, player);
}
function requestIdentifier(input: Record<string, unknown>) {
  if (input.requestId === undefined) return null;
  if (typeof input.requestId !== "string" || !/^[a-zA-Z0-9_-]{8,100}$/.test(input.requestId)) throw new RoomError("Invalid request identifier.");
  return input.requestId;
}
export async function actInRoom(db: DB, request: Request, rawCode: string, input: Record<string, unknown>) {
  const code = normalizeCode(rawCode);
  const requestId = requestIdentifier(input);
  if (input.expectedVersion !== undefined && (!Number.isInteger(input.expectedVersion) || (input.expectedVersion as number) < 1)) {
    throw new RoomError("Invalid room version.");
  }
  if (!["place", "shot", "rematch", "leave"].includes(String(input.type))) throw new RoomError("Unknown room action.");
  bearer(request);
  for (let attempt = 0; attempt < 5; attempt++) {
    const row = await load(db, code);
    const player = await authorize(row, request);
    const opponent: Player = player === 0 ? 1 : 0;
    const data = unpack(row);
    if (requestId && data.requests[player].includes(requestId)) {
      await heartbeat(db, row, player);
      return publicRoomState(row, player);
    }
    if (input.expectedVersion !== undefined && input.expectedVersion !== row.version) {
      throw new RoomError("The room changed. Your board is refreshing; try again.", 409, "stale_version");
    }
    if (data.left[player] && input.type !== "leave") throw new RoomError("You have left this room.", 410, "room_closed");
    const now = Date.now();
    // Limits accidental double-click floods without penalising placement or polling.
    if (input.type === "shot" && now - data.lastMove[player] < 180) throw new RoomError("Wait a moment before firing again.", 429, "rate_limited");
    try {
      if (input.type === "place") {
        if (data.left[opponent]) throw new RoomError("Your opponent has left.", 410, "opponent_left");
        data.game = placeFleet(data.game, player, input.fleet as Fleet);
      } else if (input.type === "shot") {
        if (data.left[opponent]) throw new RoomError("Your opponent has left.", 410, "opponent_left");
        if (!row.p1_hash) throw new RoomError("Wait for a second commander to join.", 409);
        if (typeof input.x !== "number" || typeof input.y !== "number" || !Number.isInteger(input.x) || !Number.isInteger(input.y)) throw new RoomError("Select a valid target.");
        const result = fireShot(data.game, player, input.x, input.y);
        data.game = result.game;
        data.lastAction = { player, shot: result.shot };
        data.lastMove[player] = now;
      } else if (input.type === "rematch") {
        if (data.game.phase !== "finished") throw new RoomError("Finish this battle before requesting a rematch.", 409);
        if (data.left[opponent] || !row.p1_hash) throw new RoomError("Your opponent has left. Create a new room.", 410, "opponent_left");
        data.rematch[player] = true;
        if (data.rematch[0] && data.rematch[1]) {
          data.round++;
          data.game = newGame();
          data.game.turn = (data.round % 2) as Player;
          data.rematch = [false, false];
          data.lastAction = null;
          data.lastMove = [0, 0];
        }
      } else {
        data.left[player] = true;
        if (data.game.phase !== "finished") {
          data.game.phase = "finished";
          data.game.winner = row.p1_hash ? opponent : null;
        }
      }
    } catch (error) {
      if (error instanceof RoomError) throw error;
      throw new RoomError(error instanceof Error ? error.message : "That move is not allowed.", 400, "illegal_action");
    }
    if (requestId) data.requests[player] = [...data.requests[player].slice(-63), requestId];
    const nextData = JSON.stringify(data);
    // The version check linearises joins, placement, shots, surrender and rematches.
    // Losing concurrent updates are re-read and revalidated instead of overwriting.
    const result = await db.prepare(player === 0
      ? "UPDATE naval_rooms SET data = ?, version = version + 1, updated_at = ?, p0_seen = ? WHERE code = ? AND version = ? AND expires_at > ?"
      : "UPDATE naval_rooms SET data = ?, version = version + 1, updated_at = ?, p1_seen = ? WHERE code = ? AND version = ? AND expires_at > ?")
      .bind(nextData, now, now, code, row.version, now).run();
    if (result.meta.changes > 0) {
      row.data = nextData; row.version++; row.updated_at = now;
      if (player === 0) row.p0_seen = now; else row.p1_seen = now;
      return publicRoomState(row, player, now);
    }
  }
  throw new RoomError("The room is busy. Your board will refresh; please try again.", 409, "conflict");
}
