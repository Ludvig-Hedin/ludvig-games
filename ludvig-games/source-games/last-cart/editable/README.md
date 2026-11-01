# LAST CART

Kundvagnar. Ett stormarknadstak. Åtta deltagare. Sista vagnen kvar vinner.

Ett browser-spel i Three.js med drift, boost, kollisioner, krympande säker zon och korta matcher. Spela solo mot sju botar eller två personer på samma dator mot varandra och sex botar.

## Starta spelet

1. Packa upp hela ZIP-filen. Behåll filerna och mapparna tillsammans.
2. Dubbelklicka på **STARTA-SPELET.html**.
3. Välj spelläge och tryck **SPELA**.

Startfilen öppnar `dist/index.html`. Alla spelresurser finns i paketet. Du behöver ingen server, installation eller internetanslutning för att spela. Använd en webbläsare med WebGL 2 och aktiverad grafikacceleration. Ljudet startar efter din första knapptryckning i spelet.

## Spellägen

| Läge | Så fungerar det |
| --- | --- |
| Solo | Du mot sju botar. Välj arena och svårighetsgrad. |
| Lokalt 2P | Två spelare delar skärm och spelar mot varandra och sex botar. Använd tangentbord, handkontroller eller en kombination. |
| Dagens bana | Ett fast startläge, en vald arena och högre svårighetsgrad för dagens datum i Stockholm. Försök förbättra ditt eget resultat. |

**Online-multiplayer ingår inte.** Kompisläget är lokalt på samma dator. Det finns ingen server, lobby, matchmaking eller global topplista.

Tre arenor ingår: **Rooftop Riot**, **Night Shift** och **Loading Zone**. Varje arena har sin egen placering av hinder och pickups.

## Kontroller

| Handling | Spelare 1 | Spelare 2 |
| --- | --- | --- |
| Kör | W, A, S, D | Piltangenterna |
| Boost | Mellanslag eller E | Enter eller Numpad 0 |
| Drift | Vänster Shift eller Q | Höger Shift eller Slash-tangenten |
| Paus | Esc | Esc |

Styrningen följer skärmen: upp kör bort från dig, höger kör åt höger. I solo fungerar även piltangenterna. Boost kräver ett nytt knapptryck efter att du har släppt knappen.

**Handkontroll:** vänster spak eller styrkors kör. A boostar och B driftar på en kontroll med standardmappning. Höger avtryckare fungerar också för boost, vänster för drift. I lokalt läge styr den första anslutna kontrollen spelare 1 och den andra spelare 2. Knappnamnen kan skilja sig mellan kontroller.

**Touch:** solo har en virtuell styrspak och knappar för boost och drift. På mindre skärmar ryms arenan bättre i liggande läge. Två spelare på en pekskärm stöds inte.

## Så vinner du

- Knuffa andra vagnar över takets kant. Botarna följer samma rörelse- och kollisionsregler som spelarna.
- Bygg fart innan du träffar. Fler smällar ger mer wobble och gör en vagn lättare att knuffa iväg.
- Håll drift medan du svänger. En tillräckligt laddad drift ger extra skjuts när du släpper.
- Samla boost och sköldar. En sköld minskar effekten av smällar under en begränsad tid.
- Håll dig innanför säkerhetsringen när den börjar krympa. Utsidan blir allt svårare att överleva.
- Räkna med kaoshändelser: halt tak, extra turbo eller sidvind.

Sista vagnen kvar vinner. En match som når tidsgränsen avgörs av utslagningar, wobble och avstånd till mitten. Tryck **REVANSCH** efter resultatet för att börja nästa match.

## XP, färger och dagens rekord

Matcher ger XP. Fem vagnfärger finns från början; ytterligare tre låses upp vid **250**, **750** och **1 500 XP**. Färgerna är kosmetiska och ändrar inte vagnens egenskaper.

XP, vinster, inställningar och personliga dagsrekord sparas i webbläsarens lokala lagring när den är tillgänglig. Sparningen är knuten till webbläsaren och platsen där spelet öppnas. Den följer inte automatiskt med till en annan dator eller webbläsare.

Dagens bana utgår från datumet i tidszonen `Europe/Stockholm`. Samma datum ger samma startläge och slumpsekvens; dina handlingar påverkar fortfarande matchen. De senaste 14 dagarnas personliga rekord sparas. **Kopiera resultat** skapar text att dela, men laddar inte upp någon poäng till en topplista.

## Inställningar och paus

Justera musik och ljudeffekter separat. Välj hög, mellan eller låg grafikkvalitet och slå av kameraskakningar om du föredrar det. Låg kvalitet stänger av dynamiska skuggor. På svagare hårdvara kan spelet automatiskt sänka hög kvalitet till mellan.

Esc eller pausknappen pausar matchen. Spelet pausar också när fönstret tappar fokus eller fliken döljs. Ljudet tystnar under paus och i bakgrunden. Välj **Fortsätt** när du återvänder.

## Ändra och bygg vidare

Den färdigbyggda versionen ligger i `dist/`. Källkoden ligger i `src/`.

Installera Node.js 20 eller senare för utveckling. Kör följande i projektmappen:

```sh
npm install
npm run build
npm test
```

`npm run build` skapar en fristående JavaScript-bundle och kopierar HTML och CSS till `dist/`. Publicera **innehållet i `dist/`** hos valfri statisk webbhost för att ge spelet en webbadress. Någon backend behövs inte.

| Fil | Ansvar |
| --- | --- |
| `src/main.js` | Input, menyer, matchflöde, sparning och inställningar. |
| `src/simulation.js` | Fysik, botar, regler, arenor och slumpsekvens. |
| `src/scene.js` | Three.js-scen, vagnar, miljö, kamera och effekter. |
| `src/audio.js` | Procedurgenererade ljudeffekter och musik. |
| `src/index.html`, `src/style.css` | Gränssnitt och layout. |
| `tests/` | Automatiska tester. |

## Verifiering och praktiska gränser

Alla 22 automatiska kontroller passerade vid bygget: 12 simulationstester och 10 integrationstester. Simulationstesterna täcker bland annat säkra startpositioner, separat styrning för två spelare, boost, drift, pickups, utslagning, sköldar, reproducerbar slump och att matcherna avslutas. Integrationstesterna kör spelets riktiga huvudkod och HTML med simulerad grafik och ljud, och täcker menyer, tangentbord, paus, resultat, revansch, dagsrekord och sparning. `npm test` kör båda testfilerna.

Testwebbläsaren saknade stöd för WebGL, så grafikens slutliga utseende och prestanda har inte verifierats där. Alla tre arenors geometri kunde byggas och kontrolleras separat, inklusive kamerans inramning och återställning mellan matcher. Ljuduppspelning, touch och fysiska handkontroller har inte testats på riktiga enheter. Automatiska tester av regler och DOM-interaktioner ersätter inte de kontrollerna.

## Licens

Originalkoden delas under MIT-licensen. Du får ändra, distribuera och bygga vidare på den enligt villkoren i **LICENSES.txt**. Där finns också fullständiga licenstexter för Three.js och utvecklingsverktygen. Paketet ger inga rättigheter till tredje parts varumärken.
