# Ludvig Games for Mac

A Mac app with every game from games.ludvighedin.com plus the separate game sites (Chess, Ludo, Air Hockey and the rest). Everything runs on the Mac, so it works offline and costs nothing to run. People on the same Wi‑Fi can play together:

- **Phones and other computers** scan the QR code under **Play together** (or open the link). They play in their browser; nothing to install.
- **Other Macs with the app** show up under **Macs nearby** in the same panel. **Join** opens that Mac's games.

Owner decisions (24 Oct 2026): both ways of joining, Mac first, distributed to anyone. Unsigned for now, prepared for Developer ID signing and notarization.

## How it works

- `runtime/server.mjs` starts one [Miniflare](https://developers.cloudflare.com/workers/testing/miniflare/) (the local Cloudflare Workers runtime) with every game's own, unchanged Worker: rooms (Durable Objects), D1 tables and rate limits behave as on Cloudflare. Ritkaos runs as its own Node server.
- One proxy per game listens on the network at a fixed port (`runtime/games.mjs`: hub 47800, games 47801–47813). It serves the game's static files itself (`runtime/static.mjs`, Cloudflare's `auto-trailing-slash` and `404-page` rules) and sends only `/api/*` (and the hub's `/mp/*`) to the Worker. Miniflare can only hold one asset folder per instance, which is why the files are not served through it.
- A small router Worker (`runtime/router.mjs`) passes each request to the right game with the player's own address as the URL, so the games' same-origin checks keep working. The hub API only answers its public origin, so its requests are presented as coming from `https://games.ludvighedin.com`.
- Every page gets `/__ludvig-desktop.js` (`runtime/inject.js`): links to a game's public site open the local copy, and on the host Mac (whose window uses 127.0.0.1) copied or shared invite links get the Mac's network address.
- Direct play between devices is the games' existing WebRTC code. The app turns off Chromium's mDNS hiding of local addresses, so connections work on a local network without internet.
- `app/main.mjs` is the Electron window: a 44 px strip above the games with no colour of its own (it copies the top edge of the page), holding three buttons: All games (not on the start page), My records and Play together. The Bonjour service `_ludvig-games._tcp` finds other Macs. Saved games, rooms and scores live in `~/Library/Application Support/Ludvig Games/`.

## Build

Node 22. The game folders next to this one are only read.

```sh
npm install
node scripts/stage.mjs          # builds the hub and all 13 games into bundle/, from private copies in .stage/
node scripts/stage.mjs ox hub   # rebuild only some
npm test                        # unit tests
npm run dist                    # release/Ludvig-Games-mac-arm64.dmg (ad-hoc signed)
```

`stage.mjs` and the game builds open local ports while prerendering, and need network access for `npm ci`. After staging, `.stage/*/node_modules` is removed.

Development: `npm start` opens the app; `node runtime/server.mjs` runs only the games (http://127.0.0.1:47800). With the runtime running, `agent-heavy-run browser bun run browser-test <dir>` runs the two-device check in headless Chrome. `LUDVIG_PORT_OFFSET=200 LUDVIG_SELFTEST=<dir> npx electron .` starts a separate copy beside the installed app, without a window, saves screenshots of the bar, the hub and the panel, and quits.

## Updates

The app checks the latest GitHub release a few seconds after start and every six hours. If it is newer, an "Update to x.y" button appears in the top strip (also Ludvig Games → Check for Updates…). It downloads `Ludvig-Games-mac-arm64.zip`, checks that its SHA-256 is signed in `…zip.sig` with the release key, that the unpacked app passes `codesign --verify` and is `com.ludvighedin.games`, then swaps the app bundle after quitting and reopens it. Saved games and scores are in Application Support and stay.

- `npm run dist` signs the zip with `scripts/sign-update.mjs`. The private key is only on the release Mac, at `~/Library/Application Support/Ludvig Games Release/update-signing-key.pem`; its public half is `app/update-key.pem`. Without that private key no update can be published (users would install the next version by hand once).
- A release needs three files: the `.dmg` (website download), the `.zip` and the `.zip.sig` (updater). Upload all three, then publish the release.
- The app cannot replace itself when it runs from the DMG or from Downloads (macOS read-only "translocation"). Then the button opens the release page instead.

## Play together

- `runtime/together.json`: per game, how to play online (button labels, quick match, invite key such as `room` or Pigeon's `square`) and on one device, plus a one-line hint. Read by the app's panel and by the guest notice.
- `runtime/inject.js` reports rooms to the app: the separate games' `POST /api/...` answers with a room code, `?room=` in the address, `Ludvig.mp.create/join` in hub games, and copied invite links. The panel then opens by itself with a QR code that joins that room.
- The runtime counts other devices that opened a game in the last two minutes (`/__ludvig/devices`, loopback only, with a per-launch token from the app).
- Guests that are not in the app see "Connected to <Mac name>" for a few seconds on hub pages.

## Signing (prepared, not active)

The app is ad-hoc signed. On first open, macOS says it can't check the app: open **System Settings → Privacy & Security** and click **Open Anyway**.

For a version that opens without that warning:

1. An Apple Developer Program membership (team `XDBG7P4V96`) and a **Developer ID Application** certificate in the login keychain.
2. An App Store Connect API key for notarization: `APPLE_API_KEY` (path to the .p8), `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`.
3. `npm run dist:signed` builds signed and notarized arm64 and Intel versions. Hardened runtime and entitlements are in `build/entitlements.mac.plist`.

The Intel build also needs the Intel workerd binary: `npm install --no-save --os=darwin --cpu=x64 @cloudflare/workerd-darwin-64` before building.

## Limits

- Only Apple Silicon Macs for now (`npm run dist` builds arm64).
- macOS asks once to allow incoming connections and access to the local network. Saying no keeps solo play working but stops friends from joining.
- Guest devices need the host Mac's app open, on the same network. Networks that block devices from seeing each other (some guest and school Wi‑Fi) stop local play.
- Hub leaderboards in the app are local to the Mac that hosts. They never reach the public site.
- Fonts from Google Fonts fall back to system fonts offline.
