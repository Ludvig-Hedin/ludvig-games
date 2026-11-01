import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Everything in this scene is original geometry and procedural canvas artwork.
const TAU = Math.PI * 2;
const palettes = {
  cream: 0xf5ecd7, chalk: 0xfff7e9, teal: 0x247f79, darkTeal: 0x184a4c,
  terra: 0xce7459, apricot: 0xf3b789, mustard: 0xf7be42, ink: 0x243b43,
  walnut: 0x704f39, metal: 0x9aaca9, leaf: 0x4e855a, pink: 0xe39c8e,
};
const cache = new Map();
const mat = (color, roughness = .7, metalness = 0) => {
  const key = `${color}:${roughness}:${metalness}`;
  if (!cache.has(key)) { const material=new THREE.MeshStandardMaterial({ color, roughness, metalness }); material.userData.panicShared=true; cache.set(key,material); }
  return cache.get(key);
};
const M = Object.fromEntries(Object.entries(palettes).map(([key, color]) => [key, mat(color)]));
const roundGeometry = (w,h,d,r=.07) => new RoundedBoxGeometry(w,h,d,2,Math.min(r,w/3,h/3,d/3));
function mesh(parent, geometry, material, x=0,y=0,z=0) {
  const object = new THREE.Mesh(geometry, material);
  object.position.set(x,y,z); object.castShadow = true; object.receiveShadow = true; parent.add(object); return object;
}
function box(parent,w,h,d,material,x=0,y=0,z=0,r=0) {
  return mesh(parent,r ? roundGeometry(w,h,d,r) : new THREE.BoxGeometry(w,h,d),material,x,y,z);
}
function sphere(parent,r,material,x,y,z,sx=1,sy=1,sz=1) {
  const ob = mesh(parent,new THREE.SphereGeometry(r,12,8),material,x,y,z); ob.scale.set(sx,sy,sz); return ob;
}
function cylinder(parent,rt,rb,h,material,x,y,z,n=16) {
  return mesh(parent,new THREE.CylinderGeometry(rt,rb,h,n),material,x,y,z);
}
function canvasTexture(width,height,draw) {
  const c=document.createElement('canvas'); c.width=width; c.height=height;
  draw(c.getContext('2d'),width,height);
  const t=new THREE.CanvasTexture(c); t.colorSpace=THREE.SRGBColorSpace; t.anisotropy=8; return t;
}
function print(parent,text,w,h,x,y,z,{bg='#f8edd6',fg='#234946',font=52,rotate=0}={}) {
  const texture=canvasTexture(512,256,(c,cw,ch)=>{
    c.fillStyle=bg; c.fillRect(0,0,cw,ch); c.fillStyle=fg;
    c.textAlign='center'; c.textBaseline='middle'; c.font=`900 ${font}px sans-serif`;
    const lines=text.split('\n'); lines.forEach((line,i)=>c.fillText(line,cw/2,ch/2+(i-(lines.length-1)/2)*(font+8)));
  });
  const material=new THREE.MeshStandardMaterial({map:texture,roughness:.85});
  const panel=mesh(parent,new THREE.PlaneGeometry(w,h),material,x,y,z); panel.rotation.y=rotate; return panel;
}
function batch(group) {
  group.updateMatrixWorld(true);
  const buckets=new Map();
  group.traverse(ob=>{
    if(!ob.isMesh) return;
    const material=ob.material;
    if(!buckets.has(material)) buckets.set(material,[]);
    let g=ob.geometry.clone().applyMatrix4(ob.matrixWorld);
    if(g.index) g=g.toNonIndexed();
    // All built-in geometries have positions/normals/uv; tangents are not needed here.
    for(const key of Object.keys(g.attributes)) if(!['position','normal','uv'].includes(key)) g.deleteAttribute(key);
    buckets.get(material).push(g);
  });
  const output=new THREE.Group();
  for(const [material, geometries] of buckets) {
    const geometry=mergeGeometries(geometries,false);
    if(!geometry) { for(const g of geometries) mesh(output,g,material); continue; }
    const combined=mesh(output,geometry,material); combined.castShadow=true; combined.receiveShadow=true;
    geometries.forEach(g=>g.dispose());
  }
  return output;
}
let randomSeed=1234567;
function rnd() { randomSeed=(randomSeed*1664525+1013904223)>>>0;return randomSeed/4294967296; }

const woodTexture=()=>canvasTexture(1024,1024,(c,w,h)=>{
  c.fillStyle='#c69b72';c.fillRect(0,0,w,h);
  let seed=77;const r=()=>{seed=(seed*16807)%2147483647;return(seed-1)/2147483646;};
  const rows=16, rowH=h/rows;
  for(let row=0;row<rows;row++) {
    let offset=(row%3)*120;
    for(let x=-offset;x<w;x+=340) {
      const light=50+r()*12;
      c.fillStyle=`hsl(${29+r()*5} 37% ${light}%)`;c.fillRect(x,row*rowH,338,rowH-2);
      c.strokeStyle='rgba(87,53,30,.11)';c.lineWidth=1;
      for(let i=0;i<12;i++) {
        const yy=row*rowH+4+r()*(rowH-8);c.beginPath();c.moveTo(x+3,yy);
        c.bezierCurveTo(x+90,yy+r()*9-4,x+220,yy+r()*9-4,x+336,yy);c.stroke();
      }
      c.fillStyle='rgba(255,236,196,.18)';c.fillRect(x,row*rowH,338,1);
    }
  }
});
const rugTexture=()=>canvasTexture(1024,768,(c,w,h)=>{
  c.fillStyle='#337f79';c.fillRect(0,0,w,h);c.fillStyle='#efdfbd';
  c.fillRect(16,16,w-32,h-32);c.fillStyle='#337f79';c.fillRect(31,31,w-62,h-62);
  c.strokeStyle='rgba(248,227,181,.6)';c.lineWidth=10;
  for(let x=-170;x<w+170;x+=280){c.beginPath();c.arc(x,h/2,200,0,TAU);c.stroke();c.beginPath();c.arc(x,h/2,120,0,TAU);c.stroke();}
  for(let y=0;y<h;y+=4){c.fillStyle=y%8?'rgba(255,255,255,.028)':'rgba(0,0,0,.025)';c.fillRect(0,y,w,1);}
});

export function createProp(kind,color) {
  const g=new THREE.Group();
  const fabric=mat(color ?? (kind==='sofa'?0xdb8c72:kind==='armchair'?0xf0b93d:0xf2cc95),.94);
  const lighter=fabric.clone(); lighter.userData.panicShared=false; lighter.color.lerp(new THREE.Color(0xfff1d8),.13);
  if(kind==='sofa') {
    box(g,2.08,.34,.94,fabric,0,-.26,0,.11);
    box(g,2.0,.75,.27,fabric,0,.17,-.35,.12);
    for(const x of [-.96,.96]) box(g,.23,.55,.98,fabric,x,-.04,0,.09);
    for(const x of [-.49,.49]) {box(g,.85,.24,.69,lighter,x,-.02,.08,.08);box(g,.85,.42,.16,lighter,x,.27,-.18,.08);}
    for(const x of [-.85,.85])for(const z of[-.32,.32]) cylinder(g,.055,.035,.18,M.walnut,x,-.535,z,8);
    const pillow=box(g,.36,.36,.18,M.cream,.68,.28,.03,.1);pillow.rotation.z=-.2;
  } else if(kind==='armchair') {
    box(g,1.08,.3,.99,fabric,0,-.3,0,.09);
    box(g,1.04,.85,.24,fabric,0,.15,-.37,.1);
    for(const x of [-.47,.47])box(g,.2,.65,.93,fabric,x,-.03,.02,.08);
    box(g,.75,.24,.7,lighter,0,-.03,.11,.09);box(g,.74,.43,.18,lighter,0,.28,-.2,.09);
    for(const x of[-.39,.39])for(const z of[-.36,.36]) cylinder(g,.045,.03,.2,M.walnut,x,-.55,z,8);
  } else if(kind==='table') {
    box(g,1.7,.13,1.05,M.walnut,0,.385,0,.045);
    box(g,1.66,.025,1.01,M.apricot,0,.46,0,.015);
    for(const x of[-.68,.68])for(const z of[-.38,.38])box(g,.105,.78,.105,M.darkTeal,x,-.045,z,.025);
    box(g,.42,.015,.32,M.cream,.3,.48,.1);
    box(g,.28,.02,.28,M.terra,-.31,.485,-.14,.025);
  } else if(kind==='tv') {
    box(g,1.7,1.0,.16,M.ink,0,.1,0,.05);
    const texture=canvasTexture(512,300,(c,w,h)=>{
      c.fillStyle='#23464e';c.fillRect(0,0,w,h);
      const cols=['#f5dca8','#e99a78','#6da599','#346f77','#263e48'];
      cols.forEach((col,i)=>{c.fillStyle=col;c.fillRect(i*w/5,0,w/5,h);});
      c.fillStyle='rgba(12,32,36,.72)';c.fillRect(0,h*.57,w,h*.43);
      c.fillStyle='#f5ead0';c.font='800 44px sans-serif';c.textAlign='center';c.fillText('NO SIGNAL',w/2,h*.8);
      for(let y=0;y<h;y+=4){c.fillStyle='rgba(0,0,0,.12)';c.fillRect(0,y,w,1);}
    });
    mesh(g,new THREE.PlaneGeometry(1.54,.84),new THREE.MeshStandardMaterial({map:texture,emissive:0xffffff,emissiveMap:texture,emissiveIntensity:.16,roughness:.3}),0,.1,.086);
    box(g,.12,.24,.12,M.ink,0,-.47,0,.015);box(g,.78,.06,.32,M.ink,0,-.57,.03,.025);
    sphere(g,.015,mat(0xff8f52),.72,-.345,.09);
  } else if(kind==='box') {
    box(g,.85,.8,.85,mat(color??0xc79358),0,0,0,.025);
    box(g,.18,.006,.84,M.cream,0,.404,0);
    box(g,.18,.8,.006,M.cream,0,0,.429);box(g,.18,.8,.006,M.cream,0,0,-.429);
    print(g,'↑  ↑\nFRAGILE',.34,.25,.2,.08,.434,{bg:'#ead1a6',fg:'#72563b',font:45});
  } else if(kind==='plant') {
    cylinder(g,.28,.2,.48,mat(color??0xe4ae89),0,-.51,0,16);
    cylinder(g,.287,.287,.065,M.cream,0,-.3,0,16);cylinder(g,.249,.249,.014,M.walnut,0,-.263,0,16);
    for(let i=0;i<7;i++) {
      const a=i*2.4,yy=-.01+(i%3)*.19,rr=.17+(i%2)*.05;
      const stem=cylinder(g,.012,.012,.6,M.leaf,Math.sin(a)*rr*.45,-.03,Math.cos(a)*rr*.45,6);stem.rotation.z=Math.cos(a)*.3;stem.rotation.x=Math.sin(a)*.3;
      const leaf=sphere(g,.16,mat(i%2?0x497d50:0x709a60),Math.sin(a)*rr,yy+.17,Math.cos(a)*rr,.72,1.65,.36);leaf.rotation.z=Math.cos(a)*-.75;leaf.rotation.x=Math.sin(a)*.75;
    }
    sphere(g,.13,M.leaf,0,.54,0,.6,1.6,.4);
  } else if(kind==='lamp') {
    cylinder(g,.29,.32,.08,M.darkTeal,0,-.91,0,24);
    cylinder(g,.027,.027,1.45,mat(0xc9a665,.35,.55),0,-.16,0,10);
    cylinder(g,.19,.325,.48,M.cream,0,.67,0,24);
    cylinder(g,.313,.313,.02,mat(0xffe5a4),0,.433,0,24);
    sphere(g,.11,new THREE.MeshStandardMaterial({color:0xffdc9a,emissive:0xffc578,emissiveIntensity:.8}),0,.48,0);
  } else if(kind==='fridge') {
    box(g,1,1.8,1,mat(color??0xe4e7d7),0,0,0,.08);
    box(g,.94,.64,.065,M.chalk,0,.535,.48,.04);box(g,.94,1.03,.065,M.chalk,0,-.335,.48,.04);
    for(const y of[.45,-.15])box(g,.05,.32,.055,M.metal,.31,y,.542,.015);
    box(g,.19,.23,.008,M.cream,-.2,.63,.519);
    sphere(g,.034,M.terra,-.2,.73,.531,1,1,.25);
    box(g,.12,.08,.01,M.teal,-.22,-.13,.519,.015);
  } else if(kind==='art') {
    box(g,1.25,1,.15,M.walnut,0,0,0,.025);
    const texture=canvasTexture(512,400,(c,w,h)=>{
      c.fillStyle='#f2ddbd';c.fillRect(0,0,w,h);c.fillStyle='#d87a56';c.beginPath();c.arc(w*.64,h*.35,90,0,TAU);c.fill();
      c.fillStyle='#347a75';c.beginPath();c.moveTo(0,h);c.lineTo(0,h*.7);c.quadraticCurveTo(w*.45,h*.3,w,h*.75);c.lineTo(w,h);c.fill();
      c.strokeStyle='#274f51';c.lineWidth=8;for(let i=0;i<5;i++){c.beginPath();c.moveTo(50+i*24,h);c.bezierCurveTo(30+i*20,h*.6,150+i*24,h*.5,110+i*24,h*.13);c.stroke();}
    });
    mesh(g,new THREE.PlaneGeometry(1.12,.87),new THREE.MeshStandardMaterial({map:texture,roughness:.8}),0,0,.079);
  } else {
    box(g,.8,.8,.8,fabric,0,0,0,.08);
  }
  const out=batch(g);out.userData.kind=kind;return out;
}

export function createMover(color=0xf4be42) {
  const g=new THREE.Group(); const suit=mat(color,.82), trim=M.chalk;
  const body=new THREE.Group();g.add(body);
  box(body,.65,.62,.44,suit,0,1.03,0,.16);
  box(body,.57,.26,.4,suit,0,.7,0,.1);
  box(body,.64,.085,.454,M.cream,0,.94,0,.018);
  box(body,.025,.37,.015,M.darkTeal,0,1.125,.226);
  box(body,.18,.14,.025,trim,.17,1.19,.235,.02);
  const head=new THREE.Group();head.position.y=1.47;g.add(head);
  sphere(head,.27,mat(0xe6bc93),0,0,0,1,1,.93);
  box(head,.46,.19,.14,M.ink,0,.035,.22,.07);
  box(head,.16,.025,.01,mat(0x86c6c0,.2,.4),-.09,.079,.296,.006);
  const helmet=new THREE.Group();head.add(helmet);
  mesh(helmet,new THREE.SphereGeometry(.345,16,10,0,TAU,0,Math.PI/2),trim,0,.075,0);
  cylinder(helmet,.39,.39,.055,trim,0,.075,0,24);
  box(helmet,.045,.06,.43,suit,0,.368,0,.022);
  const arm=(side)=>{
    const a=new THREE.Group();a.position.set(side*.41,1.23,0);g.add(a);
    const sleeve=box(a,.2,.35,.22,suit,0,-.17,0,.085);sleeve.rotation.z=side*.08;
    sphere(a,.12,mat(0x66503c),side*.015,-.405,.015,1,1.16,.9);
    box(a,.21,.055,.23,trim,side*.009,-.3,0,.018);return a;
  };
  const leg=(side)=>{
    const l=new THREE.Group();l.position.set(side*.18,.64,0);g.add(l);
    box(l,.23,.38,.25,suit,0,-.18,0,.075);
    box(l,.255,.17,.34,M.darkTeal,0,-.475,.045,.06);return l;
  };
  const leftArm=arm(-1),rightArm=arm(1),leftLeg=leg(-1),rightLeg=leg(1);
  g.userData={body,head,leftArm,rightArm,leftLeg,rightLeg,helmet};
  return g;
}

export function buildWorld(scene) {
  randomSeed=1234567;
  scene.background=new THREE.Color(0xf4c5a5);
  scene.fog=new THREE.Fog(0xf0c6ac,62,178);
  const solids=[], glass=[];
  const fixed=new THREE.Group();
  const addSolid=(x,y,z,w,h,d)=>{solids.push({pos:[x,y,z],size:[w,h,d]});};
  const sun=new THREE.DirectionalLight(0xffe5b5,3.1);sun.position.set(-14,29,12);sun.castShadow=true;
  sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-21;sun.shadow.camera.right=21;sun.shadow.camera.top=18;sun.shadow.camera.bottom=-20;
  sun.shadow.camera.near=1;sun.shadow.camera.far=75;sun.shadow.normalBias=.035;sun.shadow.bias=-.0002;sun.shadow.radius=3;
  sun.target.position.set(0,0,1);scene.add(sun,sun.target);
  scene.add(new THREE.HemisphereLight(0xffecd1,0x54787c,2.0));
  const fill=new THREE.DirectionalLight(0xb0e7e7,.8);fill.position.set(18,8,-14);scene.add(fill);

  // Cutaway architectural shell and a deep facade sell the height of the penthouse.
  box(fixed,24.5,.65,16.5,M.cream,0,-.36,0,.12);
  addSolid(0,-.35,0,24,.7,16);
  box(fixed,23.7,27,15.6,mat(0xc49f83),0,-14.2,-.1);
  box(fixed,24.15,.2,16.0,M.chalk,0,-2.2,-.1);
  for(let y=-5;y>-28;y-=4)box(fixed,24.1,.12,15.9,mat(0xddbc9a),0,y,-.1);
  const wood=woodTexture();wood.wrapS=wood.wrapT=THREE.RepeatWrapping;wood.repeat.set(2.8,2.0);
  const floorMat=new THREE.MeshStandardMaterial({map:wood,roughness:.79,color:0xf8e5c5});
  box(fixed,24,.035,16,floorMat,0,.018,0);
  box(fixed,24.25,.11,.18,M.walnut,0,.005,7.98,.025);
  box(fixed,.18,.11,16,M.walnut,11.98,.005,0,.025);
  box(fixed,24,.9,.28,M.cream,0,.45,-7.92);
  box(fixed,8.2,3.9,.28,M.cream,7.9,1.95,-7.92);
  box(fixed,.28,3.7,16,M.cream,-11.92,1.85,0);
  addSolid(0,.45,-8,24,.9,.25);addSolid(7.9,1.95,-8,8.2,3.9,.25);addSolid(-12,1.85,0,.25,3.7,16);
  box(fixed,24,.16,.4,M.darkTeal,0,3.95,-7.92,.02);
  box(fixed,.4,.16,16.3,M.darkTeal,-11.92,3.77,0,.02);
  box(fixed,24,.11,.1,M.walnut,0,.1,-7.73);
  box(fixed,.1,.11,16,M.walnut,-11.73,.1,0);
  // Tall window mullions, sky visible beyond a lightly tinted pane.
  const windowMat=new THREE.MeshStandardMaterial({color:0xadd9d1,transparent:true,opacity:.22,roughness:.2,metalness:.1,depthWrite:false});
  for(const x of[-10,-6.7,-3.4,-.1,3.2]) {
    box(fixed,.085,3.0,.16,M.darkTeal,x,2.4,-7.78);
  }
  box(fixed,15.5,.08,.14,M.darkTeal,-4.3,2.7,-7.78);
  box(fixed,15.5,.1,.15,M.darkTeal,-4.3,1,-7.78);
  mesh(fixed,new THREE.PlaneGeometry(15.2,2.85),windowMat,-4.25,2.45,-7.9);

  // Quiet domestic detail lives at the perimeter; the center stays playable.
  const tileMat=mat(0xd7d5bb);
  box(fixed,8.4,.02,2.7,tileMat,-7.15,.047,-6.5);
  for(let x=-11.2;x<-3.1;x+=.6)box(fixed,.015,.006,2.7,mat(0xb8baa5),x,.061,-6.5);
  for(let z=-7.7;z<-5.1;z+=.6)box(fixed,8.4,.006,.015,mat(0xb8baa5),-7.15,.061,z);
  box(fixed,6.3,.89,1.04,M.teal,-7.15,.46,-7.02,.05);addSolid(-7.15,.5,-7.02,6.3,1,1.04);
  box(fixed,6.5,.13,1.15,M.chalk,-7.15,.98,-7.02,.025);
  for(let x=-9.7;x<-4.2;x+=1.05) {
    box(fixed,1.0,.7,.035,mat(0x358781),x,.49,-6.484,.02);
    box(fixed,.3,.026,.028,M.cream,x,.75,-6.455,.009);
  }
  box(fixed,1.2,.035,.65,M.ink,-8.8,1.058,-7.01,.06);
  for(const x of[-9.08,-8.55])for(const z of[-7.2,-6.83])cylinder(fixed,.12,.12,.012,M.metal,x,1.082,z,16);
  box(fixed,.9,.04,.65,M.metal,-5.6,1.07,-7.05,.1);
  box(fixed,.7,.05,.48,M.darkTeal,-5.6,1.075,-7.05,.1);
  cylinder(fixed,.035,.035,.4,M.metal,-5.6,1.27,-7.37,10);
  const tap=cylinder(fixed,.035,.035,.25,M.metal,-5.6,1.46,-7.25,10);tap.rotation.x=Math.PI/2;
  box(fixed,.5,.39,.37,M.terra,-7.4,1.25,-7.11,.065);
  box(fixed,.38,.022,.08,M.ink,-7.4,1.456,-7.11,.015);
  cylinder(fixed,.09,.075,.18,M.cream,-6.9,1.15,-6.79,12);
  box(fixed,2.3,.12,.45,M.walnut,-8,2.4,-7.56,.02);
  for(let i=0;i<5;i++)box(fixed,.12,.43+rnd()*.1,.2,i%2?M.cream:M.terra,-8.9+i*.17,2.7,-7.56,.008);
  cylinder(fixed,.14,.1,.3,M.teal,-7.25,2.61,-7.57,12);

  const rugMat=new THREE.MeshStandardMaterial({map:rugTexture(),roughness:1});
  const rug=mesh(fixed,new THREE.PlaneGeometry(7,4.8),rugMat,3.7,.044,-1.4);rug.rotation.x=-Math.PI/2;
  for(let i=0;i<32;i++)box(fixed,.025,.01,.12,M.cream,.2+i*.225,.05,-3.86);
  const wallArt=createProp('art');wallArt.position.set(7.9,2.25,-7.67);wallArt.scale.set(2.1,2.1,1);fixed.add(wallArt);
  const artworkMat=new THREE.MeshStandardMaterial({color:0xf8cc8d,emissive:0xefb451,emissiveIntensity:.2});
  box(fixed,2.8,.06,.15,artworkMat,7.9,3.52,-7.5,.02);
  const plant=createProp('plant');plant.position.set(10.6,1.1,-6.6);plant.scale.set(1.35,1.45,1.35);fixed.add(plant);addSolid(10.6,.43,-6.6,.75,.86,.75);
  const plant2=createProp('plant');plant2.position.set(-10.6,.95,5.6);plant2.scale.set(1.35,1.3,1.35);fixed.add(plant2);addSolid(-10.6,.35,5.6,.75,.7,.75);
  // Side wall door and little intercom.
  box(fixed,.03,2.85,1.65,M.darkTeal,-11.76,1.425,2.95,.04);
  box(fixed,.075,2.57,1.36,mat(0x698d84),-11.72,1.32,2.95,.025);
  box(fixed,.1,.045,.23,M.metal,-11.65,1.22,3.42,.01);
  const doorLabel=print(fixed,'28',.54,.32,-11.65,2.24,2.95,{bg:'#d4c1a0',fg:'#335c57',font:112,rotate:Math.PI/2});
  box(fixed,.04,.32,.18,M.ink,-11.74,1.42,4.21,.02);

  // Breakable balcony panes only at the two outer corners.
  const glassMaterial=new THREE.MeshPhysicalMaterial({color:0xa5e4df,transparent:true,opacity:.26,roughness:.08,metalness:.05,clearcoat:1,depthWrite:false,side:THREE.DoubleSide});
  for(const x of[-9,9]) {
    const pane=mesh(scene,new THREE.BoxGeometry(5.4,2.75,.045),glassMaterial,x,1.51,7.9);pane.castShadow=false;
    glass.push({mesh:pane,pos:[x,1.51,7.9],size:[5.4,2.75,.06]});
    for(const px of[x-2.75,x+2.75])box(fixed,.07,2.95,.1,M.darkTeal,px,1.47,7.9,.012);
    box(fixed,5.56,.08,.12,M.darkTeal,x,2.96,7.9,.014);
    box(fixed,5.56,.08,.12,M.darkTeal,x,.11,7.9,.012);
    box(fixed,.012,2.3,.012,M.chalk,x-1.9,1.65,7.94);
  }
  // Recessed cargo elevator / flying moving truck. Broad enough for gratifying throws.
  box(fixed,11.45,.64,5.45,M.darkTeal,0,-1.15,11,.15);
  box(fixed,11,.14,5,M.teal,0,-.87,11,.045);
  addSolid(0,-1,11,11,.4,5);
  const loadingTexture=canvasTexture(1024,512,(c,w,h)=>{
    c.fillStyle='#287971';c.fillRect(0,0,w,h);
    c.strokeStyle='#b9dfbe';c.lineWidth=8;c.setLineDash([35,24]);c.strokeRect(35,30,w-70,h-60);c.setLineDash([]);
    c.fillStyle='#e6edcd';c.font='900 86px sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText('LASTA HÄR',w/2,h*.47);
    c.font='700 26px sans-serif';c.fillText('ALLT SKA MED.',w/2,h*.68);
    for(let x=0;x<w;x+=110){c.fillStyle='#e8c565';c.fillRect(x,h-13,65,13);c.fillRect(x,0,65,13);}
  });
  const deckMat=new THREE.MeshStandardMaterial({map:loadingTexture,roughness:.85});
  const deck=mesh(fixed,new THREE.PlaneGeometry(10.7,4.7),deckMat,0,-.789,11);deck.rotation.x=-Math.PI/2;
  // Protective side lips and short backstop keep successful deliveries on deck.
  for(const x of[-5.55,5.55]) {box(fixed,.13,.6,5.0,M.teal,x,-.64,11,.04);addSolid(x,-.64,11,.13,.6,5);}
  box(fixed,11.2,.54,.12,M.teal,0,-.65,13.55,.035);addSolid(0,-.65,13.55,11.2,.54,.12);
  for(const x of[-4.8,4.8])for(const z of[9.05,12.9]) {
    cylinder(fixed,.42,.55,.45,M.ink,x,-1.65,z,20);
    cylinder(fixed,.33,.33,.06,new THREE.MeshStandardMaterial({color:0xb4ffe7,emissive:0x6bdbb4,emissiveIntensity:.9}),x,-1.91,z,16);
  }
  box(fixed,2.9,1.85,3.0,M.cream,7.13,-.35,11.8,.25);
  box(fixed,2.72,.35,2.9,M.terra,7.13,-.93,11.8,.08);
  box(fixed,2.75,.76,.035,M.darkTeal,7.13,.04,13.312,.09);
  box(fixed,.035,.75,1.6,M.darkTeal,8.595,.04,11.78,.07);
  box(fixed,.12,.3,.65,M.cream,8.69,-.29,11.65,.025);
  box(fixed,2.5,.12,.22,M.metal,7.13,-1.15,13.45,.035);
  for(const x of[6.18,8.08])box(fixed,.33,.23,.08,mat(0xffdf9b),x,-.67,13.35,.05);
  cylinder(fixed,.13,.13,.55,M.ink,6.15,.82,10.75,12);
  cylinder(fixed,.18,.18,.17,mat(0xffae55),6.15,1.15,10.75,12);
  print(fixed,'PANIC\nMOVING CO.',2.1,.67,7.13,-.35,13.37,{bg:'#f5ecd7',fg:'#255b58',font:62});
  const truckLabel=print(fixed,'28',.5,.45,8.635,-.48,12.55,{bg:'#f5ecd7',fg:'#255b58',font:136,rotate:Math.PI/2});
  // The glowing strip is a visual landing target even when props cover the lettering.
  const edgeGlow=new THREE.MeshStandardMaterial({color:0xa9f8bd,emissive:0x65df99,emissiveIntensity:.65});
  box(fixed,10.5,.04,.045,edgeGlow,0,-.74,8.59);
  box(fixed,10.5,.04,.045,edgeGlow,0,-.74,13.4);

  const baked=batch(fixed);scene.add(baked);
  // Building windows: a single instanced draw call.
  const winGeo=new THREE.BoxGeometry(1.5,2.1,.03);const winMat=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.37,metalness:.22});
  const windows=new THREE.InstancedMesh(winGeo,winMat,70);const dummy=new THREE.Object3D();let wi=0;
  for(let y=-4;y>-27;y-=3.7)for(let x=-10;x<11;x+=2.3){
    dummy.position.set(x,y,7.72);dummy.rotation.set(0,0,0);dummy.updateMatrix();windows.setMatrixAt(wi,dummy.matrix);windows.setColorAt(wi,new THREE.Color(rnd()>.65?0xf6d09b:0x67908f));wi++;
  }
  windows.count=wi;windows.castShadow=false;scene.add(windows);
  const sideWindows=new THREE.InstancedMesh(winGeo,winMat,49);wi=0;
  for(let y=-4;y>-27;y-=3.7)for(let z=-6;z<7;z+=2.15){
    dummy.position.set(11.87,y,z);dummy.rotation.set(0,Math.PI/2,0);dummy.updateMatrix();sideWindows.setMatrixAt(wi,dummy.matrix);sideWindows.setColorAt(wi,new THREE.Color(rnd()>.72?0xf6d09b:0x729e9b));wi++;
  }
  sideWindows.count=wi;scene.add(sideWindows);

  // A compact, original cityscape with warm haze and a street grid far below.
  const city=new THREE.Group();
  box(city,220,.2,220,mat(0xb7a393),0,-28.6,0);
  for(const x of[-38,31])box(city,9,.02,200,mat(0x8e9390),x,-28.48,0);
  for(const z of[-31,31])box(city,200,.022,8,mat(0x8e9390),0,-28.47,z);
  for(const x of[-38,31])for(let z=-95;z<100;z+=5)box(city,.1,.025,2.2,M.cream,x,-28.45,z);
  const buildings=[];
  for(let ix=-4;ix<=4;ix++)for(let iz=-4;iz<=4;iz++) {
    if(ix===0&&iz===0)continue;
    const x=ix*22+(rnd()-.5)*7,z=iz*22+(rnd()-.5)*7;
    if(Math.abs(x)<21&&Math.abs(z)<21)continue;
    const w=9+rnd()*7,d=8+rnd()*8,h=7+rnd()*26;
    buildings.push({x,z,w,d,h});
  }
  const buildingMesh=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),mat(0xffffff),buildings.length);
  const roofMesh=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),mat(0xdec4a9),buildings.length);
  const distantWindows=[];
  buildings.forEach((b,i)=>{
    dummy.position.set(b.x,-28.4+b.h/2,b.z);dummy.rotation.set(0,0,0);dummy.scale.set(b.w,b.h,b.d);dummy.updateMatrix();buildingMesh.setMatrixAt(i,dummy.matrix);
    const colors=[0xc4937c,0xc6b8a0,0xbfa490,0xd3baa1,0x8fa29b,0x91a2a0];buildingMesh.setColorAt(i,new THREE.Color(colors[i%colors.length]));
    dummy.position.y=-28.4+b.h+.15;dummy.scale.set(b.w+.25,.3,b.d+.25);dummy.updateMatrix();roofMesh.setMatrixAt(i,dummy.matrix);
    for(let y=3;y<b.h-1;y+=3.3)for(let x=-b.w/2+1.3;x<b.w/2-1;x+=2.3) {
      distantWindows.push([b.x+x,-28.4+y,b.z+b.d/2+.015]);
    }
  });
  buildingMesh.castShadow=false;buildingMesh.receiveShadow=false;roofMesh.castShadow=false;scene.add(buildingMesh,roofMesh);
  const dw=new THREE.InstancedMesh(new THREE.PlaneGeometry(.85,1.3),mat(0x607d7c,.5),distantWindows.length);
  dummy.scale.set(1,1,1);dummy.rotation.set(0,0,0);
  distantWindows.forEach((p,i)=>{dummy.position.set(...p);dummy.updateMatrix();dw.setMatrixAt(i,dummy.matrix);dw.setColorAt(i,new THREE.Color(i%7===0?0xf2cf92:0x8da4a0));});scene.add(dw);
  scene.add(batch(city));
  const birds=[];
  const birdGeo=new THREE.BufferGeometry();birdGeo.setAttribute('position',new THREE.Float32BufferAttribute([-.55,0,0,0,-.11,.07,0,0,-.06, .55,0,0,0,0,-.06,0,-.11,.07],3));birdGeo.computeVertexNormals();
  for(let i=0;i<7;i++) {const b=mesh(scene,birdGeo,new THREE.MeshBasicMaterial({color:0x735f56,side:THREE.DoubleSide}));b.castShadow=false;birds.push(b);}

  let floor=28;
  return {
    solids,glass,deliveryZone:{x:0,z:11,width:11,depth:5,top:-.8},
    update(dt,time,level=1) {
      birds.forEach((bird,i)=>{
        const a=time*.07+i*.55;const radius=31+i*1.8;
        bird.position.set(Math.cos(a)*radius,3+Math.sin(time*.3+i)*1.2+i*.3,-14+Math.sin(a)*radius*.55);
        bird.rotation.set(.08*Math.sin(time*5+i),-a+Math.PI/2,.15*Math.sin(time*.8+i));
        bird.scale.y=.6+Math.sin(time*5+i)*.35;
      });
    },
    setLevel(level) {
      floor=[28,32,37,42,48,56][Math.max(0,Math.min(5,Math.floor(level)))]??28;
      const texture=doorLabel.material.map, canvas=texture.image, c=canvas.getContext('2d');
      c.fillStyle='#d4c1a0';c.fillRect(0,0,canvas.width,canvas.height);
      c.fillStyle='#335c57';c.font='900 112px sans-serif';c.textAlign='center';c.textBaseline='middle';
      c.fillText(String(floor),canvas.width/2,canvas.height/2);texture.needsUpdate=true;
      const truckTexture=truckLabel.material.map, truckCanvas=truckTexture.image, tc=truckCanvas.getContext('2d');
      tc.fillStyle='#f5ecd7';tc.fillRect(0,0,truckCanvas.width,truckCanvas.height);
      tc.fillStyle='#255b58';tc.font='900 136px sans-serif';tc.textAlign='center';tc.textBaseline='middle';
      tc.fillText(String(floor),truckCanvas.width/2,truckCanvas.height/2);truckTexture.needsUpdate=true;
    },
  };
}
