/* SIX CLUES · Friends: a private League and a live Race, both over the Ludvig.mp relay.
   League: friends share today's result (clues used, solved or not) when they are online in the league room.
   Nothing about today is sent to a member who has not finished today, and the country itself is never sent.
   Results spread from member to member, so two friends do not need to be online at the same time.
   Race: everyone gets the same practice country at once, a new clue every 7 s; the first right guess wins
   the round, best of 5. The host (oldest peer) owns start, rounds, points and the end.
   SixFriendsRules is pure (tests/friends.test.mjs); the UI starts from SixFriends.init(api) in index.html. */
(function (root) {
  'use strict';
  const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', KEEP_DAYS = 14, WEEK = 7;
  const CLUE_MS = 7000, ROUND_MS = 6 * CLUE_MS + 10000, ROUNDS = 5, NEED = 3;

  function makeCode(rand = Math.random) { let s = ''; for (let i = 0; i < 6; i++) s += CODE_CHARS[Math.floor(rand() * CODE_CHARS.length)]; return s; }
  function cleanCode(c) { const s = String(c || '').trim().toUpperCase(); return /^[A-HJ-NP-Z2-9]{6}$/.test(s) ? s : null; }
  const cleanName = n => String(n || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 16) || 'Player';
  // res: { [day]: { [memberId]: { n: name, k: clues used 1–6, or 0 when not solved } } }
  function merge(res, list, today) {
    let changed = 0;
    if (!Array.isArray(list)) return 0;
    for (const e of list.slice(0, 200)) {
      if (!Array.isArray(e)) continue;
      const [m, name, day, k] = e;
      if (typeof m !== 'string' || !/^[a-f0-9]{12}$/.test(m)) continue;
      if (!Number.isInteger(day) || day > today || day < today - KEEP_DAYS + 1) continue;
      if (!Number.isInteger(k) || k < 0 || k > 6) continue;
      const d = res[day] || (res[day] = {}), nm = cleanName(name), old = d[m];
      if (!old || old.k !== k || old.n !== nm) { d[m] = { n: nm, k }; changed++; }
    }
    return changed;
  }
  function prune(res, today) { for (const d of Object.keys(res)) if (+d < today - KEEP_DAYS + 1 || +d > today) delete res[d]; return res; }
  // What to send a member: earlier days always, today only once they have finished today themselves.
  function outgoing(res, today, peerDone) {
    const out = [];
    for (const d of Object.keys(res).map(Number).sort((a, b) => b - a)) {
      if (d > today || d < today - KEEP_DAYS + 1 || (d === today && !peerDone)) continue;
      for (const [m, v] of Object.entries(res[d])) out.push([m, v.n, d, v.k]);
    }
    return out;
  }
  function chunks(list, size = 40) { const out = []; for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size)); return out; }
  // Today's rows: finished players first (fewest clues), then not solved, then not yet played.
  function todayRows(res, today, members) {
    const d = res[today] || {}, ids = new Set([...Object.keys(d), ...Object.keys(members)]);
    const rows = [...ids].map(m => ({ m, name: (d[m] && d[m].n) || members[m] || 'Player', k: d[m] ? d[m].k : null }));
    const rank = r => r.k === null ? 9 : r.k === 0 ? 8 : r.k;
    return rows.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
  }
  function weekRows(res, today, includeToday) {
    const acc = {};
    for (let d = today - WEEK + 1; d <= today; d++) {
      if (d === today && !includeToday) continue;
      for (const [m, v] of Object.entries(res[d] || {})) {
        const a = acc[m] || (acc[m] = { m, name: v.n, played: 0, solved: 0, clues: 0, last: d });
        a.played++; if (v.k) { a.solved++; a.clues += v.k; }
        if (d >= a.last) { a.last = d; a.name = v.n; }
      }
    }
    return Object.values(acc).map(a => ({ ...a, avg: a.solved ? Math.round(a.clues / a.solved * 10) / 10 : 0 }))
      .sort((a, b) => b.solved - a.solved || (a.avg || 9) - (b.avg || 9) || a.name.localeCompare(b.name));
  }
  function raceIsos(isos, rand, exclude, n = ROUNDS) {
    const pool = isos.filter(i => !exclude.includes(i));
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    return pool.slice(0, n);
  }
  function cluesShown(ms) { return Math.max(1, Math.min(6, 1 + Math.floor(Math.max(0, ms) / CLUE_MS))); }
  function standings(ids, names, scores) {
    const rows = ids.map(id => ({ id, name: names[id] || 'Player', score: scores[id] || 0 }));
    rows.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
    rows.forEach(r => { r.rank = 1 + rows.filter(o => o.score > r.score).length; });
    return rows;
  }
  function raceOver(scores, round) { return Object.values(scores).some(v => v >= NEED) || round + 1 >= ROUNDS; }
  root.SixFriendsRules = { CLUE_MS, ROUND_MS, ROUNDS, NEED, makeCode, cleanCode, merge, prune, outgoing, chunks, todayRows, weekRows, raceIsos, cluesShown, standings, raceOver };
  if (typeof document === 'undefined') return;

  /* ---------- UI ---------- */
  const R = root.SixFriendsRules, STORE = 'six-clues.friends.v1', LGAME = 'six-clues-league', RGAME = 'six-clues', RBOARD = 'six-clues:race';
  const TXT = {
    en: {
      league: 'League', race: 'Race', leagueLine: 'See how friends did on today’s country.', startLeague: 'Start a league', join: 'Join', invite: 'Invite', newLeague: 'New league',
      today: 'Today', week: 'Last 7 days', finishFirst: 'Finish today’s country to see results.', notYet: 'Not yet', done: 'Done', you: 'you', leaveLeague: 'Leave league',
      week1: (s, a) => s + ' solved' + (a ? ' · ' + String(a) + ' avg' : ''), alone: 'Invite friends with the link or code.', connecting: 'Connecting…',
      raceLine: 'Same country. First right guess wins.', quick: 'Quick match', priv: 'Private room', start: 'Start', waitHost: 'Waiting for the host', waitPlayers: 'Waiting for players',
      startingIn: s => 'Starting in ' + s, leave: 'Leave', round: (r, n) => 'Round ' + r + ' / ' + n, gotIt: n => n + ' got it', youGot: 'You got it', nobody: 'Nobody got it',
      checking: 'Checking…', rematch: 'Rematch', youWin: 'You win', wins: n => n + ' wins', tie: 'A tie', running: 'A race is running. You join the next one.',
      err: { 'not-found': 'No room with that code.', full: 'That room is full.', 'rate-limited': 'Too many tries. Wait a minute.', offline: 'You are offline.', network: 'Connection lost.', other: 'Could not connect.' },
      copied: 'Invite link copied', badCode: 'Codes have 6 letters or digits.', confirmLeave: 'Leave this league?', confirmRace: 'Leave this race?', code: 'Code'
    },
    sv: {
      league: 'Liga', race: 'Kapplöpning', leagueLine: 'Se hur vännerna klarade dagens land.', startLeague: 'Starta en liga', join: 'Gå med', invite: 'Bjud in', newLeague: 'Ny liga',
      today: 'Idag', week: 'Senaste 7 dagarna', finishFirst: 'Lös dagens land för att se resultaten.', notYet: 'Inte än', done: 'Klar', you: 'du', leaveLeague: 'Lämna ligan',
      week1: (s, a) => s + ' lösta' + (a ? ' · snitt ' + String(a).replace('.', ',') : ''), alone: 'Bjud in vänner med länken eller koden.', connecting: 'Ansluter…',
      raceLine: 'Samma land. Första rätta gissning vinner.', quick: 'Snabbmatch', priv: 'Privat rum', start: 'Starta', waitHost: 'Väntar på värden', waitPlayers: 'Väntar på spelare',
      startingIn: s => 'Startar om ' + s, leave: 'Lämna', round: (r, n) => 'Runda ' + r + ' / ' + n, gotIt: n => n + ' hittade det', youGot: 'Du hittade det', nobody: 'Ingen hittade det',
      checking: 'Kollar…', rematch: 'Kör igen', youWin: 'Du vann', wins: n => n + ' vann', tie: 'Oavgjort', running: 'Ett lopp pågår. Du är med i nästa.',
      err: { 'not-found': 'Inget rum med den koden.', full: 'Rummet är fullt.', 'rate-limited': 'För många försök. Vänta en minut.', offline: 'Du är offline.', network: 'Anslutningen bröts.', other: 'Kunde inte ansluta.' },
      copied: 'Inbjudningslänken är kopierad', badCode: 'Koden har 6 bokstäver eller siffror.', confirmLeave: 'Lämna den här ligan?', confirmRace: 'Lämna loppet?', code: 'Kod'
    }
  };
  let A = null; // api from index.html
  const tx = () => TXT[A.lang()] || TXT.en;
  const $ = id => document.getElementById(id);
  const e = s => A.esc(s);
  const L = () => { const x = window.Ludvig; return x && x.mp && typeof x.mp.join === 'function' && x.player ? x : null; };
  const available = () => !!L() && navigator.onLine !== false;
  const errText = c => tx().err[c] || tx().err.other;

  let data = loadData(), visible = false;
  function loadData() {
    try { const x = JSON.parse(localStorage.getItem(STORE) || '{}'); return { leagues: Array.isArray(x.leagues) ? x.leagues.filter(R.cleanCode).slice(0, 3) : [], active: x.active || null, res: x.res && typeof x.res === 'object' ? x.res : {}, raceWins: x.raceWins | 0 }; }
    catch { return { leagues: [], active: null, res: {}, raceWins: 0 }; }
  }
  function saveData() { try { localStorage.setItem(STORE, JSON.stringify(data)); } catch { /* storage blocked */ } }
  function activeCode() { if (!data.leagues.includes(data.active)) data.active = data.leagues[0] || null; return data.active; }
  function resFor(code) { const r = data.res[code] || (data.res[code] = {}); R.prune(r, A.puzzle()); return r; }

  async function hashHex(text) {
    try {
      if (window.crypto && crypto.subtle && window.TextEncoder) {
        const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
        return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
      }
    } catch { /* fall back below */ }
    let h1 = 0x811c9dc5, h2 = 0x9747b28c;
    for (let i = 0; i < text.length; i++) { const c = text.charCodeAt(i); h1 = Math.imul(h1 ^ c, 16777619); h2 = Math.imul(h2 ^ c, 0x5bd1e995); h2 ^= h2 >>> 13; }
    const hex = n => (n >>> 0).toString(16).padStart(8, '0');
    return (hex(h1) + hex(h2)).repeat(4);
  }
  function myToday() {
    const d = A.today();
    if (!d || d.status === 'playing') return null;
    return d.status === 'won' ? d.guesses.length : 0;
  }
  const doneToday = () => myToday() !== null;

  /* ---------- league connection ---------- */
  let lg = null; // { code, tag, me, proof, room, offs, peers, status, timers }
  async function lgConnect() {
    const code = activeCode(), Lv = L();
    if (!code || !Lv || !available()) return;
    if (lg && lg.code === code && (lg.room || lg.status === 'connecting')) return;
    lgDisconnect();
    const mine = lg = { code, room: null, offs: [], peers: {}, status: 'connecting', timers: [] };
    renderLeague();
    try {
      mine.tag = (await hashHex('six-clues-league:' + code)).slice(0, 12);
      mine.me = (await hashHex('member:' + Lv.player.id + ':' + code)).slice(0, 12);
      const rooms = await Lv.mp.list({ game: LGAME });
      if (lg !== mine) return;
      const match = rooms.filter(r => r.meta && r.meta.lg === mine.tag).sort((a, b) => a.code < b.code ? -1 : 1)[0];
      const room = match ? await Lv.mp.join({ game: LGAME, room: match.code, max: 16 }) : await Lv.mp.create({ game: LGAME, max: 16, visible: true });
      if (lg !== mine) { room.leave(); return; }
      if (!match) room.setMeta({ lg: mine.tag });
      await lgAttach(mine, room);
    } catch (err) {
      if (lg !== mine) return;
      mine.status = 'error'; mine.error = err && err.code; renderLeague();
    }
  }
  async function lgAttach(mine, room) {
    mine.room = room; mine.status = 'on'; mine.proof = null; mine.q = [];
    mine.offs = [
      room.on('message', (from, m) => lgMessage(mine, from, m)),
      room.on('leave', peer => { delete mine.peers[peer.id]; renderLeague(); }),
      room.on('close', () => { if (lg === mine) { mine.room = null; mine.status = 'off'; mine.offs.forEach(f => f()); renderLeague(); } })
    ];
    mine.proof = (await hashHex('proof:' + mine.code + ':' + room.code)).slice(0, 16);
    if (lg !== mine || mine.room !== room) return;
    // At most 10 league messages a second, whatever the league size.
    clearInterval(mine.pump);
    mine.pump = setInterval(() => { const job = mine.q.shift(); if (job && mine.room === room) job(); }, 100);
    lgHello(mine, null, false);
    // Two friends who open the league at the same moment can make two rooms; both move to the lower code.
    const check = async () => {
      if (lg !== mine || !mine.room) return;
      const rooms = await L().mp.list({ game: LGAME });
      const lower = rooms.filter(r => r.meta && r.meta.lg === mine.tag && r.code < mine.room.code).sort((a, b) => a.code < b.code ? -1 : 1)[0];
      if (lower && lg === mine) {
        const old = mine.room; mine.offs.forEach(f => f()); mine.offs = []; clearInterval(mine.pump); mine.room = null; old.leave();
        try { const room = await L().mp.join({ game: LGAME, room: lower.code, max: 16 }); if (lg !== mine) { room.leave(); return; } mine.peers = {}; await lgAttach(mine, room); }
        catch { if (lg === mine) { mine.room = null; mine.status = 'off'; renderLeague(); } }
        return;
      }
      mine.timers.push(setTimeout(check, 20000));
    };
    mine.timers.push(setTimeout(check, 2500));
    renderLeague();
  }
  function lgDisconnect() {
    if (!lg) return;
    const old = lg; lg = null;
    old.timers.forEach(clearTimeout); clearInterval(old.pump); old.offs.forEach(f => f());
    if (old.room) old.room.leave();
  }
  function lgHello(mine, to, reply) {
    if (!mine.room) return;
    const msg = { k: 'hi', m: mine.me, n: L().player.name, d: A.puzzle(), done: doneToday(), p: mine.proof, r: reply ? 1 : 0 };
    const room = mine.room;
    mine.q.push(() => { if (to) room.sendTo(to, msg); else room.send(msg); });
  }
  function lgSend(mine, to, peerDone) {
    const list = R.outgoing(resFor(mine.code), A.puzzle(), peerDone);
    const room = mine.room; if (!room) return;
    for (const part of R.chunks(list)) mine.q.push(() => room.sendTo(to, { k: 'res', p: mine.proof, list: part }));
  }
  function lgMessage(mine, from, m) {
    if (!m || !mine.proof || m.p !== mine.proof || lg !== mine) return; // only members who know the league code
    if (m.k === 'hi') {
      const was = mine.peers[from];
      mine.peers[from] = { m: typeof m.m === 'string' ? m.m : '', name: String(m.n || 'Player').slice(0, 16), done: !!m.done };
      if (!m.r) lgHello(mine, from, true);
      if (!was || was.done !== !!m.done || !m.r) lgSend(mine, from, !!m.done);
      renderLeague();
    } else if (m.k === 'res') {
      if (R.merge(resFor(mine.code), m.list, A.puzzle())) { saveData(); renderLeague(); }
    }
  }
  // Puts my finished daily result into every league I am in.
  function recordMine() {
    const k = myToday(); if (k === null || !L()) return Promise.resolve();
    return Promise.all(data.leagues.map(async code => {
      const me = (await hashHex('member:' + L().player.id + ':' + code)).slice(0, 12);
      R.merge(resFor(code), [[me, L().player.name, A.puzzle(), k]], A.puzzle());
    })).then(saveData);
  }
  let idleTimer = null;
  function want(on, ms) {
    clearTimeout(idleTimer);
    if (on) lgConnect();
    else idleTimer = setTimeout(lgDisconnect, ms == null ? 20000 : ms);
  }

  /* ---------- race ---------- */
  let race = null; // { room, offs, timers, g, view, note, autoAt, autoT }
  let raceBusy = false, raceNote = '';
  const rIsHost = () => race && race.room.host === race.room.self.id;
  function rLater(ms, fn) { if (race) race.timers.push(setTimeout(fn, ms)); }
  function rClear() { if (race) { race.timers.forEach(clearTimeout); race.timers = []; } }
  async function raceConnect(kind, code) {
    const Lv = L(); if (!Lv || raceBusy || race) return;
    raceBusy = true; raceNote = ''; renderRace();
    let room;
    try {
      room = kind === 'quick' ? await Lv.mp.join({ game: RGAME, quick: true, max: 6 })
        : kind === 'create' ? await Lv.mp.create({ game: RGAME, max: 6, visible: false })
        : await Lv.mp.join({ game: RGAME, room: String(code).toUpperCase(), max: 6 });
    } catch (err) { raceBusy = false; raceNote = errText(err && err.code); renderRace(); return; }
    raceBusy = false;
    race = { room, offs: [], timers: [], g: null, autoAt: 0, autoT: null };
    if (room.meta && room.meta.phase === 'racing') race.g = { spectator: true, phase: 'guess', ids: [], names: {}, scores: {} };
    race.offs = [
      room.on('message', raceMessage),
      room.on('join', peer => { if (rIsHost() && race.g && race.g.phase !== 'done' && !race.g.spectator) room.sendTo(peer.id, rSync()); rAuto(); renderRace(); }),
      room.on('leave', () => { rAlone(); rAuto(); renderRace(); }),
      room.on('host', () => { if (rIsHost()) rTakeOver(); rAlone(); rAuto(); renderRace(); }),
      room.on('close', reason => { const lost = reason !== 'left'; raceTeardown(); raceNote = lost ? errText(reason) : ''; renderAll(); })
    ];
    rAuto(); renderAll();
  }
  // A race needs two racers: if everyone else has left, the host ends it.
  function rAlone() {
    if (!race || !rIsHost()) return;
    const g = race.g; if (!g || g.spectator || g.phase === 'done') return;
    const here = new Set(race.room.peers.map(p => p.id));
    if (g.ids.filter(id => here.has(id)).length < 2) { rClear(); rEmit({ k: 'end' }); }
  }
  function raceTeardown() { if (!race) return; rClear(); clearTimeout(race.autoT); clearInterval(race.ticker); race.offs.forEach(f => f()); race = null; }
  function raceLeave() { if (race) { const r = race.room; raceTeardown(); r.leave(); } raceNote = ''; dropParam('race'); renderAll(); }
  function rEmit(msg) { if (!race) return; race.room.send(msg); raceMessage(race.room.self.id, msg); }
  function rAuto() {
    if (!race) return;
    const g = race.g, ok = race.room.public && race.room.peers.length >= 2 && (!g || g.phase === 'done');
    if (!ok) { clearTimeout(race.autoT); race.autoT = null; race.autoAt = 0; return; }
    if (race.autoT) return;
    race.autoAt = Date.now() + 10000;
    const step = () => { if (!race) return; if (Date.now() >= race.autoAt) { race.autoT = null; race.autoAt = 0; if (rIsHost()) rStart(); return; } rWait(); race.autoT = setTimeout(step, 1000); };
    race.autoT = setTimeout(step, 1000); rWait();
  }
  function rWait() { const w = $('rcWait'); if (w && race && race.autoAt) w.textContent = tx().startingIn(Math.max(1, Math.ceil((race.autoAt - Date.now()) / 1000))); }
  let raceRecent = [];
  function rStart() {
    if (!rIsHost() || race.room.peers.length < 2 || (race.g && race.g.phase !== 'done' && !race.g.spectator)) return;
    clearTimeout(race.autoT); race.autoT = null; race.autoAt = 0;
    const S = A.S, isos = R.raceIsos(S.countries.map(c => c.iso), Math.random, [A.dailyIso()].concat(raceRecent));
    raceRecent = isos.concat(raceRecent).slice(0, 120);
    const names = {}; race.room.peers.forEach(p => { names[p.id] = p.name; });
    race.room.setMeta({ open: false, phase: 'racing' });
    rEmit({ k: 'start', isos, ids: race.room.peers.map(p => p.id), names });
    rLater(3000, () => rEmit({ k: 'round', r: 0 }));
  }
  function rSync() { const g = race.g; return { k: 'sync', isos: g.isos, ids: g.ids, names: g.names, r: g.r, scores: g.scores, phase: g.phase }; }
  function rTakeOver() {
    const g = race.g; rClear();
    if (!g || g.spectator) { race.g = null; race.room.setMeta({ open: true, phase: 'lobby' }); return; }
    if (g.phase === 'count') rLater(3000, () => rEmit({ k: 'round', r: 0 }));
    else if (g.phase === 'guess') {
      rLater(Math.max(0, ROUND_MS - (performance.now() - g.t0)), () => { if (race && race.g === g && g.phase === 'guess') rEmit({ k: 'point', r: g.r, id: null }); });
      if (g.claims.length) rAward(g);
    } else if (g.phase === 'point') rNext(g);
    else if (g.phase === 'done') race.room.setMeta({ open: true, phase: 'lobby' });
  }
  // Collect claims for 0.4 s after the first, then award the fastest.
  function rAward(g) {
    if (g.awarding) return; g.awarding = true;
    rLater(400, () => {
      if (!race || race.g !== g || g.phase !== 'guess') return;
      const best = g.claims.slice().sort((a, b) => a.ms - b.ms)[0];
      rEmit({ k: 'point', r: g.r, id: best ? best.id : null });
    });
  }
  function rNext(g) { rLater(4000, () => { if (!race || race.g !== g || !rIsHost()) return; if (R.raceOver(g.scores, g.r)) rEmit({ k: 'end' }); else rEmit({ k: 'round', r: g.r + 1 }); }); }
  function raceMessage(from, m) {
    if (!race || !m || typeof m !== 'object') return;
    const room = race.room, me = room.self.id;
    if (m.k === 'start' && from === room.host) {
      rClear();
      const ids = (m.ids || []).slice(0, 6), isos = (m.isos || []).filter(i => A.S.byIso[i]).slice(0, ROUNDS);
      if (isos.length < ROUNDS) return;
      if (!rIsHost()) raceRecent = isos.concat(raceRecent.filter(i => !isos.includes(i))).slice(0, 120);
      race.g = { isos, ids, names: m.names || {}, scores: {}, r: 0, phase: 'count', spectator: !ids.includes(me), claims: [], winner: null };
      ids.forEach(id => { race.g.scores[id] = 0; });
      rAuto(); renderAll();
    } else if (m.k === 'sync' && (!race.g || race.g.spectator)) {
      race.g = { isos: m.isos || [], ids: m.ids || [], names: m.names || {}, scores: m.scores || {}, r: m.r | 0, phase: m.phase, spectator: true, claims: [] };
      renderRace();
    } else if (m.k === 'round' && race.g && from === room.host) {
      const g = race.g;
      g.r = Math.max(0, Math.min(ROUNDS - 1, m.r | 0)); g.phase = 'guess'; g.t0 = performance.now(); g.claims = []; g.awarding = false; g.winner = null;
      g.guessed = []; g.cool = 0; g.claimed = false;
      rClear();
      if (rIsHost()) rLater(ROUND_MS, () => { if (race && race.g === g && g.phase === 'guess') rEmit({ k: 'point', r: g.r, id: null }); });
      renderRace();
    } else if (m.k === 'got' && race.g && race.g.phase === 'guess') {
      const g = race.g;
      if ((m.r | 0) !== g.r || !g.ids.includes(from) || g.claims.some(c => c.id === from)) return;
      g.claims.push({ id: from, ms: Math.max(0, Number(m.ms) || 0) });
      if (rIsHost()) rAward(g);
    } else if (m.k === 'point' && race.g && from === room.host) {
      const g = race.g; if ((m.r | 0) !== g.r || g.phase !== 'guess') return;
      g.phase = 'point'; g.winner = g.ids.includes(m.id) ? m.id : null;
      if (g.winner) g.scores[g.winner] = (g.scores[g.winner] || 0) + 1;
      rClear(); if (rIsHost()) rNext(g);
      renderRace();
    } else if (m.k === 'end' && race.g && from === room.host) {
      const g = race.g; rClear(); const player = !g.spectator; g.phase = 'done';
      if (rIsHost()) room.setMeta({ open: true, phase: 'lobby' });
      if (player && !g.counted) {
        g.counted = true;
        const mine = R.standings(g.ids, g.names, g.scores).find(r => r.id === me);
        if (mine && mine.rank === 1 && g.ids.length >= 2) {
          data.raceWins++; saveData();
          try { if (window.Ludvig && typeof window.Ludvig.score === 'function') window.Ludvig.score(RBOARD, data.raceWins); } catch { /* optional */ }
        }
      }
      if (!player) race.g = null;
      rAuto(); renderAll();
    }
  }
  function raceGuess(country) {
    const g = race && race.g; if (!g || g.spectator || g.phase !== 'guess' || g.claimed) return;
    if (!country) { A.toast(A.t().pick); return; }
    const now = performance.now();
    if (now < g.cool) return;
    if (g.guessed.includes(country.iso)) { A.toast(A.t().already); return; }
    const input = $('rcGuess'); if (input) input.value = '';
    hideSugg();
    if (country.iso === g.isos[g.r]) {
      g.claimed = true;
      rEmit({ k: 'got', r: g.r, ms: Math.round(now - g.t0) });
      setStatus(tx().checking);
    } else {
      g.guessed.push(country.iso); g.cool = now + 2000;
      A.toast(A.t().notIt(A.S.name(country, A.lang())));
      const f = $('rcForm'); if (f) { f.classList.remove('shake'); void f.offsetWidth; f.classList.add('shake'); }
    }
  }

  /* ---------- rendering ---------- */
  function renderAll() { if (!visible) return; renderLeague(); renderRace(); }
  function renderLeague() {
    const box = $('frLeague'); if (!box || !visible) return;
    const racing = race && race.g && !race.g.spectator && race.g.phase !== 'done';
    box.hidden = !!racing;
    if (racing) return;
    const T = tx(), code = activeCode();
    if (!code || box.dataset.adding === '1') {
      if (box.dataset.view === 'form' && box.querySelector('input')) return; // keep what is being typed
      box.dataset.view = 'form';
      box.innerHTML = `<h3 class="fr-h">${e(T.league)}</h3><p class="fr-line">${e(T.leagueLine)}</p>
        <button class="btn wide" type="button" data-f="lg-new">${e(T.startLeague)}</button>
        <form class="fr-join" data-form="lg"><input maxlength="6" autocapitalize="characters" spellcheck="false" placeholder="${e(T.code)}" aria-label="${e(T.code)}"><button class="btn ghost" type="submit">${e(T.join)}</button></form>
        ${code ? `<button class="fr-link" type="button" data-f="lg-cancel">${e(A.t().close)}</button>` : ''}`;
      return;
    }
    box.dataset.view = 'league';
    const today = A.puzzle(), res = resFor(code), mine = doneToday(), meName = L() ? L().player.name : '';
    const online = {}, members = {};
    if (lg && lg.code === code && lg.room) for (const p of Object.values(lg.peers)) { if (p.m) { online[p.m] = p; members[p.m] = p.name; } }
    const myId = lg && lg.code === code ? lg.me : null;
    if (myId) members[myId] = meName;
    const rows = R.todayRows(res, today, members);
    const chips = `<div class="fr-chips">${data.leagues.map(c => `<button type="button" data-f="lg-pick" data-code="${c}" aria-pressed="${c === code}">${c}</button>`).join('')}${data.leagues.length < 3 ? `<button type="button" data-f="lg-add" aria-label="${e(T.newLeague)}">+</button>` : ''}</div>`;
    const todayList = rows.map(r => {
      const me = r.m === myId, peer = online[r.m];
      let val;
      if (!mine) val = r.k !== null || (peer && peer.done) ? T.done : T.notYet;
      else val = r.k === null ? (peer && peer.done ? T.done : T.notYet) : r.k ? r.k + '/6' : 'X';
      return `<li class="${me ? 'me' : ''}"><span class="fr-dot${peer || me ? ' on' : ''}"></span>${e(r.name)}${me ? ' <small>' + e(T.you) + '</small>' : ''}<b>${e(val)}</b></li>`;
    }).join('');
    const week = R.weekRows(res, today, mine);
    const status = lg && lg.code === code ? (lg.status === 'connecting' ? T.connecting : lg.status === 'error' ? errText(lg.error) : '') : '';
    box.innerHTML = `<div class="fr-top"><h3 class="fr-h">${e(T.league)}</h3><button class="btn ghost fr-small" type="button" data-f="lg-invite">${e(T.invite)}</button></div>${chips}
      <h4 class="fr-sub">${e(T.today)} #${today}</h4>
      ${rows.length ? `<ul class="fr-list">${todayList}</ul>` : ''}
      ${mine ? (rows.length <= 1 ? `<p class="fr-line">${e(T.alone)}</p>` : '') : `<p class="fr-line">${e(T.finishFirst)}</p>`}
      ${week.length ? `<h4 class="fr-sub">${e(T.week)}</h4><ul class="fr-list">${week.map(w => `<li class="${w.m === myId ? 'me' : ''}">${e(w.name)}<b>${e(T.week1(w.solved, w.avg))}</b></li>`).join('')}</ul>` : ''}
      <p class="fr-line" role="status">${e(status)}</p>
      <button class="fr-link" type="button" data-f="lg-leave">${e(T.leaveLeague)}</button>`;
  }
  function setStatus(text) { const s = $('rcStatus'); if (s) s.textContent = text || ''; }
  function scoresHTML(g) {
    const me = race.room.self.id;
    return `<ul class="fr-list fr-scores">${R.standings(g.ids, g.names, g.scores).map(r => `<li class="${r.id === me ? 'me' : ''}${race.room.peers.some(p => p.id === r.id) ? '' : ' gone'}">${e(r.name)}<b>${r.score}</b></li>`).join('')}</ul>`;
  }
  function renderRace() {
    const box = $('frRace'); if (!box || !visible) return;
    const T = tx();
    if (!race) {
      clearRaceTicker();
      box.innerHTML = `<h3 class="fr-h">${e(T.race)}</h3><p class="fr-line">${e(T.raceLine)}</p>
        <button class="btn wide" type="button" data-f="rc-quick" ${raceBusy ? 'disabled' : ''}>${e(T.quick)}</button>
        <button class="btn ghost wide" type="button" data-f="rc-create" ${raceBusy ? 'disabled' : ''}>${e(T.priv)}</button>
        <form class="fr-join" data-form="rc"><input maxlength="4" autocapitalize="characters" spellcheck="false" placeholder="${e(T.code)}" aria-label="${e(T.code)}"><button class="btn ghost" type="submit" ${raceBusy ? 'disabled' : ''}>${e(T.join)}</button></form>
        <p class="fr-line${raceNote ? ' err' : ''}" role="status">${e(raceNote || (raceBusy ? T.connecting : ''))}</p>`;
      return;
    }
    const g = race.g, room = race.room, me = room.self.id;
    const playing = g && !g.spectator && g.phase !== 'done';
    if (playing && (g.phase === 'guess' || g.phase === 'point' || g.phase === 'count')) {
      if (box.dataset.round === String(g.r) + g.phase && $('rcClues')) { const sc = $('rcScores'); if (sc) sc.innerHTML = scoresHTML(g); return; }
      renderPlaying(box, g); return;
    }
    clearRaceTicker(); box.dataset.round = '';
    if (g && g.phase === 'done' && !g.spectator) {
      const rows = R.standings(g.ids, g.names, g.scores), top = rows.filter(r => r.rank === 1), mine = rows.find(r => r.id === me);
      const title = top.length > 1 ? T.tie : mine && mine.rank === 1 ? T.youWin : T.wins(top[0].name);
      box.innerHTML = `<h3 class="fr-h fr-win">${e(title)}</h3>${scoresHTML(g)}
        ${rIsHost() ? `<button class="btn wide" type="button" data-f="rc-start" ${room.peers.length < 2 ? 'disabled' : ''}>${e(T.rematch)}</button>` : room.public ? '' : `<p class="fr-line">${e(T.waitHost)}</p>`}
        <p class="fr-line" id="rcWait"></p><div class="lg-board" id="rcBoard"></div>
        <button class="fr-link" type="button" data-f="rc-leave">${e(T.leave)}</button>`;
      try { const ui = window.Ludvig && window.Ludvig.ui; if (ui) ui.board($('rcBoard'), { board: RBOARD, limit: 5 }); } catch { /* optional */ }
      rWait(); return;
    }
    box.innerHTML = `<div class="fr-top"><h3 class="fr-h">${e(T.race)}</h3>${room.public ? '' : `<span class="fr-code">${e(room.code)}</span><button class="btn ghost fr-small" type="button" data-f="rc-invite">${e(T.invite)}</button>`}</div>
      <ul class="fr-list">${room.peers.map(p => `<li class="${p.id === me ? 'me' : ''}"><span class="fr-dot on"></span>${e(p.name)}${p.id === me ? ' <small>' + e(T.you) + '</small>' : ''}</li>`).join('')}</ul>
      ${g && g.spectator ? `<p class="fr-line">${e(T.running)}</p>` : rIsHost() && !room.public ? `<button class="btn wide" type="button" data-f="rc-start" ${room.peers.length < 2 ? 'disabled' : ''}>${e(T.start)}</button>` : room.public ? '' : `<p class="fr-line">${e(T.waitHost)}</p>`}
      <p class="fr-line" id="rcWait">${room.peers.length < 2 ? e(T.waitPlayers) : ''}</p>
      <button class="fr-link" type="button" data-f="rc-leave">${e(T.leave)}</button>`;
    rWait();
  }
  function renderPlaying(box, g) {
    const T = tx();
    box.dataset.round = String(g.r) + g.phase;
    box.innerHTML = `<div class="fr-top"><h3 class="fr-h">${e(T.round(g.r + 1, ROUNDS))}</h3><button class="fr-link" type="button" data-f="rc-leave">${e(T.leave)}</button></div>
      <div id="rcScores">${scoresHTML(g)}</div>
      <div class="fr-timer" aria-hidden="true"><i id="rcBar"></i></div>
      <ol class="clues" id="rcClues"></ol>
      <p class="fr-line fr-status" id="rcStatus" role="status"></p>
      ${g.phase === 'guess' ? `<form class="field fr-field" id="rcForm" autocomplete="off"><ul class="sugg" id="rcSugg" role="listbox" hidden></ul><input id="rcGuess" type="text" role="combobox" aria-autocomplete="list" aria-controls="rcSugg" aria-expanded="false" autocapitalize="words" autocorrect="off" spellcheck="false" enterkeyhint="go" placeholder="${e(A.t().placeholder)}" aria-label="${e(A.t().guessLabel)}"><button class="btn" type="submit">${e(A.t().guess)}</button></form>` : ''}`;
    shown = 0;
    if (g.phase === 'count') { setStatus('3'); let n = 3; const step = () => { n--; if (n > 0 && race && race.g === g && g.phase === 'count') { setStatus(String(n)); setTimeout(step, 1000); } }; setTimeout(step, 1000); return; }
    if (g.phase === 'point') {
      const c = A.S.byIso[g.isos[g.r]], me = race.room.self.id;
      drawClues(g, 6);
      setStatus((g.winner ? (g.winner === me ? T.youGot : T.gotIt(g.names[g.winner] || 'Player')) : T.nobody) + ' · ' + A.S.flagEmoji(c.iso) + ' ' + A.S.name(c, A.lang()));
      const bar = $('rcBar'); if (bar) bar.style.transform = 'scaleX(0)';
      return;
    }
    if (g.claimed) setStatus(T.checking);
    tickRace();
    clearRaceTicker(); race.ticker = setInterval(tickRace, 250);
    const input = $('rcGuess');
    if (input) {
      input.addEventListener('input', updateSugg);
      input.addEventListener('blur', () => setTimeout(hideSugg, 150));
      input.addEventListener('keydown', ev => {
        const list = $('rcSugg'); if (!list || list.hidden) return;
        if (ev.key === 'ArrowUp') { ev.preventDefault(); sActive = Math.min(sugg.length - 1, sActive + 1); hl(); }
        else if (ev.key === 'ArrowDown') { ev.preventDefault(); sActive = Math.max(0, sActive - 1); hl(); }
        else if (ev.key === 'Escape') hideSugg();
      });
      if (matchMedia('(hover: hover)').matches) setTimeout(() => input.focus(), 50);
    }
    const list = $('rcSugg');
    if (list) { list.addEventListener('mousedown', ev => ev.preventDefault()); list.addEventListener('click', ev => { const li = ev.target.closest('li'); if (li) choose(+li.dataset.i); }); }
  }
  let shown = 0;
  function drawClues(g, count) {
    const ol = $('rcClues'); if (!ol) return;
    const c = A.S.byIso[g.isos[g.r]], texts = A.S.clues(c, A.lang()), labels = A.t().labels;
    let html = '';
    for (let k = 0; k < count; k++) html += `<li class="clue${k >= shown && k === count - 1 && shown ? ' reveal' : ''}${k === count - 1 && g.phase === 'guess' ? ' current' : ''}"><div class="clue-num">${k + 1}</div><div class="clue-body"><div class="clue-label">${e(labels[k])}</div><p class="clue-text">${e(texts[k])}</p></div></li>`;
    ol.innerHTML = html; shown = count;
  }
  function tickRace() {
    const g = race && race.g; if (!g || g.phase !== 'guess') { clearRaceTicker(); return; }
    const ms = performance.now() - g.t0, n = R.cluesShown(ms);
    if (n !== shown) drawClues(g, n);
    const bar = $('rcBar');
    if (bar) { const left = n < 6 ? 1 - (ms % R.CLUE_MS) / R.CLUE_MS : Math.max(0, 1 - (ms - 5 * R.CLUE_MS) / (ROUND_MS - 5 * R.CLUE_MS)); bar.style.transform = `scaleX(${left.toFixed(3)})`; }
  }
  function clearRaceTicker() { if (race && race.ticker) { clearInterval(race.ticker); race.ticker = null; } }
  let sugg = [], sActive = 0;
  function updateSugg() {
    const input = $('rcGuess'), list = $('rcSugg'); if (!input || !list) return;
    const q = input.value; sugg = q.trim() ? A.S.suggest(q, A.lang(), 6) : []; sActive = 0;
    if (!sugg.length) { hideSugg(); return; }
    const used = (race && race.g && race.g.guessed) || [];
    list.innerHTML = sugg.map((s, i) => `<li role="option" id="rco${i}" data-i="${i}" class="${i === sActive ? 'active' : ''}${used.includes(s.country.iso) ? ' used' : ''}">${e(s.label)}${s.hint ? ' <small>' + e(s.hint) + '</small>' : ''}</li>`).reverse().join('');
    list.hidden = false; input.setAttribute('aria-expanded', 'true'); input.setAttribute('aria-activedescendant', 'rco0');
  }
  function hl() { const list = $('rcSugg'); if (!list) return; [...list.children].forEach(li => li.classList.toggle('active', +li.dataset.i === sActive)); const i = $('rcGuess'); if (i) i.setAttribute('aria-activedescendant', 'rco' + sActive); }
  function hideSugg() { const list = $('rcSugg'), i = $('rcGuess'); if (list) list.hidden = true; if (i) i.setAttribute('aria-expanded', 'false'); }
  function choose(i) { const s = sugg[i]; if (s) raceGuess(s.country); }

  /* ---------- actions ---------- */
  function link(param, code) { return location.origin + location.pathname + '?' + param + '=' + encodeURIComponent(code); }
  function share(url, text) {
    if (matchMedia('(pointer: coarse)').matches && navigator.share) { navigator.share({ url, text }).catch(() => {}); return; }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(() => A.toast(tx().copied), () => A.toast(url));
    else A.toast(url);
  }
  function dropParam(name) { try { const u = new URL(location.href); if (u.searchParams.has(name)) { u.searchParams.delete(name); history.replaceState(history.state, '', u.pathname + u.search + u.hash); } } catch { /* ignore */ } }
  function addLeague(code) {
    if (!data.leagues.includes(code)) { data.leagues.unshift(code); data.leagues = data.leagues.slice(0, 3); }
    data.active = code; saveData();
    recordMine().then(() => { const box = $('frLeague'); if (box) box.dataset.adding = ''; renderLeague(); want(true); });
  }
  function onClick(ev) {
    const b = ev.target.closest('[data-f]'); if (!b) return;
    const a = b.dataset.f, box = $('frLeague');
    if (a === 'lg-new') addLeague(R.makeCode());
    else if (a === 'lg-add') { box.dataset.adding = '1'; renderLeague(); }
    else if (a === 'lg-cancel') { box.dataset.adding = ''; renderLeague(); }
    else if (a === 'lg-pick') { data.active = b.dataset.code; saveData(); lgDisconnect(); renderLeague(); want(true); }
    else if (a === 'lg-invite') share(link('league', activeCode()), 'Six Clues · ' + tx().league + ' ' + activeCode());
    else if (a === 'lg-leave') {
      if (!confirm(tx().confirmLeave)) return;
      const c = activeCode(); lgDisconnect(); data.leagues = data.leagues.filter(x => x !== c); delete data.res[c]; data.active = null; saveData(); dropParam('league'); renderLeague(); want(true);
    }
    else if (a === 'rc-quick') raceConnect('quick');
    else if (a === 'rc-create') raceConnect('create');
    else if (a === 'rc-start') rStart();
    else if (a === 'rc-leave') { if (race && race.g && !race.g.spectator && race.g.phase !== 'done' && !confirm(tx().confirmRace)) return; raceLeave(); }
    else if (a === 'rc-invite' && race) share(link('race', race.room.code), 'Six Clues · ' + tx().race + ' ' + race.room.code);
  }
  function onSubmit(ev) {
    const f = ev.target; ev.preventDefault();
    if (f.id === 'rcForm') {
      const input = $('rcGuess'), exact = A.S.match(input.value);
      if (exact) raceGuess(exact); else if (!$('rcSugg').hidden && sugg[sActive]) choose(sActive); else raceGuess(null);
      return;
    }
    const v = (f.querySelector('input') || {}).value || '';
    if (f.dataset.form === 'lg') { const c = R.cleanCode(v); if (c) addLeague(c); else A.toast(tx().badCode); }
    else if (f.dataset.form === 'rc' && v.trim()) raceConnect('join', v.trim());
  }

  function css() {
    const s = document.createElement('style');
    s.textContent = `
.fr{display:grid;gap:14px;padding-bottom:24px}
.fr-card{padding:18px 18px 16px;border-radius:var(--radius);background:var(--card);border:1px solid var(--line);box-shadow:var(--shadow);display:grid;gap:10px}
.fr-top{display:flex;align-items:center;gap:10px}.fr-top .fr-h{margin-right:auto}
.fr-h{margin:0;font-family:var(--serif);font-size:22px}.fr-win{text-align:center;font-size:28px}
.fr-sub{margin:6px 0 0;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
.fr-line{margin:0;color:var(--muted);font-size:14px;line-height:1.45}.fr-line:empty{display:none}.fr-line.err{color:var(--bad)}
.fr-status{color:var(--ink);font-weight:600;font-size:16px;text-align:center}
.fr-code{font-weight:700;letter-spacing:.16em;font-variant-numeric:tabular-nums}
.fr-small{height:44px;padding:0 14px;font-size:14px}
.fr-join{display:flex;gap:8px}.fr-join input{flex:1;min-width:0;height:50px;border-radius:14px;border:1.5px solid var(--line);background:var(--bg);color:var(--ink);padding:0 14px;font:inherit;font-size:17px;letter-spacing:.16em;text-transform:uppercase}
.fr-join .btn{height:50px}
.fr-list{list-style:none;margin:0;padding:0;display:grid;gap:4px}
.fr-list li{display:flex;align-items:center;gap:10px;min-height:44px;padding:0 12px;border-radius:12px;background:var(--soft);font-size:15px}
.fr-list li b{margin-left:auto;font-variant-numeric:tabular-nums}.fr-list li small{color:var(--muted)}
.fr-list li.me{outline:1.5px solid var(--accent);outline-offset:-1.5px}.fr-list li.gone{opacity:.5}
.fr-scores{grid-template-columns:repeat(auto-fit,minmax(120px,1fr))}
.fr-dot{width:8px;height:8px;border-radius:50%;background:var(--faint);flex:none}.fr-dot.on{background:var(--good)}
.fr-chips{display:flex;flex-wrap:wrap;gap:6px}.fr-chips button{min-height:40px;min-width:44px;padding:0 12px;border-radius:999px;border:1px solid var(--line);background:transparent;font-weight:700;letter-spacing:.1em;font-size:13px;color:var(--muted)}
.fr-chips button[aria-pressed="true"]{background:var(--ink);color:var(--bg);border-color:var(--ink)}
.fr-link{justify-self:center;border:0;background:transparent;color:var(--muted);font-size:14px;min-height:44px;padding:0 12px}
.fr-timer{height:5px;border-radius:3px;background:var(--line);overflow:hidden}.fr-timer i{display:block;height:100%;background:var(--accent);transform-origin:left center;transition:transform .25s linear}
.fr-field{position:relative}
.btn.wide+.btn.wide{margin-top:-2px}`;
    document.head.appendChild(s);
  }

  root.SixFriends = {
    available,
    // api: { S, lang, t, puzzle, today, dailyIso, esc, toast }
    init(api) {
      A = api;
      let start = null;
      try {
        const q = new URLSearchParams(location.search), lgc = R.cleanCode(q.get('league')), rc = q.get('race');
        if (lgc && available()) { if (!data.leagues.includes(lgc)) { data.leagues.unshift(lgc); data.leagues = data.leagues.slice(0, 3); } data.active = lgc; saveData(); start = 'friends'; }
        if (rc && /^[A-Za-z0-9]{4}$/.test(rc.trim()) && available()) { start = 'friends'; setTimeout(() => raceConnect('join', rc.trim()), 0); }
      } catch { /* ignore */ }
      const main = $('friends');
      if (main) {
        css();
        main.innerHTML = '<div class="fr"><section class="fr-card" id="frLeague"></section><section class="fr-card" id="frRace"></section></div>';
        main.addEventListener('click', onClick); main.addEventListener('submit', onSubmit);
      }
      document.addEventListener('visibilitychange', () => { if (document.hidden) want(false, 20000); else if (visible) want(true); });
      window.addEventListener('online', () => api.refresh()); window.addEventListener('offline', () => api.refresh());
      return start;
    },
    show(on) { visible = on; if (on) { recordMine().then(() => renderAll()); renderAll(); want(true); } else want(false); },
    render: renderAll,
    // Called when today's daily is finished: share the result with the league for a short while.
    dailyDone() {
      if (!data.leagues.length || !available()) return;
      recordMine().then(() => {
        if (lg && lg.room) { for (const id of Object.keys(lg.peers)) lgSend(lg, id, lg.peers[id].done); lgHello(lg, null, false); }
        else lgConnect();
        if (!visible) want(false, 30000);
        renderLeague();
      });
    }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
