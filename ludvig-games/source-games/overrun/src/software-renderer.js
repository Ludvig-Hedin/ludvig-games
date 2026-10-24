import * as THREE from 'three';

// Compatibility renderer for machines where WebGL is disabled. It draws the
// actual scene's geometry, cameras, actors and effects. Gameplay is unchanged.
// The GPU path remains the default; this path intentionally omits PBR and shadows.
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const srgb=v=>v<=.0031308?v*12.92:1.055*Math.pow(Math.max(0,v),1/2.4)-.055;
const linear=v=>v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4);
const aces=v=>clamp(v*(2.51*v+.03)/(v*(2.43*v+.59)+.14),0,1);
const _white={r:1,g:1,b:1};

export class SoftwareRenderer {
 constructor({canvas}={}){
  this.domElement=canvas||document.createElement('canvas');
  this.context=this.domElement.getContext('2d',{alpha:false,desynchronized:true});
  if(!this.context)throw new Error('Neither WebGL nor Canvas 2D is available.');
  this.isSoftwareRenderer=true;this.autoClear=false;this.autoClearColor=true;this.autoClearDepth=true;this.autoClearStencil=true;
  this.shadowMap={enabled:false,type:0};this.outputColorSpace=THREE.SRGBColorSpace;this.toneMapping=THREE.ACESFilmicToneMapping;this.toneMappingExposure=1.12;
  this._ratio=1;this._width=1;this._height=1;this._geometry=new WeakMap();this._textures=new WeakMap();this._pool=[];this._commands=[];this._count=0;this._layer=0;
  this._mv=new THREE.Matrix4();this._instance=new THREE.Matrix4();this._world=new THREE.Matrix4();this._normal=new THREE.Matrix3();this._frustum=new THREE.Frustum();this._vp=new THREE.Matrix4();
  this._sphere=new THREE.Sphere();this._direction=new THREE.Vector3();this._lightTarget=new THREE.Vector3();
  this._clipA=new Float64Array(25);this._clipB=new Float64Array(25);this._mat={};this._light={x:-.48,y:.75,z:.44,ambient:.72,direct:.95,sr:1,sg:.94,sb:.82,ar:.85,ag:.95,ab:1};this._fog={r:180,g:198,b:198,density:0,near:0,far:0};
  const render={calls:0,triangles:0,lines:0,points:0,frame:0};this.info={render,memory:{geometries:0,textures:0},autoReset:false,reset:()=>{render.calls=render.triangles=render.lines=render.points=0;render.frame++;}};
 }
 setPixelRatio(ratio){this._ratio=clamp(Number(ratio)||1,.35,1);this.setSize(this._width,this._height,false);}
 getPixelRatio(){return this._ratio;}
 setSize(width,height,updateStyle=true){
  this._width=Math.max(1,Math.round(width));this._height=Math.max(1,Math.round(height));
  const ratio=Math.min(this._ratio,1200/this._width,900/this._height);
  this.width=Math.max(1,Math.round(this._width*ratio));this.height=Math.max(1,Math.round(this._height*ratio));
  if(this.domElement.width!==this.width)this.domElement.width=this.width;if(this.domElement.height!==this.height)this.domElement.height=this.height;
  if(updateStyle&&this.domElement.style){this.domElement.style.width=this._width+'px';this.domElement.style.height=this._height+'px';}
  this.context.imageSmoothingEnabled=true;
 }
 getSize(target=new THREE.Vector2()){return target.set(this._width,this._height);}
 getDrawingBufferSize(target=new THREE.Vector2()){return target.set(this.width,this.height);}
 getContext(){return this.context;}
 clear(){const c=this.context;c.setTransform(1,0,0,1,0,0);c.globalAlpha=1;c.globalCompositeOperation='source-over';c.fillStyle='#a7b9b9';c.fillRect(0,0,this.width,this.height);this._layer=0;}
 clearDepth(){this._layer++;}
 dispose(){this._pool.length=this._commands.length=0;this._geometry=new WeakMap();this._textures=new WeakMap();}

 _texture(texture){
  if(!texture)return null;const old=this._textures.get(texture);if(old&&old.version===texture.version)return old;
  const image=texture.image;const result={version:texture.version,r:1,g:1,b:1,a:1,image:null,flipY:texture.flipY!==false};
  if(image){let data,width,height;
   if(image.data){data=image.data;width=image.width;height=image.height;}
   else if(image.width&&image.height){
    result.image=image;
    try{const sample=document.createElement('canvas');sample.width=sample.height=16;const c=sample.getContext('2d',{willReadFrequently:true});c.drawImage(image,0,0,16,16);data=c.getImageData(0,0,16,16).data;width=height=16;}catch{}
   }
   if(data){let r=0,g=0,b=0,a=0,total=0;const channels=data.length/(width*height),stride=Math.max(1,Math.floor(width*height/192));for(let p=0;p<width*height;p+=stride){const i=p*channels,alpha=channels>3?data[i+3]/255:1;r+=data[i]*alpha;g+=data[i+1]*alpha;b+=data[i+2]*alpha;a+=alpha;total++;}if(a>0){result.r=r/(a*255);result.g=g/(a*255);result.b=b/(a*255);}result.a=a/Math.max(1,total);if(texture.colorSpace===THREE.SRGBColorSpace){result.r=linear(result.r);result.g=linear(result.g);result.b=linear(result.b);}}
  }
  this._textures.set(texture,result);this.info.memory.textures++;return result;
 }
 _cache(geometry){
  const p=geometry.attributes.position;if(!p)return null;let cache=this._geometry.get(geometry);
  if(cache&&cache.version===p.version&&cache.count===p.count)return cache;
  const n=p.count,positions=new Float32Array(n*3),view=new Float64Array(n*3),uv=geometry.attributes.uv,colors=geometry.attributes.color;
  for(let i=0;i<n;i++){positions[i*3]=p.getX(i);positions[i*3+1]=p.getY(i);positions[i*3+2]=p.getZ(i);}
  const indices=geometry.index?.array||null,triangles=Math.floor((indices?.length||n)/3),normals=new Float32Array(triangles*3),faceColors=colors?new Float32Array(triangles*3):null;
  for(let face=0;face<triangles;face++){const j=face*3,a=(indices?indices[j]:j)*3,b=(indices?indices[j+1]:j+1)*3,c=(indices?indices[j+2]:j+2)*3;
   const abx=positions[b]-positions[a],aby=positions[b+1]-positions[a+1],abz=positions[b+2]-positions[a+2],acx=positions[c]-positions[a],acy=positions[c+1]-positions[a+1],acz=positions[c+2]-positions[a+2];
   let nx=aby*acz-abz*acy,ny=abz*acx-abx*acz,nz=abx*acy-aby*acx;const length=Math.hypot(nx,ny,nz)||1;normals[j]=nx/length;normals[j+1]=ny/length;normals[j+2]=nz/length;
   if(faceColors){faceColors[j]=(colors.getX(a/3)+colors.getX(b/3)+colors.getX(c/3))/3;faceColors[j+1]=(colors.getY(a/3)+colors.getY(b/3)+colors.getY(c/3))/3;faceColors[j+2]=(colors.getZ(a/3)+colors.getZ(b/3)+colors.getZ(c/3))/3;}
  }
  let uvs=null;if(uv){uvs=new Float32Array(n*2);for(let i=0;i<n;i++){uvs[i*2]=uv.getX(i);uvs[i*2+1]=uv.getY(i);}}
  if(!geometry.boundingSphere)geometry.computeBoundingSphere();
  cache={positions,view,indices,normals,faceColors,uvs,triangles,count:n,version:p.version};this._geometry.set(geometry,cache);this.info.memory.geometries++;return cache;
 }
 _material(material,instanceColor=null){
  const out=this._mat,color=material.color||_white,em=material.emissive||{r:0,g:0,b:0},tex=this._texture(material.map);
  out.r=color.r*(tex?.r??1)*(instanceColor?.r??1);out.g=color.g*(tex?.g??1)*(instanceColor?.g??1);out.b=color.b*(tex?.b??1)*(instanceColor?.b??1);
  out.er=em.r*(material.emissiveIntensity??1);out.eg=em.g*(material.emissiveIntensity??1);out.eb=em.b*(material.emissiveIntensity??1);
  out.opacity=material.opacity??1;out.side=material.side??THREE.FrontSide;out.basic=!!(material.isMeshBasicMaterial||material.isLineBasicMaterial);out.overlay=material.depthTest===false;out.additive=material.blending===THREE.AdditiveBlending;out.texture=tex;out.tone=material.toneMapped!==false;
  if(tex&&!tex.image)out.opacity*=tex.a;
  return out;
 }
 _lighting(scene){
  const l=this._light;l.x=-.48;l.y=.75;l.z=.44;l.ambient=.72;l.direct=.95;l.sr=1;l.sg=.94;l.sb=.82;l.ar=.85;l.ag=.95;l.ab=1;
  let found=false;
  scene.traverseVisible(o=>{if(o.isHemisphereLight){l.ambient=clamp(o.intensity*.32,.35,1.2);l.ar=.75+o.color.r*.25;l.ag=.75+o.color.g*.25;l.ab=.75+o.color.b*.25;}if(o.isDirectionalLight&&!found){found=true;o.getWorldPosition(this._direction);o.target.getWorldPosition(this._lightTarget);this._direction.sub(this._lightTarget).normalize();l.x=this._direction.x;l.y=this._direction.y;l.z=this._direction.z;l.direct=clamp(o.intensity*.42,.25,1.7);l.sr=.7+o.color.r*.3;l.sg=.7+o.color.g*.3;l.sb=.7+o.color.b*.3;}});
  const f=scene.fog;this._fog.density=f?.isFogExp2?f.density:0;this._fog.near=f?.isFog?f.near:0;this._fog.far=f?.isFog?f.far:0;
  if(f){this._fog.r=srgb(f.color.r)*255;this._fog.g=srgb(f.color.g)*255;this._fog.b=srgb(f.color.b)*255;}
 }
 _background(scene,camera){
  if(!scene.background&&!this.autoClear)return;
  const c=this.context;let top=null,bottom=null;scene.traverseVisible(o=>{const u=o.material?.uniforms;if(u?.top?.value?.isColor&&u?.bottom?.value?.isColor){top=u.top.value;bottom=u.bottom.value;}});
  if(top&&bottom){const t=top.clone().convertLinearToSRGB(),b=bottom.clone().convertLinearToSRGB();const horizon=clamp(.5+Math.sin(camera.rotation.x)*.6,.1,.95);const gradient=c.createLinearGradient(0,0,0,this.height);gradient.addColorStop(0,`rgb(${t.r*255|0},${t.g*255|0},${t.b*255|0})`);gradient.addColorStop(horizon,`rgb(${b.r*255|0},${b.g*255|0},${b.b*255|0})`);gradient.addColorStop(1,`rgb(${b.r*255|0},${b.g*255|0},${b.b*255|0})`);c.fillStyle=gradient;}
  else if(scene.background?.isColor){const b=scene.background;c.fillStyle=`rgb(${srgb(b.r)*255|0},${srgb(b.g)*255|0},${srgb(b.b)*255|0})`;}
  else c.fillStyle='#9aaeb1';c.fillRect(0,0,this.width,this.height);
 }
 _job(){let job=this._pool[this._count];if(!job){job={};this._pool[this._count]=job;}this._count++;this._commands.push(job);return job;}
 _shade(m,nx,ny,nz,vertexColors,offset,depth){
  const l=this._light;let length=Math.hypot(nx,ny,nz)||1;nx/=length;ny/=length;nz/=length;
  const nd=Math.max(0,nx*l.x+ny*l.y+nz*l.z),hemisphere=.85+ny*.15,ambient=l.ambient*hemisphere;
  let r=m.r*(vertexColors?vertexColors[offset]:1),g=m.g*(vertexColors?vertexColors[offset+1]:1),b=m.b*(vertexColors?vertexColors[offset+2]:1);
  if(!m.basic){r*=ambient*l.ar+l.direct*nd*l.sr;g*=ambient*l.ag+l.direct*nd*l.sg;b*=ambient*l.ab+l.direct*nd*l.sb;}
  r+=m.er;g+=m.eg;b+=m.eb;
  const exposure=m.tone?this.toneMappingExposure:1;
  if(m.tone&&this.toneMapping!==THREE.NoToneMapping){r=aces(r*exposure);g=aces(g*exposure);b=aces(b*exposure);}
  r=clamp(srgb(r),0,1)*255;g=clamp(srgb(g),0,1)*255;b=clamp(srgb(b),0,1)*255;
  const fog=this._fog,fogAmount=fog.density?1-Math.exp(-depth*depth*fog.density*fog.density):fog.far?clamp((depth-fog.near)/(fog.far-fog.near),0,1):0;
  if(fogAmount){r+=(fog.r-r)*fogAmount;g+=(fog.g-g)*fogAmount;b+=(fog.b-b)*fogAmount;}
  return `rgb(${r|0},${g|0},${b|0})`;
 }
 _emitTriangle(ax,ay,az,bx,by,bz,cx,cy,cz,color,m,texture,au,av,bu,bv,cu,cv){
  const sx=this._sx,sy=this._sy,hw=this.width*.5,hh=this.height*.5;
  const x0=hw+ax*sx/-az,y0=hh-ay*sy/-az,x1=hw+bx*sx/-bz,y1=hh-by*sy/-bz,x2=hw+cx*sx/-cz,y2=hh-cy*sy/-cz;
  if(Math.max(x0,x1,x2)<0||Math.min(x0,x1,x2)>this.width||Math.max(y0,y1,y2)<0||Math.min(y0,y1,y2)>this.height)return;
  const area=(x1-x0)*(y2-y0)-(y1-y0)*(x2-x0);if(Math.abs(area)<.18&&!m.overlay)return;
  const job=this._job();job.type=0;job.x0=x0;job.y0=y0;job.x1=x1;job.y1=y1;job.x2=x2;job.y2=y2;job.depth=m.overlay?-1e8:-(az+bz+cz)/3;job.color=color;job.opacity=m.opacity;job.additive=m.additive;job.texture=texture;job.au=au;job.av=av;job.bu=bu;job.bv=bv;job.cu=cu;job.cv=cv;this.info.render.triangles++;
 }
 _clipTriangle(a,b,c,cache,color,m,texture){
  const v=cache.view,uv=cache.uvs,A=this._clipA,B=this._clipB,near=-this._near;const ids=[a,b,c];
  for(let k=0;k<3;k++){const i=ids[k],j=k*5;A[j]=v[i*3];A[j+1]=v[i*3+1];A[j+2]=v[i*3+2];A[j+3]=uv?uv[i*2]:0;A[j+4]=uv?uv[i*2+1]:0;}
  let n=0;
  for(let i=0;i<3;i++){const j=i*5,k=((i+1)%3)*5,insideA=A[j+2]<=near,insideB=A[k+2]<=near;
   if(insideA){for(let q=0;q<5;q++)B[n*5+q]=A[j+q];n++;}
   if(insideA!==insideB){const t=(near-A[j+2])/(A[k+2]-A[j+2]);for(let q=0;q<5;q++)B[n*5+q]=A[j+q]+t*(A[k+q]-A[j+q]);n++;}
  }
  for(let i=1;i<n-1;i++){const j=i*5,k=(i+1)*5;this._emitTriangle(B[0],B[1],B[2],B[j],B[j+1],B[j+2],B[k],B[k+1],B[k+2],color,m,texture,B[3],B[4],B[j+3],B[j+4],B[k+3],B[k+4]);}
 }
 _mesh(object,worldMatrix,instanceColor){
  const geometry=object.geometry,cache=this._cache(geometry);if(!cache)return;
  if(object.frustumCulled!==false&&geometry.boundingSphere){this._sphere.copy(geometry.boundingSphere).applyMatrix4(worldMatrix);if(!this._frustum.intersectsSphere(this._sphere))return;}
  const materials=Array.isArray(object.material)?object.material:[object.material];if(!materials.length)return;
  this._mv.multiplyMatrices(this._viewMatrix,worldMatrix);this._normal.getNormalMatrix(worldMatrix);const e=this._mv.elements,N=this._normal.elements,view=cache.view,p=cache.positions;
  for(let i=0;i<cache.count;i++){const j=i*3,x=p[j],y=p[j+1],z=p[j+2];view[j]=e[0]*x+e[4]*y+e[8]*z+e[12];view[j+1]=e[1]*x+e[5]*y+e[9]*z+e[13];view[j+2]=e[2]*x+e[6]*y+e[10]*z+e[14];}
  const indices=cache.indices,uv=cache.uvs,normals=cache.normals,colors=cache.faceColors,start=Math.max(0,geometry.drawRange.start||0),end=Math.min(cache.triangles*3,start+(geometry.drawRange.count||Infinity));
  let materialIndex=-1,m=null,texture=null;const groups=geometry.groups;let groupIndex=0;
  for(let j=start;j<end;j+=3){
   while(groupIndex<groups.length-1&&j>=groups[groupIndex].start+groups[groupIndex].count)groupIndex++;
   const mi=materials.length>1?(groups[groupIndex]?.materialIndex||0):0;
   if(mi!==materialIndex){materialIndex=mi;const mat=materials[mi];if(!mat||mat.visible===false||mat.isShaderMaterial||mat.opacity===0){m=null;continue;}m=this._material(mat,instanceColor);texture=m.texture?.image&&cache.triangles<=8&&uv?m.texture:null;}
   if(!m)continue;
   const a=indices?indices[j]:j,b=indices?indices[j+1]:j+1,c=indices?indices[j+2]:j+2,ai=a*3,bi=b*3,ci=c*3;
   const az=view[ai+2],bz=view[bi+2],cz=view[ci+2];if(az>-this._near&&bz>-this._near&&cz>-this._near)continue;if(az< -this._far&&bz< -this._far&&cz< -this._far)continue;
   const ax=view[ai],ay=view[ai+1],bx=view[bi],by=view[bi+1],cx=view[ci],cy=view[ci+1];
   if(m.side!==THREE.DoubleSide){const nx=(by-ay)*(cz-az)-(bz-az)*(cy-ay),ny=(bz-az)*(cx-ax)-(bx-ax)*(cz-az),nz=(bx-ax)*(cy-ay)-(by-ay)*(cx-ax);const facing=nx*ax+ny*ay+nz*az;if(m.side===THREE.FrontSide?facing>=0:facing<=0)continue;}
   // Reject offscreen faces before color conversion and fog shading.
   if(az<=-this._near&&bz<=-this._near&&cz<=-this._near){
    const x0=ax*this._sx/-az,y0=ay*this._sy/-az,x1=bx*this._sx/-bz,y1=by*this._sy/-bz,x2=cx*this._sx/-cz,y2=cy*this._sy/-cz,hw=this.width*.5,hh=this.height*.5;
    if(Math.max(x0,x1,x2)<-hw||Math.min(x0,x1,x2)>hw||Math.max(y0,y1,y2)<-hh||Math.min(y0,y1,y2)>hh)continue;
    if(Math.abs((x1-x0)*(y2-y0)-(y1-y0)*(x2-x0))<.18&&!m.overlay)continue;
   }
   const nx=normals[j],ny=normals[j+1],nz=normals[j+2],depth=-(az+bz+cz)/3;
   const color=this._shade(m,N[0]*nx+N[3]*ny+N[6]*nz,N[1]*nx+N[4]*ny+N[7]*nz,N[2]*nx+N[5]*ny+N[8]*nz,colors,j,depth);
   if(az>-this._near||bz>-this._near||cz>-this._near)this._clipTriangle(a,b,c,cache,color,m,texture);
   else this._emitTriangle(ax,ay,az,bx,by,bz,cx,cy,cz,color,m,texture,uv?uv[a*2]:0,uv?uv[a*2+1]:0,uv?uv[b*2]:0,uv?uv[b*2+1]:0,uv?uv[c*2]:0,uv?uv[c*2+1]:0);
  }
  this.info.render.calls++;
 }
 _line(object){
  const geometry=object.geometry,p=geometry.attributes.position;if(!p)return;const mat=Array.isArray(object.material)?object.material[0]:object.material;if(!mat||mat.visible===false||mat.opacity===0)return;
  this._mv.multiplyMatrices(this._viewMatrix,object.matrixWorld);const e=this._mv.elements,m=this._material(mat),indices=geometry.index?.array,count=indices?.length||p.count,step=object.isLineSegments?2:1;
  for(let i=0;i<count-1;i+=step){const ia=indices?indices[i]:i,ib=indices?indices[i+1]:i+1;let x=p.getX(ia),y=p.getY(ia),z=p.getZ(ia);let ax=e[0]*x+e[4]*y+e[8]*z+e[12],ay=e[1]*x+e[5]*y+e[9]*z+e[13],az=e[2]*x+e[6]*y+e[10]*z+e[14];x=p.getX(ib);y=p.getY(ib);z=p.getZ(ib);let bx=e[0]*x+e[4]*y+e[8]*z+e[12],by=e[1]*x+e[5]*y+e[9]*z+e[13],bz=e[2]*x+e[6]*y+e[10]*z+e[14];
   if(az>-this._near&&bz>-this._near)continue;
   if(az>-this._near){const t=(-this._near-az)/(bz-az);ax+=(bx-ax)*t;ay+=(by-ay)*t;az=-this._near;}else if(bz>-this._near){const t=(-this._near-bz)/(az-bz);bx+=(ax-bx)*t;by+=(ay-by)*t;bz=-this._near;}
   const job=this._job();job.type=1;job.x0=this.width*.5+ax*this._sx/-az;job.y0=this.height*.5-ay*this._sy/-az;job.x1=this.width*.5+bx*this._sx/-bz;job.y1=this.height*.5-by*this._sy/-bz;job.depth=-(az+bz)/2;job.color=this._shade(m,0,1,0,null,0,job.depth);job.opacity=m.opacity;job.width=Math.max(.7,(mat.linewidth||1)*this._ratio);job.additive=m.additive;job.texture=null;this.info.render.lines++;
  }
  this.info.render.calls++;
 }
 _drawTexture(c,j){
  const texture=j.texture,image=texture.image,w=image.width,h=image.height;const u0=j.au*w,v0=(texture.flipY?1-j.av:j.av)*h,u1=j.bu*w,v1=(texture.flipY?1-j.bv:j.bv)*h,u2=j.cu*w,v2=(texture.flipY?1-j.cv:j.cv)*h;
  const det=u0*(v1-v2)+u1*(v2-v0)+u2*(v0-v1);if(Math.abs(det)<1e-8)return false;
  const a=(j.x0*(v1-v2)+j.x1*(v2-v0)+j.x2*(v0-v1))/det,b=(j.y0*(v1-v2)+j.y1*(v2-v0)+j.y2*(v0-v1))/det;
  const d=(j.y0*(u2-u1)+j.y1*(u0-u2)+j.y2*(u1-u0))/det,cc=(j.x0*(u2-u1)+j.x1*(u0-u2)+j.x2*(u1-u0))/det;
  const e=(j.x0*(u1*v2-u2*v1)+j.x1*(u2*v0-u0*v2)+j.x2*(u0*v1-u1*v0))/det,f=(j.y0*(u1*v2-u2*v1)+j.y1*(u2*v0-u0*v2)+j.y2*(u0*v1-u1*v0))/det;
  c.save();c.clip();c.transform(a,b,cc,d,e,f);try{c.drawImage(image,0,0);}catch{c.restore();return false;}c.restore();return true;
 }
 render(scene,camera){
  if(this.info.autoReset)this.info.reset();if(this.autoClear&&this._layer===0)this.clear();
  scene.updateMatrixWorld();if(camera.parent===null)camera.updateMatrixWorld();camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
  this._viewMatrix=camera.matrixWorldInverse;this._near=Math.max(.015,camera.near||.05);this._far=camera.far||250;this._sx=camera.projectionMatrix.elements[0]*this.width*.5;this._sy=camera.projectionMatrix.elements[5]*this.height*.5;
  this._vp.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);this._frustum.setFromProjectionMatrix(this._vp);
  this._lighting(scene);this._background(scene,camera);this._commands.length=0;this._count=0;
  const instanceColor={r:1,g:1,b:1};
  scene.traverseVisible(object=>{
   if(!object.layers.test(camera.layers))return;
   if(object.isInstancedMesh){const array=object.instanceMatrix.array,colors=object.instanceColor?.array;for(let i=0;i<object.count;i++){this._instance.fromArray(array,i*16);this._world.multiplyMatrices(object.matrixWorld,this._instance);if(colors){instanceColor.r=colors[i*3];instanceColor.g=colors[i*3+1];instanceColor.b=colors[i*3+2];}else instanceColor.r=instanceColor.g=instanceColor.b=1;this._mesh(object,this._world,instanceColor);}}
   else if(object.isMesh&&!object.material?.isShaderMaterial)this._mesh(object,object.matrixWorld,null);
   else if(object.isLine)this._line(object);
  });
  this._commands.sort((a,b)=>b.depth-a.depth);
  const c=this.context;let color='',alpha=-1,blend='';c.setTransform(1,0,0,1,0,0);c.lineJoin='round';
  for(const job of this._commands){const composite=job.additive?'lighter':'source-over';if(blend!==composite){c.globalCompositeOperation=composite;blend=composite;}if(alpha!==job.opacity){c.globalAlpha=job.opacity;alpha=job.opacity;}
   c.beginPath();c.moveTo(job.x0,job.y0);c.lineTo(job.x1,job.y1);
   if(job.type===1){c.strokeStyle=job.color;c.lineWidth=job.width;c.stroke();continue;}
   c.lineTo(job.x2,job.y2);c.closePath();if(job.texture&&this._drawTexture(c,job))continue;
   if(color!==job.color){c.fillStyle=job.color;color=job.color;}c.fill();
  }
  c.globalAlpha=1;c.globalCompositeOperation='source-over';
 }
}
