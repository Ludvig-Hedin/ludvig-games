# 2026-10-25: Pigeon rounds, Scrapyard on Normal, Bloop help on phones

- Pigeon solo is now a 3-minute round. The clock sits under the score, and when it runs out a results card shows your chaos score, your best and "Play again". The score goes to the leaderboard then. Online squares keep their 4-minute rounds.
- Scrapyard starts on Normal (2 / 5) for new players. Players who picked a level keep it.
- Bloop shows the "?" How to play button on phones too; the top bar is a little tighter so Export still fits.

# 2026-10-25: polish round across the games

- The round "All games" button no longer covers scores, health, logos or controls in about 35 games (the game moves its own HUD clear of it).
- Bugs fixed: Drop kept running and re-awarding XP after a win; Cinder showed black holes on heads and hands, and quick FIRE taps were lost; Dust shot townspeople on a tap meant to talk; Overtime's touch buttons were cut off on phones; No Brakes' back button sat on the lean button; Karts' home icons were invisible; Flap's late tap after a crash could hit Menu; Pulse paused right at the start; The Eighth Signal's compass never drew; Sunbound dropped input on very quick taps; Six Clues showed hidden cards mid-race; Draw Your Horse's undo after clear; Human, Probably's "a a car".
- Feel and looks: hit direction and shake in Scrapyard, landing rings in Plunder, slow-motion knockouts in Punchy, real night lighting in Dust and Jailbird (power cut), night sky in Cruise, wingtip trails in Skyline, rolling balls in Velvet Pool, light columns and nitro in Neon, steam and frost in Lunch Rush, snowfall in Fresh Tracks, landing shadows in Hop and Cubeville, ghost of your best loop and gate splits in Under Sail, off-screen danger glow in Mosslight, Still House and The Eighth Signal.
- Mechanics: Scrapyard's first drones wait a little before firing; Noodle spawns away from rivals, facing the middle; Higher or Lower starts with clearer pairs; Stacks speeds up more gently.
- Phones: wider or closer cameras where the player filled or missed the screen (Storm, Still House, The Eighth Signal, Sunbound, Ages, Mosslight, Cubeville, Noodle, Pop Island, Punchy); big touch buttons in One More Prompt; keyboard hints hidden on touch.
- Getaway online: a player who left no longer stays as a frozen car, and a player in a hidden tab stays visible.
- Neon online: the second player's game clock could start below zero, which threw an error every frame and dropped them from the room. Fixed; checked twice with two players.

# 2026-10-25: teammates in view in Scrapyard and Mosslight

- Scrapyard (co-op) and Mosslight: every player used to start on the same spot, inside each other's camera, so you could not see your teammate. The first player keeps the spot; the others start a little behind and to the side, where they see the team ahead.

# 2026-10-24: search pages, Play together and an All games button in every game

- Every game has an info page at /<slug>/about/ (what it is, how to play, controls, more games like it), and there is a page per category at /category/<name>/. Titles and descriptions come from seo.json, written from each game's own code around the phrases people search for (for example "fake moon landing game" for One Small Fake). The sitemap lists them all. The footer links to the categories, and the start page ends with a short description.
- A "Play together" button in the header explains the two ways to play with someone: on one device, or nearby with the Mac app.
- Every game has a small round "All games" button in a corner that is free in that game (games.json backButton, picked automatically on desktop and phone sizes). Hidden inside the Mac app, which has its own.

# 2026-10-24: calmer catalog and a Mac app download

- The top of the start page is calmer. The 25 category buttons are now 8 broader categories (Action, Arcade, Sports & racing, Puzzle, Board & cards, Party, Adventure, Chill). Every filter is a dropdown in one row: players, 2D or 3D, category and order. "Group by category" is now the order option "By category". Old links (?cat=Racing, ?group=1) still work.
- The search field is round, with a search icon. The heading is larger.
- "My records" and a new "Download for Mac" are clear buttons at the top right. The link to ludvighedin.com is gone from the header. "Download for Mac" is hidden on phones.
- The download points to the newest GitHub release of the Mac app (desktop/ in the games repo).

# 2026-10-24: hub split for the zero-cost setup (local only, not deployed)

- The start page and its API can now live apart: the page as plain static files on the current account, and leaderboards plus online pairing on a separate Workers Free account, which can only stop working for the day, never bill. Nothing is live yet.
- The API answers only games.ludvighedin.com. Other sites, and the online room connection from other sites, are turned away before anything runs.
- Cheaper under load: turned-away requests write nothing, a player's rank reads at most 1,000 rows however big the board gets, rooms save at most every 10 seconds, and a tab hidden for 5 minutes leaves its room and rejoins when shown.
- If the leaderboard server is busy, out of its daily allowance or unreachable, leaderboards hide quietly and come back by themselves. Online games show their own "can't connect" message.
- Checked in the browser with the page and the API on different addresses: a score posts and shows on the board, Velvet Pool connects device to device through an invite link (and shows "left" when the host goes), and boards hide when the API is down. 90 platform tests pass.

# 2026-10-24: cost lockdown (live)

- The owner's order: no game may be able to cause a bill. The start page now serves its 52 games as plain static files, with no server code, so floods cost nothing. Checked: 41 requests to unknown paths ran 0 Worker invocations. Leaderboards and online play are off until a cost-safe setup is chosen.
- The 13 games with their own sites are offline (addresses detached, workers.dev off), and their cards are hidden on the start page. Geoatlas is paused because its page carried a Google Maps key. Restore steps and conditions: `docs/cost-lockdown-2026-10-24.md`.
- `build.py --only` no longer publishes hidden or external games.

# 2026-10-24: online play goes device to device (local only, not deployed)

- Every online hub game now plays directly between the players' devices (WebRTC). The server only pairs players and passes on the connection setup, so a running match sends it nothing. No game needed changes.
- Measured locally: Cage sent about 310 messages a minute per player through the server before; now a full two-player match costs the server about 10 to 15 requests in total, plus auto-answered pings. Checked in the browser: Velvet Pool (private code, invite link, 8 shots, leave, wrong code), Cage and Under Sail (a minute each), Slither Afterglow (quick match with 3 players, host handover).
- STUN only, no TURN relay (owner rule: zero cost). On the rare network that blocks direct connections, players see "Couldn't connect on this network." and the game's own "opponent left" screen.
- Hard caps on the server: 300 active rooms site-wide, per-room player limits, per-player signaling limits that close abusive connections, rooms that sleep when idle and no repeating timers.

# 2026-10-23: new games Air Hockey, Hoop Rush, Velvet Pool, Hay, You (live)

- Air Hockey (air-hockey.ludvighedin.com) and Hoop Rush (hoop-rush.ludvighedin.com): own Workers; online moved from fast D1 polling (50 ms and 400 ms) to a Durable Object WebSocket per room, no D1, sleeps when idle. Checked live: computer, local, online between desktop and phone, wrong code, full room, friend leaving.
- Velvet Pool (in the hub): rebuilt physics and eight-ball rules, five computer levels, touch aiming, table turns upright on phones, online via the hub relay. Online checked live between desktop and phone.
- Hay, You (formerly HorseTinder, renamed by the owner): match dialog closes, micro copy removed, plain labels (Pass / Like / Carrot), next horse shows behind the card while swiping, images 3 MB → 0.35 MB.
- Gravity Arena: "opponent left" panel live.

# 2026-10-23: old names off the signs, host-away fix (live)

- Owner decisions: start-screen headlines stay; in-world signs now match the new names. Punchy floor logo, pads and ring ads, Scrapyard wall sign, Karts start gantry, Cruise number plate and badge, Horde containers ("HORDE—01"), Lunch Rush receipt, bag logo and tab icon, Neon shops and radio (Neon Records, Radio Neon, Vinyl & Neon), Grove crystal label, Ages tab icon, Pulse editor message, plus page descriptions in several games.
- Overtime, Storm, Draw Your Horse and Punchy: when the host's tab is hidden for 3 s, the host leaves so the match carries on for the others; the player gets a one-tap way back in (Punchy starts a new fight).
- Origin: every new clue checked against Wikipedia/OpenStreetMap; 21 fixed, 32 removed as unfair or contested (including the Dome of the Rock), 275 clues left.
- Ludo setup screen fits one phone screen (live on ludo.ludvighedin.com). Karts no longer shows the R key on touch screens. Games without their own icon now use the site icon, so no 404 in the console.
- Checked: all 50 hub games started and played with keys/mouse and touch at 1280 and 390 px with no errors, no sideways scroll and no NaN; all 58 cards open.

# 2026-10-23: play-test round, more online games (live)

- Every hub game was played by agents in a browser on desktop (1280) and phones (390 and 320, touch), with fixes for broken screens, overlaps, clipped results and tap targets under 44 px. All 50 load with no errors and no sideways scroll at 320 px.
- New online play (quick match, private code, invite link): Overtime (1v1 and 2v2), Punchy (1v1), Overrun (deathmatch), Noodle (shared arena), Flap (live race), Roll (race), Pulse (race), Cruise (ghost race), Storm (co-op), Grove (build together), Draw Your Horse (race), Under Sail (shared sea and regatta). Punchy checked live with a desktop and a phone.
- Existing online games fixed: Horde host not moving for guests, Anything Arena stuck rounds after host left, Pigeon private-room button off-screen on phones, Drop close button opening the leaderboard, Cubeville name tags, Neon online menu unreachable on desktop, Getaway crash when a job fails while driving, Six Clues last player stuck alone, Stacks loser shown the solo screen.
- Longer play: Jailbird nights, Hop and Lighthouse next laps, Human Probably 11 tests, Higher or Lower about 215 cards, Origin 307 clues with practice that avoids repeats.
- Phone play: Dust touch controls, No Brakes slow-motion button and wider view, One Small Fake stage fills the phone, Punchy works upright.
- Slogans, jokey toasts and key hints on touch removed across games. Card previews retaken from the current games (new names, calmer screens). Player counts and three card lines updated for the new online modes.
- External games fixed and redeployed: Hängd keyboard fits phones and errors follow the language, Salvo and Color Clash use their own fonts (no Google requests), Salvo deploy button visible on small phones, Ludo and OX screens no longer scroll, Gravity Arena start screen fits 320 px, grammar fixes ("You starts", "1 strokes") and slogans cut. Their card previews are retaken.
- Local test server now runs a copy of the multiplayer relay (scripts/serve.ts) and `python3 build.py --only <slug>` refreshes one game.

# 2026-10-23: online games on their own addresses (live)

- New external cards, each its own Worker and D1 database: Salvo (sea battle, formerly "Battleship"), Hängd, Little Links, Color Clash, Ludo (formerly "Ludo Club"), Gravity Arena (four in a row), OX (tic tac toe).
- Brand names removed (Battleship, Ludo Club, Connect Four, Rocket League). Online rooms poll at most every 1.5 s and pause in hidden tabs, to stay on the free plan.
- Getaway: fixed a crash every frame with a weapon drawn (the HUD wrote to a removed key-hint element). Lunch Rush: start-screen slogans removed. Overrun: gun game slogan removed.
- Scrapyard and Cinder online modes, Getaway and Neon shared cities are live. Scrapyard deathmatch checked live with two players.

# 2026-10-23: eleven new games (live)

- Overtime: rocket car football against bots, with matches, free play, training and a garage. New touch controls (stick, jump, boost, slide) for phones; keyboard and gamepad as before. Wins board with a trophy button and a top 5 on the results screen.
- Overrun: first-person shooter against bots on three maps and five modes. New touch controls (move stick, drag to look, fire, aim, jump, slide, reload, switch, pause). Kills board on the results screen and behind a trophy button.
- Draw Your Horse: draw a horse, then it races six others (Swedish). Calmer screens, icon buttons and larger tap targets. No leaderboard, since a race place is not a useful score.
- Trumped (meme maker with real photos of a politician) is added hidden. It is not published until the owner decides.
- All three visible games had slogans, eyebrow lines, version stamps and brand mentions removed, and got real gameplay previews. Live on games.ludvighedin.com.

# 2026-10-23: new names inside the games (live)

- 41 games now show their new name inside the game: the tab title, the start screen logo, the top-bar name, share text and error notes (for example Kiln is now Scrapyard, Deadblock is Horde, Neon Run is Neon). Names that were shouted in capitals now read in Title Case (One Small Fake, Six Clues, Pop Island).
- Taglines tied to the old names are gone from the start screens ("After Hours", "Overdrive", "Endless War", "Blood & Dust", "One island. One survivor.", "The Dinner Rush", "No chill.").
- Cubeville no longer shows made-up player numbers or like ratings on its world cards and detail sheet. The real room count in online play stays.
- In-world signs (the Citrus Circuit gantry, the Cage and Kiln arena signs, the Gläntan map label) and story names keep their old wording for now.
- Live.

# Unreleased: calm redesign

- Games open full screen at their own address (for example /pigeon/), with no bar or frame around them. Old /games/ links still work.
- Leaderboards moved into the games: a trophy button opens a calm sheet with 7 days, 30 days and All time, your rank and your name. A small "New best · #3 this week" note appears after a new best and fades away. Games can also show a short top 5 on their results screen.
- The hub now looks like ludvighedin.com: dark, Inter, a small "Ludvig Games" wordmark, links to My records and Ludvig Hedin. Cards show a screenshot, the name and one short line; multiplayer games also show their player count. My records and the missing page match.
- Phones: long-pressing no longer selects text or opens callouts, and double-tap no longer zooms, on the hub and in every game.
- Better search and sharing: every game has its own title, description, preview image and game details for search engines. New sitemap dates, robots rules and llms.txt.
- Hub filters: search, 1 or 2+ players, 2D or 3D, categories, group by category, and Best first or A–Z. Filtered views are shareable links. Games are sorted best first.
- Cards no longer show device text; names appear as written, with old names kept for search engines.
- Not live yet. Checked with local tests and a full build; not checked in a browser or on a phone.

# 23 October 2026 · platform

- Leaderboards for 91 boards across the existing games, with no accounts. Each player gets a random fun nickname they can change. Scores from existing games arrive by themselves, from the best scores the games already save.
- Game pages with a leaderboard show a small panel beside the game (under it on phones, folded away until tapped): 7 days, 30 days and All time, the top 10, your best and rank, and "Change" for your name.
- New "My records" page (/me/), linked from the hub header: your best and rank in every game you have played, plus records saved only on this device.
- Multiplayer relay for new real-time games: join by code, quick match or private rooms, with one automatic reconnect.
- Live with the D1 database and the relay (deployed by the orchestrator on 23 October 2026).

# 22 October 2026 · Ritkaos online, videos and new plan

- Ritkaos: rooms are private by default (a temporary hotfix hid the public room list first). New "Visible to others on my network" toggle, off by default. Quick match with strangers and an Open matches list; public rooms use safe words, fixed settings, auto-start and vote-kick. Swedish and English, picked from the browser language with an SV/EN switch; new English word bank. Verified with 31 local tests and the full live multiplayer test.
- Hub: Ritkaos card now says Swedish or English.
- TikTok: smoother 60 fps FLAP edit with new copy (../tiktok/01-flap-pov-v2.mp4) and a Ritkaos guess-the-drawing clip (../tiktok/02-ritkaos-guess.mp4).
- Payment plan rewritten as free-to-play with paid extras, plus five new game ideas (docs/betalmodell-2026-10-22.md).

# 22 October 2026 · bug fixes, TikTok video and payment plan

- Fixed known bugs across 24 games: SKYLINE touch BOOST/BRAKE, DEADBLOCK phone stutter and lost best scores, touch wording in AFTERGLOW/CAGE, Fresh Tracks and CUBEVILLE no longer need an outside 3D-library service, Goldwake mouse look on touch laptops, EPOCH start freeze, PULSE//SHIFT replay and editor Clear, Slope steering, STILL HOUSE / Eighth Signal touch on resize, Mosslight drag-mining, Pop Island help on phones, Frontier death save, Gläntan pause keys and touch, ASHFALL vanishing supplies, KILN difficulty lock, Higher or Lower editions' result screen, NEON RUN pause scrolling and sound.
- Game frames now allow dialogs (allow-modals).
- Checked all 72 games in an invisible browser on desktop and phone sizes: each loads, starts and takes input without errors (SKYLINE's two old prototypes log a harmless pointer-lock error in the headless browser).
- Recorded a 21-second vertical TikTok edit of FLAP (../tiktok/01-flap-pov.mp4) and wrote the TikTok plan (../tiktok/README.md) and a payment proposal (docs/betalmodell-2026-10-22.md).

# 22 October 2026 · previews, brand names and Ritkaos

- Every card now has a real screenshot from the live game, captured in an invisible browser.
- Removed franchise names and look-alike logos so the games don't borrow trademarks: ROBLOX → CUBEVILLE (new two-square logo, ◆ coins, URL /cubeville/), VICE RUN → NEON RUN, Flappy → FLAP, GTA wording (WASTED, BUSTED, VCPD, GTA-inspired, GTA car names) replaced, Monster can → VOLT, Claude Code header → Agent CLI, Tetris colours and T-SPIN replaced in STACKLIGHT, Glue Gunner, Dead Eye, RE-CAPTCHA and the Geometry Dash credit renamed or removed. Gameplay is unchanged. Higher or Lower keeps real brands as trivia facts.
- Added Ritkaos, the live multiplayer drawing game for 2–12 friends, at https://ritkaos.ludvighedin.com (Cloudflare Worker plus one Durable Object, no accounts).

# 21 October 2026 · curation and fixes

- All 72 games and editions stay public. A short-lived hide of 30 editions was reverted on the owner's request.
- Put Flappy, PIGEON and ONE SMALL FAKE first and gave the newer games clearer descriptions and device labels.
- Deployed the hub to Cloudflare Workers static assets (unmetered static traffic); games.ludvighedin.com now served by Cloudflare; the portfolio stays on Vercel. Added cookie-free Cloudflare Web Analytics to the catalog, player and missing pages.
- Higher or Lower: a miss now opens your result with Copy result, instead of restarting at once. Shared results link back to the game.
- Origin: from 22 October the daily walks all 1,350 clue sets, so the same puzzle no longer returns every six days. Shared results link back to the game.
- Every game: sound comes back after an iPhone call or Siri on the next tap.
- PIGEON shows "tap GRAB to drop" on phones. ONE SMALL FAKE keeps your best take per scene. No Brakes keeps at most eight chaos-course ghosts so saves can't fill storage.
- HEATWAVE · San Sol Remastered: the touch button enters a nearby car even beside a shop or home marker; mute now persists; renamed borrowed GTA wording and a real security brand.
- Removed six byte-identical Finder duplicate files. Analysis and plan: docs/analys-och-plan-2026-10-21.md.

# 21 October 2026

- Added 47 games and distinct editions from Downloads and six owned ChatGPT Sites. The public catalog now has 72 playable entries.
- Preserved originals and duplicate downloads outside the published hub. Kept Ritkaos local by owner choice.
- Isolated imported editions’ saved scores and settings. Kept all existing game sources and routes.
- Allowed text-only entries until real gameplay previews exist.

# Changelog

## 2026-09-30: Powder v2

- Imported the supplied Powder v2 without source changes, keeping its name, URL, capacity, best score and mute settings.
- Added its supplied W/FAST acceleration, S braking, aerial spins, updated course and lift scenery.
- Refreshed the preview from an actual v2 run. Focused checks cover entry, acceleration/braking, jump/spin, pause/resume and stored record/settings retention. Touch handlers/layout use synthetic pointer input with a local coarse-pointer shim; physical phones remain unchecked.
- Kept all 25 visible games and the two hidden entries unchanged. Published v2, verified all 89 live files against the generated output and ten hidden/missing routes return 404. Native fullscreen was unconfirmed in T3; fallback checked and unchanged-wrapper results reused. See docs/powder-v2-2026-09-30.md for verification and release proof.

## 2026-09-30: expanded game collection

- Added Powder, Slither — Afterglow, DEADBLOCK, EPOCH — Endless War, LASTLIGHT, BLOCK HOP, HEATWAVE, Sunbound — The Lighthouse Run, Mosslight and SUNSET DASH.
- Added the supplied Tetris game as STACKLIGHT, preserving the existing driving AFTERGLOW name and records. The catalog now has 25 visible games.
- Updated Higher or Lower and USER HOSTILE v2; timed USER HOSTILE records are separate from the previous edition.
- Hosted Slither r128 and DEADBLOCK r158 locally with licenses; preserved EPOCH's complete editable source privately from deployment output.
- Fixed the new Slither/STACKLIGHT save-key collision by giving Slither independent records and settings.
- Imported the polished Anything vs Anything privately, preserving cancellation, stale-cache guards, share reset and honest unconfigured-AI copy. Atlas and Anything remain hidden. The 1,000 SEK monthly protected-launch plan is unchanged; no paid API was enabled.
- Refreshed real previews and verified the changed entry/player flows. Published all 25 games, verified 89 live files byte-for-byte and ten hidden/missing paths return 404. See docs/game-batch-2026-09-30.md for scope and release proof.

## 2026-09-30: game bug audit and supplied updates

- Imported Paper v4 and the new seven-test HUMAN edition, preserving names, URLs and supplied record semantics; refreshed their real previews.
- Fixed native Enter/Space menu activation in PIGEON, AFTERGLOW, CAGE, Flappy, ONE SMALL FAKE and KILN while preserving pointer-only gameplay control shortcuts.
- Restored AFTERGLOW's paused/results scene after a viewport resize.
- Prevented HUMAN's keyboard Continue from triggering the next test and breaking a clean streak.
- Fixed Origin's successive daily rollovers, honest local score-save failures and wrapper permission for its native score form. Its board remains local.
- Kept Atlas and Anything hidden; no paid AI backend was configured.
- Documented findings and verification scope in docs/game-audit-2026-09-30.md.
- Published the updates and fixes, then verified all 50 live files and eight hidden/missing paths over HTTPS.

## 2026-09-30: game update

- Hid Atlas from this hub, including its preview and sitemap entry.
- Updated PIGEON 0.2, CAGE. 2.0 and KILN 1.2 from the supplied files.
- Added Origin v2, Higher or Lower and USER HOSTILE with real previews and capacity labels.
- Hosted USER HOSTILE's pinned Three.js r160 library locally, preserving its license and native renderer fallback.
- Kept Anything vs Anything out of public routes/assets and Vercel uploads; reviewed its missing AI service and shared limits.
- Fixed canceled AI interpretations and stale shared links in the hidden local source; replaced its unsupported backend claims.
- Documented a server-held-key launch plan with shared throttling, a 1,000 SEK monthly ceiling and automatic pause when exhausted. No AI backend or paid calls were enabled.
- Published the update to games.ludvighedin.com; verified 50 live files against the checked output and eight hidden/missing paths return 404.
- Saved the replaced sources and catalog in task-owned local output backups before updates, since the folder is outside Git.

## 2026-09-30

- Created the minimal Ludvig Games index with twelve game previews, accurate capacity labels and device guidance.
- Added eleven playable pages with game focus, fullscreen, direct-opening fallback and back navigation.
- Imported the new PIGEON and SKYLINE v3 versions; preserved existing game names and stable URLs.
- Renamed TACK's public branding to Under Sail while preserving its existing save keys.
- Listed Atlas as paused with a link to its existing site.
- Created the independent Vercel project, static build, search/share metadata, sitemap and missing-page flow.
- Ensured removed catalog games do not remain in later published builds and keyboard focus returns to the game after fullscreen.
- Published the site on Vercel and verified the connected games.ludvighedin.com domain, pages, game files and previews over HTTPS.
