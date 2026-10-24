// Kept exclusively on the server: the browser never downloads the answer bank.
import { BANK as EN_BANK } from './prompts-en.mjs';
import { PACKS } from './packs.mjs';
export const normalize = s => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
const words = s => normalize(s).split(' ').filter(w => !['en','ett','den','det','the','a','an'].includes(w));
export function matches(guess, prompt) {
  const g = words(guess).join(' ');
  if (!g) return false;
  return [prompt.answer, ...(prompt.aliases || [])].some(a => {
    const x = words(a);
    return g === x.join(' ') || (x.length > 1 && words(guess).sort().join(' ') === [...x].sort().join(' '));
  });
}
export function almost(guess, prompt) {
  const a = normalize(guess), b = normalize(prompt.answer);
  if (b.length < 5 || Math.abs(a.length - b.length) > 1 || a === b) return false;
  let i = 0, j = 0, errors = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++errors > 1) return false;
    if (a.length >= b.length) i++;
    if (b.length >= a.length) j++;
  }
  return errors + (i < a.length || j < b.length ? 1 : 0) <= 1;
}
const subjects = [
 ['duva','en duva','duvan,pigeon','Djur'],['pingvin','en pingvin','pingvinen,penguin','Djur'],
 ['haj','en haj','hajen,shark','Djur'],['katt','en katt','katten,kisse,cat','Djur'],
 ['hund','en hund','hunden,dog','Djur'],['älg','en älg','älgen,moose','Djur'],
 ['groda','en groda','grodan,frog','Djur'],['anka','en anka','ankan,and,duck','Djur'],
 ['tvättbjörn','en tvättbjörn','tvattbjornen,raccoon','Djur'],['dinosaurie','en dinosaurie','dinosaur,dinosaurus,t rex,trex','Djur'],
 ['bläckfisk','en bläckfisk','blackfisken,octopus','Djur'],['flodhäst','en flodhäst','flodhasten,hippo','Djur'],
 ['get','en get','geten,goat','Djur'],['sjöjungfru','en sjöjungfru','sjojungfrun,mermaid','Figurer'],
 ['viking','en viking','vikingen','Figurer'],['riddare','en riddare','riddaren,knight','Figurer'],
 ['mormor','en mormor','farmor,gammal tant,tant,grandma','Figurer'],['robot','en robot','roboten','Figurer'],
 ['alien','en alien','utomjording,utomjordingen','Figurer'],['spöke','ett spöke','spoket,ghost','Figurer'],
 ['vampyr','en vampyr','vampyren,vampire','Figurer'],['pirat','en pirat','piraten,pirate','Figurer'],
 ['tomte','en tomte','jultomten,tomten,santa','Figurer'],['astronaut','en astronaut','astronauten,rymdfarare','Figurer'],
 ['potatis','en potatis','potatisen,potato','Mat'],['banan','en banan','bananen,banana','Mat'],
 ['korv','en korv','korven,sausage','Mat'],['köttbulle','en köttbulle','kottbullar,meatball','Mat'],
 ['broccoli','en broccoli','broccolin','Mat'],['gurka','en gurka','gurkan,cucumber','Mat'],
 ['råtta','en råtta','rattan,rat','Djur'],['apa','en apa','apan,monkey','Djur'],
 ['hamster','en hamster','hamstern','Djur'],['kackerlacka','en kackerlacka','kackerlackan,cockroach','Djur'],
 ['influencer','en influencer','influencern,influerare','Figurer'],
 ['politiker','en politiker','politikern','Figurer'],
 ['blondin','en blondin','blondinen','Figurer'],
 ['svärmor','en svärmor','svarmor','Figurer'],
 ['präst','en präst','presten,priest','Figurer'],
 ['knarkare','en knarkare','knarkaren,narkoman','Figurer'],
 ['raggare','en raggare','raggaren','Figurer'],
 ['kebabbosse','en kebabbosse','kebabbossen,kebabkungen','Figurer'],
 ['taxichaufför','en taxichaufför','taxichaufforen,taxi','Figurer'],
 ['boomer','en boomer','boomers','Figurer'],
 ['incel','en incel','inceln','Figurer']
];
const situations = [
 'som rånar en bank', 'på en extremt dålig dejt', 'som försöker montera en bokhylla utan instruktioner',
 'som är DJ på ett barnkalas', 'som blir jagad av sin dammsugare', 'som tappar sin glass',
 'som försöker flyga med paraply', 'på ett jättelitet gym', 'som livestreamar från toaletten',
 'som har fått alldeles för mycket kaffe', 'som håller ett katastrofalt bröllopstal',
 'som säljer en väldigt misstänkt bil', 'som tar en selfie under jordens undergång',
 'som har fastnat i en kontorsstol', 'som går på röda mattan', 'som försöker smyga förbi en sovande drake',
 'som tävlar i OS med badring', 'som precis upptäckt sin egen spegelbild',
 'som bråkar med en skrivare', 'som försöker åka skateboard',
 'som står i kö i ösregn', 'som försvarar den sista pizzabiten',
 'som startar ett helt orimligt företag', 'på semester i rymden',
 'som blir dumpad via röstmeddelande', 'som gömmer knarket i en köttbulle',
 'som säljer fötter på internet', 'som spiller en hel flaska örtlikör inne på ett möbelvaruhus',
 'som skiter i en buske bakom spritbutiken', 'på spritbutiken tre minuter före stängning',
 'som gråter i en hamburgerdrive-in', 'som ljuger i polisförhör med korv i munnen',
 'som vinner schlagerfinalen av misstag', 'som smeker sitt ego i en spegelvägg',
 'som blir rånad av en mås', 'som svär i kyrkan med full volym',
 'som har syra och ser sin egen pappa', 'som säljer nakenbilder från en mataffärsparkering'
];
const classic = [
 ['cykel','bicycle'],['helikopter','helicopter'],['raket','rymdraket,rocket'],['regnbåge','rainbow'],['slott','castle'],
 ['tandborste','toothbrush'],['tandläkare','dentist'],['snögubbe','snowman'],['paraply','umbrella'],['gitarr','guitar'],
 ['piano',''],['trumma','trummor,drum'],['tåg','tag,train'],['flygplan','flyg,airplane'],['ubåt','submarine'],
 ['båt','boat'],['bil','car'],['buss','bus'],['traktor','tractor'],['ambulans','ambulance'],['brandbil','fire truck'],
 ['glass','ice cream'],['pizza',''],['hamburgare','hamburger,burger'],['tårta','cake'],['kaffe','coffee'],
 ['popcorn',''],['spaghetti','pasta'],['kanelbulle','kanelbullar'],['pannkaka','pannkakor,pancake'],
 ['fotboll','football,soccer'],['basket','basketboll,basketball'],['skateboard',''],['skidor','ski'],['rullstol','wheelchair'],
 ['kamera','camera'],['mobil','telefon,mobiltelefon,phone'],['dator','computer,laptop'],['hörlurar','headphones'],
 ['dammsugare','vacuum cleaner'],['tvättmaskin','washing machine'],['soffa','couch,sofa'],['säng','bed'],
 ['toalett','toa,toilet'],['dusch','shower'],['badkar','bathtub'],['klocka','clock,watch'],['nyckel','key'],
 ['fisk','fish'],['orm','snake'],['elefant','elephant'],['giraff','giraffe'],['lejon','lion'],['kanin','rabbit'],
 ['igelkott','hedgehog'],['fjäril','butterfly'],['spindel','spider'],['myra','ant'],['snigel','snail'],['ko','cow'],
 ['gris','pig'],['häst','horse'],['får','sheep'],['uggla','owl'],['björn','bear'],['räv','fox'],
 ['palm','palm tree'],['vulkan','volcano'],['berg','mountain'],['ö','island'],['sol','sun'],['måne','moon'],
 ['stjärna','star'],['blixt','lightning'],['eld','fire'],['snöflinga','snowflake'],['vattenfall','waterfall'],
 ['svamp','mushroom'],['blomma','flower'],['träd','tree'],['morot','carrot'],['äpple','apple'],['jordgubbe','strawberry'],
 ['snopp','kuk,penis,ollon,dick'],['kuk','snopp,penis,ollon,dick'],
 ['röv','arsle,rumpa,ass,baka'],['pung','pungen,pungkulor'],
 ['bröst','tuttar,boobs'],['fitta','vagina,fiffi'],
 ['kondom','gummi,condom'],['dildo','sexleksak,vibrator'],
 ['bh','behå,bra'],['string','stringtrosa'],['tampong','mensskydd,tampongen'],
 ['kukring','kukringen'],['analplugg','buttplug']
];
const special = [
 ['programmerare','En programmerare som väntar på att AI:n ska bli klar','utvecklare,kodare,developer','Nördigt'],
 ['bugg','En bugg som har blivit chef över hela kodbasen','bug,fel','Nördigt'],
 ['skrivare','En skrivare som vägrar jobba om den inte får kaffe','printer','Kontoret'],
 ['chef','En chef som visar ett bildspel för tre råttor','boss,vd','Kontoret'],
 ['möte','Ett möte som pågått sedan dinosauriernas tid','meeting','Kontoret'],
 ['robot','En robot som trycker ”jag är inte en robot”','roboten','Nördigt'],
 ['laddare','En laddare som alla på kontoret slåss om','mobilladdare,charger','Kontoret'],
 ['brandvägg','En brandvägg som faktiskt brinner','firewall','Nördigt'],
 ['mus','En datormus som är rädd för katter','datormus,mouse','Nördigt'],
 ['tangentbord','Ett tangentbord som bara har ångestknappar','keyboard','Nördigt'],
 ['wifi','Wifi som bara fungerar om du står på ett ben','wi fi,internet','Nördigt'],
 ['lösenord','Ett lösenord som ingen kan komma ihåg','password','Nördigt'],
 ['blåskärm','En blåskärm mitt under en livekonsert','blue screen','Nördigt'],
 ['selfie','En selfie tagen av en förbannad mås','självporträtt','Nördigt'],
 ['kanelbulle','En kanelbulle som går på gym','kanelbullar','Sverige'],
 ['midsommarstång','En midsommarstång i rymden','midsommar,majstång','Sverige'],
 ['dalahäst','En dalahäst som vinner på trav','dalahasten','Sverige'],
 ['surströmming','Surströmming som evakuerar en hel stad','surstrommingsburk','Sverige'],
 ['kräfta','En kräfta som ordnar sin egen kräftskiva','kräftor','Sverige'],
 ['fika','Fika på månen med alldeles för lite kaffe','kaffepaus','Sverige'],
 ['snöplog','En snöplog som plogar bort hela Stockholm','plog,plogbil','Sverige'],
 ['kö','En svensk kö som fortsätter runt hela planeten','köbildning','Sverige'],
 ['bastu','En bastu så varm att den lyfter från marken','sauna','Sverige'],
 ['kombi','En svensk kombi med träskor som hjul','kombin,kombibil,bil,gammal bil','Sverige'],
 ['älg','En älg som plankar på tunnelbanan','älgen','Sverige'],
 ['kebab','En kebab som kandiderar till statsminister','kebabrulle','Mat'],
 ['avokado','En avokado som precis köpt sin första lägenhet','avocado','Mat'],
 ['pizza','En pizza som gifter sig med en ananas','pizzan','Mat'],
 ['ost','En ost som flyr från en enorm mus','cheese','Mat'],
 ['sushi','Sushi som tar sig tillbaka till havet','sushin','Mat'],
 ['toalett','En toalett som raketuppskjutning','toa','Prylar'],
 ['dammsugare','En dammsugare som vill bli influencer','robotdammsugare','Prylar'],
 ['paraply','Ett paraply som är rädd för regn','umbrella','Prylar'],
 ['kaktus','En kaktus som vill ha en kram','cactus','Prylar'],
 ['snögubbe','En snögubbe på solsemester','snowman','Figurer'],
 ['zombie','En zombie som jobbar på kundtjänst','zombien','Figurer'],
 ['häxa','En häxa som åker robotdammsugare istället för kvast','witch','Figurer'],
 ['ninja','En ninja med extremt pipiga skor','ninjan','Figurer'],
 ['clown','En clown som ska genomföra en bankförhandling','clownen','Figurer'],
 ['snopp','En snopp i kostym på anställningsintervju','kuk,penis,ollon,dick','Kropp'],
 ['kuk','En kuk som letar efter sina bilnycklar','snopp,penis,ollon,dick','Kropp'],
 ['ollon','Ett ollon som fastnat i en blixtlås','snopp,kuk,penis','Kropp'],
 ['pung','En pung som gungar i motvind på Götgatan','pungkulor','Kropp'],
 ['röv','En röv som försöker smita från notan','arsle,rumpa,baka','Kropp'],
 ['bröst','Ett par bröst som argumenterar om vem som är störst','tuttar,boobs','Kropp'],
 ['fitta','En fitta som recenserar restauranger på nätet','vagina,fiffi','Kropp'],
 ['kondom','En kondom som är två storlekar för liten och vet om det','gummi,condom','Kropp'],
 ['dildo','En dildo som kräver månadskort på gymmet','sexleksak,vibrator','Kropp'],
 ['erektion','En erektion på möbelvaruhusets kuddavdelning','stånd,hård','Kropp'],
 ['onani','Onani med en möbelkatalog från 1998','runk,runka','Kropp'],
 ['porr','Porr som spelas upp på kyrkans projektor av misstag','porrfilm,porn','Kropp'],
 ['strippa','En strippa som tar betalt i kanelbullar','stripperska,strip','Kropp'],
 ['nakenbilder','Nakenbilder tagna i en EPA-traktor','nakenbild,nudes,nakenselfie,nakenselfies','Kropp'],
 ['hora','En hora som har fastnat i tre möten samtidigt','prostituerad,escort','Kropp'],
 ['incel','En incel som förlorar en dejt mot en brödrost','inceln','Figurer'],
 ['cuck','En cuck som applåderar i garderoben','cucken','Figurer'],
 ['sugar daddy','En sugar daddy som betalar hyran i kebab','sugardaddy','Figurer'],
 ['milf','En milf som hämtar på dagis i sportbil','milfen','Figurer'],
 ['blondin','En blondin som fastnar i en rondell i tre timmar','blondinen','Figurer'],
 ['svärmor','En svärmor som flyttar in med egna gardiner','svarmor','Figurer'],
 ['kärring','En kärring bakom ratten i en jättelik stadsjeep på Sveavägen','karring','Figurer'],
 ['feminist','En feminist som bråkar med en dörr märkt Herrar','feministen','Figurer'],
 ['hemmafru','En hemmafru som gömmer vin i tvättmedelsflaskan','hemmafrun','Figurer'],
 ['kines','En kines som öppnar tre restauranger i samma galleria','kinesen,chinese','Folk'],
 ['japan','En japan som bugnar så djupt att han försvinner i golvet','japanen,japanese','Folk'],
 ['indier','En indier som ringer från IT-supporten mitt i din dusch','indiern,indisk','Folk'],
 ['arab','En arab med sju fruar i en pytteliten bil','araben','Folk'],
 ['blatte','En blatte som försöker parkera en dyr sportbil utan körkort','blattar','Folk'],
 ['somalier','En somalier som startar en gammal kombi i minus trettiotvå','somaliern','Folk'],
 ['ryss','En ryss som dricker T-sprit till frukostmackan','ryssen,ryss','Folk'],
 ['tysk','En tysk som reserverar handduken vid poolen klockan fem','tysken,german','Folk'],
 ['norrman','En norrman som köper Sverige på rea','norrmannen,norge','Folk'],
 ['amerikan','En amerikan som tar åt sig äran för kaviar på tub','amerikanen,usa','Folk'],
 ['knarkare','En knarkare som gömmer ketamin i en köttbulle','knarkaren,narkoman','Figurer'],
 ['alkis','En alkis som håller bröllopstal bakom spritbutiken','alkoholist,fyllon','Figurer'],
 ['raggare','En raggare som gör barn i baksätet på en gammal amerikanare','raggaren','Figurer'],
 ['epa','En EPA-traktor full med snus, bärs och dåliga beslut','epatraktor,epa traktor','Sverige'],
 ['politiker','En politiker som ljuger med korv i båda händerna','politikern','Figurer'],
 ['sd-väljare','En SD-väljare som blir kär i kebabbossen','sverigedemokrat,sd','Sverige'],
 ['sosse','En sosse som gråter över en höjd ölskatt','socialdemokrat','Sverige'],
 ['influencer','En influencer som filmar sitt eget nervsammanbrott i ett provrum','influencern,influerare','Figurer'],
 ['boomer','En boomer som försöker mobilbetala med en fax','boomers','Figurer'],
 ['zoomer','En zoomer som får ångest av ett vanligt telefonsamtal','gen z,genz','Figurer'],
 ['kebabbosse','En kebabbosse som kandiderar till påve','kebabbossen,kebabkungen','Mat'],
 ['snus','En snuspåse som gömmer sig under läppen under ett bröllop','prilla,snuset','Sverige'],
 ['spritbutik','En spritbutik som stänger i ansiktet på en gråtande farbror','spritbutiken,spritaffär,vinbutik,vinaffär','Sverige'],
 ['förort','En förort som startar eget kungahus','orten','Sverige'],
 ['fetisch','En fotfetischist som rånar en skoaffär','fetischist','Kropp'],
 ['bdsm','BDSM med billigt rep och en trasig bokhylla','bondage,sadomasochism','Kropp'],
 ['prostatan','En prostataundersökning som går åt helvete','prostata','Kropp'],
 ['herpes','Herpes som dyker upp precis före school disco-återträffen','herpesen','Kropp'],
 ['klamydia','Klamydia som skickar ett gruppmejl till hela klassen','klamydian','Kropp'],
 ['a-kassa','A-kassa som tar semester i Thailand','akassa','Sverige'],
 ['bidrag','Bidrag som firar med champagne i en sporthall','bidraget','Sverige'],
 ['invandrare','En invandrare som förklarar svensk kö-kultur för en vikarie','invandraren','Folk'],
 ['svenne','En svenne som beställer kebab utan sås och med extra gurka','svennen','Folk'],
 ['bög','En bög som inreder ett möbelvaruhus bättre än arkitekten','gay,homosexuell','Figurer'],
 ['trans','En transperson som vinner en skägg-tävling av misstag','transperson,transa','Figurer'],
 ['kuken','Kuken i kassan som scanar sig själv två gånger','kuk','Kropp']
];
const nsfwAnswers = new Set([
 'snopp','kuk','ollon','pung','röv','bröst','fitta','kondom','dildo','bh','string','tampong','kukring','analplugg',
 'erektion','onani','porr','strippa','nakenbilder','hora','incel','cuck','sugar daddy','milf','blondin','kärring',
 'feminist','hemmafru','kines','japan','indier','arab','blatte','somalier','ryss','invandrare','svenne','bög',
 'trans','kuken','knarkare','alkis','raggare','fetisch','bdsm','prostatan','herpes','klamydia','a-kassa','bidrag',
 'sd-väljare','kebabbosse','epa'
]);
const nsfwSituations = new Set([
 'som livestreamar från toaletten','som gömmer knarket i en köttbulle','som säljer fötter på internet',
 'som skiter i en buske bakom spritbutiken','som har syra och ser sin egen pappa',
 'som säljer nakenbilder från en mataffärsparkering'
]);
const isSafe = (answer, scene='') => !nsfwAnswers.has(answer) && ![...nsfwSituations].some(s => scene.includes(s));
export const BANK = [
 ...classic.map(([answer, aliases],i) => ({id:`e${i}`, answer, scene:answer[0].toUpperCase()+answer.slice(1), aliases:aliases.split(',').filter(Boolean), pack:'easy',category:'Klassiker',safe:isSafe(answer)})),
 ...subjects.flatMap(([answer,subject,aliases,category],i) => situations.map((s,j) => ({id:`a${i}-${j}`,answer,scene:subject[0].toUpperCase()+subject.slice(1)+' '+s, aliases:aliases.split(','),category,pack:'chaos',safe:isSafe(answer,s)}))),
 ...special.map(([answer,scene,aliases,category],i) => ({id:`s${i}`,answer,scene,aliases:aliases.split(','),category,pack:category==='Sverige'?'swedish':category==='Nördigt'||category==='Kontoret'?'nerd':'chaos',safe:isSafe(answer,scene)}))
];
export const BANKS = { sv: BANK, en: EN_BANK };
/** Prompts come from the room's language: 'sv' (default) or 'en'. Paid packs (Ritkaos+) have their own lists; 'mix' never includes them. */
export function getChoices(settings, used = new Set(), lang = 'sv') {
  let bank;
  if (settings.custom?.length) bank = settings.custom.map((s,i) => ({id:`custom${i}`,answer:s,scene:s,aliases:[],category:lang==='en'?'Your words':'Era ord',pack:'custom',safe:true}));
  else if (PACKS.sv[settings.pack]) bank = (PACKS[lang] || PACKS.sv)[settings.pack].filter(p => !settings.safe || p.safe);
  else bank = (BANKS[lang] || BANK).filter(p => (settings.pack === 'mix' || p.pack === settings.pack) && (!settings.safe || p.safe));
  let pool = bank.filter(p => !used.has(normalize(p.answer)));
  if (pool.length < 3) { used.clear(); pool = bank; }
  const result = [];
  for (let i=0;i<3 && pool.length;i++) {
    const pick = pool[Math.floor(Math.random()*pool.length)]; result.push(pick);
    pool = pool.filter(p => normalize(p.answer)!==normalize(pick.answer));
  }
  return result;
}
