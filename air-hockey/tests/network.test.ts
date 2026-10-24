import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MESSAGES, RoomError, ROOM_LIFETIME, advance, applyInput, authenticate, createRoom, expired, joinRoom,
  parseInput, rejoin, seatSnapshot, settle, type Presence, type RoomRecord,
} from '../lib/game/room-server';
import { TABLE, type Side } from '../lib/game/types';
import { OnlineGame, transport } from '../lib/game/online';
import { MESSAGES as SIGNAL_MESSAGES, createSignalRoom, hostOf, leaveSeat, publicSeats, seatOf, takeSeat, type SignalRoom } from '../lib/game/signal';

const here: Presence = () => true;

function pair(start = 10000) {
  let now = start;
  const online = [true, true];
  const presence: Presence = side => online[side];
  const created = createRoom('ABC234', 'Ada', 7, now);
  const room = created.room;
  const guest = joinRoom(room, 'Lin', now);
  settle(room, now, presence);
  return { room, host: created.token, guest: guest.token, presence, online, tick: (ms: number) => { now += ms; return now; }, now: () => now };
}

const input = (seq: number, x: number, y: number) => parseInput({ t: 'in', s: seq, x, y })!;
const act = (seq: number, a: string) => parseInput({ t: 'act', s: seq, a })!;

test('a new room waits for a guest, then both seats start an orderly face-off', () => {
  const { room, host, guest } = pair();
  assert.equal(room.status, 'playing');
  assert.equal(room.state.phase, 'faceoff');
  assert.notEqual(host, guest);
  assert.ok(host.length >= 60);
  assert.equal(authenticate(room, host), 0);
  assert.equal(authenticate(room, guest), 1);
  assert.equal(authenticate(room, 'x'.repeat(64)), null);
  const snapshot = JSON.stringify(seatSnapshot(room, 0, here, 0));
  assert.ok(!snapshot.includes(host) && !snapshot.includes(guest), 'snapshots never contain session secrets');
});

test('a third player gets a clear full-room message', () => {
  const { room, now } = pair();
  assert.throws(() => joinRoom(room, 'Third', now()), (error: unknown) => error instanceof RoomError && error.status === 409 && error.message === MESSAGES.full);
});

test('a seat that was left can be taken by someone who opens the link again', () => {
  const { room, presence, now } = pair();
  applyInput(room, 1, act(1, 'leave'), now(), presence);
  assert.equal(room.status, 'disconnected');
  assert.equal(seatSnapshot(room, 0, presence, now()).players[1].left, true);
  const before = room.matchId;
  const again = joinRoom(room, 'Lin again', now());
  assert.equal(again.side, 1);
  settle(room, now(), presence);
  assert.equal(room.status, 'playing');
  assert.equal(room.matchId, before + 1);
});

test('malformed input is rejected and the room clamps targets to legal halves', () => {
  assert.equal(parseInput({ t: 'in', s: 1, x: Infinity, y: 0 }), null);
  assert.equal(parseInput({ t: 'in', s: -1, x: 0, y: 0 }), null);
  assert.equal(parseInput({ t: 'act', s: 1, a: 'win' }), null);
  assert.equal(parseInput({ t: 'hello' }), null);
  const { room, presence, now } = pair();
  applyInput(room, 0, input(1, 99, -99), now(), presence);
  assert.ok(room.targets[0].y > 0 && room.targets[0].x <= TABLE.halfWidth);
});

test('late or repeated sequence numbers cannot replace a newer target', () => {
  const { room, presence, now } = pair();
  applyInput(room, 0, input(5, 1, 3), now(), presence);
  applyInput(room, 0, input(4, -1, 3), now(), presence);
  applyInput(room, 0, input(5, -2, 3), now(), presence);
  assert.equal(room.targets[0].x, 1);
});

test('both participants can pause and resume with a fresh face-off', () => {
  const { room, presence, tick } = pair();
  applyInput(room, 1, act(1, 'pause'), tick(10), presence);
  assert.equal(room.status, 'paused');
  assert.equal(room.pausedBy, 1);
  const frozen = room.state.tick;
  advance(room, tick(2000), presence);
  assert.equal(room.state.tick, frozen, 'paused rooms do not simulate');
  applyInput(room, 0, act(1, 'resume'), tick(10), presence);
  assert.equal(room.status, 'playing');
  assert.equal(room.state.phase, 'faceoff');
});

test('a dropped socket pauses the match; the same secret resumes without losing score', () => {
  const { room, host, presence, online, tick } = pair();
  room.state.scores = [3, 2]; room.state.phase = 'playing';
  online[1] = false;
  advance(room, tick(100), presence);
  assert.equal(room.status, 'disconnected');
  online[1] = true;
  assert.equal(authenticate(room, host), 0);
  rejoin(room, 1, tick(10));
  settle(room, tick(10), presence);
  assert.equal(room.status, 'playing');
  assert.deepEqual(room.state.scores, [3, 2]);
  assert.equal(room.state.phase, 'faceoff');
});

test('a finished match only restarts when both players ask, including across a drop', () => {
  const { room, presence, online, tick } = pair();
  room.state.phase = 'finished'; room.status = 'finished'; room.state.scores = [7, 4];
  applyInput(room, 0, act(1, 'rematch'), tick(10), presence);
  assert.equal(room.status, 'finished');
  online[0] = false;
  applyInput(room, 1, act(1, 'rematch'), tick(10), presence);
  assert.equal(room.status, 'finished');
  online[0] = true;
  settle(room, tick(10), presence);
  assert.equal(room.status, 'playing');
  assert.deepEqual(room.state.scores, [0, 0]);
});

test('scoring comes from shared physics and events have increasing ids', () => {
  const { room, presence, tick } = pair();
  room.state.phase = 'playing'; room.state.puck = { x: 0, y: -7, vx: 0, vy: -20 };
  advance(room, tick(50), presence);
  assert.deepEqual(room.state.scores, [1, 0]);
  const ids = room.events.map(item => item.id);
  assert.deepEqual(ids, [...ids].sort((a, b) => a - b));
  const since = seatSnapshot(room, 0, presence, tick(0), ids.at(-1));
  assert.equal(since.events.length, 0, 'snapshots only carry events after the given id');
});

test('long stalls cannot trigger an unbounded catch-up and rooms expire when idle', () => {
  const { room, presence, now } = pair();
  room.state.phase = 'playing'; room.simTime = now() - 1_000_000;
  advance(room, now(), presence);
  assert.ok(room.state.tick <= 61);
  assert.equal(expired(room, now() + ROOM_LIFETIME + 1), true);
  assert.equal(expired(room, now() + 1000), false);
});

// ---- host and guest over fake links (stand-ins for data channels) ----

type Hello = { t: string; token?: string; name?: string };
const signalRooms = new Map<string, { r: SignalRoom; links: Record<number, FakeLink | undefined> }>();
let serverMessages = 0;
const tick = (ms = 10) => new Promise(r => setTimeout(r, ms));

class FakeLink {
  side: Side = 0; open = false; peer: FakeLink | null = null; serverMessages = 0;
  constructor(private code: string, private h: any) {}
  private view(room: { r: SignalRoom; links: Record<number, FakeLink | undefined> }) { const live = (s: Side) => !!room.links[s]; return { host: hostOf(room.r, live), seats: publicSeats(room.r, live), meta: room.r.meta }; }
  async start(hello: Hello) {
    const room = signalRooms.get(this.code);
    this.serverMessages++; serverMessages++;
    if (!room) throw Object.assign(new Error(SIGNAL_MESSAGES.notFound), { status: 404 });
    let side: Side | null;
    if (hello.t === 'hello') side = seatOf(room.r, hello.token);
    else side = takeSeat(room.r, hello.name, Date.now()).side;
    if (side === null) throw Object.assign(new Error(SIGNAL_MESSAGES.session), { status: 401 });
    this.side = side; room.links[side] = this;
    queueMicrotask(() => this.broadcast(room));
    return { t: 'welcome', code: this.code, token: room.r.seats[side]!.token, side, ...this.view(room) };
  }
  broadcast(room: { r: SignalRoom; links: Record<number, FakeLink | undefined> }) {
    for (const link of Object.values(room.links)) link?.h.onPeers?.({ t: 'peers', side: link.side, ...this.view(room) });
    const [a, b] = [room.links[0], room.links[1]];
    if (a && b && !a.open) { a.peer = b; b.peer = a; a.open = b.open = true; a.h.onOpen?.(); b.h.onOpen?.(); }
  }
  send(kind: string, data: unknown) { if (!this.open || !this.peer) return false; const copy = JSON.parse(JSON.stringify(data)); const peer = this.peer; queueMicrotask(() => peer.h.onMessage?.(kind, copy)); return true; }
  leave() {
    const room = signalRooms.get(this.code)!;
    this.serverMessages++; serverMessages++;
    leaveSeat(room.r, this.side, Date.now());
    delete room.links[this.side];
    const [a, b] = room.r.seats;
    if (a?.left && b && !b.left) { room.r.seats = [b, a]; const other = room.links[1]; delete room.links[1]; if (other) { other.side = 0; room.links[0] = other; } }
    const peer = this.peer; this.open = false; this.peer = null;
    if (peer) { peer.open = false; peer.peer = null; peer.h.onDown?.(); }
    this.broadcast(room);
  }
  dispose() {}
}

test('host runs the match over a direct link; guest joins, pauses, scores reach both; leave and handover', async () => {
  const originals = { ...transport };
  const storage = new Map<string, string>();
  const storageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  } });
  transport.link = ((code: string, h: unknown) => new FakeLink(code, h)) as unknown as typeof transport.link;
  transport.fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    const { room, token } = createSignalRoom('QWE234', body.name, { targetScore: body.targetScore }, Date.now());
    signalRooms.set('QWE234', { r: room, links: {} });
    serverMessages++;
    return Response.json({ code: 'QWE234', token, side: 0 });
  };
  const games: OnlineGame[] = [];
  try {
    const host = await OnlineGame.create('Ada', 5); games.push(host);
    assert.equal(host.isHost, true);
    storage.clear();
    const guest = await OnlineGame.join('qwe-234', 'Lin'); games.push(guest);
    await tick(30);
    assert.equal(guest.session.side, 1);
    assert.equal(host.status, 'playing', 'the host starts once both are connected');
    assert.equal(guest.status, 'playing', 'the guest follows the host snapshot');
    assert.equal(guest.snapshot?.state.targetScore, 5);
    guest.setTarget({ x: 1.5, y: -3 }); (guest as any).sendInput(true); await tick(20);
    assert.ok(Math.abs((host as any).room.targets[1].x - 1.5) < 1e-6, 'guest target reaches the host');
    await guest.action('pause'); await tick(20);
    assert.equal(host.status, 'paused');
    assert.equal(guest.snapshot?.status, 'paused');
    await host.action('resume'); await tick(20);
    assert.equal(guest.status, 'playing');
    // A goal decided on the host reaches the guest at once.
    const room = (host as any).room;
    room.state.phase = 'playing'; room.state.puck = { x: 0, y: -7, vx: 0, vy: -20 };
    host.sample(1 / 60); await tick(20);
    assert.deepEqual(guest.snapshot?.state.scores, [1, 0]);
    // Wrong code and a full room.
    await assert.rejects(OnlineGame.join('ZZZ999', 'Lost'), (e: Error) => e.message === SIGNAL_MESSAGES.notFound);
    await assert.rejects(OnlineGame.join('QWE234', 'Third'), (e: Error & { status?: number }) => e.status === 409);
    // The guest leaves: the host sees it.
    await guest.action('leave'); await tick(30);
    assert.equal(host.snapshot?.players[1].left, true);
    assert.equal(host.status, 'disconnected');
    // A new guest takes the seat; then the host leaves and the guest becomes seat 0.
    const next = await OnlineGame.join('QWE234', 'Kim'); games.push(next); await tick(30);
    assert.equal(next.status, 'playing');
    await host.action('leave'); await tick(30);
    assert.equal(next.session.side, 0);
    assert.equal(next.snapshot?.players[1].left, true, 'the remaining player sees who left');
    assert.ok(serverMessages < 20, `server messages ${serverMessages}`);
  } finally {
    games.forEach(game => game.dispose());
    Object.assign(transport, originals);
    if (storageDescriptor) Object.defineProperty(globalThis, 'sessionStorage', storageDescriptor);
    else Reflect.deleteProperty(globalThis, 'sessionStorage');
  }
});
