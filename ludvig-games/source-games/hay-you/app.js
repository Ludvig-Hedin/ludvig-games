import { HORSES, MOODS, evaluateFlirt } from './content.js';
import { HorseAudio } from './audio.js';
import { startDateGame } from './runner.js';
import { portraitMarkup } from './portraits.js';

const $ = (id) => document.getElementById(id);
const icons = {
  heart:'<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
  x:'<path d="m6 6 12 12M18 6 6 18"/>',
  arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',
  left:'<path d="M20 12H4m6-6-6 6 6 6"/>',
  up:'<path d="M12 20V4m-6 6 6-6 6 6"/>',
  check:'<path d="m5 12 4 4L19 6"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
  help:'<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 4.1 1.9c-1.2.7-1.6 1.1-1.6 2.6M12 17h.01"/>',
  sun:'<path d="M3 17h18M7 14a5 5 0 1 1 10 0M12 2v2M4.9 5l1.4 1.5M19.1 5l-1.4 1.5M2 11h2m16 0h2M7 21h10"/>',
  sound:'<path d="m11 5-6 4H2v6h3l6 4V5Zm4 3a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  muted:'<path d="m11 5-6 4H2v6h3l6 4V5Zm5 4 6 6m0-6-6 6"/>',
  spark:'<path d="m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5L12 2Z"/>',
  carrot:'<path d="M15.5 7.5c3-3 1-5 0-5m1 5c2.5-3.5 5-3 5-3m-5 4c3-1 5 1 4 2M4.4 20.5C3 21 3 20 3.5 18.5L9 8c2.5-3.5 9 2 7 5L4.4 20.5Z"/><path d="m8 11 2 1.5m-4 2 2 1.5"/>',
  refresh:'<path d="M20 7v5h-5M4 17v-5h5M6.1 6.1A8 8 0 0 1 19.6 11M4.4 13a8 8 0 0 0 13.5 4.9"/>',
  pause:'<path d="M8 5v14M16 5v14" stroke-width="3"/>',
  play:'<path d="m8 4 12 8-12 8V4Z"/>',
  trophy:'<path d="M8 3h8v6a4 4 0 0 1-8 0V3Zm0 2H4v3a4 4 0 0 0 4 4m8-7h4v3a4 4 0 0 1-4 4m-4 1v6m-4 2h8m-9 0h10"/>',
  bolt:'<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z"/>',
  flower:'<circle cx="12" cy="12" r="2.2"/><path d="M12 9.8C10 6 10.8 3 12 3s2 3 0 6.8Zm0 4.4c2 3.8 1.2 6.8 0 6.8s-2-3 0-6.8ZM9.8 12C6 14 3 13.2 3 12s3-2 6.8 0Zm4.4 0c3.8-2 6.8-1.2 6.8 0s-3 2-6.8 0Z"/>',
  sparkles:'<path d="m10 3 1.8 5.2L17 10l-5.2 1.8L10 17l-1.8-5.2L3 10l5.2-1.8L10 3Zm8 10 .9 2.1L21 16l-2.1.9L18 19l-.9-2.1L15 16l2.1-.9L18 13Z"/>',
  horse:'<path fill="currentColor" stroke="none" d="M4 23V13L9 3l3 3 5-2 3 10-4 3-5-3-2 9H4Zm6-17-3-4-3 7-2 5 3-2 5-6Z"/><circle cx="15" cy="9" r=".9" fill="#f8f5ed" stroke="none"/>',
};
const svg=(name)=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]||icons.spark}</svg>`;
const icon=(name,cls='')=>`<span data-icon="${name}"${cls?` class="${cls}"`:''}>${svg(name)}</span>`;
function paintIcons(root=document){root.querySelectorAll('[data-icon]').forEach(el=>el.innerHTML=svg(el.dataset.icon));}
const escape=(v)=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const STORE='horsetinder-v1';
const audio=new HorseAudio();
let uiMode='discover', animating=false, modalKind='', activeMatch=null, runner=null, paused=false, drag=null;
let toastTimer=0, previousFocus=null, lastResult=null, ignoreCardClickUntil=0, swipeTimer=0;
let persistent,nextShown='',lastPointer='';
document.addEventListener('pointerdown',e=>{lastPointer=e.pointerType;},true);
try{persistent=JSON.parse(localStorage.getItem(STORE)||'null');}catch{persistent=null;}
if(!persistent||persistent.version!==1)persistent={version:1,collection:{},best:0,evenings:0,mood:'wild',run:null};
persistent.collection=persistent.collection&&typeof persistent.collection==='object'?persistent.collection:{};
if(!MOODS.some(m=>m.id===persistent.mood))persistent.mood='wild';
const validRun=(r)=>r&&Array.isArray(r.deck)&&r.deck.length===8&&r.deck.every(id=>HORSES.some(h=>h.id===id))&&Number.isInteger(r.index)&&r.index>=0&&r.index<=8&&Array.isArray(r.results);
if(!validRun(persistent.run))persistent.run=newRun(true);
let run=persistent.run;
function newRun(first=false){
  const pool=[...HORSES];
  for(let i=pool.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]];}
  if(first){const firstHorse=pool.splice(pool.findIndex(h=>h.id==='sir-neighs'),1)[0];pool.unshift(firstHorse);}
  return {deck:pool.slice(0,8).map(h=>h.id),index:0,carrots:2,likes:0,results:[],score:0,finished:false,pending:null,mood:persistent?.mood||'wild'};
}
function save(){persistent.run=run;try{localStorage.setItem(STORE,JSON.stringify(persistent));}catch{/* Private browser sessions can still play. */}}
function getHorse(id){return HORSES.find(h=>h.id===id);}
function currentHorse(){return getHorse(run.deck[run.index]);}
function goodDates(){return run.results.filter(r=>r.chemistry>=70).length;}
function startAudio(){audio.unlock().then(()=>audio.startMusic()).catch(()=>{});}
function sound(event){startAudio();audio.play(event);}
function updateSound(){document.querySelectorAll('[data-action="sound"]').forEach(button=>{button.innerHTML=icon(audio.muted?'muted':'sound');button.setAttribute('aria-pressed',String(!audio.muted));button.setAttribute('aria-label',audio.muted?'Turn sound on':'Mute sound');});}
function toast(message){clearTimeout(toastTimer);$('toast').textContent=message;$('toast').classList.add('visible');toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),3000);}
function renderMood(){
  $('vibeOptions').innerHTML=MOODS.map(m=>`<button class="vibe-option ${m.id===run.mood?'active':''}" data-action="mood" data-mood="${m.id}" aria-pressed="${m.id===run.mood}" ${run.index>0?'disabled':''}>${icon(m.icon,'vibe-icon')}${m.name}</button>`).join('');
}
function renderStats(){
  const good=goodDates();
  $('goalHearts').innerHTML=[0,1,2].map(i=>icon('heart',i<good?'earned':'')).join('');
  $('goalHearts').setAttribute('aria-label',`${good} of 3 great dates`);
  $('goalStatus').textContent=`${good} of 3 great dates`;
  $('eveningScore').textContent=`Score ${run.score.toLocaleString()}`;
  $('stableCount').textContent=Object.values(persistent.collection).filter(r=>r.chemistry>=70).length;
  $('carrotCount').textContent=run.carrots;
  document.querySelector('[data-action="carrot"]').disabled=run.carrots<=0||run.finished;
}
function renderCard(){
  const horse=currentHorse();const ended=run.finished||!horse;
  $('horseCard').hidden=ended;$('deckMessage').hidden=!ended;
  document.querySelectorAll('.swipe-button').forEach(el=>el.disabled=ended||(el.dataset.action==='carrot'&&run.carrots<=0));
  $('deckCounter').textContent=`Horse ${Math.min(run.index+1,run.deck.length)} of ${run.deck.length}`;
  const wasNext=nextShown;
  renderNextCard(ended?null:getHorse(run.deck[run.index+1]));
  if(ended){
    $('deckMessage').innerHTML=`${icon('sun')}<h2>Evening over</h2><button class="primary-button" data-action="summary">See results ${icon('arrow')}</button>`;return;
  }
  const card=$('horseCard'),promoted=card.dataset.horse!==horse.id&&wasNext===horse.id;
  card.style.transition='none';card.style.transform='';card.style.opacity='1';card.classList.remove('entering');card.dataset.horse=horse.id;
  // After a swipe the next card is already in place underneath, so the new top card appears without a fade.
  requestAnimationFrame(()=>{if(!promoted)card.classList.add('entering');card.style.transition='';});
  $('horseArt').innerHTML=portraitMarkup(horse);
  $('horseName').innerHTML=`${escape(horse.name)} <small>${horse.age}</small>`;
  $('horseMeta').textContent=`${horse.breed} · ${horse.distance}`;
  $('horseBio').textContent=horse.bio;
  $('horseTags').innerHTML=horse.tags.map(t=>`<span>${escape(t)}</span>`).join('');
  $('stampYes').style.opacity='0';$('stampNo').style.opacity='0';
  card.setAttribute('aria-label',`${horse.name}, ${horse.age}. ${horse.bio} Swipe right to like, left to pass.`);
}
function renderNextCard(horse){
  const next=$('nextCard');next.hidden=!horse;next.style.transition='none';next.style.transform='';
  if(!horse){nextShown='';next.innerHTML='';return;}
  if(nextShown!==horse.id){
    next.innerHTML=`<div class="horse-art">${portraitMarkup(horse)}</div><div class="card-shade"></div><div class="profile-content"><div class="profile-title"><h2>${escape(horse.name)} <small>${horse.age}</small></h2></div><p class="profile-meta">${escape(horse.breed)} · ${escape(horse.distance)}</p><p class="profile-bio">${escape(horse.bio)}</p><div class="profile-tags">${horse.tags.map(t=>`<span>${escape(t)}</span>`).join('')}</div></div>`;
    nextShown=horse.id;next.classList.remove('revealing');void next.offsetWidth;next.classList.add('revealing');
  }
  requestAnimationFrame(()=>{next.style.transition='';});
}
// 0 = resting under the top card, 1 = fully in place (used while dragging and during the fly-out).
function liftNextCard(amount){const next=$('nextCard');if(next.hidden)return;const t=Math.max(0,Math.min(1,amount));next.style.transform=`translateY(calc(var(--rest-y) * ${1-t})) scale(calc(var(--rest-s) + (1 - var(--rest-s)) * ${t}))`;}
function render(){renderStats();renderMood();renderCard();}
function isolateOverlay(){
  const isDate=!$('dateLayer').hidden,isModal=!$('modalLayer').hidden;
  document.querySelectorAll('.topbar,#discoverView,#stableView,.page-footer').forEach(el=>el.inert=isDate||isModal);
  $('modalLayer').inert=isDate;
  const intro=!$('dateIntro').hidden;
  $('pauseButton').inert=paused||intro;
  document.querySelector('.date-bottom').inert=paused||intro;
  document.body.classList.toggle('body-locked',isDate||isModal);
}
function showView(view){
  if(runner)return;
  uiMode=view;$('discoverView').hidden=view!=='discover';$('stableView').hidden=view!=='stable';
  document.querySelectorAll('.nav-link').forEach(el=>el.classList.toggle('active',el.dataset.action===view));
  if(view==='stable')renderStable();
}
function renderStable(){
  const results=Object.values(persistent.collection).sort((a,b)=>b.chemistry-a.chemistry);
  if(!results.length){$('stableGrid').innerHTML=`<div class="empty-stable">${icon('horse')}<h2>No dates yet</h2><p>Finish a date and it shows up here.</p><button class="primary-button" data-action="discover">Meet the horses ${icon('arrow')}</button></div>`;return;}
  $('stableGrid').innerHTML=results.map(r=>{const h=getHorse(r.id);if(!h)return '';return `<button class="stable-tile" data-action="memory" data-id="${h.id}" aria-label="View date with ${escape(h.name)}, ${r.chemistry} percent chemistry"><div class="stable-picture">${portraitMarkup(h)}<span class="stable-chem">${icon('heart')}${r.chemistry}%</span></div><h3>${escape(h.name)}</h3><p>${r.chemistry>=70?'Great date':'Under 70%'}</p></button>`;}).join('');
}
function setModal(html,kind='info',closable=true){
  previousFocus=document.activeElement;modalKind=kind;
  $('modal').innerHTML=(closable?`<button class="icon-button modal-close" data-action="close" aria-label="Close">${icon('x')}</button>`:'')+html;
  const heading=$('modal').querySelector('h2');if(heading)heading.id='modalTitle';
  $('modalLayer').hidden=false;document.body.classList.add('body-locked');
  isolateOverlay();
  // Touch users get no focus ring on the first choice; keyboard and mouse users keep focus on the first action.
  requestAnimationFrame(()=>{const focus=lastPointer==='touch'?$('modal'):$('modal').querySelector('button:not(.modal-close)')||$('modal').querySelector('button');focus?.focus({preventScroll:true});});
}
function closeModal(){
  $('modalLayer').hidden=true;modalKind='';if(!runner&&$('dateLayer').hidden)document.body.classList.remove('body-locked');
  isolateOverlay();
  if(previousFocus?.isConnected)previousFocus.focus({preventScroll:true});
}
// Every dialog can be closed. Closing a match skips that date; closing a date result moves on to the next horse.
function closeDialog(){
  if(modalKind==='match'){dismissMatch();return;}
  if(modalKind==='result'){nextHorse();return;}
  closeModal();
}
function dismissMatch(){
  closeModal();activeMatch=null;lastResult=null;run.pending=null;save();showView('discover');render();
  if(!checkEnd())$('horseCard').focus({preventScroll:true});
}
function showHelp(){setModal(`<div class="modal-inner"><h2>How to play</h2><div class="help-grid"><div>${icon('heart')}<p><strong>Swipe</strong>Find 3 great dates among 8 horses. Like a horse to try for a match. A carrot makes it a sure match and adds chemistry.</p></div><div>${icon('spark')}<p><strong>Reply</strong>Pick the reply that suits their bio. Horses with your mood always match, so choose it before your first swipe.</p></div><div>${icon('horse')}<p><strong>Date</strong>Steer between three lanes, catch hearts and jump logs. 70% chemistry or more is a great date.</p></div></div><p class="help-keyboard"><kbd>←</kbd> pass · <kbd>→</kbd> like · <kbd>↑</kbd> carrot<br>On a date: <kbd>A</kbd><kbd>D</kbd> steer · <kbd>SPACE</kbd> jump · <kbd>ESC</kbd> pause</p><button class="primary-button" data-action="close">Got it</button></div>`,'help');}
function showProfile(){const h=currentHorse();if(!h||run.finished)return;setModal(`<div class="match-layout"><div class="match-visual"><div class="portrait-bg">${portraitMarkup(h)}</div><div class="match-visual-label"><strong>${escape(h.name)}</strong><small>${escape(h.breed)} · ${h.age}</small></div></div><div class="match-body"><h2>${escape(h.name)}</h2><p class="horse-question">${escape(h.bio)}</p><p>${escape(h.tags.join(' · '))}</p><div class="button-row"><button class="secondary-button" data-action="profile-pass">${icon('x')} Pass</button><button class="primary-button" data-action="profile-like">Like ${icon('heart')}</button></div></div></div>`,'profile');}
function swipe(type){
  if(animating||uiMode!=='discover'||modalKind||runner||run.finished)return;
  const h=currentHorse();if(!h)return;
  if(type==='carrot'&&run.carrots<=0){toast('No carrots left.');return;}
  startAudio();animating=true;drag=null;
  const yes=type!=='pass';sound(yes?'like':'nope');
  const card=$('horseCard');card.classList.remove('entering');card.style.transition='transform .37s cubic-bezier(.2,.7,.3,1),opacity .32s';
  card.style.transform=`translate(${yes?650:-650}px, -25px) rotate(${yes?24:-24}deg)`;card.style.opacity='0';
  const next=$('nextCard');next.style.transition='transform .34s cubic-bezier(.2,.7,.3,1)';liftNextCard(1);
  $(yes?'stampYes':'stampNo').style.opacity='1';
  const boosted=type==='carrot';if(boosted)run.carrots--;
  const affinity=run.mood===h.vibe;
  const matched=yes&&(boosted||run.likes===0||affinity||Math.random()<.75);
  if(yes)run.likes++;
  run.index++;
  if(matched)run.pending={id:h.id,boosted,stage:'flirt',flirt:null};
  save();
  const swipedRun=run;
  clearTimeout(swipeTimer);
  swipeTimer=setTimeout(()=>{
    if(swipedRun!==run)return;
    animating=false;render();
    if(matched){activeMatch=run.pending;showMatch();}
    else if(yes){toast(`No match with ${h.name}.`);checkEnd();}
    else checkEnd();
  },360);
}
function showMatch(){
  const h=getHorse(activeMatch.id);sound('match');
  setModal(`<div class="match-layout"><div class="match-visual"><div class="portrait-bg">${portraitMarkup(h)}</div><div class="match-visual-label"><strong>${escape(h.name)}</strong><small>${escape(h.breed)} · ${h.age}</small></div></div><div class="match-body"><h2>It's a <em>match.</em></h2><p class="horse-question">“${escape(h.opening)}”</p><div class="flirt-choices">${h.choices.map((choice,i)=>`<button class="flirt-choice" data-action="flirt" data-choice="${i}"><span class="choice-letter">${String.fromCharCode(65+i)}</span><span>${escape(choice.text)}</span></button>`).join('')}</div><p class="flirt-footnote">Pick a reply. The right one adds chemistry.</p></div></div>`,'match',true);
}
function chooseFlirt(index){
  if(modalKind!=='match'||!activeMatch||activeMatch.flirt)return;
  const h=getHorse(activeMatch.id);const result=evaluateFlirt(h,index,run.mood);
  activeMatch.flirt={...result,choice:index};activeMatch.stage='intro';run.pending=activeMatch;save();
  sound(result.good?'heart':'click');
  const body=$('modal').querySelector('.match-body');
  body.innerHTML=`<h2 id="modalTitle" class="sr-only">${escape(h.name)} replies</h2><div class="eyebrow">${escape(h.name.toUpperCase())} SAYS</div><div class="flirt-reply"><blockquote>“${escape(result.response)}”</blockquote><div class="chemistry-label">${icon('heart')}${result.good?'Great reply. Big chemistry boost.':result.chemistry>=20?'Good reply. Some chemistry.':'Weak reply. Little chemistry.'}</div><button class="primary-button" data-action="date-intro">Go on the date ${icon('arrow')}</button></div>`;
  body.querySelector('button').focus({preventScroll:true});
}
function dateIntro(){
  if(!activeMatch)return;closeModal();
  uiMode='date';$('dateLayer').hidden=false;document.body.classList.add('body-locked');
  $('dateIntro').hidden=false;$('pausePanel').hidden=true;$('dateProgress').style.width='0';$('dateFeedback').textContent='';$('dateHearts').textContent='0';$('dateCombo').textContent='';
  $('dateTime').textContent='0:30';$('dateChemistry').textContent='—';$('dateChemistry').dataset.ready='false';$('dateCountdown').hidden=true;
  $('dateWith').textContent=`You & ${getHorse(activeMatch.id).name}`;
  $('dateCanvasWrap').style.backgroundImage="url('./assets/meadow.webp')";$('dateCanvasWrap').style.backgroundSize='cover';$('dateCanvasWrap').style.backgroundPosition='center';
  $('dateCanvas').style.opacity='0';$('pauseButton').disabled=true;$('pauseButton').setAttribute('aria-label','Pause date');
  isolateOverlay();
  $('dateIntro').querySelector('button').focus();
}
function launchDate(){
  if(runner||!activeMatch)return;
  sound('click');$('dateIntro').hidden=true;$('dateCanvas').style.opacity='1';$('pauseButton').disabled=false;paused=false;
  $('pauseButton').innerHTML=icon('pause');
  isolateOverlay();$('dateCanvas').focus({preventScroll:true});
  activeMatch.stage='playing';run.pending=activeMatch;save();
  try{
    let shownHearts=0,shownHits=0;
    runner=startDateGame({canvas:$('dateCanvas'),horse:getHorse(activeMatch.id),onSound:(e)=>audio.play(e),onUpdate:(s)=>{
      if(s.hearts>shownHearts)retrigger(document.querySelector('.date-live-score'),'pop');
      if(s.hits>shownHits)retrigger($('dateCanvasWrap'),'bumped');
      shownHearts=s.hearts;shownHits=s.hits;
      $('dateProgress').style.width=`${s.progress*100}%`;$('dateHearts').textContent=s.hearts;$('dateCombo').textContent=s.combo>1?`×${s.combo}`:'';
      if($('dateFeedback').textContent!==(s.message||''))$('dateFeedback').textContent=s.message||'';
      $('dateTime').textContent=`0:${String(Math.max(0,Math.ceil(s.remaining??30))).padStart(2,'0')}`;
      const chemistry=dateChemistry(s.chemistry??20);
      $('dateChemistry').textContent=`${chemistry}%`;$('dateChemistry').dataset.ready=String(chemistry>=70);
      $('dateCountdown').hidden=s.phase!=='countdown';
      $('dateCountdown').textContent=s.phase==='countdown'?String(Math.max(1,Math.ceil(s.countdown))):'';
      $('dateHint').textContent=s.nearObstacle&&!s.airborne?'Log ahead · jump or change lanes':s.phase==='countdown'?'You control the horse with the coral saddle.':'Follow the hearts · reach 70% chemistry';
      if(s.phase==='paused'&&!paused)pauseDate(s.pauseReason==='performance'?'Paused because the game slowed down.':'');
    },onComplete:finishDate});
  }catch(error){console.error(error);runner=null;uiMode='date';$('dateIntro').hidden=false;$('dateCountdown').hidden=true;$('dateCanvas').style.opacity='0';$('pauseButton').disabled=true;isolateOverlay();$('dateIntro').querySelector('button').focus();toast('3D graphics could not start. Try a browser with hardware acceleration enabled.');}
}
function retrigger(el,cls){if(!el)return;el.classList.remove(cls);void el.offsetWidth;el.classList.add(cls);}
function pauseDate(reason=''){if(!runner||paused)return;paused=true;runner.pause();$('pausePanel').hidden=false;$('pausePanel').querySelector('.pause-reason').textContent=reason;$('pauseButton').innerHTML=icon('play');$('pauseButton').setAttribute('aria-label','Resume date');isolateOverlay();$('pausePanel').querySelector('button').focus();}
function resumeDate(){if(!runner||!paused)return;runner.resume();paused=false;$('pausePanel').hidden=true;$('pauseButton').innerHTML=icon('pause');$('pauseButton').setAttribute('aria-label','Pause date');isolateOverlay();$('dateCanvas').focus({preventScroll:true});}
function dateChemistry(runnerChemistry){const base=38+(activeMatch?.flirt?.chemistry||0)+(activeMatch?.boosted?12:0);return Math.max(5,Math.min(99,Math.round(base*.4+runnerChemistry*.6)));}
function finishDate(result){
  if(!activeMatch)return;
  if(runner){runner.stop();runner=null;}
  const h=getHorse(activeMatch.id);
  const chemistry=dateChemistry(result.chemistry);
  const points=result.score+Math.round(chemistry*2)+(chemistry>=70?250:0);
  const record={id:h.id,chemistry,score:points,hearts:result.hearts,hits:result.hits,combo:result.combo,date:Date.now(),flirt:activeMatch.flirt?.choice??0};
  const old=run.results.findIndex(r=>r.id===h.id);
  if(old>=0){run.score-=run.results[old].score;run.results[old]=record;}else run.results.push(record);
  run.score+=record.score;
  const personalBest=persistent.collection[h.id];
  if(!personalBest||personalBest.chemistry<chemistry||(personalBest.chemistry===chemistry&&personalBest.score<points))persistent.collection[h.id]=record;
  run.pending=null;save();lastResult=record;
  $('dateLayer').hidden=true;$('pausePanel').hidden=true;uiMode='discover';paused=false;
  renderStats();showResult(record,false);
  if(chemistry>=70){sound('win');confetti();}else sound('loss');
}
function showResult(record,memory=false){
  const h=getHorse(record.id),good=record.chemistry>=70;
  setModal(`<div class="modal-inner"><div class="result-avatar">${portraitMarkup(h)}<span class="result-heart">${icon(good?'heart':'spark')}</span></div><h2 class="results-title">${good?'Great date':'Not quite'}</h2><div class="result-score">${record.chemistry}<small>% chemistry</small></div><div class="chemistry-track"><span style="width:${record.chemistry}%"></span></div><p class="result-caption">${escape(good?h.successLine:h.failLine)}</p><div class="result-stats"><div><strong>${record.hearts}</strong><span>Hearts</span></div><div><strong>${record.hits}</strong><span>Logs hit</span></div><div><strong>${record.score.toLocaleString()}</strong><span>Points</span></div></div><div class="button-row">${memory?`<button class="primary-button" data-action="close">Close</button>`:`${!good?`<button class="secondary-button" data-action="retry-date">${icon('refresh')} Try again</button>`:''}<button class="primary-button" data-action="next">${goodDates()>=3||run.index>=8?'See results':'Next horse'} ${icon('arrow')}</button>`}</div></div>`,memory?'memory':'result',true);
}
function nextHorse(){closeModal();activeMatch=null;lastResult=null;run.pending=null;save();showView('discover');render();if(!checkEnd())$('horseCard').focus({preventScroll:true});}
function retryDate(){
  if(!lastResult)return;const h=getHorse(lastResult.id);
  activeMatch=activeMatch||{id:h.id,boosted:false,flirt:evaluateFlirt(h,lastResult.flirt,run.mood)};
  activeMatch.stage='intro';run.pending=activeMatch;save();dateIntro();
}
function checkEnd(){if(goodDates()>=3||run.index>=8){finishEvening();return true;}return false;}
function finishEvening(){
  if(!run.finished){run.finished=true;persistent.evenings=(persistent.evenings||0)+1;persistent.best=Math.max(persistent.best||0,run.score);save();}
  render();showSummary();
}
function showSummary(){
  const good=goodDates(),won=good>=3;const best=run.results.length?Math.max(...run.results.map(r=>r.chemistry)):0;
  setModal(`<div class="modal-inner"><div class="ending-hearts">${[0,1,2].map(i=>icon('heart',i<good?'earned':'')).join('')}</div><h2>${won?'You won the evening':`${good} of 3 great dates`}</h2><div class="ending-score">${run.score.toLocaleString()} <small>points</small></div><p class="best-score">Personal best ${Math.max(persistent.best||0,run.score).toLocaleString()} · Best chemistry ${best}%</p><div class="button-row"><button class="primary-button" data-action="new-run">Play again ${icon('refresh')}</button><button class="secondary-button" data-action="summary-stable">Your dates ${icon('heart')}</button></div></div>`,'summary',true);
  if(won)confetti();
}
function restartPrompt(){if(run.index===0&&!run.results.length){startNewRun();return;}setModal(`<div class="modal-inner"><h2>Start over?</h2><p>This evening ends. Your dates and best score are kept.</p><div class="button-row"><button class="secondary-button" data-action="close">Cancel</button><button class="primary-button" data-action="new-run">Start over ${icon('arrow')}</button></div></div>`,'restart');}
function startNewRun(){
  clearTimeout(swipeTimer);if(runner){runner.stop();runner=null;}persistent.best=Math.max(persistent.best||0,run.score);run=newRun();activeMatch=null;lastResult=null;animating=false;save();closeModal();$('dateLayer').hidden=true;isolateOverlay();showView('discover');render();sound('swipe');
}
function confetti(){if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;for(let i=0;i<38;i++){const bit=document.createElement('i');bit.className='confetti-bit';bit.style.cssText=`left:${Math.random()*100}%;background:${['#e99b8b','#b8c9a0','#e6c58e','#dcafbb'][i%4]};animation-delay:${Math.random()*.6}s;--drift:${(Math.random()-.5)*300}px;--spin:${Math.random()*720-360}deg;`;document.body.appendChild(bit);setTimeout(()=>bit.remove(),3500);}}

function handleDateControl(action){
  if(!runner||paused||!$('dateIntro').hidden)return;
  if(action==='jump')runner.jump();
  else runner.move(action==='move-left'?-1:1);
  $('dateCanvas').focus({preventScroll:true});
}
// Act on contact, not release; the following click is ignored so a tap changes exactly one lane.
document.addEventListener('pointerdown',e=>{
  const button=e.target.closest('[data-action="jump"],[data-action="move-left"],[data-action="move-right"]');
  if(!button||button.disabled||e.button!==0)return;
  e.preventDefault();handleDateControl(button.dataset.action);
});
document.addEventListener('click',e=>{
  const target=e.target.closest('[data-action]');if(!target||target.disabled)return;
  const action=target.dataset.action;
  if(action!=='sound')startAudio();
  switch(action){
    case 'discover':closeModal();showView('discover');break;
    case 'stable':showView('stable');sound('click');break;
    case 'help':showHelp();sound('click');break;
    case 'sound':audio.toggle();startAudio();updateSound();break;
    case 'close':closeDialog();break;
    case 'pass':case 'like':case 'carrot':swipe(action);break;
    case 'profile':if(performance.now()>ignoreCardClickUntil)showProfile();break;
    case 'profile-pass':closeModal();swipe('pass');break;
    case 'profile-like':closeModal();swipe('like');break;
    case 'mood':if(run.index===0){run.mood=target.dataset.mood;persistent.mood=run.mood;save();renderMood();sound('click');}break;
    case 'flirt':chooseFlirt(Number(target.dataset.choice));break;
    case 'date-intro':dateIntro();break;
    case 'start-date':launchDate();break;
    case 'pause':paused?resumeDate():pauseDate();break;
    case 'resume':resumeDate();break;
    case 'abandon-date':finishDate({score:0,hearts:0,hits:0,combo:0,chemistry:5});break;
    case 'jump':case 'move-left':case 'move-right':if(e.detail===0)handleDateControl(action);break;
    case 'next':nextHorse();break;
    case 'retry-date':retryDate();break;
    case 'summary':showSummary();break;
    case 'restart':restartPrompt();break;
    case 'new-run':startNewRun();break;
    case 'summary-stable':closeModal();showView('stable');break;
    case 'memory':showResult(persistent.collection[target.dataset.id],true);break;
  }
});
document.querySelector('.brand').addEventListener('click',e=>{e.preventDefault();if(!runner&&!modalKind)showView('discover');});
document.querySelector('.modal-backdrop').addEventListener('click',()=>{if(modalKind)closeDialog();});
document.addEventListener('keydown',e=>{
  if(e.key==='Tab'&&!$('dateLayer').hidden){
    const scope=paused?$('pausePanel'):!$('dateIntro').hidden?$('dateIntro'):$('dateLayer');
    const buttons=[...scope.querySelectorAll('button:not([disabled])')].filter(el=>el.getClientRects().length&&!el.closest('[inert]'));
    if(!buttons.length){e.preventDefault();return;}
    const first=buttons[0],last=buttons.at(-1);
    if(!scope.contains(document.activeElement)){e.preventDefault();first.focus();}
    else if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
    else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}return;
  }
  if(e.key==='Tab'&&!$('modalLayer').hidden){
    const buttons=[...$('modal').querySelectorAll('button:not([disabled]),a[href]')];if(!buttons.length)return;
    if(e.shiftKey&&document.activeElement===buttons[0]){e.preventDefault();buttons.at(-1).focus();}else if(!e.shiftKey&&document.activeElement===buttons.at(-1)){e.preventDefault();buttons[0].focus();}return;
  }
  if(e.key==='Escape'){
    if(runner){e.preventDefault();paused?resumeDate():pauseDate();}
    else if(modalKind){e.preventDefault();closeDialog();}
    return;
  }
  if(modalKind==='match'&&['1','2','3'].includes(e.key)){chooseFlirt(Number(e.key)-1);return;}
  if(uiMode!=='discover'||modalKind||animating||runner||e.altKey||e.metaKey||e.ctrlKey)return;
  if(e.target.closest?.('input,textarea,select,[contenteditable="true"]'))return;
  if(e.key==='ArrowLeft'){e.preventDefault();swipe('pass');}
  else if(e.key==='ArrowRight'){e.preventDefault();swipe('like');}
  else if(e.key==='ArrowUp'){e.preventDefault();swipe('carrot');}
});
const card=$('horseCard');
card.addEventListener('pointerdown',e=>{
  if(e.target.closest('button')||animating||modalKind||run.finished||e.button!==0)return;
  drag={x:e.clientX,y:e.clientY,id:e.pointerId,moved:false};card.classList.remove('entering');card.style.transition='none';$('nextCard').style.transition='none';card.setPointerCapture(e.pointerId);
});
card.addEventListener('pointermove',e=>{
  if(!drag||drag.id!==e.pointerId)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;
  if(Math.abs(dx)>8)drag.moved=true;
  if(drag.moved){card.style.transform=`translate(${dx}px,${dy*.16}px) rotate(${dx*.055}deg)`;liftNextCard(Math.abs(dx)/140);$('stampYes').style.opacity=String(Math.max(0,Math.min(1,dx/100)));$('stampNo').style.opacity=String(Math.max(0,Math.min(1,-dx/100)));}
});
function endDrag(e,cancel=false){if(!drag||drag.id!==e.pointerId)return;const dx=e.clientX-drag.x,moved=drag.moved;drag=null;try{card.releasePointerCapture(e.pointerId);}catch{}
  if(moved)ignoreCardClickUntil=performance.now()+400;
  if(!cancel&&Math.abs(dx)>85){swipe(dx>0?'like':'pass');return;}
  card.style.transition='transform .25s cubic-bezier(.2,.7,.2,1)';card.style.transform='';$('nextCard').style.transition='transform .25s cubic-bezier(.2,.7,.2,1)';$('nextCard').style.transform='';$('stampYes').style.opacity='0';$('stampNo').style.opacity='0';
}
card.addEventListener('pointerup',e=>endDrag(e));card.addEventListener('pointercancel',e=>endDrag(e,true));
window.addEventListener('pagehide',e=>{save();if(e.persisted)pauseDate();else runner?.stop();audio.stopMusic();});
window.addEventListener('pageshow',e=>{if(e.persisted){isolateOverlay();if(runner)pauseDate();}});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&runner&&!paused)pauseDate();});
paintIcons();updateSound();render();
const horseSheet=new Image();horseSheet.src='./assets/horses.webp';
if(run.pending&&getHorse(run.pending.id)){
  activeMatch=run.pending;
  if(activeMatch.flirt)dateIntro();else showMatch();
}
else if(!run.finished&&(run.index>=8||goodDates()>=3))finishEvening();
if(location.hash==='#stable'&&!activeMatch)showView('stable');
