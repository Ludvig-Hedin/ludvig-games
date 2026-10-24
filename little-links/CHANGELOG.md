# Changelog

## 24 October 2026

- Ready for the games' Workers Free account (not deployed). `wrangler.jsonc` has no route, custom domain or account id; workers.dev on, preview URLs off, Workers Logs off; the D1 id is the placeholder `REPLACE_ON_FREE_ACCOUNT`. Deploy with `--config wrangler.jsonc` (the deploy script does).
- The page is prerendered at build time and served as a static file (`npm run build` runs `vinext build --prerender-all` and `scripts/static-pages.mjs`). The Worker runs only for `/api/*`; unknown paths get the static 404 page.
- Per-IP limits with the Workers rate-limit binding (create 10, join 30, shots and polls 600 a minute), so rejected requests write nothing. At most 300 live rooms. The expired-room cleanup runs only after a room is actually created.
- Busy, daily-limit or offline: the existing "clubhouse is temporarily unavailable" message instead of a raw browser error, and polling backs off to 15 s while it fails. A tap no longer triggers an extra poll.
- Local dev starts again (`nodejs_compat` was listed twice in `vite.config.ts`).

## 23 October 2026

- Live on https://little-links.ludvighedin.com as its own Worker with its own D1 database.
- Removed the builder platform's Sites scaffolding and about 20 unused UI packages. Plain vinext + Wrangler now.
- Title "Little Links" with description, Open Graph, canonical URL and cookie-free Cloudflare Web Analytics.
- Calm UI: removed the slogans, eyebrows, the course caption, the footer tagline, mode footnotes, hole-theme lines, hole intro subtitles and the keyboard hint under the shot meter. The start screen shows the title and the setup. Dialog headings use plain labels ("How to play", "Settings", "The course").
- The fullscreen button only shows where the browser supports fullscreen (hidden on iPhone). Keyboard shortcuts are hidden on touch devices. Inline SVG replaces the "↙" glyph in the shot hint.
- Phones: pixel ratio capped at 1.25 and cheaper shadows, safe-area insets, 44 px icon buttons, no text selection outside inputs. The start panel sits higher on short phones.
- Online: polling slowed from 0.85 s to 1.5 s, paused in hidden tabs and after 10 idle minutes. Expired rooms are now deleted.
- Fixed "You takes the win." to "You take the win."
