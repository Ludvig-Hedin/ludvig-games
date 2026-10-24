// Horde co-op on one runtime: host on 127.0.0.1, guest on the LAN address, both tap Co-op → Quick match.
// Run: agent-heavy-run browser bun run browser-test:horde <out dir> <port offset>
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const out = process.argv[2] || "e2e-out";
const OFF = Number(process.argv[3] || 0);
const GUEST = process.argv[4] || "127.0.0.1";
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--disable-features=WebRtcHideLocalIpsWithMdns"],
});
try {
  const hub = 47800 + OFF;
  const a = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  const b = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  await a.goto(`http://127.0.0.1:${hub}/deadblock/`, { waitUntil: "domcontentloaded" });
  await b.goto(`http://${GUEST}:${hub}/deadblock/`, { waitUntil: "domcontentloaded" });
  for (const p of [a, b]) {
    await p.waitForSelector("#coopBtn:not(.hidden)", { timeout: 20000 });
    await p.click("#coopBtn");
    await p.click("#quickBtn");
  }
  for (const p of [a, b]) await p.waitForSelector("#coopRoom:not(.hidden)", { timeout: 15000 }).catch(() => {});
  await a.waitForTimeout(1500);
  const read = (p) => p.evaluate(() => ({ code: document.getElementById("roomCode")?.textContent, players: [...document.querySelectorAll("#roomPlayers li")].map((li) => li.textContent), msg: document.getElementById("coopMsg")?.textContent }));
  console.log("host", JSON.stringify(await read(a)));
  console.log("guest", JSON.stringify(await read(b)));
  await a.screenshot({ path: path.join(out, "horde-host.png") }).catch(() => {});
  await b.screenshot({ path: path.join(out, "horde-guest.png") }).catch(() => {});
  if (await a.$("#coopGo:not(.hidden)")) {
    await a.click("#coopGo");
    await a.waitForTimeout(4000);
    const stats = (p) => p.evaluate(() => window.deadblock && window.deadblock.stats);
    console.log("host stats", JSON.stringify(await stats(a)));
    console.log("guest stats", JSON.stringify(await stats(b)));
    await a.screenshot({ path: path.join(out, "horde-host-run.png") }).catch(() => {});
    await b.screenshot({ path: path.join(out, "horde-guest-run.png") }).catch(() => {});
  }
} finally {
  await browser.close();
}
