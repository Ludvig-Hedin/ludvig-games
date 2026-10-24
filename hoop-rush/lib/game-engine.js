import { createBall, stepBall, aiShot, PHYSICS_STEP } from './physics.mjs';

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const freshAim = () => ({ active: false, aim: 0, power: 0.58, charge: 0.58, keyboard: false });
const newShotId = () => {
  if (typeof globalThis.crypto.randomUUID === 'function') return globalThis.crypto.randomUUID();
  // getRandomValues remains available on HTTP previews where randomUUID does not.
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40; bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

export class HoopGame {
  constructor(scene, audio, callbacks = {}) {
    this.scene = scene; this.audio = audio; this.cb = callbacks; this.phase = 'home'; this.mode = 'solo';
    this.balls = []; this.aims = [freshAim(), freshAim()]; this.scores = [0, 0]; this.combo = [0, 0];
    this.shots = [0, 0]; this.made = [0, 0]; this.maxCombo = [0, 0]; this.lastShot = [-99, -99];
    this.keys = new Set(); this.pointers = new Map(); this.listeners = []; this.time = 0; this.simTime = 0;
    this.challenge = 'classic'; this.duration = 60; this.lastUi = 0; this.lastTick = -1; this.overtime = 0;
    this.frame = this.frame.bind(this); this.running = true; this.seenOnlineShots = new Set(); this.onlineScores = [0, 0];
    this.handleVisibility = () => { if (document.hidden && this.mode !== 'online' && ['playing', 'countdown', 'settling'].includes(this.phase)) this.pause(); };
    document.addEventListener('visibilitychange', this.handleVisibility);
    this.frameId = requestAnimationFrame(this.frame);
  }
  bindInput(element) {
    this.input = element;
    const on = (target, type, fn, options) => { target.addEventListener(type, fn, options); this.listeners.push(() => target.removeEventListener(type, fn, options)); };
    on(element, 'pointerdown', (e) => {
      if (this.phase !== 'playing' || e.button > 0) return;
      e.preventDefault(); this.audio.unlock();
      const rect = element.getBoundingClientRect();
      const lane = this.mode === 'local' && e.clientX > rect.left + rect.width / 2 ? 1 : 0;
      if ([...this.pointers.values()].some(p => p.lane === lane)) return;
      if (this.time - this.lastShot[lane] < this.cooldown) return;
      const p = { lane, x: e.clientX, y: e.clientY, time: performance.now(), lastX: e.clientX, lastY: e.clientY, lastTime: performance.now(), speed: 0, pointerType: e.pointerType };
      this.pointers.set(e.pointerId, p); element.setPointerCapture(e.pointerId);
      this.aims[lane] = { ...freshAim(), active: true, power: 0.14, charge: 0.14 };
      this.audio.play('pickup');
    });
    on(element, 'pointermove', (e) => {
      const p = this.pointers.get(e.pointerId); if (!p || this.phase !== 'playing') return;
      e.preventDefault();
      const rect = element.getBoundingClientRect(), width = rect.width / (this.mode === 'local' ? 2 : 1);
      const up = p.y - e.clientY, dx = e.clientX - p.x;
      const dt = Math.max(16, performance.now() - p.lastTime);
      p.speed = p.speed * 0.7 + Math.max(0, p.lastY - e.clientY) / dt * 0.3;
      const power = clamp(0.14 + Math.max(0, up) / Math.max(160, rect.height * 0.32) * 0.65, 0.12, 1);
      this.aims[p.lane] = { active: true, aim: clamp(dx / Math.max(130, width * 0.3), -1, 1), power, charge: power, keyboard: false };
      p.lastX = e.clientX; p.lastY = e.clientY; p.lastTime = performance.now();
    });
    const release = (e) => {
      const p = this.pointers.get(e.pointerId); if (!p) return;
      this.pointers.delete(e.pointerId); const aim = this.aims[p.lane];
      if (element.hasPointerCapture(e.pointerId)) element.releasePointerCapture(e.pointerId);
      if (e.type === 'pointercancel') { aim.active = false; return; }
      const dist = Math.hypot(e.clientX - p.x, e.clientY - p.y);
      if (this.phase === 'playing' && dist > 12) {
        // A swipe adds a small, bounded speed contribution; mouse drags use distance exactly.
        const extra = p.pointerType === 'touch' ? Math.min(0.045, p.speed * 0.016) : 0;
        this.shoot(p.lane, aim.aim, clamp(aim.power + extra, 0.12, 1));
      }
      aim.active = false;
    };
    on(element, 'pointerup', release); on(element, 'pointercancel', release);
    on(element, 'contextmenu', e => e.preventDefault());
    on(window, 'keydown', e => {
      if (e.target instanceof HTMLElement && (['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(e.target.tagName) || e.target.isContentEditable)) return;
      const handled = ['Space', 'Enter', 'KeyA', 'KeyD', 'KeyW', 'KeyS', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Escape', 'KeyP'];
      if (!handled.includes(e.code)) return;
      if (e.code === 'Escape' || e.code === 'KeyP') {
        if (e.repeat) return;
        if (this.phase === 'paused') this.resume(); else if (['playing','countdown','settling'].includes(this.phase)) this.pause();
        return;
      }
      if (this.phase !== 'playing') return;
      e.preventDefault(); this.keys.add(e.code);
      if (e.repeat) return;
      if (e.code === 'Space' || (e.code === 'Enter' && this.mode === 'local')) {
        const lane = e.code === 'Space' ? 0 : 1;
        this.audio.unlock(); this.audio.play('pickup');
        this.aims[lane] = { ...this.aims[lane], active: true, keyboard: true, began: performance.now(), power: 0.14, charge: 0.14 };
      }
    });
    on(window, 'keyup', e => {
      this.keys.delete(e.code);
      if (e.code === 'Space' || e.code === 'Enter') {
        const lane = e.code === 'Space' ? 0 : 1, a = this.aims[lane];
        if (this.phase === 'playing' && a.active && a.keyboard) this.shoot(lane, a.aim, a.power);
        a.active = false;
      }
    });
    on(window, 'blur', () => { this.cancelInput(); if (this.mode !== 'online') this.pause(); });
  }
  get cooldown() { return this.mode === 'online' ? 0.5 : 0.42; }
  cancelInput() { this.pointers.clear(); this.keys.clear(); this.aims.forEach(a => a.active = false); }
  configure(settings) { this.scene.setTheme(settings.theme); this.scene.setSkin(settings.skin); this.scene.setQuality(settings.quality); this.audio.apply(settings); }
  home() {
    this.phase = 'home'; this.balls = []; this.cancelInput(); this.scene.setMode('home'); this.audio.setActive(false); this.emit();
  }
  start(config = {}) {
    this.config = config; this.mode = config.mode || 'computer'; this.rule = config.rule || 'classic'; this.difficulty = config.difficulty || 'Medium';
    this.challenge = this.rule === 'challenge' ? config.challenge || 'moving' : 'classic'; this.duration = Number(config.duration) || 60; this.baseDuration = this.duration;
    this.balls = []; this.scores = [0, 0]; this.combo = [0, 0]; this.shots = [0, 0]; this.made = [0, 0]; this.maxCombo = [0, 0]; this.lastShot = [-99, -99];
    this.overtime = 0; this.suddenEnd = null; this.emptyOvertimes = 0; this.overtimeBaseScores = [0, 0];
    this.time = 0; this.simTime = 0; this.aiSequence = 0; this.seed = config.daily?.seed || Math.floor(Math.random() * 1000000); this.nextAI = 0.8;
    this.phase = 'countdown'; this.startAt = performance.now() + 3000; this.lastTick = -1; this.lastCountdown = -1; this.resultSent = false; this.finalShot = false;
    this.aims = [freshAim(), freshAim()]; this.cancelInput(); this.scene.setMode(this.mode === 'computer' ? 'versus' : this.mode);
    this.audio.unlock(); this.audio.setActive(true); document.activeElement?.blur?.(); this.emit();
  }
  startOnline(seat, state, offset = 0) {
    this.start({ mode: 'online', rule: 'classic', duration: 60 });
    this.seat = seat; this.round = state.round; this.serverOffset = offset; this.onlineScores = [state.scores[seat], state.scores[1 - seat]]; this.seenOnlineShots = new Set(); this.onlinePeriod = null;
    this.applyOnline(state, offset);
  }
  applyOnline(state, offset = this.serverOffset) {
    this.online = state; this.serverOffset = offset; this.connected = true;
    if (this.mode !== 'online') return;
    const own = this.seat || 0, other = 1 - own;
    if (this.round !== state.round) {
      this.round = state.round; this.resultSent = false; this.balls = []; this.seenOnlineShots.clear(); this.made = [0, 0]; this.maxCombo = [0, 0]; this.combo = [0, 0]; this.onlineScores = [0, 0];
      this.audio.setActive(true); document.activeElement?.blur?.();
    }
    if (state.startAt && this.onlinePeriod !== state.startAt) {
      this.cancelInput();
      this.onlinePeriod = state.startAt; this.simTime = Math.max(0, (Date.now() + offset - state.startAt) / 1000); this.balls = []; this.lastShot = [-99, -99]; this.lastCountdown = -1; this.lastTick = -1;
    }
    this.duration = state.duration; this.overtime = state.overtime || 0;
    const scores = [state.scores[own], state.scores[other]];
    for (let lane = 0; lane < 2; lane++) {
      const diff = scores[lane] - this.onlineScores[lane];
      if (diff > 0) {
        if (!state.made) this.made[lane]++;
        if (!state.combo) this.combo[lane]++;
        if (!state.maxCombo) this.maxCombo[lane] = Math.max(this.maxCombo[lane], this.combo[lane]);
        this.cb.onBasket?.({ lane, points: diff, combo: state.combo ? state.combo[lane === 0 ? own : other] : this.combo[lane], swish: false });
      }
    }
    this.scores = scores; this.onlineScores = [...scores]; this.shots = [state.shots[own], state.shots[other]];
    if (state.made) this.made = [state.made[own], state.made[other]];
    if (state.combo) this.combo = [state.combo[own], state.combo[other]];
    if (state.maxCombo) this.maxCombo = [state.maxCombo[own], state.maxCombo[other]];
    const now = Math.max(0, (Date.now() + offset - state.startAt) / 1000);
    for (const shot of state.recentShots || []) {
      if (this.seenOnlineShots.has(shot.id) || shot.shotAt < state.startAt) continue;
      this.seenOnlineShots.add(shot.id);
      const shotTime = (shot.shotAt - state.startAt) / 1000;
      if (now - shotTime > 5) continue;
      const ball = createBall({ id: shot.id, lane: shot.seat === own ? 0 : 1, aim: shot.aim, power: shot.power, shotTime, challenge: 'classic' });
      ball.launchPower = shot.power; ball.launchAim = shot.aim;
      let t = shotTime;
      while (t + PHYSICS_STEP <= now && !ball.dead) { stepBall(ball, PHYSICS_STEP, t, 'classic'); t += PHYSICS_STEP; }
      if (!ball.dead) this.balls.push(ball);
    }
    const next = state.status === 'waiting' ? 'home' : state.status;
    if (next === 'finished') { this.finish(); }
    else if (['countdown', 'playing', 'settling'].includes(next)) this.phase = next;
    this.emit();
  }
  shoot(lane, aim, power) {
    if (this.phase !== 'playing' || this.time - this.lastShot[lane] < this.cooldown) return false;
    if (lane === 1 && !['local', 'computer'].includes(this.mode)) return false;
    if (this.mode === 'online' && !this.connected) return false;
    const id = newShotId();
    const ball = createBall({ id, aim, power, shotTime: this.time, challenge: this.challenge, lane });
    ball.launchPower = power; ball.launchAim = aim; ball.releaseAt = this.time;
    this.balls.push(ball); this.lastShot[lane] = this.time; this.shots[lane]++; this.audio.play('release');
    if (this.mode === 'online') {
      this.seenOnlineShots.add(id);
      if (this.cb.onShot?.({ id, aim, power }) === false) this.rejectShot(id);
    }
    this.aims[lane].active = false; this.emit(); return true;
  }
  /** The server refused a shot (or it could not be sent): take the ball back. */
  rejectShot(id) {
    const before = this.balls.length;
    this.balls = this.balls.filter(b => b.id !== id); this.seenOnlineShots.delete(id);
    if (this.balls.length < before && this.shots[0] > 0) this.shots[0]--;
    this.emit();
  }
  pause() {
    if (!['playing', 'countdown', 'settling'].includes(this.phase)) return;
    if (this.mode === 'online') { this.cb.onOnlinePause?.(); return; }
    this.pausedFrom = this.phase; this.pauseAt = performance.now(); this.phase = 'paused'; this.cancelInput(); this.audio.setActive(false); this.emit();
  }
  resume() {
    if (this.phase !== 'paused') return;
    this.startAt += performance.now() - this.pauseAt; this.phase = this.pausedFrom; this.audio.unlock(); this.audio.setActive(true); document.activeElement?.blur?.(); this.emit();
  }
  handleEvent(event, ball) {
    const lane = ball.lane || 0;
    if (['rim', 'board', 'floor', 'net'].includes(event.type)) this.audio.play(event.type, event.strength ?? 1);
    if (event.type === 'score') {
      this.scene.celebrate(lane, !!event.swish); this.audio.play('score', 1, this.combo[lane] + 1);
      if (this.mode === 'online') return;
      this.made[lane]++; this.combo[lane]++; this.maxCombo[lane] = Math.max(this.maxCombo[lane], this.combo[lane]);
      const multiplier = this.rule === 'challenge' ? Math.min(3, 1 + Math.floor((this.combo[lane] - 1) / 3)) : 1;
      const bonus = this.rule === 'challenge' && Math.floor((ball.shotTime || 0) % 30) >= 20 && Math.floor((ball.shotTime || 0) % 30) < 26 ? 2 : 1;
      const points = (!this.overtime && (ball.shotTime || 0) >= this.duration - 10 ? 3 : 2) * multiplier * bonus;
      this.scores[lane] += points; this.cb.onBasket?.({ lane, points, combo: this.combo[lane], swish: !!event.swish });
      // The first overtime basket closes new releases. Already-airborne balls
      // keep their full flight, matching the authoritative online rules.
      if (this.overtime && this.suddenEnd == null) { this.suddenEnd = this.time; this.phase = 'settling'; this.cancelInput(); }
    }
    if (event.type === 'miss') {
      if (this.mode === 'online') return;
      this.combo[lane] = 0;
      if (lane === 0 && this.shots[0] < 6 && !this.made[0]) this.cb.onHint?.(Math.abs(ball.launchAim) > 0.2 ? 'Keep your swipe straight' : ball.launchPower < 0.53 ? 'Drag a little farther' : ball.launchPower > 0.66 ? 'Try a little less power' : 'Almost. Adjust your aim.');
    }
  }
  updateInput(now, dt) {
    for (let lane = 0; lane < (this.mode === 'local' ? 2 : 1); lane++) {
      const a = this.aims[lane];
      const left = this.keys.has(lane ? 'ArrowLeft' : 'KeyA'), right = this.keys.has(lane ? 'ArrowRight' : 'KeyD');
      if (left || right) a.aim = clamp(a.aim + (Number(right) - Number(left)) * dt * 0.65, -1, 1);
      if (a.active && a.keyboard) {
        const held = (now - a.began) / 1000;
        a.power = clamp(0.14 + held * 0.42, 0.12, 1); a.charge = a.power;
      }
    }
  }
  frame(now) {
    if (!this.running) return;
    const dt = Math.min(0.1, (now - (this.previousFrame || now)) / 1000); this.previousFrame = now;
    if (this.mode === 'online' && this.online?.startAt && this.phase !== 'finished') this.time = Math.max(0, (Date.now() + this.serverOffset - this.online.startAt) / 1000);
    else if (['playing', 'countdown', 'settling'].includes(this.phase)) this.time = Math.max(0, (now - this.startAt) / 1000);
    if (this.phase === 'countdown') {
      const wait = this.mode === 'online' ? (this.online.startAt - Date.now() - this.serverOffset) / 1000 : (this.startAt - now) / 1000;
      const tick = Math.max(0, Math.ceil(wait));
      if (tick !== this.lastCountdown) { this.audio.play(tick ? 'countdown' : 'go'); this.lastCountdown = tick; }
      if (wait <= 0) this.phase = 'playing';
    }
    if (this.phase === 'playing' || this.phase === 'settling') {
      this.updateInput(now, dt);
      if (this.phase === 'playing') {
        if (this.mode === 'computer' && this.time >= this.nextAI && this.time < this.duration) {
          const shot = aiShot(this.difficulty, this.aiSequence++, this.seed, this.time, this.challenge);
          this.shoot(1, shot.aim, shot.power); this.nextAI = this.time + shot.delay;
        }
        const shootingLimit = this.mode === 'online' && this.online?.endAt ? (this.online.endAt - this.online.startAt) / 1000 : this.duration;
        if (this.time >= shootingLimit) { this.phase = 'settling'; this.cancelInput(); this.audio.play('buzzer'); }
        const remaining = Math.ceil(shootingLimit - this.time);
        if (remaining > 0 && remaining <= 10 && remaining !== this.lastTick) { this.audio.play('tick'); this.lastTick = remaining; }
      }
      const target = Math.min(this.time, this.simTime + 0.25);
      while (this.simTime + PHYSICS_STEP <= target) {
        for (const ball of this.balls) {
          // Network reconstruction may already have advanced this ball farther
          // than the global render cursor. Always step its own release clock.
          const ballTime = ball.shotTime + ball.age;
          if (ball.dead || ballTime + PHYSICS_STEP > this.simTime + PHYSICS_STEP + 1e-8) continue;
          const events = stepBall(ball, PHYSICS_STEP, ballTime, this.challenge);
          for (const event of events) this.handleEvent(event, ball);
        }
        this.simTime += PHYSICS_STEP;
      }
      this.balls = this.balls.filter(b => !b.dead && b.age < 7);
      if (this.mode !== 'online' && this.phase === 'settling') {
        const cutoff = this.suddenEnd ?? this.duration;
        const unresolved = this.balls.some(b => !b.scored && !b.missed && !b.dead);
        // Rim rattles can legitimately take more than three seconds. Bound the
        // completed simulation, so a stalled frame cannot discard a valid shot.
        if (this.simTime >= cutoff + 4.5 || (this.time >= cutoff + 0.2 && !unresolved)) {
          if (this.overtime) {
            const periodScored = this.scores.some((score, lane) => score > this.overtimeBaseScores[lane]);
            this.emptyOvertimes = periodScored ? 0 : this.emptyOvertimes + 1;
          }
          if (this.mode !== 'solo' && this.scores[0] === this.scores[1] && this.emptyOvertimes < 2) this.startOvertime(now);
          else this.finish();
        }
      }
    }
    const remaining = this.timeRemaining();
    this.scene.update({ time: this.phase === 'home' ? now / 1000 : this.time, balls: this.balls, aims: this.aims, scores: this.scores, remaining, phase: this.phase, challenge: this.challenge, combo: this.combo });
    if (now - this.lastUi > 50 && !['home', 'finished', 'paused'].includes(this.phase)) { this.emit(); this.lastUi = now; }
    this.frameId = requestAnimationFrame(this.frame);
  }
  startOvertime(now) {
    this.overtime++; this.duration = 15; this.startAt = now + 2500; this.simTime = 0; this.time = 0; this.phase = 'countdown';
    this.overtimeBaseScores = [...this.scores];
    this.balls = []; this.lastShot = [-99, -99]; this.nextAI = 0.75; this.lastCountdown = -1; this.lastTick = -1; this.suddenEnd = null; 
  }
  finish() {
    if (this.resultSent) return;
    this.resultSent = true; this.phase = 'finished'; this.cancelInput(); this.audio.setActive(false);
    const winner = this.mode === 'online' && this.online ? (this.online.winner === null ? null : this.online.winner === this.seat ? 0 : 1) : this.scores[0] === this.scores[1] ? null : this.scores[0] > this.scores[1] ? 0 : 1;
    const won = this.mode === 'solo' || winner === 0; this.audio.play(won ? 'win' : 'lose');
    const result = { scores: [...this.scores], shots: [...this.shots], made: [...this.made], maxCombo: [...this.maxCombo], mode: this.mode, rule: this.rule, difficulty: this.difficulty, duration: this.baseDuration, overtime: this.overtime, winner, matchId: this.mode === 'online' ? `${this.online.room}:${this.round}:${this.seat}` : null, resultReason: this.mode === 'online' ? this.online?.resultReason : 'score', daily: this.config?.daily, bestKey: `${this.rule}${this.rule === 'challenge' ? '-' + this.challenge : ''}-${this.baseDuration}` };
    this.cb.onResult?.(result); this.emit();
  }
  timeRemaining() {
    if (this.mode === 'online' && this.online?.startAt) return Math.max(0, Math.min(this.duration, (this.online.endAt - Date.now() - this.serverOffset) / 1000));
    return Math.max(0, this.duration - this.time);
  }
  emit() {
    const wait = this.phase === 'countdown' ? this.mode === 'online' && this.online?.startAt ? (this.online.startAt - Date.now() - this.serverOffset) / 1000 : (this.startAt - performance.now()) / 1000 : 0;
    this.cb.onState?.({ phase: this.phase, mode: this.mode, scores: [...this.scores], shots: [...this.shots], made: [...this.made], combo: [...this.combo], time: this.time, remaining: this.timeRemaining(), duration: this.duration, countdown: Math.max(1, Math.ceil(wait)), overtime: this.overtime, aims: this.aims.map(a => ({ ...a })), challenge: this.challenge, rule: this.rule, connected: this.connected, bonus: this.rule === 'challenge' && this.time % 30 >= 20 && this.time % 30 < 26 });
  }
  dispose() { this.running = false; cancelAnimationFrame(this.frameId); this.listeners.forEach(fn => fn()); document.removeEventListener('visibilitychange', this.handleVisibility); this.scene.dispose(); this.audio.dispose(); }
}
