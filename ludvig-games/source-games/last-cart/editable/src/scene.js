import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const TAU=Math.PI*2;
const clamp=THREE.MathUtils.clamp;
const lerp=THREE.MathUtils.lerp;
const boxGeo=new THREE.BoxGeometry(1,1,1);
const sphereGeo=new THREE.SphereGeometry(1,14,10);
const cylGeo=new THREE.CylinderGeometry(1,1,1,12);
const temp=new THREE.Object3D();
function rng(seed=17){return()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};}
function mat(color,roughness=.6,metalness=0){return new THREE.MeshStandardMaterial({color,roughness,metalness});}
const M={steel:mat(0xaac4c8,.25,.82),dark:mat(0x24363c,.7,.3),rubber:mat(0x172529,.86),white:mat(0xf4f0db,.5),skin:mat(0xf4ba8a,.72),sole:mat(0xf1e8cf,.7),black:mat(0x16272d,.55),lime:mat(0xd5f54b,.4),orange:mat(0xff7647,.5),wood:mat(0xd2ac6f,.8),pink:mat(0xf3a0a0,.6),blue:mat(0x97c4d4,.6)};
const sharedGeometries=new Set([boxGeo,sphereGeo,cylGeo]);
const sharedMaterials=new Set(Object.values(M));
function disposeTrees(roots){
  const geometries=new Set(),materials=new Set(),textures=new Set();
  for(const root of roots){
    root.traverse(object=>{
      // Sprite geometry belongs to Three's shared sprite implementation.
      if(object.isMesh&&object.geometry&&!sharedGeometries.has(object.geometry))geometries.add(object.geometry);
      for(const material of Array.isArray(object.material)?object.material:[object.material]){
        if(!material||sharedMaterials.has(material))continue;
        materials.add(material);
        for(const value of Object.values(material))if(value?.isTexture)textures.add(value);
      }
    });
    root.removeFromParent();
  }
  geometries.forEach(geometry=>geometry.dispose());
  textures.forEach(texture=>texture.dispose());
  materials.forEach(material=>material.dispose());
}
function mesh(geo,material,parent,x=0,y=0,z=0,sx=1,sy=1,sz=1,shadow=true){const m=new THREE.Mesh(geo,material);m.position.set(x,y,z);m.scale.set(sx,sy,sz);m.castShadow=shadow;m.receiveShadow=true;parent.add(m);return m;}
function box(parent,material,x,y,z,sx,sy,sz,shadow=true){return mesh(boxGeo,material,parent,x,y,z,sx,sy,sz,shadow);}
function ball(parent,material,x,y,z,sx,sy=sx,sz=sx,shadow=true){return mesh(sphereGeo,material,parent,x,y,z,sx,sy,sz,shadow);}
function rod(parent,material,a,b,r=.035){const av=new THREE.Vector3(...a),bv=new THREE.Vector3(...b),d=bv.clone().sub(av);const m=mesh(cylGeo,material,parent,0,0,0,r,d.length(),r);m.position.copy(av.add(bv).multiplyScalar(.5));m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());return m;}
function mergeStatic(group){
  const batches=new Map(),retiredGeometries=new Set();group.updateMatrixWorld(true);
  for(const child of group.children){
    if(!child.isMesh||Array.isArray(child.material))continue;
    let batch=batches.get(child.material.uuid);
    if(!batch){batch={material:child.material,children:[],shadow:false};batches.set(child.material.uuid,batch);}
    batch.children.push(child);batch.shadow ||= child.castShadow;
  }
  for(const {material,children,shadow} of batches.values()){
    if(children.length<2)continue;
    const geos=children.map(child=>(child.geometry.index?child.geometry.toNonIndexed():child.geometry.clone()).applyMatrix4(child.matrix));
    let merged;
    try{merged=mergeGeometries(geos,false);}catch{merged=null;}finally{geos.forEach(geometry=>geometry.dispose());}
    // Incompatible attributes must leave the original visible geometry intact.
    if(!merged)continue;
    for(const child of children){group.remove(child);if(!sharedGeometries.has(child.geometry))retiredGeometries.add(child.geometry);}
    mesh(merged,material,group,0,0,0,1,1,1,shadow);
  }
  // A source may also be referenced by an unmerged descendant.
  group.traverse(object=>{if(object.geometry)retiredGeometries.delete(object.geometry);});
  retiredGeometries.forEach(geometry=>geometry.dispose());
}
function textureCanvas(w,h,draw){const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'),w,h);const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=4;return tex;}
function labelTexture(text,{bg='#d5f54b',fg='#182b30',w=1024,h=256,size=130}={}){return textureCanvas(w,h,(ctx)=>{ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);ctx.fillStyle=fg;ctx.font=`900 ${size}px Arial, sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,w/2,h/2+8,w*.93);});}
function planeLabel(parent,text,x,y,z,w,h,options={}){const material=new THREE.MeshStandardMaterial({map:labelTexture(text,options),roughness:.6,side:THREE.DoubleSide});return mesh(new THREE.PlaneGeometry(w,h),material,parent,x,y,z,1,1,1,false);}
function softTexture(){return textureCanvas(128,128,(c,w,h)=>{const g=c.createRadialGradient(w/2,h/2,0,w/2,h/2,w/2);g.addColorStop(0,'rgba(255,255,255,.7)');g.addColorStop(.35,'rgba(255,255,255,.25)');g.addColorStop(1,'rgba(255,255,255,0)');c.fillStyle=g;c.fillRect(0,0,w,h);});}
function ringMesh(color,r=1,width=.07){const m=new THREE.Mesh(new THREE.RingGeometry(r-width,r,64),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.8,side:THREE.DoubleSide,depthWrite:false}));m.rotation.x=-Math.PI/2;return m;}

function createCart(color,index){
  const root=new THREE.Group(),body=new THREE.Group(),rigid=new THREE.Group();root.add(body);body.add(rigid);
  const paint=mat(color,.32,.25),cloth=mat(color,.84),skin=index%3===1?mat(0xa97048,.8):M.skin;
  // A real tapered wire basket, big bumpers, casters and a deliberately reckless rider.
  const ys=[.72,1.09,1.46];
  ys.forEach((y,i)=>{let x=.55+i*.1,z0=-.55-i*.05,z1=.68+i*.11;rod(rigid,M.steel,[-x,y,z0],[x,y,z0],.043);rod(rigid,M.steel,[-x,y,z1],[x,y,z1],.043);rod(rigid,M.steel,[-x,y,z0],[-x,y,z1],.043);rod(rigid,M.steel,[x,y,z0],[x,y,z1],.043);});
  for(let i=0;i<7;i++){const t=i/6;for(const s of[-1,1])rod(rigid,M.steel,[s*.55,.72,lerp(-.55,.68,t)],[s*.75,1.46,lerp(-.65,.9,t)],.025);rod(rigid,M.steel,[lerp(-.55,.55,t),.72,.68],[lerp(-.75,.75,t),1.46,.9],.025);rod(rigid,M.steel,[lerp(-.55,.55,t),.74,-.55],[lerp(-.55,.55,t),.74,.68],.025);}
  box(rigid,paint,0,1.2,.91,1.53,.27,.08);box(rigid,M.white,0,1.2,.96,.6,.18,.015);
  for(const x of[-.61,.61]){rod(rigid,M.steel,[x,.35,.77],[x,.35,-1.1],.07);rod(rigid,M.steel,[x,.35,-.9],[x,1.61,-.79],.055);}rod(rigid,paint,[-.73,1.62,-.8],[.73,1.62,-.8],.095);
  box(rigid,M.rubber,0,.55,1.02,1.7,.22,.22);box(rigid,paint,0,.61,1.14,1.52,.1,.06);box(rigid,M.dark,0,.4,-.93,1.45,.13,.6);
  // Grocery cargo: a paper bag, two oranges, milk and a baguette.
  box(rigid,M.wood,.24,.98,.28,.52,.54,.44);box(rigid,M.white,-.3,.98,.36,.28,.5,.28);box(rigid,M.blue,-.3,1.2,.36,.3,.16,.3);
  ball(rigid,M.orange,.36,1.3,.3,.16);ball(rigid,M.orange,.11,1.28,.34,.15);const baguette=mesh(new THREE.CapsuleGeometry(.11,.72,4,8),M.wood,rigid,.42,1.43,.46);baguette.rotation.z=-.32;
  mergeStatic(rigid);
  const wheels=[];for(const x of[-.66,.66])for(const z of[-.83,.73]){const w=new THREE.Group();w.position.set(x,.24,z);body.add(w);let t=mesh(new THREE.CylinderGeometry(.23,.23,.16,16),M.rubber,w);t.rotation.z=Math.PI/2;let hub=mesh(new THREE.CylinderGeometry(.1,.1,.18,12),M.steel,w);hub.rotation.z=Math.PI/2;box(w,M.dark,0,.16,0,.07,.3,.08);wheels.push(w);}
  const rider=new THREE.Group();rider.position.set(0,.58,-.91);body.add(rider);
  const torso=new THREE.Group();rider.add(torso);
  mesh(new RoundedBoxGeometry(.64,.69,.39,2,.14),cloth,torso,0,.78,0);
  const head=new THREE.Group();head.position.set(0,1.4,0);torso.add(head);
  ball(head,skin,0,0,0,.29,.31,.28);ball(head,M.black,0,.15,-.025,.3,.2,.28);
  // Oversized wraparound sunglasses and a fluorescent cycling helmet.
  box(head,M.black,0,.02,.245,.55,.11,.08);box(head,M.white,-.13,.044,.29,.09,.025,.01);
  const helmet=ball(head,paint,0,.23,-.01,.34,.17,.32);box(head,M.lime,0,.34,.02,.07,.04,.42);
  for(const s of[-1,1]){rod(torso,cloth,[s*.3,1.03,.02],[s*.42,.91,.23],.11);rod(torso,skin,[s*.42,.91,.23],[s*.53,1.03,.15],.087);ball(torso,skin,s*.53,1.03,.15,.1);rod(rider,M.dark,[s*.18,.48,0],[s*.24,.16,.08],.13);box(rider,M.sole,s*.24,.06,.12,.27,.15,.43);}
  mergeStatic(torso);mergeStatic(head);mergeStatic(rider);
  const shadow=new THREE.Mesh(new THREE.PlaneGeometry(3.5,3.5),new THREE.MeshBasicMaterial({map:softTexture(),color:0x132931,transparent:true,opacity:.45,depthWrite:false}));shadow.rotation.x=-Math.PI/2;shadow.position.y=.015;root.add(shadow);
  const marker=ringMesh(color,1.27,.09);marker.position.y=.035;root.add(marker);
  const shield=new THREE.Mesh(new THREE.SphereGeometry(1.6,20,14),new THREE.MeshBasicMaterial({color:0x81e7f1,wireframe:true,transparent:true,opacity:.12,depthWrite:false}));shield.position.y=.95;root.add(shield);shield.visible=false;
  const badge=new THREE.Sprite(new THREE.SpriteMaterial({map:labelTexture(index===0?'DU':index===1?'P2':String(index+1),{w:128,h:80,size:49,bg:index===0?'#d5f54b':'#f3efdf'}),depthTest:false}));badge.scale.set(.8,.5,1);badge.position.set(0,3.03,0);root.add(badge);
  return {root,body,rider,torso,head,wheels,marker,shield,badge,shadow,paint,cloth,color,roll:0};
}

function floorTexture(arenaIndex){
  return textureCanvas(2048,2048,(c,w,h)=>{
    const random=rng(200+arenaIndex);c.fillStyle=['#5e7779','#6a6778','#557b7c'][arenaIndex%3];c.fillRect(0,0,w,h);
    for(let i=0;i<65000;i++){const k=random();c.fillStyle=k>.5?'rgba(255,255,255,.045)':'rgba(15,29,36,.06)';const s=1+random()*3;c.fillRect(random()*w,random()*h,s,s);}
    // Painted safety curb, not an invisible wall.
    c.strokeStyle='#c4cbba';c.lineWidth=12;c.strokeRect(29,29,w-58,h-58);
    c.save();c.strokeStyle='#d2e567';c.lineWidth=15;for(let i=0;i<36;i++){let p=i*57;c.beginPath();c.moveTo(p,3);c.lineTo(p+28,26);c.stroke();c.beginPath();c.moveTo(p,h-3);c.lineTo(p+28,h-26);c.stroke();}c.restore();
    c.lineWidth=5;c.strokeStyle='rgba(226,233,204,.26)';
    for(const side of[0,1])for(let i=0;i<6;i++){const x=240+i*270,y=side?1660:80;c.beginPath();c.moveTo(x,y);c.lineTo(x,y+260);c.lineTo(x+190,y+260);c.stroke();}
    c.strokeStyle='rgba(221,235,208,.12)';c.lineWidth=6;c.beginPath();c.arc(1024,1024,610,0,TAU);c.stroke();c.setLineDash([34,30]);c.beginPath();c.arc(1024,1024,550,0,TAU);c.stroke();c.setLineDash([]);
    c.save();c.translate(1024,1024);c.rotate(-Math.PI/2);c.fillStyle='rgba(228,236,213,.16)';c.textAlign='center';c.font='900 195px Arial';c.fillText('LAST CART',0,60);c.font='bold 40px Arial';c.fillText('NO BRAKES. NO FRIENDS.',0,130);c.restore();
    for(const x of[150,1898]){c.save();c.translate(x,1024);c.rotate(x<500?Math.PI:0);c.fillStyle='rgba(234,237,215,.3)';c.beginPath();c.moveTo(0,-120);c.lineTo(55,-20);c.lineTo(20,-20);c.lineTo(20,100);c.lineTo(-20,100);c.lineTo(-20,-20);c.lineTo(-55,-20);c.closePath();c.fill();c.restore();}
    // Individual little patched areas and skid marks.
    c.lineCap='round';for(let i=0;i<38;i++){const x=random()*w,y=random()*h;c.strokeStyle=`rgba(17,35,39,${.025+random()*.06})`;c.lineWidth=2+random()*4;c.beginPath();c.moveTo(x,y);c.quadraticCurveTo(x+random()*90,y+random()*90,x+random()*170,y+random()*80);c.stroke();}
  });
}

export class GameView {
  constructor(canvas,{quality='high',shake=true}={}){
    this.canvas=canvas;this.quality=quality;this.shakeEnabled=shake;this.elapsed=0;this.menu=true;this.hit=0;this.slow=0;this.arenaIndex=-1;this.cartMeshes=[];this.pickupMeshes=new Map();this.particles=[];this.ripples=[];this.trails=[];
    this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance',alpha:false});
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.13;this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    this.scene=new THREE.Scene();this.scene.background=new THREE.Color(0xc8d5d2);this.scene.fog=new THREE.Fog(0xc8d5d2,75,220);
    this.camera=new THREE.PerspectiveCamera(43,1,.1,350);this.camera.position.set(32,29,39);this.camTarget=new THREE.Vector3(0,0,0);
    const pmrem=new THREE.PMREMGenerator(this.renderer);const room=new RoomEnvironment();this.environment=pmrem.fromScene(room,.04).texture;this.scene.environment=this.environment;this.scene.environmentIntensity=.48;room.dispose();pmrem.dispose();
    this.hemisphere=new THREE.HemisphereLight(0xe4f2f3,0x778685,2.05);this.scene.add(this.hemisphere);
    this.sun=new THREE.DirectionalLight(0xffe7c2,3.3);this.sun.position.set(-25,42,15);this.sun.castShadow=true;this.sun.shadow.mapSize.set(2048,2048);Object.assign(this.sun.shadow.camera,{left:-30,right:30,top:30,bottom:-30,near:1,far:100});this.sun.shadow.normalBias=.035;this.sun.shadow.bias=-.00015;this.sun.shadow.radius=3;this.scene.add(this.sun);
    const fill=new THREE.DirectionalLight(0xa2d6ea,1.2);fill.position.set(20,18,-25);this.scene.add(fill);
    this.world=new THREE.Group();this.scene.add(this.world);this.roof=new THREE.Group();this.world.add(this.roof);this.decor=new THREE.Group();this.world.add(this.decor);this.dynamic=new THREE.Group();this.scene.add(this.dynamic);
    this.makeSky();this.makeCity();this.makeParticles();this.makeTrails();this.makeSafeZone();
    this.hero=createCart(0xff6449,0);this.hero.root.scale.setScalar(3);this.hero.root.position.set(14,.2,8);this.hero.root.rotation.y=-.6;this.hero.badge.visible=false;this.hero.marker.visible=false;this.scene.add(this.hero.root);
    this.resize();this.setQuality(quality);
  }
  makeSky(){
    const sky=new THREE.Mesh(new THREE.SphereGeometry(280,32,16),new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,uniforms:{top:{value:new THREE.Color(0x94bec5)},bottom:{value:new THREE.Color(0xf0d2b5)}},vertexShader:'varying vec3 vPos;void main(){vPos=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',fragmentShader:'uniform vec3 top;uniform vec3 bottom;varying vec3 vPos;void main(){float h=clamp((vPos.y+35.0)/210.0,0.0,1.0);gl_FragColor=vec4(mix(bottom,top,pow(h,.6)),1.0);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}'}));this.scene.add(sky);this.sky=sky;
    // An oversized low sun behind the city and a few soft cloud ribbons.
    const sun=mesh(new THREE.SphereGeometry(9,32,16),new THREE.MeshBasicMaterial({color:0xffe1a5,fog:false}),this.scene,-80,28,-135,1,1,1,false);
    const clouds=new THREE.Group();this.scene.add(clouds);const cloudmat=new THREE.MeshBasicMaterial({color:0xe4e2d2,transparent:true,opacity:.25,depthWrite:false});for(let i=0;i<12;i++)ball(clouds,cloudmat,-120+i*23,40+(i%3)*8,-145-(i%4)*10,20,1.1,4,false);
  }
  makeCity(){
    const random=rng(995),group=new THREE.Group();this.scene.add(group);const colors=[0x859e9f,0x9aacaa,0x718d94,0xa2b7b5,0xb7c1b8];const buildingMats=colors.map(c=>mat(c,.95));
    for(let i=0;i<115;i++){
      const angle=random()*TAU,radius=43+random()*120,x=Math.sin(angle)*radius,z=Math.cos(angle)*radius,height=6+random()*38,w=6+random()*12,d=6+random()*12;
      // Foreground buildings stay below the playing roof.
      const h=z>12?Math.min(height,20):height;
      const material=buildingMats[i%colors.length];box(group,material,x,-38+h/2,z,w,h,d,false);box(group,material,x,-38+h+.3,z,w+.25,.6,d+.25,false);
      if(i%3===0)box(group,buildingMats[(i+2)%5],x,-38+h+1.5,z,w*.42,2.7,d*.5,false);
      if(i<65){for(let k=0;k<Math.min(8,Math.floor(h/3));k++){box(group,M.dark,x,-36+k*3,z+d/2+.015,w*.68,.6,.02,false);}}
    }
    box(group,mat(0x81999a),0,-40,0,430,1,430,false);mergeStatic(group);this.city=group;
  }
  loadArena(def,index=0){
    if(this.arenaIndex===index&&this.arena===def&&this.roof.children.length)return;
    this.arenaIndex=index;this.arena=def;
    const night=index===1;
    this.sky.material.uniforms.top.value.setHex(night?0x25375c:index===2?0x85b5bb:0x94bec5);
    this.sky.material.uniforms.bottom.value.setHex(night?0x9c98b3:index===2?0xd7ddd0:0xf0d2b5);
    this.scene.fog.color.setHex(night?0x6f7891:0xc8d5d2);
    this.sun.color.setHex(night?0xb6ceef:0xffe7c2);this.sun.intensity=night?1.9:3.3;this.hemisphere.intensity=night?1.55:2.05;
    disposeTrees([...this.roof.children,...this.decor.children]);
    const base=mat([0x647d7f,0x6e6a80,0x5a8182][index%3],.9),concrete=mat(0xa6b3aa,.9),trim=mat(0x293e43,.7);
    box(this.roof,base,0,-1,0,36,2,36);box(this.roof,trim,0,-.17,0,36.13,.34,36.13);
    const floorMat=new THREE.MeshStandardMaterial({map:floorTexture(index),roughness:.88});const ground=mesh(new THREE.PlaneGeometry(36,36),floorMat,this.roof,0,.004,0,1,1,1,false);ground.rotation.x=-Math.PI/2;
    // The building below the arena gives falls actual height.
    box(this.roof,concrete,0,-11,0,35,18,35);box(this.roof,trim,0,-4.4,0,35.5,.45,35.5);box(this.roof,trim,0,-13,0,35.4,.4,35.4);
    for(let x=-15;x<=15;x+=3){box(this.roof,M.dark,x,-8.2,17.53,1.9,4,.035,false);box(this.roof,M.blue,x-.5,-7.6,17.55,.12,2.5,.045,false);box(this.roof,M.dark,17.53,-8.2,x,.035,4,1.9,false);}
    planeLabel(this.roof,'MEGAMART',0,-2.45,18.02,14,1.65,{bg:'#d5f54b',fg:'#1d3439',size:145});
    planeLabel(this.roof,'PARKERING  /  TAK 04',-10,-2.35,18.025,6,1.05,{bg:'#32494d',fg:'#d8ddce',size:60});
    planeLabel(this.roof,'ÖPPET 24/7',12.2,-2.35,18.025,4.5,1.05,{bg:'#32494d',fg:'#d8ddce',size:85});
    // Narrow curb stripes remain flat and never trap a cart.
    for(const s of[-1,1])for(let i=-17;i<18;i+=2){box(this.roof,(i+17)%4===0?M.lime:trim,i,.025,s*17.86,1.82,.045,.22,false);box(this.roof,(i+17)%4===0?M.lime:trim,s*17.86,.025,i,.22,.045,1.82,false);}
    const obs=def?.obstacles??[];obs.forEach((o,i)=>this.obstacle(o,i));mergeStatic(this.decor);
    // Back corner service sign, lamp posts and rooftop clutter sit just off the playable floor.
    for(const x of[-18.65,18.65])for(const z of[-15,13]){box(this.roof,trim,x,2.3,z,.14,5.8,.14);const light=box(this.roof,M.white,x,5.2,z,.95,.13,.65);light.material=new THREE.MeshStandardMaterial({color:0xfff2d1,emissive:0xffdc98,emissiveIntensity:.8});}
    const sign=new THREE.Group();sign.position.set(8,0,-18.8);this.roof.add(sign);box(sign,trim,-3,3,0,.16,6,.16);box(sign,trim,3,3,0,.16,6,.16);box(sign,trim,0,4.6,0,9,2.5,.25);planeLabel(sign,'LÅGA PRISER.',0,4.6,.14,8.7,2.2,{bg:'#d5f54b',fg:'#20353a',size:113});
    mergeStatic(this.roof);
    disposeTrees([...this.pickupMeshes.values()]);this.pickupMeshes.clear();
    this.trailCount=0;this.trailMesh.count=0;this.particles.length=0;this.clearEffects();
  }
  obstacle(o,i){
    const x=o.x,z=o.z,r=o.r??o.radius??1.4;const group=this.decor;
    if(o.type==='bumper'||o.type==='pillar'){
      const base=mesh(new THREE.CylinderGeometry(r,r,.3,24),M.dark,group,x,.15,z);const body=mesh(new THREE.CylinderGeometry(r*.88,r*.95,.75,24),i%2?M.orange:M.lime,group,x,.65,z);mesh(new THREE.CylinderGeometry(r*.65,r*.65,.08,24),M.white,group,x,1.06,z);mesh(new THREE.CylinderGeometry(r*.47,r*.47,.09,24),M.dark,group,x,1.12,z);
    }else if(o.type==='crate'){
      box(group,M.wood,x,r*.6,z,r*1.5,r*1.2,r*1.5);for(const k of[-.45,.45])box(group,M.white,x+r*k,r*.6,z,r*.13,r*1.23,r*1.54);
    }else{
      const steel=mat(0xb7c6bf,.7,.3);box(group,M.dark,x,.12,z,r*1.7,.24,r*1.65);box(group,steel,x,.8,z,r*1.55,1.35,r*1.45);box(group,M.white,x,1.51,z,r*1.6,.09,r*1.5);
      const vent=mesh(new THREE.CylinderGeometry(r*.5,r*.5,.08,24),M.dark,group,x,1.58,z);for(let k=0;k<8;k++){const bar=box(group,M.steel,x,1.635,z,r*.96,.025,.055);bar.rotation.y=k*Math.PI/4;}
      for(let k=0;k<7;k++)box(group,M.dark,x-r*.61+k*r*.2,.82,z+r*.729,.07,.72,.02,false);
      box(group,M.lime,x,.46,z+r*.735,r*.8,.12,.025,false);
    }
    const marker=ringMesh(0xdee3c7,r+.14,.035);marker.position.set(x,.02,z);group.add(marker);
  }
  makeSafeZone(){
    this.zoneRing=ringMesh(0xd5f54b,1,.007);this.zoneRing.position.y=.04;this.dynamic.add(this.zoneRing);
    const geometry=new THREE.PlaneGeometry(36,36);
    this.zoneMat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{radius:{value:17},time:{value:0},opacity:{value:0}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'varying vec2 vUv;uniform float radius;uniform float time;uniform float opacity;void main(){vec2 p=(vUv-.5)*36.;float d=length(p);float edge=smoothstep(radius-.1,radius+.3,d);float stripe=step(.57,fract((p.x+p.y)*.25-time*.16));float a=edge*(.07+stripe*.08)*opacity;gl_FragColor=vec4(.95,.35,.17,a);}' });
    this.zonePlane=new THREE.Mesh(geometry,this.zoneMat);this.zonePlane.rotation.x=-Math.PI/2;this.zonePlane.position.y=.025;this.dynamic.add(this.zonePlane);
    const positions=new Float32Array(129*3);this.zoneWallGeo=new THREE.BufferGeometry();this.zoneWallGeo.setAttribute('position',new THREE.BufferAttribute(positions,3));this.zoneLine=new THREE.Line(this.zoneWallGeo,new THREE.LineBasicMaterial({color:0xe9ef9c,transparent:true,opacity:.23}));this.dynamic.add(this.zoneLine);
  }
  makeParticles(){
    this.particleGeo=new THREE.BoxGeometry(.14,.14,.14);this.particleMesh=new THREE.InstancedMesh(this.particleGeo,new THREE.MeshStandardMaterial({roughness:.6}),350);this.particleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.particleMesh.count=0;this.particleMesh.frustumCulled=false;this.scene.add(this.particleMesh);
    this.puffMesh=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.25,0),new THREE.MeshBasicMaterial({color:0xe9e8c9,transparent:true,opacity:.35,depthWrite:false}),120);this.puffMesh.count=0;this.puffMesh.frustumCulled=false;this.scene.add(this.puffMesh);this.puffs=[];
  }
  makeTrails(){
    this.trailMesh=new THREE.InstancedMesh(new THREE.PlaneGeometry(.15,.65),new THREE.MeshBasicMaterial({color:0x1b3439,transparent:true,opacity:.15,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1}),1800);this.trailMesh.frustumCulled=false;this.trailMesh.count=0;this.trailCount=0;this.scene.add(this.trailMesh);
  }
  setMode(menu){this.menu=menu;this.resize();}
  setQuality(quality){this.quality=quality;this.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,quality==='high'?1.7:quality==='medium'?1.2:1));this.renderer.shadowMap.enabled=quality!=='low';this.sun.shadow.mapSize.set(quality==='high'?2048:1024,quality==='high'?2048:1024);this.sun.shadow.map?.dispose();this.sun.shadow.map=null;this.resize();}
  resize(){const w=window.innerWidth,h=window.innerHeight;this.width=w;this.height=h;this.camera.aspect=w/h;this.renderer.setSize(w,h,false);this.camera.clearViewOffset();if(this.menu&&w>850)this.camera.setViewOffset(w,h,-w*.16,0,w,h);this.camera.updateProjectionMatrix();}
  rebuildCarts(players){
    disposeTrees(this.cartMeshes.map(cart=>cart.root));this.cartMeshes=players.map((p,i)=>{const cart=createCart(p.color,i);this.scene.add(cart.root);cart.root.position.set(p.x,0,p.z);return cart;});
  }
  update(sim,dt,elapsed,menu=false){
    this.elapsed=elapsed;this.menu=menu;this.currentSim=sim;
    this.hero.root.visible=menu;
    if(menu){this.hero.root.rotation.y=-.6+Math.sin(elapsed*.45)*.12;this.hero.body.rotation.z=Math.sin(elapsed*.65)*.025;this.hero.torso.rotation.x=-.06+Math.sin(elapsed*.85)*.025;this.hero.head.rotation.z=Math.sin(elapsed*.7)*.035;const color=sim.players[0].color;this.hero.paint.color.setHex(color);this.hero.cloth.color.setHex(color);}
    if(this.cartMeshes.length!==sim.players.length)this.rebuildCarts(sim.players);
    for(let i=0;i<sim.players.length;i++){
      const p=sim.players[i],c=this.cartMeshes[i];const speed=Math.hypot(p.vx,p.vz);
      const y=p.y??(p.falling?-p.fallTime*p.fallTime*9:0);
      c.root.visible=y>-35&&(p.alive||p.falling||p.fallTime>0);c.root.position.set(p.x,y,p.z);
      let da=p.angle-c.root.rotation.y;da=Math.atan2(Math.sin(da),Math.cos(da));c.root.rotation.y+=da*Math.min(1,dt*22);
      c.body.rotation.z=lerp(c.body.rotation.z,clamp(-da*.16,-.17,.17)+(p.falling?p.fallTime*2.5:0),1-Math.exp(-dt*10));
      c.body.rotation.x=lerp(c.body.rotation.x,p.falling?p.fallTime*3:(p.boosting>0?-.13:Math.sin(elapsed*20+i)*speed*.0015),1-Math.exp(-dt*10));
      c.body.position.y=p.falling?0:Math.sin(elapsed*26+i)*Math.min(speed*.0025,.035);
      c.torso.rotation.x=lerp(c.torso.rotation.x,p.boosting>0?.18:Math.sin(elapsed*9+i)*speed*.002,dt*8);c.head.rotation.z=Math.sin(elapsed*8+i)*Math.min(speed*.004,.05);
      c.wheels.forEach(w=>{w.rotation.x+=speed*dt*3;});
      c.shield.visible=(p.shield??0)>0;c.shield.rotation.y+=dt*.3;c.shield.material.opacity=.09+Math.sin(elapsed*5)*.04;
      c.marker.visible=p.human&&!menu&&!p.falling;c.badge.visible=p.human&&!menu&&!p.falling;c.shadow.visible=!p.falling;
      if(p.color!==c.color){c.paint.color.setHex(p.color);c.cloth.color.setHex(p.color);c.marker.material.color.setHex(p.color);c.color=p.color;}
      if(speed>4&&p.drift&&!p.falling&&Math.random()<dt*28){for(const side of[-.6,.6]){temp.position.set(p.x+Math.cos(p.angle)*side,.014,p.z-Math.sin(p.angle)*side);temp.rotation.set(-Math.PI/2,0,-p.angle);temp.scale.set(1,1,1);temp.updateMatrix();this.trailMesh.setMatrixAt(this.trailCount%1800,temp.matrix);this.trailCount++;}this.trailMesh.count=Math.min(1800,this.trailCount);this.trailMesh.instanceMatrix.needsUpdate=true;}
      if((p.boosting>0||p.drift)&&speed>4&&!p.falling&&Math.random()<dt*35){this.puffs.push({x:p.x-Math.sin(p.angle),y:.3,z:p.z-Math.cos(p.angle),vx:-p.vx*.15,vz:-p.vz*.15,life:.5,max:.5,scale:.2});}
      if(p.driftCharge>.45&&p.drift&&Math.random()<dt*35)this.burst(p.x,.25,p.z,2,p.driftCharge>.8?0xd9f44a:0xffb03e,2);
    }
    for(const pickup of sim.pickups??[]){let m=this.pickupMeshes.get(pickup.id);if(!m){m=new THREE.Group();const isShield=pickup.type==='shield',color=isShield?0x8ee3f1:0xd5f54b;const glow=new THREE.Mesh(new THREE.PlaneGeometry(3,3),new THREE.MeshBasicMaterial({map:softTexture(),color,transparent:true,opacity:.55,depthWrite:false}));glow.rotation.x=-Math.PI/2;glow.position.y=.035;m.add(glow);const r=ringMesh(color,.75,.04);r.position.y=.05;m.add(r);const item=new THREE.Group();m.add(item);if(isShield){const g=new THREE.Mesh(new THREE.IcosahedronGeometry(.42,0),new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:.3,metalness:.5,roughness:.2}));item.add(g);}else{const g=mesh(new THREE.CylinderGeometry(.23,.23,.68,12),M.lime,item);box(item,M.white,0,0,.235,.12,.3,.025);mesh(new THREE.CylinderGeometry(.2,.2,.05,12),M.steel,item,0,.36,0);}m.userData.item=item;this.dynamic.add(m);this.pickupMeshes.set(pickup.id,m);}m.visible=pickup.active!==false;m.position.set(pickup.x,0,pickup.z);m.userData.item.position.y=.9+Math.sin(elapsed*2.6+pickup.id)*.15;m.userData.item.rotation.y=elapsed*1.4;}
    const radius=sim.safeRadius??17;this.zoneRing.visible=!menu&&sim.time>12;this.zoneRing.scale.setScalar(radius);this.zoneRing.material.color.setHex(radius<9?0xff8055:0xd5f54b);this.zoneRing.material.opacity=.5+Math.sin(elapsed*3)*.2;this.zoneMat.uniforms.radius.value=radius;this.zoneMat.uniforms.time.value=elapsed;this.zoneMat.uniforms.opacity.value=menu?0:clamp((sim.time-12)/8,0,1);
    const a=this.zoneWallGeo.attributes.position.array;for(let i=0;i<=128;i++){const t=i/128*TAU;a[i*3]=Math.sin(t)*radius;a[i*3+1]=.18+Math.sin(t*8+elapsed)*.08;a[i*3+2]=Math.cos(t)*radius;}this.zoneWallGeo.attributes.position.needsUpdate=true;this.zoneLine.visible=!menu&&sim.time>15;
    this.updateEffects(dt);
    let targetX=0,targetZ=0;const aspect=this.width/this.height;
    if(menu){const angle=.72+Math.sin(elapsed*.055)*.08;const radius=54;const target=new THREE.Vector3(Math.sin(angle)*radius,33,Math.cos(angle)*radius);if(aspect<.8){target.multiplyScalar(1.05);target.y=57;}this.camera.position.lerp(target,1-Math.exp(-dt*2));this.camTarget.lerp(new THREE.Vector3(0,0,0),1-Math.exp(-dt*3));}
    else{const target=new THREE.Vector3(0,aspect<.8?60:42,aspect<.8?48:35);const distanceScale=aspect<1?Math.max(1,1/aspect*.76):1;target.multiplyScalar(distanceScale);this.camera.position.lerp(target,1-Math.exp(-dt*4));this.camTarget.lerp(new THREE.Vector3(targetX,0,targetZ),1-Math.exp(-dt*3));}
    this.camera.lookAt(this.camTarget);if(this.shakeEnabled&&this.hit>.005){this.camera.position.x+=(Math.random()-.5)*this.hit;this.camera.position.y+=(Math.random()-.5)*this.hit*.6;this.hit*=Math.exp(-dt*13);}this.camera.updateMatrixWorld();
    this.renderer.render(this.scene,this.camera);
  }
  burst(x,y,z,count,color=0xd5f54b,force=4){for(let i=0;i<count;i++){if(this.particles.length>=350)this.particles.shift();const a=Math.random()*TAU,v=1+Math.random()*force;this.particles.push({x,y,z,vx:Math.sin(a)*v,vy:2+Math.random()*force,vz:Math.cos(a)*v,life:.45+Math.random()*.7,max:1.15,color,spin:Math.random()*9,size:.4+Math.random()*1.1});}}
  ripple(x,z,color=0xf3f3d3){const m=ringMesh(color,1,.045);m.position.set(x,.08,z);m.scale.setScalar(.3);this.scene.add(m);this.ripples.push({mesh:m,life:.35});}
  handleEvent(e,sim){
    const x=e.x??sim.players[e.playerId]?.x??0,z=e.z??sim.players[e.playerId]?.z??0;
    if(e.type==='collision'){this.burst(x,.7,z,Math.min(18,5+Math.floor((e.force??3)*.7)),0xf5dfa0,4);this.hit=Math.min(.5,(e.force??3)*.025);}
    if(e.type==='boost'||e.type==='driftboost'){this.ripple(x,z,0xd5f54b);this.burst(x,.3,z,9,0xd5f54b,3);}
    if(e.type==='pickup'){this.burst(x,1,z,16,e.pickupType==='shield'?0x92e4ef:0xd5f54b,3);this.ripple(x,z);}
    if(e.type==='eliminate'){this.burst(x,1,z,48,sim.players[e.playerId]?.color??0xff7647,8);this.burst(x,1.4,z,16,0xe6ca89,6);this.hit=.8;}
    if(e.type==='finish'){const winner=sim.players[sim.winnerId];if(winner){this.burst(winner.x,3,winner.z,100,0xd5f54b,9);this.burst(winner.x,3,winner.z,70,0xf3e7ce,8);}}
  }
  updateEffects(dt){
    let i=0;for(const p of this.particles){p.life-=dt;if(p.life<=0)continue;p.vy-=16*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;if(p.y<.1&&Math.abs(p.x)<18&&Math.abs(p.z)<18){p.y=.1;p.vy=Math.abs(p.vy)*.32;p.vx*=.8;p.vz*=.8;}temp.position.set(p.x,p.y,p.z);temp.rotation.set(p.spin*this.elapsed,p.spin,this.elapsed*2);temp.scale.setScalar(p.size*Math.min(1,p.life*3));temp.updateMatrix();this.particleMesh.setMatrixAt(i,temp.matrix);this.particleMesh.setColorAt(i,new THREE.Color(p.color));i++;}this.particles=this.particles.filter(p=>p.life>0);this.particleMesh.count=i;this.particleMesh.instanceMatrix.needsUpdate=true;if(i)this.particleMesh.instanceColor.needsUpdate=true;
    i=0;for(const p of this.puffs){p.life-=dt;if(p.life<=0||i>=120)continue;p.x+=p.vx*dt;p.z+=p.vz*dt;p.y+=dt*.6;temp.position.set(p.x,p.y,p.z);temp.rotation.set(0,p.life*3,0);temp.scale.setScalar((1-p.life/p.max)*2+.4);temp.updateMatrix();this.puffMesh.setMatrixAt(i++,temp.matrix);}this.puffs=this.puffs.filter(p=>p.life>0).slice(-120);this.puffMesh.count=i;this.puffMesh.instanceMatrix.needsUpdate=true;
    this.ripples=this.ripples.filter(r=>{r.life-=dt;r.mesh.scale.addScalar(dt*9);r.mesh.material.opacity=r.life*2;if(r.life<=0){this.scene.remove(r.mesh);r.mesh.geometry.dispose();r.mesh.material.dispose();return false;}return true;});
  }
  clearEffects(){this.ripples.forEach(r=>{this.scene.remove(r.mesh);r.mesh.geometry.dispose();r.mesh.material.dispose();});this.ripples=[];this.puffs=[];this.particles=[];this.particleMesh.count=0;this.puffMesh.count=0;this.trailCount=0;this.trailMesh.count=0;}
  getStats(){return {drawCalls:this.renderer.info.render.calls,triangles:this.renderer.info.render.triangles,geometries:this.renderer.info.memory.geometries,textures:this.renderer.info.memory.textures};}
}
