import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { fakeD1 } from './d1-fake.mjs';
import { RATE_LIMITS, memoryLimiters } from '../../worker/util.mjs';

const stub = new URL('./cf-stub.mjs', import.meta.url).href;
register(`data:text/javascript,${encodeURIComponent(`export async function resolve(specifier, context, next) {
  if (specifier === 'cloudflare:workers') return { url: ${JSON.stringify(stub)}, shortCircuit: true };
  return next(specifier, context);
}`)}`);
const { default: worker } = await import('../../worker/index.mjs');

const BOARDS = {
  pigeon: { game: 'pigeon', order: 'desc', format: 'int', min: 0, max: 1000, label: 'Score' },
  jailbreak: { game: 'jailbreak', order: 'asc', format: 'time-s', min: 1, max: 86400, label: 'Time' },
};
const env = (db = fakeD1(), extra = {}) => ({
  DB: db,
  ...memoryLimiters(),
  ASSETS: { fetch: async request => new URL(request.url).pathname === '/assets/boards.json'
    ? new Response(JSON.stringify(BOARDS), { headers: { 'Content-Type': 'application/json' } })
    : new Response('static file') },
  ...extra,
});
/** The API Worker on the Free account: no assets (bundled boards), reached at its workers.dev address. */
const API = 'https://ludvig-games-api.ludvig.workers.dev';
const apiEnv = (db = fakeD1(), extra = {}) => ({ DB: db, ...memoryLimiters(), ...extra });
/** A database that records every statement, so tests can prove a refused request wrote (or read) nothing. */
function spyD1(db = fakeD1()) {
  const sql = [];
  return { sql, raw: db.raw, prepare: text => { sql.push(text); return db.prepare(text); }, batch: statements => { sql.push('BATCH'); return db.batch(statements); } };
}
const writes = spy => spy.sql.filter(text => /^\s*(INSERT|UPDATE|DELETE|BATCH)/i.test(text));
const rowCount = db => db.raw.prepare('SELECT COUNT(*) AS n FROM scores').get().n;
const ctx = { waitUntil() {} };
const ORIGIN = 'https://games.ludvighedin.com';
const id = n => `httpplayer${String(n).padStart(12, '0')}`;
const post = (path, body, headers = {}) => new Request(ORIGIN + path, {
  method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json', Origin: ORIGIN, 'CF-Connecting-IP': '203.0.113.9', ...headers },
});
const call = async (e, request) => { const response = await worker.fetch(request, e, ctx); return { response, data: await response.json().catch(() => null) }; };

test('POST then GET a board, with security headers and public player ids', async () => {
  const e = env();
  let { response, data } = await call(e, post('/api/scores', { game: 'pigeon', player: id(1), name: 'Brave Pigeon 42', score: 120 }));
  assert.equal(response.status, 200);
  assert.deepEqual(data, { ok: true, best: 120, rank: 1, week: { rank: 1, score: 120 } });
  assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.equal(response.headers.get('Referrer-Policy'), 'strict-origin-when-cross-origin');
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  await call(e, post('/api/scores', { game: 'pigeon', player: id(2), name: 'Otter', score: 300 }));
  ({ response, data } = await call(e, new Request(`${ORIGIN}/api/scores?game=pigeon&period=7d&player=${id(1)}&limit=20`)));
  assert.equal(response.status, 200);
  assert.deepEqual(data.entries.map(entry => [entry.rank, entry.name, entry.score]), [[1, 'Otter', 300], [2, 'Brave Pigeon 42', 120]]);
  assert.ok(data.entries.every(entry => /^[0-9a-f]{12}$/.test(entry.player)), 'private ids never leave the server');
  assert.equal(data.you.rank, 2);
  assert.equal(data.you.player, data.entries[1].player);
  ({ data } = await call(e, new Request(`${ORIGIN}/api/scores?game=pigeon`)));
  assert.equal(data.you, null);
});

test('validation errors and method/route handling', async () => {
  const e = env();
  assert.equal((await call(e, post('/api/scores', { game: 'nope', player: id(1), name: 'Bo', score: 1 }))).response.status, 404);
  assert.equal((await call(e, post('/api/scores', { game: 'pigeon', player: id(1), name: 'Bo', score: 5000 }))).data.error, 'out-of-range');
  assert.equal((await call(e, post('/api/scores', { game: 'pigeon', player: id(1), score: 1 }, { 'Content-Type': 'application/x-www-form-urlencoded' }))).response.status, 415);
  // text/plain JSON is what the client sends (no CORS preflight).
  assert.equal((await call(e, post('/api/scores', { game: 'pigeon', player: id(1), name: 'Bo', score: 1 }, { 'Content-Type': 'text/plain;charset=UTF-8' }))).response.status, 200);
  assert.equal((await call(e, post('/api/scores', { game: 'pigeon', player: id(1), score: 1 }, { Origin: 'https://evil.example' }))).response.status, 403);
  assert.equal((await call(e, post('/api/scores', { game: 'pigeon', player: id(1), name: 'x'.repeat(3000), score: 1 }))).response.status, 413);
  assert.equal((await call(e, new Request(`${ORIGIN}/api/scores?game=pigeon&period=1y`))).response.status, 400);
  assert.equal((await call(e, new Request(`${ORIGIN}/api/scores`, { method: 'DELETE' }))).response.status, 405);
  assert.equal((await call(e, new Request(`${ORIGIN}/api/unknown`))).response.status, 404);
  assert.equal((await call(e, new Request(`${ORIGIN}/mp/ws?game=citrus`))).response.status, 426);
  const asset = await worker.fetch(new Request(`${ORIGIN}/pigeon/`), e, ctx);
  assert.equal(await asset.text(), 'static file');
});

test('rate limits come from the rate-limit bindings: per player per board, then per IP', async () => {
  const e = env();
  const perPlayer = RATE_LIMITS.RL_SCORE_PLAYER.limit;
  for (let i = 0; i < perPlayer; i++) assert.equal((await call(e, post('/api/scores', { game: 'jailbreak', player: id(3), name: 'Bo', score: 100 - i }))).response.status, 200);
  const blocked = await call(e, post('/api/scores', { game: 'jailbreak', player: id(3), name: 'Bo', score: 50 }));
  assert.equal(blocked.response.status, 429);
  assert.equal(blocked.data.error, 'rate-limited');
  assert.equal(blocked.response.headers.get('Access-Control-Allow-Origin'), ORIGIN, 'the page can read the refusal');
  assert.equal((await call(e, post('/api/scores', { game: 'pigeon', player: id(3), name: 'Bo', score: 50 }))).response.status, 200);
  const ip = { 'CF-Connecting-IP': '198.51.100.7' };
  const perIp = RATE_LIMITS.RL_SCORE_IP.limit;
  for (let i = 0; i < perIp; i++) assert.equal((await call(e, post('/api/scores', { game: 'pigeon', player: id(100 + i), name: 'Bo', score: i }, ip))).response.status, 200);
  assert.equal((await call(e, post('/api/scores', { game: 'pigeon', player: id(999), name: 'Bo', score: 1 }, ip))).response.status, 429);
  assert.equal((await call(e, post('/api/scores', { game: 'pigeon', player: id(999), name: 'Bo', score: 1 }, { 'CF-Connecting-IP': '198.51.100.8' }))).response.status, 200);
});

test('refused requests write nothing: rate-limited score posts and renames leave the database untouched', async () => {
  const spy = spyD1();
  const e = env(spy, { RL_SCORE_IP: { limit: async () => ({ success: false }) }, RL_NAME: { limit: async () => ({ success: false }) } });
  assert.equal((await call(e, post('/api/scores', { game: 'pigeon', player: id(7), name: 'Bo', score: 5 }))).response.status, 429);
  assert.equal((await call(e, post('/api/name', { player: id(7), name: 'Otter' }))).response.status, 429);
  assert.deepEqual(spy.sql, [], 'not even a read');
  assert.equal(rowCount(spy), 0);
  // Validation failures are refused before the limiter and the database.
  const counted = [];
  const e2 = env(spy, { RL_SCORE_IP: { limit: async ({ key }) => { counted.push(key); return { success: true }; } } });
  assert.equal((await call(e2, post('/api/scores', { game: 'pigeon', player: id(7), name: 'Bo', score: 5000 }))).response.status, 400);
  assert.deepEqual(counted, []);
  assert.deepEqual(writes(spy), []);
});

test('a missing rate limiter fails closed with 503 and writes nothing', async () => {
  const spy = spyD1();
  const e = env(spy, { RL_SCORE_IP: undefined });
  const original = console.error;
  console.error = () => {};
  try {
    const { response } = await call(e, post('/api/scores', { game: 'pigeon', player: id(8), name: 'Bo', score: 5 }));
    assert.equal(response.status, 503);
  } finally { console.error = original; }
  assert.deepEqual(spy.sql, []);
});

test('CORS: the API answers only https://games.ludvighedin.com, including preflight', async () => {
  const spy = spyD1();
  const e = apiEnv(spy);
  const preflight = (origin, path = '/api/scores') => new Request(API + path, { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' } });
  let response = await worker.fetch(preflight(ORIGIN), e, ctx);
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  assert.match(response.headers.get('Access-Control-Allow-Methods'), /POST/);
  assert.match(response.headers.get('Access-Control-Allow-Headers'), /Content-Type/i);
  assert.equal(response.headers.get('Access-Control-Max-Age'), '7200');
  assert.equal(response.headers.get('Vary'), 'Origin');
  for (const origin of ['https://evil.example', 'http://127.0.0.1:4317', 'null', 'https://games.ludvighedin.com.evil.example']) {
    response = await worker.fetch(preflight(origin), e, ctx);
    assert.equal(response.status, 403, origin);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), null, origin);
  }
  // A real cross-origin read from the site works and carries the CORS header.
  const posted = await call(e, new Request(`${API}/api/scores`, { method: 'POST', body: JSON.stringify({ game: 'pigeon', player: id(1), name: 'Bo', score: 9 }), headers: { 'Content-Type': 'text/plain;charset=UTF-8', Origin: ORIGIN, 'CF-Connecting-IP': '203.0.113.1' } }));
  assert.equal(posted.response.status, 200);
  assert.equal(posted.response.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  const read = await worker.fetch(new Request(`${API}/api/scores?game=pigeon&player=${id(1)}`, { headers: { Origin: ORIGIN } }), e, ctx);
  assert.equal(read.status, 200);
  assert.equal(read.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  const data = await read.json();
  assert.equal(data.entries[0].score, 9, 'bundled board config is used when there are no assets');
  assert.equal(data.you.rank, 1);
  // Foreign pages, and requests with no Origin at all, are refused before the database.
  const before = spy.sql.length;
  for (const headers of [{ Origin: 'https://evil.example' }, {}]) {
    const refused = await worker.fetch(new Request(`${API}/api/scores?game=pigeon&player=${id(1)}`, { headers }), e, ctx);
    assert.equal(refused.status, 403);
    assert.equal(refused.headers.get('Access-Control-Allow-Origin'), null);
  }
  const foreignPost = await worker.fetch(new Request(`${API}/api/scores`, { method: 'POST', body: JSON.stringify({ game: 'pigeon', player: id(2), name: 'Bo', score: 99 }), headers: { 'Content-Type': 'text/plain', Origin: 'https://evil.example' } }), e, ctx);
  assert.equal(foreignPost.status, 403);
  assert.equal(spy.sql.length, before, 'refused origins never reach D1');
});

test('CORS: the local preview origin is allowed only with DEV=1', async () => {
  const local = 'http://127.0.0.1:4317';
  const request = () => new Request(`${API}/api/scores?game=pigeon`, { headers: { Origin: local } });
  assert.equal((await worker.fetch(request(), apiEnv(), ctx)).status, 403);
  const response = await worker.fetch(request(), apiEnv(fakeD1(), { DEV: '1' }), ctx);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), local);
});

test('the WebSocket upgrade refuses other origins before touching any Durable Object or limiter', async () => {
  const touched = [];
  const trap = name => new Proxy({}, { get: (_, key) => { touched.push(`${name}.${String(key)}`); return () => { throw new Error(`${name} touched`); }; } });
  const e = { DB: trap('DB'), MP_ROOM: trap('MP_ROOM'), MP_LOBBY: trap('MP_LOBBY'), RL_SOCKET: trap('RL_SOCKET'), RL_ROOM: trap('RL_ROOM') };
  const upgrade = headers => new Request(`${API}/mp/ws?game=citrus&quick=1&player=${id(1)}`, { headers: { Upgrade: 'websocket', ...headers } });
  for (const headers of [{ Origin: 'https://evil.example' }, {}, { Origin: 'http://127.0.0.1:4317' }]) {
    const response = await worker.fetch(upgrade(headers), e, ctx);
    assert.equal(response.status, 403, JSON.stringify(headers));
  }
  assert.equal((await worker.fetch(new Request(`${API}/api/mp/list?game=citrus`, { headers: { Origin: 'https://evil.example' } }), e, ctx)).status, 403);
  assert.deepEqual(touched, []);
});

test('unknown API paths such as /api/health answer 404 and touch nothing', async () => {
  const touched = [];
  const trap = name => new Proxy({}, { get: (_, key) => { touched.push(`${name}.${String(key)}`); return () => { throw new Error(`${name} touched`); }; } });
  const e = { DB: trap('DB'), MP_ROOM: trap('MP_ROOM'), MP_LOBBY: trap('MP_LOBBY'), ...memoryLimiters() };
  for (const path of ['/api/health', '/api/turn', '/mp/other']) {
    const response = await worker.fetch(new Request(API + path, { headers: { Origin: ORIGIN } }), e, ctx);
    assert.equal(response.status, 404, path);
  }
  const page = await worker.fetch(new Request(`${API}/pigeon/`), e, ctx);
  assert.equal(page.status, 404, 'the API Worker serves no pages');
  assert.deepEqual(touched, []);
});

test('database failure fails closed', async () => {
  const broken = { prepare() { throw new Error('D1 down'); }, batch() { throw new Error('D1 down'); } };
  const original = console.error;
  console.error = () => {};
  try {
    const { response, data } = await call(env(broken), post('/api/scores', { game: 'pigeon', player: id(1), name: 'Bo', score: 1 }));
    assert.equal(response.status, 503);
    assert.equal(data.error, 'unavailable');
  } finally { console.error = original; }
});

test('rename and my records', async () => {
  const e = env();
  await call(e, post('/api/scores', { game: 'pigeon', player: id(5), name: 'Old Name', score: 10 }));
  await call(e, post('/api/scores', { game: 'jailbreak', player: id(5), name: 'Old Name', score: 40 }));
  let { response, data } = await call(e, post('/api/name', { player: id(5), name: '  New   Name ' }));
  assert.equal(response.status, 200);
  assert.deepEqual(data, { ok: true, name: 'New Name' });
  assert.equal((await call(e, post('/api/name', { player: id(5), name: 'fuck' }))).data.error, 'bad-name');
  ({ data } = await call(e, new Request(`${ORIGIN}/api/scores?game=jailbreak`)));
  assert.equal(data.entries[0].name, 'New Name');
  ({ data } = await call(e, new Request(`${ORIGIN}/api/me?player=${id(5)}`)));
  assert.deepEqual(data.records.sort((a, b) => a.game.localeCompare(b.game)), [{ game: 'jailbreak', best: 40, rank: 1 }, { game: 'pigeon', best: 10, rank: 1 }]);
  assert.equal((await call(e, new Request(`${ORIGIN}/api/me?player=bad`))).response.status, 400);
});
