/* EPOCH — cinematic orthographic Three.js battlefield and effects. */
(function(root){
'use strict';
const T=root.THREE,M=root.EpochModels,clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
function gradientTexture(type){const c=document.createElement('canvas');c.width=c.height=128;const x=c.getContext('2d'),gr=x.createRadialGradient(64,64,0,64,64,64);if(type==='sun'){gr.addColorStop(0,'rgba(255,249,209,1)');gr.addColorStop(.26,'rgba(255,243,197,1)');gr.addColorStop(.30,'rgba(255,237,178,.4)');gr.addColorStop(.64,'rgba(255,225,159,.12)');gr.addColorStop(1,'rgba(255,229,167,0)');}else{gr.addColorStop(0,'rgba(255,255,255,.9)');gr.addColorStop(.35,'rgba(255,255,255,.6)');gr.addColorStop(1,'rgba(255,255,255,0)');}x.fillStyle=gr;x.fillRect(0,0,128,128);const tx=new T.CanvasTexture(c);return tx;}
class Battlefield {
 constructor(canvas,fxCanvas){
  this.canvas=canvas;this.fxCanvas=fxCanvas;this.ctx=fxCanvas.getContext('2d');this.reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;this.models=new Map();this.bases=[];this.turrets=[[],[]];this.projectiles=[];this.incoming=[];this.particles=[];this.rings=[];this.smoke=[];this.floating=[];this.corpses=[];this.shake=0;this.worldTime=0;this.seed=73179;this.aimX=6;this.aiming=false;this.cameraOffset=0;this.lastSmoke=0;
  this.renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:true,powerPreference:'high-performance'});this.renderer.setClearColor(0x000000,0);this.renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.65));this.renderer.outputEncoding=T.sRGBEncoding;this.renderer.toneMapping=T.ACESFilmicToneMapping;this.renderer.toneMappingExposure=.97;this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=T.PCFSoftShadowMap;
  this.scene=new T.Scene();this.scene.fog=new T.Fog(new T.Color(0xc2cbb0).convertSRGBToLinear(),49,113);this.camera=new T.OrthographicCamera(-25,25,15,-15,.1,180);this.camera.position.set(0,14,32);this.target=new T.Vector3(0,2.6,0);this.camera.lookAt(this.target);
  this.scene.add(new T.HemisphereLight(0xe1e6cc,0x536345,.82));this.sun=new T.DirectionalLight(0xffdb9e,1.65);this.sun.position.set(-23,30,20);this.sun.castShadow=true;this.sun.shadow.mapSize.set(2048,2048);Object.assign(this.sun.shadow.camera,{left:-32,right:32,top:20,bottom:-18,near:1,far:90});this.sun.shadow.bias=-.0005;this.sun.shadow.normalBias=.07;this.sun.shadow.radius=2;this.sun.target.position.set(0,0,0);this.scene.add(this.sun,this.sun.target);const fill=new T.DirectionalLight(0xbbdacb,.40);fill.position.set(16,9,-15);this.scene.add(fill);
  this.softTexture=gradientTexture('soft');this.sunTexture=gradientTexture('sun');this.createWorld();this.createEffects();this.resize();
 }
 rand(){this.seed=(Math.imul(1664525,this.seed)+1013904223)>>>0;return this.seed/4294967296;}
 noise(x,z){return Math.sin(x*.52+z*.4)*.15+Math.sin(x*1.13-z*.33)*.11;}
 height(x,z){if(z>-2.0&&z<2.7)return-.04;const back=Math.max(0,-z-3);return Math.max(-.05,Math.sin(x*.17+z*.23)*.35+back*.055+Math.sin(x*.33-z*.14)*back*.032);}
 createWorld(){
  document.body.style.background='linear-gradient(180deg,#658977 0%,#b9c9a6 30%,#e3d9ad 64%,#bdc1a0 100%)';
  const groundG=new T.PlaneGeometry(68,36,110,56);groundG.rotateX(-Math.PI/2);groundG.translate(0,-.02,-10);const pos=groundG.attributes.position;
  for(let i=0;i<pos.count;i++){const x=pos.getX(i),z=pos.getZ(i);pos.setY(i,this.height(x,z)+(Math.abs(z)<2?.006:this.noise(x,z)*.30));}groundG.computeVertexNormals();const flat=groundG.toNonIndexed(),cols=[],p=flat.attributes.position;
  const grass=new T.Color(0x839854).convertSRGBToLinear(),path=new T.Color(0xbda478).convertSRGBToLinear(),dark=new T.Color(0x526e43).convertSRGBToLinear();
  for(let i=0;i<p.count;i+=3){let z=0,x=0;for(let j=0;j<3;j++){z+=p.getZ(i+j)/3;x+=p.getX(i+j)/3;}const lane=Math.max(0,1-Math.abs(z-.05)/(1.44+Math.sin(x*.45)*.10));const co=grass.clone().lerp(path,Math.pow(lane,.3));co.lerp(dark,Math.max(0,Math.min(1,(-z-4)/33))*.46);co.multiplyScalar(.94+this.rand()*.1);for(let j=0;j<3;j++)cols.push(co.r,co.g,co.b);}
  flat.setAttribute('color',new T.Float32BufferAttribute(cols,3));const ground=new T.Mesh(flat,new T.MeshStandardMaterial({vertexColors:true,roughness:1,flatShading:true}));ground.receiveShadow=true;this.scene.add(ground);
  const stat=new T.Group(),hills=new T.Group();
  // Faceted layered mountains; a soft atmospheric horizon behind the playable lane.
  for(let layer=0;layer<3;layer++)for(let i=0;i<13;i++){const x=-59+i*9+this.rand()*5,z=-38-layer*13,h=3.0+this.rand()*7.5;const mountain=M.part(hills,'cone',[0x78917b,0x8f9f80,0xa9b292][layer],x,h*.42-1,z,6+this.rand()*6,h,5+this.rand()*5);mountain.rotation.y=this.rand()*5;mountain.scale.x*=1.35;}
  const hmesh=M.mergeStatic(hills);hmesh.castShadow=false;hmesh.receiveShadow=false;hmesh.position.y=-7.5;this.scene.add(hmesh);
  // Layered, hand-cut sandstone edge gives the field real depth, not a flat canvas.
  const cliffP=[],cliffC=[],cliffN=[];
  for(let i=0;i<48;i++){const x=-34+i*68/48,xx=x+68/48,top=.02,bottom=-3.35-this.rand()*.63,z=5.9;const pts=[[x,top,z],[x,bottom,z+.20],[xx,bottom+.10,z+.16],[x,top,z],[xx,bottom+.10,z+.16],[xx,top,z]];const co=new T.Color(0x85734f).convertSRGBToLinear().multiplyScalar(.78+this.rand()*.23);pts.forEach(q=>{cliffP.push(...q);cliffC.push(co.r,co.g,co.b);cliffN.push(0,.05,1);});}
  const cg=new T.BufferGeometry();cg.setAttribute('position',new T.Float32BufferAttribute(cliffP,3));cg.setAttribute('color',new T.Float32BufferAttribute(cliffC,3));cg.setAttribute('normal',new T.Float32BufferAttribute(cliffN,3));this.scene.add(new T.Mesh(cg,new T.MeshStandardMaterial({vertexColors:true,roughness:1,flatShading:true})));
  for(let i=0;i<100;i++){const x=-32+this.rand()*64,z=2.7+this.rand()*3.0,s=.11+this.rand()*.35;M.part(stat,'rock',[0xa09e75,0x939773,0xb3aa7d][i%3],x,this.height(x,z)+s*.24,z,s,s*.55,s*.64,this.rand());}
  // Loose road pebbles, tufts, and flowering ground cover. All baked into one draw call.
  for(let i=0;i<520;i++){const x=-31+this.rand()*62,z=-15+this.rand()*20;if(Math.abs(z)<1.65||((Math.abs(x)>16&&Math.abs(x)<23)&&Math.abs(z)<3))continue;const y=this.height(x,z),s=.10+this.rand()*.28;
   if(i%6===0){M.part(stat,'rock',i%12?0x959b73:0xbbb28b,x,y+.10,z,s*1.8,s*.65,s);continue;}
   for(let j=0;j<3;j++){M.part(stat,'cone',[0x72814c,0x8b9357,0xa4a571][i%3],x+(j-1)*.09,y+s*.37,z+j*.035,.041,s+.07,.031,(j-1)*.27);}
   if(i%17===0)M.part(stat,'ball',0xe2cca0,x,y+s*.9,z,.055,.035,.055);
  }
  const treePoints=[[-27,-7,4.5],[-22,-10,5.3],[-17,-7,3.9],[-11,-11,4.2],[-6,-12,3.1],[3,-11,3.7],[10,-9,4.8],[15,-12,4.3],[22,-8,5.7],[28,-5,4.0],[-30,3,3.4],[30,3,3.9]];
  for(let i=0;i<treePoints.length;i++){const [x,z,h]=treePoints[i],y=this.height(x,z);M.segment(stat,[x,y,z],[x+.10,y+h*.8,z],.13,0x6c6748);
   if(i%3===0){for(let j=0;j<3;j++)M.part(stat,'cone',[0x5b7955,0x6e8c5e,0x88a071][j],x,y+h*(.53+j*.17),z,h*(.32-j*.065),h*.50,h*(.32-j*.065));}
   else{for(let j=0;j<5;j++){const a=j/5*Math.PI*2,cx=x+Math.cos(a)*h*.21,cz=z+Math.sin(a)*h*.16,cy=y+h*.78+this.rand()*h*.15;M.segment(stat,[x,y+h*.48,z],[cx,cy-.20,cz],.063,0x74734e);M.part(stat,'round',[0x8c9d69,0xa1ab75,0x779166,0xb2b174][(i+j)%4],cx,cy,cz,h*.3,h*.17,h*.26,this.rand()*.3);}}
  }
  // Quiet ruins in the valley tell the story before the fighting starts.
  for(const x of [-.92,1.08]){M.part(stat,'box',0x9da486,x+2,1.26,-8.1,.55,2.3,.57,.045*x);M.part(stat,'box',0xc0b999,x+2,2.5,-8.1,.72,.25,.7);}
  M.part(stat,'box',0xb9b495,2.09,2.85,-8.1,2.50,.58,.64,-.12);M.part(stat,'rock',0xa5a386,3.7,.59,-7.8,.64,.40,.58);M.part(stat,'round',0x7d955e,1.0,.45,-7.4,.58,.34,.5);
  // Weathered trail edging and bone-dry tufts in the foreground.
  for(let i=0;i<70;i++){const x=-29+this.rand()*58,z=(i%2?1:-1)*(1.7+this.rand()*.22);M.part(stat,'rock',0xa5a07d,x,.035,z,.055+this.rand()*.08,.045,.08);}
  this.scene.add(M.mergeStatic(stat));
  const sun=new T.Sprite(new T.SpriteMaterial({map:this.sunTexture,color:0xffffff,transparent:true,depthWrite:false,fog:false}));sun.position.set(-13,0,-42);sun.scale.set(10,10,1);this.scene.add(sun);
  this.clouds=[];for(let i=0;i<11;i++){const cloud=new T.Sprite(new T.SpriteMaterial({map:this.softTexture,color:0xf9edd0,opacity:.12+this.rand()*.14,transparent:true,depthWrite:false,fog:false}));cloud.position.set(-47+this.rand()*94,-3+this.rand()*5,-33-this.rand()*10);cloud.scale.set(7+this.rand()*14,.7+this.rand()*1.6,1);this.scene.add(cloud);this.clouds.push(cloud);}
  this.birds=[];for(let i=0;i<5;i++){const geo=new T.BufferGeometry().setFromPoints([new T.Vector3(-.20,.12,0),new T.Vector3(0,0,0),new T.Vector3(.2,.12,0)]);const bird=new T.Line(geo,new T.LineBasicMaterial({color:0x4e6851,transparent:true,opacity:.55}));bird.position.set(-15+i*1.0,12+i*.35,-27-i*.7);this.scene.add(bird);this.birds.push(bird);}
  const dustPos=new Float32Array(210*3);for(let i=0;i<210;i++){dustPos[i*3]=-26+this.rand()*52;dustPos[i*3+1]=.4+this.rand()*6;dustPos[i*3+2]=-8+this.rand()*15;}const dg=new T.BufferGeometry();dg.setAttribute('position',new T.BufferAttribute(dustPos,3));this.dust=new T.Points(dg,new T.PointsMaterial({color:0xffecb0,size:.035,transparent:true,opacity:.46,depthWrite:false}));this.scene.add(this.dust);
 }
 createEffects(){
  this.particleMesh=new T.InstancedMesh(new T.IcosahedronGeometry(1,0),new T.MeshStandardMaterial({color:0xffffff,roughness:1,flatShading:true}),650);this.particleMesh.instanceMatrix.setUsage(T.DynamicDrawUsage);this.particleMesh.frustumCulled=false;this.particleMesh.count=0;this.scene.add(this.particleMesh);this.dummy=new T.Object3D();this.pColor=new T.Color();
  const ringGeo=new T.RingGeometry(3.8,4.12,80),ringMat=new T.MeshBasicMaterial({color:0xffe3a6,side:T.DoubleSide,transparent:true,opacity:.88,depthWrite:false,toneMapped:false});this.aimRing=new T.Mesh(ringGeo,ringMat);this.aimRing.rotation.x=-Math.PI/2;this.aimRing.position.y=.055;this.aimRing.visible=false;this.scene.add(this.aimRing);
  // A soft filled area under the ring: at this camera angle a thin ring alone is almost flat on screen.
  this.aimDisc=new T.Mesh(new T.CircleGeometry(3.8,64),new T.MeshBasicMaterial({color:0xfff1cc,side:T.DoubleSide,transparent:true,opacity:.26,depthWrite:false,toneMapped:false}));this.aimDisc.rotation.x=-Math.PI/2;this.aimDisc.position.y=.05;this.aimDisc.visible=false;this.scene.add(this.aimDisc);
  this.aimCenter=new T.Mesh(new T.RingGeometry(.16,.23,24),ringMat);this.aimCenter.rotation.x=-Math.PI/2;this.aimCenter.position.y=.07;this.aimCenter.visible=false;this.scene.add(this.aimCenter);
  this.aimLine=new T.Group();for(let i=0;i<4;i++){const a=i*Math.PI/2;const line=new T.Mesh(new T.BoxGeometry(.045,.025,.54),ringMat);line.position.set(Math.sin(a)*.56,.07,Math.cos(a)*.56);line.rotation.y=a;this.aimLine.add(line);}this.aimLine.visible=false;this.scene.add(this.aimLine);
 }
 clear(){
  for(const m of this.models.values()){this.scene.remove(m);this.releaseUnit(m);}this.models.clear();this.bases.forEach(b=>{if(b)this.scene.remove(b);});this.bases=[];
  this.turrets.forEach(a=>a.forEach(m=>{if(m)this.scene.remove(m);}));this.turrets=[[],[]];
  [...this.projectiles,...this.incoming,...this.corpses].forEach(o=>{if(o.mesh)this.scene.remove(o.mesh);});this.corpses.forEach(o=>this.releaseUnit(o.mesh));this.projectiles=[];this.incoming=[];this.corpses=[];this.particles=[];this.floating=[];
  this.rings.forEach(r=>{this.scene.remove(r.mesh);r.mesh.geometry.dispose();r.mesh.material.dispose();});this.rings=[];this.smoke.forEach(s=>{this.scene.remove(s.mesh);s.mesh.material.dispose();});this.smoke=[];this.shake=0;
 }
 releaseUnit(m){m.userData.materials?.forEach(ma=>ma.dispose());const sh=m.userData.shadow;if(sh){sh.geometry.dispose();sh.material.dispose();}}
 setBase(side,age){if(this.bases[side])this.scene.remove(this.bases[side]);const b=M.base(age,side);b.position.x=side===0?-20:20;this.scene.add(b);this.bases[side]=b;
  b.userData.fires.forEach(f=>{const flame=M.group(f,0,.20,0);for(let i=0;i<3;i++){const mesh=M.part(flame,'cone',i===0?0xffd67f:0xea9b48,(i-1)*.10,.26,0,.13,.56,.12,.12*(i-1));mesh.material=this.basic(i===0?0xffd67f:0xefab57,.88);mesh.castShadow=false;}f.userData.flame=flame;});
 }
 getTurretPos(side,slot){const b=this.bases[side],age=b?.userData.age||0,dir=side===0?1:-1;return new T.Vector3((side===0?-20:20)+[-.95,.07,1.09][slot]*dir,[2.97,3.78,3.36,2.91,4.10][age],[-.22,-.29,-.24][slot]);}
 syncTurrets(teams){teams.forEach(t=>{for(let i=0;i<3;i++){if(this.turrets[t.side][i])this.scene.remove(this.turrets[t.side][i]);this.turrets[t.side][i]=null;const tr=t.turrets[i];if(tr){const m=M.turret(t.age,tr.type,t.side,tr.level);m.position.copy(this.getTurretPos(t.side,i));m.scale.x=t.side===0?1:-1;this.scene.add(m);this.turrets[t.side][i]=m;}}});}
 addUnit(u){if(this.models.has(u.id))return;const m=M.unit(u.age,u.type,u.side);m.position.set(u.x,0,u.z);m.scale.x=u.dir;
  const unique=new Map();m.traverse(o=>{if(o.isMesh){if(!unique.has(o.material)){const c=o.material.clone();c.userData.originalEmissive=c.emissive?.clone();c.userData.originalIntensity=c.emissiveIntensity;unique.set(o.material,c);}o.material=unique.get(o.material);}});m.userData.materials=[...unique.values()];
  const shadow=new T.Mesh(new T.PlaneGeometry(u.type===2?2.5:1.10,u.type===2?1.4:.72),new T.MeshBasicMaterial({map:this.softTexture,color:0x1d3621,transparent:true,opacity:.21,depthWrite:false}));shadow.rotation.x=-Math.PI/2;shadow.position.set(0,.023,0);m.add(shadow);m.userData.shadow=shadow;
  this.models.set(u.id,m);this.scene.add(m);
 }
 burst(x,y,z,count=8,color=0xdbbf87,force=2,size=.075){for(let i=0;i<count;i++){if(this.particles.length>=640)this.particles.shift();const a=this.rand()*Math.PI*2,s=force*(.4+this.rand());this.particles.push({x,y,z,vx:Math.cos(a)*s,vy:.5+this.rand()*force*1.9,vz:Math.sin(a)*s*.6,life:.3+this.rand()*.5,total:.9,size:size*(.55+this.rand()),color,spin:this.rand()*6});}}
 puff(x,y,z,scale=.7,color=0x9ba28a,opacity=.38){if(this.smoke.length>55)return;const m=new T.Sprite(new T.SpriteMaterial({map:this.softTexture,color,transparent:true,opacity,depthWrite:false}));m.position.set(x,y,z);m.scale.set(scale,scale,1);this.scene.add(m);this.smoke.push({mesh:m,life:1.1,total:1.1,scale,opacity,vx:(this.rand()-.5)*.6});}
 shockwave(x,z,size=2.0,color=0xf2c584,life=.42){const mesh=new T.Mesh(new T.RingGeometry(.86,1,40),new T.MeshBasicMaterial({color,side:T.DoubleSide,transparent:true,opacity:.7,depthWrite:false}));mesh.rotation.x=-Math.PI/2;mesh.position.set(x,.065,z);mesh.scale.setScalar(.05);this.scene.add(mesh);this.rings.push({mesh,life,total:life,size});}
 text(x,y,text,color='#f8dc9c',size=13){this.floating.push({x,y,text,color,size,life:1.05,total:1.05});}
 process(ev,sim,audio){
  switch(ev.type){
   case 'spawn':this.addUnit(ev.unit);audio?.deploy(ev.unit.age,ev.unit.type,ev.unit.side);this.puff(ev.unit.x,.3,ev.unit.z,.7,0xc3b88c,.3);break;
   case 'recruit':if(ev.side===0)audio?.train(ev.unitType);break;
   case 'hit':{const m=this.models.get(ev.id);if(m)m.userData.flash=.13;if(ev.source==='melee'){this.burst(ev.x,1.12,ev.z+.2,ev.age===0?4:7,ev.age===0?0xcab28a:0xfbe0a3,1.1,.04);if(this.rand()<.4)this.puff(ev.x,.35,ev.z,.38,0xbeb291,.2);}break;}
   case 'melee':audio?.hit(ev.age,ev.unitType,ev.x);if(ev.unitType===2)this.shake=Math.max(this.shake,.035);break;
   case 'death':{const m=this.models.get(ev.id);if(m){this.models.delete(ev.id);if(m.userData.shadow)m.userData.shadow.visible=false;this.corpses.push({mesh:m,life:.7,total:.7,dir:ev.side===0?1:-1,originalScale:m.scale.clone()});}this.burst(ev.x,.9,ev.z,ev.unitType===2?15:7,ev.age>=3?0x87917b:0x9b825f,2,.08);if(ev.side===1){this.text(ev.x,ev.unitType===2?2.8:2.0,'+'+ev.bounty);audio?.coin();}break;}
   case 'shot':this.createProjectile(ev,sim);audio?.shot(ev.age,ev.unitType,ev.from,ev.fromTurret);break;
   case 'impact':if(ev.heavy){this.burst(ev.x,.4,.1,14,0xefc782,3,.075);this.puff(ev.x,.7,.0,.9,0x88917c,.5);this.shockwave(ev.x,0,1.5);audio?.boom(ev.age,ev.x,false);this.shake=Math.max(this.shake,.065);}else this.burst(ev.x,1.1,.1,4,ev.age===4?0xa8ecda:0xddcea4,1.0,.027);break;
   case 'power':audio?.power(ev.age,ev.x);if(ev.age===3)this.addPlane(ev.side);break;
   case 'strikeIncoming':this.createStrike(ev);break;
   case 'strikeImpact':this.burst(ev.x,.20,0,ev.age===1?7:30,ev.age===4?0xa8e9db:0xf2c17a,ev.age===1?1.5:4,.085);this.puff(ev.x,.45,0,ev.age===1?.5:2.0,ev.age===4?0x93b8a6:0x8a8d77,.54);this.shockwave(ev.x,0,ev.age===1?.8:2.6,ev.age===4?0x9ee2d0:0xeecd8f);if(ev.age!==1||this.rand()<.3)audio?.boom(ev.age,ev.x,ev.age!==1);this.shake=Math.max(this.shake,ev.age===1?.025:.18);break;
   case 'baseHit':{const b=this.bases[ev.side];if(b)b.userData.flash=.16;this.shake=Math.max(this.shake,.035);const x=ev.side===0?-18.8:18.8;this.burst(x,1.3,.4,6,0xc6b98d,1.4,.08);break;}
   case 'evolve':this.setBase(ev.side,ev.age);this.syncTurrets(sim.teams);this.shockwave(ev.side===0?-20:20,0,7,0xe3d3a0,1.5);this.burst(ev.side===0?-20:20,2,.2,50,ev.side===0?0xdacd9a:0xd9a67e,4,.065);if(ev.side===0)audio?.evolve();break;
   case 'build':this.syncTurrets(sim.teams);if(!ev.sold){this.burst(ev.side===0?-20:20,3.5,0,12,0xccc695,2,.08);audio?.hit(1,0,ev.side===0?-20:20);}break;
   case 'end':{const x=ev.winner===0?20:-20;this.burst(x,2,0,150,0xb8ac86,7,.24);for(let i=0;i<6;i++)this.puff(x+(this.rand()-.5)*3,1+this.rand()*2,(this.rand()-.5)*2,3.5,0x64785f,.6);this.shockwave(x,0,8,0xf8d59a,1.4);this.shake=.4;audio?.boom(3,x,true);break;}
  }
 }
 createProjectile(e,sim){
  const dir=e.side===0?1:-1,m=new T.Group();let pos=e.fromTurret?this.getTurretPos(e.side,e.slot):new T.Vector3(e.from+dir*.65,e.unitType===2?(e.age===4?2.25:1.30):1.18,e.z||0);if(e.fromTurret)pos.y+=.8;
  const kind=e.age===0?'stone':e.age===1?'arrow':(e.unitType===2||e.fromTurret&&e.unitType===2)?'shell':e.age===4?'plasma':'bullet';
  if(kind==='stone')M.part(m,'rock',0xbeb598,0,0,0,.095,.095,.095);
  else if(kind==='arrow'){M.part(m,'cylinder',0xbfaa76,0,0,0,.013,.59,.013,-Math.PI/2);M.part(m,'cone',0xe7e0bf,.33,0,0,.048,.15,.020,-Math.PI/2);}
  else if(kind==='shell')M.part(m,'ball',e.age===4?0xaeedda:0x46523e,0,0,0,.15,.15,.15,0,e.age===4?0xaeedda:0);
  else{const p=M.part(m,'box',e.age===4?0xa0efd5:0xffe2a8,0,0,0,e.age===4?.52:.36,.032,.032);p.material=this.basic(e.age===4?0xa0efd5:0xffe2a8);}
  this.scene.add(m);this.projectiles.push({mesh:m,from:pos.clone(),to:e.to,toId:e.toId,life:0,duration:Math.max(.08,e.delay),arc:kind==='stone'?1.45:kind==='arrow'?.75:kind==='shell'&&e.age<3?1.8:.035,kind,dir});
  if(e.age>=2){this.burst(pos.x,pos.y,pos.z,5,e.age===4?0xc4fbe6:0xffe4a1,.8,.025);this.puff(pos.x,pos.y,pos.z,.28,e.age===4?0xb0dcca:0xb8b390,.20);}
 }
 createStrike(e){
  const m=new T.Group(),c=e.age===4?0xa8f2df:e.age===1?0xc6b487:0xe9b365;
  if(e.age===1){M.part(m,'cylinder',0xc9b382,0,0,0,.015,.9,.015);M.part(m,'cone',boneColor(),0,-.54,0,.063,.18,.035,Math.PI);}
  else if(e.age===4){const beam=M.part(m,'cylinder',c,0,4,0,.11,8,.11);beam.material=this.basic(c,.84);}
  else {const stone=M.part(m,'rock',0x6c6245,0,0,0,e.age===2?.20:.32,e.age===2?.20:.34,e.age===2?.20:.32);const tail=M.part(m,'cone',c,0,.8,0,.24,1.7,.24);tail.material=this.basic(c,.75);}
  m.position.set(e.x-5,14,0);this.scene.add(m);this.incoming.push({mesh:m,x:e.x,life:0,duration:e.delay,age:e.age,startX:e.x+(e.side===0?-5:5),lastTrail:0});
 }
 addPlane(side){const g=new T.Group();M.armor(g,0x718675,0,0,0,2.6,.20,.39);M.part(g,'box',0x536e5b,0,.03,0,.45,.1,3.1);M.part(g,'box',0x546c53,-1.0,.08,0,.29,.1,1.05);M.part(g,'box',0xb9c6ae,-.95,.29,0,.3,.46,.07);M.part(g,'box',0xb8cbb6,.38,.15,0,.52,.17,.19);g.position.set(side===0?-30:30,8,0);g.scale.x=side===0?1:-1;this.scene.add(g);this.incoming.push({mesh:g,plane:true,life:0,duration:3.8,dir:side===0?1:-1});}
 /* Portrait phones: a closer camera that follows the front line; a drag pans it for a few seconds. */
 updateFollow(sim,now){
  const rdt=clamp(now-(this.lastNow??now),0,.1);this.lastNow=now;this.adapt(rdt);
  if(!this.follow)return;
  if(this.hold>0){this.hold-=rdt;return;}
  let goal;
  if(this.aiming)goal=this.aimX;
  else{let f0=-99,f1=99;for(const u of sim.units){if(u.dead)continue;if(u.side===0){if(u.x>f0)f0=u.x;}else if(u.x<f1)f1=u.x;}
   if(f0===-99&&f1===99)goal=-8;else if(f0===-99)goal=f1-4;else if(f1===99)goal=f0+4;else goal=(f0+f1)/2;}
  goal=clamp(goal,-this.camLimit,this.camLimit);this.camX+=(goal-this.camX)*Math.min(1,rdt*2.2);this.target.x=this.camX;
 }
 panBy(dxPixels){if(!this.follow)return;this.camX=clamp(this.camX-dxPixels*this.worldW/this.width,-this.camLimit,this.camLimit);this.target.x=this.camX;this.hold=4;}
 /* Lower the render resolution step by step when frames stay slow. */
 adapt(rdt){
  if(this.dpr===undefined){this.dpr=Math.min(devicePixelRatio||1,1.65);this.slow=0;this.frameAvg=1/60;}
  if(rdt<=0||rdt>=.1||document.hidden)return;this.frameAvg+=(rdt-this.frameAvg)*.05;
  if(this.frameAvg>1/36&&this.dpr>1){this.slow+=rdt;if(this.slow>3){this.dpr=Math.max(1,this.dpr-.3);this.renderer.setPixelRatio(this.dpr);this.renderer.setSize(innerWidth,innerHeight,false);this.slow=0;this.frameAvg=1/60;}}else this.slow=Math.max(0,this.slow-rdt);
 }
 basic(color,opacity=1){this.basicMats=this.basicMats||new Map();const k=color+':'+opacity;if(!this.basicMats.has(k))this.basicMats.set(k,new T.MeshBasicMaterial({color,transparent:opacity<1,opacity}));return this.basicMats.get(k);}
 aim(show,x){this.aiming=show;if(x!==undefined)this.aimX=clamp(x,-17,17);for(const o of [this.aimRing,this.aimDisc,this.aimCenter,this.aimLine]){o.visible=show;o.position.x=this.aimX;}}
 pointerX(clientX,clientY){const r=this.canvas.getBoundingClientRect(),v=new T.Vector3(((clientX-r.left)/r.width)*2-1,1-((clientY-r.top)/r.height)*2,.5);v.unproject(this.camera);const dir=new T.Vector3(0,0,-1).applyQuaternion(this.camera.quaternion);const t=-v.y/dir.y;return clamp(v.x+dir.x*t,-17,17);}
 project(x,y,z=0){const v=new T.Vector3(x,y,z).project(this.camera);return{x:(v.x*.5+.5)*this.width,y:(-.5*v.y+.5)*this.heightPixels,visible:v.z>-1&&v.z<1};}
 resize(){this.width=innerWidth;this.heightPixels=innerHeight;this.renderer.setSize(innerWidth,innerHeight,false);const ratio=innerWidth/innerHeight,phone=innerWidth<700&&innerHeight>500;this.follow=ratio<1;const worldW=this.follow?clamp(24+(ratio-.46)*30,22,34):phone?48:ratio>2.25?53:49.8,worldH=worldW/ratio;this.worldW=worldW;this.camLimit=this.follow?Math.max(0,22.6-worldW/2):0;this.camX=this.follow?clamp(this.camX||0,-this.camLimit,this.camLimit):0;this.target.x=this.camX;this.camera.left=-worldW/2;this.camera.right=worldW/2;this.camera.top=worldH/2;this.camera.bottom=-worldH/2;
  // Position the ground above the command dock, including portrait mobile layouts.
  const dock=phone?275:innerHeight<650?176:208,groundFraction=(innerHeight-dock-62)/innerHeight;this.target.y=(groundFraction-.5)*worldH/.95;this.target.y=clamp(this.target.y,-5,13);this.camera.position.set(this.camX,this.target.y+11.4,32);this.camera.lookAt(this.target);this.camera.updateProjectionMatrix();
  const d=Math.min(devicePixelRatio||1,1.7);this.fxCanvas.width=Math.round(innerWidth*d);this.fxCanvas.height=Math.round(innerHeight*d);this.ctx.setTransform(d,0,0,d,0,0);this.fxRatio=d;
 }
 update(sim,dt,ambientTime){
  this.worldTime=ambientTime;
  for(const u of sim.units){if(!this.models.has(u.id))this.addUnit(u);const m=this.models.get(u.id);m.position.x=u.x;m.position.z=u.z;M.animate(m,u,ambientTime,dt);
   if(m.userData.flash>0){m.userData.flash-=dt;m.userData.materials.forEach(ma=>{if(ma.emissive){ma.emissive.setHex(0xd8b270);ma.emissiveIntensity=.28;}});}else if(m.userData.materials)m.userData.materials.forEach(ma=>{if(ma.emissive){ma.emissive.copy(ma.userData.originalEmissive);ma.emissiveIntensity=ma.userData.originalIntensity;}});
   if(u.moving&&this.rand()<dt*(u.type===2?4:1.7))this.puff(u.x-u.dir*.3,.13,u.z,.30,0xb9b18c,.22);
  }
  for(const b of this.bases){if(!b)continue;
   b.userData.flags.forEach(f=>{const a=f.geometry.attributes.position;for(let i=0;i<a.count;i++){const x=a.getX(i);a.setZ(i,Math.sin(ambientTime*3.6+x*6)*.075*(x+.4));}a.needsUpdate=true;f.geometry.computeVertexNormals();});
   b.userData.spinners.forEach((s,i)=>{s.rotation.y=ambientTime*.35;s.rotation.z=b.userData.age===4?Math.sin(ambientTime*.6)*.22:-.35;});
   b.userData.fires.forEach(f=>{const fl=f.userData.flame;if(fl){fl.scale.set(1+Math.sin(ambientTime*12)*.12,.85+Math.sin(ambientTime*17)*.24,1);if(this.rand()<dt*3){const p=f.getWorldPosition(new T.Vector3());this.puff(p.x,p.y+.75,p.z,.38,0x8d987e,.21);}}});
   if(b.userData.flash>0){b.userData.flash-=dt;b.position.x=(b.userData.side===0?-20:20)+Math.sin(ambientTime*100)*.018;}else b.position.x=b.userData.side===0?-20:20;
  }
  this.clouds.forEach((c,i)=>{c.position.x+=dt*(.035+i*.003);if(c.position.x>60)c.position.x=-60;});
  this.birds.forEach((b,i)=>{b.position.x=-21+((ambientTime*.48+i*.9)%70);b.position.y=12+Math.sin(ambientTime*.5+i)*.18+i*.29;const a=b.geometry.attributes.position;a.setY(0,Math.sin(ambientTime*5+i)*.16);a.setY(2,Math.sin(ambientTime*5+i)*.16);a.needsUpdate=true;});
  const a=this.dust.geometry.attributes.position;for(let i=0;i<a.count;i++){a.setX(i,a.getX(i)+dt*.055);if(a.getX(i)>27)a.setX(i,-27);a.setY(i,a.getY(i)+Math.sin(ambientTime+i)*dt*.025);}a.needsUpdate=true;
  this.projectiles=this.projectiles.filter(p=>{p.life+=dt;const f=Math.min(1,p.life/p.duration);const target=this.models.get(p.toId),tx=target?target.position.x:p.to,ty=target?(target.userData.type===2?1.5:1.05):1.5;
   p.mesh.position.set(T.MathUtils.lerp(p.from.x,tx,f),T.MathUtils.lerp(p.from.y,ty,f)+Math.sin(f*Math.PI)*p.arc,T.MathUtils.lerp(p.from.z,0,f));p.mesh.scale.x=p.dir;const dy=ty-p.from.y+Math.cos(f*Math.PI)*Math.PI*p.arc;p.mesh.rotation.z=Math.atan2(dy,Math.abs(tx-p.from.x))*p.dir;
   if(f>=1){this.scene.remove(p.mesh);return false;}return true;});
  this.incoming=this.incoming.filter(p=>{p.life+=dt;const f=Math.min(1,p.life/p.duration);if(p.plane){p.mesh.position.x=p.dir*(-30+60*f);p.mesh.rotation.z=p.dir*Math.sin(f*Math.PI)*.04;}else{
   const ff=f*f;p.mesh.position.set(T.MathUtils.lerp(p.startX,p.x,ff),14*(1-ff),0);p.mesh.rotation.z=-Math.atan2(p.x-p.startX,14);if(p.age===4){p.mesh.position.set(p.x,10*(1-ff),0);p.mesh.rotation.z=0;}
   if(p.age!==1&&p.age!==4&&p.life-p.lastTrail>.055){p.lastTrail=p.life;this.burst(p.mesh.position.x,p.mesh.position.y+.2,0,2,0xf6d28e,.2,.085);}
  }if(f>=1){this.scene.remove(p.mesh);return false;}return true;});
  this.corpses=this.corpses.filter(p=>{p.life-=dt;const f=1-p.life/p.total;p.mesh.rotation.z=-p.dir*f*1.0;p.mesh.position.y=-f*.65;p.mesh.scale.copy(p.originalScale).multiplyScalar(Math.max(0,1-f*.4));if(p.life<=0){this.scene.remove(p.mesh);this.releaseUnit(p.mesh);return false;}return true;});
  this.rings=this.rings.filter(r=>{r.life-=dt;const f=1-r.life/r.total;r.mesh.scale.setScalar(r.size*(.2+f*.8));r.mesh.material.opacity=(1-f)*.58;if(r.life<=0){this.scene.remove(r.mesh);r.mesh.material.dispose();r.mesh.geometry.dispose();return false;}return true;});
  this.smoke=this.smoke.filter(s=>{s.life-=dt;const f=1-s.life/s.total;s.mesh.position.y+=dt*.50;s.mesh.position.x+=s.vx*dt;s.mesh.scale.setScalar(s.scale*(1+f*.8));s.mesh.material.opacity=s.opacity*(1-f);if(s.life<=0){this.scene.remove(s.mesh);s.mesh.material.dispose();return false;}return true;});
  this.particles=this.particles.filter(p=>{p.life-=dt;p.vy-=dt*8;p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;if(p.y<.02){p.y=.02;p.vy*=-.28;p.vx*=.7;p.vz*=.7;}return p.life>0;});
  this.particleMesh.count=this.particles.length;this.particles.forEach((p,i)=>{this.dummy.position.set(p.x,p.y,p.z);this.dummy.scale.setScalar(p.size*Math.min(1,p.life*4));this.dummy.rotation.set(p.spin+p.life*3,p.spin,0);this.dummy.updateMatrix();this.particleMesh.setMatrixAt(i,this.dummy.matrix);this.particleMesh.setColorAt(i,this.pColor.setHex(p.color));});this.particleMesh.instanceMatrix.needsUpdate=true;if(this.particleMesh.instanceColor)this.particleMesh.instanceColor.needsUpdate=true;
  this.floating=this.floating.filter(t=>{t.life-=dt;t.y+=dt*.55;return t.life>0;});
  this.shake=Math.max(0,this.shake-dt*.75);const s=this.reduced?0:this.shake;this.updateFollow(sim,ambientTime);this.camera.position.x=this.camX+Math.sin(ambientTime*83)*s;this.camera.position.y=this.target.y+11.4+Math.sin(ambientTime*79)*s*.7;
  if(this.aiming){this.aimRing.material.opacity=.78+Math.sin(ambientTime*5)*.17;this.aimDisc.material.opacity=.22+Math.sin(ambientTime*5)*.06;this.aimLine.rotation.y=ambientTime*.14;}
 }
 draw(sim,showHealth=true){
  this.renderer.render(this.scene,this.camera);const c=this.ctx;c.clearRect(0,0,this.width,this.heightPixels);
  if(showHealth){for(const u of sim.units){if(u.hp>=u.maxHp*.996)continue;const p=this.project(u.x,u.type===2?(u.age===4?3.3:u.age<2?3.2:2.2):2.15,u.z);const w=clamp(this.width/49.8*(u.type===2?1.20:.75),15,34),h=3;c.fillStyle='#10261da6';c.fillRect(p.x-w/2-1,p.y-1,w+2,h+2);c.fillStyle=u.side===0?'#abd6ad':'#e89b79';c.fillRect(p.x-w/2,p.y,w*Math.max(0,u.hp/u.maxHp),h);}}
  c.textAlign='center';for(const t of this.floating){const p=this.project(t.x,t.y,.4);c.globalAlpha=Math.min(1,t.life*3);c.font=`600 ${t.size}px Arial`;c.shadowColor='#243625';c.shadowBlur=4;c.fillStyle=t.color;c.fillText(t.text,p.x,p.y);}c.shadowBlur=0;c.globalAlpha=1;
  if(this.aiming){const p=this.project(this.aimX,.2,0);c.beginPath();c.moveTo(p.x,p.y-32);c.lineTo(p.x,p.y-19);c.strokeStyle='#fff0c4';c.lineWidth=1.4;c.stroke();}
 }
 portraits(){
  const out=[],canvas=document.createElement('canvas');canvas.width=220;canvas.height=172;const r=new T.WebGLRenderer({canvas,alpha:true,antialias:true,preserveDrawingBuffer:true});r.setSize(220,172,false);r.setPixelRatio(1);r.outputEncoding=T.sRGBEncoding;r.toneMapping=T.ACESFilmicToneMapping;r.toneMappingExposure=1.04;
  const sc=new T.Scene();sc.add(new T.HemisphereLight(0xffeed3,0x536947,.95));const light=new T.DirectionalLight(0xffdfb3,1.8);light.position.set(-2,5,7);sc.add(light);const fill=new T.DirectionalLight(0xb1d8c1,.7);fill.position.set(4,2,-3);sc.add(fill);
  for(let age=0;age<5;age++){out[age]=[];for(let type=0;type<3;type++){const m=M.unit(age,type,0);sc.add(m);const heavy=type===2,span=heavy?2.18:1.45;const cam=new T.OrthographicCamera(-span*1.28,span*1.28,span,-span,.1,30);cam.position.set(3.2,2.6,6.3);cam.lookAt(heavy&&age<2?.30:0,heavy&&age===4?1.60:heavy&&age===3?.91:1.12,0);r.render(sc,cam);out[age][type]=canvas.toDataURL('image/png');sc.remove(m);}}
  r.dispose();return out;
 }
}
function boneColor(){return 0xdbd5b9;}
root.EpochBattlefield=Battlefield;
})(globalThis);
