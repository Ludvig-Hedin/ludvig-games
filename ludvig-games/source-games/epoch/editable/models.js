/* Original low-poly art kit: shared geometry, hand-built rigs, five eras. */
(function(root){
'use strict';
const T=root.THREE,cache=new Map(),geos={
 box:new T.BoxGeometry(1,1,1),ball:new T.SphereGeometry(1,12,8),rock:new T.IcosahedronGeometry(1,0),round:new T.IcosahedronGeometry(1,1),cylinder:new T.CylinderGeometry(1,1,1,10),cone:new T.ConeGeometry(1,1,9),plane:new T.PlaneGeometry(1,1),torus:new T.TorusGeometry(1,.14,6,16)
};
const team=[0x75b6a3,0xc96d4a],teamDark=[0x32584c,0x823d31],skin=[0xc8996e,0xd7a078,0xae795a],metal=0x949e91,bone=0xe8d6a7,wood=0x6b4d31;
function mat(c,em=0,transparent=false,opacity=1){const k=[c,em,transparent,opacity].join(':');if(!cache.has(k))cache.set(k,new T.MeshStandardMaterial({color:new T.Color(c).convertSRGBToLinear(),roughness:.86,metalness:em?.3:.03,flatShading:true,emissive:new T.Color(em||0).convertSRGBToLinear(),emissiveIntensity:em?.65:0,transparent,opacity}));return cache.get(k);}
function part(parent,shape,c,x=0,y=0,z=0,sx=1,sy=1,sz=1,rz=0,em=0){const m=new T.Mesh(geos[shape],mat(c,em));m.position.set(x,y,z);m.scale.set(sx,sy,sz);m.rotation.z=rz;m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
function group(parent,x=0,y=0,z=0){const g=new T.Group();g.position.set(x,y,z);if(parent)parent.add(g);return g;}
function segment(parent,a,b,r,c){const aa=new T.Vector3(...a),bb=new T.Vector3(...b),d=bb.clone().sub(aa);const m=part(parent,'cylinder',c,...aa.clone().add(bb).multiplyScalar(.5).toArray(),r,d.length(),r);m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),d.normalize());return m;}
function ring(parent,c,x,y,z,r,t=.13,rx=0,ry=0){const m=part(parent,'torus',c,x,y,z,r,r,r);m.rotation.x=rx;m.rotation.y=ry;return m;}
function bevelGeometry(w=1,h=1,d=1,b=.06){const shape=new T.Shape();shape.moveTo(-w/2+b,-h/2);shape.lineTo(w/2-b,-h/2);shape.lineTo(w/2,-h/2+b);shape.lineTo(w/2,h/2-b);shape.lineTo(w/2-b,h/2);shape.lineTo(-w/2+b,h/2);shape.lineTo(-w/2,h/2-b);shape.lineTo(-w/2,-h/2+b);shape.closePath();const geo=new T.ExtrudeGeometry(shape,{depth:d-2*b,bevelEnabled:true,bevelSegments:1,steps:1,bevelSize:b,bevelThickness:b,curveSegments:1});geo.translate(0,0,-(d-2*b)/2);return geo;}
const bevel=bevelGeometry();
function armor(parent,c,x,y,z,sx,sy,sz){const m=new T.Mesh(bevel,mat(c));m.position.set(x,y,z);m.scale.set(sx,sy,sz);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
function humanoid(age,type,side=0){
 const g=new T.Group(),c=team[side],dark=teamDark[side],s=skin[(age+type+side)%skin.length],body=group(g,0,.78,0),legs=[],arms=[];
 const cloth=age===0?0x73533a:age===1?dark:age===2?0x414e46:age===3?0x53634c:0xc5cebf;
 for(const z of [-.17,.17]){const leg=group(body,0,0,z);part(leg,'cylinder',age===0?s:cloth,0,-.29,0,.12,.57,.12);part(leg,'ball',age===0?s:cloth,0,-.04,0,.125,.12,.125);armor(leg,age<2?0x5b4533:age===4?0x3b514a:0x353f33,.1,-.67,.01,.34,.19,.26);if(age===1||age===4)armor(leg,age===1?metal:0xd7dccb,.025,-.39,.005,.24,.25,.27);legs.push(leg);}
 part(body,'cylinder',cloth,0,.34,0,.28,.65,.23);
 if(age===0){part(body,'ball',s,0,.5,0,.34,.39,.28);part(body,'cylinder',0x725238,0,.05,0,.32,.29,.27);part(body,'box',dark,.16,.05,.205,.36,.34,.14,-.18);segment(body,[-.2,.78,.26],[.18,.12,.26],.07,0x66422a);}
 if(age===1){armor(body,metal,.02,.46,0,.52,.59,.45);part(body,'box',c,.07,.14,.24,.42,.55,.045);part(body,'box',0xdac496,.07,.21,.269,.06,.37,.022);part(body,'box',0xdac496,.07,.25,.271,.28,.06,.022);}
 if(age===2){part(body,'box',c,0,.38,.23,.38,.61,.06);for(let i=0;i<4;i++)part(body,'ball',bone,.11,.62-i*.12,.27,.025,.025,.025);part(body,'box',0xbabbaa,.1,.36,.268,.04,.7,.025,-.27);}
 if(age===3){armor(body,0x344a3a,.02,.46,0,.58,.59,.5);for(let i=0;i<3;i++)armor(body,0x78826a,-.15+i*.16,.36,.29,.13,.23,.11);armor(body,0x465d44,-.27,.45,0,.22,.51,.46);part(body,'box',c,.04,.64,.28,.19,.08,.06);}
 if(age===4){armor(body,0xd1d5c7,.02,.45,0,.63,.59,.53);armor(body,0x354c46,.14,.34,.28,.36,.35,.07);part(body,'box',c,.15,.49,.325,.27,.075,.035,0,c);part(body,'box',c,.15,.3,.325,.10,.045,.035,0,c);}
 part(body,'cylinder',0x4f4532,0,.04,0,.29,.09,.25);part(body,'box',0xb5a370,.28,.04,.05,.065,.08,.085);
 for(const z of [-.34,.34]){const arm=group(body,0,.63,z),front=z>0;part(arm,'ball',age===0?s:age===1?metal:cloth,0,0,0,.18,.18,.17);part(arm,'cylinder',age===0?s:cloth,0,-.24,0,.102,.46,.1);part(arm,'ball',age===4?0x33473d:s,0,-.48,0,.11,.14,.10);if(age===1||age===4)armor(arm,age===1?metal:0xcbd2c3,.018,-.24,.01,.22,.22,.24);arm.rotation.z=front?.36:-.12;arms.push(arm);}
 const head=group(body,.015,1.04,0);part(head,'ball',age===4?0x647367:s,0,0,0,.265,.29,.25);part(head,'ball',s,.238,-.015,0,.105,.087,.115);
 for(const z of [-.211,.211]){part(head,'ball',0x1f2b21,.146,.045,z,.035,.038,.017);part(head,'box',0x40392d,.115,.121,z,.11,.035,.034,-.13);}
 if(age===0){part(head,'ball',0x463629,-.02,.21,0,.285,.16,.263);part(head,'ball',0x53402b,.13,-.15,0,.22,.14,.23);for(let i=0;i<4;i++)part(head,'cone',0x463629,-.16+i*.09,.31,0,.092,.22,.16,-.25);part(head,'box',c,.04,.18,.245,.29,.075,.04);}
 if(age===1){part(head,'ball',metal,-.04,.15,0,.295,.23,.281);part(head,'box',0xc0c3b1,.2,.035,.23,.1,.22,.048);part(head,'box',0x3d493d,.215,.053,.259,.095,.035,.019);part(head,'cone',c,-.09,.50,0,.10,.48,.10,-.24);if(type===0){const shield=group(arms[0],.17,-.30,-.07);armor(shield,dark,0,0,0,.49,.65,.11);part(shield,'box',bone,0,0,-.065,.065,.51,.04);part(shield,'box',bone,0,.03,-.065,.35,.065,.04);}}
 if(age===2){part(head,'cylinder',0x303d31,0,.29,0,.31,.20,.29);part(head,'box',0x2d382c,.055,.20,0,.72,.07,.59);part(head,'box',c,0,.29,.28,.33,.10,.025);part(head,'cone',bone,-.12,.55,.03,.048,.34,.06,-.3);part(head,'ball',0x554335,.17,-.15,0,.16,.09,.15);}
 if(age===3){part(head,'ball',0x465a42,-.015,.15,0,.295,.22,.28);part(head,'cylinder',0x63795a,-.005,.075,0,.31,.055,.285);part(head,'box',c,.10,.21,.26,.12,.065,.035);part(head,'box',0x3b5041,-.08,.02,.262,.14,.18,.08);segment(head,[.15,-.16,.2],[-.2,.15,.21],.018,0x354b33);}
 if(age===4){part(head,'ball',0xced6c9,0,.08,0,.307,.3,.275);armor(head,0x203e36,.246,.05,0,.12,.19,.43);part(head,'box',c,.313,.054,0,.015,.085,.34,0,c);part(head,'box',0x4f6358,-.245,.06,.18,.12,.27,.12);}
 const weapon=group(arms[1],0,-.48,0);
 if(type===0&&age===0){part(weapon,'cylinder',0x64472c,.025,.26,.02,.064,.72,.064,-.14);part(weapon,'rock',0x8b8267,.07,.65,.02,.20,.29,.19);segment(weapon,[-.08,.58,.18],[.12,.69,-.16],.035,0xbba47b);}
 else if(type===0&&age===1){part(weapon,'box',0x524131,0,.04,0,.09,.22,.10);part(weapon,'box',0xc8bb8e,0,.2,0,.36,.06,.10);part(weapon,'box',0xc8d2c7,0,.65,0,.085,.86,.057);part(weapon,'cone',0xdde0cc,0,1.14,0,.052,.20,.043);}
 else if((age===0&&type===1)||(age===2&&type===0)){part(weapon,'cylinder',wood,.4,.25,0,.035,2.03,.035,-Math.PI/2+.14);part(weapon,'cone',age===0?bone:metal,1.48,.40,0,.12,.40,.035,-Math.PI/2+.14);if(age===2)part(weapon,'box',metal,1.34,.56,0,.31,.35,.08,-.3);}
 else if(age===1&&type===1){const pts=[];for(let i=0;i<9;i++){const a=-1.15+i/8*2.3;pts.push(new T.Vector3(.20+Math.cos(a)*.27,.26+Math.sin(a)*.77,0));}const curve=new T.CatmullRomCurve3(pts);const bow=new T.Mesh(new T.TubeGeometry(curve,12,.037,5,false),mat(0x98683d));weapon.add(bow);segment(weapon,[.31,-.43,0],[.31,.95,0],.009,bone);segment(weapon,[-.15,.25,0],[.85,.25,0],.017,bone);}
 else if(age===2&&type===1){armor(weapon,wood,.15,.23,0,.56,.14,.12);part(weapon,'cylinder',0x434d45,.63,.27,0,.045,1.0,.045,-Math.PI/2);part(weapon,'box',0xc0bfab,.14,.32,0,.18,.095,.11);part(weapon,'cone',metal,1.25,.27,0,.038,.26,.035,-Math.PI/2);}
 else if(age===3&&type===1){part(weapon,'cylinder',0x47573e,.45,.32,0,.14,1.45,.14,-Math.PI/2);ring(weapon,0x8d9779,1.18,.32,0,.13,.13,0,Math.PI/2);part(weapon,'cone',0xb5b995,1.27,.32,0,.145,.28,.145,-Math.PI/2);part(weapon,'box',0x252e23,.04,.09,0,.13,.27,.12);}
 else {const gun=age===4?0x395b52:0x28392d;armor(weapon,gun,.26,.2,0,.73,.22,.16);part(weapon,'box',age===4?0xd2dbcb:0x6c7a58,.12,.11,0,.32,.25,.21,-.18);part(weapon,'cylinder',gun,.74,.22,0,.037,.40,.037,-Math.PI/2);part(weapon,'box',age===4?c:0x71816a,.34,.29,.1,.38,.045,.035,0,age===4?c:0);if(age===4)ring(weapon,c,.87,.22,0,.09,.13,0,Math.PI/2);}
 g.userData.anim={kind:'human',body,legs,arms,head,weapon,type,age};return g;
}
function heavyUnit(age,side){
 const g=new T.Group(),c=team[side],dark=teamDark[side],legs=[],wheels=[];let rider=null,turret=null;
 if(age<2){
  const mammoth=age===0,fur=mammoth?0x75533a:0xa28761;
  part(g,'round',fur,-.08,1.12,0,mammoth?1.05:.83,mammoth?.73:.48,mammoth?.59:.37);
  for(const x of [-.65,.55])for(const z of [-.40,.40]){const leg=group(g,x,.84,z*(mammoth?1:.75));part(leg,'cylinder',fur,0,-.32,0,mammoth?.17:.09,.69,mammoth?.18:.09);part(leg,'round',mammoth?0x4f402e:0x423a2e,.08,-.73,0,mammoth?.21:.14,.14,mammoth?.22:.13);legs.push(leg);}
  if(mammoth){part(g,'round',0x816047,.81,1.48,0,.59,.62,.51);for(const z of [-.52,.52]){part(g,'ball',0x94694e,.62,1.43,z,.31,.40,.10);part(g,'ball',0x292a20,1.02,1.69,z*.77,.053,.05,.03);const a=[1.04,.93,z*.6],b=[1.47,.66,z*.77],d=[1.80,.91,z*.88];segment(g,a,b,.095,bone);segment(g,b,d,.06,bone);part(g,'cone',bone,1.84,1.02,z*.88,.054,.25,.051,-.15);}
   const trunk=[[1.25,1.28,0],[1.48,.89,0],[1.48,.45,0],[1.67,.31,0],[1.88,.45,0]];for(let i=0;i<trunk.length-1;i++)segment(g,trunk[i],trunk[i+1],.15-i*.025,0x816047);
   for(let i=0;i<8;i++)part(g,'cone',0x685039,-.85+i*.22,1.70,0,.13,.32,.39,.2);
  }else{part(g,'round',fur,.68,1.55,0,.33,.63,.33,-.39);part(g,'round',fur,1.01,1.86,0,.47,.26,.29);part(g,'round',0x66533d,1.35,1.82,0,.19,.21,.25);for(const z of [-.16,.16]){part(g,'cone',fur,.77,2.25,z,.08,.32,.08,-.2);part(g,'ball',0x1b2921,1.09,1.94,z*1.65,.035,.04,.015);}
   part(g,'box',0x514534,.48,1.83,0,.15,.89,.34,.36);segment(g,[-.82,1.31,0],[-1.12,.67,.05],.11,0x49392b);part(g,'box',bone,1.21,1.87,.265,.12,.11,.03);
  }
  part(g,'box',dark,-.17,1.47,0,1.13,.23,mammoth?1.17:.85);part(g,'box',c,-.17,1.22,mammoth?.58:.43,.95,.61,.045);rider=humanoid(age,0,side);rider.scale.setScalar(.67);rider.position.set(-.30,mammoth?1.48:1.39,0);g.add(rider);rider.userData.anim.legs.forEach((l,i)=>l.rotation.z=i?-.85:.85);
  if(age===1){const lance=group(g,0,2.20,.48);part(lance,'cylinder',0x997541,1.2,0,0,.03,2.9,.03,-Math.PI/2);part(lance,'cone',metal,2.75,0,0,.08,.35,.05,-Math.PI/2);part(lance,'box',c,1.85,-.16,0,.42,.27,.018);}
 }else if(age===2){
  part(g,'box',wood,-.10,.61,0,1.5,.26,1.15);for(const z of [-.64,.64]){const w=group(g,-.05,.58,z);const disk=part(w,'cylinder',0x71553a,0,0,0,.59,.13,.59);disk.rotation.x=Math.PI/2;ring(w,0x4c4d38,0,0,0,.57);for(let i=0;i<6;i++)part(w,'box',0xae976c,0,0,.09,.96,.055,.05,i*Math.PI/3);part(w,'cylinder',0x373f30,0,0,.10,.09,.15,.09).rotation.x=Math.PI/2;wheels.push(w);}
  turret=group(g,.17,1.04,0);part(turret,'cylinder',0x454e42,.16,.06,0,.26,1.8,.26,-Math.PI/2+.07);ring(turret,0x9d9771,.88,.12,0,.255,.13,0,Math.PI/2);part(turret,'cylinder',0x222d25,1.08,.13,0,.19,.016,.19,-Math.PI/2);part(turret,'ball',0x52584b,-.75,-.01,0,.28,.27,.27);
  rider=humanoid(2,1,side);rider.scale.setScalar(.7);rider.position.set(-1.02,0,-.25);g.add(rider);part(g,'box',c,-.5,.79,.58,.53,.26,.02);
 }else if(age===3){
  for(const z of [-.59,.59]){armor(g,0x2f3d32,0,.42,z,2.17,.69,.29);for(let i=0;i<6;i++){const w=group(g,-.84+i*.34,.38,z*1.14);const wh=part(w,'cylinder',0x68735a,0,0,0,.235,.09,.235);wh.rotation.x=Math.PI/2;part(w,'box',0x3d4c3d,0,0,.052,.3,.045,.026);wheels.push(w);}for(let i=0;i<11;i++)part(g,'box',0x44513e,-1+i*.20,.71,z,.11,.048,.32);}
  armor(g,0x6c7c5d,0,.77,0,1.91,.47,1.15);armor(g,0x51674e,-.56,1.00,0,.53,.30,1.0);turret=group(g,.06,1.13,0);armor(turret,0x7d8c6b,0,.12,0,1.16,.51,.88);part(turret,'cylinder',0x4d634a,.99,.20,0,.074,1.53,.074,-Math.PI/2);armor(turret,0x4f6349,1.79,.2,0,.22,.17,.18);part(turret,'cylinder',0x455b44,-.15,.43,.0,.22,.08,.22);part(turret,'box',c,.03,.14,.465,.45,.13,.025);segment(g,[-.7,1.1,-.36],[-.77,2.18,-.36],.015,0x3a4e3a);for(const z of [-.51,.51])part(g,'ball',0xe5c277,.96,.79,z,.045,.05,.02,0,0xe6c57c);
 }else{
  const hips=group(g,0,1.57,0);part(hips,'cylinder',0x435a51,0,0,0,.36,.61,.36).rotation.x=Math.PI/2;
  for(const z of [-.51,.51]){const leg=group(g,0,1.52,z);armor(leg,0xbec9b8,-.1,-.31,0,.45,.75,.39);part(leg,'cylinder',0x496253,.0,-.67,.015,.22,.44,.22).rotation.x=Math.PI/2;armor(leg,0xcbd6c4,.17,-.97,.0,.33,.68,.34,-.2);armor(leg,0x435b4c,.34,-1.4,.015,.8,.21,.51);part(leg,'box',c,.36,-1.31,.19,.35,.042,.035,0,c);legs.push(leg);}
  turret=group(g,0,2.1,0);armor(turret,0xc7d2c1,0,.19,0,1.45,.88,1.10);armor(turret,0x3d574c,.75,.28,0,.15,.36,.73);part(turret,'box',c,.846,.3,0,.016,.12,.52,0,c);for(const z of [-.77,.77]){armor(turret,0x4b6859,.07,.04,z,.89,.44,.3);part(turret,'cylinder',0x829789,.69,.03,z,.115,.79,.115,-Math.PI/2);ring(turret,c,1.11,.03,z,.14,.13,0,Math.PI/2);part(turret,'box',c,.03,.29,z,.32,.025,.12,0,c);}part(turret,'cylinder',0x668277,-.75,.30,0,.20,.69,.20);ring(turret,c,-.76,.30,0,.23,.13,Math.PI/2);
 }
 g.userData.anim={kind:age<2?'beast':age===2?'cannon':age===3?'tank':'walker',legs,wheels,rider,turret,age,type:2};return g;
}
// Bake the static pieces of each animated joint into a single colored mesh.
// Geometry is reused by every unit of the same era, class, and team.
const rigGeometryCache=new Map(),rigMaterial=new T.MeshStandardMaterial({color:0xffffff,vertexColors:true,roughness:.86,metalness:.03,flatShading:true});
function batchRig(node,key){
 const children=[...node.children];children.forEach((child,i)=>{if(child.isGroup)batchRig(child,key+'/'+i);});
 const meshes=node.children.filter(o=>o.isMesh&&!o.material.emissiveIntensity);
 if(meshes.length<2)return;
 let geo=rigGeometryCache.get(key);
 if(!geo){const temp=new T.Group();for(const m of meshes){const clone=new T.Mesh(m.geometry,m.material);clone.position.copy(m.position);clone.quaternion.copy(m.quaternion);clone.scale.copy(m.scale);temp.add(clone);}const baked=mergeStatic(temp);geo=baked.geometry;rigGeometryCache.set(key,geo);baked.material.dispose();}
 for(const m of meshes)node.remove(m);
 const out=new T.Mesh(geo,rigMaterial);out.castShadow=true;out.receiveShadow=true;node.add(out);
}
function unit(age,type,side){const g=type===2?heavyUnit(age,side):humanoid(age,type,side);g.userData.age=age;g.userData.type=type;g.userData.side=side;batchRig(g,age+':'+type+':'+side);return g;}
function flag(parent,x,y,z,c,size=1){part(parent,'cylinder',0x665d42,x,y,z,.028,2.15*size,.028);part(parent,'ball',bone,x,y+1.09*size,z,.065,.065,.065);const geo=new T.PlaneGeometry(.78*size,.47*size,9,4),material=mat(c);material.side=T.DoubleSide;const mesh=new T.Mesh(geo,material);mesh.position.set(x+.40*size,y+.64*size,z);mesh.castShadow=true;parent.add(mesh);return mesh;}
function arch(w,h){const sh=new T.Shape();sh.moveTo(-w/2,0);sh.lineTo(-w/2,h-w/2);sh.absarc(0,h-w/2,w/2,Math.PI,0,true);sh.lineTo(w/2,0);sh.closePath();return new T.ShapeGeometry(sh,18);}
function base(age,side){
 const g=new T.Group(),c=team[side],dark=teamDark[side],dir=side===0?1:-1,flags=[],fires=[],spinners=[];
 armor(g,age===0?0x8c8666:age===4?0x879987:0x93987b,0,-.04,0,4.65,.31,3.10);
 if(age===0){
  const hole=new T.Mesh(arch(2.2,2.38),mat(0x26372c));hole.position.set(.13,.0,1.22);g.add(hole);
  part(g,'round',0x928d70,-1.31,1.17,.25,.96,1.66,1.15,.12);part(g,'round',0xaaa07c,1.35,1.03,.15,.88,1.40,1.10,-.13);part(g,'round',0xb5ab83,-.06,2.33,.02,1.74,.98,1.21,.08);part(g,'rock',0xc5b48a,-.51,2.98,.16,.89,.62,.78);part(g,'round',0x827e61,-1.9,.5,.0,.60,.77,.80);part(g,'rock',0xa39b72,1.91,.47,.4,.59,.66,.65);
  for(const s of [-1,1]){segment(g,[s*.76,.08,1.27],[s*.88,1.31,1.36],.13,bone);segment(g,[s*.88,1.31,1.36],[s*.62,1.94,1.34],.09,bone);}
  part(g,'rock',bone,.0,2.44,1.11,.27,.26,.14);part(g,'ball',0x4e5640,-.08,2.48,1.23,.049,.065,.025);part(g,'ball',0x4e5640,.08,2.48,1.23,.049,.065,.025);
  part(g,'box',dark,-.28,1.02,1.25,.65,1.2,.06);part(g,'box',c,-.28,1.5,1.30,.58,.13,.02);
  const fire=group(g,dir*2.13,.04,1.25);for(let i=0;i<6;i++){const a=i*Math.PI/3;part(fire,'rock',0x666b4f,Math.cos(a)*.35,.07,Math.sin(a)*.3,.15,.13,.15);}part(fire,'cylinder',wood,0,.13,0,.11,.66,.11,Math.PI/2);part(fire,'cylinder',wood,0,.17,0,.11,.65,.11,Math.PI/2).rotation.y=Math.PI/2;fires.push(fire);
  flags.push(flag(g,-dir*1.65,3.48,-.35,c,.8));
 }else if(age===1){
  armor(g,0xaaa991,0,1.39,0,3.34,2.87,2.0);for(const x of [-1.53,1.53]){part(g,'cylinder',0xaaa78d,x,1.81,.11,.67,3.8,.67);part(g,'cylinder',0xc1bda1,x,3.55,.11,.77,.22,.77);for(let i=0;i<7;i++){const a=i/7*Math.PI*2;part(g,'box',0xc3bfa0,x+Math.cos(a)*.61,3.89,.11+Math.sin(a)*.61,.30,.49,.30);}}
  for(let i=0;i<6;i++)part(g,'box',0xc0bca0,-1.35+i*.54,2.96,1.0,.28,.4,.32);
  const gate=new T.Mesh(arch(1.19,2.12),mat(0x344035));gate.position.set(0,.04,1.035);g.add(gate);for(let i=0;i<5;i++)part(g,'box',0x6a644b,-.43+i*.215,.90,1.095,.046,1.73,.048);for(let i=0;i<3;i++)part(g,'box',0x867953,0,.35+i*.55,1.13,1,.038,.04);
  for(let y=.45;y<2.7;y+=.48){for(const x of [-1.10,.96])part(g,'box',0x8e967d,x,y,1.01,.50,.022,.03);}
  for(const x of [-1.53,1.53]){const slit=new T.Mesh(arch(.14,.57),mat(0x4b5c48));slit.position.set(x,2.40,.775);g.add(slit);}
  for(const x of [-.99,.99]){armor(g,dark,x,1.76,1.09,.43,.75,.06);part(g,'box',c,x,1.88,1.135,.31,.10,.025);}
  flags.push(flag(g,-dir*1.52,4.8,.12,c,.95));
 }else if(age===2){
  armor(g,0xc8bea0,0,1.24,0,3.72,2.53,2.36);for(const x of [-1.65,1.65]){armor(g,0xb3aa88,x,1.75,.0,.69,3.49,1.79);const roof=part(g,'cone',0x755944,x,3.70,0,.71,.68,.91);roof.rotation.y=Math.PI/4;}
  const roof=part(g,'cone',0x82644d,0,2.91,0,1.8,1.2,1.0);roof.rotation.y=Math.PI/4;roof.scale.z=1.35;
  armor(g,0x93896a,0,.27,1.35,2.20,.49,.63);const door=new T.Mesh(arch(.85,1.68),mat(0x384839));door.position.set(0,.28,1.195);g.add(door);
  for(const x of [-1.18,1.18])for(const y of [.77,1.77]){part(g,'box',0x485644,x,y,1.194,.46,.55,.035);part(g,'box',bone,x,y,1.22,.04,.60,.035);part(g,'box',bone,x,y,1.22,.49,.04,.035);}
  part(g,'box',c,-.47,2.19,1.25,.37,.72,.045);part(g,'box',dark,.46,2.19,1.25,.37,.72,.045);
  part(g,'cylinder',0x6b6451,dir*2.2,.53,.56,.28,.98,.28);ring(g,0x969574,dir*2.2,.53,.56,.29,.1,Math.PI/2);
  flags.push(flag(g,-dir*1.64,4.57,.15,c,.9));
 }else if(age===3){
  armor(g,0x818a73,0,.98,0,4.0,1.97,2.51);armor(g,0x9ba38b,.20,1.98,-.24,2.39,1.05,1.70);armor(g,0x637459,.20,2.6,-.24,2.66,.24,1.91);
  for(let i=0;i<4;i++)part(g,'box',0x334c3d,-.63+i*.51,2.08,.63,.39,.41,.035);part(g,'box',c,.17,2.36,.69,1.61,.063,.023);
  part(g,'box',0x2c4437,.19,.76,1.281,1.15,1.52,.04);for(let i=0;i<7;i++)part(g,'box',0x4a6148,.19,.12+i*.19,1.315,1.01,.039,.028);part(g,'box',0xe4bd73,.19,1.54,1.32,.78,.08,.06,0,0xe4bd73);
  for(let i=0;i<4;i++){const x=-1.58+i*.38;part(g,'round',0xaea988,x,.28,1.39,.26,.15,.18);part(g,'round',0xa4a387,x+.15,.56,1.36,.26,.15,.18);}
  for(const x of [-1.1,1.12]){part(g,'box',0x566d52,x,1.46,1.281,.43,.48,.06);for(let i=0;i<4;i++)part(g,'box',0x8a9676,x,1.32+i*.09,1.32,.35,.035,.03);}
  part(g,'cylinder',0x566c51,-dir*.86,3.65,-.31,.026,2.43,.026);segment(g,[-dir*.86,4.17,-.31],[-dir*.27,4.17,-.31],.019,0x71805d);segment(g,[-dir*.86,3.79,-.31],[-dir*1.42,3.79,-.31],.019,0x71805d);
  const dish=group(g,dir*.78,2.87,-.2);part(dish,'ball',0xb6baa1,0,.28,0,.59,.12,.59,.35);segment(dish,[0,.2,0],[.34,.74,0],.023,0x6b7e60);dish.rotation.z=-.35;spinners.push(dish);
  flags.push(flag(g,dir*1.78,3.05,-.28,c,.67));
 }else{
  armor(g,0xabbfae,0,.72,0,4.19,1.49,2.53);armor(g,0xcfdbc9,0,2.36,-.04,1.91,3.47,1.91);
  for(const x of [-1.62,1.62]){armor(g,0xc4d0bd,x,1.99,.08,.68,3.92,1.24);part(g,'box',c,x,1.89,.72,.16,3.09,.025,0,c);armor(g,0x4e7060,x,4.02,.06,.71,.25,1.27);}
  const gate=new T.Mesh(arch(1.07,2.01),mat(0x27483f));gate.position.set(0,.05,1.27);g.add(gate);part(g,'box',c,0,2.53,.94,1.41,.12,.025,0,c);part(g,'box',0x365b4d,0,3.08,.94,1.21,.53,.025);part(g,'box',c,0,3.08,.967,.80,.075,.017,0,c);
  const reactor=group(g,0,4.6,0);const r=ring(reactor,c,0,0,0,.54);r.material=mat(c,c);r.rotation.y=.35;part(reactor,'round',0xdfe9d0,0,0,0,.24,.37,.24,0,c);spinners.push(reactor);
  for(const x of [-.85,.85])part(g,'box',c,x,.54,1.3,.07,.95,.035,0,c);
 }
 g.userData={flags,fires,spinners,age,side};return g;
}
function turret(age,type,side,level=1){
 const g=new T.Group(),c=team[side];let cannon=group(g,0,.37,0);part(g,'cylinder',age<2?0x7f7757:0x6a7962,0,.15,0,.36,.35,.36);
 if(age===0){part(cannon,'box',wood,0,.0,0,.45,.18,.44);segment(cannon,[-.22,.06,-.21],[.02,.82,-.21],.06,wood);segment(cannon,[-.22,.06,.21],[.02,.82,.21],.06,wood);const arm=part(cannon,'cylinder',0x9d835b,.05,.63,0,.043,1.14,.043,-.9);part(cannon,'rock',0xbdb894,.39,1.04,0,type===2?.25:.15,type===2?.25:.15,type===2?.25:.15);part(cannon,'box',c,-.16,.25,.26,.31,.18,.025);}
 else if(age===1){part(cannon,'box',wood,.11,.31,0,.97,.13,.24,-.15);segment(cannon,[.35,.44,-.53],[.44,.44,0],.045,0xb49562);segment(cannon,[.44,.44,0],[.35,.44,.53],.045,0xb49562);segment(cannon,[.35,.44,-.53],[-.05,.42,0],.011,bone);segment(cannon,[-.05,.42,0],[.35,.44,.53],.011,bone);part(cannon,'cylinder',bone,.43,.45,0,.02,.97,.02,-Math.PI/2);}
 else{armor(cannon,age===2?0x7f7353:age===3?0x657d59:0xb8cbb5,-.09,.22,0,.65,.48,.57);const count=type===1?2:1;for(let i=0;i<count;i++){const z=(i-(count-1)/2)*.24;part(cannon,'cylinder',age===4?0x466c5a:0x414e3c,.57,.32,z,type===2?.15:.07,1.14,type===2?.15:.07,-Math.PI/2+.1);ring(cannon,age===4?c:0x989776,1.12,.38,z,type===2?.16:.08,.1,0,Math.PI/2);}
  part(cannon,'box',c,-.11,.29,.305,.29,.105,.025,0,age===4?c:0);
 }
 for(let i=0;i<level;i++)part(g,'box',bone,-.20+i*.13,.17,.348,.07,.065,.015);
 g.userData={cannon,age,type,side};return g;
}
function mergeStatic(node){
 node.updateMatrixWorld(true);const p=[],n=[],colors=[],c=new T.Color(),normal=new T.Vector3(),v=new T.Vector3(),nm=new T.Matrix3();
 node.traverse(o=>{if(!o.isMesh)return;const geo=o.geometry.index?o.geometry.toNonIndexed():o.geometry;const po=geo.getAttribute('position'),no=geo.getAttribute('normal');nm.getNormalMatrix(o.matrixWorld);c.copy(o.material.color);for(let i=0;i<po.count;i++){v.fromBufferAttribute(po,i).applyMatrix4(o.matrixWorld);p.push(v.x,v.y,v.z);normal.fromBufferAttribute(no,i).applyMatrix3(nm).normalize();n.push(normal.x,normal.y,normal.z);colors.push(c.r,c.g,c.b);}if(geo!==o.geometry)geo.dispose();});
 const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(p,3));geo.setAttribute('normal',new T.Float32BufferAttribute(n,3));geo.setAttribute('color',new T.Float32BufferAttribute(colors,3));const mesh=new T.Mesh(geo,new T.MeshStandardMaterial({vertexColors:true,roughness:.92,flatShading:true}));mesh.castShadow=true;mesh.receiveShadow=true;return mesh;
}
function animate(model,u,time,dt){const a=model.userData.anim;if(!a)return;const w=u.walk||0,moving=u.moving,attack=u.attack?Math.sin(u.attack/.3*Math.PI):0;
 if(a.kind==='human'){
  a.body.position.y=.78+(moving?Math.abs(Math.sin(w))* .055:Math.sin(time*2.5+u.id)*.011);a.body.rotation.z=moving?-.04:0;
  a.legs.forEach((l,i)=>l.rotation.z=moving?Math.sin(w+i*Math.PI)*.58:Math.sin(time+i)*.018);
  a.arms[0].rotation.z=moving?-Math.sin(w)*.37:-.12;
  a.arms[1].rotation.z=u.range>2?.55+attack*.16:.36+attack*1.7+(moving?Math.sin(w)*.25:0);
  if(a.age>=2&&u.range>2)a.weapon.position.x=-attack*.085;
 }else if(a.kind==='beast'){
  model.position.y=moving?Math.abs(Math.sin(w))*.055:0;a.legs.forEach((l,i)=>l.rotation.z=moving?Math.sin(w+(i===0||i===3?0:Math.PI))*.35:0);model.rotation.z=attack*.06;
  if(a.rider)a.rider.position.y=(a.age===0?1.48:1.39)+(moving?Math.sin(w)*.025:0);
 }else if(a.kind==='walker'){
  a.legs.forEach((l,i)=>l.rotation.z=moving?Math.sin(w*.7+i*Math.PI)*.29:0);a.turret.position.y=2.1+(moving?Math.abs(Math.sin(w*.7))*.06:Math.sin(time*2)*.014);a.turret.position.x=-attack*.10;
 }else{
  a.wheels?.forEach(wheel=>wheel.rotation.z=-w);if(a.turret)a.turret.position.x=(a.age===2?.17:.06)-attack*.12;model.position.y=moving?Math.sin(w*2)*.008:0;
 }
}
root.EpochModels={part,group,segment,ring,mat,geos,unit,base,turret,flag,mergeStatic,animate,team,teamDark,armor};
})(globalThis);
