# Mobile fields and HTTP repair, 1 November 2026

The owner reported missing Chess results, iPhone input zoom and an address-bar warning.

Live browser evidence confirmed 52 cards with no Chess entry. This is the previously blocked web
release, not a search failure. The Mac 0.4.3 release has Chess. The additional web game routes and
separate Free-account deployments remain blocked as recorded in `sites-publication-2026-11-01.md`.

The live search input computed to 14px. Phone-sized and coarse-pointer fields now use 16px,
preventing iOS's small-field focus zoom without disabling ordinary pinch zoom. The local repair
candidate at 390px computed search/select fields to 16px and retained viewport scale 1 on focus.
Searching Pigeon returned its card. Physical iOS keyboard behavior has not been tested here.

The HTTP URL loaded over HTTP with `isSecureContext=false`; the HTTPS URL loaded securely with
no HTTP asset references. A production-host-only early script now moves HTTP links to HTTPS,
retaining the path, query and fragment. Local Mac, LAN and preview addresses remain HTTP where
needed. A one-week host-only HSTS header protects subsequent visits after HTTPS is established.
This is a static-page repair, not a new edge/server redirect rule.

## Restricted repair candidate

No exact-52 local snapshot remained. To preserve the existing deployment, the candidate was
reconstructed from matching local assets and read-only live asset data through the browser.
509 baseline files matched live byte hashes before the deliberate repairs. Cloudflare-managed
robots content was excluded from that comparison; the existing source robots rules were retained.
Absent live shop assets and external-game previews were omitted. No held game route or checkout
was introduced. The earlier new-game candidate is retained at
`output/static-policy-release-before-mobile/`; the exact repair candidate is at
`output/static-policy-release/`, with its hash manifest. The preparation proof and baseline hashes
are in `output/mobile-https-repair/`.

Only the CSS field override, early HTTPS script tags/new script and HSTS header differ deliberately.
The existing fixed static publisher accepted the candidate's 514-file structure. No guard scope,
route allowlist, account, binding, API or Worker code was changed. Publication and live checks are
pending until the focused transport checks and guarded upload complete.
