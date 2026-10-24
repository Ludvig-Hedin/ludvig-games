import { ROOM_LIFETIME, cleanName, MESSAGES } from "../lib/game/signal";
import { codeIsSigned, mintCode, rejectSocket } from "../lib/game/roomcode";

export { AirRoom } from "../lib/game/room-do";
export { RoomRegistry } from "../lib/game/registry-do";

// API-only Worker (Workers Free move, 24 Oct 2026). The page is a static
// export served from assets; this Worker runs only for /api/* (see
// run_worker_first in wrangler.jsonc). Per-IP limits use the Workers
// rate-limit binding, so a rejected request writes nothing and wakes nothing.

const BUSY = "Online play is full right now. Try again in a little while.";

const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });

const clientKey = (request: Request) => request.headers.get("CF-Connecting-IP") ?? "local";

async function allowed(limiter: RateLimit | undefined, request: Request): Promise<boolean> {
  if (!limiter) return true;
  try { return (await limiter.limit({ key: clientKey(request) })).success; }
  catch { return true; }
}

async function createRoom(request: Request, env: Cloudflare.Env): Promise<Response> {
  const origin = request.headers.get("Origin");
  if (origin && origin !== new URL(request.url).origin) return json({ error: "This request must come from the game." }, 403);
  if (!(await allowed(env.CREATE_LIMIT, request))) return json({ error: BUSY }, 429);
  const raw = await request.text();
  if (raw.length > 1024) return json({ error: "Request too large." }, 413);
  let data: Record<string, unknown> = {};
  try { data = JSON.parse(raw || "{}"); } catch { return json({ error: "Invalid request." }, 400); }
  const targetScore = typeof data.targetScore === "number" && [3, 5, 7, 11].includes(data.targetScore) ? data.targetScore : 7;
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = await mintCode(env);
    const registry = env.REGISTRY.get(env.REGISTRY.idFromName("registry"));
    if (!(await registry.reserve(code, Date.now() + ROOM_LIFETIME))) return json({ error: BUSY }, 503);
    const created = await env.ROOMS.get(env.ROOMS.idFromName(code)).create(code, cleanName(data.name), { targetScore });
    if (created) return json(created);
  }
  return json({ error: "Could not start a room. Try again." }, 503);
}

const worker = {
  async fetch(request: Request, env: Cloudflare.Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === "/api/rooms" && request.method === "POST") {
      try { return await createRoom(request, env); }
      catch { return json({ error: "Online play is unavailable right now. Try again soon." }, 503); }
    }
    const match = pathname.match(/^\/api\/rooms\/([A-Z2-9]{6})\/ws$/);
    if (match) {
      if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return new Response("Expected a WebSocket.", { status: 426 });
      // Unknown codes are turned away here, before any Durable Object wakes.
      if (!(await codeIsSigned(match[1], env))) return rejectSocket(MESSAGES.notFound);
      if (!(await allowed(env.JOIN_LIMIT, request))) return rejectSocket(BUSY, 429);
      return env.ROOMS.get(env.ROOMS.idFromName(match[1])).fetch(request);
    }
    return json({ error: "Not found." }, 404);
  },
};

export default worker;
