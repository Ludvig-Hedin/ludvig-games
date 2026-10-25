/* Runs the real index.html game script in node: fake DOM, real three.js math with a stub renderer, and a fake
   Ludvig.mp relay so two "browsers" can play a full online round. Run with:
   node --experimental-vm-modules --test tests/smoke.test.mjs */
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const REAL_THREE = await import(path.join(DIR, 'vendor/three.module.js'));
const LOGIC = await import(path.join(DIR, 'logic.js'));
const html = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
const SCRIPT = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
const HOOK = `\nglobalThis.__cv={get session(){return session},get net(){return net},get progress(){return progress},get profile(){return profile},get preview(){return preview},set preview(v){preview=v},transitionTo,goOnline,keys,touch,hostTick,startRace,castVote,playEmote,say,unlockPreview,renderSwatches,cards,FEATURED};`;

const anything = () => new Proxy(function () {}, {
  get: (t, k) => k === Symbol.toPrimitive ? () => 0 : k === 'width' ? 40 : k === 'then' ? undefined : anything(),
  apply: () => anything(), set: () => true
});

function makeBrowser({clock, hub, name, coarse = false}) {
  const timers = [], elements = new Map(), errors = [];
  let rafCb = null, timerId = 0;
  const listeners = {};
  class El {
    constructor(tag = 'div', id = '') { Object.assign(this, {tag, id, children: [], parent: null, hidden: false, open: false, textContent: '', innerHTML: '', value: '', disabled: false, title: '', dataset: {}, width: 300, height: 150, clientWidth: 400, clientHeight: 800, tabIndex: 0, onclick: null, onsubmit: null}); this.style = {setProperty() {}}; this.attrs = {}; this.cls = new Set(); this.sub = new Map(); this.events = {};
      this.classList = {add: c => this.cls.add(c), remove: (...c) => c.forEach(x => this.cls.delete(x)), contains: c => this.cls.has(c), toggle: (c, f) => { const on = f ?? !this.cls.has(c); on ? this.cls.add(c) : this.cls.delete(c); return on; }}; }
    get firstChild() { return this.children[0] || null; }
    get lastElementChild() { return this.children.at(-1) || this.querySelector(':last'); }
    append(...nodes) { for (const n of nodes) { n.parent = this; this.children.push(n); } }
    replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(c => c !== this); this.parent = null; }
    setAttribute(k, v) { this.attrs[k] = String(v); } getAttribute(k) { return this.attrs[k] ?? null; }
    addEventListener(type, fn) { (this.events[type] ||= []).push(fn); }
    dispatch(type, ev = {}) { for (const fn of this.events[type] || []) fn({preventDefault() {}, stopPropagation() {}, currentTarget: this, target: this, ...ev}); }
    querySelector(sel) { if (!this.sub.has(sel)) this.sub.set(sel, new El(sel === 'canvas' ? 'canvas' : 'div')); return this.sub.get(sel); }
    querySelectorAll() { return []; }
    closest() { return this; }
    getContext() { return anything(); }
    getBoundingClientRect() { return {left: 0, top: 0, right: 400, bottom: 800, width: 400, height: 800}; }
    focus() {} blur() {} setPointerCapture() {} requestPointerLock() {}
    showModal() { this.open = true; } close() { this.open = false; }
  }
  const byId = id => { if (!elements.has(id)) elements.set(id, new El(/Dialog$/.test(id) ? 'dialog' : 'div', id)); return elements.get(id); };
  const dialogs = () => [...elements.values()].filter(e => e.tag === 'dialog');
  const document = {
    getElementById: byId, createElement: tag => new El(tag), body: new El('body'), hidden: false, pointerLockElement: null, exitPointerLock() {},
    querySelector: sel => sel === 'dialog[open]' ? dialogs().find(d => d.open) || null : null,
    querySelectorAll: sel => sel === 'dialog[open]' ? dialogs().filter(d => d.open) : sel === 'dialog' ? dialogs() : [],
    addEventListener: (t, fn) => (listeners['doc:' + t] ||= []).push(fn)
  };
  for (const id of ['detailDialog', 'winDialog', 'onlineDialog', 'roomDialog', 'confirmDialog']) byId(id);
  const store = new Map();
  const localStorage = {getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k)};
  const location = {pathname: '/cubeville/', search: '', origin: 'https://games.test'};
  const scores = [];
  const ctx = {
    document, localStorage, location, console, URLSearchParams, AbortController, queueMicrotask, Promise, Math, JSON, Date, Map, Set, Error,
    history: {replaceState: (_, __, url) => { location.search = url.includes('?') ? url.slice(url.indexOf('?')) : ''; }},
    navigator: {onLine: true}, devicePixelRatio: 2, WebSocket: class {},
    matchMedia: q => ({matches: coarse && /coarse/.test(q)}),
    performance: {now: () => clock.t},
    requestAnimationFrame: fn => { rafCb = fn; return 1; },
    setTimeout: (fn, ms = 0) => { timers.push({id: ++timerId, at: clock.t + ms, fn}); return timerId; },
    clearTimeout: id => { const i = timers.findIndex(t => t.id === id); if (i >= 0) timers.splice(i, 1); },
    setInterval: (fn, ms) => { const t = {id: ++timerId, at: clock.t + ms, fn, every: ms}; timers.push(t); return t.id; },
    clearInterval: id => { const i = timers.findIndex(t => t.id === id); if (i >= 0) timers.splice(i, 1); },
    addEventListener: (t, fn) => (listeners['win:' + t] ||= []).push(fn),
    HTMLInputElement: class {},
    Ludvig: {score: (board, value) => { scores.push([board, value]); return Promise.resolve({ok: true}); }, ui: {board() {}, open() {}}, mp: hub.client(name)}
  };
  ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx;
  vm.createContext(ctx);
  const api = {
    ctx, byId, errors, scores, store,
    get cv() { return ctx.__cv; },
    runTimers() { let ran = true; while (ran) { ran = false; timers.sort((a, b) => a.at - b.at); const t = timers[0]; if (t && t.at <= clock.t) { if (t.every) t.at += t.every; else timers.shift(); try { t.fn(); } catch (e) { errors.push(e); } ran = true; } } },
    frame() { if (rafCb) { const cb = rafCb; rafCb = null; try { cb(clock.t); } catch (e) { errors.push(e); } } },
    key(type, code) { for (const fn of listeners['doc:' + type] || []) fn({code, repeat: false, preventDefault() {}, target: {}}); }
  };
  return api;
}

async function boot(browser) {
  const threeModule = new vm.SyntheticModule(Object.keys(REAL_THREE), function () {
    for (const k of Object.keys(REAL_THREE)) this.setExport(k, REAL_THREE[k]);
    this.setExport('WebGLRenderer', class { constructor() { this.domElement = browser.ctx.document.createElement('canvas'); this.shadowMap = {}; this.renderLists = {dispose() {}}; } setPixelRatio() {} setSize() {} render() {} dispose() {} forceContextLoss() {} });
  }, {context: browser.ctx});
  const logicModule = new vm.SyntheticModule(Object.keys(LOGIC), function () { for (const k of Object.keys(LOGIC)) this.setExport(k, LOGIC[k]); }, {context: browser.ctx});
  await threeModule.link(() => {}); await threeModule.evaluate();
  await logicModule.link(() => {}); await logicModule.evaluate();
  const mod = new vm.SourceTextModule(SCRIPT + HOOK, {context: browser.ctx, identifier: 'cubeville-inline', importModuleDynamically: () => threeModule});
  await mod.link(spec => spec === 'three' ? threeModule : spec === './logic.js' ? logicModule : null);
  await mod.evaluate();
}

const flush = async () => { for (let i = 0; i < 6; i++) await new Promise(r => setImmediate(r)); };
async function advance(clock, browsers, ms, step = 50) {
  for (let t = 0; t < ms; t += step) { clock.t += step; for (const b of browsers) { b.runTimers(); b.frame(); } await flush(); }
}

// Minimal relay with the same semantics as worker/rooms.mjs: meta echoes to everyone, send skips the sender, oldest peer hosts.
function makeHub() {
  const rooms = new Map(), sent = [];
  let n = 0;
  const clone = v => JSON.parse(JSON.stringify(v));
  class Room {
    constructor(r, self) { this.r = r; this.code = r.code; this.self = self; this.handlers = {}; this.seed = 1; this.max = r.max; this.closed = false; }
    get peers() { return this.r.peers.map(p => p.info); } get host() { return this.r.peers[0]?.info.id; } get meta() { return this.r.meta; }
    on(t, fn) { (this.handlers[t] ||= new Set()).add(fn); return () => this.handlers[t].delete(fn); }
    emit(t, ...a) { for (const fn of this.handlers[t] || []) fn(...a); }
    send(data) { const text = JSON.stringify(data); assert.ok(text.length <= 4096); sent.push({from: this.self.id, at: hub.clock.t, t: data.t}); for (const p of this.r.peers) if (p.room !== this) queueMicrotask(() => p.room.emit('message', this.self.id, clone(data), false)); return true; }
    sendTo(id, data) { const p = this.r.peers.find(x => x.info.id === id); if (p) queueMicrotask(() => p.room.emit('message', this.self.id, clone(data), true)); return true; }
    setMeta(meta) { assert.ok(JSON.stringify(meta).length <= 1024, 'meta too big'); this.r.meta = clone(meta); for (const p of this.r.peers) queueMicrotask(() => p.room.emit('meta', clone(meta))); return true; }
    leave() { const r = this.r, wasHost = this.host; r.peers = r.peers.filter(p => p.room !== this); for (const p of r.peers) queueMicrotask(() => { p.room.emit('leave', this.self); if (wasHost !== r.peers[0]?.info.id) p.room.emit('host', r.peers[0]?.info.id); }); if (!r.peers.length) rooms.delete(r.code); }
  }
  function enter(r, name) { if (r.peers.length >= r.max) throw Object.assign(new Error('full'), {code: 'full'}); const info = {id: 'p' + (++n) + 'xxxxxxx', name, joinedAt: n}; const room = new Room(r, info); for (const p of r.peers) queueMicrotask(() => p.room.emit('join', info)); r.peers.push({info, room}); return room; }
  const hub = {
    rooms, sent, clock: null,
    client: name => ({
      // Quick match like the real client: the fullest open public room, or a new public one.
      async join({room, quick, max = 8}) { if (quick) { const open = [...rooms.values()].filter(r => r.public && r.peers.length < r.max).sort((x, y) => y.peers.length - x.peers.length)[0]; return open ? enter(open, name) : this.create({max, visible: true}); } const r = rooms.get(room); if (!r) throw Object.assign(new Error('nf'), {code: 'not-found'}); return enter(r, name); },
      async create({max, visible}) { const code = 'AB' + String(rooms.size + 2).padStart(2, '2').replace(/[01]/g, '3'); const r = {code, max, public: Boolean(visible), meta: {}, peers: []}; rooms.set(code, r); return enter(r, name); },
      async list() { return [...rooms.values()].filter(r => r.public && r.peers.length < r.max).map(r => ({code: r.code, players: r.peers.length, max: r.max, meta: clone(r.meta)})); }
    })
  };
  return hub;
}

test('boots, plays every world, and the shop spends coins', async () => {
  const clock = {t: 1000}, hub = makeHub(); hub.clock = clock;
  const a = makeBrowser({clock, hub, name: 'Ada'});
  await boot(a);
  assert.equal(a.cv.cards.size, LOGIC.WORLDS.length, 'one card per world');
  for (const w of [...LOGIC.WORLDS.map(w => w.id)]) {
    a.cv.transitionTo('game', w); await advance(clock, [a], 400);
    const s = a.cv.session; assert.ok(s && s.game, w);
    s.game.active = true; a.cv.keys.add('KeyW');
    await advance(clock, [a], 1500);
    a.cv.keys.clear();
    const p = s.game.pos; assert.ok([p.x, p.y, p.z].every(Number.isFinite), `${w} position finite`);
    // Every route point should hold the player up (no missing colliders), except moving or falling parts.
    let grounded = 0, tried = 0;
    for (const [x, y, z] of s.course.path.slice(1)) {
      if (s.kinematics.some(b => Math.abs((b.home.minX + b.home.maxX) / 2 - x) < .01 && Math.abs((b.home.minZ + b.home.maxZ) / 2 - z) < .01)) continue;
      if (s.zones.some(q => q.lift && x > q.minX && x < q.maxX && z > q.minZ && z < q.maxZ)) continue;
      const tile = s.crumbles.find(b => Math.abs((b.minZ + b.maxZ) / 2 - z) < .01); if (tile) { tile.crumble.state = 0; tile.off = false; }
      tried++; s.game.won = false; s.game.pos.set(x, y + 0.3, z); s.game.vel.set(0, 0, 0); s.game.grounded = false;
      await advance(clock, [a], 100, 20);
      if (s.game.grounded || s.game.won || Math.abs(s.game.pos.y - y) < 0.4) grounded++;
    }
    assert.ok(grounded >= tried - 1, `${w}: ${grounded}/${tried} route points solid`);
    if (w !== 'hangout') assert.ok(s.game.won || a.byId('winDialog').open || s.goal, `${w} has a goal`);
  }
  // Teleport onto the obby goal: win dialog, stars and reward.
  a.cv.transitionTo('game', 'obby'); await advance(clock, [a], 400);
  const s = a.cv.session; s.game.active = true; s.game.started = true; s.game.elapsed = 12;
  const before = a.cv.profile.credits;
  s.game.pos.set(s.goal.x, s.goal.y + .2, s.goal.z); await advance(clock, [a], 900);
  assert.ok(s.game.won, 'won'); assert.ok(a.byId('winDialog').open, 'win dialog');
  assert.equal(a.cv.progress.stars.obby & 1, 1); assert.ok(a.cv.progress.stars.obby & 4, 'under par');
  assert.ok(a.cv.profile.credits >= before + 150);
  const saved = JSON.parse(a.store.get('block-worlds-v1')); assert.ok(saved.best.obby > 0 && saved.best.obby <= 13.5, 'best kept in the bridged key'); assert.deepEqual(Object.keys(saved).sort(), ['best', 'body', 'credits', 'head', 'shirt', 'sound'], 'original save shape');
  assert.ok(a.store.get('cubeville-progress-v1'), 'progress saved in its own key');
  // Shop: preview then unlock a hat.
  a.cv.transitionTo('avatar'); await advance(clock, [a], 400);
  a.cv.profile.credits = 2000; a.cv.preview = {kind: 'hat', id: 'crown'}; a.cv.unlockPreview();
  assert.equal(a.cv.progress.hat, 'crown'); assert.equal(a.cv.profile.credits, 500); assert.ok(a.cv.progress.owned.hats.includes('crown'));
  assert.equal(a.cv.session.avatar.hatId, 'crown');
  a.cv.transitionTo('home'); await advance(clock, [a], 400);
  assert.equal(a.cv.session, null, 'scene disposed at home');
  assert.deepEqual(a.errors.map(String), []);
});

test('two players: plaza, countdown, race, finish order, wins board, vote', async () => {
  const clock = {t: 5000}, hub = makeHub(); hub.clock = clock;
  const a = makeBrowser({clock, hub, name: 'Ada'}), b = makeBrowser({clock, hub, name: 'Bo', coarse: true});
  await boot(a); await boot(b);
  const both = [a, b];
  a.cv.goOnline('create'); await advance(clock, both, 600);
  const code = a.cv.net.room.code;
  assert.equal(a.ctx.location.search, `?world=${code}`, 'invite code in the URL');
  assert.equal(a.cv.session.online.mode, 'plaza');
  b.cv.goOnline('code', code); await advance(clock, both, 800);
  assert.equal(b.cv.session.online.mode, 'plaza');
  assert.equal(a.cv.net.room.peers.length, 2);
  // Both see each other with name tags in the plaza.
  await advance(clock, both, 1200);
  const peerOfA = [...a.cv.net.peers.values()][0];
  assert.ok(peerOfA.view, 'A renders B'); assert.ok([...b.cv.net.peers.values()][0].view, 'B renders A');
  assert.equal(a.cv.net.meta.phase, 'plaza'); assert.ok(a.cv.net.meta.auto > 0, 'auto start with two players');
  // Emote + phrase reach the other side.
  a.cv.playEmote('wave'); await advance(clock, both, 100); assert.equal([...b.cv.net.peers.values()][0].view.avatar.emote?.k, 'wave'); await advance(clock, both, 800); a.cv.say(1); a.cv.say(2); await advance(clock, both, 200);
  assert.ok([...b.cv.net.peers.values()][0].view.avatar.bubble, 'chat bubble shown');
  assert.equal(hub.sent.filter(m => m.t === 'say').length, 1, 'second phrase inside the cooldown is dropped');
  // Host starts now; both load the race world and wait for GO.
  const world = a.cv.net.meta.world;
  a.cv.startRace(); await advance(clock, both, 600);
  for (const x of both) { assert.equal(x.cv.session.online.mode, 'race'); assert.equal(x.cv.session.id, world); assert.ok(x.cv.session.game.frozen, 'frozen during countdown'); }
  await advance(clock, both, 3200);
  for (const x of both) assert.ok(!x.cv.session.game.frozen, 'GO');
  // Rate limit: no client sends more than 12 messages in any second.
  const perSecond = new Map(); for (const m of hub.sent) { const k = m.from + ':' + Math.floor(m.at / 1000); perSecond.set(k, (perSecond.get(k) || 0) + 1); }
  assert.ok(Math.max(...perSecond.values()) <= 12, `max ${Math.max(...perSecond.values())} msgs/s`);
  // B finishes first, then A.
  const finish = x => { const s = x.cv.session; s.game.active = true; s.game.pos.set(s.goal.x, s.goal.y + .2, s.goal.z); s.game.vel.set(0, 0, 0); };
  finish(b); await advance(clock, both, 1500);
  assert.ok(b.cv.session.game.won); assert.ok(a.cv.net.finishes.has(b.cv.net.selfId), 'host got B finish');
  finish(a); await advance(clock, both, 1200);
  for (const x of both) { assert.equal(x.cv.net.meta.phase, 'results', 'results phase'); }
  await advance(clock, both, 600);
  assert.equal(a.cv.session.online.mode, 'plaza'); assert.equal(b.cv.session.online.mode, 'plaza');
  const res = a.cv.net.meta.res; assert.equal(res[0][0], b.cv.net.selfId, 'B won'); assert.equal(res.length, 2);
  assert.equal(b.cv.progress.wins, 1); assert.deepEqual(b.scores.at(-1), ['cubeville:race-wins', 1]);
  assert.equal(a.cv.progress.wins, 0);
  assert.ok(Math.abs(b.cv.session.game.pos.x) < .01 && b.cv.session.game.pos.y > 1.4, 'winner stands on the podium');
  assert.ok(!a.byId('resultsCard').hidden, 'results card visible');
  // Votes: both pick the first option; host moves on after the vote timer.
  const choice = a.cv.net.meta.opts[0];
  a.cv.castVote(choice); b.cv.castVote(choice); await advance(clock, both, 14000, 100);
  assert.equal(a.cv.net.meta.phase, 'plaza'); assert.equal(a.cv.net.meta.world, choice); assert.ok(a.byId('resultsCard').hidden);
  // Host leaves: B becomes host and keeps the room going.
  a.cv.transitionTo('home'); await advance(clock, both, 800);
  assert.equal(a.cv.net, null); assert.equal(a.ctx.location.search, '');
  assert.equal(b.cv.net.room.host, b.cv.net.selfId); assert.equal(b.cv.net.peers.size, 0);
  await advance(clock, both, 800);
  assert.equal(b.cv.net.meta.auto, 0, 'auto start cancelled when alone');
  // Quick match for B's world finds B's room? (private rooms never show) — A quick-matches into a new public room.
  a.cv.goOnline('quick', 'lava'); await advance(clock, both, 800);
  assert.equal(a.cv.net.meta.world, 'lava');
  assert.deepEqual(a.errors.map(String), []); assert.deepEqual(b.errors.map(String), []);
});

test('mechanics: platforms carry, belts push, fans lift, pads bounce, tiles fall, gates block then open', async () => {
  const clock = {t: 1000}, hub = makeHub(); hub.clock = clock;
  const a = makeBrowser({clock, hub, name: 'Ada'});
  await boot(a);
  const load = async id => { a.cv.transitionTo('game', id); await advance(clock, [a], 400); const s = a.cv.session; s.game.active = true; return s; };
  const put = (s, x, y, z) => { s.game.pos.set(x, y, z); s.game.prev.copy(s.game.pos); s.game.vel.set(0, 0, 0); s.game.grounded = false; s.game.ground = null; s.game.won = false; };
  const centre = b => [(b.minX + b.maxX) / 2, b.maxY, (b.minZ + b.maxZ) / 2];

  let s = await load('shuttle');
  const mover = s.kinematics.find(b => b.home.maxX - b.home.minX < 6 && b.motion(1)[0] !== 0);
  put(s, ...centre(mover)); await advance(clock, [a], 100, 20);
  const x0 = s.game.pos.x, m0 = (mover.minX + mover.maxX) / 2;
  await advance(clock, [a], 1000, 20);
  assert.ok(Math.abs((s.game.pos.x - x0) - ((mover.minX + mover.maxX) / 2 - m0)) < 0.3, 'rides the moving platform');
  assert.ok(Math.abs(s.game.pos.y - mover.maxY) < 0.05, 'stays on top');

  s = await load('factory');
  const belt = s.colliders.find(b => b.belt && b.belt[1] > 0);
  put(s, ...centre(belt)); await advance(clock, [a], 60, 20);
  const z0 = s.game.pos.z; await advance(clock, [a], 500, 20);
  assert.ok(s.game.pos.z - z0 > belt.belt[1] * 0.35, `belt pushes back (${(s.game.pos.z - z0).toFixed(2)})`);

  s = await load('windy');
  const fan = s.zones.find(z => z.lift);
  put(s, (fan.minX + fan.maxX) / 2, fan.minY + 0.3, (fan.minZ + fan.maxZ) / 2);
  let top = 0; for (let i = 0; i < 40; i++) { await advance(clock, [a], 50, 25); top = Math.max(top, s.game.pos.y); }
  assert.ok(top > fan.maxY - 0.5, `fan lifts to ${top.toFixed(1)} (zone top ${fan.maxY.toFixed(1)})`);
  const gust = s.zones.find(z => z.px);
  put(s, (gust.minX + gust.maxX) / 2, gust.minY + 1.5, (gust.minZ + gust.maxZ) / 2); const gx = s.game.pos.x;
  await advance(clock, [a], 300, 20);
  assert.ok(Math.sign(s.game.pos.x - gx) === Math.sign(gust.px), 'side wind pushes');

  s = await load('bounce');
  const pad = s.colliders.find(b => b.bounce);
  put(s, centre(pad)[0], pad.maxY + 0.4, centre(pad)[2]);
  top = 0; for (let i = 0; i < 40; i++) { await advance(clock, [a], 40, 20); top = Math.max(top, s.game.pos.y); }
  assert.ok(top - pad.maxY > pad.bounce ** 2 / 50 - 0.6, `bounce apex ${(top - pad.maxY).toFixed(2)}`);

  s = await load('crumble');
  const tile = s.crumbles[0];
  put(s, ...centre(tile)); await advance(clock, [a], 300, 20);
  assert.equal(tile.crumble.state, 1, 'tile starts to shake');
  await advance(clock, [a], 500, 20);
  assert.ok(tile.off && !tile.mesh.visible, 'tile falls');
  await advance(clock, [a], 3000, 50);
  assert.ok(!tile.off, 'tile comes back');

  s = await load('clock');
  const door = s.kinematics.find(b => b.door);
  const [dx, , dz] = centre(door), floorTop = door.home.minY;
  // Find a moment when the gate is shut, walk into it, and check it blocks.
  const shut = t => door.motion(t)[1] === 0;
  let t = 0; while (!shut(t) || !shut(t + 0.6)) t += 0.05;
  s.worldTime = t; put(s, dx, floorTop + 0.05, dz + 2); s.orbit.yaw = 0; a.cv.keys.add('KeyW');
  await advance(clock, [a], 500, 20);
  assert.ok(s.game.pos.z > door.minZ, 'closed gate blocks');
  // Wait for the start of an open window and walk through.
  a.cv.keys.clear(); t = s.worldTime; while (door.motion(t)[1] < 3.6 || door.motion(t + 0.4)[1] < 3.6) t += 0.05;
  s.worldTime = t; put(s, dx, floorTop + 0.05, dz + 1.5); a.cv.keys.add('KeyW');
  await advance(clock, [a], 400, 20); a.cv.keys.clear();
  assert.ok(s.game.pos.z < door.minZ - 0.3, `open gate lets you through (${s.game.pos.z.toFixed(2)} vs ${door.minZ.toFixed(2)})`);
  assert.deepEqual(a.errors.map(String), []);
});
