import test from 'node:test';
import assert from 'node:assert/strict';
import { CLOSE, CODE_ALPHABET, LOBBY, Lobby, PING, PONG, ROOM, Registry, Room, clampMax, makeCode, normalizeCode } from '../../worker/rooms.mjs';

class FakeSocket {
  constructor() { this.sent = []; this.closed = null; }
  send(text) { if (this.closed) throw new Error('closed'); this.sent.push(JSON.parse(text)); this.raw = (this.raw || []).concat(text); }
  close(code, reason) { this.closed = { code, reason }; }
  last(type) { return this.sent.filter(m => m.t === type).at(-1); }
  types() { return this.sent.map(m => m.t); }
}

function room(max = 4) {
  const r = new Room();
  r.init({ code: 'ABCD', max, public: true, seed: 1234 });
  return r;
}
const peer = (id, socket = new FakeSocket()) => ({ id, name: `N${id}`, socket });

test('codes avoid look-alike characters', () => {
  assert.ok(!/[ILO01]/.test(CODE_ALPHABET));
  for (let i = 0; i < 200; i++) assert.ok(normalizeCode(makeCode()));
  assert.equal(normalizeCode(' abcd '), 'ABCD');
  assert.equal(normalizeCode('AB0D'), null);
  assert.equal(normalizeCode('ABCDE'), null);
  assert.equal(clampMax(40), 16);
  assert.equal(clampMax(1), 2);
  assert.equal(clampMax('x'), 8);
});

test('join sends welcome, broadcasts joins and enforces max', () => {
  const r = room(2);
  const a = peer('a'), b = peer('b'), c = peer('c');
  assert.deepEqual(r.join(a, 1), { changed: true });
  const welcome = a.socket.last('welcome');
  assert.equal(welcome.host, 'a');
  assert.equal(welcome.seed, 1234);
  assert.equal(welcome.code, 'ABCD');
  assert.deepEqual(welcome.self, { id: 'a', name: 'Na', joinedAt: 1 });
  r.join(b, 2);
  assert.deepEqual(b.socket.last('welcome').peers.map(p => p.id), ['a', 'b']);
  assert.equal(a.socket.last('join').peer.id, 'b');
  assert.equal(b.socket.last('join'), undefined);
  assert.deepEqual(r.join(c, 3), { error: 'full' });
  assert.deepEqual(new Room().join(a, 1), { error: 'not-found' });
});

test('signaling goes to one peer; gameplay frames are not relayed', () => {
  const r = room();
  const a = peer('a'), b = peer('b'), c = peer('c');
  [a, b, c].forEach((p, i) => r.join(p, i));
  r.handle('a', a.socket, JSON.stringify({ t: 'sig', to: 'b', data: { d: 'offer', sdp: 'x' } }), 10);
  assert.deepEqual(b.socket.last('sig'), { t: 'sig', from: 'a', data: { d: 'offer', sdp: 'x' } });
  assert.equal(c.socket.last('sig'), undefined, 'signaling is never broadcast');
  r.handle('a', a.socket, JSON.stringify({ t: 'sig', to: 'a', data: { d: 'ice' } }), 10);
  r.handle('a', a.socket, JSON.stringify({ t: 'sig', to: 'zz', data: { d: 'ice' } }), 10);
  r.handle('a', a.socket, JSON.stringify({ t: 'sig', to: 'b', data: 'not an object' }), 10);
  assert.equal(b.socket.sent.filter(m => m.t === 'sig').length, 1);
  // Gameplay goes device to device; the server ignores the old relay frames.
  r.handle('a', a.socket, JSON.stringify({ t: 'send', data: { x: 1 } }), 10);
  r.handle('b', b.socket, JSON.stringify({ t: 'to', to: 'c', data: 'hi' }), 10);
  assert.equal([a, b, c].flatMap(p => p.socket.sent).filter(m => m.t === 'msg').length, 0);
  // A socket that is not the peer's current socket is ignored.
  r.handle('a', new FakeSocket(), JSON.stringify({ t: 'sig', to: 'b', data: {} }), 10);
  assert.equal(b.socket.sent.filter(m => m.t === 'sig').length, 1);
  r.handle('a', a.socket, PING, 10);
  assert.equal(a.socket.raw.at(-1), PONG, 'same reply as the auto-response');
  assert.equal(PING, JSON.stringify({ t: 'ping' }), 'the client ping is exactly the auto-response text');
  r.handle('a', a.socket, 'not json', 10);
  r.handle('a', a.socket, '[1,2]', 10);
});

test('signaling rate limit grows with the room, drops excess and flags abuse', () => {
  const r = room();
  const a = peer('a'), b = peer('b');
  r.join(a, 0); r.join(b, 0);
  const sig = n => JSON.stringify({ t: 'sig', to: 'b', data: { n } });
  assert.equal(r.allowance(), ROOM.rateBase + ROOM.ratePerPeer, '20 per 10 s for two players');
  for (let i = 0; i < 30; i++) assert.equal(r.handle('a', a.socket, sig(i), 1000).abuse, undefined);
  assert.equal(b.socket.sent.filter(m => m.t === 'sig').length, r.allowance(), 'excess dropped');
  r.handle('a', a.socket, sig('later'), 1000 + ROOM.rateWindowMs);
  assert.equal(b.socket.last('sig').data.n, 'later', 'a new window allows more');
  let result;
  for (let i = 0; i < r.allowance() * ROOM.abuseFactor + 1; i++) result = r.handle('a', a.socket, sig(i), 1000 + 2 * ROOM.rateWindowMs);
  assert.equal(result.abuse, true, 'far over the allowance: the caller closes the socket');
  // A third peer raises the allowance, since the mesh needs signaling per pair.
  r.join(peer('c'), 5);
  assert.equal(r.allowance(), ROOM.rateBase + 2 * ROOM.ratePerPeer);
  // Size limits still apply.
  r.handle('b', b.socket, JSON.stringify({ t: 'sig', to: 'a', data: { sdp: 'x'.repeat(5000) } }), 1000);
  assert.equal(b.socket.last('error').code, 'too-big');
});

test('a slow trickle of frames hits the long cap and is flagged as abuse', () => {
  const r = room();
  const a = peer('a'), b = peer('b');
  r.join(a, 0); r.join(b, 0);
  const cap = ROOM.longBase + ROOM.longPerPeer;
  let result, at = 0, sent = 0;
  // One frame every 2 s never trips the 10 s window, but the 10 min cap catches it.
  while (!result?.abuse && sent < cap + 5) { result = r.handle('a', a.socket, JSON.stringify({ t: 'sig', to: 'b', data: {} }), at); at += 2000; sent++; }
  assert.equal(result.abuse, true);
  assert.equal(sent, cap + 1);
  assert.ok(at < ROOM.longWindowMs);
});

test('meta is shared, bounded and reported', () => {
  const r = room();
  const a = peer('a'), b = peer('b');
  r.join(a, 0); r.join(b, 0);
  assert.deepEqual(r.handle('b', b.socket, JSON.stringify({ t: 'meta', meta: { phase: 'racing' } }), 1), { changed: true, empty: false });
  assert.deepEqual(a.socket.last('meta').meta, { phase: 'racing' });
  assert.deepEqual(b.socket.last('meta').meta, { phase: 'racing' });
  assert.deepEqual(r.info(), { players: 2, max: 4, meta: { phase: 'racing' }, public: true });
  r.handle('a', a.socket, JSON.stringify({ t: 'meta', meta: { big: 'x'.repeat(1100) } }), 2);
  assert.equal(a.socket.last('error').code, 'meta-too-big');
  r.handle('a', a.socket, JSON.stringify({ t: 'meta', meta: [1] }), 2);
  assert.deepEqual(r.meta, { phase: 'racing' });
  const before = a.socket.sent.length;
  assert.deepEqual(r.handle('a', a.socket, JSON.stringify({ t: 'meta', meta: { phase: 'racing' } }), 3), { changed: false, empty: false });
  assert.equal(a.socket.sent.length, before, 'an unchanged meta is not broadcast or reported');
});

test('snapshot and restore keep peers, host, meta and the grace period across hibernation', () => {
  const r = room();
  const a = peer('a'), b = peer('b'), c = peer('c');
  r.join(a, 1); r.join(b, 2); r.join(c, 3);
  r.handle('b', b.socket, JSON.stringify({ t: 'meta', meta: { phase: 'race' } }), 4);
  r.drop('c', c.socket, 5);
  const saved = JSON.parse(JSON.stringify(r.snapshot()));
  const woke = new Room();
  woke.restore(saved, id => ({ a: a.socket, b: b.socket })[id], 100);
  assert.equal(woke.code, 'ABCD');
  assert.equal(woke.seed, 1234);
  assert.equal(woke.host, 'a');
  assert.deepEqual(woke.meta, { phase: 'race' });
  assert.deepEqual(woke.list().map(p => p.id), ['a', 'b', 'c']);
  assert.equal(woke.peers.get('c').goneAt, 5, 'grace period carries on');
  woke.handle('a', a.socket, JSON.stringify({ t: 'sig', to: 'b', data: { d: 'hi' } }), 101);
  assert.deepEqual(b.socket.last('sig').from, 'a', 'restored sockets work');
  assert.deepEqual(woke.sweep(5 + ROOM.graceMs), { changed: true, empty: false });
  assert.equal(a.socket.last('leave').peer.id, 'c');
  // New peers continue the join order, so host handover stays oldest-first.
  woke.join(peer('d'), 200);
  assert.ok(woke.peers.get('d').sequence > woke.peers.get('b').sequence);
  assert.equal(new Room().snapshot(), null);
  const lost = new Room();
  lost.restore(saved, () => null, 50);
  assert.equal(lost.peers.get('a').goneAt, 50, 'sockets that vanished during sleep get a grace period');
});

test('host is the oldest peer and moves when they leave', () => {
  const r = room();
  const a = peer('a'), b = peer('b'), c = peer('c');
  r.join(a, 1); r.join(b, 2); r.join(c, 3);
  assert.equal(r.host, 'a');
  assert.deepEqual(r.leave('a', a.socket), { changed: true, empty: false });
  assert.equal(b.socket.last('leave').peer.id, 'a');
  assert.equal(b.socket.last('host').id, 'b');
  assert.equal(c.socket.last('host').id, 'b');
  r.leave('c', c.socket);
  assert.equal(b.socket.sent.filter(m => m.t === 'host').length, 1, 'no host event when host stays');
  assert.deepEqual(r.leave('b', b.socket), { changed: true, empty: true });
  assert.equal(r.open, false, 'empty rooms are forgotten');
  assert.deepEqual(r.join(peer('d'), 9), { error: 'not-found' });
});

test('a dropped peer keeps its slot during the grace period and can reconnect silently', () => {
  const r = room();
  const a = peer('a'), b = peer('b');
  r.join(a, 0); r.join(b, 0);
  assert.equal(r.drop('a', a.socket, 1000), true);
  assert.equal(r.nextSweep(), 1000 + ROOM.graceMs);
  assert.deepEqual(r.sweep(1000 + ROOM.graceMs - 1), { changed: false, empty: false });
  const again = new FakeSocket();
  assert.deepEqual(r.join({ id: 'a', name: 'Na', socket: again }, 5000), { changed: false });
  assert.equal(again.last('welcome').host, 'a', 'host kept across reconnect');
  assert.equal(b.socket.last('leave'), undefined);
  assert.equal(b.socket.sent.filter(m => m.t === 'join').length, 0);
  // The old socket closing later must not remove the reconnected peer.
  r.leave('a', a.socket);
  assert.ok(r.peers.has('a'));
  // A dropped peer that never returns is removed after the grace period.
  r.drop('b', b.socket, 6000);
  assert.deepEqual(r.sweep(6000 + ROOM.graceMs), { changed: true, empty: false });
  assert.equal(again.last('leave').peer.id, 'b');
  r.drop('a', again, 7000);
  assert.deepEqual(r.sweep(7000 + ROOM.graceMs), { changed: true, empty: true });
  assert.equal(r.nextSweep(), Infinity);
});

test('a second connection for the same peer replaces the first', () => {
  const r = room();
  const first = new FakeSocket(), second = new FakeSocket();
  r.join({ id: 'a', name: 'Na', socket: first }, 0);
  r.join({ id: 'a', name: 'Na', socket: second }, 1);
  assert.deepEqual(first.closed, { code: CLOSE.replaced, reason: 'replaced' });
  assert.equal(r.peers.size, 1);
  assert.ok(second.last('welcome'));
});

test('bye leaves immediately', () => {
  const r = room();
  const a = peer('a'), b = peer('b');
  r.join(a, 0); r.join(b, 1);
  assert.deepEqual(r.handle('a', a.socket, JSON.stringify({ t: 'bye' }), 2), { changed: true, empty: false });
  assert.equal(b.socket.last('leave').peer.id, 'a');
});

const seq = values => { let i = 0; return () => values[i++ % values.length]; };

test('lobby: quick match fills the fullest public room, else creates one', () => {
  const lobby = new Lobby();
  const now = 1e6;
  const first = lobby.quick({ max: 4 }, now);
  assert.equal(first.created, true);
  // A second quick join before the first connects lands in the same room.
  assert.deepEqual(lobby.quick({ max: 4 }, now + 1), { code: first.code, created: false });
  lobby.report(first.code, { players: 2, max: 4, meta: {}, public: true }, now + 2);
  const other = lobby.reserve({ max: 4, public: true }, now + 3);
  lobby.report(other, { players: 1, max: 4, meta: {}, public: true }, now + 3);
  assert.equal(lobby.quick({ max: 4 }, now + 4).code, first.code, 'fullest room first');
  lobby.report(first.code, { players: 4, max: 4, meta: {}, public: true }, now + 5);
  assert.equal(lobby.quick({ max: 4 }, now + 6).code, other);
  // Private rooms and rooms marked open:false are never quick-matched.
  const priv = lobby.reserve({ max: 4, public: false }, now);
  lobby.report(priv, { players: 1, max: 4, meta: {}, public: false }, now + 7);
  lobby.report(other, { players: 1, max: 4, meta: { open: false }, public: true }, now + 7);
  const fresh = lobby.quick({ max: 4 }, now + 8);
  assert.equal(fresh.created, true);
  assert.ok(![priv, other, first.code].includes(fresh.code));
  assert.deepEqual(lobby.quick({ max: 2, allowCreate: false }, now + 9).code, fresh.code);
  lobby.report(fresh.code, { players: 2, max: 2, meta: {}, public: true }, now + 10);
  assert.deepEqual(lobby.quick({ max: 2, allowCreate: false }, now + 11), { error: 'rate-limited' });
});

test('lobby: list shows open public rooms with space; stale and empty rooms are forgotten', () => {
  const lobby = new Lobby();
  const now = 5e6;
  const a = lobby.reserve({ max: 4, public: true }, now);
  const b = lobby.reserve({ max: 2, public: true }, now);
  const c = lobby.reserve({ max: 4, public: false }, now);
  const d = lobby.reserve({ max: 4, public: true }, now);
  lobby.report(a, { players: 1, max: 4, meta: { track: 2 }, public: true }, now);
  lobby.report(b, { players: 2, max: 2, meta: {}, public: true }, now);
  lobby.report(c, { players: 1, max: 4, meta: {}, public: false }, now);
  assert.deepEqual(lobby.list(now), [{ code: a, players: 1, max: 4, meta: { track: 2 } }]);
  assert.ok(lobby.rooms.has(d), 'fresh reservation kept');
  lobby.list(now + LOBBY.reserveMs);
  assert.ok(!lobby.rooms.has(d), 'unused reservation dropped');
  lobby.report(a, { players: 0 }, now + 1);
  assert.ok(!lobby.rooms.has(a), 'empty room removed');
  lobby.list(now + LOBBY.staleMs);
  assert.equal(lobby.rooms.size, 0, 'rooms that stop reporting expire');
  // A heartbeat re-adds a room the lobby forgot.
  lobby.report('WXYZ', { players: 3, max: 8, meta: {}, public: true }, now);
  assert.equal(lobby.list(now)[0].code, 'WXYZ');
  lobby.reject('WXYZ', 'full', now);
  assert.deepEqual(lobby.list(now), []);
  lobby.reject('WXYZ', 'gone', now);
  assert.equal(lobby.rooms.size, 0);
});

test('lobby: reserve never repeats a live code', () => {
  const lobby = new Lobby();
  const codes = new Set();
  const random = seq([0, 0, 0, 0, 0.5, 0.5, 0.5, 0.5]);
  codes.add(lobby.reserve({ max: 4 }, 0, random));
  codes.add(lobby.reserve({ max: 4 }, 0, random));
  assert.equal(codes.size, 2);
  const stuck = lobby.reserve({ max: 4 }, 0, () => 0);
  assert.equal(stuck, null, 'gives up instead of reusing a code');
});

test('registry caps active rooms across every game and survives a restart', () => {
  const registry = new Registry();
  const now = 1e7;
  const random = Math.random;
  const codes = [];
  for (let i = 0; i < LOBBY.maxRooms; i++) {
    const game = i % 2 ? 'citrus' : 'velvet-pool';
    const code = registry.reserve(game, { max: 2, public: i % 3 === 0 }, now, random);
    assert.ok(code, `room ${i}`);
    codes.push([game, code]);
    registry.report(game, code, { players: 1, max: 2, meta: {}, public: i % 3 === 0 }, now);
  }
  assert.equal(registry.active(now), LOBBY.maxRooms);
  assert.equal(registry.reserve('cage', { max: 2 }, now, random), null, 'no new private room past the cap');
  assert.deepEqual(registry.quick('cage', { max: 2 }, now, random), { error: 'unavailable' }, 'no new quick room past the cap');
  // Joining an existing open room still works at the cap.
  const open = registry.quick('velvet-pool', { max: 2, allowCreate: false }, now, random);
  assert.equal(open.created, false);
  // A room that reports empty frees a slot.
  registry.report(codes[1][0], codes[1][1], { players: 0 }, now);
  assert.ok(registry.reserve('cage', { max: 2 }, now, random));
  // Stored and restored (the lobby object was evicted): same rooms, same cap.
  const again = new Registry();
  again.restore(JSON.parse(JSON.stringify(registry.snapshot())));
  assert.equal(again.active(now), LOBBY.maxRooms);
  assert.equal(again.list('velvet-pool', now).length, registry.list('velvet-pool', now).length);
  assert.deepEqual(again.list('unknown', now), []);
  // Rooms that never report again leave the count after staleMs, so the cap cannot stick.
  assert.equal(again.active(now + LOBBY.staleMs), 0);
});

test('meta budget: 10 counted changes per room per 10 minutes; later ones are relayed only', () => {
  const r = room(4);
  const a = peer('a'), b = peer('b');
  r.join(a, 1); r.join(b, 2);
  const results = [];
  // Spread out, so the per-peer frame limit is not what stops them.
  for (let i = 0; i < ROOM.metaBudget + 3; i++) results.push(r.handle('a', a.socket, JSON.stringify({ t: 'meta', meta: { round: i } }), 1000 + i * 11e3).changed);
  assert.deepEqual(results, [...Array(ROOM.metaBudget).fill(true), false, false, false]);
  assert.equal(b.socket.last('meta').meta.round, ROOM.metaBudget + 2, 'relayed anyway');
  assert.equal(r.meta.round, ROOM.metaBudget + 2);
  // A new window counts again.
  assert.equal(r.handle('a', a.socket, JSON.stringify({ t: 'meta', meta: { round: 99 } }), 1000 + ROOM.metaWindowMs + 1).changed, true);
});
