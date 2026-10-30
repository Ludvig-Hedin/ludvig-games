# Purchase release review, 30 October 2026

## Decision

**Not ready for paid release. Purchases have not been activated.** The free site is already live.
Ludvig supplied Lemon Squeezy's account-approval email on 30 October. This resolves the merchant
approval wait recorded on 28 October. It does not prove a live product, working delivery or payout setup.
No dashboard session, credentials, product configuration or payout details were inspected in this review.

The first paid offer and its price still need Ludvig's confirmation. The implementation contains
Ritkaos+ at 79 SEK and nine individual extras at 19–29 SEK. These are existing source values, not newly
approved launch prices. The game stays free to play, with optional paid extras, under the 22 October
owner decision. A concrete product question was raised in chat; dependent activation is pending.

## Checklist for Ludvig

- [ ] Confirm the first product, included extras and final customer price. Choose whether individual
  extras also go on sale. If this launch is for something other than Ritkaos, name that product first.
- [ ] In [Lemon Squeezy](https://app.lemonsqueezy.com), check that the approved Ludvig Games store
  offers Live mode and has no outstanding account tasks. Keep customer checkout unlinked until testing passes.
- [ ] Check **Settings → Payout** and complete any bank/PayPal, identity or tax-form tasks shown there.
  Account approval does not establish that these details are complete. Do not send bank details or keys in chat.
- [ ] Verify the email on the separate games Cloudflare Free account if still pending. The latest saved
  deployment attempt failed with error 10034. This review does not establish today's dashboard status.
  Preserve the Free-plan decision and the existing hold on the Paid account's game backends.
- [ ] Confirm rights and licences for the chosen paid content, including any supplied assets. Keep
  third-party notices. The repository includes a separate GPL Chess exception; AI generation is not
  evidence of rights clearance. See [the existing readiness record](legal-readiness-2026-10-28.md).
- [ ] When the test checkout is ready, try the buyer journey in **test mode**, including receipt,
  delivered code, unlocking and recovering the code. Follow the approval email: never use your real card
  to test your own store. The implementer owns technical checks; this step is owner acceptance.

Product creation, checkout wiring, testing and deployment are implementation tasks, not extra dashboard
homework for Ludvig. If access prevents a specific setup action, identify that exact action when needed.

## Implementation work before activation

- [ ] Map the confirmed products to actual Lemon Squeezy products/variants and prices. A generic
  `?product=office` appended to a checkout URL does not establish provider-side product selection.
- [ ] Complete verified payment-to-entitlement fulfilment and immediate customer delivery. Verify
  signatures, store/product identity, payment state and test/live separation. Record orders durably,
  make repeated events safe, and recover failed delivery without requiring a second purchase.
- [ ] Provide receipt/code recovery and verify re-entering a purchased code on another device. Existing
  access depends on local browser codes; there is no account-based restore or order lookup in the app.
- [ ] Document refund/support operations consistent with the published full 14-day refund policy.
  Existing codes are shareable and cannot be individually revoked, so do not promise automatic access
  removal. A paid launch must not depend on an unbuilt revocation feature.
- [ ] Finish the checkout confirmation and withdrawal work already tracked in the legal-readiness
  record. Update the public statement that paid checkout is unavailable only as part of the paid launch.
  This review is not a fresh legal clearance of the purchase flow.
- [ ] Resolve the Free-account deployment hold, deploy only the required approved backend, and check
  free play, a purchased host's room access and purchased cosmetics. Do not restore all paused services
  or deploy the old combined hub configuration as a side effect.
- [ ] Prove test checkout, failed/cancelled payment, immediate delivery, redemption, wrong-product
  rejection, repeated events, refund handling and recovery. Keep one verification owner and local checks.
- [ ] Only after acceptance, configure live products, live credentials and live webhooks where needed.
  Copied live products get new IDs and checkout URLs. Verify the final mapping and deployed configuration
  before exposing Buy. No real-card self-purchase as a release test.

## Review evidence and limits

Independent read-only purchase review and primary source inspection agree on these blockers:

- `ritkaos/public/app.js:385`: Buy is enabled by a configured secret plus HTTPS checkout URL, not by
  proof that payment/delivery is operational. Do not activate it just by setting `CHECKOUT_URL`.
- `ritkaos/worker/index.mjs:23`: routes cover store information, rooms and WebSockets; no commerce
  webhook or order/delivery route exists. `ritkaos/README.md` explicitly records the missing glue.
- `ritkaos/lib/store.mjs:50`: manually minted HMAC codes encode products, without order linkage or
  individual revocation. `ritkaos/lib/game.mjs:96` verifies them and accumulates session permissions.
- `ritkaos/public/app.js:146`: redeemed codes persist locally. Recovery requires the original code.
- `policies/refunds.html:1`: public copy still says paid checkout is unavailable.

Fresh read-only HTTP checks on 30 October:

- Homepage, Terms, Privacy and Refunds: HTTP 200. Homepage contains no Ritkaos or Lemon Squeezy link.
- Hub `/api/scores` and `/api/me`: HTTP 404.
- Planned Free-account Ritkaos homepage and `/api/store`: HTTP 404.
- Planned Free-account hub API `/api/scores`: HTTP 404.

GitHub has no open PRs in this repository at review time. Latest published Mac release is 0.4.2,
25 October, with Apple Silicon DMG/ZIP assets. This is release metadata, not a fresh installation or
signing/notarization check. The root README still describes an unsigned app.

No purchase, webhook delivery, refund, dashboard setup, physical-device journey or gameplay was tested
in this review. Existing test files do not prove a provider checkout works. No new test pass is claimed;
the installed focused-test guard currently accepts Vitest files, not this project's Node `.mjs` tests.
The implementer must arrange an approved guarded focused-check route when implementing payments.
No remote CI, deployment, push, browser, dev server, dependency install or build was started.
No disposable development data was created, so none remains to clean up.

## Provider references checked today

- [Activation](https://docs.lemonsqueezy.com/help/getting-started/activate-your-store)
- [Testing and going live](https://docs.lemonsqueezy.com/guides/developer-guide/testing-going-live):
  separate test/live keys, products and webhooks; live copies have new checkout URLs.
- [Test mode](https://docs.lemonsqueezy.com/help/getting-started/test-mode)
- [Payout setup](https://docs.lemonsqueezy.com/help/getting-started/getting-paid)
- [Refunds](https://docs.lemonsqueezy.com/help/payments/refunds-chargebacks)

Next: Ludvig confirms the paid offer and completes any account-only tasks above. The implementing
agent owns payment integration, focused verification and preparation for activation. Paid release
remains blocked until those steps are complete; this document does not authorize bypassing cost holds.
