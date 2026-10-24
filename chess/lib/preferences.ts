export interface Preferences {
  theme: 'light' | 'dark' | 'system'; board: 'sage' | 'walnut' | 'slate' | 'blue';
  pieces: 'classic' | 'modern'; volume: number; muted: boolean; coordinates: boolean;
  legal: boolean; animations: boolean; autoQueen: boolean; confirmResign: boolean; reducedMotion: boolean;
  premoves: boolean; bestArrow: boolean;
}
export const DEFAULT_PREFERENCES: Preferences = {
  theme: 'light', board: 'sage', pieces: 'classic', volume: .5, muted: false, coordinates: true,
  legal: true, animations: true, autoQueen: false, confirmResign: true, reducedMotion: false,
  premoves: true, bestArrow: true,
};
export function readStorage<T>(key: string, fallback: T): T {
  try { const value = localStorage.getItem(key); return value ? JSON.parse(value) as T : fallback; } catch { return fallback; }
}
export function writeStorage(key: string, value: unknown): void { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Private mode and full storage do not interrupt play. */ } }

