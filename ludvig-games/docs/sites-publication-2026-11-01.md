# Game publication, 1 November 2026

Owner explicitly requested publishing the imported games for both Mac and web after the local import.
This authorizes the game release; existing payment and cost protections remain in force.

## Mac

The 0.4.3 game-only candidate contains all nine added entries, six imported static games and the
Chess focus repair. The previous live-commerce candidate is preserved under
`output/mac-before-sites-2026-11-01/release/`, with its two changed bundle settings beside it.
The release candidate uses an empty native purchase configuration and no remote store-client base,
so this game release does not open the held sales flow. The ordinary staging sources are unchanged.

The rebuilt app passes deep/strict codesign verification. Its update ZIP verifies against the
existing updater public key. `desktop/tests/sites-release.test.mjs` checks actual packaged game
assets, the catalogue, the Chess stylesheet, closed purchases and the authentic ZIP signature.
The actual packaged app launch passed in its invisible isolated test mode: Chess completed e2–e4,
all six imported routes returned 200 and the local store remained closed. Public upload is next.

## Web blocker

The complete generated candidate and hash manifest are retained at
`output/static-policy-release/`, with an additional retained copy at `output/sites-web-release/`.
The guarded check returned **Blocked: unexpected top-level static route.** No upload occurred.

The existing fixed `games-static-publish` operation accepts only the original 52 game routes and
exactly 52 homepage cards. It does not accept the six new routes. Separate game deployments also
lack an approved guarded path: the reviewed Free-account operations currently cover only Ritkaos
and the purchase service, not Chess, Table Tennis, Mind Games or the other held game Workers.

Required host capability work: a reviewed, exact allowlist update for the six named static imports
and a reviewed Free-account game operation for the remaining approved game names. Retain fresh
Free-plan/account proof, isolated credentials, existing bindings, size limits, disabled logs/R2,
resource guards and static-only deployment on the Paid account. Do not bypass the fixed operations
or deploy game Workers on the Paid account. No guard was changed in this task.

Chess and the other separate exports cannot simply be placed in hub subfolders: their root-relative
assets, engine and API paths would break. A static-only conversion would also remove online rooms.
The existing prepared Free configurations preserve the full games without Paid Worker costs.

The host capability maintainer owns this blocker. Root owns publishing and live checks once the
reviewed capabilities are available. The public web hub remains unchanged meanwhile.
