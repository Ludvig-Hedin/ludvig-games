# EPOCH — Endless War

An original, self-contained, five-age 3D strategy game inspired by classic lane-based evolution battles.

## Play

Double-click **EPOCH-Endless-War.html** and open it in a browser with WebGL enabled. Click **Begin battle** to start and enable audio. The entire game, Three.js engine, procedural model assets, and synthesized audio are embedded. No network connection, installation, account, or build tools are needed. A desktop or laptop is recommended for the clearest battlefield view.

The source folder's `index.html` also runs directly alongside its CSS and JavaScript files. A static web host can serve the same files with no backend. For an existing game portal, use the single-file build as the game page or as an iframe source.

## How to play

Your teal army fights from the left. Destroy the orange enemy stronghold without losing your own.

Click a troop card to train it; deployed troops move and fight automatically. Gold arrives over time and from defeated enemies. Mix a durable front line with ranged support. The third troop is your heavy unit; late-game artillery can break a stalemate.

Combat and time earn experience. Click the highlighted **Next age** card when enough experience is available. Evolution unlocks three new troops, transforms both your base and installed defenses, and restores part of your base health. Already-trained troops keep their original age; queued troops retain the age and price at which they were purchased.

**Defenses** opens three emplacement slots. Buy a turret, upgrade it to level three, or sell it for 65% of the gold invested. Turrets automatically fire at approaching enemies.

Click your special attack, then click its target on the battlefield. Specials recharge for free; late-game orbital strikes also damage strongholds. The visible targeting ring shows the approximate bombardment area, not the exact randomized impact positions.

Click a queued troop to cancel it for a full refund. Maximum six queued troops and 28 active-plus-queued troops.

## Controls

| Control | Action |
| --- | --- |
| Mouse / touch | Recruit, manage defenses, and choose special-attack targets |
| 1, 2, 3 | Recruit a troop |
| Q | Aim or cancel your special attack |
| T | Open or close defenses |
| E | Evolve when ready |
| F | Switch between 1× and 2× battle speed |
| P | Pause or resume |
| Escape | Cancel targeting, close defenses, or pause/resume |
| M | Mute or unmute |

Music and effects have separate volume controls in the pause menu. Sound starts only after you press Begin battle. Leaving the browser tab automatically pauses the match. Fullscreen is available when the browser or embedding page permits it.

## Included

Five ages: Stone, Medieval, Gunpowder, Modern, and Future. Fifteen troop classes, fifteen era-specific turret variants, turret upgrades, five targeted special attacks, three difficulty settings, animated 3D models, projectiles, particle impacts, base evolutions, original adaptive music, spatial effects, victory/defeat screens, and replay.

All game art, character rigs, music, sound synthesis, interface, and gameplay code are original to this project. No artwork, recordings, names, logos, or source code from Age of War are included. This is a 3D reimagining of that style of game, not a pixel-perfect reproduction.

## Source layout

- `sim.js` — renderer-independent battle simulation, economy, enemy AI, progression, and combat.
- `models.js` — original 3D unit rigs, bases, turrets, and shared/batched geometry.
- `scene.js` — Three.js renderer, environment, animation, projectile effects, portraits, and particles.
- `audio.js` — original Web Audio score and spatial effects, with independent music/effects buses.
- `game.js` — interface, controls, lifecycle, and fixed-step game loop.
- `style.css` / `index.html` — responsive interface and standalone entry point.
- `three.min.js` — Three.js r140, MIT licensed; license provided in THIRD-PARTY-NOTICES.txt.
- `build.py` — optional single-file bundler; run `python3 build.py` to regenerate the HTML in the parent directory.

## Verification

The final simulation was exercised across 27 seeded matches spanning all three difficulties and three automated strategies. Tests check finite positions, correct population accounting, nonnegative gold, and queue limits. Browser checks cover actual control clicks, sound initialization, troop production, cancel/refund, build/upgrade/sell, aiming and impact damage, all five era models and transitions, pause/resume, mute, 2× speed, victory, defeat, replay, and menu return. Desktop, portrait, and landscape layouts were checked. Browser QA used Chromium with software-rendered WebGL and an in-memory load of the exact self-contained HTML; no external resources were requested. Browser QA cannot guarantee every browser/device configuration or subjective audio quality.

The optional `tests/` files require Node.js for simulation checks and Python Playwright with a compatible Chromium installation for browser tests. Their executable/path settings may need changing for your machine; these tools are not needed to play the game.
