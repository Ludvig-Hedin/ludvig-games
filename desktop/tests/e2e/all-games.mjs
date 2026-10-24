// Opens every hub game and every Worker game offline in headless Chrome and lists page errors and failed
// local requests. Needs a running runtime. Usage: node tests/e2e/all-games.mjs [port offset]
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const offset = Number(process.argv[2] || 0);
const hubDir = path.join(path.dirname(new URL(import.meta.url).pathname), "../../bundle/hub/client");
const skip = new Set(["assets", "games", "me"]);
const slugs = fs.readdirSync(hubDir, { withFileTypes: true })
  .filter((e) => e.isDirectory() && !skip.has(e.name) && fs.existsSync(path.join(hubDir, e.name, "index.html")))
  .map((e) => e.name);
const urls = [
  ...slugs.map((s) => [s, `http://127.0.0.1:${47800 + offset}/${s}/`]),
  ...Array.from({ length: 13 }, (_, i) => [`port-${47801 + i}`, `http://127.0.0.1:${47801 + i + offset}/`]),
];

const browser = await chromium.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--mute-audio"],
});
const ctx = await browser.newContext({ viewport: { width: 1100, height: 700 } });
await ctx.route("**/*", (r) => (/^(https?|wss?):\/\/127\.0\.0\.1[:/]/.test(r.request().url()) || /^(data|blob):/.test(r.request().url()) ? r.continue() : r.abort("internetdisconnected")));
const report = [];
for (const [name, url] of urls) {
  const page = await ctx.newPage();
  const problems = [];
  page.on("pageerror", (e) => problems.push("error: " + String(e.message || e).slice(0, 140)));
  page.on("response", (r) => { if (r.status() >= 400 && r.url().startsWith("http://127.0.0.1")) problems.push(`${r.status()} ${new URL(r.url()).pathname}`); });
  page.on("requestfailed", (r) => { if (r.url().startsWith("http://127.0.0.1")) problems.push(`failed ${new URL(r.url()).pathname}`); });
  let status = 0;
  try {
    const res = await page.goto(url, { waitUntil: "commit", timeout: 30000 });
    status = res ? res.status() : 0;
    await page.waitForTimeout(4500);
  } catch (e) { problems.push("load: " + String(e.message).slice(0, 80)); }
  const ok = status === 200 && problems.length === 0;
  report.push({ name, ok, status, problems });
  console.log(`${ok ? "OK  " : "FAIL"} ${name} ${problems.join(" | ")}`);
  await page.close().catch(() => {});
}
await browser.close();
const bad = report.filter((r) => !r.ok);
console.log(`\n${report.length - bad.length}/${report.length} loaded without errors`);
process.exit(bad.length ? 1 : 0);
