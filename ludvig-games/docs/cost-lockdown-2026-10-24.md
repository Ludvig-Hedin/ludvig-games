# Cost lockdown, 24 October 2026

Owner order (Ludvig, 24 Oct, after buying Workers Paid): no game may ever be able to cause a surprise bill. The limit is 200 SEK for the whole account. If a game is uncertain, take it down. He would rather a game is down than costs money.

## Why everything server-side is off

- On Workers Paid, every request that runs Worker code bills, and so does every Durable Object (DO) message and every D1 write, with no cap. Requests served only from static assets are free and unlimited.
- The account's budget guard (mail project) was running with `ENFORCEMENT=off` and `PLAN=free` on 24 Oct. It would not have stopped a flood.
- Read-only audits of the hub and the 13 game Workers found that a flood of 1k–10k requests per second would cost about $1–250 an hour per game. The worst cases were rooms that stay awake and room creation with no limit.

## Current state (live, checked 00:20 UTC)

- **Hub `games.ludvighedin.com`:** static files only, with no Worker code. A test of 41 requests to unknown paths gave 0 Worker invocations. 52 games play normally, but leaderboards and online play are off (the APIs return 404). The cards for the 10 offline external games are hidden. This was deployed from a temporary copy, so the repo's `games.json` and `wrangler.jsonc` still describe the full setup. The DO classes MpRoom and MpLobby were retired with migration `v2` (`deleted_classes`). A future Worker deploy needs a new migration tag (`v3`, `new_sqlite_classes`).
- **13 game Workers** (ritkaos, salvo, hangd, little-links, color-clash, ludo, gravity-arena, ox, air-hockey, hoop-rush, table-tennis, chess, mind-games): custom domains are detached, and workers.dev and preview URLs are off. They have no crons, and their DOs are quiet. The detached domain list is in `output/backups/2026-10-24-cost/taken-down-*.json`. `npx wrangler triggers deploy` in a game folder puts the domain back. Don't do that until the conditions below are met.
- **Geoatlas (`geoatlas.xyz`, Vercel project atlas-worldguesser):** paused. Its client bundle contained a Google Maps browser key. The owner must restrict or rotate it in Google Cloud.

## Do not

- Do not deploy the hub from the repo (`npx wrangler deploy` in ludvig-games). That would bring back the Worker, the APIs and the hidden cards.
- Do not run `wrangler deploy` or `triggers deploy` for any game Worker.

## Conditions before anything comes back

At least one of these, decided by the owner:

1. **A separate Cloudflare account on Workers Free** for the games. There, going over the daily limits makes requests fail and never bills. This is the only hard cap. The games would need new addresses (workers.dev or another domain), because a zone belongs to one account.
2. **Stay on Paid**, with all of these in place:
   - A zone WAF rate-limit rule in front of every game host. It blocks before the Worker runs, so blocked requests aren't billed. This needs a dashboard action by the owner.
   - The budget guard enforcing on the Paid plan, with games not on its never-touch list.
   - Fixes in every game: hard caps, no writes on rejected requests, hibernation, no endless alarms, logs off, and static pages where possible.

Ready locally but not deployed: P2P online play for the hub (`docs/p2p-online.md`, 75 tests pass), and a builder converting Air Hockey, Table Tennis and Hoop Rush.

## Update 24 Oct, later

All 13 game Workers and the hub API are prepared locally for the Free account (`docs/free-account-plan.md`). They have static pages, rate-limit bindings, room caps and no writes on reject. They are waiting for the owner to create the new account and invite `ludvighedin15@gmail.com` as Super Administrator. The deploy steps for each game are in that game's CHANGELOG and in the plan.

## Static redeploy, 24 Oct evening

The new catalog design (dropdown filters, 8 categories, "Download for Mac") went live the same way as the lockdown deploy: built in a temporary copy with the 10 offline external games hidden, then `wrangler deploy -c wrangler.static.jsonc` (static files only, no Worker script). Checked live: 52 cards, `/api/scores` still 404. The download link points to the GitHub release of the Mac app (`github.com/Ludvig-Hedin/ludvig-games`), not to Cloudflare.

## Static redeploy, 25 Oct

The games polish round went live the same way (temporary copy, 10 offline external games hidden, `wrangler deploy -c wrangler.static.jsonc`, static files only). Checked live: 52 cards, `/api/scores` still 404, the Neon and Noodle fixes are in the served pages.
