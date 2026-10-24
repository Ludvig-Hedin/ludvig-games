import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { handleRooms, MAX_ROOMS } from "../lib/rooms.ts";

// SQLite executes the actual SQL, including JSON updates and CAS predicates.
// Only the small asynchronous D1 transport interface is adapted for Node.
function database() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("CREATE TABLE rooms (code TEXT PRIMARY KEY, state TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL)");
  return {
    sqlite,
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      return { bind(...values) { return {
        async first() { return statement.get(...values) || null; },
        async run() { const result = statement.run(...values); return { meta: { changes: Number(result.changes) } }; },
      }; } };
    },
  };
}

let requestId = 0;
async function call(db, body, { code, token, method = "POST", origin } = {}) {
  const headers = { "content-type": "application/json", "cf-connecting-ip": `test-${++requestId}` };
  if (token) headers.authorization = `Bearer ${token}`;
  if (origin) headers.origin = origin;
  const request = new Request(`https://ludo.example/api/rooms${code ? "/" + code : ""}`, {
    method, headers, ...(method !== "GET" ? { body: JSON.stringify(body) } : {}),
  });
  const response = await handleRooms(request, db, code);
  return { status: response.status, data: await response.json() };
}
async function create(db, extra = {}) {
  const result = await call(db, { action: "create", name: "Ludvig", maxPlayers: 2, ...extra });
  assert.equal(result.status, 201);
  return result.data;
}
async function joined(db) {
  const host = await create(db);
  const guest = await call(db, { action: "join", name: "Guest" }, { code: host.room.code });
  assert.equal(guest.status, 200);
  return { host, guest: guest.data, code: host.room.code };
}
function readInternal(db, code) {
  return JSON.parse(db.sqlite.prepare("SELECT state FROM rooms WHERE code=?").get(code).state);
}
function writeInternal(db, room) {
  db.sqlite.prepare("UPDATE rooms SET state=?, version=? WHERE code=?").run(JSON.stringify(room), room.version, room.code);
}

test("room creation returns an invite code and secret seat token, but never public hashes", async () => {
  const db = database();
  const host = await create(db);
  assert.match(host.room.code, /^[A-HJ-NP-Z2-9]{6}$/);
  assert.match(host.token, /^[a-f0-9]{64}$/);
  assert.equal(host.room.players[0].id, host.playerId);
  assert.equal(host.room.players[0].color, 3);
  assert.equal(host.room.rules.safeSquares, true);
  assert.equal(JSON.stringify(host.room).includes("tokenHash"), false);
  const internal = readInternal(db, host.room.code);
  assert.match(internal.players[0].tokenHash, /^[a-f0-9]{64}$/);
  assert.notEqual(internal.players[0].tokenHash, host.token);
  assert.equal(JSON.stringify(internal).includes(host.token), false);
});

test("reads require membership and a reconnected bearer resumes the same seat", async () => {
  const db = database(), host = await create(db);
  assert.equal((await call(db, null, { code: host.room.code, method: "GET" })).status, 401);
  assert.equal((await call(db, null, { code: host.room.code, token: "f".repeat(64), method: "GET" })).status, 401);
  const resumed = await call(db, null, { code: host.room.code, token: host.token, method: "GET" });
  assert.equal(resumed.status, 200);
  assert.equal(resumed.data.playerId, host.playerId);
});

test("joining respects capacity, diagonal colors, and host-only starting", async () => {
  const db = database(), { host, guest, code } = await joined(db);
  assert.deepEqual(guest.room.players.map(p => p.color), [3, 1]);
  assert.equal((await call(db, { action: "join", name: "Third" }, { code })).status, 409);
  const denied = await call(db, { action: "start", version: guest.room.version }, { code, token: guest.token });
  assert.equal(denied.status, 403);
  const started = await call(db, { action: "start", version: guest.room.version }, { code, token: host.token });
  assert.equal(started.status, 200);
  assert.equal(started.data.room.phase, "playing");
  assert.equal(started.data.room.game.players.length, 2);
  assert.equal(JSON.stringify(started.data).includes("tokenHash"), false);
  assert.equal((await call(db, { action: "join", name: "Late" }, { code })).status, 409);
});

test("a lone host can start a mixed room with server-controlled bots", async () => {
  const db = database(), host = await create(db, { maxPlayers: 4, difficulty: "expert", rules: { mode: "quick", safeSquares: false } });
  assert.equal((await call(db, { action: "start", version: 0 }, { code: host.room.code, token: host.token })).status, 400);
  const started = await call(db, { action: "start", version: 0, fillAI: true }, { code: host.room.code, token: host.token });
  assert.equal(started.status, 200);
  const game = started.data.room.game;
  assert.equal(game.players.length, 4);
  assert.equal(game.players.filter(p => p.type === "ai").length, 3);
  assert.equal(game.players.every(p => p.difficulty === "expert" && p.pieces.length === 2), true);
  assert.equal(game.rules.safeSquares, false);
});

test("a roll is server-generated and concurrent duplicate submissions commit once", async () => {
  const db = database(), { host, guest, code } = await joined(db);
  const start = await call(db, { action: "start", version: guest.room.version }, { code, token: host.token });
  const version = start.data.room.version;
  const denied = await call(db, { action: "roll", version }, { code, token: guest.token });
  assert.equal(denied.status, 403);
  const attempts = await Promise.all([
    call(db, { action: "roll", version, face: 10000 }, { code, token: host.token }),
    call(db, { action: "roll", version, face: 10000 }, { code, token: host.token }),
  ]);
  assert.deepEqual(attempts.map(r => r.status).sort(), [200, 409]);
  const saved = readInternal(db, code);
  assert.equal(saved.version, version + 1);
  assert.equal(saved.game.revision, 1);
  assert.ok(saved.game.lastAction.face >= 1 && saved.game.lastAction.face <= 6);
});

test("out-of-phase and illegal moves cannot change the saved board", async () => {
  const db = database(), host = await create(db);
  const start = await call(db, { action: "start", fillAI: true, version: 0 }, { code: host.room.code, token: host.token });
  const version = start.data.room.version;
  assert.equal((await call(db, { action: "move", piece: 0, version }, { code: host.room.code, token: host.token })).status, 409);
  assert.equal((await call(db, { action: "roll", version: version - 1 }, { code: host.room.code, token: host.token })).status, 409);
  assert.equal(readInternal(db, host.room.code).version, version);
});

test("simultaneous bot polls perform one authoritative action", async () => {
  const db = database(), host = await create(db);
  await call(db, { action: "start", fillAI: true, version: 0 }, { code: host.room.code, token: host.token });
  const before = readInternal(db, host.room.code);
  before.game.current = 1;
  before.nextActionAt = Date.now() - 100;
  writeInternal(db, before);
  const reads = await Promise.all([
    call(db, null, { code: host.room.code, token: host.token, method: "GET" }),
    call(db, null, { code: host.room.code, token: host.token, method: "GET" }),
  ]);
  assert.equal(reads.every(r => r.status === 200), true);
  const after = readInternal(db, host.room.code);
  assert.equal(after.version, before.version + 1);
  assert.equal(after.game.revision, before.game.revision + 1);
});

test("heartbeat updates presence without advancing game version", async () => {
  const db = database(), host = await create(db);
  const before = readInternal(db, host.room.code);
  before.players[0].lastSeen = Date.now() - 90_000;
  writeInternal(db, before);
  const result = await call(db, null, { code: host.room.code, token: host.token, method: "GET" });
  assert.equal(result.status, 200);
  assert.equal(result.data.room.version, 0);
  assert.equal(result.data.room.players[0].connected, true);
  assert.ok(readInternal(db, host.room.code).players[0].lastSeen > Date.now() - 1000);
});

test("host transfer on lobby exit and disconnected replacement respect permissions", async () => {
  const db = database(), { host, guest, code } = await joined(db);
  const start = await call(db, { action: "start", version: guest.room.version }, { code, token: host.token });
  const denied = await call(db, { action: "replace", playerId: guest.playerId, version: start.data.room.version }, { code, token: host.token });
  assert.equal(denied.status, 409);
  const state = readInternal(db, code);
  state.players[1].lastSeen = Date.now() - 65_000;
  writeInternal(db, state);
  const replaced = await call(db, { action: "replace", playerId: guest.playerId, version: state.version }, { code, token: host.token });
  assert.equal(replaced.status, 200);
  assert.equal(replaced.data.room.players[1].type, "ai");
  assert.equal(replaced.data.room.game.players[1].type, "ai");
  assert.equal((await call(db, null, { code, token: guest.token, method: "GET" })).status, 401);
  const second = await joined(db);
  const left = await call(db, { action: "leave", version: second.guest.room.version }, { code: second.code, token: second.host.token });
  assert.equal(left.status, 200);
  assert.equal(left.data.room.hostId, second.guest.playerId);
});

test("rematch preserves humans and returns to a fresh lobby", async () => {
  const db = database(), host = await create(db);
  await call(db, { action: "start", fillAI: true, version: 0 }, { code: host.room.code, token: host.token });
  const state = readInternal(db, host.room.code);
  state.phase = "finished"; state.game.phase = "finished"; state.game.winner = 0;
  writeInternal(db, state);
  const result = await call(db, { action: "rematch", version: state.version }, { code: host.room.code, token: host.token });
  assert.equal(result.status, 200);
  assert.equal(result.data.room.phase, "lobby");
  assert.equal(result.data.room.game, null);
  assert.equal(result.data.room.players.length, 1);
  assert.equal(result.data.room.players[0].id, host.playerId);
});

test("malformed inputs and foreign origins fail without a database write", async () => {
  const db = database();
  assert.equal((await call(db, { action: "create", name: "", maxPlayers: 2 })).status, 400);
  assert.equal((await call(db, { action: "create", name: "Guest", maxPlayers: 5 })).status, 400);
  assert.equal((await call(db, { action: "create", name: "Guest", rules: { mode: "cheat" } })).status, 400);
  assert.equal((await call(db, { action: "create", name: "Guest" }, { origin: "https://evil.example" })).status, 403);
  assert.equal((await call(db, { action: "create", name: "x".repeat(5000) })).status, 413);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS total FROM rooms").get().total, 0);
});

test("Free account: rate-limited, malformed and capped requests write nothing to D1", async () => {
  const db = database();
  const host = await create(db);
  const code = host.room.code;
  const writes = () => db.sqlite.prepare("SELECT total_changes() AS n").get().n;
  const blocked = { create: { limit: async () => ({ success: false }) }, join: { limit: async () => ({ success: false }) }, action: { limit: async () => ({ success: false }) } };
  const send = (body, path, extra = {}) => handleRooms(new Request(`https://ludo.example/api/rooms${path ? "/" + path : ""}`, {
    method: extra.method || "POST", headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.4", ...(extra.token ? { authorization: `Bearer ${extra.token}` } : {}) },
    ...(extra.method === "GET" ? {} : { body: JSON.stringify(body) }),
  }), db, path, blocked);
  const before = writes();
  assert.equal((await send({ action: "create", name: "Flood" })).status, 429);
  assert.equal((await send({ action: "join", name: "Flood" }, code)).status, 429);
  assert.equal((await send({}, code, { method: "GET", token: host.token })).status, 429);
  assert.equal((await call(db, {}, { code, method: "GET", token: "nothex" })).status, 401);
  assert.equal((await call(db, { action: "join", name: "Ghost" }, { code: "ZZZZ22" })).status, 404);
  assert.equal(writes(), before);
  const insert = db.sqlite.prepare("INSERT INTO rooms (code, state, version, updated_at) VALUES (?, '{}', 0, ?)");
  for (let i = 1; i < MAX_ROOMS; i++) insert.run(`F${i}`, Date.now());
  const full = writes();
  assert.equal((await call(db, { action: "create", name: "Late", maxPlayers: 2 })).status, 503);
  assert.equal(writes(), full);
});
