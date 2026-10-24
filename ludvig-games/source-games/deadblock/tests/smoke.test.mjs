// Headless smoke test: real three.js scene math, fake WebGL renderer, fake DOM, in-memory Ludvig.mp relay.
// Run: node --max-old-space-size=768 --test source-games/deadblock/tests/smoke.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const dir = new URL('../', import.meta.url);
const THREE_SRC = readFileSync(new URL('three.min.js', dir), 'utf8');
const LOGIC_SRC = readFileSync(new URL('logic.js', dir), 'utf8');
const GAME_SRC = readFileSync(new URL('game.js', dir), 'utf8');
const HTML = readFileSync(new URL('index.html', dir), 'utf8');
const initialClasses = {};
for (const tag of HTML.match(/<[a-z][^>]*>/gi)) { const id = /\sid="([^"]+)"/.exec(tag), cls = /\sclass="([^"]+)"/.exec(tag); if (id) initialClasses[id[1]] = cls ? cls[1].split(/\s+/) : []; }

function makeCtx2d() {
  const noop = () => {};
  return new Proxy({}, { get(t, k) {
    if (k === 'createRadialGradient' || k === 'createLinearGradient') return () => ({ addColorStop: noop });
    if (k === 'getImageData' || k === 'createImageData') return (a, b, c, d) => { const w = c ?? a, h = d ?? b; return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h }; };
    if (k in t) return t[k];
    return noop;
  }, set(t, k, v) { t[k] = v; return true; } });
}
function makeEl(tag = 'div', id = '') {
  const classes = new Set(initialClasses[id] || []);
  const el = {
    tagName: tag.toUpperCase(), id, children: [], style: { setProperty() {} }, dataset: {}, hidden: false, disabled: false, value: '', title: '', innerHTML: '', parentNode: null, _l: {}, _q: {}, _first: { textContent: '' },
    classList: { add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c), toggle: (c, on) => { const v = on === undefined ? !classes.has(c) : !!on; if (v) classes.add(c); else classes.delete(c); return v; } },
    get firstChild() { return this._first; }, get lastChild() { return this.children[this.children.length - 1]; },
    appendChild(c) { this.children.push(c); c.parentNode = this; return c; }, append(...cs) { cs.forEach(c => this.appendChild(c)); },
    remove() { if (this.parentNode) { const i = this.parentNode.children.indexOf(this); if (i >= 0) this.parentNode.children.splice(i, 1); } },
    querySelector(sel) { return this._q[sel] || (this._q[sel] = makeEl()); }, querySelectorAll() { return []; },
    addEventListener(t, f) { (this._l[t] ||= []).push(f); }, removeEventListener() {}, dispatch(t, e) { for (const f of this._l[t] || []) f(e); },
    setAttribute(k, v) { this['attr_' + k] = v; }, getAttribute(k) { return this['attr_' + k]; }, focus() {}, setPointerCapture() {},
    getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 100 }; }, getContext() { return makeCtx2d(); }, width: 0, height: 0,
  };
  let text = '';
  Object.defineProperty(el, 'textContent', { get: () => text, set: v => { text = String(v); el.children.length = 0; } });
  return el;
}
function createRelay() {
  const rooms = new Map(), queue = [], stats = { sent: new Map(), maxBytes: 0, hits: new Map() };
  let seq = 0;
  const deliver = (fn) => queue.push(fn);
  function client(server, self) {
    const handlers = {};
    const c = {
      code: server.code, self, peers: server.peers, host: server.peers[0].id, seed: 1234, meta: server.meta, max: server.max, public: false,
      on(t, f) { (handlers[t] ||= new Set()).add(f); return () => handlers[t].delete(f); }, off(t, f) { handlers[t]?.delete(f); },
      emit(t, ...a) { for (const f of [...(handlers[t] || [])]) f(...a); },
      send(data) { const text = JSON.stringify(data); stats.maxBytes = Math.max(stats.maxBytes, text.length); assert.ok(text.length <= 4096, 'message over 4 KB'); stats.sent.set(self.id, (stats.sent.get(self.id) || 0) + 1); if (data.h) stats.hits.set(self.id, (stats.hits.get(self.id) || 0) + data.h.length); for (const o of server.members) if (o !== c) deliver(() => o.emit('message', self.id, JSON.parse(text), false)); return true; },
      sendTo(id, data) { const text = JSON.stringify(data); for (const o of server.members) if (o.self.id === id) deliver(() => o.emit('message', self.id, JSON.parse(text), true)); return true; },
      setMeta(m) { server.meta = m; for (const o of server.members) { o.meta = m; if (o !== c) deliver(() => o.emit('meta', m)); } return true; },
      leave() { const i = server.members.indexOf(c); if (i < 0) return; server.members.splice(i, 1); server.peers.splice(server.peers.findIndex(p => p.id === self.id), 1); const wasHost = c.host === self.id; for (const o of server.members) { o.peers = server.peers; deliver(() => o.emit('leave', self)); if (wasHost && server.peers[0]) { o.host = server.peers[0].id; deliver(() => o.emit('host', o.host)); } } c.emit('close', 'left'); },
    };
    return c;
  }
  return {
    stats, flush() { while (queue.length) queue.shift()(); },
    mp(player) {
      return {
        async create(opts) { const code = 'AB' + (10 + seq++); const server = { code, members: [], peers: [], meta: {}, max: opts.max || 4 }; rooms.set(code, server); return this._enter(server); },
        async join(opts) { let server = opts.quick ? [...rooms.values()].find(r => r.members.length < r.max) : rooms.get(opts.room); if (!server) throw Object.assign(new Error('nf'), { code: 'not-found' }); return this._enter(server); },
        async list() { return []; },
        _enter(server) { const self = { id: 'peer' + player.id, name: player.name, joinedAt: Date.now() }; server.peers.push(self); const c = client(server, self); c.peers = server.peers; for (const o of server.members) deliver(() => o.emit('join', self)); server.members.push(c); return c; },
      };
    },
  };
}
function boot({ relay, id, coarse = false, patch } = {}) {
  let clock = 1000, raf = null; const timers = [], errors = [], ids = {};
  const document = { hidden: false, head: makeEl('head'), body: makeEl('body'), getElementById: k => ids[k] || (ids[k] = makeEl('div', k)), createElement: t => makeEl(t), querySelectorAll: () => [], addEventListener() {} };
  const winL = {};
  const store = new Map();
  const sandbox = {
    document, console: { log() {}, warn: (...a) => { const m = a.join(' '); if (!m.includes('deprecated with r150')) errors.push(m); }, error: (...a) => errors.push(a.join(' ')) },
    matchMedia: () => ({ matches: coarse }), devicePixelRatio: 2, innerWidth: coarse ? 390 : 1280, innerHeight: coarse ? 844 : 720,
    localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) },
    navigator: { onLine: true, clipboard: { writeText: async () => {} } }, location: { search: '', origin: 'http://x', pathname: '/deadblock/', protocol: 'http:', host: 'x' }, history: { replaceState() {} },
    performance: { now: () => clock }, requestAnimationFrame: cb => { raf = cb; return 1; }, setTimeout: (f, ms) => { timers.push([clock + (ms || 0), f]); return timers.length; }, clearTimeout() {},
    addEventListener: (t, f) => { (winL[t] ||= []).push(f); }, removeEventListener() {}, URLSearchParams,
  };
  sandbox.window = sandbox; sandbox.self = sandbox;
  if (relay) sandbox.Ludvig = { mp: relay.mp({ id, name: 'Bot ' + id }), ui: null, player: { id, name: 'Bot ' + id } };
  vm.createContext(sandbox);
  vm.runInContext(THREE_SRC, sandbox, { filename: 'three.min.js' });
  vm.runInContext(`THREE.WebGLRenderer = class { constructor() { this.shadowMap = { enabled: true, type: 0 }; this.capabilities = { getMaxAnisotropy: () => 8 }; this.info = { render: { calls: 0, triangles: 0 } }; } setPixelRatio() {} setSize() {} render(scene) { this.info.render.calls++; scene.updateMatrixWorld(); } };`, sandbox);
  vm.runInContext('{ const S = THREE.Scene; THREE.Scene = class extends S { constructor() { super(); globalThis.__scene = this; } }; }', sandbox);
  vm.runInContext(LOGIC_SRC, sandbox, { filename: 'logic.js' });
  if (patch) patch(sandbox.HordeLogic);
  vm.runInContext(GAME_SRC, sandbox, { filename: 'game.js' });
  sandbox.bootDeadblock();
  const $ = k => document.getElementById(k);
  const key = (code) => { for (const f of winL.keydown || []) f({ code, repeat: false, target: { tagName: 'BODY' }, preventDefault() {} }); for (const f of winL.keyup || []) f({ code }); };
  const pointer = (type, x, y) => $('world').dispatch(type, { pointerType: 'mouse', clientX: x, clientY: y, button: 0, pointerId: 1, preventDefault() {} });
  return {
    sandbox, $, key, errors, get game() { return sandbox.deadblock; }, get clock() { return clock; },
    tick(ms = 1000 / 60) { clock += ms; for (let i = timers.length - 1; i >= 0; i--) if (timers[i][0] <= clock) { const [, f] = timers.splice(i, 1)[0]; f(); } const cb = raf; raf = null; if (cb) cb(clock); },
    bot() {
      const g = sandbox.deadblock, st = g.stats;
      if (g.state === 'upgrade') { key('Digit1'); return; }
      if (g.state !== 'run') return;
      const me = g.playerScreen, tg = g.targets;
      let best = null, bd = Infinity; for (const t of tg) { const d = Math.hypot(t.x - me.x, t.y - me.y); if (d < bd) { bd = d; best = t; } }
      if (best) { pointer('pointermove', best.x, best.y); pointer('pointerdown', best.x, best.y); }
      if (st.gun < 6) key('Digit' + (1 + Math.floor(Math.random() * 7)));
      if (Math.random() < .05) key('KeyG');
      if (Math.random() < .03) key('Space');
    },
  };
}
const run = (inst, seconds, every = 6) => { for (let f = 0; f < seconds * 60; f++) { inst.tick(); if (f % every === 0) inst.bot(); } };

test('solo run: menu, waves, archetypes, boss, upgrades, death, unlock bookkeeping', () => {
  const a = boot({ patch: L => { L.isBossWave = w => w === 2 || w === 4; L.waveSize = () => 9; const pk = L.pickKind; L.pickKind = (w, r, s, m) => pk(w + 8, r, s, m); } });
  for (let i = 0; i < 30; i++) a.tick();
  assert.equal(a.game.state, 'menu'); assert.ok(a.game.stats.enemies > 0, 'demo horde on the menu');
  a.sandbox.document.getElementById('menu'); a.$('startBtn').onclick();
  assert.equal(a.game.state, 'run');
  const kinds = new Set(), modes = new Set(); let maxWave = 0, sawBoss = false;
  for (let attempt = 0; attempt < 4 && !(maxWave >= 3 && sawBoss); attempt++) {
    if (attempt) { run(a, 1); a.$('againBtn').onclick(); assert.equal(a.game.state, 'run', 'play again restarts'); }
    for (let s = 0; s < 240 && a.game.state !== 'dead' && !(maxWave >= 3 && sawBoss); s++) { run(a, 1); for (const t of a.game.targets) { kinds.add(t.kind); if (t.mode) modes.add(t.mode); if (['butcher', 'matriarch', 'howler'].includes(t.kind)) sawBoss = true; } maxWave = Math.max(maxWave, a.game.stats.wave); }
  }
  assert.deepEqual(a.errors, []);
  let draws = 0; a.sandbox.__scene.traverseVisible(o => { if ((o.isMesh || o.isSprite || o.isPoints) && !(o.isInstancedMesh && o.count === 0)) draws++; });
  if (process.env.DBG) console.log('draws', draws, JSON.stringify(a.game.stats));
  assert.ok(draws < 140, 'draw calls stay low: ' + draws);
  assert.ok(maxWave >= 2, 'cleared at least one wave, reached ' + maxWave);
  assert.ok(kinds.size >= 4, 'several archetypes: ' + [...kinds]);
  assert.ok(sawBoss, 'boss spawned');
  assert.ok(modes.size >= 2, 'tactical modes used: ' + [...modes]);
  if (a.game.state !== 'dead') { a.key('Escape'); a.$('quitBtn').onclick(); }
  const profile = JSON.parse(a.sandbox.localStorage.getItem('deadblock-profile'));
  assert.ok(profile.runs >= 1); assert.ok(profile.kills > 0);
  assert.ok(Number(a.sandbox.localStorage.getItem('deadblock-best')) > 0, 'best score saved under the bridged key');
});

test('daily run is seeded and solo quality settings persist', () => {
  const a = boot({ coarse: true });
  for (let i = 0; i < 5; i++) a.tick();
  a.$('dailyBtn').onclick(); run(a, 20);
  assert.ok(a.game.stats.mod, 'daily modifier active');
  a.$('qualityBtn').onclick();
  assert.equal(JSON.parse(a.sandbox.localStorage.getItem('deadblock-settings')).quality, 'High');
  assert.deepEqual(a.errors, []);
});

test('co-op: lobby, shared waves, host-owned zombies, hits, upgrades, host migration', async () => {
  const relay = createRelay();
  const flushAll = async (...xs) => { for (let i = 0; i < 3; i++) { relay.flush(); await new Promise(r => setImmediate(r)); } };
  const small = L => { L.waveSize = () => 5; };
  const host = boot({ relay, id: 'H', patch: small }), guest = boot({ relay, id: 'G', patch: small });
  host.tick(); guest.tick();
  host.$('coopBtn').onclick(); host.$('createBtn').onclick(); await flushAll();
  const code = host.$('roomCode').textContent; assert.ok(code, 'room code shown');
  guest.$('coopBtn').onclick(); guest.$('codeInput').value = code; guest.$('joinBtn').onclick(); await flushAll();
  assert.equal(host.game.stats.mode, 'coop'); assert.equal(guest.game.stats.mode, 'coop');
  host.$('coopGo').onclick(); await flushAll();
  assert.equal(host.game.state, 'run'); assert.equal(guest.game.state, 'run');
  let guestSawZombies = 0, guestKills = 0, maxWave = 0, msgs0 = new Map(relay.stats.sent), t0 = host.clock;
  for (let s = 0; s < 90; s++) {
    for (let f = 0; f < 60; f++) { host.tick(); guest.tick(); relay.flush(); if (f % 6 === 0) { host.bot(); guest.bot(); } }
    await flushAll();
    guestSawZombies = Math.max(guestSawZombies, guest.game.stats.enemies); guestKills = Math.max(guestKills, guest.game.stats.kills); maxWave = Math.max(maxWave, host.game.stats.wave, guest.game.stats.wave);
    if (process.env.DBG) console.log(s, JSON.stringify({ h: [host.game.state, host.game.stats.wave, host.game.stats.status, host.game.stats.hp|0, host.game.stats.enemies, host.game.stats.spawnLeft], g: [guest.game.state, guest.game.stats.wave, guest.game.stats.status, guest.game.stats.hp|0, guest.game.stats.enemies] }));
    if (host.game.state === 'dead' || maxWave >= 3) break;
  }
  const seconds = (host.clock - t0) / 1000;
  for (const [peer, n] of relay.stats.sent) assert.ok((n - (msgs0.get(peer) || 0)) / seconds <= 12.5, `${peer} sent ${(n / seconds).toFixed(1)} msgs/s`);
  assert.deepEqual(host.errors, []); assert.deepEqual(guest.errors, []);
  assert.ok(guestSawZombies > 0, 'guest renders host zombies');
  assert.ok((relay.stats.hits.get('peerG') || 0) > 0, 'guest sends hits to the host');
  assert.ok(guestKills > 0 || host.game.stats.kills > 0, 'kills are credited');
  assert.ok(maxWave >= 3, 'shared waves advance with both players picking upgrades, reached ' + maxWave);
  assert.equal(guest.game.stats.wave, host.game.stats.wave);
  if (process.env.DBG) console.log('rates', [...relay.stats.sent].map(([p, n]) => p + ' ' + ((n - (msgs0.get(p) || 0)) / seconds).toFixed(1) + '/s').join(', '), 'max bytes', relay.stats.maxBytes);
  assert.ok(relay.stats.maxBytes < 4096, 'largest message ' + relay.stats.maxBytes + ' bytes');
  assert.notEqual(host.game.state, 'dead', 'bots survive the small waves');
  // A third player joins mid-run: synced in as a spectator, back in when the wave ends.
  const late = boot({ relay, id: 'J', coarse: true, patch: small });
  late.tick(); late.$('coopBtn').onclick(); late.$('codeInput').value = code; late.$('joinBtn').onclick(); await flushAll();
  for (let i = 0; i < 10; i++) { host.tick(); guest.tick(); late.tick(); relay.flush(); await flushAll(); }
  assert.equal(late.game.state, 'run', 'late joiner is synced into the run'); assert.equal(late.game.stats.status, 'dead');
  for (let s = 0; s < 40 && late.game.stats.status === 'dead' && host.game.state !== 'dead'; s++) {
    for (let f = 0; f < 60; f++) { host.tick(); guest.tick(); late.tick(); relay.flush(); if (f % 6 === 0) { host.bot(); guest.bot(); late.bot(); } }
    await flushAll();
  }
  assert.ok(late.game.stats.status !== 'dead' || host.game.state === 'dead', 'late joiner respawns at the wave break');
  assert.deepEqual(late.errors, []);
  late.key('Escape'); late.$('quitBtn').onclick(); await flushAll();
  host.key('Escape'); host.$('quitBtn').onclick(); await flushAll();
  assert.equal(host.game.state, 'menu'); assert.equal(host.game.stats.mode, 'solo');
  assert.equal(guest.game.stats.host, true, 'guest takes over as host');
  const waveBefore = guest.game.stats.wave;
  for (let s = 0; s < 40 && guest.game.state !== 'dead' && guest.game.stats.wave === waveBefore; s++) { run(guest, 1); await flushAll(); }
  assert.deepEqual(guest.errors, []);
  assert.ok(guest.game.stats.wave > waveBefore || guest.game.state === 'dead', 'new host keeps the run going');
});
