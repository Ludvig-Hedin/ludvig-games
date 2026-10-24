# Changelog

## 2026-10-24

- Ready for the games' Workers Free account (not deployed). `wrangler.jsonc` has no route, custom domain or account id; workers.dev on, preview URLs off, and an explicit `observability: { enabled: false }`; the D1 id is the placeholder `REPLACE_ON_FREE_ACCOUNT`.
- The page is prerendered at build time and served as a static file (`npm run build` runs `vinext build --prerender-all` and `scripts/static-pages.mjs`). The Worker runs only for `/api/*`; unknown paths get the static 404 page.
- Real per-IP limits with the Workers rate-limit binding (create 10, join 30, moves and polls 600 a minute); rejected requests write nothing. A malformed room key is refused before any D1 read. At most 300 live rooms; expired-room cleanup runs only after a room is created. A poll writes "last seen" at most every 12 s (presence is 20 s).
- Busy, daily-limit or offline: platform error pages no longer break the JSON parse; the existing reconnect and "Could not connect to the room." paths show. The unused `watchRoom` helper now matches the 1.5 s polling rule (it polled every 800 ms).

## 2026-10-23

- Live: the "opponent left" panel is now built and deployed (checked live with two players, desktop and phone, both buttons). Phone result buttons are 44 px tall.
- Online: when the other player has been away for 15 s, the remaining player sees "<name> left." with "Back to menu" and "Play computer". Both leave the room for good (no "Return to your room" afterwards). If the opponent comes back first, the panel disappears.
- First deploy as its own Cloudflare Worker at https://gravity-arena.ludvighedin.com/ with its own D1 database.
- Removed the trademarked game name from every visible string, rules text, board labels and metadata ("four in a row" instead).
- Calm UI: removed the home slogans, edition label, caption, "give it a spin" note, home footer, result taglines and modal taglines; modal titles now use their plain labels (Settings, How to play, Move history, Play a friend, Your stats). Stats and How to play moved to header icons. Wordmark in Title Case. No "Back to home" button; the logo returns to the start screen.
- Phone: 100dvh with safe areas, 44 px tap targets, no long-press selection, the stack map no longer covers the drop button, and the scene can no longer shift sideways.
- Online polling: 1.5 s (was 0.8 s), paused while the tab is hidden or the room is not on screen.
- SEO and metadata: plain title and description, Open Graph tags, canonical URL, Cloudflare Web Analytics.
