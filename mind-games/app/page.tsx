'use client';

import {useEffect,useRef,useState,type ReactNode} from 'react';
import ArenaView,{type ArenaState} from '../components/arena-view';
import {Icon,MoveIcon} from '../components/icons';
import {AdaptiveAI,createMatch,resolveRound,MOVES,DIFFICULTIES,type Match,type Move,type Difficulty,type Variant} from '../lib/game.mjs';
import {GameAudio} from '../lib/audio';
import type {PublicRoom} from '../lib/rooms';

type Settings={difficulty:Difficulty;bestOf:3|5|7;variant:Variant;sound:boolean;music:boolean;reducedMotion:boolean;name:string};
type Kind='computer'|'local'|'online';
type Phase='choosing'|'locked'|'reveal'|'result'|'pass'|'finished';
type Panel='settings'|'record'|'rules'|'friend'|'leave'|null;
type RecordEntry={id:string;opponent:string;won:boolean;local:boolean;score:[number,number];date:number;variant:Variant};
type Stats={wins:number;losses:number;streak:number;bestStreak:number;rounds:number;ties:number;moves:[number,number,number];localWins:[number,number];history:RecordEntry[];completed:string[]};
type Session={code:string;token:string};
const DEFAULT_SETTINGS:Settings={difficulty:'Medium',bestOf:5,variant:'classic',sound:true,music:false,reducedMotion:false,name:''};
const EMPTY_STATS:Stats={wins:0,losses:0,streak:0,bestStreak:0,rounds:0,ties:0,moves:[0,0,0],localWins:[0,0],history:[],completed:[]};
const IDLE:ArenaState={phase:'idle'};
const STORAGE={settings:'mindgames.settings.v1',stats:'mindgames.stats.v1',ai:'mindgames.ai.v1',session:'mindgames.room.v1'};
const DIFFICULTY_COPY:Record<Difficulty,string>={Beginner:'Mostly random.',Easy:'Notices your favourite move.',Medium:'Spots repetition.',Hard:'Reads your habits and sequences.',Expert:'Adapts to your whole history.'};

function readStored<T>(key:string,fallback:T,session=false):T{
  try{const data=(session?sessionStorage:localStorage).getItem(key);const value=data?JSON.parse(data):fallback;if(value===null||value===undefined)return fallback;if(fallback!==null&&(typeof value!==typeof fallback||Array.isArray(fallback)&&!Array.isArray(value)))return fallback;return value as T;}catch{return fallback;}
}
function writeStored(key:string,value:unknown,session=false){try{(session?sessionStorage:localStorage).setItem(key,JSON.stringify(value));}catch{/* Session still works when storage is blocked. */}}
function removeStored(key:string,session=false){try{(session?sessionStorage:localStorage).removeItem(key);}catch{}}
function normalizeSettings(value:Partial<Settings>):Settings{
  return {...DEFAULT_SETTINGS,...value,difficulty:DIFFICULTIES.includes(value.difficulty as Difficulty)?value.difficulty!:DEFAULT_SETTINGS.difficulty,bestOf:[3,5,7].includes(value.bestOf||0)?value.bestOf!:5,variant:value.variant==='mind'?'mind':'classic',name:typeof value.name==='string'?value.name.slice(0,20):'',sound:value.sound!==false,music:value.music===true,reducedMotion:value.reducedMotion===true};
}
function secureToken(){const bytes=crypto.getRandomValues(new Uint8Array(32));return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
function Toggle({on,onChange,label}:{on:boolean;onChange:()=>void;label:string}){return <button type="button" className={'toggle '+(on?'on':'')} role="switch" aria-checked={on} aria-label={label} onClick={onChange}><span/></button>;}
function Modal({open,title,onClose,children,privacy=false}:{open:boolean;title?:string;onClose:()=>void;children:ReactNode;privacy?:boolean}){
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{const el=ref.current;if(!el)return;if(open&&!el.open)el.showModal();if(!open&&el.open)el.close();},[open]);
  return <dialog ref={ref} className={'modal '+(privacy?'privacy':'')} onCancel={e=>{e.preventDefault();if(!privacy)onClose();}} onClick={e=>{if(e.target===e.currentTarget&&!privacy)onClose();}} aria-label={title}>
    {!privacy&&<div className="modal-header"><h2>{title}</h2><button className="icon-button" aria-label="Close dialog" onClick={onClose}><Icon name="close"/></button></div>}
    <div className={privacy?'privacy-inner':'modal-content'}>{children}</div>
  </dialog>;
}

export default function Home(){
  const [settings,setSettings]=useState<Settings>(DEFAULT_SETTINGS);
  const [stats,setStats]=useState<Stats>(EMPTY_STATS);
  const [ready,setReady]=useState(false);
  const [screen,setScreen]=useState<'home'|'game'|'lobby'>('home');
  const [kind,setKind]=useState<Kind>('computer');
  const [phase,setPhase]=useState<Phase>('choosing');
  const [panel,setPanel]=useState<Panel>(null);
  const [match,setMatch]=useState<Match>(()=>createMatch());
  const [arenaState,setArenaState]=useState<ArenaState>(IDLE);
  const [hover,setHover]=useState<number|null>(null);
  const [selected,setSelected]=useState<Move|null>(null);
  const [boost,setBoost]=useState(false);
  const [localSeat,setLocalSeat]=useState<0|1>(0);
  const [onlineSession,setOnlineSession]=useState<Session|null>(null);
  const [room,setRoom]=useState<PublicRoom|null>(null);
  const [connection,setConnection]=useState<'connected'|'reconnecting'>('connected');
  const [roomUnavailable,setRoomUnavailable]=useState(false);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [friendTab,setFriendTab]=useState<'create'|'join'>('create');
  const [joinCode,setJoinCode]=useState('');
  const [copied,setCopied]=useState(false);
  const [showLink,setShowLink]=useState(false);
  const [revealWord,setRevealWord]=useState('Locked in.');
  const [currentDifficulty,setCurrentDifficulty]=useState<Difficulty>('Medium');
  const audio=useRef<GameAudio|null>(null);
  const ai=useRef<AdaptiveAI|null>(null);
  const aiCommit=useRef<{move:Move;boost:boolean}|null>(null);
  const localChoice=useRef<{move:Move;boost:boolean}|null>(null);
  const timers=useRef<Set<number>>(new Set());
  const generation=useRef(0);
  const gameId=useRef('');
  const rendered=useRef({id:'',rounds:0,revision:-1,phase:''});
  const onlineRef=useRef<Session|null>(null);
  const roomRef=useRef<PublicRoom|null>(null);
  const actionPending=useRef(false);
  const phaseRef=useRef<Phase>('choosing');
  const processRoom=useRef<(value:PublicRoom)=>void>(()=>{});
  const keyHandler=useRef<(event:KeyboardEvent)=>void>(()=>{});
  phaseRef.current=phase;
  roomRef.current=room;
  onlineRef.current=onlineSession;

  function clearTimers(){timers.current.forEach(clearTimeout);timers.current.clear();}
  function later(fn:()=>void,ms:number){const gen=generation.current;const id=window.setTimeout(()=>{timers.current.delete(id);if(gen===generation.current)fn();},ms);timers.current.add(id);}
  function unlock(){void audio.current?.unlock();}
  function changeSettings(patch:Partial<Settings>){setSettings(prev=>({...prev,...patch}));}
  function resetRound(){setSelected(null);setBoost(false);setHover(null);setArenaState(IDLE);setError('');actionPending.current=false;}
  function prepareAI(next:Match){
    if(!ai.current)ai.current=new AdaptiveAI({difficulty:settings.difficulty});
    aiCommit.current={move:ai.current.choose(),boost:next.variant==='mind'&&next.boostsLeft[1]&&(next.scores[0]>=next.target-1||crypto.getRandomValues(new Uint32Array(1))[0]/4294967296<.27)};
  }
  function saveRecord(finished:Match,id:string,mode:Kind,seat:0|1,opponent:string){
    if(finished.winner===null)return;
    const winner=finished.winner;
    setStats(prev=>{
      if(prev.completed.includes(id))return prev;
      const won=finished.winner===seat;
      const next:Stats={...prev,moves:[...prev.moves],localWins:[...prev.localWins],completed:[id,...prev.completed].slice(0,200),history:[{id,opponent,won,local:mode==='local',score:[finished.scores[seat],finished.scores[1-seat]] as [number,number],date:Date.now(),variant:finished.variant},...prev.history].slice(0,30)};
      if(mode==='local'){next.localWins[winner]++;}
      else{next.wins+=won?1:0;next.losses+=won?0:1;next.streak=won?prev.streak+1:0;next.bestStreak=Math.max(next.bestStreak,next.streak);next.rounds+=finished.history.length;next.ties+=finished.history.filter(r=>r.winner===null).length;finished.history.forEach(r=>next.moves[r.moves[seat]]++);}
      writeStored(STORAGE.stats,next);return next;
    });
  }
  function reveal(next:Match,mode:Kind,seat:0|1,id:string,opponent:string){
    const last=next.history.at(-1);if(!last)return;
    clearTimers();setSelected(null);setBoost(false);setHover(null);setPhase('reveal');setRevealWord('Rock.');setArenaState({phase:'locked'});audio.current?.play('tick');
    const speed=settings.reducedMotion?0.35:1;
    later(()=>{setRevealWord('Paper.');audio.current?.play('tick');},230*speed);
    later(()=>{setRevealWord('Scissors.');audio.current?.play('tick');},460*speed);
    later(()=>{
      setRevealWord('Shoot.');audio.current?.play('reveal');
      setArenaState({phase:'reveal',moves:[last.moves[seat],last.moves[1-seat]],winner:last.winner===null?null:last.winner===seat?0:1});
    },690*speed);
    later(()=>audio.current?.play('impact'),1040*speed);
    later(()=>{
      setMatch(next);setPhase(next.winner===null?'result':'finished');
      setArenaState({phase:'result',moves:[last.moves[seat],last.moves[1-seat]],winner:last.winner===null?null:last.winner===seat?0:1});
      if(next.winner!==null){audio.current?.play(mode==='local'||next.winner===seat?'victory':'lose');saveRecord(next,id,mode,seat,opponent);}
      else audio.current?.play(last.winner===null?'tie':last.winner===seat?'win':'lose');
    },1250*speed);
  }
  function startGame(mode:'computer'|'local'){
    unlock();clearTimers();generation.current++;setBusy(false);gameId.current=crypto.randomUUID();setOnlineSession(null);onlineRef.current=null;setRoom(null);setRoomUnavailable(false);setKind(mode);setCurrentDifficulty(settings.difficulty);setScreen('game');setPanel(null);
    const next=createMatch({bestOf:settings.bestOf,variant:settings.variant});setMatch(next);resetRound();localChoice.current=null;setLocalSeat(0);
    if(mode==='computer'){ai.current=new AdaptiveAI({difficulty:settings.difficulty,history:readStored(STORAGE.ai,[])});prepareAI(next);setPhase('choosing');}
    else setPhase('pass');
  }
  function nextRound(){
    unlock();if(kind==='online'){void sendAction('next');return;}
    if(phase!=='result')return;resetRound();localChoice.current=null;setLocalSeat(0);
    if(kind==='computer'){prepareAI(match);setPhase('choosing');}else setPhase('pass');
  }
  function rematch(){
    if(kind==='online'){void sendAction('rematch');return;}
    unlock();clearTimers();generation.current++;gameId.current=crypto.randomUUID();const next=createMatch({bestOf:match.bestOf,variant:match.variant});setMatch(next);resetRound();localChoice.current=null;setLocalSeat(0);
    if(kind==='computer'){prepareAI(next);setPhase('choosing');}else setPhase('pass');
  }
  function choose(move:Move){
    if(screen!=='game'||phaseRef.current!=='choosing'||panel||actionPending.current||busy||kind==='online'&&connection==='reconnecting')return;
    phaseRef.current='locked';
    unlock();audio.current?.play('select');setHover(null);
    if(kind==='online'){setSelected(move);setPhase('locked');setArenaState({phase:'locked'});void sendAction('lock',{move,boost});return;}
    if(kind==='local'){
      if(localSeat===0){localChoice.current={move,boost};setSelected(null);setBoost(false);setLocalSeat(1);setPhase('pass');setArenaState(IDLE);return;}
      const first=localChoice.current;if(!first)return;
      const next=resolveRound(match,first.move,move,first.boost,boost);localChoice.current=null;reveal(next,'local',0,gameId.current,'Local match');return;
    }
    const committed=aiCommit.current;if(!committed)return;aiCommit.current=null;
    const next=resolveRound(match,move,committed.move,boost,committed.boost);
    ai.current?.observe(move,committed.move);writeStored(STORAGE.ai,ai.current?.exportHistory()||[]);
    reveal(next,'computer',0,gameId.current,currentDifficulty+' AI');
  }
  async function request(path:string,options:RequestInit={},token?:string){
    const controller=new AbortController();const timeout=window.setTimeout(()=>controller.abort(),12000);
    try{
      let response:Response;
      try{response=await fetch(path,{...options,cache:'no-store',signal:controller.signal,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...options.headers}});}
      catch{throw Object.assign(new Error('Could not connect. Try again.'),{status:0});}
      // 429, 503 or Cloudflare's 1027 daily-limit page carry no JSON: show the busy message.
      const busy=response.status===429||response.status===503;
      const body=await response.json().catch(()=>({error:busy?'Online rooms are temporarily unavailable. Try again shortly.':'The connection was interrupted. Try again.'})) as {error?:string;room:PublicRoom;token:string};
      if(!response.ok)throw Object.assign(new Error(body.error||'Could not connect. Try again.'),{status:response.status});
      return body;
    }finally{clearTimeout(timeout);}
  }
  function adoptSession(session:Session,value:PublicRoom){
    clearTimers();generation.current++;rendered.current={id:'',rounds:0,revision:-1,phase:''};gameId.current=value.matchId;onlineRef.current=session;setOnlineSession(session);setRoomUnavailable(false);setKind('online');setPanel(null);setError('');setConnection('connected');writeStored(STORAGE.session,session,true);window.history.replaceState(null,'','?room='+session.code);processRoom.current(value);
  }
  async function openRoom(join:boolean){
    if(busy)return;unlock();setBusy(true);setError('');
    try{
      let data;
      if(join){
        const code=joinCode.trim().toUpperCase();if(code.length!==7)throw new Error('Enter the 7-character room code.');
        const previous=readStored<Session|null>(STORAGE.session,null,true);
        const token=previous?.code===code?previous.token:secureToken();
        writeStored(STORAGE.session,{code,token},true);
        data=await request('/api/rooms/'+code+'/join',{method:'POST',body:JSON.stringify({name:settings.name,clientToken:token})});
      }else data=await request('/api/rooms',{method:'POST',body:JSON.stringify({name:settings.name,bestOf:settings.bestOf,variant:settings.variant})});
      adoptSession({code:data.room.code,token:data.token},data.room);
    }catch(err){setError(err instanceof Error?err.message:'Could not open the room. Try again.');}finally{setBusy(false);}
  }
  async function sendAction(type:string,extra:Record<string,unknown>={}){
    const session=onlineRef.current;const current=roomRef.current;if(!session||!current||actionPending.current)return;
    actionPending.current=true;setBusy(true);setError('');
    try{
      const response=await request('/api/rooms/'+session.code+'/action',{method:'POST',body:JSON.stringify({type,matchId:current.matchId,round:type==='next'?current.match.history.at(-1)?.round:current.match.round,...extra})},session.token);
      processRoom.current(response.room);
    }catch(err){
      setError(err instanceof Error?err.message:'Connection lost. Your room is saved.');
      if(type==='lock'){setConnection('reconnecting');setSelected(null);}
    }finally{actionPending.current=false;setBusy(false);}
  }
  function goHome(){
    clearTimers();generation.current++;setBusy(false);setScreen('home');setPanel(null);setRoom(null);setOnlineSession(null);setRoomUnavailable(false);onlineRef.current=null;roomRef.current=null;resetRound();setPhase('choosing');localChoice.current=null;removeStored(STORAGE.session,true);window.history.replaceState(null,'',window.location.pathname);
  }
  async function leave(){
    if(kind==='online'&&onlineRef.current&&roomRef.current){
      setBusy(true);setError('');
      try{const session=onlineRef.current;await request('/api/rooms/'+session.code+'/action',{method:'POST',body:JSON.stringify({type:'leave',matchId:roomRef.current.matchId})},session.token);goHome();}
      catch(err){setError((err instanceof Error?err.message:'Connection lost.')+' You can retry leaving or close this tab.');}
      finally{setBusy(false);}
    }else goHome();
  }
  function requestHome(){if(screen==='home'){setPanel(null);return;}if(phase==='finished'&&kind!=='online'){goHome();return;}setPanel('leave');}
  async function copyInvite(){
    if(!onlineSession)return;
    const link=window.location.origin+'/?room='+onlineSession.code;
    try{await navigator.clipboard.writeText(link);setCopied(true);later(()=>setCopied(false),1800);}catch{setShowLink(true);}
  }

  processRoom.current=(value:PublicRoom)=>{
    if(!onlineRef.current||value.code!==onlineRef.current.code)return;
    const previous=rendered.current;
    if(value.revision<previous.revision)return;
    setRoom(value);roomRef.current=value;setConnection('connected');setKind('online');
    const isNewMatch=previous.id!==value.matchId;
    if(isNewMatch){clearTimers();generation.current++;rendered.current={id:value.matchId,rounds:0,revision:value.revision,phase:''};gameId.current=value.matchId;resetRound();setMatch(createMatch({bestOf:value.match.bestOf,variant:value.match.variant}));}
    rendered.current.revision=value.revision;
    if(value.phase==='waiting'){setScreen('lobby');setMatch(value.match);rendered.current.phase='waiting';return;}
    setScreen('game');
    if(value.phase==='abandoned'){clearTimers();setMatch(value.match);setPhase('finished');setArenaState(IDLE);setError('Your opponent left the room.');rendered.current.phase='abandoned';return;}
    if(value.phase==='choosing'){
      const justAdvanced=rendered.current.phase!=='choosing';
      if(justAdvanced||isNewMatch){clearTimers();setMatch(value.match);resetRound();}
      if(value.ownChoice){setSelected(value.ownChoice.move as Move);setPhase('locked');setArenaState({phase:'locked'});}
      else if(!actionPending.current||justAdvanced){setSelected(null);setPhase('choosing');setArenaState(IDLE);}
      rendered.current.rounds=value.match.history.length;rendered.current.phase='choosing';return;
    }
    if(value.match.history.length>rendered.current.rounds){
      rendered.current.rounds=value.match.history.length;rendered.current.phase=value.phase;
      reveal(value.match,'online',value.you,value.matchId,value.players[1-value.you]?.name||'Friend');
      return;
    }
    rendered.current.phase=value.phase;
  };

  useEffect(()=>{
    const storedSettings=readStored<Partial<Settings>>(STORAGE.settings,{});
    const saved=normalizeSettings(storedSettings);
    if(typeof storedSettings.reducedMotion!=='boolean'&&window.matchMedia('(prefers-reduced-motion: reduce)').matches)saved.reducedMotion=true;
    setSettings(saved);const storedStats=readStored<Stats>(STORAGE.stats,EMPTY_STATS);
    if(storedStats&&Array.isArray(storedStats.history)&&Array.isArray(storedStats.completed)&&Array.isArray(storedStats.moves)&&storedStats.moves.length===3&&Array.isArray(storedStats.localWins)&&storedStats.localWins.length===2&&[storedStats.wins,storedStats.losses,storedStats.streak,storedStats.bestStreak,storedStats.rounds,storedStats.ties,...storedStats.moves,...storedStats.localWins].every(n=>Number.isFinite(n)&&n>=0))setStats({...EMPTY_STATS,...storedStats,history:storedStats.history.filter(e=>e&&typeof e.id==='string'&&Array.isArray(e.score)&&e.score.length===2&&typeof e.date==='number')});
    audio.current=new GameAudio();setReady(true);
    const invite=new URLSearchParams(window.location.search).get('room')?.toUpperCase();
    const savedSession=readStored<Session|null>(STORAGE.session,null,true);
    if(invite){
      setJoinCode(invite);setFriendTab('join');
      if(savedSession?.code===invite){
        const resumeGeneration=generation.current;setBusy(true);request('/api/rooms/'+invite,{},savedSession.token).then(({room:value})=>{if(generation.current===resumeGeneration){setBusy(false);adoptSession(savedSession,value);}}).catch(()=>{if(generation.current===resumeGeneration){setPanel('friend');setBusy(false);}});
      }else setPanel('friend');
    }
    const listener=(event:KeyboardEvent)=>keyHandler.current(event);window.addEventListener('keydown',listener);
    return()=>{clearTimers();audio.current?.dispose();window.removeEventListener('keydown',listener);};
  },[]);
  useEffect(()=>{if(!ready)return;writeStored(STORAGE.settings,settings);audio.current?.setEnabled(settings.sound);audio.current?.setMusic(settings.music);},[settings,ready]);
  useEffect(()=>{
    if(!onlineSession)return;
    let cancelled=false;let timer:number|undefined;let failures=0;let inflight=false;
    const session=onlineSession;
    // Cheap HTTP polling: 1.5 s while a match runs, 4 s in the lobby or after the match,
    // 10 s in a hidden tab. Coming back to the tab polls at once.
    const pace=()=>{if(failures)return Math.min(10000,1500*failures);if(document.hidden)return 10000;const ph=roomRef.current?.phase;return ph==='waiting'||ph==='finished'||ph==='abandoned'?4000:1500;};
    const poll=async()=>{
      if(inflight)return;inflight=true;
      try{
        const {room:value}=await request('/api/rooms/'+session.code,{},session.token);
        if(cancelled)return;failures=0;processRoom.current(value);
      }catch(err){
        if(cancelled)return;failures++;setConnection('reconnecting');
        if((err as {status?:number}).status===410||(err as {status?:number}).status===401||(err as {status?:number}).status===404){clearTimers();generation.current++;setError(err instanceof Error?err.message:'This room is no longer available.');setRoomUnavailable(true);setPhase('finished');setArenaState(IDLE);setScreen('game');setConnection('connected');setOnlineSession(null);onlineRef.current=null;removeStored(STORAGE.session,true);return;}
      }finally{inflight=false;}
      if(!cancelled){clearTimeout(timer);timer=window.setTimeout(poll,pace());}
    };
    const onVisible=()=>{if(!document.hidden&&!cancelled){clearTimeout(timer);void poll();}};
    document.addEventListener('visibilitychange',onVisible);
    timer=window.setTimeout(poll,100);
    return()=>{cancelled=true;clearTimeout(timer);document.removeEventListener('visibilitychange',onVisible);};
  },[onlineSession?.code,onlineSession?.token]);

  const mySeat:0|1=kind==='online'?(room?.you||0):0;
  const theirSeat=1-mySeat;
  const last=match.history.at(-1);
  const ownName=kind==='local'?'Player 1':kind==='online'?(room?.players[mySeat]?.name||'You'):(settings.name||'You');
  const opponent=kind==='computer'?currentDifficulty+' AI':kind==='local'?'Player 2':room?.players[theirSeat]?.name||'Friend';
  const controlsSeat=kind==='local'?localSeat:mySeat;
  const abandoned=kind==='online'&&(room?.phase==='abandoned'||roomUnavailable);
  const isWinner=match.winner!==null&&match.winner===mySeat;
  const outcome=last?.winner===null?'tie':last?.winner===mySeat?'win':'lose';
  const matchLabel=match.variant==='mind'?'FIRST TO '+match.target:'BEST OF '+match.bestOf;
  const roundNumber=phase==='result'||phase==='finished'?Math.max(1,match.history.length):phase==='reveal'?match.round:match.round;
  const waitingNext=!!room?.players[mySeat]?.nextReady;
  const waitingRematch=!!room?.players[mySeat]?.rematchReady;
  const noOpponent=kind==='online'&&room?.players[theirSeat]&&!room.players[theirSeat]?.connected&&!abandoned;
  const [opponentGone,setOpponentGone]=useState(false);
  useEffect(()=>{
    // Give an opponent who dropped out 15 s to come back before offering a way out.
    setOpponentGone(false);
    if(!noOpponent)return;
    const timer=window.setTimeout(()=>setOpponentGone(true),15000);
    return()=>clearTimeout(timer);
  },[noOpponent,onlineSession?.code]);
  const opponentLeft=abandoned||(kind==='online'&&opponentGone&&!!noOpponent);
  function exitRoom(next:'home'|'computer'){
    const session=onlineRef.current;const current=roomRef.current;
    if(session&&current&&current.phase!=='abandoned')void request('/api/rooms/'+session.code+'/action',{method:'POST',body:JSON.stringify({type:'leave',matchId:current.matchId})},session.token).catch(()=>{});
    setOpponentGone(false);
    if(next==='computer'){removeStored(STORAGE.session,true);window.history.replaceState(null,'',window.location.pathname);startGame('computer');}else goHome();
  }
  const inviteLink=typeof window==='undefined'?'':window.location.origin+'/?room='+(onlineSession?.code||'');
  const modalTitle=panel==='settings'?'Settings':panel==='record'?'Your record':panel==='rules'?'How to play':panel==='friend'?'Play a friend':'Leave this match?';

  keyHandler.current=(event)=>{
    if(event.metaKey||event.ctrlKey||event.altKey||event.repeat)return;
    const target=event.target as HTMLElement;if(['INPUT','SELECT','TEXTAREA'].includes(target.tagName)||target.isContentEditable)return;
    if(panel||phase==='pass')return;
    if(event.key==='Enter'&&target.closest('button,a'))return;
    if(screen==='home'&&event.key==='Enter'){event.preventDefault();startGame('computer');}
    if(screen==='game'&&['1','2','3'].includes(event.key)){event.preventDefault();choose((Number(event.key)-1) as Move);}
    if(screen==='game'&&event.key==='Enter'){
      if(phase==='result'&&!waitingNext&&!busy){event.preventDefault();nextRound();}
      if(phase==='finished'&&!waitingRematch&&!busy&&!abandoned){event.preventDefault();rematch();}
    }
  };

  return <div className={'app '+(settings.reducedMotion?'reduce-motion':'')}>
    <header className="site-header">
      <button className="brand" aria-label="Mind Games home" onClick={requestHome}><span className="brand-mark"><Icon name="spark" size={15}/></span><span className="brand-type">Mind Games</span></button>
      <div className="header-actions"><button className="icon-button sound-button" aria-label={settings.sound?'Mute sound':'Enable sound'} aria-pressed={settings.sound} onClick={()=>{unlock();changeSettings({sound:!settings.sound});}}><Icon name={settings.sound?'sound':'mute'} size={17}/></button><span className="header-divider"/><button className="icon-button" aria-label="How to play" onClick={()=>setPanel('rules')}><Icon name="help" size={18}/></button><button className="icon-button" aria-label="Your record" onClick={()=>setPanel('record')}><Icon name="history" size={18}/></button><button className="icon-button" aria-label="Settings" onClick={()=>setPanel('settings')}><Icon name="settings" size={19}/></button></div>
    </header>

    {screen==='home'&&<main className="home-view">
      <section className="hero" aria-labelledby="hero-title">
        <h1 id="hero-title">Mind <span className="accent">Games</span></h1>
        <p className="hero-description">Rock, paper, scissors.</p>
        <button className="play-button hero-play" onClick={()=>startGame('computer')}><span className="btn-left"><Icon name="bot" size={19}/>Play Computer</span><Icon name="arrow" size={20}/></button>
        <div className="friend-actions"><button className="secondary-button" onClick={()=>{setError('');setFriendTab('create');setPanel('friend');}}><Icon name="people" size={15}/>Play Friend</button><button className="secondary-button" onClick={()=>startGame('local')}><Icon name="local" size={15}/>Play Locally</button></div>
        <div className="quick-config">
          <label className="config-select"><span className="sr-only">Computer difficulty</span><select aria-label="Computer difficulty" value={settings.difficulty} onChange={e=>changeSettings({difficulty:e.target.value as Difficulty})}>{DIFFICULTIES.map(d=><option key={d}>{d}</option>)}</select><Icon name="chevron"/></label><span className="config-dot"/>
          <label className="config-select"><span className="sr-only">Match length</span><select aria-label="Match length" value={settings.bestOf} onChange={e=>changeSettings({bestOf:Number(e.target.value) as 3|5|7})}>{[3,5,7].map(n=><option key={n} value={n}>Best of {n}</option>)}</select><Icon name="chevron"/></label><span className="config-dot"/>
          <button className="mode-trigger" onClick={()=>setPanel('settings')}>{settings.variant==='classic'?'Classic':'Mind Games'}<Icon name="chevron"/></button>
        </div>
      </section>
      <section className="home-art" aria-label="The arena">
        <div className="home-arena"><ArenaView home state={IDLE} reducedMotion={settings.reducedMotion} hover={null}/></div>
      </section>
    </main>}

    {screen==='lobby'&&<main className="lobby-view">
      <div className="lobby-symbol"><Icon name="people" size={31}/></div>
      <h1>Send the invite.</h1><p>The match starts when your friend joins.</p>
      <div className="room-code" aria-label={'Room code '+onlineSession?.code}>{onlineSession?.code}</div>
      <button className="play-button" onClick={copyInvite}><Icon name={copied?'check':'copy'} size={17}/>{copied?'Invite copied':'Copy invite link'}</button>
      {showLink&&<input className="invite-field" aria-label="Invite link" readOnly value={inviteLink} onFocus={e=>e.currentTarget.select()}/>}
      <div className="waiting-line"><span className="waiting-dot"/>{connection==='reconnecting'?'Reconnecting…':'Waiting for your friend'}</div>
      <div className="lobby-meta">{room?.match.variant==='mind'?'Mind Games':'Classic'} · Best of {room?.match.bestOf}</div>
      {error&&<p className="room-notice" role="alert">{error}</p>}
      <button className="text-button lobby-leave" onClick={()=>setPanel('leave')}><Icon name="back"/>Leave room</button>
    </main>}

    {screen==='game'&&<main className="game-view">
      <div className="game-topbar"><button className="text-button" onClick={requestHome}><Icon name="back"/>Leave</button><span className="round-tag">ROUND {String(roundNumber).padStart(2,'0')}</span><button className="mode-label text-button" onClick={()=>setPanel('rules')}><Icon name={match.variant==='mind'?'bolt':'shield'}/>{match.variant==='mind'?'Mind Games':'Classic'}</button></div>
      <div className="scoreboard">
        <div className="player-label"><div className="avatar"><Icon name={kind==='local'?'local':'spark'} size={19}/></div><div><strong>{ownName}</strong>{kind==='online'&&<small>{room?.players[mySeat]?.locked?'Locked in':'Your move'}</small>}<div className="score-pips">{Array.from({length:match.target},(_,i)=><i key={i} className={i<match.scores[mySeat]?'filled':''}/>)}</div></div></div>
        <div className="score-wrap"><div className="score-numbers" aria-label={'Score '+match.scores[mySeat]+' to '+match.scores[theirSeat]}><span>{match.scores[mySeat]}</span><i>:</i><span>{match.scores[theirSeat]}</span></div><div className="score-label">{matchLabel}</div></div>
        <div className="player-label right"><div className="avatar opponent"><Icon name={kind==='computer'?'bot':kind==='local'?'local':'people'} size={19}/></div><div><strong>{opponent}</strong><small className={noOpponent?'offline':''}>{kind==='computer'?'':kind==='local'?'':opponentLeft?'Left':noOpponent?'Away':room?.players[theirSeat]?.locked?'Locked in':'Choosing'}</small><div className="score-pips">{Array.from({length:match.target},(_,i)=><i key={i} className={i<match.scores[theirSeat]?'filled':''}/>)}</div></div></div>
      </div>
      {connection==='reconnecting'&&kind==='online'&&<div className="connection-bar"><span className="waiting-dot"/>Reconnecting…</div>}
      <div className="game-arena"><ArenaView home={false} state={arenaState} reducedMotion={settings.reducedMotion} hover={hover}/></div>
      <div className={'round-announcement '+((phase==='result'||phase==='finished')?outcome:'')} role="status" aria-live="polite">
        {opponentLeft?<><h2>{roomUnavailable?'Room unavailable.':opponent+' left.'}</h2></>
          :phase==='finished'?<div className="winner-burst"><h2>{kind==='local'?'Player '+(Number(match.winner)+1)+' wins the match.':isWinner?'You win the match.':'You lose the match.'}</h2>{kind!=='local'&&isWinner&&stats.streak>1&&<p>{stats.streak} wins in a row.</p>}</div>
          :phase==='reveal'?<><h2 key={revealWord} className="winner-burst">{revealWord}</h2></>
          :phase==='result'?<><h2>{last?.winner===null?'Tie.':kind==='local'?'Player '+(Number(last?.winner)+1)+' wins the round.':last?.winner===mySeat?'Your point.':'Their point.'}</h2><p>{last?.winner===null?'Same move.':MOVES[last!.moves[last!.winner!]]+' beats '+MOVES[last!.moves[1-last!.winner!]].toLowerCase()+'.'+(last?.boosts[last.winner!]?' Double play. +2 points.':'')}</p></>
          :phase==='locked'?<><h2>Locked in.</h2>{kind==='online'&&<p>{'Waiting for '+opponent+'…'}</p>}</>
          :<><h2>{kind==='local'?'Player '+(localSeat+1)+', make your move.':'What’s your move?'}</h2></>}
      </div>

      {!opponentLeft&&['choosing','locked','reveal','pass'].includes(phase)?<>
        <div className="choices" aria-label="Choose your move">{MOVES.map((name,i)=><button key={name} className={'choice '+(selected===i?'selected':'')} disabled={phase!=='choosing'||busy||connection==='reconnecting'&&kind==='online'} onClick={()=>choose(i as Move)} onMouseEnter={()=>setHover(i)} onMouseLeave={()=>setHover(null)} onFocus={()=>setHover(i)} onBlur={()=>setHover(null)} aria-label={name+', shortcut '+(i+1)}><kbd className="desktop-kbd">{i+1}</kbd>{selected===i&&<Icon name="lock" size={12}/>}<MoveIcon move={i}/><span className="choice-name">{name}</span></button>)}</div>
        {match.variant==='mind'&&<div className="boost-row"><button className={'boost-button '+(boost?'active':'')} aria-pressed={boost} disabled={phase!=='choosing'||!match.boostsLeft[controlsSeat]} onClick={()=>{unlock();audio.current?.play('select');setBoost(!boost);}}><Icon name="bolt"/>{match.boostsLeft[controlsSeat]?(boost?'Double play armed · ×2':'Double play · ×2'):'Double play used'}</button></div>}
        {kind==='local'&&<p className="choice-helper">Choose privately, then pass the device.</p>}
      </>:<div className="result-actions">
        {opponentLeft?<><button className="play-button next-button" onClick={()=>exitRoom('home')}>Back to menu<Icon name="arrow" size={17}/></button><button className="secondary-button" onClick={()=>exitRoom('computer')}><Icon name="bot" size={15}/>Play computer</button></>
          :phase==='finished'?<><button className="play-button next-button" disabled={busy||kind==='online'&&waitingRematch} onClick={rematch}><Icon name="refresh" size={17}/>{waitingRematch&&kind==='online'?'Rematch requested':'Play again'}<kbd className="desktop-kbd">↵</kbd></button><button className="secondary-button" onClick={requestHome}>Menu</button></>
          :<button className="play-button next-button" disabled={busy||kind==='online'&&waitingNext} onClick={nextRound}>{waitingNext&&kind==='online'?'Waiting for '+opponent:'Next round'}<Icon name="arrow" size={17}/><kbd className="desktop-kbd">↵</kbd></button>}
      </div>}
      {kind==='online'&&phase==='finished'&&!opponentLeft&&room?.players[theirSeat]?.rematchReady&&!waitingRematch&&<p className="choice-helper">{opponent} wants a rematch.</p>}
      {error&&<p className="game-error" role="alert">{error}</p>}
      <div className="round-history" aria-label="Round history">{match.history.slice(-25).map((r,i)=><span key={i} className={'history-dot '+(r.winner===null?'tie':r.winner===mySeat?'win':'lose')} title={'Round '+r.round+': '+MOVES[r.moves[mySeat]]+' / '+MOVES[r.moves[theirSeat]]}/>)}</div>
    </main>}


    <Modal open={panel!==null} title={modalTitle} onClose={()=>{if(!busy){setPanel(null);setError('');}}}>
      {panel==='settings'&&<>
        {screen==='home'&&<>
          <div className="setting-section"><div className="setting-label">Game mode</div><div className="segmented"><button className={settings.variant==='classic'?'active':''} onClick={()=>changeSettings({variant:'classic'})}>Classic</button><button className={settings.variant==='mind'?'active':''} onClick={()=>changeSettings({variant:'mind'})}>Mind Games</button></div><p className="help-text">{settings.variant==='classic'?'One point per win. Ties replay. First to the majority wins.':'One secret ×2 play each per match. Activate before choosing. A win earns two points; a tie or loss spends it. First to the target wins.'}</p></div>
          <div className="setting-section"><div className="setting-label">Computer difficulty</div><div className="segmented">{DIFFICULTIES.map(d=><button key={d} className={settings.difficulty===d?'active':''} onClick={()=>changeSettings({difficulty:d})}>{d}</button>)}</div><p className="help-text">{DIFFICULTY_COPY[settings.difficulty]}</p></div>
          <div className="setting-section"><div className="setting-label">{settings.variant==='mind'?'Points to win':'Match length'}</div><div className="segmented">{[3,5,7].map(n=><button key={n} className={settings.bestOf===n?'active':''} onClick={()=>changeSettings({bestOf:n as 3|5|7})}>{settings.variant==='mind'?'First to '+(Math.floor(n/2)+1):'Best of '+n}</button>)}</div></div>
          <div className="setting-section"><label className="setting-label" htmlFor="player-name">Your name</label><input id="player-name" className="name-input" placeholder="Player" maxLength={20} value={settings.name} onChange={e=>changeSettings({name:e.target.value})}/></div>
        </>}
        <div className="setting-section"><div className="toggle-row"><span>Sound effects</span><Toggle label="Sound effects" on={settings.sound} onChange={()=>{unlock();changeSettings({sound:!settings.sound});}}/></div><div className="toggle-row"><span>Ambient music</span><Toggle label="Ambient music" on={settings.music} onChange={()=>{unlock();changeSettings({music:!settings.music});}}/></div><div className="toggle-row"><span>Reduced motion</span><Toggle label="Reduced motion" on={settings.reducedMotion} onChange={()=>changeSettings({reducedMotion:!settings.reducedMotion})}/></div></div>
        {screen!=='home'&&<p className="help-text">Change difficulty and match rules from the menu.</p>}
      </>}
      {panel==='friend'&&<>
        <div className="segmented friend-tabs"><button className={friendTab==='create'?'active':''} onClick={()=>{setFriendTab('create');setError('');}}>Create room</button><button className={friendTab==='join'?'active':''} onClick={()=>{setFriendTab('join');setError('');}}>Join room</button></div>
        <form onSubmit={e=>{e.preventDefault();void openRoom(friendTab==='join');}}>
          <label className="field-label" htmlFor="friend-name">Your name</label><input id="friend-name" className="name-input" placeholder="Player" maxLength={20} value={settings.name} onChange={e=>changeSettings({name:e.target.value})} autoComplete="nickname"/>
          {friendTab==='join'?<><label className="field-label" htmlFor="room-code">Room code</label><input id="room-code" className="name-input room-input" placeholder="XXXXXXX" maxLength={7} value={joinCode} onChange={e=>setJoinCode(e.target.value.replace(/[^a-zA-Z0-9]/g,'').toUpperCase())} autoComplete="off" autoCapitalize="characters" spellCheck={false} required/></>:<>
            <div className="field-label">Match length</div><div className="segmented">{[3,5,7].map(n=><button type="button" key={n} className={settings.bestOf===n?'active':''} onClick={()=>changeSettings({bestOf:n as 3|5|7})}>Best of {n}</button>)}</div>
            <div className="field-label">Game mode</div><div className="segmented"><button type="button" className={settings.variant==='classic'?'active':''} onClick={()=>changeSettings({variant:'classic'})}>Classic</button><button type="button" className={settings.variant==='mind'?'active':''} onClick={()=>changeSettings({variant:'mind'})}>Mind Games</button></div>
          </>}
          {error&&<p className="form-error" role="alert">{error}</p>}
          <button className="play-button form-button" type="submit" disabled={busy}>{busy?'Connecting…':friendTab==='join'?'Join room':'Create private room'}<Icon name="arrow" size={17}/></button>
        </form>
      </>}
      {panel==='record'&&<>
        <div className="stats-grid"><div><div className="stats-number">{stats.wins}</div><div className="stats-caption">MATCHES WON</div></div><div><div className="stats-number">{stats.wins+stats.losses?Math.round(stats.wins/(stats.wins+stats.losses)*100):0}<span style={{fontSize:17}}>%</span></div><div className="stats-caption">WIN RATE</div></div><div><div className="stats-number">{stats.bestStreak}</div><div className="stats-caption">BEST STREAK</div></div></div>
        <p className="help-text">{stats.rounds} rounds played · {stats.ties} ties · Saved on this device</p>
        <div className="record-subtitle">Recent matches</div>
        {stats.history.length?stats.history.slice(0,12).map(entry=><div className="record-row" key={entry.id}><span className={'record-marker '+(!entry.won?'loss':'')}>{entry.local?'L':entry.won?'W':'L'}</span><div className="record-info"><strong>{entry.opponent}</strong><small>{entry.variant==='mind'?'Mind Games':'Classic'} · {new Date(entry.date).toLocaleDateString(undefined,{month:'short',day:'numeric'})}</small></div><span className="record-score">{entry.score[0]} — {entry.score[1]}</span></div>):<p className="empty-state">No matches yet.</p>}
        <div className="record-subtitle">Local leaderboard</div><div className="local-record"><span>Player 1</span><span>{stats.localWins[0]} wins</span></div><div className="local-record"><span>Player 2</span><span>{stats.localWins[1]} wins</span></div>
        <p className="help-text">Personal stats count computer and online matches. Local wins are tracked separately.</p>
      </>}
      {panel==='rules'&&<>
        <div className="rules-list">{[[0,2],[2,1],[1,0]].map(([a,b])=><div className="rules-row" key={a}><MoveIcon move={a}/><span><strong>{MOVES[a]}</strong> beats <strong>{MOVES[b].toLowerCase()}</strong></span><MoveIcon move={b}/></div>)}</div>
        <p className="rules-copy"><strong>Classic</strong><br/>Pick a move. Both choices reveal together. A win earns one point; ties replay. Best of 3, 5, or 7 means first to 2, 3, or 4 points.</p><div className="rules-divider"/>
        <p className="rules-copy"><strong>Mind Games</strong><br/>Each player gets one secret double play per match. Arm ×2 before picking a move. Win that round for two points. A loss or tie still spends it. Reach the point target to win.</p><div className="rules-divider"/>
        <div className="fair-play"><Icon name="shield"/><span>The bot commits before you choose. Online picks stay sealed until both lock in. In local play, look away and pass the device at each privacy screen.</span></div>
        <p className="help-text desktop-help">Keyboard: 1 rock · 2 paper · 3 scissors · Enter next round</p>
      </>}
      {panel==='leave'&&<>
        <p className="modal-description">{screen==='lobby'?'This closes your room. You can create a new one anytime.':kind==='online'?'Leaving ends this room for both players.':'Your current match will end. Completed matches stay in your record.'}</p>
        {error&&<p className="form-error" role="alert">{error}</p>}
        <button className="play-button form-button" disabled={busy} onClick={()=>void leave()}>{busy?'Leaving…':'Leave match'}<Icon name="arrow" size={17}/></button><button className="secondary-button form-button" disabled={busy} onClick={()=>{setPanel(null);setError('');}}>Keep playing</button>
      </>}
    </Modal>

    <Modal open={screen==='game'&&kind==='local'&&phase==='pass'&&panel===null} title={'Pass to Player '+(localSeat+1)} onClose={()=>{}} privacy>
      <div className="avatar"><Icon name="lock" size={25}/></div><h2>Pass to Player {localSeat+1}.</h2><p>{localSeat===1?'Player 1 is locked in. Keep your next move to yourself.':'The other player should look away while you choose.'}</p><button className="play-button" onClick={()=>{setPhase('choosing');unlock();}}>I’m Player {localSeat+1}<Icon name="arrow" size={18}/></button><button className="text-button" onClick={()=>setPanel('leave')}>Leave match</button>
    </Modal>
  </div>;
}
