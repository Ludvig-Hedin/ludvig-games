/** Small, self-contained synth soundtrack. Audio begins only after a user gesture. */
export class AudioEngine {
  constructor() {
    this.context = null;
    this.muted = false;
    this.musicEnabled = true;
    this.active = false;
    this.step = 0;
    this.nextBeat = 0;
    this.interval = null;
    this.lastCoin = 0;
  }

  async start() {
    try {
      if (!this.context) {
        const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext;
        if (!AudioContext) return false;
        this.context = new AudioContext();
        const c = this.context;
        this.master = c.createGain();
        this.master.gain.value = this.muted ? 0 : 0.55;
        const compressor = c.createDynamicsCompressor();
        compressor.threshold.value = -16;
        compressor.knee.value = 15;
        compressor.ratio.value = 4;
        compressor.attack.value = 0.006;
        compressor.release.value = 0.18;
        this.master.connect(compressor);
        compressor.connect(c.destination);
        this.musicGain = c.createGain();
        this.musicGain.gain.value = this.musicEnabled ? 0.27 : 0;
        this.musicGain.connect(this.master);
        this.fxGain = c.createGain();
        this.fxGain.gain.value = 0.65;
        this.fxGain.connect(this.master);
        this.noiseBuffer = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
        const samples = this.noiseBuffer.getChannelData(0);
        let brown = 0;
        for (let i = 0; i < samples.length; i++) {
          brown = (brown + (Math.random() * 2 - 1) * 0.018) / 1.018;
          samples[i] = brown * 3.5;
        }
        this.wind = c.createBufferSource();
        this.wind.buffer = this.noiseBuffer;
        this.wind.loop = true;
        this.windFilter = c.createBiquadFilter();
        this.windFilter.type = 'lowpass';
        this.windFilter.frequency.value = 400;
        this.windGain = c.createGain();
        this.windGain.gain.value = 0;
        this.wind.connect(this.windFilter);
        this.windFilter.connect(this.windGain);
        this.windGain.connect(this.master);
        this.wind.start();
        this.wheel = c.createOscillator();
        this.wheel.type = 'triangle';
        this.wheel.frequency.value = 42;
        this.wheelGain = c.createGain();
        this.wheelGain.gain.value = 0;
        this.wheel.connect(this.wheelGain);
        this.wheelGain.connect(this.master);
        this.wheel.start();
      }
      if (this.context.state === 'suspended') await this.context.resume();
      this.active = true;
      if (!this.interval) {
        this.nextBeat = this.context.currentTime + 0.05;
        this.interval = setInterval(() => this.scheduleMusic(), 40);
      }
      return true;
    } catch {
      return false;
    }
  }

  setMuted(value) {
    this.muted = Boolean(value);
    if (this.context && this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.55, this.context.currentTime, 0.04);
  }

  setMusic(value) {
    this.musicEnabled = Boolean(value);
    if (this.context && this.musicGain) this.musicGain.gain.setTargetAtTime(this.musicEnabled ? 0.27 : 0, this.context.currentTime, 0.1);
  }

  update({speed = 0, boosting = false, airborne = false} = {}, dt = 0) {
    if (!this.context || !this.active) return;
    const c = this.context;
    const intensity = Math.max(0, Math.min(1.4, speed / 45));
    this.windGain.gain.setTargetAtTime(intensity * 0.16 + (boosting ? 0.045 : 0), c.currentTime, 0.12);
    this.windFilter.frequency.setTargetAtTime(300 + intensity * 1800 + (boosting ? 500 : 0), c.currentTime, 0.1);
    this.wheelGain.gain.setTargetAtTime(airborne ? 0 : intensity * 0.014, c.currentTime, 0.05);
    this.wheel.frequency.setTargetAtTime(35 + speed * 2.4, c.currentTime, 0.08);
  }

  tone(frequency, duration, volume = 0.15, type = 'sine', when = null, destination = null, endFrequency = null) {
    if (!this.context) return;
    const c = this.context;
    const t = when ?? c.currentTime;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, frequency), t);
    if (endFrequency) osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), t + duration);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), t + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(gain);
    gain.connect(destination || this.fxGain);
    osc.start(t);
    osc.stop(t + duration + 0.03);
    osc.onended = () => { osc.disconnect(); gain.disconnect(); };
  }

  noise(duration, volume = 0.1, frequency = 1000, when = null, destination = null) {
    if (!this.context) return;
    const c = this.context;
    const t = when ?? c.currentTime;
    const source = c.createBufferSource();
    source.buffer = this.noiseBuffer;
    const filter = c.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = frequency;
    const gain = c.createGain();
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(destination || this.fxGain);
    source.start(t);
    source.stop(t + duration + 0.01);
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
  }

  play(type, intensity = 1) {
    if (!this.context || this.context.state !== 'running') return;
    const c = this.context;
    const now = c.currentTime;
    const v = Math.max(0.2, Math.min(2, intensity));
    switch (type) {
      case 'coin':
        if (now - this.lastCoin < 0.035) return;
        this.lastCoin = now;
        this.tone(1046.5, 0.13, 0.11, 'sine');
        this.tone(1568, 0.19, 0.07, 'sine', now + 0.045);
        break;
      case 'boost':
        this.tone(160, 0.42, 0.09, 'triangle', now, null, 800);
        this.noise(0.42, 0.23, 800);
        break;
      case 'jump':
        this.tone(220, 0.17, 0.11, 'sine', now, null, 550);
        this.noise(0.14, 0.1, 1000);
        break;
      case 'land':
        this.tone(115, 0.17, 0.16 * v, 'sine', now, null, 35);
        this.noise(0.11, 0.19 * v, 250);
        break;
      case 'hit':
        this.tone(110, 0.35, 0.23, 'triangle', now, null, 32);
        this.noise(0.28, 0.46, 170);
        this.tone(230, 0.1, 0.07, 'square', now + 0.03, null, 95);
        break;
      case 'trick':
        [523.25, 659.25, 783.99, 1046.5].forEach((n, i) => this.tone(n, 0.27, 0.095, 'triangle', now + i * 0.055));
        break;
      case 'near':
        this.noise(0.18, 0.27, 1300);
        this.tone(900, 0.13, 0.045, 'sine', now, null, 450);
        break;
      case 'finish':
        [392, 523.25, 659.25, 783.99, 1046.5].forEach((n, i) => this.tone(n, 0.5, 0.11, 'triangle', now + i * 0.1));
        break;
      case 'countdown':
        this.tone(440, 0.12, 0.13, 'sine');
        break;
      case 'go':
        this.tone(880, 0.3, 0.16, 'triangle');
        this.tone(1320, 0.33, 0.07, 'sine');
        break;
      case 'ui':
      default:
        this.tone(650, 0.06, 0.055, 'sine');
    }
  }

  scheduleMusic() {
    if (!this.context || !this.active || this.context.state !== 'running') return;
    const c = this.context;
    // Sixteenths at 112 BPM. Keep scheduling bounded after tab suspension.
    if (this.nextBeat < c.currentTime - 0.25) this.nextBeat = c.currentTime + 0.02;
    let scheduled = 0;
    while (this.nextBeat < c.currentTime + 0.13 && scheduled++ < 8) {
      const t = this.nextBeat;
      const step = this.step % 64;
      if (this.musicEnabled && !this.muted) {
        if (step % 4 === 0) this.tone(130, 0.19, 0.53, 'sine', t, this.musicGain, 41);
        if (step % 8 === 4) {
          this.noise(0.1, 0.3, 800, t, this.musicGain);
          this.tone(175, 0.08, 0.09, 'triangle', t, this.musicGain);
        }
        if (step % 2 === 0) this.noise(0.035, step % 4 === 2 ? 0.19 : 0.10, 6000, t, this.musicGain);
        const roots = [55, 65.406, 43.654, 49];
        const root = roots[Math.floor(step / 16)];
        if ([0, 3, 6, 8, 11, 14].includes(step % 16)) {
          this.tone(root * ((step % 16) === 11 ? 2 : 1), 0.17, 0.25, 'triangle', t, this.musicGain);
        }
        if (step % 2 === 1) {
          const scale = [4, 6, 8, 12, 8, 6, 4, 6];
          const n = root * scale[Math.floor(step / 2) % scale.length];
          this.tone(n, 0.22, 0.06, 'sine', t, this.musicGain);
          this.tone(n * 2, 0.18, 0.012, 'triangle', t + 0.018, this.musicGain);
        }
      }
      this.step++;
      this.nextBeat += 60 / 112 / 4;
    }
  }

  stop() {
    this.active = false;
    if (this.interval) { clearInterval(this.interval); this.interval = null; }
    if (this.context) {
      this.windGain.gain.setTargetAtTime(0, this.context.currentTime, 0.08);
      this.wheelGain.gain.setTargetAtTime(0, this.context.currentTime, 0.08);
    }
  }

  dispose() {
    this.stop();
    if (this.context) this.context.close().catch(() => {});
    this.context = null;
  }
}
