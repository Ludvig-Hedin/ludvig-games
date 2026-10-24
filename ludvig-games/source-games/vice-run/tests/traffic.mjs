// Traffic soak test for Neon (vice-run): 2.5 simulated minutes of city traffic with the player parked.
// Run: node --max-old-space-size=768 source-games/vice-run/tests/traffic.mjs
// Stub DOM + stub WebGL: stub DOM + stub WebGL renderer, then drive the game loop.
import fs from 'node:fs'; import vm from 'node:vm';
const file=new URL('../index.html',import.meta.url),touch=process.argv.includes('touch');
const html=fs.readFileSync(file,'utf8');
const failures=[];const fail=(m)=>{failures.push(m);console.log('FAIL:',m);};
let clock=1000;
// ---------- fake DOM ----------
const initial=new Map();for(const m of html.matchAll(/<(\w+)\b([^>]*?)\bid="([^"]+)"([^>]*)>/g)){const attrs=m[2]+' '+m[4];const cls=(attrs.match(/class="([^"]*)"/)||[])[1]||'';initial.set(m[3],{tag:m[1],cls:cls.split(/\s+/).filter(Boolean),hidden:/\shidden(\s|$|>)/.test(' '+attrs+' ')});}
function ctx2d(){return new Proxy({},{get(t,p){if(p in t)return t[p];if(p==='createImageData')return (w,h)=>({data:new Uint8ClampedArray(w*h*4)});if(p==='measureText')return ()=>({width:10});return ()=>({addColorStop(){}});},set(t,p,v){t[p]=v;return true;}});}
class El{constructor(tag='div',id=''){this.tagName=tag.toUpperCase();this.id=id;this.style={};this.dataset={};this.children=[];this.listeners={};this.attributes={};this._text='';this.innerHTML='';this.value='';this.checked=false;this.disabled=false;this.hidden=false;const set=new Set();this.classList={add:(...c)=>c.forEach(x=>set.add(x)),remove:(...c)=>c.forEach(x=>set.delete(x)),toggle:(c,f)=>{const on=f===undefined?!set.has(c):!!f;on?set.add(c):set.delete(c);return on;},contains:c=>set.has(c),_set:set};this.width=300;this.height=150;this.type='';}
 get className(){return [...this.classList._set].join(' ');}set className(v){this.classList._set.clear();String(v).split(/\s+/).filter(Boolean).forEach(c=>this.classList._set.add(c));}
 get textContent(){return this._text;}set textContent(v){this._text=String(v);}
 addEventListener(t,f){(this.listeners[t]||=[]).push(f);}removeEventListener(){}
 fire(t,e={}){const ev={type:t,target:this,preventDefault(){},stopPropagation(){},pointerId:1,clientX:0,clientY:0,...e};for(const f of this.listeners[t]||[])f(ev);if(this['on'+t])this['on'+t](ev);return ev;}
 click(){this.fire('click');}
 setAttribute(k,v){this.attributes[k]=String(v);}getAttribute(k){return this.attributes[k]??null;}
 append(...n){this.children.push(...n);}appendChild(n){this.children.push(n);return n;}replaceChildren(...n){this.children=n;}remove(){}
 querySelector(){return new El();}querySelectorAll(){return [];}
 getBoundingClientRect(){return {left:0,top:0,width:120,height:120};}
 focus(){}blur(){}select(){}setPointerCapture(){}releasePointerCapture(){}requestPointerLock(){return Promise.resolve();}
 getContext(k){if(k==='2d')return ctx2d();return {fake:true};}
}
const els=new Map();
function byId(id){if(!els.has(id)){const i=initial.get(id);const e=new El(i?i.tag:'div',id);if(i){i.cls.forEach(c=>e.classList.add(c));e.hidden=i.hidden;}els.set(id,e);}return els.get(id);}
const groups={};const qsa=sel=>{if(groups[sel])return groups[sel];let out=[];
 if(sel==='#mp-modes button')out=['free','tag','race'].map(m=>{const e=new El('button');e.dataset.mode=m;return e;});
 else if(sel==='#mp-routes button')out=[0,1,2].map(m=>{const e=new El('button');e.dataset.route=String(m);return e;});
 else if(sel==='#mp-emotes button')out=[0,1,2,3].map(m=>{const e=new El('button');e.dataset.emote=String(m);return e;});
 else if(sel==='.haul-dots i')out=[new El('i'),new El('i'),new El('i')];
 groups[sel]=out;return out;};
const winListeners={},docListeners={};
const store=new Map();
const document={getElementById:byId,createElement:t=>new El(t),querySelectorAll:qsa,querySelector:()=>byId('__weapon'),addEventListener:(t,f)=>{(docListeners[t]||=[]).push(f);},body:new El('body'),pointerLockElement:null,exitPointerLock(){},hidden:false,execCommand:()=>true};
let rafs=[];
const errors=[];
const sandbox={document,console:{log:console.log,warn(){},error:(...a)=>{errors.push(a.map(String).join(' '));}},
 innerWidth:touch?390:1280,innerHeight:touch?844:760,devicePixelRatio:touch?3:2,matchMedia:q=>({matches:touch&&/coarse/.test(q),addEventListener(){}}),
 performance:{now:()=>clock},requestAnimationFrame:f=>{rafs.push(f);return rafs.length;},setTimeout:(f,ms)=>{return 0;},clearTimeout(){},setInterval:()=>0,clearInterval(){},
 localStorage:{getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)},
 location:{protocol:'https:',search:'',origin:'https://games.example',pathname:'/vice-run/',host:'games.example'},navigator:{onLine:true,clipboard:{writeText:()=>Promise.resolve()}},
 addEventListener:(t,f)=>{(winListeners[t]||=[]).push(f);},removeEventListener(){},AbortController,URLSearchParams,Promise,Math,Date,JSON,Map,Set,WeakMap,Float32Array,Float64Array,Uint8Array,Uint16Array,Uint32Array,Int16Array,Int32Array,Uint8ClampedArray,ArrayBuffer,DataView,Symbol,Object,Array,Number,String,Boolean,Error,TypeError,RangeError,Proxy,Reflect,parseInt,parseFloat,isFinite,isNaN,
};
sandbox.window=sandbox;sandbox.self=sandbox;sandbox.globalThis=sandbox;sandbox.top=sandbox;
vm.createContext(sandbox);
const blocks=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]).filter(c=>c.trim());
vm.runInContext(blocks[0],sandbox,{filename:'three.js'});
// Stub WebGL: real THREE scene graph, no GPU.
vm.runInContext(`(()=>{const T=THREE;class R{constructor(o){this.domElement=o.canvas;this.pr=1;this.shadowMap={enabled:false,type:0,needsUpdate:false};this.capabilities={getMaxAnisotropy:()=>8};this.info={render:{calls:0,triangles:0}};this.frames=0;}
 setPixelRatio(r){this.pr=r;}getPixelRatio(){return this.pr;}setSize(w,h){this.domElement.width=Math.floor(w*this.pr);this.domElement.height=Math.floor(h*this.pr);}
 render(s,c){s.updateMatrixWorld();c.updateMatrixWorld();this.frames++;let n=0;s.traverseVisible(o=>{if(o.isMesh||o.isPoints)n++;});this.info.render.calls=n;}}
 T.WebGLRenderer=R;T.PMREMGenerator=class{fromScene(){return {texture:null,dispose(){}};}dispose(){}};})();`,sandbox);
let src=blocks[2].replace("window.ViceRun=Object.freeze({","window.__t={get heat(){return heat},set heat(v){heat=v},get state(){return state},get mode(){return gameMode},police,player,cars,traffic,extraCars,remoteBodies,nodes,perf,tod,glow,placeRoadblock,blockedSegment,get roadblockClock(){return roadblockClock},set roadblockClock(v){roadblockClock=v},get grace(){return grace},set grace(v){grace=v},get elapsed(){return elapsed}};window.ViceRun=Object.freeze({");
vm.runInContext(blocks[1],sandbox,{filename:'rules.js'});
vm.runInContext(src,sandbox,{filename:'game.js'});
const t=sandbox.__t,status=()=>sandbox.ViceRun.status();
function frames(n,ms=16.7){for(let i=0;i<n;i++){clock+=ms;const q=rafs;rafs=[];for(const f of q){try{f(clock);}catch(e){fail('frame: '+e.stack.split('\n').slice(0,3).join(' | '));return false;}}}return true;}
const key=(code,down=true)=>{for(const f of winListeners[down?'keydown':'keyup']||[])f({code,repeat:false,preventDefault(){},target:{}});};

frames(60);byId('start').onclick();frames(10);
const parked=t.player.car,startX=parked.x,startZ=parked.z,snap=()=>t.traffic.map(c=>({x:c.x,z:c.z}));
for(let round=0;round<5;round++){
 const a=snap();frames(60*30);
 const live=t.traffic.filter(c=>c.active&&!c.parked),still=t.traffic.filter((c,i)=>c.active&&!c.parked&&Math.hypot(c.x-a[i].x,c.z-a[i].z)<5).length;
 const damaged=live.filter(c=>c.health<100).length;
 console.log('30 s round',round,'stuck',still,'of',live.length,'damaged',damaged);
 if(still>4)fail('traffic is stuck: '+still+' cars did not move in 30 s');
 if(damaged>3)fail('traffic keeps crashing: '+damaged+' damaged cars');
}
const pushed=Math.hypot(parked.x-startX,parked.z-startZ);console.log('parked player car moved',pushed.toFixed(2),'m');
if(pushed>1)fail('traffic shoved the parked player car '+pushed.toFixed(1)+' m');
if(failures.length){console.log('TRAFFIC FAILED');process.exit(1);}console.log('TRAFFIC OK');
