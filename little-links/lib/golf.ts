/** Deterministic mini-golf model shared by browser, bots and authoritative room server. */
export type V2 = { x: number; z: number };
export type Rect = V2 & { w: number; d: number };
export type FloorRect = Rect & { y: number; slopeX?: number; slopeZ?: number };
export type Wall = { ax: number; az: number; bx: number; bz: number; y: number; height: number };
export type Obstacle = V2 & { type: 'bumper' | 'rotor' | 'gate' | 'windmill' | 'tunnel'; radius?: number; length?: number; width?: number; speed?: number; phase?: number; y?: number };
export type Hole = { id: number; name: string; par: number; subtitle: string; start: V2; cup: V2; floors: FloorRect[]; walls: Wall[]; obstacles: Obstacle[]; sand: Rect[]; water: Rect[]; waypoints: V2[]; bounds: Rect; theme: 'meadow' | 'coast' | 'garden' };
export type Ball = { x: number; y: number; z: number; vx: number; vy: number; vz: number; stopped: boolean; sunk: boolean; hazard: boolean; settleTime: number };
export type ShotFrame = { t: number; x: number; y: number; z: number };
export type ShotResult = { frames: ShotFrame[]; ball: Ball; duration: number; outcome: 'rest' | 'cup' | 'water' };
export type ShotPlan = { angle: number; power: number; wait: number };
export const BALL_RADIUS = 0.16;
export const CUP_RADIUS = 0.34;
export const MAX_STROKES = 10;
export const FIXED_STEP = 1 / 120;
export const MAX_SHOT_SPEED = 13;
const GRAVITY = 9.81;
const ROLL_FRICTION = 1.55;
const WALL_RESTITUTION = 0.76;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const rect = (x:number,z:number,w:number,d:number,y=0,slopeX=0,slopeZ=0): FloorRect => ({x,z,w,d,y,slopeX,slopeZ});
const point = (x:number,z:number): V2 => ({x,z});
export const contains = (r:Rect,x:number,z:number,pad=0) => Math.abs(x-r.x) <= r.w/2+pad && Math.abs(z-r.z) <= r.d/2+pad;
function floorAt(hole:Hole,x:number,z:number): FloorRect | null {
  let floor:FloorRect|null=null, height=-Infinity;
  for(const f of hole.floors) if(contains(f,x,z,0.0001)) { const h=f.y+(f.slopeX||0)*(x-f.x)+(f.slopeZ||0)*(z-f.z); if(h>height){height=h;floor=f;} }
  return floor;
}
export function sampleHeight(hole:Hole,x:number,z:number):number|null {
  const f=floorAt(hole,x,z); return f ? f.y+(f.slopeX||0)*(x-f.x)+(f.slopeZ||0)*(z-f.z) : null;
}
/** Derive only exposed boundaries of a union of rectangle floors, leaving joins seamless. */
function outerWalls(floors:FloorRect[], openings:Rect[]):Wall[] {
  const walls:Wall[]=[];
  const occupied=(x:number,z:number)=>floors.some(f=>contains(f,x,z,-0.00001));
  for(const f of floors){
    const x0=f.x-f.w/2,x1=f.x+f.w/2,z0=f.z-f.d/2,z1=f.z+f.d/2;
    for(const [vertical,c,a,b,sign] of [[1,x0,z0,z1,-1],[1,x1,z0,z1,1],[0,z0,x0,x1,-1],[0,z1,x0,x1,1]]){
      const cuts=[a,b];
      for(const other of floors) for(const v of vertical ? [other.z-other.d/2,other.z+other.d/2] : [other.x-other.w/2,other.x+other.w/2]) if(v>a&&v<b) cuts.push(v);
      cuts.sort((p,q)=>p-q);
      for(let j=0;j<cuts.length-1;j++){
        const aa=cuts[j],bb=cuts[j+1],mid=(aa+bb)/2;
        if(bb-aa<0.0001) continue;
        const x=vertical?c:mid,z=vertical?mid:c;
        if(occupied(x+(vertical?sign*0.001:0),z+(vertical?0:sign*0.001))) continue;
        if(openings.some(r=>contains(r,x,z,0.01))) continue;
        const n=Math.max(1,Math.ceil((bb-aa)/(Math.abs(f.slopeX||0)+Math.abs(f.slopeZ||0)>0?0.75:100)));
        for(let k=0;k<n;k++){
          const pa=aa+(bb-aa)*k/n,pb=aa+(bb-aa)*(k+1)/n;
          const mx=vertical?c:(pa+pb)/2,mz=vertical?(pa+pb)/2:c;
          walls.push({ax:vertical?c:pa,az:vertical?pa:c,bx:vertical?c:pb,bz:vertical?pb:c,y:f.y+(f.slopeX||0)*(mx-f.x)+(f.slopeZ||0)*(mz-f.z),height:0.43});
        }
      }
    }
  }
  return walls;
}
type HoleInput = Omit<Hole,'id'|'bounds'|'walls'|'obstacles'|'sand'|'water'|'theme'> & { walls?:Wall[]; obstacles?:Obstacle[]; sand?:Rect[]; water?:Rect[]; theme?:Hole['theme']; openings?:Rect[] };
function hole(id:number,input:HoleInput):Hole {
  const minX=Math.min(...input.floors.map(f=>f.x-f.w/2)),maxX=Math.max(...input.floors.map(f=>f.x+f.w/2));
  const minZ=Math.min(...input.floors.map(f=>f.z-f.d/2)),maxZ=Math.max(...input.floors.map(f=>f.z+f.d/2));
  return {id,name:input.name,par:input.par,subtitle:input.subtitle,start:input.start,cup:input.cup,floors:input.floors,walls:[...outerWalls(input.floors,input.openings||[]),...(input.walls||[])],obstacles:input.obstacles||[],sand:input.sand||[],water:input.water||[],waypoints:input.waypoints,bounds:{x:(minX+maxX)/2,z:(minZ+maxZ)/2,w:maxX-minX,d:maxZ-minZ},theme:input.theme||'meadow'};
}
const wall=(ax:number,az:number,bx:number,bz:number,y=0,height=0.6):Wall=>({ax,az,bx,bz,y,height});
const bumper=(x:number,z:number,radius=0.55):Obstacle=>({type:'bumper',x,z,radius});
export const COURSES:Hole[] = [
  hole(1,{name:'First light',par:2,subtitle:'A little touch goes a long way.',start:point(0,6),cup:point(0,-6),floors:[rect(0,0,6,16)],waypoints:[point(0,-6)]}),
  hole(2,{name:'Around the bend',par:3,subtitle:'Find your angle.',start:point(-3.5,6),cup:point(3.5,-5),floors:[rect(-3.5,1,4,14),rect(0,-5,11,4)],waypoints:[point(-3.5,-5),point(3.5,-5)]}),
  hole(3,{name:'Bumper garden',par:3,subtitle:'A friendly nudge in the right direction.',start:point(0,7),cup:point(0,-7),floors:[rect(0,0,7,18)],obstacles:[bumper(-0.7,3,0.66),bumper(1.15,-0.7,0.7),bumper(-0.8,-3.6,0.65)],waypoints:[point(1.7,3),point(-1.2,-1),point(0,-7)]}),
  hole(4,{name:'Sandy toes',par:3,subtitle:'Keep it on the green.',start:point(-1.6,7),cup:point(1.5,-6.8),floors:[rect(0,0,7,18)],sand:[rect(-1.3,1.7,4.4,3.1),rect(1.8,-3.4,3.4,2.4)],waypoints:[point(2.1,2.8),point(-1.9,-3.2),point(1.5,-6.8)],theme:'coast'}),
  hole(5,{name:'Rolling hills',par:3,subtitle:'Up, over, and easy on the landing.',start:point(0,7),cup:point(0,-7),floors:[rect(0,6,6,6),rect(0,1.5,6,3,0.6,0,-0.4),rect(0,-1.5,6,3,0.6,0,0.4),rect(0,-6,6,6)],waypoints:[point(0,-7)]}),
  hole(6,{name:'The old mill',par:3,subtitle:'Wait for your window.',start:point(0,7),cup:point(0,-7),floors:[rect(0,0,7,18)],walls:[wall(-3.5,0,-1.05,0),wall(1.05,0,3.5,0)],obstacles:[{type:'windmill',x:0,z:0,length:2.1,width:0.22,speed:1.1,phase:0}],waypoints:[point(0,2),point(0,-7)]}),
  hole(7,{name:'Little bridge',par:3,subtitle:'A straight line over still water.',start:point(0,7),cup:point(0,-7),floors:[rect(0,6,7,6),rect(0,0,1.8,6),rect(0,-6,7,6)],water:[rect(0,0,8,6)],openings:[rect(0,0,3,5.5)],waypoints:[point(0,2.6),point(0,-7)],theme:'coast'}),
  hole(8,{name:'Secret passage',par:3,subtitle:'Through the shade, into the sun.',start:point(-2,7),cup:point(2,-7),floors:[rect(0,0,7,18)],walls:[wall(-3.5,0,-1.15,0),wall(1.15,0,3.5,0)],obstacles:[{type:'tunnel',x:0,z:0,length:4,width:2.3}],waypoints:[point(0,3),point(0,-3),point(2,-7)],theme:'garden'}),
  hole(9,{name:'Pinwheel',par:3,subtitle:'Timing is everything.',start:point(-1.6,7),cup:point(1.7,-7),floors:[rect(0,0,8,18)],obstacles:[{type:'rotor',x:0,z:0,length:5.4,width:0.24,speed:0.8,phase:0.4}],waypoints:[point(-2.6,1),point(2,-3),point(1.7,-7)]}),
  hole(10,{name:'Two ways home',par:4,subtitle:'The narrow way saves a stroke.',start:point(0,7),cup:point(0,-7),floors:[rect(0,6,10,6),rect(-3.7,0,2.6,6),rect(3.9,0,2.2,6),rect(0,-6,10,6)],water:[rect(0,0,5,6)],openings:[rect(3.9,0,2.4,5.8)],obstacles:[bumper(-3.6,0,0.4)],waypoints:[point(-3.8,4),point(-3.8,-4),point(0,-7)],theme:'coast'}),
  hole(11,{name:'The switchback',par:4,subtitle:'Three turns. One good plan.',start:point(-4,7),cup:point(4,-7),floors:[rect(-4,4.5,3,9),rect(0,1.5,11,3),rect(4,-2.5,3,11)],walls:[wall(-2.5,2.4,2.4,2.4)],waypoints:[point(-4,1.2),point(4,1.2),point(4,-7)],theme:'garden'}),
  hole(12,{name:'Sky terrace',par:4,subtitle:'Climb to a better view.',start:point(0,7),cup:point(1.4,-7),floors:[rect(0,6,6,6),rect(0,0,6,6,1.2,0,-0.4),rect(0,-6,7,6,2.4)],obstacles:[bumper(-0.8,-5,0.75)],waypoints:[point(1.6,-4),point(1.4,-7)]}),
  hole(13,{name:'Pendulum path',par:4,subtitle:'Let the gate pass first.',start:point(0,7),cup:point(-1.7,-7),floors:[rect(0,0,7,18)],obstacles:[{type:'gate',x:0,z:1.2,length:3.4,width:0.24,speed:0.9,phase:0},{type:'gate',x:0,z:-3.4,length:3.6,width:0.24,speed:0.8,phase:1.8}],waypoints:[point(0,3.5),point(0,-1.1),point(-1.7,-7)],theme:'garden'}),
  hole(14,{name:'Bank holiday',par:4,subtitle:'The walls are on your side.',start:point(-1.7,7),cup:point(1.7,-7),floors:[rect(0,0,8,18)],walls:[wall(-4,2,1.8,2),wall(-1.8,-2.5,4,-2.5)],waypoints:[point(2.7,3.2),point(2.7,0),point(-2.7,-1.3),point(-2.7,-4),point(1.7,-7)]}),
  hole(15,{name:'Island hopping',par:4,subtitle:'One calm putt at a time.',start:point(-3,7),cup:point(3,-7),floors:[rect(-3,6,5,6),rect(-1.5,2,2,4),rect(0,0,5,4),rect(1.5,-2,2,4),rect(3,-6,5,6)],water:[rect(0,0,13,10)],openings:[rect(-1.5,2.2,2.2,1.6),rect(1.5,-2.2,2.2,1.6)],waypoints:[point(-1.5,3.5),point(-1.5,0),point(1.5,0),point(1.5,-3.5),point(3,-7)],theme:'coast'}),
  hole(16,{name:'Clover club',par:4,subtitle:'Thread the garden.',start:point(0,8),cup:point(0,-8),floors:[rect(0,0,8,20)],obstacles:[bumper(-1.2,4.7,0.75),bumper(1.2,1.8,0.75),bumper(-1.2,-1.2,0.75),bumper(1.2,-4.3,0.75)],sand:[rect(-2.6,-4.7,2.2,3.5),rect(2.6,4.2,2.2,3.4)],waypoints:[point(0.7,4.7),point(-0.8,1.8),point(0.8,-1.2),point(-0.7,-4.3),point(0,-8)],theme:'garden'}),
  hole(17,{name:'Crosswinds',par:4,subtitle:'A moving target, a steady hand.',start:point(-2,8),cup:point(2,-8),floors:[rect(0,0,9,20)],obstacles:[{type:'rotor',x:-0.7,z:3.6,length:4.8,width:0.24,speed:-0.7,phase:0.2},{type:'rotor',x:0.7,z:-3.6,length:4.8,width:0.24,speed:0.9,phase:1.2}],sand:[rect(2.7,0,3.5,2.2)],waypoints:[point(-2.5,0),point(2,-8)]}),
  hole(18,{name:'The grand finale',par:5,subtitle:'One last lovely little challenge.',start:point(-3.4,8),cup:point(3.4,-8),floors:[rect(-3.4,5,5,10),rect(0,0,11.8,3),rect(3.4,-5,5,10)],walls:[wall(-0.9,1.5,-0.9,5.7),wall(0.9,-5.7,0.9,-1.5)],obstacles:[{type:'windmill',x:-3.4,z:3,length:2,width:0.2,speed:0.9,phase:0.6},bumper(0,0,0.5),{type:'gate',x:3.4,z:-4,length:2.6,width:0.24,speed:1,phase:1}],sand:[rect(3.4,-6,3.8,1)],waypoints:[point(-3.4,0),point(-1.4,-0.8),point(1.5,-0.8),point(3.4,0),point(3.4,-8)],theme:'garden'}),
];
export const HOLES = COURSES;

export function makeBall(hole:Hole):Ball {
  return {x:hole.start.x,z:hole.start.z,y:(sampleHeight(hole,hole.start.x,hole.start.z)||0)+BALL_RADIUS,vx:0,vy:0,vz:0,stopped:true,sunk:false,hazard:false,settleTime:0};
}
export type ObstacleSegment = { ax:number; az:number; bx:number; bz:number; width:number; y:number; height:number; vx:number; vz:number; angularVelocity:number; centerX:number; centerZ:number };
/** Renderer and physics use identical obstacle positions. Windmill gate rises clear of ball. */
export function getObstacleSegments(o:Obstacle,time:number):ObstacleSegment[] {
  const speed=o.speed||0, phase=o.phase||0, width=o.width||0.22, length=o.length||3, y=o.y||0;
  if(o.type==='rotor'){
    const a=time*speed+phase,dx=Math.cos(a)*length/2,dz=Math.sin(a)*length/2;
    return [{ax:o.x-dx,az:o.z-dz,bx:o.x+dx,bz:o.z+dz,width,y,height:0.48,vx:0,vz:0,angularVelocity:speed,centerX:o.x,centerZ:o.z}];
  }
  if(o.type==='gate'){
    const dx=Math.sin(time*speed+phase)*1.55;
    return [{ax:o.x+dx-length/2,az:o.z,bx:o.x+dx+length/2,bz:o.z,width,y,height:0.54,vx:Math.cos(time*speed+phase)*speed*1.55,vz:0,angularVelocity:0,centerX:o.x+dx,centerZ:o.z}];
  }
  if(o.type==='windmill'){
    const raised=Math.max(0,Math.sin(time*speed+phase))*1.7;
    return [{ax:o.x-length/2,az:o.z,bx:o.x+length/2,bz:o.z,width,y:y+raised,height:0.34,vx:0,vz:0,angularVelocity:0,centerX:o.x,centerZ:o.z}];
  }
  if(o.type==='tunnel') {
    const w=(o.width||2.3)/2,l=(o.length||4)/2;
    return [ {ax:o.x-w,az:o.z-l,bx:o.x-w,bz:o.z+l,width:0.2,y,height:1.4,vx:0,vz:0,angularVelocity:0,centerX:o.x-w,centerZ:o.z}, {ax:o.x+w,az:o.z-l,bx:o.x+w,bz:o.z+l,width:0.2,y,height:1.4,vx:0,vz:0,angularVelocity:0,centerX:o.x+w,centerZ:o.z} ];
  }
  return [];
}
function segmentCollision(ball:Ball,s:{ax:number;az:number;bx:number;bz:number;y:number;height:number},halfWidth=0,vx=0,vz=0,omega=0,cx=0,cz=0){
  if(ball.y-BALL_RADIUS>s.y+s.height||ball.y+BALL_RADIUS<s.y) return;
  const dx=s.bx-s.ax,dz=s.bz-s.az,len=dx*dx+dz*dz;
  const u=len>0?clamp(((ball.x-s.ax)*dx+(ball.z-s.az)*dz)/len,0,1):0;
  const qx=s.ax+dx*u,qz=s.az+dz*u;
  let nx=ball.x-qx,nz=ball.z-qz,d=Math.hypot(nx,nz);
  const radius=BALL_RADIUS+halfWidth;
  if(d>=radius) return;
  if(d<1e-8){ const l=Math.hypot(dx,dz)||1; nx=-dz/l;nz=dx/l;d=0; } else {nx/=d;nz/=d;}
  ball.x+=nx*(radius-d+0.00001);ball.z+=nz*(radius-d+0.00001);
  const ovx=vx-omega*(qz-cz),ovz=vz+omega*(qx-cx);
  const normal=(ball.vx-ovx)*nx+(ball.vz-ovz)*nz;
  if(normal<0){ball.vx-=(1+WALL_RESTITUTION)*normal*nx;ball.vz-=(1+WALL_RESTITUTION)*normal*nz;}
}
function substep(ball:Ball,hole:Hole,dt:number,time:number){
  if(ball.stopped||ball.sunk||ball.hazard)return;
  const f=floorAt(hole,ball.x,ball.z), h=f?sampleHeight(hole,ball.x,ball.z):null;
  const floorVerticalVelocity=(f?.slopeX||0)*ball.vx+(f?.slopeZ||0)*ball.vz;
  const grounded=h!==null&&ball.y<=h+BALL_RADIUS+0.055&&ball.vy<=floorVerticalVelocity+0.2;
  if(grounded&&f){
    const sx=f.slopeX||0,sz=f.slopeZ||0;
    ball.vx-=GRAVITY*sx/(1+sx*sx+sz*sz)*dt;ball.vz-=GRAVITY*sz/(1+sx*sx+sz*sz)*dt;
    const speed=Math.hypot(ball.vx,ball.vz),sand=hole.sand.some(r=>contains(r,ball.x,ball.z));
    const friction=(sand?5.9:ROLL_FRICTION)+speed*(sand?0.3:0.025);
    const factor=speed>0?Math.max(0,speed-friction*dt)/speed:0;
    ball.vx*=factor;ball.vz*=factor;ball.vy=sx*ball.vx+sz*ball.vz;
  }else ball.vy-=GRAVITY*dt;
  const previousY=ball.y;
  ball.x+=ball.vx*dt;ball.z+=ball.vz*dt;ball.y+=ball.vy*dt;
  for(const w of hole.walls)segmentCollision(ball,w);
  for(const o of hole.obstacles){
    if(o.type==='bumper'){
      const ground=sampleHeight(hole,o.x,o.z)||0;
      if(ball.y-BALL_RADIUS>ground+0.6)continue;
      const r=(o.radius||0.55)+BALL_RADIUS,dx=ball.x-o.x,dz=ball.z-o.z,d=Math.hypot(dx,dz);
      if(d<r){ const nx=d>1e-8?dx/d:1,nz=d>1e-8?dz/d:0;ball.x=o.x+nx*(r+0.00001);ball.z=o.z+nz*(r+0.00001); const dot=ball.vx*nx+ball.vz*nz;if(dot<0){ball.vx-=1.88*dot*nx;ball.vz-=1.88*dot*nz;} }
    }else for(const s of getObstacleSegments(o,time))segmentCollision(ball,s,s.width/2,s.vx,s.vz,s.angularVelocity,s.centerX,s.centerZ);
  }
  const nh=sampleHeight(hole,ball.x,ball.z);
  if(nh!==null&&ball.y<nh+BALL_RADIUS&&(previousY>=nh+BALL_RADIUS-0.14||grounded)){
    ball.y=nh+BALL_RADIUS;
    const nf=floorAt(hole,ball.x,ball.z);
    const tangent=(nf?.slopeX||0)*ball.vx+(nf?.slopeZ||0)*ball.vz;
    if(ball.vy<-2.3&&!grounded)ball.vy=-ball.vy*0.21;else ball.vy=tangent;
  }
  const speed=Math.hypot(ball.vx,ball.vz);
  const cupH=sampleHeight(hole,hole.cup.x,hole.cup.z)||0;
  const cupDistance=Math.hypot(ball.x-hole.cup.x,ball.z-hole.cup.z);
  if(cupDistance<CUP_RADIUS&&Math.abs(ball.y-cupH-BALL_RADIUS)<0.12&&speed<3.3){
    ball.sunk=true;ball.stopped=true;ball.x=hole.cup.x;ball.z=hole.cup.z;ball.y=cupH-0.27;ball.vx=ball.vy=ball.vz=0;return;
  }
  if(ball.y<-2.2||!Number.isFinite(ball.x+ball.y+ball.z)||Math.abs(ball.x)>100||Math.abs(ball.z)>100){ball.hazard=true;ball.stopped=true;ball.vx=ball.vy=ball.vz=0;return;}
  const localFloor=floorAt(hole,ball.x,ball.z);
  const stableSlope=Math.hypot(localFloor?.slopeX||0,localFloor?.slopeZ||0)<ROLL_FRICTION/GRAVITY;
  if(speed<0.045&&Math.abs(ball.vy)<0.15&&nh!==null&&stableSlope){ball.settleTime+=dt;if(ball.settleTime>0.12){ball.stopped=true;ball.vx=ball.vy=ball.vz=0;ball.y=nh+BALL_RADIUS;}}
  else ball.settleTime=0;
}
/** Mutates one ball; internally substeps so even a full-power shot cannot tunnel. */
export function stepBall(ball:Ball,hole:Hole,dt:number,time:number):Ball {
  const safeDt=Math.min(Math.max(dt,0),0.1);
  const steps=Math.max(1,Math.ceil(safeDt/FIXED_STEP));
  for(let i=0;i<steps;i++)substep(ball,hole,safeDt/steps,time+i*safeDt/steps);
  return ball;
}
export function simulateShot(hole:Hole,initial:Ball,angle:number,power:number,startTime=0,recordFrames=true):ShotResult {
  const ball={...initial,stopped:false,sunk:false,hazard:false,settleTime:0};
  const speed=clamp(power,0.015,1)*MAX_SHOT_SPEED;
  ball.vx=Math.sin(angle)*speed;ball.vz=Math.cos(angle)*speed;ball.vy=0;
  const frames:ShotFrame[]=recordFrames?[{t:0,x:ball.x,y:ball.y,z:ball.z}]:[];
  let t=0;
  for(let i=0;i<2400&&!ball.stopped;i++){
    substep(ball,hole,FIXED_STEP,startTime+t);t+=FIXED_STEP;
    if(recordFrames&&(i%4===3||ball.stopped))frames.push({t,x:ball.x,y:ball.y,z:ball.z});
  }
  if(!ball.stopped){ball.stopped=true;ball.vx=ball.vy=ball.vz=0;}
  return {frames,ball,duration:t,outcome:ball.sunk?'cup':ball.hazard?'water':'rest'};
}

type Navigation = { minX:number; minZ:number; step:number; nx:number; nz:number; distances:Float64Array; valid:Uint8Array };
const navigationCache = new WeakMap<Hole,Navigation>();
function segmentDistance(x:number,z:number,ax:number,az:number,bx:number,bz:number){const dx=bx-ax,dz=bz-az;const u=clamp(((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz||1),0,1);return Math.hypot(x-ax-u*dx,z-az-u*dz);}
function navigable(hole:Hole,x:number,z:number){
  const h=sampleHeight(hole,x,z);if(h===null)return false;
  for(let i=0;i<8;i++){const a=i*Math.PI/4;if(sampleHeight(hole,x+Math.cos(a)*0.21,z+Math.sin(a)*0.21)===null)return false;}
  if(hole.walls.some(w=>Math.abs(w.y-h)<0.8&&segmentDistance(x,z,w.ax,w.az,w.bx,w.bz)<0.23))return false;
  for(const o of hole.obstacles){
    if(o.type==='bumper'&&Math.hypot(x-o.x,z-o.z)<(o.radius||0.55)+0.23)return false;
    if(o.type==='tunnel'&&getObstacleSegments(o,0).some(s=>segmentDistance(x,z,s.ax,s.az,s.bx,s.bz)<0.32))return false;
  }
  return true;
}
function clearRoute(hole:Hole,a:V2,b:V2){const n=Math.ceil(Math.hypot(a.x-b.x,a.z-b.z)/0.23);for(let i=1;i<=n;i++)if(!navigable(hole,a.x+(b.x-a.x)*i/n,a.z+(b.z-a.z)*i/n))return false;return true;}
function navigation(hole:Hole):Navigation{
  const cached=navigationCache.get(hole);if(cached)return cached;
  const step=0.4,minX=hole.bounds.x-hole.bounds.w/2,minZ=hole.bounds.z-hole.bounds.d/2,nx=Math.ceil(hole.bounds.w/step)+1,nz=Math.ceil(hole.bounds.d/step)+1;
  const distances=new Float64Array(nx*nz).fill(Infinity),valid=new Uint8Array(nx*nz);
  const heap:[number,number][]=[];
  const push=(item:[number,number])=>{heap.push(item);let i=heap.length-1;while(i>0){const p=(i-1)>>1;if(heap[p][0]<=item[0])break;heap[i]=heap[p];i=p;}heap[i]=item;};
  const pop=()=>{const first=heap[0],last=heap.pop()!;if(heap.length){let i=0;while(i*2+1<heap.length){let child=i*2+1;if(child+1<heap.length&&heap[child+1][0]<heap[child][0])child++;if(last[0]<=heap[child][0])break;heap[i]=heap[child];i=child;}heap[i]=last;}return first;};
  for(let z=0;z<nz;z++)for(let x=0;x<nx;x++){
    const px=minX+x*step,pz=minZ+z*step,index=z*nx+x;
    valid[index]=navigable(hole,px,pz)?1:0;
    const distance=Math.hypot(px-hole.cup.x,pz-hole.cup.z);
    if(valid[index]&&distance<0.72&&clearRoute(hole,{x:px,z:pz},hole.cup)){distances[index]=distance;push([distance,index]);}
  }
  const dirs=[[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]];
  while(heap.length){const [distance,index]=pop();if(distance>distances[index])continue;const x=index%nx,z=Math.floor(index/nx);for(const [dx,dz]of dirs){const xx=x+dx,zz=z+dz;if(xx<0||zz<0||xx>=nx||zz>=nz)continue;const k=zz*nx+xx;if(!valid[k])continue;if(dx&&dz&&(!valid[z*nx+xx]||!valid[zz*nx+x]))continue;const nd=distance+step*(dx&&dz?Math.SQRT2:1);if(nd<distances[k]){distances[k]=nd;push([nd,k]);}}}
  const nav={minX,minZ,step,nx,nz,distances,valid};navigationCache.set(hole,nav);return nav;
}
function routeDistance(hole:Hole,nav:Navigation,p:V2){
  const ix=Math.round((p.x-nav.minX)/nav.step),iz=Math.round((p.z-nav.minZ)/nav.step);
  let best=Infinity;
  for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){const x=ix+dx,z=iz+dz;if(x<0||z<0||x>=nav.nx||z>=nav.nz)continue;const dist=nav.distances[z*nav.nx+x];if(Number.isFinite(dist))best=Math.min(best,dist+Math.hypot(p.x-nav.minX-x*nav.step,p.z-nav.minZ-z*nav.step));}
  return best;
}
function shotCost(hole:Hole,nav:Navigation,initial:Ball,result:ShotResult){
  if(result.ball.sunk)return -1000+result.duration*0.02;
  if(result.ball.hazard)return 10000;
  const d=routeDistance(hole,nav,result.ball);
  const h=sampleHeight(hole,result.ball.x,result.ball.z);
  if(h===null||!Number.isFinite(d))return 10000;
  let cost=d+result.duration*0.018;
  if(Math.hypot(result.ball.x-initial.x,result.ball.z-initial.z)<0.15)cost+=3;
  if(hole.sand.some(r=>contains(r,result.ball.x,result.ball.z)))cost+=0.3;
  return cost;
}
/** Simulation-based search sees course geometry only. Same physical shots as every human. */
export function planShot(hole:Hole,ball:Ball,difficulty:number,time=0,random:()=>number=Math.random):ShotPlan{
  const level=clamp(Math.round(difficulty),0,4),nav=navigation(hole);
  const targetPoints:V2[]=[hole.cup];
  const initialDistance=routeDistance(hole,nav,ball);
  for(const p of hole.waypoints)if(clearRoute(hole,ball,p)&&routeDistance(hole,nav,p)<initialDistance-0.5)targetPoints.push(p);
  // Visible navigation points find routes round barriers rather than repeatedly firing at them.
  const candidates: {p:V2;d:number}[]=[];
  for(let z=0;z<nav.nz;z+=2)for(let x=0;x<nav.nx;x+=2){const index=z*nav.nx+x,d=nav.distances[index];if(d>=initialDistance-0.7||!nav.valid[index])continue;const p={x:nav.minX+x*nav.step,z:nav.minZ+z*nav.step};const distance=Math.hypot(p.x-ball.x,p.z-ball.z);if(distance>1.5&&distance<14)candidates.push({p,d});}
  candidates.sort((a,b)=>a.d-b.d);
  for(const c of candidates){if(targetPoints.length>=7)break;if(targetPoints.some(p=>Math.hypot(p.x-c.p.x,p.z-c.p.z)<1.5))continue;if(clearRoute(hole,ball,c.p))targetPoints.push(c.p);}
  let best:ShotPlan={angle:Math.atan2(hole.cup.x-ball.x,hole.cup.z-ball.z),power:0.45,wait:0},bestCost=Infinity;
  const tryShot=(angle:number,power:number,wait=0)=>{power=clamp(power,0.025,1);const result=simulateShot(hole,ball,angle,power,time+wait,false);const cost=shotCost(hole,nav,ball,result)+wait*0.03;if(cost<bestCost){bestCost=cost;best={angle,power,wait};}return cost;};
  const angleOffsets=level>2?[-0.1,-0.045,0,0.045,0.1]:[-0.08,0,0.08];
  for(const target of targetPoints){
    const angle=Math.atan2(target.x-ball.x,target.z-ball.z),distance=Math.hypot(target.x-ball.x,target.z-ball.z);
    const rise=(sampleHeight(hole,target.x,target.z)||0)-(sampleHeight(hole,ball.x,ball.z)||0);
    const ideal=Math.sqrt(Math.max(0.2,2*ROLL_FRICTION*distance+2*GRAVITY*rise))/MAX_SHOT_SPEED;
    for(const offset of angleOffsets)for(const mult of [0.83,0.95,1.06,1.2])tryShot(angle+offset,ideal*mult);
  }
  // A broad sweep includes deliberate rail banks and escape shots.
  const angles=level>=3?28:16;
  for(let i=0;i<angles;i++)for(const power of [0.25,0.44,0.65,0.85])tryShot(i*Math.PI*2/angles,power);
  if(level>=2){
    for(let pass=0;pass<3;pass++){
      const base={...best},da=[0.055,0.018,0.006][pass],dp=[0.04,0.014,0.0045][pass];
      for(const ao of [-da,0,da])for(const po of [-dp,0,dp])tryShot(base.angle+ao,base.power+po,base.wait);
    }
    if(hole.obstacles.some(o=>o.type==='rotor'||o.type==='gate'||o.type==='windmill')){const base={...best};for(const wait of [0.35,0.7,1.1,1.6,2.1])tryShot(base.angle,base.power,wait);}
  }
  const angleError=[0.14,0.075,0.035,0.012,0][level],powerError=[0.15,0.09,0.045,0.018,0][level];
  return {angle:best.angle+(random()*2-1)*angleError,power:clamp(best.power*(1+(random()*2-1)*powerError),0.025,1),wait:level>=2?best.wait:0};
}
