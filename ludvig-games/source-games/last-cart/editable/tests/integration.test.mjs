/**
 * DOM integration tests for the real entry point and gameplay simulation.
 * WebGL and Web Audio are replaced at the import boundary only. These tests
 * verify controls/state/DOM behavior; they do not claim rendering coverage.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const html=await readFile(path.join(root,'src/index.html'),'utf8');
const sceneMock=`
export class GameView {
  constructor(canvas,settings){
    if(window.__failRenderer)throw new Error('WebGL unavailable');
    this.canvas=canvas;this.settings={...settings};this.cartMeshes=[];this.events=[];this.hit=0;this.shakeEnabled=settings.shake;window.__view=this;
  }
  loadArena(arena,index){this.arena=arena;this.arenaIndex=index;}
  clearEffects(){this.events=[];}
  rebuildCarts(players){this.cartMeshes=players.map(p=>({id:p.id}));}
  setMode(mode){this.menuMode=mode;}
  handleEvent(event,sim){this.events.push({...event});this.sim=sim;}
  setQuality(quality){this.quality=quality;}
  resize(){this.resizes=(this.resizes||0)+1;}
  update(sim,dt){this.sim=sim;this.lastDelta=dt;}
  getStats(){return {calls:1,triangles:1};}
}`;
const audioMock=`
export class AudioEngine {
  constructor(){window.__audio=this;this.events=[];this.volumes={};}
  unlock(){this.unlocked=true;return Promise.resolve();}
  setVolumes(volumes){this.volumes={...volumes};}
  setMuted(value){this.muted=value;}
  setSuspended(value){this.suspended=value;}
  setActive(value){this.active=value;}
  update(state,dt){this.state={...state};this.dt=dt;}
  play(name,options){this.events.push({name,...options});}
}`;
const bundled=await build({
  entryPoints:[path.join(root,'src/main.js')],bundle:true,write:false,format:'iife',platform:'browser',logLevel:'silent',
  plugins:[{name:'renderer-and-audio-test-boundaries',setup(builder){
    builder.onResolve({filter:/^\.\/(scene|audio)\.js$/},args=>({path:args.path,namespace:'mock'}));
    builder.onLoad({filter:/.*/,namespace:'mock'},args=>({contents:args.path.includes('scene')?sceneMock:audioMock,loader:'js'}));
  }}]
});
const source=bundled.outputFiles[0].text;

function rig({coarse=false,storage=null,failRenderer=false}={}){
  const dom=new JSDOM(html,{url:'https://last-cart.test/',runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window,d=w.document,frames=new Map(),errors=[];
  let now=0,nextFrame=1;
  w.__failRenderer=failRenderer;
  w.matchMedia=query=>({matches:query.includes('pointer:coarse')?coarse:false,media:query,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}});
  w.requestAnimationFrame=fn=>{const id=nextFrame++;frames.set(id,fn);return id;};
  w.cancelAnimationFrame=id=>frames.delete(id);
  Object.defineProperty(w.performance,'now',{value:()=>now});
  Object.defineProperty(w.navigator,'getGamepads',{value:()=>[]});
  Object.defineProperty(w.navigator,'clipboard',{value:{writeText:async value=>{w.__copied=value;}}});
  w.console.error=(...args)=>errors.push(args.map(String).join(' '));
  const OriginalDate=w.Date;
  w.Date=class extends OriginalDate{constructor(...args){super(...(args.length?args:['2026-10-23T18:00:00.000Z']));}static now(){return new OriginalDate('2026-10-23T18:00:00.000Z').getTime();}};
  if(storage!==null)w.localStorage.setItem('last-cart-v1',typeof storage==='string'?storage:JSON.stringify(storage));
  w.eval(source);
  const $=id=>d.getElementById(id);
  const api={
    w,d,$,errors,
    frame(milliseconds=1000/60){now+=milliseconds;const pending=[...frames.values()];frames.clear();for(const callback of pending)callback(now);},
    advance(seconds){for(let i=0;i<Math.ceil(seconds*60);i++)api.frame();},
    click(target){(target.startsWith('#')||target.startsWith('[')||target.startsWith('.')?d.querySelector(target):$(target)).click();},
    key(code,down=true,target=w){target.dispatchEvent(new w.KeyboardEvent(down?'keydown':'keyup',{code,key:code,bubbles:true,cancelable:true}));},
    change(id,value,event='change'){$(id).value=value;$(id).dispatchEvent(new w.Event(event,{bubbles:true}));},
    snapshot(){return JSON.parse(JSON.stringify(w.__LAST_CART__.snapshot()));},
    sim(){return w.__view.sim;},
    start(){api.click('play-button');api.frame();return api.sim();},
    close(){dom.window.close();},
    storage(){return JSON.parse(w.localStorage.getItem('last-cart-v1')||'{}');}
  };
  return api;
}

function assertOnlyGameScreen(r,visible){
  for(const id of ['menu','hud','result-overlay','pause-overlay','countdown-overlay','mobile-controls'])
    assert.equal(r.$(id).hidden,!visible.includes(id),`${id} has stale visibility`);
}

test('entry point boots the real menu and starts a complete countdown',t=>{
  const r=rig();t.after(()=>r.close());
  assert.deepEqual(r.errors,[]);
  assert.equal(r.snapshot().stage,'menu');
  assert.equal(r.$('loading-screen').hidden,true);
  assert.equal(r.$('error-screen').hidden,true);
  assert.equal(r.$('arena-select').options.length,3);
  assertOnlyGameScreen(r,['menu']);
  r.start();
  assert.equal(r.snapshot().stage,'game');
  assert.equal(r.snapshot().sim.state,'countdown');
  assertOnlyGameScreen(r,['hud','countdown-overlay']);
  r.advance(3.8);
  assert.equal(r.snapshot().sim.state,'playing');
  assert.equal(r.$('countdown-overlay').hidden,true);
  assert.equal(r.$('p2-panel').hidden,true);
  assert.equal(r.w.__audio.active,true);
  const cues=r.w.__audio.events.filter(e=>['countdown','go'].includes(e.name));
  assert.equal(cues.filter(e=>e.name==='countdown').length,3);
  assert.equal(cues.filter(e=>e.name==='go').length,1);
});

test('Escape and the pause button freeze physics and resume without held input',t=>{
  const r=rig();t.after(()=>r.close());r.start();r.advance(3.1);
  r.key('KeyD');r.advance(.3);r.key('Escape');
  const paused=r.snapshot();
  assert.equal(paused.paused,true);assert.equal(r.$('pause-overlay').hidden,false);
  assert.equal(r.w.__audio.suspended,true);
  r.advance(2);
  assert.deepEqual(r.snapshot().sim,paused.sim);
  r.click('resume-button');
  assert.equal(r.snapshot().paused,false);
  assert.equal(r.$('pause-overlay').hidden,true);
  r.advance(.2);
  assert.ok(r.snapshot().sim.time>paused.sim.time);
  assert.ok(Math.abs(r.sim().players[0].vx)<Math.abs(paused.sim.players[0].vx));
  r.click('pause-button');assert.equal(r.snapshot().paused,true);
  r.key('Escape');assert.equal(r.snapshot().paused,false);
});

test('settings and help pause live gameplay and preserve an existing pause',t=>{
  const r=rig();t.after(()=>r.close());r.start();r.advance(3.1);
  r.click('settings-button');const before=r.snapshot().sim;
  assert.equal(r.$('settings-overlay').hidden,false);assert.equal(r.snapshot().paused,true);
  r.advance(1);assert.deepEqual(r.snapshot().sim,before);
  r.key('Escape');assert.equal(r.$('settings-overlay').hidden,true);assert.equal(r.snapshot().paused,false);
  r.key('Escape');assert.equal(r.snapshot().paused,true);
  r.click('help-button');r.advance(.5);r.click('help-close');
  assert.equal(r.snapshot().paused,true);assert.equal(r.$('pause-overlay').hidden,false);
  assert.equal(r.$('help-overlay').hidden,true);
  r.click('resume-button');assert.equal(r.snapshot().paused,false);
});

test('local mode maps simultaneous keyboard controls to separate carts',t=>{
  const r=rig();t.after(()=>r.close());r.click('[data-mode="local"]');r.start();r.advance(3.1);
  assert.equal(r.snapshot().mode,'local');assert.equal(r.$('p2-panel').hidden,false);
  assert.equal(r.sim().players.filter(p=>p.human).length,2);
  r.key('KeyD');r.key('ArrowLeft');r.advance(.45);
  assert.ok(r.sim().players[0].x>1);assert.ok(r.sim().players[1].x< -1);
  r.key('Space');r.key('Enter');r.frame();
  assert.ok(r.sim().players[0].boost<.1);assert.ok(r.sim().players[1].boost<.1);
  r.key('KeyD',false);r.key('ArrowLeft',false);r.key('Space',false);r.key('Enter',false);
  assert.equal(r.snapshot().stage,'game');
});

test('a human knockout yields an early result and restart clears overlays and input',t=>{
  const r=rig();t.after(()=>r.close());r.start();r.advance(3.1);
  r.key('KeyD');const first=r.sim();first.players[0].x=18.2;first.players[0].z=0;
  r.frame();assert.equal(r.snapshot().stage,'ending');
  assert.equal(first.players[0].alive,false);assert.equal(first.players[0].falling,true);
  r.advance(2);
  const end=r.snapshot();assert.equal(end.stage,'result');assert.equal(end.career.matches,1);
  assert.equal(end.result.placement,8);assert.ok(end.result.xp>=25);assert.equal(end.result.won,false);
  assertOnlyGameScreen(r,['result-overlay']);
  assert.equal(r.$('settings-overlay').hidden,true);assert.equal(r.$('help-overlay').hidden,true);
  r.advance(2);assert.equal(r.snapshot().career.matches,1,'result rewards must not repeat');
  r.click('next-button');r.frame();
  assert.notEqual(r.sim(),first);assert.equal(r.snapshot().result,null);
  assert.equal(r.sim().players.filter(p=>p.alive).length,8);
  assertOnlyGameScreen(r,['hud','countdown-overlay']);
  r.advance(3.2);assert.equal(r.sim().players[0].x,0,'restart must clear the held D key');
  r.key('Escape');r.click('quit-button');
  assert.equal(r.snapshot().stage,'menu');assertOnlyGameScreen(r,['menu']);
});

test('settings save and reach the audio/graphics boundaries',t=>{
  const r=rig();t.after(()=>r.close());r.click('settings-button');
  r.change('music-volume','0.11','input');r.change('sfx-volume','0.42','input');r.change('quality-select','low');
  r.$('shake-toggle').checked=false;r.$('shake-toggle').dispatchEvent(new r.w.Event('change',{bubbles:true}));
  assert.equal(r.w.__audio.volumes.music,.11);assert.equal(r.w.__audio.volumes.sfx,.42);
  assert.equal(r.w.__view.quality,'low');assert.equal(r.w.__view.shakeEnabled,false);
  r.click('settings-close');r.click('sound-button');
  const saved=r.storage();
  assert.equal(saved.settings.music,.11);assert.equal(saved.settings.sfx,.42);
  assert.equal(saved.settings.quality,'low');assert.equal(saved.settings.shake,false);assert.equal(saved.settings.muted,true);
  assert.equal(r.$('sound-button').getAttribute('aria-pressed'),'true');
  assert.equal(r.w.__audio.muted,true);
  const loaded=rig({storage:saved});t.after(()=>loaded.close());
  assert.equal(loaded.$('music-volume').value,'0.11');assert.equal(loaded.$('quality-select').value,'low');
  assert.equal(loaded.$('shake-toggle').checked,false);assert.equal(loaded.w.__audio.muted,true);
});

test('daily mode locks its settings, repeats its seed, and saves the daily result',t=>{
  const r=rig();t.after(()=>r.close());r.click('[data-mode="daily"]');
  assert.equal(r.$('arena-select').disabled,true);assert.equal(r.$('difficulty-select').disabled,true);
  assert.equal(r.$('difficulty-select').value,'spicy');
  r.start();r.advance(3.1);
  const seed=r.sim().seed,arena=r.sim().arena.id;
  assert.equal(r.sim().mode,'daily');assert.equal(r.sim().difficulty,'spicy');
  r.sim().players[0].x=18.2;r.sim().players[0].z=0;r.frame();r.advance(2);
  assert.equal(r.snapshot().stage,'result');
  assert.equal(r.storage().daily['2026-10-23'].placement,8);
  r.click('next-button');r.frame();
  assert.equal(r.sim().seed,seed);assert.equal(r.sim().arena.id,arena);
  r.key('Escape');r.click('quit-button');r.click('[data-mode="solo"]');
  assert.equal(r.$('arena-select').disabled,false);assert.equal(r.$('difficulty-select').disabled,false);
});

test('window blur pauses a live round and requires explicit resume',t=>{
  const r=rig();t.after(()=>r.close());r.start();r.advance(3.1);r.key('KeyW');
  r.w.dispatchEvent(new r.w.Event('blur'));
  const paused=r.snapshot();assert.equal(paused.paused,true);r.advance(1);
  assert.deepEqual(r.snapshot().sim,paused.sim);
  r.w.dispatchEvent(new r.w.Event('focus'));assert.equal(r.snapshot().paused,true);
  r.click('resume-button');assert.equal(r.snapshot().paused,false);
});

test('coarse-pointer controls appear only during active gameplay',t=>{
  const r=rig({coarse:true});t.after(()=>r.close());assert.equal(r.$('mobile-controls').hidden,true);
  r.start();assert.equal(r.$('mobile-controls').hidden,false);
  r.click('pause-button');assert.equal(r.$('mobile-controls').hidden,true);
  r.click('resume-button');assert.equal(r.$('mobile-controls').hidden,false);
  r.click('settings-button');assert.equal(r.$('mobile-controls').hidden,true);
  r.click('settings-close');assert.equal(r.$('mobile-controls').hidden,false);
  r.key('Escape');r.click('quit-button');assert.equal(r.$('mobile-controls').hidden,true);
});

test('a rendering startup failure exposes the supplied error screen',t=>{
  const r=rig({failRenderer:true});t.after(()=>r.close());
  assert.equal(r.$('loading-screen').hidden,true);assert.equal(r.$('error-screen').hidden,false);
  assert.equal(r.errors.length,1);assert.match(r.errors[0],/WebGL unavailable/);
  assert.equal(r.w.__LAST_CART__,undefined);
});
