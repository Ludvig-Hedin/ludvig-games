/* Input, game loop, camera, activities and HUD. */
(function(){'use strict';
const S=window.SKY,$=id=>document.getElementById(id),{clamp,lerp,damp,wrap,matrix:M,transform}=S;
const safeStore={get(k,fallback){try{return JSON.parse(localStorage.getItem(k))??fallback;}catch{return fallback;}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch{}}};
const settings=Object.assign({volume:.65,sensitivity:1,invert:false,mouse:true,quality:1.35,muted:false},safeStore.get('skyline-settings-v3',{}));
const audio=new S.FlightAudio();audio.volume=clamp(Number(settings.volume)||0,0,1);audio.muted=!!settings.muted;
let renderer,world;const coarseQuery=matchMedia('(pointer: coarse)'),touchUI=()=>coarseQuery.matches;const keys=new Set(),touch=new Set(),pointer={active:false,x:0,y:0,startX:0,startY:0,id:null};
const game={phase:'menu',activity:'free',flight:S.createFlight(),gate:0,score:0,combo:1,comboTime:0,totalGates:0,nearMisses:0,elapsed:0,worldTime:0,flightTime:0,crashes:0,
 camera:0,particles:[],lowTime:0,lowPoints:0,previousBoost:false,toastTime:0,radioTime:0,nextRadio:23,best:safeStore.get('skyline-best-v3',0),landingDone:false,
 eye:[24,83,-223],look:[-7,72,-285],fov:61,snapCamera:true,frameCount:0,renderedFrames:0,uiTime:0};
const random=S.random(98312),cameraNames=['CHASE CAM','COCKPIT CAM','WIDE CAM'];
let firstReady=false,accumulator=0,last=0,wasHidden=false;
function saveSettings(){safeStore.set('skyline-settings-v3',settings);}
function clearInput(){keys.clear();touch.clear();pointer.active=false;pointer.x=pointer.y=0;$('pointerGuide').hidden=true;}
function input(){
 const has=(key)=>keys.has(key),left=has('KeyA')||has('ArrowLeft')||touch.has('left'),right=has('KeyD')||has('ArrowRight')||touch.has('right');
 const up=has('ArrowUp')||touch.has('up'),down=has('ArrowDown')||touch.has('down');
 return{turn:clamp(Number(right)-Number(left)+(pointer.active?pointer.x:0),-1,1),climb:clamp((Number(up)-Number(down)+(pointer.active?-pointer.y:0))*(settings.invert?-1:1),-1,1),
 throttle:Number(has('KeyW')||touch.has('faster'))-Number(has('KeyS')||touch.has('slower')),boost:has('ShiftLeft')||has('ShiftRight')||touch.has('boost'),brake:has('Space')||touch.has('brake'),sensitivity:settings.sensitivity};
}
function toast(title,sub='',duration=2){$('toastTitle').textContent=title;$('toastSub').textContent=sub;game.toastTime=duration;$('toast').classList.add('show');}
function radio(text,name='COAST TOWER',duration=6.5){$('radioText').textContent=text;$('radioName').textContent=name;game.radioTime=duration;$('radio').classList.add('show');audio.play('radio');}
function award(points){game.score+=Math.round(points);if(game.score>game.best){game.best=game.score;safeStore.set('skyline-best-v3',game.best);}}
function sparks(x,y,z,count=20,scale=1){for(let i=0;i<count;i++){game.particles.push({x,y,z,vx:(random()-.5)*25*scale,vy:(random()-.2)*16*scale,vz:(random()-.5)*25*scale,life:.7+random()*.5,max:1.2,size:(.25+random()*.6)*scale});}if(game.particles.length>95)game.particles.splice(0,game.particles.length-95);}
function toggleSound(){audio.unlock();settings.muted=!settings.muted;audio.setMute(settings.muted);$('soundBtn').classList.toggle('is-off',settings.muted);$('soundBtn').setAttribute('aria-label',settings.muted?'Unmute sound (M)':'Mute sound (M)');saveSettings();}
function selectActivity(name){game.activity=name;for(const b of document.querySelectorAll('[data-activity]')){const selected=b.dataset.activity===name;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));}$('runwayBtn').hidden=name==='landing';$('flyBtn').innerHTML=(name==='landing'?'Practice landing':'Fly now')+' <svg><use href="#i-arrow"/></svg>';}
function start(spawn='air'){
 if(!world)return;audio.unlock();clearInput();game.phase='playing';
 Object.assign(game,{gatePulse:null,kick:0,gate:0,score:0,combo:1,comboTime:0,totalGates:0,nearMisses:0,elapsed:0,flightTime:0,crashes:0,particles:[],lowTime:0,lowPoints:0,previousBoost:false,landingDone:false,nextRadio:23,toastTime:0,radioTime:0,snapCamera:true});
 game.flight=S.createFlight(spawn);$('toast').classList.remove('show');for(const p of world.planes)p.nearCooldown=0;
 if(game.activity==='landing'){Object.assign(game.flight,{x:0,y:81,z:900,speed:51,throttle:.37,heading:0,pitch:0});}
 for(const id of['menu','pause','crash','finish'])$(id).hidden=true;document.body.classList.add('playing');$('touch').style.visibility='visible';
 if(game.activity==='landing')radio('Runway 36 is yours. Keep below 110 knots, line up, and hold the down arrow for a gentle approach.');
 else if(spawn==='runway')radio('SKYLINE 01, cleared for departure. Hold W; takeoff assist will lift you off the runway.');
 else radio('SKYLINE 01, you’re clear of the airfield. Follow the gold gates, or make your own route.');
 setMission();updateUI(0);updateCamera(1);audio.update(game.flight,true,.016,game.camera);audio.play('ui');
}
function showMenu(){clearInput();game.phase='menu';for(const id of['pause','crash','finish'])$(id).hidden=true;$('menu').hidden=false;document.body.classList.remove('playing');$('touch').style.visibility='hidden';
 game.flight=S.createFlight();game.snapCamera=true;game.camera=0;game.particles=[];audio.update(game.flight,false,.016,game.camera);updateCamera(1);}
function pause(value){
 if(value&&game.phase!=='playing')return;if(!value&&game.phase!=='paused')return;
 clearInput();game.phase=value?'paused':'playing';audio.update(game.flight,!value,.016,game.camera);$('pause').hidden=!value;$('touch').style.visibility=value?'hidden':'visible';
 if(value)$('resumeBtn').focus();else{audio.unlock();$('scene').focus?.();}
}
function recover(){
 if(!['playing','crashed','paused'].includes(game.phase))return;
 const s=S.createFlight();
 if(game.activity==='landing')Object.assign(s,{x:0,y:81,z:900,speed:51,throttle:.37});
 else if(game.gate>0){const g=S.route[game.gate],d=160;Object.assign(s,{x:g.x-g.nx*d,y:g.y,z:g.z-g.nz*d,heading:Math.atan2(g.nx,-g.nz),speed:53,throttle:.47});s.y=Math.max(s.y,S.groundAt(s.x,s.z)+48);}
 clearInput();game.flight=s;game.phase='playing';game.combo=1;game.comboTime=0;game.snapCamera=true;game.landingDone=false;game.particles=[];
 $('crash').hidden=true;$('pause').hidden=true;$('touch').style.visibility='visible';audio.unlock();audio.play('ui');toast('Back in the air','',1.6);updateCamera(1);
}
function endFlight(title,detail){
 if(game.phase==='finished')return;clearInput();game.phase='finished';audio.update(game.flight,false,.016,game.camera);$('finish').hidden=false;$('finishTitle').textContent=title;$('finishDetail').textContent=detail;$('finishDetail').hidden=!detail;lgBoard($('finishBoard'),'skyline');
 $('finalScore').textContent=game.score.toLocaleString();$('finalGates').textContent=game.totalGates;$('finalNear').textContent=game.nearMisses;$('touch').style.visibility='hidden';audio.play('finish');$('againBtn').focus();
}
function setMission(){
 const a=game.activity;$('activityLabel').textContent=a==='free'?'FREE FLIGHT':a==='coast'?'3-MINUTE COAST RUN':'LANDING SCHOOL';
 $('missionTitle').textContent=a==='landing'?'Land on runway 36':a==='coast'?'20 gates, 3 minutes':'Follow the gates';
 $('missionDetail').innerHTML=a==='landing'?'Line up with the runway.<br>Below 110 KN, hold ↓ to glide.<br>After touchdown, hold '+(touchUI()?'BRAKE':'Space')+'.':a==='coast'?'Clean passes build your combo.':'Fly through the gold gate.';
}
function update(dt){
 if(game.phase==='paused'||game.phase==='finished')return;
 game.worldTime+=dt;world.update(dt,game.worldTime);
 for(let i=game.particles.length-1;i>=0;i--){const p=game.particles[i];p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;p.vy-=6*dt;if(p.life<=0)game.particles.splice(i,1);}
 if(game.toastTime>0){game.toastTime-=dt;if(game.toastTime<=0)$('toast').classList.remove('show');}
 if(game.radioTime>0){game.radioTime-=dt;if(game.radioTime<=0)$('radio').classList.remove('show');}
 if(game.phase!=='playing')return;
 const s=game.flight,i=input();S.stepFlight(s,i,dt,p=>world.checkCollision(p));
 game.flightTime+=dt;
 if(!s.grounded||s.flyingTime>0)game.elapsed+=dt;
 for(const e of s.events){
  if(e.type==='takeoff'){audio.play('takeoff');toast('Airborne','',1.6);}
  if(e.type==='landing'){audio.play('landing');award(750);game.landingDone=true;toast('Touchdown',touchUI()?'+750 · HOLD BRAKE TO STOP':'+750 · HOLD SPACE TO STOP',3);}
  if(e.type==='boundary')radio('That’s the edge of our airspace. Turning you back toward the islands.');
  if(e.type==='crash'){
   game.phase='crashed';game.crashes++;audio.update(s,false,.016,game.camera);audio.play('crash');sparks(s.x,s.y,s.z,26,2);$('crashReason').textContent=e.reason;$('crash').hidden=false;$('touch').style.visibility='hidden';clearInput();$('recoverBtn').focus();
  }
 }
 if(s.crashed)return;
 if(game.landingDone&&s.grounded&&s.speed<2&&game.activity==='landing'){endFlight('Landed','');return;}
 if(s.boosting&&!game.previousBoost){audio.play('boost');game.kick=Math.max(game.kick||0,2.5);}game.previousBoost=s.boosting;
 if(game.comboTime>0)game.comboTime-=dt;else game.combo=1;
 if(game.activity!=='landing'){
  const g=S.route[game.gate];
  if(S.crossedGate(s.previous,s,g)){
   const offset=Math.hypot(s.x-g.x,s.y-g.y,s.z-g.z),perfect=offset<15,points=(perfect?250:150)*game.combo;
   award(points);audio.play(perfect?'perfect':'gate');sparks(s.x,s.y,s.z,perfect?30:18,perfect?1.6:1.25);game.gatePulse={i:game.gate,t:game.worldTime,perfect};game.kick=Math.max(game.kick||0,perfect?5:3);game.totalGates++;game.gate=(game.gate+1)%S.route.length;game.combo=Math.min(5,game.combo+1);game.comboTime=13;
   toast(perfect?'Perfect':'Gate',`+${points} · COMBO ×${game.combo}`,1.65);
   if(game.gate===0){award(1500);if(game.activity==='coast'){endFlight('Coast complete',`All 20 gates · ${Math.max(0,Math.ceil(180-game.elapsed))} s left`);return;}else toast('Lap complete','+1,500',3);}
  }
 }
 const agl=s.y-S.groundAt(s.x,s.z)-S.WORLD.clearance;
 if(!s.grounded&&agl>7&&agl<33&&s.speed>42){game.lowTime+=dt;if(game.lowTime>=1){game.lowTime-=1;award(15);game.lowPoints+=15;if(game.lowPoints%90===0)toast('Low flight','+90',1.4);}}
 else game.lowTime=0;
 for(const p of world.planes){const d=Math.hypot(s.x-p.x,s.y-p.y,s.z-p.z);if(d>7&&d<33&&p.nearCooldown===0&&!s.grounded){p.nearCooldown=14;game.nearMisses++;const pts=250*game.combo;award(pts);audio.play('near',((p.x-s.x)*Math.cos(s.heading)+(p.z-s.z)*Math.sin(s.heading))/d);toast('Near miss',`+${pts}`,2);}}
 if(game.activity==='coast'&&game.elapsed>=180){endFlight('Time’s up',`${game.totalGates} of 20 gates`);return;}
}
function updateCamera(dt){
 const s=game.flight,f=[Math.sin(s.heading),0,-Math.cos(s.heading)];let eye,look;
 if(game.phase==='menu'){
  eye=[s.x+24+Math.sin(game.worldTime*.065)*3,s.y+12,s.z+31];look=[s.x-7,s.y+2,s.z-14];
 }else if(game.camera===1){
  const model=M(s.x,s.y,s.z,s.heading,s.pitch,s.bank*.20);eye=transform(model,[0,1.43,-1.43]);look=transform(model,[0,1.15,-65]);
 }else{
  const portrait=clamp(innerHeight/innerWidth,1,2.1),d=(game.camera===2?33:21)*portrait,h=(game.camera===2?11:6.1)*Math.sqrt(portrait);
  eye=[s.x-f[0]*d,s.y+h,s.z-f[2]*d];look=[s.x+f[0]*43,s.y+1.35+s.vy*.19,s.z+f[2]*43];
  eye[1]=Math.max(eye[1],S.groundAt(eye[0],eye[2])+2.8);
 }
 const k=game.camera===1?16:4.6;
 for(let j=0;j<3;j++){game.eye[j]=game.snapCamera?eye[j]:damp(game.eye[j],eye[j],k,dt);game.look[j]=game.snapCamera?look[j]:damp(game.look[j],look[j],7,dt);}
 game.snapCamera=false;game.kick=damp(game.kick||0,0,4,dt);game.fov=damp(game.fov,game.camera===1?74:61+(s.boosting?6:0)+clamp((s.speed-70)*.045,0,2),3,dt);
}
const mapImage=document.createElement('canvas');mapImage.width=150;mapImage.height=150;
function buildMap(){const c=mapImage.getContext('2d'),data=c.createImageData(150,150);for(let y=0;y<150;y++)for(let x=0;x<150;x++){const h=S.heightAt((x/150-.5)*3200,(y/150-.5)*3200),i=(y*150+x)*4;const col=h<1?[40,83,89]:h<10?[141,153,114]:h<70?[100,131,94]:[85+h*.1,114+h*.08,84+h*.09];for(let k=0;k<3;k++)data.data[i+k]=col[k];data.data[i+3]=255;}c.putImageData(data,0,0);}
function updateMap(){
 const c=$('map').getContext('2d'),w=c.canvas.width,h=c.canvas.height;const sx=x=>w/2+x*w/3200,sy=z=>h/2+z*h/3200;
 c.clearRect(0,0,w,h);c.globalAlpha=.78;c.drawImage(mapImage,0,0,w,h);c.globalAlpha=1;
 c.strokeStyle='#bbd2ba22';c.lineWidth=1;for(let i=1;i<4;i++){c.beginPath();c.moveTo(i*w/4,0);c.lineTo(i*w/4,h);c.moveTo(0,i*h/4);c.lineTo(w,i*h/4);c.stroke();}
 c.strokeStyle='#fff2d294';c.lineWidth=3;c.beginPath();c.moveTo(sx(0),sy(-530));c.lineTo(sx(0),sy(450));c.stroke();
 if(game.activity!=='landing'){
  c.strokeStyle='#f5d39188';c.lineWidth=1.5;c.setLineDash([4,5]);c.beginPath();for(let j=0;j<5;j++){const g=S.route[(game.gate+j)%S.route.length];if(j===0)c.moveTo(sx(g.x),sy(g.z));else c.lineTo(sx(g.x),sy(g.z));}c.stroke();c.setLineDash([]);
  const g=S.route[game.gate];c.strokeStyle='#ffd697';c.lineWidth=2;c.beginPath();c.arc(sx(g.x),sy(g.z),5.5+Math.sin(game.worldTime*3)*1.3,0,S.TAU);c.stroke();
 }
 for(const p of world.planes){c.save();c.translate(sx(p.x),sy(p.z));c.rotate(p.heading);c.fillStyle='#d9e7cb';c.beginPath();c.moveTo(0,-4.5);c.lineTo(-3,3.5);c.lineTo(3,3.5);c.fill();c.restore();}
 const s=game.flight;c.save();c.translate(clamp(sx(s.x),7,w-7),clamp(sy(s.z),7,h-7));c.rotate(s.heading);c.shadowBlur=5;c.shadowColor='#ffe0a1';c.fillStyle='#ffdba3';c.beginPath();c.moveTo(0,-8);c.lineTo(-5,6);c.lineTo(0,3);c.lineTo(5,6);c.closePath();c.fill();c.restore();
 c.font='600 14px system-ui';c.fillStyle='#edf0d3';c.textAlign='center';c.fillText('N',w/2,17);
}
function target(){if(game.activity==='landing')return{x:0,y:17.5,z:330};return S.route[game.gate];}
function updateUI(dt){
 const s=game.flight,agl=Math.max(0,s.y-S.groundAt(s.x,s.z)-S.WORLD.clearance),knots=s.speed*1.94384,heading=(s.heading*180/Math.PI+360)%360;
 $('speed').textContent=Math.round(knots);$('altitude').textContent=Math.round(agl*3.28084);$('throttle').textContent=Math.round(s.throttle*100)+'%';$('throttleBar').style.width=s.throttle*100+'%';$('altTrend').dataset.t=s.vy>1?'up':s.vy< -1?'down':'';
 $('flightState').textContent=s.grounded?'ON THE RUNWAY':s.boosting?'BOOST ENGAGED':s.stall>.15?'LOW AIRSPEED':'STABLE FLIGHT';
 $('score').textContent=game.score.toLocaleString();$('best').textContent=game.best.toLocaleString();$('combo').textContent=game.combo>1?'COMBO ×'+game.combo:'';
 $('boostBar').style.width=s.energy*100+'%';$('boostLabel').textContent=s.boosting?'BOOSTING':s.boostLock?'RECHARGING':'BOOST';
 $('gateCount').textContent=game.activity==='landing'?(game.landingDone?'TOUCHDOWN':'RUNWAY 36'):`GATE ${String(game.gate+1).padStart(2,'0')} / 20`;
 $('missionBar').style.width=game.activity==='landing'?(game.landingDone?100:clamp(1-Math.abs(s.z-330)/650,0,.85)*100)+'%':game.gate/20*100+'%';
 const remain=Math.max(0,Math.ceil(180-game.elapsed));$('clock').textContent=game.activity==='coast'?`${Math.floor(remain/60)}:${String(remain%60).padStart(2,'0')}`:game.activity==='landing'?(knots<110?'SPEED OK':'SLOW DOWN'):'NO RUSH';
 $('heading').textContent=String(Math.round(heading)%360).padStart(3,'0')+'°';
 const cw=$('compass').clientWidth;const tape=$('compassTape');tape.style.transform=`translateX(${cw/2-30-(heading+360)/30*60}px)`;
 let warning='';if(s.boundary)warning='EDGE OF AIRSPACE · TURN BACK';else if(s.stall>.15&&!s.grounded)warning=touchUI()?'LOW AIRSPEED · HOLD SPD+':'LOW AIRSPEED · HOLD W';else if(agl<24&&s.vy< -3&&!s.grounded&&!S.onRunway(s.x,s.z,15))warning='LOW ALTITUDE · PULL UP ↑';
 $('warning').hidden=!warning;$('warning').textContent=warning;
 if(touchUI()){
  if(s.grounded)$('flightHint').innerHTML=game.landingDone?'<strong>Touchdown. Hold BRAKE to stop.</strong>':'<strong>Hold SPD+ to accelerate. Takeoff is automatic.</strong><div class="hint-sub">← / → steers on the ground. BRAKE slows you down.</div>';
  else if(game.activity==='landing')$('flightHint').innerHTML=knots>110?'<strong>Hold SPD− to slow below 110 KN.</strong>':'<strong>Hold ↓ for a gentle glide toward the runway.</strong><div class="hint-sub">The approach assist limits your descent. BRAKE after touchdown.</div>';
  else if(game.flightTime<14)$('flightHint').innerHTML='<strong>← / → turns. ↑ climbs. ↓ descends.</strong><div class="hint-sub">Release to level out. SPD+ / SPD− only changes speed.</div>';
  else $('flightHint').textContent='';
 }
 else if(s.grounded)$('flightHint').innerHTML=game.landingDone?'<strong>Touchdown. Hold Space to stop.</strong>':'<strong>Hold W to accelerate. Takeoff is automatic.</strong><div class="hint-sub">A / D steers on the ground. Space brakes.</div>';
 else if(game.activity==='landing')$('flightHint').innerHTML=knots>110?'<strong>Hold S to slow below 110 KN.</strong>':'<strong>Hold ↓ for a gentle glide toward the runway.</strong><div class="hint-sub">The approach assist limits your descent. Space brakes after touchdown.</div>';
 else if(game.flightTime<14)$('flightHint').innerHTML='<strong>A / D turns. ↑ climbs. ↓ descends.</strong><div class="hint-sub">Release to level out. W / S only changes speed.</div>';
 else $('flightHint').textContent='';
 updateMap();
}
function updateLabels(){
 if(!renderer||game.phase==='menu')return;const s=game.flight,g=target(),p=renderer.project(g),d=Math.hypot(g.x-s.x,g.y-s.y,g.z-s.z),el=$('target');
 const inside=p.front&&p.x>80&&p.x<innerWidth-80&&p.y>100&&p.y<innerHeight-190;
 const dx=g.x-s.x,dz=g.z-s.z,angle=wrap(Math.atan2(dx,-dz)-s.heading);
 if(inside){el.style.left=p.x+'px';el.style.top=p.y+'px';el.classList.remove('edge');}
 else{const cx=innerWidth/2,cy=innerHeight/2,a=p.front?Math.atan2(p.y-cy,p.x-cx):angle<0?Math.PI:0;el.style.left=clamp(cx+Math.cos(a)*(cx-69),64,innerWidth-64)+'px';el.style.top=clamp(cy+Math.sin(a)*(cy-135),100,innerHeight-160)+'px';el.classList.add('edge');el.style.setProperty('--angle',(a*180/Math.PI+90)+'deg');}
 $('targetText').textContent=(game.activity==='landing'?'RUNWAY 36':inside?'NEXT GATE':'TURN '+(angle>0?'RIGHT':'LEFT'))+' · '+(d>1000?(d/1000).toFixed(1)+' km':Math.round(d)+' m');
 el.style.opacity=game.phase==='crashed'?'0':'1';
}
function renderFrame(timestamp){
 requestAnimationFrame(renderFrame);if(!firstReady)return;
 const dt=last?Math.min((timestamp-last)/1000,.12):1/60;last=timestamp;
 // Fixed steps keep ground contact, controls, scoring and timers frame-rate independent.
 if(game.phase!=='paused'&&game.phase!=='finished'){
  accumulator+=dt;let steps=0;while(accumulator>=1/120&&steps<15){update(1/120);accumulator-=1/120;steps++;}
 }else accumulator=0;
 if(!document.hidden){
  updateCamera(dt);renderer.begin(game.eye,game.look,game.fov+(game.kick||0),game.worldTime);world.draw(renderer,game.flight,game);updateLabels();game.renderedFrames++;
 }
 game.uiTime+=dt;if(game.uiTime>=.07){updateUI(game.uiTime);audio.update(game.flight,game.phase==='playing',game.uiTime,game.camera);game.uiTime=0;}
 game.frameCount++;
}
function keyDown(e){
 const focused=e.target,editing=focused instanceof HTMLInputElement||focused instanceof HTMLSelectElement;
 if(editing&&e.code!=='Escape')return;
 if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)&&game.phase==='playing')e.preventDefault();
 if(e.code==='Escape'){e.preventDefault();if(game.phase==='playing')pause(true);else if(game.phase==='paused')pause(false);return;}
 if(!e.repeat){
  if(e.code==='KeyM'){toggleSound();return;}
  if(e.code==='KeyC'&&game.phase==='playing'){game.camera=(game.camera+1)%3;game.snapCamera=true;toast(cameraNames[game.camera],'',1.2);audio.play('ui');return;}
  if(e.code==='KeyR'&&game.phase!=='menu'&&game.phase!=='finished'){recover();return;}
  if(e.code==='Enter'&&game.phase==='menu'&&!(focused instanceof HTMLButtonElement)){start('air');return;}
 }
 if(game.phase==='playing'){keys.add(e.code);audio.unlock();}
}
window.addEventListener('keydown',keyDown);window.addEventListener('keyup',e=>keys.delete(e.code));
window.addEventListener('blur',()=>{clearInput();if(game.phase==='playing')pause(true);});
document.addEventListener('visibilitychange',()=>{if(document.hidden){clearInput();if(game.phase==='playing')pause(true);}last=0;});
$('scene').addEventListener('pointerdown',e=>{
 if(game.phase!=='playing'||!settings.mouse||e.button!==0)return;audio.unlock();pointer.active=true;pointer.id=e.pointerId;pointer.startX=e.clientX;pointer.startY=e.clientY;pointer.x=pointer.y=0;
 $('scene').setPointerCapture?.(e.pointerId);$('pointerGuide').hidden=false;$('pointerGuide').style.left=e.clientX+'px';$('pointerGuide').style.top=e.clientY+'px';
});
$('scene').addEventListener('pointermove',e=>{if(!pointer.active||e.pointerId!==pointer.id)return;pointer.x=clamp((e.clientX-pointer.startX)/105,-1,1);pointer.y=clamp((e.clientY-pointer.startY)/105,-1,1);$('pointerDot').style.left=48+pointer.x*37+'px';$('pointerDot').style.top=48+pointer.y*37+'px';});
function releasePointer(){pointer.active=false;pointer.x=pointer.y=0;$('pointerGuide').hidden=true;}
for(const name of['pointerup','pointercancel','lostpointercapture'])$('scene').addEventListener(name,releasePointer);
for(const b of document.querySelectorAll('.touchbtn')){
 b.addEventListener('pointerdown',e=>{if(game.phase!=='playing')return;e.preventDefault();b.setPointerCapture(e.pointerId);touch.add(b.dataset.control);audio.unlock();});
 for(const name of['pointerup','pointercancel','lostpointercapture'])b.addEventListener(name,()=>touch.delete(b.dataset.control));
}
for(const b of document.querySelectorAll('[data-activity]'))b.addEventListener('click',()=>{selectActivity(b.dataset.activity);audio.unlock();audio.play('ui');});
$('flyBtn').onclick=()=>start('air');$('runwayBtn').onclick=()=>start('runway');$('pauseBtn').onclick=()=>pause(true);$('resumeBtn').onclick=()=>pause(false);$('closePause').onclick=()=>pause(false);
$('soundBtn').onclick=toggleSound;$('cameraBtn').onclick=()=>{game.camera=(game.camera+1)%3;game.snapCamera=true;toast(cameraNames[game.camera],'',1.2);audio.play('ui');};
$('recoverBtn').onclick=recover;
function lgBoard(el,board){try{const u=window.Ludvig&&window.Ludvig.ui;if(!el)return;if(el._lg&&el._lg.destroy){try{el._lg.destroy()}catch(_){}}el._lg=null;el.textContent='';el.hidden=!u;if(u)el._lg=u.board(el,{board,limit:5,periods:['7d','30d','all']});}catch(e){}}
function lgOpen(board){try{window.Ludvig&&window.Ludvig.ui&&window.Ludvig.ui.open({board});}catch(e){}}
for(const id of['menuBoardBtn','pauseBoardBtn']){const b=$(id);b.hidden=!(window.Ludvig&&window.Ludvig.ui);b.addEventListener('click',e=>{e.stopPropagation();lgOpen('skyline');});}
for(const id of['returnMenu','crashMenu','finishMenu'])$(id).onclick=showMenu;$('againBtn').onclick=()=>start('air');
$('volume').value=settings.volume*100;$('sensitivity').value=settings.sensitivity*100;$('mouseEnabled').checked=settings.mouse;$('invert').checked=settings.invert;$('quality').value=settings.quality;
$('volume').oninput=e=>{settings.volume=Number(e.target.value)/100;audio.setVolume(settings.volume);saveSettings();};
$('sensitivity').oninput=e=>{settings.sensitivity=Number(e.target.value)/100;saveSettings();};
$('mouseEnabled').onchange=e=>{settings.mouse=e.target.checked;releasePointer();saveSettings();};$('invert').onchange=e=>{settings.invert=e.target.checked;saveSettings();};
$('quality').onchange=e=>{settings.quality=Number(e.target.value);renderer.quality=settings.quality;renderer.resize();saveSettings();};
$('soundBtn').classList.toggle('is-off',settings.muted);
window.addEventListener('resize',()=>{if(renderer)renderer.resize();});
// Instrument tape extends across the 0/360 seam without jumping.
for(let i=-360;i<=720;i+=30){const span=document.createElement('span');const v=(i+720)%360;span.textContent=({0:'N',90:'E',180:'S',270:'W'})[v]||String(v).padStart(3,'0');$('compassTape').appendChild(span);}
function init(){
 try{
  renderer=new S.Renderer($('scene'));renderer.quality=settings.quality;renderer.resize();world=S.makeWorld(renderer);world.update(0,0);buildMap();
  $('flyBtn').disabled=false;$('runwayBtn').disabled=false;$('menuMeta').textContent='';$('menuMeta').parentNode.hidden=true;$('touch').style.visibility='hidden';firstReady=true;requestAnimationFrame(renderFrame);
  window.__skyline={
   getState:()=>({phase:game.phase,activity:game.activity,flight:{...game.flight,events:[...game.flight.events]},gate:game.gate,score:game.score,elapsed:game.elapsed,combo:game.combo,camera:game.camera,renderedFrames:game.renderedFrames,npcCount:world.planes.length,boats:world.boats.length,cars:world.vehicles.length,drawCalls:renderer.draws}),
   getAudio:()=>({supported:audio.supported,state:audio.ctx?.state||'not-started',muted:audio.muted,volume:audio.volume,events:audio.events,level:audio.level()})
  };
  // Scenario seeding and manual stepping exist only in the automated-test harness.
  if(window.SKYLINE_TEST)Object.assign(window.__skyline,{advance(seconds){for(let n=0;n<Math.round(seconds*120);n++)update(1/120);updateCamera(.25);updateUI(.1);audio.update(game.flight,game.phase==='playing',.1,game.camera);},setFlight(patch){Object.assign(game.flight,patch);game.snapCamera=true;},setGate(n){game.gate=n;},setElapsed(n){game.elapsed=n;},setNPC(n,patch){Object.assign(world.planes[n],patch);},getWorld:()=>world,start,selectActivity,input:()=>input()});
 }catch(e){$('errorMessage').textContent=e.message;$('error').hidden=false;console.error(e);}
}
// Yield once so the loading label can paint before mesh generation.
setTimeout(init,30);
})();
