import * as CANNON from './vendor/cannon-es.js';

export const CATALOG = {
  sofa: {name:'Soffa', size:[2.2,1.25,1], mass:6, points:240, color:0xdd7659},
  armchair: {name:'Fåtölj', size:[1.15,1.3,1.05], mass:3, points:160, color:0x61958a},
  tv: {name:'TV', size:[1.7,1.2,.35], mass:2.2, points:200, color:0x293d42},
  table: {name:'Soffbord', size:[1.7,.9,1.05], mass:3, points:140, color:0xd3a96e},
  box: {name:'Flyttlåda', size:[.85,.8,.85], mass:1.4, points:100, color:0xc99b61},
  plant: {name:'Monstera', size:[.85,1.5,.85], mass:2, points:140, color:0x86a07a},
  lamp: {name:'Golvlampa', size:[.65,1.9,.65], mass:1.6, points:130, color:0xf4cc74},
  fridge: {name:'Kylskåp', size:[1,1.8,1], mass:7, points:300, color:0xa3c4b2},
  art: {name:'Konstverk', size:[1.25,1,.2], mass:1, points:180, color:0xea966d}
};

export const FLOORS = [
  {name:'Inflyttad. Utflyttad.',label:'TAKVÅNINGEN',floor:28,modifier:'normal',hint:'Allt ska med. Även den fula lampan.',duration:100,count:9,quota:5},
  {name:'En dyr utsikt',label:'GLASHUSET',floor:32,modifier:'fragile',hint:'Kasta genom glaset för en stilbonus.',duration:100,count:11,quota:7},
  {name:'Nypolerat',label:'HALA GOLV',floor:37,modifier:'ice',hint:'Någon har vaxat parketten. Bromsa i tid.',duration:95,count:12,quota:8},
  {name:'Lätta lyft',label:'LÅG GRAVITATION',floor:42,modifier:'moon',hint:'Längre hopp. Längre kast. Samma självrisk.',duration:95,count:12,quota:8},
  {name:'Tvärdrag deluxe',label:'STORMVÅNINGEN',floor:48,modifier:'wind',hint:'Vinden fångar möblerna. Kompensera åt vänster.',duration:100,count:13,quota:9},
  {name:'Sista lasset',label:'ÖVERTID',floor:56,modifier:'rush',hint:'Fjorton möbler. Åttio sekunder. Kör.',duration:80,count:14,quota:9}
];

export function randomFromSeed(seed) {
  let a = seed >>> 0;
  return () => { a += 0x6D2B79F5; let t=a; t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296; };
}
export function dailySeed(date=new Date()) {
  const str = new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Stockholm',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
  let h=2166136261;for(const c of str)h=Math.imul(h^c.charCodeAt(0),16777619);
  return {seed:h>>>0,date:str};
}
export const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const v3=(x=0,y=0,z=0)=>new CANNON.Vec3(x,y,z);
const finite=(x)=>Number.isFinite(x)?clamp(x,-1,1):0;
export function cleanInput(input={}) {
  if(!input||typeof input!=='object'||Array.isArray(input))input={};
  let mx=finite(input.mx),mz=finite(input.mz),len=Math.hypot(mx,mz);
  if(len>1){mx/=len;mz/=len;}
  let ax=finite(input.ax),az=finite(input.az),al=Math.hypot(ax,az);
  if(al>.02){ax/=al;az/=al;}else{ax=0;az=0;}
  return {mx,mz,ax,az,act:input.act===true,jump:input.jump===true,dash:input.dash===true,drop:input.drop===true};
}

export class GameSimulation {
  constructor(solids=[], glass=[], onEvent=()=>{}) {
    this.onEvent=onEvent;
    this.world=new CANNON.World({gravity:v3(0,-22,0),allowSleep:true});
    this.world.broadphase=new CANNON.SAPBroadphase(this.world);
    this.world.solver.iterations=8;
    this.floorMat=new CANNON.Material('floor');
    this.propMat=new CANNON.Material('furniture');
    this.playerMat=new CANNON.Material('mover');
    this.world.defaultContactMaterial.friction=.5;
    this.world.defaultContactMaterial.restitution=.13;
    this.floorContact=new CANNON.ContactMaterial(this.floorMat,this.propMat,{friction:.55,restitution:.16});
    this.world.addContactMaterial(this.floorContact);
    this.world.addContactMaterial(new CANNON.ContactMaterial(this.playerMat,this.floorMat,{friction:0,restitution:0}));
    this.world.addContactMaterial(new CANNON.ContactMaterial(this.playerMat,this.propMat,{friction:.02,restitution:.04}));
    this.statics=solids.map(s=>this.addStatic(s));
    // A delivery is earned by landing on the truck, not merely entering the
    // air volume above (or below) it. The deck is fixed by the world contract.
    this.deliveryDeck=this.statics.find(b=>Math.abs(b.position.x)<.01&&Math.abs(b.position.z-11)<.01&&Math.abs(b.position.y+1)<.01);
    this.glass=glass.map((g,id)=>({id,...g,body:this.addStatic(g),broken:false}));
    this.props=[];this.players=[];this.phase='menu';this.elapsed=0;this.lastImpact=0;
  }
  addStatic(s) {
    const b=new CANNON.Body({mass:0,material:this.floorMat,position:v3(...s.pos),collisionFilterGroup:1});
    b.addShape(new CANNON.Box(v3(...s.size.map(x=>x/2))));this.world.addBody(b);return b;
  }
  reset({level=0,seed=12345,mode='shift',players=1}={}) {
    for(const p of this.props)this.world.removeBody(p.body);
    for(const p of this.players)this.world.removeBody(p.body);
    this.props=[];this.players=[];
    this.level=Number.isFinite(level)?clamp(Math.floor(level),0,FLOORS.length-1):0;
    this.mode=['shift','daily','practice'].includes(mode)?mode:'shift';this.seed=Number.isFinite(seed)?seed>>>0:12345;
    mode=this.mode;seed=this.seed;players=Number.isFinite(players)?clamp(Math.floor(players),1,2):1;
    this.config={...FLOORS[this.level]};
    if(mode==='daily'){this.config={...FLOORS[4],name:'Dagens flytt',label:'DAGENS UTMANING',duration:90,count:12,quota:8};}
    if(mode==='practice')this.config={...FLOORS[0],name:'Ingen stress',label:'FRI FLYTT',duration:0};
    this.world.gravity.y=this.config.modifier==='moon'?-13:-22;
    this.floorContact.friction=this.config.modifier==='ice'?.025:.55;
    this.time=this.config.duration;this.elapsed=0;this.score=0;this.delivered=0;this.combo=0;this.maxCombo=0;this.comboTime=0;
    this.lost=0;this.falls=0;this.longest=0;this.totalThrows=0;this.lastImpact=0;this.phase='ready';this.result=null;
    this.world.time=0;this.world.accumulator=0;
    for(const g of this.glass){if(g.broken)this.world.addBody(g.body);g.broken=false;g.breakNext=false;}
    for(let i=0;i<players;i++)this.addPlayer(i);
    const random=randomFromSeed(seed);
    const slots=[[-4,4.5],[3,4],[-7,1],[-2,0],[5,.5],[8,-3],[1,-4.2],[-5.2,-4.2],[8,4.5],[-8.3,4.4],[4,-4.4],[-8,-4.1],[1,1.7],[-4,1.9]];
    const types=['sofa','box','armchair','tv','table','plant','fridge','lamp','art','box','armchair','plant','box','tv'];
    for(let i=0;i<this.config.count;i++) {
      const type=types[i],d=CATALOG[type];const [sx,sz]=slots[i];
      const x=sx+(random()-.5)*.45,z=sz+(random()-.5)*.45;
      const body=new CANNON.Body({mass:d.mass,material:this.propMat,position:v3(x,d.size[1]/2+.16,z),linearDamping:.14,angularDamping:.25,allowSleep:true,sleepSpeedLimit:.22,sleepTimeLimit:.7,collisionFilterGroup:2});
      body.addShape(new CANNON.Box(v3(...d.size.map(s=>s/2))));body.quaternion.setFromEuler(0,(random()-.5)*.5,0);
      const item={id:i,type,body,spawn:[x,d.size[1]/2+.2,z],carrier:null,delivered:false,removed:false,respawn:0,thrown:-999,throwOrigin:null,glassBonus:0,landedAt:0};
      body.addEventListener('collide',e=>{
        if(this.phase!=='playing'||item.carrier!==null||item.delivered)return;
        const speed=Math.abs(e.contact.getImpactVelocityAlongNormal());
        if(speed>2.5&&this.elapsed-this.lastImpact>.065){this.lastImpact=this.elapsed;this.emit('impact',{pos:body.position.toArray(),power:Math.min(speed/12,1),kind:item.type});}
        const glass=this.glass.find(g=>!g.broken&&g.body===e.body);
        if(glass&&!glass.breakNext&&speed>3.3&&this.elapsed-item.thrown<5){
          glass.breakNext=true;item.glassBonus+=50;
          // Cannon resolves the still-present pane this step. Restore most of
          // the incoming momentum after removal so shattered glass is passable.
          item.glassVelocity=body.velocity.clone();
        }
      });
      this.props.push(item);this.world.addBody(body);
    }
  }
  addPlayer(id) {
    const body=new CANNON.Body({mass:7,material:this.playerMat,position:v3(id===0?-1.5:1.5,.86,4.8),fixedRotation:true,linearDamping:0,allowSleep:false,collisionFilterGroup:4});
    body.addShape(new CANNON.Sphere(.43),v3(0,-.38,0));body.addShape(new CANNON.Sphere(.43),v3(0,.35,0));body.updateMassProperties();
    const p={id,body,face:{x:0,z:1},carry:null,charge:0,charging:false,prev:{},cooldown:0,dashTime:0,dashDir:{x:0,z:1},grounded:true,coyote:.1,stun:0,steps:0,respawn:0};
    this.players.push(p);this.world.addBody(body);return p;
  }
  start(){if(this.phase==='ended')return;this.phase='playing';this.emit('start');}
  emit(type,detail={}){this.onEvent({type,...detail});}
  nearest(p) {
    let best=null,distance=2.6;
    for(const item of this.props){if(item.carrier!==null||item.delivered||item.respawn>0)continue;const b=item.body.position;const dist=Math.hypot(b.x-p.body.position.x,b.z-p.body.position.z);if(dist<distance&&Math.abs(b.y-p.body.position.y)<2.5){best=item;distance=dist;}}
    return best;
  }
  grip(p) {
    const item=this.nearest(p);if(!item)return false;
    item.carrier=p.id;p.carry=item.id;p.charge=0;p.charging=false;item.body.type=CANNON.Body.KINEMATIC;item.body.collisionFilterMask=0;item.body.velocity.setZero();item.body.angularVelocity.setZero();item.body.quaternion.set(0,0,0,1);item.body.wakeUp();
    this.emit('pickup',{player:p.id,id:item.id,pos:item.body.position.toArray()});return true;
  }
  launch(p,drop=false) {
    const item=this.props[p.carry];if(!item){p.carry=null;return;}
    const charge=p.charge;const speed=drop?1.7:5.2+charge*10.4;const up=drop?1.0:4.6+charge*4.2;
    const b=item.body;b.type=CANNON.Body.DYNAMIC;b.collisionFilterMask=-1;b.updateMassProperties();b.wakeUp();
    b.velocity.set(p.face.x*speed,up,p.face.z*speed);b.angularVelocity.set(p.face.z*2.8,.7,-p.face.x*2.8);
    item.carrier=null;item.thrown=this.elapsed;item.throwOrigin=[p.body.position.x,p.body.position.z];item.glassBonus=0;
    p.carry=null;p.charging=false;p.charge=0;this.totalThrows++;
    this.emit('throw',{player:p.id,id:item.id,power:charge,pos:b.position.toArray()});
  }
  releasePlayer(id){const p=this.players[id];if(!p)return;if(p.carry!==null)this.launch(p,true);p.prev={};p.charging=false;p.charge=0;p.body.velocity.setZero();}
  clearActions(){for(const p of this.players){p.prev={};p.charging=false;p.charge=0;}}
  step(dt,inputs=[]) {
    if(this.phase!=='playing')return;
    if(!Number.isFinite(dt)||dt<=0)return;
    if(!Array.isArray(inputs))inputs=[];
    dt=clamp(dt,0,.05);this.elapsed+=dt;
    if(this.mode!=='practice')this.time=Math.max(0,this.time-dt);
    this.comboTime=Math.max(0,this.comboTime-dt);if(this.comboTime===0)this.combo=0;
    for(const p of this.players) {
      const input=cleanInput(inputs[p.id]);const b=p.body;
      p.cooldown=Math.max(0,p.cooldown-dt);p.dashTime=Math.max(0,p.dashTime-dt);p.stun=Math.max(0,p.stun-dt);
      p.grounded=false;
      for(const contact of this.world.contacts){if(contact.bi===b&&contact.ni.y<-.45||contact.bj===b&&contact.ni.y>.45){p.grounded=true;break;}}
      p.coyote=p.grounded?.12:Math.max(0,p.coyote-dt);
      const moving=Math.hypot(input.mx,input.mz)>.05;
      if(Math.hypot(input.ax,input.az)>.1){p.face.x=input.ax;p.face.z=input.az;}
      else if(moving&&!p.charging){const len=Math.hypot(input.mx,input.mz);p.face.x=input.mx/len;p.face.z=input.mz/len;}
      const heavy=p.carry!==null?CATALOG[this.props[p.carry].type].mass:0;
      let speed=7.2-heavy*.17;if(p.charging)speed*=.55;if(p.stun>0)speed*=.3;
      if(input.dash&&!p.prev.dash&&p.cooldown<=0&&p.stun<=0){p.dashTime=.18;p.cooldown=1.05;p.dashDir={x:moving?input.mx:p.face.x,z:moving?input.mz:p.face.z};this.emit('dash',{player:p.id,pos:b.position.toArray()});}
      if(p.dashTime>0){b.velocity.x=p.dashDir.x*17;b.velocity.z=p.dashDir.z*17;}
      else{const accel=this.config.modifier==='ice'?(moving?5:1.25):(p.grounded?16:7);const k=Math.min(1,dt*accel);b.velocity.x+=(input.mx*speed-b.velocity.x)*k;b.velocity.z+=(input.mz*speed-b.velocity.z)*k;}
      if(input.jump&&!p.prev.jump&&p.coyote>0){b.velocity.y=8.5;p.coyote=0;p.grounded=false;this.emit('jump',{player:p.id,pos:b.position.toArray()});}
      if(input.act&&!p.prev.act){if(p.carry===null)this.grip(p);else{p.charging=true;p.charge=0;}}
      if(p.charging&&input.act)p.charge=clamp(p.charge+dt/1.0,0,1);
      if(!input.act&&p.prev.act&&p.charging)this.launch(p);
      if(input.drop&&!p.prev.drop&&p.carry!==null)this.launch(p,true);
      p.prev=input;p.steps+=Math.hypot(b.velocity.x,b.velocity.z)*dt;
      if(b.position.y<-6||Math.abs(b.position.x)>28||Math.abs(b.position.z)>28) {
        if(p.carry!==null)this.launch(p,true);
        b.position.set(p.id===0?-1.5:1.5,.9,4.8);b.velocity.setZero();b.angularVelocity.setZero();b.aabbNeedsUpdate=true;p.stun=.25;p.prev={};this.falls++;
        if(this.mode!=='practice')this.time=Math.max(0,this.time-2);this.combo=0;this.comboTime=0;
        this.emit('fall',{player:p.id,pos:b.position.toArray()});
      }
      if(p.carry!==null){const item=this.props[p.carry];const lift=Math.max(1.65,1.14+CATALOG[item.type].size[1]/2);item.body.position.set(b.position.x+p.face.x*.38,b.position.y+lift,b.position.z+p.face.z*.38);item.body.quaternion.setFromEuler(0,Math.atan2(p.face.x,p.face.z),0);item.body.aabbNeedsUpdate=true;}
    }
    for(const item of this.props) {
      if(item.respawn>0){item.respawn-=dt;if(item.respawn<=0)this.restore(item);continue;}
      if(item.delivered||item.carrier!==null)continue;
      if(this.config.modifier==='wind'&&item.body.position.y>1.3&&!item.body.sleepState)item.body.applyForce(v3(item.body.mass*2.7,0,.3));
    }
    this.world.step(1/60,dt,4);
    for(const g of this.glass){if(g.breakNext){g.breakNext=false;g.broken=true;this.world.removeBody(g.body);this.emit('glass',{id:g.id,pos:g.pos});}}
    for(const item of this.props) {
      if(item.glassVelocity){item.body.velocity.set(item.glassVelocity.x*.82,item.glassVelocity.y,item.glassVelocity.z*.82);item.glassVelocity=null;}
      if(item.carrier!==null||item.delivered||item.respawn>0)continue;
      const b=item.body,pos=b.position;
      if(pos.y<-7||Math.abs(pos.x)>30||Math.abs(pos.z)>30){item.respawn=1.2;item.body.collisionFilterMask=0;item.body.type=CANNON.Body.KINEMATIC;item.body.velocity.setZero();item.body.angularVelocity.setZero();this.lost++;this.combo=0;this.comboTime=0;this.emit('lost',{id:item.id});continue;}
      if(item.throwOrigin&&pos.x>-5.0&&pos.x<5.0&&pos.z>8.5&&pos.z<13.5&&this.deliveryDeck) {
        const landed=this.world.contacts.some(c=>
          c.bi===b&&c.bj===this.deliveryDeck&&c.ni.y<-.45||
          c.bj===b&&c.bi===this.deliveryDeck&&c.ni.y>.45);
        if(landed)this.deliver(item);
      }
      const av=b.angularVelocity;const al=av.length();if(al>16)av.scale(16/al,av);
    }
    if(this.delivered===this.props.length)this.finish();
    else if(this.time<=0&&this.mode!=='practice')this.finish();
  }
  restore(item) {
    item.body.type=CANNON.Body.DYNAMIC;item.body.collisionFilterMask=-1;item.body.position.set(...item.spawn);item.body.velocity.setZero();item.body.angularVelocity.setZero();item.body.quaternion.set(0,0,0,1);item.body.updateMassProperties();item.body.aabbNeedsUpdate=true;item.body.wakeUp();item.thrown=-999;item.throwOrigin=null;item.respawn=0;
    this.emit('restore',{id:item.id,pos:item.spawn});
  }
  deliver(item) {
    if(item.delivered)return;
    item.delivered=true;item.landedAt=this.elapsed;item.body.type=CANNON.Body.KINEMATIC;item.body.collisionFilterMask=0;item.body.velocity.setZero();item.body.angularVelocity.setZero();
    this.combo=this.comboTime>0?this.combo+1:1;this.comboTime=9;this.maxCombo=Math.max(this.maxCombo,this.combo);
    const distance=item.throwOrigin?Math.hypot(item.body.position.x-item.throwOrigin[0],item.body.position.z-item.throwOrigin[1]):0;this.longest=Math.max(this.longest,distance);
    const multiplier=Math.min(4,1+(this.combo-1)*.5);const longShot=distance>7.5?75:0;
    const value=Math.round((CATALOG[item.type].points+longShot+item.glassBonus)*multiplier);this.score+=value;this.delivered++;
    this.emit('score',{id:item.id,value,combo:this.combo,multiplier,longShot:longShot>0,pos:item.body.position.toArray(),name:CATALOG[item.type].name});
  }
  finish() {
    if(this.phase==='ended')return;
    this.phase='ended';
    const won=this.delivered>=this.config.quota,ratio=this.delivered/this.props.length;
    const stars=won?(ratio===1?3:ratio>=.82?2:1):0;
    const timeBonus=ratio===1&&this.mode!=='practice'?Math.floor(this.time)*5:0;this.score+=timeBonus;
    this.result={won,stars,score:this.score,delivered:this.delivered,total:this.props.length,timeBonus,maxCombo:this.maxCombo,longest:this.longest,lost:this.lost,falls:this.falls,coins:this.mode==='practice'?0:this.delivered*12+stars*35,level:this.level,mode:this.mode,seed:this.seed};
    this.emit('end',{result:this.result});
  }
  snapshot() {
    return {type:'state',phase:this.phase,level:this.level,mode:this.mode,seed:this.seed,time:this.time,elapsed:this.elapsed,score:this.score,delivered:this.delivered,combo:this.combo,comboTime:this.comboTime,maxCombo:this.maxCombo,totalThrows:this.totalThrows,lost:this.lost,falls:this.falls,longest:this.longest,result:this.result,glass:this.glass.map(g=>g.broken),players:this.players.map(p=>({id:p.id,p:p.body.position.toArray(),v:p.body.velocity.toArray(),face:p.face,carry:p.carry,charge:p.charge,charging:p.charging,cooldown:p.cooldown,grounded:p.grounded,steps:p.steps})),props:this.props.map(p=>({id:p.id,p:p.body.position.toArray(),q:p.body.quaternion.toArray(),carrier:p.carrier,delivered:p.delivered,respawn:p.respawn,landedAt:p.landedAt}))};
  }
}
