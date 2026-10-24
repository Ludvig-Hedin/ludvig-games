/* SIX CLUES: country data plus the pure puzzle, matching and scoring logic.
   Loaded by index.html and by tests/check.mjs (node vm). No DOM access here. */
(function (root) {
  'use strict';

  // [iso2, English, Swedish, aliases (|), region, population (millions), capital EN, capital SV ('' = same),
  //  neighbours (space separated, partial lists, land borders only),
  //  fact EN, fact SV, food EN, food SV, sight EN, sight SV, flag EN, flag SV]
  const RAW = [
    // Northern Europe
    ["se","Sweden","Sverige","","neu",10.6,"Stockholm","","no fi",
      "Every winter a hotel is rebuilt here from blocks of river ice, above the Arctic Circle.","Varje vinter byggs ett hotell här av isblock från älven, ovanför polcirkeln.",
      "Meatballs with lingonberry jam, cream sauce and potatoes.","Köttbullar med lingonsylt, gräddsås och potatis.",
      "The Vasa, a 17th-century warship that sank on its maiden voyage, now in a museum.","Vasaskeppet, ett regalskepp från 1600-talet som sjönk på sin jungfrufärd, nu på museum.",
      "A yellow Nordic cross on a blue field.","Ett gult nordiskt kors på blå botten."],
    ["no","Norway","Norge","","neu",5.6,"Oslo","","se fi ru",
      "The Nobel Peace Prize is presented in its capital every December.","Nobels fredspris delas ut i huvudstaden varje december.",
      "Brunost, a sweet brown cheese, and fårikål, a lamb and cabbage stew.","Brunost, en söt brun ost, och fårikål, en gryta på lamm och kål.",
      "Preikestolen (Pulpit Rock), a flat cliff about 600 m above a fjord.","Preikestolen (Predikstolen), en platt klippa omkring 600 meter över en fjord.",
      "A blue Nordic cross outlined in white on a red field.","Ett blått nordiskt kors med vit kant på röd botten."],
    ["dk","Denmark","Danmark","","neu",6.0,"Copenhagen","Köpenhamn","de",
      "The LEGO toy company was founded here in 1932.","Leksaksföretaget LEGO grundades här 1932.",
      "Smørrebrød, open sandwiches on dark rye bread.","Smørrebrød, smörgåsar utan överbröd på mörkt rågbröd.",
      "The Little Mermaid statue by the harbour of its capital.","Statyn Den lilla sjöjungfrun vid hamnen i huvudstaden.",
      "A white Nordic cross on a red field.","Ett vitt nordiskt kors på röd botten."],
    ["fi","Finland","Finland","suomi","neu",5.6,"Helsinki","","se no ru",
      "It's called the land of a thousand lakes, but it has nearly 188,000 of them.","Det kallas de tusen sjöarnas land, men har nästan 188 000 sjöar.",
      "Karelian pies: thin rye crusts filled with rice porridge.","Karelska piroger: tunna rågskal fyllda med risgrynsgröt.",
      "Santa Claus Village on the Arctic Circle near Rovaniemi.","Tomtebyn på polcirkeln vid Rovaniemi.",
      "A blue Nordic cross on a white field.","Ett blått nordiskt kors på vit botten."],
    ["is","Iceland","Island","","neu",0.39,"Reykjavik","","",
      "Its parliament, the Althing, was founded in 930 and is one of the oldest in the world.","Dess parlament, Alltinget, grundades år 930 och är ett av världens äldsta.",
      "Skyr, a thick cultured dairy food, and fermented shark.","Skyr, en tjock syrad mejeriprodukt, och fermenterad haj.",
      "The Blue Lagoon geothermal spa and the geysers of the Golden Circle.","Den geotermiska Blå lagunen och gejsrarna längs Gyllene cirkeln.",
      "A red Nordic cross outlined in white on a blue field.","Ett rött nordiskt kors med vit kant på blå botten."],
    ["ie","Ireland","Irland","eire|republic of ireland","neu",5.3,"Dublin","","gb",
      "Halloween grew out of Samhain, an ancient Gaelic festival celebrated here.","Halloween växte fram ur samhain, en gammal gaelisk högtid som firades här.",
      "Soda bread and a hearty lamb stew.","Sodabröd och en mustig lammgryta.",
      "The Cliffs of Moher on the Atlantic coast.","Klipporna Cliffs of Moher vid Atlantkusten.",
      "Three vertical stripes: green, white and orange.","Tre lodräta fält: grönt, vitt och orange."],
    ["gb","United Kingdom","Storbritannien","uk|u k|great britain|britain|england|scotland|wales|northern ireland|forenade kungariket|skottland","neu",68,"London","","ie",
      "The world's first underground railway opened in its capital in 1863.","Världens första tunnelbana öppnade i huvudstaden 1863.",
      "Fish and chips, and a full breakfast with beans on toast.","Fish and chips och en rejäl frukost med vita bönor i tomatsås.",
      "Stonehenge, a prehistoric ring of standing stones.","Stonehenge, en förhistorisk ring av resta stenar.",
      "A blue field with red and white crosses and diagonal crosses layered together.","Blå botten med röda och vita kors och diagonalkors lagda över varandra."],
    ["ee","Estonia","Estland","eesti","neu",1.37,"Tallinn","","lv ru",
      "Skype was first developed here by local engineers.","Skype utvecklades från början här av lokala ingenjörer.",
      "Dark rye bread, and kama, a flour of roasted grains mixed with buttermilk.","Mörkt rågbröd och kama, mjöl av rostade sädesslag som blandas med filmjölk.",
      "The medieval old town of its capital, with city walls and towers.","Den medeltida gamla staden i huvudstaden, med stadsmurar och torn.",
      "Three horizontal stripes: blue, black and white.","Tre vågräta fält: blått, svart och vitt."],
    ["lv","Latvia","Lettland","latvija","neu",1.86,"Riga","","ee lt by ru",
      "Its capital has one of Europe's largest collections of Art Nouveau buildings.","Huvudstaden har en av Europas största samlingar av jugendhus.",
      "Grey peas with bacon, and dark rye bread.","Gråärtor med fläsk och mörkt rågbröd.",
      "The House of the Blackheads, a richly decorated guild hall in the capital's old town.","Svarthuvudenas hus, ett rikt utsmyckat gillehus i huvudstadens gamla stad.",
      "Dark red with a thin white horizontal stripe across the middle.","Mörkrött med ett smalt vitt vågrätt band över mitten."],
    ["lt","Lithuania","Litauen","lietuva","neu",2.9,"Vilnius","","lv by pl ru",
      "Basketball is so loved here that it is often called the second religion.","Basket är så älskat här att det ofta kallas den andra religionen.",
      "Cepelinai, large potato dumplings stuffed with meat.","Cepelinai, stora potatisdumplingar fyllda med kött.",
      "The Hill of Crosses, covered with many thousands of crosses.","Korsens kulle, täckt av tusentals kors.",
      "Three horizontal stripes: yellow, green and red.","Tre vågräta fält: gult, grönt och rött."],

    // Western Europe
    ["fr","France","Frankrike","","weu",68,"Paris","","be de es it ch",
      "It is the most visited country in the world by international tourists.","Det är världens mest besökta land av utländska turister.",
      "Croissants, baguettes and hundreds of kinds of cheese.","Croissanter, baguetter och hundratals sorters ost.",
      "An iron lattice tower built for the 1889 World's Fair.","Ett järntorn i fackverk byggt till världsutställningen 1889.",
      "Three vertical stripes: blue, white and red.","Tre lodräta fält: blått, vitt och rött."],
    ["de","Germany","Tyskland","deutschland","weu",84,"Berlin","","dk pl fr at",
      "Its motorway network is famous for stretches with no general speed limit.","Motorvägsnätet är känt för sträckor utan generell hastighetsgräns.",
      "Pretzels, bratwurst and sauerkraut.","Kringlor (pretzels), bratwurst och surkål.",
      "The Brandenburg Gate and the fairy-tale castle of Neuschwanstein.","Brandenburger Tor och sagoslottet Neuschwanstein.",
      "Three horizontal stripes: black, red and gold.","Tre vågräta fält: svart, rött och guld."],
    ["nl","Netherlands","Nederländerna","holland|the netherlands|nederland","weu",18.0,"Amsterdam","","be de",
      "About a quarter of the country lies below sea level.","Ungefär en fjärdedel av landet ligger under havsytan.",
      "Stroopwafels, raw herring and Gouda cheese.","Stroopwafels, sill och goudaost.",
      "The windmills of Kinderdijk and canals lined with narrow houses.","Väderkvarnarna i Kinderdijk och kanaler kantade av smala hus.",
      "Three horizontal stripes: red, white and blue.","Tre vågräta fält: rött, vitt och blått."],
    ["be","Belgium","Belgien","","weu",11.8,"Brussels","Bryssel","fr nl de lu",
      "It has three official languages: Dutch, French and German.","Har tre officiella språk: nederländska, franska och tyska.",
      "Waffles, chocolate and fries served with mayonnaise.","Våfflor, choklad och pommes frites med majonnäs.",
      "The Atomium, a giant model of an iron crystal built for the 1958 World's Fair.","Atomium, en jättelik modell av en järnkristall byggd till världsutställningen 1958.",
      "Three vertical stripes: black, yellow and red.","Tre lodräta fält: svart, gult och rött."],
    ["lu","Luxembourg","Luxemburg","","weu",0.67,"Luxembourg","Luxemburg","be fr de",
      "It is the world's only remaining grand duchy.","Det är världens enda kvarvarande storhertigdöme.",
      "Judd mat Gaardebounen: smoked pork collar with broad beans.","Judd mat Gaardebounen: rökt fläskkarré med bondbönor.",
      "The Bock Casemates, tunnels carved into the rock beneath the capital.","Bockkasematterna, tunnlar uthuggna i berget under huvudstaden.",
      "Three horizontal stripes: red, white and light blue.","Tre vågräta fält: rött, vitt och ljusblått."],
    ["ch","Switzerland","Schweiz","suisse|schweiz|svizzera","weu",9.0,"Bern","","fr de it at",
      "It has four national languages, one of them Romansh.","Har fyra nationella språk, ett av dem rätoromanska.",
      "Cheese fondue and raclette.","Ostfondue och raclette.",
      "The Matterhorn, a pyramid-shaped Alpine peak.","Matterhorn, en pyramidformad alptopp.",
      "A white cross on a red square.","Ett vitt kors på en röd kvadrat."],
    ["at","Austria","Österrike","osterreich","weu",9.2,"Vienna","Wien","de it ch hu",
      "The world's oldest zoo still in operation opened in its capital in 1752.","Världens äldsta djurpark som fortfarande är öppen öppnade i huvudstaden 1752.",
      "Wiener schnitzel and apple strudel.","Wienerschnitzel och äppelstrudel.",
      "Schönbrunn Palace, the former summer residence of the Habsburgs.","Schönbrunns slott, habsburgarnas tidigare sommarresidens.",
      "Three horizontal stripes: red, white and red.","Tre vågräta fält: rött, vitt och rött."],
    ["li","Liechtenstein","Liechtenstein","","weu",0.04,"Vaduz","","ch at",
      "It abolished its army in 1868.","Landet avskaffade sin armé 1868.",
      "Käsknöpfle, small dumplings with cheese and fried onions.","Käsknöpfle, små klimpar med ost och stekt lök.",
      "A hilltop castle above the capital where the reigning prince lives.","Ett slott på en höjd ovanför huvudstaden där den regerande fursten bor.",
      "Blue over red, with a gold crown in the upper corner.","Blått över rött, med en guldkrona i det övre hörnet."],
    ["mc","Monaco","Monaco","","weu",0.038,"","","fr",
      "It is the second-smallest country in the world.","Det är världens näst minsta land.",
      "Barbagiuan, fried pastries filled with chard and ricotta.","Barbagiuan, friterade piroger fyllda med mangold och ricotta.",
      "A famous casino in Monte Carlo and a Formula 1 race on its streets.","Ett berömt kasino i Monte Carlo och ett Formel 1-lopp på gatorna.",
      "Two horizontal stripes, red over white.","Två vågräta fält, rött över vitt."],

    // Southern Europe
    ["es","Spain","Spanien","espana","seu",48,"Madrid","","pt fr ad",
      "Every August a town here holds a giant tomato fight, La Tomatina.","Varje augusti har en stad här ett jättelikt tomatkrig, La Tomatina.",
      "Paella and tapas.","Paella och tapas.",
      "The Sagrada Família basilica, under construction since 1882.","Basilikan Sagrada Família, som har byggts sedan 1882.",
      "Red, yellow and red horizontal stripes, the yellow twice as wide, with a coat of arms.","Vågräta fält i rött, gult och rött där det gula är dubbelt så brett, med ett vapen."],
    ["pt","Portugal","Portugal","","seu",10.6,"Lisbon","Lissabon","es",
      "It produces about half of the world's cork.","Landet producerar ungefär hälften av världens kork.",
      "Pastel de nata custard tarts and salted cod (bacalhau).","Pastel de nata (äggkrämsbakelser) och saltad torsk (bacalhau).",
      "Belém Tower on the Tagus river.","Belémtornet vid floden Tejo.",
      "Green and red vertical sections with a coat of arms on an armillary sphere.","Ett grönt och ett rött lodrätt fält med ett vapen på en armillarsfär."],
    ["it","Italy","Italien","italia","seu",59,"Rome","Rom","fr ch at si",
      "Two independent countries lie entirely within its borders.","Två självständiga länder ligger helt inom dess gränser.",
      "Pizza, pasta and gelato.","Pizza, pasta och gelato.",
      "The Colosseum, an ancient amphitheatre.","Colosseum, en antik amfiteater.",
      "Three vertical stripes: green, white and red.","Tre lodräta fält: grönt, vitt och rött."],
    ["gr","Greece","Grekland","hellas","seu",10.4,"Athens","Aten","al mk bg tr",
      "It has thousands of islands, but only around 200 of them are inhabited.","Landet har tusentals öar, men bara omkring 200 av dem är bebodda.",
      "Moussaka, souvlaki and feta cheese.","Moussaka, souvlaki och fetaost.",
      "The Parthenon on the Acropolis.","Parthenon på Akropolis.",
      "Nine blue and white horizontal stripes with a white cross on a blue square.","Nio blå och vita vågräta ränder med ett vitt kors på en blå kvadrat."],
    ["mt","Malta","Malta","","seu",0.55,"Valletta","","",
      "Its language is the only Semitic language that is official in the EU.","Dess språk är det enda semitiska språket som är officiellt i EU.",
      "Pastizzi, flaky pastries filled with ricotta or peas.","Pastizzi, frasiga bakverk fyllda med ricotta eller ärtor.",
      "Megalithic temples that are older than the pyramids of Giza.","Megalittempel som är äldre än pyramiderna i Giza.",
      "Vertical white and red halves, with a George Cross in the upper corner.","Lodrätt delad i vitt och rött, med ett Georgskors i det övre hörnet."],
    ["ad","Andorra","Andorra","","seu",0.086,"Andorra la Vella","","es fr",
      "It has two co-princes: a bishop from across one border and the president of the other neighbour.","Landet har två medfurstar: en biskop från ena grannlandet och presidenten i det andra.",
      "Trinxat, a mash of cabbage, potato and pork.","Trinxat, en mos av kål, potatis och fläsk.",
      "Ski slopes high in the Pyrenees.","Skidbackar högt uppe i Pyrenéerna.",
      "Blue, yellow and red vertical stripes with a coat of arms in the centre.","Lodräta fält i blått, gult och rött med ett vapen i mitten."],
    ["sm","San Marino","San Marino","","seu",0.034,"","","it",
      "It claims to be the world's oldest republic, founded in the year 301.","Landet gör anspråk på att vara världens äldsta republik, grundad år 301.",
      "Torta Tre Monti, a layered wafer cake named after its three towers.","Torta Tre Monti, en rånkaka i lager uppkallad efter de tre tornen.",
      "Three towers on the peaks of Monte Titano.","Tre torn på topparna av Monte Titano.",
      "White over light blue, with a coat of arms.","Vitt över ljusblått, med ett vapen."],
    ["va","Vatican City","Vatikanstaten","vatican|holy see|vatikanen|heliga stolen","seu",0.0008,"","","it",
      "The world's smallest country, guarded by the Swiss Guard.","Världens minsta land, bevakat av Schweizergardet.",
      "It has no national dish; its few hundred residents eat the food of the city around it.","Det finns ingen nationalrätt; de några hundra invånarna äter maten i staden runt omkring.",
      "St. Peter's Basilica and the Sistine Chapel.","Peterskyrkan och Sixtinska kapellet.",
      "Square, split into yellow and white, with crossed keys and a papal tiara.","Kvadratisk, delad i gult och vitt, med korslagda nycklar och en påvekrona."],
    ["hr","Croatia","Kroatien","hrvatska","seu",3.9,"Zagreb","","si hu ba rs",
      "The necktie (cravat) is named after the scarves its soldiers wore in the 1600s.","Kravatten har fått sitt namn efter halsdukar som dess soldater bar på 1600-talet.",
      "Peka: meat or octopus slow-cooked under an iron bell.","Peka: kött eller bläckfisk som långkokas under en järnklocka.",
      "The city walls of Dubrovnik and the lakes of Plitvice.","Stadsmurarna i Dubrovnik och sjöarna i Plitvice.",
      "Red, white and blue horizontal stripes with a red-and-white checkered shield.","Vågräta fält i rött, vitt och blått med en röd- och vitrutig sköld."],
    ["si","Slovenia","Slovenien","slovenija","seu",2.1,"Ljubljana","","it at hu hr",
      "Around 60% of its land is forest, one of the highest shares in Europe.","Omkring 60 % av landet är skog, en av de högsta andelarna i Europa.",
      "Potica, a rolled nut cake, and Carniolan sausage.","Potica, en rullad nötkaka, och kranjska klobasa-korv.",
      "Lake Bled, with a church on a tiny island.","Bledsjön, med en kyrka på en liten ö.",
      "White, blue and red horizontal stripes with a shield showing Mount Triglav.","Vågräta fält i vitt, blått och rött med en sköld som visar berget Triglav."],
    ["ba","Bosnia and Herzegovina","Bosnien och Hercegovina","bosnia|bosnien|bosnia herzegovina|bih","seu",3.2,"Sarajevo","","hr rs me",
      "Its capital hosted the Winter Olympics in 1984.","Huvudstaden var värd för vinter-OS 1984.",
      "Ćevapi, small grilled meat rolls served in flatbread.","Ćevapi, små grillade köttrullar i tunnbröd.",
      "The Old Bridge in Mostar, an arched stone bridge rebuilt in 2004.","Gamla bron i Mostar, en välvd stenbro som återuppbyggdes 2004.",
      "Blue with a yellow triangle and a diagonal row of white stars.","Blå med en gul triangel och en diagonal rad vita stjärnor."],
    ["rs","Serbia","Serbien","srbija","seu",6.6,"Belgrade","Belgrad","hu ro bg hr ba me",
      "Its capital lies where the Sava river flows into the Danube.","Huvudstaden ligger där floden Sava rinner ut i Donau.",
      "Pljeskavica, a large spiced meat patty.","Pljeskavica, en stor kryddig köttbiff.",
      "The Church of Saint Sava, one of the largest Orthodox churches in the world.","Sankt Savakyrkan, en av världens största ortodoxa kyrkor.",
      "Red, blue and white horizontal stripes with a double-headed eagle coat of arms.","Vågräta fält i rött, blått och vitt med ett vapen med en dubbelhövdad örn."],
    ["me","Montenegro","Montenegro","crna gora","seu",0.62,"Podgorica","","hr ba rs al",
      "It uses the euro even though it is not a member of the EU.","Landet använder euro trots att det inte är med i EU.",
      "Njeguški pršut, a smoked dry-cured ham.","Njeguški pršut, en rökt lufttorkad skinka.",
      "The Bay of Kotor, a fjord-like bay ringed by mountains.","Kotorbukten, en fjordliknande vik omgiven av berg.",
      "Red with a gold border and a gold double-headed eagle.","Röd med guldkant och en dubbelhövdad örn i guld."],
    ["mk","North Macedonia","Nordmakedonien","macedonia|makedonien","seu",1.8,"Skopje","","rs bg gr al",
      "Mother Teresa was born in its capital.","Moder Teresa föddes i huvudstaden.",
      "Tavče gravče, baked beans in a clay pot.","Tavče gravče, ugnsbakade bönor i lergryta.",
      "Lake Ohrid, one of the oldest lakes in Europe.","Ohridsjön, en av Europas äldsta sjöar.",
      "A yellow sun with eight broadening rays on a red field.","En gul sol med åtta breda strålar på röd botten."],
    ["al","Albania","Albanien","shqiperia","seu",2.4,"Tirana","","me mk gr",
      "More than 100,000 concrete bunkers were built here during the communist era.","Fler än 100 000 betongbunkrar byggdes här under kommunisttiden.",
      "Tavë kosi, baked lamb and rice in a yogurt sauce.","Tavë kosi, ugnsbakat lamm och ris i yoghurtsås.",
      "Berat, the stone 'city of a thousand windows'.","Berat, stenstaden som kallas 'de tusen fönstrens stad'.",
      "A black double-headed eagle on a red field.","En svart dubbelhövdad örn på röd botten."],
    ["cy","Cyprus","Cypern","kypros","seu",1.0,"Nicosia","","",
      "Legend says the goddess Aphrodite was born from the sea off its coast.","Enligt legenden föddes gudinnan Afrodite ur havet utanför dess kust.",
      "Halloumi, a squeaky grilling cheese.","Halloumi, en gnisslande grillost.",
      "Painted Byzantine churches in the Troodos Mountains.","Målade bysantinska kyrkor i Troodosbergen.",
      "White with a copper-coloured map of the island above two olive branches.","Vit med en kopparfärgad karta över ön ovanför två olivkvistar."],

    // Eastern Europe
    ["pl","Poland","Polen","polska","eeu",37,"Warsaw","Warszawa","de cz sk ua by lt",
      "Marie Curie, the first person to win two Nobel Prizes, was born here.","Marie Curie, den första som fick två Nobelpris, föddes här.",
      "Pierogi, filled dumplings.","Pierogi, fyllda dumplingar.",
      "The Wieliczka Salt Mine, with chapels carved out of salt.","Saltgruvan i Wieliczka, med kapell uthuggna i salt.",
      "Two horizontal stripes, white over red.","Två vågräta fält, vitt över rött."],
    ["cz","Czechia","Tjeckien","czech republic|tjeckiska republiken|cesko","eeu",10.9,"Prague","Prag","de pl at sk",
      "The word 'robot' comes from a play by one of its writers.","Ordet 'robot' kommer från en pjäs av en av dess författare.",
      "Svíčková, beef in a creamy sauce with bread dumplings.","Svíčková, oxkött i gräddig sås med brödknödlar.",
      "The Charles Bridge and an astronomical clock from 1410 in the capital.","Karlsbron och ett astronomiskt ur från 1410 i huvudstaden.",
      "White over red, with a blue triangle at the hoist.","Vitt över rött, med en blå triangel vid stången."],
    ["sk","Slovakia","Slovakien","slovensko","eeu",5.4,"Bratislava","","cz pl hu at ua",
      "Its capital borders two other countries, Austria and Hungary.","Huvudstaden gränsar till två andra länder, Österrike och Ungern.",
      "Bryndzové halušky, potato dumplings with sheep's cheese.","Bryndzové halušky, potatisklimpar med fårost.",
      "The ruins of Spiš Castle, one of the largest castle sites in Central Europe.","Ruinerna av Spišslottet, en av Centraleuropas största borgar.",
      "White, blue and red horizontal stripes with a shield showing a double cross.","Vågräta fält i vitt, blått och rött med en sköld med ett dubbelkors."],
    ["hu","Hungary","Ungern","magyarorszag","eeu",9.6,"Budapest","","at sk ro rs hr si ua",
      "The Rubik's Cube was invented here in 1974.","Rubiks kub uppfanns här 1974.",
      "Goulash, a stew rich with paprika.","Gulasch, en gryta med mycket paprika.",
      "The Parliament building on the Danube in its capital.","Parlamentsbyggnaden vid Donau i huvudstaden.",
      "Three horizontal stripes: red, white and green.","Tre vågräta fält: rött, vitt och grönt."],
    ["ro","Romania","Rumänien","","eeu",19.0,"Bucharest","Bukarest","hu ua md bg rs",
      "Its Palace of the Parliament is one of the heaviest buildings in the world.","Dess parlamentspalats är en av världens tyngsta byggnader.",
      "Sarmale, stuffed cabbage rolls, with mămăligă (cornmeal porridge).","Sarmale, kåldolmar, med mămăligă (majsgröt).",
      "Bran Castle in Transylvania, linked to the Dracula legend.","Slottet Bran i Transsylvanien, förknippat med Draculalegenden.",
      "Three vertical stripes: blue, yellow and red.","Tre lodräta fält: blått, gult och rött."],
    ["bg","Bulgaria","Bulgarien","","eeu",6.4,"Sofia","","ro rs mk gr tr",
      "Nodding here traditionally means 'no', and shaking the head means 'yes'.","Här betyder en nick traditionellt 'nej' och att skaka på huvudet 'ja'.",
      "Shopska salad topped with white brine cheese, and yogurt.","Shopskasallad med riven vitost, och yoghurt.",
      "Rila Monastery in the mountains south of the capital.","Rilaklostret i bergen söder om huvudstaden.",
      "Three horizontal stripes: white, green and red.","Tre vågräta fält: vitt, grönt och rött."],
    ["md","Moldova","Moldavien","","eeu",2.4,"Chișinău","","ro ua",
      "Its wine cellar Mileștii Mici holds the world's largest wine collection, says Guinness.","Vinkällaren Mileștii Mici har världens största vinsamling enligt Guinness.",
      "Mămăligă (cornmeal porridge) with cheese and sour cream.","Mămăligă (majsgröt) med ost och gräddfil.",
      "Orheiul Vechi, a cave monastery carved into a cliff.","Orheiul Vechi, ett grottkloster uthugget i en klippa.",
      "Blue, yellow and red vertical stripes with an eagle coat of arms.","Lodräta fält i blått, gult och rött med ett vapen med en örn."],
    ["ua","Ukraine","Ukraina","","eeu",37,"Kyiv","","pl ro md sk hu by",
      "It is the largest country that lies entirely within Europe.","Det är det största landet som ligger helt i Europa.",
      "Borscht, a beetroot soup.","Borsjtj, en rödbetssoppa.",
      "Saint Sophia Cathedral in the capital, with golden domes.","Sofiakatedralen i huvudstaden, med gyllene kupoler.",
      "Two horizontal stripes, blue over yellow.","Två vågräta fält, blått över gult."],
    ["by","Belarus","Belarus","vitryssland","eeu",9.2,"Minsk","","pl lt lv ua",
      "Its Białowieża Forest is home to Europe's heaviest land animal, the wisent.","Białowieżaskogen är hem för Europas tyngsta landdjur, visenten.",
      "Draniki, crispy potato pancakes.","Draniki, krispiga raggmunkar.",
      "Mir Castle, a red-brick fortress from the 1500s.","Mirslottet, en borg i rött tegel från 1500-talet.",
      "Red over green, with a red-and-white ornamental pattern at the hoist.","Rött över grönt, med ett rött och vitt ornamentmönster vid stången."],
    ["ru","Russia","Ryssland","russian federation|ryska federationen","eeu",144,"Moscow","Moskva","fi cn mn no ee kz",
      "Its mainland stretches across 11 time zones.","Fastlandet sträcker sig över 11 tidszoner.",
      "Pelmeni dumplings and blini pancakes.","Pelmeni (dumplingar) och blinier.",
      "St. Basil's Cathedral with its colourful onion domes.","Vasilijkatedralen med sina färgglada lökkupoler.",
      "Three horizontal stripes: white, blue and red.","Tre vågräta fält: vitt, blått och rött."],

    // Caucasus
    ["ge","Georgia","Georgien","sakartvelo","cau",3.7,"Tbilisi","","tr am az ru",
      "Archaeologists found traces of winemaking here about 8,000 years old.","Arkeologer har hittat spår av vinframställning här som är omkring 8 000 år gamla.",
      "Khachapuri, cheese-filled bread often topped with an egg.","Chatjapuri, ostfyllt bröd som ofta toppas med ett ägg.",
      "Gergeti Trinity Church, high up below Mount Kazbek.","Gergetis treenighetskyrka, högt uppe under berget Kazbek.",
      "White with a large red cross and four small red crosses.","Vit med ett stort rött kors och fyra små röda kors."],
    ["am","Armenia","Armenien","hayastan","cau",3.0,"Yerevan","Jerevan","ge ir tr",
      "It was the first country to adopt Christianity as a state religion, in the early 300s.","Det var det första landet som antog kristendomen som statsreligion, i början av 300-talet.",
      "Lavash, a thin flatbread baked in a clay oven.","Lavash, ett tunt tunnbröd som bakas i lerugn.",
      "Khor Virap monastery with Mount Ararat in the background.","Klostret Khor Virap med berget Ararat i bakgrunden.",
      "Three horizontal stripes: red, blue and orange.","Tre vågräta fält: rött, blått och orange."],
    ["az","Azerbaijan","Azerbajdzjan","azerbajdzjan|azerbaidjan","cau",10.2,"Baku","","ge ir ru",
      "Natural gas has been burning on a hillside here for decades, at Yanar Dag.","Naturgas har brunnit på en sluttning här i årtionden, vid Yanar Dag.",
      "Plov, saffron rice with meat and dried fruit.","Plov, saffransris med kött och torkad frukt.",
      "The Flame Towers, three flame-shaped skyscrapers in the capital.","Flame Towers, tre flamformade skyskrapor i huvudstaden.",
      "Blue, red and green horizontal stripes with a white crescent and an eight-pointed star.","Vågräta fält i blått, rött och grönt med en vit halvmåne och en åttauddig stjärna."],

    // Middle East
    ["tr","Turkey","Turkiet","turkiye|türkiye","wa",85,"Ankara","","gr bg ge ir sy iq",
      "Saint Nicholas, who inspired Santa Claus, was a bishop in a town here.","Sankt Nikolaus, förebilden för jultomten, var biskop i en stad här.",
      "Kebabs, baklava and strong coffee.","Kebab, baklava och starkt kaffe.",
      "Hagia Sophia and the 'fairy chimneys' of Cappadocia.","Hagia Sofia och 'älvskorstenarna' i Kappadokien.",
      "A white crescent and star on a red field.","En vit halvmåne och stjärna på röd botten."],
    ["il","Israel","Israel","","wa",9.9,"","","eg jo lb",
      "It borders the Dead Sea, the lowest point on land.","Landet gränsar till Döda havet, den lägsta punkten på land.",
      "Falafel in pita bread, and shakshuka (eggs poached in tomato sauce).","Falafel i pitabröd och shakshuka (ägg i tomatsås).",
      "Masada, a desert fortress on a clifftop.","Masada, en ökenfästning på en klipptopp.",
      "White with two horizontal blue stripes and a blue Star of David.","Vit med två vågräta blå ränder och en blå Davidsstjärna."],
    ["lb","Lebanon","Libanon","","wa",5.4,"Beirut","","sy il",
      "You can ski in its mountains and swim in the Mediterranean on the same day.","Här kan man åka skidor i bergen och bada i Medelhavet samma dag.",
      "Tabbouleh, a parsley and bulgur salad, and mezze.","Tabbouleh, en sallad med persilja och bulgur, och meze.",
      "The Roman temples of Baalbek.","De romerska templen i Baalbek.",
      "Red, white and red horizontal stripes with a green cedar tree.","Vågräta fält i rött, vitt och rött med en grön ceder."],
    ["sy","Syria","Syrien","","wa",23,"Damascus","Damaskus","tr iq jo lb",
      "Its capital is often called one of the oldest continuously inhabited cities in the world.","Huvudstaden kallas ofta en av världens äldsta ständigt bebodda städer.",
      "Kibbeh, fried croquettes of bulgur and minced meat.","Kibbeh, friterade kroketter av bulgur och köttfärs.",
      "The ancient ruins of Palmyra and the castle Krak des Chevaliers.","De antika ruinerna i Palmyra och borgen Krak des Chevaliers.",
      "Green, white and black horizontal stripes with three red stars.","Vågräta fält i grönt, vitt och svart med tre röda stjärnor."],
    ["jo","Jordan","Jordanien","","wa",11.4,"Amman","","sa iq sy il",
      "Scenes for several films set on Mars were shot in its Wadi Rum desert.","Scener till flera filmer som utspelar sig på Mars spelades in i öknen Wadi Rum här.",
      "Mansaf, lamb cooked in fermented yogurt, served over rice.","Mansaf, lamm kokt i syrad yoghurt, serverat på ris.",
      "Petra, a city carved into rose-red cliffs.","Petra, en stad uthuggen i rosaröda klippor.",
      "Black, white and green stripes with a red triangle holding a white seven-pointed star.","Svart, vitt och grönt med en röd triangel med en vit sjuuddig stjärna."],
    ["iq","Iraq","Irak","","wa",45,"Baghdad","Bagdad","tr ir sy jo sa kw",
      "Writing first developed in ancient Mesopotamia here, in cities like Uruk.","Skriften utvecklades först i det forntida Mesopotamien här, i städer som Uruk.",
      "Masgouf, carp split open and grilled beside an open fire.","Masgouf, karp som delas och grillas vid öppen eld.",
      "The ziggurat of Ur, a stepped temple from ancient Sumer.","Ziggurat i Ur, ett trappstegstempel från det forntida Sumer.",
      "Red, white and black horizontal stripes with green Arabic script.","Vågräta fält i rött, vitt och svart med grön arabisk skrift."],
    ["ir","Iran","Iran","persia|persien","wa",90,"Tehran","Teheran","tr iq af pk tm",
      "Its New Year, Nowruz, begins at the spring equinox.","Dess nyår, nowruz, börjar vid vårdagjämningen.",
      "Saffron rice with a crispy crust (tahdig) and kebabs.","Saffransris med krispig botten (tahdig) och kebab.",
      "The ruins of Persepolis and the great square of Isfahan.","Ruinerna av Persepolis och det stora torget i Isfahan.",
      "Green, white and red horizontal stripes with a red emblem in the centre.","Vågräta fält i grönt, vitt och rött med ett rött emblem i mitten."],
    ["sa","Saudi Arabia","Saudiarabien","saudi|ksa","wa",35,"Riyadh","","jo iq ye om ae qa kw",
      "It has no permanent rivers.","Landet har inga permanenta floder.",
      "Kabsa, spiced rice with chicken or lamb.","Kabsa, kryddat ris med kyckling eller lamm.",
      "The rock-cut tombs of Hegra near AlUla.","Klippgravarna i Hegra vid AlUla.",
      "Green with white Arabic script and a sword.","Grön med vit arabisk skrift och ett svärd."],
    ["ye","Yemen","Jemen","","wa",34,"Sanaa","","sa om",
      "Mocha coffee is named after its Red Sea port of Mokha.","Mockakaffe har fått sitt namn efter hamnstaden Mokha vid Röda havet.",
      "Saltah, a bubbling meat stew topped with fenugreek froth.","Saltah, en puttrande köttgryta toppad med skum av bockhornsklöver.",
      "Shibam, the 'Manhattan of the desert', with mud-brick tower houses.","Shibam, 'öknens Manhattan', med tornhus av lertegel.",
      "Three horizontal stripes: red, white and black.","Tre vågräta fält: rött, vitt och svart."],
    ["om","Oman","Oman","","wa",5.2,"Muscat","Muskat","ae sa ye",
      "Frankincense trees have been harvested here for thousands of years.","Rökelseträd har skördats här i tusentals år.",
      "Shuwa, lamb slow-cooked in an underground pit.","Shuwa, lamm som tillagas långsamt i en grop i marken.",
      "The Sultan Qaboos Grand Mosque in the capital.","Sultan Qaboos stora moské i huvudstaden.",
      "White, red and green horizontal bands, a red vertical band and an emblem of swords and a dagger.","Vågräta band i vitt, rött och grönt, ett rött lodrätt band och ett emblem med svärd och en dolk."],
    ["ae","United Arab Emirates","Förenade Arabemiraten","uae|u a e|emirates|emiraten|arabemiraten","wa",10,"Abu Dhabi","","sa om",
      "Its largest city has an indoor ski slope inside a shopping mall.","Den största staden har en skidbacke inomhus i ett köpcentrum.",
      "Luqaimat, sweet fried dumplings drizzled with date syrup.","Luqaimat, söta friterade bollar med dadelsirap.",
      "The Burj Khalifa, the tallest building in the world.","Burj Khalifa, världens högsta byggnad.",
      "Green, white and black horizontal stripes with a red vertical band at the hoist.","Vågräta fält i grönt, vitt och svart med ett rött lodrätt band vid stången."],
    ["qa","Qatar","Qatar","katar","wa",2.7,"Doha","","sa",
      "It hosted the first football World Cup held in the Middle East, in 2022.","Landet var värd för det första fotbolls-VM i Mellanöstern, 2022.",
      "Machboos, spiced rice with meat.","Machboos, kryddat ris med kött.",
      "The Museum of Islamic Art on the capital's waterfront.","Museet för islamisk konst vid huvudstadens strand.",
      "Maroon with a white serrated band at the hoist.","Vinröd med ett vitt sågtandat band vid stången."],
    ["bh","Bahrain","Bahrain","","wa",1.6,"Manama","","",
      "It is a group of islands linked to its large neighbour by a 25 km causeway.","Det är en ögrupp som förbinds med sitt stora grannland via en 25 km lång bro.",
      "Halwa, a sticky sweet flavoured with rosewater and saffron.","Halwa, ett segt sötsaksgodis smaksatt med rosenvatten och saffran.",
      "The Tree of Life, a lone tree in the desert, and a Formula 1 circuit.","Livets träd, ett ensamt träd i öknen, och en Formel 1-bana.",
      "A white band at the hoist with a serrated edge into a red field.","Ett vitt band vid stången med sågtandad kant mot ett rött fält."],
    ["kw","Kuwait","Kuwait","","wa",4.9,"Kuwait City","","iq sa",
      "Its currency, the dinar, is the highest-valued currency unit in the world.","Dess valuta, dinaren, är världens mest värdefulla valutaenhet.",
      "Machboos, spiced rice with chicken or fish.","Machboos, kryddat ris med kyckling eller fisk.",
      "Three water towers on the coast, two of them topped with blue-tiled spheres.","Tre vattentorn vid kusten, två av dem med blåmönstrade klot.",
      "Green, white and red horizontal stripes with a black trapezoid at the hoist.","Vågräta fält i grönt, vitt och rött med en svart trapets vid stången."],

    // Central Asia
    ["kz","Kazakhstan","Kazakstan","kazachstan|qazaqstan","ca",20,"Astana","","ru cn uz kg tm",
      "The world's first and largest space launch site, Baikonur, is here.","Världens första och största rymdbas, Bajkonur, ligger här.",
      "Beshbarmak, boiled meat over wide flat noodles.","Besjbarmak, kokt kött på breda platta nudlar.",
      "Bayterek, a tower in the capital topped with a golden ball.","Bajterek, ett torn i huvudstaden med ett gyllene klot i toppen.",
      "Sky blue with a golden sun, a soaring eagle and an ornament at the hoist.","Himmelsblå med en gyllene sol, en svävande örn och ett ornament vid stången."],
    ["uz","Uzbekistan","Uzbekistan","","ca",37,"Tashkent","Tasjkent","kz kg tj tm af",
      "It is one of only two doubly landlocked countries in the world.","Det är ett av bara två länder i världen som är dubbelt instängda utan kust.",
      "Plov, rice cooked with lamb, carrots and onions in a huge pot.","Plov, ris kokt med lamm, morötter och lök i en stor gryta.",
      "The tiled madrasas of the Registan in Samarkand.","De kakelklädda medresorna vid Registan i Samarkand.",
      "Blue, white and green stripes with thin red lines, a crescent and twelve stars.","Blått, vitt och grönt med smala röda linjer, en halvmåne och tolv stjärnor."],
    ["tm","Turkmenistan","Turkmenistan","","ca",7,"Ashgabat","Asjchabad","kz uz ir af",
      "A burning gas crater nicknamed the 'Door to Hell' has been on fire for decades.","En brinnande gaskrater med smeknamnet 'Helvetets port' har brunnit i årtionden.",
      "Plov, and melons, which even have their own national holiday.","Plov och meloner, som till och med har en egen nationell helgdag.",
      "A capital filled with gleaming white marble buildings.","En huvudstad full av glänsande byggnader i vit marmor.",
      "Green with a red vertical band of carpet patterns, a white crescent and five stars.","Grön med ett rött lodrätt band av mattmönster, en vit halvmåne och fem stjärnor."],
    ["tj","Tajikistan","Tadzjikistan","tadjikistan","ca",10.3,"Dushanbe","Dusjanbe","uz kg cn af",
      "More than 90% of the country is mountainous.","Mer än 90 % av landet består av berg.",
      "Qurutob, flatbread soaked in a salty yogurt sauce.","Qurutob, tunnbröd som blötläggs i en salt yoghurtsås.",
      "The Pamir Highway, one of the highest roads in the world.","Pamirvägen, en av världens högst belägna vägar.",
      "Red, white and green horizontal stripes with a gold crown and seven stars.","Vågräta fält i rött, vitt och grönt med en guldkrona och sju stjärnor."],
    ["kg","Kyrgyzstan","Kirgizistan","kirgisistan|kyrgyz republic|kirgizien","ca",7.2,"Bishkek","Bisjkek","kz uz tj cn",
      "It founded the World Nomad Games, with horseback sports and wrestling.","Landet grundade World Nomad Games, med ridsporter och brottning.",
      "Beshbarmak, and kymyz, fermented mare's milk.","Besjbarmak och kumys, jäst stomjölk.",
      "Issyk-Kul, a huge mountain lake that never freezes.","Issyk-Kul, en stor bergssjö som aldrig fryser.",
      "Red with a yellow sun with 40 rays.","Röd med en gul sol med 40 strålar."],

    // South Asia
    ["af","Afghanistan","Afghanistan","","sa",42,"Kabul","","pk ir tm uz tj",
      "Its Wakhan Corridor, a narrow strip of land, reaches all the way to China.","Wakhankorridoren, en smal landremsa, når ända fram till Kina.",
      "Kabuli pulao, rice with raisins, carrots and lamb.","Kabuli pulao, ris med russin, morötter och lamm.",
      "The Blue Mosque of Mazar-i-Sharif and the empty niches of the Bamiyan Buddhas.","Blå moskén i Mazar-i-Sharif och de tomma nischerna efter Bamiyanbuddhorna.",
      "Two flags are in use: a white one with black script, and a black, red and green tricolour.","Två flaggor används: en vit med svart skrift och en trikolor i svart, rött och grönt."],
    ["pk","Pakistan","Pakistan","","sa",240,"Islamabad","","in af ir cn",
      "K2, the world's second-highest mountain, rises on its northern border.","K2, världens näst högsta berg, reser sig vid dess norra gräns.",
      "Biryani, and nihari, a slow-cooked beef stew.","Biryani och nihari, en långkokt nötköttsgryta.",
      "The Badshahi Mosque in Lahore.","Badshahimoskén i Lahore.",
      "Dark green with a white crescent and star, and a white vertical band at the hoist.","Mörkgrön med en vit halvmåne och stjärna och ett vitt lodrätt band vid stången."],
    ["in","India","Indien","bharat","sa",1430,"New Delhi","","pk cn np bd bt mm",
      "Chess is believed to have begun here as a game called chaturanga.","Schack tros ha börjat här som ett spel kallat chaturanga.",
      "Masala dosa, dal and dishes from the tandoor oven.","Masala dosa, dal och rätter från tandoorugnen.",
      "The Taj Mahal, a white marble mausoleum.","Taj Mahal, ett mausoleum i vit marmor.",
      "Saffron, white and green horizontal stripes with a navy blue wheel.","Vågräta fält i saffransgult, vitt och grönt med ett marinblått hjul."],
    ["np","Nepal","Nepal","","sa",30,"Kathmandu","Katmandu","in cn",
      "Eight of the world's ten highest mountains are in the country or on its borders.","Åtta av världens tio högsta berg ligger i landet eller på dess gränser.",
      "Momo, steamed dumplings, and dal bhat (lentils with rice).","Momo, ångade dumplingar, och dal bhat (linser med ris).",
      "Mount Everest, and Lumbini, the birthplace of the Buddha.","Mount Everest och Lumbini, Buddhas födelseplats.",
      "Not a rectangle: two stacked red triangles with blue borders, a moon and a sun.","Inte rektangulär: två staplade röda trianglar med blå kant, en måne och en sol."],
    ["bt","Bhutan","Bhutan","","sa",0.78,"Thimphu","","in cn",
      "It measures progress in Gross National Happiness.","Landet mäter utveckling i 'bruttonationallycka'.",
      "Ema datshi, chili peppers in melted cheese.","Ema datshi, chilifrukter i smält ost.",
      "Tiger's Nest, a monastery clinging to a cliff.","Tigerboet, ett kloster som klamrar sig fast vid en klippa.",
      "Divided diagonally into yellow and orange, with a white dragon.","Diagonalt delad i gult och orange, med en vit drake."],
    ["bd","Bangladesh","Bangladesh","","sa",172,"Dhaka","","in mm",
      "It shares the world's largest mangrove forest, the Sundarbans, with its big neighbour.","Landet delar världens största mangroveskog, Sundarbans, med sitt stora grannland.",
      "Hilsa fish cooked in mustard sauce.","Hilsafisk tillagad i senapssås.",
      "The National Parliament House in the capital, designed by Louis Kahn.","Parlamentsbyggnaden i huvudstaden, ritad av Louis Kahn.",
      "A red disc slightly off-centre on a dark green field.","En röd cirkel något förskjuten från mitten på mörkgrön botten."],
    ["lk","Sri Lanka","Sri Lanka","ceylon","sa",22,"","","",
      "It had the world's first female prime minister, elected in 1960.","Landet fick världens första kvinnliga premiärminister 1960.",
      "Rice and curry, and hoppers, bowl-shaped pancakes.","Ris och curry, och hoppers, skålformade pannkakor.",
      "Sigiriya, a fortress on top of a giant rock.","Sigiriya, en fästning på toppen av en jättelik klippa.",
      "A gold lion holding a sword on maroon, beside green and orange stripes.","Ett guldlejon med ett svärd på vinröd botten, bredvid ett grönt och ett orange band."],
    ["mv","Maldives","Maldiverna","maldive islands","sa",0.52,"Malé","","",
      "It is the lowest-lying country in the world, about 1.5 m above sea level on average.","Det är världens lägst belägna land, i snitt omkring 1,5 meter över havet.",
      "Mas huni: tuna, coconut and onion, eaten for breakfast.","Mas huni: tonfisk, kokos och lök, som äts till frukost.",
      "Overwater bungalows on coral atolls.","Bungalower på pålar över vattnet på korallatoller.",
      "Red with a green rectangle holding a white crescent.","Röd med en grön rektangel med en vit halvmåne."],

    // East Asia
    ["cn","China","Kina","prc|peoples republic of china|folkrepubliken kina","ea",1410,"Beijing","Peking","mn in ru kp vn la",
      "Despite its huge width, the whole country uses a single time zone.","Trots sin enorma bredd använder hela landet en enda tidszon.",
      "Dumplings, dim sum and roast duck with thin pancakes.","Dumplings, dim sum och stekt anka med tunna pannkakor.",
      "The Great Wall and the Terracotta Army.","Den stora muren och terrakottaarmén.",
      "Red with one large yellow star and four smaller ones.","Röd med en stor gul stjärna och fyra mindre."],
    ["jp","Japan","Japan","nippon|nihon","ea",124,"Tokyo","","",
      "One of the world's oldest companies, a temple builder, was founded here in the year 578.","Ett av världens äldsta företag, en tempelbyggare, grundades här år 578.",
      "Sushi, ramen and miso soup.","Sushi, ramen och misosoppa.",
      "Mount Fuji, a snow-capped volcano.","Fuji, en snöklädd vulkan.",
      "A red circle on a white field.","En röd cirkel på vit botten."],
    ["kr","South Korea","Sydkorea","korea|republic of korea|rok","ea",52,"Seoul","","kp",
      "Babies here were traditionally counted as one year old at birth, a custom officially dropped in 2023.","Bebisar räknades traditionellt som ett år gamla vid födseln, en sed som officiellt slopades 2023.",
      "Kimchi, fermented spicy cabbage, and bibimbap.","Kimchi, fermenterad kryddstark kål, och bibimbap.",
      "Gyeongbokgung Palace in the capital.","Gyeongbokgungpalatset i huvudstaden.",
      "White with a red and blue yin-yang circle and four black trigrams.","Vit med en röd och blå yin-yang-cirkel och fyra svarta trigram."],
    ["kp","North Korea","Nordkorea","dprk|democratic peoples republic of korea","ea",26,"Pyongyang","","cn kr ru",
      "Its capital has a 105-storey pyramid-shaped hotel that stood unfinished for decades.","Huvudstaden har ett 105 våningar högt pyramidformat hotell som stått ofärdigt i årtionden.",
      "Naengmyeon, cold buckwheat noodles.","Naengmyeon, kalla bovetenudlar.",
      "Mount Paektu, a volcano with a crater lake on the border with China.","Paektu, en vulkan med en kratersjö vid gränsen mot Kina.",
      "Blue, red and blue stripes with thin white lines, and a red star in a white circle.","Blått, rött och blått med smala vita linjer och en röd stjärna i en vit cirkel."],
    ["mn","Mongolia","Mongoliet","","ea",3.5,"Ulaanbaatar","Ulan Bator","ru cn",
      "It is the most sparsely populated independent country in the world.","Det är världens glesast befolkade självständiga land.",
      "Buuz, steamed meat dumplings, and airag, fermented mare's milk.","Buuz, ångade köttdumplingar, och airag, jäst stomjölk.",
      "A giant stainless-steel statue of Genghis Khan on horseback.","En jättelik staty i rostfritt stål av Djingis khan till häst.",
      "Red, blue and red vertical stripes with a yellow Soyombo symbol.","Lodräta fält i rött, blått och rött med en gul soyombosymbol."],

    // Southeast Asia
    ["th","Thailand","Thailand","siam","sea",71,"Bangkok","","mm la kh my",
      "It is the only Southeast Asian country never colonised by a European power.","Det är det enda landet i Sydostasien som aldrig koloniserats av en europeisk makt.",
      "Tom yum soup and green curry with coconut milk.","Tom yum-soppa och grön curry med kokosmjölk.",
      "The Grand Palace and the Temple of the Emerald Buddha.","Stora palatset och Smaragdbuddhans tempel.",
      "Red, white, blue, white and red horizontal stripes, the blue twice as wide.","Vågräta ränder i rött, vitt, blått, vitt och rött, där det blå är dubbelt så brett."],
    ["vn","Vietnam","Vietnam","viet nam","sea",100,"Hanoi","","cn la kh",
      "It is the world's second-largest coffee producer, after Brazil.","Landet är världens näst största kaffeproducent, efter Brasilien.",
      "Phở, a noodle soup, and bánh mì sandwiches.","Phở, en nudelsoppa, och bánh mì-smörgåsar.",
      "Ha Long Bay, with thousands of limestone islands.","Ha Long-bukten med tusentals kalkstensöar.",
      "A yellow five-pointed star on a red field.","En gul femuddig stjärna på röd botten."],
    ["la","Laos","Laos","lao pdr","sea",7.6,"Vientiane","","th vn cn kh mm",
      "It is the only landlocked country in Southeast Asia.","Det är det enda landet i Sydostasien som saknar kust.",
      "Larb, a minced meat salad, with sticky rice.","Larb, en sallad med köttfärs, med klibbigt ris.",
      "The Plain of Jars, scattered with ancient stone jars.","Krukslätten, full av forntida stenkrukor.",
      "Red, blue and red horizontal stripes with a white disc in the centre.","Vågräta fält i rött, blått och rött med en vit cirkel i mitten."],
    ["kh","Cambodia","Kambodja","kampuchea","sea",17,"Phnom Penh","","th la vn",
      "Its Tonlé Sap river changes direction twice a year.","Floden Tonlé Sap här byter riktning två gånger om året.",
      "Fish amok, a fish curry steamed in banana leaves.","Fish amok, fiskcurry som ångas i bananblad.",
      "Angkor Wat, the largest religious monument in the world.","Angkor Wat, världens största religiösa monument.",
      "Blue, red and blue stripes with a white temple in the centre.","Blått, rött och blått med ett vitt tempel i mitten."],
    ["mm","Myanmar","Myanmar","burma","sea",54,"Naypyidaw","","th cn in bd la",
      "In 2005 its capital moved to a newly built city known for nearly empty multi-lane roads.","År 2005 flyttades huvudstaden till en nybyggd stad känd för nästan tomma breda vägar.",
      "Mohinga, a fish and rice noodle soup.","Mohinga, en soppa med fisk och risnudlar.",
      "The golden Shwedagon Pagoda and the temple plains of Bagan.","Den gyllene Shwedagonpagoden och tempelslätten i Bagan.",
      "Yellow, green and red horizontal stripes with a large white star.","Vågräta fält i gult, grönt och rött med en stor vit stjärna."],
    ["my","Malaysia","Malaysia","","sea",34,"Kuala Lumpur","","th id bn",
      "It is split between a peninsula and part of the island of Borneo.","Landet är delat mellan en halvö och en del av ön Borneo.",
      "Nasi lemak, coconut rice with sambal and anchovies.","Nasi lemak, kokosris med sambal och ansjovis.",
      "The Petronas Twin Towers.","Petronas tvillingtorn.",
      "Red and white stripes, with a yellow crescent and star on a blue corner.","Röda och vita ränder, med en gul halvmåne och stjärna i ett blått hörn."],
    ["sg","Singapore","Singapore","singapur","sea",5.9,"","","",
      "Selling chewing gum has been banned here since 1992, with few exceptions.","Att sälja tuggummi har varit förbjudet här sedan 1992, med få undantag.",
      "Hainanese chicken rice and chili crab.","Hainanesiskt kycklingris och chilikrabba.",
      "Marina Bay Sands, three towers joined by a rooftop deck.","Marina Bay Sands, tre torn som förbinds av ett takdäck.",
      "Red over white, with a white crescent and five stars.","Rött över vitt, med en vit halvmåne och fem stjärnor."],
    ["id","Indonesia","Indonesien","","sea",280,"Jakarta","","my pg tl",
      "It is the world's largest island country, with more than 17,000 islands.","Det är världens största östat, med mer än 17 000 öar.",
      "Nasi goreng (fried rice) and satay skewers.","Nasi goreng (stekt ris) och satayspett.",
      "Borobudur, the world's largest Buddhist temple.","Borobudur, världens största buddhistiska tempel.",
      "Two horizontal stripes, red over white.","Två vågräta fält, rött över vitt."],
    ["ph","Philippines","Filippinerna","pilipinas","sea",115,"Manila","","",
      "It has more than 7,000 islands, and its Christmas season starts in September.","Landet har mer än 7 000 öar, och julsäsongen börjar redan i september.",
      "Adobo, meat braised in vinegar and soy sauce.","Adobo, kött som bräseras i vinäger och soja.",
      "The Chocolate Hills of Bohol and the rice terraces of Banaue.","Chokladkullarna på Bohol och risterrasserna i Banaue.",
      "Blue over red with a white triangle holding a gold sun and three stars.","Blått över rött med en vit triangel med en gyllene sol och tre stjärnor."],
    ["bn","Brunei","Brunei","brunei darussalam","sea",0.46,"Bandar Seri Begawan","","my",
      "Its sultan's palace is one of the largest residential palaces in the world.","Sultanens palats är ett av världens största bostadspalats.",
      "Ambuyat, a sticky starch from the sago palm, eaten with dipping sauces.","Ambuyat, en klibbig stärkelse från sagopalmen som äts med doppsåser.",
      "Kampong Ayer, a water village of houses on stilts.","Kampong Ayer, en vattenby med hus på pålar.",
      "Yellow with white and black diagonal bands and a red emblem.","Gul med vita och svarta diagonala band och ett rött emblem."],
    ["tl","Timor-Leste","Östtimor","east timor|timor|osttimor","sea",1.4,"Dili","","id",
      "It became independent in 2002, the first new country of the 21st century.","Landet blev självständigt 2002, det första nya landet på 2000-talet.",
      "Ikan sabuko, marinated grilled fish, and locally grown coffee.","Ikan sabuko, marinerad grillad fisk, och lokalt odlat kaffe.",
      "The Cristo Rei statue on a headland near the capital.","Statyn Cristo Rei på en udde nära huvudstaden.",
      "Red with a yellow and a black triangle at the hoist and a white star.","Röd med en gul och en svart triangel vid stången och en vit stjärna."],

    // North Africa
    ["eg","Egypt","Egypten","misr","naf",110,"Cairo","Kairo","ly sd il",
      "Ancient people here made paper from a reed called papyrus.","Forntida människor här gjorde papper av ett vass som kallas papyrus.",
      "Koshari: rice, lentils and pasta with tomato sauce.","Koshari: ris, linser och pasta med tomatsås.",
      "The pyramids of Giza and the Sphinx.","Pyramiderna i Giza och sfinxen.",
      "Red, white and black stripes with a golden eagle.","Rött, vitt och svart med en gyllene örn."],
    ["ly","Libya","Libyen","","naf",7.0,"Tripoli","","eg tn dz sd td ne",
      "More than 90% of the country is desert.","Mer än 90 % av landet är öken.",
      "Bazeen, a barley dough served with a spicy stew.","Bazeen, en deg av korn som serveras med en kryddig gryta.",
      "The Roman ruins of Leptis Magna.","De romerska ruinerna i Leptis Magna.",
      "Red, black and green horizontal stripes with a white crescent and star.","Vågräta fält i rött, svart och grönt med en vit halvmåne och stjärna."],
    ["tn","Tunisia","Tunisien","","naf",12.2,"Tunis","","dz ly",
      "Desert sets for the Star Wars films were built here.","Ökenkulisser till Star Wars-filmerna byggdes här.",
      "Couscous, and brik, a crisp fried pastry with egg.","Couscous och brik, ett krispigt friterat bakverk med ägg.",
      "The ruins of ancient Carthage.","Ruinerna av det antika Karthago.",
      "Red with a white disc holding a red crescent and star.","Röd med en vit cirkel med en röd halvmåne och stjärna."],
    ["dz","Algeria","Algeriet","","naf",46,"Algiers","Alger","ma tn ly ml ne",
      "It is the largest country in Africa by area.","Det är Afrikas största land till ytan.",
      "Couscous with lamb and vegetables, and chakhchoukha.","Couscous med lamm och grönsaker, och chakhchoukha.",
      "Tassili n'Ajjer, a plateau with thousands of ancient rock paintings.","Tassili n'Ajjer, en platå med tusentals forntida hällmålningar.",
      "Vertical green and white halves with a red crescent and star.","Lodrätt delad i grönt och vitt med en röd halvmåne och stjärna."],
    ["ma","Morocco","Marocko","maroc","naf",37,"Rabat","","dz",
      "Its city of Fez has what is often called the oldest operating university, founded in 859.","Staden Fès har det som ofta kallas världens äldsta fortfarande verksamma universitet, grundat 859.",
      "Tagine, a stew slow-cooked in a cone-shaped clay pot.","Tagine, en gryta som långkokas i en konformad lergryta.",
      "The blue-painted town of Chefchaouen and the markets of Marrakesh.","Den blåmålade staden Chefchaouen och marknaderna i Marrakech.",
      "Red with a green five-pointed star outline.","Röd med en grön femuddig stjärna i kontur."],
    ["sd","Sudan","Sudan","","naf",50,"Khartoum","","eg ly td ss et er",
      "It has more ancient pyramids than Egypt.","Landet har fler forntida pyramider än Egypten.",
      "Ful medames, slow-cooked fava beans.","Ful medames, långkokta bondbönor.",
      "The pyramids of Meroë.","Pyramiderna i Meroë.",
      "Red, white and black stripes with a green triangle at the hoist.","Rött, vitt och svart med en grön triangel vid stången."],

    // West Africa
    ["ng","Nigeria","Nigeria","","waf",230,"Abuja","","bj ne td cm",
      "Its film industry, one of the largest in the world, has a nickname that plays on Hollywood.","Dess filmindustri, en av världens största, har ett smeknamn som anspelar på Hollywood.",
      "Jollof rice, and pounded yam with egusi soup.","Jollofris och stampad jams med egusisoppa.",
      "Zuma Rock, a huge monolith near the capital.","Zuma Rock, en enorm monolit nära huvudstaden.",
      "Three vertical stripes: green, white and green.","Tre lodräta fält: grönt, vitt och grönt."],
    ["gh","Ghana","Ghana","","waf",34,"Accra","","ci bf tg",
      "In 1957 it became the first colony south of the Sahara to win independence.","År 1957 blev det den första kolonin söder om Sahara som blev självständig.",
      "Jollof rice, and fufu with light soup.","Jollofris och fufu med lätt soppa.",
      "Cape Coast Castle, a former fort of the slave trade.","Cape Coast Castle, ett tidigare fort för slavhandeln.",
      "Red, yellow and green horizontal stripes with a black star.","Vågräta fält i rött, gult och grönt med en svart stjärna."],
    ["sn","Senegal","Senegal","","waf",18.0,"Dakar","","mr ml gn gm gw",
      "It almost completely surrounds a smaller country.","Landet omger nästan helt ett mindre land.",
      "Thieboudienne, fish with broken rice and vegetables.","Thieboudienne, fisk med brutet ris och grönsaker.",
      "The African Renaissance Monument, a giant bronze statue in the capital.","Afrikanska renässansmonumentet, en jättelik bronsstaty i huvudstaden.",
      "Green, yellow and red vertical stripes with a green star.","Lodräta fält i grönt, gult och rött med en grön stjärna."],
    ["ci","Côte d'Ivoire","Elfenbenskusten","ivory coast|cote divoire","waf",30,"Yamoussoukro","","gh lr gn ml bf",
      "It is the world's largest producer of cocoa beans.","Landet är världens största producent av kakaobönor.",
      "Attiéké, fermented cassava couscous, with grilled fish.","Attiéké, couscous av jäst kassava, med grillad fisk.",
      "The Basilica of Our Lady of Peace, one of the largest churches in the world.","Basilikan Notre-Dame de la Paix, en av världens största kyrkor.",
      "Three vertical stripes: orange, white and green.","Tre lodräta fält: orange, vitt och grönt."],
    ["ml","Mali","Mali","","waf",23,"Bamako","","sn dz ne bf gn ci",
      "Its medieval emperor Mansa Musa is often called the richest person in history.","Dess medeltida kejsare Mansa Musa kallas ofta den rikaste människan i historien.",
      "Tiguadege na, a stew made with peanut butter.","Tiguadege na, en gryta med jordnötssmör.",
      "The Great Mosque of Djenné, the largest mud-brick building in the world.","Stora moskén i Djenné, världens största byggnad av lertegel.",
      "Three vertical stripes: green, yellow and red.","Tre lodräta fält: grönt, gult och rött."],
    ["bf","Burkina Faso","Burkina Faso","burkina|upper volta","waf",23,"Ouagadougou","","ml ne gh ci tg bj",
      "Its name means 'land of honest people'.","Namnet betyder 'de ärliga människornas land'.",
      "Tô, a stiff millet or sorghum porridge served with sauce.","Tô, en fast gröt av hirs eller durra som serveras med sås.",
      "The painted houses of Tiébélé.","De målade husen i Tiébélé.",
      "Red over green with a yellow star.","Rött över grönt med en gul stjärna."],
    ["ne","Niger","Niger","","waf",27,"Niamey","","ng ml dz td ly bf",
      "Fossils of a giant prehistoric crocodile, nicknamed SuperCroc, were found in its desert.","Fossil av en jättelik förhistorisk krokodil, kallad SuperCroc, har hittats i dess öken.",
      "Millet porridge, and kilishi, spiced dried meat.","Hirsgröt och kilishi, kryddat torkat kött.",
      "The mud-brick Grand Mosque of Agadez with its tall minaret.","Stora moskén i Agadez, byggd av lera, med sin höga minaret.",
      "Orange, white and green horizontal stripes with an orange disc.","Vågräta fält i orange, vitt och grönt med en orange cirkel."],
    ["gn","Guinea","Guinea","guinea conakry","waf",14,"Conakry","","sn ml ci sl lr gw",
      "It has some of the world's largest reserves of bauxite, the ore used to make aluminium.","Landet har några av världens största fyndigheter av bauxit, malmen som används till aluminium.",
      "Rice with peanut sauce or leaf sauce.","Ris med jordnötssås eller bladsås.",
      "The highlands and waterfalls of Fouta Djallon.","Högländerna och vattenfallen i Fouta Djallon.",
      "Three vertical stripes: red, yellow and green.","Tre lodräta fält: rött, gult och grönt."],
    ["sl","Sierra Leone","Sierra Leone","","waf",8.6,"Freetown","","gn lr",
      "Its capital was founded as a settlement for freed slaves.","Huvudstaden grundades som en bosättning för befriade slavar.",
      "Cassava leaf stew with rice.","Gryta på kassavablad med ris.",
      "Tiwai Island, a wildlife sanctuary full of primates.","Ön Tiwai, en fristad full av primater.",
      "Three horizontal stripes: green, white and blue.","Tre vågräta fält: grönt, vitt och blått."],
    ["lr","Liberia","Liberia","","waf",5.4,"Monrovia","","sl gn ci",
      "It is Africa's oldest republic, independent since 1847.","Det är Afrikas äldsta republik, självständig sedan 1847.",
      "Jollof rice and palm butter soup.","Jollofris och palmsmörssoppa.",
      "The rainforest of Sapo National Park.","Regnskogen i Sapo nationalpark.",
      "Red and white stripes with a white star on a blue square.","Röda och vita ränder med en vit stjärna på en blå kvadrat."],
    ["tg","Togo","Togo","","waf",9.3,"Lomé","","gh bf bj",
      "Its coastline is only about 56 km long, but the country stretches more than 500 km inland.","Kusten är bara omkring 56 km lång, men landet sträcker sig över 500 km inåt land.",
      "Fufu with peanut soup.","Fufu med jordnötssoppa.",
      "Koutammakou, a landscape of tower-shaped mud houses.","Koutammakou, ett landskap med tornformade lerhus.",
      "Green and yellow stripes with a white star on a red square.","Gröna och gula ränder med en vit stjärna på en röd kvadrat."],
    ["bj","Benin","Benin","dahomey","waf",14,"Porto-Novo","","tg ng bf ne",
      "The Vodun (voodoo) religion has its own national holiday here.","Religionen vodun (voodoo) har en egen nationell helgdag här.",
      "Pâte, a cornmeal dough served with sauces.","Pâte, en majsdeg som serveras med såser.",
      "Ganvié, a village built on stilts in a lake.","Ganvié, en by byggd på pålar i en sjö.",
      "A green vertical band at the hoist, with yellow over red.","Ett grönt lodrätt band vid stången, med gult över rött."],
    ["gm","Gambia","Gambia","the gambia","waf",2.7,"Banjul","","sn",
      "It is the smallest country on the African mainland.","Det är det minsta landet på Afrikas fastland.",
      "Domoda, a peanut stew served with rice.","Domoda, en jordnötsgryta som serveras med ris.",
      "Kunta Kinteh Island in the middle of the river.","Kunta Kinteh-ön mitt i floden.",
      "Red, blue and green horizontal stripes separated by thin white lines.","Vågräta fält i rött, blått och grönt åtskilda av smala vita linjer."],
    ["gw","Guinea-Bissau","Guinea-Bissau","","waf",2.2,"Bissau","","sn gn",
      "Cashew nuts are its main export.","Cashewnötter är den viktigaste exportvaran.",
      "Jollof rice, and caldo de mancarra, a peanut stew.","Jollofris och caldo de mancarra, en jordnötsgryta.",
      "The Bijagós islands, where hippos swim in salt water.","Bijagósöarna, där flodhästar simmar i saltvatten.",
      "A red vertical band with a black star, beside yellow over green.","Ett rött lodrätt band med en svart stjärna, bredvid gult över grönt."],
    ["cv","Cape Verde","Kap Verde","cabo verde","waf",0.6,"Praia","","",
      "Singer Cesária Évora, the 'barefoot diva', came from here.","Sångerskan Cesária Évora, 'den barfota divan', kom härifrån.",
      "Cachupa, a slow-cooked stew of corn and beans.","Cachupa, en långkokt gryta på majs och bönor.",
      "Pico do Fogo, an active volcano on one of its islands.","Pico do Fogo, en aktiv vulkan på en av öarna.",
      "Blue with white and red stripes and a circle of ten yellow stars.","Blå med vita och röda ränder och en ring av tio gula stjärnor."],
    ["mr","Mauritania","Mauretanien","","waf",5.0,"Nouakchott","","sn ml dz",
      "One of the world's longest trains carries iron ore across its desert.","Ett av världens längsta tåg fraktar järnmalm genom dess öken.",
      "Thieboudienne, and camel milk.","Thieboudienne och kamelmjölk.",
      "The Eye of the Sahara (Richat Structure), visible from space.","Saharas öga (Richatstrukturen), som syns från rymden.",
      "Green with a gold crescent and star, and red bands at the top and bottom.","Grön med en halvmåne och stjärna i guld, och röda band upptill och nertill."],

    // Central Africa
    ["cd","DR Congo","Kongo-Kinshasa","drc|dr congo|democratic republic of the congo|congo kinshasa|demokratiska republiken kongo|zaire","caf",106,"Kinshasa","","cg ao zm ug rw bi",
      "It is home to the bonobo, which lives in the wild nowhere else.","Här lever bonobon, som inte finns vild någon annanstans.",
      "Moambe chicken in palm nut sauce, with fufu.","Moambekyckling i palmnötssås, med fufu.",
      "Virunga National Park, home to mountain gorillas.","Virunga nationalpark, hem för bergsgorillor.",
      "Sky blue with a red diagonal stripe edged in yellow, and a yellow star.","Himmelsblå med ett rött diagonalt band med gul kant och en gul stjärna."],
    ["cg","Republic of the Congo","Kongo-Brazzaville","congo|congo brazzaville|republic of congo|kongo|republiken kongo","caf",6.1,"Brazzaville","","cd ga cm cf ao",
      "Its capital faces another country's capital across a river, closer than almost any other pair.","Huvudstaden ligger mitt emot ett annat lands huvudstad på andra sidan en flod, närmare än nästan något annat par.",
      "Saka-saka, cassava leaves cooked with fish or peanuts.","Saka-saka, kassavablad kokta med fisk eller jordnötter.",
      "The lowland gorillas of Odzala-Kokoua National Park.","Låglandsgorillorna i Odzala-Kokoua nationalpark.",
      "Divided diagonally into green and red by a yellow band.","Diagonalt delad i grönt och rött av ett gult band."],
    ["cm","Cameroon","Kamerun","cameroun","caf",29,"Yaoundé","","ng td cf ga gq cg",
      "It is often called 'Africa in miniature' for its varied landscapes.","Landet kallas ofta 'Afrika i miniatyr' för sina varierade landskap.",
      "Ndolé, a stew of bitter leaves, peanuts and meat or fish.","Ndolé, en gryta på bittra blad, jordnötter och kött eller fisk.",
      "An active volcano near the coast, the highest peak in West and Central Africa.","En aktiv vulkan nära kusten, den högsta toppen i västra och centrala Afrika.",
      "Green, red and yellow vertical stripes with a yellow star in the middle.","Lodräta fält i grönt, rött och gult med en gul stjärna i mitten."],
    ["cf","Central African Republic","Centralafrikanska republiken","car|c a r|centralafrika","caf",5.6,"Bangui","","td sd ss cd cg cm",
      "In its Dzanga-Sangha reserve, hundreds of forest elephants gather in clearings.","I reservatet Dzanga-Sangha samlas hundratals skogselefanter i gläntor.",
      "Cassava with leafy greens and peanut sauce.","Kassava med bladgrönsaker och jordnötssås.",
      "The Boali Falls on the Mbali river.","Boalifallen i floden Mbali.",
      "Blue, white, green and yellow stripes crossed by a red vertical band, with a yellow star.","Ränder i blått, vitt, grönt och gult som korsas av ett rött lodrätt band, med en gul stjärna."],
    ["td","Chad","Tchad","tchad","caf",19,"N'Djamena","","ly sd cf cm ng ne",
      "One of the oldest known human-like fossils, nicknamed Toumaï, was found here.","Ett av de äldsta kända människoliknande fossilen, kallat Toumaï, hittades här.",
      "Boule, a millet porridge served with sauce.","Boule, en hirsgröt som serveras med sås.",
      "The sandstone arches of the Ennedi Plateau in the Sahara.","Sandstensvalven på Ennediplatån i Sahara.",
      "Three vertical stripes: dark blue, yellow and red.","Tre lodräta fält: mörkblått, gult och rött."],
    ["ga","Gabon","Gabon","","caf",2.5,"Libreville","","gq cm cg",
      "Almost 90% of the country is covered by rainforest.","Nästan 90 % av landet täcks av regnskog.",
      "Nyembwe chicken, cooked in palm nut sauce.","Nyembwekyckling, tillagad i palmnötssås.",
      "Loango National Park, where elephants and hippos visit the beach.","Loango nationalpark, där elefanter och flodhästar går ner på stranden.",
      "Three horizontal stripes: green, yellow and blue.","Tre vågräta fält: grönt, gult och blått."],
    ["gq","Equatorial Guinea","Ekvatorialguinea","","caf",1.7,"","","cm ga",
      "It is the only country in Africa with Spanish as an official language.","Det är det enda landet i Afrika med spanska som officiellt språk.",
      "Pepper soup, a spicy broth with fish or meat.","Pepparsoppa, en kryddstark buljong med fisk eller kött.",
      "Pico Basilé, a volcano on Bioko Island.","Pico Basilé, en vulkan på ön Bioko.",
      "Green, white and red stripes, a blue triangle at the hoist and a coat of arms with a tree.","Grönt, vitt och rött med en blå triangel vid stången och ett vapen med ett träd."],
    ["st","São Tomé and Príncipe","São Tomé och Príncipe","sao tome|sao tome and principe|sao tome och principe","caf",0.23,"São Tomé","","",
      "It is Africa's second-smallest country, with two main islands near the equator.","Det är Afrikas näst minsta land, med två huvudöar nära ekvatorn.",
      "Calulu, a fish stew with greens and palm oil, and lots of cocoa.","Calulu, en fiskgryta med bladgrönsaker och palmolja, och mycket kakao.",
      "Pico Cão Grande, a needle-shaped volcanic peak.","Pico Cão Grande, en nålformad vulkanisk topp.",
      "Green, yellow and green stripes, a red triangle and two black stars.","Grönt, gult och grönt med en röd triangel och två svarta stjärnor."],
    ["ao","Angola","Angola","","caf",37,"Luanda","","cd cg zm na",
      "It has an exclave, Cabinda, separated from the rest of the country.","Landet har en exklav, Cabinda, som är skild från resten av landet.",
      "Moamba de galinha, chicken in palm oil sauce, with funge.","Moamba de galinha, kyckling i palmoljesås, med funge.",
      "Kalandula Falls, among the largest waterfalls in Africa.","Kalandulafallen, ett av Afrikas största vattenfall.",
      "Red over black with a yellow half gear wheel, a machete and a star.","Rött över svart med ett gult halvt kugghjul, en machete och en stjärna."],

    // East Africa
    ["et","Ethiopia","Etiopien","abyssinia|abessinien","eaf",128,"Addis Ababa","Addis Abeba","ke so sd er dj ss",
      "It has its own calendar of 13 months, about seven years behind the usual one.","Landet har en egen kalender med 13 månader, ungefär sju år efter den vanliga.",
      "Injera, a spongy sourdough flatbread, with spicy stews.","Injera, ett svampigt tunnbröd av surdeg, med kryddiga grytor.",
      "The rock-hewn churches of Lalibela.","De klipphuggna kyrkorna i Lalibela.",
      "Green, yellow and red stripes with a blue disc and a yellow star.","Grönt, gult och rött med en blå cirkel och en gul stjärna."],
    ["ke","Kenya","Kenya","","eaf",56,"Nairobi","","tz ug et so ss",
      "Its capital has a national park with lions right on the edge of the city.","Huvudstaden har en nationalpark med lejon precis vid stadens kant.",
      "Ugali, a stiff maize porridge, with grilled meat (nyama choma).","Ugali, en fast majsgröt, med grillat kött (nyama choma).",
      "The Maasai Mara, famous for the great wildebeest migration.","Masai Mara, känt för gnuernas stora vandring.",
      "Black, red and green stripes edged in white, with a Maasai shield and spears.","Svart, rött och grönt med vita kanter, med en masajsköld och spjut."],
    ["tz","Tanzania","Tanzania","","eaf",67,"Dodoma","","ke ug mz zm rw bi mw",
      "Its island of Zanzibar is famous for growing cloves.","Ön Zanzibar, som hör till landet, är känd för sin kryddnejlika.",
      "Ugali, and pilau, spiced rice.","Ugali och pilau, kryddat ris.",
      "Mount Kilimanjaro and the Serengeti.","Kilimanjaro och Serengeti.",
      "A black diagonal band edged in yellow between green and blue triangles.","Ett svart diagonalt band med gul kant mellan en grön och en blå triangel."],
    ["ug","Uganda","Uganda","","eaf",49,"Kampala","","ke tz rw cd ss",
      "The Nile begins its journey north from Lake Victoria here.","Nilen börjar sin färd norrut från Victoriasjön här.",
      "Matoke, steamed and mashed green bananas.","Matoke, ångade och mosade gröna bananer.",
      "Bwindi Impenetrable Forest, home to mountain gorillas.","Bwindis ogenomträngliga skog, hem för bergsgorillor.",
      "Six black, yellow and red stripes with a crowned crane in a white disc.","Sex ränder i svart, gult och rött med en krontrana i en vit cirkel."],
    ["rw","Rwanda","Rwanda","","eaf",14,"Kigali","","ug tz bi cd",
      "Plastic bags have been banned here since 2008.","Plastpåsar har varit förbjudna här sedan 2008.",
      "Brochettes, grilled goat skewers, and isombe, mashed cassava leaves.","Brochettes, grillade getspett, och isombe, mosade kassavablad.",
      "Volcanoes National Park and the shores of Lake Kivu.","Vulkanernas nationalpark och stränderna vid Kivusjön.",
      "Blue, yellow and green horizontal stripes with a yellow sun.","Vågräta fält i blått, gult och grönt med en gul sol."],
    ["bi","Burundi","Burundi","","eaf",13.2,"Gitega","","rw tz cd",
      "Its royal drummers perform a tradition listed by UNESCO.","Dess kungliga trumslagare utför en tradition som finns på Unescos lista.",
      "Beans with plantains, and grilled meat skewers.","Bönor med kokbananer och grillade köttspett.",
      "The shores of Lake Tanganyika, one of the deepest lakes in the world.","Stränderna vid Tanganyikasjön, en av världens djupaste sjöar.",
      "A white diagonal cross between red and green, with three red stars in a white disc.","Ett vitt diagonalkors mellan rött och grönt, med tre röda stjärnor i en vit cirkel."],
    ["so","Somalia","Somalia","","eaf",18.6,"Mogadishu","","et ke dj",
      "It has the longest coastline of any country on the African mainland.","Landet har den längsta kusten av alla länder på Afrikas fastland.",
      "Bariis, spiced rice with goat meat, often served with a banana.","Bariis, kryddat ris med getkött, ofta serverat med en banan.",
      "Lido Beach on the Indian Ocean in the capital.","Lidostranden vid Indiska oceanen i huvudstaden.",
      "A white five-pointed star on a light blue field.","En vit femuddig stjärna på ljusblå botten."],
    ["dj","Djibouti","Djibouti","","eaf",1.1,"Djibouti","","er et so",
      "Lake Assal here is the lowest point in Africa.","Assalsjön här är Afrikas lägsta punkt.",
      "Skoudehkaris, spiced rice with lamb.","Skoudehkaris, kryddat ris med lamm.",
      "Lac Abbé, with steaming limestone chimneys.","Abbésjön med ångande skorstenar av kalksten.",
      "Light blue over green with a white triangle and a red star.","Ljusblått över grönt med en vit triangel och en röd stjärna."],
    ["er","Eritrea","Eritrea","","eaf",3.7,"Asmara","","sd et dj",
      "Its capital is known for modernist architecture from the 1930s.","Huvudstaden är känd för modernistisk arkitektur från 1930-talet.",
      "Zigni, a spicy meat stew, with injera bread.","Zigni, en kryddstark köttgryta, med injerabröd.",
      "Fiat Tagliero, a 1938 service station shaped like an aeroplane.","Fiat Tagliero, en bensinstation från 1938 formad som ett flygplan.",
      "A red triangle with a gold olive wreath, between green and blue triangles.","En röd triangel med en olivkrans i guld, mellan en grön och en blå triangel."],
    ["ss","South Sudan","Sydsudan","","eaf",11.5,"Juba","","sd et ke ug cd cf",
      "It became the world's newest country in 2011.","Det blev världens nyaste land 2011.",
      "Kisra, a thin sorghum flatbread.","Kisra, ett tunt tunnbröd av durra.",
      "The Sudd, one of the largest wetlands in the world.","Sudd, ett av världens största våtmarksområden.",
      "Black, red and green stripes edged in white, a blue triangle and a yellow star.","Svart, rött och grönt med vita kanter, en blå triangel och en gul stjärna."],
    ["mg","Madagascar","Madagaskar","","eaf",31,"Antananarivo","","",
      "About 90% of its wildlife is found nowhere else on Earth.","Omkring 90 % av djurlivet här finns ingen annanstans på jorden.",
      "Romazava, a meat and leafy greens stew, with rice.","Romazava, en gryta på kött och bladgrönsaker, med ris.",
      "The Avenue of the Baobabs.","Baobaballén.",
      "A white vertical band at the hoist, with red over green.","Ett vitt lodrätt band vid stången, med rött över grönt."],
    ["mu","Mauritius","Mauritius","","eaf",1.3,"Port Louis","","",
      "The dodo lived only here, until it died out in the 1600s.","Dronten levde bara här, tills den dog ut på 1600-talet.",
      "Dholl puri, flatbread filled with split peas, served with curry.","Dholl puri, tunnbröd fyllt med gula ärtor, med curry.",
      "The Seven Coloured Earths of Chamarel.","De sju färgade jordarna i Chamarel.",
      "Four horizontal stripes: red, blue, yellow and green.","Fyra vågräta fält: rött, blått, gult och grönt."],
    ["sc","Seychelles","Seychellerna","the seychelles","eaf",0.12,"Victoria","","",
      "It has the smallest population of any African country.","Landet har minst folkmängd av alla länder i Afrika.",
      "Fish curry with coconut, and breadfruit.","Fiskcurry med kokos, och brödfrukt.",
      "The coco de mer palm, with the world's largest seed, in the Vallée de Mai.","Palmen coco de mer, med världens största frö, i Vallée de Mai.",
      "Five diagonal bands fanning out from the lower hoist: blue, yellow, red, white and green.","Fem diagonala band som strålar ut från det nedre hörnet: blått, gult, rött, vitt och grönt."],
    ["km","Comoros","Komorerna","the comoros","eaf",0.85,"Moroni","","",
      "It is one of the world's biggest growers of ylang-ylang, a flower used in perfume.","Landet är en av världens största odlare av ylang-ylang, en blomma som används i parfym.",
      "Lobster in vanilla sauce.","Hummer i vaniljsås.",
      "Mount Karthala, an active volcano with a huge crater.","Karthala, en aktiv vulkan med en enorm krater.",
      "Yellow, white, red and blue stripes with a green triangle holding a crescent and four stars.","Ränder i gult, vitt, rött och blått med en grön triangel med en halvmåne och fyra stjärnor."],
    ["mw","Malawi","Malawi","","eaf",21,"Lilongwe","","tz mz zm",
      "Its great lake is said to hold more fish species than any other lake on Earth.","Dess stora sjö sägs ha fler fiskarter än någon annan sjö på jorden.",
      "Nsima, a maize porridge, with chambo fish from the lake.","Nsima, en majsgröt, med chambofisk från sjön.",
      "Mount Mulanje, a granite massif rising from the plains.","Mulanje, ett granitmassiv som reser sig ur slätten.",
      "Black, red and green horizontal stripes with a red rising sun.","Vågräta fält i svart, rött och grönt med en röd uppgående sol."],
    ["mz","Mozambique","Moçambique","mocambique","eaf",34,"Maputo","","tz mw zm zw za sz",
      "Dugongs, rare sea cows, live off its coast in the Bazaruto Archipelago.","Dugonger, sällsynta sjökor, lever vid kusten i Bazarutoarkipelagen.",
      "Piri-piri chicken and grilled prawns.","Piri-piri-kyckling och grillade räkor.",
      "An island town of old Portuguese buildings, a World Heritage Site.","En ö-stad med gamla portugisiska byggnader, ett världsarv.",
      "Green, black and yellow stripes, a red triangle with a star, a book, a hoe and a rifle.","Grönt, svart och gult, en röd triangel med en stjärna, en bok, en hacka och ett gevär."],
    ["zm","Zambia","Zambia","","eaf",21,"Lusaka","","zw mw tz cd ao na mz bw",
      "It shares one of the world's largest waterfalls with its southern neighbour.","Landet delar ett av världens största vattenfall med sitt södra grannland.",
      "Nshima, a maize porridge, with relishes.","Nshima, en majsgröt, med tillbehör.",
      "Victoria Falls, and the 'Devil's Pool' at the very edge.","Victoriafallen och 'Djävulens pool' allra längst ut på kanten.",
      "Green with an orange eagle above red, black and orange vertical stripes.","Grön med en orange örn ovanför lodräta ränder i rött, svart och orange."],
    ["zw","Zimbabwe","Zimbabwe","rhodesia","eaf",16.6,"Harare","","za bw zm mz",
      "It has 16 official languages, more than almost any other country.","Landet har 16 officiella språk, fler än nästan något annat land.",
      "Sadza, a stiff maize porridge, eaten with relish.","Sadza, en fast majsgröt, som äts med tillbehör.",
      "The ruins of a medieval stone city that gave the country its name.","Ruinerna av en medeltida stenstad som gett landet dess namn.",
      "Green, yellow, red and black stripes with a white triangle holding a bird.","Grönt, gult, rött och svart med en vit triangel med en fågel."],

    // Southern Africa
    ["za","South Africa","Sydafrika","rsa","saf",63,"","","na bw zw mz",
      "It has three capital cities.","Landet har tre huvudstäder.",
      "Braai barbecues, bobotie and biltong.","Braai (grillfest), bobotie och biltong.",
      "Table Mountain above Cape Town.","Taffelberget ovanför Kapstaden.",
      "A green Y shape edged in white and gold, with red, blue and a black triangle.","En grön liggande Y-form med vit och gul kant, med rött, blått och en svart triangel."],
    ["na","Namibia","Namibia","","saf",3.0,"Windhoek","","ao bw za zm",
      "It has some of the world's tallest sand dunes and ghostly shipwrecks along its coast.","Här finns några av världens högsta sanddyner och spöklika skeppsvrak längs kusten.",
      "Kapana, street-grilled beef, and oryx steaks.","Kapana, gatugrillat nötkött, och oryxbiff.",
      "Deadvlei, with dead trees among red dunes.","Deadvlei, med döda träd bland röda sanddyner.",
      "A red diagonal band edged in white between blue and green, with a yellow sun.","Ett rött diagonalt band med vit kant mellan blått och grönt, med en gul sol."],
    ["bw","Botswana","Botswana","","saf",2.5,"Gaborone","","na za zw zm",
      "It has the largest population of African elephants in the world.","Landet har världens största bestånd av afrikanska elefanter.",
      "Seswaa, slow-cooked pounded beef.","Seswaa, långkokt och sönderstött nötkött.",
      "The Okavango Delta, a river delta that never reaches the sea.","Okavangodeltat, ett floddelta som aldrig når havet.",
      "Light blue with a black stripe edged in white.","Ljusblå med ett svart band med vita kanter."],
    ["ls","Lesotho","Lesotho","","saf",2.3,"Maseru","","za",
      "It is completely surrounded by one other country, and all of it lies over 1,000 m above sea level.","Landet är helt omgivet av ett annat land, och allt ligger över 1 000 meter över havet.",
      "Papa, a maize porridge, with moroho (leafy greens).","Papa, en majsgröt, med moroho (bladgrönsaker).",
      "Maletsunyane Falls, with a single drop of about 190 m.","Maletsunyanefallen, med ett fritt fall på omkring 190 meter.",
      "Blue, white and green stripes with a black Basotho hat.","Blått, vitt och grönt med en svart basothohatt."],
    ["sz","Eswatini","Eswatini","swaziland","saf",1.2,"","","za mz",
      "It is one of the last absolute monarchies in the world.","Det är en av världens sista absoluta monarkier.",
      "Sishwala, a thick maize porridge, with meat.","Sishwala, en tjock majsgröt, med kött.",
      "The yearly Umhlanga reed dance and the Mlilwane wildlife sanctuary.","Den årliga vassdansen Umhlanga och viltreservatet Mlilwane.",
      "Blue, yellow and crimson stripes with a black-and-white shield and spears.","Blått, gult och karmosinrött med en svart och vit sköld och spjut."],

    // North and Central America
    ["us","United States","USA","usa|u s a|us|u s|united states of america|america|amerika|forenta staterna","nam",340,"Washington, D.C.","","ca mx",
      "Its national anthem uses the tune of an old British gentlemen's club song.","Nationalsången går på melodin till en gammal sång från en brittisk herrklubb.",
      "Hamburgers, apple pie and Thanksgiving turkey.","Hamburgare, äppelpaj och kalkon på Thanksgiving.",
      "The Statue of Liberty and the Grand Canyon.","Frihetsgudinnan och Grand Canyon.",
      "Thirteen red and white stripes with fifty white stars on blue.","Tretton röda och vita ränder med femtio vita stjärnor på blått."],
    ["ca","Canada","Kanada","","nam",40,"Ottawa","","us",
      "It has the longest coastline of any country in the world.","Landet har den längsta kusten av alla länder i världen.",
      "Poutine: fries with cheese curds and gravy.","Poutine: pommes frites med ostbitar och sky.",
      "Niagara Falls and the CN Tower.","Niagarafallen och CN Tower.",
      "A red maple leaf on white between two red bands.","Ett rött lönnlöv på vitt mellan två röda fält."],
    ["mx","Mexico","Mexiko","mejico","nam",130,"Mexico City","","us gt bz",
      "Its capital is slowly sinking because it was built on an old lake bed.","Huvudstaden sjunker långsamt eftersom den byggdes på en gammal sjöbotten.",
      "Tacos, mole sauce and guacamole.","Tacos, molesås och guacamole.",
      "Chichén Itzá, a Maya step pyramid.","Chichén Itzá, en mayansk trappstegspyramid.",
      "Green, white and red vertical stripes with an eagle eating a snake on a cactus.","Lodräta fält i grönt, vitt och rött med en örn som äter en orm på en kaktus."],
    ["gt","Guatemala","Guatemala","","cam",18,"Guatemala City","","mx bz sv hn",
      "The quetzal bird is both a national symbol and the name of its currency.","Fågeln quetzal är både nationalsymbol och namnet på valutan.",
      "Pepián, a rich spiced meat stew.","Pepián, en fyllig kryddig köttgryta.",
      "Tikal, Maya pyramids rising above the jungle.","Tikal, mayapyramider som reser sig över djungeln.",
      "Light blue, white and light blue vertical stripes with an emblem showing a quetzal.","Lodräta fält i ljusblått, vitt och ljusblått med ett emblem med en quetzal."],
    ["bz","Belize","Belize","british honduras","cam",0.41,"Belmopan","","mx gt",
      "It is the only Central American country with English as its official language.","Det är det enda landet i Centralamerika med engelska som officiellt språk.",
      "Rice and beans cooked in coconut milk, with stewed chicken.","Ris och bönor kokta i kokosmjölk, med kycklinggryta.",
      "The Great Blue Hole, a giant underwater sinkhole.","Great Blue Hole, ett enormt slukhål under vattnet.",
      "Blue with red bands at the top and bottom and a coat of arms in a white disc.","Blå med röda band upptill och nertill och ett vapen i en vit cirkel."],
    ["sv","El Salvador","El Salvador","salvador","cam",6.3,"San Salvador","","gt hn",
      "In 2021 it became the first country to make Bitcoin legal tender.","År 2021 blev det första landet att göra bitcoin till lagligt betalningsmedel.",
      "Pupusas, thick corn tortillas stuffed with cheese or beans.","Pupusas, tjocka majstortillor fyllda med ost eller bönor.",
      "Joya de Cerén, a Maya village preserved under volcanic ash.","Joya de Cerén, en mayaby som bevarats under vulkanaska.",
      "Blue, white and blue horizontal stripes with a coat of arms.","Vågräta fält i blått, vitt och blått med ett vapen."],
    ["hn","Honduras","Honduras","","cam",10.6,"Tegucigalpa","","gt sv ni",
      "Its Bay Islands lie on the second-largest barrier reef in the world.","Dess Bay Islands ligger vid världens näst största barriärrev.",
      "Baleadas, flour tortillas filled with beans and cream.","Baleadas, vetetortillor fyllda med bönor och grädde.",
      "The Maya ruins of Copán.","Mayaruinerna i Copán.",
      "Blue, white and blue horizontal stripes with five blue stars.","Vågräta fält i blått, vitt och blått med fem blå stjärnor."],
    ["ni","Nicaragua","Nicaragua","","cam",7.0,"Managua","","hn cr",
      "It is the largest country in Central America.","Det är det största landet i Centralamerika.",
      "Gallo pinto, rice and beans fried together.","Gallo pinto, ris och bönor stekta tillsammans.",
      "Colonial Granada, and a lake with a volcanic island, Ometepe.","Koloniala Granada och en sjö med en vulkanö, Ometepe.",
      "Blue, white and blue horizontal stripes with a triangle emblem.","Vågräta fält i blått, vitt och blått med ett triangelformat emblem."],
    ["cr","Costa Rica","Costa Rica","","cam",5.2,"San José","","ni pa",
      "It abolished its army in 1948.","Landet avskaffade sin armé 1948.",
      "Gallo pinto for breakfast, and casado plates of rice, beans and meat.","Gallo pinto till frukost och casado, tallrikar med ris, bönor och kött.",
      "Arenal Volcano and the cloud forest of Monteverde.","Vulkanen Arenal och molnskogen i Monteverde.",
      "Blue, white, red, white and blue horizontal stripes, the red twice as wide.","Vågräta ränder i blått, vitt, rött, vitt och blått, där det röda är dubbelt så brett."],
    ["pa","Panama","Panama","","cam",4.5,"Panama City","","cr co",
      "Its currency is tied one-to-one to the US dollar, which is also used freely.","Valutan är knuten ett till ett till US-dollarn, som också används fritt.",
      "Sancocho, a chicken and root vegetable soup.","Sancocho, en soppa på kyckling och rotfrukter.",
      "A canal linking the Atlantic and Pacific oceans.","En kanal som förbinder Atlanten och Stilla havet.",
      "Quartered: white with a blue star, red, blue, and white with a red star.","Fyrdelad: vitt med en blå stjärna, rött, blått och vitt med en röd stjärna."],

    // Caribbean
    ["cu","Cuba","Kuba","","car",10,"Havana","Havanna","",
      "Classic American cars from the 1950s are still a common sight on its streets.","Klassiska amerikanska bilar från 1950-talet syns fortfarande ofta på gatorna.",
      "Ropa vieja, shredded beef with rice and black beans.","Ropa vieja, strimlat nötkött med ris och svarta bönor.",
      "The seafront Malecón and the colourful old town of the capital.","Strandpromenaden Malecón och huvudstadens färgglada gamla stad.",
      "Blue and white stripes with a white star on a red triangle.","Blå och vita ränder med en vit stjärna på en röd triangel."],
    ["jm","Jamaica","Jamaica","","car",2.8,"Kingston","","",
      "Its bobsleigh team famously competed at the 1988 Winter Olympics.","Dess boblag tävlade i vinter-OS 1988, en berömd historia.",
      "Jerk chicken, and ackee with saltfish.","Jerkkyckling och akee med saltfisk.",
      "Dunn's River Falls, waterfalls you can climb.","Dunn's River Falls, vattenfall som man kan klättra uppför.",
      "A gold diagonal cross with green triangles top and bottom and black ones at the sides.","Ett gult diagonalkors med gröna trianglar upptill och nertill och svarta på sidorna."],
    ["ht","Haiti","Haiti","","car",11.7,"Port-au-Prince","","do",
      "In 1804 it became the first country founded by formerly enslaved people.","År 1804 blev det första landet som grundades av tidigare förslavade människor.",
      "Griot, fried pork, with pikliz, spicy pickled vegetables.","Griot, friterat fläsk, med pikliz, starka inlagda grönsaker.",
      "Citadelle Laferrière, a huge mountaintop fortress.","Citadelle Laferrière, en jättelik fästning på en bergstopp.",
      "Blue over red with a coat of arms on a white square.","Blått över rött med ett vapen på en vit ruta."],
    ["do","Dominican Republic","Dominikanska republiken","dominican rep","car",11.3,"Santo Domingo","","ht",
      "Its capital has the oldest cathedral in the Americas.","Huvudstaden har den äldsta katedralen i Amerika.",
      "La bandera: rice, beans and stewed meat.","La bandera: ris, bönor och kött i gryta.",
      "The beaches of Punta Cana and the colonial quarter of the capital.","Stränderna i Punta Cana och huvudstadens koloniala kvarter.",
      "A white cross between blue and red squares, with a coat of arms in the centre.","Ett vitt kors mellan blå och röda rutor, med ett vapen i mitten."],
    ["bs","Bahamas","Bahamas","the bahamas","car",0.41,"Nassau","","",
      "Swimming pigs live on one of its small islands.","Simmande grisar lever på en av dess små öar.",
      "Conch fritters and cracked conch, made from a large sea snail.","Friterade bollar och schnitzel av conch, en stor havssnäcka.",
      "Dean's Blue Hole, one of the deepest blue holes in the world.","Dean's Blue Hole, ett av världens djupaste 'blå hål'.",
      "Aquamarine, gold and aquamarine stripes with a black triangle at the hoist.","Akvamarin, guld och akvamarin med en svart triangel vid stången."],
    ["bb","Barbados","Barbados","","car",0.28,"Bridgetown","","",
      "The singer Rihanna was born here.","Sångerskan Rihanna föddes här.",
      "Cou-cou and flying fish.","Cou-cou (majsmjölsgröt) och flygfisk.",
      "Harrison's Cave, with glittering crystal formations.","Harrison's Cave, en grotta med glittrande kristallformationer.",
      "Ultramarine, gold and ultramarine vertical stripes with a black trident head.","Lodräta fält i ultramarin, guld och ultramarin med en svart treudd."],
    ["tt","Trinidad and Tobago","Trinidad och Tobago","trinidad|tobago","car",1.4,"Port of Spain","","",
      "The steelpan, a drum made from oil barrels, was invented here.","Steelpan, en trumma gjord av oljefat, uppfanns här.",
      "Doubles: curried chickpeas between two pieces of fried flatbread.","Doubles: currykryddade kikärter mellan två friterade tunnbröd.",
      "Pitch Lake, the largest natural asphalt lake in the world.","Pitch Lake, världens största naturliga asfaltsjö.",
      "Red with a black diagonal band edged in white.","Röd med ett svart diagonalt band med vita kanter."],
    ["dm","Dominica","Dominica","commonwealth of dominica","car",0.073,"Roseau","","",
      "It has a boiling lake, one of the largest of its kind.","Här finns en kokande sjö, en av de största i sitt slag.",
      "Callaloo soup and fresh tropical fruit.","Callaloosoppa och färsk tropisk frukt.",
      "Trafalgar Falls, twin waterfalls in the rainforest.","Trafalgarfallen, tvillingvattenfall i regnskogen.",
      "Green with a cross of yellow, black and white stripes and a red disc with a parrot.","Grön med ett kors av gula, svarta och vita ränder och en röd cirkel med en papegoja."],
    ["lc","Saint Lucia","Saint Lucia","st lucia","car",0.18,"Castries","","",
      "It is often said to be the only country named after a woman.","Det sägs ofta vara det enda landet som är uppkallat efter en kvinna.",
      "Green figs (green bananas) and saltfish.","Gröna bananer och saltfisk.",
      "The Pitons, two volcanic spires rising from the sea.","Pitons, två vulkaniska toppar som reser sig ur havet.",
      "Light blue with a yellow triangle in front of black and white triangles.","Ljusblå med en gul triangel framför en svart och vit triangel."],
    ["vc","Saint Vincent and the Grenadines","Saint Vincent och Grenadinerna","st vincent|saint vincent|st vincent and the grenadines","car",0.10,"Kingstown","","",
      "Scenes from Pirates of the Caribbean were filmed here.","Scener ur Pirates of the Caribbean spelades in här.",
      "Roasted breadfruit and fried jackfish.","Rostad brödfrukt och friterad fisk.",
      "La Soufrière, a volcano that erupted in 2021.","La Soufrière, en vulkan som hade utbrott 2021.",
      "Blue, gold and green vertical stripes with three green diamonds.","Lodräta fält i blått, guld och grönt med tre gröna romber."],
    ["gd","Grenada","Grenada","","car",0.12,"St. George's","","",
      "It is nicknamed the Spice Isle for its nutmeg.","Landet kallas Kryddön för sin muskot.",
      "Oil down, a stew of breadfruit, salted meat and coconut milk.","Oil down, en gryta på brödfrukt, saltat kött och kokosmjölk.",
      "An underwater sculpture park off its coast.","En skulpturpark under vattnet utanför kusten.",
      "A red border with six yellow stars, yellow and green triangles, and a nutmeg.","En röd kant med sex gula stjärnor, gula och gröna trianglar och en muskotnöt."],
    ["ag","Antigua and Barbuda","Antigua och Barbuda","antigua|barbuda","car",0.094,"St. John's","","",
      "It is said to have 365 beaches, one for every day of the year.","Det sägs finnas 365 stränder här, en för varje dag på året.",
      "Fungie, a cornmeal dish, and pepperpot stew.","Fungie, en majsmjölsrätt, och grytan pepperpot.",
      "Nelson's Dockyard, an 18th-century naval base.","Nelson's Dockyard, en flottbas från 1700-talet.",
      "Red with a V of black, blue and white and a rising yellow sun.","Rött med ett V i svart, blått och vitt och en gul uppgående sol."],
    ["kn","Saint Kitts and Nevis","Saint Kitts och Nevis","st kitts|saint kitts|st kitts and nevis|nevis","car",0.047,"Basseterre","","",
      "It is the smallest country in the Americas.","Det är det minsta landet i Amerika.",
      "Stewed saltfish with dumplings and breadfruit.","Stuvad saltfisk med klimpar och brödfrukt.",
      "Brimstone Hill Fortress on a volcanic hill.","Fästningen Brimstone Hill på en vulkanisk kulle.",
      "A black diagonal band with two white stars, edged in yellow, between green and red.","Ett svart diagonalt band med två vita stjärnor och gul kant, mellan grönt och rött."],

    // South America
    ["br","Brazil","Brasilien","brasil","sam",216,"Brasília","","ar uy py bo pe co",
      "It is the world's largest coffee producer.","Landet är världens största kaffeproducent.",
      "Feijoada, a stew of black beans and pork.","Feijoada, en gryta på svarta bönor och fläsk.",
      "The Christ the Redeemer statue above Rio de Janeiro.","Kristusstatyn ovanför Rio de Janeiro.",
      "Green with a yellow diamond and a blue globe full of stars.","Grön med en gul romb och en blå jordglob full av stjärnor."],
    ["ar","Argentina","Argentina","","sam",46,"Buenos Aires","","cl bo py br uy",
      "The tango was born in the dance halls of its capital and its neighbour across the river.","Tangon föddes i danslokalerna i huvudstaden och grannstaden på andra sidan floden.",
      "Asado barbecue and empanadas.","Asado (grillat kött) och empanadas.",
      "Iguazú Falls and the Perito Moreno Glacier.","Iguazúfallen och glaciären Perito Moreno.",
      "Light blue, white and light blue stripes with a golden sun with a face.","Ljusblått, vitt och ljusblått med en gyllene sol med ansikte."],
    ["cl","Chile","Chile","","sam",19.6,"Santiago","","pe bo ar",
      "Its Atacama Desert is the driest non-polar desert in the world.","Atacamaöknen här är världens torraste öken utanför polarområdena.",
      "Empanadas de pino, and pastel de choclo, a sweet corn pie.","Empanadas de pino och pastel de choclo, en paj av sockermajs.",
      "The giant moai statues of Easter Island.","De jättelika moaistatyerna på Påskön.",
      "White over red with a white star on a blue square.","Vitt över rött med en vit stjärna på en blå kvadrat."],
    ["pe","Peru","Peru","","sam",34,"Lima","","ec co br bo cl",
      "Thousands of potato varieties grow here, where the potato was first farmed.","Tusentals potatissorter odlas här, där potatisen först odlades.",
      "Ceviche, raw fish cured in lime juice.","Ceviche, rå fisk som marinerats i limejuice.",
      "Machu Picchu, an Inca citadel high in the Andes.","Machu Picchu, en inkastad högt uppe i Anderna.",
      "Red, white and red vertical stripes.","Lodräta fält i rött, vitt och rött."],
    ["co","Colombia","Colombia","","sam",52,"Bogotá","","pa ve br pe ec",
      "It has more bird species than any other country.","Landet har fler fågelarter än något annat land.",
      "Arepas, and bandeja paisa, a hearty mixed platter.","Arepas och bandeja paisa, en mäktig blandad tallrik.",
      "The walled old city of Cartagena.","Den muromgärdade gamla staden i Cartagena.",
      "Yellow, blue and red horizontal stripes, the yellow twice as wide.","Vågräta fält i gult, blått och rött, där det gula är dubbelt så brett."],
    ["ve","Venezuela","Venezuela","","sam",28,"Caracas","","co br gy",
      "Its Catatumbo lightning lights up the sky on more than 100 nights a year.","Catatumboblixtarna lyser upp himlen här mer än 100 nätter om året.",
      "Arepas, and pabellón criollo: shredded beef, black beans, rice and plantain.","Arepas och pabellón criollo: strimlat kött, svarta bönor, ris och kokbanan.",
      "Angel Falls, the highest uninterrupted waterfall in the world.","Ángelfallet, världens högsta vattenfall med obrutet fall.",
      "Yellow, blue and red horizontal stripes with an arc of eight white stars.","Vågräta fält i gult, blått och rött med en båge av åtta vita stjärnor."],
    ["ec","Ecuador","Ecuador","","sam",18,"Quito","","co pe",
      "The summit of its volcano Chimborazo is the farthest point from the centre of the Earth.","Toppen på dess vulkan Chimborazo är den punkt som ligger längst från jordens medelpunkt.",
      "Locro de papa, a cheesy potato soup topped with avocado.","Locro de papa, en potatissoppa med ost, toppad med avokado.",
      "The Galápagos Islands, famous for giant tortoises.","Galápagosöarna, kända för jättesköldpaddor.",
      "Yellow, blue and red horizontal stripes with a coat of arms showing a condor.","Vågräta fält i gult, blått och rött med ett vapen med en kondor."],
    ["bo","Bolivia","Bolivia","","sam",12.3,"","","pe br ar cl py",
      "It has two capitals, and one is the highest seat of government in the world.","Landet har två huvudstäder, och den ena är världens högst belägna regeringssäte.",
      "Salteñas, juicy baked pastries filled with stew.","Salteñas, saftiga bakade piroger fyllda med gryta.",
      "Salar de Uyuni, the largest salt flat in the world.","Salar de Uyuni, världens största saltslätt.",
      "Red, yellow and green horizontal stripes.","Vågräta fält i rött, gult och grönt."],
    ["py","Paraguay","Paraguay","","sam",6.9,"Asunción","","ar br bo",
      "Most people here speak Guaraní, an Indigenous language, alongside Spanish.","De flesta här talar guaraní, ett ursprungsspråk, vid sidan av spanska.",
      "Chipa, cheesy bread rolls, and tereré, iced yerba mate.","Chipa, små ostbröd, och tereré, iskallt yerba mate.",
      "The Itaipú Dam, one of the world's largest hydroelectric plants.","Itaipúdammen, ett av världens största vattenkraftverk.",
      "Red, white and blue horizontal stripes with a different emblem on each side.","Vågräta fält i rött, vitt och blått med olika emblem på var sida."],
    ["uy","Uruguay","Uruguay","","sam",3.4,"Montevideo","","ar br",
      "It hosted and won the first football World Cup, in 1930.","Landet var värd för och vann det första fotbolls-VM, 1930.",
      "Chivito, a huge steak sandwich, and mate tea.","Chivito, en stor biffmacka, och mate.",
      "The colonial old town of Colonia del Sacramento.","Den koloniala gamla staden i Colonia del Sacramento.",
      "Nine white and blue stripes with a golden sun with a face.","Nio vita och blå ränder med en gyllene sol med ansikte."],
    ["gy","Guyana","Guyana","","sam",0.81,"Georgetown","","ve br sr",
      "It is the only South American country with English as its official language.","Det är det enda landet i Sydamerika med engelska som officiellt språk.",
      "Pepperpot, a dark meat stew made with cassava juice.","Pepperpot, en mörk köttgryta som görs med kassavasaft.",
      "Kaieteur Falls, one of the most powerful single-drop waterfalls in the world.","Kaieteurfallet, ett av världens kraftigaste vattenfall med ett enda fall.",
      "Green with a red and a gold arrowhead outlined in black and white.","Grön med en röd och en gul pilspets med svart och vit kant."],
    ["sr","Suriname","Surinam","surinam","sam",0.62,"Paramaribo","","gy br",
      "It is the smallest country in South America, and Dutch is its official language.","Det är Sydamerikas minsta land, och nederländska är officiellt språk.",
      "Pom, an oven dish of chicken and a grated tropical root.","Pom, en ugnsrätt med kyckling och en riven tropisk rotfrukt.",
      "The wooden colonial inner city of the capital.","Huvudstadens koloniala innerstad med trähus.",
      "Green, white, red, white and green stripes with a yellow star.","Ränder i grönt, vitt, rött, vitt och grönt med en gul stjärna."],

    // Oceania
    ["au","Australia","Australien","aussie|oz","oc",27,"Canberra","","",
      "It has more than 10,000 beaches.","Landet har mer än 10 000 stränder.",
      "Vegemite on toast, and meat pies.","Vegemite på rostat bröd, och köttpajer.",
      "The Sydney Opera House and Uluru.","Operahuset i Sydney och Uluru.",
      "Dark blue with the Union Jack, a large seven-pointed star and the Southern Cross.","Mörkblå med Union Jack, en stor sjuuddig stjärna och Södra korset."],
    ["nz","New Zealand","Nya Zeeland","nz|aotearoa|nya zealand","oc",5.3,"Wellington","","",
      "In 1893 it became the first country where women could vote in national elections.","År 1893 blev det första landet där kvinnor fick rösta i nationella val.",
      "Hāngī, food cooked in an earth oven, and pavlova.","Hāngī, mat som tillagas i en jordugn, och pavlova.",
      "Milford Sound and the Hobbiton film set.","Milford Sound och filmkulissen Hobbiton.",
      "Dark blue with the Union Jack and four red stars edged in white.","Mörkblå med Union Jack och fyra röda stjärnor med vit kant."],
    ["pg","Papua New Guinea","Papua Nya Guinea","png|papua","oc",10.3,"Port Moresby","","id",
      "More than 800 languages are spoken here, more than in any other country.","Fler än 800 språk talas här, fler än i något annat land.",
      "Mumu: pork and sweet potatoes cooked on hot stones in the ground.","Mumu: fläsk och sötpotatis som tillagas på heta stenar i marken.",
      "The Kokoda Track through the mountains.","Kokodaleden genom bergen.",
      "Divided diagonally: red with a yellow bird of paradise, and black with five white stars.","Diagonalt delad: rött med en gul paradisfågel, och svart med fem vita stjärnor."],
    ["fj","Fiji","Fiji","","oc",0.93,"Suva","","",
      "Its rugby sevens team won the country's first Olympic gold medal, in 2016.","Landslaget i sjumannarugby tog landets första OS-guld 2016.",
      "Kokoda, raw fish marinated in lime and coconut milk.","Kokoda, rå fisk marinerad i lime och kokosmjölk.",
      "More than 300 islands surrounded by coral reefs.","Mer än 300 öar omgivna av korallrev.",
      "Light blue with the Union Jack and a shield.","Ljusblå med Union Jack och en sköld."],
    ["sb","Solomon Islands","Salomonöarna","solomons|solomon","oc",0.75,"Honiara","","",
      "Some of the fiercest battles of the Second World War were fought at Guadalcanal here.","Några av andra världskrigets hårdaste strider utkämpades på Guadalcanal här.",
      "Fish and root vegetables cooked in coconut milk.","Fisk och rotfrukter kokta i kokosmjölk.",
      "Marovo Lagoon, one of the largest saltwater lagoons in the world.","Marovolagunen, en av världens största saltvattenlaguner.",
      "Blue and green triangles split by a thin yellow diagonal, with five white stars.","En blå och en grön triangel åtskilda av ett smalt gult diagonalt band, med fem vita stjärnor."],
    ["vu","Vanuatu","Vanuatu","new hebrides","oc",0.33,"Port Vila","","",
      "Land diving, a forerunner of bungee jumping, is a tradition on one of its islands.","Landdykning, en föregångare till bungyjump, är en tradition på en av öarna.",
      "Lap lap, grated root vegetables baked in banana leaves.","Lap lap, rivna rotfrukter som bakas i bananblad.",
      "Mount Yasur, a volcano where you can watch eruptions up close.","Yasur, en vulkan där man kan se utbrott på nära håll.",
      "Red and green split by a black and yellow Y, with a curled boar's tusk.","Rött och grönt åtskilda av ett svart och gult Y, med en böjd galtbete."],
    ["ws","Samoa","Samoa","western samoa","oc",0.22,"Apia","","",
      "In 2011 it skipped a whole day to move to the other side of the date line.","År 2011 hoppade landet över en hel dag för att byta sida om datumgränsen.",
      "Palusami, taro leaves baked in coconut cream.","Palusami, tarablad som bakas i kokosgrädde.",
      "To Sua Ocean Trench, a swimming hole inside a giant sinkhole.","To Sua Ocean Trench, en badplats inne i ett enormt slukhål.",
      "Red with a blue corner holding the five white stars of the Southern Cross.","Röd med ett blått hörn med Södra korsets fem vita stjärnor."],
    ["to","Tonga","Tonga","","oc",0.10,"Nukuʻalofa","","",
      "It is a kingdom that was never formally colonised.","Det är ett kungarike som aldrig formellt koloniserades.",
      "Ota ika, raw fish in coconut cream.","Ota ika, rå fisk i kokosgrädde.",
      "Humpback whales that come to breed in its waters every year.","Knölvalar som kommer för att föröka sig i dess vatten varje år.",
      "Red with a red cross on a white corner.","Röd med ett rött kors i ett vitt hörn."],
    ["ki","Kiribati","Kiribati","","oc",0.13,"Tarawa","","",
      "It is the only country that lies in all four hemispheres.","Det är det enda landet som ligger på alla fyra halvkloten.",
      "Fish, coconut and giant swamp taro.","Fisk, kokos och jättetaro.",
      "Kiritimati (Christmas Island), one of the largest coral atolls in the world.","Kiritimati (Julön), en av världens största korallatoller.",
      "Red top with a gold frigatebird above a rising sun; blue and white waves below.","Röd övre del med en fregattfågel i guld ovanför en uppgående sol; blå och vita vågor nedanför."],
    ["tv","Tuvalu","Tuvalu","ellice islands","oc",0.011,"Funafuti","","",
      "It earns money by licensing its internet domain, .tv.","Landet tjänar pengar på att hyra ut sin internetdomän .tv.",
      "Pulaka, a giant swamp taro, and fresh fish.","Pulaka, en jättetaro, och färsk fisk.",
      "An atoll where the airport runway doubles as a public space.","En atoll där landningsbanan också används som allmän plats.",
      "Light blue with the Union Jack and nine yellow stars.","Ljusblå med Union Jack och nio gula stjärnor."],
    ["nr","Nauru","Nauru","","oc",0.012,"","","",
      "It is the world's smallest republic and has no official capital.","Det är världens minsta republik och saknar officiell huvudstad.",
      "Fish with coconut and rice.","Fisk med kokos och ris.",
      "A ring road of about 19 km that goes all the way around the island.","En ringväg på omkring 19 km som går runt hela ön.",
      "Blue with a thin yellow horizontal line and a white 12-pointed star.","Blå med en smal gul vågrät linje och en vit tolvuddig stjärna."],
    ["fm","Micronesia","Mikronesiska federationen","federated states of micronesia|fsm|mikronesien","oc",0.11,"Palikir","","",
      "On one of its islands, giant stone discs are used as traditional money.","På en av öarna används jättelika stenhjul som traditionella pengar.",
      "Breadfruit, taro and fish.","Brödfrukt, taro och fisk.",
      "Nan Madol, ruins of an ancient city built on small artificial islands.","Nan Madol, ruiner av en forntida stad byggd på små konstgjorda öar.",
      "Light blue with four white stars in a diamond.","Ljusblå med fyra vita stjärnor i en romb."],
    ["mh","Marshall Islands","Marshallöarna","marshalls|marshall","oc",0.04,"Majuro","","",
      "Its Bikini Atoll gave its name to the two-piece swimsuit.","Bikiniatollen här gav namn åt den tvådelade baddräkten.",
      "Coconut crab, breadfruit and pandanus.","Palmtjuv (kokoskrabba), brödfrukt och pandanus.",
      "Majuro, a long, thin ring-shaped atoll.","Majuro, en lång och smal ringformad atoll.",
      "Blue with orange and white diagonal bands and a white star with 24 points.","Blå med orange och vita diagonala band och en vit stjärna med 24 uddar."],
    ["pw","Palau","Palau","belau","oc",0.018,"Ngerulmud","","",
      "Its Jellyfish Lake is full of jellyfish that barely sting.","Manetsjön här är full av maneter som knappt bränns.",
      "Taro, tapioca and fresh reef fish.","Taro, tapioka och färsk revfisk.",
      "The Rock Islands, hundreds of mushroom-shaped limestone islets.","Rock Islands, hundratals svampformade små kalkstensöar.",
      "A yellow disc slightly off-centre on light blue.","En gul cirkel något förskjuten från mitten på ljusblå botten."]
  ];

  // Countries that span Europe and Asia (shown as such in clue 2).
  const TRANS = new Set(['ru', 'tr', 'kz', 'ge', 'am', 'az', 'cy']);

  // Population wording where estimates differ a lot between sources.
  const POP_TEXT = {
    ua: ['over 30 million', 'över 30 miljoner'],
    er: ['about 3 to 4 million', 'omkring 3–4 miljoner'],
    tm: ['about 6 to 7 million', 'omkring 6–7 miljoner'],
    pg: ['over 10 million', 'över 10 miljoner'],
    cy: ['about 1 million', 'omkring 1 miljon']
  };

  // Clue 6 overrides.
  const CLUE6 = {
    cy: ['An island in the eastern Mediterranean. Capital starts with “N”.', 'En ö i östra Medelhavet. Huvudstaden börjar på ”N”.']
  };

  const REGIONS = {
    neu: ['Northern Europe', 'Nordeuropa', 'eu'], weu: ['Western Europe', 'Västeuropa', 'eu'],
    seu: ['Southern Europe', 'Sydeuropa', 'eu'], eeu: ['Eastern Europe', 'Östeuropa', 'eu'],
    cau: ['the Caucasus', 'Kaukasus', 'as'], wa: ['the Middle East', 'Mellanöstern', 'as'],
    ca: ['Central Asia', 'Centralasien', 'as'], sa: ['South Asia', 'Sydasien', 'as'],
    ea: ['East Asia', 'Östasien', 'as'], sea: ['Southeast Asia', 'Sydostasien', 'as'],
    naf: ['North Africa', 'Nordafrika', 'af'], waf: ['West Africa', 'Västafrika', 'af'],
    caf: ['Central Africa', 'Centralafrika', 'af'], eaf: ['East Africa', 'Östafrika', 'af'],
    saf: ['Southern Africa', 'södra Afrika', 'af'], car: ['the Caribbean', 'Karibien', 'nam'],
    cam: ['Central America', 'Centralamerika', 'nam'], nam: ['North America', 'Nordamerika', 'nam'],
    sam: ['South America', 'Sydamerika', 'sam'], oc: ['Oceania', 'Oceanien', 'oc']
  };
  const CONTINENTS = {
    eu: ['Europe', 'Europa'], as: ['Asia', 'Asien'], af: ['Africa', 'Afrika'],
    nam: ['North America', 'Nordamerika'], sam: ['South America', 'Sydamerika'], oc: ['Oceania', 'Oceanien'],
    euas: ['Europe and Asia', 'Europa och Asien']
  };

  const countries = RAW.map(r => ({
    iso: r[0], en: r[1], sv: r[2], aliases: r[3] ? r[3].split('|') : [], region: r[4], pop: r[5],
    capEn: r[6], capSv: r[7] || r[6], nb: r[8] ? r[8].split(' ') : [],
    fact: [r[9], r[10]], food: [r[11], r[12]], sight: [r[13], r[14]], flag: [r[15], r[16]]
  }));
  const byIso = Object.create(null);
  countries.forEach(c => { byIso[c.iso] = c; });

  // ---------- text helpers ----------
  const FOLD = { 'ø': 'o', 'æ': 'ae', 'œ': 'oe', 'ß': 'ss', 'đ': 'd', 'ð': 'd', 'ł': 'l', 'ı': 'i', 'þ': 'th' };
  function normalize(s) {
    return String(s == null ? '' : s).toLowerCase()
      .replace(/[øæœßđðłıþ]/g, ch => FOLD[ch])
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/&/g, ' and ')
      .replace(/['’ʻ`´.]/g, '')
      .replace(/[^a-z0-9]+/g, ' ').trim()
      .replace(/\bst\b/g, 'saint')
      .replace(/\boch\b/g, 'and')
      .replace(/^the /, '');
  }
  const compact = s => normalize(s).replace(/ /g, '');

  // Index every name and alias. Swedish "och" is folded to "and" so both spellings meet.
  const nameIndex = new Map();
  countries.forEach(c => {
    c.keys = [...new Set([c.en, c.sv, ...c.aliases].map(compact).filter(Boolean))];
    c.keys.forEach(k => { if (!nameIndex.has(k)) nameIndex.set(k, c.iso); });
  });

  function name(c, lang) { return lang === 'sv' ? c.sv : c.en; }

  function match(input) {
    const k = compact(input);
    if (!k) return null;
    const iso = nameIndex.get(k);
    return iso ? byIso[iso] : null;
  }

  // Ranked type-ahead. Returns [{ country, label, hint }].
  function suggest(input, lang, limit) {
    const q = normalize(input);
    if (!q) return [];
    const qc = q.replace(/ /g, '');
    const out = [];
    countries.forEach(c => {
      const primary = name(c, lang), other = name(c, lang === 'sv' ? 'en' : 'sv');
      const cands = [[primary, 0], [other, 1], ...c.aliases.map(a => [a, 2])];
      let best = null;
      for (const [text, w] of cands) {
        const n = normalize(text), nc = n.replace(/ /g, '');
        let score = null;
        if (nc === qc) score = 0 + w;
        else if (nc.startsWith(qc)) score = 10 + w;
        else if (n.split(' ').some(word => word.startsWith(q))) score = 20 + w;
        else if (qc.length >= 3 && nc.includes(qc)) score = 30 + w;
        if (score !== null && (!best || score < best.score)) best = { score, text };
      }
      if (best) {
        const hint = normalize(best.text) === normalize(primary) ? '' : best.text;
        out.push({ country: c, label: primary, hint, score: best.score });
      }
    });
    out.sort((a, b) => a.score - b.score || a.label.localeCompare(b.label, lang === 'sv' ? 'sv' : 'en'));
    return out.slice(0, limit || 6);
  }

  function fmtNum(n, lang) {
    return lang === 'sv' ? n.toLocaleString('sv-SE').replace(/ /g, ' ') : n.toLocaleString('en-US');
  }
  function fmtDec(n, lang) {
    const s = (Math.round(n * 10) / 10).toString();
    return lang === 'sv' ? s.replace('.', ',') : s;
  }
  function popText(c, lang) {
    const L = lang === 'sv' ? 1 : 0;
    if (POP_TEXT[c.iso]) return POP_TEXT[c.iso][L];
    const p = c.pop, about = L ? 'omkring ' : 'about ';
    if (p < 0.001) return L ? 'färre än 1 000' : 'fewer than 1,000';
    if (p < 1) {
      const digits = Math.floor(Math.log10(p * 1e6)) + 1;
      const unit = Math.pow(10, Math.max(digits - 2, 0));
      return about + fmtNum(Math.round(p * 1e6 / unit) * unit, lang);
    }
    if (p < 20) return about + fmtDec(p, lang) + (L ? ' miljoner' : ' million');
    if (p < 100) return about + Math.round(p) + (L ? ' miljoner' : ' million');
    if (p < 1000) return about + Math.round(p / 10) * 10 + (L ? ' miljoner' : ' million');
    return about + fmtDec(p / 1000, lang) + (L ? ' miljarder' : ' billion');
  }

  function continentText(c, lang) {
    const L = lang === 'sv' ? 1 : 0;
    return CONTINENTS[TRANS.has(c.iso) ? 'euas' : REGIONS[c.region][2]][L];
  }

  function listJoin(items, lang) {
    if (items.length < 2) return items.join('');
    return items.slice(0, -1).join(', ') + (lang === 'sv' ? ' och ' : ' and ') + items[items.length - 1];
  }

  function clue6(c, lang) {
    const L = lang === 'sv' ? 1 : 0;
    if (CLUE6[c.iso]) return CLUE6[c.iso][L];
    const parts = [];
    const nbs = c.nb.map(i => byIso[i]).filter(Boolean).slice(0, 3).map(n => name(n, lang));
    if (nbs.length === 1) parts.push(L ? `Har landgräns mot ${nbs[0]}.` : `Shares a land border with ${nbs[0]}.`);
    else if (nbs.length > 1) parts.push(L ? `Grannländer är bland annat ${listJoin(nbs, lang)}.` : `Neighbours include ${listJoin(nbs, lang)}.`);
    else parts.push(L ? `Ett östat i ${REGIONS[c.region][1]}, utan landgränser.` : `An island country in ${REGIONS[c.region][0]}, with no land borders.`);
    const cap = L ? c.capSv : c.capEn;
    if (cap) parts.push(L ? `Huvudstaden börjar på ”${cap[0].toUpperCase()}”.` : `Capital starts with “${cap[0].toUpperCase()}”.`);
    else parts.push(L ? `Namnet börjar på ”${name(c, lang)[0].toUpperCase()}”.` : `Its name starts with “${name(c, lang)[0].toUpperCase()}”.`);
    return parts.join(' ');
  }

  // Six clues, hard to easy.
  function clues(c, lang) {
    const L = lang === 'sv' ? 1 : 0;
    return [
      c.fact[L],
      L ? `Världsdel: ${continentText(c, lang)}. Folkmängd: ${popText(c, lang)}.`
        : `Continent: ${continentText(c, lang)}. Population: ${popText(c, lang)}.`,
      c.food[L],
      c.sight[L],
      c.flag[L],
      clue6(c, lang)
    ];
  }

  function flagEmoji(iso) {
    return String.fromCodePoint(...iso.toUpperCase().split('').map(ch => 0x1F1E6 + ch.charCodeAt(0) - 65));
  }

  // ---------- daily puzzle ----------
  const LAUNCH = '2026-10-23';
  const TZ = 'Europe/Stockholm';

  function zonedParts(date) {
    const f = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
    const p = {};
    f.formatToParts(date).forEach(x => { if (x.type !== 'literal') p[x.type] = Number(x.value); });
    return p;
  }
  function stockholmDate(date) {
    const p = zonedParts(date || new Date());
    return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
  }
  function daysBetween(a, b) {
    const [y1, m1, d1] = a.split('-').map(Number), [y2, m2, d2] = b.split('-').map(Number);
    return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
  }
  // Puzzle #1 is launch day. Before launch the game shows #1.
  function puzzleNumber(date) {
    return Math.max(1, daysBetween(LAUNCH, stockholmDate(date || new Date())) + 1);
  }
  function dateForPuzzle(n) {
    const [y, m, d] = LAUNCH.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + n - 1, 12));
  }
  function offsetMs(date) {
    const p = zonedParts(date);
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(date.getTime() / 1000) * 1000;
  }
  function msUntilNextPuzzle(date) {
    const now = date || new Date();
    const p = zonedParts(now);
    const elapsed = ((p.hour * 60 + p.minute) * 60 + p.second) * 1000 + now.getMilliseconds();
    let next = now.getTime() + 86400000 - elapsed;
    next += offsetMs(now) - offsetMs(new Date(next));
    return Math.max(0, next - now.getTime());
  }

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function related(a, b) {
    if (!a || !b) return false;
    const A = byIso[a], B = byIso[b];
    return A.region === B.region || A.nb.includes(b) || B.nb.includes(a);
  }
  // A fixed order per cycle; neighbours and same-region countries never fall on consecutive days.
  const orderCache = new Map();
  function orderForCycle(cycle) {
    if (orderCache.has(cycle)) return orderCache.get(cycle);
    const ids = countries.map(c => c.iso).sort();
    const rnd = mulberry32(0x5C1E5 + cycle * 7919);
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    const prevLast = cycle > 0 ? orderForCycle(cycle - 1).slice(-1)[0] : null;
    for (let i = 0; i < ids.length; i++) {
      const before = i === 0 ? prevLast : ids[i - 1];
      if (!related(before, ids[i])) continue;
      let k = -1;
      for (let j = i + 1; j < ids.length; j++) {
        if (!related(before, ids[j]) && (i + 1 >= ids.length || j === i + 1 || !related(ids[j], ids[i + 1]))) { k = j; break; }
      }
      if (k < 0) for (let j = i + 1; j < ids.length; j++) if (!related(before, ids[j])) { k = j; break; }
      if (k >= 0) [ids[i], ids[k]] = [ids[k], ids[i]];
    }
    // Repair any pair broken by the swaps above.
    for (let pass = 0; pass < 5; pass++) {
      let fixed = true;
      for (let i = 1; i < ids.length; i++) {
        if (!related(ids[i - 1], ids[i])) continue;
        fixed = false;
        for (let j = 1; j < ids.length; j++) {
          if (j === i || j === i - 1) continue;
          const ok = (x, pos) => {
            const prev = pos === 0 ? prevLast : (pos - 1 === i ? ids[j] : pos - 1 === j ? ids[i] : ids[pos - 1]);
            const next = pos + 1 >= ids.length ? null : (pos + 1 === i ? ids[j] : pos + 1 === j ? ids[i] : ids[pos + 1]);
            return !related(prev, x) && !related(x, next);
          };
          if (ok(ids[j], i) && ok(ids[i], j)) { [ids[i], ids[j]] = [ids[j], ids[i]]; break; }
        }
      }
      if (fixed) break;
    }
    orderCache.set(cycle, ids);
    return ids;
  }
  function countryForPuzzle(n) {
    const N = countries.length, idx = Math.max(1, n) - 1;
    return byIso[orderForCycle(Math.floor(idx / N))[idx % N]];
  }

  // ---------- game rules ----------
  const MAX = 6;
  function newRound(answerIso) { return { answer: answerIso, revealed: 1, guesses: [], status: 'playing' }; }
  // Returns { round, result } where result is 'won' | 'wrong' | 'lost' | 'repeat' | 'done'.
  function applyGuess(round, iso) {
    if (round.status !== 'playing') return { round, result: 'done' };
    if (iso && round.guesses.includes(iso)) return { round, result: 'repeat' };
    const r = { ...round, guesses: [...round.guesses, iso || null] };
    if (iso && iso === r.answer) { r.status = 'won'; return { round: r, result: 'won' }; }
    if (r.revealed >= MAX) { r.status = 'lost'; return { round: r, result: 'lost' }; }
    r.revealed += 1;
    return { round: r, result: 'wrong' };
  }
  function grid(round) {
    let s = '';
    for (let i = 0; i < MAX; i++) {
      if (i >= round.guesses.length) s += '⬜';
      else s += round.guesses[i] === round.answer ? '🟩' : '🟥';
    }
    return s;
  }
  const URL = 'https://games.ludvighedin.com/six-clues/';
  function shareText(n, round) {
    const score = round.status === 'won' ? round.guesses.length : 'X';
    return `Six Clues #${n} ${score}/6\n${grid(round)}\n${URL}`;
  }
  function emptyStats() { return { played: 0, wins: 0, hist: [0, 0, 0, 0, 0, 0, 0], streak: 0, maxStreak: 0, lastWin: 0, lastPlayed: 0 }; }
  // Records a finished daily round. Returns the updated stats. Idempotent per puzzle number.
  function recordResult(stats, n, round) {
    const s = { ...emptyStats(), ...stats, hist: [...((stats && stats.hist) || emptyStats().hist)] };
    if (round.status === 'playing' || s.lastPlayed >= n) return s;
    s.played += 1; s.lastPlayed = n;
    if (round.status === 'won') {
      s.wins += 1; s.hist[round.guesses.length] += 1;
      s.streak = s.lastWin === n - 1 ? s.streak + 1 : 1;
      s.lastWin = n; s.maxStreak = Math.max(s.maxStreak, s.streak);
    } else { s.hist[0] += 1; s.streak = 0; }
    return s;
  }
  function currentStreak(stats, n) {
    if (!stats) return 0;
    return stats.lastWin === n || stats.lastWin === n - 1 ? stats.streak : 0;
  }

  root.SixClues = {
    countries, byIso, REGIONS, LAUNCH, URL, MAX,
    normalize, match, suggest, name, clues, popText, flagEmoji,
    stockholmDate, puzzleNumber, dateForPuzzle, msUntilNextPuzzle, orderForCycle, countryForPuzzle, related,
    newRound, applyGuess, grid, shareText, emptyStats, recordResult, currentStreak
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
