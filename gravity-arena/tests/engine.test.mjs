import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, applyMove, getDimensions, getWinningLines, getLegalMoves, indexToPosition, stackLabel, undoMoves, restoreGame } from '../public/game/engine.js';

const play = (variant, sequence, first = 1) => sequence.reduce((state, stack) => applyMove(state, stack), createGame(variant, first));
const DRAW_CLASSIC = [4,5,6,3,3,2,6,6,6,4,2,4,0,0,1,2,6,4,6,5,3,5,4,2,3,2,5,1,4,0,1,0,2,5,1,5,1,3,0,3,0,1];
const DRAW_3D = [0,3,1,6,0,2,11,2,5,7,15,11,12,8,5,4,14,8,2,7,14,9,15,1,9,13,3,1,14,0,3,3,8,1,13,8,15,5,0,15,13,7,13,10,5,14,4,12,2,10,6,9,7,10,4,6,6,12,9,12,10,4,11,11];

test('enumerates exactly 76 unique 3D lines in all 13 directions', () => {
  const lines = getWinningLines('3d');
  assert.equal(lines.length, 76);
  assert.equal(new Set(lines.map(line => [...line].sort((a,b) => a-b).join(','))).size, 76);
  const directions = new Set();
  for (const line of lines) {
    const positions = line.map(cell => indexToPosition(cell, '3d'));
    const direction = ['x','y','z'].map(axis => positions[1][axis] - positions[0][axis]);
    directions.add(direction.join(','));
    assert.equal(new Set(line).size, 4);
    for (let i = 1; i < 4; i++) for (let axis = 0; axis < 3; axis++) assert.equal(positions[i][['x','y','z'][axis]], positions[0][['x','y','z'][axis]] + i * direction[axis]);
  }
  assert.equal(directions.size, 13);
  for (const direction of ['1,0,0','0,1,0','0,0,1','1,1,0','1,-1,0','1,0,1','1,0,-1','0,1,1','0,1,-1','1,1,1','1,1,-1','1,-1,1','1,-1,-1']) assert.ok(directions.has(direction));
});

test('enumerates all 69 classic winning lines', () => {
  const lines = getWinningLines('classic');
  assert.equal(lines.length, 69);
  assert.equal(new Set(lines.map(line => line.join(','))).size, 69);
});

// Geometry fixtures fill supports below a line, then make its final legal drop.
// This exercises actual applyMove detection for every individual line, not just enumeration.
for (const variant of ['3d','classic']) {
  for (const [n, line] of getWinningLines(variant).entries()) {
    test(`${variant}: detects winning line ${n + 1} on its final drop`, () => {
      const state = createGame(variant);
      const { stacks } = getDimensions(variant);
      const target = line[3];
      for (const cell of line) {
        const stack = cell % stacks;
        const y = Math.floor(cell / stacks);
        for (let h = 0; h < y; h++) state.board[stack + stacks * h] = 2;
        state.board[cell] = cell === target ? 0 : 1;
        state.heights[stack] = y + (cell === target ? 0 : 1);
      }
      for (const cell of line.slice(0, 3)) state.board[cell] = 1;
      state.moves = Array.from({ length: state.board.filter(Boolean).length }, (_, i) => ({ stack: 0, index: 0, player: i % 2 + 1, ply: i + 1 }));
      const next = applyMove(state, target % stacks);
      assert.equal(next.winner, 1);
      assert.ok(next.winningLines.some(found => found.join(',') === line.join(',')));
      assert.equal(next.board[target], 1);
    });
  }
}

test('gravity chooses the lowest cell and never mutates prior state', () => {
  const a = createGame('3d');
  const b = applyMove(a, 5);
  const c = applyMove(b, 5);
  assert.equal(b.moves[0].index, 5);
  assert.equal(c.moves[1].index, 21);
  assert.equal(c.heights[5], 2);
  assert.equal(a.board[5], 0);
  assert.equal(a.heights[5], 0);
  assert.equal(b.board[21], 0);
  assert.equal(c.turn, 1);
});

test('rejects invalid coordinates, occupied stacks, and terminal moves', () => {
  for (const variant of ['3d','classic']) {
    const { stacks, height } = getDimensions(variant);
    for (const illegal of [-1, stacks, 1.2, NaN, Infinity, '1', null]) assert.throws(() => applyMove(createGame(variant), illegal));
    const full = play(variant, Array(height).fill(0));
    assert.throws(() => applyMove(full, 0), /full/);
    assert.ok(!getLegalMoves(full).includes(0));
    const won = play(variant, [0,stacks - 1,1,stacks - 1,2,stacks - 2,3]);
    assert.equal(won.winner, 1);
    assert.deepEqual(getLegalMoves(won), []);
    assert.throws(() => applyMove(won, 0), /finished/);
  }
});

test('detects legal, fully played draws in both variants', () => {
  for (const [variant, sequence] of [['classic', DRAW_CLASSIC], ['3d', DRAW_3D]]) {
    let state = createGame(variant);
    sequence.forEach((stack, i) => {
      state = applyMove(state, stack);
      assert.equal(state.winner, i === sequence.length - 1 ? 0 : null);
    });
    assert.equal(state.board.filter(Boolean).length, getDimensions(variant).cells);
    assert.deepEqual(state.winningLines, []);
    assert.deepEqual(getLegalMoves(state), []);
    assert.deepEqual(restoreGame(JSON.parse(JSON.stringify(state))), state);
  }
});

test('does not wrap x edges into the next z row', () => {
  const state = play('3d', [1,15,2,15,3,14,4]);
  assert.equal(state.winner, null);
});

test('records more than one winning line on a single drop', () => {
  const state = createGame('3d');
  for (const cell of [0,1,2,7,11,15]) state.board[cell] = 1;
  state.heights = state.board.slice(0,16).map(Boolean).map(Number);
  state.moves = Array(6).fill({ stack: 0, index: 0, player: 1, ply: 1 });
  const result = applyMove(state, 3);
  assert.equal(result.winner, 1);
  assert.equal(result.winningLines.length, 2);
});

test('alternates starting players and undoes through wins', () => {
  const state = play('classic', [0,6,1,6,2,5,3], 2);
  assert.equal(state.winner, 2);
  const undone = undoMoves(state, 2);
  assert.equal(undone.moves.length, 5);
  assert.equal(undone.winner, null);
  assert.equal(undone.turn, 1);
  assert.equal(undone.startingPlayer, 2);
  assert.deepEqual(undoMoves(state, 100), createGame('classic', 2));
  assert.deepEqual(undoMoves(state, 0), state);
});

test('validates saved games by replay and rejects tampered state', () => {
  const state = play('3d', [0,1,0,4,5,4]);
  assert.deepEqual(restoreGame(JSON.parse(JSON.stringify(state))), state);
  for (const edit of [s => s.board[7] = 1, s => s.heights[0] = 3, s => s.turn = 2, s => s.winner = 1, s => s.moves[0].index = 4, s => s.moves[0].player = 2, s => s.moves[0].ply = 99, s => s.moves[0].stack = 99]) {
    const bad = structuredClone(state); edit(bad); assert.throws(() => restoreGame(bad));
  }
  assert.throws(() => restoreGame(null));
  assert.throws(() => restoreGame({ variant: 'invalid', moves: [] }));
});

test('labels and cell coordinates match the placement controls', () => {
  assert.equal(stackLabel(0, '3d'), 'A1');
  assert.equal(stackLabel(15, '3d'), 'D4');
  assert.equal(stackLabel(6, 'classic'), '7');
  assert.deepEqual(indexToPosition(63, '3d'), { x: 3, y: 3, z: 3 });
  assert.deepEqual(indexToPosition(41, 'classic'), { x: 6, y: 5, z: 0 });
  assert.throws(() => createGame('invalid'));
  assert.throws(() => createGame('3d', 0));
});
