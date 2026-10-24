'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowRight, ArrowUpRight, Check, ChevronRight, Copy, Focus, Globe2, HelpCircle, Home, Maximize2, Minus, Music2, Plus, RotateCcw, TableProperties, Trophy, UserRound, UsersRound, Volume2, VolumeX, X } from 'lucide-react';
import { COURSES, MAX_STROKES, makeBall, planShot, simulateShot, type Ball, type ShotFrame } from '@/lib/golf';
import { PLAYER_COLORS, clearRoomSession, getGolfRoom, golfRequest, readRoomSession, saveRoomSession, type OnlinePlayer, type OnlineRoom, type RoomReply, type RoomSession } from '@/lib/multiplayer';
import { ClubAudio } from '@/lib/audio';
import type { GolfScene } from '@/lib/scene';

type Player = OnlinePlayer & { bot?: boolean };
type LocalGame = { id:string; players:Player[]; holes:9|18; holeIndex:number; turnId:string|null; phase:'playing'|'holeComplete'|'complete'; difficulty:number };
type View = 'home'|'play'|'lobby';
type Modal = null|'help'|'score'|'settings'|'exit'|'course';
const DIFFICULTIES = ['Beginner','Easy','Medium','Hard','Expert'];
const BOT_NAMES = ['Milo','Cleo','Otis'];
const total = (p:OnlinePlayer) => p.scores.reduce<number>((a,b)=>a+(b??0),0);
const relative = (p:OnlinePlayer) => p.scores.reduce<number>((a,b,i)=>a+(b===null?0:b-COURSES[i].par),0);
const signed = (v:number) => v===0?'E':v>0?`+${v}`:String(v);
const strokeName = (strokes:number,par:number) => strokes===1?'Hole in one!':strokes-par<=-2?'Eagle!':strokes-par===-1?'Birdie!':strokes===par?'Right on par.':strokes>=MAX_STROKES?'On to the next.':'In the cup.';
function FlagMark({small=false}:{small?:boolean}) { return <svg viewBox="0 0 48 48" width={small?30:39} height={small?30:39} fill="none" aria-hidden="true"><path d="M24 36V8l16 6-16 7" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round"/><path d="M17 32c-6 .5-10 2.1-10 4s7.6 4 17 4 17-1.8 17-4-4.1-3.5-10-4" stroke="currentColor" strokeWidth="2.5"/><circle cx="12" cy="26" r="3.5" fill="currentColor"/></svg>; }
function BallDot({color,size=12}:{color:string;size?:number}) {return <span className="ball-dot" style={{background:color,width:size,height:size}}/>;}
function HoleMap({index}:{index:number}) {const h=COURSES[index]; const b=h.bounds;return <svg viewBox={`${b.x-b.w/2-1} ${b.z-b.d/2-1} ${b.w+2} ${b.d+2}`} aria-hidden="true">{h.floors.map((f,i)=><rect key={i} x={f.x-f.w/2} y={f.z-f.d/2} width={f.w} height={f.d} fill="#85aa73"/>)}{h.walls.map((w,i)=><line key={i} x1={w.ax} y1={w.az} x2={w.bx} y2={w.bz} stroke="#f4ead5" strokeWidth=".35"/>)}{h.obstacles.map((o,i)=><circle key={i} cx={o.x} cy={o.z} r={o.radius||.55} fill="#d89f67"/>)}<circle cx={h.cup.x} cy={h.cup.z} r=".5" fill="#254d3c"/><circle cx={h.start.x} cy={h.start.z} r=".45" fill="white"/></svg>;}

export default function GolfClub() {
  const mount = useRef<HTMLDivElement>(null), scene = useRef<GolfScene|null>(null), audio = useRef<ClubAudio|null>(null);
  const [ready,setReady]=useState(false),[webglError,setWebglError]=useState('');
  const [view,setView]=useState<View>('home'),[mode,setMode]=useState<'solo'|'local'|'online'>('solo');
  const [holes,setHoles]=useState<9|18>(9),[difficulty,setDifficulty]=useState(2),[botCount,setBotCount]=useState(1),[humanCount,setHumanCount]=useState(2);
  const [name,setName]=useState('You'),[localNames,setLocalNames]=useState(['You','Player 2','Player 3','Player 4']),[color,setColor]=useState(PLAYER_COLORS[0]);
  const [joinCode,setJoinCode]=useState(''),[onlineTab,setOnlineTab]=useState<'create'|'join'>('create');
  const [local,setLocal]=useState<LocalGame|null>(null),[room,setRoom]=useState<OnlineRoom|null>(null),[session,setSession]=useState<RoomSession|null>(null);
  const [reconnect,setReconnect]=useState<RoomSession|null>(null),[savedGame,setSavedGame]=useState<LocalGame|null>(null);
  const [busy,setBusy]=useState(false),[networkBusy,setNetworkBusy]=useState(false),[connected,setConnected]=useState(true),[power,setPower]=useState(0);
  const [modal,setModal]=useState<Modal>(null),[muted,setMuted]=useState(false),[music,setMusic]=useState(true),[camera,setCamera]=useState<'follow'|'overview'>('follow');
  const [canFullscreen,setCanFullscreen]=useState(false);
  useEffect(()=>{setCanFullscreen(!!document.fullscreenEnabled&&typeof document.documentElement.requestFullscreen==='function');},[]);
  const [notice,setNotice]=useState(''),[intro,setIntro]=useState(false),[copied,setCopied]=useState(false),[now,setNow]=useState(Date.now()),[best,setBest]=useState<number|null>(null);
  const localRef=useRef<LocalGame|null>(null),roomRef=useRef<OnlineRoom|null>(null),sessionRef=useRef<RoomSession|null>(null),viewRef=useRef<View>('home');
  const busyRef=useRef(false),canShootRef=useRef(false),qaRef=useRef<()=>boolean>(()=>false),shotRef=useRef<(angle:number,power:number)=>void>(()=>{}),worldKey=useRef(''),lastOnlineShot=useRef(''),timeOffset=useRef(0),noticeTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const game = session?room:local, players=game?.players||[],holeIndex=game?.holeIndex||0;
  const replayPlayerId=session&&room?.shot&&room.shot.holeIndex===room.holeIndex&&now+timeOffset.current<room.readyAt?room.shot.playerId:null;
  const active=players.find(p=>p.id===(replayPlayerId||game?.turnId));
  const online=!!session, phase=game?.phase, myTurn=online?active?.id===session?.playerId:!((active as Player)?.bot);
  const canShoot=view==='play'&&phase==='playing'&&!busy&&!intro&&!modal&&!networkBusy&&!!active&&myTurn&&(!online||(now+timeOffset.current>=(room?.readyAt||0)&&connected));
  canShootRef.current=canShoot;localRef.current=local;roomRef.current=room;sessionRef.current=session;viewRef.current=view;
  const notify=(message:string)=>{setNotice(message);if(noticeTimer.current)clearTimeout(noticeTimer.current);noticeTimer.current=setTimeout(()=>setNotice(''),3600);};
  const setPlaying=(value:boolean)=>{busyRef.current=value;setBusy(value);};
  const setLocalGame=(value:LocalGame)=>{localRef.current=value;setLocal(value);};

  useEffect(()=>{
    audio.current=new ClubAudio();
    try { const settings=JSON.parse(localStorage.getItem('little-links-settings')||'{}');setMuted(!!settings.muted);setMusic(settings.music!==false);audio.current.setMuted(!!settings.muted);audio.current.setMusic(settings.music!==false);
      const saved=JSON.parse(localStorage.getItem('little-links-round')||'null');if(saved?.players?.length&&saved.phase!=='complete'&&COURSES[saved.holeIndex]&&saved.players.every((p:Player)=>p.ball&&Array.isArray(p.scores)))setSavedGame(saved);
      const record=localStorage.getItem(`little-links-best-9`);if(record!==null)setBest(Number(record));
    } catch {}
    const previous=readRoomSession();setReconnect(previous);
    const code=new URLSearchParams(location.search).get('room');if(code){setMode('online');setOnlineTab('join');setJoinCode(code.toUpperCase().slice(0,6));setName('');}
    let disposed=false;
    void import('@/lib/scene').then(({GolfScene})=>{if(disposed||!mount.current)return;try {scene.current=new GolfScene(mount.current,{onShot:(a,p)=>shotRef.current(a,p),onAim:setPower,onReady:()=>setReady(true),onError:setWebglError});setReady(true);}catch(e){setWebglError(e instanceof Error?e.message:'WebGL could not start.');}}).catch(()=>setWebglError('The course could not load. Refresh to try again.'));
    if(new URLSearchParams(location.search).get('qa')==='1')Object.assign(window,{__golfQa:{ball:()=>scene.current?.ballScreen()??null,canShoot:()=>canShootRef.current,autoShot:()=>qaRef.current()}});
    const tick=setInterval(()=>setNow(Date.now()),400);
    return ()=>{disposed=true;clearInterval(tick);scene.current?.dispose();audio.current?.dispose();if(noticeTimer.current)clearTimeout(noticeTimer.current);};
  },[]);
  useEffect(()=>{audio.current?.setMuted(muted);audio.current?.setMusic(music);try{localStorage.setItem('little-links-settings',JSON.stringify({muted,music}));}catch{}},[muted,music]);
  useEffect(()=>{try{const v=localStorage.getItem(`little-links-best-${holes}`);setBest(v===null?null:Number(v));}catch{}},[holes]);
  useEffect(()=>{if(local&&!busy){try{localStorage.setItem('little-links-round',JSON.stringify(local));}catch{}}},[local,busy]);
  useEffect(()=>{if(!intro)return;const timer=setTimeout(()=>setIntro(false),1800);return()=>clearTimeout(timer);},[intro,holeIndex]);
  useEffect(()=>{
    if(!ready||!scene.current)return;
    const isHome=view==='home'||view==='lobby', idx=isHome?5:holeIndex, key=`${isHome?'home':'play'}-${idx}`;
    if(worldKey.current!==key){worldKey.current=key;setPlaying(false);scene.current.setHole(COURSES[idx]);scene.current.setMode(isHome?'home':'play');if(!isHome){setIntro(true);scene.current.setCamera(camera);} }
    if(isHome){scene.current.setPlayers([{id:'preview',color,ball:makeBall(COURSES[idx])}]);scene.current.setActive('preview');}
    else {scene.current.setPlayers(players.map(p=>({id:p.id,color:p.color,ball:{...p.ball,sunk:p.finished||p.ball.sunk}})));if(active)scene.current.setActive(active.id);}
    scene.current.setCanShoot(canShoot);
  },[ready,view,holeIndex,players,active,canShoot,color,camera]);
  useEffect(()=>{scene.current?.setCamera(camera);},[camera]);

  function applyReply(reply:RoomReply) {
    if(!reply.token&&sessionRef.current?.code!==reply.room.code)return;
    timeOffset.current=reply.serverTime-Date.now();setConnected(true);
    if(roomRef.current&&roomRef.current.code===reply.room.code&&reply.room.version<roomRef.current.version)return;
    roomRef.current=reply.room;setRoom(reply.room);
    if(reply.playerId&&reply.token){const next={code:reply.room.code,playerId:reply.playerId,token:reply.token};sessionRef.current=next;setSession(next);saveRoomSession(next);setReconnect(next);}
    setView(reply.room.phase==='lobby'?'lobby':'play');
  }
  useEffect(()=>{
    if(!session)return;let cancelled=false,requesting=false;const controller=new AbortController();
    // Free-plan budget: one request per 1.5 s, none while hidden, none after 10 quiet minutes until the player touches the page.
    let lastVersion=-1,lastChange=Date.now();
    // While busy or offline, back off: 3 s, 6 s, up to 15 s between polls.
    let failures=0,nextAt=0;
    const poll=async()=>{if(requesting||document.hidden||Date.now()-lastChange>600000||Date.now()<nextAt)return;requesting=true;try{const reply=await getGolfRoom(session.code,session.token,controller.signal);failures=0;nextAt=0;if(reply.room.version!==lastVersion){lastVersion=reply.room.version;lastChange=Date.now();}if(!cancelled)applyReply(reply);}catch{failures=Math.min(failures+1,4);nextAt=Date.now()+Math.min(15000,1500*2**failures);if(!cancelled)setConnected(false);}finally{requesting=false;}};
    const wake=()=>{const idle=Date.now()-lastChange>600000;lastChange=Date.now();if(idle&&!document.hidden)void poll();};
    const visible=()=>{if(!document.hidden)wake();};
    void poll();const timer=setInterval(poll,1500);document.addEventListener('visibilitychange',visible);window.addEventListener('pointerdown',wake);
    return()=>{cancelled=true;controller.abort();clearInterval(timer);document.removeEventListener('visibilitychange',visible);window.removeEventListener('pointerdown',wake);};
  },[session?.code,session?.token]);
  useEffect(()=>{
    if(!ready||!scene.current||!room||!session||view!=='play')return;
    scene.current.setTime((Date.now()+timeOffset.current-room.startedAt)/1000);
    const shot=room.shot;if(!shot||shot.id===lastOnlineShot.current||shot.holeIndex!==room.holeIndex)return;
    lastOnlineShot.current=shot.id;const elapsed=Math.max(0,(Date.now()+timeOffset.current-shot.startAt)/1000);
    if(elapsed>=shot.duration)return;
    const frames=shot.frames.filter(f=>f.t>=elapsed).map(f=>({...f,t:f.t-elapsed}));
    if(!frames.length)return;frames[0].t=0;setPlaying(true);audio.current?.putt(.5);
    scene.current.playTrajectory(shot.playerId,frames,()=>{setPlaying(false);scene.current?.setPlayers(roomRef.current!.players.map(p=>({id:p.id,color:p.color,ball:{...p.ball,sunk:p.finished||p.ball.sunk}})));if(shot.outcome==='cup')audio.current?.cup();if(shot.outcome==='water'){audio.current?.water();notify('Water hazard · +1 stroke');}});
  },[room?.shot?.id,room?.holeIndex,ready,view,session]);

  function startLocal(resume?:LocalGame) {
    audio.current?.init();setSession(null);sessionRef.current=null;setRoom(null);setModal(null);setPlaying(false);setNotice('');
    if(resume){setLocalGame(resume);setView('play');setIntro(true);return;}
    const count=mode==='local'?humanCount:botCount+1;
    const entries:Player[]=Array.from({length:count},(_,i)=>({id:`p${i}`,name:mode==='local'?(localNames[i].trim()||`Player ${i+1}`):i===0?(name.trim()||'You'):BOT_NAMES[i-1],color:i===0?color:PLAYER_COLORS.filter(c=>c!==color)[i-1],ball:makeBall(COURSES[0]),strokes:0,scores:Array(holes).fill(null),finished:false,departed:false,bot:mode==='solo'&&i>0}));
    setLocalGame({id:crypto.randomUUID(),players:entries,holes,holeIndex:0,turnId:entries[0].id,phase:'playing',difficulty});scene.current?.setTime(0);setView('play');setIntro(true);setCamera('follow');
  }
  function localShot(angle:number,strength:number) {
    const current=localRef.current;if(!current||current.phase!=='playing'||busyRef.current||viewRef.current!=='play')return;
    const idx=current.players.findIndex(p=>p.id===current.turnId);if(idx<0)return;
    const player=current.players[idx],before={...player.ball},h=COURSES[current.holeIndex];
    setPlaying(true);setPower(0);scene.current?.setCanShoot(false);audio.current?.putt(strength);
    const result=simulateShot(h,before,angle,strength,scene.current?.getTime()||0);
    const interim={...current,players:current.players.map((p,i)=>i===idx?{...p,strokes:p.strokes+1}:p)};setLocalGame(interim);
    const finish=()=>{
      if(localRef.current?.id!==current.id||viewRef.current!=='play'){setPlaying(false);return;}
      const strokes=Math.min(MAX_STROKES,player.strokes+1+(result.outcome==='water'?1:0)),finished=result.outcome==='cup'||strokes>=MAX_STROKES;
      const finalBall=result.outcome==='water'?{...before,vx:0,vy:0,vz:0,stopped:true,hazard:false}:result.ball;
      const nextPlayers=current.players.map((p,i)=>i===idx?{...p,ball:finalBall,strokes,finished,scores:p.scores.map((s,j)=>j===current.holeIndex&&finished?strokes:s)}:p);
      const allDone=nextPlayers.every(p=>p.finished);let nextIndex=idx;
      for(let n=1;n<=nextPlayers.length;n++){const candidate=(idx+n)%nextPlayers.length;if(!nextPlayers[candidate].finished){nextIndex=candidate;break;}}
      const nextPhase=allDone?(current.holeIndex+1>=current.holes?'complete':'holeComplete'):'playing';
      const next:LocalGame={...current,players:nextPlayers,turnId:allDone?null:nextPlayers[nextIndex].id,phase:nextPhase};
      setLocalGame(next);setPlaying(false);
      if(result.outcome==='cup'){audio.current?.cup();notify(`${player.name} · ${strokeName(strokes,h.par)}`);}else if(result.outcome==='water'){audio.current?.water();notify('Water hazard · +1 stroke. Back to your last lie.');}else if(finished)notify('10 strokes · moving on.');
      if(nextPhase==='complete'){try{const score=total(nextPlayers[0]),key=`little-links-best-${current.holes}`,old=localStorage.getItem(key);if(old===null||score<Number(old)){localStorage.setItem(key,String(score));setBest(score);}}catch{}}
    };
    if(scene.current)scene.current.playTrajectory(player.id,result.frames,finish);else finish();
  }
  // ?qa=1 lets the automated browser check find the ball and finish local rounds quickly. Never used online.
  qaRef.current=()=>{const g=localRef.current;if(!g||sessionRef.current||!canShootRef.current)return false;const p=g.players.find(x=>x.id===g.turnId);if(!p||p.bot)return false;const t=scene.current?.getTime()||0,scheduled=t+.65,plan=planShot(COURSES[g.holeIndex],p.ball,4,scheduled);setTimeout(()=>localShot(plan.angle,plan.power),Math.max(0,(scheduled+plan.wait-(scene.current?.getTime()||0))*1000));return true;};
  shotRef.current=(angle,strength)=>{
    if(!canShootRef.current)return;
    if(sessionRef.current){const s=sessionRef.current;setNetworkBusy(true);audio.current?.init();void golfRequest({action:'shot',code:s.code,angle,power:strength,shotId:crypto.randomUUID()},s.token).then(applyReply).catch(e=>notify(e.message)).finally(()=>setNetworkBusy(false));}
    else localShot(angle,strength);
  };
  useEffect(()=>{
    if(online||view!=='play'||!local||local.phase!=='playing'||busy||intro||modal)return;
    const p=local.players.find(p=>p.id===local.turnId);if(!p?.bot)return;
    let shotTimer:ReturnType<typeof setTimeout>|undefined,cancelled=false;
    const timer=setTimeout(()=>{if(cancelled)return;const scheduled=(scene.current?.getTime()||0)+.65;const plan=planShot(COURSES[local.holeIndex],p.ball,local.difficulty,scheduled);shotTimer=setTimeout(()=>{if(!cancelled)localShot(plan.angle,plan.power);},Math.max(0,(scheduled+plan.wait-(scene.current?.getTime()||0))*1000));},450);
    return()=>{cancelled=true;clearTimeout(timer);if(shotTimer)clearTimeout(shotTimer);};
  },[local,view,online,busy,intro,modal]);

  async function roomAction(action:'create'|'join'|'start'|'nextHole'|'rematch'|'skip'|'reconnect') {
    if(networkBusy)return;audio.current?.init();setNetworkBusy(true);setNotice('');
    try {
      if(action==='create')applyReply(await golfRequest({action,name:name.trim()||'Player',holes}));
      else if(action==='join')applyReply(await golfRequest({action,code:joinCode.trim().toUpperCase(),name:name.trim()||'Player'}));
      else if(action==='reconnect'&&reconnect){const reply=await getGolfRoom(reconnect.code,reconnect.token);sessionRef.current=reconnect;setSession(reconnect);applyReply(reply);}
      else if(session){applyReply(await golfRequest({action:action as 'start'|'nextHole'|'rematch'|'skip',code:session.code},session.token));}
    }catch(e){notify(e instanceof Error?e.message:'Something went wrong. Try again.');}finally{setNetworkBusy(false);}
  }
  function nextHole() {
    if(session){void roomAction('nextHole');return;}if(!local)return;
    const idx=local.holeIndex+1;setLocalGame({...local,holeIndex:idx,phase:'playing',turnId:local.players[idx%local.players.length].id,players:local.players.map(p=>({...p,ball:makeBall(COURSES[idx]),strokes:0,finished:false}))});setIntro(true);setNotice('');
  }
  function rematch() {if(session){void roomAction('rematch');return;}if(!local)return;setLocalGame({...local,id:crypto.randomUUID(),holeIndex:0,phase:'playing',turnId:local.players[0].id,players:local.players.map(p=>({...p,ball:makeBall(COURSES[0]),strokes:0,finished:false,scores:Array(local.holes).fill(null)}))});setIntro(true);setNotice('');}
  async function leaveGame() {
    if(busyRef.current)return;
    if(session){try{await golfRequest({action:'leave',code:session.code},session.token);}catch{}clearRoomSession();setSession(null);sessionRef.current=null;setRoom(null);setReconnect(null);lastOnlineShot.current='';}
    setModal(null);setView('home');setPlaying(false);setIntro(false);setNotice('');setSavedGame(localRef.current?.phase!=='complete'?localRef.current:null);worldKey.current='';
    if(typeof window!=='undefined'&&location.search)history.replaceState(null,'',location.pathname);
  }
  async function copyInvite() {if(!session)return;const url=`${location.origin}/?room=${session.code}`;try{await navigator.clipboard.writeText(url);setCopied(true);setTimeout(()=>setCopied(false),2500);}catch{notify(`Room code: ${session.code}`);}}
  function fullscreen() {if(document.fullscreenElement)void document.exitFullscreen();else void document.documentElement.requestFullscreen?.().catch(()=>notify('Full screen is unavailable in this browser.'));}
  useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.target instanceof HTMLInputElement||e.target instanceof HTMLSelectElement)return;if(e.key==='Escape'){scene.current?.cancelAim();setModal(m=>m?null:'settings');}if(e.key.toLowerCase()==='c')setCamera(v=>v==='follow'?'overview':'follow');if(e.key.toLowerCase()==='m')setMuted(v=>!v);};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[]);

  const isResult=view==='play'&&(phase==='holeComplete'||phase==='complete')&&!busy&&(!online||now+timeOffset.current>=(room?.readyAt||0));
  const rankings=players.filter(p=>!p.departed).sort((a,b)=>total(a)-total(b));
  const host=!online||session?.playerId===room?.hostId;
  const status=networkBusy?'Sending your shot…':busy?'Rolling…':intro?'Take a look around.':!connected&&online?'Reconnecting…':!myTurn?`${active?.name||'Your friend'} is lining up…`:'Drag back. Let it roll.';
  return <main className={`club ${view==='home'?'at-home':'in-game'} ${view==='lobby'?'in-lobby':''}`}>
    <div className="course-canvas" ref={mount} aria-label="Interactive 3D miniature golf course"/>
    <div className="scene-vignette"/>
    {!ready&&!webglError&&<div className="loading-screen"><FlagMark/><span>Loading…</span><i/></div>}
    {webglError&&<div className="webgl-error"><FlagMark/><h2>The green couldn’t load.</h2><p>{webglError}</p><button className="primary" onClick={()=>location.reload()}>Try again <RotateCcw size={17}/></button></div>}

    <header className="topbar">
      <button className={`brand ${view==='home'?'brand-home':''}`} onClick={()=>view==='home'?null:setModal('exit')} aria-label="Little Links home"><FlagMark/><span>Little Links</span></button>
      <div className="top-actions">
        {view==='home'&&<button className="text-button guide-button" onClick={()=>setModal('course')}>The course <ArrowUpRight size={15}/></button>}
        {view==='play'&&online&&<span className={`connection ${connected?'':'offline'}`}><i/>{connected?room?.code:'Reconnecting'}</span>}
        <button className="icon-button" onClick={()=>setModal('help')} aria-label="How to play" title="How to play"><HelpCircle size={20}/></button>
        <button className="icon-button" onClick={()=>{audio.current?.init();setMuted(v=>!v);}} aria-label={muted?'Unmute sound':'Mute sound'} title={muted?'Unmute (M)':'Mute (M)'}>{muted?<VolumeX size={20}/>:<Volume2 size={20}/>}</button>
        {canFullscreen&&<button className="icon-button fullscreen-button" onClick={fullscreen} aria-label="Full screen" title="Full screen"><Maximize2 size={18}/></button>}
      </div>
    </header>

    {view==='home'&&<>
      <section className="home-panel">
        <h1>Little Links</h1>
        <div className="setup-panel">
          <div className="mode-tabs" role="tablist" aria-label="Game mode">{([{key:'solo',label:'Solo',Icon:UserRound},{key:'local',label:'Local',Icon:UsersRound},{key:'online',label:'Online',Icon:Globe2}] as const).map(({key,label,Icon})=><button key={key} role="tab" aria-selected={mode===key} className={mode===key?'selected':''} onClick={()=>{setMode(key);audio.current?.click();}}><Icon size={17}/>{label}</button>)}</div>
          <div className="setup-row"><span>Holes</span><div className="segmented" aria-label="Number of holes"><button className={holes===9?'selected':''} onClick={()=>setHoles(9)}>9 holes</button><button className={holes===18?'selected':''} onClick={()=>setHoles(18)}>18 holes</button></div></div>
          {mode==='solo'&&<>
            <div className="setup-row"><label htmlFor="difficulty">Difficulty</label><select id="difficulty" value={difficulty} onChange={e=>setDifficulty(Number(e.target.value))}>{DIFFICULTIES.map((d,i)=><option value={i} key={d}>{d}</option>)}</select></div>
            <div className="setup-row"><span>AI friends</span><div className="stepper"><button disabled={botCount<=1} onClick={()=>setBotCount(v=>v-1)} aria-label="Fewer AI opponents"><Minus size={15}/></button><b>{botCount}</b><button disabled={botCount>=3} onClick={()=>setBotCount(v=>v+1)} aria-label="More AI opponents"><Plus size={15}/></button></div></div>
          </>}
          {mode==='local'&&<><div className="setup-row"><span>Players</span><div className="stepper"><button disabled={humanCount<=2} onClick={()=>setHumanCount(v=>v-1)} aria-label="Fewer players"><Minus size={15}/></button><b>{humanCount}</b><button disabled={humanCount>=4} onClick={()=>setHumanCount(v=>v+1)} aria-label="More players"><Plus size={15}/></button></div></div><div className="player-names">{localNames.slice(0,humanCount).map((n,i)=><label key={i}><BallDot color={i===0?color:PLAYER_COLORS.filter(c=>c!==color)[i-1]}/><input aria-label={`Player ${i+1} name`} value={n} maxLength={18} onChange={e=>setLocalNames(v=>v.map((s,j)=>j===i?e.target.value:s))}/></label>)}</div></>}
          {mode!=='local'&&<div className="setup-row name-row"><label htmlFor="your-name">Your name</label><input id="your-name" value={name} placeholder="Your name" maxLength={18} onChange={e=>setName(e.target.value)}/></div>}
          {mode!=='online'&&<div className="setup-row ball-row"><span>Ball</span><div className="ball-picker" role="radiogroup" aria-label="Ball color">{PLAYER_COLORS.slice(0,6).map(c=><button key={c} className={color===c?'selected':''} style={{'--ball-color':c} as React.CSSProperties} onClick={()=>setColor(c)} aria-label={`Choose ${c} ball`} role="radio" aria-checked={color===c}>{color===c&&<Check size={13}/>}</button>)}</div></div>}
          {mode==='online'&&<><div className="online-tabs"><button className={onlineTab==='create'?'selected':''} onClick={()=>setOnlineTab('create')}>Create a room</button><button className={onlineTab==='join'?'selected':''} onClick={()=>setOnlineTab('join')}>Join friends</button></div>{onlineTab==='join'&&<input className="room-code-input" aria-label="Room code" placeholder="ROOM CODE" maxLength={6} value={joinCode} onChange={e=>setJoinCode(e.target.value.replace(/[^a-z0-9]/gi,'').toUpperCase())}/>}</>}
          <button className="primary play-button" disabled={!ready||networkBusy||(mode==='online'&&onlineTab==='join'&&joinCode.length!==6)} onClick={()=>mode==='online'?void roomAction(onlineTab==='create'?'create':'join'):startLocal()}>{networkBusy?'Opening the clubhouse…':mode==='online'?(onlineTab==='create'?'Create a room':'Join the round'):"Let’s play"}<ArrowRight size={21}/></button>
          {(savedGame&&mode!=='online')&&<button className="resume-button" onClick={()=>startLocal(savedGame)}>Continue your round <span>Hole {savedGame.holeIndex+1}</span><ChevronRight size={14}/></button>}
          {(reconnect&&mode==='online')&&<button className="resume-button" onClick={()=>void roomAction('reconnect')}>Rejoin your room <span>{reconnect.code}</span><ChevronRight size={14}/></button>}
        </div>
      </section>
      {best!==null&&<div className="home-footer"><span/><span>{`YOUR BEST · ${best} STROKES`}</span></div>}
    </>}

    {view==='lobby'&&room&&<section className="lobby-panel">
      <div className="invite-box"><span>ROOM CODE</span><strong>{room.code}</strong><button className="outline-button" onClick={copyInvite}>{copied?<Check size={16}/>:<Copy size={16}/>} {copied?'Copied invite':'Copy invite link'}</button></div>
      <div className="lobby-list">{room.players.filter(p=>!p.departed).map(p=><div key={p.id}><BallDot color={p.color} size={18}/><strong>{p.name}</strong><span>{p.id===room.hostId?'HOST':p.id===session?.playerId?'YOU':'READY'}</span></div>)}</div>
      <div className="lobby-meta"><span>{room.holes} holes</span><span>{room.players.filter(p=>!p.departed).length} / 8 players</span></div>
      <button className="primary" disabled={!host||room.players.filter(p=>!p.departed).length<2||networkBusy} onClick={()=>void roomAction('start')}>{host?(room.players.filter(p=>!p.departed).length<2?'Waiting for a friend…':'Everyone in? Let’s play'):'Waiting for the host…'}<ArrowRight size={20}/></button>
      <button className="text-button leave-lobby" onClick={()=>setModal('exit')}>Leave room</button>
    </section>}

    {view==='play'&&game&&<>
      <section className="hole-info"><div className="hole-number">{String(holeIndex+1).padStart(2,'0')}<span>/ {String(game.holes).padStart(2,'0')}</span></div><div><h2>{COURSES[holeIndex].name}</h2><span className="par-label">PAR {COURSES[holeIndex].par}</span></div></section>
      {!isResult&&<div className="turn-banner">{active&&<BallDot color={active.color} size={13}/>}<strong>{active?.name||'Nice round'}</strong><span>{busy?'Ball rolling':`${active?.strokes||0} ${active?.strokes===1?'stroke':'strokes'}`}</span>{(active as Player)?.bot&&!busy&&<i className="thinking-dots">•••</i>}</div>}
      <aside className="game-tools"><button className={`icon-button ${camera==='overview'?'active':''}`} onClick={()=>setCamera(v=>v==='follow'?'overview':'follow')} title="Change camera (C)" aria-label={camera==='follow'?'Overhead camera':'Follow ball camera'}><Focus size={21}/></button><button className="icon-button" onClick={()=>setModal('score')} title="Scorecard" aria-label="Open scorecard"><TableProperties size={21}/></button><button className="icon-button" onClick={()=>setModal('settings')} title="Settings" aria-label="Open settings"><svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3" fill="var(--cream)"/><circle cx="16" cy="17" r="3" fill="var(--cream)"/></svg></button></aside>
      <div className="players-strip">{players.filter(p=>!p.departed).map(p=><div className={`player-chip ${p.id===active?.id?'current':''}`} key={p.id}><BallDot color={p.color}/><span>{p.name}{p.id===session?.playerId&&<small> you</small>}</span><b>{signed(relative(p))}</b>{p.finished&&<Check size={13}/>}</div>)}</div>
      {!isResult&&<div className={`shot-dock ${power>0?'charging':''}`}><div className="shot-hint">{power>0?<><span>POWER</span><strong>{Math.round(power*100)}<small>%</small></strong></>:<><span className="drag-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M17 7 7 17M7 9v8h8"/></svg></span><strong>{status}</strong></>}</div>{power>0&&<div className="power-track"><i style={{width:`${power*100}%`}}/></div>}</div>}
      {online&&host&&phase==='playing'&&now+timeOffset.current>(room?.turnStartedAt||0)+60000&&<button className="skip-button" onClick={()=>void roomAction('skip')}>Skip idle player</button>}
      {intro&&!isResult&&<div className="hole-intro" key={holeIndex}><span>HOLE {String(holeIndex+1).padStart(2,'0')} · PAR {COURSES[holeIndex].par}</span><h2>{COURSES[holeIndex].name}</h2></div>}
      {isResult&&<div className="result-wrap"><section className="result-panel"><div className="result-icon">{phase==='complete'?<Trophy size={30}/>:<FlagMark/>}</div>{phase!=='complete'&&<div className="eyebrow">{`HOLE ${holeIndex+1} COMPLETE`}</div>}<h2>{phase==='complete'?`${rankings[0]?.name} ${rankings.filter(p=>total(p)===total(rankings[0])).length>1?(rankings[0]?.name==='You'?'share the win.':'shares the win.'):(rankings[0]?.name==='You'?'take the win.':'takes the win.')}`:'Nicely played.'}</h2>{phase!=='complete'&&<p>{COURSES[Math.min(holeIndex+1,17)].name+' is up next.'}</p>}<div className="result-scores">{(phase==='complete'?rankings:players).filter(p=>!p.departed).map((p,i)=><div key={p.id}>{phase==='complete'&&<span className="rank">{i+1}</span>}<BallDot color={p.color} size={16}/><strong>{p.name}</strong><span>{(n=>`${n} ${n===1?'stroke':'strokes'}`)(phase==='complete'?total(p):p.scores[holeIndex])}</span><b>{phase==='complete'?signed(relative(p)):signed((p.scores[holeIndex]||0)-COURSES[holeIndex].par)}</b></div>)}</div><button className="primary" disabled={!host||networkBusy} onClick={()=>phase==='complete'?rematch():nextHole()}>{!host?'Waiting for the host…':phase==='complete'?'One more round':'Next hole'}{phase==='complete'?<RotateCcw size={18}/>:<ArrowRight size={19}/>}</button><div className="result-actions"><button onClick={()=>setModal('score')}>Scorecard</button><button onClick={()=>setModal('exit')}>Back to the club</button></div></section></div>}
    </>}

    {notice&&<div className="toast" role="status">{notice}</div>}
    {modal&&<div className="modal-scrim" onClick={()=>setModal(null)}><section className={`modal ${modal==='score'?'score-modal':''} ${modal==='course'?'course-modal':''}`} role="dialog" aria-modal="true" aria-labelledby="modal-title" onClick={e=>e.stopPropagation()}><button className="close-button icon-button" onClick={()=>setModal(null)} aria-label="Close dialog"><X size={20}/></button>
      {modal==='help'&&<><h2 id="modal-title">How to play</h2><div className="how-to-illustration"><span className="help-ball"/><span className="help-dots"/><span className="help-arrow">↙</span><span className="help-cup"/></div><div className="instructions"><div><b>01</b><p><strong>Grab your ball.</strong> Click or touch close to it.</p></div><div><b>02</b><p><strong>Pull back to aim.</strong> A longer drag means more power. Follow the dotted line.</p></div><div><b>03</b><p><strong>Let it roll.</strong> Release to putt. Fewer strokes wins.</p></div></div><div className="help-details"><p>Right-drag or use two fingers to orbit. Scroll or pinch to zoom. Tap the view button for overhead.</p><p>Water adds one penalty stroke and returns the ball to its last spot. Maximum {MAX_STROKES} strokes per hole. Balls pass through each other.</p></div><button className="primary" onClick={()=>setModal(null)}>Got it <ArrowRight size={18}/></button></>}
      {modal==='settings'&&<><h2 id="modal-title">Settings</h2><div className="setting-line"><span><Volume2 size={19}/> Sound</span><button role="switch" aria-checked={!muted} className={`toggle ${!muted?'on':''}`} onClick={()=>{audio.current?.init();setMuted(v=>!v);}} aria-label="Sound"><i/></button></div><div className="setting-line"><span><Music2 size={19}/> Clubhouse music</span><button role="switch" aria-checked={music} className={`toggle ${music?'on':''}`} onClick={()=>{audio.current?.init();setMusic(v=>!v);}} aria-label="Music"><i/></button></div><div className="setting-line"><span><Focus size={19}/> Camera</span><button className="text-button" onClick={()=>setCamera(v=>v==='follow'?'overview':'follow')}>{camera==='follow'?'Follow ball':'Overhead'} <ChevronRight size={16}/></button></div><div className="shortcut-row"><span><kbd>C</kbd> Camera</span><span><kbd>M</kbd> Sound</span><span><kbd>Esc</kbd> Menu</span></div><button className="primary" onClick={()=>setModal(null)}>Back to the green <ArrowRight size={18}/></button>{view!=='home'&&<button className="text-button settings-exit" onClick={()=>setModal('exit')}><Home size={16}/> Leave the round</button>}</>}
      {modal==='exit'&&<><h2 id="modal-title">Back to the club?</h2><p>{online?'You’ll leave this room. The other players can keep going.':'Your progress stays here. Come back whenever you like.'}</p><button className="primary" disabled={busy} onClick={()=>void leaveGame()}>{busy?"Waiting for the ball…":"Back to the club"} <ArrowRight size={18}/></button><button className="outline-button wide" onClick={()=>setModal(null)}>Keep playing</button></>}
      {modal==='score'&&<><h2 id="modal-title">The scorecard.</h2><div className="score-table-wrap"><table><thead><tr><th>Player</th>{Array.from({length:game?.holes||9},(_,i)=><th key={i} className={i===holeIndex?'current-hole':''}>{i+1}</th>)}<th>Total</th><th>±</th></tr></thead><tbody><tr className="par-row"><th>Par</th>{COURSES.slice(0,game?.holes||9).map(h=><td key={h.id}>{h.par}</td>)}<td>{COURSES.slice(0,game?.holes||9).reduce((a,h)=>a+h.par,0)}</td><td/></tr>{players.map(p=><tr key={p.id}><th><BallDot color={p.color}/>{p.name}</th>{p.scores.map((s,i)=><td key={i} className={s!==null&&s<COURSES[i].par?'under-par':''}>{s??(i===holeIndex&&p.strokes>0?`${p.strokes}*`:'—')}</td>)}<td><b>{total(p)}</b></td><td><b>{signed(relative(p))}</b></td></tr>)}</tbody></table></div><p className="score-note">Lower is better. <span>* Hole in progress</span></p><button className="primary" onClick={()=>setModal(null)}>Back to the green <ArrowRight size={18}/></button></>}
      {modal==='course'&&<><h2 id="modal-title">The course</h2><div className="course-grid">{COURSES.map((h,i)=><div className="course-tile" key={h.id}><HoleMap index={i}/><div><span>{String(h.id).padStart(2,'0')} / PAR {h.par}</span><strong>{h.name}</strong></div></div>)}</div></>}
    </section></div>}
  </main>;
}
