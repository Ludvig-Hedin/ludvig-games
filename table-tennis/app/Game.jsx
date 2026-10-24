'use client';
import {useEffect,useRef,useState} from 'react';
const LEVELS=['Beginner','Easy','Medium','Hard','Pro'];
const DEFAULTS={sound:true,sensitivity:1,quality:'auto',camera:'player',bestOf:3,difficulty:2,name:'Player'};
const SPINS=[{id:'flat',name:'Flat',key:'1',symbol:'→'},{id:'top',name:'Topspin',key:'2',symbol:'↻'},{id:'back',name:'Backspin',key:'3',symbol:'↺'},{id:'left',name:'Left',key:'4',symbol:'↶'},{id:'right',name:'Right',key:'5',symbol:'↷'}];
const initialHud={score:[0,0],games:[0,0],server:0,phase:'ready',rally:0,bestOf:3,lastPoint:null,winner:null};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const freshInput=()=>({x:0,depth:1.58,aim:0,power:.45,spin:'flat',swing:false,serve:false});
function Icon({name,size=20}){const p={arrow:<path d="M5 12h14M13 6l6 6-6 6"/>,close:<path d="M6 6l12 12M18 6L6 18"/>,pause:<path d="M9 5v14M15 5v14"/>,play:<path d="m9 5 11 7-11 7Z"/>,volume:<><path d="m11 5-6 4H2v6h3l6 4zM15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14"/></>,muted:<path d="m11 5-6 4H2v6h3l6 4zM16 9l6 6M22 9l-6 6"/>,settings:<><path d="m10 3-1 3-3 1-2-1-2 4 2 2v2l-1 2 3 3 3-1 2 1 1 2h4l1-3 2-1 2 1 2-4-2-2v-2l1-2-3-3-3 1-2-1-1-2Z"/><circle cx="12" cy="12" r="3"/></>,help:<><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 4 2c-1.5 1-1.5 1-1.5 2M12 16v.1"/></>,copy:<><rect x="8" y="8" width="12" height="13" rx="2"/><path d="M15 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3"/></>,globe:<><circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/></>,local:<><rect x="2" y="5" width="20" height="14" rx="3"/><path d="M6 10h5M8.5 7.5v5M15 11h.1M18 13h.1"/></>,check:<path d="m5 12 4 4L19 6"/>,'spin-flat':<path d="M4 12h14M14 8l4 4-4 4"/>,'spin-top':<><path d="M19 12a7 7 0 1 1-2.1-5"/><path d="M17 3v4h-4"/></>,'spin-back':<><path d="M5 12a7 7 0 1 0 2.1-5"/><path d="M7 3v4h4"/></>,'spin-left':<><path d="M18 18C18 10 14 6 7 6"/><path d="M10 3 7 6l3 3"/></>,'spin-right':<><path d="M6 18C6 10 10 6 17 6"/><path d="m14 3 3 3-3 3"/></>,reset:<path d="M3 10a9 9 0 1 1 2 8M3 4v6h6"/>,screen:<><rect x="2" y="4" width="20" height="14" rx="2"/><path d="M8 22h8M12 18v4"/></>};return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{p[name]||p.arrow}</svg>}
function Mark(){return <svg className="brand-mark" viewBox="0 0 40 40" fill="none" aria-hidden="true"><ellipse cx="18" cy="16" rx="12" ry="13" transform="rotate(-35 18 16)" fill="currentColor"/><path d="m24 25 8 10" stroke="currentColor" strokeWidth="7" strokeLinecap="round"/><path d="m10 22 15-12" stroke="#151917" strokeWidth="2"/><circle cx="34" cy="9" r="4" fill="#e58d70"/></svg>}
function Dots({value,total}){return <span className="game-dots">{Array.from({length:total},(_,i)=><i key={i} className={i<value?'filled':''}/>)}</span>}
export default function Game(){
 const arenaEl=useRef(null),runtime=useRef(null),netRef=useRef(null),alive=useRef(true),modalRef=useRef(null);
 const [ready,setReady]=useState(false),[error,setError]=useState(''),[view,setView]=useState('home'),[mode,setMode]=useState('ai');
 const [hud,setHud]=useState(initialHud),[paused,setPaused]=useState(false),[settings,setSettings]=useState(DEFAULTS),[modal,setModal]=useState(null);
 const [spin,setSpin]=useState('flat'),[power,setPower]=useState(.45),[hint,setHint]=useState(true),[room,setRoom]=useState(null),[busy,setBusy]=useState(false);
 const [roomCode,setRoomCode]=useState(''),[onlineError,setOnlineError]=useState(''),[copied,setCopied]=useState(false),[netStatus,setNetStatus]=useState(''),[netDetail,setNetDetail]=useState(''),[,setLatency]=useState(0);
 const [,setStats]=useState({played:0,won:0,best:0}),[touch,setTouch]=useState(false);
 const settingsRef=useRef(settings);
 useEffect(()=>{settingsRef.current=settings;const rt=runtime.current;if(rt){rt.audio.setEnabled(settings.sound);rt.arena.setQuality(settings.quality);}if(ready)try{localStorage.setItem('rally.settings',JSON.stringify(settings));}catch{}},[settings,ready]);
 useEffect(()=>{modalRef.current=modal;},[modal]);
 useEffect(()=>{
  if(!(modal||paused||view==='play'&&hud.phase==='matchover'))return;
  const panel=document.querySelector('[role="dialog"]');if(!panel)return;const previous=document.activeElement;
  const focusables=()=>[...panel.querySelectorAll('button:not(:disabled),input,select,[tabindex="0"]')];
  focusables()[0]?.focus();
  const trap=event=>{if(event.key!=='Tab')return;const list=focusables(),first=list[0],last=list[list.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}};
  panel.addEventListener('keydown',trap);return()=>{panel.removeEventListener('keydown',trap);if(previous?.isConnected)previous.focus?.();};
 },[modal,paused,view,hud.phase]);
 useEffect(()=>{
  alive.current=true;
  try{const s=JSON.parse(localStorage.getItem('rally.settings')||'null');if(s)setSettings({...DEFAULTS,...s});const st=JSON.parse(localStorage.getItem('rally.stats')||'null');if(st)setStats(st);}catch{}
  setTouch(matchMedia('(pointer:coarse)').matches);let cleanup=()=>{};let disposed=false;
  Promise.all([import('../src/game/arena.js'),import('../src/game/engine.js'),import('../src/game/audio.js'),import('../src/game/network.js')]).then(([a,e,au,n])=>{
   if(disposed)return;
   const arena=new a.Arena(arenaEl.current),audio=new au.GameAudio();audio.setEnabled(settingsRef.current.sound);arena.setQuality(settingsRef.current.quality);
   const rt={arena,audio,engine:e,Network:n.OnlineRoom,state:e.createGame({mode:'demo',difficulty:3,bestOf:3,seed:117}),view:'home',mode:'ai',side:0,paused:false,inputs:[freshInput(),freshInput()],keys:{},pointer:false,down:0,armed:0,serveAt:[0,0],lastX:0,lastPointer:0,downX:0,downY:0,lastEvent:0,lastFrame:performance.now(),lastHud:0,resultSaved:false,frame:0};runtime.current=rt;
   const keydown=ev=>{
    if(/INPUT|SELECT|TEXTAREA/.test(ev.target.tagName))return;
    if(ev.code==='Escape'){ev.preventDefault();if(modalRef.current){if(modalRef.current!=='lobby')dismissModal();return;}if(rt.view==='play'){rt.paused=!rt.paused;setPaused(rt.paused);}return;}
    if(rt.view!=='play'||modalRef.current)return;if(['Space','Enter','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(ev.code))ev.preventDefault();rt.keys[ev.code]=true;audio.unlock();
    if(ev.code==='Space'&&!ev.repeat){rt.serveAt[rt.mode==='local'?0:rt.side]=performance.now()+700;setHint(false);}
    if(ev.code==='Enter'&&!ev.repeat&&rt.mode==='local'){rt.serveAt[1]=performance.now()+700;setHint(false);}
    const si=['Digit1','Digit2','Digit3','Digit4','Digit5'].indexOf(ev.code);if(si>=0){rt.inputs[rt.side].spin=SPINS[si].id;setSpin(SPINS[si].id);}
   };
   const keyup=ev=>{rt.keys[ev.code]=false;};
   const lost=()=>{rt.keys={};rt.pointer=false;rt.inputs.forEach(i=>{i.swing=false;i.serve=false;});if(rt.view==='play'&&rt.mode!=='online'){rt.paused=true;setPaused(true);}};
   const aim=ev=>{
    if(rt.view!=='play'||rt.mode==='local'||rt.paused||modalRef.current)return;
    const now=performance.now(),p=arena.pointerToTable(ev.clientX,ev.clientY,rt.side),input=rt.inputs[rt.side],dir=rt.side===0?1:-1;
    input.x=clamp(p.x*settingsRef.current.sensitivity,-1.12,1.12);input.depth=clamp(p.depth,1.40,1.72);
    const dx=ev.clientX-rt.lastX;if(now-rt.lastPointer<100&&Math.abs(dx)>1)input.aim=clamp(dx*.023*dir,-.88,.88);rt.lastX=ev.clientX;rt.lastPointer=now;
   };
   const down=ev=>{if(rt.view!=='play'||rt.paused||modalRef.current||rt.mode==='local')return;ev.preventDefault();audio.unlock();aim(ev);rt.pointer=true;rt.down=performance.now();rt.armed=rt.down+800;rt.downX=ev.clientX;rt.downY=ev.clientY;rt.serveAt[rt.side]=rt.down+700;setHint(false);try{ev.target.setPointerCapture(ev.pointerId);}catch{}};
   const up=ev=>{if(!rt.pointer)return;rt.pointer=false;const now=performance.now();rt.armed=now+650;rt.inputs[rt.side].power=clamp(.35+(now-rt.down)/1400,.35,.9);if(ev.pointerType==='touch'){const dx=ev.clientX-rt.downX,dy=ev.clientY-rt.downY;if(Math.abs(dx)>45){const id=dx>0?'right':'left';rt.inputs[rt.side].spin=id;rt.inputs[rt.side].aim=clamp(dx/160,-.8,.8);setSpin(id);}else if(dy< -40){rt.inputs[rt.side].spin='top';setSpin('top');}rt.inputs[rt.side].power=clamp(.35+Math.hypot(dx,dy)/350,.35,.9);}};
   const canvas=arenaEl.current.querySelector('canvas');canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',aim);canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',up);const noMenu=ev=>ev.preventDefault();canvas.addEventListener('contextmenu',noMenu);
   window.addEventListener('keydown',keydown);window.addEventListener('keyup',keyup);window.addEventListener('blur',lost);
   const animate=now=>{
    if(disposed)return;const dt=Math.min((now-rt.lastFrame)/1000,.05);rt.lastFrame=now;let state=rt.state;
    if(rt.view==='home'){e.stepGame(state,[{auto:true},{auto:true}],dt);if(state.phase==='matchover')rt.state=state=e.createGame({mode:'demo',difficulty:3,bestOf:3});}
    else if(rt.view==='play'){
     const k=rt.keys,local=rt.mode==='local',ps=rt.side;
     if(!rt.paused&&!modalRef.current){for(let side=0;side<2;side++){
      if(!local&&side!==ps)continue;const input=rt.inputs[side],far=local&&side===1;
      const left=far?'ArrowLeft':'KeyA',right=far?'ArrowRight':'KeyD',forward=far?'ArrowUp':'KeyW',back=far?'ArrowDown':'KeyS';
      if(k[left]||k[right]){const d=(k[right]?1:0)-(k[left]?1:0);input.x=clamp(input.x+d*dt*1.7,-1.12,1.12);input.aim=d*.35;}
      if(k[forward]||k[back])input.depth=clamp(input.depth+((k[back]?1:0)-(k[forward]?1:0))*dt*.55,1.40,1.72);
      const held=!!k[far?'Enter':'Space'];input.swing=held||(!local&&(rt.pointer||now<rt.armed));input.serve=now<rt.serveAt[side]&&state.phase==='ready'&&state.server===side;
      if(local){input.spin=k[far?'ShiftRight':'KeyQ']?'top':k[far?'ControlRight':'KeyE']?'back':'flat';input.power=held?.5:.4;}
      else if(rt.pointer)input.power=clamp(.35+(now-rt.down)/1400,.35,.9);
     }}else rt.inputs.forEach(i=>{i.swing=false;i.serve=false;});
     if(rt.mode==='online'&&netRef.current){netRef.current.setInput(rt.inputs[ps]);state=netRef.current.getRenderState(dt)||state;rt.state=state;}else if(!rt.paused&&!modalRef.current)e.stepGame(state,rt.inputs,dt);
     for(const ev of state.events||[])if(ev.id>rt.lastEvent){if(!rt.paused)audio.event(ev);rt.lastEvent=ev.id;}
     if(state.phase==='matchover'&&!rt.resultSaved){rt.resultSaved=true;if(rt.mode==='ai')setStats(prev=>{const next={played:prev.played+1,won:prev.won+(state.winner===0?1:0),best:Math.max(prev.best,state.stats?.longestRally||0)};try{localStorage.setItem('rally.stats',JSON.stringify(next));}catch{}return next;});}
    }
    arena.update(state,dt,{mode:rt.view==='play'?'play':'home',side:rt.side,camera:rt.mode==='local'?'broadcast':settingsRef.current.camera,reducedMotion:matchMedia('(prefers-reduced-motion:reduce)').matches});
    if(now-rt.lastHud>80){rt.lastHud=now;if(rt.view==='play'){const s=rt.mode==='online'?(netRef.current?.snapshot||state):state;setHud({score:[...s.score],games:[...s.games],server:s.server,phase:s.phase,rally:s.rally,bestOf:s.bestOf,lastPoint:s.lastPoint,winner:s.winner});setPower(rt.inputs[rt.side].power);if(netRef.current)setLatency(Math.round(netRef.current.latency||0));}}
    rt.frame=requestAnimationFrame(animate);
   };rt.frame=requestAnimationFrame(animate);setReady(true);
   cleanup=()=>{cancelAnimationFrame(rt.frame);canvas.removeEventListener('pointerdown',down);canvas.removeEventListener('pointermove',aim);canvas.removeEventListener('pointerup',up);canvas.removeEventListener('pointercancel',up);canvas.removeEventListener('contextmenu',noMenu);window.removeEventListener('keydown',keydown);window.removeEventListener('keyup',keyup);window.removeEventListener('blur',lost);arena.dispose();audio.dispose?.();netRef.current?.dispose();runtime.current=null;};
  }).catch(err=>{if(disposed)return;console.error(err);setError('The 3D table could not start. Turn on hardware acceleration and reload.');});
  return()=>{disposed=true;alive.current=false;cleanup();};
 },[]);
 const updateSettings=patch=>setSettings(s=>({...s,...patch}));
 const detachNetwork=()=>{
  const net=netRef.current;netRef.current=null;
  if(net)void net.leave();
  setRoom(null);setBusy(false);setNetStatus('');
 };
 const dismissModal=()=>{
  if(['friend','lobby'].includes(modalRef.current)){
   detachNetwork();
   if(location.search)history.replaceState(null,'',location.pathname);
  }
  setModal(null);
 };
 const start=(m,level=settings.difficulty)=>{const rt=runtime.current;if(!rt)return;detachNetwork();rt.audio.unlock();Object.assign(rt,{mode:m,view:'play',side:0,paused:false,inputs:[freshInput(),freshInput()],keys:{},lastEvent:0,resultSaved:false,pointer:false,armed:0,serveAt:[0,0],onlineRound:null,onlineCode:null});rt.state=rt.engine.createGame({mode:m,difficulty:level,bestOf:settings.bestOf});setHud({...initialHud,bestOf:settings.bestOf});setMode(m);setView('play');setPaused(false);setModal(null);setHint(true);setSpin('flat');};
 const home=()=>{const rt=runtime.current;if(!rt)return;detachNetwork();Object.assign(rt,{view:'home',paused:false,keys:{},pointer:false,armed:0,serveAt:[0,0],onlineRound:null,onlineCode:null});rt.state=rt.engine.createGame({mode:'demo',difficulty:3,bestOf:3});setView('home');setPaused(false);setModal(null);setRoom(null);setNetStatus('');if(location.search)history.replaceState(null,'',location.pathname);};
 const pause=()=>{const rt=runtime.current;if(!rt)return;rt.paused=!rt.paused;rt.pointer=false;rt.keys={};setPaused(rt.paused);};
 const serve=()=>{const rt=runtime.current;if(!rt)return;rt.audio.unlock();rt.serveAt[rt.mode==='local'?rt.state.server:rt.side]=performance.now()+700;setHint(false);};
 const chooseSpin=id=>{const rt=runtime.current;if(rt)rt.inputs[rt.side].spin=id;setSpin(id);};
 const makeNetwork=()=>{
  const rt=runtime.current;if(!rt)throw new Error('The arena is still loading.');
  netRef.current?.dispose();
  const net=new rt.Network({
   onState:(state,info)=>{
    if(!alive.current||netRef.current!==net||runtime.current!==rt)return;
    setRoom(info);
    // The lobby has its own demo. Never feed a server snapshot to that simulation.
    if(!state||!['playing','finished'].includes(info.status))return;
    const roundKey=`${info.code}:${info.round}`;
    const entering=rt.view!=='play'||rt.mode!=='online'||rt.onlineCode!==info.code;
    const roundChanged=rt.onlineRound!==roundKey;
    rt.onlineRound=roundKey;rt.onlineCode=info.code;
    if(entering||roundChanged){
     const inputs=[0,1].map(side=>({
      ...freshInput(),
      x:state.paddles[side].x,
      depth:Math.abs(state.paddles[side].z),
      aim:info.inputs?.[side]?.aim||0,
      power:info.inputs?.[side]?.power??.45,
      spin:info.inputs?.[side]?.spin||'flat',
     }));
     Object.assign(rt,{view:'play',mode:'online',side:info.side,paused:false,inputs,keys:{},pointer:false,armed:0,serveAt:[0,0],lastPointer:0,lastEvent:entering&&state.time>.5?(state.eventId||0):0,resultSaved:false});
     setView('play');setMode('online');setPaused(false);setModal(null);setHint(true);setSpin(inputs[info.side].spin);
    }
    // Network rendering is a separate predicted copy; the HUD reads net.snapshot.
    rt.state=net.getRenderState(0)||JSON.parse(JSON.stringify(state));
   },
   onStatus:(status,detail)=>{if(alive.current&&netRef.current===net&&runtime.current===rt){setNetStatus(status);setNetDetail(detail||'');}},
  });
  netRef.current=net;return net;
 };
 useEffect(()=>{
  if(!ready)return;
  const code=new URLSearchParams(location.search).get('room');
  if(code)setRoomCode(code.toUpperCase().slice(0,6));
  let canceled=false;
  const net=makeNetwork();
  net.resume(code||undefined).then(info=>{
   if(canceled||!alive.current||netRef.current!==net)return;
   if(info){setRoom(info);if(info.status==='waiting')setModal('lobby');}
   else if(code)setModal('friend');
  }).catch(()=>{if(!canceled&&alive.current&&netRef.current===net&&code)setModal('friend');});
  return()=>{canceled=true;if(netRef.current===net){netRef.current=null;net.dispose();}};
 },[ready]);
 const roomAction=async action=>{
  if(busy)return;
  detachNetwork();setBusy(true);setOnlineError('');
  let net;
  try{
   net=makeNetwork();
   const name=settings.name.trim().slice(0,20)||'Player';
   const info=action==='create'?await net.create({name,bestOf:settings.bestOf}):await net.join({code:roomCode.trim().toUpperCase(),name});
   if(!alive.current||netRef.current!==net)return;
   setRoom(info);setModal(info.status==='waiting'?'lobby':null);
   runtime.current?.audio.unlock();history.replaceState(null,'',`/?room=${net.code}`);
  }catch(err){if(alive.current&&(!net||netRef.current===net))setOnlineError(err.message||'Could not connect. Please try again.');}
  finally{if(alive.current&&(!net||netRef.current===net))setBusy(false);}
 };
 const startOnline=async()=>{
  const net=netRef.current;if(!net||busy)return;
  setBusy(true);setOnlineError('');
  try{await net.start();}
  catch(err){if(alive.current&&netRef.current===net)setOnlineError(err.message);}
  finally{if(alive.current&&netRef.current===net)setBusy(false);}
 };
 const rematch=async()=>{
  if(mode!=='online'){start(mode);return;}
  const net=netRef.current;if(!net||busy)return;
  setBusy(true);setOnlineError('');
  try{await net.rematch();}
  catch(err){if(alive.current&&netRef.current===net)setOnlineError(err.message);}
  finally{if(alive.current&&netRef.current===net)setBusy(false);}
 };
 const copyInvite=async()=>{
  const net=netRef.current,code=net?.code;if(!code)return;
  try{
   await navigator.clipboard.writeText(`${location.origin}/?room=${code}`);
   if(!alive.current||netRef.current!==net)return;
   setCopied(true);setTimeout(()=>{if(alive.current&&netRef.current===net)setCopied(false);},2000);
  }catch{if(alive.current&&netRef.current===net)setOnlineError(`Share this link: ${location.origin}/?room=${code}`);}
 };
 const displayNames=mode==='ai'?['You',LEVELS[settings.difficulty]]:mode==='local'?['Player 1','Player 2']:(room?.players?.map(p=>p?.name||'Player')||['You','Friend']);
 const mySide=mode==='online'?(room?.side??0):0,canServe=view==='play'&&hud.phase==='ready'&&(mode==='local'||hud.server===mySide),totalGames=Math.ceil(hud.bestOf/2),showEnd=view==='play'&&hud.phase==='matchover',players=room?.players||netRef.current?.players||[];
 const onlineProblem=view==='play'&&mode==='online'&&['left','error'].includes(netStatus);
 const nextLevel=mode==='ai'&&hud.winner===0&&settings.difficulty<4?settings.difficulty+1:null;
 const goHome=()=>{if(view==='play'&&hud.phase!=='matchover'&&!window.confirm('Leave this match?'))return;home();};
 const tip=mode==='local'?'Player 1: W A S D and Space. Player 2: arrows and Enter.':touch?'Drag to move. Hold or swipe to hit.':'Move the mouse. Hold click to hit.';
 return <main className={`app ${view==='home'?'is-home':'is-playing'} ${touch?'is-touch':''}`}>
  <div ref={arenaEl} className="arena" aria-label="3D table tennis arena"/><div className={`scene-shade ${view==='home'?'home-shade':''}`}/>
  <header className="topbar">{view==='play'?<button className="brand" onClick={goHome} aria-label="Table Tennis start screen"><Mark/></button>:<span/>}<nav className="top-actions" aria-label="Game controls"><button className="icon-button" onClick={()=>{updateSettings({sound:!settings.sound});runtime.current?.audio.unlock();}} aria-label={settings.sound?'Sound off':'Sound on'} title={settings.sound?'Sound off':'Sound on'}><Icon name={settings.sound?'volume':'muted'}/></button>{view==='home'?<button className="icon-button" onClick={()=>setModal('settings')} aria-label="Settings"><Icon name="settings"/></button>:<button className="icon-button" onClick={pause} aria-label="Pause"><Icon name="pause"/></button>}</nav></header>
  {view==='home'&&<section className="home-content"><h1>Table<br/><em>Tennis</em></h1><div className="home-setup"><div className="setting-heading"><span>Level</span></div><div className="difficulty" role="group" aria-label="Computer level">{LEVELS.map((level,i)=><button key={level} className={settings.difficulty===i?'selected':''} onClick={()=>updateSettings({difficulty:i})} aria-pressed={settings.difficulty===i}>{level}</button>)}</div><div className="match-format"><label>Best of <select value={settings.bestOf} onChange={e=>updateSettings({bestOf:Number(e.target.value)})} aria-label="Match format"><option value={3}>3</option><option value={5}>5</option><option value={7}>7</option></select></label></div></div><button className="button primary play-computer" onClick={()=>start('ai')} disabled={!ready}><span>{ready?'Play computer':'Loading…'}</span><Icon name="arrow" size={22}/></button><div className="secondary-modes"><button onClick={()=>{setOnlineError('');setModal('friend');}} disabled={!ready}><Icon name="globe"/><span>Play a friend</span></button><button onClick={()=>setModal('local')} disabled={!ready}><Icon name="local"/><span>Two players</span></button></div><button className="text-button home-help" onClick={()=>setModal('help')}><Icon name="help" size={15}/>How to play</button></section>}
  {view==='play'&&<><section className="scoreboard" aria-label={`Score ${hud.score[0]} to ${hud.score[1]}`}><div className={`score-player ${hud.server===0?'serving':''}`}><span className="player-name">{displayNames[0]}<i className="serve-dot" title="Serving"/></span><span className="score-value">{hud.score[0]}</span><Dots value={hud.games[0]} total={totalGames}/></div><div className="score-center"><span>Game {hud.games[0]+hud.games[1]+(['matchover','gameover'].includes(hud.phase)?0:1)}</span><span className="score-dash">:</span><span>Best of {hud.bestOf}</span></div><div className={`score-player ${hud.server===1?'serving':''}`}><span className="player-name">{displayNames[1]}<i className="serve-dot" title="Serving"/></span><span className="score-value">{hud.score[1]}</span><Dots value={hud.games[1]} total={totalGames}/></div></section>{hud.rally>2&&!paused&&!showEnd&&<div className="rally-counter"><b>{hud.rally}</b><span>Rally</span></div>}{hud.score[0]>=10&&hud.score[0]===hud.score[1]&&!showEnd&&<div className="deuce-label">Deuce</div>}{!paused&&!modal&&!showEnd&&!onlineProblem&&<div className="match-message" aria-live="polite">{['point','gameover'].includes(hud.phase)&&hud.lastPoint?<><span className="point-kicker">{hud.lastPoint.winner==null?'Serve again':hud.phase==='gameover'?'Game':'Point'}</span><h2>{hud.lastPoint.winner==null?'Let':displayNames[hud.lastPoint.winner]}</h2><p>{formatReason(hud.lastPoint.reason)}</p></>:hud.phase==='ready'?<><span className="point-kicker">{hud.server===mySide&&mode!=='local'?'Your serve':`${displayNames[hud.server]} serves`}</span>{canServe?<button className="serve-button" onClick={serve}>{touch?'Tap to serve':'Serve'}{!touch&&<span>{mode==='local'?(hud.server===0?'Space':'Enter'):'Space'}</span>}</button>:<span className="waiting-serve">Waiting for the serve</span>}</>:null}</div>}{mode==='online'&&netStatus==='reconnecting'&&<div className="connection-notice"><span className="spinner"/>{netDetail||'Reconnecting…'}</div>}<div className="game-bottom"><div className="game-bottom-left"><button className="icon-button" onClick={()=>setModal('help')} aria-label="How to play"><Icon name="help"/></button></div>{mode!=='local'&&<div className="shot-controls"><div className="spin-control" role="group" aria-label="Shot spin">{SPINS.map(s=><button key={s.id} className={spin===s.id?'active':''} aria-label={s.name} aria-pressed={spin===s.id} title={touch?s.name:`${s.name} (${s.key})`} onClick={()=>chooseSpin(s.id)}><span><Icon name={`spin-${s.id}`} size={18}/></span><small>{s.name}</small></button>)}</div><div className="power-meter" aria-label={`Shot power ${Math.round(power*100)} percent`}><span>Power</span><div><i style={{width:`${power*100}%`}}/></div></div></div>}{mode!=='local'&&<button className="camera-switch" onClick={()=>updateSettings({camera:settings.camera==='player'?'broadcast':'player'})} aria-label="Switch camera" title="Switch camera"><Icon name="screen" size={18}/><span>{settings.camera==='player'?'Player':'Broadcast'}</span></button>}</div>{hint&&hud.phase==='ready'&&!paused&&!modal&&!onlineProblem&&<div className="first-hint">{tip}<button onClick={()=>setHint(false)} aria-label="Dismiss tip"><Icon name="close" size={14}/></button></div>}</>}
  {error&&<div className="load-error"><h2>Could not load</h2><p>{error}</p><button className="button primary" onClick={()=>location.reload()}>Reload</button></div>}
  {(modal||paused||showEnd||onlineProblem)&&<div className="modal-backdrop" onPointerDown={e=>{if(e.target===e.currentTarget&&modal&&modal!=='lobby')dismissModal();}}><section className={`modal ${modal==='help'?'help-modal':''}`} role="dialog" aria-modal="true" aria-labelledby="dialog-title">
   {modal&&<button className="modal-close icon-button" aria-label="Close" onClick={dismissModal}><Icon name="close"/></button>}
   {modal==='friend'&&<><h2 id="dialog-title">Play a friend</h2><label className="field-label">Your name<input maxLength={20} value={settings.name} onChange={e=>updateSettings({name:e.target.value})} placeholder="Your name" autoComplete="nickname"/></label><button className="button primary full" disabled={busy||!ready} onClick={()=>roomAction('create')}>{busy?'Connecting…':'Create room'}<Icon name="arrow"/></button><div className="form-divider"><span/>or join with a code<span/></div><form className="join-form" onSubmit={e=>{e.preventDefault();roomAction('join');}}><input aria-label="Room code" value={roomCode} maxLength={6} onChange={e=>setRoomCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,''))} placeholder="ROOM CODE" autoCapitalize="characters" autoComplete="off"/><button className="button secondary" disabled={busy||roomCode.length!==6}>Join<Icon name="arrow" size={18}/></button></form>{onlineError&&<p className="form-error" role="alert">{onlineError}</p>}</>}
   {modal==='lobby'&&<><h2 id="dialog-title">Invite a friend</h2><p className="modal-lead">Send the link, or share the code.</p><button className="room-code" onClick={copyInvite} title="Copy invite link"><span>{netRef.current?.code}</span><Icon name={copied?'check':'copy'} size={23}/></button><button className="text-button copy-link" onClick={copyInvite}>{copied?'Link copied':'Copy invite link'}<Icon name="arrow" size={16}/></button><div className="lobby-players">{[0,1].map(i=><div key={i}><span className={`player-avatar ${i===1?'coral':''}`}>{players[i]?.name?.slice(0,1).toUpperCase()||'?'}</span><span>{players[i]?.name||'Waiting for a friend…'}<small>{players[i]?.left?'Left':i===0?'Host':'Guest'}</small></span>{players[i]?.name&&!players[i]?.left?<span className="live-dot"/>:<span className="spinner"/>}</div>)}</div>{['error','left'].includes(netStatus)&&<p className="form-error" role="alert">{netDetail}</p>}{netRef.current?.side===0?<button className="button primary full" disabled={busy||!players[1]?.name||players[1]?.left} onClick={startOnline}>{busy?'Starting…':'Start match'}<Icon name="arrow"/></button>:<p className="lobby-wait">{players[0]?.left?`${players[0].name} left. Start a new room to play.`:'Waiting for the host to start.'}</p>}{onlineError&&<p className="form-error" role="alert">{onlineError}</p>}</>}
   {modal==='local'&&<><h2 id="dialog-title">Two players</h2><div className="local-controls"><div><span className="player-avatar">1</span><h3>Player 1</h3><p><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></p><p><kbd>Space</kbd>Serve / hit</p><small>Q topspin · E backspin</small></div><div><span className="player-avatar coral">2</span><h3>Player 2</h3><p><kbd>↑</kbd><kbd>←</kbd><kbd>↓</kbd><kbd>→</kbd></p><p><kbd>Enter</kbd>Serve / hit</p><small>Right Shift topspin · Right Ctrl backspin</small></div></div>{touch&&<p className="form-error">Two players on one screen needs a keyboard. On phones, use Play a friend.</p>}<button className="button primary full" onClick={()=>start('local')}>Start<Icon name="arrow"/></button></>}
   {modal==='settings'&&<><h2 id="dialog-title">Settings</h2><div className="settings-list"><label><span>Sound</span><button role="switch" aria-checked={settings.sound} aria-label="Sound" className={`toggle ${settings.sound?'on':''}`} onClick={()=>{updateSettings({sound:!settings.sound});runtime.current?.audio.unlock();}}><i/></button></label>{!touch&&<label><span>Mouse sensitivity<small>{settings.sensitivity.toFixed(1)}×</small></span><input aria-label="Mouse sensitivity" type="range" min="0.6" max="1.6" step="0.1" value={settings.sensitivity} onChange={e=>updateSettings({sensitivity:Number(e.target.value)})}/></label>}<label><span>Graphics</span><select value={settings.quality} onChange={e=>updateSettings({quality:e.target.value})}><option value="auto">Auto</option><option value="high">High</option><option value="low">Fast</option></select></label><label><span>Camera</span><select value={settings.camera} onChange={e=>updateSettings({camera:e.target.value})}><option value="player">Player</option><option value="broadcast">Broadcast</option></select></label><label><span>Match length<small>From your next match</small></span><select value={settings.bestOf} onChange={e=>updateSettings({bestOf:Number(e.target.value)})}><option value={3}>Best of 3</option><option value={5}>Best of 5</option><option value={7}>Best of 7</option></select></label></div><button className="button primary full" onClick={()=>setModal(null)}>Done<Icon name="check"/></button></>}
   {modal==='help'&&<><h2 id="dialog-title">How to play</h2><div className="help-steps"><div><b>1</b><section><h3>Move</h3><p>{touch?'Drag anywhere on the court to move your paddle.':'Move the mouse left and right, or use W A S D. The paddle follows the ball’s height.'}</p></section></div><div><b>2</b><section><h3>Hit after the bounce</h3><p>{touch?'Hold your finger down to return. Swipe for a harder shot.':'Hold click or Space to swing. Hold longer for more power.'}</p></section></div><div><b>3</b><section><h3>Aim and spin</h3><p>Move sideways as you hit to aim. Pick topspin, backspin or sidespin below the court{touch?'.':', or press 1–5.'}</p></section></div></div><div className="rules-note"><b>First to 11, win by two.</b><p>The serve bounces once on each side. Serve changes every two points, and every point at 10–10. A serve that clips the net and lands is replayed. Hitting before the bounce, a second bounce or missing the table loses the point.</p></div><button className="button primary full" onClick={()=>setModal(null)}>Got it<Icon name="arrow"/></button></>}
   {!modal&&onlineProblem&&<><h2 id="dialog-title">{netStatus==='left'?`${room?.players?.[1-mySide]?.name||'Your friend'} left`:'Room closed'}</h2><p className="modal-lead">{netStatus==='left'?'The match is over. Start a new room to play again.':netDetail}</p><button className="button primary full" onClick={home}>Back to menu<Icon name="arrow"/></button></>}
   {!modal&&!onlineProblem&&paused&&!showEnd&&<><h2 id="dialog-title">Paused</h2>{mode==='online'&&<p className="modal-lead">Online matches keep running.</p>}<button className="button primary full" onClick={pause}>Resume<Icon name="play"/></button><button className="button text full" onClick={()=>setModal('settings')}>Settings<Icon name="settings"/></button><button className="button text full" onClick={home}>Leave match<Icon name="arrow"/></button></>}
   {!modal&&!onlineProblem&&showEnd&&<><h2 id="dialog-title">{mode==='ai'?(hud.winner===0?'You win':'You lose'):mode==='online'?(hud.winner===mySide?'You win':`${displayNames[hud.winner||0]} wins`):`${displayNames[hud.winner||0]} wins`}</h2><div className="result-score"><span className={hud.winner===0?'winner':''}>{hud.games[0]}</span><i>–</i><span className={hud.winner===1?'winner':''}>{hud.games[1]}</span></div>{nextLevel!==null&&<button className="button primary full" onClick={()=>{updateSettings({difficulty:nextLevel});start('ai',nextLevel);}}>Play {LEVELS[nextLevel]}<Icon name="arrow"/></button>}<button className={`button ${nextLevel!==null?'secondary':'primary'} full`} onClick={rematch} disabled={busy||mode==='online'&&room?.rematchVotes?.[mySide]}>{mode==='online'&&room?.rematchVotes?.[mySide]?`Waiting for ${room?.players?.[1-mySide]?.name||'your friend'}…`:busy?'Waiting…':'Play again'}<Icon name="reset"/></button><button className="button text full" onClick={home}>Menu<Icon name="arrow"/></button>{onlineError&&<p className="form-error">{onlineError}</p>}</>}
  </section></div>}
 </main>;
}
function formatReason(reason=''){const names={double_bounce:'Two bounces',out:'Out of bounds',net:'Into the net',serve_fault:'Service fault',volley:'Before the bounce',miss:'Missed return',wrong_side:'Wrong side',let:'Let — serve again',double_hit:'Double hit',floor:'Missed return'};return names[reason]||reason.replaceAll('_',' ').replace(/^./,s=>s.toUpperCase());}
