import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Chess, DEFAULT_POSITION } from 'chess.js';
import {
  DEFAULT_CONFIG, TIME_CONTROLS, chessOf, clocksAt, endGame, expireGame,
  formatClock, gamePgn, importGame, makeMove, moveUci, newGame, turnOf,
  uciMove, undoMoves, type GameConfig,
} from '../lib/game.ts';

const START = 1_000_000;
function config(overrides: Partial<GameConfig> = {}): GameConfig {
  return { ...DEFAULT_CONFIG, mode: 'local', time: { minutes: 1, increment: 2, label: '1 + 2' }, ...overrides };
}

test('new local game starts only the side-to-move clock', () => {
  const game = newGame(config(), START);
  assert.equal(game.fen, DEFAULT_POSITION);
  assert.equal(game.clocks.running, 'w');
  assert.equal(game.waiting, false);
  assert.deepEqual(clocksAt(game, START + 5000), { w: 55_000, b: 60_000 });
  assert.deepEqual(game.clocks, { w: 60_000, b: 60_000, anchor: START, running: 'w' });
});

test('black-to-move FEN initializes black clock and board turn consistently', () => {
  const game = newGame(config(), START, '7k/8/8/8/8/8/R7/6K1 b - - 5 20');
  assert.equal(turnOf(game), 'b');
  assert.equal(game.clocks.running, 'b');
  assert.deepEqual(clocksAt(game, START + 4000), { w: 60_000, b: 56_000 });
});

test('moves subtract real elapsed time, add increment once and switch clocks', () => {
  let game = newGame(config(), START);
  game = makeMove(game, { from: 'e2', to: 'e4' }, START + 5000);
  assert.deepEqual(game.clocks, { w: 57_000, b: 60_000, anchor: START + 5000, running: 'b' });
  assert.deepEqual(game.moves[0].clockBefore, { w: 55_000, b: 60_000 });
  assert.equal(game.moves[0].san, 'e4');
  game = makeMove(game, { from: 'e7', to: 'e5' }, START + 9000);
  assert.deepEqual(game.clocks, { w: 57_000, b: 58_000, anchor: START + 9000, running: 'w' });
  assert.equal(game.revision, 2);
});

test('clock snapshots survive JSON reload without gifting elapsed time', () => {
  const game = makeMove(newGame(config(), START), { from: 'e2', to: 'e4' }, START + 1000);
  const restored = JSON.parse(JSON.stringify(game));
  assert.deepEqual(clocksAt(restored, START + 13_000), { w: 61_000, b: 48_000 });
  assert.equal(chessOf(restored).fen(), game.fen);
});

test('a backwards wall-clock observation cannot increase the remaining clock', () => {
  const game = newGame(config(), START);
  assert.deepEqual(clocksAt(game, START - 5000), { w: 60_000, b: 60_000 });
});

test('unlimited games never flag and never accumulate increments', () => {
  let game = newGame(config({ time: TIME_CONTROLS[0] }), START);
  game = makeMove(game, { from: 'e2', to: 'e4' }, START + 999_000);
  assert.deepEqual(clocksAt(game, START + 99_999_000), { w: -1, b: -1 });
  assert.equal(expireGame(game, START + 99_999_000), game);
});

test('waiting online games do not consume time', () => {
  const game = newGame(config({ mode: 'online' }), START);
  assert.equal(game.waiting, true);
  assert.equal(game.clocks.running, null);
  assert.deepEqual(clocksAt(game, START + 99_000), { w: 60_000, b: 60_000 });
  assert.equal(expireGame(game, START + 99_000), game);
  assert.throws(() => makeMove(game, { from: 'e2', to: 'e4' }, START), /Waiting/);
});

test('a move at flag fall cannot be saved by its increment', () => {
  const game = makeMove(newGame(config(), START), { from: 'e2', to: 'e4' }, START + 60_000);
  assert.equal(game.result?.winner, 'b');
  assert.equal(game.result?.reason, 'Time expired');
  assert.equal(game.moves.length, 0);
  assert.equal(game.clocks.w, 0);
  assert.equal(game.clocks.running, null);
});

test('timeout detection is idempotent and freezes both clocks', () => {
  const expired = expireGame(newGame(config(), START), START + 61_000);
  assert.equal(expired.result?.winner, 'b');
  assert.equal(expired.finishedAt, START + 60_000);
  assert.equal(expired.revision, 1);
  assert.equal(expireGame(expired, START + 120_000), expired);
  assert.deepEqual(clocksAt(expired, START + 120_000), { w: 0, b: 60_000 });
});

test('restoring a long-expired game records the flag deadline, not the refresh time', () => {
  const saved = makeMove(newGame(config(), START), uciMove('e2e4'), START + 5000);
  const restored = JSON.parse(JSON.stringify(saved));
  const expired = expireGame(restored, START + 86_400_000);
  assert.equal(expired.finishedAt, START + 65_000);
  assert.equal(expired.result?.winner, 'w');
  assert.equal(expired.clocks.b, 0);
  assert.equal(expired.clocks.w, 57_000);
});

test('timeout is a draw when the opponent has only a king', () => {
  const game = newGame(config(), START, '7k/8/8/8/8/8/8/KQ6 w - - 0 1');
  const expired = expireGame(game, START + 70_000);
  assert.equal(expired.result?.winner, null);
  assert.equal(expired.result?.result, '1/2-1/2');
});

test('illegal moves leave the original game, clocks and revision unchanged', () => {
  const game = newGame(config(), START);
  const before = JSON.stringify(game);
  assert.throws(() => makeMove(game, { from: 'e2', to: 'e5' }, START + 2000), /not legal/);
  assert.throws(() => makeMove(game, { from: 'e7', to: 'e5' }, START + 2000), /not legal/);
  assert.equal(JSON.stringify(game), before);
});

test('checkmate ends immediately and freezes the remaining clocks', () => {
  let game = newGame(config(), START);
  for (const [index, uci] of ['f2f3', 'e7e5', 'g2g4', 'd8h4'].entries()) {
    game = makeMove(game, uciMove(uci), START + (index + 1) * 1000);
  }
  assert.equal(game.result?.winner, 'b');
  assert.equal(game.result?.reason, 'Checkmate');
  assert.equal(game.clocks.running, null);
  assert.equal(game.finishedAt, START + 4000);
  assert.deepEqual(clocksAt(game, START + 30_000), { w: 62_000, b: 62_000 });
  assert.throws(() => makeMove(game, uciMove('e2e3'), START + 6000), /ended/);
});

test('undo restores position, move history, turn and pre-move clock snapshot', () => {
  let game = newGame(config(), START);
  game = makeMove(game, uciMove('e2e4'), START + 5000);
  const whitePosition = game.fen;
  game = makeMove(game, uciMove('e7e5'), START + 9000);
  const undone = undoMoves(game, 1, START + 20_000);
  assert.equal(undone.fen, whitePosition);
  assert.equal(undone.moves.length, 1);
  assert.equal(turnOf(undone), 'b');
  assert.deepEqual(undone.clocks, { w: 57_000, b: 56_000, anchor: START + 20_000, running: 'b' });
  const both = undoMoves(game, 2, START + 20_000);
  assert.equal(both.fen, DEFAULT_POSITION);
  assert.deepEqual(both.clocks, { w: 55_000, b: 60_000, anchor: START + 20_000, running: 'w' });
  assert.equal(game.moves.length, 2);
});

test('undo removes a result and permits a different continuation', () => {
  let game = newGame(config(), START);
  for (const [index, uci] of ['f2f3', 'e7e5', 'g2g4', 'd8h4'].entries()) {
    game = makeMove(game, uciMove(uci), START + (index + 1) * 1000);
  }
  game = undoMoves(game, 1, START + 10_000);
  assert.equal(game.result, null);
  assert.equal(game.finishedAt, null);
  assert.equal(game.clocks.running, 'b');
  game = makeMove(game, uciMove('b8c6'), START + 11_000);
  assert.equal(game.moves.at(-1)?.san, 'Nc6');
  assert.equal(game.result, null);
});

test('PGN export carries players, time control, SAN and result and imports faithfully', () => {
  let game = newGame(config(), START);
  game.players = { w: 'Ada', b: 'Grace' };
  game = makeMove(game, uciMove('e2e4'), START + 1000);
  game = makeMove(game, uciMove('e7e5'), START + 2000);
  game = endGame(game, { winner: null, result: '1/2-1/2', reason: 'Draw by agreement' }, START + 3000);
  const pgn = gamePgn(game);
  assert.ok(pgn.includes('[White "Ada"]'));
  assert.ok(pgn.includes('[TimeControl "60+2"]'));
  assert.ok(pgn.includes('1. e4 e5 1/2-1/2'));
  const restored = importGame(pgn, config());
  assert.deepEqual(restored.players, game.players);
  assert.equal(restored.fen, game.fen);
  assert.equal(restored.result?.result, game.result?.result);
  assert.deepEqual(restored.moves.map((move) => move.san), ['e4', 'e5']);
});

test('FEN import retains setup and legal EP information and becomes an untimed local game', () => {
  const fen = '4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 20';
  const game = importGame(fen, config({ mode: 'ai' }));
  assert.equal(game.initialFen, fen);
  assert.equal(game.fen, fen);
  assert.equal(game.mode, 'local');
  assert.equal(game.clocks.w, -1);
  assert.ok(chessOf(game).moves().includes('exd6'));
  assert.ok(gamePgn(game).includes('[SetUp "1"]'));
});

test('import rejects empty, oversized and invalid game text', () => {
  assert.throws(() => importGame('  ', config()), /Paste/);
  assert.throws(() => importGame('x'.repeat(250001), config()), /too large/);
  assert.throws(() => importGame('1. e4 e5 2. Qh9', config()), /Could not read/);
  assert.throws(() => importGame('8/8/8/8/8/8/8/8 w - - 0 1', config()));
});

test('FEN export after castling and promotion reconstructs identical legal moves', () => {
  let castle = newGame(config(), START, 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  castle = makeMove(castle, uciMove('e1g1'), START + 1000);
  const restoredCastle = new Chess(castle.fen);
  assert.deepEqual(restoredCastle.moves().sort(), chessOf(castle).moves().sort());
  let promotion = newGame(config(), START, '7k/P7/8/8/8/8/8/7K w - - 0 1');
  promotion = makeMove(promotion, uciMove('a7a8r'), START + 1000);
  assert.equal(chessOf(promotion).get('a8')?.type, 'r');
  assert.equal(importGame(gamePgn(promotion), config()).fen, promotion.fen);
});

test('formatting handles unlimited, low time, zero and full minutes', () => {
  assert.equal(formatClock(-1), '∞');
  assert.equal(formatClock(0), '0:00');
  assert.equal(formatClock(9400), '0:09.4');
  assert.equal(formatClock(60_000), '1:00');
  assert.equal(formatClock(61500), '1:02');
  assert.deepEqual(uciMove('a7a8n'), { from: 'a7', to: 'a8', promotion: 'n' });
  assert.equal(moveUci({ from: 'a7', to: 'a8', promotion: 'n' }), 'a7a8n');
});
