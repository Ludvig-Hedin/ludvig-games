import vinext from "vinext";
import { defineConfig } from "vite";
import { cloudflare } from "@cloudflare/vite-plugin";

// Plain Cloudflare build: the Worker config (name, D1 binding, custom domain)
// lives in wrangler.jsonc and is read by the Cloudflare Vite plugin.
export default defineConfig({
  plugins: [
    vinext(),
    cloudflare({
      viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
      inspectorPort: false,
    }),
  ],
});
