import { env } from "cloudflare:workers";
import { apiError, actInRoom, json, readBody, RoomError } from "../../../../../lib/rooms";
export const dynamic = "force-dynamic";
export async function POST(request: Request, context: { params: Promise<{ code: string }> }) {
  try {
    if (!env.DB) throw new RoomError("Online rooms are temporarily unavailable.", 503);
    const { code } = await context.params;
    return json(await actInRoom(env.DB, request, code, await readBody(request)));
  } catch (error) { return apiError(error); }
}
