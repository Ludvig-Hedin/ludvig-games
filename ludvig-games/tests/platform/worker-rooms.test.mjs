/** MpRoom (hibernation API) and MpLobby (site-wide registry) with a fake Durable Object context. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { LOBBY, PING, PONG, ROOM } from '../../worker/rooms.mjs';

const stub = new URL('./cf-stub.mjs', import.meta.url).href;
register(`data:text/javascript,${encodeURIComponent(`export async function resolve(specifier, context, next) {
  if (specifier === 'cloudflare:workers') return { url: ${JSON.stringify(stub)}, shortCircuit: true };
  return next(specifier, context);
}`)}`);
globalThis.WebSocketRequestResponsePair ??= class { constructor(request, response) { this.request = request; this.response = response; } };
const { default: worker, MpRoom, MpLobby, SAVE_MS } = await import('../../worker/index.mjs');

class HibernatingSocket {
  constructor(id) { this.attachment = { id, at: 1 }; this.sent = []; this.closed = null; }
  deserializeAttachment() { return this.attachment; }
  serializeAttachment(value) { this.attachment = value; }
  send(text) { if (this.closed) throw new Error('closed'); this.sent.push(JSON.parse(text)); }
  close(code, reason) { this.closed ??= { code, reason }; }
  last(type) { return this.sent.filter(m => m.t === type).at(-1); }
}

function fakeCtx(stored = {}, sockets = []) {
  const data = new Map(Object.entries(stored));
  const ctx = {
    data, sockets, alarm: null, autoResponse: null, ready: null, writes: [],
    storage: {
      get: async key => structuredClone(data.get(key)),
      put: async (key, value) => { ctx.writes.push(['put', key]); data.set(key, structuredClone(value)); },
      delete: async key => { ctx.writes.push(['delete', key]); data.delete(key); },
      setAlarm: async at => { ctx.alarm = at; },
      deleteAlarm: async () => { ctx.alarm = null; },
    },
    getWebSockets: () => sockets,
    acceptWebSocket: ws => sockets.push(ws),
    setWebSocketAutoResponse: pair => { ctx.autoResponse = pair; },
    blockConcurrencyWhile: fn => { ctx.ready = fn(); return ctx.ready; },
  };
  return ctx;
}

function lobbyEnv() {
  const lobbies = new Map();
  const calls = [];
  return {
    calls, lobbies,
    MP_LOBBY: {
      idFromName: name => name,
      get: name => {
        if (!lobbies.has(name)) lobbies.set(name, new MpLobby(fakeCtx(), {}));
        const lobby = lobbies.get(name);
        return new Proxy({}, { get: (_, method) => async (...args) => { calls.push([name, method, ...args]); await lobby.ctx.ready; return lobby[method](...args); } });
      },
    },
  };
}

const saved = (peers, extra = {}) => ({ room: { game: 'cage', code: 'ABCD', room: { code: 'ABCD', max: 4, public: true, meta: {}, seed: 5, sequence: peers.length, peers, ...extra } } });
const P = (id, sequence) => ({ id, name: id.toUpperCase(), joinedAt: sequence, sequence, goneAt: null });

test('MpRoom wakes from hibernation with its peers, relays signaling and answers pings without waking', async () => {
  const a = new HibernatingSocket('a'), b = new HibernatingSocket('b');
  const env = lobbyEnv();
  const ctx = fakeCtx(saved([P('a', 0), P('b', 1)]), [a, b]);
  const room = new MpRoom(ctx, env);
  await ctx.ready;
  assert.equal(ctx.autoResponse.request, PING);
  assert.equal(ctx.autoResponse.response, PONG);
  assert.equal(room.room.host, 'a');
  room.webSocketMessage(a, JSON.stringify({ t: 'sig', to: 'b', data: { d: 'offer', sdp: 'x' } }));
  assert.deepEqual(b.last('sig'), { t: 'sig', from: 'a', data: { d: 'offer', sdp: 'x' } });
  room.webSocketMessage(a, JSON.stringify({ t: 'send', data: { x: 1 } }));
  assert.equal(b.sent.filter(m => m.t === 'msg').length, 0, 'no gameplay relay');
  assert.equal(ctx.alarm, null, 'no alarm while everyone is connected');
});

test('MpRoom: a dropped peer gets one grace alarm, then leaves; the alarm does not repeat', async () => {
  const a = new HibernatingSocket('a'), b = new HibernatingSocket('b');
  const env = lobbyEnv();
  const ctx = fakeCtx(saved([P('a', 0), P('b', 1)]), [a, b]);
  const room = new MpRoom(ctx, env);
  await ctx.ready;
  room.webSocketClose(a, 1006);
  assert.ok(ctx.alarm >= Date.now() + ROOM.graceMs - 100, 'grace alarm set');
  assert.equal(ctx.data.get('room').room.peers.find(p => p.id === 'a').goneAt > 0, true, 'stored, so a hibernated room remembers');
  room.room.peers.get('a').goneAt -= ROOM.graceMs; // the grace period has passed
  ctx.alarm = null; // the runtime clears an alarm when it fires
  await room.alarm();
  assert.equal(b.last('leave').peer.id, 'a');
  assert.equal(b.last('host').id, 'b');
  assert.equal(ctx.alarm, null, 'nothing left to wait for: no further alarm');
  clearTimeout(room.reportTimer);
  room.report();
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(env.calls.some(([name, method, game, code, info]) => name === 'site' && method === 'report' && game === 'cage' && code === 'ABCD' && info.players === 1));
  // The last peer leaves: the room reports empty at once and clears its storage.
  room.webSocketClose(b, 1000);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(ctx.data.has('room'), false);
  assert.ok(env.calls.some(([, method, , , info]) => method === 'report' && info.players === 0));
  clearTimeout(room.reportTimer);
});

test('MpRoom closes a socket that floods signaling', async () => {
  const a = new HibernatingSocket('a'), b = new HibernatingSocket('b');
  const env = lobbyEnv();
  const ctx = fakeCtx(saved([P('a', 0), P('b', 1)]), [a, b]);
  const room = new MpRoom(ctx, env);
  await ctx.ready;
  for (let i = 0; i < 100 && !a.closed; i++) room.webSocketMessage(a, JSON.stringify({ t: 'sig', to: 'b', data: { i } }));
  assert.deepEqual(a.closed, { code: 4429, reason: 'rate-limited' });
  assert.equal(b.last('leave').peer.id, 'a');
  assert.ok(b.sent.filter(m => m.t === 'sig').length <= 20);
  clearTimeout(room.reportTimer);
});

test('MpLobby is one object for the site, stores its rooms and refuses new rooms past the cap', async () => {
  const ctx = fakeCtx();
  const lobby = new MpLobby(ctx, {});
  await ctx.ready;
  const codes = [];
  for (let i = 0; i < LOBBY.maxRooms; i++) codes.push(lobby.reserve(i % 2 ? 'a' : 'b', { max: 2, public: false }));
  assert.ok(codes.every(Boolean));
  assert.equal(lobby.reserve('c', { max: 2, public: false }), null);
  assert.deepEqual(lobby.quick('c', { max: 2, allowCreate: true }), { error: 'unavailable' });
  const restarted = new MpLobby(fakeCtx(Object.fromEntries(ctx.data)), {});
  await restarted.ctx.ready;
  assert.equal(restarted.reserve('c', { max: 2, public: false }), null, 'the cap survives eviction');
});

test('MpRoom saves at most every 10 s, and meta past the budget is relayed but not saved or reported', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_000_000 });
  const a = new HibernatingSocket('a'), b = new HibernatingSocket('b');
  const env = lobbyEnv();
  const ctx = fakeCtx(saved([P('a', 0), P('b', 1)]), [a, b]);
  const room = new MpRoom(ctx, env);
  await ctx.ready;
  const puts = () => ctx.writes.filter(([op, key]) => op === 'put' && key === 'room').length;
  room.webSocketMessage(a, JSON.stringify({ t: 'meta', meta: { phase: 1 } }));
  assert.equal(puts(), 1, 'the first change is written at once');
  for (let i = 2; i <= 5; i++) room.webSocketMessage(a, JSON.stringify({ t: 'meta', meta: { phase: i } }));
  assert.equal(puts(), 1, 'changes within 10 s wait');
  assert.equal(b.last('meta').meta.phase, 5, 'players still see every change at once');
  t.mock.timers.tick(SAVE_MS);
  assert.equal(puts(), 2, 'one write when the 10 s are up');
  assert.equal(ctx.data.get('room').room.meta.phase, 5, 'with the latest state');
  t.mock.timers.tick(1000);
  const reports = () => env.calls.filter(([, method]) => method === 'report').length;
  const reportsBefore = reports();
  // Spend the rest of the meta budget (10 per 10 minutes), then go over it.
  for (let i = 6; i <= ROOM.metaBudget + 4; i++) { t.mock.timers.tick(1100); room.webSocketMessage(a, JSON.stringify({ t: 'meta', meta: { phase: i } })); }
  t.mock.timers.tick(SAVE_MS + 1100);
  const counted = reports() - reportsBefore;
  assert.equal(b.last('meta').meta.phase, ROOM.metaBudget + 4, 'over the budget, meta is still relayed');
  assert.ok(counted <= ROOM.metaBudget - 5, `lobby reports stay within the budget (${counted})`);
  const writesAfter = puts();
  for (let i = 0; i < 5; i++) { t.mock.timers.tick(SAVE_MS + 10); room.webSocketMessage(a, JSON.stringify({ t: 'meta', meta: { phase: 100 + i } })); }
  t.mock.timers.tick(SAVE_MS + 10);
  assert.equal(puts(), writesAfter, 'meta past the budget writes nothing');
  clearTimeout(room.reportTimer);
});

test('MpLobby writes only when rooms change: refused quick matches and a full site write nothing', async () => {
  const ctx = fakeCtx();
  const lobby = new MpLobby(ctx, {});
  await ctx.ready;
  assert.deepEqual(lobby.quick('cage', { max: 2, allowCreate: false }), { error: 'rate-limited' });
  assert.deepEqual(lobby.list('cage'), []);
  assert.deepEqual(ctx.writes, [], 'nothing to join: no write');
  const code = lobby.reserve('cage', { max: 2, public: true });
  assert.ok(code);
  assert.equal(ctx.writes.length, 1);
  lobby.report('cage', code, { players: 1, max: 2, meta: {}, public: true });
  lobby.report('cage', code, { players: 1, max: 2, meta: {}, public: true });
  assert.equal(ctx.writes.length, 2, 'a repeated report with nothing new writes nothing');
  for (let i = 1; i < LOBBY.maxRooms; i++) lobby.reserve('cage', { max: 2, public: false });
  const before = ctx.writes.length;
  assert.equal(lobby.reserve('cage', { max: 2, public: false }), null);
  assert.deepEqual(lobby.quick('other', { max: 2, allowCreate: true }), { error: 'unavailable' });
  assert.equal(ctx.writes.length, before, 'refused at the room cap: no write');
});

test('no TURN endpoint (STUN only, owner rule)', async () => {
  const response = await worker.fetch(new Request('https://games.ludvighedin.com/api/turn', { headers: { Origin: 'https://games.ludvighedin.com' } }), {}, { waitUntil() {} });
  assert.equal(response.status, 404);
});
