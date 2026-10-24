// Headless smoke test: runs every inline script of index.html against a fake DOM and a stub WebGL context,
// then plays a daily run (autopilot), its retry with the ghost, a classic run, and the collection sheet.
// Run: node --max-old-space-size=768 --experimental-vm-modules tests/smoke.test.mjs
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const html = fs.readFileSync(fileURLToPath(new URL('../index.html', import.meta.url)), 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const initial = new Map();
for (const m of html.matchAll(/<[a-z0-9]+\s([^>]*?)>/g)) {
  const id = m[1].match(/\bid="([^"]+)"/); if (!id) continue;
  const cls = m[1].match(/\bclass="([^"]*)"/);
  initial.set(id[1], { classes: cls ? cls[1].split(/\s+/).filter(Boolean) : [], hidden: /\shidden(\s|$|>)/.test(' ' + m[1] + ' ') || /\bhidden\b(?!=)/.test(m[1].replace(/class="[^"]*"/, '')) });
}
const listeners = { window: {}, document: {} };
const on = (bag, type, fn, capture) => (bag[type] ||= []).push({ fn, capture: !!capture });
function el(id) {
  const init = initial.get(id) || { classes: [], hidden: false };
  const classes = new Set(init.classes), own = {};
  const e = {
    id, hidden: init.hidden, textContent: '', innerHTML: '', style: {}, dataset: {}, scrollTop: 0, offsetParent: {}, attrs: {},
    classList: { add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c), toggle: (c, f) => { const v = f === undefined ? !classes.has(c) : !!f; v ? classes.add(c) : classes.delete(c); return v; } },
    setAttribute(k, v) { this.attrs[k] = String(v); }, removeAttribute(k) { delete this.attrs[k]; }, getAttribute(k) { return this.attrs[k] ?? null; },
    addEventListener(type, fn) { (own[type] ||= []).push(fn); }, fire(type, ev) { for (const fn of own[type] || []) fn(ev); },
    focus() { doc.activeElement = this; }, blur() {}, closest: () => null, contains: () => true,
    querySelector: () => null, querySelectorAll: () => [], get lastElementChild() { return el(id + ':last'); }, appendChild() {}, remove() {}
  };
  return e;
}
const els = new Map();
const byId = id => { if (!els.has(id)) els.set(id, el(id)); return els.get(id); };
// Stub WebGL: every call is a no-op; uniform values are recorded by name.
const uniforms = {}; let draws = 0, depthMaskOff = 0;
const gl = new Proxy({}, { get(_, prop) {
  if (typeof prop === 'string' && /^[A-Z_0-9]+$/.test(prop)) return 1;
  switch (prop) {
    case 'getShaderParameter': case 'getProgramParameter': return () => true;
    case 'getAttribLocation': { let n = 0; return () => n++ % 3; }
    case 'getUniformLocation': return (_, name) => ({ name });
    case 'uniform3fv': case 'uniform4fv': return (loc, v) => { uniforms[loc.name] = Array.from(v); };
    case 'drawArrays': return () => { draws++; };
    case 'depthMask': return f => { if (!f) depthMaskOff++; };
    case 'getError': return () => 0;
    default: return () => ({});
  }
} });
byId('world').getContext = () => gl;
const store = new Map([['flappy-fp-v1-best-classic', '3']]);
const localStorage = { getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
let rafCb = null; const scoreCalls = [], boardCalls = [];
const doc = {
  getElementById: byId, body: byId('body'), documentElement: {}, activeElement: byId('body'), fullscreenEnabled: false, hidden: false,
  addEventListener: (t, f, c) => on(listeners.document, t, f, c), contains: () => true, createElement: () => byId('tmp' + Math.random())
};
function page() {
  const w = {
    document: doc, localStorage, btoa, atob, console, Math, JSON, Date, Object, Array, Map, Set, Float32Array, Uint16Array, Number, String, Promise,
    innerWidth: 390, innerHeight: 844, devicePixelRatio: 3, navigator: {}, isSecureContext: false,
    matchMedia: () => ({ matches: false }), performance: { now: () => now },
    requestAnimationFrame: cb => { rafCb = cb; return 1; }, setTimeout: () => 0,
    addEventListener: (t, f, c) => on(listeners.window, t, f, c),
    Ludvig: { score: (b, v) => { scoreCalls.push([b, v]); return Promise.resolve({ ok: false }); }, ui: { board: (elm, o) => { boardCalls.push(o); return { destroy() {} }; }, open() {} } }
  };
  w.window = w;
  vm.createContext(w);
  for (const code of scripts) vm.runInContext(code, w);
  return w;
}
let now = 0;
let win = page();
const F = win.__flappy, M = win.FlapMeta;
const snap = () => win.__flappy.snapshot();
const frames = (n, autopilot) => { for (let i = 0; i < n; i++) { now += 1000 / 60; if (autopilot) pilot(); rafCb(now); } };
function key(code) {
  let stopped = false;
  const ev = { code, key: code, repeat: false, shiftKey: false, target: doc.activeElement, preventDefault() {}, stopPropagation() { stopped = true; } };
  for (const l of listeners.window.keydown || []) { if (l.capture) l.fn(ev); if (stopped) return; }
  for (const l of listeners.document.keydown || []) { l.fn(ev); if (stopped) return; }
}
let stopAt = 6;
function pilot() {
  const s = snap(); if (s.state !== 'playing' || s.score >= stopAt) return;
  const next = s.pipes.filter(p => p.z < 1.5 && !p.scored).sort((a, b) => b.z - a.z)[0];
  const target = next ? next.center - 0.6 : 6;
  if (s.y < target && s.vy < 1) key('Space');
}
const ev = (target = null) => ({ stopPropagation() {}, preventDefault() {}, target: target || { closest: () => null } });
const playUntilDead = (limit = 6) => { stopAt = limit; let i = 0; while (snap().state === 'playing' && i++ < 60 * 120) frames(1, true); frames(40); };
let checks = 0; const ok = (c, m) => { assert.ok(c, m); checks++; };

frames(5);
ok(snap().state === 'menu' && M, 'menu with meta layer');
ok(byId('daily-btn').hidden === false && byId('coll-btn').hidden === false, 'daily and collection buttons shown');
ok(JSON.stringify(uniforms.uSkyLo) === JSON.stringify([.86, .93, .80]), 'lagoon sky uniforms set');

// Daily run 1 (autopilot), then crash.
byId('daily-btn').fire('click', ev());
let s = snap();
ok(s.state === 'playing' && s.daily === true && s.mode === 'classic' && s.seed === M.dailySeed(M.dateKey()), 'daily run uses classic physics and the shared seed');
ok(s.world === M.dailyWorld(M.dateKey()), 'daily world twist applied');
playUntilDead();
s = snap();
const today = JSON.parse(store.get('flappy-fp-daily-v1'));
ok(today.tries === 1 && today.best === s.score, 'daily best saved: ' + s.score);
ok(store.get('flappy-fp-v1-best-classic') === '3', 'daily run did not touch the classic best key');
ok(store.has('flappy-fp-ghost-v1'), 'ghost saved');
ok(byId('results').classList.contains('hidden') === false, 'results shown');
ok(byId('final-best-label').textContent === 'TODAY', 'results label TODAY');
ok(byId('result-note').textContent === '1 try today', 'tries line');
ok(boardCalls.at(-1).board === 'flappy-first-person:daily' && JSON.stringify(boardCalls.at(-1).periods) === '["7d"]', 'daily board on results');
if (s.score > 0) ok(scoreCalls.some(([b, v]) => b === 'flappy-first-person:daily' && v === s.score), 'daily score submitted');
console.log('daily run 1 score', s.score, 'news:', byId('result-news').textContent || '(none)');

// Retry: ghost replays (drawn with depth writes off).
const before = depthMaskOff;
byId('retry-btn').fire('click', ev());
s = snap();
ok(s.daily && s.ghostSamples > 1, 'ghost loaded on retry: ' + s.ghostSamples);
stopAt = 9; frames(30, true);
ok(depthMaskOff > before, 'ghost/mark pass ran');
playUntilDead(9);
ok(JSON.parse(store.get('flappy-fp-daily-v1')).tries === 2, 'second try counted');

// Menu, then a classic run with the best-distance gate.
byId('home-btn').fire('click', ev());
s = snap();
ok(s.state === 'menu' && !s.daily && s.world === 'lagoon', 'home restores equipped world');
byId('start-btn').fire('click', ev());
ok(snap().daily === false && snap().mode === 'classic', 'normal start is not daily');
playUntilDead();
s = snap();
const meta = JSON.parse(store.get('flappy-fp-meta-v1'));
ok(meta.stats.runs >= 3 + 1, 'runs counted incl. migration: ' + meta.stats.runs);
ok(byId('final-best-label').textContent === 'BEST' && byId('result-note').hidden === true, 'classic results unchanged');
console.log('classic run score', s.score, 'best key', store.get('flappy-fp-v1-best-classic'));

// Collection: open, equip, toggle ghost, Escape closes without touching gameplay.
byId('home-btn').fire('click', ev());
byId('coll-btn').fire('click', ev());
ok(!byId('collection').classList.contains('hidden') && byId('coll-body').innerHTML.includes('class="mission"'), 'collection opens with missions');
const tile = data => ({ closest: sel => sel === '[data-equip]' ? { dataset: { equip: data } } : null });
byId('coll-body').fire('click', ev(tile('world:night')));
ok(snap().world === 'lagoon', 'locked world not equipped');
console.log('first page ok; draws', draws);
key('Escape');
ok(byId('collection').classList.contains('hidden') && snap().state === 'menu', 'Escape closes the sheet');

const toggle = { closest: sel => sel === '#ghost-toggle' ? {} : null };
byId('coll-btn').fire('click', ev());
const ghostBefore = JSON.parse(store.get('flappy-fp-meta-v1')).ghost;
byId('coll-body').fire('click', ev(toggle));
ok(JSON.parse(store.get('flappy-fp-meta-v1')).ghost === !ghostBefore, 'ghost toggle persists');
key('Space');
ok(snap().state === 'menu', 'Space inside the sheet does not start a run');
key('Escape');

// Fresh page load: equipped unlocks apply, and worlds change uniforms.
{
  const state = JSON.parse(store.get('flappy-fp-meta-v1'));
  state.unlocked.push('night', 'raven'); store.set('flappy-fp-meta-v1', JSON.stringify(state));
  const M2 = win.FlapMeta; const st = M2.load();
  ok(M2.equip(st, 'world', 'night') && M2.equip(st, 'bird', 'raven'), 'equip unlocked items');
}
for (const k of Object.keys(listeners.window)) listeners.window[k] = []; for (const k of Object.keys(listeners.document)) listeners.document[k] = [];
els.clear(); byId('world').getContext = () => gl; doc.body = byId('body');
win = page();
frames(3);
s = win.__flappy.snapshot();
ok(s.world === 'night' && s.skin === 'raven', 'equipped world and bird applied on load');
ok(byId('body').classList.contains('world-dark'), 'dark world class');
ok(JSON.stringify(uniforms.uSkyLo) !== JSON.stringify([.86, .93, .80]), 'night sky uniforms set');
console.log(`\n${checks} smoke checks passed`);
