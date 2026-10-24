import test from 'node:test';
import assert from 'node:assert/strict';
import type { RoomReply } from '../lib/multiplayer';
type ApiReply = RoomReply & { error?: string };

// D1's compare-and-swap contract is reproduced here to exercise the HTTP boundary,
// including real token hashing, retries and concurrent requests, without a cloud account.
interface Row { code: string; state: string; version: number; updated_at: number }
const rows = new Map<string, Row>();
let writes = 0;
const fakeDb = {
  prepare(sql: string) {
    let args: unknown[] = [];
    return {
      bind(...values: unknown[]) { args = values; return this; },
      async first() {
        if (sql.startsWith('SELECT COUNT')) { return { n: [...rows.values()].filter(r => r.updated_at >= (args[0] as number)).length }; }
        const row = rows.get(args[0] as string); return row ? { ...row } : null;
      },
      async run() {
        writes++;
        if (sql.startsWith('DELETE')) {
          const [cutoff] = args as [number]; let changes = 0;
          for (const [code, row] of rows) if (row.updated_at < cutoff && changes < 25) { rows.delete(code); changes++; }
          return { meta: { changes } };
        }
        if (sql.startsWith('INSERT')) {
          const [code, state, now] = args as [string, string, number];
          if (rows.has(code)) return { meta: { changes: 0 } };
          rows.set(code, { code, state, version: 1, updated_at: now });
          return { meta: { changes: 1 } };
        }
        const [state, now, code, version] = args as [string, number, string, number];
        const previous = rows.get(code);
        if (!previous || previous.version !== version) return { meta: { changes: 0 } };
        rows.set(code, { code, state, version: version + 1, updated_at: now });
        return { meta: { changes: 1 } };
      },
    };
  },
};
const testEnv: Record<string, unknown> = { DB: fakeDb };
(globalThis as unknown as { __golfTestEnv: unknown }).__golfTestEnv = testEnv;
const { GET, POST, MAX_ROOMS } = await import('../app/api/golf/route');
async function post(body: unknown, token?: string, origin = 'https://golf.test', ip?: string) {
  const result = await POST(new Request('https://golf.test/api/golf', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin, ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(ip ? { 'cf-connecting-ip': ip } : {}) },
    body: JSON.stringify(body),
  }));
  return { status: result.status, data: await result.json() as ApiReply };
}
async function get(code: string, token?: string) {
  const response = await GET(new Request(`https://golf.test/api/golf?code=${code}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} }));
  return { status: response.status, data: await response.json() as ApiReply };
}
test('HTTP credentials stay private, validate sessions and reject cross-origin writes', async () => {
  const create = await post({ action: 'create', name: 'Host', holes: 9 });
  assert.equal(create.status, 200);
  assert.ok(create.data.token);
  assert.match(create.data.token, /^[a-f0-9]{64}$/);
  assert.equal((await get(create.data.room.code)).status, 401);
  assert.equal((await get(create.data.room.code, 'f'.repeat(64))).status, 401);
  const view = await get(create.data.room.code, create.data.token);
  assert.equal(view.status, 200);
  assert(!JSON.stringify(view.data).includes(create.data.token));
  assert(!JSON.stringify(view.data).includes('tokenHash'));
  assert.equal((await post({ action: 'create', name: 'Bad', holes: 9 }, undefined, 'https://evil.test')).status, 403);
  assert.equal((await post({ action: 'join', name: 'Guest', code: 'BAD' })).status, 400);
});
test('concurrent joins preserve both players and concurrent shots count once', async () => {
  const create = await post({ action: 'create', name: 'Host', holes: 9 });
  const { code } = create.data.room;
  const [one, two] = await Promise.all([
    post({ action: 'join', code, name: 'One' }),
    post({ action: 'join', code, name: 'Two' }),
  ]);
  assert.equal(one.status, 200); assert.equal(two.status, 200);
  let view = await get(code, create.data.token);
  assert.equal(view.data.room.players.length, 3);
  assert.equal(view.data.room.version, 3);
  const start = await post({ action: 'start', code }, create.data.token);
  assert.equal(start.status, 200);
  const payload = { action: 'shot', code, angle: Math.PI, power: 0.25, shotId: 'idempotent-shot', strokes: -99, ball: { x: 0, z: -6, sunk: true } };
  const shots = await Promise.all([post(payload, create.data.token), post(payload, create.data.token)]);
  assert(shots.every(s => s.status === 200));
  view = await get(code, create.data.token);
  assert.equal(view.data.room.players[0].strokes, 1);
  assert.equal(view.data.room.version, 5);
  assert.equal(view.data.room.shot?.id, 'idempotent-shot');
  assert.notEqual(view.data.room.players[0].ball.z, -6);
  const guestShot = await post({ action: 'shot', code, angle: 0, power: 0.25, shotId: 'too-early-shot' }, one.data.token);
  assert.equal(guestShot.status, 409);
});

test('Free account: rate-limited joins and creates, and a full server, write nothing', async () => {
  const create = await post({ action: 'create', name: 'Host', holes: 9 });
  const { code } = create.data.room;
  testEnv.CREATE_LIMIT = testEnv.JOIN_LIMIT = { limit: async () => ({ success: false }) };
  const before = writes;
  assert.equal((await post({ action: 'create', name: 'Flood', holes: 9 }, undefined, 'https://golf.test', '203.0.113.7')).status, 429);
  assert.equal((await post({ action: 'join', code, name: 'Flood' }, undefined, 'https://golf.test', '203.0.113.7')).status, 429);
  assert.equal((await post({ action: 'join', code: 'ZZZZ22', name: 'Ghost' })).status, 404);
  assert.equal(writes, before);
  delete testEnv.CREATE_LIMIT; delete testEnv.JOIN_LIMIT;
  for (let i = rows.size; i < MAX_ROOMS; i++) rows.set(`FILL${i}`, { code: `FILL${i}`, state: '{}', version: 1, updated_at: Date.now() });
  const full = writes;
  assert.equal((await post({ action: 'create', name: 'Late', holes: 9 })).status, 503);
  assert.equal(writes, full);
});
