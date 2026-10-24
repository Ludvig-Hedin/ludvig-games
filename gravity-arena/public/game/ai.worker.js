import { chooseMove } from './ai.js';
import { restoreGame } from './engine.js';

self.onmessage = event => {
  const { id, state, difficulty = 'medium', hint = false } = event.data || {};
  try {
    const validated = restoreGame(state);
    const result = chooseMove(validated, hint ? 'expert' : difficulty);
    self.postMessage({ id, ...result });
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : 'The computer could not choose a move.' });
  }
};
