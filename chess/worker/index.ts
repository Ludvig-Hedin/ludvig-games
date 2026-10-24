import { POST as createRoom } from "../server/rooms";
import { GET as readRoom, POST as updateRoom } from "../server/room";
import { json } from "../lib/room-store";

// API-only Worker (Workers Free move, 24 Oct 2026). The page is a static
// export served from assets, Stockfish included (public/engine). This Worker
// runs only for /api/* (run_worker_first in wrangler.jsonc).

const ROOM_PATH = /^\/api\/rooms\/([^/]{1,16})$/;

const worker = {
  async fetch(request: Request, _env?: Cloudflare.Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === "/api/rooms") return request.method === "POST" ? createRoom(request) : json({ error: "Not found." }, 405);
    const match = pathname.match(ROOM_PATH);
    if (match) {
      const ctx = { params: Promise.resolve({ code: decodeURIComponent(match[1]) }) };
      if (request.method === "GET") return readRoom(request, ctx);
      if (request.method === "POST") return updateRoom(request, ctx);
      return json({ error: "Not found." }, 405);
    }
    return json({ error: "Not found." }, 404);
  },
};

export default worker;
