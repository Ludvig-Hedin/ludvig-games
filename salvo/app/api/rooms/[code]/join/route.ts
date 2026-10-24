import { env } from "cloudflare:workers";
import { apiError, joinRoom, json, readBody, RoomError } from "../../../../../lib/rooms";
export const dynamic = "force-dynamic";
export async function POST(request: Request, context: { params: Promise<{ code: string }> }) {
  try {
    if (!env.DB) throw new RoomError("Online rooms are temporarily unavailable.", 503);
    const { code } = await context.params;
    return json(await joinRoom(env.DB, request, code, await readBody(request), { join: env.JOIN_LIMIT }));
  } catch (error) { return apiError(error); }
}
