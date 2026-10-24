# Changelog

## 2026-10-24 (later): ready for the Workers Free account (built and tested locally, not deployed)

- The page is now a static export (`output: "export"`), served as a static asset. Page views never run the Worker. The Worker (`worker/index.ts`) only answers `/api/*`: 13.9 KiB, 4.5 KiB gzip.
- `wrangler.jsonc` for the new account: no custom domain or account id, workers.dev on, preview URLs and logs off, one fresh `v1` migration with both SQLite classes, and assets with `run_worker_first: ["/api/*"]`.
- Per-IP limits through the Workers rate-limit binding: 10 room creates and 30 room joins a minute. A limited request gets the existing "Online play is full right now" message and writes nothing.
- If room create returns 429 or 503 without a message (for example Cloudflare's 1027 daily-limit page), the game shows the same busy message instead of "Could not start a room".
- Build: `worker/render.ts` exists only so vinext can prerender in Node. `scripts/after-build.mjs` removes the build-only server output, so `wrangler deploy` uses `wrangler.jsonc`. `worker/dev.ts` keeps `npm run dev` working. `npm run dev:preview` serves the real deploy shape on port 8787.
- Checked: 35 tests, typecheck, build, dry run. In two browsers: computer match, online host and guest over the invite link, busy, offline and wrong-code messages.

## 2026-10-24 (built and tested locally, not deployed)

- Online play now goes device to device (WebRTC data channels). The server only pairs the two players and passes on the connection setup: 8 server messages for a whole session, none during play. The host's browser runs the match with the same rules, including the final-score fix. Invite link, code, nickname, pause, rematch and leave work as before.
- STUN only, no TURN. If two devices can't reach each other, players see "Couldn't connect on this network."
- Hard caps: at most 200 active rooms, 20 room messages per 10 seconds per player (then the socket closes), 6 sockets per room, and a fixed 3-hour room life with a single alarm. Room codes are signed, so unknown codes are turned away before any room server wakes, and rejected requests write nothing.
- If the host leaves, the other player sees who left and a way back to the menu.

## 2026-10-23 (later, deployed 23:33 UTC)

- Fix: when the winning goal (or any score or seat change) was decided while the room handled a player's move, the room could stop without sending that last update, so neither screen showed the result. The room now sends an update whenever the score, status or seats change. Tests and build pass. Deployed at 23:33 UTC, just before a stop on deploys arrived (the owner's Cloudflare budget guard had taken the domains down on purpose). That deploy re-added air-hockey.ludvighedin.com.

## 2026-10-23

- Online play now runs in a WebSocket room (one Durable Object per room, SQLite-backed, Workers Free plan) instead of polling D1 every 50 ms. About 12 messages a second per player, storage writes only on goals and other real changes, and rooms sleep when idle. The D1 database, schema, migrations and drizzle packages are gone.
- Invite link, room code and nickname work as before. Wrong or expired codes, full rooms, a friend leaving and short connection drops now show plain messages, with a way back to the menu. Opening the invite link again after someone leaves takes the free seat.
- Removed the ChatGPT Sites hosting files, connector code and sign-in helper.
- Calmer screens: title reads "Air Hockey", no slogans, edition line, footer, captions or version marks. Slim in-game score bar, controls help moved to the pause menu, no keyboard hints on touch screens, 44 px tap targets, safe areas, full-screen button only where the browser supports it.
- Table print and badge now read "AIR HOCKEY".
- Beating the computer offers the next level on the result screen, and the chosen level is remembered.
- Published at https://air-hockey.ludvighedin.com as its own Worker.
