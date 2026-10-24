// Screenshots pages in headless Chrome. Usage: node tests/e2e/shot.mjs <out dir> <name>=<url>[@phone][!click-selector] ...
import { chromium } from "playwright-core";
const [out, ...items] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--mute-audio"] });
for (const item of items) {
  const [name, rest] = item.split(/=(.*)/s);
  const [urlPart, click] = rest.split("!");
  const phone = urlPart.endsWith("@phone");
  const url = urlPart.replace(/@phone$/, "");
  const ctx = await browser.newContext(phone ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 860 } });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded" }).catch(() => {});
  await page.waitForTimeout(2500);
  if (click) { await page.click(click).catch((e) => console.log("click failed", e.message)); await page.waitForTimeout(600); }
  await page.screenshot({ path: `${out}/${name}.png`, timeout: 20000 }).catch((e) => console.log("no shot", name, e.message));
  await ctx.close();
}
await browser.close();
