// Headless smoke test of app.js without a browser. Not shipped (build.py skips tests/).
// Fake DOM from index.html, stubbed WebGL/audio/recorder, and a fake Ludvig relay that
// links two app instances. Drives a local fight and a full online round.
// Usage: node tests/app-smoke.cjs
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const dir = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
const src = Object.fromEntries(['roster.js', 'engine.js', 'app.js'].map(f => [f, fs.readFileSync(path.join(dir, f), 'utf8')]));

/* ---- Minimal DOM ---- */
function makeDom() {
  const all = [], byId = {};
  const el = (tag, attrs = {}, parent = null) => {
    const classes = new Set((attrs.class || '').split(/\s+/).filter(Boolean));
    const e = {
      tag, attrs, parent, children: [], listeners: {}, style: {}, textContent: '', innerHTML: '', value: attrs.value || '', disabled: 'disabled' in attrs, open: false, tabIndex: 0, scrollTop: 0,
      dataset: Object.fromEntries(Object.entries(attrs).filter(([k]) => k.startsWith('data-')).map(([k, v]) => [k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase()), v])),
      classList: { add: (...c) => c.forEach(x => classes.add(x)), remove: (...c) => c.forEach(x => classes.delete(x)), toggle: (c, on) => { const v = on === undefined ? !classes.has(c) : !!on; v ? classes.add(c) : classes.delete(c); return v; }, contains: c => classes.has(c) },
      get className() { return [...classes].join(' '); }, set className(v) { classes.clear(); String(v).split(/\s+/).filter(Boolean).forEach(x => classes.add(x)); },
      addEventListener(t, f) { (this.listeners[t] ||= []).push(f); },
      dispatch(t, ev = {}) { for (const f of this.listeners[t] || []) f({ target: this, preventDefault() { }, key: '', ...ev }); },
      click() { if (!this.disabled) this.dispatch('click'); },
      setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return this.attrs[k] ?? null; },
      appendChild(c) { c.parent = this; this.children.push(c); return c; },
      closest(sel) { let n = this; while (n) { if (matches(n, sel)) return n; n = n.parent; } return null; },
      matches(sel) { return sel.split(',').some(s => matches(this, s.trim())); },
      focus() { }, blur() { }, select() { }, showModal() { this.open = true; }, close() { this.open = false; },
      getBoundingClientRect() { return { left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100 }; }
    };
    Object.defineProperty(e, 'innerHTML', { get() { return this._html || ''; }, set(v) { this._html = v; this.children = []; } });
    all.push(e); if (attrs.id) byId[attrs.id] = e; if (parent) parent.children.push(e);
    return e;
  };
  const matches = (n, sel) => {
    if (sel.startsWith('#')) return n.attrs.id === sel.slice(1);
    if (sel.startsWith('.')) return n.classList.contains(sel.slice(1));
    const m = sel.match(/^\[([a-z-]+)(?:="?([^"\]]*)"?)?\]$/); if (m) return m[1] in n.attrs && (m[2] === undefined || n.attrs[m[1]] === m[2]);
    if (/^[a-z]+$/.test(sel)) return n.tag === sel;
    if (sel === 'dialog[open]') return n.tag === 'dialog' && n.open;
    return false;
  };
  // Parse tags (good enough for our own markup).
  const stack = [el('root')];
  const re = /<(\/?)([a-z0-9]+)([^>]*)>/gi; let m;
  const voids = new Set(['meta', 'link', 'input', 'br', 'hr', 'path', 'circle', 'img']);
  while ((m = re.exec(html))) {
    const [, close, tag, rest] = m;
    if (close) { if (stack.length > 1 && stack[stack.length - 1].tag === tag) stack.pop(); continue; }
    const attrs = {}; rest.replace(/([a-z-]+)(?:="([^"]*)")?/gi, (_, k, v) => { attrs[k] = v ?? ''; });
    const e = el(tag, attrs, stack[stack.length - 1]);
    if (!voids.has(tag) && !rest.trim().endsWith('/')) stack.push(e);
  }
  const query = (sel) => { const parts = sel.trim().split(/\s+/); if (parts.length === 1) return all.filter(n => n.matches(parts[0])); const anc = query(parts[0]); return all.filter(n => n.matches(parts[1]) && anc.some(a => { let p = n.parent; while (p) { if (p === a) return true; p = p.parent; } return false; })); };
  const document = { body: el('body', {}), getElementById: id => byId[id] || null, querySelectorAll: query, querySelector: s => query(s)[0] || null, createElement: t => el(t, {}), addEventListener() { }, activeElement: null, hidden: false };
  document.body = all.find(n => n.tag === 'body');
  return { document, byId, query };
}

/* ---- Fake relay (Ludvig.mp) ---- */
const rooms = new Map(); let nextPeer = 1, clock = 1000;
function relayClient(playerName) {
  const self = { id: 'p' + nextPeer++, name: playerName };
  const mk = (code, create) => {
    let r = rooms.get(code); if (!r) { if (!create) throw new Error('no room'); r = { code, peers: [], seed: 123, meta: {}, clients: new Map() }; rooms.set(code, r); }
    const handlers = {};
    const emit = (t, ...a) => (handlers[t] || []).forEach(f => f(...a));
    const peer = { ...self, joinedAt: clock++ };
    r.peers.push(peer);
    const api = {
      code, self: peer, get peers() { return r.peers.slice(); }, get host() { return r.peers[0]?.id; }, seed: r.seed, get meta() { return r.meta; },
      on(t, f) { (handlers[t] ||= []).push(f); },
      send(d) { const msg = JSON.parse(JSON.stringify(d)); for (const [id, c] of r.clients) if (id !== peer.id) setImmediate(() => c.emit('message', peer.id, msg)); },
      sendTo(id, d) { const c = r.clients.get(id), msg = JSON.parse(JSON.stringify(d)); if (c) setImmediate(() => c.emit('message', peer.id, msg)); },
      setMeta(m) { r.meta = m; }, leave() { r.peers = r.peers.filter(p => p.id !== peer.id); r.clients.delete(peer.id); for (const c of r.clients.values()) setImmediate(() => { c.emit('leave', peer); c.emit('host', r.peers[0]?.id); }); }
    };
    r.clients.set(peer.id, { emit });
    for (const [id, c] of r.clients) if (id !== peer.id) setImmediate(() => c.emit('join', peer));
    return api;
  };
  return { player: self, setName(n) { self.name = n; }, scores: [], async score(slug, v) { this.scores.push([slug, v]); return { ok: true }; }, async top() { return { entries: [{ rank: 1, name: 'Brave Pigeon 42', score: 9 }], you: null }; },
    mp: { async create() { return mk('ABCD', true); }, async join(o) { return mk(o.quick ? 'ABCD' : o.room, !!o.quick); }, async list() { return []; } } };
}

/* ---- App instance ---- */
function app(name, withLudvig) {
  const { document, byId } = makeDom();
  const frames = []; let now = 0;
  const location = { protocol: 'https:', origin: 'https://games.test', pathname: '/games/anything-arena/index.html', search: '', hash: '' };
  const ctx = { console, document, location, crypto: globalThis.crypto, setTimeout, clearTimeout, setImmediate, URLSearchParams, TextEncoder, TextDecoder, Date, Math, JSON,
    navigator: { onLine: true, clipboard: { writeText: async () => { } } }, localStorage: (() => { const m = new Map(); return { getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)) }; })(),
    history: { replaceState(_, __, url) { const i = url.indexOf('#'); location.hash = i >= 0 ? url.slice(i) : ''; } },
    matchMedia: () => ({ matches: false }), requestAnimationFrame: f => frames.push(f), performance: { now: () => now }, addEventListener() { } };
  ctx.window = ctx; ctx.parent = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  ctx.__ludvigMissing = !withLudvig; if (withLudvig) ctx.Ludvig = relayClient(name);
  vm.runInContext(src['roster.js'], ctx, { filename: 'roster.js' });
  vm.runInContext(src['engine.js'], ctx, { filename: 'engine.js' });
  const real = ctx.ArenaEngine;
  const stubs = { render: { Renderer: class { constructor() { this.reducedMotion = false; this.contextLost = false; this.sets = 0; } setFighters() { this.sets++; } effects() { } render() { } } },
    audio: { AudioEngine: class { constructor() { this.muted = false; } unlock() { } reset() { } click() { } beep() { } win() { } hits() { } update() { } toggle() { return this.muted = !this.muted; } } },
    recorder: { ClipRecorder: class { supported() { return false; } pause() { } stop() { } } } };
  ctx.ArenaEngine = { require: id => stubs[id] || real.require(id) };
  vm.runInContext(src['app.js'], ctx, { filename: 'app.js' });
  const tick = (n = 1, dt = 500) => { for (let i = 0; i < n; i++) { now += dt; const f = frames.splice(0); f.forEach(fn => fn(now)); } };
  const snap = () => ctx.__ARENA__.snapshot();
  return { ctx, byId, tick, snap, document };
}
const wait = ms => new Promise(r => setTimeout(r, ms));
const text = (a, id) => a.byId[id].textContent;
const hidden = (a, id) => a.byId[id].classList.contains('hidden');

(async () => {
  // Local mode without Ludvig: online hidden, local fight works.
  const solo = app('solo', false);
  assert.ok(hidden(solo, 'where-seg'), 'online toggle should be hidden without Ludvig');
  solo.byId['fight'].click();
  solo.tick(80);
  assert.equal(solo.snap().phase, 'result', 'local fight did not finish');
  assert.ok(text(solo, 'winner-name').length > 0);
  assert.ok(solo.ctx.location.hash.startsWith('#fight=2~'), 'share hash missing');
  const hash = solo.ctx.location.hash, fp = solo.snap().fingerprint;
  // Team mode, 4 fighters a side via the add button.
  solo.byId['new-fight'].click();
  solo.document.querySelectorAll('#mode-seg button').find(b => b.dataset.mode === 'team').click();
  assert.equal(solo.snap().picks[0].length, 3);
  const add = solo.byId['slots-a'].children.find(c => c.className === 'add-slot'); add.click();
  assert.ok(solo.byId['picker'].open, 'picker did not open');
  solo.byId['picker-grid'].dispatch('click', { target: { closest: () => ({ dataset: { id: 'surstromming' } }) } });
  assert.equal(solo.snap().picks[0].length, 4); assert.equal(solo.snap().picks[0][3], 'surstromming');
  solo.byId['fight'].click(); solo.tick(90);
  assert.equal(solo.snap().phase, 'result', '4v3 fight did not finish');
  // Share link replays identically in a fresh instance.
  // Load the share code in a fresh instance and replay it.
  const loaded = app('loaded', false);
  loaded.byId['import-code'].value = hash; loaded.byId['import-fight'].click();
  loaded.byId['fight'].click(); loaded.tick(80);
  assert.equal(loaded.snap().fingerprint, fp, 'shared fight did not replay identically');
  console.log('ok  local: 1v1 fight, team 4v3 fight, share code replays identically, online hidden without Ludvig');

  // Online: two players.
  const host = app('Host', true), guest = app('Guest', true);
  assert.ok(!hidden(host, 'where-seg'), 'online toggle should show with Ludvig');
  host.document.querySelectorAll('[data-where]').find(b => b.dataset.where === 'online').click();
  host.byId['create'].click(); await wait(50);
  assert.equal(text(host, 'room-code'), 'ABCD');
  guest.document.querySelectorAll('[data-where]').find(b => b.dataset.where === 'online').click();
  guest.byId['join-code'].value = 'abcd'; guest.byId['join'].click();
  await wait(1200); // auto team assignment after 900 ms
  host.tick(1); guest.tick(1);
  assert.equal(host.snap().online.host, true); assert.equal(guest.snap().online.host, false);
  // Host picks 2v2 and starts picking.
  host.document.querySelectorAll('#size-seg button').find(b => b.dataset.size === '2').click(); await wait(30);
  host.byId['start-pick'].click(); await wait(50);
  assert.equal(guest.snap().online.phase, 'pick', 'guest did not enter pick phase');
  assert.ok(!hidden(guest, 'lock-row'), 'guest has no slots to pick');
  // Guest changes a fighter through the picker, both lock in.
  const gslot = guest.byId['room-a'].children.concat(guest.byId['room-b'].children).find(c => c.className.includes('mine'));
  gslot.click(); guest.byId['picker-grid'].dispatch('click', { target: { closest: () => ({ dataset: { id: 'alg' } }) } }); await wait(30);
  guest.byId['lock'].click(); host.byId['lock'].click();
  await wait(1300);
  host.tick(1); guest.tick(1);
  assert.equal(host.snap().phase !== 'preview', true, 'host battle did not start');
  assert.equal(guest.snap().seed, host.snap().seed, 'seed differs');
  assert.ok(guest.snap().picks !== null);
  host.tick(90); guest.tick(90); await wait(50);
  assert.equal(host.snap().phase, 'result'); assert.equal(guest.snap().phase, 'result');
  assert.equal(host.snap().fingerprint, guest.snap().fingerprint, 'online battle results differ');
  await wait(50); host.tick(1); guest.tick(1);
  assert.match(text(host, 'verify'), /SAME RESULT ON 2 DEVICES/);
  const scored = [...host.ctx.Ludvig.scores, ...guest.ctx.Ludvig.scores];
  const winner = host.snap().winner;
  assert.ok(winner === -1 || scored.length === 1 && scored[0][0] === 'anything-arena:wins' && scored[0][1] === 1, 'exactly the winner should submit 1 win');
  console.log(`ok  online: create + join by code, 2v2 picks, lock in, same seed, identical result on both devices, verify line "${text(host, 'verify')}", winner submitted ${JSON.stringify(scored)}`);
  // Rematch: host picks again; guest follows.
  host.byId['again'].click(); await wait(60);
  assert.equal(guest.snap().online.phase, 'pick'); assert.equal(guest.snap().online.round, 2);
  // Host leaves: guest becomes host.
  host.byId['leave'].click(); await wait(30); guest.tick(1);
  assert.equal(guest.snap().online.host, true, 'guest did not take over as host');
  console.log('ok  online: rematch round 2 reached guest; guest becomes host when host leaves');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
