# Pigeon style pack

Implementation in `source-games/pigeon/index.html`, prepared locally for the approved 39 SEK pack.
Coordinator check, 31 October: the purchased test-bundle key restored ownership in the actual local
browser. Crown/Midnight applied and saved. The 390px dialog had no horizontal overflow. Shared-client
automatic reload recovery was interrupted by server shutdown, so that part remains unverified.
Nothing is deployed. [Local app preview](previews/pigeon-style-pack-local.png).

## Included items

- Four hats: Sun hat, Beanie, Crown, Top hat.
- Four feather looks: Snow, Cinnamon, Midnight, Mint.
- Original feathers and the original no-hat choice remain free. Existing online party hats/scarves
  remain free; when an owner selects a new hat it replaces the party hat locally, without changing it
  for other players. No gameplay values change.

The feather button in the existing toolbar opens Bird style. Every look can be previewed using the
actual procedural game model. An unowned paid choice cannot be applied; Buy or restore opens the shared
store sheet. All new hat/feather geometry appears in the main game canvas and is included by existing
screenshot and clip capture. This does not implement paid-style replication to remote peers.

## Shared-client contract

`/assets/store-client.js` defines `window.LudvigStore`:

- `owns('pigeon')` returns true only for currently accepted ownership.
- `open('pigeon')` opens shared purchase/code recovery UI.
- `subscribe(callback)` notifies ownership changes.

The page also responds to `ludvig:store` and load for late initialization. Missing/failed client leaves
free play working and the original bird unchanged. The saved style is separate from ownership and
does not grant access. Choices are restored only when `owns('pigeon') === true`, and ownership loss
restores original feathers/no paid hat.

## Focused verification for coordinator

No tests, browser, build or server was run by the builder, as instructed. Check:

1. Missing store client: solo starts, Bird style opens, original applies, paid choices preview only.
2. Verified Pigeon or bundle license: all four hats and feather looks apply, survive reload after
   ownership revalidation, and appear in screenshot/video output.
3. Invalid/lost ownership: stored paid choice does not apply; existing free party gear is restored.
4. At 390 px and short landscape layouts: modal scrolls, all choices and action buttons are reachable.
5. Keyboard: Tab stays in the native modal, Escape closes it, focus returns to the toolbar, movement
   does not run while selecting styles. Opening from play pauses locally and closing resumes.
6. Online: free party hat remains default, paid local hat doesn't overlap it, remote peers' rendering
   is unchanged. Leaving/rejoining must not retain a hidden free hat after ownership loss.

No generated assets/dependencies were created. Only the game source and this note were edited.
