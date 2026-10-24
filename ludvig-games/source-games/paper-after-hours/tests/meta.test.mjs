// Node test for the Paper meta layer. Run: node --max-old-space-size=768 --experimental-vm-modules tests/meta.test.mjs
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const html = fs.readFileSync(fileURLToPath(new URL('../index.html', import.meta.url)), 'utf8');

// 1. Every inline script compiles.
const scripts = [...html.matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/g)];
assert.ok(scripts.length >= 2, 'expected the meta script and the game script');
for (const [, attrs = '', body] of scripts) {
  if (/type=["']module["']/.test(attrs)) new vm.SourceTextModule(body); else new vm.Script(body);
}

// 2. Extract the separable meta logic by its markers.
const start = html.indexOf('/* meta logic start */'), end = html.indexOf('/* meta logic end */');
assert.ok(start > 0 && end > start, 'meta logic markers');
const logic = html.slice(start, end).replace('const PaperMeta=createPaperMeta();', '');
const ctx = vm.createContext({});
vm.runInContext(logic + '\nglobalThis.createPaperMeta=createPaperMeta;', ctx);
const create = ctx.createPaperMeta;

function fakeStore(init = {}) {
  const data = { ...init }, writes = [];
  return { data, writes, getItem: k => (k in data ? data[k] : null), setItem: (k, v) => { writes.push(k); data[k] = String(v); } };
}
const KEY = 'paper.afterhours.meta';
let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('ok', name); };

test('fnv1a and daily seed are deterministic', () => {
  const m = create(() => fakeStore());
  assert.equal(m.fnv1a('a'), 0xe40c292c);
  const a = m.dailyInfo('2026-10-23'), b = m.dailyInfo('2026-10-23'), c = m.dailyInfo('2026-10-24');
  assert.equal(a.seed, m.fnv1a('paper-after-hours:2026-10-23'));
  assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));
  assert.notEqual(a.seed, c.seed);
  const seq = (n) => { const r = m.shotRng(a.seed, n); return [r(), r(), r()]; };
  assert.deepEqual(seq(4), seq(4));
  assert.notDeepEqual(seq(4), seq(5));
  for (const v of seq(7)) assert.ok(v >= 0 && v < 1);
  const other = create(() => fakeStore());
  assert.equal(other.dailyInfo('2026-10-23').twist.id, a.twist.id);
});

test('safe load of corrupt or missing storage', () => {
  const m = create(() => fakeStore({ [KEY]: '{not json', 'paper.afterhours.best': 'abc' }));
  assert.equal(m.state.stats.made, 0);
  assert.equal(m.state.missions.length, 3);
  const weird = create(() => fakeStore({ [KEY]: JSON.stringify({ stats: { made: -5, runs: 'x', bestStreak: 1e99 }, missions: [{ id: 'nope' }, null, 7], unlocked: ['boss', 'boss', 'zzz'], room: 'mars', paper: 7, daily: 'x' }) }));
  assert.equal(weird.state.stats.made, 0);
  assert.equal(weird.state.stats.runs, 0);
  assert.equal(weird.state.missions.length, 3);
  assert.equal(weird.state.room, 'office');
  assert.equal(weird.state.paper, 'ball');
  const throwing = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  const t = create(() => throwing);
  t.startRun({}); t.shot({ scored: true, streak: 1 }); t.endRun({ made: 1, shots: 1, runBest: 1 });
  assert.equal(t.state.stats.made, 1);
  const none = create(() => { throw new Error('no storage'); });
  assert.equal(none.state.missions.length, 3);
});

test('migration seeds best streak from existing keys once', () => {
  const store = fakeStore({ 'paper.afterhours.best': '16', 'paper.afterhours.best.classic': '6' });
  const m = create(() => store);
  assert.equal(m.state.stats.bestStreak, 16);
  assert.ok(m.isUnlocked('night') && m.isUnlocked('boss'));
  assert.ok(m.state.badges.includes('streak10'));
  assert.equal(m.state.unseen, true);
  assert.equal(store.data['paper.afterhours.best'], '16', 'existing key untouched');
  assert.ok(!store.writes.some(k => k.startsWith('paper.afterhours.best')), 'meta never writes best keys');
});

test('mission rotation: 3 active, replaced on completion, no immediate repeat', () => {
  const store = fakeStore();
  const m = create(() => store);
  const ids = () => Array.from(m.state.missions, x => x.id);
  assert.deepEqual(ids(), ['made10', 'streak5', 'wind2']);
  m.startRun({});
  for (let i = 1; i <= 5; i++) m.shot({ scored: true, streak: i, wind: 0 });
  assert.ok(!ids().includes('streak5'), 'streak5 completed');
  assert.equal(ids().length, 3);
  assert.equal(new Set(ids()).size, 3);
  assert.equal(m.state.stats.missionsDone, 1);
  const r = m.endRun({ made: 5, shots: 5, runBest: 5 });
  assert.equal(r.news, 'Unlocked: Late night');
  // Complete many missions; the just-finished id never comes straight back.
  for (let k = 0; k < 40; k++) {
    m.startRun({ daily: true });
    const before = ids();
    for (let i = 1; i <= 20; i++) m.shot({ scored: true, clean: true, rimIn: false, wind: 3.2, far: true, streak: i });
    const after = m.endRun({ made: 20, shots: 20, runBest: 20, daily: true, date: '2026-10-23' });
    assert.equal(ids().length, 3);
    assert.equal(new Set(ids()).size, 3);
    for (const id of ids()) assert.ok(m.missionDef(id));
    assert.ok(typeof after.news === 'string');
    void before;
  }
  assert.ok(m.state.stats.missionsDone > 10);
});

test('unlock rules and equip', () => {
  const store = fakeStore();
  const m = create(() => store);
  assert.equal(m.equip('server'), false);
  m.startRun({});
  for (let i = 0; i < 50; i++) m.shot({ scored: true, streak: 1 });
  assert.ok(m.isUnlocked('server'));
  assert.ok(!m.isUnlocked('blueprint'));
  assert.equal(m.equip('server'), true);
  assert.equal(m.roomColor('#bbbca2'), '#7d8d92');
  assert.equal(m.roomColor('#123456'), '#123456');
  assert.ok(Math.abs(m.light.clear[0] - 0.08) < 1e-6);
  const again = create(() => store);
  assert.equal(again.state.room, 'server', 'equipped room persists');
  assert.equal(again.rooms.length + again.papers.length - 2, 9, '9 unlocks');
  assert.ok(again.pool.length >= 12 && again.pool.length <= 20);
  assert.ok(again.badges.length >= 6 && again.badges.length <= 10);
});

test('daily best and tries live in the meta key only', () => {
  const store = fakeStore({ 'paper.afterhours.best.classic': '3' });
  const m = create(() => store);
  m.startRun({ daily: true });
  m.shot({ scored: true, streak: 1 });
  let r = m.endRun({ made: 1, shots: 3, runBest: 1, daily: true, date: '2026-10-23' });
  assert.deepEqual({ ...r.daily }, { best: 1, tries: 1 });
  r = m.endRun({ made: 4, shots: 6, runBest: 4, daily: true, date: '2026-10-23' });
  assert.deepEqual({ ...r.daily }, { best: 4, tries: 2 });
  r = m.endRun({ made: 2, shots: 5, runBest: 2, daily: true, date: '2026-10-23' });
  assert.deepEqual({ ...r.daily }, { best: 4, tries: 3 });
  assert.deepEqual({ ...m.dailyState('2026-10-24') }, { best: 0, tries: 0 });
  r = m.endRun({ made: 1, shots: 3, runBest: 1, daily: true, date: '2026-10-24' });
  assert.deepEqual({ ...r.daily }, { best: 1, tries: 1 });
  assert.equal(m.state.stats.dailyDays, 2);
  assert.equal(m.state.stats.dailyRuns, 4);
  assert.equal(store.data['paper.afterhours.best.classic'], '3');
  assert.ok(!store.writes.some(k => k !== KEY));
});

test('a just-finished mission is skipped even when it is next in the pool', () => {
  const store = fakeStore({ [KEY]: JSON.stringify({ missions: [{ id: 'streak5', p: 4 }, { id: 'made10', p: 0 }, { id: 'wind2', p: 0 }], next: 1 }) });
  const m = create(() => store);
  m.startRun({});
  m.shot({ scored: true, streak: 5 });
  const ids = Array.from(m.state.missions, x => x.id);
  assert.ok(!ids.includes('streak5'));
  assert.ok(ids.includes('runs5'));
});

console.log(passed + ' tests passed');
