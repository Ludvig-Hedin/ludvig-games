import { env } from 'cloudflare:workers';
import { expireGame } from './game';
import { RoomError, seatFor, type PublicRoom, type RoomState } from './room';

export interface RoomRow { code: string; version: number; state: string; white_seen: number; black_seen: number; created_at: number; updated_at: number }
export function db(): D1Database {
  if (!env.DB) throw new RoomError('Online rooms are temporarily unavailable. Local and computer games are ready to play.', 503);
  return env.DB;
}
export async function hashToken(token: string): Promise<string> {
  if (!token) return '';
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(hash), x => x.toString(16).padStart(2, '0')).join('');
}
export function authToken(req: Request): string {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '') ?? '';
  return /^[a-f0-9]{64}$/.test(token) ? token : '';
}
export function randomToken(): string { return Array.from(crypto.getRandomValues(new Uint8Array(32)), x => x.toString(16).padStart(2, '0')).join(''); }
export function randomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(8)), n => chars[n % chars.length]).join('');
}
export function cleanCode(code: string): string {
  const value = code.toUpperCase();
  if (!/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/.test(value)) throw new RoomError('Enter the eight-character room code.', 404);
  return value;
}
export function cleanName(name: unknown): string {
  return typeof name === 'string' ? name.replace(/[\u0000-\u001f\u007f-\u009f]/g, '').trim().slice(0, 24) || 'Guest' : 'Guest';
}
export async function getRoom(code: string): Promise<RoomRow> {
  const row = await db().prepare('SELECT * FROM chess_rooms WHERE code = ?').bind(cleanCode(code)).first<RoomRow>();
  if (!row) throw new RoomError('Room not found. Check the code and try again.', 404);
  if (row.updated_at < Date.now() - 30 * 86400000) throw new RoomError('This room has expired. Create a new room to play again.', 410);
  return row;
}
export async function saveRoom(row: RoomRow, state: RoomState): Promise<RoomRow | null> {
  const previous: RoomState = JSON.parse(row.state);
  if (state.game.revision === previous.game.revision) return row;
  const presenceColumn = (hash: string | undefined): 'white_seen' | 'black_seen' | '0' => {
    if (hash && hash === previous.seats.w?.hash) return 'white_seen';
    if (hash && hash === previous.seats.b?.hash) return 'black_seen';
    return '0';
  };
  // Presence follows the participant when a rematch exchanges colors.
  // The interpolated expressions are fixed column names, never user input.
  // Read current SQL values so a concurrent heartbeat cannot be overwritten.
  return db().prepare(`UPDATE chess_rooms SET state = ?, version = version + 1, updated_at = ?, white_seen = ${presenceColumn(state.seats.w?.hash)}, black_seen = ${presenceColumn(state.seats.b?.hash)} WHERE code = ? AND version = ? RETURNING *`)
    .bind(JSON.stringify(state), Date.now(), row.code, row.version).first<RoomRow>();
}
export async function readLiveRoom(code: string): Promise<RoomRow> {
  let row = await getRoom(code);
  for (let attempt = 0; attempt < 3; attempt++) {
    const state: RoomState = JSON.parse(row.state); const game = expireGame(state.game, Date.now());
    if (game === state.game) return row;
    const saved = await saveRoom(row, { ...state, game }); if (saved) return saved;
    row = await getRoom(code);
  }
  return row;
}
export function publicRoom(row: RoomRow, hash: string, now = Date.now()): PublicRoom {
  const state: RoomState = JSON.parse(row.state);
  return { code: row.code, game: state.game, revision: state.game.revision, serverNow: now, you: seatFor(state, hash) ?? 'spectator',
    connected: { w: !!state.seats.w && now - row.white_seen < 18000, b: !!state.seats.b && now - row.black_seen < 18000 } };
}
export async function touchRoom(row: RoomRow, hash: string): Promise<void> {
  const side = seatFor(JSON.parse(row.state), hash); if (!side) return;
  const column = side === 'w' ? 'white_seen' : 'black_seen';
  const now = Date.now();
  if (now - row[column] < 4000) return;
  // A heartbeat started before a rematch must not touch the former color.
  const result = await db().prepare(`UPDATE chess_rooms SET ${column} = MAX(${column}, ?) WHERE code = ? AND version = ?`).bind(now, row.code, row.version).run();
  if (result.meta.changes) row[column] = now;
}
// Per-IP limits use the Workers rate-limit binding (24 Oct 2026), not D1
// counters, so a rejected request reads and writes nothing.
export async function rateLimit(req: Request, kind: 'create' | 'join'): Promise<void> {
  const limiter = kind === 'create' ? env.CREATE_LIMIT : env.JOIN_LIMIT;
  if (!limiter) return;
  const key = req.headers.get('cf-connecting-ip') ?? 'local';
  let success = true;
  try { ({ success } = await limiter.limit({ key })); } catch { /* Fail open: the binding is an extra guard. */ }
  if (!success) throw new RoomError('Too many attempts. Please wait a moment and try again.', 429);
}
// Rooms expire after 30 days without an update. Drop at most 50 per create,
// found through the chess_rooms_updated index, so the table stays small.
export async function pruneRooms(): Promise<void> {
  await db().prepare('DELETE FROM chess_rooms WHERE code IN (SELECT code FROM chess_rooms WHERE updated_at < ? LIMIT 50)').bind(Date.now() - 30 * 86400000).run();
}
export function json(data: unknown, status = 200, receivedAt?: number): Response {
  return Response.json(data, { status, headers: {
    'Cache-Control': 'no-store, no-cache, must-revalidate', 'X-Content-Type-Options': 'nosniff',
    ...(receivedAt === undefined ? {} : { 'Server-Timing': `app;dur=${Math.max(0, Date.now() - receivedAt)}` }),
  } });
}
export function failure(error: unknown, receivedAt?: number): Response {
  if (error instanceof RoomError) return json({ error: error.message }, error.status, receivedAt);
  console.error('Chess room request failed', error instanceof Error ? error.message : 'Unknown error');
  return json({ error: 'The connection was interrupted. Please try again.' }, 503, receivedAt);
}
export async function requestBody(req: Request): Promise<Record<string, unknown>> {
  const origin = req.headers.get('origin');
  if (origin) {
    try { if (new URL(origin).origin !== new URL(req.url).origin) throw new Error(); }
    catch { throw new RoomError('This request came from a different site.', 403); }
  }
  if (Number(req.headers.get('content-length')) > 8192) throw new RoomError('Request too large.', 413);
  const reader = req.body?.getReader();
  if (!reader) throw new RoomError('Invalid request.');
  const decoder = new TextDecoder(); let text = ''; let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      bytes += value.byteLength;
      if (bytes > 8192) { await reader.cancel(); throw new RoomError('Request too large.', 413); }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } finally { reader.releaseLock(); }
  try { const data = JSON.parse(text); if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error(); return data; } catch { throw new RoomError('Invalid request.'); }
}
