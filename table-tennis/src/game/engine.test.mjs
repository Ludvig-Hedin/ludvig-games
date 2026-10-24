import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, stepGame, serveGame, serverForScore, TABLE, FIXED_STEP } from './engine.js';

function advance(s, seconds, inputs = [{}, {}], hz = 120) {
  for (let i = 0; i < Math.round(seconds * hz); i++) stepGame(s, inputs, 1 / hz);
  return s;
}
function liveState({ lastHit = 0, bounces = 0, phase = 'rally', serveStage = 'complete', ball = {} } = {}) {
  const s = createGame({ mode: 'local', seed: 731 });
  Object.assign(s, { phase, phaseTime: 0, lastHit, bounces, serveStage });
  Object.assign(s.ball, { x: 0, y: 1, z: -.5, vx: 0, vy: -1, vz: -1, wx: 0, wy: 0, wz: 0, ...ball });
  return s;
}
function scorePoint(s, winner) {
  s.phase = 'rally'; s.phaseTime = 0; s.serveStage = 'complete'; s.lastHit = winner; s.bounces = 1;
  Object.assign(s.ball, { x: 0, y: .80, z: winner === 0 ? -.7 : .7, vx: 0, vy: -2, vz: 0, wx: 0, wy: 0, wz: 0 });
  advance(s, .03);
  return s;
}

test('human ready state waits; serve request rejects wrong side and performs legal visible toss', () => {
  const s = createGame({ mode: 'local' });
  advance(s, 2);
  assert.equal(s.phase, 'ready');
  assert.equal(serveGame(s, 1), false);
  assert.equal(serveGame(s, 0), true);
  const firstY = s.ball.y;
  let peak = firstY, firstHit = null;
  for (let i = 0; i < 180; i++) {
    stepGame(s, [{ x: 0 }, { x: 1.1 }], FIXED_STEP);
    peak = Math.max(peak, s.ball.y);
    firstHit ||= s.events.find(e => e.type === 'paddle');
  }
  assert.ok(peak - firstY > .16, `toss height ${peak - firstY}`);
  assert.ok(firstHit, 'the serving paddle makes physical contact');
  assert.equal(firstHit.side, 0);
  assert.ok(firstHit.z > TABLE.halfLength, 'serve struck behind end line');
});

test('both servers bounce on own half then opponent half, with an actual paddle strike', () => {
  for (const server of [0, 1]) {
    const s = createGame({ mode: 'local' });
    s.server = server;
    serveGame(s, server);
    const events = [];
    let lastId = 0;
    for (let i = 0; i < 2 * 240; i++) {
      stepGame(s, [{ x: 0 }, { x: 0 }], FIXED_STEP);
      for (const e of s.events) if (e.id > lastId) { events.push(e); lastId = e.id; }
      if (events.filter(e => e.type === 'bounce').length >= 2) break;
    }
    assert.equal(events.find(e => e.type === 'paddle')?.side, server);
    assert.deepEqual(events.filter(e => e.type === 'bounce').slice(0, 2).map(e => e.side), [server, 1 - server]);
    assert.equal(s.phase, 'rally');
    assert.equal(s.score[0] + s.score[1], 0);
  }
});

test('server rotation every two points and every point after deuce', () => {
  assert.deepEqual(Array.from({ length: 8 }, (_, total) => serverForScore([total, 0])), [0, 0, 1, 1, 0, 0, 1, 1]);
  assert.equal(serverForScore([10, 10]), 0);
  assert.equal(serverForScore([11, 10]), 1);
  assert.equal(serverForScore([11, 11]), 0);
  assert.equal(serverForScore([12, 11], 1), 0);
});

test('scoring to 11 requires two clear points; games and matches transition correctly', () => {
  const s = createGame({ mode: 'local', bestOf: 3 });
  s.score = [10, 10];
  scorePoint(s, 0);
  assert.deepEqual(s.score, [11, 10]);
  assert.deepEqual(s.games, [0, 0]);
  advance(s, 1.5);
  assert.equal(s.phase, 'ready');
  assert.equal(s.server, 1);
  scorePoint(s, 1);
  assert.deepEqual(s.score, [11, 11]);
  scorePoint(s, 0); scorePoint(s, 0);
  assert.deepEqual(s.score, [13, 11]);
  assert.deepEqual(s.games, [1, 0]);
  assert.equal(s.phase, 'gameover');
  advance(s, 2.4);
  assert.deepEqual(s.score, [0, 0]);
  assert.equal(s.server, 1, 'first server alternates between games');
  s.score = [10, 4]; scorePoint(s, 0);
  assert.equal(s.phase, 'matchover');
  assert.equal(s.winner, 0);
  assert.deepEqual(s.games, [2, 0]);
  advance(s, 20);
  assert.equal(s.phase, 'matchover');
  assert.deepEqual(s.games, [2, 0]);
});

test('best-of 5 and 7 require the appropriate number of games', () => {
  for (const bestOf of [5, 7]) {
    const s = createGame({ mode: 'local', bestOf });
    const needed = Math.ceil(bestOf / 2);
    for (let game = 0; game < needed; game++) {
      s.score = [10, 2]; scorePoint(s, 0);
      assert.equal(s.phase, game === needed - 1 ? 'matchover' : 'gameover');
      if (game !== needed - 1) advance(s, 2.4);
    }
    assert.equal(s.games[0], needed);
  }
});

test('double bounce awards striker, wrong-half bounce awards opponent', () => {
  const double = liveState({ lastHit: 0, bounces: 1, ball: { y: .79, vy: -3, z: -.8, vz: 0 } });
  advance(double, .02);
  assert.equal(double.lastPoint.winner, 0);
  assert.equal(double.lastPoint.reason, 'Double bounce');
  const wrong = liveState({ lastHit: 0, bounces: 0, ball: { y: .79, vy: -3, z: .8, vz: 0 } });
  advance(wrong, .02);
  assert.equal(wrong.lastPoint.winner, 1);
  assert.equal(wrong.lastPoint.reason, 'Wrong side of the table');
});

test('a volley over the table loses the point; passing end line without bounce is out', () => {
  // Move the receiver forward for a genuine obstruction before the end line.
  const s = liveState({ ball: { x: 0, y: 1.0, z: -1.27, vy: 0, vz: -5 } });
  s.paddles[1].z = -1.31;
  advance(s, .025, [{}, { x: 0, depth: 1.43, swing: true }]);
  assert.equal(s.lastPoint?.winner, 0);
  assert.match(s.lastPoint.reason, /Volley/);
  const long = liveState({ ball: { y: 1.5, z: -1.36, vy: 0, vz: -8 } });
  advance(long, .03);
  assert.equal(long.lastPoint.winner, 1);
  assert.match(long.lastPoint.reason, /Long/);
});

test('swept high speed table collision never tunnels through the tabletop', () => {
  const s = liveState({ ball: { x: .2, y: .9, z: -.7, vy: -45, vz: -1 } });
  stepGame(s, [{}, {}], FIXED_STEP);
  assert.ok(s.ball.y >= TABLE.height + TABLE.ballRadius);
  assert.ok(s.ball.vy > 0);
  assert.ok(s.events.some(e => e.type === 'bounce'));
});

test('net cloth absorbs energy and reverses forward motion without awarding an immediate point', () => {
  const s = liveState({ ball: { x: 0, y: .84, z: .045, vx: 0, vy: 0, vz: -8 } });
  stepGame(s, [{}, {}], FIXED_STEP);
  assert.ok(s.ball.vz > 0);
  assert.ok(s.ball.vz < 2);
  assert.ok(s.events.some(e => e.type === 'net'));
  assert.equal(s.score[0] + s.score[1], 0);
});

test('a valid serve after touching the net is a let without a point', () => {
  const s = liveState({ phase: 'serve', serveStage: 'opponent', lastHit: 0, bounces: 1, ball: { y: .80, vy: -3, z: -.7, vz: -1 } });
  s.serveNet = true;
  advance(s, .02);
  assert.deepEqual(s.score, [0, 0]);
  assert.equal(s.stats.lets, 1);
  assert.ok(s.events.some(e => e.type === 'let'));
  advance(s, 1.5);
  assert.equal(s.phase, 'ready');
  assert.equal(s.server, 0);
});

test('topspin bends downward; backspin floats higher; sidespin curves laterally', () => {
  const make = spin => liveState({ ball: { x: 0, y: 1.7, z: .9, vx: 0, vy: 0, vz: -3, ...spin } });
  const flat = make({}), top = make({ wx: -180 }), back = make({ wx: 180 }), side = make({ wy: 180 });
  for (const s of [flat, top, back, side]) advance(s, .20);
  assert.ok(top.ball.y < flat.ball.y - .01);
  assert.ok(back.ball.y > flat.ball.y + .01);
  assert.ok(Math.abs(side.ball.x) > .01);
});

test('table friction changes the rebound according to spin', () => {
  const top = liveState({ ball: { y: .79, z: -.5, vy: -3, vz: -4, wx: -170 } });
  const back = liveState({ ball: { y: .79, z: -.5, vy: -3, vz: -4, wx: 170 } });
  stepGame(top, [], FIXED_STEP); stepGame(back, [], FIXED_STEP);
  assert.ok(Math.abs(top.ball.vz) > Math.abs(back.ball.vz) + .3);
});

test('AI rallies use actual paddle collisions and remain stable for several minutes', () => {
  const s = createGame({ mode: 'demo', seed: 123 });
  let last = { ...s.ball }, contacts = 0, previousEvent = 0;
  for (let i = 0; i < 180 * 120; i++) {
    const before = s.phase;
    stepGame(s, [], 1 / 120);
    assert.ok([s.ball.x, s.ball.y, s.ball.z, s.ball.vx, s.ball.vy, s.ball.vz].every(Number.isFinite));
    if (['serve', 'rally'].includes(before) && ['serve', 'rally'].includes(s.phase)) {
      const distance = Math.hypot(s.ball.x - last.x, s.ball.y - last.y, s.ball.z - last.z);
      assert.ok(distance < .25, `ball moved ${distance}m in 1/120 second`);
    }
    for (const e of s.events) if (e.id > previousEvent) {
      if (e.type === 'paddle') {
        const p = s.paddles[e.side];
        assert.ok(Math.abs(e.x - p.x) < TABLE.paddleRadius + .06, 'strike lies on actual paddle');
        assert.ok(Math.abs(e.z - p.z) < .065, 'strike lies on actual paddle plane');
        contacts++;
      }
      previousEvent = e.id;
    }
    last = { ...s.ball };
  }
  assert.ok(contacts > 80, `only ${contacts} paddle contacts`);
  assert.ok(s.stats.longestRally >= 15, `longest rally ${s.stats.longestRally}`);
});

test('fixed timestep produces identical results across rendering rates and serialization', () => {
  const a = createGame({ mode: 'demo', seed: 551 });
  const b = createGame({ mode: 'demo', seed: 551 });
  advance(a, 10, [], 30); advance(b, 10, [], 120);
  assert.equal(a.tick, b.tick);
  assert.deepEqual(a.ball, b.ball);
  assert.deepEqual(a.score, b.score);
  const resumed = JSON.parse(JSON.stringify(a));
  advance(a, 6, [], 60); advance(resumed, 6, [], 60);
  assert.deepEqual(a, resumed);
});

test('all five difficulty levels complete legal serves and meaningful physical returns', () => {
  const results = [];
  for (let difficulty = 0; difficulty < 5; difficulty++) {
    const s = createGame({ mode: 'local', difficulty, seed: 9021 });
    advance(s, 80, [{ auto: true }, { auto: true }]);
    assert.ok(s.stats.shots[0] >= 10);
    assert.ok(s.stats.shots[1] >= 10);
    assert.ok(s.stats.longestRally >= 3);
    results.push(s.stats.longestRally);
  }
  assert.ok(results[4] > results[0], `Pro rally ${results[4]} vs beginner ${results[0]}`);
});

test('paddle motion obeys a speed limit even for an instant target jump', () => {
  const s = createGame({ mode: 'local' });
  stepGame(s, [{ x: 100 }, { x: -100 }], 1 / 60);
  assert.ok(Math.abs(s.paddles[0].x) <= 4.2 / 60 + 1e-6);
  assert.ok(Math.abs(s.paddles[1].x) <= 4.2 / 60 + 1e-6);
});
