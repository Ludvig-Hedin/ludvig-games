import * as THREE from 'three';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const MOVEMENT=Object.freeze({IDLE:'idle',WALK:'walk',SPRINT:'sprint',TACTICAL:'tactical',CROUCH:'crouch',SLIDE:'slide',AIR:'air',MANTLE:'mantle'});
export class Player {
 constructor(world){this.world=world;this.id='player';this.name='YOU';this.team=0;this.pos=new THREE.Vector3();this.previous=new THREE.Vector3();this.vel=new THREE.Vector3();this.yaw=0;this.pitch=0;this.radius=.33;this.height=1.78;this.eyeHeight=1.64;this.health=100;this.alive=true;this.grounded=true;this.state='idle';this.slideTime=0;this.slideCooldown=0;this.slideDir=new THREE.Vector3();this.mantle=null;this.coyote=0;this.jumpBuffer=0;this.stepDistance=0;this.stamina=1;this.tacticalExhausted=false;this.kills=this.deaths=this.assists=this.score=this.streak=0;this.lastDamage=-100;this.recoilPitch=0;this.recoilYaw=0;this.landing=0;this.onEvent=null;this.protectionUntil=0;this.damageLedger=new Map();}
 spawn(s){this.pos.set(s.x,s.y||0,s.z);this.previous.copy(this.pos);this.vel.set(0,0,0);this.yaw=s.yaw||0;this.pitch=0;this.health=100;this.alive=true;this.state='idle';this.height=1.78;this.eyeHeight=1.64;this.slideTime=0;this.slideCooldown=0;this.coyote=0;this.jumpBuffer=0;this.stepDistance=0;this.landing=0;this.mantle=null;this.grounded=true;this.lastDamage=-100;this.stamina=1;this.tacticalExhausted=false;this.recoilPitch=this.recoilYaw=0;this.damageLedger.clear();}
 look(dx,dy,sensitivity,adsMultiplier,ads){const gain=sensitivity*.0016*(1+(adsMultiplier-1)*ads);this.yaw-=dx*gain;this.pitch=clamp(this.pitch-dy*gain,-1.48,1.48);}
 transition(next){if(next===this.state)return;const old=this.state;this.state=next;this.onEvent?.('state',{old,next});}
 // Support must use the entire circular footprint. A center-only probe stops
 // at stair risers before the center can ever reach the next tread.
 supportHeight(x,z,feetY,step=0){
  let ground=this.world.groundHeight(x,z,feetY,step);const limit=feetY+step+.008,r2=this.radius*this.radius;
  for(const c of this.world.colliders){if(c.disabled)continue;if(c.walkable===false||c.max.y<=ground||c.max.y>limit)continue;const dx=x-clamp(x,c.min.x,c.max.x),dz=z-clamp(z,c.min.z,c.max.z);if(dx*dx+dz*dz<r2-.000001)ground=c.max.y;}
  return ground;
 }
 mantlePathClear(target,liftY){
  const w=this.world,r=this.radius,h=1.78,from=this.pos;
  const riseSteps=Math.max(1,Math.ceil((liftY-from.y)/.08));
  for(let i=0;i<=riseSteps;i++){const y=from.y+(liftY-from.y)*i/riseSteps;if(!w.isFree(from.x,y+.012,from.z,r,h-.012))return false;}
  const travelSteps=Math.max(1,Math.ceil(Math.hypot(target.x-from.x,target.z-from.z)/.08));
  for(let i=1;i<=travelSteps;i++){const t=i/travelSteps;if(!w.isFree(from.x+(target.x-from.x)*t,liftY+.012,from.z+(target.z-from.z)*t,r,h-.012))return false;}
  return w.isFree(target.x,target.y+.012,target.z,r,h-.012);
 }
 tryMantle(){if(this.mantle)return false;const dx=-Math.sin(this.yaw),dz=-Math.cos(this.yaw);let candidate=null,liftY=0;
  for(const c of this.world.colliders){if(c.disabled)continue;if(c.walkable===false||c.max.y<this.pos.y+.45||c.max.y>this.pos.y+1.7)continue;const x=this.pos.x+dx*.9,z=this.pos.z+dz*.9;if(x>c.min.x-.03&&x<c.max.x+.03&&z>c.min.z-.03&&z<c.max.z+.03){const target=new THREE.Vector3(x,c.max.y+.012,z),lift=target.y+.05;if((!candidate||target.y<candidate.y)&&this.mantlePathClear(target,lift)){candidate=target;liftY=lift;}}}
  if(!candidate)return false;this.mantle={from:this.pos.clone(),to:candidate,liftY,t:0,duration:.28+Math.max(0,candidate.y-this.pos.y)*.06};this.vel.y=0;this.slideTime=0;this.height=1.78;this.transition('mantle');this.onEvent?.('mantle');return true;
 }

 update(dt,input,weaponMove=1,ads=0,time=0){this.previous.copy(this.pos);if(!this.alive)return;this.slideCooldown=Math.max(0,this.slideCooldown-dt);this.landing*=Math.exp(-13*dt);this.recoilPitch*=Math.exp(-12*dt);this.recoilYaw*=Math.exp(-12*dt);
  if(input.take('jump'))this.jumpBuffer=.12;else this.jumpBuffer=Math.max(0,this.jumpBuffer-dt);
  const crouchPress=input.take('crouch');let mx=(input.down('right')?1:0)-(input.down('left')?1:0)+input.padMove.x;let mz=(input.down('backward')?1:0)-(input.down('forward')?1:0)+input.padMove.y;let len=Math.hypot(mx,mz);if(len>1){mx/=len;mz/=len;len=1;}const sin=Math.sin(this.yaw),cos=Math.cos(this.yaw),wx=mx*cos+mz*sin,wz=-mx*sin+mz*cos;
  const speed=Math.hypot(this.vel.x,this.vel.z), sprint=input.down('sprint')&&mz<-.15&&ads<.2;
  if(!input.tactical||!input.down('sprint'))this.tacticalExhausted=false;if(this.stamina<=.06)this.tacticalExhausted=true;const tactical=sprint&&input.tactical&&!this.tacticalExhausted&&this.stamina>.06;
  if(this.mantle){const m=this.mantle;m.t+=dt;const t=clamp(m.t/m.duration,0,1),rise=clamp(t/.5,0,1),travel=clamp((t-.5)/.4,0,1),settle=clamp((t-.9)/.1,0,1);const er=rise*rise*(3-2*rise),et=travel*travel*(3-2*travel),es=settle*settle*(3-2*settle);const x=m.from.x+(m.to.x-m.from.x)*et,z=m.from.z+(m.to.z-m.from.z)*et,y=t<.5?m.from.y+(m.liftY-m.from.y)*er:m.liftY+(m.to.y-m.liftY)*es;
   // Lift first, cross at clearance height, then settle. A diagonal lerp would
   // put the character's lower half through the front face of the obstacle.
   if(!this.world.isFree(x,y+.012,z,this.radius,this.height-.012)){this.mantle=null;this.vel.set(0,0,0);this.grounded=false;this.transition('air');return;}
   this.pos.set(x,y,z);this.eyeHeight+=(1.64-this.eyeHeight)*Math.min(1,dt*16);if(t>=1){this.mantle=null;this.grounded=true;this.vel.x=wx*6;this.vel.z=wz*6;this.transition('walk');}return;}
  const standing=this.world.isFree(this.pos.x,this.pos.y,this.pos.z,this.radius,1.78);
  if(crouchPress&&this.slideTime>0){this.slideTime=0;this.slideCooldown=.15;this.transition(standing?'walk':'crouch');}
  else if(crouchPress&&this.grounded&&speed>5.8&&this.slideCooldown<=0){this.slideTime=.88;this.slideDir.set(this.vel.x,0,this.vel.z).normalize();const kick=Math.min(13.6,Math.max(10.7,speed+1.4));this.vel.x=this.slideDir.x*kick;this.vel.z=this.slideDir.z*kick;this.transition('slide');this.onEvent?.('slide');}
  let crouched=(input.down('crouch')&&this.slideTime<=0)||!standing;
  if(this.jumpBuffer>0&&this.slideTime<=0&&mz<-.15&&this.tryMantle()){this.jumpBuffer=0;return;}
  if(this.grounded)this.coyote=.09;else this.coyote-=dt;
  if(this.jumpBuffer>0&&this.coyote>0&&standing){this.vel.y=8.1;this.grounded=false;this.coyote=0;this.jumpBuffer=0;this.slideTime=0;crouched=false;this.transition('air');this.onEvent?.('jump');}
  this.height=(this.slideTime>0||crouched)?1.05:1.78;
  if(this.slideTime>0&&this.grounded){this.slideTime-=dt;const friction=Math.pow(.52,dt);this.vel.x=this.vel.x*friction+wx*2.1*dt;this.vel.z=this.vel.z*friction+wz*2.1*dt;if(this.slideTime<=0||speed<3.2){this.slideTime=0;this.slideCooldown=.22;this.transition(crouched?'crouch':'walk');}}
  else if(this.grounded){let targetSpeed=6.0*weaponMove;if(crouched)targetSpeed=2.8*weaponMove;else if(input.down('walk'))targetSpeed=2.5*weaponMove;else if(sprint){targetSpeed=(tactical?12.2:9.3)*weaponMove;}
    targetSpeed*=1-.44*ads;const targetX=wx*targetSpeed,targetZ=wz*targetSpeed,acc=len>.01?88:62;const diffX=targetX-this.vel.x,diffZ=targetZ-this.vel.z,diff=Math.hypot(diffX,diffZ),amount=Math.min(1,acc*dt/(diff||1));this.vel.x+=diffX*amount;this.vel.z+=diffZ*amount;
    this.transition(crouched?'crouch':len<.01?'idle':sprint?(tactical?'tactical':'sprint'):'walk');
  }else{const current=this.vel.x*wx+this.vel.z*wz;const add=Math.max(0,6.3-current),acc=Math.min(add,11*dt);this.vel.x+=wx*acc;this.vel.z+=wz*acc;const s=Math.hypot(this.vel.x,this.vel.z);if(s>14.5){this.vel.x*=14.5/s;this.vel.z*=14.5/s;}this.transition('air');}
  this.stamina=clamp(this.stamina+(this.state==='tactical'?-.31:.24)*dt,0,1);
  if(!this.grounded)this.vel.y-=26*dt;else this.vel.y=Math.min(this.vel.y,0);
  const oldX=this.pos.x,oldZ=this.pos.z;const desiredX=this.vel.x*dt,desiredZ=this.vel.z*dt;this.moveHorizontal(desiredX,desiredZ);
  const oldY=this.pos.y,newY=oldY+this.vel.y*dt;let floor=this.supportHeight(this.pos.x,this.pos.z,oldY,.025);
  if(this.vel.y<=0&&newY<=floor+.018&&oldY>=floor-.05){if(!this.grounded&&this.vel.y<-3){this.landing=clamp(-this.vel.y*.011,.04,.16);this.onEvent?.('land',-this.vel.y/10);}this.pos.y=floor;this.vel.y=0;this.grounded=true;}else{if(this.world.isFree(this.pos.x,newY,this.pos.z,this.radius,this.height)){this.pos.y=newY;}else if(this.vel.y>0){this.vel.y=0;}else{this.pos.y=Math.max(newY,floor);this.vel.y=0;}this.grounded=false;}
  if(this.pos.y<-8){this.pos.y=0;this.vel.y=0;}
  const travel=Math.hypot(this.pos.x-oldX,this.pos.z-oldZ);if(this.grounded&&this.slideTime<=0&&travel>.001){this.stepDistance+=travel;if(this.stepDistance>(this.state==='tactical'?2.4:this.state==='sprint'?2:1.75)){this.stepDistance=0;this.onEvent?.('step',speed);}}
  const eye=(this.slideTime>0?.88:crouched?.94:1.64);this.eyeHeight+=(eye-this.eyeHeight)*(1-Math.exp(-22*dt));
  if(time-this.lastDamage>4.5)this.health=Math.min(100,this.health+24*dt);
 }
 moveHorizontal(dx,dz){const steps=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.18));dx/=steps;dz/=steps;const w=this.world,r=this.radius,h=this.height;
  const tryMove=(x,z)=>{if(w.isFree(x,this.pos.y+.012,z,r,h-.012)){this.pos.x=x;this.pos.z=z;return true;}
   if(this.grounded){const top=this.supportHeight(x,z,this.pos.y,.38);if(top>this.pos.y+.025&&top<=this.pos.y+.38&&w.isFree(this.pos.x,top+.012,this.pos.z,r,h-.012)&&w.isFree(x,top+.012,z,r,h-.012)){this.pos.set(x,top,z);return true;}}
   return false;
  };
  for(let i=0;i<steps;i++){if(tryMove(this.pos.x+dx,this.pos.z+dz))continue;if(dx!==0&&!tryMove(this.pos.x+dx,this.pos.z))this.vel.x=0;if(dz!==0&&!tryMove(this.pos.x,this.pos.z+dz))this.vel.z=0;}
 }

 direction(out=new THREE.Vector3()){const p=this.pitch+this.recoilPitch,y=this.yaw+this.recoilYaw;return out.set(-Math.sin(y)*Math.cos(p),Math.sin(p),-Math.cos(y)*Math.cos(p));}
 eye(out=new THREE.Vector3()){out.copy(this.pos);out.y+=this.eyeHeight;return out;}
}
