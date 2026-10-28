# Policies and payment readiness, 28 October 2026

Owner request: create and publish Terms, Privacy Policy and refund information; check paid delivery and
refunds. Owner confirms the games were AI-generated. This is not proof of exclusive ownership or clearance
of included third-party code, artwork, names or other assets.

## Public policy scope

Source: `policies/terms.html`, `policies/privacy.html`, `policies/refunds.html`. The builder publishes them
at `/terms/`, `/privacy/` and `/refunds/`. They describe the current free hub and Mac app, and identify the
operator as Ludvig Hedin, Stockholm, Sweden, contact ludvig@ludvighedin.com. The owner confirmed that
Ludvig Hedin is the business name, 28 October 2026; the connected Stripe account's business name matches.
Do not include references to the owner's portfolio or client work in the public policies (owner decision,
same date). The public text was shortened after the requested independent critique.

Refund choice: owner said to follow law, standards and user expectations. Implementation uses full refunds
on request within 14 days, including after trying or redeeming an extra. Longer statutory remedies remain.
No automatic access removal is promised.

## Sales blockers and owners

- **Confirmed by Ludvig:** business address and phone from Stripe are correct (28 October 2026). They
  are used only in the Terms' compact operator-contact block. No apartment number or personal identifier
  is copied from Stripe. Owner supplied four
  Lemon Squeezy screenshots: Ludvig Games / ludviggames, SEK, in review/not activated, and no products in
  the displayed test-mode catalogue. These do not establish whether a separate live catalogue exists or
  what was written in the original application. The original application is still not visible.
- **Implementer, after product/store facts are known:** connect verified payment events to fulfilment.
  Ritkaos currently opens a generic `CHECKOUT_URL`, supports manually minted signed codes, and has no
  payment verification, order ledger, webhook or delivery. Do not enable checkout before the actual buyer
  journey works. Check a provider test purchase, delivered code, redemption, repeat event and refund.
- **Implementer:** define the refund operating steps and access consequences before launch. Current
  Ritkaos codes are shareable and cannot be individually revoked. Session ownership and snapshots retain
  permissions. A refund must not depend on a revocation feature that does not exist.
- **Implementer:** provide the required withdrawal function and durable confirmation in the actual online
  contract flow. Give the withdrawal form with the actual seller details filled in. A generic form link
  in the free site's policy does not finish these checkout duties.
- **Ludvig/rights review before selling:** confirm licences and rights for the actual paid deliverable.
  Preserve third-party notices and the Chess GPL exception. AI generation alone does not settle rights.

These are sales-readiness blockers, not evidence that the published policies certify the whole service.
No paid API, checkout, Worker backend or offline game may be enabled under this task's policy publish.

## Data facts and remaining limits

The live hub had 52 game cards, Google Fonts and Cloudflare Web Analytics. `/api/scores` and `/api/me`
returned 404. The existing client still attempts score requests, including player ID/nickname/score, so
the privacy page does not claim nothing leaves the device. Browser and Mac saves do not have a universal
expiry. Historical leaderboard retention is based on ranking and pruning after submissions, not a fixed
age; pruning is stopped while the API is paused. Requests for historical cloud data need manual handling.

Provider retention settings and all historical database/backups were not independently audited. The
policy describes known criteria and links provider notices; it does not invent a deletion deadline.
The provider transfer references identify Cloudflare, Google and GitHub's published DPF/SCC arrangements,
not a new contract signed by this task. Keep provider agreements and any further data-transfer assessment
under review before describing the service as fully GDPR compliant.

Mac data is held locally; nearby hosts receive room data, Bonjour advertises the computer name, and the
app checks GitHub for updates. Local multiplayer HTTP/WebSocket traffic is not HTTPS encrypted.

## Verification and publication record

Focused browser checks covered the homepage footer opening Terms, all three policy pages at 390 px and
desktop layout, selectable policy text and no horizontal overflow. The local analytics beacon produces
an expected localhost CORS error; no claim is made that localhost analytics succeeds. No full suite or
remote CI was run. A fresh reviewer checked policy/build/CSS accuracy; retention criteria and transfer
references were then made specific in response to its two findings.

The static candidate used a private temporary build with external games hidden. A comparison of 507
existing generated files against live HTTP responses found no unexpected game changes. Policy/footer
changes are limited to hub, category and about pages, the sitemap and stylesheet. Cloudflare's dynamically
managed robots response must not be copied back into the source asset.

Published on 28 October 2026 through the approved guarded static lane. Previous production version
`a116be06-07fa-4dd3-b6c2-60ee3b9a355d` was checked immediately before publishing. New version:
`1fd7c97a-8a17-4e5e-9494-62c1eb1aa453`. The three policy URLs, homepage, stylesheet and three sample
games returned 200 and matched the candidate bytes. All 52 game cards remain. Both paused API endpoints
still return 404; Cloudflare settings contain no bindings. The earlier urllib client was rejected with
403; curl returned the public pages successfully. This was a client-specific verification issue.

No new dev server or browser was started for publication. The rebuildable static release candidate was
removed after verification. Source policies, screenshots and the release receipt remain.

## Shortened revision and independent roast

The owner requested concise, professional public pages and muted text links at the bottom. A fresh
reviewer called the initial draft too long and defensive. The revision removes internal launch
instructions, unrelated scope disclaimers and AI liability commentary. Terms went from 769 to 332 words,
Privacy from 1,395 to 641, and Refunds from 606 to about 190. A focused review accepted the cuts and asked
only that refund order references remain optional; that wording is repaired. This does not resolve the
known retention/transfer implementation questions or establish sales readiness.

The revised layout uses a simple policy header and readable column, with Terms, Privacy, Refunds and
Contact in a muted footer row. The homepage-footer-to-Terms journey and all three revised policies were
checked at 390 px; desktop reading width and footer appearance were also inspected. Screenshots in
`output/policy-privacy-preview.png` and `output/policy-footer-preview.png` are local app previews, not live.

The owner approved adding the narrowly scoped registered static publishing command on 28 October 2026,
retaining the installed RAM limits and forbidding backend activation. Implementation and fresh safety
review are required before the publication retry. Existing guard-file differences must be preserved.

The approved publisher is installed and saved in the dotfiles repository at `e53adae`. It preserves
RAM admission, process registration and the heavy lock, pins the existing Cloudflare account/domain,
and accepts only this site's static candidate. Fresh review accepted supervisor identity and lock
checks. The subsequent auth review found Wrangler's legacy HOME fallback; the helper now fails closed
if that folder exists immediately before every Wrangler launch. Auth uses a private XDG directory.
Helper syntax, matching copies and wrapper pins passed. A guarded check accepted the 513-file candidate
before the auth-only changes; a wrong candidate path was rejected. Later retries hit a busy scheduler.

Cloudflare OAuth was renewed successfully in the isolated auth directory. The guarded publisher then
validated the snapshot and deployed static assets only. The publication and focused live checks are
complete. The ready email wording is saved at `output/lemon-squeezy-reply.txt`; no email was sent.

There is no remaining publication action for Ludvig. The sales blockers and privacy implementation
limits above remain separate follow-up work. The task coordinator owns any requested payment work;
checkout remains unavailable until a concrete product and functioning delivery/refund journey exist.
