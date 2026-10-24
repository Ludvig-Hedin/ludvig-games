import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { actInRoom, createRoom, getRoom, joinRoom, MAX_ROOMS, publicRoomState, readBody, RoomError, type RoomRow } from "../lib/rooms";
import { randomFleet, cellsFor, newGame } from "../lib/game";

// SQLite executes the exact statements used by D1. Async wrappers exercise the
// optimistic-lock retry path when requests overlap without needing a live account.
function database() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`CREATE TABLE naval_rooms (code TEXT PRIMARY KEY, version INTEGER NOT NULL, data TEXT NOT NULL, p0_hash TEXT NOT NULL UNIQUE, p1_hash TEXT, p0_seen INTEGER NOT NULL, p1_seen INTEGER NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, expires_at INTEGER NOT NULL);
    CREATE TABLE naval_rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL);`);
  const db = {
    prepare(sql: string) {
      const statement = sqlite.prepare(sql);
      let values: any[] = [];
      const query = {
        bind(...args: any[]) { values = args; return query; },
        async first() { return statement.get(...values) ?? null; },
        async run() { const result = statement.run(...values); return { success: true, meta: { changes: Number(result.changes) } }; },
        async all() { return { results: statement.all(...values), success: true }; },
      };
      return query;
    },
    async batch(queries: any[]) { return Promise.all(queries.map(q => q.run())); },
  };
  return { db: db as unknown as D1Database, sqlite };
}
function request(token?: string) {
  return new Request("https://game.example/api/rooms", {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}
async function start() {
  const { db, sqlite } = database();
  const a = await createRoom(db, request(), { name: "Alpha" });
  const b = await joinRoom(db, request(), a.code, { name: "Bravo" });
  const fleetA = randomFleet();
  const fleetB = randomFleet();
  await actInRoom(db, request(a.token), a.code, { type: "place", fleet: fleetA });
  await actInRoom(db, request(b.token), a.code, { type: "place", fleet: fleetB });
  return { db, sqlite, a, b, fleetA, fleetB };
}

test("a room survives separate requests and never exposes another fleet or tokens", async () => {
  const { db, sqlite, a, b, fleetA } = await start();
  const state = await getRoom(db, request(a.token), a.code);
  assert.equal(state.phase, "battle");
  assert.equal(state.players[1]?.name, "Bravo");
  assert.deepEqual(state.ownFleet, fleetA);
  assert.deepEqual(state.opponentSunk, []);
  assert.deepEqual(state.ownShots, []);
  assert.equal("fleets" in state, false);
  assert.equal("game" in state, false);
  const serialized = JSON.stringify(state);
  assert.equal(serialized.includes(a.token), false);
  assert.equal(serialized.includes(b.token), false);
  const row = sqlite.prepare("SELECT * FROM naval_rooms WHERE code = ?").get(a.code) as unknown as RoomRow;
  assert.notEqual(row.p0_hash, a.token);
  assert.notEqual(row.p1_hash, b.token);
  assert.equal(row.p0_hash.length, 64);
  assert.equal(serialized.includes(row.p0_hash), false);
  sqlite.close();
});

test("bad or absent bearer tokens cannot read hidden room state", async () => {
  const { db, sqlite, a } = await start();
  await assert.rejects(() => getRoom(db, request(), a.code), (e: unknown) => e instanceof RoomError && e.status === 401);
  await assert.rejects(() => getRoom(db, request("a".repeat(64)), a.code), (e: unknown) => e instanceof RoomError && e.status === 401);
  sqlite.close();
});

test("two concurrent joins claim at most one guest seat", async () => {
  const { db, sqlite } = database();
  const a = await createRoom(db, request(), { name: "Alpha" });
  const results = await Promise.allSettled([
    joinRoom(db, request(), a.code, { name: "Bravo" }),
    joinRoom(db, request(), a.code, { name: "Charlie" }),
  ]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  assert.equal(results.filter(r => r.status === "rejected").length, 1);
  const state = await getRoom(db, request(a.token), a.code);
  assert.equal(state.version, 2);
  assert.ok(["Bravo", "Charlie"].includes(state.players[1]!.name));
  sqlite.close();
});

test("server rejects wrong turns and concurrent duplicate shot requests", async () => {
  const { db, sqlite, a, b } = await start();
  await assert.rejects(() => actInRoom(db, request(b.token), a.code, { type: "shot", x: 1, y: 1 }), /turn/i);
  const outcomes = await Promise.allSettled([
    actInRoom(db, request(a.token), a.code, { type: "shot", x: 1, y: 1 }),
    actInRoom(db, request(a.token), a.code, { type: "shot", x: 2, y: 2 }),
  ]);
  assert.equal(outcomes.filter(r => r.status === "fulfilled").length, 1);
  const state = await getRoom(db, request(a.token), a.code);
  assert.equal(state.ownShots.length, 1);
  assert.equal(state.turn, 1);
  sqlite.close();
});

test("request replay is idempotent and stale versions cannot mutate state", async () => {
  const { db, sqlite, a } = await start();
  const state = await getRoom(db, request(a.token), a.code);
  const action = { type: "shot", x: 1, y: 1, requestId: "same-request-001", expectedVersion: state.version };
  const first = await actInRoom(db, request(a.token), a.code, action);
  const replay = await actInRoom(db, request(a.token), a.code, action);
  assert.equal(replay.version, first.version);
  assert.equal(replay.ownShots.length, 1);
  await assert.rejects(() => actInRoom(db, request(a.token), a.code, { type: "shot", x: 9, y: 9, expectedVersion: state.version }),
    (e: unknown) => e instanceof RoomError && e.code === "stale_version");
  sqlite.close();
});

test("only confirmed sunk opponents are revealed", () => {
  const fleet = randomFleet();
  const game = newGame();
  game.fleets = [randomFleet(), fleet];
  game.shots[0] = [{ ...cellsFor(fleet[0])[0], result: "hit" }];
  const data = { game, names: ["A", "B"], rematch: [false, false], left: [false, false], requests: [[], []], lastAction: null, lastMove: [0, 0], round: 0 };
  const row: RoomRow = { code: "ABCDEF", version: 1, data: JSON.stringify(data), p0_hash: "private", p1_hash: "secret", p0_seen: Date.now(), p1_seen: Date.now(), created_at: 0, updated_at: 0, expires_at: Date.now() + 10000 };
  assert.deepEqual(publicRoomState(row, 0).opponentSunk, []);
  game.shots[0].push({ ...cellsFor(fleet[0])[1], result: "sunk", sunk: { id: fleet[0].id, cells: cellsFor(fleet[0]) } });
  row.data = JSON.stringify(data);
  const state = publicRoomState(row, 0);
  assert.deepEqual(state.opponentSunk, [fleet[0]]);
  assert.equal(state.opponentSunk.length, 1);
});

test("surrender finishes the battle and rematch requires both players", async () => {
  const { db, sqlite, a, b } = await start();
  const left = await actInRoom(db, request(b.token), a.code, { type: "leave" });
  assert.equal(left.phase, "finished");
  assert.equal(left.winner, 0);
  const host = await getRoom(db, request(a.token), a.code);
  assert.equal(host.opponentLeft, true);
  assert.equal(host.players[1]!.connected, false);
  await assert.rejects(() => actInRoom(db, request(a.token), a.code, { type: "rematch" }), /left/i);
  sqlite.close();
});

test("expired rooms and cross-origin JSON writes are rejected", async () => {
  const { db, sqlite } = database();
  const a = await createRoom(db, request(), {});
  sqlite.prepare("UPDATE naval_rooms SET expires_at = 0 WHERE code = ?").run(a.code);
  await assert.rejects(() => getRoom(db, request(a.token), a.code), (e: unknown) => e instanceof RoomError && e.status === 404);
  await assert.rejects(() => readBody(new Request("https://game.example/api/rooms", { method: "POST", body: "{}", headers: { "Content-Type": "application/json", origin: "https://elsewhere.example" } })), (e: unknown) => e instanceof RoomError && e.status === 403);
  const oversized = new Request("https://game.example/api/rooms", {method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({name:"x".repeat(13000)})});
  await assert.rejects(() => readBody(oversized), (e: unknown) => e instanceof RoomError && e.status === 413);
  assert.deepEqual(await readBody(new Request("https://game.example/api/rooms", {method:"POST",headers:{"Content-Type":"application/json"},body:'{"name":"Alpha"}'})), {name:"Alpha"});
  sqlite.close();
});


test("lost create and join responses are recoverable with pre-persisted tokens", async () => {
  const { db, sqlite } = database();
  const hostToken = "1".repeat(64);
  const guestToken = "2".repeat(64);
  const [first, duplicate] = await Promise.all([
    createRoom(db, request(), { name: "Host", resumeToken: hostToken }),
    createRoom(db, request(), { name: "Host", resumeToken: hostToken }),
  ]);
  assert.equal(first.code, duplicate.code);
  const joined = await joinRoom(db, request(), first.code, { name: "Guest", resumeToken: guestToken });
  const recovered = await joinRoom(db, request(), first.code, { name: "Guest", resumeToken: guestToken });
  assert.equal(joined.token, recovered.token);
  assert.equal(joined.state.version, recovered.state.version);
  assert.equal(recovered.player, 1);
  assert.equal((sqlite.prepare("SELECT COUNT(*) AS n FROM naval_rooms").get() as {n:number}).n, 1);
  sqlite.close();
});

test("two rematch votes reset once and old vote replays cannot reset the new round", async () => {
  const { db, sqlite, a, b } = await start();
  const row = sqlite.prepare("SELECT * FROM naval_rooms WHERE code = ?").get(a.code) as unknown as RoomRow;
  const data = JSON.parse(row.data);
  data.game.phase = "finished";
  data.game.winner = 0;
  sqlite.prepare("UPDATE naval_rooms SET data = ? WHERE code = ?").run(JSON.stringify(data), a.code);
  const actions = [{type: "rematch", requestId: "rematch-alpha-01"}, {type: "rematch", requestId: "rematch-bravo-01"}];
  await Promise.all([
    actInRoom(db, request(a.token), a.code, actions[0]),
    actInRoom(db, request(b.token), a.code, actions[1]),
  ]);
  const state = await getRoom(db, request(a.token), a.code);
  assert.equal(state.phase, "placement");
  assert.equal(state.turn, 1);
  assert.equal(state.ownFleet, null);
  assert.deepEqual(state.ownShots, []);
  assert.deepEqual(state.enemyShots, []);
  assert.deepEqual(state.rematch, [false, false]);
  const replayA = await actInRoom(db, request(a.token), a.code, actions[0]);
  const replayB = await actInRoom(db, request(b.token), a.code, actions[1]);
  assert.equal(replayA.version, state.version);
  assert.equal(replayB.version, state.version);
  assert.equal(replayA.turn, 1);
  sqlite.close();
});

test("simultaneous Ready with version checks preserves fleets and supports refreshed retry", async () => {
  const { db, sqlite } = database();
  const a = await createRoom(db, request(), {});
  const b = await joinRoom(db, request(), a.code, {});
  const fleetA = randomFleet(), fleetB = randomFleet();
  const version = b.state.version;
  const outcomes = await Promise.allSettled([
    actInRoom(db, request(a.token), a.code, {type: "place", fleet: fleetA, expectedVersion: version, requestId: "ready-alpha-01"}),
    actInRoom(db, request(b.token), a.code, {type: "place", fleet: fleetB, expectedVersion: version, requestId: "ready-bravo-01"}),
  ]);
  assert.equal(outcomes.filter(r => r.status === "fulfilled").length, 1);
  const retryPlayer = outcomes[0].status === "rejected" ? a : b;
  const retryFleet = outcomes[0].status === "rejected" ? fleetA : fleetB;
  const state = await getRoom(db, request(retryPlayer.token), a.code);
  const done = await actInRoom(db, request(retryPlayer.token), a.code, {type: "place", fleet: retryFleet, expectedVersion: state.version, requestId: outcomes[0].status === "rejected" ? "ready-alpha-01" : "ready-bravo-01"});
  assert.equal(done.phase, "battle");
  assert.deepEqual((await getRoom(db, request(a.token), a.code)).ownFleet, fleetA);
  assert.deepEqual((await getRoom(db, request(b.token), a.code)).ownFleet, fleetB);
  sqlite.close();
});

test("Free account: rate-limited and capped requests write nothing to D1", async () => {
  const { db, sqlite } = database();
  const writes = () => (sqlite.prepare("SELECT total_changes() AS n").get() as {n:number}).n;
  const edge = (token?: string) => new Request("https://game.example/api/rooms", { headers: { "cf-connecting-ip": "203.0.113.9", ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
  const blocked = { create: { limit: async () => ({ success: false }) }, join: { limit: async () => ({ success: false }) } };
  const before = writes();
  await assert.rejects(() => createRoom(db, edge(), { name: "Flood" }, blocked), (e: unknown) => e instanceof RoomError && e.status === 429);
  const a = await createRoom(db, request(), { name: "Alpha" });
  const afterCreate = writes();
  assert.ok(afterCreate > before);
  await assert.rejects(() => joinRoom(db, edge(), a.code, { name: "Flood" }, blocked), (e: unknown) => e instanceof RoomError && e.status === 429);
  await assert.rejects(() => joinRoom(db, request(), "ZZZZ22", { name: "Ghost" }), (e: unknown) => e instanceof RoomError && e.status === 404);
  await assert.rejects(() => getRoom(db, request("bad"), a.code), (e: unknown) => e instanceof RoomError && e.status === 401);
  assert.equal(writes(), afterCreate);
  // Global cap: once MAX_ROOMS rooms are live, a new create is refused without a write.
  const insert = sqlite.prepare("INSERT INTO naval_rooms (code, version, data, p0_hash, p1_hash, p0_seen, p1_seen, created_at, updated_at, expires_at) VALUES (?, 1, '{}', ?, NULL, 0, 0, 0, 0, ?)");
  for (let i = 1; i < MAX_ROOMS; i++) insert.run(`F${i}`, `h${i}`, Date.now() + 60_000);
  const full = writes();
  await assert.rejects(() => createRoom(db, request(), { name: "Late" }), (e: unknown) => e instanceof RoomError && e.status === 503);
  assert.equal(writes(), full);
  sqlite.close();
});
