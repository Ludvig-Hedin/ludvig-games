# Changelog

## 2026-10-24

- Ready for the games' Workers Free account (not deployed). `wrangler.jsonc` has no route, custom domain or account id; workers.dev on, preview URLs off, and an explicit `observability: { enabled: false }`; the D1 id is the placeholder `REPLACE_ON_FREE_ACCOUNT`.
- The page is prerendered at build time and served as a static file (`npm run build` runs `vinext build --prerender-all` and `scripts/static-pages.mjs`). The Worker runs only for `/api/*`; unknown paths get the static 404 page.
- The per-isolate rate limiter is replaced by the Workers rate-limit binding per IP (create 10, join 30, moves and polls 600 a minute), shared across all isolates; rejected requests write nothing. A malformed token is refused before any D1 read. At most 300 live rooms; expired-room cleanup is bounded and runs only after a room is created.
- Busy, daily-limit or offline: the existing "Reconnecting… your seat is saved" state and "Connection failed. Please try again." instead of a raw browser error; polling backs off to 15 s while it fails.

## 2026-10-23

- Setup screen fits one phone screen with no scrolling (checked at 390x844, 375x667, 360x640 and 320x640): the board preview shrinks to the space left above the form and hides when there is too little, spacing tightens on short screens, and the fullscreen button moves into the header on phone setup. Same controls and wording.
- First deploy as its own Cloudflare Worker at https://ludo.ludvighedin.com/ with its own D1 database.
- Renamed from "Ludo Club" to "Ludo" everywhere (title, wordmark, metadata, package name, board mark, storage keys).
- Calm UI: removed the slogans ("Small board. Big feelings." and the rest), eyebrow lines, taglines, the "made for a good time" signature, the under-table line and the site footer. "How to play" moved behind a "?" icon; the "Play" nav link went (the logo returns to the start screen). "Connected" text is now a dot. Fullscreen button hides where the browser has no Fullscreen API. Keyboard hints hide on touch screens.
- Phone layout: board on top, dice and roll button side by side, compact four-player row, 44 px tap targets, safe areas, no long-press selection.
- Online rooms poll every 1.5 s (was 0.85 s), pause while the tab is hidden, and expired rooms are cleaned up via a new `updated_at` index (migration 0001).
- SEO and metadata: plain title and description, Open Graph tags, canonical URL, Cloudflare Web Analytics.
