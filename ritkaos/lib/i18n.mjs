// Server-side text, keyed by id. Errors use the player's language, room-wide chat uses the room's language.
export const LANGS = ['sv', 'en'];
export const lang = v => LANGS.includes(v) ? v : null;
const MESSAGES = {
 sv: {
  notInRoom:'Du är inte i något rum.', slowDown:'Lite långsammare!', invalid:'Ogiltigt meddelande.', unknown:'Okänt meddelande.', generic:'Något gick fel.', helloFirst:'Anslut först.',
  hostEnd:'Bara värden kan avsluta.', serverFull:'Servern har fullt. Försök igen senare.',
  noRoom:'Rummet finns inte. Kontrollera koden — eller skapa ett nytt rum.', roomFull:'Rummet är fullt ({max} spelare).',
  hostSettings:'Bara värden kan ändra inställningar.', betweenMatches:'Ändra inställningar mellan matcher.',
  hostStart:'Bara värden kan starta.', started:'Matchen har redan börjat.', minPlayers:'Det här läget behöver minst {min} spelare.',
  notYourChoice:'Det är inte din tur att välja.', pickWord:'Välj ett av orden.', writeFirst:'Skriv något först.',
  fromNextTurn:'Du är med från nästa tur.', noSpoilers:'Du ritar — avslöja inte motivet!', alreadyGuessed:'Du har redan gissat rätt.',
  turnSoon:'Snart börjar turen.', notDrawing:'Du ritar inte just nu.', canvasChanged:'Duken har bytts. Försök igen.',
  badPoint:'Ogiltig punkt.', badStroke:'Ogiltigt penseldrag.', strokeExists:'Penseldraget finns redan.', canvasFullSave:'Duken är full. Spara och töm den.',
  notYourStroke:'Du äger inte det penseldraget.', strokeEnded:'Penseldraget är avslutat.', badPoints:'Ogiltiga punkter.', canvasFull:'Duken är full.',
  leadClear:'Bara huvudritaren kan tömma duken.', badReaction:'Ogiltig reaktion.', hostKick:'Bara värden kan ta bort någon.', pickOther:'Välj en annan spelare.',
  publicFixed:'Öppna matcher har fasta inställningar.', publicAuto:'Öppna matcher startar av sig själva.', voteOnlyPublic:'Omröstning finns bara i öppna matcher.',
  removedFromMatch:'Du togs bort från den matchen.',
  defaultName:'Picasso', hostFallback:'Värd',
  opened:'{name} öppnade rummet.', joined:'{name} är här!', joinedLate:'{name} är här — med från nästa tur!', left:'{name} lämnade rummet.',
  votedOut:'{name} röstades ut.', backInLobby:'Tillbaka i lobbyn.', studio:'Fri duk. Alla ritar.',
  matchOver:'Matchen är slut.', drawing1:'{a} ritar nu.', drawing2:'{a} och {b} ritar nu.',
  correct:'{name} gissade rätt! +{points}', paused:'För få anslutna spelare. Starta igen när alla är tillbaka.', pausedPublic:'För få spelare. Vi väntar på fler.',
  timeUp:'Tiden är ute!', allGuessed:'Alla gissade rätt!', artistLost:'Ritaren tappade anslutningen.', customCategory:'Era ord',
  locked:'Det där ingår i Ritkaos+. Värden behöver låsa upp det först.', badCode:'Koden fungerade inte. Kolla stavningen.', codesOff:'Koder går inte att lösa in just nu. Försök igen senare.',
  correctFast:'{name} gissade blixtsnabbt! +{points}', telNotNow:'Inte just nu. Vänta på nästa steg.', telDone:'Du är redan klar med det här steget.',
  telStart:'Telefonleken börjar. Skriv något knäppt att rita!', telOver:'Alla kedjor är visade.', telBlank:'(ingen gissning)'
 },
 en: {
  notInRoom:'You are not in a room.', slowDown:'A bit slower!', invalid:'Invalid message.', unknown:'Unknown message.', generic:'Something went wrong.', helloFirst:'Connect first.',
  hostEnd:'Only the host can end it.', serverFull:'The server is full. Try again later.',
  noRoom:'That room does not exist. Check the code, or create a new room.', roomFull:'The room is full ({max} players).',
  hostSettings:'Only the host can change settings.', betweenMatches:'Change settings between matches.',
  hostStart:'Only the host can start.', started:'The match has already started.', minPlayers:'This mode needs at least {min} players.',
  notYourChoice:'It is not your turn to choose.', pickWord:'Pick one of the words.', writeFirst:'Type something first.',
  fromNextTurn:'You are in from the next turn.', noSpoilers:'You are drawing. Do not give it away!', alreadyGuessed:'You already guessed it.',
  turnSoon:'The turn starts soon.', notDrawing:'You are not drawing right now.', canvasChanged:'The canvas changed. Try again.',
  badPoint:'Invalid point.', badStroke:'Invalid stroke.', strokeExists:'That stroke already exists.', canvasFullSave:'The canvas is full. Save it and clear it.',
  notYourStroke:'That stroke is not yours.', strokeEnded:'That stroke has ended.', badPoints:'Invalid points.', canvasFull:'The canvas is full.',
  leadClear:'Only the lead artist can clear the canvas.', badReaction:'Invalid reaction.', hostKick:'Only the host can remove someone.', pickOther:'Pick another player.',
  publicFixed:'Open matches have fixed settings.', publicAuto:'Open matches start on their own.', voteOnlyPublic:'Voting is only for open matches.',
  removedFromMatch:'You were removed from that match.',
  defaultName:'Picasso', hostFallback:'Host',
  opened:'{name} opened the room.', joined:'{name} is here!', joinedLate:'{name} is here, playing from the next turn!', left:'{name} left the room.',
  votedOut:'{name} was voted out.', backInLobby:'Back in the lobby.', studio:'Free canvas. Everyone draws.',
  matchOver:'Match over.', drawing1:'{a} is drawing now.', drawing2:'{a} and {b} are drawing now.',
  correct:'{name} got it! +{points}', paused:'Too few players connected. Start again when everyone is back.', pausedPublic:'Too few players. Waiting for more.',
  timeUp:'Time is up!', allGuessed:'Everyone got it!', artistLost:'The artist lost connection.', customCategory:'Your words',
  locked:'That is part of Ritkaos+. The host needs to unlock it first.', badCode:'That code did not work. Check the spelling.', codesOff:'Codes cannot be redeemed right now. Try again later.',
  correctFast:'{name} got it lightning fast! +{points}', telNotNow:'Not right now. Wait for the next step.', telDone:'You are already done with this step.',
  telStart:'Telephone starts. Write something weird to draw!', telOver:'Every chain has been shown.', telBlank:'(no guess)'
 }
};
const MODIFIERS = {
 sv: { tiny:['Liten pensel','Enorm talang. Minimal pensel.'], mono:['En enda färg','Konstbudgeten tog slut.'], mirror:['Spegelvärlden','Vänster blev plötsligt höger.'], blind:['Rita i blindo','Konstnären ser inget i åtta sekunder.'], shake:['Koffeinchock','Någon tog en kaffe för mycket.'] },
 en: { tiny:['Tiny brush','Huge talent. Minimal brush.'], mono:['One single colour','The art budget ran out.'], mirror:['Mirror world','Left suddenly became right.'], blind:['Drawing blind','The artist sees nothing for eight seconds.'], shake:['Caffeine shock','Someone had one coffee too many.'] }
};
export function t(l, key, vars = {}) {
 const text = MESSAGES[lang(l) || 'sv'][key] ?? MESSAGES.sv[key] ?? key;
 return text.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
}
export function modifierText(l, id) { const [name = '', description = ''] = MODIFIERS[lang(l) || 'sv'][id] || []; return { name, description }; }
