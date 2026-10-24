import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MESSAGES, RoomError, ROOM_LIFETIME, advance, applyAction, applyInput, authenticate, createRoom, expired,
  joinRoom, publicRoom, rejoin, sanitizeInput, settle,
} from './rooms.ts';
import { aiInput } from '../game/engine.js';

function setup() {
  let time = 100000;
  const online = [true, true];
  const presence = side => online[side];
  const { room, token: host } = createRoom('ABC234', 'Host', 3, time);
  const { token: guest } = joinRoom(room, 'Guest', time);
  return { room, host, guest, online, presence, now: () => time, tick(ms = 84) { time += ms; return time; } };
}
const started = () => { const s = setup(); applyAction(s.room, 0, 'start', s.tick(), s.presence); return s; };

test('room creation, seat authentication, host start and no secrets in the public view', () => {
  const s = setup();
  assert.equal(s.room.status, 'waiting');
  assert.match(s.host, /^[a-f0-9]{64}$/);
  assert.equal(authenticate(s.room, s.host), 0);
  assert.equal(authenticate(s.room, s.guest), 1);
  assert.equal(authenticate(s.room, 'f'.repeat(64)), null);
  const view = JSON.stringify(publicRoom(s.room, 0, s.now(), s.presence));
  assert.ok(!view.includes(s.host) && !view.includes(s.guest));
  assert.throws(() => applyAction(s.room, 1, 'start', s.tick(), s.presence), (e) => e instanceof RoomError && e.status === 403);
  s.online[1] = false;
  assert.throws(() => applyAction(s.room, 0, 'start', s.tick(), s.presence), /Wait for your friend/);
  s.online[1] = true;
  applyAction(s.room, 0, 'start', s.tick(), s.presence);
  assert.equal(s.room.status, 'playing');
});

test('a third player gets a clear full-room message, and a started match cannot be joined', () => {
  const s = setup();
  assert.throws(() => joinRoom(s.room, 'Third', s.now()), (e) => e.status === 409 && e.message === MESSAGES.full);
  const { room } = createRoom('XYZ234', 'Solo', 3, s.now());
  room.status = 'playing';
  assert.throws(() => joinRoom(room, 'Late', s.now()), (e) => e.status === 409 && e.message === MESSAGES.started);
});

test('a player who left is shown as left, and the invite link can fill that seat again', () => {
  const s = started();
  applyAction(s.room, 1, 'leave', s.tick(), s.presence);
  const view = publicRoom(s.room, 0, s.now(), s.presence);
  assert.equal(view.players[1].left, true);
  assert.equal(view.suspended, true);
  const again = joinRoom(s.room, 'Guest again', s.tick());
  assert.equal(again.side, 1);
  assert.equal(s.room.status, 'waiting', 'a new opponent starts from the lobby');
  assert.equal(s.room.round, 2);
});

test('controls are sanitized and old sequence numbers are ignored', () => {
  assert.deepEqual(sanitizeInput({ x: 99, depth: -4, aim: Infinity, power: 3, spin: 'curve', swing: 'yes' }), { x: 1.15, depth: 1.35, aim: 0, power: 1, spin: 'flat', swing: false, serve: false });
  const s = started();
  applyInput(s.room, 0, 5, { x: .5 }, s.tick(), s.presence);
  applyInput(s.room, 0, 4, { x: -.5 }, s.tick(), s.presence);
  applyInput(s.room, 0, 5, { x: -.7 }, s.tick(), s.presence);
  assert.equal(s.room.players[0].input.x, .5);
  applyInput(s.room, 0, 'x', { x: -.9 }, s.tick(), s.presence);
  assert.equal(s.room.players[0].input.x, .5);
});

test('a held serve starts exactly one point; releasing and pressing again serves the next', () => {
  const s = started();
  let seq = 0;
  const send = serve => { applyInput(s.room, 0, ++seq, { x: -.24, depth: 1.64, power: .45, swing: true, serve }, s.tick(), s.presence); applyInput(s.room, 1, seq, { x: 1.12, depth: 1.64 }, s.now(), s.presence); };
  send(false);
  send(true);
  assert.equal(s.room.state.phase, 'serve');
  assert.equal(s.room.players[0].input.serve, false, 'the one-shot command is not held');
  for (let i = 0; i < 120 && s.room.state.stats.points < 1; i++) send(true);
  for (let i = 0; i < 40; i++) send(true);
  assert.equal(s.room.state.stats.points, 1, 'one accepted serve plays one point');
  assert.equal(s.room.state.phase, 'ready', 'a held serve does not start the following point');
  send(false); send(true);
  assert.equal(s.room.state.phase, 'serve');
});

test('a dropped socket suspends the match; the same seat resumes with the score kept', () => {
  const s = started();
  s.room.state.score = [4, 3];
  s.online[1] = false;
  advance(s.room, s.tick(), s.presence);
  assert.equal(s.room.suspended, true);
  const frozen = s.room.state.time;
  advance(s.room, s.tick(5000), s.presence);
  assert.equal(s.room.state.time, frozen, 'no simulation while suspended');
  s.online[1] = true;
  rejoin(s.room, 1, s.now());
  advance(s.room, s.tick(), s.presence);
  assert.equal(s.room.suspended, false);
  assert.deepEqual(s.room.state.score, [4, 3]);
});

test('a rematch needs both votes, including across a drop', () => {
  const s = started();
  s.room.status = 'finished'; s.room.state.phase = 'matchover';
  assert.throws(() => applyAction(setup().room, 0, 'rematch', s.now(), s.presence), /Finish the current match/);
  applyAction(s.room, 0, 'rematch', s.tick(), s.presence);
  assert.equal(s.room.status, 'finished');
  s.online[0] = false;
  applyAction(s.room, 1, 'rematch', s.tick(), s.presence);
  assert.equal(s.room.status, 'finished');
  s.online[0] = true;
  settle(s.room, s.tick(), s.presence);
  assert.equal(s.room.status, 'playing');
  assert.equal(s.room.round, 2);
  assert.deepEqual(s.room.state.score, [0, 0]);
});

test('long gaps cannot trigger unbounded catch-up, and idle rooms expire', () => {
  const s = started();
  s.room.lastTick = s.now() - 10_000_000;
  advance(s.room, s.now(), s.presence);
  assert.ok(s.room.state.time <= 1.01);
  assert.equal(expired(s.room, s.now() + ROOM_LIFETIME + 1), true);
  assert.equal(expired(s.room, s.now() + 1000), false);
});

test('snapshots carry only new events and stay small', () => {
  const s = started();
  for (let i = 0; i < 60; i++) advance(s.room, s.tick(), s.presence);
  const all = publicRoom(s.room, 0, s.now(), s.presence, 0);
  const fresh = publicRoom(s.room, 0, s.now(), s.presence, s.room.state.eventId);
  assert.equal(fresh.state.events.length, 0);
  assert.ok(JSON.stringify(fresh).length < 2600, `snapshot is ${JSON.stringify(fresh).length} bytes`);
  assert.ok(all.state.events.length >= fresh.state.events.length);
});

test('two seats driven by the AI play physical rallies with authoritative scoring', () => {
  const s = started();
  let longest = 0, points = 0, hits = 0, seen = 0;
  let memory = JSON.parse(JSON.stringify(s.room.state.ai)), rng = s.room.state.rng;
  for (let frame = 0; frame < 4000; frame++) {
    const now = s.tick(40);
    const model = JSON.parse(JSON.stringify(s.room.state));
    model.ai = memory; model.rng = rng;
    const inputs = [aiInput(model, 0, 4), aiInput(model, 1, 4)];
    memory = model.ai; rng = model.rng;
    if (s.room.state.rally >= 4) inputs[1] = { ...inputs[1], x: 1.13 };
    applyInput(s.room, 0, frame + 1, inputs[0], now, s.presence);
    applyInput(s.room, 1, frame + 1, inputs[1], now, s.presence);
    longest = Math.max(longest, s.room.state.rally);
    points = Math.max(points, s.room.state.stats.points);
    for (const event of s.room.state.events) if (event.id > seen) { if (event.type === 'paddle') hits++; seen = event.id; }
    if (longest >= 4 && points >= 3) break;
  }
  assert.ok(longest >= 4, `expected a rally, got ${longest} hits`);
  assert.ok(points >= 3, `expected scoring, got ${points} points`);
  assert.ok(hits >= 6, `expected paddle contacts, got ${hits}`);
});
