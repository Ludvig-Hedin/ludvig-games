# Changelog

## 2026-10-24: ready for the Workers Free account (built and tested locally, not deployed)

- The page is now a static export (`output: "export"`), served as a static asset. Page views never run the Worker. The Worker (`worker/index.ts`) only answers `/api/*`: 19 KiB, 5.5 KiB gzip.
- The `app/api/**/route.ts` wrappers are replaced by one small router in the Worker that calls the same `handleRoomRequest`. Same requests and answers, `/api/health` included.
- Per-IP limits through the Workers rate-limit binding: 10 room creates and 30 joins a minute, checked before any D1 work, so a limited request reads and writes nothing. It gets the existing "Online play is temporarily unavailable. Try again shortly."
- If the API returns 429 or 503 without JSON (for example Cloudflare's 1027 daily-limit page), the game shows that same message. If the server can't be reached it shows "Couldn't connect. Try again." instead of a raw browser error.
- `wrangler.jsonc` for the new account: no custom domain or account id, workers.dev on, preview URLs off (new) and logs off, D1 id `REPLACE_ON_FREE_ACCOUNT`, assets with `run_worker_first: ["/api/*"]`.
- Build: `worker/render.ts` exists only so vinext can prerender in Node. `scripts/after-build.mjs` removes the build-only server output, so `wrangler deploy` uses `wrangler.jsonc`. `worker/dev.ts` keeps `npm run dev` working. `npm run dev:preview` serves the real deploy shape on port 8787.
- Checked: 17 tests, typecheck, build, dry run. In two browsers: computer reply, online room over the invite link with moves on both boards, busy, offline and wrong-code messages.

## 2026-10-23

- Imported from the builder download as OX. Removed the builder-platform scripts; plain Cloudflare Worker + D1 config.
- Calm UI: removed the slogan "A little rivalry. A lot of fun.", the pop-up taglines and "Saved on this device."; waiting heading now "Waiting for a friend"; pop-up titles "Play Friend", "Settings" and "Stats"; removed the extra "Games" back button; tapping the logo mid-game asks "Leave this game?".
- Short desktop windows: the board no longer pushes the page past the window between about 705 and 820 px tall, and the opponent's name is no longer covered by its mark on short windows (the board stops shrinking at 300 px).
- Cheaper online play: checks every 1.5 s instead of 0.65 s, paused while hidden, stopped when the room closes.
- Added title, description, Open Graph, canonical URL and Cloudflare Web Analytics.
- Deployed to https://ox.ludvighedin.com/.
