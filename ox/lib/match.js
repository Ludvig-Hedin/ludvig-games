import { getResult, getWinLength } from '../public/engine.js';

export function createMatch({ size = 3, length = 3 } = {}) {
  const winLength = getWinLength(size);
  if (![0, 3, 5, 7].includes(length)) throw new Error('Invalid match length.');
  return {
    board: Array(size * size).fill(null),
    size,
    winLength,
    matchLength: length,
    target: length ? Math.floor(length / 2) + 1 : null,
    turn: 'X',
    starter: 'X',
    winner: null,
    line: [],
    draw: false,
    scores: { X: 0, O: 0, draw: 0 },
    round: 1,
    matchWinner: null,
    lastMove: null,
    moves: 0,
  };
}

export function applyMove(state, index) {
  if (state.winner || state.draw || state.matchWinner) throw new Error('This round is already finished.');
  if (!Number.isInteger(index) || index < 0 || index >= state.board.length || state.board[index] !== null) {
    throw new Error('Choose an empty square.');
  }
  const board = [...state.board];
  board[index] = state.turn;
  const result = getResult(board, state.size);
  const scores = { ...state.scores };
  if (result.winner) scores[result.winner]++;
  if (result.draw) scores.draw++;
  const matchWinner = result.winner && state.target && scores[result.winner] >= state.target ? result.winner : null;
  return {
    ...state,
    board,
    ...result,
    turn: state.turn === 'X' ? 'O' : 'X',
    scores,
    matchWinner,
    lastMove: index,
    moves: state.moves + 1,
  };
}

export function nextRound(state) {
  if (!state.winner && !state.draw) throw new Error('Finish this round first.');
  if (state.matchWinner) throw new Error('Start a new match.');
  const starter = state.starter === 'X' ? 'O' : 'X';
  return {
    ...state,
    board: Array(state.size * state.size).fill(null),
    turn: starter,
    starter,
    winner: null,
    line: [],
    draw: false,
    scores: { ...state.scores },
    round: state.round + 1,
    lastMove: null,
    moves: 0,
  };
}

export function restartMatch(state) {
  return createMatch({ size: state.size, length: state.matchLength });
}
