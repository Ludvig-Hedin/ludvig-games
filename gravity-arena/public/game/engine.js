/**
 * Gravity Arena's shared rules. This module has no browser or server dependencies.
 * A stack is x + width*z; a cell is stack + width*depth*y (y=0 is the floor).
 */

/** @typedef {'3d'|'classic'} Variant */
/** @typedef {{stack:number,index:number,player:1|2,ply:number}} Move */
/** @typedef {{variant:Variant,board:number[],heights:number[],turn:1|2,winner:null|0|1|2,winningLines:number[][],moves:Move[],startingPlayer:1|2}} GameState */

const DIMENSIONS = Object.freeze({
  '3d': Object.freeze({ width: 4, depth: 4, height: 4, stacks: 16, cells: 64 }),
  classic: Object.freeze({ width: 7, depth: 1, height: 6, stacks: 7, cells: 42 }),
});

/** @param {Variant} variant */
export function getDimensions(variant = '3d') {
  const dimensions = DIMENSIONS[variant];
  if (!dimensions) throw new Error('Unknown board variant.');
  return dimensions;
}

function enumerateLines(variant) {
  const { width, depth, height, stacks } = getDimensions(variant);
  const lines = [];
  // Keep one orientation of each of the 13 undirected vectors in a cube.
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dz = -1; dz <= 1; dz++) {
        if (!dx && !dy && !dz) continue;
        if ((dx || dy || dz) < 0) continue;
        for (let y = 0; y < height; y++) {
          for (let z = 0; z < depth; z++) {
            for (let x = 0; x < width; x++) {
              const end = [x + dx * 3, y + dy * 3, z + dz * 3];
              if (end[0] < 0 || end[0] >= width || end[1] < 0 || end[1] >= height || end[2] < 0 || end[2] >= depth) continue;
              lines.push(Object.freeze(Array.from({ length: 4 }, (_, i) => x + dx * i + width * (z + dz * i) + stacks * (y + dy * i))));
            }
          }
        }
      }
    }
  }
  return Object.freeze(lines);
}

const LINES = Object.freeze({ '3d': enumerateLines('3d'), classic: enumerateLines('classic') });
const CELL_LINES = {};
for (const variant of ['3d', 'classic']) {
  CELL_LINES[variant] = Array.from({ length: getDimensions(variant).cells }, () => []);
  for (const line of LINES[variant]) for (const cell of line) CELL_LINES[variant][cell].push(line);
}

/** @param {Variant} variant @returns {ReadonlyArray<ReadonlyArray<number>>} */
export function getWinningLines(variant = '3d') {
  getDimensions(variant);
  return LINES[variant];
}

/** @param {Variant} variant @param {1|2} startingPlayer @returns {GameState} */
export function createGame(variant = '3d', startingPlayer = 1) {
  const { cells, stacks } = getDimensions(variant);
  if (startingPlayer !== 1 && startingPlayer !== 2) throw new Error('Invalid starting player.');
  return {
    variant, board: Array(cells).fill(0), heights: Array(stacks).fill(0),
    turn: startingPlayer, winner: null, winningLines: [], moves: [], startingPlayer,
  };
}

/** @param {number} index @param {Variant} variant */
export function indexToPosition(index, variant = '3d') {
  const { width, stacks, cells } = getDimensions(variant);
  if (!Number.isInteger(index) || index < 0 || index >= cells) throw new Error('Invalid cell.');
  return { x: index % width, y: Math.floor(index / stacks), z: Math.floor((index % stacks) / width) };
}

/** @param {number} stack @param {Variant} variant */
export function stackLabel(stack, variant = '3d') {
  const { width, stacks } = getDimensions(variant);
  if (!Number.isInteger(stack) || stack < 0 || stack >= stacks) throw new Error('Invalid stack.');
  return variant === 'classic' ? String(stack + 1) : `${String.fromCharCode(65 + stack % width)}${Math.floor(stack / width) + 1}`;
}

/** @param {GameState} state @returns {number[]} */
export function getLegalMoves(state) {
  if (state.winner !== null) return [];
  const { height } = getDimensions(state.variant);
  return state.heights.flatMap((filled, stack) => filled < height ? [stack] : []);
}

/** Apply one legal move without mutating any earlier state. @param {GameState} state @param {number} stack @returns {GameState} */
export function applyMove(state, stack) {
  const { stacks, height, cells } = getDimensions(state.variant);
  if (state.winner !== null) throw new Error('This round is finished.');
  if (!Number.isInteger(stack) || stack < 0 || stack >= stacks) throw new Error('Choose a valid stack.');
  if (state.heights[stack] >= height) throw new Error('That stack is full.');
  const index = stack + stacks * state.heights[stack];
  if (state.board[index] !== 0) throw new Error('Invalid board position.');
  const board = state.board.slice();
  const heights = state.heights.slice();
  board[index] = state.turn;
  heights[stack]++;
  const moves = [...state.moves, { stack, index, player: state.turn, ply: state.moves.length + 1 }];
  const winningLines = CELL_LINES[state.variant][index].filter(line => line.every(cell => board[cell] === state.turn)).map(line => [...line]);
  const winner = winningLines.length ? state.turn : moves.length === cells ? 0 : null;
  return {
    ...state, board, heights, moves, winningLines, winner,
    turn: winner === null ? /** @type {1|2} */ (3 - state.turn) : state.turn,
  };
}

/** @param {GameState} state @param {number} count @returns {GameState} */
export function undoMoves(state, count = 1) {
  if (!Number.isInteger(count) || count < 0) throw new Error('Invalid undo count.');
  let result = createGame(state.variant, state.startingPlayer);
  for (const move of state.moves.slice(0, Math.max(0, state.moves.length - count))) result = applyMove(result, move.stack);
  return result;
}

/** Reconstruct saves exclusively from legal moves; reject corrupted or forged state. @param {unknown} value @returns {GameState} */
export function restoreGame(value) {
  if (!value || typeof value !== 'object') throw new Error('This saved game is invalid.');
  const saved = /** @type {GameState} */ (value);
  const dimensions = getDimensions(saved.variant);
  if (!Array.isArray(saved.moves) || saved.moves.length > dimensions.cells) throw new Error('Invalid saved move history.');
  let result = createGame(saved.variant, saved.startingPlayer);
  for (const move of saved.moves) {
    if (!move || typeof move !== 'object') throw new Error('Invalid saved move.');
    result = applyMove(result, move.stack);
    const actual = result.moves[result.moves.length - 1];
    if (actual.index !== move.index || actual.player !== move.player || actual.ply !== move.ply) throw new Error('Saved move history is inconsistent.');
  }
  if (!Array.isArray(saved.board) || saved.board.length !== dimensions.cells || saved.board.some((cell, i) => cell !== result.board[i])) throw new Error('Saved board is inconsistent.');
  if (!Array.isArray(saved.heights) || saved.heights.length !== dimensions.stacks || saved.heights.some((n, i) => n !== result.heights[i])) throw new Error('Saved stacks are inconsistent.');
  if (saved.turn !== result.turn || saved.winner !== result.winner) throw new Error('Saved turn is inconsistent.');
  return result;
}
