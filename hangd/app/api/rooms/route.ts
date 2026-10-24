import { create, errorResponse } from '@/lib/server';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) { try { return await create(request); } catch (error) { return errorResponse(error); } }
