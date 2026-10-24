export type Mark = 'X' | 'O';
export type Cell = Mark | null;
export type Difficulty = 'easy' | 'medium' | 'hard' | 'impossible';
export type GameResult = { winner: Mark | null; line: number[]; draw: boolean };
export function getWinLength(size: number): number;
export function getWinningLines(size: number): readonly (readonly number[])[];
export function getResult(board: Cell[], size: number): GameResult;
export function chooseMove(board: Cell[], size: number, mark: Mark, difficulty?: Difficulty): number;
