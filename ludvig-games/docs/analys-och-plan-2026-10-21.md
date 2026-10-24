# Ludvig Games: analys och plan · 21 oktober 2026

## Sammanfattning

- **Ja, det är värt en liten satsning, men räkna med följare och designerprofil före pengar.** De AI-byggda webbspel som tjänat pengar hade nästan alltid en stor publik redan, en daglig delningsmekanik eller en nyhetsvinkel. Typiskt utfall för resten är nära noll.
- **Spelen håller bättre kvalitet än väntat.** Inga krascher eller låsningar hittades i huvudspelen. De största felen gäller mobil: tangentbordstips, saknade knappar och ett par skärmar som tappar delningsögonblicket.
- **Visa 5 spel, inte 72.** Bäst att visa: Flappy First Person, No Brakes, Just One More Prompt, PIGEON och ONE SMALL FAKE. Visa inte VICE RUN, ROBLOX eller STACKLIGHT. De lånar varumärken och utseende från GTA, Roblox och Tetris.
- **Du kan inte få en Vercel-räkning på gratisplanen.** Värsta fallet är att sajten stängs i upp till 30 dagar om ett spel blir populärt. Annonser är inte tillåtna på gratisplanen. Flytta till Cloudflare (gratis, ingen bandbreddsgräns) innan du marknadsför.
- **Multiplayer-spelen är inte en pengafråga.** Ritkaos kostar några kronor i månaden att köra för kompisar. Atlas förlorar pengar på varje runda så länge den använder Google Street View. Inget av dem behöver inloggning.

## 1. Vad som finns

72 publika poster, men bara cirka 45 unika spel. Resten är äldre versioner och prototyper. 47 av 72 kort saknar bild. Sajten ser därför ut som ett arkiv, inte ett urval.

Ej släppt: Ritkaos (ritspel för 2–12 vänner, svenska, Node-server), Atlas (GeoGuessr-lik, multiplayer via Convex och Clerk, pausad för Google-kostnader) och Anything vs Anything (AI-fajter, gömd tills ett skyddat AI-anrop med kostnadstak finns).

## 2. Buggar, rangordnade

Hittade genom kodläsning, inte genom att spela. Allt nedan är okontrollerat i webbläsare och på riktig telefon.

**Påverkar delning och tillväxt**

1. **Higher or Lower (båda versionerna):** efter en miss finns bara "Play again". Resultatet, "new best" och "Copy result" ligger gömda under Options. Spelare missar delningsögonblicket. Fix: visa resultatskärmen direkt efter en miss.
2. **Origin:** dagens pussel upprepas exakt var sjätte dag, eftersom det bara finns 18 ledtrådar. Delad text saknar länk tillbaka till sajten. Det här är ditt enda spel med Wordle-mekanik, så det är värt mest att fixa.

**Gör spelet ospelbart eller låst för vissa**

3. **Frontier: Blood & Dust:** inga touchkontroller. På telefon går det inte att röra sig. Märk som dator-only eller lägg till joystick.
4. **HEATWAVE · San Sol Remastered:** på telefon öppnar ENTER-knappen butiken i stället för bilen nära garage och hus. Spelaren kan inte komma tillbaka in i sin bil. Ljud av sparas under fel nyckel och glöms bort.
5. **VICE RUN:** pausmenyn går inte att skrolla på liggande telefon, så knapparna hamnar utanför skärmen. Ljudet kan dö helt efter att man lämnat sidan och kommit tillbaka.
6. **SKYLINE:** ingen boost eller broms på touch. Landningsskolan kräver mellanslag.
7. **Fresh Tracks och ROBLOX:** hämtar 3D-biblioteket från en extern tjänst. Om den är blockerad visas "Connection needed" och spelet startar inte.
8. **Goldwake · Gunnery:** datorer med pekskärm och iPad med styrplatta räknas som telefon. Musen kan då inte titta eller sikta.

**Prestanda på telefon**

9. **DEADBLOCK:** varje kill laddar om en stor golvtextur. Senare vågor hackar på telefon. Huvudmenyn från paus sparar inte bästa resultat.
10. **PULSE//SHIFT:** 5,4 MB i en fil eftersom tre låtar ligger inbakade. På mobildata gör PLAY ingenting tills allt laddat. Editorns Clear-knapp fungerar aldrig i spelramen, eftersom dialogrutor blockeras.
11. **Citrus Circuit Coastline och HEATWAVE Remastered:** tunga på mellanklassmobiler. Skuggor stängs aldrig av automatiskt.

**Gemensamt för nästan alla spel**

12. **iPhone-ljud:** efter ett samtal eller Siri kan ljudet förbli tyst tills sidan laddas om. En liten gemensam fix täcker alla spel.
13. **Tangentbordstips på telefon:** PIGEON ("E to drop"), SKYLINE, AFTERGLOW och CAGE visar tangenter som inte finns.

**Mindre fel**

- ONE SMALL FAKE: en sämre omtagning skriver över en bättre poäng.
- KILN: byte av svårighetsgrad mitt i spelet ger poäng på fel topplista.
- Higher or Lower v2: fel kort markeras som ditt val.
- Fresh Tracks: krock i luften ger ändå "CLEAN LANDING".
- No Brakes: varje kaosbana sparar en spökrunda för alltid. Det kan till slut fylla lagringen som alla spel på domänen delar.
- POP ISLAND: hjälpen går inte att öppna på telefon. Räckvidden syns inte före placering.
- Slope Overdrive: att släppa ena styrknappen nollar styrningen.
- STILL HOUSE och The Eighth Signal: när telefonen vrids släpper touchkontrollerna.
- Mosslight: att dra för att titta bryter också block.
- ASHFALL '84: upplockbara föremål kan försvinna mitt i spelet.
- Frontier: död, tillbaka och Continue hoppar över dödsstraffet.
- Gläntan v2: Tab, M och B i pausmenyn stänger menyn.
- JAILBREAK: den kopierade länken pekar på den nakna spelfilen.

**Sajten**

- Sex dubblettfiler ("index 2.html") är publicerade. Dessutom finns tomma "… 2"-mappar i byggmappen. Båda kommer från Finder eller iCloud och kan tas bort.
- Ingen besöksstatistik finns. Du vet inte om någon spelar redan nu.

## 3. Säkerhet och kostnader

- **Inga hemligheter eller API-nycklar** finns i de publicerade filerna. Sajten har ingen server, så det finns nästan inget att attackera.
- **Vercel gratisplan:** 100 GB trafik i månaden räcker till cirka 50 000 spelningar av ett 2 MB-spel. Går du över stängs sajten med ett felmeddelande, oftast i 30 dagar, ibland längre. Det kommer ingen räkning. DDoS-trafik räknas också mot gränsen.
- **Annonser och sponsorer** bryter mot gratisplanens regler. Donationer är tillåtna.
- **Rekommendation:** flytta till Cloudflare innan du marknadsför. Statiska filer har ingen trafikgräns, kommersiellt bruk ser okej ut och alla filer ryms. Din domän ligger redan där. Om du stannar på Vercel med annonser krävs Pro för 20 dollar i månaden. Slå då på hård paus vid ett lågt belopp.
- **Varumärken är den verkliga risken**, och den växer när du marknadsför eller tar in pengar:
  - Hög: ROBLOX (namn, logga, R$) och VICE RUN (GTA Vice City-stil, "WASTED", "BUSTED").
  - Medel–hög: STACKLIGHT (Tetris-färger och T-spin).
  - Medel: HEATWAVE Remastered ("WASTED", GTA-bilnamn, Securicor) och Just One More Prompt (Claude, Cursor, Monster).
  - Göm eller byt namn och stil före marknadsföring.
- **Spelramens säkerhet:** spelen körs på samma domän och kan läsa varandras sparade data. Det är okej så länge alla spel är dina egna. Lägg aldrig upp andras spel här.
- **Betal-API:er:** Atlas Google Street View kostar cirka 14 dollar per 1 000 visningar efter 5 000 gratis. Anything vs Anything kostar per AI-anrop. Håll båda avstängda tills det finns serverspärrar och tak, enligt den befintliga planen.

## 4. Vad andra har gjort

- **fly.pieter.com** (Pieter Levels, februari 2025): byggd med AI på några timmar. Han rapporterade cirka 87 000 dollar i månaden från annonsytor i spelet efter 17 dagar, med 625 000 följare på X. Siffran är hans egen. 2026 visar hans profil 0 dollar för spelet.
- **GeoSports** (2026): ett dagligt quiz byggt med Claude på en helg. Det nådde 1 miljon spelare på en månad, och 98 % kom via en delbar resultatruta, inte via skaparens följare.
- **Taipei Rush** (september 2026): en GTA-lik webbsida som spreds via ett Threads-inlägg och lokala nyheter.
- **Vibe Jam 2026:** 945 spel men bara 242 000 spelare totalt. De flesta spel fick nästan inga.
- **Portaler:** CrazyGames betalar cirka 1–3 euro per 1 000 spelningar och har en gratis testlansering utan SDK. Poki ger 50 % till 100 % av intäkterna, men tar få spel och kräver ensamrätt på den öppna webben.
- **AI-motstånd:** en stor del av gamers ogillar AI-spel. Hits leder med spelet, inte med "AI". Berättelsen om hur det byggts fungerar för byggare och designers, inte för gamers.

## 5. Vilket spel ska visas

| Spel | Varför | Risk |
|---|---|---|
| Flappy First Person | Begrips på en sekund, en tumme, krascher ger bra klipp | Låg |
| No Brakes | Varje ragdoll-krasch är ett färdigt klipp, laddar snabbt | Låg |
| Just One More Prompt | Träffar AI- och utvecklarpubliken mitt i prick | Medel (namn) |
| PIGEON | Kaos, och har inbyggd 12-sekunders vertikal klippinspelning | Låg |
| ONE SMALL FAKE | Avslöjandet "TV-bild till studio" är ett skämt i sig | Låg |
| Reserver | Sunset Dash, Powder, DEADBLOCK, Citrus Circuit Coastline | Låg |

**Nytt spel eller befintligt?** Bygg inget nytt nu. Det som saknas är en daglig delningsmekanik, inte fler spel. Origin har redan den. Med 365 ledtrådar, en länk i delningen och fixade fel är det din bästa chans till Wordle-liknande spridning.

## 6. Multiplayer

- **Ritkaos:** färdigt och testat. Kör det för 25–40 kronor i månaden på Fly.io eller gratis på Cloudflare efter en ombyggnad. Inloggning behövs inte, eftersom rumslänkar räcker. Kul för kompisar, men inte en intäkt. Skribbl och Gartic Phone dominerar och det är bara på svenska.
- **Atlas:** varje runda kostar Google-pengar, och annonser ger 1–3 euro per 1 000 spelningar. Det går bara ihop med gratis gatubilder eller en betalversion. Låt det vara pausat.
- **Anything vs Anything:** inte multiplayer, men troligen det mest klippvänliga du har ("skriv två saker, se dem slåss"). Planen med kostnadstak på 1 000 kronor i månaden finns redan. Den är värd att bygga om ett spel ska få pengar.
- **Inloggning:** låt alla spela som gäst. Lägg till Clerk först när någon vill spara framsteg eller hamna på en topplista. Gratisnivån räcker långt.

## 7. Plan

**Steg 1 · Städa (en kväll, jag kan göra allt)**

1. Fixa felen i de fem visningsspelen och iPhone-ljudet i alla spel.
2. Fixa delningsskärmen i Higher or Lower.
3. Göm äldre versioner och de riskabla spelen, eller samla dem under ett "Arkiv". Mål: cirka 25 spel med bild på framsidan.
4. Ta bort dubblettfilerna.
5. Lägg till besöksstatistik utan cookies (Cloudflare Web Analytics, gratis).
6. Flytta sajten till Cloudflare. Kräver ditt godkännande eftersom det ändrar var sajten körs.

**Steg 2 · Testa i fyra veckor (2–3 timmar i veckan)**

1. Skapa ett konto på TikTok. Lägg samma vertikala klipp på Reels och Shorts.
2. Posta tre klipp i veckan, 10–15 sekunder. Visa spelet direkt under första sekunden. Använd text på skärmen, eftersom de flesta tittar utan ljud.
3. Exempel på krokar: "Flappy Bird, men du ÄR fågeln", "Min AI-agent ber om lov kl. 03:57", "Jag kan inte koda, så jag gjorde det här i helgen".
4. På X, Threads och LinkedIn: berätta om hur du bygger som designer med AI. Där är AI en styrka, inte en nackdel.
5. Lägg upp ett spel på r/WebGames och ett som Show HN. Led med spelet.
6. Testlansera två spel på CrazyGames. Det är gratis och ger riktiga siffror.

**Steg 3 · Beslut efter fyra veckor**

- Har ett klipp passerat cirka 10 000 visningar, eller spelar ett spel mer än 1 000 personer i veckan? Satsa på det spelet: daglig mod, delbar resultatruta, sedan sponsoryta eller portal.
- Annars: behåll sajten som portfolio. Värdet blir designerprofilen, inte intäkten.
- Origin med 365 ledtrådar är det bästa nästa bygget oavsett utfall.
