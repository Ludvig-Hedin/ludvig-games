# Making money with AI-made games: research and plan, 30 October 2026

Independent Opus research, reviewed and corrected by the coordinating agent. Research document only.
No app or production change, purchase, post or deployment.
Paid checkout is still **not** integrated or live (see [purchase-release-2026-10-30.md](purchase-release-2026-10-30.md)).

Subsequent owner decision: Ludvig accepted the proposed 59/39/39/99 SEK starting prices and omitting
the individual 19–29 SEK extras. Approval labels below describe the research-stage state, not a reason
to reopen that decision. Current setup checklist and first-sales plan: [first-100kr-plan.md](first-100kr-plan.md).

Labels used in this report:

- **Approved** = an owner decision already recorded in the repo.
- **Recommendation** = my proposal. It needs Ludvig's decision before anyone acts on it.
- **Fact** = checked against a source linked next to it. **Claim** = someone said it; not audited.
- **Assumption** = a made-up input for a scenario. Not a forecast.

---

## 1. Short answer

1. **This research did not establish repeatable income from a large catalog of AI-made games.**
   The visible examples include people who already had an
   audience (Pieter Levels), to people who spent years on one product (AI Dungeon), or to one game that was
   pushed hard on Steam (HEXSTORM, about 6,000 USD net in week one, self-reported). Typical earnings are
   unknown. One study found four in ten jam links offline within 18 months; this is not sales evidence.
2. **Do not rely on the AI-made label as the pitch.** The cases do not isolate its effect on sales.
   Some received backlash. Runtime AI is different: there AI is part of what people pay for.
3. **Cosmetic packs are a fine first *experiment* here, not a business yet.** They are low-risk, cheap to
   make and keep everything free. But nobody knows how many people play Pigeon, Karts or Ritkaos each week.
   Without that number, any revenue estimate is a guess. The costly part is not the hats. It is the payment
   delivery, code recovery, refunds and support, which cost the same whether 2 or 200 people buy.
4. **Ritkaos is not playable on the live site right now.** Its server is off under the cost lockdown, and the
   live hub hides it. Ritkaos+ cannot sell until Ritkaos online play is back on the Free account.
5. **Recommended prices (needs decision):** Ritkaos+ 59 kr, Pigeon style pack 39 kr, Karts style pack 39 kr,
   bundle of all three 99 kr. Recommend omitting the individual 19 to 29 kr extras at launch. A 19 kr
   order leaves about 9 kr after illustrative VAT and fees, before costs/tax. It is not automatically a loss.
6. **Biggest lever is not price, it is players.** Inspect traffic per game and its limits first. Then focus on
   3 to 5 games, make clips of those, and try one free distribution test on a game portal.
7. **Agents can do almost all the work.** Ludvig keeps the few things that must be his: prices, account and
   payout details, public posting under his name, spending and anything legal.

---

## 2. What is already decided (approved, not reopened)

From [purchase-release-2026-10-30.md](purchase-release-2026-10-30.md), [betalmodell-2026-10-22.md](betalmodell-2026-10-22.md),
[free-account-plan.md](free-account-plan.md), [cost-lockdown-2026-10-24.md](cost-lockdown-2026-10-24.md)
and [anything-vs-anything-launch.md](anything-vs-anything-launch.md):

- Games stay free to play. Paid items are optional extras (22 Oct).
- Paid lineup (30 Oct): **Ritkaos+** (existing extras), a new **Pigeon style pack** (hats and looks), a new
  **Karts style pack** (colours and designs), and a **bundle** of those three. Existing content stays free.
  The bundle does not promise future releases. Exact contents and prices are **not** approved.
- Lemon Squeezy approved the account (email on 30 Oct). Live products, payout and delivery are not verified.
- No surprise server bills. Server parts of the games move to a Cloudflare **Workers Free** account, which
  was waiting for email verification at the latest saved rollout. Current dashboard status is unknown.
  Old Paid backends stay off.
- Anything vs Anything stays hidden and paused, with a separate 1,000 kr per month AI budget for a later
  launch and no activation authority. This report does not change that.
- The published refund policy offers full refunds within 14 days.

Facts from the source code that matter for business:

- `ritkaos/lib/store.mjs`: Ritkaos+ at 79 kr unlocks nine extras: five word packs (19 to 29 kr), three modes
  (19 to 29 kr) and one cosmetics item (29 kr). Bought one by one they would cost 213 kr. These prices are
  only candidate values.
- Codes are HMAC codes that hold a product list. They are shareable and cannot be revoked one by one.
  There is no order ledger, no webhook route and no recovery flow yet.
- Pigeon has a built-in vertical clip recorder and daily quests. Karts races AI karts for 1 to 4 players.
  Both run as static pages. Their online play depends on the hub API, which is off.
- The live hub has Cloudflare Web Analytics ([legal-readiness-2026-10-28.md](legal-readiness-2026-10-28.md)).
  I had no access to its numbers. **Weekly players per game are unknown.** This is the largest gap.

---

## 3. Case studies

Rule for this section: views, players, likes and "MRR" headlines are not sales. Where a number is an
estimate from review counts, it says so. Where a person reports their own revenue, it is a claim.

### 3.1 fly.pieter.com, Pieter Levels (2025)

| | |
|---|---|
| AI use | AI-written code (Cursor, Grok, Claude), built from a prompt in about three hours. No runtime AI. The site says "100% made with AI". |
| Game | Free browser MMO flight sim in Three.js. |
| Channel | His own site and his very large X audience. |
| What is sold | Mainly **in-game ad slots to startups** (planets, blimps, billboards). Small player purchases: an F-16 at 29.99 USD. Merch link today. |
| Numbers | Claim, late Feb 2025 (his X post): "9x F16's sold @ $29.99 = ~$270, 1x Ad Blimp sold @ $1000", 89,000 people had flown, 26,000 at peak ([X](https://x.com/levelsio/status/1895126942233350340)). Claim, Mar 2025: 67,000 USD then 87,000 USD "MRR" within 17 days, which he called 1M USD ARR, and he wrote that whether it was sustainable "we can only guess" (quoted in [Promptway, 24 Jun 2026](https://promptway.com/blog/pieter-levels-flight-sim-to-zero)). |
| Later | Secondary claim (Promptway, Jun 2026): his X bio lists the sim at "$0/m". I could not check the live bio. The site is still up on 30 Oct 2026 and still offers ads and the 29.99 USD F-16 ([fly.pieter.com](https://fly.pieter.com), fetched 30 Oct 2026). |
| Revenue type | Mostly **business ad/sponsorship revenue**, billed monthly, which is why it was called MRR. Not subscriptions from players. In the one split he posted, players paid about 270 USD of 1,270 USD. |
| Source quality | Self-reported on X, widely repeated. Not audited. Decline reported only by blogs. |
| Lesson | The buyers were businesses paying to reach Levels' audience. Player spending was small. This does not transfer to a hub without a large existing audience. It also faded when attention moved on. |

### 3.2 AI Dungeon, Latitude (2019 to now)

| | |
|---|---|
| AI use | **Runtime generative AI.** Every turn of the story is generated by a language model. |
| Game | Open-ended text adventure, web and mobile. |
| Channel | Own web app plus App Store and Google Play. |
| What is sold | Monthly memberships. Coordinator verified the current official [Memberships & Benefits](https://help.aidungeon.com/memberships-benefits) page on 30 Oct: Journey 14.99, Legend 29.99, Mythic 49.99 and Ultimate 99.99 USD/month. These buy model access, context/memory and credits. Listed prices do not reveal subscriber counts or revenue. |
| Numbers | Claim, May 2025, via a third-party leaderboard post: "$7M+ ARR, 8M users, profitable, <20 people" ([Henry Shi on X](https://x.com/henrythe9ths/status/1925515233113907464)). Third-party estimates disagree: Intelpilot 1.4 to 1.8M USD ARR, Dealroom "1 to 10M USD" ([Intelpilot](https://www.intelpilot.ai/company/latitude/6a028ebda6715bdc30963e7e), [Dealroom](https://dealroom.co/companies/latitude-1-1/)). |
| Costs and risk | Running costs "began to skyrocket" as it grew, per the founder ([CNBC, Mar 2023](https://www.cnbc.com/2023/03/13/chatgpt-and-generative-ai-are-booming-but-at-a-very-expensive-price.html/)). In 2021, content moderation changes caused a user revolt ([Utah Business](https://www.utahbusiness.com/latitude-games-ai-dungeon-was-changing-the-face-of-ai-generated-content-until-its-users-turned-against-it/)). Raised a 3.3M USD seed round. |
| Revenue type | Customer subscriptions. |
| Source quality | No audited numbers. Estimates range about 5x. |
| Lesson | Runtime AI can sell subscriptions when the AI *is* the product. It is a company with staff, funding, moderation and model bills. It is the opposite of a low-effort side business, and it is why Anything vs Anything needs its strict budget cap. |

### 3.3 HEXSTORM: Tears of Arcadia, Anton Chuev (Aug 2026)

| | |
|---|---|
| AI use | All code written with AI help. Art and design use not stated. |
| Game | Tactical tower defence for PC. |
| Channel | Steam, premium. |
| What is sold | The game: 11 USD at launch, cut to 9 USD after players called it overpriced. ChatGPT had suggested 14 USD. |
| Numbers | Claim (his own YouTube video, reported by [WN Hub, 17 Aug 2026](https://wnhub.io/news/Generative_AI/item-51792)): about 1,000 hours of work, 4,900 wishlists before launch, 250 copies on day one, 1,200 in week one, 11,100 USD gross for the week, later restated by Steam as 9,500 USD after the price change, "roughly 6,000 USD net". He hopes for about 25,000 USD in year one. |
| Problems | Anti-AI players dropped the rating to 55% "mixed" within hours. Steam review delayed launch five weeks. |
| Revenue type | Customer sales, gross vs net stated. |
| Source quality | Self-reported, one trade news write-up. Not audited. |
| Lesson | AI code can produce a sellable game, but it took 1,000 hours, wishlists and Steam's storefront. "Made with AI" brought backlash, not buyers. |

### 3.4 AI Roguelite, Max Loh / Immanitas (2022 to now)

| | |
|---|---|
| AI use | Runtime generative AI for story, items and enemies. |
| Game | Text and image roguelite RPG. |
| Channel | Steam, premium. |
| Numbers | Estimate, as of 30 Oct 2026: about 18,200 copies and 163,900 USD gross lifetime, 83% positive of 637 reviews, about 59 average daily players in Oct 2026 ([Raijin](https://raijin.gg/app/1889620/AI_Roguelite)). Another tracker: 17,680 copies and 96,470 USD gross, undated ([SteamData](https://steamdata.ai/game/1889620)). |
| Revenue type | Customer sales, gross before Steam's cut, refunds and taxes. |
| Source quality | Estimates from review counts. The two trackers differ by about 60,000 USD. |
| Lesson | A niche runtime-AI game can sell steadily over years in the five-figure to low six-figure USD range gross. It is one product, kept alive for years. |

### 3.5 Suck Up!, Proxima (2023 to now)

| | |
|---|---|
| AI use | Runtime AI: you talk to AI characters by voice to get into their homes. |
| Channel | First its own launcher (Steam initially refused it, per [Journal du Geek, Aug 2024](https://www.journaldugeek.com/2024/08/07/ce-jeu-est-le-plus-prometteur-de-lannee-mais-il-est-interdit-sur-steam/)), later Steam. |
| Numbers | Claim: over 100 million YouTube views with no marketing spend ([Naavik podcast](https://naavik.co/podcast/finding-success-with-ai-agents-and-content-creators/)). Estimate as of 30 Oct 2026: about 6,500 Steam copies, 66,700 USD gross, 59% positive of 287 reviews, peak 18 players in Oct 2026 ([Raijin](https://raijin.gg/app/2726370/Suck_Up)). Off-Steam sales are unknown. |
| Lesson | Views cannot establish purchases. The Steam estimate excludes off-Steam sales and covers a different period; it is not a measured views-to-sales conversion rate. |

### 3.6 Codex Mortis (Dec 2025)

| | |
|---|---|
| AI use | Marketed as the first game "100% made with AI" on Steam. |
| Numbers | Early access peak of 32 players at once, 60% positive on its first 10 reviews ([GameStar](https://www.gamestar.de/artikel/codex-mortis-erstes-100-ki-generierte-spiel-auf-steam,3444910,seite2.html)). Reception mixed to negative ([Xataka](https://www.xataka.com/videojuegos/primer-videojuego-hecho-integramente-ia-llega-a-steam-rechazo-jugadores-ha-sido-casi-unanime)). No sales estimate found. |
| Lesson | Lots of press about being AI-made, very few players. The AI label is a headline, not a reason to buy. |

### 3.7 The typical outcome: Vibe Jam 2025 entries

- The 2025 jam required free-to-play games with at least 80% AI-written code. It had 1,000+ entries
  ([official jam page](https://vibejam.com/2025/)) and paid prizes of 10,000, 5,000 and 2,500 USD
  ([Indie Hackers](https://www.indiehackers.com/post/Uz0wHG4pI3KBOiFhP5YR)). The prize money came from
  sponsors, mostly companies selling AI coding tools.
- By 24 Sep 2026, **42% of 1,083 entries were offline**. Half of the games on their own .com or .io domain
  were gone. Games on free static hosts survived far better, and games that needed a server died fastest
  ([Michael Scheiwiller, 30 Sep 2026](https://www.michaelscheiwiller.com/blog/vibe-jam-link-rot), using the
  jam's own status API).
- This search found no additional reliable entrant revenue reports beyond the named cases. This does
  not establish that nobody earned money. The study uses API flags rather than fresh gameplay checks
  of every entry. Link availability is not a measure of commercial failure.
- Lesson: durable, low-cost hosting reduces maintenance exposure. The static hub supports that.

### 3.8 The base rate: Steam census

- A full census of 53,597 Steam games (Jul 2023 to Jul 2026) by Sulka Haro, reported by
  [GamesRadar, 15 Jul 2026](https://www.gamesradar.com/games/steam-study-of-over-53-000-games-finds-60-90-percent-of-the-growth-in-monthly-releases-on-valves-store-is-from-games-using-ai-and-almost-none-of-them-make-money/):
  AI-flagged games were 30.8% of 2026 releases. In Q2 2026 they were 33% of releases but about 10% of
  estimated sales. Across all games, the top 1% earn about 94% of estimated revenue.
- Haro's own summary: almost none of them make money "because almost no games do".
- Revenue there is estimated from review counts. Treat it as a rough direction, not a number to plan with.

### 3.9 Not cases, but often confused with them

- **Infinite Craft** (Neal Agarwal, Jan 2024): viral runtime-AI web game, also on iOS and Android
  ([Wikipedia](https://en.wikipedia.org/wiki/Infinite_Craft)). I found no revenue figure. Popularity is known,
  income is not. Do not use it as proof of money.
- **AI game builders** (Rosebud, Bolt and similar) earn money by **selling subscriptions to people who make
  games**, for example Rosebud from about 15 USD a month per a third-party listing
  ([Pulse Signal](https://getpulsesignal.com/pricing/rosebud)). Their jam sponsorships and success stories are
  marketing for the tool. That is a different business from selling games to players.

### What the cases say together

| Pattern | Evidence |
|---|---|
| Money came from an existing audience or a big storefront | Levels (his X following), HEXSTORM and AI Roguelite (Steam wishlists and store) |
| Players paid little compared to sponsors | Levels: about 270 USD from players vs 1,000 USD from one sponsor in his posted split |
| Runtime AI can support paid access, with ongoing service costs | AI Dungeon, AI Roguelite, Suck Up! |
| Views cannot establish sales | Suck Up! views and Steam estimates cover different scopes/periods; off-Steam sales unknown |
| An AI-made pitch can attract backlash | HEXSTORM and Codex Mortis; causal effect on demand not isolated |
| Typical earnings are not established here | Link rot is not a sales measure; Steam is not a browser-game base rate |
| Peaks fade | fly.pieter.com reportedly at 0 USD per month a year later |

**Survivor bias warning:** every named success above was found because it was loud. The hundreds of silent
games are the real comparison group for a new hub.

---

## 4. Are cosmetics the right first product here?

**Recommendation: yes as a small, cheap test that respects the "everything free" promise. No as a plan for
real income until player numbers are known.**

For cosmetics:

- They keep all gameplay free. No pay-to-win. Easy to explain.
- Art is cheap to make with agents. Pigeon hats can show up in shared clips from its built-in recorder,
  which gives a real reason to want a look.
- Ritkaos+ follows the host-buys model: one owner unlocks extras for the whole room. Jackbox uses the same
  idea: "Only one person in your group needs to own a Jackbox product" ([Jackbox](https://www.jackboxgames.com/how-to-play)).

Against cosmetics:

- People buy looks mostly when others see them and when they play for a long time. Pigeon and Karts are
  mostly short sessions, and their online play is off. In single-player, a hat is mostly seen by the buyer.
- Ritkaos, the social game where extras matter most, is not live.
- The fixed cost is the delivery system: verified webhooks, an order record, code recovery, refunds and a
  test journey. That work is the same for 2 buyers or 200.
- Traffic data was not accessed in this review. With low traffic, revenue may not pay for support time.

**What would make it a better business (recommendations, need decisions):**

1. Get Ritkaos online again first, so Ritkaos+ has a live game. Without it, the bundle is two cosmetic
   packs for single-player games.
2. Make retention features before more cosmetics: daily quests (Pigeon has them), a daily drawing in
   Ritkaos (already proposed on 22 Oct), weekly ghost races in Karts. People who return are the ones who buy.
3. A pay-what-you-want version of a concrete digital pack could be explored later
   ([docs](https://docs.lemonsqueezy.com/help/products/pay-what-you-want)). Do not assume this permits a
   donation button or removes delivery duties. Check
   [product eligibility](https://docs.lemonsqueezy.com/help/getting-started/prohibited-products).
   **Different offer, unapproved and not needed for launch.**

---

## 5. Prices and money

### 5.1 Lemon Squeezy fees (fact, official docs, checked 30 Oct 2026)

From [Fees](https://docs.lemonsqueezy.com/help/getting-started/fees), [Sales tax and VAT](https://docs.lemonsqueezy.com/help/payments/sales-tax-vat),
[Currencies](https://docs.lemonsqueezy.com/help/payments/currencies), [Refunds](https://docs.lemonsqueezy.com/help/payments/refunds-chargebacks)
and [Pricing](https://www.lemonsqueezy.com/pricing):

- Platform fee **5% + 0.50 USD** per order, calculated on the **total including tax**.
- Add **1.5%** for payments outside the US (so every Swedish buyer), **1.5%** for PayPal, **0.5%** for subscriptions.
- Lemon Squeezy is merchant of record. It charges and pays EU VAT and deducts it from payouts.
- Tax-inclusive pricing exists as a store setting. Then "29 kr" means the buyer pays 29 kr in total.
- Shown in SEK, but **customers are charged in USD** at mid-market rate. A Swedish buyer's bank may add a
  currency fee, and the statement amount can differ slightly. Support copy must explain this.
- Payouts: free to US banks, **1% per payout** to non-US banks via Stripe; PayPal payouts outside the US 3%, max 30 USD.
- Extra 5% on sales recovered by abandoned-cart emails, 3% for affiliate referrals. Do not turn these on.
- Refunds: the refunded amount minus the platform fee comes off the next payout, so **the fee is lost on a
  refund**. Lemon Squeezy may refund within 60 days to prevent chargebacks. A chargeback adds a **15 USD fee**.
- Lemon Squeezy asks sellers of products **under 10 USD** to contact sales for custom pricing.

**Platform risk (fact):** Stripe owns Lemon Squeezy. Its CEO wrote on 28 Jan 2026 that the team is building
Stripe Managed Payments and that "our goal is to provide Lemon Squeezy users an easy way to migrate"
([Lemon Squeezy blog](https://www.lemonsqueezy.com/blog/2026-update)). No shutdown date was given.
**Recommendation:** keep the order record and entitlements in our own system keyed to order IDs, so a later
move to another provider does not lose buyers' access.

### 5.2 What Ludvig keeps per sale (illustrative)

Assumptions: buyer in Sweden, card payment, tax-inclusive price, Swedish VAT 25%
([Skatteverket VAT rates](https://www.skatteverket.se/foretag/moms/saljavarorochtjanster/momssatserochundantagfranmoms.4.58d555751259e4d66168000409.html)),
fee 6.5% of total + 0.50 USD, payout fee 1%. FX: **1 USD = 9.8264 SEK**, the ECB reference rate for
30 Oct 2026 via [Frankfurter](https://api.frankfurter.dev/v1/latest?base=USD&symbols=SEK). Real rates move,
buyers abroad pay their own VAT, and PayPal costs about 0.3 to 1.5 kr more per order.

| Price (incl. VAT) | VAT | LS fee | Kept after payout fee | Kept as % of price |
|---:|---:|---:|---:|---:|
| 19 kr | 3.80 | 6.15 | 8.96 kr | 47% |
| 29 kr | 5.80 | 6.80 | 16.24 kr | 56% |
| 39 kr | 7.80 | 7.45 | 23.51 kr | 60% |
| 49 kr | 9.80 | 8.10 | 30.79 kr | 63% |
| 59 kr | 11.80 | 8.75 | 38.07 kr | 65% |
| 79 kr | 15.80 | 10.05 | 52.62 kr | 67% |
| 99 kr | 19.80 | 11.35 | 67.17 kr | 68% |
| 129 kr | 25.80 | 13.30 | 89.00 kr | 69% |

Formula: `(price / 1.25 - 0.065 * price - 0.50 * 9.8264) * 0.99`.
The coordinator rechecked FX through the dated API and recalculated this table. Actual settlement and
product tax treatment must be checked; this is not a quote or accounting advice.

"Kept" is **revenue before income tax and before costs**, not profit. A refunded 29 kr sale loses about
6.80 kr in fees plus support time. One chargeback (about 147 kr) wipes out about nine 29 kr sales.

### 5.3 Recommended launch prices (needs Ludvig's decision)

| Product | Recommended | Candidate in source | Why |
|---|---:|---:|---|
| Ritkaos+ (all current Ritkaos extras) | **59 kr** | 79 kr | Host buys for the whole room. Under 60 kr feels like an impulse buy for a party night. Fee share stays under 20% of the pre-VAT price. |
| Pigeon style pack | **39 kr** | none | Lowest price where the fixed fee stays under about a quarter of the pre-VAT price. |
| Karts style pack | **39 kr** | none | Same as Pigeon. |
| Bundle of all three | **99 kr** | none | Saves 38 kr vs buying separately. Under 100 kr. Best margin per order. |

Higher alternative if Ludvig prefers: 79 / 49 / 49 / 129 kr. I recommend the lower set for the first test,
as a bounded price hypothesis. There is no demand evidence showing it will generate more orders.
Evaluate contribution per eligible visitor as well as order count.

**Single 19 to 29 kr extras: recommend not selling them at launch.** Under the example assumptions,
VAT and fees consume about 53% of a 19 kr price and 44% of a 29 kr price. Both have positive contribution
before other costs, not an automatic loss. Nine more products mean more mappings to test and more choice for
a buyer who may buy nothing. Keep the code support in the source, but do not offer them.

### 5.4 Bounded contents (recommendation for the decision)

- Each product page and receipt lists the **exact items by name**, fixed at launch, for example
  "Pigeon style pack: 8 hats and 4 feather looks". Suggested size: 8 to 12 items per style pack.
- Ritkaos+ = the nine extras that exist today (five word packs, three modes, brushes/palettes).
  Avatars are not an existing paid entitlement in the reviewed client.
- Bundle = those three packs as listed on the day of purchase. Wording: "includes the items listed here".
  No "all future packs", no "lifetime updates", no "forever". Only promise access actually verified at launch.
- Optional later: if new items are added for free to an existing pack, that is a gift, not a promise.

### 5.5 Scenarios (assumptions, not forecasts)

Inputs are invented to show scale. Average kept per order is about **45 kr**, assuming 30% buy one 39 kr
pack, 30% buy Ritkaos+ at 59 kr and 40% buy the 99 kr bundle.

| Hypothetical eligible distinct players in a month | Buyers that month, 0.2% | 0.5% | 1% |
|---:|---:|---:|---:|
| 1,000 | 2 orders, ~90 kr | 5 orders, ~230 kr | 10 orders, ~450 kr |
| 10,000 | 20 orders, ~910 kr | 50 orders, ~2,270 kr | 100 orders, ~4,540 kr |
| 50,000 | 100 orders, ~4,540 kr | 250 orders, ~11,350 kr | 500 orders, ~22,700 kr |

Eligible means people who do not already own the offered pack or bundle. These one-time purchases
cannot repeat for the same owned items every month. Sustained income needs new eligible players or
separately approved new value. Visits and page views are not distinct players.

Why these conversion rates: industry rules of thumb for free-to-play games are about 2 to 4% of engaged
players paying ([Konvoy](https://www.konvoy.vc/newsletters/freemium-conversion-2-4-in-gaming),
[Gamesbrief](https://www.gamesbrief.com/tag/benchmarks/)). Those are installed games with accounts. A free
browser hub with anonymous visitors, short sessions and only cosmetic items should expect much lower. I found
no trustworthy public number for small web games, so the table uses 0.2 to 1%.

**What must be measured to replace these assumptions:**

1. Weekly page views/visits by game path where available, after checking beacon coverage. Cloudflare
   defines visits via referrers; these are not unique players or 7-day returning-player cohorts.
   Retention would need an approved measurement design or a portal's supplied metrics.
   [Official definitions](https://developers.cloudflare.com/web-analytics/data-metrics/high-level-metrics/).
2. Visits to the extras page per week (a page view is enough, no new tool).
3. Checkout opens vs completed orders (Lemon Squeezy dashboard).
4. Orders per product, refunds, chargebacks, support messages and minutes spent.
5. Where buyers came from (referrer: TikTok, Reddit, portal, direct).

### 5.6 Tax (no tax advice)

- Lemon Squeezy handles VAT toward buyers as merchant of record.
- Ludvig's own income tax is separate. Skatteverket says hobby surplus is taxed as income from employment
  and that egenavgifter also apply ([Skatteverket, Hobby](https://www.skatteverket.se/privat/skatter/arbeteochinkomst/inkomster/hobby.4.58d555751259e4d661680003940.html), page read via search summary; direct fetch was blocked).
  Whether this is hobby or business, and how Ludvig's own sale to Lemon Squeezy is treated for VAT, is
  **for Skatteverket or an accountant to confirm**. The 22 Oct plan already lists "enskild firma with F-skatt"
  as an open owner decision.
- Lemon Squeezy may ask for a W-8 tax form ([purchase-release checklist](purchase-release-2026-10-30.md)).

---

## 6. Free vs paid rules (recommendation)

1. Everything free today stays free. No game, mode, word, level or item moves behind payment.
2. Paid items never change winning: no speed, stats, extra lives, hints or ranking advantage.
3. No loot boxes, random items, timers, energy or "only 2 hours left" pressure.
4. One purchase, no subscription, no account needed.
5. A purchase covers the items listed on the receipt. No "lifetime" or "all future content" promises.
6. Full refund within 14 days as published. Because codes cannot be revoked, do not promise to remove
   access after a refund.
7. Codes can be recovered from the receipt email, and later from an order lookup. Losing a browser must
   not mean losing a purchase.
8. Clear text before paying: what you get, for which game, and that the card is charged in USD.

**Support load (unvalidated planning assumption, not a benchmark):** about 1 message per 20 to 50 orders
(lost code, currency question, refund). Agents draft every reply. Ludvig approves anything about money.

---

## 7. Marketing and validation plan

### 7.1 Channels compared

| Option | What you get | Cost and risk | Fit now |
|---|---|---|---|
| **Direct small purchases (approved path)** | Keeps 60 to 68% of price, own buyers | Fixed build and support work. Needs your own traffic. | Yes, as a test |
| **Game portals** (CrazyGames, Poki) | Their audience and free player data | CrazyGames: ad revenue share is the main income, its SDK is required for money, in-game purchases are invite-only through Xsolla ([CrazyGames docs](https://docs.crazygames.com/requirements/intro/), [IAP](https://docs.crazygames.com/sdk/in-game-purchases/)). A "Basic Launch" needs no SDK and gives players, playtime and retention data ([FAQ](https://docs.crazygames.com/faq/)). Non-exclusive. Poki claims 1B+ plays a month and offers free playtesting ([Poki](https://developers.poki.com/)). Ads may not fit the calm style. Owner must accept their terms. | **Best next test for learning**, no money needed |
| **Sponsorship / in-game ads** (Levels style) | Businesses pay for reach | Needs a big audience to sell to | Not now |
| **Steam premium** for one best game | A real store with paying buyers | 100 USD fee per game ([Steam Direct](https://partner.steamgames.com/steamdirect)), AI disclosure, possible review attacks, months of polish | Later, maybe one game |
| **Runtime AI** (Anything vs Anything) | Unique clips | Costs per play. Held. | Stays paused |

**Audience dependency:** without Levels' following, sponsorship is out. Direct sales depend on getting people
to the hub. Portals rent you their audience. The plan below uses clips plus one portal test to get players,
then measures.

### 7.2 Focus the 52-game catalog

- Keep all 52 games free and online. Static files cost nothing.
- Pick **3 to 5 focus games** using available traffic and gameplay checks; returning-player cohorts
  are unknown. Pigeon, Karts and
  Ritkaos are focus games because of the paid lineup. Fill the rest from data (the TikTok plan already
  names FLAP, No Brakes and Just One More Prompt as clip candidates, see `tiktok/README.md`).
- Stop adding new games while the test runs, unless a new game is clearly a retention feature for a
  focus game. More games spread clips, polish and support thinner.
- Why players return: a daily reason (quest, daily drawing, weekly race), friends (rooms), and progress.
  Cosmetics only help after these exist.

### 7.3 30 / 60 / 90 days (proposal; posting and spending need separate authorization)

Dates and numeric gates below are planning heuristics, not validated benchmarks. Low sales without
enough qualified exposure cannot distinguish weak demand from weak distribution. As a proposed first
purchase test, aim for at least 1,000 relevant extras-page views and still report uncertainty; these
are not necessarily independent people. Do not stop a product solely because 30 days passed.
No monitoring, scheduler or publishing automation is active.

**Days 1 to 30: measure and prepare. No public sales.**

- Agent: inspect existing authorized read-only analytics access before asking Ludvig for an export or
  token. Pull 30 days of page views/visits by path where available, verify beacon coverage and state
  metric limits. Do not infer distinct players or 7-day retention from this data.
- Agent: design 8 to 12 items for each style pack. Ludvig picks.
- Implementer: build test-mode payment delivery, order record and code recovery per the purchase-release checklist.
- Agent: prepare a clip batch for focus games: 12 vertical clips (Pigeon recorder, Karts drifts, Ritkaos
  rounds once live), captions, hashtags and an honest AI-generated-content label.
- Agent: prepare one portal submission package (CrazyGames Basic Launch) for one or two focus games.
- Ludvig: approve pack contents and prices, verify the Free Cloudflare email, approve or decline the portal test.
- **Gate at day 30:** if the three paid-lineup games together have fewer than about 250 weekly page views,
  delay launch work beyond the test build and spend the next month on getting players (clips, portal).

**Days 31 to 60: soft launch of extras (only after the test journey passes).**

- Turn on live checkout for the four products. Add an extras page linked from the three games.
- Post the clip batch, 3 clips a week, if Ludvig approves posting (see 8.2).
- Agent writes a weekly one-page report: visits/page views with limits, extras page views, orders, refunds, support time,
  clip referrals.
- **Gate at day 60:** continue if there are 10 or more paid orders in 30 days, refunds under 10%, and
  support under 1 hour a week. Stop new cosmetic work if there are fewer than 5 orders; leave the store
  up as it is, no more effort.

**Days 61 to 90: double down or stop.**

- If a clip angle brings at least about 100 hub visits per clip (median over 4 weeks), make more of that
  angle. If not, switch game or angle.
- If the portal test shows good retention for a game, make that game the hero: its own retention feature,
  better first minute, more clips.
- Optional ad test, only with explicit owner approval: max 300 to 500 kr total, one clip, one country,
  measuring cost per hub visit. Recommend 0 kr until organic clips show a winner.
- **Gate at day 90:** write a one-page decision for Ludvig: continue, change product, or stop.

No result here is promised. Autoposting does not create demand by itself, and cosmetic demand is unproven
for these games.

---

## 8. Running it with almost no owner time

### 8.1 Who does what

| Work | Agents | Ludvig |
|---|---|---|
| Research, game ideas, competitor checks | Yes | Reads 1-page summary |
| Building, testing, fixing games and packs | Yes | Approves visible product changes |
| Payment delivery, tests, recovery tools | Yes (implementer) | Owner acceptance test in test mode |
| Prices, pack contents, free/paid rules | Drafts options | **Decides** |
| Clips, captions, screenshots, store copy | Yes, prepared as drafts | Approves the batch |
| Posting under Ludvig's name | Only with a written, bounded authorization | Posts or authorizes |
| Analytics and weekly report | Yes | Reads 5-minute report |
| Customer support | Drafts replies | Approves anything about money, refunds or law |
| Refunds and chargebacks | Prepares the case | **Decides and clicks** |
| Accounts, identity, payout, tax forms | Never | **Owner only** |
| Spending (ads, tools, Steam fee) | Proposes | **Decides** |
| Platform terms (portals, Steam) | Summarizes | **Accepts** |

### 8.2 Publishing: current vs future

- **Current authorization:** none for posting, ads, scraping or contacting anyone. This report is strategy only.
- **Possible future authorization** (Ludvig would need to write it down): for example "agents may schedule up to
  3 approved clips a week on TikTok from the approved batch, no replies to comments, no paid boosts,
  stop on any warning". Use the platform's own free scheduler if it has one. Agents must check current
  scheduler features first.
- **Keep owner control unless explicitly and safely delegated:** replies as Ludvig in public,
  refund decisions, account or payout changes,
  accepting terms, legal statements, spending, AI-use claims that are not checked against how the game was made,
  and anything after a platform warning.

### 8.3 Weekly batch (about 20 to 30 minutes)

1. Read the one-page weekly report.
2. Approve or reject the clip batch for next week.
3. Approve support drafts that involve money.
4. Answer at most one product question, asked in plain words.

### 8.4 Tools

No new paid tools. Already available and enough: Cloudflare Web Analytics (live), Lemon Squeezy dashboard
and order export, the Pigeon clip recorder, the existing `tiktok/` plan and videos, local agents. For
analytics access, the agent checks existing authorized read-only access first. Ask Ludvig for an export
or scoped token only if unavailable. Use a private secret-entry tool, never chat, for tokens.

---

## 9. Risks and next actions

### 9.1 Challenging "passive income from many AI games"

- Many games do not guarantee revenue. On Steam, the top 1% take about 94% of estimated revenue in one
  analysis. This is not a measured base rate for this browser-game hub.
- Attention fades. fly.pieter.com went from a reported 1M USD run rate to reportedly zero within about a year.
- "Passive" is not true for payments. Orders bring support, refunds, chargebacks and platform changes
  (Lemon Squeezy moving toward Stripe Managed Payments).
- AI makes building cheap for everyone, so supply explodes (Steam's AI share of releases went from 11% to
  31% in two years) and attention gets more expensive.
- What does compound: a few games people return to, a channel that brings players (clips or a portal),
  and measured decisions.

### 9.2 Risks

| Risk | What to do |
|---|---|
| Ritkaos stays offline, bundle loses its main part | Get Free account verified; do not sell Ritkaos+ until rooms work live |
| Low traffic, revenue below effort | Day-30 traffic gate; portal test |
| Shared codes, no revocation | Accept for cosmetics; keep honest refund wording |
| Cosmetic unlocks in static games can be bypassed in the browser | Accept for low-price cosmetics; do not build costly protection |
| Lemon Squeezy platform change | Own order record, portable entitlements |
| Rights of AI-made assets | Keep the legal-readiness checks; AI generation is not rights clearance |
| Anti-AI backlash | Be honest about AI use; do not lead marketing with "made with AI" |
| Surprise server bills | Free account only; payment webhook within Free limits |

### 9.3 Next actions

| # | Action | Owner |
|---|---|---|
| 1 | Decide prices (59 / 39 / 39 / 99 kr recommended) and whether to drop single 19 to 29 kr extras | **Ludvig** |
| 2 | Verify the Free Cloudflare account email so Ritkaos can come back | **Ludvig** |
| 3 | Inspect existing read-only analytics access; ask for export/token only if unavailable | Agent first |
| 4 | Report page views/visits by path and limits; retention remains unknown | Agent |
| 5 | Propose 8 to 12 items each for Pigeon and Karts packs | Agent, Ludvig picks |
| 6 | Build test-mode payment delivery, order record, recovery | Implementer |
| 7 | Decide whether to try one free CrazyGames Basic Launch | **Ludvig** |
| 8 | Prepare first 12-clip batch as drafts | Agent |

---

## 10. Evidence gaps

- Actual players/engagement per game: unknown. Page views help triage but are not proof of play.
- Real purchase rates for cosmetics in small free web games: no trustworthy public data found.
- fly.pieter.com current revenue: only a blog claim of "$0/m"; his X bio not checked directly.
- AI Dungeon revenue: claims and estimates differ about fivefold; no audited number.
- Steam sales numbers are estimates from review counts.
- CrazyGames revenue-share percentages are not in its public docs.
- Ludvig's tax and VAT treatment: not assessed.

---

## Source and verification ledger

| Claim | Source | Type | Checked how |
|---|---|---|---|
| LS fee 5% + 0.50 USD, +1.5% intl, +1.5% PayPal, +0.5% subs, payout fees | [LS Fees](https://docs.lemonsqueezy.com/help/getting-started/fees) | Official | Fetched 30 Oct 2026 |
| Fee on total incl. tax; tax-inclusive option; LS remits VAT | [LS VAT](https://docs.lemonsqueezy.com/help/payments/sales-tax-vat) | Official | Fetched |
| Charged in USD, 130 currencies incl. SEK | [LS Currencies](https://docs.lemonsqueezy.com/help/payments/currencies) | Official | Fetched |
| Refund fee kept; 60-day refunds; 15 USD chargeback | [LS Refunds](https://docs.lemonsqueezy.com/help/payments/refunds-chargebacks) | Official | Fetched |
| Pay what you want with min/suggested | [LS PWYW](https://docs.lemonsqueezy.com/help/products/pay-what-you-want) | Official | Fetched |
| Migration goal to Stripe Managed Payments (28 Jan 2026) | [LS blog](https://www.lemonsqueezy.com/blog/2026-update) | Official | Fetched |
| 1 USD = 9.8264 SEK on 30 Oct 2026 | [Frankfurter (ECB data)](https://api.frankfurter.dev/v1/latest?base=USD&symbols=SEK) | Official data via API | Fetched; ECB site itself failed TLS in sandbox |
| Swedish VAT 25% standard | [Skatteverket](https://www.skatteverket.se/foretag/moms/saljavarorochtjanster/momssatserochundantagfranmoms.4.58d555751259e4d66168000409.html) | Official | Search summary |
| Hobby surplus taxed as employment income plus egenavgifter | [Skatteverket Hobby](https://www.skatteverket.se/privat/skatter/arbeteochinkomst/inkomster/hobby.4.58d555751259e4d661680003940.html) | Official | Search summary; fetch blocked |
| Levels: ~270 USD F-16s + 1,000 USD blimp; 89k players | [X post](https://x.com/levelsio/status/1895126942233350340) | Self-reported | Search result text |
| Levels: 87k USD MRR, sustainability caveat; later "$0/m" | [Promptway](https://promptway.com/blog/pieter-levels-flight-sim-to-zero) | Secondary blog | Fetched |
| fly.pieter.com still sells ads and F-16 | [fly.pieter.com](https://fly.pieter.com) | Primary site | Fetched |
| AI Dungeon "$7M+ ARR, profitable" | [Henry Shi on X](https://x.com/henrythe9ths/status/1925515233113907464) | Third-party claim | Search result text |
| AI Dungeon prices | [Memberships & Benefits](https://help.aidungeon.com/memberships-benefits) | Current official help | Fetched by coordinator |
| AI Dungeon cost pressure | [CNBC 2023](https://www.cnbc.com/2023/03/13/chatgpt-and-generative-ai-are-booming-but-at-a-very-expensive-price.html/) | Press | Search summary |
| HEXSTORM week-one numbers | [WN Hub](https://wnhub.io/news/Generative_AI/item-51792) | Trade press of self-report | Fetched |
| AI Roguelite estimates | [Raijin](https://raijin.gg/app/1889620/AI_Roguelite), [SteamData](https://steamdata.ai/game/1889620) | Estimates | Raijin fetched |
| Suck Up! estimates, views claim | [Raijin](https://raijin.gg/app/2726370/Suck_Up), [Naavik](https://naavik.co/podcast/finding-success-with-ai-agents-and-content-creators/) | Estimate / claim | Raijin fetched |
| Codex Mortis reception | [GameStar](https://www.gamestar.de/artikel/codex-mortis-erstes-100-ki-generierte-spiel-auf-steam,3444910,seite2.html) | Press | Search summary |
| Vibe Jam 42% offline | [Scheiwiller](https://www.michaelscheiwiller.com/blog/vibe-jam-link-rot) | Independent analysis of jam API | Fetched |
| Vibe Jam rules and prizes | [vibejam.com/2025](https://vibejam.com/2025/), [Indie Hackers](https://www.indiehackers.com/post/Uz0wHG4pI3KBOiFhP5YR) | Official / community | Search summary |
| Steam census, top 1% ≈ 94% | [GamesRadar](https://www.gamesradar.com/games/steam-study-of-over-53-000-games-finds-60-90-percent-of-the-growth-in-monthly-releases-on-valves-store-is-from-games-using-ai-and-almost-none-of-them-make-money/) | Press of independent census | Fetched |
| CrazyGames monetization rules | [CrazyGames docs](https://docs.crazygames.com/requirements/intro/), [IAP](https://docs.crazygames.com/sdk/in-game-purchases/), [FAQ](https://docs.crazygames.com/faq/) | Official | Fetched |
| Poki reach claim, playtesting | [Poki for Developers](https://developers.poki.com/) | Official, self-reported | Fetched |
| Steam Direct 100 USD per product | [Steamworks](https://partner.steamgames.com/steamdirect) | Official | Fetched |
| Jackbox host-buys model | [Jackbox](https://www.jackboxgames.com/how-to-play) | Official | Search summary |
| F2P payer rate 2 to 4% | [Konvoy](https://www.konvoy.vc/newsletters/freemium-conversion-2-4-in-gaming), [Gamesbrief](https://www.gamesbrief.com/tag/benchmarks/) | Industry blogs | Search summary |
| Ritkaos products and prices in source | `ritkaos/lib/store.mjs` | Repo | Read 30 Oct 2026 |

Method: web searches and read-only page fetches on 30 Oct 2026, plus reading repo docs and source. No
accounts, dashboards, analytics, payments, browsers, servers, tests or builds were used.

## Coordinator acceptance notes

Checked official provider fee/VAT/currency and Cloudflare metric definitions; recalculated the complete
unit-economics table using the dated FX response. Corrected fee-share prose, unsupported negative
generalizations, retention assumptions, paid-avatar scope and one-time-purchase scenario limits.
HEXSTORM figures remain creator claims reported by trade press; Levels' exact current revenue remains
unverified. AI Dungeon prices are now verified in official help; its revenue remains unverified.
The 59/39/39/99 SEK set is a proposal, not approved pricing or proven willingness to pay.
Research complete; no app changes or automation activated. No disposable build/dependency data created.
