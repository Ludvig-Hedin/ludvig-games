# SKYLINE v3 — Verification record

## Final result

**51 automated checks passed: 21 flight-model checks and 30 browser integration checks. No failures in the final run.** The exact per-test results are in `tests/flight-results.json` and `tests/browser-results.json`.

This record applies to the included `index.html` and source files. It is evidence of the specified tests, not a guarantee that every browser, input device, hardware configuration, or possible gameplay sequence has been tested.

## Method

The Node.js suite imports the actual flight-model source. It simulates fixed time steps and checks position, speed, bank, pitch, altitude, collision state, energy, and gate crossings.

The browser suite uses Playwright with Chromium and SwiftShader WebGL. The complete built HTML is injected into an initially blank page without navigation or network access. This exercises the same inline code shipped to the player, not a mock renderer or alternative build.

Keyboard and mouse actions use actual browser events. Long scenarios combine those events with explicit 120 Hz simulation advances; some collisions and race-end conditions use seeded state. The test harness exposes these seeding/advance methods only when its explicit test flag is set before loading the game. They are not enabled in ordinary play.

Audio is checked using a live AudioContext and its output analyser: the engine produces a non-zero signal, mute reduces the output to silence, and pause/resume changes the continuous output correctly. This is signal-level verification, not a human evaluation of sound quality.

Screenshots were examined for the menu, flight view, and a 390 × 844 narrow-screen layout. A desktop radio/instrument overlap found during review was corrected and is now asserted in the browser suite.

## Model coverage — 21 checks

The checks cover idle ground behavior; W-only takeoff; separating throttle from pitch; left/right turn direction; bank limits; auto-leveling; climb and descent; air and wheel braking; boost consumption and regeneration; stable cruise; gentle landings; hard impacts; water collisions; high-speed swept gate crossing; consistency across 30/60/120 Hz model stepping; matching terrain geometry and collision heights; clean initial/reset state; completing all 20 gates under a deterministic test controller; and a safe held-Down landing approach.

The full-course test verifies route feasibility and terrain clearance within the three-minute limit. It does not claim that a first-time human player will complete the course.

## Browser coverage — 30 checks

The checks cover WebGL/shader initialization; silence before the first user gesture; the airborne start and readable HUD; audible engine output; separate W/S throttle input; left and right turns; leveling after input release; climb and descent; braking; boost; all three camera selections; drag steering and release; paused simulation and cleared input; W-only runway takeoff; a scored gate crossing; the landing-school finish flow; building collision and R recovery; taxi collision; NPC near-miss scoring; the coast-run timer and stopped scoring; focus-loss pause; mute; pause/resume audio; animated AI planes, boats, and vehicles; service roads clear of buildings; the narrow-screen layout; zero outgoing requests; and zero logged runtime or shader errors.

Representative final-run observations are recorded directly in `browser-results.json`, including brake speed, takeoff position/speed, scored gate progression, and the landing result.

## Limits

The tests do not certify Safari or Firefox, real mobile touch ergonomics, gamepad support, GPU performance, physical speaker output, accessibility with assistive technology, or subjective flight feel. Browser integration is automated rather than a claim of extended manual playtesting. The world is procedural and stylized; flight is intentionally assisted arcade flight.
