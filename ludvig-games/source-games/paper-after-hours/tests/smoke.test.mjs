// Whole-page smoke test with a fake DOM and a fake WebGL context.
// Run: node --max-old-space-size=768 --experimental-vm-modules tests/smoke.test.mjs
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const html = fs.readFileSync(fileURLToPath(new URL('../index.html', import.meta.url)), 'utf8');
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m => m[1]);

const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
function el(id = '') {
  const listeners = {};
  const e = {
    id, hidden: /hidden/.test((html.match(new RegExp('id="' + id + '"[^>]*>')) || [''])[0]), textContent: '', innerHTML: '', className: '', title: '', type: '',
    children: [], style: {}, dataset: {}, attrs: {}, listeners,
    classList: { set: new Set(), add(c) { this.set.add(c); }, remove(c) { this.set.delete(c); }, toggle(c, on) { on ? this.set.add(c) : this.set.delete(c); }, contains(c) { return this.set.has(c); } },
    setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return this.attrs[k] ?? null; },
    addEventListener(t, f) { (listeners[t] ||= []).push(f); },
    append(...c) { this.children.push(...c); }, appendChild(c) { this.children.push(c); return c; },
    querySelector() { return dot; }, querySelectorAll() { return this.children; },
    focus() { doc.activeElement = e; }, blur() {}, contains() { return true; }, closest() { return null; },
    animate() {}, hasPointerCapture() { return false; }, setPointerCapture() {}, releasePointerCapture() {},
    click() { for (const f of listeners.click || []) f({ stopPropagation() {}, target: e }); if (e.onclick) e.onclick(); },
    getContext(kind) { return kind === '2d' ? fakeCtx2d : fakeGL; }, width: 0, height: 0,
  };
  return e;
}
const dot = el('dot');
const glCalls = { deleteBuffer: 0, createBuffer: 0 };
const fakeGL = new Proxy({}, { get(_, k) {
  if (typeof k !== 'string') return undefined;
  if (/^[A-Z_0-9]+$/.test(k)) return k;
  if (k === 'checkFramebufferStatus') return () => 'FRAMEBUFFER_COMPLETE';
  if (k === 'getShaderParameter' || k === 'getProgramParameter') return () => true;
  if (k === 'getAttribLocation') return () => 0;
  if (k in glCalls) return () => { glCalls[k]++; return {}; };
  return () => ({});
} });
const fakeCtx2d = new Proxy({}, { get: (_, k) => (k === 'fillStyle' || k === 'strokeStyle' || k === 'lineWidth') ? '' : () => {}, set: () => true });
const els = Object.fromEntries(ids.map(i => [i, el(i)]));
const doc = {
  activeElement: null, hidden: false, body: el('body'),
  getElementById: i => els[i] || null, createElement: () => el(), addEventListener() {}, contains: () => true,
};
const store = { data: { 'paper.afterhours.best.classic': '6' }, writes: [], getItem(k) { return k in this.data ? this.data[k] : null; }, setItem(k, v) { this.writes.push(k); this.data[k] = String(v); } };
const winListeners = {};
const scores = [];
const ctx = {
  document: doc, localStorage: store, innerWidth: 390, innerHeight: 844, devicePixelRatio: 3,
  performance: { now: () => Date.now() }, matchMedia: () => ({ matches: false }),
  requestAnimationFrame: () => 1, cancelAnimationFrame() {}, Element: class {},
  addEventListener(t, f, cap) { (winListeners[t] ||= []).push({ f, cap }); },
  Ludvig: { score: (b, v) => { scores.push([b, v]); return Promise.resolve({ ok: false }); }, ui: { board: () => ({ destroy() {} }), open() {} } },
  console,
};
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
for (const s of scripts) vm.runInContext(s, ctx);
const run = code => vm.runInContext(code, ctx);

assert.equal(run('typeof renderer'), 'object');
assert.notEqual(els.failure.style.display, 'flex', 'no failure screen');
assert.equal(run('PaperMeta.state.stats.bestStreak'), 6, 'migrated best');
assert.equal(els.dailyTwist.textContent.length > 0, true);

// Daily wind and bin sequence is the same twice.
const seq = () => run(`(()=>{const out=[];for(let n=0;n<12;n++){game.shots=n;configureShot();out.push([+game.wind.toFixed(6),+game.bin.x.toFixed(6),+game.bin.z.toFixed(6)])}game.shots=0;configureShot();return JSON.stringify(out)})()`);
els.dailyBtn.click();
assert.equal(run('game.daily'), true);
assert.equal(run('game.easy'), false);
assert.equal(doc.body.dataset.daily, 'true');
assert.equal(els.bestLabel.textContent, 'Today');
const a = seq(), b = seq();
assert.equal(a, b, 'daily sequence deterministic');

// Play a daily run: 3 scores then 3 misses, then finish.
const writesBefore = store.writes.length;
run(`for(let i=0;i<3;i++){game.ball={p:[0,1,0],v:[0,0,0],rotation:[0,0,0],spin:[0,0,0],bin:{...game.bin},wind:game.wind,age:1,resolved:false,scored:false,floorAge:-1,contacts:0,rim:0,retired:false};resolve(true,game.ball)}
for(let i=0;i<3;i++){game.ball={p:[0,1,0],v:[0,0,0],rotation:[0,0,0],spin:[0,0,0],bin:{...game.bin},wind:game.wind,age:1,resolved:false,scored:false,floorAge:-1,contacts:0,rim:.5,retired:false};resolve(false,game.ball)}
finish()`);
const newWrites = store.writes.slice(writesBefore);
assert.ok(!newWrites.some(k => k.startsWith('paper.afterhours.best')), 'daily never writes best keys: ' + newWrites);
assert.equal(store.data['paper.afterhours.best.classic'], '6');
assert.equal(els.metaDaily.hidden, false);
assert.equal(els.metaDaily.textContent, 'Today 3 · 1 try');
assert.deepEqual(scores.at(-1), ['paper-after-hours:daily', 3]);
assert.equal(run('lgId()'), 'paper-after-hours:daily');

// Back to the menu restores normal mode and the classic best.
els.menuBtn.click();
assert.equal(run('game.daily'), false);
assert.equal(run('game.best'), 6);
assert.equal(run('game.phase'), 'title');
assert.equal(els.startScreen.classList.contains('hidden'), false);

// Normal run still writes the classic best through the existing save().
run(`start();for(let i=0;i<8;i++){game.ball={p:[0,1,0],v:[0,0,0],rotation:[0,0,0],spin:[0,0,0],bin:{...game.bin},wind:2.6,age:1,resolved:false,scored:false,floorAge:-1,contacts:0,rim:0,retired:false};resolve(true,game.ball)}finish()`);
assert.equal(store.data['paper.afterhours.best.classic'], '8');
assert.equal(run('PaperMeta.state.stats.runs'), 2);

// Collection opens, renders, equips an unlocked room and rebuilds GPU buffers.
run('goMenu()');
els.metaBtn.click();
assert.equal(els.metaScreen.classList.contains('hidden'), false);
assert.equal(els.metaMissions.children.length, 3);
assert.equal(els.metaRooms.children.length, 5);
assert.equal(els.metaPapers.children.length, 6);
assert.equal(els.metaBadges.children.length, 9);
const night = els.metaRooms.children[1];
assert.equal(night.attrs['aria-disabled'], undefined, 'Late night unlocked by streak 6');
const del = glCalls.deleteBuffer;
night.click();
assert.equal(run('PaperMeta.state.room'), 'night');
assert.ok(glCalls.deleteBuffer > del, 'old buffers deleted on rebuild');
assert.equal(run('renderer.buffers.length'), 10, 'same mesh count after rebuild, no leak');
const locked = els.metaRooms.children[4];
locked.click();
assert.equal(run('PaperMeta.state.room'), 'night', 'locked tile does nothing');
// Escape closes the sheet and does not reach the game.
const keyCapture = winListeners.keydown.find(l => l.cap).f;
let stopped = false;
keyCapture({ key: 'Escape', preventDefault() {}, stopPropagation() { stopped = true; } });
assert.equal(stopped, true);
assert.equal(els.metaScreen.classList.contains('hidden'), true);
run('draw()');
// Every room and paper type builds (unlock all in this sandbox only).
run("for(const x of [...PaperMeta.rooms,...PaperMeta.papers])if(x.req&&!PaperMeta.state.unlocked.includes(x.id))PaperMeta.state.unlocked.push(x.id)");
for (const id of ['server', 'sunset', 'boss', 'office', 'sticky', 'receipt', 'plane', 'blueprint', 'news', 'ball']) {
  assert.equal(run(`PaperMeta.equip('${id}')`), true, id);
  run('metaRebuild()');
  assert.equal(run('renderer.buffers.length'), 10, id);
  assert.ok(run('meshes.ball.count') > 0, id);
  const data = run('paperMeshData()');
  assert.ok(data.length % 27 === 0 && data.every(Number.isFinite), 'paper mesh ' + id);
  run('draw()');
}
console.log('smoke ok');
