# Changelog

## 24 October 2026

- Ready for the games' Workers Free account (not deployed). `wrangler.jsonc` has no route, custom domain or account id; workers.dev on, preview URLs off, Workers Logs off; the D1 id is the placeholder `REPLACE_ON_FREE_ACCOUNT`. Deploy with `--config wrangler.jsonc` (the deploy script does).
- The page is prerendered at build time and served as a static file (`npm run build` runs `vinext build --prerender-all` and `scripts/static-pages.mjs`). The Worker runs only for `/api/*`; unknown paths get the static 404 page.
- The SSE stream (about 27 D1 queries per stream) is gone. The client polls the room every 1.5 s, pauses in hidden or idle tabs, and backs off to 15 s while the service is busy or unreachable.
- Rate limits use the Workers rate-limit binding per IP (create 10, join 30, moves and polls 900 a minute) instead of D1 counters, so rejected requests (including 429s) write nothing. At most 300 live rooms. A poll writes "last seen" at most every 12 s.
- Busy, daily-limit or offline: the existing reconnect banner and "Det gick inte att ansluta." instead of a raw browser error.
- Local dev starts again (`nodejs_compat` was listed twice). The integration test observes the room by polling.

## 23 October 2026

- Live on https://hangd.ludvighedin.com as its own Worker with its own D1 database.
- Removed the builder platform's Sites scaffolding (auth headers, connectors, hosting config, install and run wrappers). Plain vinext + Wrangler now.
- Name is now "Hängd" (not HÄNGD). Title, description, Open Graph, canonical URL and cookie-free Cloudflare Web Analytics in the head.
- Calm UI: removed slogans, kickers, the hero captions, fact chips, the bottom tagline and the footer. The start screen shows the title, one short line and the form. Rules sit behind the "?" button.
- The wordmark goes to the start screen and asks before leaving a room.
- Language follows the browser on first visit (Nordic languages get Swedish, others English). Both languages stay.
- Phone: full-height layout with safe-area insets, 44 px tap targets, no text selection or callouts outside inputs and chat.
- Cheaper online play: the live stream pauses in background tabs and idle rooms, the fallback poll is 1.5 s, the reconnect backoff is gentler and heartbeat writes are rarer.
