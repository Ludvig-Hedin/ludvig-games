/* SKYLINE · Coastal Club. Deterministic, dependency-free arcade flight model.
 * Coordinates: +X east, +Y up, -Z north. Heading 0 faces north.
 * Throttle is independent of pitch. Controls set bounded ATTITUDE TARGETS,
 * not angular velocity, so holding a turn never produces endless rolls.
 */
(function(root){
'use strict';
const TAU=Math.PI*2, clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;
const damp=(a,b,k,dt)=>lerp(a,b,1-Math.exp(-k*dt));
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
const smooth=(a,b,v)=>{const t=clamp((v-a)/(b-a),0,1);return t*t*(3-2*t);};
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
function random(seed=42){return()=>{let t=seed+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
const WORLD={size:5200,steps:208,water:0,runway:{x:0,z:-40,width:48,length:980,y:15},clearance:1.72};
function analyticHeight(x,z){
 const r=Math.hypot(x/1080,z/1300);
 const coast=1-smooth(.76,1.04,r+.035*Math.sin(x*.009)+.025*Math.cos(z*.011));
 let h=-12+coast*(31+8*Math.sin(x*.007)*Math.cos(z*.006));
 for(const m of [[-465,-620,207,285],[435,-745,253,260],[745,220,150,245],[-690,475,185,270]]){
  h+=m[2]*Math.exp(-((x-m[0])**2+(z-m[1])**2)/(m[3]*m[3]))*coast;
 }
 // Flat airport and town aprons blend into the surrounding terrain.
 const airport=(1-smooth(110,245,Math.abs(x)))*(1-smooth(555,735,Math.abs(z+40)));
 h=lerp(h,14.78,airport);
 const town=(1-smooth(180,320,Math.hypot(x-315,z-245)))*coast;
 h=lerp(h,23,town);
 // Outlying islands have their own continuous, collidable silhouettes.
 for(const m of [[-1760,-1230,480,180],[1660,-1530,560,240],[-1700,1270,460,130],[1610,1330,530,180]]){
  const d=Math.hypot(x-m[0],z-m[1])/m[2];
  const v=-15+Math.max(0,1-d*d)*m[3]+Math.sin(x*.011)*Math.cos(z*.009)*12*Math.max(0,1-d);
  h=Math.max(h,v);
 }
 return h;
}
const terrain=new Float32Array((WORLD.steps+1)**2), cell=WORLD.size/WORLD.steps, half=WORLD.size/2;
for(let z=0;z<=WORLD.steps;z++)for(let x=0;x<=WORLD.steps;x++)terrain[z*(WORLD.steps+1)+x]=analyticHeight(x*cell-half,z*cell-half);
function heightAt(x,z){
 if(x<=-half||x>=half||z<=-half||z>=half)return -12;
 const gx=(x+half)/cell,gz=(z+half)/cell,ix=Math.floor(gx),iz=Math.floor(gz),fx=gx-ix,fz=gz-iz;
 const n=WORLD.steps+1,a=terrain[iz*n+ix],b=terrain[iz*n+ix+1],c=terrain[(iz+1)*n+ix],d=terrain[(iz+1)*n+ix+1];
 // Exactly the same diagonal/triangles as the rendered mesh (not a second approximation).
 return fx+fz<=1 ? a+(b-a)*fx+(c-a)*fz : d+(c-d)*(1-fx)+(b-d)*(1-fz);
}
function onRunway(x,z,margin=0){const r=WORLD.runway;return Math.abs(x-r.x)<r.width/2+margin && Math.abs(z-r.z)<r.length/2+margin;}
function groundAt(x,z){return onRunway(x,z)?WORLD.runway.y:Math.max(0,heightAt(x,z));}
const route=[
 [0,86,-650],[-90,145,-985],[-350,198,-1170],[-690,185,-1000],[-920,133,-670],[-995,96,-270],
 [-970,103,135],[-905,153,510],[-700,151,895],[-310,95,1110],[90,83,1100],[500,118,1030],
 [865,150,755],[1120,115,335],[1140,117,-100],[1000,155,-515],[770,200,-995],[400,192,-1220],
 [65,147,-1040],[0,95,-725]
].map((p,i)=>({x:p[0],y:Math.max(p[1],heightAt(p[0],p[2])+48),z:p[2],radius:38,index:i}));
// Each gate faces the incoming segment. Swept intersection avoids tunnelling at boost speeds.
route.forEach((g,i)=>{const p=i?route[i-1]:{x:0,y:60,z:-240};const dx=g.x-p.x,dz=g.z-p.z,n=Math.hypot(dx,dz);g.nx=dx/n;g.nz=dz/n;g.angle=Math.atan2(-g.nx,-g.nz);});
function crossedGate(a,b,g){
 const da=(a.x-g.x)*g.nx+(a.z-g.z)*g.nz,db=(b.x-g.x)*g.nx+(b.z-g.z)*g.nz;
 if(da>0||db<0||db-da<1e-8)return false;
 const t=clamp(-da/(db-da),0,1),x=lerp(a.x,b.x,t)-g.x,y=lerp(a.y,b.y,t)-g.y,z=lerp(a.z,b.z,t)-g.z;
 return x*x+y*y+z*z<=(g.radius-1.6)**2;
}
function createFlight(spawn='air'){
 const ground=spawn==='runway';return{
 x:0,y:ground?16.72:68,z:ground?355:-260,heading:0,pitch:0,bank:0,speed:ground?0:59,vy:0,
 throttle:ground?0:.62,energy:1,boosting:false,boostLock:false,grounded:ground,autoClimb:0,
 turn:0,climb:0,crashed:false,crashReason:'',flyingTime:0,stall:0,landings:0,boundary:false,
 previous:{x:0,y:ground?16.72:68,z:ground?355:-260},events:[],touchdownSpeed:0
 };}
function crash(s,reason){if(s.crashed)return;s.crashed=true;s.crashReason=reason;s.events.push({type:'crash',reason});}
function stepFlight(s,input,dt,collision=null){
 if(s.crashed||!Number.isFinite(dt)||dt<=0)return;
 dt=Math.min(dt,.05);s.events.length=0;s.previous.x=s.x;s.previous.y=s.y;s.previous.z=s.z;
 const boost=!!input.boost&&!s.grounded&&s.energy>.025&&!s.boostLock;
 s.boosting=boost;
 if(boost){s.energy=Math.max(0,s.energy-dt*.21);if(s.energy<=.025)s.boostLock=true;}
 else{s.energy=Math.min(1,s.energy+dt*.09);if(!input.boost&&s.energy>.14)s.boostLock=false;}
 s.throttle=clamp(s.throttle+(input.throttle||0)*dt*.48,0,1);
 const turn=clamp(input.turn||0,-1,1),climb=clamp(input.climb||0,-1,1),sensitivity=clamp(input.sensitivity||1,.55,1.3);
 s.turn=damp(s.turn,turn,7.5,dt);s.climb=damp(s.climb,climb,6.5,dt);
 const floor=groundAt(s.x,s.z)+WORLD.clearance;
 if(s.grounded){
  s.pitch=damp(s.pitch,0,7,dt);s.bank=damp(s.bank,0,9,dt);
  const target=input.brake?0:s.throttle*99;
  const acceleration=input.brake?-26:clamp((target-s.speed)*.9,-15,14);
  s.speed=Math.max(0,s.speed+acceleration*dt);
  s.heading=wrap(s.heading+s.turn*clamp(s.speed/16,0,1)*.65*dt);
  s.x+=Math.sin(s.heading)*s.speed*dt;s.z-=Math.cos(s.heading)*s.speed*dt;
  s.y=groundAt(s.x,s.z)+WORLD.clearance;s.vy=0;
  if(!onRunway(s.x,s.z)&&heightAt(s.x,s.z)<0){crash(s,'You taxied into the water.');return;}
  if(!onRunway(s.x,s.z)&&s.speed>26){s.speed=Math.max(24,s.speed-22*dt);s.events.push({type:'grass'});}
  if(onRunway(s.x,s.z)&&s.speed>=33&&!input.brake&&s.throttle>.34){
   s.grounded=false;s.autoClimb=3.3;s.vy=3.2;s.y+=.18;s.events.push({type:'takeoff'});
  }
 }else{
  s.flyingTime+=dt;
  if(s.autoClimb>0)s.autoClimb=Math.max(0,s.autoClimb-dt);
  const autoPitch=s.autoClimb>0?.135:0;
  const targetPitch=climb!==0?s.climb*.39*sensitivity:autoPitch;
  s.pitch=damp(s.pitch,targetPitch,3.6,dt);
  s.bank=damp(s.bank,-s.turn*.87*sensitivity,4.4,dt);
  // Coordinated arcade turns. No sideways skating, quaternion drift or uncontrolled roll.
  const yawRate=s.turn*.55*sensitivity*clamp(65/Math.max(s.speed,35),.58,1.35);
  s.heading=wrap(s.heading+yawRate*dt);
  let targetSpeed=20+s.throttle*76+(boost?37:0)-s.pitch*15;
  if(input.brake)targetSpeed=Math.min(targetSpeed,31);
  s.speed=damp(s.speed,targetSpeed,input.brake?1.45:.48,dt);
  s.speed=clamp(s.speed,17,140);
  s.stall=clamp((29-s.speed)/12,0,1);
  let targetVY=Math.sin(s.pitch)*s.speed*(1-s.stall*.72)-s.stall*11;
  // Approach assist: with a sensible speed and runway alignment, a keyboard
  // descent becomes a manageable glide, not a 20 m/s plunge into the tarmac.
  const approach=Math.abs(s.x)<34&&s.z>-710&&s.z<930&&s.y<90&&s.speed<59&&s.throttle<.43&&Math.abs(Math.sin(s.heading))<.28;
  if(approach&&targetVY<0){targetVY=Math.max(-3.8,targetVY);s.pitch=Math.max(s.pitch,-.09);}
  s.vy=damp(s.vy,targetVY,3.9,dt);
  s.x+=Math.sin(s.heading)*Math.cos(s.pitch)*s.speed*dt;
  s.z-=Math.cos(s.heading)*Math.cos(s.pitch)*s.speed*dt;
  s.y+=s.vy*dt;
  if(s.y>820){s.y=820;s.vy=Math.min(0,s.vy);s.pitch=Math.min(0,s.pitch);}
  // Process contact AFTER integration, against the visible terrain/runway surface.
  const nextFloor=groundAt(s.x,s.z)+WORLD.clearance;
  if(s.y<=nextFloor){
   const safe=onRunway(s.x,s.z)&&s.vy>=-5.2&&Math.abs(s.bank)<.39&&s.speed<59;
   if(safe){
    s.y=nextFloor;s.grounded=true;s.autoClimb=0;s.touchdownSpeed=s.speed;s.vy=0;
    s.pitch=0;s.bank=0;s.throttle=Math.min(s.throttle,.22);s.landings++;
    s.events.push({type:'landing',speed:s.speed});
   }else crash(s,heightAt(s.x,s.z)<0?'Water landing. Try a little more altitude.':onRunway(s.x,s.z)?'Hard landing. Slow down, level the wings, and descend gently.':'Terrain strike. Pull up earlier.');
  }
 }
 s.boundary=Math.hypot(s.x,s.z)>2350;
 if(Math.hypot(s.x,s.z)>2700){
  // Soft world boundary: put the aircraft on an inbound course, not an invisible crash wall.
  const a=Math.atan2(s.x,s.z);s.x=Math.sin(a)*2260;s.z=Math.cos(a)*2260;
  s.heading=Math.atan2(-s.x,s.z);s.y=Math.max(s.y,heightAt(s.x,s.z)+100);s.pitch=s.bank=0;
  s.events.push({type:'boundary'});
 }
 if(collision&&!s.crashed){const reason=collision(s);if(reason)crash(s,reason);}
}
const api={TAU,clamp,lerp,damp,wrap,smooth,distance,random,WORLD,terrain,heightAt,groundAt,onRunway,route,crossedGate,createFlight,stepFlight};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else Object.assign(root.SKY=root.SKY||{},api);
})(typeof window!=='undefined'?window:globalThis);
