import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { handleRoomRequest, MAX_ROOMS } from '../server/rooms.mjs';
import { chooseBotAction } from '../core/game.mjs';

// Real SQLite executes the exact SQL used on D1; async wrappers expose CAS races.
function database() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`CREATE TABLE rooms (code TEXT PRIMARY KEY NOT NULL, state TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL, expires_at INTEGER NOT NULL);`);
  return {
    sqlite,
    prepare(sql) {
      let params = [];
      return {
        bind(...values) { params = values; return this; },
        async first() { return sqlite.prepare(sql).get(...params) || null; },
        async run() {
          const result = sqlite.prepare(sql).run(...params);
          return { success: true, meta: { changes: Number(result.changes) } };
        },
      };
    },
  };
}

function harness() {
  const db = database();
  let now = 1_800_000_000_000;
  async function request(path = '', { method = 'POST', body = {}, token, headers = {} } = {}) {
    const requestHeaders = { ...headers };
    if (token) requestHeaders.Authorization = `Bearer ${token}`;
    if (method !== 'GET') requestHeaders['Content-Type'] = 'application/json';
    const response = await handleRoomRequest(new Request(`https://clash.test/api/rooms${path}`, {
      method,
      headers: requestHeaders,
      ...(method === 'GET' ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
    }), db, { now: () => now });
    return { status: response.status, data: await response.json(), headers: response.headers };
  }
  async function create(name = 'Host', extra = {}) {
    const response = await request('', { body: { name, avatar: 0, ...extra } });
    assert.equal(response.status, 201, JSON.stringify(response.data));
    return response.data;
  }
  async function join(code, name = 'Guest') {
    const response = await request(`/${code}/join`, { body: { name, avatar: 1 } });
    assert.equal(response.status, 201, JSON.stringify(response.data));
    return response.data;
  }
  const state = code => JSON.parse(db.sqlite.prepare('SELECT state FROM rooms WHERE code = ?').get(code).state);
  const writeState = (code, update) => {
    const room = state(code);
    update(room);
    db.sqlite.prepare('UPDATE rooms SET state = ?, version = version + 1 WHERE code = ?').run(JSON.stringify(room), code);
  };
  return { db, request, create, join, state, writeState, advance(ms) { now += ms; } };
}

function assertRedacted(room, mine) {
  assert.equal(room.game.you, mine);
  for (const player of room.players) {
    assert.equal(Object.hasOwn(player, 'tokenHash'), false);
    assert.equal(Object.hasOwn(player, 'hand'), false);
    assert.equal(Object.hasOwn(player, 'recentActions'), false);
  }
  for (const player of room.game.players) assert.equal(Object.hasOwn(player, 'hand'), false);
  for (const key of ['deck', 'drawPile', 'discardPile', 'currentIndex']) assert.equal(Object.hasOwn(room.game, key), false);
}

let sequence = 0;
function actionRequest(action, version, requestId = `test-request-${++sequence}`) {
  return { action, expectedVersion: version, requestId };
}

test('create/join/start expose only each authenticated hand and retain secrets server-side as digests', async () => {
  const h = harness();
  const host = await h.create('  Player  one  ');
  const guest = await h.join(host.code);
  assert.match(host.code, /^[A-Z2-9]{6}$/);
  assert.match(host.token, /^[a-f0-9]{64}$/);
  assert.equal(host.room.players[0].name, 'Player one');
  assert.equal(host.room.game, null);
  const start = await h.request(`/${host.code}/start`, { token: host.token, body: { botCount: 2, difficulty: 'hard' } });
  assert.equal(start.status, 200);
  assert.equal(start.data.room.players.length, 4);
  assert.equal(start.data.room.game.hand.length, 7);
  const other = await h.request(`/${host.code}`, { method: 'GET', token: guest.token });
  assert.equal(other.status, 200);
  assertRedacted(start.data.room, host.playerId);
  assertRedacted(other.data.room, guest.playerId);
  assert.notDeepEqual(start.data.room.game.hand, other.data.room.game.hand);
  const stored = h.state(host.code);
  const asString = JSON.stringify(stored);
  assert.equal(asString.includes(host.token), false);
  assert.equal(asString.includes(guest.token), false);
  assert.equal(stored.players[0].tokenHash.length, 64);
  const publicJson = JSON.stringify(other.data);
  assert.equal(publicJson.includes(stored.players[0].tokenHash), false);
  assert.equal(other.headers.get('Cache-Control'), 'no-store, private, max-age=0');
});

test('room reads and game mutations require a valid player token; join after start denied', async () => {
  const h = harness();
  const host = await h.create();
  const guest = await h.join(host.code);
  assert.equal((await h.request(`/${host.code}`, { method: 'GET' })).status, 401);
  assert.equal((await h.request(`/${host.code}`, { method: 'GET', token: '0'.repeat(64) })).status, 401);
  assert.equal((await h.request(`/${host.code}/start`, { token: guest.token, body: { botCount: 0 } })).status, 403);
  assert.equal((await h.request(`/${host.code}/start`, { token: host.token, body: { botCount: 0 } })).status, 200);
  assert.equal((await h.request(`/${host.code}/join`, { body: { name: 'Late' } })).status, 409);
  assert.equal((await h.request(`/${host.code}/action`, { token: '0'.repeat(64), body: actionRequest({ type: 'draw' }, 2) })).status, 401);
});

test('the host cannot start an impossible roster, or smuggle roles or rules through join', async () => {
  const h = harness();
  const host = await h.create('Host', { options: { quickPlay: true } });
  assert.equal((await h.request(`/${host.code}/start`, { token: host.token, body: { botCount: 0 } })).status, 400);
  assert.equal((await h.request(`/${host.code}/start`, { token: host.token, body: { botCount: 6 } })).status, 400);
  const joined = await h.request(`/${host.code}/join`, { body: { name: 'Visitor', bot: true, hostId: 'mine', options: { stacking: true } } });
  assert.equal(joined.status, 201);
  assert.equal(joined.data.room.hostId, host.playerId);
  assert.equal(joined.data.room.players.at(-1).bot, false);
  assert.equal(joined.data.room.options.stacking, false);
  const start = await h.request(`/${host.code}/start`, { token: host.token, body: { botCount: 0 } });
  assert.equal(start.data.room.game.hand.length, 5);
});

test('concurrent join CAS enforces six seats without dropped or duplicated members', async () => {
  const h = harness();
  const host = await h.create();
  const responses = await Promise.all(Array.from({ length: 10 }, (_, i) => h.request(`/${host.code}/join`, { body: { name: `Guest ${i}` } })));
  assert.equal(responses.filter(r => r.status === 201).length, 5);
  assert.equal(responses.filter(r => r.status === 409).length, 5);
  const room = (await h.request(`/${host.code}`, { method: 'GET', token: host.token })).data.room;
  assert.equal(room.players.length, 6);
  assert.equal(new Set(room.players.map(p => p.id)).size, 6);
});

test('same simultaneous action is applied exactly once, and retry remains idempotent after lost response', async () => {
  const h = harness();
  const host = await h.create();
  await h.join(host.code);
  const start = await h.request(`/${host.code}/start`, { token: host.token, body: { botCount: 0 } });
  const room = start.data.room;
  const action = chooseBotAction(room.game, 'expert', () => 0.45);
  const payload = actionRequest(action, room.version, 'duplicate-request-0001');
  const responses = await Promise.all([h.request(`/${host.code}/action`, { token: host.token, body: payload }), h.request(`/${host.code}/action`, { token: host.token, body: payload })]);
  assert.deepEqual(responses.map(r => r.status), [200, 200]);
  assert.equal(responses[0].data.room.version, room.version + 1);
  assert.equal(responses[1].data.room.version, room.version + 1);
  const retry = await h.request(`/${host.code}/action`, { token: host.token, body: payload });
  assert.equal(retry.status, 200);
  assert.equal(retry.data.room.version, room.version + 1);
  const changed = await h.request(`/${host.code}/action`, { token: host.token, body: { ...payload, action: action.type === 'draw' ? { type: 'pass' } : { type: 'draw' } } });
  assert.equal(changed.status, 409);
});

test('concurrent distinct commands with the same expected version cannot apply twice', async () => {
  const h = harness();
  const host = await h.create();
  await h.join(host.code);
  const start = await h.request(`/${host.code}/start`, { token: host.token, body: { botCount: 0 } });
  const { room } = start.data;
  const action = chooseBotAction(room.game, 'medium', () => 0.45);
  const responses = await Promise.all([h.request(`/${host.code}/action`, { token: host.token, body: actionRequest(action, room.version) }), h.request(`/${host.code}/action`, { token: host.token, body: actionRequest(action, room.version) })]);
  assert.deepEqual(responses.map(r => r.status).sort(), [200, 409]);
  const conflict = responses.find(r => r.status === 409);
  assertRedacted(conflict.data.room, host.playerId);
  assert.equal(h.state(host.code).version, room.version + 1);
});

test('an opponent cannot play another hand, invent a card, or play out of turn', async () => {
  const h = harness();
  const host = await h.create();
  const guest = await h.join(host.code);
  const start = await h.request(`/${host.code}/start`, { token: host.token, body: { botCount: 0 } });
  const room = start.data.room;
  const stolenId = room.game.hand[0].id;
  const stolen = await h.request(`/${host.code}/action`, { token: guest.token, body: actionRequest({ type: 'play', cardId: stolenId }, room.version) });
  assert.equal(stolen.status, 422);
  const invented = await h.request(`/${host.code}/action`, { token: host.token, body: actionRequest({ type: 'play', cardId: 'not-in-the-deck' }, room.version) });
  assert.equal(invented.status, 422);
  const outOfTurn = await h.request(`/${host.code}/action`, { token: guest.token, body: actionRequest({ type: 'draw' }, room.version) });
  assert.equal(outOfTurn.status, 422);
  assert.equal(h.state(host.code).version, room.version);
});

test('heartbeat changes presence without making valid action versions stale; reconnect preserves hand', async () => {
  const h = harness();
  const host = await h.create();
  const guest = await h.join(host.code);
  const start = await h.request(`/${host.code}/start`, { token: host.token, body: { botCount: 0 } });
  const initialHand = start.data.room.game.hand;
  h.advance(21_000);
  const seenByGuest = await h.request(`/${host.code}`, { method: 'GET', token: guest.token });
  assert.equal(seenByGuest.data.room.players.find(p => p.id === host.playerId).connected, false);
  assert.equal(seenByGuest.data.room.game.players.find(p => p.id === host.playerId).connected, false);
  assert.equal(seenByGuest.data.room.version, start.data.room.version);
  const reconnected = await h.request(`/${host.code}`, { method: 'GET', token: host.token });
  assert.equal(reconnected.data.room.players.find(p => p.id === host.playerId).connected, true);
  assert.equal(reconnected.data.room.game.players.find(p => p.id === host.playerId).connected, true);
  assert.deepEqual(reconnected.data.room.game.hand, initialHand);
  assert.equal(reconnected.data.room.version, start.data.room.version);
  const action = chooseBotAction(reconnected.data.room.game, 'medium', () => 0.45);
  assert.equal((await h.request(`/${host.code}/action`, { token: host.token, body: actionRequest(action, start.data.room.version) })).status, 200);
});

test('leaving transfers host, invalidates the old token and replaces a live seat with a bot', async () => {
  const h = harness();
  const host = await h.create();
  const guest = await h.join(host.code);
  await h.request(`/${host.code}/start`, { token: host.token, body: { botCount: 0 } });
  const before = h.state(host.code).game.players.find(p => p.id === host.playerId).hand;
  const left = await h.request(`/${host.code}/leave`, { token: host.token });
  assert.equal(left.status, 200);
  const other = await h.request(`/${host.code}`, { method: 'GET', token: guest.token });
  assert.equal(other.data.room.hostId, guest.playerId);
  assert.equal(other.data.room.players.find(p => p.id === host.playerId).bot, true);
  assert.deepEqual(h.state(host.code).game.players.find(p => p.id === host.playerId).hand, before);
  assert.equal((await h.request(`/${host.code}`, { method: 'GET', token: host.token })).status, 401);
  h.advance(1_000);
  const afterBot = await h.request(`/${host.code}`, { method: 'GET', token: guest.token });
  assert.equal(afterBot.data.room.version, other.data.room.version + 1);
});

test('leaving a lobby removes the seat; leaving the final human deletes the room', async () => {
  const h = harness();
  const host = await h.create();
  const guest = await h.join(host.code);
  await h.request(`/${host.code}/leave`, { token: host.token });
  const room = (await h.request(`/${host.code}`, { method: 'GET', token: guest.token })).data.room;
  assert.equal(room.players.length, 1);
  assert.equal(room.hostId, guest.playerId);
  await h.request(`/${host.code}/leave`, { token: guest.token });
  assert.equal((await h.request(`/${host.code}`, { method: 'GET', token: guest.token })).status, 404);
});

test('simultaneous polling executes at most one due bot move', async () => {
  const h = harness();
  const host = await h.create();
  const guest = await h.join(host.code);
  await h.request(`/${host.code}/start`, { token: host.token, body: { botCount: 1 } });
  await h.request(`/${host.code}/leave`, { token: host.token });
  const version = h.state(host.code).version;
  h.advance(1_000);
  const polls = await Promise.all(Array.from({ length: 8 }, () => h.request(`/${host.code}`, { method: 'GET', token: guest.token })));
  assert.equal(polls.every(p => p.status === 200), true);
  assert.equal(h.state(host.code).version, version + 1);
  assert.equal(polls.every(p => p.data.room.version === version + 1), true);
});

test('rooms survive a new service request but expire after 24 hours without activity', async () => {
  const h = harness();
  const host = await h.create();
  h.advance(23 * 60 * 60 * 1000);
  assert.equal((await h.request(`/${host.code}`, { method: 'GET', token: host.token })).status, 200);
  h.advance(24 * 60 * 60 * 1000 + 1);
  assert.equal((await h.request(`/${host.code}`, { method: 'GET', token: host.token })).status, 404);
});

test('invalid JSON, oversized payload, cross-origin POST and malformed parameters are bounded', async () => {
  const h = harness();
  assert.equal((await h.request('', { body: '{ nope' })).status, 400);
  assert.equal((await h.request('', { body: { name: 'a'.repeat(9_000) } })).status, 413);
  assert.equal((await h.request('', { body: { name: '' } })).status, 400);
  assert.equal((await h.request('', { body: { name: 'a'.repeat(21) } })).status, 400);
  assert.equal((await h.request('', { body: { name: 'Name', avatar: -1 } })).status, 400);
  assert.equal((await h.request('', { body: { name: 'Name', options: { stacking: 'yes' } } })).status, 400);
  assert.equal((await h.request('', { body: { name: 'Name', difficulty: 'unfair' } })).status, 400);
  assert.equal((await h.request('', { body: { name: 'Name' }, headers: { Origin: 'https://other.example' } })).status, 403);
  assert.equal((await h.request('/bad', { method: 'GET' })).status, 400);
  assert.equal((await h.request('', { method: 'GET' })).status, 405);
});

test('a complete online match finishes and the host can rematch without exposing other hands', { timeout: 30_000 }, async () => {
  const h = harness();
  const host = await h.create('Host', { options: { quickPlay: true, stacking: true, sevenZero: true } });
  const guest = await h.join(host.code, 'Friend');
  const sessions = new Map([[host.playerId, host], [guest.playerId, guest]]);
  let room = (await h.request(`/${host.code}/start`, { token: host.token, body: { botCount: 3, difficulty: 'expert' } })).data.room;
  assert.equal((await h.request(`/${host.code}/rematch`, { token: host.token })).status, 409);
  let steps = 0;
  while (room.phase === 'playing' && steps++ < 3_000) {
    const currentId = room.game.currentPlayerId;
    const session = sessions.get(currentId);
    if (session) {
      const own = await h.request(`/${host.code}`, { method: 'GET', token: session.token });
      assert.equal(own.status, 200);
      assertRedacted(own.data.room, session.playerId);
      const action = chooseBotAction(own.data.room.game, 'expert', () => 0.44);
      const result = await h.request(`/${host.code}/action`, { token: session.token, body: actionRequest(action, own.data.room.version) });
      assert.equal(result.status, 200, JSON.stringify(result.data));
      room = result.data.room;
    } else {
      h.advance(1_000);
      const result = await h.request(`/${host.code}`, { method: 'GET', token: host.token });
      assert.equal(result.status, 200, JSON.stringify(result.data));
      room = result.data.room;
    }
  }
  assert.equal(room.phase, 'finished', `Match did not finish after ${steps} actions`);
  assert.ok(room.game.winnerId);
  assert.equal((await h.request(`/${host.code}/rematch`, { token: guest.token })).status, 403);
  const rematch = await h.request(`/${host.code}/rematch`, { token: host.token });
  assert.equal(rematch.status, 200);
  assert.equal(rematch.data.room.phase, 'playing');
  assert.equal(rematch.data.room.game.hand.length, 5);
  assert.equal(rematch.data.room.players.length, 5);
  assertRedacted(rematch.data.room, host.playerId);
});


test('a bot catches one missed final-card warning once, retains its turn, then plays after the next delay', async () => {
  const h = harness();
  const host = await h.create();
  const guest = await h.join(host.code);
  await h.request(`/${host.code}/start`, { token: host.token, body: { botCount: 1, difficulty: 'expert' } });
  h.writeState(host.code, room => {
    const game = room.game;
    const human = game.players.find(p => p.id === host.playerId);
    game.deck.push(...human.hand.splice(1));
    human.called = false;
    game.currentIndex = game.players.findIndex(p => p.bot);
    game.vulnerablePlayerId = host.playerId;
    game.drawnCardId = null;
    game.pendingDraw = 0;
    room.botDueAt = 0;
  });
  const before = h.state(host.code);
  const botId = before.game.players[before.game.currentIndex].id;
  const polls = await Promise.all(Array.from({ length: 4 }, () => h.request(`/${host.code}`, { method: 'GET', token: guest.token })));
  assert.equal(polls.every(p => p.status === 200), true);
  const caught = h.state(host.code);
  assert.equal(caught.version, before.version + 1);
  assert.equal(caught.game.players.find(p => p.id === host.playerId).hand.length, 3);
  assert.equal(caught.game.vulnerablePlayerId, null);
  assert.equal(caught.game.players[caught.game.currentIndex].id, botId);
  assert.equal(caught.game.events.filter(e => e.type === 'catch').length, 1);
  await h.request(`/${host.code}`, { method: 'GET', token: guest.token });
  assert.equal(h.state(host.code).version, caught.version);
  h.advance(1_000);
  const followup = await h.request(`/${host.code}`, { method: 'GET', token: guest.token });
  assert.equal(followup.status, 200);
  assert.equal(followup.data.room.version, caught.version + 1);
  assert.equal(h.state(host.code).game.events.filter(e => e.type === 'catch').length, 1);
});

test('Free account: rate-limited, malformed and capped requests write nothing to D1', async () => {
  const h = harness();
  const host = await h.create('Host');
  const writes = () => h.db.sqlite.prepare('SELECT total_changes() AS n').get().n;
  const blocked = { create: { limit: async () => ({ success: false }) }, join: { limit: async () => ({ success: false }) }, action: { limit: async () => ({ success: false }) } };
  const call = (path, init) => handleRoomRequest(new Request(`https://clash.test/api/rooms${path}`, init), h.db, { limits: blocked });
  const edge = { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.5' };
  const before = writes();
  assert.equal((await call('', { method: 'POST', headers: edge, body: '{"name":"Flood"}' })).status, 429);
  assert.equal((await call(`/${host.code}/join`, { method: 'POST', headers: edge, body: '{"name":"Flood"}' })).status, 429);
  assert.equal((await call(`/${host.code}`, { headers: { ...edge, Authorization: `Bearer ${host.token}` } })).status, 429);
  assert.equal((await h.request(`/${host.code}`, { method: 'GET', token: 'nothex' })).status, 401);
  assert.equal((await h.request('/ZZZZ22/join', { body: { name: 'Ghost' } })).status, 404);
  assert.equal(writes(), before);
  const insert = h.db.sqlite.prepare("INSERT INTO rooms (code, state, version, updated_at, expires_at) VALUES (?, '{}', 0, 0, ?)");
  for (let i = 1; i < MAX_ROOMS; i++) insert.run(`F${i}`, 1_900_000_000_000);
  const full = writes();
  assert.equal((await h.request('', { body: { name: 'Late' } })).status, 503);
  assert.equal(writes(), full);
});
