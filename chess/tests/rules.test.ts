import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Chess, DEFAULT_POSITION } from 'chess.js';
import {
  automaticResult,
  canPossiblyMate,
  claimDraw,
  claimOptions,
  createChess,
  opposite,
  repetitionCount,
  resignationResult,
  timeoutResult,
} from '../lib/rules.ts';

const cycle = ['Nf3', 'Nf6', 'Ng1', 'Ng8'];
function repeat(chess: Chess, count: number): void {
  for (let i = 0; i < count; i += 1) for (const san of cycle) chess.move(san);
}

test('starting position has 20 legal moves and 400 legal continuations', () => {
  const chess = createChess(DEFAULT_POSITION);
  assert.equal(chess.moves().length, 20);
  let continuations = 0;
  for (const move of chess.moves()) {
    chess.move(move);
    continuations += chess.moves().length;
    chess.undo();
  }
  assert.equal(continuations, 400);
  assert.equal(chess.fen(), DEFAULT_POSITION);
  assert.equal(automaticResult(chess), null);
});

test('wrong turn, impossible movement and moving through a piece are rejected', () => {
  const chess = new Chess();
  assert.throws(() => chess.move({ from: 'e7', to: 'e5' }));
  assert.throws(() => chess.move({ from: 'e2', to: 'e5' }));
  assert.throws(() => chess.move({ from: 'a1', to: 'a4' }));
  assert.equal(chess.history().length, 0);
});

test('a pinned piece cannot expose its king', () => {
  const chess = new Chess('k3r3/8/8/8/8/8/4R3/4K3 w - - 0 1');
  assert.throws(() => chess.move({ from: 'e2', to: 'd2' }));
  assert.ok(chess.moves({ square: 'e2' }).includes('Rxe8+'));
});

test('both castling sides move king and rook and undo completely', () => {
  for (const [san, king, rook] of [['O-O', 'g1', 'f1'], ['O-O-O', 'c1', 'd1']] as const) {
    const chess = new Chess('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
    const before = chess.fen();
    chess.move(san);
    assert.equal(chess.get(king)?.type, 'k');
    assert.equal(chess.get(rook)?.type, 'r');
    assert.equal(chess.getCastlingRights('w').k, false);
    assert.equal(chess.getCastlingRights('w').q, false);
    chess.undo();
    assert.equal(chess.fen(), before);
  }
});

test('cannot castle through check, out of check or after losing castling rights', () => {
  const through = new Chess('k4r2/8/8/8/8/8/8/4K2R w K - 0 1');
  assert.throws(() => through.move('O-O'));
  const inCheck = new Chess('k3r3/8/8/8/8/8/8/4K2R w K - 0 1');
  assert.throws(() => inCheck.move('O-O'));
  const movedRook = new Chess('k7/8/8/8/8/8/8/4K2R w - - 0 1');
  assert.throws(() => movedRook.move('O-O'));
});

test('en passant removes the captured pawn and undo restores the EP right', () => {
  const chess = new Chess();
  for (const san of ['e4', 'a6', 'e5', 'd5']) chess.move(san);
  const before = chess.fen();
  const move = chess.move('exd6');
  assert.equal(move.flags, 'e');
  assert.equal(chess.get('d5'), undefined);
  assert.equal(chess.get('d6')?.color, 'w');
  chess.undo();
  assert.equal(chess.fen(), before);
  assert.ok(chess.moves().includes('exd6'));
});

test('en passant expires and cannot expose the king to a rook', () => {
  const expired = new Chess();
  for (const san of ['e4', 'a6', 'e5', 'd5', 'Nf3', 'a5']) expired.move(san);
  assert.throws(() => expired.move('exd6'));
  const pinned = new Chess('k3r3/8/8/3pP3/8/8/8/4K3 w - d6 0 1');
  assert.throws(() => pinned.move('exd6'));
  assert.equal(pinned.fen().split(' ')[3], '-');
});

test('all four promotions and underpromotions are legal with correct SAN', () => {
  for (const promotion of ['q', 'r', 'b', 'n']) {
    const chess = new Chess('7k/P7/8/8/8/8/8/7K w - - 0 1');
    const move = chess.move({ from: 'a7', to: 'a8', promotion });
    assert.equal(chess.get('a8')?.type, promotion);
    assert.match(move.san, new RegExp(`a8=${promotion.toUpperCase()}`));
    chess.undo();
    assert.equal(chess.get('a7')?.type, 'p');
  }
});

test('checkmate ends the game with a winner', () => {
  const chess = new Chess();
  for (const san of ['f3', 'e5', 'g4', 'Qh4#']) chess.move(san);
  assert.deepEqual(automaticResult(chess), { winner: 'b', reason: 'Checkmate', result: '0-1' });
  assert.deepEqual(claimOptions(chess), { threefold: false, fiftyMove: false });
  assert.equal(chess.history().at(-1), 'Qh4#');
});

test('stalemate is a draw without check', () => {
  const chess = new Chess('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
  assert.equal(chess.inCheck(), false);
  assert.equal(automaticResult(chess)?.reason, 'Stalemate');
});

test('threefold repetition is claimable, not an automatic result', () => {
  const chess = new Chess();
  repeat(chess, 2);
  assert.equal(repetitionCount(chess), 3);
  assert.equal(automaticResult(chess), null);
  assert.deepEqual(claimOptions(chess), { threefold: true, fiftyMove: false });
  assert.equal(claimDraw(chess, 'threefold')?.result, '1/2-1/2');
  assert.equal(claimDraw(chess, 'fifty'), null);
});

test('fifth repetition automatically draws without a player claim', () => {
  const chess = new Chess();
  repeat(chess, 4);
  assert.equal(repetitionCount(chess), 5);
  assert.equal(automaticResult(chess)?.reason, 'Fivefold repetition');
});

test('an intended move can claim the third repetition and never changes the game', () => {
  const chess = new Chess();
  for (const san of [...cycle, 'Nf3', 'Nf6', 'Ng1']) chess.move(san);
  chess.setHeader('White', 'Ada');
  const before = chess.pgn();
  assert.equal(claimOptions(chess).threefold, false);
  assert.equal(claimOptions(chess, { from: 'f6', to: 'g8' }).threefold, true);
  assert.equal(claimDraw(chess, 'threefold', { from: 'f6', to: 'g8' })?.winner, null);
  assert.equal(chess.pgn(), before);
  assert.equal(chess.turn(), 'b');
});

test('invalid intended moves cannot establish a claim or alter the board', () => {
  const chess = new Chess();
  const before = chess.fen();
  assert.deepEqual(claimOptions(chess, { from: 'e2', to: 'e5' }), { threefold: false, fiftyMove: false });
  assert.equal(chess.fen(), before);
  assert.equal(chess.history().length, 0);
});

test('repetition distinguishes lost castling rights', () => {
  const chess = new Chess('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  for (const san of ['Rh2', 'Rh7', 'Rh1', 'Rh8']) chess.move(san);
  assert.equal(repetitionCount(chess), 1);
  for (const san of ['Rh2', 'Rh7', 'Rh1', 'Rh8']) chess.move(san);
  assert.equal(repetitionCount(chess), 2);
  assert.equal(chess.isThreefoldRepetition(), false);
});

test('legal en passant availability changes repetition identity', () => {
  const chess = new Chess('1n2k3/8/8/3pP3/8/8/8/1N2K3 w - d6 0 1');
  for (const san of ['Nc3', 'Nc6', 'Nb1', 'Nb8']) chess.move(san);
  assert.equal(repetitionCount(chess), 1);
  for (const san of ['Nc3', 'Nc6', 'Nb1', 'Nb8']) chess.move(san);
  assert.equal(repetitionCount(chess), 2);
});

test('an unavailable en passant field does not change repetition identity', () => {
  const chess = new Chess('1n2k3/8/8/3p4/8/8/8/1N2K3 w - d6 0 1');
  for (const san of ['Nc3', 'Nc6', 'Nb1', 'Nb8']) chess.move(san);
  assert.equal(repetitionCount(chess), 2);
});

test('fifty moves are claimable and seventy-five moves are automatic', () => {
  const fifty = new Chess('7k/8/8/8/8/8/R7/6K1 w - - 100 70');
  assert.equal(automaticResult(fifty), null);
  assert.equal(claimOptions(fifty).fiftyMove, true);
  assert.equal(claimDraw(fifty, 'fifty')?.reason, 'Fifty-move rule claimed');
  const seventyFive = new Chess('7k/8/8/8/8/8/R7/6K1 w - - 150 95');
  assert.equal(automaticResult(seventyFive)?.reason, 'Seventy-five-move rule');
});

test('a quiet intended move reaches fifty while a pawn move resets the count', () => {
  const chess = new Chess('7k/8/8/8/8/8/RP6/6K1 w - - 99 70');
  assert.equal(claimOptions(chess).fiftyMove, false);
  assert.equal(claimOptions(chess, { from: 'a2', to: 'a3' }).fiftyMove, true);
  assert.equal(claimOptions(chess, { from: 'b2', to: 'b3' }).fiftyMove, false);
  assert.equal(chess.fen().split(' ')[4], '99');
});

test('checkmate on the seventy-fifth move takes precedence over the automatic draw', () => {
  const chess = new Chess('7k/5K2/6Q1/8/8/8/8/8 w - - 149 90');
  chess.move('Qg7#');
  assert.equal(chess.fen().split(' ')[4], '150');
  assert.equal(automaticResult(chess)?.reason, 'Checkmate');
  assert.equal(timeoutResult(chess, 'w').winner, 'w');
});

test('bare kings and one minor versus a king automatically draw', () => {
  for (const fen of [
    '7k/8/8/8/8/8/8/K7 w - - 0 1',
    '7k/8/8/8/8/8/8/KB6 w - - 0 1',
    '7k/8/8/8/8/8/8/KN6 w - - 0 1',
  ]) {
    const chess = new Chess(fen);
    assert.equal(automaticResult(chess)?.result, '1/2-1/2');
    assert.equal(canPossiblyMate(chess, 'w'), false);
    assert.equal(canPossiblyMate(chess, 'b'), false);
  }
});

test('same-color bishops are insufficient, opposite-color bishops permit selfmate', () => {
  const same = new Chess('5b1k/8/8/8/8/8/8/K1B5 w - - 0 1');
  assert.equal(automaticResult(same)?.result, '1/2-1/2');
  const oppositeBishops = new Chess('2b4k/8/8/8/8/8/8/K1B5 w - - 0 1');
  assert.equal(automaticResult(oppositeBishops), null);
  assert.equal(canPossiblyMate(oppositeBishops, 'w'), true);
});

test('two knights may mate a cooperative bare king, so a flag is a loss', () => {
  const chess = new Chess('7k/8/8/8/8/8/8/KNN5 b - - 0 1');
  assert.equal(automaticResult(chess), null);
  assert.equal(canPossiblyMate(chess, 'w'), true);
  assert.equal(timeoutResult(chess, 'b').winner, 'w');
});

test('timeout with a bare king on the other side is a draw even against a queen', () => {
  const chess = new Chess('7k/8/8/8/8/8/8/KQ6 w - - 0 1');
  assert.equal(timeoutResult(chess, 'w').winner, null);
  assert.equal(timeoutResult(chess, 'b').winner, 'w');
});

test('a lone knight cannot mate a king plus queen but can mate using opposing rook support', () => {
  const queen = new Chess('6qk/8/8/8/8/8/8/KN6 b - - 0 1');
  assert.equal(canPossiblyMate(queen, 'w'), false);
  assert.equal(timeoutResult(queen, 'b').winner, null);
  const rook = new Chess('6rk/8/8/8/8/8/8/KN6 b - - 0 1');
  assert.equal(canPossiblyMate(rook, 'w'), true);
  assert.equal(timeoutResult(rook, 'b').winner, 'w');
});

test('resignation uses the impossible-mate exception', () => {
  const chess = new Chess('7k/8/8/8/8/8/8/KQ6 w - - 0 1');
  assert.equal(resignationResult(chess, 'w').winner, null);
  assert.equal(resignationResult(chess, 'b').winner, 'w');
});

test('forced capture of the only rook proves a dead position before the capture', () => {
  const chess = new Chess('8/8/8/8/8/8/r1k5/K7 w - - 0 1');
  assert.deepEqual(chess.moves(), ['Kxa2']);
  assert.equal(chess.isInsufficientMaterial(), false);
  assert.equal(canPossiblyMate(chess, 'b'), false);
  assert.equal(automaticResult(chess)?.reason, 'Dead position');
});

test('a forced capture can invalidate timeout mating material without ending the game', () => {
  const chess = new Chess('7k/8/8/8/8/8/Pb6/KN6 w - - 0 1');
  assert.deepEqual(chess.moves(), ['Kxb2']);
  assert.equal(canPossiblyMate(chess, 'b'), false);
  assert.equal(automaticResult(chess), null);
  assert.equal(timeoutResult(chess, 'w').winner, null);
  assert.equal(chess.history().length, 0);
});

test('undo restores FEN, SAN history, castling, turn and repetition count', () => {
  const chess = new Chess();
  repeat(chess, 2);
  const before = chess.fen();
  const san = chess.history();
  chess.move('e4');
  assert.equal(repetitionCount(chess), 1);
  chess.undo();
  assert.equal(chess.fen(), before);
  assert.deepEqual(chess.history(), san);
  assert.equal(repetitionCount(chess), 3);
});

test('rebuilding from initial FEN and moves preserves history and claims', () => {
  const source = new Chess();
  repeat(source, 2);
  const restored = createChess(DEFAULT_POSITION, source.history({ verbose: true }));
  assert.equal(restored.fen(), source.fen());
  assert.deepEqual(restored.history(), source.history());
  assert.equal(claimOptions(restored).threefold, true);
});

test('PGN round-trip preserves SAN, FEN, result and starting position', () => {
  const chess = new Chess('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  chess.setHeader('White', 'Ada');
  chess.setHeader('Black', 'Grace');
  chess.move('O-O');
  chess.move('O-O-O');
  const pgn = chess.pgn();
  const restored = new Chess();
  restored.loadPgn(pgn);
  assert.equal(restored.fen(), chess.fen());
  assert.deepEqual(restored.history(), chess.history());
  assert.equal(restored.getHeaders().White, 'Ada');
  assert.ok(pgn.includes('[FEN '));
});

test('malformed FEN and PGN fail clearly', () => {
  assert.throws(() => createChess('not a FEN'));
  assert.throws(() => createChess('8/8/8/8/8/8/8/8 w - - 0 1'));
  assert.throws(() => new Chess().loadPgn('1. e4 e5 2. Qh9'));
});

test('color inversion is explicit and deterministic', () => {
  assert.equal(opposite('w'), 'b');
  assert.equal(opposite('b'), 'w');
});
