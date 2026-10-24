import { randomBytes } from 'node:crypto';
import { getChoices, matches, almost, normalize } from './prompts.mjs';
import { t, modifierText, lang as validLang } from './i18n.mjs';
import { verifyCode, normalizeCode, validSecret, expand, owns, PAID_PACKS, PAID_MODES, BRUSHES } from './store.mjs';
const id = (n=8) => randomBytes(n).toString('hex');
const clean = (v,n) => typeof v === 'string' ? v.replace(/[\x00-\x1f\x7f<>]/g,'').trim().slice(0,n) : '';
// Errors carry a message id; handle() turns it into the player's language.
const error = (key,vars) => { const e=new Error(key); e.key=key; e.vars=vars; throw e; };
const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
const DEFAULTS = { mode:'chaos', rounds:2, seconds:75, pack:'mix', custom:[], safe:false, visible:false };
// Open matches with strangers: fixed, office-safe settings that work from two players.
const PUBLIC_SETTINGS = { mode:'chaos', rounds:1, seconds:75, pack:'mix', custom:[], safe:true, visible:false };
export const PRIVATE_MAX = 12, PUBLIC_MAX = 8;
export const AUTOSTART_MS = { many:10000, two:25000 }, RESULTS_MS = 10000, VOTE_MS = 60000;
// An open match where nobody has done anything for this long pauses instead of looping on its own (keeps the server asleep).
export const IDLE_MS = 600000;
const FREE_MODES = ['classic','chaos','coop','studio'], FREE_PACKS = ['mix','easy','chaos','swedish','nerd'];
// Snabbrunda: short turns, twice the rounds, and a bonus for guessing within ten seconds.
export const SPEED = { choose:8000, draw:30000, reveal:3500, fastMs:10000, bonus:150 };
// Telefonleken: everyone starts a chain by writing, then the chains rotate: draw, guess, draw… Each step has its own private canvas.
export const TEL = { write:45000, guess:35000, show:6000, points:5000 };
const TEL_PHASES = ['twrite','tdraw','tguess'], PLAY_PHASES = ['choosing','drawing','reveal',...TEL_PHASES,'treveal'];
const MODIFIERS = [{id:'tiny',duration:10000},{id:'mono',duration:10000},{id:'mirror',duration:8000},{id:'blind',duration:8000},{id:'shake',duration:7000}];
export class Game {
  constructor({ now=()=>Date.now(), secret='' }={}) { this.now=now; this.rooms=new Map(); this.sessions=new Map(); this.secret=validSecret(secret); }
  send(p,type,data={}) { p.peer?.send({type,data}); }
  broadcast(r,type,data) { for (const p of r.players.values()) this.send(p,type,data); }
  online(r) { return [...r.players.values()].filter(p=>p.connected); }
  room(p) { const r=this.rooms.get(p.room); if (!r) error('notInRoom'); return r; }
  tr(r,key,vars) { return t(r.lang,key,vars); }
  isHost(p,r) { return !r.public && r.host===p.id; }
  max(r) { return r.public?PUBLIC_MAX:PRIVATE_MAX; }
  connect(peer,token,{network=null,lang}={}) {
    let p = typeof token==='string' ? this.sessions.get(token) : null;
    if (!p) { p={id:id(5),token:id(24),name:t(lang,'defaultName'),avatar:0,score:0,connected:true,peer:null,room:null,spectator:false,lastSeen:this.now(),limits:new Map(),lang:'sv',owned:new Set()}; this.sessions.set(p.token,p); }
    const old=p.peer; p.peer=peer; p.connected=true; p.disconnectedAt=0; p.lastSeen=this.now(); p.network=network||null; p.lobbyKey='';
    if(validLang(lang)) p.lang=lang;
    if(old && old!==peer) { old.send({type:'replaced',data:{}}); old.close(); }
    this.send(p,'welcome',{token:p.token,id:p.id,serverTime:this.now(),room:p.room});
    const r=this.rooms.get(p.room);
    if(r) { if(!r.host || !r.players.get(r.host)?.connected) r.host=p.id; this.stateAll(r); this.sendBoard(p,r); this.sendChain(p,r); }
    else { p.room=null; this.sendRooms(p); }
    return p;
  }
  disconnect(p,peer) {
    if(p.peer!==peer) return;
    p.peer=null; p.connected=false; p.disconnectedAt=this.now(); p.lastSeen=this.now();
    const r=this.rooms.get(p.room); if(!r)return;
    if(r.host===p.id) r.host=this.online(r)[0]?.id || p.id;
    this.stateAll(r);
  }
  limit(p,key,count,window=1000) {
    const now=this.now(); let l=p.limits.get(key);
    if(!l || now-l.start>=window){l={start:now,count:0};p.limits.set(key,l);}
    if(++l.count>count) error('slowDown');
  }
  /** Returns the result, or a Promise for async messages (code redemption). Errors arrive in the player's language either way. */
  handle(p,type,data={}) {
    const fail=e=>{ if(e.key) e.message=t(p.lang,e.key,e.vars); throw e; };
    try { const out=this.dispatch(p,type,data); return out instanceof Promise?out.catch(fail):out; }
    catch(e) { fail(e); }
  }
  dispatch(p,type,data) {
    p.lastSeen=this.now(); this.limit(p,'all',220);
    if(!data || typeof data!=='object' || Array.isArray(data)) error('invalid');
    if(type==='ping') return {serverTime:this.now()};
    if(type==='rooms') return {rooms:this.listRooms(p)};
    if(type==='lang') return this.setLang(p,data);
    if(type==='create') return this.create(p,data);
    if(type==='join') return this.join(p,data);
    if(type==='quick') return this.quick(p,data);
    if(type==='redeem') return this.redeem(p,data);
    if(type==='leave') { this.leave(p); return {}; }
    const r=this.room(p); r.lastActive=this.now();
    switch(type){
      case 'sync': this.send(p,'state',this.view(r,p));this.sendBoard(p,r);this.sendChain(p,r);return {};
      case 'settings': return this.settings(p,r,data);
      case 'start': return this.start(p,r);
      case 'lobby': if(!this.isHost(p,r))error('hostEnd'); this.toLobby(r); return {};
      case 'choose': return this.choose(p,r,data);
      case 'guess': return this.guess(p,r,data);
      case 'stroke.begin': case 'stroke.points': case 'stroke.end': return this.draw(p,r,type,data);
      case 'undo': return this.undo(p,r,data);
      case 'clear': return this.clear(p,r,data);
      case 'cursor': return this.cursor(p,r,data);
      case 'react': return this.react(p,r,data);
      case 'kick': return this.kick(p,r,data);
      case 'vote': return this.vote(p,r,data);
      case 'tsubmit': return this.telSubmit(p,r,data);
      case 'tdone': return this.telDone(p,r);
      case 'tnext': if(!this.isHost(p,r))error('hostEnd'); if(r.phase!=='treveal')error('telNotNow'); this.telNext(r); return {};
      default: error('unknown');
    }
  }
  /** Ritkaos+: verifies codes the client kept in localStorage. Only server-verified codes count; the client's own claims never do. */
  async unlock(p,codes) {
    const list=[...new Set((Array.isArray(codes)?codes:[]).slice(0,40).map(normalizeCode).filter(Boolean))].slice(0,20);
    let added=false;
    for(const code of list){const products=await verifyCode(this.secret,code);if(products)for(const id of products)if(!p.owned.has(id)){p.owned.add(id);added=true;}}
    this.send(p,'owned',{products:expand(p.owned),ready:!!this.secret});
    const r=this.rooms.get(p.room);if(added&&r)this.stateAll(r);
    return expand(p.owned);
  }
  async redeem(p,data) {
    this.limit(p,'redeem',6,60000);
    if(!this.secret)error('codesOff');
    const code=normalizeCode(data.code);if(!code)error('badCode');
    const products=await verifyCode(this.secret,code);if(!products)error('badCode');
    return {products:await this.unlock(p,[code]),added:products};
  }
  /** Packs and modes follow the host: if the host owns one, everyone in the private room plays it. Open matches stay free. */
  unlocked(r,id) { const host=r.players.get(r.host); return !r.public&&!!host&&owns(host.owned,id); }
  isLocked(r,settings=r.settings) { return [settings.mode,settings.pack].some(id=>[...PAID_MODES,...PAID_PACKS].includes(id)&&!this.unlocked(r,id)); }
  setLang(p,data) {
    const l=validLang(data.lang); if(!l) error('invalid');
    p.lang=l;
    const r=this.rooms.get(p.room); if(r) this.send(p,'state',this.view(r,p)); else this.sendRooms(p);
    return {};
  }
  profile(p,data,r) {
    let name=clean(data.name,20)||t(p.lang,'defaultName');
    const base=name; let n=2;
    while(r && [...r.players.values()].some(x=>x.id!==p.id&&normalize(x.name)===normalize(name))) name=base.slice(0,16)+' '+n++;
    p.name=name; p.avatar=Number.isInteger(data.avatar)?clamp(data.avatar,0,7):0;
  }
  create(p,data) { return this.openRoom(p,data,{lang:validLang(data.lang)||p.lang,visible:data.visible===true}); }
  openRoom(p,data,{lang,visible=false,isPublic=false}) {
    this.limit(p,'create',4,60000); if(this.rooms.size>=60)error('serverFull');
    this.leave(p);
    const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';let code;
    do {code=Array.from(randomBytes(6),b=>chars[b%chars.length]).join('');} while(this.rooms.has(code));
    const settings=isPublic?{...PUBLIC_SETTINGS,custom:[]}:{...DEFAULTS,custom:[],visible};
    const r={code,host:p.id,players:new Map(),settings,lang,public:isPublic,votes:new Map(),banned:new Set(),autoStartAt:0,phase:'lobby',round:0,slot:-1,turn:0,order:[],artists:[],deadline:0,duration:0,prompt:null,choices:[],used:new Set(),guessed:new Set(),chat:[],lastActive:this.now(),created:this.now(),modifier:null,modifierDone:false,startedAt:0,lastHint:-1};
    this.resetBoard(r); this.profile(p,data); p.room=code;p.score=0;p.spectator=false;r.players.set(p.id,p);this.rooms.set(code,r);
    this.chat(r,this.tr(r,'opened',{name:p.name}));this.stateAll(r);this.sendBoard(p,r);return {room:code};
  }
  join(p,data) {
    this.limit(p,'join',20,60000);
    const code=clean(data.code,12).toUpperCase().replace(/[^A-Z0-9]/g,''); const r=this.rooms.get(code);
    if(!r)error('noRoom');
    return this.enter(p,r,data);
  }
  enter(p,r,data) {
    if(r.banned.has(p.id))error('removedFromMatch');
    if(r.players.size>=this.max(r) && !r.players.has(p.id))error('roomFull',{max:this.max(r)});
    if(p.room===r.code){this.stateAll(r);this.sendBoard(p,r);return {room:r.code};}
    this.leave(p);this.profile(p,data,r);p.room=r.code;p.score=0;p.spectator=PLAY_PHASES.includes(r.phase);r.lastActive=this.now();
    r.players.set(p.id,p); if(!r.players.get(r.host)?.connected)r.host=p.id;
    this.chat(r,this.tr(r,p.spectator?'joinedLate':'joined',{name:p.name}));this.stateAll(r);this.sendBoard(p,r);this.sendChain(p,r);return {room:r.code};
  }
  /** Joins the fullest open match in the player's language that has space, or opens a new one. */
  quick(p,data) {
    this.limit(p,'join',20,60000);
    const lang=validLang(data.lang)||p.lang, current=this.rooms.get(p.room);
    if(current?.public&&current.lang===lang){this.stateAll(current);this.sendBoard(p,current);return {room:current.code};}
    const open=[...this.rooms.values()].filter(r=>r.public&&r.lang===lang&&r.players.size<PUBLIC_MAX&&!r.banned.has(p.id)&&this.online(r).length)
      .sort((a,b)=>this.online(b).length-this.online(a).length||a.created-b.created);
    return open[0]?this.enter(p,open[0],data):this.openRoom(p,data,{lang,isPublic:true});
  }
  leave(p,line='left') {
    const r=this.rooms.get(p.room);p.room=null;p.lobbyKey='';
    if(!r)return;
    r.players.delete(p.id);r.votes.delete(p.id);if(r.host===p.id)r.host=this.online(r)[0]?.id||[...r.players.keys()][0];
    this.chat(r,this.tr(r,line,{name:p.name}));this.stateAll(r);
    if(!r.players.size)this.rooms.delete(r.code);
  }
  settings(p,r,data) {
    if(r.public)error('publicFixed');
    if(!this.isHost(p,r))error('hostSettings');
    // Network visibility can change at any time; game settings only between matches.
    if(data.visible===true||data.visible===false)r.settings.visible=data.visible;
    if(Object.keys(data).some(k=>k!=='visible')&&!['lobby','ended'].includes(r.phase))error('betweenMatches');
    // Paid packs and modes are checked against the host's verified codes before anything changes.
    for(const id of [data.mode,data.pack])if([...PAID_MODES,...PAID_PACKS].includes(id)&&!this.unlocked(r,id))error('locked');
    if([...FREE_MODES,...PAID_MODES].includes(data.mode))r.settings.mode=data.mode;
    if(Number.isInteger(data.rounds))r.settings.rounds=clamp(data.rounds,1,5);
    if([45,60,75,90,120].includes(data.seconds))r.settings.seconds=data.seconds;
    if([...FREE_PACKS,...PAID_PACKS].includes(data.pack))r.settings.pack=data.pack;
    if(data.safe===true||data.safe===false)r.settings.safe=data.safe;
    if(typeof data.custom==='string')r.settings.custom=[...new Set(data.custom.split(/[,\n]/).map(s=>clean(s,60)).filter(Boolean))].slice(0,150);
    this.stateAll(r);return {};
  }
  minPlayers(r) { return ['coop','telephone'].includes(r.settings.mode)?3:r.settings.mode==='studio'?1:2; }
  speed(r) { return r.settings.mode==='speed'; }
  totalRounds(r) { return this.speed(r)?Math.min(10,r.settings.rounds*2):r.settings.rounds; }
  chooseMs(r) { return this.speed(r)?SPEED.choose:16000; }
  revealMs(r) { return this.speed(r)?SPEED.reveal:6500; }
  start(p,r) {
    if(r.public)error('publicAuto');
    if(!this.isHost(p,r))error('hostStart');
    if(!['lobby','ended'].includes(r.phase))error('started');
    // A new host may not own what the previous host picked.
    if(this.isLocked(r))error('locked');
    const min=this.minPlayers(r);
    if(this.online(r).length<min)error('minPlayers',{min});
    this.begin(r);return {};
  }
  begin(r) {
    const active=this.online(r);
    for(const x of r.players.values()){x.score=0;x.spectator=false;}
    r.order=active.map(x=>x.id);r.round=1;r.slot=-1;r.turn=0;r.used.clear();r.chat=[];r.guessed.clear();r.modifier=null;r.lowSince=0;r.noArtistSince=0;r.autoStartAt=0;r.tel=null;
    if(r.settings.mode==='telephone'){this.telBegin(r);return;}
    if(r.settings.mode==='studio'){r.phase='studio';r.deadline=0;r.artists=[];r.prompt=null;this.resetBoard(r);this.chat(r,this.tr(r,'studio'));this.stateAll(r);return;}
    this.nextTurn(r);
  }
  toLobby(r,line='backInLobby') {r.phase='lobby';r.deadline=0;r.artists=[];r.prompt=null;r.modifier=null;r.tel=null;this.chat(r,this.tr(r,line));this.stateAll(r);}
  nextTurn(r) {
    const active=this.online(r), min=r.settings.mode==='coop'?3:2;
    if(active.length<min){this.pause(r);return;}
    for(const x of active)x.spectator=false;
    for(const x of active)if(!r.order.includes(x.id))r.order.push(x.id);
    let primary;
    for(let tries=0;tries<30;tries++){
      r.slot++;
      if(r.slot>=r.order.length){r.round++;r.slot=0;r.order=active.map(x=>x.id);}
      if(r.round>this.totalRounds(r)){r.phase='ended';r.deadline=r.public?this.now()+RESULTS_MS:0;r.artists=[];r.modifier=null;this.chat(r,this.tr(r,'matchOver'));this.stateAll(r);return;}
      primary=r.players.get(r.order[r.slot]); if(primary?.connected)break;
    }
    if(!primary?.connected){this.pause(r);return;}
    r.turn++;r.artists=[primary.id];
    if(r.settings.mode==='coop'){
      const index=active.findIndex(x=>x.id===primary.id);r.artists.push(active[(index+1)%active.length].id);
    }
    r.phase='choosing';r.deadline=this.now()+this.chooseMs(r);r.prompt=null;r.guessed.clear();r.choices=getChoices(r.settings,r.used,r.lang);
    r.modifier=null;r.modifierDone=false;r.noArtistSince=0;r.lowSince=0;r.lastHint=-1;this.resetBoard(r);
    const second=r.artists.length>1?r.players.get(r.artists[1]).name:'';
    this.chat(r,this.tr(r,second?'drawing2':'drawing1',{a:primary.name,b:second}));this.stateAll(r);
  }
  choose(p,r,data) {
    if(r.phase!=='choosing'||r.artists[0]!==p.id)error('notYourChoice');
    if(!Number.isInteger(data.index)||!r.choices[data.index])error('pickWord');
    this.beginDrawing(r,r.choices[data.index]);return {};
  }
  beginDrawing(r,prompt) {
    r.prompt=prompt;r.used.add(normalize(prompt.answer));r.choices=[];r.phase='drawing';r.startedAt=this.now();r.duration=this.speed(r)?SPEED.draw:r.settings.seconds*1000;r.deadline=r.startedAt+r.duration;
    const indices=Array.from(prompt.answer).map((c,i)=>/[\p{L}\d]/u.test(c)?i:-1).filter(i=>i>=0);
    r.hintIndices=indices.sort(()=>Math.random()-.5);this.stateAll(r);
  }
  hint(r) {
    if(!r.prompt)return '';
    const elapsed=clamp((this.now()-r.startedAt)/r.duration,0,1);
    const count=elapsed>.76?2:elapsed>.48?1:0;
    const shown=new Set((r.hintIndices||[]).slice(0,Math.min(count,Math.floor((r.hintIndices||[]).length/3))));
    return Array.from(r.prompt.answer).map((c,i)=>!/[\p{L}\d]/u.test(c)?c:shown.has(i)?c.toUpperCase():'_').join(' ');
  }
  guess(p,r,data) {
    this.limit(p,'chat',7,5000);
    const text=clean(data.text,160);if(!text)error('writeFirst');
    if(r.phase==='drawing'){
      if(p.spectator)error('fromNextTurn');
      if(r.artists.includes(p.id))error('noSpoilers');
      if(r.guessed.has(p.id))error('alreadyGuessed');
      if(matches(text,r.prompt)){
        const remaining=clamp((r.deadline-this.now())/r.duration,0,1);
        const fast=this.speed(r)&&this.now()-r.startedAt<SPEED.fastMs;
        const points=100+Math.round(remaining*400/10)*10+(r.guessed.size===0?50:0)+(fast?SPEED.bonus:0);
        p.score+=points;r.guessed.add(p.id);
        for(const artist of r.artists){const a=r.players.get(artist);if(a)a.score+=100;}
        this.chat(r,this.tr(r,fast?'correctFast':'correct',{name:p.name,points}),'correct',p.id);
        this.broadcast(r,'effect',{kind:'correct',player:p.id,name:p.name,points,fast});
        this.stateAll(r);
        const guessers=this.online(r).filter(x=>!x.spectator&&!r.artists.includes(x.id));
        if(guessers.length && guessers.every(x=>r.guessed.has(x.id)))this.finishTurn(r,'allGuessed');
        return {correct:true,points};
      }
      this.chat(r,text,'guess',p.id);
      return {correct:false,close:almost(text,r.prompt)};
    }
    if(r.phase==='choosing')error('turnSoon');
    this.chat(r,text,'chat',p.id);return {};
  }
  chat(r,text,kind='system',player=null) {
    const p=r.players.get(player);const message={id:id(5),text,kind,player,name:p?.name||'',avatar:p?.avatar||0,at:this.now()};
    r.chat.push(message);if(r.chat.length>100)r.chat.shift();this.broadcast(r,'chat',message);
  }
  finishTurn(r,reason='timeUp') {
    if(!['drawing','choosing'].includes(r.phase))return;
    const blind=r.settings.mode==='blind'&&r.phase==='drawing';
    r.phase='reveal';r.deadline=this.now()+this.revealMs(r);r.modifier=null;r.reason=this.tr(r,reason);
    this.stateAll(r);this.broadcast(r,'effect',{kind:'reveal'});
    // Blind artists finally see what they made.
    if(blind)for(const id of r.artists){const a=r.players.get(id);if(a)this.sendBoard(a,r);}
  }
  pause(r) {
    r.phase='lobby';r.deadline=0;r.artists=[];r.prompt=null;r.modifier=null;r.tel=null;
    this.chat(r,this.tr(r,r.public?'pausedPublic':'paused'));this.stateAll(r);
  }
  /** A board is the room itself, or (in Telefonleken) one private canvas per chain step. */
  resetBoard(b) {b.epoch=id(6);b.ops=[];b.strokes=new Map();b.undone=new Set();b.seq=0;b.points=0;return b;}
  board(b) {return {epoch:b.epoch,ops:b.ops.filter(o=>!b.undone.has(o.stroke)),seq:b.seq};}
  boardOf(p,r) {
    if(!r.tel||!['tdraw','tguess'].includes(r.phase))return r;
    const chain=this.telChain(r,p.id),step=chain?.steps[r.phase==='tdraw'?r.tel.step:r.tel.step-1];
    return step?.board||r;
  }
  /** Blind artists get an empty canvas while they draw: the server never sends them their own ink. */
  hidesInk(r,p) {return r.settings.mode==='blind'&&r.phase==='drawing'&&r.artists.includes(p.id);}
  boardView(p,r) {const b=this.boardOf(p,r);return this.hidesInk(r,p)?{epoch:b.epoch,ops:[],seq:b.seq}:this.board(b);}
  sendBoard(p,r) {this.send(p,'board',this.boardView(p,r));}
  sendBoards(r,b) {for(const x of r.players.values())if(b===r||this.boardOf(x,r)===b)this.sendBoard(x,r);}
  canDraw(p,r) {
    if(r.phase==='tdraw')return p.connected&&!p.spectator&&!!this.telChain(r,p.id)&&!r.tel.done.has(p.id);
    return p.connected && !p.spectator && (r.phase==='studio'||r.phase==='drawing'&&r.artists.includes(p.id));
  }
  requireDraw(p,r,data) {if(!this.canDraw(p,r))error('notDrawing');if(data.epoch!==this.boardOf(p,r).epoch)error('canvasChanged');}
  point(point) {
    if(!Array.isArray(point)||point.length!==2||!point.every(v=>typeof v==='number'&&Number.isFinite(v)))error('badPoint');
    return point.map(v=>Math.round(clamp(v,0,1)*100000)/100000);
  }
  draw(p,r,type,data) {
    this.requireDraw(p,r,data);this.limit(p,'draw',110);
    if(typeof data.stroke!=='string'||!/^[a-zA-Z0-9_-]{1,72}$/.test(data.stroke))error('badStroke');
    const b=this.boardOf(p,r),cap=b.cap||85000;
    let stroke=b.strokes.get(data.stroke);
    if(type==='stroke.begin'){
      if(stroke)error('strokeExists');
      if(b.strokes.size>=5000||b.points>cap)error('canvasFullSave');
      for(const s of b.strokes.values())if(s.owner===p.id&&!s.ended)s.ended=true;
      let width=Number.isFinite(data.width)?clamp(data.width,.001,.065):.007;
      let color=/^#[0-9a-fA-F]{6}$/.test(data.color||'')?data.color:'#262626';
      const eraser=data.eraser===true;if(eraser)color='#ffffff';
      if(r.modifier?.id==='tiny')width=Math.min(width,.003);
      if(r.modifier?.id==='mono'&&!eraser)color='#8b66ef';
      // Brush styles are a Ritkaos+ cosmetic: only the owner's strokes keep their style, everyone sees it.
      const style=!eraser&&BRUSHES.includes(data.style)&&owns(p.owned,'cosmetics')?data.style:'';
      const point=this.point(data.point);
      stroke={id:data.stroke,owner:p.id,color,width,style,last:point,ended:false};b.strokes.set(stroke.id,stroke);
      return this.op(r,p,b,stroke,[point],null,data.cid);
    }
    if(!stroke||stroke.owner!==p.id||b.undone.has(stroke.id))error('notYourStroke');
    if(type==='stroke.end'){stroke.ended=true;return {};}
    if(stroke.ended)error('strokeEnded');
    if(!Array.isArray(data.points)||!data.points.length||data.points.length>80)error('badPoints');
    if(b.points>cap+5000)error('canvasFull');
    const points=data.points.map(x=>this.point(x)),from=stroke.last;stroke.last=points.at(-1);
    return this.op(r,p,b,stroke,points,from,data.cid);
  }
  op(r,p,b,stroke,points,from,cid) {
    const op={seq:++b.seq,stroke:stroke.id,owner:p.id,color:stroke.color,width:stroke.width,points,from,cid:Number.isSafeInteger(cid)?cid:0,...(stroke.style?{style:stroke.style}:{})};
    b.ops.push(op);b.points+=points.length;const ink={epoch:b.epoch,op};
    if(b!==r)this.send(p,'ink',ink);else for(const x of r.players.values())if(!this.hidesInk(r,x))this.send(x,'ink',ink);
    return {seq:b.seq};
  }
  undo(p,r,data) {
    this.limit(p,'undo',8,3000);this.requireDraw(p,r,data);const b=this.boardOf(p,r);
    const strokes=[...b.strokes.values()].reverse();const s=strokes.find(x=>x.owner===p.id&&!b.undone.has(x.id));
    if(s){s.ended=true;b.undone.add(s.id);this.sendBoards(r,b);}return {};
  }
  clear(p,r,data) {
    this.limit(p,'clear',3,5000);this.requireDraw(p,r,data);
    if(r.phase==='tdraw'?false:r.phase==='studio'?!this.isHost(p,r):r.artists[0]!==p.id)error('leadClear');
    const b=this.boardOf(p,r);this.resetBoard(b);
    if(b===r)this.stateAll(r);else this.send(p,'state',this.view(r,p));
    this.sendBoards(r,b);return {};
  }
  cursor(p,r,data) {
    if(!this.canDraw(p,r)||r.tel)return {};
    this.limit(p,'cursor',35);const point=this.point(data.point);
    for(const other of r.players.values())if(other.id!==p.id)this.send(other,'cursor',{id:p.id,name:p.name,avatar:p.avatar,point,at:this.now()});return {};
  }
  react(p,r,data) {
    if(!['😂','🔥','❤️','👀','💀','👏'].includes(data.emoji))error('badReaction');
    this.broadcast(r,'effect',{kind:'reaction',emoji:data.emoji,name:p.name});return {};
  }
  kick(p,r,data){
    if(!this.isHost(p,r))error('hostKick');const target=r.players.get(data.id);
    if(!target||target.id===p.id)error('pickOther');
    this.leave(target);this.send(target,'kicked',{});return {};
  }
  /** Open matches have no host: a player leaves when more than half of the other online players vote within a minute. Voting again withdraws the vote. */
  vote(p,r,data){
    if(!r.public)error('voteOnlyPublic');
    this.limit(p,'vote',8,10000);const target=r.players.get(data.id);
    if(!target||target.id===p.id)error('pickOther');
    let votes=r.votes.get(target.id);if(!votes)r.votes.set(target.id,votes=new Map());
    if(votes.has(p.id))votes.delete(p.id);else votes.set(p.id,this.now());
    if(!this.countVotes(r))this.stateAll(r);return {};
  }
  tally(r,targetId){
    const votes=r.votes.get(targetId),now=this.now(),others=this.online(r).filter(x=>x.id!==targetId);
    const count=votes?others.filter(x=>votes.has(x.id)&&now-votes.get(x.id)<VOTE_MS).length:0;
    return {votes:count,need:Math.floor(others.length/2)+1};
  }
  /** Drops expired votes and removes anyone voted out. Returns true when state was already sent. */
  countVotes(r){
    const now=this.now();let changed=false;
    for(const [targetId,votes] of r.votes){
      for(const [voter,at] of votes)if(now-at>=VOTE_MS||!r.players.has(voter)){votes.delete(voter);changed=true;}
      if(!votes.size){r.votes.delete(targetId);continue;}
      const target=r.players.get(targetId),{votes:count,need}=this.tally(r,targetId);
      if(target&&count>=need){r.votes.delete(targetId);r.banned.add(targetId);this.leave(target,'votedOut');this.send(target,'kicked',{vote:true});return true;}
    }
    if(changed)this.stateAll(r);
    return changed;
  }
  /** Telefonleken. Player i handles chain (i - step) mod n, so every chain gets one turn from every player. */
  telTask(s) { return s===0?'write':s%2?'draw':'guess'; }
  telChain(r,playerId,s=r.tel?.step) {
    const i=r.order.indexOf(playerId),n=r.order.length;
    return r.tel&&i>=0?r.tel.chains[((i-s)%n+n)%n]:null;
  }
  telBegin(r) {
    const names=new Map(r.order.map(x=>[x,r.players.get(x).name]));
    r.tel={step:0,steps:r.order.length,done:new Set(),show:-1,names,chains:r.order.map(x=>({owner:x,name:names.get(x),steps:[]}))};
    this.chat(r,this.tr(r,'telStart'));this.telStep(r,0);
  }
  telStep(r,s) {
    const tel=r.tel,task=this.telTask(s);tel.step=s;tel.done=new Set();
    r.phase='t'+task;r.startedAt=this.now();r.duration=task==='draw'?r.settings.seconds*1000:task==='write'?TEL.write:TEL.guess;r.deadline=r.startedAt+r.duration;
    if(task==='draw')for(const x of r.order)this.telChain(r,x,s).steps[s]={kind:'drawing',by:x,name:tel.names.get(x),board:this.resetBoard({cap:TEL.points})};
    this.stateAll(r);for(const p of r.players.values())this.sendBoard(p,r);
  }
  telSubmit(p,r,data) {
    if(!['twrite','tguess'].includes(r.phase))error('telNotNow');
    const chain=this.telChain(r,p.id);if(!chain||p.spectator)error('fromNextTurn');
    if(r.tel.done.has(p.id))error('telDone');
    this.limit(p,'chat',7,5000);const text=clean(data.text,100);if(!text)error('writeFirst');
    chain.steps[r.tel.step]={kind:'text',by:p.id,name:r.tel.names.get(p.id),text};r.tel.done.add(p.id);this.stateAll(r);return {};
  }
  telDone(p,r) {
    if(r.phase!=='tdraw')error('telNotNow');
    if(!this.telChain(r,p.id)||p.spectator)error('fromNextTurn');
    r.tel.done.add(p.id);this.stateAll(r);return {};
  }
  /** Fills in anything missing (a random prompt, or "no guess"), then moves on. Drawings stay as they are, even if empty. */
  telAdvance(r) {
    const tel=r.tel,s=tel.step,task=this.telTask(s);
    if(task!=='draw')for(const x of r.order){
      const chain=this.telChain(r,x,s);if(chain.steps[s])continue;
      let text=this.tr(r,'telBlank');
      if(task==='write'){const [pick]=getChoices(r.settings,r.used,r.lang);if(pick){r.used.add(normalize(pick.answer));text=pick.scene;}}
      chain.steps[s]={kind:'text',by:x,name:tel.names.get(x),text,auto:true};
    }
    if(s+1<tel.steps)this.telStep(r,s+1);else this.telShow(r,0);
  }
  telShow(r,i) {
    const tel=r.tel;tel.show=i;r.phase='treveal';r.startedAt=this.now();r.duration=Math.max(20000,TEL.show*tel.steps);r.deadline=r.startedAt+r.duration;
    this.stateAll(r);for(const p of r.players.values())this.sendChain(p,r);
  }
  telNext(r) { if(r.tel.show+1<r.tel.chains.length)this.telShow(r,r.tel.show+1);else this.toLobby(r,'telOver'); }
  chainView(r) {
    const tel=r.tel,chain=tel.chains[tel.show];
    return {index:tel.show,count:tel.chains.length,name:chain.name,steps:chain.steps.map(x=>x.kind==='text'?{kind:'text',name:x.name,text:x.text,auto:!!x.auto}:{kind:'drawing',name:x.name,ops:this.board(x.board).ops})};
  }
  sendChain(p,r) { if(r.phase==='treveal'&&r.tel)this.send(p,'chain',this.chainView(r)); }
  telView(r,p) {
    const tel=r.tel,chain=!p.spectator&&this.telChain(r,p.id),prev=chain&&tel.step>0?chain.steps[tel.step-1]:null;
    const need=r.order.filter(x=>r.players.get(x)?.connected);
    return {step:tel.step+1,steps:tel.steps,task:r.phase==='treveal'?'reveal':chain?this.telTask(tel.step):'wait',done:tel.done.has(p.id),
      doneCount:need.filter(x=>tel.done.has(x)).length,needCount:need.length,
      text:r.phase==='tdraw'&&prev?.kind==='text'?prev.text:'',from:r.phase==='treveal'?'':prev?.name||'',show:tel.show,shows:tel.chains.length};
  }
  view(r,p) {
    const artist=r.artists.includes(p.id), reveal=['reveal','ended'].includes(r.phase);
    const role=p.spectator?'spectator':r.phase==='studio'||artist||r.phase==='tdraw'&&this.canDraw(p,r)?'artist':'guesser', host=this.isHost(p,r);
    const modifier=r.modifier&&{...r.modifier,...modifierText(p.lang,r.modifier.id)};
    return {
      code:r.code,host:r.public?'':r.host,phase:r.phase,round:r.round,slot:r.slot,turn:r.turn,totalTurns:r.order.length,
      lang:r.lang,public:r.public,maxPlayers:this.max(r),autoStart:r.autoStartAt||0,
      totalRounds:this.totalRounds(r),minPlayers:this.minPlayers(r),timing:{choose:this.chooseMs(r),reveal:this.revealMs(r)},
      unlocked:[...PAID_PACKS,...PAID_MODES].filter(x=>this.unlocked(r,x)),tel:r.tel?this.telView(r,p):null,
      settings:{...r.settings,custom:host?r.settings.custom:[],customCount:r.settings.custom.length},
      players:[...r.players.values()].map(x=>({id:x.id,name:x.name,avatar:x.avatar,score:x.score,connected:x.connected,spectator:x.spectator,artist:r.phase==='studio'||r.artists.includes(x.id),guessed:r.guessed.has(x.id),done:!!r.tel?.done.has(x.id),
        ...(r.public?{kick:{...this.tally(r,x.id),mine:!!r.votes.get(x.id)?.has(p.id)}}:{})})),
      artists:r.artists,you:{id:p.id,role,host,guessed:r.guessed.has(p.id)},
      deadline:r.deadline,duration:r.duration,serverTime:this.now(),epoch:this.boardOf(p,r).epoch,
      hint:r.phase==='drawing'?this.hint(r):'',category:r.prompt?.category||'',
      prompt:r.prompt&&(artist||reveal)?{answer:r.prompt.answer,scene:r.prompt.scene}:null,
      choices:r.phase==='choosing'&&r.artists[0]===p.id?r.choices.map((x,i)=>({index:i,answer:x.answer,scene:x.scene,category:x.category})):[],
      modifier,reason:r.reason||'',chat:r.chat
    };
  }
  /** Rooms are private unless the host made them visible on their network, or they are open matches. */
  lobbyRooms(){
    const rank=p=>p==='lobby'?0:p==='ended'?2:1, open=[], byNetwork=new Map();
    for(const r of this.rooms.values()){
      const online=this.online(r);if(!online.length)continue;
      const phase=['lobby','ended','studio'].includes(r.phase)?r.phase:'playing', base={code:r.code,players:online.length,phase,mode:r.settings.mode,lang:r.lang,max:this.max(r),full:r.players.size>=this.max(r)};
      if(r.public){open.push({...base,kind:'public',avatar:online[0].avatar});continue;}
      const host=r.players.get(r.host), network=host?.network;
      if(!r.settings.visible||!network)continue;
      if(!byNetwork.has(network))byNetwork.set(network,[]);
      byNetwork.get(network).push({...base,kind:'network',host:host.name,avatar:host.avatar,names:online.map(p=>p.name)});
    }
    const order=(a,b)=>rank(a.phase)-rank(b.phase)||b.players-a.players;
    for(const list of byNetwork.values())list.sort(order);
    return {open:open.sort(order),byNetwork};
  }
  roomsFor(viewer,{open,byNetwork}){
    const local=(viewer.network&&byNetwork.get(viewer.network))||[];
    const own=viewer.lang||'sv', pub=[...open].sort((a,b)=>(a.lang!==own)-(b.lang!==own));
    return [...local.map(r=>r.host?r:{...r,host:t(own,'hostFallback')}),...pub];
  }
  listRooms(viewer={}){return this.roomsFor(viewer,this.lobbyRooms());}
  sendRooms(p){const rooms=this.listRooms(p);p.lobbyKey=JSON.stringify(rooms);this.send(p,'rooms',{rooms});}
  notifyLobby(){
    let rooms=null;
    for(const p of this.sessions.values()){
      if(!p.connected||p.room)continue;
      rooms??=this.lobbyRooms();
      const list=this.roomsFor(p,rooms),key=JSON.stringify(list);
      if(key!==p.lobbyKey){p.lobbyKey=key;this.send(p,'rooms',{rooms:list});}
    }
  }
  stateAll(r) {for(const p of r.players.values())this.send(p,'state',this.view(r,p));this.notifyLobby();}
  /** Open matches start by themselves: soon with 3+ players, a little later with 2, and loop back to the lobby after results. */
  autoStart(r,now,online){
    if(r.phase==='ended'&&now>=r.deadline){this.toLobby(r);return;}
    if(r.phase!=='lobby')return;
    if(online.length<2||now-r.lastActive>IDLE_MS){if(r.autoStartAt){r.autoStartAt=0;this.stateAll(r);}return;}
    const wait=online.length>=3?AUTOSTART_MS.many:AUTOSTART_MS.two;
    if(!r.autoStartAt||r.autoStartAt-now>wait){r.autoStartAt=now+wait;this.stateAll(r);return;}
    if(now>=r.autoStartAt)this.begin(r);
  }
  /** True while some room has a timer that tick() must check (a turn, autostart, votes, or someone dropping out). Otherwise the host may sleep. */
  needsTick(){
    for(const r of this.rooms.values()){
      const online=this.online(r);if(!online.length)continue;
      if(PLAY_PHASES.includes(r.phase))return true;
      if(r.public&&(r.votes.size||r.phase==='ended'||r.phase==='lobby'&&(online.length>=2||r.autoStartAt)&&this.now()-r.lastActive<=IDLE_MS))return true;
      for(const p of r.players.values())if(!p.connected&&p.disconnectedAt)return true;
    }
    return false;
  }
  tick(){
    const now=this.now();
    for(const r of this.rooms.values()){
      const online=this.online(r);
      if(!online.length&&now-r.lastActive>120000){for(const p of r.players.values())p.room=null;this.rooms.delete(r.code);continue;}
      for(const p of r.players.values())if(!p.connected&&p.disconnectedAt&&now-p.disconnectedAt>90000){r.players.delete(p.id);p.room=null;this.stateAll(r);}
      if(r.public){if(r.votes.size&&this.countVotes(r))continue;this.autoStart(r,now,this.online(r));}
      if(r.public&&PLAY_PHASES.includes(r.phase)&&now-r.lastActive>IDLE_MS){this.pause(r);continue;}
      if(PLAY_PHASES.includes(r.phase)){
        const min=r.settings.mode==='coop'?3:2;
        if(online.length<min){if(!r.lowSince)r.lowSince=now;else if(now-r.lowSince>9000){this.pause(r);continue;}}else r.lowSince=0;
      }
      if(TEL_PHASES.includes(r.phase)){
        const online=r.order.filter(x=>r.players.get(x)?.connected);
        if(now>=r.deadline||online.length&&online.every(x=>r.tel.done.has(x)))this.telAdvance(r);
      }else if(r.phase==='treveal'){
        if(now>=r.deadline)this.telNext(r);
      }else if(r.phase==='choosing'){
        if(now>=r.deadline)this.beginDrawing(r,r.choices[0]);
      }else if(r.phase==='drawing'){
        if(!r.artists.some(x=>r.players.get(x)?.connected)){
          if(!r.noArtistSince)r.noArtistSince=now;else if(now-r.noArtistSince>8000){this.finishTurn(r,'artistLost');continue;}
        }else r.noArtistSince=0;
        if(now>=r.deadline){this.finishTurn(r);continue;}
        if(r.settings.mode==='chaos'&&!r.modifierDone&&now-r.startedAt>Math.min(18000,r.duration*.35)){
          const m=MODIFIERS[Math.floor(Math.random()*MODIFIERS.length)];r.modifier={...m,endsAt:now+m.duration};r.modifierDone=true;this.stateAll(r);
          for(const x of r.players.values())this.send(x,'effect',{kind:'chaos',name:modifierText(x.lang,m.id).name});
        }
        if(r.modifier&&now>=r.modifier.endsAt){r.modifier=null;this.stateAll(r);}
        const hint=this.hint(r);if(hint!==r.lastHint){r.lastHint=hint;this.stateAll(r);}
      }else if(r.phase==='reveal'&&now>=r.deadline)this.nextTurn(r);
    }
    for(const [token,p]of this.sessions)if(!p.connected&&!p.room&&now-p.lastSeen>600000)this.sessions.delete(token);
  }
}
