# Withdrawal declaration preparation

Real application source, local and unpublished. **Disabled by default. No email, account, DNS,
Worker deployment, payment or refund has been executed by this implementation.** The form is not
claimed to meet statutory acceptance until its receiving role and actual delivery are established.

The service implements a guest declaration, its server receipt time, automatic acknowledgement
and an operator copy. It does not execute a refund or disable a licence. The operator handles those
through Lemon Squeezy after identifying the purchase. It uses no Lemon Squeezy merchant key.

## Source and boundaries

- `client/` contains only the public HTML, JavaScript and CSS. Wrangler's asset directory is this
  subfolder, so Worker source, this document, configuration and declaration modules are not assets.
- `worker.mjs` serves only the explicit asset paths, config and POST endpoint. Missing settings,
  bindings or secrets return unavailable. Both `WITHDRAWAL_ENABLED` and the deployment config are
  false until the release owner completes the prerequisites below.
- `declaration.mjs` validates bounded fields, verifies Turnstile and prepares the fixed mail request.
- The form collects name, purchase-identifying information and acknowledgement email. An order
  number is useful but not required. It never requests a reason, licence key or account login.
  Review creates no network declaration. Only **Confirm withdrawal** submits it.
- Personal fields stay in the open page, not local storage or URL parameters. Errors preserve
  details. A received declaration cannot be edited into a different notice using the same reference.
- Allowed production origins are the Games site and the exact dedicated Workers service. Optional
  localhost origin/hostname support requires `ALLOW_LOCAL_TEST_ORIGINS=true`; it does not bypass
  CAPTCHA. Do not set that flag in production.

## Receipt, retries and limits

The private SQLite Durable Object serializes operations. Before sending, it stores the complete
canonical declaration, a server-generated UTC receipt time and its digest. The request UUID is
idempotent. A changed declaration with that UUID is rejected; a matching retry preserves the first
receipt time. There is no public read-all, receipt lookup or admin endpoint.

One fixed acknowledgement email goes to the customer's selected address and BCCs
`ludvig@ludvighedin.com` (omitted when it is already the recipient). It contains the declaration,
received date/time and reference. It confirms receipt, not that a refund is complete. Sending is
prepared through Resend's fixed `POST https://api.resend.com/emails`, using a sending-only secret,
fixed sender/reply address and a stable `Idempotency-Key`. User fields cannot set mail headers,
subject, sender, links or HTML. Redirects are rejected, calls time out, and replies are bounded.

API acceptance is reported as **accepted for sending**, not delivery. A failed/ambiguous send stays
pending and the HTTP response does not claim that confirmation was sent. Automatic retries use
one-minute, five-minute and thirty-minute delays, at most four attempts in total and within
23 hours of receipt. Resend documents a 24-hour idempotency window; no automatic retry crosses it.
After that, the record is copied into private Workers KV under `held:<requestId>` for operator
recovery. The inbox then retains only minimal receipt metadata. If export fails, its personal
payload stays in the inbox queue and export retries every 30 minutes without another mail send.
There is at most one outbound mail call per alarm.
Disabling the service also stops queued sends and alarms while retaining already received notices.
After re-enabling, a submission/retry reschedules the pending queue; inspect it during recovery.

The account-wide object reserves two recipient attempts per call, including failed or ambiguous
calls, with a hard **40 recipient attempts per UTC day**. Native IP limits admit two requests per
minute, using a hash rather than storing the raw address. A valid Turnstile token is also required,
with exact expected action and hostname. The pending queue is bounded to 128 references. These are
service safety limits, not proof of available shared provider quota; actual quota must be checked.

After mail API acceptance, the personal-data payload is removed from Worker storage. Minimal digest,
reference, receipt time and mail identifier expire after 30 days. Failed personal payloads stay in
the inbox until export succeeds; held payloads stay in private KV until operator recovery and deletion,
so a received declaration is not silently lost. The customer's and operator's emails
remain under their inbox retention, and Resend's retention applies separately.

### Operator recovery

Provision a dedicated private KV namespace on the approved Free account and bind it as `RECOVERY`
before enabling this service. Do not reuse another project's namespace. A missing binding keeps
the service unavailable. No namespace was created by this local preparation.

Held notices are discoverable in that namespace's **KV Pairs** dashboard under the `held:` prefix.
The authenticated [Wrangler KV read command](https://developers.cloudflare.com/kv/get-started/#42-get-a-value)
provides a concrete recovery route. After verifying the exact Free-account namespace, retrieve one
key into a private file with normal guarded tooling and the isolated Games Free auth directory:

```sh
umask 077
XDG_CONFIG_HOME="$HOME/.config/cf-games-free" \
CLOUDFLARE_ACCOUNT_ID=cffb5d1b12c3302ecc0745862fbf1f14 \
wrangler kv key get --namespace-id <verified-recovery-namespace-id> \
  'held:<requestId>' --remote > <private-recovery-file>
```

Replace placeholders with the verified namespace, reference and private output path. Never print
the file or redirect it into this repository. This recipe does not claim that remote credentials
or a hosted namespace were already tested. The real local Worker/SQLite/KV fixture exercises four
failed sends, private key discovery/read, metadata expiry and preservation of the original receipt
time. Verify remote retrieval with a synthetic held fixture during deployment before launch.
No public read or admin endpoint is provided.

Before manually retrying beyond the
provider's idempotency window, inspect the original Resend request/message to avoid duplicate sends.
Preserve the original declaration and receipt time in any manually issued acknowledgement. Resolve
held payload retention after the enquiry is handled by deleting its private KV key. Minimal inbox
metadata expires separately after 30 days. Do not log or paste customer fields or keys.

For a valid full refund: use the documented Lemon Squeezy merchant refund operation, confirm it
succeeded, then disable **only that purchase's licence**. This code does neither automatically.

## Activation prerequisites owned by the release coordinator

1. Obtain explicit owner approval before Resend receives customer name, acknowledgement email and
   purchase information. No account, token or sending domain has been created by this source task.
2. Verify the actual existing/new account is on its Free plan, paid overage is off, and enough shared
   daily/monthly allowance is available. Do not enable a subscription or paid overage. The hard local
   limit does not establish headroom in an account also used by other projects.
3. Verify a sending domain for the already-confirmed sender `ludvig@ludvighedin.com`. Do not invent a
   sender or overwrite existing mail/DNS settings. Disable open and click tracking on that domain and
   verify it is off; this is a domain setting, not a claimed per-message API option.
4. Create/use an approved **sending-only, domain-scoped** key and install it as `RESEND_API_KEY` through
   the approved secret route. Keep it out of Git, output, browser code and ordinary configuration.
5. Provision the production Turnstile widget for the exact form hostname, and its secret/site key as
   `TURNSTILE_SECRET` and `TURNSTILE_SITE_KEY`. Configure no local-test bypass in production.
6. Review source independently and run focused tests through the normal local guards. Coordinator
   verification passed 18 checks, including the real local workerd/SQLite/KV engine and client
   Review/Confirm, failure and retry logic. Both outbound providers were mocked and network disabled.
   No actual browser, hosted runtime, Turnstile challenge or email delivery pass is claimed. Those
   remain activation acceptance work. Installed engine date is 2026-07-30, not the hosted config date.
7. After approval, perform one real email test using only an owner-controlled address. Confirm the
   actual durable message contains the exact declaration and server receipt time, and the operator
   copy arrives. Provider API acceptance alone is not that delivery test.
8. Resolve how receipt through this supplier form applies to the Lemon Squeezy purchase contract.
   Their public refund routing permits ordinary merchant refund handling, but the exact statutory
   receiving/acknowledgement role remains unresolved. Do not claim provider approval from that fact.
9. Only then link the function prominently from the shared shop, purchase information, each game's
   purchase route and relevant provider receipt/checkout information. Update privacy/retention
   information for this actual route before activation. This source task changed none of those links.
10. Activate and check the actual customer declaration/acknowledgement journey on the preserved paid
    test order before treating withdrawal acceptance as passed. Opening live purchases remains held.

## Primary API references checked for preparation

- [Resend Send Email](https://resend.com/docs/api-reference/emails/send-email): fixed send endpoint,
  `from`, recipient/BCC, `reply_to`, text/HTML and returned message ID.
- [Resend idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys): stable header and
  24-hour retention; this implementation stops automatic retries at 23 hours.
- [LS buyer charge help](https://www.lemonsqueezy.com/why-did-lemon-squeeezy-charge-me) and
  [refund operation](https://docs.lemonsqueezy.com/help/orders/refund-order): ordinary merchant refund
  handling. These are not a statutory agency appointment.

The builder ran no tests. Coordinator verification: 18 checks passed with
`GAMES_WITHDRAWAL_ENGINE=true agent-heavy-run games-local test ludvig-games/commerce/tests/withdrawal.test.mjs ludvig-games/commerce/tests/withdrawal-client.test.mjs`.
Independent source review identified the previously missing private recovery route. The coordinator
added private KV export and verified held-notice discovery/read in the actual local engine. A client
retry failure also preserves its already-confirmed receipt. The real-provider, browser and statutory
acceptance limits above remain open. No account, real mail, DNS or deployment changed.
