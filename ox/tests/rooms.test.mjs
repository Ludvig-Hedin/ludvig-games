import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
import { getTableConfig } from 'drizzle-orm/sqlite-core';
import { handleRoomRequest } from '../lib/rooms.ts';
import { rooms } from '../db/schema.ts';

const migrations = readdirSync(new URL('../drizzle/', import.meta.url)).filter((name) => name.endsWith('.sql')).sort();
// Use real migrations once generated. During parallel implementation, the same
// declared Drizzle schema can initialize SQLite without touching migration files.
const table = getTableConfig(rooms);
const declaredSchema = `CREATE TABLE "${table.name}" (${table.columns.map((column) =>
  `"${column.name}" ${column.getSQLType()}${column.primary ? ' PRIMARY KEY' : ''}${column.notNull ? ' NOT NULL' : ''}${column.default !== undefined ? ` DEFAULT ${JSON.stringify(column.default)}` : ''}`
).join(', ')});`;
const schema = migrations.length
  ? migrations.map((name) => readFileSync(new URL(`../drizzle/${name}`, import.meta.url), 'utf8')).join('\n')
  : declaredSchema;

// Actual SQLite executes the same SQL as D1, including atomic revision predicates.
// The async boundary makes simultaneous requests race instead of serializing the handler.
class TestD1 {
  constructor() {
    this.sqlite = new DatabaseSync(':memory:');
    this.sqlite.exec(schema);
  }
  prepare(sql) {
    const sqlite = this.sqlite;
    let values = [];
    return {
      bind(...next) { values = next; return this; },
      async first() {
        await new Promise((resolve) => queueMicrotask(resolve));
        return sqlite.prepare(sql).get(...values) ?? null;
      },
      async run() {
        await new Promise((resolve) => queueMicrotask(resolve));
        const result = sqlite.prepare(sql).run(...values);
        return { success: true, meta: { changes: Number(result.changes) } };
      },
    };
  }
}

async function request(db, action, { code = '', token, body = {}, headers = {}, method } = {}) {
  const actualMethod = method || (action === 'read' ? 'GET' : 'POST');
  const req = new Request(`https://ox.example/api/rooms${code ? '/' + code : ''}${action === 'create' || action === 'read' ? '' : '/' + action}`, {
    method: actualMethod,
    headers: {
      ...(actualMethod !== 'GET' ? { 'Content-Type': 'application/json', Origin: 'https://ox.example' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    ...(actualMethod !== 'GET' ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}),
  });
  const response = await handleRoomRequest(req, db, action, code);
  assert.match(response.headers.get('cache-control'), /no-store/);
  return { status: response.status, ...(await response.json()) };
}

async function pair(db, settings = {}) {
  const x = await request(db, 'create', { body: settings });
  assert.equal(x.status, 201);
  const o = await request(db, 'join', { code: x.code });
  assert.equal(o.status, 200);
  return { x, o, code: x.code, room: o.room };
}

async function play(db, players, indices) {
  let room = (await request(db, 'read', { code: players.code, token: players.x.token })).room;
  for (const index of indices) {
    const token = room.state.turn === 'X' ? players.x.token : players.o.token;
    const result = await request(db, 'move', { code: players.code, token, body: { index, revision: room.revision } });
    assert.equal(result.status, 200, JSON.stringify(result));
    room = result.room;
  }
  return room;
}

test('Room identity, hashed bearer sessions, privacy, and two-player capacity', async () => {
  const db = new TestD1();
  const x = await request(db, 'create');
  assert.equal(x.status, 201);
  assert.match(x.code, /^[A-HJ-NP-Z2-9]{8}$/);
  assert.match(x.token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(x.role, 'X');
  assert.equal(x.room.matchNumber, 1);
  assert.equal(x.room.joined, false);
  assert.equal(x.room.state.board.length, 9);
  assert.equal(x.room.opponentSeenAt, null);
  const stored = db.sqlite.prepare('SELECT * FROM rooms WHERE code = ?').get(x.code);
  assert.match(stored.x_token_hash, /^[a-f0-9]{64}$/);
  assert.notEqual(stored.x_token_hash, x.token);
  assert.ok(!JSON.stringify(x.room).includes('token'));
  assert.equal((await request(db, 'read', { code: x.code })).status, 401);
  assert.equal((await request(db, 'read', { code: x.code, token: 'a'.repeat(43) })).status, 403);
  assert.equal((await request(db, 'move', { code: x.code, token: x.token, body: { index: 0, revision: 1 } })).code, 'waiting_for_friend');
  const o = await request(db, 'join', { code: x.code.toLowerCase() });
  assert.equal(o.status, 200);
  assert.equal(o.role, 'O');
  assert.notEqual(o.token, x.token);
  assert.equal(o.room.joined, true);
  assert.equal((await request(db, 'join', { code: x.code })).code, 'room_full');
  assert.equal((await request(db, 'read', { code: x.code, token: o.token })).status, 200);
});

test('Server rejects illegal squares, stale revisions, wrong turns, and forged symbols', async () => {
  const db = new TestD1();
  const p = await pair(db);
  assert.equal((await request(db, 'move', { code: p.code, token: p.o.token, body: { index: 0, revision: p.room.revision } })).code, 'wrong_turn');
  for (const index of [-1, 9, 1.5, null, '0']) {
    assert.equal((await request(db, 'move', { code: p.code, token: p.x.token, body: { index, revision: p.room.revision } })).status, 400);
  }
  const first = await request(db, 'move', { code: p.code, token: p.x.token, body: { index: 0, revision: p.room.revision, mark: 'O' } });
  assert.equal(first.status, 200);
  assert.equal(first.room.state.board[0], 'X');
  assert.equal(first.room.state.turn, 'O');
  assert.equal((await request(db, 'move', { code: p.code, token: p.x.token, body: { index: 1, revision: p.room.revision } })).code, 'state_changed');
  assert.equal((await request(db, 'move', { code: p.code, token: p.x.token, body: { index: 1, revision: first.room.revision } })).code, 'wrong_turn');
  assert.equal((await request(db, 'move', { code: p.code, token: p.o.token, body: { index: 0, revision: first.room.revision } })).code, 'invalid_move');
  assert.equal((await request(db, 'read', { code: p.code, token: p.o.token })).room.state.moves, 1);
});

test('Concurrent joins admit only one guest; concurrent moves change exactly one square', async () => {
  const db = new TestD1();
  const x = await request(db, 'create');
  const joins = await Promise.all([request(db, 'join', { code: x.code }), request(db, 'join', { code: x.code })]);
  assert.deepEqual(joins.map((r) => r.status).sort(), [200, 409]);
  const room = joins.find((r) => r.status === 200).room;
  const moves = await Promise.all([0, 1].map((index) => request(db, 'move', { code: x.code, token: x.token, body: { index, revision: room.revision } })));
  assert.deepEqual(moves.map((r) => r.status).sort(), [200, 409]);
  const current = (await request(db, 'read', { code: x.code, token: x.token })).room;
  assert.equal(current.state.board.filter(Boolean).length, 1);
  assert.equal(current.state.moves, 1);
  assert.equal(current.revision, room.revision + 1);
});

test('Wins score once, rematches require both votes, and a new series advances matchNumber', async () => {
  const db = new TestD1();
  const p = await pair(db, { length: 3 });
  const won = await play(db, p, [0, 3, 1, 4, 2]);
  assert.equal(won.state.winner, 'X');
  assert.equal(won.state.scores.X, 1);
  assert.equal(won.state.matchWinner, null);
  const illegal = await request(db, 'move', { code: p.code, token: p.x.token, body: { index: 8, revision: won.revision } });
  assert.equal(illegal.status, 409);
  assert.equal(illegal.room.state.scores.X, 1);
  const voteX = await request(db, 'rematch', { code: p.code, token: p.x.token, body: { round: 1, matchNumber: 1 } });
  assert.deepEqual(voteX.room.ready, { X: true, O: false });
  const duplicate = await request(db, 'rematch', { code: p.code, token: p.x.token });
  assert.equal(duplicate.room.revision, voteX.room.revision);
  const next = await request(db, 'rematch', { code: p.code, token: p.o.token, body: { round: 1, matchNumber: 1 } });
  assert.equal(next.room.state.round, 2);
  assert.equal(next.room.state.turn, 'O');
  assert.deepEqual(next.room.ready, { X: false, O: false });
  assert.equal(next.room.state.scores.X, 1);
  const seriesWon = await play(db, p, [3, 0, 4, 1, 8, 2]);
  assert.equal(seriesWon.state.scores.X, 2);
  assert.equal(seriesWon.state.matchWinner, 'X');
  const votes = await Promise.all([
    request(db, 'rematch', { code: p.code, token: p.x.token, body: { round: 2, matchNumber: 1 } }),
    request(db, 'rematch', { code: p.code, token: p.o.token, body: { round: 2, matchNumber: 1 } }),
  ]);
  assert.ok(votes.every((r) => r.status === 200));
  const restarted = (await request(db, 'read', { code: p.code, token: p.x.token })).room;
  assert.equal(restarted.matchNumber, 2);
  assert.equal(restarted.state.round, 1);
  assert.equal(restarted.state.starter, 'X');
  assert.deepEqual(restarted.state.scores, { X: 0, O: 0, draw: 0 });
  assert.equal(restarted.state.board.filter(Boolean).length, 0);
});

test('Draws do not award series wins; larger boards use the declared four-in-a-row rule', async () => {
  const db = new TestD1();
  const p = await pair(db);
  const drawn = await play(db, p, [0, 1, 2, 4, 3, 5, 7, 6, 8]);
  assert.equal(drawn.state.draw, true);
  assert.equal(drawn.state.winner, null);
  assert.deepEqual(drawn.state.scores, { X: 0, O: 0, draw: 1 });
  for (const size of [4, 5]) {
    const q = await pair(db, { size, length: 0 });
    const win = await play(db, q, [0, size, 1, size + 1, 2, size + 2, 3]);
    assert.equal(win.state.winner, 'X');
    assert.deepEqual(win.state.line, [0, 1, 2, 3]);
    assert.equal(win.state.matchWinner, null);
    assert.equal(win.state.target, null);
  }
});

test('Reconnect reads preserve state; presence refresh does not invalidate a board revision', async () => {
  const db = new TestD1();
  const p = await pair(db);
  const moved = await play(db, p, [4, 0]);
  db.sqlite.prepare('UPDATE rooms SET x_seen_at = ? WHERE code = ?').run(Date.now() - 60_000, p.code);
  const reconnected = await request(db, 'read', { code: p.code, token: p.x.token });
  assert.deepEqual(reconnected.room.state, moved.state);
  assert.equal(reconnected.room.revision, moved.revision);
  const row = db.sqlite.prepare('SELECT * FROM rooms WHERE code = ?').get(p.code);
  assert.ok(row.x_seen_at > Date.now() - 2000);
  const guestRead = await request(db, 'read', { code: p.code, token: p.o.token });
  assert.equal(guestRead.room.opponentSeenAt, row.x_seen_at);
});

test('Leaving closes a room permanently and cannot release a seat to another guest', async () => {
  const db = new TestD1();
  const p = await pair(db);
  const left = await request(db, 'leave', { code: p.code, token: p.o.token });
  assert.equal(left.status, 200);
  assert.equal(left.room.closed, true);
  const host = await request(db, 'read', { code: p.code, token: p.x.token });
  assert.equal(host.room.closed, true);
  assert.equal((await request(db, 'move', { code: p.code, token: p.x.token, body: { index: 0, revision: left.room.revision } })).status, 410);
  assert.equal((await request(db, 'join', { code: p.code })).status, 410);
  assert.equal((await request(db, 'leave', { code: p.code, token: p.o.token })).room.revision, left.room.revision);
});

test('Expired rooms cannot rejoin or resume and are removed by bounded create cleanup', async () => {
  const db = new TestD1();
  const x = await request(db, 'create');
  db.sqlite.prepare('UPDATE rooms SET expires_at = ? WHERE code = ?').run(Date.now() - 1, x.code);
  assert.equal((await request(db, 'read', { code: x.code, token: x.token })).code, 'room_expired');
  assert.equal((await request(db, 'join', { code: x.code })).code, 'room_expired');
  await request(db, 'create');
  assert.equal(db.sqlite.prepare('SELECT code FROM rooms WHERE code = ?').get(x.code), undefined);
});

test('Origin, JSON, payload, config, route, and missing binding failures are explicit', async () => {
  const db = new TestD1();
  assert.equal((await request(db, 'create', { headers: { Origin: 'https://elsewhere.example' } })).status, 403);
  assert.equal((await request(db, 'create', { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
  assert.equal((await request(db, 'create', { body: '{broken' })).status, 400);
  assert.equal((await request(db, 'create', { body: [] })).status, 400);
  assert.equal((await request(db, 'create', { body: 'x'.repeat(5000) })).status, 413);
  assert.equal((await request(db, 'create', { body: { size: 2 } })).status, 400);
  assert.equal((await request(db, 'create', { body: { size: '3' } })).status, 400);
  assert.equal((await request(db, 'create', { body: { length: 4 } })).status, 400);
  assert.equal((await request(db, 'create', { headers: { 'Content-Type': 'text/plain' } })).status, 415);
  assert.equal((await request(db, 'create', { method: 'GET' })).status, 405);
  assert.equal((await request(undefined, 'create')).status, 503);
  assert.equal((await request(db, 'join', { code: '../../evil' })).status, 404);
});
