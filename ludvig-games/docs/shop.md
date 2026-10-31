# Shared shop

Prepared in real app source, not published. The owner approved a shared shop plus purchase controls
inside the matching games on 31 October 2026. Existing free play remains free.

`build.py` generates `/shop/` using the approved four offers from `commerce/live-products.plan.json`:
Ritkaos+ 59 SEK, Pigeon 39 SEK, Karts 39 SEK and all three 99 SEK. It emits no provider checkout URLs
or product identifiers into the static shop page. Existing gameplay previews identify the three games;
they are not advertised as previews of the paid cosmetic choices. The bundle promises only the named
three packs. The page includes free-play links, receipt recovery, refunds and a restore action.

The Shop masthead link carries `data-store-link` for the Mac shell to retain it. Navigation can wrap
to accommodate the extra approved link on small screens. Existing navigation labels and footer remain.
The new page is included in the sitemap and its JavaScript is included in the explicit asset build.

`assets/shop.js` subscribes to the existing shared `LudvigStore`, opens the exact matching pack, and
uses the same receipt-key restoration dialog as the games. Purchase/restore controls stay disabled
until the service is configured. Test mode stays visible, and owned packs open View purchase instead
of inviting another purchase. A missing client does not create fallback checkout links.

Coordinator checks to perform:

- Guarded build and `commerce/tests/shop.test.mjs`.
- Local browser at desktop and 390px: four offers, prices/content, gameplay images and no overflow.
- From the homepage, Shop opens `/shop/`; each pack opens the matching shared dialog.
- Restore opens code entry; restored ownership updates the relevant pack and all-owned bundle state.
- Missing/unconfigured API leaves purchase controls unavailable; free links still work.
- Mac app retains the Shop link and uses the desktop purchase integration.

No tests, build, browser, dependency installation, publication or provider write was performed by
the builder. The coordinator owns guarded verification and sensitive release acceptance. No disposable
server or dependency copy was created.

Coordinator checkpoint: source review accepted the shop adapter and navigation. Python builder
syntax and diff whitespace checks passed. The guarded build, focused shop tests and actual desktop/
390px browser journey remain blocked by the occupied focused lane/RAM admission, so no browser or
test pass is claimed. The static-only publisher now admits the single new `shop` route, with its
helper hash repinned and source-reviewed. It still cannot publish Worker code or activate backends.
