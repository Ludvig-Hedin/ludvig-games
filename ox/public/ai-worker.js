import { chooseMove } from './engine.js';

self.onmessage = ({ data }) => {
  const { id, board, size, mark, difficulty } = data;
  try {
    self.postMessage({ id, move: chooseMove(board, size, mark, difficulty) });
  } catch (error) {
    self.postMessage({ id, move: -1, error: error instanceof Error ? error.message : 'The computer could not choose a move.' });
  }
};
