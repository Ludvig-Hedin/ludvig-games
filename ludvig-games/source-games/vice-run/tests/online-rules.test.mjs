// Node test for Neon's pure online rules (interpolation, Tag, Checkpoint race, invite codes).
// Run: node --test source-games/vice-run/tests/online-rules.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const block = html.match(/<script>\s*\/\* Neon online rules[\s\S]*?<\/script>/)[0].replace(/^<script>|<\/script>$/g, '');
const sandbox = { window: {}, URLSearchParams, Math, Number, String, Object };
vm.runInNewContext(block, sandbox);
const R = sandbox.window.NeonOnlineRules;

test('sample interpolates between snapshots and wraps yaw', () => {
  const buf = [];
  R.pushSnap(buf, { t: 0, x: 0, z: 0, y: 3.1, v: 10, m: 1, k: 0, s: 0 });
  R.pushSnap(buf, { t: 100, x: 10, z: -10, y: -3.1, v: 20, m: 1, k: 0, s: 1 });
  const p = R.sample(buf, 50);
  assert.equal(p.x, 5); assert.equal(p.z, -5); assert.equal(p.v, 15);
  assert.ok(Math.abs(Math.abs(p.y) - Math.PI) < 0.01, 'yaw goes the short way round');
});

test('sample extrapolates briefly, then holds', () => {
  const buf = [];
  R.pushSnap(buf, { t: 0, x: 0, z: 0, y: 0, v: 0, m: 1, k: 0 });
  R.pushSnap(buf, { t: 100, x: 1, z: 0, y: 0, v: 0, m: 1, k: 0 });
  assert.ok(Math.abs(R.sample(buf, 150).x - 1.5) < 1e-9);
  assert.ok(Math.abs(R.sample(buf, 5000).x - 2.5) < 1e-9, 'capped at 150 ms');
});

test('sample snaps on teleports instead of sliding across the map', () => {
  const buf = [];
  R.pushSnap(buf, { t: 0, x: 0, z: 0, y: 0, v: 0, m: 1, k: 0 });
  R.pushSnap(buf, { t: 100, x: 200, z: 0, y: 0, v: 0, m: 1, k: 0 });
  assert.equal(R.sample(buf, 50).x, 0);
  assert.equal(R.sample(buf, 100).x, 200);
});

test('buffer stays bounded and ordered', () => {
  const buf = [];
  for (let i = 0; i < 50; i++) R.pushSnap(buf, { t: 5, x: i, z: 0, y: 0, v: 0, m: 0, k: 0 });
  assert.equal(buf.length, 12);
  for (let i = 1; i < buf.length; i++) assert.ok(buf[i].t > buf[i - 1].t);
});

test('tag: touching the it player passes it, with immunity', () => {
  const st = R.tagNew(['a', 'b', 'c'], 0, () => 0);
  assert.equal(st.it, 'a');
  assert.equal(R.tagTouch(st, 'a', 'b', 1000, 3), false, 'immune right after start');
  assert.equal(R.tagTouch(st, 'b', 'c', 4000, 3), false, 'neither is it');
  assert.equal(R.tagTouch(st, 'b', 'a', 4000, 30), false, 'too far apart in the host view');
  assert.equal(R.tagTouch(st, 'b', 'a', 4000, 3), true);
  assert.equal(st.it, 'b');
  assert.equal(st.scores.a, 4000, 'a scored the time it held it');
  assert.equal(R.tagTouch(st, 'c', 'b', 5000, 3), false, 'new it is immune for 3 s');
  assert.equal(R.tagTouch(st, 'c', 'b', 7100, 3), true);
  assert.equal(st.it, 'c');
});

test('tag: scoring stops at the end, leaving it picks someone else', () => {
  const st = R.tagNew(['a', 'b'], 0, () => 0);
  R.tagTick(st, R.TAG_MS + 9999);
  assert.equal(st.scores.a, R.TAG_MS);
  assert.equal(R.tagTouch(st, 'a', 'b', R.TAG_MS + 1, 1), false, 'no passing after the end');
  const st2 = R.tagNew(['a', 'b'], 0, () => 0);
  assert.equal(R.tagLeave(st2, 'a', ['a', 'b'], 500, () => 0), true);
  assert.equal(st2.it, 'b');
  assert.deepEqual(R.standings({ a: 5, b: 9, c: 9 }).map(s => s.id), ['b', 'c', 'a']);
});

test('touching uses car and foot sizes', () => {
  assert.equal(R.touching({ x: 0, z: 0, m: 1 }, { x: 5.5, z: 0, m: 1 }), true);
  assert.equal(R.touching({ x: 0, z: 0, m: 1 }, { x: 6, z: 0, m: 1 }), false);
  assert.equal(R.touching({ x: 0, z: 0, m: 0 }, { x: 2, z: 0, m: 0 }), true);
  assert.equal(R.touching({ x: 0, z: 0, m: 0 }, { x: 2.5, z: 0, m: 0 }), false);
});

test('race: gates in order, finish order by time, ends after grace or limit', () => {
  const route = R.ROUTES[0].points;
  let i = 0;
  i = R.raceStep(route, i, route[1][0], route[1][1]); assert.equal(i, 0, 'must take the first gate first');
  for (const p of route) i = R.raceStep(route, i, p[0] + 5, p[1] - 5);
  assert.equal(i, route.length);
  const res = [];
  R.raceFinish(res, 'b', 70000); R.raceFinish(res, 'a', 65000); R.raceFinish(res, 'a', 60000);
  assert.deepEqual(res.map(r => r.id), ['a', 'b']);
  assert.equal(R.raceOver(res, ['a', 'b'], 0, 0, 0), true, 'everyone finished');
  assert.equal(R.raceOver([{ id: 'a', ms: 1 }], ['a', 'b'], 10000, 0, 9000), false);
  assert.equal(R.raceOver([{ id: 'a', ms: 1 }], ['a', 'b'], 9000 + R.RACE_GRACE_MS, 0, 9000), true);
  assert.equal(R.raceOver([], ['a', 'b'], R.RACE_LIMIT_MS, 0, null), true);
});

test('every route and grid slot sits on a road', () => {
  for (const r of R.ROUTES) for (const [x, z] of r.points) assert.ok(R.onRoad(x, z), r.name + ' ' + x + ',' + z);
  for (let i = 0; i < 8; i++) { const g = R.gridSlot(i); assert.ok(R.onRoad(g.x, g.z)); }
  for (const r of R.ROUTES) for (let i = 1; i < r.points.length; i++) {
    const [a, b] = [r.points[i - 1], r.points[i]];
    assert.ok(a[0] === b[0] || a[1] === b[1], 'gates follow one street at a time');
    assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1]) <= 48);
  }
});

test('invite codes come from ?city=', () => {
  assert.equal(R.inviteCode('?city=ab2k'), 'AB2K');
  assert.equal(R.inviteCode('?city=AB'), '');
  assert.equal(R.inviteCode('?race=ABCD'), '');
});
