# PENTHOUSE PANIC

En flyttfirma. En takvåning. Orimligt lite tid.

Bär och kasta möbler till lastzonen innan tiden tar slut. Kedja leveranser för högre poäng, hitta bra kastvinklar och försök hålla både möblerna och flyttgubbarna på rätt sida om kanten.

Spelet använder Three.js för grafiken, cannon-es för fysiken och PeerJS för privata onlinerum. Grafik och ljud skapas i spelet. Ingen inloggning behövs.

## Starta spelet

Du behöver **Node.js 20 eller senare**. Installera en aktuell LTS-version från [nodejs.org](https://nodejs.org/) om Node saknas.

1. Packa upp hela ZIP-filen.
2. På Mac: dubbelklicka på **START-MAC.command**.
3. På Windows: dubbelklicka på **START-WINDOWS.bat**.

Startfilen öppnar webbläsaren. Behåll terminalfönstret öppet medan du spelar. Avsluta servern med **Ctrl+C**.

Om macOS inte låter dig starta filen direkt, öppna Terminal i spelmappen och kör:

```bash
node serve.mjs
```

Du kan också använda:

```bash
npm start
```

Öppna sedan **http://localhost:8080/**. Du behöver inte köra `npm install`: biblioteken ligger redan i `dist/vendor/`.

**Öppna inte `dist/index.html` direkt.** Webbläsarens regler för JavaScript-moduler kräver att spelet körs via en webbserver.

### Annan port

Om port 8080 används kan du välja en annan.

Mac/Linux:

```bash
PORT=8081 node serve.mjs
```

Windows PowerShell:

```powershell
$env:PORT = "8081"
node serve.mjs
```

### Öppna på en annan enhet hemma

Servern skriver ut din lokala nätverksadress, till exempel `http://192.168.1.20:8080/`. Öppna den på en enhet på samma wifi. Värddatorn måste fortsätta köra servern. Datorns brandvägg kan behöva tillåta inkommande anslutningar till Node.

Servern visar bara innehållet i `dist/`. Enheten som öppnar adressen får sin egen spelinstans. Välj onlineläget och samma rumskod om ni ska delta i samma match från olika enheter.

## Så spelar du

Plocka upp en möbel, sikta mot lastzonen och kasta. När du håller en möbel laddar du nästa kast genom att hålla inne greppknappen. Släpp för att kasta. Ett kort tryck ger ett kortare kast; ett längre tryck ger mer kraft.

| Handling | Spelare 1 | Spelare 2, samma tangentbord |
| --- | --- | --- |
| Förflytta dig | W, A, S, D | Piltangenterna |
| Plocka upp | E eller vänster musknapp | L |
| Ladda och kasta när du bär | Håll E eller vänster musknapp, släpp för att kasta | Håll L, släpp för att kasta |
| Sikta | Muspekaren eller rörelseriktningen | Rörelseriktningen |
| Hoppa | Mellanslag | K |
| Dash | Shift | J |
| Släpp möbeln | Q | I |

Spelare 2:s tangenter gäller när ni spelar tillsammans på samma enhet. I onlineläget använder båda spelare de vanliga kontrollerna för spelare 1 på sina egna datorer.

Tips: börja med korta kast nära lastzonen. Siktlinjen hjälper dig att anpassa kraft och vinkel. Håll leveranserna täta för att bygga en combo.

## Spellägen

- **Solo:** klara flyttpassen och förbättra dina resultat.
- **Två på samma skärm:** samarbeta med separata tangenter på ett tangentbord.
- **Privat onlinerum:** två spelare på varsin enhet. En spelare skapar rummet och delar den sex tecken långa koden; den andra ansluter med koden. Värden måste behålla spelet öppet.
- **Dagens utmaning:** samma utgångsläge för alla under samma kalenderdygn i tidszonen Europe/Stockholm.
- **Fri flytt:** öva rörelser och kast utan nedräkning.

### Sex våningar

| Våning | Utmaning |
| --- | --- |
| Takvåningen | Lär dig flytten och leveranserna. |
| Glashuset | Kasta genom glas för stilbonus. |
| Hala golv | Mindre grepp. Bromsa i tid. |
| Låg gravitation | Längre hopp och kast. |
| Stormvåningen | Vinden påverkar flygande möbler. |
| Övertid | Fler möbler och mindre tid. |

## Sparning

Framsteg, upplåsningar och personliga rekord sparas lokalt i webbläsarens `localStorage`. Det finns inga konton och ingen synkning mellan enheter. Dagens startläge är gemensamt; resultaten lagras lokalt.

Använd samma webbläsare och adress för att behålla dina framsteg. `localhost`, nätverksadressen och andra portar räknas som olika adresser. Inkognitoläge eller rensad webbplatsdata kan ta bort sparningen.

## Online och offline

Solo och två spelare på samma enhet behöver ingen internetanslutning när filerna och Node finns på datorn.

Onlinerum behöver internet. PeerJS Cloud förmedlar kontakten mellan spelarna, och speldata skickas sedan direkt via WebRTC. Värdens spel beräknar fysik och poäng. Koden innehåller ingen dedikerad TURN-server; vissa brandväggar och NAT-kombinationer kan därför stoppa anslutningen. Prova ett annat nätverk eller spela på samma enhet om anslutningen misslyckas.

Rummet finns medan värden har sidan öppen. Det är ingen permanent server och ingen publik matchmakingtjänst. För online är `localhost` eller en webbplats med HTTPS den rekommenderade adressen.

## Felsökning

**Sidan är tom:** kontrollera att du använder serveradressen och att hela `dist/` följde med när ZIP-filen packades upp. Prova en aktuell Chrome, Edge, Firefox eller Safari med WebGL 2 och hårdvaruacceleration aktiverat.

**Inget ljud:** klicka i spelet först. Webbläsare kräver användarinteraktion innan ljud kan starta. Kontrollera även spelets ljudval och flikens ljudinställning.

**Rummet hittas inte:** kontrollera koden och att värden fortfarande har rummet öppet. Försök skapa ett nytt rum om värdens sida har laddats om.

**En kompis på samma wifi kommer inte åt adressen:** kontrollera att båda använder samma nätverk, att servern fortfarande körs och att brandväggen tillåter porten. Ett gästnätverk kan isolera enheterna från varandra.

**Startfilen öppnar ingen webbläsare:** kopiera adressen som visas i terminalen och öppna den själv.

## Filer och publicering

- `dist/` innehåller det körbara spelet och alla medföljande bibliotek.
- `serve.mjs` är den lokala servern utan externa Node-beroenden.
- Startfilerna öppnar servern och spelet på Mac respektive Windows.
- `THIRD-PARTY-NOTICES.md` och licensfilerna i `dist/vendor/` beskriver tredjepartsbiblioteken.

För egen webbhosting: publicera innehållet i `dist/` på en statisk webbserver med HTTPS och bevara mappstrukturen. Ingen byggprocess behövs. Den medföljande lokala Node-servern är främst avsedd för att starta det nedladdade spelet.

## Verifiering

`npm test` kör de medföljande fysiktesterna. De kontrollerar bland annat riktiga kast och leveranser, föremålsägande, poäng, hopp, fall, glas, återställning och dagsfrön. Den automatiska testwebbläsaren saknade WebGL; faktisk GPU-rendering och prestanda på olika enheter är därför inte verifierade i denna leverans.

Det separata testet mot den riktiga PeerJS-tjänsten kunde skapa ett rum. WebRTC-anslutningen mellan två klienter fick timeout i testmiljön, så onlinespel är inte slutverifierat. Protokollets anslutnings-, avvisnings- och frånkopplingslogik har testats separat.
