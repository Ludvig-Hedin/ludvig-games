import type { GameEvent } from './types';

/** Synthesized, velocity-sensitive sound. No downloads or autoplay. */
export class ArcadeAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private effects: GainNode | null = null;
  private room: GainNode | null = null;
  private sources: AudioScheduledSourceNode[] = [];
  private noise: AudioBuffer | null = null;
  private lastImpact = 0;
  volume = 0.65;
  ambience = 0.28;
  muted = false;

  async unlock() {
    if (!this.ctx) {
      const Audio = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Audio) return;
      this.ctx = new Audio();
      this.master = this.ctx.createGain();
      const limiter = this.ctx.createDynamicsCompressor();
      limiter.threshold.value = -12;
      limiter.knee.value = 12;
      limiter.ratio.value = 5;
      this.master.connect(limiter).connect(this.ctx.destination);
      this.effects = this.ctx.createGain();
      this.effects.connect(this.master);
      this.room = this.ctx.createGain();
      this.room.connect(this.master);
      this.noise = this.ctx.createBuffer(1, this.ctx.sampleRate * 2, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const hiss = this.ctx.createBufferSource();
      hiss.buffer = this.noise; hiss.loop = true;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass'; filter.frequency.value = 2200; filter.Q.value = .7;
      const gain = this.ctx.createGain(); gain.gain.value = .035;
      hiss.connect(filter).connect(gain).connect(this.room); hiss.start(); this.sources.push(hiss);
      // The air bed and two quiet fluorescent resonances make a room, not a soundtrack.
      for (const frequency of [110, 164.81, 220.14]) {
        const oscillator = this.ctx.createOscillator();
        oscillator.type = 'sine'; oscillator.frequency.value = frequency;
        const volume = this.ctx.createGain(); volume.gain.value = .008;
        oscillator.connect(volume).connect(this.room); oscillator.start(); this.sources.push(oscillator);
      }
      this.apply();
    }
    if (this.ctx.state === 'suspended') await this.ctx.resume().catch(() => {});
  }

  configure(volume: number, ambience: number, muted: boolean) {
    this.volume = volume; this.ambience = ambience; this.muted = muted; this.apply();
  }
  private apply() {
    if (!this.ctx || !this.master || !this.room) return;
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, .03);
    this.room.gain.setTargetAtTime(this.ambience, this.ctx.currentTime, .1);
  }
  private tone(frequency: number, at: number, duration: number, volume: number, endFrequency?: number) {
    const ctx = this.ctx;
    if (!ctx || !this.effects) return;
    const oscillator = ctx.createOscillator(); oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, at);
    if (endFrequency) oscillator.frequency.exponentialRampToValueAtTime(endFrequency, at + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, at); gain.gain.linearRampToValueAtTime(volume, at + .002);
    gain.gain.exponentialRampToValueAtTime(.0001, at + duration);
    oscillator.connect(gain).connect(this.effects); oscillator.start(at); oscillator.stop(at + duration + .02);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  }
  private impact(speed: number, wall: boolean, x: number) {
    const ctx = this.ctx;
    if (!ctx || !this.noise || !this.effects || ctx.currentTime - this.lastImpact < .012) return;
    this.lastImpact = ctx.currentTime;
    const strength = Math.min(1, Math.max(.06, speed / 27));
    const at = ctx.currentTime;
    this.tone(wall ? 700 : 1050, at, wall ? .055 : .075, .08 + strength * .19, wall ? 260 : 420);
    const source = ctx.createBufferSource(); source.buffer = this.noise;
    const filter = ctx.createBiquadFilter(); filter.type = 'highpass'; filter.frequency.value = wall ? 1500 : 2600;
    const gain = ctx.createGain(); gain.gain.setValueAtTime(.025 + strength * .12, at);
    gain.gain.exponentialRampToValueAtTime(.0001, at + .025);
    const pan = ctx.createStereoPanner(); pan.pan.value = Math.max(-.65, Math.min(.65, x / 6));
    source.connect(filter).connect(gain).connect(pan).connect(this.effects);
    source.start(at); source.stop(at + .03);
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); pan.disconnect(); };
  }
  play(events: GameEvent[], ownSide = 0) {
    if (!this.ctx || this.muted) return;
    for (const event of events) {
      if (event.type === 'wall' || event.type === 'mallet') this.impact(event.speed, event.type === 'wall', event.x);
      if (event.type === 'goal') {
        const at = this.ctx.currentTime;
        const notes = event.side === ownSide ? [523.25, 659.25, 783.99] : [440, 349.23, 293.66];
        notes.forEach((note, i) => this.tone(note, at + i * .065, .35, .12));
      }
      if (event.type === 'serve') this.tone(880, this.ctx.currentTime, .14, .07, 660);
      if (event.type === 'win') {
        const notes = event.side === ownSide ? [523.25, 659.25, 783.99, 1046.5] : [392, 349.23, 293.66];
        notes.forEach((note, i) => this.tone(note, this.ctx!.currentTime + .2 + i * .12, .65, .14));
      }
    }
  }
  click() { if (this.ctx) this.tone(620, this.ctx.currentTime, .045, .045, 410); }
  suspend() { void this.ctx?.suspend(); }
  dispose() {
    for (const source of this.sources) { try { source.stop(); } catch {} source.disconnect(); }
    this.sources = []; void this.ctx?.close(); this.ctx = null;
  }
}
