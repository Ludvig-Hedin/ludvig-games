# Chess

Chess with Stockfish, pass-and-play, and private online games. Built with React,
TypeScript, vinext, Cloudflare Workers and D1. Light and dark themes, four board
palettes and two vector piece sets.

Live: https://chess.ludvighedin.com/ (Cloudflare Worker `chess`, D1 database `chess`).

## Run locally

Node.js 22.13 or newer. No account or API key is needed; Wrangler emulates D1 locally.

```sh
npm ci
npm run db:migrate:local   # once: local D1 schema in .wrangler/state
npm run dev
```

Online rooms need the Worker and D1, so do not open `index.html` directly.
Stockfish and the piece artwork are bundled; no CDN requests at runtime.

## Play

- **Play now:** start a computer game with the selected settings.
- **Computer:** choose one of seven difficulty levels, your color, thinking
  time, hints, takebacks and a time control.
- **Local:** two people share a board. Optional automatic rotation follows the
  player to move. Takebacks and agreed draws ask both players to confirm.
- **Online:** enter a nickname, create a room and share its link or eight-character
  code. The second player takes the empty seat. Further visitors can watch.
- **Review:** open a finished game, step through its moves and run Stockfish
  analysis. Import a PGN game or a FEN position through the home screen.

Click or tap a piece, then its destination, or drag and drop. Promotion opens a
piece picker unless auto-queen is enabled. Online premoves are checked again
against the authoritative position before submission.

| Control | Action |
| --- | --- |
| `F` | Flip the board |
| `M` | Mute or unmute |
| `←` / `→` | Step through move history |
| `Escape` | Close a dialog or cancel board selection |
| Right-drag | Draw an arrow |
| Right-click | Mark a square |
| Pencil button | Enable touch annotations |
| Focused board + arrows, then `Enter` | Navigate squares and select a piece or destination |

Shortcuts are ignored while typing. The board respects reduced motion
preferences. Sound starts after a user gesture, with volume and mute controls.

Time presets are unlimited, 1 minute, 2+1, 3 minutes, 3+2, 5 minutes, 10 minutes,
15+10 and 30 minutes, with custom time and increment settings. An increment is
added only after a legal move completed before flag fall.

## Online architecture

Online games use the same chess rules as local games, but the **server decides
whether a move is accepted and how much time remains**. Online rooms contain
real players, never simulated opponents.

1. The server creates a room and an unpredictable seat token. Only its SHA-256
   hash is stored in D1.
2. Each action includes the token, expected game revision and a unique request
   ID. The server validates the seat, turn, clock, legal move and revision.
3. A conditional D1 update against the stored database version commits the
   change. Concurrent requests cannot overwrite the same position.
4. Accepted request IDs suppress duplicates. Retrying an accepted move does
   not play it twice; stale revisions are rejected and refreshed.
5. Clients poll with plain HTTP requests (one D1 read each): every 1.5 s on the
   opponent's turn, 3 s on your own turn, 4 s while waiting for a player or
   after the game, and 10 s in a hidden tab. Returning to the tab polls at once.

This is not a WebSocket implementation; update latency includes the polling
interval. D1 persists rooms across Worker restarts. If the opponent has been
away for 15 s, the remaining player sees "<name> left." with "Play computer"
and "Back to menu".

Draw offers, acceptance, rejection, claims, resignation and rematches use the
same server validation. A rematch requires both players and swaps colors.
Spectators cannot perform game actions. A disconnected player retains their
seat, and the clock continues running.

### Access and reconnecting

A room is private by its code: anyone who knows the link can join an available
seat or watch. There is no public room directory, rating system or account
registration. A room code does not prevent its holder from spectating.

Seat tokens stay in `sessionStorage`. Refreshing the **same tab** reconnects
that seat. The invite link contains no token and does not recover a seat in a
different browser or device. Closing the tab or clearing its storage can lose
the seat; anonymous sessions do not provide account recovery.

Rooms become unavailable after 30 days without a game-state update. Connection
indicators reflect recent authenticated activity. Creation and joining have
server-side rate limits. Public responses omit seat secrets and request ledgers.

## Saved games and clocks

Preferences, setup choices, the unfinished local/computer game and the 30 most
recent finished games are stored in this browser's `localStorage`. They do not
sync between devices. PGN export is the portable backup; FEN exports a position
without its earlier move history.

Local and computer games need no online-room API after the application and
engine assets have loaded. This is not an installable offline PWA: a fresh page
load still needs the application server or cached assets.

Clocks use a stored balance plus a timestamp, rather than counting timer
callbacks. They continue while a tab is hidden, while reviewing history and
after leaving the board. Refreshing an expired game preserves the original
flag deadline. Online clocks use server time; local clocks use the device's
clock. Disconnecting never pauses an online game.

Imported FEN and PGN files open as untimed local games. Exported PGN includes
SAN, player names, result, date, time control and a nonstandard starting
position when applicable.

## Stockfish and analysis

Stockfish.js **19.0.1**, lite single-threaded WASM, runs in a dedicated Web
Worker. The JS and WASM files total approximately 1.8 MB. This build needs no
`SharedArrayBuffer` or cross-origin-isolation headers.

| Level | Displayed approximate strength |
| --- | --- |
| Beginner | 400 |
| Easy | 700 |
| Casual | 1000 |
| Intermediate | 1300 |
| Advanced | 1600 |
| Expert | 1900 |
| Master | 2200 |

These are difficulty indicators, **not measured FIDE, Chess.com or Lichess
ratings**. Higher levels use native `UCI_LimitStrength`/`UCI_Elo`, clamped to
Stockfish's supported range. Lower levels combine `Skill Level`, shallow search
and weighted selection among engine-evaluated MultiPV candidates. They do not
choose unchecked random moves. Thinking time and device speed affect strength.

Restarting, leaving or cancelling invalidates queued calculations and terminates
their worker. Old results cannot enter a new game. Hints are available when
enabled in computer games; live online games expose no engine analysis.

Post-game analysis uses unrestricted strength. The full-game pass spends
400 ms per position; inspecting an unevaluated position uses 700 ms. Positive
scores favor White; mate distance is reported separately. Principal variations
show the suggested continuation.

Move labels use centipawn loss from the moving side's perspective:

| Loss | Label |
| --- | --- |
| 0–15 | Best |
| More than 15, less than 50 | Good |
| 50–99 | Inaccuracy |
| 100–249 | Mistake |
| 250 or more | Blunder |

Negative losses from differing search results are clamped to zero. Forced mate
uses a large signed score. Labels are consistent search-budget estimates, not
a certified accuracy rating. No invented online ratings or Elo changes appear.

## Rules scope

`chess.js` 1.4.0 validates movement on both client and server. The shared rule
layer distinguishes threefold and fifty-move **claims** from automatic fivefold
and seventy-five-move draws. A player may claim before making an intended
qualifying move. Checkmate takes precedence over the seventy-five-move rule.
Tests cover castling restrictions, en passant, all four promotions, SAN, FEN
and PGN.

The exact scope statement exported by `lib/rules.ts` is:

> Legal moves, mate, stalemate, repetition, move-count draws, and orthodox
> mating-material cases are adjudicated. General locked-position reachability
> is not exhaustively solved.

The rules also prove some forced low-material dead positions. A limited search
that finds no mate is never treated as proof of a draw. In an exotic blocked
position outside those proofs, the application may miss a dead position or
the impossible-mate exception at timeout/resignation. Players can agree a draw.
This build therefore does not claim exhaustive adjudication of every possible
FIDE dead position.

The checks distinguish inability to **force** mate from impossibility under any
legal continuation. For example, two knights against a bare king are not
automatically declared insufficient merely because they cannot force mate.
See [the verification record](docs/VERIFICATION.md).

## Project structure

| Path | Responsibility |
| --- | --- |
| `app/page.tsx` | Home, setup, game flow, history, review and dialogs |
| `components/Board.tsx` | Board, pointer/touch/keyboard interaction and annotations |
| `components/Settings.tsx` | Display and interaction preferences |
| `lib/rules.ts` | Shared adjudication and draw claims |
| `lib/game.ts` | Game transitions, clocks, undo and notation |
| `lib/engine.ts` | Stockfish Worker lifecycle, strength and analysis |
| `lib/sound.ts` | Procedural Web Audio sounds |
| `lib/room.ts` | Server room state, permissions and idempotency |
| `lib/room-store.ts` | D1 persistence, conditional writes, token hashes and presence |
| `lib/use-online.ts` | Reconnection, paced polling and room requests |
| `app/api/rooms/` | Room creation and play endpoints |
| `db/schema.ts`, `drizzle/` | D1 schema and SQL migrations |
| `worker/index.ts` | Production Worker entry point |
| `public/engine/`, `public/pieces/` | Bundled engine, artwork, source and licenses |

Client and server share one rule implementation. Stockfish proposes moves;
`chess.js` validates them. Online clocks never trust client-supplied time.

## Tests

```sh
npm test
npm run typecheck
npm run build
```

The automated baseline is **101 passing tests** (rules, game and clocks, room
state, D1/API, client sync, engine controller and real Stockfish WASM).

[docs/VERIFICATION.md](docs/VERIFICATION.md) separates automated evidence from
browser, network and deployment checks.

## Develop, build and deploy

```sh
npm ci
npm test
npm run typecheck
npx vinext build                                  # writes dist/
npx wrangler d1 migrations apply chess --remote   # only when drizzle/ changes
npx wrangler deploy --config dist/server/wrangler.json
```

`wrangler.jsonc` holds the Worker name, the `DB` binding and the
`chess.ludvighedin.com` custom domain. After changing `db/schema.ts`, run
`npm run db:generate` and keep applied migrations unchanged.

## Licenses

Application source is **GPL-3.0-or-later**; see `LICENSE`. Third-party files
retain their original notices and licenses.

- **Stockfish:** GPL-3.0-or-later. Its exact source archive, lite neural network,
  build notes and GPL text are included. See the
  [engine notice](public/engine/NOTICE.md).
- **Classic pieces / Cburnett:** Colin M. L. Burnett, GPL-2.0-or-later.
- **Modern pieces / Chessnut:** Alexis Luengas, Apache-2.0. Both sets are
  unmodified; see the [artwork notice](public/pieces/NOTICE.md).
- **chess.js:** BSD-2-Clause. Other dependencies retain their package licenses.
- **Sounds:** synthesized by the app; no third-party recordings are included.

Primary references:
[FIDE Laws of Chess](https://handbook.fide.com/chapter/e012023),
[chess.js](https://github.com/jhlywa/chess.js),
[Stockfish UCI documentation](https://official-stockfish.github.io/docs/stockfish-wiki/UCI-Protocol-and-Stockfish-Commands.html),
[Stockfish.js 19.0.1 release](https://github.com/nmrugg/stockfish.js/releases/tag/v19.0.1).
