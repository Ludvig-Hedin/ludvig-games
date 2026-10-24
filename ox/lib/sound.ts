/** Quiet, tactile synthesis. No files, timers, looping audio, or autoplay. */
export type SoundKind = "tap" | "X" | "O" | "win" | "draw" | "rematch";

let context: AudioContext | null = null;
let output: GainNode | null = null;

function audio() {
  if (typeof window === "undefined") return null;
  try {
    const Context = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Context) return null;
    if (!context || context.state === "closed") {
      context = new Context();
      output = context.createGain();
      output.gain.value = .31;
      output.connect(context.destination);
    }
    return context;
  } catch {
    return null;
  }
}

export function unlockAudio() {
  const ctx = audio();
  if (ctx?.state === "suspended") void ctx.resume().catch(() => {});
}

function tone(ctx: AudioContext, frequency: number, start: number, duration: number, volume: number, type: OscillatorType = "sine", bend = 1) {
  if (!output) return;
  const oscillator = ctx.createOscillator();
  const envelope = ctx.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(30, frequency * bend), start + duration);
  envelope.gain.setValueAtTime(.0001, start);
  envelope.gain.exponentialRampToValueAtTime(volume, start + .006);
  envelope.gain.exponentialRampToValueAtTime(.0001, start + duration);
  oscillator.connect(envelope);
  envelope.connect(output);
  oscillator.start(start);
  oscillator.stop(start + duration + .01);
  oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect(); };
}

export function playSound(kind: SoundKind, enabled = true) {
  if (!enabled) return;
  const ctx = audio();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    void ctx.resume().then(() => { if (ctx.state === "running") playSound(kind, enabled); }).catch(() => {});
    return;
  }
  const now = ctx.currentTime;
  try {
    switch (kind) {
      case "tap":
        tone(ctx, 620, now, .045, .065, "sine", .76);
        break;
      case "X":
        tone(ctx, 420, now, .105, .22, "sine", .58);
        tone(ctx, 1050, now, .035, .034, "triangle", .7);
        break;
      case "O":
        tone(ctx, 610, now, .14, .19, "sine", .73);
        tone(ctx, 1220, now, .065, .025, "sine", .93);
        break;
      case "win":
        [523.25, 659.25, 783.99].forEach((frequency, i) => tone(ctx, frequency, now + i * .075, .38, .1));
        tone(ctx, 1046.5, now + .23, .47, .06);
        break;
      case "draw":
        tone(ctx, 440, now, .22, .105);
        tone(ctx, 523.25, now + .09, .27, .075);
        break;
      case "rematch":
        tone(ctx, 392, now, .13, .11);
        tone(ctx, 587.33, now + .07, .2, .1);
        break;
    }
  } catch {
    // Audio is a progressive enhancement; gameplay always remains available.
  }
}
