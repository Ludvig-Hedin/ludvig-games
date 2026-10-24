import { handleRoomRequest } from "../lib/rooms";

// API-only Worker (Workers Free move, 24 Oct 2026). The page is a static
// export served from assets; this Worker runs only for /api/* (run_worker_first
// in wrangler.jsonc). It replaces the app/api route files with one router.
// Per-IP limits use the Workers rate-limit binding, checked before any D1
// work, so a rejected request reads and writes nothing.

const HEADERS = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store, max-age=0", "X-Content-Type-Options": "nosniff" };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: HEADERS });
const ACTION = /^\/api\/rooms\/([^/]{1,16})(?:\/(move|join|rematch|leave))?$/;

async function allowed(limiter: RateLimit | undefined, request: Request): Promise<boolean> {
  if (!limiter) return true;
  try { return (await limiter.limit({ key: request.headers.get("CF-Connecting-IP") ?? "local" })).success; }
  catch { return true; }
}

const tooMany = () => json({ error: "Online play is temporarily unavailable. Try again shortly.", code: "rate_limited" }, 429);

async function health(env: Cloudflare.Env): Promise<Response> {
  if (!env.DB) return json({ online: false }, 503);
  try { await env.DB.prepare("SELECT code FROM rooms LIMIT 1").first(); return json({ online: true }); }
  catch { return json({ online: false }, 503); }
}

const worker = {
  async fetch(request: Request, env: Cloudflare.Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === "/api/health" && request.method === "GET") return health(env);
    if (pathname === "/api/rooms") {
      if (request.method === "POST" && !(await allowed(env.CREATE_LIMIT, request))) return tooMany();
      return handleRoomRequest(request, env.DB, "create");
    }
    const match = pathname.match(ACTION);
    if (match) {
      const action = match[2] as "move" | "join" | "rematch" | "leave" | undefined;
      if (action === "join" && request.method === "POST" && !(await allowed(env.JOIN_LIMIT, request))) return tooMany();
      return handleRoomRequest(request, env.DB, action ?? "read", decodeURIComponent(match[1]));
    }
    return json({ error: "Not found.", code: "not_found" }, 404);
  },
};

export default worker;
