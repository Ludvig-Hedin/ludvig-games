// Run: node --max-old-space-size=768 --experimental-vm-modules source-games/sunset-dash/tests/meta.test.mjs
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const html = fs.readFileSync(fileURLToPath(new URL('../index.html', import.meta.url)), 'utf8');
const coreSrc = html.slice(html.indexOf('/* meta core start */'), html.indexOf('/* meta core end */'));
assert.ok(coreSrc.length > 1000, 'meta core block found');
const DashMeta = new Function(coreSrc + '\nreturn DashMeta;')();

function memStore(init = {}) {
  const m = new Map(Object.entries(init)); const writes = [];
  return { m, writes, get: k => (m.has(k) ? m.get(k) : null), set: (k, v) => { writes.push(k); m.set(k, String(v)); } };
}
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('ok -', name); }
const run = (o = {}) => ({ score: 0, dist: 0, coins: 0, jumps: 0, slides: 0, near: 0, magnets: 0, saves: 0, lanes: 0, boards: 0, daily: false, date: '', ...o });

test('daily seed is FNV-1a of slug:date and deterministic', () => {
  const a = DashMeta(memStore());
  assert.equal(a.fnv1a('a'), 0xe40c292c);
  assert.equal(a.fnv1a(''), 0x811c9dc5);
  assert.equal(a.dailySeed('2026-10-23'), a.fnv1a('sunset-dash:2026-10-23'));
  assert.equal(a.dailySeed('2026-10-23'), DashMeta(memStore()).dailySeed('2026-10-23'));
  assert.notEqual(a.dailySeed('2026-10-23'), a.dailySeed('2026-10-24'));
  assert.equal(a.dateKey(new Date('2026-10-23T23:59:59Z')), '2026-10-23');
});

test('safe load of corrupt or hostile storage', () => {
  for (const raw of ['{bad json', '[]', 'null', '42', JSON.stringify({ stats: { runs: 'x', coins: -5, bestDist: Infinity }, m: { a: [{ id: 'nope' }, null, { id: 'c40', p: 'NaN' }, { id: 'c40', p: 3 }], next: 999 }, eq: { theme: 'neon', skin: '<img>' }, un: 'zzz', daily: { date: 'garbage' } })]) {
    const s = memStore({ 'sunset-dash-meta-v1': raw }); const m = DashMeta(s); m.load();
    const d = m.data;
    assert.equal(d.m.a.length, 3); assert.equal(new Set(d.m.a.map(x => x.id)).size, 3);
    assert.equal(d.eq.theme, 'sunset'); assert.equal(d.eq.skin, 'classic');
    for (const v of Object.values(d.stats)) assert.ok(Number.isFinite(v) && v >= 0);
    m.endRun(run({ score: 10, dist: 10 }));
  }
  const throwing = { get() { throw new Error('denied'); }, set() { throw new Error('quota'); } };
  const m = DashMeta(throwing); m.load(); m.migrate(100); m.endRun(run({ score: 5 })); m.equip('theme', 'sunset');
  assert.equal(m.loadGhost('2026-10-23', new Uint16Array(10)).n, 0);
  assert.equal(m.saveGhost('2026-10-23', 1, 1, new Uint16Array(4), 4), true);
});

test('migration seeds best score once and unlocks earned items', () => {
  const s = memStore(); const m = DashMeta(s); m.load();
  const got = m.migrate(9000).map(x => x.id);
  assert.ok(got.includes('neon') && got.includes('pts5k'));
  assert.equal(m.data.unseen, true);
  const again = DashMeta(s); again.load(); assert.deepEqual(again.migrate(20000), []);
  assert.equal(again.data.stats.bestScore, 9000);
  assert.ok(!s.writes.includes('sunset-dash-v1'), 'never writes the original save key');
});

test('mission rotation: 3 active, unique, no immediate repeat, run vs total progress', () => {
  const m = DashMeta(memStore()); m.load();
  assert.deepEqual(m.data.m.a.map(x => x.id), ['c40', 'd600', 'day3']);
  let r = m.endRun(run({ coins: 30, dist: 300 }));
  assert.deepEqual(r.done, []);
  assert.equal(m.view().missions[0].p, 30);
  r = m.endRun(run({ coins: 20, dist: 200 }));
  assert.equal(m.view().missions[0].p, 30, 'per-run missions keep the best run, not a sum');
  r = m.endRun(run({ coins: 45, dist: 700, daily: true, date: '2026-10-23' }));
  assert.equal(r.done.length, 2); assert.equal(r.news, '2 missions done');
  const ids = m.data.m.a.map(x => x.id);
  assert.equal(new Set(ids).size, 3); assert.ok(!ids.includes('c40') && !ids.includes('d600'));
  assert.equal(m.data.m.a.find(x => x.id === 'day3').p, 1, 'sum missions accumulate');
  let prevDone = null;
  for (let i = 0; i < 80; i++) {
    const res = m.endRun(run({ coins: 200, dist: 6000, score: 9000, jumps: 120, slides: 20, near: 12, magnets: 3, saves: 1, lanes: 70, boards: 4, daily: true, date: '2026-10-23' }));
    const now = m.data.m.a.map(x => x.id);
    assert.equal(new Set(now).size, 3);
    if (prevDone) for (const d of res.done) assert.ok(true, d.id);
    for (const d of res.done) assert.ok(!now.includes(d.id), 'completed mission is not immediately re-added');
    prevDone = res.done;
  }
  assert.ok(m.data.stats.missions >= 15);
});

test('unlock rules, equip and badges', () => {
  const m = DashMeta(memStore()); m.load();
  assert.equal(m.equip('skin', 'berry'), false, 'locked items cannot be equipped');
  for (let i = 0; i < 9; i++) m.endRun(run({ score: 100, dist: 100 }));
  assert.equal(m.view().skins.find(x => x.id === 'berry').unlocked, false);
  const r = m.endRun(run({ score: 100, dist: 100 }));
  assert.equal(r.news, 'Unlocked: Berry');
  assert.equal(m.equip('skin', 'berry'), true); assert.equal(m.data.eq.skin, 'berry');
  assert.equal(m.equip('theme', 'bogus'), false);
  m.endRun(run({ dist: 1200 }));
  assert.ok(m.view().themes.find(x => x.id === 'midnight').unlocked);
  assert.ok(m.view().badges.find(x => x.id === 'first').got);
  assert.equal(m.THEMES.length + m.SKINS.length - 2, 8, '8 unlocks');
  assert.ok(m.MISSIONS.length >= 12 && m.MISSIONS.length <= 20);
  assert.ok(m.BADGES.length >= 6 && m.BADGES.length <= 10);
  const s2 = memStore(); const reload = DashMeta(s2); s2.m.set('sunset-dash-meta-v1', JSON.stringify(m.data)); reload.load();
  assert.equal(reload.data.eq.skin, 'berry');
});

test('daily best and tries per UTC date', () => {
  const m = DashMeta(memStore()); m.load();
  let r = m.endRun(run({ score: 500, dist: 400, daily: true, date: '2026-10-23' }));
  assert.deepEqual([r.daily.best, r.daily.tries, r.daily.newBest], [500, 1, false]);
  r = m.endRun(run({ score: 300, daily: true, date: '2026-10-23' }));
  assert.deepEqual([r.daily.best, r.daily.tries, r.daily.newBest], [500, 2, false]);
  r = m.endRun(run({ score: 800, dist: 900, daily: true, date: '2026-10-23' }));
  assert.deepEqual([r.daily.best, r.daily.tries, r.daily.newBest, r.daily.dist], [800, 3, true, 900]);
  r = m.endRun(run({ score: 100, daily: true, date: '2026-10-24' }));
  assert.deepEqual([r.daily.best, r.daily.tries], [100, 1]);
  assert.equal(m.data.stats.dailyDays, 2); assert.equal(m.data.stats.dailyRuns, 4);
  assert.deepEqual(m.dailyToday('2026-10-23'), { best: 0, tries: 0, dist: 0 });
});

test('ghost encode/decode, save only when better, size cap', () => {
  const s = memStore(); const m = DashMeta(s); m.load();
  const codes = new Uint16Array(m.GMAX);
  for (let i = 0; i < m.GMAX; i++) codes[i] = m.ghostCode(Math.sin(i) * 3.2, Math.abs(Math.cos(i)) * 5.5, i % 7 === 0);
  const str = m.encodeGhost(codes, m.GMAX);
  const out = new Uint16Array(m.GMAX);
  assert.equal(m.decodeGhost(str, out), m.GMAX);
  assert.deepEqual(Array.from(out), Array.from(codes));
  const c = m.ghostCode(-3.2, 2.5, true);
  assert.equal(((c & 31) - 16) / 4, -3.25); assert.equal(((c >> 5) & 63) / 8, 2.5); assert.equal((c >> 11) & 1, 1);
  assert.equal(m.decodeGhost('A*', out), 0); assert.equal(m.decodeGhost('ABC', out), 0);
  assert.equal(m.saveGhost('2026-10-23', 1000, 800, codes, m.GMAX), true);
  assert.ok(s.m.get('sunset-dash-ghost-v1').length < 60000);
  assert.equal(m.saveGhost('2026-10-23', 900, 700, codes, 10), false, 'worse run keeps old ghost');
  assert.equal(m.loadGhost('2026-10-23', out).n, m.GMAX);
  assert.equal(m.loadGhost('2026-10-24', out).n, 0, 'ghost is per day');
  assert.equal(m.saveGhost('2026-10-24', 10, 20, codes, 50), true, 'new day replaces ghost');
  s.m.set('sunset-dash-ghost-v1', '{"d":"2026-10-24","g":5}');
  assert.equal(m.loadGhost('2026-10-24', out).n, 0);
});

// Headless smoke run of the full game script with stub DOM + WebGL.
test('game script: daily run keeps the main best key, normal run writes it, courses are seeded', () => {
  const scriptSrc = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const exposed = scriptSrc.replace(/\}\)\(\);\s*$/, 'globalThis.__dash={start,goTitle,get obstacles(){return obstacles},get state(){return state},get best(){return best},setInv(v){invulnerable=v},get ghostN(){return ghostPlayN}};\n})();');
  assert.notEqual(exposed, scriptSrc);
  const els = new Map();
  const mkEl = id => ({ id, hidden: false, textContent: '', innerHTML: '', style: {}, dataset: {}, tagName: 'BUTTON', offsetParent: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, setAttribute() {}, getAttribute: () => null, addEventListener() {}, focus() {},
    getContext: () => gl, setPointerCapture() {}, querySelector: () => null });
  const el = id => { if (!els.has(id)) els.set(id, mkEl(id)); return els.get(id); };
  const gl = new Proxy({}, { get(_, p) {
    if (typeof p === 'string' && /^[A-Z_0-9]+$/.test(p)) return 1;
    if (p === 'getShaderParameter' || p === 'getProgramParameter') return () => true;
    if (p === 'getExtension') return () => null;
    if (p === 'isContextLost') return () => false;
    if (p === 'getAttribLocation') return () => 0;
    return () => ({});
  } });
  const ls = memStore();
  const lsApi = { getItem: ls.get, setItem: ls.set, removeItem: k => ls.m.delete(k) };
  const scores = [];
  let raf = null, now = 0;
  const ctx = {
    document: { getElementById: el, querySelector: () => el('sun'), addEventListener() {}, body: el('body'), activeElement: null, hidden: false },
    localStorage: lsApi, matchMedia: () => ({ matches: false }), innerWidth: 390, innerHeight: 800, devicePixelRatio: 3,
    addEventListener() {}, requestAnimationFrame: f => { raf = f; }, performance: { now: () => now }, navigator: {},
    Ludvig: { score: (b, v) => { scores.push([b, v]); return Promise.resolve({ ok: false }); }, ui: { board: () => ({ destroy() {} }), open() {} } },
    console, Math, Date, JSON, Object, Array, Number, String, Float32Array, Uint16Array, Map, Set, Promise, Error, parseInt, isFinite,
  };
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  new vm.Script(exposed).runInContext(ctx);
  const g = ctx.__dash;
  const frames = n => { for (let i = 0; i < n; i++) { now += 16.7; raf(now); } };
  frames(10);
  assert.equal(g.state, 'title');
  // Play 30 s invulnerable and collect every obstacle that appears.
  const course = begin => { begin(); g.setInv(1e9); const seen = new Set(); for (let i = 0; i < 1800; i++) { frames(1); for (const o of g.obstacles) seen.add(`${o.type}${o.lane}@${Math.round(o.d)}`); } return [...seen].join(','); };
  // Daily course is identical on every start; normal courses differ.
  const d1 = course(() => el('daily').onclick()), d2 = course(() => g.start(true));
  assert.ok(d1.split(',').length > 20); assert.equal(d1, d2);
  const n1 = course(() => g.start(false)), n2 = course(() => g.start(false));
  assert.notEqual(n1, n2); assert.notEqual(n1, d1);
  // Daily run to the end: no write to sunset-dash-v1, a daily score submit, ghost saved.
  g.start(true); ls.writes.length = 0;
  frames(60 * 20);
  assert.equal(g.state, 'over');
  assert.ok(!ls.writes.includes('sunset-dash-v1'), 'daily run must not touch the main best key');
  assert.equal(scores.length, 1); assert.equal(scores[0][0], 'sunset-dash:daily');
  assert.ok(ls.m.get('sunset-dash-ghost-v1'));
  assert.equal(el('final-best-label').textContent, 'TODAY');
  assert.equal(el('daily-line').hidden, false);
  // A second daily try reads the ghost back and plays it while rendering.
  el('restart').onclick(); frames(120);
  assert.equal(g.state, 'playing'); assert.ok(g.ghostN > 10, 'ghost loaded for the next daily try');
  frames(60 * 20); assert.equal(g.state, 'over');
  // Menu, then a normal run: best is saved to the original key.
  el('over-menu').onclick(); assert.equal(g.state, 'title');
  el('start').onclick(); frames(60 * 20); assert.equal(g.state, 'over');
  assert.ok(ls.writes.includes('sunset-dash-v1'));
  assert.ok(JSON.parse(ls.m.get('sunset-dash-v1')).best > 0);
  assert.equal(el('final-best-label').textContent, 'BEST');
  assert.equal(scores.length, 2, 'normal runs do not submit to the daily board');
  const metaSaved = JSON.parse(ls.m.get('sunset-dash-meta-v1'));
  assert.equal(metaSaved.stats.runs, 3); assert.equal(metaSaved.stats.dailyRuns, 2);
  // Collection sheet opens and renders.
  el('meta-button').onclick(); assert.equal(el('meta-screen').hidden, false);
  assert.ok(el('meta-themes').innerHTML.includes('Midnight'));
  el('meta-close').onclick(); assert.equal(el('meta-screen').hidden, true);
});

console.log(`\n${passed} tests passed`);
