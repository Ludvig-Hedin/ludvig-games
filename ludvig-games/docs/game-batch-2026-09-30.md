# Game batch, 2026-09-30

## Result

Eleven new local games and two public updates bring the hub to 25 visible games. Atlas and Anything vs Anything remain hidden. No paid API or server-side AI service was created. The 1,000 SEK monthly cap and pause requirement remain launch prerequisites for Anything.

Tetris is published as STACKLIGHT; the existing driving AFTERGLOW name and saves remain unchanged. Slither — Afterglow keeps its supplied visible name but uses independent slither-afterglow.* save keys. The two new supplied games otherwise both used afterglow.best/afterglow.muted, mixing records and sound settings on this shared origin. STACKLIGHT retains the supplied Tetris namespace. A focused browser check seeds its record and mute setting, confirms Slither ignores that record and leaves both values unchanged when sound is toggled.

Higher or Lower and USER HOSTILE use the latest supplied HTML. USER HOSTILE v2 has a five-minute deadline, fictional interruptions and separate timed records; its old best and settings stay stored. Its fake forms and ads do not create accounts, payments or external popups.

Slither's Three r128 and DEADBLOCK's r158 are hosted alongside each game, with full MIT notices. USER HOSTILE retains local r160. EPOCH's standalone HTML matches the archive and its root license/notices are published; editable source and supplied test artifacts stay local and were not run as acceptance checks.

Anything's polished source is private. Reviewed stale-response/cache guards, cancellation, Home/Exit share reset and honest unconfigured-AI wording are preserved. Its supplied balance update can change outcomes of old share codes. Its provider key, shared limiter, budget ledger and automatic pause still need implementation before publication.

## Checked scope

- All thirteen changed public entries start real gameplay inside their player page with no uncaught script errors, then enter/exit fullscreen and return to the index. Required local Three renderers are exercised. Lastlight and Mosslight allow optional mouse lock and release it before the outer fullscreen controls.
- Real gameplay previews captured on desktop, with original unchanged previews reused. A touch capture initially replaced some development previews; all canonical desktop previews were restored from the completed public snapshot and verified byte-for-byte.
- Emulated 390px touch checks cover all thirteen changed entries, fullscreen/back and shell fit. Selected actions cover Higher or Lower answer selection, USER HOSTILE's frozen deadline in its honest pause menu, Slither sound/save isolation and pause/resume, DEADBLOCK movement joystick, EPOCH troop recruitment, and STACKLIGHT hard drop plus pause/resume. The drop assertion waits for the game's score animation rather than reading the first frame.
- Private Anything uses intercepted local HTML and mocked replies. Surprise, typing, swap, Home, importing a share code and disabling AI cancel pending interpretations. Stale replies cannot poison cache or start old fights. Shared reload and Home/Exit reset work. No provider request occurred.
- A fresh independent source reviewer checked import fidelity, stable names/records, dependency revisions/licenses, EPOCH exclusions, private AI guards and hidden build boundaries. The review's retained Atlas-preview upload observation was resolved with an explicit exclusion.
- Hub checks cover 25 loaded previews, desktop/mobile layout, fullscreen fallback, missing-page return and hidden routes. Production delivery proof is recorded after release below.

## Limits and deferred work

These are focused integration and selected input checks, not full playthroughs of 25 games. Complete iOS Safari/Android Chrome gameplay, all levels/collisions, accessibility paths and media recording remain unchecked. Earlier confirmed defects and their checks remain documented in game-audit-2026-09-30.md. See BACKLOG.md and the private Anything launch plan.

Sources and replaced versions were backed up before imports under output/backups/20260930T063351Z. Download originals were not changed. The folder remains outside Git, so this task has no commit or push.

## Release proof

Published to https://games.ludvighedin.com/ as production deployment dpl_8fG8iKchQHGfy83sMQMAcnfKZgPm. All 89 served files match the checked generated output byte-for-byte over HTTPS. Ten hidden/missing paths return 404, including the two hidden games, private Anything source and EPOCH editable/test paths. The generated custom 404 page is exercised through missing routes, rather than treated as a 200 asset. Evidence is saved in output/deployment-batch-results.json and output/batch-results.json. Local browser checks remained on localhost; no paid browser or AI call occurred. The owned local preview server was stopped after verification. No local dependency/build-cache folders needed cleanup.
