import RAPIER from '../vendor/rapier.mjs';
import { Vector3, Quaternion } from '../vendor/three.module.js';

export const ARENA = Object.freeze({halfWidth:41,halfLength:57,height:25,cornerRadius:10,rampRadius:5,goalWidth:18,goalHeight:9,goalDepth:8,ballRadius:1.8});
const UP=new Vector3(0,1,0), FORWARD=new Vector3(0,0,-1);
const NONE=Object.freeze({throttle:0,steer:0,pitch:0,yaw:0,roll:0,boost:false,jump:false,powerslide:false});
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const FLAG_INPUTS=Array.from({length:8},(_,f)=>Object.freeze({...NONE,boost:!!(f&1),powerslide:!!(f&4)}));
let initialized;

/** A fixed-step Rapier world with a deliberate arcade suspension / drivetrain.
 * Cars and the ball are dynamic bodies. Only wheel forces and driver controls
 * are assisted; contacts, trajectories, spin, rebounds and goals are physical.
 */
export class Physics {
  static async create(){ if(!initialized) initialized=RAPIER.init(); await initialized; return new Physics(); }
  constructor(){
    this.world=new RAPIER.World({x:0,y:-19.6,z:0});
    this.world.integrationParameters.dt=1/120;
    this.world.integrationParameters.numSolverIterations=8;
    this.world.integrationParameters.numInternalPgsIterations=2;
    this.world.integrationParameters.maxCcdSubsteps=4;
    this.world.integrationParameters.normalizedPredictionDistance=.16;
    this.queue=new RAPIER.EventQueue(true);
    this.cars=[]; this.events=[]; this.time=0; this.lastTouch=null; this.lastTouchTime=-100;
    this.staticHandles=new Set(); this.carHandles=new Map(); this.pads=[];
    this._vectors=Array.from({length:14},()=>new Vector3()); this._q=new Quaternion();
    this._makeArena(); this._makeBall(); this._makePads(); this.reset({});
  }
  _static(desc){const c=this.world.createCollider(desc.setFriction(.65).setRestitution(.42));this.staticHandles.add(c.handle);return c;}
  _box(x,y,z,hx,hy,hz){return this._static(RAPIER.ColliderDesc.cuboid(hx,hy,hz).setTranslation(x,y,z));}
  _makeArena(){
    const A=ARENA, r=A.cornerRadius, w=A.halfWidth,l=A.halfLength;
    this._box(0,-1,0,w+3,1,l+A.goalDepth+2);
    this._box(0,A.height+1,0,w+3,1,l+A.goalDepth+2);
    const boundary=[];
    const arc=(cx,cz,start)=>{for(let i=0;i<=8;i++){const t=start+i*Math.PI/16;boundary.push({x:cx+r*Math.cos(t),z:cz+r*Math.sin(t),nx:Math.cos(t),nz:Math.sin(t)});}};
    arc(w-r,l-r,0);
    boundary.push({x:A.goalWidth/2,z:l,nx:0,nz:1},{x:-A.goalWidth/2,z:l,nx:0,nz:1});
    arc(-w+r,l-r,Math.PI/2);
    arc(-w+r,-l+r,Math.PI);
    boundary.push({x:-A.goalWidth/2,z:-l,nx:0,nz:-1},{x:A.goalWidth/2,z:-l,nx:0,nz:-1});
    arc(w-r,-l+r,Math.PI*1.5);
    const verts=[],idx=[];
    const tri=(a,b,c)=>{let k=verts.length/3;verts.push(...a,...b,...c);idx.push(k,k+1,k+2);};
    const quad=(a,b,c,d)=>{tri(a,b,c);tri(a,c,d);};
    const point=(p,offset,y)=>[p.x+p.nx*offset,y,p.z+p.nz*offset];
    const profile=[];
    for(let i=0;i<=10;i++){let t=i*Math.PI/20;profile.push([-5+5*Math.sin(t),5*(1-Math.cos(t))]);}
    profile.push([0,20]);
    for(let i=1;i<=8;i++){let t=i*Math.PI/16;profile.push([-5+5*Math.cos(t),20+5*Math.sin(t)]);}
    for(let i=0;i<boundary.length;i++){
      const a=boundary[i],b=boundary[(i+1)%boundary.length];
      const aperture=Math.abs(a.z-b.z)<.01&&Math.abs(a.z)>l-.01&&Math.abs((a.x+b.x)/2)<A.goalWidth/2-.01;
      const pr=aperture?[[0,A.goalHeight],[0,20],...profile.filter(p=>p[1]>20.001)]:profile;
      for(let j=0;j<pr.length-1;j++) quad(point(a,...pr[j]),point(b,...pr[j]),point(b,...pr[j+1]),point(a,...pr[j+1]));
      // Close the sides of the quarter-pipe where it meets a goal mouth.
      if(!aperture&&Math.abs(a.z-b.z)<.01&&Math.abs(a.z)>l-.01){
        for(const p of [a,b]) if(Math.abs(Math.abs(p.x)-A.goalWidth/2)<.01){
          for(let j=0;j<10;j++) tri(point(p,0,0),point(p,...profile[j]),point(p,...profile[j+1]));
        }
      }
    }
    this._static(RAPIER.ColliderDesc.trimesh(new Float32Array(verts),new Uint32Array(idx)));
    for(const s of [-1,1]){
      this._box(0,4.5,s*(l+A.goalDepth+.5),A.goalWidth/2+.5,4.5,.5);
      this._box(-A.goalWidth/2-.35,4.5,s*(l+A.goalDepth/2),.35,4.5,A.goalDepth/2+.5);
      this._box(A.goalWidth/2+.35,4.5,s*(l+A.goalDepth/2),.35,4.5,A.goalDepth/2+.5);
      this._box(0,A.goalHeight+.4,s*(l+A.goalDepth/2),A.goalWidth/2+.5,.4,A.goalDepth/2+.3);
      // Solid goal frame; the front face lies exactly on the scoring plane.
      this._box(-A.goalWidth/2-.22,4.5,s*l,.22,4.5,.3);
      this._box(A.goalWidth/2+.22,4.5,s*l,.22,4.5,.3);
      this._box(0,A.goalHeight+.22,s*l,A.goalWidth/2+.45,.22,.3);
    }
  }
  _makeBall(){
    const body=this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0,ARENA.ballRadius+.05,0).setCcdEnabled(true).setLinearDamping(.045).setAngularDamping(.18));
    const collider=this.world.createCollider(RAPIER.ColliderDesc.ball(ARENA.ballRadius).setMass(8).setFriction(.48).setRestitution(.73).setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Max).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),body);
    this.ball={body,collider,position:{x:0,y:ARENA.ballRadius,z:0},quaternion:{x:0,y:0,z:0,w:1},velocity:{x:0,y:0,z:0},angularVelocity:{x:0,y:0,z:0}};
  }
  _makePads(){
    const large=[[-30,43],[30,43],[-35,0],[35,0],[-30,-43],[30,-43]];
    const small=[[0,40],[-12,36],[12,36],[-23,25],[23,25],[-9,20],[9,20],[0,12],[-21,10],[21,10],[-13,0],[13,0],[0,0],[0,-12],[-21,-10],[21,-10],[-9,-20],[9,-20],[-23,-25],[23,-25],[-12,-36],[12,-36],[0,-40]];
    let id=0;for(const [isLarge,list] of [[true,large],[false,small]])for(const [x,z] of list)this.pads.push({id:id++,position:{x,y:.04,z},large:isLarge,active:true,cooldown:0});
  }
  _car(team,id,isPlayer){
    const body=this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0,1,0).setCcdEnabled(true).setLinearDamping(.04).setAngularDamping(.4).setCanSleep(false));
    const collider=this.world.createCollider(RAPIER.ColliderDesc.roundCuboid(.98,.43,1.7,.1).setMass(90).setFriction(.28).setRestitution(.12).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),body);
    const names=['YOU','VECTOR','PULSE','AXIOM','DRIFT','NOVA'];
    const car={id,team,isPlayer,name:names[id]||`BOT ${id}`,body,collider,position:{x:0,y:1,z:0},quaternion:{x:0,y:0,z:0,w:1},velocity:{x:0,y:0,z:0},angularVelocity:{x:0,y:0,z:0},boost:33,speed:0,grounded:false,supersonic:false,input:NONE,lastJumpTime:-100,_jumpHeld:false,_jumps:0,_forcedAir:0,_flipTime:0,_flipAxis:new Vector3(),_normal:new Vector3(0,1,0),_inverted:0,_lastImpact:-10,proxy:false,human:false,key:null,rank:null,net:null};
    this.carHandles.set(collider.handle,car);return car;
  }
  reset({teamSize=1,playerTeam=0,freePlay=false}={}){
    for(const c of this.cars)this.world.removeRigidBody(c.body);
    this.carHandles.clear();this.cars=[];this.freePlay=freePlay;this.playerTeam=playerTeam;this.teamSize=clamp(teamSize,1,3);
    this.cars.push(this._car(playerTeam,0,true));
    if(!freePlay){for(let i=1;i<this.teamSize;i++)this.cars.push(this._car(playerTeam,this.cars.length,false));for(let i=0;i<this.teamSize;i++)this.cars.push(this._car(1-playerTeam,this.cars.length,false));}
    this.time=0;this.kickoff();
  }
  /** Online roster: list[0] is the local player. Each entry {team,rank,name,key,proxy,human}. */
  resetRoster(list){
    for(const c of this.cars)this.world.removeRigidBody(c.body);
    this.carHandles.clear();this.cars=[];this.freePlay=false;this.playerTeam=list[0].team;
    this.teamSize=clamp(Math.max(...[0,1].map(t=>list.filter(s=>s.team===t).length)),1,3);
    list.forEach((s,i)=>{const c=this._car(s.team,i,i===0);Object.assign(c,{name:s.name,rank:s.rank,key:s.key,proxy:!!s.proxy,human:!!s.human});this.cars.push(c);});
    this.time=0;this.kickoff();
  }
  kickoff(){
    this.goalScored=false;this.lastTouch=null;this.lastTouchTime=-100;
    const count=[0,0];
    for(const c of this.cars){
      const rank=c.rank??count[c.team]++,s=c.team===0?1:-1;
      const positions=this.teamSize===1?[[0,35]]:this.teamSize===2?[[-12,30],[12,36]]:[[0,32],[-17,38],[17,38]];
      const [x,z]=positions[rank]||[0,44];
      const yaw=c.team===0?0:Math.PI;
      c.body.setTranslation({x:x*s,y:.96,z:z*s},true);c.body.setRotation({x:0,y:Math.sin(yaw/2),z:0,w:Math.cos(yaw/2)},true);
      c.body.setLinvel({x:0,y:0,z:0},true);c.body.setAngvel({x:0,y:0,z:0},true);c.body.resetForces(true);c.body.resetTorques(true);
      c.boost=this.freePlay?100:33;c._jumpHeld=false;c._jumps=0;c._flipTime=0;c._forcedAir=0;c._inverted=0;c.lastJumpTime=-100;c._normal.set(0,1,0);c.input=NONE;c.grounded=true;c.net=null;
    }
    this.setBall({x:0,y:ARENA.ballRadius+.04,z:0},{x:0,y:0,z:0});
    for(const p of this.pads){p.active=true;p.cooldown=0;}this.events=[];this._sync();
    // Refresh broad-phase state before wheel rays are queried on the first step.
    this.world.timestep=1/120;this.world.step(this.queue);this.queue.drainCollisionEvents(()=>{});this._sync();
  }
  setBall(position,velocity={x:0,y:0,z:0}){
    this.ball.body.setTranslation(position,true);this.ball.body.setLinvel(velocity,true);this.ball.body.setAngvel({x:0,y:0,z:0},true);this.ball.body.setRotation({x:0,y:0,z:0,w:1},true);
    this.goalScored=false;this.lastTouch=null;this.lastTouchTime=-100;this._sync();
  }
  _support(c,p,q,up){
    const normal=this._vectors[7].set(0,0,0),origin=this._vectors[8],wheel=this._vectors[9];let distance=0,hits=0;
    for(const x of [-.83,.83])for(const z of [-1.43,1.43]){
      wheel.set(x,.15,z).applyQuaternion(q);origin.copy(p).add(wheel);
      const ray=new RAPIER.Ray(origin,{x:-up.x,y:-up.y,z:-up.z});
      const h=this.world.castRayAndGetNormal(ray,1.53,true,undefined,undefined,undefined,c.body,col=>this.staticHandles.has(col.handle));
      if(h&&h.timeOfImpact<1.52){normal.add(h.normal);distance+=h.timeOfImpact;hits++;}
    }
    if(hits>=2&&normal.lengthSq()>.01){normal.normalize();return {normal,distance:distance/hits,hits};}return null;
  }
  _drive(c,input,dt){
    c.input=input;const body=c.body;
    const p=this._vectors[0].copy(body.translation()),q=this._q.copy(body.rotation());
    const up=this._vectors[1].copy(UP).applyQuaternion(q),fwd=this._vectors[2].copy(FORWARD).applyQuaternion(q),right=this._vectors[3].crossVectors(fwd,up).normalize();
    const vel=this._vectors[4].copy(body.linvel()),ang=this._vectors[5].copy(body.angvel());
    const throttle=clamp(input.throttle||0,-1,1),steer=clamp(input.steer||0,-1,1);
    const pressed=!!input.jump&&!c._jumpHeld;c._jumpHeld=!!input.jump;c._forcedAir=Math.max(0,c._forcedAir-dt);
    const support=c._forcedAir<=0&&c._flipTime<=0?this._support(c,p,q,up):null;
    c.grounded=!!support;
    if(support){
      const n=support.normal;c._normal.copy(n);c._jumps=0;
      fwd.addScaledVector(n,-fwd.dot(n)).normalize();right.crossVectors(fwd,n).normalize();
      const vForward=vel.dot(fwd),vSide=vel.dot(right),vNormal=vel.dot(n);
      // Wheel contact is a damped suspension, expressed as a target normal
      // velocity so fast bank transitions remain attached without jitter.
      const targetNormal=clamp((1.1-support.distance)*42,-14,14);
      vel.addScaledVector(n,(targetNormal-vNormal)*(1-Math.exp(-55*dt)));
      vel.addScaledVector(right,-vSide*(1-Math.exp(-(input.powerslide?1.6:11)*dt)));
      const opposite=throttle!==0&&Math.sign(throttle)!==Math.sign(vForward)&&Math.abs(vForward)>.5;
      let acceleration=throttle*(opposite?47:25*(1-.48*clamp(Math.abs(vForward)/33,0,1)));
      if(Math.abs(vForward)>33&&Math.sign(acceleration)===Math.sign(vForward))acceleration=0;
      if(throttle===0)acceleration=-Math.sign(vForward)*Math.min(Math.abs(vForward)/dt,7.5);
      vel.addScaledVector(fwd,acceleration*dt);
      const speedFactor=clamp(Math.abs(vForward)/5.5,0,1),rate=(2.75-1.2*clamp(Math.abs(vForward)/40,0,1))*(input.powerslide?1.43:1);
      const turn=-steer*rate*speedFactor*(vForward<-.5?-1:1);
      const correction=this._vectors[6].crossVectors(up,n).multiplyScalar(36);
      ang.copy(correction).addScaledVector(n,turn);
      if(pressed){
        vel.addScaledVector(n,8.6-Math.min(vel.dot(n),0));c._jumps=1;c.lastJumpTime=this.time;c._forcedAir=.14;c.grounded=false;
        this.events.push({type:'jump',carId:c.id,position:{...c.position},intensity:.65});
      }
    }else{
      const pitch=clamp(input.pitch??throttle,-1,1),yaw=clamp(input.yaw??steer,-1,1),roll=clamp(input.roll||0,-1,1);
      if(c._flipTime>0){c._flipTime=Math.max(0,c._flipTime-dt);ang.copy(c._flipAxis).multiplyScalar(Math.PI*2/.52);}
      else{
        const target=this._vectors[6].copy(right).multiplyScalar(-pitch*3.25).addScaledVector(up,-yaw*2.45).addScaledVector(fwd,roll*4.2);
        ang.lerp(target,1-Math.exp(-(pitch||yaw||roll?5.5:2.8)*dt));
      }
      if(input.jump&&c._jumps===1&&this.time-c.lastJumpTime<.19)vel.addScaledVector(c._normal,18*dt);
      if(pressed&&c._jumps===1&&this.time-c.lastJumpTime<1.35){
        const dodgeForward=clamp(input.pitch??throttle,-1,1),dodgeSide=steer;
        if(Math.hypot(dodgeForward,dodgeSide)>.25){
          const direction=this._vectors[10].copy(fwd).multiplyScalar(dodgeForward).addScaledVector(right,dodgeSide).normalize();
          vel.addScaledVector(direction,11.7);vel.y=Math.max(vel.y,1.8);
          c._flipAxis.crossVectors(up,direction).normalize();c._flipTime=.52;ang.copy(c._flipAxis).multiplyScalar(Math.PI*2/.52);
          this.events.push({type:'flip',carId:c.id,position:{...c.position},intensity:1});
        }else{vel.addScaledVector(up,8);this.events.push({type:'jump',carId:c.id,position:{...c.position},intensity:.95});}
        c._jumps=2;c._forcedAir=.22;
      }
      // A car resting on its roof rights itself with torque and a small hop.
      if(p.y<1.25&&up.y<.3&&Math.abs(vel.y)<2.5&&c._flipTime<=0){
        c._inverted+=dt;
        if(pressed||c._inverted>.75){const axis=this._vectors[11].crossVectors(up,UP);if(axis.lengthSq()<.01)axis.copy(fwd);ang.copy(axis.normalize()).multiplyScalar(3.5);vel.y=Math.max(vel.y,2.2);c._inverted=.5;}
      }else c._inverted=0;
    }
    if(input.boost&&c.boost>0){
      vel.addScaledVector(fwd,34*dt);c.boost=Math.max(0,c.boost-33.3*dt);
    }
    if(this.freePlay)c.boost=100;
    // Drag and caps are drivetrain limits, not forces applied to the ball.
    const maxSpeed=46;if(vel.lengthSq()>maxSpeed*maxSpeed)vel.setLength(maxSpeed);
    body.setLinvel(vel,true);body.setAngvel(ang,true);
  }
  /** Remote car: dead-reckon the last network state and steer the body toward it
   * with a velocity correction, so contacts with the ball stay physical. */
  _follow(c,dt){
    const n=c.net,body=c.body;
    if(!n){body.setLinvel({x:0,y:0,z:0},true);body.setAngvel({x:0,y:0,z:0},true);c.input=NONE;return;}
    const s=n.s,age=Math.min(.3,performance.now()/1000-n.at+.05),air=!(n.f&2);
    const tx=s[0]+s[7]*age,ty=Math.max(.55,s[1]+s[8]*age-(air?9.8*age*age:0)),tz=s[2]+s[9]*age;
    const p=body.translation(),ex=tx-p.x,ey=ty-p.y,ez=tz-p.z;
    if(ex*ex+ey*ey+ez*ez>36){body.setTranslation({x:tx,y:ty,z:tz},true);body.setLinvel({x:s[7],y:s[8],z:s[9]},true);body.setRotation({x:s[3],y:s[4],z:s[5],w:s[6]},true);}
    else{
      const k=7;body.setLinvel({x:s[7]+ex*k,y:s[8]+ey*k,z:s[9]+ez*k},true);
      const q=this._q.copy(body.rotation()),t=this._qt||(this._qt=new Quaternion());t.set(s[3],s[4],s[5],s[6]).normalize();q.slerp(t,1-Math.exp(-14*dt));body.setRotation(q,true);
    }
    body.setAngvel({x:s[10],y:s[11],z:s[12]},true);
    c.boost=n.bo;c.grounded=!air;c.input=FLAG_INPUTS[n.f&5];
  }
  step(dt,inputs=new Map()){
    if(!Number.isFinite(dt)||dt<=0||dt>.05)throw new Error('Physics.step requires a fixed positive timestep ≤ 0.05 seconds.');
    this.events.length=0;this.time+=dt;
    for(const c of this.cars){if(c.proxy)this._follow(c,dt);else this._drive(c,inputs.get(c.id)||NONE,dt);}
    this.world.timestep=dt;this.world.step(this.queue);
    this.queue.drainCollisionEvents((h1,h2,started)=>{
      if(!started)return;
      const ballHandle=this.ball.collider.handle,c1=this.carHandles.get(h1),c2=this.carHandles.get(h2);
      if(h1===ballHandle||h2===ballHandle){
        const car=c1||c2,velocity=this.ball.body.linvel();
        const intensity=clamp(Math.hypot(velocity.x,velocity.y,velocity.z)/40,.08,1.6);
        if(car){this.lastTouch=car.id;this.lastTouchTime=this.time;this.events.push({type:'ballHit',carId:car.id,team:car.team,position:{...this.ball.body.translation()},intensity});}
        else if(intensity>.13)this.events.push({type:'wallHit',position:{...this.ball.body.translation()},intensity:intensity*.65});
      }else if(c1&&c2){this.events.push({type:'carHit',carId:c1.id,otherCarId:c2.id,position:{...c1.body.translation()},intensity:clamp((c1.speed+c2.speed)/70,.1,1)});}
      else if(c1||c2){const car=c1||c2;if(car.speed>7&&this.time-car._lastImpact>.18){car._lastImpact=this.time;this.events.push({type:'wallHit',carId:car.id,position:{...car.body.translation()},intensity:clamp(car.speed/65,.08,.8)});}}
    });
    for(const pad of this.pads){
      if(!pad.active){pad.cooldown=Math.max(0,pad.cooldown-dt);if(pad.cooldown===0)pad.active=true;}
      if(!pad.active)continue;
      for(const car of this.cars){const p=car.body.translation();if(car.boost<99.5&&p.y<2.35&&Math.hypot(p.x-pad.position.x,p.z-pad.position.z)<(pad.large?2.6:1.65)){
        car.boost=pad.large?100:Math.min(100,car.boost+12);pad.active=false;pad.cooldown=pad.large?10:4;
        this.events.push({type:'pickup',carId:car.id,position:{...pad.position},large:pad.large,intensity:pad.large?1:.45});break;
      }}
    }
    this._sync();
    const p=this.ball.position,R=ARENA.ballRadius;
    if(!this.goalScored&&Math.abs(p.z)>ARENA.halfLength+R&&Math.abs(p.x)<ARENA.goalWidth/2-R+.05&&p.y<ARENA.goalHeight-R+.05&&p.y>R-.25){
      this.goalScored=true;this.events.push({type:'goal',team:p.z<0?0:1,carId:this.lastTouch,position:{...p},intensity:1});
    }
  }
  _sync(){
    for(const obj of [...this.cars,this.ball]){Object.assign(obj.position,obj.body.translation());Object.assign(obj.quaternion,obj.body.rotation());Object.assign(obj.velocity,obj.body.linvel());Object.assign(obj.angularVelocity,obj.body.angvel());if(obj!==this.ball){obj.speed=Math.hypot(obj.velocity.x,obj.velocity.y,obj.velocity.z);obj.supersonic=obj.speed>42;}}
  }
  snapshot(){
    return {time:this.time,cars:this.cars.map(c=>({id:c.id,team:c.team,name:c.name,isPlayer:c.isPlayer,position:{...c.position},quaternion:{...c.quaternion},velocity:{...c.velocity},angularVelocity:{...c.angularVelocity},boost:c.boost,speed:c.speed,grounded:c.grounded,supersonic:c.supersonic,input:{...c.input},lastJumpTime:c.lastJumpTime})),ball:{position:{...this.ball.position},quaternion:{...this.ball.quaternion},velocity:{...this.ball.velocity},angularVelocity:{...this.ball.angularVelocity}},pads:this.pads.map(p=>({id:p.id,position:{...p.position},large:p.large,active:p.active,cooldown:p.cooldown}))};
  }
  dispose(){this.queue.free();this.world.free();this.cars.length=0;this.events.length=0;}
}
