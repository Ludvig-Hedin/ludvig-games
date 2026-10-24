# Color Clash

A color-matching card game for 2–6 players. Play against 1–5 bots, pass one device around, or open a private online room with a six-character code.

Live: https://color-clash.ludvighedin.com/ (Cloudflare Worker `color-clash`, D1 database `color-clash`).

## Build and deploy

Requires Node.js 22.13+. Wrangler must be logged in to Ludvig's Cloudflare account.

```sh
npm ci
npm test                    # rules engine + room server tests
npm run build               # vinext build -> dist/ (Worker + static assets)
npx wrangler deploy         # uses wrangler.jsonc (custom domain + D1 binding)
```

New migrations in `drizzle/` are applied with `npm run db:migrate:remote`. Local dev: `npm run dev`, after `npx wrangler d1 migrations apply color-clash --local`.

## How it works

- `core/game.mjs`: shared rules engine (also used for bots). Solo and pass-and-play run fully in the browser with no network requests.
- `server/rooms.mjs` via `app/api/rooms/[[...path]]/route.ts`: authoritative online rooms in D1 with versioned compare-and-swap writes. Seat tokens are stored only as SHA-256 hashes.
- Online clients poll every 1.5 s (4 s after a match), pause while the tab is hidden, and stop when the player leaves. Rooms expire after 24 hours; expired rows are deleted when a new room is created (indexed on `expires_at`).
- Full rules: `RULES.md`.

The original export from the site builder is kept untouched in `ludvig-games/output/imports-2026-10-23/Color-Clash-Source/`. Its builder-specific scripts, auth helper and connector code were removed here; the build is plain vinext + `@cloudflare/vite-plugin`.
