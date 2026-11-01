import * as THREE from 'three';
import {ARENA,GATES,OBSTACLES,PALETTES} from './config.js';
import {createWorld} from './world.js';
import {createGame,stepGame,resetPlayer} from './simulation.js';
import {createCart,createPickup,createEffects} from './vehicles.js';
import {AudioEngine} from './audio.js';

const $=id=>document.getElementById(id);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const damp=(a,b,s,dt)=>THREE.MathUtils.lerp(a,b,1-Math.exp(-s*dt));
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
const fmt=n=>Math.round(n).toLocaleString('en-US');
const isTouch=matchMedia('(pointer:coarse)').matches;
const prefersReduced=matchMedia('(prefers-reduced-motion:reduce)').matches;
const STORAGE='last-call-v1';
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Stockholm',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
function hash(s){let h=2166136261;for(const c of s){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;}
function readProfile(){try{return JSON.parse(localStorage.getItem(STORAGE))||{};}catch{return {};}}
let profile={best:0,total:0,runs:0,skin:0,seenHelp:false,daily:{},muted:false,music:true,shake:!prefersReduced,quality:isTouch?'balanced':'high',...readProfile()};
function saveProfile(){try{localStorage.setItem(STORAGE,JSON.stringify(profile));}catch{/* Private browsing can disable storage. */}}
let renderer,scene,world,effects,audio,cameras=[],rigs=[];
let state=null,mode='solo',phase='menu',lastTime=0,accumulator=0,elapsedReal=0,viewW=innerWidth,viewH=innerHeight;
let countdown=3,lastCount=-1,runSeed=1,runDate=null,frameCount=0,frameElapsed=0,toastTimer,eventTimer,pendingDialog=null;
let tutorialStage=0,tutorialUntil=0,finishQueued=false,lastTimeTick=91;
const keys=new Set(),cartModels=new Map(),previous=new Map(),renderPlayers=new Map(),hudRefs=[];
const shake=[0,0],floats=[0,0],stick={x:0,y:0,active:false},touch={drift:false,boost:false};
let pickupBatches=[],pickupTemplate=null,pickupCapacity=128;
const transform=new THREE.Object3D(),pieceMatrix=new THREE.Matrix4();
const challengeParams=new URLSearchParams(location.search);
let challengeSeed=Number(challengeParams.get('seed'))>>>0;
let challengeScore=clamp(Number(challengeParams.get('score'))||0,0,999999);

function showError(message){$('loading').classList.add('hidden');$('error-panel').classList.remove('hidden');if(message)$('error-copy').textContent=message;}
window.addEventListener('unhandledrejection',e=>{console.error(e.reason);if(!renderer)showError();});

async function init(){
  try{
    renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance',alpha:false});
    renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.98;
    renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    renderer.setPixelRatio(Math.min(devicePixelRatio,profile.quality==='high'?1.75:1.15));
    renderer.setSize(viewW,viewH);renderer.domElement.setAttribute('aria-label','LAST CALL, a three-dimensional airport');
    $('game-view').appendChild(renderer.domElement);
    renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();if(phase==='playing'||phase==='countdown')pause();toast('Graphics paused. Reload the page if the terminal does not return.');});
    renderer.domElement.addEventListener('webglcontextrestored',()=>location.reload());
    scene=new THREE.Scene();world=createWorld(scene,renderer,{quality:profile.quality});
    effects=createEffects(scene);audio=new AudioEngine();audio.setMuted(profile.muted);audio.setMusic(profile.music);
    for(let i=0;i<2;i++){
      const cam=new THREE.PerspectiveCamera(55,viewW/viewH,.1,900);cameras.push(cam);
      rigs.push({x:0,y:0,z:0,angle:0,initialized:false});
    }
    createBagBatches();
    bindUI();updateProfileUI();setMode(challengeSeed?'solo':'solo');
    if(challengeSeed){$('challenge-banner').textContent=`A challenge just landed. Score to beat: ${fmt(challengeScore)}.`;$('challenge-banner').classList.remove('hidden');}
    menuScene();applySettings();
    await document.fonts.ready;
    renderer.compile(scene,cameras[0]);
    requestAnimationFrame(frame);
    $('loading').style.opacity='0';setTimeout(()=>$('loading').classList.add('hidden'),450);
  }catch(e){console.error('LAST CALL boot:',e);showError();}
}

function createBagBatches(){
  pickupTemplate=createPickup();pickupTemplate.updateMatrixWorld(true);
  pickupTemplate.traverse(node=>{
    if(!node.isMesh)return;
    const mesh=new THREE.InstancedMesh(node.geometry,node.material,pickupCapacity);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.count=0;
    mesh.castShadow=false;mesh.receiveShadow=false;mesh.frustumCulled=false;
    scene.add(mesh);pickupBatches.push({mesh,local:node.matrixWorld.clone()});
  });
}
function syncBags(time){
  if(!state)return;let count=0;
  for(const b of state.pickups){
    if(!b.active||count>=pickupCapacity)continue;
    transform.position.set(b.x,.16+Math.sin(time*2.7+b.x*.7+b.z*.3)*.13,b.z);
    transform.rotation.set(0,time*.42+(Number(b.id.replace('bag-',''))||0)*1.7,0);
    transform.scale.setScalar(b.loose?.83:1);transform.updateMatrix();
    for(const batch of pickupBatches){pieceMatrix.multiplyMatrices(transform.matrix,batch.local);batch.mesh.setMatrixAt(count,pieceMatrix);}
    count++;
  }
  for(const batch of pickupBatches){batch.mesh.count=count;batch.mesh.instanceMatrix.needsUpdate=true;}
}
function disposeCarts(){for(const m of cartModels.values()){scene.remove(m.group);m.dispose();}cartModels.clear();previous.clear();renderPlayers.clear();}
function syncCarts(){
  disposeCarts();
  for(const p of [...state.players,...state.bots]){
    const color=p.id==='p1'?PALETTES[profile.skin]?.hex||PALETTES[0].hex:p.id==='p2'?0x8fd9e8:p.id==='b1'?0xd3bb87:0x8eabb1;
    const model=createCart({color,isBot:p.isBot});scene.add(model.group);cartModels.set(p.id,model);
    previous.set(p.id,{x:p.x,y:p.y,z:p.z,angle:p.angle});renderPlayers.set(p.id,{...p});
  }
}
function menuScene(){
  state=createGame({mode:'solo',seed:48291,duration:600});
  const p=state.players[0];p.x=7;p.z=35;p.angle=-.45;p.cargo=7;
  state.bots[0].x=-27;state.bots[0].z=-20;state.bots[1].x=27;state.bots[1].z=8;
  syncCarts();cartModels.get('p1').group.scale.setScalar(1.32);
  world.setActiveGates([0]);rigs.forEach(r=>r.initialized=false);
}
function setMode(next){
  mode=next;
  document.querySelectorAll('[data-mode]').forEach(b=>{const on=b.dataset.mode===mode;b.classList.toggle('selected',on);b.setAttribute('aria-pressed',on);});
  $('mode-detail').textContent=mode==='duel'?'2 PLAYERS · ONE KEYBOARD':mode==='daily'?`TODAY'S FLIGHT · SAME BAGS FOR EVERYONE`:'90 SECONDS · YOU VS. THE CLOCK';
  $('play-btn').firstElementChild.textContent=mode==='duel'?'Settle it at the gate':mode==='daily'?'Board today’s flight':"Let's roll";
}
function updateProfileUI(){
  $('menu-best').textContent=String(Math.round(profile.best)).padStart(4,'0');
  $('paint-swatches').replaceChildren();
  PALETTES.forEach((paint,i)=>{
    const b=document.createElement('button');b.className='swatch'+(i===profile.skin?' selected':'')+(profile.total<paint.unlock?' locked':'');b.style.background=paint.color;
    b.setAttribute('aria-label',`${paint.name}${profile.total<paint.unlock?`, unlock at ${paint.unlock} career points`:''}`);b.title=paint.name;
    b.onclick=()=>{
      if(profile.total<paint.unlock){toast(`${paint.name} unlocks at ${fmt(paint.unlock)} career points. ${fmt(Math.max(0,paint.unlock-profile.total))} to go.`);return;}
      profile.skin=i;saveProfile();updateProfileUI();if(phase==='menu')menuScene();
    };$('paint-swatches').appendChild(b);
  });
  $('paint-name').textContent=PALETTES[profile.skin]?.name||'Tangerine';
}
function buildHUD(){
  $('hud-players').replaceChildren();hudRefs.length=0;
  state.players.forEach((p,i)=>{
    const node=document.createElement('div');node.className='player-hud'+(mode==='duel'?' duel':'')+(i===1?' second':'');
    node.innerHTML=`<div class="score-area"><div class="player-label"><i class="player-color" style="background:${i?'#8fd9e8':PALETTES[profile.skin].color}"></i>${mode==='duel'?`PLAYER ${i+1}`:'YOUR SCORE'}</div><span class="score-value">0000</span><span class="score-unit">PTS</span><div class="delivery-label">0 bags delivered</div></div><div class="gate-direction"><div class="arrow-circle"><span>↑</span></div><div><div class="gate-eyebrow">DELIVER TO GATE</div><div class="gate-name">A01</div></div><span class="gate-distance">100m</span></div><canvas class="mini-map" width="200" height="274" aria-label="Terminal map with your gate and baggage"></canvas><div class="speedometer"><strong>0</strong><span>KM/H</span></div><div class="cargo-bar"><div class="cargo-label"><span>LUGGAGE</span><span class="cargo-number">0 / 8</span></div><div class="cargo-slots">${'<i class="cargo-slot"></i>'.repeat(8)}</div></div><div class="boost-gauge"><div class="boost-label"><span>BOOST</span><b>100</b></div><div class="boost-track"><div class="boost-fill"></div></div></div><div class="drift-label">DRIFT → TURBO</div><div class="player-float hidden"><strong></strong><span></span></div>`;
    $('hud-players').appendChild(node);
    const q=s=>node.querySelector(s);
    hudRefs.push({node,score:q('.score-value'),delivered:q('.delivery-label'),gate:q('.gate-direction'),gateName:q('.gate-name'),arrow:q('.arrow-circle span'),distance:q('.gate-distance'),speed:q('.speedometer strong'),cargo:q('.cargo-bar'),cargoNumber:q('.cargo-number'),slots:[...node.querySelectorAll('.cargo-slot')],boost:q('.boost-fill'),boostNumber:q('.boost-label b'),drift:q('.drift-label'),map:q('.mini-map').getContext('2d'),float:q('.player-float')});
  });
  $('split-line').classList.toggle('hidden',mode!=='duel');
  $('key-hints').innerHTML=mode==='duel'?'<span><kbd>WASD</kbd> P1 <kbd>SHIFT</kbd> DRIFT <kbd>SPACE</kbd> BOOST</span><span><kbd>ARROWS</kbd> P2 <kbd>ENTER</kbd> DRIFT <kbd>.</kbd> BOOST</span>':'<span><kbd>W A S D</kbd> DRIVE</span><span><kbd>SHIFT</kbd> DRIFT</span><span><kbd>SPACE</kbd> BOOST</span><span><kbd>R</kbd> RECOVER</span>';
}
async function startRun(reuseSeed=false){
  try{await audio.unlock();}catch{}
  audio.pause(false);
  if(!reuseSeed){runDate=mode==='daily'?today():null;runSeed=mode==='daily'?hash(runDate):challengeSeed||((Math.random()*0xffffffff)>>>0);}
  state=createGame({mode,seed:runSeed,duration:90});syncCarts();buildHUD();
  phase='countdown';countdown=3;lastCount=-1;accumulator=0;finishQueued=false;lastTimeTick=91;
  tutorialStage=0;tutorialUntil=0;keys.clear();resetTouch();
  shake[0]=shake[1]=0;floats[0]=floats[1]=0;rigs.forEach(r=>r.initialized=false);
  $('menu').classList.add('hidden');$('masthead').classList.add('hidden');$('results').classList.add('hidden');$('pause-panel').classList.add('hidden');
  $('hud').classList.remove('hidden');$('touch-controls').classList.toggle('hidden',!isTouch||mode==='duel');
  $('tutorial-hint').classList.toggle('hidden',mode==='duel');$('tutorial-hint').style.opacity='1';
  $('hint-copy').textContent=isTouch?'Push the joystick up. Drive through bags.':'Drive through luggage to pick it up';
  $('tutorial-hint').firstElementChild.textContent='01';
  document.body.classList.add('playing');document.body.classList.toggle('duel',mode==='duel');
  world.setActiveGates(state.players.map(p=>p.targetGate));resize();
  updateHUD();
}
function goHome(){
  phase='menu';keys.clear();resetTouch();audio.pause(true);document.body.classList.remove('playing','duel','boosting');
  ['hud','touch-controls','results','pause-panel','countdown'].forEach(id=>$(id).classList.add('hidden'));
  $('menu').classList.remove('hidden');$('masthead').classList.remove('hidden');updateProfileUI();menuScene();resize();
}
function pause(){
  if(phase!=='playing'&&phase!=='countdown')return;
  phase=phase==='countdown'?'paused-countdown':'paused';keys.clear();touch.drift=touch.boost=false;stick.x=stick.y=0;updateStick(0,0);
  audio.pause(true);$('pause-panel').classList.remove('hidden');$('touch-controls').classList.add('hidden');$('resume-btn').focus();
}
function resume(){
  if(phase!=='paused'&&phase!=='paused-countdown')return;
  phase=phase==='paused-countdown'?'countdown':'playing';accumulator=0;keys.clear();audio.pause(false);
  $('pause-panel').classList.add('hidden');$('touch-controls').classList.toggle('hidden',!isTouch||mode==='duel');
}
function finishRun(){
  if(finishQueued)return;finishQueued=true;phase='results';audio.finish();
  document.body.classList.remove('boosting');$('countdown').classList.add('hidden');$('touch-controls').classList.add('hidden');$('tutorial-hint').classList.add('hidden');
  const a=state.players[0],b=state.players[1];const bestBefore=profile.best,totalBefore=profile.total;
  const winner=b?(a.score>=b.score?a:b):a;const tie=b&&a.score===b.score;
  profile.runs++;profile.best=Math.max(profile.best,a.score);profile.total+=a.score;profile.seenHelp=true;
  let previousDaily=0;if(mode==='daily'){previousDaily=profile.daily[runDate]||0;profile.daily[runDate]=Math.max(previousDaily,a.score);}
  saveProfile();
  $('result-eyebrow').textContent=mode==='duel'?'ONE TERMINAL. TWO QUESTIONABLE DRIVERS.':mode==='daily'?`DAILY FLIGHT · ${runDate}`:'GATE CLOSED. EGO OPEN.';
  $('result-heading').textContent=tie?'IT’S A TIE.':b?`PLAYER ${winner.id==='p1'?'1':'2'} WINS.`:a.score>=2500?'GATE LEGEND.':a.score>=1000?'NICE BAGGAGE.':a.score>0?'FLIGHT MADE.':'MISSED YOUR FLIGHT.';
  $('result-score').innerHTML=`${fmt(winner.score)}<span>PTS</span>`;
  $('result-record').textContent=b?'Run it back. Settle it properly.':a.score>bestBefore?'A NEW PERSONAL BEST':mode==='daily'&&a.score>previousDaily?'YOUR BEST DAILY FLIGHT':challengeSeed&&a.score>challengeScore?'CHALLENGE BEATEN':a.score===0?'Grab the bags. Follow the green gate arrow.':`${fmt(Math.max(0,profile.best-a.score))} points from your personal best`;
  $('result-flight').textContent=mode==='duel'?'FLIGHT LC002':'FLIGHT LC090';
  $('result-duel').classList.toggle('hidden',!b);
  if(b)$('result-duel').innerHTML=`<div>PLAYER 1<b>${fmt(a.score)}</b></div><div>PLAYER 2<b>${fmt(b.score)}</b></div>`;
  $('stat-delivered').textContent=winner.delivered;$('stat-deliveries').textContent=winner.deliveries;$('stat-drift').textContent=winner.bestDrift.toFixed(1)+'s';
  const unlocked=PALETTES.filter(p=>p.unlock>totalBefore&&p.unlock<=profile.total);
  $('unlock-note').classList.toggle('hidden',!unlocked.length);
  if(unlocked.length)$('unlock-note').textContent=`NEW PAINT UNLOCKED · ${unlocked.map(p=>p.name).join(' + ')}`;
  $('again-btn').firstChild.textContent=mode==='daily'?'Fly it again ':'One more run ';
  $('challenge-btn').classList.toggle('hidden',mode==='duel');
  setTimeout(()=>{if(phase!=='results')return;$('results').classList.remove('hidden');$('again-btn').focus();},550);
}

function keyboardInput(index){
  if(index===0)return{throttle:(keys.has('KeyW')?1:0)-(keys.has('KeyS')?1:0),steer:(keys.has('KeyD')?1:0)-(keys.has('KeyA')?1:0),drift:keys.has('ShiftLeft')||keys.has('ShiftRight'),boost:keys.has('Space')};
  return{throttle:(keys.has('ArrowUp')?1:0)-(keys.has('ArrowDown')?1:0),steer:(keys.has('ArrowRight')?1:0)-(keys.has('ArrowLeft')?1:0),drift:keys.has('Enter')||keys.has('NumpadEnter'),boost:keys.has('Period')||keys.has('Slash')||keys.has('Numpad0')};
}
function inputs(){
  let pads=[];try{pads=[...(navigator.getGamepads?.()||[])].filter(Boolean);}catch{}
  return state.players.map((p,i)=>{
    let input=keyboardInput(i);
    if(i===0&&mode!=='duel'){
      if(keys.has('ArrowUp')||keys.has('ArrowDown'))input.throttle=(keys.has('ArrowUp')?1:0)-(keys.has('ArrowDown')?1:0);
      if(keys.has('ArrowRight')||keys.has('ArrowLeft'))input.steer=(keys.has('ArrowRight')?1:0)-(keys.has('ArrowLeft')?1:0);
      if(isTouch&&stick.active){input.throttle=-stick.y;input.steer=stick.x;}
      input.drift ||=touch.drift;input.boost ||=touch.boost;
    }
    const pad=pads[i];
    if(pad){
      const steer=Math.abs(pad.axes[0]||0)>.12?pad.axes[0]:0;
      const rt=pad.buttons[7]?.value||0,lt=pad.buttons[6]?.value||0;
      if(Math.abs(steer)>.1)input.steer=steer;
      if(rt>.05||lt>.05)input.throttle=rt-lt;
      input.drift ||=!!pad.buttons[0]?.pressed;input.boost ||=!!pad.buttons[1]?.pressed;
    }
    return input;
  });
}

function handleEvents(events){
  for(const event of events){
    effects.emit(event);
    const i=state.players.findIndex(p=>p.id===event.playerId);
    if(i<0){if(event.type==='finish')finishRun();continue;}
    audio.event(event);
    const p=state.players[i];
    if(event.type==='pickup'){
      if(i===0&&tutorialStage===0){tutorialStage=1;$('hint-copy').textContent='Follow the arrow. Deliver to your green gate.';$('tutorial-hint').firstElementChild.textContent='02';}
      if(p.cargo===8)floatText(i,'FULL LOAD','DELIVER FOR A BONUS',false,1.3);
    }else if(event.type==='delivery'){
      floatText(i,`+${fmt(event.value)}`,event.fullLoad?'FULL LOAD. FIRST CLASS.':`${event.amount} BAGS DELIVERED`,false,2.3);
      world.setActiveGates(state.players.map(p=>p.targetGate));
      if(i===0&&tutorialStage<2){tutorialStage=2;tutorialUntil=state.elapsed+7;$('hint-copy').textContent=isTouch?'Hold DRIFT through corners. Release for turbo.':'Hold SHIFT through corners. Release for turbo.';$('tutorial-hint').firstElementChild.textContent='03';}
    }else if(event.type==='collision'){
      if(profile.shake)shake[i]=Math.max(shake[i],Math.min(.6,event.strength*.016));
      if(event.amount>0)floatText(i,`−${event.amount} ${event.amount===1?'BAG':'BAGS'}`,'THAT’S COMING OUT OF YOUR PAY',true,1.5);
    }else if(event.type==='drift'&&event.charge>.4){floatText(i,'TURBO!','NICE LITTLE DRIFT',false,1.1);}
    else if(event.type==='land'&&profile.shake){shake[i]=Math.max(shake[i],.1);}
  }
}
function floatText(index,text,sub,bad=false,duration=1.8){
  const ref=hudRefs[index];if(!ref)return;
  ref.float.querySelector('strong').textContent=text;ref.float.querySelector('span').textContent=sub;
  ref.float.classList.remove('hidden','pop');ref.float.classList.toggle('bad',bad);void ref.float.offsetWidth;ref.float.classList.add('pop');floats[index]=duration;
}
function renderMiniMap(ref,p,time){
  const c=ref.map,w=200,h=274,sx=w/(ARENA.halfX*2+10),sz=h/(ARENA.halfZ*2+10);
  const px=x=>w/2+x*sx,pz=z=>h/2+z*sz;
  c.clearRect(0,0,w,h);c.fillStyle='rgba(245,240,230,.82)';c.beginPath();c.roundRect(2,2,w-4,h-4,10);c.fill();
  c.strokeStyle='rgba(38,57,47,.2)';c.lineWidth=1.5;c.stroke();
  c.fillStyle='rgba(38,57,47,.17)';for(const o of OBSTACLES){if(o.r){c.beginPath();c.arc(px(o.x),pz(o.z),o.r*sx,0,Math.PI*2);c.fill();}else c.fillRect(px(o.x-o.w/2),pz(o.z-o.d/2),o.w*sx,o.d*sz);}
  c.fillStyle='#c0a36d';for(const b of state.pickups)if(b.active){c.beginPath();c.arc(px(b.x),pz(b.z),1.7,0,Math.PI*2);c.fill();}
  GATES.forEach((g,i)=>{c.fillStyle=i===p.targetGate?'#6ca989':'rgba(38,57,47,.1)';c.beginPath();c.arc(px(g.x),pz(g.z),i===p.targetGate?9+Math.sin(time*4)*1:6,0,Math.PI*2);c.fill();});
  for(const other of [...state.players,...state.bots]){
    if(other.id===p.id)continue;c.fillStyle=other.isBot?'#697c76':'#79bacd';c.beginPath();c.arc(px(other.x),pz(other.z),other.isBot?3.5:5,0,Math.PI*2);c.fill();
  }
  c.save();c.translate(px(p.x),pz(p.z));c.rotate(p.angle);c.beginPath();c.moveTo(0,-8);c.lineTo(5.5,6);c.lineTo(0,3);c.lineTo(-5.5,6);c.closePath();c.fillStyle=p.id==='p1'?'#f0714f':'#438ba4';c.strokeStyle='#fff8e9';c.lineWidth=2.5;c.stroke();c.fill();c.restore();
}
function updateHUD(){
  const seconds=Math.ceil(state.timeLeft);$('timer').textContent=`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;
  $('timer-progress').style.transform=`scaleX(${state.timeLeft/state.duration})`;
  document.querySelector('.round-clock').classList.toggle('urgent',seconds<=15);
  if(seconds!==lastTimeTick&&seconds<=10&&seconds>0&&phase==='playing')audio.event({type:'tick',value:seconds});lastTimeTick=seconds;
  state.players.forEach((p,i)=>{
    const r=hudRefs[i],gate=GATES[p.targetGate];if(!r)return;
    r.score.textContent=String(Math.floor(p.score)).padStart(4,'0');r.delivered.textContent=`${p.delivered} ${p.delivered===1?'bag':'bags'} delivered`;
    r.gateName.textContent=gate.name;r.gate.classList.toggle('ready',p.cargo>=5);
    const heading=Math.atan2(gate.x-p.x,-(gate.z-p.z));r.arrow.style.transform=`rotate(${wrap(heading-rigs[i].angle)}rad)`;
    r.distance.textContent=Math.round(Math.hypot(gate.x-p.x,gate.z-p.z))+'m';
    r.speed.textContent=Math.round(Math.abs(p.speed)*3.6);r.cargoNumber.textContent=`${p.cargo} / 8`;r.cargo.classList.toggle('full',p.cargo===8);
    r.slots.forEach((s,j)=>s.classList.toggle('filled',j<p.cargo));r.boost.style.transform=`scaleX(${clamp(p.boostEnergy/100,0,1)})`;r.boostNumber.textContent=Math.round(p.boostEnergy);
    r.drift.classList.toggle('active',p.drifting&&p.speed>3||p.turboTimer>0);r.drift.textContent=p.turboTimer>0?'TURBO!':`DRIFT ${Math.round(p.driftCharge*100)}%`;
    renderMiniMap(r,p,elapsedReal);
  });
  if(tutorialStage===2&&state.elapsed>tutorialUntil)$('tutorial-hint').style.opacity='0';
  if(state.elapsed>30)$('tutorial-hint').style.opacity='0';
  document.body.classList.toggle('boosting',state.players.some(p=>p.boosting||p.turboTimer>0)&&!prefersReduced);
}
function cameraFor(index,dt){
  const p=renderPlayers.get(state.players[index].id),cam=cameras[index],rig=rigs[index];
  if(!rig.initialized){rig.x=p.x;rig.z=p.z;rig.y=p.y;rig.angle=p.angle;rig.initialized=true;}
  const factor=p.drifting?3.6:5.2;
  rig.angle+=wrap(p.angle-rig.angle)*(1-Math.exp(-factor*dt));
  rig.x=damp(rig.x,p.x,10,dt);rig.z=damp(rig.z,p.z,10,dt);rig.y=damp(rig.y,p.y,7,dt);
  const fx=Math.sin(rig.angle),fz=-Math.cos(rig.angle),fast=Math.abs(p.speed)/30;
  const follow=mode==='duel'?12.5:12.8;
  const distance=follow+fast*2.0,height=(mode==='duel'?10:9.2)+fast*.7;
  const jitter=profile.shake?shake[index]:0;
  const jx=(Math.sin(elapsedReal*79)+Math.sin(elapsedReal*113))*.5*jitter;
  const jy=Math.sin(elapsedReal*97)*jitter*.55;
  cam.position.set(clamp(rig.x-fx*distance+jx,-40,40),rig.y*.4+height+jy,clamp(rig.z-fz*distance,-56,56));
  cam.lookAt(rig.x+fx*5,1.1+rig.y*.6,rig.z+fz*5);
  const targetFov=(mode==='duel'?59:55)+(p.boosting||p.turboTimer>0?6:fast*2);
  const f=damp(cam.fov,targetFov,3,dt);if(Math.abs(cam.fov-f)>.003){cam.fov=f;cam.updateProjectionMatrix();}
}
function render(dt){
  const split=mode==='duel'&&phase!=='menu';
  renderer.setScissorTest(split);
  if(phase==='menu'){
    const t=elapsedReal*.12,cam=cameras[0];
    cam.position.set(23+Math.sin(t)*1.8,10.1,54+Math.cos(t)*1.2);
    cam.lookAt(-3,1.3,30.5);cam.fov=viewW<600?49:47;cam.aspect=viewW/viewH;cam.updateProjectionMatrix();
    renderer.setViewport(0,0,viewW,viewH);renderer.render(scene,cam);
  }else if(split){
    const left=Math.floor(viewW/2),right=viewW-left;
    for(let i=0;i<2;i++){const w=i?right:left,x=i?left:0;const cam=cameras[i];cam.aspect=w/viewH;cam.updateProjectionMatrix();cameraFor(i,dt);renderer.setViewport(x,0,w,viewH);renderer.setScissor(x,0,w,viewH);renderer.render(scene,cam);}
  }else{
    const cam=cameras[0];cam.aspect=viewW/viewH;cam.updateProjectionMatrix();cameraFor(0,dt);renderer.setViewport(0,0,viewW,viewH);renderer.render(scene,cam);
  }
}
function frame(now){
  requestAnimationFrame(frame);
  const dt=Math.min(.05,Math.max(.001,(now-(lastTime||now-16.67))/1000));lastTime=now;elapsedReal+=dt;
  if(!state)return;
  const moving=phase==='playing'||phase==='menu';
  if(moving){
    accumulator=Math.min(accumulator+dt,.12);
    while(accumulator>=1/60){
      for(const p of [...state.players,...state.bots])previous.set(p.id,{x:p.x,y:p.y,z:p.z,angle:p.angle});
      const events=stepGame(state,phase==='menu'?[{throttle:0,steer:0}]:inputs(),1/60);
      if(phase==='playing')handleEvents(events);
      accumulator-=1/60;
      if(state.finished&&phase==='playing'){finishRun();break;}
      if(phase==='menu'&&state.finished){menuScene();break;}
    }
  }
  if(phase==='countdown'){
    countdown-=dt;const n=Math.ceil(countdown);
    if(n!==lastCount){lastCount=n;const el=$('countdown');el.textContent=n>0?String(n):'GO!';el.classList.remove('hidden','go');void el.offsetWidth;el.style.animation='none';void el.offsetWidth;el.style.animation='';el.classList.toggle('go',n<=0);audio.event({type:'countdown',value:Math.max(0,n)});}
    if(countdown<=0){phase='playing';$('countdown').textContent='GO!';$('countdown').classList.add('go');setTimeout(()=>$('countdown').classList.add('hidden'),650);}
  }
  const alpha=moving?accumulator/(1/60):1;
  for(const p of [...state.players,...state.bots]){
    const before=previous.get(p.id)||p;
    const rp=renderPlayers.get(p.id)||{};Object.assign(rp,p);
    rp.x=THREE.MathUtils.lerp(before.x,p.x,alpha);rp.z=THREE.MathUtils.lerp(before.z,p.z,alpha);rp.y=THREE.MathUtils.lerp(before.y,p.y,alpha);rp.angle=before.angle+wrap(p.angle-before.angle)*alpha;
    renderPlayers.set(p.id,rp);cartModels.get(p.id)?.update(rp,moving?dt:0,elapsedReal);
    if(phase==='playing')effects.trail?.(rp,dt);
  }
  world.update(dt,elapsedReal);syncBags(elapsedReal);effects.update(dt,elapsedReal);
  if(phase==='playing')audio.update(state.players[0],dt);
  for(let i=0;i<2;i++){shake[i]=damp(shake[i],0,9,dt);if(floats[i]>0){floats[i]-=dt;if(floats[i]<=0)hudRefs[i]?.float.classList.add('hidden');}}
  if(phase!=='menu')updateHUD();
  render(dt);
  frameCount++;frameElapsed+=dt;
  if(frameElapsed>4){
    // A single conservative downgrade avoids a runaway pixel cost on small GPUs.
    if(frameCount/frameElapsed<30&&renderer.getPixelRatio()>1.15){renderer.setPixelRatio(1);renderer.setSize(viewW,viewH);}
    frameCount=0;frameElapsed=0;
  }
}
function resize(){viewW=innerWidth;viewH=innerHeight;renderer.setSize(viewW,viewH);rigs.forEach(r=>r.initialized=false);}
function toast(message,duration=3200){clearTimeout(toastTimer);$('toast').textContent=message;$('toast').classList.remove('hidden');toastTimer=setTimeout(()=>$('toast').classList.add('hidden'),duration);}
function applySettings(){
  $('setting-sound').checked=!profile.muted;$('setting-music').checked=profile.music;$('setting-shake').checked=profile.shake;$('setting-quality').value=profile.quality;
  $('sound-btn').classList.toggle('muted',profile.muted);$('sound-btn').setAttribute('aria-label',profile.muted?'Unmute sound':'Mute sound');
  audio?.setMuted(profile.muted);audio?.setMusic(profile.music);
  if(renderer){renderer.setPixelRatio(Math.min(devicePixelRatio,profile.quality==='high'?1.75:1.15));renderer.setSize(viewW,viewH);renderer.shadowMap.enabled=profile.quality==='high';}
}
function updateStick(x,y){$('joystick-knob').style.transform=`translate(${x*35}px,${y*35}px)`;}
function resetTouch(){stick.x=stick.y=0;stick.active=false;touch.drift=touch.boost=false;updateStick(0,0);$('touch-drift').classList.remove('pressed');$('touch-boost').classList.remove('pressed');}
function recover(index){
  const p=state.players[index];if(!p||!resetPlayer(state,p.id))return;
  previous.set(p.id,{x:p.x,y:p.y,z:p.z,angle:p.angle});rigs[index].initialized=false;
  toast('Cart recovered. Held luggage left behind.',1800);
}
function bindUI(){
  document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{setMode(b.dataset.mode);if(mode==='duel'&&isTouch)toast('Couch duel uses a keyboard or two gamepads. Solo has touch controls.');});
  $('play-btn').onclick=()=>startRun();$('again-btn').onclick=()=>startRun(mode==='daily'||!!challengeSeed);
  $('restart-btn').onclick=()=>startRun(true);$('quit-btn').onclick=goHome;$('result-home').onclick=goHome;
  $('pause-btn').onclick=pause;$('resume-btn').onclick=resume;
  $('how-btn').onclick=()=>openDialog('help');$('settings-btn').onclick=()=>openDialog('settings');
  $('challenge-enter').onclick=()=>{openDialog('challenge-dialog');$('challenge-code').focus();};
  $('challenge-banner').onclick=()=>{challengeSeed=0;challengeScore=0;$('challenge-banner').classList.add('hidden');};
  $('challenge-load').onclick=()=>{
    const code=$('challenge-code').value.trim().toUpperCase().match(/^LC-([A-Z0-9]{1,7})-([A-Z0-9]{1,5})$/);
    const seed=code?parseInt(code[1],36):0,score=code?parseInt(code[2],36):-1;
    if(!code||!Number.isSafeInteger(seed)||seed<1||seed>0xffffffff||score<0||score>999999){$('challenge-error').classList.remove('hidden');return;}
    challengeSeed=seed;challengeScore=score;$('challenge-error').classList.add('hidden');closeDialog('challenge-dialog');setMode('solo');
    $('challenge-banner').textContent=`CHALLENGE ACCEPTED · ${fmt(score)} POINTS TO BEAT`;$('challenge-banner').classList.remove('hidden');
    toast('Ready. Press Let’s roll to take their flight.');
  };
  $('challenge-code').addEventListener('keydown',e=>{if(e.key==='Enter'){$('challenge-load').click();e.preventDefault();}});
  document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>closeDialog(b.dataset.close));
  $('sound-btn').onclick=()=>{profile.muted=!profile.muted;applySettings();saveProfile();};
  for(const [id,key,inverse] of [['setting-sound','muted',true],['setting-music','music',false],['setting-shake','shake',false]])$(id).onchange=e=>{profile[key]=inverse?!e.target.checked:e.target.checked;applySettings();saveProfile();};
  $('setting-quality').onchange=e=>{profile.quality=e.target.value;applySettings();saveProfile();};
  $('challenge-btn').onclick=async()=>{
    const code=`LC-${state.seed.toString(36).toUpperCase()}-${state.players[0].score.toString(36).toUpperCase()}`;
    try{await navigator.clipboard.writeText(code);toast(`Copied ${code}. Your friend can enter it on the menu.`,6500);}
    catch{
      const area=document.createElement('textarea');area.value=code;area.setAttribute('readonly','');area.style.cssText='position:fixed;top:0;left:0;width:1px;height:1px;opacity:0';document.body.appendChild(area);area.select();
      let ok=false;try{ok=document.execCommand('copy');}catch{}area.remove();
      if(ok)toast(`Copied ${code}. Your friend can enter it on the menu.`,6500);else{window.prompt('Copy this code. Your friend can enter it on the menu:',code);}
    }
  };
  window.addEventListener('resize',resize);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});
  window.addEventListener('blur',()=>{keys.clear();if(phase==='playing'||phase==='countdown')pause();});
  const movement=new Set(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','ShiftLeft','ShiftRight','Enter','NumpadEnter','Period','Slash','Numpad0','KeyR','Backspace']);
  window.addEventListener('keydown',e=>{
    if(e.code==='Escape'){
      e.preventDefault();if(pendingDialog){closeDialog(pendingDialog);return;}
      if(phase==='playing'||phase==='countdown')pause();else if(phase==='paused'||phase==='paused-countdown')resume();return;
    }
    if(phase==='playing'||phase==='countdown'){
      if(movement.has(e.code))e.preventDefault();keys.add(e.code);
      if(!e.repeat&&e.code==='KeyR'&&phase==='playing')recover(0);
      if(!e.repeat&&e.code==='Backspace'&&phase==='playing'&&mode==='duel')recover(1);
    }
  });
  window.addEventListener('keyup',e=>keys.delete(e.code));
  window.addEventListener('gamepadconnected',()=>toast('Gamepad connected. RT to drive · A to drift · B to boost.'));
  const joy=$('joystick');let pointerId=null;
  function stickMove(e){const rect=joy.getBoundingClientRect();let x=(e.clientX-rect.left-rect.width/2)/(rect.width*.37),y=(e.clientY-rect.top-rect.height/2)/(rect.height*.37);const length=Math.hypot(x,y);if(length>1){x/=length;y/=length;}stick.x=Math.abs(x)<.12?0:x;stick.y=Math.abs(y)<.12?0:y;updateStick(stick.x,stick.y);}
  joy.addEventListener('pointerdown',e=>{pointerId=e.pointerId;joy.setPointerCapture(pointerId);stick.active=true;stickMove(e);});
  joy.addEventListener('pointermove',e=>{if(e.pointerId===pointerId)stickMove(e);});
  function releaseStick(){pointerId=null;stick.active=false;stick.x=stick.y=0;updateStick(0,0);}
  joy.addEventListener('pointerup',releaseStick);joy.addEventListener('pointercancel',releaseStick);joy.addEventListener('lostpointercapture',releaseStick);
  for(const [id,key] of [['touch-drift','drift'],['touch-boost','boost']]){const b=$(id);b.addEventListener('pointerdown',e=>{b.setPointerCapture(e.pointerId);touch[key]=true;b.classList.add('pressed');});for(const event of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(event,()=>{touch[key]=false;b.classList.remove('pressed');});}
  $('touch-recover').onclick=()=>{if(phase==='playing')recover(0);};
  // Keep keyboard focus inside modal panels; Escape always closes or resumes.
  document.addEventListener('keydown',e=>{
    if(e.key!=='Tab')return;const dialog=[...document.querySelectorAll('.overlay')].find(n=>!n.classList.contains('hidden'));if(!dialog)return;
    const items=[...dialog.querySelectorAll('button:not([disabled]),input,select,a[href]')].filter(n=>n.getClientRects().length);if(!items.length)return;
    const first=items[0],last=items.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
  });
}
let priorFocus=null;
function openDialog(id){priorFocus=document.activeElement;pendingDialog=id;$(id).classList.remove('hidden');$(id).querySelector('button')?.focus();}
function closeDialog(id){$(id).classList.add('hidden');pendingDialog=null;priorFocus?.focus();}
init();
