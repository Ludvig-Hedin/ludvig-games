import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildWorld, createProp, createMover } from './world.js';
import { GameSimulation, CATALOG, FLOORS, dailySeed, cleanInput, clamp } from './simulation.js';
import { GameAudio } from './audio.js';
import { RoomConnection } from './network.js';

const $=id=>document.getElementById(id);
const fmt=n=>Math.round(n).toLocaleString('sv-SE');
const newRoundId=()=>typeof crypto.randomUUID==='function'?crypto.randomUUID():Array.from(crypto.getRandomValues(new Uint32Array(4)),n=>n.toString(16).padStart(8,'0')).join('-');
const touchDevice=matchMedia('(pointer:coarse)').matches;
const STORAGE='penthouse-panic-v1';
const inviteParams=new URL(location.href).searchParams;
const inviteDaily=inviteParams.get('daily')==='1';
const validDailyDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
const inviteDailyDate=validDailyDate(inviteParams.get('day'))?inviteParams.get('day'):null;
const UNIFORMS=[{name:'Originalet',color:0xf0bd45,price:0},{name:'Aprikos',color:0xe88969,price:180},{name:'Havsbris',color:0x50a99f,price:360},{name:'Nattskift',color:0x4b607d,price:600}];
let storageWorks=true;
function loadProfile(){
  let p={};try{p=JSON.parse(localStorage.getItem(STORAGE)||'{}')||{};}catch{}
  return {coins:clamp(Number(p.coins)||0,0,1e8),unlocked:clamp(Math.floor(Number(p.unlocked)||0),0,5),skin:clamp(Math.floor(Number(p.skin)||0),0,3),owned:Array.isArray(p.owned)?p.owned.filter(x=>Number.isInteger(x)&&x>=0&&x<4):[0],records:p.records&&typeof p.records==='object'?p.records:{},stars:Array.from({length:6},(_,i)=>clamp(Number(p.stars?.[i])||0,0,3)),settings:{sound:p.settings?.sound!==false,music:p.settings?.music!==false,motion:p.settings?.motion??matchMedia('(prefers-reduced-motion:reduce)').matches,quality:['auto','low','high'].includes(p.settings?.quality)?p.settings.quality:'auto'}};
}
const profile=loadProfile();if(!profile.owned.includes(0))profile.owned.unshift(0);if(!profile.owned.includes(profile.skin))profile.skin=0;
function saveProfile(){try{localStorage.setItem(STORAGE,JSON.stringify(profile));return true;}catch{storageWorks=false;return false;}}
let toastTimer;function toast(text){$('toast').textContent=text;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),4000);}
const audio=new GameAudio();audio.setEnabled(profile.settings.sound);audio.setMusic(profile.settings.music);
const canvas=$('world');let renderer;
try{renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});}catch(e){$('load-status').textContent='WebGL 2 behövs för att spela. Aktivera hårdvaruacceleration och ladda om sidan.';throw e;}
renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.93;
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
const scene=new THREE.Scene();const art=buildWorld(scene);
const pmrem=new THREE.PMREMGenerator(renderer);const environment=new RoomEnvironment();const environmentMap=pmrem.fromScene(environment,.04);scene.environment=environmentMap.texture;scene.environmentIntensity=.25;environment.dispose();pmrem.dispose();
const camera=new THREE.OrthographicCamera(-24,24,14,-14,.1,280);
const cameraBase=new THREE.Vector3(22,28,32),cameraTarget=new THREE.Vector3(-6,0,2),desiredTarget=new THREE.Vector3();
camera.position.copy(cameraTarget).add(cameraBase);camera.lookAt(cameraTarget);
const screenVector=new THREE.Vector3(),rotationTarget=new THREE.Quaternion();const raycaster=new THREE.Raycaster();const groundPlane=new THREE.Plane(new THREE.Vector3(0,1,0),0);const pointer=new THREE.Vector2();const aimPoint=new THREE.Vector3();
let width=innerWidth,height=innerHeight,aspect=width/height,gameActive=false,selectedMode='solo',activeMode='solo',selectedLevel=profile.unlocked,paused=false,countRemaining=0,lastCount=-1,roundId='',awarded=false,runParams=null;
let mouseAim=false,mouseAct=false,shiftHeld=false,pointerSeen=false,cameraShake=0,clock=0,netClock=0,remoteInput={},remoteInputAt=0,remoteSequence=-1,inputSequence=0,lastInputSent='',lastSnapshot=null,guestStarted=false;
let room=null,networkRole=null,shuttingRoom=false,onlineInterrupted=false,bannerUntil=0;
let sim;const propViews=[],playerViews=[],playerTags=[];let currentResult=null;
const actors=new THREE.Group();scene.add(actors);
sim=new GameSimulation(art.solids,art.glass,event=>{handleEvent(event);if(room?.connected&&networkRole==='host'&&gameActive)room.send({type:'event',roundId,event});});

// Soft contact shadows keep the toy-like geometry grounded even on low graphics.
const sc=document.createElement('canvas');sc.width=sc.height=64;const sx=sc.getContext('2d');const sg=sx.createRadialGradient(32,32,1,32,32,31);sg.addColorStop(0,'rgba(33,43,34,.33)');sg.addColorStop(1,'rgba(33,43,34,0)');sx.fillStyle=sg;sx.fillRect(0,0,64,64);
const shadowTexture=new THREE.CanvasTexture(sc),shadowMaterial=new THREE.MeshBasicMaterial({map:shadowTexture,transparent:true,depthWrite:false,toneMapped:false});
function shadow(size){const m=new THREE.Mesh(new THREE.PlaneGeometry(size,size),shadowMaterial);m.rotation.x=-Math.PI/2;m.renderOrder=1;actors.add(m);return m;}
const selectRing=new THREE.Mesh(new THREE.RingGeometry(.62,.68,48),new THREE.MeshBasicMaterial({color:0xffdf7c,side:THREE.DoubleSide,transparent:true,opacity:.9,depthWrite:false}));selectRing.rotation.x=-Math.PI/2;selectRing.visible=false;scene.add(selectRing);
const arcGeometry=new THREE.BufferGeometry();arcGeometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(100*3),3));
const arcLine=new THREE.Line(arcGeometry,new THREE.LineDashedMaterial({color:0xfff3b7,dashSize:.22,gapSize:.14,transparent:true,opacity:.9,depthTest:false}));arcLine.visible=false;arcLine.renderOrder=8;scene.add(arcLine);
const landingRing=new THREE.Mesh(new THREE.RingGeometry(.35,.46,32),new THREE.MeshBasicMaterial({color:0xffd467,side:THREE.DoubleSide,transparent:true,opacity:.95,depthTest:false}));landingRing.rotation.x=-Math.PI/2;landingRing.visible=false;landingRing.renderOrder=9;scene.add(landingRing);

const particleLimit=180;const particles=[];const particleMesh=new THREE.InstancedMesh(new THREE.BoxGeometry(.12,.12,.12),new THREE.MeshStandardMaterial({roughness:.5}),particleLimit);particleMesh.count=0;particleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);particleMesh.frustumCulled=false;scene.add(particleMesh);const dummy=new THREE.Object3D();
function burst(position,colors,count=20,power=1){if(profile.settings.motion)count=Math.ceil(count*.4);for(let i=0;i<count&&particles.length<particleLimit;i++){particles.push({p:new THREE.Vector3(...position),v:new THREE.Vector3((Math.random()-.5)*6*power,Math.random()*5*power+1,(Math.random()-.5)*6*power),r:new THREE.Vector3(Math.random()*5,Math.random()*5,Math.random()*5),life:.6+Math.random()*.8,total:1.4,color:new THREE.Color(colors[i%colors.length]),s:.5+Math.random()*1.5});}}
function project(x,y,z){screenVector.set(x,y,z).project(camera);return {x:(screenVector.x*.5+.5)*width,y:(-.5*screenVector.y+.5)*height};}
function popup(text,pos,sub='',warning=false){const p=project(...pos),el=document.createElement('div');el.className='score-popup'+(warning?' warning':'');el.style.left=p.x+'px';el.style.top=p.y+'px';el.textContent=text;if(sub){const small=document.createElement('small');small.textContent=sub;el.append(small);}$('floating-texts').append(el);setTimeout(()=>el.remove(),1400);}
function banner(text,duration=5){$('round-banner').textContent=text;$('round-banner').style.opacity='1';bannerUntil=clock+duration;}
function disposeActor(root){const materials=new Set(),textures=new Set();root.traverse(o=>{if(o.geometry)o.geometry.dispose();const list=Array.isArray(o.material)?o.material:[o.material];for(const m of list){if(!m||m===shadowMaterial||m.userData.panicShared||materials.has(m))continue;materials.add(m);for(const value of Object.values(m))if(value?.isTexture&&!textures.has(value)){textures.add(value);value.dispose();}m.dispose();}});}
function buildActors(){
  for(const child of [...actors.children]){actors.remove(child);disposeActor(child);}propViews.length=0;playerViews.length=0;$('player-labels').replaceChildren();playerTags.length=0;
  for(const item of sim.props){const mesh=createProp(item.type,CATALOG[item.type].color);actors.add(mesh);propViews.push({mesh,shadow:shadow(Math.max(...CATALOG[item.type].size)*1.65)});mesh.position.copy(item.body.position);mesh.quaternion.copy(item.body.quaternion);}
  for(const p of sim.players){const color=p.id===0?UNIFORMS[profile.skin].color:0xe98669;const mesh=createMover(color);actors.add(mesh);playerViews.push({mesh,shadow:shadow(1.8),angle:0});const tag=document.createElement('div');tag.className='player-tag'+(p.id?' second':'');tag.textContent=activeMode==='online'?(p.id===(networkRole==='guest'?1:0)?'DU':'KOMPIS'):(p.id?'SPELARE 2':'DU');$('player-labels').append(tag);playerTags.push(tag);}
  $('delivery-track').replaceChildren(...sim.props.map((_,i)=>{const el=document.createElement('i');if(i===sim.config.quota-1)el.className='target';return el;}));
  art.setLevel(sim.level);
}
function setupMenuScene(){sim.reset({level:selectedLevel,seed:281133,mode:'shift',players:selectedMode==='local'?2:1});sim.phase='menu';buildActors();syncActors(1/60,true);}
function resize(){width=innerWidth;height=innerHeight;aspect=width/height;let span=aspect<.8?(gameActive?37:40):26; if(aspect>2.2)span=23;camera.left=-span*aspect/2;camera.right=span*aspect/2;camera.top=span/2;camera.bottom=-span/2;camera.updateProjectionMatrix();renderer.setSize(width,height,false);applyQuality();}
function applyQuality(){const q=profile.settings.quality;renderer.setPixelRatio(q==='low'?Math.min(devicePixelRatio,1):Math.min(devicePixelRatio,q==='high'?2:1.65));renderer.shadowMap.enabled=q!=='low';document.body.classList.toggle('reduced-motion',profile.settings.motion);}
addEventListener('resize',resize);

function refreshMenu(){
  $('coin-count').textContent=fmt(profile.coins);$('wardrobe-coins').textContent=fmt(profile.coins);$('selected-level').textContent=FLOORS[selectedLevel].floor+' / '+FLOORS[selectedLevel].label.charAt(0)+FLOORS[selectedLevel].label.slice(1).toLowerCase();
  $('play-button').firstElementChild.textContent=selectedMode==='online'?'Spela med en kompis':inviteDaily?'Spela dagens flytt':selectedMode==='local'?'Flytta tillsammans':'Börja flytta';
  $('sound-setting').checked=profile.settings.sound;$('music-setting').checked=profile.settings.music;$('motion-setting').checked=profile.settings.motion;$('quality-setting').value=profile.settings.quality;
  $('sound-button').setAttribute('aria-label',profile.settings.sound?'Stäng av ljud':'Slå på ljud');$('sound-icon').style.opacity=profile.settings.sound?'1':'.35';
}
function closeDialogs(){for(const d of document.querySelectorAll('dialog[open]'))d.close();}
function showDialog(id){if(gameActive&&!paused&&(networkRole!=='guest'))pauseGame(false);$(id).showModal();}
function pauseGame(show=true){
  if(!gameActive||sim.phase==='ended')return;
  clearInputs();paused=true;sim.clearActions();if(sim.phase==='playing')sim.phase='paused';
  if(networkRole==='host'&&room?.connected)room.send({type:'pause',roundId,paused:true});
  if(show){$('pause-title').textContent=networkRole==='guest'?'En liten paus.':'Flyttpaus.';$('pause-copy').textContent=networkRole==='guest'?'Spelet fortsätter hos värden medan du har menyn öppen.':'Dina möbler går ingenstans. Förhoppningsvis.';$('resume-button').disabled=false;$('resume-button').firstChild.textContent='Fortsätt ';$('restart-button').hidden=networkRole==='guest';if(!$('pause-dialog').open)$('pause-dialog').showModal();}
}
function resumeGame(){
  if(onlineInterrupted&&networkRole==='guest')return;
  if(onlineInterrupted&&networkRole==='host'){closeRoom();activeMode=selectedMode='solo';onlineInterrupted=false;if(sim.players[1]){sim.releasePlayer(1);sim.world.removeBody(sim.players[1].body);sim.players.pop();buildActors();}$('connection-hud').hidden=true;}
  paused=false;sim.clearActions();clearInputs();closeDialogs();if(countRemaining<=0&&sim.phase!=='ended')sim.phase='playing';
  if(room?.connected&&networkRole==='host')room.send({type:'pause',roundId,paused:false});
}
function prepareRound(params,remote=false){
  audio.unlock();clearInputs();closeDialogs();awarded=false;onlineInterrupted=false;currentResult=null;lastSnapshot=null;guestStarted=false;paused=false;gameActive=true;activeMode=params.players===2?(remote||networkRole==='host'?'online':'local'):'solo';
  runParams={...params};roundId=params.roundId||newRoundId();remoteInput={};remoteInputAt=0;remoteSequence=-1;inputSequence=0;lastInputSent='';netClock=0;sim.reset(params);buildActors();
  $('menu').hidden=true;$('menu-footer').hidden=true;$('menu-sticker').hidden=true;$('results').hidden=true;$('hud').hidden=false;$('pause-button').hidden=false;$('countdown').hidden=false;$('player-labels').hidden=false;
  $('touch-controls').hidden=!touchDevice;$('connection-hud').hidden=activeMode!=='online';document.body.classList.add('playing');
  $('hud-floor').textContent='VÅNING '+sim.config.floor;$('hud-modifier').textContent=sim.config.label;$('total').textContent=' / '+sim.props.length;$('count-tip').textContent=`Leverera ${sim.config.quota} möbler för en stjärna.`;
  countRemaining=3;lastCount=-1;resize();banner(sim.config.hint,7);if(activeMode==='local')$('control-hint').innerHTML='<span><kbd>WASD</kbd> P1 · <kbd>E</kbd> Grepp</span><span><kbd>↑←↓→</kbd> P2 · <kbd>L</kbd> Grepp · <kbd>K</kbd> Hopp · <kbd>J</kbd> Dash</span>';else $('control-hint').innerHTML='<span><kbd>WASD</kbd> Gå</span><span><kbd>E</kbd> Grepp / kasta</span><span><kbd>SPACE</kbd> Hopp</span><span><kbd>SHIFT</kbd> Dash</span>';
  if(document.activeElement instanceof HTMLElement)document.activeElement.blur();
  if(!remote&&activeMode==='online'&&room?.connected)room.send({type:'start',roundId,params:{...params,roundId}});
}
function startRound(mode='shift',level=selectedLevel,retry=false,challengeDate=null){
  if(selectedMode==='online'&&(!room?.connected||networkRole!=='host')){showOnline();return;}
  if(retry&&mode==='daily'&&runParams?.mode==='daily'){const {roundId:previousRound,...params}=runParams;prepareRound(params);return;}
  const daily=mode==='daily'?dailySeed(challengeDate?new Date(challengeDate+'T12:00:00Z'):new Date()):null;
  const seed=daily?daily.seed:crypto.getRandomValues(new Uint32Array(1))[0];prepareRound({mode,level,seed,dailyDate:daily?.date,players:selectedMode==='local'||selectedMode==='online'?2:1});
}
function toMenu(){
  clearInputs();closeDialogs();closeRoom();gameActive=false;paused=false;countRemaining=0;sim.phase='menu';activeMode='solo';selectedMode=selectedMode==='online'?'solo':selectedMode;networkRole=null;currentResult=null;
  $('menu').hidden=false;$('menu-footer').hidden=false;$('menu-sticker').hidden=false;$('hud').hidden=true;$('pause-button').hidden=true;$('countdown').hidden=true;$('results').hidden=true;$('touch-controls').hidden=true;$('player-labels').hidden=true;document.body.classList.remove('playing');arcLine.visible=landingRing.visible=selectRing.visible=false;
  for(const b of document.querySelectorAll('[data-mode]')){b.classList.toggle('selected',b.dataset.mode===selectedMode);b.setAttribute('aria-pressed',b.dataset.mode===selectedMode);}
  setupMenuScene();refreshMenu();resize();
}
function handleEvent(e){
  if(!e||typeof e.type!=='string')return;
  switch(e.type){
    case 'pickup':audio.play('pickup');if(e.player===(networkRole==='guest'?1:0))banner(touchDevice?'Håll KASTA. Släpp när siktet når lastbilen.':'Sikta med musen. Håll E och släpp för att kasta.',4);break;
    case 'throw':audio.play('throw',e.power);break;
    case 'jump':audio.play('jump');break;
    case 'dash':audio.play('dash');burst(e.pos,[0xfff0cc,0xf8d487],9,.3);break;
    case 'impact':audio.play('collision',e.power);if(e.power>.8)cameraShake=Math.max(cameraShake,.08);break;
    case 'glass':audio.play('glass');burst(e.pos,[0xb8e8e4,0xe9fff6,0x83cfc5],32,1);cameraShake=.18;popup('+50',[e.pos[0],e.pos[1]+1,e.pos[2]],'STILBONUS');break;
    case 'score':{
      audio.play(e.combo>1?'combo':'score',Math.min(e.combo/4,1));burst(e.pos,[0xf8d360,0xffedb7,0x64c1a6,0xe88c68],36,1.2);cameraShake=Math.max(cameraShake,.09);popup('+'+fmt(e.value),[e.pos[0],e.pos[1]+1.7,e.pos[2]],e.longShot?'LÅNGKAST!':e.combo>1?e.combo+' I RAD!':'LEVERERAT!');if(e.combo===3||e.combo===5||e.combo===8)banner(e.combo===3?'Nu börjar det likna en flyttfirma.':e.combo===5?'FEM I RAD. Fortsätt!':'Okej. Det här är orimligt bra.',3);break;
    }
    case 'fall':audio.play('fall');cameraShake=.13;popup('−2 SEK',[...e.pos.slice(0,1),2,e.pos[2]],'EN KORT FALLSKÄRMSPAUS',true);break;
    case 'lost':toast('Möbeln kommer tillbaka. Kombon gör det inte.');break;
    case 'restore':burst(e.pos,[0xffe9ae,0xf5cd72],8,.4);break;
    case 'end':endRound(e.result);break;
  }
}
function endRound(result){
  if(awarded||!validResult(result))return;awarded=true;currentResult={...result,dailyDate:runParams?.dailyDate};sim.phase='ended';clearInputs();countRemaining=0;$('countdown').hidden=true;paused=false;closeDialogs();
  const key=result.mode==='daily'?'daily-'+runParams.dailyDate:'floor-'+result.level;const previous=Number(profile.records[key])||0;const record=result.score>previous&&result.mode!=='practice';
  if(result.mode!=='practice'){profile.records[key]=Math.max(previous,result.score);profile.coins+=result.coins;if(result.mode==='shift'){profile.stars[result.level]=Math.max(profile.stars[result.level],result.stars);if(result.won)profile.unlocked=Math.max(profile.unlocked,Math.min(5,result.level+1));}saveProfile();}
  $('result-kicker').textContent=result.mode==='practice'?'ÖVNING GER FLYTTFÄRDIGHET':result.won?'JOBBET ÄR KLART':'DET FINNS EN MORGONDAG';
  $('result-title').textContent=result.stars===3?'Snyggt flyttat.':result.won?'Det mesta kom med.':'En flytt att minnas.';
  $('result-stars').replaceChildren(...[0,1,2].map(i=>{const s=document.createElement('span');s.textContent='★';s.className=i<result.stars?'':'empty';return s;}));$('result-stars').setAttribute('aria-label',result.stars+' av 3 stjärnor');
  $('result-score').textContent=fmt(result.score);$('new-record').hidden=!record;$('result-deliveries').textContent=result.delivered+' / '+result.total;$('result-combo').textContent=result.maxCombo+' i rad';$('result-throw').textContent=result.longest.toFixed(1)+' m';
  $('result-reward').textContent=result.mode==='practice'?'Redo för ett riktigt jobb?':'✦ +'+result.coins+' flyttmynt'+(result.timeBonus?' · +'+result.timeBonus+' tidspoäng':'');
  $('next-button').hidden=!(result.won&&result.level<5&&result.mode==='shift')||networkRole==='guest';$('replay-button').disabled=networkRole==='guest';$('replay-button').textContent=networkRole==='guest'?'Väntar på värden':'En gång till';
  $('saved-note').textContent=result.mode==='practice'?'Övningsläget ger inga mynt eller rekord.':storageWorks?'Framstegen är sparade på din enhet.':'Webbläsaren blockerar sparning. Rekordet gäller denna session.';
  audio.play(result.won?'win':'lose');audio.setIntensity(0);$('touch-controls').hidden=true;arcLine.visible=landingRing.visible=selectRing.visible=false;setTimeout(()=>{if(gameActive&&sim.phase==='ended'){$('results').hidden=false;$('replay-button').focus();}},750);refreshMenu();
}

// Input is in screen space; the simulation receives normalized world-space vectors.
const keys=new Set(),touch={x:0,y:0,act:false,jump:false,dash:false};
const gameplayKeys=new Set(['KeyW','KeyA','KeyS','KeyD','KeyE','KeyQ','Space','ShiftLeft','ShiftRight','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyL','KeyK','KeyJ','KeyI']);
function clearInputs(){keys.clear();mouseAct=false;touch.x=touch.y=0;touch.act=touch.jump=touch.dash=false;const stick=$('joystick').querySelector('i');stick.style.transform='none';if(room?.connected&&networkRole==='guest')room.send({type:'input',roundId,seq:++inputSequence,input:{}});}
addEventListener('keydown',e=>{
  if(e.target.closest('input,select,textarea'))return;
  if(e.code==='Escape'&&gameActive&&!document.querySelector('dialog[open]')&&sim.phase!=='ended'){e.preventDefault();pauseGame();return;}
  if(e.code==='KeyR'&&gameActive&&sim.phase==='ended'&&networkRole!=='guest'){e.preventDefault();startRound(sim.mode,sim.level,true);return;}
  if(gameActive&&gameplayKeys.has(e.code)&&!document.querySelector('dialog[open]')){e.preventDefault();keys.add(e.code);}
});
addEventListener('keyup',e=>{keys.delete(e.code);});
addEventListener('blur',()=>{clearInputs();mouseAim=false;if(gameActive&&!paused&&sim.phase==='playing'&&networkRole!=='guest')pauseGame();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){clearInputs();if(gameActive&&!paused&&sim.phase==='playing'&&networkRole!=='guest')pauseGame();}});
canvas.addEventListener('pointermove',e=>{if(e.pointerType==='touch')return;pointer.x=e.clientX/width*2-1;pointer.y=-e.clientY/height*2+1;mouseAim=true;pointerSeen=true;});
canvas.addEventListener('pointerdown',e=>{if(e.button!==0||e.pointerType==='touch'||!gameActive||paused)return;audio.unlock();pointer.x=e.clientX/width*2-1;pointer.y=-e.clientY/height*2+1;mouseAim=true;mouseAct=true;canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener('pointerup',()=>mouseAct=false);canvas.addEventListener('pointercancel',()=>{mouseAct=false;sim.clearActions();});
canvas.addEventListener('contextmenu',e=>e.preventDefault());
const joystick=$('joystick');let stickPointer=null,stickOrigin={x:0,y:0};
joystick.addEventListener('pointerdown',e=>{e.preventDefault();audio.unlock();stickPointer=e.pointerId;joystick.setPointerCapture(e.pointerId);const r=joystick.getBoundingClientRect();stickOrigin={x:r.left+r.width/2,y:r.top+r.height/2};moveStick(e);});
function moveStick(e){if(e.pointerId!==stickPointer)return;const radius=joystick.clientWidth*.35;let dx=(e.clientX-stickOrigin.x)/radius,dy=(e.clientY-stickOrigin.y)/radius;const len=Math.hypot(dx,dy);if(len>1){dx/=len;dy/=len;}touch.x=dx;touch.y=dy;mouseAim=false;joystick.querySelector('i').style.transform=`translate(${dx*radius}px,${dy*radius}px)`;}
joystick.addEventListener('pointermove',moveStick);for(const type of ['pointerup','pointercancel'])joystick.addEventListener(type,()=>{stickPointer=null;touch.x=touch.y=0;joystick.querySelector('i').style.transform='none';});
for(const [id,action] of [['touch-grab','act'],['touch-jump','jump'],['touch-dash','dash']]){const el=$(id);el.addEventListener('pointerdown',e=>{e.preventDefault();audio.unlock();el.setPointerCapture(e.pointerId);touch[action]=true;});el.addEventListener('pointerup',()=>touch[action]=false);el.addEventListener('pointercancel',()=>{touch[action]=false;sim.clearActions();});}
function collectInput(index){
  if(paused||countRemaining>0||sim.phase==='ended'||document.querySelector('dialog[open]'))return {};
  const second=index===1&&activeMode==='local';let dx=0,dz=0,act=false,jump=false,dash=false,drop=false;
  if(second){dx=Number(keys.has('ArrowRight'))-Number(keys.has('ArrowLeft'));dz=Number(keys.has('ArrowDown'))-Number(keys.has('ArrowUp'));act=keys.has('KeyL');jump=keys.has('KeyK');dash=keys.has('KeyJ');drop=keys.has('KeyI');}
  else{dx=Number(keys.has('KeyD'))-Number(keys.has('KeyA'))+touch.x;dz=Number(keys.has('KeyS'))-Number(keys.has('KeyW'))+touch.y;act=keys.has('KeyE')||mouseAct||touch.act;jump=keys.has('Space')||touch.jump;dash=keys.has('ShiftLeft')||keys.has('ShiftRight')||touch.dash;drop=keys.has('KeyQ');}
  let ax=0,az=0;const p=sim.players[index];
  if(!second&&mouseAim&&p){raycaster.setFromCamera(pointer,camera);if(raycaster.ray.intersectPlane(groundPlane,aimPoint)){ax=aimPoint.x-p.body.position.x;az=aimPoint.z-p.body.position.z;const l=Math.hypot(ax,az);if(l>.1){ax/=l;az/=l;}}}
  const pads=navigator.getGamepads?.()||[];const pad=activeMode==='local'?pads[index===1?0:1]:pads[0];
  if(pad?.connected){const px=Math.abs(pad.axes[0])>.15?pad.axes[0]:0,pz=Math.abs(pad.axes[1])>.15?pad.axes[1]:0;dx+=px;dz+=pz;act=act||pad.buttons[2]?.pressed;jump=jump||pad.buttons[0]?.pressed;dash=dash||pad.buttons[5]?.pressed;drop=drop||pad.buttons[1]?.pressed;if(Math.hypot(pad.axes[2]||0,pad.axes[3]||0)>.2){const x=pad.axes[2],z=pad.axes[3];ax=x*.824+z*.566;az=-x*.566+z*.824;mouseAim=false;}}
  const l=Math.hypot(dx,dz);if(l>1){dx/=l;dz/=l;}return cleanInput({mx:dx*.824+dz*.566,mz:-dx*.566+dz*.824,ax,az,act,jump,dash,drop});
}

function syncActors(dt,immediate=false){
  const alpha=immediate?1:1-Math.exp(-dt*(networkRole==='guest'?20:32));
  for(const item of sim.props){const view=propViews[item.id];if(!view)continue;const b=item.body;view.mesh.position.lerp(b.position,alpha);rotationTarget.copy(b.quaternion);view.mesh.quaternion.slerp(rotationTarget,alpha);let scale=1;if(item.delivered)scale=Math.max(0,1-(sim.elapsed-item.landedAt)/.55);view.mesh.scale.setScalar(scale);view.mesh.visible=item.respawn<=0&&scale>.01;view.shadow.visible=view.mesh.visible&&item.carrier===null&&b.position.y<6&&b.position.y>-.5;const deck=b.position.z>8.4&&b.position.z<13.6&&Math.abs(b.position.x)<5.6;view.shadow.position.set(b.position.x,deck?-.77:.052,b.position.z);view.shadow.scale.setScalar(1/(1+Math.max(0,b.position.y-.5)*.15));}
  for(const p of sim.players){const view=playerViews[p.id];if(!view)continue;const b=p.body;const speed=Math.hypot(b.velocity.x,b.velocity.z);const walking=gameActive&&speed>.3&&sim.phase!=='ended';const angle=Math.atan2(p.face.x,p.face.z);let diff=((angle-view.angle+Math.PI*3)%(Math.PI*2))-Math.PI;view.angle+=diff*Math.min(1,dt*18);view.mesh.rotation.y=view.angle;
    const bob=walking?Math.abs(Math.sin(p.steps*2.2))*.045:Math.sin(clock*2.1+p.id)*.025;view.mesh.position.lerp(new THREE.Vector3(b.position.x,b.position.y-.81+bob,b.position.z),alpha);view.shadow.position.set(b.position.x,b.position.z>8.4?-.76:.056,b.position.z);view.shadow.visible=b.position.y<6&&b.position.y>-.4;view.shadow.scale.setScalar(1/(1+Math.max(0,b.position.y-.85)*.25));
    const limbs=view.mesh.userData;const swing=walking?Math.sin(p.steps*2.3)*.7:0;limbs.leftLeg.rotation.x=swing;limbs.rightLeg.rotation.x=-swing;limbs.leftArm.rotation.x=p.carry!==null?-2.55:-swing*.75;limbs.rightArm.rotation.x=p.carry!==null?-2.55:swing*.75;limbs.body.rotation.z=walking?Math.sin(p.steps*2.3)*.025:0;limbs.head.rotation.x=p.charging?-.15:0;
    const pt=project(view.mesh.position.x,view.mesh.position.y+2.3,view.mesh.position.z);const tag=playerTags[p.id];tag.style.left=pt.x+'px';tag.style.top=pt.y+'px';tag.hidden=!gameActive||sim.phase==='ended';
  }
  for(let i=0;i<art.glass.length;i++)art.glass[i].mesh.visible=!sim.glass[i]?.broken;
}
function updateAim(){
  const localId=networkRole==='guest'?1:0,p=sim.players[localId];
  if(!gameActive||!p||sim.phase==='ended'||countRemaining>0||paused){selectRing.visible=false;arcLine.visible=false;landingRing.visible=false;$('context-hint').hidden=true;$('charge-hud').hidden=true;return;}
  const nearest=p.carry===null?sim.nearest(p):null;selectRing.visible=!!nearest;
  if(nearest){selectRing.position.set(nearest.body.position.x,.07,nearest.body.position.z);selectRing.scale.setScalar(1+Math.sin(clock*4)*.05);}
  const point=project(p.body.position.x,p.body.position.y-.3,p.body.position.z);const hint=$('context-hint');hint.style.left=point.x+'px';hint.style.top=(point.y+32)+'px';hint.hidden=touchDevice||(!nearest&&p.carry===null);
  if(nearest)hint.textContent='E · '+CATALOG[nearest.type].name;else if(p.carry!==null)hint.textContent=p.charging?'Släpp för att kasta':'Håll E → släpp';
  $('touch-grab-label').textContent=p.carry!==null?'KASTA':'PLOCKA';$('touch-grab').firstElementChild.textContent=p.carry!==null?'↗':'✋';
  $('charge-hud').hidden=p.carry===null;$('charge-fill').style.transform=`scaleX(${p.charge})`;$('charge-label').textContent=p.charging?'Släpp när siktet når den gröna lastytan':'Håll greppknappen för att ladda';
  arcLine.visible=landingRing.visible=p.carry!==null;if(p.carry===null)return;
  const item=sim.props[p.carry],pos=item.body.position;let x=pos.x,y=pos.y,z=pos.z;const charge=p.charge;let vx=p.face.x*(5.2+charge*10.4),vy=4.6+charge*4.2,vz=p.face.z*(5.2+charge*10.4);const array=arcGeometry.attributes.position.array;let n=0,surface=0,hit=false;
  for(let i=0;i<100;i++){array[n*3]=x;array[n*3+1]=y;array[n*3+2]=z;n++;const deck=Math.abs(x)<5.2&&z>8.5&&z<13.5;const inside=Math.abs(x)<12&&z>-8&&z<8;surface=deck?-.8:inside?0:-9;const bottom=CATALOG[item.type].size[1]/2;if(i>0&&y<surface+bottom&&vy<0){hit=true;break;}const t=.035;vy+=sim.world.gravity.y*t;if(sim.config.modifier==='wind')vx+=2.7*t;const damp=Math.pow(.86,t);vx*=damp;vy*=damp;vz*=damp;x+=vx*t;y+=vy*t;z+=vz*t;}
  arcGeometry.setDrawRange(0,n);arcGeometry.attributes.position.needsUpdate=true;arcLine.computeLineDistances();landingRing.position.set(x,surface+.08,z);landingRing.visible=hit&&surface>-8;const onDeck=Math.abs(x)<5&&z>8.5&&z<13.5;landingRing.material.color.setHex(onDeck?0xa4ffb8:0xffd467);arcLine.material.color.setHex(onDeck?0xcaffc7:0xffedb7);landingRing.scale.setScalar(.9+Math.sin(clock*7)*.07);
}
function updateHUD(){
  if(!gameActive)return;$('score').textContent=fmt(sim.score);const remaining=Math.ceil(sim.time);$('timer').textContent=sim.mode==='practice'?'∞':Math.floor(remaining/60)+':'+String(remaining%60).padStart(2,'0');$('timer').parentElement.classList.toggle('urgent',sim.mode!=='practice'&&remaining<=20);$('delivered').textContent=sim.delivered;
  const marks=$('delivery-track').children;for(let i=0;i<marks.length;i++)marks[i].classList.toggle('done',i<sim.delivered);
  $('combo').hidden=sim.combo<2;$('combo-value').textContent='×'+Math.min(4,1+(sim.combo-1)*.5);$('combo-time').style.transform=`scaleX(${sim.comboTime/9})`;
  if(clock>bannerUntil)$('round-banner').style.opacity='0';
}

function closeRoom(){shuttingRoom=true;room?.close();room=null;networkRole=null;remoteInput={};remoteInputAt=0;remoteSequence=-1;inputSequence=0;lastInputSent='';netClock=0;shuttingRoom=false;$('room-setup').hidden=false;$('room-active').hidden=true;$('room-status').textContent='';$('host-button').disabled=false;$('join-form').querySelector('button').disabled=false;}
function roomStatus(message,error=false){$('room-status').textContent=message||'';$('room-status').classList.toggle('error',error);}
function roomPeer(){if(!room)return;$('room-guest').textContent='Kompis ansluten';$('start-online').disabled=networkRole!=='host';$('start-online').textContent=networkRole==='host'?'Börja flytta ↗':'Väntar på värden…';roomStatus('Ni är två. Dags att flytta.');if(networkRole==='host')room.send({type:'lobby',level:selectedLevel});}
function newRoom(){
  closeRoom();room=new RoomConnection({onStatus:msg=>roomStatus(msg),onPeer:roomPeer,onMessage:onNetworkMessage,onClose:()=>{
    if(shuttingRoom)return;remoteInput={};if(sim.players[1]&&networkRole==='host')sim.releasePlayer(1);if(gameActive&&sim.phase!=='ended'){onlineInterrupted=true;pauseGame(false);$('pause-title').textContent='Anslutningen bröts.';$('pause-copy').textContent=networkRole==='host'?'Din kompis lämnade. Du kan fortsätta flytten solo.':'Värden har lämnat. Gå till menyn för att ansluta igen.';$('resume-button').disabled=networkRole==='guest';$('resume-button').firstChild.textContent=networkRole==='host'?'Fortsätt solo ':'Värden är frånkopplad ';$('restart-button').hidden=true;closeDialogs();$('pause-dialog').showModal();}else{roomStatus('Din kompis lämnade rummet.');$('room-guest').textContent='Väntar på en kompis…';$('start-online').disabled=true;}
  },onError:msg=>{roomStatus(msg,true);$('host-button').disabled=false;$('join-form').querySelector('button').disabled=false;}});return room;
}
function showOnline(){if(!$('online-dialog').open)showDialog('online-dialog');}
function showActiveRoom(){if(!room)return;$('room-setup').hidden=true;$('room-active').hidden=false;$('room-code').textContent=room.code;$('room-guest').textContent=room.connected?'Kompis ansluten':'Väntar på en kompis…';$('start-online').disabled=!room.connected||networkRole!=='host';$('start-online').textContent=networkRole==='guest'?'Väntar på värden…':room.connected?'Börja flytta ↗':'Väntar på spelare…';}
function safeStart(d){return d&&Number.isInteger(d.level)&&d.level>=0&&d.level<6&&Number.isFinite(d.seed)&&['shift','daily','practice'].includes(d.mode)&&d.players===2&&(d.mode!=='daily'||validDailyDate(d.dailyDate));}
function validResult(r){
  if(!r||typeof r!=='object'||r.level!==sim.level||r.mode!==sim.mode||r.seed!==sim.seed||r.total!==sim.props.length||typeof r.won!=='boolean')return false;
  const bounded=(value,min,max,integer=false)=>Number.isFinite(value)&&value>=min&&value<=max&&(!integer||Number.isInteger(value));
  return bounded(r.score,0,1e8,true)&&bounded(r.stars,0,3,true)&&bounded(r.delivered,0,r.total,true)&&bounded(r.timeBonus,0,10000,true)&&bounded(r.coins,0,10000,true)&&bounded(r.maxCombo,0,r.total,true)&&bounded(r.longest,0,1e4)&&bounded(r.lost,0,1e6,true)&&bounded(r.falls,0,1e6,true)&&r.won===(r.delivered>=sim.config.quota);
}
function validSnapshot(s){
  if(!s||!['ready','playing','paused','ended'].includes(s.phase)||!Array.isArray(s.players)||s.players.length!==2||!Array.isArray(s.props)||s.props.length!==sim.props.length)return false;
  const vector=(v,n)=>Array.isArray(v)&&v.length===n&&v.every(x=>Number.isFinite(x)&&Math.abs(x)<1e5);
  const count=sim.props.length;
  if(!['time','elapsed','score','delivered','combo','comboTime','maxCombo','totalThrows','lost','falls','longest'].every(k=>Number.isFinite(s[k])&&s[k]>=0&&s[k]<1e8)||!Number.isInteger(s.delivered)||s.delivered>count||s.combo>count||s.maxCombo>count)return false;
  const playersValid=s.players.every((p,i)=>p&&p.id===i&&vector(p.p,3)&&vector(p.v,3)&&p.face&&Number.isFinite(p.face.x)&&Math.abs(p.face.x)<=1.001&&Number.isFinite(p.face.z)&&Math.abs(p.face.z)<=1.001&&(p.carry===null||Number.isInteger(p.carry)&&p.carry>=0&&p.carry<count)&&Number.isFinite(p.charge)&&p.charge>=0&&p.charge<=1&&Number.isFinite(p.cooldown)&&p.cooldown>=0&&Number.isFinite(p.steps)&&p.steps>=0&&p.steps<1e8&&typeof p.charging==='boolean'&&typeof p.grounded==='boolean');
  const propsValid=s.props.every((p,i)=>p&&p.id===i&&vector(p.p,3)&&vector(p.q,4)&&Math.abs(Math.hypot(...p.q)-1)<.02&&(p.carrier===null||p.carrier===0||p.carrier===1)&&typeof p.delivered==='boolean'&&Number.isFinite(p.respawn)&&p.respawn>=0&&Number.isFinite(p.landedAt)&&p.landedAt>=0);
  return playersValid&&propsValid&&(s.phase!=='ended'||validResult(s.result));
}
function onNetworkMessage(data){
  if(!data||!room)return;
  if(networkRole==='host'){if(data.type==='input'&&data.roundId===roundId&&Number.isSafeInteger(data.seq)&&data.seq>remoteSequence){remoteSequence=data.seq;remoteInput=cleanInput(data.input);remoteInputAt=performance.now();}return;}
  if(data.type==='start'&&safeStart(data.params)&&typeof data.roundId==='string'){prepareRound({...data.params,roundId:data.roundId},true);return;}
  if(data.type==='lobby'&&Number.isInteger(data.level)&&data.level>=0&&data.level<6){selectedLevel=data.level;return;}
  if(data.roundId!==roundId)return;
  if(data.type==='state'&&validSnapshot(data)){lastSnapshot=data;applySnapshot(data);return;}
  if(data.type==='pause'){paused=data.paused===true;if(paused){banner('Värden har pausat flytten.',60);sim.phase='paused';}else{sim.phase='playing';banner('Nu kör vi igen.',2);}return;}
  if(data.type==='event'&&data.event&&['pickup','throw','jump','dash','impact','glass','score','fall','lost','restore','end'].includes(data.event.type)){
    const e=data.event;if(e.type==='end'){if(validResult(e.result))handleEvent(e);}
    else if(['pickup','throw','jump','impact','lost'].includes(e.type)||Array.isArray(e.pos)&&e.pos.length===3&&e.pos.every(Number.isFinite))handleEvent(e);
  }
}
function applySnapshot(s){
  for(const k of ['time','elapsed','score','delivered','combo','comboTime','maxCombo','totalThrows','lost','falls','longest'])if(Number.isFinite(s[k]))sim[k]=s[k];
  if(['ready','playing','paused','ended'].includes(s.phase))sim.phase=s.phase;
  if(s.phase==='playing'&&!guestStarted){guestStarted=true;countRemaining=0;$('countdown').hidden=true;}
  for(let i=0;i<2;i++){const p=sim.players[i],d=s.players[i];p.body.position.set(...d.p);p.body.velocity.set(...d.v);p.face={x:d.face.x,z:d.face.z};p.carry=d.carry;p.charge=clamp(Number(d.charge)||0,0,1);p.charging=d.charging===true;p.cooldown=d.cooldown;p.grounded=d.grounded;p.steps=Number(d.steps)||0;}
  for(let i=0;i<s.props.length;i++){const p=sim.props[i],d=s.props[i];p.body.position.set(...d.p);p.body.quaternion.set(...d.q);p.carrier=d.carrier;p.delivered=d.delivered===true;p.respawn=Number(d.respawn)||0;p.landedAt=Number(d.landedAt)||0;}
  if(Array.isArray(s.glass))s.glass.forEach((broken,i)=>{if(sim.glass[i])sim.glass[i].broken=broken===true;});
  if(s.phase==='ended'&&s.result&&!awarded)endRound(s.result);
}

// Menus use native dialogs for focus management and keyboard dismissal.
for(const b of document.querySelectorAll('[data-mode]'))b.addEventListener('click',()=>{audio.unlock();audio.play('click');selectedMode=b.dataset.mode;for(const button of document.querySelectorAll('[data-mode]')){button.classList.toggle('selected',button===b);button.setAttribute('aria-pressed',button===b);}if(selectedMode==='online')showOnline();else{closeRoom();setupMenuScene();}refreshMenu();});
$('play-button').addEventListener('click',()=>startRound(inviteDaily?'daily':'shift',selectedLevel,false,inviteDailyDate));$('daily-button').addEventListener('click',()=>startRound('daily'));$('practice-button').addEventListener('click',()=>{if(selectedMode==='online'){toast('Öva solo eller tillsammans på samma skärm.');return;}startRound('practice',0);});
$('brand').addEventListener('click',()=>{if(gameActive&&sim.phase!=='ended')pauseGame();else toMenu();});
$('help-button').addEventListener('click',()=>showDialog('help-dialog'));$('settings-button').addEventListener('click',()=>showDialog('settings-dialog'));$('pause-button').addEventListener('click',()=>pauseGame());
for(const b of document.querySelectorAll('[data-close]'))b.addEventListener('click',()=>b.closest('dialog').close());
for(const d of document.querySelectorAll('dialog')){d.addEventListener('close',()=>{if(gameActive&&paused&&!onlineInterrupted&&d.id!=='pause-dialog'&&!document.querySelector('dialog[open]'))resumeGame();});d.addEventListener('cancel',e=>{if(d.id==='pause-dialog'){e.preventDefault();if(!onlineInterrupted||networkRole==='host')resumeGame();}});}
$('resume-button').addEventListener('click',resumeGame);$('restart-button').addEventListener('click',()=>{closeDialogs();if(networkRole!=='guest')startRound(sim.mode,sim.level,true);});$('quit-button').addEventListener('click',toMenu);$('result-menu').addEventListener('click',toMenu);
$('replay-button').addEventListener('click',()=>startRound(sim.mode,sim.level,true));$('next-button').addEventListener('click',()=>{selectedLevel=Math.min(5,sim.level+1);startRound('shift',selectedLevel);});
$('sound-button').addEventListener('click',()=>{audio.unlock();profile.settings.sound=!profile.settings.sound;audio.setEnabled(profile.settings.sound);saveProfile();refreshMenu();});
for(const [id,key] of [['sound-setting','sound'],['music-setting','music'],['motion-setting','motion']])$(id).addEventListener('change',()=>{profile.settings[key]=$(id).checked;audio.unlock();audio.setEnabled(profile.settings.sound);audio.setMusic(profile.settings.music);saveProfile();applyQuality();refreshMenu();});
$('quality-setting').addEventListener('change',()=>{profile.settings.quality=$('quality-setting').value;applyQuality();saveProfile();});
$('fullscreen-button').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{toast('Helskärm stöds inte i den här webbläsaren.');}});
$('level-button').addEventListener('click',()=>{$('levels-list').replaceChildren(...FLOORS.map((f,i)=>{const row=document.createElement('button');row.className='level-row'+(i===selectedLevel?' chosen':'');row.disabled=i>profile.unlocked;row.innerHTML='<span class="level-number">'+f.floor+'</span><span><strong>'+f.name+'</strong><small>'+f.label+'</small></span><span>'+(i>profile.unlocked?'LÅST':'★'.repeat(profile.stars[i])+'☆'.repeat(3-profile.stars[i]))+'</span>';row.addEventListener('click',()=>{selectedLevel=i;$('levels-dialog').close();setupMenuScene();refreshMenu();});return row;}));showDialog('levels-dialog');});
function refreshWardrobe(){$('wardrobe-coins').textContent=fmt(profile.coins);$('wardrobe-list').replaceChildren(...UNIFORMS.map((s,i)=>{const b=document.createElement('button');b.className='uniform'+(profile.skin===i?' active':'');b.style.setProperty('--swatch','#'+s.color.toString(16).padStart(6,'0'));b.innerHTML='<div class="uniform-avatar"></div><strong>'+s.name+'</strong><small>'+(profile.skin===i?'Vald':profile.owned.includes(i)?'Välj':'✦ '+s.price)+'</small>';b.addEventListener('click',()=>{if(!profile.owned.includes(i)){if(profile.coins<s.price){toast('Du behöver '+(s.price-profile.coins)+' flyttmynt till.');return;}profile.coins-=s.price;profile.owned.push(i);}profile.skin=i;saveProfile();refreshWardrobe();refreshMenu();if(!gameActive)setupMenuScene();});return b;}));}
$('wardrobe-button').addEventListener('click',()=>{refreshWardrobe();showDialog('wardrobe-dialog');});
$('host-button').addEventListener('click',async()=>{audio.unlock();const connection=newRoom();networkRole='host';$('host-button').disabled=true;roomStatus('Skapar ett privat rum…');try{await connection.host();if(room===connection)showActiveRoom();}catch(e){roomStatus(e.message,true);$('host-button').disabled=false;}});
$('join-form').addEventListener('submit',async e=>{e.preventDefault();audio.unlock();const code=$('room-input').value.toUpperCase().replace(/[^A-Z0-9]/g,'');if(code.length!==6){roomStatus('Rumskoden ska ha sex tecken.',true);return;}const connection=newRoom();networkRole='guest';$('join-form').querySelector('button').disabled=true;try{await connection.join(code);if(room===connection){showActiveRoom();roomPeer();}}catch(error){roomStatus(error.message,true);$('join-form').querySelector('button').disabled=false;}});
$('start-online').addEventListener('click',()=>{if(room?.connected&&networkRole==='host'){selectedMode='online';startRound();}});$('leave-room').addEventListener('click',()=>{closeRoom();roomStatus('Du har lämnat rummet.');});
async function copyText(text,success){try{await navigator.clipboard.writeText(text);toast(success);}catch{const area=document.createElement('textarea');area.value=text;area.style.position='fixed';area.style.opacity='0';document.body.append(area);area.select();try{document.execCommand('copy');toast(success);}catch{toast(text);}area.remove();}}
$('copy-room').addEventListener('click',()=>{if(!room)return;const url=new URL(location.href);url.search='';url.searchParams.set('room',room.code);copyText(url.href+'\nRumskod: '+room.code,'Inbjudan kopierad.');});
$('share-score').addEventListener('click',()=>{if(!currentResult)return;const r=currentResult;const url=new URL(location.href);url.search='';if(r.mode==='daily'){url.searchParams.set('daily','1');url.searchParams.set('day',r.dailyDate);}copyText(`Jag fick ${fmt(r.score)} poäng och ${r.delivered}/${r.total} leveranser i Penthouse Panic${r.mode==='daily'?' – dagens flytt':''}. Slå det.\n${url.href}`,'Utmaningen är kopierad. Skicka den till en kompis.');});

// One render loop, capped simulation delta, no per-frame DOM construction.
let lastTime=performance.now(),frameCount=0,frameCost=0,qualityAdjusted=false,slowest=0;
function frame(now){
  requestAnimationFrame(frame);const raw=(now-lastTime)/1000;lastTime=now;const dt=Math.min(.05,Math.max(.001,raw));clock+=dt;
  if(gameActive&&countRemaining>0&&!paused){countRemaining=Math.max(0,countRemaining-dt);const number=Math.ceil(countRemaining);if(number!==lastCount&&number>0){lastCount=number;$('count-number').textContent=number;const el=$('count-number');el.style.animation='none';void el.offsetWidth;el.style.animation='';audio.play('countdown');}if(countRemaining===0){$('countdown').hidden=true;if(networkRole!=='guest')sim.start();audio.play('click');}}
  if(gameActive&&sim.phase==='playing'&&!paused){
    if(networkRole==='guest'){const input=collectInput(1),serialized=JSON.stringify(input);netClock+=dt;if(netClock>=1/30||serialized!==lastInputSent){room?.send({type:'input',roundId,seq:++inputSequence,input});netClock=0;lastInputSent=serialized;}}
    else{const inputs=[collectInput(0)];if(sim.players.length===2)inputs.push(activeMode==='online'?(now-remoteInputAt<500?remoteInput:{}):collectInput(1));sim.step(dt,inputs);}
  }
  if(networkRole==='host'&&room?.connected&&gameActive){netClock+=dt;if(netClock>=1/20){room.send({...sim.snapshot(),roundId});netClock=0;}}
  const targetMobile=aspect<.8;
  if(gameActive){desiredTarget.set(0,0,2.1);if(targetMobile){const p=sim.players[networkRole==='guest'?1:0];if(p)desiredTarget.set(p.body.position.x*.4,0,3.0+p.body.position.z*.18);}}
  else if(targetMobile){desiredTarget.set(0,-8,-3.3);}else desiredTarget.set(-7.0,0,1.9);
  cameraTarget.lerp(desiredTarget,1-Math.exp(-dt*3));camera.position.copy(cameraTarget).add(cameraBase);cameraShake*=Math.exp(-dt*14);if(!profile.settings.motion&&cameraShake>.005){camera.position.x+=(Math.random()-.5)*cameraShake;camera.position.y+=(Math.random()-.5)*cameraShake;}camera.lookAt(cameraTarget);
  art.update(dt,clock,sim.level);syncActors(dt);updateAim();updateHUD();
  for(let i=particles.length-1;i>=0;i--){particles[i].life-=dt;if(particles[i].life<=0)particles.splice(i,1);}
  for(let i=0;i<particles.length;i++){const p=particles[i];p.v.y-=9*dt;p.p.addScaledVector(p.v,dt);p.r.x+=dt*5;p.r.z+=dt*3;dummy.position.copy(p.p);dummy.rotation.set(p.r.x,p.r.y,p.r.z);dummy.scale.setScalar(p.s*Math.min(1,p.life*3));dummy.updateMatrix();particleMesh.setMatrixAt(i,dummy.matrix);particleMesh.setColorAt(i,p.color);}particleMesh.count=particles.length;particleMesh.instanceMatrix.needsUpdate=true;if(particleMesh.instanceColor)particleMesh.instanceColor.needsUpdate=true;
  audio.setIntensity(gameActive&&sim.phase==='playing'?clamp(sim.combo*.1+(sim.time<25?.35:0),0,1):0);audio.update(dt);renderer.render(scene,camera);
  // Adapt once, only after sustained low frame rate on the automatic setting.
  if(frameCount<300&&!document.hidden&&gameActive){frameCount++;frameCost+=raw;if(frameCount===300&&frameCost/300>.032&&profile.settings.quality==='auto'&&!qualityAdjusted){qualityAdjusted=true;renderer.setPixelRatio(Math.min(devicePixelRatio,1));renderer.shadowMap.enabled=false;}}
}
setupMenuScene();refreshMenu();resize();$('player-labels').hidden=true;requestAnimationFrame(frame);
requestAnimationFrame(()=>{window.__panicReady=true;$('loading').style.opacity='0';setTimeout(()=>$('loading').hidden=true,550);});
const inviteCode=new URL(location.href).searchParams.get('room');if(inviteCode){selectedMode='online';$('room-input').value=inviteCode.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6);refreshMenu();setTimeout(showOnline,650);}
canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();if(gameActive)pauseGame();toast('Grafiken avbröts. Ladda om sidan för att fortsätta.');});
