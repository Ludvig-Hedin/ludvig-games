import assert from 'node:assert/strict';
import { getEventListeners } from 'node:events';
import { test } from 'node:test';
import { abortableDelay, acceptsRoom, clockOffset, seatToken } from '../lib/online-sync.ts';
import { DEFAULT_CONFIG, newGame } from '../lib/game.ts';
import type { PublicRoom } from '../lib/room.ts';

function room(revision: number, serverNow: number, code = 'ABCDEFGH'): PublicRoom {
  return { code, revision, serverNow, game: newGame(DEFAULT_CONFIG), you: 'w', connected: { w: true, b: true } };
}

test('late long-poll snapshots cannot undo a newer move or presence observation', () => {
  assert.equal(acceptsRoom(room(4, 1000), room(3, 2000)), false);
  assert.equal(acceptsRoom(room(4, 2000), room(4, 1000)), false);
  assert.equal(acceptsRoom(room(4, 1000), room(4, 2000)), true);
  assert.equal(acceptsRoom(room(4, 2000), room(5, 1500)), true);
  assert.equal(acceptsRoom(null, room(0, 1000)), true);
});

test('clock offset excludes a 6.5-second long-poll wait from transport latency', () => {
  // Client sent at wall 5000. Server clock is +1000 ms. Outbound/inbound legs
  // each take 50 ms; the server holds the response for 6500 ms.
  assert.equal(clockOffset(12_550, 11_600, 6600, 'app;dur=6500'), 1000);
  assert.equal(clockOffset(6150, 5200, 200, 'app;dur=100'), 1000);
});

test('timing fallback never mistakes a missing server duration for network latency', () => {
  assert.equal(clockOffset(1000, 900, 6500, null), 100);
  assert.equal(clockOffset(1000, 900, 20, 'app;dur=30'), 100);
});

test('backoff removes its abort listener after normal completion', async () => {
  const controller = new AbortController();
  await abortableDelay(1, controller.signal);
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
});

test('backoff cancels immediately and removes its listener', async () => {
  const controller = new AbortController();
  const waiting = abortableDelay(60_000, controller.signal);
  controller.abort();
  await waiting;
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
  await abortableDelay(60_000, controller.signal);
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
});

test('precommitted join capabilities use 256 random bits and match server token syntax', () => {
  const first = seatToken(); const second = seatToken();
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.notEqual(first, second);
});
