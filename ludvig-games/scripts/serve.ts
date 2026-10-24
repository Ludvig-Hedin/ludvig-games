// Local preview. Roles (env LUDVIG_ROLE), so the hub split can be tried on one machine:
//   all (default)  public/ on 127.0.0.1:4317 plus everything same-origin: an in-memory copy of the room server
//                  (same Room and Registry rules as the Worker: membership, host, meta and WebRTC signaling, no
//                  gameplay relay, site-wide room cap) and stub score APIs.
//   static         public/ only, like the static start page: /api/* and /mp/* get the 404 page.
//   api            the API on 127.0.0.1:4318, like the API Worker: the real worker/index.mjs for /api/* (SQLite
//                  in memory, or LUDVIG_DB=<file>; in-memory rate limits; DEV=1, so it answers only
//                  http://127.0.0.1:4317 and https://games.ludvighedin.com), and the room server at /mp/ws with the
//                  same Origin check and limits.
//   split          static on 4317 and api on 4318 in one process (one dev server slot).
// Cross-origin setup: `LUDVIG_API_BASE=http://127.0.0.1:4318 python3 build.py`, then
// `LUDVIG_ROLE=split bun scripts/serve.ts` (or the static and api roles separately). PORT overrides the port of
// a single role.
// GET /__mp-stats counts what reaches the room server (add ?reset=1 to start a new count); local only.
import { resolve, sep } from "node:path";
import { readFileSync } from "node:fs";
import { stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { Database } from "bun:sqlite";
import { CLOSE, GAME_ID, PING, PONG, Registry, Room, clampMax, normalizeCode } from "../worker/rooms.mjs";
import { allowedOrigin, cleanName, json as apiJson, memoryLimiters, preflight, sha256hex, underLimit, validPlayerId } from "../worker/util.mjs";

type Role = "all" | "static" | "api";
const ROLE = process.env.LUDVIG_ROLE || "all";
if (!["all", "static", "api", "split"].includes(ROLE)) throw new Error(`LUDVIG_ROLE must be all, static, api or split, not ${ROLE}`);
const ROLES: [Role, number][] = ROLE === "split" ? [["static", 4317], ["api", 4318]]
  : [[ROLE as Role, Number(process.env.PORT || (ROLE === "api" ? 4318 : 4317))]];

const root = resolve(import.meta.dir, "../public");
const rooms = new Map<string, Room>();
// One registry for every game, like the Worker's single MpLobby: it enforces the site-wide room cap.
const registry = new Registry();
const room = (game: string, code: string) => rooms.get(`${game}:${code}`) ?? rooms.set(`${game}:${code}`, new Room()).get(`${game}:${code}`)!;
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const CLOSE_FOR: Record<string, number> = { "not-found": CLOSE.notFound, full: CLOSE.full, "bad-request": CLOSE.badRequest, "rate-limited": CLOSE.rateLimited };

type Data = { game: string; code: string | null; peer: string; name: string; init: any; error?: string };

/* API role: the Worker's own code with local stand-ins for its bindings. */
const apiEnv: Record<string, any> = { DEV: "1", ...memoryLimiters() };
let worker: { fetch: (request: Request, env: any, ctx: any) => Promise<Response> } | null = null;
if (ROLES.some(([role]) => role === "api")) {
  // worker/index.mjs imports cloudflare:workers for its Durable Object classes; the rooms run in memory here.
  Bun.plugin({
    name: "cloudflare-workers-stub",
    setup(build) {
      build.module("cloudflare:workers", () => ({
        exports: { DurableObject: class { ctx: unknown; env: unknown; constructor(ctx: unknown, env: unknown) { this.ctx = ctx; this.env = env; } } },
        loader: "object",
      }));
    },
  });
  apiEnv.DB = sqliteD1(process.env.LUDVIG_DB || ":memory:");
  worker = (await import("../worker/index.mjs")).default;
}

/** D1's prepare/bind/first/all/run/batch over bun:sqlite, with the real migration. */
function sqliteD1(path: string) {
  const db = new Database(path, { create: true });
  db.exec(readFileSync(resolve(import.meta.dir, "../migrations/0001_scores.sql"), "utf8"));
  class Statement {
    constructor(readonly sql: string, readonly args: any[] = []) {}
    bind(...args: any[]) { return new Statement(this.sql, args); }
    async first() { return (db.query(this.sql).get(...this.args) as any) ?? null; }
    async all() { return { results: db.query(this.sql).all(...this.args) }; }
    async run() { db.query(this.sql).run(...this.args); return { success: true }; }
    exec() { return /^\s*(SELECT|WITH)|RETURNING/i.test(this.sql) ? { results: db.query(this.sql).all(...this.args) } : (db.query(this.sql).run(...this.args), { results: [] }); }
  }
  return {
    prepare: (sql: string) => new Statement(sql),
    async batch(statements: Statement[]) { return db.transaction(() => statements.map(s => s.exec()))(); },
  };
}

const notFoundPage = () => new Response(Bun.file(resolve(root, "404.html")), { status: 404 });

// What would be billed on Cloudflare: connects and frames that reach the room object, lobby calls, and
// pings that the auto-response answers without waking the room (listed apart).
const newStats = () => ({ since: Date.now(), connects: 0, frames: {} as Record<string, number>, framesTotal: 0, autoPings: 0, lobbyCalls: 0 });
let stats = newStats();

// Mirrors MpRoom.report: every room tells the lobby about changes, at most once a second (at once when empty).
const reportTimers = new Map<string, Timer>();
function report(game: string, code: string, now = false) {
  const key = `${game}:${code}`;
  const run = () => {
    reportTimers.delete(key);
    const r = room(game, code);
    stats.lobbyCalls++;
    registry.report(game, code, r.open ? r.info() : { players: 0 }, Date.now());
  };
  if (now) { clearTimeout(reportTimers.get(key)); run(); return; }
  if (!reportTimers.has(key)) reportTimers.set(key, setTimeout(run, 1000));
}

/** Same per-IP limits as the Worker (in memory). Only in the api role; the all role stays unlimited for tests. */
async function limited(role: Role, name: string, ip: string) {
  return role === "api" && !(await underLimit(apiEnv, name, (await sha256hex(`ludvig-ip:${ip}`)).slice(0, 24)));
}

async function plan(url: URL, ip: string, role: Role): Promise<Data> {
  const q = url.searchParams;
  const game = q.get("game") || "";
  const player = q.get("player");
  const name = cleanName(q.get("name")) ?? "Player";
  const max = clampMax(q.get("max"));
  const base = { game, name, peer: "", code: null as string | null, init: null as any };
  if (!GAME_ID.test(game) || !validPlayerId(player)) return { ...base, error: "bad-request" };
  if (await limited(role, "RL_SOCKET", ip)) return { ...base, error: "rate-limited" };
  const now = Date.now();
  let code: string | null = null;
  if (q.has("room")) code = normalizeCode(q.get("room"));
  else if (q.get("create") === "1") {
    if (await limited(role, "RL_ROOM", ip)) return { ...base, error: "rate-limited" };
    const visible = q.get("visible") === "1";
    stats.lobbyCalls++;
    code = registry.reserve(game, { max, public: visible }, now);
    base.init = { max, public: visible, seed: (Math.random() * 2 ** 32) >>> 0 };
  } else if (q.get("quick") === "1") {
    stats.lobbyCalls++;
    let match: any = registry.quick(game, { max, allowCreate: false }, now);
    if (match.error || !room(game, match.code).open) {
      if (await limited(role, "RL_ROOM", ip)) return { ...base, error: "rate-limited" };
      stats.lobbyCalls++;
      match = registry.quick(game, { max, allowCreate: true }, now);
    }
    code = match.code ?? null;
    if (match.created) base.init = { max, public: true, seed: (Math.random() * 2 ** 32) >>> 0 };
  }
  if (!code) return { ...base, error: q.has("room") ? "not-found" : q.has("quick") || q.has("create") ? "unavailable" : "bad-request" };
  return { ...base, code, peer: hash(`peer:${player}:${game}:${code}`).slice(0, 10) };
}

const serve = (role: Role, port: number) => Bun.serve<Data>({
  hostname: "127.0.0.1",
  port,
  async fetch(request, srv) {
    let pathname: string;
    const url = new URL(request.url);
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      return new Response("Bad request", { status: 400 });
    }
    const ip = srv.requestIP(request)?.address || "127.0.0.1";
    if (pathname === "/__mp-stats" && role !== "static") {
      const body = { ...stats, minutes: +((Date.now() - stats.since) / 60e3).toFixed(2) };
      if (url.searchParams.get("reset") === "1") stats = newStats();
      return json(body);
    }
    const api = pathname.startsWith("/api/") || pathname.startsWith("/mp/");
    // The static start page has no Worker: these paths are just missing files.
    if (role === "static" && api) return notFoundPage();
    if (role === "api") {
      if (!api) return apiJson({ ok: false, error: "not-found" }, 404);
      // Like the Worker: other origins are refused before anything else runs.
      const origin = allowedOrigin(request, apiEnv);
      if (!origin) return apiJson({ ok: false, error: "forbidden" }, 403);
      if (request.method === "OPTIONS") return preflight(origin);
      if (pathname === "/mp/ws") {
        if (srv.upgrade(request, { data: await plan(url, ip, role) })) return undefined;
        return apiJson({ ok: false, error: "websocket-required" }, 426, origin);
      }
      if (pathname === "/api/mp/list") { stats.lobbyCalls++; return apiJson({ rooms: registry.list(url.searchParams.get("game") || "", Date.now()) }, 200, origin); }
      const headers = new Headers(request.headers);
      headers.set("CF-Connecting-IP", ip);
      return worker!.fetch(new Request(request, { headers }), apiEnv, { waitUntil() {} });
    }
    if (pathname === "/mp/ws") {
      if (srv.upgrade(request, { data: await plan(url, ip, role) })) return undefined;
      return new Response("WebSocket required", { status: 426 });
    }
    if (pathname === "/api/mp/list") { stats.lobbyCalls++; return json({ rooms: registry.list(url.searchParams.get("game") || "", Date.now()) }); }
    if (pathname === "/api/scores") return request.method === "POST" ? json({ ok: true, best: 0, rank: 1, week: { rank: 1, score: 0 } }) : json({ entries: [], you: null });
    if (pathname === "/api/me") return json({ records: [], player: "local" });
    if (pathname === "/api/name") return json({ ok: true, name: "Player" });
    const path = resolve(root, `.${pathname}`);
    if (path !== root && !path.startsWith(root + sep)) {
      return new Response("Not found", { status: 404 });
    }
    const candidates = pathname.endsWith("/")
      ? [resolve(path, "index.html")]
      : [path, `${path}.html`, resolve(path, "index.html")];
    for (const candidate of candidates) {
      const file = Bun.file(candidate);
      try {
        if ((await stat(candidate)).isFile()) {
          return new Response(file);
        }
      } catch { /* Try the directory index next. */ }
    }
    return notFoundPage();
  },
  websocket: {
    open(ws) {
      const d = ws.data;
      const fail = (code: string) => { ws.send(JSON.stringify({ t: "error", code })); ws.close(CLOSE_FOR[code] ?? CLOSE.unavailable, code); };
      if (d.error || !d.code) return fail(d.error || "bad-request");
      const r = room(d.game, d.code);
      stats.connects++;
      if (d.init) {
        if (r.open) return fail("unavailable");
        r.init({ code: d.code, max: d.init.max, public: d.init.public, seed: d.init.seed });
      } else if (!r.open) return fail("not-found");
      const result = r.join({ id: d.peer, name: d.name, socket: ws }, Date.now());
      if (result.error) return fail(result.error);
      report(d.game, d.code);
    },
    message(ws, message) {
      const d = ws.data;
      if (!d.code) return;
      const text = String(message);
      // Cloudflare answers this exact frame itself (setWebSocketAutoResponse); the room never sees it.
      if (text === PING) { stats.autoPings++; ws.send(PONG); return; }
      let type = "?";
      try { type = String(JSON.parse(text).t); } catch { /* Counted as "?". */ }
      stats.frames[type] = (stats.frames[type] || 0) + 1;
      stats.framesTotal++;
      const r = room(d.game, d.code);
      const result = r.handle(d.peer, ws, text, Date.now());
      if (result.abuse) { ws.close(CLOSE.rateLimited, "rate-limited"); r.leave(d.peer, ws); }
      if (result.changed || result.empty || result.abuse) report(d.game, d.code, result.empty || !r.open);
    },
    close(ws, code) {
      const d = ws.data;
      if (!d.code || d.error) return;
      const r = room(d.game, d.code);
      if (code === 1000) {
        const result = r.leave(d.peer, ws);
        if (result.changed) report(d.game, d.code, result.empty);
      } else if (r.drop(d.peer, ws, Date.now())) {
        setTimeout(() => { const result = r.sweep(Date.now()); if (result.changed) report(d.game, d.code!, result.empty); }, 8200);
      }
    },
  },
});

for (const [role, port] of ROLES) console.log(`Ludvig Games (${role}): ${serve(role, port).url}`);
