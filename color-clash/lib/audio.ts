/** Original procedural soundscape. No files, network requests, or autoplay. */
type SoundName = "tap" | "place" | "play" | "draw" | "deal" | "shuffle" | "reverse" | "skip" | "draw2" | "wild" | "wild4" | "call" | "catch" | "win" | "victory" | "turn" | "error" | "ready" | string;

class TableAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private effects: GainNode | null = null;
  private music: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private enabled = true;
  private musicEnabled = false;
  private musicTimer: ReturnType<typeof setInterval> | null = null;
  private beat = 0;
  private nextBeat = 0;
  private lastPlay: Record<string, number> = {};
  private visibilityHandler: (() => void) | null = null;

  unlock() {
    if (typeof window === "undefined") return;
    if (!this.context) {
      const AudioCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtor) return;
      try {
        this.context = new AudioCtor();
        this.master = this.context.createGain();
        this.master.gain.value = this.enabled ? 0.7 : 0;
        const limiter = this.context.createDynamicsCompressor();
        limiter.threshold.value = -12;
        limiter.knee.value = 16;
        limiter.ratio.value = 5;
        limiter.attack.value = 0.003;
        limiter.release.value = 0.18;
        this.master.connect(limiter);
        limiter.connect(this.context.destination);
        this.effects = this.context.createGain();
        this.effects.gain.value = 0.65;
        this.effects.connect(this.master);
        this.music = this.context.createGain();
        this.music.gain.value = this.musicEnabled ? 0.1 : 0;
        const warmth = this.context.createBiquadFilter();
        warmth.type = "lowpass";
        warmth.frequency.value = 2400;
        this.music.connect(warmth);
        warmth.connect(this.master);
        this.noise = this.context.createBuffer(1, this.context.sampleRate, this.context.sampleRate);
        const samples = this.noise.getChannelData(0);
        for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
        this.visibilityHandler = () => {
          if (!this.context) return;
          if (document.hidden) void this.context.suspend().catch(() => {});
          else {
            this.nextBeat = this.context.currentTime + 0.08;
            void this.context.resume().catch(() => {});
          }
        };
        document.addEventListener("visibilitychange", this.visibilityHandler);
      } catch { return; }
    }
    if (this.context.state === "suspended") void this.context.resume().catch(() => {});
    if (this.musicEnabled) this.startMusic();
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (this.context && this.master) this.master.gain.setTargetAtTime(enabled ? 0.7 : 0, this.context.currentTime, 0.035);
  }

  setMusic(enabled: boolean) {
    this.musicEnabled = enabled;
    if (!this.context || !this.music) return;
    this.music.gain.setTargetAtTime(enabled ? 0.1 : 0, this.context.currentTime, 0.2);
    if (enabled) this.startMusic();
    else if (this.musicTimer) { clearInterval(this.musicTimer); this.musicTimer = null; }
  }

  private tone(frequency: number, duration: number, volume: number, at: number, shape: OscillatorType = "sine", endFrequency?: number, destination?: AudioNode) {
    const ctx = this.context;
    const target = destination || this.effects;
    if (!ctx || !target) return;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = shape;
    oscillator.frequency.setValueAtTime(frequency, at);
    if (endFrequency) oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), at + duration);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), at + Math.min(0.008, duration / 5));
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    oscillator.connect(gain);
    gain.connect(target);
    oscillator.start(at);
    oscillator.stop(at + duration + 0.025);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  }

  private paper(at: number, duration = 0.12, volume = 0.2, frequency = 2000, destination?: AudioNode) {
    const ctx = this.context;
    const target = destination || this.effects;
    if (!ctx || !this.noise || !target) return;
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(frequency, at);
    filter.frequency.exponentialRampToValueAtTime(frequency * 0.4, at + duration);
    filter.Q.value = 0.7;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(volume, at + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(target);
    source.start(at, Math.random() * 0.6, duration + 0.02);
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
  }

  private chime(frequency: number, at: number, length = 0.25, volume = 0.12, destination?: AudioNode) {
    this.tone(frequency, length, volume, at, "sine", undefined, destination);
    this.tone(frequency * 2.003, length * 0.5, volume * 0.22, at, "sine", undefined, destination);
    this.tone(frequency * 3.01, length * 0.3, volume * 0.065, at, "sine", undefined, destination);
  }

  play(type: SoundName) {
    const ctx = this.context;
    if (!ctx || !this.enabled || ctx.state !== "running") return;
    const now = ctx.currentTime;
    if (now - (this.lastPlay[type] ?? -10) < 0.035) return;
    this.lastPlay[type] = now;
    const at = now + 0.006;
    switch (type) {
      case "tap": this.tone(650, 0.045, 0.07, at, "sine", 440); break;
      case "play":
      case "place":
        this.paper(at, 0.09, 0.2, 1200);
        this.tone(160, 0.11, 0.21, at + 0.025, "sine", 68);
        this.tone(540, 0.035, 0.04, at + 0.026, "triangle", 300);
        break;
      case "draw":
      case "deal":
        this.paper(at, 0.15, 0.26, 3400);
        this.tone(480, 0.055, 0.035, at + 0.03, "sine", 760);
        break;
      case "shuffle":
        [0, 0.07, 0.14, 0.21, 0.28].forEach((delay, i) => this.paper(at + delay, 0.11, 0.15, 2300 + i * 220));
        break;
      case "reverse":
        this.paper(at, 0.22, 0.16, 2800);
        this.tone(430, 0.16, 0.08, at, "sine", 280);
        this.tone(280, 0.2, 0.08, at + 0.13, "sine", 570);
        break;
      case "skip":
        this.tone(380, 0.08, 0.14, at, "triangle", 300);
        this.tone(260, 0.12, 0.11, at + 0.09, "sine", 160);
        this.paper(at + 0.09, 0.06, 0.08, 1000);
        break;
      case "draw2":
        [0, 0.11].forEach((delay, i) => { this.paper(at + delay, 0.12, 0.17, 2200); this.chime(392 + i * 100, at + delay, 0.18, 0.06); });
        break;
      case "wild":
        [392, 493.88, 587.33].forEach((note, i) => this.chime(note, at + i * 0.055, 0.32, 0.075));
        break;
      case "wild4":
        [293.66, 369.99, 440, 587.33].forEach((note, i) => { this.chime(note, at + i * 0.07, 0.32, 0.075); this.paper(at + i * 0.07, 0.09, 0.07, 1600); });
        break;
      case "call":
        this.tone(130, 0.16, 0.14, at, "sine", 70);
        [587.33, 783.99].forEach((note, i) => this.chime(note, at + i * 0.1, 0.36, 0.11));
        break;
      case "catch":
        this.chime(349.23, at, 0.17, 0.085);
        this.chime(261.63, at + 0.1, 0.3, 0.075);
        break;
      case "win":
      case "victory":
        [392, 493.88, 587.33, 783.99, 987.77].forEach((note, i) => this.chime(note, at + i * 0.12, 0.65, 0.11));
        [196, 293.66, 392].forEach(note => this.tone(note, 1.2, 0.065, at + 0.5, "triangle"));
        break;
      case "turn": this.chime(587.33, at, 0.19, 0.075); break;
      case "ready": this.chime(440, at, 0.25, 0.07); this.chime(659.25, at + 0.1, 0.3, 0.065); break;
      case "error": this.tone(190, 0.13, 0.085, at, "sine", 140); break;
      default: this.paper(at, 0.08, 0.1, 1800);
    }
  }

  private startMusic() {
    if (this.musicTimer || !this.context) return;
    this.nextBeat = this.context.currentTime + 0.1;
    const schedule = () => {
      const ctx = this.context;
      if (!ctx || !this.music || !this.musicEnabled || !this.enabled || ctx.state !== "running") return;
      if (this.nextBeat < ctx.currentTime) this.nextBeat = ctx.currentTime + 0.04;
      while (this.nextBeat < ctx.currentTime + 0.3) {
        this.scheduleBeat(this.beat++, this.nextBeat);
        this.nextBeat += 60 / 92 / 2;
      }
    };
    this.musicTimer = setInterval(schedule, 120);
    schedule();
  }

  private scheduleBeat(beat: number, at: number) {
    if (!this.music) return;
    // A soft, unhurried original loop: minor ninth → major seventh → sixth → suspended.
    const chords = [[50, 57, 60, 64, 69], [53, 60, 64, 67, 72], [48, 55, 60, 64, 69], [55, 62, 65, 69, 72]];
    const chord = chords[Math.floor(beat / 16) % chords.length];
    const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);
    const step = beat % 16;
    if (step === 0 || step === 8) this.tone(hz(chord[0] - 12), 1.3, 0.34, at, "sine", undefined, this.music);
    if ([0, 5, 10, 14].includes(step)) {
      chord.slice(1, 4).forEach((note, i) => this.chime(hz(note), at + i * 0.018, 1.1, 0.19, this.music!));
    }
    if ([3, 7, 11, 15].includes(step)) {
      const melody = [4, 3, 2, 1][Math.floor(step / 4)];
      this.chime(hz(chord[melody] + 12), at + (step % 2 ? 0.035 : 0), 0.72, 0.11, this.music);
    }
    if (step % 4 === 2) this.paper(at, 0.045, 0.09, 6500, this.music);
    if (step % 8 === 4) this.paper(at, 0.09, 0.09, 1200, this.music);
  }

  dispose() {
    if (this.musicTimer) clearInterval(this.musicTimer);
    this.musicTimer = null;
    if (this.visibilityHandler && typeof document !== "undefined") document.removeEventListener("visibilitychange", this.visibilityHandler);
    this.visibilityHandler = null;
    if (this.context) void this.context.close().catch(() => {});
    this.context = null;
    this.master = null;
    this.effects = null;
    this.music = null;
    this.noise = null;
    this.lastPlay = {};
    this.beat = 0;
  }
}

export const audio = new TableAudio();
