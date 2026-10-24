// Run: node --max-old-space-size=768 --test source-games/deadblock/tests/logic.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../logic.js', import.meta.url), 'utf8');
const context = { self: {}, URLSearchParams };
vm.runInNewContext(source, context, { filename: 'logic.js' });
const L = context.self.HordeLogic;

test('seeded rng is deterministic and in range', () => {
  const a = L.rng(42), b = L.rng(42);
  for (let i = 0; i < 200; i++) { const x = a(); assert.equal(x, b()); assert.ok(x >= 0 && x < 1); }
  assert.notEqual(L.rng(1)(), L.rng(2)());
});

test('daily config is stable per day and varies across days', () => {
  const d1 = L.dailyConfig('2026-10-23'), again = L.dailyConfig('2026-10-23');
  assert.deepEqual({ ...d1 }, { ...again });
  assert.ok(d1.map >= 0 && d1.map <= 2);
  assert.ok(L.DAILY_MODS.some(m => m.id === d1.mod));
  const seeds = new Set(Array.from({ length: 20 }, (_, i) => L.dailyConfig(`2026-11-${String(i + 1).padStart(2, '0')}`).seed));
  assert.ok(seeds.size > 15);
  assert.equal(L.dateKey(new Date(2026, 0, 5)), '2026-01-05');
});

test('boss waves every 5 and bosses rotate', () => {
  assert.equal(L.isBossWave(5), true); assert.equal(L.isBossWave(6), false); assert.equal(L.isBossWave(0), false);
  assert.deepEqual([5, 10, 15, 20].map(L.bossFor), ['butcher', 'matriarch', 'howler', 'butcher']);
  assert.ok(L.waveSize(5, 1, 1, 1) < L.waveSize(4, 1, 1, 1) * 1.1);
  assert.ok(L.waveSize(3, 1, 4, 1) > L.waveSize(3, 1, 1, 1) * 2);
});

test('pickKind respects wave gates', () => {
  for (let r = 0; r < 1; r += 0.01) assert.equal(L.pickKind(1, r, 1, ''), 'walker');
  const kinds = new Set(); for (let r = 0; r < 1; r += 0.005) kinds.add(L.pickKind(9, r, 1, ''));
  for (const k of ['brute', 'screamer', 'spitter', 'crawler', 'runner', 'walker']) assert.ok(kinds.has(k), k);
  assert.equal(L.pickKind(1, 0.2, 1, 'swarm'), 'runner');
});

test('targets prefer near and weak players and ignore downed ones', () => {
  const players = [{ id: 'a', x: 5, z: 0, hpFrac: 1, alive: true }, { id: 'b', x: 5.5, z: 0, hpFrac: 0.1, alive: true }, { id: 'c', x: 1, z: 0, hpFrac: 1, alive: false }];
  assert.equal(L.chooseTarget(0, 0, players, null), 'b');
  assert.equal(L.chooseTarget(0, 0, [{ id: 'a', x: 1, z: 0, hpFrac: 1, alive: false }], null), null);
  // Hysteresis keeps the current target when the difference is small.
  const close = [{ id: 'a', x: 5, z: 0, hpFrac: 1, alive: true }, { id: 'b', x: 4.6, z: 0, hpFrac: 1, alive: true }];
  assert.equal(L.chooseTarget(0, 0, close, 'a'), 'a');
});

test('approach points fan zombies out toward their slots', () => {
  const p = L.approachPoint(10, 0, 0, 0, Math.PI / 2);
  assert.ok(p.z > 1, 'swings toward the slot');
  assert.ok(Math.hypot(p.x, p.z) <= 6.5 + 1e-9);
  assert.deepEqual({ ...L.approachPoint(1, 1, 0, 0, 0) }, { x: 0, z: 0 });
  const o = L.orbitPoint(4, 0, 0, 0, 4, 1);
  assert.ok(Math.abs(Math.hypot(o.x, o.z) - 4) < 1e-9 && o.z > 0);
  assert.equal(L.lookingAway(0, 0, 0, 0, 5), false);
  assert.equal(L.lookingAway(Math.PI, 0, 0, 0, 5), true);
});

test('spatial grid finds neighbours', () => {
  const g = L.createGrid(1.5, -22, -17, 22, 17, 64);
  const items = [{ x: 0, z: 0 }, { x: 0.5, z: 0.2 }, { x: 10, z: 10 }, { x: -21, z: -16 }];
  L.gridBuild(g, items);
  const found = []; L.gridQuery(g, 0, 0, 1, i => found.push(i));
  assert.deepEqual(found.sort(), [0, 1]);
  const corner = []; L.gridQuery(g, -40, -40, 1, i => corner.push(i));
  assert.deepEqual([...corner], [3]);
});

test('director peaks, relaxes and adapts rating', () => {
  const d = L.createDirector();
  for (let i = 0; i < 60; i++) L.directorUpdate(d, 1 / 60, { damage: 2, near: 6, hpFrac: 0.4 });
  assert.equal(d.phase, 'peak');
  for (let i = 0; i < 200; i++) L.directorUpdate(d, 1 / 60, { damage: 0, near: 0, hpFrac: 0.4 });
  assert.equal(d.phase, 'relax');
  assert.ok(L.directorParams(d).rate < 0.5 && L.directorParams(d).health > 1);
  for (let i = 0; i < 60 * 30; i++) L.directorUpdate(d, 1 / 60, { damage: 0, near: 0, hpFrac: 1 });
  assert.notEqual(d.phase, 'relax');
  const up = L.createDirector(); L.directorWaveEnd(up, { seconds: 15, expected: 30, hpFrac: 1 });
  const down = L.createDirector(); L.directorWaveEnd(down, { seconds: 80, expected: 30, hpFrac: 0.1 });
  assert.ok(up.rating > 1 && down.rating < 1);
  for (let i = 0; i < 50; i++) L.directorWaveEnd(up, { seconds: 1, expected: 30, hpFrac: 1 });
  assert.equal(up.rating, 1.35);
});

test('quality governor drops under 50 fps and recovers slowly', () => {
  const g = L.createGovernor(3, 3);
  let changed = -1;
  for (let i = 0; i < 400 && changed === -1; i++) changed = L.governorFrame(g, 1 / 35);
  assert.equal(changed, 2);
  let ups = 0; for (let i = 0; i < 60 * 20; i++) if (L.governorFrame(g, 1 / 60) !== -1) ups++;
  assert.equal(ups, 0, 'no climb within 25 s of a drop');
  for (let i = 0; i < 60 * 20; i++) L.governorFrame(g, 1 / 60);
  assert.equal(g.tier, 3);
  assert.equal(L.governorFrame(g, 5), -1, 'ignores hidden-tab gaps');
});

test('profile migration is safe and unlocks fire once', () => {
  assert.deepEqual([...L.migrateProfile('not json').unlocked], ['ranger']);
  const p = L.migrateProfile({ unlocked: ['scout', 'bogus'], character: 'bogus', kills: -4, daily: { date: 3 } });
  assert.deepEqual([...p.unlocked], ['ranger', 'scout']);
  assert.equal(p.character, 'ranger'); assert.equal(p.kills, 0); assert.equal(p.daily.date, '');
  const fresh = L.recordRun(p, { kills: 40, wave: 11, bossKills: 1, score: 900 });
  assert.deepEqual([...fresh], ['gunner']); // Scout was already unlocked.
  assert.deepEqual([...L.recordRun(p, { wave: 2 })], []);
  const daily = L.recordRun(p, { wave: 6, daily: '2026-10-23', score: 500 });
  assert.deepEqual([...daily], ['ghost']);
  assert.equal(p.daily.best, 500); assert.equal(p.runs, 3);
});

test('upgrade picks skip maxed entries and never repeat', () => {
  const pool = [{ id: 'a', max: 1 }, { id: 'b' }, { id: 'c' }, { id: 'd', weight: 3 }];
  const r = L.rng(7);
  for (let i = 0; i < 50; i++) {
    const pick = L.pickUpgrades(pool, { a: 1 }, r, 3).map(u => u.id);
    assert.equal(new Set(pick).size, 3); assert.ok(!pick.includes('a'));
  }
  assert.equal(L.pickUpgrades(pool, {}, r, 9).length, 4);
});

test('zombie snapshots round-trip within quantisation', () => {
  const list = [{ id: 7, x: 3.14, z: -12.34, angle: 4, hp: 30, maxHp: 60, kind: 'spitter', flags: 10 }, { id: 8, x: 0, z: 0, angle: -1, hp: 1, maxHp: 2000, kind: 'howler', flags: 0 }];
  const packed = L.packZombies(list);
  assert.equal(packed.length, 2 * L.ZSTRIDE);
  assert.ok(packed.every(Number.isInteger));
  const back = L.unpackZombies(JSON.parse(JSON.stringify(packed)));
  assert.equal(back[0].kind, 'spitter'); assert.equal(back[0].hp, 50); assert.equal(back[0].flags, 10);
  assert.ok(Math.abs(back[0].x - 3.1) < 0.051 && Math.abs(back[0].z + 12.3) < 0.051);
  assert.ok(Math.abs(L.wrapAngle(back[0].a - 4)) < 0.03);
  assert.equal(back[1].hp, 1, 'a living boss never shows 0%');
  assert.equal(L.unpackZombies([1, 2, 3, 4, 5, 99, 0]).length, 0);
  assert.equal(L.unpackZombies('junk').length, 0);
  // 80 zombies fit comfortably inside the 4 KB relay limit.
  const many = Array.from({ length: 80 }, (_, i) => ({ id: 1000 + i, x: -19.9, z: -14.9, angle: -3.1, hp: 99, maxHp: 100, kind: 'walker', flags: 63 }));
  assert.ok(JSON.stringify({ t: 's', z: L.packZombies(many) }).length < 3000);
});

test('invite codes and interpolation', () => {
  assert.equal(L.inviteCode('?horde=ab-c1'), 'ABC1');
  assert.equal(L.inviteCode('?x=1'), '');
  const b = L.createInterp();
  assert.equal(L.interpSample(b, 0), null);
  L.interpPush(b, 0, 0, 0, 3); L.interpPush(b, 100, 10, -10, -3);
  const mid = L.interpSample(b, 50);
  assert.ok(Math.abs(mid.x - 5) < 1e-9 && Math.abs(mid.z + 5) < 1e-9);
  assert.ok(Math.abs(Math.abs(mid.a) - Math.PI) < 0.2, 'angles take the short way round');
  assert.equal(L.interpSample(b, 500).x, 10);
  for (let i = 0; i < 10; i++) L.interpPush(b, 200 + i, i, i, 0);
  assert.equal(b.t.length, 4);
});
