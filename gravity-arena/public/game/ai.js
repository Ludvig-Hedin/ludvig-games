import { getDimensions, getWinningLines, getLegalMoves } from './engine.js';

const WIN = 1_000_000;
const TIMEOUT = Symbol('search timeout');
const LEVELS = Object.freeze({
  beginner: { depth: 1, time: 40, randomness: 0.72 },
  easy: { depth: 2, time: 90, randomness: 0.22 },
  medium: { depth: 4, time: 280, randomness: 0 },
  hard: { depth: 7, time: 650, randomness: 0 },
  expert: { depth: 12, time: 1200, randomness: 0 },
});

function randomGenerator(seed) {
  let a = (Number.isFinite(seed) ? seed : Math.floor(Math.random() * 0xffffffff)) >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let n = a;
    n = Math.imul(n ^ n >>> 15, n | 1);
    n ^= n + Math.imul(n ^ n >>> 7, n | 61);
    return ((n ^ n >>> 14) >>> 0) / 4294967296;
  };
}

/**
 * Iterative-deepening negamax with alpha-beta, a bounded transposition table,
 * deterministic Zobrist hashes, tactical/TT/positional move ordering, and a deadline.
 * Call from ai.worker.js so even Expert never occupies the rendering thread.
 * @param {import('./engine.js').GameState} state
 * @param {'beginner'|'easy'|'medium'|'hard'|'expert'} difficulty
 * @param {{timeLimitMs?:number,seed?:number}} options
 * @returns {{stack:number,depth:number,nodes:number,score:number}}
 */
export function chooseMove(state, difficulty = 'medium', options = {}) {
  const level = LEVELS[difficulty] || LEVELS.medium;
  const legal = getLegalMoves(state);
  if (!legal.length) throw new Error('There are no legal moves.');
  const random = randomGenerator(options.seed);
  const { width, depth: boardDepth, height, stacks, cells } = getDimensions(state.variant);
  const board = Int8Array.from(state.board);
  const heights = Int8Array.from(state.heights);
  const lines = getWinningLines(state.variant);
  const cellLines = Array.from({ length: cells }, () => []);
  lines.forEach(line => line.forEach(cell => cellLines[cell].push(line)));
  const remaining = cells - state.moves.length;
  const now = () => typeof performance !== 'undefined' ? performance.now() : Date.now();
  const timeLimit = Math.min(1400, Math.max(5, Number.isFinite(options.timeLimitMs) ? options.timeLimitMs : level.time));
  const deadline = now() + timeLimit;
  let nodes = 0;
  const table = new Map();
  const hashRandom = randomGenerator(0x87c211a9);
  const hashA = Array.from({ length: cells * 2 }, () => (hashRandom() * 0xffffffff) >>> 0);
  const hashB = Array.from({ length: cells * 2 }, () => (hashRandom() * 0xffffffff) >>> 0);
  let positionA = 0, positionB = 0;
  for (let cell = 0; cell < cells; cell++) if (board[cell]) {
    const key = cell * 2 + board[cell] - 1;
    positionA ^= hashA[key]; positionB ^= hashB[key];
  }
  const center = Array.from({ length: stacks }, (_, stack) => {
    const x = stack % width, z = Math.floor(stack / width);
    return (width - Math.abs(x - (width - 1) / 2) * 2) + (boardDepth > 1 ? boardDepth - Math.abs(z - (boardDepth - 1) / 2) * 2 : 0);
  });

  function make(stack, player) {
    const cell = stack + stacks * heights[stack]++;
    board[cell] = player;
    const key = cell * 2 + player - 1;
    positionA ^= hashA[key]; positionB ^= hashB[key];
    return cell;
  }
  function unmake(stack, player) {
    const cell = stack + stacks * --heights[stack];
    board[cell] = 0;
    const key = cell * 2 + player - 1;
    positionA ^= hashA[key]; positionB ^= hashB[key];
  }
  function winsAt(cell, player) {
    for (const line of cellLines[cell]) {
      if (board[line[0]] === player && board[line[1]] === player && board[line[2]] === player && board[line[3]] === player) return true;
    }
    return false;
  }
  function immediateWins(player) {
    const result = [];
    for (let stack = 0; stack < stacks; stack++) if (heights[stack] < height) {
      const cell = make(stack, player);
      if (winsAt(cell, player)) result.push(stack);
      unmake(stack, player);
    }
    return result;
  }
  function evaluate(player) {
    let score = 0;
    const other = 3 - player;
    const weights = [0, 3, 24, 160, WIN / 2];
    for (const line of lines) {
      let own = 0, opponent = 0, playable = 0;
      for (const cell of line) {
        if (board[cell] === player) own++;
        else if (board[cell] === other) opponent++;
        else if (Math.floor(cell / stacks) === heights[cell % stacks]) playable++;
      }
      if (own && opponent) continue;
      if (own) score += weights[own] + (own === 3 && playable ? 210 : 0);
      if (opponent) score -= weights[opponent] + (opponent === 3 && playable ? 210 : 0);
    }
    for (let cell = 0; cell < cells; cell++) if (board[cell]) score += (board[cell] === player ? 1 : -1) * center[cell % stacks];
    return score;
  }
  function orderedMoves(player, preferred = -1) {
    const moves = [];
    for (let stack = 0; stack < stacks; stack++) if (heights[stack] < height) {
      let score = center[stack] * 4 + (stack === preferred ? 200_000 : 0);
      let cell = make(stack, player);
      if (winsAt(cell, player)) score += 1_000_000;
      for (const line of cellLines[cell]) {
        let own = 0, blocked = false;
        for (const point of line) { if (board[point] === 3 - player) { blocked = true; break; } if (board[point] === player) own++; }
        if (!blocked) score += own * own * 4;
      }
      unmake(stack, player);
      cell = make(stack, 3 - player);
      if (winsAt(cell, 3 - player)) score += 100_000;
      unmake(stack, 3 - player);
      moves.push({ stack, score });
    }
    moves.sort((a, b) => b.score - a.score || a.stack - b.stack);
    return moves;
  }
  function search(depth, alpha, beta, player, ply, left) {
    nodes++;
    if ((nodes & 127) === 0 && now() >= deadline) throw TIMEOUT;
    if (!left) return 0;
    const key = `${positionA}:${positionB}:${player}`;
    const entry = table.get(key);
    const originalAlpha = alpha;
    const originalBeta = beta;
    if (entry && entry.depth >= depth) {
      if (entry.flag === 0) return entry.score;
      if (entry.flag === 1) alpha = Math.max(alpha, entry.score);
      if (entry.flag === -1) beta = Math.min(beta, entry.score);
      if (alpha >= beta) return entry.score;
    }
    if (depth <= 0) return evaluate(player);
    let best = -Infinity, bestMove = -1;
    for (const { stack } of orderedMoves(player, entry?.stack)) {
      const cell = make(stack, player);
      let score;
      try { score = winsAt(cell, player) ? WIN - ply : -search(depth - 1, -beta, -alpha, 3 - player, ply + 1, left - 1); }
      finally { unmake(stack, player); }
      if (score > best) { best = score; bestMove = stack; }
      alpha = Math.max(alpha, score);
      if (alpha >= beta) break;
    }
    if (table.size < 90_000) table.set(key, { depth, score: best, stack: bestMove, flag: best <= originalAlpha ? -1 : best >= originalBeta ? 1 : 0 });
    return best;
  }

  const ownWins = immediateWins(state.turn);
  // Beginner occasionally overlooks a win. Every stronger level takes it.
  if (ownWins.length && (difficulty !== 'beginner' || random() > 0.5)) return { stack: ownWins[Math.floor(random() * ownWins.length)], depth: 1, nodes, score: WIN };
  const enemyWins = immediateWins(3 - state.turn);
  if (difficulty !== 'beginner' && enemyWins.length === 1 && (difficulty !== 'easy' || random() > 0.12)) return { stack: enemyWins[0], depth: 1, nodes, score: 0 };
  if (random() < level.randomness) return { stack: legal[Math.floor(random() * legal.length)], depth: 0, nodes, score: 0 };

  let bestStack = orderedMoves(state.turn)[0].stack;
  let bestScore = 0, completedDepth = 0;
  const maxDepth = Math.min(remaining, state.variant === '3d' ? Math.min(level.depth, 8) : level.depth);
  for (let depth = 1; depth <= maxDepth; depth++) {
    let alpha = -Infinity, iterationBest = bestStack, iterationScore = -Infinity;
    try {
      for (const { stack } of orderedMoves(state.turn, bestStack)) {
        if (now() >= deadline && completedDepth > 0) throw TIMEOUT;
        const cell = make(stack, state.turn);
        let score;
        try { score = winsAt(cell, state.turn) ? WIN : -search(depth - 1, -Infinity, -alpha, 3 - state.turn, 1, remaining - 1); }
        finally { unmake(stack, state.turn); }
        if (score > iterationScore) { iterationBest = stack; iterationScore = score; }
        alpha = Math.max(alpha, score);
      }
      bestStack = iterationBest; bestScore = iterationScore; completedDepth = depth;
      if (Math.abs(bestScore) >= WIN - cells || now() >= deadline) break;
    } catch (error) {
      if (error !== TIMEOUT) throw error;
      break;
    }
  }
  return { stack: bestStack, depth: completedDepth, nodes, score: bestScore };
}
