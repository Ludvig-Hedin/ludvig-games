export type AudioCue = 'select' | 'tick' | 'reveal' | 'impact' | 'win' | 'lose' | 'tie' | 'victory';

/** Original synthesized audio. Starts only after a user gesture. */
export class GameAudio {
  private context: AudioContext | null = null;
  private effects: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private enabled = true;
  private music = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private nextBeat = 0;
  private step = 0;
  private disposed = false;

  async unlock() {
    if (this.disposed || typeof window === 'undefined') return;
    try {
      if (!this.context) {
        const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioContextClass) return;
        const context = this.context = new AudioContextClass();
        const limiter = context.createDynamicsCompressor();
        limiter.threshold.value = -12;
        limiter.knee.value = 12;
        limiter.ratio.value = 8;
        limiter.attack.value = 0.003;
        limiter.release.value = 0.15;
        const master = context.createGain();
        master.gain.value = 0.65;
        this.effects = context.createGain();
        this.effects.gain.value = this.enabled ? 0.65 : 0;
        this.musicBus = context.createGain();
        this.musicBus.gain.value = this.music ? 0.13 : 0;
        this.effects.connect(limiter);
        this.musicBus.connect(limiter);
        limiter.connect(master);
        master.connect(context.destination);
      }
      if (this.context.state === 'suspended') await this.context.resume();
      this.syncMusic();
    } catch {
      // Audio failure must never prevent a turn or block the game.
    }
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (this.context && this.effects) {
      this.effects.gain.setTargetAtTime(enabled ? 0.65 : 0, this.context.currentTime, 0.025);
    }
  }

  setMusic(enabled: boolean) {
    this.music = enabled;
    if (this.context && this.musicBus) {
      this.musicBus.gain.setTargetAtTime(enabled ? 0.13 : 0, this.context.currentTime, 0.15);
    }
    this.syncMusic();
  }

  private tone(frequency: number, at: number, duration: number, volume: number, type: OscillatorType = 'sine', destination = this.effects, endFrequency?: number) {
    if (!this.context || !destination || this.context.state === 'closed') return;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, at);
    if (endFrequency) oscillator.frequency.exponentialRampToValueAtTime(endFrequency, at + duration);
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(volume, at + Math.min(0.012, duration * 0.1));
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    oscillator.connect(gain);
    gain.connect(destination);
    oscillator.start(at);
    oscillator.stop(at + duration + 0.02);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  }

  private noise(at: number, duration: number, volume: number, cutoff: number) {
    if (!this.context || !this.effects) return;
    const buffer = this.context.createBuffer(1, Math.ceil(this.context.sampleRate * duration), this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / data.length * 7);
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    const filter = this.context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const gain = this.context.createGain();
    gain.gain.value = volume;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.effects);
    source.start(at);
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
  }

  play(cue: AudioCue) {
    if (!this.enabled || !this.context || this.context.state !== 'running') return;
    const at = this.context.currentTime + 0.005;
    if (cue === 'select') {
      this.tone(720, at, 0.08, 0.14, 'sine', this.effects, 960);
      this.tone(240, at, 0.055, 0.09, 'triangle');
    } else if (cue === 'tick') {
      this.tone(350, at, 0.09, 0.2, 'triangle', this.effects, 240);
      this.noise(at, 0.035, 0.06, 1600);
    } else if (cue === 'reveal' || cue === 'impact') {
      this.tone(160, at, 0.23, 0.5, 'sine', this.effects, 42);
      this.tone(580, at, 0.08, 0.11, 'triangle', this.effects, 180);
      this.noise(at, 0.19, 0.32, 2200);
    } else if (cue === 'win') {
      [523.25, 659.25, 783.99].forEach((hz, i) => this.tone(hz, at + i * 0.085, 0.28, 0.14, 'triangle'));
      this.tone(130.81, at, 0.3, 0.2);
    } else if (cue === 'lose') {
      this.tone(329.63, at, 0.18, 0.12, 'triangle');
      this.tone(261.63, at + 0.1, 0.27, 0.11, 'triangle');
      this.tone(98, at, 0.22, 0.15);
    } else if (cue === 'tie') {
      this.tone(392, at, 0.11, 0.12, 'triangle');
      this.tone(392, at + 0.12, 0.13, 0.1, 'triangle');
    } else if (cue === 'victory') {
      [261.63, 329.63, 392, 523.25, 659.25, 783.99, 1046.5].forEach((hz, i) => {
        this.tone(hz, at + i * 0.065, 0.5, 0.12, 'triangle');
      });
      this.tone(65.41, at, 0.7, 0.3);
      this.noise(at + 0.26, 0.35, 0.1, 4800);
    }
  }

  private syncMusic() {
    if (!this.context || !this.music || this.disposed) {
      if (this.timer) clearInterval(this.timer);
      this.timer = null;
      return;
    }
    if (this.timer) return;
    this.nextBeat = this.context.currentTime + 0.08;
    this.step = 0;
    this.timer = setInterval(() => {
      const context = this.context;
      if (!context || context.state !== 'running' || !this.music) return;
      if (document.hidden) {
        this.nextBeat = context.currentTime + 0.15;
        return;
      }
      if (this.nextBeat < context.currentTime) this.nextBeat = context.currentTime + 0.05;
      while (this.nextBeat < context.currentTime + 0.25) {
        // Slow original four-chord bed with a subtle plucked counter-rhythm.
        const roots = [65.406, 55, 43.654, 58.27];
        const root = roots[Math.floor(this.step / 16) % roots.length];
        if (this.step % 4 === 0) this.tone(root, this.nextBeat, 1.25, 0.35, 'sine', this.musicBus);
        const notes = [4, 6, 8, 12, 8, 6, 4, 8];
        if (this.step % 2 === 0) this.tone(root * notes[(this.step / 2) % 8], this.nextBeat, 0.6, 0.15, 'triangle', this.musicBus);
        this.step++;
        this.nextBeat += 0.3;
      }
    }, 100);
  }

  dispose() {
    this.disposed = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.context?.close().catch(() => {});
    this.context = null;
    this.effects = null;
    this.musicBus = null;
  }
}
