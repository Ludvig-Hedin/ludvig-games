# Ludo

Classic Ludo for 2–4 players: solo against 1–3 bots (four levels), local pass-and-play, or a private online room with a six-character code.

Live: https://ludo.ludvighedin.com/ (Cloudflare Worker `ludo`, D1 database `ludo`).

## Build and deploy

Requires Node.js 22.13+. Wrangler must be logged in to Ludvig's Cloudflare account.

```sh
npm ci
npm test                    # engine + room server tests
npm run build               # vinext build -> dist/
npx wrangler deploy         # uses wrangler.jsonc (custom domain + D1 binding)
npm run db:migrate:remote   # only when drizzle/ has a new migration
```

Local dev: `npx wrangler d1 migrations apply ludo --local`, then `npm run dev`.

## How it works

- `lib/engine.js`: rules, fair dice (Web Crypto) and bot moves, shared by browser and server. Solo and local games run fully in the browser with no network requests and are saved to localStorage.
- `lib/rooms.ts` via `app/api/rooms`: server-authoritative rooms in D1 with version checks. Seat tokens are stored only as SHA-256 hashes.
- Online clients poll every 1.5 s (4 s after a match), pause while the tab is hidden and stop when the player leaves. Rooms expire 7 days after the last game change; expired rows are deleted when a room is created (indexed on `updated_at`).

The original export is kept untouched in `ludvig-games/output/imports-2026-10-23/ludo-club/`. Builder-specific scripts, auth helper and connector code were removed; the build is plain vinext + `@cloudflare/vite-plugin`.
