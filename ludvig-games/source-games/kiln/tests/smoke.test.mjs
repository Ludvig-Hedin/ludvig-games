// Headless smoke test for Scrapyard: runs the real game scripts in Node with stubbed WebGL2, canvas, DOM and
// an in-memory relay that mimics Ludvig.mp. Plays solo waves, a co-op run (drop-in by invite link, down and
// revive, host migration) and a deathmatch (hits, sanity caps, death, respawn, scoreboard).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const html = readFileSync(process.env.KILN_HTML || fileURLToPath(new URL('../index.html', import.meta.url)), 'utf8');
const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/g)].map(m => m[2]);
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);

let clock = 0;
const noop = () => {};
const glStub = () => new Proxy({}, { get(_, k) {
  if (typeof k !== 'string') return undefined;
  if (/^[A-Z_0-9]+$/.test(k)) return 1;
  if (k === 'getShaderParameter' || k === 'getProgramParameter') return () => true;
  if (k === 'checkFramebufferStatus') return () => 1;
  return () => ({});
} });
const ctxStub = () => new Proxy({}, { get(_, k) {
  if (k === 'createRadialGradient' || k === 'createLinearGradient') return () => ({ addColorStop: noop });
  if (k === 'measureText') return () => ({ width: 10 });
  if (k === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
  return noop;
}, set: () => true });

class El {
  constructor(id = '') { this.id = id; this.children = []; this.parent = null; this.hidden = false; this.disabled = false; this.value = ''; this._text = ''; this.innerHTML = ''; this.width = 300; this.height = 150; this.clientWidth = 270; this.listeners = {}; this.dataset = {}; this.attrs = {}; this.className = ''; this.style = { setProperty: noop }; const cls = new Set(); this.classList = { add: c => cls.add(c), remove: c => cls.delete(c), toggle: (c, on) => { const v = on === undefined ? !cls.has(c) : !!on; v ? cls.add(c) : cls.delete(c); return v; }, contains: c => cls.has(c) }; }
  get textContent() { return this._text; }
  set textContent(v) { this._text = String(v); this.children = []; }
  get firstChild() { return this.children[0] || (this._tn ||= { textContent: '' }); }
  get lastChild() { return this.children[this.children.length - 1] || null; }
  get lastElementChild() { return this.children[this.children.length - 1] || (this._le ||= new El()); }
  get firstElementChild() { return this.children[0] || (this._fe ||= new El()); }
  append(...n) { for (const c of n) if (c && typeof c === 'object') { c.parent = this; this.children.push(c); } }
  appendChild(c) { this.append(c); return c; }
  prepend(c) { c.parent = this; this.children.unshift(c); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(c => c !== this); }
  addEventListener(t, f) { (this.listeners[t] ||= []).push(f); }
  removeEventListener() {}
  setAttribute(k, v) { this.attrs[k] = v; } getAttribute(k) { return this.attrs[k] ?? null; }
  focus() {} blur() {} click() { fireOn(this, 'click'); } setPointerCapture() {} releasePointerCapture() {} requestPointerLock() {}
  getBoundingClientRect() { return { left: 0, top: 0, width: 110, height: 110 }; }
  querySelector() { return new El(); } querySelectorAll() { return []; } closest() { return null; }
  getContext(t) { return t === '2d' ? ctxStub() : glStub(); }
}
function fireOn(el, type, ev = {}) {
  const e = { currentTarget: el, target: el, pointerId: 1, clientX: 200, clientY: 300, button: 0, preventDefault: noop, stopPropagation: noop, ...ev };
  if (typeof el['on' + type] === 'function') el['on' + type](e);
  for (const f of el.listeners[type] || []) f(e);
}

function makeGame(name, relay, { touch = true, search = '' } = {}) {
  const els = new Map(ids.map(id => [id, new El(id)]));
  const docL = {}, winL = {}, storage = new Map(), errors = [];
  let raf = null; const timers = [];
  const document = {
    getElementById: id => els.get(id) || null, createElement: () => new El(), createElementNS: () => new El(), createTextNode: t => ({ textContent: t }),
    querySelectorAll: () => [], querySelector: () => new El(),
    addEventListener: (t, f) => { (docL[t] ||= []).push(f); }, exitPointerLock: noop, pointerLockElement: null, hidden: false,
    fullscreenEnabled: false, body: new El('body'), documentElement: { outerHTML: '<html></html>' },
  };
  const player = { id: name.padEnd(22, 'x'), name };
  const sandbox = {
    document, console, URL, URLSearchParams, Blob: class {}, innerWidth: 390, innerHeight: 844, devicePixelRatio: 3,
    setTimeout: (f, ms) => { if (ms <= 100) timers.push(f); return 0; }, clearTimeout: noop,
    navigator: { onLine: true }, location: { protocol: 'https:', search, href: 'https://games.example/kiln/' + search, pathname: '/kiln/', hash: '' },
    history: { replaceState: noop, state: null }, matchMedia: q => ({ matches: touch && q.includes('coarse') }),
    localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, String(v)), removeItem: k => storage.delete(k) },
    performance: { now: () => clock }, requestAnimationFrame: cb => { raf = cb; },
    addEventListener: (t, f) => { (winL[t] ||= []).push(f); },
    HTMLInputElement: class {}, HTMLSelectElement: class {}, KILN_TEST_MODE: true,
  };
  sandbox.window = sandbox;
  sandbox.Ludvig = { player, mp: relay.client(player) };
  vm.createContext(sandbox);
  for (const code of scripts) vm.runInContext(code, sandbox);
  const g = {
    els, errors, storage, sandbox, el: id => els.get(id),
    fire: (id, type = 'click', ev) => fireOn(els.get(id), type, ev),
    frame() { const cb = raf; raf = null; try { cb && cb(clock); } catch (e) { errors.push(e); } while (timers.length) try { timers.shift()(); } catch (e) { errors.push(e); } },
    get K() { return sandbox.__KILN__; }, get T() { return sandbox.__KILN__.test; },
  };
  return g;
}

function makeRelay() {
  const rooms = new Map(), queue = [];
  let n = 0;
  function client(player) {
    function open(code, max, visible) {
      let r = rooms.get(code);
      if (!r) { r = { code, peers: [], meta: {}, max, visible, sockets: new Set() }; rooms.set(code, r); }
      if (r.peers.length >= r.max) throw Object.assign(new Error('full'), { code: 'full' });
      const self = { id: player.id.slice(0, 10), name: player.name, joinedAt: ++n };
      const handlers = {};
      const room = {
        code, self, seed: 7, max: r.max, public: !!visible, sent: 0, closed: false,
        get peers() { return r.peers.slice(); }, get host() { return r.peers[0]?.id; }, get meta() { return r.meta; },
        on(t, f) { (handlers[t] ||= new Set()).add(f); return () => handlers[t].delete(f); }, off(t, f) { handlers[t]?.delete(f); },
        emit(t, ...a) { if (!room.closed) for (const f of handlers[t] || []) f(...a); },
        send(data) { room.sent++; const json = JSON.stringify(data); assert.ok(json.length <= 4096, 'message under 4 KB'); for (const s of r.sockets) if (s !== room) queue.push(() => s.emit('message', self.id, JSON.parse(json), false)); return true; },
        sendTo() { return true; },
        setMeta(meta) { r.meta = JSON.parse(JSON.stringify(meta)); for (const s of r.sockets) queue.push(() => s.emit('meta', r.meta)); },
        leave() { const host = r.peers[0]?.id; r.sockets.delete(room); r.peers = r.peers.filter(p => p.id !== self.id); room.emit('close', 'left'); room.closed = true; for (const s of r.sockets) { queue.push(() => s.emit('leave', self)); if (host !== r.peers[0]?.id) queue.push(() => s.emit('host', r.peers[0]?.id)); } },
      };
      for (const s of r.sockets) queue.push(() => s.emit('join', self));
      r.peers.push(self); r.sockets.add(room);
      return room;
    }
    return {
      create: async o => open(o.visible ? 'QK' + (rooms.size + 1) : 'AB3K', o.max || 4, o.visible),
      join: async o => { if (!rooms.has(o.room)) throw Object.assign(new Error('nf'), { code: 'not-found' }); return open(o.room, 4); },
      list: async () => [...rooms.values()].filter(r => r.visible).map(r => ({ code: r.code, players: r.peers.length, max: r.max, meta: r.meta })),
    };
  }
  return { client, rooms, flush() { while (queue.length) queue.shift()(); } };
}
const tick = () => new Promise(r => setImmediate(r));
function run(games, relay, frames, each) { for (let i = 0; i < frames; i++) { clock += 33; for (const g of games) g.frame(); relay.flush(); each && each(i); } }
// Aim at the nearest live robot and hold fire.
function hunt(g) {
  const en = g.K.enemies.filter(e => !e.dead && e.age > .5);
  if (!en.length) { g.fire('touch-fire', 'pointerup'); return; }
  const p = g.K.player; en.sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z));
  g.T.setAimAt([en[0].x, en[0].y, en[0].z]);
  if (!g.K.input.firing) g.fire('touch-fire', 'pointerdown');
}

test('solo: waves advance, squads use tactics, no errors', () => {
  clock = 1000;
  const relay = makeRelay(), g = makeGame('Solo', relay);
  g.frame();
  assert.equal(g.el('online-btn').hidden, false, 'online button shows when the relay exists');
  g.fire('play');
  assert.equal(g.K.state, 'playing');
  g.T.setInvulnerable(true);
  const modes = new Set(), roles = new Set();
  run([g], relay, 3600, i => { if (i % 2 === 0) hunt(g); for (const e of g.K.enemies) { modes.add(e.mode); roles.add(e.role); } });
  assert.deepEqual(g.errors.map(String), []);
  assert.ok(g.K.stats.wave >= 3, `reached wave ${g.K.stats.wave}`);
  assert.ok(g.K.stats.kills >= 10, `kills ${g.K.stats.kills}`);
  assert.ok(roles.has('flank') && roles.has('suppress'), [...roles].join());
  assert.ok(modes.has('cover') || modes.has('flank'), [...modes].join());
  console.log('solo', JSON.stringify({ wave: g.K.stats.wave, kills: g.K.stats.kills, modes: [...modes], roles: [...roles] }));
});

test('solo: robots stop shooting when attack tokens are taken', () => {
  clock = 1000;
  const relay = makeRelay(), g = makeGame('Tok', relay);
  g.frame(); g.fire('play'); g.T.setInvulnerable(true);
  let maxCharging = 0;
  run([g], relay, 1500, () => { maxCharging = Math.max(maxCharging, g.K.enemies.filter(e => e.charge > 0 && !e.boss).length); });
  assert.deepEqual(g.errors.map(String), []);
  assert.ok(maxCharging <= 3, `charging at once ${maxCharging}`);
});

test('co-op: guest mirrors robots, scores kills, gets revived; invite link and host migration work', async () => {
  clock = 1000;
  const relay = makeRelay();
  const host = makeGame('Host', relay), guest = makeGame('Guest', relay);
  host.frame(); guest.frame();
  host.fire('online-btn'); host.fire('online-create'); await tick();
  assert.equal(host.el('room-code').textContent, 'AB3K');
  guest.fire('online-btn'); guest.el('online-code').value = 'ab3k'; guest.fire('online-join'); await tick(); relay.flush();
  assert.equal(guest.el('room-start').disabled, true, 'only the host can start');
  assert.match(guest.el('room-start').textContent, /Waiting/);
  host.fire('room-start'); relay.flush();
  assert.equal(host.K.net.live, true);
  assert.equal(guest.el('room-start').textContent, 'Join match');
  guest.fire('room-start');
  host.T.setInvulnerable(true); guest.T.setInvulnerable(true);
  run([host, guest], relay, 1200, i => { if (i % 2 === 0) { hunt(host); hunt(guest); } });
  for (const g of [host, guest]) assert.deepEqual(g.errors.map(String), []);
  const hs = host.K.stats, gs = guest.K.stats;
  assert.equal(gs.wave, hs.wave, 'same wave');
  assert.ok(Math.abs(guest.K.enemies.length - host.K.enemies.length) <= 2, `guest ${guest.K.enemies.length} vs host ${host.K.enemies.length}`);
  assert.ok(gs.kills > 0, `guest kills credited (${gs.kills})`);
  assert.ok(hs.wave >= 2, `host wave ${hs.wave}`);
  assert.equal(host.K.net.players, 2);
  console.log('coop', JSON.stringify({ wave: hs.wave, hostEnemies: host.K.enemies.length, guestEnemies: guest.K.enemies.length, guestKills: gs.kills, hostKills: hs.kills, sent: [...relay.rooms.get('AB3K').sockets].map(s => s.sent) }));
  // Message budget: at most ~10 packets per second per client.
  const r = [...relay.rooms.get('AB3K').sockets];
  for (const s of r) assert.ok(s.sent <= 1200 * 33 / 1000 * 10 + 5, `sent ${s.sent}`);
  // A third player drops in through the invite link.
  const late = makeGame('Late', relay, { search: '?arena=ab3k' });
  late.frame(); await tick(); relay.flush();
  assert.equal(late.el('room-code').textContent, 'AB3K', 'invite link opens the room');
  late.fire('room-start');
  run([host, guest, late], relay, 150, i => { if (i % 2 === 0) hunt(host); });
  assert.equal(late.K.state, 'playing');
  assert.ok(late.K.enemies.length > 0 || host.K.enemies.length === 0);
  // Down and revive: the guest goes down, the host stands next to it.
  guest.T.setInvulnerable(false); guest.T.damage(500); run([host, guest, late], relay, 3);
  assert.equal(guest.K.player.down, true);
  const gp = guest.K.player; host.T.setPlayer({ x: gp.x + .8, z: gp.z, y: 1.72 });
  run([host, guest, late], relay, 90, () => { const p = guest.K.player; host.T.setPlayer({ x: p.x + .8, z: p.z, y: 1.72, vx: 0, vz: 0 }); });
  assert.equal(guest.K.player.down, false, 'revived');
  assert.ok(guest.K.player.hp >= 40);
  // The host leaves; the guest takes over the robots.
  host.fire('quit'); relay.flush();
  const before = guest.K.stats.spawned + guest.K.stats.wave * 100;
  run([guest, late], relay, 700, i => { if (i % 2 === 0) { hunt(guest); hunt(late); } });
  for (const g of [guest, late]) assert.deepEqual(g.errors.map(String), []);
  assert.equal(guest.K.net.host, true, 'guest became host');
  assert.ok(guest.K.stats.spawned + guest.K.stats.wave * 100 > before, 'new host keeps the waves going');
  assert.ok(Math.abs(late.K.enemies.length - guest.K.enemies.length) <= 2);
  // Online runs never touch the solo leaderboard keys.
  for (const g of [host, guest, late]) for (const k of g.storage.keys()) assert.ok(!k.startsWith('kiln-best'), k);
});

test('deathmatch: hits are capped, deaths credit the shooter, respawn and round clock work', async () => {
  clock = 1000;
  const relay = makeRelay();
  const a = makeGame('Alpha', relay), b = makeGame('Bravo', relay);
  a.frame(); b.frame();
  a.fire('online-btn'); a.fire('mode-dm'); a.fire('online-quick'); await tick(); await tick();
  const code = a.el('room-code').textContent;
  assert.match(code, /^QK/);
  b.fire('online-btn'); b.fire('mode-dm'); b.fire('online-quick'); await tick(); await tick(); relay.flush();
  assert.equal(b.el('room-code').textContent, code, 'quick match finds the open deathmatch room');
  a.fire('room-start'); relay.flush(); b.fire('room-start');
  run([a, b], relay, 30);
  assert.equal(a.K.stats.mission, 'dm');
  assert.equal(a.K.stats.barrels, 0);
  // Face each other at 8 m in the open centre lane.
  const place = () => { a.T.setPlayer({ x: 0, z: 14, y: 1.72, vx: 0, vz: 0 }); b.T.setPlayer({ x: 0, z: 6, y: 1.72, vx: 0, vz: 0 }); a.T.setAimAt([0, 1.2, 6]); };
  run([a, b], relay, 70, place); // spawn protection runs out
  const hpBefore = b.K.player.hp;
  a.T.shoot(); run([a, b], relay, 6, place);
  assert.ok(b.K.player.hp < hpBefore && b.K.player.hp >= hpBefore - 45, `hit applied ${hpBefore} -> ${b.K.player.hp}`);
  for (let i = 0; i < 12 && !b.K.player.dead; i++) { run([a, b], relay, 4, place); a.T.shoot(); }
  run([a, b], relay, 6, place);
  assert.equal(b.K.player.dead, true, 'victim died');
  assert.equal(a.K.stats.kills, 1, 'shooter credited');
  assert.equal(a.el('score').textContent, '1');
  run([a, b], relay, 120);
  assert.equal(b.K.player.dead, false, 'respawned');
  assert.equal(b.K.player.hp, 100);
  assert.match(a.el('objective-title').textContent, /^4:5\d$/);
  // A cheating client sends 500 damage and a burst of 40 hits: the victim caps each hit and the rate.
  run([a, b], relay, 60, place);
  const aRoom = [...relay.rooms.get(code).sockets].find(s => s.self.name === 'Alpha');
  aRoom.send({ ev: [{ t: 'h', to: b.K.__self || [...relay.rooms.get(code).sockets].find(s => s.self.name === 'Bravo').self.id, d: 500 }] }); relay.flush();
  assert.equal(b.K.player.hp, 100 - 45, `single forged hit capped (${b.K.player.hp})`);
  const bId = [...relay.rooms.get(code).sockets].find(s => s.self.name === 'Bravo').self.id;
  run([a, b], relay, 40, place); // regenerate a little and leave the 1 s window
  b.T.setPlayer({ hp: 100 });
  aRoom.send({ ev: Array.from({ length: 40 }, () => ({ t: 'h', to: bId, d: 2 })) }); relay.flush();
  assert.ok(b.K.player.hp >= 100 - 15 * 2, `rate capped (${b.K.player.hp})`);
  console.log('dm', JSON.stringify({ aKills: a.K.stats.kills, bHp: b.K.player.hp }));
  for (const g of [a, b]) assert.deepEqual(g.errors.map(String), []);
});
