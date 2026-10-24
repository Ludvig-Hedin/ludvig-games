import handler from "vinext/server/fetch-handler";
import api from "./index";

// Dev only (vite.config.ts): the vinext dev server renders the page and the
// API Worker answers /api/*. Production serves the page as a static asset.
export default {
  fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext) {
    if (new URL(request.url).pathname.startsWith("/api/")) return api.fetch(request, env);
    return handler.fetch(request, env, ctx);
  },
};
