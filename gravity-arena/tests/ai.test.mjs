import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, applyMove, getLegalMoves, getDimensions } from '../public/game/engine.js';
import { chooseMove } from '../public/game/ai.js';

const play = (variant, sequence) => sequence.reduce((state, stack) => applyMove(state, stack), createGame(variant));
const strongLevels = ['medium','hard','expert'];

for (const variant of ['3d','classic']) {
  const { stacks, height } = getDimensions(variant);
  for (const difficulty of ['beginner','easy',...strongLevels]) {
    test(`${variant} ${difficulty}: returns legal moves without changing the input`, () => {
      const state = play(variant, Array(height).fill(0));
      const before = JSON.stringify(state);
      const choice = chooseMove(state, difficulty, { timeLimitMs: 35, seed: 22 });
      assert.ok(getLegalMoves(state).includes(choice.stack));
      assert.notEqual(choice.stack, 0);
      assert.equal(JSON.stringify(state), before);
      assert.ok(Number.isFinite(choice.score));
      assert.ok(choice.nodes >= 0);
    });
  }
  for (const difficulty of ['easy',...strongLevels]) {
    test(`${variant} ${difficulty}: takes an immediate win`, () => {
      const state = play(variant, [0,stacks - 1,1,stacks - 1,2,stacks - 2]);
      const choice = chooseMove(state, difficulty, { seed: 16, timeLimitMs: 50 });
      assert.equal(choice.stack, 3);
      assert.equal(applyMove(state, choice.stack).winner, 1);
    });
  }
  for (const difficulty of strongLevels) {
    test(`${variant} ${difficulty}: blocks an immediate loss`, () => {
      const state = play(variant, [stacks - 1,0,stacks - 1,1,stacks - 2,2]);
      const choice = chooseMove(state, difficulty, { seed: 16, timeLimitMs: 50 });
      assert.equal(choice.stack, 3);
    });
  }
  test(`${variant}: all levels reject finished games`, () => {
    const state = play(variant, [0,stacks - 1,1,stacks - 1,2,stacks - 2,3]);
    for (const difficulty of ['beginner','easy',...strongLevels]) assert.throws(() => chooseMove(state, difficulty), /legal moves/);
  });
}

test('Expert search respects its time budget and returns a completed iteration', () => {
  const start = performance.now();
  const result = chooseMove(play('3d', [5,10,6,9]), 'expert', { timeLimitMs: 90, seed: 4 });
  const elapsed = performance.now() - start;
  assert.ok(elapsed < 450, `90ms search took ${Math.round(elapsed)}ms`);
  assert.ok(result.depth >= 1);
  assert.ok(result.nodes > 0);
});

test('Beginner makes varied, reproducible strategic choices', () => {
  const state = play('classic', [0,6,1,6,2,5]);
  const choices = new Set();
  for (let seed = 1; seed < 30; seed++) choices.add(chooseMove(state, 'beginner', { seed }).stack);
  assert.ok(choices.size >= 3);
  assert.deepEqual(chooseMove(state, 'beginner', { seed: 22 }), chooseMove(state, 'beginner', { seed: 22 }));
});

test('Medium avoids giving the opponent a supported winning square', () => {
  // Red has three pieces at y=1. Playing under its final square loses next turn.
  const state = createGame('classic');
  state.board[7] = state.board[8] = state.board[9] = 2;
  state.board[0] = state.board[1] = 1; state.board[2] = 2;
  state.heights[0] = state.heights[1] = state.heights[2] = 2;
  state.moves = Array(6).fill({ stack:0,index:0,player:1,ply:1 });
  const choice = chooseMove(state, 'medium', { timeLimitMs: 180, seed: 2 });
  assert.notEqual(choice.stack, 3);
});

test('AI self-play stays legal and reaches a complete result in both variants', () => {
  for (const variant of ['3d','classic']) {
    let state = createGame(variant);
    for (let ply = 0; state.winner === null; ply++) {
      assert.ok(ply < getDimensions(variant).cells);
      const move = chooseMove(state, ply % 2 ? 'easy' : 'medium', { timeLimitMs: 12, seed: ply + 7 });
      assert.ok(getLegalMoves(state).includes(move.stack));
      state = applyMove(state, move.stack);
    }
    assert.ok([0,1,2].includes(state.winner));
  }
});
