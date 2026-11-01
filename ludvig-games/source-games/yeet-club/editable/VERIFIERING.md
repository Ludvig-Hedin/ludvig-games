# Verifiering av YEET CLUB

## Kontrollerat

- **19 automatiserade tester passerar:** 13 för simuleringen och 6 för spelflödet.
- JavaScript-filerna passerar syntaxkontroll.
- Simuleringstester täcker deterministiska banor, styrning, boost, tidtagning, ramper, luftfärd, trick, landningar, kollisioner i hög fart, odödlighet efter träff, mynt och oberoende spelare.
- Båda spelarnas delar av banan behålls även när avståndet mellan dem blir stort.
- Scenobjekt kan skapas och återanvändas utan icke-numeriska koordinater.
- Geometrier och material som ägs av vagnar och banobjekt frigörs vid omstarter och när de lämnar banan. Delade resurser bevaras.
- HTML-kontroller och JavaScript-referenser stämmer överens.
- Start, nedräkning, paus, återupptagning, resultat, sparande, omstart, delad skärm, utmaningskoder, pekkontroller och rekordspöken har testats genom den faktiska spelkoden med ersättare för DOM, ljud och GPU-renderare.
- Spökets position interpoleras mellan sparade tidpunkter; samma bana och inmatning ger samma resultat vid återspelning.
- Kamerautsnitt och modellplacering har inspekterats med projektion av den faktiska 3D-geometrin. Det verifierar inte den slutliga WebGL-bilden.

## Begränsning

Testmiljöns webbläsare rapporterade **GL_RENDERER = Disabled** och kunde inte skapa en WebGL-kontext. Därför har den färdiga GPU-renderingen, bildfrekvensen och känslan vid mänskligt spel inte verifierats i denna miljö. Felvyn för saknat WebGL visades korrekt.

Kod- och simuleringstester ersätter inte ett speltest på en fysisk dator. Ingen specifik FPS-nivå eller kompatibilitet med alla enheter utlovas.

Ljudmotorn använder Web Audio och börjar först efter en spelarinteraktion. Ljudet har inte bedömts genom lyssning här.

## Omfattning

Multiplayer är två spelare på samma dator med delad skärm. YEET-koder låter spelare jämföra resultat på samma bana vid olika tillfällen. Det finns ingen serverbaserad onlinemultiplayer, kontosynk eller global topplista.
