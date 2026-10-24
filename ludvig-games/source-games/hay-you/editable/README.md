# Hay, You

A playful single-player dating game: meet twelve very opinionated horses, choose your opening line, and take a thirty-second sunset ride together. Find three dates with at least 70% chemistry before your eight profiles run out.

## Play the downloaded edition

Extract the ZIP, then open **PLAY.html** in a current desktop browser. This file contains the game, artwork, typefaces, rendering engine and audio synthesis. It does not need an account, installation, server or network connection.

The `source/` directory in the ZIP is the editable project. The standalone edition is built from the same source as the hosted game.

## Controls

| Screen | Controls |
| --- | --- |
| Discover | Swipe a card, click the buttons, or press Left/Right to pass/like. Up gifts a carrot. |
| Dialogue | Click a reply or press 1, 2 or 3. |
| Sunset date | Left/Right or A/D changes lanes; Space, Up or W jumps. |
| Touch | Use the on-screen arrows and Jump, or swipe/tap the track. |
| Pause | Escape or the pause button. |
| Sound | The sound control is available both in the header and during a date. |

Your horse wears the coral saddle blanket. The companion follows behind and does not collide with obstacles. Follow the pink hearts and jump or steer around logs. There is a three-second countdown and a safe opening before the first obstacle. A missed heart breaks the current streak; a bump reduces chemistry. You can retry unsuccessful dates on the same course. A retry replaces that evening's result, so it does not duplicate points.

Carrots guarantee a match and improve chemistry. Shared moods and a thoughtful opening line also help. Finishing a date with at least 70% chemistry earns a 250-point bonus.

## Graphics and accessibility

- Every portrait crops a native 2:3 image cell with uniform scaling. Cards, match dialogs, avatars and the stable never distort the artwork.
- The primary renderer uses Three.js with articulated horse rigs, a lit sunset ranch, soft shadows, hills, trees, flowers and a chase camera.
- A Canvas renderer keeps the date playable when WebGL is unavailable, using the same simulation and horse poses.
- The interface supports keyboard input, visible focus, modal focus management, reduced interface motion and on-screen touch controls.
- Pausing or switching away freezes the simulation. An unusually long frame stall pauses rather than advancing through unseen obstacles.
- DM Sans and Playfair Display are bundled locally with their SIL Open Font License notices. Three.js is bundled with its MIT license.

Progress and the sound preference stay in the current browser when local storage is available. Private browsing, file-origin restrictions or clearing browser data can prevent or reset saving. The downloaded and hosted versions have separate histories. No personal information is sent to a game server.

## Source layout

`dist/index.html` and `dist/style.css` provide the application shell, responsive interface and game HUD. `app.js` handles navigation, dialogue, results and persistence. `content.js` contains twelve personalities; `portraits.js` crops the original artwork without distortion; `audio.js` synthesizes the original music and effects.

`runner.js` manages input and animation lifecycle. `runner-model.js` is the deterministic fixed-step simulation. `runner-scene.js` creates the WebGL scene, and `horse3d.js` defines the articulated horse rig. Artwork and fonts are in `dist/assets/`; Three.js and its license are in `dist/vendor/`.

Serve `dist/` with any static HTTP server to work on the modular source. For example, from the project root:

```sh
python3 -m http.server 8080 --directory dist
```

Then open `http://localhost:8080`. The modular `dist/index.html` needs HTTP; use the bundled `PLAY.html` for double-click offline play.

To rebuild `PLAY.html`, make the esbuild command available on PATH and run:

```sh
node scripts/build-offline.mjs ./release/PLAY.html
```

Alternatively, set `ESBUILD_BINARY_PATH` to the esbuild executable. No dependency download happens inside the build script. The font refresh script is optional: the required font files already ship with the project.

## Verification

Run the focused regression suites with Node:

```sh
node tests/runner-model.test.mjs
node tests/runner-lifecycle.test.mjs
```

The suites cover the complete countdown and round duration at multiple frame rates, seeded retries, jump buffering, log contact intervals, lane changes, wrong-lane and passed-object collisions, scoring, pause reentrancy, background restoration, native button activation, input cancellation and cleanup across repeated dates. All twelve horse-specific courses have a collision-free winning route in the simulation at both normal and low frame rates.

These tests validate simulation and lifecycle behavior. They do not replace visual inspection or measure GPU performance on every device.

## Third-party notices

Three.js: `dist/vendor/THREE-LICENSE.txt`.

DM Sans and Playfair Display: `dist/assets/fonts/*-OFL.txt`.

The six original portrait designs support twelve different written personalities. The game is single-player; it does not connect to a real dating service.
