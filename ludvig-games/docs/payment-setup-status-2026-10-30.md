# Payment setup status, 30 October 2026

Owner resumed setup after completing W-8/W-9 certification and requested test-mode setup and purchase
testing. This is authorization for the store setup/test work, not live charges or unrelated account changes.

## Current state, 21:05 UTC

Local implementation exists and has passed focused checks, but it is not deployed and no actual test
checkout has completed. The current provider test catalog is not configured yet. Purchases are not ready.

- Fresh site-scoped Dia login succeeded. The official Products page confirms store **504842** and
  **isTestMode: true** after Ludvig enabled Test mode himself. Personal tabs were not controlled.
- Earlier Payout settings showed Tax information **Submitted**. No identifier or bank data is saved here.
- A pending test product shell **1488379**, variant **2319068**, was opened for Ritkaos+. A save attempt
  was blocked locally because the real product form includes a default variant and omits the test flag.
  No successful published product save is claimed. These provisional IDs are not yet app configuration.
- Ludvig explicitly approved a narrow exception for this store's test products and dummy-card checkout.
  The product guard checks fresh official server proof of test mode and exact product/variant/price IDs.
  Its form-payload adaptation has independent review, with guarded checks pending at this checkpoint.
  Payment, live-mode changes, account, bank, tax and marketing writes remain blocked.
- The general Products API is read/list only. No merchant API key was requested as a creation shortcut.

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

Coordinator owns finishing provider product saves, the separately scoped dummy-card checkout gate,
actual receipts/licence validation and browser checks, then saving the stable source and proof. Ludvig
has already submitted tax information and enabled Test mode. No repeat account action is requested.
Production deployment and live charging remain outside this test run.

The [1,000 kr/month plan](1000kr-month-plan.md) is prepared separately and makes no sales promise.
No disposable dependency/build copy was created. Private login storage stays private and preserved.
