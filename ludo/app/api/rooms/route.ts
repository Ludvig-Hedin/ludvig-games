import { env } from "cloudflare:workers";
import { handleRooms } from "../../../lib/rooms";

export const dynamic = "force-dynamic";
const limits = () => ({ create: env.CREATE_LIMIT, join: env.JOIN_LIMIT, action: env.ACTION_LIMIT });

export async function POST(request: Request) {
  return handleRooms(request, env.DB, undefined, limits());
}
