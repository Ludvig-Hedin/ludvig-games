# Changelog

## 2026-10-24 (later): ready for the Workers Free account (built and tested locally, not deployed)

- The page is now a static export (`output: "export"`), served as a static asset. Page views never run the Worker. The Worker (`worker/index.ts`) only answers `/api/*`: 14.0 KiB, 4.5 KiB gzip.
- `wrangler.jsonc` for the new account: no custom domain or account id, workers.dev on, preview URLs and logs off, one fresh `v1` migration with both SQLite classes, and assets with `run_worker_first: ["/api/*"]`.
- Per-IP limits through the Workers rate-limit binding: 10 room creates and 30 room joins a minute. A limited request gets the existing "Online play is full right now" message and writes nothing.
- Creating a room now has a 12-second timeout. A 429 or 503 without a message (for example Cloudflare's 1027 daily-limit page) shows the same busy message.
- Build: `worker/render.ts` exists only so vinext can prerender in Node. `scripts/after-build.mjs` removes the build-only server output, so `wrangler deploy` uses `wrangler.jsonc`. `worker/dev.ts` keeps `npm run dev` working. `npm run dev:preview` serves the real deploy shape on port 8787.
- Checked: all three test files, typecheck, build, dry run. In two browsers: computer match, online room over the invite link, match started on both screens, busy, offline and wrong-code messages.

## 2026-10-24

- Online play now goes device to device (WebRTC data channels). The server only pairs the two players and passes on the connection setup, so a whole match costs about 7 to 9 server messages instead of thousands. The host's browser runs the match with the same rules as before. Lobby, codes, invite links, host start, rematch and leave work as they did.
- STUN only, no TURN (owner zero-cost rule). If two devices can't reach each other, players see "Couldn't connect on this network."
- Hard caps: at most 200 active rooms, 20 room messages per 10 seconds per player (then the socket closes), 6 sockets per room, and a fixed 3-hour room life with a single alarm.
- If the host leaves, the other player sees who left and a way back to the menu.
- Room codes are now signed (still six characters), so the Worker turns away unknown codes before any room server wakes, and a rejected request writes nothing. Built and tested locally after the 23:59 UTC deploy; not deployed yet.

## 2026-10-23

- Renamed everything players see from "Rally Club" to "Table Tennis": title, page name, wall and table signs, paddle mark. Storage keys are unchanged.
- Online play now runs in a WebSocket room (one Durable Object per room, SQLite-backed, Workers Free plan) instead of polling D1 every 40 ms. About 12 messages a second per player, storage writes only on real changes, and rooms sleep when idle. The D1 database, schema, migrations and drizzle packages are gone.
- Invite link, room code, nickname and host start work as before. Wrong or expired codes, full rooms, a friend leaving and short drops show plain messages, with a way back to the menu.
- Fixed in the new room before release: a point or result decided while handling a player's move is now sent to both players at once (without this the result screen could fail to appear).
- Removed the ChatGPT Sites hosting files, connector code, sign-in helper and the old ZIP start notes.
- Calmer screens: no slogans, kicker lines, court captions, footer or edition marks. SVG spin icons instead of text arrows, no keyboard hints on touch screens, 44 px tap targets.
- Beating the computer offers the next level on the result screen.
- Published as its own Worker at https://table-tennis.ludvighedin.com (domain status: see below).
- Note: at 18:06 UTC all *.ludvighedin.com custom domains on the account were removed by someone outside this work. A deploy at 18:11 UTC briefly restored this one; it was gone again by 18:16 UTC. Deploys are on hold until the owner confirms.
