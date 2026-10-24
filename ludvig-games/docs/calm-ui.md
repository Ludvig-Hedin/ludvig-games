# Calm UI rules for every game (owner direction, 23 October 2026)

The owner wants the games and the site calmer, with less micro copy and clutter, the game filling the whole screen, and leaderboards inside each game.

## Remove

- Eyebrow labels and kicker lines ("A VERY MINOR PUBLIC EMERGENCY", "FOR FRIENDS. NOT ART CRITICS.", "ONE BUTTON. A NEW POINT OF VIEW.").
- Decorative slogans, jokey footers and sign-offs ("A LITTLE FLIGHT. A LOT OF FEELINGS.", "Talent is entirely optional.").
- Toasts and banners that only comment ("5 PIPES. STILL A BIRD."). Keep toasts that tell the player something they need.
- Repeated key hints when the same help exists behind a "?" or pause menu. On touch devices never show keyboard hints.
- Version stamps, credits and "inspired by" lines in the UI (license notices stay in source files).
- Extra chips/badges/pills that repeat information.

## Keep

- The game title (one line) and at most one short functional line on the start screen (≤ 8 words, plain).
- Buttons, HUD essentials (score, time, health), pause, sound.
- Controls help behind a "?" or in the pause menu.
- Jokes that are the gameplay itself (USER HOSTILE's fake form, HUMAN's tests, permission prompts in the tycoon, quest names), but trim the chrome around them.

## Copy voice

Plain, short, direct. No marketing tone, no filler. Results screens: a number, a short label, "Play again". One short line of personality at most, never three.

## Layout

- The game page IS the game: it fills `100dvh`/`100vw`, respects safe-area insets, no wrapper or back button (the browser has one).
- No horizontal overflow at 320–430 px widths; nothing clipped off-screen; HUD items never overlap each other or the notch/status bar area.
- Tap targets ≥ 44 px. Fewer, larger controls on phones.
- If the game has its own fullscreen button, hide it where the Fullscreen API is unavailable (iPhone).

## Leaderboard inside the game

Use the platform component from `/assets/ludvig.js` (see `docs/platform-api.md`, section "In-game leaderboard UI"):

```js
Ludvig.ui?.board(containerEl, { board: '<boardId>', limit: 5, periods: ['7d', '30d', 'all'] }) // renders a compact list that inherits the container's font and color
Ludvig.ui?.open({ board: '<boardId>' })   // full sheet with 7 days / 30 days / All time
```

- On the results/game-over screen: embed a compact board (top 5 this week + your rank) under the score.
- On the start screen or pause menu: a small trophy icon button that calls `Ludvig.ui.open`.
- Everything must be guarded: if `window.Ludvig?.ui` is missing, show nothing.
- Board ids come from `ludvig-games/scores.json` (read it; e.g. `flappy-first-person:classic`).

## Added 23 October 2026

- Icons: real inline SVG icons (simple stroke, `currentColor`, consistent per game) instead of emoji or text glyphs (✕ ⏸ 🔊 ↗ ★) in buttons and HUD. Character art may stay as it is.
- Phones must be genuinely playable: the play area gets most of the screen. Collapse to a slim top HUD (2–3 key numbers), drop footers and secondary panels on small screens, small or auto-hiding captions, compact controls at the bottom. Owner example: ONE SMALL FAKE on iPhone left almost no visible stage.
- Long-press text selection, callouts and double-tap zoom are disabled globally by the platform injection; form fields stay selectable.
- Owner's own examples of clutter to delete (Ritkaos, apply the same everywhere): "MÄSTERVERK? DISKUTABELT.", "Konstvärlden återhämtar sig aldrig.", "Ansluten" status text (use a dot), "ATELJÉN ÄR ÖPPEN", "KVÄLLENS SÄMSTA KONSTNÄR", "INGEN AI RITAR ÅT DIG. TYVÄRR.", "✳ GJORT FÖR ATT BLI FULT", "Bara dåliga teckningar". Rule of thumb: if a line isn't a label, a button, a needed status or an instruction, delete it.
- Clicking a game's logo or wordmark goes to that game's start screen (with a short confirm if it would end a run or leave a room), never to help.
