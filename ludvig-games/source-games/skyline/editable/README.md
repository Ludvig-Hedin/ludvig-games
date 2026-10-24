# SKYLINE v3 — Coastal Club

A directly coded, self-contained arcade flight game. No Lovable, installation, account, server, CDN, external assets, or internet connection required to play.

## Play

Open `index.html` in a desktop browser with WebGL enabled. Click **Fly now** to start airborne. That click also enables sound. Choose **Start on runway** for takeoff practice instead.

This is an assisted arcade aircraft, not a realistic training simulator. The controls prioritize predictable direction changes and easy recovery.

## Controls

| Input | Action |
| --- | --- |
| W / S | Increase / decrease throttle. Throttle stays where you leave it. These keys never control pitch. |
| A / D or Left / Right | Turn left / right with coordinated, limited banking. |
| Up / Down | Climb / descend. Non-inverted by default. |
| Shift | Boost while held; uses a rechargeable energy reserve. |
| Space | Air brake in flight; wheel brake on the ground. |
| C | Cycle chase, cockpit, and wide cameras. |
| R | Recover airborne near your current gate; keep points, reset combo. |
| M | Mute / unmute. |
| Esc | Pause, help, and settings. |
| Click and drag on the world | Optional steering. Drag right to turn right; drag up to climb. Release to level out. No pointer lock. |

Release steering to level the aircraft. Normal cruise holds altitude. Low airspeed causes a gradual sink and a warning rather than unexplained rotation. Flying into terrain, the sea, buildings, or an AI aircraft still causes a crash.

**Runway:** hold W. The aircraft accelerates, automatically rotates at takeoff speed, and climbs clear of the runway. W continues to control only throttle; the takeoff assist is a separate ground-to-air transition.

**Landing school:** the lesson starts on final approach at a suitable speed. Hold Down to glide toward runway 36, then hold Space after touchdown. Approach assistance limits the descent rate when aligned with the runway, below 110 knots, with reduced throttle. Outside those conditions, a fast or steep landing can still crash.

Use **Esc → Steering response** to adjust turn/climb response. Settings also include volume, inverted vertical controls, drag steering, and graphics resolution. Focus loss pauses the game and clears held inputs.

## Activities

**Free flight:** explore without a timer, follow the 20-gate coastal circuit, or leave the course. Low passes and close flybys earn bonuses.

**Coast run:** a three-minute, 20-gate course with combos, centered-gate bonuses, and a lap-completion award. The run ends when the course is complete or time expires.

**Landing school:** make a controlled touchdown and stop on the runway. The lesson includes a landing award and a completion screen.

## What's new in v3

The old mixed throttle/pitch controls have been replaced with a fixed-step arcade flight model, damped steering, limited bank angles, automatic leveling, predictable takeoff, and assisted approaches. Ground contact uses the same terrain triangles as the renderer. Gates use swept crossings so a fast aircraft cannot skip through them between frames.

The world includes four moving AI aircraft, six boats, seven service vehicles, balloons, birds, a village, airport buildings, a lighthouse, turbines, cloud groups, water animation, and aircraft propellers. AI traffic appears on the minimap. Service vehicles follow a road clear of the airport buildings.

Sound is synthesized locally: propeller/engine RPM, wind, runway rumble, boost, gate chimes, close flybys, landing impacts, crash effects, low-speed alerts, and interface/radio tones. Radio communication is text with beeps and crackle, **not spoken dialogue**. Pause and mute silence the continuous engine/wind output.

The interface includes a compass, altitude above ground, airspeed, throttle, boost reserve, target direction, minimap, scoring, recovery screens, and flight summaries. Best score and settings are stored locally when browser storage is available; blocked storage does not prevent play.

## Files and development

`index.html` is the complete runnable game. Everything it needs is inside that file.

The editable source is split into `src/flight.js` (physics, route, terrain), `src/render.js` (WebGL renderer), `src/world.js` (procedural geometry and traffic), `src/audio.js` (Web Audio synthesis), and `src/game.js` (input, cameras, scoring, UI, and activities). `template.html` contains the interface and styles.

After editing, rebuild using Python's standard library:

```bash
python3 build.py
```

There are no npm packages to install. To host the game, serve `index.html` as a static file.

## Verification

See `QA.md` and the JSON reports in `tests/`. The final verification run passed 21 model checks and 30 browser integration checks. Browser checks used Chromium with real WebGL rendering and audio-signal measurement, actual key/pointer events, controlled time advances, and seeded collision scenarios.

To rerun the model suite, install Node.js and run:

```bash
node tests/flight.test.cjs
```

The optional integration suite needs Python, Playwright, and Chromium. It is not needed to play. It injects the identical self-contained HTML into a browser page; it does not use a server.

```bash
python3 -m pip install playwright
python3 -m playwright install chromium
python3 tests/browser.test.py
```

Set `CHROMIUM_PATH` to use a particular Chromium executable. Headless Linux environments may need an X display for their graphics backend.

## Scope and limitations

Desktop keyboard and mouse are the primary controls. A narrow-screen layout and basic touch buttons are included, but physical phone/tablet testing was not performed. The touch layout does not expose all desktop actions, so desktop is recommended for the complete experience.

Chromium was tested. Safari, Firefox, physical gamepads, and different hardware configurations were not verified. Frame rate depends on the graphics device; there is no measured 60 FPS guarantee. Use Performance graphics if needed. The flight model intentionally has no unrestricted rolls, complex aerodynamics, multiplayer, or realistic air-traffic-control simulation.
