import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { createGameServer } from '../server.mjs';
import { Multiplayer } from '../../js/network.js';

async function until(predicate, message = 'expected network event', timeout = 3000) {
  const deadline = Date.now() + timeout;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error(`Timed out: ${message}`);
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

// Exercise production transport over actual TCP/WebSocket connections. The two
// browser globals below only provide the same-origin relay URL; no network is mocked.
test('real multiplayer relay: handshake, authority routing, room limits and disconnects', { timeout: 15000 }, async t => {
  const app = createGameServer();
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const old = { location: globalThis.location, document: globalThis.document, WebSocket: globalThis.WebSocket };
  globalThis.location = new URL(base + '/?relay=same');
  globalThis.document = { querySelector: () => null };
  globalThis.WebSocket = WebSocket;
  const sessions = [];
  t.after(async () => {
    for (const session of sessions) session.close();
    await app.close();
    for (const [key, value] of Object.entries(old)) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
  });
  const health = await fetch(base + '/health').then(r => r.json());
  assert.equal(health.ok, true);
  const received = [];
  const joined = [];
  const left = [];
  const disconnected = [];
  let host;
  host = new Multiplayer({
    onPeerJoin: peer => { joined.push(peer); host.send({ type: 'welcome-snapshot', hp: 100 }, peer.id); },
    onPeerLeave: peer => left.push(peer),
    onMessage: (data, from) => received.push({ who: 'host', data, from })
  });
  sessions.push(host);
  const room = await host.host('Host');
  assert.match(room.code, /^\d{6}$/);
  assert.equal(host.transport, 'relay');
  assert.equal(host.isHost, true);
  assert.equal(app.rooms.size, 1);

  const guests = [];
  for (let i = 0; i < 3; i++) {
    const guest = new Multiplayer({
      onMessage: (data, from) => received.push({ who: `guest${i}`, data, from }),
      onDisconnect: reason => disconnected.push({ guest: i, reason })
    });
    guests.push(guest); sessions.push(guest);
    const result = await guest.join(room.code, `Player ${i}`);
    assert.equal(result.code, room.code);
    assert.equal(guest.isHost, false);
    assert.equal(guest.connected, true);
  }
  await until(() => joined.length === 3 && received.filter(x => x.data.type === 'welcome-snapshot').length === 3, 'three connected guests');
  assert.equal(host.peers.size, 3);
  assert.equal(guests[0].peers.size, 3);

  // A guest cannot choose another guest as receiver; input always goes to host.
  guests[0].send({ type: 'input', forward: 1 }, guests[1].localId);
  await until(() => received.some(x => x.who === 'host' && x.data.type === 'input'), 'guest input to host');
  assert.equal(received.find(x => x.data.type === 'input').from, guests[0].localId);
  assert.equal(received.filter(x => x.data.type === 'input').length, 1);

  host.send({ type: 'snapshot', tick: 20 });
  await until(() => received.filter(x => x.data.type === 'snapshot').length === 3, 'host broadcast');
  host.send({ type: 'private-event', health: 80 }, guests[1].localId);
  await until(() => received.some(x => x.data.type === 'private-event'), 'targeted host event');
  assert.equal(received.filter(x => x.data.type === 'private-event').length, 1);
  assert.equal(received.find(x => x.data.type === 'private-event').who, 'guest1');

  const overflow = new Multiplayer(); sessions.push(overflow);
  await assert.rejects(overflow.join(room.code, 'Fifth player'), /full/i);
  assert.equal(host.peers.size, 3);
  assert.equal(overflow.connected, false);

  const missing = new Multiplayer(); sessions.push(missing);
  await assert.rejects(missing.join('000000', 'Missing'), /not found/i);
  await assert.rejects(missing.join('bad-code', 'Bad'), /six-digit/i);
  assert.equal(host.send({ type: 'oversized', value: 'x'.repeat(70000) }), false);

  const departedId = guests[0].localId;
  guests[0].close();
  await until(() => left.some(x => x.id === departedId), 'guest leave notification');
  assert.equal(host.peers.size, 2);
  await until(() => guests[1].peers.size === 2, 'guest roster update');

  host.close();
  await until(() => disconnected.length === 2 && app.rooms.size === 0, 'host closes room for all guests');
  assert.match(disconnected[0].reason, /host left/i);
  assert.equal(guests[1].connected, false);
});

test('relay rejects cross-origin websocket connections', { timeout: 5000 }, async t => {
  const app = createGameServer();
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());
  const url = `ws://127.0.0.1:${app.server.address().port}/signal`;
  const status = await new Promise(resolve => {
    const ws = new WebSocket(url, { origin: 'https://unrelated.example' });
    ws.on('unexpected-response', (_req, res) => { resolve(res.statusCode); res.destroy(); ws.terminate(); });
    ws.on('error', () => {});
  });
  assert.equal(status, 403);
});
