import * as THREE from './vendor/three.module.js';
import {createWorld,createCart,createObject,disposeObject} from './world.js';
import {createCourse,createPlayer,stepPlayer,centerX,groundY,ROAD_HALF,RUN_DURATION} from './physics.js';
import {AudioEngine} from './audio.js';

const $=id=>document.getElementById(id);
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const lerp=(a,b,t)=>a+(b-a)*t;
const damp=(a,b,k,dt)=>lerp(a,b,1-Math.exp(-k*dt));
const number=n=>Math.round(n||0).toLocaleString('sv-SE');
const colors=['#ff6338','#8fd5c8','#b1a4e9','#f6c45b'];
const colorNames=['Mandarin','Mint','Lavendel','Guld'];
const unlocks=[0,4000,16000,35000];
const SAVE_KEY='yeet-club-v1';
const readStore=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}};
const writeStore=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));}catch{}};
const defaults={best:0,xp:0,runs:0,color:0,muted:false,music:true,quality:'high',reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches};
const saved=readStore(SAVE_KEY,{});
const save={...defaults,...saved};
save.color=clamp(Number(save.color)||0,0,3);
save.best=Math.max(0,Number(save.best)||0);save.xp=Math.max(0,Number(save.xp)||0);
const persist=()=>writeStore(SAVE_KEY,save);
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Stockholm',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const hash=s=>{let h=2166136261;for(const c of String(s))h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0;};
const dailySeed=day=>hash('yeet-'+day);
const urlParams=new URLSearchParams(location.search);
const urlSeed=/^\d{1,10}$/.test(urlParams.get('seed')||'')?Number(urlParams.get('seed'))>>>0:null;
const targetScore=clamp(Number(urlParams.get('target'))||0,0,10000000);
let importedChallenge=urlSeed===null?null:{seed:urlSeed,score:targetScore};
const touchDevice=matchMedia('(pointer: coarse)').matches;
const keys=new Set();
const pressed=new Set();
const touch={left:false,right:false,jump:false,boost:false,brake:false};
let state='loading',previousState='playing',mode='solo',seed=dailySeed(today()),runDate=null;
let course=[],players=[],carts=[],consumed=[],cameras=[];
let environment,renderer,scene,sun,hemi,ambient,hero,ghost;
let time=0,lastTime=0,accumulator=0,countdown=0,menuTime=0;
let currentRunRecorded=false,ghostData=null,ghostTrace=[],traceSteps=0;
let isDaily=false,shareTarget=0,displayScore=0,frameCount=0;
let width=innerWidth,height=innerHeight,toastTimer=null;
let resumeFocus=null,gamepadIndex=-1;
const FIXED_DT=1/120;
const objectVisuals=new Map();
const eventTimers=[0,0];
const shakes=[0,0];
const particles=[];
const trails=[];
const spilledCargo=[];
let cameraMenu=new THREE.PerspectiveCamera(42,width/height,.1,2200);
let particleGeometry,particleMaterial,trailGeometry,trailMaterial;
const audio=new AudioEngine();

function show(id,visible){const e=$(id);if(e)e.hidden=!visible;}
function say(text,duration=2600){const e=$('progress-note');if(!e)return;e.textContent=text;e.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{e.hidden=true;},duration);}
function bind(id,event,fn){$(id)?.addEventListener(event,fn);}
function setText(id,text){const e=$(id);if(e&&e.textContent!==String(text))e.textContent=text;}
function menuStats(){
  setText('best-score',number(save.best));
  document.querySelectorAll('.color-choice').forEach((b,i)=>{
    const unlocked=save.xp>=unlocks[i];
    b.classList.toggle('is-selected',i===save.color);b.classList.toggle('is-locked',!unlocked);
    b.setAttribute('aria-pressed',String(i===save.color));
    b.title=unlocked?colorNames[i]:`${colorNames[i]} · ${number(unlocks[i])} XP`;
    b.setAttribute('aria-label',b.title);
  });
  const next=unlocks.findIndex(n=>n>save.xp);
  setText('color-status',next<0?'Alla färger upplåsta':`${number(save.xp)} / ${number(unlocks[next])} XP till ${colorNames[next].toLowerCase()}`);
}

function syncSettings(){
  audio.setMuted(save.muted);audio.setMusic(save.music);
  const s=$('sound-btn');if(s){s.classList.toggle('is-muted',save.muted);s.setAttribute('aria-pressed',String(!save.muted));s.setAttribute('aria-label',save.muted?'Slå på ljud':'Stäng av ljud');s.title=save.muted?'Slå på ljud (M)':'Stäng av ljud (M)';}
  if($('quality-select'))$('quality-select').value=save.quality;
  if($('motion-toggle'))$('motion-toggle').checked=save.reducedMotion;
  if($('music-toggle'))$('music-toggle').checked=save.music;
  document.body.classList.toggle('reduced-motion',save.reducedMotion);
}

function updateQuality(){
  if(!renderer)return;
  const high=save.quality==='high';
  renderer.setPixelRatio(Math.min(devicePixelRatio,high?(mode==='duo'?1.3:1.7):1));
  renderer.shadowMap.enabled=high;
  renderer.setSize(width,height,false);
}

function setup(){
  try{
    renderer=new THREE.WebGLRenderer({canvas:$('game-canvas'),antialias:true,alpha:false,powerPreference:'high-performance'});
  }catch(e){
    show('loading',false);show('error-screen',true);setText('error-detail','WebGL 2 behövs. Prova en aktuell Chrome, Safari eller Firefox med grafikacceleration på.');console.error(e);return;
  }
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.12;
  renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.autoClear=true;
  scene=new THREE.Scene();
  scene.background=new THREE.Color('#e8bda4');
  scene.fog=new THREE.FogExp2('#e8bda4',.00175);
  hemi=new THREE.HemisphereLight('#d2eff0','#8d5c42',2.4);scene.add(hemi);
  ambient=new THREE.AmbientLight('#ffe9d7',.32);scene.add(ambient);
  sun=new THREE.DirectionalLight('#fff0d3',3.5);
  sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);
  Object.assign(sun.shadow.camera,{left:-55,right:55,top:55,bottom:-55,near:1,far:200});
  sun.shadow.bias=-.0006;sun.shadow.normalBias=.06;sun.shadow.radius=3;
  scene.add(sun,sun.target);
  environment=createWorld(scene,{quality:save.quality,theme:'sunset'});
  hero=createCart(colors[save.color]);scene.add(hero);
  particleGeometry=new THREE.IcosahedronGeometry(.07,0);
  particleMaterial=new THREE.MeshBasicMaterial({color:'#ffe6a3',transparent:true,opacity:.9});
  trailGeometry=new THREE.PlaneGeometry(.1,1.2);
  trailMaterial=new THREE.MeshBasicMaterial({color:'#e7b181',transparent:true,opacity:.3,depthWrite:false,side:THREE.DoubleSide});
  state='menu';document.body.dataset.state=state;
  show('loading',false);show('menu',true);show('hud',false);show('results',false);show('pause-screen',false);
  syncSettings();menuStats();resize();
  if(urlSeed!==null){setText('solo-btn-label','Anta utmaningen');say(`Utmaning: slå ${number(targetScore)} poäng på samma bana.`,5500);}
  if(touchDevice){const duo=$('duo-btn');if(duo){duo.disabled=true;duo.title='Delad skärm kräver ett tangentbord.';}document.body.classList.add('touch-device');}
  $('game-canvas').addEventListener('webglcontextlost',e=>{e.preventDefault();pause();say('Grafiken pausades av webbläsaren. Ladda om för att köra igen.',12000);});
  $('game-canvas').addEventListener('webglcontextrestored',()=>location.reload());
  requestAnimationFrame(frame);
}

function disposeCart(cart){if(cart){scene.remove(cart);disposeObject(cart);}}
function newHero(){disposeCart(hero);hero=createCart(colors[save.color]);scene.add(hero);}

function startRun(nextMode='solo',sameSeed=false){
  audio.start();
  const wasSeed=seed;
  mode=nextMode==='duo'?'duo':'solo';
  isDaily=nextMode==='daily'||(sameSeed&&isDaily);
  if(!sameSeed)runDate=isDaily?today():null;
  shareTarget=sameSeed?shareTarget:nextMode==='challenge'?importedChallenge.score:nextMode==='solo'&&urlSeed!==null?targetScore:0;
  seed=sameSeed?wasSeed:isDaily?dailySeed(runDate):nextMode==='challenge'?importedChallenge.seed:(urlSeed!==null&&mode==='solo'?urlSeed:((Math.random()*0xffffffff)>>>0));
  course=createCourse(seed);
  if(!Array.isArray(course))course=course.objects;
  for(const p of spilledCargo)scene.remove(p.mesh);spilledCargo.length=0;
  for(const c of carts)disposeCart(c);carts=[];
  for(const v of objectVisuals.values()){scene.remove(v);disposeObject(v);}objectVisuals.clear();
  for(const p of particles){scene.remove(p.mesh);p.mesh.material.dispose();}particles.length=0;
  for(const p of trails){scene.remove(p.mesh);p.mesh.material.dispose();}trails.length=0;
  disposeCart(ghost);ghost=null;
  players=[];consumed=[];cameras=[];
  const n=mode==='duo'?2:1;
  for(let i=0;i<n;i++){
    const p=createPlayer({id:i,color:i===0?colors[save.color]:'#8fd5c8'});
    players.push(p);consumed.push(new Set());
    const cart=createCart(i===0?colors[save.color]:'#8fd5c8');scene.add(cart);carts.push(cart);
    const cam=new THREE.PerspectiveCamera(57,1,.1,1600);cameras.push(cam);updateCamera(p,cam,1,true);
  }
  hero.visible=false;
  ghostData=isDaily?readStore('yeet-ghost-'+runDate,null):null;
  if(ghostData?.seed===seed&&Array.isArray(ghostData.trace)&&ghostData.trace.length>2&&mode==='solo'){
    ghost=createCart('#bce7da');
    ghost.traverse(o=>{if(o.isMesh){o.material=o.material.clone();o.material.transparent=true;o.material.opacity=.2;o.material.depthWrite=false;o.castShadow=false;}});scene.add(ghost);
  }
  ghostTrace=[[0,players[0].s,players[0].x,players[0].y,0,players[0].pitch]];traceSteps=0;currentRunRecorded=false;
  displayScore=0;accumulator=0;countdown=2.6;
  state='countdown';document.body.dataset.state=state;
  document.body.classList.toggle('split',mode==='duo');
  show('menu',false);show('results',false);show('pause-screen',false);show('help-panel',false);show('challenge-panel',false);show('hud',true);show('countdown',true);
  show('touch-controls',touchDevice&&mode!=='duo');
  setText('p0-label',mode==='duo'?'DU · WASD':isDaily?'DAGENS RUN':shareTarget?`SLÅ ${number(shareTarget)}`:'COASTLINE');
  setText('p1-label','KOMPIS · PILTANGENTER');
  setText('countdown','3');
  for(let i=0;i<2;i++){show(`event-${i}`,false);eventTimers[i]=0;shakes[i]=0;}
  clearInput();updateQuality();resize();updateHUD();
  if(isDaily&&ghost)say('Den genomskinliga vagnen är ditt bästa lopp idag.');
}

function clearInput(){keys.clear();pressed.clear();for(const k in touch)touch[k]=false;document.querySelectorAll('[data-control]').forEach(e=>e.classList.remove('is-active'));}
function getInput(i){
  if(i===0){
    const solo=mode!=='duo';
    let steer=(keys.has('KeyD')||(solo&&keys.has('ArrowRight'))||touch.right?1:0)-(keys.has('KeyA')||(solo&&keys.has('ArrowLeft'))||touch.left?1:0);
    let throttle=keys.has('KeyW')||(solo&&keys.has('ArrowUp'))?1:0;
    let brake=keys.has('KeyS')||(solo&&keys.has('ArrowDown'))||touch.brake;
    let boost=keys.has('ShiftLeft')||(solo&&keys.has('ShiftRight'))||touch.boost;
    let jump=pressed.has('Space')||pressed.has('touchJump');
    if(gamepadIndex>=0){
      const gp=navigator.getGamepads?.()[gamepadIndex];
      if(gp){if(Math.abs(gp.axes[0]||0)>.14)steer=gp.axes[0];brake=brake||gp.buttons[6]?.pressed;boost=boost||gp.buttons[7]?.pressed||gp.buttons[1]?.pressed;const a=!!gp.buttons[0]?.pressed;jump=jump||(a&&!gpLastJump);gpLastJump=a;}
    }
    return {steer,throttle,brake,boost,jump,trick:jump?1:0};
  }
  return {steer:(keys.has('ArrowRight')?1:0)-(keys.has('ArrowLeft')?1:0),throttle:keys.has('ArrowUp')?1:0,brake:keys.has('ArrowDown'),boost:keys.has('ShiftRight'),jump:pressed.has('Enter')||pressed.has('NumpadEnter'),trick:(pressed.has('Enter')||pressed.has('NumpadEnter'))?1:0};
}
let gpLastJump=false;

function pause(){
  if(state!=='playing'&&state!=='countdown')return;
  previousState=state;state='paused';document.body.dataset.state=state;
  clearInput();show('pause-screen',true);show('countdown',false);show('touch-controls',false);
  resumeFocus=document.activeElement;$('resume-btn')?.focus();
}
function resume(){
  if(state!=='paused')return;
  state=previousState;document.body.dataset.state=state;accumulator=0;lastTime=performance.now()/1000;
  show('pause-screen',false);show('countdown',state==='countdown');show('touch-controls',touchDevice&&mode!=='duo');
  audio.start();resumeFocus?.blur();
}
function backToMenu(){
  state='menu';document.body.dataset.state=state;clearInput();
  show('menu',true);show('hud',false);show('results',false);show('pause-screen',false);show('countdown',false);show('touch-controls',false);
  document.body.classList.remove('split');
  for(const c of carts)c.visible=false;
  if(ghost)ghost.visible=false;
  for(const v of objectVisuals.values())v.visible=false;
  for(const p of particles){scene.remove(p.mesh);p.mesh.material.dispose();}particles.length=0;
  for(const p of trails){scene.remove(p.mesh);p.mesh.material.dispose();}trails.length=0;
  hero.visible=true;menuStats();updateQuality();$('solo-btn')?.focus();
  for(const p of spilledCargo)scene.remove(p.mesh);spilledCargo.length=0;
}

function endRun(){
  if(currentRunRecorded)return;currentRunRecorded=true;
  state='results';document.body.dataset.state=state;clearInput();
  show('results',true);show('hud',false);show('touch-controls',false);show('countdown',false);
  const p=players[0],score=Math.floor(p.score),oldBest=save.best,oldXP=save.xp;
  const highest=Math.max(...players.map(p=>Math.floor(p.score)));
  save.best=Math.max(save.best,highest);save.xp+=Math.floor(highest*.65);save.runs++;persist();
  const personalBest=score>oldBest;
  const winner=mode==='duo'?(Math.floor(players[0].score)===Math.floor(players[1].score)?-1:players[0].score>players[1].score?0:1):0;
  setText('result-eyebrow',mode==='duo'?'KVÄLLENS VIKTIGASTE RESULTAT':personalBest?'NYTT PERSONBÄSTA':p.health<=0?'LASTEN TOG SLUT':'90 SEKUNDER. NOLL ÅNGER.');
  setText('result-title',mode==='duo'?(winner<0?'Helt lika. Kör igen.':winner===0?'Du äger backen.':'Kompisen äger backen.'):shareTarget&&score>shareTarget?'Utmaningen krossad.':personalBest?'Det där var orimligt.':p.health<=0?'Snyggt. Nästan.':'Vilken jäkla vagn.');
  setText('result-score',number(highest));
  setText('result-subtitle',mode==='duo'?'Samma bana. Samma odds. En returmatch?':personalBest?`Ditt förra rekord: ${number(oldBest)} poäng`:shareTarget?`${number(Math.max(0,shareTarget-score))} poäng från utmaningen`:`Personbästa ${number(save.best)} · Försök ${save.runs}`);
  const stats=$('result-stats');
  if(stats){stats.replaceChildren();for(const [value,label] of [[`${(p.distance/1000).toFixed(2)} km`,'Distans'],[`${(p.totalAir||0).toFixed(1)} s`,'I luften'],[number(p.coins),'Mynt'],[`×${p.bestMultiplier||1}`,'Bästa kombo']]){const el=document.createElement('div');el.className='result-stat';const v=document.createElement('strong');v.textContent=value;const l=document.createElement('span');l.textContent=label;el.append(v,l);stats.append(el);}}
  const duo=$('duo-results');if(duo){duo.replaceChildren();duo.hidden=mode!=='duo';if(mode==='duo')players.forEach((p,i)=>{const row=document.createElement('div');row.className='duo-result-row'+(winner===i?' winner':'');const name=document.createElement('span');name.textContent=i===0?`Du · ${colorNames[save.color]}`:'Kompis · Mint';const val=document.createElement('strong');val.textContent=number(p.score);row.append(name,val);duo.append(row);});}
  const next=unlocks.find(n=>n>save.xp);setText('result-progress',next?`+${number(Math.floor(highest*.65))} XP · ${number(save.xp)} / ${number(next)} till nästa färg`:'Alla vagnfärger upplåsta. Nu jagar vi rekord.');
  const justUnlocked=unlocks.findIndex((n,i)=>i>0&&oldXP<n&&save.xp>=n);
  setText('unlock-note',justUnlocked>0?`${colorNames[justUnlocked]} upplåst. Finns i garaget.`:'');show('unlock-note',justUnlocked>0);
  if(isDaily&&(!ghostData||score>ghostData.score)&&ghostTrace.length>2){writeStore('yeet-ghost-'+runDate,{seed,score,trace:ghostTrace});writeStore('yeet-daily-best',{day:runDate,score});}
  audio.play('finish');$('again-btn')?.focus();
}

function flash(player,text,small=''){
  const el=$(`event-${player}`);if(!el)return;
  el.replaceChildren();const a=document.createElement('strong');a.textContent=text;el.append(a);
  if(small){const b=document.createElement('span');b.textContent=small;el.append(b);}
  el.hidden=false;el.classList.remove('pop');void el.offsetWidth;el.classList.add('pop');eventTimers[player]=1.7;
}

function burst(p,color='#ffe5a2',amount=12){
  if(save.reducedMotion)return;
  const x=centerX(p.s)+p.x,y=groundY(p.s)+p.y+1,z=-p.s;
  for(let i=0;i<amount;i++){
    if(particles.length>100)break;
    const material=particleMaterial.clone();material.color.set(color);
    const mesh=new THREE.Mesh(particleGeometry,material);mesh.position.set(x,y,z);scene.add(mesh);
    particles.push({mesh,v:new THREE.Vector3((Math.random()-.5)*7,Math.random()*5+1,(Math.random()-.5)*7),life:.6+Math.random()*.5,max:1});
  }
}

function spill(p){
  const cart=carts[p.id];if(!cart)return;
  updateCart(p,cart,0);cart.updateMatrixWorld(true);
  const goods=cart.userData.groceries||[];
  const from=Math.ceil(goods.length*p.health/3),to=Math.ceil(goods.length*(p.health+1)/3);
  for(let i=from;i<to&&i<goods.length;i++){
    const original=goods[i],copy=original.clone(true);copy.visible=true;
    original.getWorldPosition(copy.position);original.getWorldQuaternion(copy.quaternion);original.getWorldScale(copy.scale);
    scene.add(copy);spilledCargo.push({mesh:copy,v:new THREE.Vector3((Math.random()-.5)*7,4+Math.random()*3,-p.speed*.5),spin:new THREE.Vector3(Math.random()*4,Math.random()*4,Math.random()*3),life:2.7});
  }
}

function handleEvents(p,events){
  for(const event of events){
    if(p.id===0||mode==='duo')audio.play(event.type,event.intensity||1);
    switch(event.type){
      case 'coin':burst(p,'#ffd36c',4);break;
      case 'boost':burst(p,'#b6ffe6',10);flash(p.id,'FULL TANK','BOOST UPPLADDAD');break;
      case 'ring':burst(p,'#ffe197',15);flash(p.id,'MITT I PRICK',`+${number(event.points||250)} · LUFTBONUS`);audio.play('trick',.5);break;
      case 'jump':break;
      case 'trick':flash(p.id,'HELT ORIMLIGT',`+${number(event.points||300)} · BARREL ROLL`);burst(p,'#ffe6a2',18);break;
      case 'land':
        if((event.airtime||event.duration||0)>.65||event.points>50){flash(p.id,event.clean?'STOD PÅ HJULEN':'LITE SKAKIGT',`+${number(event.points||100)} · ${event.clean?'REN LANDNING':'OFÄRDIGT TRICK'}`);burst(p,'#fff1c9',8);}shakes[p.id]=save.reducedMotion?0:.1;break;
      case 'near':flash(p.id,'LITE FÖR NÄRA',`+${number(event.points||75)} · NEAR MISS`);break;
      case 'hit':shakes[p.id]=save.reducedMotion?0:event.damage===0?.2:.6;flash(p.id,event.damage===0?'BARA EN KON':p.health>0?'OJ. VAR DET ÖMTÅLIGT?':'SLUT PÅ LAST',event.damage===0?'TAPPAD FART · LASTEN HEL':p.health>0?`${p.health} LIV KVAR`:'DAGS FÖR EN NY VAGN');burst(p,'#ff8054',event.damage===0?8:20);if(event.damage>0)spill(p);break;
      case 'finish':if(mode==='duo'&&!players.every(p=>p.finished))flash(p.id,'DITT LOPP ÄR KLART','VÄNTAR PÅ KOMPISEN');break;
    }
  }
}

function updateHUD(){
  for(let i=0;i<players.length;i++){
    const p=players[i];
    setText(`p${i}-score`,number(p.score));
    setText(`p${i}-speed`,Math.round(p.speed*3.6));
    const boost=$(`p${i}-boost`);if(boost){boost.style.setProperty('--boost',`${clamp(p.boost||0,0,100)}%`);boost.style.width=`${clamp(p.boost||0,0,100)}%`;}
    const health=$(`p${i}-health`);if(health){health.setAttribute('aria-label',`${p.health} liv kvar`);health.innerHTML=[0,1,2].map(j=>`<span class="life${j<p.health?'':' is-lost'}">♥</span>`).join('');}
    setText(`p${i}-time`,`${Math.ceil(Math.max(0,p.timeLeft))}s`);
    const combo=Math.max(1,p.multiplier||1);setText(`p${i}-combo`,combo>1?`×${combo} KOMBO`:'');
    $(`p${i}-time`)?.classList.toggle('urgent',p.timeLeft<=10);
  }
}

function updateCart(p,cart,dt){
  cart.position.set(centerX(p.s)+p.x,groundY(p.s)+p.y,-p.s);
  const tangent=centerX(p.s+1)-centerX(p.s);
  cart.rotation.set(p.pitch||0,-Math.atan(tangent)-(p.steer||0)*.12,p.roll||0);
  // Roll around the loaded cart's center, keeping the physical flight path stable.
  if(!p.grounded){const pivot=new THREE.Vector3(0,1.15,0);const offset=pivot.clone().sub(pivot.clone().applyEuler(cart.rotation));cart.position.add(offset);}
  cart.position.y+=(p.grounded?Math.sin(time*p.speed*1.8)*.012:0);
  cart.visible=!(p.invulnerable>0&&Math.floor(time*15)%3===0);
  if(p.finished)cart.visible=true;
  for(const wheel of cart.userData.wheels||[])wheel.rotation.x-=p.speed*dt*3.3;
  const groceries=cart.userData.groceries||cart.userData.cargo;
  if(Array.isArray(groceries))groceries.forEach((g,i)=>{g.visible=i<Math.ceil(groceries.length*p.health/3);g.rotation.z=Math.sin(time*5+i)*.025*(p.speed/20+1);if(g.userData.baseY!==undefined)g.position.y=g.userData.baseY+Math.abs(Math.sin(time*8+i))*.025;});
  const rider=cart.userData.rider;if(rider)rider.rotation.z=-(p.steer||0)*.07;
}

function updateCamera(p,camera,dt,instant=false){
  const lookS=p.s+13;
  const speed=clamp((p.speed-20)/28,0,1);
  const cameraX=centerX(p.s-7)+p.x*.65;
  const target=new THREE.Vector3(cameraX,groundY(p.s)+4.5+p.y*.38,-p.s+9.8+speed);
  const follow=instant?1:1-Math.exp(-7*dt);
  camera.position.lerp(target,follow);
  if(shakes[p.id]>.01&&!save.reducedMotion){camera.position.x+=(Math.sin(time*67)*shakes[p.id]*.1);camera.position.y+=Math.cos(time*73)*shakes[p.id]*.06;}
  camera.lookAt(centerX(lookS)+p.x*.52,groundY(lookS)+1.6+p.y*.5,-lookS);
  const fov=57+(!save.reducedMotion?speed*6+(p.boosting?3:0):0);
  camera.fov=instant?fov:damp(camera.fov,fov,4,dt);camera.updateProjectionMatrix();
}

function updateGhost(){
  if(!ghost||!ghostData)return;
  const t=RUN_DURATION-players[0].timeLeft;
  const trace=ghostData.trace;
  let lo=0,hi=trace.length-1;
  while(lo+1<hi){const mid=(lo+hi)>>>1;if(trace[mid][0]<=t)lo=mid;else hi=mid;}
  const k=clamp(lo,0,trace.length-2);
  const a=trace[k],b=trace[k+1];if(!a||!b)return;
  const f=clamp((t-a[0])/Math.max(.001,b[0]-a[0]),0,1);
  const s=lerp(a[1],b[1],f),x=lerp(a[2],b[2],f),y=lerp(a[3],b[3],f);
  ghost.position.set(centerX(s)+x,groundY(s)+y,-s);
  const angleDelta=Math.atan2(Math.sin((b[4]||0)-(a[4]||0)),Math.cos((b[4]||0)-(a[4]||0)));
  ghost.rotation.set(lerp(a[5]||0,b[5]||0,f),-Math.atan(centerX(s+1)-centerX(s)),(a[4]||0)+angleDelta*f);
  ghost.visible=t<=trace[trace.length-1][0]&&Math.abs(s-players[0].s)<450;
}

function updateObjects(){
  const min=Math.min(...players.map(p=>p.s))-70;
  const max=Math.max(...players.map(p=>p.s))+650;
  const wanted=new Set();
  for(const obj of course){
    if(obj.s<min)continue;if(obj.s>max)break;
    if(!players.some(p=>obj.s>=p.s-70&&obj.s<=p.s+650))continue;
    wanted.add(obj.id);
    let visual=objectVisuals.get(obj.id);
    if(!visual){visual=createObject(obj);if(!visual)continue;visual.position.set(centerX(obj.s)+obj.x,groundY(obj.s),-obj.s);visual.rotation.y=-Math.atan(centerX(obj.s+1)-centerX(obj.s));visual.userData.courseObject=obj;scene.add(visual);objectVisuals.set(obj.id,visual);}
    visual.visible=true;
    if(obj.type==='coin'||obj.type==='boost'){
      visual.rotation.y=time*(obj.type==='coin'?2:1.1)+obj.id*.1;
      visual.position.y=groundY(obj.s)+Math.sin(time*2.5+obj.s)*.12;
    }
    if(obj.type==='ring')visual.rotation.z=Math.sin(time*.8+obj.s)*.035;
  }
  for(const [id,visual] of objectVisuals)if(!wanted.has(id)){scene.remove(visual);disposeObject(visual);objectVisuals.delete(id);}
}

function prepareView(i){
  const used=consumed[i];
  carts.forEach((cart,j)=>{cart.visible=j===i&&!(players[j].invulnerable>0&&Math.floor(time*15)%3===0);});
  for(const [id,v] of objectVisuals){
    const type=v.userData.courseObject.type;
    v.visible=v.userData.courseObject.s>=players[i].s-2&&(!used.has(id)||!['coin','boost','ring'].includes(type));
  }
}

function updateEffects(dt){
  for(let i=spilledCargo.length-1;i>=0;i--){
    const p=spilledCargo[i];p.life-=dt;
    if(p.life<=0){scene.remove(p.mesh);spilledCargo.splice(i,1);continue;}
    p.v.y-=16*dt;p.mesh.position.addScaledVector(p.v,dt);
    p.mesh.rotation.x+=p.spin.x*dt;p.mesh.rotation.y+=p.spin.y*dt;p.mesh.rotation.z+=p.spin.z*dt;
    const floor=groundY(-p.mesh.position.z)+.22;
    if(p.mesh.position.y<floor){p.mesh.position.y=floor;p.v.y=Math.abs(p.v.y)*.3;p.v.x*=.92;p.v.z*=.92;p.spin.multiplyScalar(.96);}
  }
  for(let i=particles.length-1;i>=0;i--){const p=particles[i];p.life-=dt;if(p.life<=0){scene.remove(p.mesh);p.mesh.material.dispose();particles.splice(i,1);continue;}p.v.y-=12*dt;p.mesh.position.addScaledVector(p.v,dt);p.mesh.rotation.x+=dt*4;p.mesh.material.opacity=Math.min(.9,p.life*2);}
  for(let i=trails.length-1;i>=0;i--){const p=trails[i];p.life-=dt;if(p.life<=0){scene.remove(p.mesh);p.mesh.material.dispose();trails.splice(i,1);continue;}p.mesh.material.opacity=p.life*.08;}
  for(const p of players){
    if(state==='playing'&&p.grounded&&!p.finished&&p.speed>24&&(Math.abs(p.steer)>.35||p.boosting)&&frameCount%4===0&&!save.reducedMotion){
      for(const side of [-.55,.55]){const m=new THREE.Mesh(trailGeometry,trailMaterial.clone());m.position.set(centerX(p.s)+p.x+side,groundY(p.s)+.025,-p.s+1);m.rotation.set(-Math.PI/2,0,-Math.atan(centerX(p.s+1)-centerX(p.s)));scene.add(m);trails.push({mesh:m,life:2.7});}
    }
  }
}

function updateLighting(s){
  const x=centerX(s),y=groundY(s);
  sun.position.set(x-35,y+65,-s+30);sun.target.position.set(x,y,-s-15);sun.target.updateMatrixWorld();
}

function renderMenu(dt){
  menuTime+=dt;
  const s=35;
  environment.update(s,time);updateLighting(s);
  hero.position.set(centerX(s)+1,groundY(s)+.05,-s);
  hero.rotation.set(-.035,Math.sin(menuTime*.2)*.09-.42,Math.sin(menuTime*1.2)*.006);
  const mobile=width<700;
  const angle=save.reducedMotion?0:Math.sin(menuTime*.13)*.4;
  cameraMenu.position.set(centerX(s)+6+angle,groundY(s)+3.2,-s+9);
  cameraMenu.lookAt(centerX(s)+(mobile?-1:-3),groundY(s)+1.4,-s-1);
  cameraMenu.fov=mobile?52:40;cameraMenu.updateProjectionMatrix();
  renderer.setScissorTest(false);renderer.setViewport(0,0,width,height);renderer.render(scene,cameraMenu);
}

function renderGame(dt){
  const minS=Math.min(...players.map(p=>p.s)),maxS=Math.max(...players.map(p=>p.s));
  environment.update(minS,time,maxS);
  updateObjects();
  for(let i=0;i<players.length;i++){updateCart(players[i],carts[i],state==='playing'?dt:0);updateCamera(players[i],cameras[i],dt);}
  updateGhost();
  renderer.setScissorTest(mode==='duo');
  for(let i=0;i<players.length;i++){
    const vw=mode==='duo'?Math.floor(width/2):width;
    const vx=mode==='duo'?i*vw:0;
    renderer.setViewport(vx,0,i===1?width-vx:vw,height);renderer.setScissor(vx,0,i===1?width-vx:vw,height);
    cameras[i].aspect=vw/height;cameras[i].updateProjectionMatrix();prepareView(i);
    environment.setView(players[i].s,time);updateLighting(players[i].s);
    renderer.render(scene,cameras[i]);
  }
  renderer.setScissorTest(false);
}

function frame(nowMs){
  requestAnimationFrame(frame);
  const now=nowMs/1000;
  const dt=Math.min(.05,lastTime?now-lastTime:1/60);lastTime=now;time+=dt;frameCount++;
  if(document.hidden)return;
  if(state==='menu'){renderMenu(dt);audio.update({speed:0,boosting:false,airborne:false},dt);return;}
  if(state==='loading'||!players.length)return;
  if(state==='countdown'){
    const before=Math.ceil(countdown);countdown-=dt;
    if(Math.ceil(countdown)!==before)audio.play('coin',.3);
    setText('countdown',countdown>.3?Math.ceil(countdown):'KÖR!');
    if(countdown<=0){state='playing';document.body.dataset.state=state;show('countdown',false);pressed.clear();}
  }
  if(state==='playing'){
    accumulator+=dt;
    let steps=0;
    while(accumulator>=FIXED_DT&&steps<8){
      for(let i=0;i<players.length;i++)if(!players[i].finished){const input=getInput(i);const events=stepPlayer(players[i],input,FIXED_DT,course,consumed[i])||[];handleEvents(players[i],events);}
      pressed.clear();accumulator-=FIXED_DT;steps++;
      if(isDaily&&!players[0].finished){traceSteps++;if(traceSteps%15===0){const p=players[0];ghostTrace.push([+(RUN_DURATION-p.timeLeft).toFixed(3),+p.s.toFixed(3),+p.x.toFixed(3),+p.y.toFixed(3),+(p.roll||0).toFixed(3),+(p.pitch||0).toFixed(3)]);}}
    }
    if(players.every(p=>p.finished))endRun();
    if(frameCount%3===0)updateHUD();
  }
  if(state!=='paused'){
    updateEffects(dt);
    for(let i=0;i<2;i++){shakes[i]=Math.max(0,shakes[i]-dt*2);if(eventTimers[i]>0){eventTimers[i]-=dt;if(eventTimers[i]<=0)show(`event-${i}`,false);}}
  }
  const p=players.find(p=>!p.finished)||players[0];audio.update({speed:state==='playing'?p.speed:0,boosting:state==='playing'&&p.boosting,airborne:!p.grounded},dt);
  renderGame(state==='paused'?0:dt);
}

function resize(){
  width=innerWidth;height=innerHeight;if(!renderer)return;
  renderer.setSize(width,height,false);cameraMenu.aspect=width/height;cameraMenu.updateProjectionMatrix();
  for(const c of cameras){c.aspect=(mode==='duo'?width/2:width)/height;c.updateProjectionMatrix();}
}

async function copyChallenge(){
  const best=Math.max(...players.map(p=>Math.floor(p.score)));
  const code=`YEET-${seed.toString(36).toUpperCase()}-${best.toString(36).toUpperCase()}`;
  try{await navigator.clipboard.writeText(code);say('Kod kopierad. Kompisen väljer ”Har du en kod?” i sin meny.',4500);}
  catch{
    let panel=$('share-fallback');
    if(!panel){panel=document.createElement('div');panel.id='share-fallback';panel.className='share-fallback';const label=document.createElement('label');label.htmlFor='share-url';label.textContent='Kopiera koden. Välj ”Har du en kod?” i menyn.';const input=document.createElement('input');input.id='share-url';input.readOnly=true;const close=document.createElement('button');close.textContent='Klart';close.addEventListener('click',()=>panel.remove());panel.append(label,input,close);$('results').append(panel);}
    $('share-url').value=code;$('share-url').focus();$('share-url').select();
  }
}

function openChallenge(){show('challenge-panel',true);show('challenge-error',false);$('challenge-code').value='';$('challenge-code').removeAttribute('aria-invalid');$('challenge-code').focus();}
function closeChallenge(){show('challenge-panel',false);$('challenge-open')?.focus();}
bind('challenge-open','click',openChallenge);
bind('challenge-close','click',closeChallenge);
bind('challenge-form','submit',e=>{
  e.preventDefault();const raw=$('challenge-code').value.trim().toUpperCase();
  const match=/^YEET-([0-9A-Z]{1,7})-([0-9A-Z]{1,6})$/.exec(raw);
  const parsedSeed=match?parseInt(match[1],36):NaN,parsedScore=match?parseInt(match[2],36):NaN;
  if(!match||parsedSeed>0xffffffff||parsedScore>10000000){setText('challenge-error','Koden verkar inte stämma. Kopiera hela YEET-koden.');show('challenge-error',true);$('challenge-code').setAttribute('aria-invalid','true');return;}
  importedChallenge={seed:parsedSeed,score:parsedScore};startRun('challenge');
});

bind('solo-btn','click',()=>startRun('solo'));
bind('duo-btn','click',()=>startRun('duo'));
bind('daily-btn','click',()=>startRun('daily'));
bind('again-btn','click',()=>startRun(isDaily?'daily':mode,true));
bind('menu-btn','click',backToMenu);
bind('resume-btn','click',resume);
bind('restart-btn','click',()=>startRun(isDaily?'daily':mode,true));
bind('quit-btn','click',backToMenu);
bind('pause-btn','click',pause);
bind('challenge-btn','click',copyChallenge);
bind('sound-btn','click',()=>{save.muted=!save.muted;audio.start();syncSettings();persist();});
bind('fullscreen-btn','click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{say('Helskärm stöds inte här. Öppna spelet i en egen flik.');}});
bind('help-btn','click',()=>{show('help-panel',true);$('help-close')?.focus();});
bind('help-close','click',()=>{show('help-panel',false);$('help-btn')?.focus();});
bind('quality-select','change',e=>{save.quality=e.target.value;updateQuality();persist();});
bind('motion-toggle','change',e=>{save.reducedMotion=e.target.checked;syncSettings();persist();});
bind('music-toggle','change',e=>{save.music=e.target.checked;syncSettings();persist();});
document.querySelectorAll('.color-choice').forEach((b,i)=>b.addEventListener('click',()=>{if(save.xp<unlocks[i]){say(`${number(unlocks[i]-save.xp)} XP kvar till ${colorNames[i].toLowerCase()}. Varje lopp räknas.`);return;}save.color=i;persist();newHero();menuStats();audio.play('coin',.3);}));

const gameKeys=new Set(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','ShiftLeft','ShiftRight','Enter','NumpadEnter']);
addEventListener('keydown',e=>{
  if(e.target instanceof HTMLInputElement||e.target instanceof HTMLSelectElement){if(e.code==='Escape'&&!$('challenge-panel')?.hidden){e.preventDefault();closeChallenge();}return;}
  if(gameKeys.has(e.code)&&(state==='playing'||state==='countdown'))e.preventDefault();
  if(!keys.has(e.code))pressed.add(e.code);keys.add(e.code);
  if(e.repeat)return;
  if(e.code==='Escape'||e.code==='KeyP'){if(!$('challenge-panel')?.hidden)closeChallenge();else if(state==='paused')resume();else if(!$('help-panel')?.hidden)show('help-panel',false);else pause();}
  if(e.code==='KeyM'){save.muted=!save.muted;syncSettings();persist();}
  if(e.code==='KeyR'&&(state==='results'||state==='paused'))startRun(isDaily?'daily':mode,true);
});
addEventListener('keyup',e=>keys.delete(e.code));
addEventListener('blur',()=>{clearInput();pause();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){clearInput();pause();}lastTime=0;});
addEventListener('resize',resize);
addEventListener('gamepadconnected',e=>{gamepadIndex=e.gamepad.index;say('Handkontroll ansluten. A: hopp · RT/B: boost · LT: broms.');});
addEventListener('gamepaddisconnected',e=>{if(e.gamepad.index===gamepadIndex)gamepadIndex=-1;});
document.querySelectorAll('[data-control]').forEach(b=>{
  const control=b.dataset.control;
  b.addEventListener('pointerdown',e=>{e.preventDefault();b.setPointerCapture(e.pointerId);touch[control]=true;b.classList.add('is-active');if(control==='jump')pressed.add('touchJump');});
  const release=e=>{e.preventDefault();touch[control]=false;b.classList.remove('is-active');};
  b.addEventListener('pointerup',release);b.addEventListener('pointercancel',release);b.addEventListener('lostpointercapture',()=>{touch[control]=false;b.classList.remove('is-active');});
});

// A small read-only status surface makes runtime failures diagnosable without changing play state.
Object.defineProperty(window,'yeetStatus',{get:()=>({state,mode,seed,players:players.map(p=>({id:p.id,s:Math.round(p.s),x:+p.x.toFixed(2),y:+p.y.toFixed(2),speed:+p.speed.toFixed(1),score:Math.floor(p.score),health:p.health,timeLeft:p.timeLeft,finished:p.finished})),objects:objectVisuals.size,drawCalls:renderer?.info.render.calls,triangles:renderer?.info.render.triangles})});
try{setup();}catch(error){console.error(error);show('loading',false);show('error-screen',true);setText('error-detail','Spelet kunde inte starta. Ladda om sidan eller prova grafikläget på en annan webbläsare.');}
