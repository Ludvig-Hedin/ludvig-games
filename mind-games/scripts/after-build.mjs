// After `vinext build` (24 Oct 2026, Workers Free move). The Cloudflare Vite
// plugin leaves a redirect in .wrangler/deploy that would make wrangler deploy
// the build-only page renderer from dist/server. Remove it and that renderer,
// so `wrangler deploy` uses wrangler.jsonc: worker/index.ts plus the static
// export in dist/client.
import { rmSync } from "node:fs";

rmSync(".wrangler/deploy", { recursive: true, force: true });
rmSync("dist/server", { recursive: true, force: true });
rmSync("dist/client/wrangler.json", { force: true });
