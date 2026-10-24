// GET and POST /api/rooms/:code, routed by worker/index.ts (moved out of app/
// on 24 Oct 2026 so the page can be a static export).
import { joinRoom, mutateRoom, RoomError, type RoomAction, type RoomState } from '../lib/room';
import { authToken, cleanName, failure, hashToken, json, publicRoom, randomToken, rateLimit, readLiveRoom, requestBody, saveRoom, touchRoom } from '../lib/room-store';

type Context = { params: Promise<{ code: string }> };
export async function GET(req: Request, ctx: Context): Promise<Response> {
  const receivedAt = Date.now();
  try {
    const { code } = await ctx.params; const hash = await hashToken(authToken(req));
    // Plain polling: one D1 read per request. The client sets the pace (1.5 s while a game runs).
    const row = await readLiveRoom(code); await touchRoom(row, hash);
    return json(publicRoom(row, hash), 200, receivedAt);
  } catch (error) { return failure(error, receivedAt); }
}
export async function POST(req: Request, ctx: Context): Promise<Response> {
  const receivedAt = Date.now();
  try {
    const { code } = await ctx.params; const body = await requestBody(req);
    // Rate limit before any D1 work, so a rejected join reads and writes nothing.
    if (body.action === 'join') await rateLimit(req, 'join');
    let token = authToken(req); let hash = await hashToken(token); let row = await readLiveRoom(code);
    if (body.action === 'join') {
      if (body.spectate === true) return json(publicRoom(row, ''), 200, receivedAt);
      if (!token) { token = randomToken(); hash = await hashToken(token); }
      for (let attempt = 0; attempt < 3; attempt++) {
        const state: RoomState = JSON.parse(row.state); const next = joinRoom(state, hash, cleanName(body.nickname), Date.now()); const saved = await saveRoom(row, next);
        if (saved) { await touchRoom(saved, hash); return json({ ...publicRoom(saved, hash), token }, 200, receivedAt); }
        row = await readLiveRoom(code);
      }
      throw new RoomError('Someone joined at the same time. Please try again.', 409);
    }
    if (!token) throw new RoomError('Rejoin the room to make a move.', 401);
    let next: RoomState;
    try { next = mutateRoom(JSON.parse(row.state), hash, body as unknown as RoomAction, Date.now()); }
    catch (error) {
      if (error instanceof RoomError && error.status === 409) return json({ error: error.message, room: publicRoom(await readLiveRoom(code), hash) }, 409, receivedAt);
      throw error;
    }
    const saved = await saveRoom(row, next);
    if (!saved) {
      const latest = await readLiveRoom(code); const state: RoomState = JSON.parse(latest.state);
      // A concurrent identical retry should acknowledge the original commit.
      if (state.requests.some(request => request.id === body.requestId && request.hash === hash)) {
        await touchRoom(latest, hash); return json(publicRoom(latest, hash), 200, receivedAt);
      }
      return json({ error: 'The position changed. Your board is being refreshed.', room: publicRoom(latest, hash) }, 409, receivedAt);
    }
    await touchRoom(saved, hash); return json(publicRoom(saved, hash), 200, receivedAt);
  } catch (error) { return failure(error, receivedAt); }
}
