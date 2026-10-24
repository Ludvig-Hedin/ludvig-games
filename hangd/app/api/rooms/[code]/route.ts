import { env } from 'cloudflare:workers';
import { credentials, errorResponse, json, rateLimit, roomCode, snapshot } from '@/lib/server';
export const dynamic = 'force-dynamic';
export async function GET(request: Request, context: { params: Promise<{ code: string }> }) {
  try {
    const token = await credentials(request);
    await rateLimit(request, env.ACTION_LIMIT);
    return json({ room: await snapshot(roomCode((await context.params).code), token, true) });
  } catch (error) { return errorResponse(error); }
}
