# Purchase release review

Updated 31 October 2026, Stockholm. **The bundle's test purchase, receipt, licence and local game
unlocks work. Paid production is not live.** The free public site is unchanged.

## What is verified

- Four hidden test products exist in approved store 504842: Ritkaos+ 59 SEK, Pigeon style pack 39 SEK,
  Karts style pack 39 SEK and the three-pack bundle 99 SEK. Single payments, native perpetual keys.
- Ludvig completed the bundle purchase in provider test mode. Receipt order 5048421 arrived in the
  owner's inbox, explicitly marked Test Mode, and contains the native licence key.
- The private key validates against the actual provider and exact test bundle product/variant. It has
  no expiry. The service returns all three game entitlements and rejects a wrong-store configuration.
- In the actual local browser: Pigeon applied Crown/Midnight; Karts applied Checker panels and started
  a race; Ritkaos showed all ten ownership rows and restored them after reload without another paste.
  All three purchase/style dialogs fit a 390px viewport without horizontal overflow.
- Focused backend/game/network checks, independent sensitive review, and the opt-in real-provider
  integration check passed. Test keys never entered source or output. No remote CI, push or deployment.

This proves the **bundle success path in the test environment**. Separate single-pack purchases,
failed/cancelled payments, real disabled-key/refund operations and fresh-device My Orders recovery
are not claimed as provider-tested. Single-pack and invalid/disabled mapping have focused mock coverage.
Detailed evidence: [payment setup status](payment-setup-status-2026-10-30.md).

## What remains before real sales

- [x] Prepare local live-mode support with separated IDs, storage and endpoint modes. Not deployed.
- [x] Finish guarded client/game checks. All 33 focused local checks passed.
- [x] Create and inspect the four live products as hidden drafts, with their new IDs/URLs saved in
  `commerce/live-products.plan.json`. Sales remain closed and deployment mapping remains disabled.
- [ ] Resolve final customer currency and VAT. The 99 SEK test offer produced a receipt of 99.05 SEK
  with a 10.08 USD payment. Cause/live behavior is not established. The test cart's zero tax is not proof
  of correct production VAT. Preserve the approved intended prices until a real product decision.
- [ ] Check the Games Free account's current verification/plan and prepare only the required hosting.
  Keep the Paid-account backend hold and all unrelated paused services. Direct deployment needs the
  owner's explicit release authorization. The current Cloudflare plugin only sees the old account.
- [ ] Finish refund/support operations, including disabling a native key and checking its next validation.
  Refund does not automatically imply key revocation. Existing browser tabs can keep in-memory cosmetic
  access until revalidation/reload. Legacy RK codes have separate revocation limitations.
- [ ] Finish the existing purchase-confirmation/withdrawal work in
  [legal readiness](legal-readiness-2026-10-28.md), and update free-only public policy wording with the
  actual paid release. No fresh legal clearance is claimed by the technical test.
- [x] Set the public support address to ludvig@ludvighedin.com and enable tax-inclusive pricing.
  Fresh official settings readback confirmed both. No new live receipt has been issued to verify Reply-To.
- [ ] After the release gates and applicable authorization, deploy and verify the customer journey on
  the intended public origins. Do not expose customer Buy links before then.

Native Lemon Squeezy licences supply durable orders, delivery and recovery. There is no custom code
email service or fulfilment webhook in this implementation. Do not reopen that superseded architecture.

## Ludvig's short checklist

- [x] Approve lineup and 59/39/39/99 starting prices, with free content preserved and tiny SKUs omitted.
- [x] Complete account-only bank/identity/tax setup, as reported and previously observed. Do not repeat it.
- [x] Enable Test mode, complete the bundle test purchase and provide its key through private entry.
- [x] Review the two local app previews. Ludvig said the screens look fine.
- [ ] Verify the Games Free account's email only if a fresh account check still shows that requirement.
- [ ] Give explicit authorization for production publishing when the remaining release gates are ready.

The implementing agent owns live-mode preparation, product mapping, final-price investigation, support
settings, hosting preparation and verification. These are not extra dashboard homework for Ludvig.
Marketing posts still require separate authorization for the account/batch; none were sent.

## Local app previews, not live screens

Pigeon includes four hats and four feather looks. Karts includes four colours and two paint designs.
All original free choices remain free; the bundle promises only these three named packs.

![Pigeon local app preview](previews/pigeon-style-pack-local.png)

![Karts local app preview](previews/karts-style-pack-local.png)

Business plans: [first 100 kr](first-100kr-plan.md), [1,000 kr per month](1000kr-month-plan.md).
The test payment is not real revenue. These plans are demand experiments, not earnings promises.

Next owner: the coordinator prepares the remaining live release work; Ludvig owns the pack review and
production-publishing decision. No production or marketing authorization is inferred from test success.

## Latest checkpoint, 31 October

The local live-mode candidate is prepared, with a fresh sensitive review and its two findings repaired.
33 focused backend, mode, client and game checks passed after RAM admission became available.
The static build passed (62 entries, 52 full-screen games). No production settings or content changed.

Owner confirmed prices inclusive of applicable VAT and authorized live products/public support setup
with sales closed. Owner also confirmed disabling the refunded key after a full refund, with access
ending at the next validation. Actual provider disabling/refund verification remains unfinished.
The four live drafts and support/tax-inclusive settings are now saved and verified in Lemon Squeezy.
Live-store setup is complete; hosting, remaining customer-flow checks and publication remain separate.
Free-account authentication has expired and automatic refresh was rejected (HTTP403). A fresh
owner-approved sign-in will be needed. Bank/identity/tax forms are not being requested again.

Refund/recovery steps are saved in [payment operations](payment-operations.md). Actual provider refund,
key disabling and the online withdrawal/confirmation flow still need verification before launch.
The coordinator owns those checks and scoped policy preparation once decisions/access are available.
