// Opens one page offline in headless Chrome and reports load timing and errors. Usage: node tests/e2e/one.mjs <url>
import { chromium } from "playwright-core";
const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const ctx = await browser.newContext();
await ctx.route("**/*", (r) => (/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(r.request().url()) ? r.continue() : r.abort("internetdisconnected")));
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
page.on("console", (m) => m.type() === "error" && errors.push("console: " + m.text().slice(0, 200)));
const t = Date.now();
page.on("domcontentloaded", () => console.log("DOMContentLoaded", Date.now() - t, "ms"));
page.on("load", () => console.log("load", Date.now() - t, "ms"));
await page.goto(process.argv[2], { waitUntil: "commit", timeout: 60000 });
await page.waitForTimeout(20000);
console.log("errors", errors);
await browser.close();
