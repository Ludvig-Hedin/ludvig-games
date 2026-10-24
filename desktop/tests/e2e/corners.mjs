// Finds, for every hub game, a corner where the "All games" button covers none of the game's own controls or
// text, on a desktop and a phone screen. Usage: node tests/e2e/corners.mjs <base url> <out.json>
import fs from "node:fs";
import { chromium } from "playwright-core";

const [base, out] = process.argv.slice(2);
const games = JSON.parse(fs.readFileSync(new URL("../../../ludvig-games/games.json", import.meta.url)));
const list = (Array.isArray(games) ? games : games.games).filter((g) => !g.hidden && !g.external).map((g) => g.slug);
const ORDER = ["tl", "bl", "tr", "br"];
const browser = await chromium.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--mute-audio"],
});
const sizes = [
  { name: "desktop", viewport: { width: 1280, height: 800 } },
  { name: "phone", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
];
const result = {};
for (const size of sizes) {
  const ctx = await browser.newContext(size);
  await ctx.route("**/*", (r) => (r.request().url().startsWith(base) || /^(data|blob):/.test(r.request().url()) ? r.continue() : r.abort()));
  for (const slug of list) {
    const page = await ctx.newPage();
    try {
      await page.goto(`${base}/${slug}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForTimeout(3500);
      const busy = await page.evaluate(() => {
        const vw = innerWidth, vh = innerHeight;
        const ours = (el) => el.closest && el.closest('a[aria-label="All games"]');
        const occupied = (el) => {
          if (!el || ours(el) || el === document.body || el === document.documentElement || el.tagName === "CANVAS") return false;
          const r = el.getBoundingClientRect();
          if (r.width * r.height > vw * vh * 0.5) return false; // a full-screen layer, not a control
          const style = getComputedStyle(el);
          if (style.visibility === "hidden" || Number(style.opacity) < 0.05) return false;
          if (el.closest("a,button,input,select,textarea,label,[role=button],[onclick],[tabindex]")) return true;
          if (["IMG", "SVG", "svg", "VIDEO"].includes(el.tagName)) return true;
          return Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim());
        };
        const box = (corner) => {
          const xs = corner[1] === "l" ? [10, 30, 52] : [vw - 52, vw - 30, vw - 10];
          const ys = corner[0] === "t" ? [10, 30, 52] : [vh - 52, vh - 30, vh - 10];
          return xs.some((x) => ys.some((y) => occupied(document.elementFromPoint(x, y))));
        };
        return Object.fromEntries(["tl", "tr", "bl", "br"].map((c) => [c, box(c)]));
      });
      result[slug] = result[slug] || {};
      result[slug][size.name] = busy;
    } catch (e) {
      result[slug] = { ...(result[slug] || {}), [size.name]: { error: String(e.message).slice(0, 80) } };
    }
    await page.close();
  }
  await ctx.close();
}
await browser.close();
const pick = {};
for (const [slug, r] of Object.entries(result)) {
  const free = ORDER.filter((c) => r.desktop && r.phone && r.desktop[c] === false && r.phone[c] === false);
  pick[slug] = free[0] || null;
}
fs.writeFileSync(out, JSON.stringify({ pick, result }, null, 2));
console.log(JSON.stringify(pick));
