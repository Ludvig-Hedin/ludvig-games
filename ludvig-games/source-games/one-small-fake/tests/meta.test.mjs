// Node test for the One Small Fake meta layer logic. Run: node --max-old-space-size=768 --experimental-vm-modules tests/meta.test.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const html = fs.readFileSync(fileURLToPath(new URL('../index.html', import.meta.url)), 'utf8');
const a = html.indexOf('/* meta layer: logic start'), b = html.indexOf('/* meta layer: logic end */');
assert.ok(a > 0 && b > a, 'meta logic markers found');
const block = html.slice(a, b);

function fakeStorage(init = {}, { throwGet = false, throwSet = false } = {}) {
  const data = { ...init }, writes = [];
  return { data, writes,
    getItem(k) { if (throwGet) throw new Error('blocked'); return k in data ? data[k] : null; },
    setItem(k, v) { if (throwSet) throw new Error('quota'); writes.push(k); data[k] = String(v); } };
}
const load = ls => new Function('localStorage', block + '\nreturn OSFMeta;')(ls);
let passed = 0; const t = (name, fn) => { fn(); passed++; console.log('ok', name); };

t('fresh state: 3 distinct missions, nothing unlocked', () => {
  const M = load(fakeStorage());
  const v = M.view();
  assert.equal(v.missions.length, 3);
  assert.equal(new Set(v.missions.map(m => m.id)).size, 3);
  assert.ok(v.unlocks.every(u => !u.ok));
  assert.ok(M.MISSIONS.length >= 12 && M.MISSIONS.length <= 20);
  assert.ok(M.UNLOCKS.length >= 6 && M.UNLOCKS.length <= 12);
  assert.ok(M.BADGES.length >= 6 && M.BADGES.length <= 10);
  assert.equal(M.sceneUnlocked(4), true); assert.equal(M.sceneUnlocked(5), false);
});

t('corrupt or blocked storage never throws', () => {
  for (const raw of ['{bad', 'null', '42', '"x"', '[]', JSON.stringify({ stats: { landings: 'lots', campaignDone: 'yes' }, mis: { active: [{ id: 'nope' }, null], next: 999 }, scene: { 5: -3 }, equip: { skin: 'evil' }, daily: { date: 'today', best: NaN } })]) {
    const M = load(fakeStorage({ 'osf-meta': raw }));
    const v = M.view();
    assert.equal(v.missions.length, 3);
    assert.equal(M.state().stats.landings, 0);
    assert.equal(M.state().stats.campaignDone, false);
    assert.equal(M.equipped().skin, '');
  }
  const M1 = load(fakeStorage({}, { throwGet: true, throwSet: true }));
  assert.doesNotThrow(() => M1.onTake({ run: 'campaign', success: true, vy: 1, fuel: 50, precision: .5, score: 900 }));
  assert.doesNotThrow(() => M1.markSeen());
});

t('migration seeds from osf-best once and never writes osf-best', () => {
  const ls = fakeStorage({ 'osf-best': '7500' });
  const M = load(ls);
  const s = M.state().stats;
  assert.equal(s.bestCampaign, 7500); assert.equal(s.campaignDone, true); assert.ok(s.landings >= 4);
  assert.equal(M.sceneUnlocked(5), true);
  assert.ok(M.hasNew(), 'migrated unlocks show as new');
  M.markSeen(); assert.equal(M.hasNew(), false);
  M.onTake({ run: 'daily', date: '2026-10-23', success: true, vy: 1, fuel: 60, precision: .9, score: 1700 });
  M.onTake({ run: 'reshoot', success: true, vy: 1, fuel: 60, precision: .9, score: 1200, reshoot: { landed: 1, total: 1200 } });
  assert.ok(!ls.writes.includes('osf-best'));
  assert.equal(ls.data['osf-best'], '7500');
  ls.data['osf-best'] = '9000';
  const M2 = load(ls); // already migrated: keeps stored stats, does not re-migrate
  assert.equal(M2.state().stats.bestCampaign, 7500);
});

t('daily seed: FNV-1a + mulberry32, same scene for same date', () => {
  const M = load(fakeStorage());
  assert.equal(M.fnv1a('a'), 0xe40c292c);
  const r1 = M.rng(123), r2 = M.rng(123);
  for (let i = 0; i < 5; i++) assert.equal(r1(), r2());
  const s1 = JSON.stringify(M.dailyScene('2026-10-23')), s2 = JSON.stringify(load(fakeStorage()).dailyScene('2026-10-23'));
  assert.equal(s1, s2);
  const days = new Set(); for (let d = 1; d <= 28; d++) days.add(JSON.stringify(M.dailyScene('2026-11-' + String(d).padStart(2, '0'))));
  assert.ok(days.size > 20, 'days differ');
  assert.match(M.today(new Date('2026-10-23T23:59:00Z')), /^2026-10-23$/);
});

t('generated takes stay fair and inside the set', () => {
  const M = load(fakeStorage());
  const twists = new Set();
  for (let seed = 1; seed < 400; seed++) {
    const rng = M.rng(seed);
    for (let d = 0; d < 30; d++) {
      const sc = M.genScene(rng, d); twists.add(sc.twist);
      for (const f of sc.flats) { assert.ok(f.x - f.w / 2 >= 329 && f.x + f.w / 2 <= 1226, 'flat inside set ' + JSON.stringify(sc)); }
      assert.ok(sc.startX >= 320 && sc.startX <= 1360 && sc.startY >= 320 && sc.startY <= 420);
      assert.ok(sc.padW >= 110 && sc.fuel >= 50 && sc.fuel <= 100 && Math.abs(sc.wind) <= 28);
      if (sc.ceil) assert.ok(sc.startY - 56 > sc.ceil + 20 && !sc.boom);
      if (sc.boom) assert.ok(sc.startX <= 640 && sc.startY <= 340);
      if (sc.dolly) assert.ok(sc.dolly.amp * sc.dolly.speed <= 50);
      if (sc.pads) { assert.equal(sc.pads.length, 2); assert.ok(Math.abs(sc.pads[0].x - sc.pads[1].x) > sc.pads[0].w + 60); }
      if (d < 3) assert.equal(sc.twist, 'none');
      assert.ok(sc.name && sc.desc && sc.brief && sc.win);
    }
  }
  for (const k of ['none', 'dolly', 'gust', 'ceil', 'dark', 'pads', 'fuel']) assert.ok(twists.has(k), 'twist seen ' + k);
  const early = M.genScene(M.rng(5), 0), late = M.genScene(M.rng(5), 14);
  assert.ok(late.padW < early.padW, 'difficulty rises');
});

t('mission rotation: replace on completion, no immediate repeat', () => {
  const M = load(fakeStorage());
  const first = M.view().missions.map(m => m.id);
  assert.deepEqual(first, ['land3', 'soft', 'fuel40']);
  // a soft, fuel-rich landing completes soft + fuel40 and progresses land3
  const r = M.onTake({ run: 'campaign', success: true, vy: 1.2, fuel: 55, precision: .5, score: 1000, belief: 80, time: 30 });
  assert.equal(r.done.length, 2); assert.equal(r.news, 'MISSION DONE');
  const now = M.view().missions;
  assert.equal(now.length, 3); assert.equal(new Set(now.map(m => m.id)).size, 3);
  assert.ok(!now.some(m => m.id === 'soft' || m.id === 'fuel40'));
  assert.equal(now.find(m => m.id === 'land3').p, 1);
  assert.equal(M.state().stats.missionsDone, 2);
  // run many takes: always 3 distinct, completed one never returns at once
  for (let i = 0; i < 200; i++) {
    const before = M.view().missions.map(m => m.id);
    const out = M.onTake({ run: i % 3 ? 'campaign' : 'daily', date: '2026-10-23', success: true, vy: .4, fuel: 50, precision: .99, score: 1600, belief: 96, time: 15, wind: true, boom: true, first: true, wire: i % 2 === 0, reshoot: null });
    const after = M.view().missions.map(m => m.id);
    assert.equal(after.length, 3); assert.equal(new Set(after).size, 3);
    for (const id of out.done) assert.ok(!after.includes(id), 'no immediate repeat ' + id);
    assert.ok(before.length === 3);
  }
  // reshoot "max" missions use best-in-run values
  const M3 = load(fakeStorage({ 'osf-meta': JSON.stringify({ mig: true, mis: { active: [{ id: 'rs3', p: 0 }, { id: 'rs4k', p: 0 }, { id: 'land6', p: 0 }], next: 0 } }) }));
  M3.onTake({ run: 'reshoot', success: true, vy: 2, fuel: 30, precision: .3, score: 900, reshoot: { landed: 2, total: 2000 } });
  assert.equal(M3.view().missions.find(m => m.id === 'rs3').p, 2);
  M3.onTake({ run: 'reshoot', success: false, vy: 6, fuel: 30, precision: .3, score: 0, reshoot: { landed: 2, total: 2000 } });
  assert.equal(M3.view().missions.find(m => m.id === 'rs3').p, 2);
  M3.onTake({ run: 'reshoot', success: true, vy: 2, fuel: 30, precision: .3, score: 900, reshoot: { landed: 3, total: 4100 } });
  assert.ok(!M3.view().missions.some(m => m.id === 'rs3' || m.id === 'rs4k'));
  assert.equal(M3.state().stats.reshootBest, 4100);
});

t('unlock rules, equip toggle and persistence', () => {
  const ls = fakeStorage();
  const M = load(ls);
  assert.equal(M.equip('silver'), false, 'locked cannot equip');
  for (let i = 0; i < 9; i++) M.onTake({ run: 'campaign', success: true, vy: 3, fuel: 10, precision: .2, score: 800 });
  assert.equal(M.view().unlocks.find(u => u.id === 'silver').ok, false);
  const r = M.onTake({ run: 'campaign', success: true, vy: 3, fuel: 10, precision: .2, score: 800 });
  assert.equal(r.news, 'UNLOCKED: SILVER FOIL');
  assert.equal(M.equip('silver'), true); assert.equal(M.equipped().skin, 'silver');
  assert.equal(M.equip('silver'), true); assert.equal(M.equipped().skin, '', 'tap again unequips');
  M.equip('silver');
  // campaign finish unlocks scene 06 and the badge; Reel 2 chain
  M.onTake({ run: 'campaign', success: true, vy: 1, fuel: 30, precision: .5, score: 1500, total: 8600, finished: true, noWire: true });
  assert.equal(M.sceneUnlocked(5), true); assert.equal(M.sceneUnlocked(6), false);
  const vb = M.view().badges; for (const id of ['wrap', 'nostrings', 'oscar']) assert.ok(vb.find(x => x.id === id).ok, id);
  M.onTake({ run: 'reel', level: 5, success: true, vy: 1, fuel: 30, precision: .5, score: 1400 });
  assert.equal(M.sceneUnlocked(6), true); assert.equal(M.view().unlocks.find(u => u.id === 's6').best, 1400);
  // daily: tries and best of the day, days counted once per date
  M.onTake({ run: 'daily', date: '2026-10-23', success: false, score: 0 });
  M.onTake({ run: 'daily', date: '2026-10-23', success: true, vy: 1, fuel: 40, precision: .6, score: 1200 });
  M.onTake({ run: 'daily', date: '2026-10-23', success: true, vy: 1, fuel: 40, precision: .6, score: 900 });
  assert.deepEqual(M.dailyInfo('2026-10-23'), { date: '2026-10-23', best: 1200, tries: 3 });
  assert.equal(M.dailyInfo('2026-10-24').tries, 0);
  assert.equal(M.state().stats.dailyDays, 1);
  M.onTake({ run: 'daily', date: '2026-10-24', success: true, vy: 1, fuel: 40, precision: .6, score: 700 });
  M.onTake({ run: 'daily', date: '2026-10-25', success: true, vy: 1, fuel: 40, precision: .6, score: 700 });
  assert.ok(M.view().unlocks.find(u => u.id === 'rings').ok);
  // reload from storage keeps everything
  const M2 = load(ls);
  assert.equal(M2.equipped().skin, 'silver');
  assert.equal(M2.state().stats.landings, M.state().stats.landings);
  assert.equal(M2.sceneUnlocked(6), true);
  assert.deepEqual(M2.view().missions, M.view().missions);
  assert.ok(!ls.writes.includes('osf-best'));
});

console.log(passed + ' tests passed');
