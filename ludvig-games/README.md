# Ludvig Games

A static collection of Ludvig's experimental browser games. Seventy-two public local games and editions. The owner keeps older editions and prototypes public (decision 2026-10-21); do not hide them without asking. Atlas is hidden from this hub; its independent site is untouched. Anything vs Anything is retained privately for a later protected AI launch.

Live: https://games.ludvighedin.com/. The custom domain is connected and responds over HTTPS.

## Content

- `games.json` is the catalog, in display order. `players` means capacity, never plays or active visitors.
- `allowForms` and `allowExternalLinks` were iframe sandbox flags for the old wrapper page. Games now run full screen without a sandbox, so the flags are only validated and kept for reference.
- `category`, `dims` (`2D`/`3D`), `quality` (1–10, hub sort) and `formerName` (old name, used as `alternateName` for search engines) drive the hub filters and sort. All optional; the builder validates them.
- `seo.json`: search copy per game (title, description, intro, how to play, controls, related phrases), per category and for the start page. The builder uses it for the games' titles and descriptions and writes an info page per game at `/<slug>/about/` and a page per category at `/category/<name>/`, all in the sitemap.
- `backButton` (optional, default `tl`): corner of the small round All games button the builder adds to every game (`assets/back-button.js`): `tl`, `tr`, `bl`, `br` or `none`. Picked per game with `desktop/tests/e2e/corners.mjs` so it covers none of the game's own controls.
- `lbButton` (optional): where the floating leaderboard trophy sits in a game with boards: `tl`, `tr`, `bl`, `br` (default) or `none` when the game has its own leaderboard button.
- `hidden: true` omits an entry from the catalog, playable routes, raw game files, previews and sitemap. Hidden entries need no public preview. The clean build also removes previously generated hidden content.
- `source-games/<slug>/index.html` is the editable published game source. PIGEON uses the supplied new HTML; SKYLINE uses v3. SKYLINE's split editable source is retained in `source-games/skyline/editable/`. EPOCH's complete supplied split source and test artifacts are retained in `source-games/epoch/editable/`; its standalone HTML is published.
- `assets/previews/<slug>.webp` contains real gameplay screenshots. Atlas's existing Open Graph preview is retained locally but not published.
- `private-games/` contains unpublished source and is excluded from Vercel uploads. Its files are never copied into `public`. The Anything audit and 1,000 SEK/month launch plan are in `docs/anything-vs-anything-launch.md`.
- `assets/audio-resume.js` is injected by the builder into every published game, right after `<head>`. It resumes Web Audio only after iOS interrupts it (calls, Siri), on the next tap or key, and leaves contexts a game suspends on purpose alone. Canonical sources are not changed.
- `assets/site.css` styles the hub pages (catalog, My records, 404) in the dark style of www.ludvighedin.com. Games never load it.
- Each game is served full screen at `/<slug>/`: the builder copies its folder there and to `/games/<slug>/` (kept for absolute asset paths and old links; canonical points to `/<slug>/`). The old wrapper page with "All games", "Open game" and "Fullscreen" is gone (owner decision 2026-10-23, see `docs/calm-ui.md`).
- `public/` is generated. Never put unique source files or secrets there. Builds replace only this marked generated folder and remove obsolete routes.

There are no accounts or paid runtime APIs in the published site; the only backend is the small leaderboard and multiplayer Worker described under Platform. Cookie-free Cloudflare Web Analytics runs on the hub pages and on each full-screen game at `/<slug>/` (it used to count plays on the wrapper page), not on the `/games/<slug>/` copies. Existing game records are retained. HUMAN’s new points record is separate from its previous completion-time record, which stays stored. Under Sail replaces TACK's visible branding only. USER HOSTILE uses the pinned Three.js r160 file hosted beside the game, with its MIT notices preserved and native fallback retained. It never loads external scripts in this distribution. Its apparent signup fields and ads are puzzles, not a real account, payment or advertising service. The v2 five-minute run uses a separate timed-best key; its old v1 record and settings remain stored. Slither uses separate save keys from STACKLIGHT; STACKLIGHT retains the supplied Tetris save keys and the existing driving AFTERGLOW keeps its own records. Slither r128 and DEADBLOCK r158 libraries are hosted locally with their MIT notices.

## Updating a game

1. Replace `source-games/<slug>/index.html` with the new self-contained HTML. If the new version needs local assets, put them alongside it and preserve relative paths.
2. Keep the slug and public game name. Update its version, controls or capacity in `games.json` if needed.
3. Refresh its preview from the real game.
4. Build, check the changed flow, and deploy.

When a new or updated game needs a fresh screenshot before a full build, prepare only its visible localhost pages, capture, then rebuild:

```sh
python3 scripts/prepare-previews.py origin
agent-heavy-run browser bun run browser-test capture-only origin
python3 build.py
```

Preview preparation never changes the canonical sources, and must never be used as the production build. Capture commands accept several explicit slugs in a single browser session. The Vercel build always runs the complete validated builder.

For SKYLINE split-source edits, edit files inside `source-games/skyline/editable/`, run that folder's standard-library `build.py`, then copy its generated `index.html` to `source-games/skyline/index.html`.

To add a game, create its source folder, add the same manifest fields as the existing entries, and add its preview. `external` is null for hosted games or an HTTPS URL for an external game. The builder rejects duplicate/invalid slugs and missing games or previews.

## Local work

Build with the Python standard library (no package installation):

```sh
python3 build.py
```

Start the small Bun server through Ludvig's installed RAM guard:

```sh
agent-heavy-run dev bun run dev
```

Open http://127.0.0.1:4317/. Stop this server when finished.

Browser checks must reuse Ludvig's existing Dia or installed Chrome, with a browser lease. The historical `scripts/browser-check.cjs` launches Chromium and must not be run under the current owner-browser rule. Never install or launch an extra browser or temporary profile. If the existing browser cannot be used, record the browser verification limit and continue appropriate static checks. Machine guidance is in `~/.codex/guidance/machine.md`.

## Publishing

Cloudflare (from 21 October 2026): the Worker `ludvig-games` serves `public/` as static assets (`wrangler.jsonc`). Since the platform release the same Worker also runs `worker/index.mjs`, but only for `/api/*` and `/mp/*`; every other request is still a plain static file. Build, then deploy:

```sh
python3 build.py
node --max-old-space-size=384 --test tests/platform/*.test.mjs
bunx wrangler@latest deploy
```

First platform deploy only (the D1 database `ludvig_games` already exists; its id is in `wrangler.jsonc`), apply the schema before deploying:

```sh
bunx wrangler@latest d1 migrations apply ludvig_games --remote
```

Later schema changes go in a new numbered file in `migrations/` and use the same command. The Durable Object classes are created by the `migrations` block in `wrangler.jsonc` on the first deploy.

The builder writes `_headers` (security headers), `.assetsignore` and `assets/boards.json` (the board config the Worker reads). Test address: https://ludvig-games.ludvighedin15.workers.dev. `games.ludvighedin.com` is a Worker custom domain (switched 21 October 2026, all 250 live files verified). Static requests are free and unmetered; this also allows ads later. The Vercel project below is a fallback only. The portfolio at ludvighedin.com stays on Vercel and is unrelated.

### Vercel (previous host)

Vercel project: `ludvig-games` in `ludvighedin15-gmailcoms-projects`.

The configured Vercel build runs `python3 build.py` and publishes only `public`. Editable Skyline, EPOCH and USER HOSTILE sources, tests, hidden Atlas preview, local browser output, and environment files are excluded. `.env.local` created by Vercel linking must stay local.

After focused verification, an owner-authorized release uses:

```sh
/opt/homebrew/bin/vercel --prod --yes
```

Domain setup is owned by Ludvig: add `games.ludvighedin.com` in this project's Settings → Domains, then use Vercel's exact DNS instructions in Cloudflare. Keep Cloudflare proxy disabled (DNS only) for the initial connection. Do not change records for the existing personal website. Canonical URLs and the sitemap already target the intended games subdomain.

## Validation scope

The earlier audit checked all fourteen original game entry flows. The latest batch checks the eleven added games and two public updates, fullscreen/back, real previews, hidden missing routes and desktop/mobile hub layout. Emulated touch checks cover their entry flows plus selected recruitment, movement, hard drop, comparison, saving and pause controls. Focused game checks cover confirmed input, resize, round-transition, rollover and saving defects. See `docs/game-audit-2026-09-30.md` and `docs/game-batch-2026-09-30.md`. This is an integration check, not a full gameplay audit. Touch controls were identified in source; every game's complete touch gameplay has not been tested on a physical phone. SKYLINE is labeled keyboard + mouse.

Deployment checks fetch the catalog, game pages, raw game files, styles, scripts and previews from the custom domain and compare them byte-for-byte with verified output. They also verify hidden paths return 404. Browser checks run against localhost; no additional cloud-browser session is used because the available usage record already exceeds the one-hour budget stated in machine guidance.

Atlas's disabled Google Maps API remains the owner's paused-game limitation. Hiding it here does not remove its separate deployment or historic Vercel deployment URLs.

This folder was created outside a Git repository. No unrelated project source was changed and no Git push is part of this deployment.

## Collection import, 21 October 2026

See `docs/game-import-2026-10-21.md` for the 47 new games/editions, original-file locations, storage isolation and verification limits. `preview: false` allows a text-only catalog entry until a real gameplay image is captured.

## Platform: leaderboards and multiplayer (2026-10-22)

The contract for games is `docs/platform-api.md`. In short:

- Every published game gets `/assets/ludvig.js` injected (after `audio-resume.js`): a shared player id and nickname, `Ludvig.score` / `Ludvig.top`, and the multiplayer relay `Ludvig.mp`. No accounts.
- `scores.json` lists the leaderboards: one entry per board, with order, format, range and, for existing games, the storage key the game already writes. The builder injects those entries plus `assets/score-bridge.js`, which turns the game's own best-score saves into leaderboard submits without changing the game. New games call `Ludvig.score` directly and may list their boards in `games.json` (`"boards": [...]`).
- Leaderboards live inside the games (`Ludvig.ui`: a compact board for results screens, a full sheet, a "New best · #3 this week" toast, and a floating trophy button for games without their own). `/me/` shows "My records"; the hub header links to it.
- The builder also writes SEO files: `sitemap.xml` with lastmod, `robots.txt`, `llms.txt`, and per-game title, description, canonical, Open Graph and VideoGame JSON-LD.
- Every game and hub page gets a small touch style: no long-press selection or callouts and no double-tap zoom on phones, while form fields stay usable (owner decision 2026-10-23).
- Server: `worker/index.mjs` with D1 (`DB`, table `scores`, `migrations/`) and two SQLite-backed Durable Objects (`MpRoom`, `MpLobby`). Pure logic in `worker/scores.mjs` and `worker/rooms.mjs`. Everything fits the Workers Free plan at small scale.
- Tests (Node 22, no packages): `node --max-old-space-size=384 --test tests/platform/*.test.mjs`. They run the real SQL against `node:sqlite`, the room and lobby rules, the Worker HTTP handlers, the browser scripts with fake storage and sockets, and the generated build (run `python3 build.py` first).
- Existing records saved before the platform stay on the device and show on `/me/` as "Saved on this device"; they reach a board when the game saves a new value.
- Pre-change copies of edited files: `output/backups/2026-10-22-platform/` and `output/backups/2026-10-23-redesign/`.

## Brand names (owner decision 2026-10-22)

Do not use third-party game, company or product names or look-alike logos in titles, menus, HUD text, metadata or art. Keep the gameplay. Factual trivia about real brands in Higher or Lower is the exception. Pre-change files are in `output/backups/2026-10-22-brands/`.

## Ritkaos

Multiplayer drawing game, source in `../ritkaos/` (deploy there with `bunx wrangler@latest deploy`). It is an external card here. `node --test tests/remote.test.mjs` in that folder plays a full match against the live server.
