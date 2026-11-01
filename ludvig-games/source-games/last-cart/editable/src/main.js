import {Simulation,ARENAS,COLORS} from './simulation.js';
import {GameView} from './scene.js';
import {AudioEngine} from './audio.js';

const $=id=>document.getElementById(id);
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const STORE='last-cart-v1';
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
let stored={};try{stored=JSON.parse(localStorage.getItem(STORE)||'{}')||{};}catch{}
const career={xp:Math.max(0,Number(stored.xp)||0),wins:Math.max(0,Number(stored.wins)||0),matches:Math.max(0,Number(stored.matches)||0),daily:stored.daily&&typeof stored.daily==='object'?stored.daily:{}};
const settings={music:clamp(Number(stored.settings?.music??.25),0,1),sfx:clamp(Number(stored.settings?.sfx??.65),0,1),quality:['high','medium','low'].includes(stored.settings?.quality)?stored.settings.quality:(matchMedia('(pointer:coarse)').matches?'medium':'high'),shake:stored.settings?.shake??!reducedMotion,muted:Boolean(stored.settings?.muted)};
const choices={mode:'solo',arena:0,difficulty:'normal',color:clamp(Number(stored.color)||0,0,7)};
const unlocks=[0,0,0,0,0,250,750,1500];
const colorNames=['Korall','Isblå','Solgul','Lavendel','Salvia','Bubbelgum','Pärlvit','Krom'];
if(career.xp<unlocks[choices.color])choices.color=0;
const audio=new AudioEngine();audio.setVolumes(settings);audio.setMuted(settings.muted);
let view,sim,stage='loading',paused=false,modal=null,resumeAfterModal=false,lastFocus=null;
let accumulator=0,elapsed=0,lastTime=0,round=0,endDelay=0,demoEnd=0,slowMotion=0,toastTimer=0,hudTimer=0,goTimer=0;
let result=null,humanTimes={},localWins=[0,0],frameCount=0,frameTime=0,autoBalanced=false;
const keys=new Set();
const touch={x:0,z:0,boost:false,drift:false};
const coarse=()=>matchMedia('(pointer:coarse)').matches;
const dateKey=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Stockholm',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const hash=s=>{let h=2166136261;for(const c of s)h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0;};
const fmt=t=>`${Math.floor(Math.max(0,t)/60)}:${String(Math.floor(Math.max(0,t)%60)).padStart(2,'0')}`;
function save(){try{localStorage.setItem(STORE,JSON.stringify({...career,settings,color:choices.color}));}catch{}}
function toast(text,seconds=3){$('toast').textContent=text;toastTimer=seconds;}
function setText(id,text){const el=$(id);if(el.textContent!==String(text))el.textContent=text;}
function resetInput(){keys.clear();touch.x=touch.z=0;touch.boost=touch.drift=false;$('joystick-knob').style.transform='translate(-50%,-50%)';$('mobile-boost').classList.remove('pressed');$('mobile-drift').classList.remove('pressed');}
function screen(show){for(const id of['menu','hud','result-overlay','pause-overlay','countdown-overlay','mobile-controls'])$(id).hidden=!show.includes(id);}
function updateCareer(){setText('menu-level',1+Math.floor(career.xp/250));setText('menu-wins',career.wins);setText('menu-xp',career.xp.toLocaleString('sv-SE'));document.querySelectorAll('[data-color]').forEach(button=>{const n=Number(button.dataset.color),locked=career.xp<unlocks[n];button.classList.toggle('locked',locked);button.classList.toggle('selected',n===choices.color);button.setAttribute('aria-pressed',String(n===choices.color));button.style.setProperty('--paint',`#${COLORS[n].toString(16).padStart(6,'0')}`);button.title=locked?`${colorNames[n]} · ${unlocks[n]} XP`:colorNames[n];button.setAttribute('aria-label',button.title);});}
function makeSimulation(demo=false){
  const daily=choices.mode==='daily'&&!demo;
  const day=daily?dateKey():null;
  const seed=daily?hash(`LASTCART-${day}`):Math.floor(Math.random()*4294967295);
  const arena=daily?seed%ARENAS.length:choices.arena;
  sim=new Simulation({mode:demo?'solo':choices.mode,difficulty:daily?'spicy':choices.difficulty,arena,seed,playerColor:choices.color,round});
  sim.dailyDate=day;
  if(demo){sim.players.forEach(p=>{p.human=false;p.slot=-1;});sim.countdown=0;sim.state='playing';}
  view.loadArena(ARENAS[arena],arena);view.clearEffects();
  if(!view.cartMeshes.length)view.rebuildCarts(sim.players);
  const caption=document.querySelector('.scene-caption>span:first-child');if(caption)caption.textContent=`0${arena+1} / ${ARENAS[arena].name.toUpperCase()}`;
  accumulator=0;slowMotion=0;demoEnd=0;
  return sim;
}
function showMenu(){
  resetInput();paused=false;modal=null;stage='menu';endDelay=0;result=null;
  $('settings-overlay').hidden=true;$('help-overlay').hidden=true;
  screen(['menu']);view.setMode(true);audio.setSuspended(false);audio.setActive(false);audio.update({speed:0,drifting:false,boosting:false},.1);
  updateCareer();makeSimulation(true);$('play-button').focus({preventScroll:true});
}
async function startGame(){
  if(!view)return;
  audio.unlock().catch(()=>{});audio.setMuted(settings.muted);audio.setSuspended(false);audio.setActive(true);audio.play('click');
  resetInput();paused=false;modal=null;stage='game';round++;endDelay=0;result=null;humanTimes={};goTimer=0;
  $('settings-overlay').hidden=true;$('help-overlay').hidden=true;$('killfeed').replaceChildren();$('toast').textContent='';toastTimer=0;
  screen(['hud','countdown-overlay',...(coarse()?['mobile-controls']:[])]);$('p2-panel').hidden=choices.mode!=='local';
  view.setMode(false);makeSimulation(false);view.hit=0;
  document.querySelector('.p1-panel').style.borderTopColor=`#${sim.players[0].color.toString(16)}`;
  document.querySelector('.p2-panel').style.borderTopColor=`#${sim.players[1].color.toString(16)}`;
  $('p1-name').textContent=choices.mode==='local'?'SPELARE 1':'DU';$('p2-name').textContent='SPELARE 2';
  const label=choices.mode==='daily'?`DAGENS · ${sim.dailyDate.slice(5)}`:choices.mode==='local'?`P1 ${localWins[0]} — ${localWins[1]} P2`:`MATCH ${String(round).padStart(2,'0')}`;
  setText('round-label',label);setText('countdown-number',3);document.activeElement?.blur();updateHUD();
}
function selectMode(mode){
  choices.mode=mode;document.querySelectorAll('[data-mode]').forEach(b=>{b.classList.toggle('active',b.dataset.mode===mode);b.setAttribute('aria-pressed',String(b.dataset.mode===mode));});
  $('arena-select').disabled=mode==='daily';$('difficulty-select').disabled=mode==='daily';
  if(mode==='daily'){const seed=hash(`LASTCART-${dateKey()}`);$('arena-select').value=seed%3;$('difficulty-select').value='spicy';const best=career.daily[dateKey()];toast(best?`Dagens rekord: #${best.placement} · ${best.kills} utknuffade · ${best.score} poäng`:'Samma startläge för alla. Slå ditt rekord.',4);}
  else{$('arena-select').value=choices.arena;$('difficulty-select').value=choices.difficulty;}
  const controls=document.querySelector('.quick-controls');controls.innerHTML=mode==='local'?'<span><kbd>WASD</kbd> P1</span><span><kbd>↑←↓→</kbd> P2</span><span><kbd>?</kbd> kontroller</span>':'<span><kbd>W A S D</kbd> styr</span><span><kbd>SPACE</kbd> boost</span><span><kbd>SHIFT</kbd> drift</span>';
  if(mode==='local'&&coarse())toast('Två spelare behöver tangentbord eller två handkontroller.',4);
  audio.play('click');
}
function setPause(value){
  if(!['game','ending'].includes(stage))return;paused=value;resetInput();$('pause-overlay').hidden=!value;$('mobile-controls').hidden=value||!coarse();audio.setSuspended(value);if(value)$('resume-button').focus({preventScroll:true});lastTime=performance.now();
}
function openModal(name){
  if(modal)closeModal();lastFocus=document.activeElement;resumeAfterModal=['game','ending'].includes(stage)&&!paused;
  if(resumeAfterModal){paused=true;resetInput();audio.setSuspended(true);$('mobile-controls').hidden=true;}
  modal=name;$(`${name}-overlay`).hidden=false;$(`${name}-close`).focus({preventScroll:true});audio.play('click');
}
function closeModal(){
  if(!modal)return;$(modal+'-overlay').hidden=true;modal=null;
  if(resumeAfterModal){paused=false;audio.setSuspended(false);$('mobile-controls').hidden=!coarse();lastTime=performance.now();}resumeAfterModal=false;lastFocus?.focus({preventScroll:true});
}
function gameInputs(){
  const local=choices.mode==='local';
  const inputs=[{x:(keys.has('KeyD')?1:0)-(keys.has('KeyA')?1:0),z:(keys.has('KeyS')?1:0)-(keys.has('KeyW')?1:0),boost:keys.has('Space')||keys.has('KeyE'),drift:keys.has('ShiftLeft')||keys.has('KeyQ')},{x:(keys.has('ArrowRight')?1:0)-(keys.has('ArrowLeft')?1:0),z:(keys.has('ArrowDown')?1:0)-(keys.has('ArrowUp')?1:0),boost:keys.has('Enter')||keys.has('Numpad0'),drift:keys.has('ShiftRight')||keys.has('Slash')}];
  if(!local){inputs[0].x+=inputs[1].x;inputs[0].z+=inputs[1].z;inputs[0].drift ||= keys.has('ShiftRight');}
  if(Math.hypot(touch.x,touch.z)>.05){inputs[0].x=touch.x;inputs[0].z=touch.z;}inputs[0].boost ||=touch.boost;inputs[0].drift ||=touch.drift;
  try{const pads=[...navigator.getGamepads()].filter(Boolean);for(let i=0;i<Math.min(pads.length,local?2:1);i++){const pad=pads[i],p=inputs[i];let x=pad.axes[0]||0,z=pad.axes[1]||0;if(Math.hypot(x,z)>.16){p.x=x;p.z=z;}p.x+=(pad.buttons[15]?.pressed?1:0)-(pad.buttons[14]?.pressed?1:0);p.z+=(pad.buttons[13]?.pressed?1:0)-(pad.buttons[12]?.pressed?1:0);p.boost ||=Boolean(pad.buttons[0]?.pressed||pad.buttons[7]?.pressed);p.drift ||=Boolean(pad.buttons[1]?.pressed||pad.buttons[6]?.pressed);}}
  catch{}return inputs;
}
function feed(text,color){const el=document.createElement('div');el.textContent=text;if(color)el.style.borderLeft=`3px solid #${color.toString(16)}`;el.dataset.expires=String(elapsed+4);$('killfeed').prepend(el);while($('killfeed').children.length>4)$('killfeed').lastElementChild.remove();}
function handleEvents(events,demo){for(const event of events){
  view.handleEvent(event,sim);if(demo)continue;
  const p=sim.players[event.playerId],human=p?.human;
  if(event.type==='countdown'){setText('countdown-number',event.value===0?'KÖR!':event.value);$('countdown-overlay').hidden=false;audio.play(event.value===0?'go':'countdown');if(event.value===0){goTimer=.6;if(career.matches===0)toast('SPACE = boost. SHIFT + sväng = drift. Håll dig på taket.',5);}}
  else if(event.type==='collision'){audio.play('collision',{force:(event.force??5)/8,pan:clamp((event.x||0)/20,-1,1)});}
  else if(event.type==='boost'||event.type==='driftboost'){if(human)audio.play(event.type);}
  else if(event.type==='pickup'){if(human){audio.play('pickup');toast(event.pickupType==='shield'?'SKÖLD · tål smällar i 7 sekunder':'BOOST LADDAD',1.7);}}
  else if(event.type==='chaos'){const names={lowgrip:'NYMOPPAT · halt tak!',turbo:'FLASH SALE · dubbel boost!',wind:'SIDVIND · håll emot!'};toast(names[event.chaosType]??event.name,3.5);audio.play('chaos');}
  else if(event.type==='eliminate'){
    const killer=sim.players[event.killerId];const name=human?(p.id===0?'DU':'SPELARE 2'):p?.name;
    feed(killer?`${killer.human?(killer.id===0?'DU':'P2'):killer.name}  ↗  ${name}`:`${name} tog genvägen ner.`,p?.color);
    if(human)humanTimes[p.id]=sim.time;
    if(human||killer?.human){audio.play('eliminate');if(!reducedMotion)slowMotion=.32;}
    if(killer?.human&&!human)toast(`${killer.id===0?'DU':'P2'} KNUFFADE UT ${p.name}!`,1.8);
    if(!sim.players.some(p=>p.human&&p.alive)&&stage==='game'){stage='ending';endDelay=1.65;}
  }
  else if(event.type==='finish'&&stage==='game'){stage='ending';endDelay=1.8;}
}}
function updateHUD(){
  setText('clock',fmt(Math.max(0,82-sim.time)));setText('alive-count',sim.players.filter(p=>p.alive).length);
  const chaosNames={lowgrip:'NYMOPPAT',turbo:'FLASH SALE',wind:'SIDVIND'};setText('chaos-label',sim.chaos.remaining>0?`${chaosNames[sim.chaos.type]??''} · ${Math.ceil(sim.chaos.remaining)}s`:sim.time>20?'SÄKERHETSZONEN KRYMPER':'');
  for(let i=0;i<(choices.mode==='local'?2:1);i++){const p=sim.players[i];setText(`p${i+1}-wobble`,`${Math.round(p.wobble)}%`);$(`p${i+1}-wobble`).style.color=p.wobble>65?'#ff9574':'';$(`p${i+1}-boost`).style.width=`${p.boost*100}%`;$(`p${i+1}-boost`).style.background=p.boost>.98?'#d7f44a':'#78958c';$(`p${i+1}-name`).textContent=!p.alive?'UTKNUFFAD':p.shield>0?`SKÖLD ${Math.ceil(p.shield)}s`:i===0?(choices.mode==='local'?'SPELARE 1':'DU'):'SPELARE 2';}
  $('mobile-boost').classList.toggle('recharging',sim.players[0].boost<.98);$('mobile-boost').style.setProperty('--charge',sim.players[0].boost);
}
function showResult(){
  if(result)return;
  const humans=sim.players.filter(p=>p.human),best=[...humans].sort((a,b)=>(a.placement??2)-(b.placement??2)||b.kills-a.kills)[0];
  const winner=sim.winnerId===null?null:sim.players[sim.winnerId],won=Boolean(winner?.human),placement=best.placement??(best.alive?1:8),kills=humans.reduce((n,p)=>n+p.kills,0);
  const survival=humanTimes[best.id]??sim.time,xp=25+kills*25+Math.max(0,8-placement)*8+(won?100:0);
  result={won,winner:winner?.name,winnerId:winner?.id,placement,kills,time:survival,xp,score:Math.round(best.score),mode:choices.mode,arena:sim.arena.name,dailyDate:sim.dailyDate};
  const oldLevel=1+Math.floor(career.xp/250);career.xp+=xp;career.matches++;if(won){career.wins++;if(choices.mode==='local')localWins[winner.id]++;}
  if(choices.mode==='daily'){const day=result.dailyDate,record={placement,kills,score:result.score,time:survival};const previous=career.daily[day];if(!previous||placement<previous.placement||(placement===previous.placement&&result.score>previous.score))career.daily[day]=record;const keys=Object.keys(career.daily).sort();for(const key of keys.slice(0,-14))delete career.daily[key];}
  save();stage='result';screen(['result-overlay']);audio.setActive(false);audio.update({speed:0,drifting:false,boosting:false},.05);audio.play(won?'win':'lose');
  if(won){setText('result-eyebrow',choices.mode==='local'?`P1 ${localWins[0]} — ${localWins[1]} P2`:'TAKETS NYA ÄGARE.');setText('result-title',choices.mode==='local'?`SPELARE ${winner.id+1}\nVINNER.`:'SISTA\nVAGNEN.');setText('result-detail',sim.finishReason==='time'?'Tiden är ute. Flest knockouts, sedan stabilast vagn, avgjorde.':'Taket är ditt. Returrätten är körd.');}
  else{setText('result-eyebrow',`PLACERING ${placement} AV 8`);setText('result-title',placement===2?'SÅ NÄRA.\nSÅ LÅNGT NER.':'TACK FÖR\nBESÖKET.');setText('result-detail',placement===2?'En vagn ifrån segern. Nästa kund, tack.':'Din vagn lämnade parkeringen lite för snabbt. En till?');}
  if(1+Math.floor(career.xp/250)>oldLevel)$('result-detail').textContent+=` Nivå ${1+Math.floor(career.xp/250)}!`;
  setText('result-kills',kills);setText('result-time',fmt(survival));setText('result-xp',`+${xp}`);setText('share-button','Kopiera resultat ↗');
  $('next-button').querySelector('span').textContent=choices.mode==='daily'?'SLÅ DITT REKORD':'REVANSCH';$('next-button').focus({preventScroll:true});updateCareer();
}
async function shareResult(){
  if(!result)return;const origin=location.protocol==='file:'?'':`${location.origin}${location.pathname}`;
  const text=`LAST CART 🛒\n${result.won?'Sista vagnen kvar!':`#${result.placement} av 8`} · ${result.kills} knockouts · ${fmt(result.time)}\n${result.mode==='daily'?`Dagens bana ${result.dailyDate}`:result.arena}\nSlår du mig?${origin?'\n'+origin:''}`;
  try{await navigator.clipboard.writeText(text);setText('share-button','Kopierat ✓');audio.play('click');}
  catch{const area=document.createElement('textarea');area.value=text;area.style.cssText='position:fixed;bottom:12px;left:10%;width:80%;height:120px;z-index:99;padding:12px;user-select:text';area.setAttribute('aria-label','Markera och kopiera ditt resultat');document.body.appendChild(area);area.select();try{if(document.execCommand('copy')){area.remove();setText('share-button','Kopierat ✓');}else{toast('Markera resultatet och kopiera.');area.addEventListener('blur',()=>area.remove(),{once:true});}}catch{toast('Markera resultatet och kopiera.');}}
}
function wireUI(){
  $('arena-select').replaceChildren(...ARENAS.map((a,i)=>{const o=document.createElement('option');o.value=i;o.textContent=a.name;return o;}));
  $('play-button').addEventListener('click',startGame);$('next-button').addEventListener('click',startGame);$('menu-button').addEventListener('click',showMenu);$('quit-button').addEventListener('click',showMenu);$('share-button').addEventListener('click',shareResult);
  $('pause-button').addEventListener('click',()=>setPause(true));$('resume-button').addEventListener('click',()=>setPause(false));
  document.querySelector('.wordmark').addEventListener('click',e=>{e.preventDefault();if(['game','ending'].includes(stage))setPause(true);});
  document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>selectMode(b.dataset.mode)));
  document.querySelectorAll('[data-color]').forEach(b=>b.addEventListener('click',()=>{const n=Number(b.dataset.color);if(career.xp<unlocks[n]){toast(`${colorNames[n]} låses upp vid ${unlocks[n]} XP. Du har ${career.xp}.`);return;}choices.color=n;save();updateCareer();sim.players.forEach((p,i)=>p.color=COLORS[(n+i)%8]);audio.play('click');}));
  $('arena-select').addEventListener('change',e=>{choices.arena=Number(e.target.value);makeSimulation(true);audio.play('click');});$('difficulty-select').addEventListener('change',e=>choices.difficulty=e.target.value);
  for(const name of['settings','help']){$(name+'-button').addEventListener('click',()=>openModal(name));$(name+'-close').addEventListener('click',closeModal);$(name+'-overlay').addEventListener('click',e=>{if(e.target===$(name+'-overlay'))closeModal();});}
  $('music-volume').value=settings.music;$('sfx-volume').value=settings.sfx;$('quality-select').value=settings.quality;$('shake-toggle').checked=settings.shake;
  for(const kind of['music','sfx'])$(kind+'-volume').addEventListener('input',e=>{settings[kind]=Number(e.target.value);audio.setVolumes(settings);save();});
  $('quality-select').addEventListener('change',e=>{settings.quality=e.target.value;view.setQuality(settings.quality);autoBalanced=true;save();});$('shake-toggle').addEventListener('change',e=>{settings.shake=e.target.checked;view.shakeEnabled=settings.shake;save();});
  function soundState(){$('sound-button').classList.toggle('is-muted',settings.muted);$('sound-button').setAttribute('aria-pressed',String(settings.muted));$('sound-button').setAttribute('aria-label',settings.muted?'Slå på ljud':'Slå av ljud');$('sound-button').style.opacity=settings.muted?'.45':'1';}
  soundState();$('sound-button').addEventListener('click',()=>{audio.unlock().catch(()=>{});settings.muted=!settings.muted;audio.setMuted(settings.muted);soundState();save();});
  window.addEventListener('keydown',e=>{
    const editing=['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName);
    if(e.code==='Escape'){e.preventDefault();if(modal)closeModal();else if(['game','ending'].includes(stage))setPause(!paused);return;}
    if(e.key==='?'&&!editing){e.preventDefault();if(modal==='help')closeModal();else openModal('help');return;}
    if(e.code==='Tab'){const overlay=modal?$(modal+'-overlay'):paused?$('pause-overlay'):stage==='result'?$('result-overlay'):null;if(overlay){const els=[...overlay.querySelectorAll('button,input,select,a')].filter(el=>!el.disabled&&!el.hidden);const first=els[0],last=els.at(-1);if(e.shiftKey&&document.activeElement===first){last.focus();e.preventDefault();}else if(!e.shiftKey&&document.activeElement===last){first.focus();e.preventDefault();}}}
    if(editing||modal||paused)return;
    if(stage==='game'||stage==='ending'){if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Enter','ShiftLeft','ShiftRight','KeyW','KeyA','KeyS','KeyD','KeyQ','KeyE','Slash','Numpad0'].includes(e.code))e.preventDefault();keys.add(e.code);}
  });
  window.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>{resetInput();if(['game','ending'].includes(stage)&&!paused&&!modal)setPause(true);});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){resetInput();if(['game','ending'].includes(stage)&&!paused&&!modal)setPause(true);}lastTime=performance.now();});
  window.addEventListener('resize',()=>view.resize());
  const joy=$('joystick-area'),knob=$('joystick-knob');let pointer=null;
  const move=e=>{const rect=joy.getBoundingClientRect(),radius=rect.width*.32,dx=e.clientX-(rect.left+rect.width/2),dy=e.clientY-(rect.top+rect.height/2),d=Math.hypot(dx,dy),scale=d>radius?radius/d:1;touch.x=dx*scale/radius;touch.z=dy*scale/radius;knob.style.transform=`translate(calc(-50% + ${dx*scale}px),calc(-50% + ${dy*scale}px))`;};
  joy.addEventListener('pointerdown',e=>{e.preventDefault();pointer=e.pointerId;joy.setPointerCapture(pointer);move(e);});joy.addEventListener('pointermove',e=>{if(e.pointerId===pointer)move(e);});
  const release=e=>{if(e.pointerId===pointer){pointer=null;touch.x=touch.z=0;knob.style.transform='translate(-50%,-50%)';}};joy.addEventListener('pointerup',release);joy.addEventListener('pointercancel',release);joy.addEventListener('lostpointercapture',release);
  for(const type of['boost','drift']){const b=$('mobile-'+type);b.addEventListener('pointerdown',e=>{e.preventDefault();b.setPointerCapture(e.pointerId);touch[type]=true;b.classList.add('pressed');});const release=()=>{touch[type]=false;b.classList.remove('pressed');};b.addEventListener('pointerup',release);b.addEventListener('pointercancel',release);b.addEventListener('lostpointercapture',release);}
  window.addEventListener('gamepadconnected',()=>toast('Handkontroll ansluten · A boost · B drift',4));
}
function tick(now){
  const realDt=Math.min(.05,(now-lastTime)/1000||1/60);lastTime=now;elapsed+=realDt;
  if(toastTimer>0){toastTimer-=realDt;if(toastTimer<=0)$('toast').textContent='';}
  if(stage!=='loading'){
    const demo=stage==='menu';
    if(!paused&&!modal&&stage!=='result'){
      const dt=realDt*(slowMotion>0?.38:1);slowMotion=Math.max(0,slowMotion-realDt);accumulator+=dt;
      const inputs=demo?[]:gameInputs();let steps=0;
      while(accumulator>=1/120&&steps++<12){sim.step(1/120,inputs);accumulator-=1/120;}
      handleEvents(sim.takeEvents(),demo);
      if(demo&&sim.state==='finished'){demoEnd+=realDt;if(demoEnd>2.6)makeSimulation(true);}
      if(stage==='ending'){endDelay-=realDt;if(endDelay<=0)showResult();}
      if(goTimer>0){goTimer-=realDt;if(goTimer<=0)$('countdown-overlay').hidden=true;}
      if(!demo){const p=sim.players[0];audio.update({speed:p.alive?Math.hypot(p.vx,p.vz):0,drifting:p.alive&&p.drift,boosting:p.alive&&p.boosting>0},realDt);hudTimer+=realDt;if(hudTimer>.07){hudTimer=0;updateHUD();}}
    }
    if(!document.hidden)view.update(sim,paused||modal?0:realDt,elapsed,demo);
    for(const el of $('killfeed').children)if(Number(el.dataset.expires)<elapsed)el.remove();
    // Protect mobile and integrated GPUs without changing the simulation clock.
    if(stage==='game'&&!paused&&!autoBalanced&&elapsed>10){frameCount++;frameTime+=realDt;if(frameCount===180){if(frameTime>6.8&&settings.quality==='high'){settings.quality='medium';view.setQuality('medium');$('quality-select').value='medium';autoBalanced=true;}frameCount=frameTime=0;}}
  }
  requestAnimationFrame(tick);
}
async function boot(){
  try{
    view=new GameView($('game-canvas'),settings);wireUI();updateCareer();makeSimulation(true);view.update(sim,0,0,true);
    // Read-only diagnostics help verify state without adding player-facing debug UI.
    Object.defineProperty(window,'__LAST_CART__',{value:Object.freeze({snapshot:()=>({stage,paused,mode:choices.mode,sim:sim.snapshot(),result,career:{...career},graphics:view.getStats()}),version:'1.0.0'}),writable:false});
    $('loading-screen').hidden=true;stage='menu';screen(['menu']);lastTime=performance.now();requestAnimationFrame(tick);
  }catch(error){console.error('LAST CART could not start:',error);$('loading-screen').hidden=true;$('error-screen').hidden=false;}
}
boot();
