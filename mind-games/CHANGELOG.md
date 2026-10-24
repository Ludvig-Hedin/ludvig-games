# Changelog

## 2026-10-24: ready for the Workers Free account (built and tested locally, not deployed)

- The page is now a static export (`output: "export"`), served as a static asset. Page views never run the Worker. The Worker (`worker/index.ts`) only answers `/api/*`: 18 KiB, 5.5 KiB gzip.
- The `app/api/**/route.ts` wrappers are replaced by one small router in the Worker that calls the same `roomApi`. Same requests and answers.
- Rate limits use the Workers rate-limit binding: 10 room creates and 30 joins a minute per IP, checked before any D1 work. Before, every create and join wrote a D1 counter row, even when it was turned away. Migration `0001_free_account.sql` drops `room_rate_limits`. Old rooms are still cleaned up 50 at a time per create.
- If the API returns 429 or 503 without JSON (for example Cloudflare's 1027 daily-limit page), the game shows the existing "Online rooms are temporarily unavailable. Try again shortly." If the server can't be reached it shows "Could not connect. Try again." instead of a raw browser error.
- `wrangler.jsonc` for the new account: no custom domain or account id, workers.dev on, preview URLs and logs off, D1 id `REPLACE_ON_FREE_ACCOUNT`, assets with `run_worker_first: ["/api/*"]`.
- Build: `worker/render.ts` exists only so vinext can prerender in Node. `scripts/after-build.mjs` removes the build-only server output, so `wrangler deploy` uses `wrangler.jsonc`. `worker/dev.ts` keeps `npm run dev` working. `npm run dev:preview` serves the real deploy shape on port 8787.
- Checked: 23 tests, typecheck, build, dry run. In two browsers: computer round, online room over the invite link with one round resolved on both screens, busy, offline and wrong-code messages.

## 2026-10-24

- Prepared as its own Cloudflare Worker `mind-games` on mind-games.ludvighedin.com with its own D1 database `mind-games` (created, migration applied remotely). Deployed to https://mind-games.ludvighedin.com/. Live server checked with two players over the API: a best-of-3 to the end, a wrong code, and a leave that closes the room for the other player.
- Checked in a local preview (local D1): a full match against the computer on a 390 px touch phone, local pass-and-play rounds, an online best-of-3 between desktop and phone via invite link to the end plus a rematch, a wrong code ("That room does not exist. Check the code."), the leave panel both when the other player closes the tab (after about 28 s) and when they tap Leave, and both of its buttons. About one poll per 1.6 s during play. No console errors, no overflow at 320/390/1280.
- Online polling: every 1.5 s during a match (was 0.8 s), 4 s in the lobby or after the match, 10 s in a hidden tab (was 2.5 s); returning to the tab polls at once.
- Online: when the opponent leaves or has been away for 15 s, you see "<name> left." with "Back to menu" and "Play computer", even mid-round. "Play computer" also clears the old room from the address.
- Removed the ChatGPT hosting, sign-in and connector code, the `.openai` folder, builder scripts, the unused UI kit and the stale prebuilt `dist/`. npm instead of pnpm; plain vinext + `@cloudflare/vite-plugin` build.
- Calm UI: title "Mind Games" with one line ("Rock, paper, scissors."); removed the eyebrow, slogan headline, "EST. SINCE FOREVER", numbered art labels, the footer ("THE CIRCLE OF LIFE", "ALL INSTINCT. NO LUCK? MAYBE."), the duplicate nav and taglines on every round and result. Plain titles (Settings, Your record, How to play, Play a friend), "Play again", "Tie.", "You win the match." / "You lose the match.". Help button in the header. Keyboard hints hidden on touch screens.
- Phone: header icons, quick settings and text buttons are 44 px tall on touch screens.
