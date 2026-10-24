// The Cloudflare Lobby hibernates: rooms are saved with lib/snapshot.mjs and restored on wake.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, IDLE_MS, AUTOSTART_MS } from '../lib/game.mjs';
import { snapshot, restore } from '../lib/snapshot.mjs';
class Peer{constructor(){this.messages=[];}send(m){this.messages.push(structuredClone(m));}close(){this.closed=true;}}
const clock=()=>{let time=1000000;return {now:()=>time,advance:ms=>{time+=ms;}};};

test('a quiet private room (studio drawing) needs no tick and survives a snapshot round trip', () => {
 const c=clock();const g=new Game({now:c.now});
 const a=g.connect(new Peer(),null,{network:'net-a'}),b=g.connect(new Peer());
 const {room}=g.handle(a,'create',{name:'Ludvig',avatar:2,visible:true});
 g.handle(b,'join',{code:room,name:'Albin'});
 g.handle(a,'settings',{mode:'studio',rounds:3,custom:'katt, hund'});
 a.owned.add('cosmetics');
 const r=g.rooms.get(room);
 g.handle(a,'start');assert.equal(r.phase,'studio');
 g.handle(a,'stroke.begin',{epoch:r.epoch,stroke:'s1',point:[.1,.2],width:.01,color:'#000000',cid:1});
 assert.equal(g.needsTick(),false);
 const saved=snapshot(g);
 assert.ok(!saved.includes('"peer"'));
 const h=new Game({now:c.now});assert.ok(restore(h,saved,c.now()));
 const r2=h.rooms.get(room);
 assert.equal(r2.players.size,2);
 assert.equal(r2.settings.rounds,3);assert.deepEqual(r2.settings.custom,['katt','hund']);
 assert.ok(r2.strokes instanceof Map);assert.ok(r2.undone instanceof Set);assert.ok(r2.used instanceof Set);
 assert.equal(r2.players.get(a.id),h.sessions.get(a.token),'room players are the same objects as sessions');
 assert.ok(h.sessions.get(a.token).owned.has('cosmetics'));
 assert.equal(h.sessions.get(a.token).network,'net-a');
 // Everyone is offline until their socket comes back.
 assert.ok([...r2.players.values()].every(p=>!p.connected&&p.disconnectedAt));
 // Reconnect both with their tokens and play on.
 const a2=h.connect(new Peer(),a.token),b2=h.connect(new Peer(),b.token);
 assert.equal(a2.room,room);assert.equal(b2.room,room);
 const board=a2.peer.messages.find(m=>m.type==='board');assert.equal(board.data.ops.length,1);
 h.handle(a2,'lobby');h.handle(a2,'settings',{mode:'classic'});h.handle(a2,'start');assert.equal(r2.phase,'choosing');assert.equal(h.needsTick(),true);
});

test('disconnects keep the tick alive only until the player is dropped', () => {
 const c=clock();const g=new Game({now:c.now});
 const a=g.connect(new Peer()),b=g.connect(new Peer());
 const {room}=g.handle(a,'create',{name:'A'});g.handle(b,'join',{code:room,name:'B'});
 g.disconnect(b,b.peer);assert.equal(g.needsTick(),true);
 c.advance(91000);g.tick();assert.equal(g.rooms.get(room).players.size,1);assert.equal(g.needsTick(),false);
});

test('an idle open match pauses instead of looping, and wakes again on activity', () => {
 const c=clock();const g=new Game({now:c.now});
 const a=g.connect(new Peer()),b=g.connect(new Peer());
 g.handle(a,'quick',{name:'A',lang:'sv'});g.handle(b,'quick',{name:'B',lang:'sv'});
 const r=g.rooms.get(a.room);assert.equal(r,g.rooms.get(b.room));
 g.tick();c.advance(AUTOSTART_MS.two+10);g.tick();assert.notEqual(r.phase,'lobby');
 // Nobody touches anything for ten minutes: the match pauses and stops ticking.
 for(let t=0;t<IDLE_MS+20000;t+=1000){c.advance(1000);g.tick();}
 assert.equal(r.phase,'lobby');assert.equal(r.autoStartAt,0);assert.equal(g.needsTick(),false);
 // A player acts again: autostart comes back.
 g.handle(a,'guess',{text:'hej'});assert.equal(g.needsTick(),true);
 g.tick();c.advance(AUTOSTART_MS.two+10);g.tick();assert.notEqual(r.phase,'lobby');
});
