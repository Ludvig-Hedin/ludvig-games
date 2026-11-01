/* Original procedural art for BREACH. No remote textures or models required. */
export function createArena(THREE, scene, { mobile = false, quality = 'high' } = {}) {
  const detail = !mobile && quality !== 'low';
  const colliders = [];
  const bounds = { minX: -42, maxX: 42, minZ: -36, maxZ: 36 };
  const root = new THREE.Group(); root.name = 'Breakwater terminal'; scene.add(root);
  const textures = [], materials = [], geometries = [];
  const batches = new Map(), contactMatrices=[];
  let seed = 23117;
  const rand = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
  const unit = new THREE.BoxGeometry(1, 1, 1); geometries.push(unit);
  const cylinder = new THREE.CylinderGeometry(.5, .5, 1, 12); geometries.push(cylinder);
  const matrix = new THREE.Matrix4(), quaternion = new THREE.Quaternion();
  const vector = new THREE.Vector3(), scale = new THREE.Vector3(), axis = new THREE.Vector3(0, 1, 0);
  function mat(color, roughness = .85, metalness = 0, extra = {}) {
    const m = new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra }); materials.push(m); return m;
  }
  function basic(color, extra = {}) { const m = new THREE.MeshBasicMaterial({ color, ...extra }); materials.push(m); return m; }
  function instance(geometry, material, x, y, z, sx, sy, sz, yaw = 0, cast = true) {
    const key = `${geometry.uuid}:${material.uuid}:${cast}`;
    let batch = batches.get(key);
    if (!batch) { batch = { geometry, material, matrices: [], cast }; batches.set(key, batch); }
    vector.set(x, y, z); scale.set(sx, sy, sz); quaternion.setFromAxisAngle(axis, yaw);
    matrix.compose(vector, quaternion, scale); batch.matrices.push(matrix.clone());
  }
  const box = (x,y,z,w,h,d,m,yaw=0,cast=true) => instance(unit,m,x,y,z,w,h,d,yaw,cast);
  const cyl = (x,y,z,r,h,m,cast=true) => instance(cylinder,m,x,y,z,r*2,h,r*2,0,cast);
  function collider(x,z,w,d,h,minY=0) { colliders.push({ minX:x-w/2,maxX:x+w/2,minZ:z-d/2,maxZ:z+d/2,minY,maxY:minY+h }); }
  function canvasTexture(draw, w=512, h=w) {
    const c = document.createElement('canvas'); c.width=w; c.height=h;
    const cx=c.getContext('2d'); draw(cx,w,h);
    const t=new THREE.CanvasTexture(c); t.colorSpace=THREE.SRGBColorSpace; t.anisotropy=4; textures.push(t); return t;
  }
  function grimeTexture(base, density=13000, seam=false) {
    return canvasTexture((cx,w,h)=>{
      cx.fillStyle=base;cx.fillRect(0,0,w,h);
      for(let i=0;i<density;i++) { const a=rand();cx.fillStyle=a>.5?`rgba(222,220,202,${.015+rand()*.10})`:`rgba(6,12,17,${.025+rand()*.12})`;const s=rand()*2.8+.4;cx.fillRect(rand()*w,rand()*h,s,s); }
      if(seam) { cx.lineWidth=1;cx.strokeStyle='rgba(10,17,20,.27)';cx.strokeRect(.5,.5,w-1,h-1);cx.strokeStyle='rgba(220,226,219,.07)';cx.strokeRect(2,2,w-4,h-4); }
      for(let i=0;i<24;i++) { const x=rand()*w,y=rand()*h;const g=cx.createRadialGradient(x,y,0,x,y,10+rand()*90);g.addColorStop(0,'rgba(12,17,19,.055)');g.addColorStop(1,'rgba(12,17,19,0)');cx.fillStyle=g;cx.fillRect(0,0,w,h); }
    });
  }
  const asphaltTex=grimeTexture('#494f50',24000,true);asphaltTex.wrapS=asphaltTex.wrapT=THREE.RepeatWrapping;asphaltTex.repeat.set(56,90);
  const concreteTex=grimeTexture('#989b94',14000,true);concreteTex.wrapS=concreteTex.wrapT=THREE.RepeatWrapping;concreteTex.repeat.set(2,2);
  const metalTex=canvasTexture((cx,w,h)=>{
    cx.fillStyle='#dedbd2';cx.fillRect(0,0,w,h);
    for(let i=0;i<6000;i++) { cx.fillStyle=`rgba(${rand()>.4?'42,31,25':'235,220,189'},${rand()*.15})`;cx.fillRect(rand()*w,rand()*h,rand()*3+1,rand()*20+1); }
    for(let i=0;i<60;i++) { const x=rand()*w,y=rand()*h;cx.fillStyle=`rgba(93,51,27,${rand()*.34})`;cx.fillRect(x,y,rand()*6+1,rand()*90); }
    cx.fillStyle='rgba(18,18,18,.13)';cx.fillRect(0,h-15,w,15);cx.fillRect(0,0,w,7);
  }); metalTex.wrapS=metalTex.wrapT=THREE.RepeatWrapping;
  const normalTex=canvasTexture((cx,w,h)=>{
    const im=cx.createImageData(w,h);
    for(let i=0;i<im.data.length;i+=4) { im.data[i]=122+rand()*12;im.data[i+1]=122+rand()*12;im.data[i+2]=253;im.data[i+3]=255; }cx.putImageData(im,0,0);
  },256);normalTex.colorSpace=THREE.NoColorSpace;normalTex.wrapS=normalTex.wrapT=THREE.RepeatWrapping;normalTex.repeat.set(110,110);
  const asphalt=mat(0xa0a5a4,.72,.16,{map:asphaltTex,normalMap:normalTex,normalScale:new THREE.Vector2(.3,.3)});
  const concrete=mat(0xbbc1b9,.94,0,{map:concreteTex});
  const darkConcrete=mat(0x545e5f,.93,0,{map:concreteTex});
  const metal=mat(0x536063,.44,.72,{map:metalTex});
  const darkMetal=mat(0x252e32,.5,.75,{map:metalTex});
  const steel=mat(0xabb7b4,.38,.8);
  const glass=mat(0x7f9fa5,.25,.65);
  const rubber=mat(0x171c1e,.93);
  const yellow=mat(0xceaa46,.77,.12,{map:metalTex});
  const paintWhite=mat(0xe4ded0,.94), paintYellow=mat(0xcdb35f,.95);
  const warmLight=basic(0xffc988), coolLight=basic(0xc5e9fa);
  const shadowTex=canvasTexture((cx,w,h)=>{const g=cx.createRadialGradient(w/2,h/2,0,w/2,h/2,w/2);g.addColorStop(0,'rgba(0,0,0,.65)');g.addColorStop(.6,'rgba(0,0,0,.3)');g.addColorStop(1,'rgba(0,0,0,0)');cx.fillStyle=g;cx.fillRect(0,0,w,h);},64);
  const shadowMat=basic(0x081219,{map:shadowTex,transparent:true,opacity:.36,depthWrite:false});
  const groundGeo=new THREE.PlaneGeometry(250,400);geometries.push(groundGeo);
  const ground=new THREE.Mesh(groundGeo,asphalt);ground.position.x=-75;ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;root.add(ground);
  function contact(x,z,w,d,yaw=0) {
    vector.set(x,.012,z);scale.set(w+2,d+2,1);quaternion.setFromEuler(new THREE.Euler(-Math.PI/2,0,-yaw));matrix.compose(vector,quaternion,scale);contactMatrices.push(matrix.clone());
  }
  // A reflection environment gives metals readable sky highlights without downloaded HDRs.
  const envFaces=[];
  for(let face=0;face<6;face++) { const c=document.createElement('canvas');c.width=c.height=128;const cx=c.getContext('2d');const g=cx.createLinearGradient(0,0,0,128);g.addColorStop(0,face===3?'#303d45':'#8094a8');g.addColorStop(.45,'#aab8be');g.addColorStop(.55,'#68757b');g.addColorStop(1,'#313d43');cx.fillStyle=g;cx.fillRect(0,0,128,128);if(face===0){cx.fillStyle='#ffe0af';cx.fillRect(64,25,22,20);}envFaces.push(c); }
  const environment=new THREE.CubeTexture(envFaces);environment.colorSpace=THREE.SRGBColorSpace;environment.needsUpdate=true;scene.environment=environment;textures.push(environment);
  scene.background=new THREE.Color(0x8fa3aa);scene.fog=new THREE.FogExp2(0x92a7ac,.009);
  const skyGeo=new THREE.SphereGeometry(350,24,12);geometries.push(skyGeo);
  const skyMat=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,uniforms:{top:{value:new THREE.Color('#44677d')},horizon:{value:new THREE.Color('#bac7c6')}},vertexShader:'varying vec3 vWorld; void main(){vWorld=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'varying vec3 vWorld;uniform vec3 top;uniform vec3 horizon;void main(){float t=pow(max(normalize(vWorld).y,0.),.48);vec3 c=mix(horizon,top,t);float haze=exp(-abs(normalize(vWorld).y)*14.);c+=vec3(.055,.035,.008)*haze;gl_FragColor=vec4(c,1.);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}'});materials.push(skyMat);const sky=new THREE.Mesh(skyGeo,skyMat);sky.renderOrder=-100;root.add(sky);
  const ambient=new THREE.HemisphereLight(0xd6e5ef,0x67685f,2.0);root.add(ambient);
  const sun=new THREE.DirectionalLight(0xffdfba,2.25);sun.position.set(-28,48,24);sun.castShadow=true;sun.shadow.mapSize.set(detail?2048:1024,detail?2048:1024);sun.shadow.camera.left=-58;sun.shadow.camera.right=58;sun.shadow.camera.top=52;sun.shadow.camera.bottom=-52;sun.shadow.camera.near=1;sun.shadow.camera.far=120;sun.shadow.bias=-.00035;sun.shadow.normalBias=.055;sun.shadow.radius=3;root.add(sun);root.add(sun.target);
  // Slightly raised edge strips and painted lanes establish the yard's scale.
  for(const z of [-29,29]) { box(0,.015,z,77,.025,.12,paintYellow,0,false);for(let x=-36;x<38;x+=6)box(x,.016,z+1.8,2.8,.025,.13,paintWhite,0,false); }
  for(const x of [-31,31])box(x,.015,0,.12,.025,55,paintYellow,0,false);
  for(let z=-25;z<28;z+=7)box(0,.015,z,.14,.025,3,paintWhite,0,false);
  // Drain grilles, patched tarmac, and individual surface wear.
  for(const z of [-28,0,28]) for(const x of [-30,30]) {box(x,.018,z,1.6,.035,.5,darkMetal,0,false);for(let k=0;k<10;k++)box(x-.7+k*.15,.041,z,.04,.025,.47,steel,0,false);}
  const patch=mat(0x323d41,.8,.08);
  for(let i=0;i<20;i++) {const x=rand()*74-37,z=rand()*62-31;box(x,.008,z,1+rand()*2,.012,.6+rand()*2,patch,rand()*.4,false);}
  const signCache=new Map(),signPlane=new THREE.PlaneGeometry(1,1);geometries.push(signPlane);
  function sign(text,w=512,h=128,color='#d8ddce',background=null) {
    const key=JSON.stringify([text,w,h,color,background]);if(signCache.has(key))return signCache.get(key);
    const tx=canvasTexture((cx,cw,ch)=>{if(background){cx.fillStyle=background;cx.fillRect(0,0,cw,ch);}cx.fillStyle=color;cx.textAlign='center';cx.textBaseline='middle';cx.font=`700 ${Math.floor(ch*.65)}px Arial, sans-serif`;cx.fillText(text,cw/2,ch*.53,cw*.92);},w,h);
    const m=mat(0xffffff,.9,0,{map:tx,transparent:!background,side:THREE.DoubleSide,depthWrite:!!background});signCache.set(key,m);return m;
  }
  function placard(text,x,y,z,w,h,yaw=0,color,background,batched=false) {const m=sign(text,Math.max(256,Math.round(w*96)),128,color,background);if(batched){instance(signPlane,m,x,y,z,w,h,1,yaw,false);return null;}const g=new THREE.PlaneGeometry(w,h);geometries.push(g);const p=new THREE.Mesh(g,m);p.position.set(x,y,z);p.rotation.y=yaw;root.add(p);return p;}
  function groundText(text,x,z,w=5,h=2,yaw=0) {const p=placard(text,x,.035,z,w,h,0,'#c8c1a6');p.rotation.set(-Math.PI/2,0,yaw);}
  groundText('07',-26,25,4,2.5);groundText('04',27,-26,4,2.5);groundText('KEEP CLEAR',0,18,9,1.3);groundText('←',-12,29,3,1.5);groundText('→',12,-29,3,1.5);
  const containerColors=[0x536c70,0x6a7776,0x8f573c,0x51636d,0x999075,0x4c5a54];
  const containerMats=containerColors.map(c=>mat(c,.72,.36,{map:metalTex}));
  function container(x,z,yaw=0,index=0,base=0,len=12.2) {
    const w=len,d=4.1,h=3.18,c=Math.cos(yaw),s=Math.sin(yaw),cm=containerMats[index%containerMats.length];
    const local=(lx,ly,lz,bw,bh,bd,m=cm,cast=true)=>box(x+c*lx+s*lz,base+ly,z-s*lx+c*lz,bw,bh,bd,m,yaw,cast);
    local(0,h/2,0,w,h,d,cm);local(0,h-.03,0,w+.08,.14,d+.08,darkMetal);local(0,.11,0,w+.12,.18,d+.1,darkMetal);
    for(const side of [-1,1]) {for(let k=-w/2+.25;k<w/2;k+=.34)local(k,h/2,side*(d/2+.025),.10,h-.25,.10,cm);for(const lx of [-w/2+.08,w/2-.08])local(lx,h/2,side*(d/2+.055),.15,h,.15,darkMetal);local(0,h-.21,side*(d/2+.06),w-.2,.055,.08,steel);}
    // Twin end doors, recessed seams, locking rods, hinges, and corner castings.
    for(const end of [-1,1]) {local(end*(w/2+.02),h/2,0,.045,h-.25,.045,darkMetal);for(const dz of [-d/2+.08,0,d/2-.08])local(end*(w/2+.04),h/2,dz,.06,h-.24,.055,darkMetal);for(const dz of [-1.32,-.7,.7,1.32]){local(end*(w/2+.065),h/2,dz,.055,h-.48,.045,steel);local(end*(w/2+.105),1.18,dz,.12,.07,.32,steel);}for(const yy of [.13,h-.13])for(const zz of [-d/2+.12,d/2-.12])local(end*(w/2+.02),yy,zz,.25,.23,.24,darkMetal);}
    // Raised roof ribs catch shallow sunlight.
    for(let k=-w/2+.35;k<w/2;k+=.5)local(k,h+.055,0,.08,.06,d-.18,cm);
    if(base===0) {contact(x,z,Math.abs(c)*w+Math.abs(s)*d,Math.abs(s)*w+Math.abs(c)*d);}
    collider(x,z,Math.abs(c)*w+Math.abs(s)*d,Math.abs(s)*w+Math.abs(c)*d,h,base);
    for(const side of [-1,1]) {const lx=-w*.20,lz=side*(d/2+.09);placard(index%2?'NORTHLINE':'B W / 07',x+c*lx+s*lz,base+1.92,z-s*lx+c*lz,3.5,.56,yaw+(side===1?0:Math.PI),'#c8d0c7',null,true);const lz2=side*(d/2+.10),lx2=w*.34;placard('CARGO',x+c*lx2+s*lz2,base+.7,z-s*lx2+c*lz2,1.15,.28,yaw+(side===1?0:Math.PI),'#c3bd9f',null,true);}
  }
  container(-24,-18,Math.PI/2,0);container(-14,-20,0,2);container(-14,-20,0,1,3.24);
  container(4,-20,0,3);container(21,-22,0,0);container(26,-7,Math.PI/2,2);
  container(-11,-1,Math.PI/2,1);container(10,3,Math.PI/2,0);
  container(-22,14,0,2);container(24,17,0,3);container(24,17,0,4,3.24);
  container(-6,24,0,5);container(-27,2,Math.PI/2,4,0,7);
  function barrier(x,z,yaw=0,len=5.2) {
    const c=Math.cos(yaw),s=Math.sin(yaw),local=(lx,yy,lz,w,h,d,m)=>box(x+c*lx+s*lz,yy,z-s*lx+c*lz,w,h,d,m,yaw);
    local(0,.13,0,len,.26,1.05,darkConcrete);local(0,.43,0,len-.1,.4,.82,concrete);local(0,.89,0,len-.16,.56,.42,concrete);local(0,1.19,0,len-.16,.09,.43,darkConcrete);
    for(const side of [-1,1])for(let k=-len/2+.3;k<len/2;k+=.65)local(k,.97,side*.216,.32,.26,.018,k%1.3>.6?darkMetal:yellow);
    for(const lx of [-len/2+.5,len/2-.5])local(lx,1.27,0,.09,.16,.10,steel);
    collider(x,z,Math.abs(c)*len+Math.abs(s)*1.05,Math.abs(s)*len+Math.abs(c)*1.05,1.35);contact(x,z,len,1.3,yaw);
  }
  barrier(-1,-7,0,6);barrier(0,10,Math.PI/2,4.2);barrier(-20,-7,0,4);barrier(22,5,0,5);barrier(-19,25,Math.PI/2,4);barrier(16,26,0,4);
  const barrelMats=new Map();
  function barrel(x,z,color=0x465855,stack=1) {
    if(!barrelMats.has(color))barrelMats.set(color,mat(color,.62,.55,{map:metalTex}));const bm=barrelMats.get(color);
    for(let k=0;k<stack;k++){const yy=k*1.22;cyl(x,yy+.59,z,.39,1.18,bm);for(const y of [.08,.38,.81,1.12])cyl(x,yy+y,z,.405,.035,darkMetal);cyl(x,yy+1.185,z,.37,.012,darkMetal);cyl(x+.18,yy+1.21,z+.1,.035,.035,steel);}
    collider(x,z,.83,.83,1.2*stack);contact(x,z,.8,.8);
  }
  for(const [x,z] of [[-20,10],[-19,10.7],[17,-16],[17.9,-16],[18.4,-15.1],[29,11],[-7,-12],[-6.1,-12.3]])barrel(x,z,0x56655f);
  function crate(x,z,w=1.7,h=1.45,d=1.5) {
    const wood=crate.wood||(crate.wood=mat(0x8b795c,.92,0,{map:metalTex}));box(x,h/2,z,w,h,d,wood);for(const zz of [-d/2-.025,d/2+.025])for(const xx of [-w/2+.09,w/2-.09])box(x+xx,h/2,z+zz,.16,h+.05,.09,darkMetal);for(const yy of [.18,h-.18])box(x,yy,z+d/2+.055,w,.12,.06,darkMetal);for(let yy=.25;yy<h;yy+=.25)box(x,yy,z+d/2+.06,w,.016,.013,darkMetal,0,false);collider(x,z,w,d,h);contact(x,z,w,d);
  }
  crate(-17,6);crate(-18.7,7.4,1.5,1.2,1.6);crate(17,11,2.2,1.6,1.7);crate(7,-12,1.8,1.5,1.7);
  // Forklift: visibly recognisable yard machinery, useful hard cover.
  function forklift(x,z,yaw=0) {
    const c=Math.cos(yaw),s=Math.sin(yaw),local=(lx,yy,lz,w,h,d,m)=>box(x+c*lx+s*lz,yy,z-s*lx+c*lz,w,h,d,m,yaw);
    local(0,.66,0,1.8,.72,2.6,yellow);local(0,1.05,.8,1.8,.4,.9,yellow);local(0,1.02,-.8,1.4,.6,.55,darkMetal);
    for(const xx of [-.76,.76])for(const zz of [-.9,.9]) {const wheel=new THREE.Mesh(new THREE.CylinderGeometry(.43,.43,.25,12),rubber);wheel.rotation.z=Math.PI/2;wheel.rotation.y=yaw;wheel.position.set(x+c*xx+s*zz,.43,z-s*xx+c*zz);wheel.castShadow=true;root.add(wheel);}
    for(const xx of [-.7,.7])for(const zz of [-.5,.75])local(xx,1.9,zz,.07,1.85,.07,darkMetal);
    local(0,2.84,.12,1.68,.12,1.6,darkMetal);local(0,1.4,.4,.75,.3,.65,rubber);local(0,1.78,.72,.75,.6,.12,rubber);
    for(const xx of [-.57,.57]){local(xx,1.55,-1.47,.13,2.7,.16,darkMetal);local(xx,.19,-2.1,.14,.12,1.6,steel);}local(0,.65,-1.55,1.4,.19,.2,steel);
    collider(x,z,3.4,3.4,2.9);contact(x,z,3,4);
  }
  forklift(20,-3,Math.PI*.5);
  function warehouse(x,z,w,d,title) {
    box(x,4,z,w,8,d,concrete);box(x,7.95,z,w+.8,.28,d+.8,darkMetal);box(x,1.15,z,w+.06,2.3,d+.06,darkConcrete);
    collider(x,z,w,d,8);
    const side=x<0?1:-1,face=x+side*(w/2+.035),yaw=side*Math.PI/2;
    for(let zz=z-d/2+.5;zz<z+d/2;zz+=.5)box(face,4.9,zz,.05,5.8,.065,metal);
    for(const zz of [z-d*.26,z+d*.26]) {
      box(face+side*.05,2.1,zz,.07,4.1,5.4,darkMetal);for(let yy=.3;yy<4;yy+=.24)box(face+side*.10,yy,zz,.065,.045,5.25,metal);
      box(face+side*.58,4.25,zz,1.25,.14,6,metal);for(const end of [-1,1])box(face+side*.6,2.1,zz+end*2.85,.1,4.2,.1,darkMetal);
      placard('LOADING',face+side*.13,4.75,zz,3.6,.55,yaw,'#303e43','#e4ddc7');
      box(face+side*.17,5.4,zz,.12,.10,2.8,warmLight,0,false);
    }
    for(let zz=z-d/2+2;zz<z+d/2-1;zz+=3.4) {box(face+side*.07,6.5,zz,.1,.85,2.5,darkMetal);box(face+side*.13,6.5,zz,.04,.64,2.28,glass);box(face+side*.16,6.5,zz,.07,.7,.05,metal);}
    placard(title,face+side*.15,7.35,z,Math.min(d-2,18),.7,yaw,'#e0dfd0');
    for(const zz of [z-d/3,z+d/3]){box(x,8.5,zz,2.3,.8,2.4,darkMetal);for(let k=-.8;k<1;k+=.28)box(x+k,8.93,zz,.07,.05,2,steel);cyl(x+w*.2,9,zz+2,.35,2,metal);cyl(x+w*.2,10.05,zz+2,.5,.15,darkMetal);}
    contact(x,z,w+1,d+1);
  }
  warehouse(-38,0,8,34,'BREAKWATER / 04');warehouse(38,5,8,32,'CARGO CONTROL');
  box(-38,6.2,21.6,7,12.4,5,concrete);collider(-38,21.6,7,5,12.4);box(-38,12.5,21.6,7.6,.25,5.6,darkMetal);
  // Rear utility wall and secured perimeter; collision boundaries match visible edge.
  for(const x of [-43,43])box(x,1.25,0,1.2,2.5,77,darkConcrete);
  for(const z of [-37,37])box(0,1.25,z,87,2.5,1.2,darkConcrete);
  for(let x=-40;x<=40;x+=5)for(const z of [-37,37]){cyl(x,3.05,z,.055,2.8,steel);box(x,4.38,z,5,.035,.035,steel,0,false);}
  for(let z=-32;z<=32;z+=5)for(const x of [-43,43]){cyl(x,3.05,z,.055,2.8,steel);box(x,4.38,z,.035,.035,5,steel,0,false);}
  const fenceTx=canvasTexture((cx,w,h)=>{cx.clearRect(0,0,w,h);cx.strokeStyle='rgba(160,173,173,.72)';cx.lineWidth=1.2;for(let i=-w;i<2*w;i+=16){cx.beginPath();cx.moveTo(i,0);cx.lineTo(i+w,h);cx.stroke();cx.beginPath();cx.moveTo(i,0);cx.lineTo(i-w,h);cx.stroke();}},128);fenceTx.wrapS=fenceTx.wrapT=THREE.RepeatWrapping;fenceTx.repeat.set(30,1);
  const fenceMat=mat(0xa7b4b1,.6,.65,{map:fenceTx,transparent:true,alphaTest:.25,side:THREE.DoubleSide});
  for(const z of [-37,37]) {const mesh=new THREE.Mesh(new THREE.PlaneGeometry(86,2.05),fenceMat);mesh.position.set(0,3.45,z);root.add(mesh);}
  // Lamps and lit electrical cabinets are readable visual landmarks.
  function lamp(x,z,armDirection=1) {
    cyl(x,5.4,z,.115,10.8,darkMetal);cyl(x,.35,z,.3,.7,concrete);box(x+armDirection*.8,10.7,z,1.8,.12,.13,steel);
    box(x+armDirection*1.55,10.56,z,.75,.22,.6,darkMetal);box(x+armDirection*1.55,10.43,z,.64,.035,.46,warmLight,0,false);
    const beamGeo=new THREE.ConeGeometry(3.2,9.8,12,1,true);geometries.push(beamGeo);const beamMat=basic(0xe5c49a,{transparent:true,opacity:.018,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending});const beam=new THREE.Mesh(beamGeo,beamMat);beam.position.set(x+armDirection*1.55,5.5,z);root.add(beam);
    if(detail&&z<0){const light=new THREE.PointLight(0xffc58b,24,12,2);light.position.set(x+armDirection*1.5,7,z);root.add(light);}
    collider(x,z,.5,.5,10.8);
  }
  lamp(-31,-25,1);lamp(31,-26,-1);lamp(-31,25,1);lamp(31,27,-1);
  for(const [x,z] of [[-32,-10],[32,12]]) {box(x,.85,z,.65,1.7,1.2,darkMetal);placard('⚡',x+(x<0?.331:-.331),1.15,z,.6,.6,x<0?Math.PI/2:-Math.PI/2,'#e9cb6e');collider(x,z,.7,1.3,1.7);}
  // Coiled hoses and neatly stacked pallets add near-field material detail.
  const wood=mat(0x6b5e4c,.95,0,{map:metalTex});
  for(const [x,z] of [[-28,20],[28,-17],[-7,18]]) {for(let k=0;k<3;k++){for(let n=0;n<5;n++)box(x-.8+n*.4,.12+k*.24,z,.22,.09,1.5,wood);for(const xx of [-.65,.65])box(x+xx,.05+k*.24,z,.12,.10,1.45,wood);}collider(x,z,2,1.7,.76);contact(x,z,2,1.7);}
  for(const [x,z] of [[-31,15],[31,-13]]){const geo=new THREE.TorusGeometry(.48,.047,6,28);geometries.push(geo);for(let k=0;k<3;k++){const mesh=new THREE.Mesh(geo,rubber);mesh.rotation.x=Math.PI/2;mesh.position.set(x,.06+k*.075,z);root.add(mesh);}}
  // Broad shallow puddles reflect the sky. Their irregular silhouettes avoid tiled-water repetition.
  const puddleMat=new THREE.MeshPhysicalMaterial({color:0x667c82,metalness:.46,roughness:.19,clearcoat:1,clearcoatRoughness:.12,transparent:true,opacity:.55,depthWrite:false,envMapIntensity:.85});materials.push(puddleMat);
  for(const [x,z,r] of [[-25,-27,2.3],[4,-13,3.5],[-23,7,2.5],[17,20,2.1],[30,2,2.6],[-4,31,2.2],[1,2,2.9]]) {const shape=new THREE.Shape();for(let i=0;i<=20;i++){const a=i/20*Math.PI*2,rr=r*(.7+rand()*.3),px=Math.cos(a)*rr,py=Math.sin(a)*rr*.6;if(i===0)shape.moveTo(px,py);else shape.lineTo(px,py);}const g=new THREE.ShapeGeometry(shape);geometries.push(g);const mesh=new THREE.Mesh(g,puddleMat);mesh.rotation.x=-Math.PI/2;mesh.position.set(x,.025,z);mesh.renderOrder=2;root.add(mesh);}
  // World beyond the combat boundary: a port and calm sea, not a floating arena.
  const waterMat=mat(0x466575,.28,.65,{normalMap:normalTex,normalScale:new THREE.Vector2(.08,.08)});
  const sea=new THREE.Mesh(new THREE.PlaneGeometry(180,380),waterMat);sea.rotation.x=-Math.PI/2;sea.position.set(137,-.42,0);root.add(sea);
  box(48,-.08,0,7,.32,180,concrete);for(let z=-80;z<80;z+=8){cyl(50,.32,z,.22,.8,darkMetal);box(50,.68,z,.7,.12,.35,darkMetal);}
  const craneMat=mat(0x576f76,.7,.55);
  function crane(x,z,h=29) {for(const xx of [-3,3])for(const zz of [-2.8,2.8])box(x+xx,h/2,z+zz,.5,h,.5,craneMat);box(x,h,z,7,.8,7,craneMat);box(x+5,h+1,z,28,.7,.8,craneMat);box(x+5,h+3.1,z,28,.4,.4,craneMat);for(let xx=-8;xx<19;xx+=2)box(x+xx,h+2,z,.16,2.2,.16,craneMat,.45);box(x-5,h-1,z,3,2,3,darkMetal);box(x+17,h-6,z,.05,13,.05,darkMetal);box(x+17,h-12.6,z,.7,.8,.6,darkMetal);}
  crane(58,-44,30);crane(68,30,35);crane(-59,-67,26);
  for(let i=0;i<15;i++) {const x=rand()*130-65,z=-58-rand()*17,w=5+rand()*10,h=3+rand()*7;box(x,h/2,z,w,h,8+rand()*8,containerMats[i%containerMats.length]);}
  const hillMat=mat(0x637b7d,1);const hillGeo=new THREE.SphereGeometry(1,12,6);geometries.push(hillGeo);
  for(let i=0;i<12;i++) {const hill=new THREE.Mesh(hillGeo,hillMat);hill.position.set(-155+i*30,4,-150-rand()*45);hill.scale.set(30+rand()*28,12+rand()*20,25);root.add(hill);}
  // Small aerial mast and warning beacon.
  cyl(-37,16,21,.07,7,steel);for(let y=14;y<19;y+=1.3)box(-37,y,21,1.8,.045,.045,steel);
  const beaconMat=basic(0xff765d);const beacon=new THREE.Mesh(new THREE.SphereGeometry(.11,8,6),beaconMat);beacon.position.set(-37,19.6,21);root.add(beacon);
  // Sparse wind-blown particles; no large translucent layer over the view.
  const dustCount=detail?90:35, dustPositions=new Float32Array(dustCount*3);
  for(let i=0;i<dustCount;i++){dustPositions[i*3]=rand()*82-41;dustPositions[i*3+1]=.4+rand()*10;dustPositions[i*3+2]=rand()*70-35;}
  const dustGeo=new THREE.BufferGeometry();dustGeo.setAttribute('position',new THREE.BufferAttribute(dustPositions,3));geometries.push(dustGeo);
  const dustMat=new THREE.PointsMaterial({color:0xd6d8ca,size:.035,transparent:true,opacity:.23,depthWrite:false});materials.push(dustMat);const dust=new THREE.Points(dustGeo,dustMat);root.add(dust);
  // Flush all shared architectural primitives to compact GPU instance batches.
  for(const {geometry,material,matrices:ms,cast} of batches.values()) {const mesh=new THREE.InstancedMesh(geometry,material,ms.length);for(let i=0;i<ms.length;i++)mesh.setMatrixAt(i,ms[i]);mesh.instanceMatrix.needsUpdate=true;mesh.castShadow=cast;mesh.receiveShadow=true;mesh.computeBoundingSphere();root.add(mesh);}
  const contactGeo=new THREE.PlaneGeometry(1,1);geometries.push(contactGeo);const contactMesh=new THREE.InstancedMesh(contactGeo,shadowMat,contactMatrices.length);contactMatrices.forEach((m,i)=>contactMesh.setMatrixAt(i,m));contactMesh.instanceMatrix.needsUpdate=true;contactMesh.renderOrder=1;contactMesh.computeBoundingSphere();root.add(contactMesh);
  const spawns=[
    {x:-33,z:29,yaw:-Math.PI/4},{x:33,z:-29,yaw:Math.PI*.75},
    {x:-33,z:-29,yaw:-Math.PI*.75},{x:33,z:29,yaw:Math.PI/4},
    {x:-20,z:-30,yaw:Math.PI},{x:13,z:-31,yaw:Math.PI},
    {x:-20,z:31,yaw:0},{x:12,z:31,yaw:0},
    {x:-31,z:-13,yaw:-Math.PI/2},{x:32,z:-16,yaw:Math.PI/2},
    {x:-31,z:9,yaw:-Math.PI/2},{x:32,z:23,yaw:Math.PI/2},
    {x:0,z:-27,yaw:Math.PI},{x:3,z:27,yaw:0},
    {x:-18,z:1,yaw:-Math.PI/2},{x:18,z:8,yaw:Math.PI/2}
  ];
  // Fail visibly in development if layout editing places a spawn in solid cover.
  for(const spawn of spawns) if(colliders.some(c=>c.minY<1.8&&spawn.x>c.minX-.6&&spawn.x<c.maxX+.6&&spawn.z>c.minZ-.6&&spawn.z<c.maxZ+.6)) console.warn('Arena spawn overlaps cover:',spawn);
  return {
    colliders,spawns,bounds,root,
    update(dt,time){dust.position.x=Math.sin(time*.04)*1.5;dust.position.z=Math.sin(time*.024)*.75;beacon.scale.setScalar(.8+Math.max(0,Math.sin(time*2.8))*.3);},
    dispose(){scene.remove(root);const geos=new Set(geometries),mats=new Set(materials);root.traverse(o=>{if(o.geometry)geos.add(o.geometry);if(o.material&&!Array.isArray(o.material))mats.add(o.material);});for(const g of geos)g.dispose();for(const m of mats)m.dispose();for(const t of textures)t.dispose();if(scene.environment===environment)scene.environment=null;}
  };
}
