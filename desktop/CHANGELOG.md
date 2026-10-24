# Changelog

## Unreleased

- Shared rooms only pass data answers (JSON or plain text) and plain caching headers from the Mac that holds the rooms.

## 0.4.0 — 25 October 2026

- Macs on the same Wi‑Fi share their rooms. Before, each Mac had its own, so two Macs pressing Quick match in Horde (or any game) landed in separate empty lobbies. Now the Mac whose app has been open longest holds the rooms, and quick match, room codes and invite links find players on every Mac and on phones connected to any of them. Pages, scores and My records stay on each Mac. If that Mac leaves, rooms are made on this Mac again. Both Macs need this version.
- Every multiplayer game was played with two players to check that both end up in the same room and see each other. Scrapyard and Mosslight started everyone on the same spot, so the teammate was hidden inside your own view; the others now start a little behind.
- Scrapyard's Play together hint now says that the others tap "Join match" once the host has started.

## 0.3.1 — 24 October 2026

- Play together starts with one clear answer: "Ready to play together" (green) or "Not on Wi‑Fi, others can't join yet" (amber), with what to do: join a Wi‑Fi, or use a phone's Personal Hotspot. The network does not need internet.
- Macs nearby only lists Macs that answer on their address, never this Mac itself or one that has left the network.
- Opening a game for 2+ players shows a small card in the game: how to play it with friends, a QR code for them, and how to play two on this Mac. It steps aside as soon as you start playing.

## 0.3.0 — 24 October 2026

- Update inside the app: when a new version is out, an "Update to x.y" button appears next to My records. It downloads the new version, then "Restart to update" swaps it in. Saved games and scores stay. Also under Ludvig Games → Check for Updates….
- Play together now follows what you are doing. On a game it shows how to play it together (from runtime/together.json, 40 games). When you open a room, the panel opens by itself with a QR code that joins that room directly (separate games: ?room=CODE; hub games: their own invite link, e.g. Pigeon's ?square=CODE).
- The panel lists the phones and computers that have opened this Mac's games in the last two minutes, and the Play together button shows how many.
- Phones that scan the code see "Connected to <Mac name>" with a one-line hint for that game.
- Nicer install window: light background, title, arrow and "Drag Ludvig Games into Applications".
- Fix: the desktop script no longer breaks React hydration in Salvo and OX; inside the app it loads through the page preload instead.

## 0.2.0 — 24 October 2026

- No visible top bar: three buttons sit in a thin strip that takes the colour of the game below. "All games" on the left (hidden on the start page), "My records" and a more prominent "Play together" on the right.
- The hub inside the app gets the new catalog design (fewer categories, dropdown filters, round search), without the website's My records and Download links, which the app's own buttons replace.
- Development checks can run beside the installed app (`LUDVIG_PORT_OFFSET`, separate data, invisible to nearby Macs).
- Release files have fixed names for the website's download link.

## 0.1.0 — 24 October 2026

- First Mac app: the hub's games plus Ritkaos, Salvo, Hängd, Little Links, Color Clash, Ludo, Air Hockey, Hoop Rush, Gravity Arena, OX, Table Tennis, Chess and Mind Games, all running on the Mac and offline.
- Play together: QR code and link for phones and computers on the same Wi‑Fi, and a list of nearby Macs with the app.
- Rooms, leaderboards and saved games are stored on the Mac.
- Unsigned build, with signing and notarization prepared.
