> Note (2026-10-23): this record describes the earlier builder-hosted version. The game now runs as its own Cloudflare Worker at https://chess.ludvighedin.com/ with plain polling; see CHANGELOG.md for the current checks.

# Verification record

Recorded on **23 October 2026**. The evidence comprises **101 automated tests**
and a separate **34-check live HTTP/D1 run** against the published application.
Browser checks are recorded separately; API success does not establish a
complete two-browser UI or mobile QA pass.

## Completed automated baseline

**101 tests passed, with no failures or skipped tests.**

| Suite | Tests | Evidence covered |
| --- | ---: | --- |
| `tests/rules.test.ts` | 33 | Legal movement, special moves, draw rules, mating material and notation |
| `tests/game.test.ts` | 20 | Time accounting, increment, snapshots, undo and import/export |
| `tests/room.test.ts` | 20 | Seats, request identity, revisions, draw actions and rematches |
| `tests/room-store.test.ts` | 11 | Actual SQLite conditional writes, API handlers, request safety and retry recovery |
| `tests/online-sync.test.ts` | 6 | Snapshot ordering, server-time estimation, cancellation and seat-token generation |
| `tests/engine.test.ts` | 8 | Protocol, cancellation, difficulty and evaluation semantics |
| `tests/engine-integration.test.ts` | 2 | Actual WASM legal moves at all levels and a forced mate |
| `tests/id.test.ts` | 1 | Valid unique IDs when an HTTP-origin browser omits `crypto.randomUUID` |

Strict TypeScript validation passed for the complete application. A production
build passed, and the local D1 schema was migrated. The observed full 101-test
run completed in 2.316 seconds, including `stockfish@19.0.1`.
This duration is not a performance guarantee.

Engine validation commands:

```sh
node node_modules/typescript/bin/tsc --noEmit --strict \
  --moduleResolution Bundler --module ESNext --target ES2022 \
  --lib ES2022,DOM --skipLibCheck \
  lib/engine.ts lib/sound.ts \
  tests/engine.test.ts tests/engine-integration.test.ts

node --import tsx --test --test-isolation=none \
  tests/engine.test.ts tests/engine-integration.test.ts
```

Use `npm test` for the complete suite. In the managed development environment,
approved unrestricted execution was needed for the real engine tests because
sandboxed child Node processes returned no output. The successful run launched
the actual Stockfish process, rather than mocking its chess decisions.

## Chess rules

The 33 rule tests establish:

- Starting-position counts of 20 legal moves and 400 legal continuations.
- Rejection of impossible movement, wrong-turn moves and king exposure.
- Both castling directions, correct rook movement, undo, and restrictions for
  check, attacked transit squares and lost castling rights.
- En-passant capture, expiry, undo and rejection when it exposes the king.
- Queen, rook, bishop and knight promotions with correct SAN.
- Distinct checkmate and stalemate outcomes.
- Threefold claims, automatic fivefold repetition and non-mutating intended-move
  claims. Position identity includes turn, castling and legal en-passant rights.
- Fifty-move claims, automatic seventy-five-move draws, and checkmate precedence.
- Bare-king, minor-piece and bishop-color mating-material cases.
- Cooperative mating possibilities, including two knights versus a bare king.
- Timeout and resignation impossible-mate exceptions for the tested material
  and forced-capture positions.
- Restoration of FEN, SAN, turn, castling and repetition history through undo
  and reconstruction, plus FEN/PGN round trips and invalid-input rejection.

### Explicit rule limitation

The exact application scope statement is:

> Legal moves, mate, stalemate, repetition, move-count draws, and orthodox
> mating-material cases are adjudicated. General locked-position reachability
> is not exhaustively solved.

The additional forced-continuation proof permits at most seven pieces, six
plies, 96 visited positions and three legal moves per expanded position. A
budget limit returns “unknown”, never proof of a draw. This is not a complete
reachability solver for arbitrary blocked positions.

Consequently, tests do not establish every FIDE dead position or the
impossible-mate exception for every exotic timeout/resignation position. Such
a draw may be missed. A neutral engine score or unsuccessful bounded search
is never used to declare a position dead.

## Game state and clocks

The 20 game tests establish:

- The correct running clock, including black-to-move imported positions.
- Elapsed-time subtraction, one increment per legal move and turn switching.
- Persistent timestamps through JSON reloads, without gifting elapsed time.
- No running clock in a waiting room and no flag in an unlimited game.
- No increment rescue at or after flag fall.
- Idempotent timeout handling, actual flag deadlines and frozen final clocks.
- Unchanged snapshots after illegal moves.
- Correct board and clock restoration on undo, including undoing a result.
- PGN metadata and SAN round trips; FEN imports as untimed local games.
- Special-move FEN round trips and empty, oversized or malformed import rejection.

Explicit timestamp tests do not measure browser clock-display smoothness,
network round-trip time or operating-system clock tampering.

## Multiplayer state machine

The 20 room tests establish:

- A single secret-bound host seat and paused lobby, including a host choosing
  Black and a joining opponent taking White.
- Reconnection with the same hash without changing the seat or clocks.
- Rejection of spectator actions, out-of-turn moves and opponent-piece moves.
- Legal moves with server elapsed time and increment.
- Idempotent accepted request retries, with request IDs scoped to their seat.
- Rejection of stale/future revisions, malformed requests and late moves.
- Draw offers requiring both players to move, opponent-only responses, no
  clock reset, and decline by an opponent move.
- Server-verified claims on the claimant's turn, unchanged state after false
  claims, and blocked play after resignation.
- Mutual rematch consent, color/seat swapping and immutable prior snapshots.

The D1 adapter uses `UPDATE ... WHERE version = ?` to protect commits. The
additional 11 persistence/API tests use an actual SQLite database behind a D1
adapter and invoke the real route handlers. They establish:

- Only one concurrent stale state mutation commits; identical request retries
  both acknowledge the same accepted move.
- State commits preserve concurrent heartbeats, and rematches exchange presence
  timestamps with the authenticated seats.
- Public snapshots omit seat hashes and request ledgers.
- A join with a precommitted token can recover after losing its first reply.
- Stale-revision errors include the current state for immediate recovery.
- Cancelled long polls release their timers.
- Cross-origin and null-origin writes are rejected, and streaming request
  bodies are capped by bytes, including multibyte text.

Six client synchronization tests cover rejecting late snapshots, removing
server polling time from clock-offset estimates, conservative timing fallback,
backoff cleanup and cryptographically random seat capabilities. These checks
exercise real SQL and HTTP request/response handlers in-process. The separate
published-service run below checks HTTP and D1 behavior over the network.

## Published HTTP/D1 integration run

**34 checks passed** against the published Sites application using two
disposable QA rooms, independent player seat credentials and spectator
requests. The run used the supported service access mechanism. No seat
credentials were logged.

The live checks covered:

- Room creation, joining and application-level spectator access without a
  player account; cross-origin requests were rejected.
- Seat-token protection, hidden private state and rejection of spectator,
  illegal and out-of-turn moves.
- Concurrent duplicate submissions and competing revision updates, with one
  authoritative committed game state.
- Server-controlled elapsed time and increment, long-poll delivery and poll
  cancellation.
- Reconnection to an existing seat, draw agreement and mutually accepted
  rematches with swapped colors.
- Resignation and actual clock expiry against the persisted game state.
- Presence expiry after a 19-second wait, reconnecting to the correct swapped
  seat and persistence of the renewed presence state.

These are real HTTP requests against deployed D1-backed routes, not simulated
opponents or only in-process route tests. They establish the tested network
and persistence behavior. They do not establish two simultaneous browser UIs,
touch interaction, load capacity or anonymous access through the Sites hosting
gate. A room link still requires permission to reach the hosting service.

## Stockfish controller and real engine

The eight controller tests establish distinct configurations for all seven
levels, supported Elo clamping, unrestricted analysis after a weaker game,
white-perspective evaluation, stale-result rejection after cancellation,
queued-abort isolation, invalid-output/input rejection, complete history
transmission, terminal-position handling and classification boundaries.

The two integration tests launch the actual Stockfish 19 lite WASM build:

- It returns legal moves at all seven levels and provides a principal variation.
- It finds `...Qh4#` in Fool's Mate and returns the correct negative
  white-perspective mate score.

The lower Elo labels were not calibrated against a rated player pool. Tests
establish operation and configuration, not measured Elo.

## Assets and licenses

The Stockfish JS and WASM files are unmodified copies from the pinned package.
SHA-256 values are recorded in
[`public/engine/NOTICE.md`](../public/engine/NOTICE.md). The exact v19.0.1 source
archive, GPL text and lite NNUE network are included. The network hash matches
its `61e7af4bb97d` filename prefix.

Piece notices identify unmodified Cburnett GPL-2.0-or-later and Chessnut
Apache-2.0 artwork. Sounds are synthesized; no downloaded recordings are used.

## Local migration and deployment helpers

All three helper modules passed Node syntax validation. The local migration
helper applied `0000_glorious_harrier.sql` to a fresh, isolated D1 emulator
directory. A second invocation reported no pending migrations. The test did
not modify the running preview's database.

The standalone deployment helper completed a production build and
`wrangler deploy --dry-run` with Wrangler 4.92.0. Wrangler resolved the absolute
Worker and asset paths, attached 38 additional modules, read 60 static files
and recognized the `DB` binding. The validated Worker bundle was approximately
875 KiB before compression. This validates local packaging, not remote runtime
behavior or available account quotas.

After removing the temporary browser QA fixture, a final full production
rebuild passed. The fixture is absent from both `public/` and `dist/client/`.

The dry run used a placeholder test UUID and performed no login, remote
migration, asset upload or Worker publication. Actual deployment requires a
real Cloudflare account, an existing D1 database and its UUID, as documented
in the README.

## Browser evidence and remaining checks

The application loaded in a real browser after correcting UUID generation for
HTTP development origins. A click move `e2–e4` and a drag move `Ng1–f3` both
succeeded. The browser-loaded Stockfish Worker replied with `...e6` and `...a5`.
This establishes actual board input and a human/AI exchange, beyond the engine
unit tests.

Further browser QA was interrupted when the managed preview served unrelated
applications. Live API checks were subsequently completed against the
published service, as recorded above. Hint completion, two-browser UI play and
mobile layouts remain unverified. This record does not claim a complete
browser QA pass. The published owner-private Sites URL does not establish
anonymous access for a friend.

Remaining browser checks include touch input, promotion, orientation, both
themes, mobile portrait and landscape, result/review dialogs, audio unlock and
horizontal overflow. Two-browser follow-up should exercise room links, refresh
and reconnect, spectator views, clock display and rematches through the actual
UI, in addition to the HTTP-level behavior already verified.

No large-scale room capacity is claimed. The 350 ms D1 polling strategy is
deliberately simple; production capacity and database usage depend on active
players and spectators and require a separate load test.
