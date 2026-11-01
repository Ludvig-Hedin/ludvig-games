import * as THREE from 'three';
import { ARENA, OBSTACLES, GATES, CONVEYORS, RAMPS } from './config.js';

/** A wholly procedural terminal: no remote models, textures, or asset requests. */
export function createWorld(scene, renderer, { quality = 'high' } = {}) {
  const root = new THREE.Group();
  root.name = 'Terminal — North concourse';
  scene.add(root);
  const owned = new Set(), textures = new Set();
  const batches = new Map();
  const animated = [];
  const gates = [];
  const allMaterials = [];
  const tmp = new THREE.Object3D();
  const geometry = {
    box: new THREE.BoxGeometry(1, 1, 1),
    cylinder: new THREE.CylinderGeometry(1, 1, 1, 16),
    pot: new THREE.CylinderGeometry(1, .78, 1, 16),
    cone: new THREE.ConeGeometry(1, 1, 16),
    sphere: new THREE.SphereGeometry(1, 16, 10),
    leaf: new THREE.SphereGeometry(1, 7, 5),
  };
  Object.values(geometry).forEach(g => owned.add(g));
  const mat = (color, roughness = .65, metalness = 0, options = {}) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness, metalness, ...options });
    allMaterials.push(m); return m;
  };
  const m = {
    cream: mat('#e7ddc9', .74), warmWhite: mat('#fff2da', .5),
    white: mat('#f3f0e7', .35), stone: mat('#c7bca5', .8),
    teal: mat('#376962', .58), darkTeal: mat('#284b49', .5),
    coral: mat('#e77955', .52), yellow: mat('#e8bc69', .58),
    navy: mat('#223a3d', .4), silver: mat('#99aaa7', .24, .76),
    black: mat('#283232', .65), bronze: mat('#b3a38a', .28, .6),
    wood: mat('#ae7452', .83), soil: mat('#4c4940', .95),
    foliage: mat('#54765b', .8), leavesLight: mat('#8ba27a', .82),
    bark: mat('#887359', .85), road: mat('#7e9293', .95),
    marking: mat('#ddd0b2', .78), glass: mat('#b7d9db', .06, .25, { transparent: true, opacity: .12, depthWrite: false, side: THREE.DoubleSide }),
    lamp: mat('#fff1c3', .25, 0, { emissive: '#ffe7aa', emissiveIntensity: 1.25 }),
    mint: mat('#a0e4ca', .5, .1, { emissive: '#7ddbb0', emissiveIntensity: .22 }),
    skin: mat('#d9ac86', .85), shirt: mat('#d19a69', .85),
  };
  function instance(type, material, x, y, z, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) {
    const key = `${type}:${material.uuid}`;
    if (!batches.has(key)) batches.set(key, { type, material, matrices: [] });
    tmp.position.set(x, y, z); tmp.rotation.set(rx, ry, rz); tmp.scale.set(sx, sy, sz); tmp.updateMatrix();
    batches.get(key).matrices.push(tmp.matrix.clone());
  }
  const box = (material,x,y,z,w,h,d,ry=0,rx=0,rz=0) => instance('box',material,x,y,z,w,h,d,rx,ry,rz);
  const cyl = (material,x,y,z,r,h,rx=0,ry=0,rz=0) => instance('cylinder',material,x,y,z,r,h,r,rx,ry,rz);
  const sphere = (material,x,y,z,sx,sy=sx,sz=sx) => instance('sphere',material,x,y,z,sx,sy,sz);
  function mesh(geo, material, x=0,y=0,z=0, rx=0,ry=0,rz=0) {
    owned.add(geo); const o = new THREE.Mesh(geo, material); o.position.set(x,y,z);o.rotation.set(rx,ry,rz);
    root.add(o);return o;
  }
  function canvasTexture(w, h, draw) {
    const c = document.createElement('canvas'); c.width=w;c.height=h;
    draw(c.getContext('2d'),w,h);
    const t = new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
    textures.add(t);return t;
  }
  function sign(text, sub, width=7, height=2, bg='#244143', fg='#f5ead4') {
    const t = canvasTexture(1024, Math.round(1024*height/width), (c,w,h)=>{
      c.fillStyle=bg;c.fillRect(0,0,w,h);c.fillStyle=fg;
      c.textBaseline='middle';c.font=`600 ${h*(sub?.44:.56)}px Arial, sans-serif`;
      c.fillText(text,w*.07,h*(sub?.39:.51));
      if(sub){c.font=`500 ${h*.14}px Arial, sans-serif`;c.fillStyle='#b9d7c9';c.fillText(sub,w*.075,h*.79);}
      c.fillStyle='#aadcc5';c.fillRect(w*.9,h*.25,w*.035,h*.5);
    });
    const material = new THREE.MeshStandardMaterial({map:t,roughness:.65,metalness:.05,emissive:'#ffffff',emissiveMap:t,emissiveIntensity:.12,side:THREE.DoubleSide});allMaterials.push(material);
    return new THREE.Mesh(new THREE.PlaneGeometry(width,height),material);
  }
  const floorTexture = canvasTexture(1024,1024,(c,w,h)=>{
    c.fillStyle='#dcd6c7';c.fillRect(0,0,w,h);
    let seed=82143;const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
    for(let i=0;i<18500;i++){
      const v=rand();c.fillStyle=v<.35?'rgba(110,106,93,.11)':v<.65?'rgba(255,255,248,.42)':'rgba(188,157,126,.15)';
      const x=rand()*w,y=rand()*h,s=rand()*2.1+.45;c.beginPath();c.ellipse(x,y,s,s*.55,rand()*6.28,0,Math.PI*2);c.fill();
    }
    c.lineWidth=1.4;c.strokeStyle='rgba(99,114,103,.13)';
    for(let p=0;p<=1024;p+=256){c.beginPath();c.moveTo(p,0);c.lineTo(p,1024);c.stroke();c.beginPath();c.moveTo(0,p);c.lineTo(1024,p);c.stroke();}
  });
  floorTexture.wrapS=floorTexture.wrapT=THREE.RepeatWrapping;floorTexture.repeat.set(6,8);
  const floorMat=mat('#ffffff',.28,.12,{map:floorTexture});
  const floor=mesh(new THREE.PlaneGeometry(88,120),floorMat,0,-.025,0,-Math.PI/2);floor.receiveShadow=true;
  box(m.stone,0,-.28,0,90,.5,122);
  const apron=mesh(new THREE.PlaneGeometry(1200,1200),m.road,0,-.35,-120,-Math.PI/2);apron.receiveShadow=true;
  // Inlaid taxi lines and wayfinding, kept in the open driving lanes.
  const lineMat=mat('#cd8e6c',.52,.15);
  [-27.3,27.3].forEach(x=>box(lineMat,x,.008,0,.12,.018,103));
  [-38,38].forEach(z=>box(lineMat,0,.008,z,76,.018,.12));
  for(let z=-54;z<=54;z+=5.2){if(Math.abs(z)>8)box(m.marking,0,.012,z,.16,.02,1.2);}
  for(let x=-36;x<=36;x+=4.4){if(Math.abs(x)>7)box(m.marking,x,.012,0,1.05,.02,.15);}
  const directionTexture = canvasTexture(256,256,(c,w,h)=>{
    c.clearRect(0,0,w,h);c.fillStyle='#e7d8b6';c.beginPath();c.moveTo(128,24);c.lineTo(224,128);c.lineTo(167,128);c.lineTo(167,228);c.lineTo(89,228);c.lineTo(89,128);c.lineTo(32,128);c.closePath();c.fill();
  });
  const arrowMat=mat('#ffffff',.8,0,{map:directionTexture,transparent:true,depthWrite:false});
  for(const x of [-27.3,27.3])for(const z of [-32,0,32]){const a=mesh(new THREE.PlaneGeometry(1.7,2.1),arrowMat,x,.022,z,-Math.PI/2);if(x>0)a.rotation.z=Math.PI;}
  // Warm pools of reflected light from the high windows.
  const glowTexture=canvasTexture(128,128,(c,w,h)=>{const g=c.createRadialGradient(w/2,h/2,0,w/2,h/2,w/2);g.addColorStop(0,'rgba(255,233,183,.26)');g.addColorStop(1,'rgba(255,233,183,0)');c.fillStyle=g;c.fillRect(0,0,w,h);});
  const glowMat=new THREE.MeshBasicMaterial({map:glowTexture,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending});allMaterials.push(glowMat);
  for(let x=-32;x<=32;x+=16)mesh(new THREE.PlaneGeometry(14,28),glowMat,x,.04,-42,-Math.PI/2,0,.25);
  // Curtain walls: tall rear wall, open south edge for the tracking camera.
  for(let x=-40;x<=40;x+=10){
    box(m.silver,x,6.5,-60,.22,13,.28);box(m.darkTeal,x,1,-60,.35,2,.5);
    if(x<40){mesh(new THREE.PlaneGeometry(9.7,10.5),m.glass,x+5,7.1,-60);
      box(m.silver,x+5,2,-60,10,.16,.18);box(m.silver,x+5,7.3,-60,10,.12,.18);}
  }
  box(m.silver,0,12.8,-60,88,.45,.65);box(m.cream,0,.55,-60,88,1.1,.65);
  for(const side of [-1,1]){
    box(m.cream,side*44,.5,0,1,1,120);
    for(let z=-50;z<=50;z+=12.5){
      box(m.silver,side*44,4.5,z,.25,9,.25);
      if(z<50){mesh(new THREE.PlaneGeometry(12.3,7.6),m.glass,side*44,4.8,z+6.25,0,Math.PI/2);box(m.silver,side*44,1.4,z+6.25,.2,.16,12.5);}
    }
    box(m.silver,side*44,8.8,0,.5,.4,120);
  }
  box(m.cream,0,.4,60,88,.8,.6);
  // Perimeter light troughs and low, collision-aligned tactile curbs.
  box(m.lamp,0,.18,-58.65,86,.06,.12);box(m.lamp,0,.18,58.65,86,.06,.12);
  for(const x of [-42.65,42.65])box(m.lamp,x,.18,0,.12,.06,118);
  // A few roof ribs imply the scale of the building without concealing play.
  for(const z of [-48,48]){
    box(m.cream,-43.4,10,z,.7,20,.7);box(m.cream,43.4,10,z,.7,20,.7);
    box(m.cream,0,20,z,88,.7,.8);box(m.lamp,0,19.55,z,80,.06,.12);
  }
  function plant(x,z,scale=1,low=false){
    instance('pot',m.cream,x,.55*scale,z,.7*scale,1.1*scale,.7*scale);
    cyl(m.soil,x,1.105*scale,z,.62*scale,.04*scale);
    cyl(m.bark,x,(low?1.6:2.4)*scale,z,.1*scale,(low?1:3)*scale);
    for(let i=0;i<(low?7:10);i++){
      const a=i*2.399;const h=(low?2:3.65)*scale+(i%3)*.13*scale;
      instance('leaf',i%2?m.foliage:m.leavesLight,x+Math.sin(a)*.65*scale,h,z+Math.cos(a)*.65*scale,.5*scale,.22*scale,1.55*scale,.28, a, .2);
    }
  }
  function seatedTraveler(x,z,yaw,kind=0){
    const ox=Math.sin(yaw),oz=Math.cos(yaw);
    box(kind?m.coral:m.shirt,x,1.45,z,.64,.8,.48,yaw,.08);
    sphere(m.skin,x,2.07,z,.27,.32,.27);
    sphere(m.black,x,2.23,z,.28,.13,.28);
    for(const s of [-1,1]){
      box(m.navy,x+s*.18+ox*.3,.88,z+oz*.3,.22,.5,.45,yaw);
      box(m.black,x+s*.18+ox*.54,.51,z+oz*.54,.25,.2,.4,yaw);
    }
  }
  for(const o of OBSTACLES){
    if(o.type==='seating'){
      box(m.darkTeal,o.x,.10,o.z,o.w,.2,o.d);
      box(m.bronze,o.x,.205,o.z-o.d/2+.1,o.w-.2,.03,.08);
      box(m.bronze,o.x,.205,o.z+o.d/2-.1,o.w-.2,.03,.08);
      for(const side of [-1,1]){
        box(m.silver,o.x,.55,o.z+side*2.3,10,.13,.16);
        for(const dx of [-3.9,-1.3,1.3,3.9]){
          const xx=o.x+dx,zz=o.z+side*2.4;
          box(m.teal,xx,.85,zz,2.08,.27,1.55);box(m.teal,xx,1.55,zz+side*.69,2.08,1.25,.22,0,side*.12);
          for(const a of [-.88,.88]){box(m.silver,xx+a,1.08,zz,.07,.5,.07);box(m.silver,xx+a,1.32,zz, .10,.08,1.25);}
        }
        for(const dx of [-3.4,3.4])box(m.silver,o.x+dx,.45,o.z+side*2.3,.18,.75,.45);
      }
      box(m.wood,o.x,1.05,o.z,6.4,.17,1.1);box(m.darkTeal,o.x,.6,o.z,5.6,.8,.45);
      plant(o.x-5,o.z,.65,true);plant(o.x+5,o.z,.65,true);
      const signObj=sign('CHARGE + CHILL','FREE WIFI · PLEASE DO NOT RACE',4,.75);signObj.position.set(o.x,2.45,o.z);root.add(signObj);owned.add(signObj.geometry);
      if(o.x<0){seatedTraveler(o.x-1.3,o.z+2.2,Math.PI);seatedTraveler(o.x+3.9,o.z-2.2,0,1);}
      else seatedTraveler(o.x+1.3,o.z+2.2,Math.PI,1);
    }else if(o.type==='column'){
      cyl(m.cream,o.x,6.2,o.z,o.r,12.4);cyl(m.bronze,o.x,.25,o.z,o.r+.015,.5);cyl(m.lamp,o.x,3.3,o.z,o.r+.02,.08);
    }else if(o.type==='planter'){
      cyl(m.cream,0,.45,0,3.9,.9);cyl(m.bronze,0,.92,0,3.9,.10);cyl(m.soil,0,1,0,3.5,.1);
      plant(0,0,1.7);plant(-1.7,.7,.8);plant(1.5,-.6,.85);
      // Small sculpture: an abstract departure arrow in warm brass.
      cyl(m.bronze,0,3.4,0,.13,5.3);box(m.bronze,0,5.8,0,4.4,.2,.6,-.4);box(m.bronze,.7,5.8,.7,.5,.2,3.4,-.4);
    }else if(o.type==='cafe'){
      box(m.wood,o.x,.12,o.z,o.w,.24,o.d);
      box(m.teal,o.x-2,2.1,o.z,1.1,4.2,o.d);
      box(m.cream,o.x+1.4,1.25,o.z,2.4,2.5,17.5);box(m.wood,o.x+1.4,2.57,o.z,2.8,.16,18);
      for(let z=-7;z<=7;z+=.7)box(m.wood,o.x+2.62,1.2,z,.035,2.2,.025);
      const label=sign('GATE COFFEE','GOOD COFFEE. QUESTIONABLE TIMING.',13,2,'#294b45','#eee0c4');label.position.set(o.x-1.36,3.12,0);label.rotation.y=Math.PI/2;root.add(label);owned.add(label.geometry);
      for(const z of [-6,0,6]){
        box(m.silver,o.x+1,2.94,z,1.2,.65,1.4);box(m.black,o.x+1.65,2.92,z,.12,.38,1.2);
        cyl(m.white,o.x+1.8,2.83,z+1.5,.22,.37);cyl(m.wood,o.x+1.8,3.03,z+1.5,.19,.02);
        instance('cone',m.coral,o.x+.1,4.35,z,.68,.75,.68);cyl(m.lamp,o.x+.1,3.98,z,.53,.06);
        box(m.black,o.x+.1,5.15,z,.03,1,.03);
      }
      plant(o.x+1,9.1,.85,true);plant(o.x+1,-9.1,.85,true);
    }else if(o.type==='checkin'){
      box(m.cream,o.x,.15,0,o.w,.3,o.d);
      for(const z of [-6.5,0,6.5]){
        box(m.coral,o.x-.8,1.05,z,3.7,2.1,4.2);box(m.stone,o.x-.8,2.15,z,4.05,.16,4.6);
        box(m.navy,o.x-1.2,2.65,z,.15,.9,1.25);box(m.silver,o.x-.7,2.35,z,.25,.5,.3);
        box(m.black,o.x+1.65,.7,z,1.5,.4,4.5);
        const desk=sign(`0${z<0?1:z>0?3:2}`,'BAG DROP',2.3,1.2);desk.position.set(o.x-2.8,3.3,z);desk.rotation.y=-Math.PI/2;root.add(desk);owned.add(desk.geometry);
      }
      const label=sign('BAGGAGE SERVICES','HANDLE WITH ABSOLUTELY NO CARE',15,1.8);label.position.set(o.x+1.7,5.1,0);label.rotation.y=-Math.PI/2;root.add(label);owned.add(label.geometry);
    }
  }
  // Moving walkways — flush floors mean no hidden obstacles.
  for(const cv of CONVEYORS){
    box(m.black,cv.x,.015,cv.z,cv.w,.035,cv.d);
    for(const side of [-1,1]){box(m.bronze,cv.x+side*(cv.w/2-.08),.05,0,.12,.08,cv.d);}
    const stripes=new THREE.InstancedMesh(geometry.box,m.silver,32);stripes.castShadow=false;root.add(stripes);
    animated.push({type:'conveyor',mesh:stripes,config:cv});
    for(const z of [-cv.d/2-.7,cv.d/2+.7]){box(m.yellow,cv.x,.033,z,cv.w,.03,.22);}
    for(const z of [-8,0,8]){const a=mesh(new THREE.PlaneGeometry(1.2,1.7),arrowMat,cv.x,.055,z,-Math.PI/2);if(cv.direction>0)a.rotation.z=Math.PI;}
  }
  // Smooth takeoff ramps, visual wedge matching the launch volume.
  for(const r of RAMPS){
    const top=1.05, half=r.d/2, z0=r.z-r.direction*half, z1=r.z+r.direction*half;
    const positions=new Float32Array([
      -r.w/2,0,z0, r.w/2,0,z0, r.w/2,top,z1,
      -r.w/2,0,z0, r.w/2,top,z1, -r.w/2,top,z1,
      -r.w/2,0,z0, -r.w/2,top,z1, -r.w/2,0,z1,
      r.w/2,0,z0, r.w/2,0,z1, r.w/2,top,z1,
      -r.w/2,0,z1, -r.w/2,top,z1, r.w/2,top,z1,
      -r.w/2,0,z1, r.w/2,top,z1, r.w/2,0,z1,
    ]);
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(positions,3));geo.computeVertexNormals();
    const rampMat=mat('#db9d63',.7,0,{side:THREE.DoubleSide});const rm=mesh(geo,rampMat,r.x,.02,0);rm.castShadow=true;rm.receiveShadow=true;
    for(let z=-2.4;z<=2.4;z+=1.2){const yy=((z*r.direction+half)/r.d)*top+.05;const stripe=mesh(new THREE.PlaneGeometry(r.w-.4,.15),m.cream,r.x,yy,r.z+z,-Math.PI/2-r.direction*Math.atan(top/r.d));}
    const a=mesh(new THREE.PlaneGeometry(2.3,2.4),arrowMat,r.x,.63,r.z,-Math.PI/2-r.direction*Math.atan(top/r.d));if(r.direction>0)a.rotation.z=Math.PI;
  }
  // Objective graphics are isolated so setActiveGates never changes shared materials.
  GATES.forEach((g,i)=>{
    const ringMat=new THREE.MeshStandardMaterial({color:'#8ba99a',emissive:'#9effc6',emissiveIntensity:0,roughness:.6,transparent:true,opacity:.42,side:THREE.DoubleSide});allMaterials.push(ringMat);
    const ring=mesh(new THREE.RingGeometry(5.55,5.9,72),ringMat,g.x,.045,g.z,-Math.PI/2);
    const discMat=new THREE.MeshBasicMaterial({color:'#93e6c1',transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide});allMaterials.push(discMat);
    const disc=mesh(new THREE.CircleGeometry(5.5,64),discMat,g.x,.041,g.z,-Math.PI/2);
    const haloMat=new THREE.MeshBasicMaterial({color:'#adf7d2',transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide});allMaterials.push(haloMat);
    const halo=mesh(new THREE.RingGeometry(5.94,6.03,72),haloMat,g.x,.048,g.z,-Math.PI/2);
    // An elevated sign is positioned at the outside edge, leaving the circle clear.
    const face=g.z<0?1:-1, signZ=g.z-face*6.5;
    const plane=sign(g.name,`${g.destination}   /   BAG DROP`,7.5,2.7);plane.position.set(g.x,4.3,signZ+face*.115);plane.rotation.y=face<0?Math.PI:0;root.add(plane);owned.add(plane.geometry);
    box(m.darkTeal,g.x,4.3,signZ,7.7,2.9,.2);
    box(m.bronze,g.x-3.6,2.1,signZ,.09,4.2,.09);box(m.bronze,g.x+3.6,2.1,signZ,.09,4.2,.09);
    const label=canvasTexture(512,256,(c,w,h)=>{c.fillStyle='#526d62';c.textAlign='center';c.textBaseline='middle';c.font='600 128px Arial';c.fillText(g.name,w/2,h/2);});
    const lm=mat('#ffffff',.85,0,{map:label,transparent:true,depthWrite:false});const lmsh=mesh(new THREE.PlaneGeometry(5.5,2.75),lm,g.x,.052,g.z,-Math.PI/2);if(face<0)lmsh.rotation.z=Math.PI;
    const beaconMat=mat('#b7e4cc',.3,.1,{emissive:'#9effcf',emissiveIntensity:.2});
    const beacon=mesh(new THREE.OctahedronGeometry(.55),beaconMat,g.x,4.4,g.z);beacon.visible=false;
    gates.push({ring,disc,halo,beacon,active:false,phase:i});
    // Boarding carpet and the glass jetbridge beyond the concourse.
    box(m.teal,g.x,.025,signZ-face*3.5,7.3,.035,5.8);
    box(m.darkTeal,g.x,2.1,signZ-face*5.7,7.8,4.2,.3);
  });
  // Ticket machines and planters along the perimeter, outside the driving area.
  for(const z of [-47,47])for(const side of [-1,1]){
    plant(side*41.6,z,.8);
    box(m.coral,side*44.6,1.3,z-8,1.2,2.6,1.3);box(m.navy,side*44.6,1.7,z-7.32,.8,.8,.03);
  }
  // External world: runway, jet bridges, parked aircraft and atmospheric hills.
  box(m.navy,0,-.31,-126,500,.025,24);
  for(let x=-230;x<240;x+=12)box(m.marking,x,-.285,-126,7,.02,.3);
  for(const x of [-60,-20,20,60]){
    box(m.marking,x,-.28,-85,.15,.025,35);box(m.marking,x,-.28,-103,18,.025,.15);
  }
  for(const g of GATES.filter(g=>g.z<0)){
    box(m.cream,g.x,3,-67,5,3.2,15);box(m.darkTeal,g.x,3.2,-67,5.06,1.6,14);
    for(let z=-72;z<=-62;z+=2)box(m.cream,g.x,3.2,z,5.2,2,.12);
    box(m.cream,g.x,4.68,-67,5.25,.25,15);box(m.silver,g.x,1,-72,.7,2,.7);
  }
  function airplane(x,z,scale=1,yaw=0,dynamic=false){
    const group=new THREE.Group();group.position.set(x,0,z);group.rotation.y=yaw;group.scale.setScalar(scale);root.add(group);
    const add=(geo,material,px,py,pz,rx=0,ry=0,rz=0)=>{owned.add(geo);const ob=new THREE.Mesh(geo,material);ob.position.set(px,py,pz);ob.rotation.set(rx,ry,rz);ob.castShadow=true;group.add(ob);return ob;};
    add(new THREE.CylinderGeometry(1.65,1.65,18,20),m.white,0,3.8,0,Math.PI/2);
    add(new THREE.SphereGeometry(1.65,20,14),m.white,0,3.8,-9).scale.set(1,1,2.1);
    add(new THREE.SphereGeometry(1.65,16,12),m.white,0,3.8,9).scale.set(1,1,1.9);
    add(new THREE.BoxGeometry(1.25,.48,.13),m.navy,0,4.15,-12.0,.25);
    const wingShape=new THREE.Shape();wingShape.moveTo(0,-3.6);wingShape.lineTo(12.8,3.8);wingShape.lineTo(13.3,5.7);wingShape.lineTo(1.2,2.3);wingShape.closePath();
    const wg=new THREE.ExtrudeGeometry(wingShape,{depth:.18,bevelEnabled:false});
    const wr=add(wg,m.white,0,2.75,-2,Math.PI/2);const wl=wr.clone();wl.scale.x=-1;group.add(wl);
    for(const side of [-1,1]){
      add(new THREE.CylinderGeometry(.75,.86,3.5,16),m.white,side*5.1,2.05,-.3,Math.PI/2);
      add(new THREE.CylinderGeometry(.54,.54,.07,16),m.navy,side*5.1,2.05,-2.08,Math.PI/2);
      add(new THREE.BoxGeometry(5.7,.18,1.4),m.coral,side*2.8,4.2,8.5,0,side*-.2);
      for(let zz=-7.8;zz<=7.8;zz+=1.25)add(new THREE.SphereGeometry(.16,5,4),m.navy,side*1.6,4.18,zz).scale.set(.18,1,1.15);
      add(new THREE.CylinderGeometry(.42,.42,.75,10),m.black,side*.95,.5,3.1,0,0,Math.PI/2);
    }
    const tailShape=new THREE.Shape();tailShape.moveTo(-1.3,0);tailShape.lineTo(3.6,0);tailShape.lineTo(4.2,5.4);tailShape.lineTo(2.8,5.5);tailShape.closePath();
    add(new THREE.ExtrudeGeometry(tailShape,{depth:.25,bevelEnabled:false}),m.coral,.12,4.45,6.4,0,-Math.PI/2);
    add(new THREE.CylinderGeometry(.35,.35,.6,10),m.black,0,.45,-7.5,0,0,Math.PI/2);
    if(dynamic)animated.push({type:'plane',mesh:group,baseX:x});
    return group;
  }
  airplane(-28,-90,1.18,-.18);airplane(36,-91,1.12,.22);airplane(120,-145,.68,Math.PI/2,true);
  // Distant terminal annex and a control tower silhouette.
  box(m.darkTeal,-115,5,-114,62,10,25);box(m.glass,-115,7,-100.9,60,4.5,.2);
  for(let x=-145;x<=-85;x+=6)box(m.cream,x,5,-100.5,.25,10,.3);
  cyl(m.stone,80,10,-113,2.1,20);cyl(m.darkTeal,80,20.2,-113,5.2,3);cyl(m.cream,80,22,-113,5.8,.6);
  for(let i=0;i<22;i++){
    const x=-250+i*25,h=14+Math.sin(i*2.8)*8;
    instance('cone',i%2?m.darkTeal:m.teal,x,h/2-1,-245-(i%4)*17,35,h,22,0,i*.7,0);
  }
  // Instance static primitive geometry once per geometry/material combination.
  for(const {type,material,matrices} of batches.values()){
    const inst=new THREE.InstancedMesh(geometry[type],material,matrices.length);
    matrices.forEach((matrix,i)=>inst.setMatrixAt(i,matrix));inst.instanceMatrix.needsUpdate=true;
    inst.castShadow=material!==m.glass&&material!==m.lamp;inst.receiveShadow=true;inst.frustumCulled=true;inst.computeBoundingSphere();
    root.add(inst);
  }
  // A softly graded sky and an inexpensive environment map for all metalwork.
  const skyMap=canvasTexture(512,256,(c,w,h)=>{
    const gr=c.createLinearGradient(0,0,0,h);gr.addColorStop(0,'#7b9ba6');gr.addColorStop(.35,'#c5ceca');gr.addColorStop(.53,'#efd2ac');gr.addColorStop(.66,'#e6b88e');gr.addColorStop(1,'#8b9d99');c.fillStyle=gr;c.fillRect(0,0,w,h);
    const sun=c.createRadialGradient(w*.69,h*.43,0,w*.69,h*.43,38);sun.addColorStop(0,'rgba(255,249,211,1)');sun.addColorStop(.25,'rgba(255,235,183,.8)');sun.addColorStop(1,'rgba(255,232,185,0)');c.fillStyle=sun;c.fillRect(0,0,w,h);
  });
  skyMap.mapping=THREE.EquirectangularReflectionMapping;scene.background=skyMap;
  let envTarget=null;
  try{const pmrem=new THREE.PMREMGenerator(renderer);envTarget=pmrem.fromEquirectangular(skyMap);scene.environment=envTarget.texture;scene.environmentIntensity=.6;pmrem.dispose();}catch{/* Ambient and direct light remain sufficient on constrained devices. */}
  scene.fog=new THREE.Fog('#e3d3b7',100,330);
  const hemi=new THREE.HemisphereLight('#d4ecf4','#b99774',2.15);root.add(hemi);
  const sun=new THREE.DirectionalLight('#fff0c8',3.05);sun.position.set(-58,83,-62);sun.target.position.set(0,0,0);sun.castShadow=quality!=='low';
  sun.shadow.mapSize.set(quality==='low'?1024:2048,quality==='low'?1024:2048);
  Object.assign(sun.shadow.camera,{left:-80,right:80,top:80,bottom:-80,near:1,far:230});sun.shadow.bias=-.00015;sun.shadow.normalBias=.06;sun.shadow.radius=3;
  root.add(sun,sun.target);
  const fill=new THREE.DirectionalLight('#b9dce8',.75);fill.position.set(40,35,40);root.add(fill);
  let time=0;
  const matrix=new THREE.Matrix4(), pos=new THREE.Vector3(), quat=new THREE.Quaternion(), scl=new THREE.Vector3();
  function update(dt,elapsed){
    time=Number.isFinite(elapsed)?elapsed:time+dt;
    for(const a of animated){
      if(a.type==='conveyor'){
        const {config:c,mesh:st}=a;
        for(let i=0;i<32;i++){
          const zz=((i/32*c.d+time*c.direction*2.8)%c.d+c.d)%c.d-c.d/2;
          pos.set(c.x,.038,zz);scl.set(c.w-.25,.018,.07);matrix.compose(pos,quat,scl);st.setMatrixAt(i,matrix);
        }st.instanceMatrix.needsUpdate=true;
      }else if(a.type==='plane'){a.mesh.position.x=((a.baseX-time*1.6+220)%440+440)%440-220;}
    }
    for(const g of gates){
      const pulse=.5+.5*Math.sin(time*2.4+g.phase);
      g.ring.material.emissiveIntensity=g.active?.45+pulse*.25:0;
      g.ring.material.opacity=g.active?.95:.32;
      g.disc.material.opacity=g.active?.08+pulse*.035:0;
      g.halo.material.opacity=g.active?.35+pulse*.4:0;
      g.halo.scale.setScalar(g.active?1+pulse*.045:1);
      g.beacon.visible=g.active;g.beacon.position.y=4.7+Math.sin(time*2.6)*.3;g.beacon.rotation.y=time;
    }
  }
  function setActiveGates(indices=[]){const active=new Set(indices);gates.forEach((g,i)=>{g.active=active.has(i);});}
  function dispose(){
    scene.remove(root);root.traverse(o=>{if(o.isInstancedMesh)o.dispose();});
    owned.forEach(g=>g.dispose());allMaterials.forEach(a=>a.dispose());textures.forEach(t=>t.dispose());envTarget?.dispose();
    if(scene.background===skyMap)scene.background=null;if(scene.environment===envTarget?.texture)scene.environment=null;
  }
  update(0,0);
  return { root, update, setActiveGates, dispose, sun, gates };
}
