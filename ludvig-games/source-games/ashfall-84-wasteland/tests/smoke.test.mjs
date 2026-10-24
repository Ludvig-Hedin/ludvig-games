// Headless smoke test: runs the real game script twice in Node with stubbed WebGL, canvas and DOM,
// joins both copies through an in-memory relay that mimics Ludvig.mp, and plays a co-op run.
// It catches runtime errors and checks that the guest mirrors the host's enemies and sees the host.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const html = readFileSync(fileURLToPath(new URL('../index.html', import.meta.url)), 'utf8');
const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/g)].map(m => m[2]);
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);

let clock = 0;
const noop = () => {};

function glStub() {
  return new Proxy({}, {
    get(_, k) {
      if (typeof k !== 'string') return undefined;
      if (/^[A-Z_0-9]+$/.test(k)) return 1;
      if (k === 'getShaderParameter' || k === 'getProgramParameter') return () => true;
      if (k === 'getAttribLocation') return () => 0;
      if (k === 'checkFramebufferStatus') return () => 1;
      return () => ({});
    },
  });
}
function ctxStub() {
  return new Proxy({}, {
    get(_, k) {
      if (k === 'createRadialGradient' || k === 'createLinearGradient') return () => ({ addColorStop: noop });
      if (k === 'measureText') return () => ({ width: 10 });
      return noop;
    },
    set: () => true,
  });
}
function makeEl(id) {
  const el = {
    id, hidden: false, disabled: false, value: '', textContent: '', innerHTML: '', clientWidth: 270, width: 300, height: 150,
    style: { setProperty: noop }, dataset: {}, listeners: {},
    classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    addEventListener(t, f) { (this.listeners[t] ||= []).push(f); }, removeEventListener: noop,
    append: noop, prepend: noop, appendChild: noop, replaceChildren: noop, remove: noop, focus: noop, blur: noop,
    setPointerCapture: noop, releasePointerCapture: noop, requestPointerLock: noop, setAttribute: noop, getAttribute: () => null,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
    querySelector: () => makeEl(), querySelectorAll: () => [],
    getContext: type => (type === '2d' ? ctxStub() : glStub()),
  };
  return el;
}

function makeGame(name, relay, touch, search = '') {
  const els = new Map(ids.map(id => [id, makeEl(id)]));
  const winListeners = {};
  let raf = null;
  const errors = [];
  const storage = new Map();
  const document = {
    getElementById: id => els.get(id) || null,
    createElement: () => makeEl(),
    createTextNode: () => ({}),
    querySelectorAll: () => [],
    addEventListener: noop,
    exitPointerLock: noop,
    pointerLockElement: null,
    hidden: false,
    body: { classList: { add: noop, remove: noop, toggle: noop } },
    documentElement: {},
  };
  const player = { id: name + '-id-0000000000000', name };
  const sandbox = {
    document, console, URL, URLSearchParams, AbortController, setTimeout: noop, clearTimeout: noop,
    innerWidth: 390, innerHeight: 844, devicePixelRatio: 3,
    navigator: { onLine: true },
    location: { protocol: 'https:', search, href: 'https://games.example/ashfall-84-wasteland/', pathname: '/ashfall-84-wasteland/', hash: '' },
    history: { replaceState: noop },
    matchMedia: q => ({ matches: touch && q.includes('coarse') }),
    localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, String(v)), removeItem: k => storage.delete(k) },
    performance: { now: () => clock },
    requestAnimationFrame: cb => { raf = cb; },
    addEventListener: (t, f) => { (winListeners[t] ||= []).push(f); },
    HTMLInputElement: class {},
    ASHFALL_TEST_MODE: true,
  };
  sandbox.window = sandbox;
  sandbox.Ludvig = { player, mp: relay.client(player) };
  vm.createContext(sandbox);
  for (const code of scripts) vm.runInContext(code, sandbox);
  const fire = (id, type = 'click', ev = {}) => {
    for (const f of els.get(id).listeners[type] || []) f({ currentTarget: els.get(id), preventDefault: noop, stopPropagation: noop, ...ev });
  };
  return {
    els, errors, sandbox, fire,
    key(type, code) { for (const f of winListeners[type] || []) f({ code, target: {}, repeat: false, preventDefault: noop }); },
    frame() { const cb = raf; raf = null; try { cb && cb(clock); } catch (e) { errors.push(e); } },
    status: () => sandbox.ashfall.getStatus(),
  };
}

// In-memory relay with the Ludvig.mp room API. Messages are delivered on flush() as JSON copies.
function makeRelay() {
  const rooms = new Map();
  const queue = [];
  let n = 0;
  function client(player) {
    function open(code, max) {
      let r = rooms.get(code);
      if (!r) { r = { code, peers: [], meta: {}, max, sockets: new Set() }; rooms.set(code, r); }
      const self = { id: player.id.slice(0, 8), name: player.name, joinedAt: ++n };
      const handlers = {};
      const room = {
        code, self, seed: 7, max, public: false,
        get peers() { return r.peers.slice(); }, get host() { return r.peers[0]?.id; }, get meta() { return r.meta; },
        on(t, f) { (handlers[t] ||= new Set()).add(f); return () => handlers[t].delete(f); },
        off(t, f) { handlers[t]?.delete(f); },
        emit(t, ...a) { for (const f of handlers[t] || []) f(...a); },
        send(data) { const json = JSON.stringify(data); assert.ok(json.length <= 4096, 'message under 4 KB'); for (const s of r.sockets) if (s !== room) queue.push(() => s.emit('message', self.id, JSON.parse(json), false)); return true; },
        sendTo(to, data) { for (const s of r.sockets) if (s.self.id === to) queue.push(() => s.emit('message', self.id, JSON.parse(JSON.stringify(data)), true)); return true; },
        setMeta(meta) { r.meta = JSON.parse(JSON.stringify(meta)); for (const s of r.sockets) queue.push(() => s.emit('meta', r.meta)); },
        leave() { const host = r.peers[0]?.id; r.sockets.delete(room); r.peers = r.peers.filter(p => p.id !== self.id); for (const s of r.sockets) { queue.push(() => s.emit('leave', self)); if (host !== r.peers[0]?.id) queue.push(() => s.emit('host', r.peers[0]?.id)); } },
        sent: 0,
      };
      const send = room.send; room.send = d => { room.sent++; return send(d); };
      for (const s of r.sockets) queue.push(() => s.emit('join', self));
      r.peers.push(self); r.sockets.add(room);
      return room;
    }
    return {
      create: async o => open('AB3K', o.max || 4),
      join: async o => { if (o.quick) return open('AB3K', o.max || 4); if (!rooms.has(o.room)) throw Object.assign(new Error('nf'), { code: 'not-found' }); return open(o.room, 4); },
      list: async () => [],
    };
  }
  return { client, rooms, flush() { while (queue.length) queue.shift()(); } };
}

test('solo run plays 40 s without errors', () => {
  clock = 1000;
  const relay = makeRelay();
  const g = makeGame('Solo', relay, false);
  g.frame();
  g.fire('start');
  assert.equal(g.status().state, 'playing');
  g.key('keydown', 'KeyW');
  for (let i = 0; i < 1200; i++) {
    clock += 33;
    if (i === 300) g.fire('world', 'pointerdown', { pointerType: 'mouse', button: 0, clientX: 10, clientY: 10 });
    if (i === 900) g.key('keyup', 'KeyW');
    g.frame();
  }
  assert.deepEqual(g.errors.map(String), []);
  const st = g.status();
  assert.ok(['playing', 'dead'].includes(st.state), st.state);
  assert.ok(st.enemies >= 1);
});

test('two-player co-op: guest mirrors host enemies and both stay in sync', async () => {
  clock = 1000;
  const relay = makeRelay();
  const host = makeGame('Host', relay, false);
  const guest = makeGame('Guest', relay, true);
  host.frame(); guest.frame();
  assert.equal(host.els.get('online-btn').hidden, false, 'online button visible when the relay exists');
  host.fire('online-btn');
  host.fire('online-create');
  await new Promise(r => setImmediate(r));
  assert.equal(host.els.get('room-code').textContent, 'AB3K');
  guest.fire('online-btn');
  guest.els.get('online-code').value = 'ab3k';
  guest.fire('online-join');
  await new Promise(r => setImmediate(r));
  relay.flush();
  assert.equal(guest.els.get('room-start').hidden, true, 'only the host can start');
  host.fire('room-start');
  for (let i = 0; i < 1500; i++) {
    clock += 33;
    host.frame(); guest.frame();
    relay.flush();
    if (i === 400) guest.fire('fire', 'pointerdown');
    if (i === 700) guest.fire('fire', 'pointerup');
  }
  // A third player drops in through the invite link while the run is live.
  const late = makeGame('Late', relay, true, '?wastes=ab3k');
  await new Promise(r => setImmediate(r));
  relay.flush();
  for (let i = 0; i < 150; i++) { clock += 33; host.frame(); guest.frame(); late.frame(); relay.flush(); }
  for (const g of [host, guest, late]) assert.deepEqual(g.errors.map(String), []);
  const hs = host.status(), gs = guest.status(), ls = late.status();
  assert.equal(hs.state, 'playing');
  assert.equal(gs.state, 'playing');
  assert.equal(ls.state, 'playing', 'invite link joins the live run');
  assert.ok(hs.enemies > 0);
  assert.ok(Math.abs(gs.enemies - hs.enemies) <= 1, `guest ${gs.enemies} vs host ${hs.enemies}`);
  assert.ok(Math.abs(ls.enemies - hs.enemies) <= 1, `late ${ls.enemies} vs host ${hs.enemies}`);
  // Downed and revived: the guest goes down, the host walks over and holds E.
  const T = n => { for (let i = 0; i < n; i++) { clock += 33; host.frame(); guest.frame(); late.frame(); relay.flush(); } };
  for (const g of [host, guest, late]) g.sandbox.ashfall.test.setPlayer({ invuln: 99, down: false, hp: 100 });
  T(5);
  guest.sandbox.ashfall.test.setPlayer({ invuln: 0 });
  guest.sandbox.ashfall.test.hurt(500);
  assert.equal(guest.status().down, true, 'co-op damage downs instead of ending the run');
  assert.equal(guest.status().state, 'playing');
  const gp = guest.sandbox.ashfall.test.player();
  host.sandbox.ashfall.test.setPlayer({ x: gp.x + 1, z: gp.z, px: gp.x + 1, pz: gp.z, yaw: -Math.PI / 2 });
  T(10);
  host.key('keydown', 'KeyE');
  T(95);
  host.key('keyup', 'KeyE');
  T(10);
  assert.equal(guest.status().down, false, 'held revive brings the guest back');
  assert.equal(guest.status().health, 40);
  // The host leaves; the guest takes over the enemies and the run keeps going.
  const before = guest.status().enemies;
  host.fire('pause-btn');
  host.fire('quit');
  relay.flush();
  assert.equal(guest.sandbox.ashfall.test.host(), true, 'guest is the new host');
  for (let i = 0; i < 300; i++) { clock += 33; guest.frame(); late.frame(); relay.flush(); }
  for (const g of [host, guest, late]) assert.deepEqual(g.errors.map(String), []);
  assert.equal(guest.status().state, 'playing');
  assert.ok(guest.status().enemies >= 1 && before >= 1);
  assert.ok(Math.abs(late.status().enemies - guest.status().enemies) <= 1, 'late player follows the new host');
  const room = relay.rooms.get('AB3K');
  for (const s of room.sockets) assert.ok(s.sent / ((s.self.name === 'Late' ? 565 : 1965) * 0.033) <= 10.5, `${s.self.name} sent ${s.sent} packets`);
  assert.equal(host.sandbox.localStorage.getItem('ashfall-runs'), null, 'co-op never writes the solo run count');
});
