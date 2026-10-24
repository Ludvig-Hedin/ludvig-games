// Runs every game on this computer: one Miniflare (local Cloudflare Workers runtime) for the hub and the Worker
// games, the Ritkaos Node server, and one small proxy per game on the local network. Works offline.
// Started by the Electron app as a child process, or directly for development:
//   node runtime/server.mjs
// Env: LUDVIG_BUNDLE (bundle dir), LUDVIG_DATA (saved rooms and scores), LUDVIG_BIND (default 0.0.0.0).
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Miniflare } from "miniflare";
import { ALL, HUB } from "./games.mjs";
import { ROUTER_SOURCE } from "./router.mjs";
import { applyMigrations } from "./migrations.mjs";
import { serveStatic, workerRoutes } from "./static.mjs";
import { sharedPath } from "./share.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const bundleDir = process.env.LUDVIG_BUNDLE || path.join(here, "..", "bundle");
const dataDir = process.env.LUDVIG_DATA || path.join(os.homedir(), "Library", "Application Support", "Ludvig Games", "data");
const bind = process.env.LUDVIG_BIND || "0.0.0.0";
const RITKAOS_INTERNAL_PORT = 47901 + Number(process.env.LUDVIG_PORT_OFFSET || 0);
const INJECT = fs.readFileSync(path.join(here, "inject.js"), "utf8");

const log = (...args) => console.log("[runtime]", ...args);
const workerName = (id) => "game_" + id.replace(/-/g, "_");

/** The address other devices on the same network use to reach this computer, or null when offline. */
export function lanAddress() {
  const candidates = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const a of list || []) {
      if (a.family !== "IPv4" || a.internal || a.address.startsWith("169.254.")) continue;
      const rank = name === "en0" ? 0 : name.startsWith("en") ? 1 : name.startsWith("bridge") || name.startsWith("utun") ? 9 : 5;
      candidates.push({ rank, address: a.address });
    }
  }
  candidates.sort((a, b) => a.rank - b.rank);
  return candidates[0] && candidates[0].rank < 9 ? candidates[0].address : null;
}

/** workerd refuses compatibility dates newer than itself; use the newest it supports instead. */
function supportedDate(date) {
  const pkg = JSON.parse(fs.readFileSync(path.join(here, "..", "node_modules", "miniflare", "package.json"), "utf8"));
  const m = /\.(\d{4})(\d{2})(\d{2})\./.exec(pkg.version);
  const max = m ? `${m[1]}-${m[2]}-${m[3]}` : date;
  return date > max ? max : date;
}

const MODULE_TYPES = [
  [/\.(m?js)$/, "ESModule"],
  [/\.cjs$/, "CommonJS"],
  [/\.wasm$/, "CompiledWasm"],
  [/\.(txt|html)$/, "Text"],
  [/\.bin$/, "Data"],
];

function listModules(root, main) {
  const found = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else {
        const type = MODULE_TYPES.find(([re]) => re.test(e.name));
        if (type) found.push({ type: type[1], path: p });
      }
    }
  })(root);
  const mainPath = path.join(root, main);
  return [{ type: "ESModule", path: mainPath }, ...found.filter((m) => m.path !== mainPath)];
}

function workerOptions(entry, cfg) {
  const dir = path.join(bundleDir, entry.id);
  const serverDir = path.join(dir, "server");
  const main = path.relative(serverDir, path.join(dir, cfg.main));
  // Entry facade: workerd only accepts handlers and classes as exports, and the hub's script also exports
  // plain constants. Re-export just the default handler and the Durable Object classes.
  const classes = cfg.durableObjects.map((d) => d.className);
  const facade = [
    `import worker from "./${main.split(path.sep).join("/")}";`,
    classes.length ? `export { ${classes.join(", ")} } from "./${main.split(path.sep).join("/")}";` : "",
    "export default worker;",
  ].join("\n");
  return {
    name: workerName(entry.id),
    modulesRoot: serverDir,
    modules: [
      { type: "ESModule", path: path.join(serverDir, "__ludvig_entry.mjs"), contents: facade },
      ...listModules(serverDir, main),
    ],
    compatibilityDate: supportedDate(cfg.compatibilityDate),
    compatibilityFlags: cfg.compatibilityFlags,
    bindings: cfg.vars,
    d1Databases: Object.fromEntries(cfg.d1.map((d) => [d.binding, `${entry.id}-${d.binding}`])),
    durableObjects: Object.fromEntries(cfg.durableObjects.map((d) => [d.binding, { className: d.className, useSQLite: true }])),
    ratelimits: Object.fromEntries(cfg.ratelimits.map((r) => [r.binding, { namespace_id: r.namespaceId, simple: r.simple }])),
  };
}

function readConfig(id) {
  const file = path.join(bundleDir, id, "config.json");
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;
}

// Where this Mac's rooms live (runtime/share.mjs): null for this Mac, or another Mac's { host, hubPort }. The app
// sends it as Macs come and go; LUDVIG_ROOM_HOST=address:port sets it for development checks.
const FORWARDED = "x-ludvig-forwarded";
const parseRoomHost = (value) => {
  const m = /^([\w.-]+):(\d+)$/.exec(value || "");
  return m ? { host: m[1], hubPort: Number(m[2]) } : null;
};
let roomHost = parseRoomHost(process.env.LUDVIG_ROOM_HOST);
process.on("message", (msg) => {
  if (!msg || msg.type !== "roomHost") return;
  roomHost = msg.host ? { host: msg.host, hubPort: msg.hubPort } : null;
  log("rooms on", roomHost ? `${roomHost.host}:${roomHost.hubPort}` : "this Mac");
});
/** The other Mac stopped answering: keep playing on this one until the app finds it again. */
function roomHostFailed(remote) {
  if (roomHost !== remote) return;
  roomHost = null;
  log("room Mac unreachable, rooms on this Mac");
  if (process.send) process.send({ type: "roomHostDown" });
}
const remotePort = (remote, entry) => remote.hubPort + (entry.port - HUB.port);
/** The player's request as the room Mac gets it: no cookies or credentials, marked so it is not passed on again. */
function forwardHeaders(req) {
  const headers = { ...req.headers, [FORWARDED]: "1" };
  delete headers.cookie;
  delete headers.authorization;
  return headers;
}

const clientIp = (req) => String(req.socket.remoteAddress || "127.0.0.1").replace(/^::ffff:/, "");

// Other devices that opened a game on this Mac recently, so the host can see who joined (Play together panel).
const devices = new Map(); // ip -> { ip, kind, game, path, seen }
const DEVICE_TTL = 120e3;
const DEVICE_TOKEN = process.env.LUDVIG_DEVICE_TOKEN || "";

function deviceKind(ua = "") {
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Android/.test(ua)) return /Mobile/.test(ua) ? "Android phone" : "Android tablet";
  if (/Electron\//.test(ua)) return "Mac with the app";
  if (/Macintosh/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows PC";
  if (/CrOS/.test(ua)) return "Chromebook";
  return "Device";
}

function noteDevice(req, entry) {
  if (req.headers[FORWARDED]) return; // room traffic from another Mac, its players are listed there
  const ip = clientIp(req);
  if (ip === "127.0.0.1" || ip === "::1" || ip === lanAddress()) return;
  const accept = String(req.headers.accept || "");
  const known = devices.get(ip);
  const page = accept.includes("text/html");
  devices.set(ip, {
    ip,
    kind: deviceKind(String(req.headers["user-agent"] || "")),
    game: page || !known ? entry.id : known.game,
    path: page || !known ? new URL(req.url, "http://x").pathname : known.path,
    seen: Date.now(),
  });
}

function activeDevices() {
  const now = Date.now();
  for (const [ip, d] of devices) if (now - d.seen > DEVICE_TTL) devices.delete(ip);
  return [...devices.values()].sort((a, b) => b.seen - a.seen);
}

export let hostName = os.hostname().replace(/\.local$/, "");
try {
  hostName = (await import("node:child_process")).execFileSync("/usr/sbin/scutil", ["--get", "ComputerName"], { encoding: "utf8" }).trim() || hostName;
} catch {}

// How to play together, per game (runtime/together.json), for the guest notice and the host's panel.
function loadTogether() {
  try {
    return JSON.parse(fs.readFileSync(path.join(here, "together.json"), "utf8"));
  } catch {
    return {};
  }
}
const TOGETHER = loadTogether();
const HINTS = Object.fromEntries(Object.entries(TOGETHER).map(([id, t]) => [id, t.hint && t.hint.replace(/"([^"]+)"/g, "“$1”")]).filter(([, h]) => h));
const INVITES = Object.fromEntries(Object.entries(TOGETHER).map(([id, t]) => [id, t.online && t.online.inviteParam]).filter(([, p]) => p));

function desktopScript(entries, entry) {
  const cfg = {
    sites: entries.map((e) => ({ site: e.site, port: e.port })),
    lan: lanAddress(),
    host: hostName,
    game: entry.id,
    hints: HINTS,
    invites: INVITES,
  };
  return `const LUDVIG_DESKTOP = ${JSON.stringify(cfg)};\n${INJECT}`;
}

/** One proxy per game: the network-facing port that forwards to Miniflare or to the Ritkaos server. */
function startProxy(entry, target, entries) {
  const headersFor = (req) => {
    const headers = { ...req.headers, "accept-encoding": "identity" };
    const ip = clientIp(req);
    if (target.kind === "worker") {
      headers.host = `127.0.0.1:${target.port}`;
      headers["x-ludvig-game"] = entry.id;
      headers["x-ludvig-origin"] = `http://${req.headers.host || `127.0.0.1:${entry.port}`}`;
      headers["x-ludvig-ip"] = ip;
      if (target.presentAs) headers["x-ludvig-present-as"] = target.presentAs;
    } else {
      headers["cf-connecting-ip"] = ip;
    }
    return headers;
  };

  const tag = '<script src="/__ludvig-desktop.js"></script>';
  const inject = (source) => {
    // The site's Cloudflare analytics beacon would count desktop plays as website visits; leave it out.
    const html = source.replace(/<script[^>]*static\.cloudflareinsights\.com[^>]*><\/script>/g, "");
    const head = /<head[^>]*>/i.exec(html);
    return head ? html.slice(0, head.index + head[0].length) + tag + html.slice(head.index + head[0].length) : tag + html;
  };
  const toWorker = target.kind === "worker" ? workerRoutes(target.workerFirst) : null;
  // Only plain pages get the script tag. The React games hydrate their whole document, and an extra tag makes
  // hydration fail (React error 418); in the app, app/preload-content.cjs adds the script to them instead.
  const injectHtml = entry.id === "hub" || target.kind === "node" ? inject : (html) => html;

  const server = http.createServer((req, res) => {
    if (req.url === "/__ludvig/devices") {
      // Only the app on this Mac may ask who is connected: a loopback connection, a loopback Host (so a web page
      // cannot reach it through DNS rebinding) and the per-launch token the app passed to this process.
      const ip = clientIp(req);
      const hostOk = [`127.0.0.1:${entry.port}`, `localhost:${entry.port}`].includes(String(req.headers.host || ""));
      const tokenOk = Boolean(DEVICE_TOKEN) && req.headers["x-ludvig-token"] === DEVICE_TOKEN;
      if ((ip !== "127.0.0.1" && ip !== "::1") || !hostOk || !tokenOk) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(JSON.stringify({ devices: activeDevices() }));
      return;
    }
    noteDevice(req, entry);
    if (req.url === "/__ludvig-desktop.js") {
      res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-store" });
      res.end(desktopScript(entries, entry));
      return;
    }
    const pathname = new URL(req.url, "http://local").pathname;
    if (toWorker && !toWorker(pathname)) {
      if (req.method !== "GET" && req.method !== "HEAD") {
        res.writeHead(405, { Allow: "GET, HEAD" });
        res.end();
        return;
      }
      serveStatic(target.client, req, res, injectHtml);
      return;
    }
    const local = (body) => toLocal(req, res, body);
    const remote = roomHost && !req.headers[FORWARDED] && sharedPath(entry, target.kind, pathname) ? roomHost : null;
    if (remote) forward(req, res, remote, local);
    else local(null);
  });

  // This Mac's own Worker or Ritkaos server. `body` is the request body when it was already read (a request that
  // could not reach the room Mac), otherwise the request is streamed.
  function toLocal(req, res, body) {
    const upstream = http.request(
      { host: "127.0.0.1", port: target.port, method: req.method, path: req.url, headers: headersFor(req) },
      (up) => {
        const type = String(up.headers["content-type"] || "");
        const encoded = up.headers["content-encoding"] && up.headers["content-encoding"] !== "identity";
        if (req.method !== "GET" || !type.includes("text/html") || encoded) {
          res.writeHead(up.statusCode, up.headers);
          up.pipe(res);
          return;
        }
        const chunks = [];
        up.on("data", (c) => chunks.push(c));
        up.on("end", () => {
          const html = injectHtml(Buffer.concat(chunks).toString("utf8"));
          const headers = { ...up.headers };
          delete headers["content-length"];
          delete headers["transfer-encoding"];
          headers["content-length"] = Buffer.byteLength(html);
          res.writeHead(up.statusCode, headers);
          res.end(html);
        });
        up.on("error", () => res.destroy());
      },
    );
    upstream.on("error", () => {
      if (!res.headersSent) res.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("This game is still starting. Try again in a moment.");
    });
    if (body) upstream.end(body);
    else req.pipe(upstream);
  }

  // Room traffic to the Mac that holds the rooms, unchanged (its Host and Origin stay this Mac's address, which is
  // what the player's page uses). If that Mac does not answer within two seconds, the request is served here.
  function forward(req, res, remote, fallback) {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const body = Buffer.concat(chunks);
      const up = http.request(
        { host: remote.host, port: remotePort(remote, entry), method: req.method, path: req.url, headers: forwardHeaders(req), agent: false },
        (r) => {
          // Room answers are data. The other Mac cannot hand this Mac's address a page or set its cookies.
          if (/html|xml|javascript/i.test(String(r.headers["content-type"] || ""))) {
            r.resume();
            res.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" });
            res.end("Unexpected answer from the Mac with the rooms.");
            return;
          }
          const headers = { ...r.headers, "x-content-type-options": "nosniff" };
          delete headers["set-cookie"];
          res.writeHead(r.statusCode, headers);
          r.pipe(res);
        },
      );
      up.on("socket", (s) => {
        const timer = setTimeout(() => up.destroy(new Error("no answer")), 2000);
        s.once("connect", () => clearTimeout(timer));
        s.once("close", () => clearTimeout(timer));
      });
      up.on("error", () => {
        if (res.headersSent) { res.destroy(); return; }
        roomHostFailed(remote);
        fallback(body);
      });
      up.end(body);
    });
  }

  server.on("upgrade", (req, socket, head) => {
    let pathname = "/";
    try { pathname = new URL(req.url, "http://local").pathname; } catch {}
    const remote = roomHost && !req.headers[FORWARDED] && sharedPath(entry, target.kind, pathname) ? roomHost : null;
    const local = () => {
      const headers = headersFor(req);
      delete headers["accept-encoding"];
      tunnel(net.connect(target.port, "127.0.0.1"), headers);
    };
    // Sends the upgrade request on `up` once it connects, then joins the two sockets.
    const tunnel = (up, headers, onFail) => {
      let open = false;
      const timer = onFail ? setTimeout(() => up.destroy(new Error("no answer")), 2000) : null;
      up.once("connect", () => {
        open = true;
        clearTimeout(timer);
        let raw = `${req.method} ${req.url} HTTP/1.1\r\n`;
        for (const [k, v] of Object.entries(headers)) {
          for (const value of Array.isArray(v) ? v : [v]) raw += `${k}: ${value}\r\n`;
        }
        up.write(raw + "\r\n");
        if (head && head.length) up.write(head);
        socket.pipe(up).pipe(socket);
      });
      const close = () => { socket.destroy(); up.destroy(); };
      up.on("error", () => {
        clearTimeout(timer);
        if (!open && onFail) { up.destroy(); onFail(); return; }
        close();
      });
      up.on("close", () => { if (open || !onFail) close(); });
      socket.on("error", close);
      socket.on("close", () => { if (open || !onFail) up.destroy(); });
    };
    if (!remote) { local(); return; }
    tunnel(net.connect(remotePort(remote, entry), remote.host), forwardHeaders(req), () => {
      roomHostFailed(remote);
      local();
    });
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(entry.port, bind, () => resolve(server));
  });
}

function startRitkaos(cfg) {
  const main = path.join(bundleDir, "ritkaos", cfg.main);
  const child = spawn(process.execPath, [main], {
    cwd: path.dirname(main),
    env: { ...process.env, PORT: String(RITKAOS_INTERNAL_PORT), ELECTRON_RUN_AS_NODE: "1" },
    stdio: ["ignore", "ignore", "inherit"],
  });
  child.on("exit", (code) => log("ritkaos exited", code));
  // If this runtime dies without cleaning up, take Ritkaos down with it.
  process.on("exit", () => child.kill());
  return child;
}

export async function start() {
  const entries = ALL.map((e) => ({ ...e, cfg: readConfig(e.id) })).filter((e) => e.cfg);
  const workers = entries.filter((e) => e.cfg.kind === "worker");
  fs.mkdirSync(dataDir, { recursive: true });

  const mf = new Miniflare({
    host: "127.0.0.1",
    port: 0,
    log: undefined,
    d1Persist: path.join(dataDir, "d1"),
    durableObjectsPersist: path.join(dataDir, "do"),
    cache: false,
    workers: [
      {
        name: "router",
        modules: [{ type: "ESModule", path: path.join(here, "router.mjs"), contents: ROUTER_SOURCE }],
        compatibilityDate: "2026-05-15",
        serviceBindings: Object.fromEntries(workers.map((e) => [workerName(e.id), workerName(e.id)])),
      },
      ...workers.map((e) => workerOptions(e, e.cfg)),
    ],
  });
  const url = await mf.ready;
  const mfPort = Number(url.port);
  log("workers ready", url.href);

  for (const e of workers) {
    for (const d of e.cfg.d1) {
      const db = await mf.getD1Database(d.binding, workerName(e.id));
      const files = e.cfg.migrations.filter((m) => m.startsWith(d.binding + "/"));
      await applyMigrations(db, path.join(bundleDir, e.id, "migrations"), files);
    }
  }

  const children = [];
  const servers = [];
  for (const e of entries) {
    let target;
    if (e.cfg.kind === "worker") {
      target = {
        kind: "worker",
        port: mfPort,
        presentAs: e.cfg.presentAs,
        workerFirst: e.cfg.assets.workerFirst,
        client: path.join(bundleDir, e.id, "client"),
      };
    }
    else {
      children.push(startRitkaos(e.cfg));
      target = { kind: "node", port: RITKAOS_INTERNAL_PORT };
    }
    try {
      servers.push(await startProxy(e, target, entries));
    } catch (err) {
      log(`could not open port ${e.port} for ${e.id}:`, err.code || err.message);
    }
  }

  const info = {
    type: "ready",
    games: entries.map((e) => ({ id: e.id, name: e.name, port: e.port })),
    lan: lanAddress(),
  };
  log("ready", JSON.stringify(info));

  const stop = async () => {
    for (const s of servers) s.close();
    for (const c of children) c.kill();
    await mf.dispose().catch(() => {});
  };
  return { info, stop };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { info, stop } = await start();
  if (process.send) process.send(info);
  let stopping = false;
  const exit = async () => {
    if (stopping) return;
    stopping = true;
    await stop();
    process.exit(0);
  };
  process.on("SIGTERM", exit);
  process.on("SIGINT", exit);
  process.on("disconnect", exit);
}
