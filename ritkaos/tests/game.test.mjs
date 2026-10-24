import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../lib/game.mjs';
import { BANK, BANKS, matches, almost, getChoices } from '../lib/prompts.mjs';
import { networkKey, networkPrefix } from '../lib/network.mjs';
import { PUBLIC_MAX, AUTOSTART_MS, RESULTS_MS, VOTE_MS } from '../lib/game.mjs';
class Peer{constructor(){this.messages=[];}send(m){this.messages.push(structuredClone(m));}close(){this.closed=true;}}
function setup(n=3,mode='classic'){
 let time=1000000;const g=new Game({now:()=>time});const peers=Array.from({length:n},()=>new Peer());const players=peers.map(p=>g.connect(p));
 const {room}=g.handle(players[0],'create',{name:'Ludvig',avatar:0});
 for(let i=1;i<n;i++)g.handle(players[i],'join',{code:room,name:['','Albin','Amanda','David'][i]||'Kompis',avatar:i});
 const r=g.rooms.get(room);g.handle(players[0],'settings',{mode,rounds:1});
 return {g,r,players,peers,advance:ms=>{time+=ms;g.tick();},now:()=>time};
}
const begin=(t,p=t.players[0])=>{t.g.handle(p,'start');t.g.handle(p,'choose',{index:0});};
function stroke(t,p,id,color='#000000'){
 return t.g.handle(p,'stroke.begin',{epoch:t.r.epoch,stroke:id,point:[.1,.2],width:.01,color,cid:1});
}
test('word bank contains more than 300 prompts; normalization and explicit aliases work',()=>{
 assert.ok(BANK.length>300);assert.ok(matches(' EN TVÄTTBJÖRN!!! ',{answer:'tvättbjörn',aliases:[]}));assert.ok(matches('kodare',{answer:'programmerare',aliases:['kodare']}));assert.ok(!matches('en hund',{answer:'katt',aliases:[]}));assert.ok(almost('pingvn',{answer:'pingvin'}));
 assert.ok(BANK.some(p=>p.answer==='snopp'));assert.ok(BANK.some(p=>p.answer==='kines'));
 assert.ok(matches('kuk',{answer:'snopp',aliases:['kuk','penis']}));assert.ok(matches('kinesen',{answer:'kines',aliases:['kinesen']}));
 assert.ok(!BANK.some(p=>p.answer==='laddningssymbol'));
});
test('office-safe pack drops crude answers and still has three unique choices',()=>{
 assert.ok(BANK.some(p=>p.answer==='snopp'&&p.safe===false));assert.ok(BANK.some(p=>p.answer==='kines'&&p.safe===false));
 const dirty=new Set(['snopp','kuk','kines','blatte','hora','fitta','incel']);
 const safe=BANK.filter(p=>p.safe);assert.ok(safe.length>300);assert.ok(safe.every(p=>!dirty.has(p.answer)));
 const picks=getChoices({pack:'mix',safe:true});assert.equal(picks.length,3);assert.equal(new Set(picks.map(p=>p.answer)).size,3);assert.ok(picks.every(p=>p.safe));
 const t=setup();t.g.handle(t.players[0],'settings',{safe:true});assert.equal(t.r.settings.safe,true);assert.throws(()=>t.g.handle(t.players[1],'settings',{safe:false}),/värden/);
});
test('room creation, unique names, join, host permissions and room isolation',()=>{
 const t=setup();assert.equal(t.r.players.size,3);assert.equal(t.r.code.length,6);assert.throws(()=>t.g.handle(t.players[1],'start'),/värden/);
 const p=t.g.connect(new Peer());t.g.handle(p,'join',{code:t.r.code,name:'Ludvig'});assert.equal(p.name,'Ludvig 2');
 const outsider=t.g.connect(new Peer());const {room}=t.g.handle(outsider,'create',{name:'X'});assert.notEqual(room,t.r.code);assert.equal(t.g.rooms.get(room).players.size,1);
});
test('rooms are private by default and never listed, not even on the same network',()=>{
 const t=setup();assert.deepEqual(t.g.listRooms(),[]);assert.deepEqual(t.g.listRooms({network:'net-a'}),[]);
 const idle=t.g.connect(new Peer(),null,{network:'net-a'});const pushed=idle.peer.messages.filter(m=>m.type==='rooms').at(-1);assert.deepEqual(pushed.data.rooms,[]);
 assert.deepEqual(t.g.handle(idle,'rooms',{}).rooms,[]);
});
test('network-visible rooms are listed only for the same network, without secret prompts',()=>{
 let time=1000000;const g=new Game({now:()=>time});
 const host=g.connect(new Peer(),null,{network:'net-a'}),friend=g.connect(new Peer(),null,{network:'net-a'});
 const {room}=g.handle(host,'create',{name:'Ludvig',visible:true});g.handle(friend,'join',{code:room,name:'Albin'});
 const same=g.connect(new Peer(),null,{network:'net-a'}),other=g.connect(new Peer(),null,{network:'net-b'}),unknown=g.connect(new Peer());
 const listed=g.listRooms(same);assert.equal(listed.length,1);assert.equal(listed[0].kind,'network');assert.equal(listed[0].host,'Ludvig');assert.equal(listed[0].players,2);assert.equal(listed[0].phase,'lobby');
 assert.deepEqual(g.listRooms(other),[]);assert.deepEqual(g.listRooms(unknown),[]);assert.deepEqual(g.listRooms(),[]);
 assert.equal(same.peer.messages.filter(m=>m.type==='rooms').at(-1).data.rooms[0].code,room);assert.deepEqual(other.peer.messages.filter(m=>m.type==='rooms').at(-1).data.rooms,[]);
 assert.ok(!JSON.stringify(listed).includes('net-a'),'Network keys are never sent to clients');
 const r=g.rooms.get(room);assert.equal(g.view(r,friend).settings.visible,true);
 g.handle(host,'start');g.handle(host,'choose',{index:0});const playing=g.listRooms(same)[0];assert.equal(playing.phase,'playing');assert.ok(!JSON.stringify(playing).includes(r.prompt.scene));
 assert.throws(()=>g.handle(friend,'settings',{visible:false}),/värden/);
 g.handle(host,'settings',{visible:false});assert.deepEqual(g.listRooms(same),[]);assert.deepEqual(same.peer.messages.filter(m=>m.type==='rooms').at(-1).data.rooms,[]);
 assert.throws(()=>g.handle(host,'settings',{rounds:3}),/mellan matcher/);
});
test('network keys: full IPv4, IPv6 /64, local LAN, salted and never raw',()=>{
 assert.equal(networkPrefix('203.0.113.7'),'v4:203.0.113.7');assert.equal(networkPrefix('::ffff:203.0.113.7'),'v4:203.0.113.7');
 assert.equal(networkPrefix('2001:db8:aa:bb:1:2:3:4'),'v6:2001:db8:aa:bb');assert.equal(networkPrefix('2001:db8:aa:bb::9'),'v6:2001:db8:aa:bb');assert.equal(networkPrefix('2001:0db8:00aa:00bb::'),'v6:2001:db8:aa:bb');
 assert.equal(networkPrefix('nonsense'),null);assert.equal(networkPrefix(''),null);assert.equal(networkPrefix('1:2:3'),null);
 for(const ip of ['127.0.0.1','::1','192.168.1.20','10.0.0.4','172.20.1.1','::ffff:192.168.0.3','fe80::1%en0','fd00::5'])assert.equal(networkPrefix(ip,{lan:true}),'local',ip);
 assert.equal(networkPrefix('192.168.1.20'),'v4:192.168.1.20');assert.equal(networkPrefix('8.8.8.8',{lan:true}),'v4:8.8.8.8');
 assert.equal(networkKey('2001:db8:aa:bb::1'),networkKey('2001:db8:aa:bb:ffff::2'));assert.notEqual(networkKey('2001:db8:aa:bb::1'),networkKey('2001:db8:aa:cc::1'));
 assert.notEqual(networkKey('203.0.113.7'),networkKey('203.0.113.8'));assert.equal(networkKey('192.168.1.2',{lan:true}),networkKey('127.0.0.1',{lan:true}));
 assert.ok(!networkKey('203.0.113.7').includes('203'));assert.equal(networkKey(''),null);
});
test('only active chooser receives choices; guessers do not receive the secret prompt',()=>{
 const t=setup();t.g.handle(t.players[0],'start');assert.equal(t.g.view(t.r,t.players[0]).choices.length,3);assert.equal(t.g.view(t.r,t.players[1]).choices.length,0);
 t.g.handle(t.players[0],'choose',{index:0});assert.ok(t.g.view(t.r,t.players[0]).prompt);assert.equal(t.g.view(t.r,t.players[1]).prompt,null);assert.equal(t.g.view(t.r,t.players[2]).prompt,null);
});
test('correct scoring is authoritative and duplicate correct guesses are rejected',()=>{
 const t=setup();begin(t);t.advance(1000);const answer=t.r.prompt.answer;
 const result=t.g.handle(t.players[1],'guess',{text:answer});assert.ok(result.points>=100&&result.points<=550);assert.equal(t.players[0].score,100);
 const score=t.players[1].score;assert.throws(()=>t.g.handle(t.players[1],'guess',{text:answer}),/redan/);assert.equal(t.players[1].score,score);assert.throws(()=>t.g.handle(t.players[0],'guess',{text:answer}),/ritar/);
});
test('all correct guesses end the turn and do not echo answers in public chat',()=>{
 const t=setup();begin(t);for(const p of t.players.slice(1))t.g.handle(p,'guess',{text:t.r.prompt.answer});assert.equal(t.r.phase,'reveal');assert.ok(t.r.chat.at(-1).text.includes('gissade rätt'));assert.ok(t.g.view(t.r,t.players[1]).prompt);
});
test('wrong guesses never award points, close spelling returns private hint',()=>{
 const t=setup();begin(t);t.r.prompt={answer:'pingvin',scene:'pingvin',aliases:[],category:'Djur'};const result=t.g.handle(t.players[1],'guess',{text:'pingvn'});assert.equal(result.close,true);assert.equal(result.correct,false);assert.equal(t.players[1].score,0);
});
test('full match rotates artists, ends, and rematches reset all scores',()=>{
 const t=setup(2);begin(t);const seen=[...t.r.artists];t.g.handle(t.players[1],'guess',{text:t.r.prompt.answer});t.advance(6600);assert.equal(t.r.artists[0],t.players[1].id);seen.push(t.r.artists[0]);t.g.handle(t.players[1],'choose',{index:0});t.g.handle(t.players[0],'guess',{text:t.r.prompt.answer});t.advance(6600);assert.equal(t.r.phase,'ended');assert.equal(new Set(seen).size,2);t.g.handle(t.players[0],'start');assert.equal(t.r.phase,'choosing');assert.ok(t.players.every(p=>p.score===0));
});
test('deadline auto-selects and auto-finishes even after clock jumps',()=>{
 const t=setup();t.g.handle(t.players[0],'start');t.advance(17000);assert.equal(t.r.phase,'drawing');t.advance(80000);assert.equal(t.r.phase,'reveal');t.advance(7000);assert.equal(t.r.phase,'choosing');
});
test('co-op requires 3, assigns 2 artists and denies artist guessing',()=>{
 const x=setup(2,'coop');assert.throws(()=>x.g.handle(x.players[0],'start'),/3/);
 const t=setup(3,'coop');begin(t);assert.equal(t.r.artists.length,2);assert.ok(t.g.view(t.r,t.players[1]).prompt);assert.equal(t.g.view(t.r,t.players[2]).prompt,null);assert.throws(()=>t.g.handle(t.players[1],'guess',{text:t.r.prompt.answer}),/ritar/);
});
test('concurrent ink has a single canonical order, owner-only undo, protected clear',()=>{
 const t=setup(3,'coop');begin(t);stroke(t,t.players[0],'a','#000000');stroke(t,t.players[1],'b','#ee0000');
 t.g.handle(t.players[0],'stroke.points',{epoch:t.r.epoch,stroke:'a',points:[[.8,.8]],cid:2});t.g.handle(t.players[1],'stroke.points',{epoch:t.r.epoch,stroke:'b',points:[[.8,.1]],cid:2});
 assert.deepEqual(t.r.ops.map(x=>x.seq),[1,2,3,4]);assert.deepEqual(t.r.ops.map(x=>x.stroke),['a','b','a','b']);
 t.g.handle(t.players[1],'undo',{epoch:t.r.epoch});assert.deepEqual(t.g.board(t.r).ops.map(x=>x.stroke),['a','a']);
 assert.throws(()=>t.g.handle(t.players[1],'clear',{epoch:t.r.epoch}),/huvudritaren/);assert.throws(()=>t.g.handle(t.players[2],'stroke.begin',{epoch:t.r.epoch,stroke:'hijack',point:[.1,.2]}),/ritar/);
});
test('cannot append to another player stroke or a stroke from an earlier canvas',()=>{
 const t=setup(3,'coop');begin(t);stroke(t,t.players[0],'a');assert.throws(()=>t.g.handle(t.players[1],'stroke.points',{epoch:t.r.epoch,stroke:'a',points:[[.1,.2]]}),/äger/);const epoch=t.r.epoch;t.g.handle(t.players[0],'clear',{epoch});assert.notEqual(t.r.epoch,epoch);assert.throws(()=>t.g.handle(t.players[0],'stroke.begin',{epoch,stroke:'stale',point:[.1,.2]}),/bytts/);
});
test('disconnect migrates host; reconnect restores player, score, and complete board',()=>{
 const t=setup();begin(t);stroke(t,t.players[0],'a');t.g.handle(t.players[1],'guess',{text:t.r.prompt.answer});const score=t.players[1].score;
 t.g.disconnect(t.players[0],t.peers[0]);assert.equal(t.r.host,t.players[1].id);
 t.g.disconnect(t.players[1],t.peers[1]);const peer=new Peer();const restored=t.g.connect(peer,t.players[1].token);assert.equal(restored,t.players[1]);assert.equal(restored.score,score);assert.equal(peer.messages.find(x=>x.type==='board').data.ops.length,1);
});
test('late joiner cannot draw or guess until the next turn',()=>{
 const t=setup();begin(t);const p=t.g.connect(new Peer());t.g.handle(p,'join',{code:t.r.code,name:'Sen'});assert.equal(p.spectator,true);assert.throws(()=>t.g.handle(p,'guess',{text:t.r.prompt.answer}),/nästa/);
 for(const x of t.players.slice(1))t.g.handle(x,'guess',{text:t.r.prompt.answer});t.advance(7000);assert.equal(p.spectator,false);assert.ok(t.r.order.includes(p.id));
});
test('artist disconnection cannot leave a room permanently stuck',()=>{
 const t=setup(3);begin(t);t.g.disconnect(t.players[0],t.peers[0]);t.advance(1000);t.advance(9000);assert.equal(t.r.phase,'reveal');t.advance(7000);assert.equal(t.r.phase,'choosing');assert.equal(t.r.artists[0],t.players[1].id);
});
test('two-player room pauses safely when one friend remains disconnected',()=>{
 const t=setup(2);begin(t);t.g.disconnect(t.players[1],t.peers[1]);t.advance(1000);t.advance(10000);assert.equal(t.r.phase,'lobby');
});
test('free canvas allows everyone to draw, including late joins',()=>{
 const t=setup(2,'studio');t.g.handle(t.players[0],'start');assert.equal(t.r.phase,'studio');stroke(t,t.players[0],'a');stroke(t,t.players[1],'b');const p=t.g.connect(new Peer());t.g.handle(p,'join',{code:t.r.code,name:'X'});stroke(t,p,'c');assert.equal(t.r.ops.length,3);assert.equal(t.g.view(t.r,p).you.role,'artist');
});
test('chaos starts after an initial calm window and expires automatically',()=>{
 const t=setup(2,'chaos');begin(t);t.advance(10000);assert.equal(t.r.modifier,null);t.advance(9000);assert.ok(t.r.modifier);t.advance(11000);assert.equal(t.r.modifier,null);assert.equal(t.r.modifierDone,true);
});
test('malformed points, oversized strokes, and invalid packet data are rejected',()=>{
 const t=setup();begin(t);assert.throws(()=>stroke(t,t.players[0],'bad<>'));assert.throws(()=>t.g.handle(t.players[0],'stroke.begin',{epoch:t.r.epoch,stroke:'bad',point:[NaN,Infinity]}),/punkt/);stroke(t,t.players[0],'ok');assert.throws(()=>t.g.handle(t.players[0],'stroke.points',{epoch:t.r.epoch,stroke:'ok',points:Array(81).fill([0,0])}),/punkter/);assert.throws(()=>t.g.handle(t.players[0],'guess',null),/Ogiltigt/);
});
test('chat rate limit and safe name cleaning',()=>{
 const t=setup();for(let i=0;i<7;i++)t.g.handle(t.players[1],'guess',{text:'hej'});assert.throws(()=>t.g.handle(t.players[1],'guess',{text:'spam'}),/långsammare/);const p=t.g.connect(new Peer());t.g.handle(p,'join',{code:t.r.code,name:'<b>Hej</b>'});assert.ok(!p.name.includes('<'));
});
test('reactions have no dedicated rate limit',()=>{
 const t=setup();for(let i=0;i<20;i++)t.g.handle(t.players[1],'react',{emoji:'😂'});
 assert.equal(t.peers[0].messages.filter(m=>m.type==='effect'&&m.data.kind==='reaction').length,20);
});
test('empty rooms and expired disconnected sessions get cleaned up',()=>{
 const t=setup(2);for(let i=0;i<2;i++)t.g.disconnect(t.players[i],t.peers[i]);t.advance(121000);assert.equal(t.g.rooms.size,0);t.advance(601000);assert.equal(t.g.sessions.size,0);
});
function lobbyGame(){let time=1000000;const g=new Game({now:()=>time});return {g,now:()=>time,advance:ms=>{time+=ms;g.tick();},player:(lang='sv',network=null)=>g.connect(new Peer(),null,{lang,network})};}
test('quick match opens and fills public rooms per language, fullest first, capped at 8',()=>{
 const {g,player}=lobbyGame();const a=player('sv');const {room}=g.handle(a,'quick',{name:'Anna'});const r=g.rooms.get(room);
 assert.equal(r.public,true);assert.equal(r.lang,'sv');assert.equal(r.settings.safe,true);assert.equal(g.view(r,a).public,true);assert.equal(g.view(r,a).you.host,false);assert.equal(g.view(r,a).host,'');
 assert.throws(()=>g.handle(a,'settings',{safe:false}),/fasta/);assert.throws(()=>g.handle(a,'start'),/själva/);g.handle(a,'create',{name:'x',public:true});assert.equal(g.rooms.get(a.room).public,false,'Clients cannot create public rooms directly');g.handle(a,'quick',{name:'Anna'});const first=a.room;assert.ok(g.rooms.get(first).public);
 const en=player('en');g.handle(en,'quick',{name:'Eve'});assert.notEqual(en.room,first);assert.equal(g.rooms.get(en.room).lang,'en');
 const b=player('sv');g.handle(b,'quick',{name:'Bo'});assert.equal(b.room,first);
 assert.ok(g.listRooms(player('sv')).some(x=>x.code===first&&x.kind==='public'&&x.players===2&&x.max===PUBLIC_MAX),'Open matches are listed for everyone');
 const fuller=[a,b];for(let i=0;i<6;i++){const p=player('sv');g.handle(p,'quick',{name:'P'+i});assert.equal(p.room,first);fuller.push(p);}
 assert.equal(g.rooms.get(first).players.size,8);const ninth=player('sv');g.handle(ninth,'quick',{name:'Nio'});assert.notEqual(ninth.room,first);
 assert.throws(()=>g.handle(player('sv'),'join',{code:first,name:'Tio'}),/fullt \(8/);
 g.handle(fuller[7],'leave');const tenth=player('sv');g.handle(tenth,'quick',{name:'Tio'});assert.equal(tenth.room,first,'Fullest room with space wins');
});
test('open matches auto-start after a countdown, reset below two players, and loop after results',()=>{
 const {g,advance,player,now}=lobbyGame();const a=player(),b=player();g.handle(a,'quick',{name:'A'});const r=g.rooms.get(a.room);advance(250);assert.equal(r.autoStartAt,0);
 g.handle(b,'quick',{name:'B'});advance(250);const twoAt=r.autoStartAt;assert.ok(twoAt>0);assert.equal(g.view(r,a).autoStart,twoAt);
 advance(AUTOSTART_MS.two-1000);assert.equal(r.phase,'lobby');
 g.disconnect(b,b.peer);advance(250);assert.equal(r.autoStartAt,0,'Countdown resets below two players');
 g.connect(new Peer(),b.token);advance(250);assert.ok(r.autoStartAt>0);const c=player();g.handle(c,'quick',{name:'C'});advance(250);
 assert.ok(r.autoStartAt-now()<=AUTOSTART_MS.many,'Three players shorten the countdown');advance(AUTOSTART_MS.many);assert.equal(r.phase,'choosing');assert.equal(r.settings.mode,'chaos');
 for(let turn=0;turn<3;turn++){advance(17000);advance(76000);assert.equal(r.phase,'reveal');advance(7000);}
 assert.equal(r.phase,'ended');advance(RESULTS_MS-1000);assert.equal(r.phase,'ended');advance(1500);assert.equal(r.phase,'lobby');
 advance(250);assert.ok(r.autoStartAt>0);advance(AUTOSTART_MS.many+500);assert.equal(r.phase,'choosing');
});
test('late joiners can enter an open match mid-turn and play from the next turn',()=>{
 const {g,advance,player}=lobbyGame();const a=player(),b=player();g.handle(a,'quick',{name:'A'});g.handle(b,'quick',{name:'B'});const r=g.rooms.get(a.room);advance(250);advance(AUTOSTART_MS.two+250);assert.equal(r.phase,'choosing');
 const late=player();g.handle(late,'quick',{name:'Sen'});assert.equal(late.room,r.code);assert.equal(late.spectator,true);assert.equal(g.view(r,late).you.role,'spectator');
 advance(17000);advance(76000);advance(7000);assert.equal(late.spectator,false);assert.ok(r.order.includes(late.id));
});
test('vote-kick in open matches: more than half of the other online players, votes expire after a minute',()=>{
 const {g,advance,player}=lobbyGame();const ps=[0,1,2,3].map(()=>player());for(const [i,p] of ps.entries())g.handle(p,'quick',{name:'P'+i});const r=g.rooms.get(ps[0].room);const [a,b,c,target]=ps;
 assert.throws(()=>g.handle(a,'kick',{id:target.id}),/värden/,'No host kick in open matches');assert.throws(()=>g.handle(a,'vote',{id:a.id}),/annan/);
 g.handle(a,'vote',{id:target.id});assert.deepEqual(g.view(r,a).players.find(x=>x.id===target.id).kick,{votes:1,need:2,mine:true});assert.equal(g.view(r,b).players.find(x=>x.id===target.id).kick.mine,false);
 g.handle(a,'vote',{id:target.id});assert.equal(g.view(r,a).players.find(x=>x.id===target.id).kick.votes,0,'Voting again withdraws');
 g.handle(a,'vote',{id:target.id});advance(VOTE_MS+1000);assert.equal(g.view(r,a).players.find(x=>x.id===target.id).kick.votes,0,'Votes expire');
 g.handle(b,'vote',{id:target.id});assert.ok(r.players.has(target.id));g.handle(c,'vote',{id:target.id});
 assert.ok(!r.players.has(target.id));assert.equal(target.room,null);assert.deepEqual(target.peer.messages.at(-1),{type:'kicked',data:{vote:true}});assert.ok(r.chat.at(-1).text.includes('röstades ut'));
 assert.throws(()=>g.handle(target,'join',{code:r.code,name:'Igen'}),/togs bort/);g.handle(target,'quick',{name:'Igen'});assert.notEqual(target.room,r.code);
 const t=setup();assert.throws(()=>t.g.handle(t.players[1],'vote',{id:t.players[2].id}),/öppna matcher/);t.g.handle(t.players[0],'kick',{id:t.players[2].id});assert.equal(t.r.players.size,2,'Host kick stays in private rooms');
});
test('English rooms use English prompts, English guesses and per-player languages',()=>{
 assert.ok(BANKS.en.length>1000);assert.ok(BANKS.en.filter(p=>p.safe).length>300);assert.ok(BANKS.en.every(p=>p.id.startsWith('en-')));
 assert.ok(BANKS.en.filter(p=>!p.safe).every(p=>!getChoices({pack:'mix',safe:true},new Set(),'en').includes(p)));
 for(const pack of ['easy','chaos','swedish','nerd'])assert.equal(getChoices({pack,safe:true},new Set(),'en').length,3,pack);
 let time=1000000;const g=new Game({now:()=>time});const host=g.connect(new Peer(),null,{lang:'en'}),guest=g.connect(new Peer(),null,{lang:'en'}),swede=g.connect(new Peer(),null,{lang:'sv'});
 const {room}=g.handle(host,'create',{name:'Ann'});const r=g.rooms.get(room);assert.equal(r.lang,'en');assert.ok(r.chat[0].text.includes('opened the room'));
 g.handle(guest,'join',{code:room,name:'Bob'});g.handle(swede,'join',{code:room,name:'Sven'});
 assert.throws(()=>g.handle(guest,'start'),/Only the host/);assert.throws(()=>g.handle(swede,'start'),/Bara värden/);
 g.handle(host,'start');assert.ok(r.choices.length===3&&r.choices.every(p=>p.id.startsWith('en-')));
 r.choices[0]=BANKS.en.find(p=>p.answer==='raccoon');g.handle(host,'choose',{index:0});
 assert.equal(g.handle(guest,'guess',{text:'pigeon'}).correct,false);assert.equal(g.handle(guest,'guess',{text:'raccon'}).close,true);
 assert.equal(g.handle(guest,'guess',{text:'A trash panda!'}).correct,true);assert.ok(r.chat.at(-1).text.includes('got it'));
 g.handle(swede,'guess',{text:'Raccoon'});assert.equal(r.phase,'reveal');assert.equal(r.reason,'Everyone got it!');
 g.handle(swede,'lang',{lang:'en'});assert.throws(()=>g.handle(swede,'settings',{}),/Only the host/);assert.throws(()=>g.handle(swede,'lang',{lang:'de'}),/Invalid/);
 r.modifier={id:'mono',duration:1,endsAt:time+1};assert.equal(g.view(r,host).modifier.name,'One single colour');g.handle(swede,'lang',{lang:'sv'});assert.equal(g.view(r,swede).modifier.name,'En enda färg');
});

// ---- Ritkaos+ ----
import { mintCode, verifyCode, normalizeCode, storeInfo } from '../lib/store.mjs';
import { SPEED, TEL } from '../lib/game.mjs';
import { PACKS } from '../lib/packs.mjs';
const SECRET='test-secret-for-ritkaos-plus';
function plusSetup(n=3,{hostCodes=[],guestCodes=[]}={}){
 let time=1000000;const g=new Game({now:()=>time,secret:SECRET});const players=Array.from({length:n},()=>g.connect(new Peer()));
 return {g,players,advance:ms=>{time+=ms;g.tick();},now:()=>time,async open(){
  await g.unlock(players[0],hostCodes);for(const p of players.slice(1))await g.unlock(p,guestCodes);
  const {room}=g.handle(players[0],'create',{name:'Värd'});for(let i=1;i<n;i++)g.handle(players[i],'join',{code:room,name:'G'+i});
  return g.rooms.get(room);
 }};
}
test('unlock codes: valid, tampered, wrong secret, wrong product, no secret',async()=>{
 const code=await mintCode(SECRET,['office','speed']);assert.match(code,/^RK-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/);
 assert.deepEqual(await verifyCode(SECRET,code),['office','speed']);assert.deepEqual(await verifyCode(SECRET,code.toLowerCase().replace(/-/g,' ')),['office','speed']);
 const last=code.at(-1),tampered=code.slice(0,-1)+(last==='0'?'1':'0');assert.equal(await verifyCode(SECRET,tampered),null);
 // Flipping a product bit without the MAC must fail too.
 const head=code[3],swapped=code.slice(0,3)+(head==='0'?'2':'0')+code.slice(4);assert.equal(await verifyCode(SECRET,swapped),null);
 assert.equal(await verifyCode('another-secret-entirely',code),null);assert.equal(await verifyCode('',code),null);assert.equal(await verifyCode('short',code),null);
 assert.equal(normalizeCode('nonsense'),'');await assert.rejects(mintCode(SECRET,['ponies']),/Unknown product/);await assert.rejects(mintCode('',['plus']),/missing/);
 const t=plusSetup(2,{hostCodes:[code]});const r=await t.open();
 assert.throws(()=>t.g.handle(t.players[0],'settings',{pack:'nineties'}),/Ritkaos\+/,'An office code does not unlock the 90s pack');
 t.g.handle(t.players[0],'settings',{pack:'office',mode:'speed'});assert.equal(r.settings.pack,'office');assert.equal(r.settings.mode,'speed');
 const off=new Game({secret:''}),p=off.connect(new Peer());await off.unlock(p,[code]);assert.equal(p.owned.size,0,'Fails closed without a secret');
 await assert.rejects(off.handle(p,'redeem',{code}),/går inte att lösa in/);
 assert.deepEqual(storeInfo({secret:'',checkout:'javascript:alert(1)'}),{ready:false,checkout:'',products:storeInfo({}).products});assert.equal(storeInfo({secret:SECRET,checkout:'https://pay.example/x'}).checkout,'https://pay.example/x');
});
test('redeem: bad codes are rejected, good codes unlock and notify the player',async()=>{
 const t=plusSetup(1);const p=t.players[0];
 await assert.rejects(t.g.handle(p,'redeem',{code:'RK-0000-0000-0000'}),/fungerade inte/);await assert.rejects(t.g.handle(p,'redeem',{code:'hej'}),/fungerade inte/);
 const result=await t.g.handle(p,'redeem',{code:await mintCode(SECRET,['plus'])});assert.ok(result.products.includes('telephone')&&result.products.includes('cosmetics'));
 assert.ok(p.peer.messages.filter(m=>m.type==='owned').at(-1).data.products.includes('nineties'));
 for(let i=0;i<3;i++)await t.g.handle(p,'redeem',{code:'RK-0000-0000-000'+i}).catch(()=>{});await assert.rejects(t.g.handle(p,'redeem',{code:'x'}),/långsammare/,'Redeem is rate limited');
});
test('a host-owned pack is played by everyone; a guest-owned pack does not enable the room',async()=>{
 const host=plusSetup(3,{hostCodes:[await mintCode(SECRET,['nineties'])]});const r=await host.open();
 assert.deepEqual(host.g.view(r,host.players[1]).unlocked,['nineties']);host.g.handle(host.players[0],'settings',{pack:'nineties'});host.g.handle(host.players[0],'start');
 assert.ok(r.choices.length===3&&r.choices.every(c=>c.pack==='nineties'));host.g.handle(host.players[0],'choose',{index:0});
 assert.equal(host.g.handle(host.players[1],'guess',{text:r.prompt.answer}).correct,true,'Guests without the pack play it');
 const guest=plusSetup(3,{guestCodes:[await mintCode(SECRET,['nineties','plus'])]});const r2=await guest.open();
 assert.deepEqual(guest.g.view(r2,guest.players[1]).unlocked,[]);
 assert.throws(()=>guest.g.handle(guest.players[0],'settings',{pack:'nineties'}),/Ritkaos\+/);assert.throws(()=>guest.g.handle(guest.players[1],'settings',{pack:'nineties'}),/värden/);
 assert.equal(r2.settings.pack,'mix');
 for(const lang of ['sv','en'])for(const [id,list] of Object.entries(PACKS[lang])){assert.ok(list.length>=58,id+lang);assert.equal(getChoices({pack:id,safe:true},new Set(),lang).length,3);assert.ok(getChoices({pack:'mix'},new Set(),lang).every(c=>!PACKS.sv[c.pack]),'mix stays free');}
});
test('locked items are rejected server-side, a new host cannot start them, open matches stay free',async()=>{
 const t=plusSetup(3);const r=await t.open();
 for(const data of [{mode:'blind'},{mode:'speed'},{mode:'telephone'},{pack:'office'},{pack:'internet',rounds:3}])assert.throws(()=>t.g.handle(t.players[0],'settings',data),/Ritkaos\+/,JSON.stringify(data));
 assert.equal(r.settings.rounds,2,'Nothing applies when a locked item is rejected');
 const owner=plusSetup(3,{hostCodes:[await mintCode(SECRET,['plus'])]});const r2=await owner.open();owner.g.handle(owner.players[0],'settings',{mode:'blind',pack:'food'});
 owner.g.handle(owner.players[0],'leave');assert.notEqual(r2.host,owner.players[0].id);assert.throws(()=>owner.g.handle(owner.g.rooms.get(r2.code).players.get(r2.host),'start'),/Ritkaos\+/);
 // Cosmetics: brush styles are kept only for owners.
 const c=plusSetup(2,{hostCodes:[await mintCode(SECRET,['cosmetics'])]});const r3=await c.open();c.g.handle(c.players[0],'start');c.g.handle(c.players[0],'choose',{index:0});
 const artist=r3.players.get(r3.artists[0]);c.g.handle(artist,'stroke.begin',{epoch:r3.epoch,stroke:'n',point:[.1,.1],style:'neon'});c.g.handle(artist,'stroke.begin',{epoch:r3.epoch,stroke:'e',point:[.1,.1],style:'neon',eraser:true});
 assert.equal(r3.ops[0].style,'neon');assert.equal(r3.ops[1].style,undefined);
 const free=plusSetup(2);const r4=await free.open();free.g.handle(free.players[0],'start');free.g.handle(free.players[0],'choose',{index:0});
 free.g.handle(free.players[0],'stroke.begin',{epoch:r4.epoch,stroke:'n',point:[.1,.1],style:'neon'});assert.equal(r4.ops[0].style,undefined,'Non-owners draw with the free pen');
 const {g,player}=lobbyGame();const q=player();await g.unlock(q,[]);g.handle(q,'quick',{name:'Q'});assert.throws(()=>g.handle(q,'settings',{mode:'speed'}),/fasta/);assert.deepEqual(g.view(g.rooms.get(q.room),q).unlocked,[]);
});
test('blind draw: the artist never receives their own ink until the reveal',async()=>{
 const t=plusSetup(3,{hostCodes:[await mintCode(SECRET,['blind'])]});const r=await t.open();t.g.handle(t.players[0],'settings',{mode:'blind',rounds:1});t.g.handle(t.players[0],'start');t.g.handle(t.players[0],'choose',{index:0});
 const [a,b]=t.players;const before=a.peer.messages.length;
 t.g.handle(a,'stroke.begin',{epoch:r.epoch,stroke:'s',point:[.2,.2],cid:1});t.g.handle(a,'stroke.points',{epoch:r.epoch,stroke:'s',points:[[.5,.5]],cid:2});
 assert.equal(a.peer.messages.slice(before).filter(m=>m.type==='ink').length,0);assert.equal(b.peer.messages.filter(m=>m.type==='ink').length,2);
 t.g.handle(a,'sync');assert.equal(a.peer.messages.filter(m=>m.type==='board').at(-1).data.ops.length,0);assert.equal(t.g.boardView(b,r).ops.length,2);
 t.g.handle(a,'undo',{epoch:r.epoch});assert.equal(a.peer.messages.filter(m=>m.type==='board').at(-1).data.ops.length,0);
 t.g.handle(a,'stroke.begin',{epoch:r.epoch,stroke:'t',point:[.3,.3]});
 for(const p of t.players.slice(1))t.g.handle(p,'guess',{text:r.prompt.answer});assert.equal(r.phase,'reveal');
 assert.equal(a.peer.messages.filter(m=>m.type==='board').at(-1).data.ops.length,1,'Reveal shows the artist the drawing');
});
test('speed round: short timers, twice the turns, bonus for fast guesses',async()=>{
 const t=plusSetup(2,{hostCodes:[await mintCode(SECRET,['speed'])]});const r=await t.open();t.g.handle(t.players[0],'settings',{mode:'speed',rounds:2,seconds:120});
 t.g.handle(t.players[0],'start');assert.equal(r.deadline-t.now(),SPEED.choose);assert.equal(t.g.view(r,t.players[0]).totalRounds,4);
 t.g.handle(t.players[0],'choose',{index:0});assert.equal(r.duration,SPEED.draw,'Timer setting is ignored');t.advance(2000);
 const fast=t.g.handle(t.players[1],'guess',{text:r.prompt.answer});assert.ok(fast.points>=SPEED.bonus+100+50+300);assert.ok(r.chat.at(-1).text.includes('blixtsnabbt'));
 assert.equal(r.phase,'reveal');assert.equal(r.deadline-t.now(),SPEED.reveal);t.advance(SPEED.reveal+10);t.g.handle(r.players.get(r.artists[0]),'choose',{index:0});t.advance(SPEED.fastMs+1000);
 const slow=t.g.handle(t.players[0],'guess',{text:r.prompt.answer});assert.ok(!r.chat.at(-1).text.includes('blixtsnabbt'));assert.ok(slow.points<SPEED.bonus+100+50+400*(1-(SPEED.fastMs+1000)/SPEED.draw)+10);
 for(let i=0;i<400&&r.phase!=='ended';i++)t.advance(1000);assert.equal(r.phase,'ended');assert.equal(r.turn,8,'2 players × 4 rounds');
});
test('telephone: write, draw, guess with private canvases, auto-fill, chain reveal, back to lobby',async()=>{
 const two=plusSetup(2,{hostCodes:[await mintCode(SECRET,['telephone'])]});await two.open();two.g.handle(two.players[0],'settings',{mode:'telephone'});assert.throws(()=>two.g.handle(two.players[0],'start'),/3/);
 const t=plusSetup(3,{hostCodes:[await mintCode(SECRET,['telephone'])]});const r=await t.open();const [a,b,c]=t.players;t.g.handle(a,'settings',{mode:'telephone',seconds:60});t.g.handle(a,'start');
 assert.equal(r.phase,'twrite');assert.equal(t.g.view(r,a).tel.task,'write');assert.equal(t.g.view(r,a).tel.steps,3);
 t.g.handle(a,'tsubmit',{text:'En duva på skidor'});assert.throws(()=>t.g.handle(a,'tsubmit',{text:'igen'}),/redan klar/);t.g.handle(b,'tsubmit',{text:'En glad gurka'});
 assert.throws(()=>t.g.handle(a,'stroke.begin',{epoch:r.epoch,stroke:'x',point:[.1,.1]}),/ritar inte/);
 t.advance(TEL.write+10);assert.equal(r.phase,'tdraw','Deadline moves on and fills in the missing prompt');
 const va=t.g.view(r,a),vb=t.g.view(r,b),vc=t.g.view(r,c);assert.equal(va.tel.task,'draw');assert.equal(va.you.role,'artist');
 // Each player draws the text from the previous player in their chain, and nobody sees anybody else's text.
 assert.equal(vb.tel.text,'En duva på skidor');assert.equal(vc.tel.text,'En glad gurka');assert.ok(va.tel.text.length>0);assert.ok(!JSON.stringify(vc).includes('duva på skidor'));
 assert.notEqual(va.epoch,vb.epoch);const before=c.peer.messages.filter(m=>m.type==='ink').length;
 t.g.handle(b,'stroke.begin',{epoch:vb.epoch,stroke:'b1',point:[.2,.2]});t.g.handle(b,'stroke.points',{epoch:vb.epoch,stroke:'b1',points:[[.6,.6]]});
 assert.equal(b.peer.messages.filter(m=>m.type==='ink').length,2);assert.equal(c.peer.messages.filter(m=>m.type==='ink').length,before,'Ink stays private');
 assert.throws(()=>t.g.handle(b,'stroke.begin',{epoch:va.epoch,stroke:'b2',point:[.2,.2]}),/bytts/);
 for(const p of t.players)t.g.handle(p,'tdone');assert.throws(()=>t.g.handle(b,'stroke.begin',{epoch:vb.epoch,stroke:'b3',point:[.2,.2]}),/ritar inte/);
 t.advance(250);assert.equal(r.phase,'tguess','Everyone done moves on early');
 // c guesses the drawing b made (chain of a).
 assert.equal(t.g.view(r,c).epoch,vb.epoch);assert.equal(c.peer.messages.filter(m=>m.type==='board').at(-1).data.ops.length,2);assert.equal(t.g.view(r,c).you.role,'guesser');
 t.g.handle(c,'tsubmit',{text:'en fågel'});t.advance(TEL.guess+10);
 assert.equal(r.phase,'treveal');const chain=c.peer.messages.filter(m=>m.type==='chain').at(-1).data;
 assert.equal(chain.index,0);assert.equal(chain.count,3);assert.equal(chain.name,'Värd');assert.deepEqual(chain.steps.map(s=>s.kind),['text','drawing','text']);
 assert.equal(chain.steps[0].text,'En duva på skidor');assert.equal(chain.steps[1].ops.length,2);assert.equal(chain.steps[2].text,'en fågel');
 const blank=r.tel.chains[1].steps[2];assert.equal(blank.text,'(ingen gissning)');assert.equal(blank.auto,true);
 assert.throws(()=>t.g.handle(b,'tnext'),/värden/);t.g.handle(a,'tnext');assert.equal(r.tel.show,1);t.advance(r.duration+10);assert.equal(r.tel.show,2);
 t.g.disconnect(b,b.peer);const back=new Peer();t.g.connect(back,b.token);assert.equal(back.messages.find(m=>m.type==='chain').data.index,2,'Reconnecting mid-reveal restores the chain');
 const late=t.g.connect(new Peer());t.g.handle(late,'join',{code:r.code,name:'Sen'});assert.equal(late.spectator,true);assert.equal(late.peer.messages.filter(m=>m.type==='chain').at(-1).data.index,2);
 t.g.handle(a,'tnext');assert.equal(r.phase,'lobby');assert.ok(r.chat.at(-1).text.includes('kedjor'));assert.equal(r.tel,null);
});
test('telephone survives a player dropping out mid-chain',async()=>{
 const t=plusSetup(4,{hostCodes:[await mintCode(SECRET,['telephone'])]});const r=await t.open();t.g.handle(t.players[0],'settings',{mode:'telephone'});t.g.handle(t.players[0],'start');
 t.g.disconnect(t.players[3],t.players[3].peer);for(const p of t.players.slice(0,3))t.g.handle(p,'tsubmit',{text:'x '+p.name});t.advance(250);assert.equal(r.phase,'tdraw','Offline players do not block');
 t.advance(r.duration+10);t.advance(TEL.guess+10);t.advance(r.duration+10);assert.equal(r.phase,'treveal');assert.ok(r.tel.chains.every(c=>c.steps.length===4));
});
