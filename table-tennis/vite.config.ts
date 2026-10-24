import vinext from "vinext";
import { defineConfig } from "vite";
import { cloudflare } from "@cloudflare/vite-plugin";

// Production: `vinext build` makes a static export (next.config.ts) in
// dist/client, and wrangler deploys worker/index.ts (API only) with those files
// as static assets. During the build the plugin compiles worker/render.ts, a
// page renderer with no Durable Objects, so vinext can prerender it in Node.
// Dev: the plugin runs worker/dev.ts, so the page and the rooms share a port.
export default defineConfig(({ command }) => ({
  plugins: [
    vinext(),
    cloudflare({
      viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
      inspectorPort: false,
      config: config => {
        const c = config as unknown as Record<string, unknown>;
        delete c.assets;
        if (command === "serve") { c.main = "./worker/dev.ts"; return; }
        c.main = "./worker/render.ts";
        for (const key of ["durable_objects", "migrations", "ratelimits"]) delete c[key];
      },
    }),
  ],
}));
