import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseMove, getResult, getWinningLines, getWinLength } from '../public/engine.js';
import { createMatch, applyMove, nextRound, restartMatch } from '../lib/match.js';

const other = mark => mark === 'X' ? 'O' : 'X';
const emptyMoves = board => board.flatMap((value, index) => value === null ? [index] : []);

test('rules enumerate every contiguous win without wrapping rows', () => {
  assert.equal(getWinLength(3), 3);
  assert.equal(getWinLength(4), 4);
  assert.equal(getWinLength(5), 4);
  assert.equal(getWinningLines(3).length, 8);
  assert.equal(getWinningLines(4).length, 10);
  assert.equal(getWinningLines(5).length, 28);
  for (const size of [3, 4, 5]) {
    const unique = new Set();
    for (const line of getWinningLines(size)) {
      assert.equal(line.length, getWinLength(size));
      assert.equal(new Set(line).size, line.length);
      assert.ok(line.every(index => index >= 0 && index < size * size));
      assert.ok(!unique.has(line.join(',')));
      unique.add(line.join(','));
      for (const mark of ['X', 'O']) {
        const board = Array(size * size).fill(null);
        line.forEach(index => board[index] = mark);
        assert.equal(getResult(board, size).winner, mark);
        board[line.at(-1)] = null;
        assert.equal(getResult(board, size).winner, null);
      }
    }
  }
  const wrapped = Array(25).fill(null);
  [3, 4, 5, 6].forEach(i => wrapped[i] = 'X');
  assert.equal(getResult(wrapped, 5).winner, null);
  const offsetDiagonal = Array(25).fill(null);
  [1, 7, 13, 19].forEach(i => offsetDiagonal[i] = 'O');
  assert.equal(getResult(offsetDiagonal, 5).winner, 'O');
  assert.throws(() => getWinLength(6));
  assert.throws(() => getResult([null], 3));
});

test('Impossible cannot lose against any legal human continuation, with either starter and mark', () => {
  let terminals = 0;
  function walk(board, turn, computer) {
    const result = getResult(board, 3);
    if (result.winner || result.draw) {
      assert.notEqual(result.winner, other(computer), `Computer ${computer} lost: ${board}`);
      terminals++;
      return;
    }
    const choices = turn === computer ? [chooseMove(board, 3, computer, 'impossible')] : emptyMoves(board);
    for (const move of choices) {
      assert.equal(board[move], null);
      const next = [...board];
      next[move] = turn;
      walk(next, other(turn), computer);
    }
  }
  for (const starter of ['X', 'O']) {
    for (const computer of ['X', 'O']) walk(Array(9).fill(null), starter, computer);
  }
  assert.ok(terminals > 500, `Only ${terminals} terminal continuations checked`);
});

test('Impossible chooses an optimal outcome in every reachable 3×3 position', () => {
  // An independent win/draw/loss oracle does not share the production minimax cache.
  const cache = new Map();
  function oracle(board, turn) {
    const key = board.map(value => value || '-').join('') + turn;
    if (cache.has(key)) return cache.get(key);
    const result = getResult(board, 3);
    if (result.winner) return result.winner === turn ? 1 : -1;
    if (result.draw) return 0;
    let best = -2;
    for (const move of emptyMoves(board)) {
      const next = [...board];
      next[move] = turn;
      best = Math.max(best, -oracle(next, other(turn)));
    }
    cache.set(key, best);
    return best;
  }
  const seen = new Set();
  let checked = 0;
  function visit(board, turn) {
    const key = board.map(value => value || '-').join('') + turn;
    if (seen.has(key)) return;
    seen.add(key);
    const result = getResult(board, 3);
    if (result.winner || result.draw) {
      assert.equal(chooseMove(board, 3, turn, 'impossible'), -1);
      return;
    }
    const snapshot = [...board];
    const move = chooseMove(board, 3, turn, 'impossible');
    assert.equal(board[move], null);
    assert.deepEqual(board, snapshot);
    const played = [...board];
    played[move] = turn;
    assert.equal(-oracle(played, other(turn)), oracle(board, turn), `${key}: ${move} was suboptimal`);
    checked++;
    for (const index of emptyMoves(board)) {
      const next = [...board];
      next[index] = turn;
      visit(next, other(turn));
    }
  }
  visit(Array(9).fill(null), 'X');
  visit(Array(9).fill(null), 'O');
  assert.ok(checked > 8000, `${checked} states`);
});

test('every difficulty returns legal immutable moves; larger AI wins and blocks', () => {
  for (const size of [3, 4, 5]) {
    const board = Array(size * size).fill(null);
    board[0] = 'X';
    board[size + 1] = 'O';
    for (const difficulty of ['easy', 'medium', 'hard', 'impossible']) {
      const before = [...board];
      const start = performance.now();
      const move = chooseMove(board, size, 'X', difficulty);
      assert.ok(Number.isInteger(move) && move >= 0 && move < board.length);
      assert.equal(board[move], null);
      assert.deepEqual(board, before);
      assert.ok(performance.now() - start < 900, 'AI exceeded its bounded search budget');
    }
    for (const difficulty of ['hard', 'impossible']) {
      const threat = Array(size * size).fill(null);
      for (let i = 0; i < getWinLength(size) - 1; i++) threat[i] = 'X';
      assert.equal(chooseMove(threat, size, 'X', difficulty), getWinLength(size) - 1);
      assert.equal(chooseMove(threat, size, 'O', difficulty), getWinLength(size) - 1);
    }
  }
  assert.throws(() => chooseMove(Array(9).fill(null), 3, 'Y', 'hard'));
  assert.throws(() => chooseMove(Array(9).fill(null), 3, 'X', 'extreme'));
});

test('Easy makes mistakes while Impossible takes the win', () => {
  const original = Math.random;
  const board = ['X', 'X', null, 'O', null, null, 'O', null, null];
  try {
    Math.random = () => 0.5;
    assert.notEqual(chooseMove(board, 3, 'X', 'easy'), 2);
    assert.equal(chooseMove(board, 3, 'X', 'medium'), 2);
    assert.equal(chooseMove(board, 3, 'X', 'hard'), 2);
    assert.equal(chooseMove(board, 3, 'X', 'impossible'), 2);
  } finally {
    Math.random = original;
  }
});

test('match transitions count wins once, alternate starters, and preserve prior state', () => {
  let state = createMatch({ size: 3, length: 3 });
  const first = structuredClone(state);
  assert.throws(() => nextRound(state));
  for (const move of [0, 3, 1, 4, 2]) state = applyMove(state, move);
  assert.deepEqual(createMatch(), first);
  assert.equal(state.winner, 'X');
  assert.deepEqual(state.line, [0, 1, 2]);
  assert.deepEqual(state.scores, { X: 1, O: 0, draw: 0 });
  assert.equal(state.matchWinner, null);
  assert.throws(() => applyMove(state, 8));
  const won = structuredClone(state);
  state = nextRound(state);
  assert.equal(state.turn, 'O');
  assert.equal(state.starter, 'O');
  assert.equal(state.round, 2);
  assert.equal(won.winner, 'X');
  for (const move of [3, 0, 4, 1, 8, 2]) state = applyMove(state, move);
  assert.equal(state.winner, 'X');
  assert.equal(state.matchWinner, 'X');
  assert.deepEqual(state.scores, { X: 2, O: 0, draw: 0 });
  assert.throws(() => nextRound(state));
  assert.deepEqual(restartMatch(state), first);
});

test('draws are counted, endless has no match winner, and illegal moves cannot mutate state', () => {
  let state = createMatch({ size: 3, length: 0 });
  const initial = structuredClone(state);
  for (const bad of [-1, 9, 1.5, null, '0', NaN]) assert.throws(() => applyMove(state, bad));
  assert.deepEqual(state, initial);
  for (const move of [0, 1, 2, 4, 3, 5, 7, 6, 8]) state = applyMove(state, move);
  assert.equal(state.draw, true);
  assert.equal(state.winner, null);
  assert.equal(state.matchWinner, null);
  assert.equal(state.scores.draw, 1);
  state = nextRound(state);
  assert.equal(state.scores.draw, 1);
  assert.equal(state.target, null);
  for (const move of [0, 3, 1, 4, 2]) state = applyMove(state, move);
  assert.equal(state.winner, 'O');
  assert.equal(state.matchWinner, null);
  assert.equal(state.scores.O, 1);
  assert.equal(createMatch({ length: 5 }).target, 3);
  assert.equal(createMatch({ length: 7 }).target, 4);
  assert.throws(() => createMatch({ length: 4 }));
  const occupied = applyMove(createMatch(), 0);
  const snapshot = structuredClone(occupied);
  assert.throws(() => applyMove(occupied, 0));
  assert.deepEqual(occupied, snapshot);
});

test('worker protocol returns correlated legal moves and recoverable errors', async () => {
  const messages = [];
  globalThis.self = { postMessage: message => messages.push(message) };
  await import('../public/ai-worker.js');
  self.onmessage({ data: { id: 17, board: Array(9).fill(null), size: 3, mark: 'O', difficulty: 'impossible' } });
  assert.equal(messages[0].id, 17);
  assert.ok(messages[0].move >= 0 && messages[0].move < 9);
  self.onmessage({ data: { id: 18, board: [], size: 3, mark: 'X', difficulty: 'hard' } });
  assert.equal(messages[1].id, 18);
  assert.equal(messages[1].move, -1);
  assert.ok(messages[1].error);
  delete globalThis.self;
});
