export const WEAPONS = [
  {name:'MK18',type:'ASSAULT RIFLE',mag:30,reserve:180,damage:26,rate:0.105,reload:1.85,spread:0.009,range:110},
  {name:'P320',type:'SIDEARM',mag:15,reserve:75,damage:34,rate:0.26,reload:1.35,spread:0.007,range:65},
];
export const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
export function direction(yaw,pitch=0){const c=Math.cos(pitch);return {x:-Math.sin(yaw)*c,y:Math.sin(pitch),z:-Math.cos(yaw)*c};}
export function rayBox(o,d,b,max=150){
  let near=0,far=max;
  for(const [a,mn,mx] of [['x','minX','maxX'],['y','minY','maxY'],['z','minZ','maxZ']]){
    const lo=b[mn]??0,hi=b[mx]??3;
    if(Math.abs(d[a])<1e-8){if(o[a]<lo||o[a]>hi)return Infinity;continue;}
    let t1=(lo-o[a])/d[a],t2=(hi-o[a])/d[a];if(t1>t2)[t1,t2]=[t2,t1];
    near=Math.max(near,t1);far=Math.min(far,t2);if(near>far)return Infinity;
  }return near<=max?near:Infinity;
}
export function obstruction(o,d,colliders,max=150){let hit=max;for(const b of colliders)hit=Math.min(hit,rayBox(o,d,b,hit));return hit;}
export function canStand(x,z,colliders,r=.46){return !colliders.some(b=>x>b.minX-r&&x<b.maxX+r&&z>b.minZ-r&&z<b.maxZ+r&&b.maxY>.4&&(b.minY||0)<1.8);}
function clearWalkSegment(x,z,tx,tz,colliders,r=.5){
  const distance=Math.hypot(tx-x,tz-z);if(distance<1e-6)return canStand(x,z,colliders,r);
  const origin={x,y:.9,z},dir={x:(tx-x)/distance,y:0,z:(tz-z)/distance};
  return !colliders.some(b=>b.maxY>.4&&(b.minY||0)<1.8&&rayBox(origin,dir,{minX:b.minX-r,maxX:b.maxX+r,minZ:b.minZ-r,maxZ:b.maxZ+r,minY:0,maxY:1.8},distance)<distance-1e-6);
}
export function moveActor(p,input,dt,colliders,bounds){
  p.crouch=!!input.crouch;
  let f=clamp(Number(input.forward)||0,-1,1),s=clamp(Number(input.strafe)||0,-1,1),l=Math.hypot(f,s);if(l>1){f/=l;s/=l;}
  const speed=p.crouch?2.1:input.sprint&&!input.aim&&f>0?7.5:input.aim?3.1:4.7;
  const vx=(-Math.sin(p.yaw)*f+Math.cos(p.yaw)*s)*speed,vz=(-Math.cos(p.yaw)*f-Math.sin(p.yaw)*s)*speed;
  const factor=1-Math.exp(-dt*16);p.vx=(p.vx||0)+(vx-(p.vx||0))*factor;p.vz=(p.vz||0)+(vz-(p.vz||0))*factor;
  if(input.jump&&(p.y||0)<=.001&&!p.jumpHeld){p.vy=5.5;p.jumpHeld=true;}if(!input.jump)p.jumpHeld=false;
  p.vy=(p.vy||0)-18*dt;p.y=Math.max(0,(p.y||0)+p.vy*dt);if(p.y===0)p.vy=0;
  const r=.38,steps=Math.max(1,Math.ceil(Math.hypot(p.vx,p.vz)*dt/.22));
  for(let i=0;i<steps;i++){
    p.x+=p.vx*dt/steps;p.z+=p.vz*dt/steps;
    for(const b of colliders){
      if((p.y||0)>=b.maxY||p.y+(p.crouch?1.25:1.8)<(b.minY||0))continue;
      const nx=clamp(p.x,b.minX,b.maxX),nz=clamp(p.z,b.minZ,b.maxZ);let dx=p.x-nx,dz=p.z-nz,ds=dx*dx+dz*dz;
      if(ds>=r*r)continue;
      if(ds>.000001){const k=(r-Math.sqrt(ds))/Math.sqrt(ds);p.x+=dx*k;p.z+=dz*k;}
      else {const options=[{n:Math.abs(p.x-b.minX),a:'x',v:b.minX-r},{n:Math.abs(p.x-b.maxX),a:'x',v:b.maxX+r},{n:Math.abs(p.z-b.minZ),a:'z',v:b.minZ-r},{n:Math.abs(p.z-b.maxZ),a:'z',v:b.maxZ+r}].sort((a,b)=>a.n-b.n);p[options[0].a]=options[0].v;}
    }
    p.x=clamp(p.x,bounds.minX+r,bounds.maxX-r);p.z=clamp(p.z,bounds.minZ+r,bounds.maxZ-r);
  }
  p.speed=Math.hypot(p.vx,p.vz);
}
const botNames=['RAVEN','GHOST','VIPER','ROOK','WOLF','ASH','CIPHER'];
export class Simulation {
  constructor(arena,{difficulty='easy',botCount=5,limit=20,duration=300}={}){
    this.arena=arena;this.difficulty=difficulty;this.botCount=botCount;this.limit=limit;this.duration=duration;
    this.players=new Map();this.time=0;this.ended=false;this.events=[];this.botSerial=0;this.nav=this.buildNav();
  }
  buildNav(){
    const b=this.arena.bounds,cell=2,nx=Math.ceil((b.maxX-b.minX)/cell),nz=Math.ceil((b.maxZ-b.minZ)/cell),open=new Uint8Array(nx*nz);
    for(let z=0;z<nz;z++)for(let x=0;x<nx;x++)open[z*nx+x]=canStand(b.minX+(x+.5)*cell,b.minZ+(z+.5)*cell,this.arena.colliders,.55)?1:0;
    // A wall may lie between two free grid centers. Test the full swept path,
    // including the actor's radius, once instead of steering bots into that wall.
    const links=new Uint8Array(open.length),dirs=[[1,0],[-1,0],[0,1],[0,-1]];
    for(let z=0;z<nz;z++)for(let x=0;x<nx;x++){
      const k=z*nx+x;if(!open[k])continue;
      for(let d=0;d<4;d++){
        const a=x+dirs[d][0],c=z+dirs[d][1];if(a<0||a>=nx||c<0||c>=nz||!open[c*nx+a])continue;
        if(clearWalkSegment(b.minX+(x+.5)*cell,b.minZ+(z+.5)*cell,b.minX+(a+.5)*cell,b.minZ+(c+.5)*cell,this.arena.colliders))links[k]|=1<<d;
      }
    }
    return {cell,nx,nz,open,links,b};
  }
  route(x,z,tx,tz){
    const n=this.nav,point=k=>({x:n.b.minX+(k%n.nx+.5)*n.cell,z:n.b.minZ+(Math.floor(k/n.nx)+.5)*n.cell});
    const nearest=(x,z)=>{
      const candidates=[];for(let k=0;k<n.open.length;k++)if(n.open[k]){const p=point(k);candidates.push({k,p,d:(p.x-x)**2+(p.z-z)**2});}
      candidates.sort((a,b)=>a.d-b.d);
      return candidates.find(c=>clearWalkSegment(x,z,c.p.x,c.p.z,this.arena.colliders,.4))?.k??-1;
    };
    const start=nearest(x,z),end=nearest(tx,tz);if(start<0||end<0)return [];
    const queue=[start],prev=new Int32Array(n.open.length).fill(-1);prev[start]=start;let h=0;
    while(h<queue.length&&prev[end]===-1){const k=queue[h++];for(const [d,offset] of [[0,1],[1,-1],[2,n.nx],[3,-n.nx]]){const v=k+offset;if(n.links[k]&(1<<d)&&prev[v]===-1){prev[v]=k;queue.push(v);}}}
    if(prev[end]===-1)return [];let k=end,path=[];while(k!==start&&path.length<200){path.push(point(k));k=prev[k];}path.push(point(start));path.reverse();
    const last=path[path.length-1];if(clearWalkSegment(last.x,last.z,tx,tz,this.arena.colliders,.4))path.push({x:tx,z:tz});return path;
  }
  addPlayer(id,name,bot=false){
    if(this.players.has(id))return this.players.get(id);
    const p={id,name:String(name||'OPERATOR').replace(/[<>]/g,'').slice(0,16),bot,x:0,y:0,z:0,yaw:0,pitch:0,hp:100,kills:0,deaths:0,weapon:0,ammo:[30,15],reserve:[180,75],reloadLeft:0,reloadTotal:0,deadLeft:0,fireAt:-1,damageAt:-10,invuln:0,speed:0,vx:0,vz:0,input:{},path:[],thinkAt:0,reaction:0,target:null,botAim:0};
    this.players.set(id,p);this.spawn(p);return p;
  }
  removePlayer(id){this.players.delete(id);}
  fillBots(){while([...this.players.values()].filter(p=>p.bot).length<this.botCount){const k=this.botSerial++;this.addPlayer('bot-'+k,botNames[k%botNames.length],true);}}
  spawn(p){
    const opponents=[...this.players.values()].filter(a=>a.id!==p.id&&a.hp>0),spawns=this.arena.spawns;
    const options=spawns.map(s=>({s,score:opponents.length?Math.min(...opponents.map(o=>Math.hypot(o.x-s.x,o.z-s.z))):Math.random()*15})).sort((a,b)=>b.score-a.score);
    const s=options[Math.floor(Math.random()*Math.min(3,options.length))]?.s||{x:0,z:0,yaw:0};
    Object.assign(p,{x:s.x,z:s.z,y:0,yaw:s.yaw||0,pitch:0,hp:100,ammo:[30,15],reserve:[180,75],reloadLeft:0,deadLeft:0,invuln:1.6,vx:0,vz:0,vy:0,damageAt:this.time,path:[],target:null,reaction:0,input:{},crouch:false});
    this.events.push({type:'spawn',id:p.id});
  }
  setInput(id,input){const p=this.players.get(id);if(!p||p.bot)return;p.input={...input};}
  update(dt){
    if(this.ended)return;dt=Math.min(dt,.05);this.time+=dt;
    for(const p of this.players.values()){
      if(p.hp<=0){p.deadLeft-=dt;if(p.deadLeft<=0)this.spawn(p);continue;}
      p.invuln=Math.max(0,p.invuln-dt);
      if(this.time-p.damageAt>5.5)p.hp=Math.min(100,p.hp+19*dt);
      if(p.bot)this.botInput(p,dt);
      const input=p.input||{};if(Number.isFinite(input.yaw))p.yaw=input.yaw;if(Number.isFinite(input.pitch))p.pitch=clamp(input.pitch,-1.42,1.42);
      if(input.weapon===0||input.weapon===1){if(p.weapon!==input.weapon){p.weapon=input.weapon;p.reloadLeft=0;}}
      if(p.reloadLeft>0){p.reloadLeft-=dt;if(p.reloadLeft<=0){const w=WEAPONS[p.weapon],need=Math.min(w.mag-p.ammo[p.weapon],p.reserve[p.weapon]);p.ammo[p.weapon]+=need;p.reserve[p.weapon]-=need;this.events.push({type:'reloaded',id:p.id});}}
      if(input.reload&&p.reloadLeft<=0)this.reload(p);
      moveActor(p,input,dt,this.arena.colliders,this.arena.bounds);
      if(input.fire&&!input.sprint)this.shoot(p);
    }
    const leader=[...this.players.values()].sort((a,b)=>b.kills-a.kills||a.deaths-b.deaths)[0];
    if(this.time>=this.duration||leader?.kills>=this.limit){this.ended=true;this.winner=leader?.id;this.events.push({type:'end',winner:this.winner});}
  }
  reload(p){const w=WEAPONS[p.weapon];if(p.ammo[p.weapon]>=w.mag||p.reserve[p.weapon]<=0||p.hp<=0)return;p.reloadLeft=w.reload;p.reloadTotal=w.reload;this.events.push({type:'reload',id:p.id});}
  shoot(p){
    const w=WEAPONS[p.weapon];if(p.hp<=0||p.reloadLeft>0||this.time-p.fireAt<w.rate*(p.bot?(this.difficulty==='easy'?2.6:1.6):1))return;
    if(p.ammo[p.weapon]<=0){this.reload(p);return;}
    p.fireAt=this.time;p.ammo[p.weapon]--;p.invuln=0;
    const i=p.input,spread=p.bot?(this.difficulty==='easy'?.055:.023):w.spread*(i.aim?.3:1)*(p.speed>2?1.8:1);
    const dir=direction(p.yaw+(Math.random()-.5)*spread*2,p.pitch+(Math.random()-.5)*spread*2),o={x:p.x,y:p.y+(p.crouch?1.05:1.62),z:p.z};
    let dist=obstruction(o,dir,this.arena.colliders,w.range),victim=null,headshot=false;
    if(dir.y<-1e-6)dist=Math.min(dist,Math.max(0,-o.y/dir.y));
    for(const a of this.players.values()){
      if(a===p||a.hp<=0||a.invuln>0)continue;const base=a.y||0,h=a.crouch?1.25:1.8;
      const head=rayBox(o,dir,{minX:a.x-.22,maxX:a.x+.22,minY:base+h-.43,maxY:base+h,minZ:a.z-.22,maxZ:a.z+.22},dist);
      const body=rayBox(o,dir,{minX:a.x-.34,maxX:a.x+.34,minY:base+.12,maxY:base+h-.31,minZ:a.z-.29,maxZ:a.z+.29},dist);
      if(head<dist&&head<=body+.08){dist=head;victim=a;headshot=true;}else if(body<dist){dist=body;victim=a;headshot=false;}
    }
    const end={x:o.x+dir.x*dist,y:o.y+dir.y*dist,z:o.z+dir.z*dist};
    this.events.push({type:'shot',id:p.id,weapon:p.weapon,from:o,to:end,hit:victim?.id||null,headshot});
    if(victim){const damage=(p.bot?(this.difficulty==='easy'?10:18):w.damage)*(headshot?1.8:1);this.damage(victim,p,damage,headshot);}
  }
  damage(victim,attacker,amount,headshot=false){
    if(victim.hp<=0||victim.invuln>0)return;victim.hp=Math.max(0,victim.hp-amount);victim.damageAt=this.time;
    this.events.push({type:'damage',id:victim.id,by:attacker.id,amount});
    if(victim.hp===0){victim.deaths++;victim.deadLeft=3;victim.reloadLeft=0;attacker.kills++;attacker.reserve[0]=Math.min(240,attacker.reserve[0]+30);this.events.push({type:'kill',id:attacker.id,victim:victim.id,killerName:attacker.name,victimName:victim.name,headshot});}
  }
  botInput(p,dt){
    const easy=this.difficulty==='easy',others=[...this.players.values()].filter(a=>a!==p&&a.hp>0&&a.invuln<=0),eyes={x:p.x,y:1.5+p.y,z:p.z};
    let visible=others.map(a=>({a,d:Math.hypot(a.x-p.x,a.z-p.z)})).filter(v=>v.d<35).sort((a,b)=>a.d-b.d).find(({a,d})=>{
      const dy=(a.crouch?1.02:1.42)+a.y-eyes.y,mag=Math.hypot(a.x-p.x,dy,a.z-p.z),dir={x:(a.x-p.x)/mag,y:dy/mag,z:(a.z-p.z)/mag};return obstruction(eyes,dir,this.arena.colliders,mag)>=mag-.05;
    });
    const inp={forward:0,strafe:0,fire:false,aim:true,yaw:p.yaw,pitch:p.pitch};
    if(visible){
      const a=visible.a;if(p.target!==a.id){p.target=a.id;p.reaction=easy?.85:.38;}p.reaction-=dt;
      const targetYaw=Math.atan2(-(a.x-p.x),-(a.z-p.z));let delta=Math.atan2(Math.sin(targetYaw-p.yaw),Math.cos(targetYaw-p.yaw));
      inp.yaw=p.yaw+clamp(delta,-(easy?2.2:3.8)*dt,(easy?2.2:3.8)*dt);
      const targetPitch=Math.atan2((a.crouch?.94:1.18)+a.y-eyes.y,visible.d);inp.pitch=p.pitch+(targetPitch-p.pitch)*Math.min(1,dt*5);
      inp.fire=p.reaction<=0&&Math.abs(delta)<.15&&visible.d<(easy?25:32);
      inp.forward=visible.d>17?.8:visible.d<6?-.65:0;inp.strafe=Math.sin(this.time*(easy?.6:1.1)+Number(p.id.split('-')[1])*2)>0?.65:-.65;
      p.path=[];
    }else{
      p.target=null;p.reaction=.6;
      if(this.time>p.thinkAt||!p.path.length){
        p.thinkAt=this.time+1.6+Math.random();const nearest=others.sort((a,b)=>Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(b.x-p.x,b.z-p.z))[0];
        const destination=nearest||this.arena.spawns[Math.floor(Math.random()*this.arena.spawns.length)];if(destination)p.path=this.route(p.x,p.z,destination.x,destination.z);
      }
      let next=p.path[0];if(next&&Math.hypot(next.x-p.x,next.z-p.z)<.8){p.path.shift();next=p.path[0];}
      if(next){let yaw=Math.atan2(-(next.x-p.x),-(next.z-p.z)),delta=Math.atan2(Math.sin(yaw-p.yaw),Math.cos(yaw-p.yaw));inp.yaw=p.yaw+clamp(delta,-3.5*dt,3.5*dt);inp.forward=Math.abs(delta)<.85?1:.35;inp.aim=false;}
      inp.pitch=p.pitch*(1-Math.min(1,dt*4));
    }
    inp.reload=p.ammo[p.weapon]<7&&!visible;p.input=inp;
  }
  snapshot(){return {time:this.time,difficulty:this.difficulty,limit:this.limit,duration:this.duration,ended:this.ended,winner:this.winner,players:[...this.players.values()].map(p=>({id:p.id,name:p.name,bot:p.bot,x:p.x,y:p.y,z:p.z,yaw:p.yaw,pitch:p.pitch,hp:p.hp,kills:p.kills,deaths:p.deaths,weapon:p.weapon,ammo:p.ammo.slice(),reserve:p.reserve.slice(),reloadLeft:p.reloadLeft,reloadTotal:p.reloadTotal,deadLeft:p.deadLeft,fireAt:p.fireAt,damageAt:p.damageAt,invuln:p.invuln,speed:p.speed,crouch:p.crouch}))};}
  drainEvents(){return this.events.splice(0);}
}
