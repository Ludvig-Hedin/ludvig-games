import { env } from "cloudflare:workers";
import { apiError, getRoom, json, RoomError } from "../../../../lib/rooms";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ code: string }> }) {
  try {
    if (!env.DB) throw new RoomError("Online rooms are temporarily unavailable.", 503);
    const { code } = await context.params;
    return json(await getRoom(env.DB, request, code));
  } catch (error) { return apiError(error); }
}
