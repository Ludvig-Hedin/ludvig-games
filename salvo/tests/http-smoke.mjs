#!/usr/bin/env node
/**
 * End-to-end HTTP check against a running local or deployed game.
 *   node tests/http-smoke.mjs http://terminal.local:4173
 * Creates one clearly labelled QA room, plays a complete game, checks rematch,
 * then surrenders both test seats. No database access or third-party packages.
 */
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

export async function runHttpSmoke(supplied, fetchImpl = globalThis.fetch) {
if (!supplied) throw new Error('Usage: node tests/http-smoke.mjs <http-or-https-base-url>');
let base;
try {
  const parsed = new URL(supplied);
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error();
  base = parsed.origin;
} catch {
  throw new Error('Provide a plain HTTP(S) origin without credentials or query parameters.');
}

const fleetA = [
  { id: 'carrier', x: 0, y: 0, horizontal: true },
  { id: 'battleship', x: 0, y: 2, horizontal: true },
  { id: 'cruiser', x: 0, y: 4, horizontal: true },
  { id: 'submarine', x: 0, y: 6, horizontal: true },
  { id: 'destroyer', x: 0, y: 8, horizontal: true },
];
const fleetB = [
  { id: 'carrier', x: 9, y: 0, horizontal: false },
  { id: 'battleship', x: 7, y: 1, horizontal: false },
  { id: 'cruiser', x: 5, y: 2, horizontal: false },
  { id: 'submarine', x: 3, y: 3, horizontal: false },
  { id: 'destroyer', x: 1, y: 4, horizontal: false },
];
const lengths = { carrier: 5, battleship: 4, cruiser: 3, submarine: 3, destroyer: 2 };
const cells = (fleet) => fleet.flatMap(ship => Array.from({ length: lengths[ship.id] }, (_, n) => ({
  x: ship.x + (ship.horizontal ? n : 0),
  y: ship.y + (ship.horizontal ? 0 : n),
  shipId: ship.id,
  final: n === lengths[ship.id] - 1,
})));
const occupiedA = new Set(cells(fleetA).map(c => `${c.x},${c.y}`));
const misses = Array.from({ length: 100 }, (_, i) => ({ x: i % 10, y: 9 - Math.floor(i / 10) }))
  .filter(c => !occupiedA.has(`${c.x},${c.y}`));
const secrets = [];
const clients = [];
let passed = 0;
const started = Date.now();
function check(label, fn) { fn(); passed++; console.log(`PASS ${label}`); }
function safeMessage(error) {
  let result = error instanceof Error ? error.message : String(error);
  for (const secret of secrets) result = result.replaceAll(secret, '[redacted]');
  return result;
}
async function api(path, { token, method = 'GET', body, status = 200 } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetchImpl(`${base}${path}`, {
    method, headers, cache: 'no-store', redirect: 'error',
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  let result;
  try { result = await response.json(); }
  catch { throw new Error(`${method} ${path}: expected JSON, received HTTP ${response.status}. Is this the running game origin?`); }
  if (response.status !== status) throw new Error(`${method} ${path}: expected HTTP ${status}, received ${response.status} (${result.code ?? 'no error code'}).`);
  if (status < 400) assert.match(response.headers.get('cache-control') ?? '', /no-store/, 'Private room responses must not be cached');
  return result;
}
function client(joined) {
  const seat = { code: joined.code, token: joined.token, player: joined.player, lastShotAt: 0 };
  if (!secrets.includes(joined.token)) secrets.push(joined.token);
  return seat;
}
async function state(seat) { return api(`/api/rooms/${seat.code}`, { token: seat.token }); }
async function action(seat, body, expectedVersion, expectedStatus = 200, requestId = randomUUID()) {
  const result = await api(`/api/rooms/${seat.code}/action`, {
    token: seat.token, method: 'POST', status: expectedStatus,
    body: { ...body, requestId, ...(expectedVersion === undefined ? {} : { expectedVersion }) },
  });
  if (expectedStatus === 200 && body.type === 'shot') seat.lastShotAt = Date.now();
  return result;
}
async function paceShot(seat) { await delay(Math.max(0, 215 - (Date.now() - seat.lastShotAt))); }
function privateProjection(value, ownFleet, expectedSunk = []) {
  assert.equal('game' in value, false);
  assert.equal('fleets' in value, false);
  assert.equal('data' in value, false);
  assert.equal('token' in value, false);
  assert.equal('p0_hash' in value, false);
  assert.equal('p1_hash' in value, false);
  assert.equal('opponentFleet' in value, false);
  assert.deepEqual(value.ownFleet, ownFleet);
  assert.deepEqual(value.opponentSunk, expectedSunk);
  const serialized = JSON.stringify(value);
  for (const secret of secrets) assert.equal(serialized.includes(secret), false, 'A session token leaked into room state');
  for (const shot of [...value.ownShots, ...value.enemyShots]) {
    assert.equal('shipId' in shot, false, 'Unsunk ship identity must never leak');
    if (shot.result !== 'sunk') assert.equal('sunk' in shot, false);
  }
}

try {
  // Read-only identity guard: a shared dev origin may belong to another project.
  // Our invalid-code response is checked BEFORE creating any room or session.
  const contract = await api('/api/rooms/__naval_contract_check__', { status: 400 });
  check('verify this is the six-character naval room API before mutations', () => {
    assert.equal(contract.code, 'invalid_code');
    assert.equal(contract.error, 'Enter a valid six-character room code.');
  });
  const hostToken = randomBytes(32).toString('hex');
  const guestToken = randomBytes(32).toString('hex');
  secrets.push(hostToken, guestToken);
  const created = await api('/api/rooms', { method: 'POST', body: { name: 'QA Atlantic Host', resumeToken: hostToken }, status: 201 });
  const host = client(created); clients.push(host);
  check('create a durable private room', () => {
    assert.match(created.code, /^[A-HJ-NP-Z2-9]{6}$/);
    assert.equal(created.player, 0); assert.equal(created.token, hostToken);
    assert.equal(created.state.phase, 'waiting');
    privateProjection(created.state, null);
  });
  const recoveredCreate = await api('/api/rooms', { method: 'POST', body: { name: 'QA Atlantic Host', resumeToken: hostToken }, status: 201 });
  check('recover a lost creation response', () => assert.equal(recoveredCreate.code, host.code));
  await api(`/api/rooms/${host.code}`, { status: 401 });
  await api(`/api/rooms/${host.code}`, { token: randomBytes(32).toString('hex'), status: 401 });
  check('reject missing and forged seat credentials', () => {});

  const joined = await api(`/api/rooms/${host.code}/join`, { method: 'POST', body: { name: 'QA Atlantic Guest', resumeToken: guestToken } });
  const guest = client(joined); clients.push(guest);
  const recoveredJoin = await api(`/api/rooms/${host.code}/join`, { method: 'POST', body: { name: 'QA Atlantic Guest', resumeToken: guestToken } });
  await api(`/api/rooms/${host.code}/join`, { method: 'POST', body: { name: 'QA Third Commander' }, status: 409 });
  check('two genuine seats; join recovery; no third seat', () => {
    assert.equal(guest.player, 1); assert.ok(recoveredJoin.token === guest.token, 'Join recovery returned another token');
    assert.equal(recoveredJoin.state.version, joined.state.version);
    assert.equal(joined.state.players[0].name, 'QA Atlantic Host');
    assert.equal(joined.state.players[1].name, 'QA Atlantic Guest');
  });

  let current = await state(host);
  const initialVersion = current.version;
  const invalidFleet = fleetA.map(s => ({ ...s })); invalidFleet[0].x = 8;
  await action(host, { type: 'place', fleet: invalidFleet }, current.version, 400);
  current = await state(host);
  check('server rejects out-of-bounds fleet without changing state', () => {
    assert.equal(current.version, initialVersion); assert.equal(current.ownFleet, null);
  });
  current = await action(host, { type: 'place', fleet: fleetA }, current.version);
  const beforeGuestPlaces = await state(guest);
  check('opponent placement remains hidden while waiting', () => {
    privateProjection(beforeGuestPlaces, null);
    assert.equal(beforeGuestPlaces.players[0].ready, true);
  });
  current = await action(guest, { type: 'place', fleet: fleetB }, current.version);
  const hostStart = await state(host), guestStart = await state(guest);
  check('both placements begin a server-authoritative battle', () => {
    assert.equal(current.phase, 'battle'); assert.equal(current.turn, 0);
    privateProjection(hostStart, fleetA); privateProjection(guestStart, fleetB);
  });
  await action(guest, { type: 'shot', x: 9, y: 9 }, current.version, 400);
  await action(host, { type: 'shot', x: 10, y: 0 }, current.version, 400);
  check('reject wrong turns and invalid targets', () => {});

  const targets = cells(fleetB);
  const firstId = randomUUID();
  const firstBody = { type: 'shot', x: targets[0].x, y: targets[0].y };
  const concurrent = await Promise.all([
    action(host, firstBody, current.version, 200, firstId),
    action(host, firstBody, current.version, 200, firstId),
  ]);
  current = await state(host);
  check('concurrent retries fire exactly one shot', () => {
    assert.equal(current.ownShots.length, 1);
    assert.equal(current.turn, 1);
    assert.equal(concurrent[0].version, concurrent[1].version);
    privateProjection(current, fleetA);
  });
  current = await action(guest, { type: 'shot', ...misses[0] }, current.version);
  await paceShot(host);
  await action(host, firstBody, current.version, 400);
  check('reject duplicate coordinates on the next valid turn', () => {});
  const stale = await action(host, { type: 'shot', x: targets[1].x, y: targets[1].y }, initialVersion, 409);
  check('stale versions cannot mutate current battle', () => assert.equal(stale.code, 'stale_version'));

  // A new client with the persisted token reconnects without a cookie or account.
  const reconnected = client({ code: host.code, token: host.token, player: host.player });
  const resumed = await state(reconnected);
  check('reconnect restores exact current state', () => {
    assert.equal(resumed.version, current.version); assert.equal(resumed.ownShots.length, 1);
    privateProjection(resumed, fleetA);
  });

  let sunk = 0;
  for (let i = 1; i < targets.length; i++) {
    const target = targets[i];
    await paceShot(host);
    current = await action(host, { type: 'shot', x: target.x, y: target.y }, current.version);
    assert.equal(current.ownShots.length, i + 1);
    const latest = current.ownShots.at(-1);
    assert.equal(latest.result, target.final ? 'sunk' : 'hit');
    if (target.final) sunk++;
    privateProjection(current, fleetA, fleetB.slice(0, sunk));
    if (i < targets.length - 1) {
      await paceShot(guest);
      current = await action(guest, { type: 'shot', ...misses[i] }, current.version);
      assert.equal(current.ownShots.at(-1).result, 'miss');
    }
  }
  const winnerState = await state(host), loserState = await state(guest);
  check('complete game: five ships sink; both clients agree on victory', () => {
    assert.equal(winnerState.phase, 'finished'); assert.equal(loserState.phase, 'finished');
    assert.equal(winnerState.winner, 0); assert.equal(loserState.winner, 0);
    assert.equal(winnerState.ownShots.length, 17); assert.equal(loserState.enemyShots.length, 17);
    assert.equal(winnerState.opponentSunk.length, 5);
    assert.equal(loserState.ownShots.length, 16);
  });
  await paceShot(host);
  await action(host, { type: 'shot', x: 0, y: 9 }, winnerState.version, 400);
  check('finished games reject further shots', () => {});

  const hostVote = randomUUID(), guestVote = randomUUID();
  current = await action(host, { type: 'rematch' }, winnerState.version, 200, hostVote);
  check('one rematch vote waits for the other commander', () => {
    assert.equal(current.phase, 'finished'); assert.deepEqual(current.rematch, [true, false]);
  });
  current = await action(guest, { type: 'rematch' }, current.version, 200, guestVote);
  const rematchVersion = current.version;
  const replayHost = await action(host, { type: 'rematch' }, winnerState.version, 200, hostVote);
  const replayGuest = await action(guest, { type: 'rematch' }, winnerState.version, 200, guestVote);
  check('two votes reset once; retries preserve the new round', () => {
    assert.equal(current.phase, 'placement'); assert.equal(current.turn, 1);
    assert.deepEqual(current.rematch, [false, false]); assert.equal(current.ownFleet, null);
    assert.deepEqual(current.ownShots, []); assert.deepEqual(current.enemyShots, []);
    assert.equal(current.lastAction, null);
    assert.equal(replayHost.version, rematchVersion); assert.equal(replayGuest.version, rematchVersion);
  });
  current = await action(host, { type: 'place', fleet: fleetA }, current.version);
  current = await action(guest, { type: 'place', fleet: fleetB }, current.version);
  check('rematch begins with the other commander', () => { assert.equal(current.phase, 'battle'); assert.equal(current.turn, 1); });
  await action(host, { type: 'shot', x: 0, y: 0 }, current.version, 400);
  current = await action(guest, { type: 'shot', x: 0, y: 0 }, current.version);
  check('rematch accepts a real shot from the new starting player', () => { assert.equal(current.ownShots[0].result, 'hit'); assert.equal(current.turn, 0); });
  current = await action(guest, { type: 'leave' }, current.version);
  const surrendered = await state(host);
  check('surrender ends the battle and marks the departed opponent', () => {
    assert.equal(surrendered.phase, 'finished'); assert.equal(surrendered.winner, 0);
    assert.equal(surrendered.opponentLeft, true); assert.equal(surrendered.players[1].connected, false);
  });
  console.log(`HTTP integration: ${passed} checks passed in ${((Date.now() - started) / 1000).toFixed(1)}s.`);
  return { passed, durationMs: Date.now() - started };
} catch (error) {
  throw new Error(`HTTP integration failed after ${passed} checks: ${safeMessage(error)}`);
} finally {
  for (const seat of clients) {
    try { await action(seat, { type: 'leave' }); }
    catch { console.error('QA room cleanup could not reach a seat; the room will expire automatically.'); }
  }
}

}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try { await runHttpSmoke(process.argv[2]); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
