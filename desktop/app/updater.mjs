// In-app updates from the GitHub releases (owner request 24 Oct 2026: update without reinstalling).
// Squirrel-style auto-update needs a Developer ID signature, so this does it by hand: check the latest release,
// download its zip, unpack it next to the running app, then swap the app bundle after quitting and reopen it.
// Saved games, rooms and scores live in Application Support and are not touched.
import { app } from "electron";
import { spawn, execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

const REPO = "Ludvig-Hedin/ludvig-games";
const ASSET = `Ludvig-Games-mac-${process.arch === "arm64" ? "arm64" : "x64"}.zip`;

/** "0.10.2" > "0.9.9". Tags may start with "v". */
export function newer(remote, local) {
  const parse = (v) => String(v).replace(/^v/, "").split(".").map((n) => parseInt(n, 10) || 0);
  const a = parse(remote), b = parse(local);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0);
  }
  return false;
}

/** The running .app bundle, or null when the app cannot replace itself (not packaged, or run from the DMG or
    a quarantined Downloads copy that macOS has moved to a read-only "translocated" path). */
export function bundlePath() {
  if (!app.isPackaged) return null;
  const exe = app.getPath("exe");
  const bundle = exe.slice(0, exe.indexOf(".app/") + 4);
  if (!bundle.endsWith(".app") || bundle.includes("/AppTranslocation/") || bundle.startsWith("/Volumes/")) return null;
  try {
    fs.accessSync(path.dirname(bundle), fs.constants.W_OK);
  } catch {
    return null;
  }
  return bundle;
}

export async function checkForUpdate() {
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "LudvigGames-Updater" },
  });
  if (!res.ok) return null;
  const release = await res.json();
  const asset = (release.assets || []).find((a) => a.name === ASSET);
  if (!asset || !newer(release.tag_name, app.getVersion())) return null;
  return { version: String(release.tag_name).replace(/^v/, ""), url: asset.browser_download_url, size: asset.size };
}

const run = (cmd, args) =>
  new Promise((resolve, reject) => execFile(cmd, args, (err) => (err ? reject(err) : resolve())));

/** Downloads and unpacks the update. Calls onProgress(0..1). Returns the path of the unpacked new app. */
export async function downloadUpdate(update, onProgress) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ludvig-games-update-"));
  const zip = path.join(dir, ASSET);
  const res = await fetch(update.url, { headers: { "User-Agent": "LudvigGames-Updater" } });
  if (!res.ok || !res.body) throw new Error(`download failed (${res.status})`);
  const total = Number(res.headers.get("content-length")) || update.size || 0;
  let received = 0;
  const counted = Readable.fromWeb(res.body);
  counted.on("data", (chunk) => {
    received += chunk.length;
    if (total) onProgress(Math.min(1, received / total));
  });
  await pipeline(counted, fs.createWriteStream(zip));
  const out = path.join(dir, "app");
  await run("/usr/bin/ditto", ["-x", "-k", zip, out]);
  fs.rmSync(zip, { force: true });
  const name = fs.readdirSync(out).find((f) => f.endsWith(".app"));
  if (!name) throw new Error("no app in the update");
  const next = path.join(out, name);
  // Downloaded by the app itself, so macOS adds no quarantine; clear it anyway in case.
  await run("/usr/bin/xattr", ["-dr", "com.apple.quarantine", next]).catch(() => {});
  return next;
}

/** Quits, swaps the bundle once this process has exited, and opens the new version. */
export function installAndRestart(next, bundle) {
  const old = `${bundle}.old-${Date.now()}`;
  const script = [
    `while kill -0 ${process.pid} 2>/dev/null; do sleep 0.3; done`,
    `mv "$BUNDLE" "$OLD" && mv "$NEXT" "$BUNDLE" || { [ -d "$OLD" ] && [ ! -d "$BUNDLE" ] && mv "$OLD" "$BUNDLE"; }`,
    `rm -rf "$OLD"`,
    `open "$BUNDLE"`,
  ].join("\n");
  const child = spawn("/bin/sh", ["-c", script], {
    detached: true,
    stdio: "ignore",
    env: { ...process.env, BUNDLE: bundle, NEXT: next, OLD: old },
  });
  child.unref();
  app.quit();
}
