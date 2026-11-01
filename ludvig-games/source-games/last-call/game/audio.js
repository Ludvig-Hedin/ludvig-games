const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.musicEnabled = true;
    this.paused = false;
    this.volume = .68;
    this.voices = new Set();
    this.engines = [];
    this.scheduler = null;
    this.beat = 0;
    this.nextBeat = 0;
    this.destroyed = false;
    this.finishTimer = null;
  }

  async unlock() {
    if (this.destroyed) return;
    try {
      if (!this.ctx) {
        const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
        if (!Context) return;
        this.ctx = new Context();
        this.master = this.ctx.createGain(); this.master.gain.value = this.volume;
        this.compressor = this.ctx.createDynamicsCompressor();
        this.compressor.threshold.value = -18; this.compressor.ratio.value = 3;
        this.master.connect(this.compressor); this.compressor.connect(this.ctx.destination);
        this.sfx = this.ctx.createGain(); this.sfx.gain.value = .42; this.sfx.connect(this.master);
        this.music = this.ctx.createGain(); this.music.gain.value = .21; this.music.connect(this.master);
        const size = this.ctx.sampleRate * 2;
        this.noise = this.ctx.createBuffer(1, size, this.ctx.sampleRate);
        const data = this.noise.getChannelData(0);
        let last = 0;
        for (let i = 0; i < size; i++) { const white = Math.random() * 2 - 1; last = (last + white * .02) / 1.02; data[i] = last * 3.8; }
      }
      if (!this.muted && !this.paused) {
        if (this.finishTimer !== null) { clearTimeout(this.finishTimer); this.finishTimer = null; }
        await this.ctx.resume(); this.startEngine(); this.startMusic();
      }
    } catch { /* Audio is an enhancement; blocked audio must never stop a run. */ }
  }

  setMuted(value) {
    this.muted = Boolean(value);
    if (this.muted) this.stop();
    // Applying saved settings at boot must not create an AudioContext. The
    // first unlock belongs to a deliberate user interaction such as Play.
    else if (this.ctx) void this.unlock();
  }

  setMusic(value) {
    this.musicEnabled = Boolean(value);
    if (this.musicEnabled) this.startMusic();
    else { this.stopScheduler(); this.stopVoices('music'); }
  }

  setVolume(value) {
    this.volume = clamp(Number(value) || 0, 0, 1);
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, .06);
  }

  pause(value = true) {
    this.paused = Boolean(value);
    if (this.paused) this.stop(); else void this.unlock();
  }

  // The result sting remains audible after the driving loop has stopped.
  finish() {
    if (!this.active()) { this.pause(true); return; }
    if (this.finishTimer !== null) clearTimeout(this.finishTimer);
    this.stopScheduler(); this.stopVoices(); this.stopEngine();
    this.event({ type: 'finish' });
    this.paused = true;
    this.finishTimer = setTimeout(() => {
      this.finishTimer = null;
      if (this.paused && this.ctx?.state === 'running') void this.ctx.suspend().catch(() => {});
    }, 1250);
  }

  active() { return this.ctx && this.ctx.state === 'running' && !this.muted && !this.paused && !this.destroyed; }

  track(source, nodes, category) {
    const voice = { source, nodes, category };
    this.voices.add(voice);
    source.onended = () => {
      try { source.disconnect(); nodes.forEach(n => n.disconnect()); } catch { }
      this.voices.delete(voice);
    };
    return voice;
  }

  tone(frequency, time, duration = .2, volume = .2, type = 'sine', category = 'sfx', endFrequency = null) {
    if (!this.active()) return;
    const oscillator = this.ctx.createOscillator(), gain = this.ctx.createGain();
    oscillator.type = type; oscillator.frequency.setValueAtTime(frequency, time);
    if (endFrequency) oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), time + duration);
    gain.gain.setValueAtTime(.0001, time);
    gain.gain.exponentialRampToValueAtTime(Math.max(.001, volume), time + .006);
    gain.gain.exponentialRampToValueAtTime(.0001, time + duration);
    oscillator.connect(gain); gain.connect(category === 'music' ? this.music : this.sfx);
    this.track(oscillator, [gain], category); oscillator.start(time); oscillator.stop(time + duration + .02);
  }

  hiss(time, duration, volume, cutoff, category = 'sfx', bandpass = false) {
    if (!this.active()) return;
    const source = this.ctx.createBufferSource(), filter = this.ctx.createBiquadFilter(), gain = this.ctx.createGain();
    source.buffer = this.noise;
    filter.type = bandpass ? 'bandpass' : 'highpass'; filter.frequency.value = cutoff; filter.Q.value = .8;
    gain.gain.setValueAtTime(Math.max(.0001, volume), time);
    gain.gain.exponentialRampToValueAtTime(.0001, time + duration);
    source.connect(filter); filter.connect(gain); gain.connect(category === 'music' ? this.music : this.sfx);
    this.track(source, [filter, gain], category); source.start(time, Math.random()); source.stop(time + duration + .01);
  }

  startEngine() {
    if (!this.active() || this.engines.length) return;
    const roll = this.ctx.createBufferSource(); roll.buffer = this.noise; roll.loop = true;
    const filter = this.ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 280;
    const gain = this.ctx.createGain(); gain.gain.value = 0;
    roll.connect(filter); filter.connect(gain); gain.connect(this.sfx); roll.start();
    const drift = this.ctx.createBufferSource(); drift.buffer = this.noise; drift.loop = true;
    const driftFilter = this.ctx.createBiquadFilter(); driftFilter.type = 'bandpass'; driftFilter.frequency.value = 1800; driftFilter.Q.value = .7;
    const driftGain = this.ctx.createGain(); driftGain.gain.value = 0;
    drift.connect(driftFilter); driftFilter.connect(driftGain); driftGain.connect(this.sfx); drift.start();
    const motor = this.ctx.createOscillator(); motor.type = 'triangle'; motor.frequency.value = 40;
    const motorGain = this.ctx.createGain(); motorGain.gain.value = 0;
    motor.connect(motorGain); motorGain.connect(this.sfx); motor.start();
    this.engines = [roll, drift, motor];
    this.engineNodes = [filter, gain, driftFilter, driftGain, motorGain];
    this.rolling = { filter, gain, motor, motorGain, driftGain };
  }

  update(player, dt = 1 / 60) {
    if (!this.active() || !this.rolling || !player) return;
    const t = this.ctx.currentTime, speed = Math.abs(player.speed ?? Math.hypot(player.vx || 0, player.vz || 0));
    const f = clamp(speed / 30, 0, 1);
    this.rolling.gain.gain.setTargetAtTime(f * .19, t, .1);
    this.rolling.filter.frequency.setTargetAtTime(180 + f * 800, t, .1);
    this.rolling.motor.frequency.setTargetAtTime(38 + f * 74 + (player.boosting || player.turboTimer > 0 ? 28 : 0), t, .08);
    this.rolling.motorGain.gain.setTargetAtTime(f * .026, t, .08);
    this.rolling.driftGain.gain.setTargetAtTime(player.drifting && speed > 5 ? .16 * f : 0, t, .05);
  }

  startMusic() {
    if (!this.active() || !this.musicEnabled || this.scheduler) return;
    this.nextBeat = this.ctx.currentTime + .06;
    const interval = 60 / 114 / 4;
    const tick = () => {
      if (!this.active() || !this.musicEnabled) return;
      let safety = 0;
      while (this.nextBeat < this.ctx.currentTime + .16 && safety++ < 12) {
        this.musicStep(this.beat++, this.nextBeat); this.nextBeat += interval;
      }
    };
    this.scheduler = globalThis.setInterval(tick, 45); tick();
  }

  musicStep(beat, time) {
    const step = beat % 16;
    const roots = [55, 65.406, 73.416, 48.999];
    const root = roots[Math.floor(beat / 32) % roots.length];
    if (step % 4 === 0) this.tone(130, time, .18, .47, 'sine', 'music', 42);
    if (step === 4 || step === 12) { this.hiss(time, .12, .46, 950, 'music'); this.tone(185, time, .065, .11, 'triangle', 'music', 120); }
    if (step % 2 === 1) this.hiss(time, step === 15 ? .13 : .045, step % 4 === 3 ? .24 : .16, 4400, 'music');
    if ([0, 3, 6, 8, 11, 14].includes(step)) this.tone(root * (step === 14 ? 2 : 1), time, .2, .3, 'triangle', 'music');
    const intervals = [4, 6, 9, 8, 6, 4, 3, 6];
    if (step % 2 === 0) {
      const note = root * intervals[(Math.floor(step / 2) + Math.floor(beat / 64)) % intervals.length];
      this.tone(note, time, .21, step === 0 ? .075 : .047, 'sine', 'music');
      this.tone(note * 2, time + .005, .13, .012, 'sine', 'music');
    }
    if (step === 0 && beat % 32 === 0) for (const r of [4, 4.7568, 6]) this.tone(root * r, time, 1.75, .045, 'triangle', 'music');
  }

  event(event) {
    if (!this.active()) return;
    const type = typeof event === 'string' ? event : event.type;
    const now = this.ctx.currentTime;
    if (type === 'pickup') {
      const pitch = 660 * Math.pow(2, Math.min(event.amount || event.cargo || 0, 8) / 24);
      this.tone(pitch, now, .12, .15, 'sine'); this.tone(pitch * 1.5, now + .06, .18, .11, 'triangle');
    } else if (type === 'delivery') {
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone(f, now + i * .075, .4, .17, 'triangle'));
      this.tone(130.81, now, .4, .22, 'sine'); this.hiss(now, .28, .12, 2800);
    } else if (type === 'collision') {
      this.tone(115, now, .13, .24, 'triangle', 'sfx', 35); this.hiss(now, .13, .35, 300, 'sfx', true);
      this.tone(600, now, .055, .04, 'square', 'sfx', 220);
    } else if (type === 'drift' || type === 'boost') {
      this.tone(210, now, .24, .11, 'sine', 'sfx', 740); this.hiss(now, .3, .12, 1100);
    } else if (type === 'jump') {
      this.tone(220, now, .22, .07, 'sine', 'sfx', 440);
    } else if (type === 'land') {
      this.tone(75, now, .1, .16, 'sine', 'sfx', 35); this.hiss(now, .08, .16, 450, 'sfx', true);
    } else if (type === 'countdown' || type === 'tick') {
      this.tone(event.value === 0 ? 880 : 440, now, .13, .13, 'sine');
    } else if (type === 'finish') {
      [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => this.tone(f, now + i * .11, .7, .15, 'triangle'));
    } else if (type === 'click') this.tone(420, now, .04, .055, 'sine');
  }

  stopScheduler() { if (this.scheduler !== null) { globalThis.clearInterval(this.scheduler); this.scheduler = null; } }

  stopVoices(category = null) {
    for (const voice of [...this.voices]) if (!category || voice.category === category) {
      try { voice.source.stop(); voice.source.disconnect(); voice.nodes.forEach(n => n.disconnect()); } catch { }
      this.voices.delete(voice);
    }
  }

  stopEngine() {
    for (const source of this.engines) { try { source.stop(); source.disconnect(); } catch { } }
    (this.engineNodes || []).forEach(n => { try { n.disconnect(); } catch { } });
    this.engines = []; this.engineNodes = []; this.rolling = null;
  }

  stop() {
    if (this.finishTimer !== null) { clearTimeout(this.finishTimer); this.finishTimer = null; }
    this.stopScheduler(); this.stopVoices(); this.stopEngine();
    if (this.ctx?.state === 'running') void this.ctx.suspend().catch(() => {});
  }

  dispose() {
    this.stop(); this.destroyed = true;
    if (this.ctx) void this.ctx.close().catch(() => {});
    this.ctx = null;
  }
}
