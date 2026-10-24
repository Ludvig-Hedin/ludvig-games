import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../logic.js';

// Records every api call so courses can be checked without three.js.
function recorder() {
  const calls = [];
  return {calls, api: new Proxy({}, {get: (_, name) => (...args) => { calls.push([name, ...args]); }})};
}

const JUMP_V = 10.8, GRAVITY = 25, APEX = JUMP_V ** 2 / (2 * GRAVITY);

test('every world builds a course with spawn, goal, route and coins', () => {
  for (const w of [...L.WORLDS.map(w => w.id), 'plaza']) {
    const {api, calls} = recorder();
    const course = L.buildCourse(api, w);
    assert.ok(course.spawn.length === 3, w);
    assert.ok(course.path.length >= 1, w);
    if (w === 'plaza') { assert.equal(course.goal, null); assert.equal(course.podium.length, 3); continue; }
    assert.ok(Array.isArray(course.goal), w);
    assert.ok(calls.some(c => c[0] === 'goal'), w);
    assert.ok(calls.filter(c => c[0] === 'coin').length >= 4, w);
    assert.ok(course.path.length >= 3, w);
    const last = course.path[course.path.length - 1];
    assert.deepEqual(last.slice(0, 3), course.goal.slice(0, 3), `${w} route ends at the goal`);
  }
});

test('new worlds each use their own mechanic', () => {
  const uses = {shuttle: 'mover', factory: 'conveyor', windy: 'fan', crumble: 'crumble', clock: 'door', bounce: 'bounce'};
  for (const [id, call] of Object.entries(uses)) {
    const {api, calls} = recorder();
    L.buildCourse(api, id);
    assert.ok(calls.filter(c => c[0] === call).length >= 3, `${id} uses ${call}`);
  }
  const {api, calls} = recorder();
  const summit = L.buildCourse(api, 'summit');
  assert.equal(summit.checkpoints.length, 6);
  for (const call of ['mover', 'conveyor', 'fan', 'crumble', 'door', 'bounce', 'wind']) assert.ok(calls.some(c => c[0] === call), `summit uses ${call}`);
  assert.ok(L.WORLDS.length >= 12);
});

test('layouts stay jumpable', () => {
  for (const [id, def] of Object.entries(L.LAYOUTS)) {
    const placed = L.placeSegments(def.segs);
    let prev = {k: 'start', top: 0, x: 0, w: 16, z: 4, d: 16};
    for (const s of placed) {
      const rise = s.top - prev.top;
      // Reach from the previous segment: a plain jump, a lift at its top, a fan column or a bounce pad.
      let reach = APEX - 0.3;
      if (prev.k === 'mover' && prev.axis === 'y') reach = prev.amp + APEX - 0.3;
      if (prev.k === 'fan') reach = prev.height - 0.5;
      if (prev.k === 'bounce') reach = prev.power ** 2 / (2 * GRAVITY) - 0.5;
      if (s.k === 'mover' && s.axis === 'y') assert.ok(rise - s.amp <= reach, `${id}: lift reachable`);
      else assert.ok(rise <= reach, `${id}: rise ${rise.toFixed(2)} after ${prev.k} exceeds ${reach.toFixed(2)}`);
      const zMover = (s.k === 'mover' && s.axis === 'z') || (prev.k === 'mover' && prev.axis === 'z');
      const effGap = zMover ? s.gap - (s.amp || prev.amp) : s.gap;
      assert.ok(effGap <= 3.6, `${id}: gap ${effGap} too wide before ${s.k}`);
      // Lateral overlap so a straight jump can land (movers sweep across the line).
      const overlap = Math.min(prev.x + prev.w / 2, s.x + s.w / 2) - Math.max(prev.x - prev.w / 2, s.x - s.w / 2);
      if (!(s.k === 'mover' || prev.k === 'mover')) assert.ok(overlap > -1.5, `${id}: lateral offset too big before ${s.k}`);
      prev = s;
    }
    assert.equal(placed[placed.length - 1].k, 'goal', id);
  }
});

test('par times are reachable at a steady pace', () => {
  for (const w of L.WORLDS) {
    const {api} = recorder();
    const course = L.buildCourse(api, w.id);
    const length = L.pathLength(course.path);
    const sprintTime = length / 9.5;
    console.log(`${w.id.padEnd(8)} route ${length.toFixed(0).padStart(4)} m  sprint ${sprintTime.toFixed(0).padStart(3)} s  par ${w.par}`);
    assert.ok(w.par >= sprintTime * 1.35, `${w.id} par ${w.par} too tight for ${length.toFixed(0)} m`);
    assert.ok(w.par <= sprintTime * 4 + 20, `${w.id} par ${w.par} too loose`);
  }
});

test('route progress grows along the course and ends at 1', () => {
  const {api} = recorder();
  const course = L.buildCourse(api, 'tower');
  const p0 = L.pathProgress(course.path, 0, 0, 6);
  const mid = course.path[6];
  const p1 = L.pathProgress(course.path, mid[0], mid[1], mid[2]);
  const end = course.path[course.path.length - 1];
  const p2 = L.pathProgress(course.path, end[0], end[1], end[2]);
  assert.ok(p0 < 0.02 && p1 > 0.3 && p1 < 0.7 && p2 > 0.99, `${p0} ${p1} ${p2}`);
});

test('stars, rewards and daily world', () => {
  assert.equal(L.starMask({coins: 3, total: 5, time: 99, par: 40}), 1);
  assert.equal(L.starMask({coins: 5, total: 5, time: 39, par: 40}), 7);
  assert.equal(L.countStars(5), 2);
  assert.equal(L.finishReward({featured: true, newStars: 2}), 400);
  assert.equal(L.placeBonus(1, 1), 0);
  assert.equal(L.placeBonus(1, 3), 100);
  assert.equal(L.placeBonus(6, 8), 10);
  const a = L.featuredWorld('2026-10-23'), b = L.featuredWorld('2026-10-23');
  assert.equal(a, b);
  assert.ok(L.RACE_WORLDS.includes(a));
  const seen = new Set(Array.from({length: 40}, (_, i) => L.featuredWorld(`2026-11-${i}`)));
  assert.ok(seen.size >= 6, 'featured world rotates');
  assert.equal(L.dayKey(new Date(2026, 0, 5)), '2026-01-05');
});

test('progress parsing is defensive and shop spends correctly', () => {
  assert.deepEqual(L.parseProgress('not json'), L.defaultProgress());
  const p = L.parseProgress(JSON.stringify({stars: {obby: 7, nope: 3, tower: 99}, owned: {hats: ['crown', 'bogus', 'crown'], trails: ['fire'], colors: ['#f5c542', '#000000']}, hat: 'crown', trail: 'rainbow', wins: 4}));
  assert.deepEqual(p.stars, {obby: 7});
  assert.deepEqual(p.owned.hats, ['crown']);
  assert.deepEqual(p.owned.colors, ['#f5c542']);
  assert.equal(p.hat, 'crown');
  assert.equal(p.trail, 'none', 'unowned trail is not equipped');
  assert.equal(p.wins, 4);
  const q = L.defaultProgress();
  assert.deepEqual(L.buyItem(q, 100, 'hat', 'cap'), {ok: false, credits: 100, error: 'funds'});
  assert.deepEqual(L.buyItem(q, 1000, 'hat', 'cap'), {ok: true, credits: 750});
  assert.deepEqual(L.buyItem(q, 750, 'hat', 'cap'), {ok: true, credits: 750}, 'owned items are free');
  assert.ok(L.ownsItem(q, 'color', '#416ba4'), 'base colors are free');
  assert.ok(!L.ownsItem(q, 'color', '#f5c542'));
});

test('state messages are small, round-trip and reject junk', () => {
  const msg = L.encodeState({scene: 'obby#3', x: 1.234, y: 2.5, z: -40.019, yaw: 3.14159, grounded: true, moving: true, sprint: false, progress: 0.4567});
  assert.ok(JSON.stringify(msg).length < 90, JSON.stringify(msg));
  const s = L.decodeState(JSON.parse(JSON.stringify(msg)));
  assert.equal(s.scene, 'obby#3');
  assert.ok(Math.abs(s.x - 1.23) < 1e-9 && Math.abs(s.z + 40.02) < 1e-9);
  assert.ok(s.grounded && s.moving && !s.sprint);
  assert.equal(s.progress, 0.457);
  assert.equal(L.decodeState({t: 's', w: 'x', p: [1, 2], r: 0}), null);
  assert.equal(L.decodeState({t: 's', w: 'x', p: [1, 2, NaN], r: 0}), null);
  assert.equal(L.decodeState({t: 's', w: 'x'.repeat(40), p: [1, 2, 3], r: 0}), null);
  assert.ok(!L.stateChanged(msg, {...msg, p: [msg.p[0] + 1, msg.p[1], msg.p[2]]}));
  assert.ok(L.stateChanged(msg, {...msg, p: [msg.p[0] + 5, msg.p[1], msg.p[2]]}));
  assert.deepEqual(L.sanitizeLook({c: ['#ff0000', '#00ff00', '#0000ff'], h: 'crown', r: 'evil'}), {body: '#ff0000', shirt: '#00ff00', head: '#0000ff', hat: 'crown', trail: 'none'});
  assert.equal(L.sanitizeLook({c: ['red', '#00ff00', '#0000ff']}), null);
});

test('interpolation renders in the past, eases between snapshots and snaps on teleport', () => {
  const buf = new L.Interp(100, 4);
  const st = (x, extra = {}) => ({x, y: 0, z: 0, yaw: 0, grounded: true, moving: true, sprint: false, progress: 0, scene: 'a', ...extra});
  buf.push(st(0), 1000); buf.push(st(1), 1100); buf.push(st(2), 1200);
  assert.ok(Math.abs(buf.sample(1150).x - 0.5) < 1e-9);
  assert.equal(buf.sample(5000).x, 2, 'holds the last snapshot');
  assert.equal(buf.sample(0).x, 0);
  buf.push(st(50), 1300);
  assert.equal(buf.sample(1350).x, 2, 'teleport waits, then snaps');
  assert.equal(buf.sample(1400).x, 50);
  for (let i = 0; i < 20; i++) buf.push(st(i), 2000 + i * 100);
  assert.equal(buf.list.length, 4, 'bounded');
  const yaw = new L.Interp(0);
  yaw.push(st(0, {yaw: 3.1}), 0); yaw.push(st(0, {yaw: -3.1}), 100);
  assert.ok(Math.abs(Math.abs(yaw.sample(50).yaw) - Math.PI) < 0.05, 'turns the short way');
});

test('send budget caps messages per second', () => {
  const b = new L.Budget(12, 12);
  let sent = 0;
  for (let t = 0; t < 3000; t += 10) if (b.take(t)) sent++;
  assert.ok(sent <= 12 + 36 + 1, `sent ${sent}`);
  assert.ok(sent >= 40);
});

test('race flow: meta, ranking, end rules, votes', () => {
  const plaza = L.plazaMeta(null, {world: 'obby', round: 0, auto: 0});
  assert.ok(L.readMeta(plaza));
  const race = L.raceMeta(L.readMeta(plaza), ['a', 'b', 'c']);
  const r = L.readMeta(race);
  assert.equal(r.phase, 'race'); assert.equal(r.round, 1); assert.deepEqual(r.racers, ['a', 'b', 'c']);
  const finishes = new Map([['b', 41000], ['a', 39000]]);
  assert.deepEqual(L.rankFinishes(finishes, r.racers), [['a', 39000], ['b', 41000]]);
  assert.deepEqual(L.liveOrder(['a', 'b', 'c'], new Map([['c', 50000]]), new Map([['a', 0.2], ['b', 0.7]])), ['c', 'b', 'a']);
  const base = {racers: r.racers, present: ['a', 'b', 'c'], finishes, goAt: 0};
  assert.equal(L.raceOver({...base, now: 50000, firstFinishAt: 39000}), false);
  assert.equal(L.raceOver({...base, now: 69001, firstFinishAt: 39000}), true, 'grace after first finish');
  assert.equal(L.raceOver({...base, present: ['a', 'b'], now: 40000, firstFinishAt: 39000}), true, 'everyone left has finished');
  assert.equal(L.raceOver({racers: ['a'], present: ['a'], finishes: new Map(), goAt: 0, now: 300001}), true, 'hard cap');
  const res = L.readMeta(L.resultsMeta(r, finishes, ['a', 'b', 'c'], ['tower', 'lava', 'windy']));
  assert.deepEqual(res.res, [['a', 39000], ['b', 41000]]);
  assert.deepEqual(res.dnf, ['c']);
  assert.ok(JSON.stringify(L.resultsMeta(L.raceMeta(L.readMeta(plaza), Array.from({length: 8}, (_, i) => 'abcdefghi' + i)), new Map(Array.from({length: 8}, (_, i) => ['abcdefghi' + i, 123456 + i])), [], ['tower', 'lava', 'windy'])).length < 1024, 'meta fits 1 KB');
  const opts = L.voteOptions('obby', () => 0.3);
  assert.equal(opts.length, 3); assert.ok(!opts.includes('obby')); assert.equal(new Set(opts).size, 3);
  assert.equal(L.tallyVotes(new Map([['a', 'lava'], ['b', 'lava'], ['c', 'tower']]), ['tower', 'lava', 'windy']), 'lava');
  assert.equal(L.tallyVotes(new Map(), ['tower', 'lava'], () => 0.99), 'lava');
  assert.equal(L.readMeta({v: 1, phase: 'race', world: 'nope', seq: 1, round: 1}), null);
});

test('quick match prefers the fullest open room of the right world', () => {
  const rooms = [
    {code: 'AAAA', players: 2, max: 8, meta: {v: 1, world: 'obby', open: true}},
    {code: 'BBBB', players: 5, max: 8, meta: {v: 1, world: 'obby'}},
    {code: 'CCCC', players: 8, max: 8, meta: {v: 1, world: 'obby'}},
    {code: 'DDDD', players: 3, max: 8, meta: {v: 1, world: 'lava'}},
    {code: 'EEEE', players: 1, max: 8, meta: {}}
  ];
  assert.deepEqual(L.pickQuickRooms(rooms, 'obby'), ['BBBB', 'AAAA']);
  assert.deepEqual(L.pickQuickRooms(rooms, null), ['BBBB', 'DDDD', 'AAAA']);
  assert.equal(L.normalizeCode(' ab2c '), 'AB2C');
  assert.equal(L.normalizeCode('AB1C'), null);
  assert.equal(L.ordinal(1), '1st'); assert.equal(L.ordinal(2), '2nd'); assert.equal(L.ordinal(3), '3rd'); assert.equal(L.ordinal(11), '11th'); assert.equal(L.ordinal(22), '22nd');
});
