# Changelog

## 2026-10-24

- Ready for the games' Workers Free account (not deployed). `wrangler.jsonc` has no route, custom domain or account id; workers.dev on, preview URLs off, and an explicit `observability: { enabled: false }`; the D1 id is the placeholder `REPLACE_ON_FREE_ACCOUNT`.
- The page is prerendered at build time and served as a static file (`npm run build` runs `vinext build --prerender-all` and `scripts/static-pages.mjs`). The Worker runs only for `/api/*`; unknown paths get the static 404 page.
- Real per-IP limits with the Workers rate-limit binding (create 10, join 30, moves and polls 600 a minute); rejected requests write nothing. A malformed token is refused before any D1 read. At most 300 live rooms; expired-room cleanup is bounded and runs only after a room is created. A poll writes "last seen" at most every 12 s (presence is 20 s).
- Busy, daily-limit or offline: the existing "Reconnecting. Your seat is saved." state and "Could not connect to this table." message instead of a raw browser error.

## 2026-10-23

- First deploy as its own Cloudflare Worker at https://color-clash.ludvighedin.com/ with its own D1 database.
- Removed site-builder scripts, sign-in helper and connector code; plain vinext + Cloudflare build.
- Calm UI: removed slogans, eyebrow lines, taglines, the home footer and decorative notes. Title in Title Case. Color picker uses SVG shapes instead of text glyphs. Full-screen layout with safe areas, 44 px tap targets on phones, no long-press text selection on the table.
- Online rooms poll every 1.5 s (was 0.65 s), pause while the tab is hidden, and clean up expired rooms.
- SEO and metadata: plain title and description, Open Graph tags, canonical URL, Cloudflare Web Analytics.
