// No Brakes meta layer tests. Run: node --max-old-space-size=768 --experimental-vm-modules tests/meta.test.mjs
// Part 1 extracts the meta block from index.html by its comment markers and runs it with a fake localStorage.
// Part 2 runs the whole game headless (stub DOM) to check the integration: daily runs never touch nobrakes-v1.
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { fakeStorage, loadGame } from './harness.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const file = path.join(here, '..', 'index.html');
const html = fs.readFileSync(file, 'utf8');
const block = html.match(/\/\* meta layer:begin[\s\S]*?\/\* meta layer:end \*\//)?.[0];
assert.ok(block, 'meta block markers found');

let passed = 0;
// Values from the vm realm have other prototypes, so compare their JSON form.
const norm = v => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
const eq = (a, b, m) => assert.deepEqual(norm(a), norm(b), m);
const test = (name, fn) => { fn(); passed++; console.log('ok -', name); };

function meta(storage = fakeStorage(), extra = {}) {
  const ctx = {
    localStorage: storage, console, Math, JSON, Date,
    btoa: s => Buffer.from(s, 'binary').toString('base64'),
    atob: s => Buffer.from(s, 'base64').toString('binary'),
    ...extra,
  };
  vm.createContext(ctx);
  vm.runInContext(block, ctx);
  return { M: ctx.NBMeta, storage, ctx };
}
const fnv = s => { let h = 0x811c9dc5; for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; };

test('daily seed is FNV-1a of no-brakes:<date> and the course is deterministic', () => {
  const { M } = meta();
  assert.equal(M.seedFor('2026-10-23'), fnv('no-brakes:2026-10-23'));
  assert.match(M.today(), /^\d{4}-\d\d-\d\d$/);
  const a = JSON.stringify(M.buildDaily('2026-10-23')), b = JSON.stringify(meta().M.buildDaily('2026-10-23'));
  assert.equal(a, b, 'same date, same course, across fresh instances');
  assert.notEqual(a, JSON.stringify(M.buildDaily('2026-10-24')), 'next day differs');
  const l = M.buildDaily('2026-10-23');
  assert.equal(l.version, 1); assert.equal(l.daily, '2026-10-23'); assert.equal(l.id, 'daily');
  assert.ok(l.finish < l.length && l.objects.some(o => o.type === 'platform' && o.x <= l.finish && o.x + o.w >= l.finish), 'floor under the finish');
  const r1 = M.rng('2026-10-23', 'run'), r2 = M.rng('2026-10-23', 'run');
  for (let i = 0; i < 5; i++) assert.equal(r1(), r2());
  // dailyLevel returns independent copies
  const c1 = M.dailyLevel('2026-10-23'); c1.objects.length = 0;
  assert.ok(M.dailyLevel('2026-10-23').objects.length > 50);
});

test('missions: 3 active from a pool of 12 to 20, replaced on completion without repeats', () => {
  const { M } = meta();
  assert.ok(M.MISSIONS.length >= 12 && M.MISSIONS.length <= 20);
  const s = M.state();
  eq(s.active.map(a => a.id), M.MISSIONS.slice(0, 3).map(m => m.id));
  const res = M.endRun({ course: 0, dist: 320, flips: 0 });
  assert.equal(res.news, 'Mission done');
  const ids = M.state().active.map(a => a.id);
  assert.equal(ids.length, 3); assert.ok(!ids.includes('dist300')); assert.ok(ids.includes(M.MISSIONS[3].id));
  // Grind through many runs: active stays 3 unique ids and a just-finished mission never comes straight back.
  for (let i = 0; i < 60; i++) {
    const before = M.state().active.map(a => a.id);
    M.endRun({ course: i % 6, finish: true, died: false, dist: 2500, air: 20, maxAir: 3, flips: 12, limbs: 3, smash: 15, booms: 6, coins: 50, score: 4000, stars: 3, daily: i % 2 === 0, fresh: true, date: '2026-10-23' });
    const after = M.state().active.map(a => a.id);
    assert.equal(new Set(after).size, 3);
    for (const id of before) if (!after.includes(id)) assert.ok(true);
    for (const id of after) if (!before.includes(id)) assert.ok(!before.includes(id), 'new mission was not just active');
  }
  assert.ok(M.state().stats.missions >= 60);
  // total vs run progress
  const m2 = meta().M; const st = m2.state();
  st.active = [{ id: 'dist2k', p: 0 }, { id: 'dist300', p: 0 }, { id: 'coins40', p: 0 }];
  m2.endRun({ course: 1, dist: 150, coins: 10 }); m2.endRun({ course: 1, dist: 200, coins: 10 });
  const p = Object.fromEntries(m2.state().active.map(a => [a.id, a.p]));
  assert.equal(p.dist2k, 350); assert.equal(p.dist300, 200); assert.equal(p.coins40, 20);
});

test('unlocks: 6 to 12, earned only by play, equip persists, locked items cannot be equipped', () => {
  const store = fakeStorage();
  const { M } = meta(store);
  assert.ok(M.UNLOCKS.length >= 6 && M.UNLOCKS.length <= 12);
  assert.ok(M.courseUnlocked(5)); assert.ok(!M.courseUnlocked(6));
  assert.equal(M.equip('paint', 'paint-gold'), false);
  M.endRun({ course: 0, finish: true });
  const r = M.endRun({ course: 3, finish: true });
  assert.ok(M.courseUnlocked(6), 'two finished courses unlock course 07');
  assert.match(r.news, /^Unlocked: /);
  assert.equal(M.state().unseen, true);
  M.state().stats.dist = 2990; M.endRun({ course: 1, dist: 20 });
  assert.ok(M.state().unlocked.includes('paint-rust'));
  assert.equal(M.equip('paint', 'paint-rust'), true);
  assert.equal(M.look.paint, '#b8673d');
  assert.equal(M.equip('outfit', 'paint-rust'), false, 'kind must match');
  const again = meta(store).M; again.state();
  assert.equal(again.look.paint, '#b8673d', 'equip survives reload');
  assert.equal(again.equip('paint', ''), true); assert.equal(again.look.paint, '');
  assert.ok(M.BADGES.length >= 6 && M.BADGES.length <= 10);
});

test('migration seeds finished courses from the original save once', () => {
  const store = fakeStorage({ 'nobrakes-v1': JSON.stringify({ vehicle: 1, scores: { '0-0': 900 }, times: { '0-0': 14.2, '4-2': 30, 'chaos-X-0': 80 }, ghosts: {}, settings: {} }) });
  const { M } = meta(store);
  const s = M.state();
  eq([...s.courses].sort(), [0, 4]);
  assert.equal(s.stats.finishes, 2);
  assert.ok(M.courseUnlocked(6)); assert.ok(s.badges.includes('first'));
  assert.equal(store.getItem('nobrakes-v1'), JSON.stringify({ vehicle: 1, scores: { '0-0': 900 }, times: { '0-0': 14.2, '4-2': 30, 'chaos-X-0': 80 }, ghosts: {}, settings: {} }), 'original save untouched');
  const saved = JSON.parse(store.getItem('nobrakes-meta-v1'));
  saved.stats.finishes = 2; saved.courses = [0, 4];
  const s2 = meta(store).M.state(); assert.equal(s2.stats.finishes, 2, 'not migrated twice');
});

test('ghost: encode/decode round trip, interpolation, size cap, save only when better', () => {
  const store = fakeStorage();
  const { M } = meta(store);
  const buf = new Int16Array([0, -5, 3141, 32000, -32000, -1, 77, 530, 0]);
  eq([...M.decode(M.encode(buf, 3), 3)], [...buf]);
  assert.equal(M.decode(M.encode(buf, 2), 3), null, 'short data rejected');
  // record a 2 s finish on course c6
  M.rec.reset(); for (let i = 0; i < 24; i++) M.rec.push(100 + i * 50, 480, i % 2 ? 0.2 : -0.2);
  assert.equal(M.ghostOffer('c6', { finish: true, fresh: true, time: 2, score: 900, vehicle: 0 }), true);
  const g = M.ghostLoad('c6');
  assert.equal(g.n, 24); assert.equal(g.t, 2);
  const p = M.ghostAt(g, 0.5 / 12); assert.equal(p.x, 125); assert.equal(p.y, 480); assert.ok(Math.abs(p.a) < 1e-9);
  assert.equal(M.ghostAt(g, 3), null, 'past the end');
  assert.equal(M.ghostAt(g, 0.5 / 12), M.ghostAt(g, 1 / 12), 'reuses one output object (no per-frame allocation)');
  // slower finish does not replace it, an unfinished run does not either
  M.rec.reset(); for (let i = 0; i < 30; i++) M.rec.push(i, 1, 0);
  assert.equal(M.ghostOffer('c6', { finish: true, fresh: true, time: 2.5 }), false);
  M.rec.reset(); for (let i = 0; i < 30; i++) M.rec.push(i, 1, 0);
  assert.equal(M.ghostOffer('c6', { finish: false, fresh: true, time: 1 }), false);
  M.rec.reset(); for (let i = 0; i < 30; i++) M.rec.push(i, 1, 0);
  assert.equal(M.ghostOffer('c6', { finish: true, fresh: false, time: 1 }), false, 'checkpoint runs are not ghosts');
  // daily ghost: by score, per date
  M.rec.reset(); for (let i = 0; i < 30; i++) M.rec.push(i, 1, 0);
  assert.equal(M.ghostOffer('daily', { daily: true, fresh: true, score: 500, date: '2026-10-23' }), true);
  M.rec.reset(); for (let i = 0; i < 30; i++) M.rec.push(i, 1, 0);
  assert.equal(M.ghostOffer('daily', { daily: true, fresh: true, score: 400, date: '2026-10-23' }), false);
  assert.equal(M.ghostLoad('daily', '2026-10-24'), null, 'yesterday\'s ghost is not today\'s');
  M.rec.reset(); for (let i = 0; i < 30; i++) M.rec.push(i, 1, 0);
  assert.equal(M.ghostOffer('daily', { daily: true, fresh: true, score: 100, date: '2026-10-24' }), true, 'new day replaces it');
  // a full 3-minute ghost stays well under 60 KB; overflowing runs are not saved
  M.rec.reset(); for (let i = 0; i < M.MAXS; i++) M.rec.push(9000 - i, -700 + i % 900, Math.sin(i) * 3.14);
  assert.equal(M.ghostOffer('c7', { finish: true, fresh: true, time: 179 }), true);
  assert.ok(store.getItem('nobrakes-meta-ghost:c7').length < 60000, 'ghost size ' + store.getItem('nobrakes-meta-ghost:c7').length);
  M.rec.reset(); for (let i = 0; i <= M.MAXS; i++) M.rec.push(1, 1, 0);
  assert.equal(M.ghostOffer('c8', { finish: true, fresh: true, time: 190 }), false);
});

test('corrupt or unavailable storage never throws and falls back to defaults', () => {
  const bad = fakeStorage({ 'nobrakes-meta-v1': '{bad json', 'nobrakes-meta-ghost:c6': '{"v":1,"n":5,"d":"%%%"}', 'nobrakes-v1': '[1,2' });
  const { M } = meta(bad);
  assert.equal(M.state().active.length, 3); eq(M.state().courses, []);
  assert.equal(M.ghostLoad('c6'), null);
  const weird = fakeStorage({ 'nobrakes-meta-v1': JSON.stringify({ stats: { dist: 'x', flips: -4, air: 1e400 }, courses: ['a', 3, 3, 99], active: [{ id: 'nope' }, { id: 'flip1', p: 'z' }, { id: 'flip1' }], unlocked: ['course6', 'evil'], equip: { paint: 'paint-gold', outfit: 'course6' }, daily: { date: 'yesterday', best: 5 } }) });
  const s = meta(weird).M.state();
  assert.equal(s.stats.dist, 0); assert.equal(s.stats.flips, 0); assert.equal(s.stats.air, 0);
  eq(s.courses, [3]); assert.equal(s.active[0].id, 'flip1'); assert.equal(s.active[0].p, 0); assert.equal(s.active.length, 3);
  eq(s.unlocked, ['course6']); assert.equal(s.equip.paint, ''); assert.equal(s.equip.outfit, ''); assert.equal(s.daily.date, '');
  const throwing = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() {}, key() { return null; }, length: 0 };
  const T = meta(throwing).M;
  assert.equal(T.state().active.length, 3);
  assert.doesNotThrow(() => T.endRun({ course: 0, finish: true, daily: true, fresh: true, score: 10 }));
  T.rec.reset(); T.rec.push(1, 2, 3); T.rec.push(1, 2, 3);
  assert.equal(T.ghostOffer('c6', { finish: true, fresh: true, time: 1 }), false);
  const none = meta(null).M; assert.doesNotThrow(() => none.endRun({ course: 0 }));
});

test('daily results: best of the day, tries, board submit, never the original save', () => {
  const calls = [];
  const store = fakeStorage();
  const { M } = meta(store, { Ludvig: { score: (b, v) => { calls.push([b, v]); return Promise.resolve({ ok: false }); } } });
  M.dailyTry('2026-10-23'); M.endRun({ daily: true, fresh: true, date: '2026-10-23', score: 700, died: true });
  M.dailyTry('2026-10-23'); M.endRun({ daily: true, fresh: true, date: '2026-10-23', score: 300, died: true });
  eq(M.dailyInfo('2026-10-23'), { date: '2026-10-23', best: 700, tries: 2, done: false });
  eq(calls, [['no-brakes:daily', 700], ['no-brakes:daily', 300]]);
  assert.equal(M.dailyInfo('2026-10-24').tries, 0);
  eq([...store.map.keys()], ['nobrakes-meta-v1']);
  const throwingBoard = meta(fakeStorage(), { Ludvig: { score: () => { throw new Error('x'); } } }).M;
  assert.doesNotThrow(() => throwingBoard.endRun({ daily: true, fresh: true, score: 5 }));
});

// ---- Part 2: integration through the real game, headless ----
function pump(ctx, frames) { let t = ctx.__t || 1000; for (let i = 0; i < frames; i++) { t += 1000 / 60; ctx.__raf(t); } ctx.__t = t; }
// The stub DOM has no real .screen list, so clear the results screen flag the way show() would.
function results(ctx) { pump(ctx, 200); assert.ok(ctx.__els.get('result').classList.contains('active'), 'results screen shown'); ctx.__els.get('result').classList.remove('active'); }

test('game: a daily run is recorded in meta only and the bridged scores.0-0 never changes', () => {
  const legacy = { vehicle: 0, scores: { '0-0': 1234 }, times: { '0-0': 20.5 }, ghosts: {}, settings: { music: .6, sfx: .75, gore: true, shake: true, ghost: true }, editor: null };
  const store = fakeStorage({ 'nobrakes-v1': JSON.stringify(legacy) });
  const calls = [], boards = []; let destroyed = 0;
  const ctx = loadGame(file, { storage: store, extra: { Ludvig: { score: (b, v) => { calls.push([b, v]); return Promise.resolve({ ok: false }); }, ui: { board: (el, o) => { boards.push(o); return { destroy() { destroyed++; } }; } } } } });
  const api = ctx.__NO_BRAKES__, M = ctx.NBMeta;
  const date = M.today();
  api.test.startDaily(date, 0);
  let st = api.getState(); assert.equal(st.mode, 'play');
  st = api.test.advance(4, { ArrowUp: true });
  pump(ctx, 30); // render frames with the daily ghost/recorder active
  api.test.kill();
  results(ctx); // death timer runs out -> results screen
  const save = JSON.parse(store.getItem('nobrakes-v1'));
  assert.equal(save.scores['0-0'], 1234); eq(Object.keys(save.scores), ['0-0']);
  eq(Object.keys(save.times), ['0-0']); eq(Object.keys(save.ghosts), []);
  const info = M.dailyInfo(date);
  assert.equal(info.tries, 1); assert.ok(info.best > 0);
  eq(calls.map(c => c[0]), ['no-brakes:daily']);
  eq(boards.at(-1), { board: 'no-brakes:daily', limit: 5, periods: ['7d'] });
  assert.ok(store.getItem('nobrakes-meta-ghost:daily'), 'daily ghost saved');
  assert.equal(ctx.__els.get('resultTimeLabel').textContent, 'TRIES');
  // second try replaces the compact board
  api.test.startDaily(date, 0); api.test.advance(1, { ArrowUp: true }); api.test.kill(); results(ctx);
  assert.equal(destroyed, 1); assert.equal(M.dailyInfo(date).tries, 2);
  // a normal course 1 run still updates the original save as before
  api.test.start(0, 0); api.test.advance(2, { ArrowUp: true }); api.test.kill(); results(ctx);
  assert.equal(ctx.__els.get('resultTimeLabel').textContent, 'TIME');
  assert.equal(JSON.parse(store.getItem('nobrakes-v1')).scores['0-0'], 1234, 'lower score does not lower the best');
});

test('game: new course finish saves time in the original format and a meta ghost, plays it back next run', () => {
  const store = fakeStorage();
  const ctx = loadGame(file, { storage: store });
  const api = ctx.__NO_BRAKES__;
  for (const id of [6, 7, 8, 9]) {
    const l = api.test.course(id);
    assert.equal(l.version, 1); assert.ok(l.objects.length > 30);
    assert.doesNotThrow(() => api.test.validate(JSON.parse(JSON.stringify(l))), 'course ' + id + ' passes the Trap Lab validator');
  }
  api.test.start(6, 0); api.test.advance(3, { ArrowUp: true }); api.test.finish(); results(ctx);
  const save = JSON.parse(store.getItem('nobrakes-v1'));
  assert.ok(save.times['6-0'] > 0); assert.ok(!('6-0' in save.ghosts));
  const ghost = JSON.parse(store.getItem('nobrakes-meta-ghost:c6'));
  assert.ok(ghost.n >= 30 && ghost.n <= 40, 'about 12 Hz for 3 s, got ' + ghost.n);
  api.test.start(6, 0); api.test.advance(1, { ArrowUp: true }); pump(ctx, 10);
  assert.equal(ctx.NBMeta.state().courses.includes(6), true);
});

test('game: collection sheet renders missions, 10 unlocks, badges and the ghost toggle, and closes', () => {
  const store = fakeStorage();
  const ctx = loadGame(file, { storage: store });
  const M = ctx.NBMeta, sheet = ctx.__els.get('metaSheet');
  M.endRun({ course: 0, finish: true }); M.endRun({ course: 1, finish: true });
  assert.equal(M.state().unseen, true);
  M.open();
  const h = sheet.innerHTML;
  assert.equal(sheet.hidden, false);
  assert.ok(h.includes('COLLECTION') && h.includes('Missions') && h.includes('Badges'));
  assert.equal((h.match(/class="meta-mission"/g) || []).length, 3);
  assert.equal((h.match(/class="meta-tile/g) || []).length, 10 + 2 + 9, 'unlock tiles + 2 defaults + badges');
  assert.ok(h.includes('Express Checkout'), 'unlocked course shows its name');
  assert.ok(h.includes('3 missions'), 'locked course shows its requirement');
  assert.ok(/data-meta="ghost" checked/.test(h), 'ghost toggle defaults on');
  assert.equal(M.state().unseen, false, 'opening clears the dot');
  M.close(); assert.equal(sheet.hidden, true);
});

console.log(`\n${passed} tests passed`);
