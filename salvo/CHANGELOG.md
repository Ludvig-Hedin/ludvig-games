# Changelog

## 2026-10-24

- Ready for the games' Workers Free account (not deployed). `wrangler.jsonc` has no route, custom domain or account id; workers.dev on, preview URLs and logs off; the D1 id is the placeholder `REPLACE_ON_FREE_ACCOUNT`.
- The page is prerendered at build time and served as a static file (`npm run build` runs `vinext build --prerender-all` and `scripts/static-pages.mjs`). The Worker runs only for `/api/*`; unknown paths get the static 404 page.
- Room create and join use the Workers rate-limit binding per IP (12 and 40 a minute) instead of D1 counters, so rejected requests write nothing. At most 300 live rooms. "Last seen" is written at most every 15 s per player. A malformed token is refused before any D1 read.
- When the service is busy (429, 503, daily limit) or unreachable, create and join show the existing "temporarily unavailable" message, and polling shows "Reconnecting…" and backs off to 15 s instead of failing on an HTML error page.

## 2026-10-23

- Imported from the builder download and renamed to Salvo (no trademarked names in UI, metadata or package name; the 4-cell ship is now "Dreadnought").
- Removed builder-platform scripts and auth/connector code; plain Cloudflare Worker + D1 config.
- Calm UI: removed slogans, eyebrow lines, decorative chips and footer; full-screen dvh layout with safe areas; 44 px tap targets; no text selection on the board; keyboard hints hidden on touch; "?" help shown on phones; board fits the screen height on desktop.
- Cheaper online play: slower polling, paused when hidden, stops when the room is over.
- Added title, description, Open Graph, canonical URL and Cloudflare Web Analytics.
- Deployed to https://salvo.ludvighedin.com/.
