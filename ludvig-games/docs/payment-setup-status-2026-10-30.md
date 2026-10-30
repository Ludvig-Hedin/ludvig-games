# Payment setup and test evidence

Updated 31 October 2026, Stockholm. **The purchased test bundle unlocks all three local games.
Production is unchanged and purchases are not live.** No live payment or hosting deployment occurred.

## Provider configuration

Store 504842, Ludvig Games. All four products were saved and freshly read back in test mode: published
in that test namespace, hidden from storefront, single payment, native keys, unlimited duration and
activation, Video Game category. Existing free game content remains free.

| Offer | Price | Test product | Test variant |
|---|---:|---:|---:|
| Ritkaos+ | 59 SEK | 1488379 | 2319068 |
| Pigeon style pack | 39 SEK | 1488395 | 2319091 |
| Karts style pack | 39 SEK | 1488397 | 2319094 |
| Three-pack bundle | 99 SEK | 1488399 | 2319096 |

`commerce/.env.test.example` contains these public identifiers and exact provider checkout URLs, no
secret. Test/live copies have different IDs. The current implementation intentionally accepts only
test configuration; live-mode support still needs preparation.

Owner account approval and Tax information Submitted were observed earlier. Ludvig reported finishing
bank/identity/tax setup and enabled Test mode. Do not ask him to repeat those completed steps.

## Actual paid-test evidence

- Ludvig completed the dummy-card bundle purchase and reported success.
- Gmail receipt for order **5048421**, dated **30 October 2026 22:44 UTC**, arrived in the owner's inbox.
  Its subject explicitly says Test Mode. Read-only inspection confirmed a licence-key section containing
  a native key. The sale-notification email arrived too. No mail was sent, edited, labelled or archived.
- The key was supplied through T3 private secret entry, never chat/source/output. The public native
  License API returned valid=true, inactive (unused), no expiry, store 504842, product 1488399,
  variant 2319096. These match the inspected test bundle.
- The existing resolver accepted that real key and returned exactly ritkaos/pigeon/karts. An opt-in
  guarded integration check exercised the actual Ritkaos Game grant and selected the paid Office pack.
  The wrong-store configuration rejected the same valid key. Messages and room snapshots contain no key.

### Actual local browser results

- **Pigeon:** entered the real key in the purchase dialog; it reported Purchase restored. All three
  entitlement IDs were owned. Crown plus Midnight feathers were selected and saved.
- **Karts:** restored the same key, selected Checker panels, applied it and started a race.
- **Ritkaos:** redeemed the same key over the real server connection. All ten ownership rows appeared,
  no buy button remained, and no unlock error appeared. After reload all ten returned automatically
  without another paste; the input was empty.
- At a 390px viewport, dialog client/scroll widths matched: Pigeon 356px, Karts 352px, Ritkaos 368px.
  These are mobile-width desktop-browser checks, not a physical-phone test.
- Automatic shared-client reload recovery was attempted but remained inconclusive when the disposable
  server was stopped by the memory guard. Manual receipt-key restore is verified in Pigeon and Karts;
  automatic reload restore is verified in Ritkaos. Do not report the interrupted attempt as a game bug.

Local app previews for owner review are in [the release review](purchase-release-2026-10-30.md).

## Checks and limits

- Earlier focused backend/game/network/snapshot checks: 65 passed, plus the client restore-race test.
  Affected commerce/client checks were rerun after adapting the actual checkout URL format: 14 passed.
- Current assets rebuilt successfully: 62 catalogue entries and 52 full-screen games. Both local
  service catalogues returned ready/nativeReady with the actual test product configuration.
- Independent sensitive review findings were repaired: missing shared asset, drawing-command ordering,
  desktop package path, startup restore race and scoped request-header/redirect handling.
- Browser guard focused checks passed: product 7, tax/update 10, Stripe test lookup 7, fixed dummy-form
  validation 2. The validation extension remains inactive; its reviewed wiring patch is saved separately.
- `commerce/tests/paid-bundle.test.mjs` passed with the real private key. It is skipped unless explicitly
  given a private file path as LS_TEST_LICENSE_FILE. Never put a key into environment text, arguments,
  assertions, snapshots or fixtures. The native provider validation is not a new merchant API secret.

The owner performed the payment. The agent's automated checkout reached successful tax and test-key
Link lookup responses, then stopped at the guarded validation route. No agent-automated payment pass
is claimed. No CI, push or deployment occurred.

The success-path bundle test does not establish separate single-pack purchases, failed/cancelled
payments, actual disabled-key/refund handling or a fresh-device My Orders sign-in/recovery journey.
Single/invalid/disabled/provider-failure mappings have focused mock coverage. Native receipt delivery
and re-entering the real bundle key are verified.

## Open production gates

- Test receipt lists **99.05 SEK** and a **10.08 USD** payment for the 99 SEK offer. No cause or live
  currency behavior is asserted. The inspected test cart was SE, non_taxable, tax 0, tax_inclusive=false.
  This is not production VAT proof. Resolve final customer prices/currency/VAT before live checkout.
- Receipt Reply-To currently uses the owner's personal Gmail. Use public support address
  ludvig@ludvighedin.com for the paid launch.
- Prepare live-mode support and inspect copied live products/new IDs, then hosting and policy updates.
  Existing code is test-only. No public Buy link should point to a test checkout.
- Native keys support disabling, but refund does not imply automatic revocation. Document support and
  refund operations before release; loaded cosmetic pages can retain access until revalidation/reload.
- Only Games Free account cffb5d1b12c3302ecc0745862fbf1f14 may host the required new services. The current
  Cloudflare plugin only sees old account 7e953f5245e669d7d7045be1b97ea295. Fresh Free-account email/plan
  status is not established. Do not use the old account or revive unrelated paused backends.
- Production publishing needs the owner's explicit authorization. Marketing sends need separate
  account/batch authorization. The [1,000 kr/month plan](1000kr-month-plan.md) remains an experiment.

## Resources and next ownership

The owner needs his other apps open; do not repeat requests to close them. RAM/process/browser guards
stayed enforced. Disposable servers were stopped by the emergency guard between browser actions and
restarted only through the registered dev lane. Test results above separate completed actions from
interrupted checks. Test codes were removed from the isolated browser's two local origins after use.
The owner's personal Dia tabs and stored purchase were not changed. Private auth storage is preserved.
The temporary local test-product write capability was revoked after testing; site-login cookies were
preserved. No provider account mode or setting was changed by this cleanup.
No disposable node_modules/.next copy was created. Temporary controller/debug artifacts are removed;
the two intended app-preview PNGs remain as review artifacts.

Next owner: coordinator prepares the remaining live release work and investigates currency/VAT.
Ludvig reviews the pack previews and owns the production-publishing decision. Account forms already
completed are not extra homework. The technical bundle success path in test mode is now verified.
