# Mind Games

Live: https://mind-games.ludvighedin.com/ (Cloudflare Worker `mind-games`, D1 database `mind-games`).

A Rock Paper Scissors game with a procedural Three.js arena, adaptive opponents, private local turns, and durable server-authoritative online rooms.

## Play

- **Play Computer:** five difficulties. The AI commits before human input and uses historical observations only.
- **Play Locally:** pass one device, with an opaque privacy screen between secret choices.
- **Play Friend:** create a private room, copy its invitation, and let one friend join. No player accounts.
- **Classic:** best of 3, 5, or 7. Ties do not award points.
- **Mind Games:** first to 2, 3, or 4 points. Each player gets one secret double play. A boosted win scores two; a tie or loss still consumes it.
- Keyboard: **1 / 2 / 3** select Rock / Paper / Scissors; **Enter** starts or advances a match.
- Effects, ambient music, reduced motion, local records, and preferences are available in the interface.

## Develop, build and deploy

Node.js 22.13 or newer.

```sh
npm install
npm run db:migrate:local   # once: local D1 schema in .wrangler/state
npm run dev                # http://localhost:5173
npx vinext build           # writes dist/
npx wrangler d1 migrations apply mind-games --remote   # only when drizzle/ changes
npx wrangler deploy --config dist/server/wrangler.json
```

`wrangler.jsonc` holds the Worker name, the `DB` binding and the `mind-games.ludvighedin.com` custom domain.

## Verification

    npm test
    npm run typecheck
    npm run build

Rules tests cover all nine outcomes, series limits, ties, immutable results, boost consumption, completed matches, AI history bounds, adaptation against predictable strategies, and chance-level outcomes against independent random moves.

Server tests execute the actual SQL migration and force concurrent reads. They cover privacy, credentials, simultaneous joins and locks, idempotency, reconnects, lost initial join responses, rematches, expiration, and invalid input.

## Online protocol

The service is isolated in **lib/rooms.ts**, independent of the interface. Routes live under **/api/rooms**. Matchmaking can allocate seats through this service; the current product exposes private rooms only.

Every player receives a 256-bit bearer token. Only its SHA-256 hash is stored in D1. The token stays in browser session storage, never in invitation URLs. An invitation contains a random seven-character room code. Anyone with the invitation can claim the empty second seat.

Pending moves and boosts stay on the server. Responses contain only the requesting player's pending choice. The server resolves a round after both immutable choices arrive. Clients cannot compute or submit authoritative results.

Room writes use compare-and-swap version checks. Responses carry monotonic revisions and the client rejects stale snapshots. Clients poll every 1.5 s during a match, every 4 s in the lobby or after the match, and every 10 s in a hidden tab, with reconnection backoff. Returning to the tab polls at once. If the opponent has been away for 15 s (or leaves), the remaining player sees "<name> left." with "Back to menu" and "Play computer".

Both players acknowledge a revealed round before proceeding. Both consent to a rematch. A refreshed tab resumes using its seat token. A client-generated token saved before joining makes that request retryable if its response is lost. Closing a tab may discard its session token; refresh the original tab to reconnect.

Rooms expire after 24 hours. Disconnecting does not automatically lose a match. Leaving ends the room without inventing a win. Expired-room and invalid-session states provide an explicit return to the arena.

## Local persistence and fairness

Settings, AI observations, personal statistics, and the local leaderboard are device-local. Computer and online results contribute to personal statistics; local games have separate player totals. No competitive rankings are fabricated.

Expert can exploit patterns but cannot consistently beat independent uniformly random play. Same-device privacy depends on the other person looking away during selection, as the privacy screen instructs. Separate-device online play isolates the selections.

## Graphics and audio

All arena objects, stage details, animations, particles, and sound cues are original procedural assets. Three.js is bundled. The renderer caps pixel density, pauses when hidden, handles context loss, and provides an SVG fallback if WebGL is unavailable. Heavy 3D code loads dynamically.

The interface uses Manrope and DM Sans with system fallbacks. Audio begins after a user gesture. Ambient music is optional and off by default.
