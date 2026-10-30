# Payment setup status, 30 October 2026

Owner resumed setup after completing W-8/W-9 certification and requested test-mode setup and purchase
testing. This is authorization for the store setup/test work, not live charges or unrelated account changes.

## Current state, 21:20 UTC

Local implementation exists and has passed focused checks, but it is not deployed and no actual test
checkout has completed. All four test products are saved and their IDs are wired into the opt-in local test configuration. Purchases are not ready.

- Fresh site-scoped Dia login succeeded. The official Products page confirms store **504842** and
  **isTestMode: true** after Ludvig enabled Test mode himself. Personal tabs were not controlled.
- Earlier Payout settings showed Tax information **Submitted**. No identifier or bank data is saved here.
- Four products were saved and freshly read back: published in test mode, hidden from storefront,
  single payment, native keys, unlimited duration/activation, Video Game tax category. No live products.
- Verified product/variant IDs: Ritkaos 1488379/2319068, Pigeon 1488395/2319091,
  Karts 1488397/2319094, bundle 1488399/2319096. The opt-in environment example contains public IDs only.
- Ludvig explicitly approved a narrow exception for this store's test products and dummy-card checkout.
  The product guard checks fresh official server proof of test mode and exact product/variant/price IDs.
  Its form-payload adaptation passed independent review and seven guarded focused checks.
  Payment, live-mode changes, account, bank, tax and marketing writes remain blocked.
- The general Products API is read/list only. No merchant API key was requested as a creation shortcut.
- Bundle checkout displays Test mode, cart.test_mode is true and its Stripe key is a test key.
  Public checkout's generic isTestMode prop is false and must not be used as its mode proof.
  Tax-calculation POST is still blocked and Pay is disabled. No payment submitted.
- Cart tax_inclusive is false. The displayed 99 SEK before tax calculation does not establish the final
  Swedish customer total. Tax-inclusive pricing remains a release blocker.

## Prepared product settings

Common: SEK, single payment, standard pricing, no subscription, no discount required, no email marketing,
native license-key generation, perpetual duration, no new activation/device limit, and hidden from the
storefront until the corresponding in-game content and purchase journey are verified.

| Internal product | Store name | Starting customer price | Status |
|---|---|---:|---|
| ritkaos-plus | Ritkaos+ | 59 SEK | Local native-license integration built; provider delivery unchecked |
| pigeon-style | Pigeon style pack | 39 SEK | Local content, preview and entitlement integration built |
| karts-style | Karts style pack | 39 SEK | Local content, preview and entitlement integration built |
| games-bundle | Ludvig Games extras bundle | 99 SEK | Local entitlement mapping built; provider purchase unchecked |

Use tax-inclusive store pricing if these are the final customer totals; verify the actual product tax
category rather than keeping the Add Product form's default SaaS category by assumption. Do not publish
test products in live mode to work around the blocked toggle. Test/live copies have different IDs.

## Payment integration recommendation and required tests

Independent architecture research recommends native Lemon Squeezy license keys, delivered in provider
receipts/My Orders, instead of building a new email service to deliver custom RK codes. The public
License API can validate keys without a merchant API secret. The backend must enforce store/product/
variant allowlists per environment and return only our entitlement IDs. Do not expose customer metadata.
Do not mint permanent RK tokens from a native key, which would discard provider status checks.

Ritkaos now accepts native UUID keys alongside legacy RK codes and revalidates native ownership without
persisting it into snapshots. Pigeon and Karts have new paid cosmetic previews and a shared code entry
screen. The shared test-only service checks exact store/product/variant IDs and returns only entitlement
IDs. It accepts unused valid inactive keys and rejects disabled/expired/wrong-store keys. No deployment.

Focused local checks passed: 65 backend/game/network/snapshot checks, plus one browser-client race
regression. After matching the real provider checkout URL format, the affected 14 commerce/client checks
passed again. Independent sensitive review findings were repaired: asset inclusion, drawing order while
validating, desktop packaging and startup-code restore race. These are mock/local results, not payment proof.
Karts preview, simulated local ownership application, race start and ownership removal were observed in
the browser. Mobile and actual purchase unlock remain unchecked. The emergency memory guard repeatedly
stopped the disposable local server, so a server exit is not a game test failure or a provider test pass.

Before release: valid/invalid/disabled key, exact single-pack/bundle mapping, wrong store/product/variant,
cross-environment rejection, provider outage/rate limit, receipt delivery, recovery on another device,
failed/cancelled test payment, repeat event/request safety and refund handling. Test payment must use
provider dummy cards. No end-to-end test pass has occurred.

Sources from independent research:
- https://docs.lemonsqueezy.com/help/licensing/generating-license-keys
- https://docs.lemonsqueezy.com/api/license-api/validate-license-key
- https://docs.lemonsqueezy.com/guides/developer-guide/testing-going-live
- https://docs.lemonsqueezy.com/api/license-keys/update-license-key
- https://docs.lemonsqueezy.com/help/orders/resend-receipt

## Next ownership

Products are saved and their settings were read back successfully. Coordinator owns the separately scoped dummy-card checkout gate,
actual receipts/licence validation and browser checks, then saving the stable source and proof. Ludvig
has already submitted tax information and enabled Test mode. No repeat account action is requested.
Production deployment and live charging remain outside this test run.

At the last checkpoint, focused guard checks could not run: the shared scheduler was occupied and then
reclaimable memory was 17%, below the fixed 20% threshold. The emergency guard repeatedly stopped the
local test server. Ludvig was asked to close unused heavy apps while keeping Dia open. No threshold
was lowered and no peer process was stopped. No root-owned server remains listening on port 4322.
Ludvig then confirmed the Dia permission dialog and said the other apps must remain open. Preserve
those apps and do not repeat the request to close them. Two refreshed site-login exports still timed out;
the old agent session redirects to sign-in. Public test checkout does not itself require that store login.
The tax-policy focused check is also still blocked by another active focused job. Do not repeatedly
restart the disposable server or infer a payment pass from the permission approval.

The Cloudflare plugin can currently see only account 7e953f5245e669d7d7045be1b97ea295, not the approved
Games Free account cffb5d1b12c3302ecc0745862fbf1f14. No resource was changed. A remote test environment is
only a possible next route, not a verified/deployed fallback. Never deploy to the visible old account.

The draft tax-only checkout policy has sensitive review; its frame/origin/referrer finding was repaired
in the policy/tests. It is not activated in the connector until guarded checks pass and wiring is restored.
Payment/Stripe requests remain blocked. Actual test receipts, recovery, final VAT total and game unlock
are unfinished. This is a resource blocker, not a passed end-to-end test.

Source saved locally in commits `c761aa4` and `53292f3`. No push, hosted CI or deployment. The browser
policy/source directory is a symlink into agent-dotfiles; source edits affect installed files, and
existing connector processes keep their loaded modules until reconnect. Keep the last checked connector
policy installed while the next stage is unverified. The disposable connector client was removed.

The [1,000 kr/month plan](1000kr-month-plan.md) is prepared separately and makes no sales promise.
No disposable dependency/build copy was created. Private login storage stays private and preserved.
