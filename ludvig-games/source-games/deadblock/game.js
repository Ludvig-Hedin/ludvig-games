/* DEADBLOCK / Horde: original procedural art, gameplay and audio. Three.js is MIT licensed (THREE-LICENSE.txt).
   Solo and online co-op for 2-4 players through Ludvig.mp. Pure rules live in logic.js (window.HordeLogic).
   Co-op model: every player simulates their own survivor; the room host (oldest peer) owns zombies, waves,
   drops and barrels, and broadcasts a compact snapshot at 10 Hz. Clients send pose, shots and hits at 10 Hz. */
window.bootDeadblock = function bootDeadblock() {
'use strict';
const T = window.THREE, L = window.HordeLogic;
if (!T || !L) throw new Error('The game files did not load. Reload the page.');
const $ = id => document.getElementById(id), clamp = L.clamp, lerp = (a, b, t) => a + (b - a) * t;
const rand = (a = 0, b = 1) => a + Math.random() * (b - a), ri = (a, b) => Math.floor(rand(a, b + 1));
const TAU = Math.PI * 2, coarse = matchMedia('(pointer:coarse)').matches;
const Lud = () => window.Ludvig || null;
// Gameplay randomness that must match across a daily run uses runRng; arena layout uses worldRng.
let runRng = Math.random, worldRng = Math.random;
const rr = (a = 0, b = 1) => a + runRng() * (b - a), wr = (a = 0, b = 1) => a + worldRng() * (b - a);
const idRand = (id, k) => L.hashString(id + ':' + k) / 4294967296;
const shortestAngle = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
function safeGet(key, fallback) { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } }
function safeSet(key, value) { try { localStorage.setItem(key, value); } catch { /* Storage blocked. */ } }
const QUALITY_NAMES = ['Auto', 'High', 'Balanced', 'Low'];
const settings = (() => {
  let s = {}; try { s = JSON.parse(safeGet('deadblock-settings', '{}')) || {}; } catch { s = {}; }
  return { quality: QUALITY_NAMES.includes(s.quality) ? s.quality : 'Auto', shake: s.shake !== false };
})();
const saveSettings = () => safeSet('deadblock-settings', JSON.stringify(settings));
const profile = L.migrateProfile(safeGet('deadblock-profile', null));
const saveProfile = () => safeSet('deadblock-profile', JSON.stringify(profile));

/* Renderer, lights and adaptive quality. */
const canvas = $('world'), scene = new T.Scene();
scene.background = new T.Color('#152027'); scene.fog = new T.FogExp2('#152027', .012);
let renderer;
try { renderer = new T.WebGLRenderer({ canvas, antialias: !(coarse && devicePixelRatio >= 2.5), alpha: false, powerPreference: 'high-performance' }); }
catch (e) { throw new Error('WebGL is unavailable. Enable hardware acceleration and reload.'); }
renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
renderer.outputColorSpace = T.SRGBColorSpace; renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.22;
const camera = new T.OrthographicCamera(-25, 25, 16, -16, .1, 160);
const camOffset = new T.Vector3(22, 36, 28), camTarget = new T.Vector3(), camRight = new T.Vector3(28, 0, -22).normalize(), camDown = new T.Vector3(22, 0, 28).normalize();
const raycaster = new T.Raycaster(), aimPlane = new T.Plane(new T.Vector3(0, 1, 0), -1), aimPoint = new T.Vector3(0, 1, 8), v3 = new T.Vector3();
const hemi = new T.HemisphereLight('#bcd8e3', '#4f5c49', 1.8); scene.add(hemi);
const sun = new T.DirectionalLight('#ffdcae', 3.1); sun.position.set(-14, 24, -10); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -33, right: 33, top: 32, bottom: -32, near: 1, far: 80 }); sun.shadow.normalBias = .04; sun.shadow.bias = -.00018; scene.add(sun);
const sunTarget = new T.Object3D(); scene.add(sunTarget); sun.target = sunTarget;
const rim = new T.DirectionalLight('#85b9d7', 1.3); rim.position.set(14, 12, 18); scene.add(rim);
const playerLight = new T.PointLight('#ffad56', 0, 5, 2); scene.add(playerLight);
// Tier 3 High, 2 Balanced, 1 Low, 0 Lowest (Auto only). DPR is always capped at 2.
const TIERS = [
  { dpr: .8, shadow: 0, particles: .45, dust: 0, mist: false, upload: 600 },
  { dpr: 1, shadow: 0, particles: .6, dust: .4, mist: false, upload: 450 },
  { dpr: 1.5, shadow: 1024, particles: .85, dust: .8, mist: false, upload: 300 },
  { dpr: 2, shadow: 2048, particles: 1, dust: 1, mist: true, upload: 250 },
];
const fixedTier = { High: 3, Balanced: 2, Low: 1 };
const governor = L.createGovernor(3, coarse ? 2 : 3);
let tier = -1, fps = 60, fpsAcc = 0, fpsFrames = 0;
function applyTier(t) {
  t = clamp(t, 0, 3); const q = TIERS[t], had = renderer.shadowMap.enabled;
  tier = t; renderer.setPixelRatio(Math.min(devicePixelRatio || 1, q.dpr, 2));
  renderer.shadowMap.enabled = q.shadow > 0;
  if (q.shadow && sun.shadow.mapSize.x !== q.shadow) { sun.shadow.mapSize.set(q.shadow, q.shadow); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
  if (had !== renderer.shadowMap.enabled) scene.traverse(o => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.needsUpdate = true); });
  if (dust) dust.geometry.setDrawRange(0, Math.floor(DUST * q.dust));
  for (const m of mist) m.visible = q.mist;
  resize();
}

/* Shared geometry, textures and materials. */
const unitBox = new T.BoxGeometry(1, 1, 1), unitPlane = new T.PlaneGeometry(1, 1), cylinderGeo = new T.CylinderGeometry(.48, .48, 1.12, 12);
const tireGeo = new T.TorusGeometry(.32, .13, 6, 14), coneGeo = new T.ConeGeometry(.17, .5, 8), wheelGeo = new T.CylinderGeometry(.36, .36, .26, 12);
const bandGeo = new T.CylinderGeometry(.493, .493, .095, 12), lidGeo = new T.CylinderGeometry(.47, .47, .045, 12), stripeGeo = new T.CylinderGeometry(.486, .486, .26, 12, 1, true);
const ringGeo = new T.RingGeometry(.53, .58, 40), discGeo = new T.CircleGeometry(.5, 28), shockGeo = new T.RingGeometry(.92, 1, 48), effectSphere = new T.SphereGeometry(1, 10, 8), pickRingGeo = new T.RingGeometry(.38, .41, 24);
const SHARED_GEO = new Set([unitBox, unitPlane, cylinderGeo, tireGeo, coneGeo, wheelGeo]);
const colorCache = new Map(), spriteCache = new Map();
function texture(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t; }
// Subtle roughness variation for every lit surface (green channel drives roughness in three.js).
const roughTex = texture(128, 128, (c, w, h) => { const img = c.createImageData(w, h); for (let i = 0; i < img.data.length; i += 4) { const blot = Math.sin(i * .0007) * 18; const v = clamp(205 + (Math.random() - .5) * 70 + blot, 140, 255); img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; } c.putImageData(img, 0, 0); });
roughTex.colorSpace = T.NoColorSpace; roughTex.wrapS = roughTex.wrapT = T.RepeatWrapping;
const glowTex = texture(128, 128, (c, w) => { const g = c.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.12, 'rgba(255,247,204,.8)'); g.addColorStop(.4, 'rgba(255,221,142,.25)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, w, w); });
const poolTex = texture(128, 128, (c, w) => { const g = c.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(255,255,255,.9)'); g.addColorStop(.45, 'rgba(255,255,255,.35)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, w, w); });
const shadowTex = texture(128, 128, c => { const g = c.createRadialGradient(64, 64, 6, 64, 64, 64); g.addColorStop(0, 'rgba(0,0,0,.42)'); g.addColorStop(.55, 'rgba(0,0,0,.17)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(0, 0, 128, 128); });
const shadowMat = new T.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: .75 });
const SHARED_TEX = new Set([roughTex, glowTex, poolTex, shadowTex]);
function mat(color, emissive = 0, rough = 1, metal = .06) {
  const key = color + ':' + emissive + ':' + rough + ':' + metal;
  let m = colorCache.get(key);
  if (!m) { m = new T.MeshStandardMaterial({ color, roughness: rough, roughnessMap: roughTex, metalness: metal, emissive: emissive || 0, emissiveIntensity: emissive ? 1.4 : 0 }); colorCache.set(key, m); }
  return m;
}
function meshAt(parent, geo, material, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, cast = true) { const m = new T.Mesh(geo, material); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.scale.set(sx, sy, sz); m.castShadow = cast; m.receiveShadow = true; parent.add(m); return m; }
function box(parent, x, y, z, w, h, d, color, rotation = 0) { return meshAt(parent, unitBox, typeof color === 'object' ? color : mat(color), x, y, z, 0, rotation, 0, w, h, d); }
function newGroup(parent, x = 0, y = 0, z = 0) { const g = new T.Group(); g.position.set(x, y, z); parent.add(g); return g; }
function shadow(parent, x, z, w, d) { const m = new T.Mesh(unitPlane, shadowMat); m.rotation.x = -Math.PI / 2; m.position.set(x, .018, z); m.scale.set(w, d, 1); parent.add(m); return m; }
function spriteMat(color) { let m = spriteCache.get(color); if (!m) { m = new T.SpriteMaterial({ map: glowTex, color, transparent: true, blending: T.AdditiveBlending, depthWrite: false, opacity: .75 }); spriteCache.set(color, m); } return m; }
function glow(parent, x, y, z, color, size = 1, own = false) { const m = new T.Sprite(own ? new T.SpriteMaterial({ map: glowTex, color, transparent: true, blending: T.AdditiveBlending, depthWrite: false, opacity: .75 }) : spriteMat(color)); m.position.set(x, y, z); m.scale.setScalar(size); m.userData.ownMat = own; parent.add(m); return m; }
function lightPool(parent, x, z, size, color, opacity) { const m = new T.Mesh(unitPlane, new T.MeshBasicMaterial({ map: poolTex, color, transparent: true, opacity, blending: T.AdditiveBlending, depthWrite: false })); m.material.userData.own = true; m.rotation.x = -Math.PI / 2; m.position.set(x, .03, z); m.scale.set(size, size, 1); parent.add(m); return m; }
function label(parent, text, x, y, z, w, h, color = '#a8b5a6', bg = null, rot = -Math.PI / 2) { const t = texture(512, 128, (c, W, H) => { if (bg) { c.fillStyle = bg; c.fillRect(0, 0, W, H); } c.fillStyle = color; c.font = 'bold 58px Arial'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, W / 2, H / 2); }); const m = new T.Mesh(unitPlane, new T.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, side: T.DoubleSide })); m.material.userData.own = true; m.position.set(x, y, z); m.rotation.x = rot; m.scale.set(w, h, 1); parent.add(m); return m; }

/* Audio: all synthesized locally. */
const audio = { ctx: null, master: null, muted: false, ready: false,
  init() { if (this.ctx) { this.ctx.resume().catch(() => {}); return; } try { const C = window.AudioContext || window.webkitAudioContext; if (!C) return; this.ctx = new C(); const comp = this.ctx.createDynamicsCompressor(); comp.threshold.value = -22; comp.knee.value = 22; comp.ratio.value = 7; comp.attack.value = .005; comp.release.value = .14; this.master = this.ctx.createGain(); this.master.gain.value = this.muted ? 0 : .34; this.master.connect(comp); comp.connect(this.ctx.destination); this.noiseBuffer = this.ctx.createBuffer(1, this.ctx.sampleRate * 2, this.ctx.sampleRate); const a = this.noiseBuffer.getChannelData(0); let last = 0; for (let i = 0; i < a.length; i++) { last = (last + Math.random() * 2 - 1) * .48; a[i] = last; } this.ready = true; this.ambient(); } catch (e) { console.warn('Audio unavailable', e); } },
  tone(freq, end, duration, volume = .1, type = 'sine', delay = 0) { if (!this.ctx || this.muted) return; const t = this.ctx.currentTime + delay, o = this.ctx.createOscillator(), g = this.ctx.createGain(); o.type = type; o.frequency.setValueAtTime(freq, t); o.frequency.exponentialRampToValueAtTime(Math.max(10, end), t + duration); g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(.0002, volume), t + .005); g.gain.exponentialRampToValueAtTime(.0001, t + duration); o.connect(g); g.connect(this.master); o.start(t); o.stop(t + duration + .015); o.onended = () => { o.disconnect(); g.disconnect(); }; },
  noise(duration, volume, freq = 1600, kind = 'lowpass', delay = 0) { if (!this.ctx || this.muted) return; const t = this.ctx.currentTime + delay, s = this.ctx.createBufferSource(), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain(); s.buffer = this.noiseBuffer; f.type = kind; f.frequency.value = freq; g.gain.setValueAtTime(Math.max(.0001, volume), t); g.gain.exponentialRampToValueAtTime(.0001, t + duration); s.connect(f); f.connect(g); g.connect(this.master); s.start(t, rand(0, .9)); s.stop(t + duration + .01); s.onended = () => { s.disconnect(); f.disconnect(); g.disconnect(); }; },
  shot(kind, v = 1) {
    if (kind === 'pistol') { this.noise(.13, .85 * v, 4200); this.tone(165, 49, .12, .31 * v, 'triangle'); this.noise(.22, .12 * v, 1400, 'lowpass', .018); }
    else if (kind === 'smg') { this.noise(.07, .59 * v, 5100); this.tone(155, 66, .065, .23 * v, 'triangle'); }
    else if (kind === 'shotgun') { this.noise(.32, 1 * v, 2600); this.tone(115, 28, .26, .85 * v); this.noise(.12, .2 * v, 6600, 'highpass', .24); }
    else if (kind === 'flame') { this.noise(.11, .22 * v, 900); }
    else if (kind === 'rocket') { this.noise(.36, .7 * v, 1500); this.tone(240, 48, .32, .3 * v, 'sawtooth'); }
    else if (kind === 'rail') { this.tone(1400, 120, .35, .25 * v, 'sawtooth'); this.noise(.3, .5 * v, 7000, 'highpass'); this.tone(90, 40, .3, .5 * v); }
    else { this.noise(.065, .55 * v, 2800); this.tone(120, 55, .055, .24 * v, 'triangle'); }
  },
  boom(v = 1) { this.noise(.95, 1.2 * v, 1100); this.noise(.28, .6 * v, 3700); this.tone(90, 18, .65, 1.25 * v); },
  hit() { this.noise(.055, .22, 900); this.tone(80, 32, .065, .13); },
  hurt() { this.noise(.2, .6, 600); this.tone(140, 40, .3, .5, 'triangle'); },
  dash() { this.noise(.2, .3, 4000); this.tone(200, 60, .19, .12, 'sine'); },
  click() { this.tone(750, 490, .06, .07, 'square'); },
  pickup() { this.tone(660, 820, .1, .16); this.tone(980, 1150, .13, .12, 'sine', .08); },
  reload() { this.noise(.09, .25, 4800, 'highpass'); this.noise(.1, .24, 4000, 'highpass', .22); },
  wave() { this.tone(92, 82, .6, .28, 'sawtooth'); this.tone(138, 123, .6, .18, 'sawtooth', .04); this.tone(185, 165, .65, .1, 'triangle', .08); },
  unlock() { [330, 440, 660, 880].forEach((n, i) => this.tone(n, n, .16, .12, 'triangle', i * .07)); },
  groan() { this.tone(rand(85, 135), rand(40, 60), .6, .075, 'sawtooth'); this.noise(.55, .04, 450); },
  scream() { this.tone(900, 420, .7, .12, 'sawtooth'); this.tone(1240, 600, .6, .07, 'square', .05); this.noise(.6, .12, 3000, 'bandpass'); },
  charge() { this.tone(70, 40, .7, .4, 'sawtooth'); this.noise(.5, .25, 500); },
  roar() { this.tone(60, 30, 1.4, .5, 'sawtooth'); this.tone(90, 45, 1.2, .3, 'square', .1); this.noise(1.2, .3, 700); },
  revive() { [440, 550, 660].forEach((n, i) => this.tone(n, n * 1.02, .2, .12, 'sine', i * .09)); },
  zap() { this.tone(2200, 600, .12, .06, 'square'); },
  ambient() { if (!this.ctx) return; const o = this.ctx.createOscillator(), g = this.ctx.createGain(); o.type = 'sine'; o.frequency.value = 48; g.gain.value = .027; o.connect(g); g.connect(this.master); o.start(); this.drone = o; },
  toggle() { this.muted = !this.muted; if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : .34, this.ctx.currentTime, .07); $('soundBtn').innerHTML = '<svg class="icon"><use href="#' + (this.muted ? 'muted' : 'volume') + '"/></svg>'; $('soundBtn').setAttribute('aria-label', this.muted ? 'Enable sound' : 'Mute sound'); safeSet('deadblock-muted', String(this.muted)); },
};
if (safeGet('deadblock-muted', 'false') === 'true') audio.toggle();
let best = Number(safeGet('deadblock-best', '0')) || 0; $('menuBest').textContent = String(best).padStart(5, '0');

/* Run state. */
let state = 'menu', difficulty = 1, mapId = 0, time = 0, runTime = 0, lastTime = 0, accumulator = 0;
let score = 0, kills = 0, wave = 0, spawnLeft = 0, spawnTimer = 0, waveTotal = 0, waveKilled = 0, waveBreak = -1, waveStart = 0, chain = 0, chainTimer = 0;
let announceTimer = 0, toastTimer = 0, hitTimer = 0, damageFlash = 0, shake = 0, zoomKick = 0, bossPending = false, bossDelay = 0;
let pendingUpgrade = false, upgradeChoices = [], upgradeRare = false, demoTimer = 0, navTimer = 0, uiTimer = 0, footTimer = 0, nearbySoundTimer = 0, regenTimer = 0;
const menuPrefs = { map: 0, diff: 1 };
let daily = null, runMod = '', director = L.createDirector(), damageThisStep = 0, upCounts = {};
let runStats = { bossKills: 0, explosiveKills: 0, healthPicks: 0, revives: 0, downs: 0 }, freshUnlocks = [];
let worldRoot = new T.Group(); scene.add(worldRoot);
let obstacles = [], barrels = [], enemies = [], projectiles = [], grenades = [], pickups = [], effects = [], floatTexts = [], explosionQueue = [], hazards = [], corpses = [], drones = [];
const bounds = { x: 21, z: 16 }, maxEnemies = 105, COOP_CAP = 80, zMap = new Map(), burns = new Map();
let nextZid = 1, nextPid = 1, barrelSeq = 0;
const player = { x: 0, z: 5, r: .39, hp: 100, maxHp: 100, angle: 0, aim: 0, feet: 0, move: 0, walk: 0, vx: 0, vz: 0, shot: 0, reload: 0, reloading: false, gun: 0, recoil: 0, invuln: 0, dashCD: 0, dashTime: 0, dashX: 0, dashZ: 0, grenades: 3, barrels: 3, grenadeCD: 0, barrelCD: 0, status: 'alive', bleed: 0, rev: 0, shots: 0 };
const weaponDefs = [
  { id: 'pistol', name: 'Pistol', need: 0, mag: 12, fire: .19, reload: .9, damage: 28, range: 32, spread: .012, pellets: 1, kick: .14, noise: 12, gs: [1, 1, .72], svg: 'M4 8h39v8H26l-3 16H12l3-15H4zM34 4h7v4h-7z' },
  { id: 'smg', name: 'SMG', need: 8, mag: 36, fire: .077, reload: 1.15, damage: 20, range: 30, spread: .065, pellets: 1, kick: .10, noise: 15, gs: [1, 1, 1], svg: 'M4 9h34v5h10v5H31l-3 14h-7l2-14h-7l-3 12H6l3-14H4z' },
  { id: 'shotgun', name: 'Shotgun', need: 25, mag: 8, fire: .57, reload: 1.3, damage: 24, range: 21, spread: .25, pellets: 8, kick: .4, noise: 18, gs: [1, 1, 1.5], svg: 'M3 12h49v5H23l-4 7h-9L3 29V12zm24 6h16v4H27z' },
  { id: 'flame', name: 'Flamer', need: 40, mag: 90, fire: .06, reload: 1.6, damage: 7, range: 6.6, spread: .42, pellets: 0, kick: .03, noise: 9, burn: 14, gs: [1.3, 1.2, 1.25], svg: 'M3 13h30V9h8v4h6l6 3-6 3h-6v4h-8v-4H22l-3 11h-8l3-11H3z' },
  { id: 'rocket', name: 'Rocket', need: 55, mag: 3, fire: .85, reload: 1.65, damage: 170, range: 34, spread: 0, pellets: 1, kick: .4, noise: 20, gs: [1.5, 1, 1], svg: 'M1 12h9V9h28l11 7-11 7H20l-2 9h-6l2-10h-4v-3H1z' },
  { id: 'minigun', name: 'Minigun', need: 95, mag: 100, fire: .045, reload: 1.9, damage: 25, range: 34, spread: .075, pellets: 1, kick: .12, noise: 18, gs: [1.3, 1, 1.4], svg: 'M4 10h16V7h8v5h25v4H28v4h25v4H28v4H10v-4H4zm7 18h8v6h-8z' },
  { id: 'rail', name: 'Railgun', need: 140, mag: 4, fire: .95, reload: 1.8, damage: 240, range: 42, spread: 0, pellets: 1, kick: .45, noise: 16, gs: [1.1, 1, 1.6], svg: 'M2 14h44l8 3-8 3H30l-4 12h-8l3-12H2zM10 9h28v3H10zM10 22h20v2H10z' },
];
const ammo = weaponDefs.map(w => w.mag);
const W = id => weaponDefs.findIndex(w => w.id === id);
function cap(i) { return Math.ceil(weaponDefs[i].mag * player.mag); }
function unlocked(i) { return kills >= weaponDefs[i].need || (i === 1 && player.smgFree); }
function buildDock() {
  $('weaponDock').innerHTML = weaponDefs.map((w, i) => '<button class="weapon ' + (i === 0 ? 'active' : 'locked') + '" id="weapon' + i + '" data-weapon="' + i + '" title="' + w.name + ' · ' + (i + 1) + (w.need ? ' · ' + w.need + ' kills to unlock' : '') + '" aria-label="' + w.name + '"><span class="num">' + (i + 1) + '</span><svg class="gun" viewBox="0 0 56 38"><path d="' + w.svg + '"/></svg><span class="name">' + w.name + '</span><span class="requirement">' + (w.need ? '<svg><use href="#lock"/></svg>' + w.need : '') + '</span></button>').join('');
  document.querySelectorAll('[data-weapon]').forEach(b => b.onclick = () => switchWeapon(+b.dataset.weapon));
}
buildDock();

/* Survivors (persistent unlocks) and their palettes. */
const SURVIVORS = {
  ranger: { jacket: '#dd773d', arm: '#e88c4b', trim: '#e3944c', pants: '#293d40', boots: '#182c31', head: '#cab591', hair: '#3a504d', hair2: '#364d48', visor: '#1a3439', scarf: '#db6c37', ring: '#ffb263' },
  scout: { jacket: '#3f8f80', arm: '#4ea393', trim: '#6cc0ad', pants: '#2b3a3e', boots: '#1a2a2e', head: '#c9a983', hair: '#2d3b2f', hair2: '#26332a', visor: '#13282b', scarf: '#e0c46a', ring: '#7fe0c9' },
  medic: { jacket: '#e6e2d3', arm: '#f2efe4', trim: '#c94a3c', pants: '#3a4a52', boots: '#20303a', head: '#d6b896', hair: '#5b4636', hair2: '#4c3a2d', visor: '#1a3439', scarf: '#c94a3c', ring: '#ff9a90' },
  sapper: { jacket: '#7c6b3d', arm: '#8e7c48', trim: '#c9a24a', pants: '#3d3a2c', boots: '#221f17', head: '#b9976f', hair: '#55603f', hair2: '#4a5437', visor: '#2a2a1b', scarf: '#d0882c', ring: '#ffd36a' },
  gunner: { jacket: '#56688c', arm: '#6a7ca2', trim: '#9fb3d9', pants: '#2b3245', boots: '#171c28', head: '#c4a07c', hair: '#2a2f3a', hair2: '#232833', visor: '#0f1a2c', scarf: '#8fb0ff', ring: '#9fc0ff' },
  ghost: { jacket: '#3b4048', arm: '#464c56', trim: '#9aa3ad', pants: '#23272d', boots: '#14171b', head: '#e4e2da', hair: '#1c1f24', hair2: '#181b20', visor: '#7fd1e0', scarf: '#b8c4cf', ring: '#d6e6f2' },
};
const CHAR_IDS = L.CHARACTERS.map(c => c.id);
let charId = profile.character;

/* Arena floor: procedural concrete, paint, cracks and persistent stains. Smaller canvas on phones. */
let floorCanvas, floorCtx, floorTexture;
const MAP_NAMES = ['The Yard', 'Crossfire', 'Killbox'], DIFF_NAMES = ['Casual', 'Normal', 'Brutal'];
function makeFloor() {
  const k = coarse ? .5 : 1, Wd = 2048, Hd = 1536;
  floorCanvas = document.createElement('canvas'); floorCanvas.width = Wd * k; floorCanvas.height = Hd * k;
  const c = floorCtx = floorCanvas.getContext('2d');
  c.fillStyle = '#65716b'; c.fillRect(0, 0, floorCanvas.width, floorCanvas.height);
  const img = c.getImageData(0, 0, floorCanvas.width, floorCanvas.height), a = img.data;
  for (let i = 0; i < a.length; i += 4) { const n = (Math.random() - .5) * 12; a[i] += n; a[i + 1] += n; a[i + 2] += n; }
  c.putImageData(img, 0, 0); c.setTransform(k, 0, 0, k, 0, 0);
  const cell = 128; c.lineWidth = 2;
  for (let y = 0; y < Hd; y += cell) for (let x = 0; x < Wd; x += cell) { c.fillStyle = worldRng() > .5 ? 'rgba(232,235,208,.018)' : 'rgba(10,24,28,.025)'; c.fillRect(x + 2, y + 2, cell - 4, cell - 4); c.strokeStyle = 'rgba(21,34,34,.20)'; c.strokeRect(x, y, cell, cell); c.fillStyle = 'rgba(221,224,205,.07)'; c.fillRect(x + 2, y + 2, cell - 4, 1); }
  for (let i = 0; i < 7; i++) { c.save(); c.translate(wr(100, Wd - 100), wr(100, Hd - 100)); c.rotate(wr(-.2, .2)); c.fillStyle = worldRng() > .5 ? 'rgba(150,158,140,.10)' : 'rgba(30,40,40,.10)'; c.fillRect(-wr(60, 140), -wr(40, 90), wr(120, 280), wr(80, 180)); c.restore(); }
  for (let i = 0; i < 65; i++) { const x = wr(0, Wd), y = wr(0, Hd), r = wr(10, 85); const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, 'rgba(11,24,27,.12)'); g.addColorStop(1, 'rgba(11,24,27,0)'); c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2); }
  for (let i = 0; i < 12; i++) { const x = wr(0, Wd), y = wr(0, Hd), r = wr(30, 90); const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, 'rgba(8,14,16,.30)'); g.addColorStop(.7, 'rgba(8,14,16,.10)'); g.addColorStop(1, 'rgba(8,14,16,0)'); c.save(); c.translate(x, y); c.scale(1, wr(.45, .8)); c.translate(-x, -y); c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2); c.restore(); }
  c.lineCap = 'round';
  for (let i = 0; i < 30; i++) { let x = wr(0, Wd), y = wr(0, Hd), ang = wr(0, TAU); c.strokeStyle = 'rgba(16,26,26,' + wr(.22, .42).toFixed(2) + ')'; c.lineWidth = wr(1.2, 3); c.beginPath(); c.moveTo(x, y); for (let s = 0; s < 6; s++) { ang += wr(-.7, .7); x += Math.cos(ang) * wr(16, 50); y += Math.sin(ang) * wr(16, 50); c.lineTo(x, y); if (worldRng() < .25) { c.moveTo(x, y); c.lineTo(x + Math.cos(ang + 1.2) * 18, y + Math.sin(ang + 1.2) * 18); c.moveTo(x, y); } } c.stroke(); }
  c.setLineDash([60, 30]); c.strokeStyle = 'rgba(15,22,22,.10)'; c.lineWidth = 16;
  for (let i = 0; i < 3; i++) { c.beginPath(); c.ellipse(wr(400, 1600), wr(300, 1200), wr(300, 700), wr(150, 380), wr(0, 3), 0, wr(1, 2.4)); c.stroke(); }
  c.setLineDash([]);
  c.strokeStyle = '#afb19470'; c.lineWidth = 7; c.setLineDash([38, 28]); c.strokeRect(70, 70, Wd - 140, Hd - 140); c.setLineDash([]);
  c.strokeStyle = '#25353330'; c.lineWidth = 11; for (let i = 0; i < 3; i++) { c.beginPath(); c.ellipse(1180, 840, 580 + i * 26, 370 + i * 18, -.25, 0, Math.PI * 1.3); c.stroke(); }
  c.fillStyle = '#c7c5a044'; c.font = 'bold 48px Arial'; c.textAlign = 'center'; c.save(); c.translate(Wd / 2, Hd / 2); c.rotate(-Math.PI / 2); c.fillText(['QUARANTINE / SECTOR 01', 'CROSSFIRE / SECTOR 02', 'CONTAINMENT / SECTOR 03'][mapId], 0, 0); c.restore();
  c.strokeStyle = '#d4cba36b'; c.lineWidth = 5; c.strokeRect(908, 927, 236, 213); c.fillStyle = '#d3c8a064'; c.font = 'bold 42px Arial'; c.fillText('HOLD', 1026, 1048);
  for (const [x, y, rot] of [[Wd / 2, 35, 0], [Wd / 2, Hd - 35, Math.PI], [35, Hd / 2, -Math.PI / 2], [Wd - 35, Hd / 2, Math.PI / 2]]) { c.save(); c.translate(x, y); c.rotate(rot); c.fillStyle = '#e6ab66'; for (let i = -3; i <= 3; i++) { c.beginPath(); c.moveTo(i * 25 - 12, -12); c.lineTo(i * 25 + 1, -12); c.lineTo(i * 25 + 12, 12); c.lineTo(i * 25 - 1, 12); c.fill(); } c.restore(); }
  for (let i = 0; i < 140; i++) { c.fillStyle = worldRng() > .5 ? 'rgba(220,215,190,.12)' : 'rgba(30,28,20,.14)'; c.fillRect(wr(0, Wd), wr(0, Hd), wr(2, 6), wr(2, 5)); }
  floorTexture = new T.CanvasTexture(floorCanvas); floorTexture.colorSpace = T.SRGBColorSpace; floorTexture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const ground = new T.Mesh(new T.PlaneGeometry(44, 33), new T.MeshStandardMaterial({ map: floorTexture, roughness: 1, roughnessMap: roughTex, metalness: 0 })); ground.material.userData.own = true; ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; worldRoot.add(ground);
  box(worldRoot, 0, -.46, 0, 44, .88, 33, '#243334'); box(worldRoot, 0, -1.12, 0, 44.5, .45, 33.5, '#152227');
}
/* Stains are instanced decals lying on the floor. Painting them into the 2048 px floor canvas meant re-uploading
   the whole texture every few hundred ms in a fight, which made the game stutter. The oldest stain is reused once the pool is full. */
const STAIN_MAX = coarse ? 180 : 360;
const stainTex = texture(128, 128, c => { c.filter = 'blur(1.2px)'; c.fillStyle = '#fff'; c.beginPath(); c.ellipse(64, 64, 34, 21, 0, 0, TAU); c.fill(); for (let i = 0; i < 18; i++) { const a = Math.random() * TAU, r = 18 + Math.random() * 40, w = 2 + Math.random() * 4; c.fillRect(64 + Math.cos(a) * r, 64 + Math.sin(a) * r * .8, w, w * .8); } });
const stainMat = new T.MeshLambertMaterial({ map: stainTex, transparent: true, opacity: .5, depthWrite: false });
const stainBatch = new T.InstancedMesh(unitPlane, stainMat, STAIN_MAX); stainBatch.frustumCulled = false; stainBatch.receiveShadow = true; stainBatch.renderOrder = -2; stainBatch.count = 0;
const stainM = new T.Matrix4(), stainQ = new T.Quaternion(), stainE = new T.Euler(), stainP = new T.Vector3(), stainS = new T.Vector3(), stainC = new T.Color();
stainBatch.setColorAt(0, stainC.set('#522b25')); scene.add(stainBatch); // colour buffer exists before the first frame, so no shader recompiles later
let stainHead = 0;
function clearStains() { stainBatch.count = 0; stainHead = 0; }
function stain(x, z, size, color = '#522b25', scorch = false) {
  const w = size * 3.6 * (scorch ? 1.1 : 1);
  stainQ.setFromEuler(stainE.set(-Math.PI / 2, 0, rand(0, TAU))); stainP.set(x, .012, z); stainS.set(w, w * rand(.8, 1), 1);
  stainBatch.setMatrixAt(stainHead, stainM.compose(stainP, stainQ, stainS)); stainBatch.setColorAt(stainHead, stainC.set(scorch ? '#33423d' : color));
  stainHead = (stainHead + 1) % STAIN_MAX; stainBatch.count = Math.min(STAIN_MAX, stainBatch.count + 1);
  stainBatch.instanceMatrix.needsUpdate = true; stainBatch.instanceColor.needsUpdate = true;
}

/* Obstacles, props and barrels. */
function addObstacle(x, z, w, d, h = 1.2, type = 'concrete') {
  const o = { x, z, w, d, h, type }; obstacles.push(o); const g = newGroup(worldRoot, x, 0, z);
  shadow(g, 0, 0, w + 1.4, d + 1.3);
  if (type === 'container') {
    const color = mapId === 1 ? '#647761' : '#416370', metal = mat(color, 0, .72, .35);
    box(g, 0, h / 2, 0, w, h, d, metal); box(g, 0, h + .045, 0, w + .09, .09, d + .09, mat('#82918a', 0, .65, .3));
    for (let i = -w / 2 + .3; i < w / 2 - .1; i += .46) { box(g, i, h / 2, -d / 2 - .035, .075, h - .16, .09, mat('#557786', 0, .7, .3)); box(g, i, h / 2, d / 2 + .035, .075, h - .16, .09, mat('#4a6c76', 0, .7, .3)); }
    for (const s of [-1, 1]) { box(g, s * (w / 2 - .07), h / 2, 0, .13, h + .1, d + .13, '#7b8a84'); box(g, s * w / 4, h / 2, d / 2 + .075, .04, h * .85, .08, '#adb4a5'); }
    for (const s of [-1, 1]) box(g, 0, .12, s * (d / 2 + .05), w, .13, .11, '#263f46');
    for (let i = 0; i < 3; i++) box(g, wr(-w / 2.6, w / 2.6), wr(.4, h - .4), d / 2 + .05, wr(.3, .7), wr(.2, .45), .02, '#7a4b33');
    label(g, 'HORDE—0' + (mapId + 1), 0, h / 2, d / 2 + .06, Math.min(w * .48, 2.2), .52, '#d0d0ae', null, 0);
    box(g, w / 2 - .9, h + .11, -.3, .75, .16, .6, '#738077');
  } else if (type === 'crate') {
    box(g, 0, h / 2, 0, w, h, d, '#807758'); for (const s of [-1, 1]) { box(g, s * (w / 2 - .08), h / 2, 0, .16, h + .04, d + .05, '#afa381'); box(g, 0, h / 2, s * (d / 2 - .06), w + .04, .14, .15, '#393e32'); box(g, 0, h * .2, s * (d / 2 + .01), w, .08, .05, '#aea383'); }
    box(g, 0, h + .025, 0, w + .04, .09, d + .04, '#aaa082'); box(g, 0, h + .083, 0, .16, .026, d, '#474939');
  } else if (type === 'bunker') {
    box(g, 0, h / 2, 0, w, h, d, '#62716b'); box(g, 0, h + .04, 0, w + .18, .1, d + .18, '#939989'); box(g, 0, .12, 0, w + .13, .25, d + .13, '#394c48'); for (let i = -w / 2 + .5; i < w / 2; i += 1.2) box(g, i, h * .74, d / 2 + .02, .35, .17, .035, '#233a36');
  } else if (type === 'car') {
    const long = w >= d, L2 = long ? w : d, S2 = long ? d : w, inner = newGroup(g); inner.rotation.y = long ? 0 : Math.PI / 2;
    const paint = mat(['#6d3b2f', '#3f5a63', '#77704f'][mapId], 0, .55, .25);
    box(inner, 0, .55, 0, L2, .55, S2 * .96, paint); box(inner, -L2 * .08, 1.05, 0, L2 * .5, .48, S2 * .86, paint);
    box(inner, -L2 * .08, 1.08, 0, L2 * .46, .36, S2 * .88, mat('#1b2629', 0, .15, .2));
    box(inner, L2 / 2 - .05, .58, 0, .1, .22, S2 * .8, '#2b2f2c'); box(inner, -L2 / 2 + .05, .62, 0, .1, .18, S2 * .8, '#5b2f28');
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) meshAt(inner, wheelGeo, mat('#151a1b', 0, .9), sx * L2 * .32, .34, sz * S2 * .46, Math.PI / 2, 0, 0);
    for (let i = 0; i < 4; i++) box(inner, wr(-L2 / 2.4, L2 / 2.4), .84, wr(-S2 / 3, S2 / 3), wr(.2, .5), .02, wr(.2, .4), '#7a4b33');
  } else if (type === 'sandbags') {
    const long = w >= d, n = Math.max(2, Math.round((long ? w : d) / .62));
    for (let row = 0; row < 2; row++) for (let i = 0; i < n - row; i++) { const t = (i + row * .5 - (n - 1) / 2) * .62, s = box(g, long ? t : 0, .19 + row * .34, long ? 0 : t, long ? .6 : d * .95, .34, long ? d * .95 : .6, row ? '#9a8d68' : '#8a7e5c'); s.rotation.y = wr(-.08, .08); }
  } else if (type === 'tires') {
    for (let i = 0; i < 3; i++) meshAt(g, tireGeo, mat('#1c2224', 0, .95), wr(-.05, .05), .14 + i * .24, wr(-.05, .05), Math.PI / 2, 0, 0, 1.15, 1.15, 1.15);
  } else {
    box(g, 0, h / 2, 0, w, h, d, '#858a78'); box(g, 0, .14, 0, w + .25, .28, d + .26, '#53645b'); box(g, 0, h + .015, 0, w + .1, .08, d + .08, '#b9b69b');
    for (let i = -w / 2 + .15; i < w / 2; i += .6) { const s = box(g, i, h * .6, d / 2 + .009, .24, .22, .023, '#cbb984'); s.rotation.z = -.45; }
  }
  return o;
}
function bollard(x, z) { const g = newGroup(worldRoot, x, 0, z); box(g, 0, .42, 0, .21, .84, .21, '#dda360'); box(g, 0, .57, 0, .224, .2, .224, '#293b3c'); box(g, 0, .07, 0, .42, .1, .4, '#354b48'); }
function lamp(x, z, pool) { const g = newGroup(worldRoot, x, 0, z); box(g, 0, 2, 0, .16, 4, .16, mat('#344b4b', 0, .6, .4)); box(g, .42, 4.02, 0, .95, .12, .18, '#73817a'); box(g, .78, 3.96, 0, .5, .14, .4, mat('#edd5a0', '#bd8945')); glow(g, .78, 3.88, 0, '#ffd798', 1.2, true); shadow(g, 0, 0, .8, .8); lightPool(worldRoot, x + .78, z, 9, '#ffcf8a', pool); }
// Barrels render through a few instanced meshes instead of ~6 draw calls each.
const MAX_BARRELS = 64, barrelInst = [
  { geo: cylinderGeo, mat: mat('#a74b32', 0, .7, .15), parts: [[0, .59, 0]] },
  { geo: bandGeo, mat: mat('#3b4140', 0, .5, .5), parts: [[0, .13, 0], [0, .93, 0]] },
  { geo: lidGeo, mat: mat('#ca7351', 0, .75), parts: [[0, 1.17, 0]] },
  { geo: stripeGeo, mat: mat('#d4a961', 0, .8), parts: [[0, .6, 0]] },
  { geo: unitBox, mat: mat('#3b453c'), parts: [[.19, 1.21, .1, .12, .07, .12]] },
].map(p => { const m = new T.InstancedMesh(p.geo, p.mat, MAX_BARRELS * p.parts.length); m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; m.count = 0; scene.add(m); return { ...p, mesh: m }; });
let barrelsDirty = true;
function createBarrel(x, z, placed = false, id = null) { if (barrels.length >= MAX_BARRELS) { const dead = barrels.findIndex(b => !b.alive); if (dead < 0) return null; barrels.splice(dead, 1); } const b = { id: id || 'm' + barrels.length, x, z, r: .51, hp: 44, alive: true, placed, wob: 0, lastBy: null }; barrels.push(b); barrelsDirty = true; navTimer = 0; return b; }
function drawBarrels() {
  const alive = barrels.filter(b => b.alive);
  for (const p of barrelInst) {
    let n = 0;
    for (const b of alive) for (const q of p.parts) { tempObj.position.set(b.x + q[0], q[1], b.z + q[2]); tempObj.rotation.set(Math.sin(b.wob * 40) * b.wob * .3, 0, 0); tempObj.scale.set(q[3] || 1, q[4] || 1, q[5] || 1); tempObj.updateMatrix(); p.mesh.setMatrixAt(n++, tempObj.matrix); }
    p.mesh.count = n; p.mesh.instanceMatrix.needsUpdate = true;
  }
  barrelsDirty = alive.some(b => b.wob > 0);
}
function addDetail(x, z) { const g = newGroup(worldRoot, x, 0, z); g.rotation.y = wr(0, TAU); for (let i = 0; i < 5; i++) box(g, (i - 2) * .26, .04, 0, .19, .07, 1.12, '#8a7d5a'); for (const i of [-1, 1]) box(g, 0, .01, i * .39, 1.35, .03, .12, '#655e43'); }
function debris(x, z) { const g = newGroup(worldRoot, x, 0, z); for (let i = 0; i < 6; i++) { const s = box(g, wr(-.5, .5), wr(.03, .1), wr(-.5, .5), wr(.12, .38), wr(.06, .18), wr(.1, .3), worldRng() > .5 ? '#8e9180' : '#6c7064'); s.rotation.set(wr(-.4, .4), wr(0, TAU), wr(-.3, .3)); } box(g, wr(-.3, .3), .05, wr(-.3, .3), .9, .04, .07, '#5a3a2a').rotation.y = wr(0, TAU); }
function cone(x, z) { const g = newGroup(worldRoot, x, 0, z); meshAt(g, coneGeo, mat('#e2783d', 0, .6), 0, .27, 0); box(g, 0, .02, 0, .36, .04, .36, '#2c2c2a'); meshAt(g, unitBox, mat('#f2ede0'), 0, .3, 0, 0, 0, 0, .2, .05, .2); if (worldRng() < .3) g.rotation.z = Math.PI / 2.1; }
function weeds(x, z) { const g = newGroup(worldRoot, x, 0, z); for (let i = 0; i < 5; i++) { const s = box(g, wr(-.25, .25), .12, wr(-.25, .25), .04, wr(.15, .38), .04, worldRng() > .5 ? '#5f7346' : '#738450'); s.rotation.set(wr(-.4, .4), wr(0, TAU), wr(-.4, .4)); } }
function puddle(x, z, w, d) { const m = new T.Mesh(discGeo, new T.MeshStandardMaterial({ color: '#0f1a1d', roughness: .06, metalness: .1, transparent: true, opacity: .62, depthWrite: false })); m.material.userData.own = true; m.rotation.x = -Math.PI / 2; m.position.set(x, .014, z); m.scale.set(w, d, 1); m.receiveShadow = true; worldRoot.add(m); }
const barrelLocations = [[-5, -5], [-4.1, -4.7], [7, -5], [8, -4.2], [-9, 3], [-8, 3.6], [5, 8], [6, 8.4], [16, 8], [17, 9], [-16, -10], [-15, -11], [16, -11], [-17, 11], [2, -4], [-2, 1]];
const EXTRA_SOLIDS = [
  [[-2.5, -6.8, 3.8, 1.9, 1.4, 'car'], [-13.5, -8.2, 3.2, .9, .75, 'sandbags'], [8.5, 10.6, 1, 1, .7, 'tires'], [13.2, 12.4, .9, 3, .75, 'sandbags']],
  [[-14.5, 2.8, 1.9, 3.8, 1.4, 'car'], [13.6, -3.6, .9, 3.1, .75, 'sandbags'], [-5, -11.6, 1, 1, .7, 'tires'], [4.6, 12.6, 3.1, .9, .75, 'sandbags']],
  [[-11.5, 12.6, 3.8, 1.9, 1.4, 'car'], [11, -11.8, 3.2, .9, .75, 'sandbags'], [16.4, 6.4, 1, 1, .7, 'tires'], [-16.2, -6.6, .9, 2.4, .75, 'sandbags']],
];
function freeArea(x, z, w, d, margin) {
  if (Math.abs(x) + w / 2 > bounds.x - 1.2 || Math.abs(z) + d / 2 > bounds.z - 1.2) return false;
  if (Math.abs(x) < 6 && Math.abs(z) + d / 2 > 13.5) return false; // Keep the north/south entries open.
  if (Math.abs(z) < 5 && Math.abs(x) + w / 2 > 17.5) return false; // Keep the east/west entries open.
  if (Math.hypot(x, z - 4) < 4) return false;
  for (const o of obstacles) if (Math.abs(x - o.x) < (w + o.w) / 2 + margin && Math.abs(z - o.z) < (d + o.d) / 2 + margin) return false;
  for (const [bx, bz] of barrelLocations) if (Math.abs(bx - x) < w / 2 + .9 && Math.abs(bz - z) < d / 2 + .9) return false;
  return true;
}
function rebuildWorld() {
  worldRoot.traverse(o => { if (o.isInstancedMesh && typeof o.dispose === 'function') o.dispose(); if (o.isSprite && o.userData.ownMat && o.material) o.material.dispose(); if (o.geometry && !SHARED_GEO.has(o.geometry) && o.geometry !== discGeo) o.geometry.dispose(); if (o.material && !o.isSprite && o.material.userData.own) { if (o.material.map && !SHARED_TEX.has(o.material.map)) o.material.map.dispose(); o.material.dispose(); } });
  if (floorTexture) floorTexture.dispose();
  clearStains();
  scene.remove(worldRoot); worldRoot = new T.Group(); scene.add(worldRoot); obstacles = []; barrels = []; barrelsDirty = true;
  worldRng = L.rng(9000 + mapId * 131 + (daily ? daily.seed % 1000 : 0));
  makeFloor();
  // Low front walls never conceal enemies. Gaps are physical entry points.
  for (const s of [-1, 1]) {
    for (const x of [-13, 13]) box(worldRoot, x, s === -1 ? .82 : .28, s * 16.2, 16, s === -1 ? 1.64 : .56, .47, '#465a54');
    for (const z of [-10, 10]) box(worldRoot, s * 21.4, .67, z, .47, 1.34, 12, '#526259');
    for (const x of [-4.75, 4.75]) { box(worldRoot, x, .9, s * 16.1, .58, 1.8, .68, '#7f8977'); box(worldRoot, x, 1.85, s * 16.1, .38, .12, .42, mat('#fb7846', '#ad3211')); glow(worldRoot, x, 1.95, s * 16.1, '#ff6335', 1.3); lightPool(worldRoot, x, s * 15.4, 2.6, '#ff7a45', .16); }
    for (const z of [-3.5, 3.5]) { box(worldRoot, s * 21.2, .85, z, .68, 1.7, .6, '#7c8674'); box(worldRoot, s * 21.2, 1.8, z, .42, .12, .36, mat('#ef8253', '#af411e')); }
  }
  if (mapId === 0) {
    addObstacle(-9, -4, 7, 2.9, 2.5, 'container'); addObstacle(10, 4, 6.2, 2.7, 2.35, 'container');
    addObstacle(6, -8, 4.6, 1, 1.1); addObstacle(-6, 8, 4.4, 1, 1.1); addObstacle(12, -8, 2, 2, 1.25, 'crate'); addObstacle(14, -6, 1.5, 1.5, 1.05, 'crate'); addObstacle(-13, 6, 2.1, 2, 1.45, 'crate'); addObstacle(-11, 7, 1.5, 1.5, .8, 'crate');
    addObstacle(-1, -11, 2, 2, 1.05, 'crate'); addObstacle(1.1, -11, 1.8, 2, 1.7, 'crate');
  } else if (mapId === 1) {
    addObstacle(0, -6, 3.3, 6, 1.65, 'bunker'); addObstacle(-7, 0, 6, 2.1, 1.3); addObstacle(7, 0, 6, 2.1, 1.3); addObstacle(0, 7, 3.2, 3.8, 1.7, 'bunker');
    addObstacle(-13, -9, 3.2, 2.5, 1.55, 'crate'); addObstacle(13, 10, 3, 2.5, 1.55, 'crate'); addObstacle(12, -9, 3.2, 2, 1.8, 'crate'); addObstacle(-12, 10, 3.3, 2.6, 1.9, 'crate');
  } else {
    addObstacle(-7, -6, 5.5, 2.8, 2, 'container'); addObstacle(7, -6, 5.5, 2.8, 2, 'container'); addObstacle(-7, 6, 5.5, 2.8, 2, 'container'); addObstacle(7, 6, 5.5, 2.8, 2, 'container'); addObstacle(-15, 0, 1.8, 7, 1.2); addObstacle(15, 0, 1.8, 7, 1.2); addObstacle(0, -11, 2, 2, 1.3, 'crate'); addObstacle(0, 11, 2, 2, 1.3, 'crate');
  }
  for (const [x, z, w, d, h, type] of EXTRA_SOLIDS[mapId]) if (freeArea(x, z, w, d, 1.1)) addObstacle(x, z, w, d, h, type);
  for (const [x, z] of barrelLocations) if (!solidAt(x, z, .8, false)) createBarrel(x, z);
  if (runMod === 'powder') for (let i = 0; i < 14; i++) { const x = wr(-17, 17), z = wr(-12, 12); if (!solidAt(x, z, .9, true) && Math.hypot(x, z - 4) > 4) createBarrel(x, z, false, 'm' + barrels.length); }
  const pool = runMod === 'blackout' ? .42 : .2;
  for (const [x, z] of [[-17, -12], [17, -12], [-18, 12], [18, 12]]) lamp(x, z, pool);
  for (let i = 0; i < 13; i++) { const x = wr(-19, 19), z = wr(-14, 14); if (!solidAt(x, z, 1, false)) addDetail(x, z); }
  for (let i = 0; i < 9; i++) { const x = wr(-19, 19), z = wr(-14, 14); if (!solidAt(x, z, .9, false)) debris(x, z); }
  for (const [x, z] of [[-6.2, 14.6], [6.2, 14.6], [-6.4, -14.7], [19.6, 5.2], [-19.6, -5.3]]) if (!solidAt(x, z, .3, false)) cone(x + wr(-.3, .3), z + wr(-.2, .2));
  for (let i = 0; i < 26; i++) { const side = Math.floor(worldRng() * 4), x = side < 2 ? wr(-20.4, 20.4) : (side === 2 ? -20.5 : 20.5), z = side < 2 ? (side === 0 ? -15.5 : 15.5) : wr(-15.4, 15.4); if (!solidAt(x, z, .1, false) || Math.abs(x) > 20) weeds(x, z); }
  for (let i = 0; i < 4; i++) { const x = wr(-17, 17), z = wr(-12, 12); if (!solidAt(x, z, 1.4, false)) puddle(x, z, wr(1.4, 3.2), wr(.8, 1.7)); }
  for (const s of [-1, 1]) for (const n of [-2, 2]) bollard(n, s * 15.25);
  label(worldRoot, 'NO EXIT', 0, .012, -14.15, 3.6, .85, '#d5b479'); label(worldRoot, '01', -17, .012, 0, 2.2, 1.05, '#b3b398');
  for (let i = 0; i < 60; i++) { const x = wr(-20, 20), z = wr(-15, 15); if (!solidAt(x, z, .2, false)) box(worldRoot, x, .028, z, wr(.03, .13), wr(.03, .08), wr(.05, .2), '#a5a48c', wr(0, TAU)); }
  for (const [x, z] of [[-18, 2], [18, -3], [4, -14], [-3, 14]]) { box(worldRoot, x, .009, z, 1.4, .016, .6, '#344a46'); for (let i = 0; i < 7; i++) box(worldRoot, x - .57 + i * .19, .023, z, .04, .017, .56, '#758278'); }
  batchStatic(); navTimer = 0; applyAtmosphere();
}
// Merge every static mesh that shares geometry and material into one instanced draw, with slight per-instance tint.
function batchStatic() {
  worldRoot.updateMatrixWorld(true); const buckets = new Map();
  (function collect(o) { if (o.isMesh && !o.isInstancedMesh && SHARED_GEO.has(o.geometry)) { const key = o.geometry.uuid + o.material.uuid; let b = buckets.get(key); if (!b) { b = { geo: o.geometry, mat: o.material, cast: o.castShadow, items: [] }; buckets.set(key, b); } b.items.push(o); } for (const child of o.children) collect(child); })(worldRoot);
  for (const b of buckets.values()) {
    const batch = new T.InstancedMesh(b.geo, b.mat, b.items.length); batch.castShadow = b.cast; batch.receiveShadow = true; batch.frustumCulled = false;
    const tint = b.geo === unitBox && !b.mat.transparent;
    b.items.forEach((m, i) => { batch.setMatrixAt(i, m.matrixWorld); if (tint) batch.setColorAt(i, tmpColor.setScalar(1 + rand(-.07, .05))); m.parent.remove(m); });
    batch.instanceMatrix.needsUpdate = true; worldRoot.add(batch);
  }
}
let flashlight = null;
function applyAtmosphere() {
  const dark = runMod === 'blackout';
  hemi.intensity = dark ? .55 : 1.8; sun.intensity = dark ? .9 : 3.1; rim.intensity = dark ? .45 : 1.3; scene.fog.density = dark ? .03 : .012; renderer.toneMappingExposure = dark ? 1.05 : 1.22;
  if (!flashlight) { flashlight = lightPool(scene, 0, 0, 9, '#ffe3b0', .34); }
  flashlight.visible = dark;
}
function circleBox(x, z, r, o) { const dx = x - clamp(x, o.x - o.w / 2, o.x + o.w / 2), dz = z - clamp(z, o.z - o.d / 2, o.z + o.d / 2); return dx * dx + dz * dz < r * r; }
function solidAt(x, z, r, withBarrels = true) { if (Math.abs(x) > bounds.x - r || Math.abs(z) > bounds.z - r) return true; if (obstacles.some(o => circleBox(x, z, r, o))) return true; return withBarrels && barrels.some(b => b.alive && Math.hypot(x - b.x, z - b.z) < r + b.r); }
function moveBody(e, dx, dz, includeBarrels = true) {
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / .18)); dx /= steps; dz /= steps;
  for (let j = 0; j < steps; j++) {
    e.x = clamp(e.x + dx, -bounds.x + e.r, bounds.x - e.r); e.z = clamp(e.z + dz, -bounds.z + e.r, bounds.z - e.r);
    for (let pass = 0; pass < 2; pass++) {
      for (const o of obstacles) { const qx = clamp(e.x, o.x - o.w / 2, o.x + o.w / 2), qz = clamp(e.z, o.z - o.d / 2, o.z + o.d / 2), vx = e.x - qx, vz = e.z - qz, len = Math.hypot(vx, vz);
        if (len < e.r) { if (len > .00001) { e.x += vx / len * (e.r - len + .001); e.z += vz / len * (e.r - len + .001); } else { const ds = [Math.abs(e.x - (o.x - o.w / 2)), Math.abs(e.x - (o.x + o.w / 2)), Math.abs(e.z - (o.z - o.d / 2)), Math.abs(e.z - (o.z + o.d / 2))], i = ds.indexOf(Math.min(...ds)); if (i === 0) e.x = o.x - o.w / 2 - e.r - .001; else if (i === 1) e.x = o.x + o.w / 2 + e.r + .001; else if (i === 2) e.z = o.z - o.d / 2 - e.r - .001; else e.z = o.z + o.d / 2 + e.r + .001; } } }
      if (includeBarrels) for (const b of barrels) { if (!b.alive) continue; let vx = e.x - b.x, vz = e.z - b.z, len = Math.hypot(vx, vz); const r = e.r + b.r; if (len < r) { if (len < .001) { vx = 1; vz = 0; len = 1; } e.x += vx / len * (r - len + .001); e.z += vz / len * (r - len + .001); } }
    }
  }
}

/* Instanced characters: survivors, zombies, corpses and blob shadows each draw in one call. */
const tempObj = new T.Object3D(); tempObj.rotation.order = 'YXZ';
const rootM = new T.Matrix4(), upperM = new T.Matrix4(), gunM = new T.Matrix4(), partM = new T.Matrix4(), tmpColor = new T.Color(), white = new T.Color('#ffe7c3'), burnTint = new T.Color('#ff8a3a');
const charMat = () => new T.MeshStandardMaterial({ color: 0xffffff, roughness: 1, roughnessMap: roughTex, metalness: 0 });
const survivorBatch = new T.InstancedMesh(unitBox, charMat(), 4 * 28); survivorBatch.instanceMatrix.setUsage(T.DynamicDrawUsage); survivorBatch.castShadow = true; survivorBatch.receiveShadow = true; survivorBatch.frustumCulled = false; survivorBatch.count = 0; scene.add(survivorBatch);
const zombieBatch = new T.InstancedMesh(unitBox, charMat(), (maxEnemies + 30) * 24); zombieBatch.instanceMatrix.setUsage(T.DynamicDrawUsage); zombieBatch.castShadow = true; zombieBatch.receiveShadow = true; zombieBatch.frustumCulled = false; zombieBatch.count = 0; scene.add(zombieBatch);
const eyeBatch = new T.InstancedMesh(unitBox, new T.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), (maxEnemies + 30) * 6); eyeBatch.frustumCulled = false; eyeBatch.count = 0; scene.add(eyeBatch);
const blobBatch = new T.InstancedMesh(unitPlane, shadowMat, maxEnemies + 30 + MAX_BARRELS + 8); blobBatch.frustumCulled = false; blobBatch.count = 0; blobBatch.renderOrder = -1; scene.add(blobBatch);
let sN = 0, zN = 0, eN = 0, bN = 0;
function compose(out, x, y, z, rx, ry, rz, sx, sy, sz) { tempObj.position.set(x, y, z); tempObj.rotation.set(rx, ry, rz); tempObj.scale.set(sx, sy, sz); tempObj.updateMatrix(); return out.copy(tempObj.matrix); }
const blobM = new T.Matrix4(), blobS = new T.Vector3();
function blob(x, z, w, d) { if (bN >= blobBatch.instanceMatrix.count) return; blobM.makeRotationX(-Math.PI / 2); blobM.scale(blobS.set(w, d, 1)); blobM.setPosition(x, .022, z); blobBatch.setMatrixAt(bN++, blobM); }
// Survivor model: independent aim (upper body) and movement (feet), recoil, lean and a readable ring.
const rings = [], muzzles = [];
for (let i = 0; i < 4; i++) {
  const r = new T.Mesh(ringGeo, new T.MeshBasicMaterial({ color: '#ffb263', transparent: true, opacity: .82, depthWrite: false })); r.rotation.x = -Math.PI / 2; r.visible = false; scene.add(r);
  const disc = new T.Mesh(discGeo, new T.MeshBasicMaterial({ color: '#ff6a52', transparent: true, opacity: .32, depthWrite: false })); disc.rotation.x = -Math.PI / 2; disc.position.y = .03; disc.visible = false; scene.add(disc);
  rings.push({ ring: r, disc });
  const m = new T.Sprite(new T.SpriteMaterial({ map: glowTex, color: '#ffc677', transparent: true, blending: T.AdditiveBlending, depthWrite: false, opacity: .9 })); m.visible = false; scene.add(m); muzzles.push(m);
}
function drawSurvivor(s, slot) {
  const pal = SURVIVORS[s.char] || SURVIVORS.ranger, ringSet = rings[slot], mz = muzzles[slot];
  ringSet.disc.visible = false;
  if (!s.visible) { ringSet.ring.visible = false; mz.visible = false; return; }
  const down = s.status === 'down', mv = Math.min(1, s.move || 0), sw = Math.sin(s.walk), recoil = s.recoil || 0;
  if (down) { compose(rootM, s.x, .16, s.z, -1.45, s.angle, 0, 1, 1, 1); upperM.copy(rootM); }
  else {
    compose(rootM, s.x, Math.abs(sw) * mv * .04, s.z, 0, s.feet, 0, 1, 1, 1);
    compose(upperM, s.x, Math.abs(sw) * mv * .04, s.z, -recoil * .09 + mv * .07, s.aim, 0, 1, 1, 1);
  }
  const P = (root, x, y, z, w, h, d, color, rx = 0) => { if (sN >= survivorBatch.instanceMatrix.count) return; compose(partM, x, y, z, rx, 0, 0, w, h, d); partM.premultiply(root); survivorBatch.setMatrixAt(sN, partM); survivorBatch.setColorAt(sN++, tmpColor.set(color)); };
  const swing = down ? Math.sin(time * 3) * .1 : sw * mv * .53;
  P(rootM, -.18, .29, 0, .24, .55, .29, pal.pants, swing); P(rootM, .18, .29, 0, .24, .55, .29, pal.pants, -swing);
  P(rootM, -.18, .085, .075 + sw * mv * .13, .27, .19, .41, pal.boots); P(rootM, .18, .085, .075 - sw * mv * .13, .27, .19, .41, pal.boots);
  P(upperM, 0, .84, 0, .7, .66, .45, pal.jacket); P(upperM, 0, .84, .256, .46, .47, .105, '#384c49'); P(upperM, 0, .55, .23, .66, .14, .08, '#283c3b');
  for (const side of [-1, 1]) { P(upperM, side * .4, .95, .12, .22, .4, .25, pal.arm); P(upperM, side * .4, .79, .36, .19, .2, .27, '#b4ab80'); }
  P(upperM, 0, 1.43, 0, .7, .6, .64, pal.head); P(upperM, 0, 1.76, -.04, .76, .18, .67, pal.hair); P(upperM, 0, 1.56, -.265, .75, .31, .15, pal.hair2);
  P(upperM, 0, 1.5, .324, .65, .23, .04, pal.visor); P(upperM, -.17, 1.535, .35, .19, .055, .014, '#77afb5'); P(upperM, 0, 1.19, .18, .78, .13, .32, pal.trim);
  P(upperM, -.27, 1.07, -.38, .16, .46, .07, pal.scarf, Math.sin(time * 7 + slot) * .12 + mv * .3);
  if (s.char === 'medic') { P(upperM, 0, .9, -.235, .3, .08, .02, pal.trim); P(upperM, 0, .9, -.235, .08, .3, .02, pal.trim); }
  else if (s.char === 'scout') P(upperM, 0, 1.83, .26, .62, .05, .32, pal.trim);
  else if (s.char === 'sapper') { P(upperM, 0, 1.84, -.04, .84, .1, .74, '#59613f'); P(upperM, -.2, .62, .3, .14, .16, .1, '#6f7a45'); P(upperM, .2, .62, .3, .14, .16, .1, '#6f7a45'); }
  else if (s.char === 'gunner') { P(upperM, -.42, 1.14, 0, .3, .12, .4, pal.trim); P(upperM, .42, 1.14, 0, .3, .12, .4, pal.trim); }
  else if (s.char === 'ghost') P(upperM, 0, 1.62, -.06, .8, .5, .74, '#2a2e35');
  const gs = (weaponDefs[s.gun] || weaponDefs[0]).gs;
  compose(gunM, .16, .9, .41 - recoil * .26, 0, 0, 0, gs[0], gs[1], gs[2]); gunM.premultiply(upperM);
  if (!down) { P(gunM, 0, 0, .23, .2, .19, .64, '#23373c'); P(gunM, 0, .125, .3, .14, .09, .43, s.gun === 6 ? '#7fd8e6' : '#829087'); P(gunM, 0, -.18, .06, .15, .28, .16, '#263c3f'); P(gunM, 0, -.04, .58, .13, .13, .16, '#10252c'); }
  blob(s.x, s.z, 1.65, 1.45);
  ringSet.ring.visible = true; ringSet.ring.position.set(s.x, .035, s.z);
  ringSet.ring.material.color.set(down ? '#ff5a46' : s.buff ? '#ffeeb0' : pal.ring); ringSet.ring.material.opacity = down ? .5 + Math.sin(time * 8) * .3 : .82;
  ringSet.ring.scale.setScalar(down ? 1.5 : 1);
  if (down) { ringSet.disc.visible = (s.rev || 0) > 0; ringSet.disc.position.set(s.x, .03, s.z); ringSet.disc.scale.setScalar(.2 + 1.4 * clamp(s.rev || 0, 0, 1)); }
  mz.visible = !down && recoil > .03;
  if (mz.visible) { v3.set(0, 0, .71).applyMatrix4(gunM); mz.position.copy(v3); mz.material.rotation = rand(0, TAU); mz.scale.setScalar(s.gun === 2 ? 1.35 : .7 + recoil); mz.material.color.set(s.gun === 6 ? '#9ff0ff' : '#ffc677'); }
}
const colors = { skin: ['#9daa83', '#b3af85', '#a4b397', '#8e9e76'], shirt: ['#516657', '#746d52', '#697877', '#777358'], pants: ['#334c50', '#414e49', '#394548'] };
const EYES = { spitter: '#ff6d52', matriarch: '#ff8a4a', screamer: '#d2a8ff', howler: '#e0b0ff', butcher: '#ffb347', crawler: '#e8e07a' };
function drawZombie(e, tilt = 0, sink = 0) {
  const s = e.scale, k = e.kind, fl = e.flags | 0, sw = Math.sin(e.walk), heavy = k === 'brute' || k === 'butcher';
  const spawnY = e.remote ? -(e.rise || 0) * 2.2 : e.spawn > 0 ? -e.spawn * 2.2 : 0;
  const bob = Math.sin(e.walk * 2) * .024 * (heavy ? 2 : 1);
  compose(rootM, e.x, bob + spawnY - sink, e.z, tilt, e.angle, 0, s, s, s);
  let mix = e.hit > 0 ? Math.min(.85, e.hit * 5) : 0;
  if (fl & 2) mix = Math.max(mix, .25 + Math.sin(time * 30) * .25);
  const burning = (e.burnT || 0) > 0 || (fl & 64);
  const P = (x, y, z, w, h, d, color, rx = 0, rz = 0) => { if (zN >= zombieBatch.instanceMatrix.count) return; compose(partM, x, y, z, rx, 0, rz, w, h, d); partM.premultiply(rootM); tmpColor.set(color); if (burning) tmpColor.lerp(burnTint, .25 + Math.sin(time * 20 + e.seed) * .15); if (mix) tmpColor.lerp(white, mix); zombieBatch.setMatrixAt(zN, partM); zombieBatch.setColorAt(zN++, tmpColor); };
  const E = (x, y, z, w, h, d, color) => { if (eN >= eyeBatch.instanceMatrix.count) return; compose(partM, x, y, z, 0, 0, 0, w, h, d); partM.premultiply(rootM); eyeBatch.setMatrixAt(eN, partM); eyeBatch.setColorAt(eN++, tmpColor.set(color)); };
  const eye = (fl & 8) ? '#ff3b2e' : EYES[k] || '#d6d69a';
  if (k === 'crawler') {
    P(-.15, .14, -.55 + sw * .06, .2, .16, .5, e.pants, 0); P(.15, .14, -.55 - sw * .06, .2, .16, .5, e.pants, 0);
    P(0, .32, -.05, .55, .32, .8, e.shirt); P(0, .38, .48, .5, .42, .45, e.skin); P(-.12, .42, .71, .08, .05, .02, '#29352e'); P(.12, .42, .71, .08, .05, .02, '#29352e');
    E(-.12, .42, .72, .06, .04, .02, eye); E(.12, .42, .72, .06, .04, .02, eye);
    P(-.33, .18, .45 + sw * .18, .16, .16, .55, e.skin); P(.33, .18, .45 - sw * .18, .16, .16, .55, e.skin);
  } else {
    const thin = k === 'screamer' || k === 'howler', tw = thin ? .55 : .65, armLen = thin ? .74 : .57;
    const stride = k === 'runner' ? .75 : .4, charging = fl & 4, screaming = fl & 32;
    const lean = (k === 'runner' ? .28 : heavy ? .1 : .08) + (charging ? .38 : 0);
    P(-.17, .29, sw * .095, .235, .53, .29, e.pants, sw * stride); P(.17, .29, -sw * .095, .235, .53, .29, e.pants, -sw * stride);
    P(0, .84, lean * .25, tw, .67, .43, e.shirt, lean); P(0, 1.4, .04 + lean * .62, .72, .61, .67, e.skin, lean * .5, Math.sin(e.seed) * .12);
    P(0, 1.71, -.13 + lean * .62, .72, .08, .43, k === 'runner' ? '#97543d' : thin ? '#7d7f7a' : '#566651', lean * .5);
    let armRx = -1.1 + Math.sin(e.walk + .7) * .15;
    if (k === 'runner') armRx = -.35 + sw * .9;
    if (screaming || ((heavy) && (fl & 2))) armRx = -2.65 + Math.sin(time * 18) * .1;
    P(-.44, .97, .32 + lean * .3, .21, armLen, .22, e.skin, armRx); P(.44, .97, .32 + lean * .3, .21, armLen, .22, e.skin, k === 'runner' ? -.35 - sw * .9 : armRx - Math.sin(e.walk) * .16);
    const fz = .383 + lean * .62;
    P(-.165, 1.45, fz, .17, .15, .025, '#29352e'); P(.165, 1.45, fz, .17, .15, .025, '#29352e');
    if (screaming || (k === 'spitter' || k === 'matriarch') && (fl & 2)) { P(0, 1.22, fz + .005, .3, .2, .025, '#3a0f12'); E(0, 1.22, fz + .012, .18, .1, .02, k === 'spitter' || k === 'matriarch' ? '#ffb35a' : '#ff6a8a'); }
    else P(0, 1.24, fz + .005, .24, .09, .025, '#3a4435');
    E(-.16, 1.455, fz + .02, .075, .05, .025, eye); E(.16, 1.455, fz + .02, .075, .05, .025, eye);
    P(.19, .71, .222, .18, .21, .015, '#795647');
    if (heavy) { P(-.48, 1.09, 0, .32, .31, .57, '#6f7e5d'); P(.48, 1.09, 0, .32, .31, .57, '#6f7e5d'); P(0, .85, .264, .53, .45, .095, '#465e4b'); }
    if (k === 'butcher') { P(0, .62, .26, .6, .62, .04, '#8a7f70'); P(.55, .82, .7, .07, .52, .3, '#a5adad', -1.1); P(.55, .8, .45, .06, .06, .3, '#3b2a20'); }
    if (k === 'spitter' || k === 'matriarch') { P(-.27, 1.83, 0, .13, .25, .13, '#754641'); P(.27, 1.83, 0, .13, .25, .13, '#754641'); }
    if (k === 'matriarch') { for (const [x, y] of [[-.22, 1.12], [.22, 1.05], [0, .82]]) { P(x, y, -.3, .26, .26, .2, '#8d5a4a'); E(x, y, -.41, .12, .12, .02, '#ffad5a'); } }
    if (k === 'howler') for (let i = 0; i < 4; i++) P(0, .7 + i * .26, -.3, .07, .3, .07, '#2a2c2a', -.6);
    if (thin) P(0, 1.08, .2, .5, .06, .3, '#6b665d');
  }
  if (!tilt) blob(e.x, e.z, 1.45 * s, 1.3 * s);
}
function drawEnemies() {
  zN = 0; eN = 0;
  for (const e of enemies) drawZombie(e);
  for (const c of corpses) drawZombie(c, Math.min(1, c.t / .4) ** .7 * 1.45 * c.dir, Math.max(0, c.t - .9) * 1.2);
  zombieBatch.count = zN; eyeBatch.count = eN; zombieBatch.instanceMatrix.needsUpdate = true; if (zombieBatch.instanceColor) zombieBatch.instanceColor.needsUpdate = true; eyeBatch.instanceMatrix.needsUpdate = true; if (eyeBatch.instanceColor) eyeBatch.instanceColor.needsUpdate = true;
}
function updateCorpses(dt) { for (let i = corpses.length - 1; i >= 0; i--) { const c = corpses[i]; c.t += dt; if (c.t > 1.7) corpses.splice(i, 1); } }
function addCorpse(e) { if (corpses.length >= 30) corpses.shift(); corpses.push({ x: e.x, z: e.z, angle: e.angle, kind: e.kind, scale: e.scale, skin: e.skin, shirt: e.shirt, pants: e.pants, seed: e.seed, walk: e.walk, hit: .12, flags: 0, spawn: 0, t: 0, dir: Math.random() < .5 ? 1 : -1 }); }

/* Particles: bounded pools for voxels (lit) and sparks (additive). */
const maxParticles = 1200, particleData = [], particleBatch = new T.InstancedMesh(unitBox, new T.MeshStandardMaterial({ color: 0xffffff, roughness: .8 }), maxParticles); particleBatch.instanceMatrix.setUsage(T.DynamicDrawUsage); particleBatch.frustumCulled = false; particleBatch.count = 0; scene.add(particleBatch);
const maxSparks = 360, sparkData = [], sparkBatch = new T.InstancedMesh(unitBox, new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false }), maxSparks); sparkBatch.instanceMatrix.setUsage(T.DynamicDrawUsage); sparkBatch.frustumCulled = false; sparkBatch.count = 0; scene.add(sparkBatch);
const pScale = () => (tier < 0 ? 1 : TIERS[tier].particles);
function particle(x, y, z, vx, vy, vz, color, size = .1, life = .7, flatten = 1) { if (particleData.length >= maxParticles) particleData.shift(); particleData.push({ x, y, z, vx, vy, vz, color, size, life, maxLife: life, angle: rand(0, TAU), spin: rand(-7, 7), flatten }); }
function burst(x, y, z, color, n = 12, power = 3) { n = Math.ceil(n * pScale()); for (let i = 0; i < n; i++) { const a = rand(0, TAU), s = rand(.3, power); particle(x, y, z, Math.cos(a) * s, rand(1, power * 1.4), Math.sin(a) * s, color, rand(.04, .15), rand(.4, 1.1)); } }
function spark(x, y, z, vx, vy, vz, color, size = .06, life = .25, drag = 3) { if (sparkData.length >= maxSparks) sparkData.shift(); sparkData.push({ x, y, z, vx, vy, vz, color, size, life, maxLife: life, drag }); }
function sparks(x, y, z, color, n, power, dirX = 0, dirZ = 0) { n = Math.ceil(n * pScale()); for (let i = 0; i < n; i++) { const a = rand(0, TAU), s = rand(.5, power); spark(x, y, z, Math.cos(a) * s * .6 + dirX * power, rand(.5, power * .8), Math.sin(a) * s * .6 + dirZ * power, color, rand(.035, .08), rand(.12, .32)); } }
function renderParticles(dt) {
  for (let i = particleData.length - 1; i >= 0; i--) { const p = particleData[i]; p.life -= dt; if (p.life <= 0) { particleData.splice(i, 1); continue; } p.vy -= 12 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; if (p.y < p.size * .3) { p.y = p.size * .3; p.vy = Math.abs(p.vy) * .26; p.vx *= .77; p.vz *= .77; p.spin *= .7; } p.angle += p.spin * dt; }
  for (let i = 0; i < particleData.length; i++) { const p = particleData[i], s = p.size * Math.min(1, p.life * 3); tempObj.position.set(p.x, p.y, p.z); tempObj.rotation.set(p.angle, p.angle * .7, p.angle * .3); tempObj.scale.set(s, s * p.flatten, s); tempObj.updateMatrix(); particleBatch.setMatrixAt(i, tempObj.matrix); particleBatch.setColorAt(i, tmpColor.set(p.color)); }
  particleBatch.count = particleData.length; particleBatch.instanceMatrix.needsUpdate = true; if (particleBatch.instanceColor) particleBatch.instanceColor.needsUpdate = true;
  for (let i = sparkData.length - 1; i >= 0; i--) { const p = sparkData[i]; p.life -= dt; if (p.life <= 0) { sparkData.splice(i, 1); continue; } const k = Math.exp(-p.drag * dt); p.vx *= k; p.vz *= k; p.vy = p.vy * k - 4 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; }
  for (let i = 0; i < sparkData.length; i++) { const p = sparkData[i], f = p.life / p.maxLife, s = p.size * (.4 + f); tempObj.position.set(p.x, p.y, p.z); tempObj.rotation.set(0, Math.atan2(p.vx, p.vz), 0); tempObj.scale.set(s, s, s * (1 + Math.hypot(p.vx, p.vz) * .12)); tempObj.updateMatrix(); sparkBatch.setMatrixAt(i, tempObj.matrix); sparkBatch.setColorAt(i, tmpColor.set(p.color).multiplyScalar(.5 + f)); }
  sparkBatch.count = sparkData.length; sparkBatch.instanceMatrix.needsUpdate = true; if (sparkBatch.instanceColor) sparkBatch.instanceColor.needsUpdate = true;
}
// Ambient dust motes and low mist: one Points draw plus a handful of sprites (High only).
const DUST = 240, dustPos = new Float32Array(DUST * 3), dustVel = new Float32Array(DUST * 2);
for (let i = 0; i < DUST; i++) { dustPos[i * 3] = rand(-21, 21); dustPos[i * 3 + 1] = rand(.3, 4); dustPos[i * 3 + 2] = rand(-16, 16); dustVel[i * 2] = rand(-.25, .25); dustVel[i * 2 + 1] = rand(-.2, .2); }
const dustGeo = new T.BufferGeometry(); dustGeo.setAttribute('position', new T.BufferAttribute(dustPos, 3));
const dust = new T.Points(dustGeo, new T.PointsMaterial({ size: coarse ? 3 : 4, map: glowTex, color: '#d8d2b8', transparent: true, opacity: .32, blending: T.AdditiveBlending, depthWrite: false, sizeAttenuation: false })); dust.frustumCulled = false; scene.add(dust);
const mist = []; for (let i = 0; i < 5; i++) { const m = new T.Sprite(new T.SpriteMaterial({ map: glowTex, color: '#9fb6bd', transparent: true, opacity: .05, depthWrite: false })); m.position.set(rand(-16, 16), .6, rand(-12, 12)); m.scale.set(14, 5, 1); m.userData.v = rand(.2, .5) * (Math.random() < .5 ? -1 : 1); scene.add(m); mist.push(m); }
function updateAmbient(dt) {
  const n = dust.geometry.drawRange.count === Infinity ? DUST : Math.min(DUST, dust.geometry.drawRange.count);
  for (let i = 0; i < n; i++) { const j = i * 3; dustPos[j] += (dustVel[i * 2] + Math.sin(time * .3 + i) * .08) * dt; dustPos[j + 1] += Math.sin(time * .5 + i * 1.7) * .05 * dt; dustPos[j + 2] += dustVel[i * 2 + 1] * dt; if (dustPos[j] > 21) dustPos[j] = -21; else if (dustPos[j] < -21) dustPos[j] = 21; if (dustPos[j + 2] > 16) dustPos[j + 2] = -16; else if (dustPos[j + 2] < -16) dustPos[j + 2] = 16; }
  dustGeo.attributes.position.needsUpdate = true;
  for (const m of mist) if (m.visible) { m.position.x += m.userData.v * dt; if (m.position.x > 22) m.position.x = -22; if (m.position.x < -22) m.position.x = 22; }
}

/* Short-lived effects. */
const tracerMat = new T.MeshBasicMaterial({ color: '#ffe4a2', transparent: true, opacity: .9, depthWrite: false }), railMat = new T.MeshBasicMaterial({ color: '#9ff0ff', transparent: true, opacity: .95, depthWrite: false, blending: T.AdditiveBlending }), zapMat = new T.MeshBasicMaterial({ color: '#b8e8ff', transparent: true, opacity: .9, depthWrite: false, blending: T.AdditiveBlending });
function tracer(x, z, tx, tz, power = 1, material = tracerMat, life = .07, y = 1.02) { const length = Math.hypot(tx - x, tz - z); if (length < .05) return; const m = new T.Mesh(unitBox, material); m.position.set((x + tx) / 2, y, (z + tz) / 2); m.rotation.y = Math.atan2(tx - x, tz - z); m.scale.set(.025 * power, .025 * power, length); scene.add(m); effects.push({ mesh: m, life, max: life, kind: 'trace', w: .025 * power }); }
function shockwave(x, z, r, color = '#ffc383', life = .35) { const m = new T.Mesh(shockGeo, new T.MeshBasicMaterial({ color, transparent: true, opacity: .8, depthWrite: false, side: T.DoubleSide })); m.position.set(x, .06, z); m.rotation.x = -Math.PI / 2; m.scale.setScalar(.05); scene.add(m); effects.push({ mesh: m, life, max: life, kind: 'ring', r, dispose: true }); }
function telegraph(x, z, r, life, color = '#ff5a3c') { const m = new T.Mesh(shockGeo, new T.MeshBasicMaterial({ color, transparent: true, opacity: .7, depthWrite: false, side: T.DoubleSide })); m.position.set(x, .05, z); m.rotation.x = -Math.PI / 2; m.scale.setScalar(r); scene.add(m); const f = new T.Mesh(discGeo, new T.MeshBasicMaterial({ color, transparent: true, opacity: .18, depthWrite: false })); f.position.set(x, .04, z); f.rotation.x = -Math.PI / 2; f.scale.setScalar(.1); scene.add(f); effects.push({ mesh: m, life, max: life, kind: 'tele', dispose: true }); effects.push({ mesh: f, life, max: life, kind: 'fill', r: r * 2, dispose: true }); }
function floatText(text, x, y, z, color = '#ffcd94') { if (state !== 'run') return; const el = document.createElement('div'); el.className = 'float-text'; el.textContent = text; el.style.color = color; $('floatLayer').appendChild(el); floatTexts.push({ el, x, y, z, life: 1, max: 1 }); if (floatTexts.length > 18) floatTexts.shift().el.remove(); }
function updateEffects(dt) {
  for (let i = effects.length - 1; i >= 0; i--) { const e = effects[i]; e.life -= dt; const p = 1 - e.life / e.max;
    if (e.kind === 'ring') { e.mesh.scale.setScalar(Math.max(.05, p * e.r)); e.mesh.material.opacity = (1 - p) * .65; }
    else if (e.kind === 'flash') { e.mesh.scale.setScalar((.3 + Math.sin(p * Math.PI) * .7) * e.r); e.mesh.material.opacity = (1 - p) * .95; }
    else if (e.kind === 'glow') { e.mesh.scale.setScalar(e.r * (.6 + p)); e.mesh.material.opacity = (1 - p) * .8; }
    else if (e.kind === 'tele') e.mesh.material.opacity = .45 + Math.sin(p * 30) * .25;
    else if (e.kind === 'fill') e.mesh.scale.setScalar(Math.max(.1, p * e.r));
    else if (e.kind === 'trace') { const w = e.w * (e.life / e.max); e.mesh.scale.x = e.mesh.scale.y = Math.max(.004, w); }
    if (e.life <= 0) { scene.remove(e.mesh); if (e.dispose) e.mesh.material.dispose(); effects.splice(i, 1); } }
  for (let i = floatTexts.length - 1; i >= 0; i--) { const f = floatTexts[i]; f.life -= dt; if (f.life <= 0) { f.el.remove(); floatTexts.splice(i, 1); continue; } v3.set(f.x, f.y + (1 - f.life) * 1.6, f.z).project(camera); f.el.style.left = (v3.x * .5 + .5) * innerWidth + 'px'; f.el.style.top = (-v3.y * .5 + .5) * innerHeight + 'px'; f.el.style.opacity = Math.min(1, f.life * 2.5); }
}

/* Flow-field pathfinding, one field per living player (up to 4). */
const nx = 42, nz = 32, navBlocked = new Uint8Array(nx * nz), navCosts = [0, 1, 2, 3].map(() => new Int16Array(nx * nz).fill(30000)), navQueue = new Int32Array(nx * nz), navDirs = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]];
function gridX(x) { return clamp(Math.floor(x + 21), 0, nx - 1); } function gridZ(z) { return clamp(Math.floor(z + 16), 0, nz - 1); }
function rebuildNav() {
  for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) navBlocked[x + z * nx] = solidAt(x - 20.5, z - 15.5, .43, true) ? 1 : 0;
  for (let t = 0; t < Math.min(4, targets.length); t++) {
    const cost = navCosts[t]; cost.fill(30000);
    const gx = gridX(targets[t].x), gz = gridZ(targets[t].z); let goal = gx + gz * nx;
    if (navBlocked[goal]) { let bestD = Infinity; for (let z = Math.max(0, gz - 3); z <= Math.min(nz - 1, gz + 3); z++) for (let x = Math.max(0, gx - 3); x <= Math.min(nx - 1, gx + 3); x++) { const k = x + z * nx, d = (x - gx) ** 2 + (z - gz) ** 2; if (!navBlocked[k] && d < bestD) { bestD = d; goal = k; } } }
    let head = 0, tail = 0; navQueue[tail++] = goal; cost[goal] = 0;
    while (head < tail) { const k = navQueue[head++], x = k % nx, z = (k / nx) | 0; for (const [dx, dz] of navDirs) { const a = x + dx, b = z + dz, j = a + b * nx; if (a < 0 || a >= nx || b < 0 || b >= nz || navBlocked[j] || cost[j] !== 30000) continue; if (dx && dz && (navBlocked[x + b * nx] || navBlocked[a + z * nx])) continue; cost[j] = cost[k] + 1; navQueue[tail++] = j; } }
  }
}
function rayRect(x, z, dx, dz, o, maxDist = Infinity, pad = 0) { let near = 0, far = maxDist; const minX = o.x - o.w / 2 - pad, maxX = o.x + o.w / 2 + pad, minZ = o.z - o.d / 2 - pad, maxZ = o.z + o.d / 2 + pad; if (Math.abs(dx) < 1e-8) { if (x < minX || x > maxX) return Infinity; } else { let a = (minX - x) / dx, b = (maxX - x) / dx; if (a > b) [a, b] = [b, a]; near = Math.max(near, a); far = Math.min(far, b); } if (Math.abs(dz) < 1e-8) { if (z < minZ || z > maxZ) return Infinity; } else { let a = (minZ - z) / dz, b = (maxZ - z) / dz; if (a > b) [a, b] = [b, a]; near = Math.max(near, a); far = Math.min(far, b); } return far >= near && far >= 0 ? near : Infinity; }
function rayCircle(x, z, dx, dz, cx, cz, r, maxDist) { const ox = cx - x, oz = cz - z, dot = ox * dx + oz * dz, perp = ox * ox + oz * oz - dot * dot; if (perp > r * r || dot + r < 0) return Infinity; const d = Math.max(0, dot - Math.sqrt(Math.max(0, r * r - perp))); return d <= maxDist ? d : Infinity; }
function clearPath(x, z, tx, tz, r = .35, withBarrels = true) { const dist = Math.hypot(tx - x, tz - z); if (dist < .01) return true; const dx = (tx - x) / dist, dz = (tz - z) / dist; for (const o of obstacles) if (rayRect(x, z, dx, dz, o, dist, r) < dist) return false; if (withBarrels) for (const b of barrels) if (b.alive && rayCircle(x, z, dx, dz, b.x, b.z, b.r + r, dist) < dist) return false; return true; }
function wallDistance(x, z, dx, dz, range) { let d = range; for (const o of obstacles) { const t = rayRect(x, z, dx, dz, o, d); if (t < d) d = t; } return d; }
const steerOut = { x: 0, z: 0 };
function steer(e, gx, gz, ti) {
  let dx = gx - e.x, dz = gz - e.z, len = Math.hypot(dx, dz);
  if (len < .05) { steerOut.x = 0; steerOut.z = 0; return steerOut; }
  if (clearPath(e.x, e.z, gx, gz, e.r + .04)) { steerOut.x = dx / len; steerOut.z = dz / len; return steerOut; }
  if (ti >= 0 && ti < 4) {
    const cost = navCosts[ti], gxi = gridX(e.x), gzi = gridZ(e.z); let bx = gxi, bz = gzi, best = cost[gxi + gzi * nx] + .5;
    for (const [a, b] of navDirs) { const x = gxi + a, z = gzi + b; if (x < 0 || x >= nx || z < 0 || z >= nz) continue; const k = x + z * nx; if (navBlocked[k]) continue; if (a && b && (navBlocked[gxi + z * nx] || navBlocked[x + gzi * nx])) continue; const c = cost[k] + Math.hypot(x - 20.5 - e.x, z - 15.5 - e.z) * .12; if (c < best) { best = c; bx = x; bz = z; } }
    if (best < 30000) { dx = bx - 20.5 - e.x; dz = bz - 15.5 - e.z; len = Math.hypot(dx, dz) || 1; steerOut.x = dx / len; steerOut.z = dz / len; return steerOut; }
  }
  const a = Math.atan2(dx, dz);
  for (const off of [.7, -.7, 1.4, -1.4, 2, -2]) { const ax = Math.sin(a + off), az = Math.cos(a + off); if (!solidAt(e.x + ax * .85, e.z + az * .85, e.r, true)) { steerOut.x = ax; steerOut.z = az; return steerOut; } }
  steerOut.x = 0; steerOut.z = 0; return steerOut;
}

/* Zombie archetypes. Bosses arrive every fifth wave. */
const STATS = {
  walker: { hp: 52, speed: [1.75, 2.35], scale: [.94, 1.08], r: .34, dmg: 15, score: 10 },
  runner: { hp: 43, speed: [4, 4], scale: [.88, .88], r: .34, dmg: 11, score: 18 },
  brute: { hp: 300, speed: [1.45, 1.45], scale: [1.65, 1.65], r: .64, dmg: 26, score: 60 },
  spitter: { hp: 100, speed: [1.95, 1.95], scale: [1.05, 1.05], r: .34, dmg: 12, score: 35 },
  screamer: { hp: 75, speed: [2.2, 2.2], scale: [1.1, 1.1], r: .34, dmg: 10, score: 40 },
  crawler: { hp: 30, speed: [3.1, 3.1], scale: [.8, .8], r: .36, dmg: 9, score: 8 },
  butcher: { hp: 2600, speed: [1.6, 1.6], scale: [2.5, 2.5], r: .55, dmg: 34, score: 800, name: 'The Butcher' },
  matriarch: { hp: 2000, speed: [1.8, 1.8], scale: [2.1, 2.1], r: .55, dmg: 24, score: 800, name: 'The Matriarch' },
  howler: { hp: 2200, speed: [2.5, 2.5], scale: [2.2, 2.2], r: .55, dmg: 28, score: 800, name: 'The Howler' },
};
const diffHp = () => (difficulty === 0 ? .8 : difficulty === 2 ? 1.17 : 1), diffSpeed = () => (difficulty === 0 ? .86 : difficulty === 2 ? 1.14 : 1);
function teamSize() { if (!coop()) return 1; let n = 1; for (const r of net.remotes.values()) if (r.inRun) n++; return clamp(Math.max(n, net.room ? net.room.peers.length : 1), 1, 4); }
function enemyMaxHp(kind, w) {
  const st = STATS[kind], players = teamSize();
  if (L.isBoss(kind)) return st.hp * (1 + (Math.max(1, Math.floor(w / 5)) - 1) * .5) * diffHp() * (1 + .7 * (players - 1));
  return st.hp * (1 + Math.max(0, w - 1) * .12) * diffHp() * (1 + .3 * (players - 1)) * (runMod === 'swarm' ? .85 : 1);
}
function newEnemy(id, kind, x, z) {
  const st = STATS[kind] || STATS.walker, boss = L.isBoss(kind), sc = st.scale[0] + (st.scale[1] - st.scale[0]) * idRand(id, 1);
  return { id, kind, x, z, boss, scale: sc, r: st.r * sc, hp: 1, maxHp: 1, hpPct: 100, speed: 2, angle: idRand(id, 2) * TAU, walk: idRand(id, 3) * TAU, spawn: 0, attack: .4 + idRand(id, 4) * 2, hit: 0, kx: 0, kz: 0,
    skin: kind === 'brute' || kind === 'butcher' ? '#83976a' : kind === 'spitter' || kind === 'matriarch' ? '#b8998a' : kind === 'screamer' ? '#c9c3b5' : kind === 'howler' ? '#8f8c86' : colors.skin[Math.floor(idRand(id, 5) * 4)],
    shirt: kind === 'runner' ? '#b35b42' : kind === 'spitter' || kind === 'matriarch' ? '#765662' : kind === 'brute' || kind === 'butcher' ? '#495d45' : kind === 'screamer' || kind === 'howler' ? '#4a4450' : colors.shirt[Math.floor(idRand(id, 6) * 4)],
    pants: colors.pants[Math.floor(idRand(id, 7) * 3)], seed: idRand(id, 8) * TAU, flags: 0,
    aware: false, target: null, think: 0, slot: L.slotAngle(id), mode: '', modeT: 0, cd: 0, alert: 0, buff: 0, stun: 0, dirT: 0, dx: 0, dz: 0, gx: x, gz: z, cx: 0, cz: 0, chargeHit: false, lastBy: null, lastExpl: false, orbit: idRand(id, 9) < .5 ? -1 : 1, remote: false, buf: null, burnT: 0 };
}
function spawnEnemy(kind = 'walker', pos = null, demo = false) {
  const limit = coop() ? COOP_CAP : maxEnemies;
  if (enemies.length >= limit) return false;
  let x, z, okay = false;
  for (let k = 0; k < 70; k++) {
    if (pos) { x = pos.x; z = pos.z; } else { const side = Math.floor(runRng() * 4); x = side === 0 ? -19.7 : side === 1 ? 19.7 : rr(-19, 19); z = side === 2 ? -14.7 : side === 3 ? 14.7 : rr(-13.5, 13.5); }
    const clear = !solidAt(x, z, L.isBoss(kind) ? 1.2 : .7, true);
    let far = true; for (const t of targets) if (Math.hypot(x - t.x, z - t.z) < (demo ? 5 : 8)) far = false;
    if (clear && far) { okay = true; break; } if (pos) { okay = clear; break; }
  }
  if (!okay) return false;
  const e = newEnemy(nextZid++, kind, x, z), st = STATS[kind];
  e.maxHp = e.hp = enemyMaxHp(kind, wave);
  e.speed = (st.speed[0] + (st.speed[1] - st.speed[0]) * Math.random()) * diffSpeed() * (1 + Math.min(e.boss ? .3 : .6, wave * (e.boss ? .01 : .025))) * (runMod === 'swarm' ? 1.1 : 1);
  e.spawn = demo ? 0 : .63; e.aware = demo || e.boss || kind === 'runner' && wave > 6;
  e.gx = rr(-8, 8); e.gz = rr(-6, 6); e.cd = e.boss ? 3 : rand(1, 3);
  enemies.push(e); zMap.set(e.id, e);
  return e;
}
// Targets the AI can see: living survivors (local and remote). Rebuilt every step.
const targets = [], targetPool = [0, 1, 2, 3, 4].map(() => ({}));
function buildTargets(demo) {
  targets.length = 0;
  const add = (id, x, z, hpFrac, angle, local) => { const t = targetPool[targets.length]; Object.assign(t, { id, x, z, hpFrac, angle, alive: true, local }); targets.push(t); };
  if (demo || player.status === 'alive') add(selfKey(), player.x, player.z, player.hp / player.maxHp, player.angle, true);
  if (!demo) for (const r of net.remotes.values()) if (r.inRun && r.status === 'alive' && targets.length < 4) add(r.id, r.x, r.z, r.hp / 100, r.angle, false);
}
function targetIndex(id) { for (let i = 0; i < targets.length; i++) if (targets[i].id === id) return i; return -1; }
const sepGrid = L.createGrid(1.6, -22, -17, 22, 17, maxEnemies + 8);
function noise(x, z, radius, sourceId) { if (!authority()) return; for (const e of enemies) { if (e.remote) continue; const d = Math.hypot(e.x - x, e.z - z); if (d < radius) { if (!e.aware) { e.aware = true; e.target = sourceId; } else if (Math.random() < .35) e.target = sourceId; e.alert = 1.6; } } }
function scream(e, radius, summon) {
  for (const o of enemies) if (!o.remote && o !== e && Math.hypot(o.x - e.x, o.z - e.z) < radius) { o.buff = 5; o.aware = true; o.alert = 2; }
  for (const o of enemies) if (!o.remote) o.aware = true;
  fxScream(e.x, e.z, radius); netEvent(['sc', q10(e.x), q10(e.z), q10(radius)]);
  for (let i = 0; i < summon && spawnLeft >= 0; i++) spawnEnemy(e.kind === 'howler' ? 'runner' : 'crawler');
}
function fxScream(x, z, r) { shockwave(x, z, r, '#c9a0ff', .6); shockwave(x, z, r * .6, '#ff6a8a', .45); audio.scream(); shake = Math.max(shake, .12); }
function hurtTarget(t, dmg, dx, dz) {
  if (t.local) damagePlayer(dmg, dx, dz);
  else damageThisStep += dmg, netEvent(['hu', t.id, Math.round(dmg), Math.round(dx * 10), Math.round(dz * 10)]);
}
function pickCover(e, t, wantSight) {
  // Sample nearby points; spitters peek from a ranged spot with sight, or duck behind cover without it.
  let bx = e.x, bz = e.z, bestScore = Infinity;
  for (let i = 0; i < 10; i++) {
    const a = rand(0, TAU), d = rand(1.5, 4.5), x = clamp(e.x + Math.cos(a) * d, -19.5, 19.5), z = clamp(e.z + Math.sin(a) * d, -14.5, 14.5);
    if (solidAt(x, z, e.r + .1, true)) continue;
    const dist = Math.hypot(t.x - x, t.z - z), sight = clearPath(x, z, t.x, t.z, .05, false);
    let s = Math.abs(dist - 8.5) + Math.hypot(x - e.x, z - e.z) * .3;
    if (wantSight !== sight) s += 8;
    if (!wantSight) { let near = 9; for (const o of obstacles) { const dx = x - clamp(x, o.x - o.w / 2, o.x + o.w / 2), dz = z - clamp(z, o.z - o.d / 2, o.z + o.d / 2); near = Math.min(near, Math.hypot(dx, dz)); } s += near * .8; }
    if (s < bestScore) { bestScore = s; bx = x; bz = z; }
  }
  e.gx = bx; e.gz = bz;
}
function brain(e, t, ti, dist, dt, demo) {
  // Returns a speed multiplier; sets e.gx/e.gz (goal) or e.mode 'charge' for straight-line movement.
  const k = e.kind;
  if (!e.aware && !demo) { if (Math.hypot(e.gx - e.x, e.gz - e.z) < 1.5) { e.gx = clamp(t.x + rand(-6, 6), -18, 18); e.gz = clamp(t.z + rand(-5, 5), -13, 13); } return .55; }
  const approach = () => { if (dist > 3) { const p = L.approachPoint(e.x, e.z, t.x, t.z, e.slot); e.gx = p.x; e.gz = p.z; } else { e.gx = t.x; e.gz = t.z; } };
  if (k === 'walker' || k === 'crawler') { approach(); return 1; }
  if (k === 'runner') {
    e.modeT -= dt;
    if (e.mode === 'lunge') { e.gx = t.x; e.gz = t.z; if (e.modeT <= 0) { e.mode = 'retreat'; e.modeT = .7; } return 1.2; }
    if (e.mode === 'retreat') { e.gx = e.x - (t.x - e.x); e.gz = e.z - (t.z - e.z); if (e.modeT <= 0) { e.mode = 'orbit'; e.modeT = rand(1.4, 3.2); e.orbit *= Math.random() < .4 ? -1 : 1; } return .9; }
    if (e.mode !== 'orbit') { e.mode = 'orbit'; e.modeT = rand(1.4, 3.2); }
    if (dist > 7.5) { approach(); return 1; }
    const p = L.orbitPoint(e.x, e.z, t.x, t.z, 4.3, e.orbit); e.gx = p.x; e.gz = p.z;
    if (e.modeT <= 0 || (L.lookingAway(t.angle, t.x, t.z, e.x, e.z) && dist < 6 && e.modeT < 1.2)) { e.mode = 'lunge'; e.modeT = 1.6; }
    return .85;
  }
  if (k === 'brute' || k === 'butcher') {
    const boss = k === 'butcher';
    if (e.mode === 'windup') { e.flags |= 2; e.modeT -= dt; e.angle += shortestAngle(e.angle, Math.atan2(e.cx, e.cz)) * Math.min(1, dt * 10); if (e.modeT <= 0) { e.mode = 'charge'; e.modeT = boss ? 1.2 : 1; e.chargeHit = false; } return 0; }
    if (e.mode === 'charge') { e.flags |= 4; e.modeT -= dt; if (e.modeT <= 0) { e.mode = ''; e.cd = boss ? rand(3.2, 4.6) : rand(4, 6); } return boss ? 6 : 6.5; }
    if (e.mode === 'stun') { e.flags |= 16; e.modeT -= dt; if (e.modeT <= 0) e.mode = ''; return 0; }
    if (e.mode === 'slam') { e.flags |= 2; e.modeT -= dt; if (e.modeT <= 0) { e.mode = ''; e.cd = rand(2.8, 4); } return 0; }
    e.cd -= dt; approach();
    if (e.cd <= 0 && dist > 2.5 && dist < (boss ? 12 : 9) && clearPath(e.x, e.z, t.x, t.z, e.r * .8)) {
      if (boss && dist < 5.5 && Math.random() < .55) { e.mode = 'slam'; e.modeT = 1.05; hazard(e.x, e.z, 4.6, 1, 30); audio.charge(); }
      else { e.mode = 'windup'; e.modeT = boss ? .9 : .75; e.cx = (t.x - e.x) / dist; e.cz = (t.z - e.z) / dist; audio.charge(); }
    }
    return 1;
  }
  if (k === 'spitter' || k === 'matriarch') {
    const boss = k === 'matriarch', sight = dist < 14 && clearPath(e.x, e.z, t.x, t.z, .05);
    e.modeT -= dt; e.cd -= dt;
    if (boss && e.cd <= 0) { e.cd = 9; for (let i = 0; i < 3; i++) spawnEnemy('crawler', { x: clamp(e.x + rand(-2, 2), -19, 19), z: clamp(e.z + rand(-2, 2), -14, 14) }); shockwave(e.x, e.z, 2.5, '#ffad5a', .4); }
    if (dist < (boss ? 6 : 4.5)) { e.gx = e.x - (t.x - e.x); e.gz = e.z - (t.z - e.z); return 1.05; }
    if (e.mode === 'cover') { if (e.modeT <= 0) { e.mode = 'peek'; pickCover(e, t, true); e.modeT = 1.5; } return .95; }
    if (e.mode !== 'peek') { e.mode = 'peek'; pickCover(e, t, true); e.modeT = 1.5; }
    if (e.modeT <= 0) { pickCover(e, t, true); e.modeT = 1.5; }
    if (sight && dist > 4 && dist < 13) {
      if (e.attack < .6) { e.flags |= 2; if (Math.random() < .1) spark(e.x, 1.5 * e.scale, e.z, rand(-.2, .2), rand(.3, .8), rand(-.2, .2), '#f2ad68', .07, .3); }
      if (e.attack <= 0) {
        const n = boss ? 5 : 1, base = Math.atan2(t.x - e.x, t.z - e.z);
        for (let i = 0; i < n; i++) { const a = base + (n > 1 ? (i / (n - 1) - .5) * .9 : 0); spit(e.x, e.z, Math.sin(a), Math.cos(a), true); }
        e.attack = boss ? rand(2.4, 3) : rand(2.6, 3.5);
        if (!boss && !demo) { e.mode = 'cover'; e.modeT = rand(1.2, 2); pickCover(e, t, false); }
      }
      return .15;
    }
    return 1;
  }
  if (k === 'screamer' || k === 'howler') {
    const boss = k === 'howler';
    e.cd -= dt;
    if (e.mode === 'scream') { e.flags |= 32 | 2; e.modeT -= dt; if (e.modeT <= 0) { e.mode = ''; e.cd = boss ? rand(6.5, 8) : rand(7, 9); scream(e, boss ? 14 : 8, boss ? 4 : 0); } return 0; }
    if (e.mode === 'leap') { e.flags |= 4; e.modeT -= dt; e.gx = e.cx; e.gz = e.cz; if (e.modeT <= 0) { e.mode = ''; e.cd = rand(2.5, 4); } return 3.2; }
    if (e.cd <= 0) {
      if (boss && dist > 5 && dist < 12 && Math.random() < .5) { e.mode = 'leap'; e.modeT = .75; e.cx = t.x; e.cz = t.z; hazard(t.x, t.z, 3.2, .8, 25); e.cd = 1; }
      else { e.mode = 'scream'; e.modeT = .9; }
      return 0;
    }
    if (boss) { approach(); return 1; }
    if (dist < 9) { e.gx = e.x - (t.x - e.x) * .7 + Math.cos(e.slot) * 2; e.gz = e.z - (t.z - e.z) * .7 + Math.sin(e.slot) * 2; return 1; }
    if (dist > 13) { approach(); return 1; }
    const p = L.orbitPoint(e.x, e.z, t.x, t.z, 11, e.orbit); e.gx = p.x; e.gz = p.z; return .7;
  }
  approach(); return 1;
}
function updateEnemies(dt, demo = false) {
  navTimer -= dt; if (navTimer <= 0) { rebuildNav(); navTimer = .32; }
  L.gridBuild(sepGrid, enemies);
  let near = 0;
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i]; if (e.remote) continue;
    e.hit = Math.max(0, e.hit - dt); e.attack -= dt; e.buff = Math.max(0, e.buff - dt); e.alert = Math.max(0, e.alert - dt); e.burnT = Math.max(0, e.burnT - dt);
    e.flags = (e.buff > 0 ? 8 : 0) | (e.burnT > 0 ? 64 : 0);
    if (e.spawn > 0) { e.spawn -= dt; e.flags |= 1; continue; }
    e.think -= dt;
    if (e.think <= 0) { e.think = .5 + Math.random() * .5; e.target = L.chooseTarget(e.x, e.z, targets, e.target); if (!e.aware) { const t0 = targets[targetIndex(e.target)]; if (t0) { const d = Math.hypot(t0.x - e.x, t0.z - e.z); if (d < 9 || (d < 16 && clearPath(e.x, e.z, t0.x, t0.z, .05))) e.aware = true; } } }
    let ti = targetIndex(e.target); if (ti < 0 && targets.length) { e.target = L.chooseTarget(e.x, e.z, targets, null); ti = targetIndex(e.target); }
    const t = ti >= 0 ? targets[ti] : null;
    if (!t) { e.walk += dt * 2; continue; }
    const dist = Math.hypot(t.x - e.x, t.z - e.z) || .001;
    if (dist < 3.5) near++;
    let speedMul = brain(e, t, ti, dist, dt, demo);
    let vx, vz;
    if (e.mode === 'charge') { vx = e.cx; vz = e.cz; }
    else { e.dirT -= dt; if (e.dirT <= 0) { e.dirT = .08 + Math.random() * .07; const d = steer(e, e.gx, e.gz, ti); e.dx = d.x; e.dz = d.z; } vx = e.dx; vz = e.dz; }
    // Local separation (grid query) keeps the horde from stacking into one blob.
    if (e.mode !== 'charge') L.gridQuery(sepGrid, e.x, e.z, e.r + 1.5, j => { if (j === i) return; const b = enemies[j]; const dx = e.x - b.x, dz = e.z - b.z, len = Math.hypot(dx, dz), min = e.r + b.r + .15; if (len < min && len > .001) { const w = (min - len) / min * 1.7; vx += dx / len * w; vz += dz / len * w; } });
    const len = Math.hypot(vx, vz); if (len > 1) { vx /= len; vz /= len; }
    let speed = e.speed * speedMul * (e.buff > 0 ? 1.35 : 1) * (e.alert > 0 ? 1.12 : 1);
    const reach = e.r + .39 + (e.boss ? .45 : .15), dmgMul = e.buff > 0 ? 1.25 : 1;
    if (dist < reach && e.mode !== 'charge' && e.mode !== 'leap') { speed = 0; if (e.attack <= 0 && !demo) { hurtTarget(t, STATS[e.kind].dmg * dmgMul, (t.x - e.x) / dist, (t.z - e.z) / dist); e.attack = e.kind === 'runner' ? .7 : e.boss ? 1.1 : .8; if (e.kind === 'runner') { e.mode = 'retreat'; e.modeT = .7; } } }
    if (demo && dist < 2.2) { vx = -e.dz; vz = e.dx; speed *= .8; }
    const oldx = e.x, oldz = e.z;
    moveBody(e, (vx * speed + e.kx) * dt, (vz * speed + e.kz) * dt); e.kx *= Math.exp(-10 * dt); e.kz *= Math.exp(-10 * dt);
    const moved = Math.hypot(e.x - oldx, e.z - oldz);
    if (moved > .001) e.walk += dt * (e.kind === 'runner' || e.kind === 'crawler' ? 15 : 7) * Math.max(.6, moved / dt / 2);
    if (e.mode === 'charge') {
      if (moved < speed * dt * .3) { e.mode = 'stun'; e.modeT = e.boss ? .8 : 1.1; shake = Math.max(shake, .16); burst(e.x, .4, e.z, '#9aa08a', 10, 3); }
      for (const tt of targets) if (!e.chargeHit && Math.hypot(tt.x - e.x, tt.z - e.z) < e.r + .6) { e.chargeHit = true; hurtTarget(tt, (e.boss ? 38 : 30) * dmgMul, e.cx * 3, e.cz * 3); }
      if (Math.random() < .5) particle(e.x, .1, e.z, rand(-1, 1), rand(.5, 1.5), rand(-1, 1), '#a9a48a', .1, .5);
    }
    const faceMove = (e.kind === 'runner' && e.mode === 'orbit') || (dist > 7 && moved > .002);
    const wantAngle = faceMove ? Math.atan2(e.x - oldx, e.z - oldz) : Math.atan2(t.x - e.x, t.z - e.z);
    if (e.mode !== 'windup') e.angle += shortestAngle(e.angle, wantAngle) * Math.min(1, dt * 9);
    // When player-built barrels seal a route, the horde attacks the obstruction.
    if (moved < .003 && dist > 2.5 && e.attack <= 0) for (const b of barrels) if (b.alive && Math.hypot(b.x - e.x, b.z - e.z) < e.r + b.r + .2) { damageBarrel(b, 12, null); e.attack = .85; break; }
  }
  nearbySoundTimer -= dt; if (nearbySoundTimer < 0 && enemies.length > 0) { nearbySoundTimer = rand(3.5, 6); audio.groan(); }
  return near;
}

/* Combat. */
const selfKey = () => (coop() ? net.selfId : 'me');
const q10 = v => Math.round(v * 10);
function hurtEnemy(e, damage, dx = 0, dz = 0, knock = 1, expl = false) {
  if (e.hp <= 0 || e.spawn > 0 || (e.flags & 1)) return;
  e.hit = .13;
  if (e.remote) { const h = net.hits.get(e.id) || [0, 0, 0, 0]; h[0] += damage; h[1] += dx * knock; h[2] += dz * knock; h[3] = h[3] || (expl ? 1 : 0); net.hits.set(e.id, h); return; }
  applyDamage(e, damage, dx, dz, knock, selfKey(), expl);
}
function applyDamage(e, damage, dx, dz, knock, by, expl) {
  if (e.hp <= 0) return;
  e.hp -= damage; e.hit = .13; e.aware = true; e.lastBy = by; e.lastExpl = expl;
  const heavy = e.kind === 'brute' || e.boss ? (e.boss ? 8 : 3) : 1; e.kx += dx * knock / heavy; e.kz += dz * knock / heavy;
  if (e.hp <= 0) killEnemy(e, by, expl); else if (Math.random() < .22) audio.hit();
}
function gore(e) {
  stain(e.x, e.z, e.kind === 'brute' || e.boss ? .75 * (e.boss ? 1.8 : 1) : .43); burst(e.x, 1, e.z, e.skin, e.kind === 'brute' || e.boss ? 23 : 13, 4);
  for (let i = 0; i < 4; i++) particle(e.x, rand(.3, 1.3), e.z, rand(-3.5, 3.5), rand(3, 6), rand(-3.5, 3.5), i % 2 ? e.shirt : e.pants, rand(.2, .33), rand(5, 8), rand(.65, 1.3));
  addCorpse(e);
  if (e.kind === 'brute' || e.boss) { shake = Math.max(shake, e.boss ? .4 : .24); shockwave(e.x, e.z, e.boss ? 3.5 : 1.6, '#dbc396', .35); audio.boom(e.boss ? 1 : .7); } else audio.hit();
}
function killEnemy(e, by, expl) {
  const index = enemies.indexOf(e); if (index === -1) return; enemies.splice(index, 1); zMap.delete(e.id); burns.delete(e);
  gore(e); waveKilled++;
  if (by === selfKey()) creditKill(e.kind, e.x, e.z, expl);
  if (e.boss) bossDown(e);
  if (coop()) netEvent(['k', e.id, by || '', L.KINDS.indexOf(e.kind), q10(e.x), q10(e.z), expl ? 1 : 0]);
  if (runActive()) rollDrop(e);
  hitTimer = .13; uiTimer = 0;
}
function creditKill(kind, x, z, expl) {
  if (state === 'menu') return;
  const bonus = (STATS[kind] || STATS.walker).score;
  kills++; chain++; chainTimer = 3.2; const multi = Math.min(8, 1 + Math.floor(chain / 5)); score += bonus * multi; floatText('+' + bonus * multi, x, 1.8, z);
  if (expl) runStats.explosiveKills++;
  if (player.vampire && player.status === 'alive') player.hp = Math.min(player.maxHp, player.hp + player.vampire);
  if (player.adrenaline) player.dashCD = Math.max(0, player.dashCD - .3);
  if (chain === 10 || chain === 25 || chain === 50) audio.unlock();
  weaponDefs.forEach((w, i) => { if (kills === w.need && i > 0 && !(i === 1 && player.smgFree)) { ammo[i] = cap(i); switchWeapon(i); toast(w.name.toUpperCase() + ' UNLOCKED · ' + (i + 1)); audio.unlock(); } });
}
function bossDown(e) { runStats.bossKills++; announce('BOSS DOWN', (STATS[e.kind].name || '').toUpperCase(), 2.2); audio.unlock(); checkUnlocks(); }
function rollDrop(e) {
  if (!authority()) return;
  const p = L.directorParams(director), scarce = runMod === 'scarce' ? .5 : 1, roll = Math.random();
  const lowHp = targets.some(t => t.hpFrac < .35);
  if (e.boss) { dropPickup(nextPid++, e.x + .8, e.z, 'health', true); dropPickup(nextPid++, e.x - .8, e.z, 'supply', true); dropPickup(nextPid++, e.x, e.z + .8, 'overdrive', true); return; }
  if (roll < .075 * p.health * scarce || (lowHp && roll < .2 * p.health * scarce)) dropPickup(nextPid++, e.x, e.z, 'health', true);
  else if (roll < .13 * scarce + .02) dropPickup(nextPid++, e.x, e.z, 'supply', true);
  else if (roll < .15 * scarce + .02) dropPickup(nextPid++, e.x, e.z, 'overdrive', true);
}
function damagePlayer(amount, dx = 0, dz = 0) {
  if (player.status !== 'alive' || (state !== 'run' && !(coop() && runActive())) || player.invuln > 0 || player.dashTime > 0) return;
  player.hp = Math.max(0, player.hp - amount * (difficulty === 0 ? .63 : difficulty === 2 ? 1.25 : 1)); player.invuln = .62; damageFlash = .9; shake = Math.max(shake, .22); moveBody(player, dx * .3, dz * .3); audio.hurt(); uiTimer = 0;
  damageThisStep += amount;
  if (player.hp <= 0) playerDown();
}
function playerDown() {
  if (player.phoenix > 0) { player.phoenix--; player.hp = player.maxHp * .6; player.invuln = 2; announce('BACK UP', '', 1.4); audio.revive(); shockwave(player.x, player.z, 4, '#ffd27a', .5); return; }
  if (!coop()) { die(); return; }
  player.status = 'down'; player.bleed = 25; player.rev = 0; runStats.downs++; burst(player.x, 1, player.z, '#d97843', 18, 4); audio.tone(180, 30, .9, .3, 'sawtooth'); resetInputs(); uiTimer = 0;
}
function damageBarrel(b, damage, by) {
  if (!b.alive) return;
  if (!authority()) { net.bh.set(b.id, (net.bh.get(b.id) || 0) + damage); return; }
  b.hp -= damage; b.wob = .25; barrelsDirty = true; if (by) b.lastBy = by;
  if (b.hp <= 0) { b.alive = false; barrelsDirty = true; explosionQueue.push({ x: b.x, z: b.z, delay: .065 + rand(0, .07), radius: 4.1, damage: 170, source: 'barrel', owner: b.lastBy || selfKey(), barrel: b.id }); navTimer = 0; }
}
const SRC = ['grenade', 'rocket', 'barrel'];
function explode(x, z, r, damage, source = 'grenade', owner = selfKey(), barrelId = '') {
  const near = Math.hypot(camTarget.x - x, camTarget.z - z) < 30;
  audio.boom(near ? 1 : .5); shake = Math.max(shake, .45); zoomKick = Math.max(zoomKick, .3); stain(x, z, r * .52, '#172823', true); shockwave(x, z, r, '#ffc797', .46); burst(x, .5, z, '#ffb44c', 30, 8); burst(x, .8, z, '#4d5045', 22, 7); sparks(x, .6, z, '#ffbe6a', 24, 9);
  const fire = new T.Mesh(effectSphere, new T.MeshBasicMaterial({ color: '#ffbd65', transparent: true, opacity: 1, depthWrite: false })); fire.position.set(x, .7, z); scene.add(fire); effects.push({ mesh: fire, life: .22, max: .22, kind: 'flash', r: r * .46, dispose: true });
  const g = glow(scene, x, 1.1, z, '#ff7838', r * 2, true); effects.push({ mesh: g, life: .44, max: .44, kind: 'glow', r: r * 2, dispose: true });
  playerLight.position.set(x, 1.5, z); playerLight.intensity = 9;
  if (barrelId) { const b = barrels.find(q => q.id === barrelId); if (b && b.alive) { b.alive = false; barrelsDirty = true; navTimer = 0; } }
  if (authority()) {
    for (const e of [...enemies]) { if (e.remote) continue; const d = Math.hypot(e.x - x, e.z - z); if (d < r + e.r && e.spawn <= 0) { const fall = clamp(1 - d / (r * 1.35), .25, 1); applyDamage(e, damage * fall, (e.x - x) / (d || 1), (e.z - z) / (d || 1), 8, owner, true); } }
    for (const b of barrels) if (b.alive && Math.hypot(b.x - x, b.z - z) < r + .3) damageBarrel(b, 200, owner);
    noise(x, z, 26, owner);
  }
  if (source === 'barrel' || owner === selfKey()) { const pd = Math.hypot(player.x - x, player.z - z); if (pd < r * .63) damagePlayer((source === 'barrel' ? 27 : 14) * (1 - pd / r), (player.x - x) / (pd || 1), (player.z - z) / (pd || 1)); }
}
function localExplosion(x, z, r, damage, source) { explode(x, z, r, damage, source, selfKey()); if (coop()) netEvent(['ex', q10(x), q10(z), q10(r), Math.round(damage), SRC.indexOf(source), '']); }
const hitList = [];
function hitscan(angle, damage, range, knock = 2, opts = {}) {
  const dx = Math.sin(angle), dz = Math.cos(angle), x = (opts.x ?? player.x) + dx * .43, z = (opts.z ?? player.z) + dz * .43;
  let distance = wallDistance(x, z, dx, dz, range), barrel = null;
  for (const b of barrels) { if (!b.alive) continue; const t = rayCircle(x, z, dx, dz, b.x, b.z, b.r, distance); if (t < distance) { distance = t; barrel = b; } }
  hitList.length = 0;
  for (const e of enemies) { if (e.spawn > 0 || (e.flags & 1)) continue; const t = rayCircle(x, z, dx, dz, e.x, e.z, e.r + .19, distance); if (t < distance) hitList.push([t, e]); }
  hitList.sort((a, b) => a[0] - b[0]);
  const pierce = (opts.pierce ?? player.pierce) | 0; let dmg = damage, end = distance, hits = 0;
  for (const [t, e] of hitList) {
    let d = dmg; const crit = Math.random() < (player.crit || 0); if (crit) d *= 2;
    hurtEnemy(e, d, dx, dz, knock); hits++; hitTimer = .085;
    sparks(e.x, 1.05, e.z, crit ? '#fff2a8' : '#ffd58a', crit ? 7 : 3, 3.2, dx, dz); burst(e.x, 1.05, e.z, '#697b52', 2, 1.6);
    if (player.burnDps && !opts.drone) ignite(e, player.burnDps, 2);
    if (player.chain && Math.random() < player.chain) chainShock(e, d * .4);
    if (hits > pierce) { end = t; barrel = null; break; } dmg *= .7;
  }
  if (hits <= pierce && barrel) { damageBarrel(barrel, damage, selfKey()); sparks(x + dx * distance, 1, z + dz * distance, '#ffd38c', 5, 3); }
  else if (!hits && end < range) { sparks(x + dx * end, 1, z + dz * end, '#ffe0a0', 4, 3, -dx, -dz); burst(x + dx * end, 1, z + dz * end, '#c4bf92', 3, 2); }
  const tx = x + dx * end, tz = z + dz * end;
  if (opts.rail) { tracer(x + dx * .3, z + dz * .3, tx, tz, 4, railMat, .28); sparks(tx, 1, tz, '#9ff0ff', 10, 5); }
  else tracer(x + dx * .3, z + dz * .3, tx, tz, opts.power || 1, tracerMat, .07, opts.y || 1.02);
}
function chainShock(from, damage) {
  let n = 0;
  for (const e of [...enemies]) { if (e === from || n >= 2 || e.spawn > 0) continue; if (Math.hypot(e.x - from.x, e.z - from.z) < 4) { tracer(from.x, from.z, e.x, e.z, 1.6, zapMat, .14, 1.2); hurtEnemy(e, damage, 0, 0, .5); sparks(e.x, 1.1, e.z, '#b8e8ff', 4, 2.5); n++; } }
  if (n) audio.zap();
}
function ignite(e, dps, seconds) { const b = burns.get(e); if (b) { b.t = Math.max(b.t, seconds); b.dps = Math.max(b.dps, dps); } else burns.set(e, { t: seconds, dps, tick: .25 }); e.burnT = Math.max(e.burnT || 0, seconds); }
function updateBurns(dt) {
  for (const [e, b] of burns) {
    if (!enemies.includes(e) || b.t <= 0) { burns.delete(e); continue; }
    b.t -= dt; b.tick -= dt; e.burnT = Math.max(e.burnT || 0, .2);
    if (b.tick <= 0) { b.tick = .25; hurtEnemy(e, b.dps * .25, 0, 0, 0); if (Math.random() < .6) spark(e.x + rand(-.2, .2), rand(.6, 1.5) * e.scale, e.z + rand(-.2, .2), 0, rand(1, 2), 0, '#ff9a3a', .07, .35, 1); }
  }
}
function flame(power) {
  const w = weaponDefs[player.gun], ax = Math.sin(player.angle), az = Math.cos(player.angle), ox = player.x + ax * .7, oz = player.z + az * .7;
  for (let i = 0; i < 3; i++) { const a = player.angle + rand(-w.spread, w.spread) * .8, s = rand(7, 11); spark(ox, 1, oz, Math.sin(a) * s, rand(.2, 1.2), Math.cos(a) * s, Math.random() < .5 ? '#ffb347' : '#ff6a2a', rand(.08, .14), rand(.35, .55), 2.6); }
  for (const e of [...enemies]) {
    if (e.spawn > 0 || (e.flags & 1)) continue;
    const dx = e.x - player.x, dz = e.z - player.z, d = Math.hypot(dx, dz);
    if (d > w.range + e.r || Math.abs(shortestAngle(player.angle, Math.atan2(dx, dz))) > w.spread + .15 || !clearPath(player.x, player.z, e.x, e.z, .05)) continue;
    hurtEnemy(e, power, ax, az, .4); ignite(e, w.burn * player.damage, 2.2);
  }
  for (const b of barrels) if (b.alive && Math.hypot(b.x - player.x, b.z - player.z) < w.range * .8 && Math.abs(shortestAngle(player.angle, Math.atan2(b.x - player.x, b.z - player.z))) < w.spread) damageBarrel(b, power * .6, selfKey());
}
function fire() {
  if (player.shot > 0 || player.reloading || player.status !== 'alive') return;
  const w = weaponDefs[player.gun]; if (ammo[player.gun] <= 0) { reload(); return; }
  ammo[player.gun]--; const drive = player.buff > 0 ? 1.6 : 1; player.shot = w.fire / (player.rate * drive); player.recoil = w.kick; player.shots++;
  shake = Math.max(shake, w.id === 'shotgun' ? .095 : w.id === 'rocket' || w.id === 'rail' ? .13 : .021); audio.shot(w.id); const power = w.damage * player.damage * (player.buff > 0 ? 1.25 : 1);
  noise(player.x, player.z, w.noise, selfKey());
  if (w.id === 'rocket') { const dx = Math.sin(player.angle), dz = Math.cos(player.angle); launchRocket(player.x + dx * .8, player.z + dz * .8, dx, dz, power, 3.8 * player.blast, false); if (coop()) netEvent(['rk', q10(player.x + dx * .8), q10(player.z + dz * .8), Math.round(dx * 100), Math.round(dz * 100)]); }
  else if (w.id === 'flame') flame(power);
  else if (w.id === 'rail') hitscan(player.angle, power, w.range, 4, { pierce: 99, rail: true });
  else for (let i = 0; i < w.pellets; i++) { const spread = w.pellets > 1 ? ((i / (w.pellets - 1) - .5) * 2 * w.spread + rand(-.017, .017)) : rand(-w.spread, w.spread); hitscan(player.angle + spread, power, w.range, w.id === 'shotgun' ? 3 : 1.8, { power: w.id === 'shotgun' ? 1.3 : 1 }); }
  if (w.id !== 'flame') particle(player.x + .2, 1.1, player.z, Math.cos(player.angle) * 2 + rand(-.3, .3), rand(2, 4), -Math.sin(player.angle) * 2, '#c8aa5d', .075, rand(4, 6), .4);
  playerLight.position.set(player.x, 1.2, player.z); playerLight.intensity = w.id === 'flame' ? 2.5 : 4;
  uiTimer = 0; if (ammo[player.gun] === 0) reload();
}
function reload() { if (!runActive()) return; if (player.reloading || ammo[player.gun] >= cap(player.gun)) return; player.reloading = true; player.reload = weaponDefs[player.gun].reload / player.reloadSpeed; audio.reload(); uiTimer = 0; }
function switchWeapon(i) { if (i < 0 || i >= weaponDefs.length || !unlocked(i)) return; player.gun = i; player.reloading = false; player.reload = 0; player.shot = Math.min(player.shot, .12); audio.click(); uiTimer = 0; updateUI(); }
function dash() {
  if (state !== 'run' || player.dashCD > 0 || player.status !== 'alive') return;
  let v = getMove(); if (Math.hypot(v.x, v.z) < .1) v = { x: Math.sin(player.angle), z: Math.cos(player.angle) };
  player.dashX = v.x; player.dashZ = v.z; player.dashTime = .19; player.dashCD = 1.65 * player.dashMul; player.invuln = Math.max(player.invuln, .23 + player.dashInv); audio.dash(); burst(player.x, .1, player.z, '#c6c2a3', 8, 2.2);
  if (player.shockDash) { shockwave(player.x, player.z, 2.6, '#b8e8ff', .35); for (const e of [...enemies]) { const d = Math.hypot(e.x - player.x, e.z - player.z); if (d < 2.6) hurtEnemy(e, 40 * player.damage, (e.x - player.x) / (d || 1), (e.z - player.z) / (d || 1), 7); } audio.zap(); }
}
function throwGrenade() {
  if (state !== 'run' || player.grenadeCD > 0 || player.status !== 'alive') return;
  if (player.grenades <= 0) { toast('NO GRENADES · FIND A SUPPLY CRATE'); return; }
  player.grenades--; player.grenadeCD = .38; audio.noise(.14, .3, 2100);
  const dx = Math.sin(player.angle), dz = Math.cos(player.angle); let distance = clamp(Math.hypot(aimPoint.x - player.x, aimPoint.z - player.z), 3.5, 12); if (touch.aim.active || coarse) distance = 8;
  const x = player.x + dx * .7, z = player.z + dz * .7;
  addGrenade(x, z, dx * distance, dz * distance, false);
  if (coop()) netEvent(['gr', q10(x), q10(z), q10(dx * distance), q10(dz * distance)]);
  uiTimer = 0;
}
function addGrenade(x, z, vx, vz, visual) { const g = newGroup(scene, x, 1.05, z); box(g, 0, 0, 0, .25, .32, .25, '#7c8660'); box(g, 0, .2, 0, .1, .12, .1, '#e7ad63'); glow(g, 0, .23, 0, '#ff8a42', .35); grenades.push({ mesh: g, x, y: 1.05, z, vx, vz, vy: 5, fuse: 1.06, r: 4.3 * (visual ? 1 : player.blast), damage: 200 * (visual ? 1 : player.damage * player.grenadeDmg), visual }); }
function placeBarrel() {
  if (state !== 'run' || player.barrelCD > 0 || player.status !== 'alive') return;
  if (player.barrels <= 0) { toast('NO BARRELS · FIND A SUPPLY CRATE'); return; }
  const x = player.x - Math.sin(player.angle) * 1.15, z = player.z - Math.cos(player.angle) * 1.15;
  if (solidAt(x, z, .62, true)) { toast('NOT ENOUGH SPACE BEHIND YOU'); return; }
  if (barrels.filter(b => b.alive).length >= 45) { toast('TOO MANY BARRELS IN THE YARD'); return; }
  const id = (coop() ? net.selfId.slice(0, 5) : 'p') + '.' + (++barrelSeq);
  createBarrel(x, z, true, id); player.barrels--; player.barrelCD = .4; audio.noise(.12, .32, 600); burst(x, .1, z, '#adad86', 7, 1.4); uiTimer = 0;
  if (coop()) netEvent(['bp', id, q10(x), q10(z)]);
}
function launchRocket(x, z, dx, dz, damage, r, visual) { const m = newGroup(scene, x, 1, z); box(m, 0, 0, 0, .16, .16, .48, '#e7b36c'); m.rotation.y = Math.atan2(dx, dz); glow(m, 0, 0, -.25, '#ffc288', .5); projectiles.push({ mesh: m, x, z, dx, dz, speed: 21, life: 1.9, kind: 'rocket', damage, r, visual }); }
function spit(x, z, dx, dz, broadcast) {
  const g = newGroup(scene, x, .9, z); const ball = new T.Mesh(effectSphere, mat('#df8057', '#803619')); ball.scale.setScalar(.18); g.add(ball); glow(g, 0, 0, 0, '#faaa64', .85);
  projectiles.push({ mesh: g, x, z, dx, dz, speed: 8, life: 3.7, kind: 'spit' }); audio.tone(160, 65, .21, .08, 'sawtooth');
  if (broadcast && coop()) netEvent(['sp', q10(x), q10(z), Math.round(dx * 100), Math.round(dz * 100)]);
}
function hazard(x, z, r, delay, dmg, broadcast = true) { hazards.push({ x, z, r, t: delay, dmg }); telegraph(x, z, r, delay); if (broadcast && coop() && net.isHost) netEvent(['hz', q10(x), q10(z), q10(r), Math.round(delay * 100), Math.round(dmg)]); }
function updateHazards(dt) { for (let i = hazards.length - 1; i >= 0; i--) { const h = hazards[i]; h.t -= dt; if (h.t > 0) continue; hazards.splice(i, 1); shockwave(h.x, h.z, h.r, '#ffb27a', .4); burst(h.x, .3, h.z, '#9a9278', 16, 5); shake = Math.max(shake, .3); audio.boom(.6); const d = Math.hypot(player.x - h.x, player.z - h.z); if (d < h.r) damagePlayer(h.dmg * (1 - d / h.r * .5), (player.x - h.x) / (d || 1) * 2, (player.z - h.z) / (d || 1) * 2); } }
function updateProjectiles(dt) {
  for (let i = projectiles.length - 1; i >= 0; i--) { const p = projectiles[i]; p.life -= dt; const distance = p.speed * dt; let hit = false, bestD = distance;
    for (const o of obstacles) { const t = rayRect(p.x, p.z, p.dx, p.dz, o, bestD, .06); if (t < bestD) { bestD = t; hit = true; } }
    if (p.kind === 'rocket') { for (const e of enemies) { if (e.spawn > 0) continue; const t = rayCircle(p.x, p.z, p.dx, p.dz, e.x, e.z, e.r + .2, bestD); if (t < bestD) { bestD = t; hit = true; } } for (const b of barrels) { if (!b.alive) continue; const t = rayCircle(p.x, p.z, p.dx, p.dz, b.x, b.z, b.r, bestD); if (t < bestD) { bestD = t; hit = true; } } }
    else if (player.status === 'alive') { const t = rayCircle(p.x, p.z, p.dx, p.dz, player.x, player.z, .6, bestD); if (t < bestD) { bestD = t; hit = true; damagePlayer(17, p.dx, p.dz); } }
    p.x += p.dx * bestD; p.z += p.dz * bestD; p.mesh.position.set(p.x, p.kind === 'rocket' ? 1 : .85, p.z); if (p.kind === 'rocket') { particle(p.x, 1, p.z, rand(-.3, .3), rand(.2, .6), rand(-.3, .3), '#b8ae8a', rand(.08, .18), .4); spark(p.x, 1, p.z, -p.dx * 2, rand(0, .5), -p.dz * 2, '#ffb35a', .07, .18); }
    if (hit || p.life <= 0 || Math.abs(p.x) > 22 || Math.abs(p.z) > 17) { scene.remove(p.mesh); if (p.kind === 'rocket') { if (!p.visual) localExplosion(p.x, p.z, p.r, p.damage, 'rocket'); } else { burst(p.x, .85, p.z, '#c98758', 7, 2); stain(p.x, p.z, .18, '#5c4738'); } projectiles.splice(i, 1); } }
  for (let i = grenades.length - 1; i >= 0; i--) { const g = grenades[i]; g.fuse -= dt; g.vy -= 11 * dt; let gx = g.x + g.vx * dt, gz = g.z + g.vz * dt; for (const o of obstacles) { if (g.y < o.h + .14 && circleBox(gx, gz, .14, o)) { g.vx *= -.48; g.vz *= -.48; gx = g.x; gz = g.z; break; } } if (Math.abs(gx) > 20.7) { g.vx *= -.5; gx = clamp(gx, -20.7, 20.7); } if (Math.abs(gz) > 15.7) { g.vz *= -.5; gz = clamp(gz, -15.7, 15.7); } g.x = gx; g.z = gz; g.y += g.vy * dt; if (g.y < .18) { g.y = .18; g.vy = Math.abs(g.vy) * .32; g.vx *= .8; g.vz *= .8; } g.mesh.position.set(g.x, g.y, g.z); g.mesh.rotation.x += dt * 9; g.mesh.rotation.z += dt * 6;
    if (g.fuse <= 0) { scene.remove(g.mesh); grenades.splice(i, 1); if (!g.visual) localExplosion(g.x, g.z, g.r, g.damage, 'grenade'); } }
  for (let i = explosionQueue.length - 1; i >= 0; i--) { const e = explosionQueue[i]; e.delay -= dt; if (e.delay <= 0) { explosionQueue.splice(i, 1); explode(e.x, e.z, e.radius, e.damage, e.source, e.owner, e.barrel); if (coop()) netEvent(['ex', q10(e.x), q10(e.z), q10(e.radius), Math.round(e.damage), 2, e.barrel || '']); } }
}

/* Pickups and drones. */
const PICK_KINDS = ['health', 'supply', 'overdrive'];
function dropPickup(id, x, z, kind, broadcast) {
  if (pickups.length >= 18) return;
  const g = newGroup(scene, x, .25, z), col = kind === 'health' ? '#b7cc9a' : kind === 'supply' ? '#d1b16a' : '#ef8f48';
  box(g, 0, .12, 0, .48, .28, .45, '#394f4c'); box(g, 0, .28, 0, .51, .075, .48, col);
  if (kind === 'health') { box(g, 0, .324, 0, .33, .017, .095, '#f0ead6'); box(g, 0, .328, 0, .095, .02, .33, '#f0ead6'); } else for (let i = -1; i <= 1; i++) box(g, i * .12, .33, 0, .065, .06, .29, '#efe0b0');
  const ring = new T.Mesh(pickRingGeo, new T.MeshBasicMaterial({ color: col, transparent: true, opacity: .6, depthWrite: false })); ring.rotation.x = -Math.PI / 2; ring.position.set(x, .04, z); scene.add(ring);
  const beam = glow(g, 0, .6, 0, col, .9);
  pickups.push({ id, x, z, kind, mesh: g, ring, beam, life: player.magnet ? 34 : 22, seed: rand(0, TAU) });
  if (broadcast && coop()) netEvent(['dp', id, PICK_KINDS.indexOf(kind), q10(x), q10(z)]);
}
function removePickup(i) { const p = pickups[i]; scene.remove(p.mesh); scene.remove(p.ring); p.ring.material.dispose(); pickups.splice(i, 1); }
function updatePickups(dt) {
  const reach = player.magnet ? 4.5 : 2;
  for (let i = pickups.length - 1; i >= 0; i--) { const p = pickups[i]; p.life -= dt; p.mesh.rotation.y += dt * .7; p.mesh.position.y = .24 + Math.sin(time * 3 + p.seed) * .08; p.ring.material.opacity = p.life < 4 ? .25 + Math.sin(time * 15) * .25 : .55;
    const alive = player.status === 'alive' && state === 'run', d = Math.hypot(player.x - p.x, player.z - p.z);
    if (d < reach && alive) { p.x = lerp(p.x, player.x, dt * 7); p.z = lerp(p.z, player.z, dt * 7); p.mesh.position.x = p.x; p.mesh.position.z = p.z; p.ring.position.set(p.x, .04, p.z); }
    if (d < .65 && alive) { collect(p); if (coop()) netEvent(['pk', p.id]); removePickup(i); }
    else if (p.life <= 0) removePickup(i); }
}
function collect(p) {
  audio.pickup();
  if (p.kind === 'health') { const heal = 25 * player.healMul; player.hp = Math.min(player.maxHp, player.hp + heal); floatText('+' + Math.round(heal) + ' HP', player.x, 2.3, player.z, '#d0e4b3'); runStats.healthPicks++; }
  else if (p.kind === 'supply') { player.grenades = Math.min(9, player.grenades + 1); player.barrels = Math.min(8, player.barrels + 1); ammo.forEach((_, j) => ammo[j] = cap(j)); player.reloading = false; floatText('RESUPPLIED', player.x, 2.3, player.z); }
  else { player.buff = 8 * player.overclock; toast('OVERDRIVE · ' + Math.round(8 * player.overclock) + ' SECONDS'); audio.unlock(); }
  uiTimer = 0;
}
function syncDrones() {
  while (drones.length < player.drones) { const g = newGroup(scene); box(g, 0, 0, 0, .28, .1, .28, '#3d4b4f'); box(g, 0, .08, 0, .14, .08, .14, '#9fb5b0'); for (const s of [-1, 1]) box(g, s * .22, .02, 0, .16, .02, .05, '#6c7c80'); glow(g, 0, -.06, 0, '#7fe0ff', .35); drones.push({ mesh: g, cd: rand(0, .5), angle: drones.length * Math.PI }); }
  while (drones.length > player.drones) scene.remove(drones.pop().mesh);
}
function updateDrones(dt) {
  if (!drones.length) return;
  for (let i = 0; i < drones.length; i++) { const d = drones[i]; d.angle += dt * 1.6; const x = player.x + Math.cos(d.angle + i * TAU / drones.length) * 1.3, z = player.z + Math.sin(d.angle + i * TAU / drones.length) * 1.3; d.mesh.position.set(x, 1.9 + Math.sin(time * 4 + i) * .08, z); d.mesh.visible = player.status !== 'dead';
    d.cd -= dt; if (d.cd > 0 || player.status !== 'alive' || state !== 'run') continue; d.cd = .55;
    let target = null, bestD = 11; for (const e of enemies) { if (e.spawn > 0 || (e.flags & 1)) continue; const dd = Math.hypot(e.x - x, e.z - z); if (dd < bestD && clearPath(x, z, e.x, e.z, .02, false)) { bestD = dd; target = e; } }
    if (target) { const a = Math.atan2(target.x - x, target.z - z); d.mesh.rotation.y = a; hitscan(a, 14 * player.damage, 12, .6, { x, z, drone: true, pierce: 0, power: .7, y: 1.8 }); audio.noise(.04, .1, 5000, 'highpass'); } }
}

/* Input. Explicit ownership: UI taps never also fire the gun. */
const keys = new Set(), mouse = { x: innerWidth * .7, y: innerHeight * .5, nx: .4, ny: 0, down: false, moved: false, inside: false };
const touch = { move: { x: 0, y: 0, active: false }, aim: { x: 0, y: 0, active: false } };
function getMove() { let x = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0), y = (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0); if (touch.move.active) { x = touch.move.x; y = touch.move.y; } const len = Math.hypot(x, y); if (len > 1) { x /= len; y /= len; } return { x: camRight.x * x + camDown.x * y, z: camRight.z * x + camDown.z * y }; }
function resetInputs() { keys.clear(); mouse.down = false; for (const kind of ['move', 'aim']) { touch[kind].x = touch[kind].y = 0; touch[kind].active = false; const knob = $(kind + 'Stick').querySelector('.knob'); if (knob) knob.style.transform = 'translate(0,0)'; } }
function aimUpdate() { if (touch.aim.active && Math.hypot(touch.aim.x, touch.aim.y) > .15) { const dx = camRight.x * touch.aim.x + camDown.x * touch.aim.y, dz = camRight.z * touch.aim.x + camDown.z * touch.aim.y; player.angle = Math.atan2(dx, dz); aimPoint.set(player.x + dx * 12, 1, player.z + dz * 12); } else if (mouse.moved) { raycaster.setFromCamera({ x: mouse.nx, y: mouse.ny }, camera); if (raycaster.ray.intersectPlane(aimPlane, aimPoint)) { const dx = aimPoint.x - player.x, dz = aimPoint.z - player.z; if (Math.hypot(dx, dz) > .14) player.angle = Math.atan2(dx, dz); } } }
function updatePlayer(dt, demo = false, control = true) {
  player.shot = Math.max(0, player.shot - dt); player.recoil = Math.max(0, player.recoil - dt * 2.4); player.invuln = Math.max(0, player.invuln - dt); player.dashCD = Math.max(0, player.dashCD - dt); player.grenadeCD = Math.max(0, player.grenadeCD - dt); player.barrelCD = Math.max(0, player.barrelCD - dt); player.buff = Math.max(0, player.buff - dt);
  if (player.reloading) { player.reload -= dt; if (player.reload <= 0) { ammo[player.gun] = cap(player.gun); player.reloading = false; if (!demo) audio.noise(.065, .13, 5000, 'highpass'); uiTimer = 0; } }
  if (player.regen && player.status === 'alive' && !demo) { regenTimer -= dt; if (regenTimer <= 0) { regenTimer = 2.5; player.hp = Math.min(player.maxHp, player.hp + 1); } }
  if (demo) {
    const tx = 3 + Math.cos(time * .21) * 2.5, tz = 3 + Math.sin(time * .21) * 2; const dx = tx - player.x, dz = tz - player.z, len = Math.hypot(dx, dz); moveBody(player, dx * dt * .8, dz * dt * .8); player.move = Math.min(1, len);
    let nearest = null, bestD = 22; for (const e of enemies) { const d = Math.hypot(e.x - player.x, e.z - player.z); if (d < bestD && clearPath(player.x, player.z, e.x, e.z, .01)) { nearest = e; bestD = d; } }
    if (nearest) { player.angle = Math.atan2(nearest.x - player.x, nearest.z - player.z); if (bestD < 19) fire(); } else player.angle += dt * .2;
    if (Math.hypot(dx, dz) > .05) player.feet += shortestAngle(player.feet, Math.atan2(dx, dz)) * Math.min(1, dt * 8);
  } else if (player.status === 'down') {
    player.move = 0; player.vx = player.vz = 0; player.bleed -= dt;
    let reviver = null; for (const r of net.remotes.values()) if (r.inRun && r.status === 'alive' && Math.hypot(r.x - player.x, r.z - player.z) < 1.7) { reviver = r; break; }
    if (reviver) player.rev += dt / (reviver.char === 'medic' ? 1.7 : 2.6); else player.rev = Math.max(0, player.rev - dt * .25);
    if (player.rev >= 1) { player.status = 'alive'; player.hp = player.maxHp * .4; player.invuln = 2; player.rev = 0; audio.revive(); shockwave(player.x, player.z, 2.4, '#bfe8c0', .4); netEvent(['rv', reviver.id]); uiTimer = 0; }
    else if (player.bleed <= 0) { player.status = 'dead'; uiTimer = 0; }
  } else if (player.status === 'alive') {
    const v = control ? getMove() : { x: 0, z: 0 }, len = Math.hypot(v.x, v.z); player.move = len;
    if (player.dashTime > 0) { player.dashTime -= dt; moveBody(player, player.dashX * 25 * dt, player.dashZ * 25 * dt); if (Math.random() < .45) particle(player.x, .07, player.z, rand(-.3, .3), .15, rand(-.3, .3), '#d4c3a2', .14, .4); }
    else { const speed = 7.25 * player.speed * (weaponDefs[player.gun].id === 'minigun' && mouse.down ? .72 : 1); const blend = 1 - Math.exp(-24 * dt); player.vx = lerp(player.vx, v.x * speed, blend); player.vz = lerp(player.vz, v.z * speed, blend); moveBody(player, player.vx * dt, player.vz * dt); }
    if (len > .08) { player.feet += shortestAngle(player.feet, Math.atan2(v.x, v.z)) * Math.min(1, dt * 15); footTimer -= dt; if (footTimer <= 0) { footTimer = .22; audio.noise(.045, .07, 480); } }
    if (control) { aimUpdate(); if (mouse.down || (touch.aim.active && Math.hypot(touch.aim.x, touch.aim.y) > .22)) fire(); }
  }
  player.walk += dt * (player.move > .08 ? 11 * player.speed : 1.3);
  player.aim += shortestAngle(player.aim, player.angle) * Math.min(1, dt * 28);
  if (playerLight.intensity > 0) playerLight.intensity = Math.max(0, playerLight.intensity - dt * 40);
  if (flashlight && flashlight.visible) flashlight.position.set(player.x + Math.sin(player.angle) * 2.6, .035, player.z + Math.cos(player.angle) * 2.6);
}
function localSurvivor() { return { x: player.x, z: player.z, angle: player.angle, aim: player.aim, feet: player.feet, walk: player.walk, move: player.move, recoil: player.recoil, gun: player.gun, status: player.status, char: charId, buff: player.buff > 0, rev: player.rev, visible: player.status !== 'dead' && (player.invuln <= 0 || Math.floor(time * 20) % 2 === 0 || player.dashTime > 0 || state === 'menu') }; }
function drawSurvivors() {
  sN = 0; drawSurvivor(localSurvivor(), 0); let slot = 1;
  for (const r of net.remotes.values()) { if (slot > 3) break; if (!r.inRun || !runActive()) continue; drawSurvivor(r, slot++); }
  for (; slot < 4; slot++) { rings[slot].ring.visible = false; rings[slot].disc.visible = false; muzzles[slot].visible = false; }
  survivorBatch.count = sN; survivorBatch.instanceMatrix.needsUpdate = true; if (survivorBatch.instanceColor) survivorBatch.instanceColor.needsUpdate = true;
}

/* Waves, bosses and the director. */
function beginWave(n) {
  wave = n || wave + 1; const players = teamSize();
  waveTotal = L.waveSize(wave, difficulty, players, director.rating) + (L.isBossWave(wave) ? 1 : 0);
  spawnLeft = waveTotal; spawnTimer = .55; waveKilled = 0; waveBreak = -1; pendingUpgrade = false; waveStart = runTime; net.waiting = false;
  bossPending = L.isBossWave(wave); bossDelay = 2.5;
  announce('WAVE ' + String(wave).padStart(2, '0'), bossPending ? 'BOSS INCOMING' : wave === 1 && daily ? 'DAILY · ' + daily.modName.toUpperCase() : '', 2.1); audio.wave(); uiTimer = 0;
  if (player.overclockStart) player.buff = Math.max(player.buff, 6);
  if (player.status !== 'alive') respawn();
  if (coop() && net.isHost) netEvent(['wv', wave]);
  checkUnlocks();
}
function respawn() {
  let ax = 0, az = 4; for (const r of net.remotes.values()) if (r.inRun && r.status === 'alive') { ax = r.x; az = r.z; break; }
  player.x = clamp(ax + rand(-1.5, 1.5), -19, 19); player.z = clamp(az + rand(-1.5, 1.5), -14, 14); moveBody(player, 0, 0);
  player.status = 'alive'; player.hp = player.maxHp * .5; player.invuln = 2; player.rev = 0; uiTimer = 0;
}
function waveUpdate(dt) {
  if (spawnLeft > 0) {
    const p = L.directorParams(director), players = teamSize(), limit = Math.min(coop() ? COOP_CAP : maxEnemies, (65 + wave * 3) * p.cap);
    if (bossPending) { bossDelay -= dt; if (bossDelay <= 0) { const kind = L.bossFor(wave), side = player.x > 0 ? -1 : 1; if (spawnEnemy(kind, { x: side * 18.5, z: rr(-3, 3) })) { bossPending = false; spawnLeft--; announce(STATS[kind].name.toUpperCase(), 'BOSS', 2.4); audio.roar(); shake = .35; } else bossDelay = .3; } }
    spawnTimer -= dt;
    if (spawnTimer <= 0 && enemies.length < limit && spawnLeft > (bossPending ? 1 : 0)) {
      const kind = L.pickKind(wave, runRng(), p.special, runMod);
      if (spawnEnemy(kind)) { spawnLeft--; spawnTimer = Math.max(.14, .66 - wave * .039) * (difficulty === 0 ? 1.12 : difficulty === 2 ? .8 : 1) / p.rate / (1 + .3 * (players - 1)); } else spawnTimer = .1;
    }
  }
  if (spawnLeft === 0 && enemies.length === 0 && !pendingUpgrade && waveBreak < 0) {
    waveBreak = 1.5; L.directorWaveEnd(director, { seconds: runTime - waveStart, expected: waveTotal * .9, hpFrac: player.hp / player.maxHp });
    if (coop()) netEvent(['cl', wave, L.isBossWave(wave) ? 1 : 0]);
    waveCleared(L.isBossWave(wave));
  }
  if (waveBreak >= 0 && !pendingUpgrade) { waveBreak -= dt; if (waveBreak <= 0) { pendingUpgrade = true; showUpgrades(); if (coop()) { net.ready = new Set(); net.readyTimer = 25; } } }
  if (coop() && net.isHost && pendingUpgrade && wave > 0) {
    net.readyTimer -= dt; if (state === 'upgrade' && net.readyTimer <= 0) pickUpgrade(0); const need = [selfKey(), ...[...net.remotes.values()].filter(r => r.inRun).map(r => r.id)];
    if (state !== 'upgrade' && (need.every(id => net.ready.has(id)) || net.readyTimer <= 0)) beginWave(wave + 1);
  }
}
function waveCleared(boss) {
  announce('WAVE ' + String(wave).padStart(2, '0') + ' CLEAR', boss ? 'MILESTONE' : '', 1.4); audio.unlock();
  if (player.status !== 'alive') respawn();
  player.hp = Math.min(player.maxHp, player.hp + 12); player.grenades = Math.min(9, player.grenades + 1); player.barrels = Math.min(8, player.barrels + 1); for (let i = 0; i < ammo.length; i++) ammo[i] = cap(i); player.reloading = false; uiTimer = 0;
  upgradeRare = boss; waveBreak = Math.max(waveBreak, 1.5);
}
function directorStep(dt, near) {
  let hp = player.status === 'alive' ? player.hp / player.maxHp : 0, n = 1;
  for (const r of net.remotes.values()) if (r.inRun) { hp += r.status === 'alive' ? r.hp / 100 : 0; n++; }
  L.directorUpdate(director, dt, { damage: damageThisStep, near, hpFrac: hp / n }); damageThisStep = 0;
}

/* Upgrades: standard picks every wave, rare picks after each boss. */
const UPGRADES = [
  { id: 'dmg', name: 'Hot load', desc: '+20% weapon damage.', icon: 'ammo-icon', max: 6, apply: () => player.damage *= 1.2 },
  { id: 'reload', name: 'Quick hands', desc: 'Reload 25% faster.', icon: 'reload-icon', max: 4, apply: () => player.reloadSpeed *= 1.25 },
  { id: 'speed', name: 'Light on your feet', desc: '+12% movement speed.', icon: 'dash-icon', max: 4, apply: () => player.speed = Math.min(1.65, player.speed * 1.12) },
  { id: 'hp', name: 'Thick skin', desc: '+25 max health. Heal 35.', icon: 'shield-icon', max: 6, apply: () => { player.maxHp += 25; player.hp = Math.min(player.maxHp, player.hp + 35); } },
  { id: 'blast', name: 'Bigger boom', desc: '+20% blast radius. +2 grenades.', icon: 'grenade-icon', max: 4, apply: () => { player.blast = Math.min(2.3, player.blast * 1.2); player.grenades = Math.min(9, player.grenades + 2); } },
  { id: 'mag', name: 'Extended mag', desc: '+30% magazine capacity.', icon: 'ammo-icon', max: 4, apply: () => { player.mag *= 1.3; ammo.forEach((_, i) => ammo[i] = cap(i)); } },
  { id: 'vamp', name: 'Blood bank', desc: 'Every kill restores 1 health.', icon: 'health-icon', max: 4, apply: () => player.vampire += 1 },
  { id: 'rate', name: 'Hair trigger', desc: '+15% fire rate.', icon: 'dash-icon', max: 5, apply: () => player.rate = Math.min(2.2, player.rate * 1.15) },
  { id: 'care', name: 'Care package', desc: 'Full health. +3 grenades & barrels.', icon: 'barrel-icon', max: 99, apply: () => { player.hp = player.maxHp; player.grenades = Math.min(9, player.grenades + 3); player.barrels = Math.min(8, player.barrels + 3); } },
  { id: 'pierce', name: 'Piercing rounds', desc: 'Bullets pass through one more zombie.', icon: 'pierce-icon', max: 3, apply: () => player.pierce++ },
  { id: 'fire', name: 'Incendiary', desc: 'Bullets set zombies on fire.', icon: 'fire-icon', max: 3, apply: () => player.burnDps += 6 },
  { id: 'drone', name: 'Drone', desc: 'A drone circles you and shoots.', icon: 'drone-icon', max: 2, apply: () => { player.drones++; syncDrones(); } },
  { id: 'crit', name: 'Steady aim', desc: '+10% chance of double damage.', icon: 'crit-icon', max: 4, apply: () => player.crit += .1 },
  { id: 'adren', name: 'Adrenaline', desc: 'Kills cut dash cooldown. Dash 15% sooner.', icon: 'dash-icon', max: 2, apply: () => { player.adrenaline = 1; player.dashMul *= .85; } },
  { id: 'shock', name: 'Shock dash', desc: 'Dashing blasts nearby zombies away.', icon: 'bolt-icon', max: 1, apply: () => player.shockDash = 1 },
  { id: 'magnet', name: 'Magnet', desc: 'Pull pickups from further away.', icon: 'magnet-icon', max: 1, apply: () => player.magnet = 1 },
  { id: 'chain', name: 'Chain shock', desc: 'Hits can arc to two nearby zombies.', icon: 'bolt-icon', max: 3, apply: () => player.chain += .12 },
];
const RARE = [
  { id: 'jugg', name: 'Juggernaut', desc: '+60 max health. Full heal.', icon: 'shield-icon', max: 2, apply: () => { player.maxHp += 60; player.hp = player.maxHp; player.speed *= .95; } },
  { id: 'storm', name: 'Bullet storm', desc: '+35% fire rate, +20% damage.', icon: 'star-icon', max: 2, apply: () => { player.rate = Math.min(2.8, player.rate * 1.35); player.damage *= 1.2; } },
  { id: 'phoenix', name: 'Phoenix', desc: 'Get back up once with 60% health.', icon: 'heart-icon', max: 1, apply: () => player.phoenix++ },
  { id: 'twin', name: 'Twin drones', desc: '+2 drones.', icon: 'drone-icon', max: 1, apply: () => { player.drones += 2; syncDrones(); } },
  { id: 'nuke', name: 'Warhead', desc: 'Grenades hit 80% harder, +40% radius.', icon: 'grenade-icon', max: 1, apply: () => { player.grenadeDmg *= 1.8; player.blast = Math.min(2.8, player.blast * 1.4); player.grenades = Math.min(9, player.grenades + 3); } },
  { id: 'overclock', name: 'Overclock', desc: 'Overdrive lasts twice as long and starts every wave.', icon: 'star-icon', max: 1, apply: () => { player.overclock = 2; player.overclockStart = 1; } },
];
function showUpgrades() {
  state = 'upgrade'; resetInputs(); $('crosshair').style.display = 'none'; document.body.classList.remove('playing'); $('upgrade').classList.remove('hidden');
  $('upgradeEyebrow').textContent = 'WAVE ' + String(wave).padStart(2, '0') + ' CLEARED'; $('upgradeTitle').textContent = upgradeRare ? 'Pick a rare upgrade' : 'Pick an upgrade';
  const pool = upgradeRare ? RARE : UPGRADES, count = runMod === 'scarce' ? 4 : 3;
  upgradeChoices = L.pickUpgrades(pool, upCounts, runRng, count);
  if (upgradeChoices.length < count) upgradeChoices.push(...L.pickUpgrades(UPGRADES.filter(u => !upgradeChoices.includes(u)), upCounts, runRng, count - upgradeChoices.length));
  $('upgradeCards').classList.toggle('four', upgradeChoices.length > 3);
  $('upgradeCards').innerHTML = upgradeChoices.map((u, i) => '<button class="upgrade-card' + (upgradeRare ? ' rare' : '') + '" data-upgrade="' + i + '"><span class="key">' + (i + 1) + '</span><svg class="icon"><use href="#' + u.icon + '"/></svg><h3>' + u.name + '</h3><p>' + u.desc + '</p></button>').join('');
  document.querySelectorAll('[data-upgrade]').forEach(b => b.onclick = () => pickUpgrade(+b.dataset.upgrade));
}
function pickUpgrade(i) {
  if (state !== 'upgrade' || !upgradeChoices[i]) return;
  const u = upgradeChoices[i]; u.apply(); upCounts[u.id] = (upCounts[u.id] || 0) + 1;
  $('upgrade').classList.add('hidden'); state = 'run'; document.body.classList.add('playing'); player.invuln = .7; audio.unlock(); upgradeRare = false;
  if (coop()) { net.waiting = true; if (net.isHost) net.ready.add(selfKey()); else netEvent(['rd', wave]); updateUI(); return; }
  beginWave(); updateUI();
}
function announce(title, sub = '', duration = 1.7) { $('announceTitle').textContent = title; $('announceSub').textContent = sub; announceTimer = duration; $('announcement').classList.add('show'); }
function toast(message) { if (state === 'menu') return; $('toast').textContent = message; toastTimer = 2.5; $('toast').classList.add('show'); }

/* HUD. */
function updateUI() {
  $('hp').textContent = Math.ceil(player.hp); $('maxHp').textContent = Math.round(player.maxHp); $('hpBar').style.width = player.hp / player.maxHp * 100 + '%'; $('hpBar').style.background = player.hp < 30 ? '#e94632' : '#ff874b'; $('dashBar').style.width = (1 - player.dashCD / (1.65 * player.dashMul)) * 100 + '%';
  $('score').textContent = String(score).padStart(5, '0'); $('waveLabel').textContent = 'WAVE ' + String(wave).padStart(2, '0');
  let remaining = (spawnLeft + enemies.length) + ' remaining';
  if (net.waiting) { const total = teamSize(), ready = net.isHost ? net.ready.size : Math.max(1, net.readyCount || 1); remaining = 'Waiting for team · ' + Math.min(ready, total) + '/' + total; }
  else if (waveBreak >= 0 || (coop() && net.phase === 1)) remaining = 'Perimeter clear';
  $('remaining').textContent = remaining;
  $('waveBar').style.width = (waveTotal ? Math.min(1, waveKilled / waveTotal) * 100 : 0) + '%';
  $('ammoCount').textContent = ammo[player.gun]; $('ammoMax').textContent = '/ ' + cap(player.gun); $('reloadText').classList.toggle('hidden', !player.reloading); $('ammoCount').style.color = player.reloading ? '#e9b578' : '#eef3e9';
  $('grenades').textContent = player.grenades; $('barrelCount').textContent = player.barrels;
  let shown = 0, nextLocked = true;
  for (let i = 0; i < weaponDefs.length; i++) { const b = $('weapon' + i), locked = !unlocked(i); const visible = !locked || nextLocked; if (locked && visible) nextLocked = false; b.classList.toggle('hidden', !visible); if (visible) shown++; b.classList.toggle('active', i === player.gun); b.classList.toggle('locked', locked); b.disabled = locked; b.setAttribute('aria-pressed', String(i === player.gun)); b.querySelector('.requirement').style.display = locked ? 'flex' : 'none'; }
  $('weaponDock').style.setProperty('--slots', shown);
  const multi = Math.min(8, 1 + Math.floor(chain / 5)); $('combo').style.opacity = chain >= 5 && chainTimer > 0 ? '1' : '0'; $('comboValue').textContent = '×' + multi; $('comboTrack').style.transform = 'scaleX(' + Math.max(0, chainTimer / 3.2) + ')';
  const boss = enemies.find(e => e.boss);
  $('bossWrap').classList.toggle('hidden', !boss);
  if (boss) { $('bossName').textContent = STATS[boss.kind].name; $('bossFill').style.width = (boss.remote ? boss.hpPct : boss.hp / boss.maxHp * 100) + '%'; }
  const down = player.status !== 'alive' && runActive() && coop();
  $('downPanel').classList.toggle('hidden', !down);
  if (down) { $('downTitle').textContent = player.status === 'down' ? 'Down' : 'Out until the wave ends'; $('downBar').style.width = (player.status === 'down' ? clamp(player.rev, 0, 1) * 100 : 0) + '%'; $('bleedBar').style.width = (player.status === 'down' ? clamp(player.bleed / 25, 0, 1) * 100 : 0) + '%'; $('downBars').classList.toggle('hidden', player.status !== 'down'); }
  renderTeam();
}
function renderTeam() {
  const el = $('team'); if (!coop()) { el.classList.add('hidden'); $('teamScore').classList.add('hidden'); return; }
  el.classList.remove('hidden'); const rows = [...net.remotes.values()].filter(r => r.inRun);
  while (el.children.length < rows.length) { const row = document.createElement('div'); row.className = 'mate'; row.innerHTML = '<i></i><span></span><b><em></em></b>'; el.appendChild(row); }
  while (el.children.length > rows.length) el.lastChild.remove();
  let team = score; rows.forEach((r, i) => { const row = el.children[i]; team += r.score || 0; row.querySelector('i').style.background = (SURVIVORS[r.char] || SURVIVORS.ranger).ring; row.querySelector('span').textContent = r.name; row.classList.toggle('down', r.status !== 'alive'); row.querySelector('em').style.width = (r.status === 'alive' ? r.hp : 0) + '%'; });
  $('teamScore').classList.remove('hidden'); $('teamScore').textContent = 'TEAM ' + team.toLocaleString();
}
function teamRows() {
  const rows = [{ name: (Lud() && Lud().player && Lud().player.name) || 'You', score, kills, revives: runStats.revives, you: true }];
  for (const r of net.remotes.values()) if (r.inRun) rows.push({ name: r.name, score: r.score || 0, kills: r.kills || 0, revives: r.revives || 0 });
  return rows.sort((a, b) => b.score - a.score);
}
function renderBoard(el) {
  el.textContent = ''; const rows = teamRows();
  for (const r of rows) { const row = document.createElement('div'); row.className = 'tb-row' + (r.you ? ' you' : ''); const n = document.createElement('span'); n.textContent = r.name; const s = document.createElement('b'); s.textContent = r.score.toLocaleString(); const k = document.createElement('small'); k.textContent = r.kills + ' kills' + (r.revives ? ' · ' + r.revives + ' revives' : ''); row.append(n, k, s); el.appendChild(row); }
}
const nameLabels = new Map();
function updateLabels() {
  const active = coop() && runActive(); const seen = new Set();
  if (active) for (const r of net.remotes.values()) {
    if (!r.inRun || r.status === 'dead') continue; seen.add(r.id);
    let el = nameLabels.get(r.id); if (!el) { el = document.createElement('div'); el.className = 'mate-label'; $('nameLayer').appendChild(el); nameLabels.set(r.id, el); }
    if (el.textContent !== r.name) el.textContent = r.name;
    el.classList.toggle('down', r.status === 'down');
    v3.set(r.x, 2.4, r.z).project(camera); let x = (v3.x * .5 + .5) * innerWidth, y = (-v3.y * .5 + .5) * innerHeight;
    const off = x < 24 || x > innerWidth - 24 || y < 60 || y > innerHeight - 40; x = clamp(x, 40, innerWidth - 40); y = clamp(y, 70, innerHeight - 50);
    el.classList.toggle('edge', off); el.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px) translate(-50%,-100%)';
  }
  for (const [id, el] of nameLabels) if (!seen.has(id)) { el.remove(); nameLabels.delete(id); }
}

/* Co-op networking through Ludvig.mp. */
const GAME_ID = 'deadblock';
const net = { mode: 'solo', room: null, isHost: false, selfId: '', remotes: new Map(), sendT: 0, ev: [], hits: new Map(), bh: new Map(), lastPose: '', lastSend: 0, ready: new Set(), readyTimer: 0, readyCount: 0, waiting: false, phase: 0, run: 0, unsub: [], inLobby: false, map: 0, diff: 1 };
const coop = () => net.mode === 'coop';
const authority = () => !coop() || net.isHost || !runActive();
const runActive = () => state === 'run' || state === 'paused' || state === 'upgrade';
function netEvent(ev) { if (coop() && net.room && runActive() && net.ev.length < 200) net.ev.push(ev); }
function peerName(id) { const p = net.room && net.room.peers.find(q => q.id === id); return p ? p.name : 'Player'; }
function remoteFor(id) {
  let r = net.remotes.get(id);
  if (!r) { r = { id, name: peerName(id), buf: L.createInterp(), x: 0, z: 0, angle: 0, aim: 0, feet: 0, walk: 0, move: 0, recoil: 0, gun: 0, status: 'alive', hp: 100, char: 'ranger', score: 0, kills: 0, revives: 0, rev: 0, buff: false, inRun: false, visible: true, lx: 0, lz: 0 }; net.remotes.set(id, r); }
  return r;
}
const STATUS = ['alive', 'down', 'dead'];
function poseMessage() {
  const msg = { t: 'p', r: net.run, x: q10(player.x), z: q10(player.z), a: Math.round(player.angle * 100), g: player.gun, st: STATUS.indexOf(player.status), hp: Math.round(player.hp / player.maxHp * 100), c: CHAR_IDS.indexOf(charId), sc: score, k: kills, rv: runStats.revives, b: player.buff > 0 ? 1 : 0, rp: Math.round(player.rev * 100) };
  if (player.shots) { msg.f = Math.min(9, player.shots); player.shots = 0; }
  return msg;
}
function netTick(dt) {
  if (!coop() || !net.room || !runActive()) return;
  net.sendT -= dt; if (net.sendT > 0) return; net.sendT = Math.max(.05, net.sendT + .1);
  const msg = poseMessage();
  if (net.hits.size) { msg.h = [...net.hits].slice(0, 60).map(([id, h]) => [id, Math.round(h[0]), Math.round(h[1] * 10), Math.round(h[2] * 10), h[3]]); net.hits.clear(); }
  if (net.bh.size) { msg.bh = [...net.bh].map(([id, d]) => [id, Math.round(d)]); net.bh.clear(); }
  if (net.ev.length) msg.ev = net.ev.splice(0, 60);
  // Host snapshot: zombies go in zs, because z is the host's own position.
  if (net.isHost) { msg.t = 's'; msg.zs = L.packZombies(enemies, COOP_CAP); msg.w = wave; msg.sl = spawnLeft; msg.wt = waveTotal; msg.wk = waveKilled; msg.ph = pendingUpgrade || waveBreak >= 0 ? 1 : 0; msg.rc = net.ready.size; }
  else {
    const key = msg.x + ',' + msg.z + ',' + msg.a + ',' + msg.st + ',' + msg.hp + ',' + msg.g + ',' + msg.sc + ',' + msg.rp;
    if (key === net.lastPose && !msg.f && !msg.h && !msg.bh && !msg.ev && time - net.lastSend < 1) return;
    net.lastPose = key;
  }
  let text = JSON.stringify(msg);
  while (text.length > 3900 && msg.ev && msg.ev.length) { net.ev.unshift(...msg.ev.splice(Math.floor(msg.ev.length / 2))); if (!msg.ev.length) delete msg.ev; text = JSON.stringify(msg); }
  if (text.length > 3900 && msg.zs) { msg.zs = msg.zs.slice(0, L.ZSTRIDE * 60); text = JSON.stringify(msg); }
  net.lastSend = time; net.room.send(msg);
}
function applyPose(from, d, now) {
  if (d.r !== net.run) return null;
  const r = remoteFor(from); r.inRun = true;
  const x = (d.x || 0) / 10, z = (d.z || 0) / 10, a = (d.a || 0) / 100;
  L.interpPush(r.buf, now, x, z, a);
  r.gun = clamp(d.g | 0, 0, weaponDefs.length - 1); r.status = STATUS[d.st] || 'alive'; r.hp = clamp(d.hp ?? 100, 0, 100); r.char = CHAR_IDS[d.c] || 'ranger';
  r.score = d.sc || 0; r.kills = d.k || 0; r.revives = d.rv || 0; r.buff = !!d.b; r.rev = (d.rp || 0) / 100;
  if (d.f) remoteShots(r, Math.min(3, d.f));
  return r;
}
function remoteShots(r, n) {
  const w = weaponDefs[r.gun] || weaponDefs[0], vol = clamp(1 - Math.hypot(r.x - player.x, r.z - player.z) / 40, .15, .6);
  r.recoil = w.kick; audio.shot(w.id, vol);
  if (w.id === 'flame') { for (let i = 0; i < 6; i++) { const a = r.angle + rand(-w.spread, w.spread) * .8, s = rand(7, 11); spark(r.x + Math.sin(r.angle) * .7, 1, r.z + Math.cos(r.angle) * .7, Math.sin(a) * s, rand(.2, 1.2), Math.cos(a) * s, Math.random() < .5 ? '#ffb347' : '#ff6a2a', rand(.08, .14), rand(.35, .55), 2.6); } }
  else if (w.id !== 'rocket') for (let i = 0; i < (w.pellets > 1 ? 4 : n); i++) { const a = r.angle + rand(-w.spread, w.spread), dx = Math.sin(a), dz = Math.cos(a), sx = r.x + dx * .43, sz = r.z + dz * .43, d = wallDistance(sx, sz, dx, dz, w.range); tracer(sx, sz, sx + dx * d, sz + dz * d, w.id === 'rail' ? 4 : 1, w.id === 'rail' ? railMat : tracerMat, w.id === 'rail' ? .28 : .07); }
  if (net.isHost) noise(r.x, r.z, w.noise, r.id);
}
function onNetMessage(from, d) {
  if (!d || typeof d !== 'object') return;
  const now = performance.now();
  try {
    if (d.t === 'go') { if (from === net.room.host) startCoopRun(d, false); return; }
    if (d.t === 'sync') { if (!runActive() || net.run !== d.run) startCoopRun(d, true); return; }
    if (d.t === 'hi') { if (net.isHost && runActive()) sendSync(from); else if (net.isHost) publishLobby(); return; }
    if (d.t === 'lobby') { renderLobby(); return; }
    if (d.t !== 'p' && d.t !== 's') return;
    if (!runActive() && state !== 'dead') return;
    const r = applyPose(from, d, now); if (!r) return;
    if (d.t === 's' && from === net.room.host && !net.isHost) applySnapshot(d, now);
    if (net.isHost) {
      if (Array.isArray(d.h)) for (const h of d.h) { const e = zMap.get(h[0]); if (e && !e.remote) applyDamage(e, clamp(+h[1] || 0, 0, 2000), (+h[2] || 0) / 10, (+h[3] || 0) / 10, 1, from, !!h[4]); }
      if (Array.isArray(d.bh)) for (const [id, dmg] of d.bh) { const b = barrels.find(q => q.id === id); if (b) damageBarrel(b, clamp(+dmg || 0, 0, 2000), from); }
    }
    if (Array.isArray(d.ev)) for (const ev of d.ev) if (Array.isArray(ev)) handleEvent(from, ev);
  } catch (err) { console.warn('Bad co-op message', err); }
}
function applySnapshot(d, now) {
  if (typeof d.w === 'number' && d.w !== wave && d.w > 0 && wave === 0) { wave = d.w; }
  spawnLeft = d.sl | 0; waveTotal = d.wt | 0; waveKilled = d.wk | 0; net.phase = d.ph | 0; net.readyCount = d.rc | 0;
  // Kills in this snapshot's events are handled first (handleEvent), so proxies still exist for gore.
  if (Array.isArray(d.ev)) for (const ev of d.ev) if (ev[0] === 'k') { handleKill(ev); ev[0] = '_'; }
  const list = L.unpackZombies(d.zs), seen = new Set();
  for (const z of list) {
    let e = zMap.get(z.id);
    if (!e) { e = newEnemy(z.id, z.kind, z.x, z.z); e.remote = true; e.buf = L.createInterp(); e.angle = z.a; e.hp = e.maxHp = 100; enemies.push(e); zMap.set(z.id, e); }
    L.interpPush(e.buf, now, z.x, z.z, z.a); e.hpPct = z.hp; e.hp = Math.max(1, z.hp); e.flags = z.flags; e.spawn = 0; seen.add(z.id);
  }
  for (let i = enemies.length - 1; i >= 0; i--) { const e = enemies[i]; if (e.remote && !seen.has(e.id)) { enemies.splice(i, 1); zMap.delete(e.id); burns.delete(e); } }
}
function handleKill(ev) {
  const [, id, by, kindIdx, x10, z10, expl] = ev; const e = zMap.get(id);
  const kind = L.KINDS[kindIdx] || 'walker';
  if (e) { e.x = x10 / 10; e.z = z10 / 10; gore(e); const i = enemies.indexOf(e); if (i >= 0) enemies.splice(i, 1); zMap.delete(id); burns.delete(e); }
  if (by === net.selfId) creditKill(kind, x10 / 10, z10 / 10, !!expl);
  if (L.isBoss(kind)) bossDown({ kind });
}
function handleEvent(from, ev) {
  const c = ev[0];
  if (c === 'k') { if (!net.isHost) handleKill(ev); }
  else if (c === 'hu') { if (ev[1] === net.selfId) damagePlayer(+ev[2] || 0, (+ev[3] || 0) / 10, (+ev[4] || 0) / 10); }
  else if (c === 'sp') spit(ev[1] / 10, ev[2] / 10, ev[3] / 100, ev[4] / 100, false);
  else if (c === 'hz') { if (!net.isHost) hazard(ev[1] / 10, ev[2] / 10, ev[3] / 10, ev[4] / 100, +ev[5] || 0, false); }
  else if (c === 'ex') explode(ev[1] / 10, ev[2] / 10, clamp(ev[3] / 10, .5, 12), clamp(+ev[4] || 0, 0, 1500), SRC[ev[5]] || 'grenade', from, ev[6] || '');
  else if (c === 'gr') addGrenade(ev[1] / 10, ev[2] / 10, ev[3] / 10, ev[4] / 10, true);
  else if (c === 'rk') launchRocket(ev[1] / 10, ev[2] / 10, ev[3] / 100, ev[4] / 100, 0, 1, true);
  else if (c === 'bp') { if (!barrels.some(b => b.id === ev[1])) createBarrel(ev[2] / 10, ev[3] / 10, true, String(ev[1])); }
  else if (c === 'dp') { if (!net.isHost && !pickups.some(p => p.id === ev[1])) dropPickup(ev[1], ev[3] / 10, ev[4] / 10, PICK_KINDS[ev[2]] || 'health', false); }
  else if (c === 'pk') { const i = pickups.findIndex(p => p.id === ev[1]); if (i >= 0) removePickup(i); }
  else if (c === 'cl') { if (!net.isHost) { wave = ev[1] || wave; waveBreak = 1.5; pendingUpgrade = false; net.phase = 1; waveCleared(!!ev[2]); clientBreak = 1.5; } }
  else if (c === 'wv') { if (!net.isHost) { if (state === 'upgrade') pickUpgrade(0); net.phase = 0; clientBreak = -1; beginWave(ev[1]); } }
  else if (c === 'rd') { if (net.isHost) net.ready.add(from); }
  else if (c === 'rv') { if (ev[1] === net.selfId) { runStats.revives++; toast('REVIVED ' + peerName(from).toUpperCase()); audio.revive(); checkUnlocks(); } }
  else if (c === 'sc') fxScream(ev[1] / 10, ev[2] / 10, ev[3] / 10);
  else if (c === 'ov') { if (from === net.room.host && runActive()) gameOver(); }
}
let clientBreak = -1;
function clientUpdate(dt) {
  if (clientBreak >= 0) { clientBreak -= dt; if (clientBreak < 0 && state === 'run' && !net.waiting) { pendingUpgrade = true; showUpgrades(); } }
}
function interpolateRemotes(now) {
  const t = now - 110;
  for (const r of net.remotes.values()) {
    if (!r.inRun) continue; const s = L.interpSample(r.buf, t); if (!s) continue;
    const dx = s.x - r.x, dz = s.z - r.z, sp = Math.hypot(dx, dz);
    r.x = s.x; r.z = s.z; r.angle = s.a; r.aim = s.a; r.move = clamp(sp * 18, 0, 1);
    if (sp > .004) r.feet += shortestAngle(r.feet, Math.atan2(dx, dz)) * .3;
    r.walk += r.move > .08 ? .18 : .02; r.recoil = Math.max(0, r.recoil - .04); r.visible = r.status !== 'dead';
  }
  for (const e of enemies) {
    if (!e.remote) continue; const s = L.interpSample(e.buf, t); if (!s) continue;
    const moved = Math.hypot(s.x - e.x, s.z - e.z); e.x = s.x; e.z = s.z; e.angle = s.a;
    if (moved > .002) e.walk += moved * (e.kind === 'runner' || e.kind === 'crawler' ? 5 : 3.6);
    e.hit = Math.max(0, e.hit - .016); e.burnT = Math.max(0, (e.burnT || 0) - .016); e.rise = (e.flags & 1) ? Math.max(0, (e.rise ?? .63) - .016) : 0;
  }
}
function sendSync(to) {
  const dead = barrels.filter(b => !b.alive && !b.placed).map(b => b.id), placed = barrels.filter(b => b.alive && b.placed).map(b => [b.id, q10(b.x), q10(b.z)]);
  net.room.sendTo(to, { t: 'sync', run: net.run, map: mapId, diff: difficulty, wave, dead, placed, pk: pickups.slice(0, 18).map(p => [p.id, PICK_KINDS.indexOf(p.kind), q10(p.x), q10(p.z)]) });
}
function publishLobby() { if (!net.room || !net.isHost) return; net.room.setMeta({ phase: runActive() ? 'play' : 'lobby', map: mapId, diff: difficulty, open: net.room.peers.length < 4 }); }
function startCoopRun(d, late) {
  mapId = clamp(d.map | 0, 0, 2); difficulty = clamp(d.diff | 0, 0, 2); net.run = d.run | 0;
  startRun({ coop: true, late });
  if (late) {
    wave = d.wave | 0; player.status = 'dead'; uiTimer = 0;
    for (const id of d.dead || []) { const b = barrels.find(q => q.id === id); if (b) b.alive = false; }
    for (const [id, x, z] of d.placed || []) createBarrel(x / 10, z / 10, true, String(id));
    for (const [id, k, x, z] of d.pk || []) dropPickup(id, x / 10, z / 10, PICK_KINDS[k] || 'health', false);
    barrelsDirty = true; navTimer = 0; announce('JOINED', 'BACK IN NEXT WAVE', 2);
  }
}
function hostStart() {
  if (!net.room || !net.isHost) return;
  net.run = 1 + Math.floor(Math.random() * 1e9);
  const go = { t: 'go', run: net.run, map: mapId, diff: difficulty };
  net.room.send(go); startCoopRun(go, false); publishLobby(); beginWave(1);
}
function becomeHost(silent) {
  if (net.isHost) return; net.isHost = true;
  let maxId = nextZid;
  for (const e of enemies) { if (!e.remote) continue; e.remote = false; e.maxHp = enemyMaxHp(e.kind, wave); e.hp = Math.max(1, e.maxHp * e.hpPct / 100); const st = STATS[e.kind]; e.speed = st.speed[0] * diffSpeed() * (1 + Math.min(.6, wave * .025)); e.aware = true; e.spawn = 0; e.flags = 0; maxId = Math.max(maxId, e.id + 1); }
  nextZid = maxId + 1000; nextPid += 5000; director = L.createDirector();
  if (runActive() && (net.phase === 1 || net.waiting)) { pendingUpgrade = true; net.ready = new Set(net.waiting ? [selfKey()] : []); net.readyTimer = 20; }
  if (runActive() && !silent) toast('YOU ARE NOW HOSTING');
  publishLobby();
}
function goSolo(reason) {
  const wasCoop = coop(); if (!wasCoop) return;
  for (const off of net.unsub) try { off(); } catch { /* Ignore. */ }
  net.unsub = []; net.room = null; net.remotes.clear(); net.mode = 'solo'; net.inLobby = false; net.waiting = false;
  for (const el of nameLabels.values()) el.remove(); nameLabels.clear();
  if (runActive()) {
    net.isHost = false; becomeHost(true); net.isHost = false;
    if (player.status !== 'alive') { player.status = 'alive'; die(); }
    else if (pendingUpgrade && state !== 'upgrade') { beginWave(wave + 1); }
    if (reason) toast(reason);
  } else if (!$('coop').classList.contains('hidden')) showCoopStart(reason || '');
  updateUI();
}
function attachRoom(room) {
  net.room = room; net.mode = 'coop'; net.selfId = room.self.id; net.isHost = room.host === room.self.id; net.remotes.clear(); net.inLobby = true;
  net.unsub = [
    room.on('message', (from, data) => onNetMessage(from, data)),
    room.on('join', p => { renderLobby(); if (net.isHost) publishLobby(); if (runActive()) toast(String(p.name || 'Player').toUpperCase() + ' JOINED'); }),
    room.on('leave', p => { const r = net.remotes.get(p.id); net.remotes.delete(p.id); renderLobby(); if (net.isHost) publishLobby(); if (r && r.inRun && runActive()) toast(String(p.name || 'Player').toUpperCase() + ' LEFT'); }),
    room.on('host', id => { if (id === net.selfId) becomeHost(); else net.isHost = false; renderLobby(); }),
    room.on('meta', () => renderLobby()),
    room.on('close', reason => { if (reason === 'left') return; goSolo(runActive() ? 'CONNECTION LOST · PLAYING SOLO' : coopError(reason)); }),
  ];
  room.send({ t: 'hi' });
  if (net.isHost) publishLobby();
}
function leaveRoom() { const room = net.room; if (room) { try { room.leave(); } catch { /* Ignore. */ } } for (const off of net.unsub) try { off(); } catch { /* Ignore. */ } net.unsub = []; net.room = null; net.mode = 'solo'; net.isHost = false; net.remotes.clear(); net.inLobby = false; net.waiting = false; for (const el of nameLabels.values()) el.remove(); nameLabels.clear(); }
function coopError(code) { return ({ 'not-found': 'Room not found.', full: 'That room is full.', 'rate-limited': 'Too many tries. Wait a minute.', unavailable: 'Co-op is unavailable right now.', 'bad-request': 'Check the code.', replaced: 'You opened this room in another tab.' })[code] || "Can't connect. Try again."; }

/* Co-op lobby screens. */
function showCoopStart(message = '') { $('coop').classList.remove('hidden'); $('coopStart').classList.remove('hidden'); $('coopRoom').classList.add('hidden'); $('coopMsg').textContent = message; setCoopBusy(false); }
function setCoopBusy(busy) { for (const id of ['quickBtn', 'createBtn', 'joinBtn']) $(id).disabled = busy; }
async function connectCoop(kind, code) {
  const mp = Lud() && Lud().mp; if (!mp) { $('coopMsg').textContent = 'Co-op is unavailable right now.'; return; }
  audio.init(); setCoopBusy(true); $('coopMsg').textContent = 'Connecting…';
  try {
    const room = kind === 'quick' ? await mp.join({ game: GAME_ID, quick: true, max: 4 }) : kind === 'create' ? await mp.create({ game: GAME_ID, max: 4 }) : await mp.join({ game: GAME_ID, room: code, max: 4 });
    if (net.room) leaveRoom();
    attachRoom(room); openLobby();
  } catch (err) { setCoopBusy(false); $('coopMsg').textContent = coopError(err && err.code); }
}
function openLobby() {
  if (!net.room) return;
  if (state !== 'menu') showMenu(true);
  $('gameover').classList.add('hidden'); $('coop').classList.remove('hidden'); $('coopStart').classList.add('hidden'); $('coopRoom').classList.remove('hidden'); $('coopMsg').textContent = '';
  if (net.isHost) { net.room.send({ t: 'lobby' }); publishLobby(); }
  renderLobby();
}
function renderLobby() {
  const room = net.room; if (!room || $('coopRoom').classList.contains('hidden')) return;
  $('roomCode').textContent = room.code; const list = $('roomPlayers'); list.textContent = '';
  for (const p of room.peers) { const li = document.createElement('li'); const dot = document.createElement('i'); const name = document.createElement('span'); name.textContent = p.name + (p.id === room.self.id ? ' (you)' : ''); li.append(dot, name); if (p.id === room.host) { const tag = document.createElement('small'); tag.textContent = 'Host'; li.appendChild(tag); } list.appendChild(li); }
  const host = room.host === room.self.id, meta = room.meta || {};
  const m = host ? mapId : clamp(meta.map | 0, 0, 2), df = host ? difficulty : clamp(meta.diff ?? 1, 0, 2);
  $('roomArena').textContent = MAP_NAMES[m] + ' · ' + DIFF_NAMES[df]; $('roomArena').disabled = !host;
  $('coopGo').classList.toggle('hidden', !host); $('coopWait').classList.toggle('hidden', host);
  $('coopWait').textContent = meta.phase === 'play' ? 'Joining the run…' : 'Waiting for host';
}

/* Profile, unlocks and daily challenge. */
function checkUnlocks() {
  const probe = L.migrateProfile(JSON.parse(JSON.stringify(profile)));
  L.recordRun(probe, { kills, wave, bossKills: runStats.bossKills, explosiveKills: runStats.explosiveKills, healthPicks: runStats.healthPicks, revives: runStats.revives, daily: daily ? daily.date : '', score });
  const fresh = probe.unlocked.filter(id => !profile.unlocked.includes(id) && !freshUnlocks.includes(id));
  for (const id of fresh) { freshUnlocks.push(id); const c = L.CHARACTERS.find(q => q.id === id); toast((c ? c.name : id).toUpperCase() + ' UNLOCKED'); audio.unlock(); }
}
let runRecorded = false;
function recordRunEnd() {
  if (runRecorded || wave === 0) return []; runRecorded = true;
  const fresh = L.recordRun(profile, { kills, wave, bossKills: runStats.bossKills, explosiveKills: runStats.explosiveKills, healthPicks: runStats.healthPicks, revives: runStats.revives, coop: coop(), daily: daily ? daily.date : '', score });
  saveProfile(); buildCharSelect(); return fresh;
}
function buildCharSelect() {
  const sel = $('charSelect'); sel.textContent = '';
  for (const c of L.CHARACTERS) { const o = document.createElement('option'); const open = profile.unlocked.includes(c.id); o.value = c.id; o.disabled = !open; o.textContent = c.name + ' · ' + (open ? c.perk : c.reqText); sel.appendChild(o); }
  sel.value = profile.unlocked.includes(charId) ? charId : 'ranger';
}
function applyPerks() {
  const c = charId;
  if (c === 'scout') { player.speed *= 1.1; player.dashMul *= .8; }
  if (c === 'medic') { player.healMul = 1.5; player.regen = 1; }
  if (c === 'sapper') { player.grenades += 2; player.barrels += 2; player.blast *= 1.15; }
  if (c === 'gunner') { player.smgFree = 1; player.mag *= 1.15; }
  if (c === 'ghost') { player.crit += .12; player.dashInv = .15; }
  if (runMod === 'glass') { player.damage *= 1.5; player.maxHp = 60; player.hp = 60; }
  if (runMod === 'powder') player.grenades += 3;
  player.grenades = Math.min(9, player.grenades); player.barrels = Math.min(8, player.barrels);
}

/* Run lifecycle. */
function clearDynamics() {
  enemies.length = 0; zMap.clear(); burns.clear(); corpses.length = 0; hazards.length = 0;
  for (const p of projectiles) scene.remove(p.mesh); projectiles.length = 0; for (const p of grenades) scene.remove(p.mesh); grenades.length = 0;
  while (pickups.length) removePickup(pickups.length - 1);
  for (const e of effects) { scene.remove(e.mesh); if (e.dispose) e.mesh.material.dispose(); } effects.length = 0;
  particleData.length = 0; sparkData.length = 0; explosionQueue.length = 0; for (const f of floatTexts) f.el.remove(); floatTexts.length = 0;
  for (const d of drones) scene.remove(d.mesh); drones.length = 0;
}
function resetPlayer() {
  Object.assign(player, { x: 0, z: 4, r: .39, hp: 100, maxHp: 100, angle: Math.PI, aim: Math.PI, feet: Math.PI, move: 0, walk: 0, vx: 0, vz: 0, shot: 0, reload: 0, reloading: false, gun: 0, recoil: 0, invuln: .8, dashCD: 0, dashTime: 0, dashX: 0, dashZ: 0, grenades: 3, barrels: 3, grenadeCD: 0, barrelCD: 0, damage: 1, rate: 1, reloadSpeed: 1, speed: 1, mag: 1, blast: 1, vampire: 0, buff: 0,
    status: 'alive', bleed: 0, rev: 0, shots: 0, pierce: 0, burnDps: 0, crit: 0, chain: 0, drones: 0, adrenaline: 0, shockDash: 0, magnet: 0, phoenix: 0, overclock: 1, overclockStart: 0, grenadeDmg: 1, healMul: 1, regen: 0, dashMul: 1, dashInv: 0, smgFree: 0 });
  if (mapId === 1) { player.x = 0; player.z = 2.2; }
  if (coop()) { const slot = Math.max(0, net.room ? net.room.peers.findIndex(p => p.id === net.selfId) : 0); player.x += [0, -1.6, 1.6, 0][slot % 4]; player.z += [0, .6, .6, 1.4][slot % 4]; }
  weaponDefs.forEach((w, i) => ammo[i] = w.mag);
}
function startRun(opts = {}) {
  audio.init(); resetInputs();
  daily = opts.daily ? L.dailyConfig(L.dateKey()) : null; runMod = daily ? daily.mod : '';
  if (daily) { mapId = daily.map; difficulty = 1; } else if (!opts.coop) { mapId = menuPrefs.map; difficulty = menuPrefs.diff; }
  runRng = daily ? L.rng(daily.seed) : Math.random;
  if (!opts.coop && coop()) leaveRoom();
  clearDynamics(); rebuildWorld(); resetPlayer(); applyPerks();
  score = 0; kills = 0; wave = 0; runTime = 0; spawnLeft = 0; waveTotal = 0; waveKilled = 0; chain = 0; chainTimer = 0; shake = 0; zoomKick = 0; damageFlash = 0; pendingUpgrade = false; waveBreak = -1; clientBreak = -1;
  director = L.createDirector(); damageThisStep = 0; net.ev.length = 0; net.hits.clear(); net.bh.clear(); upCounts = {}; runStats = { bossKills: 0, explosiveKills: 0, healthPicks: 0, revives: 0, downs: 0 }; freshUnlocks = []; runRecorded = false; nextZid = 1; nextPid = 1; barrelSeq = 0;
  net.waiting = false; net.phase = 0; net.ready = new Set(); for (const r of net.remotes.values()) { r.inRun = false; r.buf = L.createInterp(); }
  state = 'run'; camTarget.set(player.x, 0, player.z);
  for (const id of ['menu', 'gameover', 'upgrade', 'pause', 'help', 'coop']) $(id).classList.add('hidden');
  $('hud').classList.remove('hidden'); $('pauseBtn').classList.remove('hidden'); $('announcement').classList.remove('show'); $('toast').classList.remove('show');
  $('restartBtn').classList.toggle('hidden', coop()); $('quitBtn').textContent = coop() ? 'Leave game' : 'Main menu';
  document.body.classList.add('playing'); canvas.style.cursor = 'none'; mouse.moved = false;
  if (!coop()) beginWave();
  updateUI(); resize(); canvas.focus();
}
function showMenu(keepRoom = false) {
  if (!keepRoom && coop()) leaveRoom();
  resetInputs(); clearDynamics(); state = 'menu'; daily = null; runMod = ''; runRng = Math.random;
  if (!(coop() && !net.isHost)) { mapId = menuPrefs.map; difficulty = menuPrefs.diff; } syncMenuControls();
  score = 0; kills = 0; wave = 0; chain = 0; chainTimer = 0; playerLight.intensity = 0; rebuildWorld(); resetPlayer(); player.gun = 1; ammo[1] = 36; player.hp = 100; player.invuln = 0; demoTimer = 0;
  for (const id of ['gameover', 'upgrade', 'pause', 'help', 'hud', 'pauseBtn']) $(id).classList.add('hidden');
  if (!keepRoom) $('coop').classList.add('hidden');
  $('menu').classList.remove('hidden'); $('announcement').classList.remove('show'); $('toast').classList.remove('show'); $('crosshair').style.display = 'none'; document.body.classList.remove('playing'); $('menuBest').textContent = String(best).padStart(5, '0'); canvas.style.cursor = 'default';
  buildTargets(true); for (let i = 0; i < 14; i++) spawnEnemy(i % 5 === 0 ? 'runner' : 'walker', null, true);
  resize();
}
function syncMenuControls() { $('arenaSelect').value = String(menuPrefs.map); document.querySelectorAll('[data-diff]').forEach(n => { const on = +n.dataset.diff === menuPrefs.diff; n.classList.toggle('active', on); n.setAttribute('aria-pressed', String(on)); }); }
function calmBoard(el, board) { const ui = Lud() && Lud().ui; if (!el) return; if (el._calmBoard && el._calmBoard.destroy) { try { el._calmBoard.destroy(); } catch (e) { /* Ignore. */ } } el._calmBoard = null; if (!ui) { el.hidden = true; return; } el.hidden = false; el.textContent = ''; try { el._calmBoard = ui.board(el, { board, limit: 5 }) || null; } catch (e) { el.hidden = true; } }
function calmOpenBoard(board) { try { const ui = Lud() && Lud().ui; if (ui) ui.open({ board }); } catch (e) { /* Ignore. */ } }
function togglePause() {
  if (state === 'run') { state = 'paused'; resetInputs(); $('pause').classList.remove('hidden'); $('crosshair').style.display = 'none'; document.body.classList.remove('playing'); canvas.style.cursor = 'default'; $('pauseTeam').classList.toggle('hidden', !coop()); if (coop()) renderBoard($('pauseTeam')); }
  else if (state === 'paused') { state = 'run'; $('pause').classList.add('hidden'); document.body.classList.add('playing'); canvas.style.cursor = 'none'; audio.init(); }
}
function saveBest() { if (score > best) { best = score; safeSet('deadblock-best', String(best)); } }
function endScreen(title) {
  $('pauseBtn').classList.add('hidden');
  resetInputs(); document.body.classList.remove('playing'); $('crosshair').style.display = 'none'; canvas.style.cursor = 'default';
  const record = score > best; saveBest();
  const prevDaily = daily && profile.daily.date === daily.date ? profile.daily.best : 0;
  const fresh = recordRunEnd();
  let team = score; for (const r of net.remotes.values()) if (r.inRun) team += r.score || 0;
  $('endScore').textContent = (coop() ? team : score).toLocaleString(); $('endScoreLabel').textContent = coop() ? 'TEAM SCORE' : 'SCORE'; $('endKills').textContent = kills; $('endWave').textContent = wave;
  $('endTitle').textContent = title || (daily && score > prevDaily ? 'Daily best' : record ? 'New best' : 'Game over');
  const names = fresh.map(id => (L.CHARACTERS.find(c => c.id === id) || {}).name).filter(Boolean);
  $('endUnlock').textContent = names.length ? names.join(', ') + ' unlocked' : ''; $('endUnlock').classList.toggle('hidden', !names.length);
  $('endTeam').classList.toggle('hidden', !coop()); if (coop()) renderBoard($('endTeam'));
  $('againBtn').firstChild.textContent = coop() ? 'BACK TO ROOM' : 'PLAY AGAIN'; $('endMenuBtn').textContent = coop() ? 'Leave' : 'Main menu';
  calmBoard($('endBoard'), 'deadblock');
  setTimeout(() => { if (state === 'dead') { $('gameover').classList.remove('hidden'); $('announcement').classList.remove('show'); $('toast').classList.remove('show'); } }, 650);
}
function die() { state = 'dead'; burst(player.x, 1, player.z, '#d97843', 28, 6); audio.tone(180, 30, .9, .3, 'sawtooth'); endScreen(); }
function gameOver() { if (!runActive()) return; if (net.isHost) { netEvent(['ov']); netTick(1); } state = 'dead'; $('upgrade').classList.add('hidden'); $('pause').classList.add('hidden'); audio.tone(180, 30, .9, .3, 'sawtooth'); endScreen('Game over'); if (net.isHost) publishLobby(); }
function checkTeamOver() {
  if (!net.isHost || runTime < 2) return;
  if (player.status === 'alive') return;
  for (const r of net.remotes.values()) if (r.inRun && r.status === 'alive') return;
  gameOver();
}
function simulation(dt) {
  time += dt;
  if (state === 'menu') {
    buildTargets(true); updatePlayer(dt, true); updateEnemies(dt, true); updateProjectiles(dt); updatePickups(dt);
    demoTimer -= dt; if (demoTimer <= 0) { demoTimer = .5; if (enemies.length < 17) spawnEnemy(Math.random() < .12 ? 'runner' : 'walker', null, true); }
    if (time % 32 < dt && barrels.length < 40 && barrels.filter(b => b.alive).length < 24) for (let i = 0; i < 4; i++) { const x = rand(-17, 17), z = rand(-12, 12); if (!solidAt(x, z, .8, true) && Math.hypot(x - player.x, z - player.z) > 3) createBarrel(x, z, false, 'd' + Math.random()); }
  } else if (state === 'run' || (coop() && runActive())) {
    runTime += dt; if (chainTimer > 0) { chainTimer -= dt; if (chainTimer <= 0) chain = 0; }
    buildTargets(false);
    if (authority()) waveUpdate(dt); else clientUpdate(dt);
    updatePlayer(dt, false, state === 'run');
    if (authority()) { const near = updateEnemies(dt); directorStep(dt, near); }
    updateProjectiles(dt); updateHazards(dt); updatePickups(dt); updateBurns(dt); updateDrones(dt);
    if (coop()) checkTeamOver();
  }
  if (state === 'run') { announceTimer -= dt; toastTimer -= dt; if (announceTimer <= 0) $('announcement').classList.remove('show'); if (toastTimer <= 0) $('toast').classList.remove('show'); }
  if (state !== 'paused' || coop()) { renderParticles(dt); updateEffects(dt); updateCorpses(dt); for (const b of barrels) if (b.wob > 0) b.wob = Math.max(0, b.wob - dt); }
  hitTimer = Math.max(0, hitTimer - dt); damageFlash = Math.max(0, damageFlash - dt * 2); shake *= Math.exp(-10 * dt); zoomKick *= Math.exp(-6 * dt);
  uiTimer -= dt; if (uiTimer <= 0) { if (state !== 'menu') updateUI(); uiTimer = .07; }
}
function resize() { renderer.setSize(innerWidth, innerHeight); const aspect = innerWidth / innerHeight; let h = coarse && aspect < 1 ? 17.5 : aspect < 1 ? 18 : 12.7; if (state === 'menu') h = aspect < 1 ? 18 : 14.8; camera.left = -h * aspect; camera.right = h * aspect; camera.top = h; camera.bottom = -h; camera.updateProjectionMatrix(); }
function updateCamera(dt) {
  let fx = player.x, fz = player.z;
  if (coop() && player.status === 'dead') for (const r of net.remotes.values()) if (r.inRun && r.status === 'alive') { fx = r.x; fz = r.z; break; }
  let tx = fx, tz = fz;
  if (state === 'menu') { tx = player.x - camRight.x * 7; tz = player.z - camRight.z * 7; } else { const lead = .6; tx += Math.sin(player.angle) * lead; tz += Math.cos(player.angle) * lead; if (innerWidth / innerHeight > 1.25) { tx = clamp(tx, -11, 11); tz = clamp(tz, -9, 9); } }
  const t = 1 - Math.exp(-5 * Math.min(.05, dt)); camTarget.x = lerp(camTarget.x, tx, t); camTarget.z = lerp(camTarget.z, tz, t);
  const jitter = settings.shake ? shake : 0; camera.position.copy(camTarget).add(camOffset); camera.position.x += rand(-jitter, jitter); camera.position.z += rand(-jitter, jitter); camera.lookAt(camTarget); camera.zoom = 1 + (settings.shake ? zoomKick * .05 : 0); camera.updateProjectionMatrix(); camera.updateMatrixWorld();
}
function frame(now) {
  requestAnimationFrame(frame); const raw = lastTime ? Math.min((now - lastTime) / 1000, .1) : 1 / 60; lastTime = now;
  if (document.hidden) return;
  fpsAcc += raw; fpsFrames++; if (fpsAcc >= 1) { fps = Math.round(fpsFrames / fpsAcc); fpsAcc = 0; fpsFrames = 0; }
  if (settings.quality === 'Auto') { const next = L.governorFrame(governor, raw); if (next >= 0) applyTier(next); }
  if (coop()) interpolateRemotes(now);
  accumulator += raw; let steps = 0; while (accumulator >= 1 / 60 && steps < 5) { simulation(1 / 60); accumulator -= 1 / 60; steps++; } if (steps === 5) accumulator = 0;
  netTick(raw);
  updateCamera(raw); bN = 0; drawEnemies(); drawSurvivors(); if (barrelsDirty) drawBarrels(); for (const b of barrels) if (b.alive) blob(b.x, b.z, 1.8, 1.6);
  blobBatch.count = bN; blobBatch.instanceMatrix.needsUpdate = true;
  updateAmbient(raw); updateLabels();
  $('damage').style.opacity = damageFlash * .65; $('crosshair').classList.toggle('hit', hitTimer > 0);
  if (!coarse && state === 'run' && mouse.inside) { $('crosshair').style.display = 'block'; $('crosshair').style.left = mouse.x + 'px'; $('crosshair').style.top = mouse.y + 'px'; } else $('crosshair').style.display = 'none';
  renderer.render(scene, camera);
}

/* Event wiring. */
canvas.addEventListener('pointermove', e => { if (e.pointerType === 'touch') return; mouse.x = e.clientX; mouse.y = e.clientY; mouse.nx = e.clientX / innerWidth * 2 - 1; mouse.ny = 1 - e.clientY / innerHeight * 2; mouse.moved = true; mouse.inside = true; });
canvas.addEventListener('pointerenter', () => mouse.inside = true); canvas.addEventListener('pointerleave', () => { mouse.inside = false; mouse.down = false; });
canvas.addEventListener('pointerdown', e => { if (state !== 'run' || e.pointerType === 'touch') return; audio.init(); mouse.x = e.clientX; mouse.y = e.clientY; mouse.nx = e.clientX / innerWidth * 2 - 1; mouse.ny = 1 - e.clientY / innerHeight * 2; mouse.moved = true; aimUpdate(); if (e.button === 0) { mouse.down = true; canvas.setPointerCapture?.(e.pointerId); } if (e.button === 2) throwGrenade(); e.preventDefault(); });
window.addEventListener('pointerup', () => mouse.down = false); window.addEventListener('pointercancel', () => mouse.down = false); canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('wheel', e => { if (state !== 'run') return; e.preventDefault(); let i = player.gun; const n = weaponDefs.length; for (let k = 0; k < n; k++) { i = (i + (e.deltaY > 0 ? 1 : n - 1)) % n; if (unlocked(i)) { switchWeapon(i); break; } } }, { passive: false });
window.addEventListener('keydown', e => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code) && state === 'run') e.preventDefault();
  if (e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT') return;
  if (e.code === 'Escape' || e.code === 'KeyP') { if (e.repeat) return; if (!$('help').classList.contains('hidden')) { $('help').classList.add('hidden'); return; } if (!$('coop').classList.contains('hidden') && state === 'menu') { $('coopClose').click(); return; } togglePause(); return; }
  if (e.code === 'KeyM' && !e.repeat) { audio.init(); audio.toggle(); return; }
  if (state === 'upgrade' && /^Digit[1-4]$/.test(e.code) && !e.repeat) { pickUpgrade(+e.code.slice(-1) - 1); return; }
  if (state === 'menu' && e.code === 'Enter' && !e.repeat && $('coop').classList.contains('hidden')) { startRun(); return; }
  if (state === 'dead' && e.code === 'Enter' && !e.repeat) { $('againBtn').click(); return; }
  if (state !== 'run') return; keys.add(e.code); if (e.repeat) return;
  if (e.code === 'Space' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') dash(); else if (e.code === 'KeyR') reload(); else if (e.code === 'KeyG') throwGrenade(); else if (e.code === 'KeyE') placeBarrel(); else if (/^Digit[1-7]$/.test(e.code)) switchWeapon(+e.code.slice(-1) - 1);
});
window.addEventListener('keyup', e => keys.delete(e.code));
window.addEventListener('blur', () => { resetInputs(); if (state === 'run' && !coop()) togglePause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'run' && !coop()) togglePause(); lastTime = 0; accumulator = 0; });
function bindStick(id, kind) { const el = $(id), knob = el.querySelector('.knob'); let pointer = null; const move = e => { const r = el.getBoundingClientRect(), dx = e.clientX - r.left - r.width / 2, dy = e.clientY - r.top - r.height / 2, len = Math.hypot(dx, dy), max = 36, s = len > max ? max / len : 1; touch[kind].x = dx * s / max; touch[kind].y = dy * s / max; knob.style.transform = 'translate(' + dx * s + 'px,' + dy * s + 'px)'; }; el.addEventListener('pointerdown', e => { if (state !== 'run') return; pointer = e.pointerId; touch[kind].active = true; el.setPointerCapture(e.pointerId); audio.init(); move(e); e.preventDefault(); }); el.addEventListener('pointermove', e => { if (e.pointerId === pointer) { move(e); e.preventDefault(); } }); const end = e => { if (e.pointerId !== pointer) return; pointer = null; touch[kind].active = false; touch[kind].x = touch[kind].y = 0; knob.style.transform = 'translate(0,0)'; }; el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end); el.addEventListener('lostpointercapture', end); }
bindStick('moveStick', 'move'); bindStick('aimStick', 'aim');
$('startBtn').onclick = () => startRun(); $('dailyBtn').onclick = () => startRun({ daily: true });
$('againBtn').onclick = () => { if (coop() && net.room) openLobby(); else startRun({ daily: !!daily }); };
$('restartBtn').onclick = () => { saveBest(); recordRunEnd(); startRun({ daily: !!daily }); };
$('quitBtn').onclick = () => { saveBest(); recordRunEnd(); showMenu(); };
$('endMenuBtn').onclick = () => showMenu();
$('resumeBtn').onclick = togglePause; $('pauseBtn').onclick = togglePause; $('soundBtn').onclick = () => { audio.init(); audio.toggle(); };
$('grenadeBtn').onclick = throwGrenade; $('barrelBtn').onclick = placeBarrel; $('touchDash').onclick = dash; $('touchGrenade').onclick = throwGrenade;
if (Lud() && Lud().ui) $('boardBtn').hidden = false; $('boardBtn').onclick = () => calmOpenBoard('deadblock');
$('helpBtn').onclick = () => { $('help').classList.remove('hidden'); audio.click(); }; $('closeHelp').onclick = () => { $('help').classList.add('hidden'); audio.click(); };
$('arenaSelect').onchange = e => { menuPrefs.map = mapId = +e.target.value; audio.click(); showMenu(true); if (net.room) { publishLobby(); renderLobby(); } };
for (const b of document.querySelectorAll('[data-diff]')) b.onclick = () => { menuPrefs.diff = difficulty = +b.dataset.diff; if (net.room) { publishLobby(); renderLobby(); } document.querySelectorAll('[data-diff]').forEach(n => { n.classList.toggle('active', n === b); n.setAttribute('aria-pressed', String(n === b)); }); audio.click(); };
$('charSelect').onchange = e => { if (!profile.unlocked.includes(e.target.value)) return; charId = profile.character = e.target.value; saveProfile(); audio.click(); };
const dailyInfo = L.dailyConfig(L.dateKey()); $('dailyBtn').title = 'Daily · ' + dailyInfo.modName + ' · ' + MAP_NAMES[dailyInfo.map];
$('qualityBtn').textContent = settings.quality;
$('qualityBtn').onclick = () => { settings.quality = QUALITY_NAMES[(QUALITY_NAMES.indexOf(settings.quality) + 1) % QUALITY_NAMES.length]; $('qualityBtn').textContent = settings.quality; saveSettings(); applyTier(settings.quality === 'Auto' ? governor.tier : fixedTier[settings.quality]); };
$('shakeBtn').textContent = settings.shake ? 'On' : 'Off';
$('shakeBtn').onclick = () => { settings.shake = !settings.shake; $('shakeBtn').textContent = settings.shake ? 'On' : 'Off'; saveSettings(); };
window.addEventListener('resize', resize);
// Co-op entry points.
const hasMp = () => !!(Lud() && Lud().mp);
$('coopBtn').classList.toggle('hidden', !hasMp());
$('coopBtn').onclick = () => { audio.click(); showCoopStart(); };
$('quickBtn').onclick = () => connectCoop('quick'); $('createBtn').onclick = () => connectCoop('create');
$('joinBtn').onclick = () => { const code = L.normalizeCode($('codeInput').value); if (code.length < 4) { $('coopMsg').textContent = 'Enter the 4-letter code.'; return; } connectCoop('join', code); };
$('codeInput').addEventListener('input', e => { e.target.value = L.normalizeCode(e.target.value); });
$('codeInput').addEventListener('keydown', e => { if (e.key === 'Enter') $('joinBtn').click(); });
$('coopClose').onclick = () => { leaveRoom(); $('coop').classList.add('hidden'); if (location.search.includes('horde=')) history.replaceState(null, '', location.pathname); };
$('coopGo').onclick = () => { audio.click(); hostStart(); };
$('roomArena').onclick = () => { if (!net.isHost) return; menuPrefs.map = mapId = (mapId + 1) % 3; audio.click(); showMenu(true); publishLobby(); renderLobby(); };
$('copyBtn').onclick = async () => {
  if (!net.room) return; const link = location.origin + location.pathname + '?horde=' + net.room.code;
  try { if (coarse && navigator.share) { await navigator.share({ url: link }); return; } await navigator.clipboard.writeText(link); $('coopMsg').textContent = 'Link copied'; } catch { $('coopMsg').textContent = link; }
};
canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); if (state === 'run') togglePause(); $('loading').style.display = 'grid'; $('loading').innerHTML = '<div class="load-error"><h2>Graphics context interrupted.</h2><p>Reload to restart the arena. Your best score is saved.</p><button class="primary" onclick="location.reload()">RELOAD<svg class="icon"><use href="#arrow"/></svg></button></div>'; });
window.addEventListener('pagehide', () => { if (runActive()) { saveBest(); recordRunEnd(); } if (net.room) leaveRoom(); });
// Read-only diagnostics make browser smoke tests reproducible, without exposing gameplay cheats.
window.deadblock = { get state() { return state; }, get stats() { return { state, mode: net.mode, host: net.isHost, peers: net.remotes.size, wave, kills, score, hp: player.hp, status: player.status, x: player.x, z: player.z, ammo: ammo.slice(), gun: player.gun, grenades: player.grenades, barrels: barrels.filter(b => b.alive).length, enemies: enemies.length, spawnLeft, director: director.phase, rating: +director.rating.toFixed(2), tier, fps, drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles, engine: T.REVISION, mod: runMod }; }, get playerScreen() { const p = new T.Vector3(player.x, 1, player.z).project(camera); return { x: (p.x * .5 + .5) * innerWidth, y: (-.5 * p.y + .5) * innerHeight }; }, get targets() { return enemies.map(e => { const p = new T.Vector3(e.x, 1, e.z).project(camera); return { x: (p.x * .5 + .5) * innerWidth, y: (-.5 * p.y + .5) * innerHeight, kind: e.kind, worldX: e.x, worldZ: e.z, mode: e.mode, aware: e.aware }; }); } };

buildCharSelect();
applyTier(settings.quality === 'Auto' ? governor.tier : fixedTier[settings.quality]);
showMenu(); camTarget.set(player.x - camRight.x * 7, 0, player.z - camRight.z * 7); updateCamera(1); resize(); drawEnemies(); drawSurvivors(); drawBarrels(); renderer.render(scene, camera); $('loading').style.display = 'none'; requestAnimationFrame(frame);
const invite = L.inviteCode(location.search);
if (invite && hasMp()) { showCoopStart(); $('codeInput').value = invite; connectCoop('join', invite); }
};
