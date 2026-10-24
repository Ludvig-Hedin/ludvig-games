# Regressionstester

Kör från projektets rot med Node.js. Testerna är verifierade med Node 24 och använder bara inbyggda moduler. Du behöver inte installera några paket.

```sh
node tests/runner-model.test.mjs
node tests/runner-lifecycle.test.mjs
```

## Spelregler och fysik

`runner-model.test.mjs` kontrollerar tidssteg och nedräkning vid olika bildfrekvenser, paus, körfältsbyten, hopp, hela kollisionsintervallet, missade hjärtan, kombopoäng och reproducerbara banor. Alla tolv hästarnas banor spelas med enkla styrkommandon vid både 60 och 15 bilder per sekund för att kontrollera att målet går att nå utan kollisioner.

## Inmatning och livscykel

`runner-lifecycle.test.mjs` kör den verkliga spelkontrollen och fysiken med en ersättning för grafiken och webbläsarens händelser. Testerna fångar rekursiva pausmeddelanden, dubbla animationsloopar, resurser som blir kvar efter en omstart, mellanslag på knappar, upprepade tangenter, avbrutna pekgester, paus när fliken döljs och städning när en runda avslutas.

Grafiskt utseende, verklig WebGL-prestanda och layout i webbläsaren behöver fortfarande kontrolleras visuellt. Dessa tester verifierar spelregler och livscykel utan att kräva en grafikdrivrutin.
