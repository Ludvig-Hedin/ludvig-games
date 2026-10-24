import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error Native Node TypeScript execution resolves explicit .ts paths.
import { SHIPS, DIFFICULTIES, newGame, cellsFor, isValidPlacement, validateFleet, randomFleet, placeFleet, fireShot, fleetRemaining, chooseAIShot } from '../lib/game.ts';
import type { Fleet, GameState, Shot, Difficulty } from '../lib/game';

const aligned: Fleet = SHIPS.map((ship, y) => ({ id: ship.id, x: 0, y, horizontal: true }));
const index = (c: { x: number; y: number }) => c.y * 10 + c.x;
const seeded = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const battle = (a: Fleet = aligned, b: Fleet = aligned): GameState => placeFleet(placeFleet(newGame(), 0, a), 1, b);

function frozen<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    for (const item of Object.values(value)) frozen(item);
  }
  return value;
}

test('the standard fleet contains exactly five vessels occupying seventeen cells', () => {
  assert.deepEqual(SHIPS.map(s => s.length), [5, 4, 3, 3, 2]);
  assert.equal(SHIPS.reduce((n, s) => n + s.length, 0), 17);
  assert.equal(new Set(SHIPS.map(s => s.id)).size, 5);
});

test('horizontal/vertical cells and grid boundaries are correct', () => {
  assert.deepEqual(cellsFor({ id: 'destroyer', x: 8, y: 9, horizontal: true }), [{ x: 8, y: 9 }, { x: 9, y: 9 }]);
  assert.deepEqual(cellsFor({ id: 'destroyer', x: 9, y: 8, horizontal: false }), [{ x: 9, y: 8 }, { x: 9, y: 9 }]);
  assert.equal(isValidPlacement([], { id: 'carrier', x: 5, y: 9, horizontal: true }), true);
  assert.equal(isValidPlacement([], { id: 'carrier', x: 6, y: 9, horizontal: true }), false);
  assert.equal(isValidPlacement([], { id: 'carrier', x: 9, y: 5, horizontal: false }), true);
  assert.equal(isValidPlacement([], { id: 'carrier', x: 9, y: 6, horizontal: false }), false);
  for (const bad of [-1, 10, 1.5, NaN, Infinity]) assert.equal(isValidPlacement([], { id: 'destroyer', x: bad, y: 0, horizontal: true }), false);
});

test('overlap is rejected; moving the same vessel and touching other vessels are allowed', () => {
  const fleet: Fleet = [{ id: 'carrier', x: 0, y: 0, horizontal: true }];
  assert.equal(isValidPlacement(fleet, { id: 'destroyer', x: 4, y: 0, horizontal: false }), false);
  assert.equal(isValidPlacement(fleet, { id: 'destroyer', x: 4, y: 1, horizontal: true }), true);
  assert.equal(isValidPlacement(fleet, { id: 'carrier', x: 0, y: 0, horizontal: false }), true);
  assert.deepEqual(validateFleet(aligned), aligned);
});

test('untrusted fleets require all five unique ships and canonical primitive coordinates', () => {
  for (const input of [null, {}, [], aligned.slice(1), [...aligned, aligned[0]], [aligned[0], ...aligned.slice(0, 4)]]) assert.throws(() => validateFleet(input));
  for (const patch of [{ id: 'unknown' }, { x: '0' }, { y: 0.5 }, { horizontal: 'yes' }, { x: -1 }]) assert.throws(() => validateFleet([{ ...aligned[0], ...patch }, ...aligned.slice(1)]));
  assert.throws(() => validateFleet(aligned.map(s => ({ ...s, y: 0 }))));
  const input = aligned.map(s => ({ ...s, secret: 'discard' }));
  const result = validateFleet(input);
  assert.equal('secret' in result[0], false);
  assert.notEqual(result[0], input[0]);
});

test('one hundred randomly placed fleets are valid and contain seventeen unique cells', () => {
  for (let i = 0; i < 100; i++) {
    const fleet = randomFleet();
    assert.doesNotThrow(() => validateFleet(fleet));
    assert.equal(new Set(fleet.flatMap(cellsFor).map(index)).size, 17);
  }
});

test('deployment is immutable, requires both players, and locks after battle begins', () => {
  const initial = frozen(newGame());
  const first = placeFleet(initial, 0, aligned);
  assert.equal(initial.fleets[0], null);
  assert.equal(first.phase, 'placement');
  assert.throws(() => fireShot(first, 0, 0, 0));
  const ready = placeFleet(frozen(first), 1, aligned);
  assert.equal(first.fleets[1], null);
  assert.equal(ready.phase, 'battle');
  assert.throws(() => placeFleet(ready, 0, aligned));
  assert.throws(() => placeFleet(newGame(), 2 as 0, aligned));
});

test('shots alternate even on hits and never reveal unsunk vessel identity', () => {
  const ready = frozen(battle());
  const hit = fireShot(ready, 0, 0, 0);
  assert.equal(hit.shot.result, 'hit');
  assert.deepEqual(Object.keys(hit.shot).sort(), ['result', 'x', 'y']);
  assert.equal(hit.game.turn, 1);
  assert.equal(ready.shots[0].length, 0);
  assert.equal(hit.game.shots[0].length, 1);
  assert.throws(() => fireShot(hit.game, 0, 1, 0), /turn/);
  const miss = fireShot(hit.game, 1, 9, 9);
  assert.equal(miss.shot.result, 'miss');
  assert.equal(miss.game.turn, 0);
  assert.throws(() => fireShot(miss.game, 0, 0, 0), /already/);
  for (const [x, y] of [[-1, 0], [10, 0], [0, 10], [0, -1], [0.5, 0], [NaN, 0]]) assert.throws(() => fireShot(miss.game, 0, x, y));
  assert.throws(() => fireShot(miss.game, 2 as 0, 1, 0));
});

test('sinking reveals just that ship, retains touching ships, and victory occurs on the seventeenth hit', () => {
  let game = battle();
  const targets = aligned.flatMap(cellsFor);
  for (let i = 0; i < targets.length; i++) {
    const target = targets[i];
    const { game: next, shot } = fireShot(game, 0, target.x, target.y);
    game = next;
    if (i === 4) {
      assert.equal(shot.result, 'sunk');
      assert.deepEqual(shot.sunk, { id: 'carrier', cells: cellsFor(aligned[0]) });
      assert.equal(fleetRemaining(aligned, game.shots[0]), 4);
      assert.equal(game.shots[0].length, 5);
    }
    if (i < 16) {
      assert.equal(game.phase, 'battle');
      game = fireShot(game, 1, i % 10, 7 + Math.floor(i / 10)).game;
    }
  }
  assert.equal(game.phase, 'finished');
  assert.equal(game.winner, 0);
  assert.equal(fleetRemaining(aligned, game.shots[0]), 0);
  assert.equal(game.shots[0].filter(s => s.result === 'sunk').length, 5);
  assert.throws(() => fireShot(game, 1, 9, 9), /over/);
});

test('AI never targets a fired square, including an almost exhausted board', () => {
  const shots: Shot[] = Array.from({ length: 99 }, (_, i) => ({ x: i % 10, y: Math.floor(i / 10), result: 'miss' }));
  for (const difficulty of DIFFICULTIES) {
    assert.deepEqual(chooseAIShot(shots, difficulty, seeded(42)), { x: 9, y: 9 });
    assert.throws(() => chooseAIShot([...shots, { x: 9, y: 9, result: 'miss' }], difficulty));
  }
});

test('Medium follows aligned hits; Expert rejects blocked ends using only public evidence', () => {
  const hits: Shot[] = [{ x: 4, y: 4, result: 'hit' }, { x: 5, y: 4, result: 'hit' }];
  const medium = chooseAIShot(hits, 'Medium', seeded(2));
  assert.equal(medium.y, 4);
  assert.ok(medium.x === 3 || medium.x === 6);
  const evidence: Shot[] = [
    ...hits, { x: 3, y: 4, result: 'miss' },
    { x: 4, y: 3, result: 'miss' }, { x: 4, y: 5, result: 'miss' },
    { x: 5, y: 3, result: 'miss' }, { x: 5, y: 5, result: 'miss' },
  ];
  assert.deepEqual(chooseAIShot(evidence, 'Expert', seeded(9)), { x: 6, y: 4 });
});

test('public evidence yields identical AI decisions regardless of any hidden fleet', () => {
  const evidence: Shot[] = [{ x: 2, y: 1, result: 'miss' }, { x: 8, y: 8, result: 'hit' }];
  for (const difficulty of DIFFICULTIES) {
    const before = JSON.stringify(evidence);
    const first = chooseAIShot(evidence, difficulty, seeded(123));
    randomFleet(); // Changes unrelated hidden data and global randomness.
    const second = chooseAIShot(evidence, difficulty, seeded(123));
    assert.deepEqual(first, second);
    assert.equal(JSON.stringify(evidence), before);
  }
});

test('all five AI levels finish real games legally without duplicate shots', () => {
  const occupied = new Set(aligned.flatMap(cellsFor).map(index));
  const safeOpponentOrder = Array.from({ length: 100 }, (_, i) => i).sort((a, b) => Number(occupied.has(a)) - Number(occupied.has(b)));
  const totals: Record<string, number[]> = {};
  // Include closely touching ships, the difficult case for hunt-and-target AI.
  const enemyFleets = [aligned, randomFleet(), randomFleet()];
  for (const difficulty of DIFFICULTIES) {
    totals[difficulty] = [];
    for (let n = 0; n < enemyFleets.length; n++) {
      const rng = seeded(1024 + n);
      let game = battle(aligned, enemyFleets[n]);
      let turns = 0;
      while (game.phase === 'battle' && turns < 100) {
        const target = chooseAIShot(game.shots[0], difficulty as Difficulty, rng);
        assert.ok(Number.isInteger(target.x) && target.x >= 0 && target.x < 10);
        assert.ok(Number.isInteger(target.y) && target.y >= 0 && target.y < 10);
        game = fireShot(game, 0, target.x, target.y).game;
        turns++;
        if (game.phase === 'battle') {
          const i = safeOpponentOrder[game.shots[1].length];
          game = fireShot(game, 1, i % 10, Math.floor(i / 10)).game;
        }
      }
      assert.equal(game.winner, 0);
      assert.equal(new Set(game.shots[0].map(index)).size, game.shots[0].length);
      totals[difficulty].push(turns);
    }
  }
  console.info('AI shots to win (three complete matches each):', JSON.stringify(totals));
});
