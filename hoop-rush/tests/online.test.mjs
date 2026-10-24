import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ABANDON_AFTER, ArenaError, ROOM_LIFETIME, advance, authenticate, createRoom, expired, isRoomCode, joinRoom, leave,
  rematch, setReady, shoot, touch, view,
} from '../lib/arena-rules.ts';
import { simulateShot } from '../lib/physics.mjs';

// The Durable Object (lib/arena-room.ts) runs exactly these steps for every
// message: touch() the seats with an open socket, advance() the clock, apply
// the action, then send view(). This harness does the same with a fake clock
// and a controllable set of connected seats.
function setup({ simulate = simulateShot } = {}) {
  let now = 1800000000000;
  let room = null;
  const online = new Set([0, 1]);
  const present = (seat) => online.has(seat);
  const step = () => { touch(room, now, present); advance(room, now); };
  const state = (window = 3000) => { step(); return view(room, now, present, window); };
  const act = (fn) => {
    step();
    try {
      const value = fn();
      return { status: 200, duplicate: value === 'duplicate', state: view(room, now, present) };
    } catch (error) {
      if (!(error instanceof ArenaError)) throw error;
      return { status: error.status, code: error.code, message: error.message };
    }
  };
  return {
    online, present, state, act,
    get room() { return room; },
    time: () => now, advance: (ms) => { now += ms; }, setTime: (ms) => { now = ms; },
    async players(names = ['Ludvig', 'Friend']) {
      const created = await createRoom('ABCDEF', names[0], now);
      room = created.room;
      const joined = await joinRoom(room, names[1], now, present);
      assert.equal(joined.seat, 1);
      return [{ seat: 0, token: created.token }, { seat: 1, token: joined.token }];
    },
    start() {
      assert.equal(act(() => setReady(room, 0, now)).state.status, 'waiting');
      const second = act(() => setReady(room, 1, now));
      assert.equal(second.state.status, 'countdown');
      assert.equal(second.state.startAt, now + 3000);
      now += 3000;
      return second.state;
    },
    shot(seat, id, extra = {}) {
      return act(() => shoot(room, seat, { t: 'shot', id, aim: 0, power: 0.58, ...extra }, now, simulate));
    },
  };
}

test('room codes, sanitized names, hashed tokens and two real seats', async () => {
  assert.equal(isRoomCode('ABC234'), true);
  for (const bad of ['abc234', 'ABC23', 'ABCDEFG', 'ABCDE0', 'ABCDEI', 7]) assert.equal(isRoomCode(bad), false);
  const t = setup();
  const [p0, p1] = await t.players(['<Ludvig>\u0000', '']);
  assert.match(p0.token, /^[a-f0-9]{64}$/);
  const state = t.state();
  assert.equal(state.players[0].name, 'Ludvig');
  assert.equal(state.players[1].name, 'Player 2');
  assert.ok(!JSON.stringify(state).includes(p0.token));
  assert.ok(!JSON.stringify(state).includes('tokenHash'));
  assert.ok(!JSON.stringify(t.room).includes(p0.token), 'only the hash is stored');
  assert.equal(await authenticate(t.room, p0.token), 0);
  assert.equal(await authenticate(t.room, p1.token), 1);
  assert.equal(await authenticate(t.room, 'a'.repeat(64)), null);
  assert.equal(await authenticate(t.room, ''), null);
  await assert.rejects(joinRoom(t.room, 'Third', t.time(), t.present), (error) => error.status === 409 && error.code === 'room_full');
});

test('a lobby seat whose player is gone can be taken; a present player keeps theirs', async () => {
  const t = setup();
  const [, p1] = await t.players();
  t.online.delete(1);
  t.advance(3000);
  t.state();
  await assert.rejects(joinRoom(t.room, 'Too soon', t.time(), t.present), /full/);
  t.advance(6000);
  const fresh = await joinRoom(t.room, 'New friend', t.time(), t.present);
  assert.equal(fresh.seat, 1);
  assert.equal(await authenticate(t.room, p1.token), null);
  assert.equal(t.state().players[1].name, 'New friend');
});

test('both players must ready, and countdown closes shooting until the server start time', async () => {
  const t = setup();
  await t.players();
  assert.equal(t.shot(0, 'shot-before').status, 409);
  t.act(() => setReady(t.room, 0, t.time()));
  const start = t.act(() => setReady(t.room, 1, t.time()));
  assert.equal(start.state.status, 'countdown');
  t.advance(2999);
  assert.equal(t.shot(0, 'still-before').status, 409);
  t.advance(1);
  assert.equal(t.shot(0, 'now-allowed').status, 200);
});

test('real physics decides a basket, shown only after the actual crossing; forged fields are ignored', async () => {
  const t = setup();
  await t.players();
  t.start();
  const prediction = simulateShot({ aim: 0, power: 0.58, shotTime: 0, challenge: 'classic' });
  assert.equal(prediction.scored, true);
  const fired = t.shot(0, 'physical-shot', { score: 9999, scored: true, velocity: { y: 1e10 }, shotAt: 0 });
  assert.equal(fired.status, 200);
  assert.deepEqual(fired.state.scores, [0, 0]);
  assert.equal(fired.state.recentShots[0].scored, false);
  assert.deepEqual(fired.state.made, [0, 0]);
  t.advance(Math.round(prediction.scoreTime * 1000) - 1);
  assert.deepEqual(t.state().scores, [0, 0]);
  t.advance(1);
  const scored = t.state();
  assert.deepEqual(scored.scores, [2, 0]);
  assert.equal(scored.recentShots[0].scored, true);
  assert.deepEqual(scored.made, [1, 0]);
  assert.deepEqual(scored.combo, [1, 0]);
});

test('a physical miss cannot become points through client-supplied fields', async () => {
  const t = setup();
  await t.players();
  t.start();
  t.shot(0, 'wide-miss', { aim: 1, power: 0.12, scored: true, score: 42, scoreAt: 1 });
  t.advance(7000);
  const state = t.state();
  assert.deepEqual(state.scores, [0, 0]);
  assert.deepEqual(state.shots, [1, 0]);
});

test('shot IDs are idempotent and recovery is enforced at server receipt time', async () => {
  const t = setup();
  await t.players();
  t.start();
  t.shot(0, 'repeat-me');
  const duplicate = t.shot(0, 'repeat-me', { aim: 1 });
  assert.equal(duplicate.duplicate, true);
  assert.deepEqual(duplicate.state.shots, [1, 0]);
  t.advance(419);
  assert.equal(t.shot(0, 'too-soon').status, 429);
  t.advance(1);
  assert.equal(t.shot(0, 'ready-again').status, 200);
  assert.deepEqual(t.state().shots, [2, 0]);
});

test('shots from both players in the same instant both count', async () => {
  const t = setup();
  await t.players();
  t.start();
  assert.equal(t.shot(0, 'player-one').status, 200);
  assert.equal(t.shot(1, 'player-two').status, 200);
  t.advance(2000);
  const state = t.state();
  assert.deepEqual(state.shots, [1, 1]);
  assert.deepEqual(state.scores, [2, 2]);
});

test('late valid shots settle after the buzzer for three points; post-buzzer shots are rejected', async () => {
  const t = setup();
  await t.players();
  const start = t.start();
  t.setTime(start.endAt - 100);
  assert.equal(t.shot(0, 'buzzer-beater').status, 200);
  t.advance(100);
  assert.equal(t.shot(1, 'too-late-shot').status, 409);
  assert.equal(t.state().status, 'settling');
  t.advance(3001);
  const completed = t.state();
  assert.equal(completed.status, 'finished');
  assert.equal(completed.winner, 0);
  assert.equal(completed.resultReason, 'score');
  assert.deepEqual(completed.scores, [3, 0]);
});

test('rematches need both players, reset everything and allow the same shot ID again', async () => {
  const t = setup();
  await t.players();
  const start = t.start();
  t.shot(0, 'reusable-id');
  t.setTime(start.endAt + 3001);
  assert.equal(t.state().status, 'finished');
  const first = t.act(() => rematch(t.room, 0, t.time()));
  assert.equal(first.state.status, 'finished');
  assert.equal(first.state.players[0].ready, true);
  const second = t.act(() => rematch(t.room, 1, t.time()));
  assert.equal(second.state.status, 'countdown');
  assert.equal(second.state.round, 2);
  assert.deepEqual(second.state.scores, [0, 0]);
  assert.deepEqual(second.state.shots, [0, 0]);
  assert.deepEqual(second.state.maxCombo, [0, 0]);
  t.advance(3000);
  assert.equal(t.shot(0, 'reusable-id').duplicate, false);
  assert.equal(t.shot(0, 'old-round', { round: 1 }).status, 409);
});

test('a tie opens a shared 15-second overtime with cumulative scores', async () => {
  const t = setup();
  await t.players();
  const start = t.start();
  t.shot(0, 'tie-player0');
  t.shot(1, 'tie-player1');
  t.setTime(start.endAt + 3001);
  const overtime = t.state();
  assert.equal(overtime.status, 'countdown');
  assert.equal(overtime.overtime, 1);
  assert.equal(overtime.duration, 15);
  assert.deepEqual(overtime.scores, [2, 2]);
  assert.deepEqual(overtime.made, [1, 1]);
  t.setTime(overtime.startAt);
  assert.equal(t.shot(0, 'tie-player0').duplicate, true);
  t.shot(1, 'overtime-winner');
  t.setTime(overtime.settleAt + 1);
  const final = t.state();
  assert.equal(final.winner, 1);
  assert.deepEqual(final.scores, [2, 4]);
  assert.deepEqual(final.maxCombo, [1, 2]);
});

test('a short drop keeps the seat; the same token reconnects with full stats', async () => {
  const t = setup();
  const [, p1] = await t.players();
  t.start();
  t.shot(1, 'reconnect-shot');
  t.online.delete(1);
  t.advance(7000);
  const dropped = t.state();
  assert.equal(dropped.status, 'playing');
  assert.equal(dropped.players[1].connected, false);
  assert.equal(await authenticate(t.room, p1.token), 1);
  t.online.add(1);
  const back = t.state();
  assert.equal(back.players[1].connected, true);
  assert.deepEqual(back.scores, [0, 2]);
  assert.deepEqual(back.made, [0, 1]);
});

test('an opponent gone for good during a match loses by disconnect', async () => {
  const t = setup();
  await t.players();
  t.start();
  t.shot(1, 'before-drop');
  t.online.delete(1);
  t.advance(ABANDON_AFTER - 1);
  assert.equal(t.state().status, 'playing');
  t.advance(1);
  const ended = t.state();
  assert.equal(ended.status, 'finished');
  assert.equal(ended.winner, 0);
  assert.equal(ended.resultReason, 'disconnect');
});

test('after a result, a friend who closed the game is marked as left', async () => {
  const t = setup();
  const [, p1] = await t.players();
  const start = t.start();
  t.shot(0, 'winner');
  t.setTime(start.endAt + 5000);
  assert.equal(t.state().status, 'finished');
  t.online.delete(1);
  t.advance(ABANDON_AFTER);
  const state = t.state();
  assert.equal(state.players[1].left, true);
  assert.equal(await authenticate(t.room, p1.token), null);
  t.act(() => rematch(t.room, 0, t.time()));
  assert.equal(t.state().status, 'finished', 'a rematch never starts against a player who left');
});

test('several baskets are all counted for a client that reconnects later', async () => {
  const t = setup();
  await t.players();
  t.start();
  for (let index = 0; index < 4; index++) { t.shot(0, `batch-make-${index}`); t.advance(500); }
  t.advance(15000);
  const restored = t.state(6000);
  assert.deepEqual(restored.recentShots, []);
  assert.deepEqual(restored.scores, [8, 0]);
  assert.deepEqual(restored.made, [4, 0]);
  assert.deepEqual(restored.combo, [4, 0]);
});

test('pending misses do not reveal themselves or let later makes inflate release-order streaks', async () => {
  const t = setup({ simulate: ({ aim }) => ({
    scored: aim === 0, swish: aim === 0, scoreTime: aim === 0 ? 1.2 : null, flightTime: aim === 0 ? 1.2 : 4, contacts: {},
  }) });
  await t.players();
  t.start();
  for (const [index, aim] of [0, 0, 1, 0, 0].entries()) { t.shot(0, `ordered-${index}`, { aim }); t.advance(500); }
  t.advance(800);
  const pending = t.state();
  assert.deepEqual(pending.made, [4, 0]);
  assert.deepEqual(pending.combo, [2, 0]);
  assert.ok(!JSON.stringify(pending).includes('resolvedAt'));
  t.advance(2200);
  t.shot(0, 'last-miss', { aim: 1 });
  t.advance(3999);
  assert.deepEqual(t.state().combo, [2, 0]);
  t.advance(1);
  const miss = t.state();
  assert.deepEqual(miss.combo, [0, 0]);
  assert.deepEqual(miss.maxCombo, [2, 0]);
});

test('sudden death closes shooting on the first basket and lets airborne replies settle', async () => {
  const t = setup();
  await t.players();
  const start = t.start();
  t.setTime(start.settleAt + 1);
  const overtime = t.state();
  t.setTime(overtime.startAt);
  t.shot(0, 'sudden-first');
  t.advance(600);
  t.shot(1, 'airborne-reply');
  t.advance(700);
  assert.equal(t.shot(0, 'after-first-make').status, 409);
  const settling = t.state();
  assert.equal(settling.status, 'settling');
  assert.ok(settling.endAt < overtime.endAt);
  t.setTime(settling.settleAt + 1);
  const tied = t.state();
  assert.equal(tied.overtime, 2);
  assert.deepEqual(tied.scores, [2, 2]);
  t.setTime(tied.startAt);
  t.shot(0, 'sudden-winner');
  t.advance(5000);
  const result = t.state();
  assert.equal(result.status, 'finished');
  assert.equal(result.winner, 0);
  assert.deepEqual(result.scores, [4, 2]);
});

test('two empty overtimes end in a draw instead of trapping both players', async () => {
  const t = setup();
  await t.players();
  const start = t.start();
  t.setTime(start.settleAt + 1);
  let state = t.state();
  for (let period = 1; period <= 2; period++) { t.setTime(state.settleAt + 1); state = t.state(); }
  assert.equal(state.status, 'finished');
  assert.equal(state.resultReason, 'draw');
  assert.equal(state.winner, null);
});

test('leaving a live match is a forfeit, freezes airborne balls and ends that session', async () => {
  const t = setup();
  const [p0] = await t.players();
  t.start();
  t.shot(0, 'airborne-at-forfeit');
  t.advance(100);
  const left = t.act(() => leave(t.room, 0, t.time()));
  assert.equal(left.state.status, 'finished');
  assert.equal(left.state.winner, 1);
  assert.equal(left.state.resultReason, 'forfeit');
  assert.equal(left.state.players[0].left, true);
  t.advance(7000);
  const later = t.state();
  assert.deepEqual(later.scores, [0, 0]);
  assert.equal(later.recentShots.length, 0);
  assert.equal(await authenticate(t.room, p0.token), null);
});

test('leaving the lobby frees the seat and clears ready', async () => {
  const t = setup();
  await t.players();
  t.act(() => setReady(t.room, 0, t.time()));
  t.act(() => leave(t.room, 1, t.time()));
  const state = t.state();
  assert.equal(state.players[1], null);
  assert.equal(state.players[0].ready, false);
});

test('invalid shots fail clearly; rooms expire; messages stay small', async () => {
  const t = setup();
  await t.players();
  t.start();
  for (const fields of [{ aim: 1.01 }, { aim: null }, { power: 0 }, { power: 1.01 }, { id: '../bad' }]) {
    assert.equal(t.shot(0, 'invalid-shot', fields).status, 400);
  }
  for (let i = 0; i < 6; i++) { t.shot(0, `size-a-${i}`); t.shot(1, `size-b-${i}`); t.advance(430); }
  const size = JSON.stringify({ t: 'state', state: t.state() }).length;
  assert.ok(size < 2000, `state message is ${size} bytes`);
  assert.equal(expired(t.room, t.time()), false);
  t.setTime(t.room.createdAt + ROOM_LIFETIME);
  assert.equal(expired(t.room, t.time()), true);
});
