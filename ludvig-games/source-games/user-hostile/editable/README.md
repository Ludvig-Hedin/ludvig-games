# USER HOSTILE
## One form. Zero respect.

A complete, original browser game inspired by **User Inyerface**. Six stages of intentionally hostile signup UX: contradictory controls, evolving validation, fake costs, a reshuffling keypad, procedural 3D CAPTCHA objects, bureaucracy and a submit button with commitment issues.

This is a playable game, not a design mockup. There is a timer, an ending, replay, generated sound effects, a result receipt and local best-run storage.

## Play

Open **index.html** in a modern desktop browser. No installation, account, API key or backend is needed. Touch layouts are included.

All game code and CSS are contained in the HTML. Three.js r160 is requested asynchronously from a small list of public CDN sources. If the library cannot load, the bundled, original WebGL renderer supplies the same 3D puzzles offline. If WebGL itself is unavailable, the game falls back to illustrated objects with the same solutions. Network failures never block the signup game.

Use **made-up information**. The supplied identity on the second stage is part of the puzzle.

## The controls that actually tell the truth

**Esc** or the permanent bottom help control pauses the run and opens the honest menu. It provides a real stage-specific hint (+15 seconds), a skip (+60 seconds), readable text, reduced motion, sound controls and restart. **M** toggles sound when you are not typing. The top sound button works normally. Changing tabs pauses the timer.

The timed score includes hint and skip penalties. Skipped runs do not replace your unskipped local best. The ending separates raw time and penalties. Copying a score copies text only; it does not post anything.

## Run from a local development server

```sh
cd user-hostile
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

Alternatively, `npm run dev` runs the same Python command. Node/npm is not needed to play the delivered HTML.

## Edit and rebuild

```text
src/template.html  Document shell and persistent UI
src/styles.css     The deliberately questionable design system
src/game.js        Stage logic, audio, timers, help and Three.js rendering
src/native-3d.js   Original self-contained offline WebGL renderer
build.py           Standard-library Python single-file builder
index.html         Ready-to-play / ready-to-host output
```

After editing the source files:

```sh
python3 build.py
```

No npm dependencies or compilation toolchain are required. The game logic is contained in an IIFE rather than polluting global variables. `window.UserHostile.status` exposes read-only diagnostics for testing.

For an entirely embedded **Three.js** build, put the official Three.js r160 UMD build at `src/three.min.js` and rebuild. Its license header is preserved. This is optional: offline 3D already works with the built-in renderer.

## Put it on a website

Upload **index.html** to a static host or a directory on an existing website. For example, place it at `user-hostile/index.html` to serve it from `/user-hostile/`. No server code, environment variables or database are needed. It can also be embedded in an iframe; giving the frame a full viewport is preferable to a tiny card.

Serve over HTTPS for the normal clipboard API. A manual-copy fallback is provided when clipboard access is unavailable. Keep the external script sources allowed in your Content Security Policy for the Three.js enhancement, or use the embedded vendor option. The offline renderer does not require them.

## Deliberate hostility, bounded

Traps are finite and solvable. The paid extra reselects itself only once. Terms change once. The final button dodges three times and then stops. The cookie rejection link stops moving after two dodges. Support eventually closes. There is no real purchase, signup, email, AI service or contact with a support representative. Closing the page is never intercepted.

Low contrast is intentional; the honest menu has a readable-text mode. Reduced motion disables CSS animations and fleeing controls, and stops continuous 3D wobbling. There are no rapid flashing effects. The intentionally bad form should not be mistaken for a claim of full accessibility compliance.

## Privacy

Form entries and chat messages stay in the JavaScript runtime and are discarded on reload/restart. Only numerical best-run results and sound/motion/text preferences are stored with localStorage, when permitted by the browser. No analytics, backend, tracking cookies or real payment processing are included. CDN requests fetch the graphics library only; they do not contain the form data. Browser storage restrictions are caught and do not prevent play.

## Verification

Included Playwright tests cover the complete unassisted desktop route, validation failures, the extra that rechecks itself, both CAPTCHA rounds, amended terms, mouse and touch dodging, the stalled-loading ending, replay, pause, hint penalties and responsive layouts.

The delivered build was tested through full desktop and 390 px touch-emulated playthroughs with the built-in WebGL renderer and all external network requests blocked. Landing overflow checks also passed at 320, 360, 768, 1024 and 1920 px. The 2D fallback was exercised separately. No uncaught JavaScript errors occurred in those playthroughs. The CDN-loaded Three.js rendering path was not visually exercised in the build environment; network access there was unavailable. Real iOS/Safari hardware was not tested.

To run the tests, install Python Playwright and its Chromium browser, then:

```sh
python3 -m pip install playwright
python3 -m playwright install chromium
python3 tests/smoke.py
python3 tests/mobile_flow.py
```

An existing Chromium binary can be selected with `CHROMIUM_PATH`. Set `HEADED=1` to test a visible browser. On Linux without a display, headed WebGL tests can run under Xvfb:

```sh
HEADED=1 xvfb-run -a python3 tests/smoke.py
HEADED=1 xvfb-run -a python3 tests/mobile_flow.py
```

Screenshots are written to `tests/screenshots/`. Playwright is a testing dependency only, not a game dependency.

See **SPOILERS.md** for the complete solution and **THIRD-PARTY-NOTICES.md** for credits.
