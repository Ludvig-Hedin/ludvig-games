# Game collection import · 21 October 2026

Added 47 public games and distinct editions, bringing the public catalog to 72.
The six owned ChatGPT Sites were exhaustively listed (one page, no next cursor).
VICE RUN has separate downloaded, After Hours and Coastal Getaway editions.
COLD!, Strandad · Antarktis, Just One More Prompt and ASHFALL ’84 were recovered from their original Sites source/publications. No Sites access settings changed.

Original Download games, source ZIPs and project folders were moved to
`../downloads-2026-10-21/`. The task output move journal records all 78 moves
and verifies file hashes. Exact duplicates are retained there without duplicate
menu entries. Pigeon prototypes have identical HTML but different scripts/styles,
so both are included. Existing canonical game sources and slugs are unchanged.
Original Sites exports are retained outside the published hub in `../chatgpt-sites-2026-10-21/`.

New editions use `assets/game-storage.js` to scope scores and settings by slug.
Existing published editions retain their previous storage keys. New cards use
`preview: false` until real screenshots are captured. No placeholder artwork is
presented as gameplay. All player pages retain fullscreen and direct-open links.

The Prompt runtime mounts the original compiled client React page. COLD! uses
its original production bundle. Both include their local dependencies and license
texts. Only inspected runtime assets are included in source-games. USER HOSTILE
v1 uses the existing pinned local Three.js r160 and its notices.

Ritkaos remains local by owner choice. Its ZIP and current folder are different
snapshots and both are preserved. It needs an always-on Node/WebSocket host.
Atlas and Anything vs Anything retain their existing hidden state and requirements.

## Checks

- All 47 imported game runtimes parse: 143 JavaScript scripts/modules.
- Focused storage checks prove variants cannot read, overwrite or clear each
  other’s records, or existing live-game records.
- The standard-library builder creates 72 catalog and player routes.
- All 72 generated player/raw routes exist; sampled localhost routes respond with HTTP 200.
- A fresh independent reviewer found one incorrect share-image fallback; it was fixed and all player metadata was checked. CodeRabbit could not run because this existing project has no Git repository.
- Browser play checks are blocked by a pre-existing Dia debugging-access prompt. No debugging access was approved. Gameplay and fullscreen remain unchecked in this session.
- Published to the existing Vercel production project. Deployment `dpl_FxxJ33piPjQhHB4rspoz34f85qDu` is READY and aliases games.ludvighedin.com. Live file verification is recorded in the task output report.

Recheck imports with `node --max-old-space-size=256 --experimental-vm-modules scripts/check-import.cjs`.
This is a focused syntax/storage check, not a complete gameplay suite.
