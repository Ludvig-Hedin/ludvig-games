// Runtime smoke test for Neon (vice-run). Run: node --max-old-space-size=768 source-games/vice-run/tests/smoke.mjs [touch]
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
// ---------- title ----------
if(!frames(60))process.exit(1);
console.log('title ok, draw objects',status().drawCalls,'glow',t.glow.on);
// ---------- heist ----------
byId('start').onclick();frames(30);
if(t.state!=='playing')fail('heist did not start');
key('KeyW');frames(60*20);
let s=status();console.log('after 20s drive: pos',s.position.x.toFixed(1),s.position.z.toFixed(1),'speed',s.speed.toFixed(1),'cars',s.cars,'state',s.state);
// night falls during the run
t.tod.p=.4;frames(5);console.log('night',t.tod.night.toFixed(2));if(t.tod.night<.9)fail('night not reached');
// police escalation and a roadblock
t.heat=4;t.grace=0;frames(60*8);
const activeCops=t.police.filter(c=>c.active).length;console.log('cops active at 4 stars',activeCops);if(activeCops<2)fail('police did not spawn');
// Force a roadblock attempt with a fast player car heading along a road.
const car=t.player.car;if(car){car.x=0;car.z=150;car.yaw=0;car.vx=0;car.vz=-25;}
t.heat=4;if(!t.placeRoadblock())fail('roadblock not placed');frames(2);
const blocks2=t.police.filter(c=>c.block>0).length;console.log('roadblock cars',blocks2);
frames(60*10);key('KeyW',false);
// traffic sanity: cars stay on the city and keep moving
let off=0,moving=0;for(const c of t.traffic){if(!c.active)continue;if(Math.abs(c.x)>245||Math.abs(c.z)>250)off++;if(Math.hypot(c.vx,c.vz)>1)moving++;}
console.log('traffic moving',moving,'off map',off);if(off)fail('traffic left the map');if(moving<10)fail('traffic stalled');
// adaptive quality
for(let i=0;i<400;i++)t.perf.tick(.04);console.log('perf level after slow frames',t.perf.level);if(t.perf.level<2)fail('perf did not step down');
for(let i=0;i<2000;i++)t.perf.tick(.0167);console.log('perf level later',t.perf.level);
byId('pause').onclick();frames(5);byId('resume').onclick();frames(5);
// ---------- online ----------
const sent=[];let room;
function makeRoom(){const ls={};room={code:'ABCD',self:{id:'A'},host:'A',seed:12345,meta:{},peers:[{id:'A',name:'Tester',joinedAt:1},{id:'B',name:'Remote',joinedAt:2}],
 on(tp,f){(ls[tp]||=[]).push(f);return ()=>{};},emit(tp,...a){for(const f of ls[tp]||[])f(...a);},send(d){sent.push({to:'*',d:JSON.parse(JSON.stringify(d))});},sendTo(id,d){sent.push({to:id,d:JSON.parse(JSON.stringify(d))});},setMeta(m){this.meta=m;this.emit('meta',m);},leave(){this.left=true;}};return room;}
sandbox.Ludvig={player:{id:'x',name:'Tester'},mp:{join:async()=>makeRoom(),create:async()=>makeRoom(),list:async()=>[]}};
// back to title through a lost run is not needed: open the sheet from the title by finishing the heist via pause→restart? Use title directly.
t.player.health=-1;// not used
byId('online').hidden=false;
// emulate state title
vm.runInContext("void 0",sandbox);
byId('online').fire('click');
await new Promise(r=>setImmediate(r));
byId('mp-quick').onclick();await new Promise(r=>setImmediate(r));await new Promise(r=>setImmediate(r));
frames(10);
console.log('online mode',t.mode,'state',t.state);if(t.mode!=='online')fail('did not enter online');
const remoteMsg=(d)=>room.emit('message','B',d,false);
let bx=20,bz=140;
function remoteDrive(n,fn){for(let i=0;i<n;i++){if(i%6===0){fn&&fn(i);remoteMsg({t:'s',x:bx,z:bz,y:0,v:12,m:1,k:0,s:0});}frames(1);}}
remoteDrive(60,()=>{bz-=1;});
console.log('remote cars',t.extraCars.length,'bodies',t.remoteBodies.length);if(!t.extraCars.length)fail('no remote car');
key('KeyW');remoteDrive(60);const before=sent.length;remoteDrive(120);key('KeyW',false);const poses=sent.slice(before).filter(x=>x.d.t==='s').length;console.log('pose packets in 2 s while driving',poses);if(poses>21||poses<15)fail('pose rate off: '+poses);
remoteMsg({t:'e',e:1});remoteMsg({t:'h'});frames(5);
// Tag: host starts, self is it (Math.random → 0), remote touches.
const R0=Math.random;sandbox.Math.random=()=>0;
qsa('#mp-modes button')[1].onclick();sandbox.Math.random=R0;frames(2);
let tg=sent.filter(x=>x.d.t==='tg').pop();console.log('tag it',tg&&tg.d.it);if(!tg||tg.d.it!=='A')fail('tag did not start with A');
frames(60*3.2);// immunity
const me=t.player.car||t.player;bx=me.x+1;bz=me.z;remoteDrive(24);
tg=sent.filter(x=>x.d.t==='tg').pop();console.log('tag it after touch',tg.d.it);if(tg.d.it!=='B')fail('touch did not pass it');
bx=me.x+80;remoteDrive(12);
// end tag early via Free roam
qsa('#mp-modes button')[0].onclick();frames(2);
const end=sent.filter(x=>x.d.t==='end').pop();console.log('tag end top',JSON.stringify(end&&end.d.top));if(!end)fail('tag end missing');
// Race
qsa('#mp-modes button')[2].onclick();qsa('#mp-routes button')[0].onclick();frames(2);
const rc=sent.filter(x=>x.d.t==='race').pop();if(!rc)fail('race not sent');
const c0=t.player.car;console.log('grid',c0.x,c0.z);
frames(60);if(Math.hypot(c0.vx,c0.vz)>.01)fail('moved during countdown');
frames(60*3);
const pts=sandbox.NeonOnlineRules.ROUTES[0].points;for(const p of pts){c0.x=p[0];c0.z=p[1];bx=-150;remoteDrive(3);}
frames(5);
const rr=sent.filter(x=>x.d.t==='rr').pop();console.log('results',JSON.stringify(rr&&rr.d.res));if(!rr)fail('no race result');
remoteDrive(60*46);
const end2=sent.filter(x=>x.d.t==='end'&&x.d.k==='race').pop();console.log('race end',JSON.stringify(end2&&end2.d.top));if(!end2)fail('race did not end after grace');
// late joiner gets sync, leaving peer cleans up
room.peers.push({id:'C',name:'Late',joinedAt:3});room.emit('join',{id:'C',name:'Late'});frames(2);
if(!sent.some(x=>x.to==='C'&&x.d.t==='sync'))fail('no sync to late joiner');
room.peers=room.peers.filter(p=>p.id!=='B');room.emit('leave',{id:'B'});frames(5);
// host migration: become non-host, receive tag from C
room.host='C';room.emit('host','C');room.emit('message','C',{t:'tg',it:'A',imm:0,left:5000,sc:{A:1000}},false);frames(60*2);
room.emit('message','C',{t:'end',k:'tag',top:[['A',3000]]},false);frames(3);
// pvp hit while disabled: ignored
const hp=(t.player.car||t.player).health;room.emit('message','C',{t:'hit',d:30},true);frames(2);if((t.player.car||t.player).health!==hp)fail('hit applied while pvp off');
// leave
byId('mp-leave').onclick();frames(10);console.log('after leave state',t.state,'mode',t.mode);if(t.state!=='title')fail('leave did not return to title');
byId('start').onclick();frames(60);if(t.state!=='playing')fail('heist after online failed');
console.log('jobs visible again', status().objective);
const allMsgs=sent.length;console.log('messages sent total',allMsgs);
if(errors.length){fail('console.error: '+errors.slice(0,3).join(' || '));}
console.log(failures.length?'SMOKE FAILED '+failures.length:'SMOKE OK');process.exit(failures.length?1:0);
