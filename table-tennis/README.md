# Table Tennis

3D table tennis in the browser: play the computer (five levels), two players on one keyboard, or a friend online with an invite link or six-character room code. Three.js arena, React and vinext (Next on Vite), deployed as one Cloudflare Worker at https://table-tennis.ludvighedin.com. The browser and the room share one deterministic physics engine (`src/game/engine.js`).

## Play

- **Play computer:** Beginner, Easy, Medium, Hard or Pro, best of 3, 5 or 7 games. Beat a level and the result screen offers the next one.
- **Two players:** one keyboard. Player 1: W A S D and Space. Player 2: arrows and Enter. Phones are pointed to Play a friend instead.
- **Play a friend:** create a room, share the link (`?room=CODE`) or the code. The host starts the match. Only a nickname is needed.
- Mouse: move to position, hold click to hit, move sideways while hitting to aim. Touch: drag to move, hold or swipe to hit. Spin buttons below the court (1–5 on a keyboard). Help is behind the "?" button.

Rules: games to 11, win by two. Service changes every two points and every point at 10–10. A serve bounces once on each side; a net serve that lands is replayed.

## How online works (direct connection, 24 Oct 2026)

Players connect device to device over WebRTC (see `ludvig-games/docs/p2p-online.md`). The server only pairs them.

- `POST /api/rooms` creates a room. A `RoomRegistry` Durable Object caps the game at 200 active rooms. Room codes are signed (four random characters plus two from an HMAC, `src/server/roomcode.ts`), so the Worker turns away unknown codes on `/api/rooms/CODE/ws` before any Durable Object wakes. Rejected requests write nothing.
- Each room is a signaling-only `TableRoom` Durable Object (`src/server/room-do.ts`, rules in `src/server/signal.ts`). It keeps two seats with names and secrets, sends join and leave events, hands the host seat to the remaining player, and relays WebRTC offers, answers and ICE candidates. It never sees gameplay. Hibernation API, `ping` answered by the runtime, 20 messages per 10 s per socket (then closed), at most 6 sockets, and one alarm at a fixed 3-hour end. No rescheduling.
- ICE: STUN only (`stun.cloudflare.com`, `stun.l.google.com`), no TURN (owner zero-cost rule). If the two devices cannot connect within 10 s, players see "Couldn't connect on this network."
- The host (seat 0) runs the authoritative match in the browser with the same rules the server used before (`src/server/rooms.ts`). It sends the guest a snapshot about 20 times a second on the unordered channel `u`, and on the reliable channel `r` whenever the score, status or seats change. The guest sends controls on `u` and serves, start, rematch and leave on `r`. The guest predicts and smooths between snapshots (`src/game/network.js`, link in `src/game/p2p.js`).
- A closed data channel with no leave event and no reconnect within 5 s counts as a leave.
- Measured locally: 7 to 9 room-server messages for a whole session (join 2, setup 4, leave 1 to 2), none during play, and 1 to 3 Worker API calls.

Known design trait: every block is an assisted, legal return aimed by sideways movement, so two players who never move can rally forever. Any sideways movement while hitting ends that.

## Develop, build and deploy

Node 22.18+. Run heavy commands through the RAM guard on this Mac.

```sh
npm ci
npm run dev              # vinext dev on http://localhost:5173 (Worker + Durable Object run locally)
npm test                 # engine, match rules and host/guest link tests
npm run typecheck
npx vinext build         # writes dist/
npx wrangler deploy --config dist/server/wrangler.json
```

`wrangler.jsonc` holds the Worker name (`table-tennis`), the `ROOMS` and `REGISTRY` Durable Object bindings with their `new_sqlite_classes` migrations, the custom domain route, `workers_dev: false`, `preview_urls: false` and observability off.

Saved settings keep their old keys (`rally.settings`, `rally.stats`, `rally-club-online-session-v1`) so returning players keep them.
