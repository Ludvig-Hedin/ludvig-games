// Ludvig Games for Mac. One window: a thin top bar (chrome view) above the games (content view).
// The games run on this Mac through runtime/server.mjs, offline. Friends on the same network join by opening
// this Mac's address (QR code in "Play together"), and Macs with the app find each other over Bonjour.
import { app, BaseWindow, WebContentsView, Menu, ipcMain, shell, clipboard, nativeTheme, session } from "electron";
import { spawn, execFileSync } from "node:child_process";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Bonjour } from "bonjour-service";
import QRCode from "qrcode";
import { HUB, GAMES, ALL } from "../runtime/games.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const BAR = 44;
const SERVICE = "ludvig-games";
const instanceId = crypto.randomUUID();
// Development check: run without showing a window, capture screenshots, then quit (scripts/selftest.mjs).
const SELFTEST = process.env.LUDVIG_SELFTEST || null;

// Direct connections between players: show real network addresses instead of hidden mDNS names, so WebRTC
// finds a route on a local network without internet.
app.commandLine.appendSwitch("disable-features", "WebRtcHideLocalIpsWithMdns");
app.setName("Ludvig Games");
nativeTheme.themeSource = "dark";

if (SELFTEST) {
  // Runs beside an installed copy: its own data folder, and LUDVIG_PORT_OFFSET for its own ports.
  app.setPath("userData", path.join(SELFTEST, "user-data"));
} else if (!app.requestSingleInstanceLock()) app.quit();

let win = null;
let chrome = null;
let content = null;
let runtime = null;
let bonjour = null;
let browser = null;
let lanAtPublish = null;

const state = {
  status: "starting", // starting | ready | failed
  lan: null,
  joined: null, // { name, address } when playing on another Mac
  nearby: [], // [{ id, name, address }]
  onHome: true, // the hub's start page: no "All games" button there
  tint: { r: 8, g: 8, b: 8 }, // colour of the top of the page, so the strip above it blends in
  panel: false,
  shareUrl: null,
  qr: null,
  fullscreen: false,
};

function computerName() {
  try {
    return execFileSync("/usr/sbin/scutil", ["--get", "ComputerName"], { encoding: "utf8" }).trim();
  } catch {
    return os.hostname().replace(/\.local$/, "");
  }
}

/** The address of the Mac whose games are on screen: this one, or the one we joined. */
const currentHost = () => (state.joined ? state.joined.address : "127.0.0.1");
const hubUrl = () => `http://${currentHost()}:${HUB.port}/`;
const gameUrl = (game) => `http://${currentHost()}:${game.port}/`;

function isLocalGameUrl(raw) {
  try {
    const url = new URL(raw);
    const hosts = new Set(["127.0.0.1", "localhost", state.lan, state.joined && state.joined.address].filter(Boolean));
    return url.protocol === "http:" && hosts.has(url.hostname) && ALL.some((g) => String(g.port) === url.port);
  } catch {
    return false;
  }
}

/** A public game address (https://chess.ludvighedin.com/...) mapped to the copy on the current host. */
function localFor(raw) {
  try {
    const url = new URL(raw);
    const game = ALL.find((g) => g.site === url.origin);
    return game ? `http://${currentHost()}:${game.port}${url.pathname}${url.search}${url.hash}` : null;
  } catch {
    return null;
  }
}

async function refreshShare() {
  state.lan = lanAddress();
  const current = content ? content.webContents.getURL() : "";
  let share = null;
  try {
    const url = new URL(current);
    if (isLocalGameUrl(current)) {
      if (url.hostname === "127.0.0.1" || url.hostname === "localhost") {
        if (state.lan) url.hostname = state.lan;
        else url.hostname = "";
      }
      share = url.hostname ? url.href : null;
    }
  } catch {}
  if (!share && state.lan && !state.joined) share = `http://${state.lan}:${HUB.port}/`;
  if (!share && state.joined) share = `http://${state.joined.address}:${HUB.port}/`;
  state.shareUrl = share;
  state.qr = share
    ? await QRCode.toString(share, { type: "svg", margin: 2, errorCorrectionLevel: "M", color: { dark: "#080808", light: "#f2f2f2" } })
    : null;
}

function lanAddress() {
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

function sendState() {
  if (chrome && !chrome.webContents.isDestroyed()) chrome.webContents.send("state", state);
}

function layout() {
  if (!win) return;
  const { width, height } = win.getContentBounds();
  const bar = state.fullscreen ? 0 : BAR;
  chrome.setVisible(!state.fullscreen);
  chrome.setBounds({ x: 0, y: 0, width, height: state.panel ? height : bar });
  content.setBounds({ x: 0, y: bar, width, height: Math.max(0, height - bar) });
}

async function setPanel(open) {
  state.panel = open;
  if (open) await refreshShare();
  // The chrome view grows over the games while the panel is open, so it can draw the panel and a backdrop.
  if (open) win.contentView.addChildView(chrome);
  layout();
  sendState();
  if (open) chrome.webContents.focus();
  else content.webContents.focus();
}

function isHubHome(raw) {
  try {
    const url = new URL(raw);
    return url.protocol === "file:" || (url.port === String(HUB.port) && url.pathname === "/");
  } catch {
    return true;
  }
}

// The strip above the game has no colour of its own: it copies the colour of the page's top edge.
let sampling = false;
async function sampleTint() {
  if (!content || sampling || state.fullscreen || !win || !win.isVisible() && !SELFTEST) return;
  sampling = true;
  try {
    const { width } = content.getBounds();
    const image = await content.webContents.capturePage({ x: 0, y: 0, width: Math.max(1, width), height: 2 });
    const bitmap = image.toBitmap(); // BGRA
    if (bitmap.length >= 4) {
      let r = 0, g = 0, b = 0, n = 0;
      const step = Math.max(4, Math.floor(bitmap.length / 4 / 64) * 4);
      for (let i = 0; i + 3 < bitmap.length; i += step) {
        b += bitmap[i]; g += bitmap[i + 1]; r += bitmap[i + 2]; n++;
      }
      const tint = { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n) };
      const t = state.tint;
      if (Math.abs(tint.r - t.r) + Math.abs(tint.g - t.g) + Math.abs(tint.b - t.b) > 3) {
        state.tint = tint;
        sendState();
      }
    }
  } catch {}
  sampling = false;
}
setInterval(sampleTint, 1200);

function navigate(url) {
  content.webContents.loadURL(url);
}

function join(peer) {
  state.joined = { name: peer.name, address: peer.address };
  setPanel(false);
  navigate(hubUrl());
  buildMenu();
}

function leave() {
  state.joined = null;
  setPanel(false);
  navigate(hubUrl());
  buildMenu();
}

// ---------- runtime ----------

function startRuntime() {
  state.status = "starting";
  sendState();
  const server = path.join(root, "runtime", "server.mjs");
  runtime = spawn(process.execPath, [server], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      LUDVIG_BUNDLE: path.join(root, "bundle"),
      LUDVIG_DATA: path.join(app.getPath("userData"), "games-data"),
    },
    stdio: ["ignore", "inherit", "inherit", "ipc"],
  });
  runtime.on("message", (msg) => {
    if (msg && msg.type === "ready") {
      state.status = "ready";
      state.lan = msg.lan;
      sendState();
      navigate(hubUrl());
      publish();
      if (SELFTEST) selftest();
    }
  });
  runtime.on("exit", (code) => {
    runtime = null;
    if (state.status !== "ready" || code) {
      state.status = "failed";
      sendState();
      content.webContents.loadFile(path.join(here, "pages", "failed.html"));
    }
  });
}

function stopRuntime() {
  if (runtime) {
    runtime.kill("SIGTERM");
    runtime = null;
  }
}

async function selftest() {
  const fs = await import("node:fs");
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const shot = async (name) => {
    const bar = await chrome.webContents.capturePage();
    const page = await content.webContents.capturePage();
    fs.writeFileSync(path.join(SELFTEST, `${name}-bar.png`), bar.toPNG());
    fs.writeFileSync(path.join(SELFTEST, `${name}-content.png`), page.toPNG());
  };
  const report = { steps: [] };
  try {
    await wait(4000);
    report.steps.push({ step: "hub", url: content.webContents.getURL(), title: content.webContents.getTitle() });
    await shot("hub");
    const target = process.env.LUDVIG_SELFTEST_GAME;
    if (target) {
      navigate(target);
      await wait(5000);
      const desktopScript = await content.webContents.executeJavaScript("Boolean(window.__ludvigDesktop)");
      report.steps.push({ step: "game", url: content.webContents.getURL(), title: content.webContents.getTitle(), desktopScript });
      await shot("game");
    }
    await setPanel(true);
    await wait(800);
    report.steps.push({ step: "panel", share: state.shareUrl, nearby: state.nearby.length });
    await shot("panel");
  } catch (err) {
    report.error = String(err && err.stack || err);
  }
  fs.writeFileSync(path.join(SELFTEST, "report.json"), JSON.stringify(report, null, 2));
  app.quit();
}

// ---------- nearby Macs ----------

function publish() {
  if (SELFTEST && !process.env.LUDVIG_SELFTEST_BONJOUR) return; // stay invisible to other Macs
  try {
    if (!bonjour) bonjour = new Bonjour();
    bonjour.unpublishAll();
    lanAtPublish = lanAddress();
    bonjour.publish({ name: `${computerName()} (${instanceId.slice(0, 4)})`, type: SERVICE, port: HUB.port, txt: { id: instanceId, name: computerName() } });
    if (browser) browser.stop();
    browser = bonjour.find({ type: SERVICE });
    const update = () => {
      const seen = new Map();
      for (const s of browser.services) {
        const id = s.txt && s.txt.id;
        if (!id || id === instanceId) continue;
        const address = (s.addresses || []).find((a) => /^\d+\.\d+\.\d+\.\d+$/.test(a)) || (s.referer && s.referer.address);
        if (!address) continue;
        seen.set(id, { id, name: (s.txt && s.txt.name) || s.name, address });
      }
      state.nearby = [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
      if (state.joined && !state.nearby.some((p) => p.address === state.joined.address)) {
        // Keep playing; the host may only have lost its Bonjour announcement.
      }
      sendState();
    };
    browser.on("up", update);
    browser.on("down", update);
  } catch (err) {
    console.error("[app] nearby discovery unavailable:", err.message);
  }
}

// The network can change (another Wi-Fi, waking from sleep). Announce again on the new address.
setInterval(() => {
  const now = lanAddress();
  if (state.status === "ready" && now !== lanAtPublish) {
    publish();
    state.lan = now;
    sendState();
  }
  if (browser) browser.update();
}, 15000);

// ---------- window ----------

function buildMenu() {
  const gameItems = [
    { label: "All Games", accelerator: "CmdOrCtrl+Shift+H", click: () => navigate(hubUrl()) },
    { type: "separator" },
    ...GAMES.map((g) => ({ label: g.name, click: () => navigate(gameUrl(g)) })),
  ];
  const template = [
    { role: "appMenu" },
    { role: "editMenu" },
    {
      label: "View",
      submenu: [
        { label: "Back", accelerator: "CmdOrCtrl+[", click: () => content.webContents.navigationHistory.goBack() },
        { label: "Forward", accelerator: "CmdOrCtrl+]", click: () => content.webContents.navigationHistory.goForward() },
        { label: "Reload", accelerator: "CmdOrCtrl+R", click: () => content.webContents.reload() },
        { type: "separator" },
        { label: "Actual Size", accelerator: "CmdOrCtrl+0", click: () => content.webContents.setZoomLevel(0) },
        { label: "Zoom In", accelerator: "CmdOrCtrl+Plus", click: () => content.webContents.setZoomLevel(content.webContents.getZoomLevel() + 0.5) },
        { label: "Zoom Out", accelerator: "CmdOrCtrl+-", click: () => content.webContents.setZoomLevel(content.webContents.getZoomLevel() - 0.5) },
        { type: "separator" },
        { role: "togglefullscreen" },
        ...(app.isPackaged ? [] : [{ label: "Developer Tools", accelerator: "Alt+CmdOrCtrl+I", click: () => content.webContents.openDevTools({ mode: "detach" }) }]),
      ],
    },
    { label: "Games", submenu: gameItems },
    {
      label: "Play Together",
      submenu: [
        { label: "Invite Friends…", accelerator: "CmdOrCtrl+J", click: () => setPanel(true) },
        ...(state.joined ? [{ label: "Back to My Games", click: leave }] : []),
      ],
    },
    { role: "windowMenu" },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  win = new BaseWindow({
    width: 1280,
    height: 820,
    minWidth: 760,
    minHeight: 520,
    title: "Ludvig Games",
    backgroundColor: "#080808",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 15 },
    show: !SELFTEST,
  });

  content = new WebContentsView({
    webPreferences: { preload: path.join(here, "preload-content.cjs"), sandbox: true, contextIsolation: true, backgroundThrottling: true, offscreen: Boolean(SELFTEST) },
  });
  content.setBackgroundColor("#080808");
  chrome = new WebContentsView({
    webPreferences: { preload: path.join(here, "preload-chrome.cjs"), sandbox: true, contextIsolation: true, offscreen: Boolean(SELFTEST) },
  });
  chrome.setBackgroundColor("#00000000");
  win.contentView.addChildView(content);
  win.contentView.addChildView(chrome);
  chrome.webContents.loadFile(path.join(here, "chrome", "index.html"));
  content.webContents.loadFile(path.join(here, "pages", "starting.html"));
  layout();

  win.on("resize", layout);
  win.on("enter-full-screen", () => { state.fullscreen = true; layout(); sendState(); });
  win.on("leave-full-screen", () => { state.fullscreen = false; layout(); sendState(); });
  win.on("closed", () => { win = null; });

  const wc = content.webContents;
  const update = () => {
    state.onHome = isHubHome(wc.getURL());
    sendState();
    sampleTint();
  };
  wc.on("did-finish-load", update);
  wc.on("page-title-updated", update);
  wc.on("did-navigate", update);
  wc.on("did-navigate-in-page", update);
  wc.on("enter-html-full-screen", () => { state.fullscreen = true; layout(); });
  wc.on("leave-html-full-screen", () => { state.fullscreen = win.isFullScreen(); layout(); });

  // Game links stay in the window; everything else (Wikipedia, credits) opens in the browser.
  wc.setWindowOpenHandler(({ url }) => {
    const local = localFor(url) || (isLocalGameUrl(url) ? url : null);
    if (local) navigate(local);
    else if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  wc.on("will-navigate", (event, url) => {
    if (url.startsWith("file:") || isLocalGameUrl(url)) return;
    event.preventDefault();
    const local = localFor(url);
    if (local) navigate(local);
    else if (/^https?:/.test(url)) shell.openExternal(url);
  });
  wc.on("before-input-event", (event, input) => {
    if (input.type === "keyDown" && input.key === "Escape" && state.panel) {
      event.preventDefault();
      setPanel(false);
    }
  });
  chrome.webContents.on("before-input-event", (event, input) => {
    if (input.type === "keyDown" && input.key === "Escape" && state.panel) {
      event.preventDefault();
      setPanel(false);
    }
  });

  buildMenu();
}

// Games ask for fullscreen, pointer lock, clipboard and sometimes the microphone. Allow those for the local
// games only.
function setupPermissions() {
  const allow = new Set(["fullscreen", "pointerLock", "clipboard-sanitized-write", "clipboard-read", "media", "keyboardLock", "midi"]);
  session.defaultSession.setPermissionRequestHandler((wc, permission, callback, details) => {
    callback(allow.has(permission) && isLocalGameUrl(details.requestingUrl || wc.getURL()));
  });
  session.defaultSession.setPermissionCheckHandler((wc, permission, origin) => allow.has(permission) && isLocalGameUrl(origin + "/"));
}

ipcMain.handle("state", () => state);
ipcMain.on("panel", (_e, open) => setPanel(Boolean(open)));
ipcMain.on("home", () => navigate(hubUrl()));
ipcMain.on("records", () => navigate(`http://${currentHost()}:${HUB.port}/me/`));
ipcMain.on("join", (_e, id) => {
  const peer = state.nearby.find((p) => p.id === id);
  if (peer) join(peer);
});
ipcMain.on("leave", () => leave());
ipcMain.on("copy", (_e, text) => clipboard.writeText(String(text)));
ipcMain.on("retry", () => {
  stopRuntime();
  startRuntime();
});

app.on("second-instance", () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.whenReady().then(() => {
  if (SELFTEST && app.dock) app.dock.hide();
  setupPermissions();
  createWindow();
  startRuntime();
});

app.on("window-all-closed", () => app.quit());
app.on("before-quit", () => {
  stopRuntime();
  try {
    if (bonjour) bonjour.unpublishAll(() => bonjour.destroy());
  } catch {}
});
