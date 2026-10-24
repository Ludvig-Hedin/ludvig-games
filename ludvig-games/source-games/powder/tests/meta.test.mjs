// Node checks for the Powder meta layer. Run:
//   node --max-old-space-size=768 --experimental-vm-modules source-games/powder/tests/meta.test.mjs
// Part 1 tests the pure meta core (extracted from index.html by its comment markers).
// Part 2 runs the whole game script against stubbed THREE/DOM to catch wiring errors.
import fs from 'fs';
import vm from 'vm';
import assert from 'assert/strict';
import { fileURLToPath } from 'url';

const here = fileURLToPath(new URL('.', import.meta.url));
const html = fs.readFileSync(here + '../index.html', 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const game = scripts[scripts.length - 1];
const a = game.indexOf('/* meta layer: core start'), b = game.indexOf('/* meta layer: core end */');
assert.ok(a > 0 && b > a, 'meta core markers found');
const coreSrc = game.slice(a, b);
const createPowderMeta = new Function(coreSrc + '\nreturn createPowderMeta;')();

function memStore(init = {}, { failGet = false, failSet = false } = {}) {
  const m = new Map(Object.entries(init)); const writes = [];
  return {
    map: m, writes,
    get(k) { if (failGet) throw new Error('blocked'); return m.has(k) ? m.get(k) : null; },
    set(k, v) { if (failSet) throw new Error('quota'); writes.push(k); m.set(k, String(v)); return true; }
  };
}
const baseRun = (o = {}) => ({ daily: false, run: 'classic', date: '', score: 0, win: false, hits: 0, gates: 0, gateTotal: 27, maxCombo: 0, maxMult: 1, jumps: 0, spins: 0, doubles: 0, rings: 0, near: 0, dist: 0, time: 80, topKmh: 100, rank: 'C', ...o });
let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('ok -', name); };

// ---------- Part 1: core ----------
test('fnv1a reference values and daily seed determinism', () => {
  const M = createPowderMeta(memStore());
  assert.equal(M.fnv1a(''), 0x811c9dc5);
  assert.equal(M.fnv1a('a'), 0xe40c292c);
  const p1 = M.dailyPlan('2026-10-23'), p2 = createPowderMeta(memStore()).dailyPlan('2026-10-23');
  assert.deepEqual(p1, p2);
  assert.equal(p1.seed, M.fnv1a('powder:2026-10-23'));
  assert.notEqual(M.dailyPlan('2026-10-24').seed, p1.seed);
  assert.ok(M.RUNS.some(r => r.id === p1.base));
  assert.ok(p1.gp >= 0 && p1.gp < Math.PI * 2 && p1.ga >= .85 && p1.ga <= 1.15);
  assert.equal(M.dateKey(new Date('2026-10-23T23:59:00Z')), '2026-10-23');
});

test('core PRNG matches the game course PRNG', () => {
  const m = game.match(/function rng\(seed\)\{[^\n]*?;\};\}/);
  assert.ok(m, 'game rng found');
  const rng = new Function(m[0] + '\nreturn rng;')();
  const M = createPowderMeta(memStore());
  const x = rng(12345), y = M.mulberry32(12345);
  for (let i = 0; i < 20; i++) assert.equal(x(), y());
});

test('fixed runs are deterministic and classic stays random', () => {
  const M = createPowderMeta(memStore());
  assert.equal(M.runPlan('classic').random, true);
  assert.equal(M.runPlan('classic').ghost, false);
  // Locked runs fall back to classic.
  assert.equal(M.runPlan('night').id, 'classic');
  const S = memStore(); const M2 = createPowderMeta(S);
  M2.state().stats.finishes = 5; assert.equal(M2.runPlan('night').id, 'night');
  assert.equal(M2.runPlan('night').seed, M2.runPlan('night').seed);
  assert.equal(M2.runPlan('night').ghost, true);
});

test('missions rotate without immediate repeats and keep 3 unique', () => {
  const S = memStore(); const M = createPowderMeta(S);
  assert.deepEqual(M.state().missions.active, ['jumps8', 'lodge3', 'score10k']);
  const out = M.endRun(baseRun({ jumps: 9, score: 500 }));
  assert.equal(out.completed.length, 1); assert.equal(out.completed[0].id, 'jumps8');
  const act = M.state().missions.active;
  assert.equal(act.length, 3); assert.equal(new Set(act).size, 3);
  assert.ok(!act.includes('jumps8')); assert.equal(act[0], 'streak10');
  assert.equal(out.news, 'Mission done');
  // Progress: single-run missions keep the best value, sums add up.
  M.endRun(baseRun({ win: true, score: 4000 })); M.endRun(baseRun({ win: true, score: 6000 }));
  const ms = M.missions();
  assert.equal(ms.find(m => m.id === 'lodge3').have, 2);
  assert.equal(ms.find(m => m.id === 'score10k').have, 6000);
  // Cycle many completions: never repeat the mission just completed, stay unique.
  for (let i = 0; i < 60; i++) {
    const before = M.state().missions.active.slice();
    const r = M.endRun(baseRun({ jumps: 99, win: true, score: 99999, maxCombo: 30, near: 9, rings: 9, daily: true, date: '2026-10-23', spins: 9, dist: 9000, hits: 0, topKmh: 220, gates: 27, maxMult: 5, doubles: 1, time: 50 }));
    const after = M.state().missions.active;
    assert.equal(new Set(after).size, 3);
    for (const c of r.completed) assert.ok(!after.includes(c.id) || before.filter(x => x === c.id).length === 0);
  }
  assert.ok(M.state().stats.missionsDone > 20);
});

test('unlock rules, equip, and news line', () => {
  const S = memStore(); const M = createPowderMeta(S);
  assert.deepEqual(M.unlocks().filter(u => u.unlocked).map(u => u.id), ['classic', 'orange', 'snow']);
  assert.equal(M.equip('glade'), false);
  const out = M.endRun(baseRun({ score: 8200, dist: 900 }));
  assert.equal(out.news, 'Unlocked: Glade');
  assert.ok(M.isUnlocked('glade')); assert.equal(M.equip('glade'), true); assert.equal(M.state().sel, 'glade');
  assert.equal(M.state().unseen, true); M.markSeen(); assert.equal(M.state().unseen, false);
  const total = M.unlocks().length - 3; assert.ok(total >= 6 && total <= 12, 'unlock count ' + total);
  assert.ok(M.BADGES.length >= 6 && M.BADGES.length <= 10);
  assert.ok(M.MISSIONS.length >= 12 && M.MISSIONS.length <= 20);
  assert.ok(M.RUNS.length >= 4);
  // Equipped choice persists.
  const M2 = createPowderMeta(S); assert.equal(M2.state().sel, 'glade');
});

test('migration seeds stats from powder.best.v1 once and never writes it', () => {
  const S = memStore({ 'powder.best.v1': '31000' }); const M = createPowderMeta(S);
  assert.equal(M.state().stats.bestScore, 31000);
  assert.ok(M.isUnlocked('glade')); assert.ok(M.state().badges.big); assert.equal(M.state().unseen, true);
  assert.ok(!S.writes.includes('powder.best.v1'));
  S.map.set('powder.best.v1', '99999'); const M2 = createPowderMeta(S);
  assert.equal(M2.state().stats.bestScore, 31000, 'migration runs only once');
});

test('daily runs track best and tries per day and never touch powder.best.v1', () => {
  const S = memStore(); const M = createPowderMeta(S);
  let o = M.endRun(baseRun({ daily: true, run: 'daily', date: '2026-10-23', score: 5000 }));
  assert.deepEqual(o.daily, { date: '2026-10-23', best: 5000, tries: 1, isNew: true });
  o = M.endRun(baseRun({ daily: true, run: 'daily', date: '2026-10-23', score: 3000 }));
  assert.deepEqual(o.daily, { date: '2026-10-23', best: 5000, tries: 2, isNew: false });
  o = M.endRun(baseRun({ daily: true, run: 'daily', date: '2026-10-24', score: 100 }));
  assert.deepEqual(o.daily, { date: '2026-10-24', best: 100, tries: 1, isNew: true });
  assert.deepEqual(M.state().stats.dailyDays, ['2026-10-23', '2026-10-24']);
  assert.ok(!S.writes.includes('powder.best.v1'));
});

test('safe load of corrupt or unavailable storage', () => {
  for (const bad of ['{not json', '[]', 'null', '42', JSON.stringify({ stats: 'x', missions: { active: ['nope', 'nope', 7], ptr: -5, prog: { jumps8: 'NaN' } }, daily: 3, sel: 'night', badges: [] })]) {
    const M = createPowderMeta(memStore({ 'powder.meta.v1': bad, 'powder.ghost.v1.glade': '{bad' }));
    const act = M.state().missions.active;
    assert.equal(act.length, 3); assert.equal(new Set(act).size, 3);
    assert.equal(M.state().sel, 'classic');
    assert.equal(M.loadGhost('glade', '', new Int16Array(40)), null);
    M.endRun(baseRun({ score: 10 }));
  }
  const M = createPowderMeta(memStore({}, { failGet: true, failSet: true }));
  assert.equal(M.state().sel, 'classic');
  M.endRun(baseRun({ win: true, score: 100 }));
  assert.equal(M.saveGhost('glade', 10, new Int16Array(8), 2, ''), false);
});

test('ghost encode/decode round-trip, size, save only when better, daily date check', () => {
  const S = memStore(); const M = createPowderMeta(S);
  const n = 3000, buf = new Int16Array(n * 4);
  for (let i = 0; i < n * 4; i++) buf[i] = ((i * 7919) % 65536) - 32768;
  const enc = M.encodeGhost(buf, n);
  assert.ok(enc.length < 60000, 'ghost under 60 KB: ' + enc.length);
  const out = new Int16Array(n * 4); assert.equal(M.decodeGhost(enc, out), n); assert.deepEqual(out, buf);
  const small = Int16Array.from([0, -1260, 0, 0, 10, 1260, 476, 1257, 20, 3, 5, -628]);
  assert.equal(M.saveGhost('glade', 5000, small, 3, ''), true);
  assert.equal(M.saveGhost('glade', 4000, small, 3, ''), false, 'worse run does not replace ghost');
  const o2 = new Int16Array(40); const g = M.loadGhost('glade', '', o2);
  assert.deepEqual(g, { score: 5000, n: 3 }); assert.deepEqual([...o2.slice(0, 12)], [...small]);
  assert.equal(M.saveGhost('daily', 100, small, 3, '2026-10-23'), true);
  assert.ok(M.loadGhost('daily', '2026-10-23', o2));
  assert.equal(M.loadGhost('daily', '2026-10-24', o2), null);
  assert.equal(M.saveGhost('daily', 50, small, 3, '2026-10-24'), true, 'new day replaces old daily ghost');
});

// ---------- Part 2: smoke run of the game script with stubs ----------
function anyProxy() {
  const store = new Map();
  const target = function () {};
  const p = new Proxy(target, {
    get(t, k) {
      if (k === Symbol.toPrimitive) return () => 0;
      if (k === 'then' || typeof k === 'symbol') return undefined;
      if (store.has(k)) return store.get(k);
      const c = anyProxy(); store.set(k, c); return c;
    },
    set(t, k, v) { store.set(k, v); return true; },
    apply() { return anyProxy(); },
    construct() { return anyProxy(); },
    has() { return true; }
  });
  return p;
}
function makeEvent(type, extra = {}) {
  return { type, stopped: false, defaultPrevented: false, repeat: false, metaKey: false, ctrlKey: false, altKey: false,
    stopPropagation() { this.stopped = true; }, stopImmediatePropagation() { this.stopped = true; }, preventDefault() { this.defaultPrevented = true; }, ...extra };
}
function makeEl(id) {
  const listeners = {};
  const classes = new Set(id === 'meta-sheet' || id === 'pause-screen' || id === 'end' ? ['hidden'] : []);
  const attrs = {};
  return {
    id, style: {}, dataset: {}, children: [], textContent: '', innerHTML: '', hidden: false, width: 0, height: 0,
    classList: { add: c => classes.add(c), remove: (...c) => c.forEach(x => classes.delete(x)), toggle: (c, on) => { const v = on === undefined ? !classes.has(c) : !!on; v ? classes.add(c) : classes.delete(c); return v; }, contains: c => classes.has(c) },
    setAttribute(k, v) { attrs[k] = String(v); }, getAttribute(k) { return k in attrs ? attrs[k] : null; },
    addEventListener(t, fn) { (listeners[t] ||= []).push(fn); },
    fire(t, extra) { const e = makeEvent(t, { target: this, ...extra }); for (const fn of listeners[t] || []) fn(e); return e; },
    focus() {}, remove() {}, closest() { return null; }, setPointerCapture() {},
    getContext() { return anyProxy(); }, getBoundingClientRect() { return { left: 0, top: 0, width: 800, height: 600 }; }
  };
}
function runGame(initialStorage = {}) {
  const els = new Map(); const $ = id => { if (!els.has(id)) els.set(id, makeEl(id)); return els.get(id); };
  const ls = new Map(Object.entries(initialStorage)); const lsWrites = [];
  const winListeners = [];
  let raf = null, now = 0; const timers = [];
  const calls = { score: [], board: [] };
  const ctx = {
    console, Math, JSON, Int16Array, Float32Array, Array, Object, Number, String, Map, Set, Date, btoa, atob,
    THREE: anyProxy(),
    devicePixelRatio: 2, innerWidth: 800, innerHeight: 600,
    navigator: {}, performance: { now: () => now },
    matchMedia: () => ({ matches: false }),
    requestAnimationFrame: fn => { raf = fn; return 1; },
    setTimeout: (fn) => { timers.push(fn); return timers.length; },
    localStorage: { getItem: k => ls.has(k) ? ls.get(k) : null, setItem: (k, v) => { lsWrites.push(k); ls.set(k, String(v)); }, removeItem: k => ls.delete(k) },
    addEventListener: (t, fn, cap) => winListeners.push({ t, fn, cap: cap === true }),
    Ludvig: { score: (board, v) => { calls.score.push([board, v]); return Promise.resolve({ ok: false }); }, ui: { board: (el, o) => { calls.board.push(o); return { destroy() {} }; }, open() {} } },
    document: {
      getElementById: $, querySelector: () => makeEl('q'), createElement: () => makeEl('canvas'),
      body: makeEl('body'), activeElement: null, contains: () => true, hidden: false, fullscreenEnabled: false,
      addEventListener() {}
    }
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  new vm.Script(game, { filename: 'powder-game.js' }).runInContext(ctx);
  const flush = () => { while (timers.length) timers.shift()(); };
  const frame = (ms = 100) => { now += ms; const f = raf; raf = null; f(now); };
  const state = () => ctx.powderState;
  const key = (code) => { const e = makeEvent('keydown', { code, key: code === 'Escape' ? 'Escape' : code }); for (const l of winListeners.filter(l => l.t === 'keydown' && l.cap)) { l.fn(e); if (e.stopped) return e; } for (const l of winListeners.filter(l => l.t === 'keydown' && !l.cap)) l.fn(e); return e; };
  const runToEnd = () => { let i = 0; while (state().mode !== 'end' && i++ < 4000) { frame(100); flush(); } assert.equal(state().mode, 'end', 'run ended'); };
  return { $, ls, lsWrites, calls, flush, frame, state, key, runToEnd, ctx };
}

test('game smoke: daily run end-to-end with stubs', () => {
  const G = runGame({ 'powder.best.v1': '1234' });
  G.flush(); G.frame(); G.frame();
  assert.equal(G.state().mode, 'menu');
  assert.equal(G.$('meta-btn').hidden, false, 'collection button on start screen');
  G.$('meta-daily').fire('click'); G.flush();
  assert.equal(G.state().mode, 'play'); assert.equal(G.state().daily, true); assert.equal(G.state().run, 'daily');
  const meta0 = JSON.parse(G.ls.get('powder.meta.v1'));
  const today = new Date().toISOString().slice(0, 10);
  const plan = createPowderMeta(memStore()).dailyPlan(today);
  assert.equal(G.state().runSeed, plan.seed, 'daily uses the seeded course');
  const firstLayout = JSON.stringify(G.state().next.slice(0, 12));
  G.runToEnd();
  assert.ok(!G.lsWrites.includes('powder.best.v1'), 'daily never writes powder.best.v1');
  const meta = JSON.parse(G.ls.get('powder.meta.v1'));
  assert.equal(meta.daily.date, today); assert.equal(meta.daily.tries, 1);
  assert.equal(meta.stats.runs, meta0.stats.runs + 1);
  assert.ok(G.ls.has('powder.ghost.v1.daily'), 'daily ghost saved');
  assert.ok(G.ls.get('powder.ghost.v1.daily').length < 60000);
  assert.match(G.$('record').textContent, /DAILY BEST|NEW DAILY BEST/);
  assert.ok(G.calls.board.some(o => o.board === 'powder:daily' && o.periods && o.periods.join() === '7d'));
  if (Math.round(G.state().score) > 0) assert.ok(G.calls.score.some(c => c[0] === 'powder:daily'));
  // Play again stays on the same daily course.
  G.$('again').fire('click'); G.flush();
  assert.equal(G.state().daily, true); assert.equal(G.state().runSeed, plan.seed);
  assert.equal(G.state().ghost, true, 'daily ghost loads on retry');
  assert.equal(JSON.stringify(G.state().next.slice(0, 12)), firstLayout, 'same layout on retry');
  G.runToEnd();
  assert.equal(JSON.parse(G.ls.get('powder.meta.v1')).daily.tries, 2);
  assert.ok(!G.lsWrites.includes('powder.best.v1'));
  // Menu, then a normal run writes the main best as before.
  G.$('home').fire('click'); assert.equal(G.state().mode, 'menu'); assert.equal(G.state().daily, false);
  G.$('start').fire('click'); G.flush();
  assert.equal(G.state().run, 'classic'); assert.equal(G.state().daily, false);
  assert.equal(G.state().ghost, false, 'no ghost on random classic courses');
  G.runToEnd();
  const s = Math.round(G.state().score);
  if (s > 1234) assert.ok(G.lsWrites.includes('powder.best.v1'));
  assert.ok(G.calls.board.some(o => o.board === 'powder' && !o.periods));
});

test('game smoke: collection sheet, key isolation, run select, fixed-run ghost', () => {
  const unlockedMeta = JSON.stringify({ v: 1, migrated: true, sel: 'classic', stats: { finishes: 6, bestScore: 9000, missionsDone: 3, dist: 6000 } });
  const G = runGame({ 'powder.meta.v1': unlockedMeta });
  G.flush(); G.frame();
  assert.equal(G.$('meta-pick').hidden, false, 'run picker visible with several runs');
  G.$('meta-btn').fire('click');
  assert.equal(G.$('meta-sheet').classList.contains('hidden'), false);
  assert.match(G.$('meta-missions').innerHTML, /meta-mis/);
  assert.match(G.$('meta-runs').innerHTML, /data-equip="night"/);
  const e = G.key('Space'); G.flush();
  assert.equal(G.state().mode, 'menu', 'Space inside the sheet does not start a run');
  assert.ok(e.stopped);
  G.key('Escape');
  assert.equal(G.$('meta-sheet').classList.contains('hidden'), true, 'Escape closes');
  G.$('meta-next').fire('click');
  assert.equal(G.$('meta-run').textContent, 'Glade');
  G.$('meta-prev').fire('click'); G.$('meta-prev').fire('click');
  assert.equal(G.$('meta-run').textContent, 'Night');
  G.frame();
  G.$('start').fire('click'); G.flush();
  assert.equal(G.state().run, 'night');
  const seed = G.state().runSeed; const layout = JSON.stringify(G.state().next.slice(0, 15));
  assert.ok(G.state().next.some(o => o.kind === 'lantern'), 'night run has lanterns');
  G.runToEnd();
  assert.ok(G.ls.has('powder.ghost.v1.night'), 'fixed run ghost saved');
  G.$('again').fire('click'); G.flush();
  assert.equal(G.state().runSeed, seed); assert.equal(JSON.stringify(G.state().next.slice(0, 15)), layout);
  assert.equal(G.state().ghost, true, 'ghost of the best run loads on retry');
  G.frame(); G.frame();
  // Pause, open the collection from the pause menu, equip a cosmetic.
  G.key('Escape'); assert.equal(G.state().mode, 'pause');
  G.$('meta-pause').fire('click');
  const fake = { target: { closest: () => ({ getAttribute: () => null, dataset: { equip: 'pine' } }) } };
  G.$('meta-sheet').fire('click', fake);
  assert.equal(JSON.parse(G.ls.get('powder.meta.v1')).jacket, 'pine');
  G.key('Escape');
  assert.equal(G.state().mode, 'pause', 'Escape closes the sheet, not the pause');
  G.$('resume').fire('click'); assert.equal(G.state().mode, 'play');
  // Moguls run builds moguls and ice.
  G.runToEnd(); G.$('home').fire('click');
  const m = JSON.parse(G.ls.get('powder.meta.v1')); m.sel = 'moguls'; G.ls.set('powder.meta.v1', JSON.stringify(m));
});

test('game smoke: moguls run has moguls and ice', () => {
  const G = runGame({ 'powder.meta.v1': JSON.stringify({ v: 1, migrated: true, sel: 'moguls', stats: { missionsDone: 3 } }) });
  G.flush(); G.frame();
  G.$('start').fire('click'); G.flush();
  assert.equal(G.state().run, 'moguls');
  let sawMogul = false, sawIce = false;
  for (let i = 0; i < 4000 && G.state().mode !== 'end'; i++) { const n = G.state().next; if (n.some(o => o.kind === 'mogul')) sawMogul = true; if (n.some(o => o.kind === 'ice')) sawIce = true; G.frame(100); G.flush(); }
  assert.ok(sawMogul && sawIce);
});

console.log(`\n${passed} tests passed`);
