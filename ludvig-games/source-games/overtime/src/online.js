/* Online play through the platform relay (docs/platform-api.md, Ludvig.mp).
   Every player simulates their own car and broadcasts it ~12 times a second.
   The room host (oldest peer) owns the ball, clock, goals, kickoffs and bots.
   A player who touches the ball owns it for a moment, so hits feel instant. */
import { Match } from './match.js';
import { ARENA } from './physics.js';

export const GAME_ID = 'overtime';
const SEND_INTERVAL = 1 / 12, MAX_PLAYERS = 4, BOT_NAMES = ['VECTOR', 'PULSE', 'AXIOM', 'NOVA'];
const now = () => performance.now() / 1000;
const r2 = v => Math.round(v * 100) / 100, r3 = v => Math.round(v * 1000) / 1000;
const finite = (a, n) => Array.isArray(a) && a.length >= n && a.every(Number.isFinite);
const packBody = o => [r2(o.position.x), r2(o.position.y), r2(o.position.z), r3(o.quaternion.x), r3(o.quaternion.y), r3(o.quaternion.z), r3(o.quaternion.w), r2(o.velocity.x), r2(o.velocity.y), r2(o.velocity.z), r2(o.angularVelocity.x), r2(o.angularVelocity.y), r2(o.angularVelocity.z)];
const carFlags = c => (c.input?.boost && c.boost > 0 ? 1 : 0) | (c.grounded ? 2 : 0) | (c.input?.powerslide ? 4 : 0);
const cleanName = n => String(n || 'PLAYER').replace(/[^\p{L}\p{N} ._-]/gu, '').trim().slice(0, 16) || 'PLAYER';
export const ERRORS = {
  'not-found': 'No room with that code', full: 'That room is full', 'rate-limited': 'Too many tries. Wait a minute.',
  'bad-request': 'Enter the 4-character code', replaced: 'Opened in another tab', network: 'Connection lost',
};
export const errorText = code => ERRORS[code] || 'Can’t connect right now';

/** Room membership and lobby. Calls `onChange()` when the lobby view should re-render. */
export class Online {
  constructor({ onChange, onStart, onClose, onPeerLeave }) {
    Object.assign(this, { onChange, onStart, onClose, onPeerLeave });
    this.room = null; this.busy = false; this.autoAt = 0; this.match = null; this.offs = [];
  }
  get available() { return !!window.Ludvig?.mp; }
  get isHost() { return !!this.room && this.room.host === this.room.self.id; }
  get self() { return this.room?.self.id; }
  get peers() { return this.room ? [...this.room.peers].sort((a, b) => a.joinedAt - b.joinedAt) : []; }
  get phase() { return this.room?.meta?.phase || 'lobby'; }
  get link() { return this.room ? `${location.origin}${location.pathname}?${GAME_ID}=${this.room.code}` : ''; }
  async connect(how, code) {
    if (this.busy || !this.available) return;
    this.leave(); this.busy = true; this.onChange('');
    try {
      const mp = window.Ludvig.mp;
      const room = how === 'quick' ? await mp.join({ game: GAME_ID, quick: true, max: MAX_PLAYERS })
        : how === 'create' ? await mp.create({ game: GAME_ID, max: MAX_PLAYERS })
        : await mp.join({ game: GAME_ID, room: code });
      this.attach(room);
    } catch (error) { this.busy = false; this.onChange(errorText(error?.code)); return; }
    this.busy = false; this.onChange('');
  }
  attach(room) {
    this.room = room;
    const on = (t, f) => this.offs.push(room.on(t, f));
    on('join', peer => { this.welcomeBack(peer); this.onChange(); });
    on('leave', peer => { this.match?.peerLeft(peer.id); this.onPeerLeave?.(peer); this.onChange(); });
    on('host', () => { if (this.isHost) { this.match?.becomeHost(); this.setPhase(this.match?.net && this.match.phase !== 'results' ? 'play' : 'lobby'); } this.onChange(); });
    on('meta', () => this.onChange());
    on('close', reason => { const was = this.room; this.detach(); if (was && reason !== 'left') this.onClose(reason); });
    on('message', (from, data) => this.receive(from, data));
    if (this.isHost) this.setPhase('lobby');
  }
  /** Host: a player from the running match came back, so they get their car again. */
  welcomeBack(peer) {
    const msg = this.isHost && this.match?.rejoin(peer.id); if (!msg) return;
    try { this.room.sendTo(peer.id, msg); } catch { /* Ignore. */ }
    this.send({ t: 'back', k: peer.id });
  }
  get hostingMatch() { return this.isHost && this.peers.length >= 2 && !!this.match?.net && ['countdown', 'live', 'goal'].includes(this.match.phase); }
  detach() { for (const off of this.offs) off(); this.offs = []; this.room = null; this.autoAt = 0; this.match?.stopOnline(); }
  leave() { const room = this.room; if (!room) return; this.detach(); try { room.leave(); } catch { /* Ignore. */ } this.onChange(); }
  setPhase(phase) { if (this.isHost) this.room.setMeta({ phase, open: phase === 'lobby' }); }
  send(data) { this.room?.send(data); }
  /** Host: build teams from the current peers (oldest first) and start everyone. */
  start() {
    if (!this.isHost || this.peers.length < 2) return;
    const humans = this.peers.slice(0, MAX_PLAYERS), size = Math.ceil(humans.length / 2), rank = [0, 0], ro = [];
    humans.forEach((p, i) => { const team = i % 2; ro.push([p.id, team, rank[team]++, cleanName(p.name), 0]); });
    let b = 0; for (const team of [0, 1]) while (rank[team] < size) { ro.push(['bot' + b, team, rank[team]++, BOT_NAMES[b], 1]); b++; }
    const msg = { t: 'start', ro, len: this.length || 300 };
    this.autoAt = 0; this.setPhase('play'); this.send(msg); this.onStart(msg);
  }
  rematch() { if (this.isHost) this.start(); else this.send({ t: 'again' }); }
  backToLobby() { if (this.isHost) this.setPhase('lobby'); }
  receive(from, data) {
    if (!data || typeof data !== 'object') return;
    if (data.t === 'start') { if (from === this.room.host && Array.isArray(data.ro) && data.ro.some(s => s[0] === this.self)) this.onStart(data); return; }
    if (data.t === 'again') { if (this.isHost && !['countdown', 'live', 'goal'].includes(this.match?.net ? this.match.phase : '')) this.start(); return; }
    this.match?.receive(from, data);
  }
  /** Called every frame. Runs quick-match auto start and the match's network send. */
  tick(dt, inLobby) {
    if (!this.room) return;
    if (inLobby && this.isHost && this.room.public && this.phase === 'lobby' && this.peers.length >= 2) {
      if (!this.autoAt) { this.autoAt = now() + 6; this.onChange(); }
      else if (now() >= this.autoAt) this.start();
    } else if (this.autoAt) { this.autoAt = 0; this.onChange(); }
    this.match?.netTick(dt);
  }
  get autoSeconds() { return this.autoAt ? Math.max(1, Math.ceil(this.autoAt - now())) : 0; }
}

/** The online flavour of Match. Offline modes keep using Match itself. */
export class OnlineMatch extends Match {
  constructor(physics, onEvent) { super(physics, onEvent); this.net = null; this.round = 0; this.roster = []; }
  get isHost() { return !!this.net?.isHost; }
  begin(net, msg) {
    this.net = net; net.match = this; this.kind = 'online'; this.round = 0;
    this.roster = msg.ro.filter(s => Array.isArray(s) && typeof s[0] === 'string').map(([k, team, rank, name, bot]) => ({ k, team: team ? 1 : 0, rank: rank | 0, name: cleanName(name), bot: !!bot, human: !bot }));
    const self = this.roster.find(s => s.k === net.self) || this.roster[0];
    this.myTeam = self.team;
    const others = this.roster.filter(s => s !== self);
    const host = net.isHost;
    this.physics.resetRoster([self, ...others].map(s => ({ team: s.team, rank: s.rank, name: s.name, key: s.k, human: !s.bot, proxy: s !== self && (!host || !s.bot) })));
    this.byKey = new Map(this.physics.cars.map(c => [c.key, c]));
    this.config = { teamSize: this.physics.teamSize, playerTeam: self.team, difficulty: 'pro', length: Number(msg.len) > 0 ? Math.min(600, Number(msg.len)) : 300 };
    this.bots.setDifficulty('pro'); this.bots.reset();
    Object.assign(this, { score: [0, 0], remaining: this.config.length, elapsed: 0, overtime: false, overtimeTime: 0, phaseTime: 0, accumulator: 0, frames: [], replayFrames: [], touchHistory: [], ended: false, paused: false, pendingEnd: false, lastCountdown: 3 });
    this.stats = this.physics.cars.map(c => ({ id: c.id, k: c.key, name: c.name, team: c.team, isPlayer: c.isPlayer, goals: 0, assists: 0, saves: 0, shots: 0, points: 0, lastShot: -100, lastSave: -100 }));
    this.hostBall = null; this.ownUntil = 0; this.claimUntil = 0; this.hitPending = false; this.sendTimer = 0; this.lastSend = 0;
    for (const s of this.roster) if (!s.bot && !net.peers.some(p => p.id === s.k)) this.peerLeft(s.k);
    this.current = this.physics.snapshot(); this.previous = this.current;
    if (Number.isFinite(msg.n) && msg.n > 0) this.round = msg.n | 0; // Rejoining mid-match: follow the host's current kickoff.
    this.setPhase('countdown'); this.emit('countdown', { number: 3 });
  }
  /** Host: give a returning player their slot back and the start message to resume with. */
  rejoin(id) {
    if (!this.net || !['countdown', 'live', 'goal'].includes(this.phase)) return null;
    const s = this.slot(id); if (!s?.human || !s.bot) return null;
    this.restore(s);
    return { t: 'start', ro: this.roster.map(r => [r.k, r.team, r.rank, r.name, r.bot ? 1 : 0]), len: this.config.length, n: this.round };
  }
  restore(s) {
    s.bot = false; const car = this.byKey.get(s.k); if (!car || car.id === 0) return;
    car.human = true; car.proxy = true; car.net = null;
  }
  stopOnline() { if (this.net) this.net.match = null; this.net = null; if (this.phase !== 'results') this.phase = 'idle'; }
  slot(k) { return this.roster.find(s => s.k === k); }
  /** A human left: their car becomes a bot driven by the host. */
  peerLeft(id) {
    const s = this.slot(id); if (!s || s.bot || !this.net) return;
    s.bot = true; const car = this.byKey.get(id); if (!car) return;
    car.human = false; if (this.isHost) { car.proxy = false; car.net = null; }
  }
  becomeHost() {
    if (!this.net) return;
    for (const s of this.roster) if (!s.bot && !this.net.peers.some(p => p.id === s.k)) s.bot = true;
    for (const car of this.physics.cars) if (car.id !== 0) { const s = this.slot(car.key); if (s?.bot) { car.proxy = false; car.human = false; car.net = null; } }
    this.bots.reset();
  }
  update(dt, input) { if (this.net) super.update(dt, input); }
  tick(dt, input) {
    this.phaseTime += dt; const host = this.isHost;
    if (this.phase === 'countdown') {
      const n = Math.max(0, 3 - Math.floor(this.phaseTime)); if (n !== this.lastCountdown) { this.lastCountdown = n; this.emit('countdown', { number: n }); }
      if (this.phaseTime >= (host ? 3 : 4.5)) { this.setPhase('live'); this.emit('go'); }
      return;
    }
    if (this.phase === 'goal') { this.simulate(dt, {}, false); if (host && this.phaseTime >= 1.8) this.afterGoal(); return; }
    if (this.phase !== 'live') return;
    this.elapsed += dt;
    if (this.overtime) this.overtimeTime += dt;
    else { const was = this.remaining; this.remaining = Math.max(0, this.remaining - dt); if (was > 0 && this.remaining === 0) this.emit('message', { text: 'KEEP IT UP', duration: 1.3 }); }
    this.simulate(dt, input, true);
    if (this.phase !== 'live' || !host || this.overtime) return;
    const ball = this.physics.ball;
    if (this.remaining === 0 && ball.position.y <= ARENA.ballRadius + .13 && ball.velocity.y <= .6) { if (this.score[0] === this.score[1]) this.enterOvertime(); else this.finish(); }
  }
  simulate(dt, input, active) {
    this.previous = this.current;
    const p = this.physics, before = { position: { ...p.ball.position }, velocity: { ...p.ball.velocity } };
    const controls = active && this.isHost ? this.bots.update(dt) : new Map(); controls.set(0, active ? input : {});
    if (!this.isHost) this.correctBall(dt);
    p.step(dt, controls); this.current = p.snapshot();
    for (const event of p.events) {
      if (event.type === 'goal') { if (active && this.isHost) this.goal(event); continue; }
      if (active && event.type === 'ballHit') { if (this.isHost) this.registerTouch(event, before); if (event.carId === 0) { this.ownUntil = now() + .3; this.hitPending = true; } }
      this.emit('physics', { event });
    }
    if (this.ownUntil > now()) { const c = p.cars[0].position, b = p.ball.position; if (Math.hypot(c.x - b.x, c.y - b.y, c.z - b.z) < 4.6) this.ownUntil = Math.max(this.ownUntil, now() + .12); }
  }
  /** Clients pull their local ball toward the host's (dead-reckoned) ball. */
  correctBall(dt) {
    const h = this.hostBall, t = now(); if (!h || this.ownUntil > t || this.claimUntil > t) return;
    const s = h.s, age = Math.min(.3, t - h.at + .05), body = this.physics.ball.body, R = ARENA.ballRadius;
    const tx = s[0] + s[7] * age, ty = Math.max(R, s[1] + s[8] * age - 9.8 * age * age), tz = s[2] + s[9] * age;
    const p = body.translation(), v = body.linvel(), ex = tx - p.x, ey = ty - p.y, ez = tz - p.z;
    if (ex * ex + ey * ey + ez * ez > 49) { this.applyBall(s, age); return; }
    const k = 1 - Math.exp(-10 * dt), kv = 1 - Math.exp(-8 * dt);
    body.setTranslation({ x: p.x + ex * k, y: p.y + ey * k, z: p.z + ez * k }, true);
    body.setLinvel({ x: v.x + (s[7] - v.x) * kv, y: v.y + (s[8] - v.y) * kv, z: v.z + (s[9] - v.z) * kv }, true);
  }
  applyBall(s, age = .05) {
    const R = ARENA.ballRadius, body = this.physics.ball.body;
    body.setTranslation({ x: s[0] + s[7] * age, y: Math.max(R, s[1] + s[8] * age), z: s[2] + s[9] * age }, true);
    body.setLinvel({ x: s[7], y: s[8], z: s[9] }, true); body.setAngvel({ x: s[10], y: s[11], z: s[12] }, true);
  }
  goal(event) {
    super.goal(event);
    this.pendingEnd = this.overtime || (this.remaining <= 0 && this.score[0] !== this.score[1]);
    const scorer = this.stats.find(s => s.id === event.carId);
    this.net.send({ t: 'goal', n: this.round, team: event.team, k: scorer?.k || '', own: !!scorer && scorer.team !== event.team, sc: [...this.score], p: [r2(event.position.x), r2(event.position.y), r2(event.position.z)] });
  }
  afterGoal() {
    if (this.pendingEnd) { this.finish(); return; }
    if (this.remaining <= 0 && this.score[0] === this.score[1]) { this.enterOvertime(); return; }
    this.kickoffRound(this.round + 1); this.net.send({ t: 'kick', n: this.round, ot: this.overtime ? 1 : 0 });
  }
  enterOvertime() {
    this.overtime = true; this.overtimeTime = 0; this.emit('overtime');
    this.kickoffRound(this.round + 1); this.net.send({ t: 'kick', n: this.round, ot: 1 });
  }
  kickoffRound(n) {
    this.round = n; this.physics.kickoff(); this.bots.reset(); this.hostBall = null; this.ownUntil = 0; this.claimUntil = 0;
    this.current = this.physics.snapshot(); this.previous = this.current; this.touchHistory = []; this.lastCountdown = 3;
    this.setPhase('countdown'); this.emit('countdown', { number: 3 });
  }
  finish() {
    if (this.ended) return;
    const winner = this.score[0] > this.score[1] ? 0 : 1;
    const st = this.stats.map(s => [s.k, s.name, s.team, s.points, s.goals, s.assists, s.saves, s.shots]);
    this.net.send({ t: 'end', w: winner, sc: [...this.score], st }); this.net.backToLobby?.();
    this.end(winner, [...this.score], st);
  }
  end(winner, score, st) {
    if (this.ended) return; this.ended = true; this.score = score; this.setPhase('results');
    const stats = st.map(([k, name, team, points, goals, assists, saves, shots]) => ({ id: k === this.net?.self ? 0 : -1, k, name: cleanName(name), team, points, goals, assists, saves, shots, isPlayer: k === this.net?.self }));
    this.emit('matchEnd', { online: true, winner, won: winner === this.myTeam, score, stats, mvp: [...stats].sort((a, b) => b.points - a.points || b.goals - a.goals)[0] });
  }
  skipReplay() {}
  carState(c) { return [c.key, ...packBody(c), Math.round(c.boost), carFlags(c)]; }
  /** Send our state at ~12 Hz (host: ball, clock, bots and own car; others: own car). */
  netTick(dt) {
    if (!this.net || !['countdown', 'live', 'goal'].includes(this.phase)) return;
    this.sendTimer += dt; const t = now();
    if (!(this.sendTimer >= SEND_INTERVAL || (this.hitPending && t - this.lastSend > .06))) return;
    this.sendTimer = 0; this.lastSend = t; const hit = this.hitPending; this.hitPending = false;
    const p = this.physics, me = p.cars[0];
    if (this.isHost) {
      const cars = p.cars.filter(c => !c.proxy).map(c => this.carState(c));
      this.net.send({ t: 's', n: this.round, ph: this.phase, rm: r2(this.remaining), ot: this.overtime ? r2(this.overtimeTime) : -1, sc: this.score, b: packBody(p.ball), c: cars });
    } else {
      const msg = { t: 'c', n: this.round, s: packBody(me), bo: Math.round(me.boost), f: carFlags(me) };
      if (this.ownUntil > t) { msg.b = packBody(p.ball); if (hit) msg.h = 1; }
      this.net.send(msg);
    }
  }
  followCar(k, s, bo, f) {
    const car = this.byKey.get(k); if (!car || car.id === 0 || !car.proxy) return;
    car.net = { s, bo: Number.isFinite(bo) ? bo : 0, f: f | 0, at: now() };
  }
  receive(from, d) {
    if (!this.net || this.phase === 'idle') return;
    const fromHost = from === this.net.room?.host;
    switch (d.t) {
      case 'c': {
        if (d.n !== this.round || !finite(d.s, 13)) return;
        this.followCar(from, d.s, d.bo, d.f);
        if (finite(d.b, 13) && this.ownUntil <= now() && this.phase === 'live') {
          this.applyBall(d.b); this.claimUntil = now() + .2;
          const car = this.byKey.get(from);
          if (d.h && car && this.isHost) { this.physics.lastTouch = car.id; this.touchHistory.push({ id: car.id, team: car.team, time: this.elapsed }); if (this.touchHistory.length > 16) this.touchHistory.shift(); }
        }
        break;
      }
      case 's': {
        if (!fromHost || this.isHost || d.n !== this.round) return;
        if (Array.isArray(d.c)) for (const c of d.c) if (Array.isArray(c) && finite(c.slice(1, 14), 13)) this.followCar(c[0], c.slice(1, 14), c[14], c[15]);
        if (finite(d.b, 13)) this.hostBall = { s: d.b, at: now() };
        if (Number.isFinite(d.rm)) this.remaining = d.rm;
        if (Number.isFinite(d.ot) && d.ot >= 0) { if (!this.overtime) { this.overtime = true; this.emit('overtime'); } this.overtimeTime = d.ot; }
        if (finite(d.sc, 2)) this.score = [d.sc[0], d.sc[1]];
        if (d.ph === 'live' && this.phase === 'countdown' && this.phaseTime > 1) { this.setPhase('live'); this.emit('go'); }
        break;
      }
      case 'goal': {
        if (!fromHost || this.isHost || d.n !== this.round || this.phase === 'goal') return;
        if (finite(d.sc, 2)) this.score = [d.sc[0], d.sc[1]];
        const stat = this.stats.find(s => s.k === d.k);
        if (stat && !d.own) { stat.goals++; stat.points += 100; }
        const team = d.team ? 1 : 0, position = finite(d.p, 3) ? { x: d.p[0], y: d.p[1], z: d.p[2] } : { ...this.physics.ball.position };
        this.setPhase('goal'); this.emit('physics', { event: { type: 'goal', team, position, intensity: 1 } });
        this.emit('goal', { team, name: stat?.name || (team === 0 ? 'BLUE' : 'ORANGE'), ownGoal: !!d.own, score: [...this.score] });
        break;
      }
      case 'back': {
        if (!fromHost || this.isHost) return;
        const s = this.slot(d.k); if (s?.human && s.bot) this.restore(s);
        break;
      }
      case 'kick': {
        if (!fromHost || this.isHost || !Number.isFinite(d.n)) return;
        if (d.ot && !this.overtime) { this.overtime = true; this.overtimeTime = 0; this.emit('overtime'); }
        this.kickoffRound(d.n);
        break;
      }
      case 'end': {
        if (!fromHost || this.isHost || !finite(d.sc, 2) || !Array.isArray(d.st)) return;
        this.end(d.w ? 1 : 0, [d.sc[0], d.sc[1]], d.st.filter(Array.isArray));
        break;
      }
    }
  }
}
