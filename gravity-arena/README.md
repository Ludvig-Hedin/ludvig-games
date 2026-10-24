# Gravity Arena

Four in a row with gravity, on a 3D 4 × 4 × 4 board (76 winning lines) or a classic 7 × 6 board. Play the computer (five levels, search runs in a Web Worker), two players on one device, or a private online room with spectators.

Live: https://gravity-arena.ludvighedin.com/ (Cloudflare Worker `gravity-arena`, D1 database `gravity-arena`).

## Build and deploy

Requires Node.js 22.13+. Wrangler must be logged in to Ludvig's Cloudflare account.

```sh
npm ci
npm test                    # engine, AI and network tests (196)
npm run build               # vinext build -> dist/
npx wrangler deploy         # uses wrangler.jsonc (custom domain + D1 binding)
npm run db:migrate:remote   # only when drizzle/ has a new migration
```

Local dev: `npx wrangler d1 migrations apply gravity-arena --local`, then `npm run dev`. `node tests/server-integration.mjs <url>` runs real HTTP room checks against a running server.

## How it works

- `public/game/engine.js`: rules shared by browser, AI worker and server. Computer and local games make no network requests.
- `lib/rooms.ts` via `app/api/rooms`: server-validated moves with version checks; tokens stored as SHA-256 hashes. See `docs/multiplayer.md`.
- Online clients poll every 1.5 s (4 s after a round, backoff on errors) only while the room is on screen and the tab is visible. Rooms expire after 24 hours; room creation deletes a batch of expired rows (indexed on `expires_at`).

The original export is kept untouched in `ludvig-games/output/imports-2026-10-23/gravity-arena-source/`. Builder-specific scripts, auth helper and connector code were removed; the build is plain vinext + `@cloudflare/vite-plugin`.
