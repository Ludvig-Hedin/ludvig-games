export type ChessSoundKind =
  | "pickup" | "move" | "capture" | "castle" | "check" | "promotion"
  | "start" | "win" | "lose" | "draw" | "warning" | "incoming";

type AudioWindow = Window & { webkitAudioContext?: typeof AudioContext };

/** Quiet, synthesized wood-and-felt sounds. Audio starts only after unlock(). */
export class ChessSound {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private volume = 0.5;
  private muted = false;
  private disposed = false;

  unlock(): void {
    if (this.disposed || typeof window === "undefined") return;
    try {
      if (!this.context) {
        const Constructor = window.AudioContext ?? (window as AudioWindow).webkitAudioContext;
        if (!Constructor) return;
        const context = new Constructor();
        const master = context.createGain();
        const limiter = context.createDynamicsCompressor();
        limiter.threshold.value = -18;
        limiter.knee.value = 12;
        limiter.ratio.value = 4;
        limiter.attack.value = 0.004;
        limiter.release.value = 0.16;
        master.gain.value = this.muted ? 0 : this.volume * 0.6;
        master.connect(limiter);
        limiter.connect(context.destination);
        this.context = context;
        this.master = master;
        const noise = context.createBuffer(1, Math.ceil(context.sampleRate * 0.4), context.sampleRate);
        const samples = noise.getChannelData(0);
        let previous = 0;
        for (let i = 0; i < samples.length; i++) {
          // A little correlation removes the bright hiss of raw white noise.
          previous = previous * 0.55 + (Math.random() * 2 - 1) * 0.45;
          samples[i] = previous;
        }
        this.noise = noise;
      }
      if (this.context.state === "suspended") void this.context.resume().catch(() => undefined);
    } catch {
      // A blocked audio device must never prevent a legal chess move.
    }
  }

  setVolume(value: number): void {
    this.volume = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0.5));
    this.syncGain();
  }

  setMuted(value: boolean): void {
    this.muted = value;
    this.syncGain();
  }

  play(kind: ChessSoundKind): void {
    const ctx = this.context;
    if (!ctx || ctx.state !== "running" || this.muted || this.volume <= 0 || this.disposed) return;
    const at = ctx.currentTime + 0.004;
    switch (kind) {
      case "pickup":
        this.wood(at, 520, 0.12, 0.035);
        break;
      case "move":
        this.wood(at, 340, 0.43, 0.085);
        break;
      case "capture":
        this.wood(at, 260, 0.5, 0.1);
        this.wood(at + 0.045, 410, 0.22, 0.055);
        break;
      case "castle":
        this.wood(at, 310, 0.4, 0.075);
        this.wood(at + 0.11, 410, 0.3, 0.07);
        break;
      case "check":
        this.wood(at, 320, 0.32, 0.07);
        this.tone(at + 0.03, 659.25, 0.075, 0.24);
        this.tone(at + 0.06, 987.77, 0.035, 0.2);
        break;
      case "promotion":
        this.wood(at, 350, 0.35, 0.09);
        this.chime(at + 0.06, [523.25, 659.25, 783.99], 0.085, 0.075);
        break;
      case "start":
        this.chime(at, [392, 523.25], 0.08, 0.11);
        break;
      case "win":
        this.chime(at, [523.25, 659.25, 783.99, 1046.5], 0.09, 0.115);
        break;
      case "lose":
        this.chime(at, [392, 349.23, 293.66], 0.065, 0.13);
        break;
      case "draw":
        this.chime(at, [440, 523.25, 440], 0.06, 0.12);
        break;
      case "warning":
        this.tone(at, 698.46, 0.055, 0.14);
        this.tone(at + 0.18, 698.46, 0.045, 0.14);
        break;
      case "incoming":
        this.wood(at, 390, 0.38, 0.08);
        this.tone(at + 0.015, 783.99, 0.025, 0.14);
        break;
    }
  }

  destroy(): void {
    this.disposed = true;
    this.master?.disconnect();
    if (this.context && this.context.state !== "closed") void this.context.close().catch(() => undefined);
    this.context = null;
    this.master = null;
    this.noise = null;
  }

  private syncGain(): void {
    if (!this.master || !this.context) return;
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume * 0.6, this.context.currentTime, 0.025);
  }

  private tone(at: number, frequency: number, volume: number, duration: number): void {
    if (!this.context || !this.master) return;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, at);
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(volume, at + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    oscillator.connect(gain);
    gain.connect(this.master);
    oscillator.start(at);
    oscillator.stop(at + duration + 0.025);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  }

  private chime(at: number, notes: number[], volume: number, interval: number): void {
    notes.forEach((note, i) => {
      this.tone(at + i * interval, note, volume, 0.4);
      this.tone(at + i * interval, note * 2, volume * 0.13, 0.23);
    });
  }

  private wood(at: number, frequency: number, volume: number, duration: number): void {
    const ctx = this.context;
    if (!ctx || !this.master || !this.noise) return;
    const noise = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    noise.buffer = this.noise;
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(1650, at);
    filter.Q.value = 0.4;
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(volume, at + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    noise.start(at, 0, duration + 0.01);
    noise.onended = () => { noise.disconnect(); filter.disconnect(); gain.disconnect(); };
    this.tone(at, frequency, volume * 0.26, duration * 0.95);
    this.tone(at + 0.002, frequency * 1.45, volume * 0.07, duration * 0.6);
  }
}
