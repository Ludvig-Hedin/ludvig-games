/** Original procedural score and effects. No assets, autoplay, or external requests. */
export type AudioScene = "menu" | "game" | "results" | "silent";
export type AudioCue =
  | "click"
  | "correct"
  | "wrong"
  | "sabotage"
  | "tick"
  | "win"
  | "lose"
  | "leaderboard";

type BrowserAudioWindow = Window & { webkitAudioContext?: typeof AudioContext };
const midi = (note: number) => 440 * 2 ** ((note - 69) / 12);
const chords = [
  [60, 64, 67, 71],
  [57, 60, 64, 67],
  [53, 57, 60, 64],
  [55, 59, 62, 67],
];
const melodies = [
  [12, -1, -1, 16, -1, -1, 19, -1, -1, -1, 16, -1, 14, -1, -1, -1],
  [12, -1, -1, -1, 19, -1, 16, -1, -1, 12, -1, -1, -1, -1, 14, -1],
  [-1, -1, 16, -1, 19, -1, -1, 16, -1, -1, 12, -1, -1, -1, 14, -1],
  [19, -1, -1, 16, -1, -1, 14, -1, 12, -1, -1, -1, -1, -1, -1, -1],
];

class HangdAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private music: GainNode | null = null;
  private effects: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private limiter: DynamicsCompressorNode | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private volume = 0.35;
  private muted = false;
  private scene: AudioScene = "menu";
  private nextNote = 0;
  private step = 0;
  private unlocked = false;
  private active = new Set<AudioScheduledSourceNode>();
  private lastCue: Partial<Record<AudioCue, number>> = {};

  private visibility = () => {
    if (!this.context || !this.unlocked) return;
    if (document.hidden) {
      this.stopClock();
      void this.context.suspend().catch(() => {});
    } else {
      void this.context
        .resume()
        .then(() => {
          this.nextNote = this.context!.currentTime + 0.08;
          this.clock();
        })
        .catch(() => {});
    }
  };

  async unlock(): Promise<void> {
    if (typeof window === "undefined") return;
    try {
      if (!this.context) {
        const Ctor =
          window.AudioContext ||
          (window as BrowserAudioWindow).webkitAudioContext;
        if (!Ctor) return;
        const ctx = new Ctor({ latencyHint: "interactive" });
        this.context = ctx;
        this.master = ctx.createGain();
        this.master.gain.value = this.muted ? 0 : this.volume;
        this.music = ctx.createGain();
        this.music.gain.value = this.scene === "silent" ? 0 : 0.55;
        this.effects = ctx.createGain();
        this.effects.gain.value = 0.9;
        this.limiter = ctx.createDynamicsCompressor();
        this.limiter.threshold.value = -12;
        this.limiter.knee.value = 18;
        this.limiter.ratio.value = 4;
        this.limiter.attack.value = 0.005;
        this.limiter.release.value = 0.2;
        this.music.connect(this.master);
        this.effects.connect(this.master);
        this.master.connect(this.limiter);
        this.limiter.connect(ctx.destination);

        const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
        const samples = buffer.getChannelData(0);
        let seed = 6739;
        let smooth = 0;
        for (let i = 0; i < samples.length; i++) {
          seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
          const white = ((seed >>> 0) / 4294967296) * 2 - 1;
          smooth = (smooth + 0.025 * white) / 1.025;
          samples[i] = white * 0.6 + smooth * 2;
        }
        this.noise = buffer;
        document.addEventListener("visibilitychange", this.visibility);
      }
      await this.context.resume();
      if (!this.unlocked) {
        this.unlocked = true;
        this.nextNote = this.context.currentTime + 0.08;
        this.clock();
      }
    } catch {
      // The game remains usable if a browser or OS blocks audio.
    }
  }

  setVolume(value: number): void {
    this.volume = Math.max(
      0,
      Math.min(1, Number.isFinite(value) ? value : 0.35),
    );
    this.updateMaster();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.updateMaster();
  }

  private updateMaster(): void {
    if (!this.context || !this.master) return;
    const at = this.context.currentTime;
    this.master.gain.cancelScheduledValues(at);
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, at, 0.025);
  }

  setScene(scene: AudioScene): void {
    if (scene === this.scene) return;
    this.scene = scene;
    this.step = 0;
    if (!this.context || !this.music) return;
    this.nextNote = this.context.currentTime + 0.15;
    this.music.gain.cancelScheduledValues(this.context.currentTime);
    this.music.gain.setTargetAtTime(
      scene === "silent" ? 0 : scene === "results" ? 0.38 : 0.55,
      this.context.currentTime,
      0.12,
    );
  }

  private track(source: AudioScheduledSourceNode, nodes: AudioNode[]): void {
    this.active.add(source);
    source.onended = () => {
      this.active.delete(source);
      source.disconnect();
      for (const node of nodes) node.disconnect();
    };
  }

  private tone(
    note: number,
    at: number,
    duration: number,
    gain: number,
    kind: OscillatorType = "sine",
    destination = this.effects,
    slide?: number,
  ): void {
    const ctx = this.context;
    if (!ctx || !destination) return;
    const oscillator = ctx.createOscillator();
    const envelope = ctx.createGain();
    const lowpass = ctx.createBiquadFilter();
    oscillator.type = kind;
    oscillator.frequency.setValueAtTime(midi(note), at);
    if (slide !== undefined)
      oscillator.frequency.exponentialRampToValueAtTime(
        midi(slide),
        at + duration * 0.85,
      );
    lowpass.type = "lowpass";
    lowpass.frequency.value = kind === "triangle" ? 2200 : 3400;
    envelope.gain.setValueAtTime(0.0001, at);
    envelope.gain.exponentialRampToValueAtTime(
      Math.max(0.0001, gain),
      at + 0.009,
    );
    envelope.gain.exponentialRampToValueAtTime(
      0.0001,
      at + Math.max(0.02, duration),
    );
    oscillator.connect(lowpass);
    lowpass.connect(envelope);
    envelope.connect(destination);
    this.track(oscillator, [lowpass, envelope]);
    oscillator.start(at);
    oscillator.stop(at + duration + 0.035);
  }

  private pluck(
    note: number,
    at: number,
    duration: number,
    gain: number,
    destination = this.music,
  ): void {
    this.tone(note, at, duration, gain, "triangle", destination);
    this.tone(
      note + 12,
      at + 0.002,
      duration * 0.36,
      gain * 0.16,
      "sine",
      destination,
    );
  }

  private tap(
    at: number,
    gain: number,
    duration: number,
    frequency: number,
    destination = this.music,
  ): void {
    const ctx = this.context;
    if (!ctx || !this.noise || !destination) return;
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = frequency;
    filter.Q.value = 0.8;
    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(0.0001, at);
    envelope.gain.exponentialRampToValueAtTime(gain, at + 0.004);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(destination);
    this.track(source, [filter, envelope]);
    source.start(at, 0.17);
    source.stop(at + duration + 0.02);
  }

  private kick(at: number, gain: number): void {
    this.tone(45, at, 0.16, gain, "sine", this.music, 29);
  }

  private clock = (): void => {
    this.stopClock();
    const ctx = this.context;
    if (!ctx || !this.unlocked || document.hidden || ctx.state !== "running")
      return;
    if (this.nextNote < ctx.currentTime - 0.25)
      this.nextNote = ctx.currentTime + 0.03;
    const beat =
      60 / (this.scene === "game" ? 114 : this.scene === "results" ? 100 : 94);
    while (this.nextNote < ctx.currentTime + 0.16) {
      if (!this.muted && this.scene !== "silent")
        this.scheduleStep(this.step, this.nextNote, beat);
      this.step = (this.step + 1) % 256;
      this.nextNote += beat / 4;
    }
    this.timer = setTimeout(this.clock, 75);
  };

  private scheduleStep(step: number, at: number, beat: number): void {
    const bar = Math.floor(step / 16);
    const n = step % 16;
    const game = this.scene === "game";
    const chord = chords[bar % 4];
    const section = Math.floor(bar / 4);
    const root = chord[0];
    // Sixteen-bar score: four related motifs with sparse call-and-response.
    if (n === 0) {
      chord.forEach((note, i) =>
        this.tone(note, at + i * 0.021, beat * 2.5, 0.016, "sine", this.music),
      );
      this.pluck(root - 24, at, beat * 1.2, 0.12);
    }
    if (n === 8) this.pluck(root - 17, at, beat * 0.7, 0.075);
    if (game && n === 14 && bar % 2 === 1)
      this.pluck(root - 12, at, beat * 0.4, 0.05);
    const melody = melodies[(bar + section) % melodies.length][n];
    if (melody >= 0 && (this.scene !== "results" || n % 2 === 0)) {
      const absolute =
        melody === 16
          ? chord[1] + 12
          : melody === 19
            ? chord[2] + 12
            : root + melody;
      this.pluck(
        absolute,
        at + (n % 2 === 1 ? 0.018 : 0),
        beat * 0.95,
        game ? 0.043 : 0.048,
      );
      if (section === 2)
        this.tone(
          absolute + 12,
          at + beat * 0.48,
          beat * 0.8,
          0.009,
          "sine",
          this.music,
        );
    }
    if (this.scene === "results") return;
    if (n === 0 || n === 8) this.kick(at, game ? 0.09 : 0.055);
    if (n === 4 || n === 12) {
      this.tap(at, game ? 0.055 : 0.03, 0.06, 1300);
      this.tone(76, at, 0.035, 0.02, "sine", this.music, 72);
    }
    if (game && n % 2 === 0)
      this.tap(at, n % 4 === 0 ? 0.018 : 0.012, 0.035, 4300);
    if (!game && (n === 6 || n === 14)) this.tap(at, 0.014, 0.035, 3600);
    if (game && bar % 4 === 3 && n === 15)
      this.pluck(chord[2] + 12, at, 0.13, 0.03);
  }

  play(cue: AudioCue): void {
    const ctx = this.context;
    if (
      !ctx ||
      !this.unlocked ||
      this.muted ||
      document.hidden ||
      ctx.state !== "running"
    )
      return;
    const at = ctx.currentTime + 0.005;
    if (
      at - (this.lastCue[cue] ?? -100) <
      (cue === "click" ? 0.045 : cue === "tick" ? 0.7 : 0.09)
    )
      return;
    this.lastCue[cue] = at;
    switch (cue) {
      case "click":
        this.tone(77, at, 0.055, 0.06, "sine", this.effects, 72);
        break;
      case "correct":
        this.pluck(76, at, 0.18, 0.12, this.effects);
        this.pluck(83, at + 0.075, 0.25, 0.105, this.effects);
        break;
      case "wrong":
        this.tone(48, at, 0.16, 0.14, "triangle", this.effects, 42);
        this.tap(at, 0.04, 0.07, 900, this.effects);
        break;
      case "sabotage":
        [64, 68, 72, 76].forEach((note, i) =>
          this.pluck(note, at + i * 0.065, 0.17, 0.09, this.effects),
        );
        this.tone(83, at + 0.2, 0.3, 0.075, "triangle", this.effects, 59);
        break;
      case "tick":
        this.tone(79, at, 0.045, 0.07, "sine", this.effects);
        break;
      case "win":
        [72, 76, 79, 84].forEach((note, i) =>
          this.pluck(note, at + i * 0.11, 0.45, 0.13, this.effects),
        );
        [60, 64, 67].forEach((note) =>
          this.tone(note, at + 0.34, 0.8, 0.05, "sine", this.effects),
        );
        break;
      case "lose":
        [64, 62, 57].forEach((note, i) =>
          this.tone(note, at + i * 0.14, 0.3, 0.085, "triangle", this.effects),
        );
        break;
      case "leaderboard":
        [67, 72, 76].forEach((note, i) =>
          this.pluck(note, at + i * 0.075, 0.2, 0.085, this.effects),
        );
        break;
    }
  }

  private stopClock(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  dispose(): void {
    this.stopClock();
    if (typeof document !== "undefined")
      document.removeEventListener("visibilitychange", this.visibility);
    for (const source of this.active) {
      try {
        source.stop();
      } catch {
        /* A completed voice is already silent. */
      }
    }
    this.active.clear();
    if (this.context) void this.context.close().catch(() => {});
    this.context = null;
    this.master = null;
    this.music = null;
    this.effects = null;
    this.limiter = null;
    this.noise = null;
    this.unlocked = false;
    this.lastCue = {};
    this.step = 0;
  }
}

export const audio = new HangdAudio();
