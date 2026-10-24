/* ANYTHING ARENA app: setup, picker, battle loop, sharing, recording and online rooms.
 * No AI and no paid API. Online play only sends small JSON messages through the
 * shared Ludvig relay; every device runs the same deterministic battle locally. */
(() => {
'use strict';
const E = window.ArenaEngine;
const schema = E.require('schema'), simMod = E.require('sim'), render = E.require('render'), audioMod = E.require('audio'), recMod = E.require('recorder');
const ROSTER = window.ARENA_ROSTER, BY_ID = window.ARENA_ROSTER_BY_ID, CATS = window.ARENA_CATEGORIES, ROSTER_VERSION = window.ARENA_ROSTER_VERSION;
const GAME = 'anything-arena', BOARD = 'anything-arena:wins', PICK_SECONDS = 20, MAX_ROOM = 8;
const $ = (id) => document.getElementById(id);
const show = (id, yes = true) => $(id).classList.toggle('hidden', !yes);
const set = (id, text) => { $(id).textContent = text; };
const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const body = document.body;
const audio = new audioMod.AudioEngine();
const ELEMENT_NAMES = { none: 'Neutral', fire: 'Fire', water: 'Water', ice: 'Ice', electric: 'Electric', earth: 'Earth', nature: 'Nature', air: 'Air', toxic: 'Toxic', arcane: 'Arcane' };
const TAG_NAMES = { swarm: 'swarms', giant: 'giants', ranged: 'ranged attacks', melee: 'close combat', fast: 'fast fighters', heavy: 'heavy hitters', tiny: 'tiny fighters' };
for (const f of ROSTER) schema.validateFighter(f);

function ludvigBoard(el, board) { try { const ui = window.Ludvig && window.Ludvig.ui; if (!ui || !el) return; el.textContent = ''; ui.board(el, { board, limit: 5 }); } catch { } }
function ludvigOpen(board) { try { const ui = window.Ludvig && window.Ludvig.ui; if (ui) ui.open({ board }); } catch { } }
if (window.Ludvig && window.Ludvig.ui) $('board-open').hidden = false;
$('board-open').addEventListener('click', e => { e.currentTarget.blur(); ludvigOpen(BOARD); });
let toastTimer = 0;
function toast(message) { set('toast', message); show('toast'); clearTimeout(toastTimer); toastTimer = setTimeout(() => show('toast', false), 3200); }
function freshSeed() { return crypto.getRandomValues(new Uint32Array(1))[0]; }
function safeRead(key) { try { return localStorage.getItem(key); } catch { return null; } }
function safeWrite(key, value) { try { localStorage.setItem(key, value); } catch { /* private mode */ } }
async function copyText(text) { try { if (!navigator.clipboard) throw 0; await navigator.clipboard.writeText(text); return true; } catch { return false; } }
const randomId = (rng = Math.random, avoid = []) => { const pool = ROSTER.filter(f => !avoid.includes(f.id)); return pool[Math.floor(rng() * pool.length)].id; };
const weakText = (f) => f.weak.length ? 'Weak to ' + f.weak.map(w => TAG_NAMES[w] || ELEMENT_NAMES[w].toLowerCase()).join(', ') : 'No known weakness';
const elDot = (f) => `<i class="el" style="--c:${schema.ELEMENT_COLORS[f.element]}"></i>`;

/* ---------- URLs: the hub shows the game in a same-origin iframe that does not forward ?query or #hash ---------- */
function pageLocation() { try { if (window.parent !== window && window.parent.location.origin === location.origin) return window.parent.location; } catch { /* cross-origin parent */ } return location; }
function hosted() { return /^https?:$/.test(location.protocol); }
function baseUrl() { const p = pageLocation(); return p.origin + p.pathname; }
function readParam(name) { for (const l of [location, pageLocation()]) { try { const v = new URLSearchParams(l.search).get(name); if (v) return v; } catch { } } return null; }
function readHash() { for (const l of [location, pageLocation()]) { try { if (l.hash.startsWith('#fight=')) return l.hash.slice(7); } catch { } } return null; }
function setHash(code) { if (!hosted()) return; for (const l of new Set([location, pageLocation()])) { try { const w = l === location ? window : window.parent; w.history.replaceState(null, '', l.pathname + l.search + (code ? '#fight=' + code : '')); } catch { } } }

/* ---------- Renderer ---------- */
let renderer;
try { renderer = new render.Renderer($('scene')); }
catch (e) { set('error', e instanceof Error ? e.message : '3D could not start.'); show('error'); $('fight').disabled = true; throw e; }
const recorder = new recMod.ClipRecorder();

/* ---------- Local state ---------- */
const SIZES = { '1v1': 1, '2v2': 2 };
let mode = '1v1', where = 'local';
let picks = [['alg'], ['surstromming']];
let phase = 'preview', seed = freshSeed(), sim = null, lastData = null, lockedShared = null, onlineFight = null;
let paused = false, countdownTime = 0, countText = '', accum = 0, slowRemaining = 0, freeze = 0, slowCooldown = 0;
let caption = '', captionUntil = 0, uiCounter = 0, lastTime = 0, resultRealTime = 0, captionPriority = 0;
const PRESETS = [[['alg'], ['surstromming']], [['gorilla'], ['knights']], [['grandmas'], ['t-rex']], [['yule-goat'], ['dragon']], [['vacuum'], ['dust-bunnies']], [['ants'], ['hamster']], [['wizard'], ['flatpack-lamp']], [['cat'], ['spinner']], [['snowman'], ['sun']], [['vikings'], ['kraken']]];
let presetIndex = -1;
const fighters = (ids) => ids.map(id => BY_ID[id]).filter(Boolean);

function newSim(a, b, s) { return new simMod.Simulation(a, b, s); }
function previewSim() { sim = newSim(fighters(picks[0]), fighters(picks[1]), seed); renderer.setFighters(sim); updateNames(); updateHud(); }

function updateNames() { set('name-a', sim.teams[0].label); set('name-b', sim.teams[1].label); }
function updateHud() {
    for (const t of [0, 1]) { const id = t === 0 ? 'a' : 'b', s = sim.score(t); $('health-' + id).style.transform = `scaleX(${Math.max(0, s.health)})`; set('count-' + id, s.remaining.toLocaleString('en')); }
    set('timer', phase === 'preview' ? 'VS' : `${sim.time.toFixed(1)}s`);
}

/* ---------- Setup panel ---------- */
function sideSize(side) { return mode === 'team' ? picks[side].length : SIZES[mode]; }
function normalizePicks() {
    for (const side of [0, 1]) {
        const want = mode === 'team' ? Math.max(1, Math.min(4, picks[side].length)) : SIZES[mode];
        while (picks[side].length < want) picks[side].push(randomId(Math.random, picks.flat()));
        picks[side] = picks[side].slice(0, want);
    }
}
function slotHtml(f, opts = {}) {
    if (!f) return `<span class="emoji">？</span><span class="slot-text"><b>${esc(opts.empty || 'Pick a fighter')}</b></span>`;
    return `<span class="emoji" aria-hidden="true">${f.e}</span><span class="slot-text">${opts.owner ? `<span class="owner">${esc(opts.owner)}</span>` : ''}<b>${esc(f.name)}</b><small>${elDot(f)}${ELEMENT_NAMES[f.element]} · ${esc(f.specialName.toLowerCase())}</small></span>`;
}
function renderSetup() {
    document.querySelectorAll('#mode-seg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
    for (const side of [0, 1]) {
        const box = $(side ? 'slots-b' : 'slots-a');
        box.innerHTML = '';
        picks[side].forEach((id, i) => {
            const f = BY_ID[id], b = document.createElement('button');
            b.type = 'button'; b.className = 'slot'; b.innerHTML = slotHtml(f) + (mode === 'team' && picks[side].length > 1 ? `<span class="x" role="button" aria-label="Remove ${esc(f.name)}" data-remove="1"><svg class="ui-ic" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></span>` : '');
            b.setAttribute('aria-label', `Team ${side ? 'B' : 'A'} fighter ${i + 1}: ${f.name}. Change`);
            b.addEventListener('click', e => { if (e.target.dataset.remove) { picks[side].splice(i, 1); changed(); return; } openPicker(`Team ${side ? 'B' : 'A'} · fighter ${i + 1}`, id, chosen => { picks[side][i] = chosen; changed(); }); });
            box.appendChild(b);
        });
        if (mode === 'team' && picks[side].length < 4) {
            const add = document.createElement('button'); add.type = 'button'; add.className = 'add-slot'; add.textContent = '+ Add fighter';
            add.addEventListener('click', () => openPicker(`Team ${side ? 'B' : 'A'} · fighter ${picks[side].length + 1}`, null, chosen => { picks[side].push(chosen); changed(); }));
            box.appendChild(add);
        }
    }
}
function changed() { lockedShared = null; lastData = null; seed = freshSeed(); setHash(null); renderSetup(); if (phase === 'preview') previewSim(); }
document.querySelectorAll('#mode-seg button').forEach(b => b.addEventListener('click', () => { mode = b.dataset.mode; if (mode === 'team') for (const s of [0, 1]) while (picks[s].length < 3) picks[s].push(randomId(Math.random, picks.flat())); normalizePicks(); changed(); }));
document.querySelectorAll('[data-random]').forEach(b => b.addEventListener('click', () => { const side = Number(b.dataset.random); picks[side] = picks[side].map(() => randomId(Math.random, picks.flat())); changed(); }));
$('surprise').addEventListener('click', () => {
    if (phase !== 'preview') return;
    if (where === 'online' && online.room) { if (online.phase === 'pick') randomizeMine(); return; }
    if (mode === '1v1') { presetIndex = (presetIndex + 1 + Math.floor(Math.random() * 3)) % PRESETS.length; picks = PRESETS[presetIndex].map(s => [...s]); }
    else picks = picks.map(s => s.map(() => randomId(Math.random, picks.flat())));
    changed();
});

/* ---------- Picker sheet ---------- */
let pickerDone = null, pickerCat = 'all', pickerCurrent = null;
$('chips').innerHTML = [{ id: 'all', label: 'All' }, ...CATS].map(c => `<button type="button" class="chip" data-cat="${c.id}" aria-pressed="${c.id === 'all'}">${esc(c.label)}</button>`).join('');
$('chips').addEventListener('click', e => { const c = e.target.closest('[data-cat]'); if (!c) return; pickerCat = c.dataset.cat; document.querySelectorAll('.chip').forEach(x => x.setAttribute('aria-pressed', String(x === c))); renderPicker(); });
$('search').addEventListener('input', renderPicker);
function renderPicker() {
    const q = $('search').value.trim().toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
    const norm = (s) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
    const list = ROSTER.filter(f => (pickerCat === 'all' || f.cat === pickerCat) && (!q || norm(`${f.name} ${f.tag} ${f.element} ${f.specialName} ${f.cat} ${f.id}`).includes(q)));
    $('picker-grid').innerHTML = list.length ? list.map(f => `<button type="button" class="card" data-id="${f.id}" aria-current="${f.id === pickerCurrent}"><span class="emoji" aria-hidden="true">${f.e}</span><b>${esc(f.name)}</b><span class="tag">${esc(f.tag)}</span><span class="meta">${elDot(f)}${ELEMENT_NAMES[f.element]} · ${esc(f.specialName)}</span><span class="weak">${esc(weakText(f))}</span></button>`).join('') : `<p class="picker-empty">No fighter matches “${esc($('search').value)}”. Try another word or Random.</p>`;
}
$('picker-grid').addEventListener('click', e => { const c = e.target.closest('[data-id]'); if (c) finishPick(c.dataset.id); });
$('pick-random').addEventListener('click', () => { const pool = ROSTER.filter(f => pickerCat === 'all' || f.cat === pickerCat); finishPick(pool[Math.floor(Math.random() * pool.length)].id); });
function openPicker(title, current, done) { pickerDone = done; pickerCurrent = current; set('picker-title', title); renderPicker(); $('picker').showModal(); $('picker-grid').scrollTop = 0; if (matchMedia('(pointer:fine)').matches) $('search').focus(); }
function finishPick(id) { const done = pickerDone; pickerDone = null; $('picker').close(); audio.click(); if (done && BY_ID[id]) done(id); }

/* ---------- Battle ---------- */
function begin(fa, fb, s, opts = {}) {
    if (!recorder.active) { show('save-clip', false); show('clip'); }
    audio.reset();
    seed = s >>> 0;
    onlineFight = opts.online || null;
    lastData = { a: fa, b: fb, seed };
    sim = newSim(fa, fb, seed);
    renderer.setFighters(sim);
    phase = 'countdown'; paused = false; countdownTime = 0; countText = ''; accum = 0; slowRemaining = 0; freeze = 0; slowCooldown = 0;
    caption = ''; captionUntil = 0; captionPriority = 0; resultRealTime = 0;
    body.classList.add('playing'); body.classList.remove('result-mode');
    body.classList.toggle('online-result', !!onlineFight); body.classList.toggle('local-result', !onlineFight);
    document.activeElement?.blur?.();
    for (const id of ['result', 'result-actions', 'result-board', 'commentary', 'slow-label']) show(id, false);
    show('fight-toolbar'); show('countdown');
    set('pause', 'Pause'); set('arena-state', onlineFight ? 'ONLINE · GET READY' : 'GET READY'); set('verify', '');
    updateNames(); updateHud();
    if (!onlineFight) setHash(shareCode());
}
function announce(text, seconds = 2.2, priority = 1) { if (sim.time < captionUntil && priority < captionPriority) return; caption = text; captionUntil = sim.time + seconds; captionPriority = priority; set('commentary-text', text); show('commentary'); }
function finish() {
    phase = 'result';
    body.classList.remove('playing'); body.classList.add('result-mode');
    show('result'); show('result-actions'); show('countdown', false); show('commentary', false); show('fight-toolbar', false);
    set('arena-state', 'FINAL');
    set('result-kicker', sim.winner === -1 ? 'DRAW' : sim.byDecision ? 'WINNER · DECISION' : 'WINNER');
    set('winner-name', sim.winner === -1 ? 'A DRAW.' : sim.teams[sim.winner].label);
    set('result-line', `${sim.time.toFixed(1)} seconds · ${sim.totalKOs.toLocaleString('en')} knocked out`);
    updateHud(); audio.win(); resultRealTime = 0;
    if (onlineFight) onlineFinished(sim);
}
function shareCode() { const d = lastData || { a: fighters(picks[0]), b: fighters(picks[1]), seed }; return schema.packFight({ roster: ROSTER_VERSION, a: d.a, b: d.b, seed: d.seed }); }
function shareValue() { const code = shareCode(); return hosted() ? `${baseUrl()}#fight=${code}` : code; }
async function share() {
    const text = shareValue();
    if (hosted() && await copyText(text)) { toast('Fight link copied.'); return; }
    set('share-explanation', hosted() ? 'Copy this link to replay the same fighters and seed.' : 'This is a local file. Share this fight code with someone who has the game.');
    $('share-value').value = text; $('share-dialog').showModal();
}
function loadShared(value) {
    const code = value.includes('#fight=') ? value.split('#fight=')[1] : value.trim().replace(/^#?fight=/, '');
    const d = schema.unpackFight(code, id => BY_ID[id], ROSTER_VERSION);
    if (online.room) leaveRoom();
    setWhere('local');
    mode = d.a.length === 1 && d.b.length === 1 ? '1v1' : d.a.length === 2 && d.b.length === 2 ? '2v2' : 'team';
    picks = [d.a.map(f => f.id), d.b.map(f => f.id)];
    seed = d.seed; lockedShared = d; lastData = d;
    phase = 'preview'; toPreview(false);
    toast('Shared fight loaded. Press Fight to watch it.');
}
function toPreview(fresh = true) {
    if (recorder.active) { recorder.stop(true); toast('Recording stopped.'); }
    if (fresh) { lockedShared = null; lastData = null; seed = freshSeed(); setHash(null); }
    onlineFight = null; phase = 'preview';
    body.classList.remove('playing', 'result-mode', 'clip-mode');
    for (const id of ['result', 'result-actions', 'result-board', 'fight-toolbar', 'countdown', 'commentary', 'error', 'recording']) show(id, false);
    set('arena-state', where === 'online' ? 'ONLINE' : 'READY'); paused = false; set('pause', 'Pause');
    renderSetup(); previewSim(); if (where === 'online') renderRoom();
}
function startLocal() {
    if (phase !== 'preview' || where !== 'local') return;
    if (renderer.contextLost) { toast('The graphics were interrupted. Reload the page to restore the arena.'); return; }
    audio.unlock();
    const d = lockedShared; lockedShared = null;
    begin(d ? d.a : fighters(picks[0]), d ? d.b : fighters(picks[1]), d ? d.seed : freshSeed());
}
$('fight').addEventListener('click', startLocal);
$('rematch').addEventListener('click', () => { if (lastData) { audio.unlock(); begin(lastData.a, lastData.b, freshSeed()); } });
$('replay').addEventListener('click', () => { if (lastData) { audio.unlock(); begin(lastData.a, lastData.b, lastData.seed, { online: onlineFight ? { ...onlineFight, replay: true } : null }); } });
$('new-fight').addEventListener('click', () => toPreview());
$('exit').addEventListener('click', () => toPreview(!onlineFight));
$('home').addEventListener('click', e => { e.preventDefault(); if (phase !== 'preview') toPreview(!onlineFight); });
function setPaused(value) { if (phase !== 'fight' && phase !== 'countdown') return; paused = value; set('pause', paused ? 'Resume' : 'Pause'); set('arena-state', paused ? 'PAUSED' : phase === 'countdown' ? 'GET READY' : 'LIVE'); recorder.pause(paused); }
$('pause').addEventListener('click', () => setPaused(!paused));
document.addEventListener('keydown', e => { if (e.target.matches('input,textarea,button') || document.querySelector('dialog[open]')) return; if (e.code === 'Space' && (phase === 'fight' || phase === 'countdown')) { e.preventDefault(); setPaused(!paused); } if (e.code === 'Enter' && phase === 'preview' && where === 'local') startLocal(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && (phase === 'fight' || phase === 'countdown') && !onlineFight) setPaused(true); lastTime = performance.now(); });
$('sound').addEventListener('click', () => { const muted = audio.toggle(); $('sound').setAttribute('aria-pressed', String(!muted)); $('sound').setAttribute('aria-label', muted ? 'Turn sound on' : 'Mute sound'); safeWrite('arena.sound', String(!muted)); toast(muted ? 'Sound off' : 'Sound on'); });
audio.muted = safeRead('arena.sound') === 'false';
$('sound').setAttribute('aria-pressed', String(!audio.muted));
$('settings').addEventListener('click', () => $('info-dialog').showModal());
$('how').addEventListener('click', () => $('about-content').classList.toggle('hidden'));
const motionToggle = $('motion-effects');
motionToggle.checked = !renderer.reducedMotion && safeRead('arena.motion') !== 'false';
renderer.reducedMotion = !motionToggle.checked;
motionToggle.addEventListener('change', () => { renderer.reducedMotion = !motionToggle.checked; safeWrite('arena.motion', String(motionToggle.checked)); });
document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => b.closest('dialog')?.close()));
document.querySelectorAll('dialog').forEach(d => d.addEventListener('click', e => { if (e.target !== d) return; const r = d.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) d.close(); }));
for (const id of ['copy', 'link-live']) $(id).addEventListener('click', () => void share());
$('load-code').addEventListener('click', () => { $('info-dialog').close(); set('share-explanation', 'Paste a fight code or link below.'); $('share-value').value = shareValue(); $('share-dialog').showModal(); });
$('share-copy').addEventListener('click', async () => { const t = $('share-value'); if (await copyText(t.value)) toast('Copied.'); else { t.focus(); t.select(); toast('Select the text and copy it with your keyboard.'); } });
$('import-fight').addEventListener('click', () => { try { loadShared($('import-code').value); $('share-dialog').close(); } catch (e) { toast(e instanceof Error ? e.message : 'Invalid fight code.'); } });

/* ---------- Clip recording (local replay of the same seed) ---------- */
recorder.onReady = (url, ext) => { const link = $('save-clip'); link.href = url; link.download = `anything-arena-${seed.toString(36)}.${ext}`; show('save-clip'); show('clip', false); show('recording', false); body.classList.remove('clip-mode'); toast('Your vertical clip is ready.'); };
recorder.onError = message => { show('recording', false); body.classList.remove('clip-mode'); toast(message); };
if (!recorder.supported()) $('clip').title = 'Recording is unavailable in this browser';
$('clip').addEventListener('click', () => {
    if (!lastData) return;
    audio.unlock();
    try { body.classList.add('clip-mode'); recorder.start(audio); show('recording'); show('save-clip', false); begin(lastData.a, lastData.b, lastData.seed, { online: onlineFight ? { ...onlineFight, replay: true } : null }); toast('Recording the same fight in 9:16.'); }
    catch (e) { body.classList.remove('clip-mode'); toast(e instanceof Error ? e.message : 'Recording could not start.'); }
});

/* ---------- Frame loop ---------- */
function frame(now) {
    const dt = Math.min(.5, Math.max(.001, (now - (lastTime || now - 16.67)) / 1000));
    lastTime = now;
    if (renderer.contextLost) { setPaused(true); set('error', 'The graphics were interrupted. Reload the page to restore the arena.'); show('error'); requestAnimationFrame(frame); return; }
    if (!document.hidden && sim) {
        if (phase === 'countdown' && !paused) {
            countdownTime += dt;
            const text = countdownTime < .62 ? '3' : countdownTime < 1.24 ? '2' : countdownTime < 1.86 ? '1' : 'FIGHT';
            if (text !== countText) { countText = text; set('countdown', text); $('countdown').classList.toggle('go', text === 'FIGHT'); audio.beep(text === 'FIGHT'); }
            if (countdownTime >= 2.28) { phase = 'fight'; show('countdown', false); set('arena-state', onlineFight ? 'ONLINE · LIVE' : 'LIVE'); }
        }
        if (phase === 'fight' && !paused) {
            slowCooldown = Math.max(0, slowCooldown - dt); slowRemaining = Math.max(0, slowRemaining - dt); freeze = Math.max(0, freeze - dt);
            accum += dt * (freeze > 0 ? 0 : slowRemaining > 0 ? .3 : 1);
            let steps = 0;
            while (accum >= simMod.STEP && steps++ < 32) {
                sim.step(); accum -= simMod.STEP;
                renderer.effects(sim.events, sim); audio.hits(sim.events);
                let kos = 0, special = null, counter = null;
                for (const e of sim.events) { if (e.kind === 'ko') kos++; else if (e.kind === 'special' && !special) special = e; else if (e.kind === 'counter' && !counter) counter = e; }
                if (counter) announce(counter.label, 2.0, 3);
                else if (special) { const g = special.group != null ? sim.groups[special.group] : null; announce(`${g ? g.f.e + ' ' : ''}${special.label}`, 1.4, 2); }
                else if (kos >= 4) announce(`${kos} KNOCKOUTS`, 1.2, 1);
                if (!renderer.reducedMotion && slowCooldown <= 0 && (kos >= 3 || (special && special.big))) { slowRemaining = .21; freeze = .045; slowCooldown = 3.6; }
                if (sim.finished) { finish(); accum = 0; break; }
            }
            if (sim.time > captionUntil) show('commentary', false);
            show('slow-label', slowRemaining > 0);
        }
        if (phase === 'result') { resultRealTime += dt; accum += dt; while (accum >= simMod.STEP) { sim.step(); accum -= simMod.STEP; } }
        audio.update(sim, phase === 'fight', paused);
        renderer.render(sim, paused ? 0 : dt, phase === 'preview' ? 'preview' : phase === 'result' ? 'result' : 'fight', paused);
        if (recorder.active) {
            recorder.paint($('scene'), { sim, phase, countdown: countText, caption: sim.time <= captionUntil ? caption : '', seed });
            set('record-time', `${Math.floor((now - recorder.started) / 1000)}s`);
            if (phase === 'result' && resultRealTime > 1.7) recorder.stop();
        }
        if (uiCounter++ % 6 === 0) updateHud();
        if (online.room && online.phase === 'pick' && uiCounter % 10 === 0) tickPick();
    }
    requestAnimationFrame(frame);
}

/* ======================================================================
 * Online: rooms through the shared relay (Ludvig.mp). The relay only forwards
 * messages. The host decides phases and the seed; every client simulates.
 * ==================================================================== */
const online = { room: null, phase: 'lobby', size: 1, round: 0, pickEnds: 0, start: null, players: new Map(), me: { team: 'S', picks: [], locked: false, bet: null }, done: new Map(), hostTimer: 0, finishedRound: -1, joining: false };
const ludvig = () => (!window.__ludvigMissing && window.Ludvig && window.Ludvig.mp && typeof window.Ludvig.mp.join === 'function') ? window.Ludvig : null;
function onlineAvailable() { return !!ludvig() && hosted() && navigator.onLine !== false; }
function refreshOnlineAvailability() {
    const ok = onlineAvailable();
    show('where-seg', ok);
    if (!ok && where === 'online' && !online.room) setWhere('local');
}
window.addEventListener('online', refreshOnlineAvailability);
window.addEventListener('offline', refreshOnlineAvailability);
document.querySelectorAll('[data-where]').forEach(b => b.addEventListener('click', () => setWhere(b.dataset.where)));
function setWhere(w) {
    if (w === 'online' && !onlineAvailable()) { toast('Online play is not available right now. Local battles still work.'); w = 'local'; }
    if (w === 'local' && online.room) leaveRoom();
    where = w;
    document.querySelectorAll('[data-where]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.where === where)));
    show('setup', where === 'local'); show('online', where === 'online');
    if (where === 'online') { $('my-name').value = ludvig()?.player?.name || ''; loadBoard(); renderRoom(); }
    if (phase === 'preview') { set('arena-state', where === 'online' ? 'ONLINE' : 'READY'); if (where === 'local') previewSim(); }
}
$('my-name').addEventListener('change', () => { try { ludvig()?.setName?.($('my-name').value.trim()); } catch { } });
async function loadBoard() {
    if (window.Ludvig && window.Ludvig.ui) { ludvigBoard($('board'), BOARD); return; }
    const L = ludvig(); if (!L?.top) return;
    try {
        const r = await L.top(BOARD, 'all'), wins = Number(safeRead('arena.onlineWins') || 0);
        const rows = (r?.entries || []).slice(0, 5).map(e => `<li>${esc(e.name)} · ${Number(e.score).toLocaleString('en')} wins</li>`).join('');
        $('board').innerHTML = `<h4>MOST ONLINE WINS</h4>${rows ? `<ol>${rows}</ol>` : '<p>No wins yet.</p>'}<p>Your online wins: ${wins}${r?.you ? ` · rank ${r.you.rank}` : ''}</p>`;
    } catch { $('board').innerHTML = ''; }
}
function cleanCode(v) { return String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4); }
async function connect(kind, code) {
    const L = ludvig(); if (!L || online.joining) return;
    online.joining = true;
    for (const id of ['quick', 'create', 'join']) $(id).disabled = true;
    try {
        const name = $('my-name').value.trim(); if (name && name !== L.player?.name) { try { L.setName(name); } catch { } }
        const room = kind === 'quick' ? await L.mp.join({ game: GAME, quick: true, max: MAX_ROOM }) : kind === 'create' ? await L.mp.create({ game: GAME, max: MAX_ROOM, visible: false }) : await L.mp.join({ game: GAME, room: code });
        attachRoom(room);
    } catch (e) { const why = e?.code || e?.message; toast(kind !== 'code' ? 'Could not connect. Try again in a moment.' : why === 'not-found' ? `No room called ${code}. Check the code.` : why === 'full' ? `Room ${code} is full.` : 'Could not join that room. Try again.'); }
    finally { online.joining = false; for (const id of ['quick', 'create', 'join']) $(id).disabled = false; }
}
$('quick').addEventListener('click', () => connect('quick'));
$('create').addEventListener('click', () => connect('create'));
$('join').addEventListener('click', () => { const c = cleanCode($('join-code').value); if (c.length !== 4) { toast('Room codes have 4 characters.'); return; } connect('code', c); });
$('join-code').addEventListener('keydown', e => { if (e.key === 'Enter') $('join').click(); });
$('leave').addEventListener('click', () => { leaveRoom(); renderRoom(); });
$('invite').addEventListener('click', async () => { if (!online.room) return; const link = `${baseUrl()}?arena=${online.room.code}`; if (await copyText(link)) toast('Invite link copied.'); else { set('share-explanation', 'Send this link to a friend.'); $('share-value').value = link; $('share-dialog').showModal(); } });

const selfId = () => online.room?.self?.id;
const isHost = () => !!online.room && online.room.host === selfId();
const peerList = () => (online.room?.peers || []).slice().sort((p, q) => (p.joinedAt || 0) - (q.joinedAt || 0) || String(p.id).localeCompare(String(q.id)));
const peerName = (id) => (online.room?.peers || []).find(p => p.id === id)?.name || 'Player';
const infoOf = (id) => id === selfId() ? online.me : (online.players.get(id) || { team: 'S', picks: [], locked: false, bet: null });
function teamPlayers(team) { return peerList().filter(p => infoOf(p.id).team === team).map(p => p.id); }
/** Slot owners for one side: players share the side's slots round-robin; extra players sit out. */
function slotOwners(team) { const P = teamPlayers(team), S = online.size, owners = []; for (let s = 0; s < S; s++) owners.push(P.length ? P[s % P.length] : null); return owners; }
function mySlots() { const out = []; for (const team of ['A', 'B']) slotOwners(team).forEach((o, s) => { if (o === selfId()) out.push({ team, s }); }); return out; }
function slotPick(team, s) { const owners = slotOwners(team), o = owners[s]; if (!o) return null; const k = owners.slice(0, s).filter(x => x === o).length; return infoOf(o).picks[k] || null; }

function attachRoom(room) {
    online.room = room; online.players.clear(); online.done.clear();
    online.phase = 'lobby'; online.size = 1; online.round = 0; online.start = null; online.finishedRound = -1;
    online.me = { team: 'S', picks: [], locked: false, bet: null };
    room.on('message', (from, data) => onMessage(typeof from === 'object' && from ? from.id : from, data));
    room.on('join', peer => { const id = peer?.id ?? peer; sendTo(id, { t: 'me', ...online.me }); if (isHost()) sendTo(id, hostState()); renderRoom(); });
    room.on('leave', peer => { online.players.delete(peer?.id ?? peer); if (isHost()) checkAllLocked(); renderRoom(); });
    room.on('host', () => {
        if (isHost()) {
            if (online.phase === 'pick') { online.pickEnds = Math.max(online.pickEnds, Date.now() + 3000); armHostTimer(); }
            // The old host left after this battle ended here: move the room on to the result.
            if (online.phase === 'battle' && online.finishedRound === online.round) { online.phase = 'result'; broadcastState(); }
            publishMeta();
        }
        $('again').disabled = !isHost(); $('again').title = isHost() ? '' : 'The host starts the next round';
        renderRoom();
    });
    room.on('close', reason => { if (online.room === room) { online.room = null; toast(reason === 'replaced' ? 'This room is open in another tab.' : 'Lost the connection to the room.'); renderRoom(); } });
    setWhere('online');
    set('room-code', room.code || '----');
    send({ t: 'me', ...online.me });
    // Wait briefly for everyone's team choices, then take a free spot.
    setTimeout(() => { if (online.room !== room) return; if (online.phase === 'lobby' || online.phase === 'result') autoTeam(); renderRoom(); }, 900);
    if (isHost()) publishMeta();
    renderRoom();
}
function leaveRoom() { const r = online.room; online.room = null; clearTimeout(online.hostTimer); try { r?.leave(); } catch { } if (onlineFight && phase !== 'preview') toPreview(); }
function send(data) { try { online.room?.send(data); } catch { } }
function sendTo(id, data) { try { if (id != null) online.room?.sendTo(id, data); } catch { } }
function hostState() { return { t: 'state', phase: online.phase, size: online.size, round: online.round, left: online.phase === 'pick' ? Math.max(0, Math.round((online.pickEnds - Date.now()) / 1000)) : 0, start: online.start }; }
function broadcastState() { send(hostState()); publishMeta(); }
function publishMeta() { if (!isHost()) return; try { online.room.setMeta({ phase: online.phase, size: online.size, players: peerList().length }); } catch { } }
function autoTeam() { if (online.me.team !== 'S') return; const a = teamPlayers('A').length, b = teamPlayers('B').length; const t = a <= b ? (a < online.size ? 'A' : b < online.size ? 'B' : 'S') : (b < online.size ? 'B' : a < online.size ? 'A' : 'S'); if (t !== 'S') setMyTeam(t, true); }
function setMyTeam(team, quiet = false) {
    if (online.phase === 'pick' && online.me.locked) { toast('You already locked in.'); return; }
    if (online.phase === 'battle') { toast('Wait for this battle to finish.'); return; }
    if (team !== 'S' && online.me.team !== team && teamPlayers(team).length >= online.size) { if (!quiet) toast(`Team ${team} is full. Watch, or ask the host for a bigger battle.`); return; }
    online.me.team = team; online.me.locked = false; online.me.bet = null;
    online.me.picks = online.me.picks.length ? online.me.picks : [];
    fillMyPicks(); shareMe(); renderRoom();
}
function fillMyPicks() { const n = mySlots().length; while (online.me.picks.length < n) online.me.picks.push(randomId()); online.me.picks = online.me.picks.slice(0, Math.max(n, 0)); }
function shareMe() { send({ t: 'me', ...online.me }); if (isHost()) checkAllLocked(); }
document.querySelectorAll('[data-join]').forEach(b => b.addEventListener('click', () => setMyTeam(b.dataset.join)));
document.querySelectorAll('#size-seg button').forEach(b => b.addEventListener('click', () => { if (!isHost() || online.phase === 'pick' || online.phase === 'battle') return; online.size = Number(b.dataset.size); broadcastState(); fillMyPicks(); renderRoom(); }));
$('start-pick').addEventListener('click', () => startPicking());
$('lock').addEventListener('click', () => { if (online.phase !== 'pick' || !mySlots().length) return; fillMyPicks(); online.me.locked = true; shareMe(); renderRoom(); });
document.querySelectorAll('[data-bet]').forEach(b => b.addEventListener('click', () => { if (online.phase === 'battle' || mySlots().length) return; online.me.bet = b.dataset.bet; shareMe(); renderRoom(); }));
$('again').addEventListener('click', () => { if (isHost()) { toPreview(false); startPicking(); } });
$('to-room').addEventListener('click', () => { if (isHost() && online.phase !== 'pick') { online.phase = 'lobby'; online.start = null; broadcastState(); } toPreview(false); });
function randomizeMine() { if (online.me.locked) return; online.me.picks = online.me.picks.map(() => randomId()); shareMe(); renderRoom(); }

function startPicking() {
    if (!isHost()) return;
    if (!teamPlayers('A').length && !teamPlayers('B').length) { toast('Join Team A or B first.'); return; }
    online.round++; online.phase = 'pick'; online.start = null; online.pickEnds = Date.now() + PICK_SECONDS * 1000;
    resetForRound(); broadcastState(); shareMe(); armHostTimer(); renderRoom();
}
function resetForRound() { online.me.locked = false; online.done.clear(); fillMyPicks(); }
function armHostTimer() { clearTimeout(online.hostTimer); if (!isHost() || online.phase !== 'pick') return; online.hostTimer = setTimeout(() => { if (isHost() && online.phase === 'pick') hostStartBattle(); }, Math.max(0, online.pickEnds - Date.now()) + 600); }
function checkAllLocked() {
    if (!isHost() || online.phase !== 'pick') return;
    const owners = [...new Set([...slotOwners('A'), ...slotOwners('B')].filter(Boolean))];
    if (owners.length && owners.every(id => infoOf(id).locked)) { clearTimeout(online.hostTimer); online.hostTimer = setTimeout(() => { if (isHost() && online.phase === 'pick') hostStartBattle(); }, 900); }
}
function hostStartBattle() {
    const s = freshSeed(), rng = schema.random(s ^ 0x9e3779b9), taken = [];
    const side = (team) => slotOwners(team).map((o, i) => { let id = slotPick(team, i); if (!id || !BY_ID[id]) id = randomId(rng, taken); taken.push(id); return id; });
    const playersOf = (team) => [...new Set(slotOwners(team).filter(Boolean))];
    online.start = { seed: s, a: side('A'), b: side('B'), pa: playersOf('A'), pb: playersOf('B'), roster: ROSTER_VERSION };
    online.phase = 'battle';
    broadcastState();
    playStart(online.start, online.round);
}
function validStart(st) { return st && Number.isInteger(st.seed) && st.seed >= 0 && st.seed <= 0xffffffff && st.roster === ROSTER_VERSION && [st.a, st.b].every(x => Array.isArray(x) && x.length >= 1 && x.length <= 4 && x.every(id => BY_ID[id])) && [st.pa, st.pb].every(x => Array.isArray(x) && x.length <= 16); }
function playStart(st, round) {
    if (!validStart(st)) { if (st && st.roster !== ROSTER_VERSION) toast('Another player has a different game version. Reload the page.'); return; }
    if (online.finishedRound === round || (onlineFight && onlineFight.round === round && phase !== 'preview')) return;
    if ($('picker').open) $('picker').close();
    audio.unlock();
    begin(fighters(st.a), fighters(st.b), st.seed, { online: { round, start: st } });
}
function tickPick() {
    const left = Math.max(0, Math.ceil((online.pickEnds - Date.now()) / 1000));
    $('pick-bar').style.transform = `scaleX(${Math.max(0, Math.min(1, (online.pickEnds - Date.now()) / (PICK_SECONDS * 1000)))})`;
    set('pick-left', `${left}s`);
}
function onMessage(from, d) {
    if (!d || typeof d !== 'object' || from == null) return;
    if (d.t === 'me') {
        const team = ['A', 'B', 'S'].includes(d.team) ? d.team : 'S';
        const picksIn = Array.isArray(d.picks) ? d.picks.filter(id => typeof id === 'string' && BY_ID[id]).slice(0, 4) : [];
        online.players.set(from, { team, picks: picksIn, locked: !!d.locked, bet: d.bet === 'A' || d.bet === 'B' ? d.bet : null });
        if (isHost()) checkAllLocked();
        renderRoom();
    }
    else if (d.t === 'state' && from === online.room?.host) {
        const size = [1, 2, 3, 4].includes(d.size) ? d.size : 1, round = Number.isInteger(d.round) ? d.round : 0;
        const newRound = round !== online.round;
        online.size = size; online.round = round;
        const ph = ['lobby', 'pick', 'battle', 'result'].includes(d.phase) ? d.phase : 'lobby';
        if (ph === 'pick' && (newRound || online.phase !== 'pick')) {
            online.pickEnds = Date.now() + Math.max(0, Math.min(PICK_SECONDS, Number(d.left) || 0)) * 1000; resetForRound(); shareMe();
            // The host started the next round: leave the result screen so everyone sees the pick timer.
            if (onlineFight && phase === 'result') { toPreview(false); toast('New round. Pick your fighter.'); }
        }
        online.phase = ph;
        fillMyPicks();
        if (ph === 'battle' && d.start) { online.start = d.start; playStart(d.start, round); }
        renderRoom();
    }
    else if (d.t === 'done' && Number.isInteger(d.round) && typeof d.fp === 'number') { online.done.set(from, { round: d.round, fp: d.fp }); renderVerify(); }
}
function onlineFinished(s) {
    if (!onlineFight || onlineFight.replay) return;
    const round = onlineFight.round, st = onlineFight.start;
    if (online.finishedRound === round) return;
    online.finishedRound = round;
    const fp = schema.hash(s.fingerprint());
    online.done.set(selfId(), { round, fp });
    send({ t: 'done', round, fp });
    const me = selfId(), mine = st.pa.includes(me) ? 0 : st.pb.includes(me) ? 1 : -1;
    if (mine >= 0 && s.winner === mine) {
        const wins = Number(safeRead('arena.onlineWins') || 0) + 1;
        safeWrite('arena.onlineWins', String(wins));
        try { Promise.resolve(ludvig()?.score?.(BOARD, wins)).then(() => { if (phase === 'result' && onlineFight) ludvigBoard($('result-board'), BOARD); }).catch(() => { }); } catch { }
        set('result-kicker', 'YOU WIN · ' + $('result-kicker').textContent);
    }
    else if (mine >= 0 && s.winner === 1 - mine) set('result-kicker', 'YOU LOSE · ' + $('result-kicker').textContent);
    else if (mine < 0 && online.me.bet) {
        const right = (online.me.bet === 'A' ? 0 : 1) === s.winner, pts = Number(safeRead('arena.funPoints') || 0) + (right ? 10 : 0);
        safeWrite('arena.funPoints', String(pts));
        set('result-kicker', (right ? 'GOOD CALL · +10 POINTS' : 'WRONG CALL') + ' · ' + $('result-kicker').textContent);
    }
    if (window.Ludvig && window.Ludvig.ui) { show('result-board'); ludvigBoard($('result-board'), BOARD); }
    if (online.me.bet) { online.me.bet = null; shareMe(); }
    if (isHost()) { online.phase = 'result'; broadcastState(); }
    $('again').disabled = !isHost(); $('again').title = isHost() ? '' : 'The host starts the next round';
    renderVerify();
}
function renderVerify() {
    if (!onlineFight || phase !== 'result') return;
    const mine = online.done.get(selfId()); if (!mine) return;
    const same = [...online.done.values()].filter(x => x.round === mine.round);
    const bad = same.some(x => x.fp !== mine.fp);
    set('verify', bad ? 'RESULTS DIFFER ON ANOTHER DEVICE' : '');
}
function renderRoom() {
    const inRoom = !!online.room;
    show('online-connect', !inRoom); show('online-room', inRoom);
    if (!inRoom) { if (where === 'online') loadBoard(); return; }
    const host = isHost(), ph = online.phase, slots = mySlots();
    show('host-row', host && (ph === 'lobby' || ph === 'result'));
    document.querySelectorAll('#size-seg button').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.size) === online.size)));
    show('pick-timer', ph === 'pick');
    show('lock-row', ph === 'pick' && slots.length > 0);
    $('lock').disabled = online.me.locked; set('lock', online.me.locked ? 'Locked in' : 'Lock in');
    const n = peerList().length;
    set('room-status', ph === 'pick' ? (slots.length ? (online.me.locked ? 'Locked in. Waiting for the others…' : 'Tap your fighter to change it, then lock in.') : 'Players are picking. Make your prediction!')
        : ph === 'battle' ? '' : host ? `You are the host. ${n} in the room. Choose a size, then start picking.` : `${n} in the room. Waiting for the host (${peerName(online.room.host)}) to start.`);
    for (const team of ['A', 'B']) {
        const box = $(team === 'A' ? 'room-a' : 'room-b'); box.innerHTML = '';
        slotOwners(team).forEach((owner, s) => {
            const mine = owner === selfId(), f = BY_ID[slotPick(team, s)], b = document.createElement('button');
            b.type = 'button'; b.className = 'slot' + (mine ? ' mine' : '') + (owner && infoOf(owner).locked && ph === 'pick' ? ' locked' : '') + (owner ? '' : ' empty');
            const who = owner ? (mine ? 'You' : peerName(owner)) : 'Open spot';
            b.innerHTML = owner ? slotHtml(ph === 'lobby' && !mine ? null : f, { owner: who, empty: 'Choosing…' }) : `<span class="slot-text"><b>Open spot</b><small>Random fighter if nobody joins</small></span>`;
            const active = mine && ph === 'pick' && !online.me.locked;
            if (!active) { b.tabIndex = -1; b.setAttribute('aria-disabled', 'true'); b.classList.add('static'); }
            if (active) { const k = slots.filter(x => x.team === team && x.s < s).length; b.addEventListener('click', () => openPicker('Your fighter', online.me.picks[k], id => { online.me.picks[k] = id; shareMe(); renderRoom(); })); }
            box.appendChild(b);
        });
    }
    const watchers = peerList().filter(p => { const t = infoOf(p.id).team; return t === 'S' || !slotOwners(t).includes(p.id); });
    $('room-s').innerHTML = watchers.length ? watchers.map(p => `<span class="person${p.id === selfId() ? ' me' : ''}">${esc(p.id === selfId() ? 'You' : p.name || 'Player')}${infoOf(p.id).bet ? ` · bets ${infoOf(p.id).bet}` : ''}</span>`).join('') : '<span class="person">Nobody</span>';
    const canBet = !slots.length && (ph === 'pick' || ph === 'lobby');
    show('bet', canBet);
    document.querySelectorAll('[data-bet]').forEach(b => b.setAttribute('aria-pressed', String(online.me.bet === b.dataset.bet)));
    set('points', `Fun points: ${Number(safeRead('arena.funPoints') || 0)}`);
    document.querySelectorAll('[data-join]').forEach(b => { b.disabled = ph === 'battle' || (ph === 'pick' && online.me.locked) || online.me.team === b.dataset.join; });
    if (ph === 'pick') tickPick();
}

/* ---------- Boot ---------- */
normalizePicks(); renderSetup(); previewSim();
refreshOnlineAvailability();
const sharedHash = readHash();
if (sharedHash) { try { loadShared(sharedHash); } catch (e) { toast(e instanceof Error ? e.message : 'Could not load the shared fight.'); } }
else {
    const invite = cleanCode(readParam('arena'));
    if (invite.length === 4) {
        // ludvig.js may still be starting; give it a moment before deciding online is unavailable.
        let tries = 0; const tryJoin = () => { if (onlineAvailable()) { setWhere('online'); $('join-code').value = invite; connect('code', invite); } else if (++tries < 10) setTimeout(tryJoin, 300); else toast('Online play is unavailable here. Local battles still work.'); };
        tryJoin();
    }
}
setTimeout(refreshOnlineAvailability, 1500);
requestAnimationFrame(frame);
// Read-only diagnostics for automated QA.
window.__ARENA__ = { snapshot: () => ({ phase, seed, mode, where, picks: picks.map(s => [...s]), time: sim?.time, winner: sim?.winner, fingerprint: sim?.fingerprint(), online: { inRoom: !!online.room, phase: online.phase, round: online.round, size: online.size, host: isHost() } }) };
})();
