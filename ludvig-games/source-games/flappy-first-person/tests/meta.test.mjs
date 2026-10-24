// Node test for Flap's meta layer. Run: node --max-old-space-size=768 --experimental-vm-modules tests/meta.test.mjs
// Extracts the block between "/* meta layer */" and "/* end meta layer */" from index.html and runs it with fake storage.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const html = fs.readFileSync(fileURLToPath(new URL('../index.html', import.meta.url)), 'utf8');
const start = html.indexOf('/* meta layer */'), end = html.indexOf('/* end meta layer */');
assert.ok(start > 0 && end > start, 'meta layer markers present');
const metaCode = html.slice(start, end);
const physicsCode = html.match(/<script>([\s\S]*?)<\/script>/)[1];

function fakeStorage(seed = {}, { throwOnSet = false, throwOnGet = false } = {}) {
  const map = new Map(Object.entries(seed));
  return {
    map,
    getItem(k) { if (throwOnGet) throw new Error('blocked'); return map.has(k) ? map.get(k) : null; },
    setItem(k, v) { if (throwOnSet) throw new Error('QuotaExceededError'); map.set(k, String(v)); },
    removeItem(k) { map.delete(k); }
  };
}
function boot(storage) {
  const ctx = { btoa, atob, Math, JSON, Date, console };
  if (storage !== undefined) ctx.localStorage = storage;
  vm.createContext(ctx);
  vm.runInContext(physicsCode, ctx);
  vm.runInContext(metaCode, ctx);
  return ctx;
}
const plain = v => JSON.parse(JSON.stringify(v)); // objects from the vm realm have other prototypes
let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('ok -', name); };

test('FNV-1a reference values and daily seed determinism', () => {
  const { FlapMeta: M } = boot(fakeStorage());
  assert.equal(M.fnv1a(''), 0x811c9dc5);
  assert.equal(M.fnv1a('a'), 0xe40c292c);
  assert.equal(M.dailySeed('2026-10-23'), M.fnv1a('flappy-first-person:2026-10-23'));
  assert.equal(M.dailySeed('2026-10-23'), M.dailySeed('2026-10-23'));
  assert.notEqual(M.dailySeed('2026-10-23'), M.dailySeed('2026-10-24'));
  assert.equal(M.dateKey(new Date('2026-10-23T23:30:00-05:00')), '2026-10-24'); // UTC date
  assert.equal(M.dailyWorld('2026-10-23'), M.dailyWorld('2026-10-23'));
  assert.ok(M.WORLDS.some(w => w.id === M.dailyWorld('2026-10-23')));
});

test('daily pipe layout is identical for everyone that day (two separate page loads)', () => {
  const layout = ctx => {
    const g = new ctx.FlightPhysics('classic', ctx.FlapMeta.dailySeed('2026-10-23'));
    const out = g.pipes.map(p => p.center);
    for (let i = 0; i < 9; i++) out.push(g.makePipe(0).center);
    return plain(out);
  };
  const a = layout(boot(fakeStorage())), b = layout(boot(fakeStorage()));
  assert.deepEqual(a, b);
  const c = (() => { const ctx = boot(fakeStorage()); const g = new ctx.FlightPhysics('classic', ctx.FlapMeta.dailySeed('2026-10-24')); return plain(g.pipes.map(p => p.center)); })();
  assert.notDeepEqual(a.slice(0, 9), c);
});

test('missions: three active, rotation replaces finished ones without immediate repeats', () => {
  const { FlapMeta: M } = boot(fakeStorage());
  const s = M.load();
  assert.equal(s.missions.active.length, 3);
  assert.deepEqual(plain(s.missions.active.map(a => a.id)), ['run5', 'total50', 'perfect3']);
  const news = M.recordRun(s, { mode: 'classic', daily: false, score: 6, perfect: 1, flaps: 20, dist: 140, time: 12 });
  assert.ok(news.some(n => n.kind === 'mission' && n.id === 'run5'));
  const ids = s.missions.active.map(a => a.id);
  assert.equal(new Set(ids).size, 3);
  assert.ok(!ids.includes('run5'));
  assert.equal(ids[0], 'daily3'); // next in pool order
  assert.equal(s.missions.active[1].p, 6); // total50 accumulates
  assert.equal(s.stats.missionsDone, 1);
  // Mode-restricted missions ignore other modes; daily-only counts daily runs.
  for (let i = 0; i < 3; i++) M.recordRun(s, { mode: 'classic', daily: true, date: '2026-10-23', score: 0, perfect: 0, flaps: 3, dist: 5, time: 1 });
  assert.ok(!s.missions.active.some(a => a.id === 'daily3'));
  // Long play cycles the pool without duplicates.
  for (let i = 0; i < 200; i++) {
    M.recordRun(s, { mode: i % 2 ? 'chill' : 'classic', daily: i % 3 === 0, date: '2026-11-' + String(1 + (i % 28)).padStart(2, '0'), score: 25, perfect: 9, flaps: 80, dist: 600, time: 50 });
    const now = s.missions.active.map(a => a.id);
    assert.equal(new Set(now).size, 3);
  }
  assert.ok(s.stats.missionsDone > 20);
});

test('unlock rules and equip', () => {
  const { FlapMeta: M } = boot(fakeStorage());
  const s = M.load();
  assert.equal(s.equip.bird, 'sunny');
  assert.equal(M.equip(s, 'bird', 'robin'), false); // locked
  assert.equal(M.equip(s, 'world', 'nope'), false);
  const news = M.recordRun(s, { mode: 'chill', daily: false, score: 12, perfect: 2, flaps: 40, dist: 300, time: 30 });
  assert.ok(news.some(n => n.kind === 'unlock' && n.id === 'robin'));
  assert.ok(news.some(n => n.kind === 'badge' && n.id === 'ten'));
  assert.equal(M.newsLine(news), 'Unlocked: Robin');
  assert.equal(s.unseen, true);
  assert.equal(M.equip(s, 'bird', 'robin'), true);
  assert.equal(M.equip(s, 'bird', 'flamingo'), false);
  const reload = M.load();
  assert.equal(reload.equip.bird, 'robin');
  assert.ok(reload.unlocked.includes('robin'));
  const total = M.SKINS.length + M.WORLDS.length - 2;
  assert.ok(total >= 6 && total <= 12, 'unlock count ' + total);
  assert.ok(M.MISSIONS.length >= 12 && M.MISSIONS.length <= 20);
  assert.ok(M.BADGES.length >= 6 && M.BADGES.length <= 10);
  assert.equal(M.newsLine([{ kind: 'mission', name: 'x' }]), 'Mission done');
  assert.equal(M.newsLine([]), '');
});

test('migration seeds stats from the existing best keys once', () => {
  const store = fakeStorage({ 'flappy-fp-v1-best-classic': '27', 'flappy-fp-v1-best-chill': '40' });
  const { FlapMeta: M } = boot(store);
  const s = M.load();
  assert.equal(s.stats.bestAny, 40);
  assert.equal(s.stats.pipes, 67);
  assert.ok(s.unlocked.includes('robin') && s.unlocked.includes('flamingo') && s.unlocked.includes('dusk') && s.unlocked.includes('night'));
  assert.ok(s.badges.includes('quarter'));
  assert.equal(store.map.get('flappy-fp-v1-best-classic'), '27'); // untouched
  M.recordRun(s, { mode: 'classic', daily: false, score: 3, perfect: 0, flaps: 9, dist: 70, time: 6 });
  const again = M.load();
  assert.equal(again.stats.pipes, 70); // not re-seeded
});

test('daily record keeps best and tries in its own key', () => {
  const store = fakeStorage();
  const { FlapMeta: M } = boot(store);
  let d = M.recordDaily('2026-10-23', 7);
  assert.deepEqual({ best: d.best, tries: d.tries, prev: d.prev }, { best: 7, tries: 1, prev: 0 });
  d = M.recordDaily('2026-10-23', 4);
  assert.deepEqual({ best: d.best, tries: d.tries, prev: d.prev }, { best: 7, tries: 2, prev: 7 });
  assert.deepEqual(plain(M.loadDaily('2026-10-24')), { d: '2026-10-24', best: 0, tries: 0 });
  assert.ok(![...store.map.keys()].some(k => k.startsWith('flappy-fp-v1-best')));
});

test('ghost encode/decode round trip, size cap and save-only-when-better', () => {
  const store = fakeStorage();
  const { FlapMeta: M } = boot(store);
  const buf = new Uint16Array(M.GHOST_CAP);
  for (let i = 0; i < buf.length; i++) buf[i] = M.quant(6 + Math.sin(i / 9) * 4);
  const text = M.encodeGhost(buf, buf.length);
  assert.ok(text.length < 60000, 'ghost size ' + text.length);
  const out = new Uint16Array(M.GHOST_CAP);
  assert.equal(M.decodeGhost(text, out), buf.length);
  assert.deepEqual(out, buf);
  assert.ok(Math.abs(M.sampleGhost(out, buf.length, 0.5) - (6 + Math.sin(10 / 9) * 4)) < 0.02);
  assert.ok(Number.isNaN(M.sampleGhost(out, 10, 5)));
  assert.equal(M.quant(-50), 0); assert.equal(M.quant(99), 3100);
  assert.equal(M.saveGhost('2026-10-23', 5, buf, 200), true);
  assert.equal(M.saveGhost('2026-10-23', 5, buf, 300), false); // tie keeps the old run
  assert.equal(M.saveGhost('2026-10-23', 3, buf, 300), false);
  assert.equal(M.loadGhost('2026-10-23', out).n, 200);
  assert.equal(M.saveGhost('2026-10-23', 9, buf, 300), true);
  assert.equal(M.loadGhost('2026-10-23', out).n, 300);
  assert.equal(M.loadGhost('2026-10-24', out).n, 0); // yesterday's ghost is not replayed
  assert.equal(M.decodeGhost('%%%not base64', out), 0);
});

test('corrupt or unavailable storage never throws', () => {
  const corrupt = fakeStorage({ 'flappy-fp-meta-v1': '{bad json', 'flappy-fp-daily-v1': '[1,2', 'flappy-fp-ghost-v1': '"str"' });
  let M = boot(corrupt).FlapMeta;
  let s = M.load();
  assert.equal(s.missions.active.length, 3);
  assert.deepEqual(plain(M.loadDaily('2026-10-23')), { d: '2026-10-23', best: 0, tries: 0 });
  assert.equal(M.loadGhost('2026-10-23', new Uint16Array(10)).n, 0);
  // Wrong types inside valid JSON.
  M = boot(fakeStorage({ 'flappy-fp-meta-v1': JSON.stringify({ migrated: true, stats: { runs: 'x', pipes: -5, bestAny: 1e99 }, missions: { active: [{ id: 'zzz' }, { id: 'run10', p: 'NaN' }, { id: 'run10' }], cursor: -3 }, unlocked: ['robin', 7, 'fake'], equip: { bird: 'raven', world: 'dusk' }, ghost: 'no' }) })).FlapMeta;
  s = M.load();
  assert.equal(s.stats.runs, 0); assert.equal(s.stats.pipes, 0); assert.equal(s.stats.bestAny, 1e9);
  assert.equal(new Set(s.missions.active.map(a => a.id)).size, 3);
  assert.deepEqual(plain(s.unlocked), ['robin']);
  assert.equal(s.equip.bird, 'sunny'); // raven is not unlocked
  assert.equal(s.equip.world, 'lagoon');
  assert.equal(s.ghost, true);
  // Storage that throws on every call, and no storage at all.
  for (const st of [fakeStorage({}, { throwOnGet: true, throwOnSet: true }), undefined]) {
    M = boot(st).FlapMeta;
    s = M.load();
    M.recordRun(s, { mode: 'classic', daily: true, date: '2026-10-23', score: 4, perfect: 0, flaps: 9, dist: 70, time: 6 });
    assert.equal(M.recordDaily('2026-10-23', 4).best, 4);
    assert.equal(M.loadDaily('2026-10-23').tries, 1); // session copy
    assert.equal(M.saveGhost('2026-10-23', 4, new Uint16Array([100, 200, 300]), 3), true);
  }
});

test('collection markup lists 3 missions, all unlocks and badges', () => {
  const { FlapMeta: M } = boot(fakeStorage());
  const s = M.load();
  const html = M.collectionHTML(s, { best: 12, tries: 3 });
  assert.equal((html.match(/class="mission"/g) || []).length, 3);
  assert.equal((html.match(/data-equip=/g) || []).length, M.SKINS.length + M.WORLDS.length);
  assert.equal((html.match(/class="badge[ "]/g) || []).length, M.BADGES.length);
  assert.ok(html.includes('Best 12 · 3 tries'));
  assert.ok(html.includes('id="ghost-toggle"'));
  assert.ok(!M.collectionHTML(s, { best: 0, tries: 0 }).includes('coll-daily'));
});

console.log(`\n${passed} tests passed`);
