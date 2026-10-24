import { join, errorResponse, roomCode } from '@/lib/server';
export const dynamic = 'force-dynamic';
export async function POST(request: Request, context: { params: Promise<{ code: string }> }) {
  try { return await join(request, roomCode((await context.params).code)); } catch (error) { return errorResponse(error); }
}
