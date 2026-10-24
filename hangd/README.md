# Hängd

Hangman party game for 2–10 friends, in Swedish or English. Private rooms with a six-character code or invite link, secret words, bluffs and sabotage cards.

Live at https://hangd.ludvighedin.com. Original download: `../ludvig-games/output/imports-2026-10-23/hangd-source/hangd/` (left untouched).

## Stack

vinext (Next 16 on Vite) + React 19, one Cloudflare Worker named `hangd`, D1 database `hangd` (binding `DB`). Live updates use short renewable SSE streams (about 11 s each, D1 checked every 450 ms). If streams fail twice the client falls back to HTTP snapshots every 1.5 s.

Free-plan budget:
- The stream pauses after 60 s in a background tab and after 20 minutes with no room change. It resumes on return, tap or key press.
- Leaving the room or closing the tab closes the stream. Heartbeat writes happen at most every 8 s per player.
- Rooms expire 12 h after the last write (30 min if nobody is present). Old rooms and rate-limit rows are deleted opportunistically on writes.

## Build and deploy

Node 22.13+, pnpm 10. The pnpm store lives in the project (`.pnpm-store`) because the sandbox cannot write the global store.

```sh
pnpm install --frozen-lockfile --store-dir .pnpm-store
pnpm check && pnpm test          # typecheck + 25 engine tests
pnpm build
npx wrangler d1 migrations apply hangd --remote --config wrangler.jsonc
npx wrangler deploy --config wrangler.jsonc
```

Always pass `--config wrangler.jsonc`: the build writes `.wrangler/deploy/config.json`, which would otherwise redirect Wrangler to the generated `dist/server/wrangler.json` with a placeholder database id.

Local dev: `pnpm dev` (port 5173) uses a local D1 placeholder from `vite.config.ts`; run the migration once locally with `npx wrangler d1 execute DB --local --config dist/server/wrangler.json --file drizzle/0000_abandoned_moon_knight.sql` after a build.

`HANGD_TEST_URL=https://hangd.ludvighedin.com pnpm test:integration` runs the network tests against a deployment (creates real rooms).

## Source map

- `components/game.tsx`: all screens. `components/mascot.*`: the mascot.
- `lib/engine.ts`: rules and scoring. `lib/server.ts`: D1, auth, rate limits, SSE. `lib/use-room.ts`: client connection.
- `app/api/rooms/*`: HTTP routes. `drizzle/`: migrations. `docs/ARCHITECTURE.md`: protocol and trust boundaries (original notes).
