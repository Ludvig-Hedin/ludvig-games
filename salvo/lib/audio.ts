/** Restrained procedural naval audio. Call start() from a user gesture. */
export type NavalSound = "select" | "place" | "rotate" | "launch" | "miss" | "hit" | "sunk" | "victory" | "defeat" | "radar";

export class NavalAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private ambience: AudioBufferSourceNode | null = null;
  private oscillator: OscillatorNode | null = null;
  private volume = .55;
  private muted = false;
  private radarTimer: ReturnType<typeof setInterval> | null = null;
  private noise: AudioBuffer | null = null;

  start() {
    if (typeof window === "undefined") return;
    if (this.context) { void this.context.resume().catch(() => {}); return; }
    const AudioContextType = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextType) return;
    try {
      const ctx = this.context = new AudioContextType();
      const master = this.master = ctx.createGain();
      master.gain.value = this.muted ? 0 : this.volume * .6;
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -18; compressor.knee.value = 15; compressor.ratio.value = 4; compressor.attack.value = .008; compressor.release.value = .25;
      master.connect(compressor); compressor.connect(ctx.destination);
      this.noise = this.noiseBuffer(4, false);

      // Soft, band-limited surf, with a slow swell instead of a loud wind loop.
      const source = this.ambience = ctx.createBufferSource();
      source.buffer = this.noiseBuffer(12, true); source.loop = true;
      const filter = ctx.createBiquadFilter(); filter.type = "lowpass"; filter.frequency.value = 800; filter.Q.value = .2;
      const highpass = ctx.createBiquadFilter(); highpass.type = "highpass"; highpass.frequency.value = 100;
      const oceanGain = ctx.createGain(); oceanGain.gain.value = .042;
      source.connect(filter); filter.connect(highpass); highpass.connect(oceanGain); oceanGain.connect(master); source.start();
      const swell = this.oscillator = ctx.createOscillator();
      swell.type = "sine"; swell.frequency.value = .09;
      const swellDepth = ctx.createGain(); swellDepth.gain.value = .019;
      swell.connect(swellDepth); swellDepth.connect(oceanGain.gain); swell.start();
      this.radarTimer = setInterval(() => { if (!document.hidden && !this.muted) this.play("radar"); }, 18000);
      void ctx.resume().catch(() => {});
    } catch { this.context = null; this.master = null; }
  }

  setVolume(value: number) {
    this.volume = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
    this.updateMaster();
  }

  setMuted(value: boolean) { this.muted = value; this.updateMaster(); }

  private updateMaster() {
    if (!this.master || !this.context) return;
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume * .6, this.context.currentTime, .06);
  }

  private noiseBuffer(seconds: number, brown: boolean) {
    const ctx = this.context!;
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + .02 * white) / 1.02;
      data[i] = brown ? last * 3.5 : white;
    }
    // Crossfade the ends so the ambient loop never clicks.
    const fade = Math.min(Math.floor(ctx.sampleRate * .25), Math.floor(data.length / 8));
    for (let i = 0; i < fade; i++) {
      const mix = i / fade;
      data[i] = data[i] * mix + data[data.length - fade + i] * (1 - mix);
    }
    return buffer;
  }

  private tone(frequency: number, endFrequency: number, duration: number, gain: number, type: OscillatorType = "sine", delay = 0) {
    if (!this.context || !this.master) return;
    const ctx = this.context, at = ctx.currentTime + delay;
    const oscillator = ctx.createOscillator(), envelope = ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, at);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(12, endFrequency), at + duration);
    envelope.gain.setValueAtTime(0, at);
    envelope.gain.linearRampToValueAtTime(gain, at + Math.min(.02, duration * .15));
    envelope.gain.exponentialRampToValueAtTime(.0001, at + duration);
    oscillator.connect(envelope); envelope.connect(this.master);
    oscillator.start(at); oscillator.stop(at + duration + .02);
    oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect(); };
  }

  private burst(duration: number, gain: number, frequency: number, endFrequency: number, delay = 0, highpass = 70) {
    if (!this.context || !this.master || !this.noise) return;
    const ctx = this.context, at = ctx.currentTime + delay;
    const source = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), high = ctx.createBiquadFilter(), envelope = ctx.createGain();
    source.buffer = this.noise;
    filter.type = "lowpass"; filter.Q.value = .3;
    filter.frequency.setValueAtTime(frequency, at); filter.frequency.exponentialRampToValueAtTime(endFrequency, at + duration);
    high.type = "highpass"; high.frequency.value = highpass;
    envelope.gain.setValueAtTime(0, at); envelope.gain.linearRampToValueAtTime(gain, at + .018); envelope.gain.exponentialRampToValueAtTime(.0001, at + duration);
    source.connect(filter); filter.connect(high); high.connect(envelope); envelope.connect(this.master);
    source.start(at, Math.random() * Math.max(0, 4 - duration)); source.stop(at + duration + .02);
    source.onended = () => { source.disconnect(); filter.disconnect(); high.disconnect(); envelope.disconnect(); };
  }

  play(kind: NavalSound) {
    if (this.muted || this.volume === 0 || !this.context || this.context.state !== "running") return;
    switch (kind) {
      case "select": this.tone(560, 440, .07, .045, "sine"); break;
      case "rotate": this.tone(280, 380, .08, .045, "triangle"); this.tone(420, 520, .09, .025, "sine", .04); break;
      case "place": this.tone(175, 70, .16, .13, "sine"); this.burst(.085, .055, 1600, 380); break;
      case "radar": this.tone(740, 720, .58, .025); this.tone(740, 720, .7, .008, "sine", .25); break;
      case "launch":
        this.tone(130, 38, .48, .22);
        this.burst(.33, .23, 2200, 210);
        this.tone(620, 220, .32, .04, "sine", .11);
        break;
      case "miss":
        this.burst(.65, .2, 4200, 700, 0, 300);
        this.tone(230, 80, .22, .1);
        this.burst(.45, .045, 2400, 550, .19, 400);
        break;
      case "hit":
        this.burst(.65, .38, 3200, 150);
        this.tone(105, 28, .7, .26);
        this.burst(.23, .13, 4700, 1900, .06, 1100);
        break;
      case "sunk":
        this.burst(1.65, .33, 1900, 170);
        this.tone(92, 25, 1.9, .21);
        this.tone(220, 75, 1.1, .07, "triangle", .15);
        this.burst(1.4, .15, 3400, 580, .45, 220);
        this.tone(145, 48, 1.1, .045, "sine", .7);
        break;
      case "victory":
        [261.63, 329.63, 392, 523.25].forEach((frequency, i) => this.tone(frequency, frequency, .95, .065, "sine", i * .17));
        this.tone(130.81, 130.81, 1.5, .09, "sine", .25);
        break;
      case "defeat":
        [261.63, 233.08, 196, 130.81].forEach((frequency, i) => this.tone(frequency, frequency * .99, 1.2, .055, "sine", i * .19));
        break;
    }
  }

  dispose() {
    if (this.radarTimer) clearInterval(this.radarTimer);
    this.radarTimer = null;
    try { this.ambience?.stop(); this.oscillator?.stop(); } catch { /* Nodes may already be stopped by context shutdown. */ }
    if (this.context && this.context.state !== "closed") void this.context.close().catch(() => {});
    this.context = null; this.master = null; this.ambience = null; this.oscillator = null; this.noise = null;
  }
}
