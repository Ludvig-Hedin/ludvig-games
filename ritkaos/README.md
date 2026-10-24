# Ritkaos

Ett färdigt litet drawing-party-spel för 2–12 vänner: privata rum, ritning i realtid, serverbestämda poäng, knäppa motiv på svenska och engelska, co-op, fri duk, återanslutning och snabbmatch med främlingar.

**Börja i [SPELA-IKVALL.md](./SPELA-IKVALL.md).**

```sh
npm start
```

Node.js 22+. Inga npm-beroenden, inget byggsteg, ingen databas, inga API-nycklar. HTML-filen kan inte ensam leverera multiplayer: starta Node-servern och öppna den adress som skrivs ut.

## Arkitektur

`server.mjs` serverar en explicit tillåtelselista av publika filer och hanterar samma-origin WebSocket-anslutningar på `/ws`. `lib/websocket.mjs` är en liten texttransport som hanterar RFC 6455-ramar, maskning, fragment, ping/pong, storleksgränser och backpressure. `lib/game.mjs` äger rum, turer, deadlines, svar, poäng, medlemskap och all rithistorik. `lib/prompts.mjs` innehåller svenska ord, alias och hundratals kombinationer av absurda motiv, och `lib/prompts-en.mjs` samma sak på engelska. De filerna serveras aldrig till webbläsaren. `lib/i18n.mjs` har serverns texter (fel, chattrader, kaosnamn) på båda språken. `lib/network.mjs` gör om en klients IP-adress till en saltad nätverksnyckel.

Klienten använder vanlig JavaScript och Canvas 2D. Avsiktligt enklare än React/Vite: det blir inget paket- eller byggkrångel innan ni kan spela. Riktig serverkommunikation använder webbläsarens inbyggda WebSocket, inte Socket.IO, localStorage eller simulerade medspelare.

Ritning skickas som normaliserade vektorpunkter, inte skärmbilder. Servern ger alla segment en gemensam ordning. Det betyder att två överlappande penseldrag renderas i samma ordning hos alla. Omedelbar lokal förhandsvisning hålls skild från bekräftad rithistorik. Ångra tar bort bara ägarens senaste streck. Återanslutning skickar hela bekräftade historiken.

## Filer

- `public/`: hela klienten, CSS, HTML, ikoner. Inga externa bilder, typsnitt eller ljud.
- `lib/`: spelmotor, serverbaserad ordbank och WebSocket-transport.
- `server.mjs`: HTTP-server, säkerhetsrubriker och anslutningshantering.
- `tools/online.mjs`: uttryckligen startad Cloudflare-tunnel; installerar inget.
- `tests/`: spelregler, verkligt nätverksflöde och valfria webbläsarkontroller.
- `STARTA-MAC.command`, `STARTA-WINDOWS.bat`: bekväm lokal start.

## Tester

```sh
npm test
```

Kör de 38 regeltesterna och två verkliga WebSocket-integrationstester (det andra provar Ritkaos+ på port `TEST_PORT`+1). Integrationstestet startar en egen server på port 3187, skapar tre spelare plus ett isolerat rum, provar samtidiga streck, ägarstyrt undo, återanslutning, poäng, en hel match och omstart. Det tar cirka 22 sekunder eftersom matchens övergångar använder verklig tid. `TEST_PORT` kan ändra testporten.

Se `TESTRESULTAT.md` för vad som faktiskt kördes och vad som inte verifierades här.

De valfria Python/Playwright-skripten används endast för verifiering och ingår inte i spelets körning. På en vanlig maskin kan `tests/browser-smoke.py` köra tre riktiga Chromium-sessioner mot `npm start`. Installera vid behov testverktygen i en separat Python-miljö:

```sh
python -m pip install playwright
python -m playwright install chromium
python tests/browser-smoke.py
```

`tests/render-ui.py` är ett separat offline-UI-test med tydligt markerade simulerade nätverksmeddelanden. Det ersätter inte multiplayer-testet och dess testkod laddas aldrig av spelservern.

## Publicering på en beständig server

Använd **en enda** långlivad Node-process med WebSocket-stöd, HTTPS och rätt proxyinställningar. Startkommando: `npm start`. Servern lyssnar på `0.0.0.0` och läser `PORT`. Hälsokontroll: `/health`. `Dockerfile` ingår som alternativ. Docker-bygget och extern molnpublicering är inte verifierade i denna leverans.

Frontend och backend behöver samma origin. Vid egen reverse proxy måste `/ws` vidarebefordra WebSocket Upgrade/Connection och behålla korrekt Host. En vanlig statisk webbplats eller en kortlivad serverless-funktion ersätter inte den här servern.

Den här versionen är avsedd för ett kompisgäng, inte som härdad stor publik tjänst. Kör inte flera instanser bakom en lastbalanserare: rum och spelstatus ligger i processens minne och skulle då skilja sig mellan instanser. Flera instanser behöver delad status och samordnad händelseordning; enbart extra servrar löser inte det.

## Avgränsningar

Gränssnitt och motiv på svenska och engelska. Ingen inloggning, permanent rumslagring, AI-bildtolkning eller automatiserad moderation. Öppna matcher har bara omröstning för att ta bort någon och kontorsläget som skydd. Gissningar jämförs mot normaliserade ord och explicita alias; godtyckliga synonymer kan inte garanteras. Co-op kräver tre personer eftersom någon måste gissa.

Transporten använder WebSocket och återanslutning, inte HTTP-polling som alternativ. Spelarna måste kunna nå servern och deras nätverk måste tillåta WebSocket. Använd HTTPS/WSS när servern är åtkomlig från internet. Dela bara rumslänkar med personer du vill släppa in.

Kopplingen mellan fysiska enheter på ditt wifi, macOS-startfilen och Cloudflare-tunneln behöver sluttestas på din dator. Följ SPELA-IKVALL.md.

## Hosted on Cloudflare (22 October 2026)

Live at https://ritkaos.ludvighedin.com. `worker/index.mjs` serves `public/` and keeps all rooms in one Durable Object (`Lobby`), the same single-process model as `server.mjs`. Rooms vanish when everyone has left and the object is evicted. Deploy with `bunx wrangler@latest deploy`. `node --test tests/remote.test.mjs` runs the full multiplayer journey against the live server; `tests/network.test.mjs` still tests the local Node server. The original download stays in `../downloads-2026-10-21/Projects/ritkaos/`.

## Privacy, open matches and languages (22 October 2026)

**Rooms are private by default.** A room is only reachable by its code or invite link. The home screen never lists other people's private rooms, and `/api/rooms` follows the same rules.

**Visible on my network.** When creating a room (and later in the room settings, host only) there is a toggle, off by default: "Synligt för andra på samma nätverk" / "Visible to others on my network". When it is on, the room shows up on the home screen for people on the same network as the host. The network is worked out on the server from the visitor's IP address: the full address for IPv4 and the /64 prefix for IPv6. Only a salted hash is kept in memory (a new random salt each time the process starts), raw addresses are never stored, logged or sent to anyone. On Cloudflare the Worker passes `CF-Connecting-IP` to the Durable Object in its own header and overwrites anything the client sent. The local Node server counts loopback and private LAN addresses as one "local" network, so everyone on your wifi sees the room. It trusts `CF-Connecting-IP`/`X-Forwarded-For` only when the request arrives from the same machine (a local tunnel or proxy).

Known limitation: devices on the same wifi can still get different keys if one connects over IPv4 and another over IPv6, or if a phone is on mobile data. Then the room does not show up and the code or link is the way in.

**Quick match ("Snabbmatch" / "Quick match").** Joins the fullest open match in your language that has space, or opens a new one. Open matches are created only by matchmaking and have fixed settings: Chaos mode, 1 round, 75 seconds, the office-safe word list, at most 8 players. They have no host. They start by themselves 10 seconds after 3 or more players are online, or 25 seconds after there are exactly 2. The countdown stops if fewer than 2 are left. After a match the results show for 10 seconds, then everyone is back in the lobby and the countdown starts again. You can join mid-match; you watch until the next turn, like a late joiner in a private room. "Öppna matcher" / "Open matches" on the home screen lists open matches (player count, phase, language) so you can pick one.

**Vote-kick.** Open matches have no host kick. Each player has a small × button next to other names. A player is removed when more than half of the other online players have voted within the last 60 seconds (with 2 players, one vote is enough). Pressing again withdraws your vote. A removed player cannot rejoin that match. Private rooms keep the host's kick.

**Languages.** Swedish and English. The browser picks Swedish if any of its languages is Swedish, otherwise English. The SV/EN toggle in the header saves the choice in `localStorage` and sets `<html lang>`. The player's language is sent in `hello` and with each switch, so the server writes errors and chaos names in that language. Each room has a language too: the creator's language for private rooms, the matchmaking language for open matches. Chat lines and prompts follow the room's language. The English word bank has the same structure and roughly the same size as the Swedish one (about 1,860 prompts, about 1,470 office-safe). It does not copy the Swedish jokes about nationalities, ethnicity or sexuality.

Tests: `tests/game.test.mjs` covers private rooms, network visibility, network keys, quick match, auto-start, late joins, vote-kick and English rooms. `tests/remote.test.mjs` creates its room with network visibility on, since all of its clients share one address.


## Ritkaos+ (23 October 2026)

**The game stays free.** Rooms, quick match and the four original modes never cost anything. Ritkaos+ only adds extras:

| Product id | Swedish / English | Price |
|---|---|---|
| `plus` | Ritkaos+ (everything below) | 79 kr |
| `nineties` | 90-talet / The 90s | 25 kr |
| `office` | Kontoret / The Office | 25 kr |
| `holidays` | Jul / Holidays | 19 kr |
| `food` | Svensk mat / Food | 19 kr |
| `internet` | Internet | 29 kr |
| `blind` | Blindritning / Blind draw | 19 kr |
| `speed` | Snabbrunda / Speed round | 19 kr |
| `telephone` | Telefonleken / Telephone | 29 kr |
| `cosmetics` | Penslar & färger / Brushes & colours | 29 kr |

Prices live in one place, `PRODUCTS` in `lib/store.mjs`.

**Who gets what.** Packs and modes follow the host of a private room: if the host owns one, everyone in that room plays it for free. A guest's own packs never unlock a room. If the host changes, the new host cannot start a locked pack or mode until they pick something they own. Open matches (quick match) keep their fixed free settings. Cosmetics are personal: only the owner can draw with marker, crayon or neon, and everyone in the room sees those strokes. The three extra palettes are a convenience in the owner's toolbar.

**Word packs.** `lib/packs/*.mjs` holds about 60 prompts per pack in each language, with aliases and an office-safe flag (`lib/packs.mjs` builds them). Like the base word bank, they are never served to browsers. The free "Lite av allt / A bit of everything" mix never includes paid packs.

**Modes.**
- *Blindritning / Blind draw*: like Classic, but the server never sends the artist their own ink during the turn. The artist sees a dark overlay, everyone else sees the drawing, and the artist gets the full drawing at the reveal.
- *Snabbrunda / Speed round*: 8 s to pick, 30 s to draw (the time setting is ignored), 3.5 s reveal, twice the rounds (max 10), and +150 for a correct guess in the first 10 seconds.
- *Telefonleken / Telephone* (3+ players): everyone writes a prompt, then the chains rotate: draw the text you got, describe the drawing you got, draw that, and so on, until every player has added one step to every chain. Each step has its own private canvas (ink goes only to its owner). Missing prompts are filled in from the word bank, missing guesses become "(no guess)", and offline players never block a step. At the end the host shows the chains one by one (or they advance after a while), then everyone is back in the lobby. Telephone canvases are capped at 5,000 points to keep the reveal small. There are no scores in this mode.

**Unlock codes.** Codes look like `RK-XXXX-XXXX-XXXX`: 60 bits of Crockford base32 holding a version, a bitmask of product ids, a 14-bit random nonce and a 34-bit truncated HMAC-SHA256 made with the server secret. Verification uses Web Crypto, so the same code runs in the Worker and in Node 22. The browser keeps redeemed codes in `localStorage` (`ritkaos.codes`) and sends them in `hello`. The server verifies them and keeps the result on the session only; the client's own claims are never trusted. A code can be redeemed from the store sheet (`redeem` message, 6 tries a minute). Codes cannot be revoked, and anyone with a code can share it; that is the trade-off for having no accounts.

Mint codes (the secret must match the server's; it is never printed):

```sh
RITKAOS_UNLOCK_SECRET='…' node scripts/mint-code.mjs plus
RITKAOS_UNLOCK_SECRET='…' node scripts/mint-code.mjs nineties office --count 5
```

**Store sheet.** The "Ritkaos+" button in the header opens a sheet with prices, what you own (and what the host is treating the room to), a code field and a Buy button. Locked packs and modes show a small lock to the host; clicking one opens the sheet. Guests only see the paid pack or mode that is active. Buy opens `CHECKOUT_URL` in a new tab: `{product}` in the URL is replaced with the product id, otherwise `?product=<id>&lang=<sv|en>` is appended. Without a checkout link, or without a secret, Buy is replaced by a short "Soon" note.

**Environment variables.**
- `RITKAOS_UNLOCK_SECRET`: 16+ random characters. Worker: `bunx wrangler@latest secret put RITKAOS_UNLOCK_SECRET`. Local: set it before `npm start`. Without it every code is rejected (fail closed) and free play is unaffected.
- `CHECKOUT_URL`: an `https://` checkout link from the payment provider. Worker: add it as a plain variable (dashboard or `vars` in `wrangler.jsonc`). Local: set it before `npm start`. `/api/store` passes it to the browser; the secret never leaves the server.

**Payment provider.** Not chosen yet. Whatever it is, its job after a successful payment is to show or email the buyer a code made with `mintCode()` from `lib/store.mjs` (for example in a small webhook). That glue is not built.

Tests: `tests/game.test.mjs` covers valid, tampered, wrong-secret and wrong-product codes, fail-closed without a secret, redeem, host-owned packs for guests, guest-owned packs not unlocking a room, server-side rejection of locked packs, modes and brush styles, blind draw, speed round and telephone (including a player dropping out). `tests/network.test.mjs` checks `/api/store`, codes in `hello`, async redeem and a host-owned pack over a real WebSocket.
