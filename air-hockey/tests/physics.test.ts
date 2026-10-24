import assert from 'node:assert/strict';
import test from 'node:test';
import { clampTarget, cloneGame, createAI, createGame, predictBankX, stepGame } from '../lib/game/physics';
import { DIFFICULTIES, TABLE, type GameState, type Targets } from '../lib/game/types';

const homes: Targets = [{ x: 0, y: 4.85 }, { x: 0, y: -4.85 }];
const playing = (seed = 12345): GameState => { const s = createGame(7, seed); s.phase = 'playing'; s.timer = 0; return s; };
const advance = (s: GameState, seconds: number, targets = homes) => {
  const events = [];
  for (let i = 0; i < Math.ceil(seconds / TABLE.fixedDt); i++) events.push(...stepGame(s, targets));
  return events;
};

test('faceoff begins at centre, counts down and creates a finite fair serve', () => {
  const s = createGame(5, 12);
  assert.equal(s.puck.x, 0); assert.equal(s.puck.y, 0);
  assert.equal(s.phase, 'faceoff');
  advance(s, 1.5);
  assert.equal(s.phase, 'playing');
  assert.ok(Math.hypot(s.puck.vx, s.puck.vy) > 3);
  assert.equal(s.targetScore, 5);
});

test('both mallets share a speed cap and cannot cross the centre or rails', () => {
  const s = playing();
  const old = s.mallets.map(m => ({ ...m }));
  stepGame(s, [{ x: 999, y: -999 }, { x: -999, y: 999 }]);
  for (const i of [0, 1] as const) {
    const distance = Math.hypot(s.mallets[i].x - old[i].x, s.mallets[i].y - old[i].y);
    assert.ok(distance <= TABLE.maxMalletSpeed * TABLE.fixedDt + 1e-9);
  }
  advance(s, 1, [{ x: 999, y: -999 }, { x: -999, y: 999 }]);
  assert.ok(s.mallets[0].y >= TABLE.malletRadius);
  assert.ok(s.mallets[1].y <= -TABLE.malletRadius);
  assert.ok(s.mallets.every(m => Math.abs(m.x) <= TABLE.halfWidth - TABLE.malletRadius + 1e-9));
  assert.deepEqual(clampTarget(0, { x: NaN, y: Infinity }), { x: 0, y: 4.85 });
});

test('maximum-speed wall rebounds do not tunnel or gain energy', () => {
  const s = playing(); Object.assign(s.puck, { x: 3.7, y: 1, vx: 38, vy: 0 });
  const events = stepGame(s, homes);
  assert.ok(s.puck.vx < 0);
  assert.ok(Math.abs(s.puck.x) <= TABLE.halfWidth - TABLE.puckRadius);
  assert.ok(Math.hypot(s.puck.vx, s.puck.vy) <= 38);
  assert.ok(events.some(e => e.type === 'wall'));
});

test('a fast puck cannot tunnel through a stationary mallet', () => {
  const s = playing(); Object.assign(s.puck, { x: 0, y: 3.7, vx: 0, vy: 38 });
  const events = advance(s, 0.04);
  assert.ok(s.puck.vy < 0);
  assert.ok(events.some(e => e.type === 'mallet' && e.side === 0));
});

test('a moving mallet transfers momentum without exceeding the speed ceiling', () => {
  const s = playing(); Object.assign(s.puck, { x: 0, y: 3.8, vx: 0, vy: 0 });
  const events = advance(s, 0.1, [{ x: 0, y: 2 }, homes[1]]);
  assert.ok(s.puck.vy < -15);
  assert.ok(Math.hypot(s.puck.vx, s.puck.vy) <= TABLE.maxPuckSpeed);
  assert.ok(events.some(e => e.type === 'mallet'));
});

test('a goal requires the whole puck to cross the mouth, and scores once', () => {
  const s = playing();
  s.mallets[0].x = 3;
  Object.assign(s.puck, { x: 0, y: 7.1, vx: 0, vy: 5 });
  stepGame(s, [{ x: 3, y: 4.85 }, homes[1]]);
  assert.deepEqual(s.scores, [0, 0]);
  const events = advance(s, 0.05, [{ x: 3, y: 4.85 }, homes[1]]);
  assert.deepEqual(s.scores, [0, 1]);
  assert.equal(s.phase, 'goal');
  assert.equal(events.filter(e => e.type === 'goal').length, 1);
  advance(s, 0.5);
  assert.deepEqual(s.scores, [0, 1]);
});

test('shots outside the opening rebound, including rounded mouth edges', () => {
  for (const x of [1.48, 1.6, 2.9, -1.48, -1.6]) {
    const s = playing(); Object.assign(s.puck, { x, y: 6.6, vx: 0, vy: 38 });
    advance(s, 0.05, [{ x: -3.4, y: 2 }, homes[1]]);
    assert.equal(s.scores[1], 0);
    assert.ok(Number.isFinite(s.puck.x) && Number.isFinite(s.puck.y));
    assert.ok(Math.abs(s.puck.y) < 7.25);
  }
});

test('winning goal freezes the match, and conceding side receives the next serve', () => {
  const s = playing(); s.targetScore = 3; s.scores = [2, 0];
  Object.assign(s.puck, { x: 0, y: -7.23, vx: 0, vy: -20 });
  const events = stepGame(s, homes);
  assert.equal(s.phase, 'finished'); assert.deepEqual(s.scores, [3, 0]);
  assert.ok(events.some(e => e.type === 'win' && e.side === 0));
  const frozen = cloneGame(s); advance(s, 1); assert.deepEqual(s, frozen);
  const next = playing(); Object.assign(next.puck, { x: 0, y: -7.23, vx: 0, vy: -20 });
  stepGame(next, homes); assert.equal(next.serveSide, 1);
  advance(next, 1.1); assert.equal(next.phase, 'faceoff');
  assert.equal(next.puck.x, 0); assert.equal(next.puck.y, 0);
});

test('stationary overlap separates cleanly and a pinned puck stays in bounds', () => {
  const s = playing(); Object.assign(s.puck, { ...s.mallets[0] });
  stepGame(s, homes);
  assert.ok(Math.hypot(s.puck.x - s.mallets[0].x, s.puck.y - s.mallets[0].y) >= TABLE.puckRadius + TABLE.malletRadius - 1e-4);
  const pin = playing(); Object.assign(pin.mallets[0], { x: 3, y: 3, vx: 0, vy: 0 });
  Object.assign(pin.puck, { x: 3.76, y: 3, vx: 0, vy: 0 });
  advance(pin, 2, [{ x: 3.48, y: 3 }, homes[1]]);
  assert.ok(Math.abs(pin.puck.x) <= 3.7601);
  assert.ok(Number.isFinite(pin.puck.y));
  assert.ok(Math.hypot(pin.puck.vx, pin.puck.vy) < 0.1, 'a pin must not inject kinetic energy');
});

test('seeded simulation is deterministic and cloneGame has no mutable aliases', () => {
  const a = createGame(7, 123), b = createGame(7, 123);
  advance(a, 4); advance(b, 4); assert.deepEqual(a, b);
  const clone = cloneGame(a); clone.scores[0]++; clone.mallets[0].x += 1;
  assert.notEqual(clone.scores[0], a.scores[0]); assert.notEqual(clone.mallets[0].x, a.mallets[0].x);
});

test('opposing mallets cannot pump energy into a puck pinched on the centre line', () => {
  const s = playing();
  Object.assign(s.mallets[0], { x: 0, y: 0.76, vx: 0, vy: 0 });
  Object.assign(s.mallets[1], { x: 0, y: -0.76, vx: 0, vy: 0 });
  advance(s, 2, [{ x: 0, y: 0.52 }, { x: 0, y: -0.52 }]);
  assert.ok(Math.hypot(s.puck.vx, s.puck.vy) < 0.1);
  for (const m of s.mallets) assert.ok(Math.hypot(s.puck.x - m.x, s.puck.y - m.y) >= 0.76 - 1e-4);
  // Releasing either mallet leaves the puck available for a normal strike.
  advance(s, 0.2, [{ x: 0, y: 0.52 }, { x: 1.5, y: -2 }]);
  assert.ok(Math.hypot(s.puck.vx, s.puck.vy) > 1);
});

test('bank prediction handles multiple cushion reflections', () => {
  assert.ok(Math.abs(predictBankX(0, 10, 0.5) - 2.52) < 1e-8);
  assert.ok(Math.abs(predictBankX(0, -10, 0.5) + 2.52) < 1e-8);
  for (let t = 0; t < 10; t += 0.13) assert.ok(Math.abs(predictBankX(3, 38, t)) <= 3.76 + 1e-9);
});

test('all five AIs provide legal finite input through a complete match', () => {
  for (const difficulty of DIFFICULTIES) {
    const state = createGame(3, 0x2026);
    const ai0 = createAI(difficulty, 0), ai1 = createAI('Easy', 1);
    for (let tick = 0; tick < 240 * 90 && state.phase !== 'finished'; tick++) {
      const targets: Targets = [ai0.update(state, TABLE.fixedDt), ai1.update(state, TABLE.fixedDt)];
      assert.ok(targets[0].y >= TABLE.malletRadius && targets[1].y <= -TABLE.malletRadius);
      stepGame(state, targets);
      assert.ok(Number.isFinite(state.puck.x) && Number.isFinite(state.puck.y));
      assert.ok(Math.abs(state.puck.x) <= TABLE.halfWidth - TABLE.puckRadius + 1e-4);
      assert.ok(Math.abs(state.puck.y) <= TABLE.halfLength + TABLE.puckRadius + 1e-4);
      assert.ok(Math.hypot(state.puck.vx, state.puck.vy) <= TABLE.maxPuckSpeed + 1e-8);
    }
    assert.equal(state.phase, 'finished', `${difficulty} should complete a first-to-three match`);
  }
});

test('hostile oversized velocity and nonfinite controls cannot corrupt the simulation', () => {
  const s = playing(); Object.assign(s.puck, { x: 2, y: 0.5, vx: 1e9, vy: -1e9 });
  advance(s, 4, [{ x: NaN, y: Infinity }, { x: -Infinity, y: NaN }]);
  assert.ok(Number.isFinite(s.puck.x) && Number.isFinite(s.puck.y));
  assert.ok(s.mallets.every(m => Number.isFinite(m.x) && Number.isFinite(m.y)));
});
