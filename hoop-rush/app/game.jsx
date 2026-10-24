'use client';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, X, Settings2, Volume2, VolumeX, Trophy, Users, Globe2, Pause, Play, RotateCcw, Check, Copy, Share2, ChevronDown, Zap, Target, Radio, Music2, CircleHelp, User } from 'lucide-react';
import { DEFAULT_SETTINGS, readProfile, saveProfile, recordMatch, dailyChallenge } from '../lib/profile';
import { ArcadeAudio } from '../lib/audio';
import { RoomLink, createRoom } from '../lib/online-client';

const INITIAL_UI = { phase:'home',mode:'solo',scores:[0,0],shots:[0,0],made:[0,0],combo:[0,0],remaining:60,duration:60,countdown:3,time:0,overtime:0,aims:[{active:false,power:.58},{active:false,power:.58}] };
const EMPTY_PROFILE = { bests:{},games:0,baskets:0,wins:0,streak:0,bestStreak:0,history:[],leaderboard:[],daily:{},settings:DEFAULT_SETTINGS };
const DIFFICULTIES=['Beginner','Easy','Medium','Hard','Pro'];
const pad=n=>String(Math.max(0,Math.floor(n))).padStart(2,'0');
const ruleName=rule=>({classic:'Classic',time:'Time Attack',challenge:'Challenge'}[rule]||rule);
const cleanCode=value=>value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6);

function BallMark({size=26}) {
  return <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true"><circle cx="16" cy="16" r="13.5" stroke="currentColor" strokeWidth="1.8"/><path d="M2.5 16h27M16 2.5v27M6.5 6.5c12 1.5 17.5 7 19 19M25.5 6.5c-12 1.5-17.5 7-19 19" stroke="currentColor" strokeWidth="1.5"/></svg>;
}
function Dialog({title,children,onClose,wide=false,restoreFocus=true}) {
  const box=useRef(null),close=useRef(onClose);close.current=onClose;
  useEffect(()=>{
    const previous=document.activeElement;
    const focusables=()=>box.current?.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href]')||[];
    if(!matchMedia('(pointer: coarse)').matches)focusables()[0]?.focus();
    const onKey=e=>{if(e.key==='Escape'){e.stopImmediatePropagation();close.current();}if(e.key==='Tab'){const items=focusables();if(!items.length)return;const first=items[0],last=items[items.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}};
    window.addEventListener('keydown',onKey,true);return()=>{window.removeEventListener('keydown',onKey,true);if(restoreFocus)previous?.focus?.();};
  },[restoreFocus]);
  return <div className="modal-backdrop" onPointerDown={e=>{if(e.target===e.currentTarget)onClose();}}><section ref={box} role="dialog" aria-modal="true" aria-label={title} className={`dialog ${wide?'dialog-wide':''}`}><button className="icon-button dialog-close" aria-label="Close" onClick={onClose}><X size={20}/></button><h2>{title}</h2>{children}</section></div>;
}

export default function HoopRush() {
  const sceneHost=useRef(null),inputHost=useRef(null),engine=useRef(null),callbacks=useRef({}),sessionRef=useRef(null),onlineRef=useRef(null),profileRef=useRef(EMPTY_PROFILE),screenRef=useRef('home'),linkRef=useRef(null);
  const [ready,setReady]=useState(false),[graphicsError,setGraphicsError]=useState(''),[screen,setScreen]=useState('home'),[ui,setUi]=useState(INITIAL_UI),[settings,setSettings]=useState(DEFAULT_SETTINGS),[profile,setProfile]=useState(EMPTY_PROFILE);
  const [rule,setRule]=useState('classic'),[duration,setDuration]=useState(60),[difficulty,setDifficulty]=useState('Medium'),[challenge,setChallenge]=useState('moving'),[daily,setDaily]=useState(null),[touch,setTouch]=useState(false);
  const [modal,setModal]=useState(null),[result,setResult]=useState(null),[basket,setBasket]=useState([null,null]),[hint,setHint]=useState(''),[session,setSession]=useState(null),[online,setOnline]=useState(null),[roomCode,setRoomCode]=useState(''),[name,setName]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[copied,setCopied]=useState(false),[connection,setConnection]=useState(''),[historyTab,setHistoryTab]=useState('recent');
  const hintTimeout=useRef(null),basketTimers=useRef([null,null]),onlineOffset=useRef(0),lastConfig=useRef(null),settingsRef=useRef(settings);
  const best=Math.max(0,...Object.values(profile.bests).filter(Number.isFinite));
  const playing=screen==='play';
  profileRef.current=profile;sessionRef.current=session;screenRef.current=screen;onlineRef.current=online;settingsRef.current=settings;

  callbacks.current={
    onState:setUi,
    onBasket:event=>{setBasket(old=>old.map((x,i)=>i===event.lane?{...event,id:Date.now()}:x));clearTimeout(basketTimers.current[event.lane]);basketTimers.current[event.lane]=setTimeout(()=>setBasket(old=>old.map((x,i)=>i===event.lane?null:x)),1000);},
    onHint:value=>{setHint(value);clearTimeout(hintTimeout.current);hintTimeout.current=setTimeout(()=>setHint(''),2600);},
    onResult:value=>{const saved=recordMatch({...profileRef.current,settings:settingsRef.current},value);setProfile(saved.profile);profileRef.current=saved.profile;setResult({...value,...saved});setScreen('results');setHint('');},
    onShot:shot=>{const state=onlineRef.current;return linkRef.current?.send({t:'shot',...shot,round:state?.round,overtime:state?.overtime})??false;},
    onOnlinePause:()=>setModal('settings'),
  };

  useEffect(()=>{
    const p=readProfile();setProfile(p);profileRef.current=p;setSettings(p.settings);setDaily(dailyChallenge());
    setTouch(matchMedia('(pointer: coarse)').matches);
    const query=new URLSearchParams(location.search),room=cleanCode(query.get('room')||'');
    if(room){
      setRoomCode(room);setScreen('friend');
      let saved=null;try{saved=JSON.parse(sessionStorage.getItem(`hoop-room:${room}`)||'null');}catch{}
      if(saved?.token)connect({room,token:saved.token});
    }
    let alive=true,game;
    Promise.all([import('../lib/scene'),import('../lib/game-engine')]).then(async ([{HoopScene},{HoopGame}])=>{
      if(!alive)return;
      let scene;
      try { scene=new HoopScene(sceneHost.current,{onError:e=>setGraphicsError(e.message)}); }
      catch { const {SoftwareHoopScene}=await import('../lib/software-scene');if(!alive)return;scene=new SoftwareHoopScene(sceneHost.current);setGraphicsError(''); }
      const audio=new ArcadeAudio(p.settings);
      game=new HoopGame(scene,audio,Object.fromEntries(['onState','onBasket','onHint','onResult','onShot','onOnlinePause'].map(key=>[key,(...args)=>callbacks.current[key]?.(...args)])));
      game.bindInput(inputHost.current);game.configure(p.settings);engine.current=game;setReady(true);
      if(onlineRef.current&&onlineRef.current.status!=='waiting')receiveOnline(onlineRef.current,true);
    }).catch(e=>{if(alive)setGraphicsError(e.message||'WebGL could not start.');});
    return()=>{alive=false;game?.dispose();engine.current=null;linkRef.current?.stop();clearTimeout(hintTimeout.current);basketTimers.current.forEach(clearTimeout);};
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  useEffect(()=>{engine.current?.configure(settings);saveProfile({...profileRef.current,settings});},[settings]);

  function receiveOnline(state,force=false) {
    const current=sessionRef.current;if(!current||state.room!==current.room)return;
    const previous=onlineRef.current;
    if(!force&&previous?.room===state.room&&previous.serverNow>state.serverNow)return;
    const other=1-current.seat,before=previous?.players?.[other],after=state.players?.[other];
    if(before&&!before.left&&(!after||after.left))setNotice('Your friend left.');
    else if(after&&!after.left&&(!before||before.left))setNotice('');
    setOnline(state);onlineRef.current=state;
    if(state.status==='waiting'){if(screenRef.current!=='results')setScreen('lobby');}
    else if(engine.current){
      if(engine.current.mode!=='online'||engine.current.phase==='home')engine.current.startOnline(current.seat,state,onlineOffset.current);
      else engine.current.applyOnline(state,onlineOffset.current);
      if(state.status!=='finished')setScreen('play');
    }
  }
  function endRoom(message) {
    const s=sessionRef.current;if(s)try{sessionStorage.removeItem(`hoop-room:${s.room}`);}catch{}
    linkRef.current=null;sessionRef.current=null;setSession(null);setOnline(null);onlineRef.current=null;setConnection('');setBusy(false);setNotice('');
    if(message){setError(message);setScreen('friend');screenRef.current='friend';setModal(null);engine.current?.home();}
  }
  function connect({room,token=null,name:playerName=''}) {
    linkRef.current?.stop();
    const link=new RoomLink({room,token,name:playerName,
      onOffset:value=>{onlineOffset.current=value;},
      onStatus:status=>{if(linkRef.current!==link)return;setConnection(status==='reconnecting'?'Reconnecting…':'');if(engine.current)engine.current.connected=status==='open';},
      onWelcome:(s,state)=>{
        if(linkRef.current!==link)return;
        sessionRef.current=s;setSession(s);try{sessionStorage.setItem(`hoop-room:${s.room}`,JSON.stringify(s));}catch{}
        history.replaceState({},'',`?room=${s.room}`);setBusy(false);setError('');setRoomCode(s.room);
        receiveOnline(state,true);
      },
      onState:state=>{if(linkRef.current===link)receiveOnline(state);},
      onNack:data=>{
        if(linkRef.current!==link)return;
        if(data.action==='shot'){engine.current?.rejectShot(data.id);return;}
        setError(data.message);setBusy(false);
      },
      onEnd:(status,message)=>{if(linkRef.current===link)endRoom(message);},
    });
    linkRef.current=link;link.start();
  }
  async function create() {
    setBusy(true);setError('');setNotice('');engine.current?.audio.unlock();
    try{
      const data=await createRoom(name.trim());
      const s={room:data.room,token:data.token,seat:data.seat};sessionRef.current=s;setSession(s);
      try{sessionStorage.setItem(`hoop-room:${s.room}`,JSON.stringify(s));}catch{}
      setOnline(data.state);onlineRef.current=data.state;history.replaceState({},'',`?room=${s.room}`);setScreen('lobby');setCopied(false);
      connect({room:s.room,token:s.token});
    }catch(e){setError(e.message||'Could not start a room. Try again.');setBusy(false);}
  }
  function join() {
    const code=cleanCode(roomCode);
    if(code.length!==6){setError('Room codes have 6 letters or numbers.');return;}
    setBusy(true);setError('');setNotice('');engine.current?.audio.unlock();
    let saved=null;try{saved=JSON.parse(sessionStorage.getItem(`hoop-room:${code}`)||'null');}catch{}
    connect(saved?.token?{room:code,token:saved.token}:{room:code,name:name.trim()});
  }
  function sendRoom(t) {setError('');engine.current?.audio.unlock();if(!linkRef.current?.send({t}))setError('Reconnecting. Try again in a moment.');}
  async function shareInvite() {
    const link=`${location.origin}/?room=${session.room}`;
    if(touch&&navigator.share){try{await navigator.share({title:'Hoop Rush',url:link});return;}catch(e){if(e?.name==='AbortError')return;}}
    try{await navigator.clipboard.writeText(link);setCopied(true);setTimeout(()=>setCopied(false),2000);}catch{setError(link);}
  }
  function goHome() {
    if(linkRef.current){linkRef.current.stop(true);}
    endRoom('');setScreen('home');screenRef.current='home';setResult(null);setModal(null);setError('');setHint('');setBasket([null,null]);engine.current?.home();if(typeof history!=='undefined')history.replaceState({},'','/');
  }
  function start(mode='computer',dailyGame=false) {
    if(!ready)return;const config={mode,rule:dailyGame?'challenge':rule,duration:rule==='time'&&!dailyGame?duration:60,difficulty,challenge:dailyGame?daily.challenge:challenge,...(dailyGame?{daily}:{})};lastConfig.current=config;setScreen('play');screenRef.current='play';setResult(null);setBasket([null,null]);setHint('');setError('');engine.current.start(config);document.activeElement?.blur?.();
  }
  function replay() {if(result?.mode==='online'){sendRoom('rematch');return;}setResult(null);setBasket([null,null]);setScreen('play');engine.current.start(lastConfig.current);document.activeElement?.blur?.();}
  function openModal(value) {if(playing&&engine.current?.mode!=='online')engine.current?.pause();setModal(value);}
  function closeModal() {setModal(null);if(engine.current?.phase==='paused')engine.current.resume();}
  function updateSetting(key,value) {setSettings(s=>({...s,[key]:value}));}

  const seat=session?.seat||0,friend=online?.players?.[1-seat],me=online?.players?.[seat];
  const opponentName=ui.mode==='local'?'P2':ui.mode==='online'?(friend?.name||'Friend'):difficulty;
  const hasOpponent=ui.mode!=='solo',ownName=ui.mode==='local'?'P1':'You';
  const friendGone=!friend||friend.left;
  const resultTitle=!result?'':result.mode==='solo'?'Round over':result.winner===null?'Draw':result.mode==='local'?`Player ${result.winner===0?1:2} wins`:result.winner===0?'You win':'You lose';
  const statusLine=ui.overtime?'Overtime':ui.bonus?'Double points':ui.phase==='playing'&&ui.remaining<=10&&!ui.overtime?'3 points':'';
  const showTip=ui.shots[0]<3&&ui.phase==='playing';

  return <main className={`arcade-app screen-${screen} ${playing?'is-playing':''} ${ui.mode==='local'&&playing?'is-local':''} ${touch?'is-touch':''}`}>
    <div className="scene-host" ref={sceneHost}/><div className="scene-vignette"/><div className="home-shade"/>
    <div ref={inputHost} className={`shoot-layer ${playing&&!modal&&ui.phase==='playing'?'active':''}`} role="application" aria-label="Court. Drag up and release to shoot."/>
    <header className="topbar">
      {screen!=='home'?<button className="brand" onClick={()=>{if(playing)openModal('exit');else goHome();}} aria-label="Hoop Rush menu"><BallMark/><span>HOOP<span className="brand-light">RUSH</span></span></button>:<span/>}
      <div className="header-actions">
        {screen==='home'&&<><button className="personal-best" onClick={()=>openModal('stats')} aria-label={`Best ${best}. Stats`}><Trophy size={17}/><strong>{pad(best)}</strong></button><button className="icon-button" onClick={()=>openModal('controls')} aria-label="Controls"><CircleHelp size={19}/></button></>}
        <button className="icon-button" onClick={()=>{engine.current?.audio.unlock();updateSetting('muted',!settings.muted);}} aria-label={settings.muted?'Sound on':'Sound off'}>{settings.muted?<VolumeX size={19}/>:<Volume2 size={19}/>}</button>
        <button className="icon-button" onClick={()=>playing?engine.current?.pause():openModal('settings')} aria-label={playing?'Pause':'Settings'}>{playing?<Pause size={19}/>:<Settings2 size={19}/>}</button>
      </div>
    </header>
    {graphicsError&&<div className="graphics-error"><BallMark size={40}/><h2>Graphics could not start</h2><p>Turn on hardware acceleration, then reload.</p><button className="button primary" onClick={()=>location.reload()}>Reload<RotateCcw size={18}/></button></div>}

    {screen==='home'&&!graphicsError&&<section className="home-content">
      <h1>HOOP<span>RUSH</span></h1><p className="home-description">{touch?'Swipe up to shoot.':'Drag up and release to shoot.'}</p>
      <div className="play-options">
        <div className="mode-tabs" role="tablist" aria-label="Game mode">{[['classic','Classic'],['time','Time Attack'],['challenge','Challenge']].map(([value,label])=><button key={value} role="tab" aria-selected={rule===value} className={rule===value?'selected':''} onClick={()=>setRule(value)}>{label}</button>)}</div>
        <div className="mode-config">{rule==='time'?<><span>Time</span><div className="duration-switch">{[30,60,90].map(n=><button key={n} className={duration===n?'selected':''} onClick={()=>setDuration(n)}>{n}s</button>)}</div></>:rule==='challenge'?<><span>Challenge</span><label className="select-wrap"><select aria-label="Challenge" value={challenge} onChange={e=>setChallenge(e.target.value)}><option value="moving">Moving hoop</option><option value="precision">Smaller rim</option><option value="distance">Long shot</option></select><ChevronDown size={14}/></label></>:<><span>Computer</span><label className="select-wrap"><span className="difficulty-bars" aria-hidden="true">{[1,2,3,4,5].map(n=><i key={n} className={DIFFICULTIES.indexOf(difficulty)>=n-1?'lit':''} style={{height:5+n*2}}/>)}</span><select aria-label="Computer level" value={difficulty} onChange={e=>setDifficulty(e.target.value)}>{DIFFICULTIES.map(d=><option key={d}>{d}</option>)}</select><ChevronDown size={14}/></label></>}</div>
        <button className="button primary play-primary" onClick={()=>start('computer')} disabled={!ready}><span>{ready?'Play computer':'Loading…'}</span><Play size={20}/></button>
        <div className="secondary-play">
          <button className="button secondary" onClick={()=>start('solo')} disabled={!ready}><User size={17}/>Solo</button>
          <button className="button secondary" onClick={()=>openModal('local')} disabled={!ready}><Users size={17}/>Local</button>
          <button className="button secondary" onClick={()=>{setScreen('friend');setError('');setNotice('');}} disabled={!ready}><Globe2 size={17}/>Online</button>
        </div>
        <button className="daily-teaser" onClick={()=>start('solo',true)} disabled={!ready||!daily}><Zap size={17}/><span>Daily</span><strong>{daily?.title||''}</strong><span className="daily-target">{daily?`${daily.target} pts`:''}</span></button>
      </div>
    </section>}

    {(screen==='friend'||screen==='lobby')&&!graphicsError&&<section className="online-panel"><button className="back-link" onClick={goHome}><ArrowLeft size={17}/>Menu</button><h1>{screen==='friend'?'Online':'Room'}</h1>
      {screen==='friend'?<div className="room-form">
        <label className="field-label" htmlFor="player-name">Name</label><input id="player-name" maxLength={18} placeholder="Player" value={name} onChange={e=>setName(e.target.value)} autoComplete="nickname"/>
        <button className="button primary" disabled={busy||!ready} onClick={create}>{busy?'Connecting…':'Create room'}<Play size={19}/></button>
        <div className="or-divider"><span/>or join<span/></div>
        <form className="join-form" onSubmit={e=>{e.preventDefault();join();}}><input aria-label="Room code" placeholder="CODE" value={roomCode} maxLength={6} autoCapitalize="characters" autoComplete="off" spellCheck={false} onChange={e=>setRoomCode(cleanCode(e.target.value))}/><button className="button secondary" type="submit" disabled={busy||roomCode.length<6||!ready}>Join</button></form>
      </div>:<div className="lobby-content">
        <div className="room-code"><div><span className="field-label">Code</span><strong>{session?.room}</strong></div><button className="button secondary invite-button" onClick={shareInvite}>{copied?<Check size={18}/>:touch&&typeof navigator!=='undefined'&&navigator.share?<Share2 size={18}/>:<Copy size={18}/>}{copied?'Copied':touch&&typeof navigator!=='undefined'&&navigator.share?'Share link':'Copy link'}</button></div>
        <div className="lobby-players">{[0,1].map(i=>{const p=online?.players?.[i];const here=p&&!p.left;return <div key={i} className={`lobby-player seat-${i} ${here?'joined':''}`}><div className="player-avatar">{here?<BallMark size={24}/>:<Users size={21}/>}</div><strong>{here?p.name:'Waiting…'}</strong><span>{here&&p.ready?<><Check size={14}/>Ready</>:here&&!p.connected?'Away':i===seat?'You':''}</span></div>;})}</div>
        <button className="button primary" disabled={busy||!!me?.ready} onClick={()=>sendRoom('ready')}><span>{me?.ready?(friendGone?'Waiting for a friend':'Waiting for your friend'):'Ready'}</span>{me?.ready?<Check size={20}/>:<Play size={19}/>}</button>
      </div>}
      {notice&&<p className="notice-note">{notice}</p>}{error&&<p className="inline-error" role="alert">{error}</p>}{connection&&<p className="connection-note"><Radio size={14}/>{connection}</p>}
    </section>}

    {playing&&!graphicsError&&<>
      <section className={`scoreboard ${hasOpponent?'versus':''}`} aria-label="Score"><div className="score-block your-score"><span>{ownName}</span><strong key={ui.scores[0]}>{pad(ui.scores[0])}</strong>{ui.combo[0]>=3&&<small className="combo-label"><Zap size={11}/>{ui.combo[0]}×</small>}</div><div className={`timer-block ${ui.remaining<=10?'urgent':''}`}><strong>{pad(Math.ceil(ui.remaining))}</strong><div className="timer-track"><i style={{transform:`scaleX(${Math.max(0,ui.remaining/ui.duration)})`}}/></div></div>{hasOpponent?<div className="score-block opponent-score"><span>{opponentName}</span><strong key={ui.scores[1]}>{pad(ui.scores[1])}</strong>{ui.mode==='online'&&friend&&!friend.connected&&!friend.left&&<small className="opponent-away">Away</small>}</div>:<div className="solo-record"><Trophy size={14}/><strong>{pad(profile.bests[`${ui.rule}${ui.rule==='challenge'?'-'+ui.challenge:''}-${ui.duration}`]||0)}</strong></div>}</section>
      {statusLine&&<div className="game-rule-label"><span className="live-dot"/>{statusLine}</div>}
      {ui.phase==='countdown'&&<div className="countdown-overlay" key={ui.countdown}>{ui.overtime>0&&<span>Overtime</span>}<strong>{ui.countdown}</strong></div>}
      {ui.phase==='settling'&&<div className="buzzer-overlay"><strong>Time</strong></div>}
      {basket.map((b,lane)=>b&&<div className={`basket-popup popup-${lane} ${ui.mode==='local'?'local':''}`} key={`${lane}-${b.id}`}><strong>+{b.points}</strong>{(b.swish||b.combo>=3)&&<span>{b.swish?'Swish':`${b.combo} in a row`}</span>}</div>)}
      {ui.mode==='local'&&<div className="split-divider"/>}
      <div className={`shot-guidance ${ui.mode==='local'?'dual':''}`}>{[0,...(ui.mode==='local'?[1]:[])].map(lane=><div className={`player-guidance lane-${lane}`} key={lane}>{ui.aims[lane]?.active?<div className="power-control"><div className="power-meter"><span className="power-sweet"/><i style={{width:`${ui.aims[lane].power*100}%`}}/><b style={{left:`${ui.aims[lane].power*100}%`}}/></div><strong>{Math.round(ui.aims[lane].power*100)}<small>%</small></strong></div>:showTip&&<div className="shot-tip"><span>{touch?'Swipe up':'Drag up, release'}</span>{!touch&&<span className="keyboard-tip">{ui.mode==='local'?lane===0?<>or <kbd>SPACE</kbd></>:<>or <kbd>ENTER</kbd></>:<>or hold <kbd>SPACE</kbd></>}</span>}</div>}</div>)}</div>
      {hint&&<div className="help-hint">{hint}</div>}{connection&&<div className="game-connection"><Radio size={14}/>{connection}</div>}
    </>}

    {screen==='results'&&result&&<section className="results-panel"><h1>{resultTitle}</h1><div className={`result-scores ${result.mode!=='solo'?'result-versus':''}`}><div><strong>{pad(result.scores[0])}</strong><span>{result.mode==='local'?'Player 1':'You'}</span></div>{result.mode!=='solo'&&<><span className="result-dash">–</span><div className="result-opponent"><strong>{pad(result.scores[1])}</strong><span>{result.mode==='local'?'Player 2':result.mode==='online'?friend?.name||'Friend':result.difficulty}</span></div></>}</div>
      {result.newBest&&<div className="new-best"><Trophy size={15}/>New best</div>}
      {result.mode==='online'&&(result.resultReason==='forfeit'||friendGone)&&result.winner===0&&<p className="notice-note">Your friend left.</p>}
      {result.mode==='online'&&result.resultReason==='disconnect'&&!friendGone&&<p className="notice-note">{result.winner===0?'Your friend lost connection.':'You lost connection.'}</p>}
      {result.daily&&<div className={`daily-result ${result.scores[0]>=result.daily.target?'complete':''}`}><Target size={16}/>{result.scores[0]>=result.daily.target?'Daily done':`${result.daily.target-result.scores[0]} points to go`}<span>{result.daily.target} pts</span></div>}
      <div className="result-stats"><div><strong>{result.made[0]}<small>/{result.shots[0]}</small></strong><span>Baskets</span></div><div><strong>{result.shots[0]?Math.round(result.made[0]/result.shots[0]*100):0}<small>%</small></strong><span>Accuracy</span></div><div><strong>{result.maxCombo[0]}<small>×</small></strong><span>Best streak</span></div></div>{result.unlocked&&<p className="unlock-note"><BallMark size={16}/>{result.unlocked}</p>}
      {!(result.mode==='online'&&friendGone)&&<button className="button primary" onClick={replay} disabled={busy||(result.mode==='online'&&(!!me?.ready||!session))}>{result.mode==='online'&&me?.ready?'Waiting for your friend':'Play again'}<RotateCcw size={19}/></button>}
      <button className={result.mode==='online'&&friendGone?'button primary':'back-link result-home'} onClick={goHome}>{!(result.mode==='online'&&friendGone)&&<ArrowLeft size={16}/>}Menu</button>{error&&<p className="inline-error" role="alert">{error}</p>}{connection&&<p className="connection-note"><Radio size={14}/>{connection}</p>}
    </section>}

    {playing&&ui.phase==='paused'&&!modal&&<Dialog restoreFocus={false} title="Paused" onClose={()=>engine.current?.resume()}><div className="pause-actions"><button className="button primary" onClick={()=>engine.current?.resume()}>Resume<Play size={19}/></button><button className="button secondary" onClick={()=>setModal('settings')}><Settings2 size={18}/>Settings</button><button className="button secondary" onClick={()=>setModal('controls')}><CircleHelp size={18}/>Controls</button><button className="text-button" onClick={goHome}>Quit</button></div></Dialog>}

    {modal==='settings'&&<Dialog restoreFocus={!playing} title="Settings" onClose={closeModal}>
      {playing&&ui.mode==='online'&&<p className="online-clock-note">The match keeps running.</p>}
      <div className="settings-section"><h3>Sound</h3><div className="setting-row"><label htmlFor="fx-volume"><Volume2 size={17}/>Effects</label><input id="fx-volume" type="range" min="0" max="1" step=".05" value={settings.effects} onChange={e=>updateSetting('effects',Number(e.target.value))}/></div><div className="setting-row"><label htmlFor="music-toggle"><Music2 size={17}/>Music</label><button id="music-toggle" role="switch" aria-checked={settings.musicOn} aria-label="Music" className={`toggle ${settings.musicOn?'on':''}`} onClick={()=>{engine.current?.audio.unlock();updateSetting('musicOn',!settings.musicOn);}}><span/></button></div>{settings.musicOn&&<div className="setting-row"><label htmlFor="music-volume">Music volume</label><input id="music-volume" type="range" min="0" max="1" step=".05" value={settings.music} onChange={e=>updateSetting('music',Number(e.target.value))}/></div>}</div>
      <div className="settings-section"><h3>Venue</h3><div className="theme-options">{[['midnight','Night'],['sunset','Sunset'],['ice','Blue']].map(([value,label])=><button className={`theme-option ${settings.theme===value?'selected':''}`} key={value} onClick={()=>updateSetting('theme',value)}><span className={`theme-swatch ${value}`}>{settings.theme===value&&<Check size={16}/>}</span><span>{label}</span></button>)}</div></div>
      <div className="settings-section"><h3>Ball</h3><div className="skin-options">{[['classic','Original',true,''],['arctic','Arctic',profile.baskets>=20,'20 baskets'],['midnight','Midnight',profile.games>=5,'5 rounds']].map(([value,label,unlocked,requirement])=><button key={value} className={`skin-option ${settings.skin===value?'selected':''}`} disabled={!unlocked} onClick={()=>updateSetting('skin',value)}><span className={`skin-ball ${value}`}><BallMark size={31}/></span><span>{label}</span>{!unlocked&&<small>{requirement}</small>}</button>)}</div></div>
      <div className="setting-row quality-setting"><label htmlFor="quality">Graphics</label><label className="select-wrap"><select id="quality" value={settings.quality} onChange={e=>updateSetting('quality',e.target.value)}><option value="auto">Auto</option><option value="high">High</option><option value="low">Low</option></select><ChevronDown size={14}/></label></div>
    </Dialog>}

    {modal==='controls'&&<Dialog title="Controls" onClose={closeModal}>
      {touch?<div className="control-method"><div><h3>Swipe up</h3><p>Swipe length sets power. Swipe left or right to aim. In local play, each player uses their half.</p></div></div>:<><div className="control-method"><div><h3>Mouse</h3><p>Drag up for power, sideways to aim, release to shoot.</p></div></div><div className="control-method"><div><h3>Keyboard</h3><p>Hold <kbd>SPACE</kbd> and release. <kbd>A</kbd> <kbd>D</kbd> aim. <kbd>ESC</kbd> pauses.</p></div></div><div className="control-method"><div><h3>Player 2</h3><p>Hold <kbd>ENTER</kbd> and release. <kbd>←</kbd> <kbd>→</kbd> aim.</p></div></div></>}
      <div className="rules-strip"><span>Basket <strong>2</strong></span><span>Last 10 s <strong>3</strong></span><span>Tie <strong>Overtime</strong></span></div>
    </Dialog>}
    {modal==='local'&&<Dialog title="Local" onClose={closeModal}>{touch?<p className="dialog-description">Each player swipes on their half of the screen.</p>:<div className="local-controls"><div><span className="player-indicator orange"/><h3>Player 1</h3><p><kbd>A</kbd><kbd>D</kbd><span>Aim</span></p><p><kbd>SPACE</kbd><span>Shoot</span></p></div><div><span className="player-indicator cyan"/><h3>Player 2</h3><p><kbd>←</kbd><kbd>→</kbd><span>Aim</span></p><p><kbd>ENTER</kbd><span>Shoot</span></p></div></div>}<button className="button primary" onClick={()=>{setModal(null);start('local');}}>Start<Play size={19}/></button></Dialog>}
    {modal==='stats'&&<Dialog title="Stats" onClose={closeModal} wide><div className="profile-stats"><div><strong>{pad(best)}</strong><span>Best</span></div><div><strong>{profile.baskets}</strong><span>Baskets</span></div><div><strong>{profile.bestStreak}</strong><span>Win streak</span></div></div><div className="mode-tabs history-tabs"><button className={historyTab==='recent'?'selected':''} onClick={()=>setHistoryTab('recent')}>Recent</button><button className={historyTab==='best'?'selected':''} onClick={()=>setHistoryTab('best')}>Top scores</button></div>{(historyTab==='recent'?profile.history:profile.leaderboard).length?<div className="history-list">{(historyTab==='recent'?profile.history:profile.leaderboard).slice(0,7).map((item,i)=><div className="history-row" key={item.id}><span className="history-index">{i+1}</span><div><strong>{ruleName(item.rule)}</strong><small>{item.mode==='solo'?'Solo':item.mode==='computer'?item.difficulty:item.mode==='local'?'Local':'Online'} · {item.accuracy}%</small></div><strong className="history-score">{item.score}{item.opponent!==null&&<small> – {item.opponent}</small>}</strong></div>)}</div>:<div className="empty-stats"><Trophy size={28}/><p>No rounds yet.</p></div>}</Dialog>}
    {modal==='exit'&&<Dialog restoreFocus={false} title="Leave the round?" onClose={closeModal}><p className="dialog-description">{ui.mode==='online'?'Your friend wins if you leave.':'This round will not be saved.'}</p><div className="pause-actions"><button className="button primary" onClick={closeModal}>Stay<Play size={18}/></button><button className="text-button" onClick={goHome}>Leave</button></div></Dialog>}
  </main>;
}
