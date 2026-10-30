# Payment setup status, 30 October 2026

Owner resumed setup after completing W-8/W-9 certification and requested test-mode setup and purchase
testing. This is authorization for the store setup/test work, not live charges or unrelated account changes.

## Observed in the store

- Refreshed the site-scoped Dia login using the approved owner-browser connection. Personal tabs were
  not controlled. T3 preview reported unavailable, and the user had explicitly requested Dia.
- Setup lists store settings, identity, 2FA and bank connection as completed; product creation remains.
- Payout settings **Tax information** displays **Submitted**. This establishes submission, not independent
  tax/legal approval. No personal identifier or bank details were copied into this record.
- The Products page showed **Create your first product**, with no product list.
- Test-mode checkbox remained unchecked after the attempt to enable it. No test-mode success claimed.
- The installed connection log records `blocked POST app.lemonsqueezy.com` at 20:23:10 UTC, matching
  the attempt. Later payout-page background POSTs were also blocked. The tool connection is read-only.
- No product saved/published, discount created, email marketing enabled or purchase submitted. An empty
  Add Product form was inspected during the earlier attempt and discarded, without saving.

## Concrete blocker

The installed safety policy in `~/.codex/guidance/machine.md` specifies that owner-login sends/saves are
blocked and payment hosts cannot be made writable through the normal own-app test exception.
The `owner-browser-mcp --login` command explicitly reported read-only access. Do not bypass this via
personal-tab control, another browser launcher, exported cookies in a POST client or an unguarded route.

The Lemon Squeezy public Products/Variants API documents list/retrieve, not product creation. Asking for
an API key is not a verified solution to creating the four store products.

Any persistent permission/safety-policy exception needs an explicit owner decision. A proposed narrow
scope is: **permit only Ludvig Games test-mode product configuration and dummy-card test checkouts;
keep live charges, bank/payout changes, tax/identity forms, messaging and marketing sends blocked.**
This is a proposal, not an implemented exception. A guard change must enforce that boundary and have
independent safety review before use; changing a general writable-host flag is not evidence of a test-only gate.

## Prepared product settings

Common: SEK, single payment, standard pricing, no subscription, no discount required, no email marketing,
native license-key generation, perpetual duration, no new activation/device limit, and hidden from the
storefront until the corresponding in-game content and purchase journey are verified.

| Internal product | Store name | Starting customer price | Status |
|---|---|---:|---|
| ritkaos-plus | Ritkaos+ | 59 SEK | Existing paid-mode/pack code; native payment delivery unintegrated |
| pigeon-style | Pigeon style pack | 39 SEK | New content/preview and entitlement integration not built |
| karts-style | Karts style pack | 39 SEK | New content/preview and entitlement integration not built |
| games-bundle | Ludvig Games extras bundle | 99 SEK | Exactly the three packs; cannot sell until all three work |

Use tax-inclusive store pricing if these are the final customer totals; verify the actual product tax
category rather than keeping the Add Product form's default SaaS category by assumption. Do not publish
test products in live mode to work around the blocked toggle. Test/live copies have different IDs.

## Payment integration recommendation and required tests

Independent architecture research recommends native Lemon Squeezy license keys, delivered in provider
receipts/My Orders, instead of building a new email service to deliver custom RK codes. The public
License API can validate keys without a merchant API secret. The backend must enforce store/product/
variant allowlists per environment and return only our entitlement IDs. Do not expose customer metadata.
Do not mint permanent RK tokens from a native key, which would discard provider status checks.

Current Ritkaos parser/input only accepts the legacy short RK format. Its permissions are additive in
sessions/snapshots. Integration must handle native keys and revalidation deliberately, preserve issued
legacy codes, and never assume a refund automatically disables a key. Pigeon/Karts need their actual
cosmetic content and entitlement UI. No new integration has been implemented by this inspection task.

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

Ludvig's tax submission is observed, so do not ask him to repeat it. Coordinator must resolve the
explicit browser permission boundary before claiming store mutations or provider tests. The implementing
agent owns game content/previews, integration and guarded local verification. This is not ready to accept
payments. The [1,000 kr/month plan](1000kr-month-plan.md) is prepared separately and makes no sales promise.
No build/dependency data or dev server was created. Only the task's isolated tab was used; private login
storage remains private and preserved. No sensitive details are committed.
