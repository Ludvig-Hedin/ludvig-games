# Air Hockey

3D air hockey in the browser: play the computer (five levels), two players on one screen (keyboard or two fingers on a touchscreen), or a friend online with an invite link or six-character room code. Built with TypeScript, Three.js, React and vinext (Next on Vite), deployed as one Cloudflare Worker at https://air-hockey.ludvighedin.com.

## Play

- **Play computer:** Beginner, Easy, Medium, Hard or Pro. Beat a level and the result screen offers the next one. The chosen level is remembered.
- **Two players:** same keyboard (W A S D and arrows by default) or touch, one finger each. On touch-only devices the button starts touch play directly.
- **Play a friend:** create a room, share the link (`?room=CODE`) or the code. Only a nickname is needed, no account.
- First to 3, 5, 7 or 11. Pause with the button, Space or Esc. Controls help is in the pause menu.

## How online works (direct connection, 24 Oct 2026)

Players connect device to device over WebRTC (see `ludvig-games/docs/p2p-online.md`). The server only pairs them.

- `POST /api/rooms` creates a room. A `RoomRegistry` Durable Object caps the game at 200 active rooms. Room codes are signed (four random characters plus two from an HMAC), so the Worker turns away unknown codes on `/api/rooms/CODE/ws` before any Durable Object wakes. Rejected requests write nothing.
- Each room is a signaling-only `AirRoom` Durable Object (`lib/game/room-do.ts`, seat rules in `lib/game/signal.ts`). It keeps two seats, sends join and leave events, hands the host seat to the remaining player, and relays WebRTC offers, answers and ICE candidates. Hibernation API, `ping` answered by the runtime, 20 messages per 10 s per socket (then closed), at most 6 sockets, one alarm at a fixed 3-hour end and no rescheduling.
- ICE: STUN only (`stun.cloudflare.com`, `stun.l.google.com`), no TURN (owner zero-cost rule). If the two devices cannot connect within 10 s, players see "Couldn't connect" with "Couldn't connect on this network."
- The host (seat 0) runs the authoritative 240 Hz match in its browser with the same rules the server used before (`lib/game/room-server.ts`). It sends the guest a snapshot about 20 times a second on the unordered channel `u`, and on the reliable channel `r` whenever the score, status or seats change. The guest sends its mallet target on `u` and pause, resume, rematch and leave on `r`, and predicts its own mallet and the puck between snapshots (`lib/game/online.ts`, link in `lib/game/p2p.js`).
- A closed data channel with no leave event and no reconnect within 5 s counts as a leave. A short drop pauses the match and resumes with a face-off.
- Measured locally: 8 room-server messages for a whole session (join 2, setup 4, leave 2), none during play.

## Develop, build and deploy

Node 22.13+. Run heavy commands through the RAM guard on this Mac.

```sh
npm ci
npm run dev              # vinext dev on http://localhost:5173 (Worker + Durable Object run locally)
npm test                 # room rules, client protocol, physics and runtime tests
npm run typecheck
npx vinext build         # writes dist/
npx wrangler deploy --config dist/server/wrangler.json
```

`wrangler.jsonc` holds the Worker name (`air-hockey`), the `ROOMS` and `REGISTRY` Durable Object bindings with their `new_sqlite_classes` migrations, the custom domain route, `workers_dev: false`, `preview_urls: false` and observability off. An optional secret `ROOM_CODE_KEY` replaces the built-in room code key.

## Files

| Path | What it does |
| --- | --- |
| `app/page.tsx`, `app/globals.css` | Start screen, HUD, dialogs and layout (phone first, safe areas, 44 px targets) |
| `lib/game/runtime.ts` | Frame loop, input, local matches and online integration |
| `lib/game/physics.ts`, `types.ts` | Deterministic physics, scoring and the five AI levels |
| `lib/game/renderer.ts`, `fallback-renderer.ts` | Three.js table, and a 2D canvas fallback without WebGL |
| `lib/game/audio.ts`, `preferences.ts` | Web Audio sound and saved settings |
| `lib/game/room-server.ts`, `online.ts`, `p2p.js`, `network-types.ts` | Online match rules (run by the host), client and direct link |
| `lib/game/room-do.ts`, `signal.ts`, `registry-do.ts`, `roomcode.ts` | Signaling room, seat rules, room cap and signed codes |
| `worker/index.ts`, `wrangler.jsonc` | Worker entry and Cloudflare config |
| `tests/` | Node tests (`node --import tsx --test tests/*.test.ts`) |
