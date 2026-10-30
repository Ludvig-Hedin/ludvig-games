# Karts style pack

Implementation in `source-games/citrus-circuit-coastline/index.html`, local and unshipped.
Coordinator check, 31 October: the actual purchased test-bundle key restored ownership, Checker panels
applied, and a race started. The 390px dialog had no horizontal overflow. Automatic reload recovery was
interrupted by server shutdown; no pass claimed. [Local app preview](previews/karts-style-pack-local.png).
Approved product: one-time 39 SEK style pack. Checkout and licence verification belong to the shared
store client/backend, not to this game file.

## Contents

Four additional plain colours:

- Midnight, dark teal `#203b3f`
- Sunshine, yellow `#f2d45b`
- Ice blue `#b6dfed`
- Cherry, deep red `#9f354e`

Two additional paint designs:

- Racing stripes, cream stripes on a blue kart
- Checker panels, dark/cream checkers on an ivory kart

The stripe/checker meshes attach to the actual kart's sidepods. These affect rendering only.
The four existing free colours remain unchanged. No simulation, speed, handling or item changes.

## Purchase/selection integration

The main menu has a More kart styles button next to its existing colour controls. It opens a native
dialog with a labelled paint preview. Previewing a locked style does not apply it to the real kart.
Owners can apply a style; nonowners open the common purchase/code sheet through Get pack · 39 kr.
Use free colours restores the last free colour. Native dialog focus containment and Escape work
without the game's racing/menu keyboard shortcuts firing behind it.

Requires `/assets/store-client.js` providing `window.LudvigStore.owns('karts')`, `.open('karts')`, and
`.subscribe(callback)`. Also listens for `ludvig:store`. Missing/unavailable client means no entitlement;
free play and free colours still run. Restored licence ownership re-applies a saved pack preference.
Revoked/lost ownership restores the last free colour and hides the paid paint meshes, including mid-race.

Choice persists in the existing local settings record. Licence verification remains solely the shared
client/backend's job. The static client is not DRM. Paid paint is local to the owning player's rendered
kart; this change does not add peer-to-peer paint-design replication or guarantee remote players see it.

## Verification owner: primary agent

No test, server or browser was run by the builder, under the task's serialized verification rule.

Focused journey to check:

1. No store client/failed backend: start and complete a free race; all four old colours work.
2. Open styles with keyboard and touch. Each of six previews changes; locked Use does not appear.
   Escape and close restore focus. Enter/Space in the dialog must not start a race.
3. Redeem a real provider test key through the shared sheet. Reopen styles, apply each colour/design,
   inspect the real kart in the menu and race. Check colour plus sidepod stripes/checker details.
4. Pick a free colour, then a paid design; refresh. Once the saved licence validates, the selected
   style should restore. Clearing licence/losing ownership restores that free colour, not a paid one.
5. Invalidate ownership during a race: appearance falls back without resetting race position/timing.
6. Check 390 px portrait and short landscape menu layout. More kart styles must not cover Start race.
   Dialog must scroll without horizontal overflow. Check actual paint visibility at chase-camera distance.

The parent owns final browser/layout verification and sensitive payment-flow review. No generated
images, packages, servers, build output or dependency folders were created by this builder.
