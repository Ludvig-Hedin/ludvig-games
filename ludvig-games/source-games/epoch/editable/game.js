/* EPOCH — browser controls, presentation, and lifecycle. All original game code. */
(function(){
'use strict';
const $=id=>document.getElementById(id), {AGES,unitStats,turretStats,clamp}=EpochSim;
const roman=['I','II','III','IV','V'];
const svg=(paths,box='0 0 24 24')=>`<svg viewBox="${box}" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
const icons={
 sound:svg('<path d="m11 4-5 4H3v8h3l5 4zM15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>'),
 mute:svg('<path d="m11 4-5 4H3v8h3l5 4zM16 9l6 6m0-6-6 6"/>'),
 pause:svg('<path d="M8 5v14M16 5v14" stroke-width="3"/>'),
 fullscreen:svg('<path d="M8 3H3v5m13-5h5v5M3 16v5h5m8 0h5v-5"/>'),
 headphones:svg('<path d="M4 14v-3a8 8 0 0 1 16 0v3M4 12H2v7h5v-7zm16 0h2v7h-5v-7z"/>'),
 defense:svg('<path d="M5 21V10l7-5 7 5v11M3 21h18M9 21v-5h6v5M12 1v4m0-3h6v3h-6M4 10h16M8 10v3m8-3v3"/>'),
 evolution:svg('<path d="M4 20h16M7 20V9l5-6 5 6v11M7 9h10M12 3V1m-2 12h4m-4 3h4"/>'),
 star:svg('<path d="m12 2 3.1 6.3 7 .9-5.1 5 .9 7-5.9-3.3-5.9 3.3 1-7-5.2-5 7-.9z"/>'),
 shield:svg('<path d="m12 2 8 3v6c0 5-5 9-8 11-3-2-8-6-8-11V5zM8 12l3 3 6-7"/>'),
 broken:svg('<path d="m12 2 8 3v6c0 5-5 9-8 11-3-2-8-6-8-11V5zM13 5l-3 6 4 1-3 7"/>')
};
const powers=[
 svg('<path d="m14 3-5 5m12-6L10 13m11-4-5 5"/><path d="M14 15a5.6 5.6 0 1 1-7-7l-1 4 4-2-1 5z"/>'),
 svg('<path d="m5 3 12 15M2 3h3v3m12 12-5-1m5 1v-5M12 2l9 11m-12-3 9 11m0 0-5-1m5 1v-5"/>'),
 svg('<path d="M4 18h16M8 17l2-9 10-4 2 4-10 4M3 18a2 2 0 1 0 4 0m8 0a2 2 0 1 0 4 0M4 4l3 3m-5 1h3m3-6v3"/>'),
 svg('<path d="m12 2 2 7 8 4v3l-8-2v5l3 2H7l3-2v-5l-8 2v-3l8-4z"/>'),
 svg('<path d="m7 3 3 3-4 4-3-3zM14 14l3 3 4-4-3-3zM8 8l8 8m-6-2-5 5m3-1v4M2 16h4m6-13v3m9 3h-3M14 5a6 6 0 0 1 5 5"/>')
];
const roles=[
 ['Front line','Back line','Heavy cavalry'],['Front line','Back line','Heavy cavalry'],['Front line','Back line','Siege weapon'],['Front line','Explosive support','Armored siege'],['Front line','Precision support','Heavy assault']
];
const descriptions=[
 ['A tough, affordable fighter. Send clubbers ahead to protect your spear throwers.','Throws spears from a safe distance. Strong behind a front line, vulnerable up close.','A mighty mammoth with the strength to break a crowded front line.'],
 ['An armored swordsman. The backbone of your medieval army.','Long-range arrows punish enemies while your vanguard holds the line.','A mounted knight with high health and a devastating lance.'],
 ['A disciplined infantryman with a long-reaching halberd.','Accurate musket fire. Keep your infantry between them and the enemy.','Long-range cannon fire deals splash damage to tightly packed troops.'],
 ['An automatic rifle makes this soldier a versatile front-line unit.','Heavy rockets deal explosive splash damage. Protect the launcher.','An armored tank with a powerful cannon. Expensive, durable, and devastating.'],
 ['An armored energy trooper. Built for the final battlefield.','Long-range plasma fire tears through the enemy front line.','Long-range plasma artillery and heavy armor. Outranges most defenses and breaks a stalemate.']
];
let view,sim,audio,portraits,mode='loading',difficulty='normal',speed=1,aiming=false,defenseOpen=false,last=performance.now(),accumulator=0,uiClock=0,noticeEnd=0,announcementEnd=0,resultAt=0,realTime=0,lastAge=-1,queueKey='',panelKey='',evolutionNotified=-1,firstRecruit=false,frameCount=0;
const noopAudio=new Proxy({}, {get:()=>()=>{}});
const money=n=>Math.floor(n).toLocaleString('en-US');
const clock=n=>`${String(Math.floor(n/60)).padStart(2,'0')}:${String(Math.floor(n%60)).padStart(2,'0')}`;
function show(id,v=true){$(id).classList.toggle('hidden',!v);}
function notice(text,seconds=2.3){$('notice').textContent=text;$('notice').classList.add('show');noticeEnd=realTime+seconds;}
function notifyAge(age){const el=$('ageAnnouncement');el.querySelector('h2').textContent=AGES[age].label;el.classList.add('show');announcementEnd=realTime+3.0;$('flash').style.opacity='.17';setTimeout(()=>$('flash').style.opacity='0',100);}
function soundState(){$('sound').innerHTML=audio.muted?icons.mute:icons.sound;$('sound').setAttribute('aria-label',audio.muted?'Unmute sound':'Mute sound');}
function setupBattle(demo=false){
 view.clear();sim=new EpochSim.Battle({difficulty,seed:demo?3471:Math.floor(Math.random()*99999999),demo});
 view.setBase(0,0);view.setBase(1,0);view.aim(false);
 if(demo){sim.units.forEach(u=>u.x=u.side?5:-5);sim.spawn(0,0,1,-7.5);sim.spawn(0,0,2,-11);sim.spawn(1,0,1,8.2);sim.spawn(1,0,2,11.8);}
 sim.drain().forEach(e=>view.process(e,sim,noopAudio));
 lastAge=-1;queueKey='';panelKey='';evolutionNotified=-1;firstRecruit=false;accumulator=0;resultAt=0;aiming=false;defenseOpen=false;
 show('aimHint',false);show('defensePanel',false);show('tooltip',false);document.body.classList.remove('aiming');
 $('ageAnnouncement').classList.remove('show');$('notice').classList.remove('show');$('firstHint').style.opacity='1';$('objective').style.opacity='1';$('firstHint').textContent='Click a troop to train your army';
 speed=1;$('speed').textContent='1×';$('power').classList.remove('aiming');refreshUI(true);
}
async function start(){
 if(mode==='playing')return;
 // iOS can leave AudioContext.resume() pending forever; never let sound block the battle.
 await Promise.race([audio.unlock(),new Promise(r=>setTimeout(r,1000))]);if(mode==='playing')return;
 audio.setPaused(false);setupBattle(false);mode='playing';
 show('intro',false);show('pauseScreen',false);show('resultScreen',false);show('hud');audio.click();refreshUI(true);
}
function menu(){audio.setPaused(true);mode='menu';setupBattle(true);show('hud',false);show('resultScreen',false);show('pauseScreen',false);show('intro');}
function togglePause(force){
 if(mode!=='playing'&&mode!=='paused')return;
 const pause=force===undefined?mode==='playing':force;
 if(pause){mode='paused';setAim(false);setDefenses(false);show('tooltip',false);show('pauseScreen');audio.setPaused(true);}else{mode='playing';show('pauseScreen',false);audio.setPaused(false);audio.click();}
 accumulator=0;last=performance.now();
}
function setAim(v){
 if(v&&(mode!=='playing'||sim.teams[0].power<.999)){if(mode==='playing')notice('Your special attack is recharging.');return;}
 aiming=v;show('aimHint',v);document.body.classList.toggle('aiming',v);$('power').classList.toggle('aiming',v);
 if(v){setDefenses(false);show('tooltip',false);const enemies=sim.units.filter(u=>u.side===1&&!u.dead);let x=enemies.length?enemies.reduce((n,u)=>n+u.x,0)/enemies.length:10;view.aim(true,clamp(x,-17,17));audio.click();}else view.aim(false);
}
function recruit(type){
 if(mode!=='playing')return;setAim(false);
 if(!sim.recruit(0,type)){audio.deny();const t=sim.teams[0];notice(t.pop+t.queue.length>=28?'Army at capacity · 28 troops':t.queue.length>=6?'Training queue full':`Need ${money(unitStats(t.age,type).cost-t.gold)} more gold`);return;}
 if(!firstRecruit){firstRecruit=true;$('firstHint').textContent='Your troops fight automatically. Keep them reinforced.';}
 handleEvents();refreshUI(true);
}
function evolve(){
 if(mode!=='playing')return;setAim(false);
 if(sim.evolve(0)){setDefenses(false);handleEvents();refreshUI(true);}else{audio.deny();const t=sim.teams[0];notice(t.age===4?'This is the final age':`${money(AGES[t.age+1].xp-t.xp)} more XP to evolve`);}
}
function setDefenses(v){defenseOpen=v;show('defensePanel',v);if(v){setAim(false);show('tooltip',false);panelKey='';refreshDefense();audio.click();}}
function finish(result){
 mode='ending';setAim(false);setDefenses(false);show('tooltip',false);resultAt=realTime+2.0;audio.result(result==='victory');
 const win=result==='victory';$('resultEmblem').innerHTML=win?icons.shield:icons.broken;$('resultEmblem').style.color=win?'#e6bc76':'#dc826b';
 $('resultTitle').textContent=win?'Victory':'Defeat';
 $('resultTime').textContent=clock(sim.time);$('resultKills').textContent=sim.kills;$('resultAge').textContent=roman[sim.teams[0].age];
}
function handleEvents(){
 for(const e of sim.drain()){
  view.process(e,sim,mode==='menu'?noopAudio:audio);
  if(mode==='menu')continue;
  if(e.type==='evolve'){if(e.side===0)notifyAge(e.age);else notice(`The enemy entered the ${AGES[e.age].name.toLowerCase()} age`,3);refreshUI(true);}
  if(e.type==='end'&&mode==='playing')finish(e.result);
 }
}
function refreshUI(force=false){
 if(!sim)return;const t=sim.teams[0],a=t.age;
 $('gold').textContent=money(t.gold);$('battleTime').textContent=clock(sim.time);$('population').textContent=`${t.pop} / 28`;
 for(let side=0;side<2;side++){const b=sim.teams[side];$('hp'+side).textContent=money(Math.max(0,b.hp));$('bar'+side).style.width=`${clamp(b.hp/b.maxHp,0,1)*100}%`;}
 if(lastAge!==a){lastAge=a;$('ageLabel').textContent=AGES[a].label;document.querySelectorAll('.age-node').forEach((n,i)=>{n.classList.toggle('active',i===a);n.classList.toggle('past',i<a);});
  for(let k=0;k<3;k++){const card=$('unit'+k),st=unitStats(a,k);card.querySelector('img').src=portraits?.[a]?.[k]||'';card.querySelector('.unit-name').textContent=st.name;card.querySelector('b').textContent=st.cost;card.setAttribute('aria-label',`Train ${st.name}, ${st.cost} gold`);}
  $('powerName').textContent=AGES[a].power;$('powerIcon').innerHTML=powers[a];$('nextAge').textContent=a<4?AGES[a+1].name:'Final age';$('evolve').querySelector('.evolve-eyebrow').textContent=a<4?'NEXT AGE':'AGE V';
  $('evolutionIcon').innerHTML=a<4?icons.evolution:icons.star;
 }
 for(let k=0;k<3;k++)$('unit'+k).disabled=t.gold<unitStats(a,k).cost||t.queue.length>=6||t.pop+t.queue.length>=28;
 const next=a<4?AGES[a+1].xp:AGES[4].xp,previous=AGES[a].xp,ready=a<4&&t.xp>=next;
 $('evolve').classList.toggle('available',ready);$('xpBar').style.width=`${a===4?100:clamp((t.xp-previous)/(next-previous),0,1)*100}%`;
 $('xpText').textContent=a===4?'':ready?'EVOLVE NOW':`${money(t.xp)} / ${money(next)} XP`;
 $('evolve').setAttribute('aria-label',a===4?'Final age reached':ready?`Evolve to ${AGES[a+1].name} age`:`Evolve: ${money(t.xp)} of ${next} experience`);
 if(ready&&evolutionNotified!==a&&mode==='playing'){evolutionNotified=a;notice('Ready to evolve',3);audio.coin();}
 const charged=t.power>=.999;$('power').classList.toggle('ready',charged);$('powerMeta').textContent=charged?'READY':`${Math.ceil((1-t.power)*(a===4?43:38))}s`;$('cooldownShade').style.height=`${(1-t.power)*100}%`;
 $('power').setAttribute('aria-label',`${AGES[a].power}, ${charged?'ready. Choose a target on the battlefield.':'recharging.'}`);
 [...$('slotDots').children].forEach((el,i)=>el.classList.toggle('filled',!!t.turrets[i]));
 const qkey=t.queue.map(q=>q.age+':'+q.type).join(',');
 if(qkey!==queueKey||force){queueKey=qkey;$('queue').innerHTML=t.queue.map((q,i)=>`<button class="queue-item" data-cancel="${i}" title="Cancel ${AGES[q.age].units[q.type]} · refund ${q.cost} gold" aria-label="Cancel ${AGES[q.age].units[q.type]}"><img src="${portraits?.[q.age]?.[q.type]||''}" alt=""><i style="width:${i?0:(1-q.time/q.total)*100}%"></i></button>`).join('');}
 if(t.queue.length)$('queue').firstElementChild.querySelector('i').style.width=`${(1-t.queue[0].time/t.queue[0].total)*100}%`;
 $('queueLabel').textContent=t.queue.length?'TRAINING':'ARMY';
 if(defenseOpen)refreshDefense();
}
function refreshDefense(){
 const t=sim.teams[0],key=t.age+':'+t.turrets.map(tr=>tr?tr.type+'-'+tr.level:'x').join(',');
 if(key!==panelKey){panelKey=key;
  $('turretOptions').innerHTML=[0,1,2].map(type=>{const st=turretStats(t.age,type);return `<button class="turret-option" data-build="${type}" title="${Math.round(st.damage)} damage · ${st.period.toFixed(1)}s between attacks · ${st.splash?'area damage':'single target'}"><span class="turret-glyph">${type===0?icons.defense:type===1?powers[3]:powers[2]}</span><b>${st.name}</b><small>${['Balanced','Rapid fire','Area damage'][type]}</small><span class="turret-cost"><svg class="coin-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m12 7 5 5-5 5-5-5z"/></svg> ${st.cost}</span></button>`;}).join('');
  $('builtTurrets').innerHTML=t.turrets.map((tr,i)=>tr?`<div class="built-row"><span class="slot-number">${i+1}</span><div><b>${tr.name}</b><small>Level ${tr.level} · ${Math.round(tr.damage)} damage</small></div><button data-upgrade="${i}" ${tr.level===3?'disabled':''}>${tr.level===3?'MAX':`Upgrade <svg class="coin-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m12 7 5 5-5 5-5-5z"/></svg> ${Math.round(tr.cost*(.75+tr.level*.15)/5)*5}`}</button><button data-sell="${i}" class="sell" title="Sell for ${Math.floor(tr.invested*.65)} gold">Sell</button></div>`:`<div class="built-row empty"><span class="slot-number">${i+1}</span><div><b>Empty emplacement</b><small>Choose a defense above</small></div></div>`).join('');
 }
 document.querySelectorAll('[data-build]').forEach(el=>el.disabled=t.gold<turretStats(t.age,+el.dataset.build).cost||!t.turrets.includes(null));
 document.querySelectorAll('[data-upgrade]').forEach(el=>{const tr=t.turrets[+el.dataset.upgrade];el.disabled=tr.level===3||t.gold<Math.round(tr.cost*(.75+tr.level*.15)/5)*5;});
}
function tooltip(type,element){
 if(mode!=='playing'||aiming||defenseOpen||matchMedia('(pointer:coarse)').matches)return;
 const a=sim.teams[0].age,st=unitStats(a,type),el=$('tooltip');el.innerHTML=`<small>${roles[a][type]}</small><h4>${st.name}</h4><p>${descriptions[a][type]}</p><div class="stats"><span><b>${st.hp}</b> Health</span><span><b>${Math.round(st.damage)}</b> Damage</span><span><b>${st.train.toFixed(1)}s</b> Train</span></div>`;show('tooltip');
 const r=element.getBoundingClientRect();el.style.left=clamp(r.left+r.width/2-140,14,innerWidth-294)+'px';el.style.bottom=(innerHeight-r.top+14)+'px';
}
function positionLabels(){
 for(let side=0;side<2;side++){const age=sim.teams[side].age,p=view.project(side===0?-20:20,[3.8,5.0,4.8,4.5,5.2][age],0),el=$('base'+side);const half=el.offsetWidth/2+12;el.style.left=clamp(p.x,half,innerWidth-half)+'px';el.style.top=Math.max(innerHeight<500?62:innerWidth<700?115:95,p.y-el.offsetHeight-14)+'px';}
}
function bind(){
 $('sound').innerHTML=icons.sound;$('pause').innerHTML=icons.pause;$('fullscreen').innerHTML=icons.fullscreen;if(!(document.fullscreenEnabled||document.webkitFullscreenEnabled))$('fullscreen').hidden=true;$('defenseIcon').innerHTML=icons.defense;$('evolutionIcon').innerHTML=icons.evolution;$('powerIcon').innerHTML=powers[0];
 $('ageTrack').innerHTML=AGES.map((a,i)=>`${i?'<span class="age-link"></span>':''}<span class="age-node ${i===0?'active':''}" title="${a.label}">${roman[i]}</span>`).join('');
 $('start').addEventListener('click',start);$('playAgain').addEventListener('click',start);$('backToMenu').addEventListener('click',menu);
 document.querySelectorAll('[data-difficulty]').forEach(el=>el.addEventListener('click',()=>{difficulty=el.dataset.difficulty;document.querySelectorAll('[data-difficulty]').forEach(b=>{b.classList.toggle('selected',b===el);b.setAttribute('aria-pressed',b===el?'true':'false');});}));
 for(let i=0;i<3;i++){const el=$('unit'+i);el.addEventListener('click',()=>recruit(i));el.addEventListener('pointerenter',()=>tooltip(i,el));el.addEventListener('pointerleave',()=>show('tooltip',false));el.addEventListener('focus',()=>tooltip(i,el));el.addEventListener('blur',()=>show('tooltip',false));}
 $('queue').addEventListener('click',e=>{const b=e.target.closest('[data-cancel]');if(b&&mode==='playing'&&sim.cancel(+b.dataset.cancel)){audio.click();refreshUI(true);}});
 $('defense').addEventListener('click',()=>{if(mode==='playing')setDefenses(!defenseOpen);});$('closeDefense').addEventListener('click',()=>setDefenses(false));
 $('defensePanel').addEventListener('click',e=>{if(mode!=='playing')return;const b=e.target.closest('button');if(!b||b.disabled)return;let ok=false;
  if(b.dataset.build!==undefined)ok=sim.build(0,+b.dataset.build);
  else if(b.dataset.upgrade!==undefined)ok=sim.upgrade(+b.dataset.upgrade);
  else if(b.dataset.sell!==undefined)ok=sim.sell(+b.dataset.sell);
  else return;
  if(!ok)audio.deny();handleEvents();refreshUI(true);
 });
 $('power').addEventListener('click',()=>setAim(!aiming));$('evolve').addEventListener('click',evolve);
 $('world').addEventListener('pointermove',e=>{if(aiming)view.aim(true,view.pointerX(e.clientX,e.clientY));});
 $('world').addEventListener('pointerdown',e=>{if(mode!=='playing')return;if(aiming){const x=view.pointerX(e.clientX,e.clientY);if(sim.power(0,x)){setAim(false);handleEvents();refreshUI(true);}}else if(defenseOpen)setDefenses(false);});
 $('pause').addEventListener('click',()=>togglePause());$('resume').addEventListener('click',()=>togglePause(false));
 $('restart').addEventListener('click',()=>{start();});
 $('sound').addEventListener('click',async()=>{await audio.unlock();audio.toggleMute();soundState();});
 $('speed').addEventListener('click',()=>{if(mode==='playing'){speed=speed===1?2:1;$('speed').textContent=speed+'×';audio.click();}});
 $('fullscreen').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else if(document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen();else notice('Use your browser’s fullscreen command.');}catch(e){notice('Fullscreen is unavailable in this preview.');}});
 $('musicVolume').addEventListener('input',e=>{audio.musicLevel=+e.target.value/100;audio.level();});$('fxVolume').addEventListener('input',e=>{audio.effectsLevel=+e.target.value/100;audio.level();});
 window.addEventListener('keydown',e=>{
  if(e.target.tagName==='INPUT'||e.repeat)return;const k=e.key.toLowerCase();
  if(k==='escape'){if(aiming)setAim(false);else if(defenseOpen)setDefenses(false);else if(mode==='playing'||mode==='paused')togglePause();return;}
  if(mode==='menu'&&(k==='enter'||k===' ')){e.preventDefault();start();return;}
  if(k==='m'){audio.toggleMute();soundState();return;}
  if(k==='p'&&(mode==='playing'||mode==='paused')){togglePause();return;}
  if(mode!=='playing')return;
  if(['1','2','3'].includes(k)){e.preventDefault();recruit(+k-1);}else if(k==='q'){e.preventDefault();setAim(!aiming);}else if(k==='t'){setDefenses(!defenseOpen);}else if(k==='e')evolve();else if(k==='f')$('speed').click();
 });
 window.addEventListener('resize',()=>{view?.resize();show('tooltip',false);});
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&mode==='playing')togglePause(true);});
 $('world').addEventListener('webglcontextlost',e=>{e.preventDefault();if(mode==='playing')togglePause(true);showError(new Error('The browser’s graphics context was interrupted. Reload the game to begin again.'));});
}
function showError(err){console.error(err);show('loading',false);show('errorScreen');$('errorDetails').textContent=err?.message||String(err);}
function frame(now){
 requestAnimationFrame(frame);const realDt=Math.min(.07,Math.max(0,(now-last)/1000));last=now;realTime+=realDt;frameCount++;
 if(!view||!sim)return;
 let worldDt=0;
 if(mode==='playing'||mode==='menu'){
  worldDt=realDt*(mode==='menu'?.75:speed);accumulator=Math.min(accumulator+worldDt,.28);
  while(accumulator>=1/60){sim.step(1/60);accumulator-=1/60;
   if(mode==='menu'){
    const t=sim.teams[0];if(t.gold>100&&t.queue.length<1&&t.pop<9)sim.recruit(0,sim.random()>.6?1:0);
    sim.teams.forEach(b=>b.hp=b.maxHp);if(sim.time>65||sim.result){setupBattle(true);break;}
   }
   handleEvents();if(mode==='ending')break;
  }
 }else if(mode==='ending'||mode==='result')worldDt=realDt*.6;
 view.update(sim,worldDt,realTime);view.draw(sim,mode!=='menu');
 if(mode!=='menu'){positionLabels();uiClock+=realDt;if(uiClock>.1){refreshUI();uiClock=0;}if(sim.time>7&&firstRecruit)$('firstHint').style.opacity='0';if(sim.time>14)$('objective').style.opacity='0';}
 if(mode==='playing'||mode==='ending')audio.tick(sim.teams[0].age,Math.min(1,sim.units.length/17));
 if(noticeEnd&&realTime>noticeEnd){$('notice').classList.remove('show');noticeEnd=0;}
 if(announcementEnd&&realTime>announcementEnd){$('ageAnnouncement').classList.remove('show');announcementEnd=0;}
 if(mode==='ending'&&realTime>resultAt){mode='result';show('resultScreen');}
}
async function init(){
 try{
  if(!window.THREE)throw new Error('The bundled Three.js engine did not load.');
  audio=new EpochAudio();view=new EpochBattlefield($('world'),$('fx'));bind();
  // Let the loading screen paint before rendering the original portrait asset atlas.
  await new Promise(resolve=>requestAnimationFrame(()=>setTimeout(resolve,0)));
  portraits=view.portraits();setupBattle(true);mode='menu';show('intro');show('loading',false);last=performance.now();requestAnimationFrame(frame);
  // Read-only status plus the live simulator are exposed for reproducible local QA.
  window.__epoch={get sim(){return sim;},get view(){return view;},get audio(){return audio;},get mode(){return mode;},get speed(){return speed;},get aiming(){return aiming;},get frameCount(){return frameCount;},start,recruit,evolve,pause:togglePause,drain:handleEvents,refresh:()=>refreshUI(true),snapshot:()=>sim.snapshot(),version:'1.0.0',threeRevision:THREE.REVISION};
 }catch(err){showError(err);}
}
init();
})();
