# BREACH — Breakwater

An original 3D browser FPS inspired by compact military arena shooters. This is an independent small game, not a Call of Duty product or a commercial AAA release.

## Play immediately

Open **BREACH.html** in a current desktop browser. It contains the game, its graphics, styles, sound synthesis, and libraries in one file. Singleplayer works without an internet connection. WebGL 2 is required.

For phones, use the hosted game link in this ChatGPT conversation. Safari or Chrome and landscape orientation give the best experience. Phone file previews often do not execute games; open the hosted page instead.

## Game

- Breakwater: a detailed cargo terminal with three combat routes, industrial buildings, shipping containers, cover, puddles, a coastline, and port cranes.
- Free for all: first to 20 eliminations, or highest score after 5 minutes.
- Easy and Hard bots; choose 3, 5, or 7 opponents.
- MK18 rifle and P320 sidearm, aimed fire, recoil, reloads, headshots, footsteps, hit feedback, regeneration, respawn protection, and a scoreboard.
- 4 human players in private multiplayer rooms, plus bots. The host simulates movement, hits, health, bots, time, and scores. Guests send inputs; the game predicts guest movement and reconciles host snapshots.
- Touch movement, drag aiming, fire-and-aim dragging, aiming toggle, jump, sprint, reload, and weapon swap.
- Adjustable sensitivity, sound, field of view, and graphics. Preferences stay on the current device.

## Desktop controls

| Action | Control |
| --- | --- |
| Move | W A S D or arrow keys |
| Look | Mouse |
| Fire | Hold left mouse button |
| Aim down sights | Hold right mouse button |
| Sprint | Shift; firing interrupts sprint |
| Crouch | C or left Control |
| Jump | Space |
| Reload | R |
| Rifle / sidearm | 1 / 2 or mouse wheel |
| Scoreboard | Hold Tab |
| Pause | Escape or the pause button |

Click Deploy to capture the pointer. Escape releases it. If pointer capture is unavailable, click-drag aiming is available.

## Multiplayer online

1. Open the hosted game page and choose **Play with friends**.
2. Enter your callsign and choose **Create room**.
3. Share the six-digit code or copy the invite link.
4. Friends open the game page, enter the code, and choose **Join**.
5. The host chooses **Start match**.

Everyone needs access to the game page. A private ChatGPT Site may require its owner to grant access through Site sharing. Room codes do not grant access to the webpage itself. A copy of the downloaded game can be hosted on any static host for a publicly accessible game page.

Keep the host's tab open and foregrounded. Host departure closes the room; there is no host migration. Public hosted rooms use the free PeerJS signaling service and direct WebRTC connections. Internet access is needed to create or join those rooms. Restrictive networks/NATs can prevent direct connections; no paid TURN relay is configured. Use the included server below for LAN play or deploy it on a WebSocket-capable host for a relay.

## LAN play and optional relay server

Requires Node.js 20+.

```sh
npm install
npm start
```

Open the local address printed in the terminal. Other devices on the same Wi-Fi use the printed LAN address. This server serves the game and its WebSocket relay; no public PeerJS service is needed for LAN matches. Allow the server through your own device firewall if prompted. The relay validates rooms, sizes, origin, and membership, while the host game remains authoritative. This is a private party-game architecture, not tournament anti-cheat.

See README-network.md for custom relay deployment details.

## Source and builds

- `dist/js/main.js`: controls, HUD, game loop, camera, effects, network integration.
- `dist/js/simulation.js`: movement, collision, shooting, bots, navigation, match rules.
- `dist/js/world.js`: original procedural arena, materials, lighting, sky.
- `dist/js/arsenal.js`: original weapons, operators, animations, synthesized audio.
- `dist/js/network.js`: browser networking.
- `server.mjs`: optional static server and WebSocket relay.
- `dist/vendor/`: pinned Three.js and PeerJS libraries with license notices.

After editing source, run `npm run build`. This regenerates the browser bundle and the self-contained BREACH.html file. You can deploy `dist/` to any static host. The source files do not require an external model, texture, font, or audio service.

## Verification and limits

Automated checks exercise movement/cover, wall and floor impacts, head/body damage, spawn protection, death/respawn, regeneration, ammo/reload, bot difficulty and navigation, match limits, and real WebSocket multiplayer transport. Two browser clients also connected successfully through the included relay and displayed the same room roster. Public PeerJS room creation succeeded, but the direct peer connection timed out in the cloud test environment; online cross-network play therefore remains unverified. The cloud browser had WebGL disabled, so rendered gameplay, visual quality, and frame rate on actual phones could not be certified there. Phone portrait and landscape menu layouts were inspected separately. Test actual play on your target devices before a public launch.

## Credits

Game art, environment, audio, and code were created for this project. Three.js and PeerJS are MIT licensed; their license files are in `dist/vendor/`. The optional server uses the MIT-licensed `ws` package. No Call of Duty names, logos, maps, sounds, or game assets are included.
