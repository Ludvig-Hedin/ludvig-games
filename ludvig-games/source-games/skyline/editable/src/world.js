/* Procedural archipelago, airfield and ambient traffic. All assets are original geometry. */
(function(){'use strict';const S=window.SKY,{Geometry:G,matrix:M,heightAt:H,random,clamp,lerp,color}=S;
function airplane(accent=0xe36c42){
 const g=new G(),white=0xf4efdc,dark=0x243e48,metal=0x6d7b7b;
 g.sphere(0,0,.2,.78,.69,4.2,white,14,8);
 g.cylinder(0,0,-3.1,.73,.67,1.85,accent,12,0,Math.PI/2);
 g.sphere(0,0,-4.06,.57,.57,.78,accent,12,6);
 g.sphere(0,.65,-.6,.67,.55,1.5,0x2d5665,12,6);
 g.box(0,.69,-.10,1.42,.11,.18,white);g.box(0,.68,-1.5,1.35,.10,.16,white);
 // Swept trapezoidal high wing, tapered tailplane and contrasting wing tips.
 for(const sign of[-1,1]){
  const x=sign*7.2,r=sign*.6;const a=[r,.30,-1.4],b=[x,.30,-.7],c=[x,.30,1.0],d=[r,.30,1.55];
  g.quad(a,d,c,b,white);g.quad([r,.13,-1.4],[x,.13,-.7],b,a,white);g.quad(d,c,[x,.13,1],[r,.13,1.55],accent);
  g.quad([sign*5.9,.32,-.82],[sign*5.9,.32,1.13],[x,.32,1],[x,.32,-.7],accent);
  g.box(sign*5.4,.33,.25,.14,.06,1.7,white);
  g.box(sign*2.08,-.82,.2,.12,1.55,.12,metal);
  g.cylinder(sign*2.08,-1.31,.15,.38,.38,.25,dark,10,0,0,Math.PI/2);
  g.box(sign*2,-.04,.50,4.1,.05,.08,metal);
  g.quad([0,.2,2.6],[0,.2,4.1],[sign*2.6,.2,4],[sign*2.4,.2,3.25],white);
  g.box(sign*2.28,.20,3.68,.48,.10,.6,accent);
 }
 g.quad([0,.2,2.75],[0,2.3,3.7],[0,2.1,4.25],[0,.2,4.05],accent);
 g.quad([.025,.2,2.75],[.025,.2,4.05],[.025,2.1,4.25],[.025,2.3,3.7],accent);
 g.box(0,-.67,3.52,.12,.80,.16,metal);g.cylinder(0,-1.03,3.5,.22,.22,.2,dark,9,0,0,Math.PI/2);
 g.box(.77,-.08,.9,.025,.16,2.6,accent);g.box(-.77,-.08,.9,.025,.16,2.6,accent);
 // Navigation lights.
 g.sphere(-7.22,.29,.2,.10,.10,.10,0xef5953,6,4);g.sphere(7.22,.29,.2,.10,.10,.10,0x74d7b7,6,4);
 return g;
}
function propeller(){const g=new G();g.box(0,0,-4.85,.19,4.5,.09,0x24313a);g.box(0,0,-4.85,4.5,.19,.09,0x24313a);g.sphere(0,0,-4.96,.25,.25,.37,0xf4efdc,10,5);return g;}
function house(g,x,z,w,d,h,shade=0xe9dfc2,angle=0,ground=null){
 const y=ground===null?H(x,z):ground;const b=new G();b.box(0,h/2,0,w,h,d,shade);const roof=0xb87553;
 b.triangle([-w/2,h,-d/2],[w/2,h,-d/2],[0,h+w*.23,-d/2],roof);
 b.triangle([-w/2,h,d/2],[0,h+w*.23,d/2],[w/2,h,d/2],roof);
 b.quad([-w/2,h,-d/2],[0,h+w*.23,-d/2],[0,h+w*.23,d/2],[-w/2,h,d/2],0xd08c62);
 b.quad([w/2,h,-d/2],[w/2,h,d/2],[0,h+w*.23,d/2],[0,h+w*.23,-d/2],roof);
 for(const front of[-1,1])for(let k=-1;k<=1;k++)b.box(k*w*.27,h*.63,front*(d/2+.06),w*.12,h*.20,.12,0x54716e);
 b.box(0,h*.22,-d/2-.08,w*.14,h*.43,.16,0x36575b);b.box(w*.23,h+w*.17,d*.2,1.8,3.8,1.8,0xd7ceb8);
 g.merge(b,M(x,y,z,angle));return{x,z,y,w,d,h:h+w*.23};
}
function makeWorld(renderer){
 const rand=random(8721),world={solids:[],planes:[],vehicles:[],boats:[],turbines:[],balloons:[],birds:[],beacons:[],time:0};
 const ground=new G(),n=S.WORLD.steps+1,sz=S.WORLD.size/S.WORLD.steps,half=S.WORLD.size/2;
 function landColor(h,x,z){let c;if(h<2)c=[.70,.71,.54];else if(h<8)c=[.76,.76,.57];else if(h<60)c=[.45,.59,.39];else if(h<150)c=[.37,.48,.35];else c=[.49,.52,.43];
  const v=(Math.sin(x*.017)*Math.cos(z*.019)+Math.sin((x+z)*.035))*.022;return c.map(k=>k+v);}
 for(let z=0;z<S.WORLD.steps;z++)for(let x=0;x<S.WORLD.steps;x++){
  const xx=x*sz-half,zz=z*sz-half,a=[xx,S.terrain[z*n+x],zz],b=[xx+sz,S.terrain[z*n+x+1],zz],c=[xx,S.terrain[(z+1)*n+x],zz+sz],d=[xx+sz,S.terrain[(z+1)*n+x+1],zz+sz];
  if(Math.max(a[1],b[1],c[1],d[1])<-.5)continue;
  ground.triangle(a,c,b,landColor((a[1]+b[1]+c[1])/3,xx,zz));ground.triangle(b,c,d,landColor((b[1]+c[1]+d[1])/3,xx+sz/2,zz+sz/2));
 }
 world.terrainMesh=renderer.mesh(ground);
 const ocean=new G();ocean.quad([-12000,-.15,-12000],[-12000,-.15,12000],[12000,-.15,12000],[12000,-.15,-12000],0x44959e);world.oceanMesh=renderer.mesh(ocean,1);
 const infrastructure=new G(),details=new G(),flora=new G();
 // Airfield: the runway collider and this surface both use y=15.
 infrastructure.box(0,14.75,-40,48,.50,980,0x424d50);
 infrastructure.box(61,14.68,240,90,.4,165,0x727b70);
 for(const side of[-1,1])infrastructure.box(side*22,15.045,-40,.65,.05,954,0xe3e5d7);
 for(let z=-475;z<430;z+=49)infrastructure.box(0,15.08,z,1.35,.055,22,0xebe9d7);
 for(const end of[-1,1])for(let i=-4;i<=4;i++)if(i)infrastructure.box(i*4,15.09,-40+end*446,2,.055,28,0xe9e6d4);
 for(let z=-515;z<=435;z+=43)for(const x of[-26,26]){
  infrastructure.box(x,15.22,z,.55,.62,.55,0xc8bfa5);details.sphere(x,15.59,z,.4,.3,.4,z< -470?0x94efcf:0xffdfa4,6,4);
 }
 // Runway numerals made from thin geometric strokes, not web fonts or textures.
 for(const z of[-431,346]){infrastructure.box(-4,15.12,z,1,.08,15,0xe8e7d5);infrastructure.box(4,15.12,z-7,7,.08,1,0xe8e7d5);infrastructure.box(1,15.12,z,1,.08,14,0xe8e7d5);infrastructure.box(7,15.12,z,1,.08,14,0xe8e7d5);infrastructure.box(4,15.12,z+7,7,.08,1,0xe8e7d5);}
 const terminal=house(infrastructure,94,287,38,21,10,0xece6cd,0,14.8);world.solids.push(terminal);
 for(let i=0;i<3;i++){
  const x=95,z=210-i*68;const y=H(x,z);infrastructure.box(x,y+7,z,42,14,40,0xc9d1c4);infrastructure.box(x-21.08,y+5.9,z,.15,11.8,33,0x637778);infrastructure.box(x,y+14.5,z,44,1.5,43,0x6a8b87);
  world.solids.push({x,z,y,w:44,d:43,h:16});
 }
 // Control tower, antennas, windsock and apron signs.
 infrastructure.box(63,28,350,7,26,7,0xf0ead3);infrastructure.box(63,42.6,350,13,5.5,11,0x4c767d);infrastructure.box(63,46,350,15,1.4,13,0xdce1cf);infrastructure.box(63,50.5,350,.3,8,.3,0x506e6d);
 world.solids.push({x:63,z:350,y:15,w:15,d:13,h:36});
 infrastructure.cylinder(-48,20,328,.3,.22,11,0xe9e5cf,8);world.sock={x:-48,y:25.6,z:328};
 const sock=new G();sock.cylinder(0,0,-2.5,1.2,.52,5,0xdf764e,10,0,Math.PI/2);sock.cylinder(0,0,-1.7,.86,.8,.65,0xffefd5,10,0,Math.PI/2);world.sockMesh=renderer.mesh(sock);
 // Coastal village laid out in streets with pocket gardens and a town square.
 for(let row=0;row<5;row++){
  const z=100+row*64;infrastructure.box(322,H(322,z)+.08,z,285,.18,8,0x9caa91);
  for(let col=0;col<5;col++){
   const x=197+col*60,zz=z+20+(rand()-.5)*4;if(x<225&&z<200)continue;
   const h=8+rand()*12,w=16+rand()*9,d=18+rand()*9;
   const home=house(infrastructure,x,zz,w,d,h,[0xece0bc,0xd5d8c2,0xdccbb2,0xe7d7c5][Math.floor(rand()*4)]);
   world.solids.push(home);
   flora.disk(x,H(x,zz)+.08,zz,w*.76,d*.68,0x354c40,.18);
  }
 }
 infrastructure.box(315,H(315,240)+.09,240,12,.22,337,0xb2b8a2);
 // Village fountain and four cafe awnings.
 infrastructure.cylinder(315,24,260,9,9,1.6,0xc2c6ad,16);details.disk(315,24.9,260,7.5,7.5,0x559da0);infrastructure.cylinder(315,27,260,1.8,1.1,5,0xd7d5be,10);
 for(const[x,z]of[[264,266],[372,210],[432,329],[252,395]]){const y=H(x,z);infrastructure.box(x,y+3,z,14,.5,8,0xc77652);infrastructure.box(x-6,y+1.5,z,.3,3,.3,0xece1c7);infrastructure.box(x+6,y+1.5,z,.3,3,.3,0xece1c7);}
 // Forests: batched triangles keep hundreds of trees inexpensive.
 for(let i=0;i<1450;i++){
  let x=(rand()-.5)*2220,z=(rand()-.5)*2580,y=H(x,z);
  if(y<8||y>194||(Math.abs(x)<155&&Math.abs(z+40)<635)||(x>150&&x<520&&z>60&&z<455))continue;
  const h=5+rand()*13,r=2.6+rand()*2.7;
  flora.cylinder(x,y+h*.28,z,.48,.30,h*.57,0x76694d,5);
  const col=[0x49683d,0x3d6040,0x567542,0x68844c][Math.floor(rand()*4)];
  flora.cylinder(x,y+h*.65,z,r,0,h*.84,col,7);flora.cylinder(x,y+h*.99,z,r*.68,0,h*.65,col,7);
 }
 // Rock outcrops and shoreline stones.
 for(let i=0;i<145;i++){
  const a=rand()*S.TAU,r=830+rand()*400,x=Math.sin(a)*r,z=Math.cos(a)*r,y=H(x,z);if(y<1||y>36)continue;
  flora.sphere(x,y+1,z,3+rand()*9,2+rand()*6,3+rand()*8,0x9b9e82,6,4);
 }
 // Lighthouse on western headland.
 const lx=-973,lz=266,ly=Math.max(3,H(lx,lz));
 infrastructure.cylinder(lx,ly+20,lz,6.5,4.8,40,0xeee5cc,14);infrastructure.cylinder(lx,ly+27,lz,5.5,5.0,7,0xd77855,14);
 infrastructure.cylinder(lx,ly+42,lz,7,7,2,0x435960,14);infrastructure.cylinder(lx,ly+46,lz,5,5,6,0xdde1c4,12);infrastructure.cylinder(lx,ly+50,lz,7,0,5,0xd0714d,14);
 world.solids.push({x:lx,z:lz,y:ly,w:14,d:14,h:53});world.lighthouse={x:lx,y:ly+46,z:lz};
 const beam=new G();beam.triangle([0,0,0],[-8,0,-95],[8,0,-95],0xffedb6,.11);world.beamMesh=renderer.mesh(beam,2);
 // Hilltop wind farm.
 const blades=new G();for(let i=0;i<3;i++){const blade=new G().quad([0,-1,0],[2,15,0],[.6,29,0],[-.4,4,0],0xf3f1df);blades.merge(blade,M(0,0,0,0,0,i*S.TAU/3));}blades.sphere(0,0,-.3,1.6,1.6,2,0xe8ecdb,8,6);world.bladesMesh=renderer.mesh(blades);
 for(const[x,z]of[[715,-330],[770,-160],[825,20]]){const y=H(x,z);infrastructure.cylinder(x,y+34,z,2.6,1.6,68,0xe9e7d5,10);world.turbines.push({x,y:y+68,z});world.solids.push({x,z,y,w:6,d:6,h:70});}
 // Docks on the south coast.
 for(const[x,z]of[[200,1155],[248,1165],[293,1170]]){infrastructure.box(x,3,z,9,3,62,0xb19f76);for(const zz of[-25,25])for(const xx of[-3.5,3.5])infrastructure.cylinder(x+xx,2,z+zz,.45,.45,6,0x7d7d63,7);}
 // Service vehicles stay on their own perimeter road, clear of houses and hangars.
 const roadPoints=[[172,-65],[535,-65],[565,-35],[565,455],[535,485],[172,485],[142,455],[142,-35]];
 const roadLengths=roadPoints.map((a,i)=>{const b=roadPoints[(i+1)%roadPoints.length];return Math.hypot(b[0]-a[0],b[1]-a[1]);}),roadTotal=roadLengths.reduce((a,b)=>a+b,0);
 function roadAt(d){d=((d%roadTotal)+roadTotal)%roadTotal;let i=0;while(d>roadLengths[i]&&i<roadPoints.length-1)d-=roadLengths[i++];const a=roadPoints[i],b=roadPoints[(i+1)%roadPoints.length],t=d/roadLengths[i];return{x:lerp(a[0],b[0],t),z:lerp(a[1],b[1],t),heading:Math.atan2(b[0]-a[0],-(b[1]-a[1]))};}
 for(let d=0;d<roadTotal;d+=7){const a=roadAt(d),b=roadAt(Math.min(roadTotal-.001,d+7)),rx=Math.cos(a.heading)*3.7,rz=Math.sin(a.heading)*3.7;
  const points=[[a.x-rx,a.z-rz],[b.x-rx,b.z-rz],[b.x+rx,b.z+rz],[a.x+rx,a.z+rz]].map(p=>[p[0],H(p[0],p[1])+.22,p[1]]);infrastructure.quad(...points,0x8e9b83);
 }
 world.infrastructure=renderer.mesh(infrastructure);world.flora=renderer.mesh(flora);world.details=renderer.mesh(details,2);
 // Puffy low-poly clouds, packed into a single mesh.
 const clouds=new G();for(let i=0;i<50;i++){const x=(rand()-.5)*5600,z=(rand()-.5)*5600,y=350+rand()*230;for(let j=0;j<4;j++)clouds.sphere(x+j*39,y+rand()*11,z+rand()*15,38+rand()*17,15+rand()*12,26+rand()*22,0xf1f0df,9,6);}world.clouds=renderer.mesh(clouds);
 world.playerMesh=renderer.mesh(airplane());world.propMesh=renderer.mesh(propeller());
 world.npcMeshes=[0xe9cb75,0x729db1,0x94ad87,0xe8e0c8].map(c=>renderer.mesh(airplane(c)));
 // A closer pace aircraft follows the same circuit; the others patrol safe, fixed altitude bands.
 const names=['COAST 02','NOVA 17','ISLAND 04','CLUB 09'];
 for(let i=0;i<4;i++)world.planes.push({name:names[i],x:0,y:0,z:0,heading:0,pitch:0,bank:0,t:i*1.57,nearCooldown:0,index:i});
 const car=new G();car.box(0,1.2,0,3.0,1.5,5.7,0xe4b171);car.box(0,2.22,.4,2.55,1.05,2.5,0x4b666c);for(const x of[-1.6,1.6])for(const z of[-1.9,1.9])car.cylinder(x,.65,z,.65,.65,.38,0x394c4f,8,0,0,Math.PI/2);world.carMesh=renderer.mesh(car);
 for(let i=0;i<7;i++)world.vehicles.push({phase:i/7*S.TAU,x:0,y:0,z:0,heading:0});
 const boat=new G();boat.sphere(0,.5,0,3,1.0,8,0xe8e2c7,10,5);boat.box(0,1.7,0,4,2,6,0xede9d3);boat.box(0,2.25,-2.7,3.5,1.1,.1,0x58818a);boat.cylinder(0,5,0,.18,.18,10,0xb3b2a0,7);boat.triangle([0,8.8,0],[0,2,0],[0,2,6.5],0xf9f0d8);world.boatMesh=renderer.mesh(boat);
 for(let i=0;i<6;i++)world.boats.push({phase:i*S.TAU/6,x:0,y:0,z:0,heading:0});
 const wake=new G();wake.triangle([-2,0,4],[0,0,3],[-5,0,34],0xe7f7e5,.26);wake.triangle([2,0,4],[5,0,34],[0,0,3],0xe7f7e5,.26);world.wakeMesh=renderer.mesh(wake,2);
 for(const p of[[480,330,-300],[-580,300,350],[900,420,550]])world.balloons.push({x:p[0],y:p[1],z:p[2]});
 const balloon=new G();balloon.sphere(0,0,0,13,17,13,0xe7c494,16,9);balloon.cylinder(0,-12,0,2.7,7.6,14,0xd47e57,12);balloon.box(0,-24,0,4,3,4,0x9d8664);for(const x of[-1.7,1.7])balloon.box(x,-20,0,.11,5,.11,0x525d54);world.balloonMesh=renderer.mesh(balloon);
 const gull=new G();gull.triangle([0,0,-.5],[-2.8,.45,.35],[-.8,-.02,.5],0xe9edda);gull.triangle([0,0,-.5],[.8,-.02,.5],[2.8,.45,.35],0xe9edda);world.gullMesh=renderer.mesh(gull);
 for(let i=0;i<12;i++)world.birds.push({phase:rand()*S.TAU,rx:200+rand()*190,rz:160+rand()*200,h:140+rand()*50});
 const active=new G().torus(38,1.0,0xffd084),future=new G().torus(38,.55,0xe4ead4),decor=new G().torus(42,.25,0xffdc9e,48,5,0,Math.PI*.65);
 world.gateActive=renderer.mesh(active,2);world.gateFuture=renderer.mesh(future,2);world.gateDecor=renderer.mesh(decor,2);
 world.shadow=renderer.mesh(new G().disk(0,0,0,6.8,4.3,0x183b3c,.25));
 const puff=new G().sphere(0,0,0,1,1,1,0xffda93,6,4);world.particleMesh=renderer.mesh(puff,2);
 world.update=function(dt,time){
  this.time=time;
  for(const p of this.planes){
   const old={x:p.x,y:p.y,z:p.z};
   if(p.index===0){const t=(time*54+135)/380,idx=Math.floor(t)%S.route.length,next=(idx+1)%S.route.length,u=t-Math.floor(t),a=S.route[idx],b=S.route[next];
    p.x=lerp(a.x,b.x,u);p.z=lerp(a.z,b.z,u);p.y=lerp(a.y,b.y,u)+22;p.heading=Math.atan2(b.x-a.x,-(b.z-a.z));p.pitch=Math.atan2(b.y-a.y,Math.hypot(b.x-a.x,b.z-a.z));p.bank=0;
   }else{const a=time*(.052+p.index*.009)+p.t,rx=620+p.index*125,rz=670+p.index*110;p.x=Math.sin(a)*rx;p.z=Math.cos(a)*rz;p.y=220+p.index*32+Math.sin(a*2)*18;p.heading=Math.atan2(Math.cos(a)*rx,Math.sin(a)*rz);p.bank=-.24;p.pitch=Math.cos(a*2)*.04;}
   p.y=Math.max(p.y,H(p.x,p.z)+52);p.nearCooldown=Math.max(0,p.nearCooldown-dt);
  }
  for(const c of this.vehicles){const a=roadAt(time*10+c.phase/S.TAU*roadTotal);c.x=a.x;c.z=a.z;c.y=H(c.x,c.z)+.30;c.heading=a.heading;}
  for(const b of this.boats){const a=time*.009+b.phase;b.x=Math.sin(a)*1330;b.z=Math.cos(a)*1500;b.y=.3+Math.sin(time*1.4+b.phase)*.12;b.heading=Math.atan2(Math.cos(a)*1330,Math.sin(a)*1500);}
 };
 world.checkCollision=function(s){
  // Ground taxiing also respects buildings; the runway itself stays unobstructed.
  // Broad phase first; only nearby building/mast bounds are examined in detail.
  for(const b of this.solids){if(Math.abs(s.x-b.x)<b.w/2+1.5&&Math.abs(s.z-b.z)<b.d/2+2&&s.y<b.y+b.h+1&&s.y>b.y)return 'Obstacle strike. Watch the rooftops and towers.';}
  for(const p of this.planes)if(Math.hypot(s.x-p.x,s.y-p.y,s.z-p.z)<6)return 'Mid-air collision. Give the other pilots a little room.';
  return null;
 };
 world.draw=function(r,flight,game){
  const time=this.time;r.draw(this.oceanMesh);r.draw(this.terrainMesh);r.draw(this.infrastructure);r.draw(this.flora);r.draw(this.details);r.draw(this.clouds);
  r.draw(this.sockMesh,M(this.sock.x,this.sock.y,this.sock.z,-1.1,.06*Math.sin(time),0));
  for(const t of this.turbines)r.draw(this.bladesMesh,M(t.x,t.y,t.z,0,0,time*.65));
  r.draw(this.beamMesh,M(this.lighthouse.x,this.lighthouse.y,this.lighthouse.z,time*.21),.5);
  for(const c of this.vehicles)r.draw(this.carMesh,M(c.x,c.y,c.z,c.heading));
  for(const b of this.boats){r.draw(this.boatMesh,M(b.x,b.y,b.z,b.heading,0,Math.sin(time+b.phase)*.03));r.draw(this.wakeMesh,M(b.x,.03,b.z,b.heading),.75);}
  for(let i=0;i<this.balloons.length;i++){const b=this.balloons[i];r.draw(this.balloonMesh,M(b.x+Math.sin(time*.011+i)*12,b.y+Math.sin(time*.15+i)*3,b.z,0,0,Math.sin(time*.3+i)*.02));}
  for(const b of this.birds){const a=time*.17+b.phase;r.draw(this.gullMesh,M(-500+Math.sin(a)*b.rx,b.h+Math.sin(time*3+b.phase)*.3,400+Math.cos(a)*b.rz,a,0,Math.sin(time*4+b.phase)*.2));}
  for(const p of this.planes){r.draw(this.npcMeshes[p.index],M(p.x,p.y,p.z,p.heading,p.pitch,p.bank));r.draw(this.propMesh,S.multiply(M(p.x,p.y,p.z,p.heading,p.pitch,p.bank),M(0,0,0,0,0,time*65)));}
  // Two parked planes reinforce the airfield's scale.
  r.draw(this.npcMeshes[1],M(54,16.5,256,-Math.PI/2));r.draw(this.npcMeshes[2],M(61,16.5,181,-Math.PI/2));
  if(game.activity!=='landing')for(let j=0;j<4;j++){
   const index=(game.gate+j)%S.route.length,g=S.route[index];
   r.draw(j===0?this.gateActive:this.gateFuture,M(g.x,g.y,g.z,g.angle),j===0?1:.54);
   if(j===0)r.draw(this.gateDecor,M(g.x,g.y,g.z,g.angle,0,time*.3),.65);
  }
  const shadowY=S.groundAt(flight.x,flight.z)+.08,agl=Math.max(0,flight.y-shadowY);
  if(agl<150)r.draw(this.shadow,M(flight.x+agl*.3,shadowY,flight.z+agl*.12,flight.heading,0,0,1+agl*.012),clamp(1-agl/160,0,.8));
  if(game.camera!==1){r.draw(this.playerMesh,M(flight.x,flight.y,flight.z,flight.heading,flight.pitch,flight.bank));r.draw(this.propMesh,S.multiply(M(flight.x,flight.y,flight.z,flight.heading,flight.pitch,flight.bank),M(0,0,0,0,0,time*(35+flight.throttle*85))));}
  else{
   // Cockpit view: the nose remains visible below the horizon without blocking navigation.
   r.draw(this.playerMesh,M(flight.x,flight.y,flight.z,flight.heading,flight.pitch,flight.bank));
  }
  for(const p of game.particles){r.draw(this.particleMesh,M(p.x,p.y,p.z,0,0,0,p.size),p.life/p.max);}
 };
 return world;
}
Object.assign(S,{makeWorld,airplane,propeller});
})();
