// Copies the pages vinext prerendered into the static assets (dist/client), so
// page views are served as files and never run the Worker. Runs after
// `vinext build --prerender-all`. RSC payloads stay with the Worker.
import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";

const from = "dist/server/prerendered-routes";
const to = "dist/client";
if (!existsSync(path.join(from, "index.html"))) {
  console.error("static-pages: no prerendered index.html. Did a page use request data?");
  process.exit(1);
}
let copied = 0;
function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const source = path.join(dir, entry.name);
    if (entry.isDirectory()) { walk(source); continue; }
    if (!entry.name.endsWith(".html")) continue;
    const target = path.join(to, path.relative(from, source));
    mkdirSync(path.dirname(target), { recursive: true });
    copyFileSync(source, target);
    copied++;
  }
}
walk(from);
console.log(`static-pages: ${copied} page(s) copied to ${to}`);
