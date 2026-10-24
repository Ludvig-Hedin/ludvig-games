import { createMatch, resolveRound } from "./game.mjs";

type Match = ReturnType<typeof createMatch>;
type Seat = 0 | 1;
type Phase = "waiting" | "choosing" | "revealed" | "finished" | "abandoned";
type Choice = { move: number; boost: boolean };
type Player = { name: string; tokenHash: string; left: boolean };
type StoredRoom = {
  code: string;
  matchId: string;
  phase: Phase;
  players: [Player, Player | null];
  match: Match;
  choices: [Choice | null, Choice | null];
  next: [boolean, boolean];
  rematch: [boolean, boolean];
};
type RoomRow = {
  code: string;
  data: string;
  version: number;
  created_at: number;
  expires_at: number;
  host_seen: number;
  guest_seen: number;
};
export type RoomDatabase = Pick<D1Database, "prepare">;
export type PublicRoom = ReturnType<typeof publicRoom>;

const ROOM_LIFETIME = 24 * 60 * 60 * 1000;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_PATTERN = /^[A-HJ-NP-Z2-9]{7}$/;

class RoomError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function fail(status: number, code: string, message: string): never {
  throw new RoomError(status, code, message);
}

function normalizeCode(code: string) {
  const normalized = code.trim().toUpperCase();
  if (!CODE_PATTERN.test(normalized)) fail(404, "room_not_found", "That room does not exist. Check the code.");
  return normalized;
}

function playerName(value: unknown, fallback: string) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value !== "string") fail(400, "invalid_name", "Enter a player name.");
  const name = value.replace(/[\u0000-\u001f\u007f-\u009f<>]/g, "").trim().slice(0, 20);
  return name || fallback;
}

async function hash(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function newToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function newCode() {
  return Array.from(crypto.getRandomValues(new Uint8Array(7)), (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join("");
}

function publicRoom(state: StoredRoom, row: RoomRow, you: Seat, now: number) {
  return {
    code: state.code,
    revision: row.version,
    matchId: state.matchId,
    you,
    phase: state.phase,
    players: state.players.map((player, seat) => player ? {
      name: player.name,
      connected: !player.left && now - (seat === 0 ? row.host_seen : row.guest_seen) < 15_000,
      locked: state.choices[seat] !== null,
      nextReady: state.next[seat],
      rematchReady: state.rematch[seat],
      left: player.left,
    } : null),
    match: state.match,
    ownChoice: state.choices[you],
    expiresAt: row.expires_at,
  };
}

async function readRow(db: RoomDatabase, code: string, now: number) {
  const row = await db.prepare("SELECT * FROM rooms WHERE code = ?").bind(code).first<RoomRow>();
  if (!row) fail(404, "room_not_found", "That room does not exist. Check the code.");
  if (row.expires_at <= now) fail(410, "room_expired", "This room has expired. Create a new one.");
  return row;
}

function authenticate(state: StoredRoom, tokenHash: string): Seat {
  const index = state.players.findIndex((player) => player?.tokenHash === tokenHash);
  if (index === -1) fail(401, "invalid_token", "This player session is not valid. Rejoin with an invite link.");
  return index as Seat;
}

async function validTokenHash(token: string | null) {
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) fail(401, "invalid_token", "A player session is required.");
  return hash(token);
}

// Per-IP limits moved to the Workers rate-limit binding in worker/index.ts
// (24 Oct 2026), so a rejected request writes nothing to D1.

export async function createRoom(db: RoomDatabase, input: Record<string, unknown>, _identity = "local", now = Date.now()) {
  const bestOf = input.bestOf ?? 5;
  const variant = input.variant ?? "classic";
  if (![3, 5, 7].includes(bestOf as number)) fail(400, "invalid_series", "Choose best of 3, 5, or 7.");
  if (variant !== "classic" && variant !== "mind") fail(400, "invalid_variant", "Choose Classic or Mind Games.");
  const token = newToken();
  const tokenHash = await hash(token);
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = newCode();
    const state: StoredRoom = {
      code, matchId: crypto.randomUUID(), phase: "waiting",
      players: [{ name: playerName(input.name, "Player 1"), tokenHash, left: false }, null],
      match: createMatch({ bestOf: bestOf as 3 | 5 | 7, variant }),
      choices: [null, null], next: [false, false], rematch: [false, false],
    };
    const row: RoomRow = { code, data: JSON.stringify(state), version: 0, created_at: now, expires_at: now + ROOM_LIFETIME, host_seen: now, guest_seen: 0 };
    const result = await db.prepare("INSERT OR IGNORE INTO rooms (code, data, version, created_at, expires_at, host_seen, guest_seen) VALUES (?, ?, 0, ?, ?, ?, 0)")
      .bind(code, row.data, now, row.expires_at, now).run();
    if (result.meta.changes) {
      await db.prepare("DELETE FROM rooms WHERE code IN (SELECT code FROM rooms WHERE expires_at <= ? LIMIT 50)").bind(now).run();
      return { token, room: publicRoom(state, row, 0, now) };
    }
  }
  fail(503, "room_creation_failed", "Could not create a room. Try again.");
}

export async function joinRoom(db: RoomDatabase, codeInput: string, input: Record<string, unknown>, _identity = "local", now = Date.now()) {
  const code = normalizeCode(codeInput);
  if (input.clientToken !== undefined && (typeof input.clientToken !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(input.clientToken))) {
    fail(400, "invalid_client_token", "The player session token is invalid.");
  }
  // The client persists this random credential before joining. If the server
  // succeeds but its response is lost, the same request recovers the same seat.
  const token = typeof input.clientToken === "string" ? input.clientToken : newToken();
  const tokenHash = await hash(token);
  for (let attempt = 0; attempt < 12; attempt++) {
    const row = await readRow(db, code, now);
    const state: StoredRoom = JSON.parse(row.data);
    if (state.phase === "abandoned") fail(410, "room_closed", "This room has closed. Create a new one.");
    if (state.players[0].tokenHash === tokenHash) fail(400, "invalid_client_token", "Each player needs a separate session token.");
    if (state.players[1]?.tokenHash === tokenHash) {
      await db.prepare("UPDATE rooms SET guest_seen = MAX(guest_seen, ?) WHERE code = ?").bind(now, code).run();
      return { token, room: publicRoom(state, { ...row, guest_seen: now }, 1, now) };
    }
    if (state.players[1]) fail(409, "room_full", "This room already has two players.");
    state.players[1] = { name: playerName(input.name, "Player 2"), tokenHash, left: false };
    state.phase = "choosing";
    const updated = await db.prepare("UPDATE rooms SET data = ?, version = version + 1, guest_seen = ? WHERE code = ? AND version = ?")
      .bind(JSON.stringify(state), now, code, row.version).run();
    if (updated.meta.changes) return { token, room: publicRoom(state, { ...row, version: row.version + 1, guest_seen: now }, 1, now) };
  }
  fail(409, "room_busy", "The room is busy. Try again.");
}

export async function getRoom(db: RoomDatabase, codeInput: string, token: string | null, now = Date.now()) {
  const code = normalizeCode(codeInput);
  const tokenHash = await validTokenHash(token);
  const row = await readRow(db, code, now);
  const state: StoredRoom = JSON.parse(row.data);
  const seat = authenticate(state, tokenHash);
  const column = seat === 0 ? "host_seen" : "guest_seen";
  if (!state.players[seat]?.left && now - row[column] > 5_000) {
    await db.prepare(`UPDATE rooms SET ${column} = MAX(${column}, ?) WHERE code = ?`).bind(now, code).run();
    row[column] = now;
  }
  return { room: publicRoom(state, row, seat, now) };
}

export async function actRoom(db: RoomDatabase, codeInput: string, token: string | null, input: Record<string, unknown>, now = Date.now()) {
  const code = normalizeCode(codeInput);
  const tokenHash = await validTokenHash(token);
  if (!['lock', 'next', 'rematch', 'leave'].includes(input.type as string)) fail(400, "invalid_action", "That action is not supported.");
  for (let attempt = 0; attempt < 12; attempt++) {
    const row = await readRow(db, code, now);
    const state: StoredRoom = JSON.parse(row.data);
    const seat = authenticate(state, tokenHash);
    if (input.matchId !== state.matchId) fail(409, "stale_match", "The match has changed. Refresh the room.");
    if (state.players[seat]?.left && input.type !== "leave") fail(410, "room_left", "You left this room. Create a new one.");
    let changed = false;
    if (input.type === "leave") {
      if (!state.players[seat]!.left) {
        state.players[seat]!.left = true;
        state.phase = "abandoned";
        state.choices = [null, null];
        changed = true;
      }
    } else {
      if (state.phase === "abandoned") fail(410, "room_closed", "Your opponent left the room.");
      if (input.type === "lock") {
        if (!Number.isInteger(input.move) || Number(input.move) < 0 || Number(input.move) > 2) fail(400, "invalid_move", "Choose rock, paper, or scissors.");
        if (input.boost !== undefined && typeof input.boost !== "boolean") fail(400, "invalid_boost", "The boost must be on or off.");
        const move = Number(input.move);
        const boost = input.boost === true;
        if (boost && state.match.variant !== "mind") fail(400, "boost_unavailable", "Boosts are only available in Mind Games.");
        const previous = state.match.history.find((round) => round.round === input.round);
        if (previous && previous.moves[seat] === move && previous.boosts[seat] === boost) return { room: publicRoom(state, row, seat, now) };
        if (state.phase !== "choosing") fail(409, "round_not_open", "Wait for both players to be ready.");
        if (input.round !== state.match.round) fail(409, "stale_round", "This round has already changed.");
        if (state.choices[seat]) {
          if (state.choices[seat]!.move === move && state.choices[seat]!.boost === boost) return { room: publicRoom(state, row, seat, now) };
          fail(409, "choice_locked", "Your choice is locked for this round.");
        }
        if (boost && !state.match.boostsLeft[seat]) fail(409, "boost_spent", "Your double-point round has already been used.");
        state.choices[seat] = { move, boost };
        if (state.choices[0] && state.choices[1]) {
          state.match = resolveRound(state.match, state.choices[0].move, state.choices[1].move, state.choices[0].boost, state.choices[1].boost);
          state.phase = state.match.winner === null ? "revealed" : "finished";
          state.next = [false, false];
        }
        changed = true;
      } else if (input.type === "next") {
        if (state.phase === "choosing" && input.round === state.match.round - 1) return { room: publicRoom(state, row, seat, now) };
        if (state.phase !== "revealed") fail(409, "round_not_revealed", "There is no round to advance.");
        const latest = state.match.history[state.match.history.length - 1];
        if (input.round !== latest.round) fail(409, "stale_round", "This round has already changed.");
        state.next[seat] = true;
        if (state.next[0] && state.next[1]) {
          state.phase = "choosing";
          state.choices = [null, null];
          state.next = [false, false];
        }
        changed = true;
      } else if (input.type === "rematch") {
        if (state.phase !== "finished") fail(409, "match_not_finished", "Finish this match before starting a rematch.");
        state.rematch[seat] = true;
        if (state.rematch[0] && state.rematch[1]) {
          state.match = createMatch({ bestOf: state.match.bestOf, variant: state.match.variant });
          state.matchId = crypto.randomUUID();
          state.phase = "choosing";
          state.choices = [null, null];
          state.next = [false, false];
          state.rematch = [false, false];
        }
        changed = true;
      }
    }
    if (!changed) return { room: publicRoom(state, row, seat, now) };
    const seenColumn = seat === 0 ? "host_seen" : "guest_seen";
    const updated = await db.prepare(`UPDATE rooms SET data = ?, version = version + 1, ${seenColumn} = MAX(${seenColumn}, ?) WHERE code = ? AND version = ?`)
      .bind(JSON.stringify(state), now, code, row.version).run();
    if (updated.meta.changes) return { room: publicRoom(state, { ...row, version: row.version + 1, [seenColumn]: now }, seat, now) };
  }
  fail(409, "room_busy", "The room is busy. Try again.");
}

async function requestBody(request: Request) {
  const length = request.headers.get("content-length");
  if (length && Number(length) > 2048) fail(413, "body_too_large", "That request is too large.");
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) fail(415, "invalid_content_type", "Send a JSON request.");
  const reader = request.body?.getReader();
  if (!reader) fail(400, "invalid_body", "Send a JSON object.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.byteLength;
    if (size > 2048) { await reader.cancel(); fail(413, "body_too_large", "That request is too large."); }
    chunks.push(part.value);
  }
  const combined = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { combined.set(chunk, offset); offset += chunk.length; }
  let body: unknown;
  try { body = JSON.parse(new TextDecoder().decode(combined)); }
  catch { fail(400, "invalid_body", "Send a valid JSON object."); }
  if (!body || typeof body !== "object" || Array.isArray(body)) fail(400, "invalid_body", "Send a JSON object.");
  return body as Record<string, unknown>;
}

export async function roomApi(request: Request, db: RoomDatabase | undefined, action: "create" | "join" | "get" | "action", code = "") {
  const headers = { "content-type": "application/json", "cache-control": "no-store, private", "x-content-type-options": "nosniff" };
  try {
    if (!db) fail(503, "database_unavailable", "Online rooms are temporarily unavailable. Try again shortly.");
    const origin = request.headers.get("origin");
    if (request.method !== "GET" && origin && origin !== new URL(request.url).origin) fail(403, "invalid_origin", "Open this room directly to continue.");
    const authorization = request.headers.get("authorization");
    const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
    const identity = request.headers.get("cf-connecting-ip") || request.headers.get("x-real-ip") || "preview";
    const result = action === "get" ? await getRoom(db, code, token)
      : action === "create" ? await createRoom(db, await requestBody(request), identity)
        : action === "join" ? await joinRoom(db, code, await requestBody(request), identity)
          : await actRoom(db, code, token, await requestBody(request));
    return new Response(JSON.stringify(result), { status: action === "create" ? 201 : 200, headers });
  } catch (error) {
    if (error instanceof RoomError) return new Response(JSON.stringify({ error: error.message, code: error.code }), { status: error.status, headers });
    console.error("Room operation failed", error instanceof Error ? error.name : "UnknownError");
    return new Response(JSON.stringify({ error: "The room could not be reached. Please try again.", code: "server_error" }), { status: 503, headers });
  }
}
