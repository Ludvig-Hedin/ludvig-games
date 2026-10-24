/* Horde (DEADBLOCK) pure game logic: seeded randomness, daily challenge, zombie steering helpers,
   adaptive director, quality governor, persistent unlocks and the co-op wire format.
   No DOM or three.js here, so Node tests can load it (tests/logic.test.mjs). */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.HordeLogic = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const wrapAngle = a => Math.atan2(Math.sin(a), Math.cos(a));

  /* Seeded randomness. */
  function hashString(text) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function rng(seed) {
    let a = seed >>> 0;
    return function next() {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* Daily challenge: one seed, arena and modifier per local calendar day. */
  const DAILY_MODS = [
    { id: 'swarm', name: 'Runner swarm' },
    { id: 'glass', name: 'Glass cannon' },
    { id: 'powder', name: 'Powder keg' },
    { id: 'blackout', name: 'Blackout' },
    { id: 'elite', name: 'Elite horde' },
    { id: 'scarce', name: 'Scarce supplies' },
  ];
  function dateKey(date) {
    const d = date || new Date();
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  function dailyConfig(key) {
    const seed = hashString(`horde-daily:${key}`);
    const r = rng(seed);
    const map = Math.floor(r() * 3);
    const mod = DAILY_MODS[Math.floor(r() * DAILY_MODS.length)];
    return { date: key, seed, map, mod: mod.id, modName: mod.name };
  }

  /* Waves, bosses and archetypes. */
  const KINDS = ['walker', 'runner', 'brute', 'spitter', 'screamer', 'crawler', 'butcher', 'matriarch', 'howler'];
  const BOSSES = ['butcher', 'matriarch', 'howler'];
  const isBoss = kind => BOSSES.includes(kind);
  const isBossWave = wave => wave > 0 && wave % 5 === 0;
  const bossFor = wave => BOSSES[(Math.max(1, Math.floor(wave / 5)) - 1) % BOSSES.length];
  function waveSize(wave, difficulty, players, rating) {
    let n = Math.min(100, 10 + wave * 5 + Math.floor(wave * wave * 0.38));
    if (difficulty === 0) n *= 0.8; else if (difficulty === 2) n *= 1.2;
    n *= 1 + 0.55 * Math.max(0, (players || 1) - 1);
    n *= 0.85 + 0.15 * (rating || 1);
    if (isBossWave(wave)) n *= 0.6;
    return Math.max(4, Math.round(n));
  }
  // roll in [0,1). special scales special-infected odds (director and daily modifiers).
  function pickKind(wave, roll, special, mod) {
    const w = mod === 'elite' ? wave + 4 : wave;
    const s = special || 1;
    const table = [
      ['brute', w >= 3 ? (0.05 + wave * 0.003) * s : 0],
      ['screamer', w >= 6 ? 0.04 * s : 0],
      ['spitter', w >= 4 ? 0.1 * s : 0],
      ['crawler', w >= 7 ? 0.06 : 0],
      ['runner', w >= 2 || mod === 'swarm' ? 0.14 * (mod === 'swarm' ? 2.4 : 1) : 0],
    ];
    let acc = 0;
    for (const [kind, chance] of table) { acc += chance; if (roll < acc) return kind; }
    return 'walker';
  }

  /* Steering helpers. Players: [{ id, x, z, hpFrac, alive }]. */
  function chooseTarget(x, z, players, currentId) {
    let best = null, bestCost = Infinity;
    for (const p of players) {
      if (!p.alive) continue;
      let cost = Math.hypot(p.x - x, p.z - z) * (0.6 + 0.4 * clamp(p.hpFrac, 0, 1));
      if (p.id === currentId) cost *= 0.8; // Stick with a target unless another is clearly better.
      if (cost < bestCost) { bestCost = cost; best = p; }
    }
    return best ? best.id : null;
  }
  // Zombies swing toward their own slot around the target instead of all crossing the front.
  function approachPoint(x, z, tx, tz, slot) {
    const dx = x - tx, dz = z - tz, d = Math.hypot(dx, dz);
    if (d < 3) return { x: tx, z: tz };
    const bearing = Math.atan2(dz, dx);
    const turn = clamp(wrapAngle(slot - bearing), -0.9, 0.9);
    const radius = Math.min(d * 0.6, 6.5);
    return { x: tx + Math.cos(bearing + turn) * radius, z: tz + Math.sin(bearing + turn) * radius };
  }
  function orbitPoint(x, z, tx, tz, radius, dir) {
    const a = Math.atan2(z - tz, x - tx) + dir * 0.7;
    return { x: tx + Math.cos(a) * radius, z: tz + Math.sin(a) * radius };
  }
  const slotAngle = id => (id * 2.399963) % TAU;
  // True when the target is aiming more than ~90 degrees away from the zombie.
  function lookingAway(targetAngle, tx, tz, x, z) {
    const toZombie = Math.atan2(x - tx, z - tz);
    return Math.abs(wrapAngle(toZombie - targetAngle)) > 1.6;
  }

  /* Uniform grid for neighbour queries (separation) without O(n^2). */
  function createGrid(cell, minX, minZ, maxX, maxZ, capacity) {
    const cols = Math.ceil((maxX - minX) / cell) + 1, rows = Math.ceil((maxZ - minZ) / cell) + 1;
    return { cell, minX, minZ, cols, rows, head: new Int32Array(cols * rows).fill(-1), next: new Int32Array(capacity), count: 0 };
  }
  function gridCell(g, x, z) {
    const cx = clamp(Math.floor((x - g.minX) / g.cell), 0, g.cols - 1);
    const cz = clamp(Math.floor((z - g.minZ) / g.cell), 0, g.rows - 1);
    return cx + cz * g.cols;
  }
  function gridBuild(g, items) {
    g.head.fill(-1);
    const n = Math.min(items.length, g.next.length);
    for (let i = 0; i < n; i++) { const k = gridCell(g, items[i].x, items[i].z); g.next[i] = g.head[k]; g.head[k] = i; }
    g.count = n;
  }
  function gridQuery(g, x, z, r, fn) {
    const x0 = clamp(Math.floor((x - r - g.minX) / g.cell), 0, g.cols - 1), x1 = clamp(Math.floor((x + r - g.minX) / g.cell), 0, g.cols - 1);
    const z0 = clamp(Math.floor((z - r - g.minZ) / g.cell), 0, g.rows - 1), z1 = clamp(Math.floor((z + r - g.minZ) / g.cell), 0, g.rows - 1);
    for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) {
      for (let i = g.head[cx + cz * g.cols]; i !== -1; i = g.next[i]) fn(i);
    }
  }

  /* Director: stress rises with damage and crowding, then forces a breather; calm strong teams get pushed. */
  function createDirector() { return { stress: 0, phase: 'build', t: 0, rating: 1, relaxFor: 5 }; }
  function directorUpdate(d, dt, s) {
    const hp = s.hpFrac == null ? 1 : s.hpFrac;
    d.stress = clamp(d.stress + (s.damage || 0) * 0.012 + (s.near || 0) * 0.012 * dt + (hp < 0.35 ? 0.05 * dt : 0) - 0.07 * dt, 0, 1.2);
    d.t += dt;
    if (d.phase === 'build' || d.phase === 'push') {
      if (d.stress > 0.85) { d.phase = 'peak'; d.t = 0; }
      else if (d.phase === 'build' && d.stress < 0.18 && d.t > 7) { d.phase = 'push'; d.t = 0; }
      else if (d.phase === 'push' && (d.stress > 0.5 || d.t > 10)) { d.phase = 'build'; d.t = 0; }
    } else if (d.phase === 'peak' && d.t > 2.5) { d.phase = 'relax'; d.t = 0; d.relaxFor = 4 + (1 - hp) * 4; }
    else if (d.phase === 'relax' && d.t > d.relaxFor && d.stress < 0.6) { d.phase = 'build'; d.t = 0; }
    return d.phase;
  }
  function directorParams(d) {
    const r = d.rating;
    if (d.phase === 'relax') return { rate: 0.3, cap: 0.55, special: 0.6, health: 1.8 };
    if (d.phase === 'peak') return { rate: 0.8, cap: 1, special: 1, health: 1.3 };
    if (d.phase === 'push') return { rate: 1.35 * r, cap: 1.15, special: 1.4 * r, health: 0.8 };
    return { rate: r, cap: 1, special: r, health: 1 };
  }
  // Called once per cleared wave; quick, healthy clears raise the rating, slow or bloody ones lower it.
  function directorWaveEnd(d, s) {
    const speed = clamp((s.expected || 30) / Math.max(1, s.seconds || 30), 0.4, 1.6);
    const perf = clamp(s.hpFrac, 0, 1) * 0.55 + ((speed - 0.4) / 1.2) * 0.45;
    d.rating = clamp(d.rating + (perf - 0.5) * 0.16, 0.78, 1.35);
    d.stress *= 0.3; d.phase = 'build'; d.t = 0;
    return d.rating;
  }

  /* Adaptive quality: drop a tier below 50 fps, climb back slowly after sustained headroom. */
  function createGovernor(maxTier, startTier) {
    return { tier: startTier, max: maxTier, acc: 0, frames: 0, cooldown: 2, good: 0, lastDrop: -99, t: 0 };
  }
  function governorFrame(g, dt) {
    if (!(dt > 0) || dt > 0.25) return -1; // Hidden tab or a hitch: not a performance sample.
    g.t += dt; g.acc += dt; g.frames++;
    if (g.cooldown > 0) g.cooldown -= dt;
    if (g.acc < 1.5) return -1;
    const fps = g.frames / g.acc;
    g.acc = 0; g.frames = 0;
    if (g.cooldown > 0) return -1;
    if (fps < 50 && g.tier > 0) { g.tier--; g.cooldown = 2.5; g.good = 0; g.lastDrop = g.t; return g.tier; }
    if (fps > 58.5) {
      g.good += 1.5;
      if (g.good >= 8 && g.tier < g.max && g.t - g.lastDrop > 25) { g.tier++; g.cooldown = 3; g.good = 0; return g.tier; }
    } else g.good = 0;
    return -1;
  }

  /* Persistent unlocks: survivors with a small starting perk, earned through achievements. */
  const CHARACTERS = [
    { id: 'ranger', name: 'Ranger', perk: 'Balanced', req: null, reqText: '' },
    { id: 'scout', name: 'Scout', perk: 'Faster, quicker dash', req: 'wave10', reqText: 'Reach wave 10' },
    { id: 'medic', name: 'Medic', perk: 'Stronger healing', req: 'medic', reqText: 'Revive 3 teammates or grab 30 health packs' },
    { id: 'sapper', name: 'Sapper', perk: 'More explosives', req: 'boom', reqText: '150 explosive kills' },
    { id: 'gunner', name: 'Gunner', perk: 'Starts with the SMG', req: 'boss', reqText: 'Defeat a boss' },
    { id: 'ghost', name: 'Ghost', perk: 'Critical hits', req: 'daily', reqText: 'Reach wave 5 in a daily' },
  ];
  const ACHIEVEMENTS = {
    wave10: p => p.bestWave >= 10,
    medic: p => p.revives >= 3 || p.healthPicks >= 30,
    boom: p => p.explosiveKills >= 150,
    boss: p => p.bossKills >= 1,
    daily: p => !!p.dailyWave5,
  };
  function defaultProfile() {
    return { v: 1, runs: 0, kills: 0, bestWave: 0, bossKills: 0, explosiveKills: 0, healthPicks: 0, revives: 0, coopRuns: 0, dailyWave5: false, unlocked: ['ranger'], character: 'ranger', daily: { date: '', best: 0, wave: 0 } };
  }
  function migrateProfile(raw) {
    const base = defaultProfile();
    let data = raw;
    if (typeof raw === 'string') { try { data = JSON.parse(raw); } catch { data = null; } }
    if (!data || typeof data !== 'object') return base;
    const num = (v, fallback) => (typeof v === 'number' && isFinite(v) && v >= 0 ? v : fallback);
    const out = { ...base };
    for (const key of ['runs', 'kills', 'bestWave', 'bossKills', 'explosiveKills', 'healthPicks', 'revives', 'coopRuns']) out[key] = num(data[key], 0);
    out.dailyWave5 = !!data.dailyWave5;
    const ids = CHARACTERS.map(c => c.id);
    out.unlocked = Array.isArray(data.unlocked) ? [...new Set(['ranger', ...data.unlocked.filter(id => ids.includes(id))])] : ['ranger'];
    out.character = out.unlocked.includes(data.character) ? data.character : 'ranger';
    const daily = data.daily && typeof data.daily === 'object' ? data.daily : {};
    out.daily = { date: typeof daily.date === 'string' ? daily.date : '', best: num(daily.best, 0), wave: num(daily.wave, 0) };
    return out;
  }
  // Returns ids of survivors unlocked by the profile's current totals (and records them).
  function grantUnlocks(profile) {
    const fresh = [];
    for (const c of CHARACTERS) {
      if (!c.req || profile.unlocked.includes(c.id)) continue;
      if (ACHIEVEMENTS[c.req](profile)) { profile.unlocked.push(c.id); fresh.push(c.id); }
    }
    return fresh;
  }
  function recordRun(profile, run) {
    profile.runs += 1;
    profile.kills += run.kills || 0;
    profile.bestWave = Math.max(profile.bestWave, run.wave || 0);
    profile.bossKills += run.bossKills || 0;
    profile.explosiveKills += run.explosiveKills || 0;
    profile.healthPicks += run.healthPicks || 0;
    profile.revives += run.revives || 0;
    if (run.coop) profile.coopRuns += 1;
    if (run.daily) {
      if (profile.daily.date !== run.daily) profile.daily = { date: run.daily, best: 0, wave: 0 };
      profile.daily.best = Math.max(profile.daily.best, run.score || 0);
      profile.daily.wave = Math.max(profile.daily.wave, run.wave || 0);
      if ((run.wave || 0) >= 5) profile.dailyWave5 = true;
    }
    return grantUnlocks(profile);
  }

  /* Upgrade offers: weighted picks without repeats, skipping maxed upgrades. */
  function pickUpgrades(pool, counts, rand, n) {
    const left = pool.filter(u => (counts[u.id] || 0) < (u.max || 99));
    const out = [];
    while (out.length < n && left.length) {
      const total = left.reduce((s, u) => s + (u.weight || 1), 0);
      let r = rand() * total, i = 0;
      for (; i < left.length - 1; i++) { r -= left[i].weight || 1; if (r < 0) break; }
      out.push(left.splice(i, 1)[0]);
    }
    return out;
  }

  /* Co-op wire format. Zombies travel as a flat integer array: id, x*10, z*10, angle*20, hp%, kind, flags. */
  const ZSTRIDE = 7;
  const FLAGS = { spawning: 1, telegraph: 2, charging: 4, buffed: 8, stunned: 16, scream: 32, burning: 64 };
  function packZombies(list, limit) {
    const out = [];
    const n = Math.min(list.length, limit || list.length);
    for (let i = 0; i < n; i++) {
      const e = list[i];
      out.push(e.id, Math.round(e.x * 10), Math.round(e.z * 10), Math.round(wrapAngle(e.angle) * 20),
        clamp(Math.ceil(e.hp / e.maxHp * 100), 0, 100), Math.max(0, KINDS.indexOf(e.kind)), e.flags | 0);
    }
    return out;
  }
  function unpackZombies(arr) {
    const out = [];
    if (!Array.isArray(arr)) return out;
    for (let i = 0; i + ZSTRIDE <= arr.length; i += ZSTRIDE) {
      const kind = KINDS[arr[i + 5]];
      if (!kind || !isFinite(arr[i]) || !isFinite(arr[i + 1]) || !isFinite(arr[i + 2])) continue;
      out.push({ id: arr[i], x: arr[i + 1] / 10, z: arr[i + 2] / 10, a: arr[i + 3] / 20, hp: clamp(arr[i + 4], 0, 100), kind, flags: arr[i + 6] | 0 });
    }
    return out;
  }
  const normalizeCode = text => String(text || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  function inviteCode(search) {
    try { return normalizeCode(new URLSearchParams(search).get('horde')); } catch { return ''; }
  }

  /* Snapshot interpolation: keep the last few samples, render slightly in the past. */
  function createInterp() { return { t: [], x: [], z: [], a: [] }; }
  function interpPush(b, t, x, z, a) {
    b.t.push(t); b.x.push(x); b.z.push(z); b.a.push(a);
    if (b.t.length > 4) { b.t.shift(); b.x.shift(); b.z.shift(); b.a.shift(); }
  }
  function interpSample(b, t) {
    const n = b.t.length;
    if (!n) return null;
    if (n === 1 || t >= b.t[n - 1]) return { x: b.x[n - 1], z: b.z[n - 1], a: b.a[n - 1] };
    if (t <= b.t[0]) return { x: b.x[0], z: b.z[0], a: b.a[0] };
    let i = n - 2;
    while (i > 0 && b.t[i] > t) i--;
    const span = b.t[i + 1] - b.t[i] || 1, k = clamp((t - b.t[i]) / span, 0, 1);
    return { x: b.x[i] + (b.x[i + 1] - b.x[i]) * k, z: b.z[i] + (b.z[i + 1] - b.z[i]) * k, a: b.a[i] + wrapAngle(b.a[i + 1] - b.a[i]) * k };
  }

  return {
    TAU, clamp, wrapAngle, hashString, rng, DAILY_MODS, dateKey, dailyConfig,
    KINDS, BOSSES, isBoss, isBossWave, bossFor, waveSize, pickKind,
    chooseTarget, approachPoint, orbitPoint, slotAngle, lookingAway,
    createGrid, gridBuild, gridQuery,
    createDirector, directorUpdate, directorParams, directorWaveEnd,
    createGovernor, governorFrame,
    CHARACTERS, defaultProfile, migrateProfile, grantUnlocks, recordRun, pickUpgrades,
    ZSTRIDE, FLAGS, packZombies, unpackZombies, normalizeCode, inviteCode,
    createInterp, interpPush, interpSample,
  };
});
