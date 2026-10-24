// Runs the real game script in node with stubbed DOM and WebGL to exercise the meta hooks.
// node --max-old-space-size=768 --experimental-vm-modules source-games/slope-overdrive/tests/game-smoke.test.mjs
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const game = scripts[scripts.length - 1];
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);

function makeEl(id) {
  const listeners = {};
  const cls = new Set();
  const el = {
    id, hidden: id === 'collection' || id === 'gameover' || id === 'paused' || id === 'settings', style: {}, dataset: {}, textContent: '', innerHTML: '', value: '', checked: false, title: '',
    children: [makeEl0(), makeEl0(), makeEl0()],
    classList: { add: c => cls.add(c), remove: c => cls.delete(c), toggle: (c, on) => { (on ?? !cls.has(c)) ? cls.add(c) : cls.delete(c); }, contains: c => cls.has(c) },
    addEventListener: (t, f) => { (listeners[t] ||= []).push(f); }, listeners,
    setAttribute() {}, focus() {}, blur() {}, remove() {}, setPointerCapture() {},
    closest: () => null, querySelector: () => null, getContext: () => glStub,
  };
  return el;
}
function makeEl0() { return { style: {} }; }
let blends = 0;
const glStub = new Proxy({}, {
  get: (_, k) => {
    if (typeof k !== 'string') return undefined;
    if (k === 'blendFunc') return () => { blends++; };
    if (/^[A-Z0-9_]+$/.test(k)) return 1;
    if (k === 'getShaderParameter' || k === 'getProgramParameter') return () => true;
    if (k === 'getParameter') return () => 2;
    if (k === 'checkFramebufferStatus') return () => 1;
    if (k === 'getError') return () => 0;
    return () => ({});
  },
});
const els = Object.fromEntries(ids.map(id => [id, makeEl(id)]));
const store = {};
const localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
let raf = null; const winListeners = {};
const scored = [];
const boards = [];
const ctx = {
  console: { ...console, warn() {} }, Math, JSON, Date, Number, String, Array, Object, Set, Map, Float32Array, Int32Array, Uint32Array, Uint8Array, Error, URLSearchParams, Promise, RegExp, Buffer,
  document: { getElementById: id => els[id] || (els[id] = makeEl(id)), body: makeEl('body'), documentElement: {}, hidden: false, addEventListener() {}, fullscreenEnabled: false },
  localStorage, location: { search: '?test' }, navigator: {}, devicePixelRatio: 2, innerWidth: 390, innerHeight: 844,
  matchMedia: () => ({ matches: true }), performance: { now: () => 0 }, requestAnimationFrame: f => { raf = f; }, setTimeout: () => 0, clearTimeout() {},
  addEventListener: (t, f, cap) => { (winListeners[t] ||= []).push({ f, cap }); },
  crypto: { getRandomValues: a => { a[0] = 12345; return a; } },
  HTMLInputElement: function () {}, HTMLSelectElement: function () {},
  Ludvig: { score: (b, v) => { scored.push([b, v]); return Promise.resolve({ ok: false }); }, ui: { board: (el, o) => { boards.push(o); return { destroy() {} }; }, open() {} } },
};
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(game, ctx);
const T = ctx.gameTest;
assert.ok(T, 'game booted in test mode');
const frame = n => { for (let i = 0; i < n; i++) raf(16.7 * (i + 1)); };
frame(3);

// Endless run: main best moves, daily board untouched.
T.start('endless'); T.advance(1); frame(2); T.die('x'); T.advance(1);
assert.equal(T.state, 'over');
const endlessScore = T.score;
assert.equal(blends, 0, 'no ghost in endless');
let main = JSON.parse(store['ludvig-games:slope-overdrive:slope-overdrive-v1'] || store['slope-overdrive-v1']);
assert.equal(main.best, endlessScore);
assert.equal(boards.at(-1).board, 'slope-overdrive');
assert.equal(scored.length, 0, 'endless relies on the score bridge');

// Daily run: seed from the meta layer, best not raised, daily board + submit.
const bestBefore = main.best;
T.start('daily'); const daySeed = T.seed; T.advance(6); frame(3); T.die('x'); T.advance(1);
main = JSON.parse(store['slope-overdrive-v1']);
assert.equal(main.best, bestBefore, 'daily never writes main best');
assert.ok(T.score > bestBefore, 'daily run was longer than the endless one');
assert.deepEqual(scored.at(-1), ['slope-overdrive:daily', T.score]);
assert.equal(boards.at(-1).board, 'slope-overdrive:daily'); assert.equal(boards.at(-1).periods[0], '7d');
assert.equal(els.finalBestLabel.textContent, "TODAY'S BEST");
assert.equal(els.finalTries.textContent, '1 TRY');
const ghost = JSON.parse(store['slope-overdrive-ghost-v1']);
assert.equal(ghost.seed, daySeed); assert.ok(ghost.n > 50, 'ghost recorded');
const metaSave = JSON.parse(store['slope-overdrive-meta-v1']);
assert.equal(metaSave.daily.tries, 1);

// Second daily: same course, ghost loaded and drawn without errors, tries counted.
const b0 = blends; T.start('daily'); assert.equal(T.seed, daySeed); T.advance(3); frame(5); assert.ok(blends > b0, 'ghost drawn'); T.pause(); frame(2); T.resume(); T.die('x'); T.advance(1);
assert.equal(els.finalTries.textContent, '2 TRIES');
assert.equal(JSON.parse(store['slope-overdrive-ghost-v1']).score, ghost.score, 'shorter run keeps the better ghost');

// Collection sheet opens, renders, equips, closes on Escape.
T.menu(); els.metaBtn.onclick(); assert.equal(els.collection.hidden, false);
assert.ok(els.metaBody.innerHTML.includes('MISSIONS') && els.metaBody.innerHTML.includes('BADGES'));
const esc = { code: 'Escape', preventDefault() {}, stopPropagation() {} };
for (const l of winListeners.keydown.filter(l => l.cap)) l.f(esc);
assert.equal(els.collection.hidden, true);
// Endless run after a best shows the best mark path without errors.
T.start('endless'); T.advance(2); frame(3); T.die('x'); T.advance(1);
console.log('game smoke ok', { endlessScore, daily: metaSave.daily, ghostSamples: ghost.n, ghostBytes: store['slope-overdrive-ghost-v1'].length });
