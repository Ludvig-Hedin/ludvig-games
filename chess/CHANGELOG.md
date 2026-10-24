# Changelog

## 2026-10-24: ready for the Workers Free account (built and tested locally, not deployed)

- The page is now a static export (`output: "export"`), served as a static asset together with Stockfish (`/engine/*`). Page views and the engine never run the Worker. The Worker (`worker/index.ts`) only answers `/api/*`: 112 KiB, 25.5 KiB gzip, with no Stockfish inside.
- The room API moved from `app/api/rooms/**/route.ts` to `server/rooms.ts` and `server/room.ts`, routed by the Worker. Same requests and answers.
- Rate limits use the Workers rate-limit binding: 10 room creates and 60 joins a minute per IP. Before, every create and join counted in D1, even when it was turned away, and every create ran an unindexed `DELETE FROM chess_rate_limits` scan. Migration `0001_free_account.sql` drops that table. A limited request now reads and writes nothing in D1.
- Old rooms are still cleaned up 50 at a time per create, through the `updated_at` index.
- If the API returns 429 or 503 without a message (for example Cloudflare's 1027 daily-limit page), the game shows the existing "Online rooms are temporarily unavailable. Local and computer games are ready to play." If the server can't be reached it shows "Could not connect to the room." instead of a raw browser error.
- `wrangler.jsonc` for the new account: no custom domain or account id, workers.dev on, preview URLs and logs off, D1 id `REPLACE_ON_FREE_ACCOUNT`, assets with `run_worker_first: ["/api/*"]`.
- Build: `worker/render.ts` exists only so vinext can prerender in Node. `scripts/after-build.mjs` removes the build-only server output, so `wrangler deploy` uses `wrangler.jsonc`. `worker/dev.ts` keeps `npm run dev` working. `npm run dev:preview` serves the real deploy shape on port 8787.
- Checked: 101 tests, typecheck, build, dry run. In two browsers: Stockfish answered a move, online room over the invite link with moves showing on both boards, "Reconnecting…" while polls got 1027, busy and offline messages on create.

## 2026-10-23

- First deploy as its own Cloudflare Worker at https://chess.ludvighedin.com/ with its own D1 database `chess`.
- Online polling: plain requests every 1.5 s on the opponent's turn, 3 s on your turn, 4 s while waiting or after the game, 10 s in a hidden tab (was a 6.5 s server-held long poll checking D1 every 350 ms). Expired rooms are cleaned up in small batches.
- Online: when the opponent has been away for 15 s, you see "<name> left." with "Play computer" and "Back to menu".
- Removed the ChatGPT hosting, sign-in and connector code, the `.openai` folder and builder scripts. Plain vinext + `@cloudflare/vite-plugin` build.
- Calm UI: title "Chess"; removed slogans, eyebrows, taglines, footers, the profile monogram and status badges; plain dialog titles (Settings, Join a room, How to play, Export, Import, Resign?); results say "You won." / "You lost." / "Draw."; the computer is called "Computer". Shorter help; keyboard hints hidden on touch screens; license links kept.
- Phone: help and games buttons in the top bar, 44 px tap targets, safe-area padding, the page scrolls to the board when a game starts.
- `npm test` works on Node 22.
- Checked live before the domain outage: full games against the computer on desktop and on a 390 px touch phone (checkmate, result, review and analysis, play again), no console errors, no overflow at 320/390/1280. Room API checked live (create, instant reads, wrong code). Local preview (same build, local D1): local play to checkmate on a 390 px phone; an online game desktop (white) vs phone (black) via invite link to checkmate; wrong code ("Room not found. Check the code and try again."); a simultaneous rematch; the phone closing its tab gives the desktop "Bo left." after about 34 s, and "Play computer" works. Live server checked with two players over the API (moves, checkmate, rematch).
- Online: when both players press "Play again" at the same moment, the second vote is retried instead of being lost.
