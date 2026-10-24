// Small procedural sound bank: no downloads, and silent until a user gesture.
export class GameAudio {
  constructor() {
    this.enabled = true;
    this.ctx = null;
    this.lastEventId = -1;
    this.volume = .66;
    this.ambience = null;
  }

  async unlock() {
    if (!this.ctx) {
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!Context) return;
      this.ctx = new Context();
      this.master = this.ctx.createGain(); this.master.gain.value = this.enabled ? this.volume : 0;
      this.master.connect(this.ctx.destination);
      const length = Math.floor(this.ctx.sampleRate * .7);
      this.noiseBuffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      let random = 91257;
      for (let i = 0; i < length; i++) { random = (Math.imul(random, 1664525) + 1013904223) >>> 0; data[i] = random / 2147483648 - 1; }
      // Very quiet filtered indoor air, below the impact sounds by ~40 dB.
      const noise = this.ctx.createBufferSource(); noise.buffer = this.noiseBuffer; noise.loop = true;
      const filter = this.ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 360;
      const gain = this.ctx.createGain(); gain.gain.value = .006;
      noise.connect(filter); filter.connect(gain); gain.connect(this.master); noise.start(); this.ambience = noise;
    }
    if (this.ctx.state === 'suspended') await this.ctx.resume();
  }

  setEnabled(enabled) {
    this.enabled = !!enabled;
    if (this.master) this.master.gain.setTargetAtTime(this.enabled ? this.volume : 0, this.ctx.currentTime, .025);
  }

  setVolume(volume) {
    this.volume = Math.max(0, Math.min(1, volume));
    if (this.master) this.master.gain.setTargetAtTime(this.enabled ? this.volume : 0, this.ctx.currentTime, .025);
  }

  tone(frequency, duration, volume, type = 'sine', delay = 0, endFrequency = frequency) {
    if (!this.ctx || !this.enabled) return;
    const now = this.ctx.currentTime + delay;
    const oscillator = this.ctx.createOscillator(), gain = this.ctx.createGain();
    oscillator.type = type; oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), now + duration);
    gain.gain.setValueAtTime(.0001, now); gain.gain.exponentialRampToValueAtTime(Math.max(.0002, volume), now + .0025);
    gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
    oscillator.connect(gain); gain.connect(this.master); oscillator.start(now); oscillator.stop(now + duration + .015);
  }

  noise(duration, volume, frequency, q = .7) {
    if (!this.ctx || !this.enabled) return;
    const now = this.ctx.currentTime;
    const source = this.ctx.createBufferSource(); source.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter(); filter.type = 'bandpass'; filter.frequency.value = frequency; filter.Q.value = q;
    const gain = this.ctx.createGain(); gain.gain.setValueAtTime(volume, now); gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
    source.connect(filter); filter.connect(gain); gain.connect(this.master); source.start(now); source.stop(now + duration + .01);
  }

  event(event) {
    if (!event || !this.ctx || !this.enabled) return;
    const speed = Math.min(12, Math.max(.5, event.speed || 4));
    const strength = .45 + speed / 15;
    switch (event.type) {
      case 'paddle':
      case 'hit':
        this.tone(620 + speed * 27, .047, .20 * strength, 'sine', 0, 250);
        this.tone(1360 + speed * 19, .021, .075 * strength, 'triangle', 0, 900);
        this.noise(.026, .18 * strength, 3600, 1.1);
        break;
      case 'table':
      case 'bounce':
        this.tone(1100 + speed * 31, .035, .13 * strength, 'sine', 0, 760);
        this.tone(2200, .014, .032 * strength, 'triangle');
        this.noise(.015, .07 * strength, 5100, 1.5);
        break;
      case 'net':
        this.noise(.12, .10 * strength, 1300, .4);
        this.tone(180, .06, .025, 'triangle', 0, 100);
        break;
      case 'floor':
        this.tone(270 + speed * 14, .055, .075 * strength, 'sine', 0, 140);
        this.noise(.03, .045, 1700, .5);
        break;
      case 'point':
        this.tone(523.25, .17, .042, 'sine', .04);
        this.tone(659.25, .22, .033, 'sine', .10);
        break;
      case 'game':
      case 'gameover':
        [523.25, 659.25, 783.99].forEach((note, i) => this.tone(note, .26, .045, 'sine', i * .09));
        break;
      case 'match':
      case 'matchover':
      case 'victory':
        [523.25, 659.25, 783.99, 1046.5].forEach((note, i) => this.tone(note, .45, .055, 'sine', i * .13));
        break;
      case 'serve':
        this.tone(700, .025, .035, 'sine');
        break;
      default: break;
    }
  }

  dispose() {
    try { this.ambience?.stop(); this.ctx?.close(); } catch { /* Already closed. */ }
    this.ctx = null;
  }
}
