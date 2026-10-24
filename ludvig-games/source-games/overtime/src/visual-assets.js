import * as THREE from '../vendor/three.module.js';

export const A = Object.freeze({halfWidth:41,halfLength:57,height:25,cornerRadius:10,rampRadius:5,goalWidth:18,goalHeight:9,goalDepth:8,ballRadius:1.8});
export const BLUE = 0x33bcf1, ORANGE = 0xff923b;
const TAU=Math.PI*2;
function rng(seed=1241){return ()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};}
function texture(w,h,paint){const c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d');paint(ctx,w,h);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;}
function mesh(g,m,p,parent,rx=0,ry=0,rz=0){const v=new THREE.Mesh(g,m);if(p)v.position.set(...p);v.rotation.set(rx,ry,rz);if(parent)parent.add(v);return v;}
const box=(x,y,z)=>new THREE.BoxGeometry(x,y,z);
const standard=(color,roughness=.65,metalness=0)=>new THREE.MeshStandardMaterial({color,roughness,metalness});
const glow=(color,intensity=1)=>new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:intensity,roughness:.3,metalness:.15});

export function makeEnvironment(renderer){
 const tex=texture(1024,512,(c,w,h)=>{const g=c.createLinearGradient(0,0,0,h);g.addColorStop(0,'#93b6d3');g.addColorStop(.38,'#bdcbd3');g.addColorStop(.53,'#3d5260');g.addColorStop(.7,'#243340');g.addColorStop(1,'#101a24');c.fillStyle=g;c.fillRect(0,0,w,h);c.fillStyle='#dbe7ef';for(let i=0;i<6;i++)c.fillRect(55+i*174,100,90,42);c.fillStyle='#9bceda';c.fillRect(0,258,w,5);});
 tex.mapping=THREE.EquirectangularReflectionMapping;const p=new THREE.PMREMGenerator(renderer);p.compileEquirectangularShader();const target=p.fromEquirectangular(tex);tex.dispose();p.dispose();return target;
}

export function makeSky(){
 const m=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,uniforms:{},vertexShader:'varying vec3 vP;void main(){vP=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'varying vec3 vP;void main(){vec3 d=normalize(vP);float h=clamp(d.y*1.4,0.,1.);vec3 col=mix(vec3(.36,.50,.59),vec3(.075,.16,.28),pow(h,.55));float sun=pow(max(0.,dot(d,normalize(vec3(-.5,.3,-.7)))),260.);col+=vec3(1.,.82,.57)*sun*.6;gl_FragColor=vec4(col,1.);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>}',fog:false});
 return new THREE.Mesh(new THREE.SphereGeometry(550,24,12),m);
}

export function perimeter(){
 const pts=[];const line=(ax,az,bx,bz,nx,nz,count)=>{for(let i=0;i<count;i++){const t=i/count;pts.push({x:ax+(bx-ax)*t,z:az+(bz-az)*t,nx,nz});}};
 const arc=(cx,cz,a)=>{for(let i=0;i<12;i++){const q=a+i/12*Math.PI/2;pts.push({x:cx+10*Math.cos(q),z:cz+10*Math.sin(q),nx:Math.cos(q),nz:Math.sin(q)});}};
 // Explicit goal edges keep the opening exactly 18 m wide.
 line(-31,-57,-9,-57,0,-1,8);line(-9,-57,9,-57,0,-1,6);line(9,-57,31,-57,0,-1,8);arc(31,-47,-Math.PI/2);
 line(41,-47,41,47,1,0,32);arc(31,47,0);
 line(31,57,9,57,0,1,8);line(9,57,-9,57,0,1,6);line(-9,57,-31,57,0,1,8);arc(-31,47,Math.PI/2);
 line(-41,47,-41,-47,-1,0,32);arc(-31,-47,Math.PI);return pts;
}
function stripGeometry(pts,profile,skipGoal=false){
 const v=[],uv=[],idx=[];let length=0;
 for(let i=0;i<pts.length;i++){const p=pts[i],q=pts[(i+1)%pts.length],d=Math.hypot(q.x-p.x,q.z-p.z);const goal=Math.abs((p.z+q.z)*.5)>56.99&&Math.abs((p.x+q.x)*.5)<9;
  if(!(skipGoal&&goal)){const base=v.length/3;for(const a of [p,q])for(let j=0;j<profile.length;j++){const [o,y]=profile[j];v.push(a.x+a.nx*o,y,a.z+a.nz*o);uv.push((length+(a===q?d:0))/18,j/(profile.length-1));}for(let j=0;j<profile.length-1;j++){const a=base+j,b=a+profile.length;idx.push(a,b,a+1,b,b+1,a+1);}}
  length+=d;
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(v,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();return g;
}
function lineLoop(pts,offset,y,color,parent,opacity=.5){const arr=[];for(const p of [...pts,pts[0]])arr.push(p.x+p.nx*offset,y,p.z+p.nz*offset);const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(arr,3));const l=new THREE.Line(g,new THREE.LineBasicMaterial({color,transparent:true,opacity}));parent.add(l);return l;}
function turfTexture(){return texture(2048,2048,(c,w,h)=>{
 c.fillStyle='#36725c';c.fillRect(0,0,w,h);for(let i=0;i<16;i++){c.fillStyle=i%2?'#37705c':'#3e7962';c.fillRect(0,i*h/16,w,h/16);}
 const r=rng(881);for(let i=0;i<170000;i++){const x=r()*w,y=r()*h;c.fillStyle=r()<.5?'rgba(15,40,28,.10)':'rgba(179,211,151,.10)';c.fillRect(x,y,.7+r()*1.2,1+r()*3);}
 const sx=w/82,sz=h/114;const X=x=>w/2+x*sx,Z=z=>h/2+z*sz;
 c.strokeStyle='rgba(229,244,225,.83)';c.lineWidth=2.5;
 c.beginPath();c.moveTo(X(-36),Z(0));c.lineTo(X(36),Z(0));c.stroke();c.beginPath();c.ellipse(X(0),Z(0),9*sx,9*sz,0,0,TAU);c.stroke();
 c.fillStyle='#eaf3df';c.beginPath();c.arc(X(0),Z(0),4,0,TAU);c.fill();
 for(const sign of [-1,1]){c.strokeStyle=sign===1?'rgba(94,201,238,.72)':'rgba(255,178,107,.72)';c.lineWidth=3.5;c.beginPath();c.moveTo(X(-17),Z(sign*52));c.lineTo(X(-17),Z(sign*35));c.lineTo(X(17),Z(sign*35));c.lineTo(X(17),Z(sign*52));c.stroke();c.lineWidth=2;c.beginPath();c.ellipse(X(0),Z(sign*35),8*sx,8*sz,0,sign===1?Math.PI:0,sign===1?TAU:Math.PI);c.stroke();
  c.strokeStyle='rgba(241,245,227,.62)';c.beginPath();c.moveTo(X(-9),Z(sign*52));c.lineTo(X(-9),Z(sign*46));c.lineTo(X(9),Z(sign*46));c.lineTo(X(9),Z(sign*52));c.stroke();
  c.save();c.translate(X(0),Z(sign*27));if(sign>0)c.rotate(Math.PI);c.globalAlpha=.12;c.fillStyle='#e6f3df';c.font='900 90px sans-serif';c.textAlign='center';c.fillText('OVERTIME',0,0);c.restore();
 }
 c.strokeStyle='rgba(226,239,215,.50)';c.lineWidth=2;c.beginPath();c.roundRect(X(-35),Z(-50),70*sx,100*sz,7*sx);c.stroke();
});}
function adTexture(){const t=texture(2048,128,(c,w,h)=>{c.fillStyle='#0b1c2a';c.fillRect(0,0,w,h);c.fillStyle='#7bd8ef';c.font='900 48px sans-serif';c.textBaseline='middle';c.fillText('OVERTIME',35,64);c.fillStyle='#f1f8fa';c.font='700 28px monospace';c.fillText('BOOST / FLY / SCORE',418,64);c.fillStyle='#fca25d';c.font='900 48px sans-serif';c.fillText('PLAY LOUD.',1038,64);c.fillStyle='#b3c8d4';c.font='700 25px monospace';c.fillText('ARENA 01  //  NIGHT LEAGUE',1460,64);c.fillStyle='#35bce8';c.fillRect(0,0,w,3);});t.wrapS=THREE.RepeatWrapping;t.wrapT=THREE.ClampToEdgeWrapping;return t;}
function netTexture(){const t=texture(256,256,(c,w,h)=>{c.clearRect(0,0,w,h);c.strokeStyle='rgba(196,227,239,.4)';c.lineWidth=1.4;for(let i=0;i<=256;i+=32){c.beginPath();c.moveTo(i,0);c.lineTo(i,256);c.moveTo(0,i);c.lineTo(256,i);c.stroke();}});t.wrapS=t.wrapT=THREE.RepeatWrapping;return t;}

// Batch repeated static details once at construction; dynamic cars keep independent roots.
function batchStatic(root, recursive=false){
 root.updateMatrixWorld(true);const inverse=root.matrixWorld.clone().invert(),items=[];
 if(recursive)root.traverse(o=>{if(o.isMesh&&!o.isInstancedMesh&&!Array.isArray(o.material))items.push(o);});
 else for(const o of root.children)if(o.isMesh&&!o.isInstancedMesh&&!Array.isArray(o.material))items.push(o);
 const groups=new Map();for(const o of items){const m=o.material;const key=[m.type,m.color?.getHex(),m.emissive?.getHex(),m.emissiveIntensity,m.roughness,m.metalness,m.opacity,m.transparent,m.blending,m.side,m.map?.uuid,m.emissiveMap?.uuid,o.castShadow,o.receiveShadow].join('|');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(o);}
 for(const list of groups.values()){if(list.length<2)continue;let count=0;const converted=[];for(const o of list){const geo=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse,o.matrixWorld));converted.push(geo);count+=geo.attributes.position.count;}
  const positions=new Float32Array(count*3),normals=new Float32Array(count*3),uvs=new Float32Array(count*2);let n=0;for(const geo of converted){positions.set(geo.attributes.position.array,n*3);if(geo.attributes.normal)normals.set(geo.attributes.normal.array,n*3);if(geo.attributes.uv)uvs.set(geo.attributes.uv.array,n*2);n+=geo.attributes.position.count;geo.dispose();}
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(positions,3));geo.setAttribute('normal',new THREE.BufferAttribute(normals,3));geo.setAttribute('uv',new THREE.BufferAttribute(uvs,2));geo.computeBoundingSphere();const merged=new THREE.Mesh(geo,list[0].material);merged.castShadow=list[0].castShadow;merged.receiveShadow=list[0].receiveShadow;for(const o of list){o.parent.remove(o);o.geometry.dispose();}root.add(merged);
 }
}

function batchColoredWheel(root){
 root.updateMatrixWorld(true);const inverse=root.matrixWorld.clone().invert(),items=root.children.filter(o=>o.isMesh);let count=0;const parts=[];
 for(const o of items){const geo=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse,o.matrixWorld));parts.push({geo,color:o.material.color});count+=geo.attributes.position.count;}
 const positions=new Float32Array(count*3),normals=new Float32Array(count*3),colors=new Float32Array(count*3);let offset=0;
 for(const part of parts){const g=part.geo;positions.set(g.attributes.position.array,offset*3);normals.set(g.attributes.normal.array,offset*3);for(let i=0;i<g.attributes.position.count;i++){colors[(offset+i)*3]=part.color.r;colors[(offset+i)*3+1]=part.color.g;colors[(offset+i)*3+2]=part.color.b;}offset+=g.attributes.position.count;g.dispose();}
 const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(positions,3));geo.setAttribute('normal',new THREE.BufferAttribute(normals,3));geo.setAttribute('color',new THREE.BufferAttribute(colors,3));const m=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({vertexColors:true,roughness:.63,metalness:.32}));for(const o of items){root.remove(o);o.geometry.dispose();}root.add(m);
}

export function makeStadium(scene){
 const stadium=new THREE.Group();stadium.name='Stadium';scene.add(stadium);const pts=perimeter();const turf=turfTexture();turf.anisotropy=8;
 const groundMat=new THREE.MeshStandardMaterial({map:turf,roughness:.96,metalness:0});const ground=mesh(new THREE.PlaneGeometry(82,114),groundMat,[0,-.018,0],stadium,-Math.PI/2);ground.receiveShadow=true;
 const foundation=mesh(box(115,2,150),standard(0x101e2c),[0,-1.25,0],stadium);
 const lower=[];for(let i=0;i<=18;i++){const a=i/18*Math.PI/2;lower.push([-5+5*Math.sin(a),5-5*Math.cos(a)]);}
 const rampMat=standard(0x3f7366,.83,.05);rampMat.side=THREE.DoubleSide;const ramp=mesh(stripGeometry(pts,lower,true),rampMat,null,stadium);ramp.receiveShadow=true;
 const wallmat=new THREE.MeshPhysicalMaterial({color:0x6ca7b9,transparent:true,opacity:.045,roughness:.15,metalness:.08,side:THREE.DoubleSide,depthWrite:false});
 mesh(stripGeometry(pts,[[0,5],[0,20]],true),wallmat,null,stadium);
 // Above the goal aperture the transparent wall continues up to the roof.
 for(const s of [-1,1])mesh(new THREE.PlaneGeometry(18,11),wallmat,[0,14.5,s*57],stadium,0,s<0?0:Math.PI);
 const roofCurve=[];for(let i=0;i<=12;i++){const a=i/12*Math.PI/2;roofCurve.push([-5+5*Math.cos(a),20+5*Math.sin(a)]);}mesh(stripGeometry(pts,roofCurve),new THREE.MeshBasicMaterial({color:0x7eacc1,transparent:true,opacity:.025,side:THREE.DoubleSide,depthWrite:false}),null,stadium);
 lineLoop(pts,0,20,0x9ac3d5,stadium,.26);lineLoop(pts,-5,25,0x9ac3d5,stadium,.16);lineLoop(pts,0,5,0xbee4ef,stadium,.23);
 const railMat=standard(0x20374a,.4,.65);mesh(stripGeometry(pts,[[.15,5],[.15,5.18],[.45,5.18],[.45,5]]),railMat,null,stadium);
 const ads=adTexture(),adsMat=new THREE.MeshStandardMaterial({map:ads,emissiveMap:ads,emissive:0xffffff,emissiveIntensity:.7,roughness:.7,side:THREE.DoubleSide});mesh(stripGeometry(pts,[[.4,5.25],[.4,7.3]],true),adsMat,null,stadium);
 for(const s of [-1,1]){
  const color=s===1?BLUE:ORANGE,mat=glow(color,1.8),trim=standard(0xe0e9eb,.25,.8),net=netTexture();net.repeat.set(3.6,1.8);const nm=new THREE.MeshBasicMaterial({map:net,transparent:true,opacity:.58,side:THREE.DoubleSide,depthWrite:false});
  mesh(box(18.6,.36,.48),mat,[0,9.05,s*57],stadium);mesh(box(.38,9.35,.48),mat,[-9.15,4.48,s*57],stadium);mesh(box(.38,9.35,.48),mat,[9.15,4.48,s*57],stadium);
  mesh(box(18.9,.14,.6),trim,[0,9.35,s*57],stadium);mesh(box(.12,9.3,.65),trim,[-9.42,4.55,s*57],stadium);mesh(box(.12,9.3,.65),trim,[9.42,4.55,s*57],stadium);
  const goalFloor=mesh(new THREE.PlaneGeometry(18,8),standard(s===1?0x1d6e8a:0x935326,.7,.15),[0,.005,s*61],stadium,-Math.PI/2);goalFloor.receiveShadow=true;
  mesh(new THREE.PlaneGeometry(18,9),nm,[0,4.5,s*65],stadium,0,s<0?0:Math.PI);
  mesh(new THREE.PlaneGeometry(8,9),nm,[-9,4.5,s*61],stadium,0,Math.PI/2);mesh(new THREE.PlaneGeometry(8,9),nm,[9,4.5,s*61],stadium,0,Math.PI/2);
  mesh(new THREE.PlaneGeometry(18,8),nm,[0,9,s*61],stadium,Math.PI/2);
  for(const x of [-9,9])mesh(box(.11,.11,8),trim,[x,9,s*61],stadium);
  mesh(box(18,.12,.12),mat,[0,.07,s*65],stadium);mesh(box(18,.12,.12),mat,[0,9,s*65],stadium);
  const light=new THREE.PointLight(color,35,17,2);light.position.set(0,5,s*60);stadium.add(light);
 }
 // Twelve continuous seating terraces form an occupied, substantial stadium.
 const terraceMat=standard(0x1c2a3a,.9),riserMat=standard(0x162130,.86),people=rng(459);const crowdBody=new THREE.InstancedMesh(new THREE.BoxGeometry(.4,.53,.28),new THREE.MeshStandardMaterial({color:0xffffff,roughness:.95}),5200);const heads=new THREE.InstancedMesh(new THREE.SphereGeometry(.14,5,4),standard(0x9b928a,.95),5200);const o=new THREE.Object3D();const c=new THREE.Color();let ci=0;
 for(let row=0;row<12;row++){
  const offset=3.2+row*1.18,y=10+row*.88;mesh(stripGeometry(pts,[[offset,y],[offset+1.18,y]]),terraceMat,null,stadium);mesh(stripGeometry(pts,[[offset,y],[offset,y-.88]]),riserMat,null,stadium);
  if(row%4===3)lineLoop(pts,offset,y+.57,0x678092,stadium,.26);
  for(let i=0;i<pts.length;i++){const p=pts[i],q=pts[(i+1)%pts.length],d=Math.hypot(q.x-p.x,q.z-p.z);const count=Math.max(1,Math.floor(d/.97));for(let j=0;j<count&&ci<5200;j++){
   const t=(j+.5)/count,px=p.x+(q.x-p.x)*t+(p.nx+(q.nx-p.nx)*t)*(offset+.55),pz=p.z+(q.z-p.z)*t+(p.nz+(q.nz-p.nz)*t)*(offset+.55);
   if((Math.abs(px)<3.2&&Math.abs(pz)>60)||(Math.abs(pz)<3.2&&Math.abs(px)>42))continue;if(people()<.075)continue;
   o.position.set(px+(people()-.5)*.18,y+.35,pz);o.scale.set(.8+people()*.5,.8+people()*.45,1);o.rotation.y=Math.atan2(-p.nx,-p.nz);o.updateMatrix();crowdBody.setMatrixAt(ci,o.matrix);
   const palette=[0x346f92,0x9d674f,0x8c9ca6,0x48746a,0x233b51,0xc4a477,0x596a8a,0x77a1ad];c.setHex(palette[Math.floor(people()*palette.length)]);crowdBody.setColorAt(ci,c);o.position.y=y+.77;o.scale.setScalar(.92+people()*.2);o.updateMatrix();heads.setMatrixAt(ci,o.matrix);ci++;
  }}
 }
 crowdBody.count=heads.count=ci;stadium.add(crowdBody,heads);crowdBody.instanceMatrix.needsUpdate=heads.instanceMatrix.needsUpdate=true;
 const crowdUniform={value:0};crowdBody.material.onBeforeCompile=shader=>{shader.uniforms.uCrowdTime=crowdUniform;shader.vertexShader='uniform float uCrowdTime;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nfloat wave = sin(uCrowdTime*1.4+instanceMatrix[3].x*.12+instanceMatrix[3].z*.09); transformed.y += max(0.,wave-.65)*.16;');};
 // Floating roof rim, steel columns and floodlight arrays.
 const roof=standard(0x1d3042,.55,.65),rib=standard(0x375066,.5,.7);mesh(stripGeometry(pts,[[15.9,23.2],[19.5,24.1],[20.5,24.4],[20.5,25.1],[12.5,24.7],[11.9,24.3]]),roof,null,stadium);lineLoop(pts,12,24.1,0x74c3dc,stadium,.75);
 const lightMat=glow(0xd5efff,2.4);for(let i=0;i<pts.length;i+=10){const p=pts[i];mesh(box(.32,18,.32),rib,[p.x+p.nx*17,15,p.z+p.nz*17],stadium);const lightGroup=new THREE.Group();lightGroup.position.set(p.x+p.nx*10,23,p.z+p.nz*10);lightGroup.lookAt(0,0,0);stadium.add(lightGroup);for(let j=-2;j<=2;j++)mesh(box(.7,.32,.15),lightMat,[j*.83,0,0],lightGroup);}
 // Ceiling structure is sparse and stays above the playable space.
 const ceilingLines=[];for(let x=-30;x<=30;x+=10){ceilingLines.push(x,25.2,-48,x,25.2,48);}for(let z=-40;z<=40;z+=10){ceilingLines.push(-34,25.2,z,34,25.2,z);}const cg=new THREE.BufferGeometry();cg.setAttribute('position',new THREE.Float32BufferAttribute(ceilingLines,3));stadium.add(new THREE.LineSegments(cg,new THREE.LineBasicMaterial({color:0xabc5d3,transparent:true,opacity:.08})));
 const scoreCanvas=document.createElement('canvas');scoreCanvas.width=1024;scoreCanvas.height=256;const scoreCtx=scoreCanvas.getContext('2d'),scoreTex=new THREE.CanvasTexture(scoreCanvas);scoreTex.colorSpace=THREE.SRGBColorSpace;
 const sm=new THREE.MeshStandardMaterial({map:scoreTex,emissiveMap:scoreTex,emissive:0xffffff,emissiveIntensity:.8,roughness:.6});
 for(const s of [-1,1]){mesh(box(33,8,.8),standard(0x0d1824,.4,.7),[0,23,s*76],stadium);mesh(new THREE.PlaneGeometry(31.8,7.5),sm,[0,23,s*75.5],stadium,0,s>0?Math.PI:0);for(const x of [-11,11])mesh(box(.7,13,.7),rib,[x,17,s*76],stadium);}
 let lastScore='';function updateScore(blue=0,orange=0,label='5:00'){const key=`${blue}|${orange}|${label}`;if(key===lastScore)return;lastScore=key;const c=scoreCtx;c.fillStyle='#081523';c.fillRect(0,0,1024,256);c.fillStyle='#263a4c';c.fillRect(0,0,1024,3);c.textAlign='center';c.textBaseline='middle';c.fillStyle='#a6bdcd';c.font='600 24px sans-serif';c.fillText('OVERTIME  /  ARENA 01',512,38);c.fillStyle='#44c8f6';c.font='900 112px sans-serif';c.fillText(String(blue),255,145);c.fillStyle='#ff9c50';c.fillText(String(orange),770,145);c.fillStyle='#edf5fa';c.font='700 68px monospace';c.fillText(label,512,145);c.font='700 18px sans-serif';c.fillStyle='#85a3b7';c.fillText('BLUE',255,226);c.fillText('ORANGE',770,226);c.fillStyle='#43c1f1';c.fillRect(0,250,512,6);c.fillStyle='#f58b3b';c.fillRect(512,250,512,6);scoreTex.needsUpdate=true;}
 updateScore();batchStatic(stadium,true);return {stadium,updateScore,ads,crowdUniform};
}

function loft(sections,material){
 const verts=[],idx=[];for(const s of sections){const [z,w,b,t]=s;const ring=[[-w*.83,b],[w*.83,b],[w,b+.10],[w,t-.11],[w*.81,t],[-w*.81,t],[-w,t-.11],[-w,b+.1]];for(const [x,y]of ring)verts.push(x,y,z);}
 for(let i=0;i<sections.length-1;i++)for(let k=0;k<8;k++){const a=i*8+k,b=i*8+(k+1)%8;idx.push(a,b,a+8,b,b+8,a+8);}for(let k=1;k<7;k++){idx.push(0,k+1,k);const o=(sections.length-1)*8;idx.push(o,o+k,o+k+1);}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));g.setIndex(idx);g.computeVertexNormals();const m=new THREE.Mesh(g,material);m.castShadow=true;return m;
}
function labelSprite(text,color){const t=texture(256,64,(c,w,h)=>{c.fillStyle='rgba(6,18,29,.68)';c.beginPath();c.roundRect(2,5,252,51,8);c.fill();c.fillStyle=color;c.fillRect(4,10,4,41);c.fillStyle='#f6fbff';c.font='800 27px sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText(text.toUpperCase().slice(0,13),130,33);});const s=new THREE.Sprite(new THREE.SpriteMaterial({map:t,transparent:true,depthTest:false,depthWrite:false}));s.scale.set(4.5,1.125,1);s.position.y=3;s.renderOrder=20;return s;}

export function makeCar(car,cosmetics={}){
 const g=new THREE.Group();g.name=`Car ${car.name||car.id}`;const teamColor=car.team===0?BLUE:ORANGE;const paintHex=car.isPlayer?(car.team===0?cosmetics.paint:cosmetics.orangePaint):teamColor;
 const paint=new THREE.MeshStandardMaterial({color:paintHex||teamColor,roughness:.24,metalness:.66});const dark=standard(0x101923,.5,.48),chrome=standard(0x9faeb7,.23,.95),glass=new THREE.MeshStandardMaterial({color:0x10232f,roughness:.12,metalness:.72});const carbon=standard(0x111a20,.68,.35),stripe=standard(0xe2ecea,.3,.52);
 // Sculpted fenders, tapered bonnet and swept cockpit replace primitive boxes.
 g.add(loft([[-1.99,.77,-.34,.02],[-1.78,1.02,-.36,.26],[-1.10,1.02,-.34,.36],[.78,1.02,-.32,.4],[1.52,1.01,-.3,.32],[1.91,.82,-.24,.12]],paint));
 g.add(loft([[-1.07,.70,.29,.36],[-.4,.70,.31,.91],[.55,.71,.31,.97],[1.19,.74,.3,.46]],glass));
 g.add(loft([[-.41,.62,.87,.95],[.55,.64,.94,1.02],[.70,.62,.85,.93]],paint));
 for(const x of [-.82,.82]){mesh(box(.12,.35,.1),paint,[x*.83,.64,-.7],g,-.82);mesh(box(.11,.52,.11),paint,[x*.85,.66,.6],g,.55);mesh(box(.08,.48,.07),paint,[x*.85,.62,.14],g);}
 for(const x of [-.28,.28]){const hoodStripe=mesh(box(.18,.025,1.04),stripe,[x,.329,-1.37],g,-.075);mesh(box(.18,.023,.76),stripe,[x,1.025,.18],g);}
 // Splitter, sills, functional-looking vents and grille.
 mesh(box(1.92,.11,.24),carbon,[0,-.31,-1.93],g);mesh(box(1.55,.15,.13),dark,[0,-.1,-1.98],g);for(let i=-5;i<=5;i++)mesh(box(.035,.10,.024),chrome,[i*.117,-.09,-2.054],g);
 for(const side of [-1,1]){mesh(box(.10,.13,2.87),carbon,[side*1.035,-.24,.03],g);mesh(box(.18,.11,.35),paint,[side*.94,.47,-.5],g);mesh(box(.12,.07,.29),glass,[side*1.04,.48,-.52],g);for(let k=0;k<3;k++)mesh(box(.035,.015,.24),dark,[side*(.49+k*.09),.367,-1.06],g);}
 const headlamp=glow(0xe2f7ff,2.2),tail=glow(0xff3e2b,2);
 for(const side of [-1,1]){mesh(box(.47,.075,.095),headlamp,[side*.65,.125,-1.89],g,0,side*.12);mesh(box(.42,.065,.10),tail,[side*.61,.17,1.85],g);}
 // Rear wing, mounts and dual rocket exhausts.
 for(const x of [-.66,.66])mesh(box(.10,.42,.12),carbon,[x,.51,1.48],g,.12);
 mesh(box(2.17,.13,.36),carbon,[0,.75,1.57],g,-.12);for(const x of [-1.07,1.07])mesh(box(.07,.32,.47),paint,[x,.78,1.57],g);
 const exhaustMat=standard(0x3e4d58,.25,.95),inner=standard(0x050b10,.9);const flames=[];
 const flameColor=car.isPlayer?(cosmetics.trail||'#64ddff'):(car.team===0?'#52caff':'#ff8b35');
 for(const x of [-.54,.54]){const pipe=mesh(new THREE.CylinderGeometry(.2,.23,.38,12),exhaustMat,[x,-.08,1.86],g,Math.PI/2);mesh(new THREE.CircleGeometry(.15,12),inner,[x,-.08,2.06],g,0,Math.PI);const f=new THREE.Group();f.position.set(x,-.08,2.0);g.add(f);const outer=new THREE.Mesh(new THREE.ConeGeometry(.27,1.7,10,1,true),new THREE.MeshBasicMaterial({color:flameColor,transparent:true,opacity:.65,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide}));outer.rotation.x=Math.PI/2;outer.position.z=.8;f.add(outer);const core=new THREE.Mesh(new THREE.ConeGeometry(.14,.9,8,1,true),new THREE.MeshBasicMaterial({color:0xf3fbff,transparent:true,opacity:.9,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide}));core.rotation.x=Math.PI/2;core.position.z=.4;f.add(core);flames.push(f);f.visible=false;}
 const wheels=[],style=cosmetics.wheels||'sport';for(const side of [-1,1])for(const front of [-1,1]){
  const root=new THREE.Group();root.position.set(side*1.02,-.39,front*1.23);g.add(root);const spin=new THREE.Group();root.add(spin);
  const tyre=mesh(new THREE.CylinderGeometry(.52,.52,.37,20),standard(0x0b1015,.88),[0,0,0],spin,0,0,Math.PI/2);tyre.castShadow=true;
  mesh(new THREE.TorusGeometry(.39,.055,6,20),standard(0x222c35,.7),[side*.195,0,0],spin,0,Math.PI/2);
  const rimColor=style==='classic'?0xbdc7cc:style==='turbine'?0x96a6b1:0x6d8392;mesh(new THREE.CylinderGeometry(.34,.34,.025,16),standard(0x14232e,.5,.8),[side*.205,0,0],spin,0,0,Math.PI/2);
  const spokes=style==='turbine'?10:style==='classic'?5:6;for(let j=0;j<spokes;j++){const a=j/spokes*TAU;const spoke=mesh(box(.035,.30,.065),standard(rimColor,.3,.9),[side*.23,Math.cos(a)*.16,Math.sin(a)*.16],spin,a);}
  mesh(new THREE.CylinderGeometry(.09,.09,.045,10),chrome,[side*.25,0,0],spin,0,0,Math.PI/2);
  const caliper=mesh(box(.07,.23,.09),glow(teamColor,.2),[side*1.23,-.29,front*1.23+.2],g);
  const arch=mesh(new THREE.TorusGeometry(.57,.07,5,16,Math.PI),carbon,[side*1.0,-.38,front*1.23],g,0,Math.PI/2);arch.rotation.x=-Math.PI/2;
  wheels.push({root,spin,front:front===-1,side});
 }
 const label=labelSprite(car.name||'PLAYER',car.team===0?'#49caff':'#ff9b50');g.add(label);label.visible=!car.isPlayer;
 const shadowTex=texture(64,64,(c,w,h)=>{const gr=c.createRadialGradient(32,32,2,32,32,32);gr.addColorStop(0,'rgba(0,0,0,.45)');gr.addColorStop(.55,'rgba(0,0,0,.28)');gr.addColorStop(1,'rgba(0,0,0,0)');c.fillStyle=gr;c.fillRect(0,0,w,h);});
 const shadow=new THREE.Mesh(new THREE.PlaneGeometry(4.1,6),new THREE.MeshBasicMaterial({map:shadowTex,transparent:true,depthWrite:false,opacity:.8}));shadow.rotation.x=-Math.PI/2;
 for(const wheel of wheels)batchColoredWheel(wheel.spin);for(const child of g.children)if(child.isMesh)child.castShadow=child.material===paint;batchStatic(g);
 return {group:g,paint,wheels,flames,label,shadow,team:car.team,id:car.id,isPlayer:car.isPlayer,trailColor:new THREE.Color(flameColor),emit:0};
}

export function makeBall(){
 const g=new THREE.Group();g.name='Match ball';const base=new THREE.Mesh(new THREE.SphereGeometry(A.ballRadius*.994,32,20),standard(0x1c2931,.54,.6));base.castShadow=true;g.add(base);
 const ico=new THREE.IcosahedronGeometry(1,0),p=ico.attributes.position,vertices=[],faces=[];function get(x,y,z){let i=vertices.findIndex(v=>Math.abs(v.x-x)<1e-4&&Math.abs(v.y-y)<1e-4&&Math.abs(v.z-z)<1e-4);if(i<0){i=vertices.length;vertices.push(new THREE.Vector3(x,y,z).normalize());}return i;}
 for(let i=0;i<p.count;i+=3)faces.push([get(p.getX(i),p.getY(i),p.getZ(i)),get(p.getX(i+1),p.getY(i+1),p.getZ(i+1)),get(p.getX(i+2),p.getY(i+2),p.getZ(i+2))]);ico.dispose();
 const dirs=new Map(),neighbors=vertices.map(()=>new Set());const edge=(a,b)=>{const key=a+','+b;if(!dirs.has(key))dirs.set(key,vertices[a].clone().multiplyScalar(2/3).addScaledVector(vertices[b],1/3).normalize());neighbors[a].add(b);return dirs.get(key);};
 const polygons=[];for(const [a,b,c]of faces)polygons.push({dark:false,points:[edge(a,b),edge(b,a),edge(b,c),edge(c,b),edge(c,a),edge(a,c)]});
 for(let a=0;a<vertices.length;a++){const normal=vertices[a],axis=new THREE.Vector3(0,1,0);if(Math.abs(normal.y)>.9)axis.set(1,0,0);const u=axis.cross(normal).normalize(),v=normal.clone().cross(u);const points=[...neighbors[a]].map(b=>edge(a,b));points.sort((a,b)=>Math.atan2(a.dot(v),a.dot(u))-Math.atan2(b.dot(v),b.dot(u)));polygons.push({dark:true,points});}
 const pos=[],norm=[],cols=[],uv=[];const add=v=>{pos.push(v.x,v.y,v.z);const n=v.clone().normalize();norm.push(n.x,n.y,n.z);};
 for(const poly of polygons){const center=new THREE.Vector3();for(const v of poly.points)center.add(v);center.normalize();const ring=poly.points.map(p=>p.clone().lerp(center,.037).normalize().multiplyScalar(A.ballRadius));const cc=center.clone().multiplyScalar(A.ballRadius*1.006),color=new THREE.Color(poly.dark?0x273b49:0xe0e8df);
  for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length];const normal=a.clone().sub(cc).cross(b.clone().sub(cc));const vs=normal.dot(cc)>0?[cc,a,b]:[cc,b,a];for(const v of vs){add(v);cols.push(color.r,color.g,color.b);}}
 }
 const pg=new THREE.BufferGeometry();pg.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));pg.setAttribute('normal',new THREE.Float32BufferAttribute(norm,3));pg.setAttribute('color',new THREE.Float32BufferAttribute(cols,3));const panels=new THREE.Mesh(pg,new THREE.MeshStandardMaterial({vertexColors:true,metalness:.4,roughness:.32}));panels.castShadow=true;g.add(panels);
 const ballShadow=texture(64,64,(c,w,h)=>{const r=c.createRadialGradient(32,32,0,32,32,32);r.addColorStop(0,'rgba(0,0,0,.65)');r.addColorStop(.5,'rgba(0,0,0,.23)');r.addColorStop(1,'rgba(0,0,0,0)');c.fillStyle=r;c.fillRect(0,0,w,h);});const shadow=new THREE.Mesh(new THREE.PlaneGeometry(6,6),new THREE.MeshBasicMaterial({map:ballShadow,transparent:true,depthWrite:false,opacity:.8}));shadow.rotation.x=-Math.PI/2;
 const marker=new THREE.Mesh(new THREE.RingGeometry(1.91,2.02,40),new THREE.MeshBasicMaterial({color:0xe5ede1,transparent:true,opacity:.36,side:THREE.DoubleSide,depthWrite:false}));marker.rotation.x=-Math.PI/2;return{group:g,shadow,marker};
}

export function makePad(pad){
 const g=new THREE.Group(),large=pad.large;g.position.copy(pad.position);const mat=standard(0x1b2d36,.58,.5);mesh(new THREE.CylinderGeometry(large?1.65:.75,large?1.8:.85,.13,large?8:6),mat,[0,.035,0],g);
 const ring=mesh(new THREE.TorusGeometry(large?1.38:.58,large?.07:.045,6,large?32:20),glow(0xf5b946,1.5),[0,.12,0],g,Math.PI/2);const core=mesh(new THREE.OctahedronGeometry(large?.58:.2),glow(0xffd36e,1.35),[0,large?.93:.3,0],g);
 if(large){const inner=mesh(new THREE.TorusGeometry(.87,.035,5,24),glow(0xf5bc4a,.8),[0,.17,0],g,Math.PI/2);for(let i=0;i<3;i++){const a=i/3*TAU;mesh(box(.15,.05,.35),glow(0xffd36e,.6),[Math.cos(a)*1.1,.14,Math.sin(a)*1.1],g,0,-a);}}
 const halo=mesh(new THREE.CircleGeometry(large?1.6:.7,24),new THREE.MeshBasicMaterial({color:0xffbc41,transparent:true,opacity:.1,depthWrite:false,blending:THREE.AdditiveBlending}),[0,.13,0],g,-Math.PI/2);return{group:g,ring,core,halo,large,active:true};
}
