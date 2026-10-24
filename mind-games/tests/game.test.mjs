import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, resolveRound, result, AdaptiveAI, DIFFICULTIES } from '../lib/game.mjs';

function rng(seed) {
  return () => {
    seed |= 0;
    seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t ^= t + Math.imul(t ^ t >>> 7, 61 | t);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

test('all nine RPS outcomes are correct and antisymmetric', () => {
  const expected = [[0, -1, 1], [1, 0, -1], [-1, 1, 0]];
  for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) {
    assert.equal(result(a, b), expected[a][b]);
    assert.equal(result(a, b) + result(b, a), 0);
  }
  for (const invalid of [-1, 3, 1.5, null, '0', NaN]) assert.throws(() => result(invalid, 0));
});

test('classic ties do not score or prematurely end any series', () => {
  for (const bestOf of [3, 5, 7]) {
    let match = createMatch({ bestOf });
    for (let i = 0; i < 30; i++) match = resolveRound(match, i % 3, i % 3);
    assert.deepEqual(match.scores, [0, 0]);
    assert.equal(match.winner, null);
    assert.equal(match.round, 31);
    for (let i = 0; i < Math.floor(bestOf / 2); i++) match = resolveRound(match, 1, 0);
    assert.equal(match.winner, null);
    match = resolveRound(match, 2, 1);
    assert.equal(match.winner, 0);
    assert.equal(match.scores[0], match.target);
    assert.equal(resolveRound(match, 0, 1), match);
  }
});

test('resolving a round leaves all previous state immutable', () => {
  const match = createMatch({ bestOf: 7, variant: 'mind' });
  const before = structuredClone(match);
  const next = resolveRound(match, 0, 2, true, false);
  assert.deepEqual(match, before);
  assert.deepEqual(next.scores, [2, 0]);
  assert.deepEqual(next.boostsLeft, [false, true]);
  assert.deepEqual(next.history[0], {
    round: 1, moves: [0, 2], boosts: [true, false], winner: 0, delta: [2, 0], scores: [2, 0],
  });
  assert.notEqual(next.history, match.history);
  assert.notEqual(next.scores, match.scores);
});

test('a double-points boost is spent on a tie, cannot be reused, and has no classic effect', () => {
  let match = createMatch({ variant: 'mind' });
  match = resolveRound(match, 0, 0, true, false);
  assert.deepEqual(match.scores, [0, 0]);
  assert.deepEqual(match.boostsLeft, [false, true]);
  match = resolveRound(match, 1, 0, true, false);
  assert.deepEqual(match.scores, [1, 0]);
  assert.deepEqual(match.history[1].boosts, [false, false]);
  match = resolveRound(match, 1, 2, false, true);
  assert.deepEqual(match.scores, [1, 2]);
  assert.deepEqual(match.boostsLeft, [false, false]);
  const classic = resolveRound(createMatch(), 0, 2, true, true);
  assert.deepEqual(classic.scores, [1, 0]);
  assert.deepEqual(classic.history[0].boosts, [false, false]);
});

test('a boost can cross the winning target and the opponent cannot also score', () => {
  let match = createMatch({ bestOf: 3, variant: 'mind' });
  match = resolveRound(match, 2, 1);
  match = resolveRound(match, 2, 1, true, true);
  assert.deepEqual(match.scores, [3, 0]);
  assert.equal(match.winner, 0);
  assert.deepEqual(match.boostsLeft, [false, false]);
});

test('invalid series and modes are rejected', () => {
  assert.throws(() => createMatch({ bestOf: 4 }));
  assert.throws(() => createMatch({ variant: 'unknown' }));
});

test('every difficulty uses only observed history and returns valid legal moves', () => {
  for (const difficulty of DIFFICULTIES) {
    const ai = new AdaptiveAI({ difficulty, rng: rng(17) });
    for (let i = 0; i < 200; i++) {
      const before = ai.exportHistory();
      const move = ai.choose();
      assert.ok([0, 1, 2].includes(move));
      assert.deepEqual(ai.exportHistory(), before, 'choosing must not invent or change observations');
      ai.observe(i % 3, move);
    }
    assert.equal(ai.history.length, 100);
    const exported = ai.exportHistory();
    exported[0].player = 99;
    assert.notEqual(ai.history[0].player, 99);
  }
});

test('Expert exploits repeating and cycling players', () => {
  for (const strategy of [() => 0, (i) => i % 3, (i) => [0, 0, 1, 2][i % 4]]) {
    const ai = new AdaptiveAI({ difficulty: 'Expert', rng: rng(711) });
    let wins = 0;
    for (let i = 0; i < 500; i++) {
      const choice = ai.choose();
      const player = strategy(i); // Chosen after the bot has already committed.
      if (i >= 30 && result(choice, player) === 1) wins++;
      ai.observe(player, choice);
    }
    assert.ok(wins / 470 > 0.8, `Expert win rate ${wins / 470} should exploit the learned pattern.`);
  }
});

test('Expert cannot outperform chance against independent uniform random choices', () => {
  const ai = new AdaptiveAI({ difficulty: 'Expert', rng: rng(123456) });
  const playerRng = rng(89101112);
  const counts = { win: 0, lose: 0, tie: 0 };
  const rounds = 6000;
  for (let i = 0; i < rounds; i++) {
    const choice = ai.choose();
    const player = Math.floor(playerRng() * 3);
    const outcome = result(choice, player);
    counts[outcome === 1 ? 'win' : outcome === -1 ? 'lose' : 'tie']++;
    ai.observe(player, choice);
  }
  for (const count of Object.values(counts)) assert.ok(Math.abs(count / rounds - 1 / 3) < 0.025, JSON.stringify(counts));
});

test('imported AI history is validated and bounded', () => {
  const history = Array.from({ length: 140 }, (_, i) => ({ player: i % 3, ai: (i + 1) % 3 }));
  history.push({ player: -1, ai: 0 }, { player: 0, ai: 4 }, null);
  const ai = new AdaptiveAI({ difficulty: 'expert', history });
  assert.equal(ai.difficulty, 'Expert');
  assert.equal(ai.history.length, 100);
  assert.throws(() => ai.observe(4, 0));
});
