import handler from "vinext/server/fetch-handler";

// Build only (vite.config.ts): vinext loads this entry in Node to prerender the
// static export. It must not import cloudflare:workers. It is never deployed;
// wrangler deploys worker/index.ts with dist/client as static assets.
export default handler;
