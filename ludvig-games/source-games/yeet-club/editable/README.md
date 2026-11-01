# YEET CLUB

**Full vagn. Noll plan.** Ett Three.js-spel om alldeles för snabba kundvagnar.

## Spela direkt

Packa upp ZIP-filen och dubbelklicka på **SPELA.html**. Spelet innehåller allt som behövs och fungerar utan internet. Använd en modern Chrome, Safari, Edge eller Firefox med WebGL 2 och grafikacceleration.

Om webbläsaren begränsar lokala HTML-filer, starta en lokal server från den uppackade mappen:

```sh
npm start
```

Öppna sedan **http://localhost:8080**. Node.js 18 eller senare krävs för serveralternativet. Inga paket behöver installeras.

## Spelet

Du har 90 sekunder och tre liv. Vagnen rullar automatiskt. Samla mynt, följ myntspåren till ramperna och flyg genom ringar. Ett extra tryck på hoppknappen i luften gör en barrel roll. Landa färdigt tricket för mer poäng och boost.

Lådor och barriärer kostar ett liv. Koner kostar fart och bryter kombon. Att slå i vägkanten bromsar dig men avslutar inte loppet.

### Kontroller

| Handling | Solo / spelare 1 | Spelare 2 |
| --- | --- | --- |
| Styr | A / D (även pilar i solo) | Vänster / höger pil |
| Extra fart | W | Uppåtpil |
| Bromsa / sladda | S | Nedåtpil |
| Hoppa / trick i luften | Mellanslag | Enter |
| Boost | Vänster Shift | Höger Shift |
| Paus | Escape eller P | Gemensamt |
| Ljud på / av | M | Gemensamt |

Solo har också pekkontroller på mobil och stöd för en vanlig handkontroll: vänster spak styr, A hoppar, höger trigger/B ger boost och vänster trigger bromsar. Spel med två personer kräver tangentbord. Vissa tangentbord klarar färre samtidiga knapptryckningar; släpp extra gas om en kombination inte registreras.

## Tre sätt att köra

- **Kör solo:** en ny slumpad bana. Direkt returmatch behåller banan så du kan lära dig den.
- **Kör med en kompis:** två samtidiga lopp på delad skärm, samma bana och egna mynt/hinder. Ni tävlar om poäng på samma dator. Vagnarna kolliderar inte med varandra.
- **Dagens utmaning:** samma bana hela dagen, med datum enligt Stockholm. Ditt bästa lopp sparas som ett genomskinligt spöke att tävla mot.

Resultatet kan kopieras som en **YEET-kod**. Kompisen väljer **Har du en kod?** i sin kopia av spelet och kör samma bana mot ditt resultat. Det är en asynkron utmaning. Spelet har ingen onlineserver eller gemensam topplista.

## Spara framsteg

Personbästa, XP, upplåsta färger, inställningar och dagens spöke sparas lokalt i webbläsaren. XP ger nya vagnfärger. De ger inga fartfördelar.

Sparningar följer inte automatiskt med mellan olika enheter, webbläsare, filadresser eller serveradresser. Privat surfning eller blockerad lokal lagring kan hindra sparandet. Spelet går ändå att spela.

## Inställningar

Välj **Så kör du** från menyn för grafikläge, musik och mindre kamerarörelse. Om datorn blir långsam, välj **Prestanda**. M stänger av allt ljud.

## Innehåll

```text
SPELA.html             Spelet i en enda fil. Öppna direkt.
dist/                  Läsbar HTML, CSS och JavaScript.
dist/vendor/           Three.js 0.180.0, inklusive MIT-licens.
serve.mjs              Lokal server utan externa paket.
build-standalone.mjs    Bygger om SPELA.html efter egna ändringar.
package.json           Start- och testkommandon.
tests/                 Simulerings- och integrationskontroller.
README.md              Den här filen.
VERIFIERING.md         Vad som faktiskt har kontrollerats.
```

All geometri, scenografi och musik skapas av kod. Inga externa modeller, texturer, typsnitt, musikfiler eller CDN-anrop behövs vid spel.

## Utveckla

Ändra filerna i `dist/` och kör `npm start`. De läsbara källfilerna används direkt. `SPELA.html` är en färdig, paketerad ögonblicksbild och ändras inte automatiskt när källfilerna ändras.

Kör simuleringstester med `npm test`. Spelets fysik körs med fasta steg på 120 Hz; renderingen följer skärmens bildfrekvens.

För att paketera om en ändrad version till en enda fil:

```sh
npm exec --package=esbuild@0.25.10 -- node build-standalone.mjs
```

Det kommandot hämtar esbuild från npm. Det behövs bara för att bygga om filen, aldrig för att spela.

Three.js distribueras under MIT-licensen. Fulltext finns i `dist/vendor/THREE-LICENSE.txt`.
