/* Higher or Lower · Duel. 2–6 players live through the Ludvig.mp relay.
   The host (oldest peer) owns shared events: start (seed + category), round start, reveal and end.
   Every client scores its own answer and tallies everyone's from the answers it receives.
   HLDuelRules is pure and runs in node (tests/duel.test.mjs); the UI part needs a DOM. */
(function (root) {
  'use strict';
  const GAME = 'higher-or-lower', MAX = 6, ROUNDS = 10, ANSWER_MS = 8000, GRACE_MS = 600, REVEAL_MS = 3200, COUNT_MS = 3000, QUICK_WAIT_MS = 10000;
  const CAT_KEYS = ['searches', 'followers', 'salaries', 'prices'];

  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  // The same seed and category always give the same ten pairs on every device.
  function pairs(data, cat, seed, n = ROUNDS) {
    const r = rng(seed), out = [], used = new Set(), seen = new Set();
    const cats = cat === 'mix' ? CAT_KEYS.slice() : [cat];
    for (let i = cats.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [cats[i], cats[j]] = [cats[j], cats[i]]; }
    for (let i = 0; i < n; i++) {
      const c = cats[i % cats.length], list = data[c];
      let left, right, key, tries = 0;
      // Prefer cards not shown yet in this game; allow repeats only when the list runs short.
      do {
        left = list[Math.floor(r() * list.length)]; right = list[Math.floor(r() * list.length)];
        key = c + ':' + [left.id, right.id].sort().join(':');
      } while ((left.id === right.id || left.value === right.value || used.has(key) || (tries < 150 && (seen.has(c + ':' + left.id) || seen.has(c + ':' + right.id)))) && ++tries < 200);
      used.add(key); seen.add(c + ':' + left.id); seen.add(c + ':' + right.id); out.push({ cat: c, left, right });
    }
    return out;
  }
  function correct(pair, side) { const a = pair[side], b = pair[side === 'left' ? 'right' : 'left']; return a.value >= b.value; }
  // A correct answer is worth 500, plus up to 500 more for speed.
  function points(ok, ms) { if (!ok) return 0; const left = Math.max(0, Math.min(ANSWER_MS, ANSWER_MS - ms)); return 500 + Math.round(500 * left / ANSWER_MS); }
  function standings(ids, names, scores) {
    const rows = ids.map(id => ({ id, name: names[id] || 'Player', score: scores[id] || 0 }));
    rows.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
    rows.forEach(row => { row.rank = 1 + rows.filter(o => o.score > row.score).length; });
    return rows;
  }
  root.HLDuelRules = { GAME, MAX, ROUNDS, ANSWER_MS, rng, pairs, correct, points, standings };
  if (typeof document === 'undefined') return;

  /* ---------- UI ---------- */
  const STORE = 'higher-or-lower.duel.v1', BOARD = 'higher-or-lower:duel';
  const H = {}; // helpers handed over by the main game (sounds, toast, value format)
  const L = () => { const x = window.Ludvig; return x && x.mp && typeof x.mp.join === 'function' ? x : null; };
  const available = () => !!L() && navigator.onLine !== false;
  const ic = name => (typeof icon === 'function' ? icon(name) : '');
  const e = s => (typeof esc === 'function' ? esc(s) : String(s));
  const ERR = { 'not-found': 'No room with that code.', full: 'That room is full.', 'rate-limited': 'Too many tries. Wait a minute.', offline: 'You are offline.', timeout: 'Could not connect.', network: 'Connection lost.' };
  const CAT_NAMES = { mix: 'Mixed', searches: 'Searches', followers: 'Followers', salaries: 'Salaries', prices: 'Prices' };

  let el = null, room = null, offs = [], view = 'menu', note = '', busy = false, cat = 'mix', g = null, timers = [], quickTimer = null, quickAt = 0, lastFocus = null;
  function stats() { try { const x = JSON.parse(localStorage.getItem(STORE) || '{}'); return { wins: x.wins | 0, played: x.played | 0 }; } catch { return { wins: 0, played: 0 }; } }
  function saveStats(s) { try { localStorage.setItem(STORE, JSON.stringify(s)); } catch { /* storage blocked */ } }
  function fmt(it) {
    if (H.formatValue) return H.formatValue(it);
    const v = it.value;
    if (it.category === 'salaries' || it.category === 'prices') return '$' + Math.round(v).toLocaleString('en-US');
    if (v >= 1e6) return (v / 1e6).toLocaleString('en-US', { maximumFractionDigits: 2 }) + 'M';
    if (v >= 1e3) return (v / 1e3).toLocaleString('en-US', { maximumFractionDigits: 1 }) + 'K';
    return String(v);
  }
  function later(ms, fn) { const id = setTimeout(fn, ms); timers.push(id); return id; }
  function clearTimers() { timers.forEach(clearTimeout); timers = []; }
  const isHost = () => room && room.host === room.self.id;
  const peerName = id => { const p = room && room.peers.find(x => x.id === id); return p ? p.name : (g && g.names[id]) || 'Player'; };

  function css() {
    if (document.getElementById('duelStyle')) return;
    const s = document.createElement('style'); s.id = 'duelStyle';
    s.textContent = `
.duel{position:fixed;inset:0;z-index:60;background:var(--page,#f7f8f2);color:var(--ink,#253025);display:flex;justify-content:center;overflow:auto;overscroll-behavior:contain;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)}
.duel-panel{width:min(720px,100%);padding:0 16px 24px;display:flex;flex-direction:column;min-height:100%}
.duel-top{display:flex;align-items:center;gap:12px;height:64px;border-bottom:1px solid var(--line,#e2e6db);flex:none}
.duel-top h2{margin:0;font-size:22px;letter-spacing:-.6px;font-weight:760;margin-right:auto}
.duel-round{font-size:14px;color:var(--muted,#697362);font-variant-numeric:tabular-nums}
.duel-x{width:44px;height:44px;border-radius:50%;display:grid;place-items:center;border:1px solid #dfe4d6;background:#eef1e7}
.duel-body{flex:1;display:flex;flex-direction:column;gap:14px;padding-top:18px}
.duel-body.center{justify-content:center;max-width:420px;width:100%;margin:0 auto}
.duel-btn{min-height:52px;border-radius:14px;padding:0 18px;font-size:16px;font-weight:650;display:flex;align-items:center;justify-content:center;gap:10px;width:100%}
.duel-btn.primary{background:var(--ink,#253025);color:#fff}
.duel-btn.secondary{background:#eef1e7;border:1px solid var(--line,#e2e6db)}
.duel-btn:disabled{opacity:.45}
.duel-join{display:flex;gap:8px}
.duel-join input{flex:1;min-width:0;height:52px;border-radius:14px;border:1px solid var(--line,#e2e6db);background:#fff;padding:0 16px;font:inherit;font-size:18px;letter-spacing:.2em;text-transform:uppercase;color:inherit}
.duel-join .duel-btn{width:auto}
.duel-note{margin:0;text-align:center;color:var(--muted,#697362);font-size:14px;min-height:20px}
.duel-note.err{color:var(--error,#a33039)}
.duel-code{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px;border-radius:16px;background:#eef1e7;border:1px solid var(--line,#e2e6db)}
.duel-code b{font-size:30px;letter-spacing:.18em;font-variant-numeric:tabular-nums}
.duel-code .duel-btn{width:auto;min-height:44px;font-size:14px}
.duel-cats{display:flex;flex-wrap:wrap;gap:6px}
.duel-cats button{min-height:44px;padding:0 14px;border-radius:100px;border:1px solid var(--line,#e2e6db);background:#fff;font-size:14px;font-weight:550}
.duel-cats button[aria-pressed=true]{background:var(--lime,#c7e99a);border-color:#adbfa0}
.duel-list{list-style:none;margin:0;padding:0;display:grid;gap:6px}
.duel-list li{display:flex;align-items:center;gap:10px;min-height:44px;padding:0 14px;border-radius:12px;background:#fff;border:1px solid var(--line,#e2e6db);font-size:15px}
.duel-list li .sc{margin-left:auto;font-weight:700;font-variant-numeric:tabular-nums}
.duel-list li .tag{font-size:12px;color:var(--muted,#697362)}
.duel-list li.me{border-color:#adbfa0;background:#f2f7ea}
.duel-list li.gone{opacity:.5}
.duel-list .rk{width:18px;color:var(--muted,#697362);font-variant-numeric:tabular-nums}
.duel-dot{width:8px;height:8px;border-radius:50%;background:var(--line,#e2e6db);flex:none}
.duel-dot.on{background:var(--green,#365a2c)}
.duel-gain{font-size:13px;font-weight:650;color:var(--green,#365a2c);min-width:44px;text-align:right}
.duel-gain.miss{color:var(--muted,#697362)}
.duel-q{margin:0;text-align:center;font-size:clamp(22px,5vw,30px);font-weight:740;letter-spacing:-1px}
.duel-cards{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.duel-card{position:relative;display:flex;flex-direction:column;align-items:center;gap:6px;padding:14px 8px 16px;border-radius:22px;border:2px solid transparent;background:var(--p0,#e2efd6);min-width:0;overflow:hidden;transition:transform .15s,border-color .15s}
.duel-card:active{transform:scale(.98)}
.duel-card:disabled{cursor:default}
.duel-card.mine{border-color:var(--ink,#253025)}
.duel-card.higher{box-shadow:0 0 0 3px var(--lime,#c7e99a)}
.duel-name{font-size:clamp(16px,4.2vw,22px);font-weight:720;letter-spacing:-.5px;text-align:center;line-height:1.15;min-height:2.3em;display:flex;align-items:center}
.duel-art{width:150%;height:clamp(96px,22vh,170px);pointer-events:none}
.duel-art svg{width:100%;height:100%;overflow:visible}
.duel-val{font-size:clamp(26px,7vw,38px);font-weight:760;letter-spacing:-1px;font-variant-numeric:tabular-nums}
.duel-card .verdict{font-size:12px;font-weight:650;color:var(--muted,#697362);min-height:16px}
.duel-timer{height:6px;border-radius:3px;background:var(--line,#e2e6db);overflow:hidden}
.duel-timer i{display:block;height:100%;width:100%;background:var(--green,#365a2c);transform-origin:left center}
.duel-big{font-size:84px;font-weight:780;text-align:center;letter-spacing:-3px;font-variant-numeric:tabular-nums}
.duel-win{margin:0;text-align:center;font-size:34px;font-weight:780;letter-spacing:-1.2px}
@media(max-width:380px){.duel-panel{padding:0 12px 18px}.duel-cards{gap:8px}}
@media(prefers-reduced-motion:reduce){.duel-timer i{transition:none!important}}`;
    document.head.appendChild(s);
  }

  function ensureEl() {
    if (el) return;
    css();
    el = document.createElement('div'); el.className = 'duel'; el.id = 'duel'; el.hidden = true;
    el.innerHTML = `<div class="duel-panel" role="dialog" aria-modal="true" aria-labelledby="duelTitle"><header class="duel-top"><h2 id="duelTitle">Duel</h2><span class="duel-round" id="duelRound"></span><button class="duel-x" type="button" data-duel="close" aria-label="Close duel">${ic('close')}</button></header><div class="duel-body" id="duelBody"></div></div>`;
    document.body.appendChild(el);
    el.addEventListener('click', onClick);
    el.addEventListener('submit', ev => { ev.preventDefault(); const v = (el.querySelector('#duelCode') || {}).value || ''; if (v.trim()) connect('join', v.trim()); });
  }

  /* ---------- views ---------- */
  function body() { return el.querySelector('#duelBody'); }
  function setRound(text) { el.querySelector('#duelRound').textContent = text || ''; }
  function render() {
    if (!el || el.hidden) return;
    const b = body();
    b.className = 'duel-body' + (view === 'game' ? '' : ' center');
    if (view === 'menu') {
      setRound('');
      const s = stats();
      b.innerHTML = `<button class="duel-btn primary" type="button" data-duel="quick" ${busy ? 'disabled' : ''}>${ic('bolt')}Quick match</button>
        <button class="duel-btn secondary" type="button" data-duel="create" ${busy ? 'disabled' : ''}>${ic('users')}Private room</button>
        <form class="duel-join" autocomplete="off"><input id="duelCode" maxlength="4" inputmode="text" autocapitalize="characters" spellcheck="false" placeholder="CODE" aria-label="Room code"><button class="duel-btn secondary" type="submit" ${busy ? 'disabled' : ''}>Join</button></form>
        <p class="duel-note${note ? ' err' : ''}" role="status">${e(note || (busy ? 'Connecting…' : s.wins ? s.wins + (s.wins === 1 ? ' win' : ' wins') : ''))}</p>`;
    } else if (view === 'lobby') renderLobby(b);
    else if (view === 'count') { setRound(''); b.innerHTML = `<div class="duel-big" id="duelCount">3</div>`; }
    else if (view === 'game') renderGame(b);
    else if (view === 'final') renderFinal(b);
    waitText();
  }
  function waitText() {
    const w = el && el.querySelector('#duelWait'); if (!w || !quickAt) return;
    w.textContent = 'Starting in ' + Math.max(0, Math.ceil((quickAt - Date.now()) / 1000));
  }
  function renderLobby(b) {
    setRound('');
    const host = isHost(), n = room.peers.length;
    const players = room.peers.map(p => `<li class="${p.id === room.self.id ? 'me' : ''}"><span class="duel-dot on"></span>${e(p.name)}${p.id === room.self.id ? ' <span class="tag">you</span>' : ''}${p.id === room.host ? '<span class="sc tag">host</span>' : ''}</li>`).join('');
    const cats = host ? `<div class="duel-cats" role="group" aria-label="Category">${Object.keys(CAT_NAMES).map(k => `<button type="button" data-duel="cat" data-cat="${k}" aria-pressed="${cat === k}">${CAT_NAMES[k]}</button>`).join('')}</div>` : `<p class="duel-note">${e(CAT_NAMES[(room.meta && room.meta.cat) || 'mix'] || 'Mixed')}</p>`;
    const spectating = g && g.spectator && g.phase !== 'done';
    b.innerHTML = `${room.public ? '' : `<div class="duel-code"><b>${e(room.code)}</b><button class="duel-btn secondary" type="button" data-duel="invite">${ic('share')}Invite</button></div>`}
      <ul class="duel-list">${players}</ul>${cats}
      ${spectating ? '<p class="duel-note">A game is running. You join the next one.</p>' : host ? `<button class="duel-btn primary" type="button" data-duel="start" ${n < 2 ? 'disabled' : ''}>Start</button>` : room.public ? '' : '<p class="duel-note">Waiting for the host</p>'}
      <p class="duel-note" role="status" id="duelWait">${n < 2 ? 'Waiting for players' : ''}</p>
      <button class="duel-btn secondary" type="button" data-duel="leave">Leave</button>`;
  }
  function cardHTML(it, side, disabled) {
    const pal = (typeof PALETTES !== 'undefined' && PALETTES[it.palette]) || ['#e2efd6'];
    const art = typeof artwork === 'function' ? artwork(it) : '';
    return `<button class="duel-card" type="button" data-duel="pick" data-side="${side}" style="--p0:${pal[0]}" aria-label="${e(it.name)}" ${disabled ? 'disabled' : ''}><span class="duel-name">${e(it.name)}</span><span class="duel-art" aria-hidden="true">${art}</span><span class="duel-val" id="dv-${side}">?</span><span class="verdict" id="dverdict-${side}"></span></button>`;
  }
  function renderGame(b) {
    const pair = g.pairs[g.r];
    setRound((g.r + 1) + ' / ' + ROUNDS);
    const locked = g.spectator || g.phase !== 'answer' || !!g.mine;
    b.innerHTML = `<p class="duel-q">${e((typeof CATEGORIES !== 'undefined' && CATEGORIES[pair.cat] && CATEGORIES[pair.cat].prompt) || 'Which is higher?')}</p>
      <div class="duel-cards">${cardHTML(pair.left, 'left', locked)}${cardHTML(pair.right, 'right', locked)}</div>
      <div class="duel-timer" aria-hidden="true"><i id="duelBar"></i></div>
      <ol class="duel-list" id="duelScores"></ol>`;
    const bar = b.querySelector('#duelBar');
    if (g.phase === 'answer') {
      const left = Math.max(0, ANSWER_MS - (performance.now() - g.t0));
      bar.style.transform = `scaleX(${left / ANSWER_MS})`;
      requestAnimationFrame(() => requestAnimationFrame(() => { bar.style.transition = `transform ${left}ms linear`; bar.style.transform = 'scaleX(0)'; }));
    } else bar.style.transform = 'scaleX(0)';
    if (g.mine) b.querySelector(`[data-side="${g.mine.side}"]`).classList.add('mine');
    if (g.phase === 'reveal') showReveal();
    renderScores();
  }
  function renderScores() {
    const list = el && el.querySelector('#duelScores'); if (!list || !g) return;
    const rows = HLDuelRules.standings(g.ids, g.names, g.scores), ans = g.answers[g.r] || {};
    list.innerHTML = rows.map(row => {
      const a = ans[row.id], here = room && room.peers.some(p => p.id === row.id);
      const status = g.phase === 'reveal' ? `<span class="duel-gain${a && a.pts ? '' : ' miss'}">${a ? (a.pts ? '+' + a.pts : '0') : '–'}</span>` : `<span class="duel-dot${a ? ' on' : ''}" aria-label="${a ? 'Answered' : 'Thinking'}"></span>`;
      return `<li class="${row.id === room.self.id ? 'me' : ''}${here ? '' : ' gone'}"><span class="rk">${row.rank}</span>${e(row.name)}${status}<span class="sc">${row.score.toLocaleString('en-US')}</span></li>`;
    }).join('');
  }
  function showReveal() {
    const pair = g.pairs[g.r];
    for (const side of ['left', 'right']) {
      const it = pair[side], other = pair[side === 'left' ? 'right' : 'left'], card = el.querySelector(`[data-side="${side}"]`);
      if (!card) continue;
      card.disabled = true;
      el.querySelector('#dv-' + side).textContent = fmt(it);
      if (it.value >= other.value) card.classList.add('higher');
      el.querySelector('#dverdict-' + side).textContent = it.value === other.value ? 'Equal' : it.value > other.value ? 'Higher' : 'Lower';
    }
  }
  function renderFinal(b) {
    setRound('');
    const rows = HLDuelRules.standings(g.ids, g.names, g.scores), top = rows.filter(r => r.rank === 1);
    const me = rows.find(r => r.id === room.self.id);
    const title = g.spectator ? (top.length > 1 ? 'A tie' : top[0].name + ' wins') : me && me.rank === 1 ? (top.length > 1 ? 'A tie' : 'You win') : top.length > 1 ? 'A tie' : top[0].name + ' wins';
    b.innerHTML = `<p class="duel-win">${e(title)}</p>
      <ol class="duel-list">${rows.map(r => `<li class="${r.id === room.self.id ? 'me' : ''}"><span class="rk">${r.rank}</span>${e(r.name)}<span class="sc">${r.score.toLocaleString('en-US')}</span></li>`).join('')}</ol>
      ${isHost() ? `<button class="duel-btn primary" type="button" data-duel="start" ${room.peers.length < 2 ? 'disabled' : ''}>${ic('refresh')}Rematch</button>` : room.public ? '' : '<p class="duel-note">Waiting for the host</p>'}
      <p class="duel-note" role="status" id="duelWait"></p>
      <div class="lg-duel" id="duelBoard"></div>
      <button class="duel-btn secondary" type="button" data-duel="leave">Leave</button>`;
    try { const ui = window.Ludvig && window.Ludvig.ui; if (ui) ui.board(b.querySelector('#duelBoard'), { board: BOARD, limit: 5 }); } catch { /* optional */ }
  }

  /* ---------- room ---------- */
  async function connect(kind, code) {
    const mp = L(); if (!mp || busy) return;
    busy = true; note = ''; render();
    try {
      room = kind === 'quick' ? await mp.mp.join({ game: GAME, quick: true, max: MAX })
        : kind === 'create' ? await mp.mp.create({ game: GAME, max: MAX, visible: false })
        : await mp.mp.join({ game: GAME, room: String(code).toUpperCase(), max: MAX });
    } catch (err) { busy = false; note = ERR[err && err.code] || 'Could not connect.'; render(); return; }
    busy = false; g = null; view = 'lobby';
    offs = [
      room.on('message', onMessage),
      room.on('join', peer => { if (isHost() && g && g.phase !== 'done') room.sendTo(peer.id, sync()); checkQuick(); refresh(); }),
      room.on('leave', () => { checkQuick(); if (isHost() && g && g.phase === 'answer') maybeReveal(); refresh(); }),
      room.on('host', () => { if (isHost()) takeOver(); checkQuick(); refresh(); }),
      room.on('meta', () => refresh()),
      room.on('close', reason => { const lost = reason !== 'left'; teardown(); view = 'menu'; note = lost ? (ERR[reason] || 'Connection lost.') : ''; render(); })
    ];
    if (room.meta && room.meta.phase === 'playing' && !isHost()) g = { spectator: true, phase: 'answer', ids: [], names: {}, scores: {}, answers: {} };
    checkQuick(); render();
  }
  function teardown() { offs.forEach(f => f()); offs = []; clearTimers(); clearTimeout(quickTimer); quickTimer = null; quickAt = 0; room = null; g = null; }
  function leave() { if (room) { const r = room; teardown(); r.leave(); } view = 'menu'; note = ''; dropParam(); render(); }
  function refresh() { if (view === 'lobby' || view === 'final') render(); else if (view === 'game') renderScores(); }
  function emit(msg) { if (!room) return; room.send(msg); onMessage(room.self.id, msg); }
  // Quick-match rooms start by themselves 10 s after a second player arrives.
  function checkQuick() {
    if (!room || !room.public || (g && g.phase !== 'done' && !g.spectator) || room.peers.length < 2) { clearTimeout(quickTimer); quickTimer = null; quickAt = 0; return; }
    if (quickTimer) return;
    quickAt = Date.now() + QUICK_WAIT_MS;
    const step = () => { if (!room) return; if (Date.now() >= quickAt) { quickTimer = null; quickAt = 0; if (isHost() && room.peers.length >= 2) hostStart(); return; } waitText(); quickTimer = setTimeout(step, 1000); };
    waitText();
    quickTimer = setTimeout(step, 1000);
  }

  /* ---------- host ---------- */
  function hostStart() {
    if (!isHost() || room.peers.length < 2) return;
    clearTimeout(quickTimer); quickTimer = null; quickAt = 0;
    const seed = (Math.random() * 4294967296) >>> 0;
    const names = {}; room.peers.forEach(p => { names[p.id] = p.name; });
    room.setMeta({ open: false, phase: 'playing', cat });
    emit({ k: 'start', seed, cat, ids: room.peers.map(p => p.id), names });
    later(COUNT_MS, () => emit({ k: 'round', r: 0 }));
  }
  function maybeReveal() {
    if (!isHost() || !g || g.phase !== 'answer') return;
    const ans = g.answers[g.r] || {};
    const waiting = g.ids.filter(id => room.peers.some(p => p.id === id) && !ans[id]);
    if (!waiting.length) emit({ k: 'reveal', r: g.r });
  }
  function scheduleAfterReveal() {
    later(REVEAL_MS, () => { if (!g || !isHost()) return; if (g.r + 1 >= ROUNDS) emit({ k: 'end' }); else emit({ k: 'round', r: g.r + 1 }); });
  }
  function scheduleReveal(ms) { const r = g.r; later(ms, () => { if (g && g.r === r && g.phase === 'answer' && isHost()) emit({ k: 'reveal', r }); }); }
  // A new host picks up wherever the old one left off.
  function takeOver() {
    clearTimers();
    cat = (room && room.meta && room.meta.cat) || cat;
    if (!g || g.spectator) { g = null; if (room) room.setMeta({ open: true, phase: 'lobby', cat }); if (view !== 'menu') { view = 'lobby'; render(); } return; }
    if (g.phase === 'count') later(COUNT_MS, () => emit({ k: 'round', r: 0 }));
    else if (g.phase === 'answer') { scheduleReveal(Math.max(0, ANSWER_MS + GRACE_MS - (performance.now() - g.t0))); maybeReveal(); }
    else if (g.phase === 'reveal') scheduleAfterReveal();
    else if (g.phase === 'done') room.setMeta({ open: true, phase: 'lobby', cat });
  }
  function sync() { return { k: 'sync', seed: g.seed, cat: g.cat, ids: g.ids, names: g.names, r: g.r, scores: g.scores, phase: g.phase }; }

  /* ---------- messages ---------- */
  function onMessage(from, m) {
    if (!m || typeof m !== 'object' || !room) return;
    if (m.k === 'start' && from === room.host) {
      clearTimers();
      g = { seed: m.seed >>> 0, cat: m.cat, ids: (m.ids || []).slice(0, 16), names: m.names || {}, pairs: HLDuelRules.pairs(DATA, CAT_KEYS.includes(m.cat) ? m.cat : 'mix', m.seed >>> 0), r: 0, phase: 'count', scores: {}, answers: {}, mine: null, spectator: !(m.ids || []).includes(room.self.id), counted: false };
      g.ids.forEach(id => { g.scores[id] = 0; });
      if (g.spectator) { view = 'lobby'; render(); return; }
      view = 'count'; render(); countdown();
      if (H.ensureAudio) H.ensureAudio();
    } else if (m.k === 'sync' && (!g || g.spectator)) {
      g = { seed: m.seed >>> 0, cat: m.cat, ids: m.ids || [], names: m.names || {}, pairs: HLDuelRules.pairs(DATA, CAT_KEYS.includes(m.cat) ? m.cat : 'mix', m.seed >>> 0), r: m.r | 0, phase: m.phase, scores: m.scores || {}, answers: {}, mine: null, spectator: true };
      render();
    } else if (m.k === 'round' && g && from === room.host) {
      if (g.spectator) { g.r = Math.min(ROUNDS - 1, m.r | 0); g.phase = 'answer'; return; }
      g.r = Math.min(ROUNDS - 1, m.r | 0); g.phase = 'answer'; g.mine = null; g.t0 = performance.now();
      view = 'game'; render(); focusCard();
      clearTimers();
      if (isHost()) scheduleReveal(ANSWER_MS + GRACE_MS);
      later(ANSWER_MS, () => { if (g && g.phase === 'answer' && !g.mine) lockCards(); });
    } else if (m.k === 'ans' && g) {
      const r = m.r | 0; if (r < 0 || r >= ROUNDS || !g.ids.includes(from)) return;
      const ans = g.answers[r] || (g.answers[r] = {});
      if (ans[from]) return;
      const ms = Math.max(0, Math.min(ANSWER_MS, Number(m.ms) || 0)), pts = HLDuelRules.points(!!m.ok, ms);
      ans[from] = { ok: !!m.ok, ms, pts }; g.scores[from] = (g.scores[from] || 0) + pts;
      if (view === 'game' && r === g.r) renderScores();
      if (isHost() && r === g.r) maybeReveal();
    } else if (m.k === 'reveal' && g && from === room.host) {
      if ((m.r | 0) !== g.r || g.phase !== 'answer') return;
      g.phase = 'reveal';
      if (!g.spectator && view === 'game') {
        showReveal(); renderScores();
        const mine = (g.answers[g.r] || {})[room.self.id];
        if (mine && mine.ok) { if (H.soundCorrect) H.soundCorrect(g.r + 1); } else if (H.soundWrong) H.soundWrong();
        const bar = el.querySelector('#duelBar'); if (bar) { bar.style.transition = 'none'; bar.style.transform = 'scaleX(0)'; }
      }
      clearTimers();
      if (isHost()) scheduleAfterReveal();
    } else if (m.k === 'end' && g && from === room.host) {
      clearTimers(); const wasPlayer = !g.spectator; g.phase = 'done';
      if (wasPlayer && !g.counted) { g.counted = true; recordResult(); }
      if (isHost()) room.setMeta({ open: true, phase: 'lobby', cat });
      if (wasPlayer) view = 'final'; else { g = null; view = 'lobby'; }
      render(); checkQuick();
    }
  }
  function countdown() {
    let n = 3;
    const step = () => { const c = el.querySelector('#duelCount'); if (!c || view !== 'count') return; c.textContent = String(n); n--; if (n > 0) later(1000, step); };
    step();
  }
  function recordResult() {
    const rows = HLDuelRules.standings(g.ids, g.names, g.scores), me = rows.find(r => r.id === room.self.id);
    const s = stats(); s.played++;
    if (me && me.rank === 1 && g.ids.length >= 2) {
      s.wins++;
      try { if (window.Ludvig && typeof window.Ludvig.score === 'function') window.Ludvig.score(BOARD, s.wins); } catch { /* optional */ }
    }
    saveStats(s);
  }
  function pick(side) {
    if (!g || g.spectator || g.phase !== 'answer' || g.mine) return;
    const ms = Math.round(performance.now() - g.t0);
    if (ms > ANSWER_MS) { lockCards(); return; }
    const ok = HLDuelRules.correct(g.pairs[g.r], side);
    g.mine = { side, ms };
    lockCards();
    const card = el.querySelector(`[data-side="${side}"]`); if (card) card.classList.add('mine');
    if (H.haptic) H.haptic(10);
    emit({ k: 'ans', r: g.r, ok: ok ? 1 : 0, ms });
  }
  function lockCards() { el.querySelectorAll('.duel-card').forEach(c => { c.disabled = true; }); }
  function focusCard() { if (document.body.dataset.input === 'keyboard') { const c = el.querySelector('.duel-card'); if (c) c.focus({ preventScroll: true }); } }

  /* ---------- input ---------- */
  function onClick(ev) {
    const t = ev.target.closest('[data-duel]'); if (!t) return;
    const a = t.dataset.duel;
    if (a === 'close') close();
    else if (a === 'quick' || a === 'create') connect(a);
    else if (a === 'start') hostStart();
    else if (a === 'leave') leave();
    else if (a === 'cat') { cat = t.dataset.cat; if (room) room.setMeta({ ...(room.meta || {}), cat }); render(); }
    else if (a === 'pick') pick(t.dataset.side);
    else if (a === 'invite') invite();
  }
  function link() { return location.origin + location.pathname + '?duel=' + encodeURIComponent(room.code); }
  function invite() {
    const url = link(), toast = H.showToast || (() => {});
    if (matchMedia('(pointer: coarse)').matches && navigator.share) { navigator.share({ url, text: 'Higher or Lower duel · ' + room.code }).catch(() => {}); return; }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(() => toast('Invite link copied'), () => toast('Code: ' + room.code));
    else toast('Code: ' + room.code);
  }
  window.addEventListener('keydown', ev => {
    if (!el || el.hidden) return;
    ev.stopPropagation();
    const k = ev.key.toLowerCase();
    if (k === 'escape') { ev.preventDefault(); close(); return; }
    if (/INPUT|TEXTAREA/.test(ev.target.tagName)) return;
    if (view === 'game' && (k === 'arrowleft' || k === 'a')) { ev.preventDefault(); pick('left'); }
    else if (view === 'game' && (k === 'arrowright' || k === 'd')) { ev.preventDefault(); pick('right'); }
  }, true);
  function dropParam() {
    try { const u = new URL(location.href); if (u.searchParams.has('duel')) { u.searchParams.delete('duel'); history.replaceState(history.state, '', u.pathname + (u.search || '') + u.hash); } } catch { /* ignore */ }
  }

  function open(code) {
    if (!available()) return false;
    ensureEl();
    if (H.closeModal) H.closeModal();
    lastFocus = document.activeElement;
    el.hidden = false; document.documentElement.style.overflow = 'hidden';
    if (!room) { view = 'menu'; note = ''; }
    render();
    if (code && !room) connect('join', code);
    requestAnimationFrame(() => { const f = el.querySelector('.duel-btn,.duel-card,.duel-x'); if (f) f.focus({ preventScroll: true }); });
    return true;
  }
  function close() {
    if (room && g && !g.spectator && g.phase !== 'done' && !confirm('Leave this duel?')) return;
    leave();
    el.hidden = true; document.documentElement.style.overflow = '';
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }

  root.HLDuel = {
    available,
    open,
    attach(helpers) { Object.assign(H, helpers || {}); },
    isOpen: () => !!el && !el.hidden
  };
  // Invite links: /higher-or-lower/?duel=CODE opens the room straight away.
  function boot() {
    let code = null;
    try { code = new URLSearchParams(location.search).get('duel'); } catch { /* ignore */ }
    if (code && /^[A-Za-z0-9]{4}$/.test(code.trim())) setTimeout(() => open(code.trim()), 0);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})(typeof globalThis !== 'undefined' ? globalThis : this);
