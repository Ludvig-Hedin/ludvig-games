import * as THREE from '../vendor/three.module.js';
import {createArena} from './world.js';
import {createViewWeapon,createOperator,GameAudio} from './arsenal.js';
import {Simulation,WEAPONS,clamp,moveActor} from './simulation.js';
import {Multiplayer} from './network.js';

const $=id=>document.getElementById(id),show=id=>$(id).classList.remove('hidden'),hide=id=>$(id).classList.add('hidden');
const touch=matchMedia('(pointer:coarse)').matches||navigator.maxTouchPoints>1||new URLSearchParams(location.search).get('touch')==='1';
if(touch){document.body.classList.add('touch');$('menu-controls').textContent='LEFT THUMB MOVE · RIGHT THUMB AIM';}
const defaults={difficulty:'easy',botCount:5,name:'OPERATOR',sensitivity:75,volume:70,graphics:'auto',fov:80};
let prefs={...defaults};try{prefs={...defaults,...JSON.parse(localStorage.getItem('breach.preferences')||'{}')};}catch{}
function savePrefs(){try{localStorage.setItem('breach.preferences',JSON.stringify(prefs));}catch{}}
let renderer,scene,camera,arena,viewWeapon,audio=new GameAudio();
let phase='menu',paused=false,sim=null,net=null,localId='local',remoteSnapshot=null,predicted=null,networkRoster=[];
let yaw=0,pitch=0,aimBlend=0,recoil=0,cameraKick=0,hitTime=0,hurtTime=0,eliminationTime=0,announcementTime=0,stepTime=0;
let frameTime=performance.now(),accumulator=0,worldTime=0,netTime=0,hudTime=0,shotEvents=[],endedShown=false,toastTimer;
let settingsReturn='menu',pointerFallback=false,dragLooking=false,connectedAt=0,lastGuestSnapshot=0;
let lastInput={};const control={forward:0,strafe:0,fire:false,aim:false,sprint:false,crouch:false,jump:false,reload:false,weapon:0};
const keys=new Set(),models=new Map(),tracers=[],marks=[],particles=[];
const guestInputs=new Map();
const v1=new THREE.Vector3(),v2=new THREE.Vector3();
let fpsFrames=0,fpsTime=0,pixelRatio=1,qualityLowered=false;
const tempColor=new THREE.Color();

function toast(message){clearTimeout(toastTimer);$('toast').textContent=message;$('toast').classList.add('show');toastTimer=setTimeout(()=>$('toast').classList.remove('show'),3200);}
function resetInput(){keys.clear();Object.assign(control,{forward:0,strafe:0,fire:false,aim:false,sprint:false,crouch:false,jump:false,reload:false});dragLooking=false;document.querySelectorAll('#touch-controls .active').forEach(el=>el.classList.remove('active'));$('move-stick').style.transform='translate(-50%,-50%)';}
function currentPlayers(){return sim?[...sim.players.values()]:(remoteSnapshot?.players||[]);}
function me(){return sim?.players.get(localId)||predicted||remoteSnapshot?.players.find(p=>p.id===localId);}
function stateTime(){return sim?.time??remoteSnapshot?.time??0;}
function gameEnded(){return sim?.ended??remoteSnapshot?.ended??false;}
function soundGesture(){audio.unlock();audio.setVolume(prefs.volume/100);audio.ambient();}

async function init(){
  try{
    renderer=new THREE.WebGLRenderer({canvas:$('viewport'),antialias:!touch,powerPreference:'high-performance'});
    renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.08;
    renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.shadowMap.autoUpdate=false;
    scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(prefs.fov,innerWidth/innerHeight,.04,420);camera.rotation.order='YXZ';scene.add(camera);
    arena=createArena(THREE,scene,{mobile:touch,quality:prefs.graphics==='performance'?'low':'high'});
    scene.traverse(o=>{if(o.isLight)o.layers.enable(1);});
    viewWeapon=createViewWeapon(THREE,camera);viewWeapon.group.traverse(o=>o.layers.set(1));viewWeapon.group.visible=false;
    const fill=new THREE.HemisphereLight(0xdfe8e4,0x424b3f,1.1);fill.layers.set(1);scene.add(fill);
    createEffects();applyGraphics();resize();bindUI();bindInput();
    camera.position.set(23,12,27);camera.lookAt(-7,1.5,-4);renderer.shadowMap.needsUpdate=true;renderer.render(scene,camera);
    hide('loading');show('menu');requestAnimationFrame(frame);
    const invite=new URLSearchParams(location.search).get('room');if(invite){$('room-code').value=invite.slice(0,6);openLobby();toast('Enter your callsign and join the room.');}
    if(touch&&innerHeight>innerWidth)setTimeout(()=>toast('Turn your phone sideways for a wider view.'),1600);
  }catch(error){
    console.error(error);hide('loading');show('menu');bindUI();
    $('play-solo').disabled=true;$('start-room').disabled=true;
    const notice=document.createElement('div');notice.className='graphics-unavailable';notice.textContent='3D graphics are unavailable in this browser. Open in Safari or Chrome with WebGL 2 enabled to play.';document.body.append(notice);
  }
}
function applyGraphics(){
  if(!renderer)return;
  pixelRatio=prefs.graphics==='performance'?.85:prefs.graphics==='high'?Math.min(devicePixelRatio,1.75):Math.min(devicePixelRatio,touch?1.25:1.5);
  renderer.setPixelRatio(pixelRatio);renderer.shadowMap.enabled=prefs.graphics!=='performance';renderer.shadowMap.needsUpdate=true;qualityLowered=false;resize();
}
function resize(){if(!renderer)return;renderer.setSize(innerWidth,innerHeight,false);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();}
window.addEventListener('resize',resize);

function createEffects(){
  for(let i=0;i<32;i++){const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(new Float32Array(6),3));const mat=new THREE.LineBasicMaterial({color:0xffe7af,transparent:true,opacity:0,depthWrite:false});const line=new THREE.Line(geo,mat);line.frustumCulled=false;line.visible=false;scene.add(line);tracers.push({line,life:0});}
  const geo=new THREE.SphereGeometry(.035,4,3),material=new THREE.MeshBasicMaterial({color:0xffc471});
  for(let i=0;i<100;i++){const mesh=new THREE.Mesh(geo,material);mesh.visible=false;scene.add(mesh);particles.push({mesh,life:0,vx:0,vy:0,vz:0});}
  const markGeo=new THREE.CircleGeometry(.046,7),markMat=new THREE.MeshBasicMaterial({color:0x101917,transparent:true,opacity:.72,depthWrite:false,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-3});
  for(let i=0;i<55;i++){const mesh=new THREE.Mesh(markGeo,markMat);mesh.visible=false;mesh.renderOrder=3;scene.add(mesh);marks.push({mesh,life:0});}
}
function effectsShot(e){
  const t=tracers.find(t=>t.life<=0)||tracers[0];let from=e.from;
  if(e.id===localId&&phase==='playing'){viewWeapon.muzzle.getWorldPosition(v1);from={x:v1.x,y:v1.y,z:v1.z};}
  const positions=t.line.geometry.attributes.position;positions.setXYZ(0,from.x,from.y-.04,from.z);positions.setXYZ(1,e.to.x,e.to.y,e.to.z);positions.needsUpdate=true;t.life=.055;t.line.material.opacity=.65;t.line.visible=true;
  if(!e.hit){for(let j=0;j<5;j++){const p=particles.find(p=>p.life<=0);if(!p)break;p.life=.2+Math.random()*.17;p.mesh.visible=true;p.mesh.position.set(e.to.x,e.to.y,e.to.z);p.vx=(Math.random()-.5)*3;p.vy=Math.random()*2;p.vz=(Math.random()-.5)*3;}
    const m=marks.find(m=>m.life<=0)||marks.reduce((a,b)=>a.life<b.life?a:b);m.mesh.position.set(e.to.x,e.to.y,e.to.z);v1.set(e.from.x-e.to.x,e.from.y-e.to.y,e.from.z-e.to.z).normalize();m.mesh.position.addScaledVector(v1,.018);m.mesh.lookAt(e.to.x+v1.x,e.to.y+v1.y,e.to.z+v1.z);m.mesh.visible=true;m.life=18;
  }
}
function processEvents(events){
  for(const e of events){
    if(e.type==='shot'){
      effectsShot(e);const self=e.id===localId,local=me(),distance=local?Math.hypot(local.x-e.from.x,local.z-e.from.z):15;audio.shot(e.weapon,!self,distance);
      if(self){recoil=1;cameraKick=Math.min(.04,cameraKick+.012);pitch=clamp(pitch+(control.aim?.003:.008),-1.4,1.4);if(e.hit){hitTime=.16;$('hitmarker').classList.toggle('headshot',e.headshot);audio.hit(e.headshot);}}
      const model=models.get(e.id);if(model)model.shooting=.09;
    }else if(e.type==='damage'&&e.id===localId){
      hurtTime=.65;audio.hurt();const attacker=currentPlayers().find(p=>p.id===e.by),local=me();if(attacker&&local){const a=Math.atan2(-(attacker.x-local.x),-(attacker.z-local.z));$('damage-direction').style.transform=`rotate(${-(a-yaw)}rad)`;}
    }else if(e.type==='kill'){
      const row=document.createElement('div');row.className='kill-line'+(e.id===localId?' mine':'');const k=document.createElement('span'),sep=document.createElement('b'),v=document.createElement('span');k.textContent=e.killerName;sep.textContent=e.headshot?'◆':'—';v.textContent=e.victimName;row.append(k,sep,v);$('killfeed').prepend(row);while($('killfeed').children.length>4)$('killfeed').lastChild.remove();setTimeout(()=>row.remove(),5000);
      if(e.id===localId){audio.kill();eliminationTime=1.8;$('elimination-name').textContent=e.victimName;$('elimination-label').textContent=e.headshot?'HEADSHOT':'ELIMINATION';$('elimination-points').textContent=e.headshot?'+150':'+100';}
      if(e.victim===localId){$('killed-by').textContent=`ELIMINATED BY ${e.killerName}`;resetInput();}
    }else if(e.type==='reload'&&e.id===localId)audio.reload();
    else if(e.type==='spawn'&&e.id===localId){const p=me();if(p){yaw=p.yaw;pitch=p.pitch||0;}resetInput();hurtTime=0;recoil=0;}
  }
}
function updateEffects(dt){
  for(const t of tracers){if(t.life>0){t.life-=dt;t.line.material.opacity=Math.max(0,t.life/.055)*.6;}else{t.line.material.opacity=0;t.line.visible=false;}}
  for(const p of particles)if(p.life>0){p.life-=dt;p.vy-=7*dt;p.mesh.position.x+=p.vx*dt;p.mesh.position.y+=p.vy*dt;p.mesh.position.z+=p.vz*dt;p.mesh.visible=p.life>0;}
  for(const m of marks)if(m.life>0){m.life-=dt;if(m.life<=0)m.mesh.visible=false;}
}

function updateModels(dt){
  const list=currentPlayers(),ids=new Set(list.map(p=>p.id));
  for(const [id,entry] of models)if(!ids.has(id)){scene.remove(entry.group);entry.dispose?.();models.delete(id);}
  for(const p of list){if(p.id===localId)continue;let model=models.get(p.id);if(!model){model=createOperator(THREE,{color:p.bot?0xba654e:0xd0b46e});model.group.position.set(p.x,p.y||0,p.z);model.shooting=0;models.set(p.id,model);scene.add(model.group);}
    model.group.visible=phase==='playing';const factor=1-Math.exp(-dt*18);if(model.group.position.distanceTo(v1.set(p.x,p.y||0,p.z))>6)model.group.position.copy(v1);else model.group.position.lerp(v1,factor);
    const dy=Math.atan2(Math.sin(p.yaw-model.group.rotation.y),Math.cos(p.yaw-model.group.rotation.y));model.group.rotation.y+=dy*factor;model.shooting=Math.max(0,model.shooting-dt);model.update({dt,time:worldTime,speed:p.speed||0,dead:p.hp<=0,shooting:model.shooting>0});if(p.crouch&&p.hp>0)model.group.scale.y*=.70;
  }
}
function createSimulation(humanIds=[]){
  sim=new Simulation(arena,{difficulty:prefs.difficulty,botCount:prefs.botCount,limit:20,duration:300});
  sim.addPlayer(localId,prefs.name);for(const p of humanIds)if(p.id!==localId)sim.addPlayer(p.id,p.name);sim.fillBots();
  remoteSnapshot=null;predicted=null;endedShown=false;shotEvents=[];guestInputs.clear();control.weapon=0;const p=me();yaw=p.yaw;pitch=0;sim.drainEvents();
}
function enterGame({guest=false}={}){
  if(!renderer){$('network-status').textContent='The match is ready, but this browser cannot render WebGL 2. Open the game in a supported browser.';return;}
  phase='playing';paused=false;endedShown=false;resetInput();announcementTime=3.5;recoil=0;hurtTime=0;hitTime=0;stepTime=0;accumulator=0;
  $('resume').disabled=false;$('resume').textContent='RESUME →';$('resume').onclick=resumeGame;show('quit');show('pause-settings');
  for(const name of ['menu','lobby','pause','settings','scoreboard'])hide(name);show('hud');document.body.classList.add('playing');viewWeapon.group.visible=true;$('killfeed').replaceChildren();
  if(!guest){soundGesture();lockPointer();}else if(!touch){pauseGame('Your room is ready.','Click resume to enter the match.');}
}
function solo(){net?.close();net=null;localId='local';createSimulation();enterGame();}
function quitToMenu(){
  net?.close();net=null;phase='menu';sim=null;remoteSnapshot=null;predicted=null;paused=false;resetInput();document.exitPointerLock?.();
  for(const name of ['hud','pause','settings','scoreboard','lobby'])hide(name);show('menu');document.body.classList.remove('playing');viewWeapon.group.visible=false;for(const model of models.values())model.group.visible=false;
  for(const t of tracers)t.life=0;for(const m of marks){m.life=0;m.mesh.visible=false;}for(const p of particles){p.life=0;p.mesh.visible=false;}
}
function pauseGame(title='Take a breath.',subtitle=net?'The room is still live.':'The fight can wait.'){
  if(phase!=='playing'||gameEnded())return;paused=true;resetInput();$('pause-title').textContent=title;$('pause-subtitle').textContent=subtitle;show('pause');hide('scoreboard');document.exitPointerLock?.();
  if(net&&!net.isHost)net.send({type:'input',input:inputState()});
}
function resumeGame(){if(phase!=='playing')return;hide('pause');paused=false;resetInput();soundGesture();lockPointer();}
function lockPointer(){
  if(touch||document.pointerLockElement===$('viewport'))return;
  if(!$('viewport').requestPointerLock){pointerFallback=true;toast('Drag the view to aim. Click to fire.');return;}
  try{const request=$('viewport').requestPointerLock();request?.catch(()=>{pointerFallback=true;toast('Drag the view to aim. Click to fire.');});}catch{pointerFallback=true;}
}
document.addEventListener('pointerlockchange',()=>{if(document.pointerLockElement)pointerFallback=false;else if(phase==='playing'&&!paused&&!gameEnded()&&!pointerFallback)pauseGame();});
document.addEventListener('pointerlockerror',()=>{pointerFallback=true;});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&phase==='playing'&&!gameEnded())pauseGame();});

function inputState(){
  let forward=control.forward,strafe=control.strafe;
  if(!touch){forward=(keys.has('KeyW')||keys.has('ArrowUp')?1:0)-(keys.has('KeyS')||keys.has('ArrowDown')?1:0);strafe=(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0);}
  const inactive=paused||gameEnded();
  return {forward:inactive?0:forward,strafe:inactive?0:strafe,yaw,pitch,fire:!inactive&&control.fire,aim:!inactive&&control.aim,sprint:!inactive&&(control.sprint||keys.has('ShiftLeft')||keys.has('ShiftRight'))&&!control.aim&&!control.fire,crouch:!inactive&&(control.crouch||keys.has('KeyC')||keys.has('ControlLeft')),jump:!inactive&&(control.jump||keys.has('Space')),reload:!inactive&&(control.reload||keys.has('KeyR')),weapon:control.weapon};
}
function updateSimulation(dt){
  lastInput=inputState();
  if(sim){
    if(net?.isHost)for(const [id,last] of guestInputs){if(performance.now()-last>650){const p=sim.players.get(id);if(p)sim.setInput(id,{yaw:p.yaw,pitch:p.pitch,weapon:p.weapon});}}
    if(!paused||net){sim.setInput(localId,lastInput);accumulator+=dt;let iterations=0;while(accumulator>=1/60&&iterations++<7){sim.update(1/60);accumulator-=1/60;}if(iterations>=7)accumulator=0;const events=sim.drainEvents();processEvents(events);shotEvents.push(...events);}
    if(net?.isHost){netTime+=dt;if(netTime>=.05){netTime=0;net.send({type:'snapshot',snapshot:sim.snapshot(),events:shotEvents.splice(0)});}}
    else shotEvents=[];
  }else if(net){
    netTime+=dt;if(netTime>=.033){netTime=0;net.send({type:'input',input:lastInput});}
    if(predicted&&predicted.hp>0&&!gameEnded()){predicted.yaw=yaw;predicted.pitch=pitch;moveActor(predicted,lastInput,dt,arena.colliders,arena.bounds);predicted.reloadLeft=Math.max(0,predicted.reloadLeft-dt);}
  }
  if(gameEnded()&&!endedShown)finishMatch();
}
function updateCamera(dt){
  const p=me();if(!p)return;
  const live=p.hp>0;const eye=p.crouch?1.08:1.64;
  const bob=live?Math.sin(worldTime*(lastInput.sprint?16:11))*.018*Math.min(1,(p.speed||0)/4)*(1-aimBlend*.8):0;
  camera.position.set(p.x,(p.y||0)+(live?eye:.58)+bob,p.z);
  recoil=Math.max(0,recoil-dt*10);cameraKick*=Math.exp(-dt*15);aimBlend+=(Number(lastInput.aim&&live)-aimBlend)*(1-Math.exp(-dt*15));
  camera.rotation.set(pitch+cameraKick,yaw,live?0:-.09,'YXZ');
  const goalFov=prefs.fov-aimBlend*22+(lastInput.sprint&&p.speed>3?4:0);camera.fov+=(goalFov-camera.fov)*(1-Math.exp(-dt*10));camera.updateProjectionMatrix();
  viewWeapon.group.visible=live;viewWeapon.update({dt,time:worldTime,moving:(p.speed||0)/7,sprinting:lastInput.sprint&&p.speed>3,aim:aimBlend,recoil,reloadProgress:p.reloadLeft>0?1-p.reloadLeft/(p.reloadTotal||1.85):-1,weapon:p.weapon});
  if(camera.aspect<1)viewWeapon.group.position.x*=camera.aspect;
  if(live&&p.speed>1.2&&p.y<.05&&!paused){stepTime+=dt;if(stepTime>(lastInput.sprint?.28:.4)){audio.step();stepTime=0;}}
}
function updateHUD(dt){
  const p=me();if(!p)return;const list=currentPlayers();const time=stateTime(),duration=sim?.duration??remoteSnapshot?.duration??300,remaining=Math.max(0,Math.ceil(duration-time));
  $('your-score').textContent=String(p.kills).padStart(2,'0');$('leader-score').textContent='LEAD '+Math.max(...list.map(p=>p.kills),0);$('match-time').textContent=Math.floor(remaining/60)+':'+String(remaining%60).padStart(2,'0');
  $('health-value').textContent=Math.ceil(p.hp);$('health-bar').style.width=p.hp+'%';$('health-bar').style.background=p.hp<35?'#f48f7a':'#d9f3bd';
  const w=WEAPONS[p.weapon];$('ammo-count').textContent=String(p.ammo[p.weapon]).padStart(2,'0');$('ammo-count').style.color=p.ammo[p.weapon]<6?'#f6b37b':'';$('reserve-count').textContent=p.reserve[p.weapon];$('weapon-name').textContent=w.name;$('weapon-type').textContent=p.weapon?'9 × 19':'5.56 × 45';$('stance-label').textContent=p.invuln>0?'PROTECTED':p.crouch?'CROUCHED':lastInput.sprint?'SPRINTING':'OPERATOR';
  $('reload-prompt').style.opacity=p.ammo[p.weapon]<10?1:.4;$('reload-prompt').textContent=p.reloadLeft>0?'RELOADING':'R   RELOAD';
  $('reload-indicator').style.display=p.reloadLeft>0?'block':'none';$('reload-indicator').style.setProperty('--reload',((1-p.reloadLeft/(p.reloadTotal||1.85))*100)+'%');
  $('crosshair').classList.toggle('aiming',aimBlend>.7);$('crosshair').style.opacity=p.hp>0?1:0;
  hitTime=Math.max(0,hitTime-dt);hurtTime=Math.max(0,hurtTime-dt);eliminationTime=Math.max(0,eliminationTime-dt);announcementTime=Math.max(0,announcementTime-dt);
  $('hitmarker').style.opacity=Math.min(1,hitTime*12);$('elimination').style.opacity=Math.min(1,eliminationTime*3);$('damage-overlay').style.opacity=Math.min(.5,hurtTime*.55+Math.max(0,(30-p.hp)/180));$('damage-direction').style.opacity=Math.min(.8,hurtTime*2);$('match-announcement').style.opacity=announcementTime>0?Math.min(1,announcementTime):0;
  if(p.hp<=0){show('respawn');$('respawn-count').textContent=Math.max(1,Math.ceil(p.deadLeft));}else hide('respawn');
  $('connection-badge').textContent=net?`${net.isHost?'HOST':'ONLINE'} · ${net.roomCode}${net.ping?' · '+net.ping+' ms':''}`:`${prefs.difficulty.toUpperCase()} · ${prefs.botCount} BOTS`;
  drawRadar(list,p,time);if(!$('scoreboard').classList.contains('hidden'))renderScoreRows();
}
function drawRadar(list,p,time){
  const cv=$('minimap'),c=cv.getContext('2d'),b=arena.bounds,w=cv.width,h=cv.height;const px=x=>(x-b.minX)/(b.maxX-b.minX)*w,pz=z=>(z-b.minZ)/(b.maxZ-b.minZ)*h;
  c.clearRect(0,0,w,h);c.fillStyle='#829c8c32';for(const a of arena.colliders)c.fillRect(px(a.minX),pz(a.minZ),px(a.maxX)-px(a.minX),pz(a.maxZ)-pz(a.minZ));
  c.strokeStyle='#bacdb31b';c.lineWidth=1;for(let i=1;i<4;i++){c.beginPath();c.moveTo(w*i/4,0);c.lineTo(w*i/4,h);c.stroke();c.beginPath();c.moveTo(0,h*i/4);c.lineTo(w,h*i/4);c.stroke();}
  for(const a of list){if(a.id===p.id||a.hp<=0)continue;const d=Math.hypot(a.x-p.x,a.z-p.z);if(d>32||(prefs.difficulty==='hard'&&time-a.fireAt>1.2))continue;c.fillStyle=a.bot?'#e68d74':'#e8bd71';c.beginPath();c.arc(px(a.x),pz(a.z),2.3,0,Math.PI*2);c.fill();}
  c.save();c.translate(px(p.x),pz(p.z));c.rotate(-yaw);c.fillStyle='#d6f27a';c.beginPath();c.moveTo(0,-6);c.lineTo(4,4);c.lineTo(0,2);c.lineTo(-4,4);c.closePath();c.fill();c.restore();
}
function renderScoreRows(){
  const list=currentPlayers().sort((a,b)=>b.kills-a.kills||a.deaths-b.deaths),rows=$('score-rows');rows.replaceChildren();for(const p of list){const row=document.createElement('div');row.className='score-row'+(p.id===localId?' you':'');const name=document.createElement('span');name.textContent=p.name;const badge=document.createElement('small');badge.textContent=p.id===localId?'YOU':p.bot?'BOT':'';name.append(badge);row.append(name);for(const val of [p.kills,p.deaths,(p.kills/Math.max(1,p.deaths)).toFixed(1)]){const cell=document.createElement('span');cell.textContent=val;row.append(cell);}rows.append(row);}
}
function finishMatch(){
  endedShown=true;paused=true;resetInput();document.exitPointerLock?.();hide('pause');show('scoreboard');show('end-actions');$('score-eyebrow').textContent='MATCH COMPLETE';const winner=sim?.winner??remoteSnapshot?.winner;$('score-title').textContent=winner===localId?'Victory.':'Match complete.';renderScoreRows();
  $('play-again').textContent=net&&!net.isHost?'WAITING FOR HOST':'PLAY AGAIN ↗';$('play-again').disabled=!!net&&!net.isHost;
  try{const p=me(),best=Number(localStorage.getItem('breach.best')||0);localStorage.setItem('breach.best',Math.max(best,p?.kills||0));}catch{}
}

function openLobby(){hide('menu');show('lobby');$('player-name').value=prefs.name==='OPERATOR'?'':prefs.name;show('lobby-actions');hide('room-details');$('network-status').textContent='The host keeps the room open.';$('network-status').classList.remove('error');}
function setLobbyBusy(busy){$('host-room').disabled=busy;$('join-room').disabled=busy;}
function lobbyRoster(){
  const people=net?.isHost?[{id:localId,name:prefs.name},...Array.from(net.peers.values(),({id,name})=>({id,name}))]:networkRoster;
  $('room-roster').replaceChildren();for(const p of people){const row=document.createElement('div');row.className='room-roster-row';const name=document.createElement('span'),state=document.createElement('span');name.textContent=p.name;state.textContent=p.id===localId?'YOU':'CONNECTED';row.append(name,state);$('room-roster').append(row);}
  if(net?.isHost)net.send({type:'roster',players:people});
}
function buildNetwork(){
  net?.close();networkRoster=[];lastGuestSnapshot=0;const instance=new Multiplayer({
    onStatus:({state,message})=>{if(net!==instance)return;$('network-status').textContent=message;$('network-status').classList.toggle('error',state==='error');},
    onPeerJoin:peer=>{
      if(net!==instance)return;localId=instance.localId||localId;
      lobbyRoster();if(net?.isHost&&sim&&phase==='playing'){sim.addPlayer(peer.id,peer.name);net.send({type:'start',snapshot:sim.snapshot()},peer.id);toast(peer.name+' joined');}
    },
    onPeerLeave:peer=>{if(net!==instance)return;guestInputs.delete(peer.id);if(net?.isHost)sim?.removePlayer(peer.id);lobbyRoster();if(phase==='playing')toast(peer.name+' left');},
    onMessage:(message,from)=>{
      if(net!==instance)return;localId=instance.localId||localId;
      if(!message||typeof message!=='object')return;
      if(net?.isHost){if(message.type==='input'&&sim&&net.peers.has(from)){const i=message.input;if(i&&typeof i==='object'){guestInputs.set(from,performance.now());sim.setInput(from,{forward:clamp(+i.forward||0,-1,1),strafe:clamp(+i.strafe||0,-1,1),yaw:Number.isFinite(i.yaw)?i.yaw:0,pitch:clamp(+i.pitch||0,-1.42,1.42),fire:!!i.fire,aim:!!i.aim,sprint:!!i.sprint,crouch:!!i.crouch,jump:!!i.jump,reload:!!i.reload,weapon:i.weapon===1?1:0});}}}
      else if(message.type==='roster'){networkRoster=Array.isArray(message.players)?message.players:[];lobbyRoster();}
      else if(message.type==='start'||message.type==='snapshot'){
        localId=net.localId||localId;
        const snapshot=message.snapshot;if(!snapshot||!Array.isArray(snapshot.players))return;lastGuestSnapshot=performance.now();remoteSnapshot=snapshot;prefs.difficulty=snapshot.difficulty||prefs.difficulty;
        const own=snapshot.players.find(p=>p.id===localId);if(own){const wasDead=predicted?.hp<=0,spawning=!predicted||(wasDead&&own.hp>0)||message.type==='start';
          if(spawning){predicted={...own,ammo:[...own.ammo],reserve:[...own.reserve],vx:0,vz:0,vy:0};yaw=own.yaw;pitch=own.pitch||0;control.weapon=own.weapon;}
          else{const x=predicted.x,z=predicted.z,y=predicted.y,vx=predicted.vx,vz=predicted.vz,vy=predicted.vy,jumpHeld=predicted.jumpHeld;predicted={...own,vx,vz,vy,jumpHeld};const error=Math.hypot(x-own.x,z-own.z);if(error<3&&own.hp>0){predicted.x=x+(own.x-x)*.35;predicted.z=z+(own.z-z)*.35;predicted.y=y+(own.y-y)*.35;}}
        }
        if(message.type==='start'||phase!=='playing'){sim=null;enterGame({guest:true});}
        processEvents(message.events||[]);
      }
    },
    onDisconnect:reason=>{if(net!==instance)return;if(phase==='playing'){pauseGame('Connection closed.',reason);$('resume').disabled=true;$('resume').textContent='ROOM CLOSED';}else{$('network-status').textContent=reason;$('network-status').classList.add('error');show('lobby-actions');hide('room-details');setLobbyBusy(false);}}
  });net=instance;return net;
}
async function connectRoom(host){
  prefs.name=($('player-name').value.trim()||'OPERATOR').slice(0,16);savePrefs();soundGesture();setLobbyBusy(true);$('network-status').classList.remove('error');
  const n=buildNetwork();
  try{const result=await(host?n.host(prefs.name):n.join($('room-code').value,prefs.name));if(n!==net)return;localId=result.id;connectedAt=performance.now();$('room-code-display').textContent=result.code;hide('lobby-actions');show('room-details');if(host){show('start-room');hide('waiting-host');}else{hide('start-room');show('waiting-host');}lobbyRoster();}
  catch(error){if(n===net){$('network-status').textContent=error.message||'Could not connect. Try again.';$('network-status').classList.add('error');}}
  finally{if(n===net)setLobbyBusy(false);}
}
function startRoom(){if(!net?.isHost)return;createSimulation([...net.peers.values()]);net.send({type:'start',snapshot:sim.snapshot()});enterGame();}

function bindUI(){
  for(const id of ['difficulty','bot-count']){const key=id==='difficulty'?'difficulty':'botCount';for(const b of $(id).querySelectorAll('button')){b.classList.toggle('active',String(prefs[key])===b.dataset.value);b.setAttribute('aria-pressed',String(String(prefs[key])===b.dataset.value));b.onclick=()=>{prefs[key]=key==='botCount'?Number(b.dataset.value):b.dataset.value;savePrefs();for(const other of $(id).querySelectorAll('button')){other.classList.toggle('active',other===b);other.setAttribute('aria-pressed',String(other===b));}audio.ui();};}}
  $('play-solo').onclick=solo;$('open-multiplayer').onclick=openLobby;$('lobby-back').onclick=()=>{net?.close();net=null;hide('lobby');show('menu');setLobbyBusy(false);};$('host-room').onclick=()=>connectRoom(true);$('join-room').onclick=()=>connectRoom(false);$('start-room').onclick=startRoom;
  $('room-code').addEventListener('input',()=>{$('room-code').value=$('room-code').value.replace(/\D/g,'').slice(0,6);});
  $('copy-room').onclick=async()=>{if(!net)return;const url=new URL(location.href);url.searchParams.set('room',net.roomCode);url.hash='';try{await navigator.clipboard.writeText(url.href);toast('Invite link copied.');}catch{try{await navigator.clipboard.writeText(net.roomCode);toast('Room code copied.');}catch{toast('Room code: '+net.roomCode);}}};
  $('pause-button').onclick=()=>pauseGame();$('resume').onclick=resumeGame;$('quit').onclick=quitToMenu;$('end-menu').onclick=quitToMenu;
  $('play-again').onclick=()=>{if(net?.isHost)startRoom();else if(!net)solo();};
  $('settings-open').onclick=()=>openSettings('menu');$('pause-settings').onclick=()=>openSettings('pause');$('settings-close').onclick=()=>{hide('settings');show(settingsReturn);};
  $('help-open').onclick=()=>{settingsReturn='menu';$('pause-title').textContent='Know your controls.';$('pause-subtitle').textContent=touch?'Left thumb moves. Drag the right side to aim. Hold the large fire button to shoot.':'Ready when you are.';hide('menu');show('pause');hide('quit');hide('pause-settings');$('resume').disabled=false;$('resume').textContent='BACK TO MENU';$('resume').onclick=()=>{hide('pause');show('menu');show('quit');show('pause-settings');$('resume').textContent='RESUME →';$('resume').onclick=resumeGame;};};
  for(const key of ['sensitivity','volume','fov']){$(key).value=prefs[key];$(key+'-value').value=prefs[key];$(key).oninput=()=>{prefs[key]=Number($(key).value);$(key+'-value').value=prefs[key];if(key==='volume')audio.setVolume(prefs.volume/100);savePrefs();};}
  $('graphics').value=prefs.graphics;$('graphics').onchange=()=>{prefs.graphics=$('graphics').value;savePrefs();applyGraphics();};
  $('fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{toast('Use your browser’s fullscreen or Add to Home Screen option.');}};
}
function openSettings(from){settingsReturn=from;hide(from);show('settings');}
function bindInput(){
  window.addEventListener('keydown',e=>{
    if(['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName))return;
    if(e.code==='Escape'){if(!$('settings').classList.contains('hidden')){$('settings-close').click();return;}if(phase==='playing'&&!paused)pauseGame();return;}
    if(phase!=='playing')return;
    if(['Space','Tab','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();
    if(e.code==='Tab'&&!gameEnded()&&!paused){$('score-title').textContent='Scoreboard';$('score-eyebrow').textContent='FREE FOR ALL';hide('end-actions');renderScoreRows();show('scoreboard');}
    if(paused)return;keys.add(e.code);if(e.code==='Digit1')control.weapon=0;if(e.code==='Digit2')control.weapon=1;
  });
  window.addEventListener('keyup',e=>{keys.delete(e.code);if(e.code==='Tab'&&!gameEnded())hide('scoreboard');});
  window.addEventListener('blur',()=>{resetInput();if(phase==='playing')pauseGame();});
  $('viewport').addEventListener('contextmenu',e=>e.preventDefault());
  $('viewport').addEventListener('mousedown',e=>{if(touch||phase!=='playing'||paused)return;soundGesture();if(document.pointerLockElement!==$('viewport')){dragLooking=true;lockPointer();}if(e.button===0)control.fire=true;if(e.button===2)control.aim=true;});
  window.addEventListener('mouseup',e=>{if(e.button===0){control.fire=false;dragLooking=false;}if(e.button===2)control.aim=false;});
  window.addEventListener('mousemove',e=>{if(touch||phase!=='playing'||paused)return;if(document.pointerLockElement===$('viewport')||(pointerFallback&&dragLooking))look(e.movementX,e.movementY);});
  window.addEventListener('wheel',e=>{if(phase==='playing'&&!paused&&!gameEnded())control.weapon=1-control.weapon;},{passive:true});
  const zone=$('move-zone'),stick=$('move-stick'),base=$('move-base');let movePointer=null,origin={x:0,y:0};
  zone.addEventListener('pointerdown',e=>{if(paused||phase!=='playing')return;e.preventDefault();soundGesture();movePointer=e.pointerId;zone.setPointerCapture(e.pointerId);origin={x:e.clientX,y:e.clientY};const r=zone.getBoundingClientRect();base.style.left=(e.clientX-r.left)+'px';base.style.bottom=(r.bottom-e.clientY)+'px';});
  zone.addEventListener('pointermove',e=>{if(e.pointerId!==movePointer)return;e.preventDefault();const dx=e.clientX-origin.x,dy=e.clientY-origin.y,mag=Math.hypot(dx,dy),scale=mag>43?43/mag:1;control.strafe=dx*scale/43;control.forward=-dy*scale/43;stick.style.transform=`translate(calc(-50% + ${dx*scale}px),calc(-50% + ${dy*scale}px))`;});
  const endMove=e=>{if(e.pointerId!==movePointer)return;movePointer=null;control.forward=control.strafe=0;stick.style.transform='translate(-50%,-50%)';};zone.addEventListener('pointerup',endMove);zone.addEventListener('pointercancel',endMove);zone.addEventListener('lostpointercapture',endMove);
  let lookPointer=null,last={x:0,y:0};const lookZone=$('look-zone');
  lookZone.addEventListener('pointerdown',e=>{if(paused||phase!=='playing')return;e.preventDefault();lookPointer=e.pointerId;last={x:e.clientX,y:e.clientY};lookZone.setPointerCapture(e.pointerId);});
  lookZone.addEventListener('pointermove',e=>{if(e.pointerId!==lookPointer||paused)return;e.preventDefault();look(e.clientX-last.x,e.clientY-last.y,true);last={x:e.clientX,y:e.clientY};});
  const endLook=e=>{if(e.pointerId===lookPointer)lookPointer=null;};lookZone.addEventListener('pointerup',endLook);lookZone.addEventListener('pointercancel',endLook);
  let firePointer=null,fireLast={x:0,y:0};const fire=$('touch-fire');
  fire.addEventListener('pointerdown',e=>{if(paused||phase!=='playing')return;e.preventDefault();soundGesture();firePointer=e.pointerId;fire.setPointerCapture(e.pointerId);fireLast={x:e.clientX,y:e.clientY};control.fire=true;fire.classList.add('active');});
  fire.addEventListener('pointermove',e=>{if(e.pointerId!==firePointer||paused)return;look(e.clientX-fireLast.x,e.clientY-fireLast.y,true);fireLast={x:e.clientX,y:e.clientY};});
  const endFire=e=>{if(e.pointerId===firePointer){firePointer=null;control.fire=false;fire.classList.remove('active');}};fire.addEventListener('pointerup',endFire);fire.addEventListener('pointercancel',endFire);fire.addEventListener('lostpointercapture',endFire);
  $('touch-aim').onclick=()=>{control.aim=!control.aim;$('touch-aim').classList.toggle('active',control.aim);};$('touch-sprint').onclick=()=>{control.sprint=!control.sprint;$('touch-sprint').classList.toggle('active',control.sprint);};
  $('touch-reload').onclick=()=>{control.reload=true;setTimeout(()=>control.reload=false,160);};$('touch-jump').onclick=()=>{control.jump=true;setTimeout(()=>control.jump=false,180);};$('touch-swap').onclick=()=>control.weapon=1-control.weapon;
}
function look(dx,dy,isTouch=false){const sens=(prefs.sensitivity/75)*(isTouch?.0042:.00175)*(control.aim?.62:1);yaw-=dx*sens;pitch=clamp(pitch-dy*sens,-1.42,1.42);}

function frame(now){
  requestAnimationFrame(frame);const dt=Math.min(.05,(now-frameTime)/1000);frameTime=now;worldTime+=dt;
  if(phase==='playing'){
    updateSimulation(dt);updateModels(dt);updateCamera(dt);updateEffects(dt);hudTime+=dt;if(hudTime>.04){updateHUD(hudTime);hudTime=0;}
    if(net&&!net.isHost&&lastGuestSnapshot&&now-lastGuestSnapshot>7000&&!paused)pauseGame('Host is not responding.','Keep the host’s game tab open. Reconnecting…');
  }else{
    const angle=worldTime*.014;camera.position.set(23+Math.sin(angle)*8,11.5+Math.sin(angle*.6)*.8,28+Math.cos(angle)*2);camera.lookAt(-5,1.5,-7);camera.fov=64;camera.updateProjectionMatrix();viewWeapon.group.visible=false;
  }
  arena.update(dt,worldTime);
  if(Math.floor(worldTime*12)!==Math.floor((worldTime-dt)*12))renderer.shadowMap.needsUpdate=true;
  camera.layers.set(0);renderer.autoClear=true;renderer.render(scene,camera);
  if(phase==='playing'&&viewWeapon.group.visible){const background=scene.background;scene.background=null;renderer.autoClear=false;renderer.clearDepth();camera.layers.set(1);renderer.render(scene,camera);scene.background=background;camera.layers.set(0);renderer.autoClear=true;}
  fpsFrames++;fpsTime+=dt;if(fpsTime>3){const fps=fpsFrames/fpsTime;if(prefs.graphics==='auto'&&fps<35&&pixelRatio>.8&&!qualityLowered){pixelRatio=Math.max(.8,pixelRatio*.75);renderer.setPixelRatio(pixelRatio);resize();qualityLowered=true;}fpsFrames=0;fpsTime=0;}
}
init();
