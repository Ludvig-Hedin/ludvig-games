import * as THREE from './vendor/three.module.js';
import { centerX, groundY, ROAD_HALF } from './physics.js';

// Every piece of scenery is generated locally. No models, textures, or network
// requests are needed after the game has loaded.
const TAU = Math.PI * 2;
const clamp = THREE.MathUtils.clamp;
const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const cylinderGeo = new THREE.CylinderGeometry(1, 1, 1, 10);
const rockGeo = new THREE.IcosahedronGeometry(1, 0);
const sphereGeo = new THREE.SphereGeometry(1, 12, 8);
function palmFrondGeometry() {
  // A broad tapered leaf folds gently around its spine, then droops at the tip.
  const spine=[[0,0,.09],[.85,.55,.48],[1.9,.65,.58],[3.2,.2,.36],[4.5,-.8,0]];
  const vertices=[],indices=[];
  for(let i=0;i<spine.length;i++) {
    const[z,y,w]=spine[i];vertices.push(-w,y,z,0,y+.09,z,w,y,z);
    if(i<spine.length-1){const k=i*3;indices.push(k,k+3,k+1,k+1,k+3,k+4,k+1,k+4,k+2,k+2,k+4,k+5);}
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
  geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}
const leafGeo = palmFrondGeometry();
const coneGeo = new THREE.ConeGeometry(1, 1, 12);
const dummy = new THREE.Object3D();
const up = new THREE.Vector3(0, 1, 0);
const delta = new THREE.Vector3();
const palette = {
  asphalt: '#525a64', sand: '#e8b48e', cliff: '#bb7962', rock: '#c98f71',
  cream: '#fff0d2', roadPaint: '#edddbc', leaf: '#446c5a', trunk: '#9b6951',
  dark: '#243a40', orange: '#ff663d', gold: '#ffc34d', teal: '#41bdaf',
};
const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({color, roughness: .82, ...extra});
const shared = {
  asphalt: mat(palette.asphalt), sand: mat(palette.sand), cliff: mat(palette.cliff),
  rock: mat(palette.rock, {flatShading: true}), cream: mat(palette.cream),
  paint: mat(palette.roadPaint), leaf: mat(palette.leaf, {flatShading: true,side:THREE.DoubleSide}),
  trunk: mat(palette.trunk), dark: mat(palette.dark), orange: mat(palette.orange),
  gold: mat(palette.gold, {metalness: .58, roughness: .25}),
  teal: mat(palette.teal, {metalness: .1, roughness: .4}),
  chrome: mat('#d5e0df', {metalness: .8, roughness: .26}),
  rubber: mat('#222a30', {roughness: .94}),
  black: mat('#162b32', {metalness: .25, roughness: .3}),
};
const geom = {
  tire: new THREE.CylinderGeometry(.26, .26, .16, 20),
  hub: new THREE.CylinderGeometry(.12, .12, .175, 16),
  ring: new THREE.TorusGeometry(.5, .105, 8, 24),
  boost: new THREE.OctahedronGeometry(.48, 0),
  cap: new THREE.CylinderGeometry(.1, .1, .07, 10),
};
const sharedGeometries = new Set([boxGeo,cylinderGeo,rockGeo,sphereGeo,leafGeo,coneGeo,...Object.values(geom)]);
const sharedMaterials = new Set(Object.values(shared));

function markOwnedResources(group) {
  // A factory-created object owns every material subsequently assigned to its
  // meshes except our explicit shared cache. This also covers ghost clones.
  group.traverse(o=>{
    if(o.geometry&&!sharedGeometries.has(o.geometry))o.userData.ownedGeometry=true;
    if(o.material)o.userData.ownsNonSharedMaterials=true;
  });
  return group;
}

/** Release one factory object without invalidating any other cart or prop. */
export function disposeObject(group) {
  if(!group)return;
  const geometries=new Set(),materials=new Set(),instances=new Set();
  group.traverse(o=>{
    if(o.userData.ownedGeometry&&o.geometry&&!sharedGeometries.has(o.geometry))geometries.add(o.geometry);
    if(o.userData.ownsNonSharedMaterials&&o.material) {
      for(const material of Array.isArray(o.material)?o.material:[o.material]) {
        if(!sharedMaterials.has(material))materials.add(material);
      }
    }
    if(o.isInstancedMesh)instances.add(o);
  });
  group.removeFromParent();
  for(const instance of instances)instance.dispose();
  for(const geometry of geometries)geometry.dispose();
  for(const material of materials)material.dispose();
}

function hash(n) {
  const v = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return v - Math.floor(v);
}
function mesh(g, m, parent, x=0, y=0, z=0, sx=1, sy=1, sz=1) {
  const o = new THREE.Mesh(g, m);
  o.position.set(x,y,z); o.scale.set(sx,sy,sz);
  o.castShadow = true; o.receiveShadow = true;
  parent.add(o); return o;
}
function box(parent, m, x,y,z,sx,sy,sz) { return mesh(boxGeo,m,parent,x,y,z,sx,sy,sz); }
function ball(parent,m,x,y,z,r) { return mesh(sphereGeo,m,parent,x,y,z,r,r,r); }
function tube(parent,m,a,b,r=.035) {
  const len = delta.subVectors(b,a).length();
  const o = mesh(cylinderGeo,m,parent,0,0,0,r,len,r);
  o.position.copy(a).add(b).multiplyScalar(.5);
  o.quaternion.setFromUnitVectors(up,delta.normalize());
  return o;
}
function instanced(g,m, transforms, parent) {
  if (!transforms.length) return null;
  const obj = new THREE.InstancedMesh(g,m,transforms.length);
  for(let i=0;i<transforms.length;i++) {
    const t=transforms[i];
    dummy.position.set(t[0],t[1],t[2]);
    dummy.scale.set(t[3],t[4],t[5]);
    dummy.rotation.set(t[6]||0,t[7]||0,t[8]||0);
    dummy.updateMatrix(); obj.setMatrixAt(i,dummy.matrix);
  }
  obj.castShadow=true; obj.receiveShadow=true;
  obj.computeBoundingSphere(); parent.add(obj); return obj;
}
function ribbon(s0,s1,left,right,yOffset,material,steps=32) {
  const positions=[],uv=[],idx=[];
  for(let i=0;i<=steps;i++) {
    const s=s0+(s1-s0)*i/steps, cx=centerX(s),y=groundY(s)+yOffset;
    positions.push(cx+left,y,-s,cx+right,y,-s);
    uv.push(0,s*.1,1,s*.1);
    if(i<steps) {const j=i*2;idx.push(j,j+1,j+2,j+1,j+3,j+2);}
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  g.setIndex(idx);g.computeVertexNormals();
  const m=new THREE.Mesh(g,material);m.receiveShadow=true;m.userData.ownedGeometry=true;
  return m;
}

function makeLand(s0,s1) {
  const pos=[],col=[],idx=[];
  const rows=32, sides=[-78,-51,-26,-12,12,25,46,74];
  const topColor=new THREE.Color(palette.sand), edgeColor=new THREE.Color(palette.cliff);
  for(let i=0;i<=rows;i++) {
    const s=s0+(s1-s0)*i/rows;
    for(let j=0;j<sides.length;j++) {
      const side=sides[j],edge=Math.abs(side)>70;
      const undulate=Math.sin(s*.037+side*.19)*2+Math.sin(s*.081-side*.05)*1.2;
      const rough=(Math.abs(side)-12)/65;
      const x=centerX(s)+side+Math.sin(s*.025+side*.08)*Math.max(0,Math.abs(side)-20)*.12;
      const y=groundY(s)-.09+Math.max(0,rough)*undulate-(edge?23:0);
      pos.push(x,y,-s);
      const c=topColor.clone().lerp(edgeColor,edge?.9:Math.max(0,rough)*.23);
      c.multiplyScalar(.96+.04*Math.sin(s*.017+side));col.push(c.r,c.g,c.b);
      if(i<rows&&j<sides.length-1){const k=i*sides.length+j;idx.push(k,k+1,k+sides.length,k+1,k+sides.length+1,k+sides.length);}
    }
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute('color',new THREE.Float32BufferAttribute(col,3));g.setIndex(idx);g.computeVertexNormals();
  const m=new THREE.Mesh(g,landMaterial);m.receiveShadow=true;m.userData.ownedGeometry=true;return m;
}
const landMaterial=mat('#ffffff',{vertexColors:true,flatShading:true});

const skyMaterial=new THREE.ShaderMaterial({
  side:THREE.BackSide, depthWrite:false,
  uniforms:{
    uTop:{value:new THREE.Color('#83c6d1')},uHorizon:{value:new THREE.Color('#ffdbc4')},
    uBottom:{value:new THREE.Color('#efb79e')},uSun:{value:new THREE.Vector3(-.5,.34,-.72).normalize()},
    uSunColor:{value:new THREE.Color('#fff4cc')},uNight:{value:0},
  },
  vertexShader:`varying vec3 vDirection; void main(){vDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_Position.z=gl_Position.w*.999999;}`,
  fragmentShader:`
    varying vec3 vDirection;uniform vec3 uTop,uHorizon,uBottom,uSun,uSunColor;uniform float uNight;
    void main(){vec3 d=normalize(vDirection);float h=d.y;
      vec3 c=mix(uHorizon,uTop,smoothstep(0.0,.8,h));
      c=mix(c,uBottom,(1.-smoothstep(-.5,0.0,h)));
      float sunDot=dot(d,uSun);float sun=smoothstep(.9982,.9986,sunDot);
      float glow=pow(max(sunDot,0.),12.)*.26+pow(max(sunDot,0.),160.)*.2;
      c=mix(c,uSunColor,sun*.9)+uSunColor*glow*(1.-uNight*.65);
      gl_FragColor=vec4(c,1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
});

export function createWorld(scene,{quality='high',theme='sunset'}={}) {
  const root=new THREE.Group();root.name='Scenic coast';scene.add(root);
  const sky=new THREE.Mesh(new THREE.SphereGeometry(5000,24,16),skyMaterial);sky.frustumCulled=false;root.add(sky);
  const oceanMat=new THREE.MeshStandardMaterial({color:'#6bbab5',metalness:.16,roughness:.3});
  const ocean=new THREE.Mesh(new THREE.PlaneGeometry(10000,14000,1,1),oceanMat);
  ocean.rotation.x=-Math.PI/2;ocean.position.y=-27;root.add(ocean);
  // Thin sunlit ribbons make the sea legible without expensive reflection passes.
  const seaLines=[];
  for(let i=0;i<48;i++) seaLines.push([(hash(i+90)-.5)*5000,0,(hash(i+230)-.5)*5000,20+hash(i+70)*130,.04,.3+hash(i+33)*1.1,0,0,0]);
  const glints=instanced(boxGeo,mat('#acd9c9',{transparent:true,opacity:.45}),seaLines,root);
  const mountains=new THREE.Group();root.add(mountains);
  const mountainMats=[mat('#c88f89',{flatShading:true}),mat('#d5a69b',{flatShading:true}),mat('#b69a99',{flatShading:true})];
  for(let i=0;i<17;i++) {
    const side=i%2===0?-1:1;
    const m=mesh(rockGeo,mountainMats[i%3],mountains,side*(350+hash(i+12)*950),-30+hash(i+10)*60,-200-hash(i+29)*2300,
      150+hash(i+79)*300,130+hash(i+49)*310,150+hash(i+99)*330);
    m.rotation.set(hash(i)*.22,hash(i+40)*TAU,hash(i+61)*.25);m.castShadow=false;m.receiveShadow=false;
  }
  const chunks=new Map();const CHUNK=160;
  function makeChunk(index) {
    const s0=index*CHUNK,s1=s0+CHUNK, group=new THREE.Group();group.name='Coast '+index;
    group.add(makeLand(s0,s1));
    group.add(ribbon(s0,s1,-ROAD_HALF-.62,ROAD_HALF+.62,-.015,shared.cream));
    group.add(ribbon(s0,s1,-ROAD_HALF,ROAD_HALF,.007,shared.asphalt));
    group.add(ribbon(s0,s1,-ROAD_HALF+.24,-ROAD_HALF+.34,.025,shared.paint));
    group.add(ribbon(s0,s1,ROAD_HALF-.34,ROAD_HALF-.24,.025,shared.paint));
    const dash=[],rocks=[],trunks=[],leaves=[],poles=[],rails=[],railStripes=[],shrubs=[],cacti=[],roadReflectors=[];
    for(let ds=Math.ceil(s0/12)*12;ds<s1;ds+=12) {
      dash.push([centerX(ds),groundY(ds)+.022,-ds,.115,.025,4.2,0,Math.atan2(centerX(ds+1)-centerX(ds-1),-2),0]);
    }
    const density=quality==='low'?9:15;
    for(let i=0;i<density;i++) {
      const key=index*83+i, s=s0+(i+.3)*CHUNK/density;
      const side=hash(key+412)>.5?1:-1;
      const x=centerX(s)+side*(14+hash(key+76)*34),y=groundY(s);
      const scale=1.3+hash(key+3)*5;
      rocks.push([x,y+scale*.32,-s,scale,scale*.8,scale*1.4,hash(key+8)*.8,hash(key+9)*TAU,hash(key+7)*.3]);
      if(i%3===0) {
        const px=centerX(s)-side*(13+hash(key+44)*14),py=groundY(s),height=7+hash(key+87)*6;
        trunks.push([px,py+height*.5,-s,.19,height,.19,.08*side,0,-.1*side]);
        const crownX=px-height*.08*side;
        for(let j=0;j<6;j++) {
          const angle=j*TAU/6+hash(key+31)*TAU;
          leaves.push([crownX,py+height-.1,-s,1,1,1,0,angle,0]);
        }
      } else if(i%3===1) {
        const cx=centerX(s)+side*(12+hash(key+111)*17),h=1.8+hash(key+222)*2;
        cacti.push([cx,y+h*.5,-s,.3,h,.3,0,0,0]);
        cacti.push([cx+.6,y+h*.65,-s,.22,1.2,.22,0,0,0]);
        cacti.push([cx+.3,y+h*.5,-s,.22,.75,.22,0,0,Math.PI/2]);
      }
      for(let j=0;j<2;j++) {
        const ss=s+j*3,xx=centerX(ss)+side*(10+hash(key+j+50)*9);
        shrubs.push([xx,groundY(ss)+.3,-ss,.7+hash(key+j+30),.4+hash(key+j+20)*.5,.7,0,hash(key)*TAU,0]);
      }
    }
    // Short open guardrails establish scale while leaving the jumps visually open.
    for(let s=Math.ceil(s0/8)*8;s<s1;s+=8) {
      const side=Math.sin(s*.009)>.35?-1:1;
      if(Math.floor(s/80)%3!==1) {
        const px=centerX(s)+side*(ROAD_HALF+.6), yy=groundY(s);
        poles.push([px,yy+.6,-s,.13,1.2,.13,0,0,0]);
        rails.push([px,yy+.98,-s,.12,.18,8.15,0,-Math.atan((centerX(s+4)-centerX(s-4))/8),0]);
        roadReflectors.push([px-side*.09,yy+1,-s,.04,.12,.2,0,0,0]);
      }
    }
    if(index%2===0) {
      const s=s0+95,x=centerX(s)+ROAD_HALF+2,y=groundY(s);
      poles.push([x,y+2.1,-s,.16,4.2,.16,0,0,0]);
      const sign=box(group,shared.gold,x,y+3.7,-s,1.8,1.8,.13);sign.rotation.z=Math.PI/4;
      // Three arrow strokes, readable at speed without texture downloads.
      for(let k=0;k<2;k++) {
        const slash=box(group,shared.dark,x-.1+k*.48,y+3.7,-s+.08,.15,.8,.035);slash.rotation.z=-Math.PI/4;
      }
    }
    instanced(boxGeo,shared.paint,dash,group);
    instanced(rockGeo,shared.rock,rocks,group);
    instanced(cylinderGeo,shared.trunk,trunks,group);
    instanced(leafGeo,shared.leaf,leaves,group);
    instanced(cylinderGeo,shared.dark,poles,group);
    instanced(boxGeo,shared.cream,rails,group);
    instanced(boxGeo,shared.orange,roadReflectors,group);
    instanced(rockGeo,shared.leaf,shrubs,group);
    instanced(cylinderGeo,shared.leaf,cacti,group);
    root.add(group);return group;
  }
  function releaseChunk(chunk) {
    chunk.traverse(o=>{if(o.userData.ownedGeometry)o.geometry.dispose();if(o.isInstancedMesh)o.dispose();});
    root.remove(chunk);
  }
  function update(s,time=0,maxS=s) {
    const focus=[Number.isFinite(s)?s:0,Number.isFinite(maxS)?maxS:s];
    const wanted=new Set();
    // Keep a small independent visibility range around each player. A crashed
    // player can remain kilometres behind without filling that entire gap.
    for(const distance of focus) {
      const current=Math.floor(distance/CHUNK);
      for(let n=current-2;n<=current+(quality==='low'?4:6);n++)wanted.add(n);
    }
    for(const n of wanted)if(!chunks.has(n))chunks.set(n,makeChunk(n));
    for(const[n,c]of chunks)if(!wanted.has(n)){releaseChunk(c);chunks.delete(n);}
    setView((focus[0]+focus[1])*.5,time);
  }
  function setView(s,time=0) {
    sky.position.set(centerX(s),groundY(s),-s);
    ocean.position.set(centerX(s),groundY(s)-28,-s-1200);
    glints.position.set(centerX(s),groundY(s)-27.96,-s-1400);
    mountains.position.set(centerX(s)*.15,groundY(s)-60,-s-300);
  }
  function setTheme(value) {
    const night=value==='night'||value==='midnight';
    skyMaterial.uniforms.uTop.value.set(night?'#203346':'#83c6d1');
    skyMaterial.uniforms.uHorizon.value.set(night?'#e58d92':'#ffdbc4');
    skyMaterial.uniforms.uBottom.value.set(night?'#65577f':'#efb79e');
    skyMaterial.uniforms.uSunColor.value.set(night?'#ffd9b3':'#fff4cc');
    skyMaterial.uniforms.uNight.value=night?1:0;
    oceanMat.color.set(night?'#2b737c':'#6bbab5');
    mountainMats[0].color.set(night?'#69687d':'#c88f89');
    mountainMats[1].color.set(night?'#878090':'#d5a69b');
    mountainMats[2].color.set(night?'#586c80':'#b69a99');
  }
  setTheme(theme);update(0);
  return {update,setView,setTheme,dispose(){for(const c of chunks.values())releaseChunk(c);chunks.clear();scene.remove(root);sky.geometry.dispose();ocean.geometry.dispose();oceanMat.dispose();glints.material.dispose();glints.dispose();mountainMats.forEach(m=>m.dispose());}};
}

export function createCart(color='#ff6338') {
  const cart=new THREE.Group();cart.name='Shopping cart';
  const colorMat=mat(color,{roughness:.48}),fabric=mat(color,{roughness:.9});
  const cream=shared.cream,chrome=shared.chrome;
  // Cart frame and tapered wire basket: all metal bars share a single draw call.
  const bars=[];
  function rod(a,b,r=.025) {bars.push({a:new THREE.Vector3(...a),b:new THREE.Vector3(...b),r});}
  for(const x of[-.58,.58]) {
    rod([x,.34,-.8],[x,.34,.76],.042);
    rod([x,.34,.65],[x,1.52,.76],.038);
    rod([x,.42,-.7],[x,.9,-.7],.032);
    rod([x,.9,-.85],[x,.9,.55],.035);
  }
  rod([-.58,.34,-.68],[.58,.34,-.68],.04);rod([-.58,.34,.61],[.58,.34,.61],.04);
  // Basket bottom is narrower than its rim.
  for(let k=0;k<=8;k++) {
    const z=-.96+k*.19;
    const t=k/8;
    rod([-.55,.85,z*.82],[.55,.85,z*.82],.016);
    rod([-.55,.85,z*.82],[-.7,1.55,z],.018);
    rod([.55,.85,z*.82],[.7,1.55,z],.018);
  }
  for(let k=0;k<=6;k++) {
    const x=-.7+k*1.4/6;
    rod([x*.78,.85,-.79],[x,1.55,-.96],.019);
    rod([x*.78,.85,.46],[x,1.55,.56],.019);
  }
  for(const y of[.87,1.08,1.31,1.55]) {
    const t=(y-.85)/.7,w=.55+.15*t,front=-.79-.17*t,back=.46+.1*t;
    rod([-w,y,front],[w,y,front],y===1.55?.032:.018);
    rod([-w,y,back],[w,y,back],.023);
    rod([-w,y,front],[-w,y,back],.022);rod([w,y,front],[w,y,back],.022);
  }
  const wires=new THREE.InstancedMesh(cylinderGeo,chrome,bars.length);
  bars.forEach((b,i)=>{delta.subVectors(b.b,b.a);dummy.position.copy(b.a).add(b.b).multiplyScalar(.5);dummy.scale.set(b.r,delta.length(),b.r);dummy.quaternion.setFromUnitVectors(up,delta.normalize());dummy.updateMatrix();wires.setMatrixAt(i,dummy.matrix);});
  wires.castShadow=true;cart.add(wires);
  const handle=box(cart,colorMat,0,1.55,.78,1.48,.11,.14);handle.rotation.x=-.08;
  const frontBadge=box(cart,colorMat,0,1.27,-.962,.42,.29,.035);
  box(cart,cream,0,1.27,-.986,.23,.035,.015);
  const wheels=[];
  for(const x of[-.64,.64])for(const z of[-.73,.65]) {
    const wheel=new THREE.Group();wheel.position.set(x,.27,z);
    const tire=mesh(geom.tire,shared.rubber,wheel);tire.rotation.z=Math.PI/2;
    const hub=mesh(geom.hub,chrome,wheel);hub.rotation.z=Math.PI/2;
    box(wheel,shared.dark,0,0,0,.18,.035,.31);
    cart.add(wheel);wheels.push(wheel);
    box(cart,chrome,x,.53,z,.08,.23,.08);
  }
  // Groceries provide a readable payload and a little secondary motion.
  const groceries=new THREE.Group();cart.add(groceries);
  const cereal=box(groceries,mat('#ffc655'),-.25,1.23,-.48,.4,.68,.24);cereal.rotation.z=-.12;
  box(groceries,cream,-.25,1.3,-.61,.27,.26,.02);
  const milk=box(groceries,mat('#79bec5'),.3,1.19,-.3,.28,.63,.29);milk.rotation.z=.1;
  box(groceries,cream,.3,1.5,-.3,.28,.07,.29);
  ball(groceries,mat('#d55039'),-.2,1.1,.05,.19);
  ball(groceries,mat('#78a649'),.15,1.1,.13,.21);
  const bread=mesh(new THREE.CapsuleGeometry(.12,.8,4,8),mat('#dca164'),groceries,.35,1.49,-.55);
  bread.rotation.z=-.32;bread.rotation.x=.16;
  for(let i=0;i<3;i++) {
    const slash=box(groceries,cream,.35+(i-1)*.08,1.35+i*.17,-.68,.13,.025,.025);slash.rotation.z=-.3;
  }
  // A small helmeted daredevil is seated behind the basket.
  const rider=new THREE.Group();rider.position.set(0,0,.14);cart.add(rider);
  const torso=mesh(new THREE.CapsuleGeometry(.29,.43,5,10),fabric,rider,0,1.62,.79);torso.rotation.x=-.16;torso.scale.z=.75;
  const patch=box(rider,cream,0,1.64,1.018,.3,.24,.025);
  box(rider,shared.dark,-.035,1.65,1.034,.025,.16,.008);box(rider,shared.dark,.04,1.72,1.034,.11,.025,.008);
  const head=ball(rider,mat('#dab08d'),0,2.16,.7,.24);
  const helmet=mesh(new THREE.SphereGeometry(.275,20,12,0,TAU,0,1.95),shared.cream,rider,0,2.21,.7);helmet.rotation.x=-.09;
  const visor=mesh(new THREE.SphereGeometry(.249,16,8,Math.PI*1.15,Math.PI*.7,Math.PI*.32,Math.PI*.36),shared.black,rider,0,2.2,.7);visor.rotation.y=0;
  box(rider,colorMat,0,2.465,.7,.11,.03,.28);
  for(const side of[-1,1]) {
    const shoulder=new THREE.Vector3(side*.29,1.83,.72),elbow=new THREE.Vector3(side*.49,1.56,.69),hand=new THREE.Vector3(side*.5,1.54,.6);
    tube(rider,fabric,shoulder,elbow,.1);tube(rider,fabric,elbow,hand,.085);ball(rider,shared.dark,hand.x,hand.y,hand.z,.1);
    const hip=new THREE.Vector3(side*.2,1.35,.81),knee=new THREE.Vector3(side*.58,1.0,.96),foot=new THREE.Vector3(side*.6,.62,.57);
    tube(rider,shared.dark,hip,knee,.12);tube(rider,shared.dark,knee,foot,.105);
    const shoe=box(rider,cream,foot.x,.59,.48,.26,.18,.43);shoe.rotation.y=side*.12;
    box(rider,shared.dark,foot.x,.51,.48,.27,.035,.44);
  }
  cart.userData.wheels=wheels;cart.userData.rider=rider;cart.userData.groceries=groceries;
  cart.userData.colorMaterial=colorMat;cart.userData.fabricMaterial=fabric;
  return markOwnedResources(cart);
}

export function createObject(obj) {
  const g=new THREE.Group();g.name=obj.type;
  const w=obj.w||2,length=obj.length||9,height=obj.height||2.4;
  if(obj.type==='cone') {
    const coneHeight=obj.height||1.1;
    box(g,shared.dark,0,.05,0,.8,.1,.8);
    mesh(coneGeo,shared.orange,g,0,.1+(coneHeight-.1)*.5,0,.36,coneHeight-.1,.36);
    mesh(new THREE.CylinderGeometry(.16,.23,.18,12),shared.cream,g,0,coneHeight*.62,0);
  } else if(obj.type==='crate') {
    const size=obj.w||1.8;
    box(g,shared.sand,0,size*.5,0,size,size,size);
    box(g,shared.trunk,0,size*.5,size*.505,size*.1,size,.045);
    box(g,shared.trunk,0,size*.5,-size*.505,size*.1,size,.045);
    box(g,shared.trunk,0,size+.015,0,size*.1,.04,size);
    box(g,shared.cream,size*.22,size*.65,size*.51,size*.32,size*.3,.018);
    for(const y of[.13,size-.13])box(g,shared.trunk,0,y,size*.51,size,.12,.04);
  } else if(obj.type==='barrier') {
    const width=obj.w||3.8;
    for(const x of[-width*.37,width*.37]) {
      box(g,shared.dark,x,.47,0,.14,.94,.14);box(g,shared.dark,x,.06,0,.7,.12,.65);
    }
    box(g,shared.cream,0,.86,0,width,.55,.23);
    const count=Math.max(3,Math.floor(width/.6));
    for(let i=0;i<count;i++){const stripe=box(g,shared.orange,-width*.45+i*(width*.9/(count-1)),.86,.13,.24,.56,.025);stripe.rotation.z=-.35;}
    for(const x of[-width*.4,width*.4]) {
      mesh(cylinderGeo,shared.dark,g,x,1.26,0,.07,.25,.07);
      ball(g,shared.gold,x,1.4,0,.14);
    }
  } else if(obj.type==='ramp') {
    const width=obj.w||4, len=obj.length||9,h=obj.height||2.4;
    const back=.035*len/2,front=-.035*len/2;
    const p=[-width/2,back,len/2,width/2,back,len/2,-width/2,front+h,-len/2,width/2,front+h,-len/2,
      -width/2,front,-len/2,width/2,front,-len/2];
    const geomRamp=new THREE.BufferGeometry();geomRamp.setAttribute('position',new THREE.Float32BufferAttribute(p,3));
    geomRamp.setIndex([0,1,2,1,3,2,0,2,4,1,5,3,2,3,4,3,5,4,0,4,1,1,4,5]);geomRamp.computeVertexNormals();
    const ramp=mesh(geomRamp,shared.teal,g);ramp.userData.ownedGeometry=true;
    for(const x of[-width/2+.1,width/2-.1]) {
      const rail=box(g,shared.cream,x,h*.5+.035,0,.16,.045,Math.hypot(len,h-len*.035));rail.rotation.x=Math.atan2(h-len*.035,len);
    }
    const lip=box(g,shared.gold,0,front+h+.025,-len/2+.22,width,.06,.45);
    // White directional chevrons lie on the ramp surface.
    const slope=Math.atan2(h-len*.035,len);
    for(let i=0;i<3;i++) {
      const z=1.8-i*2,y=(.5-z/len)*h+z*.035+.035;
      const arrow=new THREE.Group();arrow.position.set(0,y,z);arrow.rotation.x=slope;
      for(const side of[-1,1]) {
        const part=box(arrow,shared.cream,side*.42,0,0,.16,.027,1.2);part.rotation.y=side*.72;
      }
      g.add(arrow);
    }
  } else if(obj.type==='coin') {
    const coin=mesh(geom.ring,shared.gold,g,0,obj.height||1.25,0);
    const center=box(g,shared.cream,0,obj.height||1.25,0,.16,.48,.1);center.rotation.z=-.28;
    g.userData.spin=true;g.userData.float=true;
  } else if(obj.type==='boost') {
    mesh(geom.boost,shared.teal,g,0,obj.height||1.25,0).rotation.z=.3;
    const slash=box(g,shared.cream,0,obj.height||1.25,.34,.11,.55,.08);slash.rotation.z=-.32;
    g.userData.spin=true;g.userData.float=true;
  } else if(obj.type==='ring') {
    const radius=obj.radius||(obj.w?obj.w*.5:2.35), ringHeight=obj.height||4.5;
    const ring=new THREE.Mesh(new THREE.TorusGeometry(radius,.13,8,40),shared.gold);ring.position.y=ringHeight;g.add(ring);
    ring.userData.ownedGeometry=true;
    for(const side of[-1,1]) {
      box(g,shared.dark,side*(radius+.3),ringHeight*.5,0,.12,ringHeight,.12);
      box(g,shared.teal,side*(radius+.3),ringHeight*.6,.02,.28,1.1,.15);
    }
    g.userData.ring=ring;
  }
  return markOwnedResources(g);
}
