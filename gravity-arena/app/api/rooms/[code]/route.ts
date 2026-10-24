import { env } from "cloudflare:workers";
import { actOnRoom, getRoomRecord, rateLimit, readRoomBody, RoomError, roomErrorResponse, roomToken } from "../../../../lib/rooms";

type Context = {params: Promise<{code: string}>};

export async function GET(request: Request, context: Context) {
  try {
    if (!env.DB) throw new RoomError(503, "The room server is starting. Please try again.");
    const {code} = await context.params;
    const token = roomToken(request);
    await rateLimit(request, env.ACTION_LIMIT);
    const result = await getRoomRecord(env.DB, code, token);
    return Response.json(result, {headers: {"Cache-Control": "no-store"}});
  } catch (error) { return roomErrorResponse(error); }
}

export async function POST(request: Request, context: Context) {
  try {
    if (!env.DB) throw new RoomError(503, "The room server is starting. Please try again.");
    const {code} = await context.params;
    const token = roomToken(request);
    const body = await readRoomBody(request);
    await rateLimit(request, body.action === "join" ? env.JOIN_LIMIT : env.ACTION_LIMIT);
    const result = await actOnRoom(env.DB, code, token, body);
    return Response.json(result, {headers: {"Cache-Control": "no-store"}});
  } catch (error) { return roomErrorResponse(error); }
}
