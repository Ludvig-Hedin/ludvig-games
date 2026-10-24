const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const colors=['#292d28','#737c70','#a06d4b','#ec7464','#ffb569','#f6d65c','#a7cc6b','#53ac99','#79b5e4','#866acf','#dc94c5','#ffffff'];
const avatarColors=['#c8bdf4','#dbedac','#ffc7ab','#bce2ef','#f1d891','#e8b6d2','#b8d9cb','#d3d6f2'];
// All interface text in Swedish and English. Server messages arrive already in the player's language.
const STR={
 sv:{
  title:'Ritkaos — Rita fult. Gissa snabbt.',description:'Rita fult. Gissa snabbt. Ett kaotiskt ritspel för dina vänner.',
  names:['Dålig Picasso','Pennpanik','Konstigt Folk','Kaffe & Kaos','PinnGubben','Ritardåligt'],
  modes:{classic:'KLASSISKT',chaos:'KAOS',coop:'DUBBELTRUBBEL',studio:'FRI DUK',blind:'BLINDRITNING',speed:'SNABBRUNDA',telephone:'TELEFONLEKEN'},phases:{lobby:'Väntar',playing:'Match pågår',studio:'Fri duk',ended:'Klar'},
  connecting:'Ansluter till spelservern…',connectingShort:'Ansluter',brand:'Ritkaos startsida',howToPlay:'Så spelar ni',language:'Språk: svenska. Byt till engelska.',
  headline:'Rita <span class="outline-word">fult.</span><br>Gissa <span class="lime-underline">snabbt.</span>',
  subtitle:'En ritar. Resten gissar.',
  whoAreYou:'Vem är du?',
  yourName:'Ditt namn',namePlaceholder:'T.ex. Dålig Picasso',pickAvatar:'Välj din avatar',visible:'Synligt för andra på samma nätverk',createRoom:'Skapa ett rum',
  orFriend:'eller gå med i ett rum',roomCode:'Rumskod',roomCodePlaceholder:'RUMSKOD',join:'Gå med',orStrangers:'eller spela med andra',
  quickMatch:'Snabbmatch',openMatches:'ÖPPNA MATCHER',openMatch:'Öppen match',
  best:n=>`Ditt rekord: ${n} p`,leaveRoom:'Lämna rummet',roomCodeKicker:'RUMSKOD',inviteFriend:'Bjud in',
  yourCrew:'Ditt gäng',moreFun:'Bjud in fler med länken.',
  howYouPlay:'Inställningar',modeChaos:'Kaos',modeChaosText:'Knäppa motiv + överraskningar',modeClassic:'Klassiskt',modeClassicText:'En ritar. Resten gissar.',modeCoop:'Dubbeltrubbel',modeCoopText:'Två ritar ihop · minst 3 spelare',modeStudio:'Fri duk',modeStudioText:'Alla ritar. Inga poäng.',
  rounds:'Rundor',roundOption:n=>`${n} ${n===1?'runda':'rundor'}`,timePer:'Tid per teckning',secondsOption:n=>`${n} sekunder`,whatDraw:'Vad ska ni rita?',
  packMix:'Lite av allt',packChaos:'Helt orimliga situationer',packEasy:'Enkla klassiker',packSwedish:'Svenskt kaos',packNerd:'Kod, kontor & internet',
  officeMode:'Kontorsläge',officeModeText:'Inga könsord, knark eller grova stereotyper.',addWords:'+ Lägg till egna ord',customPlaceholder:'Er chef, en bakfull duva, ett pinsamt minne…\nSeparera med kommatecken.',customText:'Egna ord ersätter ordpaketet. Gissa hela ordet eller frasen.',
  sharedCanvas:'Gemensam ritduk',trust:'Du ritar blint.',trustText:'De andra ser dina streck.',toLobby:'Till lobbyn',saveImage:'Spara bild',
  penKey:'Penna (B)',pen:'Penna',eraserKey:'Sudd (E)',eraser:'Sudd',brushSize:'Penselstorlek',undoKey:'Ångra ditt senaste streck (Ctrl/⌘ Z)',undo:'Ångra',clearCanvas:'Töm duken',
  laugh:'Skratt',fire:'Eld',skull:'Dödskalle',applause:'Applåd',theCrew:'Gänget',invite:'Bjud in',leave:'Lämna',yourGuess:'Din gissning',sendGuess:'Skicka gissning',
  rematch:'Spela igen',close:'Stäng',color:c=>`Färg ${c}`,
  genericError:'Något gick fel.',noConnection:'Ingen anslutning just nu. Vänta tills lampan blir grön.',noAnswer:'Servern svarade inte. Kontrollera anslutningen.',connectionLost:'Anslutningen bröts.',
  connected:'Ansluten',reconnecting:'Återansluter…',roomGone:'Servern startades om eller rummet stängdes. Skapa ett nytt rum.',back:'Du är tillbaka. Duken återställs.',
  kicked:'Värden tog bort dig från rummet.',votedOut:'Du röstades ut ur matchen.',replaced:'Din spelare öppnades i en annan flik. Ladda om för att skapa en ny.',full:'Fullt',joinShort:'Gå med',
  offline:'Återansluter…',nextTurn:'Med från nästa tur',roomHost:'Rummets värd',ready:'Redo',guessed:'Gissade rätt',drawingNow:'Ritar',guessing:'Gissar…',you:'(du)',
  removePlayer:'Ta bort spelare',remove:name=>`Ta bort ${name}`,voteOut:name=>`Rösta för att ta bort ${name}`,points:'POÄNG',
  youHost:'DU ÄR VÄRD',hostDecides:'VÄRDEN VÄLJER',openMatchTag:'ÖPPEN MATCH',openCanvas:'Öppna duken',go:'Starta',
  hostStarts:'Värden startar när ni är redo.',waitingFor:n=>`Väntar på ${n} ${n===1?'kompis':'kompisar'} till…`,inviteMore:'Bjud in fler även efter att ni börjat.',playersReady:n=>`${n} spelare redo.`,
  waitingOne:'Väntar på en spelare till…',startsIn:n=>`Startar om ${n} s`,backToLobbyIn:n=>`Tillbaka till lobbyn om ${n} s`,
  round:(a,b)=>`Runda ${a} / ${b}`,everyoneDraws:'ALLA RITAR',disaster:'VÄLJER MOTIV',promptWas:'MOTIVET VAR',secret:'DITT MOTIV · INGA BOKSTÄVER',youGotIt:'DU GISSADE RÄTT',guessMain:'GISSA ORDET',
  freeCanvas:'Fri duk',guessWord:c=>c||'',
  artistsOne:n=>`${n} ritar`,choosing:n=>' väljer…',didBest:n=>' ritade.',drawing:n=>' ritar…',
  studioHint:'Ångra tar bara bort dina egna streck.',
  roleSpectator:'Du hoppar in från nästa tur.',
  chatHere:'Prata här',guessHere:'Gissa här',phTalk:'Skriv i chatten…',phChoosing:'Ritaren väljer motiv…',phSpectator:'Med från nästa tur…',phGuessed:'Du gissade rätt!',phDrawing:'Du ritar…',phReveal:'Skriv i chatten…',phGuess:'Din gissning…',
  fbClose:'Nära! Kolla stavningen.',
  pickDisaster:'Välj ett motiv',boldWord:'De andra gissar det feta ordet.',autoPick:'Automatiskt val om <b data-seconds>16</b> sekunder.',
  theArtist:'Ritaren',isChoosing:name=>`${name} väljer.`,drawTogether:'Ni ritar tillsammans. Motivet kommer strax.',
  mystery:'ett mysterium',nextTurnIn:'Nästa tur om <b data-seconds>6</b> sekunder',
  sharedFirst:'Delad <em>förstaplats.</em>',won:name=>`${name} <em>vann.</em>`,someone:'Någon',scorePoints:n=>`${n} poäng`,waitingHost:'Väntar på att värden startar nästa match.',
  saved:'Bilden sparas som PNG.',cancel:'Avbryt',inviteTitle:'Bjud in',inviteText:'Skicka länken till dina vänner.',inviteLink:'Inbjudningslänk',copyLink:'Kopiera länk',
  codeLabel:'Rumskod:',publicLink:'Dela länken bara med dem du vill spela med.',localLink:'Den här länken är för samma wifi. På olika nätverk: följ ”Spela via internet” i SPELA-IKVALL.md. Du som kör servern måste lämna datorn vaken.',
  copied:'Kopierad',copiedToast:'Länken är kopierad.',copyManual:'Markera länken och kopiera med ⌘C eller Ctrl+C.',
  helpTitle:'Så spelar ni',help1:'<strong>En väljer och ritar.</strong>Du får tre motiv. Ordet i fetstil är det som de andra ska gissa.',help2:'<strong>Resten gissar i chatten.</strong>Rita ”en duva som rånar en bank”? Svaret är duva. Du behöver inte skriva hela meningen. Egna ord gissas däremot i sin helhet.',
  help3:'<strong>Snabbhet ger poäng.</strong>Rätt svar ger 100–550 poäng. Varje ritare får 100 per rätt gissning. I Kaos händer något med penseln mitt i turen.',helpSmall:'Dubbeltrubbel: två ritar samma motiv, minst en annan gissar (3+ spelare). Fri duk: alla kan rita tillsammans, även när ni bara är två.',
  soundOff:'Slå av ljud',soundOn:'Slå på ljud',lightMode:'Ljust läge',darkMode:'Mörkt läge',correctToast:n=>`Rätt! +${n} poäng.`,othersCorrect:name=>`${name} gissade rätt. +100 till dig.`,
  nameFirst:'Skriv ett namn först.',codeLength:'Rumskoden ska ha sex tecken.',removeTitle:'Ta bort spelaren?',removeText:'Spelaren lämnar rummet men kan gå med igen med länken.',removeButton:'Ta bort',
  leaveTitle:'Lämna rummet?',leaveText:'Du kan komma tillbaka med samma rumskod.',clearTitle:'Töm hela duken?',clearText:'Även din medritares streck försvinner. Det går inte att ångra.',
  voteCast:'Röst lagd. Den gäller i en minut.',voteWithdrawn:'Röst borttagen.',
  plusAria:'Öppna Ritkaos+',menu:'Meny',lobbyTitle:'Lobbyn',helpKeys:'B = penna · E = sudd · ⌘/Ctrl Z = ångra ditt eget streck.',
  products:{plus:['Ritkaos+','Allt nedan: alla ordpaket, lägen, penslar och färger.'],nineties:['90-talet','Digitala husdjur, prasseldress och videoband som ingen spolat tillbaka.'],office:['Kontoret','Möten som kunde varit ett mejl. Och en skrivare med åsikter.'],holidays:['Jul','Tomtar, glögg, tecknad film på julafton och lite släktdrama.'],food:['Svensk mat','Från surströmming till semla. Ta med servetter.'],internet:['Internet','Memes, captchas, kommentarsfält och wifi-ångest.'],blind:['Blindritning','Ritaren ser inte sina egna streck. Hela turen.'],speed:['Snabbrunda','30 sekunder, dubbelt så många turer och bonus för blixtsnabba gissningar.'],telephone:['Telefonleken','Skriv, rita, gissa, rita. Se allt urarta på slutet.'],cosmetics:['Penslar & färger','Tusch, krita och neon, plus tre nya färgpaletter. Bara för dig.']},
  storeText:'Spelet är alltid gratis. Det här är extra kul för den som vill. Har värden ett paket eller läge spelar alla i rummet med, gratis.',
  storePacks:'ORDPAKET',storeModes:'LÄGEN',storeCosmetics:'PENSLAR & FÄRGER',price:n=>`${n} kr`,buy:'Köp',ownedTag:'Din',hostTag:'Värden bjuder',
  unlockCode:'Har du en kod?',unlockButton:'Lås upp',unlockedToast:'Upplåst.',
  storeSoon:'Köp öppnar snart. Har du redan en kod? Skriv in den ovan.',storeAfterBuy:'Efter köpet får du en kod. Skriv in den ovan så låses det upp på den här enheten.',
  modeBlind:'Blindritning',modeBlindText:'Ritaren ser inget',modeSpeed:'Snabbrunda',modeSpeedText:'30 s · bonus för snabba',modeTelephone:'Telefonleken',modeTelephoneText:'Skriv, rita, gissa · minst 3',
  blindTitle:'Blindritning.',blindText:'De andra ser allt.',correctFast:n=>`Blixtsnabbt! +${n} poäng.`,
  style:'Pensel och färger',styleTitle:'Din pensel',styleText:'Alla ser dina streck i stilen du väljer.',styleLocked:'Tusch, krita, neon och nya färger ingår i Ritkaos+.',brushesHeading:'PENSLAR',palettesHeading:'FÄRGER',
  brushes:{pen:'Penna',marker:'Tusch',crayon:'Krita',neon:'Neon'},palettes:{base:'Standard',candy:'Godis',night:'Natt',forest:'Skog'},
  telStep:(a,b)=>`Steg ${a} / ${b}`,telChainOf:(a,b)=>`Kedja ${a} / ${b}`,
  telWriteLabel:'SKRIV ETT MOTIV',telWriteLabelHint:'Något som går att rita.',telDrawLabel:'RITA DET HÄR',telGuessLabel:'VAD ÄR DET HÄR?',telGuessLabelHint:'Beskriv teckningen med några ord.',telRevealLabel:'AVSLÖJANDET',telWaitLabel:'TELEFONLEKEN PÅGÅR',telWaitLabelHint:'Du är med nästa gång.',
  telFromWrote:n=>`Från ${n}`,telFromDrew:n=>`Ritad av ${n}`,telStatus:(a,b)=>`${a} av ${b} klara`,telRevealStatus:'Så här gick det till.',telHint:'Bara du ser din duk.',
  telRole:'Gör ditt steg. De andra väntar.',telWaiting:'Klart! Väntar på de andra.',telDoneTag:'Klar',telWorking:'Jobbar…',
  telWriteTitle:'Hitta på något att rita.',telWriteText:'Nästa person ritar det.',telWritePh:'En duva som rånar en bank…',telGuessPh:'Vad föreställer det?',telSend:'Skicka',
  telDoneTitle:'Väntar på de andra.',telWaitTitle:'Telefonleken pågår.',
  telChainName:n=>`${n}${/s$/i.test(n)?'':'s'} kedja`,telWrote:n=>`${n} skrev`,telGuessed:n=>`${n} gissade`,telDrew:n=>`${n} ritade`,telNext:'Nästa kedja',telEnd:'Till lobbyn',telHostNext:'Värden visar nästa kedja.',telDoneButton:'Klar'
 },
 en:{
  title:'Ritkaos — Draw badly. Guess fast.',description:'Draw badly. Guess fast. A chaotic drawing game for your friends.',
  names:['Bad Picasso','Pen Panic','Weird Folks','Coffee & Chaos','Stick Figure','Cant Draw'],
  modes:{classic:'CLASSIC',chaos:'CHAOS',coop:'DOUBLE TROUBLE',studio:'FREE CANVAS',blind:'BLIND DRAW',speed:'SPEED ROUND',telephone:'TELEPHONE'},phases:{lobby:'Waiting',playing:'In a match',studio:'Free canvas',ended:'Done'},
  connecting:'Connecting to the game server…',connectingShort:'Connecting',brand:'Ritkaos home',howToPlay:'How to play',language:'Language: English. Switch to Swedish.',
  headline:'Draw <span class="outline-word">badly.</span><br>Guess <span class="lime-underline">fast.</span>',
  subtitle:'One draws. Everyone else guesses.',
  whoAreYou:'Who are you?',
  yourName:'Your name',namePlaceholder:'E.g. Bad Picasso',pickAvatar:'Pick your avatar',visible:'Visible to others on my network',createRoom:'Create a room',
  orFriend:'or join a room',roomCode:'Room code',roomCodePlaceholder:'ROOM CODE',join:'Join',orStrangers:'or play with others',
  quickMatch:'Quick match',openMatches:'OPEN MATCHES',openMatch:'Open match',
  best:n=>`Your best: ${n} pts`,leaveRoom:'Leave room',roomCodeKicker:'ROOM CODE',inviteFriend:'Invite',
  yourCrew:'Your crew',moreFun:'Invite more people with the link.',
  howYouPlay:'Settings',modeChaos:'Chaos',modeChaosText:'Weird prompts + surprises',modeClassic:'Classic',modeClassicText:'One draws. The rest guess.',modeCoop:'Double trouble',modeCoopText:'Two draw together · 3+ players',modeStudio:'Free canvas',modeStudioText:'Everyone draws. No points.',
  rounds:'Rounds',roundOption:n=>`${n} ${n===1?'round':'rounds'}`,timePer:'Time per drawing',secondsOption:n=>`${n} seconds`,whatDraw:'What will you draw?',
  packMix:'A bit of everything',packChaos:'Totally absurd situations',packEasy:'Easy classics',packSwedish:'Swedish chaos',packNerd:'Code, office & internet',
  officeMode:'Office mode',officeModeText:'No dirty words, drugs or crude stereotypes.',addWords:'+ Add your own words',customPlaceholder:'Your boss, a hungover pigeon, an awkward memory…\nSeparate with commas.',customText:'Your words replace the word pack. Guess the whole word or phrase.',
  sharedCanvas:'Shared canvas',trust:'You are drawing blind.',trustText:'The others see your strokes.',toLobby:'To the lobby',saveImage:'Save image',
  penKey:'Pen (B)',pen:'Pen',eraserKey:'Eraser (E)',eraser:'Eraser',brushSize:'Brush size',undoKey:'Undo your last stroke (Ctrl/⌘ Z)',undo:'Undo',clearCanvas:'Clear canvas',
  laugh:'Laugh',fire:'Fire',skull:'Skull',applause:'Applause',theCrew:'The crew',invite:'Invite',leave:'Leave',yourGuess:'Your guess',sendGuess:'Send guess',
  rematch:'Play again',close:'Close',color:c=>`Colour ${c}`,
  genericError:'Something went wrong.',noConnection:'No connection right now. Wait for the light to turn green.',noAnswer:'The server did not answer. Check your connection.',connectionLost:'The connection dropped.',
  connected:'Connected',reconnecting:'Reconnecting…',roomGone:'The server restarted or the room closed. Create a new room.',back:'You are back. Restoring the canvas.',
  kicked:'The host removed you from the room.',votedOut:'You were voted out of the match.',replaced:'Your player opened in another tab. Reload to create a new one.',full:'Full',joinShort:'Join',
  offline:'Reconnecting…',nextTurn:'In from the next turn',roomHost:'Room host',ready:'Ready',guessed:'Got it',drawingNow:'Drawing',guessing:'Guessing…',you:'(you)',
  removePlayer:'Remove player',remove:name=>`Remove ${name}`,voteOut:name=>`Vote to remove ${name}`,points:'POINTS',
  youHost:'YOU ARE THE HOST',hostDecides:'THE HOST DECIDES',openMatchTag:'OPEN MATCH',openCanvas:'Open the canvas',go:'Start',
  hostStarts:'The host starts when you are ready.',waitingFor:n=>`Waiting for ${n} more ${n===1?'friend':'friends'}…`,inviteMore:'You can invite more people after you start.',playersReady:n=>`${n} players ready.`,
  waitingOne:'Waiting for one more player…',startsIn:n=>`Starting in ${n} s`,backToLobbyIn:n=>`Back to the lobby in ${n} s`,
  round:(a,b)=>`Round ${a} / ${b}`,everyoneDraws:'EVERYONE DRAWS',disaster:'PICKING A PROMPT',promptWas:'THE PROMPT WAS',secret:'YOUR PROMPT · NO LETTERS',youGotIt:'YOU GOT IT',guessMain:'GUESS THE WORD',
  freeCanvas:'Free canvas',guessWord:c=>c||'',
  artistsOne:n=>`${n} drawing`,choosing:n=>n>1?' are choosing…':' is choosing…',didBest:n=>' drew.',drawing:n=>n>1?' are drawing…':' is drawing…',
  studioHint:'Undo only removes your own strokes.',
  roleSpectator:'You jump in from the next turn.',
  chatHere:'Chat here',guessHere:'Guess here',phTalk:'Message…',phChoosing:'The artist is choosing…',phSpectator:'In from the next turn…',phGuessed:'You got it!',phDrawing:'You are drawing…',phReveal:'Message…',phGuess:'Your guess…',
  fbClose:'Close! Check your spelling.',
  pickDisaster:'Pick a prompt',boldWord:'The others guess the bold word.',autoPick:'Auto-pick in <b data-seconds>16</b> seconds.',
  theArtist:'The artist',isChoosing:name=>`${name} is choosing.`,drawTogether:'You draw together. The prompt is coming.',
  mystery:'a mystery',nextTurnIn:'Next turn in <b data-seconds>6</b> seconds',
  sharedFirst:'Shared <em>first place.</em>',won:name=>`${name} <em>won.</em>`,someone:'Someone',scorePoints:n=>`${n} points`,waitingHost:'Waiting for the host to start the next match.',
  saved:'Saved as PNG.',cancel:'Cancel',inviteTitle:'Invite',inviteText:'Send the link to your friends.',inviteLink:'Invite link',copyLink:'Copy link',
  codeLabel:'Room code:',publicLink:'Only share the link with people you want to play with.',localLink:'This link is for the same wifi. On different networks, follow “Spela via internet” in SPELA-IKVALL.md. Whoever runs the server must keep the computer awake.',
  copied:'Copied',copiedToast:'Link copied.',copyManual:'Select the link and copy with ⌘C or Ctrl+C.',
  helpTitle:'How to play',help1:'<strong>One picks and draws.</strong>You get three prompts. The bold word is what the others have to guess.',help2:'<strong>Everyone else guesses in the chat.</strong>Drawing “a pigeon robbing a bank”? The answer is pigeon. No need to type the whole sentence. Your own words are guessed in full, though.',
  help3:'<strong>Speed scores.</strong>A right answer gives 100–550 points. Each artist gets 100 per correct guess. In Chaos, something happens to the brush mid-turn.',helpSmall:'Double trouble: two draw the same prompt, at least one other person guesses (3+ players). Free canvas: everyone can draw together, even with just two of you.',
  soundOff:'Sound off',soundOn:'Sound on',lightMode:'Light mode',darkMode:'Dark mode',correctToast:n=>`Correct! +${n} points.`,othersCorrect:name=>`${name} got it. +100 for you.`,
  nameFirst:'Type a name first.',codeLength:'The room code has six characters.',removeTitle:'Remove this player?',removeText:'They leave the room but can join again with the link.',removeButton:'Remove',
  leaveTitle:'Leave the room?',leaveText:'You can come back with the same room code.',clearTitle:'Clear the whole canvas?',clearText:'Your co-artist’s strokes disappear too. This cannot be undone.',
  voteCast:'Vote cast. It lasts one minute.',voteWithdrawn:'Vote withdrawn.',
  plusAria:'Open Ritkaos+',menu:'Menu',lobbyTitle:'Lobby',helpKeys:'B = pen · E = eraser · ⌘/Ctrl Z = undo your own stroke.',
  products:{plus:['Ritkaos+','Everything below: every word pack, mode, brush and colour.'],nineties:['The 90s','Digital pets, inline skates and VHS tapes nobody rewound.'],office:['The Office','Meetings that could have been an email. And a printer with opinions.'],holidays:['Holidays','Snowmen, mulled wine, ugly sweaters and a little family drama.'],food:['Food','From meatballs to dumplings. Bring napkins.'],internet:['Internet','Memes, captchas, comment sections and wifi anxiety.'],blind:['Blind draw','The artist cannot see their own strokes. The whole turn.'],speed:['Speed round','30 seconds, twice the turns and a bonus for lightning-fast guesses.'],telephone:['Telephone','Write, draw, guess, draw. Watch it fall apart at the end.'],cosmetics:['Brushes & colours','Marker, crayon and neon, plus three new palettes. Just for you.']},
  storeText:'The game is always free. These are extras for anyone who wants them. If the host has a pack or mode, everyone in the room plays it for free.',
  storePacks:'WORD PACKS',storeModes:'MODES',storeCosmetics:'BRUSHES & COLOURS',price:n=>`${n} kr`,buy:'Buy',ownedTag:'Yours',hostTag:"Host's treat",
  unlockCode:'Got a code?',unlockButton:'Unlock',unlockedToast:'Unlocked.',
  storeSoon:'Buying opens soon. Already have a code? Enter it above.',storeAfterBuy:'After buying you get a code. Enter it above to unlock it on this device.',
  modeBlind:'Blind draw',modeBlindText:'The artist sees nothing',modeSpeed:'Speed round',modeSpeedText:'30 s · bonus for speed',modeTelephone:'Telephone',modeTelephoneText:'Write, draw, guess · 3+ players',
  blindTitle:'Blind draw.',blindText:'Everyone else sees it.',correctFast:n=>`Lightning fast! +${n} points.`,
  style:'Brush and colours',styleTitle:'Your brush',styleText:'Everyone sees your strokes in the style you pick.',styleLocked:'Marker, crayon, neon and new colours are part of Ritkaos+.',brushesHeading:'BRUSHES',palettesHeading:'COLOURS',
  brushes:{pen:'Pen',marker:'Marker',crayon:'Crayon',neon:'Neon'},palettes:{base:'Standard',candy:'Candy',night:'Night',forest:'Forest'},
  telStep:(a,b)=>`Step ${a} / ${b}`,telChainOf:(a,b)=>`Chain ${a} / ${b}`,
  telWriteLabel:'WRITE A PROMPT',telWriteLabelHint:'Something you can draw.',telDrawLabel:'DRAW THIS',telGuessLabel:'WHAT IS THIS?',telGuessLabelHint:'Describe the drawing in a few words.',telRevealLabel:'THE REVEAL',telWaitLabel:'TELEPHONE IN PROGRESS',telWaitLabelHint:'You are in next time.',
  telFromWrote:n=>`From ${n}`,telFromDrew:n=>`Drawn by ${n}`,telStatus:(a,b)=>`${a} of ${b} done`,telRevealStatus:'This is how it went.',telHint:'Only you see your canvas.',
  telRole:'Do your step. The others are waiting.',telWaiting:'Done! Waiting for the others.',telDoneTag:'Done',telWorking:'Working…',
  telWriteTitle:'Make up something to draw.',telWriteText:'The next person draws it.',telWritePh:'A pigeon robbing a bank…',telGuessPh:'What is it?',telSend:'Send',
  telDoneTitle:'Waiting for the others.',telWaitTitle:'Telephone in progress.',
  telChainName:n=>`${n}'s chain`,telWrote:n=>`${n} wrote`,telGuessed:n=>`${n} guessed`,telDrew:n=>`${n} drew`,telNext:'Next chain',telEnd:'To the lobby',telHostNext:'The host shows the next chain.',telDoneButton:'Done'
 }
};
const store={get:(key,fallback='')=>{try{return localStorage.getItem(key)||fallback;}catch{return fallback;}},set:(key,v)=>{try{localStorage.setItem(key,String(v));}catch{}}};
// Saved choice first, otherwise Swedish for any Swedish browser language and English for everything else.
let lang=(()=>{const saved=store.get('ritkaos.lang','');if(saved==='sv'||saved==='en')return saved;try{return [...(navigator.languages||[]),navigator.language].some(l=>/^sv\b/i.test(l||''))?'sv':'en';}catch{return 'en';}})();
// Ritkaos+: codes stay in localStorage and go to the server in hello. Only the server decides what is unlocked.
const PALETTES={base:colors,candy:['#3b2f4a','#ff6f91','#ff9671','#ffc75f','#f9f871','#c4fcef','#4ffbdf','#00c9a7','#845ec2','#d65db1','#b39cd0','#ffffff'],night:['#0b1026','#1f2a5a','#3a4f9a','#5f7fd6','#9ab8ff','#f2e9a0','#ffd166','#ef476f','#7b2cbf','#c77dff','#2ec4b6','#ffffff'],forest:['#1e2d24','#3a5a40','#588157','#a3b18a','#dad7cd','#7f5539','#b08968','#ddb892','#e9c46a','#f4a261','#bc4749','#ffffff']};
const BRUSH_STYLES=['','marker','crayon','neon'],PAID_MODES=['blind','speed','telephone'],PAID_PACKS=['nineties','office','holidays','food','internet'];
const codes={get:()=>{try{const l=JSON.parse(store.get('ritkaos.codes','[]'));return Array.isArray(l)?l.filter(c=>typeof c==='string').slice(-20):[];}catch{return [];}},add:c=>{const l=codes.get().filter(x=>x!==c);l.push(c);store.set('ritkaos.codes',JSON.stringify(l.slice(-20)));}};
let owned=new Set(),shop={ready:false,checkout:'',products:[]},storeOpen=false,storeFocus='',chainData=null;
let brushStyle=store.get('ritkaos.brush',''),paletteId=store.get('ritkaos.palette','base');
const has=id=>owned.has(id)||owned.has('plus'),isUnlocked=id=>!!state?.unlocked?.includes(id);
const activePalette=()=>has('cosmetics')&&PALETTES[paletteId]?PALETTES[paletteId]:colors,activeStyle=()=>has('cosmetics')&&BRUSH_STYLES.includes(brushStyle)?brushStyle:'';
const T=(key,...args)=>{const v=STR[lang][key]??STR.sv[key]??key;return typeof v==='function'?v(...args):v;};
const icons={sparkle:'<path d="M11 2l2 6 6 2-6 2-2 6-2-6-6-2 6-2Z"/>',pen:'<path d="m4 16 1-4L15 2l4 4L9 16l-5 1Zm8-11 4 4M4 17h6"/>',eraser:'<path d="m9 17-6-6a2 2 0 0 1 0-3l6-6a2 2 0 0 1 3 0l6 6a2 2 0 0 1 0 3l-6 6H9Zm-4-8 8 8M9 17h10"/>',undo:'<path d="M3 8h9a5 5 0 0 1 0 10H8M3 8l4-4M3 8l4 4"/>',trash:'<path d="M3 5h14M8 2h4M5 5l1 13h8l1-13M8 8v7m4-7v7"/>',sound:'<path d="M3 8h4l4-4v14l-4-4H3ZM14 7q5 4 0 8m3-11q8 7 0 14"/>',mute:'<path d="M3 8h4l4-4v14l-4-4H3ZM15 8l5 6m0-6-5 6"/>',help:'<circle cx="10" cy="10" r="8"/><path d="M8 7a2 2 0 0 1 4 0c0 2-2 2-2 4m0 3h.01"/>',moon:'<path d="M17 13A7 7 0 0 1 9 5 7 7 0 1 0 17 13Z"/>',more:'<circle cx="5" cy="11" r="1.2" fill="currentColor"/><circle cx="11" cy="11" r="1.2" fill="currentColor"/><circle cx="17" cy="11" r="1.2" fill="currentColor"/>',close:'<path d="M6 6l10 10M16 6 6 16"/>',arrowRight:'<path d="M4 11h14m-5-5 5 5-5 5"/>',arrowUp:'<path d="M11 18V4m-6 6 6-6 6 6"/>',plus:'<path d="M11 4v14M4 11h14"/>',userPlus:'<circle cx="9" cy="8" r="3.5"/><path d="M3 18c.8-3.3 3-5 6-5s5.2 1.7 6 5M17 6v6m-3-3h6"/>',check:'<path d="m4.5 11.5 4 4 9-9"/>',crown:'<path d="M4 16 3 7l4.5 3.5L11 5l3.5 5.5L19 7l-1 9Z"/>',lock:'<rect x="5" y="10" width="12" height="9" rx="2"/><path d="M8 10V7a3 3 0 0 1 6 0v3"/>',eyeOff:'<path d="M3 3l16 16M9.5 5.2A9 9 0 0 1 11 5c4.5 0 8 4 9 6-.5 1-1.5 2.4-2.9 3.6M6.1 6.6C4.4 7.8 3.2 9.6 2 11c1 2 4.5 6 9 6 1.6 0 3-.5 4.3-1.2M9 9a3 3 0 0 0 4.1 4.1"/>',download:'<path d="M11 3v11m-4-4 4 4 4-4M4 18h14"/>',users:'<circle cx="8" cy="8" r="3"/><circle cx="15.5" cy="9" r="2.5"/><path d="M2.5 18c.7-3 2.8-4.6 5.5-4.6s4.8 1.6 5.5 4.6M14 13.6c2.6-.3 4.6 1.2 5.4 4"/>',infinity:'<path d="M11 11c-2-3-3.5-4-5-4a4 4 0 0 0 0 8c1.5 0 3-1 5-4s3.5-4 5-4a4 4 0 0 1 0 8c-1.5 0-3-1-5-4Z"/>',bolt:'<path d="M12 2 4 13h6l-1 7 8-11h-6Z"/>',phone:'<path d="M5 3h3l1.5 4-2 1.5a11 11 0 0 0 6 6l1.5-2 4 1.5v3a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2Z"/>',link:'<path d="M9 13a4 4 0 0 0 6 .5l3-3a4 4 0 0 0-5.7-5.7L11 6M13 9a4 4 0 0 0-6-.5l-3 3a4 4 0 0 0 5.7 5.7L11 16"/>',chevron:'<path d="m8 5 6 6-6 6"/>',sun:'<circle cx="11" cy="11" r="4"/><path d="M11 2v2M11 18v2M4.2 4.2l1.4 1.4M16.4 16.4l1.4 1.4M2 11h2M18 11h2M4.2 17.8l1.4-1.4M16.4 5.6l1.4-1.4"/>'};
const icon=key=>`<svg viewBox="0 0 22 22" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[key]}</svg>`;
function avatar(n=0){
 n=((n%8)+8)%8;const forms=['<path d="M8 31C5 8 28 5 42 10c15 5 18 33 5 43S13 52 8 31Z"/>','<path d="M13 9h37l8 23-9 22H15L5 34Z"/>','<path d="M10 19 16 5l13 9 17-6 11 18-5 26-34 6L5 37Z"/>','<rect x="7" y="7" width="50" height="50" rx="17"/>','<path d="M30 5c14-4 23 9 23 18S64 45 48 53 13 61 8 44 16 9 30 5Z"/>','<path d="M31 6 39 16 52 13 51 26 61 35 48 41 47 54 32 50 20 57 15 43 3 35 13 25 13 11 25 15Z"/>','<ellipse cx="32" cy="32" rx="27" ry="24"/>','<path d="M8 22 21 7l25 4 12 23-9 20-28 1L5 40Z"/>'];
 const face=n===2?'<path d="m20 29 7 2m8 0 7-2M24 40q8-6 16 0"/>':n===4?'<path d="m19 29 7-3m10 0 7 3M25 39q7 8 14 0"/>':'<path d="M23 27v6m15-6v6M25 40q7 6 14 0"/>';
 return `<svg class="avatar-svg" viewBox="0 0 64 64" aria-hidden="true"><g fill="${avatarColors[n]}">${forms[n]}</g><g stroke="#34382d" stroke-width="2.6" fill="none" stroke-linecap="round">${face}</g></svg>`;
}
const sessionStore={get:()=>{try{return sessionStorage.getItem('ritkaos.token');}catch{return null;}},set:v=>{try{sessionStorage.setItem('ritkaos.token',v);}catch{}}};
let selectedAvatar=Number(store.get('ritkaos.avatar','0'))||0;
let state=null,screen='home',ready=false,ws=null,me='',serverOffset=0,requestId=0,retry=0,reconnectTimer;
let lastCountdown='',overlayKey='',chatIds=new Set(),roomSeen='',lastPhase='',lan=[],soundOn=store.get('ritkaos.sound','yes')==='yes',audio;
const requests=new Map();let lastTick=-1,lastSecond=-1;
const canvas=$('#canvas'),ctx=canvas.getContext('2d'),base=document.createElement('canvas'),baseCtx=base.getContext('2d');
let boardEpoch='',ops=[],pending=new Map(),lastSeq=0,dirty=true,paintWidth=0,paintHeight=0;
let tool='pen',brushColor=colors[0],brushSize=7,stroke=null,pointQueue=[],lastFlush=0,clientSeq=0,lastCursorAt=0;
const cursors=new Map();let particles=[],lastFrame=performance.now();
const effectCanvas=$('#confetti'),effectCtx=effectCanvas.getContext('2d');
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
function toast(text,error=false){const el=document.createElement('div');el.className='toast'+(error?' error':'');el.textContent=text;$('#toasts').append(el);setTimeout(()=>el.remove(),4200);}
async function act(fn){try{return await fn();}catch(e){toast(e.message||T('genericError'),true);return null;}}
function send(type,data={}){if(ready&&ws?.readyState===WebSocket.OPEN){ws.send(JSON.stringify({type,data}));return true;}return false;}
function command(type,data={}){return new Promise((resolve,reject)=>{
 if(!ready||ws?.readyState!==WebSocket.OPEN){reject(new Error(T('noConnection')));return;}
 const id=++requestId;const timeout=setTimeout(()=>{requests.delete(id);reject(new Error(T('noAnswer')));},6500);
 requests.set(id,{resolve,reject,timeout});ws.send(JSON.stringify({type,data,request:id}));
});}
function connectionLabel(text){$('#connection-text').textContent=text;$('#network-status').title=text;}
function connectionUI(ok){document.body.classList.toggle('offline',!ok);$('#connection-banner').hidden=ok;$('#connection-dot').classList.toggle('online',ok);connectionLabel(ok?T('connected'):T('reconnecting'));}
function connect(){
 clearTimeout(reconnectTimer);const socket=new WebSocket(`${location.protocol==='https:'?'wss:':'ws:'}//${location.host}/ws`);ws=socket;
 socket.addEventListener('open',()=>socket.send(JSON.stringify({type:'hello',data:{token:sessionStore.get(),lang,codes:codes.get()}})));
 socket.addEventListener('message',e=>{
  let packet;try{packet=JSON.parse(e.data);}catch{return;}const d=packet.data||{};
  if(packet.type==='ack'){const request=requests.get(packet.request);if(request){clearTimeout(request.timeout);requests.delete(packet.request);packet.ok?request.resolve(d):request.reject(new Error(packet.error));}return;}
  switch(packet.type){
   case 'welcome':{const wasDisconnected=retry>0;ready=true;retry=0;me=d.id;sessionStore.set(d.token);serverOffset=d.serverTime-Date.now();connectionUI(true);if(!d.room&&state){state=null;showScreen('home');toast(T('roomGone'));}if(wasDisconnected&&d.room)toast(T('back'));break;}
   case 'state':applyState(d);break;case 'board':loadBoard(d);break;case 'ink':receiveInk(d);break;case 'chat':appendChat(d);break;case 'cursor':remoteCursor(d);break;case 'effect':effect(d);break;
   case 'rooms':if(screen==='home')renderRooms(d.rooms||[]);break;
   case 'owned':owned=new Set(d.products||[]);if(typeof d.ready==='boolean')shop.ready=d.ready;renderPalette();refreshStore();if(state&&screen==='lobby')renderLobby();break;
   case 'chain':chainData=d;overlayKey='';if(state&&screen==='game')renderGame();break;
   case 'kicked':state=null;roomSeen='';showScreen('home');toast(T(d.vote?'votedOut':'kicked'));history.replaceState(null,'','/');loadRooms();break;
   case 'replaced':sessionStore.set('');toast(T('replaced'),true);socket.preventReconnect=true;break;
  }
 });
 socket.addEventListener('close',()=>{if(ws!==socket)return;ready=false;connectionUI(false);stroke=null;pointQueue=[];pending.clear();dirty=true;for(const r of requests.values()){clearTimeout(r.timeout);r.reject(new Error(T('connectionLost')));}requests.clear();if(!socket.preventReconnect)reconnectTimer=setTimeout(connect,Math.min(retry>8?30000:5000,600*1.5**retry++));});
 socket.addEventListener('error',()=>{});
}
function showScreen(next){if(screen===next)return;screen=next;document.body.classList.toggle('is-playing',next==='game');for(const el of $$('.screen'))el.hidden=el.id!==next;if(next==='game'){requestAnimationFrame(resizeCanvas);lastSecond=-1;}if(next==='home')loadRooms();window.scrollTo({top:0,behavior:'instant'});}
let lastRooms='';
function roomHTML(r){
 const phase=T('phases')[r.phase]||T('phases').lobby,count=`${r.players}/${r.max||12}`;
 const title=r.kind==='public'?`${T('openMatch')} · ${esc(String(r.lang||'').toUpperCase())}`:esc(r.host);
 const others=r.kind==='public'?[]:(r.names||[]).filter(n=>n!==r.host).slice(0,3),extra=others.length?` · ${esc(others.join(', '))}`:'';
 return `<button type="button" class="lan-room" data-join="${esc(r.code)}" data-kind="${r.kind==='public'?'public':'network'}" ${r.full?'disabled':''}><div class="player-avatar">${avatar(r.avatar)}</div><div class="player-info"><span class="player-name">${title}</span><span class="player-subtitle">${count} · ${phase}${extra}</span></div><span class="lan-room-go">${r.full?T('full'):T('joinShort')}</span></button>`;
}
// Network rooms come from the same network as you; open matches are public games with strangers.
function renderRooms(rooms=[]){
 const box=$('#lan-rooms');if(!box)return;
 const list=Array.isArray(rooms)?rooms:[];const key=lang+JSON.stringify(list);if(key===lastRooms)return;lastRooms=key;
 const local=list.filter(r=>r.kind!=='public'),open=list.filter(r=>r.kind==='public');
 box.hidden=!local.length;box.innerHTML=local.map(roomHTML).join('');
 $('#open-rooms-wrap').hidden=!open.length;$('#open-rooms').innerHTML=open.map(roomHTML).join('');
}
function loadRooms(){
 if(screen!=='home')return;
 if(ready)act(()=>command('rooms')).then(d=>{if(d?.rooms)renderRooms(d.rooms);}).catch(()=>{});
 else fetch('/api/rooms').then(r=>r.json()).then(d=>renderRooms(d.rooms||[])).catch(()=>{});
}
function renderAvatars(){$('#big-avatar').innerHTML=avatar(selectedAvatar);$('#avatar-picker').innerHTML=avatarColors.map((_,i)=>`<button class="avatar-choice ${selectedAvatar===i?'selected':''}" data-avatar="${i}" aria-label="Avatar ${i+1}" aria-pressed="${selectedAvatar===i}">${avatar(i)}</button>`).join('');}
function playerHTML(p,index,lobby=false,results=false){
 const isMe=p.id===me, subtitle=results?'':!p.connected?T('offline'):p.spectator?T('nextTurn'):state.tel&&!lobby?(p.done?T('telDoneTag'):T('telWorking')):lobby?(p.id===state.host?T('roomHost'):T('ready')):p.guessed?T('guessed'):p.artist?T('drawingNow'):T('guessing');
 const vote=state.public&&p.kick&&!isMe?`<button class="vote-button${p.kick.mine?' mine':''}" data-vote="${p.id}" title="${esc(T('voteOut',p.name))}" aria-label="${esc(T('voteOut',p.name))}" aria-pressed="${p.kick.mine}">${icon('close')}${p.kick.votes?`<span>${p.kick.votes}/${p.kick.need}</span>`:''}</button>`:'';
 return `<div class="player-row ${isMe?'is-me':''} ${!p.connected?'offline':''}" data-player="${p.id}">${!lobby?`<span class="rank-number">${index+1}</span>`:''}<div class="player-avatar">${avatar(p.avatar)}</div><div class="player-info"><span class="player-name">${esc(p.name)} ${isMe?`<small>${T('you')}</small>`:''}${p.id===state.host?`<span class="host-crown">${icon('crown')}</span>`:''}</span><span class="player-subtitle">${subtitle}</span></div>${lobby?`${vote}<span class="player-status${p.connected?'':' off'}" aria-hidden="true"></span>${state.you.host&&!isMe?`<button class="kick-button" data-kick="${p.id}" title="${T('removePlayer')}" aria-label="${esc(T('remove',p.name))}">${icon('close')}</button>`:''}`:`${vote}<div class="player-points">${p.score}<small>${T('points')}</small></div>`}</div>`;
}
function applyState(next){
 const previous=state;state=next;serverOffset=next.serverTime-Date.now();
 if(roomSeen!==next.code){roomSeen=next.code;chatIds.clear();$('#chat-messages').replaceChildren();history.replaceState(null,'',`/?room=${next.code}`);}
 if(next.epoch!==boardEpoch)resetLocalBoard(next.epoch);
 const newScreen=next.phase==='lobby'?'lobby':next.phase==='ended'?'results':'game';showScreen(newScreen);
 if(newScreen==='lobby')renderLobby();else if(newScreen==='results')renderResults(previous?.phase!==next.phase);else renderGame();
 if(next.chat){const target=new Set(next.chat.map(m=>m.id));if(chatIds.size&&![...chatIds].some(id=>target.has(id))){$('#chat-messages').replaceChildren();chatIds.clear();}next.chat.forEach(appendChat);}
 if(next.phase!==lastPhase){if(next.phase==='drawing'){sound('start');if(next.you.role==='guesser'&&window.innerWidth>690)setTimeout(()=>$('#guess-input').focus({preventScroll:true}),80);}lastPhase=next.phase;lastTick=-1;}
}
function startHint(){
 const count=state.players.filter(p=>p.connected).length,min=state.minPlayers??(state.settings.mode==='coop'?3:state.settings.mode==='studio'?1:2);
 if(state.public){const left=state.autoStart?Math.max(0,Math.ceil((state.autoStart-Date.now()-serverOffset)/1000)):-1;return left>=0?T('startsIn',left):T('waitingOne');}
 return !state.you.host?T('hostStarts'):count<min?T('waitingFor',min-count):state.settings.mode==='studio'?T('inviteMore'):T('playersReady',count);
}
function renderLobby(){
 $('#lobby-code').textContent=state.code;$('#lobby-count').textContent=state.players.filter(p=>p.connected).length+' / '+(state.maxPlayers||12);$('#lobby-players').innerHTML=state.players.map((p,i)=>playerHTML(p,i,true)).join('');$('.lobby-player-empty').hidden=state.players.filter(p=>p.connected).length>=3;$('#host-label').textContent=state.public?T('openMatchTag'):state.you.host?T('youHost'):T('hostDecides');
 // Ritkaos+ modes and packs: the host sees every option (locked ones with a lock), guests only what is active.
 for(const button of $$('.mode-card')){const mode=button.dataset.mode,paid=PAID_MODES.includes(mode),selected=mode===state.settings.mode;button.classList.toggle('selected',selected);button.classList.toggle('locked',paid&&!isUnlocked(mode)&&!selected);button.hidden=paid&&!selected&&!state.you.host;button.disabled=!state.you.host;}
 renderPackOptions();
 for(const key of ['rounds','seconds','pack']){const input=$('#setting-'+key),mode=state.settings.mode;input.value=String(state.settings[key]);input.disabled=!state.you.host||mode==='studio'||key==='seconds'&&mode==='speed'||key==='rounds'&&mode==='telephone';}
 const safe=$('#setting-safe');safe.checked=!!state.settings.safe;safe.disabled=!state.you.host;
 const visible=$('#setting-visible');visible.checked=!!state.settings.visible;visible.disabled=!state.you.host;$('#visible-row').hidden=!!state.public;
 const custom=$('#setting-custom');if(document.activeElement!==custom)custom.value=state.settings.custom.join(', ');custom.disabled=!state.you.host;
 const count=state.players.filter(p=>p.connected).length,min=state.minPlayers??2;
 $('#start-game').hidden=!!state.public;$('#start-game').disabled=!state.you.host||count<min;$('#start-game').innerHTML=`<span>${T(state.settings.mode==='studio'?'openCanvas':'go')}</span>${icon('arrowRight')}`;
 $('#start-hint').textContent=startHint();lastCountdown='';
}
function renderGame(){
 if(state.tel){renderTelephone();return;}
 $('#tel-form').hidden=$('#tel-done').hidden=true;chainData=null;
 const artists=state.players.filter(p=>state.artists.includes(p.id)),can=canDraw(),studio=state.phase==='studio',isArtist=state.you.role==='artist';
 $('#mode-label').textContent=T('modes')[state.settings.mode];$('#round-label').textContent=studio?'':T('round',state.round,state.totalRounds||state.settings.rounds);$('#game-room-code').textContent=state.code;$('#game-players').innerHTML=[...state.players].sort((a,b)=>b.score-a.score).map((p,i)=>playerHTML(p,i)).join('');
 $('.word-area').classList.toggle('artist-word',isArtist||studio||state.phase==='reveal');
 $('#word-label').textContent=studio?T('everyoneDraws'):state.phase==='choosing'?T('disaster'):state.phase==='reveal'?T('promptWas'):isArtist?T('secret'):state.you.guessed?T('youGotIt'):T('guessMain');
 $('#word-hint').textContent=studio?T('freeCanvas'):state.phase==='choosing'?'…':state.prompt?state.prompt.answer:state.hint;
 $('#scene-hint').textContent=isArtist&&state.phase==='drawing'?state.prompt?.scene||'':state.phase==='drawing'&&!isArtist&&!state.you.guessed?T('guessWord',state.category):'';
 $('#drawing-status').textContent=studio?T('artistsOne',state.players.filter(p=>p.connected).length):artists.map(p=>p.name).join(' + ')+T(state.phase==='choosing'?'choosing':state.phase==='reveal'?'didBest':'drawing',artists.length);
 $('#canvas-hint').textContent=studio?T('studioHint'):'';
 $('#toolbar').hidden=!can;$('#spectator-bar').hidden=can;$('#keyboard-hint').hidden=!can;$('#end-studio').hidden=!(studio&&state.you.host);$('#clear').disabled=studio?!state.you.host:state.artists[0]!==me;
 $('#role-instruction').textContent=state.you.role==='spectator'?T('roleSpectator'):'';
 $('#drawing-surface').classList.toggle('can-draw',can);if(!can){endStroke();$('#brush-cursor').style.display='none';}
 const mod=state.modifier;$('#chaos-badge').hidden=!mod;if(mod)$('#chaos-badge').textContent=mod.name;$('#canvas-frame').classList.toggle('shaking',mod?.id==='shake');const blind=mod?.id==='blind'&&isArtist&&state.phase==='drawing';$('#drawing-surface').classList.toggle('blind',blind);
 // Blindritning: the server sends the artist no ink, the overlay just says so.
 const blindMode=state.settings.mode==='blind'&&isArtist&&state.phase==='drawing';$('#blind-overlay').hidden=!(blind||blindMode);$('#blind-overlay strong').textContent=T(blindMode?'blindTitle':'trust');$('#blind-overlay small').textContent=T(blindMode?'blindText':'trustText');
 const enabled=ready&&(studio||['lobby','reveal','ended'].includes(state.phase)||state.phase==='drawing'&&!isArtist&&!state.you.guessed&&state.you.role!=='spectator');$('#guess-input').disabled=!enabled;$('#guess-submit').disabled=!enabled;$('#chat-title').textContent=studio?T('chatHere'):T('guessHere');
 $('#guess-input').placeholder=studio?T('phTalk'):state.phase==='choosing'?T('phChoosing'):state.you.role==='spectator'?T('phSpectator'):state.you.guessed&&state.phase==='drawing'?T('phGuessed'):isArtist&&state.phase==='drawing'?T('phDrawing'):state.phase==='reveal'?T('phReveal'):T('phGuess');
 // Only the "close guess" hint is shown here; everything else is said by the word area and the placeholder.
 if(state.phase!=='drawing'||state.you.guessed||isArtist||!$('#guess-feedback').classList.contains('close')){$('#guess-feedback').textContent='';$('#guess-feedback').className='guess-feedback';}
 renderOverlay();requestAnimationFrame(resizeCanvas);
}
function renderOverlay(){
 const key=[lang,state.code,state.turn,state.phase,state.choices.length,state.artists.join(',')].join(':');if(overlayKey===key)return;overlayKey=key;const overlay=$('#game-overlay');overlay.classList.remove('chain-overlay');overlay.hidden=!['choosing','reveal'].includes(state.phase);if(overlay.hidden)return;overlay.classList.toggle('reveal-overlay',state.phase==='reveal');
 if(state.phase==='choosing'){
  if(state.choices.length){overlay.innerHTML=`<h2>${T('pickDisaster')}</h2><p>${T('boldWord')}</p><div class="choice-cards">${state.choices.map((c,i)=>`<button class="choice" data-choice="${c.index}"><span class="choice-number">${i+1}</span><span><strong>${esc(c.answer)}</strong><small>${esc(c.scene)}</small></span><span class="choice-arrow">${icon('chevron')}</span></button>`).join('')}</div><span class="next-turn">${T('autoPick')}</span>`;}
  else{const artist=state.players.find(p=>p.id===state.artists[0]);overlay.innerHTML=`<div class="overlay-avatar">${avatar(artist?.avatar||0)}</div><h2>${esc(T('isChoosing',artist?.name||T('theArtist')))}</h2>${state.you.role==='artist'?`<p>${T('drawTogether')}</p>`:''}<div class="loading-dots"><i></i><i></i><i></i></div>`;}
 }else overlay.innerHTML=`<span class="overlay-kicker">${T('promptWas')}</span><div class="revealed-answer">${esc(state.prompt?.answer||T('mystery'))}</div><p class="reveal-scene">${esc(state.prompt?.scene||'')}</p><span class="reveal-reason">${esc(state.reason)}</span><span class="next-turn">${T('nextTurnIn')}</span>`;
}
// Telefonleken: each player works on their own private canvas; the chains are revealed at the end.
function renderTelephone(){
 const tel=state.tel,task=tel.task,can=canDraw(),label={write:'telWriteLabel',draw:'telDrawLabel',guess:'telGuessLabel',reveal:'telRevealLabel',wait:'telWaitLabel'}[task];
 $('#mode-label').textContent=T('modes').telephone;$('#round-label').textContent=task==='reveal'?T('telChainOf',tel.show+1,tel.shows):T('telStep',tel.step,tel.steps);
 $('#game-room-code').textContent=state.code;$('#game-players').innerHTML=state.players.map((p,i)=>playerHTML(p,i)).join('');
 $('.word-area').classList.add('artist-word');$('#word-label').textContent=T(label);
 $('#word-hint').textContent=task==='draw'?tel.text:task==='reveal'?T('telChainName',chainData?.name||''):T(label+'Hint');
 $('#scene-hint').textContent=tel.from&&task!=='reveal'?T(task==='draw'?'telFromWrote':'telFromDrew',tel.from):'';
 $('#drawing-status').textContent=task==='reveal'?T('telRevealStatus'):T('telStatus',tel.doneCount,tel.needCount);$('#canvas-hint').textContent=T('telHint');
 $('#toolbar').hidden=!can;$('#spectator-bar').hidden=can;$('#keyboard-hint').hidden=!can;$('#end-studio').hidden=true;$('#clear').disabled=!can;$('#tel-done').hidden=!(task==='draw'&&!tel.done);
 $('#role-instruction').textContent=state.you.role==='spectator'?T('roleSpectator'):tel.done?T('telWaiting'):T('telRole');
 $('#drawing-surface').classList.toggle('can-draw',can);if(!can){endStroke();$('#brush-cursor').style.display='none';}
 $('#chaos-badge').hidden=true;$('#canvas-frame').classList.remove('shaking');$('#drawing-surface').classList.remove('blind');$('#blind-overlay').hidden=true;
 $('#guess-input').disabled=$('#guess-submit').disabled=!ready;$('#guess-input').placeholder=T('phTalk');$('#chat-title').textContent=T('chatHere');$('#guess-feedback').textContent='';$('#guess-feedback').className='guess-feedback';
 const typing=['write','guess'].includes(task)&&!tel.done;$('#tel-form').hidden=!typing;$('#tel-input').placeholder=T(task==='write'?'telWritePh':'telGuessPh');
 renderTelOverlay();requestAnimationFrame(resizeCanvas);
}
function renderTelOverlay(){
 const tel=state.tel,task=tel.task,show=task==='reveal'||task==='wait'||tel.done||task==='write';
 const key=['tel',lang,state.code,tel.step,task,tel.done,tel.doneCount,tel.needCount,state.you.host,tel.show,chainData?.index].join(':');if(overlayKey===key)return;overlayKey=key;
 const overlay=$('#game-overlay');overlay.classList.remove('reveal-overlay');overlay.classList.toggle('chain-overlay',task==='reveal');overlay.hidden=!show;if(!show)return;
 if(task==='reveal'){
  const steps=chainData?.index===tel.show?chainData.steps:[];
  overlay.innerHTML=`<span class="overlay-kicker">${T('telChainOf',tel.show+1,tel.shows)}</span><h2>${esc(T('telChainName',chainData?.name||''))}</h2><div class="chain-list">${steps.map((x,i)=>`<div class="chain-step" style="--i:${i}"><small>${esc(T(x.kind==='drawing'?'telDrew':i===0?'telWrote':'telGuessed',x.name))}</small>${x.kind==='text'?`<strong>${esc(x.text)}</strong>`:`<canvas data-step="${i}" width="600" height="396"></canvas>`}</div>`).join('')}</div>${state.you.host?`<button class="button primary" id="tel-next"><span>${T(tel.show+1<tel.shows?'telNext':'telEnd')}</span>${icon('arrowRight')}</button>`:`<span class="next-turn">${T('telHostNext')}</span>`}`;
  for(const c of overlay.querySelectorAll('canvas[data-step]')){const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,600,396);for(const op of steps[c.dataset.step].ops)paint(x,op,600,396);}
  $('#tel-next')?.addEventListener('click',()=>act(()=>command('tnext')));
 }else if(task==='wait')overlay.innerHTML=`<h2>${T('telWaitTitle')}</h2><p>${T('roleSpectator')}</p>`;
 else if(tel.done)overlay.innerHTML=`<h2>${T('telDoneTitle')}</h2><p>${T('telStatus',tel.doneCount,tel.needCount)}</p><div class="loading-dots"><i></i><i></i><i></i></div>`;
 else overlay.innerHTML=`<h2>${T('telWriteTitle')}</h2><p>${T('telWriteText')}</p>`;
}
function renderResults(celebrate){
 const ranked=[...state.players].sort((a,b)=>b.score-a.score),tied=ranked.filter(p=>p.score===ranked[0]?.score).length>1;
 $('#results-title').innerHTML=tied?T('sharedFirst'):T('won',esc(ranked[0]?.name||T('someone')));
 const top=ranked.slice(0,3),order=top.length>1?[top[1],top[0],top[2]].filter(Boolean):top;
 $('#podium').innerHTML=order.map(p=>{const index=ranked.findIndex(x=>x.id===p.id);return `<div class="podium-player ${index===0?'first':index===2?'third':'second'}"><div class="podium-avatar">${avatar(p.avatar)}</div><span class="podium-name">${esc(p.name)}</span><div class="podium-block"><span class="podium-place">${p.score===ranked[0].score?1:index+1}</span><span class="podium-score">${T('scorePoints',p.score)}</span></div></div>`;}).join('');
 $('#results-table').innerHTML=ranked.map((p,i)=>playerHTML(p,i,false,true)).join('');$('#rematch').disabled=!state.you.host;$('#back-lobby').disabled=!state.you.host;$('#rematch').hidden=$('#back-lobby').hidden=!!state.public;$('#results-waiting').hidden=state.you.host&&!state.public;$('#results-waiting').textContent=state.public?'':T('waitingHost');lastCountdown='';
 const mine=ranked.find(p=>p.id===me)?.score||0,best=Number(store.get('ritkaos.best','0'))||0;if(mine>best)store.set('ritkaos.best',mine);if(celebrate){sound('win');confetti(160);}
}
function appendChat(m){
 if(chatIds.has(m.id))return;chatIds.add(m.id);const container=$('#chat-messages'),nearBottom=container.scrollHeight-container.scrollTop-container.clientHeight<85;const div=document.createElement('div');div.className='chat-message '+m.kind;
 if(['guess','chat'].includes(m.kind)){const name=document.createElement('span');name.className='chat-name';name.style.color=['#8c76bd','#739044','#b67b56','#648c9f','#a8984d','#aa7798','#6a967f','#8586aa'][m.avatar%8];name.textContent=m.name+':';div.append(name);}div.append(document.createTextNode(m.text));container.append(div);while(container.children.length>100)container.firstElementChild.remove();if(nearBottom||m.player===me)requestAnimationFrame(()=>container.scrollTop=container.scrollHeight);
}
function setTool(next){tool=next;$('#tool-pen').classList.toggle('active',next==='pen');$('#tool-eraser').classList.toggle('active',next==='eraser');updateBrushCursor();}
function renderPalette(){const list=activePalette();if(!list.includes(brushColor))brushColor=list[0];$('#palette').innerHTML=list.map(c=>`<button class="swatch ${brushColor===c?'active':''}" data-color="${c}" style="background:${c}" title="${c}" aria-label="${T('color',c)}" aria-pressed="${brushColor===c}"></button>`).join('');}
function canDraw(){return ready&&state&&!state.you.guessed&&state.you.role==='artist'&&['drawing','studio','tdraw'].includes(state.phase)&&!state.tel?.done;}
function brush(){let width=brushSize/1000,color=tool==='eraser'?'#ffffff':brushColor;if(state?.modifier?.id==='tiny')width=Math.min(width,.003);if(state?.modifier?.id==='mono'&&tool!=='eraser')color='#8b66ef';return {width,color,style:tool==='eraser'?'':activeStyle()};}
// Ritkaos+ brush styles. Crayon grain is seeded from the points, so every screen draws the same texture.
function crayon(context,op,w,h){
 const pts=op.from?[op.from,...op.points]:op.points,r=Math.max(1,op.width*w/2),dot=Math.max(1,r*.38);let seed=(Math.round(pts[0][0]*1e5)*73856093^Math.round(pts[0][1]*1e5)*19349663)>>>0;
 const rand=()=>(seed=(seed*1664525+1013904223)>>>0)/4294967296;context.save();context.fillStyle=op.color;
 for(let i=0;i<pts.length;i++){const a=pts[Math.max(0,i-1)],b=pts[i],ax=a[0]*w,ay=a[1]*h,bx=b[0]*w,by=b[1]*h,steps=Math.max(1,Math.ceil(Math.hypot(bx-ax,by-ay)/(r*.5)));
  for(let s=i?1:0;s<=steps;s++){const x=ax+(bx-ax)*s/steps,y=ay+(by-ay)*s/steps;for(let k=0;k<3+r/3;k++){const angle=rand()*6.283,dist=r*Math.sqrt(rand());context.globalAlpha=.3+rand()*.5;context.fillRect(x+Math.cos(angle)*dist-dot/2,y+Math.sin(angle)*dist-dot/2,dot,dot);}}}
 context.restore();
}
function paint(context,op,w,h){
 if(op.style==='crayon'&&op.points?.length)return crayon(context,op,w,h);
 if(op.style==='marker'||op.style==='neon'){context.save();paintPlain(context,op,w,h,op.style);context.restore();return;}
 paintPlain(context,op,w,h);
}
function paintPlain(context,op,w,h,style=''){
 if(style==='marker'){context.globalAlpha=.62;context.globalCompositeOperation='multiply';}
 if(style==='neon'){context.shadowColor=op.color;context.shadowBlur=Math.max(4,op.width*w*1.6);}
 paintPath(context,op,w,h);
 if(style==='neon'){context.shadowBlur=0;paintPath(context,{...op,color:'#ffffffd0',width:op.width*.38},w,h);}
}
function paintPath(context,op,w,h){
 context.strokeStyle=op.color;context.fillStyle=op.color;context.lineWidth=op.width*w;context.lineCap='round';context.lineJoin='round';const points=op.points;if(!points?.length)return;
 if(!op.from&&points.length===1){context.beginPath();context.arc(points[0][0]*w,points[0][1]*h,Math.max(.3,op.width*w/2),0,Math.PI*2);context.fill();return;}
 const start=op.from||points[0];context.beginPath();context.moveTo(start[0]*w,start[1]*h);for(const p of points)context.lineTo(p[0]*w,p[1]*h);context.stroke();
}
function rebuildBase(){if(!paintWidth)return;baseCtx.fillStyle='#fff';baseCtx.fillRect(0,0,paintWidth,paintHeight);for(const op of ops)paint(baseCtx,op,paintWidth,paintHeight);dirty=true;}
function resetLocalBoard(epoch){stroke=null;pointQueue=[];pending.clear();ops=[];lastSeq=0;boardEpoch=epoch;for(const c of cursors.values())c.el.remove();cursors.clear();rebuildBase();dirty=true;}
function loadBoard(data){if(data.epoch!==boardEpoch)resetLocalBoard(data.epoch);ops=data.ops||[];lastSeq=data.seq||0;pending.clear();stroke=null;pointQueue=[];rebuildBase();}
function receiveInk(data){
 if(data.epoch!==boardEpoch)return;const op=data.op;if(op.owner===me)pending.delete(op.cid);if(op.seq<=lastSeq){dirty=true;return;}if(op.seq!==lastSeq+1){act(()=>command('sync'));return;}lastSeq=op.seq;ops.push(op);if(paintWidth)paint(baseCtx,op,paintWidth,paintHeight);dirty=true;
}
function resizeCanvas(){if(screen!=='game')return;const rect=canvas.getBoundingClientRect();if(rect.width<1)return;const dpr=Math.min(devicePixelRatio||1,2),w=Math.round(rect.width*dpr),h=Math.round(rect.height*dpr);if(w===paintWidth&&h===paintHeight)return;paintWidth=w;paintHeight=h;canvas.width=w;canvas.height=h;base.width=w;base.height=h;rebuildBase();updateBrushCursor();}
function pointFromEvent(e){const rect=canvas.getBoundingClientRect();let x=(e.clientX-rect.left)/rect.width,y=(e.clientY-rect.top)/rect.height;if(state?.modifier?.id==='mirror')x=1-x;return [Math.max(0,Math.min(1,x)),Math.max(0,Math.min(1,y))];}
function updateBrushCursor(p){const cursor=$('#brush-cursor'),width=brush().width*canvas.getBoundingClientRect().width;cursor.style.width=cursor.style.height=Math.max(3,width)+'px';if(p){cursor.style.left=p[0]*100+'%';cursor.style.top=p[1]*100+'%';cursor.style.display=canDraw()?'block':'none';}$('#size-preview').style.setProperty('--brush-dot',Math.max(3,brushSize/2)+'px');}
function beginStroke(e){
 if(!canDraw()||e.button>0)return;e.preventDefault();soundUnlock();if(stroke)endStroke();
 canvas.setPointerCapture(e.pointerId);const point=pointFromEvent(e),b=brush(),id=`${me}_${Date.now().toString(36)}_${Math.floor(Math.random()*1e7).toString(36)}`;
 stroke={id,pointer:e.pointerId,last:point,localLast:point,...b};pointQueue=[];const cid=++clientSeq,op={stroke:id,owner:me,...b,points:[point],from:null,cid};pending.set(cid,op);dirty=true;
 command('stroke.begin',{epoch:boardEpoch,stroke:id,point,width:b.width,color:b.color,style:b.style,eraser:tool==='eraser',cid}).catch(e=>{pending.delete(cid);stroke=null;pointQueue=[];dirty=true;toast(e.message,true);act(()=>command('sync'));});updateBrushCursor(point);
}
function movePointer(e){
 if(!canDraw())return;const point=pointFromEvent(e);updateBrushCursor(point);if(performance.now()-lastCursorAt>60){send('cursor',{point});lastCursorAt=performance.now();}if(!stroke||stroke.pointer!==e.pointerId)return;e.preventDefault();
 const events=typeof e.getCoalescedEvents==='function'?e.getCoalescedEvents():[];for(const ev of events.length?events:[e]){const p=pointFromEvent(ev);if(Math.hypot(p[0]-stroke.localLast[0],p[1]-stroke.localLast[1])<.00035)continue;pointQueue.push(p);stroke.localLast=p;if(pointQueue.length>=60)flushPoints();}dirty=true;
}
function flushPoints(){if(!stroke||!pointQueue.length)return;const points=pointQueue.splice(0,80),cid=++clientSeq,op={stroke:stroke.id,owner:me,color:stroke.color,width:stroke.width,style:stroke.style,from:stroke.last,points,cid};stroke.last=points.at(-1);pending.set(cid,op);dirty=true;send('stroke.points',{epoch:boardEpoch,stroke:stroke.id,points,cid});lastFlush=performance.now();}
function endStroke(e){if(!stroke||e&&e.pointerId!==stroke.pointer)return;while(pointQueue.length)flushPoints();send('stroke.end',{epoch:boardEpoch,stroke:stroke.id});try{if(canvas.hasPointerCapture(stroke.pointer))canvas.releasePointerCapture(stroke.pointer);}catch{}stroke=null;pointQueue=[];dirty=true;}
function remoteCursor(d){
 if(d.id===me||!state?.players.some(p=>p.id===d.id))return;let c=cursors.get(d.id);
 if(!c){const el=document.createElement('div');el.className='remote-cursor';const color=avatarColors[d.avatar%8];el.innerHTML=`<svg viewBox="0 0 16 20" fill="${color}" stroke="#575e4a" stroke-width="1.1"><path d="m1 1 12 11-6 1-3 5Z"/></svg><span style="background:${color};color:#48513a">${esc(d.name)}</span>`;$('#cursor-layer').append(el);c={el,at:0};cursors.set(d.id,c);}c.at=performance.now();c.el.style.left=d.point[0]*100+'%';c.el.style.top=d.point[1]*100+'%';c.el.hidden=false;
}
function saveDrawing(){const out=document.createElement('canvas');out.width=1500;out.height=990;const c=out.getContext('2d');c.fillStyle='#fff';c.fillRect(0,0,1500,990);for(const op of ops)paint(c,op,1500,990);out.toBlob(blob=>{if(!blob)return;const link=document.createElement('a');link.download=`ritkaos-${state?.code||'bild'}-${state?.turn||1}.png`;link.href=URL.createObjectURL(blob);link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);});toast(T('saved'));}
function modal(html){storeOpen=false;$('#modal-content').innerHTML=html;const d=$('#modal');if(!d.open)d.showModal();}
function confirmAction(title,text,label,fn){modal(`<h2 class="modal-title">${esc(title)}</h2><p class="modal-text">${esc(text)}</p><div class="modal-buttons"><button class="button subtle" id="modal-cancel">${T('cancel')}</button><button class="button primary" id="modal-confirm">${esc(label)}</button></div>`);$('#modal-cancel').onclick=()=>$('#modal').close();$('#modal-confirm').onclick=()=>{$('#modal').close();act(fn);};}
// Ritkaos+ sheet: prices, what you own, a code field, and Buy when a checkout link is configured.
const productName=id=>T('products')[id]?.[0]||id,canBuy=()=>shop.ready&&!!shop.checkout;
function buyUrl(id){const u=shop.checkout;return u.includes('{product}')?u.replaceAll('{product}',encodeURIComponent(id)):`${u}${u.includes('?')?'&':'?'}product=${encodeURIComponent(id)}&lang=${lang}`;}
function storeRow(p){
 const mine=has(p.id),hostHas=!mine&&isUnlocked(p.id)&&!state?.you.host;
 const end=mine?`<span class="store-owned">${icon('check')}${T('ownedTag')}</span>`:hostHas?`<span class="store-owned">${icon('check')}${T('hostTag')}</span>`:`<span class="store-price">${T('price',p.price)}</span>${canBuy()?`<button class="button ${p.id==='plus'?'primary':'subtle'} store-buy" data-buy="${p.id}">${T('buy')}</button>`:''}`;
 return `<div class="store-row${p.id==='plus'?' store-plus':''}${storeFocus===p.id?' focus':''}"><div class="store-copy"><strong>${esc(productName(p.id))}</strong><small>${esc(T('products')[p.id]?.[1]||'')}</small></div>${end}</div>`;
}
function renderStore(){
 const groups=[['bundle',''],['pack','storePacks'],['mode','storeModes'],['cosmetic','storeCosmetics']];
 modal(`<div class="modal-icon">${icon('sparkle')}</div><h2 class="modal-title">Ritkaos+</h2><p class="modal-text">${T('storeText')}</p>${groups.map(([kind,head])=>{const items=shop.products.filter(p=>p.kind===kind);return items.length?`<div class="store-group">${head?`<span class="card-kicker">${T(head)}</span>`:''}${items.map(storeRow).join('')}</div>`:'';}).join('')}<form id="unlock-form" class="join-row store-code"><label class="sr-only" for="unlock-code">${T('unlockCode')}</label><input id="unlock-code" class="large-input code-input" maxlength="24" placeholder="RK-XXXX-XXXX-XXXX" autocomplete="off" aria-label="${T('unlockCode')}"><button class="button dark" type="submit">${T('unlockButton')}</button></form><p id="unlock-error" class="inline-error" role="alert"></p><p class="modal-content-small">${canBuy()?T('storeAfterBuy'):T('storeSoon')}</p>`);
 storeOpen=true;
 for(const b of $$('[data-buy]'))b.onclick=()=>window.open(buyUrl(b.dataset.buy),'_blank','noopener');
 $('#unlock-form').onsubmit=async e=>{e.preventDefault();const input=$('#unlock-code'),code=input.value.trim().toUpperCase();if(!code)return;$('#unlock-error').textContent='';
  try{await command('redeem',{code});codes.add(code);input.value='';toast(T('unlockedToast'));sound('correct');renderStore();}catch(err){$('#unlock-error').textContent=err.message;}};
 $('.store-row.focus')?.scrollIntoView({block:'nearest'});
}
function openStore(focus=''){storeFocus=focus;renderStore();}
function refreshStore(){if(storeOpen&&$('#modal').open&&!$('#unlock-code')?.value)renderStore();}
function renderPackOptions(){for(const o of $$('#setting-pack option[data-paid]')){const selected=state?.settings.pack===o.value;o.textContent=productName(o.value)+(state&&!isUnlocked(o.value)&&!selected?' 🔒':'');o.hidden=o.disabled=!!state&&!state.you.host&&!selected;}}
function styleSheet(){
 const unlocked=has('cosmetics');
 modal(`<div class="modal-icon">${icon('sparkle')}</div><h2 class="modal-title">${T('styleTitle')}</h2><p class="modal-text">${unlocked?T('styleText'):T('styleLocked')}</p><span class="card-kicker">${T('brushesHeading')}</span><div class="style-grid">${BRUSH_STYLES.map(x=>`<button type="button" class="style-choice${activeStyle()===x?' selected':''}${x&&!unlocked?' locked':''}" data-brush="${x}"><canvas width="120" height="40" data-preview="${x}"></canvas><span>${T('brushes')[x||'pen']}</span></button>`).join('')}</div><span class="card-kicker">${T('palettesHeading')}</span><div class="style-grid">${Object.keys(PALETTES).map(id=>`<button type="button" class="style-choice${(unlocked?paletteId:'base')===id?' selected':''}${id!=='base'&&!unlocked?' locked':''}" data-palette="${id}"><span class="palette-preview">${PALETTES[id].slice(0,6).map(c=>`<i style="background:${c}"></i>`).join('')}</span><span>${T('palettes')[id]}</span></button>`).join('')}</div>`);
 for(const c of $$('canvas[data-preview]')){const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,120,40);paint(x,{color:brushColor==='#ffffff'?'#866acf':brushColor,width:.05,style:c.dataset.preview,from:null,points:[[.1,.65],[.3,.3],[.5,.62],[.7,.32],[.9,.55]]},120,40);}
 for(const b of $$('.style-choice'))b.onclick=()=>{if(b.classList.contains('locked')){openStore('cosmetics');return;}if('brush' in b.dataset){brushStyle=b.dataset.brush;store.set('ritkaos.brush',brushStyle);setTool('pen');}else{paletteId=b.dataset.palette;store.set('ritkaos.palette',paletteId);renderPalette();}sound('click');styleSheet();};
}
async function invite(){
 if(!state)return;const onLocal=/^(localhost|127\.0\.0\.1)$/.test(location.hostname),urlBase=onLocal&&lan.length?lan[0]:location.origin,link=`${urlBase}/?room=${state.code}`,publicLink=location.protocol==='https:';
 modal(`<div class="modal-icon">${icon('link')}</div><h2 class="modal-title">${T('inviteTitle')}</h2><p class="modal-text">${T('inviteText')}</p><input id="invite-url" class="invite-input" readonly value="${esc(link)}" aria-label="${T('inviteLink')}"><button class="button primary huge" id="copy-link"><span>${T('copyLink')}</span>${icon('link')}</button><p class="modal-content-small">${T('codeLabel')} <strong>${state.code}</strong><br>${publicLink?T('publicLink'):T('localLink')}</p>`);
 $('#invite-url').onclick=e=>e.target.select();$('#copy-link').onclick=async()=>{let copied=false;try{await navigator.clipboard.writeText(link);copied=true;}catch{$('#invite-url').select();try{copied=document.execCommand('copy');}catch{}}if(copied){$('#copy-link').innerHTML=`<span>${T('copied')}</span>${icon('check')}`;toast(T('copiedToast'));}else toast(T('copyManual'));};
}
function help(){closeMenu();modal(`<div class="modal-icon">${icon('pen')}</div><h2 class="modal-title">${T('helpTitle')}</h2><div class="help-steps"><div class="help-step"><span>1</span><p>${T('help1')}</p></div><div class="help-step"><span>2</span><p>${T('help2')}</p></div><div class="help-step"><span>3</span><p>${T('help3')}</p></div></div><p class="modal-content-small">${T('helpSmall')}<span class="kb-only"> ${T('helpKeys')}</span></p>`);}
function soundUnlock(){if(!soundOn)return;try{audio ||= new (window.AudioContext||window.webkitAudioContext)();if(audio.state==='suspended')audio.resume();}catch{}}
function sound(kind){
 if(!soundOn||!audio)return;const tones={correct:[[660,0,.10],[880,.09,.13],[1108,.19,.19]],start:[[392,0,.12],[523,.11,.15]],tick:[[550,0,.045]],click:[[520,0,.045]],chaos:[[220,0,.1],[294,.09,.12],[370,.18,.15]],win:[[523,0,.16],[659,.14,.16],[784,.28,.16],[1046,.45,.35]]};
 for(const [freq,delay,duration] of tones[kind]||tones.click){const o=audio.createOscillator(),g=audio.createGain();o.type='sine';o.frequency.value=freq;o.connect(g);g.connect(audio.destination);const t=audio.currentTime+delay;g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.075,t+.008);g.gain.exponentialRampToValueAtTime(.0001,t+duration);o.start(t);o.stop(t+duration+.01);}
}
function updateSound(){const b=$('#sound'),label=soundOn?T('soundOff'):T('soundOn');b.innerHTML=icon(soundOn?'sound':'mute')+`<span class="menu-label">${label}</span>`;b.title=label;b.setAttribute('aria-label',label);}
function applyTheme(){
 document.documentElement.classList.toggle('dark',darkOn);store.set('ritkaos.dark',darkOn?'yes':'no');
 const theme=$('#theme'),label=darkOn?T('lightMode'):T('darkMode');theme.innerHTML=icon(darkOn?'sun':'moon')+`<span class="menu-label">${label}</span>`;theme.title=label;theme.setAttribute('aria-label',label);
 const meta=document.querySelector('meta[name="theme-color"]');if(meta)meta.content=darkOn?'#1b1d18':'#f5f5ef';
}
let darkOn=(()=>{const stored=store.get('ritkaos.dark','');if(stored==='yes')return true;if(stored==='no')return false;try{return matchMedia('(prefers-color-scheme: dark)').matches;}catch{return false;}})();
function confetti(count=70){if(reduced)return;const w=innerWidth;for(let i=0;i<count;i++)particles.push({x:w*(.25+Math.random()*.5),y:innerHeight*.35,vx:(Math.random()-.5)*600,vy:-100-Math.random()*450,angle:Math.random()*6,spin:(Math.random()-.5)*8,life:2+Math.random(),color:[...avatarColors,'#d9fa8c'][i%9],size:4+Math.random()*5});}
function effect(d){
 if(d.kind==='correct'){sound('correct');$('#canvas-frame').classList.add('success-flash');setTimeout(()=>$('#canvas-frame').classList.remove('success-flash'),550);if(d.player===me){confetti(70);toast(T(d.fast?'correctFast':'correctToast',d.points));$('#guess-input').value='';}else if(state?.you.role==='artist')toast(T('othersCorrect',d.name));}
 else if(d.kind==='chaos'){sound('chaos');toast(d.name);}
 else if(d.kind==='reaction'){if(reduced)return;const el=document.createElement('div');el.className='reaction-float';el.textContent=d.emoji;el.style.left=(8+Math.random()*75)+'%';el.style.animationDuration=(2+Math.random()*.8)+'s';$('#reaction-layer').append(el);setTimeout(()=>el.remove(),3000);}
}
// Open matches count down on the lobby (auto-start) and results (back to lobby) screens.
function publicCountdown(){
 const target=screen==='lobby'?state.autoStart:state.deadline,left=target?Math.max(0,Math.ceil((target-Date.now()-serverOffset)/1000)):-1,key=screen+left;if(key===lastCountdown)return;lastCountdown=key;
 if(screen==='lobby')$('#start-hint').textContent=startHint();else $('#results-waiting').textContent=left>=0?T('backToLobbyIn',left):'';
}
function tickUI(){
 if(state?.public&&(screen==='lobby'||screen==='results')){publicCountdown();return;}
 if(!state||screen!=='game')return;const left=Math.max(0,Math.ceil((state.deadline-Date.now()-serverOffset)/1000));if(left===lastSecond)return;lastSecond=left;const studio=state.phase==='studio';$('#timer-number').textContent=studio?'∞':left;const total=state.phase==='choosing'?(state.timing?.choose||16000)/1000:state.phase==='reveal'?(state.timing?.reveal||6500)/1000:state.duration/1000||75;$('#timer-ring').style.strokeDashoffset=String(144.51*(1-Math.min(1,left/total)));$('#timer').classList.toggle('urgent',!studio&&left<=10&&['drawing','tdraw'].includes(state.phase));for(const el of $$('[data-seconds]'))el.textContent=left;if(state.phase==='drawing'&&left<=5&&left>0&&left!==lastTick){lastTick=left;sound('tick');}
}
function frame(now){
 const dt=Math.min(.035,(now-lastFrame)/1000);lastFrame=now;if(stroke&&pointQueue.length&&now-lastFlush>40)flushPoints();
 if(dirty&&paintWidth&&screen==='game'){ctx.clearRect(0,0,paintWidth,paintHeight);ctx.drawImage(base,0,0);for(const op of pending.values())paint(ctx,op,paintWidth,paintHeight);if(stroke&&pointQueue.length)paint(ctx,{...stroke,points:pointQueue,from:stroke.last},paintWidth,paintHeight);dirty=false;}
 for(const c of cursors.values())if(now-c.at>2200)c.el.hidden=true;tickUI();
 if(effectCanvas.width!==innerWidth||effectCanvas.height!==innerHeight){effectCanvas.width=innerWidth;effectCanvas.height=innerHeight;}effectCtx.clearRect(0,0,effectCanvas.width,effectCanvas.height);
 if(particles.length){particles=particles.filter(p=>p.life>0);for(const p of particles){p.life-=dt;p.vy+=540*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.angle+=p.spin*dt;effectCtx.save();effectCtx.translate(p.x,p.y);effectCtx.rotate(p.angle);effectCtx.globalAlpha=Math.min(1,p.life);effectCtx.fillStyle=p.color;effectCtx.fillRect(-p.size/2,-p.size/2,p.size,p.size*.65);effectCtx.restore();}}
 requestAnimationFrame(frame);
}
// Only names, avatar preferences, mute state and a personal best are kept locally.
$('#nickname').value=store.get('ritkaos.name',T('names')[Math.floor(Math.random()*6)]);$('#nickname').addEventListener('change',e=>store.set('ritkaos.name',e.target.value.trim()));
$('#avatar-picker').addEventListener('click',e=>{const b=e.target.closest('[data-avatar]');if(!b)return;selectedAvatar=Number(b.dataset.avatar);store.set('ritkaos.avatar',selectedAvatar);renderAvatars();sound('click');});
async function enter(type){
 $('#entry-error').textContent='';const name=$('#nickname').value.trim();if(!name){$('#entry-error').textContent=T('nameFirst');$('#nickname').focus();return;}const code=$('#room-code').value.toUpperCase().trim();if(type==='join'&&code.length!==6){$('#entry-error').textContent=T('codeLength');$('#room-code').focus();return;}
 $('#create-room').disabled=$('#quick-match').disabled=true;try{store.set('ritkaos.name',name);soundUnlock();await command(type,{name,avatar:selectedAvatar,code,lang,visible:$('#create-visible').checked});sound('start');}catch(e){$('#entry-error').textContent=e.message;}finally{$('#create-room').disabled=$('#quick-match').disabled=false;}
}
$('#create-room').onclick=()=>enter('create');$('#join-form').onsubmit=e=>{e.preventDefault();enter('join');};$('#room-code').oninput=e=>e.target.value=e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'');
$('#quick-match').onclick=()=>enter('quick');
$('#lan-rooms').onclick=$('#open-rooms').onclick=e=>{const b=e.target.closest('[data-join]');if(!b||b.disabled)return;$('#room-code').value=b.dataset.join;enter('join');};
$('#modes').onclick=e=>{const b=e.target.closest('[data-mode]');if(!b)return;if(b.classList.contains('locked')){openStore(b.dataset.mode);return;}act(()=>command('settings',{mode:b.dataset.mode}));};for(const key of ['rounds','seconds','pack'])$('#setting-'+key).onchange=e=>{const value=e.target.value;if(key==='pack'&&PAID_PACKS.includes(value)&&!isUnlocked(value)){e.target.value=state.settings.pack;openStore(value);return;}act(()=>command('settings',{[key]:key==='pack'?value:Number(value)}));};$('#setting-safe').onchange=e=>act(()=>command('settings',{safe:e.target.checked}));$('#setting-visible').onchange=e=>act(()=>command('settings',{visible:e.target.checked}));$('#setting-custom').onchange=e=>act(()=>command('settings',{custom:e.target.value}));
$('#start-game').onclick=()=>act(async()=>{soundUnlock();await command('settings',{custom:$('#setting-custom').value});return command('start');});$('#rematch').onclick=()=>act(()=>command('start'));$('#back-lobby').onclick=()=>act(()=>command('lobby'));$('#end-studio').onclick=()=>act(()=>command('lobby'));
$('#lobby-players').onclick=e=>{const b=e.target.closest('[data-kick]');if(b)confirmAction(T('removeTitle'),T('removeText'),T('removeButton'),()=>command('kick',{id:b.dataset.kick}));};
for(const box of ['#lobby-players','#game-players'])$(box).addEventListener('click',e=>{const b=e.target.closest('[data-vote]');if(!b)return;const mine=b.classList.contains('mine');act(async()=>{await command('vote',{id:b.dataset.vote});toast(T(mine?'voteWithdrawn':'voteCast'));});});
const askLeave=()=>confirmAction(T('leaveTitle'),T('leaveText'),T('leave'),async()=>{await command('leave');state=null;roomSeen='';lastRooms='';showScreen('home');history.replaceState(null,'','/');});
for(const b of $$('.leave-button'))b.onclick=askLeave;
$('#brand').onclick=()=>{closeMenu();if(state)askLeave();else showScreen('home');};for(const id of ['invite-lobby','invite-game'])$('#'+id).onclick=()=>act(invite);$('#help').onclick=help;$('.modal-close').onclick=()=>$('#modal').close();$('#modal').onclick=e=>{if(e.target===$('#modal')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}};
$('#plus').onclick=()=>openStore();$('#tool-style').onclick=styleSheet;$('#modal').addEventListener('close',()=>storeOpen=false);
$('#tel-form').onsubmit=e=>{e.preventDefault();const input=$('#tel-input'),text=input.value.trim();if(!text)return;act(async()=>{await command('tsubmit',{text});input.value='';});};
$('#tel-done').onclick=()=>{endStroke();act(()=>command('tdone'));};
$('#sound').onclick=()=>{soundOn=!soundOn;store.set('ritkaos.sound',soundOn?'yes':'no');updateSound();soundUnlock();};
$('#theme').onclick=()=>{darkOn=!darkOn;applyTheme();};$('#game-overlay').onclick=e=>{const button=e.target.closest('[data-choice]');if(button)act(()=>command('choose',{index:Number(button.dataset.choice)}));};
$('#guess-form').onsubmit=e=>{
 e.preventDefault();const input=$('#guess-input'),text=input.value.trim();if(!text)return;input.value='';act(async()=>{const response=await command('guess',{text});if(response.close){$('#guess-feedback').textContent=T('fbClose');$('#guess-feedback').className='guess-feedback close';sound('click');setTimeout(()=>{if($('#guess-feedback').classList.contains('close')){$('#guess-feedback').className='guess-feedback';$('#guess-feedback').textContent='';}},2500);}return response;});
};
$('#palette').onclick=e=>{const b=e.target.closest('[data-color]');if(b){brushColor=b.dataset.color;setTool('pen');renderPalette();sound('click');}};$('#brush-size').oninput=e=>{brushSize=Number(e.target.value);updateBrushCursor();};$('#tool-pen').onclick=()=>setTool('pen');$('#tool-eraser').onclick=()=>setTool('eraser');$('#undo').onclick=()=>{endStroke();act(()=>command('undo',{epoch:boardEpoch}));};$('#clear').onclick=()=>confirmAction(T('clearTitle'),T('clearText'),T('clearCanvas'),()=>command('clear',{epoch:boardEpoch}));$('#save-drawing').onclick=saveDrawing;for(const b of $$('[data-reaction]'))b.onclick=()=>act(()=>command('react',{emoji:b.dataset.reaction}));
canvas.addEventListener('pointerdown',beginStroke);canvas.addEventListener('pointermove',movePointer);canvas.addEventListener('pointerup',endStroke);canvas.addEventListener('pointercancel',endStroke);canvas.addEventListener('lostpointercapture',endStroke);canvas.addEventListener('pointerleave',()=>$('#brush-cursor').style.display='none');canvas.addEventListener('contextmenu',e=>e.preventDefault());
window.addEventListener('keydown',e=>{if(/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)||$('#modal').open)return;if(screen==='game'&&state.phase==='choosing'&&state.choices.length&&['1','2','3'].includes(e.key)){act(()=>command('choose',{index:Number(e.key)-1}));return;}if(!canDraw())return;if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='z'){e.preventDefault();$('#undo').click();}else if(e.key.toLowerCase()==='b')setTool('pen');else if(e.key.toLowerCase()==='e')setTool('eraser');});
document.addEventListener('pointerdown',soundUnlock,{once:true});document.addEventListener('visibilitychange',()=>{if(document.hidden)endStroke();else if(ready&&state)act(()=>command('sync'));});window.addEventListener('resize',resizeCanvas);new ResizeObserver(resizeCanvas).observe($('#drawing-surface'));
// Keep-alive: a plain "ping" is answered by the host without waking it. The clock re-syncs only while a round runs.
setInterval(()=>{if(!ready)return;if(state&&!['lobby','ended','studio'].includes(state.phase)){const start=Date.now();command('ping').then(d=>serverOffset=d.serverTime-(Date.now()+start)/2).catch(()=>{});}else try{ws.send('ping');}catch{}},12000);
$('#tool-style').innerHTML=icon('sparkle');$('#tool-pen').innerHTML=icon('pen');$('#tool-eraser').innerHTML=icon('eraser');$('#undo').innerHTML=icon('undo');$('#clear').innerHTML=icon('trash');
for(const el of $$('[data-icon]'))el.insertAdjacentHTML('afterbegin',icon(el.dataset.icon));
// Header menu: theme, sound, help and language. Inline on wide screens, a small popover on phones.
const menuToggle=$('#menu-toggle'),headerMenu=$('#header-menu');
function closeMenu(){headerMenu.classList.remove('open');menuToggle.setAttribute('aria-expanded','false');}
menuToggle.onclick=e=>{e.stopPropagation();const open=!headerMenu.classList.contains('open');headerMenu.classList.toggle('open',open);menuToggle.setAttribute('aria-expanded',String(open));};
document.addEventListener('pointerdown',e=>{if(headerMenu.classList.contains('open')&&!e.target.closest('#header-menu,#menu-toggle'))closeMenu();});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&headerMenu.classList.contains('open')){closeMenu();menuToggle.focus();}});
// Phones: size the app to the visible viewport so the keyboard never covers the guess field and the page does not jump.
const phone=matchMedia('(max-width:690px)');
function fitViewport(){const vv=window.visualViewport,root=document.documentElement.style;root.setProperty('--app-h',(vv?vv.height:innerHeight)+'px');root.setProperty('--app-top',(vv?vv.offsetTop:0)+'px');}
window.visualViewport?.addEventListener('resize',fitViewport);window.visualViewport?.addEventListener('scroll',fitViewport);window.addEventListener('resize',fitViewport);fitViewport();
for(const input of [$('#guess-input'),$('#tel-input')]){input.addEventListener('focus',()=>{if(phone.matches){document.body.classList.add('typing');requestAnimationFrame(()=>{fitViewport();window.scrollTo(0,0);});}});input.addEventListener('blur',()=>{document.body.classList.remove('typing');requestAnimationFrame(fitViewport);});}
const inviteCode=new URLSearchParams(location.search).get('room');if(inviteCode)$('#room-code').value=inviteCode.toUpperCase().slice(0,6);
function translatePage(){
 document.documentElement.lang=lang;document.title=T('title');document.querySelector('meta[name="description"]')?.setAttribute('content',T('description'));
 for(const el of $$('[data-i18n]'))el.textContent=T(el.dataset.i18n);
 for(const el of $$('[data-i18n-html]'))el.innerHTML=T(el.dataset.i18nHtml);
 for(const el of $$('[data-i18n-ph]'))el.placeholder=T(el.dataset.i18nPh);
 for(const el of $$('[data-i18n-title]'))el.title=T(el.dataset.i18nTitle);
 for(const el of $$('[data-i18n-aria]'))el.setAttribute('aria-label',T(el.dataset.i18nAria));
 for(const o of $$('#setting-rounds option'))o.textContent=T('roundOption',Number(o.value));
 for(const o of $$('#setting-seconds option'))o.textContent=T('secondsOption',o.value);
 renderPackOptions();
 const highscore=Number(store.get('ritkaos.best','0'));$('#best-score').textContent=highscore?T('best',highscore):'';
 for(const el of $$('#lang [data-lang]'))el.classList.toggle('active',el.dataset.lang===lang);$('#lang').title=T('language');$('#lang').setAttribute('aria-label',T('language'));
 connectionLabel(ready?T('connected'):document.body.classList.contains('offline')?T('reconnecting'):T('connectingShort'));
}
$('#lang').onclick=()=>{
 const previous=lang;lang=lang==='sv'?'en':'sv';store.set('ritkaos.lang',lang);
 if(!store.get('ritkaos.name')&&STR[previous].names.includes($('#nickname').value))$('#nickname').value=T('names')[STR[previous].names.indexOf($('#nickname').value)];
 translatePage();renderPalette();updateSound();applyTheme();lastRooms='';overlayKey='';if(storeOpen)renderStore();
 if(state){if(screen==='lobby')renderLobby();else if(screen==='results')renderResults(false);else if(screen==='game')renderGame();}
 send('lang',{lang});loadRooms();
};
translatePage();renderAvatars();renderPalette();updateSound();applyTheme();fetch('/api/connection').then(r=>r.json()).then(d=>lan=d.lan||[]).catch(()=>{});fetch('/api/store').then(r=>r.json()).then(d=>{shop={ready:!!d.ready,checkout:d.checkout||'',products:Array.isArray(d.products)?d.products:[]};refreshStore();}).catch(()=>{});loadRooms();let roomPolls=0;setInterval(()=>{if(!ready&&++roomPolls%5===0)loadRooms();},3000);connect();requestAnimationFrame(frame);
