# Little Links

3D mini golf in the browser (Three.js). Eighteen holes. Solo against 1–3 bots, 2–4 players on one device, or online rooms for 2–8 players with a six-character code.

Live at https://little-links.ludvighedin.com. Original download: `../ludvig-games/output/imports-2026-10-23/Little-Links-source/` (left untouched).

## Stack

vinext (Next 16 on Vite) + React 19, one Cloudflare Worker named `little-links`, D1 database `little-links` (binding `DB`), table `golf_rooms`.

- Solo and local games make no network requests. A running local round is saved in localStorage.
- Online rooms poll `GET /api/golf` every 1.5 s, never while the tab is hidden, and stop after 10 quiet minutes until the player touches the page. Leaving a room stops polling.
- The server simulates every shot. Rooms expire 24 h after their last change; creating a room deletes up to 25 expired rooms (indexed on `updated_at`).
- Phones get a lower pixel ratio (max 1.25) and cheaper shadows.
- `?qa=1` exposes `window.__golfQa` (ball screen position, and an auto-shot for the human player in local games only). It is used by the browser check and does nothing online.

## Build and deploy

Node 22.13+, npm.

```sh
npm install
npm run check && npm test       # typecheck, physics check, room engine and API tests
npm run build
npx wrangler d1 migrations apply little-links --remote --config wrangler.jsonc
npx wrangler deploy --config wrangler.jsonc
```

Always pass `--config wrangler.jsonc`: the build writes `.wrangler/deploy/config.json`, which would otherwise point Wrangler at the generated `dist/server/wrangler.json` with a placeholder database id.

## Source map

- `app/page.tsx`: all screens, match flow, bots, polling.
- `lib/golf.ts`: holes and physics. `lib/scene.ts`: Three.js scene and touch/mouse input.
- `lib/room-engine.ts`: server-side room rules. `app/api/golf/route.ts`: D1 storage.
- `drizzle/`: migrations. `tests/`: physics and multiplayer checks.
