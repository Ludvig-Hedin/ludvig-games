"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Anchor, ArrowLeft, ArrowRight, AudioLines, Check, ChevronRight, CircleHelp, Copy, Crosshair, Flag, Globe2, Loader2, LockKeyhole, Radio, RotateCw, Settings2, Shield, Shuffle, Trash2, Users, Volume2, VolumeX, Waves, WifiOff, X } from "lucide-react";
import Ocean from "./Ocean";
import TacticalBoard, { MiniFleet, ShipSilhouette, type BoardEvent } from "./TacticalBoard";
import { NavalAudio } from "../lib/audio";
import { SHIPS, newGame, cellsFor, isValidPlacement, randomFleet, placeFleet, fireShot, chooseAIShot, type Fleet, type GameState, type Player, type Cell, type ShipId, type Shot, type Difficulty } from "../lib/game";
import type { OnlineState } from "../lib/rooms";

type Mode="ai"|"local"|"online";
type Screen="home"|"setup"|"battle"|"privacy"|"result";
type Modal="ai"|"friend"|"local"|"settings"|"help"|"quit"|null;
type Session={code:string;token:string;player:Player};
type RoomResponse=OnlineState & {error?:string;token:string;state:OnlineState};
const LEVELS:Difficulty[]=["Beginner","Easy","Medium","Hard","Expert"];
const opposite=(p:Player):Player=>p===0?1:0;
const coord=(c:Cell)=>`${String.fromCharCode(65+c.x)}${c.y+1}`;
const readStore=(key:string,fallback:string)=>{try{return localStorage.getItem(key)??fallback;}catch{return fallback;}};
const writeStore=(key:string,value:string)=>{try{localStorage.setItem(key,value);}catch{}};
const removeStore=(key:string)=>{try{localStorage.removeItem(key);}catch{}};
const emptyFleet: Fleet=[];
// Busy path: daily limit (1027), 429, 503 or no network. Same copy the room service sends.
const BUSY="The room service is temporarily unavailable. Please try again.";
// Error pages from the platform are HTML, not JSON; treat them as an empty body.
const readJson=async(response:Response):Promise<Partial<RoomResponse>>=>{try{return await response.json();}catch{return {};}};
const busyStatus=(status:number)=>status===429||status>=500;

export default function SalvoApp(){
  const [screen,setScreen]=useState<Screen>("home");
  const [mode,setMode]=useState<Mode>("ai");
  const [modal,setModal]=useState<Modal>(null);
  const [difficulty,setDifficulty]=useState<Difficulty>("Medium");
  const [game,setGame]=useState<GameState>(newGame);
  const gameRef=useRef(game);
  const [draft,setDraft]=useState<Fleet>([]);
  const [selected,setSelected]=useState<ShipId>("carrier");
  const [horizontal,setHorizontal]=useState(true);
  const [viewer,setViewer]=useState<Player>(0);
  const [view,setView]=useState<"enemy"|"own">("enemy");
  const [privacy,setPrivacy]=useState<{player:Player;next:"setup"|"battle"}>({player:1,next:"setup"});
  const [names,setNames]=useState<[string,string]>(["Commander 1","Commander 2"]);
  const [name,setName]=useState("");
  const [roomCode,setRoomCode]=useState("");
  const [session,setSession]=useState<Session|null>(null);
  const sessionRef=useRef<Session|null>(null);
  const [online,setOnline]=useState<OnlineState|null>(null);
  const onlineRef=useRef<OnlineState|null>(null);
  const [connection,setConnection]=useState<"connected"|"reconnecting">("connected");
  const [busy,setBusy]=useState(false);
  const fireLock=useRef(false);
  const [target,setTarget]=useState<Cell|null>(null);
  const [boardEvent,setBoardEvent]=useState<(BoardEvent&{board:"enemy"|"own"})|undefined>();
  const [notice,setNotice]=useState("");
  const [volume,setVolume]=useState(.38);
  const [muted,setMuted]=useState(false);
  const [quality,setQuality]=useState<"high"|"low">("high");
  const [resume,setResume]=useState<{game:GameState;difficulty:Difficulty}|null>(null);
  const [stats,setStats]=useState({played:0,won:0});
  const [lastShot,setLastShot]=useState<{player:Player;shot:Shot}|null>(null);
  const [resultViewed,setResultViewed]=useState(false);
  const resultRecorded=useRef(false);
  const audio=useRef<NavalAudio|null>(null);
  const timers=useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const generation=useRef(0);
  const noticeTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const mainRef=useRef<HTMLDivElement>(null);
  const modalRef=useRef<HTMLDivElement>(null);
  const resultRef=useRef<HTMLElement>(null);
  const onlineOperation=useRef(0);
  const repoll=useRef<()=>void>(()=>{});
  const previousFocus=useRef<HTMLElement|null>(null);
  const updateGame=(g:GameState)=>{gameRef.current=g;setGame(g);};
  const later=(fn:()=>void,ms:number)=>{const gen=generation.current;const timer=setTimeout(()=>{timers.current.delete(timer);if(gen===generation.current)fn();},ms);timers.current.add(timer);return timer;};
  const clearTimers=()=>{generation.current++;timers.current.forEach(clearTimeout);timers.current.clear();fireLock.current=false;setBusy(false);};
  const sound=(kind:Parameters<NavalAudio["play"]>[0])=>{audio.current?.start();audio.current?.play(kind);};
  const notify=useCallback((message:string)=>{setNotice(message);if(noticeTimer.current)clearTimeout(noticeTimer.current);noticeTimer.current=setTimeout(()=>setNotice(""),4200);},[]);

  useEffect(()=>{
    audio.current=new NavalAudio();
    const v=Number(readStore("naval.volume","0.38"));setVolume(Number.isFinite(v)?v:.38);
    setMuted(readStore("naval.muted","false")==="true");
    setQuality(readStore("naval.quality","high")==="low"?"low":"high");
    setName(readStore("naval.name",""));
    try{const saved=JSON.parse(readStore("naval.patrol","null"));if(saved?.game?.phase==="battle"&&LEVELS.includes(saved.difficulty))setResume(saved);}catch{}
    try{const stored=JSON.parse(readStore("naval.stats",'{"played":0,"won":0}'));if(typeof stored.played==="number"&&typeof stored.won==="number")setStats(stored);}catch{}
    const code=new URLSearchParams(window.location.search).get("room");
    if(code){setRoomCode(code.toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,6));setModal("friend");
      try{const s=JSON.parse(sessionStorage.getItem(`naval.session.${code.toUpperCase()}`)??"null");if(s?.token){setSession(s);sessionRef.current=s;setMode("online");setScreen("setup");setModal(null);}}
      catch{}
    }
    return()=>{timers.current.forEach(clearTimeout);if(noticeTimer.current)clearTimeout(noticeTimer.current);audio.current?.dispose();};
  },[]);
  useEffect(()=>{audio.current?.setVolume(volume);audio.current?.setMuted(muted);writeStore("naval.volume",String(volume));writeStore("naval.muted",String(muted));},[volume,muted]);
  useEffect(()=>{writeStore("naval.quality",quality);},[quality]);
  useEffect(()=>{if(mode==="ai"&&game.phase==="battle"){const saved={game,difficulty};writeStore("naval.patrol",JSON.stringify(saved));setResume(saved);}if(mode==="ai"&&game.phase==="finished"){removeStore("naval.patrol");setResume(null);}},[mode,game,difficulty]);
  useEffect(()=>{
    if(!modal)return;
    previousFocus.current=document.activeElement as HTMLElement;
    const timer=setTimeout(()=>modalRef.current?.querySelector<HTMLElement>("input,button,select")?.focus(),40);
    return()=>{clearTimeout(timer);previousFocus.current?.focus();};
  },[modal]);

  useEffect(()=>{
    if(screen!=="result"||resultViewed)return;
    const timer=setTimeout(()=>resultRef.current?.querySelector<HTMLButtonElement>("button:not([disabled])")?.focus(),50);
    return()=>clearTimeout(timer);
  },[screen,resultViewed]);

  const ownPlayer:Player=mode==="online"?(online?.player??session?.player??0):mode==="ai"?0:viewer;
  const theirPlayer=opposite(ownPlayer);
  const ownFleet=mode==="online"?(online?.ownFleet??emptyFleet):(game.fleets[ownPlayer]??emptyFleet);
  const ownShots=mode==="online"?(online?.ownShots??[]):game.shots[ownPlayer];
  const enemyShots=mode==="online"?(online?.enemyShots??[]):game.shots[theirPlayer];
  const enemySunk=mode==="online"?(online?.opponentSunk??[]):(game.fleets[theirPlayer]??[]).filter(s=>ownShots.some(shot=>shot.sunk?.id===s.id));
  const turn=mode==="online"?(online?.turn??0):game.turn;
  const winner=mode==="online"?(online?.winner??null):game.winner;
  const finished=mode==="online"?online?.phase==="finished":game.phase==="finished";
  const isTurn=turn===ownPlayer&&!finished;
  const locked=mode==="online"&&!!online?.ownFleet;
  const opponentName=mode==="ai"?`${difficulty} AI`:mode==="online"?(online?.players[theirPlayer]?.name??"Opponent"):names[theirPlayer];
  const playerName=mode==="online"?(online?.players[ownPlayer]?.name??"You"):mode==="local"?names[ownPlayer]:"You";
  const readyCount=draft.length;
  const hits=ownShots.filter(s=>s.result!=="miss").length;
  const enemySunkCount=ownShots.filter(s=>s.result==="sunk").length;
  const ownSunkCount=enemyShots.filter(s=>s.result==="sunk").length;

  function showShot(shot:Shot,player:Player,myPlayer:Player){
    setLastShot({player,shot});setBoardEvent({...shot,id:Date.now(),board:player===myPlayer?"enemy":"own"});
    sound(shot.result);setTarget(null);
    if(navigator.vibrate&&shot.result!=="miss")navigator.vibrate(shot.result==="sunk"?[25,35,50]:20);
  }
  function conclude(winningPlayer:Player,myPlayer:Player){
    sound(winningPlayer===myPlayer?"victory":"defeat");setScreen("result");setResultViewed(false);
    if(mode==="ai"&&!resultRecorded.current){resultRecorded.current=true;setStats(s=>{const next={played:s.played+1,won:s.won+(winningPlayer===0?1:0)};writeStore("naval.stats",JSON.stringify(next));return next;});}
  }
  const applyOnline=useCallback((next:OnlineState)=>{
    const prev=onlineRef.current;
    if(prev&&prev.code===next.code&&next.version<prev.version)return;
    const changed=!prev||prev.code!==next.code||next.version>prev.version;
    onlineRef.current=next;setOnline(next);setConnection("connected");
    if(!changed)return;
    setViewer(next.player);
    if(next.phase==="waiting"||next.phase==="placement"){
      if(prev?.phase==="finished"){setDraft([]);setSelected("carrier");setHorizontal(true);setLastShot(null);setBoardEvent(undefined);setResultViewed(false);}
      if(next.ownFleet)setDraft(next.ownFleet);
      setScreen("setup");
    } else {
      if(next.phase==="battle")setScreen("battle");
      const newShot=next.lastAction&&(!prev||JSON.stringify(next.lastAction)!==JSON.stringify(prev.lastAction));
      if(newShot&&next.lastAction){
        const action=next.lastAction;showShot(action.shot,action.player,next.player);
        if(action.player!==next.player){setView("own");later(()=>{if(onlineRef.current?.phase==="battle")setView("enemy");},1200);}
      }else if(!prev||prev.phase!=="battle")setView("enemy");
      if(next.phase==="finished"&&prev?.phase!=="finished")later(()=>conclude(next.winner??0,next.player),newShot?1300:80);
    }
  // Online actions use refs so polling never closes over an old game.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[mode]);

  useEffect(()=>{
    if(mode!=="online"||!session||screen==="home")return;
    let stopped=false,timer:ReturnType<typeof setTimeout>|undefined,inFlight=false,failures=0;
    const controller=new AbortController();
    // Free-plan budget: poll at most every 1.5 s, slower while it is our own
    // turn or the battle is over, never while the tab is hidden, and stop for
    // good once the opponent has left a finished room.
    // Back off while the service is busy or unreachable: 3 s, 6 s, up to 15 s.
    const delay=()=>{if(failures)return Math.min(15000,1500*2**failures);const s=onlineRef.current;if(!s)return 1500;if(s.phase==="finished")return 4000;if(s.phase==="battle"&&s.turn===s.player)return 5000;return 1500;};
    const schedule=()=>{clearTimeout(timer);timer=undefined;if(stopped||document.visibilityState!=="visible")return;const s=onlineRef.current;if(s?.phase==="finished"&&s.opponentLeft)return;timer=setTimeout(poll,delay());};
    const onVisible=()=>{if(document.visibilityState==="visible"&&!inFlight){clearTimeout(timer);void poll();}else if(document.visibilityState!=="visible")clearTimeout(timer);};
    document.addEventListener("visibilitychange",onVisible);
    repoll.current=()=>{if(!inFlight)schedule();};
    async function poll(){
      if(inFlight)return;inFlight=true;
      try{
        const response=await fetch(`/api/rooms/${session!.code}`,{headers:{Authorization:`Bearer ${session!.token}`},cache:"no-store",signal:AbortSignal.any([controller.signal,AbortSignal.timeout(8000)])});
        const data=await readJson(response) as RoomResponse;
        if(stopped||sessionRef.current?.token!==session!.token)return;
        if(!response.ok){if(response.status===404||response.status===401){notify(data.error??"This room is no longer available.");setScreen("home");setSession(null);sessionRef.current=null;return;}throw new Error(data.error);}
        failures=0;applyOnline(data);
      }catch{failures=Math.min(failures+1,4);if(!stopped&&sessionRef.current?.token===session!.token)setConnection("reconnecting");}
      inFlight=false;schedule();
    }
    void poll();
    return()=>{stopped=true;clearTimeout(timer);controller.abort();document.removeEventListener("visibilitychange",onVisible);};
  },[mode,session,screen==="home",applyOnline,notify]);

  useEffect(()=>{
    if(mode!=="ai"||screen!=="battle"||game.phase!=="battle"||game.turn!==1)return;
    const timer=later(()=>{
      if(gameRef.current.turn!==1||gameRef.current.phase!=="battle")return;
      setBusy(true);setView("own");sound("launch");
      later(()=>{
        const cell=chooseAIShot(gameRef.current.shots[1],difficulty);
        const result=fireShot(gameRef.current,1,cell.x,cell.y);
        updateGame(result.game);showShot(result.shot,1,0);
        later(()=>{setBusy(false);fireLock.current=false;if(result.game.phase==="finished")conclude(1,0);else setView("enemy");},1100);
      },420);
    },1250);
    return()=>{clearTimeout(timer);timers.current.delete(timer);};
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[mode,screen,game.turn,game.phase,difficulty]);

  function resetBattle(){clearTimers();setConnection("connected");setDraft([]);setSelected("carrier");setHorizontal(true);setTarget(null);setLastShot(null);setBoardEvent(undefined);setResultViewed(false);resultRecorded.current=false;setView("enemy");setViewer(0);setNotice("");}
  function begin(selectedMode:Mode){onlineOperation.current++;resetBattle();setMode(selectedMode);updateGame(newGame());setScreen("setup");setModal(null);setOnline(null);onlineRef.current=null;setSession(null);sessionRef.current=null;window.history.replaceState(null,"",window.location.pathname);sound("select");}
  function resumeAI(){if(!resume)return;onlineOperation.current++;sessionRef.current=null;setSession(null);onlineRef.current=null;setOnline(null);resetBattle();setMode("ai");setDifficulty(resume.difficulty);updateGame(resume.game);setScreen("battle");setModal(null);sound("select");}
  function selectShip(id:ShipId){if(locked||busy)return;setSelected(id);const ship=draft.find(s=>s.id===id);if(ship)setHorizontal(ship.horizontal);sound("select");}
  function positionShip(id:ShipId,cell:Cell,direction:boolean){
    if(locked||busy)return;
    const ship={id,x:cell.x,y:cell.y,horizontal:direction};
    if(!isValidPlacement(draft,ship)){notify("Keep ships inside the grid, without overlapping.");return;}
    const next=[...draft.filter(s=>s.id!==id),ship];setDraft(next);sound("place");
    const nextShip=SHIPS.find(s=>!next.some(p=>p.id===s.id));if(nextShip){setSelected(nextShip.id);setHorizontal(true);}else{setSelected(id);setHorizontal(direction);}
  }
  function rotate(){
    if(locked||busy||screen!=="setup")return;
    const ship=draft.find(s=>s.id===selected),direction=!horizontal;
    if(ship){const length=SHIPS.find(s=>s.id===selected)!.length;const moved={...ship,horizontal:direction,x:Math.min(ship.x,direction?10-length:9),y:Math.min(ship.y,direction?9:10-length)};
      if(!isValidPlacement(draft,moved)){notify("Move this ship to make room to rotate.");return;}setDraft(draft.map(s=>s.id===selected?moved:s));}
    setHorizontal(direction);sound("rotate");
  }
  useEffect(()=>{
    function key(e:KeyboardEvent){
      const target=e.target as HTMLElement;if(target.matches("input,textarea,select"))return;
      if(e.key.toLowerCase()==="r"&&screen==="setup"&&!modal){e.preventDefault();rotate();}
      if(e.key==="Escape"){if(modal&&!busy)setModal(null);else if(target)setTarget(null);}
      if(e.key.toLowerCase()==="m"){setMuted(m=>!m);audio.current?.start();}
    }
    window.addEventListener("keydown",key);return()=>window.removeEventListener("keydown",key);
  });

  async function roomAction(body:Record<string,unknown>){
    const s=sessionRef.current;if(!s)throw new Error("No room session.");
    const payload={...body,requestId:crypto.randomUUID(),expectedVersion:onlineRef.current?.version};
    let failure:Error=new Error("Connection interrupted. Reconnecting…");
    for(let attempt=0;attempt<3;attempt++){
      try{
        const response=await fetch(`/api/rooms/${s.code}/action`,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${s.token}`},body:JSON.stringify(payload),signal:AbortSignal.timeout(12000)});
        const data=await readJson(response) as RoomResponse;
        if(!response.ok){if(response.status===409&&data.code==="stale_version"&&attempt<2){
            const refresh=await fetch(`/api/rooms/${s.code}`,{headers:{Authorization:`Bearer ${s.token}`},cache:"no-store",signal:AbortSignal.timeout(8000)});
            if(!refresh.ok)throw new Error("The room changed. Please try again.");
            const latest=await refresh.json() as OnlineState;
            if(sessionRef.current?.token!==s.token)throw new Error("Room closed.");
            applyOnline(latest);payload.expectedVersion=latest.version;
            if(body.type==="shot"&&(latest.phase!=="battle"||latest.turn!==s.player||latest.ownShots.some(shot=>shot.x===body.x&&shot.y===body.y))){const error=new Error("Your board has refreshed. Select a new target.");Object.assign(error,{final:true});throw error;}
            continue;
          }
          if(!busyStatus(response.status)||(response.status===429&&data.error)){const error=new Error(data.error??"Move rejected.");Object.assign(error,{final:true});throw error;}throw new Error(data.error??BUSY);}
        if(sessionRef.current?.token===s.token){applyOnline(data);repoll.current();}return data as OnlineState;
      }catch(error){if((error as {final?:boolean}).final)throw error;if(!(error instanceof TypeError)&&!(error instanceof DOMException))failure=error as Error;if(attempt<2)await new Promise(resolve=>setTimeout(resolve,600*(attempt+1)));}
    }
    if(sessionRef.current?.token===s.token)setConnection("reconnecting");throw failure;
  }
  async function ready(){
    if(draft.length!==5||busy||locked)return;
    sound("select");setTarget(null);
    if(mode==="online"){
      setBusy(true);try{await roomAction({type:"place",fleet:draft});}catch(e){notify((e as Error).message);}finally{setBusy(false);}return;
    }
    try{
      let g=placeFleet(gameRef.current,viewer,draft);
      if(mode==="ai"){g=placeFleet(g,1,randomFleet());updateGame(g);setScreen("battle");setView("enemy");sound("radar");}
      else{updateGame(g);setDraft([]);if(viewer===0){setPrivacy({player:1,next:"setup"});setScreen("privacy");}else{setPrivacy({player:0,next:"battle"});setScreen("privacy");}}
    }catch(e){notify((e as Error).message);}
  }
  function handoff(){setViewer(privacy.player);setView("enemy");setTarget(null);setBoardEvent(undefined);setSelected("carrier");setHorizontal(true);setScreen(privacy.next);sound("select");}
  async function fire(cell:Cell){
    if(fireLock.current||busy||screen!=="battle"||!isTurn||view!=="enemy"||ownShots.some(s=>s.x===cell.x&&s.y===cell.y))return;
    fireLock.current=true;setBusy(true);setTarget(null);sound("launch");
    if(mode==="online"){
      try{await roomAction({type:"shot",x:cell.x,y:cell.y});}catch(e){notify((e as Error).message);}finally{later(()=>{setBusy(false);fireLock.current=false;},650);}return;
    }
    try{
      const result=fireShot(gameRef.current,ownPlayer,cell.x,cell.y);
      later(()=>{
        updateGame(result.game);showShot(result.shot,ownPlayer,ownPlayer);
        later(()=>{
          setBusy(false);fireLock.current=false;
          if(result.game.phase==="finished")conclude(ownPlayer,ownPlayer);
          else if(mode==="local"){setPrivacy({player:opposite(ownPlayer),next:"battle"});setScreen("privacy");}
        },1100);
      },350);
    }catch(e){setBusy(false);fireLock.current=false;notify((e as Error).message);}
  }
  async function enterOnline(join:boolean){
    if(busy)return;setBusy(true);sound("select");
    const operation=++onlineOperation.current;
    const requestCode=join?roomCode.toUpperCase():"";
    const pendingKey=`naval.pending.${join?requestCode:"create"}`;
    let resumeToken="";
    try{resumeToken=sessionStorage.getItem(pendingKey)??"";}catch{}
    if(!/^[a-f0-9]{64}$/.test(resumeToken)){resumeToken=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,"0")).join("");try{sessionStorage.setItem(pendingKey,resumeToken);}catch{}}

    try{
      writeStore("naval.name",name.trim());
      const response=await fetch(join?`/api/rooms/${roomCode.toUpperCase()}/join`:"/api/rooms",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:name.trim(),resumeToken}),signal:AbortSignal.timeout(15000)});
      const data=await readJson(response) as RoomResponse;if(operation!==onlineOperation.current)return;if(!response.ok)throw new Error(data.error??(busyStatus(response.status)?BUSY:"Could not open the room."));
      const s={code:data.code,token:data.token,player:data.player};
      resetBattle();setMode("online");setSession(s);sessionRef.current=s;onlineRef.current=null;setOnline(null);setModal(null);setScreen("setup");applyOnline(data.state);
      try{sessionStorage.setItem(`naval.session.${s.code}`,JSON.stringify(s));sessionStorage.removeItem(pendingKey);}catch{}
      window.history.replaceState(null,"",`?room=${s.code}`);
    }catch(e){if(operation===onlineOperation.current)notify(e instanceof TypeError||e instanceof DOMException?BUSY:(e as Error).message);}finally{if(operation===onlineOperation.current)setBusy(false);}
  }
  async function copyInvite(){
    if(!session)return;
    const url=`${window.location.origin}${window.location.pathname}?room=${session.code}`;
    try{await navigator.clipboard.writeText(url);notify("Invite link copied.");}catch{const input=document.createElement("textarea");input.value=url;document.body.appendChild(input);input.select();document.execCommand("copy");input.remove();notify("Invite link copied.");}sound("select");
  }
  async function quit(){
    onlineOperation.current++;
    if(mode==="online"&&session){try{await roomAction({type:"leave"});}catch{}try{sessionStorage.removeItem(`naval.session.${session.code}`);}catch{}}
    clearTimers();setScreen("home");setModal(null);setSession(null);sessionRef.current=null;setOnline(null);onlineRef.current=null;setDraft([]);setBoardEvent(undefined);window.history.replaceState(null,"",window.location.pathname);sound("select");
  }
  async function rematch(){
    if(mode==="online"){setBusy(true);try{await roomAction({type:"rematch"});}catch(e){notify((e as Error).message);}finally{setBusy(false);}}
    else begin(mode);
  }
  function trapFocus(e:React.KeyboardEvent,container:HTMLElement|null=modalRef.current){
    if(e.key!=="Tab")return;
    const focusables=container?.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),[tabindex="0"]');
    if(!focusables?.length)return;const first=focusables[0],last=focusables[focusables.length-1];
    if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
  }
  const topMode=mode==="ai"?`SOLO / ${difficulty.toUpperCase()}`:mode==="local"?"LOCAL / PASS & PLAY":`ONLINE / ${session?.code??"CONNECTING"}`;
  const canFire=screen==="battle"&&view==="enemy"&&isTurn&&!busy&&(mode!=="online"||connection==="connected");
  const statusText=connection==="reconnecting"&&mode==="online"?"Reconnecting…":finished?"Battle complete":isTurn?"Your turn":`${opponentName}'s turn`;
  const last=mode==="online"?online?.lastAction:lastShot;
  const resultWin=winner===ownPlayer;
  const isPlaying=screen==="setup"||screen==="battle"||screen==="result";
  return <div className={`app screen-${screen}`} ref={mainRef} onPointerDown={()=>audio.current?.start()}>
    {(screen==="home")&&<Ocean className="hero-ocean" quality={quality}/>}
    <div className="ambient-light" aria-hidden="true"/>
    <header className="topbar">
      <button className="brand" onClick={()=>screen==="home"?sound("select"):setModal("quit")} aria-label="Salvo home"><span className="brand-mark"><Anchor size={23} strokeWidth={1.5}/></span><span>Salvo</span></button>
      {screen!=="home"&&<span className="top-mode">{topMode}</span>}
      <div className="header-actions"><button className="icon-button help-button" aria-label="How to play" onClick={()=>setModal("help")}><CircleHelp size={19}/></button><button className={`icon-button ${muted?"is-muted":""}`} aria-label={muted?"Unmute audio":"Mute audio"} onClick={()=>{audio.current?.start();setMuted(!muted);}}>{muted?<VolumeX size={19}/>:<Volume2 size={19}/>}</button><button className="icon-button" aria-label="Settings" onClick={()=>setModal("settings")}><Settings2 size={19}/></button></div>
    </header>

    {screen==="home"&&<main className="home-main">
      <div className="home-copy"><h1>Salvo</h1>
        <div className="home-actions"><button className="button primary home-primary" onClick={()=>{setModal("ai");sound("select");}}><Crosshair size={19}/><span>Play AI</span><ArrowRight size={20}/></button><div className="home-secondary"><button className="button glass" onClick={()=>{setModal("friend");sound("select");}}><Globe2 size={17}/>Play Friend</button><button className="button glass" onClick={()=>{setModal("local");sound("select");}}><Users size={18}/>Local Multiplayer</button></div></div>
        {resume&&<button className="resume-link" onClick={resumeAI}><RotateCw size={14}/>Resume your {resume.difficulty.toLowerCase()} battle<ArrowRight size={14}/></button>}
              </div>
      {stats.played>0&&<div className="home-bottom"><span className="home-record">{`${stats.won} VICTORIES / ${stats.played} BATTLES`}</span></div>}
    </main>}

    {screen==="privacy"&&<main className="privacy-screen"><div className="privacy-rings"><LockKeyhole size={32} strokeWidth={1.3}/></div><h1>Over to you,<br/><span>{names[privacy.player]}.</span></h1><p>Pass the device. Your fleet stays hidden.</p><button className="button primary" onClick={handoff}>I’m ready<ArrowRight size={18}/></button></main>}

    {isPlaying&&<main className={`game-main ${screen==="result"?"behind-result":""}`}>
      <div className="game-heading"><div>{screen==="setup"&&<h1>{locked?"Fleet standing by.":"Position your fleet."}</h1>}</div>
        <div className={`turn-status ${isTurn&&screen!=="setup"?"active":""}`} role="status">{screen==="setup"?<><Shield size={16}/>{mode==="local"?names[viewer]:locked?"Ready for battle":`${readyCount} of 5 deployed`}</>:<>{mode==="online"&&connection==="reconnecting"?<WifiOff size={16}/>:<span className="live-dot"/>}{statusText}</>}</div>
      </div>
      <div className="game-layout">
        <section className="board-column" aria-label="Naval grid">
          <div className="board-toolbar"><div className="board-identity"><span className={`small-cross ${screen==="setup"||view==="own"?"friendly":"hostile"}`}><Crosshair size={15}/></span><span>{screen==="setup"||view==="own"?"YOUR FLEET":"ENEMY WATERS"}</span></div>
            {screen!=="setup"?<div className="view-switch" role="group" aria-label="Board view"><button className={view==="enemy"?"selected":""} onClick={()=>{setView("enemy");setTarget(null);sound("select");}}>Target<small>{enemySunkCount}/5</small></button><button className={view==="own"?"selected":""} onClick={()=>{setView("own");setTarget(null);sound("select");}}>Fleet<small>{5-ownSunkCount}/5</small></button></div>:null}
          </div>
          <TacticalBoard fleet={screen==="setup"?draft:view==="own"?ownFleet:enemySunk} shots={screen==="setup"?[]:view==="own"?enemyShots:ownShots} placement={screen==="setup"} enabled={screen==="setup"?!locked&&!busy:canFire} selected={selected} horizontal={horizontal} quality={quality} onSelect={selectShip} onPlace={positionShip} onFire={fire} onAim={setTarget} event={boardEvent&&boardEvent.board===view?boardEvent:undefined}/>
          <div className="board-bottom">
            {screen==="setup"?<><span className="placement-hint">{locked?<><Check size={14}/>Fleet secured</>:<><span className="desktop-hint">Drag or select a ship, then place it.</span><span className="mobile-hint">Select a ship. Tap to place.</span></>}</span><button className="text-button" disabled={locked||busy} onClick={rotate}><RotateCw size={14}/>Rotate<kbd>R</kbd></button></>:<><div className="board-legend"><span><i className="legend-miss"/>Miss</span><span><i className="legend-hit"/>Hit</span><span><i className="legend-sunk"/>Sunk</span></div>{view==="enemy"?<button className={`button fire-button ${target&&canFire?"armed":""}`} disabled={!target||!canFire} onClick={()=>target&&fire(target)}><Crosshair size={16}/>{target&&canFire?`Fire at ${coord(target)}`:isTurn?"Select target":"Stand by"}</button>:<button className="text-button" onClick={()=>setView("enemy")}>Target enemy<ArrowRight size={14}/></button>}</>}</div>
        </section>
        <aside className="fleet-sidebar">
          {mode==="online"&&screen==="setup"&&<div className="room-panel"><div className="sidebar-label"><Radio size={13}/>PRIVATE ROOM</div><button className="room-code" onClick={copyInvite} aria-label={`Copy invite for room ${session?.code}`}><span>{session?.code??"······"}</span><Copy size={17}/></button><div className="room-players"><span><i className="live-dot"/>{online?.players[ownPlayer]?.name??"You"}</span><span><i className={`live-dot ${!online?.players[theirPlayer]?"pending":""}`}/>{online?.players[theirPlayer]?.name??"Waiting for a friend"}</span></div><button className="text-button" onClick={copyInvite}>Copy invite link<ArrowRight size={13}/></button></div>}
          <div className="fleet-heading"><span className="sidebar-label">{screen==="setup"?"YOUR STRIKE GROUP":view==="enemy"?"ENEMY FLEET":"YOUR FLEET"}</span><span className="fleet-total">{screen==="setup"?`${readyCount}/5`:view==="enemy"?`${5-enemySunkCount} afloat`:`${5-ownSunkCount} afloat`}</span></div>
          <div className="ship-list">{SHIPS.map(ship=>{
            const placed=draft.some(s=>s.id===ship.id),isSelected=screen==="setup"&&ship.id===selected;
            const relevantShots=view==="enemy"?ownShots:enemyShots;
            const sunk=relevantShots.some(s=>s.sunk?.id===ship.id);
            const ownVessel=ownFleet.find(s=>s.id===ship.id);
            const hitCount=screen!=="setup"&&view==="own"&&ownVessel?cellsFor(ownVessel).filter(c=>enemyShots.some(s=>s.x===c.x&&s.y===c.y)).length:sunk?ship.length:0;
            return <button key={ship.id} className={`ship-row ${isSelected?"selected":""} ${screen!=="setup"&&sunk?"destroyed":""}`} onClick={()=>screen==="setup"&&selectShip(ship.id)} disabled={screen!=="setup"||locked||busy} aria-label={`${ship.name}, ${ship.length} cells${screen==="setup"?placed?", placed":", unplaced":sunk?", sunk":""}`}><ShipSilhouette id={ship.id} className="ship-icon"/><span className="ship-information"><span>{ship.name}</span><span className="ship-pips">{Array.from({length:ship.length},(_,i)=><i key={i} className={i<hitCount?"damaged":""}/>)}</span></span><span className="ship-state">{screen==="setup"?placed?<Check size={14}/>:<span className="ship-length">0{ship.length}</span>:sunk?<X size={14}/>:null}</span></button>;
          })}</div>
          {screen==="setup"?<div className="deployment-actions"><div className="auto-actions"><button className="button secondary" disabled={locked||busy} onClick={()=>{const fleet=randomFleet();setDraft(fleet);setSelected("carrier");setHorizontal(fleet.find(s=>s.id==="carrier")!.horizontal);sound("place");}}><Shuffle size={16}/>Randomize</button><button className="button secondary clear-button" disabled={locked||busy||!draft.length} aria-label="Clear fleet" onClick={()=>{setDraft([]);setSelected("carrier");setHorizontal(true);sound("select");}}><Trash2 size={16}/></button></div><button className="button primary deploy-button" disabled={readyCount!==5||busy||locked} onClick={ready}>{busy?<Loader2 size={18} className="spin"/>:locked?<Check size={18}/>:<Anchor size={18}/>}<span>{locked?"Fleet ready":"Deploy fleet"}</span>{!locked&&<ArrowRight size={18}/>}</button>{locked&&<p className="waiting-copy">{online?.players[theirPlayer]?"Waiting for your opponent’s fleet.":"Share the room to begin."}</p>}</div>:<><div className="battle-stats"><div><span>SHOTS FIRED</span><strong>{String(ownShots.length).padStart(2,"0")}</strong></div><div><span>ACCURACY</span><strong>{ownShots.length?Math.round(hits/ownShots.length*100):0}<small>%</small></strong></div></div><button className="fleet-overview-button" aria-label={view==="enemy"?"View your fleet":"View enemy waters"} onClick={()=>{setView(view==="enemy"?"own":"enemy");setTarget(null);}}><MiniFleet fleet={ownFleet} shots={enemyShots}/><span>YOUR WATERS<small>{5-ownSunkCount} ships afloat</small><ArrowRight size={17}/></span></button><div className="last-transmission" aria-live="polite"><span className="sidebar-label"><Radio size={13}/>LAST TRANSMISSION</span>{last?<p><span className="shot-coordinate">{coord(last.shot)}</span><span>{last.shot.result==="sunk"?`${SHIPS.find(s=>s.id===last.shot.sunk?.id)?.name??"Vessel"} sunk`:last.shot.result==="hit"?"Direct hit":"Open water"}<small>{last.player===ownPlayer?"Outgoing":"Incoming"}</small></span></p>:<p className="radio-idle">Awaiting first contact.</p>}</div>{mode==="online"&&online?.players[theirPlayer]&&!online.players[theirPlayer]!.connected&&!finished&&<div className="connection-note"><WifiOff size={14}/>Opponent reconnecting. Battle saved.</div>}</>}
          <button className="leave-button" onClick={()=>setModal("quit")}><ArrowLeft size={13}/>{screen==="setup"?"Back to port":"Leave battle"}</button>
        </aside>
      </div>
          </main>}

    {screen==="result"&&!resultViewed&&<div className="result-scrim"><section className="result-panel" ref={resultRef} onKeyDown={e=>trapFocus(e,resultRef.current)} role="dialog" aria-modal="true" aria-labelledby="result-title"><div className={`result-emblem ${resultWin?"victory":"defeat"}`}>{resultWin?<Flag size={36} strokeWidth={1.4}/>:<Anchor size={36} strokeWidth={1.4}/>}</div><h1 id="result-title">{mode==="local"?`${names[winner??0]} wins.`:resultWin?"Ocean secured.":"Lost at sea."}</h1>{mode==="online"&&online?.opponentLeft&&<p>Your opponent has left the battle.</p>}<div className="result-stats"><div><strong>{ownShots.length}</strong><span>SHOTS</span></div><div><strong>{ownShots.length?Math.round(hits/ownShots.length*100):0}%</strong><span>ACCURACY</span></div><div><strong>{enemySunkCount}/5</strong><span>SHIPS SUNK</span></div></div><button className="button primary" disabled={busy||(mode==="online"&&(!!online?.rematch[ownPlayer]||!!online?.opponentLeft))} onClick={rematch}>{busy?<Loader2 size={17} className="spin"/>:<RotateCw size={17}/>}<span>{mode==="online"&&online?.rematch[ownPlayer]?"Rematch requested":"Play again"}</span></button>{mode==="online"&&online?.rematch[theirPlayer]&&!online.rematch[ownPlayer]&&<span className="rematch-note">Your opponent wants a rematch.</span>}<button className="text-button inspect-button" onClick={()=>{setResultViewed(true);setScreen("battle");}}>Inspect the battlefield<ArrowRight size={14}/></button><button className="result-home text-button" onClick={quit}>Back to port</button></section></div>}
    {screen==="battle"&&finished&&<button className="floating-result button primary" onClick={()=>{setResultViewed(false);setScreen("result");}}>Battle results<ArrowRight size={16}/></button>}

    {modal&&<div className="modal-scrim" onPointerDown={e=>{if(e.target===e.currentTarget&&!busy)setModal(null);}}><section className={`modal-panel modal-${modal}`} role="dialog" aria-modal="true" aria-labelledby="modal-title" ref={modalRef} onKeyDown={e=>trapFocus(e)}>
      <button className="icon-button modal-close" aria-label="Close dialog" disabled={busy} onClick={()=>setModal(null)}><X size={19}/></button>
      {modal==="ai"&&<><h2 id="modal-title">Play AI</h2><div className="difficulty-options">{LEVELS.map((level,i)=><button key={level} className={`difficulty-option ${difficulty===level?"selected":""}`} onClick={()=>{setDifficulty(level);sound("select");}}><span className="difficulty-rank">{Array.from({length:5},(_,j)=><i key={j} className={j<=i?"filled":""}/>)}</span><span>{level}</span><span className="radio-selection">{difficulty===level&&<i/>}</span></button>)}</div><button className="button primary modal-primary" onClick={()=>begin("ai")}>Deploy your fleet<ArrowRight size={18}/></button></>}
      {modal==="friend"&&<><h2 id="modal-title">Play Friend</h2><label className="field-label" htmlFor="commander-name">YOUR CALL SIGN</label><input id="commander-name" className="text-input" value={name} maxLength={24} onChange={e=>setName(e.target.value)} placeholder="Commander" autoComplete="nickname"/><button className="button primary modal-primary" disabled={busy} onClick={()=>enterOnline(false)}>{busy?<Loader2 size={17} className="spin"/>:<Globe2 size={17}/>}Create private room<ArrowRight size={18}/></button><div className="or-divider"><span/>OR JOIN A FRIEND<span/></div><form onSubmit={e=>{e.preventDefault();if(roomCode.length===6)void enterOnline(true);}} className="join-form"><input aria-label="Room code" className="text-input code-input" value={roomCode} onChange={e=>setRoomCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,6))} placeholder="ROOM CODE" maxLength={6} autoComplete="off" spellCheck={false}/><button className="button secondary" type="submit" disabled={roomCode.length!==6||busy}>Join<ArrowRight size={17}/></button></form></>}
      {modal==="local"&&<><h2 id="modal-title">Local Multiplayer</h2><div className="local-fields"><label className="field-label">COMMANDER ONE<input className="text-input" maxLength={24} value={names[0]} onChange={e=>setNames([e.target.value,names[1]])}/></label><label className="field-label">COMMANDER TWO<input className="text-input" maxLength={24} value={names[1]} onChange={e=>setNames([names[0],e.target.value])}/></label></div><button className="button primary modal-primary" onClick={()=>{setNames([names[0].trim()||"Commander 1",names[1].trim()||"Commander 2"]);begin("local");}}>Position your fleets<ArrowRight size={18}/></button></>}
      {modal==="settings"&&<><h2 id="modal-title">Settings</h2><div className="setting-row"><span><AudioLines size={18}/>Sound</span><button className={`toggle ${!muted?"on":""}`} role="switch" aria-checked={!muted} aria-label="Sound" onClick={()=>{audio.current?.start();setMuted(!muted);}}><i/></button></div><div className="volume-setting"><label htmlFor="volume">Master volume<span>{Math.round(volume*100)}%</span></label><input id="volume" type="range" min="0" max="1" step="0.01" value={volume} onChange={e=>{audio.current?.start();setVolume(Number(e.target.value));}}/></div><div className="setting-row"><span><Waves size={18}/>Water & effects</span><div className="view-switch"><button className={quality==="low"?"selected":""} onClick={()=>setQuality("low")}>Balanced</button><button className={quality==="high"?"selected":""} onClick={()=>setQuality("high")}>High</button></div></div><button className="button primary modal-primary" onClick={()=>setModal(null)}>Back to the ocean<ArrowRight size={17}/></button></>}
      {modal==="help"&&<><h2 id="modal-title">How to play</h2><div className="briefing-row"><span>01</span><div><h3>Hide your fleet.</h3><p>Place five ships horizontally or vertically. Ships can touch, but never overlap.</p></div></div><div className="briefing-row"><span>02</span><div><h3>Take your shot.</h3><p>Fire once per turn. On touchscreens, select a cell, then tap Fire.</p></div></div><div className="briefing-row"><span>03</span><div><h3>Sink them all.</h3><p>Strike every cell of a ship to sink it. Destroy all five to win.</p></div></div><div className="keyboard-notes"><span><kbd>R</kbd>Rotate</span><span><kbd>M</kbd>Mute</span><span><kbd>↑↓←→</kbd>Navigate</span></div><button className="button primary modal-primary" onClick={()=>setModal(null)}>Understood<Check size={17}/></button></>}
      {modal==="quit"&&<><h2 id="modal-title">Leave the battle?</h2><p className="quit-copy">{mode==="ai"&&game.phase==="battle"?"Your solo battle is saved. Pick it up when you’re ready.":mode==="online"&&online?.phase==="battle"?"Leaving concedes this battle to your opponent.":"You can start a new battle whenever you’re ready."}</p><div className="quit-actions"><button className="button secondary" onClick={()=>setModal(null)}>Stay</button><button className="button primary" disabled={busy} onClick={quit}>Back to port<ArrowRight size={17}/></button></div></>}
    </section></div>}
    {notice&&<div className="toast" role="status"><span>{notice}</span><button aria-label="Dismiss message" onClick={()=>setNotice("")}><X size={14}/></button></div>}
  </div>;
}
