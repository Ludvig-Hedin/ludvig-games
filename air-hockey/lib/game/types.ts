export type Side = 0 | 1;
export type Difficulty = 'Beginner' | 'Easy' | 'Medium' | 'Hard' | 'Pro';
export type Vec2 = { x: number; y: number };
export type Body = Vec2 & { vx: number; vy: number };
export type Phase = 'faceoff' | 'playing' | 'goal' | 'finished';
export type GameState = {
  puck: Body;
  mallets: [Body, Body];
  scores: [number, number];
  targetScore: number;
  phase: Phase;
  timer: number;
  elapsed: number;
  tick: number;
  rally: number;
  lastScorer: Side | null;
  serveSide: Side;
  seed: number;
};
export type GameEvent = {
  type: 'mallet' | 'wall' | 'goal' | 'serve' | 'win';
  x: number; y: number; speed: number; side?: Side;
};
export type Targets = [Vec2, Vec2];
export const TABLE = {
  halfWidth: 4, halfLength: 7, goalHalfWidth: 1.5,
  puckRadius: 0.24, malletRadius: 0.52,
  maxPuckSpeed: 38, maxMalletSpeed: 24, fixedDt: 1 / 240,
} as const;
export const DIFFICULTIES: Difficulty[] = ['Beginner', 'Easy', 'Medium', 'Hard', 'Pro'];
