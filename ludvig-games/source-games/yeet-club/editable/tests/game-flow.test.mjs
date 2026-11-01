/**
 * Application orchestration tests, NOT browser/rendering tests.
 * Runs the shipped main.js in a VM with real Three scene objects, real world
 * factories and real physics. Only DOM, audio, clock, and GPU renderer are fakes.
 * No gameplay function is copied or reimplemented here.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import * as RealThree from '../../vendor/three.module.js';
import * as World from '../../world.js';
import * as Physics from '../../physics.js';

const html = await readFile(new URL('../../index.html', import.meta.url), 'utf8');
const mainSource = (await readFile(new URL('../../main.js', import.meta.url), 'utf8'))
  .replace(/^import[^\n]+;\s*\n/gm, '');

class Events {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(fn);
  }
  removeEventListener(type, fn) {
    this.listeners.set(type, (this.listeners.get(type) || []).filter(f => f !== fn));
  }
  dispatch(type, details = {}) {
    const event = {type, target:this, repeat:false, defaultPrevented:false,
      preventDefault() { this.defaultPrevented = true; }, ...details};
    return (this.listeners.get(type) || []).map(fn => fn(event));
  }
}
class Classes {
  constructor() { this.values = new Set(); }
  add(...names) { names.forEach(n => this.values.add(n)); }
  remove(...names) { names.forEach(n => this.values.delete(n)); }
  contains(name) { return this.values.has(name); }
  toggle(name, force) {
    const add = force === undefined ? !this.values.has(name) : Boolean(force);
    if (add) this.values.add(name); else this.values.delete(name);
    return add;
  }
  toString() { return [...this.values].join(' '); }
}
class Element extends Events {
  constructor(tag, doc) {
    super(); this.tagName=tag.toUpperCase(); this.ownerDocument=doc;
    this.classList=new Classes(); this.attributes=new Map(); this.dataset={};
    this.style={setProperty(name,value){this[name]=value;}};
    this.children=[]; this.parentNode=null; this._id=''; this._text='';
    this.hidden=false; this.disabled=false; this.checked=false; this.value='';
    this.offsetWidth=640;
  }
  set id(value) {
    if (this._id) this.ownerDocument.ids.delete(this._id);
    this._id=String(value);
    if (this._id) this.ownerDocument.ids.set(this._id,this);
  }
  get id() { return this._id; }
  set className(value) { this.classList.values=new Set(String(value).split(/\s+/).filter(Boolean)); }
  get className() { return this.classList.toString(); }
  set textContent(value) { this._text=String(value); this.children=[]; }
  get textContent() { return this._text+this.children.map(c=>c.textContent).join(''); }
  set innerHTML(value) { this._text=String(value); this.children=[]; }
  get innerHTML() { return this._text; }
  setAttribute(name, value='') {
    const text=String(value); this.attributes.set(name,text);
    if(name==='id')this.id=text;
    if(name==='class')this.className=text;
    if(name==='hidden')this.hidden=true;
    if(name==='disabled')this.disabled=true;
    if(name==='checked')this.checked=true;
    if(name==='value')this.value=text;
    if(name.startsWith('data-'))this.dataset[name.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=text;
  }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  removeAttribute(name) { this.attributes.delete(name); }
  append(...nodes) { for(const node of nodes){node.parentNode=this;this.children.push(node);} }
  appendChild(node) { this.append(node); return node; }
  replaceChildren(...nodes) { this._text='';this.children=[];this.append(...nodes); }
  remove() {
    if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(c=>c!==this);
    if(this.id)this.ownerDocument.ids.delete(this.id);
    this.parentNode=null;
  }
  focus() { this.ownerDocument.activeElement=this; }
  blur() { if(this.ownerDocument.activeElement===this)this.ownerDocument.activeElement=this.ownerDocument.body; }
  select() { this.selected=true; }
  setPointerCapture() {}
  async requestFullscreen() { this.ownerDocument.fullscreenElement=this; }
  click() { return this.disabled?[]:this.dispatch('click'); }
}
class Input extends Element {}
class Select extends Element {}
class Document extends Events {
  constructor(source) {
    super();this.ids=new Map();this.all=[];this.hidden=false;this.fullscreenElement=null;
    this.documentElement=this.createElement('html');this.body=this.createElement('body');
    this.documentElement.append(this.body);this.activeElement=this.body;
    for(const match of source.matchAll(/<([a-z][\w:-]*)\b([^>]*)>/gi)) {
      const [,tag,attrs]=match;
      const el=tag.toLowerCase()==='html'?this.documentElement:tag.toLowerCase()==='body'?this.body:this.createElement(tag);
      for(const attr of attrs.matchAll(/([:\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g))
        el.setAttribute(attr[1],attr[2]??attr[3]??attr[4]??'');
      if(el!==this.documentElement&&el!==this.body)this.body.append(el);
    }
  }
  createElement(tag) {
    const C=tag.toLowerCase()==='input'?Input:tag.toLowerCase()==='select'?Select:Element;
    const el=new C(tag,this);this.all.push(el);return el;
  }
  getElementById(id) { return this.ids.get(id) || null; }
  querySelectorAll(selector) {
    if(selector.startsWith('.'))return this.all.filter(el=>el.classList.contains(selector.slice(1)));
    if(selector.startsWith('[')&&selector.endsWith(']'))return this.all.filter(el=>el.attributes.has(selector.slice(1,-1)));
    return this.all.filter(el=>el.tagName===selector.toUpperCase());
  }
  async exitFullscreen() { this.fullscreenElement=null; }
}

function createHarness({store=new Map(),coarse=false,rendererFails=false,search=''}={}) {
  const document=new Document(html), globalEvents=new Events(), errors=[], audioEvents=[];
  let now=0,raf=null,nextTimer=1,renderer=null,clipboard='',calendarStart=Date.parse('2026-10-23T12:00:00Z');
  const timers=new Map();
  class FakeRenderer {
    constructor() {
      if(rendererFails)throw new Error('Synthetic unavailable GPU');
      this.shadowMap={};this.info={render:{calls:0,triangles:0}};this.history=[];
      this.scene=null;this.viewport=[0,0,1280,720];renderer=this;
    }
    setPixelRatio(value) { this.pixelRatio=value; }
    setSize(w,h) { this.size=[w,h]; }
    setScissorTest(value) { this.scissorTest=value; }
    setViewport(...v) { this.viewport=v; }
    setScissor(...v) { this.scissor=v; }
    render(scene,camera) {
      this.scene=scene;
      for(const n of [...camera.position.toArray(),camera.fov,camera.aspect])
        assert.ok(Number.isFinite(n),'Camera must remain finite');
      const carts=scene.children.filter(o=>o.name==='Shopping cart'&&o.visible).map(o=>{
        let opacity=1;o.traverse(n=>{if(n.isMesh)opacity=Math.min(opacity,n.material.opacity);});
        for(const n of o.position.toArray())assert.ok(Number.isFinite(n),'Cart must remain finite');
        return {uuid:o.uuid,position:o.position.toArray(),opacity};
      });
      this.history.push({viewport:[...this.viewport],scissorTest:this.scissorTest,carts});
      if(this.history.length>20)this.history.shift();
      this.info.render.calls++;
    }
  }
  class SilentAudio {
    start() { return Promise.resolve(true); }
    setMuted(value) { this.muted=value; }
    setMusic(value) { this.music=value; }
    play(type) { audioEvents.push(type); }
    update(value) { this.last=value; }
  }
  class FixedDate extends Date {
    constructor(...args) { super(...(args.length?args:[calendarStart+now])); }
    static now() { return calendarStart+now; }
  }
  const math=Object.create(Math);math.random=Physics.seededRandom('integration-test');
  const context={
    THREE:{...RealThree,WebGLRenderer:FakeRenderer},...World,...Physics,AudioEngine:SilentAudio,
    document,HTMLInputElement:Input,HTMLSelectElement:Select,
    innerWidth:1280,innerHeight:720,devicePixelRatio:1,Date:FixedDate,Math:math,
    URL,URLSearchParams,Intl,performance:{now:()=>now},
    localStorage:{getItem:key=>store.get(key)??null,setItem:(key,value)=>store.set(key,String(value))},
    location:{href:'https://yeet.test/play/'+search,search,reload(){context.reloaded=true;}},
    navigator:{getGamepads:()=>[],clipboard:{async writeText(value){clipboard=value;}}},
    matchMedia:query=>({matches:query.includes('pointer: coarse')?coarse:false}),
    requestAnimationFrame:fn=>{raf=fn;return 1;},
    setTimeout:(fn,delay=0)=>{const id=nextTimer++;timers.set(id,{at:now+delay,fn});return id;},
    clearTimeout:id=>timers.delete(id),
    addEventListener:(...args)=>globalEvents.addEventListener(...args),
    console:{log(){},warn(){},error(...args){errors.push(args.map(x=>x?.stack||String(x)).join(' '));}}
  };
  context.window=context;
  vm.createContext(context);
  new vm.Script(mainSource,{filename:'../main.js'}).runInContext(context,{timeout:30000});
  function ensureHealthy() {
    assert.deepEqual(errors,[],`Application reported runtime errors:\n${errors.join('\n')}`);
    assert.equal(document.getElementById('error-screen').hidden,true,'Unexpected error overlay');
  }
  if(!rendererFails)ensureHealthy();
  return {
    document,store,context,errors,audioEvents,
    get renderer(){return renderer;},get clipboard(){return clipboard;},
    get status(){return context.yeetStatus;},
    setDate(value){calendarStart=Date.parse(value)-now;},
    ui:id=>{const el=document.getElementById(id);assert.ok(el,`Expected real HTML id: ${id}`);return el;},
    click(id){return Promise.all(document.getElementById(id).click());},
    key(code,down=true){globalEvents.dispatch(down?'keydown':'keyup',{code,target:document.body});},
    global(type,details={}){globalEvents.dispatch(type,details);},
    advance(seconds,step=1/60) {
      const count=Math.ceil(seconds/step);
      for(let i=0;i<count;i++){
        now+=step*1000;
        for(const[id,t]of timers)if(t.at<=now){timers.delete(id);t.fn();}
        const next=raf;raf=null;assert.ok(next,'Application must keep its animation loop scheduled');next(now);
      }
      ensureHealthy();
    }
  };
}

// Tests intentionally interact through DOM handlers and the existing read-only
// yeetStatus API. They do not call startRun, stepPlayer or other main internals.
test('real app boots, counts down, pauses, resumes, steers and jumps', () => {
  const h=createHarness();
  assert.equal(h.status.state,'menu');assert.equal(h.ui('menu').hidden,false);
  assert.equal(h.ui('loading').hidden,true);
  h.click('solo-btn');assert.equal(h.status.state,'countdown');assert.equal(h.ui('hud').hidden,false);
  h.advance(1);assert.equal(h.status.players[0].s,10);
  h.key('Escape');h.key('Escape',false);assert.equal(h.status.state,'paused');
  h.advance(2);assert.equal(h.status.players[0].timeLeft,90);
  h.click('resume-btn');h.advance(2);assert.equal(h.status.state,'playing');
  assert.ok(h.status.players[0].timeLeft<90);
  h.key('KeyD');h.advance(.35);h.key('KeyD',false);
  assert.ok(h.status.players[0].x>1,'WASD handler must steer the actual simulation');
  h.click('pause-btn');const paused=JSON.stringify(h.status.players);
  h.advance(2);assert.equal(JSON.stringify(h.status.players),paused,'Pause must stop all simulation');
  h.click('resume-btn');h.advance(.1);
  h.key('Space');h.advance(.1);h.key('Space',false);
  assert.ok(h.status.players[0].y>0,'Space handler must jump');
  h.global('blur');assert.equal(h.status.state,'paused','Losing focus should pause');
  h.click('quit-btn');assert.equal(h.status.state,'menu');assert.equal(h.ui('hud').hidden,true);
});

test('complete solo loop persists one result, shares exact challenge, rematches same seed', async () => {
  const h=createHarness();
  h.click('solo-btn');const seed=h.status.seed;
  h.advance(100,.05);
  assert.equal(h.status.state,'results');assert.equal(h.ui('results').hidden,false);
  assert.equal(h.ui('hud').hidden,true);assert.equal(h.status.players[0].finished,true);
  assert.equal(h.status.players[0].speed,0);assert.ok(h.status.players[0].score>0);
  const record=JSON.parse(h.store.get('yeet-club-v1'));
  assert.equal(record.runs,1);assert.ok(record.best>=h.status.players[0].score);assert.ok(record.xp>0);
  assert.equal(h.ui('result-stats').children.length,4);
  h.advance(3);assert.equal(JSON.parse(h.store.get('yeet-club-v1')).runs,1,'Result must not be recorded each frame');
  await h.click('challenge-btn');
  const shared=/^YEET-([0-9A-Z]+)-([0-9A-Z]+)$/.exec(h.clipboard);
  assert.ok(shared,'Sharing must create a portable challenge code');
  assert.equal(parseInt(shared[1],36),seed);
  assert.equal(parseInt(shared[2],36),h.status.players[0].score);
  h.click('again-btn');assert.equal(h.status.state,'countdown');assert.equal(h.status.seed,seed);
  assert.equal(h.status.players[0].score,0);assert.equal(h.status.players[0].health,3);
  assert.equal(h.renderer.scene.children.filter(o=>o.name==='Shopping cart').length,2,'Retry must remove the previous cart');
  h.advance(3);h.click('pause-btn');h.click('quit-btn');
  const reload=createHarness({store:h.store});
  assert.equal(reload.ui('best-score').textContent,record.best.toLocaleString('sv-SE'),'Personal best must survive reload');
});

test('challenge import rejects malformed input and loads the encoded course and target', () => {
  const h=createHarness();h.click('challenge-open');
  assert.equal(h.ui('challenge-panel').hidden,false);
  h.ui('challenge-code').value='not-a-real-code';h.ui('challenge-form').dispatch('submit');
  assert.equal(h.status.state,'menu');assert.equal(h.ui('challenge-error').hidden,false);
  assert.equal(h.ui('challenge-code').getAttribute('aria-invalid'),'true');
  const seed=123456,score=24000;
  h.ui('challenge-code').value=`YEET-${seed.toString(36)}-${score.toString(36)}`;
  h.ui('challenge-form').dispatch('submit');
  assert.equal(h.status.state,'countdown');assert.equal(h.status.seed,seed);
  assert.equal(h.ui('challenge-panel').hidden,true);
  assert.match(h.ui('p0-label').textContent,/SLÅ/);
  h.advance(100,.05);assert.equal(h.status.state,'results');
  h.click('again-btn');assert.equal(h.status.seed,seed);
  assert.match(h.ui('p0-label').textContent,/SLÅ/,'Rematch must retain the imported target');
});

test('duo maps independent controls, renders isolated viewports, and completes both results', () => {
  const h=createHarness();h.click('duo-btn');
  assert.equal(h.status.mode,'duo');assert.equal(h.status.players.length,2);
  assert.deepEqual(Array.from(h.status.players,p=>p.x),[0,0]);
  h.advance(4);
  assert.equal(h.status.players[0].score,h.status.players[1].score,'Equal inputs and course must give equal scores');
  h.key('KeyD');h.advance(.35);h.key('KeyD',false);
  assert.ok(h.status.players[0].x>1);assert.equal(h.status.players[1].x,0);
  h.key('ArrowLeft');h.advance(.35);h.key('ArrowLeft',false);
  assert.ok(h.status.players[1].x< -1);
  h.key('ShiftRight');h.advance(.45);h.key('ShiftRight',false);
  assert.ok(h.status.players[1].speed>h.status.players[0].speed+5,'Right Shift boosts only player two');
  h.key('Enter');h.advance(.1);h.key('Enter',false);
  assert.ok(h.status.players[1].y>0);assert.equal(h.status.players[0].y,0);
  const views=h.renderer.history.slice(-2);
  assert.deepEqual(views.map(v=>v.viewport),[[0,0,640,720],[640,0,640,720]]);
  assert.ok(views.every(v=>v.scissorTest&&v.carts.length===1),'Each viewport must show only its player cart');
  assert.notEqual(views[0].carts[0].uuid,views[1].carts[0].uuid);
  h.advance(100,.05);
  assert.equal(h.status.state,'results');assert.ok(h.status.players.every(p=>p.finished));
  assert.equal(h.ui('duo-results').hidden,false);assert.equal(h.ui('duo-results').children.length,2);
  assert.ok(h.status.players.every(p=>p.score>0));
});

test('daily trace persists, reloads as a translucent ghost, and interpolates between samples', () => {
  const store=new Map(),h=createHarness({store});h.click('daily-btn');const seed=h.status.seed;
  h.advance(100,.05);assert.equal(h.status.state,'results');
  const ghostKey=[...store.keys()].find(k=>k.startsWith('yeet-ghost-'));
  assert.ok(ghostKey,'Completed daily run must save a ghost');
  const record=JSON.parse(store.get(ghostKey));
  assert.equal(record.seed,seed);assert.ok(record.trace.length>50);
  assert.equal(record.trace[0][0],0);assert.equal(record.trace[0][1],10);
  for(let i=1;i<record.trace.length;i++)assert.ok(Math.abs(record.trace[i][0]-record.trace[i-1][0]-.125)<.002,'Ghost timestamps must use a regular cadence');
  const replay=createHarness({store});replay.click('daily-btn');replay.advance(6);
  assert.equal(replay.status.seed,seed);
  const observed=[];
  for(let i=0;i<10;i++){
    replay.advance(1/60);
    const frame=replay.renderer.history.at(-1),ghost=frame.carts.find(c=>c.opacity<.5);
    assert.ok(ghost,'Saved daily trace should render a translucent cart');
    const own=frame.carts.find(c=>c.opacity>=.5);assert.ok(own);
    assert.ok(Math.abs(ghost.position[2]-own.position[2])<.2,'Ghost and identical fresh input should remain synchronized');
    observed.push(-ghost.position[2]);
  }
  for(let i=1;i<observed.length;i++)assert.ok(observed[i]>observed[i-1],'Ghost should move every frame rather than hop once per sample');
  replay.advance(100,.05);assert.equal(replay.status.state,'results');
  assert.equal(replay.status.players[0].score,record.score,'Identical input on daily replay must produce identical result');
});

test('touch controls enter and release correctly; GPU startup failure shows a recoverable overlay', () => {
  const h=createHarness({coarse:true});
  assert.equal(h.ui('duo-btn').disabled,true);
  h.click('solo-btn');h.advance(3.2);
  assert.equal(h.ui('touch-controls').hidden,false);
  const right=h.document.querySelectorAll('[data-control]').find(b=>b.dataset.control==='right');
  right.dispatch('pointerdown',{pointerId:1});h.advance(.3);
  assert.ok(h.status.players[0].x>1);
  right.dispatch('pointercancel',{pointerId:1});h.advance(.5);
  assert.equal(right.classList.contains('is-active'),false);
  h.click('pause-btn');assert.equal(h.ui('touch-controls').hidden,true);
  const failed=createHarness({rendererFails:true});
  assert.equal(failed.ui('loading').hidden,true);assert.equal(failed.ui('error-screen').hidden,false);
  assert.equal(failed.errors.length,1);assert.match(failed.errors[0],/Synthetic unavailable GPU/);
});


test('daily runs refresh after an overnight tab and retain their date across midnight and retries', () => {
  const h=createHarness();
  h.setDate('2026-10-24T21:59:30Z');
  h.click('daily-btn');const seed=h.status.seed;
  h.advance(100,.05);
  assert.equal(h.status.state,'results');
  assert.ok(h.store.has('yeet-ghost-2026-10-24'),'The ghost belongs to the date the run started');
  assert.equal(h.store.has('yeet-ghost-2026-10-23'),false,'An old tab must not use its load date');
  assert.equal(h.store.has('yeet-ghost-2026-10-25'),false,'Midnight must not reassign the completed run');
  assert.equal(JSON.parse(h.store.get('yeet-daily-best')).day,'2026-10-24');
  h.click('again-btn');assert.equal(h.status.seed,seed,'Retry keeps the previous daily course');
  h.click('pause-btn');h.click('menu-btn');h.click('daily-btn');
  assert.notEqual(h.status.seed,seed,'A fresh daily run uses the new date');
  h.advance(100,.05);
  assert.ok(h.store.has('yeet-ghost-2026-10-25'));
});
