/* Small purpose-built WebGL renderer: no CDN, install, textures or network required. */
(function(){'use strict';const S=window.SKY;
const v3=(x=0,y=0,z=0)=>[x,y,z],sub=(a,b)=>a.map((v,i)=>v-b[i]),dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const norm=a=>{const l=Math.hypot(...a)||1;return a.map(v=>v/l);};
const color=c=>Array.isArray(c)?c:[((c>>16)&255)/255,((c>>8)&255)/255,(c&255)/255];
function matrix(x=0,y=0,z=0,h=0,p=0,b=0,k=1){
 const ch=Math.cos(h),sh=Math.sin(h),cp=Math.cos(p),sp=Math.sin(p),cb=Math.cos(b),sb=Math.sin(b);
 return new Float32Array([(ch*cb-sh*sp*sb)*k,cp*sb*k,(sh*cb+ch*sp*sb)*k,0,(-ch*sb-sh*sp*cb)*k,cp*cb*k,(-sh*sb+ch*sp*cb)*k,0,-sh*cp*k,-sp*k,ch*cp*k,0,x,y,z,1]);
}
function multiply(a,b){const o=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++)o[c*4+r]=a[r]*b[c*4]+a[4+r]*b[c*4+1]+a[8+r]*b[c*4+2]+a[12+r]*b[c*4+3];return o;}
function transform(m,v){return[m[0]*v[0]+m[4]*v[1]+m[8]*v[2]+m[12],m[1]*v[0]+m[5]*v[1]+m[9]*v[2]+m[13],m[2]*v[0]+m[6]*v[1]+m[10]*v[2]+m[14]];}
const I=matrix();
class Geometry{
 constructor(){this.data=[];}
 triangle(a,b,c,col,alpha=1){const n=norm(cross(sub(b,a),sub(c,a))),cc=color(col);for(const v of[a,b,c])this.data.push(...v,...n,...cc,alpha);return this;}
 quad(a,b,c,d,col,alpha=1){this.triangle(a,b,c,col,alpha);this.triangle(a,c,d,col,alpha);return this;}
 box(x,y,z,w,h,d,col,heading=0){const t=matrix(x,y,z,heading),p=[[-w/2,-h/2,-d/2],[w/2,-h/2,-d/2],[w/2,h/2,-d/2],[-w/2,h/2,-d/2],[-w/2,-h/2,d/2],[w/2,-h/2,d/2],[w/2,h/2,d/2],[-w/2,h/2,d/2]].map(v=>transform(t,v));
  for(const f of[[0,3,2,1],[4,5,6,7],[3,7,6,2],[0,1,5,4],[0,4,7,3],[1,2,6,5]])this.quad(...f.map(i=>p[i]),col);return this;}
 cylinder(x,y,z,r1,r2,h,col,n=10,heading=0,pitch=0,bank=0){const m=matrix(x,y,z,heading,pitch,bank),t=v=>transform(m,v);
  for(let i=0;i<n;i++){const a=i*S.TAU/n,b=(i+1)*S.TAU/n;
   const p=t([Math.cos(a)*r1,-h/2,Math.sin(a)*r1]),q=t([Math.cos(b)*r1,-h/2,Math.sin(b)*r1]),r=t([Math.cos(b)*r2,h/2,Math.sin(b)*r2]),s=t([Math.cos(a)*r2,h/2,Math.sin(a)*r2]);
   this.quad(p,s,r,q,col);if(r2)this.triangle(t([0,h/2,0]),r,s,col);if(r1)this.triangle(t([0,-h/2,0]),p,q,col);
  }return this;}
 sphere(x,y,z,rx,ry,rz,col,n=12,l=7){for(let j=0;j<l;j++)for(let i=0;i<n;i++){
  const point=(a,b)=>[x+Math.sin(b)*Math.cos(a)*rx,y+Math.cos(b)*ry,z+Math.sin(b)*Math.sin(a)*rz];
  const a=i*S.TAU/n,b=(i+1)*S.TAU/n,c=j*Math.PI/l,d=(j+1)*Math.PI/l;
  this.quad(point(a,c),point(b,c),point(b,d),point(a,d),col);
 }return this;}
 torus(radius,tube,col,segments=64,sides=6,start=0,end=S.TAU){for(let i=0;i<segments;i++)for(let j=0;j<sides;j++){
  const p=(a,b)=>[(radius+tube*Math.cos(b))*Math.cos(a),(radius+tube*Math.cos(b))*Math.sin(a),tube*Math.sin(b)];
  const a=start+(end-start)*i/segments,b=start+(end-start)*(i+1)/segments,c=j*S.TAU/sides,d=(j+1)*S.TAU/sides;
  this.quad(p(a,c),p(b,c),p(b,d),p(a,d),col);
 }return this;}
 disk(x,y,z,rx,rz,col,alpha=1,n=20){for(let i=0;i<n;i++){const a=i*S.TAU/n,b=(i+1)*S.TAU/n;this.triangle([x,y,z],[x+Math.cos(b)*rx,y,z+Math.sin(b)*rz],[x+Math.cos(a)*rx,y,z+Math.sin(a)*rz],col,alpha);}return this;}
 merge(g,m=I){for(let i=0;i<g.data.length;i+=10){const d=g.data,v=transform(m,d.slice(i,i+3)),n=d.slice(i+3,i+6),nn=norm([m[0]*n[0]+m[4]*n[1]+m[8]*n[2],m[1]*n[0]+m[5]*n[1]+m[9]*n[2],m[2]*n[0]+m[6]*n[1]+m[10]*n[2]]);this.data.push(...v,...nn,...d.slice(i+6,i+10));}return this;}
}
const VS=`attribute vec3 aPosition;attribute vec3 aNormal;attribute vec4 aColor;
uniform mat4 uModel;uniform mat4 uVP;varying vec3 vWorld;varying vec3 vNormal;varying vec4 vColor;
void main(){vec4 w=uModel*vec4(aPosition,1.);vWorld=w.xyz;vNormal=normalize(mat3(uModel)*aNormal);vColor=aColor;gl_Position=uVP*w;}`;
const FS=`precision highp float;varying vec3 vWorld;varying vec3 vNormal;varying vec4 vColor;
uniform vec3 uEye;uniform float uTime;uniform float uMode;uniform float uAlpha;
void main(){vec3 light=normalize(vec3(-.55,.82,-.32));vec3 n=normalize(vNormal);vec3 view=normalize(uEye-vWorld);
 float diffuse=max(dot(n,light),0.);vec3 c=vColor.rgb*(.60+diffuse*.56);float a=vColor.a*uAlpha;
 if(uMode>1.5){c=vColor.rgb;}
 else if(uMode>.5){float wave=sin(vWorld.x*.068+uTime*.55)*sin(vWorld.z*.08-uTime*.8);n=normalize(vec3(wave*.055,1.,cos(vWorld.x*.049+uTime*.6)*.065));
 float fr=pow(1.-max(dot(n,view),0.),3.);float spec=pow(max(dot(reflect(-light,n),view),0.),90.);
 c=mix(vec3(.14,.48,.55),vec3(.65,.80,.82),fr*.6)+wave*.012+vec3(1.,.86,.61)*spec*.75;
 }
 float d=distance(vWorld,uEye);float fog=1.-exp(-pow(d*.00044,1.52));c=mix(c,vec3(.72,.83,.84),min(.995,fog));
 gl_FragColor=vec4(c,a);}`;
const SKYVS=`attribute vec2 aPosition;varying vec2 vUV;void main(){vUV=aPosition;gl_Position=vec4(aPosition,.99999,1.);}`;
const SKYFS=`precision highp float;varying vec2 vUV;uniform vec3 uForward;uniform vec3 uRight;uniform vec3 uUp;uniform float uAspect;uniform float uTan;
void main(){vec3 ray=normalize(uForward+uRight*vUV.x*uAspect*uTan+uUp*vUV.y*uTan);float h=max(ray.y,0.);vec3 c=mix(vec3(.75,.85,.85),vec3(.31,.63,.78),pow(h,.48));
 vec3 sun=normalize(vec3(-.55,.45,-.7));float s=max(dot(ray,sun),0.);c+=vec3(1.,.79,.47)*(pow(s,80.)*.15+pow(s,1700.)*.72);gl_FragColor=vec4(c,1.);}`;
class Renderer{
 constructor(canvas){
  this.canvas=canvas;const gl=canvas.getContext('webgl',{antialias:true,alpha:false,powerPreference:'high-performance',preserveDrawingBuffer:true});
  if(!gl)throw new Error('WebGL is unavailable. Enable graphics acceleration in your browser, then reopen the game.');
  this.gl=gl;this.program=this.programFor(VS,FS);this.sky=this.programFor(SKYVS,SKYFS);this.draws=0;
  this.uniforms={};for(const n of['uModel','uVP','uEye','uTime','uMode','uAlpha'])this.uniforms[n]=gl.getUniformLocation(this.program,n);
  this.attrs={};for(const n of['aPosition','aNormal','aColor'])this.attrs[n]=gl.getAttribLocation(this.program,n);
  this.skyBuffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.skyBuffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
  gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
  // Procedural meshes use both winding conventions; two-sided lighting avoids disappearing low-poly surfaces.
  gl.disable(gl.CULL_FACE);this.quality=1.35;this.resize();
 }
 programFor(v,f){const gl=this.gl,p=gl.createProgram();for(const[type,source]of[[gl.VERTEX_SHADER,v],[gl.FRAGMENT_SHADER,f]]){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));gl.attachShader(p,s);}gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(p));return p;}
 mesh(g,mode=0){const gl=this.gl,b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(g.data),gl.STATIC_DRAW);return{buffer:b,count:g.data.length/10,mode};}
 resize(){const ratio=Math.min(window.devicePixelRatio||1,this.quality);this.canvas.width=Math.round(innerWidth*ratio);this.canvas.height=Math.round(innerHeight*ratio);this.gl.viewport(0,0,this.canvas.width,this.canvas.height);}
 begin(eye,target,fov=62,time=0){
  this.eye=eye;this.time=time;this.fov=fov;const gl=this.gl,back=norm(sub(eye,target)),right=norm(cross([0,1,0],back)),up=cross(back,right),forward=back.map(x=>-x);
  this.right=right;this.up=up;this.forward=forward;
  const view=new Float32Array([right[0],up[0],back[0],0,right[1],up[1],back[1],0,right[2],up[2],back[2],0,-dot(right,eye),-dot(up,eye),-dot(back,eye),1]);
  const f=1/Math.tan(fov*Math.PI/360),aspect=this.canvas.width/this.canvas.height,near=.25,far=16000;
  const projection=new Float32Array([f/aspect,0,0,0,0,f,0,0,0,0,-(far+near)/(far-near),-1,0,0,-2*far*near/(far-near),0]);
  this.vp=multiply(projection,view);gl.clearColor(.7,.82,.85,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  gl.useProgram(this.sky);gl.disable(gl.DEPTH_TEST);gl.depthMask(false);
  gl.bindBuffer(gl.ARRAY_BUFFER,this.skyBuffer);const a=gl.getAttribLocation(this.sky,'aPosition');gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,2,gl.FLOAT,false,0,0);
  for(const[n,v]of[['uForward',forward],['uRight',right],['uUp',up]])gl.uniform3fv(gl.getUniformLocation(this.sky,n),v);
  gl.uniform1f(gl.getUniformLocation(this.sky,'uAspect'),aspect);gl.uniform1f(gl.getUniformLocation(this.sky,'uTan'),1/f);gl.drawArrays(gl.TRIANGLES,0,6);gl.disableVertexAttribArray(a);
  gl.enable(gl.DEPTH_TEST);gl.depthMask(true);gl.useProgram(this.program);gl.uniformMatrix4fv(this.uniforms.uVP,false,this.vp);gl.uniform3fv(this.uniforms.uEye,eye);gl.uniform1f(this.uniforms.uTime,time);this.draws=0;
 }
 draw(mesh,m=I,alpha=1){if(!mesh||!mesh.count)return;const gl=this.gl;gl.bindBuffer(gl.ARRAY_BUFFER,mesh.buffer);for(const[n,size,offset]of[['aPosition',3,0],['aNormal',3,12],['aColor',4,24]]){const a=this.attrs[n];gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,size,gl.FLOAT,false,40,offset);}
 gl.uniformMatrix4fv(this.uniforms.uModel,false,m);gl.uniform1f(this.uniforms.uMode,mesh.mode);gl.uniform1f(this.uniforms.uAlpha,alpha);gl.depthMask(alpha>=.99);gl.drawArrays(gl.TRIANGLES,0,mesh.count);gl.depthMask(true);this.draws++;}
 project(p){const m=this.vp,v=[p.x,p.y,p.z],x=m[0]*v[0]+m[4]*v[1]+m[8]*v[2]+m[12],y=m[1]*v[0]+m[5]*v[1]+m[9]*v[2]+m[13],w=m[3]*v[0]+m[7]*v[1]+m[11]*v[2]+m[15];return{x:(x/w*.5+.5)*innerWidth,y:(-y/w*.5+.5)*innerHeight,front:w>0,w};}
}
Object.assign(S,{v3,sub,dot,cross,norm,color,matrix,multiply,transform,Geometry,Renderer});
})();
