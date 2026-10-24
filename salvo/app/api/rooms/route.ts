import { env } from "cloudflare:workers";
import { apiError, createRoom, json, readBody, RoomError } from "../../../lib/rooms";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    if (!env.DB) throw new RoomError("Online rooms are temporarily unavailable.", 503);
    return json(await createRoom(env.DB, request, await readBody(request), { create: env.CREATE_LIMIT }), 201);
  } catch (error) { return apiError(error); }
}
