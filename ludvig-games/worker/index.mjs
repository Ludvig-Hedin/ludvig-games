/** Games hub API (Worker `ludvig-games-api`, wrangler.api.jsonc): leaderboards at /api/* and room signaling at
    /mp/ws. The start page is static files on another account (wrangler.static.jsonc), so this Worker has no assets
    and answers only the site's origin (docs/free-account-plan.md, "Hub split"). Contract: docs/platform-api.md.
    Online play is device to device over WebRTC with public STUN only, no TURN (docs/p2p-online.md); rooms here only
    pair players and relay signaling. Cost rules: a refused request writes nothing (limits use rate-limit bindings,
    not database rows), ranks read a bounded number of rows, rooms save at most every 10 s, and hard caps on rooms,
    peers and frames mean no client can run up cost. Still runs behind `run_worker_first` with an ASSETS binding
    (the old combined wrangler.jsonc), where boards.json is read from the assets instead of the bundled copy. */
import { DurableObject } from 'cloudflare:workers';
import BUNDLED_BOARDS from './boards.gen.mjs';
import { allowedOrigin, cleanName, json, preflight, publicId, sha256hex, underLimit, validPlayerId } from './util.mjs';
import { PERIODS, boardConfig, rankOf, records, rename, standing, submit, top, validateSubmission } from './scores.mjs';
import { CLOSE, GAME_ID, PING, PONG, Registry, Room, clampMax, normalizeCode } from './rooms.mjs';

const BOARDS_TTL = 60e3;
const TOP_TTL = 15e3;
const RANK_TTL = 30e3;
const MAX_BODY = 2048;
export const SAVE_MS = 10e3; // a room writes its state to storage at most this often

const random32 = () => crypto.getRandomValues(new Uint32Array(1))[0];
const random = () => random32() / 2 ** 32;

let boardsCache = { at: 0, value: null };
const topCache = new Map();
const rankCache = new Map();

/** Board config written by build.py: bundled into this Worker (worker/boards.gen.mjs), or read from
    public/assets/boards.json through the ASSETS binding when the Worker also serves the static files. */
async function loadBoards(env, now) {
  if (!env.ASSETS) return BUNDLED_BOARDS;
  if (boardsCache.value && now - boardsCache.at < BOARDS_TTL) return boardsCache.value;
  const response = await env.ASSETS.fetch(new Request('https://assets.local/assets/boards.json'));
  if (!response.ok) throw new Error(`boards.json ${response.status}`);
  boardsCache = { at: now, value: await response.json() };
  return boardsCache.value;
}

async function ipKey(request) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  return (await sha256hex(`ludvig-ip:${ip}`)).slice(0, 24);
}

/** JSON body as application/json or text/plain (what the client sends: a CORS simple request needs no preflight).
    Forms and other types are refused. */
async function readJson(request) {
  const type = (request.headers.get('Content-Type') || '').toLowerCase();
  if (!type.startsWith('application/json') && !type.startsWith('text/plain')) return { error: 'json-required', status: 415 };
  if (Number(request.headers.get('Content-Length') || 0) > MAX_BODY) return { error: 'too-big', status: 413 };
  const text = await request.text();
  if (text.length > MAX_BODY) return { error: 'too-big', status: 413 };
  try { return { body: JSON.parse(text) }; } catch { return { error: 'bad-request', status: 400 }; }
}

const fail = (error, status, origin = null) => json({ ok: false, error }, status, origin);

async function withPublicIds(entries) {
  return Promise.all(entries.map(async entry => ({ ...entry, player: await publicId(entry.player) })));
}

/** Ranks are cached per board, period and score for a short while, so repeated "your rank" lookups cost nothing. */
async function cachedRank(db, game, order, period, score, now) {
  const key = `${game}|${period}|${score}`;
  const hit = rankCache.get(key);
  if (hit && now - hit.at < RANK_TTL) return hit.rank;
  const rank = await rankOf(db, game, order, period, score, now);
  rankCache.set(key, { at: now, rank });
  if (rankCache.size > 2000) rankCache.delete(rankCache.keys().next().value);
  return rank;
}

function forgetBoard(game) {
  for (const cache of [topCache, rankCache]) for (const key of cache.keys()) if (key.startsWith(`${game}|`)) cache.delete(key);
}

async function postScore(request, env, now, origin) {
  const { body, error, status } = await readJson(request);
  if (error) return fail(error, status, origin);
  const check = validateSubmission(body, await loadBoards(env, now));
  if (check.error) return fail(check.error, check.status, origin);
  const { game, player } = check.value;
  // Fail closed: a missing limiter or a database error throws and the request is refused with 503.
  if (!await underLimit(env, 'RL_SCORE_IP', await ipKey(request))) return fail('rate-limited', 429, origin);
  if (!await underLimit(env, 'RL_SCORE_PLAYER', `${game}:${player}`)) return fail('rate-limited', 429, origin);
  forgetBoard(game);
  return json(await submit(env.DB, check.value, now, cachedRank), 200, origin);
}

async function getScores(env, url, now, origin) {
  const game = url.searchParams.get('game');
  const period = url.searchParams.get('period') || 'all';
  const player = url.searchParams.get('player');
  const limit = Math.min(50, Math.max(1, Math.round(Number(url.searchParams.get('limit')) || 10)));
  const board = boardConfig(await loadBoards(env, now), game);
  if (!board) return fail('unknown-game', 404, origin);
  if (!Object.hasOwn(PERIODS, period)) return fail('bad-period', 400, origin);
  const key = `${game}|${period}|${limit}`;
  let cached = topCache.get(key);
  if (!cached || now - cached.at > TOP_TTL) {
    cached = { at: now, entries: await withPublicIds(await top(env.DB, game, board.order, period, limit, now)) };
    topCache.set(key, cached);
    if (topCache.size > 500) topCache.delete(topCache.keys().next().value);
  }
  let you = null;
  if (validPlayerId(player)) {
    const mine = await standing(env.DB, game, board.order, period, player, now, cachedRank);
    if (mine) you = { ...mine, player: await publicId(player) };
  }
  return json({ entries: cached.entries, you }, 200, origin);
}

async function getRecords(env, url, now, origin) {
  const player = url.searchParams.get('player');
  if (!validPlayerId(player)) return fail('bad-player', 400, origin);
  return json({ records: await records(env.DB, await loadBoards(env, now), player, now), player: await publicId(player) }, 200, origin);
}

async function postName(request, env, origin) {
  const { body, error, status } = await readJson(request);
  if (error) return fail(error, status, origin);
  if (!validPlayerId(body?.player)) return fail('bad-player', 400, origin);
  const name = cleanName(body.name);
  if (!name) return fail('bad-name', 400, origin);
  if (!await underLimit(env, 'RL_NAME', `ip:${await ipKey(request)}`)) return fail('rate-limited', 429, origin);
  if (!await underLimit(env, 'RL_NAME', `p:${body.player}`)) return fail('rate-limited', 429, origin);
  await rename(env.DB, body.player, name);
  topCache.clear();
  return json({ ok: true, name }, 200, origin);
}

/** One lobby object for the whole site (it keeps each game's rooms apart), so it can cap active rooms globally.
    The returned helper binds the game, so callers read like a per-game lobby. */
function lobbyFor(env, game) {
  const stub = env.MP_LOBBY.get(env.MP_LOBBY.idFromName('site'));
  return {
    reserve: options => stub.reserve(game, options),
    quick: options => stub.quick(game, options),
    report: (code, info) => stub.report(game, code, info),
    reject: (code, reason) => stub.reject(game, code, reason),
    list: () => stub.list(game),
  };
}

async function listRooms(env, url, origin) {
  const game = url.searchParams.get('game');
  if (!GAME_ID.test(game || '')) return fail('bad-game', 400, origin);
  return json({ rooms: await lobbyFor(env, game).list() }, 200, origin);
}

/** Accept the socket only to explain why the room cannot be joined; browsers cannot read handshake errors. */
function socketError(code, closeCode) {
  const [client, server] = Object.values(new WebSocketPair());
  server.accept();
  server.send(JSON.stringify({ t: 'error', code }));
  server.close(closeCode, code);
  return new Response(null, { status: 101, webSocket: client });
}

const CLOSE_FOR = { 'not-found': CLOSE.notFound, full: CLOSE.full, 'rate-limited': CLOSE.rateLimited, 'bad-request': CLOSE.badRequest };

/** Room socket. The Origin was checked before this runs, so a foreign page never reaches a Durable Object. */
async function connect(request, env, url, origin) {
  if ((request.headers.get('Upgrade') || '').toLowerCase() !== 'websocket') return fail('websocket-required', 426, origin);
  const q = url.searchParams;
  const game = q.get('game') || '';
  const player = q.get('player');
  if (!GAME_ID.test(game) || !validPlayerId(player)) return socketError('bad-request', CLOSE.badRequest);
  const name = cleanName(q.get('name')) ?? 'Player';
  const max = clampMax(q.get('max'));
  const ip = await ipKey(request);
  if (!await underLimit(env, 'RL_SOCKET', ip)) return socketError('rate-limited', CLOSE.rateLimited);
  const lobby = lobbyFor(env, game);
  const canCreate = () => underLimit(env, 'RL_ROOM', ip);

  const forward = async (code, init) => {
    const peer = (await sha256hex(`peer:${player}:${game}:${code}`)).slice(0, 10);
    const header = encodeURIComponent(JSON.stringify({ game, code, peer, name, init }));
    const stub = env.MP_ROOM.get(env.MP_ROOM.idFromName(`${game}:${code}`));
    const response = await stub.fetch(new Request('https://room.local/connect', { headers: { Upgrade: 'websocket', 'X-Mp': header } }));
    if (response.status === 101) return { response };
    const { error } = await response.json().catch(() => ({ error: 'unavailable' }));
    return { error: error || 'unavailable' };
  };
  const finish = ({ response, error }) => response || socketError(error, CLOSE_FOR[error] ?? CLOSE.unavailable);

  if (q.has('room')) {
    const code = normalizeCode(q.get('room'));
    return code ? finish(await forward(code, null)) : socketError('not-found', CLOSE.notFound);
  }
  if (q.get('create') === '1') {
    if (!await canCreate()) return socketError('rate-limited', CLOSE.rateLimited);
    const visible = q.get('visible') === '1';
    for (let attempt = 0; attempt < 3; attempt++) {
      const code = await lobby.reserve({ max, public: visible });
      if (!code) break;
      const result = await forward(code, { max, public: visible, seed: random32() });
      if (result.error !== 'taken') return finish(result);
    }
    return socketError('unavailable', CLOSE.unavailable);
  }
  if (q.get('quick') === '1') {
    for (let attempt = 0; attempt < 3; attempt++) {
      let match = await lobby.quick({ max, allowCreate: false });
      if (match.error) {
        if (!await canCreate()) return socketError('rate-limited', CLOSE.rateLimited);
        match = await lobby.quick({ max, allowCreate: true });
        if (match.error) return socketError(match.error, CLOSE_FOR[match.error] ?? CLOSE.unavailable);
      }
      const result = await forward(match.code, match.created ? { max, public: true, seed: random32() } : null);
      if (!result.error) return result.response;
      await lobby.reject(match.code, result.error === 'full' ? 'full' : 'gone');
    }
    return socketError('unavailable', CLOSE.unavailable);
  }
  return socketError('bad-request', CLOSE.badRequest);
}

/** Routes for an allowed origin. Unknown paths (for example /api/health) touch nothing and answer 404. */
async function route(request, env, url, now, origin) {
  const { pathname } = url;
  const method = request.method;
  if (pathname === '/api/scores') {
    if (method === 'POST') return postScore(request, env, now, origin);
    if (method === 'GET') return getScores(env, url, now, origin);
    return fail('method-not-allowed', 405, origin);
  }
  if (pathname === '/api/me') return method === 'GET' ? getRecords(env, url, now, origin) : fail('method-not-allowed', 405, origin);
  if (pathname === '/api/name') return method === 'POST' ? postName(request, env, origin) : fail('method-not-allowed', 405, origin);
  if (pathname === '/api/mp/list') return method === 'GET' ? listRooms(env, url, origin) : fail('method-not-allowed', 405, origin);
  if (pathname === '/mp/ws') return connect(request, env, url, origin);
  return fail('not-found', 404, origin);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const { pathname } = url;
    if (!pathname.startsWith('/api/') && !pathname.startsWith('/mp/')) return env.ASSETS ? env.ASSETS.fetch(request) : fail('not-found', 404);
    // Other origins are refused before any binding is touched: no database, rate limiter or Durable Object.
    const origin = allowedOrigin(request, env);
    if (!origin) return fail('forbidden', 403);
    if (request.method === 'OPTIONS') return preflight(origin);
    try {
      return await route(request, env, url, Date.now(), origin);
    } catch (error) {
      console.error('platform error', pathname, error?.message);
      return fail('unavailable', 503, origin);
    }
  },
};

/** One room per game:code: membership, host, meta and WebRTC signaling. Uses the WebSocket hibernation API, so an
    idle room costs nothing; pings are answered by the runtime without waking it. Room state lives in storage and
    each socket's attachment ({ id }), so the room wakes with the same peers. State is written at most every
    SAVE_MS (a pending save keeps the object awake, so it is never lost to hibernation), and meta changes past the
    room's budget are relayed but neither saved nor reported (rooms.mjs ROOM.metaBudget). No intervals and no
    heartbeat: the only alarm is the grace sweep for a dropped peer (it stops once nobody is waiting), and the only
    timers are the report debounce and the pending save. */
export class MpRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.room = new Room();
    this.game = null;
    this.code = null;
    this.reportTimer = null;
    this.saveTimer = null;
    this.savedAt = 0;
    this.stored = false;
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(PING, PONG));
    ctx.blockConcurrencyWhile(async () => {
      const saved = await ctx.storage.get('room');
      if (!saved) return;
      this.stored = true;
      this.game = saved.game;
      this.code = saved.code;
      const sockets = new Map();
      for (const ws of ctx.getWebSockets()) {
        const tag = ws.deserializeAttachment();
        if (tag?.id && (!sockets.has(tag.id) || sockets.get(tag.id).at < tag.at)) sockets.set(tag.id, { ws, at: tag.at });
      }
      this.room.restore(saved.room, id => sockets.get(id)?.ws, Date.now());
    });
  }

  async fetch(request) {
    let info;
    try { info = JSON.parse(decodeURIComponent(request.headers.get('X-Mp') || '')); } catch { return fail('bad-request', 400); }
    const { game, code, peer, name, init } = info;
    this.game = game;
    this.code = code;
    if (init) {
      if (this.room.open) return fail('taken', 409);
      this.room.init({ code, max: init.max, public: init.public, seed: init.seed });
    } else if (!this.room.open) {
      return fail('not-found', 404);
    }
    if (!this.room.peers.has(peer) && this.room.peers.size >= this.room.max) return fail('full', 409);
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ id: peer, at: Date.now() });
    const result = this.room.join({ id: peer, name, socket: server }, Date.now());
    if (result.error) {
      try { server.close(CLOSE_FOR[result.error] ?? CLOSE.unavailable, result.error); } catch { /* Already closed. */ }
      return fail(result.error, result.error === 'not-found' ? 404 : 409);
    }
    this.after({ changed: true, empty: false });
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(ws, message) {
    const id = ws.deserializeAttachment()?.id;
    const result = this.room.handle(id, ws, typeof message === 'string' ? message : '', Date.now());
    if (result.abuse) {
      try { ws.close(CLOSE.rateLimited, 'rate-limited'); } catch { /* Already closed. */ }
      this.after(this.room.leave(id, ws));
      return;
    }
    this.after(result);
  }

  webSocketClose(ws, code) { this.closed(ws, code); }
  webSocketError(ws) { this.closed(ws, 1006); }

  closed(ws, code) {
    const id = ws.deserializeAttachment()?.id;
    try { ws.close(1000, 'bye'); } catch { /* Already closed. */ }
    if (code === 1000) this.after(this.room.leave(id, ws));
    else if (this.room.drop(id, ws, Date.now())) { this.save(); this.schedule(); }
  }

  async alarm() {
    this.alarmAt = null; // A fired alarm is gone.
    this.after(this.room.sweep(Date.now()));
    this.schedule();
  }

  /** The alarm exists only while a dropped peer's grace period runs; then it is cleared. Storage is touched only
      when the wanted alarm changes (alarmAt is undefined until known). */
  schedule() {
    const next = this.room.nextSweep();
    if (next === Infinity) this.clearAlarm();
    else if (next !== this.alarmAt) { this.alarmAt = next; this.ctx.storage.setAlarm(Math.max(next, Date.now() + 50)); }
  }

  clearAlarm() {
    if (this.alarmAt === null) return;
    this.alarmAt = null;
    this.ctx.storage.deleteAlarm();
  }

  /** Write the room now if the last write was SAVE_MS ago, else once that time is up. An emptied room is
      forgotten at once. */
  save() {
    if (!this.room.open) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
      if (this.stored) this.ctx.storage.delete('room');
      this.stored = false;
      return;
    }
    if (this.saveTimer) return;
    const wait = this.savedAt + SAVE_MS - Date.now();
    if (wait <= 0) { this.write(); return; }
    this.saveTimer = setTimeout(() => { this.saveTimer = null; this.write(); }, wait);
  }

  write() {
    const room = this.room.snapshot();
    if (!room) return;
    this.ctx.storage.put('room', { game: this.game, code: this.code, room });
    this.stored = true;
    this.savedAt = Date.now();
  }

  after({ changed, empty }) {
    if (!changed && !empty) return;
    this.save();
    if (empty) {
      clearTimeout(this.reportTimer);
      this.reportTimer = null;
      this.report();
      this.clearAlarm();
      return;
    }
    if (!this.reportTimer) this.reportTimer = setTimeout(() => { this.reportTimer = null; this.report(); }, 1000);
    this.schedule();
  }

  /** Tell the lobby about a change (players, meta, empty). Private rooms report too, so they count toward the cap. */
  report() {
    if (!this.game || !this.code) return;
    const info = this.room.open ? this.room.info() : { players: 0 };
    lobbyFor(this.env, this.game).report(this.code, info).catch(() => {});
  }
}

/** Quick match, public room lists and the site-wide room cap for every game (one instance, named 'site').
    Refreshed by room reports and kept in storage, so an evicted lobby wakes up with the same rooms. */
export class MpLobby extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.registry = new Registry();
    this.savedText = '{}';
    ctx.blockConcurrencyWhile(async () => {
      this.registry.restore(await ctx.storage.get('games'));
      this.savedText = JSON.stringify(this.registry.snapshot());
    });
  }

  /** Write only when the rooms actually changed. Refused requests (site full, nothing to join) write nothing. */
  save() {
    const snapshot = this.registry.snapshot();
    const text = JSON.stringify(snapshot);
    if (text === this.savedText) return;
    this.savedText = text;
    this.ctx.storage.put('games', snapshot);
  }
  reserve(game, options) { const code = this.registry.reserve(game, options, Date.now(), random); if (code) this.save(); return code; }
  quick(game, options) { const match = this.registry.quick(game, options, Date.now(), random); if (!match.error) this.save(); return match; }
  report(game, code, info) { this.registry.report(game, code, info, Date.now()); this.save(); }
  reject(game, code, reason) { this.registry.reject(game, code, reason, Date.now()); this.save(); }
  list(game) { return this.registry.list(game, Date.now()); }
}
