import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_CONFIG, uciMove, type GameConfig } from '../lib/game.ts';
import { createRoom, joinRoom, mutateRoom, RoomError, seatFor, type RoomAction, type RoomState } from '../lib/room.ts';

const START = 1_000_000;
const WHITE = 'white-secret-hash';
const BLACK = 'black-secret-hash';
const SPECTATOR = 'spectator-secret-hash';
let requestSequence = 0;
function config(overrides: Partial<GameConfig> = {}): GameConfig {
  return { ...DEFAULT_CONFIG, mode: 'online', color: 'w', nickname: 'Ada', time: { minutes: 5, increment: 2, label: '5 + 2' }, ...overrides };
}
function ready(): RoomState { return joinRoom(createRoom(config(), WHITE, START), BLACK, 'Grace', START + 5000); }
function request(state: RoomState, action: RoomAction['action'], rest: Partial<RoomAction> = {}): RoomAction {
  return { action, revision: state.game.revision, requestId: `request-${++requestSequence}`, ...rest };
}
function play(state: RoomState, hash: string, uci: string, now = START + 6000): RoomState {
  return mutateRoom(state, hash, request(state, 'move', { move: uciMove(uci) }), now);
}
function errorStatus(fn: () => unknown, status: number, match?: RegExp): void {
  assert.throws(fn, (error: unknown) => error instanceof RoomError && error.status === status && (!match || match.test(error.message)));
}

test('rooms start with one secret-bound seat and a paused lobby', () => {
  const room = createRoom(config(), WHITE, START);
  assert.equal(seatFor(room, WHITE), 'w');
  assert.equal(seatFor(room, BLACK), null);
  assert.equal(seatFor(room, ''), null);
  assert.equal(room.seats.b, null);
  assert.equal(room.game.waiting, true);
  assert.equal(room.game.clocks.running, null);
  errorStatus(() => mutateRoom(room, WHITE, request(room, 'move', { move: uciMove('e2e4') }), START), 409);
});

test('host may select black, guest takes white and the correct clock starts on joining', () => {
  let room = createRoom(config({ color: 'b' }), BLACK, START);
  assert.equal(seatFor(room, BLACK), 'b');
  room = joinRoom(room, WHITE, 'Grace', START + 50_000);
  assert.equal(seatFor(room, WHITE), 'w');
  assert.deepEqual(room.game.players, { w: 'Grace', b: 'Ada' });
  assert.equal(room.game.waiting, false);
  assert.equal(room.game.startedAt, START + 50_000);
  assert.equal(room.game.clocks.anchor, START + 50_000);
  assert.equal(room.game.clocks.running, 'w');
  assert.equal(room.game.clocks.w, 300_000);
});

test('reconnection with the same hash retains the seat without changing names or clocks', () => {
  const room = ready();
  assert.equal(joinRoom(room, WHITE, 'Changed name', START + 30_000), room);
  assert.equal(joinRoom(room, BLACK, 'Changed name', START + 30_000), room);
  assert.deepEqual(room.game.players, { w: 'Ada', b: 'Grace' });
  errorStatus(() => joinRoom(room, SPECTATOR, 'Watcher', START + 30_000), 409, /seats/);
});

test('spectators cannot move, resign, offer, accept, claim or rematch', () => {
  const room = ready();
  const actions: RoomAction['action'][] = ['move', 'resign', 'offer-draw', 'accept-draw', 'decline-draw', 'claim-draw', 'rematch'];
  for (const action of actions) {
    errorStatus(() => mutateRoom(room, SPECTATOR, request(room, action, { move: uciMove('e2e4'), claim: 'threefold' }), START + 6000), 403, /Spectators/);
  }
  assert.equal(room.game.moves.length, 0);
});

test('server rejects out-of-turn moves and attempts to move an opponent piece', () => {
  const room = ready();
  errorStatus(() => play(room, BLACK, 'e7e5'), 403, /turn/);
  errorStatus(() => play(room, WHITE, 'e7e5'), 400, /legal/);
  errorStatus(() => play(room, WHITE, 'e2e5'), 400, /legal/);
  assert.equal(room.game.revision, 1);
  assert.equal(room.game.moves.length, 0);
});

test('server applies only legal moves with authoritative elapsed time and increments', () => {
  let room = ready();
  room = play(room, WHITE, 'e2e4', START + 10_000);
  assert.equal(room.game.moves[0].san, 'e4');
  assert.equal(room.game.clocks.w, 297_000);
  assert.equal(room.game.clocks.b, 300_000);
  assert.equal(room.game.clocks.running, 'b');
  room = play(room, BLACK, 'e7e5', START + 14_000);
  assert.equal(room.game.clocks.b, 298_000);
  assert.equal(room.game.clocks.running, 'w');
  assert.equal(room.game.revision, 3);
});

test('replaying an accepted request is idempotent, even with its stale revision', () => {
  const before = ready();
  const action = request(before, 'move', { move: uciMove('e2e4') });
  const moved = mutateRoom(before, WHITE, action, START + 6000);
  const repeated = mutateRoom(moved, WHITE, action, START + 25_000);
  assert.equal(repeated, moved);
  assert.equal(repeated.game.moves.length, 1);
  assert.equal(repeated.game.clocks.w, 301_000);
  assert.equal(repeated.requests.length, 1);
});

test('request identifiers are scoped to the authenticated seat', () => {
  const before = ready();
  const whiteAction = request(before, 'move', { move: uciMove('e2e4') });
  const afterWhite = mutateRoom(before, WHITE, whiteAction, START + 6000);
  const afterBlack = mutateRoom(afterWhite, BLACK, { ...whiteAction, revision: afterWhite.game.revision, move: uciMove('e7e5') }, START + 7000);
  assert.equal(afterBlack.game.moves.length, 2);
  assert.equal(afterBlack.requests.length, 2);
});

test('stale and future revisions cannot commit moves', () => {
  const room = ready();
  errorStatus(() => mutateRoom(room, WHITE, request(room, 'move', { revision: room.game.revision - 1, move: uciMove('e2e4') }), START + 6000), 409);
  errorStatus(() => mutateRoom(room, WHITE, request(room, 'move', { revision: room.game.revision + 1, move: uciMove('e2e4') }), START + 6000), 409);
  assert.equal(room.game.moves.length, 0);
});

test('malformed request IDs, square names and promotions are rejected', () => {
  const room = ready();
  for (const requestId of ['', 'short', 'bad/request/id', 'x'.repeat(81)]) {
    errorStatus(() => mutateRoom(room, WHITE, request(room, 'move', { requestId, move: uciMove('e2e4') }), START + 6000), 400);
  }
  for (const move of [{ from: 'e9', to: 'e4' }, { from: 'e2', to: 'e4', promotion: 'k' }]) {
    errorStatus(() => mutateRoom(room, WHITE, request(room, 'move', { move }), START + 6000), 400);
  }
});

test('an expired authoritative clock ends the game before processing a submitted move', () => {
  const room = ready();
  const expired = play(room, WHITE, 'e2e4', START + 305_000);
  assert.equal(expired.game.result?.winner, 'b');
  assert.equal(expired.game.result?.reason, 'Time expired');
  assert.equal(expired.game.moves.length, 0);
  assert.equal(expired.game.clocks.w, 0);
});

test('a draw cannot be agreed before both players have moved', () => {
  const room = ready();
  errorStatus(() => mutateRoom(room, WHITE, request(room, 'offer-draw'), START + 6000), 400, /Both/);
  const one = play(room, WHITE, 'e2e4');
  errorStatus(() => mutateRoom(one, BLACK, request(one, 'offer-draw'), START + 7000), 400, /Both/);
});

test('draw offers must be answered by the opponent and do not reset clocks', () => {
  let room = play(play(ready(), WHITE, 'e2e4'), BLACK, 'e7e5', START + 7000);
  const clock = room.game.clocks;
  room = mutateRoom(room, WHITE, request(room, 'offer-draw'), START + 8000);
  assert.equal(room.game.drawOffer, 'w');
  assert.deepEqual(room.game.clocks, clock);
  errorStatus(() => mutateRoom(room, WHITE, request(room, 'accept-draw'), START + 9000), 400);
  errorStatus(() => mutateRoom(room, BLACK, request(room, 'offer-draw'), START + 9000), 400);
  room = mutateRoom(room, BLACK, request(room, 'accept-draw'), START + 10_000);
  assert.equal(room.game.result?.reason, 'Draw by agreement');
  assert.equal(room.game.result?.result, '1/2-1/2');
  assert.equal(room.game.drawOffer, null);
  assert.equal(room.game.clocks.running, null);
});

test('opponent can decline an offer explicitly or by making a move', () => {
  let room = play(play(ready(), WHITE, 'e2e4'), BLACK, 'e7e5', START + 7000);
  room = mutateRoom(room, BLACK, request(room, 'offer-draw'), START + 8000);
  const declined = mutateRoom(room, WHITE, request(room, 'decline-draw'), START + 9000);
  assert.equal(declined.game.drawOffer, null);
  const moved = play(room, WHITE, 'g1f3', START + 9000);
  assert.equal(moved.game.drawOffer, null);
});

test('the offering player cannot withdraw an offer by moving', () => {
  let room = play(play(ready(), WHITE, 'e2e4'), BLACK, 'e7e5', START + 7000);
  room = mutateRoom(room, WHITE, request(room, 'offer-draw'), START + 8000);
  room = play(room, WHITE, 'g1f3', START + 9000);
  assert.equal(room.game.drawOffer, 'w');
});

test('threefold is server-verifiable and only the player to move may claim it', () => {
  let room = ready();
  const moves = ['g1f3', 'g8f6', 'f3g1', 'f6g8', 'g1f3', 'g8f6', 'f3g1', 'f6g8'];
  for (const [index, move] of moves.entries()) room = play(room, index % 2 ? BLACK : WHITE, move, START + 6000 + index * 1000);
  assert.equal(room.game.result, null);
  errorStatus(() => mutateRoom(room, BLACK, request(room, 'claim-draw', { claim: 'threefold' }), START + 15_000), 403);
  const drawn = mutateRoom(room, WHITE, request(room, 'claim-draw', { claim: 'threefold' }), START + 15_000);
  assert.equal(drawn.game.result?.reason, 'Threefold repetition claimed');
});

test('false draw claims are rejected without changing game or clock anchor', () => {
  const room = ready();
  errorStatus(() => mutateRoom(room, WHITE, request(room, 'claim-draw', { claim: 'threefold' }), START + 6000), 400);
  errorStatus(() => mutateRoom(room, WHITE, request(room, 'claim-draw', { claim: 'fifty' }), START + 6000), 400);
  assert.equal(room.game.result, null);
  assert.equal(room.game.clocks.anchor, START + 5000);
});

test('resignation ends a match and blocks further play', () => {
  let room = ready();
  room = mutateRoom(room, WHITE, request(room, 'resign'), START + 6000);
  assert.equal(room.game.result?.winner, 'b');
  assert.equal(room.game.result?.reason, 'Resignation');
  errorStatus(() => play(room, BLACK, 'e7e5'), 409);
});

test('rematch requires consent from both players and swaps secrets with seats', () => {
  let room = ready();
  errorStatus(() => mutateRoom(room, WHITE, request(room, 'rematch'), START + 6000), 400);
  room = mutateRoom(room, WHITE, request(room, 'resign'), START + 7000);
  const oldId = room.game.id;
  room = mutateRoom(room, WHITE, request(room, 'rematch'), START + 8000);
  assert.deepEqual(room.game.rematchBy, ['w']);
  assert.equal(room.game.id, oldId);
  assert.equal(mutateRoom(room, WHITE, request(room, 'rematch'), START + 8500), room);
  const oldRevision = room.game.revision;
  room = mutateRoom(room, BLACK, request(room, 'rematch'), START + 9000);
  assert.notEqual(room.game.id, oldId);
  assert.equal(room.game.gameNumber, 2);
  assert.equal(room.game.revision, oldRevision + 1);
  assert.equal(seatFor(room, WHITE), 'b');
  assert.equal(seatFor(room, BLACK), 'w');
  assert.deepEqual(room.game.players, { w: 'Grace', b: 'Ada' });
  assert.equal(room.game.result, null);
  assert.equal(room.game.waiting, false);
  assert.equal(room.game.moves.length, 0);
  assert.equal(room.game.clocks.anchor, START + 9000);
  assert.equal(room.game.clocks.w, 300_000);
  errorStatus(() => play(room, WHITE, 'e2e4', START + 10_000), 403);
  room = play(room, BLACK, 'e2e4', START + 10_000);
  assert.equal(room.game.moves.length, 1);
});

test('mutations never alter a previous server snapshot', () => {
  const before = ready();
  const serialized = JSON.stringify(before);
  const after = play(before, WHITE, 'e2e4');
  assert.notEqual(after, before);
  assert.equal(JSON.stringify(before), serialized);
});
