import { env } from "cloudflare:workers";
import { createRoomRecord, rateLimit, readRoomBody, RoomError, roomErrorResponse } from "../../../lib/rooms";

export async function POST(request: Request) {
  try {
    if (!env.DB) throw new RoomError(503, "The room server is starting. Please try again.");
    const body = await readRoomBody(request);
    await rateLimit(request, env.CREATE_LIMIT);
    const result = await createRoomRecord(env.DB, body);
    return Response.json(result, {status: 201, headers: {"Cache-Control": "no-store"}});
  } catch (error) { return roomErrorResponse(error); }
}
