import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoom, joinRoom, actOnRoom, publicRoom, RoomError } from '../lib/room-engine';
import { COURSES, MAX_STROKES, makeBall, simulateShot } from '../lib/golf';

const NOW = 1000000;
function game() {
  const room = createRoom('ABC234', 'Host', 'host-secret-hash', 9, NOW);
  const guest = joinRoom(room, 'Guest', 'guest-secret-hash');
  const host = room.players[0];
  actOnRoom(room, host, { action: 'start', code: room.code }, NOW);
  return { room, host, guest };
}
function rejects(fn: () => unknown, status: number) {
  assert.throws(fn, (error: unknown) => error instanceof RoomError && error.status === status);
}
test('public room strips all authentication material and validates capacity', () => {
  const room = createRoom('ABC234', '<Player>', 'private-hash', 18, NOW);
  for (let i = 1; i < 8; i++) joinRoom(room, `Player ${i}`, `secret-${i}`);
  rejects(() => joinRoom(room, 'Ninth', 'secret-9'), 409);
  const publicValue = JSON.stringify(publicRoom(room, 3));
  assert(!publicValue.includes('private-hash'));
  assert(!publicValue.includes('tokenHash'));
  assert(!publicValue.includes('processedShots'));
  assert.equal(publicRoom(room, 3).version, 3);
  rejects(() => createRoom('ABC234', '', 'hash', 9, NOW), 400);
  rejects(() => createRoom('ABC234', 'Name', 'hash', 4, NOW), 400);
});
test('only host starts; players cannot act out of turn or send nonfinite shots', () => {
  const room = createRoom('ABC234', 'Host', 'a', 9, NOW), host = room.players[0];
  rejects(() => actOnRoom(room, host, { action: 'start', code: room.code }, NOW), 409);
  const guest = joinRoom(room, 'Guest', 'b');
  rejects(() => actOnRoom(room, guest, { action: 'start', code: room.code }, NOW), 403);
  actOnRoom(room, host, { action: 'start', code: room.code }, NOW);
  rejects(() => actOnRoom(room, guest, { action: 'shot', code: room.code, angle: 0, power: 0.4, shotId: 'guestshot' }, NOW), 409);
  for (const power of [NaN, Infinity, -0.1, 0, 1.1]) rejects(() => actOnRoom(room, host, { action: 'shot', code: room.code, angle: 0, power, shotId: 'badpowers' }, NOW), 400);
  rejects(() => actOnRoom(room, host, { action: 'shot', code: room.code, angle: NaN, power: 0.4, shotId: 'badangle' }, NOW), 400);
});
test('the server computes ball, trajectory and scores, and retries do not duplicate a stroke', () => {
  const { room, host, guest } = game();
  const input = { action: 'shot' as const, code: room.code, angle: Math.PI, power: 0.32, shotId: 'first-shot-id' };
  const expected = simulateShot(COURSES[0], host.ball, Math.PI, 0.32, 0.18);
  assert.equal(actOnRoom(room, host, input, NOW), true);
  assert.equal(host.strokes, 1);
  assert.deepEqual(host.ball, expected.ball);
  assert.deepEqual(room.shot?.frames, expected.frames);
  assert.equal(room.turnId, guest.id);
  assert.equal(actOnRoom(room, host, input, NOW + 10), false);
  assert.equal(host.strokes, 1);
  rejects(() => actOnRoom(room, guest, { ...input, shotId: 'second-shot' }, NOW + 500), 409);
  actOnRoom(room, guest, { ...input, shotId: 'second-shot' }, room.readyAt + 1);
  assert.equal(guest.strokes, 1);
  assert.equal(room.turnId, host.id);
});
test('stroke cap finishes players and transitions all nine holes through a rematch', () => {
  const { room, host, guest } = game();
  let now = NOW;
  for (let hole = 0; hole < 9; hole++) {
    for (let n = 0; n < 2; n++) {
      const player = room.players.find(p => p.id === room.turnId)!;
      player.strokes = MAX_STROKES - 1;
      actOnRoom(room, player, { action: 'shot', code: room.code, angle: 0, power: 0.02, shotId: `cap-shot-${hole}-${n}` }, now);
      now = room.readyAt + 1;
      assert.equal(player.scores[hole], MAX_STROKES);
      assert.equal(player.finished, true);
    }
    assert.equal(room.turnId, null);
    assert.equal(room.phase, hole === 8 ? 'complete' : 'holeComplete');
    if (hole < 8) {
      rejects(() => actOnRoom(room, guest, { action: 'nextHole', code: room.code }, now), 403);
      actOnRoom(room, host, { action: 'nextHole', code: room.code }, now);
      assert.equal(room.holeIndex, hole + 1);
      assert.equal(host.strokes, 0);
    }
  }
  assert.equal(host.scores.reduce<number>((a, n) => a + (n || 0), 0), 90);
  actOnRoom(room, host, { action: 'rematch', code: room.code }, now);
  assert.equal(room.phase, 'lobby');
  assert.equal(room.holeIndex, 0);
  assert.deepEqual(host.scores, Array(9).fill(null));
  assert.deepEqual(host.ball, makeBall(COURSES[0]));
});
test('hazards cost a penalty and restore the previous lie', () => {
  const { room, host } = game();
  room.holeIndex = 6;
  host.ball = makeBall(COURSES[6]);
  host.ball.x = 0; host.ball.z = 0;
  const previous = { ...host.ball };
  actOnRoom(room, host, { action: 'shot', code: room.code, angle: Math.PI / 2, power: 0.45, shotId: 'water-shot-id' }, NOW);
  assert.equal(room.shot?.outcome, 'water');
  assert.equal(host.strokes, 2);
  assert.equal(host.ball.x, previous.x);
  assert.equal(host.ball.z, previous.z);
  assert.equal(host.ball.hazard, false);
  assert.equal(host.ball.stopped, true);
});
test('host can recover an idle turn and leave transfers ownership without corrupting scores', () => {
  const { room, host, guest } = game();
  rejects(() => actOnRoom(room, host, { action: 'skip', code: room.code }, NOW + 59999), 409);
  rejects(() => actOnRoom(room, guest, { action: 'skip', code: room.code }, NOW + 60000), 403);
  actOnRoom(room, host, { action: 'skip', code: room.code }, NOW + 60000);
  assert.equal(host.strokes, 1);
  assert.equal(room.turnId, guest.id);
  actOnRoom(room, host, { action: 'leave', code: room.code }, NOW + 61000);
  assert.equal(room.hostId, guest.id);
  assert.equal(host.departed, true);
  assert(host.scores.every(s => s === MAX_STROKES));
  rejects(() => actOnRoom(room, host, { action: 'skip', code: room.code }, NOW + 130000), 403);
});
