import { Chess, DEFAULT_POSITION, type Color, type PieceSymbol } from 'chess.js';
import { randomId } from './id';
import { automaticResult, createChess, opposite, timeoutResult, type GameResult, type MoveInput } from './rules';

export type Mode = 'ai' | 'local' | 'online';
export interface TimeControl { minutes: number; increment: number; label: string }
export const TIME_CONTROLS: TimeControl[] = [
  { minutes: 0, increment: 0, label: 'Unlimited' },
  { minutes: 1, increment: 0, label: '1 min' },
  { minutes: 2, increment: 1, label: '2 + 1' },
  { minutes: 3, increment: 0, label: '3 min' },
  { minutes: 3, increment: 2, label: '3 + 2' },
  { minutes: 5, increment: 0, label: '5 min' },
  { minutes: 10, increment: 0, label: '10 min' },
  { minutes: 15, increment: 10, label: '15 + 10' },
  { minutes: 30, increment: 0, label: '30 min' },
];
export interface GameConfig {
  mode: Mode;
  difficulty: number;
  color: Color | 'random';
  time: TimeControl;
  nickname: string;
  hints: boolean;
  takebacks: boolean;
  autoRotate: boolean;
  thinkMs: number;
}
export const DEFAULT_CONFIG: GameConfig = {
  mode: 'ai', difficulty: 2, color: 'w', time: TIME_CONTROLS[6], nickname: 'You',
  hints: true, takebacks: true, autoRotate: false, thinkMs: 900,
};
export interface Ply extends MoveInput {
  color: Color; san: string; fen: string; before: string; flags: string;
  piece: PieceSymbol; captured?: PieceSymbol; clockBefore: { w: number; b: number }; movedAt: number;
}
export interface ClockState { w: number; b: number; running: Color | null; anchor: number }
export interface Game {
  id: string; mode: Mode; config: GameConfig; humanColor: Color; initialFen: string; fen: string;
  moves: Ply[]; clocks: ClockState; result: GameResult | null; waiting: boolean;
  players: Record<Color, string>; startedAt: number; finishedAt: number | null;
  drawOffer: Color | null; rematchBy: Color[]; revision: number; gameNumber: number;
}

export function newGame(config: GameConfig, now = Date.now(), initialFen = DEFAULT_POSITION): Game {
  const chess = new Chess(initialFen);
  const color: Color = config.color === 'random' ? (Math.random() < .5 ? 'w' : 'b') : config.color;
  const base = config.time.minutes ? config.time.minutes * 60000 : -1;
  const players = config.mode === 'ai'
    ? { [color]: config.nickname || 'You', [opposite(color)]: 'Computer' } as Record<Color, string>
    : { w: config.mode === 'online' && color === 'w' ? config.nickname : 'White', b: config.mode === 'online' && color === 'b' ? config.nickname : 'Black' };
  const result = automaticResult(chess);
  return {
    id: randomId(), mode: config.mode, config: { ...config }, humanColor: color,
    initialFen, fen: chess.fen(), moves: [], clocks: { w: base, b: base, anchor: now, running: result || config.mode === 'online' ? null : chess.turn() },
    result, waiting: config.mode === 'online', players, startedAt: now, finishedAt: result ? now : null,
    drawOffer: null, rematchBy: [], revision: 0, gameNumber: 1,
  };
}

export function chessOf(game: Game): Chess { return createChess(game.initialFen, game.moves); }
export function turnOf(game: Game): Color { return game.fen.split(' ')[1] as Color; }
export function clocksAt(game: Game, now = Date.now()): { w: number; b: number } {
  const clocks = { w: game.clocks.w, b: game.clocks.b };
  const side = game.clocks.running;
  if (side && !game.result && !game.waiting && clocks[side] >= 0)
    clocks[side] = Math.max(0, clocks[side] - Math.max(0, now - game.clocks.anchor));
  return clocks;
}
export function endGame(game: Game, result: GameResult, now = Date.now()): Game {
  return { ...game, result, finishedAt: now, drawOffer: null, clocks: { ...clocksAt(game, now), running: null, anchor: now }, revision: game.revision + 1 };
}
export function expireGame(game: Game, now = Date.now()): Game {
  if (game.result || game.waiting || !game.clocks.running || game.clocks.w < 0) return game;
  const side = game.clocks.running;
  // Flag-fall happened at the stored deadline, even if a sleeping tab or a
  // disconnected client does not observe it until much later.
  const flagAt = game.clocks.anchor + game.clocks[side];
  return clocksAt(game, now)[side] <= 0 ? endGame(game, timeoutResult(chessOf(game), side), flagAt) : game;
}
export function makeMove(game: Game, input: MoveInput, now = Date.now()): Game {
  if (game.result) throw new Error('This game has ended.');
  if (game.waiting) throw new Error('Waiting for your opponent.');
  const alive = expireGame(game, now);
  if (alive.result) return alive;
  const chess = chessOf(game);
  const before = chess.fen();
  const clockBefore = clocksAt(game, now);
  let move;
  try { move = chess.move(input); } catch { throw new Error('That move is not legal.'); }
  const clocks = { ...clockBefore };
  if (clocks[move.color] >= 0) clocks[move.color] += game.config.time.increment * 1000;
  const result = automaticResult(chess);
  return {
    ...game, fen: chess.fen(), result, finishedAt: result ? now : null,
    moves: [...game.moves, { from: move.from, to: move.to, ...(move.promotion ? { promotion: move.promotion } : {}), san: move.san, color: move.color, piece: move.piece, captured: move.captured, flags: move.flags, before, fen: chess.fen(), clockBefore, movedAt: now }],
    clocks: { ...clocks, anchor: now, running: result ? null : chess.turn() },
    drawOffer: game.drawOffer === move.color ? game.drawOffer : null,
    revision: game.revision + 1,
  };
}
export function undoMoves(game: Game, count = 1, now = Date.now()): Game {
  if (!game.moves.length) return game;
  const target = Math.max(0, game.moves.length - count);
  const undone = game.moves[target];
  const moves = game.moves.slice(0, target);
  const chess = createChess(game.initialFen, moves);
  return { ...game, moves, fen: chess.fen(), result: null, finishedAt: null, drawOffer: null,
    clocks: { ...undone.clockBefore, running: chess.turn(), anchor: now }, revision: game.revision + 1 };
}
export function gamePgn(game: Game): string {
  const chess = chessOf(game);
  chess.header('Event', game.mode === 'online' ? 'CHESS · Private match' : game.mode === 'ai' ? 'CHESS · Computer match' : 'CHESS · Local match');
  chess.header('Site', 'CHESS');
  chess.header('Date', new Date(game.startedAt).toISOString().slice(0, 10).replaceAll('-', '.'));
  chess.header('White', game.players.w); chess.header('Black', game.players.b);
  chess.header('Result', game.result?.result ?? '*');
  chess.header('TimeControl', game.config.time.minutes ? `${game.config.time.minutes * 60}+${game.config.time.increment}` : '-');
  return chess.pgn();
}
export function importGame(text: string, config: GameConfig): Game {
  const input = text.trim();
  if (!input) throw new Error('Paste a FEN position or a PGN game first.');
  if (input.length > 250000) throw new Error('This game file is too large.');
  if (!input.includes('\n') && /^[prnbqkPRNBQK1-8/]+\s[wb]\s/.test(input))
    return newGame({ ...config, mode: 'local', time: TIME_CONTROLS[0] }, Date.now(), input);
  const chess = new Chess();
  try { chess.loadPgn(input, { strict: false }); } catch { throw new Error('Could not read this PGN. Check the moves and headers.'); }
  const history = chess.history({ verbose: true });
  const initial = history[0]?.before ?? chess.getHeaders().FEN ?? DEFAULT_POSITION;
  let game = newGame({ ...config, mode: 'local', time: TIME_CONTROLS[0] }, Date.now(), initial);
  for (const move of history) game = makeMove(game, move);
  const headers = chess.getHeaders();
  game.players = { w: headers.White ?? 'White', b: headers.Black ?? 'Black' };
  if (!game.result && ['1-0', '0-1', '1/2-1/2'].includes(headers.Result)) {
    const result = headers.Result as GameResult['result'];
    game = endGame(game, { winner: result === '1-0' ? 'w' : result === '0-1' ? 'b' : null, reason: 'Imported game', result });
  }
  return game;
}
export function formatClock(ms: number): string {
  if (ms < 0) return '∞';
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  if (ms > 0 && ms < 10000) return `0:${Math.floor(ms / 1000).toString().padStart(2, '0')}.${Math.floor(ms % 1000 / 100)}`;
  return `${minutes}:${(seconds % 60).toString().padStart(2, '0')}`;
}
export function uciMove(uci: string): MoveInput { return { from: uci.slice(0, 2), to: uci.slice(2, 4), ...(uci[4] ? { promotion: uci[4] } : {}) }; }
export function moveUci(move: MoveInput): string { return move.from + move.to + (move.promotion ?? ''); }

