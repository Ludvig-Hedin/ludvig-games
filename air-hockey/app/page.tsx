'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, ChevronDown, Copy, Cpu, Expand, Hand, Keyboard, Link2, LoaderCircle, LogOut, Pause, Play, RotateCcw, Settings2, Share2, Users, Volume2, VolumeX, X } from 'lucide-react';
import { GameRuntime, type HudState } from '@/lib/game/runtime';
import { OnlineGame, CONNECT_FAILED_MESSAGE, type RoomSnapshot, type OnlineStatus, type OnlineSession } from '@/lib/game/online';
import { DIFFICULTIES, type Difficulty, type Side } from '@/lib/game/types';
import { DEFAULT_PREFERENCES, loadPreferences, savePreferences, keyLabel, type Preferences, type Direction } from '@/lib/game/preferences';

type Modal = 'settings' | 'pause' | 'online' | 'local' | null;
const initialHud: HudState = { scores:[0,0],phase:'faceoff',timer:1.5,elapsed:0,rally:0,scorer:null,target:7,paused:false,mode:'demo',ping:0 };

function SelectField({label,value,onChange,children}:{label:string;value:string|number;onChange:(value:string)=>void;children:React.ReactNode}) {
  return <label className="select-field"><span>{label}</span><span className="select-wrap"><select aria-label={label} value={value} onChange={e=>onChange(e.target.value)}>{children}</select><ChevronDown size={13}/></span></label>;
}

export default function Home() {
  const arenaRef = useRef<HTMLDivElement>(null);
  const runtime = useRef<GameRuntime | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [ready,setReady] = useState(false);
  const [compatibility,setCompatibility] = useState(false);
  const [fatal,setFatal] = useState('');
  const [view,setView] = useState<'home'|'game'>('home');
  const [modal,setModal] = useState<Modal>(null);
  const [difficulty,setDifficulty] = useState<Difficulty>('Medium');
  const [target,setTarget] = useState(7);
  const [preferences,setPreferences] = useState<Preferences>(DEFAULT_PREFERENCES);
  const [hud,setHud] = useState(initialHud);
  const [control,setControl] = useState('mouse');
  const [online,setOnline] = useState<OnlineGame|null>(null);
  const [snapshot,setSnapshot] = useState<RoomSnapshot|null>(null);
  const [networkStatus,setNetworkStatus] = useState<OnlineStatus>('connecting');
  const [savedSession,setSavedSession] = useState<OnlineSession|null>(null);
  const [roomTab,setRoomTab] = useState<'create'|'join'>('create');
  const [roomCode,setRoomCode] = useState('');
  const [name,setName] = useState('Player');
  const [busy,setBusy] = useState(false);
  const [roomError,setRoomError] = useState('');
  const [toast,setToast] = useState('');
  const [copied,setCopied] = useState(false);
  const [binding,setBinding] = useState<{side:Side;direction:Direction}|null>(null);
  const [touchOnly,setTouchOnly] = useState(false);
  const [canFullscreen,setCanFullscreen] = useState(false);
  const [canShare,setCanShare] = useState(false);
  const resultRecorded = useRef(false);
  const localTouch = useRef(false);
  const connectionAttempt = useRef(0);
  const restoredSession = useRef(false);

  useEffect(()=>{
    // Browser-only values are read once after mount so server and client markup match.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    const prefs = loadPreferences(); setPreferences(prefs); setName(prefs.name);
    try { const saved = localStorage.getItem('air-difficulty') as Difficulty | null; if (saved && DIFFICULTIES.includes(saved)) setDifficulty(saved); } catch {}
    setTouchOnly(matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches);
    setCanFullscreen(!!document.fullscreenEnabled);
    setCanShare(typeof navigator.share === 'function' && matchMedia('(pointer: coarse)').matches);
    setSavedSession(OnlineGame.savedSession());
    const query = new URLSearchParams(location.search).get('room');
    if(query) { setRoomCode(query.toUpperCase().replace(/[^A-Z2-9]/g,'').slice(0,6)); setRoomTab('join'); setModal('online'); }
    let game:GameRuntime;
    try {
      game = new GameRuntime(arenaRef.current!); runtime.current=game; game.configure(prefs);
      game.onHud = setHud; game.onControl=setControl; game.onError=setToast;
      game.onGraphicsChange = available=>setFatal(available?'':'Graphics were interrupted. Reload the page if the table does not come back.');
      game.onPause = paused=>setModal(previous=>paused ? (previous==='settings'||previous==='online' ? previous : 'pause') : (previous==='pause' ? null : previous));
      setCompatibility(game.compatibility); setFatal(''); setReady(true);
    } catch(error) {
      console.error(error); setFatal('Your browser could not start 3D graphics. Turn on hardware acceleration or try another browser.');
    }
    return ()=> { game?.dispose(); runtime.current=null; };
  },[]);

  useEffect(()=>{
    runtime.current?.configure(preferences);
    if(ready) savePreferences(preferences);
  },[preferences,ready]);
  useEffect(()=>{ try { localStorage.setItem('air-difficulty', difficulty); } catch {} },[difficulty]);
  useEffect(()=>{
    if(!toast) return;
    const timer=setTimeout(()=>setToast(''),4000); return ()=>clearTimeout(timer);
  },[toast]);
  useEffect(()=>{
    if(hud.phase!=='finished' || hud.mode==='demo' || resultRecorded.current) return;
    resultRecorded.current=true; document.exitPointerLock?.();
  },[hud.phase,hud.mode]);
  useEffect(()=>{ if(hud.phase==='faceoff') resultRecorded.current=false; },[hud.phase]);
  useEffect(()=>{
    if(!modal) return;
    const previous=document.activeElement as HTMLElement;
    const timer=setTimeout(()=>{ if(!touchOnly) dialogRef.current?.querySelector<HTMLElement>('input,button,select')?.focus(); },40);
    const trap=(e:KeyboardEvent)=>{
      if(e.key==='Escape'&&!binding){
        e.preventDefault();
        if((modal==='pause'||modal==='settings'||(modal==='online'&&online&&online.snapshot?.status!=='waiting'))&&view==='game') runtime.current?.pause(false);
        if(modal==='online'&&!online){connectionAttempt.current++;setBusy(false);}
        setModal(null);return;
      }
      if(e.key!=='Tab'||!dialogRef.current) return;
      const elements=[...dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select,[tabindex="0"]')];
      const first=elements[0],last=elements[elements.length-1];
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}
      else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
    };
    document.addEventListener('keydown',trap);
    return ()=>{clearTimeout(timer);document.removeEventListener('keydown',trap);previous?.focus?.();};
  },[modal,view,binding,online,touchOnly]);
  useEffect(()=>{
    if(!binding) return;
    const listener=(event:KeyboardEvent)=>{
      event.preventDefault(); event.stopImmediatePropagation();
      if(event.code==='Escape'){setBinding(null);return;}
      if(['Space','Enter','Tab','MetaLeft','MetaRight','ControlLeft','ControlRight','AltLeft','AltRight'].includes(event.code)) {setToast('That key is reserved. Choose a letter or an arrow.');return;}
      const duplicate=preferences.keys.some((map,side)=>Object.entries(map).some(([direction,code])=>code===event.code&&(side!==binding.side||direction!==binding.direction)));
      if(duplicate){setToast('That key already controls another direction.');return;}
      setPreferences(previous=>{const keys=structuredClone(previous.keys);keys[binding.side][binding.direction]=event.code;return {...previous,keys};});
      setBinding(null);
    };
    window.addEventListener('keydown',listener,true); return ()=>window.removeEventListener('keydown',listener,true);
  },[binding,preferences.keys]);

  const sound=()=>{void runtime.current?.unlock();runtime.current?.audio.click();};
  const playComputer=(level:Difficulty=difficulty)=>{if(!ready)return;sound();connectionAttempt.current++;setBusy(false);resultRecorded.current=false;setDifficulty(level);runtime.current!.startAI(level,target);setView('game');setModal(null);setOnline(null);setSnapshot(null);setControl('mouse');};
  const playLocal=(touch:boolean)=>{if(!ready)return;sound();connectionAttempt.current++;setBusy(false);localTouch.current=touch;resultRecorded.current=false;runtime.current!.startLocal(target,touch);setView('game');setModal(null);setOnline(null);setSnapshot(null);setControl(touch?'touch':'keyboard');};
  const home=()=>{sound();connectionAttempt.current++;setBusy(false);runtime.current?.home();setOnline(null);setSnapshot(null);setSavedSession(null);setView('home');setModal(null);setRoomError('');if(location.search)history.replaceState(null,'',location.pathname);};
  const openSettings=()=>{sound();if(view==='game'&&hud.phase!=='finished')runtime.current?.pause(true);setModal('settings');};
  const closeModal=()=>{setBinding(null);if(modal==='online'&&!online){connectionAttempt.current++;setBusy(false);}if(modal==='settings'&&view==='game'&&hud.phase!=='finished'){runtime.current?.pause(false);}if(modal==='pause')runtime.current?.pause(false);setModal(null);};
  const openOnline=()=>{sound();setRoomError('');setModal('online');};
  const openLocal=()=>{ if(touchOnly) playLocal(true); else { sound(); setModal('local'); } };
  const receive=(game:OnlineGame)=>{
    runtime.current!.attachOnline(game);setOnline(game);setSnapshot(game.snapshot);setNetworkStatus(game.status);setView('game');setSavedSession(game.session);
    let lastRoomStatus=game.snapshot?.status;
    game.onSnapshot=s=>{
      setSnapshot(previous=>{
        if(previous&&previous.status===s.status&&previous.matchId===s.matchId&&previous.pausedBy===s.pausedBy&&JSON.stringify(previous.players)===JSON.stringify(s.players))return previous;
        return s;
      });
      if(s.status==='playing'&&lastRoomStatus!=='playing')setModal(previous=>previous==='online'?null:previous);
      lastRoomStatus=s.status;
    };
    game.onStatus=status=>{setNetworkStatus(status);if(status==='error')setModal('pause');};
    setModal(game.snapshot?.status==='waiting'?'online':null);
  };
  const connect=async(action:'create'|'join'|'reconnect')=>{
    if(!ready||busy)return;sound();setBusy(true);setRoomError('');
    const attempt=++connectionAttempt.current;
    try{
      const cleanName=name.trim().slice(0,20)||'Player';setPreferences(p=>({...p,name:cleanName}));
      const previousSession=savedSession||OnlineGame.savedSession();
      const shouldReconnect=previousSession&&(action==='reconnect'||(action==='join'&&previousSession.code===roomCode));
      const game=shouldReconnect?await OnlineGame.reconnect(previousSession!):action==='create'?await OnlineGame.create(cleanName,target):await OnlineGame.join(roomCode,cleanName);
      if(attempt!==connectionAttempt.current){
        const deadline=setTimeout(()=>game.dispose(),1000);
        void game.action('leave').catch(()=>{}).finally(()=>{clearTimeout(deadline);game.dispose();});
        if(OnlineGame.savedSession()?.token===game.session.token)OnlineGame.clearSession();
        return;
      }
      receive(game);
    }catch(error){if(attempt===connectionAttempt.current){setRoomError(error instanceof Error?error.message:'Could not connect. Try again.');setSavedSession(OnlineGame.savedSession());}}finally{if(attempt===connectionAttempt.current)setBusy(false);}
  };
  const inviteUrl=()=>online?`${location.origin}${location.pathname}?room=${online.session.code}`:'';
  const copyInvite=async()=>{
    if(!online)return;
    try{await navigator.clipboard.writeText(inviteUrl());setCopied(true);setTimeout(()=>setCopied(false),2000);}catch{setToast(`Room code: ${online.session.code}`);}
  };
  const shareInvite=async()=>{
    if(!online)return;
    try{await navigator.share({title:'Air Hockey',url:inviteUrl()});}catch(error){if((error as Error)?.name!=='AbortError')void copyInvite();}
  };
  const rematch=()=>{
    sound();if(online){void online.action('rematch').catch(e=>setToast(e.message));}
    else if(hud.mode==='local')playLocal(localTouch.current);else playComputer();
  };
  const toggleMute=()=>{sound();setPreferences(p=>({...p,muted:!p.muted}));};
  const fullscreen=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{setToast('Full screen is not available here.');}};
  useEffect(()=>{
    if(!ready||restoredSession.current)return;
    restoredSession.current=true;
    const previousSession=OnlineGame.savedSession();
    const incoming=new URLSearchParams(location.search).get('room')?.toUpperCase();
    if(previousSession&&(!incoming||incoming===previousSession.code)){
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRoomTab('join');setRoomCode(previousSession.code);setModal('online');void connect('reconnect');
    }
  // Restores a saved seat once after the table is ready.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[ready]);
  const side:Side=online?.session.side??0;
  const other:Side=side===0?1:0;
  const names:[string,string]=snapshot?[snapshot.players[0].name,snapshot.players[1].name]:hud.mode==='local'?['Blue','Coral']:['You',difficulty];
  const winner:Side=hud.scores[0]>hud.scores[1]?0:1;
  const isFinished=view==='game'&&hud.phase==='finished';
  const isWaiting=online&&snapshot?.status==='waiting';
  const friend=snapshot?.players[other];
  const friendName=friend?.present?friend.name:'your friend';
  const friendLeft=!!(online&&friend?.left);
  const roomClosed=!!(online&&networkStatus==='error');
  const statusText=online&&!roomClosed&&!friendLeft?(networkStatus==='reconnecting'?'Reconnecting…':networkStatus==='disconnected'?`Waiting for ${friendName}…`:''):'';
  const nextLevel=hud.mode==='ai'&&winner===0?DIFFICULTIES[DIFFICULTIES.indexOf(difficulty)+1]:undefined;
  const showHint=view==='game'&&!modal&&!isFinished&&!isWaiting&&hud.phase==='faceoff'&&hud.scores[0]+hud.scores[1]===0;
  const hint=hud.mode==='local'?(control==='touch'?'Each player drags a mallet':`Blue ${Object.values(preferences.keys[0]).map(keyLabel).join(' ')} · Coral ${Object.values(preferences.keys[1]).map(keyLabel).join(' ')}`):(touchOnly||control==='touch'?'Drag your mallet':'Move the mouse');
  const controlsHelp=touchOnly?'Drag your mallet with one finger. Score in the far goal.':`Move the mouse, or use ${Object.values(preferences.keys[0]).map(keyLabel).join(' ')}. Space or Esc pauses.`;
  const patch=(value:Partial<Preferences>)=>setPreferences(p=>({...p,...value}));
  const resultTitle=hud.mode==='local'?`${names[winner]} wins`:hud.mode==='online'?(winner===side?'You win':`${names[winner]} wins`):(winner===0?'You win':'You lose');

  return <main className={`air-app ${view==='home'?'is-home':'is-playing'}`}>
    <div className="arena-stage" ref={arenaRef} tabIndex={-1} aria-label="Air hockey table"/>
    <header className="app-header">
      <div className="header-actions">
        <button className="icon-button sound-button" onClick={toggleMute} aria-label={preferences.muted?'Sound on':'Sound off'} title={preferences.muted?'Sound on':'Sound off'}>{preferences.muted?<VolumeX size={20}/>:<Volume2 size={20}/>}</button>
        {canFullscreen&&<button className="icon-button fullscreen-button" onClick={fullscreen} aria-label="Full screen" title="Full screen"><Expand size={19}/></button>}
        <button className="icon-button" onClick={view==='game'?()=>runtime.current?.pause(true):openSettings} aria-label={view==='game'?'Pause':'Settings'} title={view==='game'?'Pause':'Settings'}>{view==='game'?<Pause size={20}/>:<Settings2 size={20}/>}</button>
      </div>
    </header>

    {view==='home'&&<section className="home-content">
      <h1>Air<br/><span>Hockey</span></h1>
      <div className="play-menu">
        <button className="play-primary" onClick={()=>playComputer()} disabled={!ready}><Cpu size={20}/><span>Play computer</span><span className="button-arrow"><ArrowRight size={20}/></span></button>
        <div className="secondary-modes"><button onClick={openOnline} disabled={!ready}><Link2 size={18}/>Play a friend</button><button onClick={openLocal} disabled={!ready}><Users size={18}/>Two players</button></div>
      </div>
      <div className="match-options"><SelectField label="Level" value={difficulty} onChange={v=>setDifficulty(v as Difficulty)}>{DIFFICULTIES.map(d=><option key={d}>{d}</option>)}</SelectField><span className="option-divider"/><SelectField label="First to" value={target} onChange={v=>setTarget(Number(v))}>{[3,5,7,11].map(n=><option value={n} key={n}>{n}</option>)}</SelectField></div>
      {savedSession&&<button className="reconnect-link" onClick={()=>{setRoomTab('join');setRoomCode(savedSession.code);setModal('online');}}><RotateCcw size={14}/>Rejoin room {savedSession.code}</button>}
    </section>}

    {view==='game'&&<>
      <section className="scoreboard" aria-label="Score" aria-live="polite" aria-atomic="true">
        <div className={`player-score player-${side}`}><span className="player-label"><i/>{names[side]||'You'}</span><strong key={`own-${hud.scores[side]}`}>{hud.scores[side]}</strong></div>
        <div className="score-center"><span>First to {hud.target}</span></div>
        <div className={`player-score player-${other}`}><span className="player-label"><i/>{names[other]||'Friend'}</span><strong key={`other-${hud.scores[other]}`}>{hud.scores[other]}</strong></div>
      </section>
      {!modal&&!isFinished&&!isWaiting&&!hud.paused&&hud.phase==='faceoff'&&<div className="countdown" aria-live="assertive"><strong key={Math.ceil(hud.timer)}>{Math.max(1,Math.ceil(hud.timer))}</strong></div>}
      {!modal&&hud.phase==='goal'&&<div className={`goal-announcement color-${hud.scorer}`} key={`${hud.scores[0]}-${hud.scores[1]}`}><span>{names[hud.scorer??0]}</span><strong>Goal</strong></div>}
      {statusText&&<div className="network-banner" role="status"><LoaderCircle size={14} className="spin"/>{statusText}</div>}
      {showHint&&<div className="play-hint">{control==='touch'||touchOnly?<Hand size={14}/>:hud.mode==='local'?<Keyboard size={14}/>:null}{hint}</div>}
      {online&&!isWaiting&&<button className="room-tag" onClick={()=>{if(snapshot?.status==='playing'&&!isFinished)runtime.current?.pause(true);setModal('online');}} aria-label={`Room ${online.session.code}`}><Link2 size={13}/>{online.session.code}</button>}
      {isFinished&&!modal&&<div className="result-backdrop"><section className="result-panel" role="dialog" aria-modal="true" aria-label="Match result"><div className={`result-mark player-${winner}`}><span/></div><h2>{resultTitle}</h2><div className="result-score"><span className={`color-${side}`}>{hud.scores[side]}</span><span>–</span><span className={`color-${other}`}>{hud.scores[other]}</span></div>
        <div className="dialog-actions">
          {nextLevel&&<button className="action-primary" onClick={()=>playComputer(nextLevel)}><Cpu size={17}/><span>Play {nextLevel}</span><ArrowRight size={18}/></button>}
          <button className={nextLevel?'action-secondary':'action-primary'} onClick={rematch} disabled={!!(online&&(snapshot?.players[side].ready||friendLeft))}><RotateCcw size={17}/>{online&&snapshot?.players[side].ready?`Waiting for ${friendName}…`:'Play again'}</button>
          <button className="text-button" onClick={home}>Menu</button>
        </div></section></div>}
    </>}

    {modal&&<div className="modal-backdrop"><div className={`modal-panel ${modal==='settings'?'settings-panel':''}`} ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="dialog-title">
      <button className="modal-close icon-button" onClick={modal==='online'&&online?home:modal==='pause'&&(roomClosed||friendLeft)?home:closeModal} aria-label={modal==='online'&&online?'Leave room':'Close'}><X size={20}/></button>
      {modal==='pause'&&(roomClosed?<><h2 id="dialog-title">{online?.lastError===CONNECT_FAILED_MESSAGE?"Couldn't connect":'Room closed'}</h2><p className="dialog-description">{online?.lastError}</p><div className="dialog-actions"><button className="action-primary" onClick={home}><LogOut size={17}/>Back to menu</button></div></>
        :friendLeft?<><h2 id="dialog-title">{friend?.name} left</h2><p className="dialog-description">The match is over. Invite them again or start a new room.</p><div className="dialog-actions"><button className="action-primary" onClick={home}><LogOut size={17}/>Back to menu</button><button className="text-button" onClick={()=>setModal('online')}>Show invite</button></div></>
        :<><h2 id="dialog-title">{online&&networkStatus==='disconnected'?`Waiting for ${friendName}`:online&&networkStatus==='reconnecting'?'Reconnecting…':'Paused'}</h2>{online&&snapshot?.status==='paused'&&snapshot.pausedBy===other&&<p className="dialog-description">{friendName} paused the match.</p>}<div className="dialog-actions"><button className="action-primary" disabled={!!online&&['disconnected','reconnecting','error','waiting'].includes(networkStatus)} onClick={()=>{sound();runtime.current?.pause(false);setModal(null);}}><Play size={18}/>Resume</button><button className="action-secondary" onClick={()=>setModal('settings')}><Settings2 size={17}/>Settings</button><button className="text-button" onClick={home}>{online?'Leave match':'Menu'}</button></div><p className="dialog-footnote">{controlsHelp}</p></>)}
      {modal==='local'&&<><h2 id="dialog-title">Two players</h2><div className="local-choices"><button onClick={()=>playLocal(false)}><Keyboard size={24}/><span><strong>Same keyboard</strong><small>{Object.values(preferences.keys[0]).map(keyLabel).join(' ')} <span> · </span> {Object.values(preferences.keys[1]).map(keyLabel).join(' ')}</small></span><ArrowRight size={19}/></button><button onClick={()=>playLocal(true)}><Hand size={24}/><span><strong>Touch screen</strong><small>One finger each</small></span><ArrowRight size={19}/></button></div></>}
      {modal==='online'&&<>
        <h2 id="dialog-title">{online?'Invite a friend':'Play a friend'}</h2>
        {online?<><p className="dialog-description">Send the link, or share the code.</p><div className="room-code" aria-label={`Room code ${online.session.code}`}>{online.session.code}</div>{canShare?<button className="action-primary" onClick={shareInvite}><Share2 size={17}/><span>Share invite</span></button>:<button className="action-primary" onClick={copyInvite}>{copied?<Check size={17}/>:<Copy size={17}/>}<span>{copied?'Link copied':'Copy invite link'}</span></button>}<div className="lobby-players">{snapshot?.players.map((p,i)=><div key={i}><i className={`player-dot color-${i}`}/><span>{p.present&&!p.left?p.name:'Waiting for a friend'}</span>{p.present&&!p.left?<Check size={14}/>:<LoaderCircle size={14} className="spin"/>}</div>)}</div>{snapshot?.status!=='waiting'&&!friendLeft&&<button className="text-button" onClick={()=>{runtime.current?.pause(false);setModal(null);}}>Back to match</button>}<button className="text-button subdued" onClick={home}>Leave room</button></>:<>
          <div className="room-tabs"><button className={roomTab==='create'?'selected':''} onClick={()=>{setRoomTab('create');setRoomError('');}}>New room</button><button className={roomTab==='join'?'selected':''} onClick={()=>{setRoomTab('join');setRoomError('');}}>Join with code</button></div>
          <form onSubmit={e=>{e.preventDefault();void connect(roomTab);}}><label className="input-label">Your name<input autoComplete="nickname" maxLength={20} value={name} onChange={e=>setName(e.target.value)} placeholder="Player"/></label>{roomTab==='join'&&<label className="input-label">Room code<input className="code-input" autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={7} value={roomCode} onChange={e=>setRoomCode(e.target.value.toUpperCase().replace(/[^A-Z2-9]/g,'').slice(0,6))} placeholder="ABC234"/></label>}{roomTab==='create'&&<div className="room-goal-option"><SelectField label="First to" value={target} onChange={v=>setTarget(Number(v))}>{[3,5,7,11].map(n=><option value={n} key={n}>{n}</option>)}</SelectField></div>}{roomError&&<p className="form-error" role="alert">{roomError}</p>}<button className="action-primary" disabled={busy||!ready||(roomTab==='join'&&roomCode.length!==6)}>{busy?<LoaderCircle className="spin" size={17}/>:<Link2 size={17}/>}<span>{busy?'Connecting…':roomTab==='create'?'Create room':'Join'}</span><ArrowRight size={18}/></button></form>
          {savedSession&&<button className="text-button" disabled={busy} onClick={()=>void connect('reconnect')}><RotateCcw size={14}/>Rejoin {savedSession.code}</button>}
        </>}
      </>}
      {modal==='settings'&&<>
        <h2 id="dialog-title">Settings</h2>{compatibility&&<p className="compatibility-note">Simple graphics. 3D is not available in this browser.</p>}
        <section className="settings-section"><h3>Sound</h3><label className="range-row"><span>Volume</span><input type="range" min="0" max="1" step=".01" aria-label="Volume" value={preferences.volume} onChange={e=>{void runtime.current?.unlock();patch({volume:Number(e.target.value)});}}/><output>{Math.round(preferences.volume*100)}%</output></label><label className="range-row"><span>Ambience</span><input type="range" min="0" max="1" step=".01" aria-label="Ambience" value={preferences.ambience} onChange={e=>{void runtime.current?.unlock();patch({ambience:Number(e.target.value)});}}/><output>{Math.round(preferences.ambience*100)}%</output></label><label className="toggle-row"><span>Mute</span><input type="checkbox" checked={preferences.muted} onChange={e=>patch({muted:e.target.checked})}/></label></section>
        <section className="settings-section"><h3>Display</h3><div className="quality-row"><span>Graphics</span><div className="segmented"><button className={preferences.quality==='high'?'selected':''} onClick={()=>patch({quality:'high'})}>High</button><button className={preferences.quality==='low'?'selected':''} onClick={()=>patch({quality:'low'})}>Fast</button></div></div><label className="toggle-row"><span>Reduce effects</span><input type="checkbox" checked={preferences.reducedMotion} onChange={e=>patch({reducedMotion:e.target.checked})}/></label>{!touchOnly&&<label className="toggle-row"><span>Lock pointer on click<small>Esc releases it.</small></span><input type="checkbox" checked={preferences.pointerLock} onChange={e=>patch({pointerLock:e.target.checked})}/></label>}</section>
        {!touchOnly&&<section className="settings-section keybindings"><div className="section-heading"><h3>Keyboard</h3><button className="inline-reset" onClick={()=>{patch({keys:structuredClone(DEFAULT_PREFERENCES.keys)});setBinding(null);}}>Reset</button></div>{([0,1] as Side[]).map(s=><div className="keybind-row" key={s}><span><i className={`player-dot color-${s}`}/>{s===0?'Blue':'Coral'}</span><div>{(['up','left','down','right'] as Direction[]).map(direction=><button className={binding?.side===s&&binding.direction===direction?'listening':''} key={direction} title={`${s===0?'Blue':'Coral'} ${direction}: ${keyLabel(preferences.keys[s][direction])}`} aria-label={`Change ${s===0?'Blue':'Coral'} ${direction} key`} onClick={()=>setBinding({side:s,direction})}>{binding?.side===s&&binding.direction===direction?'…':keyLabel(preferences.keys[s][direction])}<small>{direction}</small></button>)}</div></div>)}<p className="keybind-note">{binding?'Press a new key. Esc cancels.':'Click a key to change it.'}</p></section>}
        <button className="action-primary" onClick={closeModal}><Check size={17}/>Done</button>
      </>}
    </div></div>}

    {!ready&&!fatal&&<div className="loading-label"><LoaderCircle size={16} className="spin"/>Loading</div>}
    {fatal&&<div className="fatal-message" role="alert"><h2>Graphics unavailable</h2><p>{fatal}</p><button className="action-primary" onClick={()=>location.reload()}><RotateCcw size={16}/>Try again</button></div>}
    {toast&&<div className="toast" role="status">{toast}</div>}
  </main>;
}
