# Mac purchase integration

Updated 1 November 2026. The live-configured 0.4.3 Mac candidate is built locally and checked,
but not published. Root owns serialized guarded checks and release acceptance. Earlier dated
implementation notes below are historical; current overall status is in `purchase-release-2026-10-30.md`.

## Local live candidate, 1 November

- Guarded staging and packaging completed with only the four approved public live settings,
  exact live product/variant IDs and the distinct `games-live-v1` verifier. No private grant key
  or merchant credential is packaged. The backend still has no enabled live products.
- The actual packaged configuration matches the saved live plan and public candidate. Current
  shared commerce modules and the existing updater public key match the package byte for byte.
  Deep/strict code-signature verification and the exact ZIP's update signature passed in the
  opt-in `desktop/tests/live-candidate.test.mjs` check.
- Current ZIP SHA-256: `f8c83c3c0cd0f77a406d4bfdf81080ddbf7c3ac841d0e9f97cf3d6638598be71`.
  Distribution remains the existing ad-hoc signing workflow; no notarization is claimed.
- Rebuilt after the factual privacy correction for restored online rooms and Mac licence storage.
  Both opt-in actual-artifact checks passed together. The four corrected privacy paragraphs match
  the generated web page and the actual packaged Mac page. This does not add live-purchase proof.
- The earlier test-only release was moved, not duplicated, to
  `desktop/output/test-release-0.4.3-20261031/`. Its eight packaged restore/restart and nine federation
  checks remain valid for that test artifact. No live paid restoration is claimed for the new candidate.
- Keep both artifacts and the main checkout's dependencies while acceptance/publication is held.
  Root owns removing the exact archived test release after final production acceptance.

## Included behavior

- The same native Lemon Squeezy key can be restored in the browser games and in the Mac app. Each
  browser/app origin remembers its own key; this is not automatic cross-device account sync.
- The Mac hub serves `/api/store` and `/api/licenses/resolve` locally before its ordinary game worker.
  Only a loopback client, exact loopback Host/port and matching Origin can submit a key. LAN clients,
  rebinding hosts and cross-origin submissions are rejected. No cloud CORS origins were broadened.
- The shared resolver supplies exact three-pack or single-pack entitlements. No merchant API secret,
  customer email or raw key is returned/logged. HTTP bodies and calls stay bounded by the shared
  parsing/provider limits and an additional six local submissions/minute.
- The staged hub uses the local purchase API, not the deployed web service. The shared store link is
  kept visible in Electron; the original other web header controls remain hidden there.
- The same public store environment reaches the Ritkaos child so its native WebSocket redemption
  accepts the same key and configured mode. Parent added `RITKAOS_BIND`; the desktop runtime sets it
  to `127.0.0.1` for the child behind the existing public app proxy.
- Restoring paid extras requires internet validation. Free play remains available when offline or
  missing configuration. No perpetual offline unlock or new grace period is promised.

## Staging contract

Re-stage **both hub and Ritkaos** before preparing a purchase-capable app. `stageHub` copies the shared
`license.mjs`, `http.mjs` and `grant.mjs` into `bundle/hub/commerce/` and writes `config.json` with only these public
environment fields: TEST_MODE, LS_STORE_ID, LS_TEST_PRODUCTS, LS_LIVE_PRODUCTS, LS_GRANT_PUBLIC_KEYS. It validates them with
the shared normalizer. Missing/invalid configuration stages `{}` and disables purchase validation.
No merchant token or legacy unlock secret is written by this contract.

Use the existing explicit test product environment for a test candidate. Use only freshly verified
live product mappings for an authorized live release. The actual live products are still draft, and
this source change does not publish them or enable their deployment mapping.

The staging build explicitly clears `LUDVIG_STORE_API` so generated client code stays same-origin.
The runtime's public store configuration is loaded from the staged hub, not arbitrary inherited
runtime environment. When configuration is absent it clears inherited store fields for Ritkaos too.

## Root verification still required

1. Focused `desktop/tests/commerce.test.mjs`: same resolver in test/live, exact local access checks,
   no raw-key response, malformed requests, missing config/modules, unrelated free routes and limits.
   The current Games test lane may need this exact desktop path admitted; never bypass its guard.
2. Stage the two entries through the existing guarded build process using inspected test configuration.
3. Actual Mac runtime: open the shared shop, restore the private purchased test key, select Pigeon and
   Karts styles, restart the app and confirm revalidation restores them. Check free/offline behavior.
4. Actual Ritkaos in the app: restore the same key and confirm paid host settings. Check that its
   internal child port cannot be reached over LAN while ordinary app nearby play still works.
5. Build/package and test the actual supported Mac app before claiming first-launch Mac support.
   Versioning/signing/notarization/updater publication remain the release coordinator's work.

No dependency, .stage, bundle or .next folder was generated or removed by this builder.

## Federated licence isolation, 31 October

Review found that the old raw Ritkaos WebSocket federation would send saved bearer keys to the
selected room-host Mac. That path must not ship with native purchases enabled. The prepared repair
uses `runtime/ritkaos-bridge.mjs`: credential messages terminate on the buyer's Mac, which obtains a
short-lived operator-signed proof over the fixed Games commerce HTTPS endpoint. Only that proof
crosses the LAN. The remote Game checks a pinned operator public key, store, mode, Game audience,
actual connection challenge and expiry before granting Plus. Gameplay still uses shared rooms.

The signing private key belongs only in the commerce Worker's secret storage. No production signing
key has been generated or configured yet. Staging copies only `LS_GRANT_PUBLIC_KEYS` and the shared
verifier. Missing/invalid public keys keep Mac purchasing unavailable. Staging children and the
Ritkaos child explicitly discard any inherited signing secret. Legacy RK codes remain local-only
when federating; they are never sent to another Mac. No known real legacy paid Mac purchases were
established. This does not replace native receipt-key recovery or add a permanent offline grant.

Fresh sensitive reviews accepted the signer/Worker/Game boundary and the message bridge; the one
staging-secret inheritance finding was repaired by the coordinator. Reviews are source evidence,
not test passes. The new focused checks, frame capture, real-key restore, restart, two-instance
shared-room journey, staging and actual Mac package remain unchecked because guarded admission is
blocked by another focused job or less than 20% reclaimable RAM. No guard was bypassed.

The prepared app version is 0.4.3. Fresh inspection found the installed app is 0.2.0, while the latest
published GitHub release is v0.4.2 (25 October). Both are unchanged. The coordinator owns
the remaining checks, trusted public/private signing-key provisioning, hosted grant endpoint and
app release. The owner explicitly requires Mac support at first launch; web-only release stays held.

## Guarded verification resumed

The next admitted run exposed a real compatibility failure: Node exports Ed25519 JWKs with an
`Ed25519` algorithm label while the validator allowed only `EdDSA`. Both known labels are now
validated, then removed before import with the algorithm explicitly fixed to Ed25519. Unknown
algorithms, private verifier keys and wrong curves remain rejected. Added regression coverage.
All 44 focused shop, signer, Game grant/native, desktop commerce and bridge tests passed locally.
This is not packaged-app or hosted-endpoint proof.

Desktop dependency installation succeeded through the fixed registered lane after fixing npm's
rejection of the same config file used twice. Test-only grant signing material and a public-only
test staging configuration were prepared outside Git in the owner's private config directory.
No live signing key was generated. The test key has not been uploaded to a Worker.

The first staging attempt was refused because another registered check owned the scheduler.
`desktop/node_modules` is retained for the still-required staging/package checks in this main
checkout; root owns its reuse and eventual cleanup. No new stage/bundle output exists yet.

An actual product-app runner is prepared at `desktop/scripts/purchase-selftest.mjs` and admitted only
through `agent-heavy-run games-desktop app-test`. It uses the existing hidden Electron SELFTEST hook,
fixed loopback ports, isolated data and the previously provided test key from a fixed private file.
It checks the shared shop's four matching dialogs, native restore and restart, Pigeon/Karts styles,
and Ritkaos ownership. It does not make a payment or establish federation/offline/refund/update proof.
Fresh safety review found process-tree and profile cleanup gaps; root repaired both. Only identified
descendants may be stopped, their exit is awaited, and the isolated profile is removed afterwards.
Source syntax checked; this app runner has not run because staging is still scheduler-blocked.
