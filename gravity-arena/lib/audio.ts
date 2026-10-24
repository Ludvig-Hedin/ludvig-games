/** Original synthesized sounds. No network requests or audio assets. */
export class ArenaAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private enabled = true;
  private lastPreview = 0;

  setEnabled(value: boolean) {
    this.enabled = value;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(value ? .45 : 0, this.ctx.currentTime, .03);
  }

  unlock() {
    try {
      if (!this.ctx) {
        this.ctx = new AudioContext();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.enabled ? .45 : 0;
        this.master.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => {});
    } catch { /* Audio support does not affect gameplay. */ }
  }

  private note(freq: number, duration: number, gain = .15, delay = 0, type: OscillatorType = 'sine', endFreq?: number) {
    if (!this.enabled || !this.ctx || !this.master) return;
    const at = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const volume = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, at);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, at + duration);
    volume.gain.setValueAtTime(.0001, at);
    volume.gain.exponentialRampToValueAtTime(gain, at + .006);
    volume.gain.exponentialRampToValueAtTime(.0001, at + duration);
    osc.connect(volume); volume.connect(this.master);
    osc.start(at); osc.stop(at + duration + .02);
    osc.onended = () => { osc.disconnect(); volume.disconnect(); };
  }

  play(kind: 'ui' | 'pick' | 'drop' | 'land' | 'turn' | 'win' | 'draw' | 'undo') {
    if (!this.enabled) return;
    if (kind === 'pick') {
      if (Date.now() - this.lastPreview < 110) return;
      this.lastPreview = Date.now();
      this.note(700, .065, .032, 0, 'sine', 840);
    }
    if (kind === 'ui') this.note(460, .07, .045, 0, 'sine', 330);
    if (kind === 'drop') { this.note(390, .22, .07, 0, 'sine', 190); this.note(1700, .1, .014, .02); }
    if (kind === 'land') { this.note(180, .16, .35, 0, 'sine', 65); this.note(940, .09, .11, 0, 'triangle', 400); this.note(1900, .055, .04, .015); }
    if (kind === 'turn') this.note(560, .13, .045);
    if (kind === 'undo') this.note(260, .16, .08, 0, 'sine', 470);
    if (kind === 'win') [523.25,659.25,783.99,1046.5].forEach((n,i) => { this.note(n,.65,.14,i*.105); this.note(n*2,.3,.025,i*.105); });
    if (kind === 'draw') [392,440,523.25].forEach((n,i) => this.note(n,.5,.1,i*.14));
  }

  dispose() { void this.ctx?.close().catch(() => {}); this.ctx = null; this.master = null; }
}
