import { applyMove, createMatch, nextRound, restartMatch } from "./match.js";
import type { MatchState } from "./match.js";

type Role = "X" | "O";
type Action = "create" | "read" | "join" | "move" | "rematch" | "leave";
type JsonObject = Record<string, unknown>;
type RoomRow = {
  code: string; state: string; revision: number; match_number: number;
  x_token_hash: string; o_token_hash: string | null;
  x_ready: number; o_ready: number; closed: number;
  created_at: number; updated_at: number; expires_at: number;
  x_seen_at: number; o_seen_at: number | null;
};

export type PublicRoom = {
  code: string; state: MatchState; revision: number; matchNumber: number; joined: boolean;
  ready: Record<Role, boolean>; closed: boolean; expiresAt: number;
  opponentSeenAt: number | null;
};

const TTL = 24 * 60 * 60 * 1000;
const PRESENCE_INTERVAL = 15_000;
const MAX_BODY_BYTES = 4096;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const NO_STORE_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
};

class RoomError extends Error {
  status: number;
  code: string;
  room?: PublicRoom;
  constructor(status: number, code: string, message: string, room?: PublicRoom) {
    super(message);
    this.status = status;
    this.code = code;
    this.room = room;
  }
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: NO_STORE_HEADERS });
}

function publicRoom(row: RoomRow, role: Role): PublicRoom {
  return {
    code: row.code, state: JSON.parse(row.state) as MatchState, revision: row.revision, matchNumber: row.match_number,
    joined: !!row.o_token_hash, ready: { X: !!row.x_ready, O: !!row.o_ready },
    closed: !!row.closed, expiresAt: row.expires_at,
    opponentSeenAt: role === "X" ? row.o_seen_at : row.x_seen_at,
  };
}

function sameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if ((origin && origin !== new URL(request.url).origin) || request.headers.get("sec-fetch-site") === "cross-site") {
    throw new RoomError(403, "wrong_origin", "This request must come from the game.");
  }
}

async function bodyObject(request: Request): Promise<JsonObject> {
  const declared = request.headers.get("content-length");
  if (declared && Number(declared) > MAX_BODY_BYTES) throw new RoomError(413, "body_too_large", "This request is too large.");
  if (!request.body) return {};
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().startsWith("application/json")) throw new RoomError(415, "json_required", "Send game actions as JSON.");
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let bytes = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      bytes += result.value.byteLength;
      if (bytes > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new RoomError(413, "body_too_large", "This request is too large.");
      }
      text += decoder.decode(result.value, { stream: true });
    }
    text += decoder.decode();
  } finally {
    reader.releaseLock();
  }
  if (!text.trim()) return {};
  let body: unknown;
  try { body = JSON.parse(text); }
  catch { throw new RoomError(400, "invalid_json", "That game action could not be read."); }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new RoomError(400, "invalid_body", "That game action is invalid.");
  return body as JsonObject;
}

function roomCode(value: string): string {
  const code = value.toUpperCase();
  if (!/^[A-HJ-NP-Z2-9]{8}$/.test(code)) throw new RoomError(404, "room_not_found", "That room could not be found.");
  return code;
}

function newCode(): string {
  return [...crypto.getRandomValues(new Uint8Array(8))].map((byte) => CODE_ALPHABET[byte & 31]).join("");
}

function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function tokenHash(token: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function equalHash(a: string, b: string | null): boolean {
  if (!b || a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}

async function requestTokenHash(request: Request): Promise<string> {
  const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(request.headers.get("authorization") || "");
  if (!match) throw new RoomError(401, "session_required", "Open your room on the device you joined with.");
  return tokenHash(match[1]);
}

async function getRow(db: D1Database, code: string): Promise<RoomRow> {
  const row = await db.prepare("SELECT * FROM rooms WHERE code = ?").bind(code).first<RoomRow>();
  if (!row) throw new RoomError(404, "room_not_found", "That room could not be found.");
  return row;
}

function checkExpiry(row: RoomRow): void {
  if (row.expires_at <= Date.now()) throw new RoomError(410, "room_expired", "This room has expired. Start a new one.");
}

function authenticate(row: RoomRow, hash: string): Role {
  if (equalHash(hash, row.x_token_hash)) return "X";
  if (equalHash(hash, row.o_token_hash)) return "O";
  throw new RoomError(403, "invalid_session", "This device is not a player in that room.");
}

function requireOpen(row: RoomRow, role: Role): void {
  checkExpiry(row);
  if (row.closed) throw new RoomError(410, "room_closed", "Your friend left the room.", publicRoom(row, role));
}

async function conflict(db: D1Database, code: string, role: Role): Promise<never> {
  const current = await getRow(db, code);
  requireOpen(current, role);
  throw new RoomError(409, "state_changed", "The board changed. Try again.", publicRoom(current, role));
}

async function createRoom(request: Request, db: D1Database): Promise<Response> {
  const body = await bodyObject(request);
  const size = body.size ?? 3;
  const length = body.length ?? 3;
  if (![3, 4, 5].includes(size as number) || ![0, 3, 5, 7].includes(length as number)) throw new RoomError(400, "invalid_settings", "Choose a supported board and match length.");
  const state = createMatch({ size: size as 3 | 4 | 5, length: length as 0 | 3 | 5 | 7 });
  const token = newToken();
  const hash = await tokenHash(token);
  const now = Date.now();
  // Bounded cleanup only; schema changes belong in migrations.
  await db.prepare("DELETE FROM rooms WHERE code IN (SELECT code FROM rooms WHERE expires_at <= ? LIMIT 100)").bind(now).run();
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = newCode();
    const result = await db.prepare("INSERT OR IGNORE INTO rooms (code, state, revision, x_token_hash, o_token_hash, x_ready, o_ready, closed, created_at, updated_at, expires_at, x_seen_at, o_seen_at) VALUES (?, ?, 1, ?, NULL, 0, 0, 0, ?, ?, ?, ?, NULL)")
      .bind(code, JSON.stringify(state), hash, now, now, now + TTL, now).run();
    if (result.meta.changes === 1) return json({ code, token, role: "X", room: publicRoom(await getRow(db, code), "X") }, 201);
  }
  throw new RoomError(503, "create_retry", "The room could not be created. Please try again.");
}

async function joinRoom(request: Request, db: D1Database, code: string): Promise<Response> {
  await bodyObject(request);
  const row = await getRow(db, code);
  checkExpiry(row);
  if (row.closed) throw new RoomError(410, "room_closed", "This room has ended. Ask for a new link.");
  if (row.o_token_hash) throw new RoomError(409, "room_full", "This room already has two players.");
  const token = newToken();
  const hash = await tokenHash(token);
  const now = Date.now();
  const result = await db.prepare("UPDATE rooms SET o_token_hash = ?, revision = revision + 1, updated_at = ?, expires_at = ?, o_seen_at = ? WHERE code = ? AND revision = ? AND o_token_hash IS NULL AND closed = 0 AND expires_at > ?")
    .bind(hash, now, now + TTL, now, code, row.revision, now).run();
  if (result.meta.changes !== 1) {
    checkExpiry(await getRow(db, code));
    throw new RoomError(409, "room_full", "This room already has two players.");
  }
  return json({ code, token, role: "O", room: publicRoom(await getRow(db, code), "O") });
}

async function readRoom(db: D1Database, row: RoomRow, role: Role): Promise<Response> {
  checkExpiry(row);
  const now = Date.now();
  const seen = role === "X" ? row.x_seen_at : (row.o_seen_at ?? 0);
  if (now - seen >= PRESENCE_INTERVAL) {
    const column = role === "X" ? "x_seen_at" : "o_seen_at";
    await db.prepare(`UPDATE rooms SET ${column} = ?, updated_at = ?, expires_at = ? WHERE code = ? AND expires_at > ?`)
      .bind(now, now, now + TTL, row.code, now).run();
    row.expires_at = now + TTL;
  }
  return json({ room: publicRoom(row, role) });
}

async function move(request: Request, db: D1Database, row: RoomRow, role: Role): Promise<Response> {
  const body = await bodyObject(request);
  requireOpen(row, role);
  if (!row.o_token_hash) throw new RoomError(409, "waiting_for_friend", "Your friend has not joined yet.", publicRoom(row, role));
  if (!Number.isInteger(body.revision) || body.revision !== row.revision) return conflict(db, row.code, role);
  const state = JSON.parse(row.state) as MatchState;
  if (state.turn !== role) throw new RoomError(409, "wrong_turn", "It is your friend's turn.", publicRoom(row, role));
  if (!Number.isInteger(body.index) || (body.index as number) < 0 || (body.index as number) >= state.board.length) throw new RoomError(400, "invalid_move", "Choose a square on the board.", publicRoom(row, role));
  let next: MatchState;
  try { next = applyMove(state, body.index as number); }
  catch { throw new RoomError(409, "invalid_move", "That square is no longer available.", publicRoom(row, role)); }
  const now = Date.now();
  const seenColumn = role === "X" ? "x_seen_at" : "o_seen_at";
  const result = await db.prepare(`UPDATE rooms SET state = ?, revision = revision + 1, x_ready = 0, o_ready = 0, updated_at = ?, expires_at = ?, ${seenColumn} = ? WHERE code = ? AND revision = ? AND closed = 0 AND expires_at > ?`)
    .bind(JSON.stringify(next), now, now + TTL, now, row.code, row.revision, now).run();
  if (result.meta.changes !== 1) return conflict(db, row.code, role);
  return json({ room: publicRoom(await getRow(db, row.code), role) });
}

async function rematch(request: Request, db: D1Database, row: RoomRow, role: Role): Promise<Response> {
  const body = await bodyObject(request);
  const originalState = row.state;
  if (body.revision !== undefined && (!Number.isInteger(body.revision) || body.revision !== row.revision)) return conflict(db, row.code, role);
  for (let attempt = 0; attempt < 3; attempt++) {
    requireOpen(row, role);
    const state = JSON.parse(row.state) as MatchState;
    if (!row.o_token_hash || (!state.winner && !state.draw)) throw new RoomError(409, "round_in_progress", "Finish this round first.", publicRoom(row, role));
    if (row.state !== originalState || (body.round !== undefined && body.round !== state.round) || (body.matchNumber !== undefined && body.matchNumber !== row.match_number)) return conflict(db, row.code, role);
    let xReady = !!row.x_ready;
    let oReady = !!row.o_ready;
    if ((role === "X" && xReady) || (role === "O" && oReady)) return json({ room: publicRoom(row, role) });
    if (role === "X") xReady = true;
    else oReady = true;
    let next = state;
    let matchNumber = row.match_number;
    if (xReady && oReady) {
      next = state.matchWinner ? restartMatch(state) : nextRound(state);
      if (state.matchWinner) matchNumber++;
      xReady = false;
      oReady = false;
    }
    const now = Date.now();
    const result = await db.prepare("UPDATE rooms SET state = ?, revision = revision + 1, match_number = ?, x_ready = ?, o_ready = ?, updated_at = ?, expires_at = ? WHERE code = ? AND revision = ? AND closed = 0 AND expires_at > ?")
      .bind(JSON.stringify(next), matchNumber, Number(xReady), Number(oReady), now, now + TTL, row.code, row.revision, now).run();
    if (result.meta.changes === 1) return json({ room: publicRoom(await getRow(db, row.code), role) });
    row = await getRow(db, row.code);
  }
  return conflict(db, row.code, role);
}

async function leave(request: Request, db: D1Database, row: RoomRow, role: Role): Promise<Response> {
  await bodyObject(request);
  checkExpiry(row);
  for (let attempt = 0; attempt < 3; attempt++) {
    if (row.closed) return json({ room: publicRoom(row, role) });
    const now = Date.now();
    const result = await db.prepare("UPDATE rooms SET closed = 1, revision = revision + 1, updated_at = ?, expires_at = ? WHERE code = ? AND revision = ? AND expires_at > ?")
      .bind(now, now + TTL, row.code, row.revision, now).run();
    if (result.meta.changes === 1) return json({ room: publicRoom(await getRow(db, row.code), role) });
    row = await getRow(db, row.code);
    checkExpiry(row);
  }
  return conflict(db, row.code, role);
}

/** Shared HTTP validation; the D1 database is always the authority for online play. */
export async function handleRoomRequest(request: Request, db: D1Database | undefined, action: Action, rawCode = ""): Promise<Response> {
  try {
    if (request.method !== (action === "read" ? "GET" : "POST")) throw new RoomError(405, "method_not_allowed", "That action is not supported.");
    if (request.method !== "GET") sameOrigin(request);
    if (!db) throw new RoomError(503, "online_unavailable", "Online play is temporarily unavailable. Try again shortly.");
    if (action === "create") return await createRoom(request, db);
    const code = roomCode(rawCode);
    if (action === "join") return await joinRoom(request, db, code);
    const hash = await requestTokenHash(request);
    const row = await getRow(db, code);
    const role = authenticate(row, hash);
    if (action === "read") return await readRoom(db, row, role);
    if (action === "move") return await move(request, db, row, role);
    if (action === "rematch") return await rematch(request, db, row, role);
    return await leave(request, db, row, role);
  } catch (error) {
    if (error instanceof RoomError) return json({ error: error.message, code: error.code, ...(error.room ? { room: error.room } : {}) }, error.status);
    console.error("Room action failed", { action, error: error instanceof Error ? error.message : "Unknown error" });
    return json({ error: "The connection was interrupted. Please try again.", code: "server_error" }, 500);
  }
}
