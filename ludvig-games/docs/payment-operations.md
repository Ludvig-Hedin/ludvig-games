# Payment support, refunds and recovery

Prepared 31 October 2026. Internal operating runbook, not published customer wording.
No refund, licence change, email or account setting was executed for this document.
The coordinator owns implementation and final acceptance.

## Existing owner decision and proof

The approved policy is a **full refund requested within 14 days, even after use or redemption,
without a reason**. Longer statutory remedies remain. Do not replace this with a no-refund policy
or require the buyer to prove they never played. The published policy does not promise automatic
access removal. Source: `policies/refunds.html` and `docs/legal-readiness-2026-10-28.md`.

The bundle's test receipt and native key reached Ludvig. That key restored all three local games.
These are recorded success-path tests, not evidence of actual refunds, disabled-key operations or
fresh-device My Orders recovery. Current status: [payment setup evidence](payment-setup-status-2026-10-30.md).

## Refund operating steps

1. Read the request received at the approved support address, `ludvig@ludvighedin.com`.
   Use the order reference or purchase email if available. Do not request card details or the full
   licence key. A missing order number is a lookup problem, not a reason to deny the refund.
2. Open Ludvig Games, store **504842**, in the **same mode as the order**. Find the purchase under
   Orders. Confirm product, purchase date, paid total/currency and prior refund status before acting.
3. For an eligible 14-day request, use the order action menu and refund the **full remaining paid
   amount**. If it was already fully refunded, do not repeat the action. Escalate statutory remedies
   after day 14 for a real assessment rather than automatically refusing them.
4. Read back the resulting refund status and amount. Save only a minimal private support record:
   order ID, request time, amount/currency, completion time and outcome. No licence key in repo/logs.
5. Tell the buyer the refund was issued only after the provider confirms it. Lemon Squeezy documents
   that statement visibility can take up to ten days. Do not promise same-day bank credit.

These dashboard actions are supported by [Refund Order](https://docs.lemonsqueezy.com/help/orders/refund-order).
Lemon Squeezy also reserves its own refund/dispute handling rights; a merchant policy does not override
them. See [Refunds and Chargebacks](https://docs.lemonsqueezy.com/help/payments/refunds-chargebacks).

**Execution boundary:** this runbook does not authorize agents to issue live refunds or send customer
messages. Ludvig or an agent with specific applicable authorization performs those actions. A routine
refund must not wait for a licence-revocation feature to work.

## Native key disabling and its limits

For an authorized **test-only** disabling check, first record a sanitized baseline validation of the
test order's exact native key. In the matching store/mode, open Store → Licenses, find the licence
linked to that order, and use its menu to disable it. Read back the disabled status. After the
30-second resolver cache has expired, check that validation rejects it and that a fresh restore in
each applicable game no longer grants that key's entitlements. Preserve separately purchased keys.
Record only order/licence IDs and outcomes. Re-enable the same test key afterward if the test plan
requires preserving Ludvig's demo access, and verify the restored state.

Dashboard management is documented in [Validating License Keys](https://docs.lemonsqueezy.com/guides/tutorials/license-keys).
Do not confuse deactivating an **instance** with disabling the whole key. The current
[Update a License Key API reference](https://docs.lemonsqueezy.com/api/license-keys/update-license-key)
also supports a `disabled` attribute through the authenticated merchant API. The older tutorial says
API disabling is unavailable; that conflicts with the newer endpoint reference. This project needs
no merchant credential for validation and adds no refund automation or new API secret here.

**Refund-to-access policy is still a product decision:** recommend disabling the refunded native key
after a full refund, but do not silently make that the promised customer behavior. Once decided,
reflect it in public terms and the operating procedure. Do not assume that merely issuing a refund
automatically disables a native licence. Partial refunds require their own entitlement decision.

Current implementation limits, established by source inspection:

- The resolver accepts only valid active/inactive keys, rejects disabled/expired keys, and caches
  successful validations for up to 30 seconds (`commerce/license.mjs`).
- Shared Pigeon/Karts ownership is kept in memory and recalculated during restore/startup. An already
  loaded tab can retain its look until revalidation/reload (`assets/store-client.js`).
- Ritkaos recalculates native ownership separately from legacy ownership. Revalidation occurs on
  relevant commands after its native validation window (`ritkaos/lib/game.mjs`).
- Legacy RK codes have different limits and cannot be individually disabled by Lemon Squeezy.
  No instant, universal or offline revocation claim is justified.

## Lost receipt or new device

The buyer opens [My Orders](https://app.lemonsqueezy.com/my-orders), enters the email used at checkout,
and follows Lemon Squeezy's login link. Their order contains the native key. They paste it into the
game's existing Restore purchase flow. Do not instruct them to buy again.
This is the provider's documented [My Orders recovery](https://docs.lemonsqueezy.com/help/online-store/my-orders).

If necessary, an authorized support operator can resend the original receipt from Orders. Verify
the intended purchase email; do not send a bearer licence to an unverified alternate address.
See [Resend Receipt](https://docs.lemonsqueezy.com/help/orders/resend-receipt).
Fresh-device login/recovery and an actual receipt resend remain **unchecked**. Email sending needs
applicable authorization and is not performed by this investigation.

## Remaining public policy and checkout work

1. Terms and Refunds still state paid checkout is unavailable. Terms/Privacy also describe online
   services as paused. Update only the factual statements affected by the actual paid deployment,
   after its scope is settled. Do not publish future server availability as a present fact.
2. Privacy lacks the actual paid flow: locally remembered bearer licence keys, validation requests
   through the game service to Lemon Squeezy, purpose/basis, retention and provider information.
   Document the real implementation rather than adding new collection. No purchase email is needed
   by the current game's resolver response.
3. Inspect the actual checkout and durable receipt for the seller identity, exact pack/delivery
   requirements, final VAT/currency total, withdrawal/refund terms and the appropriate withdrawal
   information/form. Receipt arrival alone does not prove all contract information was delivered.
   The support Reply-To is still the personal Gmail in recorded test evidence; use the public email.
4. Establish the accessible online withdrawal function and its durable acknowledgement, or verify
   that the merchant-of-record checkout already supplies the applicable function. A policy mailto
   and generic blank-form link do not prove this journey. Sweden's current rules require the function
   for online contracts where statutory withdrawal applies, including clear confirmation and a
   durable receipt with submission time. See
   [Konsumentverket's current business guidance](https://www.konsumentverket.se/marknadsratt-foretag/informationskrav-vid-distansavtal-regler-for-foretag/)
   and [Distansavtalslagen, 2 kap. 10–10 a §§](https://rkrattsbaser.gov.se/sfst?bet=2005%3A59).
   Provider coverage and the exact applicable seller flow are not yet established.
5. Do not add a statutory digital-content waiver to remove the owner's voluntary 14-day promise.
   Any waiver or different customer interaction needs an explicit product decision. The legal
   exception has specific conditions; see [Konsumentverket on digital content](https://www.konsumentverket.se/varor-och-tjanster/digitala-tjanster-och-digitalt-innehall/).

The provider supports editable confirmation title/message/button and receipt note/button/link, but
that capability alone proves neither legal completeness nor support for an online withdrawal function.
See [Confirmation modal](https://docs.lemonsqueezy.com/help/checkout/customizing-confirmation-modal)
and [Receipt emails](https://docs.lemonsqueezy.com/help/checkout/customizing-receipt-emails).
Never put the licence into a return URL, analytics event or public screenshot.

Next: coordinator investigates the actual provider withdrawal/receipt flow, asks Ludvig about access
after refunds, and prepares scoped policy/checkout changes. Live publishing and account writes remain
outside this document's execution scope. No server, dependency folder or browser was created here.
