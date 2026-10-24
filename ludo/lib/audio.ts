let context: AudioContext | null = null;
let effects = true;
let musicEnabled = false;
let musicTimer: ReturnType<typeof setInterval> | null = null;
let master: GainNode | null = null;
let musicBus: GainNode | null = null;
let musicStep = 0;
function unlock() {
  if (typeof window === "undefined") return;
  try {
    if (!context) {
      const Constructor = window.AudioContext || (window as any).webkitAudioContext;
      if (!Constructor) return;
      context = new Constructor();
      master = context!.createGain(); master.gain.value = .2; master.connect(context!.destination);
      musicBus = context!.createGain(); musicBus.gain.value = .065; musicBus.connect(context!.destination);
    }
    if (context!.state === "suspended") void context!.resume();
    if (musicEnabled && !musicTimer) beginMusic();
  } catch {}
}
function tone(frequency: number, length: number, delay = 0, volume = .3, type: OscillatorType = "sine", isMusic = false) {
  if (!context || (!effects && !isMusic) || (isMusic && !musicEnabled)) return;
  const t = context.currentTime + delay;
  const oscillator = context.createOscillator(); const gain = context.createGain();
  oscillator.type = type; oscillator.frequency.setValueAtTime(frequency, t);
  gain.gain.setValueAtTime(0, t); gain.gain.linearRampToValueAtTime(volume, t + .012); gain.gain.exponentialRampToValueAtTime(.0001, t + length);
  oscillator.connect(gain); gain.connect((isMusic ? musicBus : master)!); oscillator.start(t); oscillator.stop(t + length + .02);
  oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
}
function tick(delay = 0, pitch = 650) { tone(pitch, .045, delay, .22, "triangle"); tone(pitch * .48, .07, delay, .16); }
function beginMusic() {
  if (!context || musicTimer) return;
  const chords = [[130.81,164.81,196,246.94],[110,130.81,164.81,196],[87.31,110,130.81,164.81],[98,123.47,146.83,196]];
  const melody = [523.25,0,659.25,587.33,0,493.88,440,0,392,0,523.25,0,493.88,440,392,0];
  const step = () => {
    if (document.hidden || !musicEnabled) return;
    const chord = chords[Math.floor(musicStep / 8) % chords.length];
    if (musicStep % 4 === 0) { tone(chord[0], 1.8, 0, .2, "sine", true); chord.slice(1).forEach((f, i) => tone(f, 1.5, i * .045, .08, "triangle", true)); }
    const note = melody[musicStep % melody.length]; if (note) tone(note, .7, 0, .1, "sine", true);
    musicStep++;
  };
  step(); musicTimer = setInterval(step, 390);
}
export const audio = {
  unlock,
  setSound(value: boolean) { effects = value; },
  setMusic(value: boolean) { musicEnabled = value; if (value) { unlock(); beginMusic(); } else if (musicTimer) { clearInterval(musicTimer); musicTimer = null; } },
  roll() { [0,.065,.14,.24,.36,.49].forEach((d,i) => tick(d, 480 + (i%3)*140)); },
  move() { tick(0,540); tick(.085,720); },
  capture() { tone(440,.18,0,.25,"triangle"); tone(220,.25,.09,.2,"triangle"); tick(.15,380); },
  home() { [659.25,783.99,1046.5].forEach((f,i)=>tone(f,.32,i*.09,.25)); },
  win() { [523.25,659.25,783.99,1046.5,783.99,1046.5].forEach((f,i)=>tone(f,.6,i*.13,.3)); },
  start() { tone(523.25,.2,0,.2); tone(783.99,.4,.1,.2); }
};
