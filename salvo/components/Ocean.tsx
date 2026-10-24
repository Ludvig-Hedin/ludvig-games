"use client";

import { useEffect, useId, useRef, useState } from "react";
import * as THREE from "three";
import type { Placement, Shot, ShipId } from "../lib/game";

type Quality = "high" | "low";
type Impact = { x: number; y: number; result: "hit" | "miss" | "sunk"; id: number };
type OceanProps = { className?: string; quality?: Quality; muted?: boolean };
type FleetProps = {
  fleet?: Placement[];
  shots?: Shot[];
  className?: string;
  selectedShip?: string;
  quality?: Quality;
  event?: Impact;
  onReady?: () => void;
};
const LENGTHS: Record<ShipId, number> = { carrier: 5, battleship: 4, cruiser: 3, submarine: 3, destroyer: 2 };

const vertex = /* glsl */ `
  uniform float uTime;
  uniform float uStrength;
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying float vCrest;
  void main() {
    vec3 p = position;
    float t = uTime * .47;
    float a = p.x * .64 + p.z * .31 + t;
    float b = p.x * 1.43 - p.z * .82 + t * 1.7;
    float c = p.x * 3.1 + p.z * 2.6 - t * 1.3;
    float wave = sin(a) * .14 + sin(b) * .053 + sin(c) * .014;
    float dx = cos(a)*.0896 + cos(b)*.0758 + cos(c)*.0434;
    float dz = cos(a)*.0434 - cos(b)*.0435 + cos(c)*.0364;
    p.y += wave * uStrength;
    vNormal = normalize(vec3(-dx*uStrength, 1., -dz*uStrength));
    vCrest = wave;
    vWorld = (modelMatrix * vec4(p,1.)).xyz;
    gl_Position = projectionMatrix * viewMatrix * vec4(vWorld,1.);
  }
`;
const fragment = /* glsl */ `
  uniform float uTime;
  uniform float uBoard;
  uniform vec3 uEye;
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying float vCrest;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
    return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x), mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);
  }
  void main() {
    vec2 uv = vWorld.xz;
    float fine = noise(uv*12.+vec2(uTime*.3,0.));
    float ripple = sin(uv.x*16.+uv.y*12.+fine*4.+uTime*.7)*.017;
    vec3 n = normalize(vNormal + vec3(ripple,0.,ripple*.7));
    vec3 eye = normalize(uEye-vWorld);
    vec3 light = normalize(vec3(-.6,1.,-.75));
    float fresnel = pow(1.-max(dot(n,eye),0.),3.);
    float broad = pow(max(dot(reflect(-light,n),eye),0.),22.);
    float sparkle = pow(max(dot(reflect(-light,n),eye),0.),170.);
    float current = noise(uv*.21+vec2(uTime*.022,-uTime*.018));
    vec3 deep = mix(vec3(.012,.069,.095),vec3(.027,.14,.17),current);
    vec3 color = deep + vec3(.065,.17,.19)*fresnel;
    color += vec3(.18,.26,.25)*broad*.7 + vec3(.67,.78,.70)*sparkle*.75;
    color += vec3(.016,.04,.047)*fine;
    float vein = smoothstep(.87,.995,noise(uv*1.7+vec2(uTime*.08,0.)));
    color += vec3(.055,.13,.14)*vein*max(vCrest,0.)*2.;
    float distanceFog = 1.-exp(-length(uEye-vWorld)*.009);
    color = mix(color,vec3(.025,.072,.09),distanceFog*(1.-uBoard));
    color *= .92 + .08*sin(uv.x*.11+uv.y*.13);
    gl_FragColor = vec4(color,1.);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

type Palette = Record<string, THREE.MeshStandardMaterial>;
function makePalette(): Palette {
  const material = (color: string, roughness = .7, metalness = .35) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
  return {
    hull: material("#354f56", .53, .65), side: material("#263d44", .58, .6), deck: material("#718080", .82, .25),
    superstructure: material("#8a9692", .66, .4), edge: material("#b4bdb3", .5, .45), gun: material("#45595e", .45, .68),
    dark: material("#172c34", .48, .4), glass: new THREE.MeshStandardMaterial({ color: "#133842", emissive: "#0e3940", emissiveIntensity: .24, roughness: .2, metalness: .8 }),
    stripe: material("#c8c8a7", .9, .05), rust: material("#997352", .9, .15),
    red: new THREE.MeshStandardMaterial({ color: "#cf6743", emissive: "#f54e1f", emissiveIntensity: .65 }),
    green: new THREE.MeshStandardMaterial({ color: "#a7dcc3", emissive: "#77d5af", emissiveIntensity: .8 }),
  };
}

function hullGeometry(length: number, width: number, low: number, high: number) {
  const p = [ [-.5,-.36],[-.40,-.49],[.27,-.49],[.43,-.3],[.5,0],[.43,.3],[.27,.49],[-.4,.49],[-.5,.36] ];
  const positions: number[] = [], indices: number[] = [];
  for (let ring = 0; ring < 2; ring++) for (const [x,z] of p) positions.push(x*length*(ring ? 1 : .92), ring ? high : low, z*width*(ring ? 1 : .78));
  positions.push(0,high,0,0,low,0);
  const n=p.length;
  for (let i=0;i<n;i++) {
    const j=(i+1)%n;
    indices.push(i,j,n+j, i,n+j,n+i, 2*n,n+j,n+i, 2*n+1,i,j);
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute("position",new THREE.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();return g;
}

// Bake the static detail into one draw call per material. Radars and instanced
// railings remain separate, so a detailed vessel costs roughly a dozen calls.
function consolidateShip(group: THREE.Group) {
  const buckets=new Map<THREE.Material,{positions:number[],normals:number[]}>();
  for(const child of [...group.children]) {
    if(!(child instanceof THREE.Mesh)||child instanceof THREE.InstancedMesh||Array.isArray(child.material))continue;
    child.updateMatrix();
    const original=child.geometry.clone();original.applyMatrix4(child.matrix);
    const geometry=original.index?original.toNonIndexed():original;
    const position=geometry.getAttribute("position"),normal=geometry.getAttribute("normal");
    let bucket=buckets.get(child.material);if(!bucket){bucket={positions:[],normals:[]};buckets.set(child.material,bucket);}
    for(let i=0;i<position.count;i++){bucket.positions.push(position.getX(i),position.getY(i),position.getZ(i));bucket.normals.push(normal.getX(i),normal.getY(i),normal.getZ(i));}
    geometry.dispose();if(geometry!==original)original.dispose();child.geometry.dispose();group.remove(child);
  }
  for(const [material,bucket] of buckets){const geometry=new THREE.BufferGeometry();geometry.setAttribute("position",new THREE.Float32BufferAttribute(bucket.positions,3));geometry.setAttribute("normal",new THREE.Float32BufferAttribute(bucket.normals,3));group.add(new THREE.Mesh(geometry,material));}
  return group;
}

/** All ship geometry is original, modeled in metres relative to its deck envelope. */
function makeShip(id: ShipId, length: number, width: number, mat: Palette) {
  const group=new THREE.Group();
  const h=width;
  const mesh=(geometry: THREE.BufferGeometry, material: THREE.Material, x=0,y=0,z=0) => {
    const m=new THREE.Mesh(geometry,material);m.position.set(x,y,z);group.add(m);return m;
  };
  const box=(x:number,y:number,z:number,w:number,hh:number,d:number,m=mat.superstructure) => mesh(new THREE.BoxGeometry(w,hh,d),m,x,y,z);
  const cylinder=(x:number,y:number,z:number,top:number,bottom:number,height:number,m=mat.gun,segments=12) => mesh(new THREE.CylinderGeometry(top,bottom,height,segments),m,x,y,z);
  mesh(hullGeometry(length,width,-h*.19,h*.18),mat.hull);
  mesh(hullGeometry(length*.98,width*.96,h*.17,h*.205),mat.deck);
  // Boot stripe and raised transom.
  mesh(hullGeometry(length*.99,width*.99,h*.025,h*.055),mat.side);
  box(-length*.463,h*.24,0,length*.035,h*.09,width*.65,mat.edge);
  const deck=h*.22;

  if(id==="submarine") {
    // A narrow pressure hull, conning tower, rudder and cruciform stern planes.
    const body=mesh(new THREE.CapsuleGeometry(width*.38,Math.max(.2,length-width),5,12),mat.side,0,h*.1,0);body.rotation.z=Math.PI/2;
    box(-length*.05,h*.44,0,length*.2,h*.42,width*.35,mat.hull);
    cylinder(length*.01,h*.79,0,width*.018,width*.018,h*.4,mat.dark,6);
    cylinder(-length*.035,h*.73,0,width*.013,width*.013,h*.3,mat.edge,6);
    box(-length*.41,h*.18,0,length*.08,h*.035,width*1.1,mat.hull);
    box(-length*.43,h*.39,0,length*.1,h*.37,width*.035,mat.hull);
    box(length*.21,h*.2,0,length*.045,h*.026,width*.92,mat.hull);
    return consolidateShip(group);
  }

  const turret=(x:number,backwards=false) => {
    cylinder(x,deck+h*.08,0,width*.15,width*.19,h*.15,mat.side);
    const t=box(x,deck+h*.2,0,width*.34,h*.24,width*.31,mat.gun);t.rotation.y=backwards?Math.PI:0;
    for(const z of [-.065,.065]) {
      const barrel=cylinder(x+(backwards?-1:1)*width*.33,deck+h*.24,z*width,width*.025,width*.032,width*.48,mat.dark,8);barrel.rotation.z=Math.PI/2;
      const collar=cylinder(x+(backwards?-1:1)*width*.19,deck+h*.24,z*width,width*.043,width*.043,width*.13,mat.gun,8);collar.rotation.z=Math.PI/2;
    }
  };

  if(id==="carrier") {
    mesh(hullGeometry(length*.98,width*1.23,h*.21,h*.25),mat.deck);
    // Flight deck markings, elevator panels, island, and folded-wing aircraft.
    box(0,h*.264,-width*.12,length*.86,.008,width*.018,mat.stripe);
    for(let i=0;i<13;i++) box(-length*.38+i*length*.06,h*.27,width*.18,length*.026,.009,width*.014,mat.stripe);
    for(let i=0;i<4;i++) box(length*.30+i*length*.026,h*.269,-width*.11,length*.01,.008,width*.45,mat.stripe);
    box(-length*.06,h*.38,width*.33,length*.29,h*.27,width*.26,mat.superstructure);
    box(-length*.095,h*.62,width*.33,length*.19,h*.24,width*.28,mat.hull);
    box(-length*.05,h*.75,width*.33,length*.11,h*.045,width*.31,mat.glass);
    box(-length*.05,h*.80,width*.33,length*.13,h*.065,width*.34,mat.edge);
    for(const x of [-.33,.05]) box(length*x,h*.27,-width*.41,length*.13,.01,width*.19,mat.gun);
    for(let i=0;i<5;i++) {
      const x=-length*.33+i*length*.12,z=-width*.35;
      box(x,h*.30,z,length*.067,h*.045,width*.045,mat.edge);
      const wings=box(x-length*.012,h*.32,z,length*.025,h*.018,width*.22,mat.superstructure);wings.rotation.y=.25;
      box(x-length*.03,h*.34,z,length*.02,h*.07,width*.015,mat.gun);
    }
  } else {
    turret(length*.32);
    if(id==="battleship") { turret(length*.17);turret(-length*.34,true); }
    else if(id==="cruiser") turret(-length*.31,true);
    // Sloped-looking stepped bridge, recessed wraparound glazing and roof.
    box(-length*.015,deck+h*.19,0,length*.31,h*.32,width*.65,mat.hull);
    box(length*.045,deck+h*.46,0,length*.18,h*.24,width*.52,mat.superstructure);
    box(length*.075,deck+h*.61,0,length*.15,h*.06,width*.55,mat.glass);
    box(length*.06,deck+h*.66,0,length*.18,h*.05,width*.59,mat.edge);
    box(-length*.12,deck+h*.36,0,length*.09,h*.35,width*.38,mat.superstructure);
    box(-length*.12,deck+h*.56,0,length*.095,h*.08,width*.4,mat.dark);
    if(id!=="destroyer") {
      box(-length*.22,deck+h*.24,0,length*.065,h*.24,width*.3,mat.hull);
      box(-length*.22,deck+h*.38,0,length*.07,h*.045,width*.32,mat.dark);
    }
    // Vertical launch cells and deck hatches.
    for(let i=0;i<3;i++) for(let j=0;j<2;j++) box(length*.16+i*width*.075,deck+.012,(j-.5)*width*.15,width*.061,.018,width*.11,mat.dark);
    if(id==="destroyer") {
      const pad=mesh(new THREE.RingGeometry(width*.16,width*.17,28),mat.stripe,-length*.31,deck+.012,0);pad.rotation.x=-Math.PI/2;
      box(-length*.31,deck+.018,0,width*.17,.01,width*.025,mat.stripe);
      for(const x of [-.075,.075]) box(-length*.31+x*width,deck+.018,0,width*.025,.01,width*.19,mat.stripe);
    }
    // Orange enclosed lifeboats sit outboard of the superstructure.
    for(const sign of [-1,1]) box(-length*.07,deck+h*.13,sign*width*.35,length*.085,h*.1,width*.12,mat.rust);
  }

  const mastX=id==="carrier"?-length*.08:length*.01;
  const mastZ=id==="carrier"?width*.33:0;
  const mastBase=id==="carrier"?h*.81:deck+h*.69;
  cylinder(mastX,mastBase+h*.26,mastZ,width*.016,width*.028,h*.56,mat.edge,7);
  box(mastX,mastBase+h*.31,mastZ,width*.025,h*.025,width*.48,mat.gun);
  for(const z of [-.18,.18]) cylinder(mastX,mastBase+h*.38,mastZ+width*z,width*.008,width*.008,h*.18,mat.dark,5);
  const radar=new THREE.Group();radar.position.set(mastX,mastBase+h*.57,mastZ);
  const panel=new THREE.Mesh(new THREE.BoxGeometry(width*.27,h*.14,width*.035),mat.side);radar.add(panel);group.add(radar);group.userData.radar=radar;
  const radome=mesh(new THREE.SphereGeometry(width*.065,10,8),mat.edge,mastX-length*.085,mastBase+h*.04,mastZ);
  radome.scale.y=1.13;

  // Fine deck rails. Instancing keeps each ship to four rail draw calls.
  const postCount=Math.max(10,Math.floor(length/width*8));
  const posts=new THREE.InstancedMesh(new THREE.BoxGeometry(width*.009,h*.09,width*.009),mat.edge,postCount*2);
  const matrix=new THREE.Matrix4();let index=0;
  for(const side of [-1,1]) for(let i=0;i<postCount;i++) {matrix.makeTranslation(-length*.44+(i/(postCount-1))*length*.75,deck+h*.05,side*width*.445);posts.setMatrixAt(index++,matrix);}
  group.add(posts);
  for(const side of [-1,1]) {box(-length*.065,deck+h*.09,side*width*.445,length*.76,h*.009,width*.009,mat.edge);box(-length*.065,deck+h*.04,side*width*.445,length*.76,h*.007,width*.007,mat.edge);}
  mesh(new THREE.SphereGeometry(width*.022,6,5),mat.red,length*.07,deck+h*.69,width*.31);
  mesh(new THREE.SphereGeometry(width*.022,6,5),mat.green,length*.07,deck+h*.69,-width*.31);
  return consolidateShip(group);
}

function smokeTexture() {
  const c=document.createElement("canvas");c.width=c.height=64;
  const ctx=c.getContext("2d")!;const g=ctx.createRadialGradient(32,32,0,32,32,32);
  g.addColorStop(0,"rgba(255,255,255,.68)");g.addColorStop(.3,"rgba(255,255,255,.4)");g.addColorStop(.68,"rgba(255,255,255,.12)");g.addColorStop(1,"rgba(255,255,255,0)");
  ctx.fillStyle=g;ctx.fillRect(0,0,64,64);return new THREE.CanvasTexture(c);
}

function disposeGeometry(root: THREE.Object3D) {root.traverse(o=>{if(o instanceof THREE.Mesh)o.geometry.dispose();if(o instanceof THREE.InstancedMesh)o.dispose();});}
function makeWorld(host: HTMLDivElement, hero: boolean, quality: Quality) {
  const reduced=window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const renderer=new THREE.WebGLRenderer({antialias:quality==="high",alpha:false,powerPreference:"low-power"});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,quality==="high"?1.5:1));
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;
  renderer.domElement.style.cssText="width:100%;height:100%;display:block;pointer-events:none";renderer.domElement.setAttribute("aria-hidden","true");host.appendChild(renderer.domElement);
  const scene=new THREE.Scene();scene.background=new THREE.Color("#071b23");
  const camera=hero?new THREE.PerspectiveCamera(35,1,.1,200):new THREE.OrthographicCamera(-5,5,5,-5,.1,100);
  if(hero){camera.position.set(14,18,24);camera.lookAt(0,0,-1);}else{camera.position.set(0,16,0);camera.up.set(0,0,-1);camera.lookAt(0,0,0);}
  scene.add(new THREE.HemisphereLight("#a8d6df","#14343c",hero?2.2:2.8));
  const sun=new THREE.DirectionalLight("#ffe4bb",hero?3.4:2.6);sun.position.set(-8,14,-7);scene.add(sun);
  const fill=new THREE.DirectionalLight("#66bad5",1.3);fill.position.set(8,5,8);scene.add(fill);
  const mat=makePalette();
  const uniforms={uTime:{value:0},uStrength:{value:hero?1:.17},uBoard:{value:hero?0:1},uEye:{value:camera.position}};
  const waterMaterial=new THREE.ShaderMaterial({vertexShader:vertex,fragmentShader:fragment,uniforms});
  const waterGeometry=new THREE.PlaneGeometry(hero?180:10,hero?180:10,hero?(quality==="high"?160:90):48,hero?(quality==="high"?160:90):48);waterGeometry.rotateX(-Math.PI/2);
  const water=new THREE.Mesh(waterGeometry,waterMaterial);scene.add(water);
  const ships=new Map<string,{group:THREE.Group,placement:Placement,sinkAt?:number,hero?:boolean}>();
  const damage=new THREE.Group();scene.add(damage);
  const smokeTex=smokeTexture();
  const smokeNodes:{sprite:THREE.Sprite,x:number,z:number,seed:number}[]=[];
  const embers:THREE.Mesh[]=[];
  const effects:{group:THREE.Group,t0:number,type:string,parts:{mesh:THREE.Object3D,v:THREE.Vector3,origin:THREE.Vector3}[],ring:THREE.Mesh,flash:THREE.Sprite}[]=[];
  let eventId:number|undefined,clock=0,active=true,visible=true,disposed=false,raf=0,last=0;

  const addVessel=(key:string,id:ShipId,length:number,width:number,x:number,z:number,angle:number) => {
    const group=makeShip(id,length,width,mat);group.position.set(x,.015,z);group.rotation.y=angle;scene.add(group);
    const placement={id,x:0,y:0,horizontal:true};ships.set(key,{group,placement,hero:true});return group;
  };
  if(hero) {
    addVessel("flagship","battleship",12,2.15,5,-1,-.42);
    addVessel("escort","destroyer",5.9,1.05,9,-11,-.42);
    addVessel("distant","cruiser",5.5,.95,-1.5,-12,-.42);
    // Long, broken wake ribbons catch the light behind the moving fleet.
    for(const [x,z,scale] of [[5,-1,1],[9,-11,.55],[-1.5,-12,.5]]) {
      const wake=new THREE.Group();wake.position.set(x,.022,z);wake.rotation.y=-.42;
      for(const sign of [-1,1]) for(let j=0;j<10;j++) {
        const line=new THREE.Mesh(new THREE.PlaneGeometry((.55+j*.14)*scale,.055*scale),new THREE.MeshBasicMaterial({color:"#99d2ce",transparent:true,opacity:(1-j/11)*.11,depthWrite:false}));
        line.rotation.x=-Math.PI/2;line.rotation.z=sign*.19;line.position.set((-6.1-j*.65)*scale,0,sign*(.6+j*.17)*scale);wake.add(line);
      }scene.add(wake);
    }
  }

  const setFleet=(fleet:Placement[],shots:Shot[],selected?:string) => {
    if(hero)return;
    const keys=new Set(fleet.map(p=>p.id));
    for(const [id,record] of ships) if(!keys.has(id as ShipId)){scene.remove(record.group);disposeGeometry(record.group);ships.delete(id);}
    for(const placement of fleet) {
      let record=ships.get(placement.id);
      if(!record){const group=makeShip(placement.id,LENGTHS[placement.id]-.16,placement.id==="carrier"?.68:placement.id==="submarine"?.5:.65,mat);scene.add(group);record={group,placement};ships.set(placement.id,record);}
      const length=LENGTHS[placement.id];record.placement=placement;
      record.group.position.x=-4.5+placement.x+(placement.horizontal?(length-1)/2:0);
      record.group.position.z=-4.5+placement.y+(placement.horizontal?0:(length-1)/2);
      record.group.rotation.y=placement.horizontal?0:-Math.PI/2;
      const sunk=Array.from({length},(_,i)=>({x:placement.x+(placement.horizontal?i:0),y:placement.y+(placement.horizontal?0:i)})).every(c=>shots.some(s=>s.x===c.x&&s.y===c.y&&s.result!=="miss"));
      if(sunk&&record.sinkAt===undefined)record.sinkAt=clock;
      if(!sunk)record.sinkAt=undefined;
      record.group.userData.selected=placement.id===selected;
    }
    for(const child of [...damage.children]) {damage.remove(child);if(child instanceof THREE.Sprite)child.material.dispose();else if(child instanceof THREE.Mesh){child.geometry.dispose();(child.material as THREE.Material).dispose();}}
    smokeNodes.length=0;embers.length=0;
    for(const shot of shots) {
      if(shot.result==="miss")continue;
      const x=-4.5+shot.x,z=-4.5+shot.y;
      const ember=new THREE.Mesh(new THREE.SphereGeometry(.095,8,6),new THREE.MeshBasicMaterial({color:"#ee7338",transparent:true,opacity:.9}));ember.position.set(x,.27,z);damage.add(ember);embers.push(ember);
      for(let i=0;i<(quality==="high"?5:3);i++) {
        const sm=new THREE.Sprite(new THREE.SpriteMaterial({map:smokeTex,color:i%2?"#777b76":"#313b3f",transparent:true,opacity:.25,depthWrite:false}));
        damage.add(sm);smokeNodes.push({sprite:sm,x,z,seed:i*.22+shot.x*.17+shot.y*.11});
      }
    }
  };
  const impact=(event?:Impact) => {
    if(!event||event.id===eventId)return;eventId=event.id;
    const x=-4.5+event.x,z=-4.5+event.y,miss=event.result==="miss";
    const group=new THREE.Group();group.position.set(x,.04,z);scene.add(group);
    const ring=new THREE.Mesh(new THREE.RingGeometry(.12,.15,36),new THREE.MeshBasicMaterial({color:miss?"#a9dce0":"#e4aa6a",transparent:true,opacity:.7,side:THREE.DoubleSide,depthWrite:false}));ring.rotation.x=-Math.PI/2;group.add(ring);
    const flash=new THREE.Sprite(new THREE.SpriteMaterial({map:smokeTex,color:miss?"#c0ebeb":"#ffb75b",transparent:true,opacity:.85,depthWrite:false,blending:THREE.AdditiveBlending}));flash.position.y=.2;flash.scale.setScalar(miss?.8:1.6);group.add(flash);
    const parts:{mesh:THREE.Object3D,v:THREE.Vector3,origin:THREE.Vector3}[]=[];
    for(let i=0;i<(quality==="high"?32:16);i++) {
      const angle=i*2.39996;const speed=.32+(i%7)*.11;
      const mesh=new THREE.Mesh(new THREE.OctahedronGeometry(miss?.025:.035),new THREE.MeshBasicMaterial({color:miss?(i%2?"#b4e1e3":"#6dabb5"):(i%3?"#ffa047":"#ec5930"),transparent:true,opacity:1}));
      mesh.position.y=.15;group.add(mesh);parts.push({mesh,v:new THREE.Vector3(Math.cos(angle)*speed,.7+(i%5)*.28,Math.sin(angle)*speed),origin:mesh.position.clone()});
    }
    effects.push({group,t0:clock,type:event.result,parts,ring,flash});
  };

  const resize=()=>{const w=host.clientWidth,h=host.clientHeight;if(!w||!h)return;renderer.setSize(w,h,false);if(camera instanceof THREE.PerspectiveCamera){camera.aspect=w/h;camera.fov=w/h<.8?49:35;camera.updateProjectionMatrix();}else camera.updateProjectionMatrix();};
  const observer=new ResizeObserver(resize);observer.observe(host);resize();
  const intersection=new IntersectionObserver(entries=>{visible=entries[0]?.isIntersecting!==false;});intersection.observe(host);
  const visibility=()=>{active=!document.hidden;};document.addEventListener("visibilitychange",visibility);
  const render=(time:number)=>{
    if(disposed)return;raf=requestAnimationFrame(render);
    const dt=Math.min((time-last)/1000,.05);last=time;
    if(!active||!visible)return;
    clock+=dt;uniforms.uTime.value=reduced?0:clock;
    if(hero&&!reduced){camera.position.x=14+Math.sin(clock*.065)*.22;camera.position.y=18+Math.sin(clock*.09)*.15;camera.lookAt(0,0,-1);}
    for(const record of ships.values()) {
      if(record.hero){record.group.position.y=.05+(reduced?0:Math.sin(clock*.62+record.group.position.x)*.055);record.group.rotation.x=reduced?0:Math.sin(clock*.45+record.group.position.z)*.007;record.group.rotation.z=reduced?0:Math.sin(clock*.52+record.group.position.x)*.009;}
      else if(record.sinkAt!==undefined){const t=Math.min(1,(clock-record.sinkAt)/3.8);record.group.position.y=.02-t*.66;record.group.rotation.x=t*.13;}
      else{record.group.position.y=.025;record.group.rotation.x=0;}
      const radar=record.group.userData.radar as THREE.Group|undefined;if(radar&&!reduced)radar.rotation.y=clock*.7;
    }
    for(const n of smokeNodes){const age=(clock*.22+n.seed)%1;const sz=.12+age*.62;n.sprite.position.set(n.x+age*.17,.32+age*.95,n.z-age*.14);n.sprite.scale.setScalar(sz);n.sprite.material.opacity=Math.sin(age*Math.PI)*.32;}
    for(let i=0;i<embers.length;i++)embers[i].scale.setScalar(.8+Math.sin(clock*8+i)*.18);
    for(let i=effects.length-1;i>=0;i--){const e=effects[i],age=clock-e.t0;
      e.ring.scale.setScalar(1+age*6);(e.ring.material as THREE.MeshBasicMaterial).opacity=Math.max(0,.6-age*.3);
      e.flash.material.opacity=Math.max(0,.9-age*2.5);e.flash.scale.setScalar((e.type==="miss"?.65:1.5)*(1+age));
      for(const p of e.parts){p.mesh.position.copy(p.origin).addScaledVector(p.v,age);p.mesh.position.y-=age*age*1.3;const mesh=p.mesh as THREE.Mesh;(mesh.material as THREE.MeshBasicMaterial).opacity=Math.max(0,1-age*.7);mesh.scale.setScalar(Math.max(.1,1-age*.25));}
      if(age>2.5){scene.remove(e.group);e.group.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();(o.material as THREE.Material).dispose();}if(o instanceof THREE.Sprite)o.material.dispose();});effects.splice(i,1);}
    }
    renderer.render(scene,camera);
  };raf=requestAnimationFrame(render);
  return {setFleet,impact,dispose:()=>{disposed=true;cancelAnimationFrame(raf);observer.disconnect();intersection.disconnect();document.removeEventListener("visibilitychange",visibility);const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();scene.traverse(o=>{if(o instanceof THREE.Mesh){geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);}if(o instanceof THREE.Sprite)materials.add(o.material);});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());Object.values(mat).forEach(m=>m.dispose());smokeTex.dispose();renderer.dispose();renderer.domElement.remove();}};
}

function Fallback({hero,fleet=[]}:{hero:boolean;fleet?:Placement[]}) {
  const id=useId().replace(/:/g,"");
  return <svg aria-hidden="true" viewBox="0 0 1000 1000" preserveAspectRatio={hero?"xMidYMid slice":"none"} style={{position:"absolute",inset:0,width:"100%",height:"100%",background:"#0c2932"}}>
    <defs><radialGradient id={id}><stop stopColor="#23616a"/><stop offset="1" stopColor="#071a24"/></radialGradient></defs>
    <rect width="1000" height="1000" fill={`url(#${id})`}/>
    {Array.from({length:32},(_,i)=><path key={i} d={`M -50 ${i*37} Q 250 ${i*37-45} 500 ${i*37} T 1050 ${i*37-20}`} stroke="#75b5bf" strokeOpacity=".075" fill="none"/>)}
    {(hero?[{id:"battleship" as ShipId,x:5,y:4,horizontal:true},{id:"destroyer" as ShipId,x:7,y:1,horizontal:true}]:fleet).map((ship,i)=><g key={`${ship.id}-${i}`} transform={`translate(${ship.x*100+50},${ship.y*100+50}) rotate(${ship.horizontal?0:90})`}><path d={`M -42 -28 H ${LENGTHS[ship.id]*100-110} L ${LENGTHS[ship.id]*100-52} 0 L ${LENGTHS[ship.id]*100-110} 28 H -42 Z`} fill="#63797d" stroke="#a6b7b5" strokeWidth="2"/><rect x="30" y="-21" width={LENGTHS[ship.id]*35} height="42" fill="#8e9b98"/><rect x="55" y="-14" width="38" height="28" fill="#243e48"/><path d="M 80 0 H 150" stroke="#a5b2ac" strokeWidth="8"/></g>)}
  </svg>;
}

export default function Ocean({className,quality="high"}:OceanProps) {
  const ref=useRef<HTMLDivElement>(null);const [fallback,setFallback]=useState(false);
  useEffect(()=>{if(!ref.current)return;try{const world=makeWorld(ref.current,true,quality);return world.dispose;}catch{setFallback(true);}},[quality]);
  return <div ref={ref} className={className} aria-hidden="true" style={{position:"absolute",inset:0,overflow:"hidden",pointerEvents:"none"}}>{fallback&&<Fallback hero/>}</div>;
}

export function FleetOcean({fleet=[],shots=[],className,selectedShip,quality="high",event,onReady}:FleetProps) {
  const ref=useRef<HTMLDivElement>(null);const world=useRef<ReturnType<typeof makeWorld>|null>(null);const [fallback,setFallback]=useState(false);
  const current=useRef({fleet,shots,selectedShip,event,onReady});current.current={fleet,shots,selectedShip,event,onReady};
  useEffect(()=>{if(!ref.current)return;try{const instance=makeWorld(ref.current,false,quality);world.current=instance;instance.setFleet(current.current.fleet,current.current.shots,current.current.selectedShip);instance.impact(current.current.event);current.current.onReady?.();return()=>{world.current=null;instance.dispose();};}catch{setFallback(true);current.current.onReady?.();}},[quality]);
  useEffect(()=>{world.current?.setFleet(fleet,shots,selectedShip);},[fleet,shots,selectedShip]);
  useEffect(()=>{world.current?.impact(event);},[event]);
  return <div ref={ref} className={className} aria-hidden="true" style={{position:"absolute",inset:0,overflow:"hidden",pointerEvents:"none"}}>{fallback&&<Fallback hero={false} fleet={fleet}/>}</div>;
}
