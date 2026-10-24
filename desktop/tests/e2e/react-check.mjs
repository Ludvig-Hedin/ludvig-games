// Loads a page offline and prints page errors, to compare a game with and without the desktop script.
import { chromium } from "playwright-core";
const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
for (const url of process.argv.slice(2)) {
  const ctx = await browser.newContext();
  await ctx.route("**/*", (r) => (/^https?:\/\/127\.0\.0\.1[:/]/.test(r.request().url()) ? r.continue() : r.abort()));
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e.message).slice(0, 100)));
  await page.goto(url, { waitUntil: "load" }).catch(() => {});
  await page.waitForTimeout(3000);
  console.log(url, errors.length ? errors : "no errors");
  await ctx.close();
}
await browser.close();
