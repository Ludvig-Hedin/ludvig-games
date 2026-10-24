import test from 'node:test';
import assert from 'node:assert/strict';
import { browser, flush } from './browser-fakes.mjs';

const ok = body => Promise.resolve({ status: 200, json: async () => body });

test('player identity is created once, shared and survives localStorage.clear()', () => {
  const w = browser({ fetch: () => ok({}) });
  w.run('ludvig.js');
  const player = w.Ludvig.player;
  assert.match(player.id, /^[A-Za-z0-9_-]{22}$/);
  assert.ok(player.name.length >= 2 && player.name.length <= 16, player.name);
  assert.deepEqual(w.Ludvig.player, player);
  assert.deepEqual(JSON.parse(w.localStorage.getItem('ludvig:player')), player);
  w.localStorage.setItem('game-key', '1');
  w.localStorage.clear();
  assert.equal(w.localStorage.getItem('game-key'), null);
  assert.deepEqual(w.Ludvig.player, player);
  // Loading twice keeps the first instance.
  const first = w.Ludvig;
  w.run('ludvig.js');
  assert.equal(w.Ludvig, first);
});

test('score posts the run, notifies the hub and never rejects', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const calls = [];
  let mode = 'ok';
  const w = browser({ fetch: (url, options) => {
    calls.push({ url, body: options.body && JSON.parse(options.body) });
    if (mode === 'down') return Promise.reject(new TypeError('offline'));
    return ok({ ok: true, best: 5, rank: 1 });
  } });
  w.run('ludvig.js');
  assert.deepEqual(await w.Ludvig.score('demo', 5), { ok: true, best: 5, rank: 1 });
  assert.deepEqual(calls[0].body, { game: 'demo', player: w.Ludvig.player.id, name: w.Ludvig.player.name, score: 5 });
  assert.deepEqual(w.posted, [{ data: { type: 'ludvig-score', board: 'demo' }, origin: 'https://games.ludvighedin.com' }]);
  assert.deepEqual(await w.Ludvig.score('demo', NaN), { ok: false, error: 'bad-score' });
  mode = 'down';
  const pending = w.Ludvig.score('demo', 7);
  await flush();
  assert.equal(calls.length, 2);
  t.mock.timers.tick(5000);
  const result = await pending;
  assert.equal(calls.length, 3, 'retried exactly once');
  assert.deepEqual(result, { ok: false, error: 'offline' });
  const top = await w.Ludvig.top('demo', '7d');
  assert.deepEqual(top, { entries: [], you: null, error: 'offline' });
  assert.deepEqual(await w.Ludvig.mp.list({ game: 'demo' }), []);
});

test('setName cleans the name, saves it and reports refusals', async () => {
  let reply = { ok: true };
  const w = browser({ fetch: () => ok(reply) });
  w.run('ludvig.js');
  assert.deepEqual(await w.Ludvig.setName('  Super   Otter '), { ok: true, name: 'Super Otter', synced: true });
  assert.equal(w.Ludvig.player.name, 'Super Otter');
  assert.equal((await w.Ludvig.setName('x')).error, 'bad-name');
  reply = { ok: false, error: 'bad-name' };
  assert.equal((await w.Ludvig.setName('Blocked Word')).ok, false);
  assert.equal(w.Ludvig.player.name, 'Super Otter');
});

test('format', () => {
  const w = browser({ fetch: () => ok({}) });
  w.run('ludvig.js');
  const f = w.Ludvig.format;
  assert.equal(f(1234567, 'int'), '1,234,567');
  assert.equal(f(42.25, 'float1'), '42.3');
  assert.equal(f(83456, 'time-ms'), '1:23.46');
  assert.equal(f(42, 'time-s'), '42 s');
  assert.equal(f(75, 'time-s'), '1:15');
  assert.equal(f(3725.5, 'time-s'), '1:02:05.50');
  assert.equal(f(1500, 'money'), '$1,500');
  assert.equal(f(undefined), '–');
});

class FakeSocket {
  static all = [];
  constructor(url) { this.url = new URL(url); this.readyState = 1; this.sent = []; FakeSocket.all.push(this); }
  send(text) { this.sent.push(JSON.parse(text)); }
  close() { this.readyState = 3; }
  server(message) { this.onmessage?.({ data: JSON.stringify(message) }); }
  drop(code = 1006) { this.readyState = 3; this.onclose?.({ code }); }
}
const welcome = (peers, host = peers[0].id) => ({ t: 'welcome', code: 'ABCD', self: peers.at(-1), peers, host, seed: 7, meta: {}, max: 4, public: true });
const A = { id: 'a', name: 'A', joinedAt: 1 }, B = { id: 'b', name: 'B', joinedAt: 2 }, C = { id: 'c', name: 'C', joinedAt: 3 };

test('mp: join, events, meta, and one silent reconnect; gameplay never uses the server socket', async t => {
  FakeSocket.all = [];
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const w = browser({ fetch: () => ok({}), WebSocket: FakeSocket });
  w.run('ludvig.js');
  const joining = w.Ludvig.mp.join({ game: 'citrus', quick: true, max: 4 });
  const first = FakeSocket.all[0];
  assert.equal(first.url.pathname, '/mp/ws');
  assert.equal(first.url.searchParams.get('quick'), '1');
  assert.equal(first.url.searchParams.get('player'), w.Ludvig.player.id);
  first.server(welcome([A, B]));
  const room = await joining;
  assert.equal(room.code, 'ABCD');
  assert.equal(room.host, 'a');
  assert.equal(room.seed, 7);
  const seen = [];
  for (const type of ['join', 'leave', 'host', 'message', 'meta', 'close']) room.on(type, (...args) => seen.push([type, ...args]));
  first.server({ t: 'msg', from: 'a', data: { x: 1 } }); // Old relay frame: ignored now.
  first.server({ t: 'join', peer: C });
  room.send({ y: 2 });
  room.sendTo('a', 'hi');
  room.setMeta({ phase: 'racing' });
  room.setMeta({ phase: 'racing' });
  // No WebRTC in this fake window: gameplay is not sent anywhere, and never through the server.
  assert.deepEqual(first.sent, [{ t: 'meta', meta: { phase: 'racing' } }], 'a repeat while the first is on its way is skipped');
  first.server({ t: 'meta', meta: { phase: 'racing' } });
  room.setMeta({ phase: 'racing' });
  assert.equal(first.sent.length, 1, 'a meta the room already has and we already sent is not sent again');
  room.setMeta({ phase: 'lobby' });
  first.server({ t: 'meta', meta: { phase: 'lobby' } });
  room.setMeta({ phase: 'racing' });
  assert.equal(first.sent.length, 3, 'a real change is always sent');
  first.server({ t: 'meta', meta: { phase: 'racing' } });
  first.drop(1006);
  room.setMeta({ phase: 'away' });
  t.mock.timers.tick(600);
  await flush();
  const second = FakeSocket.all[1];
  assert.equal(second.url.searchParams.get('room'), 'ABCD', 'reconnects to the same room');
  second.server(welcome([B, C], 'b'));
  await flush();
  assert.deepEqual(second.sent, [{ t: 'meta', meta: { phase: 'away' } }], 'buffered frame flushed');
  assert.deepEqual(seen, [['join', C], ['meta', { phase: 'racing' }], ['meta', { phase: 'lobby' }], ['meta', { phase: 'racing' }], ['leave', A], ['host', 'b'], ['meta', {}]]);
  room.leave();
  assert.deepEqual(second.sent.at(-1), { t: 'bye' });
  assert.deepEqual(seen.at(-1), ['close', 'left']);
});

test('mp: server refusals reject with a code; intentional closes do not reconnect', async t => {
  FakeSocket.all = [];
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const w = browser({ fetch: () => ok({}), WebSocket: FakeSocket });
  w.run('ludvig.js');
  const full = w.Ludvig.mp.join({ game: 'citrus', room: 'abcd' });
  assert.equal(FakeSocket.all[0].url.searchParams.get('room'), 'ABCD');
  FakeSocket.all[0].server({ t: 'error', code: 'full' });
  FakeSocket.all[0].drop(4409);
  await assert.rejects(full, error => error.code === 'full');
  await assert.rejects(w.Ludvig.mp.join({ game: 'citrus' }), error => error.code === 'bad-request');
  const creating = w.Ludvig.mp.create({ game: 'citrus', max: 3 });
  const socket = FakeSocket.all.at(-1);
  assert.equal(socket.url.searchParams.get('create'), '1');
  assert.equal(socket.url.searchParams.get('visible'), null, 'private by default');
  socket.server(welcome([A]));
  const room = await creating;
  const closes = [];
  room.on('close', reason => closes.push(reason));
  socket.drop(4000);
  t.mock.timers.tick(1000);
  assert.deepEqual(closes, ['replaced']);
  assert.equal(FakeSocket.all.at(-1), socket, 'no reconnect after replacement');
});

test('API base: every /api call and the room socket go to window.__LUDVIG_API, without cookies or preflight', async () => {
  FakeSocket.all = [];
  const calls = [];
  const w = browser({ api: 'http://127.0.0.1:4318/', WebSocket: FakeSocket, fetch: (url, options) => { calls.push({ url: String(url), options }); return ok(String(url).endsWith('/assets/boards.json') ? {} : { ok: true, entries: [], you: null, records: [], rooms: [] }); } });
  w.run('ludvig.js');
  await w.Ludvig.score('demo', 5);
  await w.Ludvig.top('demo', 'all');
  await w.Ludvig.records();
  await w.Ludvig.setName('Otter Bo');
  await w.Ludvig.mp.list({ game: 'citrus' });
  await w.Ludvig.boards();
  const api = calls.filter(c => c.url.includes('/api/'));
  assert.equal(api.length, 5);
  assert.ok(api.every(c => c.url.startsWith('http://127.0.0.1:4318/api/')), JSON.stringify(api.map(c => c.url)));
  assert.ok(api.every(c => c.options.credentials === 'omit'), 'no cookies to the API');
  const posts = api.filter(c => c.options.method === 'POST');
  assert.equal(posts.length, 2);
  assert.ok(posts.every(c => c.options.headers['Content-Type'] === 'text/plain;charset=UTF-8'), 'a CORS simple request: no preflight');
  assert.equal(calls.find(c => c.url.endsWith('boards.json')).url, '/assets/boards.json', 'static files stay on the page origin');
  assert.equal(calls.find(c => c.url.endsWith('boards.json')).options.credentials, 'same-origin');
  w.Ludvig.mp.join({ game: 'citrus', room: 'ABCD' }).catch(() => {});
  assert.equal(FakeSocket.all[0].url.origin, 'ws://127.0.0.1:4318');
  assert.equal(FakeSocket.all[0].url.pathname, '/mp/ws');
  // Production shape: https becomes wss.
  const prod = browser({ api: 'https://ludvig-games-api.ludvig.workers.dev', WebSocket: FakeSocket, fetch: () => ok({}) });
  prod.run('ludvig.js');
  prod.Ludvig.mp.join({ game: 'citrus', room: 'ABCD' }).catch(() => {});
  assert.equal(FakeSocket.all.at(-1).url.origin, 'wss://ludvig-games-api.ludvig.workers.dev');
  // No base, or a bad one, means same origin.
  for (const api of [undefined, '', 'javascript:alert(1)', 'http://evil.example']) {
    const seen = [];
    const same = browser({ api, WebSocket: FakeSocket, fetch: url => { seen.push(String(url)); return ok({}); } });
    same.run('ludvig.js');
    await same.Ludvig.top('demo');
    assert.ok(seen[0].startsWith('/api/scores?'), `${api}: ${seen[0]}`);
    same.Ludvig.mp.join({ game: 'citrus', room: 'ABCD' }).catch(() => {});
    assert.equal(FakeSocket.all.at(-1).url.origin, 'wss://games.ludvighedin.com');
  }
});

test('API out (429, 503, daily limit, unreachable): boards and the trophy hide quietly, nothing throws, and they come back', async () => {
  const BOARDS = { 'demo:a': { game: 'demo', gameName: 'Demo', label: 'Score', format: 'int' } };
  let mode = 'up';
  const fetch = async (url, options = {}) => {
    if (String(url).endsWith('/assets/boards.json')) return { status: 200, json: async () => BOARDS };
    if (mode === 'unreachable') throw new TypeError('Failed to fetch'); // what a CORS-less daily-limit page looks like
    if (mode === '503') return { status: 503, json: async () => ({ ok: false, error: 'unavailable' }) };
    if (mode === '429') return { status: 429, json: async () => { throw new SyntaxError('HTML'); } };
    if (mode === 'limited' && options.method === 'POST') return { status: 429, json: async () => ({ ok: false, error: 'rate-limited' }) };
    if (options.method === 'POST') return { status: 200, json: async () => ({ ok: true, best: 5, rank: 2, week: { rank: 2, score: 5 } }) };
    return { status: 200, json: async () => ({ entries: [{ rank: 1, name: 'Bo', score: 9, player: 'x' }], you: null }) };
  };
  const w = browser({ fetch, dom: true, api: 'https://ludvig-games-api.ludvig.workers.dev', game: { slug: 'demo', name: 'Demo', boards: ['demo:a'], button: 'br' } });
  w.run('ludvig.js');
  const settle = async () => { for (let i = 0; i < 6; i++) await flush(); };
  const trophy = w.document.body.children.find(node => node.getAttribute('data-ludvig-ui') === '');
  assert.ok(trophy && !trophy.hidden, 'trophy shown while the API is fine');
  const container = w.document.createElement('div');
  const list = w.Ludvig.ui.board(container, { board: 'demo:a', periods: ['all'] });
  await settle();
  const host = container.children[0];
  assert.equal(host.hidden, false);
  for (const out of ['unreachable', '503', '429']) {
    mode = out;
    list.refresh();
    await settle();
    assert.equal(host.hidden, true, `${out}: board hidden`);
    assert.ok(!host.all().some(node => /offline|unavailable/i.test(node.textContent)), `${out}: no error text`);
    assert.equal(trophy.hidden, true, `${out}: trophy hidden`);
    mode = 'up';
    list.refresh();
    await settle();
    assert.equal(host.hidden, false, `${out}: back once the API answers`);
    assert.equal(trophy.hidden, false);
  }
  // Too many runs in a minute is not an outage: the boards stay.
  mode = 'limited';
  assert.deepEqual(await w.Ludvig.score('demo:a', 5), { ok: false, error: 'rate-limited' });
  assert.equal(trophy.hidden, false);
  mode = 'unreachable';
  assert.deepEqual(await w.Ludvig.top('demo:a'), { entries: [], you: null, error: 'offline' });
  assert.deepEqual(await w.Ludvig.records(), { records: [], player: null, error: 'offline' });
  assert.deepEqual(await w.Ludvig.mp.list({ game: 'demo' }), []);
  list.destroy();
});

test('mp: a tab hidden for 5 minutes leaves the room and rejoins when shown again', async t => {
  FakeSocket.all = [];
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const w = browser({ fetch: () => ok({}), WebSocket: FakeSocket });
  w.run('ludvig.js');
  const joining = w.Ludvig.mp.join({ game: 'citrus', room: 'ABCD' });
  const first = FakeSocket.all[0];
  first.server(welcome([A, B]));
  const room = await joining;
  const seen = [];
  for (const type of ['join', 'leave', 'host', 'close']) room.on(type, (...args) => seen.push([type, ...args]));
  w.document.visibilityState = 'hidden';
  w.fireDocument('visibilitychange');
  t.mock.timers.tick(4 * 60e3);
  assert.equal(first.readyState, 1, 'still in the room after 4 minutes');
  w.document.visibilityState = 'visible';
  w.fireDocument('visibilitychange');
  w.document.visibilityState = 'hidden';
  w.fireDocument('visibilitychange');
  t.mock.timers.tick(5 * 60e3 - 1);
  assert.equal(first.readyState, 1, 'the 5 minutes start again after the tab was shown');
  t.mock.timers.tick(1);
  assert.deepEqual(first.sent.at(-1), { t: 'bye' }, 'leaves the server room');
  assert.equal(first.readyState, 3, 'and closes the socket');
  const pings = first.sent.length;
  t.mock.timers.tick(10 * 60e3);
  assert.equal(first.sent.length, pings, 'no pings while away');
  assert.equal(FakeSocket.all.length, 1, 'no reconnect while hidden');
  room.setMeta({ phase: 'away' });
  w.document.visibilityState = 'visible';
  w.fireDocument('visibilitychange');
  const second = FakeSocket.all[1];
  assert.equal(second.url.searchParams.get('room'), 'ABCD', 'rejoins the same room');
  second.server(welcome([B, { ...A, joinedAt: 9 }], 'b'));
  await flush();
  assert.deepEqual(second.sent, [{ t: 'meta', meta: { phase: 'away' } }], 'what was set while away goes out');
  assert.deepEqual(seen, [['host', 'b']]);
  t.mock.timers.tick(50e3);
  assert.deepEqual(second.sent.at(-1), { t: 'ping' }, 'pings again');
  // A room that ended while the tab was away closes with the normal reason.
  w.document.visibilityState = 'hidden';
  w.fireDocument('visibilitychange');
  t.mock.timers.tick(5 * 60e3);
  w.document.visibilityState = 'visible';
  w.fireDocument('visibilitychange');
  const third = FakeSocket.all[2];
  third.server({ t: 'error', code: 'not-found' });
  third.drop(4404);
  await flush(); await flush();
  assert.deepEqual(seen.at(-1), ['close', 'not-found']);
});
