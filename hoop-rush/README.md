# Hoop Rush

A browser basketball arcade built with Three.js, React and a Cloudflare Worker: solo play, five computer levels, two-player local play and private online 1v1 rooms.

## Play

- **Mouse:** drag upward to charge, move sideways to aim, then release. Power depends on the drag distance.
- **Touch:** swipe up. Direction aims the shot; distance and a small speed contribution set power. Each half supports its own touch in local versus.
- **Keyboard:** hold **Space**, then release to shoot. **A / D** aim. Around one second of charge is a good starting point.
- **Local player 2:** hold and release **Enter**; **Left / Right** aim.
- **Pause:** **Escape / P**. Offline rounds pause when the page loses focus. An online match clock continues while settings are open or the player reconnects.

## Game rules

Classic Arcade lasts 60 seconds. Baskets normally earn 2 points; shots released in the final 10 seconds earn 3. A legal pre-buzzer shot stays alive until its physics outcome resolves. There are unlimited balls, with a short physical recovery between releases.

Time Attack offers 30, 60, and 90 seconds. Challenge offers a moving hoop, a smaller rim, or a longer shot. Every three consecutive makes increases the challenge multiplier, up to 3×. Six-second double-point windows begin at 20 and 50 seconds. Daily challenges rotate by the Stockholm calendar date and specify a target score.

Tied competitive games enter sudden death. The first confirmed basket closes shooting, then already-airborne shots finish. If they equalize, another overtime begins. Two consecutive scoreless overtime windows end in a draw. Overtime baskets are worth 2 points before any challenge multiplier.

Personal bests, a device-local leaderboard, recent matches, wins, streaks, and cosmetic unlocks are saved in versioned localStorage. Arctic unlocks after 20 baskets; Midnight unlocks after 5 completed rounds. Venue lighting can be changed freely. Effects and the original procedural music have separate volume controls; music starts only when enabled and after a browser gesture.

## Online

Choose **Online**, create a room and send the invite link (`?room=CODE`) or the six-character code. Both players ready up before the shared countdown. Online rooms never add a computer player.

Online play goes device to device over WebRTC data channels (24 Oct 2026, see `ludvig-games/docs/p2p-online.md`). The server only pairs the players.

- `POST /api/rooms` creates a room. A `RoomRegistry` Durable Object caps the game at 200 active rooms. Room codes are signed (four random characters plus two from an HMAC, `lib/roomcode.ts`), so the Worker turns away unknown codes on `/api/rooms/CODE/ws` before any Durable Object wakes. Rejected requests write nothing.
- Each room is a signaling-only `HoopRoom` Durable Object (`lib/arena-room.ts`, seat rules in `lib/signal.ts`). It keeps two seats, sends join and leave events, hands the host seat to the remaining player, and relays WebRTC offers, answers and ICE candidates. Hibernation API, `ping` answered by the runtime, 20 messages per 10 s per socket (then closed), at most 6 sockets, and one alarm at a fixed 3-hour end with no rescheduling.
- ICE: STUN only (`stun.cloudflare.com`, `stun.l.google.com`), no TURN (owner zero-cost rule). If the devices cannot connect within 10 s, the player sees "Couldn't connect on this network."
- The host (seat 0) runs the authoritative rules from `lib/arena-rules.ts` in its browser: shot receipt times, aim and power limits, recovery, physics outcomes, scores, overtime, forfeits and rematches. It sends a state message on the reliable channel whenever something visible changes. The guest sends shots, ready, rematch and leave the same way and syncs its clock to the host over the link. A seat token in sessionStorage keeps the seat across a reload.
- A closed data channel with no leave event and no reconnect within 5 s counts as leaving: the other player wins by forfeit and sees "Your friend left."
- Measured locally: 6 to 7 room-server messages for a whole session (join 2, setup 4, sometimes leave), none during a match.

Rules live in `lib/arena-rules.ts` (pure functions, tested in `tests/online.test.mjs`); the host/guest link is `lib/online-client.js` on `lib/p2p.js` (tested in `tests/p2p.test.mjs`); the signaling room is `lib/arena-room.ts`.

## Physics and rendering

`lib/physics.mjs` is used unchanged in the browser, server, and tests. Simulation uses a 240 Hz fixed step with additional displacement-bounded collision substeps. The rim is a geometric torus, the backboard is finite, and the return deck is sloped. Scoring requires entering the usable opening from above and clearing the underside. Net forces are applied only after valid entry, so the net cannot pull a miss into a basket.

All bots launch ordinary balls. Difficulty changes their aim noise, timing consistency, moving-target prediction, and recovery interval. No shot teleports and no outcome is awarded by the AI.

Three.js provides the main renderer, procedural basketball surfaces, a cage and return machine, glass backboard, animated net, shadows, and venue lighting. It caps pixel ratio and reduces rendering quality when sustained slow frames are observed. A Canvas2D perspective renderer supports devices where WebGL cannot initialize. Both renderers consume the same live physics state.

## Develop, build and deploy

Node 22.13+. Run heavy commands through the RAM guard on this Mac.

```sh
npm ci
npm run dev                # vinext dev server with the Durable Object
npm test                   # physics, engine and room rules
npx tsc --noEmit
npx vinext build           # writes dist/
npx wrangler deploy --config dist/server/wrangler.json
```

The Worker is `hoop-rush` on the custom domain `hoop-rush.ludvighedin.com` (see `wrangler.jsonc`: Durable Object binding `ROOMS`, `workers_dev` off, observability off). It needs no database.

## Project map

| File | Purpose |
| --- | --- |
| `app/game.jsx` | Menus, HUD, dialogs and profile UI |
| `app/globals.css` | Responsive visual system |
| `lib/game-engine.js` | Match loop, input, bots, timing, scoring integration |
| `lib/physics.mjs` | Shared deterministic physics and AI shot planning |
| `lib/scene.js` | Three.js rendering |
| `lib/scene-assets.js` | Procedural textures and environment artwork |
| `lib/software-scene.js` | Canvas fallback for unavailable WebGL |
| `lib/audio.js` | Original procedural effects and sequenced music |
| `lib/profile.js` | Local records, cosmetic unlocks, daily rotation |
| `lib/arena-rules.ts` | Match rules, run by the host's browser |
| `lib/online-client.js`, `lib/p2p.js` | Host/guest link over WebRTC data channels |
| `lib/arena-room.ts`, `lib/signal.ts` | Signaling-only Durable Object and seat rules |
| `lib/registry-do.ts`, `lib/roomcode.ts` | Room cap and signed room codes |
| `worker/index.ts` | Worker entry: room routes, then the app |

The game has no accounts, purchases, advertising, analytics, external artwork or audio downloads.
