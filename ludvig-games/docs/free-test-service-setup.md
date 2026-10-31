# Free test purchase-service setup

Prepared locally, 31 October 2026. The narrow wrapper is wired and source-reviewed. The account-only
check ran, but subscription reads returned HTTP403/code10000. No Worker was deployed or secret uploaded.
Root owns remaining execution. CLI authentication succeeds on the correct account.

**Resolved account access:** after Ludvig signed into the existing .se identity, fresh authorized
browser reads confirmed `email_verified: true`, the exact account is standard, and subscriptions
are empty with `result_info: {page: 1, per_page: 25, next_page: false}`. No new API token or repeated
email verification was needed. The six focused browser-auth tests passed.

The fixed helper now prefers the current task-scoped read-only browser capability. Its hash-pinned
`games-free-dashboard-proof.py` uses the normal `owner-browser-mcp` connection, with existing browser
registration, leases and RAM limits. Cookies remain inside the browser. It fetches only the three
fixed official user/account/subscription URLs with GET, redirects refused and bounded JSON responses.
The helper requires the exact .se identity, positive verification, standard Free account, an empty
subscription list and the observed terminal pagination marker. Capability changes/revocation/expiry
are checked before each read and on return. Unknown or nonempty subscriptions fail closed. Fresh
sensitive source review accepted this path; negative fixtures and actual guarded deployment remain
root's execution work. Direct urllib proof was rejected by the provider and is not used for cookies.

Earlier access check: the authorized Dia cookie export identified `ludvighedin15@gmail.com` and
the official dashboard user response says `email_verified: true`. That user receives access errors
for the separate Games Free account. The Free OAuth identity is `ludvighedin.se@gmail.com`;
the owner already reported verifying it. Do not infer that either email needs verification from
the other identity's permission error. The existing OAuth access token subsequently expired;
guarded `whoami` refresh subsequently succeeded. The task-scoped existing-account login is now
confirmed, without a new token or another email-verification step.

The browser read guard also blocked Cloudflare's ordinary security handshake. The narrow reviewed
exception was corrected for the observed `h/g/fo` path and for fetch metadata absent from intercepted
headers. Exact Origin, Referer, frame, fresh official challenge proof and bounded body remain required.
Fresh browser evidence now shows that same-origin handshake request is no longer blocked by the
client. This is not proof that the challenge completed. Focused guard fixtures remain queued.

The candidate helper is `agent-dotfiles/home/.local/lib/agent-runtime/games-free-store.py`. Its only
operations are `check-account`, `deploy-test` and `set-test-grant`, from the exact Games root. Root
exposes these through a pinned `agent-heavy-run games-free-store <operation>` case using the
existing registered `client-build` resource class. Keep its RAM floor, exclusivity and heap limit;
do not use a full-suite flag or generic-command passthrough.

## Account gates and a real evidence limit

The helper reads only the existing isolated OAuth file under `~/.config/cf-games-free`, never the
default Wrangler profile or an inherited token. Root should first complete the already prepared
`agent-heavy-run games-free-auth whoami` or `login` route. This helper does not refresh credentials.
It checks live supervisor/child identities and job registration again before every external write.

Before deployment it requires fresh official API responses proving:

1. The authenticated user is not suspended. A literal negative email-verification flag blocks writes.
   The public API omits that field in the observed response; absence stays unknown.
2. Account `cffb5d1b12c3302ecc0745862fbf1f14` is a standard account.
3. The complete account subscription list is empty. Cloudflare documents Workers Free as the
   default. Any unknown, active or otherwise returned subscription blocks this deliberately narrow
   path, including unrelated subscriptions. `default_usage_model: bundled` is never treated as Free.

**The current public `/user` OpenAPI schema does not document `email_verified`.** The field may be
present in the actual response, but this was not observed here. Absence remains unknown; it does not
mean Ludvig's email is unverified and is not grounds to ask him to repeat verification. Independent
source review accepted Cloudflare's own upload enforcement for this exact authorized test service,
after fresh Free-plan proof. A successful upload proves deployment was permitted, not a positive API
email flag. Only the known verification error marker/code10034 may trigger that specific diagnosis.

Cloudflare documents **Billing Read** as the permission covering subscriptions and entitlements.
The current isolated OAuth scopes (`account:read`, `user:read`, `workers_scripts:write`) have not
proved they can read subscriptions. The actual subscription GET was denied with HTTP403/code10000.
The owner declined further token-creation steps and asked root to use existing access. Do not request
another token or repeat email verification based on this denial. Root is repairing the task-scoped
read-only browser authentication path to establish fresh plan evidence. Do not grant Billing Edit, change a plan,
create a subscription, reuse the old Paid account, or call a lack of permission proof of Free status.

## Fixed test service

After the gates pass, `deploy-test` copies only the four hash-pinned commerce modules into a private
temporary directory, writes an exact Wrangler JSON config and runs the existing pinned Wrangler.
The temporary source/config is removed afterwards. No `.env` file or arbitrary source folder is
copied. The config has:

- Worker `ludvig-games-store-test`, fixed Free account, workers.dev enabled, preview URLs/logging and
  metrics disabled, compatibility date 2026-10-30.
- Only the approved store 504842 and the four inspected test products. No live map or live checkout.
- `LS_GRANT_KEY_ID=games-test-v1`, `TEST_MODE=true`, and the existing local-test-origin allowance.
- `LICENSES` bound to `Licenses`, the existing `v1` SQLite Durable Object migration, and the existing
  `LICENSE_IP_LIMIT` rate binding 4201 at six checks per IP per minute. The shared resolver's global
  provider budget remains in the reviewed source. No D1, paid feature, domain or route is introduced.

The public-only `~/.config/ludvig-games-commerce/test-desktop-public.json` must still match those exact
IDs. Existing Worker bindings, when present, must match this test scope before modification. The
helper refuses unrelated bindings and never permits another Worker/account name. The Durable Object
must explicitly identify class `Licenses`; `script_name` must identify this Worker or be omitted,
which the official binding schema documents as local. External environments and dispatch namespaces
are refused. The rate binding must expose namespace `4201`, limit six and period 60, with no extra
mitigation behavior. Missing authoritative binding fields block writes.

After a successful fixed-source `deploy-test`, the helper extracts the exact `Current Version ID`
from captured Wrangler output and checks the official deployment list. Its first entry is documented
as the deployment currently serving traffic; exactly that version must receive 100%. The helper then
saves a private, owned deployment receipt at
`~/.config/ludvig-games-commerce/test-store-deployment.json`, containing the fixed account/Worker,
version, accepted source hashes, public configuration hash and time. No signing material enters it.
Missing or ambiguous CLI/API version proof prevents receipt creation and any later secret upload.

`set-test-grant` additionally requires that exact test Worker to exist and match its public test
bindings, plus a receipt matching the current accepted source and public verifier configuration.
It confirms the receipted version is still the sole active version before reading the key, and
repeats receipt, binding and live-version checks immediately before uploading it. A remote edit,
rollback or split deployment blocks the upload. A missing receipt cannot be replaced by matching
bindings or a caller-supplied version. It reads only `test-grant-private.jwk` from the same private directory, checks its public
half against the staged pin, and performs an actual local signature/verification readiness probe.
The private JWK enters only the fixed `wrangler secret put LS_GRANT_PRIVATE_JWK` command through stdin.
It is never an argument, environment variable, log line, repository file or returned tool value.
Raw CLI stdout/stderr is captured and not printed. A fixed sanitized result reports success/failure.
No live signing key is generated or handled by this helper. Secret updates may create a new Worker
version; the original deployment receipt does not authorize another upload to a different version.
After an uncertain result, inspect the state rather than retrying blindly.

## Remaining acceptance

No helper command, Cloudflare read or write, Wrangler invocation, signing probe, build or test was run
by this preparation task. Only source syntax/whitespace may be checked locally. Root still needs:

1. Source review and the pinned wrapper case are prepared; subsequent auth changes were independently reviewed.
2. Successful guarded account/verification/Free proof. Resolve the API limits above before deploying.
3. The exact test deployment followed by secret setup, then fetch the fixed test `/api/store` and
   verify `ready`, `grantReady`, store mode/products and wrong-origin rejection.
4. A real provided native test key through resolve/grant, and real Mac federation acceptance with
   the same public pin. No fake entitlement or arbitrary service host can count as delivery proof.

Live products, live service activation, the shared public shop, app publication and refund/withdrawal
acceptance remain outside this helper. No new dependency or disposable build folder was created.

Primary references inspected:

- [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/), default Free and
  account-level Paid plan. An empty complete subscription list is the helper's conservative inference
  from that published model, not a documented dedicated `is_free` field.
- [API permissions](https://developers.cloudflare.com/fundamentals/api/reference/permissions/),
  Billing Read covers subscriptions and entitlements.
- Current Cloudflare OpenAPI `GET /user`, `GET /accounts/{account_id}` and
  `GET /accounts/{account_id}/subscriptions`, inspected through the connected official API-spec tool.
- The same official spec's Worker settings binding variants and
  `GET /accounts/{account_id}/workers/scripts/{script_name}/deployments`; the documented list ordering
  identifies its first deployment as the one actively serving traffic. Cached Wrangler 4.152.0 source
  confirms the exact `Current Version ID:` output used by the receipt parser.

Next owner: root, for review and executable proof. No action was requested from Ludvig by this task.
