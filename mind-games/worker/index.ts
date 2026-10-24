import { roomApi } from "../lib/rooms";

// API-only Worker (Workers Free move, 24 Oct 2026). The page is a static
// export served from assets; this Worker runs only for /api/* (run_worker_first
// in wrangler.jsonc). It replaces the app/api route files with one router.
// Per-IP limits use the Workers rate-limit binding, checked before any D1
// work, so a rejected request reads and writes nothing.

const HEADERS = { "content-type": "application/json", "cache-control": "no-store, private", "x-content-type-options": "nosniff" };
const json = (value: unknown, status: number) => new Response(JSON.stringify(value), { status, headers: HEADERS });
const ROOM = /^\/api\/rooms\/([^/]{1,16})(?:\/(join|action))?$/;

async function allowed(limiter: RateLimit | undefined, request: Request): Promise<boolean> {
  if (!limiter) return true;
  try { return (await limiter.limit({ key: request.headers.get("CF-Connecting-IP") ?? "local" })).success; }
  catch { return true; }
}

const tooMany = () => json({ error: "Too many attempts. Try again in a few minutes.", code: "rate_limited" }, 429);
const wrongMethod = () => json({ error: "That action is not supported.", code: "method_not_allowed" }, 405);

const worker = {
  async fetch(request: Request, env: Cloudflare.Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === "/api/rooms") {
      if (request.method !== "POST") return wrongMethod();
      if (!(await allowed(env.CREATE_LIMIT, request))) return tooMany();
      return roomApi(request, env.DB, "create");
    }
    const match = pathname.match(ROOM);
    if (match) {
      const code = decodeURIComponent(match[1]);
      if (!match[2]) return request.method === "GET" ? roomApi(request, env.DB, "get", code) : wrongMethod();
      if (request.method !== "POST") return wrongMethod();
      if (match[2] === "join" && !(await allowed(env.JOIN_LIMIT, request))) return tooMany();
      return roomApi(request, env.DB, match[2] as "join" | "action", code);
    }
    return json({ error: "Not found.", code: "not_found" }, 404);
  },
};

export default worker;
