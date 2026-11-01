import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, stepGame, resetPlayer } from '../../game/simulation.js';
import { ARENA, GATES, OBSTACLES } from '../../game/config.js';

const run = (s, seconds, input = {}) => {
  const events = [];
  for (let i = 0; i < Math.round(seconds * 60); i++) events.push(...stepGame(s, [input], 1 / 60));
  return events;
};
const isolate = s => { s.bots = []; s.pickups = []; return s; };

test('a daily seed reproduces layout and a full input sequence', () => {
  const a = createGame({ seed: 20261023, mode: 'daily' });
  const b = createGame({ seed: 20261023, mode: 'daily' });
  assert.deepEqual(a.pickups, b.pickups);
  run(a, 12, { throttle: 1, steer: 0.3, drift: true });
  run(b, 12, { throttle: 1, steer: 0.3, drift: true });
  assert.deepEqual(a, b);
  assert.notDeepEqual(createGame({ seed: 2 }).pickups, createGame({ seed: 3 }).pickups);
});

test('split-screen exposes independent playable carts', () => {
  const s = isolate(createGame({ mode: 'duel' }));
  const start = s.players.map(p => [p.x, p.z]);
  for (let i = 0; i < 120; i++) stepGame(s, [{ throttle: 1 }, { throttle: -1 }], 1 / 60);
  assert.ok(s.players[0].z < start[0][1] - 5);
  assert.ok(s.players[1].z > start[1][1] + 5);
});

test('coarse frame calls substep to the same stable result', () => {
  const a = isolate(createGame()), b = isolate(createGame());
  const input = { throttle: 1, steer: 0.12 };
  for (let i = 0; i < 180; i++) stepGame(a, [input], 1 / 60);
  for (let i = 0; i < 30; i++) stepGame(b, [input], 0.1);
  assert.ok(Math.abs(a.players[0].x - b.players[0].x) < 1e-8);
  assert.ok(Math.abs(a.players[0].z - b.players[0].z) < 1e-8);
});

test('pickup capacity and a full delivery award points exactly once', () => {
  const s = isolate(createGame());
  const p = s.players[0];
  p.x = -5; p.z = 38;
  s.pickups = Array.from({ length: 12 }, (_, i) => ({ id: `test-${i}`, x: p.x, z: p.z, active: true, respawn: 0, ownerGrace: 0, loose: false }));
  const pickupEvents = stepGame(s, [], 1 / 60).filter(e => e.type === 'pickup');
  assert.equal(p.cargo, p.maxCargo);
  assert.equal(pickupEvents.length, p.maxCargo);
  const gate = GATES[p.targetGate];
  p.x = gate.x; p.z = gate.z;
  const delivered = stepGame(s, [], 1 / 60).filter(e => e.type === 'delivery');
  assert.equal(delivered.length, 1);
  assert.equal(p.delivered, 8);
  assert.equal(p.cargo, 0);
  assert.ok(p.score > 800, 'full-load bonus applies');
  assert.equal(delivered[0].value, p.score);
  const score = p.score;
  run(s, 2);
  assert.equal(p.score, score, 'staying in gate cannot score twice');
});

test('wrong gate never banks cargo', () => {
  const s = isolate(createGame()); const p = s.players[0];
  p.cargo = 4; p.x = GATES[1].x; p.z = GATES[1].z;
  run(s, 0.5);
  assert.equal(p.cargo, 4); assert.equal(p.score, 0);
});

test('walls and furniture remain solid at boosted speed', () => {
  const s = isolate(createGame()); const p = s.players[0];
  p.x = 35; p.z = 40; p.angle = Math.PI / 2; p.cargo = 8;
  const events = run(s, 3, { throttle: 1, boost: true });
  assert.ok(p.x < ARENA.halfX);
  assert.ok(events.some(e => e.type === 'collision'));
  assert.ok(p.cargo < 8, 'a hard crash spills luggage');
  const o = OBSTACLES.find(o => o.type === 'seating');
  p.x = o.x; p.z = o.z + o.d / 2 + 9; p.angle = 0; p.vx = 0; p.vz = -25;
  run(s, 1, { throttle: 1, boost: true });
  assert.ok(p.z >= o.z + o.d / 2, 'cart does not tunnel through a bench island');
});

test('a spilled bag cannot immediately return to its owner', () => {
  const s = isolate(createGame()); const p = s.players[0];
  s.pickups = [{ id: 'loose-test', x: p.x, z: p.z, active: true, loose: true, expires: 15, ownerId: p.id, ownerGrace: 1.25 }];
  run(s, 0.5);
  assert.equal(p.cargo, 0);
  run(s, 1);
  assert.equal(p.cargo, 1);
});

test('boost consumes energy and sustained drift generates a release turbo', () => {
  const s = isolate(createGame()); const p = s.players[0];
  p.x = 0; p.z = 50;
  run(s, 1, { throttle: 1, boost: true });
  assert.ok(p.boostEnergy < 90);
  p.x = -8; p.z = 42; p.angle = -Math.PI / 2; p.vx = -18; p.vz = 0;
  run(s, 1.2, { throttle: 1, steer: 1, drift: true });
  const events = stepGame(s, [{ throttle: 1 }], 1 / 60);
  assert.ok(events.some(e => e.type === 'drift'));
  assert.ok(p.turboTimer > 0);
});

test('boost release preserves momentum and exhausted boost cannot flicker', () => {
  const s = isolate(createGame()); const p = s.players[0];
  p.x = -5; p.z = -10; p.angle = 0; p.vz = -32; p.boosting = true;
  stepGame(s, [{ throttle: 1, boost: false }], 1 / 60);
  assert.ok(p.speed > 30, 'releasing boost must not instantly brake to cruising speed');
  p.boostEnergy = 0;
  run(s, 0.5, { throttle: 1, boost: true });
  assert.equal(p.boosting, false, 'an empty held boost remains off while it recharges');
  assert.ok(p.boostEnergy > 1);
  stepGame(s, [{ throttle: 1, boost: false }], 1 / 60);
  stepGame(s, [{ throttle: 1, boost: true }], 1 / 60);
  assert.equal(p.boosting, true, 'releasing and pressing boost can use regenerated fuel');
});

test('timer ends once, freezes gameplay, and reset preserves banked score', () => {
  const s = isolate(createGame({ duration: 10 })); const p = s.players[0];
  p.score = 1200; p.cargo = 4;
  assert.equal(resetPlayer(s, 'p1'), true);
  assert.equal(p.score, 1200); assert.equal(p.cargo, 0);
  const events = run(s, 12, { throttle: 1 });
  assert.equal(events.filter(e => e.type === 'finish').length, 1);
  assert.equal(s.timeLeft, 0); assert.equal(s.elapsed, 10);
  const before = JSON.stringify(s);
  stepGame(s, [{ throttle: 1 }], 0.2);
  assert.equal(JSON.stringify(s), before);
  assert.equal(resetPlayer(s, 'p1'), false);
});

test('non-finite input cannot corrupt the world', () => {
  const s = createGame({ seed: NaN, duration: Infinity });
  stepGame(s, [{ throttle: NaN, steer: Infinity }], 1 / 60);
  stepGame(s, null, NaN);
  for (const p of [...s.players, ...s.bots]) {
    for (const key of ['x', 'z', 'vx', 'vz', 'angle', 'boostEnergy']) assert.ok(Number.isFinite(p[key]), key);
  }
});

test('bots collect and deliver through the same simulation', () => {
  const s = createGame({ seed: 19 });
  run(s, 60);
  assert.ok(s.bots.some(p => p.pickups > 0));
  assert.ok(s.bots.some(p => p.deliveries > 0), 'at least one bot completes a delivery');
  assert.ok(s.bots.every(p => Math.abs(p.x) < ARENA.halfX && Math.abs(p.z) < ARENA.halfZ));
});
