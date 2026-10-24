import * as THREE from '../vendor/three.module.js';
import { A, BLUE, ORANGE, makeEnvironment, makeSky, makeStadium, makeCar, makeBall, makePad } from './visual-assets.js';
const V=THREE.Vector3,Q=THREE.Quaternion;
const clamp=THREE.MathUtils.clamp, lerp=THREE.MathUtils.lerp;
const UP=new V(0,1,0),FORWARD=new V(0,0,-1);
function vec(v,p){v.set(p?.x||0,p?.y||0,p?.z||0);return v;}
function quat(q,p){q.set(p?.x||0,p?.y||0,p?.z||0,p?.w??1);return q;}
function disposeTree(root){const geometries=new Set(),materials=new Set(),textures=new Set();root.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material]){materials.add(m);for(const k of Object.keys(m))if(m[k]?.isTexture)textures.add(m[k]);}});for(const t of textures)t.dispose();for(const g of geometries)g.dispose();for(const m of materials)m.dispose();}

class ParticlePool{
 constructor(scene,count=1500){this.count=count;this.cursor=0;this.p=new Float32Array(count*3);this.v=new Float32Array(count*3);this.c=new Float32Array(count*3);this.s=new Float32Array(count);this.a=new Float32Array(count);this.life=new Float32Array(count);this.total=new Float32Array(count);this.radius=new Float32Array(count);this.drag=new Float32Array(count);this.gravity=new Float32Array(count);for(let i=0;i<count;i++)this.p[i*3+1]=-9999;const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(this.p,3).setUsage(THREE.DynamicDrawUsage));g.setAttribute('aColor',new THREE.BufferAttribute(this.c,3).setUsage(THREE.DynamicDrawUsage));g.setAttribute('aSize',new THREE.BufferAttribute(this.s,1).setUsage(THREE.DynamicDrawUsage));g.setAttribute('aAlpha',new THREE.BufferAttribute(this.a,1).setUsage(THREE.DynamicDrawUsage));
 const m=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,uniforms:{uScale:{value:400}},vertexShader:'attribute vec3 aColor;attribute float aSize;attribute float aAlpha;uniform float uScale;varying vec3 vColor;varying float vAlpha;void main(){vColor=aColor;vAlpha=aAlpha;vec4 mv=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mv;gl_PointSize=clamp(aSize*uScale/max(1.,-mv.z),0.,80.);}',fragmentShader:'varying vec3 vColor;varying float vAlpha;void main(){float d=length(gl_PointCoord-vec2(.5))*2.;if(d>1.)discard;float a=(1.-smoothstep(.05,1.,d))*vAlpha;gl_FragColor=vec4(vColor,a);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}'});this.mesh=new THREE.Points(g,m);this.mesh.frustumCulled=false;scene.add(this.mesh);}
 emit(p,v,color,size=.4,life=.5,gravity=-2,drag=2){const i=this.cursor++%this.count,j=i*3;this.p[j]=p.x;this.p[j+1]=p.y;this.p[j+2]=p.z;this.v[j]=v.x;this.v[j+1]=v.y;this.v[j+2]=v.z;this.c[j]=color.r;this.c[j+1]=color.g;this.c[j+2]=color.b;this.life[i]=this.total[i]=life;this.radius[i]=size;this.gravity[i]=gravity;this.drag[i]=drag;}
 burst(p,color,count=35,power=12){for(let n=0;n<count;n++){const a=Math.random()*Math.PI*2,z=Math.random()*2-1,r=Math.sqrt(1-z*z),speed=power*(.2+Math.random()*.8);this.emit(p,{x:Math.cos(a)*r*speed,y:z*speed+power*.25,z:Math.sin(a)*r*speed},color,.12+Math.random()*.35,.3+Math.random()*.7,-9,1.1);}}
 update(dt){for(let i=0;i<this.count;i++){const j=i*3;if(this.life[i]<=0){this.s[i]=0;this.a[i]=0;continue;}this.life[i]-=dt;const f=Math.max(0,this.life[i]/this.total[i]),d=Math.exp(-this.drag[i]*dt);this.v[j]*=d;this.v[j+2]*=d;this.v[j+1]=this.v[j+1]*d+this.gravity[i]*dt;this.p[j]+=this.v[j]*dt;this.p[j+1]+=this.v[j+1]*dt;this.p[j+2]+=this.v[j+2]*dt;this.s[i]=this.radius[i]*(.4+f*.6);this.a[i]=f;}for(const a of Object.values(this.mesh.geometry.attributes))a.needsUpdate=true;}
}

class BoostPads{
 constructor(scene,pads){this.group=new THREE.Group();scene.add(this.group);this.pads=pads;this.object=new THREE.Object3D();this.color=new THREE.Color();this.batches=[];
  for(const large of [false,true]){const list=pads.filter(p=>!!p.large===large),n=Math.max(1,list.length);const base=new THREE.InstancedMesh(new THREE.CylinderGeometry(large?1.65:.75,large?1.8:.85,.13,large?8:6),new THREE.MeshStandardMaterial({color:0x1b2d36,roughness:.6,metalness:.45}),n);const ring=new THREE.InstancedMesh(new THREE.TorusGeometry(large?1.38:.58,large?.07:.045,6,large?32:20),new THREE.MeshBasicMaterial({color:0xffffff}),n);const core=new THREE.InstancedMesh(new THREE.OctahedronGeometry(large?.58:.2),new THREE.MeshStandardMaterial({color:0xffd36e,emissive:0xffc653,emissiveIntensity:1.3,metalness:.2,roughness:.4}),n);const halo=new THREE.InstancedMesh(new THREE.CircleGeometry(large?1.6:.7,24),new THREE.MeshBasicMaterial({color:0xffbc41,transparent:true,opacity:.10,depthWrite:false,blending:THREE.AdditiveBlending}),n);
   for(const m of [base,ring,core,halo]){m.count=list.length;m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);m.frustumCulled=false;this.group.add(m);}this.batches.push({large,list,base,ring,core,halo});
  }this.update(0);
 }
 sync(pads){this.pads=pads;const map=new Map(pads.map(p=>[p.id,p]));for(const b of this.batches)b.list=b.list.map(p=>map.get(p.id)||p);}
 update(time){const o=this.object;for(const b of this.batches){for(let i=0;i<b.list.length;i++){const p=b.list[i],y=p.position.y||0;o.position.set(p.position.x,y+.035,p.position.z);o.rotation.set(0,0,0);o.scale.setScalar(1);o.updateMatrix();b.base.setMatrixAt(i,o.matrix);o.position.y=y+.12;o.rotation.x=Math.PI/2;o.updateMatrix();b.ring.setMatrixAt(i,o.matrix);this.color.setHex(p.active?0xffc452:0x35434b);b.ring.setColorAt(i,this.color);o.position.y=y+(b.large?.93:.3)+Math.sin(time*2.7+i*.2)*.06;o.rotation.set(0,time*(b.large?1.2:1.8),Math.sin(time*1.7)*.14);o.scale.setScalar(p.active?1:0);o.updateMatrix();b.core.setMatrixAt(i,o.matrix);o.position.y=y+.13;o.rotation.set(-Math.PI/2,0,0);o.updateMatrix();b.halo.setMatrixAt(i,o.matrix);}
  for(const m of [b.base,b.ring,b.core,b.halo])m.instanceMatrix.needsUpdate=true;if(b.ring.instanceColor)b.ring.instanceColor.needsUpdate=true;
 }}
 dispose(){this.group.parent?.remove(this.group);disposeTree(this.group);}
}

export class GameRenderer{
 constructor(canvas,settings={},cosmetics={}){
  this.canvas=canvas;this.settings={fov:100,cameraDistance:8.5,cameraHeight:3.8,cameraAngle:5,stiffness:7,cameraShake:.25,quality:'high',...settings};this.cosmetics={paint:'#29b8e9',orangePaint:'#f58a30',wheels:'sport',trail:'#64ddff',...cosmetics};this.scene=new THREE.Scene();this.scene.fog=new THREE.Fog(0x536f82,125,360);this.camera=new THREE.PerspectiveCamera(68,1,.13,700);this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance',alpha:false});this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.12;this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  this.env=makeEnvironment(this.renderer);this.scene.environment=this.env.texture;this.scene.environmentIntensity=.8;this.scene.add(makeSky());
  const hemi=new THREE.HemisphereLight(0xc5e7ff,0x446e5c,1.65);this.scene.add(hemi);const sun=new THREE.DirectionalLight(0xf0f6ff,3.1);sun.position.set(-33,72,-26);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-69;sun.shadow.camera.right=69;sun.shadow.camera.top=74;sun.shadow.camera.bottom=-74;sun.shadow.camera.near=1;sun.shadow.camera.far=155;sun.shadow.bias=-.00012;sun.shadow.normalBias=.025;sun.shadow.radius=2;this.scene.add(sun);this.sun=sun;const fill=new THREE.DirectionalLight(0x8fcbef,.8);fill.position.set(45,25,40);this.scene.add(fill);
  this.stadium=makeStadium(this.scene);this.ballVisual=makeBall();this.scene.add(this.ballVisual.group,this.ballVisual.shadow,this.ballVisual.marker);this.cars=new Map();this.pads=new Map();this.particles=new ParticlePool(this.scene);this.time=0;this.shake=0;this.mode='';this.state=null;this.cameraReady=false;this.playerId=0;this.lastBallEmission=0;
  this._v1=new V();this._v2=new V();this._v3=new V();this._v4=new V();this._q=new Q();this._desired=new V();this._target=new V();this._aim=new V();this._forward=new V(0,0,-1);this._lastDir=new V(0,0,-1);this._particlePos=new V();this._particleVel=new V();
  this.skids=new THREE.InstancedMesh(new THREE.PlaneGeometry(.16,1),new THREE.MeshBasicMaterial({color:0x14291e,transparent:true,opacity:.26,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1}),480);this.skids.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.skidCursor=0;this._skidObject=new THREE.Object3D();this._skidObject.position.y=-999;this._skidObject.updateMatrix();for(let i=0;i<480;i++)this.skids.setMatrixAt(i,this._skidObject.matrix);this.skids.frustumCulled=false;this.scene.add(this.skids);
  this.rings=[];for(let i=0;i<4;i++){const m=new THREE.Mesh(new THREE.TorusGeometry(1,.035,6,72),new THREE.MeshBasicMaterial({color:BLUE,transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending}));m.visible=false;this.scene.add(m);this.rings.push({mesh:m,life:0});}
  this._onResize=()=>this.resize();window.addEventListener('resize',this._onResize);this.setSettings(settings);this.sync({cars:[{id:0,team:0,name:'YOU',isPlayer:true,position:{x:0,y:.9,z:32},quaternion:{x:0,y:0,z:0,w:1},velocity:{x:0,y:0,z:0},speed:0,grounded:true}],ball:{position:{x:0,y:1.8,z:0},quaternion:{x:0,y:0,z:0,w:1},velocity:{x:0,y:0,z:0}},pads:[],time:0});
 }
 resize(){const w=this.canvas.clientWidth||window.innerWidth,h=this.canvas.clientHeight||window.innerHeight;this.renderer.setSize(w,h,false);this.camera.aspect=w/h;this.camera.fov=clamp(2*Math.atan(Math.tan(this.settings.fov*Math.PI/360)/this.camera.aspect)*180/Math.PI,43,100);this.camera.updateProjectionMatrix();this.particles.mesh.material.uniforms.uScale.value=h*.54;}
 setSettings(settings={}){Object.assign(this.settings,settings);const ratio=Math.min(window.devicePixelRatio||1,this.settings.quality==='low'?1:this.settings.quality==='medium'?1.25:1.65);this.renderer.setPixelRatio(ratio);this.renderer.shadowMap.enabled=this.settings.quality!=='low';this.sun.shadow.mapSize.set(this.settings.quality==='high'?2048:1024,this.settings.quality==='high'?2048:1024);if(this.sun.shadow.map){this.sun.shadow.map.dispose();this.sun.shadow.map=null;}this.resize();}
 setCosmetics(cosmetics={}){Object.assign(this.cosmetics,cosmetics);if(!this.state)return;for(const [id,visual]of this.cars){this.scene.remove(visual.group,visual.shadow,visual.label);disposeTree(visual.group);disposeTree(visual.shadow);disposeTree(visual.label);}this.cars.clear();this.sync(this.state);}
 sync(state,alpha=1,previous=null){
  if(!state)return;this.state=state;const a=clamp(alpha,0,1),prevCars=previous?.cars;const liveIds=new Set();
  for(const car of state.cars||[]){liveIds.add(car.id);let visual=this.cars.get(car.id);if(!visual||visual.team!==car.team){if(visual){this.scene.remove(visual.group,visual.shadow,visual.label);disposeTree(visual.group);disposeTree(visual.shadow);disposeTree(visual.label);}visual=makeCar(car,this.cosmetics);visual.group.remove(visual.label);this.scene.add(visual.group,visual.shadow,visual.label);this.cars.set(car.id,visual);}
   const before=prevCars?.find(c=>c.id===car.id);vec(visual.group.position,car.position);quat(visual.group.quaternion,car.quaternion);if(before&&a<1){vec(this._v1,before.position);visual.group.position.lerpVectors(this._v1,visual.group.position,a);quat(this._q,before.quaternion);visual.group.quaternion.slerpQuaternions(this._q,visual.group.quaternion,a);}visual.data=car;visual.label.position.copy(visual.group.position).addScaledVector(UP,2.9);
  }
  for(const [id,v]of this.cars)if(!liveIds.has(id)){this.scene.remove(v.group,v.shadow,v.label);disposeTree(v.group);disposeTree(v.shadow);disposeTree(v.label);this.cars.delete(id);}
  if(state.ball){vec(this.ballVisual.group.position,state.ball.position);quat(this.ballVisual.group.quaternion,state.ball.quaternion);if(previous?.ball&&a<1){vec(this._v1,previous.ball.position);this.ballVisual.group.position.lerpVectors(this._v1,this.ballVisual.group.position,a);quat(this._q,previous.ball.quaternion);this.ballVisual.group.quaternion.slerpQuaternions(this._q,this.ballVisual.group.quaternion,a);}}
  const pads=state.pads||[],padKey=pads.map(p=>p.id+':'+p.large).join('|');if(padKey!==this.padKey){this.padBatch?.dispose();this.padBatch=new BoostPads(this.scene,pads);this.padKey=padKey;}else this.padBatch?.sync(pads);
 }
 floorHeight(x,z){let outward=Math.max(Math.abs(x)-36,(Math.abs(x)>9.1?Math.abs(z)-52:0),0);if(Math.abs(x)>31&&Math.abs(z)>47)outward=Math.max(outward,Math.hypot(Math.abs(x)-31,Math.abs(z)-47)-5);outward=clamp(outward,0,5);return 5-Math.sqrt(Math.max(0,25-outward*outward));}
 clampCamera(p){const inGoal=Math.abs(p.x)<8&&p.y<8;const limitZ=inGoal?64:56;p.x=clamp(p.x,-40,40);p.z=clamp(p.z,-limitZ,limitZ);const ax=Math.abs(p.x),az=Math.abs(p.z);if(ax>31&&az>47){const dx=ax-31,dz=az-47,dist=Math.hypot(dx,dz);if(dist>9){p.x=Math.sign(p.x)*(31+dx/dist*9);p.z=Math.sign(p.z)*(47+dz/dist*9);}}p.y=clamp(p.y,Math.max(.7,this.floorHeight(p.x,p.z)+.5),24);}
 update(dt,context={}){
  dt=Math.min(.05,Math.max(0,dt));this.time+=dt;const mode=context.mode||'play',play=mode==='play',player=this.cars.get(context.playerId??0)||this.cars.values().next().value;this.playerId=context.playerId??0;if(!player)return;
  this.stadium.ads.offset.x=this.time*.006;this.stadium.crowdUniform.value=this.time;
  this.padBatch?.update(this.time);
  for(const v of this.cars.values()){
   const data=v.data||{},speed=data.speed||0,inp=data.input||{};const boosting=(inp.boost&&data.boost>0)&&(play||mode==='replay');const f=this._v1.copy(FORWARD).applyQuaternion(v.group.quaternion);const yaw=Math.atan2(-f.x,-f.z);
   for(const wheel of v.wheels){wheel.spin.rotation.x-=speed*dt/.52;wheel.root.rotation.y=wheel.front?-(inp.steer||0)*.4:0;wheel.root.position.y=-.39+(data.grounded?Math.sin(this.time*21+wheel.side)*Math.min(.025,speed*.0007):-.08);}
   for(const flame of v.flames){flame.visible=boosting;flame.scale.setScalar(.88+Math.sin(this.time*72+v.id)*.12);flame.scale.z=1.2+(data.supersonic?.8:.2)+Math.sin(this.time*60)*.18;}
   v.label.visible=!v.isPlayer&&(play||mode==='replay');v.shadow.position.set(v.group.position.x,this.floorHeight(v.group.position.x,v.group.position.z)+.027,v.group.position.z);v.shadow.rotation.set(-Math.PI/2,0,-yaw);v.shadow.material.opacity=clamp(1-(v.group.position.y-.9)/13,.08,.7);v.shadow.scale.setScalar(1+(v.group.position.y-.9)*.012);v.shadow.visible=v.group.position.y<23;
   if(boosting){v.emit+=dt*90;while(v.emit>=1){v.emit--;this._particlePos.set((Math.random()-.5)*.85,-.08,2.15).applyQuaternion(v.group.quaternion).add(v.group.position);this._particleVel.copy(f).multiplyScalar(-6).addScaledVector(vec(this._v2,data.velocity),.25);this._particleVel.x+=(Math.random()-.5)*1.8;this._particleVel.y+=(Math.random()-.5)*1.8;this._particleVel.z+=(Math.random()-.5)*1.8;this.particles.emit(this._particlePos,this._particleVel,v.trailColor,.5,.25+Math.random()*.2,0,3.5);}}
   if(play&&inp.powerslide&&data.grounded&&v.group.position.y<1.5&&speed>6){v.skidTime=(v.skidTime||0)+dt;if(v.skidTime>.035){v.skidTime=0;for(const side of [-1,1]){this._v2.set(side*1.02,-.85,1.23).applyQuaternion(v.group.quaternion).add(v.group.position);const o=this._skidObject;o.position.set(this._v2.x,.025,this._v2.z);o.rotation.set(-Math.PI/2,0,-yaw);o.scale.set(1,Math.max(.45,speed*.065),1);o.updateMatrix();this.skids.setMatrixAt(this.skidCursor++%480,o.matrix);this.particles.emit(this._v2,{x:(Math.random()-.5)*2,y:.8,z:(Math.random()-.5)*2},new THREE.Color(.29,.36,.32),.8,.55,1,2);}this.skids.instanceMatrix.needsUpdate=true;}}
  }
  const bp=this.ballVisual.group.position,bh=this.floorHeight(bp.x,bp.z);this.ballVisual.shadow.position.set(bp.x,bh+.032,bp.z);this.ballVisual.shadow.material.opacity=clamp(.82-(bp.y-bh-1.8)*.025,.14,.82);this.ballVisual.shadow.scale.setScalar(1+Math.max(0,bp.y-bh-1.8)*.025);this.ballVisual.marker.position.set(bp.x,bh+.035,bp.z);this.ballVisual.marker.material.opacity=clamp((bp.y-bh-2)*.025,.07,.30);this.ballVisual.marker.visible=play||mode==='replay';
  const ballVelocity=this.state?.ball?.velocity;if(play&&ballVelocity&&Math.hypot(ballVelocity.x,ballVelocity.y,ballVelocity.z)>28){this.lastBallEmission+=dt;if(this.lastBallEmission>.023){this.lastBallEmission=0;this.particles.emit(bp,{x:0,y:0,z:0},new THREE.Color(0xbce6f2),.35,.35,0,1);}}
  this.particles.update(dt);for(const ring of this.rings)if(ring.life>0){ring.life-=dt;const age=1.6-ring.life;ring.mesh.scale.setScalar(1+age*16);ring.mesh.material.opacity=Math.max(0,ring.life/1.6*.45);ring.mesh.visible=ring.life>0;}
  const pp=player.group.position;const desired=this._desired,target=this._target;const look=context.look||{x:0,y:0};let stiffness=this.settings.stiffness||7;
  if(mode==='menu'){
   const orbit=Math.sin(this.time*.085)*.11;desired.set(pp.x+7.6+orbit*5,pp.y+3.3,pp.z-9.3+orbit*4);target.set(pp.x+5.5,pp.y+.75,pp.z+.1);stiffness=2.5;
  }else if(mode==='garage'){
   const t=this.time*.12;desired.set(pp.x+Math.sin(t)*6.7,pp.y+2.1,pp.z-Math.cos(t)*6.7);target.copy(pp).addScaledVector(UP,.25);stiffness=4;
  }else if(mode==='replay'){
   desired.set(bp.x+14,bp.y+9,bp.z+18);desired.x=clamp(desired.x,-37,37);desired.z=clamp(desired.z,-54,54);desired.y=clamp(desired.y,7,21);target.copy(bp);stiffness=3.5;
  }else{
   const dir=this._forward,speed=player.data?.speed||0;let distance=this.settings.cameraDistance+Math.min(1.2,speed*.022),height=this.settings.cameraHeight;
   if(context.ballCam!==false){
    dir.subVectors(bp,pp);const horizontal=Math.hypot(dir.x,dir.z),dy=bp.y-pp.y;dir.y=0;if(horizontal>1){dir.normalize();this._lastDir.copy(dir);}else dir.copy(this._lastDir);
    height+=Math.min(3,Math.max(0,dy)*.12);height=Math.min(height,Math.max(.25,24-pp.y));
    // Fit the angular span of car and lofted ball. This keeps overhead touches
    // visible without pointing the camera upward until the player's car is cropped.
    const half=Math.tan(this.camera.fov*Math.PI/360),span=Math.atan(.55*half)+Math.atan(.72*half);
    for(let k=0;k<9;k++){const carAngle=Math.atan2(-height,distance),ballAngle=Math.atan2(dy-height,distance+horizontal);if(Math.abs(ballAngle-carAngle)<=span||distance>=this.settings.cameraDistance+18)break;distance=Math.min(this.settings.cameraDistance+18,distance*1.22);}
    desired.copy(pp).addScaledVector(dir,-distance);desired.y+=height;this.clampCamera(desired);
    const actualDistance=Math.max(1,Math.hypot(desired.x-pp.x,desired.z-pp.z)),carAngle=Math.atan2(pp.y-desired.y,actualDistance),ballAngle=Math.atan2(bp.y-desired.y,actualDistance+horizontal);
    const pitch=carAngle+(ballAngle>=carAngle?1:-1)*Math.atan(.55*half),aimDistance=clamp(horizontal*.4,6,30);
    target.copy(pp).addScaledVector(dir,aimDistance);target.y=desired.y+Math.tan(pitch)*(actualDistance+aimDistance);
   }else{
    dir.copy(FORWARD).applyQuaternion(player.group.quaternion);dir.y=clamp(dir.y,-.6,.75);dir.normalize();target.copy(pp).addScaledVector(dir,7);target.y+=1.25;desired.copy(pp).addScaledVector(dir,-distance);desired.y+=height;
   }
   if(look.x||look.y){dir.applyAxisAngle(UP,clamp(-look.x,-2.7,2.7));target.copy(pp).addScaledVector(dir,8);target.y+=1.2-clamp(look.y,-1,1)*5;desired.copy(pp).addScaledVector(dir,-distance);desired.y+=height;}
   target.y-=Math.tan((this.settings.cameraAngle-5)*Math.PI/180)*distance;this.clampCamera(desired);
  }
  const changed=mode!==this.mode;this.mode=mode;if(!this.cameraReady||(changed&&mode!=='play')){this.camera.position.copy(desired);this._aim.copy(target);this.cameraReady=true;}else{const amount=1-Math.exp(-stiffness*dt);this.camera.position.lerp(desired,amount);this._aim.lerp(target,1-Math.exp(-(stiffness+3)*dt));}
  if(play)this.clampCamera(this.camera.position);this.camera.up.copy(UP);this.camera.lookAt(this._aim);
  if(this.shake>0){this.shake=Math.max(0,this.shake-dt*2.5);const amount=this.shake*(this.settings.cameraShake||0)*.12;this.camera.position.x+=Math.sin(this.time*89)*amount;this.camera.position.y+=Math.sin(this.time*113)*amount;}
 }
 render(){this.renderer.render(this.scene,this.camera);}
 event(event){
  const p=event.position||this.state?.ball?.position||{x:0,y:2,z:0};const intensity=clamp(event.intensity||1,.15,3);const car=this.cars.get(event.carId);const color=new THREE.Color(event.team===1?ORANGE:BLUE);
  if(event.type==='goal'){this.particles.burst(p,color,380,26);this.particles.burst(p,new THREE.Color(0xfff0ce),100,17);this.shake=2;const r=this.rings.find(r=>r.life<=0)||this.rings[0];r.mesh.position.set(p.x,Math.max(3,p.y),p.z);r.mesh.material.color.copy(color);r.mesh.scale.setScalar(1);r.life=1.6;r.mesh.visible=true;}
  else if(event.type==='ballHit'){this.particles.burst(p,new THREE.Color(0xffedb1),Math.round(12+intensity*13),7+intensity*3);this.shake=Math.max(this.shake,intensity*.4);}
  else if(event.type==='carHit'||event.type==='wallHit'){this.particles.burst(p,new THREE.Color(0xffbf69),Math.round(6+intensity*9),4+intensity*2);if(event.carId===this.playerId)this.shake=Math.max(this.shake,intensity*.2);}
  else if(event.type==='pickup'){this.particles.burst(p,new THREE.Color(0xffc761),event.large?38:12,event.large?7:3);}
  else if((event.type==='jump'||event.type==='flip')&&car){this.particles.burst(car.group.position,car.trailColor,event.type==='flip'?18:10,3);}
 }
 setScore(blue,orange,timeLabel){this.stadium.updateScore(blue,orange,timeLabel);}
 dispose(){window.removeEventListener('resize',this._onResize);disposeTree(this.scene);this.env.dispose();this.renderer.dispose();}
}
