/** Shared rules and AI. The computer receives only a board and never mutates it. */
const linesCache = new Map();
const classicCache = new Map();
const OTHER = { X: 'O', O: 'X' };

export function getWinLength(size) {
  if (![3, 4, 5].includes(size)) throw new Error('Choose a 3, 4 or 5 square board.');
  return size === 3 ? 3 : 4;
}

export function getWinningLines(size) {
  if (linesCache.has(size)) return linesCache.get(size);
  const length = getWinLength(size);
  const lines = [];
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
        const endRow = row + dr * (length - 1);
        const endCol = col + dc * (length - 1);
        if (endRow >= size || endCol >= size || endCol < 0) continue;
        lines.push(Object.freeze(Array.from({ length }, (_, i) => (row + i * dr) * size + col + i * dc)));
      }
    }
  }
  const result = Object.freeze(lines);
  linesCache.set(size, result);
  return result;
}

function checkBoard(board, size) {
  getWinLength(size);
  if (!Array.isArray(board) || board.length !== size * size || board.some(value => value !== null && value !== 'X' && value !== 'O')) {
    throw new Error('Invalid board.');
  }
}

function winnerOn(board, lines) {
  for (const line of lines) {
    const mark = board[line[0]];
    if (mark && line.every(index => board[index] === mark)) return { winner: mark, line: [...line] };
  }
  return null;
}

export function getResult(board, size) {
  checkBoard(board, size);
  const win = winnerOn(board, getWinningLines(size));
  if (win) return { ...win, draw: false };
  return { winner: null, line: [], draw: board.every(Boolean) };
}

function available(board) {
  return board.flatMap((value, index) => value === null ? [index] : []);
}

function pick(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function immediateWins(board, mark, lines, moves) {
  const wins = [];
  for (const move of moves) {
    board[move] = mark;
    if (winnerOn(board, lines)) wins.push(move);
    board[move] = null;
  }
  return wins;
}

/** Full-width, full-depth minimax. Memoized values are exact, never alpha-beta bounds. */
function classicValue(board, turn, me, lines) {
  const key = board.map(value => value || '-').join('') + turn + me;
  if (classicCache.has(key)) return classicCache.get(key);
  const empty = available(board);
  const result = winnerOn(board, lines);
  if (result) return result.winner === me ? 100 + empty.length : -100 - empty.length;
  if (!empty.length) return 0;
  let best = turn === me ? -Infinity : Infinity;
  for (const move of empty) {
    board[move] = turn;
    const value = classicValue(board, OTHER[turn], me, lines);
    board[move] = null;
    best = turn === me ? Math.max(best, value) : Math.min(best, value);
  }
  classicCache.set(key, best);
  return best;
}

function classicChoices(board, me, lines) {
  const order = [4, 0, 2, 6, 8, 1, 3, 5, 7];
  return order.filter(index => board[index] === null).map(move => {
    board[move] = me;
    const score = classicValue(board, OTHER[me], me, lines);
    board[move] = null;
    return { move, score };
  }).sort((a, b) => b.score - a.score);
}

function evaluate(board, size, me, lines) {
  const weights = size === 3 ? [0, 3, 28, 100000] : [0, 2, 16, 150, 100000];
  let score = 0;
  let ownThreats = 0;
  let enemyThreats = 0;
  for (const line of lines) {
    let own = 0;
    let enemy = 0;
    for (const index of line) {
      if (board[index] === me) own++;
      else if (board[index]) enemy++;
    }
    if (own && enemy) continue;
    if (own) {
      score += weights[own];
      if (own === line.length - 1) ownThreats++;
    } else if (enemy) {
      score -= weights[enemy] * 1.08;
      if (enemy === line.length - 1) enemyThreats++;
    }
  }
  if (ownThreats > 1) score += ownThreats * 180;
  if (enemyThreats > 1) score -= enemyThreats * 195;
  const center = (size - 1) / 2;
  for (let i = 0; i < board.length; i++) {
    if (!board[i]) continue;
    const proximity = size - Math.abs(Math.floor(i / size) - center) - Math.abs(i % size - center);
    score += (board[i] === me ? 1 : -1) * proximity * 0.4;
  }
  return score;
}

function orderedMoves(board, size, mark, lines, cap = 25) {
  const center = (size - 1) / 2;
  const weights = [0, 2, 16, 240, 50000];
  return available(board).map(move => {
    let score = size - Math.abs(Math.floor(move / size) - center) - Math.abs(move % size - center);
    for (const line of lines) {
      if (!line.includes(move)) continue;
      let own = 0;
      let enemy = 0;
      for (const index of line) {
        if (board[index] === mark) own++;
        else if (board[index]) enemy++;
      }
      if (!enemy) score += weights[own + 1];
      if (!own) score += weights[enemy + 1] * 0.95;
    }
    return { move, score };
  }).sort((a, b) => b.score - a.score).slice(0, cap).map(item => item.move);
}

/** Iterative deepening keeps a completed legal result if the time budget expires. */
function searchMove(board, size, me, difficulty, lines) {
  const budget = difficulty === 'medium' ? 45 : difficulty === 'hard' ? 160 : 280;
  const maxDepth = difficulty === 'medium' ? 2 : difficulty === 'hard' ? 5 : 8;
  const deadline = performance.now() + budget;
  const expired = Symbol('search budget');
  let nodes = 0;
  const branchLimit = size === 5 ? (difficulty === 'impossible' ? 16 : 12) : 16;
  const roots = orderedMoves(board, size, me, lines);
  let bestMove = roots[0];

  function search(depth, alpha, beta, turn, ply) {
    if ((++nodes & 127) === 0 && performance.now() >= deadline) throw expired;
    const result = winnerOn(board, lines);
    if (result) return result.winner === me ? 1000000 - ply : -1000000 + ply;
    if (!board.includes(null)) return 0;
    if (!depth) return evaluate(board, size, me, lines);
    const moves = orderedMoves(board, size, turn, lines, branchLimit);
    let best = turn === me ? -Infinity : Infinity;
    for (const move of moves) {
      board[move] = turn;
      let score;
      try {
        score = search(depth - 1, alpha, beta, OTHER[turn], ply + 1);
      } finally {
        board[move] = null;
      }
      if (turn === me) {
        best = Math.max(best, score);
        alpha = Math.max(alpha, best);
      } else {
        best = Math.min(best, score);
        beta = Math.min(beta, best);
      }
      if (beta <= alpha) break;
    }
    return best;
  }

  for (let depth = 1; depth <= maxDepth; depth++) {
    let iterationMove = bestMove;
    let iterationScore = -Infinity;
    const iterationRoots = [bestMove, ...roots.filter(move => move !== bestMove)];
    try {
      for (const move of iterationRoots) {
        board[move] = me;
        let score;
        try {
          score = search(depth - 1, iterationScore, Infinity, OTHER[me], 1);
        } finally {
          board[move] = null;
        }
        if (score > iterationScore) {
          iterationScore = score;
          iterationMove = move;
        }
      }
      bestMove = iterationMove;
      if (iterationScore > 900000 || depth >= available(board).length) break;
    } catch (error) {
      if (error !== expired) throw error;
      break;
    }
    if (performance.now() >= deadline) break;
  }
  return bestMove;
}

export function chooseMove(input, size, mark, difficulty = 'hard') {
  checkBoard(input, size);
  if (!OTHER[mark]) throw new Error('Invalid mark.');
  if (!['easy', 'medium', 'hard', 'impossible'].includes(difficulty)) throw new Error('Invalid difficulty.');
  const board = [...input];
  const lines = getWinningLines(size);
  const moves = available(board);
  if (!moves.length || winnerOn(board, lines)) return -1;

  // Easy makes believable mistakes, including occasionally overlooking a winning move.
  if (difficulty === 'easy' && Math.random() < 0.72) return pick(moves);
  const winning = immediateWins(board, mark, lines, moves);
  if (winning.length) return winning[0];
  const blocks = immediateWins(board, OTHER[mark], lines, moves);
  if (blocks.length && (difficulty !== 'medium' || Math.random() < 0.85)) return blocks[0];
  if (difficulty === 'easy') return pick(orderedMoves(board, size, mark, lines).slice(0, 4));
  if (difficulty === 'medium' && Math.random() < 0.2) return pick(moves);

  if (size === 3 && (difficulty === 'hard' || difficulty === 'impossible')) {
    const choices = classicChoices(board, mark, lines);
    // Hard occasionally misses a quiet strategic fork, but never an immediate win or block.
    if (difficulty === 'hard' && choices.length > 2 && Math.random() < 0.08) {
      const alternatives = choices.filter(choice => {
        board[choice.move] = mark;
        const danger = immediateWins(board, OTHER[mark], lines, available(board)).length;
        board[choice.move] = null;
        return danger === 0;
      });
      if (alternatives.length) return pick(alternatives);
    }
    return choices[0].move;
  }
  return searchMove(board, size, mark, difficulty, lines);
}
