// Smoke test: runs the whole game script against a tiny stub DOM and plays campaign, Reel 2, Daily and Reshoot.
// Run: node --max-old-space-size=768 --experimental-vm-modules tests/smoke.test.mjs
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const html = fs.readFileSync(fileURLToPath(new URL('../index.html', import.meta.url)), 'utf8');
const code = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const ctx2d = new Proxy({}, { get: (t, k) => k in t ? t[k] : (k === 'createRadialGradient' || k === 'createLinearGradient') ? () => ({ addColorStop() {} }) : () => {}, set: (t, k, v) => { t[k] = v; return true; } });
const els = {};
function initialClasses(id) { const m = html.match(new RegExp('<[^>]*\\sid="' + id + '"[^>]*>')); if (!m) return null; const c = m[0].match(/class="([^"]*)"/); return { cls: c ? c[1].split(/\s+/) : [], hidden: /\shidden[\s>]/.test(m[0]) }; }
function makeEl(id, info = { cls: [], hidden: false }) {
  const set = new Set(info.cls), L = {};
  const el = { id, hidden: info.hidden, disabled: false, textContent: '', innerHTML: '', style: {}, dataset: {}, _l: L,
    classList: { add: (...c) => c.forEach(x => set.add(x)), remove: (...c) => c.forEach(x => set.delete(x)), toggle: (c, f) => { (f ?? !set.has(c)) ? set.add(c) : set.delete(c); }, contains: c => set.has(c) },
    addEventListener: (n, f) => { (L[n] ||= []).push(f); }, focus() { doc.activeElement = el; }, setAttribute() {}, setPointerCapture() {},
    getBoundingClientRect: () => ({ width: 390, height: 700 }), getContext: () => ctx2d, closest: () => null, querySelector: () => null,
    fire(n, extra = {}) { const e = { target: el, stopPropagation() {}, preventDefault() {}, ...extra }; (L[n] || []).forEach(f => f(e)); } };
  return el;
}
const doc = { activeElement: null, fullscreenEnabled: false, documentElement: {}, hidden: false,
  getElementById(id) { if (!els[id]) { const info = initialClasses(id); assert.ok(info, 'missing element #' + id); els[id] = makeEl(id, info); } return els[id]; },
  querySelector: s => (els['q:' + s] ||= makeEl('q:' + s)), querySelectorAll: () => [], createElement: () => makeEl('canvas'), addEventListener() {} };
const winL = {}; let raf = null, now = 0;
const store = { 'osf-best': '0' }, writes = [];
const scores = [];
const win = { devicePixelRatio: 2, addEventListener: (n, f, cap) => { (winL[n] ||= []).push({ f, cap }); }, matchMedia: () => ({ matches: false }),
  Ludvig: { score: (b, v) => { scores.push([b, v]); return Promise.resolve({ ok: false }); }, ui: { board: (el, o) => ({ o, destroy() {} }), open() {} } } };
const sandbox = { window: win, document: doc, navigator: {}, performance: { now: () => now }, requestAnimationFrame: f => { raf = f; },
  ResizeObserver: class { observe() {} }, localStorage: { getItem: k => k in store ? store[k] : null, setItem: (k, v) => { writes.push(k); store[k] = String(v); } }, console, Math, Date, JSON };
sandbox.globalThis = sandbox; win.document = doc;
vm.createContext(sandbox);
vm.runInContext(code, sandbox);
const O = win.__OSF, G = O.state, $ = id => doc.getElementById(id);
const frames = (n, dt = 1 / 60) => { for (let i = 0; i < n; i++) { now += dt * 1000; raf(now); } };
function land() {
  G.mode = 'playing'; const L = G.sc, p = O.lander, idx = G.padIdx;
  const tx = L.pads ? L.pads[G.padIdx].x : L.dolly ? L.padX + L.dolly.amp * Math.sin(G.clock * L.dolly.speed) : L.padX;
  Object.assign(p, { x: tx, y: 605, vx: 0, vy: 8, angle: 0, av: 0 });
  for (let i = 0; i < 120 && G.mode === 'playing' && G.padIdx === idx; i++) O.step(1 / 120);
}
function crash() { G.mode = 'playing'; Object.assign(O.lander, { x: 300, y: 560, vx: 0, vy: 140, angle: 0 }); for (let i = 0; i < 200 && G.mode === 'playing'; i++) O.step(1 / 120); }
const toResult = () => { frames(150); assert.equal(G.mode, 'result'); };
let n = 0; const ok = s => { n++; console.log('ok', s); };

frames(10); ok('home renders');
$('startBtn').fire('click'); assert.equal(G.run, 'campaign'); assert.equal(G.mode, 'armed'); frames(5);
for (let lv = 0; lv < 5; lv++) { land(); assert.equal(G.mode, 'landed', 'landed scene ' + (lv + 1)); toResult(); if (lv < 4) { $('nextBtn').fire('click'); assert.equal(G.level, lv + 1); frames(3); } }
assert.equal($('resultTag').textContent, 'ALL FIVE SCENES DONE');
assert.ok(Number(store['osf-best']) > 0, 'campaign writes osf-best'); const best = store['osf-best'];
assert.equal(O.meta.sceneUnlocked(5), true); assert.match($('metaNews').textContent, /UNLOCKED|BADGE|MISSION/);
assert.equal(els.metaDot.hidden, false, 'collection dot shows'); ok('campaign plays through, unlocks scene 06');

// collection sheet from home
$('retryBtn').fire('click'); assert.equal(G.mode, 'home');
$('metaBtn').fire('click', { stopPropagation() {} }); assert.equal($('metaSheet').classList.contains('hidden'), false);
assert.match($('metaUnlocks').innerHTML, /data-u="s6"(?![^>]*disabled)/); assert.equal(els.metaDot.hidden, true);
const kd = winL.keydown.find(l => l.cap); let stopped = false; kd.f({ key: 'Enter', code: 'Enter', stopPropagation() { stopped = true; }, preventDefault() {} }); assert.ok(stopped, 'keys blocked while open');
kd.f({ key: 'Escape', code: 'Escape', stopPropagation() {}, preventDefault() {} }); assert.equal($('metaSheet').classList.contains('hidden'), true); ok('collection opens, blocks keys, Escape closes');

// Reel 2 via the scene tile
$('metaBtn').fire('click', { stopPropagation() {} });
const tile = s => ({ dataset: { u: s }, disabled: false });
$('metaUnlocks').fire('click', { target: { closest: () => tile('s6') } }); assert.equal(G.run, 'reel'); assert.equal(G.level, 5); assert.equal(G.sc.name, 'DOLLY GRIP');
frames(20); land(); assert.equal(G.mode, 'landed'); toResult(); assert.match($('bestLabel').textContent, /^SCENE BEST/);
$('nextBtn').fire('click'); assert.equal(G.level, 6); assert.ok(G.sc.gust); G.mode = 'playing'; for (let i = 0; i < 600; i++) { O.step(1 / 120); if (G.mode !== 'playing') break; } frames(5);
G.mode = 'armed'; land(); assert.equal(G.mode, 'landed'); toResult(); $('nextBtn').fire('click'); assert.equal(G.level, 7); assert.ok(G.sc.ceil);
frames(5); G.mode = 'playing'; Object.assign(O.lander, { y: G.sc.ceil + 60, vy: -40 }); for (let i = 0; i < 60 && G.mode === 'playing'; i++) O.step(1 / 120);
assert.equal(G.mode, 'crashed'); assert.match(G.result.reason, /lighting rig/); toResult(); $('nextBtn').fire('click'); assert.equal(G.level, 7);
land(); toResult(); $('nextBtn').fire('click'); assert.equal(G.level, 8); assert.ok(G.sc.pads);
land(); assert.equal(G.mode, 'playing', 'first mark does not end the take'); assert.equal(G.padIdx, 1); for (let i = 0; i < 30; i++) O.step(1 / 120); assert.equal(G.mode, 'playing', 'rests on mark 1');
frames(5); land(); assert.equal(G.mode, 'landed'); toResult(); $('nextBtn').fire('click'); assert.equal(G.level, 9); assert.ok(G.sc.dark);
frames(20); land(); toResult(); assert.equal($('resultTag').textContent, 'ALL TEN SCENES DONE'); assert.equal(store['osf-best'], best, 'reel never writes osf-best');
ok('Reel 2: dolly, gust, low rig crash, two marks, lights out');

// Daily
$('retryBtn').fire('click'); $('dailyBtn').fire('click'); assert.equal(G.run, 'daily'); assert.match(G.sc.name, /^DAILY · /);
const dailyJson = JSON.stringify({ ...G.sc, name: '' }); frames(20); crash(); toResult(); assert.match($('bestLabel').textContent, /TODAY: 0 · 1 TRY/);
$('nextBtn').fire('click'); assert.equal(JSON.stringify({ ...G.sc, name: '' }), dailyJson, 'same take on retry'); land(); toResult();
assert.equal(scores.length, 1); assert.equal(scores[0][0], 'one-small-fake:daily'); assert.ok(Number.isInteger(scores[0][1]) && scores[0][1] > 0);
assert.match($('bestLabel').textContent, /· 2 TRIES/); assert.equal(store['osf-best'], best, 'daily never writes osf-best'); assert.equal($('resultBoard').hidden, false);
ok('Daily: seeded take, tries, best, board submit, osf-best untouched');

// Reshoot
$('retryBtn').fire('click'); $('reshootBtn').fire('click'); assert.equal(G.run, 'reshoot'); assert.match(G.sc.name, /^RESHOOT · /);
let total = 0; for (let k = 0; k < 6; k++) { frames(3); land(); assert.equal(G.mode, 'landed', 'reshoot take ' + k); total += G.result.score; toResult(); assert.equal($('statLabel3').textContent, 'RUN SCORE'); $('nextBtn').fire('click'); }
frames(3); crash(); toResult(); assert.equal($('resultTag').textContent, 'RESHOOT OVER'); assert.equal($('resultScore').textContent, total.toLocaleString());
assert.equal(O.meta.state().stats.reshootBest, total); assert.equal(O.meta.state().stats.reshootBestTakes, 6); assert.equal(store['osf-best'], best, 'reshoot never writes osf-best');
assert.equal($('resultBoard').hidden, true); $('nextBtn').fire('click'); assert.equal(G.reshoot.take, 0, 'new run');
ok('Reshoot: endless takes, run score, local best, osf-best untouched');

// equip a skin and render
O.meta.state().stats.landings = 40; O.meta.equip('silver'); O.meta.equip('tinsel'); $('metaUnlocks').fire('click', { target: { closest: () => tile('ufo') } }); frames(10);
assert.equal(O.meta.equipped().dress, 'ufo'); assert.equal(O.meta.equipped().skin, 'silver');
assert.ok(!writes.some(k => k !== 'osf-best' && k !== 'osf-meta' && k !== 'osf-muted'), 'only known keys written');
ok('equip skin and dressing, render');
console.log(n + ' smoke checks passed');
