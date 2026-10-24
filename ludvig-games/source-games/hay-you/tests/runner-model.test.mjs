import test from 'node:test';
import assert from 'node:assert/strict';
import { createRunnerModel, distanceAt } from '../dist/runner-model.js';
import { HORSES } from '../dist/content.js';

// Run with: node tests/runner-model.test.mjs
// These checks exercise game rules without a browser, graphics driver or packages.
const PHYSICS_FRAME = 1 / 120;

function advance(model, seconds, frame = PHYSICS_FRAME) {
  let remaining = seconds;
  while (remaining > 1e-9) {
    const dt = Math.min(frame, remaining);
    model.step(dt);
    remaining -= dt;
  }
}

function fixture(type, lane = 0, time = .5, id = 'fixture') {
  return { id, type, lane, x: lane * 3, time, distance: distanceAt(time), collected: false, hit: false, passed: false };
}

function isolated(...objects) {
  const model = createRunnerModel({ seed: 'regression', countdown: 0, duration: 3 });
  // Public fixtures let us reproduce specific collisions independently of course generation.
  model.objects.splice(0, model.objects.length, ...objects.sort((a, b) => a.distance - b.distance));
  return model;
}

function layout(model) {
  return model.objects.map(({ id, type, lane, x, time, distance }) => ({ id, type, lane, x, time, distance }));
}

function play(seed, fps, active) {
  const model = createRunnerModel({ seed, countdown: 0 });
  const frame = 1 / fps;
  for (let frames = 0; model.state.phase !== 'complete' && frames <= fps * 31; frames++) {
    if (active) {
      // A simple player: follow the next visible heart trail and jump 0.4 seconds
      // before a log. This proves the shipped layouts are playable using the API.
      const { state, objects } = model;
      const heart = objects.find(o => o.type === 'heart' && !o.passed && !o.collected && o.distance >= state.distance - .7);
      if (heart && heart.lane !== state.lane) model.move(Math.sign(heart.lane - state.lane));
      const log = objects.find(o => o.type === 'log' && !o.passed && !o.hit && Math.abs(o.x - state.x) < 1.42 && o.distance > state.distance);
      if (log && (log.distance - state.distance) / state.speed < .4 && !state.airborne) model.jump();
    }
    model.step(frame);
  }
  assert.equal(model.state.phase, 'complete', `${seed}: round must finish`);
  return model.result();
}

test('countdown plus the full 30-second date is independent of drawing rate', () => {
  let baseline;
  for (const fps of [144, 120, 60, 59, 30, 15, 10, 4]) {
    const model = createRunnerModel({ seed: 'sir-neighs' });
    const events = [];
    advance(model, 3, 1 / fps);
    events.push(...model.drainEvents());
    assert.equal(model.state.phase, 'running', `${fps} fps: countdown finishes`);
    assert.equal(model.state.countdown, 0);
    assert.equal(model.state.elapsed, 0, 'countdown must not consume playing time');
    assert.equal(model.state.distance, 0, 'course stays still during countdown');
    advance(model, 30, 1 / fps);
    events.push(...model.drainEvents());
    assert.equal(model.state.phase, 'complete', `${fps} fps: complete after 30 playing seconds`);
    assert.equal(model.state.elapsed, 30);
    assert.equal(model.state.remaining, 0);
    assert.equal(model.state.progress, 1);
    assert.equal(events.filter(e => e.type === 'start').length, 1);
    assert.equal(events.filter(e => e.type === 'complete').length, 1);
    const result = model.result();
    if (baseline) assert.deepEqual(result, baseline, `${fps} fps: same collisions and scoring`);
    else baseline = result;
    advance(model, 2);
    assert.deepEqual(model.result(), result, 'completion is final');
    assert.deepEqual(model.drainEvents(), [], 'completion cannot fire twice');
    assert.equal(model.move(1), false);
    assert.equal(model.jump(), false);
  }
});

test('pause freezes countdown, position and jump; stale or invalid time cannot fast-forward a round', () => {
  const model = createRunnerModel({ seed: 'pause' });
  advance(model, 1.25);
  model.pause('hidden');
  const countdown = structuredClone(model.state);
  model.step(10);
  assert.equal(model.move(1), false);
  assert.equal(model.jump(), false);
  assert.deepEqual(model.state, countdown);
  model.resume();
  assert.equal(model.state.phase, 'countdown');
  advance(model, 1.75);
  assert.equal(model.state.phase, 'running');
  model.jump();
  advance(model, .2);
  model.pause();
  const airborne = structuredClone(model.state);
  advance(model, 2);
  assert.deepEqual(model.state, airborne);
  model.resume();
  assert.equal(model.state.phase, 'running');
  const elapsed = model.state.elapsed;
  for (const dt of [NaN, Infinity, -1, 0]) model.step(dt);
  assert.equal(model.state.elapsed, elapsed);
  model.step(5);
  assert.ok(model.state.elapsed - elapsed <= .250001, 'large gaps must not cause several seconds of unseen collisions');
});

test('retry reproduces the course; different horses vary it; the opening is safe', () => {
  const first = createRunnerModel({ seed: 'sir-neighs' });
  assert.deepEqual(layout(first), layout(createRunnerModel({ seed: 'sir-neighs' })));
  assert.notDeepEqual(layout(first), layout(createRunnerModel({ seed: 'hayley' })));
  for (const horse of HORSES) {
    const model = createRunnerModel({ seed: horse.id });
    const logs = model.objects.filter(o => o.type === 'log');
    assert.ok(logs.length > 0);
    assert.ok(logs.every(o => o.time >= 6), `${horse.id}: time to learn controls before first log`);
    assert.ok(model.objects.every(o => [-1, 0, 1].includes(o.lane) && o.x === o.lane * 3));
    for (let i = 1; i < logs.length; i++) {
      assert.ok(logs[i].time - logs[i - 1].time > 1, `${horse.id}: obstacles allow reaction and landing time`);
    }
  }
});

test('lane changes respond smoothly, reverse immediately and stay on the track', () => {
  const model = isolated();
  assert.equal(model.move('right'), true);
  assert.equal(model.move('right'), false);
  advance(model, .05);
  assert.ok(model.state.x > 0 && model.state.x < 3);
  const turningPoint = model.state.x;
  model.move('left');
  advance(model, .025);
  assert.ok(model.state.x < turningPoint, 'reversal must act before the previous move finishes');
  advance(model, .15);
  assert.equal(model.state.x, 0);
  model.move(-1);
  advance(model, .15);
  assert.equal(model.state.x, -3);
  assert.equal(model.move(-1), false);
  for (const invalid of [undefined, NaN, 'nonsense', 0]) assert.equal(model.move(invalid), false);
  model.move(1);
  model.move(1);
  for (let i = 0; i < 25; i++) {
    model.step(PHYSICS_FRAME);
    assert.ok(Number.isFinite(model.state.x) && Math.abs(model.state.x) <= 3, 'rapid input cannot overshoot a lane');
  }
  assert.equal(model.state.x, 3);
});

test('a log hits once only during contact; a correctly timed jump clears its entire depth', () => {
  const log = fixture('log');
  const grounded = isolated(log);
  advance(grounded, .4);
  assert.equal(grounded.state.hits, 0, 'no collision while the log is still ahead');
  assert.equal(log.passed, false);
  advance(grounded, .3);
  assert.equal(grounded.state.hits, 1);
  assert.equal(log.hit, true);
  assert.equal(log.passed, true);
  assert.equal(grounded.drainEvents().filter(e => e.type === 'hit').length, 1, 'overlap across many frames is one hit');

  for (const fps of [120, 60, 30, 15, 10]) {
    const jumping = isolated(fixture('log'));
    advance(jumping, .15, 1 / fps);
    jumping.jump();
    advance(jumping, .8, 1 / fps);
    assert.equal(jumping.state.hits, 0, `${fps} fps: a visible jump clears the log`);
    assert.equal(jumping.objects[0].passed, true);
    assert.equal(jumping.state.airborne, false);
  }
});

test('entering a lane during the rear half of contact still detects a log', () => {
  const log = fixture('log');
  const model = isolated(log);
  model.move(1);
  advance(model, .5);
  assert.equal(model.state.hits, 0);
  assert.equal(log.passed, false, 'crossing the center line off-lane must not prematurely discard the object');
  model.move(-1);
  advance(model, .1);
  assert.equal(model.state.hits, 1, 'collision uses the whole contact interval, not a single crossing frame');
});

test('adjacent lanes cannot collect hearts or collide; passed objects never reactivate', () => {
  const log = fixture('log', 1);
  const heart = fixture('heart', 1);
  const model = isolated(log, heart);
  advance(model, .75);
  assert.equal(model.state.hits, 0);
  assert.equal(model.state.hearts, 0);
  assert.equal(log.passed, true);
  assert.equal(heart.passed, true);
  model.move(1);
  advance(model, .5);
  assert.equal(model.state.hits, 0, 'moving behind an obstacle cannot cause a phantom collision');
  assert.equal(model.state.hearts, 0, 'moving behind a heart cannot collect it');
});

test('missing a heart breaks the current streak without erasing the best streak', () => {
  const model = isolated(fixture('heart', 0, .5, 'one'), fixture('heart', 1, .75, 'miss'), fixture('heart', 0, 1, 'two'));
  advance(model, .6);
  assert.equal(model.state.hearts, 1);
  assert.equal(model.state.combo, 1);
  advance(model, .3);
  assert.equal(model.state.combo, 0);
  advance(model, .25);
  assert.equal(model.state.hearts, 2);
  assert.equal(model.state.combo, 1);
  assert.equal(model.state.bestCombo, 1);
});

test('repeated jump input cannot boost a horse in mid-air; input just before landing is buffered', () => {
  const model = isolated();
  model.jump(); model.jump(); model.jump();
  model.step(PHYSICS_FRAME);
  assert.equal(model.drainEvents().filter(e => e.type === 'jump').length, 1);
  const upwardSpeed = model.state.vy;
  model.jump();
  model.step(PHYSICS_FRAME);
  assert.ok(model.state.vy < upwardSpeed, 'an airborne press must not reset vertical speed');
  advance(model, .85);
  assert.equal(model.state.airborne, false);
  assert.equal(model.drainEvents().filter(e => e.type === 'jump').length, 0, 'an old input must expire before landing');
  model.jump();
  model.step(PHYSICS_FRAME);
  model.drainEvents();
  for (let i = 0; i < 120 && !(model.state.vy < 0 && model.state.y < .4); i++) model.step(PHYSICS_FRAME);
  assert.equal(model.state.airborne, true);
  model.jump();
  advance(model, .15);
  assert.equal(model.drainEvents().filter(e => e.type === 'jump').length, 1, 'a press in the landing buffer starts one new jump');
  assert.equal(model.state.airborne, true);
});

test('every shipped horse has a winnable route at normal and low frame rates; idling cannot win', () => {
  for (const horse of HORSES) {
    const idle = play(horse.id, 60, false);
    // Even the strongest flirt and carrot should not turn an untouched runner into a win.
    assert.ok(Math.round(90 * .4 + idle.chemistry * .6) < 70, `${horse.id}: active play is required`);
    for (const fps of [60, 15]) {
      const active = play(horse.id, fps, true);
      assert.equal(active.hits, 0, `${horse.id} at ${fps} fps: a collision-free path exists`);
      assert.ok(active.hearts / active.totalHearts >= .9, `${horse.id} at ${fps} fps: hearts are reachable`);
      assert.ok(Math.round(46 * .4 + active.chemistry * .6) >= 70, `${horse.id} at ${fps} fps: skill can reach 70% even after a weak flirt`);
    }
  }
});
