import test from 'node:test';
import assert from 'node:assert/strict';
import { OnlineRoom, transport } from './network.js';
import { MESSAGES, createSignalRoom, hostOf, leaveSeat, publicSeats, seatOf, takeSeat } from '../server/signal.ts';

// A fake room server built on the real seat rules, and fake links that pass
// messages directly between two OnlineRooms, standing in for data channels.
const rooms = new Map();
const wait = (ms = 5) => new Promise(r => setTimeout(r, ms));
let serverMessages = 0;

class FakeLink {
  constructor(code, h) { this.code = code; this.h = h; this.side = 0; this.open = false; this.peer = null; this.serverMessages = 0; }
  view(room) { const live = s => !!room.links[s]; return { host: hostOf(room.r, live), seats: publicSeats(room.r, live), meta: room.meta }; }
  async start(hello) {
    const room = rooms.get(this.code);
    this.serverMessages++; serverMessages++;
    if (!room) throw Object.assign(new Error(MESSAGES.notFound), { status: 404 });
    let side;
    if (hello.t === 'hello') { side = seatOf(room.r, hello.token); if (side === null) throw Object.assign(new Error(MESSAGES.session), { status: 401 }); }
    else side = takeSeat(room.r, hello.name, Date.now()).side;
    this.side = side; room.links[side] = this;
    const welcome = { t: 'welcome', code: this.code, token: room.r.seats[side].token, side, ...this.view(room) };
    queueMicrotask(() => this.broadcast(room));
    return welcome;
  }
  broadcast(room) {
    for (const link of Object.values(room.links)) link?.h.onPeers?.({ t: 'peers', side: link.side, ...this.view(room) });
    const [a, b] = [room.links[0], room.links[1]];
    if (a && b && !a.open) { a.peer = b; b.peer = a; a.open = b.open = true; a.h.onOpen?.(); b.h.onOpen?.(); }
  }
  send(kind, data) { if (!this.open || !this.peer) return false; const copy = JSON.parse(JSON.stringify(data)); queueMicrotask(() => this.peer?.h.onMessage?.(kind, copy)); return true; }
  leave() {
    const room = rooms.get(this.code);
    this.serverMessages++; serverMessages++;
    leaveSeat(room.r, this.side, Date.now());
    const [a, b] = room.r.seats;
    delete room.links[this.side];
    if (a?.left && b && !b.left) { room.r.seats = [b, a]; const other = room.links[1]; delete room.links[1]; if (other) { other.side = 0; room.links[0] = other; } }
    const peer = this.peer; this.open = false; this.peer = null;
    if (peer) { peer.open = false; peer.peer = null; peer.h.onDown?.(); }
    this.broadcast(room);
  }
  dispose() {}
}

test('host runs the match; guest joins by code, serves, rematches; leave and handover work', async () => {
  const store = new Map();
  globalThis.sessionStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: k => store.delete(k) };
  transport.link = (code, h) => new FakeLink(code, h);
  transport.fetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    const { room, token } = createSignalRoom('QWE234', body.name, { bestOf: body.bestOf }, Date.now());
    rooms.set('QWE234', { r: room, links: {}, meta: { bestOf: body.bestOf } });
    serverMessages++;
    return Response.json({ code: 'QWE234', token, side: 0 }, { status: 201 });
  };
  const host = new OnlineRoom(), guest = new OnlineRoom();
  const statuses = [];
  guest.onStatus = (s, d) => statuses.push(`${s}:${d}`);
  try {
    const info = await host.create({ name: 'Ada', bestOf: 3 });
    assert.equal(info.status, 'waiting');
    assert.equal(host.isHost, true);
    store.clear();
    await guest.join({ code: 'qwe234', name: 'Lin' });
    await wait(20);
    assert.equal(guest.side, 1);
    assert.equal(host.info.players[1].name, 'Lin', 'host sees the guest in the lobby');
    await assert.rejects(guest.start(), /host starts/);
    await host.start();
    await wait(20);
    assert.equal(guest.info.status, 'playing', 'guest gets the host snapshot');
    // It is the host's serve first; then let the guest serve once it is theirs.
    host.setInput({ serve: true }); host.setInput({ serve: false });
    assert.equal(host._room.state.phase, 'serve');
    host._room.state.phase = 'ready'; host._room.state.server = 1;
    host._publish(true); await wait(20);
    guest.setInput({ x: .3, serve: true }); await wait(20);
    assert.equal(host._room.state.phase, 'serve', 'the guest serve reaches the host once');
    guest._sendInput(true); await wait(20);
    assert.ok(Math.abs(host._room.players[1].input.x - .3) < 1e-9, 'guest controls reach the host');
    // Finish the match and rematch from both sides.
    host._room.status = 'finished'; host._room.state.phase = 'matchover'; host._publish(true); await wait(20);
    await guest.rematch(); await host.rematch(); await wait(20);
    assert.equal(host._room.round, 2);
    assert.equal(guest.info.status, 'playing');
    // The guest leaves: the host sees it at once.
    await guest.leave(); await wait(20);
    assert.equal(host.status, 'left');
    assert.ok(host.info.players[1].left);
    // Wrong code and a full room are reported plainly.
    await assert.rejects(new OnlineRoom().join({ code: 'ZZZ999', name: 'Lost' }), e => e.message === MESSAGES.notFound);
    const back = new OnlineRoom(); await back.join({ code: 'QWE234', name: 'Lin again' }); await wait(20);
    store.clear();
    await assert.rejects(new OnlineRoom().join({ code: 'QWE234', name: 'Third' }), e => e.status === 409);
    // Host handover: when the host leaves, the guest becomes seat 0 and sees who left.
    const shown = [];
    back.onStatus = (s, d) => shown.push(`${s}:${d}`);
    await host.leave(); await wait(20);
    assert.equal(back.side, 0);
    assert.ok(shown.some(s => s.startsWith('left:Ada left')), shown.join(' | '));
    assert.ok(serverMessages < 20, `server messages: ${serverMessages}`);
    back.dispose();
  } finally { host.dispose(); guest.dispose(); }
});
