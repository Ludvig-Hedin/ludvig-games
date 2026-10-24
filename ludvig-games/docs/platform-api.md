# Ludvig Games platform API (leaderboards + multiplayer rooms)

Shared contract for every game on games.ludvighedin.com. Owner decision (24 Oct 2026, `docs/free-account-plan.md`): nothing may be able to cause a bill, so the hub is split in two. No other services, no accounts, no paid APIs.

## Where things live

- **Start page (current account):** `wrangler.static.jsonc`, Worker `ludvig-games`, static files from `public/` only, no `main`, custom domain games.ludvighedin.com. Every request is a free static asset.
- **API (separate Workers Free account):** `wrangler.api.jsonc`, Worker `ludvig-games-api` at `ludvig-games-api.<sub>.workers.dev`, script `worker/index.mjs`, no assets. Bindings: D1 `DB`, Durable Objects `MP_ROOM` (`MpRoom`) and `MP_LOBBY` (`MpLobby`), both SQLite-backed (migration `v1`, `new_sqlite_classes`), and five rate-limit bindings (below). Over the Free daily limits requests fail until 00:00 UTC; it never bills.
- `wrangler.jsonc` still describes the old combined setup (assets plus `run_worker_first`). Do not deploy it (`docs/cost-lockdown-2026-10-24.md`). The script still works there: with an `ASSETS` binding it reads `boards.json` from the assets.
- Board config: `build.py` writes it from `scores.json` (plus `games.json` `boards` lists) to `public/assets/boards.json` for the pages and to `worker/boards.gen.mjs`, which is bundled into the API Worker. A config change needs a rebuild and both deploys.
- API base: `build.py` reads the env var `LUDVIG_API_BASE` (an `https://` origin, or `http://127.0.0.1:<port>` locally; empty means same origin) and puts `window.__LUDVIG_API="<base>";` at the top of the published `assets/ludvig.js`. Every `/api/*` call and the `/mp/ws` socket use it; `/assets/boards.json` stays on the page origin.
- Server logic is split into pure, Node-testable modules: `worker/scores.mjs` (D1 queries, ranking, pruning), `worker/rooms.mjs` (room and lobby rules), `worker/util.mjs` (names, ids, headers, allowed origins, rate-limit rules). Tests: `tests/platform/`.
- Client library for games: `ludvig-games/assets/ludvig.js` (copied to `/assets/ludvig.js`). Games load it with `<script src="/assets/ludvig.js"></script>` (relative `../../assets/ludvig.js` also works from `/games/<slug>/`).

## Player identity (shared across all games)

- `localStorage['ludvig:player']` = `{ id: <random 22-char id>, name: <nickname, 2–16 chars> }`, created on first use. Name defaults to a random fun name ("Brave Pigeon 42"). The hub and every game share the same origin, so this is shared automatically.
- `Ludvig.player` → `{ id, name }` (read fresh each time, so renames in another frame show up).
- `Ludvig.setName(name)` → `Promise<{ ok, name, synced } | { ok:false, error:'bad-name' }>`. Saves locally (works offline) and renames the player's existing leaderboard rows. A blocked name is refused and the old name kept.
- `ludvig.js` keeps `ludvig:player` if a game calls `localStorage.clear()`.

## Leaderboards

### Client (inside a game)

```js
Ludvig.score(board, value, opts?)    // submit a finished run's score → Promise<{ ok, best, rank, week:{rank,score} } | { ok:false, error }>
                                     // opts: { toast: true|false } overrides Ludvig.ui.toast for this call
Ludvig.top(board, period, { limit }) // period: '7d' | '30d' | 'all' → Promise<{ entries:[{rank,name,score,player}], you:{rank,score,player}|null }>
Ludvig.records()                     // → Promise<{ records:[{ game:<board>, best, rank }] }> (all-time, every board played)
Ludvig.boards()                      // → Promise<board config from /assets/boards.json>
Ludvig.format(value, format)         // '1,234', '1:23.45', '$1,500' … for the config formats
```

`board` is the board id (`<slug>` or `<slug>:<mode>`). `score`, `top`, `records`, `boards` and `mp.list` never throw or reject, also offline: failures resolve with `error` set (and empty lists). Requests to a cross-origin API carry no cookies (`credentials: 'omit'`), and POSTs send their JSON as `text/plain;charset=UTF-8`, a CORS simple request, so they need no preflight and `keepalive` posts on page hide work. A failed submit (offline or server error) is retried once, after 5 s or when the connection returns (up to 60 s). After a successful submit the client fires a `ludvig:score` window event (`detail.board`) and, if the game is framed, posts `{ type:'ludvig-score', board }` to the parent.

`player` in entries is a public 12-character id (a hash), never the private player id; compare it with `you.player` to highlight the player's own row.

Games may call `Ludvig.score` at the end of every run, not only on a new best. Older games get scores automatically through the score bridge (below).

### HTTP API

- **Origins:** the API answers only `Origin: https://games.ludvighedin.com`, plus `http://127.0.0.1:4317` when the Worker has the var `DEV=1` (local only). That includes the preflight (`OPTIONS` → 204 with `Access-Control-Allow-Origin`, `GET, POST`, `Content-Type`, max age 2 h) and the `/mp/ws` upgrade. Any other Origin, or no Origin on a request addressed to the workers.dev host, gets 403 with no CORS headers before any binding is touched (no D1, rate limiter or Durable Object). Unknown paths, such as `/api/health`, answer 404 and touch nothing. Allowed responses carry `Access-Control-Allow-Origin` and `Vary: Origin`, including errors, so the page can read a 429.
- `POST /api/scores` JSON `{ game, player, name, score }` → `{ ok, best, rank, week }`: all-time best and rank, and `week: { rank, score }` for the last 7 days (drives the toast).
- `GET /api/scores?game=<board>&period=7d|30d|all&player=<id>&limit=20` → `{ entries, you }`. One row per player: their best score inside the period. Ties share a rank (1, 2, 2, 4); rank = 1 + players strictly better. Limit 1–50, default 10. Top lists are cached per Worker instance for 15 s; ranks per board, period and score for 30 s (both dropped for a board when a score is posted to that instance).
- **Rank cost is bounded:** a rank walks the `(game, score)` index from the score and reads at most `RANK_SCAN` (1,000) rows ahead. Further down a large board the rank is `null`, and the UI leaves the "#rank" part out ("Your best: 1,234", "You · 1,234", no week toast, no rank on My records).
- `GET /api/me?player=<id>` → `{ records:[{ game, best, rank }], player:<public id> }` for "My records".
- `POST /api/name` JSON `{ player, name }` → `{ ok, name }`, renames every row of that player.
- POST bodies are JSON sent as `application/json` or `text/plain` (forms and other types get 415), at most 2 KB. A blocked nickname in a score submit is stored as "Player" so the score still counts. API responses carry the same security headers as static files plus `Cache-Control: no-store`.
- Validation: `game` must exist in the scores config; `score` must be a finite number within the config's `min`/`max`; names are trimmed, 2–16 chars, control/HTML characters removed, and a small blocklist applies.
- **Rate limits** use Workers rate-limit bindings (`ratelimits` in `wrangler.api.jsonc`, numbers in `worker/util.mjs` `RATE_LIMITS`; a test keeps them equal). They keep no rows, so a refused request writes nothing to D1 or Durable Object storage. Keys are hashed IPs, never raw addresses. Per 60 s: score posts 30 per IP (`RL_SCORE_IP`) and 6 per player per board (`RL_SCORE_PLAYER`); renames 5 per IP and 5 per player (`RL_NAME`); new rooms 6 per IP (`RL_ROOM`); room socket opens 20 per IP (`RL_SOCKET`). Order in a POST: Origin, body, validation, limits, then the database. A missing limiter or a database error refuses the request with 503. The bindings count per Cloudflare location and are approximate. The old D1 `rate_limits` table is no longer used (it stays in `migrations/0001_scores.sql`, empty).
- Ordering per game comes from config: `order: 'desc'` (higher is better) or `'asc'` (lower is better, e.g. times).

### D1 schema

```sql
CREATE TABLE IF NOT EXISTS scores (id INTEGER PRIMARY KEY, game TEXT NOT NULL, player TEXT NOT NULL, name TEXT NOT NULL, score REAL NOT NULL, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS scores_game_time ON scores (game, created_at);
CREATE INDEX IF NOT EXISTS scores_game_player ON scores (game, player);
CREATE INDEX IF NOT EXISTS scores_game_score ON scores (game, score);
CREATE INDEX IF NOT EXISTS scores_player ON scores (player);
CREATE TABLE IF NOT EXISTS rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, reset_at INTEGER NOT NULL);
```

File: `migrations/0001_scores.sql` (the `rate_limits` table in it is unused since 24 Oct 2026). Keep at most 50 rows per player per board (pruned on insert): the 30 best overall plus the 10 best of the last 30 days and the 10 best of the last 7 days, so the 7- and 30-day boards stay right after a player's old records.

### Scores config: `ludvig-games/scores.json`

```json
{ "<slug>": { "label": "Pipes", "order": "desc", "format": "int", "min": 0, "max": 100000,
               "key": "<storage key as the game writes it, without the ludvig-games:<slug>: prefix>",
               "match": "exact|prefix|regex", "path": "optional dot path inside a JSON value, e.g. best or records.classic",
               "mode": "optional label when one game has several boards" } }
```

`format`: `int`, `float1`, `time-ms`, `time-s`, `money`. A game can have several boards by using slugs like `flappy-first-person:chill` as keys in the config (board id = `<slug>:<mode>`). `match` defaults to `exact`. `key` is needed only for the bridge; games that call `Ludvig.score` directly can omit it.

New games may instead (or also) list their boards in `games.json`: `"boards": ["<slug>", "<slug>:<mode>"]`. A listed board without a `scores.json` entry gets default rules: label "Score", `desc`, `int`, 0 to 1,000,000,000. Add a `scores.json` entry for times (`asc`), other formats or a tighter range. `build.py` validates both files and skips (with a note) boards whose game is not published.

### Score bridge for existing games: `ludvig-games/assets/score-bridge.js`

Injected by `build.py` into every published game right after `<head>` (like `audio-resume.js`), together with that game's config entry as `window.__LUDVIG_SCORES` (only the entries for that slug). It wraps `Storage.prototype.setItem`, strips the `ludvig-games:<slug>:` prefix, and when a configured key is written with a value that parses to a number (via `path` for JSON values) it calls `Ludvig.score(boardId, value)`. It never changes what the game stores. Order in each game's `<head>`: `audio-resume.js`, `ludvig.js` (every game), the inline config (`window.__LUDVIG_GAME` always, `window.__LUDVIG_SCORES` when the game has keyed boards), `score-bridge.js`, then the game's own scripts. Bridged submits pass `{ source: 'bridge' }`, which turns on the toast by default.

- `path` is split on `.` only, so keys may contain `:` or `-` (`0:normal.score`, `scores.0-0`). It compares the value at `path` with the previously stored value at `path` and ignores equal values, so JSON saves that change for other reasons send nothing.
- Many games save their best mid-run, so each board waits until its best value has been stable for 4 s and submits at most once per 30 s. When the page is hidden (`pagehide`, `visibilitychange`) it sends what the 30 s gap allows; anything else waits in `localStorage['ludvig:bridge']` and goes out on the next visit (dropped after 24 h).
- Values outside `min`/`max` are skipped, and so is 0 on a higher-is-better board (it means "no score yet").
- Existing records stored before the platform are not uploaded; they appear on the board once the game writes a new value.

## In-game leaderboard UI

Games run full screen at `/<slug>/` (no wrapper page), so the leaderboard lives inside the game. `ludvig.js` provides `Ludvig.ui`; always guard with `window.Ludvig?.ui` so a game still works if the script is missing. Everything renders in Shadow DOM, so the game's CSS cannot break it and it cannot break the game. All icons are inline SVG (trophy, close, chevrons; `Ludvig.ui.icons`), never emoji or text glyphs. Taps and keys inside the UI stop propagating, so typing a name or closing the sheet never moves the bird.

```js
const list = Ludvig.ui?.board(el, { board: 'flappy-first-person:classic', limit: 5, periods: ['7d', '30d', 'all'] })
// compact list for a results/game-over screen; list.refresh(), list.destroy()
const sheet = Ludvig.ui?.open({ board: 'flappy-first-person:classic', period: 'all' })   // board defaults to the game's first board
// full-height sheet; sheet.close()
Ludvig.ui.toast = true         // opt in to the "New best · #3 this week" toast for your own Ludvig.score calls
Ludvig.ui.button('br')         // floating trophy button (normally automatic, see below)
```

- `board(el, …)`: appends a block that inherits `el`'s font and color (no own font), with subtle `currentColor` separators, tabular numbers, the player's row highlighted, and a tiny Week / Month / All toggle (hidden when `periods` has one entry). If the player is outside the shown rows it adds "You · #42 · 1,234". It refreshes by itself after a `ludvig:score` for that board. `limit` is 1–20 (default 5). When the board cannot load (API out, unknown board) the whole block hides quietly (`hidden`) and shows again on a later successful refresh.
- **API out:** a 429 or 5xx, an unreadable reply (a Cloudflare daily-limit page has no CORS headers, so the browser reports a network error) or no network marks the API out. Boards hide and the trophy button hides until a later call succeeds. A score refused as `rate-limited` (too many runs in a minute) does not count as an outage. Nothing throws.
- `open({ board })` (shows "Leaderboard unavailable right now." when the API is out): a calm sheet from the right edge (full width on phones), blurred backdrop, close button (Escape and backdrop tap also close), title and mode, **7 days / 30 days / All time** (default All time), top 20, "Your best: 1,234 · #3", and "Playing as <name> · Edit" with an inline field. Games with several boards get previous/next mode chevrons. Focus moves into the sheet and returns on close.
- Toast: after a successful submit that is the player's best this week, a small pill at the top shows "New best · #3 this week" (or "#3 this week"), auto-hides after about 3 s and dismisses on tap. Shown by default for scores sent by the score bridge; for direct `Ludvig.score` calls only when the game sets `Ludvig.ui.toast = true` (or passes `{ toast: true }`). `Ludvig.ui.toast = false` turns it off, also for bridged scores.
- Trophy button: games with at least one board get a 36 px translucent round button that opens the sheet, placed by `games.json` field `"lbButton": "tl" | "tr" | "bl" | "br" | "none"` (default `br`), inset by the safe-area. Games with their own leaderboard entry point set `"none"` (the orchestrator edits games.json). `build.py` passes this as `window.__LUDVIG_GAME = { slug, name, boards, button }`.

## Hub and game pages

- `/<slug>/` is the game's own HTML (copied from `source-games/<slug>/`) with, first in `<head>`: `<meta charset>`, the touch style (no long-press selection/callout, no double-tap zoom, form fields stay selectable), SEO tags (title "<Name> · Free browser game · Ludvig Games", description, canonical, Open Graph, Twitter card, VideoGame JSON-LD), the platform scripts and the cookie-free analytics beacon. The game's own title/description/og/canonical tags are removed in that copy.
- `/games/<slug>/` keeps a copy for absolute asset paths and old links; its canonical points to `/<slug>/` and robots.txt disallows `/games/`.
- Hub (`/`): dark, calm, matching www.ludvighedin.com (Inter 400/500, #080808, 14 px). Cards are a 16:10 screenshot, the name as written and one muted line; multiplayer games also show their player count, never device text. Sorted by `quality` (best first, ties in catalog order). External games (Ritkaos) open their own site.
- Filter bar (`assets/hub.js`): search (name, formerName, description, category), Players All / 1 / 2+, All / 2D / 3D, category chips, Group by category and Best first / A–Z. Filters combine; state is in the URL (`?q=&players=1|2&dims=2d|3d&cat=&group=1&sort=az`). Without JavaScript the bar stays hidden and all games are listed. On phones it is the search field plus one horizontal scroll row.
- SEO uses `name`; a `formerName` that differs is given as `alternateName` in JSON-LD and "formerly …" in llms.txt.
- `/me/`: "My records" page listing the player's bests across all games (from the API plus local data), with links to each game. Records only on this device (offline, or never submitted) show "Saved on this device". Linked from the hub header; not in the sitemap.
- SEO files: `sitemap.xml` (`/` and every `/<slug>/` with lastmod from the source file), `robots.txt` (disallows `/games/`, `/api/`, `/mp/`), `llms.txt`, hub JSON-LD (WebSite, Person, ItemList).

## Multiplayer (direct connections)

One generic room service for all real-time games. Since 24 Oct 2026 gameplay goes device to device over WebRTC data channels (design and the reason: `docs/p2p-online.md`). The server only pairs players and keeps membership, host and meta; it never relays gameplay and never runs game rules. Clients are authoritative for their own player and the room "host" (oldest member) decides shared events. The public API below did not change, so games need no edits.

### Client

```js
const room = await Ludvig.mp.join({ game: 'citrus', room: 'ABCD' })   // join by code
const room = await Ludvig.mp.join({ game: 'citrus', quick: true, max: 4 }) // quick match: fullest open room or a new one
const room = await Ludvig.mp.create({ game: 'citrus', max: 4, visible: false }) // private room, returns a fresh code
room.code; room.self.id; room.peers   // [{ id, name, joinedAt }] including self
room.host                             // id of the oldest peer; changes automatically when they leave
room.seed                             // random 32-bit seed fixed for the room (deterministic games)
room.send(data, opts?)                // broadcast JSON (≤ 16 KB) to everyone else, directly
room.sendTo(peerId, data, opts?)      // direct message, directly
                                      // opts (optional): { reliable: true | false } overrides the channel choice
room.setMeta(obj)                     // small room metadata (≤ 1 KB), visible to all and to the quick-match lobby (e.g. { phase:'racing', track:2 })
room.meta
room.on('join', peer => {}); room.on('leave', peer => {}); room.on('message', (fromId, data, direct) => {}); room.on('host', id => {}); room.on('meta', meta => {}); room.on('close', reason => {})
room.on(...) returns an unsubscribe function; room.off(type, fn) also works; room.on('error', code => {}) for 'too-big' / 'meta-too-big' / 'connect-failed'
room.leave()
Ludvig.mp.list({ game })              // open public rooms for that game: [{ code, players, max, meta }]
```

- `mp.join` / `mp.create` reject with an `Error` whose `.code` is `not-found`, `full`, `rate-limited`, `bad-request`, `timeout`, `offline`, `network` or `unavailable` (also when the site is at its room cap). Wrap them in `try`. `mp.join` needs `room` or `quick: true`.
- **Direct connections.** Every pair of peers shares one `RTCPeerConnection` (full mesh); the peer with the lower id makes the offer, the other asks for one with a `hi`. ICE servers: public STUN only (`stun.cloudflare.com:3478`, `stun.l.google.com:19302`), trickle ICE with candidates sent in small batches. **No TURN relay** (owner rule: online play must cost nothing), so a few strict networks cannot connect.
- **Two channels** per pair, both negotiated (ids 0 and 1): `u` (unordered, `maxRetransmits: 0`) and `r` (ordered, reliable). The client picks per message: a broadcast goes over `u` only when its kind (the `t` / `k` / `type` / `kind` field) is sent at least 4 times a second, it is under 1 KB, and it has the same flat shape as the last few of that kind (same keys; only numbers, strings, booleans or fixed-length vectors; no event lists such as `e`, `ev`, `h`, `r`, `fx`). Everything else goes over `r`: direct messages, rare events, anything with an extra flag or a non-empty event list, packets without a type field, big messages. When a `u` stream pauses for 300 ms, its last message is repeated once over `r`, so the final state always arrives. `{ reliable }` overrides the choice.
- Messages sent before the channels are open (for example right after `join` resolves, or in an `on('join')` handler) wait in a queue (64 per peer) and go out when the channels open. Messages over 16 KB are dropped with `error` `too-big`.
- **Connect timeout.** A peer whose channels are not open after 10 s counts as gone: the client fires `error` `connect-failed`, shows the toast "Couldn't connect on this network." and fires `leave` for that peer, so the game shows its own "opponent left" state. There is no fallback through the server. `room.host` then follows the oldest peer this device can reach.
- A channel that closes with no `leave` from the server within 5 s also counts as a leave. A reloaded page (same peer id) gets a fresh connection.
- **Hidden tabs:** after 5 minutes hidden (`visibilitychange`), the client says `bye`, closes the signaling socket and its direct connections, and stops pinging, so no socket idles on the server. The others get the normal `leave` (and `host`) events. When the tab is shown again it rejoins the same room as the same peer and turns the difference into `join`/`leave`/`host`/`meta` events; meta set while away goes out then. If the room ended meanwhile, `close` fires with `not-found`.
- Reconnect once: if the signaling socket drops, the client reconnects to the same room after 0.6 s while the data channels keep working. The server keeps the player's slot (same peer id, host role) for 8 s, so a short blip is silent; any peer changes meanwhile arrive as normal `join`/`leave`/`host`/`meta` events. Up to 32 signaling/meta frames are buffered while reconnecting.
- `setMeta` replaces the whole meta object (any peer may set it; usually the host). A repeat of the meta the room already has (or that is still on its way) is not sent. Meta `{ open: false }` hides the room from quick match and `list`, e.g. while a race runs.
- `close` reasons: `left` (you called `leave()`), `replaced` (same player opened the room in another tab), `not-found` (room ended), `network`, `full`, `rate-limited`, `unavailable`.
- Peer ids are a short hash of player + game + room: stable across reconnects, never the private player id.

### Server rules

- WebSocket at `/mp/ws?game=<id>&room=<code>|quick=1|create=1&max=<2..16>&name=<nick>&player=<id>` on the API base. The Origin is checked first (see HTTP API), so a foreign page never reaches a Durable Object.
- `MpRoom` Durable Object per `game:code`, on the **WebSocket hibernation API** (`ctx.acceptWebSocket`, `webSocketMessage`), so an idle room costs nothing. Room state is kept in storage and each socket's attachment, so a woken room has the same peers, host, meta and seed. **Storage writes are throttled:** at most one every 10 s per room (`SAVE_MS`; a pending save is a timer, which keeps the object from hibernating, so it is not lost), an emptied room is deleted at once, and the alarm is only set or cleared when it changes. **Meta budget:** the first 10 meta changes per room per 10 minutes are saved and reported to the lobby (`ROOM.metaBudget`); later ones in the window still reach every player at once (relaying costs nothing extra, the incoming frame is counted either way) but are not saved or reported until a later counted change, join or leave carries them along. The client's ping (exactly `{"t":"ping"}`, every 50 s) is answered by `setWebSocketAutoResponse` with `{"t":"pong"}` without waking the room. No intervals and no heartbeat: the only alarm is the 8 s grace sweep for a dropped peer, and it is cleared when nobody is waiting.
- Hard caps, so no client can create cost: max 16 peers per room (and each room's own `max`); per-peer frame limit of 20 per 10 s in a two-player room, plus 10 per extra peer (excess dropped, more than 3× that closes the socket with 4429); and at most 150 frames per peer per 10 minutes, plus 30 per extra peer (over it closes the socket). Max frame 4 KB, max meta 1 KB.
- `MpLobby` is **one** Durable Object for the whole site (named `site`), keeping each game's rooms apart: quick match, `list`, and a site-wide cap of **300 active rooms** (public and private, reserved or running); past it, new rooms are refused with `unavailable` while joining existing rooms still works. The lobby keeps its rooms in storage, so eviction loses nothing. It writes only when its rooms change: a refused quick match, a full site or a repeated report writes nothing. Rooms report `{ players, max, meta, public }` only on change (debounced 1 s; at once when empty). The lobby forgets reservations unused for 30 s and rooms silent for 3 h. Quick match only ever uses public rooms; `create` makes private rooms unless `visible:true`.
- Codes: 4 letters/digits without look-alikes.
- Room creation per IP limited by `RL_ROOM` (6 a minute; a quick match that has to open a new room counts, joining an existing one does not), and socket opens by `RL_SOCKET` (20 a minute).
- Server frames: `welcome {code, self, peers, host, seed, meta, max, public}`, `join {peer}`, `leave {peer}`, `host {id}`, `sig {from, data}`, `meta {meta}`, `error {code}`, `pong`. Client frames: `sig {to, data}` (offer, answer, ICE batch or `hi`), `meta {meta}`, `ping`, `bye`. Gameplay frames (`send`, `to`) are ignored. Refusals are sent as `error` then a close code: 4000 replaced, 4400 bad request, 4404 not found, 4409 full, 4429 rate limited, 4503 unavailable.
- Local dev (`scripts/serve.ts`) runs the same rules in memory and counts what would reach the room server at `GET /__mp-stats` (`?reset=1` starts a new count).

### Local preview

- Same origin (default): `bun run dev` serves `public/` on 127.0.0.1:4317 with the in-memory room server and stub score APIs.
- Cross-origin, like production: `LUDVIG_API_BASE=http://127.0.0.1:4318 python3 build.py`, then `LUDVIG_ROLE=split bun run dev`. Port 4317 serves only static files (`/api/*` and `/mp/*` get the 404 page, like the static start page). Port 4318 is the API: the real `worker/index.mjs` with SQLite in memory (`LUDVIG_DB=<file>` keeps it), in-memory rate limits and `DEV=1`, plus the room server with the same Origin check and limits. `LUDVIG_ROLE=static` and `LUDVIG_ROLE=api` run one side each. Rebuild without `LUDVIG_API_BASE` afterwards to get the same-origin build back.

### Cost guardrails

- A running match costs the server nothing: after the channels open, the signaling socket carries only auto-answered pings and the occasional `join`, `leave`, `host` or `meta`. Measured locally (24 Oct): one two-player match is about 10 to 15 room-server requests in total (2 connects, 4 to 5 signaling frames, a few lobby reports, meta and leave), plus 2 auto-answered pings a minute (about 144 an hour for two players). Cloudflare does not document whether auto-answered pings count as requests.
- Clients still send position updates at most 10 to 12 times per second and only while something changes, to keep phones and networks light.
