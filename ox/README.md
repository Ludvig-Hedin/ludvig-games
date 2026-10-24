# OX

A small, considered tic tac toe game. Play the computer, share a private room, or play side by side.

Live: https://ox.ludvighedin.com/

## Play

- **Play Computer:** Easy, Medium, Hard and Impossible. Choose your symbol in Settings.
- **Play Friend:** Create a room and copy the invite link, or enter an eight-character room code. No account is used by the game. Both players must accept the next round.
- **Play Locally:** Two people use the same board, with alternating turns and a shared scoreboard.

The classic 3×3 board needs three in a row. The 4×4 and 5×5 boards need four consecutive symbols horizontally, vertically or diagonally. Best of 3, 5 and 7 means first to 2, 3 and 4 wins; drawn rounds do not count toward that target. Endless mode keeps the score without a series winner. The starting symbol alternates after each round.

Use touch or mouse, or focus the board and use the arrow keys with Enter/Space. On 3×3, keys 1–9 select a square in reading order while the board has focus. Sound begins after a user interaction. Reduced-motion preferences are respected.

Preferences and per-mode statistics stay on the device. Online seats use random bearer credentials saved on the joining device, so refreshing reconnects to the same seat. Do not share those credentials. Invite links contain only the room code; the first friend to join claims the second seat. Rooms expire after 24 hours without activity.

## Architecture

- vinext (Next 16 on Vite) + React, one Cloudflare Worker named `ox`, D1 database `ox` (binding `DB`). Config is in `wrangler.jsonc`.
- Original SVG pieces, native CSS and synthesized Web Audio. No third-party visual or sound assets.
- AI runs in a separate browser Worker. Impossible uses complete minimax on 3×3. Larger boards use timed iterative deepening, alpha-beta pruning and a positional evaluation; optimality is not claimed on those sizes.
- Online state lives in Cloudflare D1. The server validates credentials, turns, moves, round completion and rematch votes. Atomic revision checks prevent conflicting writes.
- Online clients fetch room state every 1.5 s, every 4 s while waiting for your own move, back off on errors, never poll while the tab is hidden and stop once the room is closed. This is shared server state over HTTP polling, not WebSockets or peer-to-peer networking.
- A new match or a return to the menu invalidates pending client actions. Each client accepts only non-stale room revisions.

## Develop, build and deploy

Node 22.13+. Run heavy commands through the RAM guard on this Mac.

```sh
npm ci
npm run db:local          # once: local D1 schema in .wrangler/state
npm run dev
npm run db:generate       # after changing db/schema.ts
npx vinext build          # writes dist/
npx wrangler d1 migrations apply ox --remote   # only when drizzle/ changes
npx wrangler deploy --config dist/server/wrangler.json
```

## Verify

```sh
node tests/engine.test.mjs
node tests/rooms.test.mjs
node node_modules/typescript/bin/tsc --noEmit
```

Engine tests prove Impossible chooses an optimal outcome in every reachable 3×3 state, including either starting mark, and does not lose to any legal human continuation. They also verify larger-board wins, blocks, move legality and immutable match transitions. Backend tests execute the actual migration in SQLite and cover token privacy, concurrent joins and moves, rematches, expired rooms, reconnect state and request validation.

## Source map

`app/page.tsx` is the interface; `app/useGame.ts` owns local play and online session lifecycle; `app/components/` contains the pieces and board. `public/engine.js` is the rules/AI implementation and `lib/match.js` handles scoring. `lib/rooms.ts` is the authoritative online service used by `app/api/rooms/`. `db/schema.ts` and `drizzle/` define durable storage.
