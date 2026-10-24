import vinext from "vinext";
import { defineConfig } from "vite";
import { cloudflare } from "@cloudflare/vite-plugin";

// Local development binding only. Production bindings live in wrangler.jsonc.
const localBindingConfig = {
  main: "./worker/index.ts",
  // nodejs_compat comes from wrangler.jsonc; listing it twice stops the dev runtime.
  d1_databases: [
    {
      binding: "DB",
      database_name: "little-links-local",
      database_id: "00000000-0000-4000-8000-000000000000",
    },
  ],
};

export default defineConfig({
  plugins: [
    vinext(),
    cloudflare({
      viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
      inspectorPort: false,
      config: localBindingConfig,
    }),
  ],
});
