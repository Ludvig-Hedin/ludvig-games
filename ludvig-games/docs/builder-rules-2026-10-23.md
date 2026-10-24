# Shared rules for game builders, 23 October 2026

- Follow docs/calm-ui.md (calm UI, SVG icons, phone-first, no clutter) and docs/platform-api.md (Ludvig.mp relay, Ludvig.score, Ludvig.ui boards).
- Do NOT rename games or change their visible title/wordmark: a rename sweep runs afterwards (new names are in games.json `name`).
- Back up every file before editing to ludvig-games/output/backups/2026-10-23-round2/<slug>/.
- Edit only your assigned game folders. Never edit games.json, scores.json, build.py, assets/, worker/.
- Keep save keys and storage formats; if you add progression data, add new keys and migrate safely.
- Performance budget: must stay smooth on a mid-range phone (cap DPR at 2, adaptive quality, no unbounded allocations per frame, dispose GPU resources).
- Multiplayer: client-authoritative per player, host (oldest peer) owns shared events, ≤ 12 msgs/s per client, small payloads, works through quick match + private code + invite link (?<game>=CODE). Hosting cost must stay near zero.
- No servers, browsers or wrangler. Parse-check every changed script with node vm (`node --max-old-space-size=768 --experimental-vm-modules`). Where logic is separable, write a small node test.
- Report under 300 words: what players get, files, checks, what to test in a browser.
