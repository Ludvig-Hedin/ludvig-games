import * as THREE from './vendor/three.module.js';
import { createCreatureAssets } from './creatures.js';
import { createTerrainAssets } from './terrain.js';

// A miniature diorama viewed with an orthographic camera keeps routes and threats readable.
export const PARTS = [
 {id:'tank',name:'Bränsletank',short:'Tank',x:10,z:14,zone:'Sälstranden',kind:'seal',color:0xffca5a},
 {id:'engine',name:'Raketmotor',short:'Motor',x:-64,z:-27,zone:'Blå grottan',kind:'ice',color:0xfb804f},
 {id:'fins',name:'Styrfenor',short:'Fenor',x:54,z:43,zone:'Pingvinkolonin',kind:'penguin',color:0xfb804f},
 {id:'hull',name:'Raketskrov',short:'Skrov',x:-49,z:-69,zone:'Polarlabbet',kind:'relay',color:0xf0f6f3},
 {id:'nav',name:'Navigation',short:'Dator',x:59,z:-50,zone:'Radioryggen',kind:'signal',color:0x5ce7d7},
 {id:'nose',name:'Noskon',short:'Nos',x:-55,z:59,zone:'Björnviken',kind:'bear',color:0xfb804f}
];
export const SWITCHES = [];
export const SHELTERS=[{x:0,z:0,r:8.8},{x:12,z:-6,r:4.5},{x:-50,z:-71,r:5.4},{x:-33,z:-16,r:5},{x:37,z:26,r:5},{x:-31,z:38,r:5},{x:40,z:-38,r:4.8}];
export const SHOP={x:12,z:-6};
export const RIVAL_HOME={x:-11,z:17};
export const LANDMARKS=[{name:'Kraschplatsen',x:0,z:0,r:15},{name:'Sälstranden',x:13,z:15,r:10},{name:'Blå grottan',x:-64,z:-27,r:18},{name:'Pingvinkolonin',x:54,z:43,r:17},{name:'Polarlabbet',x:-49,z:-69,r:19},{name:'Radioryggen',x:59,z:-50,r:18},{name:'Björnviken',x:-55,z:59,r:20},{name:'Spegelisen',x:15,z:57,r:18},{name:'Glaciärpasset',x:-31,z:-37,r:16}];
export const palette={snow:0xf2fafb,ice:0x94dae4,dark:0x193649,orange:0xfa784d,yellow:0xffd065,teal:0x3ccbbd};
export function shoreRadius(a){return 105+7*Math.sin(3*a+.5)+5*Math.cos(5*a-.3)+3*Math.sin(9*a);}
export function onIsland(x,z,margin=2.2){return Math.hypot(x,z)<shoreRadius(Math.atan2(z,x))-margin;}
export function onIce(x,z){return ((x-15)/19)**2+((z-57)/11)**2<1 || ((x+61)/7)**2+((z-50)/6)**2<1;}
function random(seed=1417){return()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}

export function createWorld(renderer){
 const rng=random(), scene=new THREE.Scene();scene.background=new THREE.Color(0xc0eaf0);scene.fog=new THREE.Fog(0xc0eaf0,160,360);
 const all=new THREE.Group();scene.add(all);
 const matCache=new Map();
 const mat=(color,extra={})=>{const k=JSON.stringify([color,extra]);if(!matCache.has(k))matCache.set(k,new THREE.MeshStandardMaterial({color,roughness:.82,metalness:0,...extra}));return matCache.get(k);};
 const cube=new THREE.BoxGeometry(1,1,1), sphere=new THREE.SphereGeometry(1,12,8), ico=new THREE.IcosahedronGeometry(1,0), cyl=new THREE.CylinderGeometry(1,1,1,12), cone=new THREE.ConeGeometry(1,1,8);
 const mesh=(geo,color,pos=[0,0,0],scale=[1,1,1],parent=all,extra={})=>{let m=new THREE.Mesh(geo,mat(color,extra));m.position.set(...pos);m.scale.set(...scale);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;};
 const box=(col,pos,scale,parent=all,extra={})=>mesh(cube,col,pos,scale,parent,extra);
 const ball=(col,pos,scale,parent=all,extra={})=>mesh(sphere,col,pos,scale,parent,extra);
 const tube=(col,pos,scale,parent=all,extra={})=>mesh(cyl,col,pos,scale,parent,extra);
 const spike=(col,pos,scale,parent=all)=>mesh(cone,col,pos,scale,parent);
 const obstacles=[];
 const terrain=createTerrainAssets(THREE,{shoreRadius,seed:1417});
 function district(dx,dz,build){const old=new Set(all.children),n=obstacles.length;build();for(const o of all.children)if(!old.has(o)){o.position.x+=dx;o.position.z+=dz;}for(let i=n;i<obstacles.length;i++){obstacles[i].x+=dx;obstacles[i].z+=dz;}}
 const hemisphere=new THREE.HemisphereLight(0xe3f8ff,0x718eab,2.5);scene.add(hemisphere);
 const sun=new THREE.DirectionalLight(0xfff0d4,3.3);sun.position.set(-32,64,36);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-56;sun.shadow.camera.right=56;sun.shadow.camera.top=56;sun.shadow.camera.bottom=-56;sun.shadow.camera.near=1;sun.shadow.camera.far=150;sun.shadow.normalBias=.035;sun.shadow.bias=-.0002;sun.shadow.radius=2.5;scene.add(sun);scene.add(sun.target);
 const fill=new THREE.DirectionalLight(0x72cde8,.75);fill.position.set(30,20,-30);scene.add(fill);

 // Irregular ice shelf with faceted cyan cliffs; a white rim catches the sun.
 const boundary=[];for(let i=0;i<160;i++){let a=i/160*Math.PI*2,r=shoreRadius(a);boundary.push(new THREE.Vector2(Math.cos(a)*r,Math.sin(a)*r));}
 const shape=new THREE.Shape(boundary), topGeo=new THREE.ShapeGeometry(shape);topGeo.rotateX(-Math.PI/2);
 // Shape XY becomes world X,-Z, so reflect once to preserve our shared collision boundary.
 topGeo.scale(1,1,-1);topGeo.computeVertexNormals();
 const snowCanvas=document.createElement('canvas');snowCanvas.width=snowCanvas.height=1024;const sc=snowCanvas.getContext('2d');sc.fillStyle='#eff9fb';sc.fillRect(0,0,1024,1024);
 for(let i=0;i<4000;i++){const a=rng();sc.fillStyle=`rgba(77,144,179,${.025+a*.04})`;sc.beginPath();sc.ellipse(rng()*1024,rng()*1024,1+rng()*2,.4+rng(),rng()*3,0,Math.PI*2);sc.fill();}
 for(let i=0;i<70;i++){let x=rng()*1024,y=rng()*1024,r=20+rng()*60;let grad=sc.createRadialGradient(x,y,0,x,y,r);grad.addColorStop(0,'#aad6e326');grad.addColorStop(1,'#aad6e300');sc.fillStyle=grad;sc.fillRect(x-r,y-r,r*2,r*2);}
 const snowTex=new THREE.CanvasTexture(snowCanvas);snowTex.colorSpace=THREE.SRGBColorSpace;const uv=topGeo.attributes.uv;for(let i=0;i<uv.count;i++){uv.setXY(i,(topGeo.attributes.position.getX(i)+125)/250,(topGeo.attributes.position.getZ(i)+125)/250);}
 const top=new THREE.Mesh(topGeo,new THREE.MeshStandardMaterial({map:snowTex,roughness:1,side:THREE.DoubleSide}));top.receiveShadow=true;all.add(top);
 function iceWall(topY,bottomY,factor,color){const p=[],colors=[];for(let i=0;i<boundary.length;i++){let b=boundary[i],n=boundary[(i+1)%boundary.length],k=.8+.2*rng();const c=new THREE.Color(color).multiplyScalar(k);let coords=[b.x,topY,b.y,n.x,topY,n.y,b.x*factor,bottomY,b.y*factor,n.x,topY,n.y,n.x*factor,bottomY,n.y*factor,b.x*factor,bottomY,b.y*factor];p.push(...coords);for(let j=0;j<6;j++)colors.push(c.r,c.g,c.b);}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.computeVertexNormals();const m=new THREE.Mesh(g,new THREE.MeshStandardMaterial({vertexColors:true,roughness:.8,side:THREE.DoubleSide}));m.receiveShadow=true;all.add(m);}
 iceWall(-.02,-.8,1.003,0xe4f8ff);iceWall(-.8,-4.8,1.024,0x62c3d9);
 const ocean=terrain.createOcean({radius:105,segments:160});const water=ocean.mesh,waterUniforms=ocean.uniforms;scene.add(water);

 function rock(x,z,size=1,ice=false,collision=true){let g=new THREE.Group();g.position.set(x,.03,z);g.rotation.y=rng()*6;all.add(g);let h=.8+rng()*1.3;mesh(ico,ice?0x9cdeea:0x698c9d,[0,h*size*.43,0],[size,h*size,size*.8],g);mesh(ico,0xedfaff,[0,h*size*.72,0],[size*.88,h*size*.42,size*.76],g);if(collision)obstacles.push({x,z,r:size*.8});return g;}
 function icePeak(x,z,size=4,h=10){const m=terrain.makeMountain({x,z,width:size*2.7,height:h,depth:size*2.2,rotation:rng()*6.28});all.add(m.group);obstacles.push({x,z,r:m.radius*.75});return m.group;}

 for(let i=0;i<95;i++){let a=rng()*Math.PI*2,r=shoreRadius(a)-3-rng()*6;rock(Math.cos(a)*r,Math.sin(a)*r,.7+rng()*1.6,true);}
 // Offshore floes show the height of the shelf and frame the playable island.
 const floes=[];for(let i=0;i<44;i++){let a=rng()*Math.PI*2,r=shoreRadius(a)+9+rng()*52,x=Math.cos(a)*r,z=Math.sin(a)*r;let g=new THREE.Group();g.position.set(x,-4.2,z);g.rotation.y=rng()*6;all.add(g);mesh(new THREE.CylinderGeometry(1,1.1,1,5),0xe3f7ff,[0,0,0],[1.5+rng()*5,.3+rng()*.8,1.5+rng()*4],g);floes.push(g);}
 [[-28,-86,8,24],[-8,-94,10,30],[14,-88,8,25],[35,-83,6,18],[-82,-53,7,21],[-89,-27,5,17],[84,5,7,20],[85,22,6,17],[-79,62,7,19],[2,93,5,13],[-21,-41,5,16],[-40,-40,4,12],[46,8,5,14],[-45,10,4,12]].forEach(v=>icePeak(...v));

 // Paths are subtle pairs of footprints, not walls; every landmark is reachable.
 const pathGeo=new THREE.CircleGeometry(.12,6),pathMat=new THREE.MeshBasicMaterial({color:0x8cb7cd,transparent:true,opacity:.31,depthWrite:false});
 const pathPoints=[];for(const p of PARTS.slice(1)){const steps=Math.floor(Math.hypot(p.x,p.z)*1.2);for(let j=4;j<steps;j++){let t=j/steps,x=p.x*t+Math.sin(t*6)*2,z=p.z*t+Math.cos(t*5)*1.5;pathPoints.push([x-.22,z],[x+.22,z+.35]);}}
 const paths=new THREE.InstancedMesh(pathGeo,pathMat,pathPoints.length);const tmp=new THREE.Object3D();pathPoints.forEach(([x,z],i)=>{tmp.position.set(x,.014,z);tmp.rotation.set(-Math.PI/2,0,0);tmp.scale.set(1,1.5,1);tmp.updateMatrix();paths.setMatrixAt(i,tmp.matrix);});all.add(paths);
 // A glassy lake: extra inertia rewards taking the fast line across it.
 const lake=mesh(new THREE.CircleGeometry(1,64),0x8bdbeb,[15,.025,57],[19,11,1],all,{roughness:.14,metalness:.18});lake.rotation.x=-Math.PI/2;lake.castShadow=false;
 for(let i=0;i<12;i++){let x=15+(rng()-.5)*28,z=57+(rng()-.5)*15;const pts=[new THREE.Vector3(x,.043,z),new THREE.Vector3(x+(rng()-.5)*3,.043,z+1),new THREE.Vector3(x+2,.043,z+1.5)];let line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),new THREE.LineBasicMaterial({color:0xd0f3fb,transparent:true,opacity:.6}));all.add(line);}

 function label(text,x,y,z,scale=3,bg='#1c3a4a',fg='#eafaff'){let c=document.createElement('canvas');c.width=512;c.height=128;let ctx=c.getContext('2d');ctx.fillStyle=bg;ctx.beginPath();ctx.roundRect(0,0,512,128,14);ctx.fill();ctx.fillStyle=fg;ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='800 47px sans-serif';ctx.fillText(text,256,65);const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;let m=new THREE.Mesh(new THREE.PlaneGeometry(scale,scale/4),new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide}));m.position.set(x,y,z);all.add(m);return m;}
 function flag(x,z,color=0xfb8053){const g=new THREE.Group();g.position.set(x,0,z);all.add(g);tube(0x50717f,[0,2.2,0],[.07,4.4,.07],g);ball(0xeefcff,[0,4.43,0],[.13,.13,.13],g);const f=box(color,[.67,3.82,0],[1.35,.77,.05],g);return {g,f};}
 const flags=[flag(-5,-3),flag(5,-3),flag(-54,-63,0x57cbbb),flag(52,36,0xffce65),flag(-62,56,0xf18665),flag(55,-53,0x57cbbb)];
 // Launchpad and camp.
 const pad=tube(0x5e7d8d,[0,.09,0],[4.1,.2,4.1]);const padTop=tube(0xcbd8d6,[0,.21,0],[3.7,.06,3.7]);
 const ring=new THREE.Mesh(new THREE.RingGeometry(3.23,3.33,48),new THREE.MeshBasicMaterial({color:0xffcb61,side:THREE.DoubleSide}));ring.rotation.x=-Math.PI/2;ring.position.set(0,.253,0);all.add(ring);
 for(let i=0;i<4;i++){let a=i/4*Math.PI*2;box(0xffcf66,[Math.cos(a)*3.4,.27,Math.sin(a)*3.4],[.8,.05,.22]).rotation.y=-a;}
 const tent=new THREE.Group();tent.position.set(-7,0,2);tent.rotation.y=-.3;all.add(tent);const tg=new THREE.CylinderGeometry(0,1,1,3,1,false);const tb=mesh(tg,0xf47d4f,[0,1.3,0],[3.2,2.6,3],tent);tb.rotation.y=Math.PI;box(0x304a56,[0,.15,0],[4.4,.2,3.6],tent);box(0x254553,[0,1.05,1.3],[1.25,1.65,.07],tent);box(0xffda86,[0,1,1.37],[.74,1.24,.08],tent,{emissive:0xffb955,emissiveIntensity:.9});obstacles.push({x:-7,z:2,r:2});
 const fireGroup=new THREE.Group();fireGroup.position.set(-5.5,0,6);all.add(fireGroup);for(let i=0;i<7;i++){let a=i/7*Math.PI*2;mesh(ico,0x617c86,[Math.cos(a)*.8,.2,Math.sin(a)*.8],[.27,.22,.23],fireGroup);}box(0x5a5044,[0,.22,0],[1.2,.22,.25],fireGroup).rotation.y=.7;box(0x5a5044,[0,.3,0],[1.2,.22,.25],fireGroup).rotation.y=-.7;const flames=[spike(0xff9147,[0,.72,0],[.5,1.3,.4],fireGroup),spike(0xffd782,[.1,.6,0],[.28,1,.25],fireGroup)];const fireLight=new THREE.PointLight(0xffc376,12,10,1.3);fireLight.position.set(-5.5,1.8,6);scene.add(fireLight);
 const campLabel=label('HEMÅT',0,.55,4.2,2.4,'#ffcd66','#354b56');campLabel.rotation.x=-Math.PI/2;
 // A second crash site belongs to the AI explorer Nova.
 tube(0x8294b0,[RIVAL_HOME.x,.1,RIVAL_HOME.z],[2.8,.2,2.8]);flag(RIVAL_HOME.x-3,RIVAL_HOME.z+1,0x9b86d0);
 label('NOVA',RIVAL_HOME.x,1.2,RIVAL_HOME.z+3,2,'#7965a1');
 function crate(x,z,s=1.3,color=0xbc9067,parent=all){let g=new THREE.Group();g.position.set(x,0,z);parent.add(g);box(color,[0,s/2,0],[s,s,s],g);box(0xe2b984,[0,s+.03,0],[s*1.06,.12,s*1.06],g);for(let d of [-1,1]){box(0x624e41,[d*s*.33,s*.5,s*.51],[s*.1,s,.04],g);box(0x624e41,[d*s*.33,s+.1,0],[s*.1,.03,s],g);}return g;}
 crate(-4,-6,1.15);crate(-3,-6,1);crate(-4.3,-4.9,.8);box(0x728895,[-3,.17,7],[.4,.15,3.8]).rotation.y=-.4;
 // Piff's tiny trading counter.
 const shopGroup=new THREE.Group();shopGroup.position.set(SHOP.x,0,SHOP.z);all.add(shopGroup);box(0xc89261,[0,.65,0],[3.2,1.3,1.4],shopGroup);box(0xe4b07a,[0,1.36,0],[3.5,.2,1.65],shopGroup);for(let x of [-1.5,1.5])tube(0x6b6054,[x,2,0],[.08,4,.08],shopGroup);box(0xf6c764,[0,3.9,0],[3.7,.14,2],shopGroup);for(let i=0;i<5;i++)box(i%2?0xe8faf9:0xefa96e,[-1.42+i*.71,3.7,1],[.71,.4,.08],shopGroup);label('POLARPOSTEN',SHOP.x,2.75,SHOP.z+.16,2.7);for(let i=0;i<3;i++){tube(0x5a6e74,[-.8+i*.6,1.59,.2],[.17,.35,.17],shopGroup);ball(0xf8dfb2,[-.8+i*.6,1.79,.2],[.14,.03,.14],shopGroup);}obstacles.push({x:SHOP.x,z:SHOP.z,r:1.9});
 // Blue ice cave: large arch, open sides, no invisible barriers.
 district(-29,-12,()=>{
 icePeak(-40,-19,2.1,6);icePeak(-30,-20,2,6.4);const arch=terrain.makeIceArch({width:12,height:10,depth:4});const archGroup=arch.group||arch;archGroup.position.set(-35,0,-20);all.add(archGroup);for(const c of archGroup.userData.colliders||[])obstacles.push({x:-35+c.x,z:-20+c.z,r:c.r});rock(-42,-13,2,true);rock(-28,-11,1.2,true);label('BLÅ GROTTAN',-33,1.65,-10,3);tube(0x698897,[-34.3,.77,-10],[.06,1.54,.06]);
 });
 // Research station, roof equipment and a little snow-covered porch.
 district(-30,-32,()=>{
 const lab=new THREE.Group();lab.position.set(-20,0,-43);all.add(lab);box(0x5e9cab,[0,1.8,0],[8,3.6,5],lab);box(0xe9f6f6,[0,3.65,0],[8.6,.35,5.6],lab);box(0x183947,[2,1.37,2.56],[1.5,2.7,.08],lab);for(let x of [-2.3,-.2]){box(0xe3eef0,[x,2,2.56],[1.65,1.2,.08],lab);box(0x92d8e8,[x,2,2.62],[1.4,.94,.06],lab,{emissive:0x649da9,emissiveIntensity:.24});}box(0x94b8bc,[0,.2,3.7],[8.5,.35,2.4],lab);tube(0x5c7d89,[2.5,4.9,-1],[.23,2.6,.23],lab);ball(0xefefdf,[2.5,6.3,-1],[.37,.16,.37],lab);obstacles.push({x:-20,z:-43,r:4.5});label('POLARLABB 07',-20,3,-40.43,4.9);crate(-24,-37,1.3,0x91aa9b);crate(-24.7,-38.5,.9,0x91aa9b);
 });
 let beacon;
 // Radio mast with open lattice and readable antenna silhouette.
 district(25,-22,()=>{
 const mast=new THREE.Group();mast.position.set(36,0,-35);all.add(mast);for(let i=0;i<4;i++){let x=i%2?1:-1,z=i>1?1:-1;const pole=tube(0xe69b70,[x*.6,5.3,z*.6],[.12,10.6,.12],mast);pole.rotation.z=x*.08;pole.rotation.x=-z*.08;}for(let y=1;y<10;y+=1.5){box(0x778b93,[0,y,0],[2,.09,1.9],mast);let b=box(0x9db2bb,[0,y+.65,.9],[1.8,.08,.08],mast);b.rotation.z=.55;}const dish=mesh(new THREE.SphereGeometry(1,16,10,0,Math.PI*2,0,Math.PI*.46),0xebeeee,[0,9,0],[1.8,.55,1.8],mast);dish.rotation.x=1.05;tube(0x38586d,[0,11,0],[.06,3,.06],mast);beacon=ball(0xfb7050,[0,12.55,0],[.18,.18,.18],mast,{emissive:0xff6039,emissiveIntensity:2});obstacles.push({x:36,z:-35,r:1.5});box(0x5f7881,[31,1.05,-32],[2.4,2.1,1.7]);label('RADIO',31,1.5,-31.12,1.8);obstacles.push({x:31,z:-32,r:1.3});
 });
 // Penguin settlement, tiny fish racks and round snow nests.
 district(25,23,()=>{
 for(let i=0;i<7;i++){let a=i/7*Math.PI*2;let x=30+Math.cos(a)*6,z=20+Math.sin(a)*6;tube(0xd8edf1,[x,.06,z],[.95,.1,.95]);tube(0xb0d3dc,[x,.12,z],[.48,.05,.48]);}
 for(let x of [24,27])tube(0x806d55,[x,1.5,27],[.07,3,.07]);box(0x866c53,[25.5,2.7,27],[3.2,.11,.11]);for(let x of [24.6,25.4,26.2]){ball(0x8eabb9,[x,2.2,27],[.13,.46,.1]);spike(0x577f90,[x,2.65,27],[.18,.3,.12]);}
 });
 // Bear den, whale bones and a wrecked orange sled.
 district(-27,29,()=>{
 rock(-34,35,3.6,true);rock(-29,37,3.4,true);rock(-36,31,2.1,true);for(let i=0;i<5;i++){let rib=new THREE.Mesh(new THREE.TorusGeometry(1.6-i*.14,.13,5,12,Math.PI),mat(0xd5d8c8));rib.position.set(-23+i*.65,.15,33);rib.rotation.y=Math.PI/2;all.add(rib);}box(0xc16848,[-30,.5,26],[3.4,.6,1.7]).rotation.y=.5;for(let i of [-1,1])box(0x697f84,[-30+i*.7,.15,26],[.16,.17,3.3]).rotation.y=.5;
 });
 // Smaller route props: cairns, snow mounds and a forgotten sled.
 for(const [x,z] of [[-12,-15],[17,-14],[17,8],[-14,29],[9,-31],[-30,7],[39,-8]]){rock(x,z,.7,true);rock(x+.35,z+.5,.45,true,false);}
 for(let i=0;i<65;i++){let a=rng()*6.28,r=16+rng()*75,x=Math.cos(a)*r,z=Math.sin(a)*r;if(PARTS.some(p=>Math.hypot(p.x-x,p.z-z)<5)||Math.hypot(x,z)<13||onIce(x,z))continue;ball(0xeaf7fa,[x,.08,z],[.7+rng()*1.5,.15+rng()*.18,.4+rng()],all);}

 for(const h of SHELTERS.slice(3)){const g=new THREE.Group();g.position.set(h.x,0,h.z);all.add(g);tube(0x62838d,[0,.12,0],[2.4,.24,2.4],g);box(0x7a8e96,[0,1.05,-1.5],[3.8,2.1,.25],g);const roof=box(0xedf8f4,[0,2.35,-.5],[4.3,.35,3.5],g);roof.rotation.x=.12;for(const x of [-1.8,1.8])tube(0x63848c,[x,1.1,.9],[.07,2.2,.07],g);tube(0x526777,[0,.55,0],[.5,1,.5],g);ball(0xffcb73,[0,1.1,0],[.5,.42,.5],g,{emissive:0xffa552,emissiveIntensity:1.5});const flagItem=flag(h.x+3,h.z-1,0x74cabc);flags.push(flagItem);}
 for(const [x,z,rot] of [[-14,-20,.4],[25,-22,-.6],[-23,32,.9],[42,26,.4],[-64,-55,-.4]]){let g=new THREE.Group();g.position.set(x,0,z);g.rotation.y=rot;all.add(g);for(let i=0;i<3;i++){const drift=terrain.makeSnowDrift?terrain.makeSnowDrift({width:5+i*1.5,height:.5+i*.2,depth:2}):null;if(drift){const d=drift.group||drift;d.position.set(i*2,.02,-i*1.4);g.add(d);}}}
 const assets=createCreatureAssets(THREE);
 const explorer=assets.makeExplorer(0xfa754c);all.add(explorer.group);
 const rival=assets.makeExplorer(0x8e72c0);all.add(rival.group);rival.group.position.set(-11,0,20);
 const piff=assets.makePenguin();piff.group.position.set(SHOP.x,.55,SHOP.z-.45);piff.group.scale.setScalar(1.2);all.add(piff.group);
 const animals=[];for(let i=0;i<16;i++){let a=rng()*6.28,r=3+rng()*9;let x=i<10?54+Math.cos(a)*r:6+Math.cos(a)*8,z=i<10?43+Math.sin(a)*r:88+Math.sin(a)*5;const model=assets.makePenguin();model.group.position.set(x,0,z);model.group.rotation.y=rng()*6.28;model.group.scale.setScalar(.7+rng()*.35);all.add(model.group);animals.push({type:'penguin',model,home:{x,z},phase:rng()*8,speed:.4+rng()*.6});}
 for(let i=0;i<4;i++){const model=assets.makeSeal();const x=40+i*3,z=84+Math.sin(i)*2;model.group.position.set(x,0,z);model.group.rotation.y=i*.8;all.add(model.group);animals.push({type:'seal',model,home:{x,z},phase:i,speed:0});}
 const bears=[];for(const [x,z] of [[-58,61],[-69,43],[65,-25],[-52,-42],[30,45],[-24,65]]){let model=assets.makePolarBear();all.add(model.group);model.group.position.set(x,0,z);bears.push({model,x,z,home:{x,z},target:{x,z},angle:0,alert:0,stun:0,cooldown:0,windup:0,phase:rng()*6});}

 function rocketPiece(index,parent,ghost=false){let g=new THREE.Group();parent.add(g);if(index===0){tube(0xf5c85b,[0,3.15,0],[1.18,2.1,1.18],g);for(let y of [2.2,4.1])tube(0xa4b1b8,[0,y,0],[1.24,.15,1.24],g);box(0x274555,[.87,3.2,.88],[.22,.68,.1],g).rotation.y=-.8;}
 if(index===1){tube(0x52737f,[0,1,0],[.95,1.65,.95],g);mesh(new THREE.CylinderGeometry(.68,1.1,.8,12),0x284757,[0,.48,0],[1,1,1],g);for(let i=0;i<8;i++){let a=i/8*Math.PI*2;tube(0xa8bfc3,[Math.cos(a)*.78,1.18,Math.sin(a)*.78],[.1,1.5,.1],g);}tube(0xffb558,[0,.08,0],[.68,.12,.68],g,{emissive:0xff8e32,emissiveIntensity:.8});}
 if(index===2){for(let i=0;i<3;i++){let a=i/3*Math.PI*2;let f=new THREE.Group();f.rotation.y=a;g.add(f);const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute([.8,2.7,-.1,2.3,.3,-.1,.8,.65,-.1,.8,2.7,.1,.8,.65,.1,2.3,.3,.1,.8,2.7,-.1,.8,2.7,.1,2.3,.3,.1,.8,2.7,-.1,2.3,.3,.1,2.3,.3,-.1],3));geo.computeVertexNormals();mesh(geo,0xef754d,[0,0,0],[1,1,1],f,{side:THREE.DoubleSide});box(0x344d5a,[1.85,.25,0],[.95,.14,.45],f);}}
 if(index===3){tube(0xf4f6ed,[0,5.32,0],[1.2,2.2,1.2],g);tube(0xf47951,[0,4.34,0],[1.22,.25,1.22],g);tube(0xd0dcd9,[0,6.32,0],[1.22,.16,1.22],g);for(let a of [0,Math.PI]){let strip=box(0xc7d7d6,[Math.sin(a)*1.15,5.3,Math.cos(a)*1.15],[.13,1.5,.13],g);}}
 if(index===4){let w=tube(0x36566b,[0,5.5,1.12],[.57,.18,.57],g);w.rotation.x=Math.PI/2;let glass=tube(0x63d5e5,[0,5.5,1.24],[.43,.12,.43],g,{roughness:.13,metalness:.3,emissive:0x47c9d5,emissiveIntensity:.25});glass.rotation.x=Math.PI/2;box(0xc9faff,[-.13,5.63,1.32],[.26,.09,.025],g).rotation.z=.65;tube(0x6e8795,[-.65,6.3,-.3],[.035,2,.035],g);ball(0xffd761,[-.65,7.34,-.3],[.13,.13,.13],g);}
 if(index===5){mesh(new THREE.ConeGeometry(1.21,2.55,20),0xf77950,[0,7.65,0],[1,1,1],g);tube(0xe8d7bd,[0,6.46,0],[1.24,.16,1.24],g);}
 if(ghost)g.traverse(o=>{if(o.isMesh){o.material=new THREE.MeshBasicMaterial({color:0xd5eff1,transparent:true,opacity:.14,depthWrite:false});o.castShadow=false;}});return g;}
 function makeRocket(x,z,small=false){let g=new THREE.Group();g.position.set(x,.34,z);if(small)g.scale.setScalar(.62);all.add(g);let parts=PARTS.map((p,i)=>{let ghost=rocketPiece(i,g,true);let solid=rocketPiece(i,g);solid.visible=false;return{ghost,solid};});const flame=new THREE.Group();g.add(flame);flame.visible=false;mesh(new THREE.ConeGeometry(.7,4,12),0xffb341,[0,-1.8,0],[1,1,1],flame,{emissive:0xff9531,emissiveIntensity:2}).rotation.z=Math.PI;mesh(new THREE.ConeGeometry(.4,3,12),0xfff1b6,[0,-1.35,0],[1,1,1],flame,{emissive:0xffe0a4,emissiveIntensity:3}).rotation.z=Math.PI;return{group:g,parts,flame};}
 const rocket=makeRocket(0,0),novaRocket=makeRocket(RIVAL_HOME.x,RIVAL_HOME.z,true);
 const pickups=[];
 function makeMiniPart(index){const g=new THREE.Group();if(index===0){tube(0xffd262,[0,.8,0],[.53,1.25,.53],g);for(let y of [.24,1.42])tube(0x537481,[0,y,0],[.56,.13,.56],g);ball(0xffd262,[0,1.47,0],[.46,.17,.46],g);}if(index===1){mesh(new THREE.CylinderGeometry(.42,.75,1,12),0x587786,[0,.7,0],[1,1,1],g);tube(0xffa84e,[0,.19,0],[.61,.1,.61],g,{emissive:0xff9844,emissiveIntensity:.55});for(let i=0;i<5;i++){let a=i/5*6.28;box(0xc9dcdd,[Math.sin(a)*.51,.95,Math.cos(a)*.51],[.15,.75,.15],g);}}if(index===2){for(let i=0;i<3;i++){let b=mesh(new THREE.ConeGeometry(.52,1.65,3),0xf57e51,[(i-1)*.32,.8,0],[1,1,.2],g);b.rotation.z=-.35+i*.25;}}if(index===3){tube(0xf5f7ed,[0,.8,0],[.64,1.3,.64],g);tube(0xf77e55,[0,.27,0],[.67,.2,.67],g);tube(0x537587,[0,1.45,0],[.45,.05,.45],g);}if(index===4){box(0x3b6275,[0,.6,0],[1.35,1.1,.8],g);box(0x75e8db,[0,.7,.43],[.98,.65,.05],g,{emissive:0x48c1b7,emissiveIntensity:.65});tube(0xaad5d9,[.45,1.5,0],[.04,1,.04],g);ball(0xffd967,[.45,2.04,0],[.1,.1,.1],g);}if(index===5){spike(0xf78052,[0,.9,0],[.65,1.8,.65],g);tube(0xddded0,[0,.12,0],[.69,.15,.69],g);}return g;}
 PARTS.forEach((p,i)=>{let group=new THREE.Group();group.position.set(p.x,0,p.z);all.add(group);let platform=tube(0x9cc6ce,[0,.08,0],[1.65,.17,1.65],group);let r=new THREE.Mesh(new THREE.RingGeometry(1.25,1.47,40),new THREE.MeshBasicMaterial({color:0xffc75c,transparent:true,opacity:.9,side:THREE.DoubleSide}));r.rotation.x=-Math.PI/2;r.position.y=.19;group.add(r);let model=makeMiniPart(i);model.position.y=.45;group.add(model);const beam=mesh(new THREE.CylinderGeometry(.12,.3,9,8,1,true),0xffd273,[0,4.7,0],[1,1,1],group,{transparent:true,opacity:.12,depthWrite:false,emissive:0xffbc5a,emissiveIntensity:1,side:THREE.DoubleSide});beam.castShadow=false;let ice=null;if(p.kind==='ice'){ice=mesh(new THREE.IcosahedronGeometry(1,1),0x87d9eb,[0,1,0],[1.4,1.6,1.4],group,{transparent:true,opacity:.66,roughness:.2,metalness:.12});}let thief=null;if(p.kind==='penguin'){thief=assets.makePenguin();thief.group.scale.setScalar(1.2);group.add(thief.group);model.position.y=1.65;model.scale.setScalar(.7);}let lock=null;if(p.kind==='relay'||p.kind==='signal'){lock=box(0x7c9099,[0,.6,0],[2,1.1,1.6],group);box(0xe5bb61,[0,1.25,0],[2.08,.18,1.7],group);model.position.y=1.6;}pickups.push({...p,index:i,group,model,ring:r,beam,ice,thief,lock});});
 const switches=SWITCHES.map(p=>{let group=new THREE.Group();group.position.set(p.x,0,p.z);all.add(group);box(0x668591,[0,.6,0],[.8,1.2,.65],group);box(0xdceef0,[0,1.3,0],[1,.35,.8],group);let lamp=ball(0xffa461,[0,1.5,.15],[.19,.17,.19],group,{emissive:0xff6d3d,emissiveIntensity:1});const lever=box(0x2f4f65,[0,1.45,.1],[.08,.6,.08],group);lever.rotation.z=.5;return {...p,group,lamp,lever,on:false};});
 const coinPositions=[];for(const p of PARTS){let len=Math.hypot(p.x,p.z),steps=Math.max(3,Math.floor(len/4));for(let j=1;j<=steps;j++){let t=j/(steps+1),x=p.x*t+Math.sin(t*6)*2,z=p.z*t+Math.cos(t*5)*1.5;if(Math.hypot(x,z)>4&&!obstacles.some(o=>Math.hypot(x-o.x,z-o.z)<o.r+1))coinPositions.push({x,z});}}
 for(let i=0;i<18;i++){let a=rng()*6.28,r=15+rng()*32,x=Math.cos(a)*r,z=Math.sin(a)*r;if(!obstacles.some(o=>Math.hypot(x-o.x,z-o.z)<o.r+1))coinPositions.push({x,z});}
 const coins=coinPositions.map(({x,z},i)=>{let g=new THREE.Group();g.position.set(x,.9,z);all.add(g);let c=mesh(new THREE.CylinderGeometry(.32,.32,.1,12),0xffcc4d,[0,0,0],[1,1,1],g,{metalness:.5,roughness:.35});c.rotation.x=Math.PI/2;let inner=tube(0xffe58b,[0,0,.061],[.23,.01,.23],g,{metalness:.4,roughness:.3});inner.rotation.x=Math.PI/2;return {group:g,x,z,active:true,phase:i*.8};});
 const supply=crate(17,-11,1.3,0xee985e);supply.visible=false;const parachute=ball(0xffe2a2,[0,5,0],[2,.5,2],supply);for(let x of [-1,1]){const cord=box(0xd4e2dc,[x*.5,3,0],[.025,4,.025],supply);cord.rotation.z=x*.18;}
 // Shared dynamic effects: one instanced draw call for all snow, sparks, puffs and footprints.
 const particles=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,0),new THREE.MeshStandardMaterial({color:0xffffff,roughness:1,transparent:true,opacity:.85,depthWrite:false}),500);particles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);particles.frustumCulled=false;all.add(particles);for(let i=0;i<500;i++){tmp.position.set(0,-100,0);tmp.scale.setScalar(0);tmp.updateMatrix();particles.setMatrixAt(i,tmp.matrix);}particles.count=500;
 const snowGeo=new THREE.BufferGeometry(),snowPos=new Float32Array(850*3);for(let i=0;i<850;i++){snowPos[i*3]=(rng()-.5)*220;snowPos[i*3+1]=rng()*28;snowPos[i*3+2]=(rng()-.5)*220;}snowGeo.setAttribute('position',new THREE.BufferAttribute(snowPos,3));const snowMat=new THREE.PointsMaterial({color:0xffffff,size:.10,transparent:true,opacity:.55,depthWrite:false,sizeAttenuation:true});const snowfall=new THREE.Points(snowGeo,snowMat);snowfall.frustumCulled=false;scene.add(snowfall);
 const auroraGeo=new THREE.PlaneGeometry(250,23,40,5), auroraMat=new THREE.ShaderMaterial({transparent:true,side:THREE.DoubleSide,depthWrite:false,uniforms:{time:{value:0},strength:{value:0}},vertexShader:`varying vec2 vUv;uniform float time;void main(){vUv=uv;vec3 p=position;p.z+=sin(p.x*.07+time*.2)*6.;p.y+=sin(p.x*.05+time*.1)*3.;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,fragmentShader:`varying vec2 vUv;uniform float time;uniform float strength;void main(){float a=sin(vUv.y*3.14159)*(.4+.6*pow(sin(vUv.x*45.+time*.2),2.));vec3 c=mix(vec3(.2,.9,.68),vec3(.4,.68,1.),vUv.y);gl_FragColor=vec4(c,a*strength);}`});const aurora=new THREE.Mesh(auroraGeo,auroraMat);aurora.position.set(0,38,-110);scene.add(aurora);
 const pointer=tube(0xff8058,[0,.035,0],[.8,.025,.8],all,{transparent:true,opacity:.22});pointer.visible=false;
 return {THREE,scene,all,terrain,water,ocean,sun,hemisphere,waterUniforms,obstacles,explorer,rival,assets,piff,animals,bears,rocket,novaRocket,pickups,switches,coins,flags,flames,fireLight,floes,beacon,particles,snowfall,snowMat,snowPos,auroraMat,supply,parachute,pointer,mat,mesh,box,ball,makeMiniPart,shoreRadius,onIsland,onIce,boundary,dispose(){scene.traverse(o=>{if(o.geometry)o.geometry.dispose();});for(const m of matCache.values())m.dispose();snowTex.dispose();}};
}
