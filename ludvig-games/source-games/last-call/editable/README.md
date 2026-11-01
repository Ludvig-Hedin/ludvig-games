# LAST CALL — Airport Chaos

One cart. Too much luggage. Ninety seconds.

A complete browser arcade game built with Three.js. Stack luggage, drift through an airport terminal, and deliver to the indicated gate before the clock runs out. Carrying more luggage increases the payout, but substantial impacts knock bags off your cart.

## Play immediately

**Open `PLAY.html` in a current Chrome, Safari, Firefox, or Edge browser.** It includes the game engine, fonts, graphics, music and sound in one file. No installation, account or internet connection is required. WebGL 2 and hardware acceleration must be available.

If your browser restricts locally opened HTML files, serve the bundled static game instead:

```sh
node scripts/serve.mjs
```

Open `http://localhost:4173`. Node.js 18 or later is sufficient for this server; dependencies do not need to be installed to play the already bundled game.

## Modes

- **Solo run:** 90 seconds to bank your best score, with two autonomous rival carts competing for luggage.
- **Couch duel:** two people play simultaneously on the same computer with separate cameras and independent controls. A keyboard or two compatible standard gamepads is required.
- **Daily flight:** the daily date in Stockholm selects a reproducible luggage layout.
- **Challenges:** after a solo run, copy its `LC-...` challenge code. A friend opens their own copy of the game, chooses **Got a challenge code?**, and enters the code to play the same starting layout against your score. This works with separate offline copies. Challenges are asynchronous. There is no live online room server or global leaderboard.

The game stores personal best, career points, unlocked paint and audio/graphics preferences in the browser. Private-browsing restrictions or clearing browser storage can remove this progress. Different browser origins have separate saves.

## Controls

| Action | Player 1 | Player 2 |
| --- | --- | --- |
| Accelerate / brake / reverse | W / S | Up / Down |
| Steer | A / D | Left / Right |
| Hold drift | Shift | Enter |
| Boost | Space | . (period), / or Numpad 0 |
| Recover cart, discard held luggage | R | Backspace |
| Pause | Escape | Escape |

Solo also supports the arrow keys. On a standard gamepad, use the left stick to steer, RT to accelerate, LT to brake, A to drift and B to boost. Mobile solo play uses an on-screen joystick and separate drift and boost buttons. Device-specific gamepad and touch behavior has not been exhaustively tested.

## Scoring and mechanics

Drive through bags to collect them. You can carry eight. Follow the gate arrow and enter that gate's green delivery zone to bank your cargo. A delivery gives you a new destination. Larger loads earn bonuses, and consecutive deliveries build a scoring combo. A hard impact spills cargo and reduces the combo. Already banked points remain safe.

Holding drift through a corner charges a short turbo. Release the drift button to trigger it. Manual boost consumes energy; energy regenerates over time and more quickly while drifting. Ramps launch the cart, and moving walkways add acceleration in their marked direction.

Five cart colors unlock with cumulative career points at 0, 800, 2,000, 4,000 and 7,000 points. Paint is cosmetic.

## Source and hosting

`dist/` is the complete, buildless website, including vendored Three.js and fonts. Upload its contents to any static web host, or serve it with the included Node server.

```sh
npm install
npm test
npm run build
npm start
```

`npm run build` refreshes the local Three.js files and regenerates `PLAY.html` with esbuild. Runtime assets are local; no third-party services are called during gameplay. `dist/game/` contains the editable source modules, and `tests/` contains the simulation regression tests.

## Verification and current limits

- Twelve simulation tests pass: deterministic inputs and seeds, independent local controls, timestep behavior, pickup capacity, correct delivery, wrong gates, scenery collisions, cargo spills and grace periods, drifting, boost transitions, timer completion, invalid input handling and bot deliveries.
- Scene and cart geometry was instantiated in Node and checked for finite transforms. Camera-to-cart raycasts found and corrected a wall-occlusion case.
- The managed test browser has WebGL disabled. Full GPU rendering, live driving feel and audible sound were **not** verified there. Test on an actual WebGL-capable device before treating this release as production-ready.
- One airport arena, two bot carts, local split-screen and asynchronous challenges are implemented. There is no real-time online multiplayer, matchmaking, server anti-cheat, or cloud save.

## Credits and licenses

Original procedural environment, vehicle models, UI and synthesized soundtrack created for this game. Three.js is distributed under its MIT license, included in `dist/vendor/THREE-LICENSE.txt`. Barlow Condensed and DM Sans are bundled under the SIL Open Font License, with their license files in `dist/fonts/`.
