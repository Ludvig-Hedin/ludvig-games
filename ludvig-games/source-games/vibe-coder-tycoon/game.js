/* Vibe Coder Tycoon · economy, prompts, events, UI, save and sound. Local only. */
'use strict';
(() => {
  const D = VCT.data;
  const SLUG = 'vibe-coder-tycoon';
  const SAVE_KEY = 'vct-save-v1';
  const OFFLINE_CAP = 8 * 3600;
  const IPO_AT = 1e9;
  const ARPU = 0.0012;
  const NEED_GROWTH = 1.3;
  const $ = id => document.getElementById(id);
  const now = () => Date.now();
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = D.pick;

  /* ---------- formatting ---------- */
  const SUF = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];
  function fmt(n) {
    if (!isFinite(n)) return '∞';
    const neg = n < 0; n = Math.abs(n);
    let s;
    if (n < 1000) s = n < 10 && n % 1 > 0.05 ? n.toFixed(1) : String(Math.floor(n));
    else {
      let i = 0;
      while (n >= 999.5 && i < SUF.length - 1) { n /= 1000; i++; }
      s = (n < 10 ? n.toFixed(2) : n < 100 ? n.toFixed(1) : String(Math.floor(n))) + SUF[i];
    }
    return (neg ? '-' : '') + s;
  }
  const money = n => (n < 0 ? '-$' : '$') + fmt(Math.abs(n));
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  function dur(sec) {
    sec = Math.floor(sec);
    const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60);
    if (h) return `${h} h ${m} min`;
    if (m) return `${m} min`;
    return `${sec} s`;
  }
  const dayKey = (t = new Date()) => `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  function hashColor(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
    return Math.abs(h) % APP_COLORS.length;
  }
  const APP_COLORS = ['#ffb84d', '#5fe0b0', '#ff6b8b', '#a690ff', '#6cc4ff', '#ffd86b', '#ff9ad5', '#9be36b', '#ff8f6b', '#7fe7e0'];
  const initials = name => name.replace(/[^A-Za-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('') || '?';

  /* ---------- state ---------- */
  function fresh() {
    return {
      v: 1, created: now(), cash: 0, life: 0, hype: 0, agents: 1, model: 0, office: 0, gear: {}, yoloOn: false,
      ships: 0, project: null, apps: [], legacyUsers: 0, stock: 0, best: 0, submitted: 0, lastSubmit: 0,
      lastSeen: now(), daily: { claimed: '', streak: 0 }, muted: false, avatar: { c: 0, h: 1 }, intro: false,
      stats: { taps: 0, ships: 0, allows: 0, denies: 0, fixes: 0, events: 0, hi5: 0, pairSec: 0, teamShips: 0, chats: 0,
        ipos: 0, prod: 0, viral: 0, playSec: 0 },
      ach: {},
    };
  }
  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return fresh();
      const data = JSON.parse(raw);
      const base = fresh();
      const merged = Object.assign(base, data);
      merged.stats = Object.assign(fresh().stats, data.stats || {});
      merged.daily = Object.assign(fresh().daily, data.daily || {});
      merged.avatar = Object.assign(fresh().avatar, data.avatar || {});
      merged.gear = data.gear && typeof data.gear === 'object' ? data.gear : {};
      merged.ach = data.ach && typeof data.ach === 'object' ? data.ach : {};
      merged.apps = Array.isArray(data.apps) ? data.apps.filter(a => a && typeof a.n === 'string') : [];
      for (const k of ['cash', 'life', 'hype', 'legacyUsers', 'best', 'submitted']) if (!isFinite(merged[k]) || merged[k] < 0) merged[k] = 0;
      merged.agents = clamp(Math.floor(merged.agents) || 1, 1, 999);
      merged.model = clamp(Math.floor(merged.model) || 0, 0, D.MODELS.length - 1);
      merged.office = clamp(Math.floor(merged.office) || 0, 0, D.OFFICES.length - 1);
      return merged;
    } catch { return fresh(); }
  }
  let S = load();
  let saveBroken = false;
  function save() {
    S.lastSeen = now();
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); saveBroken = false; }
    catch { if (!saveBroken) toast('Could not save', 'Your browser storage is full or blocked.', 'bad'); saveBroken = true; }
  }

  /* ---------- derived numbers ---------- */
  let G = gearEff();
  function gearEff() {
    const e = { speed: 1, tap: 1, bugs: 1, rev: 1, users: 1, hype: 1, risk: 0, autofix: [], safety: 0, yolo: 0, autoship: 0 };
    for (const g of D.GEAR) {
      if (!S.gear[g.id]) continue;
      for (const [k, v] of Object.entries(g.eff)) {
        if (k === 'risk') e.risk += v;
        else if (k === 'autofix') e.autofix.push(v);
        else if (k === 'safety' || k === 'yolo' || k === 'autoship') e[k] = 1;
        else e[k] *= v;
      }
    }
    return e;
  }
  const buffs = [];
  function addBuff(k, m, sec, label, bad) {
    const t = now() + sec * 1000;
    const ex = buffs.find(b => b.label === label && b.until > now());
    if (ex) { ex.until = Math.max(ex.until, t); return; }
    buffs.push({ k, m, until: t, label, bad: !!bad });
    renderBuffs();
  }
  function removeBuff(label) {
    for (let i = buffs.length - 1; i >= 0; i--) if (buffs[i].label === label) buffs.splice(i, 1);
    renderBuffs();
  }
  function buffMult(k) {
    let m = 1; const t = now();
    for (const b of buffs) if (b.k === k && b.until > t) m *= b.m;
    return m;
  }
  const isStalled = () => buffs.some(b => b.k === 'stall' && b.until > now());
  const yoloActive = () => G.yolo && S.yoloOn;
  const promptWaiting = () => queue.some(q => q.kind === 'prompt');
  const officeApi = () => VCT.office || {};

  let activeUsers = 0;
  function sumUsers() {
    let u = S.legacyUsers;
    for (const a of S.apps) if (!a.r) u += a.u;
    activeUsers = u;
    return u;
  }
  function perm() { return (1 + 0.02 * Object.keys(S.ach).length) * (1 + 0.1 * S.stock); }
  function baseRate() {
    const m = D.MODELS[S.model], o = D.OFFICES[S.office];
    return S.agents * m.mult * o.mult * G.speed * perm();
  }
  function calc() {
    const base = baseRate();
    const bugs = S.project ? S.project.bugs : 0;
    const bugPen = Math.max(0.4, 1 - 0.1 * bugs);
    const pairing = officeApi().pairing ? 1.5 : 1;
    const waiting = promptWaiting() ? 0.5 : 1;
    const stalled = isStalled();
    const rate = stalled ? 0 : base * bugPen * buffMult('speed') * pairing * waiting;
    const tap = (2 + base * 0.3) * G.tap * buffMult('tap') * (pairing > 1 ? 1.25 : 1);
    const arpuBase = ARPU * G.rev * perm();
    const income = activeUsers * arpuBase * buffMult('rev');
    return { base, rate, tap, arpuBase, income, bugPen, pairing, waiting, stalled };
  }
  const projectNeed = n => Math.round(50 * Math.pow(NEED_GROWTH, n));
  const agentCost = () => Math.round(25 * Math.pow(1.42, S.agents - 1));
  function valuation() {
    const income = activeUsers * ARPU * G.rev * perm();
    return S.cash + income * 1200 * (1 + S.hype / 100) + activeUsers * 0.2;
  }
  function nameSet() { return new Set(S.apps.slice(-80).map(a => a.n)); }
  function newProject() {
    return { name: D.appName(nameSet()), need: projectNeed(S.ships), prog: 0, bugs: 0, polish: 0, ver: S.ships + 1 };
  }
  if (!S.project || !isFinite(S.project.need)) S.project = newProject();
  sumUsers();

  /* ---------- sound ---------- */
  let actx = null, noiseBuf = null;
  function ac() {
    if (S.muted) return null;
    try {
      if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
      return actx;
    } catch { return null; }
  }
  function tone(freq, len, type = 'sine', vol = 0.06, delay = 0, slide = 0) {
    const c = ac(); if (!c) return;
    const t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + len);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g).connect(c.destination);
    o.start(t); o.stop(t + len + 0.02);
  }
  function noise(len, vol = 0.08, delay = 0, hp = 1200) {
    const c = ac(); if (!c) return;
    if (!noiseBuf) {
      noiseBuf = c.createBuffer(1, c.sampleRate * 0.4, c.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const t = c.currentTime + delay;
    const s = c.createBufferSource(), g = c.createGain(), f = c.createBiquadFilter();
    s.buffer = noiseBuf; f.type = 'highpass'; f.frequency.value = hp;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    s.connect(f).connect(g).connect(c.destination);
    s.start(t); s.stop(t + len + 0.02);
  }
  const sfx = {
    tap: () => { tone(420 + Math.random() * 260, 0.05, 'triangle', 0.035); noise(0.02, 0.025, 0, 3000); },
    ship: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.22, 'triangle', 0.06, i * 0.07)),
    prompt: () => { tone(880, 0.09, 'square', 0.025); tone(660, 0.12, 'square', 0.025, 0.1); },
    good: () => { tone(660, 0.1, 'triangle', 0.05); tone(990, 0.14, 'triangle', 0.05, 0.08); },
    bad: () => { tone(220, 0.3, 'sawtooth', 0.04, 0, -120); },
    buy: () => { tone(740, 0.06, 'square', 0.03); tone(1110, 0.1, 'triangle', 0.05, 0.05); },
    squash: () => { noise(0.08, 0.08, 0, 600); tone(180, 0.08, 'square', 0.03, 0, -80); },
    ach: () => [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.18, 'sine', 0.05, i * 0.09)),
    hi5: () => { noise(0.12, 0.16, 0, 900); tone(1200, 0.1, 'triangle', 0.04, 0.02); },
    pop: () => tone(900, 0.07, 'sine', 0.05, 0, 300),
    event: () => { tone(523, 0.12, 'sine', 0.05); tone(784, 0.18, 'sine', 0.05, 0.12); },
    deny: () => tone(300, 0.12, 'triangle', 0.04, 0, -60),
  };

  /* ---------- feedback: toasts, floats, confetti ---------- */
  function toast(title, body, cls = '') {
    const box = $('toasts');
    const el = document.createElement('div');
    el.className = `toast ${cls}`;
    const b = document.createElement('b'); b.textContent = title;
    el.append(b);
    if (body) { el.append(document.createTextNode(' ' + body)); }
    box.append(el);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 320); }, cls === 'ach' ? 3600 : 2800);
  }
  function floatAt(x, y, text, cls = '') {
    const el = document.createElement('div');
    el.className = `float ${cls}`;
    el.textContent = text;
    el.style.left = `${x}px`; el.style.top = `${y}px`;
    el.style.transform = 'translate(-50%,-50%)';
    document.body.append(el);
    setTimeout(() => el.remove(), 950);
  }
  function floatFrom(el, text, cls) {
    const r = el.getBoundingClientRect();
    floatAt(r.left + r.width / 2 + rnd(-r.width * 0.3, r.width * 0.3), r.top + rnd(4, r.height * 0.4), text, cls);
  }
  const fx = $('fx'), fctx = fx.getContext('2d');
  const parts = [];
  let fxRunning = false;
  function burst(x, y, n = 80, colors = ['#ffb84d', '#5fe0b0', '#ff6b8b', '#a690ff', '#6cc4ff', '#fff3d6']) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) n = Math.min(n, 16);
    for (let i = 0; i < n; i++) {
      const a = rnd(-Math.PI, 0), s = rnd(4, 13);
      parts.push({ x, y, vx: Math.cos(a) * s * rnd(0.4, 1), vy: Math.sin(a) * s, r: rnd(3, 7), c: pick(colors), rot: rnd(0, 6), vr: rnd(-0.3, 0.3), life: rnd(60, 110) });
    }
    if (!fxRunning) { fxRunning = true; requestAnimationFrame(fxLoop); }
  }
  function fxLoop() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (fx.width !== innerWidth * dpr || fx.height !== innerHeight * dpr) { fx.width = innerWidth * dpr; fx.height = innerHeight * dpr; }
    fctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    fctx.clearRect(0, 0, innerWidth, innerHeight);
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.vy += 0.28; p.vx *= 0.985; p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.life--;
      if (p.life <= 0 || p.y > innerHeight + 20) { parts.splice(i, 1); continue; }
      fctx.save(); fctx.translate(p.x, p.y); fctx.rotate(p.rot);
      fctx.globalAlpha = Math.min(1, p.life / 30);
      fctx.fillStyle = p.c; fctx.fillRect(-p.r, -p.r * 0.45, p.r * 2, p.r * 0.9);
      fctx.restore();
    }
    if (parts.length) requestAnimationFrame(fxLoop);
    else { fxRunning = false; fctx.clearRect(0, 0, innerWidth, innerHeight); }
  }
  function burstFrom(el, n) { const r = el.getBoundingClientRect(); burst(r.left + r.width / 2, r.top + r.height / 3, n); }

  /* ---------- achievements ---------- */
  const ACH = [
    ['first', 'Hello, world', 'Ship your first app', () => S.stats.ships >= 1],
    ['ship10', 'Serial shipper', 'Ship 10 apps', () => S.stats.ships >= 10],
    ['ship50', 'App factory', 'Ship 50 apps', () => S.stats.ships >= 50],
    ['ship150', 'Portfolio or cry for help', 'Ship 150 apps', () => S.stats.ships >= 150],
    ['users1k', 'Small town', 'Reach 1,000 users', () => activeUsers >= 1e3],
    ['users1m', 'Big in Sweden', 'Reach 1 million users', () => activeUsers >= 1e6],
    ['users1b', 'Basically everyone', 'Reach 1 billion users', () => activeUsers >= 1e9],
    ['val1m', 'Paper millionaire', 'Reach a $1M valuation', () => S.best >= 1e6],
    ['val1b', 'Unicorn (emotionally)', 'Reach a $1B valuation', () => S.best >= 1e9],
    ['val1t', 'Too big to vibe', 'Reach a $1T valuation', () => S.best >= 1e12],
    ['allow25', 'Yes-man', 'Allow 25 permission prompts', () => S.stats.allows >= 25],
    ['deny25', 'Trust issues', 'Deny 25 permission prompts', () => S.stats.denies >= 25],
    ['fix50', 'Exterminator', 'Squash 50 bugs', () => S.stats.fixes >= 50],
    ['taps1k', 'Prompt goblin', 'Prompt 1,000 times', () => S.stats.taps >= 1000],
    ['clean', 'Zero bugs, zero excuses', 'Ship an app with no bugs', () => false],
    ['buggy', 'It is a feature', 'Ship an app with 6 or more bugs', () => false],
    ['night', 'Before 04:00', 'Ship an app between 03:00 and 04:00 your time', () => false],
    ['garage', 'Garage band', 'Move into the garage', () => S.office >= 1],
    ['loft', 'Exposed brick', 'Move into the loft', () => S.office >= 2],
    ['campus', 'There is a slide', 'Move into the campus', () => S.office >= 3],
    ['agents10', 'Middle manager', 'Run 10 agents at once', () => S.agents >= 10],
    ['agi', 'Probably fine', 'Upgrade to AGI (Beta, Probably)', () => S.model >= 6],
    ['yolo', '--yolo', 'Turn on yolo mode', () => S.yoloOn],
    ['prod', 'Haiku of doom', 'Survive "agent deleted prod"', () => S.stats.prod >= 1],
    ['viral', 'Gone viral', 'Have an app go viral', () => S.stats.viral >= 1],
    ['streak3', 'Standup regular', 'Keep a 3-day standup streak', () => S.daily.streak >= 3],
    ['streak7', 'Ritual', 'Keep a 7-day standup streak', () => S.daily.streak >= 7],
    ['ipo', 'Ring the bell', 'Take your company public', () => S.stats.ipos >= 1],
    ['hi5', 'Up top!', 'High five a coworker', () => S.stats.hi5 >= 1],
    ['pair', 'Pair programmer', 'Pair program for 60 seconds', () => S.stats.pairSec >= 60],
    ['chat', 'Water cooler', 'Send a chat bubble', () => S.stats.chats >= 1],
    ['team', 'Ship together', 'Ship a team app', () => S.stats.teamShips >= 1],
    ['team5', 'Dream team', 'Ship 5 team apps', () => S.stats.teamShips >= 5],
  ];
  function unlock(id) {
    if (S.ach[id]) return;
    const a = ACH.find(x => x[0] === id); if (!a) return;
    S.ach[id] = now();
    toast(`Trophy: ${a[1]}`, `${a[2]}. +2% speed and revenue.`, 'ach');
    sfx.ach();
    trophiesDirty = true;
    if (currentTab !== 'trophies') $('badgeTr').hidden = false;
  }
  function checkAch() { for (const a of ACH) if (!S.ach[a[0]] && a[3]()) unlock(a[0]); }

  /* ---------- core actions ---------- */
  const PROMPT_LINES = ['make it better', 'no, not like that', 'please', 'pretty please', 'you are a senior engineer',
    'fix it', 'add a button', 'like that other app but good', 'do not break anything', 'why', 'ok now undo that',
    'more vibes', 'center it', 'faster', 'make no mistakes', 'think step by step', 'it is 03:57, hurry'];
  function addProgress(n) {
    const p = S.project;
    if (p.prog >= p.need) { p.polish += n; return; }
    p.prog = Math.min(p.need, p.prog + n);
    maybeBug(n);
  }
  function maybeBug(n) {
    const p = S.project;
    const expect = 4 * D.MODELS[S.model].bugs * G.bugs * buffMult('shield');
    if (p.bugs < 9 && Math.random() < (n / p.need) * expect) {
      p.bugs++;
      projectDirty = true;
    }
  }
  function tapPrompt() {
    const C = calc();
    addProgress(C.tap);
    S.stats.taps++;
    sfx.tap();
    const btn = $('btnPrompt');
    floatFrom(btn, `+${fmt(C.tap)}`);
    if (S.stats.taps % 6 === 0) floatFrom(btn, `"${pick(PROMPT_LINES)}"`, 'violet');
    officeApi().onTap && officeApi().onTap();
  }
  function squash(idx, el) {
    const p = S.project;
    if (p.bugs <= 0) return;
    p.bugs--; S.stats.fixes++;
    sfx.squash();
    if (el) floatFrom(el, 'squashed!', 'mint');
    projectDirty = true;
  }
  function ship(auto) {
    const p = S.project;
    if (p.prog < p.need) return;
    const q = clamp(1 - 0.1 * p.bugs, 0.3, 1);
    const launch = Math.max(10, Math.round(p.need * 2 * q * (1 + S.hype / 100) * G.users * (1 + 0.1 * S.stock)));
    const bonus = launch * 0.5 * G.rev;
    S.cash += bonus; S.life += bonus;
    gainHype(4 + 6 * q);
    S.apps.push({ n: p.name, u: launch, p: launch * 3, q: Math.round(q * 100) / 100, t: now(), c: hashColor(p.name), v: p.ver });
    trimApps();
    S.ships++; S.stats.ships++;
    if (p.bugs === 0) unlock('clean');
    if (p.bugs >= 6) unlock('buggy');
    const h = new Date().getHours();
    if (h === 3) unlock('night');
    sfx.ship();
    burstFrom($('btnShip').hidden ? $('btnPrompt') : $('btnShip'), auto ? 30 : 110);
    toast(`Shipped ${p.name}!`, `+${fmt(launch)} users, +${money(bonus)}.`, 'good');
    S.project = newProject();
    sumUsers();
    projectDirty = true; appsDirty = true; upgradesDirty = true;
    officeApi().onShip && officeApi().onShip();
    save();
  }
  function trimApps() {
    if (S.apps.length <= 400) return;
    const retired = S.apps.findIndex(a => a.r);
    if (retired >= 0) { S.apps.splice(retired, 1); return; }
    const old = S.apps.shift();
    S.legacyUsers += old.u;
  }
  function gainHype(n) { S.hype = Math.max(0, S.hype + (n > 0 ? n * G.hype : n)); }

  /* ---------- purchases ---------- */
  function spend(cost) {
    if (S.cash + 1e-9 < cost) return false;
    S.cash -= cost; return true;
  }
  function afterBuy(el, label) {
    sfx.buy();
    if (el) { floatFrom(el, label, 'mint'); }
    G = gearEff();
    upgradesDirty = true; projectDirty = true;
    checkAch();
    save();
  }
  function buyAgent(el) {
    if (S.agents >= D.OFFICES[S.office].max) return;
    if (!spend(agentCost())) return;
    S.agents++;
    afterBuy(el, `Agent ${agentName(S.agents - 1)} hired`);
    officeApi().onChange && officeApi().onChange();
  }
  function buyModel(el) {
    const next = D.MODELS[S.model + 1]; if (!next) return;
    if (!spend(next.cost)) return;
    S.model++;
    afterBuy(el, next.name);
    toast('Model upgraded', `${next.name}: ${next.blurb}`, 'good');
  }
  function buyOffice(el) {
    const next = D.OFFICES[S.office + 1]; if (!next) return;
    if (!spend(next.cost)) return;
    S.office++;
    afterBuy(el, 'Moved!');
    burstFrom(el || $('officeBox'), 90);
    toast(`Welcome to the ${next.name.toLowerCase()}`, next.blurb, 'good');
    officeApi().onChange && officeApi().onChange();
  }
  function buyGear(id, el) {
    const g = D.GEAR.find(x => x.id === id);
    if (!g || S.gear[id]) return;
    if (g.req && S.office < g.req) return;
    if (!spend(g.cost)) return;
    S.gear[id] = 1;
    if (id === 'yolo') S.yoloOn = true;
    afterBuy(el, g.name);
    officeApi().onChange && officeApi().onChange();
  }
  const agentName = i => D.AGENT_NAMES[i % D.AGENT_NAMES.length] + (i >= D.AGENT_NAMES.length ? ` ${Math.floor(i / D.AGENT_NAMES.length) + 1}` : '');
  const randomAgent = () => `Agent ${agentName(Math.floor(Math.random() * S.agents))}`;

  function ipoGain() { return Math.floor(Math.sqrt(valuation() / 1e7)); }
  function goPublic() {
    const gain = ipoGain();
    if (valuation() < IPO_AT || gain < 1) return;
    modal(`
      <h2>Ring the bell?</h2>
      <p>Your company goes public. You get <b>${gain} founder stock</b>, and every share adds 10% speed, users and revenue forever.</p>
      <p>You keep your trophies, stats and app collection. Cash, agents, models, gear and the office reset. Your current apps get acquired by your own public company and stop earning.</p>
      <div class="row2"><button class="big-btn" data-close>Not yet</button><button class="big-btn primary" id="ipoYes">Go public</button></div>`);
    $('ipoYes').onclick = () => {
      closeModal();
      S.stock += gain; S.stats.ipos++;
      for (const a of S.apps) a.r = 1;
      Object.assign(S, { cash: 0, hype: 0, agents: 1, model: 0, office: 0, gear: {}, yoloOn: false, ships: 0, legacyUsers: 0 });
      G = gearEff();
      S.project = newProject();
      queue.length = 0; renderDialog();
      sumUsers();
      unlock('ipo');
      sfx.ship(); burst(innerWidth / 2, innerHeight / 3, 160);
      toast('You are public!', `+${gain} founder stock.`, 'good');
      upgradesDirty = appsDirty = projectDirty = true;
      officeApi().onChange && officeApi().onChange();
      save();
    };
  }

  /* ---------- effects from prompts and events ---------- */
  function applyFx(e) {
    const p = S.project, C = calc();
    const soft = G.safety ? 0.5 : 1;
    const parts = [];
    if (e.prog) {
      const v = e.prog < 0 ? e.prog * soft : e.prog;
      const before = p.prog;
      p.prog = clamp(p.prog + v * p.need, 0, p.need);
      if (p.prog !== before) parts.push(`${v > 0 ? '+' : ''}${Math.round(v * 100)}% progress`);
    }
    if (e.bugs) {
      const v = e.bugs > 0 ? Math.max(1, Math.round(e.bugs * soft)) : e.bugs;
      const before = p.bugs;
      p.bugs = clamp(p.bugs + v, 0, 9);
      const d = p.bugs - before;
      if (d) parts.push(`${d > 0 ? '+' : ''}${d} bug${Math.abs(d) === 1 ? '' : 's'}`);
      if (d < 0) S.stats.fixes -= d;
    }
    if (e.cashSec) {
      const amt = Math.max(20, C.income * Math.abs(e.cashSec));
      if (e.cashSec > 0) { S.cash += amt; S.life += amt; parts.push(`+${money(amt)}`); }
      else { const lose = Math.min(S.cash, amt * soft); S.cash -= lose; if (lose > 0) parts.push(`-${money(lose)}`); }
    }
    if (e.hype) { const v = e.hype > 0 ? e.hype * G.hype : e.hype; gainHype(v); parts.push(`${v > 0 ? '+' : ''}${fmt(v)} hype`); }
    if (e.boost) {
      const [m, s] = e.boost;
      addBuff('speed', m, m < 1 ? s * soft : s, m >= 1 ? `Speed ×${m}` : `Slowed ×${m}`, m < 1);
      parts.push(m >= 1 ? `speed ×${m} for ${s} s` : `slowed for ${Math.round(s * soft)} s`);
    }
    if (e.stall) { const s = Math.round(e.stall * soft); addBuff('stall', 0, s, 'Agents stalled', true); parts.push(`stalled ${s} s`); }
    if (e.users) {
      const f = e.users < 0 ? e.users * soft : e.users;
      for (const a of S.apps) if (!a.r) a.u = Math.max(0, a.u * (1 + f));
      sumUsers();
      parts.push(`${f > 0 ? '+' : ''}${Math.round(f * 100)}% users`);
    }
    if (e.tapBoost) { addBuff('tap', e.tapBoost[0], e.tapBoost[1], `Taps ×${e.tapBoost[0]}`); parts.push(`taps ×${e.tapBoost[0]}`); }
    if (e.rename) { const old = p.name; p.name = D.appName(nameSet()); parts.push(`"${old}" is now "${p.name}"`); }
    projectDirty = true;
    return parts.join(' · ');
  }

  /* ---------- dialog queue: permission prompts and events ---------- */
  const queue = [];
  let promptAt = now() + (S.stats.taps < 5 ? 12000 : rnd(18000, 32000));
  let eventAt = now() + rnd(70000, 120000);
  let lastPromptIdx = -1;
  function spawnPrompt() {
    let i;
    do { i = Math.floor(Math.random() * D.PROMPTS.length); } while (i === lastPromptIdx && D.PROMPTS.length > 1);
    lastPromptIdx = i;
    const item = { kind: 'prompt', p: D.PROMPTS[i], agent: randomAgent(), id: Math.random() };
    if (yoloActive()) { resolvePrompt(item, true, true); return; }
    queue.push(item);
    sfx.prompt();
    renderDialog();
  }
  function riskOf(p) { return clamp(p.risk + G.risk + (yoloActive() ? 0.08 : 0), 0.03, 0.9); }
  function resolvePrompt(item, allow, auto) {
    const idx = queue.indexOf(item);
    if (idx >= 0) queue.splice(idx, 1);
    const p = item.p;
    let text, summary, good;
    if (allow) {
      S.stats.allows++;
      good = Math.random() >= riskOf(p);
      const [t, e] = good ? p.good : p.bad;
      text = t; summary = applyFx(e);
    } else {
      S.stats.denies++;
      good = true;
      if (p.deny) { text = p.deny[0]; summary = applyFx(p.deny[1]); }
      else { text = pick(D.DENY_LINES).replace('{a}', item.agent); summary = applyFx({ boost: [0.85, 8] }); }
    }
    if (allow) (good ? sfx.good : sfx.bad)(); else sfx.deny();
    toast(`${auto ? 'Auto-allowed. ' : ''}${allow ? (good ? 'Nice.' : 'Oh no.') : 'Denied.'}`, `${text}${summary ? ` (${summary})` : ''}`, allow ? (good ? 'good' : 'bad') : '');
    renderDialog();
    officeApi().onChange && officeApi().onChange();
  }
  function riskLabel(r) {
    if (r < 0.25) return ['Low risk', 'var(--mint)'];
    if (r < 0.5) return ['Some risk', 'var(--amber)'];
    return ['Spicy', 'var(--pink)'];
  }
  function renderDialog() {
    const layer = $('dialogLayer');
    const item = queue[0];
    if (!item) { layer.innerHTML = ''; return; }
    if (layer.firstChild && layer.firstChild.dataset.id === String(item.id)) {
      const more = layer.querySelector('.more'); if (more) more.textContent = queue.length > 1 ? `+${queue.length - 1} waiting` : '';
      return;
    }
    const more = queue.length > 1 ? `+${queue.length - 1} waiting` : '';
    if (item.kind === 'prompt') {
      const [rl, rc] = riskLabel(riskOf(item.p));
      layer.innerHTML = `<div class="dlg" data-id="${item.id}" role="alertdialog" aria-label="Permission required">
        <div class="hd">Permission required <span class="more">${more}</span></div>
        <h3>${esc(item.agent)} wants to run</h3>
        <pre>${esc(item.p.cmd)}</pre>
        <p>…${esc(item.p.why)}.</p>
        <span class="risk" style="color:${rc}">${rl}</span>
        <div class="btns"><button class="b-deny" id="dDeny">Deny <small class="kb" style="opacity:.6">(N)</small></button><button class="b-allow" id="dAllow">Allow <small class="kb" style="opacity:.6">(Y)</small></button></div>
      </div>`;
      $('dDeny').onclick = () => resolvePrompt(item, false);
      $('dAllow').onclick = () => resolvePrompt(item, true);
    } else {
      layer.innerHTML = `<div class="dlg event" data-id="${item.id}" role="alertdialog" aria-label="${esc(item.title)}">
        <div class="hd">Breaking news <span class="more">${more}</span></div>
        <h3>${esc(item.title)}</h3>
        <p>${esc(item.body)}</p>
        ${item.haiku ? `<p class="haiku">${item.haiku.map(esc).join('<br>')}</p>` : ''}
        <div class="btns">${item.choices.map((c, i) => `<button class="${c.cls || 'b-alt'}" data-i="${i}">${esc(c.label)}</button>`).join('')}</div>
      </div>`;
      layer.querySelectorAll('[data-i]').forEach(b => {
        b.onclick = () => {
          const idx = queue.indexOf(item); if (idx >= 0) queue.splice(idx, 1);
          const res = item.choices[+b.dataset.i].fn() || [];
          if (res[0]) toast(res[0], res[1] || '', res[2] || 'good');
          renderDialog();
          projectDirty = true;
        };
      });
    }
  }

  function makeEvent() {
    const C = calc();
    const live = S.apps.filter(a => !a.r);
    const latest = live[live.length - 1];
    const agent = randomAgent();
    const list = [
      { w: 3, ok: !!latest, make: () => ({
        title: 'You went viral',
        body: `"${latest.n}" hit the front page of Hacker Noodles. The comments all say "I could build this in a weekend".`,
        choices: [{ label: 'Ride the wave', cls: 'b-allow', fn: () => {
          latest.p *= 1.6; latest.u *= 1.2; gainHype(25); S.stats.viral++; sumUsers(); appsDirty = true;
          return ['Users are pouring in.', '+60% peak users, +25 hype.'];
        } }] }) },
      { w: 2, ok: activeUsers > 50, make: () => {
        addBuff('rev', 0.3, 60, 'Servers melting', true);
        const cost = Math.max(40, C.income * 25);
        return {
          title: 'Servers are melting',
          body: 'Your free-tier server is now a small campfire. Revenue is down 70% until it cools off.',
          choices: [
            { label: `Throw money at it (${money(cost)})`, cls: 'b-allow', fn: () => {
              if (S.cash < cost) { return ['Not enough cash.', 'The campfire continues.', 'bad']; }
              S.cash -= cost; removeBuff('Servers melting'); return ['Fire out.', 'You bought more servers. They are also on fire, but less.'];
            } },
            { label: 'Turn it off and on', cls: 'b-deny', fn: () => {
              if (Math.random() < 0.6) { removeBuff('Servers melting'); return ['It worked!', 'Classic.']; }
              return ['Still on fire.', 'It should calm down in a minute.', 'bad'];
            } }] };
      } },
      { w: 2, ok: true, make: () => {
        const offer = Math.max(500, C.income * 240 + valuation() * 0.02);
        return {
          title: 'A VC is calling',
          body: '"Chad from Seed Sprout Ventures. Love the vibes. What is your revenue? Actually, do not tell me."',
          choices: [
            { label: `Take ${money(offer)}`, cls: 'b-allow', fn: () => { S.cash += offer; S.life += offer; gainHype(-5); return ['Funded!', `+${money(offer)}. Chad wants a weekly update.`]; } },
            { label: 'Hang up (+hype)', cls: 'b-deny', fn: () => { gainHype(12); return ['Mysterious.', 'Founders who hang up on VCs get +12 hype.']; } }] };
      } },
      { w: 1.6, ok: S.project.prog > S.project.need * 0.25, make: () => ({
        title: 'Agent deleted prod',
        body: `${agent} deleted the production database. It apologised in a haiku:`,
        haiku: pick(D.HAIKU),
        choices: [{ label: G.safety ? 'Restore from backups' : 'Restore from… uh', cls: 'b-allow', fn: () => {
          S.stats.prod++;
          const s = applyFx({ prog: -0.3, users: -0.05 });
          return [G.safety ? 'Backups saved the day.' : 'Rebuilt from memory.', s, G.safety ? 'good' : 'bad'];
        } }] }) },
      { w: 2, ok: !!latest, make: () => ({
        title: 'An influencer posted you',
        body: `A tech influencer posted "${latest.n}" with three fire emojis and a shocked face thumbnail.`,
        choices: [{ label: 'Repost it', cls: 'b-allow', fn: () => { gainHype(15); latest.p *= 1.2; return ['Clout acquired.', '+15 hype, +20% peak users.']; } }] }) },
      { w: 1.5, ok: true, make: () => ({
        title: 'Mum texted',
        body: '"are you still up?? it is 03:57. there is lasagna in the fridge. love you"',
        choices: [
          { label: 'Eat the lasagna', cls: 'b-allow', fn: () => { addBuff('speed', 1.5, 45, 'Lasagna power'); return ['Delicious.', 'Speed ×1.5 for 45 s.']; } },
          { label: 'Reply "5 more min"', cls: 'b-deny', fn: () => { addBuff('tap', 2, 30, 'Taps ×2'); gainHype(3); return ['She knows.', 'Taps ×2 for 30 s.']; } }] }) },
      { w: 1.4, ok: true, make: () => ({
        title: 'The cloud is down',
        body: 'Not your cloud. THE cloud. Everyone is posting the same meme about it.',
        choices: [{ label: 'Post the meme too', cls: 'b-allow', fn: () => { addBuff('stall', 0, 10, 'Agents stalled', true); gainHype(6); return ['Relatable.', 'Agents stalled 10 s, +6 hype.']; } }] }) },
      { w: 1.4, ok: true, make: () => {
        const prize = Math.max(200, C.income * 180);
        return {
          title: 'You won a hackathon',
          body: 'One you forgot you entered. The prize is a giant cheque and a hoodie in the wrong size.',
          choices: [{ label: `Cash the giant cheque`, cls: 'b-allow', fn: () => { S.cash += prize; S.life += prize; return ['Banked.', `+${money(prize)}.`]; } }] };
      } },
      { w: 1, ok: S.agents >= 3, make: () => {
        const price = agentCost() * 3;
        return {
          title: `BigCo wants ${agent}`,
          body: `They offer a signing bonus, "unlimited GPUs" and a lanyard. ${agent} is looking at you.`,
          choices: [
            { label: `Sell for ${money(price)}`, cls: 'b-allow', fn: () => { if (S.agents < 2) return ['Too late.', '']; S.agents--; S.cash += price; S.life += price; upgradesDirty = true; officeApi().onChange && officeApi().onChange(); return ['Sold.', `+${money(price)}. You can hire a new agent anytime.`]; } },
            { label: 'Keep them', cls: 'b-deny', fn: () => { addBuff('speed', 1.25, 60, 'Loyalty'); return ['Loyalty bonus.', 'Speed ×1.25 for 60 s.']; } }] };
      } },
      { w: 1.4, ok: true, make: () => {
        const cost = Math.max(30, C.income * 15);
        return {
          title: 'Bug bounty hunter',
          body: 'Someone found a bug in your app. They want a t-shirt. And some money. Mostly the money.',
          choices: [
            { label: `Pay ${money(cost)}`, cls: 'b-allow', fn: () => { const paid = Math.min(S.cash, cost); S.cash -= paid; gainHype(5); return ['Respect.', '+5 hype for being cool about it.']; } },
            { label: 'Ignore them', cls: 'b-deny', fn: () => { const s = applyFx({ bugs: 2, hype: -3 }); return ['They posted it.', s, 'bad']; } }] };
      } },
      { w: 1, ok: S.ships >= 3, make: () => ({
        title: 'Conference invite',
        body: 'They want you to give a talk called "Shipping 40 apps a week with zero engineers".',
        choices: [
          { label: 'Give the talk', cls: 'b-allow', fn: () => { gainHype(20); addBuff('stall', 0, 8, 'Agents stalled', true); return ['Standing ovation.', '+20 hype. Agents stalled 8 s while you were away.']; } },
          { label: 'Stay and ship', cls: 'b-deny', fn: () => { addBuff('speed', 1.3, 40, 'Focus mode'); return ['Focus mode.', 'Speed ×1.3 for 40 s.']; } }] }) },
    ].filter(e => e.ok);
    let total = list.reduce((s, e) => s + e.w, 0), r = Math.random() * total;
    for (const e of list) { r -= e.w; if (r <= 0) return e.make(); }
    return list[0].make();
  }
  function spawnEvent() {
    const ev = makeEvent();
    queue.push(Object.assign({ kind: 'event', id: Math.random() }, ev));
    S.stats.events++;
    sfx.event();
    renderDialog();
  }

  /* ---------- chips ---------- */
  const CHIP_CD = 6000;
  let chips = [];
  function initChips() {
    const ids = D.CHIPS.map(c => c.id).sort(() => Math.random() - 0.5);
    chips = [0, 1, 2].map(i => ({ id: ids[i], ready: 0 }));
    renderChips();
  }
  function useChip(slot, el) {
    const c = chips[slot];
    if (!c || c.ready > now()) return;
    const C = calc();
    const p = S.project;
    switch (c.id) {
      case 'pop': addProgress(C.tap * 3); gainHype(1); floatFrom(el, `+${fmt(C.tap * 3)} · +hype`); break;
      case 'fix':
        if (p.bugs > 0) { p.bugs--; S.stats.fixes++; sfx.squash(); floatFrom(el, 'bug fixed', 'mint'); }
        else { addProgress(C.tap); floatFrom(el, 'no bugs found. suspicious', 'violet'); }
        break;
      case 'ai': addProgress(C.tap * 6); floatFrom(el, `+${fmt(C.tap * 6)}`); if (Math.random() < 0.35 && p.bugs < 9) { p.bugs++; floatFrom(el, '+1 bug', 'pink'); } break;
      case 'viral':
        if (Math.random() < 0.5) { gainHype(5); floatFrom(el, '+5 hype', 'mint'); }
        else { gainHype(1); floatFrom(el, 'it went "viral"', 'violet'); }
        break;
      case 'weekend': addProgress(C.tap * 12); p.bugs = Math.min(9, p.bugs + 2); floatFrom(el, `+${fmt(C.tap * 12)} · +2 bugs`, 'pink'); break;
      case 'work': addProgress(C.tap * 4); floatFrom(el, `+${fmt(C.tap * 4)}`); break;
      case 'eli5': addProgress(C.tap * 2.5); gainHype(1.5); floatFrom(el, `+${fmt(C.tap * 2.5)} · +hype`); break;
      case 'vibe': addBuff('speed', 1.3, 20, 'Vibing'); floatFrom(el, 'vibing ×1.3', 'mint'); break;
      case 'tests': addBuff('shield', 0.4, 40, 'Tests (fewer bugs)'); floatFrom(el, 'fewer bugs for 40 s', 'mint'); break;
    }
    sfx.pop();
    S.stats.taps++;
    const others = new Set(chips.map(x => x.id));
    const pool = D.CHIPS.filter(x => !others.has(x.id));
    chips[slot] = { id: pick(pool).id, ready: now() + CHIP_CD };
    renderChips();
    projectDirty = true;
  }
  function renderChips() {
    const box = $('chips');
    box.innerHTML = chips.map((c, i) => {
      const d = D.CHIPS.find(x => x.id === c.id);
      return `<button class="chip" data-slot="${i}"><b>${esc(d.label)}</b><span>${esc(d.hint)}</span><i class="cd"></i></button>`;
    }).join('');
    box.querySelectorAll('.chip').forEach(b => { b.onclick = () => useChip(+b.dataset.slot, b); });
  }
  function updateChips() {
    const t = now();
    $('chips').querySelectorAll('.chip').forEach((b, i) => {
      const c = chips[i]; if (!c) return;
      const left = c.ready - t;
      b.disabled = left > 0;
      b.querySelector('.cd').style.width = left > 0 ? `${(left / CHIP_CD) * 100}%` : '0';
    });
  }

  /* ---------- UI rendering ---------- */
  let projectDirty = true, upgradesDirty = true, appsDirty = true, trophiesDirty = true;
  let currentTab = 'upgrades';
  const last = {};
  function setText(id, text) { if (last[id] !== text) { last[id] = text; $(id).textContent = text; } }

  function renderStats() {
    const C = calc();
    setText('sCash', money(S.cash));
    setText('sIncome', `+${money(C.income)}/s`);
    setText('sUsers', fmt(activeUsers));
    const live = S.apps.filter(a => !a.r).length;
    setText('sApps', `${live} app${live === 1 ? '' : 's'} live`);
    setText('sHype', fmt(S.hype));
    setText('sHypeNote', `×${(1 + S.hype / 100).toFixed(2)} users`);
    const v = valuation();
    setText('sVal', money(v));
    setText('sBest', S.stock ? `best ${money(S.best)} · ${S.stock} stock` : `best ${money(S.best)}`);
  }
  function renderProject() {
    const p = S.project, C = calc();
    const ready = p.prog >= p.need;
    setText('projName', p.name);
    setText('projVer', `app #${S.stats.ships + 1}`);
    setText('projLabel', ready ? 'Ready to ship' : 'Now building');
    const pct = clamp(p.prog / p.need, 0, 1);
    $('projBar').style.width = `${pct * 100}%`;
    $('projBarWrap').classList.toggle('ready', ready);
    $('projBarWrap').setAttribute('aria-valuenow', String(Math.round(pct * 100)));
    setText('projLines', `${fmt(p.prog)} / ${fmt(p.need)} lines`);
    setText('projRate', `${fmt(C.rate)} lines/s`);
    setText('tapInfo', `+${fmt(C.tap)} lines`);
    $('btnPrompt').hidden = ready;
    $('btnShip').hidden = !ready;
    if (ready) {
      const q = clamp(1 - 0.1 * p.bugs, 0.3, 1);
      const launch = Math.max(10, Math.round(p.need * 2 * q * (1 + S.hype / 100) * G.users * (1 + 0.1 * S.stock)));
      setText('shipInfo', `~${fmt(launch)} users · +${money(launch * 0.5 * G.rev)}${p.bugs ? ` · ${p.bugs} bug${p.bugs > 1 ? 's' : ''}` : ''}`);
    }
    // status line
    const st = $('projStatus');
    let text = '', cls = '';
    const pairName = officeApi().pairing;
    if (C.stalled) { text = 'Agents are stalled.'; cls = 'bad'; }
    else if (promptWaiting()) { text = 'Your agents are waiting for permission. Half speed until you answer.'; cls = 'warn'; }
    else if (ready) { text = G.autoship ? 'Auto-deploying…' : 'Done. Ship it to get users and cash.'; }
    else if (pairName) { text = `Pair programming with ${pairName}: ×1.5 speed`; }
    else { text = `${S.agents} agent${S.agents > 1 ? 's' : ''} on ${D.MODELS[S.model].name}`; }
    if (last.status !== text + cls) { last.status = text + cls; st.textContent = text; st.className = `p-status ${cls}`; }
    // bugs
    if (last.bugs !== p.bugs) {
      last.bugs = p.bugs;
      const row = $('bugRow');
      row.innerHTML = '';
      for (let i = 0; i < p.bugs; i++) {
        const b = document.createElement('button');
        b.className = 'bug'; b.textContent = '🐛'; b.setAttribute('aria-label', 'Squash bug');
        b.onclick = () => squash(i, b);
        row.append(b);
      }
      if (p.bugs) {
        const n = document.createElement('span');
        n.className = 'note';
        n.textContent = `−${Math.round((1 - C.bugPen) * 100)}% speed. Tap to squash.`;
        row.append(n);
      }
    }
  }
  function renderBuffs() {
    const t = now();
    for (let i = buffs.length - 1; i >= 0; i--) if (buffs[i].until <= t) buffs.splice(i, 1);
    const pairName = officeApi().pairing;
    const items = buffs.filter(b => b.k !== 'shield' || true).map(b => ({ t: `${b.label} ${Math.ceil((b.until - t) / 1000)}s`, bad: b.bad }));
    if (pairName) items.unshift({ t: 'Pairing ×1.5', bad: false });
    const html = items.slice(0, 5).map(b => `<span class="buff${b.bad ? ' bad' : ''}">${esc(b.t)}</span>`).join('');
    if (last.buffs !== html) { last.buffs = html; $('buffs').innerHTML = html; }
  }

  function row({ title, lvl = '', desc, btn, cls = '', disabled, action, fill = 0, id }) {
    return `<div class="row ${cls}" ${id ? `data-row="${id}"` : ''}><i class="fill" style="width:${Math.min(100, fill * 100)}%"></i>
      <div class="txt"><b>${esc(title)}${lvl ? `<span class="lvl">${esc(lvl)}</span>` : ''}</b><span>${esc(desc)}</span></div>
      <button class="buy${btn.cls ? ' ' + btn.cls : ''}" data-act="${action}" ${disabled ? 'disabled' : ''}>${esc(btn.label)}</button></div>`;
  }
  let upgradeCosts = [];
  function renderUpgrades() {
    const box = $('tab-upgrades');
    const o = D.OFFICES[S.office], nextO = D.OFFICES[S.office + 1];
    const m = D.MODELS[S.model], nextM = D.MODELS[S.model + 1];
    const full = S.agents >= o.max;
    let html = '';
    upgradeCosts = [];
    if (S.daily.claimed !== dayKey()) {
      const [reward, streak] = dailyReward();
      html += `<div class="daily"><div class="txt"><b>Daily standup</b><span>Day ${streak} streak: +${money(reward)} and +10 hype</span></div><button class="buy" data-act="daily">Claim</button></div>`;
    }
    html += `<div class="sub">Team</div>`;
    const ac = agentCost();
    html += row({ title: full ? 'Office is full' : `Hire Agent ${agentName(S.agents)}`, lvl: `${S.agents}/${o.max}`,
      desc: full ? (nextO ? `Move to the ${nextO.name.toLowerCase()} to fit more agents.` : 'Every seat is taken. Impressive.') : '+1 agent. Each one writes code on its own.',
      btn: { label: full ? 'Full' : money(ac) }, disabled: full, action: 'agent', id: 'agent' });
    upgradeCosts.push(['agent', full ? Infinity : ac]);
    if (nextM) {
      html += row({ title: nextM.name, lvl: `tier ${S.model + 2}`, desc: `${nextM.blurb} Speed ×${nextM.mult / m.mult}, fewer bugs.`, btn: { label: money(nextM.cost) }, action: 'model', id: 'model' });
      upgradeCosts.push(['model', nextM.cost]);
    } else {
      html += row({ title: m.name, desc: 'The best model money can rent.', btn: { label: 'Maxed', cls: 'alt' }, disabled: true, action: 'none', cls: 'owned' });
    }
    html += `<div class="sub">Office</div>`;
    if (nextO) {
      html += row({ title: `Move to the ${nextO.name.toLowerCase()}`, desc: `${nextO.blurb} Seats ${nextO.max} agents, speed ×${nextO.mult}.`, btn: { label: money(nextO.cost) }, action: 'office', id: 'office' });
      upgradeCosts.push(['office', nextO.cost]);
    } else {
      html += row({ title: o.name, desc: 'You made it. The slide is still unused.', btn: { label: 'Home', cls: 'alt' }, disabled: true, action: 'none', cls: 'owned' });
    }
    html += `<div class="sub">Gear</div>`;
    const avail = D.GEAR.filter(g => !S.gear[g.id]).sort((a, b) => a.cost - b.cost).slice(0, 6);
    for (const g of avail) {
      const locked = g.req && S.office < g.req;
      html += row({ title: g.name, desc: g.desc, btn: { label: locked ? 'Locked' : money(g.cost) }, disabled: locked, cls: locked ? 'locked' : '', action: `gear:${g.id}`, id: `gear:${g.id}` });
      if (!locked) upgradeCosts.push([`gear:${g.id}`, g.cost]);
    }
    if (!avail.length) html += `<div class="empty">You own every gadget. The garage sale will be legendary.</div>`;
    if (G.yolo) {
      html += row({ title: '--yolo mode', desc: S.yoloOn ? 'Every prompt is auto-allowed. Slightly riskier.' : 'Off. You approve every prompt by hand.', btn: { label: S.yoloOn ? 'On' : 'Off', cls: S.yoloOn ? 'on' : 'alt' }, action: 'yolo' });
    }
    const owned = D.GEAR.filter(g => S.gear[g.id]).map(g => g.name);
    if (owned.length) html += `<p class="note">Owned: ${owned.map(esc).join(', ')}.</p>`;
    const v = valuation();
    if (v >= IPO_AT * 0.2 || S.stock) {
      html += `<div class="sub">Go public</div>`;
      const gain = ipoGain();
      const okIpo = v >= IPO_AT;
      html += row({ title: 'IPO', lvl: S.stock ? `${S.stock} stock` : '', cls: 'ipo',
        desc: okIpo ? `Reset for +${gain} founder stock (+${gain * 10}% everything, forever).` : `Unlocks at a ${money(IPO_AT)} valuation.`,
        btn: { label: okIpo ? 'Ring bell' : `${Math.floor(v / IPO_AT * 100)}%` }, disabled: !okIpo, action: 'ipo', id: 'ipo', fill: Math.min(1, v / IPO_AT) });
    }
    box.innerHTML = html;
    upgradesDirty = false;
    updateUpgrades();
  }
  function updateUpgrades() {
    let any = false;
    for (const [id, cost] of upgradeCosts) {
      const r = $('tab-upgrades').querySelector(`[data-row="${id}"]`);
      if (!r) continue;
      const btn = r.querySelector('.buy');
      const ok = S.cash >= cost;
      if (id !== 'ipo') btn.disabled = !ok;
      r.querySelector('.fill').style.width = `${Math.min(100, (S.cash / cost) * 100)}%`;
      if (ok) any = true;
    }
    $('badgeUp').hidden = !(any && currentTab !== 'upgrades');
  }
  $('tab-upgrades').addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
    const act = b.dataset.act;
    if (act === 'agent') buyAgent(b);
    else if (act === 'model') buyModel(b);
    else if (act === 'office') buyOffice(b);
    else if (act.startsWith('gear:')) buyGear(act.slice(5), b);
    else if (act === 'yolo') { S.yoloOn = !S.yoloOn; sfx.pop(); upgradesDirty = true; checkAch(); if (S.yoloOn) { queue.filter(q => q.kind === 'prompt').forEach(q => resolvePrompt(q, true, true)); } save(); }
    else if (act === 'ipo') goPublic();
    else if (act === 'daily') claimDaily(b);
  });

  function renderApps() {
    const box = $('tab-apps');
    const live = S.apps.filter(a => !a.r);
    const total = S.apps.length;
    const team = S.apps.filter(a => a.team).length;
    let html = `<div class="apps-sum"><div><b>${fmt(total)}</b><span>apps shipped</span></div><div><b>${fmt(activeUsers)}</b><span>live users</span></div><div><b>${fmt(team)}</b><span>team apps</span></div></div>`;
    if (!total) html += `<div class="empty">Nothing shipped yet. Your first app is one Ship button away.</div>`;
    const list = S.apps.slice(-80).reverse();
    for (const a of list) {
      const stars = '★'.repeat(Math.max(1, Math.round(a.q * 5))) + '☆'.repeat(5 - Math.max(1, Math.round(a.q * 5)));
      html += `<div class="app"><div class="ic" style="background:${APP_COLORS[a.c % APP_COLORS.length]}">${esc(initials(a.n))}</div>
        <div class="txt"><b>${esc(a.n)}${a.team ? '<span class="tagt">TEAM</span>' : ''}</b><span>${a.r ? 'Acquired · ' : ''}${stars}${a.w ? ` · with ${esc(a.w)}` : ''}</span></div>
        <div class="u">${fmt(a.u)}<br><span style="font-size:11px;color:var(--dim);font-weight:600">users</span></div></div>`;
    }
    if (S.apps.length > 80) html += `<p class="note">And ${fmt(S.apps.length - 80)} older apps in the archive.</p>`;
    box.innerHTML = html;
    appsDirty = false;
  }

  function renderTrophies() {
    const box = $('trophyList');
    const got = Object.keys(S.ach).length;
    const st = S.stats;
    let html = `<div class="sub">Stats</div><div class="statlist">
      <div><b>${fmt(st.ships)}</b>apps shipped</div><div><b>${fmt(st.taps)}</b>prompts typed</div>
      <div><b>${fmt(st.allows)} / ${fmt(st.denies)}</b>allowed / denied</div><div><b>${fmt(st.fixes)}</b>bugs squashed</div>
      <div><b>${money(S.life)}</b>lifetime earnings</div><div><b>${S.daily.streak || 0} day${S.daily.streak === 1 ? '' : 's'}</b>standup streak</div>
      <div><b>${fmt(st.teamShips)}</b>team apps</div><div><b>${dur(st.playSec)}</b>played</div></div>
      <div class="sub">Trophies ${got}/${ACH.length} · +${got * 2}% speed and revenue</div><div class="trophies">`;
    for (const a of ACH) {
      const has = !!S.ach[a[0]];
      html += `<div class="trophy${has ? ' got' : ''}"><b>${esc(a[1])}</b><span>${esc(a[2])}</span></div>`;
    }
    html += `</div><div class="sub">Danger zone</div><button class="big-btn danger" id="resetBtn">Reset save</button>`;
    box.innerHTML = html;
    $('resetBtn').onclick = () => {
      modal(`<h2>Start over?</h2><p>This deletes your cash, apps, trophies and stats on this device. It cannot be undone.</p>
        <div class="row2"><button class="big-btn" data-close>Keep my empire</button><button class="big-btn danger" id="resetYes">Delete everything</button></div>`);
      $('resetYes').onclick = () => { try { localStorage.removeItem(SAVE_KEY); } catch {} resetting = true; location.reload(); };
    };
    trophiesDirty = false;
  }
  let resetting = false;

  function showTab(name) {
    currentTab = name;
    document.querySelectorAll('.tab').forEach(t => t.setAttribute('aria-selected', String(t.dataset.tab === name)));
    for (const n of ['upgrades', 'apps', 'trophies', 'office']) $(`tab-${n}`).hidden = n !== name;
    if (name === 'apps') renderApps();
    if (name === 'trophies') { renderTrophies(); $('badgeTr').hidden = true; ludvigBoard($('tyBoard'), SLUG); }
    if (name === 'upgrades') renderUpgrades();
    if (name === 'office' && officeApi().onTab) officeApi().onTab();
  }
  document.querySelectorAll('.tab').forEach(t => { t.onclick = () => showTab(t.dataset.tab); });

  /* ---------- modal ---------- */
  function modal(html) {
    $('sheet').innerHTML = html;
    $('modal').hidden = false;
    $('sheet').querySelectorAll('[data-close]').forEach(b => { b.onclick = closeModal; });
    const f = $('sheet').querySelector('button.primary, input, button');
    if (f) setTimeout(() => f.focus(), 30);
  }
  function closeModal() { $('modal').hidden = true; $('sheet').innerHTML = ''; }
  $('modal').addEventListener('click', e => { if (e.target === $('modal')) closeModal(); });
  const modalOpen = () => !$('modal').hidden;

  /* ---------- daily standup ---------- */
  function dailyReward() {
    const y = new Date(); y.setDate(y.getDate() - 1);
    const streak = S.daily.claimed === dayKey(y) ? S.daily.streak + 1 : 1;
    const reward = Math.max(150, calc().income * 300) * (1 + 0.25 * Math.min(streak - 1, 8));
    return [reward, streak];
  }
  function claimDaily(el) {
    if (S.daily.claimed === dayKey()) return;
    const [reward, streak] = dailyReward();
    S.daily = { claimed: dayKey(), streak };
    S.cash += reward; S.life += reward; gainHype(10);
    sfx.ship();
    if (el) burstFrom(el, 60);
    toast(`Standup done. Day ${streak}!`, `+${money(reward)} and +10 hype. Come back tomorrow to keep the streak.`, 'good');
    upgradesDirty = true; checkAch(); save();
  }

  /* ---------- offline progress ---------- */
  function catchUp(sec, show) {
    sec = Math.min(sec, OFFLINE_CAP);
    if (sec < 1) return;
    const beforeCash = S.cash, beforeUsers = activeUsers, p = S.project, beforePct = p.prog / p.need;
    const arpu = ARPU * G.rev * perm();
    const k = 1 / 300, ek = Math.exp(-k * sec);
    let rev = S.legacyUsers * sec;
    for (const a of S.apps) {
      if (a.r) continue;
      rev += a.p * sec - (a.p - a.u) * (1 - ek) / k;
      a.u = a.p - (a.p - a.u) * ek;
    }
    S.cash += rev * arpu; S.life += rev * arpu;
    const rate = baseRate() * Math.max(0.4, 1 - 0.1 * p.bugs) * 0.5;
    p.prog = Math.min(p.need, p.prog + rate * sec);
    S.hype *= Math.exp(-sec / 900);
    S.stats.playSec += 0;
    sumUsers();
    projectDirty = appsDirty = upgradesDirty = true;
    if (show && sec >= 60) {
      const ready = p.prog >= p.need;
      return { sec, cash: S.cash - beforeCash, users: activeUsers - beforeUsers, pct: p.prog / p.need - beforePct, ready };
    }
    return null;
  }
  function welcome(sum) {
    const parts = [];
    if (sum) {
      parts.push(`<h2>Welcome back</h2><p>You were away for ${dur(sum.sec)}${sum.sec >= OFFLINE_CAP ? ' (agents work 8 h max while you are gone)' : ''}.</p>
      <div class="kv"><span>Revenue earned</span><b>+${money(sum.cash)}</b><span>New users</span><b>+${fmt(sum.users)}</b><span>${esc(S.project.name)}</span><b>${sum.ready ? 'ready to ship' : `+${Math.round(sum.pct * 100)}%`}</b></div>`);
    }
    if (S.daily.claimed !== dayKey()) {
      const [reward, streak] = dailyReward();
      if (!sum) parts.push(`<h2>Daily standup</h2>`);
      parts.push(`<div class="term"><span>#standup</span><br>Day ${streak} streak · +${esc(money(reward))} · +10 hype</div>
        <div class="row2"><button class="big-btn primary" id="claimDaily">Do the standup</button></div>`);
    } else if (sum) parts.push(`<div class="row2"><button class="big-btn primary" data-close>Back to work</button></div>`);
    if (!parts.length) return;
    modal(parts.join(''));
    const c = $('claimDaily');
    if (c) c.onclick = () => { closeModal(); claimDaily(null); burst(innerWidth / 2, innerHeight / 2.5, 80); };
  }
  function intro() {
    modal(`<h2>How to play</h2>
      <div class="term"><span>1.</span> Tap <b>Prompt</b> to write code faster.<br><span>2.</span> Answer permission prompts. Allow is a gamble.<br><span>3.</span> Squash bugs, ship apps, buy upgrades.<br><span>4.</span> Invite friends to share an office.</div>
      <div class="row2"><button class="big-btn primary" data-close id="introGo">Start</button></div>`);
    $('introGo').addEventListener('click', () => { S.intro = true; save(); ac(); });
  }

  /* ---------- leaderboard ---------- */
  function ludvigBoard(el, board) { try { const ui = window.Ludvig && window.Ludvig.ui; if (!ui || !el) return; el.textContent = ''; ui.board(el, { board, limit: 5 }); } catch {} }
  function ludvigOpen(board) { try { const ui = window.Ludvig && window.Ludvig.ui; if (ui) ui.open({ board }); } catch {} }
  if (window.Ludvig && window.Ludvig.ui) $('btnBoard').hidden = false;
  $('btnBoard').onclick = e => { e.currentTarget.blur(); ludvigOpen(SLUG); };
  const hasLudvig = () => typeof window.Ludvig === 'object' && window.Ludvig && typeof window.Ludvig.score === 'function';
  function maybeSubmit(v) {
    if (v > S.best) S.best = v;
    if (S.best > S.submitted * 1.0001 && now() - S.lastSubmit >= 60000 && hasLudvig() && S.best >= 1) {
      S.lastSubmit = now(); S.submitted = S.best;
      try { Promise.resolve(window.Ludvig.score(SLUG, Math.floor(S.best))).then(() => { if (currentTab === 'trophies') ludvigBoard($('tyBoard'), SLUG); }).catch(() => {}); } catch {}
    }
  }

  /* ---------- loop ---------- */
  let lastTick = now();
  const autofixT = [];
  let autoshipAt = 0, coffeeBuffDone = 0, achT = 0, saveT = 0, uiT = 0;
  function tick() {
    const t = now();
    let dt = (t - lastTick) / 1000;
    lastTick = t;
    if (dt <= 0) return;
    if (dt > 5) {
      const sum = catchUp(dt, true);
      if (sum && !modalOpen()) toast('Welcome back.', `+${money(sum.cash)} while you were away.`, 'good');
      return;
    }
    const C = calc();
    const p = S.project;
    // project progress
    if (C.rate > 0) addProgress(C.rate * dt);
    if (p.prog >= p.need && p.polish > p.need * 0.25) { p.polish = 0; if (p.bugs > 0) { p.bugs--; S.stats.fixes++; } }
    // autofix gear
    G.autofix.forEach((sec, i) => {
      autofixT[i] = (autofixT[i] || 0) + dt;
      if (autofixT[i] >= sec) { autofixT[i] = 0; if (p.bugs > 0) { p.bugs--; S.stats.fixes++; projectDirty = true; } }
    });
    // autoship
    if (G.autoship && p.prog >= p.need) {
      if (!autoshipAt) autoshipAt = t + 2500;
      else if (t >= autoshipAt) { autoshipAt = 0; ship(true); }
    } else autoshipAt = 0;
    // users and revenue
    const k = 1 - Math.exp(-dt / 300);
    for (const a of S.apps) if (!a.r) a.u += (a.p - a.u) * k;
    sumUsers();
    const inc = calc().income * dt;
    S.cash += inc; S.life += inc;
    S.hype *= Math.exp(-dt / 900);
    if (!document.hidden) S.stats.playSec += dt;
    if (officeApi().pairing) S.stats.pairSec += dt;
    // prompts and events only while someone is looking
    if (!document.hidden && !modalOpen() && S.intro) {
      if (t >= promptAt) {
        promptAt = t + rnd(20000, 38000);
        if (queue.filter(q => q.kind === 'prompt').length < 3) spawnPrompt();
      }
      if (S.stats.ships >= 1 && t >= eventAt) {
        eventAt = t + rnd(75000, 150000);
        if (!queue.some(q => q.kind === 'event')) spawnEvent();
      }
    } else if (document.hidden) { promptAt = Math.max(promptAt, t + 8000); }
    // periodic
    achT += dt; saveT += dt; uiT += dt;
    if (achT >= 1) { achT = 0; checkAch(); maybeSubmit(valuation()); renderBuffs(); }
    if (saveT >= 5) { saveT = 0; save(); }
  }
  function ui() {
    renderStats();
    renderProject();
    updateChips();
    if (currentTab === 'upgrades') { if (upgradesDirty) renderUpgrades(); else updateUpgrades(); }
    else updateUpgradesBadge();
    if (currentTab === 'apps' && appsDirty) renderApps();
    if (currentTab === 'trophies' && trophiesDirty) renderTrophies();
    const d = new Date();
    setText('clock', `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
  }
  let badgeT = 0;
  function updateUpgradesBadge() {
    if (now() - badgeT < 1000) return;
    badgeT = now();
    const o = D.OFFICES[S.office];
    const costs = [];
    if (S.agents < o.max) costs.push(agentCost());
    if (D.MODELS[S.model + 1]) costs.push(D.MODELS[S.model + 1].cost);
    if (D.OFFICES[S.office + 1]) costs.push(D.OFFICES[S.office + 1].cost);
    for (const g of D.GEAR) if (!S.gear[g.id] && !(g.req && S.office < g.req)) costs.push(g.cost);
    $('badgeUp').hidden = !costs.some(c => S.cash >= c);
  }
  let appsRefreshT = 0;
  setInterval(tick, 100);
  setInterval(() => {
    ui();
    if (currentTab === 'apps' && now() - appsRefreshT > 3000) { appsRefreshT = now(); appsDirty = true; }
  }, 150);

  /* ---------- input ---------- */
  $('btnPrompt').addEventListener('click', tapPrompt);
  $('btnShip').addEventListener('click', () => ship(false));
  document.addEventListener('keydown', e => {
    if (e.target.closest && e.target.closest('input, textarea')) return;
    if (modalOpen()) { if (e.key === 'Escape') closeModal(); return; }
    const item = queue[0];
    if (item && item.kind === 'prompt' && (e.key === 'y' || e.key === 'Y')) { e.preventDefault(); resolvePrompt(item, true); return; }
    if (item && item.kind === 'prompt' && (e.key === 'n' || e.key === 'N')) { e.preventDefault(); resolvePrompt(item, false); return; }
    if ((e.key === ' ' || e.key === 'Enter') && !(e.target.closest && e.target.closest('button'))) {
      e.preventDefault();
      if (e.repeat) return;
      if (S.project.prog >= S.project.need) ship(false); else tapPrompt();
    }
  });
  function syncSoundBtn() {
    $('btnSound').setAttribute('aria-pressed', String(S.muted));
    $('btnSound').setAttribute('aria-label', S.muted ? 'Unmute sound' : 'Mute sound');
    $('soundWave').toggleAttribute('hidden', S.muted);
    $('soundX').toggleAttribute('hidden', !S.muted);
  }
  $('btnSound').onclick = () => { S.muted = !S.muted; syncSoundBtn(); if (!S.muted) sfx.pop(); save(); };
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) save();
    else lastTick = Math.min(lastTick, now());
  });
  window.addEventListener('pagehide', () => { if (!resetting) save(); });

  /* ---------- team app reward (called by office.js) ---------- */
  function teamShip(name, partners, share) {
    const C = calc();
    share = clamp(share || 0, 0, 1);
    const need = projectNeed(S.ships);
    const cash = Math.max(500, C.income * (300 + 900 * share)) + need * 2 * G.rev;
    S.cash += cash; S.life += cash;
    gainHype(15);
    const users = Math.round(need * 3 * G.users * (1 + 0.1 * S.stock));
    S.apps.push({ n: name, u: users, p: users * 3, q: 1, t: now(), c: hashColor(name), team: 1, w: partners.slice(0, 3).join(', ') });
    trimApps();
    S.stats.teamShips++;
    sumUsers();
    sfx.ship();
    burst(innerWidth / 2, innerHeight / 3, 140);
    toast(`Team app shipped: ${name}!`, `+${money(cash)}, +${fmt(users)} users, +15 hype.`, 'good');
    appsDirty = true; checkAch(); save();
  }
  function deskStatus() {
    const p = S.project;
    return { p: p.name, pct: Math.round(clamp(p.prog / p.need, 0, 1) * 100) / 100, w: promptWaiting() ? 1 : 0,
      r: p.prog >= p.need ? 1 : 0, b: p.bugs, a: S.agents, o: S.office, m: D.MODELS[S.model].name, s: S.stats.ships };
  }

  VCT.game = {
    get S() { return S; }, calc, addBuff, toast, sfx, fmt, money, esc, floatAt, floatFrom, burst, save, unlock, checkAch,
    deskStatus, teamShip, showTab, modal, closeModal, modalOpen, officeName: () => D.OFFICES[S.office].name,
    hasCoffee: () => !!S.gear.coffee, agentName, dur,
  };

  /* ---------- boot ---------- */
  initChips();
  syncSoundBtn();
  const gap = (now() - (S.lastSeen || now())) / 1000;
  const summary = S.intro && gap > 60 ? catchUp(gap, true) : null;
  lastTick = now();
  ui();
  renderUpgrades();
  if (!S.intro) intro();
  else welcome(summary);
  save();
})();
