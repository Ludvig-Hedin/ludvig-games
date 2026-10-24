# Games on a separate Workers Free account (owner decision, 24 Oct 2026)

Ludvig chose option A: every server part of the games moves to a new Cloudflare account on the **Workers Free** plan. Going over the daily limits there makes requests fail until 00:00 UTC. It never bills. The current account (Workers Paid) keeps only the static start page `games.ludvighedin.com`. Static asset requests are free and unlimited on any plan.

## Target layout

| Part | Account | Address |
|---|---|---|
| Start page with its 52 games, static files only, no Worker code | current (Paid) | games.ludvighedin.com, unchanged |
| Hub API: leaderboards (`/api/*`) and P2P signaling (`/mp/ws`) | new Free | `ludvig-games-api.<sub>.workers.dev` |
| The 13 game Workers | new Free | `<game>.<sub>.workers.dev` |

`<sub>` is the new account's workers.dev subdomain, chosen at first deploy (aim for `ludvig`).

## Free-plan limits to design for

These are per account per day, shared by all games:

- Workers: 100k requests, and 10 ms CPU per request.
- Durable Objects: 100k requests and 13k GB-s, SQLite-backed classes only.
- D1: 5M rows read and 100k rows written. At most **10 databases**, which we need exactly: `ludvig_games` plus salvo, hangd, little-links, color-clash, ludo, gravity-arena, ox, chess and mind-games.
- KV: 1,000 writes.
- Script size: **3 MB gzip**.
- R2 bills even on Free, so it must never be used.

No Workers Logs, TURN, R2, AI or paid third-party APIs.

## Rules for every game Worker

- `account_id` must not be hardcoded to the old account. Read it from `CLOUDFLARE_ACCOUNT_ID` at deploy time.
- No `routes` or custom domains. Set `workers_dev: true`, `preview_urls: false` and `observability: { enabled: false }`.
- Keep the gzip script size under 3 MB. Measure it with `wrangler deploy --dry-run --outdir`.
- Make pages static assets wherever possible, so page views cost nothing and don't hit the 10 ms CPU limit. The Worker should run only on `/api/*` and the WebSocket path.
- Fix the audit findings, since they matter for daily-limit exhaustion even on Free:
  - Rejected requests write nothing.
  - Rate limits use the Workers rate-limit binding, not D1 counters.
  - Indexes where queries scan a table (chess `chess_rate_limits`).
  - Hibernating DOs, with no `setInterval` keeping them awake (ritkaos Lobby).
  - No alarms that reschedule.
  - Global caps on rooms.
  - Signed room codes, so unknown codes never wake a DO.
- Turn-based polling stays at 1.5 s or slower.
- Each game shows a calm, existing-style "Busy right now, try again later" state when the API returns 429, 503 or 1027 (daily limit reached), instead of breaking.

## Hub split

- Static deploy: `wrangler.static.jsonc` in ludvig-games, assets only, no `main`, current account.
- API deploy: `wrangler.api.jsonc`, with the P2P room code from `docs/p2p-online.md`, the scores code, CORS limited to `https://games.ludvighedin.com` (plus `http://127.0.0.1:4317` locally), and an Origin check on the WebSocket. The new DB needs a migration with fresh DO classes.
- `assets/ludvig.js` reads its API base from one constant set by `build.py`. In production that is the workers.dev API address; locally it is same-origin.
- Scores move from the old `ludvig_games` D1 (`wrangler d1 export --remote`) to the new DB. The main agent runs the export and import. Export the `scores` table as data only (`--table scores --no-schema`), because the migration creates the tables on the new DB first.
- Built locally on 24 Oct (not deployed): both wrangler files, CORS and the Origin check, rate-limit bindings instead of D1 counters, bounded ranks, throttled room saves and the API base in `ludvig.js`. `ludvig.js` gets the base from `window.__LUDVIG_API`, which `build.py` writes at the top of the published file from `LUDVIG_API_BASE`. Details: `docs/platform-api.md`.

## Order

1. Builders prepare everything locally (no deploys).
2. The owner creates the account. The main agent deploys and checks live, one Worker at a time.
3. Hub cards get the new external URLs. The start page is redeployed static-only.
4. Old Workers on the Paid account are deleted once the new ones are verified. Their D1 databases go after the scores are moved.

## Progress, 24 Oct 2026

- Free account: `cffb5d1b12c3302ecc0745862fbf1f14` (signed in as ludvighedin.se@gmail.com). workers.dev subdomain: **ludvighedin**, so games live at `<game>.ludvighedin.workers.dev` and the API at `ludvig-games-api.ludvighedin.workers.dev`. R2 is not enabled.
- All 10 D1 databases are created, their ids are in each `wrangler*.jsonc`, and every migration is applied remotely.
- Worker deploys are blocked until the owner verifies the account's email address (API error 10034).
- Login: the Free account's Wrangler login lives in its own folder. Run every Free-account command with `XDG_CONFIG_HOME=$HOME/.config/cf-games-free CLOUDFLARE_ACCOUNT_ID=cffb5d1b12c3302ecc0745862fbf1f14`. The default Wrangler login (`~/Library/Preferences/.wrangler`) must stay on the old account, because the mail project's budget watchdog reads it. A device login on 24 Oct replaced it with the Free account by mistake. The old account needs a new `wrangler login --device`, approved while signed in as ludvighedin15@gmail.com.
