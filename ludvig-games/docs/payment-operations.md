# Payment support, refunds and recovery

Updated 1 November 2026. Internal operating runbook, not published customer wording.
This documentation change executed no refund, licence change, email or account setting.
The coordinator owns implementation and final acceptance. The online withdrawal service and
its policy links are a local activation candidate, not a deployed or accepted customer journey.

## Existing owner decision and proof

The approved policy is a **full refund requested within 14 days, even after use or redemption,
without a reason**. Longer statutory remedies remain. Do not replace this with a no-refund policy
or require the buyer to prove they never played. The published policy does not promise automatic
access removal. Source: `policies/refunds.html` and `docs/legal-readiness-2026-10-28.md`.

The bundle's test receipt and native key reached Ludvig. That key restored all three local games.
These are recorded success-path tests, not evidence of actual refunds, disabled-key operations or
fresh-device My Orders recovery. Current status: [payment setup evidence](payment-setup-status-2026-10-30.md).

## Refund operating steps

Actual test evidence, 31 October: Ludvig disabled test licence 1726555 and refunded order 9905660
(receipt 5048421). His order screenshot shows Refunded. The provider refund email arrived at
21:52:34 UTC, and the actual hosted disabled-key probe passed again afterwards. No real money moved.
This verifies the manual test procedure; it does not establish automatic disabling on refund or
instant revocation in an already open app. Keep that refunded key disabled. The private fixture is
now suitable for rejection checks, not expected-valid restoration checks.

1. Read the request received at the approved support address, `ludvig@ludvighedin.com`, including
   an operator copy from the withdrawal form once activated. Use the original server receipt time
   and reference when handling a form declaration; the email's delivery time does not replace them.
   Use the order reference or purchase email if available. Do not request card details or the full
   licence key. A missing order number is a lookup problem, not a reason to deny the refund.
2. Open Ludvig Games, store **504842**, in the **same mode as the order**. Find the purchase under
   Orders. Confirm product, purchase date, paid total/currency and prior refund status before acting.
3. For an eligible 14-day request, use the order action menu and refund the **full remaining paid
   amount**. If it was already fully refunded, do not repeat the action. Escalate statutory remedies
   after day 14 for a real assessment rather than automatically refusing them.
4. Read back the resulting refund status and amount. Save only a minimal private support record:
   order ID, request time, amount/currency, completion time and outcome. No licence key in repo/logs.
5. After a full refund, disable the native licence linked to that exact order in the same store/mode.
   Confirm the disabled status. Do not disable other orders or separately purchased keys. If disabling
   fails, record it as unfinished support work and retry; the refund itself must not be delayed.
6. Tell the buyer the refund was issued only after the provider confirms it. Lemon Squeezy documents
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

**Owner decision, 31 October 2026:** disable the refunded native key after a full refund. Paid access
ends at the next purchase validation, which may not be immediate in an open game. Reflect this in
the paid-release customer wording. Issuing the refund alone is not proof that the key was disabled.
This is an operating procedure, not an implemented automatic refund handler. Partial refunds still
require their own entitlement decision. No actual licence was disabled by this documentation change.

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

## Online withdrawal operation

The prepared guest form is at
`https://ludvig-games-withdrawals.ludvighedin.workers.dev/`. It collects name, purchase-identifying
information and an acknowledgement email; it requires no reason, licence key or login. Review sends
nothing. Confirm submits the declaration. The service records its original contents, UTC receipt
time and reference before attempting an email acknowledgement with an operator copy. It does not
execute refunds or disable licences. Continue with the manual refund steps above for the matching
order, then disable only that order's key after a full refund.

Resend Free and the necessary limited sending key are now owner-approved, including processing the
customer's name, email and purchase information. Actual account, sender verification, quota and
disabled tracking must still be checked by the coordinator. No paid plan or overage is authorized.
See [withdrawal preparation](../withdrawal/README.md) for the implementation and activation gates.

API acceptance means accepted for sending, not delivered. A pending acknowledgement retains the
declaration and retries at most four times within 23 hours. Exhausted notices are exported to the
dedicated private Cloudflare KV namespace under `held:<reference>`. If export fails, the original
notice remains in the private inbox queue for export retries; it is not discarded or emailed again.
Recover held notices through the authenticated dashboard or the README's fixed private-file CLI
procedure, preserving the original declaration and receipt time. Check Resend's original request
before a manual resend outside its idempotency window. Delete a held payload after recovery and
handling; do not paste customer data into repository records. Private remote recovery still needs
an actual synthetic-fixture check before activation.

## Remaining public policy and checkout work

1. The prepared Terms, Refunds and Privacy source describes the approved purchase flow, USD debit
   disclosure and local withdrawal activation candidate. Its new form links must not be published
   while the service is unavailable. Publish only after its actual acceptance checks pass.
2. Privacy covers locally remembered bearer licence keys, validation, Cloudflare/Resend processing
   and withdrawal retention. Confirm the actual deployed configuration matches this wording before
   release. The game's resolver does not need or return the purchase email.
3. Inspect the actual checkout and durable receipt for the seller identity, exact pack/delivery
   requirements, final VAT/currency total, withdrawal/refund terms and the appropriate withdrawal
   information/form. Receipt arrival alone does not prove all contract information was delivered.
   Confirm the public support email `ludvig@ludvighedin.com` in the actual receipt.
4. Establish the accessible online withdrawal function and its durable acknowledgement, or verify
   that the merchant-of-record checkout already supplies the applicable function. A policy mailto
   and generic blank-form link do not prove this journey. Sweden's current rules require the function
   for online contracts where statutory withdrawal applies, including clear confirmation and a
   durable receipt with submission time. See
   [Konsumentverket's current business guidance](https://www.konsumentverket.se/marknadsratt-foretag/informationskrav-vid-distansavtal-regler-for-foretag/)
   and [Distansavtalslagen, 2 kap. 10–10 a §§](https://rkrattsbaser.gov.se/sfst?bet=2005%3A59).
   The local form's real browser, CAPTCHA, durable email, private recovery and applicable seller
   receiving role are not yet established. Ordinary merchant refund handling is documented, but
   must not be described as a verified appointment to receive statutory declarations for Lemon Squeezy.
5. Do not add a statutory digital-content waiver to remove the owner's voluntary 14-day promise.
   Any waiver or different customer interaction needs an explicit product decision. The legal
   exception has specific conditions; see [Konsumentverket on digital content](https://www.konsumentverket.se/varor-och-tjanster/digitala-tjanster-och-digitalt-innehall/).

The provider supports editable confirmation title/message/button and receipt note/button/link, but
that capability alone proves neither legal completeness nor support for an online withdrawal function.
See [Confirmation modal](https://docs.lemonsqueezy.com/help/checkout/customizing-confirmation-modal)
and [Receipt emails](https://docs.lemonsqueezy.com/help/checkout/customizing-receipt-emails).
Never put the licence into a return URL, analytics event or public screenshot.

Next: coordinator provisions and checks the approved Free email/form route, verifies the actual
declaration and acknowledgement on preserved paid test order 5048422, resolves the receiving-role
question and checks live checkout VAT before the conditionally authorized opening of sales. Preserve
that paid test order until this journey is exercised. No server, dependency folder or browser was
created by this documentation change.
