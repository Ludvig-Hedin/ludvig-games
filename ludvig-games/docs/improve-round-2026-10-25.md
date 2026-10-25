# Improvement round, 25 October 2026

Owner request (Ludvig, 25 Oct 2026): "Keep improving the games. The graphics, fix bugs, the mechanics, ux etc. Spawn helpers."
Each helper owns a fixed list of hub games (ludvig-games/source-games/<slug>/) and edits nothing else.

## What to do per game
1. Play it first: read the code, then look at it in the shared preview (below) on desktop and phone sizes, the start screen and real play.
2. Fix every confirmed bug you find (errors, broken controls, stuck states, things off screen on phones, unreadable text, broken restart, bad collisions, NaN scores, audio that never resumes, memory growth).
3. Improve, within the game's existing idea and look: graphics (lighting, materials, particles, animation, screen shake/juice, readable HUD), game feel and mechanics (controls, difficulty curve, feedback, balance, pacing, clear win/lose), and UX (first 10 seconds understandable, touch controls on phones, keyboard on desktop, pause/restart, no clutter).
4. Pick the 2–4 changes with the biggest effect for a player per game rather than many small ones. Quality over quantity.

## Do not
- Rename a game or change its visible title/wordmark. Do not remove modes or features. Do not change save keys or storage formats (add new keys and migrate if needed).
- Rewrite or add longer texts. Short functional labels where a control had none are fine; list every added or changed visible text in your report.
- Break multiplayer: games using window.Ludvig.mp must keep quick match, private codes and invite links (?<param>=CODE) working with the same message formats. Never add server code.
- Edit games.json, scores.json, seo.json, build.py, assets/, worker/, desktop/, or another helper's games. No commits, pushes, deploys or wrangler.
- Add network dependencies (CDNs, fonts) — the games must work offline in the Mac app.

## Rules
- Follow docs/calm-ui.md and docs/platform-api.md.
- Back up a game's folder once before your first edit: ludvig-games/output/backups/2026-10-25/<slug>/.
- Performance: smooth on a mid-range phone (DPR capped at 2, adaptive quality, no per-frame allocations that grow, dispose GPU resources).
- Parse-check every changed script (node --check for .js; for inline scripts in HTML, extract and check with node vm).

## Preview
- A shared preview serves ludvig-games/public on http://127.0.0.1:4317/<slug>/ (with a local room server). Do not start or stop servers.
- After editing a game: `cd /Users/ludvighedin/Programming/personal/games/ludvig-games && python3 build.py --only <slug>` (copies only that game into public/). Never run a full `python3 build.py`.
- Screenshots: `mkdir -p "$TMPDIR/<you>" && cd /Users/ludvighedin/Programming/personal/games/desktop && agent-heavy-run browser bun run browser-test:shot "$TMPDIR/<you>" "<name>=http://127.0.0.1:4317/<slug>/" "<name>-phone=http://127.0.0.1:4317/<slug>/@phone" "<name>-play=http://127.0.0.1:4317/<slug>/!<css selector of start button>"`. Look at the PNGs with the Read tool. This call needs the sandbox off (local port). If it says "Blocked: 2 browser job(s) already running", wait 30 s and retry (other helpers share two browser slots). For deeper play tests you may write a small playwright-core script under desktop/tests/e2e/improve-<you>.mjs and run it from desktop/ with `NODE_OPTIONS="--import ./tests/e2e/improve-<you>.mjs" agent-heavy-run browser bun run browser-test:shot "$TMPDIR/<you>"` (the browser lane only admits `bun run browser-test*`, so the script runs first and exits; same launch options as tests/e2e/shot.mjs). Delete the script when done. Headless software WebGL is slow; low fps there is not a bug.

## Report (under 400 words)
Per game: what players get now (plain words), bugs fixed, visible text added/changed, files, checks run. Then: things you found that need an owner decision (bigger redesigns, changed rules or texts) as short proposals. Note anything multiplayer-related you changed so the parent re-runs the two-player check.
