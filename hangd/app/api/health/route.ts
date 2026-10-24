import { env } from 'cloudflare:workers';
export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    if (!env.DB) throw new Error('Database unavailable');
    await env.DB.prepare('SELECT code FROM rooms LIMIT 1').first();
    return Response.json({ status: 'ok', game: 'Hängd', transport: 'polling', storage: 'D1', version: '1.0.0' }, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return Response.json({ status: 'unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } }); }
}
