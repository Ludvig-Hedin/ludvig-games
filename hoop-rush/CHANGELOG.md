# Changelog

## 2026-10-24 (later): ready for the Workers Free account (built and tested locally, not deployed)

- The page is now a static export (`output: "export"`), served as a static asset. Page views never run the Worker. The Worker (`worker/index.ts`) only answers `/api/*`: 14.0 KiB, 4.5 KiB gzip.
- `wrangler.jsonc` for the new account: no custom domain or account id, workers.dev on, preview URLs and logs off, one fresh `v1` migration with both SQLite classes, and assets with `run_worker_first: ["/api/*"]`.
- Per-IP limits through the Workers rate-limit binding: 10 room creates and 30 room joins a minute. A limited request gets the existing "Online play is full right now" message and writes nothing.
- Creating a room now has a 12-second timeout and a plain message if the server can't be reached. A 429 or 503 without a message (for example Cloudflare's 1027 daily-limit page) shows the same busy message.
- Build: `worker/render.ts` exists only so vinext can prerender in Node. `scripts/after-build.mjs` removes the build-only server output, so `wrangler deploy` uses `wrangler.jsonc`. `worker/dev.ts` keeps `npm run dev` working. `npm run dev:preview` serves the real deploy shape on port 8787.
- Checked: all four test files, typecheck, build, dry run. In two browsers: solo shot, online room over the invite link, both ready, match running on both screens, busy and offline messages.

## 2026-10-24 (built and tested locally, not deployed)

- Online play now goes device to device (WebRTC data channels). The server only pairs the two players and passes on the connection setup: 6 to 7 server messages for a whole session, none during a match. The host's browser runs the same rules as before (timing, physics, scoring, overtime, forfeits). Invite link, code, ready-up, countdown, rematch and leave work as before.
- STUN only, no TURN. If two devices can't reach each other, players see "Couldn't connect on this network."
- Hard caps: at most 200 active rooms, 20 room messages per 10 seconds per player (then the socket closes), 6 sockets per room, and a fixed 3-hour room life with a single alarm (the old alarm that kept extending busy rooms and the 7-day expiry marker are gone). Room codes are signed, so unknown codes are turned away before any room server wakes, and rejected requests write nothing.
- When a friend leaves (or the host leaves), the other player wins by forfeit and sees "Your friend left." without a stray "Reconnecting…".

## 2026-10-23

- Own site: hoop-rush.ludvighedin.com, as its own Cloudflare Worker on the free plan.
- Online rooms moved from 400 ms HTTP polling and a D1 database to one Durable Object per room over a WebSocket. The server still times, simulates and scores every shot. Idle rooms sleep. Each client sends about 1–2 messages a second while playing.
- Online: invite link and code, ready-up, countdown, rematch, reconnect after a short drop or reload, and clear messages for a wrong code, an expired room, a full room and a friend who left, always with a way back to the menu.
- Fixed: a friend who closes the game no longer leaves the other player waiting forever. They lose by disconnect after 20 seconds in a match, and "Play again" turns into "Menu" after a result.
- Removed the old ChatGPT hosting, sign-in and connector code, the D1 schema and the bundled build.
- Calmer screens: title "Hoop Rush", one short line on the start screen, plain labels, no slogans, eyebrows, footers or edition lines, and no keyboard hints on touch screens. All buttons are at least 44 px, phone sizes are easier to read, and the layout respects safe areas.
