import test from "node:test";
import assert from "node:assert/strict";
import {
  createGame, applyRoll, applyMove, legalMoves, chooseMove, fairDie,
  TRACK, HOME_LANES, STARTS, SAFE_SQUARES, trackIndex,
} from "../lib/engine.js";

const players = (count = 4) => Array.from({ length: count }, (_, color) => ({
  id: `p${color}`, name: `Player ${color + 1}`, color, type: "ai", difficulty: "expert",
}));
const setup = (options = {}) => createGame(players(), options);
const ready = (positions, face, options = {}) => {
  const state = setup(options);
  positions.forEach((pieces, index) => { state.players[index].pieces = [...pieces]; });
  return applyRoll(state, face);
};

test("board track, starts, and home lanes use distinct, consistent geometry", () => {
  assert.equal(TRACK.length, 52);
  assert.equal(new Set(TRACK.map((p) => p.join(","))).size, 52);
  assert.deepEqual(STARTS, [0, 13, 26, 39]);
  assert.deepEqual(TRACK[STARTS[0]], [1, 6]);
  assert.deepEqual(TRACK[STARTS[1]], [8, 1]);
  assert.deepEqual(TRACK[STARTS[2]], [13, 8]);
  assert.deepEqual(TRACK[STARTS[3]], [6, 13]);
  for (let color = 0; color < 4; color += 1) {
    assert.equal(HOME_LANES[color].length, 5);
    const exit = TRACK[trackIndex(color, 50)];
    const entry = HOME_LANES[color][0];
    assert.equal(Math.abs(exit[0] - entry[0]) + Math.abs(exit[1] - entry[1]), 1);
    assert.equal(trackIndex(color, 51), null);
  }
  assert.equal(SAFE_SQUARES.length, 8);
});

test("classic and quick initialize two to four players without mutating input", () => {
  const input = players(2);
  const copy = structuredClone(input);
  assert.deepEqual(createGame(input).players[0].pieces, [-1, -1, -1, -1]);
  assert.deepEqual(createGame(input, { mode: "quick" }).players[0].pieces, [-1, -1]);
  assert.deepEqual(input, copy);
  assert.throws(() => createGame(players(1)));
  assert.throws(() => createGame(players(5)));
  assert.throws(() => createGame([{ ...input[0] }, { ...input[1], color: 0 }]));
  assert.throws(() => createGame([{ ...input[0] }, { ...input[1], id: input[0].id }]));
});

test("only six enters, failed rolls advance, and entering grants another roll", () => {
  const original = setup();
  const snapshot = structuredClone(original);
  const pass = applyRoll(original, 5);
  assert.equal(pass.current, 1);
  assert.equal(pass.phase, "roll");
  assert.equal(pass.lastAction.noMoves, true);
  const rolled = applyRoll(original, 6);
  assert.deepEqual(legalMoves(rolled), [0, 1, 2, 3]);
  const moved = applyMove(rolled, 2);
  assert.equal(moved.players[0].pieces[2], 0);
  assert.equal(moved.current, 0);
  assert.equal(moved.phase, "roll");
  assert.equal(moved.sixes, 1);
  assert.deepEqual(original, snapshot);
  assert.deepEqual(rolled.players[0].pieces, [-1, -1, -1, -1]);
});

test("third consecutive six loses that roll, preserving earlier moves", () => {
  let state = setup();
  state = applyMove(applyRoll(state, 6), 0);
  state = applyMove(applyRoll(state, 6), 0);
  state = applyRoll(state, 6);
  assert.equal(state.players[0].pieces[0], 6);
  assert.equal(state.current, 1);
  assert.equal(state.sixes, 0);
  assert.equal(state.lastAction.forfeit, true);
  assert.equal(state.phase, "roll");
  assert.deepEqual(state.legal, []);
  state = setup({ threeSixes: false });
  for (let i = 0; i < 5; i += 1) state = applyMove(applyRoll(state, 6), 0);
  assert.equal(state.current, 0);
  assert.equal(state.players[0].pieces[0], 24);
});

test("non-six resets a streak, even after legal moves", () => {
  let state = applyMove(applyRoll(setup(), 6), 0);
  state = applyMove(applyRoll(state, 2), 0);
  assert.equal(state.current, 1);
  assert.equal(state.sixes, 0);
  assert.equal(state.players[0].pieces[0], 2);
});

test("capture sends every opposing stack occupant to base without bonus turn", () => {
  // Red 2 -> 5; green progress 44 and gold progress 31 share absolute square 5.
  const state = ready([[2, -1, -1, -1], [44, 44, -1, -1], [31, -1, -1, -1], [-1, -1, -1, -1]], 3);
  const moved = applyMove(state, 0);
  assert.equal(moved.lastAction.captured.length, 3);
  assert.deepEqual(moved.players[1].pieces, [-1, -1, -1, -1]);
  assert.deepEqual(moved.players[2].pieces, [-1, -1, -1, -1]);
  assert.equal(moved.players[0].pieces[0], 5);
  assert.equal(moved.current, 1);
  assert.equal(moved.lastAction.extraTurn, false);
});

test("safe squares allow coexistence, disabled protection permits capture", () => {
  const positions = [[5, -1, -1, -1], [47, -1, -1, -1], [-1, -1, -1, -1], [-1, -1, -1, -1]];
  const protectedMove = applyMove(ready(positions, 3), 0);
  assert.equal(protectedMove.players[1].pieces[0], 47);
  assert.equal(protectedMove.lastAction.captured.length, 0);
  const unsafeMove = applyMove(ready(positions, 3, { safeSquares: false }), 0);
  assert.equal(unsafeMove.players[1].pieces[0], -1);
  assert.equal(unsafeMove.lastAction.captured.length, 1);
});

test("entering can capture at an unprotected starting square", () => {
  const positions = [[-1, -1, -1, -1], [39, -1, -1, -1], [-1, -1, -1, -1], [-1, -1, -1, -1]];
  const moved = applyMove(ready(positions, 6, { safeSquares: false }), 0);
  assert.equal(moved.players[1].pieces[0], -1);
  assert.equal(moved.lastAction.captured.length, 1);
  assert.equal(moved.current, 0);
});

test("stacks do not block passage or friendly landing", () => {
  const positions = [[1, 3, 3, -1], [41, 41, -1, -1], [-1, -1, -1, -1], [-1, -1, -1, -1]];
  const state = ready(positions, 2);
  assert.ok(legalMoves(state).includes(0));
  const moved = applyMove(state, 0);
  assert.deepEqual(moved.players[0].pieces, [3, 3, 3, -1]);
  assert.deepEqual(moved.players[1].pieces, [41, 41, -1, -1]);
});

test("exact finish, private lanes, and victory after the last piece", () => {
  let state = ready([[55, 53, 50, 56], [42, -1, -1, -1], [-1, -1, -1, -1], [-1, -1, -1, -1]], 2);
  assert.deepEqual(legalMoves(state), [1, 2]);
  assert.throws(() => applyMove(state, 0));
  state = applyMove(state, 2);
  assert.equal(state.players[0].pieces[2], 52);
  assert.equal(state.players[1].pieces[0], 42);
  state = ready([[56, 56, 56, 55], [-1, -1, -1, -1], [-1, -1, -1, -1], [-1, -1, -1, -1]], 1);
  state = applyMove(state, 3);
  assert.equal(state.phase, "finished");
  assert.equal(state.winner, 0);
  assert.equal(state.lastAction.won, true);
  assert.equal(chooseMove(state), null);
  assert.throws(() => applyRoll(state, 6));
  assert.throws(() => applyMove(state, 0));
});

test("unusable six still grants a roll and can trigger third-six rule", () => {
  let state = ready([[55, 55, 55, 55], [-1, -1, -1, -1], [-1, -1, -1, -1], [-1, -1, -1, -1]], 6);
  assert.equal(state.current, 0);
  assert.equal(state.phase, "roll");
  assert.equal(state.lastAction.noMoves, true);
  state = applyRoll(state, 6);
  state = applyRoll(state, 6);
  assert.equal(state.current, 1);
  assert.equal(state.lastAction.forfeit, true);
});

test("invalid actions are rejected, including stale roll/move requests", () => {
  const state = setup();
  for (const face of [0, 7, -1, 2.5, "6", null, NaN]) assert.throws(() => applyRoll(state, face));
  assert.throws(() => applyMove(state, 0));
  const rolled = applyRoll(state, 6);
  assert.throws(() => applyRoll(rolled, 1));
  for (const piece of [-1, 4, 0.5, "0"]) assert.throws(() => applyMove(rolled, piece));
});

test("hard and expert value a legal finish over an ordinary advance", () => {
  const state = ready([[55, 10, -1, -1], [-1, -1, -1, -1], [-1, -1, -1, -1], [-1, -1, -1, -1]], 1);
  assert.equal(chooseMove(state, "hard"), 0);
  assert.equal(chooseMove(state, "expert"), 0);
});

test("expert escapes a threat when otherwise equivalent advances exist", () => {
  // Green at absolute 17 can hit red's advanced piece at 20; moving to 24 escapes.
  const state = ready([[20, 12, -1, -1], [4, -1, -1, -1], [-1, -1, -1, -1], [-1, -1, -1, -1]], 4, { safeSquares: false });
  assert.equal(chooseMove(state, "expert"), 0);
});

test("fairDie rejects out-of-range entropy instead of introducing modulo bias", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "crypto");
  const words = [0xffffffff, 0xfffffffe, 0xfffffffd, 0xfffffffc, 0, 1, 2, 3, 4, 5];
  let calls = 0;
  Object.defineProperty(globalThis, "crypto", { configurable: true, value: {
    getRandomValues(target) { calls += 1; target[0] = words.shift(); return target; },
  } });
  try {
    assert.deepEqual(Array.from({ length: 6 }, fairDie), [1, 2, 3, 4, 5, 6]);
    assert.equal(calls, 10);
  } finally { Object.defineProperty(globalThis, "crypto", original); }
});

test("full simulated games terminate with legal state across every rule variant and AI", () => {
  // Seeded test dice exercise deterministic long games; production uses fairDie.
  let seed = 0x715d29a;
  const roll = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return Math.floor(seed / 0x100000000 * 6) + 1; };
  let games = 0;
  for (const mode of ["classic", "quick"]) {
    for (const safeSquares of [true, false]) {
      for (const threeSixes of [true, false]) {
        for (const count of [2, 3, 4]) {
          let state = createGame(players(count), { mode, safeSquares, threeSixes });
          let actions = 0;
          while (state.phase !== "finished" && actions++ < 12000) {
            const before = JSON.stringify(state);
            let next;
            if (state.phase === "roll") next = applyRoll(state, roll());
            else {
              const level = ["easy", "medium", "hard", "expert"][actions % 4];
              const piece = chooseMove(state, level);
              assert.ok(legalMoves(state).includes(piece));
              next = applyMove(state, piece);
            }
            assert.equal(JSON.stringify(state), before, "transitions must remain immutable");
            state = next;
            assert.ok(state.players.every((p) => p.pieces.every((n) => Number.isInteger(n) && n >= -1 && n <= 56)));
            assert.ok(state.current >= 0 && state.current < count);
            assert.ok(state.events.length <= 40);
          }
          assert.equal(state.phase, "finished", `${mode}, safe=${safeSquares}, three=${threeSixes}, count=${count}`);
          assert.ok(state.players[state.winner].pieces.every((p) => p === 56));
          assert.equal(state.players[0].pieces.length, mode === "quick" ? 2 : 4);
          games += 1;
        }
      }
    }
  }
  assert.equal(games, 24);
});
