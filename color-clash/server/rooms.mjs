/**
 * Color Clash's authoritative room service.
 * Every stored mutation uses a D1 compare-and-swap; no worker-local room state.
 * Client and bot views are produced exclusively by the rules engine's redactor.
 */
import { createGame, transition, viewFor, chooseBotAction } from '../core/game.mjs';

const DAY = 24 * 60 * 60 * 1000;
const BOT_DELAY = 900;
// A poll writes "last seen" at most this often (Workers Free write budget). Presence lasts 20 s.
const HEARTBEAT_INTERVAL = 12_000;
const CONNECTED_WINDOW = 20_000;
const DIFFICULTIES = new Set(['easy', 'medium', 'hard', 'expert']);
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_BODY_BYTES = 8_192;
const MAX_CAS_ATTEMPTS = 8;
// Global cap on live rooms, so a flood cannot use up the free D1 write budget.
export const MAX_ROOMS = 300;
const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store, private, max-age=0',
  Pragma: 'no-cache',
  'X-Content-Type-Options': 'nosniff',
};

class RoomError extends Error {
  constructor(message, status = 400, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: JSON_HEADERS });
}

function ensure(condition, message, status = 400, extra) {
  if (!condition) throw new RoomError(message, status, extra);
}

function randomHex(bytes = 32) {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), n => n.toString(16).padStart(2, '0')).join('');
}

function randomCode() {
  // Rejection sampling keeps codes unbiased if the alphabet is changed later.
  let code = '';
  const limit = Math.floor(256 / CODE_ALPHABET.length) * CODE_ALPHABET.length;
  while (code.length < 6) {
    const bytes = crypto.getRandomValues(new Uint8Array(12));
    for (const n of bytes) {
      if (n < limit) code += CODE_ALPHABET[n % CODE_ALPHABET.length];
      if (code.length === 6) break;
    }
  }
  return code;
}

async function tokenHash(token) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(bytes), n => n.toString(16).padStart(2, '0')).join('');
}

function cleanName(value) {
  ensure(typeof value === 'string', 'Enter a player name.');
  const name = value.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/gu, '').replace(/\s+/gu, ' ').trim();
  ensure(name.length > 0 && Array.from(name).length <= 20, 'Use a name with 1–20 characters.');
  return name;
}

function cleanAvatar(value) {
  if (value === undefined) return 0;
  ensure(Number.isInteger(value) && value >= 0 && value <= 15, 'Choose a valid avatar.');
  return value;
}

function cleanDifficulty(value, fallback = 'medium') {
  if (value === undefined) return fallback;
  ensure(DIFFICULTIES.has(value), 'Choose Easy, Medium, Hard, or Expert.');
  return value;
}

function cleanOptions(input) {
  if (input === undefined) input = {};
  ensure(input && typeof input === 'object' && !Array.isArray(input), 'Invalid house rules.');
  const result = {};
  for (const key of ['stacking', 'jumpIn', 'sevenZero', 'quickPlay']) {
    ensure(input[key] === undefined || typeof input[key] === 'boolean', 'House rules must be on or off.');
    result[key] = input[key] === true;
  }
  return result;
}

function cleanAction(input) {
  ensure(input && typeof input === 'object' && !Array.isArray(input), 'Choose an action.');
  ensure(['play', 'draw', 'pass', 'call', 'catch'].includes(input.type), 'Unknown action.');
  const action = { type: input.type };
  if (input.type === 'play') {
    ensure(typeof input.cardId === 'string' && input.cardId.length > 0 && input.cardId.length <= 100, 'Choose a card from your hand.');
    action.cardId = input.cardId;
    if (input.color !== undefined) {
      ensure(['red', 'yellow', 'green', 'blue'].includes(input.color), 'Choose a valid color.');
      action.color = input.color;
    }
    if (input.call !== undefined) {
      ensure(typeof input.call === 'boolean', 'Invalid final-card call.');
      action.call = input.call;
    }
  }
  if (input.type === 'play' || input.type === 'catch') {
    if (input.targetId !== undefined) {
      ensure(typeof input.targetId === 'string' && input.targetId.length > 0 && input.targetId.length <= 100, 'Choose a player.');
      action.targetId = input.targetId;
    }
    if (input.type === 'catch') ensure(action.targetId, 'Choose a player to catch.');
  }
  return action;
}

async function readBody(request) {
  const length = Number(request.headers.get('Content-Length') || 0);
  ensure(Number.isFinite(length) && length <= MAX_BODY_BYTES, 'Request too large.', 413);
  const type = request.headers.get('Content-Type') || '';
  ensure(type.toLowerCase().includes('application/json'), 'Send JSON data.', 415);
  // Consume incrementally so an untrusted body cannot allocate unbounded memory.
  const reader = request.body?.getReader();
  if (!reader) return {};
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new RoomError('Request too large.', 413);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  let body;
  try { body = JSON.parse(new TextDecoder().decode(bytes) || '{}'); }
  catch { throw new RoomError('Invalid JSON.'); }
  ensure(body && typeof body === 'object' && !Array.isArray(body), 'Send a JSON object.');
  return body;
}

async function authHash(request) {
  const match = /^Bearer ([a-f0-9]{64})$/i.exec(request.headers.get('Authorization') || '');
  ensure(match, 'Reconnect with the browser that joined this room.', 401);
  return tokenHash(match[1]);
}

function authenticate(room, hash) {
  const player = room.players.find(p => !p.bot && p.tokenHash === hash);
  ensure(player, 'Your seat is no longer available. Rejoin the room.', 401);
  return player;
}

function publicRoom(room, playerId, now) {
  const game = room.game ? viewFor(room.game, playerId) : null;
  // Room metadata is the authority for explicit leave/replacement and presence.
  if (game) game.players = game.players.map(player => {
    const member = room.players.find(p => p.id === player.id);
    return {
      ...player, bot: !!member?.bot, difficulty: member?.difficulty || 'medium',
      connected: !!member && (member.bot || now - member.lastSeen <= CONNECTED_WINDOW),
    };
  });
  return {
    code: room.code,
    hostId: room.hostId,
    phase: room.game ? room.game.phase : 'lobby',
    players: room.players.map(p => ({
      id: p.id, name: p.name, avatar: p.avatar, bot: p.bot,
      difficulty: p.difficulty,
      connected: p.bot || now - p.lastSeen <= CONNECTED_WINDOW,
    })),
    options: room.options,
    difficulty: room.difficulty,
    version: room.version,
    game,
  };
}

async function fetchStored(db, code, now) {
  const row = await db.prepare('SELECT state, version, expires_at FROM rooms WHERE code = ?').bind(code).first();
  ensure(row && row.expires_at > now, 'Room not found or expired. Create a new room.', 404);
  let room;
  try { room = JSON.parse(row.state); }
  catch { throw new RoomError('This room could not be restored.', 500); }
  return { room, revision: row.version };
}

async function saveStored(db, room, revision, now) {
  const result = await db.prepare('UPDATE rooms SET state = ?, version = ?, updated_at = ?, expires_at = ? WHERE code = ? AND version = ?')
    .bind(JSON.stringify(room), revision + 1, now, now + DAY, room.code, revision).run();
  return result.meta?.changes === 1;
}

function scheduleBot(room, now) {
  if (!room.game || room.game.phase === 'finished') { room.botDueAt = null; return; }
  const currentId = viewFor(room.game, room.hostId).currentPlayerId;
  room.botDueAt = room.players.find(p => p.id === currentId)?.bot ? now + BOT_DELAY : null;
}

function advanceDueBot(room, now) {
  if (!room.game || room.game.phase !== 'playing' || room.botDueAt === null || now < room.botDueAt) return false;
  const currentId = viewFor(room.game, room.hostId).currentPlayerId;
  const bot = room.players.find(p => p.id === currentId);
  if (!bot?.bot) { room.botDueAt = null; return false; }
  const view = viewFor(room.game, bot.id);
  const action = chooseBotAction(view, bot.difficulty);
  room.game = transition(room.game, bot.id, action);
  room.version += 1;
  scheduleBot(room, now);
  return true;
}

function makeBot(index, difficulty) {
  const names = ['Nova', 'Atlas', 'Cleo', 'Juno', 'Milo', 'Echo'];
  return {
    id: `bot_${randomHex(8)}`, name: names[index % names.length], avatar: (index + 1) % 8,
    bot: true, difficulty, tokenHash: null, lastSeen: 0, recentActions: [],
  };
}

function enginePlayers(room) {
  return room.players.map(({ id, name, avatar, bot, difficulty }) => ({ id, name, avatar, bot, difficulty }));
}

async function createRoom(request, db, now) {
  const body = await readBody(request);
  const token = randomHex();
  const player = {
    id: `p_${randomHex(10)}`, name: cleanName(body.name), avatar: cleanAvatar(body.avatar),
    bot: false, difficulty: 'medium', tokenHash: await tokenHash(token), lastSeen: now, recentActions: [],
  };
  const options = cleanOptions(body.options);
  const difficulty = cleanDifficulty(body.difficulty);
  const live = await db.prepare('SELECT COUNT(*) AS n FROM rooms WHERE expires_at > ?').bind(now).first();
  ensure((live?.n ?? 0) < MAX_ROOMS, 'Could not make a room. Try again.', 503);
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = randomCode();
    const room = { code, hostId: player.id, players: [player], options, difficulty, game: null, version: 0, botDueAt: null };
    const result = await db.prepare('INSERT OR IGNORE INTO rooms (code, state, version, updated_at, expires_at) VALUES (?, ?, ?, ?, ?)')
      .bind(code, JSON.stringify(room), 0, now, now + DAY).run();
    if (result.meta?.changes === 1) {
      // Cheap housekeeping on the rare create path: a few expired rooms via the expires_at index. Writes only when some exist.
      await db.prepare('DELETE FROM rooms WHERE code IN (SELECT code FROM rooms WHERE expires_at <= ? LIMIT 25)').bind(now).run().catch(() => {});
      return json({ code, token, playerId: player.id, room: publicRoom(room, player.id, now) }, 201);
    }
  }
  throw new RoomError('Could not make a room. Try again.', 503);
}

async function joinRoom(request, db, code, now) {
  const body = await readBody(request);
  const token = randomHex();
  const player = {
    id: `p_${randomHex(10)}`, name: cleanName(body.name), avatar: cleanAvatar(body.avatar),
    bot: false, difficulty: 'medium', tokenHash: await tokenHash(token), lastSeen: now, recentActions: [],
  };
  for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt++) {
    const { room, revision } = await fetchStored(db, code, now);
    ensure(!room.game, 'This game has already started.', 409);
    ensure(room.players.length < 6, 'This room is full.', 409);
    room.players.push(player);
    room.version += 1;
    if (await saveStored(db, room, revision, now)) {
      return json({ code, token, playerId: player.id, room: publicRoom(room, player.id, now) }, 201);
    }
  }
  throw new RoomError('The room is busy. Try joining again.', 409);
}

async function getRoom(request, db, code, now) {
  const hash = await authHash(request);
  for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt++) {
    const { room, revision } = await fetchStored(db, code, now);
    const player = authenticate(room, hash);
    const heartbeat = now - player.lastSeen >= HEARTBEAT_INTERVAL;
    if (heartbeat) player.lastSeen = now;
    const advanced = advanceDueBot(room, now);
    if (!heartbeat && !advanced) return json({ room: publicRoom(room, player.id, now) });
    if (await saveStored(db, room, revision, now)) return json({ room: publicRoom(room, player.id, now) });
  }
  throw new RoomError('The room is syncing. Please retry.', 409);
}

async function mutateRoom(request, db, code, operation, now) {
  const hash = await authHash(request);
  const body = await readBody(request);
  const action = operation === 'action' ? cleanAction(body.action) : null;
  if (action) {
    ensure(Number.isInteger(body.expectedVersion) && body.expectedVersion >= 0, 'Refresh the room before playing.');
    ensure(typeof body.requestId === 'string' && /^[a-zA-Z0-9_-]{8,100}$/.test(body.requestId), 'An action needs a unique request ID.');
  }
  const actionSignature = action ? JSON.stringify(action) : null;
  for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt++) {
    const { room, revision } = await fetchStored(db, code, now);
    const player = authenticate(room, hash);
    player.lastSeen = now;
    if (action) {
      const duplicate = player.recentActions.find(item => item.id === body.requestId);
      if (duplicate) {
        ensure(duplicate.signature === actionSignature, 'This request ID was already used for a different action.', 409);
        return json({ room: publicRoom(room, player.id, now) });
      }
      ensure(body.expectedVersion === room.version, 'The table changed. Your hand has been refreshed.', 409, { room: publicRoom(room, player.id, now) });
      ensure(room.game?.phase === 'playing', 'Start a match before playing.', 409);
      try { room.game = transition(room.game, player.id, action); }
      catch (error) { throw new RoomError(error instanceof Error ? error.message : 'That move is not legal.', 422); }
      player.recentActions.push({ id: body.requestId, signature: actionSignature });
      player.recentActions = player.recentActions.slice(-16);
      room.version += 1;
      scheduleBot(room, now);
    } else if (operation === 'start') {
      ensure(player.id === room.hostId, 'Only the host can start the match.', 403);
      ensure(!room.game, 'The match has already started.', 409);
      const botCount = body.botCount === undefined ? 0 : body.botCount;
      ensure(Number.isInteger(botCount) && botCount >= 0 && botCount <= 5, 'Choose between 0 and 5 bots.');
      ensure(room.players.length + botCount >= 2 && room.players.length + botCount <= 6, 'A match needs 2–6 players.');
      room.difficulty = cleanDifficulty(body.difficulty, room.difficulty);
      for (let i = 0; i < botCount; i++) room.players.push(makeBot(i, room.difficulty));
      room.game = createGame(enginePlayers(room), room.options);
      room.version += 1;
      scheduleBot(room, now);
    } else if (operation === 'rematch') {
      ensure(player.id === room.hostId, 'Only the host can start the rematch.', 403);
      ensure(room.game?.phase === 'finished', 'Finish this match before starting a rematch.', 409);
      ensure(room.players.length >= 2, 'A match needs at least 2 players.');
      // Alternate the opening seat between rounds; no client can select the deal.
      room.players.push(room.players.shift());
      room.game = createGame(enginePlayers(room), room.options);
      for (const member of room.players) member.recentActions = [];
      room.version += 1;
      scheduleBot(room, now);
    } else if (operation === 'leave') {
      if (!room.game) {
        room.players = room.players.filter(p => p.id !== player.id);
      } else {
        player.bot = true;
        player.tokenHash = null;
        player.difficulty = room.difficulty;
        player.recentActions = [];
        // Engine player metadata is public and has no effect on move legality.
        const enginePlayer = room.game.players.find(p => p.id === player.id);
        if (enginePlayer) { enginePlayer.bot = true; enginePlayer.difficulty = room.difficulty; }
      }
      if (room.hostId === player.id) room.hostId = room.players.find(p => !p.bot)?.id || null;
      room.version += 1;
      // If no humans remain the room can be safely removed, with CAS protection.
      if (!room.players.some(p => !p.bot)) {
        const result = await db.prepare('DELETE FROM rooms WHERE code = ? AND version = ?').bind(code, revision).run();
        if (result.meta?.changes === 1) return json({ ok: true });
        continue;
      }
      scheduleBot(room, now);
    } else {
      throw new RoomError('Unknown room action.', 404);
    }
    if (await saveStored(db, room, revision, now)) {
      return operation === 'leave' ? json({ ok: true }) : json({ room: publicRoom(room, player.id, now) });
    }
  }
  throw new RoomError('The table is busy. Please try again.', 409);
}

/** Per-IP limit in the Workers rate-limit binding; a refused request never touches D1. Missing in tests and plain local dev. */
async function rateLimit(request, limiter) {
  const ip = request.headers.get('CF-Connecting-IP');
  if (!limiter || !ip) return;
  const { success } = await limiter.limit({ key: ip });
  ensure(success, 'The room could not sync. Try again in a moment.', 429);
}

/**
 * A dependency-injectable clock is used only by the integration test harness.
 * runtime.limits holds the rate-limit bindings: { create, join, action }.
 */
export async function handleRoomRequest(request, db, runtime = {}) {
  try {
    ensure(db && typeof db.prepare === 'function', 'Online rooms are temporarily unavailable. Local play is ready.', 503);
    const now = runtime.now ? runtime.now() : Date.now();
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');
    ensure(!origin || origin === url.origin, 'Use the game’s own page to join a room.', 403);
    const segments = url.pathname.replace(/\/+$/, '').split('/').filter(Boolean);
    ensure(segments[0] === 'api' && segments[1] === 'rooms' && segments.length <= 4, 'Unknown room route.', 404);
    if (segments.length === 2) {
      ensure(request.method === 'POST', 'Method not allowed.', 405);
      await rateLimit(request, runtime.limits?.create);
      return await createRoom(request, db, now);
    }
    const code = (segments[2] || '').toUpperCase();
    ensure(/^[A-Z2-9]{6}$/.test(code), 'Enter a valid 6-character room code.');
    const operation = segments[3];
    if (operation !== 'join') {
      // Malformed tokens are refused before any D1 read or limiter call.
      ensure(/^Bearer [a-f0-9]{64}$/i.test(request.headers.get('Authorization') || ''), 'Reconnect with the browser that joined this room.', 401);
    }
    await rateLimit(request, operation === 'join' ? runtime.limits?.join : runtime.limits?.action);
    if (!operation) {
      ensure(request.method === 'GET', 'Method not allowed.', 405);
      return await getRoom(request, db, code, now);
    }
    ensure(request.method === 'POST', 'Method not allowed.', 405);
    if (operation === 'join') return await joinRoom(request, db, code, now);
    ensure(['action', 'start', 'rematch', 'leave'].includes(operation), 'Unknown room action.', 404);
    return await mutateRoom(request, db, code, operation, now);
  } catch (error) {
    if (error instanceof RoomError) return json({ error: error.message, ...error.extra }, error.status);
    // Never return DB rows, deck state, bearer tokens or stack traces to a client.
    console.error('[color-clash rooms]', error instanceof Error ? error.name : 'UnknownError');
    return json({ error: 'The room could not sync. Try again in a moment.' }, 500);
  }
}
