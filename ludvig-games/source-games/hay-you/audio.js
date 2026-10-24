const NOTE = (midi) => 440 * 2 ** ((midi - 69) / 12);
const MELODY = [76, 0, 79, 0, 81, 79, 76, 0, 74, 0, 72, 0, 74, 0, 71, 0,
  72, 0, 76, 0, 79, 76, 74, 0, 72, 0, 71, 0, 69, 0, 0, 0];
const CHORDS = [[48, 55, 60, 64], [45, 52, 57, 60], [41, 48, 53, 57], [43, 50, 55, 59]];

/** Small, original Web Audio score. All audio starts from an explicit user gesture. */
export class HorseAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicBus = null;
    this.effectBus = null;
    this.timer = null;
    this.musicWanted = false;
    this.step = 0;
    this.nextStepAt = 0;
    this.destroyed = false;
    this.voices = new Set();
    try { this.muted = localStorage.getItem('horsetinder-muted') === '1'; } catch { this.muted = false; }
    this.onVisibility = () => {
      if (typeof document === 'undefined' || !this.ctx) return;
      if (document.hidden) {
        this._stopScheduler();
        this.ctx.suspend().catch(() => {});
      } else {
        this.ctx.resume().then(() => {
          if (this.musicWanted && !this.muted) this._startScheduler();
        }).catch(() => {});
      }
    };
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this.onVisibility);
  }

  async unlock() {
    if (this.destroyed) return false;
    try {
      if (!this.ctx) {
        const Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
        if (!Audio) return false;
        this.ctx = new Audio();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : 0.62;
        this.master.connect(this.ctx.destination);
        this.musicBus = this.ctx.createGain();
        this.musicBus.gain.value = 0.3;
        this.musicBus.connect(this.master);
        this.effectBus = this.ctx.createGain();
        this.effectBus.gain.value = 0.58;
        this.effectBus.connect(this.master);
      }
      if (this.ctx.state === 'suspended') await this.ctx.resume();
      if (this.musicWanted && !this.muted) this._startScheduler();
      return true;
    } catch { return false; }
  }

  toggle() {
    this.muted = !this.muted;
    try { localStorage.setItem('horsetinder-muted', this.muted ? '1' : '0'); } catch { /* Private mode is fine. */ }
    if (this.ctx && this.master) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : 0.62, this.ctx.currentTime, 0.035);
      if (this.muted) this._stopScheduler();
    }
    if (!this.muted) this.unlock();
    return this.muted;
  }

  _tone(frequency, time, duration, volume = 0.15, type = 'sine', bus = this.effectBus, endFrequency) {
    if (!this.ctx || this.destroyed) return;
    const oscillator = this.ctx.createOscillator();
    const envelope = this.ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(Math.max(20, frequency), time);
    if (endFrequency) oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), time + duration);
    envelope.gain.setValueAtTime(0.0001, time);
    envelope.gain.exponentialRampToValueAtTime(Math.max(0.001, volume), time + 0.009);
    envelope.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    oscillator.connect(envelope);
    envelope.connect(bus);
    this.voices.add(oscillator);
    oscillator.onended = () => {
      oscillator.disconnect();
      envelope.disconnect();
      this.voices.delete(oscillator);
    };
    oscillator.start(time);
    oscillator.stop(time + duration + 0.025);
  }

  _pluck(midi, time, volume = 0.12, bus = this.effectBus) {
    const hz = NOTE(midi);
    this._tone(hz, time, 0.65, volume, 'triangle', bus);
    this._tone(hz * 2, time, 0.23, volume * 0.2, 'sine', bus);
    this._tone(hz * 3, time, 0.11, volume * 0.07, 'sine', bus);
  }

  play(event) {
    if (this.muted || !this.ctx || this.ctx.state !== 'running' || this.destroyed) return;
    const t = this.ctx.currentTime + 0.006;
    switch (event) {
      case 'click': this._tone(750, t, 0.055, 0.055, 'sine', this.effectBus, 510); break;
      case 'swipe': this._tone(260, t, 0.11, 0.04, 'triangle', this.effectBus, 460); break;
      case 'like': this._pluck(76, t, 0.14); this._pluck(81, t + 0.08, 0.1); break;
      case 'nope': this._tone(340, t, 0.16, 0.08, 'triangle', this.effectBus, 200); break;
      case 'match':
        [72, 76, 79, 84].forEach((n, i) => this._pluck(n, t + i * 0.09, 0.12));
        this._tone(NOTE(60), t, 0.65, 0.12); break;
      case 'jump': this._tone(230, t, 0.16, 0.1, 'sine', this.effectBus, 690); break;
      case 'heart': this._pluck(84, t, 0.105); this._pluck(88, t + 0.045, 0.075); break;
      case 'hit':
        this._tone(170, t, 0.17, 0.11, 'triangle', this.effectBus, 65);
        this._tone(97, t, 0.22, 0.09); break;
      case 'finish':
      case 'win':
        [72, 76, 79, 84, 88].forEach((n, i) => this._pluck(n, t + i * 0.095, 0.125));
        [48, 55, 60].forEach((n) => this._tone(NOTE(n), t + 0.25, 1, 0.06)); break;
      case 'loss':
        [72, 71, 67].forEach((n, i) => this._pluck(n, t + i * 0.15, 0.1)); break;
      default: break;
    }
  }

  startMusic() {
    this.musicWanted = true;
    if (this.ctx && !this.muted && this.ctx.state === 'running') this._startScheduler();
  }

  stopMusic() {
    this.musicWanted = false;
    this._stopScheduler();
  }

  _startScheduler() {
    if (this.timer || !this.ctx || !this.musicWanted || this.muted || this.destroyed) return;
    if (typeof document !== 'undefined' && document.hidden) return;
    this.nextStepAt = this.ctx.currentTime + 0.07;
    this._schedule();
    this.timer = setInterval(() => this._schedule(), 90);
  }

  _stopScheduler() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  _schedule() {
    if (!this.ctx || this.ctx.state !== 'running' || this.muted || !this.musicWanted || this.destroyed) return;
    // 88 BPM in eighth notes. A bounded look-ahead avoids timer drift or bursts after sleep.
    const stepDuration = 60 / 88 / 2;
    if (this.nextStepAt < this.ctx.currentTime - 0.1) this.nextStepAt = this.ctx.currentTime + 0.02;
    let scheduled = 0;
    while (this.nextStepAt < this.ctx.currentTime + 0.2 && scheduled < 4) {
      const step = this.step % 32;
      const chord = CHORDS[Math.floor(step / 8)];
      if (step % 4 === 0) this._pluck(chord[0], this.nextStepAt, 0.13, this.musicBus);
      this._pluck(chord[1 + (step % 3)], this.nextStepAt, step % 2 ? 0.06 : 0.085, this.musicBus);
      if (MELODY[step]) this._pluck(MELODY[step], this.nextStepAt + 0.015, 0.075, this.musicBus);
      this.step += 1;
      this.nextStepAt += stepDuration;
      scheduled += 1;
    }
  }

  destroy() {
    this.destroyed = true;
    this.musicWanted = false;
    this._stopScheduler();
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.onVisibility);
    for (const voice of this.voices) {
      try { voice.stop(); } catch { /* A completed voice is already stopped. */ }
    }
    this.voices.clear();
    if (this.ctx && this.ctx.state !== 'closed') this.ctx.close().catch(() => {});
    this.ctx = null;
  }
}
