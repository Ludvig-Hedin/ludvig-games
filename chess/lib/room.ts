import type { Color } from 'chess.js';
import { chessOf, endGame, expireGame, makeMove, newGame, turnOf, type Game, type GameConfig } from './game';
import { claimDraw, opposite, resignationResult, type MoveInput } from './rules';

export interface RoomSeat { hash: string; name: string }
export interface RoomState { game: Game; seats: Record<Color, RoomSeat | null>; requests: { id: string; hash: string }[] }
export interface PublicRoom { code: string; revision: number; game: Game; serverNow: number; you: Color | 'spectator'; connected: Record<Color, boolean> }
export interface RoomAction {
  action: 'move' | 'resign' | 'offer-draw' | 'accept-draw' | 'decline-draw' | 'claim-draw' | 'rematch';
  requestId: string; revision: number; move?: MoveInput; claim?: 'threefold' | 'fifty';
}
export class RoomError extends Error { constructor(message: string, public status = 400) { super(message); } }
export function seatFor(state: RoomState, hash: string): Color | null {
  if (hash && state.seats.w?.hash === hash) return 'w';
  if (hash && state.seats.b?.hash === hash) return 'b';
  return null;
}
export function createRoom(config: GameConfig, hash: string, now: number): RoomState {
  const game = newGame({ ...config, mode: 'online' }, now);
  return { game, seats: { w: game.humanColor === 'w' ? { hash, name: config.nickname } : null, b: game.humanColor === 'b' ? { hash, name: config.nickname } : null }, requests: [] };
}
export function joinRoom(state: RoomState, hash: string, name: string, now: number): RoomState {
  if (seatFor(state, hash)) return state;
  const color: Color | null = !state.seats.w ? 'w' : !state.seats.b ? 'b' : null;
  if (!color) throw new RoomError('Both seats are taken. You can still watch this game.', 409);
  if (!state.game.waiting || state.game.result) throw new RoomError('This game has already started.', 409);
  const seats = { ...state.seats, [color]: { hash, name } };
  const game = { ...state.game, waiting: false, players: { w: seats.w!.name, b: seats.b!.name }, startedAt: now,
    clocks: { ...state.game.clocks, anchor: now, running: 'w' as Color }, revision: state.game.revision + 1 };
  return { ...state, seats, game };
}
export function mutateRoom(state: RoomState, hash: string, action: RoomAction, now: number): RoomState {
  const side = seatFor(state, hash);
  if (!side) throw new RoomError('Spectators cannot change a game.', 403);
  if (typeof action.requestId !== 'string' || !/^[a-zA-Z0-9-]{8,80}$/.test(action.requestId)) throw new RoomError('Invalid request identifier.');
  if (state.requests.some(r => r.id === action.requestId && r.hash === hash)) return state;
  if (action.revision !== state.game.revision) throw new RoomError('The position changed. Your board is being refreshed.', 409);
  let game = expireGame(state.game, now); let seats = state.seats;
  if (game !== state.game && game.result) return { ...state, game };
  if (action.action !== 'rematch' && (game.result || game.waiting)) throw new RoomError(game.waiting ? 'Waiting for a second player.' : 'This game has ended.', 409);
  switch (action.action) {
    case 'move':
      if (turnOf(game) !== side) throw new RoomError('It is not your turn.', 403);
      if (!action.move || !/^[a-h][1-8]$/.test(action.move.from) || !/^[a-h][1-8]$/.test(action.move.to) || (action.move.promotion && !/^[qrbn]$/.test(action.move.promotion))) throw new RoomError('Invalid move.');
      try { game = makeMove(game, action.move, now); } catch { throw new RoomError('That move is not legal.'); }
      break;
    case 'resign': game = endGame(game, resignationResult(chessOf(game), side), now); break;
    case 'offer-draw':
      if (game.moves.length < 2) throw new RoomError('Both players must make a move before offering a draw.');
      if (game.drawOffer) throw new RoomError('A draw offer is already pending.');
      game = { ...game, drawOffer: side, revision: game.revision + 1 }; break;
    case 'accept-draw':
      if (game.drawOffer !== opposite(side)) throw new RoomError('There is no opponent draw offer.');
      game = endGame(game, { winner: null, reason: 'Draw by agreement', result: '1/2-1/2' }, now); break;
    case 'decline-draw':
      if (game.drawOffer !== opposite(side)) throw new RoomError('There is no opponent draw offer.');
      game = { ...game, drawOffer: null, revision: game.revision + 1 }; break;
    case 'claim-draw': {
      if (turnOf(game) !== side) throw new RoomError('Only the player to move can claim a draw.', 403);
      if (action.claim !== 'fifty' && action.claim !== 'threefold') throw new RoomError('Choose a valid draw claim.');
      const result = claimDraw(chessOf(game), action.claim, action.move);
      if (!result) throw new RoomError('This position does not qualify for that draw claim.');
      game = endGame(game, result, now); break;
    }
    case 'rematch': {
      if (!game.result) throw new RoomError('Finish this game before requesting a rematch.');
      if (game.rematchBy.includes(side)) return state;
      const rematchBy = [...game.rematchBy, side];
      if (rematchBy.length < 2) { game = { ...game, rematchBy, revision: game.revision + 1 }; break; }
      const fresh = newGame({ ...game.config, color: opposite(game.humanColor) }, now);
      seats = { w: state.seats.b, b: state.seats.w };
      game = { ...fresh, waiting: false, players: { w: seats.w!.name, b: seats.b!.name }, clocks: { ...fresh.clocks, running: 'w', anchor: now }, revision: game.revision + 1, gameNumber: game.gameNumber + 1 };
      break;
    }
    default: throw new RoomError('Unknown game action.');
  }
  return { game, seats, requests: [...state.requests, { id: action.requestId, hash }].slice(-128) };
}
