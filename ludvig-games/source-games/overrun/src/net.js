// Online deathmatch through the shared Ludvig relay (window.Ludvig.mp), 2 to 8 players, no bots.
// Each client simulates only its own soldier and sends one small packet at most 10 times a second
// (about 2 a second when idle); hits and kills ride along in that packet. The shooter decides a hit
// and tells the victim, the victim applies it and announces the kill, so every client counts the
// same kills. The host (oldest peer) starts rounds and owns the match clock; if it leaves, the next
// oldest peer continues. Single-player never enters this path.
import * as THREE from 'three';
import {createSoldier,animateSoldier} from './agents.js';
import {MAPS} from './world.js';
import {WEAPON_BY_ID} from './arsenal.js';

const GAME='overrun',MAX=8,LIMIT=20,KEY='overrun',SEND_MS=100,IDLE_MS=450,DELAY=110,STALE_MS=3000;
const PALETTE=['#dcefa2','#9be4ed','#ed9278','#f2d27a','#c9a7f0','#8fe0b8','#f39cc0','#e7e8df'];
const V=THREE.Vector3;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const q=(v,n=100)=>Math.round(v*n)/n;
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clean=n=>String(n||'').replace(/[\u0000-\u001f<>]/g,'').trim().slice(0,16)||'Player';
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
const ICON={cross:'<path d="m6 6 12 12M6 18 18 6"/>',arrow:'<path d="M5 12h14m-5-5 5 5-5 5"/>',link:'<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'};
const svg=n=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[n]}</svg>`;
function sphereHit(o,d,cx,cy,cz,r){const x=o.x-cx,y=o.y-cy,z=o.z-cz,b=x*d.x+y*d.y+z*d.z,c=x*x+y*y+z*z-r*r,h=b*b-c;if(h<0)return Infinity;const t=-b-Math.sqrt(h);return t>=0?t:-b+Math.sqrt(h)>=0?0:Infinity;}
const isVec=a=>Array.isArray(a)&&a.length===3&&a.every(Number.isFinite);
export function inviteCode(search){try{const v=new URLSearchParams(search).get(KEY);return v&&/^[A-Za-z0-9]{4}$/.test(v.trim())?v.trim().toUpperCase():null;}catch{return null;}}

export class Net {
 constructor(game,ui){this.game=game;this.ui=ui;this.room=null;this.busy=false;this.token=0;this.view='';this.error='';this.round=0;this.cfg=null;this.t0=0;this.lastSend=0;this.lastYaw=0;this.fired=false;this.fx=[];this.out=[];this.remotes=new Map();this.pool=[];this.seenDeaths=new Set();this.restartHTML='';this.inviteLabel='';
  ui.canOnline=()=>this.available();if(ui.tab==='play')ui.renderMenu();
  ui.root.addEventListener('click',e=>{const b=e.target.closest('[data-net]');if(!b)return;e.preventDefault();this.action(b.dataset.net);});
  ui.root.addEventListener('keydown',e=>{if(e.target.id==='online-code'){e.stopPropagation();if(e.key==='Enter'){e.preventDefault();this.action('join');}}});
  ui.root.addEventListener('input',e=>{if(e.target.id==='online-code')e.target.value=e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,4);});
  const refresh=()=>{if(this.game.state==='menu')this.ui.renderMenu();};addEventListener('online',refresh);addEventListener('offline',refresh);
  const code=inviteCode(location.search);if(code)setTimeout(()=>{this.stripInvite();if(this.available()){this.open();this.connect('code',code);}},80);
 }
 available(){try{const mp=window.Ludvig?.mp;return !!mp&&typeof mp.join==='function'&&typeof mp.create==='function'&&navigator.onLine!==false&&/^https?:$/.test(location.protocol);}catch{return false;}}
 selfId(){return this.room?.self?.id??null;}
 isHost(){return !!this.room&&this.room.host===this.selfId();}
 peers(){return (this.room?.peers||[]).filter(p=>p&&p.id!=null).slice().sort((a,b)=>(a.joinedAt||0)-(b.joinedAt||0)||String(a.id).localeCompare(String(b.id)));}
 live(){const g=this.game;return !!this.room&&g.mode==='online'&&g.state==='playing'&&g.matchActive;}
 fresh(r,now=performance.now()){return now-r.lastPkt<STALE_MS;}
 list(){const out=[];for(const r of this.remotes.values())if(this.fresh(r))out.push(r);return out;}
 myName(){return clean(window.Ludvig?.player?.name||'You');}
 stripInvite(){try{const u=new URL(location.href);if(u.searchParams.has(KEY)){u.searchParams.delete(KEY);history.replaceState(history.state,'',u.pathname+u.search+u.hash);}}catch{}}

 /* ---------- sheet ---------- */
 open(){this.error='';this.view=this.room?'room':'menu';this.render();}
 close(){if(this.room&&!this.live())this.leave();this.view='';this.ui.get('modal').hidden=true;}
 render(){if(!this.view)return;const m=this.ui.get('modal');m.hidden=false;let body='';
  if(this.view==='menu')body=`<h2>PLAY ONLINE</h2><button class="primary" data-net="quick" ${this.busy?'disabled':''}>${this.busy==='quick'?'FINDING A ROOM…':'QUICK MATCH'} ${svg('arrow')}</button><button class="secondary" data-net="create" ${this.busy?'disabled':''}>CREATE PRIVATE ROOM</button><div class="online-code"><input id="online-code" maxlength="4" placeholder="CODE" aria-label="Room code" autocomplete="off" autocapitalize="characters" spellcheck="false"><button class="secondary" data-net="join" ${this.busy?'disabled':''}>JOIN</button></div><p class="online-error" ${this.error?'':'hidden'}>${esc(this.error)}</p><p class="online-note">Playing as ${esc(this.myName())}</p>`;
  else{const list=this.peers(),me=this.selfId(),host=this.room.host,live=this.room.meta?.ph==='live',map=MAPS.find(x=>x.id===(live?this.room.meta.map:this.ui.setup.map))||MAPS[0],mins=live?this.room.meta.d:this.ui.setup.duration;
   const label=live?'JOIN MATCH':this.isHost()?'START MATCH':'WAITING FOR HOST',can=live||this.isHost()&&list.length>1;
   body=`<h2>DEATHMATCH</h2><div class="online-room-code"><b>${esc(this.room.code)}</b><button class="secondary" data-net="invite">${svg('link')} <span>${esc(this.inviteLabel||'COPY INVITE LINK')}</span></button></div><ul class="online-players">${list.map((p,i)=>`<li><i style="background:${PALETTE[i%PALETTE.length]}"></i><span>${esc(p.id===me?this.myName():clean(p.name))}</span><small>${[p.id===me?'YOU':'',p.id===host?'HOST':''].filter(Boolean).join(' · ')}</small></li>`).join('')}</ul><p class="online-note">${esc(map.name.toUpperCase())} · ${mins} MIN · FIRST TO ${LIMIT} · ${list.length} / ${this.room.max||MAX}</p><button class="primary" data-net="start" ${can?'':'disabled'}>${label} ${svg('arrow')}</button><button class="secondary" data-net="leave">LEAVE ROOM</button>`;}
  const code=m.querySelector('#online-code')?.value||'';
  m.innerHTML=`<div class="settings-modal online-modal"><button class="close" data-net="close" aria-label="Close">${svg('cross')}</button>${body}</div>`;
  const input=m.querySelector('#online-code');if(input)input.value=code;}
 action(a){this.game.audio?.ui?.();
  if(a==='close')this.close();
  else if(a==='quick'||a==='create')this.connect(a);
  else if(a==='join'){const c=(this.ui.get('online-code')?.value||'').trim().toUpperCase();if(!/^[A-Z0-9]{4}$/.test(c)){this.error='Enter the 4-character room code.';this.render();return;}this.connect('code',c);}
  else if(a==='start'){if(this.room?.meta?.ph==='live')this.joinLive();else this.startMatch();}
  else if(a==='leave'){this.leave();this.open();}
  else if(a==='invite')this.invite();}
 async invite(){if(!this.room)return;const u=new URL(location.href);u.search='';u.hash='';u.searchParams.set(KEY,this.room.code);const url=u.toString();let ok=false;
  if(this.ui.touch&&navigator.share){try{await navigator.share({url,title:document.title});ok=true;}catch(e){if(e?.name==='AbortError')return;}}
  if(!ok)try{await navigator.clipboard.writeText(url);ok=true;}catch{}
  this.inviteLabel=ok?'LINK COPIED':url;this.render();setTimeout(()=>{this.inviteLabel='';if(this.view==='room')this.render();},ok?2000:6000);}

 /* ---------- connect / leave ---------- */
 async connect(how,code=''){if(this.busy||this.room)return;if(!this.available()){this.error='Online play is not available right now.';this.render();return;}
  const mine=++this.token;this.busy=how;this.error='';this.view='menu';this.render();let r=null,fail='';
  try{const mp=window.Ludvig.mp;r=how==='quick'?await mp.join({game:GAME,quick:true,max:MAX}):how==='create'?await mp.create({game:GAME,max:MAX,visible:false}):await mp.join({game:GAME,room:code});}catch(e){fail=e?.code||'network';}
  if(mine!==this.token){try{r?.leave();}catch{}return;}
  this.busy=false;
  if(!r){this.error=fail==='full'?'That room is full.':fail==='not-found'?'No room with that code.':fail==='rate-limited'?'Too many tries. Wait a moment.':how==='code'?'Could not join that room.':'Could not reach the server. Try again in a moment.';this.render();return;}
  this.attach(r);}
 attach(r){this.room=r;this.clearRemotes();this.round=Number(r.meta?.r)||0;this.seenDeaths.clear();
  const on=(ev,fn)=>r.on(ev,(...a)=>{if(this.room!==r)return;try{fn(...a);}catch(e){console.error(e);}});
  on('message',(from,d)=>this.receive(from,d));
  on('join',p=>{this.syncPeers();if(this.live())this.ui.notice(`${clean(p.name)} JOINED`);this.render();});
  on('leave',p=>{const q=this.remotes.get(p.id);if(this.live()&&q)this.ui.notice(`${q.name} LEFT`);this.syncPeers();this.render();});
  on('host',()=>{this.syncPeers();this.render();if(this.game.state==='results')this.onFinish();});
  on('meta',m=>this.onMeta(m||{}));
  on('close',reason=>this.onClose(reason));
  this.syncPeers();this.view='room';this.render();}
 leave(){this.token++;this.busy=false;const r=this.room;this.room=null;this.clearRemotes();try{r?.leave();}catch{}}
 onClose(reason){const was=this.live();this.room=null;this.clearRemotes();if(reason==='left')return;
  if(was||this.game.state==='results')this.game.exit();
  this.error=reason==='replaced'?'This room is open in another tab.':reason==='not-found'?'That room has closed.':'Connection lost.';this.view='menu';this.render();}

 /* ---------- remote soldiers ---------- */
 syncPeers(){const ids=new Set(),me=this.selfId();this.peers().forEach((p,i)=>{ids.add(p.id);if(p.id===me)return;let r=this.remotes.get(p.id);
   if(!r){r={id:p.id,remote:true,name:'',team:1,index:i,pos:new V(),vel:new V(),yaw:0,pitch:0,height:1.78,alive:false,health:100,kills:0,deaths:0,assists:0,score:0,streak:0,weaponId:'vx4',buf:[],cur:{t:0,x:0,y:0,z:0,yaw:0,pitch:0},lastPkt:0,model:null,target:{alive:true},strafeSign:1,reloading:0,reloadDuration:1,flashTimer:0,slideTimer:0,crouchTimer:0,grounded:true,lastShot:-100,damageLedger:new Map(),protectionUntil:0};
    r.model=this.pool.pop()||createSoldier(1);r.model.group.visible=false;this.game.scene.add(r.model.group);this.remotes.set(p.id,r);}
   r.name=clean(p.name);r.index=i;});
  for(const [id,r] of this.remotes)if(!ids.has(id))this.drop(r);}
 drop(r){this.remotes.delete(r.id);if(r.model){this.game.scene.remove(r.model.group);r.model.group.visible=false;this.pool.push(r.model);r.model=null;}}
 clearRemotes(){for(const r of [...this.remotes.values()])this.drop(r);this.fx.length=0;this.out.length=0;}
 push(r,t,s){const b=r.buf;let e=b.length>=12?b.shift():{};e.t=t;e.x=s[0];e.y=s[1];e.z=s[2];e.yaw=s[3];e.pitch=s[4];b.push(e);}
 sample(r,t){const b=r.buf,c=r.cur;if(!b.length)return null;let a=b[0],n=null;if(t<=a.t){Object.assign(c,a);return c;}for(let i=b.length-1;i>=0;i--){if(b[i].t<=t){a=b[i];n=b[i+1]||null;break;}}if(!n){Object.assign(c,a);return c;}const k=clamp((t-a.t)/Math.max(1,n.t-a.t),0,1);c.x=a.x+(n.x-a.x)*k;c.y=a.y+(n.y-a.y)*k;c.z=a.z+(n.z-a.z)*k;c.yaw=a.yaw+wrap(n.yaw-a.yaw)*k;c.pitch=a.pitch+(n.pitch-a.pitch)*k;return c;}
 hitTest(origin,dir,max){let best=null,closest=max;for(const r of this.remotes.values()){if(!r.alive||!this.fresh(r))continue;const h=r.height;for(const [y,rad,zone] of [[h-.12,.16,'head'],[h*.69,.28,'body'],[h*.48,.27,'body'],[h*.25,.24,'limb']]){const t=sphereHit(origin,dir,r.pos.x,r.pos.y+y,r.pos.z,rad);if(t<closest){closest=t;best={entity:r,distance:t,zone};}}}
  if(best)best.point=origin.clone().addScaledVector(dir,best.distance);return best;}

 /* ---------- match flow ---------- */
 setMeta(ph){if(this.room&&this.isHost())try{this.room.setMeta({ph,r:this.round,map:this.cfg?.map||this.ui.setup.map,d:this.cfg?.d||this.ui.setup.duration,open:true});}catch{}}
 startMatch(){if(!this.room||!this.isHost())return;this.round=Math.max(this.round,Number(this.room.meta?.r)||0)+1;this.cfg={map:this.ui.setup.map,d:Number(this.ui.setup.duration)||5};this.setMeta('live');this.begin(0);}
 restart(){if(this.isHost())this.startMatch();}
 joinLive(){const m=this.room?.meta||{};if(m.ph!=='live')return;this.round=Number(m.r)||0;this.cfg={map:MAPS.some(x=>x.id===m.map)?m.map:MAPS[0].id,d:clamp(Number(m.d)||5,1,10)};this.begin(null);}
 onMeta(m){if(m.ph==='live'&&(Number(m.r)||0)>this.round){const waiting=this.view==='room'||this.game.state==='results';if(waiting)this.joinLive();}this.render();}
 begin(el){this.view='';this.seenDeaths.clear();for(const r of this.remotes.values()){r.kills=r.deaths=r.score=r.assists=r.streak=0;}
  this.t0=performance.now()-(el||0)*1000;this.synced=el!==null;this.lastSend=0;
  this.game.start({...this.ui.setup,mode:'online',map:this.cfg.map,duration:this.cfg.d,scoreLimit:LIMIT,bots:0,team:0});}
 onFinish(){const b=this.ui.root.querySelector('.result-actions [data-action="restart"]');if(!b)return;if(!this.restartHTML)this.restartHTML=b.innerHTML;
  if(this.game.mode==='online'&&this.room&&!this.isHost()){b.disabled=true;b.textContent='WAITING FOR HOST';}else{b.disabled=false;b.innerHTML=this.restartHTML;}
  if(this.game.mode==='online'&&this.isHost())this.setMeta('end');}

 /* ---------- sending ---------- */
 event(ev){if(this.live()&&this.out.length<120)this.out.push(ev);}
 hit(victim,amount,zone){this.event({t:'h',to:victim.id,d:Math.round(amount*10)/10,z:zone==='head'?2:zone==='limb'?1:0});victim.lastDamageAt=performance.now();}
 shot(end){this.fired=true;if(this.fx.length<4)this.fx.push([q(end.x),q(end.y),q(end.z)]);}
 died(attacker,zone){if(!this.room)return;const p=this.game.player,id=`${this.selfId()}:${p.deaths}:${this.round}`;this.seenDeaths.add(id);const ev={t:'die',by:attacker?.remote?attacker.id:null,z:zone==='head'?1:0,id,w:attacker?.weaponId||''};try{this.room.send({ev:[ev]});}catch{}}
 send(now){const g=this.game,p=g.player;if(!p)return;const moving=Math.hypot(p.vel.x,p.vel.z)>.2||Math.abs(p.vel.y)>.1,turned=Math.abs(wrap(p.yaw-this.lastYaw))>.01;
  const active=moving||turned||this.fired||this.fx.length||this.out.length||this.isHost();
  if(now-this.lastSend<(active?SEND_MS:IDLE_MS))return;
  const pkt={p:[q(p.pos.x),q(p.pos.y),q(p.pos.z),q(p.yaw,1000),q(p.pitch,1000)],h:q(p.height),a:p.alive?1:0,w:g.weapon?.id||'vx4',st:p.state==='slide'?2:p.state==='crouch'?1:0,g:p.grounded?1:0};
  if(this.fx.length)pkt.fx=this.fx.splice(0,4);if(this.isHost())pkt.el=q(g.elapsed,10);
  if(this.out.length){let n=this.out.length;pkt.ev=this.out.slice(0,n);while(n>1&&JSON.stringify(pkt).length>3600){n=Math.ceil(n/2);pkt.ev=this.out.slice(0,n);}this.out.splice(0,n);}
  try{this.room.send(pkt);}catch{}this.lastSend=now;this.lastYaw=p.yaw;this.fired=false;}

 /* ---------- receiving ---------- */
 receive(from,d){if(!d||typeof d!=='object')return;const r=this.remotes.get(from);if(!r)return;const now=performance.now(),g=this.game;
  if(Array.isArray(d.p)&&d.p.length===5&&d.p.every(Number.isFinite)){const alive=d.a===1;if(alive&&!r.alive)r.buf.length=0;r.alive=alive;this.push(r,now,d.p);r.lastPkt=now;r.height=clamp(Number(d.h)||1.78,.9,1.9);if(WEAPON_BY_ID[d.w])r.weaponId=d.w;r.slideTimer=d.st===2?.2:0;r.crouchTimer=d.st===1?.2:0;r.grounded=d.g!==0;}
  if(Number.isFinite(d.el)&&from===this.room.host&&g.mode==='online'&&g.matchActive){const t0=now-d.el*1000-DELAY*.5;if(!this.synced||Math.abs(t0-this.t0)>250){this.t0=t0;this.synced=true;}}
  if(Array.isArray(d.fx)&&this.live()&&r.alive){for(const f of d.fx.slice(0,4)){if(!isVec(f))continue;const o=r.pos.clone();o.y+=r.height*.84;const end=new V(f[0],f[1],f[2]),dir=end.clone().sub(o).normalize();g.effects?.tracer(o.addScaledVector(dir,.5),end,0xffc09a);}
   r.flashTimer=.06;r.lastShot=g.elapsed;const w=WEAPON_BY_ID[r.weaponId];if(g.player&&r.pos.distanceToSquared(g.player.pos)<75*75)g.audio.shot(r.weaponId,r.pos.clone().setY(r.pos.y+1.5),g.isIndoor(r.pos),!!w?.suppressed);}
  if(Array.isArray(d.ev))for(const ev of d.ev.slice(0,80))if(ev&&typeof ev.t==='string')this.onEvent(r,ev);}
 onEvent(r,ev){const g=this.game,me=this.selfId();
  if(ev.t==='h'){if(ev.to!==me||!this.live()||!g.player.alive||!r.alive)return;const amount=clamp(Number(ev.d)||0,0,200);if(!amount)return;const dir=g.player.pos.clone().sub(r.pos).normalize();g.damage(g.player,amount,r,ev.z===2?'head':ev.z===1?'limb':'body',dir);}
  else if(ev.t==='die'){if(!this.live())return;const id=String(ev.id||'');if(!id||this.seenDeaths.has(id))return;this.seenDeaths.add(id);if(this.seenDeaths.size>400)this.seenDeaths.clear();
   r.alive=false;r.deaths++;r.streak=0;if(r.model)r.model.group.visible=false;const head=ev.z===1,pts=head?125:100;
   if(ev.by===me){const p=g.player;p.kills++;p.streak=(p.streak||0)+1;p.score+=pts;g.ui.kill(r.name,pts,head,p.streak);g.audio.kill();if(p.streak===3||p.streak===5||p.streak===10)g.audio.announce(`${p.streak} kill streak.`);g.ui.addFeed(p.name,r.name,g.weapon?.name||'TALON',true);if(p.kills>=g.limit)g.finish('player');}
   else{const k=this.remotes.get(ev.by);if(k){k.kills++;k.streak++;k.score+=pts;}g.ui.addFeed(k?k.name:r.name,r.name,WEAPON_BY_ID[k?.weaponId]?.name||'TALON',false);if(k&&k.kills>=g.limit)g.finish(k.id);}}
  else if(ev.t==='bx'){if(!this.live())return;const b=g.world?.explosives?.[ev.i|0];if(b&&!b.exploded)g.damageExplosive({collider:b.collider},9999,r);}}

 /* ---------- per frame, also while paused ---------- */
 frame(now,dt){if(!this.room)return;const g=this.game,live=this.live();
  if(g.mode==='online'&&g.matchActive){g.elapsed=(now-this.t0)/1000;if(g.elapsed>=g.duration){g.finish();return;}}
  for(const r of this.remotes.values()){const m=r.model;if(!m)continue;if(!live||!r.alive||!this.fresh(r,now)){m.group.visible=false;continue;}
   const s=this.sample(r,now-DELAY);if(!s){m.group.visible=false;continue;}const fd=Math.max(1/120,dt||1/60);
   r.vel.set((s.x-r.pos.x)/fd,0,(s.z-r.pos.z)/fd);if(r.vel.lengthSq()>400)r.vel.setLength(20);r.pos.set(s.x,s.y,s.z);r.yaw=s.yaw;r.pitch=s.pitch;r.flashTimer=Math.max(0,r.flashTimer-dt);
   m.group.visible=true;animateSoldier(r,dt,g.elapsed);}
  if(live)this.send(now);}
 qa(){return {room:this.room?{code:this.room.code,self:this.selfId(),host:this.room.host,peers:this.peers().length,meta:this.room.meta||{}}:null,view:this.view,round:this.round,remotes:this.list().map(r=>({id:r.id,name:r.name,x:q(r.pos.x),z:q(r.pos.z),alive:r.alive,kills:r.kills,deaths:r.deaths,visible:!!r.model?.group.visible}))};}
}
