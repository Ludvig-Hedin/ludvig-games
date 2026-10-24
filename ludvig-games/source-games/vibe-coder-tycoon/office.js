/* Vibe Coder Tycoon · top-down office, avatars and the shared-office relay (Ludvig.mp). */
'use strict';
(() => {
  const game = VCT.game, D = VCT.data;
  const SLUG = 'vibe-coder-tycoon';
  const $ = id => document.getElementById(id);
  const now = () => Date.now();
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rnd = (a, b) => a + Math.random() * (b - a);
  const canvas = $('officeCanvas'), ctx = canvas.getContext('2d');
  const W = 16, H = 10.5, WALL = 2.3;
  const AV_COLORS = ['#ffb84d', '#5fe0b0', '#ff6b8b', '#a690ff', '#6cc4ff', '#ffd86b', '#ff9ad5', '#9be36b'];
  const HATS = [['none', 'No hat'], ['beanie', 'Beanie'], ['cap', 'Cap'], ['phones', 'Headphones'], ['crown', 'Crown'], ['party', 'Party hat']];
  const SKINS = ['#f3cfae', '#e0ad84', '#b77b55', '#8a5a3c', '#f7dcc6', '#6b4430'];
  const MP_DESKS = {
    2: [[4.5, 4.3], [11.5, 4.3]],
    3: [[3, 4.3], [8, 4.3], [13, 4.3]],
    4: [[4.5, 3.95], [11.5, 3.95], [4.5, 7.35], [11.5, 7.35]],
  };
  const THEMES = [
    { floorA: '#463a4c', floorB: '#3f3445', wall: '#5a4a5f', trim: '#7a6680', desk: '#9a7655', deskTop: '#b08a66', kind: 'kitchen' },
    { floorA: '#3d3f48', floorB: '#3a3c45', wall: '#4b4e58', trim: '#6b6f7c', desk: '#6d5b4b', deskTop: '#83705e', kind: 'garage' },
    { floorA: '#5a4134', floorB: '#523b2f', wall: '#7a4136', trim: '#93564a', desk: '#2f2a33', deskTop: '#463f4c', kind: 'loft' },
    { floorA: '#2f3b52', floorB: '#2b364c', wall: '#38445e', trim: '#4f5d7c', desk: '#d9dde6', deskTop: '#eef0f5', kind: 'campus' },
  ];
  const ROBOT_COLORS = ['#9aa3b5', '#7fc8d8', '#a690ff', '#ffb84d', '#5fe0b0', '#ff6b8b', '#ffd86b', '#ffffff'];

  const hashStr = s => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); };
  const cleanText = (t, max) => String(t == null ? '' : t).normalize('NFC')
    .replace(/[\u0000-\u001f\u007f-\u009f\u00ad\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff]/g, '')
    .replace(/\s+/g, ' ').trim().slice(0, max);
  const cleanCode = c => (String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4)) || null;
  const num = (v, a, b, d = 0) => (typeof v === 'number' && isFinite(v) ? clamp(v, a, b) : d);

  const ludvig = () => (typeof window.Ludvig === 'object' && window.Ludvig) || null;
  const mpOk = () => { const L = ludvig(); return !!(L && L.mp && typeof L.mp.join === 'function' && typeof L.mp.create === 'function') && navigator.onLine !== false; };
  const myName = () => { const L = ludvig(); return cleanText(L && L.player && L.player.name, 16) || 'You'; };
  const myPlayerId = () => { const L = ludvig(); return (L && L.player && L.player.id) || 'local'; };

  /* ---------- local avatar ---------- */
  const me = { x: 8, y: 6.3, tx: null, ty: null, face: 'down', moving: false, walk: 0, bubble: null, typing: 0, stuck: 0 };
  const peers = new Map();
  const keys = new Set();
  let room = null, myId = null;
  let movedOnce = false;
  let fxRings = [];
  const api = { pairing: null, onTap, onShip, onChange, onTab };
  VCT.office = api;

  /* ---------- layout ---------- */
  let L = null;
  function members() {
    if (!room) return [];
    const list = [{ id: myId, joinedAt: joinedAt.get(myId) || 0 }];
    for (const p of peers.values()) list.push({ id: p.id, joinedAt: p.joinedAt || 0 });
    return list.sort((a, b) => (a.joinedAt - b.joinedAt) || (a.id < b.id ? -1 : 1));
  }
  const joinedAt = new Map();
  function relayout() {
    const S = game.S;
    const desks = [], obstacles = [], pods = [];
    let tier = S.office;
    if (room) {
      const list = members();
      const n = clamp(list.length, 2, 4);
      MP_DESKS[n].forEach(([x, y], i) => desks.push({ x, y, owner: list[i] ? list[i].id : null }));
      for (const p of peers.values()) if (p.desk) tier = Math.max(tier, num(p.desk.o, 0, 3));
    } else {
      desks.push({ x: 8, y: 4.3, owner: 'me' });
      const slots = [2, 6, 10, 10][S.office];
      const count = Math.min(S.agents, slots);
      const cols = 5, xs = [2.2, 5.1, 8, 10.9, 13.8];
      for (let i = 0; i < count; i++) {
        const r = Math.floor(i / cols), c = i % cols;
        const order = [2, 1, 3, 0, 4][c];
        if (S.office === 0) pods.push({ x: i === 0 ? 4.4 : 11.6, y: 4.5, i });
        else pods.push({ x: xs[order], y: 7.25 + r * 1.75, i });
      }
    }
    for (const d of desks) obstacles.push([d.x - 1.5, d.y - 0.7, 3, 1.25]);
    for (const p of pods) obstacles.push([p.x - 0.7, p.y - 0.45, 1.4, 0.75]);
    const coffee = game.hasCoffee() ? { x: 15.05, y: 2.75 } : null;
    if (coffee) obstacles.push([coffee.x - 0.4, coffee.y - 0.4, 0.8, 0.7]);
    if (tier === 0) obstacles.push([0.25, 2.0, 1.25, 1.2]);
    L = { desks, obstacles, pods, tier, coffee, theme: THEMES[tier] };
    // push avatar out if it ended up inside furniture
    resolve(me);
  }
  function deskOf(id) { return L && L.desks.find(d => d.owner === id); }
  function seatOf(id) { const d = deskOf(id); return d ? { x: d.x, y: d.y + 1.05 } : null; }

  /* ---------- canvas sizing ---------- */
  let cw = 0, ch = 0, dpr = 1, sc = 40, ox = 0, oy = 0;
  function resize() {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    cw = r.width; ch = r.height;
    canvas.width = Math.max(1, Math.round(cw * dpr));
    canvas.height = Math.max(1, Math.round(ch * dpr));
    sc = Math.min(cw / W, ch / H);
    ox = (cw - W * sc) / 2; oy = (ch - H * sc) / 2;
  }
  new ResizeObserver(resize).observe(canvas);
  const X = x => ox + x * sc, Y = y => oy + y * sc;

  /* ---------- input ---------- */
  canvas.addEventListener('pointerdown', e => {
    const r = canvas.getBoundingClientRect();
    const wx = (e.clientX - r.left - ox) / sc, wy = (e.clientY - r.top - oy) / sc;
    if (wx < 0 || wx > W || wy < 0 || wy > H) return;
    me.tx = clamp(wx, 0.4, W - 0.4); me.ty = clamp(wy, WALL + 0.3, H - 0.25);
    me.stuck = 0;
    fxRings.push({ x: me.tx, y: me.ty, t: now() });
    hideHint();
  });
  const KEYMAP = { ArrowLeft: 'l', ArrowRight: 'r', ArrowUp: 'u', ArrowDown: 'd', a: 'l', d: 'r', w: 'u', s: 'd', A: 'l', D: 'r', W: 'u', S: 'd' };
  document.addEventListener('keydown', e => {
    if (e.target.closest && e.target.closest('input, textarea')) return;
    if (game.modalOpen() || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = KEYMAP[e.key];
    if (!k) return;
    if (e.key.startsWith('Arrow')) e.preventDefault();
    keys.add(k); me.tx = null; hideHint();
  });
  document.addEventListener('keyup', e => { const k = KEYMAP[e.key]; if (k) keys.delete(k); });
  window.addEventListener('blur', () => keys.clear());
  function hideHint() { if (!movedOnce) { movedOnce = true; $('officeHint').style.opacity = '0'; } }
  if (matchMedia('(hover: hover) and (pointer: fine)').matches) $('officeHint').textContent = 'WASD, arrow keys or click to walk';

  /* ---------- movement ---------- */
  const R = 0.27;
  function resolve(a) {
    a.x = clamp(a.x, 0.35, W - 0.35);
    a.y = clamp(a.y, WALL + 0.25, H - 0.2);
    if (!L) return;
    for (const [rx, ry, rw, rh] of L.obstacles) {
      const cx = clamp(a.x, rx, rx + rw), cy = clamp(a.y, ry, ry + rh);
      const dx = a.x - cx, dy = a.y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 < R * R) {
        if (d2 > 1e-6) { const d = Math.sqrt(d2); a.x = cx + dx / d * R; a.y = cy + dy / d * R; }
        else {
          const l = a.x - rx, rr = rx + rw - a.x, t = a.y - ry, b = ry + rh - a.y;
          const m = Math.min(l, rr, t, b);
          if (m === l) a.x = rx - R; else if (m === rr) a.x = rx + rw + R; else if (m === t) a.y = ry - R; else a.y = ry + rh + R;
        }
      }
    }
    a.x = clamp(a.x, 0.35, W - 0.35);
    a.y = clamp(a.y, WALL + 0.25, H - 0.2);
  }
  function step(dt) {
    let vx = 0, vy = 0;
    if (keys.has('l')) vx -= 1; if (keys.has('r')) vx += 1;
    if (keys.has('u')) vy -= 1; if (keys.has('d')) vy += 1;
    if (!vx && !vy && me.tx != null) {
      const dx = me.tx - me.x, dy = me.ty - me.y, d = Math.hypot(dx, dy);
      if (d < 0.06) { me.tx = null; }
      else { vx = dx / d; vy = dy / d; if (d < 0.2) { vx *= d / 0.2; vy *= d / 0.2; } }
    }
    const mag = Math.hypot(vx, vy);
    me.moving = mag > 0.01;
    if (me.moving) {
      if (mag > 1) { vx /= mag; vy /= mag; }
      const sp = 3.4;
      const bx = me.x, by = me.y;
      me.x += vx * sp * dt; me.y += vy * sp * dt;
      resolve(me);
      me.walk += dt;
      me.face = Math.abs(vx) > Math.abs(vy) ? (vx < 0 ? 'left' : 'right') : (vy < 0 ? 'up' : 'down');
      const moved = Math.hypot(me.x - bx, me.y - by);
      if (me.tx != null && moved < sp * dt * 0.15) { me.stuck += dt; if (me.stuck > 0.35) me.tx = null; } else me.stuck = 0;
    }
    // coffee run
    if (L && L.coffee && Math.hypot(me.x - L.coffee.x, me.y - (L.coffee.y + 0.5)) < 0.75 && now() > coffeeReady) {
      coffeeReady = now() + 120000;
      game.addBuff('speed', 1.3, 45, 'Coffee run');
      game.toast('Coffee run!', 'Speed ×1.3 for 45 s.', 'good');
      game.sfx.pop();
      me.bubble = { text: '☕ ahh', until: now() + 2500 };
    }
  }
  let coffeeReady = 0;

  /* ---------- peers ---------- */
  function addPeer(info) {
    if (!info || !info.id || info.id === myId || peers.has(info.id)) return;
    joinedAt.set(info.id, info.joinedAt || now());
    peers.set(info.id, {
      id: info.id, name: cleanText(info.name, 16) || 'Coworker', joinedAt: info.joinedAt || now(),
      x: 8, y: H - 0.8, dx: 8, dy: H - 0.8, face: 'up', moving: false, walk: 0,
      av: { c: hashStr(info.id) % AV_COLORS.length, h: 0 }, desk: null, bubble: null, hi5At: 0, seen: now(),
    });
  }
  function removePeer(id) { peers.delete(id); joinedAt.delete(id); }
  function peerName(id) { const p = peers.get(id); return p ? p.name : 'Someone'; }

  /* ---------- network: rate-limited sender (≤10 msgs/s total) ---------- */
  const sentAt = [];
  const outbox = [];
  const RATE = 9; // strict sliding window: at most 9 sends in any 1 s, under the 10/s budget
  function token() {
    const t = performance.now();
    while (sentAt.length && t - sentAt[0] >= 1000) sentAt.shift();
    if (sentAt.length >= RATE) return false;
    sentAt.push(t);
    return true;
  }
  function rawSend(msg) {
    if (!room) return;
    try {
      if (msg.__to) { const to = msg.__to; delete msg.__to; room.sendTo(to, msg); }
      else room.send(msg);
    } catch { /* relay hiccup: next update repairs state */ }
  }
  function queueSend(msg, to) {
    if (!room) return;
    if (to) msg.__to = to;
    // collapse duplicates of the same kind and target so a slow link never piles up
    const i = outbox.findIndex(m => m.t === msg.t && m.__to === msg.__to && (msg.t === 's' || msg.t === 'tj' || msg.t === 'p'));
    if (i >= 0) outbox[i] = msg; else outbox.push(msg);
    if (outbox.length > 20) outbox.splice(0, outbox.length - 20);
  }
  function flush() { while (outbox.length && token()) rawSend(outbox.shift()); }

  let lastPos = { x: 0, y: 0, m: false, at: 0 };
  function posMsg() { return { t: 'p', x: Math.round(me.x * 100) / 100, y: Math.round(me.y * 100) / 100, f: me.face, m: me.moving ? 1 : 0 }; }
  function maybeSendPos() {
    if (!room) return;
    const t = now();
    const changed = Math.abs(me.x - lastPos.x) > 0.02 || Math.abs(me.y - lastPos.y) > 0.02 || me.moving !== lastPos.m;
    if (!changed || t - lastPos.at < 100) return;
    if (outbox.length) return; // important messages first
    if (!token()) return;
    lastPos = { x: me.x, y: me.y, m: me.moving, at: t };
    rawSend(posMsg());
  }
  function stateMsg() {
    const S = game.S;
    return { t: 's', n: myName(), av: { c: S.avatar.c, h: S.avatar.h }, d: game.deskStatus() };
  }
  let lastState = '', lastStateAt = 0;
  function maybeSendState(force) {
    if (!room) return;
    const st = stateMsg();
    const key = JSON.stringify([st.n, st.av, st.d.p, st.d.w, st.d.r, st.d.b, st.d.a, st.d.o]);
    const t = now();
    if (force || key !== lastState || t - lastStateAt > 3000) {
      if (!force && key === lastState && Math.abs(t - lastStateAt) < 3000) return;
      lastState = key; lastStateAt = t;
      queueSend(st);
    }
  }

  /* ---------- team app (host-authoritative, economy stays local) ---------- */
  let team = { n: D.teamName(), g: 0, T: 240, w: {} };
  let contrib = 0, contribAt = 0, teamDirtyAt = 0, teamDirty = false, helpTaps = [];
  const amHost = () => room && room.host === myId;
  const memberCount = () => (room ? peers.size + 1 : 1);
  const teamMsg = () => ({ t: 'tj', n: team.n, g: Math.round(team.g * 10) / 10, T: team.T, w: team.w });
  function hostAdd(id, s) {
    s = num(s, 0, 20);
    if (!s || memberCount() < 2) return;
    team.g += s;
    team.w[id] = Math.round(((team.w[id] || 0) + s) * 10) / 10;
    if (team.g >= team.T) {
      const done = { t: 'ts', n: team.n, T: team.T, w: team.w };
      queueSend(done);
      applyTeamShip(done);
      team = { n: D.teamName(), g: 0, T: 120 * memberCount(), w: {} };
    }
    teamDirty = true;
  }
  function applyTeamShip(m) {
    const T = num(m.T, 1, 1e6, 1);
    const w = m.w && typeof m.w === 'object' ? m.w : {};
    const share = num(w[myId], 0, T) / T;
    const partners = Object.keys(w).filter(id => id !== myId && peers.has(id)).map(peerName);
    game.teamShip(cleanText(m.n, 48) || 'Team app', partners, share);
    me.bubble = { text: 'we shipped!', until: now() + 4000 };
    feed(`Team app shipped: ${cleanText(m.n, 48)}`);
  }
  function teamTick(dt) {
    if (!room) return;
    if (memberCount() >= 2) contrib += dt * 0.1;
    const t = now();
    if (t - contribAt > 1500 && contrib > 0) {
      contribAt = t;
      if (amHost()) hostAdd(myId, contrib);
      else if (room.host) queueSend({ t: 'tc', s: Math.round(contrib * 100) / 100 }, room.host);
      contrib = 0;
    }
    if (amHost() && teamDirty && t - teamDirtyAt > 1000) {
      teamDirty = false; teamDirtyAt = t;
      queueSend(teamMsg());
    }
  }
  $('teamHelp').onclick = () => {
    const t = now();
    helpTaps = helpTaps.filter(x => t - x < 1000);
    if (helpTaps.length >= 8) return;
    helpTaps.push(t);
    if (memberCount() < 2) { game.toast('Need a coworker.', 'The team app needs at least 2 people in the office.'); return; }
    contrib += 0.6;
    game.sfx.tap();
    game.floatFrom($('teamHelp'), '+team', 'violet');
    me.typing = now();
  };

  /* ---------- incoming messages ---------- */
  function onMsg(from, data) {
    const id = typeof from === 'object' && from ? from.id : from;
    if (!id || id === myId || !data || typeof data !== 'object') return;
    let p = peers.get(id);
    if (!p) { addPeer({ id, name: data.n || 'Coworker', joinedAt: now() }); p = peers.get(id); relayout(); }
    p.seen = now();
    switch (data.t) {
      case 'p':
        p.x = num(data.x, 0, W, p.x); p.y = num(data.y, 0, H, p.y);
        p.face = ['up', 'down', 'left', 'right'].includes(data.f) ? data.f : p.face;
        p.moving = !!data.m;
        break;
      case 's': {
        const n = cleanText(data.n, 16); if (n.length >= 2) p.name = n;
        if (data.av && typeof data.av === 'object') p.av = { c: num(data.av.c, 0, AV_COLORS.length - 1) | 0, h: num(data.av.h, 0, HATS.length - 1) | 0 };
        const d = data.d && typeof data.d === 'object' ? data.d : {};
        const prevTier = p.desk ? p.desk.o : 0;
        p.desk = { p: cleanText(d.p, 60) || 'Untitled app', pct: num(d.pct, 0, 1), w: d.w ? 1 : 0, r: d.r ? 1 : 0,
          b: num(d.b, 0, 9) | 0, a: num(d.a, 0, 999) | 0, o: num(d.o, 0, 3) | 0, m: cleanText(d.m, 40), s: num(d.s, 0, 1e7) | 0 };
        if (p.desk.o !== prevTier) relayout();
        break;
      }
      case 'c': {
        const text = cleanText(data.x, 60);
        if (!text) break;
        p.bubble = { text, until: now() + 5500 };
        feed(`${p.name}: ${text}`, true);
        game.sfx.pop();
        break;
      }
      case 'h':
        if (data.to === myId) receiveHi5(p);
        break;
      case 'tc':
        if (amHost()) hostAdd(id, data.s);
        break;
      case 'tj':
        if (id === room.host) {
          team = { n: cleanText(data.n, 48) || team.n, g: num(data.g, 0, 1e6), T: num(data.T, 1, 1e6, 240), w: data.w && typeof data.w === 'object' ? sanitizeW(data.w) : {} };
        }
        break;
      case 'ts':
        if (id === room.host) applyTeamShip(data);
        break;
      case 'hello':
        queueSend(stateMsg(), id); queueSend(posMsg(), id);
        break;
    }
  }
  function sanitizeW(w) { const o = {}; for (const k of Object.keys(w).slice(0, 8)) o[String(k).slice(0, 40)] = num(w[k], 0, 1e6); return o; }

  /* ---------- high five, chat ---------- */
  function nearestPeer(maxD) {
    let best = null, bd = maxD;
    for (const p of peers.values()) {
      const d = Math.hypot(p.dx - me.x, p.dy - me.y);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }
  function hi5Effect(p) {
    game.addBuff('tap', 2, 20, 'High-five rush');
    game.addBuff('speed', 1.2, 20, 'High five');
    game.S.stats.hi5++;
    game.sfx.hi5();
    game.checkAch();
    const r = canvas.getBoundingClientRect();
    game.burst(r.left + X((me.x + p.dx) / 2), r.top + Y((me.y + p.dy) / 2 - 0.6), 40, ['#a690ff', '#ffd86b', '#ffffff']);
    me.bubble = { text: '✋', until: now() + 1800 };
    p.bubble = { text: '✋', until: now() + 1800 };
  }
  function sendHi5() {
    const p = nearestPeer(2.1);
    if (!p) return;
    if (now() - p.hi5At < 12000) { game.toast('Easy there.', `You just high-fived ${p.name}. Give their hand a second.`); return; }
    p.hi5At = now();
    queueSend({ t: 'h', to: p.id });
    hi5Effect(p);
    feed(`You high-fived ${p.name}`);
  }
  function receiveHi5(p) {
    if (now() - p.hi5At < 8000) { p.bubble = { text: '✋', until: now() + 1500 }; return; }
    p.hi5At = now();
    hi5Effect(p);
    feed(`${p.name} high-fived you`);
  }
  $('btnHi5').onclick = sendHi5;

  let lastChat = 0;
  function sendChat(text) {
    text = cleanText(text, 60);
    if (!text || !room) return;
    if (now() - lastChat < 1200) { game.toast('Slow down.', 'One bubble at a time.'); return; }
    lastChat = now();
    me.bubble = { text, until: now() + 5500 };
    queueSend({ t: 'c', x: text });
    game.S.stats.chats++;
    game.checkAch();
    feed(`You: ${text}`, true);
    game.sfx.pop();
  }
  $('btnSay').onclick = () => {
    const presets = D.CHAT_PRESETS.map((p, i) => `<button data-p="${i}">${game.esc(p)}</button>`).join('');
    game.modal(`<h2>Say something</h2><p>Your bubble shows over your avatar for a few seconds.</p>
      <div class="presets">${presets}</div>
      <div class="field"><input id="chatIn" maxlength="60" placeholder="Or type (60 characters max)" autocomplete="off" enterkeyhint="send"><button class="buy" id="chatSend">Send</button></div>
      <div class="row2"><button class="big-btn" data-close>Close</button></div>`);
    document.querySelectorAll('#sheet [data-p]').forEach(b => { b.onclick = () => { sendChat(D.CHAT_PRESETS[+b.dataset.p]); game.closeModal(); }; });
    const input = $('chatIn');
    const go = () => { sendChat(input.value); game.closeModal(); };
    $('chatSend').onclick = go;
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
  };

  /* ---------- office feed ---------- */
  const feedLines = [];
  function feed(text, chat) {
    feedLines.push({ text: cleanText(text, 90), chat, t: new Date() });
    if (feedLines.length > 30) feedLines.shift();
    const box = $('feed');
    box.textContent = '';
    for (const l of feedLines.slice().reverse()) {
      const div = document.createElement('div');
      const time = document.createElement('b');
      time.textContent = `${String(l.t.getHours()).padStart(2, '0')}:${String(l.t.getMinutes()).padStart(2, '0')} `;
      div.append(time, document.createTextNode(l.text));
      box.append(div);
    }
  }

  /* ---------- join / leave ---------- */
  let connecting = false;
  async function connect(mode, code) {
    if (!mpOk() || connecting) return;
    if (room) leave(true);
    connecting = true;
    setLobbyBusy(true);
    try {
      const Lv = ludvig();
      let r;
      if (mode === 'create') r = await Lv.mp.create({ game: SLUG, max: 4, visible: false });
      else if (mode === 'quick') r = await Lv.mp.join({ game: SLUG, quick: true, max: 4 });
      else r = await Lv.mp.join({ game: SLUG, room: code });
      if (!r) throw new Error('no room');
      attach(r);
    } catch (err) {
      const c = err && err.code;
      game.toast('Could not join.', c === 'not-found' ? `No office with code ${code}.` : c === 'full' ? 'That office is full.' : mode === 'code' && c !== 'offline' && c !== 'network' && c !== 'timeout' && c !== 'unavailable' ? 'That office code did not work.' : 'The office server did not answer. Solo play still works.', 'bad');
    } finally {
      connecting = false;
      setLobbyBusy(false);
    }
  }
  function attach(r) {
    room = r;
    myId = (r.self && r.self.id) || myPlayerId();
    peers.clear(); joinedAt.clear();
    for (const p of r.peers || []) {
      if (p.id === myId) joinedAt.set(myId, p.joinedAt || now());
      else addPeer(p);
    }
    if (!joinedAt.has(myId)) joinedAt.set(myId, now());
    if (memberCount() > 4) game.toast('Busy office.', 'More than 4 people here. Latecomers stand by the window.');
    r.on('join', p => {
      if (!p || p.id === myId) return;
      addPeer(p); relayout(); renderOfficeUi();
      feed(`${cleanText(p.name, 16) || 'Someone'} joined`);
      game.sfx.event();
      queueSend(stateMsg(), p.id);
      queueSend(posMsg(), p.id);
      if (amHost()) queueSend(teamMsg(), p.id);
      if (amHost() && memberCount() >= 2 && team.g === 0) team.T = 120 * memberCount();
    });
    r.on('leave', p => {
      const id = p && (p.id || p);
      if (!id || !peers.has(id)) return;
      feed(`${peerName(id)} left`);
      removePeer(id); relayout(); renderOfficeUi();
    });
    r.on('message', onMsg);
    r.on('host', () => { if (amHost()) { teamDirty = true; feed('You are now the office host'); } });
    r.on('close', () => { if (room === r) { feed('Disconnected'); leave(false); game.toast('Disconnected.', 'You are back in your solo office.', 'bad'); } });
    if (!game.S.avatar.set) { game.S.avatar.c = hashStr(myId) % AV_COLORS.length; buildAvatarUi(); game.save(); }
    relayout();
    const seat = seatOf(myId);
    if (seat) { me.x = seat.x; me.y = seat.y + 0.15; me.tx = null; resolve(me); }
    team = { n: D.teamName(), g: 0, T: 120 * Math.max(2, memberCount()), w: {} };
    lastState = ''; maybeSendState(true);
    queueSend({ t: 'hello' });
    lastPos.at = 0;
    setUrl(r.code);
    feed(`You joined office ${r.code}`);
    game.toast(`Office ${r.code}`, memberCount() > 1 ? `${memberCount()} people here.` : 'Share the invite link.', 'good');
    renderOfficeUi();
    game.showTab('office');
  }
  function leave(silent) {
    const r = room;
    room = null; myId = null;
    peers.clear(); joinedAt.clear(); outbox.length = 0;
    api.pairing = null;
    if (r && silent !== false) { try { r.leave(); } catch {} }
    else if (r) { try { r.leave(); } catch {} }
    setUrl(null);
    relayout();
    me.tx = null;
    renderOfficeUi();
  }
  function setUrl(code) {
    try {
      const u = new URL(location.href);
      if (code) u.searchParams.set('office', code); else u.searchParams.delete('office');
      history.replaceState(history.state, '', u);
    } catch {}
  }
  function officeParam() {
    let code = null;
    try { code = new URLSearchParams(location.search).get('office'); } catch {}
    if (!code) { try { code = new URLSearchParams(window.top.location.search).get('office'); } catch {} }
    return cleanCode(code);
  }
  function inviteLink(code) {
    let base = location.origin + location.pathname;
    try { if (window.top !== window && window.top.location.origin === location.origin) base = window.top.location.origin + window.top.location.pathname; } catch {}
    return `${base}?office=${code}`;
  }

  /* ---------- office tab UI ---------- */
  function buildAvatarUi() {
    const S = game.S;
    $('swatches').innerHTML = AV_COLORS.map((c, i) => `<button class="sw" style="background:${c}" data-c="${i}" aria-label="Colour ${i + 1}" aria-pressed="${S.avatar.c === i}"></button>`).join('');
    $('hats').innerHTML = HATS.map(([id, label], i) => `<button class="hat" data-h="${i}" aria-pressed="${S.avatar.h === i}">${label}</button>`).join('');
    $('swatches').querySelectorAll('[data-c]').forEach(b => { b.onclick = () => { S.avatar.c = +b.dataset.c; S.avatar.set = 1; buildAvatarUi(); game.sfx.pop(); game.save(); maybeSendState(true); }; });
    $('hats').querySelectorAll('[data-h]').forEach(b => { b.onclick = () => { S.avatar.h = +b.dataset.h; buildAvatarUi(); game.sfx.pop(); game.save(); maybeSendState(true); }; });
  }
  function setLobbyBusy(b) { ['mpQuick', 'mpCreate', 'mpJoin'].forEach(id => { $(id).disabled = b; }); if (b) $('mpQuick').textContent = 'Connecting…'; else $('mpQuick').textContent = 'Find coworkers'; }
  function renderOfficeUi() {
    const ok = mpOk() || !!room;
    $('mpBox').hidden = !ok;
    $('btnOnline').hidden = !ok;
    $('mpLobby').hidden = !!room;
    $('mpRoom').hidden = !room;
    $('btnSay').hidden = !room;
    $('teamBanner').hidden = !room;
    $('onlineDot').hidden = !room;
    $('btnOnline').classList.toggle('live', !!room);
    $('onlineLabel').textContent = room ? `Office ${room.code} · ${memberCount()}` : 'Coworkers';
    $('onlineCount').textContent = room ? String(memberCount()) : '';
    $('officeTag').textContent = room ? `Shared office · ${room.code}` : game.officeName();
    if (room) { $('roomCode').textContent = room.code; renderPeers(); }
    else if (ludvig() && ludvig().player && document.activeElement !== $('nameInput')) $('nameInput').value = myName();
  }
  function renderPeers() {
    const box = $('peerList');
    box.textContent = '';
    const rows = [{ id: myId, name: `${myName()} (you)`, av: game.S.avatar, desk: game.deskStatus() }];
    for (const p of peers.values()) rows.push(p);
    for (const p of rows) {
      const div = document.createElement('div'); div.className = 'peer';
      const av = document.createElement('i'); av.className = 'av'; av.style.background = AV_COLORS[(p.av && p.av.c) || 0];
      const txt = document.createElement('div'); txt.className = 'txt';
      const b = document.createElement('b'); b.textContent = p.name;
      const s = document.createElement('span');
      const d = p.desk;
      s.textContent = !d ? 'Walking in…' : d.w ? `${d.p} · waiting for permission` : d.r ? `${d.p} · ready to ship` : `${d.p} · ${d.a} agent${d.a === 1 ? '' : 's'}`;
      txt.append(b, s);
      const mini = document.createElement('div'); mini.className = 'mini';
      const fill = document.createElement('i'); fill.style.width = `${Math.round((d ? d.pct : 0) * 100)}%`;
      mini.append(fill);
      div.append(av, txt, mini);
      box.append(div);
    }
    const pct = clamp(team.g / team.T, 0, 1);
    $('teamName').textContent = `Team app: ${team.n}`;
    $('teamInfo').textContent = memberCount() < 2 ? 'Needs at least 2 people in the office. Share the link!' : `${Math.floor(pct * 100)}% built together. Everyone gets a bonus when it ships.`;
    $('teamBar').style.width = `${pct * 100}%`;
    $('teamHelp').disabled = memberCount() < 2;
  }
  $('mpQuick').onclick = () => connect('quick');
  $('mpCreate').onclick = () => connect('create');
  $('mpJoin').onclick = () => {
    const code = cleanCode($('codeInput').value);
    if (!code || code.length !== 4) { game.toast('Office codes have 4 characters.', ''); return; }
    connect('code', code);
  };
  $('codeInput').addEventListener('keydown', e => { if (e.key === 'Enter') $('mpJoin').click(); });
  $('codeInput').addEventListener('input', e => { e.target.value = (e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '')).slice(0, 4); });
  $('mpLeave').onclick = () => { leave(true); game.toast('You left the office.', ''); };
  $('mpCopy').onclick = async () => {
    if (!room) return;
    const link = inviteLink(room.code);
    const text = `Join my office in Vibe Coder Tycoon: ${link}`;
    try {
      if (navigator.share && matchMedia('(pointer: coarse)').matches) { await navigator.share({ title: 'Vibe Coder Tycoon', text, url: link }); return; }
      await navigator.clipboard.writeText(link);
      game.toast('Invite link copied.', `Code ${room.code}. Up to 4 people.`, 'good');
    } catch {
      game.modal(`<h2>Invite link</h2><p>Copy this link and send it to a friend.</p><div class="field"><input id="linkIn" readonly value="${game.esc(link)}"></div><div class="row2"><button class="big-btn primary" data-close>Done</button></div>`);
      const i = $('linkIn'); i.focus(); i.select();
    }
  };
  $('nameSave').onclick = () => {
    const Lv = ludvig(); if (!Lv) return;
    const n = cleanText($('nameInput').value, 16);
    if (n.length < 2) { game.toast('Names need 2 to 16 characters.', ''); return; }
    try { if (typeof Lv.setName === 'function') Lv.setName(n); } catch {}
    $('nameInput').value = myName();
    game.toast('Name saved.', '', 'good');
    maybeSendState(true);
  };
  $('btnOnline').onclick = () => {
    game.showTab('office');
    const panel = document.querySelector('.panel');
    if (panel && innerWidth < 960) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  window.addEventListener('online', renderOfficeUi);
  window.addEventListener('offline', renderOfficeUi);

  /* ---------- hooks from game.js ---------- */
  function onTap() { me.typing = now(); }
  function onShip() { me.bubble = { text: 'shipped! 🚀', until: now() + 3000 }; maybeSendState(true); }
  function onChange() { relayout(); renderOfficeUi(); maybeSendState(true); }
  function onTab() { renderOfficeUi(); }

  /* ---------- drawing ---------- */
  function rr(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  const font = (px, w = 700) => `${w} ${Math.max(9, px)}px ui-rounded, "SF Pro Rounded", system-ui, sans-serif`;
  function label(text, x, y, color = '#f8f0e5', bg = '#0e0b12cc', size = 0.28) {
    const px = Math.max(10, sc * size);
    ctx.font = font(px);
    const w = ctx.measureText(text).width + px * 0.9, h = px * 1.45;
    rr(x - w / 2, y - h / 2, w, h, h / 2); ctx.fillStyle = bg; ctx.fill();
    ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y + px * 0.04);
  }
  function fitText(text, maxW) {
    if (ctx.measureText(text).width <= maxW) return text;
    let t = text;
    while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
    return t + '…';
  }
  function drawRoom(t) {
    const th = L.theme;
    // floor
    const tile = 1;
    for (let y = WALL; y < H; y += tile) for (let x = 0; x < W; x += tile) {
      const alt = th.kind === 'kitchen' ? ((Math.floor(x) + Math.floor(y)) % 2 === 0) : th.kind === 'loft' ? (Math.floor(y * 2) % 2 === 0) : ((Math.floor(x) + Math.floor(y)) % 2 === 0);
      ctx.fillStyle = alt ? th.floorA : th.floorB;
      ctx.fillRect(X(x), Y(y), sc * tile + 1, sc * tile + 1);
    }
    if (th.kind === 'loft') { ctx.strokeStyle = '#00000022'; ctx.lineWidth = 1; for (let y = WALL; y < H; y += 0.5) { ctx.beginPath(); ctx.moveTo(X(0), Y(y)); ctx.lineTo(X(W), Y(y)); ctx.stroke(); } }
    if (th.kind === 'garage') { ctx.fillStyle = '#00000030'; ctx.beginPath(); ctx.ellipse(X(12.8), Y(8.8), sc * 1.1, sc * 0.45, 0.2, 0, 7); ctx.fill(); }
    if (th.kind === 'campus') { ctx.strokeStyle = '#ffffff10'; ctx.lineWidth = 2; for (let x = 0; x < W; x += 2) { ctx.beginPath(); ctx.moveTo(X(x), Y(WALL)); ctx.lineTo(X(x + 3), Y(H)); ctx.stroke(); } }
    // rug under main desk area
    ctx.fillStyle = '#ffffff0c';
    rr(X(5), Y(3.2), sc * 6, sc * 3.4, sc * 0.5); if (!room) ctx.fill();
    // wall
    ctx.fillStyle = th.wall; ctx.fillRect(X(0), Y(0), sc * W, sc * WALL);
    if (th.kind === 'loft') {
      ctx.fillStyle = '#00000026';
      for (let y = 0; y < WALL; y += 0.32) for (let x = (Math.round(y / 0.32) % 2) * 0.4; x < W; x += 0.8) ctx.fillRect(X(x), Y(y), sc * 0.76, sc * 0.03 + 1);
      for (let y = 0; y < WALL; y += 0.32) ctx.fillRect(X(0), Y(y), sc * W, 1);
    }
    if (th.kind === 'kitchen') {
      ctx.fillStyle = '#ffffff0d';
      for (let x = 2; x < W; x += 0.5) for (let y = 1.2; y < WALL; y += 0.5) ctx.fillRect(X(x) + 1, Y(y) + 1, sc * 0.5 - 2, sc * 0.5 - 2);
    }
    if (th.kind === 'garage') {
      ctx.fillStyle = '#00000022';
      for (let y = 0.2; y < WALL; y += 0.28) ctx.fillRect(X(9.6), Y(y), sc * 5.6, sc * 0.08);
    }
    ctx.fillStyle = th.trim; ctx.fillRect(X(0), Y(WALL - 0.12), sc * W, sc * 0.12);
    // window(s) with the 03:57 sky
    const wins = th.kind === 'loft' || th.kind === 'campus' ? [[2.2, 3.2], [6.4, 3.2]] : [[3.2, 2.6]];
    for (const [wx, ww] of wins) {
      const wy = 0.35, wh = 1.45;
      const g = ctx.createLinearGradient(0, Y(wy), 0, Y(wy + wh));
      g.addColorStop(0, '#141a3a'); g.addColorStop(1, '#2c2350');
      ctx.fillStyle = '#1a1520'; rr(X(wx) - 3, Y(wy) - 3, sc * ww + 6, sc * wh + 6, 4); ctx.fill();
      ctx.fillStyle = g; ctx.fillRect(X(wx), Y(wy), sc * ww, sc * wh);
      ctx.fillStyle = '#fff6d8';
      for (let i = 0; i < 7; i++) { const sx = wx + ((i * 0.73 + wx) % ww), sy = wy + ((i * 0.41) % (wh * 0.6)); const tw = 0.5 + 0.5 * Math.sin(t / 600 + i * 2); ctx.globalAlpha = 0.4 + tw * 0.6; ctx.fillRect(X(sx), Y(sy), 2, 2); }
      ctx.globalAlpha = 1;
      if (wx === wins[0][0]) { ctx.fillStyle = '#fff1c4'; ctx.beginPath(); ctx.arc(X(wx + ww - 0.55), Y(wy + 0.42), sc * 0.2, 0, 7); ctx.fill(); ctx.fillStyle = '#2a2350'; ctx.beginPath(); ctx.arc(X(wx + ww - 0.47), Y(wy + 0.36), sc * 0.18, 0, 7); ctx.fill(); }
      if (th.kind !== 'kitchen') { ctx.fillStyle = '#0c0a18'; for (let i = 0; i < ww * 3; i++) { const bh = 0.25 + ((i * 37) % 7) / 12; ctx.fillRect(X(wx + i / 3), Y(wy + wh - bh), sc / 3 - 1, sc * bh); } ctx.fillStyle = '#ffd86b88'; for (let i = 0; i < ww * 3; i += 2) ctx.fillRect(X(wx + i / 3 + 0.1), Y(wy + wh - 0.18), 2, 2); }
      ctx.strokeStyle = '#1a1520'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(X(wx + ww / 2), Y(wy)); ctx.lineTo(X(wx + ww / 2), Y(wy + wh)); ctx.stroke();
    }
    // decor
    if (th.kind === 'kitchen') {
      ctx.fillStyle = '#d9d3cb'; rr(X(0.3), Y(0.6), sc * 1.15, sc * 2.55, sc * 0.12); ctx.fill();
      ctx.fillStyle = '#bdb6ad'; ctx.fillRect(X(0.3), Y(1.45), sc * 1.15, 2);
      ctx.fillStyle = '#ffb84d'; ctx.fillRect(X(0.5), Y(1.0), sc * 0.28, sc * 0.2);
      ctx.fillStyle = '#6cc4ff'; ctx.fillRect(X(0.85), Y(1.9), sc * 0.3, sc * 0.22);
      label('wifi: mum1234', X(0.88), Y(2.7), '#16121c', '#fff3d6', 0.16);
      ctx.fillStyle = '#ffd86b'; ctx.beginPath(); ctx.arc(X(13.6), Y(1.0), sc * 0.28, 0, 7); ctx.fill();
      ctx.strokeStyle = '#16121c'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(X(13.6), Y(1.0)); ctx.lineTo(X(13.6), Y(0.82)); ctx.moveTo(X(13.6), Y(1.0)); ctx.lineTo(X(13.73), Y(1.03)); ctx.stroke();
    } else if (th.kind === 'garage') {
      ctx.fillStyle = '#8b6b4a'; ctx.fillRect(X(0.6), Y(0.4), sc * 2.0, sc * 1.4);
      ctx.fillStyle = '#5c4632'; for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) ctx.fillRect(X(0.75 + i * 0.32), Y(0.55 + j * 0.32), 2, 2);
      ctx.strokeStyle = '#c9ccd4'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(X(1.0), Y(0.7)); ctx.lineTo(X(1.0), Y(1.4)); ctx.moveTo(X(1.6), Y(0.6)); ctx.lineTo(X(1.9), Y(1.5)); ctx.stroke();
    } else if (th.kind === 'loft') {
      plant(14.9, 2.9); plant(0.7, 9.9);
    } else {
      ctx.save(); ctx.shadowColor = '#ff6b8b'; ctx.shadowBlur = 16; label('SHIP IT', X(12.6), Y(1.05), '#ff6b8b', '#00000000', 0.6); ctx.restore();
      plant(0.6, 2.9); plant(15.4, 9.9);
      ctx.fillStyle = '#ffb84d'; ctx.beginPath(); ctx.ellipse(X(1.3), Y(9.6), sc * 0.6, sc * 0.42, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#a690ff'; ctx.beginPath(); ctx.ellipse(X(2.6), Y(9.8), sc * 0.55, sc * 0.4, 0, 0, 7); ctx.fill();
    }
    // coffee machine
    if (L.coffee) {
      const c = L.coffee;
      ctx.fillStyle = '#00000040'; ctx.beginPath(); ctx.ellipse(X(c.x), Y(c.y + 0.35), sc * 0.45, sc * 0.14, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#2b2530'; rr(X(c.x - 0.36), Y(c.y - 0.55), sc * 0.72, sc * 0.9, sc * 0.1); ctx.fill();
      ctx.fillStyle = '#c9ccd4'; ctx.fillRect(X(c.x - 0.26), Y(c.y - 0.45), sc * 0.52, sc * 0.18);
      ctx.fillStyle = now() > coffeeReady ? '#5fe0b0' : '#ff6b8b'; ctx.beginPath(); ctx.arc(X(c.x + 0.2), Y(c.y - 0.1), 2.5, 0, 7); ctx.fill();
      ctx.fillStyle = '#f8f0e5'; ctx.fillRect(X(c.x - 0.1), Y(c.y + 0.05), sc * 0.2, sc * 0.18);
      ctx.strokeStyle = '#ffffff55'; ctx.lineWidth = 1.5;
      for (let i = 0; i < 2; i++) { const o = Math.sin(t / 300 + i) * sc * 0.05; ctx.beginPath(); ctx.moveTo(X(c.x - 0.04 + i * 0.08) + o, Y(c.y)); ctx.quadraticCurveTo(X(c.x + 0.05) - o, Y(c.y - 0.2), X(c.x) + o, Y(c.y - 0.35)); ctx.stroke(); }
    }
  }
  function plant(x, y) {
    ctx.fillStyle = '#00000040'; ctx.beginPath(); ctx.ellipse(X(x), Y(y + 0.05), sc * 0.35, sc * 0.12, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#b5653f'; rr(X(x - 0.22), Y(y - 0.35), sc * 0.44, sc * 0.4, 3); ctx.fill();
    ctx.fillStyle = '#5fbf7a';
    for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (i - 2) * 0.5; ctx.beginPath(); ctx.ellipse(X(x + Math.cos(a) * 0.25), Y(y - 0.45 + Math.sin(a) * 0.25), sc * 0.12, sc * 0.26, a + Math.PI / 2, 0, 7); ctx.fill(); }
  }
  function screenColor(d, base, t) {
    if (!d) return base;
    if (d.w) return Math.floor(t / 400) % 2 ? '#ffb84d' : '#ff8f3c';
    if (d.r) return '#5fe0b0';
    return base;
  }
  function drawDesk(desk, t) {
    const th = L.theme;
    const S = game.S;
    const mine = desk.owner === 'me' || (room && desk.owner === myId);
    const peer = !mine && desk.owner ? peers.get(desk.owner) : null;
    const d = mine ? game.deskStatus() : peer ? peer.desk : null;
    const avc = mine ? AV_COLORS[S.avatar.c] : peer ? AV_COLORS[peer.av.c] : '#6b6f7c';
    const x = desk.x, y = desk.y;
    // shadow
    ctx.fillStyle = '#00000045'; rr(X(x - 1.55), Y(y - 0.55), sc * 3.1, sc * 1.35, sc * 0.18); ctx.fill();
    // desk body
    ctx.fillStyle = th.desk; rr(X(x - 1.5), Y(y - 0.7), sc * 3, sc * 1.25, sc * 0.14); ctx.fill();
    ctx.fillStyle = th.deskTop; rr(X(x - 1.5), Y(y - 0.7), sc * 3, sc * 1.0, sc * 0.14); ctx.fill();
    // glow
    const glow = screenColor(d, avc, t);
    const active = !!d;
    if (active) {
      const g = ctx.createRadialGradient(X(x), Y(y - 0.3), 2, X(x), Y(y - 0.3), sc * 2.4);
      g.addColorStop(0, glow + '55'); g.addColorStop(1, glow + '00');
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g; ctx.fillRect(X(x - 2.5), Y(y - 2.5), sc * 5, sc * 5); ctx.restore();
    }
    // monitor
    ctx.fillStyle = '#16121c'; rr(X(x - 0.95), Y(y - 1.45), sc * 1.9, sc * 1.05, sc * 0.08); ctx.fill();
    ctx.fillStyle = '#16121c'; ctx.fillRect(X(x - 0.12), Y(y - 0.45), sc * 0.24, sc * 0.2);
    ctx.fillStyle = active ? glow : '#2c2437';
    ctx.globalAlpha = active ? 0.9 : 1;
    rr(X(x - 0.86), Y(y - 1.37), sc * 1.72, sc * 0.89, sc * 0.05); ctx.fill();
    ctx.globalAlpha = 1;
    if (active) {
      ctx.fillStyle = '#16121c99';
      const lines = 5, scroll = (t / 250) % 1;
      for (let i = 0; i < lines; i++) {
        const lw = 0.4 + ((i * 7 + Math.floor(t / 900)) % 5) * 0.2;
        ctx.fillRect(X(x - 0.76 + (i % 2) * 0.12), Y(y - 1.27 + (i + scroll * 0.2) * 0.13), sc * Math.min(1.3, lw), Math.max(2, sc * 0.05));
      }
      ctx.fillStyle = '#16121c88'; ctx.fillRect(X(x - 0.76), Y(y - 0.62), sc * 1.52, sc * 0.08);
      ctx.fillStyle = '#ffffffdd'; ctx.fillRect(X(x - 0.76), Y(y - 0.62), sc * 1.52 * clamp(d.pct, 0, 1), sc * 0.08);
    }
    // keyboard, mug
    ctx.fillStyle = '#00000040'; rr(X(x - 0.55), Y(y - 0.18), sc * 1.1, sc * 0.26, 3); ctx.fill();
    ctx.fillStyle = '#f8f0e5'; ctx.beginPath(); ctx.arc(X(x + 1.15), Y(y - 0.2), sc * 0.13, 0, 7); ctx.fill();
    ctx.fillStyle = '#6b3e2a'; ctx.beginPath(); ctx.arc(X(x + 1.15), Y(y - 0.2), sc * 0.08, 0, 7); ctx.fill();
    // chair
    ctx.fillStyle = '#00000055'; rr(X(x - 0.38), Y(y + 0.75), sc * 0.76, sc * 0.55, sc * 0.18); ctx.fill();
    // labels
    if (d) {
      const who = mine ? (room ? myName() : '') : peer.name;
      const text = who ? `${who} · ${d.p}` : d.p;
      ctx.font = font(Math.max(10, sc * 0.25));
      label(fitText(text, sc * 3.6), X(x), Y(y - 1.75), '#f8f0e5', '#0e0b12d9', 0.25);
      if (d.w) label('needs permission!', X(x), Y(y - 2.1), '#2a1606', '#ffb84d', 0.2);
      else if (d.r) label('ready to ship', X(x), Y(y - 2.1), '#08241a', '#5fe0b0', 0.2);
      if (room && d.a) label(`×${d.a} agents`, X(x + 1.95), Y(y - 0.2), '#bcb0c2', '#0e0b12aa', 0.18);
      if (d.b) { ctx.font = font(sc * 0.3); ctx.textAlign = 'center'; for (let i = 0; i < Math.min(3, d.b); i++) ctx.fillText('🐛', X(x - 1.15 + i * 0.28 + Math.sin(t / 300 + i) * 0.04), Y(y + 0.25)); }
    } else if (room) {
      label('free desk', X(x), Y(y - 1.75), '#8d8196', '#0e0b12aa', 0.22);
    }
  }
  function drawPod(p, t) {
    const S = game.S;
    const th = L.theme;
    const x = p.x, y = p.y;
    ctx.fillStyle = '#00000040'; rr(X(x - 0.72), Y(y - 0.35), sc * 1.44, sc * 0.75, 4); ctx.fill();
    ctx.fillStyle = th.desk; rr(X(x - 0.7), Y(y - 0.45), sc * 1.4, sc * 0.7, 4); ctx.fill();
    ctx.fillStyle = th.deskTop; rr(X(x - 0.7), Y(y - 0.45), sc * 1.4, sc * 0.55, 4); ctx.fill();
    ctx.fillStyle = '#16121c'; rr(X(x - 0.42), Y(y - 0.85), sc * 0.84, sc * 0.5, 3); ctx.fill();
    const waiting = game.deskStatus().w && p.i === 0;
    ctx.fillStyle = waiting ? '#ffb84d' : ROBOT_COLORS[Math.min(S.model, ROBOT_COLORS.length - 1)];
    ctx.globalAlpha = 0.85; ctx.fillRect(X(x - 0.36), Y(y - 0.8), sc * 0.72, sc * 0.4); ctx.globalAlpha = 1;
    // robot
    const bob = Math.sin(t / 140 + p.i * 1.7) * 0.03;
    const rc = ROBOT_COLORS[Math.min(S.model, ROBOT_COLORS.length - 1)];
    ctx.fillStyle = '#00000040'; ctx.beginPath(); ctx.ellipse(X(x), Y(y + 0.62), sc * 0.28, sc * 0.09, 0, 0, 7); ctx.fill();
    ctx.fillStyle = rc; rr(X(x - 0.22), Y(y + 0.22 + bob), sc * 0.44, sc * 0.36, 5); ctx.fill();
    ctx.fillStyle = '#e8ebf2'; rr(X(x - 0.2), Y(y - 0.05 + bob), sc * 0.4, sc * 0.3, 5); ctx.fill();
    ctx.strokeStyle = rc; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(X(x), Y(y - 0.05 + bob)); ctx.lineTo(X(x), Y(y - 0.18 + bob)); ctx.stroke();
    ctx.fillStyle = Math.floor(t / 500 + p.i) % 7 === 0 ? '#ff6b8b' : '#5fe0b0'; ctx.beginPath(); ctx.arc(X(x), Y(y - 0.2 + bob), 2.5, 0, 7); ctx.fill();
    if (waiting) label('?', X(x + 0.45), Y(y - 0.2), '#2a1606', '#ffb84d', 0.28);
    if (p.i === 0 || L.pods.length <= 4) label(game.agentName(p.i), X(x), Y(y + 0.86), '#bcb0c2', '#0e0b1299', 0.17);
  }
  function drawCat(t) {
    if (L.tier !== 0 || room) return;
    if (!cat.tx || Math.hypot(cat.tx - cat.x, cat.ty - cat.y) < 0.1) {
      if (t > cat.wait) { cat.tx = rnd(1, 15); cat.ty = rnd(6.2, 10); cat.wait = t + rnd(2500, 7000); }
    } else if (t > cat.wait - 2000 || true) {
      const dx = cat.tx - cat.x, dy = cat.ty - cat.y, d = Math.hypot(dx, dy);
      if (d > 0.1) { cat.x += dx / d * 0.012; cat.y += dy / d * 0.012; cat.flip = dx < 0; }
    }
    const x = cat.x, y = cat.y, f = cat.flip ? -1 : 1;
    ctx.fillStyle = '#00000040'; ctx.beginPath(); ctx.ellipse(X(x), Y(y + 0.12), sc * 0.3, sc * 0.08, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#e59a4d';
    ctx.beginPath(); ctx.ellipse(X(x), Y(y - 0.05), sc * 0.28, sc * 0.15, 0, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(X(x + 0.25 * f), Y(y - 0.18), sc * 0.13, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.moveTo(X(x + 0.17 * f), Y(y - 0.26)); ctx.lineTo(X(x + 0.2 * f), Y(y - 0.38)); ctx.lineTo(X(x + 0.27 * f), Y(y - 0.28)); ctx.fill();
    ctx.beginPath(); ctx.moveTo(X(x + 0.27 * f), Y(y - 0.28)); ctx.lineTo(X(x + 0.35 * f), Y(y - 0.38)); ctx.lineTo(X(x + 0.37 * f), Y(y - 0.24)); ctx.fill();
    ctx.strokeStyle = '#e59a4d'; ctx.lineWidth = Math.max(2, sc * 0.06); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(X(x - 0.25 * f), Y(y - 0.05)); ctx.quadraticCurveTo(X(x - 0.45 * f), Y(y - 0.1 + Math.sin(t / 300) * 0.08), X(x - 0.4 * f), Y(y - 0.35)); ctx.stroke();
    ctx.lineCap = 'butt';
  }
  const cat = { x: 12, y: 8.5, tx: 0, ty: 0, wait: 0, flip: false };

  function drawHat(h, hx, hy, r, color) {
    ctx.save();
    if (h === 1) { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(hx, hy - r * 0.15, r * 1.02, Math.PI, 0); ctx.fill(); ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(hx, hy - r * 1.2, r * 0.25, 0, 7); ctx.fill(); ctx.fillStyle = '#00000030'; ctx.fillRect(hx - r, hy - r * 0.25, r * 2, r * 0.25); }
    else if (h === 2) { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(hx, hy - r * 0.2, r * 0.98, Math.PI, 0); ctx.fill(); ctx.fillStyle = '#16121c55'; ctx.beginPath(); ctx.ellipse(hx + r * 0.55, hy - r * 0.2, r * 0.75, r * 0.2, 0, 0, 7); ctx.fill(); }
    else if (h === 3) { ctx.strokeStyle = '#16121c'; ctx.lineWidth = Math.max(2, r * 0.22); ctx.beginPath(); ctx.arc(hx, hy, r * 1.08, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke(); ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(hx - r * 1.05, hy + r * 0.05, r * 0.28, r * 0.42, 0, 0, 7); ctx.ellipse(hx + r * 1.05, hy + r * 0.05, r * 0.28, r * 0.42, 0, 0, 7); ctx.fill(); }
    else if (h === 4) { ctx.fillStyle = '#ffd86b'; ctx.beginPath(); ctx.moveTo(hx - r * 0.8, hy - r * 0.6); ctx.lineTo(hx - r * 0.8, hy - r * 1.35); ctx.lineTo(hx - r * 0.4, hy - r * 0.95); ctx.lineTo(hx, hy - r * 1.5); ctx.lineTo(hx + r * 0.4, hy - r * 0.95); ctx.lineTo(hx + r * 0.8, hy - r * 1.35); ctx.lineTo(hx + r * 0.8, hy - r * 0.6); ctx.closePath(); ctx.fill(); }
    else if (h === 5) { ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(hx - r * 0.6, hy - r * 0.65); ctx.lineTo(hx, hy - r * 2.0); ctx.lineTo(hx + r * 0.6, hy - r * 0.65); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(hx, hy - r * 2.0, r * 0.2, 0, 7); ctx.fill(); }
    ctx.restore();
  }
  function drawAvatar(a, color, hat, skin, name, isMe, t) {
    const x = a.dx != null && !isMe ? a.dx : a.x, y = a.dy != null && !isMe ? a.dy : a.y;
    const moving = a.moving;
    const bob = moving ? Math.abs(Math.sin(a.walk * 11)) * 0.07 : Math.sin(t / 700) * 0.01;
    const px = X(x), py = Y(y);
    const r = sc * 0.2;
    ctx.fillStyle = '#00000055'; ctx.beginPath(); ctx.ellipse(px, py, sc * 0.27, sc * 0.09, 0, 0, 7); ctx.fill();
    if (isMe) { ctx.strokeStyle = '#ffffff66'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(px, py, sc * 0.36, sc * 0.13, 0, 0, 7); ctx.stroke(); }
    // legs
    const leg = moving ? Math.sin(a.walk * 11) * sc * 0.06 : 0;
    ctx.fillStyle = '#2b2530';
    ctx.fillRect(px - sc * 0.12, py - sc * 0.2 + leg, sc * 0.09, sc * 0.18 - leg);
    ctx.fillRect(px + sc * 0.03, py - sc * 0.2 - leg, sc * 0.09, sc * 0.18 + leg);
    // body
    const by = py - sc * (0.58 + bob);
    ctx.fillStyle = color; rr(px - sc * 0.22, by, sc * 0.44, sc * 0.42, sc * 0.14); ctx.fill();
    ctx.fillStyle = '#00000022'; rr(px - sc * 0.22, by + sc * 0.28, sc * 0.44, sc * 0.14, sc * 0.08); ctx.fill();
    // arms typing
    if (isMe && now() - me.typing < 250) { ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(px - sc * 0.24, by + sc * 0.22 + Math.sin(t / 40) * 2, sc * 0.06, 0, 7); ctx.arc(px + sc * 0.24, by + sc * 0.22 - Math.sin(t / 40) * 2, sc * 0.06, 0, 7); ctx.fill(); }
    // head
    const hx = px, hy = by - r * 0.85;
    ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(hx, hy, r, 0, 7); ctx.fill();
    if (a.face !== 'up') {
      const ex = a.face === 'left' ? -r * 0.35 : a.face === 'right' ? r * 0.35 : 0;
      ctx.fillStyle = '#16121c';
      const blink = (Math.floor(t / 100) + hashStr(name)) % 40 === 0;
      if (blink) { ctx.fillRect(hx + ex - r * 0.42, hy - r * 0.05, r * 0.25, 1.5); ctx.fillRect(hx + ex + r * 0.17, hy - r * 0.05, r * 0.25, 1.5); }
      else { ctx.beginPath(); ctx.arc(hx + ex - r * 0.3, hy - r * 0.05, Math.max(1.4, r * 0.12), 0, 7); ctx.arc(hx + ex + r * 0.3, hy - r * 0.05, Math.max(1.4, r * 0.12), 0, 7); ctx.fill(); }
    } else {
      ctx.fillStyle = '#00000020'; ctx.beginPath(); ctx.arc(hx, hy, r, 0, 7); ctx.fill();
    }
    drawHat(hat, hx, hy, r, color);
    // name tag
    label(name, px, py + sc * 0.28, isMe ? '#16121c' : '#f8f0e5', isMe ? color : '#0e0b12cc', 0.21);
  }
  function drawBubble(a, isMe, t) {
    const b = a.bubble;
    if (!b || b.until < now()) return;
    const x = isMe ? a.x : a.dx, y = isMe ? a.y : a.dy;
    const px = Math.max(11, sc * 0.27);
    ctx.font = font(px, 700);
    const maxW = Math.min(sc * 4.2, cw * 0.6);
    const words = b.text.split(' ');
    const lines = []; let line = '';
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test;
    }
    if (line) lines.push(line);
    const shown = lines.slice(0, 3).map(l => fitText(l, maxW));
    const bw = Math.max(...shown.map(l => ctx.measureText(l).width)) + px * 1.1;
    const bh = shown.length * px * 1.25 + px * 0.7;
    let bx = X(x) - bw / 2;
    bx = clamp(bx, 4, cw - bw - 4);
    const by = Y(y) - sc * 1.25 - bh;
    const fade = clamp((b.until - now()) / 400, 0, 1);
    ctx.globalAlpha = fade;
    ctx.fillStyle = '#fff8ec'; rr(bx, by, bw, bh, px * 0.6); ctx.fill();
    ctx.beginPath(); ctx.moveTo(X(x) - 6, by + bh - 1); ctx.lineTo(X(x), by + bh + 7); ctx.lineTo(X(x) + 6, by + bh - 1); ctx.fill();
    ctx.fillStyle = '#16121c'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    shown.forEach((l, i) => ctx.fillText(l, bx + bw / 2, by + px * 0.35 + px * 0.62 + i * px * 1.25));
    ctx.globalAlpha = 1;
  }

  /* ---------- frame ---------- */
  let lastFrame = performance.now(), uiTimer = 0;
  function frame(tp) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (tp - lastFrame) / 1000);
    lastFrame = tp;
    if (!L) relayout();
    if (!cw || !ch) resize();
    step(dt);
    // peers: smooth toward network positions
    for (const p of peers.values()) {
      const k = 1 - Math.exp(-dt * 12);
      const before = p.dx;
      p.dx += (p.x - p.dx) * k; p.dy += (p.y - p.dy) * k;
      if (p.moving || Math.abs(p.dx - before) > 0.002) p.walk += dt;
    }
    // pairing
    if (room) {
      const near = nearestPeer(1.6);
      api.pairing = near ? near.name : null;
      const n5 = nearestPeer(2.1);
      $('btnHi5').hidden = !n5;
      if (n5) $('btnHi5').textContent = `High five ${n5.name.split(' ')[0]}`;
    } else { api.pairing = null; $('btnHi5').hidden = true; }
    teamTick(dt);
    maybeSendPos();
    maybeSendState(false);
    flush();
    uiTimer += dt;
    if (uiTimer > 1) {
      uiTimer = 0;
      if (room) {
        const pct = clamp(team.g / team.T, 0, 1);
        $('teamBanner').innerHTML = '';
        const i = document.createElement('i'); i.textContent = `${Math.floor(pct * 100)}%`;
        $('teamBanner').append(document.createTextNode(`Team app: ${team.n} · `), i);
        if (!$('tab-office').hidden) renderPeers();
        $('onlineLabel').textContent = `Office ${room.code} · ${memberCount()}`;
        $('onlineCount').textContent = String(memberCount());
      } else $('officeTag').textContent = game.officeName();
    }
    draw(performance.now());
  }
  function draw(t) {
    if (!cw) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#0e0b12'; ctx.fillRect(0, 0, cw, ch);
    ctx.save();
    ctx.beginPath(); ctx.rect(X(0), Y(0), sc * W, sc * H); ctx.clip();
    drawRoom(t);
    // tap target rings
    fxRings = fxRings.filter(r => t - r.t < 600 || now() - r.t < 600);
    for (const r of fxRings) { const a = (now() - r.t) / 600; ctx.strokeStyle = `rgba(255,255,255,${0.6 * (1 - a)})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(X(r.x), Y(r.y), sc * (0.15 + a * 0.3), sc * (0.06 + a * 0.12), 0, 0, 7); ctx.stroke(); }
    // depth-sorted drawables
    const items = [];
    for (const d of L.desks) items.push({ y: d.y + 0.55, f: () => drawDesk(d, t) });
    for (const p of L.pods) items.push({ y: p.y + 0.3, f: () => drawPod(p, t) });
    if (L.tier === 0 && !room) items.push({ y: cat.y, f: () => drawCat(t) });
    const S = game.S;
    items.push({ y: me.y, f: () => drawAvatar(me, AV_COLORS[S.avatar.c], S.avatar.h, SKINS[hashStr(myPlayerId()) % SKINS.length], room ? myName() : 'you', true, t) });
    for (const p of peers.values()) items.push({ y: p.dy, f: () => drawAvatar(p, AV_COLORS[p.av.c], p.av.h, SKINS[hashStr(p.id) % SKINS.length], p.name, false, t) });
    items.sort((a, b) => a.y - b.y);
    for (const it of items) it.f();
    // pair link
    if (room && api.pairing) {
      const p = nearestPeer(1.6);
      if (p) {
        ctx.setLineDash([4, 4]); ctx.strokeStyle = '#5fe0b0'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(X(me.x), Y(me.y - 0.4)); ctx.lineTo(X(p.dx), Y(p.dy - 0.4)); ctx.stroke(); ctx.setLineDash([]);
        label('pairing ×1.5', X((me.x + p.dx) / 2), Y((me.y + p.dy) / 2 - 1.3), '#08241a', '#5fe0b0', 0.2);
      }
    }
    // bubbles on top
    drawBubble(me, true, t);
    for (const p of peers.values()) drawBubble(p, false, t);
    // warm vignette
    const g = ctx.createRadialGradient(X(W / 2), Y(H / 2), sc * 3, X(W / 2), Y(H / 2), sc * 10);
    g.addColorStop(0, '#00000000'); g.addColorStop(1, '#00000066');
    ctx.fillStyle = g; ctx.fillRect(X(0), Y(0), sc * W, sc * H);
    ctx.restore();
  }

  /* ---------- boot ---------- */
  buildAvatarUi();
  relayout();
  resize();
  renderOfficeUi();
  requestAnimationFrame(frame);
  window.addEventListener('pagehide', () => { if (room) { try { room.leave(); } catch {} } });
  const code = officeParam();
  if (code && mpOk()) {
    if (code.length === 4) setTimeout(() => connect('code', code), 400);
  }
})();
