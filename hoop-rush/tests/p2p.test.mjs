import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RoomLink, createRoom, linkTransport } from '../lib/online-client.js';
import { MESSAGES, createSignalRoom, hostOf, leaveSeat, publicSeats, seatOf, takeSeat } from '../lib/signal.ts';

// A fake room server on the real seat rules, and fake links that pass
// messages straight between two RoomLinks, standing in for data channels.
const rooms = new Map();
let serverMessages = 0;
const wait = (ms = 20) => new Promise(r => setTimeout(r, ms));

class FakeLink {
  constructor(code, h) { this.code = code; this.h = h; this.side = 0; this.open = false; this.peer = null; this.serverMessages = 0; }
  view(room) { const live = s => !!room.links[s]; return { host: hostOf(room.r, live), seats: publicSeats(room.r, live), meta: room.r.meta }; }
  async start(hello) {
    const room = rooms.get(this.code);
    this.serverMessages++; serverMessages++;
    if (!room) throw Object.assign(new Error(MESSAGES.notFound), { status: 404 });
    const side = hello.t === 'hello' ? seatOf(room.r, hello.token) : takeSeat(room.r, hello.name, Date.now()).side;
    if (side === null) throw Object.assign(new Error(MESSAGES.session), { status: 401 });
    this.side = side; room.links[side] = this;
    setTimeout(() => this.broadcast(room), 5);
    return { t: 'welcome', code: this.code, token: room.r.seats[side].token, side, ...this.view(room) };
  }
  broadcast(room) {
    for (const link of Object.values(room.links)) link?.h.onPeers?.({ t: 'peers', side: link.side, ...this.view(room) });
    const [a, b] = [room.links[0], room.links[1]];
    if (a && b && !a.open) { a.peer = b; b.peer = a; a.open = b.open = true; a.h.onOpen?.(); b.h.onOpen?.(); }
  }
  send(kind, data) { if (!this.open || !this.peer) return false; const copy = JSON.parse(JSON.stringify(data)); const peer = this.peer; queueMicrotask(() => peer.h.onMessage?.(kind, copy)); return true; }
  leave() {
    const room = rooms.get(this.code);
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

function client(opts) {
  const seen = { states: [], nacks: [], ends: [], welcome: null, offset: null };
  const link = new RoomLink({ ...opts,
    onWelcome: (s, state) => { seen.welcome = { s, state }; seen.states.push(state); },
    onState: state => seen.states.push(state),
    onNack: data => seen.nacks.push(data),
    onEnd: (status, message) => seen.ends.push({ status, message }),
    onOffset: value => { seen.offset = value; },
  });
  link.start();
  return { link, seen, last: () => seen.states.at(-1) };
}

test('host runs Hoop Rush over a direct link: lobby, ready, shots, leave, handover, wrong code', async () => {
  linkTransport.link = (code, h) => new FakeLink(code, h);
  linkTransport.fetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    const { room, token } = createSignalRoom('QWE234', body.name, {}, Date.now());
    rooms.set('QWE234', { r: room, links: {} });
    serverMessages++;
    return Response.json({ code: 'QWE234', token, side: 0 }, { status: 201 });
  };
  const all = [];
  const track = c => { all.push(c); return c; };
  try {
  const made = await createRoom('Ada');
  assert.equal(made.state.status, 'waiting');
  const host = track(client({ room: made.room, token: made.token }));
  await wait(30);
  assert.ok(host.seen.welcome, 'host is welcomed at once');
  const guest = track(client({ room: 'QWE234', name: 'Lin' }));
  await wait(60);
  assert.ok(guest.seen.welcome, 'guest is welcomed with the host state');
  assert.equal(guest.seen.welcome.s.seat, 1);
  assert.equal(host.last().players[1].name, 'Lin');
  assert.equal(typeof guest.seen.offset, 'number', 'guest measured the clock offset over the link');
  assert.equal(guest.link.send({ t: 'ready' }), true);
  host.link.send({ t: 'ready' });
  await wait(30);
  assert.equal(guest.last().status, 'countdown');
  await wait(3200);
  host.link.tick();
  await wait(20);
  assert.equal(guest.last().status, 'playing');
  guest.link.send({ t: 'shot', id: 'shot-0001', aim: 0, power: .7, round: 1, overtime: 0 });
  guest.link.send({ t: 'shot', id: 'shot-0002', aim: 5, power: .7 });
  await wait(40);
  assert.equal(host.last().shots[1], 1, 'the guest shot reached the host');
  assert.equal(guest.seen.nacks.at(-1)?.action, 'shot', 'a bad shot comes back as a nack');
  // Wrong code and a full room.
  const lost = track(client({ room: 'ZZZ999', name: 'Lost' })); await wait(20);
  assert.equal(lost.seen.ends[0]?.message, MESSAGES.notFound);
  const third = track(client({ room: 'QWE234', name: 'Third' })); await wait(20);
  assert.equal(third.seen.ends[0]?.status, 409);
  // The guest leaves mid-match: the host sees a forfeit and that the friend left.
  guest.link.stop(true);
  await wait(40);
  assert.equal(host.last().status, 'finished');
  assert.equal(host.last().players[1].left, true);
  // A new friend joins: fresh lobby. Then the host leaves and the friend sees it.
  const next = track(client({ room: 'QWE234', name: 'Kim' })); await wait(60);
  assert.equal(next.seen.welcome?.state.status, 'waiting');
  host.link.stop(true); await wait(40);
  assert.equal(next.last().players[0].left, true, 'the remaining player sees the host left');
  assert.ok(serverMessages < 20, `server messages ${serverMessages}`);
  } finally { all.forEach(c => c.link.stop()); }
});
