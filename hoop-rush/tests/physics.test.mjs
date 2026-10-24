import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COURT, PHYSICS_STEP, DIFFICULTIES,
  createBall, stepBall, simulateShot, makeShotVelocity, hoopAt, floorAt, aiShot,
} from '../lib/physics.mjs';

function run(ball, seconds, frame = PHYSICS_STEP, challenge = ball.challenge) {
  const events = [];
  for (let elapsed = 0; elapsed < seconds - 1e-9; elapsed += frame) {
    events.push(...stepBall(ball, Math.min(frame, seconds - elapsed), ball.shotTime + ball.age, challenge));
  }
  return events;
}

test('a centred release follows a gravity parabola before contact', () => {
  const ball = createBall({ aim: 0.1, power: 0.58 });
  const v = makeShotVelocity(0.1, 0.58);
  run(ball, 0.5);
  assert.ok(Math.abs(ball.x - v.vx * 0.5) < 1e-10);
  assert.ok(Math.abs(ball.y - (COURT.launchY + v.vy * 0.5 - COURT.gravity * 0.125)) < 1e-10);
  assert.ok(Math.abs(ball.z - (COURT.launchZ + v.vz * 0.5)) < 1e-10);
});

test('the calibrated shot swishes and crosses the real hoop within 1.3 seconds', () => {
  const shot = simulateShot({ aim: 0, power: 0.58 });
  assert.equal(shot.scored, true);
  assert.equal(shot.swish, true);
  assert.equal(shot.contacts.rim, 0);
  assert.equal(shot.contacts.board, 0);
  assert.ok(shot.scoreTime > 1.2 && shot.scoreTime < 1.3);
});

test('distance and precision use their actual launch positions and rim dimensions', () => {
  assert.ok(createBall({ challenge: 'distance' }).z > COURT.launchZ);
  assert.ok(hoopAt(0, 'precision').radius < COURT.rimRadius);
  assert.equal(simulateShot({ challenge: 'distance' }).scored, true);
  assert.equal(simulateShot({ challenge: 'precision' }).scored, true);
});

test('a lateral miss does not score in an oversized trigger', () => {
  assert.equal(simulateShot({ aim: 0.5, power: 0.58 }).scored, false);
  const ball = createBall();
  Object.assign(ball, { x: 0.4, y: 3.2, z: COURT.rimZ, vx: 0, vy: -3, vz: 0 });
  const events = run(ball, 0.22);
  assert.equal(events.some(event => event.type === 'score'), false);
});

test('crossing the hoop upward never awards a basket', () => {
  const ball = createBall();
  Object.assign(ball, { x: 0, y: 2.7, z: COURT.rimZ, vx: 0, vy: 8, vz: 0 });
  const events = run(ball, 0.12);
  assert.ok(ball.y > COURT.rimY);
  assert.equal(ball.rimGate, false);
  assert.equal(events.some(event => event.type === 'score'), false);
});

test('ball must clear the underside, and can score only once', () => {
  const ball = createBall();
  const events = run(ball, 5.8);
  assert.equal(events.filter(event => event.type === 'score').length, 1);
  assert.equal(events.filter(event => event.type === 'net').length, 1);
  assert.equal(ball.contacts.net, 1);
});

test('rim contact gives an actual deflection and cannot tunnel at high speed', () => {
  const ball = createBall();
  Object.assign(ball, { x: 0, y: 3.4, z: COURT.rimZ + COURT.rimRadius, vx: 0, vy: -80, vz: 0 });
  const events = run(ball, 0.012, 0.012);
  assert.ok(events.some(event => event.type === 'rim'));
  assert.ok(ball.vy > 0);
  assert.equal(ball.scored, false);
});

test('finite backboard rebounds fast shots without tunnelling', () => {
  const ball = createBall();
  Object.assign(ball, { x: 0, y: 3.5, z: -1, vx: 0, vy: 0, vz: -60 });
  const events = run(ball, 0.04, 0.04);
  assert.ok(events.some(event => event.type === 'board'));
  assert.ok(ball.vz > 0);
  assert.ok(ball.z > COURT.boardZ);
});

test('off-edge balls do not collide with an infinite backboard', () => {
  const ball = createBall();
  Object.assign(ball, { x: 1.4, y: 3.5, z: -1.1, vx: 0, vy: 0, vz: -6 });
  const events = run(ball, 0.12);
  assert.equal(events.some(event => event.type === 'board'), false);
});

test('return floor rebounds and loses energy', () => {
  const ball = createBall();
  Object.assign(ball, { x: 0, y: 1.4, z: 0, vx: 1, vy: -5, vz: 0 });
  const events = run(ball, 0.15);
  assert.ok(events.some(event => event.type === 'floor'));
  assert.ok(ball.vy > 0 && ball.vy < 5);
  assert.ok(ball.y >= floorAt(ball.z) + COURT.ballRadius - 0.002);
  assert.ok(ball.vx < 1);
});

test('a bank shot is resolved by collisions rather than awarded in advance', () => {
  const shot = simulateShot({ aim: 0, power: 0.8 });
  assert.equal(shot.scored, true);
  assert.equal(shot.swish, false);
  assert.ok(shot.contacts.board > 0);
});

test('identical inputs replay deterministically, including moving hoops', () => {
  const options = { aim: 0.19, power: 0.61, shotTime: 17.8, challenge: 'moving', trajectory: true };
  assert.deepEqual(simulateShot(options), simulateShot(options));
});

test('30, 60, and 240 Hz frame intervals produce matching outcomes', () => {
  for (const power of [0.52, 0.58, 0.62, 0.8]) {
    const fine = createBall({ power });
    const sixty = createBall({ power });
    const thirty = createBall({ power });
    run(fine, 3, 1 / 240); run(sixty, 3, 1 / 60); run(thirty, 3, 1 / 30);
    assert.equal(fine.scored, sixty.scored);
    assert.equal(fine.scored, thirty.scored);
    assert.ok(Math.abs(fine.x - sixty.x) < 1e-6);
    assert.ok(Math.abs(fine.y - thirty.y) < 1e-6);
    assert.ok(Math.abs(fine.z - thirty.z) < 1e-6);
  }
});

test('AI shot accuracy and recovery are distinct at all five levels', () => {
  const rates = [], recovery = [];
  for (const level of DIFFICULTIES) {
    let makes = 0, delay = 0;
    for (let i = 0; i < 500; i++) {
      const shot = aiShot(level, i, 271828, i * 1.5);
      makes += Number(simulateShot(shot).scored);
      delay += shot.delay;
    }
    rates.push(makes / 500); recovery.push(delay / 500);
  }
  for (let i = 1; i < rates.length; i++) {
    assert.ok(rates[i] > rates[i - 1] + 0.025, `${DIFFICULTIES[i]} should be more precise: ${rates}`);
    assert.ok(recovery[i] < recovery[i - 1]);
  }
  assert.ok(rates[0] > 0.1 && rates[0] < 0.5);
  assert.ok(rates.at(-1) > 0.85 && rates.at(-1) < 1);
});

test('moving-hoop AI predicts future position and still uses ordinary physics', () => {
  let hits = 0;
  for (let i = 0; i < 100; i++) {
    const shotTime = i * 1.39;
    const shot = aiShot('Pro', i, 4321, shotTime, 'moving');
    hits += Number(simulateShot({ ...shot, shotTime, challenge: 'moving' }).scored);
  }
  assert.ok(hits > 70 && hits < 100, `Expected strong, imperfect play; got ${hits}`);
});

test('ball rotation remains a unit quaternion through repeated impacts', () => {
  const ball = createBall({ aim: 0.38, power: 0.94 });
  run(ball, 5.8);
  const { x, y, z, w } = ball.rotation;
  assert.ok(Math.abs(Math.hypot(x, y, z, w) - 1) < 1e-10);
});

test('non-finite controls are sanitized and the simulation remains finite', () => {
  const ball = createBall({ aim: NaN, power: Infinity });
  run(ball, 2);
  assert.ok([ball.x, ball.y, ball.z, ball.vx, ball.vy, ball.vz].every(Number.isFinite));
  assert.ok(Object.values(ball.rotation).every(Number.isFinite));
  assert.deepEqual(stepBall(ball, NaN), []);
});
