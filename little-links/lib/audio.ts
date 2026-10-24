/** Original, quietly playful clubhouse soundtrack synthesized locally. */
export class ClubAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private step = 0;
  private muted = false;
  private music = true;
  private next = 0;
  init() {
    if (!this.ctx) {
      this.ctx = new AudioContext(); this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.35; this.master.connect(this.ctx.destination);
      this.next = this.ctx.currentTime + 0.1;
      this.timer = setInterval(() => this.schedule(), 160);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }
  setMuted(value: boolean) { this.muted = value; if (this.master && this.ctx) this.master.gain.setTargetAtTime(value ? 0 : 0.35, this.ctx.currentTime, .08); }
  setMusic(value: boolean) { this.music = value; }
  private tone(freq: number, time: number, length: number, volume: number, type: OscillatorType = 'sine') {
    if (!this.ctx || !this.master) return;
    const osc = this.ctx.createOscillator(), gain = this.ctx.createGain();
    osc.type = type; osc.frequency.value = freq; gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(volume, time + .012); gain.gain.exponentialRampToValueAtTime(.0001, time + length);
    osc.connect(gain); gain.connect(this.master); osc.start(time); osc.stop(time + length + .02);
  }
  private schedule() {
    if (!this.ctx) return;
    if (this.next < this.ctx.currentTime) this.next = this.ctx.currentTime + .02;
    while (this.next < this.ctx.currentTime + .35) {
      if (this.music && !this.muted) {
        const chords = [[48,52,55,59],[45,48,52,55],[41,45,48,52],[43,47,50,55]];
        const chord = chords[Math.floor(this.step / 16) % 4];
        const melody = [0,2,3,2,1,2,0,3];
        if (this.step % 2 === 0) this.tone(440 * 2 ** ((chord[melody[(this.step / 2) % 8]] + 12 - 69) / 12), this.next, .8, .075, 'sine');
        if (this.step % 8 === 0) this.tone(440 * 2 ** ((chord[0] - 12 - 69) / 12), this.next, 1.5, .075, 'triangle');
        if (this.step % 4 === 2) this.tone(1500, this.next, .035, .008, 'triangle');
      }
      this.step++; this.next += .24;
    }
  }
  putt(power = .5) { this.init(); const t=this.ctx!.currentTime; this.tone(370,t,.075,.28+power*.12,'triangle'); this.tone(125,t,.11,.18,'sine'); }
  cup() { this.init(); [0,4,7,12].forEach((n,i)=>this.tone(440*2**(n/12),this.ctx!.currentTime+i*.09,.5,.21)); }
  water() { this.init(); [280,220,150,95].forEach((f,i)=>this.tone(f,this.ctx!.currentTime+i*.07,.2,.12,'triangle')); }
  click() { if(this.ctx)this.tone(660,this.ctx.currentTime,.06,.07,'sine'); }
  dispose() { if(this.timer)clearInterval(this.timer); void this.ctx?.close(); }
}
