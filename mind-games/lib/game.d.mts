export type Move = 0 | 1 | 2;
export type Seat = 0 | 1;
export type Variant = 'classic' | 'mind';
export type Difficulty = 'Beginner' | 'Easy' | 'Medium' | 'Hard' | 'Expert';
export interface Round {
  round: number;
  moves: [Move, Move];
  boosts: [boolean, boolean];
  winner: Seat | null;
  delta: [number, number];
  scores: [number, number];
}
export interface Match {
  bestOf: 3 | 5 | 7;
  variant: Variant;
  target: number;
  scores: [number, number];
  round: number;
  history: Round[];
  winner: Seat | null;
  boostsLeft: [boolean, boolean];
}
export interface AIObservation { player: Move; ai: Move; }
export const MOVES: readonly string[];
export const DIFFICULTIES: readonly Difficulty[];
export function result(a: number, b: number): 1 | -1 | 0;
export function createMatch(options?: { bestOf?: 3 | 5 | 7; variant?: Variant }): Match;
export function resolveRound(match: Match, a: number, b: number, boostA?: boolean, boostB?: boolean): Match;
export class AdaptiveAI {
  difficulty: Difficulty;
  history: AIObservation[];
  constructor(options?: { difficulty?: string; history?: AIObservation[]; rng?: () => number });
  choose(): Move;
  observe(playerMove: number, aiMove: number): void;
  exportHistory(): AIObservation[];
}
