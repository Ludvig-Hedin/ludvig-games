import test from 'node:test';
import assert from 'node:assert/strict';
import { createCourse, createPlayer, stepPlayer, ROAD_HALF, RUN_DURATION, centerX, groundY } from '../../physics.js';

const tick = (p, input, course = [], consumed = new Set(), seconds = 1) => {
  const events = [];
  for (let i = 0; i < Math.ceil(seconds * 120); i++) events.push(...stepPlayer(p, input, 1 / 120, course, consumed));
  return events;
};

test('seed produces the same sorted, valid course and a different seed changes it', () => {
  const a = createCourse('2026-10-23'), b = createCourse('2026-10-23'), c = createCourse('different');
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
  assert.ok(a.length > 700);
  const ids = new Set();
  for (let i = 0; i < a.length; i++) {
    assert.ok(!ids.has(a[i].id)); ids.add(a[i].id);
    assert.ok(Math.abs(a[i].x) + a[i].w / 2 < ROAD_HALF);
    assert.ok(i === 0 || a[i - 1].s <= a[i].s);
  }
  assert.ok(a.filter(o => ['cone','barrier','crate'].includes(o.type)).every(o => o.s > 90));
});

test('auto acceleration, fixed timer, finite complete simulation', () => {
  const p = createPlayer();
  tick(p, {}, [], new Set(), RUN_DURATION + .1);
  assert.ok(p.finished);
  assert.equal(p.finishReason, 'time');
  assert.ok(p.distance > 2100 && p.distance < 2400);
  assert.equal(p.health, 3);
  for (const value of Object.values(p)) if (typeof value === 'number') assert.ok(Number.isFinite(value));
  assert.equal(p.timeLeft, 0);
  assert.ok(Number.isFinite(centerX(p.s) + groundY(p.s)));
});

test('steering is bounded by elastic shoulders and recovers', () => {
  const p = createPlayer();
  tick(p, {steer:1}, [], new Set(), 4);
  assert.ok(p.x <= ROAD_HALF - .65);
  const edge = p.x;
  tick(p, {steer:-1}, [], new Set(), 1);
  assert.ok(p.x < edge - 3);
  assert.equal(p.health, 3);
});

test('boost is faster, finite, and consumes fuel', () => {
  const a = createPlayer(), b = createPlayer();
  tick(a, {}, [], new Set(), 2);
  tick(b, {boost:true}, [], new Set(), 2);
  assert.ok(b.distance > a.distance * 1.4);
  assert.ok(b.boost >= 0 && b.boost < a.boost);
});

test('ramp produces flight, rings can be caught, and landing restores the road', () => {
  const p = createPlayer({s:95}); p.speed = 26;
  const course = [
    {id:0,type:'ramp',s:102,x:0,w:4.2,length:10,height:2.4},
    {id:1,type:'ring',s:126,x:0,w:4.8,length:1,height:5.1}
  ];
  const consumed = new Set();
  const events = tick(p, {}, course, consumed, 3);
  assert.ok(events.some(e => e.type === 'jump' && e.ramp));
  assert.ok(events.some(e => e.type === 'ring'));
  assert.ok(events.some(e => e.type === 'land'));
  assert.equal(p.grounded, true);
  assert.equal(p.y, 0);
  assert.ok(p.bestAir > 1);
});

test('holding jump cannot create automatic repeated jumps', () => {
  const p = createPlayer();
  const events = tick(p, {jump:true}, [], new Set(), 4);
  assert.equal(events.filter(e => e.type === 'jump').length, 1);
  assert.equal(p.grounded, true);
});

test('a second airborne jump press performs and rewards one barrel roll', () => {
  const p = createPlayer({s:95}); p.speed = 26;
  const course = [{id:0,type:'ramp',s:102,x:0,w:4.2,length:10,height:2.4}];
  tick(p, {}, course, new Set(), .6);
  assert.equal(p.grounded, false);
  assert.ok(p.y > .65);
  const events = tick(p, {jump:true}, course, new Set(), 1.4);
  assert.equal(events.filter(e => e.type === 'trick').length, 1);
  assert.equal(p.tricks, 1);
});

test('thin obstacles cannot tunnel at boosted speed; invulnerability prevents stacked damage', () => {
  const p = createPlayer({s:100}); p.speed = 48;
  const course = [
    {id:1,type:'barrier',s:101,x:0,w:3.5,length:.3,height:1.25},
    {id:2,type:'barrier',s:101.2,x:0,w:3.5,length:.3,height:1.25}
  ];
  const consumed = new Set();
  const events = stepPlayer(p, {boost:true}, .05, course, consumed);
  assert.equal(events.filter(e => e.type === 'hit').length, 1);
  assert.equal(p.health, 2);
  assert.ok(consumed.has(1));
  assert.ok(consumed.has(2));
});

test('cones penalize speed and combo without removing cargo health', () => {
  const p = createPlayer({s:100}); p.speed = 40; p.combo = 10;
  const course = [{id:1,type:'cone',s:101,x:0,w:.8,length:.8,height:.9}];
  const events = stepPlayer(p, {}, .05, course, new Set());
  assert.ok(events.some(e => e.type === 'hit' && e.damage === 0));
  assert.equal(p.health, 3);
  assert.equal(p.combo, 0);
  assert.ok(p.speed < 32);
});

test('airborne cart clears low obstacles', () => {
  const p = createPlayer({s:100}); p.speed = 40; p.y = 3; p.grounded = false; p.verticalSpeed = 2;
  const course = [{id:1,type:'barrier',s:101,x:0,w:3.5,length:1,height:1.25}];
  const events = stepPlayer(p, {}, .05, course, new Set());
  assert.ok(!events.some(e => e.type === 'hit'));
  assert.equal(p.health, 3);
});

test('pickup consumption is independent for split-screen players', () => {
  const course = [{id:2,type:'coin',s:101,x:0,w:.8,length:.8,height:1.25}];
  const a = createPlayer({s:100}), b = createPlayer({s:100}); a.speed = b.speed = 40;
  const ac = new Set(), bc = new Set();
  stepPlayer(a, {}, .05, course, ac);
  stepPlayer(b, {}, .05, course, bc);
  assert.equal(a.coins, 1); assert.equal(b.coins, 1);
  stepPlayer(a, {}, .05, course, ac);
  assert.equal(a.coins, 1);
});

test('best multiplier persists after a crash resets the active combo', () => {
  const p = createPlayer({s:100}); p.speed = 26;
  const course = Array.from({length:7}, (_,i) => ({id:i,type:'coin',s:103+i*3,x:0,w:.8,length:.8,height:1.25}));
  course.push({id:8,type:'crate',s:132,x:0,w:1.65,length:1.65,height:1.65});
  tick(p, {}, course, new Set(), 2);
  assert.equal(p.multiplier, 1);
  assert.ok(p.bestMultiplier > 1);
  assert.equal(p.health, 2);
});

test('three separated crashes end once and leave no further simulation', () => {
  const p = createPlayer(); const consumed = new Set();
  let finishes = 0;
  for (let i = 0; i < 3; i++) {
    p.s = 100 + i * 100; p.speed = 30; p.invulnerable = 0;
    const events = stepPlayer(p, {}, .05, [{id:i,type:'crate',s:p.s+1,x:0,w:1.65,length:1.65,height:1.65}], consumed);
    finishes += events.filter(e => e.type === 'finish').length;
  }
  assert.equal(p.health, 0); assert.equal(p.finished, true); assert.equal(finishes, 1);
  assert.equal(p.speed, 0);
  const s = p.s;
  assert.deepEqual(stepPlayer(p, {}, 1/60, [], consumed), []);
  assert.equal(p.s, s);
});
