/* EPOCH — deterministic, renderer-independent battle simulation. Original game code. */
(function (root) {
'use strict';
const AGES = [
 {name:'Stone', label:'Stone age', subtitle:'The first fire', color:'#e5b671', xp:0, power:'Meteor storm', units:['Clubber','Spear thrower','Mammoth rider'], turrets:['Rock sling','Twin sling','Boulder thrower']},
 {name:'Medieval',label:'Medieval age',subtitle:'For crown and kingdom',color:'#d8bf83',xp:340,power:'Arrow tempest',units:['Vanguard','Longbow','Royal lancer'],turrets:['Ballista','Twin ballista','Catapult']},
 {name:'Gunpowder',label:'Gunpowder age',subtitle:'A spark changes everything',color:'#ddb68b',xp:970,power:'Cannon barrage',units:['Halberdier','Musketeer','Bombard'],turrets:['Cannon','Grapeshot','Howitzer']},
 {name:'Modern',label:'Modern age',subtitle:'Steel on the horizon',color:'#a4c1b3',xp:2040,power:'Air strike',units:['Marine','Rocketeer','Ironclad tank'],turrets:['Machine gun','Flak cannon','Siege mortar']},
 {name:'Future',label:'Future age',subtitle:'The last frontier',color:'#8bd8d1',xp:3750,power:'Orbital strike',units:['Sentinel','Plasma ranger','Atlas walker'],turrets:['Pulse turret','Railgun','Singularity cannon']}
];
const DIFFICULTIES = {
 /* AI profile: counter = how strongly it answers your army, powerValue = cluster worth (in basic troops) before a special,
    lead = how far it aims ahead of marching troops, save = saves for the right troop, rush = evolves early when pushed. */
 easy: {label:'Relaxed',income:.78,hp:.84,aiWait:1.4,ageDelay:28,power:1.25,counter:.25,powerValue:6.5,lead:0,save:0,rush:false,turretLevel:1,queue:2},
 normal:{label:'Normal',income:.97,hp:1,aiWait:1,ageDelay:13,power:1,counter:.65,powerValue:4.6,lead:.6,save:.5,rush:true,turretLevel:2,queue:2},
 hard: {label:'Brutal',income:1.19,hp:1.12,aiWait:.82,ageDelay:4,power:.88,counter:.95,powerValue:3.6,lead:1,save:1,rush:true,turretLevel:3,queue:3}
};
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
function unitStats(age,type){
 const scale=Math.pow(1.85,age), money=Math.pow(1.55,age);
 const b=[{hp:108,damage:17,range:.82,speed:1.32,period:.92,cost:55,train:1.05,radius:.38},
 {hp:66,damage:23,range:5.1,speed:1.13,period:1.38,cost:85,train:1.35,radius:.34},
 {hp:345,damage:43,range:1.05,speed:.91,period:1.42,cost:185,train:2.65,radius:.78}][type];
 let x={...b,age,type,name:AGES[age].units[type],hp:Math.round(b.hp*scale),damage:b.damage*scale,cost:Math.round(b.cost*money/5)*5,train:b.train};
 if(age===2&&type===2){x.range=6.9;x.period=2.8;x.damage*=1.55;x.speed=.72;x.splash=1.45;}
 if(age===3){if(type===0){x.range=3.4;x.period=.43;x.damage*=.55;}if(type===1){x.range=6.1;x.period=2;x.damage*=1.65;x.splash=.85;}if(type===2){x.range=5.8;x.period=1.9;x.splash=1.5;}}
 if(age===4){if(type===0){x.range=2.8;x.period=.6;}if(type===1){x.range=6.2;x.period=1.16;}if(type===2){x.range=10.2;x.period=2.2;x.splash=2.2;x.damage*=2.4;x.hp=Math.round(x.hp*1.45);x.cost=Math.round(x.cost*1.2/5)*5;}}
 return x;
}
function turretStats(age,type,level=1){
 const p=Math.pow(1.85,age),m=Math.pow(1.55,age),l=1+(level-1)*.36;
 return {age,type,level,name:AGES[age].turrets[type],cost:Math.round([135,210,315][type]*m/5)*5,damage:[21,15,65][type]*p*l,period:[1.3,.58,2.7][type]/(1+(level-1)*.08),range:[9,8.5,11][type],splash:type===2?1.6:0};
}
function baseHealth(age){return Math.round(1600*Math.pow(1.72,age));}
class Battle {
 constructor(options={}){this.reset(options);}
 reset(options={}){
  this.difficulty=options.difficulty||'normal';this.diff=DIFFICULTIES[this.difficulty]||DIFFICULTIES.normal;
  this.seed=options.seed||Math.floor(Math.random()*0x7fffffff);this.nextId=1;this.time=0;this.result=null;this.units=[];this.pending=[];this.events=[];this.aiTimer=2.3;this.kills=0;this.trained=0;this.powerCount=0;this.totalGold=0;this.evolutionAt=[0,0];this.demo=!!options.demo;this.aiState={seen:[0,0,0],powerFullAt:null};
  this.teams=[0,1].map(side=>({side,age:0,gold:side===0?225:170,xp:0,hp:1600,maxHp:1600,queue:[],turrets:[null,null,null],power:1,pop:0,damage:0,spent:0,ageReadyAt:null}));
  this.spawn(0,0,0,-7.5);this.spawn(1,0,0,7.5);this.emit('reset',{});
 }
 random(){this.seed=(Math.imul(this.seed,1664525)+1013904223)>>>0;return this.seed/4294967296;}
 emit(type,data={}){this.events.push({type,time:this.time,...data});}
 drain(){const ev=this.events;this.events=[];return ev;}
 spawn(side,age,type,x){
  const st=unitStats(age,type),u={...st,id:this.nextId++,side,dir:side===0?1:-1,x:x??(side===0?-18.05:18.05),z:(this.random()-.5)*.36,hp:st.hp*(side===1?this.diff.hp:1),maxHp:st.hp*(side===1?this.diff.hp:1),cooldown:.2,walk:0,attack:0,hit:0,moving:false,dead:false};
  this.units.push(u);this.teams[side].pop++;if(side===0&&this.aiState)this.aiState.seen[type]+=st.cost;this.emit('spawn',{unit:u});return u;
 }
 recruit(side,type){
  const t=this.teams[side];if(this.result||type<0||type>2)return false;
  const s=unitStats(t.age,type);if(t.gold<s.cost||t.queue.length>=6||t.pop+t.queue.length>=28)return false;
  t.gold-=s.cost;t.spent+=s.cost;t.queue.push({age:t.age,type,time:s.train,total:s.train,cost:s.cost});if(side===0)this.trained++;
  this.emit('recruit',{side,unitType:type});return true;
 }
 cancel(index){const t=this.teams[0];if(index<0||index>=t.queue.length||this.result)return false;const q=t.queue.splice(index,1)[0];t.gold+=q.cost;this.emit('cancel');return true;}
 evolve(side){
  const t=this.teams[side];if(this.result||t.age>=4||t.xp<AGES[t.age+1].xp)return false;
  const ratio=t.hp/t.maxHp;t.age++;t.maxHp=baseHealth(t.age);t.hp=Math.min(t.maxHp,t.maxHp*(ratio+.22));t.gold+=Math.round(90*Math.pow(1.55,t.age));t.power=Math.max(t.power,.6);t.ageReadyAt=null;this.evolutionAt[side]=this.time;
  t.turrets.forEach(tr=>{if(tr){Object.assign(tr,turretStats(t.age,tr.type,tr.level));tr.cooldown=.5;}});
  this.emit('evolve',{side,age:t.age});return true;
 }
 build(side,type,slot){
  const t=this.teams[side];if(this.result||type<0||type>2)return false;
  if(slot===undefined)slot=t.turrets.findIndex(v=>!v);if(slot<0||slot>2||t.turrets[slot])return false;
  const st=turretStats(t.age,type);if(t.gold<st.cost)return false;t.gold-=st.cost;t.spent+=st.cost;t.turrets[slot]={...st,slot,invested:st.cost,cooldown:.5};this.emit('build',{side,slot});return true;
 }
 upgradeCost(tr){return Math.round(tr.cost*(.75+tr.level*.15)/5)*5;}
 upgrade(slot,side=0){const t=this.teams[side],tr=t.turrets[slot];if(!tr||tr.level>=3||this.result)return false;const cost=this.upgradeCost(tr);if(t.gold<cost)return false;t.gold-=cost;t.spent+=cost;tr.invested+=cost;Object.assign(tr,turretStats(t.age,tr.type,tr.level+1));this.emit('build',{side,slot});return true;}
 sell(slot){const t=this.teams[0],tr=t.turrets[slot];if(!tr||this.result)return false;t.gold+=Math.floor(tr.invested*.65);t.turrets[slot]=null;this.emit('build',{side:0,slot,sold:true});return true;}
 power(side,x){
  const t=this.teams[side];if(this.result||t.power<.999)return false;t.power=0;x=clamp(x,-17,17);if(side===0)this.powerCount++;
  const age=t.age,count=age===4?3:age===1?15:6;
  this.emit('power',{side,age,x});
  for(let i=0;i<count;i++){
   const at=x+(this.random()-.5)*(age===4?5.5:8.4),delay=.58+i*(age===1?.066:age===4?.3:.16);
   this.pending.push({kind:'strike',due:this.time+delay,side,age,x:clamp(at,-18.8,18.8),damage:(age===1?29:age===4?145:92)*Math.pow(1.85,age),radius:age===1?1.05:age===4?2.9:2.05,visual:delay});
   this.emit('strikeIncoming',{side,age,x:clamp(at,-18.8,18.8),delay});
  }return true;
 }
 hurt(u,damage,side,source){
  if(u.dead||this.result)return;
  u.hp-=damage;u.hit=.14;this.teams[side].damage+=damage;this.emit('hit',{id:u.id,x:u.x,z:u.z,damage,age:u.age,side:u.side,source});
  if(u.hp<=0){u.dead=true;this.teams[u.side].pop--;const winner=this.teams[side],bounty=Math.round(u.cost*.59);winner.gold+=bounty;winner.xp+=Math.round(29*Math.pow(1.63,u.age)*(u.type===2?2.6:u.type===1?1.3:1));this.teams[u.side].xp+=Math.round(9*Math.pow(1.6,u.age)*(u.type===2?2:1));if(side===0){this.kills++;this.totalGold+=bounty;}this.emit('death',{id:u.id,x:u.x,z:u.z,side:u.side,age:u.age,unitType:u.type,bounty});}
 }
 hurtBase(side,damage,attacker){
  const b=this.teams[side];if(this.result)return;b.hp=Math.max(0,b.hp-damage);this.teams[attacker].damage+=damage;this.teams[attacker].xp+=Math.min(2.5,damage*.055);this.emit('baseHit',{side,damage});
  if(b.hp<=0){this.result=attacker===0?'victory':'defeat';this.emit('end',{result:this.result,winner:attacker});}
 }
 shoot(attacker,target,fromTurret=false,slot=0){
  const side=attacker.side??0,age=attacker.age,targetBase=target.base,tx=target.x,ax=attacker.x,delay=(age>=3&&attacker.type===0)?.09:Math.abs(tx-ax)/(age>=3?22:14);
  const s={kind:'shot',due:this.time+delay,side,age,targetId:targetBase?null:target.id,targetBase:targetBase?target.side:null,x:tx,damage:attacker.damage,splash:attacker.splash||0};
  this.pending.push(s);this.emit('shot',{side,age,unitType:attacker.type,fromTurret,slot,from:ax,to:tx,fromId:attacker.id,toId:target.id,delay,z:attacker.z||0});
 }
 /* Scouting: what the player fields now, plus a fading memory of what they have been training. */
 aiRead(){
  const r={value:[0,0,0],splash:0,pressure:0,near:0,front:-19,enemies:[],own:[0,0,0],ownValue:0,longRange:0,walkers:0};
  for(const u of this.units){if(u.dead)continue;
   if(u.side===0){r.enemies.push(u);r.value[u.type]+=u.cost;if(u.splash)r.splash+=u.cost;if(u.range>=6.5)r.longRange++;if(u.age===4&&u.type===2)r.walkers++;if(u.x>r.front)r.front=u.x;
    if(u.x>2)r.pressure+=u.cost*clamp((u.x-2)/9,.25,1.6);if(u.x>4)r.near++;}
   else{r.own[u.type]++;r.ownValue+=u.cost;}
  }
  const seen=this.aiState.seen,v=r.value.map((x,i)=>x+seen[i]*.6),total=v[0]+v[1]+v[2];
  r.share=total>0?v.map(x=>x/total):[.34,.33,.33];r.splashShare=total>0?r.splash/total:0;
  return r;
 }
 /* Choose the troop that best answers the player's army while keeping a front line in front of the archers. */
 aiPick(t,r){
  const c=this.diff.counter,sh=r.share,front=r.own[0]+r.own[2],want=[1.1,1,.75];
  want[0]+=c*(sh[1]*.9-r.splashShare*.6);          // cheap bodies soak ranged fire, but splash punishes clumps
  want[1]+=c*(sh[0]*1.3+sh[2]*1.1);                // ranged shreds melee lines and wears heavies down from behind
  want[2]+=c*(sh[1]*1.6+sh[2]*(t.age>=3?1.7:.5)+r.splashShare*.5); // armour closes on ranged lines; late heavies are the only answer to heavies
  if(t.age===4)want[2]+=.9;                           // the walker outranges everything else in the last age
  if(r.own[1]>front*1.15+1)want[1]*=.3;              // never a ranged line with nobody in front
  if(front===0)want[0]+=1.2;
  if(r.front>10)want[0]+=1.4;                         // enemy at the gate: fastest troop first
  want[0]=Math.max(.15,want[0]);
  let pick=0;
  if(c>=.9)pick=want.indexOf(Math.max(...want));
  else{const sharp=want.map(w=>Math.pow(w,1+c*3)),sum=sharp[0]+sharp[1]+sharp[2];let roll=this.random()*sum;for(let i=0;i<3;i++){roll-=sharp[i];if(roll<=0){pick=i;break;}}}
  return pick;
 }
 /* Best spot for the special: the most valuable cluster, aimed ahead of marching troops, weighted toward its own base. */
 aiPower(t,r,pushed){
  const st=this.aiState;if(t.power<1){st.powerFullAt=null;return;}
  if(st.powerFullAt===null)st.powerFullAt=this.time;
  if(!r.enemies.length||this.time<(this.difficulty==='easy'?28:16))return;
  const age=t.age,half=age===4?2.75+2.9:age===1?4.2+1.05:4.2+2.05,lead=this.diff.lead*(.58+(age===1?.5:.6));
  let best=0,bx=0;
  for(const c of r.enemies){
   const x=clamp(c.x+(c.moving?c.speed*lead:0),-17,17);let val=0;
   for(const u of r.enemies){const d=Math.abs(u.x+(u.moving?u.speed*lead:0)-x);if(d<half)val+=u.cost*(1-.55*d/half);}
   val*=x>9?1.6:x>4?1.25:1;
   if(age===4&&x<-14)val+=unitStats(this.teams[0].age,0).cost*2.5; // orbital strikes also crack the player's stronghold
   if(val>best){best=val;bx=x;}
  }
  let need=unitStats(this.teams[0].age,0).cost*this.diff.powerValue;
  if(pushed)need*=.55;
  if(t.hp<t.maxHp*.4&&r.front>9)need*=.4;
  need*=1-Math.min(.35,(this.time-st.powerFullAt)/40); // a charge sitting idle is wasted
  if(this.difficulty==='easy'&&this.random()<.35)return;
  if(best>=need&&this.power(1,bx))st.powerFullAt=null;
 }
 aiTurrets(t,r,pushed){
  const d=this.diff,easy=this.difficulty==='easy',tur=t.turrets.filter(Boolean).length,cap=t.age>=2?3:2;
  const reserve=unitStats(t.age,0).cost*(r.near?1:2);
  if(tur<cap){
   const type=tur===2?2:(!easy&&(r.share[0]>.5||r.longRange>1)&&t.gold>turretStats(t.age,2).cost+reserve)?2:(!easy&&r.share[1]>.45)?1:0;
   const due=easy?this.time>45+tur*70:this.time>32+tur*50||(pushed&&this.time>24);
   if(due&&t.gold>turretStats(t.age,type).cost+reserve&&this.build(1,type))return;
  }
  if(pushed||this.time<90)return;
  for(const tr of t.turrets)if(tr&&tr.level<d.turretLevel&&t.gold>this.upgradeCost(tr)+unitStats(t.age,2).cost){this.upgrade(tr.slot,1);return;}
 }
 ai(dt){
  this.aiTimer-=dt;if(this.aiTimer>0)return;this.aiTimer=(.75+this.random()*.35)*this.diff.aiWait;
  const t=this.teams[1],d=this.diff,st=this.aiState;
  for(let i=0;i<3;i++)st.seen[i]*=.93;
  const r=this.aiRead(),pushed=r.pressure>Math.max(unitStats(t.age,0).cost*2.2,r.ownValue*.75)||r.front>11;
  if(t.age<4&&t.xp>=AGES[t.age+1].xp){if(t.ageReadyAt===null)t.ageReadyAt=this.time;
   const hurt=t.hp<t.maxHp*.65;
   if(this.time-t.ageReadyAt>=d.ageDelay||(d.rush&&(pushed||hurt)))this.evolve(1); // evolving under pressure heals the base and brings stronger troops
  }
  this.aiPower(t,r,pushed);
  this.aiTurrets(t,r,pushed);
  const queueCap=pushed?d.queue+1:d.queue;
  if(t.queue.length>=queueCap||t.pop>=20)return;
  // Just before an age-up, a careful commander stops buying old-age troops so the gold buys new ones.
  if(d.save&&!pushed&&t.age<4&&r.own[0]+r.own[2]>0){const togo=AGES[t.age+1].xp-t.xp;if(togo>0&&togo<(1.55+t.age*.38)*7*d.save)return;}
  // Cheap troops only feed bounty to enemy walkers: answer them with a walker of its own.
  const matchWalkers=d.save&&t.age===4&&r.walkers>0&&t.hp>t.maxHp*.3;
  const pick=matchWalkers?2:this.aiPick(t,r),cost=unitStats(t.age,pick).cost;
  if(t.gold>=cost){this.recruit(1,pick);return;}
  // Save for the right troop unless the line is thin or under pressure; otherwise buy what it can.
  const thin=t.pop+t.queue.length<3;
  if(!pushed&&!thin&&this.random()<d.save)return;
  if(matchWalkers)return;
  for(const alt of pick===2?[1,0]:pick===1?[0]:[])if(t.gold>=unitStats(t.age,alt).cost){this.recruit(1,alt);return;}
 }
 step(dt){
  if(this.result||dt<=0)return;dt=Math.min(dt,.1);this.time+=dt;
  for(const t of this.teams){const income=6.7*Math.pow(1.55,t.age)*(t.side?this.diff.income:1);t.gold+=income*dt;t.xp+=(1.55+t.age*.38)*dt;t.power=clamp(t.power+dt/(38+(t.age===4?5:0))*(t.side?this.diff.power:1),0,1);
   if(t.queue.length){t.queue[0].time-=dt;if(t.queue[0].time<=0){const q=t.queue.shift();this.spawn(t.side,q.age,q.type);}}
  }
  this.ai(dt);
  const alive=this.units.filter(u=>!u.dead),a=alive.filter(u=>u.side===0).sort((u,v)=>v.x-u.x),b=alive.filter(u=>u.side===1).sort((u,v)=>u.x-v.x);
  for(const list of [a,b])for(let index=0;index<list.length;index++){
   const u=list[index];if(u.dead)continue;const enemies=u.side===0?b:a;let target=null,min=Infinity;
   for(const en of enemies){if(en.dead)continue;const d=(en.x-u.x)*u.dir;if(d>=-.3&&d<min){target=en;min=d;}}
   if(!target){target={base:true,side:1-u.side,x:u.side===0?19:-19,radius:1.1};min=(target.x-u.x)*u.dir;}
   const distance=min-u.radius-(target.radius||.35);u.cooldown-=dt;u.attack=Math.max(0,u.attack-dt);u.hit=Math.max(0,u.hit-dt);u.moving=false;
   if(distance<=u.range){
    if(u.cooldown<=0){u.cooldown=u.period;u.attack=.3;
     if(u.range>2)this.shoot(u,target);else{this.emit('melee',{id:u.id,side:u.side,age:u.age,unitType:u.type,x:u.x});if(target.base)this.hurtBase(target.side,u.damage,u.side);else this.hurt(target,u.damage,u.side,'melee');}
    }
   }else{
    const ahead=list.slice(0,index).reverse().find(friend=>!friend.dead&&(friend.range<=u.range+.35||friend.moving));let move=u.speed*dt;
    if(ahead&&!ahead.dead){const gap=(ahead.x-u.x)*u.dir-u.radius-ahead.radius-.09;move=Math.min(move,Math.max(0,gap));}
    move=Math.min(move,Math.max(0,distance-u.range+.01));u.x+=u.dir*move;u.moving=move>.002;u.walk+=move*6;
   }
  }
  for(const t of this.teams)for(let i=0;i<3;i++){
   const tr=t.turrets[i];if(!tr)continue;tr.cooldown-=dt;if(tr.cooldown>0)continue;
   const enemies=t.side===0?b:a;const target=enemies.filter(u=>!u.dead&&Math.abs(u.x-(t.side===0?-19:19))<=tr.range).sort((u,v)=>t.side===0?u.x-v.x:v.x-u.x)[0];
   if(target){tr.cooldown=tr.period;this.shoot({...tr,side:t.side,x:t.side===0?-19.35:19.35,z:-.25},target,true,i);}
  }
  const pending=this.pending;this.pending=[];
  for(const p of pending){if(p.due>this.time){this.pending.push(p);continue;}if(this.result)continue;
   if(p.kind==='strike'){
    for(const u of this.units)if(!u.dead&&u.side!==p.side&&Math.abs(u.x-p.x)<p.radius+u.radius)this.hurt(u,p.damage*(1-.27*Math.min(1,Math.abs(u.x-p.x)/p.radius)),p.side,'power');
    if(Math.abs(p.x-(p.side===0?19:-19))<p.radius+1.1)this.hurtBase(1-p.side,p.damage*(p.age===4?.55:.25),p.side);
    this.emit('strikeImpact',{...p});
   }else if(p.targetBase!==null){this.hurtBase(p.targetBase,p.damage,p.side);this.emit('impact',{x:p.x,age:p.age,heavy:p.splash>0});}
   else{
    const target=this.units.find(u=>u.id===p.targetId&&!u.dead);const x=target?target.x:p.x;
    if(p.splash>0){for(const u of this.units)if(!u.dead&&u.side!==p.side&&Math.abs(u.x-x)<p.splash+u.radius)this.hurt(u,p.damage*(u.id===p.targetId?1:.58),p.side,'shot');}
    else if(target)this.hurt(target,p.damage,p.side,'shot');
    if(p.splash>0&&Math.abs(x-(p.side===0?19:-19))<p.splash+1.2)this.hurtBase(1-p.side,p.damage*.55,p.side);
    this.emit('impact',{x,age:p.age,heavy:p.splash>0});
   }
  }
  this.units=this.units.filter(u=>!u.dead);
 }
 snapshot(){return{time:this.time,result:this.result,difficulty:this.difficulty,units:this.units.length,kills:this.kills,trained:this.trained,teams:this.teams.map(t=>({age:t.age,gold:Math.floor(t.gold),xp:Math.floor(t.xp),hp:Math.round(t.hp),maxHp:t.maxHp,pop:t.pop,queue:t.queue.length,turrets:t.turrets.filter(Boolean).length,power:t.power}))};}
}
root.EpochSim={Battle,AGES,DIFFICULTIES,unitStats,turretStats,baseHealth,clamp};
if(typeof module!=='undefined')module.exports=root.EpochSim;
})(globalThis);
