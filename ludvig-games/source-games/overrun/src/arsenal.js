import * as THREE from 'three';

const base = {reserve:180,ads:.16,move:1,range:35,falloff:.5,spread:.008,adsSpread:.0012,recoil:.012,pellets:1,zoom:68,headMult:1.85,penetration:.45};
export const WEAPONS = [
  {...base,id:'vx4',name:'VX-4',category:'ASSAULT RIFLE',mode:'auto',damage:29,rpm:780,mag:30,reload:1.72,range:38,recoil:.011,sound:'rifle',description:'Fast, balanced 5.56 platform. Controlled recoil. Precise handling.'},
  {...base,id:'kestrel',name:'KESTREL',category:'SUBMACHINE GUN',mode:'auto',damage:23,rpm:960,mag:32,reload:1.43,ads:.115,move:1.08,range:19,spread:.011,recoil:.008,zoom:72,penetration:.24,sound:'smg',description:'Compact 9 mm. Exceptional mobility and close-range fire rate.'},
  {...base,id:'drake',name:'DRAKE 556',category:'BURST RIFLE',mode:'burst',damage:33,rpm:1000,mag:30,reload:1.88,ads:.19,burst:3,burstDelay:.23,range:46,recoil:.010,adsSpread:.00065,zoom:64,sound:'burst',description:'Three-round bursts. Clean sight picture. Built for midrange duels.'},
  {...base,id:'mastiff',name:'MASTIFF 12',category:'SHOTGUN',mode:'semi',damage:17,rpm:135,mag:7,reserve:49,reload:2.35,ads:.21,move:.95,range:13,falloff:.2,spread:.043,adsSpread:.030,recoil:.040,pellets:8,zoom:72,headMult:1.3,penetration:.15,sound:'shotgun',description:'Eight-pellet buckshot. Devastating inside twelve meters.'},
  {...base,id:'specter',name:'SPECTER',category:'SNIPER RIFLE',mode:'bolt',damage:88,rpm:62,mag:5,reserve:35,reload:2.5,ads:.31,move:.87,range:100,falloff:.8,spread:.035,adsSpread:.00015,recoil:.047,zoom:25,headMult:2.2,penetration:.85,sound:'sniper',description:'Bolt-action .308. One clean headshot. High-velocity precision.'},
  {...base,id:'viper',name:'VIPER .45',category:'PISTOL',mode:'semi',damage:35,rpm:420,mag:12,reserve:72,reload:1.2,ads:.1,move:1.13,range:22,spread:.012,adsSpread:.002,recoil:.017,zoom:74,penetration:.25,sound:'pistol',description:'Quick-draw sidearm. Compact, accurate and surprisingly lethal.'},
  {...base,id:'atlas',name:'ATLAS 762',category:'LIGHT MACHINE GUN',mode:'auto',damage:34,rpm:650,mag:75,reserve:225,reload:3.45,ads:.27,move:.85,range:52,recoil:.016,spread:.013,adsSpread:.0016,zoom:64,penetration:.68,sound:'lmg',description:'Sustained 7.62 fire. Large belt box. Heavy, deliberate handling.'},
  {...base,id:'s9',name:'SABLE S9',category:'SUPPRESSED SMG',mode:'auto',damage:25,rpm:840,mag:30,reload:1.55,ads:.12,move:1.06,range:23,spread:.010,recoil:.0075,zoom:72,penetration:.28,sound:'suppressed',suppressed:true,description:'Integrated suppressor. Smooth recoil and rapid target transitions.'},
  {...base,id:'talon',name:'TALON',category:'MELEE',mode:'melee',damage:110,rpm:100,mag:1,reserve:0,reload:0,ads:.08,move:1.2,range:2.3,falloff:1,spread:0,adsSpread:0,recoil:0,zoom:80,headMult:1,penetration:0,sound:'knife',description:'Carbon-steel combat knife. Maximum mobility. Immediate close-range takedowns.'}
];
export const WEAPON_BY_ID = Object.fromEntries(WEAPONS.map(w=>[w.id,w]));
export function getWeaponStats(id,options={}) {
  const w={...(WEAPON_BY_ID[id]||WEAPONS[0])};
  if(w.mode==='melee')return w;
  const attachments=Array.isArray(options.attachments)?options.attachments:[options.attachment];
  if(attachments.includes('extended')) {w.mag=Math.ceil(w.mag*1.5);w.reload*=1.12;w.move*=.97;}
  if(attachments.includes('suppressor')) {w.suppressed=true;w.range*=.85;}
  if(attachments.includes('foregrip')) w.recoil*=.72;
  if(attachments.includes('laser')) w.spread*=.65;
  if(options.optic==='scope'&&id!=='specter') {w.zoom=44;w.ads*=1.12;}
  return w;
}

const clamp=THREE.MathUtils.clamp;
const smooth=(v)=>v*v*(3-2*v);
function steelTexture(color='#888888',rough=false) {
  if(typeof document==='undefined') return null;
  const c=document.createElement('canvas');c.width=c.height=128;
  const ctx=c.getContext('2d');ctx.fillStyle=color;ctx.fillRect(0,0,128,128);
  let seed=9317;const rnd=()=>{seed=(Math.imul(seed,1664525)+1013904223)|0;return (seed>>>0)/4294967296;};
  for(let i=0;i<2200;i++){let v=rough?100+rnd()*120:90+rnd()*150;ctx.fillStyle=`rgba(${v},${v},${v},${rough?.14:.06})`;ctx.fillRect(rnd()*128,rnd()*128,rnd()*9+1,.5);}
  for(let i=0;i<50;i++){ctx.strokeStyle=`rgba(215,220,212,${rnd()*.1})`;ctx.lineWidth=.35;ctx.beginPath();ctx.moveTo(rnd()*128,rnd()*128);ctx.lineTo(rnd()*128,rnd()*128);ctx.stroke();}
  const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;return t;
}
function labelTexture(text,color='#a9b1a5') {
  const c=document.createElement('canvas');c.width=512;c.height=128;const ctx=c.getContext('2d');ctx.clearRect(0,0,512,128);ctx.font='bold 52px monospace';ctx.fillStyle=color;ctx.fillText(text,10,58);ctx.font='18px monospace';ctx.fillStyle='#758074';ctx.fillText('OVERRUN  /  A-017     FIELD ISSUE',12,92);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;
}

export function createViewWeapon(weaponId,options={}) {
  const w=WEAPON_BY_ID[weaponId]||WEAPONS[0], group=new THREE.Group(), rig=new THREE.Group();group.add(rig);
  group.name=`weapon-${w.id}`;
  const ownedGeometries=new Set(),ownedMaterials=new Set(),ownedTextures=new Set();
  const tex=steelTexture('#a0a198'),roughTex=steelTexture('#a0a0a0',true);if(tex)ownedTextures.add(tex);if(roughTex)ownedTextures.add(roughTex);
  const skins={graphite:0x454c49,sand:0x9a8e6d,olive:0x586253,arctic:0x9ea8a4,oxide:0x704c3d};const skinColor=skins[options.skin]||skins.graphite;
  function mat(color,metalness=.6,roughness=.53,extra={}) {const m=new THREE.MeshStandardMaterial({color,metalness,roughness,map:tex,roughnessMap:roughTex,...extra});ownedMaterials.add(m);return m;}
  const m={metal:mat(skinColor,.7,.44),dark:mat(0x151b1c,.6,.44),edge:mat(0x8c9692,.8,.36),rubber:mat(0x222a29,.05,.9),steel:mat(0x6c7675,.85,.28),black:mat(0x080e0e,.4,.5),tan:mat(0x7f816c,.05,.91),glove:mat(0x393e36,.02,.95),glove2:mat(0x252c27,.02,.96),sleeve:mat(0x5a6353,.02,.95),stitch:mat(0x8f9782,.04,.9),skin:mat(0x9f8269,.02,.91),brass:mat(0xc6a05c,.8,.32),accent:mat(0xc3d769,.2,.45),red:mat(0xff431d,.05,.3,{emissive:0xff2a12,emissiveIntensity:3})};
  const operator=options.operator||'ranger';
  if(operator==='ghost'){m.sleeve.color.setHex(0x303a3b);m.glove.color.setHex(0x252d2e);m.glove2.color.setHex(0x171e20);}
  if(operator==='sand'){m.sleeve.color.setHex(0x9b8d70);m.glove.color.setHex(0x776f58);m.glove2.color.setHex(0x585741);}
  function mesh(g,material,parent=rig){ownedGeometries.add(g);const o=new THREE.Mesh(g,material);parent.add(o);o.frustumCulled=false;return o;}
  function box(x,y,z,sx,sy,sz,material=m.metal,parent=rig){const o=mesh(new THREE.BoxGeometry(sx,sy,sz),material,parent);o.position.set(x,y,z);return o;}
  function cylinder(x,y,z,r,l,material=m.dark,parent=rig,axis='z',segments=12){const o=mesh(new THREE.CylinderGeometry(r,r,l,segments),material,parent);if(axis==='z')o.rotation.x=Math.PI/2;else if(axis==='x')o.rotation.z=Math.PI/2;o.position.set(x,y,z);return o;}
  function capsuleBetween(a,b,r,material,parent=rig){const aa=new THREE.Vector3(...a),bb=new THREE.Vector3(...b),len=aa.distanceTo(bb);const o=mesh(new THREE.CapsuleGeometry(r,Math.max(.002,len-2*r),3,8),material,parent);o.position.copy(aa).add(bb).multiplyScalar(.5);o.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),bb.sub(aa).normalize());return o;}
  function profile(points,width,material=m.metal,parent=rig,bevel=.003){const shape=new THREE.Shape();points.forEach(([z,y],i)=>i?shape.lineTo(-z,y):shape.moveTo(-z,y));shape.closePath();const g=new THREE.ExtrudeGeometry(shape,{depth:width,steps:1,bevelEnabled:bevel>0,bevelThickness:bevel,bevelSize:bevel,bevelSegments:1});g.translate(0,0,-width/2);g.rotateY(Math.PI/2);return mesh(g,material,parent);}
  function torus(x,y,z,r,t,material=m.dark,parent=rig){const o=mesh(new THREE.TorusGeometry(r,t,6,20),material,parent);o.position.set(x,y,z);return o;}
  function rail(z0,z1,y,width=.062,parent=rig){box(0,y,z0+(z1-z0)*.5,width,.012,Math.abs(z1-z0),m.dark,parent);for(let z=z0;z>z1;z-=.028)box(0,y+.011,z,width+.008,.012,.010,m.metal,parent);}
  function screw(x,y,z,parent=rig){const s=cylinder(x,y,z,.007,.003,m.steel,parent,'x',8);const slot=box(x+(x>0?.002:-.002),y,z,.001,.002,.009,m.dark,parent);return s;}
  function grip(z,y,parent=rig){const g=profile([[z+.035,y+.045],[z-.045,y+.045],[z-.025,y-.12],[z+.04,y-.14],[z+.055,y-.11]],.062,m.rubber,parent,.005);for(let i=0;i<5;i++)box(.032,y-.022*i,z+.006,.004,.004,.06,m.dark,parent);return g;}
  function muzzleBreak(z,r=.021){cylinder(0,.023,z,r,.073,m.dark);for(let i=0;i<3;i++){box(.019,.023,z+i*.017-.018,.008,.027,.007,m.black);box(-.019,.023,z+i*.017-.018,.008,.027,.007,m.black);}cylinder(0,.023,z-.037,r*.64,.002,m.black);}

  let mag=null,bolt=null,pump=null,drum=null,slide=null,cover=null,supportHand=null,supportArm=null;
  let muzzleZ=-.68,sightY=.14,sightZ=-.20;
  const isPistol=w.id==='viper',isKnife=w.id==='talon',isSniper=w.id==='specter',isShot=w.id==='mastiff',isLmg=w.id==='atlas',isSmg=w.id==='kestrel'||w.id==='s9';
  const optic=options.optic||'reflex';
  if(isKnife){
    profile([[-.02,.035],[-.12,.055],[-.42,.075],[-.53,.025],[-.39,-.025],[-.11,-.03],[-.02,-.02]],.013,m.steel,rig,.001);
    profile([[-.05,.026],[-.17,.037],[-.40,.047],[-.49,.024],[-.39,.004],[-.12,.003]],.014,m.edge,rig,0);
    box(0,0,.07,.042,.051,.21,m.metal);for(let z=-.01;z<.17;z+=.024)box(0,0,z,.048,.058,.006,m.dark);
    box(0,0,-.038,.095,.083,.017,m.dark);cylinder(0,0,.174,.032,.018,m.steel);muzzleZ=-.52;sightY=.04;
  }else if(isPistol){
    profile([[.06,.05],[-.22,.05],[-.26,.025],[-.26,-.034],[-.12,-.045],[.04,-.044]],.054,m.metal);
    slide=new THREE.Group();rig.add(slide);profile([[.07,.055],[-.235,.055],[-.245,.025],[-.24,-.005],[.07,-.005]],.06,m.dark,slide);
    box(.031,.024,-.08,.002,.027,.065,m.steel,slide);cylinder(0,.025,-.246,.013,.014,m.black,slide);cylinder(0,.025,-.24,.010,.03,m.steel);
    for(let i=0;i<7;i++)box(.032,.024,.049-i*.009,.002,.037,.003,m.metal,slide);
    profile([[.035,-.025],[-.044,-.025],[-.006,-.19],[.063,-.2],[.076,-.173]],.05,m.rubber);
    for(let i=0;i<8;i++)box(.027,-.065-i*.014,.035+i*.003,.002,.004,.045,m.dark);
    const guard=torus(0,-.07,-.072,.038,.005,m.dark);guard.rotation.y=Math.PI/2;guard.scale.set(.82,1,1);
    mag=new THREE.Group();rig.add(mag);box(0,-.13,.036,.037,.12,.041,m.dark,mag);box(0,-.202,.048,.059,.012,.065,m.rubber,mag);
    box(0,.065,.05,.048,.024,.012,m.dark);box(-.017,.07,.05,.004,.005,.014,m.accent);box(.017,.07,.05,.004,.005,.014,m.accent);box(0,.067,-.21,.006,.016,.018,m.dark);box(0,.077,-.21,.003,.005,.006,m.accent);
    muzzleZ=-.258;sightY=.077;sightZ=-.16;
  }else{
    const length=isSniper?.94:isLmg?.86:isShot?.83:w.id==='s9'?.72:isSmg?.58:.76;
    muzzleZ=-length;
    if(isSniper){
      profile([[.24,-.025],[.20,.028],[-.40,.028],[-.48,-.025],[-.44,-.08],[-.08,-.08],[.12,-.05]],.09,m.metal);
      cylinder(0,.042,-.20,.034,.39,m.dark);cylinder(0,.034,-.65,.017,.59,m.steel);muzzleBreak(-.94,.025);
      profile([[.23,-.02],[.47,-.015],[.49,-.14],[.39,-.17],[.25,-.10],[.10,-.09]],.075,m.dark);
      box(0,-.092,.476,.087,.16,.026,m.rubber);box(0,.015,.34,.064,.06,.16,m.metal);grip(.10,-.07);
      mag=new THREE.Group();rig.add(mag);box(0,-.12,-.10,.061,.13,.13,m.dark,mag);box(0,-.181,-.10,.067,.011,.14,m.metal,mag);
      bolt=new THREE.Group();bolt.position.set(.04,.044,.025);rig.add(bolt);capsuleBetween([0,0,0],[.065,-.035,0],.008,m.steel,bolt);cylinder(.067,-.04,0,.015,.028,m.dark,bolt,'x');
      rail(.07,-.33,.09,.075);sightY=.168;sightZ=-.18;
      // Folding bipod and receiver side fluting.
      for(let side of [-1,1]){capsuleBetween([side*.042,-.05,-.45],[side*.061,-.08,-.19],.009,m.dark);for(let i=0;i<6;i++)box(side*.049,-.005,-.18-i*.037,.004,.014,.018,m.black);}
    }else if(isShot){
      cylinder(0,.04,-.31,.036,.48,m.dark);profile([[.20,.073],[-.24,.073],[-.28,.034],[-.24,-.059],[.15,-.059]],.078,m.metal);
      cylinder(0,.04,-.57,.022,.57,m.steel);cylinder(0,-.024,-.5,.021,.42,m.dark);muzzleBreak(-.84,.024);
      profile([[.19,-.04],[.40,-.01],[.47,-.045],[.47,-.17],[.37,-.16],[.20,-.10]],.07,m.metal);box(0,-.102,.474,.08,.14,.026,m.rubber);grip(.14,-.045);
      pump=new THREE.Group();rig.add(pump);cylinder(0,-.012,-.41,.042,.24,m.rubber,pump);for(let i=0;i<10;i++)cylinder(0,-.012,-.31-i*.022,.044,.007,m.dark,pump);
      mag=new THREE.Group();rig.add(mag);cylinder(0,-.027,-.24,.017,.10,m.brass,mag);cylinder(0,-.027,-.203,.018,.026,m.dark,mag);
      rail(.14,-.18,.094);sightY=.15;
    }else if(isLmg){
      profile([[.19,.077],[-.31,.077],[-.34,.01],[-.29,-.07],[.15,-.07]],.12,m.metal);
      cylinder(0,.023,-.62,.025,.55,m.steel);cylinder(0,.023,-.47,.052,.22,m.dark);
      for(let j=0;j<7;j++)cylinder(0,.023,-.38-j*.03,.056,.010,m.metal);muzzleBreak(-.87,.032);
      profile([[.16,.03],[.40,.00],[.46,-.035],[.46,-.155],[.36,-.14],[.19,-.095]],.085,m.dark);box(0,-.082,.468,.097,.16,.025,m.rubber);grip(.11,-.057);
      mag=new THREE.Group();rig.add(mag);box(0,-.18,-.11,.148,.21,.18,m.dark,mag);box(0,-.18,-.11,.152,.16,.184,m.tan,mag);for(let i=0;i<4;i++)box(.078,-.125-i*.038,-.11,.004,.012,.17,m.rubber,mag);
      for(let j=0;j<6;j++){cylinder(.05+j*.016,-.004,-.12,.007,.057,m.brass,mag);box(.053+j*.016,-.006,-.1,.007,.014,.015,m.dark,mag);}
      cover=new THREE.Group();cover.position.set(0,.07,-.27);rig.add(cover);box(0,.014,.16,.109,.023,.32,m.dark,cover);rail(.16,-.17,.024,.082,cover);
      for(let side of [-1,1])capsuleBetween([side*.044,-.015,-.48],[side*.08,-.06,-.26],.009,m.dark);
      sightY=.17;
    }else{
      const forward=isSmg?-.32:-.43;
      profile([[.16,.06],[-.20,.06],[-.25,.025],[-.21,-.057],[.12,-.057],[.17,-.015]],.081,m.metal);
      // Forged lower receiver contour and charging assembly.
      profile([[.14,-.04],[-.17,-.04],[-.14,-.095],[.04,-.10],[.095,-.065],[.14,-.065]],.071,m.metal);
      box(.043,.008,-.047,.006,.035,.10,m.dark);box(.047,.01,-.035,.005,.023,.066,m.steel);box(.049,.012,-.039,.003,.018,.060,m.black);
      cylinder(0,.02,-.43,.016,isSmg?.30:.53,m.steel);cylinder(0,.02,-.25,.035,.10,m.dark);
      const handguard=profile([[-.20,.067],[forward,.067],[forward-.02,.033],[forward,-.043],[-.20,-.043]],.086,m.metal);
      // Ventilation slots, longitudinal rails, end cap and fasteners.
      for(let side of [-1,1]){for(let i=0;i<(isSmg?4:7);i++){const z=-.235-i*.027;box(side*.045,.026,z,.004,.015,.016,m.black);box(side*.045,-.014,z,.004,.012,.017,m.dark);}box(side*.048,-.047,(forward-.20)*.5,.010,.012,Math.abs(forward+.20),m.dark);screw(side*.047,.047,-.216);screw(side*.047,-.029,forward+.03);}
      rail(.14,forward,.075);grip(.075,-.07);
      const trigger=torus(0,-.11,-.024,.041,.005,m.dark);trigger.rotation.y=Math.PI/2;trigger.scale.set(.8,1,1);profile([[-.027,-.065],[-.034,-.067],[-.027,-.105],[-.015,-.113],[-.012,-.105]],.007,m.steel);
      cylinder(0,.025,.20,.023,.18,m.dark);
      profile([[.20,.050],[.40,.046],[.43,.018],[.43,-.11],[.34,-.13],[.22,-.076]],.066,m.rubber);box(0,-.03,.431,.078,.165,.023,m.dark);box(0,.057,.30,.058,.025,.18,m.metal);box(0,-.075,.28,.068,.014,.10,m.dark);
      mag=new THREE.Group();rig.add(mag);
      if(isSmg){profile([[-.08,-.055],[-.14,-.055],[-.15,-.26],[-.08,-.28],[-.067,-.24]],.039,m.dark,mag);for(let j=0;j<7;j++)box(.021,-.105-j*.021,-.112,.004,.008,.04,m.metal,mag);}
      else{profile([[-.07,-.065],[-.168,-.065],[-.177,-.18],[-.154,-.26],[-.075,-.25],[-.055,-.18]],.056,m.dark,mag);for(let side of [-1,1])for(let j=0;j<3;j++)box(side*.029,-.16,-.079-j*.027,.004,.14,.009,m.metal,mag);box(0,-.258,-.113,.064,.014,.09,m.rubber,mag);}
      if(w.id==='s9'){cylinder(0,.023,-.65,.033,.19,m.dark);for(let j=0;j<6;j++)cylinder(0,.023,-.58-j*.022,.034,.006,m.metal);cylinder(0,.023,-.748,.020,.002,m.black);muzzleZ=-.75;}
      else {muzzleBreak(length>0?-length:-.7,isSmg?.022:.024);}
      bolt=box(.047,.035,.09,.018,.015,.07,m.dark);
      for(const z of [.05,.12,-.13])screw(.043,-.02,z);
      if(w.id==='drake'){box(.048,.025,-.15,.009,.016,.07,m.accent);box(-.048,.025,-.15,.009,.016,.07,m.accent);}
      sightY=.154;
    }
    // Rear sling ring; receiver markings and small serial stamp.
    torus(.04,-.033,.18,.014,.003,m.steel).rotation.y=Math.PI/2;
    if(typeof document!=='undefined'){const t=labelTexture(w.name);ownedTextures.add(t);const lm=new THREE.MeshBasicMaterial({map:t,transparent:true,depthWrite:false,side:THREE.DoubleSide});ownedMaterials.add(lm);const label=mesh(new THREE.PlaneGeometry(.14,.035),lm);label.rotation.y=Math.PI/2;label.position.set(isLmg?.062:.044,-.014,.026);}
    // Optical sight, actual sight center is returned for the host's ADS transform.
    if(isSniper||optic==='scope'){
      sightY=isSniper?.168:.164;sightZ=-.17;
      cylinder(0,sightY,-.19,.033,.27,m.dark);cylinder(0,sightY,-.35,.047,.08,m.dark);cylinder(0,sightY,-.055,.041,.07,m.rubber);
      for(const z of [-.09,-.27]){box(0,.11,z,.052,.06,.026,m.dark);torus(0,sightY,z,.036,.005,m.metal);}
      cylinder(0,sightY+.036,-.19,.017,.031,m.dark,rig,'y');cylinder(.038,sightY,-.19,.014,.027,m.dark,rig,'x');
      const glass=mat(0x3b655d,.85,.12,{transparent:true,opacity:.7});cylinder(0,sightY,-.392,.041,.002,glass);cylinder(0,sightY,-.018,.034,.002,m.black);
      for(let i=0;i<10;i++)cylinder(0,sightY,-.04-i*.003,.042,.0015,m.metal);
    }else if(optic==='iron'){
      sightY=.133;sightZ=-.17;box(0,.093,.105,.056,.025,.027,m.dark);for(let s of [-1,1])box(s*.019,.119,.105,.009,.034,.019,m.dark);
      box(0,.101,-.42,.046,.025,.025,m.dark);for(let s of [-1,1])box(s*.018,.119,-.42,.006,.032,.016,m.dark);box(0,.121,-.42,.004,.029,.007,m.steel);box(0,.133,-.42,.003,.004,.005,m.accent);
    }else if(optic==='holo'){
      sightY=.155;sightZ=-.17;box(0,.100,-.17,.080,.027,.103,m.dark);box(-.040,.154,-.17,.012,.094,.072,m.dark);box(.040,.154,-.17,.012,.094,.072,m.dark);box(0,.202,-.17,.080,.012,.072,m.dark);
      const gl=mat(0x5b8b86,.3,.12,{transparent:true,opacity:.12,depthWrite:false});box(0,.158,-.17,.065,.074,.002,gl);
      const dot=mesh(new THREE.CircleGeometry(.0019,12),new THREE.MeshBasicMaterial({color:0xff4327,toneMapped:false,depthTest:false}));ownedMaterials.add(dot.material);dot.position.set(0,sightY,-.132);const ring=torus(0,sightY,-.132,.012,.0006,m.red);ring.name='reticle';
    }else{
      sightY=.151;sightZ=-.17;box(0,.103,-.17,.058,.026,.075,m.dark);profile([[-.207,.112],[-.215,.149],[-.20,.181],[-.145,.181],[-.13,.15],[-.14,.112]],.006,m.dark).position.x=-.031;profile([[-.207,.112],[-.215,.149],[-.20,.181],[-.145,.181],[-.13,.15],[-.14,.112]],.006,m.dark).position.x=.031;box(0,.181,-.176,.068,.008,.06,m.dark);
      const gl=mat(0x639b8e,.2,.12,{transparent:true,opacity:.10,depthWrite:false});box(0,.15,-.17,.057,.057,.002,gl);
      const dot=mesh(new THREE.CircleGeometry(.0017,12),new THREE.MeshBasicMaterial({color:0xff542f,toneMapped:false,depthTest:false}));ownedMaterials.add(dot.material);dot.position.set(0,sightY,-.132);dot.name='reticle';
      screw(.036,.11,-.166);screw(-.036,.11,-.166);
    }
  }

  if(isPistol&&optic!=='iron'){
    sightY=optic==='scope'?.135:.112;sightZ=-.04;
    box(0,.073,-.04,.055,.019,.07,m.dark);
    if(optic==='scope'){
      cylinder(0,sightY,-.07,.028,.18,m.dark);cylinder(0,sightY,-.165,.034,.035,m.dark);cylinder(0,sightY,.03,.032,.025,m.rubber);box(0,.10,-.08,.04,.04,.02,m.dark);
      cylinder(0,sightY,.044,.025,.002,m.black);cylinder(0,sightY,-.184,.028,.002,m.steel);
    }else{
      box(-.028,.114,-.04,.008,.065,.04,m.dark);box(.028,.114,-.04,.008,.065,.04,m.dark);box(0,.146,-.04,.06,.007,.04,m.dark);
      const dotMat=new THREE.MeshBasicMaterial({color:0xff542f,toneMapped:false,depthTest:false});ownedMaterials.add(dotMat);const dot=mesh(new THREE.CircleGeometry(.0016,12),dotMat);dot.position.set(0,sightY,-.019);
      if(optic==='holo')torus(0,sightY,-.019,.01,.0006,m.red);
    }
  }
  const attachment=options.attachment||'none';
  if(attachment==='suppressor'&&!isKnife&&w.id!=='s9'){cylinder(0,.023,muzzleZ-.055,.035,.145,m.dark);for(let j=0;j<5;j++)cylinder(0,.023,muzzleZ-.02-j*.024,.0355,.005,m.metal);muzzleZ-=.129;}
  if(attachment==='foregrip'&&!isPistol&&!isKnife){grip(-.31,-.085);box(0,-.07,-.31,.055,.035,.071,m.dark);}
  if(attachment==='laser'&&!isKnife){const z=isPistol?-.16:-.31;box(.058,.01,z,.04,.037,.085,m.dark);cylinder(.058,.01,z-.045,.009,.006,m.red);}
  if(attachment==='extended'&&mag)mag.scale.y=1.18;

  // Anatomical hands: gloves have palm, articulated fingers, thumb and knuckle pads.
  function hand(pos,side=1,parent=rig){const h=new THREE.Group();h.position.set(...pos);parent.add(h);
    const palm=box(0,0,0,.071,.048,.083,m.glove,h);palm.rotation.z=side*.10;
    for(let i=0;i<4;i++){const xx=(i-1.5)*.016;capsuleBetween([xx,.006,-.027],[xx,.015,-.073],.009,m.glove,h);capsuleBetween([xx,.015,-.073],[xx,-.016,-.087],.008,m.glove2,h);box(xx,.028,-.034,.012,.008,.026,m.glove2,h);}
    capsuleBetween([side*.032,0,.005],[side*.052,.002,-.029],.012,m.glove,h);capsuleBetween([side*.052,.002,-.029],[side*.034,-.012,-.054],.010,m.glove2,h);
    box(0,.027,.007,.055,.007,.029,m.glove2,h);for(let i=0;i<3;i++)box((i-1)*.017,.032,.005,.002,.001,.018,m.stitch,h);return h;}
  function arm(start,end,parent=rig){const g=new THREE.Group();parent.add(g);capsuleBetween(start,end,.047,m.sleeve,g);const e=new THREE.Vector3(...end),s=new THREE.Vector3(...start),dir=s.sub(e).normalize();const cuff=cylinder(...e.clone().addScaledVector(dir,.035).toArray(),.051,.051,m.glove2,g,'y');cuff.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),dir);return g;}
  let triggerHand;
  if(isKnife){triggerHand=hand([.015,-.026,.08],1);triggerHand.rotation.x=-.45;arm([.17,-.34,.48],[.025,-.05,.13]);supportHand=hand([-.18,-.08,-.12],-1);supportHand.rotation.y=.38;arm([-.26,-.31,.37],[-.18,-.09,-.08]);}
  else{
    triggerHand=hand([.023,isPistol?-.082:-.114,isPistol?.053:.091],1);triggerHand.rotation.set(-.74,0,-.10);arm([.18,-.34,.42],[.035,isPistol?-.12:-.15,isPistol?.09:.125]);
    supportHand=hand(isPistol?[-.025,-.106,.018]:[-.014,isShot?-.057:-.072,isSniper?-.39:isSmg?-.27:-.34],-1);supportHand.rotation.set(.25,.1,-.38);
    supportArm=arm([-.25,-.27,.28],isPistol?[-.035,-.14,.049]:[-.053,-.103,isSniper?-.32:isSmg?-.22:-.29]);
  }
  const supportBase=supportHand.position.clone(),supportRot=supportHand.rotation.clone();
  // Muzzle flash has three tapered petals and a short warm point light.
  const flash=new THREE.Group();flash.position.set(0,isKnife?0:.023,muzzleZ-.02);rig.add(flash);const flashMat=new THREE.MeshBasicMaterial({color:0xffd6a0,transparent:true,opacity:.85,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,toneMapped:false});ownedMaterials.add(flashMat);
  for(let j=0;j<3;j++){const shape=new THREE.Shape();shape.moveTo(-.018,0);shape.lineTo(-.035,-.065);shape.lineTo(-.009,-.105);shape.lineTo(0,-.19);shape.lineTo(.012,-.09);shape.lineTo(.037,-.055);shape.lineTo(.018,0);const g=new THREE.ShapeGeometry(shape);g.rotateX(Math.PI/2);const o=mesh(g,flashMat,flash);o.rotation.z=j*Math.PI/3;}
  const flashLight=new THREE.PointLight(0xffbd73,0,2.2,2);flashLight.position.set(0,.08,muzzleZ+.06);rig.add(flashLight);flash.visible=false;
  const sight=new THREE.Vector3(0,sightY,sightZ),muzzle=new THREE.Vector3(0,isKnife?0:.023,muzzleZ);
  let kick=0,flashTime=0,shotAge=9,t=0,disposed=false;const magBase=mag?.position.clone(),boltBase=bolt?.position.clone();
  const anim={tactical:0,sprint:0,slide:0,swayX:0,swayY:0};
  function fire(){shotAge=0;kick=Math.min(1.7,kick+1);flashTime=w.suppressed||attachment==='suppressor'?.015:.045;}
  function update(dt,state={}){
    if(disposed)return;shotAge+=dt;t=state.time??t+dt;const ads=clamp(state.ads||0,0,1),hip=1-ads;
    kick*=Math.exp(-dt*(isSniper?9:isShot?11:18));flashTime-=dt;
    flash.visible=flashTime>0&&!isKnife;flash.scale.setScalar((isSniper?1.25:isPistol?.65:.95)*(w.suppressed||attachment==='suppressor'?.38:1));if(flash.visible)flash.rotation.z=Math.sin(t*170)*3;flashLight.intensity=flash.visible?2.8:0;
    for(const key of ['tactical','sprint','slide'])anim[key]+=((state.movement===key?1:0)-anim[key])*(1-Math.exp(-dt*13));
    anim.swayX+=((clamp(state.yawDelta||0,-.08,.08)*-.3)-anim.swayX)*(1-Math.exp(-dt*18));anim.swayY+=((clamp(state.pitchDelta||0,-.08,.08)*-.3)-anim.swayY)*(1-Math.exp(-dt*18));
    const moving=Math.min(1,(state.speed||0)/7),bob=Math.sin(t*(state.movement==='sprint'||state.movement==='tactical'?17:12))*moving*hip;
    rig.position.set(anim.swayX*hip+Math.sin(t*6)*.0015*hip,bob*.004-anim.slide*.022-anim.sprint*.025,kick*.029+anim.sprint*.065+anim.tactical*.045);
    rig.rotation.set(-kick*(isPistol?.14:.062)+anim.swayY*hip-anim.tactical*.64-anim.sprint*.15,Math.sin(t*8)*moving*.007*hip+anim.tactical*.16,Math.sin(t*6)*moving*.009*hip-anim.slide*.12+anim.tactical*.38+anim.sprint*.11);
    const reload=state.reload??-1;
    if(reload>=0){const p=clamp(reload,0,1),lift=Math.sin(Math.PI*smooth(p));rig.rotation.z-=lift*(isPistol?.36:isLmg?.28:.48);rig.rotation.x+=lift*(isShot?.18:.20);rig.position.x-=lift*.045;rig.position.y-=lift*.045;
      const drop=clamp((p-.14)/.15,0,1)*(1-clamp((p-.64)/.17,0,1));
      if(mag){mag.position.copy(magBase);mag.position.y-=drop*(isLmg?.28:.23);mag.position.x-=drop*.045;mag.rotation.z=-drop*.18;}
      supportHand.position.copy(supportBase);supportHand.position.y-=drop*.18;supportHand.position.z+=lift*.14;supportHand.position.x+=lift*.075;supportHand.rotation.copy(supportRot);supportHand.rotation.x-=lift*.7;
      if(supportArm){supportArm.position.y=-drop*.045;supportArm.rotation.z=drop*.08;}
      if(cover)cover.rotation.x=-Math.sin(Math.PI*p)*1.2;
      if(bolt){bolt.position.copy(boltBase);bolt.position.z+=Math.max(0,Math.sin((p-.75)/.2*Math.PI))*(p>.75&&p<.95?.08:0);}
    }else{
      if(mag){mag.position.copy(magBase);mag.rotation.z=0;}supportHand.position.copy(supportBase);supportHand.rotation.copy(supportRot);if(supportArm){supportArm.position.set(0,0,0);supportArm.rotation.set(0,0,0);}if(cover)cover.rotation.x=0;if(bolt){bolt.position.copy(boltBase);bolt.position.z+=kick*.025;}
    }
    const inspect=state.inspect??-1;if(inspect>=0){const p=clamp(inspect,0,1),lift=Math.sin(Math.PI*p);rig.position.x-=lift*.11;rig.position.y+=lift*.02;rig.rotation.z+=lift*.69;rig.rotation.y+=Math.sin(p*Math.PI*2)*.26;rig.rotation.x+=lift*.17;}
    const equip=state.equip??1;if(equip<1){const k=1-smooth(clamp(equip,0,1));rig.position.y-=k*.38;rig.rotation.x-=k*.7;rig.rotation.z+=k*.22;}
    if(isSniper&&bolt&&reload<0){const cycle=clamp((shotAge-.10)/.55,0,1);bolt.position.copy(boltBase);bolt.position.z+=Math.sin(cycle*Math.PI)*.115;bolt.rotation.z=-Math.sin(cycle*Math.PI)*.9;}
    if(pump)pump.position.z=kick*.10;if(slide)slide.position.z=kick*.042;
    if(isKnife){rig.rotation.y-=kick*1.1;rig.rotation.z-=kick*.7;rig.position.z-=kick*.25;rig.position.x-=kick*.08;}
  }
  // Bake static components by material. Articulated groups remain independent.
  // This retains the model detail without hundreds of per-frame draw calls.
  function batchStatic(parent){
    for(const child of [...parent.children])if(child.isGroup)batchStatic(child);
    const batches=new Map();
    for(const child of [...parent.children]){
      if(!child.isMesh||child===bolt||Array.isArray(child.material))continue;
      const material=child.material;if(!batches.has(material))batches.set(material,[]);batches.get(material).push(child);
    }
    for(const [material,list] of batches){
      if(list.length<2)continue;
      let total=0;const parts=[];
      for(const child of list){child.updateMatrix();const g=child.geometry.index?child.geometry.toNonIndexed():child.geometry.clone();g.applyMatrix4(child.matrix);total+=g.attributes.position.count;parts.push(g);}
      const position=new Float32Array(total*3),normal=new Float32Array(total*3),uv=new Float32Array(total*2);let offset=0;
      for(const part of parts){const n=part.attributes.position.count;position.set(part.attributes.position.array,offset*3);if(part.attributes.normal)normal.set(part.attributes.normal.array,offset*3);if(part.attributes.uv)uv.set(part.attributes.uv.array,offset*2);offset+=n;part.dispose();}
      const merged=new THREE.BufferGeometry();merged.setAttribute('position',new THREE.BufferAttribute(position,3));merged.setAttribute('normal',new THREE.BufferAttribute(normal,3));merged.setAttribute('uv',new THREE.BufferAttribute(uv,2));merged.computeBoundingSphere();
      for(const child of list){parent.remove(child);child.geometry.dispose();ownedGeometries.delete(child.geometry);}mesh(merged,material,parent);
    }
  }
  batchStatic(rig);
  function dispose(){if(disposed)return;disposed=true;for(const g of ownedGeometries)g.dispose();for(const material of ownedMaterials)material.dispose();for(const texture of ownedTextures)texture.dispose();group.removeFromParent();}
  return {group,sight,muzzle,update,fire,dispose,config:w};
}
