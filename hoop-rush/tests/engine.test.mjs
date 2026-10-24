import test from 'node:test';
import assert from 'node:assert/strict';
import { HoopGame } from '../lib/game-engine.js';
import { PHYSICS_STEP, simulateShot } from '../lib/physics.mjs';

// No rendering or actual clock is needed: drive the real engine at recorded
// frame timestamps, using the actual shared physics implementation.
let clock = 1000;
let frameId = 0;
const epoch = 1792710000000;
Date.now = () => epoch + clock;
globalThis.document = Object.assign(new EventTarget(), { hidden: false });
globalThis.window = new EventTarget();
globalThis.HTMLElement = class HTMLElement {};
Object.defineProperty(globalThis, 'performance', { configurable: true, value: { now: () => clock } });
globalThis.requestAnimationFrame = () => ++frameId;
globalThis.cancelAnimationFrame = () => {};

function fixture(config = { mode: 'solo', duration: 60 }) {
  clock = 1000;
  const sounds = [], baskets = [], results = [], states = [];
  const scene = {
    setMode() {}, setTheme() {}, setSkin() {}, setQuality() {},
    update() {}, celebrate() {}, dispose() {},
  };
  const audio = { unlock() {}, setActive() {}, apply() {}, dispose() {}, play: (...args) => sounds.push(args) };
  const game = new HoopGame(scene, audio, {
    onBasket: basket => baskets.push(basket),
    onResult: result => results.push(result),
    onState: state => states.push(state),
  });
  game.start(config);
  function advance(ms, spacing = 1000 / 60) {
    const end = clock + ms;
    while (clock + spacing < end - 1e-7) { clock += spacing; game.frame(clock); }
    clock = end; game.frame(clock);
  }
  function ready() { advance(3000); assert.equal(game.phase, 'playing'); }
  return { game, advance, ready, sounds, baskets, results, states };
}

test('countdown blocks shots and preserves all 60 seconds of playing time', () => {
  const f = fixture();
  assert.equal(f.game.phase, 'countdown');
  assert.equal(f.game.shoot(0, 0, 0.58), false);
  f.advance(2999);
  assert.equal(f.game.phase, 'countdown');
  assert.equal(f.game.time, 0);
  f.advance(1);
  assert.equal(f.game.phase, 'playing');
  assert.equal(f.game.duration - f.game.time, 60);
  f.game.dispose();
});

test('a real shot emits one basket, increments one make, and scores two points', () => {
  const f = fixture(); f.ready();
  assert.equal(f.game.shoot(0, 0, 0.58), true);
  assert.equal(f.game.shoot(0, 0, 0.58), false, 'cooldown must prevent duplicate releases');
  f.advance(1500);
  assert.deepEqual(f.game.scores, [2, 0]);
  assert.deepEqual(f.game.shots, [1, 0]);
  assert.deepEqual(f.game.made, [1, 0]);
  assert.equal(f.baskets.length, 1);
  assert.equal(f.baskets[0].swish, true);
  f.advance(1500);
  assert.equal(f.baskets.length, 1);
  f.game.dispose();
});

test('HTTP clients without randomUUID generate distinct valid shot IDs using getRandomValues', () => {
  const original = globalThis.crypto;
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: { getRandomValues: original.getRandomValues.bind(original) } });
  const f = fixture();
  try {
    f.ready(); assert.equal(f.game.shoot(0, 0, 0.58), true);
    const first = f.game.balls[0].id;
    f.advance(500); assert.equal(f.game.shoot(0, 0, 0.58), true);
    const second = f.game.balls.at(-1).id;
    assert.notEqual(first, second);
    for (const id of [first, second]) assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  } finally { f.game.dispose(); Object.defineProperty(globalThis, 'crypto', descriptor); }
});

test('round ends after exactly 60 playing seconds and calls onResult once', () => {
  const f = fixture(); f.ready();
  f.advance(59999);
  assert.equal(f.game.phase, 'playing');
  assert.ok(f.game.duration - f.game.time < 0.002);
  f.advance(1);
  assert.equal(f.game.phase, 'settling');
  assert.equal(f.game.shoot(0, 0, 0.58), false);
  f.advance(400);
  assert.equal(f.game.phase, 'finished');
  assert.equal(f.results.length, 1);
  assert.equal(f.results[0].duration, 60);
  f.advance(3000);
  assert.equal(f.results.length, 1);
  f.game.dispose();
});

test('pause freezes the clock and ball, then resumes without losing elapsed play', () => {
  const f = fixture(); f.ready();
  f.game.shoot(0, 0, 0.58); f.advance(300); f.game.pause();
  const time = f.game.time;
  const ball = f.game.balls[0];
  const coordinates = [ball.x, ball.y, ball.z, ball.age];
  f.advance(5000);
  assert.equal(f.game.time, time);
  assert.deepEqual([ball.x, ball.y, ball.z, ball.age], coordinates);
  f.game.resume(); f.advance(1000);
  assert.ok(Math.abs(f.game.time - time - 1) < 1e-9);
  assert.equal(f.game.scores[0], 2);
  f.game.dispose();
});

test('local players have independent simultaneous shots and scores', () => {
  const f = fixture({ mode: 'local', duration: 60 }); f.ready();
  assert.equal(f.game.shoot(0, 0, 0.58), true);
  assert.equal(f.game.shoot(1, 0.5, 0.58), true);
  f.advance(2200);
  assert.deepEqual(f.game.shots, [1, 1]);
  assert.deepEqual(f.game.scores, [2, 0]);
  assert.deepEqual(f.game.made, [1, 0]);
  assert.equal(f.game.shoot(1, 0, 0.58), true);
  f.advance(1500);
  assert.deepEqual(f.game.scores, [2, 2]);
  assert.deepEqual(f.game.shots, [1, 2]);
  f.game.dispose();
});

test('two simultaneous touch gestures stay assigned to independent local lanes', () => {
  const f = fixture({ mode: 'local', duration: 60 }); f.ready();
  const capture = new Set();
  const input = Object.assign(new EventTarget(), {
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 800 }),
    setPointerCapture: id => capture.add(id),
    hasPointerCapture: id => capture.has(id),
    releasePointerCapture: id => capture.delete(id),
  });
  f.game.bindInput(input);
  const send = (type, pointerId, x, y) => {
    const event = Object.assign(new Event(type, { cancelable: true }), { pointerId, pointerType: 'touch', button: 0, clientX: x, clientY: y });
    input.dispatchEvent(event);
    return event;
  };
  assert.equal(send('pointerdown', 1, 250, 700).defaultPrevented, true);
  assert.equal(send('pointerdown', 2, 750, 700).defaultPrevented, true);
  f.advance(100);
  const y = 700 - (0.58 - 0.14) / 0.65 * 256;
  send('pointermove', 1, 250, y); send('pointermove', 2, 750, y);
  send('pointerup', 1, 250, y); send('pointerup', 2, 750, y);
  assert.deepEqual(f.game.shots, [1, 1]);
  assert.equal(capture.size, 0);
  f.advance(1600);
  assert.deepEqual(f.game.made, [1, 1]);
  f.game.dispose();
});

test('a physical miss sets missed and resets the streak without awarding points', () => {
  const f = fixture(); f.ready();
  f.game.shoot(0, 0, 0.58); f.advance(1500);
  assert.equal(f.game.combo[0], 1);
  f.game.shoot(0, 0.5, 0.58); const miss = f.game.balls.at(-1); f.advance(2000);
  assert.equal(miss.missed, true);
  assert.equal(miss.scored, false);
  assert.equal(f.game.combo[0], 0);
  assert.equal(f.game.scores[0], 2);
  f.game.dispose();
});

test('late shots remain alive until the shared physics resolves their outcome', () => {
  const reference = simulateShot({ aim: 0, power: 0.94 });
  assert.equal(reference.scored, true);
  assert.ok(reference.scoreTime > 3.2, 'fixture must exercise a long rim rattle');
  const f = fixture({ mode: 'solo', duration: 2 }); f.ready();
  f.advance(1950); f.game.shoot(0, 0, 0.94);
  f.advance(3500);
  assert.equal(f.game.scores[0], 3, 'a release before the buzzer must count after its full rim rattle');
  assert.equal(f.results.length, 1);
  f.game.dispose();
});

test('overtime closes new releases on a basket and fairly settles accepted airborne shots', () => {
  const f = fixture({ mode: 'local', duration: 1 }); f.ready();
  f.advance(1400);
  assert.equal(f.game.overtime, 1);
  assert.equal(f.game.phase, 'countdown');
  assert.equal(f.results.length, 0);
  f.advance(Math.max(0, f.game.startAt - clock));
  assert.equal(f.game.phase, 'playing');
  f.game.shoot(0, 0, 0.58);
  f.advance(100); f.game.shoot(1, 0, 0.58);
  f.advance(1200);
  assert.equal(f.game.phase, 'settling');
  assert.equal(f.game.shoot(0, 0, 0.58), false);
  f.advance(700);
  assert.deepEqual(f.game.scores, [2, 2], 'both shots were released before shooting closed');
  assert.equal(f.game.overtime, 2);
  assert.equal(f.game.phase, 'countdown');
  assert.equal(f.results.length, 0);
  f.advance(Math.max(0, f.game.startAt - clock));
  f.game.shoot(0, 0, 0.58); f.advance(1700);
  assert.equal(f.game.phase, 'finished');
  assert.equal(f.results.length, 1);
  assert.deepEqual(f.results[0].scores, [4, 2]);
  f.game.dispose();
});

test('only two consecutive scoreless overtime periods end an idle game in a draw', () => {
  const f = fixture({ mode: 'local', duration: 1 }); f.ready();
  f.advance(1400);
  assert.equal(f.game.overtime, 1);
  f.advance(Math.max(0, f.game.startAt - clock)); f.advance(15400);
  assert.equal(f.game.overtime, 2);
  assert.equal(f.game.emptyOvertimes, 1);
  // Scoring equally in the next overtime resets the consecutive idle counter.
  f.advance(Math.max(0, f.game.startAt - clock));
  f.game.shoot(0, 0, 0.58); f.game.shoot(1, 0, 0.58); f.advance(1800);
  assert.equal(f.game.overtime, 3);
  assert.equal(f.game.emptyOvertimes, 0);
  assert.deepEqual(f.game.overtimeBaseScores, [2, 2]);
  f.advance(Math.max(0, f.game.startAt - clock)); f.advance(15400);
  assert.equal(f.game.overtime, 4);
  assert.equal(f.game.emptyOvertimes, 1);
  assert.equal(f.results.length, 0);
  f.advance(Math.max(0, f.game.startAt - clock)); f.advance(15400);
  assert.equal(f.game.phase, 'finished');
  assert.equal(f.game.emptyOvertimes, 2);
  assert.equal(f.results.length, 1);
  assert.deepEqual(f.results[0].scores, [2, 2]);
  f.game.dispose();
});

test('starting a rematch clears the previous sudden-death cutoff', () => {
  const f = fixture(); f.ready();
  f.game.suddenEnd = 1.23;
  f.game.start({ mode: 'solo', duration: 60 });
  assert.ok(f.game.suddenEnd == null || f.game.suddenEnd === 0);
  f.game.dispose();
});

test('a frame stall preserves shot age and server-equivalent moving-hoop outcome', () => {
  const f = fixture({ mode: 'solo', duration: 60, rule: 'challenge', challenge: 'moving' }); f.ready();
  f.advance(1200, 1200); // The wall clock advances while simulation catches up in bounded work.
  const shotTime = f.game.time;
  const aim = 0.54 * Math.sin((shotTime + 1.2) * 0.95) / (1.2 * 1.4);
  const expected = simulateShot({ aim, power: 0.58, shotTime, challenge: 'moving' });
  assert.equal(expected.scored, true);
  f.game.shoot(0, aim, 0.58);
  const ball = f.game.balls[0];
  f.advance(1600);
  assert.ok(Math.abs(ball.age - 1.6) <= PHYSICS_STEP + 1e-8);
  assert.equal(ball.scored, expected.scored);
  assert.equal(f.game.made[0], 1);
  f.game.dispose();
});

test('a newly received online shot is not fast-forwarded twice after a render stall', () => {
  const f = fixture({ mode: 'online', duration: 60 });
  const startAt = Date.now() - 1500;
  const state = { round: 1, startAt, duration: 60, status: 'playing', scores: [0, 0], shots: [0, 0], recentShots: [] };
  f.game.startOnline(0, state, 0);
  f.game.frame(clock);
  const releaseAt = Date.now() - 300;
  clock += 300; // A network response can arrive before the next visible frame.
  f.game.applyOnline({ ...state, shots: [0, 1], recentShots: [{ id: 'remote-shot', seat: 1, aim: 0, power: 0.58, shotAt: releaseAt }] }, 0);
  const ball = f.game.balls[0];
  const actualAge = (Date.now() - releaseAt) / 1000;
  assert.ok(Math.abs(ball.age - actualAge) <= PHYSICS_STEP + 1e-8);
  f.game.frame(clock);
  assert.ok(ball.age <= actualAge + PHYSICS_STEP + 1e-8, 'network reconstruction already advanced this ball to the current wall clock');
  f.game.dispose();
});
