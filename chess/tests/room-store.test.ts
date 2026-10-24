import assert from 'node:assert/strict';
import { beforeEach, afterEach, describe, test } from 'node:test';
import { registerHooks } from 'node:module';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { DEFAULT_CONFIG, uciMove } from '../lib/game.ts';
import { createRoom, joinRoom, mutateRoom, type RoomState } from '../lib/room.ts';
import type { RoomRow } from '../lib/room-store.ts';

// Use real SQLite statements and transactions behind a small D1-shaped adapter.
// Only the platform binding is substituted; production CAS SQL runs unchanged.
const platform: Record<string, unknown> = {};
const bindingKey = Symbol.for('chess.tests.cloudflare.env');
(globalThis as unknown as Record<symbol, unknown>)[bindingKey] = platform;
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'cloudflare:workers') return {
      url: 'data:text/javascript,' + encodeURIComponent("export const env = globalThis[Symbol.for('chess.tests.cloudflare.env')];"), shortCircuit: true,
    };
    return nextResolve(specifier, context);
  },
});
const store = await import('../lib/room-store.ts');
const route = await import('../server/room.ts');
hooks.deregister();
delete (globalThis as unknown as Record<symbol, unknown>)[bindingKey];

class TestD1 {
  constructor(private sql: DatabaseSync) {}
  prepare(query: string) {
    let parameters: SQLInputValue[] = [];
    const sql = this.sql;
    return {
      bind(...values: SQLInputValue[]) { parameters = values; return this; },
      async first<T>() { return (sql.prepare(query).get(...parameters) ?? null) as T | null; },
      async run() { const result = sql.prepare(query).run(...parameters); return { success: true, meta: { changes: Number(result.changes) } }; },
    };
  }
}
let sqlite: DatabaseSync;
const CODE = 'ABCDEFGH';
const WHITE_TOKEN = '1'.repeat(64);
const BLACK_TOKEN = '2'.repeat(64);
const WHITE_HASH = await store.hashToken(WHITE_TOKEN);
const BLACK_HASH = await store.hashToken(BLACK_TOKEN);

describe('room persistence and API synchronization', () => {
beforeEach(() => {
  sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../drizzle/0000_glorious_harrier.sql', import.meta.url), 'utf8'));
  platform.DB = new TestD1(sqlite);
});
afterEach(() => { sqlite.close(); delete platform.DB; });

function seed(ready = true, whiteSeen = Date.now() - 6000, blackSeen = Date.now() - 9000): RoomRow {
  const now = Date.now();
  let state = createRoom({ ...DEFAULT_CONFIG, mode: 'online', nickname: 'Ada', color: 'w' }, WHITE_HASH, now);
  if (ready) state = joinRoom(state, BLACK_HASH, 'Grace', now);
  sqlite.prepare('INSERT INTO chess_rooms (code, version, state, white_seen, black_seen, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(CODE, 0, JSON.stringify(state), whiteSeen, ready ? blackSeen : 0, now, now);
  return row();
}
function row(): RoomRow { return sqlite.prepare('SELECT * FROM chess_rooms WHERE code = ?').get(CODE) as unknown as RoomRow; }
function state(snapshot: RoomRow): RoomState { return JSON.parse(snapshot.state); }
function post(body: Record<string, unknown>, token: string): Request {
  return new Request(`https://chess.test/api/rooms/${CODE}`, {
    method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://chess.test', authorization: `Bearer ${token}` }, body: JSON.stringify(body),
  });
}
const context = { params: Promise.resolve({ code: CODE }) };

test('database CAS accepts one state mutation and rejects a concurrent stale update', async () => {
  const before = seed(); const original = state(before);
  const first = mutateRoom(original, WHITE_HASH, { action: 'move', requestId: 'first-request', revision: original.game.revision, move: uciMove('e2e4') }, Date.now());
  const second = mutateRoom(original, WHITE_HASH, { action: 'move', requestId: 'second-request', revision: original.game.revision, move: uciMove('d2d4') }, Date.now());
  const saved = await store.saveRoom(before, first);
  assert.equal(saved?.version, 1);
  assert.equal(await store.saveRoom(before, second), null);
  assert.equal(state(row()).game.moves[0].san, 'e4');
});

test('a state commit preserves a heartbeat that arrived after the state was read', async () => {
  const before = seed(); const original = state(before);
  const latestHeartbeat = Date.now();
  sqlite.prepare('UPDATE chess_rooms SET white_seen = ? WHERE code = ?').run(latestHeartbeat, CODE);
  const next = mutateRoom(original, WHITE_HASH, { action: 'move', requestId: 'first-request', revision: original.game.revision, move: uciMove('e2e4') }, Date.now());
  const saved = await store.saveRoom(before, next);
  assert.equal(saved?.white_seen, latestHeartbeat);
});

test('rematch atomically exchanges presence timestamps with authenticated seats', async () => {
  const whiteSeen = Date.now() - 6000; const blackSeen = Date.now() - 11000;
  let snapshot = seed(true, whiteSeen, blackSeen); let current = state(snapshot);
  current = mutateRoom(current, WHITE_HASH, { action: 'resign', requestId: 'resign-request', revision: current.game.revision }, Date.now());
  snapshot = (await store.saveRoom(snapshot, current))!;
  current = mutateRoom(current, WHITE_HASH, { action: 'rematch', requestId: 'rematch-first', revision: current.game.revision }, Date.now());
  snapshot = (await store.saveRoom(snapshot, current))!;
  const staleBeforeSwap = snapshot;
  current = mutateRoom(current, BLACK_HASH, { action: 'rematch', requestId: 'rematch-second', revision: current.game.revision }, Date.now());
  snapshot = (await store.saveRoom(snapshot, current))!;
  assert.equal(snapshot.white_seen, blackSeen);
  assert.equal(snapshot.black_seen, whiteSeen);
  await store.touchRoom(staleBeforeSwap, WHITE_HASH);
  assert.equal(row().white_seen, blackSeen, 'a stale heartbeat cannot touch the old white seat');
  await store.touchRoom(snapshot, WHITE_HASH);
  assert.ok(row().black_seen > whiteSeen);
});

test('touch updates the returned snapshot and public projection immediately', async () => {
  const snapshot = seed(true, 0, 0);
  assert.equal(store.publicRoom(snapshot, WHITE_HASH).connected.w, false);
  await store.touchRoom(snapshot, WHITE_HASH);
  assert.equal(store.publicRoom(snapshot, WHITE_HASH).connected.w, true);
  assert.equal(snapshot.white_seen, row().white_seen);
});

test('the public projection never contains seat hashes or request deduplication records', () => {
  const snapshot = seed(); const view = store.publicRoom(snapshot, WHITE_HASH);
  assert.equal(view.you, 'w');
  assert.equal(store.publicRoom(snapshot, '').you, 'spectator');
  assert.ok(!JSON.stringify(view).includes(WHITE_HASH));
  assert.ok(!JSON.stringify(view).includes(BLACK_HASH));
  assert.equal('seats' in view, false);
  assert.equal('requests' in view, false);
});

test('join can recover after losing its first reply because the client already knows its token', async () => {
  seed(false);
  const first = await route.POST(post({ action: 'join', nickname: 'Grace' }, BLACK_TOKEN), context);
  assert.equal(first.status, 200);
  const reply = await first.json() as { token: string; you: string; connected: { b: boolean }; revision: number };
  assert.equal(reply.token, BLACK_TOKEN);
  assert.equal(reply.you, 'b');
  assert.equal(reply.connected.b, true);
  const retried = await route.POST(post({ action: 'join', nickname: 'Grace' }, BLACK_TOKEN), context);
  assert.equal(retried.status, 200);
  assert.equal((await retried.json() as { revision: number }).revision, reply.revision);
  assert.equal(state(row()).seats.b?.hash, BLACK_HASH);
});

test('concurrent identical POSTs both acknowledge one committed move', async () => {
  const snapshot = seed();
  const body = { action: 'move', requestId: 'same-request-123', revision: state(snapshot).game.revision, move: uciMove('e2e4') };
  const responses = await Promise.all([route.POST(post(body, WHITE_TOKEN), context), route.POST(post(body, WHITE_TOKEN), context)]);
  assert.deepEqual(responses.map(response => response.status), [200, 200]);
  assert.equal(state(row()).game.moves.length, 1);
  assert.equal(state(row()).requests.length, 1);
  assert.match(responses[0].headers.get('server-timing') ?? '', /^app;dur=\d+$/);
});

test('stale revision errors carry the authoritative snapshot for immediate recovery', async () => {
  const snapshot = seed();
  const response = await route.POST(post({ action: 'move', requestId: 'stale-request', revision: 0, move: uciMove('e2e4') }, WHITE_TOKEN), context);
  assert.equal(response.status, 409);
  const body = await response.json() as { room: { revision: number; you: string } };
  assert.equal(body.room.revision, state(snapshot).game.revision);
  assert.equal(body.room.you, 'w');
});

test('room reads answer at once, without holding the request open', async () => {
  const snapshot = seed();
  const request = new Request(`https://chess.test/api/rooms/${CODE}?after=${state(snapshot).game.revision}&wait=1`);
  const startedAt = performance.now();
  const response = await route.GET(request, context);
  assert.equal(response.status, 200);
  assert.ok(performance.now() - startedAt < 200);
});

test('request parser rejects cross-origin and null-origin writes as client errors', async () => {
  for (const origin of ['https://evil.test', 'http://chess.test', 'null']) {
    const request = new Request('https://chess.test/api/rooms', { method: 'POST', headers: { origin }, body: '{}' });
    await assert.rejects(store.requestBody(request), (error: unknown) => (error as { status?: number }).status === 403);
  }
  assert.deepEqual(await store.requestBody(post({ action: 'join' }, BLACK_TOKEN)), { action: 'join' });
});

test('request parser caps bytes while streaming, including multibyte text', async () => {
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(new TextEncoder().encode(JSON.stringify({ nickname: 'é'.repeat(5000) }))); },
    cancel() { cancelled = true; },
  });
  const request = new Request('https://chess.test/api/rooms', { method: 'POST', body: stream, duplex: 'half' } as RequestInit);
  await assert.rejects(store.requestBody(request), (error: unknown) => (error as { status?: number }).status === 413);
  assert.equal(cancelled, true);
});
});
