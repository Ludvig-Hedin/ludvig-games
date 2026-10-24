// Original procedural audio: impact resonances, filtered noise and a sequenced arcade groove.
export class ArcadeAudio {
  constructor(settings = {}) {
    this.settings = settings; this.ctx = null; this.step = 0; this.nextBeat = 0; this.musicTimer = null; this.active = false; this.lastImpact = {};
  }
  async unlock() {
    try {
      if (!this.ctx) {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.master = this.ctx.createGain(); this.master.gain.value = 0.72;
        this.compressor = this.ctx.createDynamicsCompressor();
        this.compressor.threshold.value = -16; this.compressor.ratio.value = 4;
        this.master.connect(this.compressor); this.compressor.connect(this.ctx.destination);
        this.fx = this.ctx.createGain(); this.music = this.ctx.createGain(); this.fx.connect(this.master); this.music.connect(this.master);
        const size = this.ctx.sampleRate;
        this.noise = this.ctx.createBuffer(1, size, this.ctx.sampleRate);
        const data = this.noise.getChannelData(0); for (let i = 0; i < size; i++) data[i] = Math.random() * 2 - 1;
        this.apply(this.settings);
      }
      if (this.ctx.state === 'suspended') await this.ctx.resume();
    } catch { /* The game is playable when a browser disables audio. */ }
  }
  apply(settings) {
    this.settings = settings;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.fx.gain.setTargetAtTime(settings.muted ? 0 : settings.effects ?? 0.8, t, 0.03);
    this.music.gain.setTargetAtTime(settings.muted || !settings.musicOn ? 0 : settings.music ?? 0.28, t, 0.05);
    if (settings.musicOn && this.active) this.startMusic();
    if (!settings.musicOn) this.stopMusic();
  }
  tone(freq, duration, volume, type = 'sine', when = 0, endFreq = null, bus = this.fx) {
    if (!this.ctx || !bus) return;
    const t = this.ctx.currentTime + when;
    const osc = this.ctx.createOscillator(), gain = this.ctx.createGain();
    osc.type = type; osc.frequency.setValueAtTime(freq, t);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t + duration);
    gain.gain.setValueAtTime(0, t); gain.gain.linearRampToValueAtTime(volume, t + 0.006); gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(gain); gain.connect(bus); osc.start(t); osc.stop(t + duration + 0.02);
    osc.onended = () => { osc.disconnect(); gain.disconnect(); };
  }
  hiss(duration, volume, frequency, type = 'lowpass', when = 0, bus = this.fx) {
    if (!this.ctx || !bus) return;
    const t = this.ctx.currentTime + when, source = this.ctx.createBufferSource(), filter = this.ctx.createBiquadFilter(), gain = this.ctx.createGain();
    source.buffer = this.noise; filter.type = type; filter.frequency.value = frequency; filter.Q.value = 0.7;
    gain.gain.setValueAtTime(0, t); gain.gain.linearRampToValueAtTime(volume, t + Math.min(0.015, duration / 5)); gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    source.connect(filter); filter.connect(gain); gain.connect(bus); source.start(t, Math.random() * 0.4); source.stop(t + duration);
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
  }
  play(event, strength = 1, combo = 1) {
    if (!this.ctx || this.settings.muted) return;
    const s = Math.min(1, Math.max(0.08, strength / (event === 'rim' || event === 'floor' || event === 'board' ? 7 : 1)));
    if (['rim', 'board', 'floor'].includes(event)) {
      if (this.ctx.currentTime - (this.lastImpact[event] || -1) < 0.05) return;
      this.lastImpact[event] = this.ctx.currentTime;
    }
    const v = 0.94 + Math.random() * 0.12;
    switch (event) {
      case 'pickup': this.hiss(0.07, 0.05, 1500); this.tone(140, 0.08, 0.05, 'sine', 0, 90); break;
      case 'release': this.hiss(0.15, 0.1, 2100, 'bandpass'); break;
      case 'floor': this.tone(130 * v, 0.18, 0.26 * s, 'sine', 0, 55); this.tone(260 * v, 0.09, 0.045 * s); this.hiss(0.032, 0.2 * s, 1900); break;
      case 'rim': this.tone(560 * v, 0.22, 0.16 * s, 'sine', 0, 390); this.tone(1340 * v, 0.13, 0.075 * s); this.tone(2450 * v, 0.09, 0.04 * s); this.hiss(0.025, 0.12 * s, 3500); break;
      case 'board': this.tone(185 * v, 0.18, 0.22 * s, 'sine', 0, 100); this.tone(720 * v, 0.08, 0.07 * s); this.hiss(0.05, 0.16 * s, 2600); break;
      case 'net': this.hiss(0.26, 0.3, 4200, 'bandpass'); this.hiss(0.18, 0.12, 7600, 'highpass', 0.06); break;
      case 'score': {
        const pitch = 1 + Math.min(combo - 1, 5) * 0.075;
        this.tone(660 * pitch, 0.18, 0.13, 'sine'); this.tone(990 * pitch, 0.24, 0.13, 'sine', 0.07); this.tone(1320 * pitch, 0.28, 0.075, 'sine', 0.13); break;
      }
      case 'tick': this.tone(720, 0.065, 0.1, 'sine'); break;
      case 'countdown': this.tone(440, 0.12, 0.18, 'sine'); this.tone(880, 0.12, 0.05, 'sine'); break;
      case 'go': this.tone(660, 0.16, 0.17, 'sine'); this.tone(1320, 0.3, 0.15, 'sine', 0.07); break;
      case 'buzzer': this.tone(180, 0.55, 0.08, 'sawtooth'); this.tone(187, 0.55, 0.06, 'sawtooth'); break;
      case 'win': [523, 659, 784, 1047].forEach((n, i) => this.tone(n, 0.55, 0.16, 'triangle', i * 0.12)); this.hiss(0.5, 0.09, 5000, 'highpass', 0.3); break;
      case 'lose': [392, 349, 294].forEach((n, i) => this.tone(n, 0.35, 0.12, 'triangle', i * 0.18)); break;
      case 'click': this.tone(580, 0.035, 0.06, 'sine', 0, 750); break;
    }
  }
  setActive(value) { this.active = value; if (value && this.settings.musicOn) this.startMusic(); else this.stopMusic(); }
  startMusic() {
    if (!this.ctx || this.musicTimer) return;
    this.nextBeat = this.ctx.currentTime + 0.05;
    const notes = [110, 110, 130.81, 110, 146.83, 130.81, 98, 110];
    this.musicTimer = setInterval(() => {
      if (!this.ctx || this.ctx.state !== 'running') return;
      while (this.nextBeat < this.ctx.currentTime + 0.15) {
        const wait = Math.max(0, this.nextBeat - this.ctx.currentTime), step = this.step % 32;
        if (step % 4 === 0) this.tone(140, 0.17, 0.43, 'sine', wait, 42, this.music);
        if (step % 8 === 4) { this.hiss(0.12, 0.21, 2300, 'highpass', wait, this.music); this.tone(175, 0.08, 0.1, 'sine', wait, 110, this.music); }
        this.hiss(step % 4 === 2 ? 0.08 : 0.035, step % 2 ? 0.025 : 0.065, 7200, 'highpass', wait, this.music);
        if (step % 2 === 0) this.tone(notes[Math.floor(step / 4)] / 2, 0.16, 0.16, 'triangle', wait, null, this.music);
        if ([3, 10, 14, 19, 26, 30].includes(step)) this.tone(notes[Math.floor(step / 4)] * 4, 0.2, 0.045, 'sine', wait, null, this.music);
        this.step++; this.nextBeat += 60 / 112 / 4;
      }
    }, 50);
  }
  stopMusic() { if (this.musicTimer) clearInterval(this.musicTimer); this.musicTimer = null; }
  dispose() { this.stopMusic(); this.ctx?.close().catch(() => {}); this.ctx = null; }
}
