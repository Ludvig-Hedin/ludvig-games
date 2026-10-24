import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createRoomRecord, getRoomRecord, actOnRoom, readRoomBody, RoomError, normalizeRoomCode, MAX_ROOMS, rateLimit } from '../lib/rooms.ts';

function database() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`CREATE TABLE arena_rooms (
    code TEXT PRIMARY KEY, version INTEGER NOT NULL, state TEXT NOT NULL,
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
    last_seen_1 INTEGER NOT NULL DEFAULT 0, last_seen_2 INTEGER NOT NULL DEFAULT 0
  )`);
  return {
    sqlite,
    prepare(sql) {
      let values = [];
      return {
        bind(...args) { values = args; return this; },
        async first() { return sqlite.prepare(sql).get(...values) || null; },
        async run() { const result = sqlite.prepare(sql).run(...values); return {success: true, meta: {changes: Number(result.changes)}}; },
      };
    },
  };
}

async function pair(variant = 'classic', bestOf = 1) {
  const db = database();
  const host = await createRoomRecord(db, {name: 'Coral', variant, bestOf});
  const guest = await actOnRoom(db, host.code, undefined, {action: 'join', name: 'Cobalt'});
  return {db,host,guest,room:guest.room};
}

async function move(context, stack) {
  const current = await getRoomRecord(context.db, context.host.code);
  const token = current.room.game.turn === 1 ? context.host.token : context.guest.token;
  return actOnRoom(context.db, context.host.code, token, {action: 'move', stack, version: current.room.version});
}

async function play(context, stacks) {
  let value;
  for (const stack of stacks) value = await move(context, stack);
  return value;
}

async function readyBoth(context) {
  let state = await getRoomRecord(context.db, context.host.code);
  state = await actOnRoom(context.db, context.host.code, context.host.token, {action: 'ready', version: state.room.version});
  state = await actOnRoom(context.db, context.host.code, context.guest.token, {action: 'ready', version: state.room.version});
  return state;
}

test('create/join/public state protects player capabilities', async () => {
  const {db,host,guest} = await pair('3d');
  assert.match(host.code, /^[A-HJ-NP-Z2-9]{6}$/);
  assert.equal(host.token.length, 48);
  assert.equal(host.seat, 1);
  assert.equal(host.room.status, 'waiting');
  assert.equal(guest.seat, 2);
  assert.equal(guest.room.status, 'playing');
  const publicState = await getRoomRecord(db, host.code.toLowerCase());
  assert.equal(publicState.seat, 0);
  assert.equal(publicState.token, undefined);
  assert.equal(publicState.room.game.board.length, 64);
  assert.equal(JSON.stringify(publicState).includes('tokenHash'), false);
  assert.equal(JSON.stringify(publicState).includes(host.token), false);
  const stored = db.sqlite.prepare('SELECT state FROM arena_rooms WHERE code = ?').get(host.code).state;
  assert.equal(stored.includes(host.token), false);
  assert.equal(stored.includes(guest.token), false);
  assert.deepEqual(publicState.room.players.map(p => p.name), ['Coral', 'Cobalt']);
});

test('invalid input and identities cannot mutate rooms', async () => {
  const context = await pair();
  const {db,host,guest,room} = context;
  await assert.rejects(() => createRoomRecord(db, {name:'',variant:'3d',bestOf:1}), e => e.status === 400);
  await assert.rejects(() => createRoomRecord(db, {name:'x',variant:'2d',bestOf:1}), e => e.status === 400);
  await assert.rejects(() => createRoomRecord(db, {name:'x',variant:'3d',bestOf:9}), e => e.status === 400);
  await assert.rejects(() => getRoomRecord(db, host.code, 'invalid'), e => e.status === 401);
  await assert.rejects(() => getRoomRecord(db, host.code, 'a'.repeat(48)), e => e.status === 403);
  await assert.rejects(() => actOnRoom(db, host.code, guest.token, {action:'move',stack:0,version:room.version}), e => e.status === 403);
  await assert.rejects(() => actOnRoom(db, host.code, undefined, {action:'move',stack:0,version:room.version}), e => e.status === 403);
  await assert.rejects(() => actOnRoom(db, host.code, host.token, {action:'move',stack:99,version:room.version}), e => e.status === 400);
  assert.equal((await getRoomRecord(db,host.code)).room.game.moves.length,0);
});

test('simultaneous moves at one revision apply exactly once', async () => {
  const {db,host,room} = await pair();
  const results = await Promise.allSettled([
    actOnRoom(db, host.code, host.token, {action:'move',stack:0,version:room.version}),
    actOnRoom(db, host.code, host.token, {action:'move',stack:2,version:room.version}),
  ]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  const rejected = results.find(r => r.status === 'rejected');
  assert.equal(rejected.reason.status,409);
  assert.equal(rejected.reason.room.game.moves.length,1);
  const authoritative = await getRoomRecord(db,host.code,host.token);
  assert.equal(authoritative.room.game.moves.length,1);
  assert.equal(authoritative.room.game.turn,2);
});

test('two concurrent joins cannot steal the same seat', async () => {
  const db = database();
  const host = await createRoomRecord(db,{name:'Host',variant:'3d',bestOf:3});
  const result = await Promise.allSettled([
    actOnRoom(db,host.code,undefined,{action:'join',name:'Alice'}),
    actOnRoom(db,host.code,undefined,{action:'join',name:'Bob'}),
  ]);
  assert.equal(result.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(result.find(r=>r.status==='rejected').reason.status,409);
  const guest = result.find(r=>r.status==='fulfilled').value;
  assert.equal((await getRoomRecord(db,host.code,guest.token)).seat,2);
});

test('spectators receive state but cannot move or rematch', async () => {
  const {db,host,room} = await pair();
  const watcher = await actOnRoom(db,host.code,undefined,{action:'join',spectate:true});
  assert.equal(watcher.seat,0);
  assert.equal(watcher.token,undefined);
  await assert.rejects(()=>actOnRoom(db,host.code,undefined,{action:'ready',version:room.version}),e=>e.status===403);
  await assert.rejects(()=>actOnRoom(db,host.code,undefined,{action:'join',name:'Third'}),e=>e.status===409);
});

test('full stacks and duplicate/stale requests are rejected without changing game', async () => {
  const c = await pair('3d');
  await play(c,[0,0,0,0]);
  const before = await getRoomRecord(c.db,c.host.code);
  await assert.rejects(()=>actOnRoom(c.db,c.host.code,c.host.token,{action:'move',stack:0,version:before.room.version}),e=>e.status===400);
  await assert.rejects(()=>actOnRoom(c.db,c.host.code,c.host.token,{action:'move',stack:1,version:1}),e=>e.status===409 && e.room.version===before.room.version);
  assert.deepEqual((await getRoomRecord(c.db,c.host.code)).room.game,before.room.game);
});

test('win, score, two-person rematch and alternating starter are authoritative', async () => {
  const c = await pair();
  const won = await play(c,[0,1,0,1,0,1,0]);
  assert.equal(won.room.game.winner,1);
  assert.deepEqual(won.room.scores,[1,0]);
  assert.equal(won.room.matchWinner,1);
  assert.equal(won.room.status,'finished');
  await assert.rejects(()=>move(c,2),e=>e.status===409);
  const hostReady = await actOnRoom(c.db,c.host.code,c.host.token,{action:'ready',version:won.room.version});
  assert.equal(hostReady.room.status,'finished');
  assert.deepEqual(hostReady.room.ready,[true,false]);
  const duplicate = await actOnRoom(c.db,c.host.code,c.host.token,{action:'ready',version:hostReady.room.version});
  assert.equal(duplicate.room.version,hostReady.room.version);
  const rematch = await actOnRoom(c.db,c.host.code,c.guest.token,{action:'ready',version:hostReady.room.version});
  assert.equal(rematch.room.status,'playing');
  assert.equal(rematch.room.game.startingPlayer,2);
  assert.equal(rematch.room.game.turn,2);
  assert.equal(rematch.room.game.moves.length,0);
  assert.deepEqual(rematch.room.scores,[0,0]);
  assert.equal(rematch.room.matchWinner,null);
});

test('best of three carries scores and ends only at two victories', async () => {
  const c = await pair('classic',3);
  const first = await play(c,[0,1,0,1,0,1,0]);
  assert.equal(first.room.matchWinner,null);
  const nextRound = await readyBoth(c);
  assert.equal(nextRound.room.round,2);
  assert.deepEqual(nextRound.room.scores,[1,0]);
  const second = await play(c,[1,0,1,0,1,0,2,0]);
  assert.equal(second.room.game.winner,1);
  assert.equal(second.room.matchWinner,1);
  assert.deepEqual(second.room.scores,[2,0]);
  const reset = await readyBoth(c);
  assert.equal(reset.room.round,1);
  assert.deepEqual(reset.room.scores,[0,0]);
});

test('disconnect and reconnection preserve board and do not advance revisions', async () => {
  const c = await pair('3d');
  await move(c,5);
  const before = await getRoomRecord(c.db,c.host.code,c.host.token);
  const left = await actOnRoom(c.db,c.host.code,c.host.token,{action:'leave'});
  assert.equal(left.room.players[0].connected,false);
  assert.equal(left.room.version,before.room.version);
  const resumed = await getRoomRecord(c.db,c.host.code,c.host.token);
  assert.equal(resumed.room.players[0].connected,true);
  assert.equal(resumed.seat,1);
  assert.equal(resumed.room.version,before.room.version);
  assert.deepEqual(resumed.room.game,before.room.game);
});

test('expired rooms cannot be used and request boundaries are enforced', async () => {
  const c = await pair();
  c.db.sqlite.prepare('UPDATE arena_rooms SET expires_at = ? WHERE code = ?').run(Date.now()-1,c.host.code);
  await assert.rejects(()=>getRoomRecord(c.db,c.host.code),e=>e.status===404);
  assert.throws(()=>normalizeRoomCode('../../x'),RoomError);
  await assert.rejects(()=>readRoomBody(new Request('https://arena.test/api/rooms',{method:'POST',body:'[]'})),e=>e.status===400);
  await assert.rejects(()=>readRoomBody(new Request('https://arena.test/api/rooms',{method:'POST',headers:{Origin:'https://evil.test'},body:'{}'})),e=>e.status===403);
  await assert.rejects(()=>readRoomBody(new Request('https://arena.test/api/rooms',{method:'POST',body:'x'.repeat(5000)})),e=>e.status===413);
});

test('client resolves simultaneous rematch votes without requiring another click', async () => {
  const {actRoom: clientActRoom} = await import('../lib/network.ts');
  const c = await pair();
  const won = await play(c,[0,1,0,1,0,1,0]);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (path, options) => {
    try {
      const token = options.headers.Authorization?.slice(7);
      const result = options.method === 'POST'
        ? await actOnRoom(c.db,c.host.code,token,JSON.parse(options.body))
        : await getRoomRecord(c.db,c.host.code,token);
      return Response.json(result);
    } catch (error) {
      return Response.json({error:error.message,room:error.room},{status:error.status||500});
    }
  };
  try {
    const result = await Promise.all([
      clientActRoom(c.host.code,c.host.token,'ready',{version:won.room.version}),
      clientActRoom(c.host.code,c.guest.token,'ready',{version:won.room.version}),
    ]);
    assert.equal(result.length,2);
    const current = await getRoomRecord(c.db,c.host.code);
    assert.equal(current.room.status,'playing');
    assert.equal(current.room.game.startingPlayer,2);
    assert.deepEqual(current.room.scores,[0,0]);
  } finally { globalThis.fetch = originalFetch; }
});

test('Free account: rate-limited, malformed and capped requests write nothing to D1', async () => {
  const c = await pair();
  const writes = () => c.db.sqlite.prepare('SELECT total_changes() AS n').get().n;
  const before = writes();
  const edge = new Request('https://arena.test/api/rooms', {headers: {'cf-connecting-ip': '203.0.113.8'}});
  await assert.rejects(() => rateLimit(edge, {limit: async () => ({success: false})}), e => e instanceof RoomError && e.status === 429);
  await assert.doesNotReject(() => rateLimit(edge, {limit: async () => ({success: true})}));
  await assert.rejects(() => getRoomRecord(c.db, c.host.code, 'bad'), e => e instanceof RoomError && e.status === 401);
  await assert.rejects(() => actOnRoom(c.db, 'ZZZZ22', undefined, {action: 'join', name: 'Ghost'}), e => e instanceof RoomError && e.status === 404);
  assert.equal(writes(), before);
  const insert = c.db.sqlite.prepare("INSERT INTO arena_rooms (code, version, state, created_at, updated_at, expires_at) VALUES (?, 1, '{}', 0, 0, ?)");
  for (let i = 1; i < MAX_ROOMS; i++) insert.run(`F${i}`, Date.now() + 60_000);
  const full = writes();
  await assert.rejects(() => createRoomRecord(c.db, {name: 'Late', variant: 'classic', bestOf: 1}), e => e instanceof RoomError && e.status === 503);
  assert.equal(writes(), full);
});
