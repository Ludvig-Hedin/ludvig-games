/** Ludvig.mp over WebRTC: two (or three) fake browsers, the real Room rules as the server, fake data channels.
    Checks the public API contract (events, message arguments, host, meta), that gameplay never reaches the server,
    which channel each message takes, buffering before channels open, and the connect / lost timeouts. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { FakeRTC, browser, flush } from './browser-fakes.mjs';
import { Room as ServerRoom } from '../../worker/rooms.mjs';

const ok = body => Promise.resolve({ status: 200, json: async () => body });

/** A server room plus a WebSocket class per browser that talks to it in memory. Records every client frame. */
function server() {
  const room = new ServerRoom();
  room.init({ code: 'ABCD', max: 8, public: false, seed: 99 });
  const frames = [];
  let clock = 0;
  const socketClass = peerId => class FakeWebSocket {
    constructor(url) {
      this.url = new URL(url);
      this.readyState = 1;
      const client = this;
      this.serverSide = {
        send: text => setImmediate(() => client.onmessage?.({ data: text })),
        close: code => { client.readyState = 3; setImmediate(() => client.onclose?.({ code })); },
      };
      setImmediate(() => room.join({ id: peerId, name: peerId.toUpperCase(), socket: this.serverSide }, ++clock));
    }
    send(text) {
      frames.push({ from: peerId, text });
      const result = room.handle(peerId, this.serverSide, text, Date.now());
      if (result.abuse) this.serverSide.close(4429);
    }
    close() { this.readyState = 3; room.leave(peerId, this.serverSide); }
  };
  return { room, frames, socketClass };
}

async function settle(t, ms = 0, steps = 6) {
  for (let i = 0; i < steps; i++) {
    await flush();
    if (ms) t.mock.timers.tick(ms / steps);
  }
  await flush(); await flush();
}

async function player(srv, id) {
  const w = browser({ fetch: () => ok({}), WebSocket: srv.socketClass(id), RTCPeerConnection: FakeRTC });
  w.run('ludvig.js');
  const joining = w.Ludvig.mp.join({ game: 'velvet-pool', room: 'abcd' });
  await flush(); await flush();
  const room = await joining;
  const seen = [];
  for (const type of ['join', 'leave', 'host', 'message', 'meta', 'close', 'error']) room.on(type, (...args) => seen.push([type, ...args]));
  return { w, room, seen };
}

const messages = seen => seen.filter(([type]) => type === 'message').map(([, from, data, direct]) => [from, data, direct]);

test('p2p: two peers connect directly; send and sendTo fire message(from, data, direct); the server only sees signaling', async t => {
  FakeRTC.reset();
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: 1e6 });
  const srv = server();
  const a = await player(srv, 'a');
  const b = await player(srv, 'b');
  // Sent before the channels are open: queued and delivered once they open.
  b.room.send({ t: 'need' });
  await settle(t, 300);
  assert.deepEqual(a.seen.filter(([type]) => type === 'join').map(([, peer]) => peer.id), ['b']);
  assert.equal(a.room.host, 'a');
  assert.equal(b.room.host, 'a');
  assert.equal(b.room.seed, 99);
  assert.deepEqual(messages(a.seen), [['b', { t: 'need' }, false]], 'early message delivered after the channels opened');
  a.room.send({ t: 'state', s: [1, 2, 3] });
  a.room.sendTo('b', { t: 'hi' });
  await settle(t);
  assert.deepEqual(messages(b.seen), [['a', { t: 'state', s: [1, 2, 3] }, false], ['a', { t: 'hi' }, true]]);
  // Only signaling frames ever reached the server: no gameplay.
  const types = new Set(srv.frames.map(f => JSON.parse(f.text).t));
  assert.deepEqual([...types].sort(), ['sig']);
  assert.ok(srv.frames.length <= 6, `few signaling frames (${srv.frames.length})`);
  // Each pair has one connection with the two channels the doc asks for.
  const pc = FakeRTC.all[0];
  assert.deepEqual(pc.channels.u.options, { negotiated: true, id: 0, ordered: false, maxRetransmits: 0 });
  assert.deepEqual(pc.channels.r.options, { negotiated: true, id: 1, ordered: true });
  assert.deepEqual(pc.config.iceServers, [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] }], 'STUN only, no TURN');
  // Meta still goes through the server, once.
  a.room.setMeta({ open: false });
  a.room.setMeta({ open: false });
  await settle(t);
  assert.equal(srv.frames.filter(f => JSON.parse(f.text).t === 'meta').length, 1);
  assert.deepEqual(b.seen.filter(([type]) => type === 'meta'), [['meta', { open: false }]]);
  a.room.leave();
  b.room.leave();
});

test('p2p: frequent look-alike state goes over u; events, direct messages and shape changes stay reliable', async t => {
  FakeRTC.reset();
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: 2e6 });
  const srv = server();
  const a = await player(srv, 'a');
  const b = await player(srv, 'b');
  await settle(t, 300);
  const channelOf = () => FakeRTC.log.at(-1).label;
  const labels = [];
  for (let i = 0; i < 6; i++) { a.room.send({ t: 'p', x: i, y: 2 * i, v: [i, i] }); labels.push(channelOf()); t.mock.timers.tick(100); }
  assert.deepEqual(labels, ['r', 'r', 'r', 'u', 'u', 'u'], 'reliable until the stream is clearly frequent');
  // The same kind with an extra field (a hit flag) or a non-empty event list goes reliable.
  a.room.send({ t: 'p', x: 7, y: 14, v: [7, 7], h: 1 }); assert.equal(channelOf(), 'r');
  for (let i = 0; i < 5; i++) { a.room.send({ t: 'p', x: i, y: i, v: [i, i] }); t.mock.timers.tick(100); }
  a.room.send({ t: 'p', x: 1, y: 1, v: [1, 1], e: [3, 4] }); assert.equal(channelOf(), 'r');
  // Packets without a type field that carry event lists (overrun, kiln, cage) stay reliable even at 10 a second.
  for (let i = 0; i < 6; i++) { a.room.send({ s: [i, i], ev: [] }); t.mock.timers.tick(100); }
  assert.equal(channelOf(), 'r');
  // Direct messages are always reliable, even when frequent (hits in shooters).
  for (let i = 0; i < 6; i++) { a.room.sendTo('b', { t: 'hit', d: 5 }); t.mock.timers.tick(50); }
  assert.equal(channelOf(), 'r');
  // Big messages are reliable.
  for (let i = 0; i < 6; i++) { a.room.send({ t: 'big', s: 'x'.repeat(1500) }); t.mock.timers.tick(100); }
  assert.equal(channelOf(), 'r');
  // A game can choose explicitly.
  a.room.send({ t: 'once' }, { reliable: false }); assert.equal(channelOf(), 'u');
  a.room.sendTo('b', { t: 'p', x: 0 }, { reliable: false }); assert.equal(channelOf(), 'u');
  a.room.send({ t: 'q' }, { reliable: true }); assert.equal(channelOf(), 'r');
  await settle(t);
  assert.ok(messages(b.seen).length > 30, 'everything arrived');
  a.room.leave();
  b.room.leave();
});

test('p2p: when a frequent stream pauses, its last u message is repeated once over r', async t => {
  FakeRTC.reset();
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: 3e6 });
  const srv = server();
  const a = await player(srv, 'a');
  const b = await player(srv, 'b');
  await settle(t, 300);
  for (let i = 0; i < 6; i++) { a.room.send({ t: 'aim', a: i }); t.mock.timers.tick(100); }
  const before = FakeRTC.log.length;
  t.mock.timers.tick(400);
  assert.deepEqual(FakeRTC.log.slice(before).map(e => [e.label, JSON.parse(e.text).m]), [['r', { t: 'aim', a: 5 }]]);
  t.mock.timers.tick(2000);
  assert.equal(FakeRTC.log.length, before + 1, 'only once');
  a.room.leave();
  b.room.leave();
});

test('p2p: host handover with three peers, and a closed channel with no leave counts as a leave', async t => {
  FakeRTC.reset();
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: 4e6 });
  const srv = server();
  const a = await player(srv, 'a');
  const b = await player(srv, 'b');
  const c = await player(srv, 'c');
  await settle(t, 300);
  assert.equal(FakeRTC.all.length, 6, 'full mesh: one connection per pair on each side');
  c.room.send({ t: 'x' });
  await settle(t);
  assert.deepEqual(messages(a.seen), [['c', { t: 'x' }, false]]);
  assert.deepEqual(messages(b.seen), [['c', { t: 'x' }, false]]);
  // The host leaves: the server's leave and host events reach everyone.
  a.room.leave();
  await settle(t, 100);
  assert.deepEqual(b.seen.filter(([type]) => type === 'leave').map(([, peer]) => peer.id), ['a']);
  assert.deepEqual(b.seen.filter(([type]) => type === 'host'), [['host', 'b']]);
  assert.equal(c.room.host, 'b');
  assert.deepEqual(c.room.peers.map(p => p.id), ['b', 'c']);
  b.room.send({ t: 'still' });
  await settle(t);
  assert.deepEqual(messages(c.seen).at(-1), ['b', { t: 'still' }, false]);
  // c's direct link to b breaks but the server never says b left: after 5 s c treats b as gone.
  const link = FakeRTC.all.find(pc => pc.connectionState === 'connected' && pc.peer && pc.channels.r.readyState === 'open' && c.room.links.get('b')?.pc === pc);
  link.channels.r.close();
  await settle(t, 4000);
  assert.ok(!c.seen.some(([type, peer]) => type === 'leave' && peer.id === 'b'), 'not before 5 s');
  await settle(t, 1500);
  assert.ok(c.seen.some(([type, peer]) => type === 'leave' && peer.id === 'b'));
  assert.equal(c.room.host, 'c', 'the oldest reachable peer is host locally');
  b.room.leave();
  await settle(t, 100);
  assert.equal(c.seen.filter(([type, peer]) => type === 'leave' && peer.id === 'b').length, 1, 'the later server leave is not repeated');
  c.room.leave();
});

test('p2p: a peer that cannot be reached in 10 s is reported and treated as gone', async t => {
  FakeRTC.reset();
  FakeRTC.blocked = true;
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: 5e6 });
  const srv = server();
  const a = await player(srv, 'a');
  const b = await player(srv, 'b');
  await settle(t, 9000);
  assert.ok(!b.seen.some(([type]) => type === 'error'));
  await settle(t, 1500);
  assert.deepEqual(b.seen.filter(([type]) => type === 'error'), [['error', 'connect-failed']]);
  assert.deepEqual(b.seen.filter(([type]) => type === 'leave').map(([, p]) => p.id), ['a']);
  assert.deepEqual(a.seen.filter(([type]) => type === 'leave').map(([, p]) => p.id), ['b']);
  assert.equal(b.room.host, 'b', 'alone, b is its own host');
  assert.deepEqual(b.room.peers.map(p => p.id), ['b']);
  // No gameplay fallback through the server.
  b.room.send({ t: 'p' });
  assert.ok(!srv.frames.some(f => ['send', 'to'].includes(JSON.parse(f.text).t)));
  a.room.leave();
  b.room.leave();
});

test('p2p: a reloaded page (same peer id, new instance) gets a fresh connection', async t => {
  FakeRTC.reset();
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: 6e6 });
  const srv = server();
  const a = await player(srv, 'a');
  const b = await player(srv, 'b');
  await settle(t, 300);
  // b reloads: the server silently gives the slot to the new socket (no join or leave for a).
  const b2 = await player(srv, 'b');
  await settle(t, 300);
  assert.ok(!a.seen.some(([type]) => type === 'leave'), 'no leave for a reload');
  b2.room.send({ t: 'back' });
  a.room.send({ t: 'hello' });
  await settle(t);
  assert.deepEqual(messages(a.seen).at(-1), ['b', { t: 'back' }, false]);
  assert.deepEqual(messages(b2.seen).at(-1), ['a', { t: 'hello' }, false]);
  a.room.leave();
  b2.room.leave();
});
