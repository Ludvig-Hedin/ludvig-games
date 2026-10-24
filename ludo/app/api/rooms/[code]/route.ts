import { env } from "cloudflare:workers";
import { handleRooms } from "../../../../lib/rooms";

export const dynamic = "force-dynamic";
const limits = () => ({ create: env.CREATE_LIMIT, join: env.JOIN_LIMIT, action: env.ACTION_LIMIT });

type Context = { params: Promise<{ code: string }> };

export async function GET(request: Request, context: Context) {
  return handleRooms(request, env.DB, (await context.params).code, limits());
}

export async function POST(request: Request, context: Context) {
  return handleRooms(request, env.DB, (await context.params).code, limits());
}
