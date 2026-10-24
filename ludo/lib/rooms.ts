import { applyMove, applyRoll, chooseMove, createGame, fairDie } from "./engine.js";

type Difficulty = "easy" | "medium" | "hard" | "expert";
type Rules = { mode: "classic" | "quick"; safeSquares: boolean; threeSixes: boolean };
type Seat = { id: string; name: string; color: number; type: "human" | "ai"; difficulty: Difficulty; tokenHash?: string; lastSeen: number };
type Room = {
  code: string; hostId: string; phase: "lobby" | "playing" | "finished";
  players: Seat[]; game: any; rules: Rules; difficulty: Difficulty;
  maxPlayers: number; version: number; createdAt: number; updatedAt: number; nextActionAt: number;
};
type Row = { state: string; version: number };

const ROOM_LIFETIME = 7 * 24 * 60 * 60 * 1000;
const DISCONNECTED_AFTER = 60_000;
const HEARTBEAT_INTERVAL = 15_000;
const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard", "expert"];
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const BOT_NAMES = ["Cleo", "Milo", "Pip", "Juniper"];

class RoomError extends Error {
  status: number; code: string;
  constructor(message: string, status = 400, code = "invalid_request") {
    super(message); this.status = status; this.code = code;
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: {
    "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store, private",
    "X-Content-Type-Options": "nosniff", "Referrer-Policy": "same-origin",
  } });
}

type Limiter = { limit(options: { key: string }): Promise<{ success: boolean }> };
export type Limits = { create?: Limiter; join?: Limiter; action?: Limiter };
// Global cap on live rooms, so a flood cannot use up the free D1 write budget.
export const MAX_ROOMS = 300;
/** Per-IP limit in the Workers rate-limit binding (shared by all isolates); a refused request never touches D1. */
async function rateLimit(request: Request, limiter: Limiter | undefined) {
  const ip = request.headers.get("cf-connecting-ip");
  if (!limiter || !ip) return;
  if (!(await limiter.limit({ key: ip })).success) throw new RoomError("A little too fast. Try again in a moment.", 429, "rate_limited");
}

async function bodyOf(request: Request): Promise<Record<string, any>> {
  if (Number(request.headers.get("content-length") || 0) > 4096) throw new RoomError("Request is too large.", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new RoomError("A JSON request is required.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 4096) { await reader.cancel(); throw new RoomError("Request is too large.", 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try {
    const body = JSON.parse(new TextDecoder().decode(bytes));
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
    return body;
  } catch { throw new RoomError("A valid JSON object is required."); }
}

function nameOf(value: unknown): string {
  if (typeof value !== "string") throw new RoomError("Enter your name.");
  const name = value.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim();
  if (!name || name.length > 20) throw new RoomError("Use a name with 1–20 characters.");
  return name;
}

function difficultyOf(value: unknown): Difficulty {
  if (value === undefined) return "medium";
  if (!DIFFICULTIES.includes(value as Difficulty)) throw new RoomError("Choose a valid bot difficulty.");
  return value as Difficulty;
}

function rulesOf(value: unknown): Rules {
  if (value === undefined) return { mode: "classic", safeSquares: true, threeSixes: true };
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new RoomError("Invalid match rules.");
  const rules = value as Record<string, unknown>;
  if (rules.mode !== undefined && rules.mode !== "classic" && rules.mode !== "quick") throw new RoomError("Choose classic or quick play.");
  for (const key of ["safeSquares", "threeSixes"]) if (rules[key] !== undefined && typeof rules[key] !== "boolean") throw new RoomError("Invalid match rules.");
  return { mode: (rules.mode || "classic") as Rules["mode"], safeSquares: rules.safeSquares !== false, threeSixes: rules.threeSixes !== false };
}

function colorsFor(maxPlayers: number): number[] { return maxPlayers === 2 ? [3, 1] : maxPlayers === 3 ? [3, 0, 1] : [3, 0, 1, 2]; }
function randomHex(): string { return Array.from(crypto.getRandomValues(new Uint8Array(32)), n => n.toString(16).padStart(2, "0")).join(""); }
function randomCode(): string {
  // 32 symbols divides 256 exactly: no modulo bias.
  return Array.from(crypto.getRandomValues(new Uint8Array(6)), n => CODE_ALPHABET[n & 31]).join("");
}
async function tokenHash(token: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(hash), n => n.toString(16).padStart(2, "0")).join("");
}
function equalHash(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}
async function member(request: Request, room: Room): Promise<Seat> {
  const token = request.headers.get("authorization")?.match(/^Bearer ([a-f0-9]{64})$/i)?.[1];
  if (!token) throw new RoomError("Join this room to play.", 401, "join_required");
  const hash = await tokenHash(token);
  const seat = room.players.find(player => player.type === "human" && player.tokenHash && equalHash(player.tokenHash, hash));
  if (!seat) throw new RoomError("This seat is no longer available. Join a new room.", 401, "seat_unavailable");
  return seat;
}
function cleanPlayer(player: Seat, now: number) {
  return { id: player.id, name: player.name, color: player.color, type: player.type, difficulty: player.difficulty, connected: player.type === "ai" || now - player.lastSeen < DISCONNECTED_AFTER };
}
export function publicRoom(room: Room, now = Date.now()) {
  return {
    code: room.code, hostId: room.hostId, phase: room.phase, players: room.players.map(player => cleanPlayer(player, now)),
    game: room.game, rules: room.rules, difficulty: room.difficulty, maxPlayers: room.maxPlayers,
    version: room.version, updatedAt: room.updatedAt, createdAt: room.createdAt,
  };
}
async function loadRoom(db: D1Database, code: string): Promise<Room> {
  const row = await db.prepare("SELECT state, version FROM rooms WHERE code = ?").bind(code).first<Row>();
  if (!row) throw new RoomError("Room not found. Check the code and try again.", 404, "room_not_found");
  const room = JSON.parse(row.state) as Room;
  room.version = row.version;
  if (Date.now() - room.updatedAt > ROOM_LIFETIME) throw new RoomError("This room has expired. Create a new one.", 410, "room_expired");
  return room;
}
async function saveRoom(db: D1Database, room: Room): Promise<Room> {
  const expectedVersion = room.version;
  room.version = expectedVersion + 1;
  room.updatedAt = Date.now();
  const result = await db.prepare("UPDATE rooms SET state = ?, version = ?, updated_at = ? WHERE code = ? AND version = ?")
    .bind(JSON.stringify(room), room.version, room.updatedAt, room.code, expectedVersion).run();
  if (result.meta.changes !== 1) throw new RoomError("The room just changed. Try again.", 409, "stale_version");
  return room;
}
function requireHost(room: Room, seat: Seat) { if (room.hostId !== seat.id) throw new RoomError("Only the host can do that.", 403, "host_only"); }
function expectVersion(room: Room, body: Record<string, any>) {
  if (!Number.isInteger(body.version) || body.version !== room.version) throw new RoomError("The room just changed. Updating your board…", 409, "stale_version");
}
function scheduleBot(room: Room, now = Date.now()) {
  const current = room.game?.players[room.game.current];
  room.nextActionAt = room.phase === "playing" && current?.type === "ai" ? now + (room.game.phase === "roll" ? 650 : 900) : 0;
}
function synchronizeGame(room: Room) { if (room.game?.phase === "finished") room.phase = "finished"; scheduleBot(room); }
async function advanceBot(db: D1Database, room: Room): Promise<Room> {
  const game = room.game;
  if (room.phase !== "playing" || !game || !room.nextActionAt || room.nextActionAt > Date.now()) return room;
  const current = game.players[game.current];
  if (current?.type !== "ai") return room;
  if (game.phase === "roll") room.game = applyRoll(game, fairDie());
  else {
    const choice = chooseMove(game, current.difficulty);
    if (choice === null) throw new Error("Bot has no legal move in move phase.");
    room.game = applyMove(game, choice);
  }
  synchronizeGame(room);
  try { return await saveRoom(db, room); }
  catch (error) { if (error instanceof RoomError && error.code === "stale_version") return loadRoom(db, room.code); throw error; }
}
async function heartbeat(db: D1Database, room: Room, seat: Seat) {
  const now = Date.now();
  if (now - seat.lastSeen < HEARTBEAT_INTERVAL) return;
  const index = room.players.findIndex(player => player.id === seat.id);
  // Metadata-only: no game version change. Predicates protect concurrent seat changes.
  const result = await db.prepare("UPDATE rooms SET state = json_set(state, ?, ?) WHERE code = ? AND version = ? AND json_extract(state, ?) = ?")
    .bind(`$.players[${index}].lastSeen`, now, room.code, room.version, `$.players[${index}].id`, seat.id).run();
  if (result.meta.changes === 1) seat.lastSeen = now;
}
async function createRoom(db: D1Database, body: Record<string, any>) {
  const name = nameOf(body.name), rules = rulesOf(body.rules), difficulty = difficultyOf(body.difficulty);
  const maxPlayers = body.maxPlayers ?? 4;
  if (![2, 3, 4].includes(maxPlayers)) throw new RoomError("A room needs 2–4 seats.");
  const token = randomHex(), playerId = crypto.randomUUID(), hash = await tokenHash(token), now = Date.now();
  const live = await db.prepare("SELECT COUNT(*) AS n FROM rooms WHERE updated_at >= ?").bind(now - ROOM_LIFETIME).first<{ n: number }>();
  if ((live?.n ?? 0) >= MAX_ROOMS) throw new RoomError("Could not create a room. Try once more.", 503, "room_creation_failed");
  for (let attempt = 0; attempt < 6; attempt++) {
    const room: Room = {
      code: randomCode(), hostId: playerId, phase: "lobby",
      players: [{ id: playerId, name, color: 3, type: "human", difficulty, tokenHash: hash, lastSeen: now }],
      game: null, rules, difficulty, maxPlayers, version: 0, createdAt: now, updatedAt: now, nextActionAt: 0,
    };
    const result = await db.prepare("INSERT OR IGNORE INTO rooms (code, state, version, updated_at) VALUES (?, ?, ?, ?)")
      .bind(room.code, JSON.stringify(room), 0, now).run();
    if (result.meta.changes === 1) {
      // Cheap housekeeping on the rare create path: a few expired rooms via the updated_at index; writes only when some exist.
      await db.prepare("DELETE FROM rooms WHERE code IN (SELECT code FROM rooms WHERE updated_at < ? LIMIT 25)").bind(now - ROOM_LIFETIME).run().catch(() => {});
      return json({ room: publicRoom(room), token, playerId }, 201);
    }
  }
  throw new RoomError("Could not create a room. Try once more.", 503, "room_creation_failed");
}
async function joinRoom(db: D1Database, room: Room, body: Record<string, any>) {
  if (room.phase !== "lobby") throw new RoomError("This match has already started.", 409, "match_started");
  if (room.players.length >= room.maxPlayers) throw new RoomError("This room is full.", 409, "room_full");
  const name = nameOf(body.name), token = randomHex(), playerId = crypto.randomUUID();
  const used = new Set(room.players.map(player => player.color));
  const color = colorsFor(room.maxPlayers).find(value => !used.has(value))!;
  room.players.push({ id: playerId, name, color, type: "human", difficulty: room.difficulty, tokenHash: await tokenHash(token), lastSeen: Date.now() });
  if (!room.hostId) room.hostId = playerId;
  await saveRoom(db, room);
  return json({ room: publicRoom(room), token, playerId });
}
function beginMatch(room: Room, fillAI: boolean) {
  if (fillAI) for (const color of colorsFor(room.maxPlayers)) {
    if (!room.players.some(player => player.color === color)) room.players.push({ id: crypto.randomUUID(), name: BOT_NAMES[color], color, type: "ai", difficulty: room.difficulty, lastSeen: Date.now() });
  }
  if (room.players.length < 2) throw new RoomError("Invite a friend or fill the empty seats with bots.");
  room.players.sort((a, b) => colorsFor(room.maxPlayers).indexOf(a.color) - colorsFor(room.maxPlayers).indexOf(b.color));
  // Only these public fields enter the engine. Never give it token hashes.
  room.game = createGame(room.players.map(({ id, name, color, type, difficulty }) => ({ id, name, color, type, difficulty })), room.rules);
  room.phase = "playing";
  scheduleBot(room);
}
async function act(db: D1Database, room: Room, seat: Seat, body: Record<string, any>) {
  expectVersion(room, body);
  seat.lastSeen = Date.now();
  switch (body.action) {
    case "start":
      requireHost(room, seat);
      if (room.phase !== "lobby") throw new RoomError("This match has already started.", 409);
      beginMatch(room, body.fillAI === true);
      break;
    case "roll":
    case "move": {
      if (room.phase !== "playing") throw new RoomError("There is no active match.", 409);
      const game = room.game;
      if (game.players[game.current]?.id !== seat.id) throw new RoomError("Wait for your turn.", 403, "not_your_turn");
      if (body.action === "roll") {
        if (game.phase !== "roll") throw new RoomError("Choose a piece before rolling again.", 409);
        room.game = applyRoll(game, fairDie());
      } else {
        if (game.phase !== "move") throw new RoomError("Roll the dice first.", 409);
        if (!Number.isInteger(body.piece) || !game.legal.includes(body.piece)) throw new RoomError("Choose a highlighted piece.");
        room.game = applyMove(game, body.piece);
      }
      synchronizeGame(room);
      break;
    }
    case "rematch":
      requireHost(room, seat);
      if (room.phase !== "finished") throw new RoomError("Finish this match before a rematch.", 409);
      // A rematch returns to the lobby; the host explicitly starts the next game.
      room.phase = "lobby"; room.game = null; room.nextActionAt = 0;
      room.players = room.players.filter(player => player.type === "human");
      break;
    case "leave":
      if (room.phase === "lobby") {
        room.players = room.players.filter(player => player.id !== seat.id);
        if (room.hostId === seat.id) room.hostId = room.players.find(player => player.type === "human")?.id || "";
      } else seat.lastSeen = 0; // Keep the seat/token for reconnection.
      break;
    case "replace": {
      requireHost(room, seat);
      if (room.phase !== "playing") throw new RoomError("Players can be replaced during a match.");
      const target = room.players.find(player => player.id === body.playerId);
      if (!target || target.type !== "human" || target.id === seat.id) throw new RoomError("Choose a disconnected player.");
      if (Date.now() - target.lastSeen < DISCONNECTED_AFTER) throw new RoomError("Wait 60 seconds for your friend to reconnect.", 409);
      target.type = "ai"; delete target.tokenHash; target.name = `${target.name.slice(0, 14)} · Bot`;
      const gamePlayer = room.game.players.find((player: any) => player.id === target.id);
      gamePlayer.type = "ai"; gamePlayer.name = target.name; gamePlayer.difficulty = room.difficulty;
      scheduleBot(room);
      break;
    }
    case "claim-host": {
      const previousHost = room.players.find(player => player.id === room.hostId);
      if (previousHost && Date.now() - previousHost.lastSeen < DISCONNECTED_AFTER) throw new RoomError("The host is still connected.", 409);
      room.hostId = seat.id;
      break;
    }
    default: throw new RoomError("Unknown room action.");
  }
  await saveRoom(db, room);
  return json({ room: publicRoom(room), playerId: seat.id });
}

export async function handleRooms(request: Request, db: D1Database | undefined, codeInput?: string, limits: Limits = {}): Promise<Response> {
  try {
    if (!db) throw new RoomError("Online rooms are temporarily unavailable. You can still play locally.", 503, "rooms_unavailable");
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) throw new RoomError("This request must come from the game.", 403);
    if (request.method !== "GET" && request.method !== "POST") throw new RoomError("Unsupported method.", 405);
    const body = request.method === "POST" ? await bodyOf(request) : {};
    if (!codeInput) {
      if (request.method !== "POST" || body.action !== "create") throw new RoomError("Create a room first.");
      await rateLimit(request, limits.create);
      return await createRoom(db, body);
    }
    const code = codeInput.trim().toUpperCase();
    if (!/^[A-HJ-NP-Z2-9]{6}$/.test(code)) throw new RoomError("Enter a six-character room code.");
    const joining = request.method === "POST" && body.action === "join";
    // A missing or malformed token is refused before any D1 read.
    if (!joining && !/^Bearer [a-f0-9]{64}$/i.test(request.headers.get("authorization") || "")) throw new RoomError("Join this room to play.", 401, "join_required");
    await rateLimit(request, joining ? limits.join : limits.action);
    let room = await loadRoom(db, code);
    if (joining) return await joinRoom(db, room, body);
    const seat = await member(request, room);
    if (request.method === "GET") {
      await heartbeat(db, room, seat);
      room = await advanceBot(db, room);
      return json({ room: publicRoom(room), playerId: seat.id });
    }
    return await act(db, room, seat, body);
  } catch (error) {
    if (error instanceof RoomError) return json({ error: error.message, code: error.code }, error.status);
    console.error("Ludo room error:", error instanceof Error ? error.message : "Unknown error");
    return json({ error: "The room could not update. Your match is saved; try again.", code: "server_error" }, 500);
  }
}
