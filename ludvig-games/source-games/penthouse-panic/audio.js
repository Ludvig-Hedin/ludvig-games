/* Original procedural soundtrack and game foley. No downloads or autoplay. */
const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0));
const midi = note => 440 * Math.pow(2, (note - 69) / 12);

export class GameAudio {
  constructor() {
    this.enabled = true;
    this.musicEnabled = true;
    this.intensity = 0;
    this.context = null;
    this.master = null;
    this.musicBus = null;
    this.effectsBus = null;
    this._nextStep = 0;
    this._step = 0;
    this._stepDuration = 60 / 114 / 4;
    this._lastPlayed = new Map();
    this._nodes = new Set();
    this._disposed = false;
  }

  async unlock() {
    if (this._disposed) return false;
    try {
      if (!this.context) {
        const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext;
        if (!AudioContext) return false;
        const context = this.context = new AudioContext();
        this.master = context.createGain();
        this.master.gain.value = this.enabled ? 0.3 : 0;
        const compressor = context.createDynamicsCompressor();
        compressor.threshold.value = -14;
        compressor.knee.value = 20;
        compressor.ratio.value = 4;
        compressor.attack.value = 0.003;
        compressor.release.value = 0.18;
        this.musicBus = context.createGain();
        this.musicBus.gain.value = this.musicEnabled ? 0.48 : 0;
        this.effectsBus = context.createGain();
        this.effectsBus.gain.value = 0.8;
        this.musicBus.connect(compressor);
        this.effectsBus.connect(compressor);
        compressor.connect(this.master);
        this.master.connect(context.destination);
        this._compressor = compressor;
        this._noiseBuffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
        const data = this._noiseBuffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        this._nextStep = context.currentTime + 0.08;
      }
      if (this.context.state === 'suspended') await this.context.resume();
      return this.context.state === 'running';
    } catch { return false; }
  }

  setEnabled(value) {
    this.enabled = !!value;
    if (this.master && this.context) {
      this.master.gain.cancelScheduledValues(this.context.currentTime);
      this.master.gain.setTargetAtTime(this.enabled ? 0.3 : 0, this.context.currentTime, 0.025);
    }
  }

  setMusic(value) {
    this.musicEnabled = !!value;
    if (this.musicBus && this.context) {
      this.musicBus.gain.cancelScheduledValues(this.context.currentTime);
      this.musicBus.gain.setTargetAtTime(this.musicEnabled ? 0.48 : 0, this.context.currentTime, 0.08);
      if (this.musicEnabled) this._nextStep = Math.max(this._nextStep, this.context.currentTime + 0.02);
    }
  }

  setIntensity(value) { this.intensity = clamp(value, 0, 1); }

  _track(source, nodes) {
    this._nodes.add(source);
    source.onended = () => {
      this._nodes.delete(source);
      for (const node of nodes) { try { node.disconnect(); } catch {} }
    };
  }

  _tone(frequency, duration, gain = 0.2, type = 'sine', when = this.context.currentTime, endFrequency = null, bus = this.effectsBus, attack = 0.006) {
    const c = this.context;
    if (!c || !bus || this._disposed) return;
    const source = c.createOscillator();
    const envelope = c.createGain();
    source.type = type;
    source.frequency.setValueAtTime(Math.max(20, frequency), when);
    if (endFrequency !== null) source.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), when + duration);
    envelope.gain.setValueAtTime(0.0001, when);
    envelope.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), when + Math.min(attack, duration * 0.2));
    envelope.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    source.connect(envelope);
    envelope.connect(bus);
    this._track(source, [source, envelope]);
    source.start(when);
    source.stop(when + duration + 0.015);
  }

  _noise(duration, gain, frequency, type = 'bandpass', when = this.context.currentTime, bus = this.effectsBus, endFrequency = null) {
    const c = this.context;
    if (!c || !bus || this._disposed) return;
    const source = c.createBufferSource();
    const filter = c.createBiquadFilter();
    const envelope = c.createGain();
    source.buffer = this._noiseBuffer;
    filter.type = type;
    filter.frequency.setValueAtTime(frequency, when);
    if (endFrequency !== null) filter.frequency.exponentialRampToValueAtTime(Math.max(30, endFrequency), when + duration);
    filter.Q.value = 0.7;
    envelope.gain.setValueAtTime(0.0001, when);
    envelope.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), when + Math.min(0.008, duration * 0.2));
    envelope.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(bus);
    this._track(source, [source, filter, envelope]);
    source.start(when, Math.random() * 0.3);
    source.stop(when + duration + 0.015);
  }

  _bell(note, time, volume = 0.15, duration = 0.35, bus = this.effectsBus) {
    this._tone(midi(note), duration, volume, 'sine', time, null, bus);
    this._tone(midi(note) * 2, duration * 0.4, volume * 0.24, 'sine', time, null, bus);
    this._tone(midi(note) * 3, duration * 0.15, volume * 0.09, 'sine', time, null, bus);
  }

  play(name, power = 1) {
    if (!this.context || this.context.state !== 'running' || !this.enabled || this._disposed) return;
    const aliases = { grab: 'pickup', pick: 'pickup', hit: 'collision', impact: 'collision', break: 'glass', delivery: 'score', success: 'win', fail: 'lose', ui: 'click', tick: 'countdown' };
    name = aliases[name] || name;
    const t = this.context.currentTime;
    const gap = name === 'collision' ? 0.055 : name === 'glass' ? 0.08 : name === 'score' ? 0.055 : 0.025;
    if (t - (this._lastPlayed.get(name) ?? -Infinity) < gap) return;
    this._lastPlayed.set(name, t);
    const p = clamp(power, 0.12, 2);
    switch (name) {
      case 'collision':
        this._tone(95 + Math.random() * 35, 0.12, 0.16 * p, 'sine', t, 45);
        this._noise(0.07, 0.13 * p, 900, 'lowpass', t);
        break;
      case 'pickup':
        this._tone(190, 0.13, 0.18, 'triangle', t, 360);
        this._bell(76, t + 0.035, 0.12, 0.14);
        break;
      case 'throw':
        this._noise(0.22, 0.3 * p, 850, 'bandpass', t, 3200);
        this._tone(240, 0.16, 0.09 * p, 'triangle', t, 95);
        break;
      case 'dash':
        this._noise(0.2, 0.22, 3000, 'bandpass', t, 300);
        this._tone(125, 0.1, 0.13, 'sine', t, 55);
        break;
      case 'jump':
        this._tone(190, 0.15, 0.12, 'sine', t, 420);
        this._noise(0.07, 0.05, 1500, 'bandpass', t);
        break;
      case 'glass':
        this._noise(0.4, 0.17 * p, 3600, 'highpass', t);
        [2100, 2890, 3710, 4700].forEach((frequency, index) => this._tone(frequency, 0.13 + index * 0.032, 0.036 * p, 'sine', t + index * 0.022, frequency * 0.87));
        break;
      case 'score':
        [72, 76, 79].forEach((note, i) => this._bell(note, t + i * 0.055, 0.15, 0.38));
        this._tone(110, 0.16, 0.15, 'sine', t, 72);
        break;
      case 'combo':
        [76, 79, 83, 88].forEach((note, i) => this._bell(note, t + i * 0.05, 0.13, 0.45));
        break;
      case 'fall':
        this._tone(450, 0.5, 0.14, 'triangle', t, 65);
        this._noise(0.4, 0.08, 1600, 'bandpass', t, 200);
        break;
      case 'win':
        [72, 76, 79, 84].forEach((note, i) => this._bell(note, t + i * 0.105, 0.21, 0.7));
        [60, 64, 67].forEach(note => this._tone(midi(note), 0.9, 0.09, 'triangle', t + 0.33));
        break;
      case 'lose':
        [69, 65, 60].forEach((note, i) => this._bell(note, t + i * 0.14, 0.14, 0.5));
        break;
      case 'countdown':
        this._tone(800, 0.09, 0.13, 'sine', t, 600);
        this._tone(1600, 0.04, 0.04, 'sine', t);
        break;
      case 'click':
        this._tone(540, 0.045, 0.08, 'sine', t, 330);
        break;
    }
  }

  _musicStep(step, time) {
    const sixteenth = step % 16;
    const bar = Math.floor(step / 16);
    const chords = [
      { bass: 36, notes: [60, 64, 67, 71] },
      { bass: 33, notes: [57, 60, 64, 67] },
      { bass: 29, notes: [57, 60, 64, 69] },
      { bass: 31, notes: [59, 62, 65, 69] }
    ];
    const chord = chords[Math.floor(bar / 2) % chords.length];
    const bus = this.musicBus;
    const energy = this.intensity;
    // Soft kick, side-stick and brushed hats: a light breakbeat under gameplay.
    if (sixteenth === 0 || sixteenth === 8 || (energy > 0.6 && sixteenth === 11)) {
      this._tone(125, 0.18, 0.36, 'sine', time, 43, bus);
      this._noise(0.018, 0.035, 1000, 'lowpass', time, bus);
    }
    if (sixteenth === 4 || sixteenth === 12) {
      this._noise(0.11, 0.15, 1800, 'bandpass', time, bus);
      this._tone(195, 0.075, 0.13, 'triangle', time, 130, bus);
    }
    if (sixteenth % 2 === 0 || (energy > 0.8 && sixteenth === 15)) {
      const accent = sixteenth % 4 === 2 ? 1 : 0.65;
      this._noise(0.045, 0.064 * accent, 6500, 'highpass', time, bus);
    }
    const bassSteps = [0, 3, 6, 8, 11, 14];
    const bassIndex = bassSteps.indexOf(sixteenth);
    if (bassIndex >= 0) {
      const offset = bassIndex === 2 ? 7 : bassIndex === 5 ? 12 : 0;
      this._tone(midi(chord.bass + offset), 0.23, 0.2, 'triangle', time, null, bus, 0.012);
      this._tone(midi(chord.bass + offset), 0.27, 0.13, 'sine', time, null, bus, 0.012);
    }
    if (sixteenth === 2 || sixteenth === 10) {
      for (let i = 0; i < chord.notes.length; i++) {
        this._bell(chord.notes[i], time + i * 0.007, 0.036, 0.7, bus);
      }
    }
    if ((bar % 4 === 1 || bar % 4 === 3) && [1, 7, 13].includes(sixteenth)) {
      const index = (Math.floor(step / 2) + bar) % 4;
      this._bell(chord.notes[index] + 12, time, 0.045, 0.22, bus);
    }
  }

  update() {
    if (!this.context || this.context.state !== 'running' || this._disposed) return;
    const now = this.context.currentTime;
    // Resume without dumping all missed beats after a backgrounded tab.
    if (this._nextStep < now - 0.1) this._nextStep = now + 0.035;
    if (!this.enabled || !this.musicEnabled) {
      this._nextStep = now + 0.04;
      return;
    }
    let scheduled = 0;
    while (this._nextStep < now + 0.12 && scheduled++ < 8) {
      this._musicStep(this._step++, this._nextStep);
      this._nextStep += this._stepDuration;
    }
  }

  dispose() {
    this._disposed = true;
    for (const node of this._nodes) { try { node.stop(); node.disconnect(); } catch {} }
    this._nodes.clear();
    this._lastPlayed.clear();
    try { this.musicBus?.disconnect(); this.effectsBus?.disconnect(); this.master?.disconnect(); this._compressor?.disconnect(); } catch {}
    if (this.context && this.context.state !== 'closed') this.context.close().catch(() => {});
    this.context = this.master = this.musicBus = this.effectsBus = null;
  }
}
