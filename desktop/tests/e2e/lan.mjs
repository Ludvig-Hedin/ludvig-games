// End-to-end check against a running runtime (node runtime/server.mjs), in headless installed Chrome.
// Two separate browser profiles stand in for two devices: one opens the games as the host Mac does
// (127.0.0.1), the other through a different address (localhost), like a phone on the Wi-Fi.
// Run: agent-heavy-run browser node tests/e2e/lan.mjs <screenshot dir>
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const out = process.argv[2] || "e2e-out";
const OFF = Number(process.argv[3] || 0); // port offset (LUDVIG_PORT_OFFSET of the runtime)
fs.mkdirSync(out, { recursive: true });
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`);
};

const within = (promise, ms, label) =>
  Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out`)), ms))]);

const browser = await chromium.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--disable-features=WebRtcHideLocalIpsWithMdns"],
});

try {
  const host = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const guest = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  // Offline, like a Mac without internet: anything that is not this computer fails at once.
  for (const ctx of [host, guest]) {
    await ctx.route("**/*", (route) => {
      const u = route.request().url();
      if (/^(https?|wss?):\/\/(127\.0\.0\.1|localhost)[:/]/.test(u) || u.startsWith("data:") || u.startsWith("blob:")) return route.continue();
      return route.abort("internetdisconnected");
    });
  }
  const a = await host.newPage();
  const b = await guest.newPage();
  const errors = [];
  for (const p of [a, b]) p.on("pageerror", (e) => errors.push(String(e)));

  // 1. Hub room service: create on the host, join from the guest, then a direct message both ways.
  await a.goto(`http://127.0.0.1:${47800 + OFF}/pigeon/`, { waitUntil: "domcontentloaded" });
  await b.goto(`http://localhost:${47800 + OFF}/pigeon/`, { waitUntil: "domcontentloaded" });
  const code = await a.evaluate(async () => {
    const room = await window.Ludvig.mp.create({ game: "pigeon", max: 4 });
    window.__got = [];
    room.on("message", (from, data) => window.__got.push(data));
    window.__room = room;
    return room.code;
  });
  check("hub room created", /^[A-Z0-9]{4}$/.test(code), code);
  const joined = await b.evaluate(async (code) => {
    const room = await window.Ludvig.mp.join({ game: "pigeon", room: code });
    window.__got = [];
    room.on("message", (from, data) => window.__got.push(data));
    window.__room = room;
    return room.peers.length;
  }, code);
  check("guest joined the room", joined === 2, `${joined} players`);
  await b.evaluate(() => window.__room.send({ t: "hello", from: "guest" }, { reliable: true }));
  await a.evaluate(() => window.__room.send({ t: "hello", from: "host" }, { reliable: true }));
  const got = async (p) => p.waitForFunction(() => window.__got.length > 0, null, { timeout: 15000 }).then(() => true, () => false);
  check("host received the guest's message directly", await got(a));
  check("guest received the host's message directly", await got(b));
  await a.evaluate(() => window.__room.leave());
  await b.evaluate(() => window.__room.leave());

  // 2. Scores are saved on the host.
  const score = await a.evaluate(async () => window.Ludvig.score("pigeon", 1234, { toast: false }));
  check("score saved", score && score.ok === true, JSON.stringify(score));

  // 3. Links to a public game site open the local copy.
  await a.goto(`http://127.0.0.1:${47800 + OFF}/`, { waitUntil: "domcontentloaded" });
  await a.evaluate(() => {
    const link = document.createElement("a");
    link.href = "https://chess.ludvighedin.com/";
    link.id = "__chess";
    link.textContent = "chess";
    document.body.prepend(link);
  });
  await Promise.all([a.waitForURL(new RegExp(String(47812 + OFF)), { timeout: 10000 }).catch(() => {}), a.click("#__chess")]);
  check("public game link opens the local copy", a.url().startsWith(`http://127.0.0.1:${47812 + OFF}/`), a.url());

  // 4. Invite links copied on the host get its network address.
  await host.grantPermissions(["clipboard-read", "clipboard-write"], { origin: `http://127.0.0.1:${47800 + OFF}` });
  await a.goto(`http://127.0.0.1:${47800 + OFF}/`, { waitUntil: "domcontentloaded" });
  const copied = await a.evaluate(async (port) => {
    await navigator.clipboard.writeText(`http://127.0.0.1:${port}/?room=ABC234`);
    return navigator.clipboard.readText();
  }, 47807 + OFF);
  const lan = await (await fetch(`http://127.0.0.1:${47800 + OFF}/__ludvig-desktop.js`)).text().then((t) => JSON.parse(/LUDVIG_DESKTOP = (.*?);\n/.exec(t)[1]).lan);
  check("copied invite uses the network address", lan ? copied === `http://${lan}:${47807 + OFF}/?room=ABC234` : copied.includes("127.0.0.1"), copied);

  // 5. Air Hockey's own room service (Durable Object), asked the way the page asks (same Origin). Asked from
  // here rather than from the page: software WebGL can keep the page too busy to answer in time.
  const airOrigin = `http://127.0.0.1:${47807 + OFF}`;
  const air = await fetch(`${airOrigin}/api/rooms`, {
    method: "POST",
    headers: { Origin: airOrigin },
    body: JSON.stringify({ name: "Host", targetScore: 5 }),
  }).then(async (r) => ({ status: r.status, body: await r.json() }), (e) => ({ status: 0, body: { error: e.message } }));
  check("Air Hockey room created", air.status === 200 && Boolean(air.body.code), JSON.stringify(air.body).slice(0, 120));

  // 6. Every game renders.
  const pages = [
    ["hub", `http://127.0.0.1:${47800 + OFF}/`],
    ["ritkaos", `http://127.0.0.1:${47801 + OFF}/`],
    ["salvo", `http://127.0.0.1:${47802 + OFF}/`],
    ["hangd", `http://127.0.0.1:${47803 + OFF}/`],
    ["little-links", `http://127.0.0.1:${47804 + OFF}/`],
    ["color-clash", `http://127.0.0.1:${47805 + OFF}/`],
    ["ludo", `http://127.0.0.1:${47806 + OFF}/`],
    ["air-hockey", `http://127.0.0.1:${47807 + OFF}/`],
    ["hoop-rush", `http://127.0.0.1:${47808 + OFF}/`],
    ["gravity-arena", `http://127.0.0.1:${47809 + OFF}/`],
    ["ox", `http://127.0.0.1:${47810 + OFF}/`],
    ["table-tennis", `http://127.0.0.1:${47811 + OFF}/`],
    ["chess", `http://127.0.0.1:${47812 + OFF}/`],
    ["mind-games", `http://127.0.0.1:${47813 + OFF}/`],
    ["powder", `http://127.0.0.1:${47800 + OFF}/powder/`],
  ];
  for (const [name, url] of pages) {
    const page = await host.newPage();
    const pageErrors = [];
    const failed = [];
    page.on("pageerror", (e) => pageErrors.push(String(e).slice(0, 160)));
    page.on("requestfailed", (r) => {
      const u = r.url();
      if (u.startsWith("http://127.0.0.1") || u.startsWith("http://localhost")) failed.push(u);
    });
    page.on("response", (r) => {
      const u = r.url();
      if (r.status() >= 400 && (u.startsWith("http://127.0.0.1") || u.startsWith("http://localhost"))) failed.push(`${r.status()} ${u}`);
    });
    const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 }).catch((e) => ({ status: () => String(e).slice(0, 80) }));
    await page.waitForTimeout(2500);
    // Software WebGL can make a screenshot slow; a missing picture is not a failure.
    await page.screenshot({ path: path.join(out, `${name}.png`), timeout: 15000 }).catch(() => console.log(`  (no screenshot of ${name})`));
    const ok = res && res.status() === 200 && pageErrors.length === 0 && failed.length === 0;
    check(`${name} renders`, ok, [res && res.status(), ...pageErrors, ...failed].filter((x) => x !== 200).join(" | "));
    await page.close();
  }
  if (errors.length) console.log("page errors during room test:", errors.slice(0, 5));
} finally {
  await browser.close();
  fs.writeFileSync(path.join(out, "results.json"), JSON.stringify(results, null, 2));
}
process.exit(results.every((r) => r.ok) ? 0 : 1);
