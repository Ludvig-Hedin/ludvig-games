/**
 * Real HTTP/D1 integration checks (no mocks and no browser automation).
 * Run with the local preview and its migrations ready:
 *   node tests/server-integration.mjs http://127.0.0.1:4173
 * Creates isolated, expiring test rooms. It never modifies existing rooms.
 */
import assert from 'node:assert/strict';
import { createGame, applyMove, restoreGame } from '../public/game/engine.js';

const origin = new URL(process.argv[2] || process.env.ARENA_BASE_URL || 'http://127.0.0.1:4173').origin;
let passed = 0;
const started = performance.now();

async function check(name, work) {
  try { await work(); passed++; console.log(`PASS ${name}`); }
  catch (error) { console.error(`FAIL ${name}: ${error.message}`); throw error; }
}

async function request(method, path, { data, token, headers: extraHeaders } = {}) {
  const response = await fetch(`${origin}${path}`, {
    method,
    headers: {
      ...(data !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...extraHeaders,
    },
    ...(data !== undefined ? { body: JSON.stringify(data) } : {}),
    signal: AbortSignal.timeout(15_000),
  });
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); }
  catch { throw new Error(`Expected JSON from ${path}; got HTTP ${response.status}. Ensure the Vinext preview is running and /api/rooms is available.`); }
  return { status: response.status, body, headers: response.headers };
}

function status(result, expected) {
  assert.equal(result.status, expected, `HTTP ${result.status}; expected ${expected}. ${result.body.error || ''}`);
  return result.body;
}

function roomState(room) {
  assert.equal(typeof room.version, 'number');
  assert.deepEqual(restoreGame(room.game), room.game, 'Server board must replay exactly from its legal move history.');
  assert.ok(!JSON.stringify(room).includes('tokenHash'), 'Public room must not disclose player credential hashes.');
  for (const player of room.players) if (player) assert.deepEqual(Object.keys(player).sort(), ['connected', 'name']);
}

async function create(variant = '3d', bestOf = 3) {
  const host = status(await request('POST', '/api/rooms', { data: { name: 'Integration host', variant, bestOf } }), 201);
  assert.match(host.code, /^[A-HJ-NP-Z2-9]{6}$/);
  assert.match(host.token, /^[A-Za-z0-9_-]{48}$/);
  assert.equal(host.seat, 1);
  assert.equal(host.room.status, 'waiting');
  roomState(host.room);
  return { code: host.code, tokens: [undefined, host.token, undefined], room: host.room };
}

async function join(session) {
  const joined = status(await request('POST', `/api/rooms/${session.code}`, { data: { action: 'join', name: 'Integration friend' } }), 200);
  assert.equal(joined.seat, 2);
  assert.match(joined.token, /^[A-Za-z0-9_-]{48}$/);
  assert.notEqual(joined.token, session.tokens[1]);
  assert.equal(joined.room.status, 'playing');
  session.tokens[2] = joined.token;
  session.room = joined.room;
  roomState(joined.room);
  return joined;
}

async function get(session, seat = 1) {
  return status(await request('GET', `/api/rooms/${session.code}`, { token: session.tokens[seat] }), 200);
}

async function action(session, seat, data, expected = 200) {
  const result = await request('POST', `/api/rooms/${session.code}`, { token: session.tokens[seat], data });
  status(result, expected);
  if (expected === 200 && result.body.room) session.room = result.body.room;
  return result;
}

async function move(session, stack) {
  const before = session.room;
  const expectedState = applyMove(before.game, stack);
  const result = await action(session, before.game.turn, { action: 'move', stack, version: before.version });
  assert.deepEqual(result.body.room.game, expectedState, 'HTTP move must match the independent local rules engine.');
  assert.equal(result.body.room.version, before.version + 1);
  roomState(session.room);
  return result.body;
}

async function startNext(session) {
  const prior = session.room;
  await action(session, 1, { action: 'ready', version: session.room.version });
  assert.equal(session.room.status, 'finished', 'One ready vote must not restart the board.');
  assert.deepEqual(session.room.ready, [true, false]);
  assert.deepEqual(session.room.game, prior.game);
  const once = session.room.version;
  await action(session, 1, { action: 'ready', version: once });
  assert.equal(session.room.version, once, 'Duplicate ready vote must be idempotent.');
  await action(session, 2, { action: 'ready', version: session.room.version });
  assert.equal(session.room.status, 'playing');
  assert.deepEqual(session.room.ready, [false, false]);
  assert.equal(session.room.game.moves.length, 0);
  assert.equal(session.room.game.startingPlayer, 3 - prior.game.startingPlayer);
  assert.equal(session.room.game.turn, 3 - prior.game.startingPlayer);
  roomState(session.room);
}

try {
  await check('rejects invalid creation requests', async () => {
    status(await request('POST', '/api/rooms', { data: {} }), 400);
    status(await request('POST', '/api/rooms', { data: { name: 'Test', variant: 'flat', bestOf: 3 } }), 400);
    status(await request('POST', '/api/rooms', { data: { name: 'Test', variant: '3d', bestOf: 2 } }), 400);
    status(await request('POST', '/api/rooms', { data: { name: '   ', variant: '3d', bestOf: 3 } }), 400);
  });

  let main;
  await check('creates a private room and prevents play before a friend joins', async () => {
    main = await create('3d', 3);
    assert.deepEqual(main.room.game, createGame('3d'));
    await action(main, 1, { action: 'move', stack: 0, version: main.room.version }, 409);
  });

  await check('joins a second player and synchronizes both independent clients', async () => {
    await join(main);
    const [host, friend] = await Promise.all([get(main, 1), get(main, 2)]);
    assert.equal(host.seat, 1);
    assert.equal(friend.seat, 2);
    assert.deepEqual(host.room.game, friend.room.game);
    assert.equal(host.room.version, friend.room.version);
    assert.ok(host.room.players.every(player => player?.connected));
    assert.equal(host.token, undefined);
    assert.equal(friend.token, undefined);
  });

  await check('rejects a third player while admitting a read-only spectator', async () => {
    status(await request('POST', `/api/rooms/${main.code}`, { data: { action: 'join', name: 'Third player' } }), 409);
    const observer = status(await request('POST', `/api/rooms/${main.code}`, { data: { action: 'join', spectate: true, name: 'Observer' } }), 200);
    assert.equal(observer.seat, 0);
    assert.equal(observer.token, undefined);
    roomState(observer.room);
    await action(main, 0, { action: 'move', stack: 1, version: main.room.version }, 403);
    await action(main, 0, { action: 'ready', version: main.room.version }, 403);
    await action(main, 0, { action: 'reconnect' }, 403);
  });

  await check('rejects out-of-turn, invalid-stack, and stale-version moves', async () => {
    await action(main, 2, { action: 'move', stack: 1, version: main.room.version }, 403);
    for (const stack of [-1, 16, 1.5, '1']) await action(main, 1, { action: 'move', stack, version: main.room.version }, 400);
    const stale = await action(main, 1, { action: 'move', stack: 0, version: main.room.version - 1 }, 409);
    assert.equal(stale.body.room.version, main.room.version);
    assert.equal((await get(main)).room.game.moves.length, 0);
  });

  await check('accepts exactly one copy of a simultaneous same-move race', async () => {
    const version = main.room.version;
    const data = { action: 'move', stack: 0, version };
    const attempts = await Promise.all([
      request('POST', `/api/rooms/${main.code}`, { token: main.tokens[1], data }),
      request('POST', `/api/rooms/${main.code}`, { token: main.tokens[1], data }),
    ]);
    assert.deepEqual(attempts.map(result => result.status).sort(), [200, 409]);
    main.room = (await get(main, 2)).room;
    assert.equal(main.room.version, version + 1);
    assert.equal(main.room.game.moves.length, 1);
    assert.equal(main.room.game.board[0], 1);
    assert.deepEqual(main.room.game, applyMove(createGame('3d'), 0));
  });

  await check('preserves state across token reconnection and marks leave/rejoin presence', async () => {
    const before = structuredClone(main.room);
    await action(main, 1, { action: 'leave' });
    const observer = await get(main, 0);
    assert.equal(observer.room.players[0].connected, false);
    const resumed = await action(main, 1, { action: 'reconnect' });
    assert.equal(resumed.body.seat, 1);
    assert.equal(main.room.players[0].connected, true);
    assert.equal(main.room.version, before.version, 'Heartbeats/reconnection must not change the game revision.');
    assert.deepEqual(main.room.game, before.game);
    status(await request('GET', `/api/rooms/${main.code}`, { token: 'bad-token' }), 401);
    status(await request('GET', `/api/rooms/${main.code}`, { token: 'z'.repeat(48) }), 403);
  });

  await check('records a 3D win once, synchronizes it, and locks the finished board', async () => {
    for (const stack of [15,1,15,2,14,3]) await move(main, stack);
    assert.equal(main.room.game.winner, 1);
    assert.equal(main.room.status, 'finished');
    assert.deepEqual(main.room.scores, [1, 0]);
    assert.equal(main.room.matchWinner, null);
    const observer = await get(main, 0);
    assert.deepEqual(observer.room.game, main.room.game);
    assert.deepEqual(observer.room.scores, [1, 0]);
    await action(main, 1, { action: 'move', stack: 4, version: main.room.version }, 409);
    assert.deepEqual((await get(main)).room.scores, [1, 0]);
  });

  await check('requires both ready votes and retains best-of-three scores between rounds', async () => {
    await startNext(main);
    assert.equal(main.room.round, 2);
    assert.deepEqual(main.room.scores, [1, 0]);
    assert.equal(main.room.game.turn, 2);
  });

  await check('finishes best-of-three only after the second win', async () => {
    // Player 2 starts round two; Player 1 completes the floor row in four moves.
    for (const stack of [15,0,15,1,14,2,14,3]) await move(main, stack);
    assert.equal(main.room.game.winner, 1);
    assert.deepEqual(main.room.scores, [2, 0]);
    assert.equal(main.room.matchWinner, 1);
    assert.equal(main.room.round, 2);
  });

  await check('both-ready rematch resets match scores and alternates the opener', async () => {
    await startNext(main);
    assert.equal(main.room.round, 1);
    assert.deepEqual(main.room.scores, [0, 0]);
    assert.equal(main.room.matchWinner, null);
    assert.equal(main.room.game.turn, 1);
  });

  await check('supports Classic and rejects a completely full column', async () => {
    const classic = await create('classic', 1);
    await join(classic);
    for (let i = 0; i < 6; i++) await move(classic, 6);
    await action(classic, 1, { action: 'move', stack: 6, version: classic.room.version }, 400);
    assert.equal(classic.room.game.heights[6], 6);
    for (const stack of [0,5,1,5,2,4,3]) await move(classic, stack);
    assert.equal(classic.room.game.winner, 1);
    assert.equal(classic.room.matchWinner, 1);
    assert.deepEqual(classic.room.scores, [1, 0]);
    await startNext(classic);
    assert.deepEqual(classic.room.scores, [0, 0]);
    assert.equal(classic.room.game.startingPlayer, 2);
  });

  await check('cross-room tokens cannot act on another room', async () => {
    const other = await create('3d', 5);
    status(await request('POST', `/api/rooms/${main.code}`, {
      token: other.tokens[1], data: { action: 'move', stack: 0, version: main.room.version },
    }), 403);
    assert.equal((await get(main)).room.game.moves.length, 0);
  });

  await check('rejects cross-origin mutations and uses uncached state responses', async () => {
    const blocked = await request('POST', `/api/rooms/${main.code}`, {
      token: main.tokens[1], data: { action: 'move', stack: 0, version: main.room.version },
      headers: { Origin: 'https://not-the-arena.example' },
    });
    status(blocked, 403);
    const read = await request('GET', `/api/rooms/${main.code}`, { token: main.tokens[1] });
    status(read, 200);
    assert.match(read.headers.get('cache-control') || '', /no-store/);
  });

  console.log(`\n${passed} HTTP integration scenarios passed in ${((performance.now() - started) / 1000).toFixed(1)}s.`);
} catch (error) {
  console.error(`\nStopped after ${passed} passed scenarios. ${error.stack || error}`);
  process.exitCode = 1;
}
