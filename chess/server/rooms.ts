// POST /api/rooms, routed by worker/index.ts (moved out of app/ on 24 Oct 2026
// so the page can be a static export).
import { DEFAULT_CONFIG, type GameConfig } from '../lib/game';
import { createRoom } from '../lib/room';
import { cleanName, db, failure, hashToken, json, pruneRooms, publicRoom, randomCode, randomToken, rateLimit, requestBody, type RoomRow } from '../lib/room-store';

export async function POST(req: Request): Promise<Response> {
  const receivedAt = Date.now();
  try {
    const body = await requestBody(req); await rateLimit(req, 'create'); await pruneRooms();
    const time = body.time as { minutes?: unknown; increment?: unknown } | undefined;
    const minutes = typeof time?.minutes === 'number' && Number.isFinite(time.minutes) ? Math.max(0, Math.min(180, time.minutes)) : 10;
    const increment = minutes > 0 && typeof time?.increment === 'number' && Number.isFinite(time.increment) ? Math.max(0, Math.min(180, Math.floor(time.increment))) : 0;
    const color = body.color === 'w' || body.color === 'b' ? body.color : 'random';
    const config: GameConfig = { ...DEFAULT_CONFIG, mode: 'online', color, nickname: cleanName(body.nickname), hints: false, takebacks: false,
      time: { minutes, increment, label: minutes === 0 ? 'Unlimited' : increment ? `${minutes} + ${increment}` : `${minutes} min` } };
    const token = randomToken(); const hash = await hashToken(token); const now = Date.now(); const state = createRoom(config, hash, now);
    for (let attempt = 0; attempt < 4; attempt++) {
      const code = randomCode();
      const row = await db().prepare('INSERT INTO chess_rooms (code, version, state, white_seen, black_seen, created_at, updated_at) VALUES (?, 0, ?, ?, ?, ?, ?) ON CONFLICT(code) DO NOTHING RETURNING *')
        .bind(code, JSON.stringify(state), state.seats.w ? now : 0, state.seats.b ? now : 0, now, now).first<RoomRow>();
      if (row) return json({ ...publicRoom(row, hash), token }, 201, receivedAt);
    }
    return json({ error: 'Could not create a room. Please try again.' }, 503, receivedAt);
  } catch (error) { return failure(error, receivedAt); }
}
