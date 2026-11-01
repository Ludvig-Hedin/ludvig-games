# Sites import, 1 November 2026

Local implementation, not a publication or Mac installer release.

Follow-up: the game-only Mac 0.4.3 release is now published. Web publication is blocked by the
host's fixed route allowlist. See `sites-publication-2026-11-01.md` for current release evidence.

The connected owner's Sites list returned 33 sites in one complete page. The matching record is
`sites-inventory-2026-11-01.json`. It maps renamed games to their existing local names, so Hay, You,
Salvo, Overrun, Overtime and the older imported games are not duplicated.

Added nine missing catalogue entries:

- Six full static games: Pace, Breach, Yeet Club, Last Call, Last Cart and Penthouse Panic.
- Three existing separate games: Chess, Table Tennis and Mind Games. The Mac runtime already
  bundled these games, but the hub had no cards for them.

The catalogue now has 71 visible entries, including 58 hub games and 13 separate game sites.
Sayso, the design lab, Hemläge and Mogge Sushi are apps/sites rather than games. Trumped and the
older Coastal Getaway edition retain their existing owner holds. Atlas and Anything vs Anything
also remain hidden. No site's access settings were changed.

## Source

The six missing games were read from their Sites source repositories. Their `dist` assets are now
editable under `source-games/<slug>/`. Original source, package files and tests are retained in
`editable/`, which the hub builder excludes from publication. Test imports point to the playable
files. Last Cart's editable build writes the playable parent assets; its bundle and source both
contain the daily-date repair. Third-party licenses are retained beside the assets.

Original source revisions:

| Game | Commit |
| --- | --- |
| Pace | b95e7d04aaa86a4c1b1191f3f61486719e15f506 |
| Breach | b1f9013d009089fb381c535338568577154b0209 |
| Yeet Club | f1901384122b0b90c09249f3221dfc900e2294e4 |
| Last Call | 3209d95e7a55762540ef5ed9a5be2cec22c2e7f7 |
| Last Cart | 0f2ee058d02ca5e7afd2d9ced23f9e429f1697ca |
| Penthouse Panic | 50cd62475b3fb426083ca8e44b99825e7c1ad980 |

## Repairs and verification

- Chess: focusing a square raised its opaque background above the pieces. The focus outline now
  uses a transparent overlay. A real-browser comparison checks the piece before/after blur after
  keyboard moves, clicks, capture, drag and promotion. Reintroducing the original CSS fails the
  same image comparison, confirming the reported trigger.
- Yeet Club: an overnight tab retained the previous day's challenge. Fresh daily runs now use
  today's Stockholm date, while retries, records and ghosts retain their round's starting date.
  The real app orchestration test covers midnight, retries and a fresh next-day run.
- Last Call, Last Cart and Penthouse Panic: a round crossing midnight previously saved under the
  finish date. Each now retains its starting date with the round. Browser checks start before
  Stockholm midnight and invoke the actual game's finish path after midnight, verifying that the
  saved record belongs to the starting day. The Last Cart check runs its shipped browser bundle.
- All six imported games opened and started in headless Chrome with external requests blocked.
  Pace accepted input and restarted. No runtime errors were observed in these entry/play checks.
- All 98 focused imported game rule and lifecycle checks passed. This is not a full repository
  test suite or an exhaustive gameplay audit.
- Two catalogue checks also passed: all 13 separate games have reachable entries, and all six
  imports exist in both hub routes and the local Mac bundle with isolated saves.

Evidence: `output/sites-import-check/` contains browser logs and screenshots. Reproducible checks
are `desktop/tests/sites-import.test.mjs`, `desktop/tests/sites-catalog.test.mjs`,
`desktop/tests/e2e/sites-import.mjs` and `desktop/tests/e2e/sites-daily.mjs`.

The local `desktop/bundle` has the six games, updated catalogue/category output and repaired Chess
stylesheet. Existing prepared purchase assets/configuration were retained. Future normal staging
rebuilds from these sources. No DMG, installed app, public site or original ChatGPT Site was updated.

Limits: full touch gameplay, all game endings and multiplayer across devices were not checked.
Breach's optional same-origin `/signal` relay is not supplied by the hub; it retains its existing
PeerJS fallback, which needs internet. Penthouse Panic online play also needs PeerJS signaling.
The earlier publication/server-cost hold remains in force.
