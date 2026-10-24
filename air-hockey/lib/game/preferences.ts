export type Direction = 'up' | 'left' | 'down' | 'right';
export type KeyMap = Record<Direction, string>;
export type Preferences = {
  volume: number; ambience: number; muted: boolean; pointerLock: boolean;
  quality: 'high' | 'low'; reducedMotion: boolean;
  keys: [KeyMap, KeyMap]; name: string;
};
export const DEFAULT_PREFERENCES: Preferences = {
  volume: .65, ambience: .28, muted: false, pointerLock: false,
  quality: 'high', reducedMotion: false,
  keys: [{ up: 'KeyW', left: 'KeyA', down: 'KeyS', right: 'KeyD' },
    { up: 'ArrowUp', left: 'ArrowLeft', down: 'ArrowDown', right: 'ArrowRight' }],
  name: 'Player',
};
export function loadPreferences(): Preferences {
  try {
    const saved = JSON.parse(localStorage.getItem('air-preferences') || '{}');
    return { ...DEFAULT_PREFERENCES, ...saved,
      volume: Math.min(1, Math.max(0, Number(saved.volume ?? .65))),
      ambience: Math.min(1, Math.max(0, Number(saved.ambience ?? .28))),
      keys: saved.keys?.length === 2 ? saved.keys : structuredClone(DEFAULT_PREFERENCES.keys),
      reducedMotion: saved.reducedMotion ?? window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    };
  } catch { return structuredClone(DEFAULT_PREFERENCES); }
}
export function savePreferences(value: Preferences) { try { localStorage.setItem('air-preferences', JSON.stringify(value)); } catch {} }
export function keyLabel(code: string) {
  return ({ ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Space: 'Space' } as Record<string,string>)[code] || code.replace(/^Key|^Digit/, '');
}
