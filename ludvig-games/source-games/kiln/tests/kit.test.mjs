// Tests for the shared FpsKit helpers embedded in this game's index.html (<script id="fps-kit">).
// Run: node --max-old-space-size=768 --test source-games/<slug>/tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const html = process.env.KIT_SOURCE ? readFileSync(process.env.KIT_SOURCE, 'utf8')
  : readFileSync(fileURLToPath(new URL('../index.html', import.meta.url)), 'utf8');
const match = /<script id="fps-kit">([\s\S]*?)<\/script>/.exec(html);
const source = match ? match[1] : html; // KIT_SOURCE may point at the bare kit.js
const sandbox = { window: {}, URL, URLSearchParams, Math, console };
vm.runInNewContext(source, sandbox, { filename: 'fps-kit.js' });
const K = sandbox.window.FpsKit;

test('kit loads', () => { assert.ok(K && typeof K.Interp === 'function'); });

test('Interp interpolates between snapshots and wraps angles', () => {
  const it = new K.Interp([1], 100, 150);
  it.push(1000, [0, 3.1]);
  it.push(1100, [10, -3.1]);
  const mid = it.sample(1150); // t = 1050, halfway
  assert.ok(Math.abs(mid[0] - 5) < 1e-9);
  assert.ok(Math.abs(Math.abs(mid[1]) - Math.PI) < 0.01, 'yaw takes the short way round');
});

test('Interp extrapolates briefly, then holds', () => {
  const it = new K.Interp([], 100, 150);
  it.push(0, [0]); it.push(100, [10]);
  const a = it.sample(300); // t=200: 100 ms past last -> k=2 capped at 1.6
  assert.ok(a[0] > 10 && a[0] <= 16.0001);
  const b = it.sample(5000);
  assert.ok(b[0] <= 16.0001);
  it.reset(); assert.equal(it.sample(10), null);
});

test('Gate keeps a client at or under the message budget', () => {
  const g = new K.Gate(10, 2);
  let sent = 0;
  for (let t = 0; t <= 10000; t += 5) if (g.take(t)) sent++;
  assert.ok(sent <= 10 * 10 + 2, `sent ${sent}`);
  assert.ok(sent >= 95);
});

test('HitGuard caps damage, rate and range', () => {
  const h = new K.HitGuard({ maxDamage: 50, maxPerSec: 3, maxRange: 100 });
  assert.equal(h.accept('a', 500, 0, 10), 50);
  assert.equal(h.accept('a', 10, 1, 10), 10);
  assert.equal(h.accept('a', 10, 2, 10), 10);
  assert.equal(h.accept('a', 10, 3, 10), 0, 'fourth hit inside one second is dropped');
  assert.equal(h.accept('a', 10, 1200, 10), 10, 'window resets');
  assert.equal(h.accept('b', 10, 0, 300), 0, 'out of range');
  assert.equal(h.accept('b', NaN, 0, 1), 0);
  assert.equal(h.accept('b', -5, 0, 1), 0);
});

test('Board counts kills once and sorts', () => {
  const b = new K.Board();
  assert.ok(b.kill('a', 'b', 'b:1'));
  assert.ok(!b.kill('a', 'b', 'b:1'), 'duplicate ignored');
  b.kill('c', 'a', 'a:1'); b.kill('a', 'c', 'c:1'); b.kill(null, 'b', 'b:2');
  const rows = b.sorted();
  assert.equal(rows[0].id, 'a'); assert.equal(rows[0].k, 2);
  assert.equal(b.row('b').d, 2);
  const copy = new K.Board(); copy.load(b.dump());
  assert.deepEqual(copy.sorted().map(r => r.id), rows.map(r => r.id));
  assert.equal(b.sorted(['z'])[0].k, 0, 'unknown ids get empty rows');
});

test('pickSpawn chooses far from threats', () => {
  const pts = [{ x: 0, z: 0 }, { x: 20, z: 0 }, { x: -20, z: 0 }];
  const p = K.pickSpawn(pts, [{ x: 19, z: 0 }], () => 0);
  assert.equal(p.x, -20);
});

test('invite helpers read and write codes', () => {
  assert.equal(K.inviteCode('?arena=ab3k', 'arena'), 'AB3K');
  assert.equal(K.inviteCode('?arena=<x>', 'arena'), null);
  assert.equal(K.inviteCode('', 'arena'), null);
  assert.equal(K.inviteUrl('https://games.example/kiln/?x=1#h', 'arena', 'AB3K'), 'https://games.example/kiln/?arena=AB3K');
  assert.equal(K.cleanName('  <b>Bo\u0001b  '), 'bBob');
  assert.equal(K.cleanName('', 'Rookie'), 'Rookie');
});

test('pickTarget prefers visible and sticks to the current target', () => {
  const me = { x: 0, z: 0 };
  const c = [{ id: 'a', x: 10, z: 0, visible: true }, { id: 'b', x: 8, z: 0, visible: true }, { id: 'd', x: 2, z: 0, visible: true, down: true }];
  assert.equal(K.pickTarget(me, c, null), 'b');
  assert.equal(K.pickTarget(me, c, 'a'), 'a', 'sticky');
  assert.equal(K.pickTarget(me, [{ id: 'a', x: 40, z: 0, visible: true }, { id: 'b', x: 6, z: 0, visible: true }], 'a'), 'b');
  assert.equal(K.pickTarget(me, [{ id: 'd', x: 1, z: 1, down: true }], null), null);
});

test('Grid BFS routes around a wall', () => {
  const g = new K.Grid(7, 1, 0);
  for (let z = 0; z < 6; z++) g.blocked[z * 7 + 3] = 1; // wall at x=3 with a gap at z=6
  const d = g.bfs([g.idx(6, 0)]);
  assert.equal(d[g.idx(0, 0)], 6 + 6 + 6, 'path goes down to the gap and back');
  let x = 0, z = 0;
  for (let i = 0; i < 60 && d[g.idx(x, z)] !== 0; i++) { const s = g.step(d, x, z); assert.ok(s); x += s[0] * 0.5; z += s[1] * 0.5; assert.ok(!g.blocked[g.idx(x, z)]); }
  assert.equal(d[g.idx(x, z)], 0);
});

test('Grid edges mask blocks thin walls', () => {
  const g = new K.Grid(3, 1, 0);
  g.edges = new Uint8Array(9).fill(15);
  g.edges[g.idx(0, 0)] &= ~(1 << 3); g.edges[g.idx(1, 0)] &= ~(1 << 2);
  const d = g.bfs([g.idx(1, 0)]);
  assert.equal(d[g.idx(0, 0)], 3);
});

test('coverPoints and chooseCover pick a hidden spot behind the obstacle', () => {
  const g = new K.Grid(11, 1, 0);
  g.blocked[g.idx(5, 5)] = 1;
  const pts = coverPts(g);
  function coverPts(grid) { return K.coverPoints(grid); }
  assert.equal(pts.length, 4);
  const threat = { x: 5, z: 0 };
  // Hidden when the obstacle cell lies between threat and point on the same column.
  const hidden = p => !(p.x !== 5 || p.z < 5) && p.z > 5;
  const p = K.chooseCover(pts, { x: 7, z: 8 }, threat, { hidden, minThreat: 1 });
  assert.ok(p && p.x === 5 && p.z === 6);
  const none = K.chooseCover(pts, { x: 7, z: 8 }, threat, { hidden: () => false });
  assert.equal(none, null);
  const taken = new Set([p.i]);
  assert.equal(K.chooseCover(pts, { x: 7, z: 8 }, threat, { hidden, taken, minThreat: 1 }), null);
});

test('flankGoal sits beside the threat', () => {
  const f = K.flankGoal({ x: 0, z: 0 }, { x: 10, z: 0 }, 1, 9);
  assert.ok(Math.abs(f.x) < 1e-9 && Math.abs(f.z - 9) < 1e-9);
});

test('Tokens limit simultaneous attackers', () => {
  const t = new K.Tokens(2);
  assert.ok(t.request('a', 0, 500)); assert.ok(t.request('b', 0, 500));
  assert.ok(!t.request('c', 100, 500));
  assert.ok(t.request('a', 100, 500), 'holder may renew');
  assert.ok(t.request('c', 700, 500), 'expired tokens free up');
  t.release('c'); assert.equal(t.has('c'), false);
});

test('assignSquad fills squads with distinct roles', () => {
  const list = [];
  for (let i = 0; i < 7; i++) { const e = { id: i }; list.push(e); K.assignSquad(list, e, 3); }
  const bySquad = new Map();
  for (const e of list) { if (!bySquad.has(e.squad)) bySquad.set(e.squad, []); bySquad.get(e.squad).push(e.role); }
  assert.equal(bySquad.size, 3);
  for (const roles of bySquad.values()) assert.equal(new Set(roles).size, roles.length);
  assert.deepEqual(bySquad.get(0), ['assault', 'flank', 'suppress']);
});
