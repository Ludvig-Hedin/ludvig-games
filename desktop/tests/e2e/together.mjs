// Play together on one runtime: for each multiplayer game a host (127.0.0.1) and a guest (the LAN address, a
// different origin like a phone) follow the game's online flow, and the check collects evidence that both end up in
// one room and see each other: room code and player count (hub games read Ludvig.mp rooms), page text, screenshots.
// Run: agent-heavy-run browser bun run browser-test:together <out dir> <port offset> <guest host> [game ids...]
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const out = process.argv[2] || "e2e-out";
const OFF = Number(process.argv[3] || 0);
const GUEST = process.argv[4] || "127.0.0.1";
const only = process.argv.slice(5);
fs.mkdirSync(out, { recursive: true });

const together = JSON.parse(fs.readFileSync(new URL("../../runtime/together.json", import.meta.url), "utf8"));
const PORTS = { ritkaos: 1, salvo: 2, hangd: 3, "little-links": 4, "color-clash": 5, ludo: 6, "air-hockey": 7, "hoop-rush": 8, "gravity-arena": 9, ox: 10, "table-tennis": 11, chess: 12, "mind-games": 13 };
const url = (id, host) => (PORTS[id] ? `http://${host}:${47800 + OFF + PORTS[id]}/` : `http://${host}:${47800 + OFF}/${id}/`) + (GAMES[id]?.hash || "");

/* Steps: "Label" clicks a visible control with that text (or aria-label/title); {opt:"Label"} clicks only if it
   shows up; {fill:selector, value}; {key}; {wait:ms}; {draw:selector} scribbles on a canvas; {js:"code"} runs code.
   quick games: host runs steps, then the guest runs the same steps (minus host-only `start`), then the host taps
   `start`. invite games: host runs steps, the guest opens ?param=CODE and runs `guest`, the host taps `start`.
   `after` runs on both once the match should be going; `settle` is extra wait before the play screenshots. */
const NAME = (n) => [{ fill: "input:not([type=hidden]):not([type=checkbox]):not([readonly])", value: n, opt: true }];
const GAMES = {
  pigeon: { steps: ["Play online", "Quick match"] },
  "flappy-first-person": { steps: ["Race", "Quick race"], start: ["Start race"] },
  "vibe-coder-tycoon": { pre: [{ opt: "Start" }], steps: ["Coworkers", "Find coworkers"] },
  "anything-arena": { steps: ["Online", "Quick match"], start: ["Start picking"], after: [{ opt: "Lock in" }] },
  deadblock: { steps: ["Co-op", "QUICK MATCH"], start: ["START"] },
  "citrus-circuit-coastline": { steps: ["Race online", "Quick race"], start: ["Start race"] },
  overtime: { steps: ["ONLINE", "QUICK MATCH"], start: [{ opt: "START MATCH" }], probe: "const n=window.__overtime.net();return {peers:n.peers,cars:n.cars.map(c=>`${c.name}${c.bot?' (bot)':''} t${c.team}${c.proxy?' remote':''}`)}" },
  "six-clues": { pre: [{ opt: "Let’s play" }], steps: ["Friends", "Quick match"], settle: 12000 },
  "higher-or-lower": { steps: ["Game options", "Duel", "Quick match"], settle: 12000 },
  "slither-afterglow": { steps: ["Play online", "Quick match"], probe: "return window.slither.getState().online", after: [{ opt: "Play again" }], settle: 2000 },
  stacklight: { steps: ["Versus", "Quick match"], settle: 6000 },
  "heatwave-san-sol-remastered": { steps: ["Play online", "Quick match"], hash: "#qa", probe: "const q=window.__game.net.qa();return {peers:q.room&&q.room.peers,remotes:q.remotes}" },
  "pulse-shift": { steps: ["Race", "Quick match"], start: ["Start race"], startWait: 300, settle: 900, probe: "return {marks:document.getElementById('raceMarks').children.length,label:document.getElementById('practiceLabel').textContent}" },
  "slope-overdrive": { steps: ["RACE", "QUICK MATCH"], start: ["START RACE"] },
  "vice-run": { steps: ["ONLINE", "QUICK MATCH"], after: [{ opt: "BACK TO THE CITY" }] },
  overrun: { steps: ["PLAY ONLINE", "QUICK MATCH"], start: ["START MATCH"], after: [{ opt: "JOIN MATCH" }], probe: "const s=window.__overrun.snapshot();return {state:s.state,pos:s.pos,net:JSON.stringify(s.net).slice(0,600)}" },
  "velvet-pool": { steps: ["Online", "Quick match"] },
  afterglow: { steps: ["ONLINE", "LET’S DRIVE", "QUICK RACE"], start: ["START RACE"] },
  cage: { steps: ["ONLINE", "QUICK MATCH"] },
  kiln: { steps: ["Play online", "Co-op waves", "Quick match"], start: ["Start mission"], after: [{ opt: "Join match" }], probe: "return {me:typeof player!=='undefined'?[player.x,player.z]:null,tags:[...document.querySelectorAll('#tags > *')].map(e=>e.textContent+(e.style.display==='none'?' (hidden)':''))}" },
  lastlight: { steps: ["Play with a friend", "QUICK MATCH"], start: ["DROP IN"] },
  mosslight: { steps: ["Build with friends", "Quick match"], after: [{ opt: "Enter world", timeout: 30000 }], probe: "return {me:typeof player!=='undefined'?[player.x,player.z]:null,tags:[...document.querySelectorAll('.coop-tag')].map(e=>e.textContent+(e.style.display==='none'?' (hidden)':''))}" },
  cubeville: { steps: ["Online", "Quick match"], after: [{ opt: "Play" }], probe: "const s=window.cubeville.stats;return {pos:s.pos,online:s.online}" },
  "last-drop": { steps: ["Online", "Quick match"], start: ["Start match"] },
  "draw-your-horse": { pre: [{ horse: true }], steps: [{ a11y: "DEN ÄR EN HÄST." }, { a11y: "Tävla online" }, { a11y: "SNABBMATCH" }], start: [{ a11y: "STARTA LOPPET" }], settle: 8000 },
  "under-sail": { steps: ["Sail online", "Quick match"] },
  "ashfall-84-wasteland": { steps: ["PLAY ONLINE", "QUICK MATCH"], start: ["START RUN"], hostAfter: [{ drag: [420, 0] }], guestAfter: [{ drag: [-420, 0] }], settle: 2500 },
  ritkaos: { steps: ["Quick match"], settle: 25000 },

  "air-hockey": { invite: true, steps: ["Play a friend", "New room", "Create room"], guest: [{ opt: "Join" }], hostAfter: [{ move: [[640, 600], [520, 560], [760, 520], [460, 500]] }], settle: 1500 },
  chess: { invite: true, steps: ["Online", "Create a private room"], guest: [...NAME("Guest"), { opt: "Join game" }] },
  "color-clash": { invite: true, pre: NAME("Host"), steps: ["Play Friends", "Create a room", ...NAME("Host"), "Create room"], guest: [...NAME("Guest"), { opt: "Join room" }], start: ["Deal us in"] },
  "gravity-arena": { invite: true, steps: ["Play a friend", "Create a room", "Create private room"], guest: [{ opt: "Take a seat" }] },
  hangd: { invite: true, steps: [...NAME("Hosty"), "Create a room"], guest: [...NAME("Guesty"), { opt: "Join the room" }], start: ["Start"] },
  "hoop-rush": { invite: true, steps: ["Online", "Create room"], guest: [{ opt: "Join" }], after: [{ opt: "Ready" }] },
  "little-links": { invite: true, steps: ["Online", "Create a room", ...NAME("Hosty"), { last: "Create a room" }], guest: [...NAME("Guesty"), { opt: "Join the round" }], start: ["Everyone in? Let’s play"] },
  ludo: { invite: true, steps: ["Online", ...NAME("Hosty"), "Create room"], guest: [...NAME("Guesty"), { opt: "Join the table" }], start: ["Start the game"] },
  "mind-games": { invite: true, steps: ["Play Friend", "Create private room"], guest: [{ last: "Join room" }], settle: 3000 },
  ox: { invite: true, steps: ["Play Friend", "Create a private room"], guest: [{ opt: "Join" }] },
  salvo: { invite: true, steps: ["Play Friend", "Create private room"], guest: [{ opt: "Join" }] },
  "table-tennis": { invite: true, steps: ["Play a friend", "Create room"], guest: [{ opt: "Join" }], start: ["Start match"] },
};

// Captures every Ludvig.mp room the page opens (window.__rooms), so the check can read code and peers.
const SPY = () => {
  window.__rooms = [];
  const wrap = (L) => {
    const mp = L && L.mp;
    if (!mp || mp.__spied) return;
    for (const k of ["join", "create"]) {
      const fn = mp[k];
      if (typeof fn !== "function") continue;
      mp[k] = async function (...args) {
        const room = await fn.apply(this, args);
        try {
          window.__rooms.push(room);
          room.__got = {};
          room.on("message", (from) => { room.__got[from] = (room.__got[from] || 0) + 1; });
        } catch {}
        return room;
      };
    }
    try { mp.__spied = true; } catch {}
  };
  let value;
  try {
    Object.defineProperty(window, "Ludvig", { configurable: true, get: () => value, set: (v) => { value = v; wrap(v); } });
  } catch {}
};

const norm = (s) => String(s || "").replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim().toLowerCase();

// Finds a visible control whose text, aria-label or title matches; marks it so Playwright can click it.
async function mark(frame, label, last = false) {
  return frame.evaluate(([want, last]) => {
    const norm = (s) => String(s || "").replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim().toLowerCase();
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return false;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.display === "none" || Number(cs.opacity) === 0) return false;
      if (el.closest("[hidden],[aria-hidden=true],.hidden")) return false;
      if (el.disabled) return false;
      return r.right > 0 && r.left < innerWidth;
    };
    document.querySelectorAll("[data-tg]").forEach((e) => e.removeAttribute("data-tg"));
    const sel = "button, a, [role=button], [role=tab], [role=menuitem], [role=radio], input[type=button], input[type=submit], label, summary, [onclick], [tabindex], .btn, .button";
    const all = [...document.querySelectorAll(sel)].filter(visible);
    const text = (el) => norm(el.innerText || el.value || "");
    const strip = (s) => s.replace(/[^\p{L}\p{N}' ?.]/gu, "").trim();
    const tests = [
      (el) => text(el) === want,
      (el) => strip(text(el)) === strip(want),
      (el) => norm(el.getAttribute("aria-label")) === want || norm(el.title) === want,
      (el) => text(el).startsWith(want) && text(el).length < want.length + 24,
      (el) => text(el).includes(want) && text(el).length < want.length + 40,
    ];
    for (const t of tests) {
      const hits = all.filter(t);
      if (hits.length && last) { hits.at(-1).setAttribute("data-tg", "1"); return true; }
      if (hits.length) {
        hits.sort((a, b) => a.getBoundingClientRect().width * a.getBoundingClientRect().height - b.getBoundingClientRect().width * b.getBoundingClientRect().height);
        hits[0].setAttribute("data-tg", "1");
        return true;
      }
    }
    // Any element whose own text is the label (custom clickable divs).
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
    for (let el = walker.currentNode; el; el = walker.nextNode()) {
      if (el.children.length > 2 || !visible(el)) continue;
      if (text(el) === want && getComputedStyle(el).cursor === "pointer") { el.setAttribute("data-tg", "1"); return true; }
    }
    return false;
  }, [norm(label), last]);
}

async function click(page, label, { timeout = 15000, opt = false, last = false } = {}) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    for (const frame of page.frames()) {
      let found = false;
      try { found = await mark(frame, label, last); } catch { continue; }
      if (found) {
        try {
          await frame.click("[data-tg]", { timeout: 3000 });
        } catch {
          await frame.evaluate(() => document.querySelector("[data-tg]")?.click()).catch(() => {});
        }
        return true;
      }
    }
    await page.waitForTimeout(400);
  }
  if (!opt) throw new Error(`no "${label}"`);
  return false;
}

async function run(page, steps, log) {
  for (const s of steps || []) {
    if (typeof s === "string") { await click(page, s); log.push(`click ${s}`); await page.waitForTimeout(600); continue; }
    if (s.last) { await click(page, s.last, { last: true }); log.push(`click last ${s.last}`); await page.waitForTimeout(600); continue; }
    if (s.opt && !s.fill) { const ok = await click(page, s.opt, { timeout: s.timeout || 4000, opt: true }); log.push(`${ok ? "click" : "skip"} ${s.opt}`); if (ok) await page.waitForTimeout(600); continue; }
    if (s.fill) {
      const el = await page.$(`${s.fill} >> visible=true`).catch(() => null);
      if (el) { await el.fill(s.value).catch(() => {}); log.push(`fill ${s.value}`); } else if (!s.opt) log.push(`no field ${s.fill}`);
      continue;
    }
    if (s.key) { await page.keyboard.press(s.key); continue; }
    if (s.a11y) {
      // Canvas-drawn UI that mirrors its buttons into hidden DOM buttons (#controls).
      const want = norm(s.a11y);
      let ok = false;
      for (let i = 0; i < 30 && !ok; i++) {
        ok = await page.evaluate((want) => {
          const norm = (x) => String(x || "").replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim().toLowerCase();
          const b = [...document.querySelectorAll("#controls button")].find((el) => norm(el.textContent) === want && !el.disabled);
          if (b) b.click();
          return !!b;
        }, want).catch(() => false);
        if (!ok) await page.waitForTimeout(500);
      }
      log.push(`${ok ? "click" : "missing"} ${s.a11y}`);
      if (!ok && !s.opt) throw new Error(`no "${s.a11y}"`);
      await page.waitForTimeout(600);
      continue;
    }
    if (s.horse) {
      const rect = await page.evaluate(() => { const c = document.querySelector("canvas").getBoundingClientRect(); return typeof drawRect !== "undefined" && drawRect ? { x: c.left + drawRect.x, y: c.top + drawRect.y, w: drawRect.w, h: drawRect.h } : null; }).catch(() => null);
      if (rect) {
        const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2, r = Math.min(rect.w, rect.h) / 4;
        await page.mouse.move(cx - r, cy);
        await page.mouse.down();
        for (let i = 0; i <= 40; i++) await page.mouse.move(cx - r + (2 * r * i) / 40, cy + Math.sin(i / 3) * r * 0.5, { steps: 2 });
        await page.mouse.up();
        log.push("drew horse");
      } else log.push("no drawRect");
      continue;
    }
    if (s.wait) { await page.waitForTimeout(s.wait); continue; }
    if (s.drag) {
      const [dx, dy] = s.drag;
      await page.mouse.move(640, 400);
      await page.mouse.down();
      for (let i = 1; i <= 20; i++) await page.mouse.move(640 + (dx * i) / 20, 400 + (dy * i) / 20);
      await page.mouse.up();
      log.push(`dragged ${dx},${dy}`);
      continue;
    }
    if (s.move) { for (const [x, y] of s.move) { await page.mouse.move(x, y, { steps: 8 }); await page.waitForTimeout(150); } log.push("moved mouse"); continue; }
    if (s.js) { await page.evaluate(s.js).catch((e) => log.push(`js error ${e.message}`)); continue; }
    if (s.draw) {
      const box = await page.locator(`${s.draw} >> visible=true`).first().boundingBox().catch(() => null);
      if (box) {
        const cx = box.x + box.width / 2, cy = box.y + box.height / 2, r = Math.min(box.width, box.height) / 4;
        await page.mouse.move(cx - r, cy);
        await page.mouse.down();
        for (let i = 0; i <= 40; i++) await page.mouse.move(cx - r + (2 * r * i) / 40, cy + Math.sin(i / 3) * r * 0.5);
        await page.mouse.up();
        log.push("drew");
      } else log.push("no canvas");
    }
  }
}

// Everything the page can tell about its room.
const evidence = (page, probe) =>
  page.evaluate((probe) => {
    let game;
    try { game = probe ? new Function(probe)() : undefined; } catch (e) { game = "probe error " + e.message; }
    const rooms = (window.__rooms || []).filter((r) => r && !r.closed).map((r) => ({ code: r.code, peers: (r.peers || []).map((p) => p.name), host: r.host === r.self?.id, got: Object.entries(r.__got || {}).map(([id, n]) => `${(r.peers || []).find((p) => p.id === id)?.name || id}:${n}`), gone: r.gone ? r.gone.size : 0 }));
    return { url: location.href, rooms, game, text: (document.body?.innerText || "").replace(/\s+/g, " ").slice(0, 400) };
  }, probe).catch((e) => ({ error: String(e.message || e) }));

// Room code for invite games: the page URL, a code the page's API returned, or a code on screen.
async function readCode(page, codes, param) {
  for (let i = 0; i < 20; i++) {
    const fromUrl = await page.evaluate((param) => new URLSearchParams(location.search).get(param), param).catch(() => null);
    if (fromUrl) return fromUrl.toUpperCase();
    if (codes.length) return codes[codes.length - 1];
    await page.waitForTimeout(500);
  }
  const text = await page.evaluate(() => document.body.innerText).catch(() => "");
  const words = new Set(["JOIN", "ROOM", "CODE", "LINK", "COPY", "INVITE", "FRIENDS", "CREATE", "PLAY", "ONLINE"]);
  for (const m of text.matchAll(/(?:code|room|rum)[^A-Z0-9]{0,20}([A-Z0-9]{4,8})\b/gi)) if (!words.has(m[1].toUpperCase())) return m[1].toUpperCase();
  return null;
}

const watchCodes = (page, codes) => {
  const take = (v) => { if (typeof v === "string" && /^[A-Z0-9]{4,8}$/.test(v)) codes.push(v); };
  page.on("websocket", (ws) => { try { const u = new URL(ws.url()); for (const k of ["room", "code"]) take(u.searchParams.get(k)?.toUpperCase()); const m = u.pathname.match(/\/([A-Z0-9]{4,8})(?:\/|$)/); if (m) take(m[1]); } catch {} });
  page.on("response", async (r) => {
    if (!/json/.test(r.headers()["content-type"] || "") || r.request().method() !== "POST") return;
    try { const j = await r.json(); for (const k of ["code", "room", "roomCode", "roomId"]) take(j?.[k]); take(j?.room?.code); } catch {}
  });
};

const browser = await chromium.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--disable-features=WebRtcHideLocalIpsWithMdns", "--mute-audio", "--autoplay-policy=no-user-gesture-required"],
});
const ids = only.length ? only : Object.keys(together);
const results = [];
try {
  for (const id of ids) {
    const cfg = GAMES[id];
    const info = together[id];
    if (!cfg || !info) { console.log(`?? ${id}: no config`); continue; }
    const r = { id, log: { host: [], guest: [] }, errors: [] };
    const ctxs = [];
    try {
      const mk = async (side) => {
        const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: "en-US" });
        ctxs.push(ctx);
        await ctx.addInitScript(SPY);
        await ctx.route("**/*", (route) => {
          const u = route.request().url();
          if (/^(https?|wss?):\/\/(127\.0\.0\.1|localhost|192\.168\.\d+\.\d+)[:/]/.test(u) || /^(data|blob):/.test(u)) return route.continue();
          return route.abort("internetdisconnected");
        });
        const p = await ctx.newPage();
        p.on("pageerror", (e) => r.errors.push(String(e.message || e).slice(0, 160)));
        p.on("console", (m) => { if (["error", "warning"].includes(m.type()) && r.errors.length < 30) r.errors.push(`${side} ${m.type()}: ${m.text().slice(0, 160)}`); });
        return p;
      };
      const a = await mk("host");
      const b = await mk("guest");
      const codes = [];
      watchCodes(a, codes);
      await a.goto(url(id, "127.0.0.1"), { waitUntil: "commit", timeout: 30000 });
      await a.waitForTimeout(2500);
      await run(a, cfg.pre, r.log.host);
      await run(a, cfg.steps, r.log.host);
      await a.waitForTimeout(1500);
      if (cfg.invite) {
        r.code = await readCode(a, codes, info.online.inviteParam);
        r.log.guest.push(`code ${r.code}`);
        const u = new URL(url(id, GUEST));
        if (r.code) u.searchParams.set(info.online.inviteParam, r.code);
        await b.goto(u.href, { waitUntil: "commit", timeout: 30000 });
        await b.waitForTimeout(3000);
        await run(b, cfg.guest, r.log.guest);
      } else {
        await b.goto(url(id, GUEST), { waitUntil: "commit", timeout: 30000 });
        await b.waitForTimeout(2500);
        await run(b, cfg.pre, r.log.guest);
        await run(b, cfg.steps, r.log.guest);
      }
      await a.waitForTimeout(3000);
      r.lobby = { host: await evidence(a, cfg.probe), guest: await evidence(b, cfg.probe) };
      await a.screenshot({ path: path.join(out, `${id}-1-host-lobby.png`) }).catch(() => {});
      await b.screenshot({ path: path.join(out, `${id}-1-guest-lobby.png`) }).catch(() => {});
      await run(a, cfg.start, r.log.host).catch((e) => r.log.host.push(`start failed: ${e.message}`));
      await a.waitForTimeout(cfg.startWait ?? 2000);
      for (const [p, l] of [[a, r.log.host], [b, r.log.guest]]) await run(p, cfg.after, l).catch((e) => l.push(`after failed: ${e.message}`));
      await run(a, cfg.hostAfter, r.log.host).catch((e) => r.log.host.push(`hostAfter failed: ${e.message}`));
      await run(b, cfg.guestAfter, r.log.guest).catch((e) => r.log.guest.push(`guestAfter failed: ${e.message}`));
      await a.waitForTimeout(cfg.settle || 5000);
      r.play = { host: await evidence(a, cfg.probe), guest: await evidence(b, cfg.probe) };
      await a.screenshot({ path: path.join(out, `${id}-2-host-play.png`) }).catch(() => {});
      await b.screenshot({ path: path.join(out, `${id}-2-guest-play.png`) }).catch(() => {});
    } catch (e) {
      r.failed = String(e.message || e).split("\n")[0];
      for (const [i, c] of ctxs.entries()) {
        const p = c.pages()[0];
        if (p) { r[i ? "guestAtFail" : "hostAtFail"] = await evidence(p); await p.screenshot({ path: path.join(out, `${id}-x-${i ? "guest" : "host"}-fail.png`) }).catch(() => {}); }
      }
    } finally {
      for (const c of ctxs) await c.close().catch(() => {});
    }
    const room = (side) => { const rs = (r.play || r.lobby || {})[side]?.rooms || []; return rs.length ? `${rs.at(-1).code}:${rs.at(-1).peers.length}` : "-"; };
    console.log(`${r.failed ? "FAIL" : "DONE"} ${id} host ${room("host")} guest ${room("guest")}${r.failed ? " — " + r.failed : ""}`);
    results.push(r);
    fs.writeFileSync(path.join(out, `${id}.json`), JSON.stringify(r, null, 2));
  }
} finally {
  await browser.close();
}
