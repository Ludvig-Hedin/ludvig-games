// Two Macs, one set of rooms (runtime/share.mjs). Needs two runtimes: the room Mac and one started with
// LUDVIG_ROOM_HOST=127.0.0.1:<room Mac's hub port>. Players on either one must meet in the same rooms.
// Run: agent-heavy-run browser bun run browser-test:federation <out dir> <room Mac offset> <other Mac offset>
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const out = process.argv[2] || "e2e-out";
const A = Number(process.argv[3] || 0); // holds the rooms
const B = Number(process.argv[4] || 100); // passes room traffic to A
const MODE = process.argv[5] || "shared"; // "local": B's room Mac is gone, B keeps its own rooms
fs.mkdirSync(out, { recursive: true });
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`);
};

const browser = await chromium.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--disable-features=WebRtcHideLocalIpsWithMdns"],
});
const hub = (off) => `http://127.0.0.1:${47800 + off}`;

try {
  const ctxA = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const ctxB = await browser.newContext({ viewport: { width: 1280, height: 800 } });

  if (MODE === "local") {
    // B's room Mac does not answer: B's own rooms still work.
    const b = await ctxB.newPage();
    await b.goto(`${hub(B)}/pigeon/`, { waitUntil: "domcontentloaded" });
    const code = await b.evaluate(async () => (await window.Ludvig.mp.create({ game: "pigeon", max: 4 })).code).catch((e) => String(e));
    check("room made on this Mac when the room Mac is gone", /^[A-Z0-9]{4}$/.test(code), code);
  } else {
    // 1. Hub rooms (Ludvig.mp): made on Mac B, joined from Mac A, messages both ways.
    const a = await ctxA.newPage();
    const b = await ctxB.newPage();
    await a.goto(`${hub(A)}/pigeon/`, { waitUntil: "domcontentloaded" });
    await b.goto(`${hub(B)}/pigeon/`, { waitUntil: "domcontentloaded" });
    const code = await b.evaluate(async () => {
      const room = await window.Ludvig.mp.create({ game: "pigeon", max: 4 });
      window.__got = [];
      room.on("message", (from, data) => window.__got.push(data));
      window.__room = room;
      return room.code;
    });
    const peers = await a.evaluate(async (code) => {
      const room = await window.Ludvig.mp.join({ game: "pigeon", room: code });
      window.__got = [];
      room.on("message", (from, data) => window.__got.push(data));
      window.__room = room;
      return room.peers.length;
    }, code).catch((e) => String(e));
    check("hub room made on B is joined from A", peers === 2, `${code}: ${peers}`);
    await a.evaluate(() => window.__room && window.__room.send({ t: "hi" }, { reliable: true }));
    await b.evaluate(() => window.__room && window.__room.send({ t: "hi" }, { reliable: true }));
    const got = (p) => p.waitForFunction(() => window.__got && window.__got.length > 0, null, { timeout: 15000 }).then(() => true, () => false);
    check("A hears B", await got(a));
    check("B hears A", await got(b));
    await a.evaluate(() => window.__room && window.__room.leave());
    await b.evaluate(() => window.__room && window.__room.leave());

    // 2. Horde, through its own menus: private room on B, code typed on A.
    await b.goto(`${hub(B)}/deadblock/`, { waitUntil: "domcontentloaded" });
    await a.goto(`${hub(A)}/deadblock/`, { waitUntil: "domcontentloaded" });
    for (const p of [a, b]) await p.waitForSelector("#coopBtn:not(.hidden)", { timeout: 20000 });
    await b.click("#coopBtn");
    await b.click("#createBtn");
    await b.waitForSelector("#coopRoom:not(.hidden)", { timeout: 15000 });
    const horde = await b.textContent("#roomCode");
    await a.click("#coopBtn");
    await a.fill("#codeInput", horde);
    await a.click("#joinBtn");
    await a.waitForSelector("#coopRoom:not(.hidden)", { timeout: 15000 }).catch(() => {});
    await a.waitForTimeout(1500);
    const players = (p) => p.$$eval("#roomPlayers li", (li) => li.length);
    check("Horde lobby shows both players on B", (await players(b)) === 2, `${await players(b)}`);
    check("Horde lobby shows both players on A", (await players(a)) === 2, `${await players(a)}`);
    await b.click("#coopGo").catch(() => {});
    await b.waitForTimeout(4000);
    // Software WebGL is slow; give each side up to 20 s to hear the other's first pose.
    const peersIn = (p) => p.waitForFunction(() => window.deadblock && window.deadblock.stats.peers, null, { timeout: 20000 }).then((h) => h.jsonValue(), () => 0);
    check("Horde run: B sees A", (await peersIn(b)) === 1);
    check("Horde run: A sees B", (await peersIn(a)) === 1);
    await a.screenshot({ path: path.join(out, "federation-horde-a.png") }).catch(() => {});
    await b.screenshot({ path: path.join(out, "federation-horde-b.png") }).catch(() => {});

    // 3. A separate game (Air Hockey): a room made through B exists on A.
    const air = (off) => `http://127.0.0.1:${47807 + off}`;
    const made = await fetch(`${air(B)}/api/rooms`, { method: "POST", headers: { Origin: air(B) }, body: JSON.stringify({ name: "B", targetScore: 5 }) })
      .then((r) => r.json(), (e) => ({ error: e.message }));
    check("Air Hockey room made through B", Boolean(made.code), JSON.stringify(made).slice(0, 100));
    const open = (base) => a.evaluate((url) => new Promise((resolve) => {
      const ws = new WebSocket(url);
      ws.onopen = () => { ws.close(); resolve("open"); };
      ws.onerror = () => resolve("error");
      setTimeout(() => resolve("timeout"), 5000);
    }), base);
    await a.goto(`${air(A)}/`, { waitUntil: "domcontentloaded" });
    check("Air Hockey room from B opens on A", (await open(`ws://127.0.0.1:${47807 + A}/api/rooms/${made.code}/ws`)) === "open");

    // 4. Scores stay on each Mac.
    const meA = await fetch(`${hub(A)}/api/scores?game=pigeon`).then((r) => r.status, () => 0);
    check("scores still answer on A", meA === 200 || meA === 400, String(meA));
  }
} finally {
  await browser.close();
  fs.writeFileSync(path.join(out, "federation.json"), JSON.stringify(results, null, 2));
}
process.exit(results.every((r) => r.ok) ? 0 : 1);
