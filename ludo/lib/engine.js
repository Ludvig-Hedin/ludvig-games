/**
 * Ludo rules, shared verbatim by the browser and authoritative server.
 *
 * Classic: four pieces. Quick: two pieces. A six enters a piece at its start
 * square, and grants another roll. Only sixes grant extra turns. One roll per
 * turn; exact rolls finish. With the three-sixes option, the third six forfeits
 * that roll and ends the turn; moves made on the previous two sixes stand.
 * Optional safe squares protect all occupants. Stacks never form blockades.
 * Landing on an unsafe square captures every opposing piece on that square.
 * All players see the same board; AI changes decisions, never dice outcomes.
 */

export const COLORS = Object.freeze([
  Object.freeze({ id: "coral", index: 0, name: "Coral", hex: "#ed6b5f", light: "#fce8e2", dark: "#b64339" }),
  Object.freeze({ id: "green", index: 1, name: "Mint", hex: "#57a987", light: "#e4f2e9", dark: "#287b5b" }),
  Object.freeze({ id: "gold", index: 2, name: "Gold", hex: "#e8b74c", light: "#fff3d6", dark: "#a77720" }),
  Object.freeze({ id: "blue", index: 3, name: "Blue", hex: "#648ed7", light: "#e7eefb", dark: "#3e63a9" }),
]);

export const TRACK = Object.freeze([
  [1, 6], [2, 6], [3, 6], [4, 6], [5, 6],
  [6, 5], [6, 4], [6, 3], [6, 2], [6, 1], [6, 0], [7, 0], [8, 0],
  [8, 1], [8, 2], [8, 3], [8, 4], [8, 5],
  [9, 6], [10, 6], [11, 6], [12, 6], [13, 6], [14, 6], [14, 7], [14, 8],
  [13, 8], [12, 8], [11, 8], [10, 8], [9, 8],
  [8, 9], [8, 10], [8, 11], [8, 12], [8, 13], [8, 14], [7, 14], [6, 14],
  [6, 13], [6, 12], [6, 11], [6, 10], [6, 9],
  [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8], [0, 7], [0, 6],
].map(Object.freeze));

export const STARTS = Object.freeze([0, 13, 26, 39]);
export const SAFE_SQUARES = Object.freeze([0, 8, 13, 21, 26, 34, 39, 47]);
export const HOME_LANES = Object.freeze([
  [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7]],
  [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5]],
  [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7]],
  [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9]],
].map((lane) => Object.freeze(lane.map(Object.freeze))));
export const FINISH = 56;
export const DIFFICULTIES = Object.freeze(["easy", "medium", "hard", "expert"]);

/** Uniform integer using rejection sampling, including for a fair six-sided die. */
function randomInt(size) {
  if (!Number.isInteger(size) || size < 1 || size > 0x100000000) {
    throw new Error("Invalid random range.");
  }
  const limit = Math.floor(0x100000000 / size) * size;
  const words = new Uint32Array(1);
  do { globalThis.crypto.getRandomValues(words); } while (words[0] >= limit);
  return words[0] % size;
}

export function fairDie() {
  return randomInt(6) + 1;
}

export function normalizeRules(rules = {}) {
  return {
    mode: rules.mode === "quick" ? "quick" : "classic",
    safeSquares: rules.safeSquares !== false,
    threeSixes: rules.threeSixes !== false,
  };
}

export function createGame(players, rules = {}) {
  if (!Array.isArray(players) || players.length < 2 || players.length > 4) {
    throw new Error("A game needs 2–4 players.");
  }
  if (new Set(players.map((p) => p.color)).size !== players.length ||
      players.some((p) => !Number.isInteger(p.color) || p.color < 0 || p.color > 3)) {
    throw new Error("Each player needs a different board color.");
  }
  const normalized = normalizeRules(rules);
  const ids = new Set();
  const gamePlayers = players.map((player, index) => {
    const id = typeof player.id === "string" && player.id ? player.id : `player-${index}`;
    if (ids.has(id)) throw new Error("Each player needs a different ID.");
    ids.add(id);
    return {
      id,
      name: String(player.name || `Player ${index + 1}`).trim().slice(0, 24) || `Player ${index + 1}`,
      color: player.color,
      type: player.type === "ai" ? "ai" : "human",
      difficulty: DIFFICULTIES.includes(player.difficulty) ? player.difficulty : "medium",
      pieces: Array(normalized.mode === "quick" ? 2 : 4).fill(-1),
    };
  });
  return {
    players: gamePlayers,
    rules: normalized,
    current: 0,
    phase: "roll",
    dice: null,
    sixes: 0,
    turn: 1,
    revision: 0,
    winner: null,
    legal: [],
    events: [{ id: 0, type: "start", player: 0, turn: 1, text: `${gamePlayers[0].name} ${gamePlayers[0].name === "You" ? "start" : "starts"}. Roll a six to enter.` }],
    lastAction: null,
  };
}

/** Shared-track index; private home lanes and bases intentionally have none. */
export function trackIndex(color, progress) {
  return progress >= 0 && progress <= 50 ? (STARTS[color] + progress) % TRACK.length : null;
}

export function isSafeSquare(state, absoluteIndex) {
  return state.rules.safeSquares && SAFE_SQUARES.includes(absoluteIndex);
}

export function legalMoves(state) {
  if (state.phase !== "move" || state.winner !== null || !Number.isInteger(state.dice)) return [];
  const player = state.players[state.current];
  if (!player) return [];
  return player.pieces.flatMap((progress, index) => {
    if (progress === -1) return state.dice === 6 ? [index] : [];
    return progress < FINISH && progress + state.dice <= FINISH ? [index] : [];
  });
}

function copyState(state) {
  return {
    ...state,
    rules: { ...state.rules },
    players: state.players.map((player) => ({ ...player, pieces: [...player.pieces] })),
    events: [...state.events],
    legal: [],
    revision: state.revision + 1,
  };
}

function event(state, type, player, text) {
  state.events.push({ id: state.revision, type, player, turn: state.turn, text });
  if (state.events.length > 40) state.events = state.events.slice(-40);
}

function nextPlayer(state) {
  state.current = (state.current + 1) % state.players.length;
  state.turn += 1;
  state.sixes = 0;
  state.phase = "roll";
  state.legal = [];
}

export function applyRoll(state, face) {
  if (state.phase !== "roll" || state.winner !== null) throw new Error("You cannot roll now.");
  if (!Number.isInteger(face) || face < 1 || face > 6) throw new Error("A die must show 1–6.");
  const next = copyState(state);
  const player = next.current;
  const name = next.players[player].name;
  next.dice = face;
  next.sixes = face === 6 ? next.sixes + 1 : 0;
  next.phase = "move";
  next.lastAction = {
    id: next.revision, type: "roll", player, face, dice: face,
    noMoves: false, forfeit: false, extraTurn: false,
  };
  if (next.rules.threeSixes && next.sixes === 3) {
    next.lastAction.forfeit = true;
    event(next, "forfeit", player, `${name} rolled three sixes. Turn over.`);
    nextPlayer(next);
    return next;
  }
  next.legal = legalMoves(next);
  if (next.legal.length === 0) {
    next.lastAction.noMoves = true;
    next.lastAction.extraTurn = face === 6;
    event(next, "pass", player, `${name} rolled ${face}. No available move${face === 6 ? " — roll again" : ""}.`);
    if (face === 6) next.phase = "roll";
    else nextPlayer(next);
  } else {
    event(next, "roll", player, `${name} rolled ${face}.`);
  }
  return next;
}

export function applyMove(state, piece) {
  if (state.phase !== "move" || state.winner !== null) throw new Error("You cannot move now.");
  if (!Number.isInteger(piece) || !legalMoves(state).includes(piece)) throw new Error("That piece cannot make this move.");
  const next = copyState(state);
  const player = next.current;
  const movingPlayer = next.players[player];
  const from = movingPlayer.pieces[piece];
  const to = from === -1 ? 0 : from + next.dice;
  const captured = [];
  movingPlayer.pieces[piece] = to;
  const destination = trackIndex(movingPlayer.color, to);
  if (destination !== null && !isSafeSquare(next, destination)) {
    next.players.forEach((opponent, opponentIndex) => {
      if (opponentIndex === player) return;
      opponent.pieces.forEach((progress, opponentPiece) => {
        if (trackIndex(opponent.color, progress) === destination) {
          captured.push({ player: opponentIndex, piece: opponentPiece, from: progress });
          opponent.pieces[opponentPiece] = -1;
        }
      });
    });
  }
  const won = movingPlayer.pieces.every((progress) => progress === FINISH);
  const extraTurn = next.dice === 6 && !won;
  next.lastAction = {
    id: next.revision, type: "move", player, piece, from, to,
    face: next.dice, dice: next.dice, captured, extraTurn, won,
  };
  const name = movingPlayer.name;
  const you = name === "You";
  let text = from === -1 ? `${name} ${you ? "are" : "is"} on the board.` : `${name} moved ${next.dice}.`;
  let type = "move";
  if (captured.length) {
    const names = [...new Set(captured.map((capture) => next.players[capture.player].name))].join(" & ");
    text = `${name} sent ${names} back to base.`;
    type = "capture";
  } else if (to === FINISH) {
    text = `${name} brought a piece home.`;
    type = "home";
  }
  if (won) {
    next.winner = player;
    next.phase = "finished";
    next.sixes = 0;
    event(next, "win", player, `${name} ${you ? "win" : "wins"}! All pieces are home.`);
  } else {
    event(next, type, player, text);
    if (extraTurn) next.phase = "roll";
    else nextPlayer(next);
  }
  return next;
}

/** Probability that at least one opposing piece can capture on its next roll. */
function captureRisk(state, playerIndex, progress) {
  const player = state.players[playerIndex];
  const target = trackIndex(player.color, progress);
  if (target === null || isSafeSquare(state, target)) return 0;
  let chanceNoCapture = 1;
  state.players.forEach((opponent, index) => {
    if (index === playerIndex) return;
    const dangerousRolls = new Set();
    opponent.pieces.forEach((otherProgress) => {
      if (otherProgress === -1) {
        if (STARTS[opponent.color] === target) dangerousRolls.add(6);
        return;
      }
      if (otherProgress > 50) return;
      const distance = (target - trackIndex(opponent.color, otherProgress) + TRACK.length) % TRACK.length;
      if (distance >= 1 && distance <= 6 && otherProgress + distance <= 50) dangerousRolls.add(distance);
    });
    chanceNoCapture *= 1 - dangerousRolls.size / 6;
  });
  return 1 - chanceNoCapture;
}

/** Expected useful progress over the six possible *future* rolls, not a prediction. */
function futureOpportunity(state, playerIndex) {
  const player = state.players[playerIndex];
  let total = 0;
  for (let face = 1; face <= 6; face += 1) {
    let best = 0;
    for (const progress of player.pieces) {
      if (progress === FINISH || (progress === -1 && face !== 6) || progress + face > FINISH) continue;
      const to = progress === -1 ? 0 : progress + face;
      let score = to === FINISH ? 12 : progress === -1 ? 3 : face * 0.3;
      const target = trackIndex(player.color, to);
      if (target !== null && !isSafeSquare(state, target)) {
        state.players.forEach((opponent, index) => {
          if (index !== playerIndex && opponent.pieces.some((p) => trackIndex(opponent.color, p) === target)) score += 5;
        });
      }
      best = Math.max(best, score);
    }
    total += best;
  }
  return total / 6;
}

/** Return a legal piece index. Difficulty never consumes or changes a die roll. */
export function chooseMove(state, difficulty = state.players[state.current]?.difficulty || "medium") {
  const moves = legalMoves(state);
  if (moves.length === 0) return null;
  if (moves.length === 1) return moves[0];
  if (difficulty === "easy") return moves[randomInt(moves.length)];
  const level = DIFFICULTIES.includes(difficulty) ? difficulty : "medium";
  const playerIndex = state.current;
  const player = state.players[playerIndex];
  const activeCount = player.pieces.filter((p) => p >= 0 && p < FINISH).length;
  let bestScore = -Infinity;
  let bestMoves = [];
  for (const piece of moves) {
    const from = player.pieces[piece];
    const moved = applyMove(state, piece);
    const to = moved.players[playerIndex].pieces[piece];
    const captures = moved.lastAction.captured;
    let score = to === FINISH ? 85 : to * 0.24;
    if (from === -1) score += activeCount < 2 ? 15 : 8;
    if (to >= 51 && from < 51) score += 13;
    score += captures.reduce((sum, capture) => sum + 28 + Math.max(0, capture.from) * 0.45, 0);
    if (moved.winner === playerIndex) score += 10000;
    if (level !== "medium") {
      const oldRisk = captureRisk(state, playerIndex, from);
      const risk = captureRisk(moved, playerIndex, to);
      const caution = level === "expert" ? 2.2 : 1.45;
      score += oldRisk * (13 + Math.max(0, from) * 0.6);
      score -= risk * (19 + Math.max(0, to) * 0.9) * caution;
      const target = trackIndex(player.color, to);
      if (target !== null && isSafeSquare(moved, target)) score += 6;
      if (level === "expert") {
        score += futureOpportunity(moved, playerIndex) * 1.6;
        // Sending a dangerous attacker home also protects our other pieces.
        for (let other = 0; other < player.pieces.length; other += 1) {
          if (other === piece) continue;
          const position = player.pieces[other];
          score += (captureRisk(state, playerIndex, position) - captureRisk(moved, playerIndex, position))
            * (12 + Math.max(0, position) * 0.4);
        }
      }
    }
    if (score > bestScore + 0.000001) {
      bestScore = score;
      bestMoves = [piece];
    } else if (Math.abs(score - bestScore) < 0.000001) bestMoves.push(piece);
  }
  return bestMoves[randomInt(bestMoves.length)];
}
