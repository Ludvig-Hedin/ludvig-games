# Salvo

Hide-the-fleet naval strategy game. Play the computer (five levels), pass and play on one device, or online in a private two-player room.

Live: https://salvo.ludvighedin.com/

## Stack

vinext (Next 16 on Vite) + React + Three.js, one Cloudflare Worker named `salvo`, D1 database `salvo` (binding `DB`) for online rooms. Config is in `wrangler.jsonc`.

## Build and deploy

Node 22.18+. Run heavy commands through the RAM guard on this Mac.

```bash
npm ci
npm test                 # rules + room tests (no server needed)
npx tsc --noEmit
npx vinext build         # writes dist/
node tests/worker-smoke.mjs   # compiled Worker + throwaway D1, two clients
npx wrangler d1 migrations apply salvo --remote   # only when drizzle/ changes
npx wrangler deploy --config dist/server/wrangler.json
```

## Notes

- Solo and local modes make no network requests.
- Online rooms poll every 1.5 s, every 5 s on your own turn, 4 s after the battle, never while the tab is hidden, and stop once the opponent has left a finished room.
- Rooms expire after 24 hours; expired rows are cleaned up when a room is created.
- The builder platform scripts (sites env, connector preview, hosted auth) were removed.
