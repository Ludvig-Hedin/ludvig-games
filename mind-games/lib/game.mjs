/** Pure rules and history-only opponents. No browser or server dependency. */
export const MOVES = Object.freeze(['Rock', 'Paper', 'Scissors']);
export const DIFFICULTIES = Object.freeze(['Beginner', 'Easy', 'Medium', 'Hard', 'Expert']);

const validMove = (move) => Number.isInteger(move) && move >= 0 && move <= 2;
const assertMove = (move) => {
  if (!validMove(move)) throw new RangeError('Choose rock, paper, or scissors.');
};

/** 1: a wins; -1: b wins; 0: tie. */
export function result(a, b) {
  assertMove(a);
  assertMove(b);
  if (a === b) return 0;
  return (a - b + 3) % 3 === 1 ? 1 : -1;
}

export function createMatch({ bestOf = 5, variant = 'classic' } = {}) {
  if (![3, 5, 7].includes(bestOf)) throw new RangeError('Series must be best of 3, 5, or 7.');
  if (!['classic', 'mind'].includes(variant)) throw new RangeError('Unknown game mode.');
  return {
    bestOf,
    variant,
    target: Math.floor(bestOf / 2) + 1,
    scores: [0, 0],
    round: 1,
    history: [],
    winner: null,
    boostsLeft: [variant === 'mind', variant === 'mind'],
  };
}

/** Both moves must be committed before this function is called. */
export function resolveRound(match, a, b, boostA = false, boostB = false) {
  // A repeated delivery of a completed match cannot create additional rounds.
  if (match.winner !== null) return match;
  assertMove(a);
  assertMove(b);
  const outcome = result(a, b);
  const winner = outcome === 0 ? null : outcome === 1 ? 0 : 1;
  const boosts = [boostA, boostB].map((requested, seat) =>
    Boolean(requested && match.variant === 'mind' && match.boostsLeft[seat]),
  );
  const delta = [0, 0];
  if (winner !== null) delta[winner] = boosts[winner] ? 2 : 1;
  const scores = match.scores.map((score, seat) => score + delta[seat]);
  const round = {
    round: match.round,
    moves: [a, b],
    boosts,
    winner,
    delta,
    scores: [...scores],
  };
  return {
    ...match,
    scores,
    round: match.round + 1,
    history: [...match.history, round],
    winner: winner !== null && scores[winner] >= match.target ? winner : null,
    boostsLeft: match.boostsLeft.map((available, seat) => available && !boosts[seat]),
  };
}

const uniform = () => [1 / 3, 1 / 3, 1 / 3];
const normalize = (counts) => {
  const sum = counts[0] + counts[1] + counts[2];
  return sum > 0 ? counts.map((n) => n / sum) : uniform();
};
const mixture = (predictions, weights) => normalize([0, 1, 2].map((i) =>
  predictions.reduce((sum, prediction, j) => sum + prediction[i] * weights[j], 0),
));

function frequencies(history, window = 40, decay = 0.96) {
  const counts = [0.5, 0.5, 0.5];
  const start = Math.max(0, history.length - window);
  for (let i = start; i < history.length; i++) {
    counts[history[i].player] += decay ** (history.length - i - 1);
  }
  return normalize(counts);
}

function transitions(history, order) {
  if (history.length < order + 1) return frequencies(history);
  const counts = [0.25, 0.25, 0.25];
  const suffix = history.slice(-order).map((entry) => entry.player);
  let samples = 0;
  for (let i = order; i < history.length; i++) {
    if (suffix.every((move, j) => move === history[i - order + j].player)) {
      const weight = 0.98 ** (history.length - i - 1);
      counts[history[i].player] += weight;
      samples += weight;
    }
  }
  return mixture([normalize(counts), frequencies(history)], [samples, 0.6]);
}

function repeatedStep(history) {
  if (history.length < 2) return uniform();
  const last = history.at(-1).player;
  const step = (last - history.at(-2).player + 3) % 3;
  const counts = [0.1, 0.1, 0.1];
  counts[(last + step) % 3] = 0.8;
  return counts;
}

// Players often repeat a winning move or change direction after a loss.
function outcomeResponse(history) {
  if (history.length < 3) return frequencies(history);
  const last = history.at(-1);
  const lastOutcome = result(last.player, last.ai);
  const counts = [0.4, 0.4, 0.4];
  for (let i = 1; i < history.length; i++) {
    const previous = history[i - 1];
    if (result(previous.player, previous.ai) !== lastOutcome) continue;
    const step = (history[i].player - previous.player + 3) % 3;
    counts[(last.player + step) % 3] += 0.96 ** (history.length - i - 1);
  }
  return normalize(counts);
}

const predictors = [
  (history) => frequencies(history, 12, 0.9),
  (history) => frequencies(history, 80, 0.98),
  (history) => transitions(history, 1),
  (history) => transitions(history, 2),
  (history) => transitions(history, 3),
  repeatedStep,
  outcomeResponse,
];

function adaptivePrediction(history) {
  if (history.length < 3) return frequencies(history);
  // Score each predictor only against historical next moves. No current move
  // is accepted by this API; predictors compete on their out-of-sample history.
  const scores = predictors.map(() => 0);
  const start = Math.max(2, history.length - 26);
  for (let i = start; i < history.length; i++) {
    const before = history.slice(0, i);
    const actual = history[i].player;
    const recency = 0.96 ** (history.length - i - 1);
    predictors.forEach((predict, j) => {
      scores[j] += Math.log(Math.max(0.025, predict(before)[actual])) * recency;
    });
  }
  const best = Math.max(...scores);
  const weights = scores.map((score) => Math.exp((score - best) * 0.7) + 0.015);
  return mixture(predictors.map((predict) => predict(history)), weights);
}

/**
 * Call choose() at the start of the round, before accepting a human choice.
 * observe() is called only after simultaneous reveal. The AI knows no pending
 * choice, so uniformly random play cannot be exploited, even on Expert.
 */
export class AdaptiveAI {
  constructor({ difficulty = 'Medium', history = [], rng = Math.random } = {}) {
    this.difficulty = DIFFICULTIES.find((name) => name.toLowerCase() === String(difficulty).toLowerCase()) || 'Medium';
    this.rng = rng;
    this.history = history.filter((entry) => validMove(entry?.player) && validMove(entry?.ai))
      .slice(-100).map(({ player, ai }) => ({ player, ai }));
  }

  choose() {
    const tier = DIFFICULTIES.indexOf(this.difficulty);
    const exploitation = [0, 0.45, 0.7, 0.82, 0.93][tier];
    if (this.history.length < 2 || this.rng() >= exploitation) return Math.min(2, Math.floor(this.rng() * 3));
    let prediction;
    if (tier === 1) prediction = frequencies(this.history, 14, 0.94);
    else if (tier === 2) prediction = mixture([frequencies(this.history), transitions(this.history, 1), repeatedStep(this.history)], [1, 2, 1]);
    else if (tier === 3) prediction = mixture([frequencies(this.history), transitions(this.history, 1), transitions(this.history, 2), outcomeResponse(this.history)], [1, 2, 3, 1]);
    else prediction = adaptivePrediction(this.history);

    // Maximize expected win-minus-loss, using a random tie break.
    const utilities = [0, 1, 2].map((move) => prediction[(move + 2) % 3] - prediction[(move + 1) % 3]);
    const best = Math.max(...utilities);
    const options = [0, 1, 2].filter((move) => best - utilities[move] < 1e-7);
    return options[Math.min(options.length - 1, Math.floor(this.rng() * options.length))];
  }

  observe(playerMove, aiMove) {
    assertMove(playerMove);
    assertMove(aiMove);
    this.history.push({ player: playerMove, ai: aiMove });
    if (this.history.length > 100) this.history.splice(0, this.history.length - 100);
  }

  exportHistory() {
    return this.history.map((entry) => ({ ...entry }));
  }
}
