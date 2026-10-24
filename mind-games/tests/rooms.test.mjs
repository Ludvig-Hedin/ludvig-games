import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { setImmediate } from 'node:timers/promises';
import { readFileSync, readdirSync } from 'node:fs';
import { createRoom, joinRoom, getRoom, actRoom, roomApi } from '../lib/rooms.ts';

// SQLite executes the same SQL as D1. Reads intentionally yield after taking a
// snapshot to force genuine compare-and-swap collisions in concurrent tests.
function database() {
  const sqlite = new DatabaseSync(':memory:');
  const migrations = new URL('../drizzle/', import.meta.url);
  for (const file of readdirSync(migrations).filter((file) => file.endsWith('.sql')).sort()) {
    sqlite.exec(readFileSync(new URL(file, migrations), 'utf8'));
  }
  return {
    sqlite,
    prepare(sql) {
      return { bind(...args) {
        return {
          async first() {
            const row = sqlite.prepare(sql).get(...args) ?? null;
            await setImmediate();
            return row;
          },
          async run() {
            const result = sqlite.prepare(sql).run(...args);
            await setImmediate();
            return { meta: { changes: Number(result.changes) } };
          },
        };
      } };
    },
  };
}

async function pair(options = {}) {
  const db = database();
  const host = await createRoom(db, { name: 'Host', bestOf: 3, variant: 'classic', ...options });
  const guest = await joinRoom(db, host.room.code, { name: 'Guest' });
  return { db, host, guest, code: host.room.code, matchId: host.room.matchId };
}

const lock = (p, player, move, round = 1, boost = false) => actRoom(p.db, p.code, player.token, {
  type: 'lock', move, boost, round, matchId: p.matchId,
});
const next = (p, player, round = 1) => actRoom(p.db, p.code, player.token, { type: 'next', round, matchId: p.matchId });

test('room credentials are private, hashed at rest, and only two players can join', async () => {
  const p = await pair();
  assert.equal(p.host.token.length, 43);
  assert.notEqual(p.host.token, p.guest.token);
  assert.equal(p.host.room.phase, 'waiting');
  assert.equal(p.guest.room.phase, 'choosing');
  assert.equal(p.guest.room.you, 1);
  assert.equal(p.guest.room.players[0].name, 'Host');
  const raw = p.db.sqlite.prepare('SELECT data FROM rooms WHERE code=?').get(p.code).data;
  assert.ok(!raw.includes(p.host.token));
  assert.ok(!JSON.stringify(p.guest.room).includes('tokenHash'));
  await assert.rejects(joinRoom(p.db, p.code, { name: 'Third' }), { code: 'room_full' });
  await assert.rejects(getRoom(p.db, p.code, 'x'.repeat(43)), { code: 'invalid_token' });
});

test('a pending selection and its boost remain secret until both players lock', async () => {
  const p = await pair({ variant: 'mind' });
  const locked = await lock(p, p.host, 0, 1, true);
  assert.deepEqual(locked.room.ownChoice, { move: 0, boost: true });
  const observed = (await getRoom(p.db, p.code, p.guest.token)).room;
  assert.equal(observed.players[0].locked, true);
  assert.equal(observed.ownChoice, null);
  assert.deepEqual(observed.match.history, []);
  assert.deepEqual(observed.match.scores, [0, 0]);
  assert.deepEqual(observed.match.boostsLeft, [true, true]);
  assert.ok(!('choices' in observed));
  const revealed = (await lock(p, p.guest, 2)).room;
  assert.equal(revealed.phase, 'finished');
  assert.deepEqual(revealed.match.history[0].moves, [0, 2]);
  assert.deepEqual(revealed.match.history[0].boosts, [true, false]);
  assert.deepEqual(revealed.match.scores, [2, 0]);
});

test('a locked move cannot be changed, replayed requests are idempotent', async () => {
  const p = await pair();
  await lock(p, p.host, 1);
  await assert.rejects(lock(p, p.host, 2), { code: 'choice_locked' });
  await lock(p, p.host, 1);
  await lock(p, p.guest, 0);
  const retry = await lock(p, p.host, 1);
  assert.equal(retry.room.match.history.length, 1);
  assert.deepEqual(retry.room.match.scores, [1, 0]);
  await assert.rejects(lock(p, p.guest, 2), { code: 'round_not_open' });
});

test('simultaneous lock and next requests resolve once without lost updates', async () => {
  const p = await pair();
  await Promise.all([lock(p, p.host, 2), lock(p, p.guest, 1)]);
  let state = (await getRoom(p.db, p.code, p.host.token)).room;
  assert.equal(state.phase, 'revealed');
  assert.equal(state.match.history.length, 1);
  assert.deepEqual(state.match.scores, [1, 0]);
  await Promise.all([next(p, p.host), next(p, p.guest)]);
  state = (await getRoom(p.db, p.code, p.host.token)).room;
  assert.equal(state.phase, 'choosing');
  assert.equal(state.match.round, 2);
  assert.equal(state.ownChoice, null);
  assert.ok(state.players.every((player) => !player.locked));
  await Promise.all([next(p, p.host), next(p, p.guest)]);
  assert.equal((await getRoom(p.db, p.code, p.host.token)).room.match.round, 2);
});

test('a single next vote never advances and stale next actions cannot skip rounds', async () => {
  const p = await pair();
  await lock(p, p.host, 0);
  await lock(p, p.guest, 0);
  const first = (await next(p, p.host)).room;
  assert.equal(first.phase, 'revealed');
  assert.deepEqual(first.players.map((player) => player.nextReady), [true, false]);
  await next(p, p.guest);
  await lock(p, p.host, 0, 2);
  await lock(p, p.guest, 0, 2);
  await assert.rejects(next(p, p.host, 1), { code: 'stale_round' });
  assert.equal((await getRoom(p.db, p.code, p.host.token)).room.phase, 'revealed');
});

test('a full match requires both rematch votes and rejects old-match actions', async () => {
  const p = await pair();
  await Promise.all([lock(p, p.host, 1), lock(p, p.guest, 0)]);
  await Promise.all([next(p, p.host), next(p, p.guest)]);
  await Promise.all([lock(p, p.host, 1, 2), lock(p, p.guest, 0, 2)]);
  let state = (await getRoom(p.db, p.code, p.host.token)).room;
  assert.equal(state.phase, 'finished');
  assert.equal(state.match.winner, 0);
  const action = { type: 'rematch', matchId: p.matchId };
  state = (await actRoom(p.db, p.code, p.host.token, action)).room;
  assert.equal(state.phase, 'finished');
  state = (await actRoom(p.db, p.code, p.guest.token, action)).room;
  assert.equal(state.phase, 'choosing');
  assert.notEqual(state.matchId, p.matchId);
  assert.deepEqual(state.match.scores, [0, 0]);
  assert.deepEqual(state.match.history, []);
  await assert.rejects(lock(p, p.host, 0), { code: 'stale_match' });
});

test('reconnection preserves a secret selection and refreshes only that player heartbeat', async () => {
  const db = database();
  const host = await createRoom(db, {}, 'a', 1_000);
  const guest = await joinRoom(db, host.room.code, {}, 'b', 1_000);
  await actRoom(db, host.room.code, host.token, { type: 'lock', matchId: host.room.matchId, round: 1, move: 2 }, 2_000);
  const resumed = (await getRoom(db, host.room.code, host.token, 20_000)).room;
  assert.deepEqual(resumed.ownChoice, { move: 2, boost: false });
  assert.equal(resumed.players[0].connected, true);
  assert.equal(resumed.players[1].connected, false);
  assert.equal(resumed.match.history.length, 0);
  const other = (await getRoom(db, host.room.code, guest.token, 20_001)).room;
  assert.ok(other.players.every((player) => player.connected));
  assert.equal(other.ownChoice, null);
});

test('leaving does not reveal pending choices or award a fake win', async () => {
  const p = await pair();
  await lock(p, p.host, 2);
  const left = (await actRoom(p.db, p.code, p.guest.token, { type: 'leave', matchId: p.matchId })).room;
  assert.equal(left.phase, 'abandoned');
  assert.equal(left.match.winner, null);
  assert.deepEqual(left.match.history, []);
  assert.deepEqual(left.match.scores, [0, 0]);
  assert.equal((await getRoom(p.db, p.code, p.host.token)).room.ownChoice, null);
  await assert.rejects(lock(p, p.host, 0), { code: 'room_closed' });
  await assert.rejects(lock(p, p.guest, 0), { code: 'room_left' });
  await assert.rejects(joinRoom(p.db, p.code, {}), { code: 'room_closed' });
});

test('simultaneous room joins can only reserve the guest seat once', async () => {
  const db = database();
  const host = await createRoom(db, {});
  const results = await Promise.allSettled([
    joinRoom(db, host.room.code, { name: 'A' }),
    joinRoom(db, host.room.code, { name: 'B' }),
  ]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter((result) => result.status === 'rejected')[0].reason.code, 'room_full');
});

test('a lost join response recovers the same seat using a persisted client token', async () => {
  const db = database();
  const host = await createRoom(db, {});
  const token = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const payload = { name: 'Reconnect', clientToken: token };
  // Ignore the first successful response, as if the transport dropped it.
  await joinRoom(db, host.room.code, payload);
  const recovered = await joinRoom(db, host.room.code, payload);
  assert.equal(recovered.token, token);
  assert.equal(recovered.room.you, 1);
  assert.equal(recovered.room.players[1].name, 'Reconnect');
  assert.equal(recovered.room.phase, 'choosing');
  await assert.rejects(joinRoom(db, host.room.code, { ...payload, clientToken: 'a'.repeat(43) }), { code: 'room_full' });
  await assert.rejects(joinRoom(db, host.room.code, { ...payload, clientToken: host.token }), { code: 'invalid_client_token' });
  await assert.rejects(joinRoom(db, host.room.code, { ...payload, clientToken: 'short' }), { code: 'invalid_client_token' });
});

test('invalid moves, unavailable boosts, unknown series, and expired sessions are rejected', async () => {
  const p = await pair();
  await assert.rejects(lock(p, p.host, -1), { code: 'invalid_move' });
  await assert.rejects(lock(p, p.host, '1'), { code: 'invalid_move' });
  await assert.rejects(lock(p, p.host, 1, 1, true), { code: 'boost_unavailable' });
  await assert.rejects(createRoom(p.db, { bestOf: 4 }), { code: 'invalid_series' });
  await assert.rejects(createRoom(p.db, { variant: 'fake' }), { code: 'invalid_variant' });
  await assert.rejects(getRoom(p.db, p.code, p.host.token, p.host.room.expiresAt + 1), { code: 'room_expired' });
});

test('HTTP adapter rejects malformed, oversized and cross-origin requests without exposing data', async () => {
  const db = database();
  const request = (body, extras = {}) => new Request('https://arena.example/api/rooms', {
    method: 'POST', body, headers: { 'content-type': 'application/json', ...extras },
  });
  assert.equal((await roomApi(request('{broken'), db, 'create')).status, 400);
  assert.equal((await roomApi(request('[]'), db, 'create')).status, 400);
  assert.equal((await roomApi(request('x'.repeat(2049)), db, 'create')).status, 413);
  assert.equal((await roomApi(request('{}', { origin: 'https://attacker.example' }), db, 'create')).status, 403);
  assert.equal((await roomApi(request('{}'), undefined, 'create')).status, 503);
  const result = await roomApi(request('{}'), db, 'create');
  assert.equal(result.status, 201);
  assert.equal(result.headers.get('cache-control'), 'no-store, private');
  const body = await result.json();
  const unauthorized = await roomApi(new Request(`https://arena.example/api/rooms/${body.room.code}`), db, 'get', body.room.code);
  assert.equal(unauthorized.status, 401);
  assert.equal((await unauthorized.json()).code, 'invalid_token');
});

test('room creation writes no rate-limit rows (limits use the Workers binding)', async () => {
  const db = database();
  for (let i = 0; i < 31; i++) await createRoom(db, {}, 'same-address', 1_000);
  const tables = db.sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'room_rate_limits'").all();
  assert.equal(tables.length, 0);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM rooms').get().n, 31);
});
