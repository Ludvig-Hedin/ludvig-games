// Builds every game into bundle/ for the desktop app, from private copies under .stage/.
// The original game folders are only read, never written. Usage:
//   node scripts/stage.mjs            build everything that is missing
//   node scripts/stage.mjs ox chess   rebuild only these (hub, ritkaos or a game slug)
// Runs one build at a time with a Node heap limit, then removes the copy's node_modules.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GAMES } from "../runtime/games.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const gamesDir = path.resolve(root, "..");
const stageDir = path.join(root, ".stage");
const bundleDir = path.join(root, "bundle");
const npmCache = path.join(process.env.TMPDIR || "/tmp", "npm-cache");
const EXCLUDE = ["node_modules", "dist", ".wrangler", ".vinext", ".next", "output", ".DS_Store", "tsconfig.tsbuildinfo", "video"];

const only = process.argv.slice(2);
const wanted = (id) => (only.length ? only.includes(id) : !fs.existsSync(path.join(bundleDir, id, "config.json")));

function run(cmd, args, cwd, env = {}) {
  console.log(`  $ ${cmd} ${args.join(" ")}`);
  execFileSync(cmd, args, {
    cwd,
    stdio: "inherit",
    env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=2048", CI: "1", ...env },
  });
}

function copySource(from, to) {
  // rsync --delete mirrors the source and clears old build output without removing the folder itself.
  fs.mkdirSync(to, { recursive: true });
  run("rsync", ["-a", "--delete", ...EXCLUDE.flatMap((e) => ["--exclude", e]), `${from}/`, `${to}/`], root);
}

function copyDir(from, to) {
  fs.rmSync(to, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.cpSync(from, to, { recursive: true, dereference: true });
}

function listSql(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
}

function writeConfig(id, data) {
  fs.writeFileSync(path.join(bundleDir, id, "config.json"), JSON.stringify(data, null, 2) + "\n");
}

/** Reads a wrangler.jsonc (comments allowed) without a parser dependency. */
function readJsonc(file) {
  const text = fs.readFileSync(file, "utf8");
  let out = "", inStr = false, esc = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], n = text[i + 1];
    if (inStr) { out += c; if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') { inStr = true; out += c; continue; }
    if (c === "/" && n === "/") { while (i < text.length && text[i] !== "\n") i++; out += "\n"; continue; }
    if (c === "/" && n === "*") { i += 2; while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i++; i++; continue; }
    out += c;
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, "$1"));
}

/** A vinext game: npm ci, build, then keep dist/server (Worker), dist/client (assets) and the SQL migrations. */
function stageVinext(game) {
  const src = path.join(gamesDir, game.id);
  const work = path.join(stageDir, game.id);
  console.log(`\n== ${game.id}`);
  copySource(src, work);
  if (fs.existsSync(path.join(work, "pnpm-lock.yaml"))) {
    run("pnpm", ["install", "--frozen-lockfile"], work);
  } else {
    run("npm", ["ci", "--no-audit", "--no-fund", "--fetch-retries=6", "--fetch-timeout=180000", "--cache", npmCache], work);
  }
  run("npm", ["run", "build"], work);
  const redirected = path.join(work, "dist/server/wrangler.json");
  let built, serverDir, clientDir;
  if (fs.existsSync(redirected)) {
    // The Vite plugin's own Worker build and resolved config.
    built = JSON.parse(fs.readFileSync(redirected, "utf8"));
    serverDir = path.join(work, "dist/server");
    clientDir = path.resolve(serverDir, built.assets.directory);
  } else {
    // A static export plus worker/index.ts: let Wrangler bundle it without deploying anything.
    built = readJsonc(path.join(work, "wrangler.jsonc"));
    serverDir = path.join(work, "dist/worker");
    run("npx", ["wrangler", "deploy", "--dry-run", "--outdir", serverDir], work);
    built.main = "index.js";
    clientDir = path.resolve(work, built.assets.directory);
  }
  const out = path.join(bundleDir, game.id);
  fs.rmSync(out, { recursive: true, force: true });
  copyDir(serverDir, path.join(out, "server"));
  copyDir(clientDir, path.join(out, "client"));
  const d1 = built.d1_databases || [];
  const migrations = [];
  for (const db of d1) {
    const dir = path.join(work, db.migrations_dir || "migrations");
    for (const f of listSql(dir)) {
      fs.mkdirSync(path.join(out, "migrations", db.binding), { recursive: true });
      fs.copyFileSync(path.join(dir, f), path.join(out, "migrations", db.binding, f));
      migrations.push(`${db.binding}/${f}`);
    }
  }
  writeConfig(game.id, {
    kind: "worker",
    main: `server/${built.main}`,
    compatibilityDate: built.compatibility_date,
    compatibilityFlags: built.compatibility_flags || [],
    assets: {
      binding: built.assets.binding,
      notFound: built.assets.not_found_handling,
      html: built.assets.html_handling,
      workerFirst: built.assets.run_worker_first || [],
    },
    d1: d1.map((d) => ({ binding: d.binding, name: d.database_name })),
    migrations,
    durableObjects: (built.durable_objects?.bindings || []).map((b) => ({ binding: b.name, className: b.class_name })),
    ratelimits: (built.ratelimits || []).map((r) => ({ binding: r.name, namespaceId: r.namespace_id, simple: r.simple })),
    vars: built.vars || {},
  });
  fs.rmSync(path.join(work, "node_modules"), { recursive: true, force: true });
}

/** The hub: build.py (Python standard library) with a same-origin API, then its plain ESM Worker. */
function stageHub() {
  const src = path.join(gamesDir, "ludvig-games");
  const work = path.join(stageDir, "hub");
  console.log("\n== hub");
  copySource(src, work);
  run("python3", ["build.py"], work, { LUDVIG_API_BASE: "" });
  const cfg = readJsonc(path.join(work, "wrangler.jsonc"));
  // The API Worker config holds the rate limiters the hub script requires.
  cfg.ratelimits = readJsonc(path.join(work, "wrangler.api.jsonc")).ratelimits;
  const out = path.join(bundleDir, "hub");
  fs.rmSync(out, { recursive: true, force: true });
  copyDir(path.join(work, "worker"), path.join(out, "server"));
  copyDir(path.join(work, cfg.assets.directory), path.join(out, "client"));
  const db = cfg.d1_databases[0];
  const migrations = [];
  for (const f of listSql(path.join(work, db.migrations_dir))) {
    fs.mkdirSync(path.join(out, "migrations", db.binding), { recursive: true });
    fs.copyFileSync(path.join(work, db.migrations_dir, f), path.join(out, "migrations", db.binding, f));
    migrations.push(`${db.binding}/${f}`);
  }
  writeConfig("hub", {
    kind: "worker",
    main: `server/${path.basename(cfg.main)}`,
    compatibilityDate: cfg.compatibility_date,
    compatibilityFlags: cfg.compatibility_flags || [],
    assets: {
      binding: cfg.assets.binding,
      notFound: cfg.assets.not_found_handling,
      html: cfg.assets.html_handling,
      workerFirst: cfg.assets.run_worker_first || [],
    },
    d1: [{ binding: db.binding, name: db.database_name }],
    migrations,
    durableObjects: cfg.durable_objects.bindings.map((b) => ({ binding: b.name, className: b.class_name })),
    ratelimits: (cfg.ratelimits || []).map((r) => ({ binding: r.name, namespaceId: r.namespace_id, simple: r.simple })),
    vars: cfg.vars || {},
    // The hub API only answers its public origin; the runtime presents requests as coming from it.
    presentAs: "https://games.ludvighedin.com",
  });
}

/** Ritkaos: a dependency-free Node server, copied as is. */
function stageRitkaos() {
  console.log("\n== ritkaos");
  const out = path.join(bundleDir, "ritkaos");
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  for (const part of ["server.mjs", "lib", "public", "package.json"]) {
    fs.cpSync(path.join(gamesDir, "ritkaos", part), path.join(out, "app", part), { recursive: true });
  }
  writeConfig("ritkaos", { kind: "node", main: "app/server.mjs" });
}

fs.mkdirSync(stageDir, { recursive: true });
fs.mkdirSync(bundleDir, { recursive: true });
if (wanted("hub")) stageHub();
for (const game of GAMES) {
  if (!wanted(game.id)) continue;
  if (game.id === "ritkaos") stageRitkaos();
  else stageVinext(game);
}
console.log("\nDone. Bundle:", bundleDir);
