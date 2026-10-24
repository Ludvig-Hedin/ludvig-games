import * as THREE from 'three';

// Shared rigid-part geometry keeps sixteen articulated soldiers inexpensive.
const Y = new THREE.Vector3(0, 1, 0);
const VA = new THREE.Vector3(), VB = new THREE.Vector3(), VC = new THREE.Vector3();
const MX = new THREE.Matrix4();
const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;
const NAMES = ['REYES', 'GHOSTLINE', 'KOBRA', 'NOMAD', 'VALKYRIE', 'BISHOP', 'SHRIKE', 'KADE', 'ROOK', 'VEGA', 'STRIDER', 'ASH', 'DUSK', 'HOUND', 'SABLE', 'TRACE'];
const IDS = ['vx4', 'kestrel', 'drake', 'mastiff', 's9', 'atlas', 'vx4', 'specter', 'viper'];
const TUNING = {
  recruit: {reaction: .66, spread: .064, speed: 5.25, vision: 43, think: .32, aggression: .36, dodge: .1},
  regular: {reaction: .34, spread: .032, speed: 6.2, vision: 62, think: .23, aggression: .65, dodge: .3},
  veteran: {reaction: .22, spread: .019, speed: 7.4, vision: 78, think: .17, aggression: .82, dodge: .58},
  master: {reaction: .14, spread: .011, speed: 8.25, vision: 90, think: .13, aggression: .95, dodge: .8}
};
const jointRest = [
  [0,.84,0],[0,1.16,0],[0,1.45,0],[0,1.64,0],
  [-.255,1.34,0],[-.32,1.10,-.18],[-.17,1.16,-.49],
  [.255,1.34,0],[.32,1.10,.015],[.13,1.18,-.27],
  [-.14,.82,0],[-.15,.43,-.015],[-.15,.095,0],
  [.14,.82,0],[.15,.43,-.015],[.15,.095,0]
];
const limbPairs = [[4,5],[5,6],[7,8],[8,9],[10,11],[11,12],[13,14],[14,15]];
const constraints = [[0,1],[1,2],[2,3],[4,7],[4,1],[7,1],[4,2],[7,2],[0,10],[0,13],[10,13],[4,10],[7,13],[4,13],[7,10],...limbPairs,[10,2],[13,2]];
const jointRadius = [.15,.19,.10,.14,.10,.075,.07,.10,.075,.07,.12,.085,.08,.12,.085,.08];
let resources = null;

function colorGeometry(geometry, color) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  if (g !== geometry) geometry.dispose();
  const c = new THREE.Color(color), n = g.attributes.position.count;
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { colors[i*3] = c.r; colors[i*3+1] = c.g; colors[i*3+2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}
function merge(parts) {
  const length = parts.reduce((n,g)=>n+g.attributes.position.array.length,0);
  const p = new Float32Array(length), n = new Float32Array(length), c = new Float32Array(length);
  let offset = 0;
  for (const g of parts) {p.set(g.attributes.position.array,offset);n.set(g.attributes.normal.array,offset);c.set(g.attributes.color.array,offset);offset+=g.attributes.position.array.length;g.dispose();}
  const g = new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.BufferAttribute(p,3));g.setAttribute('normal',new THREE.BufferAttribute(n,3));g.setAttribute('color',new THREE.BufferAttribute(c,3));g.computeBoundingSphere();return g;
}
function kit() {
  const parts = [];
  function add(g,x,y,z,c,rx=0,ry=0,rz=0) {g.rotateX(rx);g.rotateY(ry);g.rotateZ(rz);g.translate(x,y,z);parts.push(colorGeometry(g,c));}
  return {
    box(w,h,d,x,y,z,c,rx=0,ry=0,rz=0){add(new THREE.BoxGeometry(w,h,d),x,y,z,c,rx,ry,rz);},
    oval(w,h,d,x,y,z,c){const g=new THREE.SphereGeometry(1,10,7);g.scale(w,h,d);add(g,x,y,z,c);},
    cylinder(r1,r2,h,x,y,z,c,rx=0,ry=0,rz=0){add(new THREE.CylinderGeometry(r1,r2,h,10),x,y,z,c,rx,ry,rz);},
    bevel(w,h,d,x,y,z,c,r=.025) {const shape=new THREE.Shape();const a=w/2,b=h/2;shape.moveTo(-a+r,-b);shape.lineTo(a-r,-b);shape.quadraticCurveTo(a,-b,a,-b+r);shape.lineTo(a,b-r);shape.quadraticCurveTo(a,b,a-r,b);shape.lineTo(-a+r,b);shape.quadraticCurveTo(-a,b,-a,b-r);shape.lineTo(-a,-b+r);shape.quadraticCurveTo(-a,-b,-a+r,-b);const g=new THREE.ExtrudeGeometry(shape,{depth:d,bevelEnabled:true,bevelSegments:1,steps:1,bevelSize:.006,bevelThickness:.006,curveSegments:2});g.translate(0,0,-d/2);add(g,x,y,z,c);},
    done(){return merge(parts);}
  };
}
function makeResources() {
  if (resources) return resources;
  const cloth = 0x535e50, darkCloth = 0x343d35, armor = 0x333b39, webbing=0x6d7261, black=0x151c1c, metal=0x343c3d, skin=0x927765;
  const material = new THREE.MeshStandardMaterial({vertexColors:true,roughness:.82,metalness:.12});
  const meshParts = {};
  for (const side of [0,1]) {
    const k=kit(), main=side===0?0x455a5a:0x746c55, accent=side===0?0x39a8cb:0xd4654c;
    k.oval(.255,.28,.145,0,0,0,main);
    k.bevel(.36,.36,.09,0,.005,-.133,armor,.04);
    k.bevel(.31,.32,.07,0,.005,.135,armor,.04);
    k.box(.075,.36,.035,-.15,.04,-.2,webbing,0,0,-.11);k.box(.075,.36,.035,.15,.04,-.2,webbing,0,0,.11);
    for(let i=0;i<4;i++){const x=(i-1.5)*.077;k.bevel(.065,.125,.055,x,-.062,-.22,main,.012);k.box(.052,.018,.013,x,-.017,-.252,webbing);}
    k.box(.18,.038,.018,0,.147,-.198,accent);
    k.box(.13,.052,.015,0,.12,.18,accent);
    for(let i=0;i<5;i++){k.box(.30,.012,.009,0,-.09+i*.047,.185,webbing);}
    k.bevel(.19,.21,.08,-.14,-.12,.18,darkCloth,.02);k.bevel(.15,.22,.1,.14,-.09,.19,darkCloth,.02);
    k.cylinder(.025,.025,.13,.24,-.15,-.04,metal);k.cylinder(.017,.017,.12,-.22,.01,-.14,black);
    k.box(.015,.2,.015,-.22,.15,-.14,black);
    meshParts['torso'+side]=k.done();
  }
  {
    const k=kit();k.oval(.22,.15,.135,0,0,0,darkCloth);k.box(.40,.075,.28,0,.07,0,black);k.box(.08,.055,.018,0,.07,-.15,metal);
    for(const s of [-1,1]){k.bevel(.105,.13,.10,s*.23,-.035,.01,webbing,.015);k.box(.11,.035,.08,s*.23,.03,.01,armor);}
    meshParts.pelvis=k.done();
  }
  {
    const k=kit();k.oval(.129,.159,.131,0,-.008,0,darkCloth);k.oval(.134,.105,.139,0,.069,.008,cloth);
    k.box(.19,.055,.046,0,.003,-.121,black);k.bevel(.073,.037,.014,-.046,.007,-.150,0x19383a,.01);k.bevel(.073,.037,.014,.046,.007,-.150,0x19383a,.01);
    k.box(.2,.018,.03,0,.079,-.126,webbing);k.box(.08,.026,.034,0,.116,-.105,black);
    for(const s of[-1,1]){k.oval(.025,.055,.044,s*.137,.005,.01,black);k.box(.015,.04,.065,s*.135,.063,.0,webbing);}
    k.cylinder(.009,.009,.085,.115,-.055,-.085,black,-.75,0,.3);k.oval(.02,.013,.022,.09,-.075,-.115,black);
    k.oval(.05,.027,.021,0,-.045,-.117,skin);k.bevel(.14,.06,.035,0,-.09,-.09,darkCloth,.02);
    meshParts.head=k.done();
  }
  for(const name of['upperarm','forearm','thigh','shin']) {
    const k=kit();const leg=name==='thigh'||name==='shin';const upper=name==='upperarm'||name==='thigh';const radius=leg?.095:.073;
    k.oval(radius,.51,radius*.96,0,.5,0,upper?cloth:darkCloth);
    if(name==='upperarm'){k.bevel(.13,.21,.035,0,.18,-.066,armor,.02);k.box(.09,.035,.015,0,.2,-.091,webbing);}
    if(name==='forearm'){k.box(.12,.13,.12,0,.83,0,black);k.oval(.069,.16,.067,0,.98,0,black);for(let i=0;i<4;i++)k.box(.018,.09,.022,(i-1.5)*.025,1.03,-.052,armor);}
    if(name==='thigh'){k.bevel(.10,.23,.04,.074,.48,-.02,webbing,.018);k.box(.14,.035,.14,0,.43,0,armor);}
    if(name==='shin'){k.bevel(.14,.20,.055,0,.1,-.074,armor,.027);k.oval(.10,.17,.13,0,.9,-.035,black);k.box(.16,.15,.25,0,1.0,-.061,black);k.box(.17,.045,.26,0,1.08,-.06,0x242a28);}
    meshParts[name]=k.done();
  }
  {
    const k=kit();k.bevel(.075,.095,.24,0,0,0,metal,.012);k.cylinder(.034,.034,.28,0,.025,-.21,black,Math.PI/2);k.box(.073,.065,.20,0,-.012,-.17,armor);
    for(let i=0;i<5;i++){k.box(.079,.008,.012,0,.035,-.105-i*.027,black);for(const s of[-1,1])k.box(.007,.018,.018,s*.041,0,-.11-i*.029,0x0c1112);}
    k.cylinder(.013,.013,.18,0,.02,-.40,metal,Math.PI/2);k.cylinder(.022,.022,.036,0,.02,-.495,black,Math.PI/2);
    k.box(.056,.12,.05,0,-.095,-.015,black,.2);k.bevel(.052,.145,.061,0,-.11,-.075,metal,.01);
    k.box(.048,.038,.14,0,.005,.16,black);k.bevel(.07,.10,.055,0,-.025,.25,black,.012);
    k.box(.055,.018,.12,0,.066,-.015,black);k.bevel(.065,.047,.045,0,.086,-.005,metal,.012);k.box(.047,.027,.009,0,.09,-.032,0x244b4d);
    meshParts.rifle=k.done();
  }
  const flashGeometry = new THREE.ConeGeometry(.075,.23,5);flashGeometry.rotateX(-Math.PI/2);
  const flashMaterial = new THREE.MeshBasicMaterial({color:0xffdc8e,transparent:true,opacity:.9,depthWrite:false});
  resources={material,parts:meshParts,flashGeometry,flashMaterial};return resources;
}
function mesh(geometry, material) {const m=new THREE.Mesh(geometry,material);m.castShadow=true;m.receiveShadow=false;return m;}
export function createSoldier(team) {
  const res=makeResources(),group=new THREE.Group();
  const torso=mesh(res.parts['torso'+(team===0?0:1)],res.material),pelvis=mesh(res.parts.pelvis,res.material),head=mesh(res.parts.head,res.material);
  group.add(torso,pelvis,head);
  const limbs=limbPairs.map((pair,i)=>mesh(res.parts[i<4?(i%2===0?'upperarm':'forearm'):(i%2===0?'thigh':'shin')],res.material));limbs.forEach(m=>group.add(m));
  const gun=mesh(res.parts.rifle,res.material);group.add(gun);
  const flash=mesh(res.flashGeometry,res.flashMaterial);flash.castShadow=false;flash.position.set(0,.02,-.55);flash.visible=false;gun.add(flash);
  const joints=jointRest.map(p=>new THREE.Vector3(...p));
  const model={group,torso,pelvis,head,limbs,gun,flash,joints,fadeMaterial:null};poseModel(model,0);return model;
}
function poseModel(m,pitch=0,ragdoll=false) {
  const j=m.joints;
  VA.subVectors(j[2],j[0]).normalize();VB.subVectors(j[7],j[4]).normalize();VC.crossVectors(VB,VA).normalize();VB.crossVectors(VA,VC).normalize();
  MX.makeBasis(VB,VA,VC);m.torso.quaternion.setFromRotationMatrix(MX);m.pelvis.quaternion.copy(m.torso.quaternion);m.torso.position.copy(j[1]);m.pelvis.position.copy(j[0]);
  m.head.position.copy(j[3]);m.head.quaternion.copy(m.torso.quaternion);m.head.rotateX(pitch*.65);
  for(let i=0;i<limbPairs.length;i++){const [a,b]=limbPairs[i],part=m.limbs[i];VA.subVectors(j[b],j[a]);const len=VA.length();part.position.copy(j[a]);part.quaternion.setFromUnitVectors(Y,VA.multiplyScalar(1/Math.max(.0001,len)));part.scale.set(1,len,1);}
  if(!ragdoll){m.gun.position.copy(j[9]);m.gun.position.z-=.02;m.gun.rotation.set(pitch,0,0);}
}
export function animateSoldier(bot, dt, time) {
  const m=bot.model;if(!m)return;
  const speed=Math.hypot(bot.vel.x,bot.vel.z),running=speed>7,slide=bot.slideTimer>0,crouch=bot.crouchTimer>0;
  const lower=slide?.67:crouch?.36:0;
  const moving=speed>.3,gait=time*(running?14:10.8)+bot.index*1.4;
  const stride=moving?Math.min(.34,speed*.04):0;
  const bob=moving?Math.abs(Math.sin(gait))*.025:Math.sin(time*1.7+bot.index)*.006;
  for(let i=0;i<jointRest.length;i++){const p=jointRest[i];m.joints[i].set(p[0],p[1]-lower+bob,p[2]);}
  if(slide){
    for(const i of[0,1,2,3,4,5,6,7,8,9]){m.joints[i].z+=.15;m.joints[i].y+=.06;}
    m.joints[11].set(-.18,.28,-.34);m.joints[12].set(-.19,.11,-.65);m.joints[14].set(.20,.25,-.25);m.joints[15].set(.23,.11,-.55);
  } else {
    for(let side=0;side<2;side++){const h=side===0?10:13,k=h+1,a=h+2,swing=Math.sin(gait+(side?Math.PI:0))*stride;
      m.joints[k].y=.43-lower*.4+Math.max(0,swing)*.20;m.joints[k].z=-.015+swing*.6-(crouch?.12:0);
      m.joints[a].y=.095+Math.max(0,-swing)*.34;m.joints[a].z=swing;
      if(!bot.grounded){m.joints[k].y+=.14;m.joints[k].z-=.14;m.joints[a].y+=.22;m.joints[a].z+=.08;}
    }
  }
  const aim=bot.target&&bot.target.alive;const lean=aim?bot.strafeSign*.018:running?-.07:0;
  for(const i of[1,2,3,4,5,6,7,8,9])m.joints[i].z+=lean;
  if(bot.reloading>0){const progress=1-bot.reloading/Math.max(.1,bot.reloadDuration);m.joints[6].set(-.17,1.03-lower,-.20);m.joints[5].set(-.31,1.02-lower,-.07);m.joints[6].y-=Math.sin(progress*Math.PI)*.22;}
  else if(running&&!aim){m.joints[6].y+=.11;m.joints[9].y+=.11;m.joints[6].z+=.09;}
  poseModel(m,bot.pitch+(running&&!aim?-.45:0));
  m.group.position.copy(bot.pos);m.group.rotation.y=bot.yaw;
  m.flash.visible=bot.flashTimer>0;
  if(bot.flashTimer>0){m.flash.rotation.z=time*40;m.gun.position.z+=bot.flashTimer*.6;}
}
function raySphere(origin,dir,center,radius) {
  const x=origin.x-center.x,y=origin.y-center.y,z=origin.z-center.z,b=x*dir.x+y*dir.y+z*dir.z,c=x*x+y*y+z*z-radius*radius,h=b*b-c;
  if(h<0)return Infinity;const d=-b-Math.sqrt(h);return d>0?d:(-b+Math.sqrt(h)>0?0:Infinity);
}
function rayCapsule(origin,dir,a,b,radius) {
  // Analytic finite capsule, including the spherical end caps.
  const bax=b.x-a.x,bay=b.y-a.y,baz=b.z-a.z,oax=origin.x-a.x,oay=origin.y-a.y,oaz=origin.z-a.z;
  const baba=bax*bax+bay*bay+baz*baz,bard=bax*dir.x+bay*dir.y+baz*dir.z,baoa=bax*oax+bay*oay+baz*oaz,rdoa=dir.x*oax+dir.y*oay+dir.z*oaz,oaoa=oax*oax+oay*oay+oaz*oaz;
  const aa=baba-bard*bard,bb=baba*rdoa-baoa*bard,cc=baba*oaoa-baoa*baoa-radius*radius*baba,hh=bb*bb-aa*cc;
  if(hh>=0&&Math.abs(aa)>1e-8){const t=(-bb-Math.sqrt(hh))/aa,y=baoa+t*bard;if(t>0&&y>0&&y<baba)return t;}
  return Math.min(raySphere(origin,dir,a,radius),raySphere(origin,dir,b,radius));
}
function wrapAngle(a){while(a>Math.PI)a-=Math.PI*2;while(a< -Math.PI)a+=Math.PI*2;return a;}

export class BotSystem {
  constructor(scene, world, options={}) {
    this.scene=scene;this.world=world;this.options={count:7,difficulty:'regular',mode:'tdm',team:0,training:false,...options};
    this.tune=TUNING[this.options.difficulty]||TUNING.regular;this.bots=[];this.corpses=[];this.time=0;this.player=null;this.lastContext=null;
    this.tmpOrigin=new THREE.Vector3();this.tmpTarget=new THREE.Vector3();this.tmpDir=new THREE.Vector3();this.tmpA=new THREE.Vector3();this.tmpB=new THREE.Vector3();this.tmpC=new THREE.Vector3();this.tmpMove=new THREE.Vector3();
    for(let i=0;i<Math.min(16,Math.max(0,this.options.count));i++){
      const solo=['ffa','gungame','gun-game'].includes(this.options.mode);
      const team=this.options.training?1:solo?i+1:(i%2===0?1-this.options.team:this.options.team);
      const bot={id:'bot-'+i,index:i,name:NAMES[i],team,pos:new THREE.Vector3(),vel:new THREE.Vector3(),yaw:0,pitch:0,health:100,alive:true,kills:0,deaths:0,assists:0,score:0,streak:0,weaponId:IDS[i%IDS.length],ammo:30,height:1.78,radius:.34,
        aimError:this.tune.spread,accuracy:1-this.tune.spread*5,model:null,target:null,lastKnown:new THREE.Vector3(),destination:new THREE.Vector3(),path:[],pathIndex:0,nextPath:0,nextThink:i*.035,nextFire:0,reactUntil:0,strafeSign:i%2?1:-1,strafeUntil:0,decision:'patrol',reloading:0,reloadDuration:0,flashTimer:0,slideTimer:0,crouchTimer:0,slideCooldown:0,jumpCooldown:0,grounded:true,deathTimer:0,protectionUntil:.8,lastHealth:100,lastDamage:-10,lastShot:-10,stuckTime:0,lastPos:new THREE.Vector3(),weaponInitialized:false,lastWeaponId:'',burst:0,heardAt:-100,flankBias:i%3-1,spawnOrigin:new THREE.Vector3(),stationary:this.options.training&&i%2===0,training:this.options.training,primaryId:IDS[i%IDS.length]};
      this.bots.push(bot);this.respawn(bot);
    }
  }
  respawn(bot) {
    const spawns=this.world.spawns||[];let candidates=spawns.filter(p=>p.team===(bot.team>1?bot.index%2:bot.team));if(!candidates.length)candidates=spawns;
    let best=candidates[bot.index%Math.max(1,candidates.length)]||{x:0,y:0,z:0,yaw:0},bestScore=-Infinity;
    for(const p of candidates){let closest=100;for(const other of this.bots){if(other!==bot&&other.alive&&other.team!==bot.team){const d=Math.hypot(other.pos.x-p.x,other.pos.z-p.z);closest=Math.min(closest,d);}}
      if(this.player?.alive&&this.player.team!==bot.team)closest=Math.min(closest,Math.hypot(this.player.pos.x-p.x,this.player.pos.z-p.z));
      const score=closest+Math.random()*4;if(score>bestScore){best=p;bestScore=score;}}
    bot.pos.set(best.x,best.y||0,best.z);bot.yaw=best.yaw||0;
    for(let attempt=0;attempt<9;attempt++){const angle=(attempt+bot.index)*2.399,dist=attempt===0?0:.45+attempt*.28,x=best.x+Math.sin(angle)*dist,z=best.z+Math.cos(angle)*dist,y=this.world.groundHeight(x,z,best.y||0,.4);
      const occupied=this.bots.some(o=>o!==bot&&o.alive&&o.pos.distanceToSquared(this.tmpA.set(x,y,z))<.8*.8);
      if(!occupied&&this.world.isFree(x,y+.025,z,.34,1.78)){bot.pos.set(x,y+.01,z);break;}}
    bot.vel.set(0,0,0);bot.health=100;bot.lastHealth=100;bot.alive=true;bot.height=1.78;bot.deathTimer=0;bot.target=null;bot.path.length=0;bot.pathIndex=0;bot.reloading=0;bot.slideTimer=0;bot.crouchTimer=0;bot.grounded=true;bot.lastDamage=this.time;bot.protectionUntil=this.time+.8;bot.lastKnown.copy(bot.pos);bot.destination.copy(bot.pos);bot.spawnOrigin.copy(bot.pos);bot.lastPos.copy(bot.pos);bot.nextThink=this.time+.1+Math.random()*.3;bot.nextPath=this.time;bot.reactUntil=this.time+this.tune.reaction;
    if(!bot.model){bot.model=createSoldier(bot.team===this.options.team?0:1);this.scene.add(bot.model.group);}
    bot.model.group.visible=true;bot.ammo=this.lastContext?.weapons?.[bot.weaponId]?.mag||30;animateSoldier(bot,0,this.time);
  }
  update(dt,ctx) {
    if(ctx.paused)return;this.time=ctx.time;this.player=ctx.player;this.lastContext=ctx;
    this.updateCorpses(Math.min(dt,.04));
    for(const bot of this.bots){
      if(!bot.alive){bot.deathTimer-=dt;if(bot.deathTimer<=0){this.respawn(bot);ctx.onRespawn?.(bot);}continue;}
      const weapon=ctx.weapons?.[bot.weaponId]||ctx.weapons?.vx4||{mag:30,reload:2.1,rpm:600,range:32,mode:'auto',move:1};
      if(bot.lastWeaponId!==bot.weaponId){bot.ammo=weapon.mag;bot.lastWeaponId=bot.weaponId;bot.weaponInitialized=true;bot.reloading=0;}
      if(bot.health<bot.lastHealth){bot.lastDamage=this.time;bot.nextThink=Math.min(bot.nextThink,this.time+.025);bot.strafeSign*=-1;bot.strafeUntil=this.time+.6;}
      bot.lastHealth=bot.health;
      if(this.time-bot.lastDamage>5&&bot.health<100)bot.health=Math.min(100,bot.health+17*dt);
      bot.flashTimer=Math.max(0,bot.flashTimer-dt);bot.slideTimer=Math.max(0,bot.slideTimer-dt);bot.crouchTimer=Math.max(0,bot.crouchTimer-dt);
      if(bot.reloading>0){bot.reloading-=dt;if(bot.reloading<=0){bot.ammo=weapon.mag;bot.reloading=0;bot.nextFire=this.time+.08;}}
      if(this.time>=bot.nextThink){bot.nextThink=this.time+this.tune.think*(.8+Math.random()*.4);this.think(bot,ctx,weapon);}
      this.move(bot,dt,ctx,weapon);
      if(!bot.training&&bot.target?.alive&&bot.reloading<=0&&this.time>=bot.nextFire&&this.time>=bot.reactUntil){
        const target=bot.target,dist=bot.pos.distanceTo(target.pos);
        const desiredYaw=Math.atan2(-(target.pos.x-bot.pos.x),-(target.pos.z-bot.pos.z));
        const combatRange=weapon.mode==='melee'?(weapon.range||2.3):Math.max(20,Math.min(95,weapon.range*1.8));
        if(Math.abs(wrapAngle(desiredYaw-bot.yaw))<.22&&dist<combatRange&&this.visible(bot,target)){
          if(bot.ammo>0||weapon.mode==='melee'){bot.aimError=this.tune.spread*(bot.grounded?1:1.45)*(bot.slideTimer>0?1.18:1);if(weapon.mode!=='melee')bot.ammo--;bot.flashTimer=weapon.mode==='melee'?0:.052;bot.lastShot=this.time;
            let interval=60/Math.max(50,weapon.rpm||600);if(weapon.mode==='semi')interval=Math.max(interval,.20+this.tune.reaction*.35);if(weapon.mode==='bolt')interval=Math.max(interval,1.0);
            if(weapon.mode==='burst'){bot.burst=(bot.burst+1)%3;if(bot.burst===0)interval+=.18;}
            bot.nextFire=this.time+interval;ctx.shoot(bot,target);
          }else this.reload(bot,weapon);
        }
      }
      if(weapon.mode!=='melee'&&bot.ammo<=0&&bot.reloading<=0)this.reload(bot,weapon);
      animateSoldier(bot,dt,this.time);
    }
  }
  reload(bot,weapon) {
    if(weapon.mode==='melee'){bot.ammo=1;return;}
    // Sidearm draw at knife-fighting range is real weapon switching, not a cosmetic pose.
    if(!['gungame','gun-game'].includes(this.options.mode)&&bot.weaponId!=='viper'&&bot.target?.alive&&bot.pos.distanceToSquared(bot.target.pos)<7*7&&this.lastContext?.weapons?.viper&&this.time-bot.lastDamage<2){
      bot.primaryId=bot.weaponId;bot.weaponId='viper';bot.lastWeaponId='viper';bot.ammo=this.lastContext.weapons.viper.mag;bot.nextFire=this.time+.22;bot.decision='pressure';return;
    }
    bot.reloadDuration=weapon.reload||2.0;bot.reloading=bot.reloadDuration;bot.decision='reload';this.seekCover(bot,bot.target);
    this.lastContext?.onReload?.(bot);
  }
  visible(bot,target) {
    this.tmpOrigin.copy(bot.pos);this.tmpOrigin.y+=bot.slideTimer>0?.94:bot.crouchTimer>0?1.2:1.49;
    this.tmpTarget.copy(target.pos);this.tmpTarget.y+=(target.height||1.78)*.72;
    this.tmpDir.subVectors(this.tmpTarget,this.tmpOrigin);const dist=this.tmpDir.length();if(dist>this.tune.vision)return false;
    this.tmpDir.multiplyScalar(1/Math.max(dist,.001));const hit=this.world.raycast(this.tmpOrigin,this.tmpDir,dist);return !hit||hit.distance>dist-.03;
  }
  think(bot,ctx,weapon) {
    if(bot.training){
      if(bot.stationary){bot.destination.copy(bot.spawnOrigin);bot.path.length=0;return;}
      if(bot.pos.distanceToSquared(bot.destination)<1||this.time>=bot.nextPath){const a=this.time*.3+bot.index;this.tmpTarget.set(bot.spawnOrigin.x+Math.sin(a)*4,bot.spawnOrigin.y,bot.spawnOrigin.z+Math.cos(a)*4);this.setDestination(bot,this.tmpTarget,true);bot.nextPath=this.time+2.0;}
      return;
    }
    const captureGoal=ctx.mode==='domination'?this.captureObjective(bot,ctx):null;
    let target=null,best=Infinity;
    const inspect=(candidate)=>{if(!candidate?.alive||candidate===bot||candidate.team===bot.team)return;const d=bot.pos.distanceToSquared(candidate.pos);if(d>this.tune.vision*this.tune.vision)return;
      const score=d*(candidate===bot.target ? .88 : 1)+(candidate===ctx.player?0:5);
      if(score<best&&this.visible(bot,candidate)){target=candidate;best=score;}};
    inspect(ctx.player);for(const other of this.bots)inspect(other);
    if(target){
      if(bot.target!==target){bot.target=target;bot.reactUntil=this.time+this.tune.reaction*(.8+Math.random()*.4);bot.nextFire=Math.max(bot.nextFire,bot.reactUntil);}
      bot.lastSeen=this.time;bot.lastKnown.copy(target.pos);
      const distance=Math.sqrt(best);
      if((bot.health<40||bot.reloading>0)&&this.time-bot.lastDamage<4){bot.decision='cover';if(bot.pos.distanceToSquared(bot.destination)<2.25)bot.crouchTimer=.85;if(this.time>=bot.nextPath)this.seekCover(bot,target);}
      else if(distance<5&&weapon.category?.toLowerCase().includes('snip')){bot.decision='retreat';this.tmpTarget.copy(bot.pos).sub(target.pos).normalize().multiplyScalar(6).add(bot.pos);this.setDestination(bot,this.tmpTarget);}
      else if(distance<(weapon.mode==='melee'?6:Math.min(26,(weapon.range||30)*.8))&&this.visible(bot,target)){
        bot.decision='engage';if(this.time>bot.strafeUntil){bot.strafeSign=Math.random()<.5?-1:1;bot.strafeUntil=this.time+.65+Math.random()*.9;}
        if(this.tune.dodge>.4&&this.time>bot.slideCooldown&&Math.random()<.14&&bot.grounded&&Math.hypot(bot.vel.x,bot.vel.z)>4){bot.slideTimer=.6;bot.slideCooldown=this.time+3.5;}
        if(this.tune.dodge>.5&&this.time>bot.jumpCooldown&&Math.random()<.09&&bot.grounded){bot.vel.y=6.0;bot.grounded=false;bot.jumpCooldown=this.time+4.5;}
      } else {
        bot.decision=weapon.mode!=='melee'&&bot.flankBias!==0?'flank':'pursue';
        if(this.time>=bot.nextPath){this.tmpTarget.copy(target.pos);if(weapon.mode!=='melee'&&bot.flankBias!==0){const d=this.tmpTarget.clone().sub(bot.pos).normalize();this.tmpTarget.x+=d.z*bot.flankBias*6;this.tmpTarget.z-=d.x*bot.flankBias*6;}
          if(!this.world.isFree(this.tmpTarget.x,this.tmpTarget.y+.03,this.tmpTarget.z,.35,1.78))this.tmpTarget.copy(target.pos);this.setDestination(bot,this.tmpTarget,true);}
      }
    } else {
      if(bot.target&&this.time-(bot.lastSeen||0)<3.2){bot.decision='investigate';if(this.time>=bot.nextPath)this.setDestination(bot,bot.lastKnown,true);}
      else {bot.target=null;
        if(bot.ammo<(weapon.mag||30)*.6&&bot.reloading<=0)this.reload(bot,weapon);
        if(!['gungame','gun-game'].includes(this.options.mode)&&bot.weaponId==='viper'&&bot.primaryId!=='viper'&&this.time-bot.lastDamage>3.5){bot.weaponId=bot.primaryId;bot.ammo=ctx.weapons?.[bot.primaryId]?.mag||30;}
        let heard=null;for(const sound of ctx.heardShots||[]){if(sound.team===bot.team||sound.time<=bot.heardAt||this.time-sound.time>1.3)continue;if(bot.pos.distanceToSquared(sound.pos)<29*29){heard=sound;bot.heardAt=sound.time;}}
        if(heard){bot.decision='investigate';this.setDestination(bot,heard.pos,true);bot.nextPath=this.time+1.2;}
        else if(this.time>=bot.nextPath||bot.pos.distanceToSquared(bot.destination)<2){this.choosePatrol(bot,ctx);}
      }
    }
    // Capture duties survive target acquisition: a distant visible opponent must
    // not turn every objective runner into a permanent deathmatch strafer.
    if(captureGoal&&(bot.health>24||this.time-bot.lastDamage>1.5)){
      this.tmpTarget.copy(captureGoal.pos||captureGoal.position);const angle=bot.index*2.4;
      this.tmpTarget.x+=Math.sin(angle)*1.15;this.tmpTarget.z+=Math.cos(angle)*1.15;
      bot.decision='objective';
      if(bot.destination.distanceToSquared(this.tmpTarget)>1||this.time>=bot.nextPath)this.setDestination(bot,this.tmpTarget,true);
    }
  }
  captureObjective(bot,ctx) {
    const points=ctx.objectives;if(!points?.length)return null;
    const home=bot.team===0?0:points.length-1,role=Math.floor(bot.index/2)%3;
    const preferred=role===0?home:role===1?Math.floor(points.length/2):points.length-1-home;
    const assigned=points[Math.min(points.length-1,preferred)];
    if(assigned.owner!==bot.team)return assigned;
    const remaining=points.filter(o=>o.owner!==bot.team);
    return remaining.length?remaining[(Math.floor(bot.index/2))%remaining.length]:null;
  }
  choosePatrol(bot,ctx) {
    const objectives=ctx.objectives?.length?ctx.objectives:this.world.objectives;
    if(objectives?.length){let idx=(bot.index+Math.floor(this.time/14))%objectives.length;
      if(ctx.mode==='domination'){const available=objectives.filter(o=>o.owner!==bot.team);if(available.length){const o=available[bot.index%available.length];idx=objectives.indexOf(o);}}
      const objective=objectives[idx];this.tmpTarget.copy(objective.pos||objective.position);const spread=(ctx.mode==='domination'?1.6:4);this.tmpTarget.x+=Math.sin(bot.index*2.4+this.time*.08)*spread;this.tmpTarget.z+=Math.cos(bot.index*2.4+this.time*.08)*spread;
      if(!this.world.isFree(this.tmpTarget.x,this.tmpTarget.y+.03,this.tmpTarget.z,.35,1.78))this.tmpTarget.copy(objective.pos||objective.position);
      this.setDestination(bot,this.tmpTarget,true);bot.decision=ctx.mode==='domination'?'objective':'patrol';bot.nextPath=this.time+1.3+Math.random()*.5;
    } else {const spawns=this.world.spawns||[];const p=spawns[(bot.index+Math.floor(this.time/5)+2)%Math.max(1,spawns.length)];if(p){this.tmpTarget.set(p.x,p.y||0,p.z);this.setDestination(bot,this.tmpTarget,true);}}
  }
  setDestination(bot,point,force=false) {
    if(!force&&bot.destination.distanceToSquared(point)<1.5&&this.time<bot.nextPath)return;
    bot.destination.copy(point);bot.path=this.world.findPath(bot.pos,bot.destination)||[];bot.pathIndex=0;bot.nextPath=this.time+.9+Math.random()*.5;
    while(bot.pathIndex<bot.path.length&&bot.pos.distanceToSquared(bot.path[bot.pathIndex])<.75*.75)bot.pathIndex++;
  }
  seekCover(bot,target) {
    if(!target){bot.nextPath=this.time+.5;return;}
    let best=Infinity,bestX=bot.pos.x,bestY=bot.pos.y,bestZ=bot.pos.z;
    const cols=this.world.colliders||[];this.tmpOrigin.copy(target.pos);this.tmpOrigin.y+=1.4;
    for(const c of cols){if(c.disabled)continue;const width=c.max.x-c.min.x,depth=c.max.z-c.min.z,height=c.max.y-c.min.y;if(height<.8||width>14||depth>14||c.max.y<bot.pos.y+.8)continue;
      const x=(c.min.x+c.max.x)*.5,z=(c.min.z+c.max.z)*.5;if(Math.abs(x-bot.pos.x)>12||Math.abs(z-bot.pos.z)>12)continue;
      const dx=x-target.pos.x,dz=z-target.pos.z,len=Math.hypot(dx,dz)||1,cx=x+dx/len*(width*.5+.85),cz=z+dz/len*(depth*.5+.85),cy=this.world.groundHeight(cx,cz,bot.pos.y,.4);
      if(!this.world.isFree(cx,cy+.03,cz,.36,1.78))continue;this.tmpTarget.set(cx,cy+1.3,cz);this.tmpDir.subVectors(this.tmpTarget,this.tmpOrigin);const d=this.tmpDir.length();this.tmpDir.multiplyScalar(1/Math.max(.01,d));const hit=this.world.raycast(this.tmpOrigin,this.tmpDir,d);
      if(!hit||hit.distance>d-.5)continue;const score=Math.hypot(cx-bot.pos.x,cz-bot.pos.z)+d*.07;if(score<best){best=score;bestX=cx;bestY=cy;bestZ=cz;}}
    if(best<Infinity){this.tmpTarget.set(bestX,bestY,bestZ);this.setDestination(bot,this.tmpTarget,true);}
    else {this.tmpTarget.copy(bot.pos).sub(target.pos).normalize().multiplyScalar(5).add(bot.pos);if(this.world.isFree(this.tmpTarget.x,bot.pos.y+.03,this.tmpTarget.z,.35,1.78)){this.tmpTarget.y=bot.pos.y;this.setDestination(bot,this.tmpTarget,true);}}
    bot.nextPath=this.time+1.1;
  }
  supportHeight(x,z,feetY,step,radius=.34) {
    let ground=this.world.groundHeight(x,z,feetY,step),limit=feetY+step+.008;
    for(const c of this.world.colliders||[]){if(c.disabled||c.walkable===false||c.max.y<=ground||c.max.y>limit)continue;const dx=x-clamp(x,c.min.x,c.max.x),dz=z-clamp(z,c.min.z,c.max.z);if(dx*dx+dz*dz<radius*radius-.000001)ground=c.max.y;}
    return ground;
  }
  move(bot,dt,ctx,weapon) {
    let dx=0,dz=0;const target=bot.target;
    if(!bot.stationary){
      if(bot.decision==='engage'&&target?.alive&&bot.reloading<=0){
        const tx=target.pos.x-bot.pos.x,tz=target.pos.z-bot.pos.z,d=Math.hypot(tx,tz)||1;
        const desired=weapon.mode==='melee'?1.2:weapon.category?.toLowerCase().includes('shot')?5:weapon.category?.toLowerCase().includes('snip')?23:12;
        const approach=clamp((d-desired)/(weapon.mode==='melee'?1.5:9),-.6,weapon.mode==='melee'?1:.7),strafe=weapon.mode==='melee'?.1:.68;dx=tx/d*approach+tz/d*bot.strafeSign*strafe;dz=tz/d*approach-tx/d*bot.strafeSign*strafe;
      }else{
        while(bot.pathIndex<bot.path.length){const p=bot.path[bot.pathIndex];if(Math.hypot(p.x-bot.pos.x,p.z-bot.pos.z)<.48){bot.pathIndex++;continue;}dx=p.x-bot.pos.x;dz=p.z-bot.pos.z;break;}
        if(bot.pathIndex>=bot.path.length&&bot.destination.distanceToSquared(bot.pos)>1){dx=bot.destination.x-bot.pos.x;dz=bot.destination.z-bot.pos.z;}
      }
    }
    const length=Math.hypot(dx,dz);if(length>.01){dx/=length;dz/=length;}
    // Local separation avoids friendly clumps without pathfinding an agent as a wall.
    for(const other of this.bots){if(other===bot||!other.alive)continue;const ox=bot.pos.x-other.pos.x,oz=bot.pos.z-other.pos.z,d2=ox*ox+oz*oz;if(d2>0&&d2<1.1){const f=(1.1-d2)*.65/Math.sqrt(d2);dx+=ox*f;dz+=oz*f;}}
    if(ctx.player?.alive){const ox=bot.pos.x-ctx.player.pos.x,oz=bot.pos.z-ctx.player.pos.z,d2=ox*ox+oz*oz;if(d2>0&&d2<.7){dx+=ox/d2*.2;dz+=oz/d2*.2;}}
    if(bot.stationary){dx=0;dz=0;}
    const finalLength=Math.hypot(dx,dz);if(finalLength>1){dx/=finalLength;dz/=finalLength;}
    let speed=this.tune.speed*(weapon.move||1);if(!target&&bot.decision!=='cover')speed*=1.35;if(bot.decision==='engage')speed*=.72;if(bot.reloading>0)speed*=.7;if(bot.training)speed=2.0;
    if(bot.slideTimer>0)speed*=1.45;if(bot.crouchTimer>0)speed*=.5;
    const ease=1-Math.exp(-dt*(bot.grounded?18:6));bot.vel.x=lerp(bot.vel.x,dx*speed,ease);bot.vel.z=lerp(bot.vel.z,dz*speed,ease);
    let yaw=bot.yaw;if(target?.alive){const tx=target.pos.x-bot.pos.x,tz=target.pos.z-bot.pos.z;yaw=Math.atan2(-tx,-tz);bot.pitch=clamp(-Math.atan2(target.pos.y+1.3-(bot.pos.y+1.45),Math.hypot(tx,tz)),-.8,.8);}else if(length>.1){yaw=Math.atan2(-dx,-dz);bot.pitch=lerp(bot.pitch,0,ease);}
    bot.yaw+=wrapAngle(yaw-bot.yaw)*Math.min(1,dt*13);
    const bodyH=bot.slideTimer>0?1.0:bot.crouchTimer>0?1.4:1.78;bot.height=bodyH;
    const prevY=bot.pos.y;let moved=false;
    for(const axis of ['x','z']){const amount=bot.vel[axis]*dt;if(Math.abs(amount)<1e-6)continue;let x=bot.pos.x,z=bot.pos.z;if(axis==='x')x+=amount;else z+=amount;
      const ground=this.supportHeight(x,z,bot.pos.y,.38,bot.radius),step=ground-bot.pos.y;
      const y=bot.grounded&&step>=-.2&&step<=.38?ground:bot.pos.y;
      if(this.world.isFree(x,y+.025,z,bot.radius,bodyH)){bot.pos.x=x;bot.pos.z=z;if(bot.grounded&&Math.abs(step)<.38)bot.pos.y=y;moved=true;}
      else{
        const probeX=x+(axis==='x'?Math.sign(amount)*bot.radius:0),probeZ=z+(axis==='z'?Math.sign(amount)*bot.radius:0),stepY=this.world.groundHeight(probeX,probeZ,bot.pos.y,.38);
        if(bot.grounded&&stepY>bot.pos.y+.015&&stepY-bot.pos.y<=.38&&this.world.isFree(x,stepY+.025,z,bot.radius,bodyH)){bot.pos.set(x,stepY+.01,z);moved=true;continue;}
        bot.vel[axis]*=.2;if(this.tune.dodge>.4&&bot.grounded&&this.time>bot.jumpCooldown){const upper=this.world.isFree(x,bot.pos.y+.9,z,bot.radius,bodyH);if(upper){bot.vel.y=7.1;bot.grounded=false;bot.jumpCooldown=this.time+1.5;}}}
    }
    bot.vel.y-=23*dt;let y=bot.pos.y+bot.vel.y*dt;
    const supportY=Math.max(prevY,bot.pos.y);
    const ground=this.supportHeight(bot.pos.x,bot.pos.z,supportY,.035,bot.radius);
    if(y<=ground+.012&&bot.vel.y<=0){y=ground+.01;bot.vel.y=0;bot.grounded=true;}else bot.grounded=false;
    if(bot.vel.y>0&&!this.world.isFree(bot.pos.x,y+.015,bot.pos.z,bot.radius,bodyH)){bot.vel.y=0;y=bot.pos.y;}
    bot.pos.y=y;
    if(bot.pos.y< -6){this.respawn(bot);ctx.onRespawn?.(bot);return;}
    const moving=Math.hypot(bot.vel.x,bot.vel.z);bot.movement=bot.slideTimer>0?'slide':!bot.grounded?'air':bot.crouchTimer>0?'crouch':moving>7?'sprint':moving>.4?'walk':'idle';
    if(length>.1&&bot.pos.distanceToSquared(bot.lastPos)<Math.max(.002,speed*dt*.15)**2)bot.stuckTime+=dt;else bot.stuckTime=Math.max(0,bot.stuckTime-dt*2);bot.lastPos.copy(bot.pos);
    if(bot.stuckTime>1.0){bot.stuckTime=0;bot.nextPath=0;bot.path.length=0;bot.strafeSign*=-1;this.tmpTarget.copy(bot.pos);this.tmpTarget.x+=Math.cos(bot.yaw)*bot.strafeSign*2;this.tmpTarget.z-=Math.sin(bot.yaw)*bot.strafeSign*2;
      if(this.world.isFree(this.tmpTarget.x,this.tmpTarget.y+.025,this.tmpTarget.z,.35,bodyH))this.setDestination(bot,this.tmpTarget,true);else this.choosePatrol(bot,ctx);}
  }
  hitTest(origin,dir,maxDistance=200,ignoreTeam=null) {
    let closest=maxDistance,result=null;
    for(const bot of this.bots){if(!bot.alive||bot.team===ignoreTeam||!bot.model)continue;
      // Broad phase: tiny cheap sphere before all articulated body regions.
      this.tmpA.copy(bot.pos);this.tmpA.y+=.9;if(raySphere(origin,dir,this.tmpA,1.3)>closest)continue;
      const co=Math.cos(bot.yaw),si=Math.sin(bot.yaw),j=bot.model.joints;
      const transform=(index,out)=>{const p=j[index];return out.set(bot.pos.x+p.x*co+p.z*si,bot.pos.y+p.y,bot.pos.z-p.x*si+p.z*co);};
      transform(3,this.tmpA);let d=raySphere(origin,dir,this.tmpA,.152),zone='head';
      transform(0,this.tmpA);transform(2,this.tmpB);const body=rayCapsule(origin,dir,this.tmpA,this.tmpB,.225);if(body<d){d=body;zone='body';}
      for(let i=0;i<limbPairs.length;i++){const [a,b]=limbPairs[i];transform(a,this.tmpA);transform(b,this.tmpB);const limb=rayCapsule(origin,dir,this.tmpA,this.tmpB,i<4?.083:.11);if(limb<d){d=limb;zone='limb';}}
      if(d<closest){closest=d;result={entity:bot,distance:d,point:new THREE.Vector3().copy(dir).multiplyScalar(d).add(origin),zone};}
    }
    return result;
  }
  kill(bot,direction=new THREE.Vector3(0,0,-1)) {
    if(!bot.model)return;bot.alive=false;bot.health=0;bot.deathTimer=bot.training?1.65:2.4;bot.target=null;bot.reloading=0;bot.vel.y=0;
    const model=bot.model;bot.model=null;
    const co=Math.cos(bot.yaw),si=Math.sin(bot.yaw),nodes=model.joints.map((p,i)=>{const pos=new THREE.Vector3(bot.pos.x+p.x*co+p.z*si,bot.pos.y+p.y,bot.pos.z-p.x*si+p.z*co);const velocity=new THREE.Vector3(bot.vel.x*.75+direction.x*(i<4?3.3:2.1),Math.max(0,direction.y)*1.5+.6,bot.vel.z*.75+direction.z*(i<4?3.3:2.1));return{pos,prev:pos.clone().addScaledVector(velocity,-1/120),radius:jointRadius[i]};});
    model.group.position.set(0,0,0);model.group.rotation.set(0,0,0);model.flash.visible=false;
    const gunPosition=model.gun.position.clone();gunPosition.set(bot.pos.x+gunPosition.x*co+gunPosition.z*si,bot.pos.y+gunPosition.y,bot.pos.z-gunPosition.x*si+gunPosition.z*co);model.gun.position.copy(gunPosition);model.gun.rotation.set(0,bot.yaw,0);
    const corpse={model,nodes,links:constraints.map(([a,b])=>({a,b,length:nodes[a].pos.distanceTo(nodes[b].pos)})),age:0,settled:false,gunPos:gunPosition,gunVel:new THREE.Vector3(direction.x*2+bot.vel.x*.4,2.5,direction.z*2+bot.vel.z*.4),gunSpin:new THREE.Vector3(2.5,1.7,-3.6),accum:0,nearby:[],nextBroadphase:0};
    this.corpses.push(corpse);while(this.corpses.length>8)this.removeCorpse(this.corpses.shift());
    this.poseCorpse(corpse);
  }
  updateCorpses(dt) {
    for(let c=this.corpses.length-1;c>=0;c--){const corpse=this.corpses[c];corpse.age+=dt;if(corpse.age>14){this.removeCorpse(corpse);this.corpses.splice(c,1);continue;}
      if(corpse.age<7){corpse.accum+=dt;while(corpse.accum>=1/120){this.stepRagdoll(corpse,1/120);corpse.accum-=1/120;}this.poseCorpse(corpse);}
      if(corpse.age>12){if(!corpse.model.fadeMaterial){corpse.model.fadeMaterial=makeResources().material.clone();corpse.model.fadeMaterial.transparent=true;corpse.model.fadeMaterial.depthWrite=false;corpse.model.group.traverse(o=>{if(o.isMesh&&o!==corpse.model.flash)o.material=corpse.model.fadeMaterial;});}corpse.model.fadeMaterial.opacity=1-(corpse.age-12)/2;}
    }
  }
  stepRagdoll(c,dt) {
    if(c.age>=c.nextBroadphase){const p=c.nodes[0].pos;c.nearby=(this.world.colliders||[]).filter(b=>!b.disabled&&b.min.x<p.x+3&&b.max.x>p.x-3&&b.min.z<p.z+3&&b.max.z>p.z-3&&b.min.y<p.y+3&&b.max.y>p.y-3);c.nextBroadphase=c.age+.18;}
    for(const node of c.nodes){const x=node.pos.x,y=node.pos.y,z=node.pos.z;node.pos.x+=(x-node.prev.x)*.992;node.pos.y+=(y-node.prev.y)*.992-21*dt*dt;node.pos.z+=(z-node.prev.z)*.992;node.prev.set(x,y,z);}
    for(let iteration=0;iteration<5;iteration++){
      for(const link of c.links){const a=c.nodes[link.a].pos,b=c.nodes[link.b].pos;const dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z,len=Math.hypot(dx,dy,dz)||.0001,d=(len-link.length)/len*.5;a.x+=dx*d;a.y+=dy*d;a.z+=dz*d;b.x-=dx*d;b.y-=dy*d;b.z-=dz*d;}
      for(const node of c.nodes)this.collideNode(node,c.nearby);
    }
    c.gunVel.y-=18*dt;c.gunPos.addScaledVector(c.gunVel,dt);const floor=this.world.groundHeight(c.gunPos.x,c.gunPos.z,c.gunPos.y,.02)+.09;
    if(c.gunPos.y<floor){c.gunPos.y=floor;c.gunVel.y=Math.abs(c.gunVel.y)*.18;c.gunVel.x*=.88;c.gunVel.z*=.88;c.gunSpin.multiplyScalar(.93);}
    const gunNode={pos:c.gunPos,prev:c.gunPos,radius:.09};this.collideNode(gunNode,c.nearby);c.model.gun.position.copy(c.gunPos);c.model.gun.rotation.x+=c.gunSpin.x*dt;c.model.gun.rotation.y+=c.gunSpin.y*dt;c.model.gun.rotation.z+=c.gunSpin.z*dt;
  }
  collideNode(node,nearby=this.world.colliders||[]) {
    const p=node.pos,r=node.radius,ground=this.world.groundHeight(p.x,p.z,Math.max(p.y,node.prev.y),.01);
    if(p.y<ground+r){p.y=ground+r;node.prev.x=lerp(node.prev.x,p.x,.12);node.prev.z=lerp(node.prev.z,p.z,.12);}
    for(const b of nearby){if(b.disabled||p.x+r<b.min.x||p.x-r>b.max.x||p.y+r<b.min.y||p.y-r>b.max.y||p.z+r<b.min.z||p.z-r>b.max.z)continue;
      const x=clamp(p.x,b.min.x,b.max.x),y=clamp(p.y,b.min.y,b.max.y),z=clamp(p.z,b.min.z,b.max.z),dx=p.x-x,dy=p.y-y,dz=p.z-z,d2=dx*dx+dy*dy+dz*dz;
      if(d2>0&&d2<r*r){const d=Math.sqrt(d2),s=(r-d)/d;p.x+=dx*s;p.y+=dy*s;p.z+=dz*s;}
      else if(d2===0){const faces=[p.x-b.min.x,b.max.x-p.x,p.y-b.min.y,b.max.y-p.y,p.z-b.min.z,b.max.z-p.z];let nearest=0;for(let k=1;k<6;k++)if(faces[k]<faces[nearest])nearest=k;if(nearest===0)p.x=b.min.x-r;else if(nearest===1)p.x=b.max.x+r;else if(nearest===2)p.y=b.min.y-r;else if(nearest===3)p.y=b.max.y+r;else if(nearest===4)p.z=b.min.z-r;else p.z=b.max.z+r;}
    }
    const bounds=this.world.bounds;if(bounds){p.x=clamp(p.x,bounds.minX+r,bounds.maxX-r);p.z=clamp(p.z,bounds.minZ+r,bounds.maxZ-r);}
  }
  poseCorpse(c) {for(let i=0;i<c.nodes.length;i++)c.model.joints[i].copy(c.nodes[i].pos);poseModel(c.model,0,true);}
  removeCorpse(c) {this.scene.remove(c.model.group);c.model.fadeMaterial?.dispose();}
  dispose() {
    for(const bot of this.bots)if(bot.model)this.scene.remove(bot.model.group);for(const corpse of this.corpses)this.removeCorpse(corpse);this.bots.length=0;this.corpses.length=0;
    // Geometries are intentionally shared across map changes; one small immutable cache.
  }
}
