import { env } from 'cloudflare:workers';
import { handleRoomRequest } from '../../../../server/rooms.mjs';

export const dynamic = 'force-dynamic';

const limits = () => ({ create: env.CREATE_LIMIT, join: env.JOIN_LIMIT, action: env.ACTION_LIMIT });

export async function GET(request: Request) {
  return handleRoomRequest(request, env.DB, { limits: limits() });
}

export async function POST(request: Request) {
  return handleRoomRequest(request, env.DB, { limits: limits() });
}
