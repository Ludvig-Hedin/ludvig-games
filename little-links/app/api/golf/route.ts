import { env } from 'cloudflare:workers';
import { actOnRoom, createRoom, joinRoom, publicRoom, RoomError, validateName, type StoredRoom } from '@/lib/room-engine';
import type { RoomAction } from '@/lib/multiplayer';

export const dynamic = 'force-dynamic';
const ROOM_LIFETIME = 24 * 60 * 60 * 1000;
// Global cap on live rooms, so a flood cannot use up the free D1 write budget.
export const MAX_ROOMS = 300;
type Limiter = { limit(options: { key: string }): Promise<{ success: boolean }> };
/** Per-IP limit in the Workers rate-limit binding; a refused request never touches D1. Missing in plain local dev. */
async function rateLimit(request: Request, limiter: Limiter | undefined): Promise<void> {
  const ip = request.headers.get('cf-connecting-ip');
  if (!limiter || !ip) return;
  if (!(await limiter.limit({ key: ip })).success) throw new RoomError(429, 'The clubhouse is temporarily unavailable. Please try again.');
}
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
interface Row { code: string; state: string; version: number; updated_at: number }
function database(): D1Database {
  if (!env.DB) throw new RoomError(503, 'The online clubhouse is warming up. Local play is available.');
  return env.DB;
}
function response(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
}
function fail(error: unknown): Response {
  if (error instanceof RoomError) return response({ error: error.message }, error.status);
  console.error('Golf room request failed', error instanceof Error ? error.message : 'unknown');
  return response({ error: 'The clubhouse is temporarily unavailable. Please try again.' }, 503);
}
function roomCode(input: unknown): string {
  if (typeof input !== 'string') throw new RoomError(400, 'Enter your six-character room code.');
  const code = input.trim().toUpperCase();
  if (!/^[A-Z2-9]{6}$/.test(code)) throw new RoomError(400, 'Enter your six-character room code.');
  return code;
}
function randomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, n => alphabet[n % alphabet.length]).join('');
}
function randomToken(): string { return `${crypto.randomUUID().replaceAll('-', '')}${crypto.randomUUID().replaceAll('-', '')}`; }
async function tokenHash(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}
async function authHash(request: Request): Promise<string> {
  const token = request.headers.get('authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
  if (!token) throw new RoomError(401, 'Join this room to play.');
  return tokenHash(token);
}
async function loadRoom(db: D1Database, code: string): Promise<{ room: StoredRoom; version: number }> {
  const row = await db.prepare('SELECT code, state, version, updated_at FROM golf_rooms WHERE code = ?').bind(code).first<Row>();
  if (!row || Date.now() - row.updated_at > ROOM_LIFETIME) throw new RoomError(404, 'Room not found or expired. Check the code with your host.');
  return { room: JSON.parse(row.state), version: row.version };
}
function reply(room: StoredRoom, version: number, extra: Record<string, string> = {}): Response {
  return response({ room: publicRoom(room, version), serverTime: Date.now(), ...extra });
}
export async function GET(request: Request): Promise<Response> {
  try {
    const code = roomCode(new URL(request.url).searchParams.get('code'));
    const hash = await authHash(request);
    await rateLimit(request, env.ACTION_LIMIT);
    const { room, version } = await loadRoom(database(), code);
    const player = room.players.find(p => p.tokenHash === hash);
    if (!player) throw new RoomError(401, 'Your place in this room could not be restored. Join again.');
    return reply(room, version, { playerId: player.id });
  } catch (error) { return fail(error); }
}
export async function POST(request: Request): Promise<Response> {
  try {
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin) throw new RoomError(403, 'Open the game to make this request.');
    if (!request.headers.get('content-type')?.includes('application/json')) throw new RoomError(415, 'Send this action as JSON.');
    if (Number(request.headers.get('content-length') || 0) > 4096) throw new RoomError(413, 'This action is too large.');
    const raw = await request.text();
    if (raw.length > 4096) throw new RoomError(413, 'This action is too large.');
    let body: RoomAction;
    try { body = JSON.parse(raw); } catch { throw new RoomError(400, 'This action is not valid JSON.'); }
    if (!body || typeof body !== 'object' || typeof body.action !== 'string') throw new RoomError(400, 'Choose a clubhouse action.');
    const db = database();
    const now = Date.now();
    if (body.action === 'create') {
      validateName(body.name);
      await rateLimit(request, env.CREATE_LIMIT);
      const live = await db.prepare('SELECT COUNT(*) AS n FROM golf_rooms WHERE updated_at >= ?').bind(now - ROOM_LIFETIME).first<{ n: number }>();
      if ((live?.n ?? 0) >= MAX_ROOMS) throw new RoomError(503, 'The clubhouse is busy. Try creating a room again.');
      const token = randomToken();
      const hash = await tokenHash(token);
      for (let attempt = 0; attempt < 6; attempt++) {
        const room = createRoom(randomCode(), body.name, hash, body.holes, now);
        const inserted = await db.prepare('INSERT OR IGNORE INTO golf_rooms (code, state, version, updated_at) VALUES (?, ?, 1, ?)').bind(room.code, JSON.stringify(room), now).run();
        if (inserted.meta.changes === 1) {
          // Expired rooms are removed a few at a time after a room is made; writes only when some exist. No cron needed.
          await db.prepare('DELETE FROM golf_rooms WHERE code IN (SELECT code FROM golf_rooms WHERE updated_at < ? LIMIT 25)').bind(now - ROOM_LIFETIME).run().catch(() => {});
          return reply(room, 1, { token, playerId: room.hostId });
        }
      }
      throw new RoomError(503, 'The clubhouse is busy. Try creating a room again.');
    }
    const code = roomCode('code' in body ? body.code : null);
    const token = body.action === 'join' ? randomToken() : null;
    const hash = token ? await tokenHash(token) : await authHash(request);
    await rateLimit(request, body.action === 'join' ? env.JOIN_LIMIT : env.ACTION_LIMIT);
    for (let attempt = 0; attempt < 5; attempt++) {
      const { room, version } = await loadRoom(db, code);
      let player = room.players.find(p => p.tokenHash === hash);
      let changed: boolean;
      if (body.action === 'join') {
        player = joinRoom(room, body.name, hash); changed = true;
      } else {
        if (!player) throw new RoomError(401, 'Your place in this room could not be restored. Join again.');
        changed = actOnRoom(room, player, body, now);
      }
      if (!changed) return reply(room, version, { playerId: player!.id });
      const result = await db.prepare('UPDATE golf_rooms SET state = ?, version = version + 1, updated_at = ? WHERE code = ? AND version = ?').bind(JSON.stringify(room), now, code, version).run();
      if (result.meta.changes === 1) return reply(room, version + 1, { playerId: player!.id, ...(token ? { token } : {}) });
      // Another request won the compare-and-swap; reload and revalidate, never apply stale input.
    }
    throw new RoomError(409, 'The room changed while you were playing. Try again.');
  } catch (error) { return fail(error); }
}
