import { Physics } from './physics.js';
import { GameRenderer } from './renderer.js';
import { Input, DEFAULT_BINDINGS, BINDING_LABELS, GAMEPAD_LABELS, keyLabel } from './input.js';
import { GameAudio } from './audio.js';
import { Match, DRILLS } from './match.js';
import { attachTouch } from './touch.js';
import { Online, OnlineMatch, GAME_ID, errorText } from './online.js';

const $=id=>document.getElementById(id);
const DEFAULT_SETTINGS={fov:100,cameraDistance:8.5,cameraHeight:3.8,cameraAngle:5,stiffness:7,cameraShake:.25,quality:'high',adaptive:true,master:.75,sfx:.8,music:.35,sensitivity:.6,showFPS:false};
const DEFAULT_COSMETICS={paint:'#29b8e9',orangePaint:'#f58a30',wheels:'sport',trail:'#64ddff'};
const DEFAULT_CONFIG={teamSize:1,playerTeam:0,difficulty:'pro',length:300};
let saved={};try{saved=JSON.parse(localStorage.getItem('overtime.v1')||'{}')||{};}catch{}
const settings={...DEFAULT_SETTINGS,...saved.settings},cosmetics={...DEFAULT_COSMETICS,...saved.cosmetics},config={...DEFAULT_CONFIG,...saved.config},bindings={...DEFAULT_BINDINGS,...saved.bindings};
const career={games:0,wins:0,goals:0,assists:0,saves:0,shots:0,bestScore:0,...saved.career};
for(const k of ['paint','orangePaint','trail'])if(!/^#[\da-f]{6}$/i.test(cosmetics[k]))cosmetics[k]=DEFAULT_COSMETICS[k];
for(const key of Object.keys(DEFAULT_SETTINGS))if(typeof settings[key]!==typeof DEFAULT_SETTINGS[key])settings[key]=DEFAULT_SETTINGS[key];
for(const [key,min,max]of [['fov',70,115],['cameraDistance',5,14],['cameraHeight',1.5,6],['cameraAngle',0,15],['stiffness',2,15],['cameraShake',0,1],['master',0,1],['sfx',0,1],['music',0,1],['sensitivity',.15,1.5]])settings[key]=Number.isFinite(settings[key])?Math.max(min,Math.min(max,settings[key])):DEFAULT_SETTINGS[key];
if(!['high','medium','low'].includes(settings.quality))settings.quality='high';if(!['sport','turbine','classic'].includes(cosmetics.wheels))cosmetics.wheels='sport';
for(const key of Object.keys(DEFAULT_BINDINGS))if(typeof bindings[key]!=='string'||!/^[A-Za-z0-9]{1,30}$/.test(bindings[key]))bindings[key]=DEFAULT_BINDINGS[key];
if(![1,2,3].includes(config.teamSize))config.teamSize=1;if(![0,1].includes(config.playerTeam))config.playerTeam=0;if(!['rookie','pro','allstar'].includes(config.difficulty))config.difficulty='pro';if(![60,180,300,600].includes(config.length))config.length=300;
let physics,view,match,input,offlineMatch,onlineMatch,online,onlineStatus='';
const audio=new GameAudio(settings);
let screen='menu',panel=null,settingsTab='camera',settingsReturn='menu',activeKind='exhibition',ready=false;
let last=performance.now(),frameCount=0,frameWindow=0,fps=60,slowTime=0,effectiveQuality=settings.quality;
let announcementUntil=0,toastUntil=0,firstMatch=true,uiTime=0,lastClock='',lastScores='',lastBoost=-1;
let ballCam=saved.ballCam??true;
let garageTeam=0;

function save(){try{localStorage.setItem('overtime.v1',JSON.stringify({settings,cosmetics,config,bindings,career,ballCam}));}catch{}}
function show(el,visible=true){$(el).classList.toggle('hidden',!visible);}
function playUI(){audio.unlock().catch(()=>{});audio.ui();}
function syncMenu(){
  const size=`${config.teamSize}V${config.teamSize}`,difficulty=config.difficulty==='allstar'?'ALL-STAR':config.difficulty.toUpperCase();
  $('quick-summary').textContent=`${size} · ${difficulty} · ${config.length/60} MIN`;
  for(const b of $('mode-options').querySelectorAll('button'))b.classList.toggle('active',Number(b.dataset.value)===config.teamSize);
  for(const b of $('difficulty-options').querySelectorAll('button'))b.classList.toggle('active',b.dataset.value===config.difficulty);
  $('team-select').value=config.playerTeam;$('length-select').value=config.length;
  $('paint-blue').value=cosmetics.paint;$('paint-orange').value=cosmetics.orangePaint;$('paint-trail').value=cosmetics.trail;
  for(const b of $('wheel-options').querySelectorAll('button'))b.classList.toggle('active',b.dataset.value===cosmetics.wheels);
  for(const b of $('garage-team-options').querySelectorAll('button'))b.classList.toggle('active',Number(b.dataset.value)===garageTeam);
}
function cameraIndicator(){show('camera-button',true);$('camera-mode').textContent=ballCam?'BALL CAM':'CAR CAM';$('cam-dot').classList.toggle('off',!ballCam);$('camera-key').textContent=keyLabel(bindings.camera);}
function previewTeam(team){garageTeam=team;if(match?.current?.cars[0]){match.current.cars[0].team=team;match.previous=match.current;}syncMenu();}
function announce(text,label='',sub='',duration=1){
  $('announcement-text').textContent=text;$('announcement-label').textContent=label;$('announcement-sub').textContent=sub;
  $('announcement-text').style.fontSize=text.length>6?'clamp(42px,7vw,96px)':'';show('announcement');announcementUntil=uiTime+duration;
}
function toast(text,duration=2){$('toast').textContent=text;show('toast');toastUntil=uiTime+duration;}
function hidePanels(){input?.clear();for(const p of document.querySelectorAll('.panel'))p.classList.add('hidden');show('modal-layer',false);$('modal-layer').classList.remove('garage-layer');panel=null;}
function openPanel(name){
  playUI();hidePanels();panel=name;show('modal-layer');show(name+'-panel');
  if(name==='settings'){settingsReturn=screen==='game'?'pause':'menu';renderSettings();}
  if(name==='online')renderOnline();
  if(name==='garage'){previewTeam(garageTeam);$('modal-layer').classList.add('garage-layer');audio.setMode('garage');}
  if(input)input.enabled=false;
  const first=$(name+'-panel').querySelector('button');first?.focus({preventScroll:true});
}
function closePanel(){
  if(panel==='pause'){resume();return;}
  if(panel==='online'){online.leave();onlineStatus='';hidePanels();return;}
  if(panel==='results')return;
  const back=panel==='settings'&&settingsReturn==='pause';hidePanels();audio.setMode(screen==='game'?'paused':'menu');if(back){openPanel('pause');return;}if(screen==='game')resume();
}
function startGame(kind='exhibition',onlineMsg=null){
  if(!ready)return;if(kind==='online'&&!onlineMsg)return;if(kind!=='online'&&online?.room)online.leave();playUI();activeKind=kind;match=kind==='online'?onlineMatch:offlineMatch;document.body.classList.toggle('is-online',kind==='online');screen='game';document.body.classList.add('is-playing');document.body.classList.remove('is-replay');hidePanels();show('menu',false);show('hud');show('goal-banner',false);show('replay-label',false);show('announcement',false);show('training-panel',kind==='training');show('freeplay-tip',kind==='freeplay');show('touch-reset',kind==='freeplay');
  $('match-type').textContent=kind==='online'?'ONLINE':kind==='exhibition'?`${config.teamSize}V${config.teamSize} · ${config.difficulty==='allstar'?'ALL-STAR':config.difficulty.toUpperCase()}`:kind==='training'?'TRAINING PACK':'FREE PLAY';
  $('controls-hint').innerHTML=`<kbd>${keyLabel(bindings.throttle)}${keyLabel(bindings.left)}${keyLabel(bindings.reverse)}${keyLabel(bindings.right)}</kbd> DRIVE <kbd>${keyLabel(bindings.jump)}</kbd> JUMP <kbd>${keyLabel(bindings.boost)}</kbd> BOOST`;
  show('controls-hint',firstMatch);firstMatch=false;input.clear();input.enabled=true;if(kind==='online'){onlineMatch.begin(online,onlineMsg);view.setCosmetics(cosmetics);$('match-type').textContent=`${physics.teamSize}V${physics.teamSize} · ONLINE`;}else match.start(kind,config);audio.setMode('play');cameraIndicator();lastClock='';lastScores='';lastBoost=-1;$('game').focus({preventScroll:true});
  if(kind==='freeplay')toast('UNLIMITED BOOST',3);
}
function pause(){
  if(screen!=='game'||match.phase==='results')return;
  if(activeKind==='online'){if(panel)return;input.enabled=false;input.clear();openPanel('pause');return;}match.paused=true;input.enabled=false;input.clear();audio.setMode('paused');if(document.pointerLockElement)document.exitPointerLock();openPanel('pause');
}
function resume(){if(screen!=='game')return;audio.unlock().catch(()=>{});hidePanels();match.paused=false;input.clear();input.enabled=true;audio.setMode('play');$('game').focus({preventScroll:true});}
function returnToMenu(stayOnline=false){
  if(!stayOnline)online?.leave();else online?.backToLobby();onlineMatch.stopOnline();document.body.classList.remove('is-online');offlineMatch.phase='idle';
  hidePanels();screen='menu';match.phase='idle';match.paused=false;input.enabled=false;input.clear();audio.setMode('menu');show('hud',false);show('menu');document.body.classList.remove('is-playing','is-replay');physics.reset({teamSize:1,playerTeam:0,freePlay:true});match.current=physics.snapshot();match.previous=match.current;view.sync(match.current,1,match.current);syncMenu();if(document.pointerLockElement)document.exitPointerLock();
}
function onAction(action){
  if(action==='pause'){if(panel)closePanel();else if(screen==='game')pause();return;}
  if(screen!=='game'||match.paused)return;
  if(action==='camera'){ballCam=!ballCam;cameraIndicator();save();audio.ui();}
  if(action==='jump')match.skipReplay();
  if(action==='reset')match.resetBall(false);
  if(action==='ballOnCar')match.resetBall(true);
  if(action==='next')match.nextTraining();
  if(action==='fps'){settings.showFPS=!settings.showFPS;save();}
}
function onMatchEvent(e){
  switch(e.type){
    case 'physics':view?.event(e.event);audio.event(e.event,physics.cars[0],view?.camera);break;
    case 'phase':{
      document.body.classList.toggle('is-replay',e.phase==='replay');show('replay-label',e.phase==='replay');
      if(e.phase!=='goal')show('goal-banner',false);
      if(e.phase==='live'||e.phase==='replay'||e.phase==='results')show('announcement',false);
      break;
    }
    case 'countdown':if(e.number>0){announce(String(e.number),match.overtime?'SUDDEN DEATH':'KICKOFF','',1.5);audio.countdown(e.number);}break;
    case 'go':announce('GO!','','',.7);audio.countdown(0);break;
    case 'goal':{
      const team=e.team===0?'BLUE':'ORANGE';announce('GOAL.',`${team} SCORES`,e.ownGoal?`${e.name} · OWN GOAL`:`${e.name} SCORED`,1.75);
      $('announcement-text').style.color=e.team===0?'#70daff':'#ffad58';$('goal-banner').textContent=`${e.name} ${e.ownGoal?'· OWN GOAL':'· +100'}`;
      break;
    }
    case 'overtime':toast('OVERTIME · NEXT GOAL WINS',3);break;
    case 'message':toast(e.text,e.duration);break;
    case 'stat':if(e.id===0)toast(`${e.text} +${e.points}`,1.7);break;
    case 'training':$('training-index').textContent=`0${e.drill+1} / 0${DRILLS.length}`;$('training-title').textContent=e.title;$('training-help').textContent=e.help;show('training-panel');break;
    case 'trainingSuccess':toast(isTouch()?'NAILED IT.':'NAILED IT. · PRESS N FOR THE NEXT DRILL',4);audio.countdown(0);break;
    case 'matchEnd':finishUI(e);break;
  }
}
function finishUI(e){
  input.enabled=false;audio.setMode('menu');audio.end(e.won);openPanel('results');$('results-title').textContent=e.won?'VICTORY.':'NEXT TIME.';$('results-title').style.color=e.won?'#d2ff5a':'#f4f6f5';$('final-blue').textContent=e.score[0];$('final-orange').textContent=e.score[1];$('mvp').textContent=e.mvp?`MVP / ${e.mvp.name} · ${e.mvp.points} PTS`:'';
  $('results-menu').textContent=e.online?'ROOM':'MAIN MENU';
  $('results-body').innerHTML=e.stats.sort((a,b)=>a.team-b.team||b.points-a.points).map(s=>`<tr class="${s.isPlayer?'player':''}"><td><i class="team-dot" style="background:${s.team===0?'#47caff':'#ff9d45'}"></i>${s.name}${s.isPlayer?'<small>YOU</small>':''}</td><td>${s.points}</td><td>${s.goals}</td><td>${s.assists}</td><td>${s.saves}</td><td>${s.shots}</td></tr>`).join('');
  if(e.online){showBoard();return;}
  const player=e.stats.find(s=>s.id===0);career.games++;if(e.won)career.wins++;for(const key of ['goals','assists','saves','shots'])career[key]+=player[key];career.bestScore=Math.max(career.bestScore,player.points);save();syncMenu();
  if(activeKind==='exhibition'&&career.wins>0){try{window.Ludvig?.score?.('overtime',career.wins);}catch{}}
  showBoard();
}
let resultsBoard=null;
const lbUI=()=>window.Ludvig?.ui||null;
function showBoard(){const ui=lbUI();if(!ui)return;try{if(!resultsBoard)resultsBoard=ui.board($('results-board'),{board:'overtime',limit:5,periods:['7d','30d','all']});else resultsBoard.refresh?.();}catch{}}
function openBoard(){try{lbUI()?.open({board:'overtime'});}catch{}}
function isTouch(){return document.body.classList.contains('touch');}
const SETTING_GROUPS={
  camera:[['fov','Field of view',70,115,1,'°'],['cameraDistance','Distance',5,14,.1,'m'],['cameraHeight','Height',1.5,6,.1,'m'],['cameraAngle','Angle',0,15,1,'°'],['stiffness','Stiffness',2,15,.5,''],['cameraShake','Camera shake',0,1,.05,'%'],['sensitivity','Look sensitivity',.15,1.5,.05,'']],
  audio:[['master','Master volume',0,1,.01,'%'],['music','Music',0,1,.01,'%'],['sfx','Sound effects',0,1,.01,'%']],
};
function settingValue(value,suffix){return suffix==='%'?Math.round(value*100)+'%':Number(value).toFixed(Number.isInteger(Number(value))?0:1)+suffix;}
function applySettings(){effectiveQuality=settings.quality;view?.setSettings(settings);audio.setSettings(settings);save();}
function renderSettings(){
  for(const t of document.querySelectorAll('[data-settings-tab]'))t.classList.toggle('active',t.dataset.settingsTab===settingsTab);
  const content=$('settings-content');
  if(SETTING_GROUPS[settingsTab]){
    content.innerHTML=SETTING_GROUPS[settingsTab].map(([key,label,min,max,step,suffix])=>`<div class="setting-row"><label for="setting-${key}">${label}</label><input id="setting-${key}" type="range" min="${min}" max="${max}" step="${step}" value="${settings[key]}" data-setting="${key}"><output for="setting-${key}">${settingValue(settings[key],suffix)}</output></div>`).join('');
    for(const range of content.querySelectorAll('input'))range.addEventListener('input',()=>{const key=range.dataset.setting;settings[key]=Number(range.value);const suffix=SETTING_GROUPS[settingsTab].find(s=>s[0]===key)[5];range.nextElementSibling.textContent=settingValue(settings[key],suffix);applySettings();});
  }else if(settingsTab==='controls'){
    content.innerHTML='<p class="settings-note">Click a key to rebind it. Escape always pauses. Hold the right mouse button to look around.</p>'+Object.entries(BINDING_LABELS).map(([key,label])=>`<div class="bind-row"><span>${label}</span><button class="bind-button" data-bind="${key}">${keyLabel(bindings[key])}</button><small>${GAMEPAD_LABELS[key]||''}</small></div>`).join('')+'<p class="bind-help">Dodge: jump, release, then jump again with a direction.<br>Air roll: hold powerslide + steer, or Q / E. Gamepad: L1 / R1.<br>Right stick looks around. Start pauses. Standard gamepad mapping.</p>';
    for(const b of content.querySelectorAll('[data-bind]'))b.addEventListener('click',()=>{if(input.capture)return;b.textContent='PRESS A KEY';b.classList.add('listening');input.captureKey(code=>{if(code){const other=Object.entries(bindings).find(([key,value])=>key!==b.dataset.bind&&value===code);if(other)bindings[other[0]]=bindings[b.dataset.bind];bindings[b.dataset.bind]=code;input.setBindings(bindings);save();cameraIndicator();}renderSettings();});});
  }else{
    content.innerHTML=`<div class="setting-row"><label for="quality">Graphics</label><select id="quality"><option value="high">HIGH</option><option value="medium">MEDIUM</option><option value="low">LOW</option></select></div><div class="setting-row"><label for="adaptive">Adapt graphics to performance</label><input id="adaptive" type="checkbox" ${settings.adaptive?'checked':''}></div><div class="setting-row"><label for="show-fps">Show performance</label><input id="show-fps" type="checkbox" ${settings.showFPS?'checked':''}></div><p class="settings-note key-hint">F3 toggles the performance display. The game pauses when its window loses focus.</p>`;
    $('quality').value=settings.quality;$('quality').addEventListener('change',()=>{settings.quality=$('quality').value;slowTime=0;applySettings();});$('adaptive').addEventListener('change',()=>{settings.adaptive=$('adaptive').checked;save();});$('show-fps').addEventListener('change',()=>{settings.showFPS=$('show-fps').checked;save();});
  }
}
function bindUI(){
  $('play-now').addEventListener('click',()=>startGame());$('start-match').addEventListener('click',()=>startGame());$('free-play').addEventListener('click',()=>startGame('freeplay'));$('training').addEventListener('click',()=>startGame('training'));
  for(const b of document.querySelectorAll('[data-open]'))b.addEventListener('click',()=>openPanel(b.dataset.open));
  for(const b of document.querySelectorAll('[data-close]'))b.addEventListener('click',closePanel);
  $('pause-button').addEventListener('click',pause);$('resume').addEventListener('click',resume);$('pause-settings').addEventListener('click',()=>openPanel('settings'));$('restart').addEventListener('click',()=>startGame(activeKind));$('quit').addEventListener('click',()=>returnToMenu());$('rematch').addEventListener('click',()=>{if(activeKind==='online'){if(online.room)online.rematch();else returnToMenu();}else startGame('exhibition');});$('results-menu').addEventListener('click',()=>{if(activeKind==='online'&&online.room){returnToMenu(true);openPanel('online');}else returnToMenu();});$('camera-button').addEventListener('click',()=>onAction('camera'));
  $('training-reset').addEventListener('click',()=>match.resetTraining());$('touch-reset').addEventListener('click',()=>{if(screen==='game'&&!match.paused)match.resetBall(false);});
  for(const id of ['menu-trophy','pause-trophy'])$(id).addEventListener('click',()=>{playUI();openBoard();});$('training-next').addEventListener('click',()=>match.nextTraining());
  for(const b of $('mode-options').querySelectorAll('button'))b.addEventListener('click',()=>{config.teamSize=Number(b.dataset.value);save();syncMenu();audio.ui();});
  for(const b of $('difficulty-options').querySelectorAll('button'))b.addEventListener('click',()=>{config.difficulty=b.dataset.value;save();syncMenu();audio.ui();});
  $('team-select').addEventListener('change',()=>{config.playerTeam=Number($('team-select').value);save();syncMenu();});$('length-select').addEventListener('change',()=>{config.length=Number($('length-select').value);save();syncMenu();});
  for(const [id,key] of [['paint-blue','paint'],['paint-orange','orangePaint'],['paint-trail','trail']])$(id).addEventListener('input',()=>{cosmetics[key]=$(id).value;view.setCosmetics(cosmetics);save();});
  for(const b of $('garage-team-options').querySelectorAll('button'))b.addEventListener('click',()=>previewTeam(Number(b.dataset.value)));
  for(const b of $('wheel-options').querySelectorAll('button'))b.addEventListener('click',()=>{cosmetics.wheels=b.dataset.value;view.setCosmetics(cosmetics);save();syncMenu();audio.ui();});
  for(const b of document.querySelectorAll('[data-settings-tab]'))b.addEventListener('click',()=>{settingsTab=b.dataset.settingsTab;renderSettings();audio.ui();});
  $('restore-settings').addEventListener('click',()=>{if(settingsTab==='controls'){Object.assign(bindings,DEFAULT_BINDINGS);input.setBindings(bindings);}else if(settingsTab==='video'){settings.quality='high';settings.adaptive=true;settings.showFPS=false;}else for(const [key]of SETTING_GROUPS[settingsTab])settings[key]=DEFAULT_SETTINGS[key];applySettings();renderSettings();cameraIndicator();});
  window.addEventListener('resize',()=>view?.resize());
  window.addEventListener('blur',()=>{if(activeKind==='online'){input?.clear();return;}if(screen==='game'&&!match.paused&&match.phase!=='results')pause();});
  document.addEventListener('visibilitychange',()=>{clearTimeout(awayTimer);if(document.hidden){if(activeKind!=='online'&&screen==='game'&&!match.paused&&match.phase!=='results')pause();audio.suspend().catch(()=>{});if(online?.hostingMatch)awayTimer=setTimeout(()=>{if(document.hidden)leaveWhileAway();},3000);}});
  window.addEventListener('pagehide',leaveWhileAway);document.addEventListener('freeze',leaveWhileAway);
  document.addEventListener('pointerdown',()=>audio.unlock().catch(()=>{}),{once:true});
  document.addEventListener('keydown',()=>audio.unlock().catch(()=>{}),{once:true});
}
function updateHUD(){
  if(screen!=='game')return;
  if(match.clock!==lastClock){lastClock=match.clock;$('match-clock').textContent=lastClock;}
  const scores=match.score.join(':');if(scores!==lastScores){lastScores=scores;$('score-blue').textContent=match.score[0];$('score-orange').textContent=match.score[1];}
  show('overtime-label',match.overtime);
  const player=physics.cars[0],boost=Math.round(player.boost);if(boost!==lastBoost){lastBoost=boost;$('boost-value').textContent=boost;$('boost-arc').style.strokeDasharray=`${boost/100*322} 415`;$('boost-arc').style.stroke=boost<15?'#ff9662':'#d2ff5a';}
  $('speed-label').textContent=`${Math.round(player.speed*3.6)} KM/H`;show('supersonic',player.supersonic);
  if(match.elapsed>15)show('controls-hint',false);
  view.setScore(match.score[0],match.score[1],match.clock);
}
function frame(now){
  const dt=Math.min((now-last)/1000,.08);last=now;uiTime+=dt;
  input.update(dt);
  if(screen==='game')match.update(dt,input.read());
  online.tick(dt,screen==='menu');if(panel==='online'&&online.autoSeconds!==lastAuto){lastAuto=online.autoSeconds;renderOnline();}
  const state=match.view();view.sync(state.current,state.alpha,state.previous);
  const mode=panel==='garage'?'garage':screen==='menu'?'menu':match.phase==='replay'?'replay':'play';
  view.update(match.paused?0:dt,{mode,ballCam,look:{x:input.look.x*settings.sensitivity,y:input.look.y*settings.sensitivity},countdown:match.phase==='countdown'?3-match.phaseTime:undefined,playerId:0,replay:match.phase==='replay'});view.render();
  audio.update(dt,screen==='game'?physics.cars[0]:null,screen==='game'?physics.cars:[],view.camera);updateHUD();
  if(uiTime>announcementUntil)show('announcement',false);if(uiTime>toastUntil)show('toast',false);if(match.phase!=='goal')$('announcement-text').style.color='#d2ff5a';
  frameCount++;frameWindow+=dt;if(frameWindow>=1){fps=Math.round(frameCount/frameWindow);frameCount=0;frameWindow=0;
    if(settings.adaptive&&screen==='game'&&!match.paused&&match.elapsed>6&&fps<40)slowTime++;else slowTime=Math.max(0,slowTime-.5);
    if(slowTime>4&&effectiveQuality!=='low'){effectiveQuality=effectiveQuality==='high'?'medium':'low';view.setSettings({...settings,quality:effectiveQuality});slowTime=0;}
    if(settings.showFPS){const info=view.renderer.info;$('fps').textContent=`${fps} FPS · ${info.render.calls} DRAWS · ${Math.round(info.render.triangles/1000)}K TRI · ${effectiveQuality.toUpperCase()}`;}
  }show('fps',settings.showFPS);
  requestAnimationFrame(frame);
}
function setupOnline(){
  online=new Online({
    onChange:status=>{if(status!==undefined)onlineStatus=status;if(panel==='online')renderOnline();},
    onStart:msg=>{online.length=config.length;if(screen==='game'&&activeKind==='online'&&!['results','idle'].includes(onlineMatch.phase))return;if(screen==='game')hidePanels();screen='menu';startGame('online',msg);},
    onClose:reason=>{const text=errorText(reason);if(screen==='game'&&activeKind==='online'){returnToMenu();toast(text.toUpperCase(),3);}onlineStatus=text;if(panel==='online')renderOnline();},
    onPeerLeave:peer=>{if(screen==='game'&&activeKind==='online'&&onlineMatch.net)toast(`${String(peer.name||'PLAYER').toUpperCase().slice(0,16)} LEFT`,2.5);},
  });
  online.length=config.length;
  show('online-open',online.available);
  $('online-open').addEventListener('click',()=>{onlineStatus='';openPanel('online');});
  $('online-quick').addEventListener('click',()=>{playUI();online.length=config.length;online.connect('quick');});
  $('online-create').addEventListener('click',()=>{playUI();online.length=config.length;online.connect('create');});
  $('online-code').addEventListener('input',()=>{const el=$('online-code');el.value=el.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,4);});
  $('online-join-form').addEventListener('submit',e=>{e.preventDefault();playUI();const code=$('online-code').value.trim().toUpperCase();if(code.length!==4){onlineStatus=errorText('bad-request');renderOnline();return;}online.length=config.length;online.connect('code',code);});
  $('room-start').addEventListener('click',()=>{playUI();online.length=config.length;online.start();});
  $('room-leave').addEventListener('click',()=>{playUI();online.leave();onlineStatus='';renderOnline();});
  $('room-copy').addEventListener('click',async()=>{const link=online.link;let ok=false;try{if(isTouch()&&navigator.share){await navigator.share({url:link});ok=true;}else{await navigator.clipboard.writeText(link);ok=true;}}catch{}const b=$('room-copy');if(ok){b.textContent='COPIED';setTimeout(()=>{b.textContent='COPY LINK';},1500);}else{onlineStatus=link;renderOnline();}});
}
/** A hidden host stops the shared ball and clock, so after a few seconds away it leaves and the next player takes over. */
let awayTimer=0;
function leaveWhileAway(){
  clearTimeout(awayTimer);if(!online?.hostingMatch||screen!=='game'||activeKind!=='online')return;
  const code=online.room.code;returnToMenu();onlineStatus='You were away. Press JOIN to get back in.';openPanel('online');$('online-code').value=code;
}
function renderOnline(){
  const room=online.room;show('online-entry',!room);show('online-room',!!room);
  for(const id of ['online-quick','online-create','online-join'])$(id).disabled=online.busy;
  let status=online.busy?'Connecting…':onlineStatus;
  if(room){
    $('room-code').textContent=room.code;
    const peers=online.peers;
    $('room-players').innerHTML=peers.map((p,i)=>`<li><i class="team-dot" style="background:${i%2?'#ff9d45':'#47caff'}"></i><span></span>${p.id===room.self.id?'<small>YOU</small>':''}</li>`).join('');
    [...$('room-players').querySelectorAll('span')].forEach((el,i)=>{el.textContent=String(peers[i].name||'PLAYER').slice(0,16);});
    const host=online.isHost,playing=online.phase==='play'&&!(screen==='game');
    show('room-start',host);$('room-start').disabled=peers.length<2;
    if(!status)status=playing&&!host?'Match in progress. You join the next one.':peers.length<2?'Waiting for players':host?(online.autoSeconds?`Starting in ${online.autoSeconds}`:''):'Waiting for host';
  }
  $('online-status').textContent=status;
}
let lastAuto=0;
function setupBoards(){const ui=lbUI();if(!ui)return;try{ui.toast=true;}catch{}const icon=ui.icons?.trophy||'';for(const id of ['menu-trophy','pause-trophy']){$(id).innerHTML=icon;$(id).classList.remove('hidden');}$('results-board').classList.remove('hidden');}
Object.defineProperty(window,'__overtime',{value:Object.freeze({
  get screen(){return screen;},get phase(){return match?.phase;},
  net(){const r=online?.room;const P=o=>({x:+o.x.toFixed(2),y:+o.y.toFixed(2),z:+o.z.toFixed(2)});return {room:r?.code||null,host:online?.isHost||false,self:r?.self.id||null,peers:r?.peers.length||0,phase:onlineMatch?.phase,round:onlineMatch?.round,score:onlineMatch?[...onlineMatch.score]:null,remaining:onlineMatch?.remaining,cars:(physics?.cars||[]).map(c=>({key:c.key,name:c.name,team:c.team,proxy:c.proxy,bot:!c.human&&!c.isPlayer,pos:P(c.position)})),ball:physics?P(physics.ball.position):null,status:document.getElementById('online-status')?.textContent};},
  snapshot(){const car=physics?.cars?.[0];const p=car?.body?.translation?.()||car?.position||{};return {screen,phase:match?.phase,paused:!!match?.paused,score:match?[...match.score]:[0,0],carPos:{x:+(p.x??0),y:+(p.y??0),z:+(p.z??0)},speed:car?.speed??0,boost:car?.boost??0,touch:isTouch()&&screen==='game'};}
})});
async function init(){
  physics=await Physics.create();
  view=new GameRenderer($('game'),settings,cosmetics);offlineMatch=match=new Match(physics,onMatchEvent);onlineMatch=new OnlineMatch(physics,onMatchEvent);setupOnline();input=new Input($('game'),bindings,onAction);
  physics.reset({teamSize:1,playerTeam:0,freePlay:true});match.current=physics.snapshot();match.previous=match.current;view.sync(match.current,1,match.current);
  attachTouch(input);setupBoards();bindUI();syncMenu();cameraIndicator();ready=true;$('play-now').disabled=false;show('loading',false);show('menu');last=performance.now();requestAnimationFrame(frame);
  const code=new URLSearchParams(location.search).get(GAME_ID);if(code&&online.available){openPanel('online');$('online-code').value=code.toUpperCase().slice(0,4);online.connect('code',code.toUpperCase().slice(0,4));}
}
await init();
