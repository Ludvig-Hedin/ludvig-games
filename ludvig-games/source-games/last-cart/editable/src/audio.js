/**
 * LAST CART — procedural sound, no downloads and no autoplay assumptions.
 * Call unlock() inside the first user gesture. All other methods are safe
 * before audio becomes available and degrade quietly without Web Audio.
 */
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.musicVolume = 0.25;
    this.sfxVolume = 0.6;
    this.muted = false;
    this.active = false;
    this.suspended = false;
    this.disposed = false;
    this._hidden = typeof document !== 'undefined' && document.hidden;
    this._step = 0;
    this._nextNote = 0;
    this._timer = null;
    this._voices = new Set();
    this._cooldowns = new Map();
    this._drifting = false;
    this._visibility = () => {
      this._hidden = document.hidden;
      this._applySuspension();
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this._visibility);
    }
  }

  async unlock() {
    if (this.disposed) return false;
    try {
      if (!this.ctx) this._create();
      if (!this.ctx) return false;
      if (!this._hidden && this.ctx.state === 'suspended') await this.ctx.resume();
      this._nextNote = Math.max(this._nextNote, this.ctx.currentTime + 0.04);
      this._applyVolumes();
      return this.ctx.state === 'running';
    } catch {
      // Browser policy or missing audio hardware must never stop the game.
      return false;
    }
  }

  _create() {
    const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = this.ctx = new AudioContextClass({ latencyHint: 'interactive' });
    this.master = ctx.createGain();
    this.compressor = ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -15;
    this.compressor.knee.value = 14;
    this.compressor.ratio.value = 5;
    this.compressor.attack.value = 0.006;
    this.compressor.release.value = 0.14;
    this.master.connect(this.compressor).connect(ctx.destination);

    this.musicBus = ctx.createGain();
    this.sfxBus = ctx.createGain();
    this.musicBus.connect(this.master);
    this.sfxBus.connect(this.master);

    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const noiseData = this.noise.getChannelData(0);
    let seed = 923741;
    for (let i = 0; i < noiseData.length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      noiseData[i] = seed / 2147483648 - 1;
    }
    this._createWheels();
    this._applyVolumes();
    this._nextNote = ctx.currentTime + 0.08;
    this._timer = setInterval(() => this._schedule(), 40);
  }

  setVolumes({ music, sfx } = {}) {
    if (Number.isFinite(music)) this.musicVolume = Math.min(1, Math.max(0, music));
    if (Number.isFinite(sfx)) this.sfxVolume = Math.min(1, Math.max(0, sfx));
    this._applyVolumes();
  }

  setMuted(muted) {
    this.muted = Boolean(muted);
    this._applyVolumes();
  }

  setActive(active) {
    this.active = Boolean(active);
    if (!this.active && this.ctx && this.wheelGain) {
      this.wheelGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.09);
      this.skidGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.07);
    }
    this._applyVolumes();
  }

  setSuspended(suspended) {
    this.suspended = Boolean(suspended);
    this._applySuspension();
  }

  _applySuspension() {
    if (!this.ctx || this.disposed) return;
    this._applyVolumes();
    if (this._hidden) {
      this.ctx.suspend().catch(() => {});
    } else if (this.ctx.state === 'suspended') {
      this._nextNote = this.ctx.currentTime + 0.04;
      this.ctx.resume().catch(() => {});
    }
  }

  _applyVolumes() {
    if (!this.ctx || this.disposed) return;
    const t = this.ctx.currentTime;
    const silent = this.muted || this.suspended || this._hidden;
    this.master.gain.setTargetAtTime(silent ? 0 : 0.8, t, 0.025);
    this.musicBus.gain.setTargetAtTime(this.musicVolume * (this.active ? 1 : 0.56), t, 0.2);
    this.sfxBus.gain.setTargetAtTime(this.sfxVolume, t, 0.025);
  }

  _createWheels() {
    const ctx = this.ctx;
    this.wheelSource = ctx.createBufferSource();
    this.wheelSource.buffer = this.noise;
    this.wheelSource.loop = true;
    this.wheelSource.playbackRate.value = 0.8;
    this.wheelFilter = ctx.createBiquadFilter();
    this.wheelFilter.type = 'lowpass';
    this.wheelFilter.frequency.value = 330;
    this.wheelFilter.Q.value = 0.45;
    this.wheelGain = ctx.createGain();
    this.wheelGain.gain.value = 0;
    this.wheelSource.connect(this.wheelFilter).connect(this.wheelGain).connect(this.sfxBus);
    this.wheelSource.start();

    this.skidSource = ctx.createBufferSource();
    this.skidSource.buffer = this.noise;
    this.skidSource.loop = true;
    this.skidFilter = ctx.createBiquadFilter();
    this.skidFilter.type = 'bandpass';
    this.skidFilter.frequency.value = 760;
    this.skidFilter.Q.value = 0.7;
    this.skidGain = ctx.createGain();
    this.skidGain.gain.value = 0;
    this.skidSource.connect(this.skidFilter).connect(this.skidGain).connect(this.sfxBus);
    this.skidSource.start(0, 0.81);
  }

  update({ speed = 0, drifting = false, boosting = false } = {}, dt = 1 / 60) {
    if (!this.ctx || this.disposed || !this.wheelGain) return;
    const t = this.ctx.currentTime;
    const speedRatio = Math.min(1.6, Math.max(0, Number.isFinite(speed) ? speed / 18 : 0));
    const audible = this.active && !this.suspended && !this._hidden;
    this.wheelGain.gain.setTargetAtTime(audible ? speedRatio * 0.065 : 0, t, 0.09);
    this.wheelFilter.frequency.setTargetAtTime(180 + speedRatio * 500, t, 0.12);
    this.wheelSource.playbackRate.setTargetAtTime(0.6 + speedRatio * 0.8, t, 0.12);
    this.skidGain.gain.setTargetAtTime(audible && drifting ? Math.min(0.09, speedRatio * 0.07) : 0, t, 0.045);
    this.skidFilter.frequency.setTargetAtTime(560 + speedRatio * 260 + (boosting ? 140 : 0), t, 0.1);
    this._drifting = Boolean(drifting);
  }

  _output(envelope, bus, pan) {
    const destination = bus === 'music' ? this.musicBus : this.sfxBus;
    if (this.ctx.createStereoPanner && Math.abs(pan) > 0.01) {
      const panner = this.ctx.createStereoPanner();
      panner.pan.value = Math.min(1, Math.max(-1, pan));
      envelope.connect(panner).connect(destination);
      return panner;
    }
    envelope.connect(destination);
    return null;
  }

  _track(source, nodes) {
    this._voices.add(source);
    source.onended = () => {
      this._voices.delete(source);
      source.disconnect();
      for (const node of nodes) if (node) node.disconnect();
    };
  }

  _tone(frequency, endFrequency, start, duration, amplitude, wave = 'sine', bus = 'sfx', pan = 0, cutoff = 0) {
    if (!this.ctx || this._voices.size > 85) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = wave;
    osc.frequency.setValueAtTime(Math.max(20, frequency), start);
    if (endFrequency !== frequency) osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), start + duration * 0.85);
    const attack = Math.min(0.012, duration * 0.15);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, amplitude), start + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    let filter;
    if (cutoff) {
      filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = cutoff;
      filter.Q.value = 0.65;
      osc.connect(filter).connect(gain);
    } else osc.connect(gain);
    const panNode = this._output(gain, bus, pan);
    this._track(osc, [gain, filter, panNode]);
    osc.start(start);
    osc.stop(start + duration + 0.025);
  }

  _noise(start, duration, amplitude, frequency = 1200, filterType = 'bandpass', bus = 'sfx', pan = 0, endFrequency = frequency) {
    if (!this.ctx || this._voices.size > 85) return;
    const source = this.ctx.createBufferSource();
    source.buffer = this.noise;
    const filter = this.ctx.createBiquadFilter();
    filter.type = filterType;
    filter.Q.value = 0.65;
    filter.frequency.setValueAtTime(frequency, start);
    filter.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), start + duration);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, amplitude), start + Math.min(0.01, duration * 0.1));
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(filter).connect(gain);
    const panNode = this._output(gain, bus, pan);
    this._track(source, [filter, gain, panNode]);
    source.start(start, (start * 0.57) % 0.9);
    source.stop(start + duration + 0.025);
  }

  _midi(note) { return 440 * 2 ** ((note - 69) / 12); }

  _schedule() {
    if (!this.ctx || this.ctx.state !== 'running' || this.disposed || this._hidden || this.suspended) return;
    const now = this.ctx.currentTime;
    const stepLength = 60 / 112 / 4;
    // Never replay a backlog after a backgrounded tab or main-thread stall.
    if (this._nextNote < now - 0.1) this._nextNote = now + 0.025;
    while (this._nextNote < now + 0.13) {
      this._musicStep(this._step, this._nextNote);
      this._step = (this._step + 1) % 64;
      this._nextNote += stepLength;
    }
  }

  _musicStep(step, time) {
    const s = step % 16;
    const bar = Math.floor(step / 16);
    // E minor, C major, A minor, B minor. Syncopated, light on melody.
    const roots = [40, 36, 33, 35];
    const root = roots[bar];
    const bass = { 0: 0, 3: 12, 6: 0, 8: 7, 10: 0, 14: 12 };
    if (Object.prototype.hasOwnProperty.call(bass, s)) {
      const f = this._midi(root + bass[s]);
      this._tone(f, f, time, s === 0 ? 0.27 : 0.16, 0.14, 'triangle', 'music', 0, 620);
      if (this.active) this._tone(f / 2, f / 2, time, 0.18, 0.045, 'sine', 'music');
    }
    if (s === 0 || s === 8 || (this.active && s === 11)) {
      this._tone(128, 38, time, 0.2, this.active ? 0.36 : 0.18, 'sine', 'music');
      this._noise(time, 0.018, 0.025, 1300, 'lowpass', 'music');
    }
    if (s === 4 || s === 12) {
      this._noise(time, 0.11, this.active ? 0.12 : 0.045, 1400, 'highpass', 'music', -0.09);
      this._tone(182, 135, time, 0.08, 0.065, 'triangle', 'music');
      if (this.active) this._noise(time + 0.018, 0.055, 0.045, 2100, 'bandpass', 'music', 0.12);
    }
    if (s % 2 === 0 || (this.active && (s === 7 || s === 15))) {
      this._noise(time + (s % 4 === 2 ? 0.012 : 0), s === 14 ? 0.12 : 0.035, s % 4 === 0 ? 0.035 : 0.022, 5500, 'highpass', 'music', s % 4 === 0 ? -0.2 : 0.2);
    }
    if (s === 2 || s === 10) {
      const chord = bar === 1 ? [12, 16, 19] : [12, 15, 19];
      for (const interval of chord) {
        const f = this._midi(root + interval + 12);
        this._tone(f, f, time, 0.22, 0.025, 'triangle', 'music', bar % 2 ? 0.16 : -0.16, 1500);
      }
    }
    if (this.active && ((bar === 1 && s === 15) || (bar === 3 && (s === 13 || s === 15)))) {
      const f = this._midi(s === 13 ? 76 : 74);
      this._tone(f, f, time, 0.16, 0.024, 'sine', 'music', 0.24);
    }
  }

  play(type, { force = 1, pan = 0 } = {}) {
    if (!this.ctx || this.ctx.state !== 'running' || this.muted || this.disposed || this.suspended || this._hidden) return;
    const time = this.ctx.currentTime + 0.002;
    const cooldown = { collision: 0.065, click: 0.04, boost: 0.08, driftboost: 0.1, eliminate: 0.12, pickup: 0.09 }[type] || 0;
    if (time - (this._cooldowns.get(type) ?? -100) < cooldown) return;
    this._cooldowns.set(type, time);
    const power = Math.min(1.5, Math.max(0.25, Number.isFinite(force) ? force : 1));
    const tone = (a, b, offset, duration, gain, wave = 'sine', cutoff = 0) => this._tone(a, b, time + offset, duration, gain, wave, 'sfx', pan, cutoff);
    const noise = (offset, duration, gain, frequency, filter = 'bandpass', end = frequency) => this._noise(time + offset, duration, gain, frequency, filter, 'sfx', pan, end);
    switch (type) {
      case 'click':
        tone(600, 360, 0, 0.055, 0.11, 'triangle');
        noise(0, 0.025, 0.025, 1700, 'highpass');
        break;
      case 'countdown':
        tone(440, 440, 0, 0.14, 0.21, 'sine');
        tone(880, 880, 0, 0.08, 0.035, 'sine');
        break;
      case 'go':
        tone(660, 880, 0, 0.26, 0.2, 'triangle');
        tone(1320, 1320, 0.02, 0.18, 0.06, 'sine');
        noise(0, 0.16, 0.12, 1800, 'highpass');
        break;
      case 'boost':
      case 'driftboost':
        noise(0, 0.42, 0.35, 450, 'bandpass', 2200);
        tone(80, type === 'driftboost' ? 250 : 190, 0, 0.32, 0.17, 'sawtooth', 480);
        tone(58, 38, 0, 0.18, 0.25, 'sine');
        break;
      case 'collision':
        tone(110 + power * 25, 38, 0, 0.16, 0.25 * power, 'sine');
        noise(0, 0.12 + power * 0.04, 0.19 * power, 1200, 'bandpass', 400);
        // Short, inharmonic metal resonances: shopping-cart clatter.
        tone(367, 310, 0.005, 0.11, 0.045 * power, 'triangle');
        tone(811, 700, 0.018, 0.065, 0.025 * power, 'sine');
        if (power > 0.8) noise(0.055, 0.065, 0.045 * power, 2400, 'highpass');
        break;
      case 'pickup':
        [659.25, 830.61, 987.77].forEach((f, i) => tone(f, f, i * 0.055, 0.2, 0.105 - i * 0.012, 'sine'));
        break;
      case 'eliminate':
        noise(0, 0.46, 0.25, 1800, 'bandpass', 130);
        tone(230, 42, 0, 0.7, 0.22, 'triangle');
        tone(400, 70, 0.06, 0.45, 0.07, 'sine');
        tone(70, 30, 0.26, 0.34, 0.2, 'sine');
        break;
      case 'win': {
        const notes = [64, 67, 71, 76, 79];
        notes.forEach((note, i) => {
          const f = this._midi(note);
          tone(f, f, i * 0.105, i === 4 ? 0.7 : 0.3, 0.15, 'triangle', 2400);
          tone(f / 2, f / 2, i * 0.105, 0.3, 0.05, 'sine');
        });
        noise(0.42, 0.55, 0.14, 3200, 'highpass');
        break;
      }
      case 'lose':
        [64, 62, 59, 52].forEach((note, i) => {
          const f = this._midi(note);
          tone(f, f * 0.98, i * 0.13, 0.34, 0.13, 'triangle', 1000);
        });
        break;
      case 'chaos':
        [0, 0.16].forEach(offset => {
          tone(330, 440, offset, 0.14, 0.11, 'square', 750);
          tone(82, 65, offset, 0.2, 0.16, 'sine');
        });
        noise(0.3, 0.24, 0.1, 2500, 'highpass');
        break;
      default:
        break;
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    if (this._timer !== null) clearInterval(this._timer);
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this._visibility);
    for (const source of this._voices) {
      try { source.stop(); } catch {}
    }
    this._voices.clear();
    for (const source of [this.wheelSource, this.skidSource]) {
      if (source) { try { source.stop(); source.disconnect(); } catch {} }
    }
    if (this.ctx && this.ctx.state !== 'closed') this.ctx.close().catch(() => {});
  }
}
