# Test-only native licence service

Local implementation, not deployed. The owner's bundle test purchase, emailed receipt/native key and
all three local browser unlocks are verified. Ritkaos also restored ownership after reload.
The coordinator owns guarded checks, independent review, actual store configuration and browser evidence.

## Integration contract

`createLicenseResolver({storeId, environment, products, fetchImpl?, now?, takeBudget?})` from `license.mjs`
returns `{catalog(), resolve(key)}`. Only environment `test` is accepted. `catalog().ready` stays false
until all four offers have real positive store/product/variant IDs, explicit `testMode: true` and exact
HTTPS `*.lemonsqueezy.com/buy/<UUID>` or `/checkout/buy/<UUID>` checkout URLs. No placeholder credentials, live mode or native key
in URLs. Missing settings do not unlock anything.

`resolve(key)` accepts a native UUID key and returns only
`{ok:true,environment:'test',entitlements:['ritkaos'|'pigeon'|'karts', ...]}`. Bundle returns all three.
Failures throw `LicenseError` with safe `.code` and `.status`. No provider/customer/key data is echoed.
Existing RK tokens are not parsed here and should retain their separate legacy verification path.

**Important:** a new key's provider status can be `inactive` (valid, no activations). This service accepts
both `active` and `inactive` only when provider `valid` is true. It does not impose a new device limit or
create activation instances. Disabled/expired keys fail. Don't convert this result into a permanent RK
token. Recompute the provider-derived entitlement set on validation instead of only adding permissions.

## Configuration

Use private ignored environment files, never source/HTML, for deployment settings:

```json
{
  "ritkaos": {"productId":"REAL_TEST_PRODUCT_ID","variantId":"REAL_TEST_VARIANT_ID","checkout":"https://STORE.lemonsqueezy.com/buy/REAL_TEST_CHECKOUT_UUID","testMode":true},
  "pigeon": {"productId":"REAL_TEST_PRODUCT_ID","variantId":"REAL_TEST_VARIANT_ID","checkout":"https://STORE.lemonsqueezy.com/buy/REAL_TEST_CHECKOUT_UUID","testMode":true},
  "karts": {"productId":"REAL_TEST_PRODUCT_ID","variantId":"REAL_TEST_VARIANT_ID","checkout":"https://STORE.lemonsqueezy.com/buy/REAL_TEST_CHECKOUT_UUID","testMode":true},
  "bundle": {"productId":"REAL_TEST_PRODUCT_ID","variantId":"REAL_TEST_VARIANT_ID","checkout":"https://STORE.lemonsqueezy.com/buy/REAL_TEST_CHECKOUT_UUID","testMode":true}
}
```

The JSON above is the value of `LS_TEST_PRODUCTS`, not a credential or working fixture. Set `LS_STORE_ID`
and `TEST_MODE=true`. Verify these IDs in the provider's **test** catalog. The License API has no
documented `test_mode` response property: separation relies on exact separately verified product/variant
IDs. A `testMode` config declaration alone is not external proof. No live-ready configuration exists.
Native provider key generation/receipt delivery and My Orders recovery must be tested in the provider.

## HTTP and local preview

- `GET /api/store` returns `{environment:'test',ready,products:[{id,name,price,currency:'SEK',checkout}],recoveryUrl}`.
- `POST /api/licenses/resolve` accepts **only** `{key}` JSON or `text/plain` JSON. No product claim is accepted.
- Exact permitted origins: `https://games.ludvighedin.com`, `https://ritkaos.ludvighedin.workers.dev`.
  Local adapter also permits localhost/127.0.0.1 ports 4317, 4322, 3000 and 8793. Origin checks supplement
  rate/validation limits; they do not authenticate a non-browser caller.
- Native keys are bearer credentials, remembered on the client only if that UI chooses to do so.
- `server.mjs` binds **127.0.0.1**, default 4322, and serves only built `../public` assets. No directory
  listing, dotfiles, source files, out-of-root symlinks or API fallback to HTML. It does not build assets.

Coordinator's intended launch, from `ludvig-games/`, with Node22 and private env supplied to the process:

```sh
agent-heavy-run dev /Users/ludvighedin/.nvm/versions/node/v22.23.2/bin/node commerce/server.mjs
```

Use the existing approved dev script, `agent-heavy-run dev bun run dev:commerce`.
From the games root, run focused checks through
`agent-heavy-run games-local test ludvig-games/commerce/tests/license.test.mjs`.
Do not bypass RAM/process admission. The memory guard may stop a disposable dev server.

## Bounded service

Input body 256 bytes, provider response 16 KiB, timeout 5 seconds, at most 8 in-flight distinct keys,
successful-result cache 30 seconds/256 hashed entries, duplicate calls share one provider request.
No rejected result/customer metadata is persisted; no key/customer logging exists. The local service
limits inbound requests to 6/minute per loopback peer and outbound calls to 20/minute.

The standalone Worker requires a rate-limit binding and the single `Licenses` SQLite Durable Object.
The DO transaction persists a global 20-call/minute reservation before contacting the provider, including
failures. It has no alarms/timers keeping it alive, no new D1 database, KV, R2 or paid service. It writes
only accepted outbound reservations. Missing bindings/configuration fail closed. The provider documents
60 requests/minute without clarifying scope, so there is headroom rather than an assumed per-user quota.

`wrangler.test.jsonc` has no custom domain/account_id, logs or paid-plan flags. **Never deploy it on the
old Paid account.** Only the already-approved games Free account may host this test Worker, using that
account's isolated Wrangler login. Its single new Durable Object class requires independent review and
owner-authorized deployment, and the current account email/plan must be checked first. No deployment
was attempted here. Do not activate unrelated paused games or hub APIs.

## Required proof and limits

Mocked tests cover configuration/allowlists, single/bundle grants, inactive/disabled/expired keys,
wrong environments, no data leakage, provider errors/type/size/timeout, caching/duplicate/budget bounds,
and request/origin validation. Root ran the 13 service tests and client race regression successfully through the guarded local lane.
An opt-in real-provider check is also available in `tests/paid-bundle.test.mjs`. Supply only the private
secret-card file path as `LS_TEST_LICENSE_FILE`, then run that explicit file through the guarded Games
lane. It validates the purchased bundle, exercises the actual Ritkaos grant and a paid room setting,
checks no raw key enters snapshots/messages, and rejects a wrong-store configuration. It passed.

The bundle success path is verified. Remaining release checks include single-pack provider purchases,
failed/cancelled payments, fresh-device My Orders recovery, real disabled keys and refund operations.
Provider validation is cached for 30 seconds; loaded style pages can retain in-memory ownership until
the next restore/reload. Refunding is not assumed to disable a native key. These adapters do not process
refunds or send mail. Live mode is deliberately unsupported until separately prepared and authorized.

Official references checked 30 October 2026:
- https://docs.lemonsqueezy.com/api/license-api
- https://docs.lemonsqueezy.com/api/license-api/validate-license-key
- https://docs.lemonsqueezy.com/help/licensing/generating-license-keys
- https://docs.lemonsqueezy.com/guides/developer-guide/testing-going-live
