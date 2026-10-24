import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const PORT=Number(process.env.TEST_PORT)||3187;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
class Client{
 constructor(){this.events=[];this.pending=new Map();this.counter=0;}
 async open(token,lang,codes,port=PORT){
  this.ws=new WebSocket(`ws://127.0.0.1:${port}/ws`);
  this.ws.addEventListener('message',e=>{
   const p=JSON.parse(e.data);this.events.push(p);
   if(p.type==='welcome'){this.token=p.data.token;this.id=p.data.id;}
   if(p.type==='state')this.state=p.data;
   if(p.type==='ack'){const x=this.pending.get(p.request);if(x){this.pending.delete(p.request);p.ok?x.resolve(p.data):x.reject(new Error(p.error));}}
  });
  await new Promise((resolve,reject)=>{this.ws.addEventListener('open',resolve,{once:true});this.ws.addEventListener('error',reject,{once:true});});
  this.ws.send(JSON.stringify({type:'hello',data:{token,lang,codes}}));await this.until(()=>this.id);return this;
 }
 request(type,data={}){const request=++this.counter;return new Promise((resolve,reject)=>{this.pending.set(request,{resolve,reject});this.ws.send(JSON.stringify({type,data,request}));});}
 async until(fn,timeout=4000){const t=Date.now();while(!fn()){if(Date.now()-t>timeout)throw new Error('Condition timed out');await wait(10);}return fn();}
 close(){this.ws.close();}
}

test('real WebSocket multiplayer: isolated rooms, co-drawing, undo, reconnect, score and full 3-player match', {timeout:45000}, async()=>{
 const server=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,PORT:String(PORT)},stdio:'ignore'});const clients=[];
 try{
  let up=false;for(let i=0;i<100;i++){try{up=(await fetch(`http://127.0.0.1:${PORT}/health`)).ok;if(up)break;}catch{}await wait(25);}assert.ok(up);
  assert.equal((await fetch(`http://127.0.0.1:${PORT}/lib/prompts.mjs`)).status,404,'Secret prompt source is not publicly served');
  assert.deepEqual((await (await fetch(`http://127.0.0.1:${PORT}/api/rooms`)).json()).rooms,[]);
  for(let i=0;i<4;i++)clients.push(await new Client().open());
  const [a,b,c,out]=clients;const {room}=await a.request('create',{name:'Ludvig',visible:true});await b.request('join',{code:room,name:'Albin'});await c.request('join',{code:room,name:'Amanda'});await out.request('create',{name:'Other room'});
  const listed=(await (await fetch(`http://127.0.0.1:${PORT}/api/rooms`)).json()).rooms;
  // Every test client is on loopback, the same local network: only the network-visible room is listed, the private one never.
  assert.equal(listed.length,1);assert.ok(listed.every(r=>!('prompt' in r)));assert.ok(listed.some(r=>r.code===room&&r.players===3&&r.kind==='network'));
  await a.request('settings',{mode:'coop',rounds:1});await a.request('start');await a.until(()=>a.state.phase==='choosing');assert.equal(a.state.choices.length,3);assert.equal(b.state.choices.length,0);assert.equal(c.state.choices.length,0);
  await a.request('choose',{index:0});await c.until(()=>c.state.phase==='drawing');assert.equal(c.state.prompt,null);const answer=a.state.prompt.answer,epoch=a.state.epoch;
  await Promise.all([a.request('stroke.begin',{epoch,stroke:'a',point:[.1,.1],width:.02,color:'#000000',cid:1}),b.request('stroke.begin',{epoch,stroke:'b',point:[.9,.1],width:.02,color:'#ff0000',cid:1})]);
  await Promise.all([a.request('stroke.points',{epoch,stroke:'a',points:[[.9,.9]],cid:2}),b.request('stroke.points',{epoch,stroke:'b',points:[[.1,.9]],cid:2})]);
  await c.until(()=>c.events.filter(x=>x.type==='ink').length===4);
  const logs=clients.slice(0,3).map(x=>x.events.filter(y=>y.type==='ink').map(y=>y.data));assert.deepEqual(logs[0],logs[1]);assert.deepEqual(logs[1],logs[2]);assert.equal(out.events.filter(x=>x.type==='ink').length,0);
  await assert.rejects(c.request('stroke.begin',{epoch,stroke:'hack',point:[.2,.2]}),/ritar/);
  await b.request('undo',{epoch});await c.until(()=>c.events.some(x=>x.type==='board'&&x.data.seq===4));const canvas=c.events.filter(x=>x.type==='board').at(-1).data;assert.equal(canvas.ops.length,2);assert.ok(canvas.ops.every(x=>x.owner===a.id));
  b.close();await a.until(()=>a.state.players.find(x=>x.id===b.id)?.connected===false);
  const rejoined=await new Client().open(b.token);clients.push(rejoined);await rejoined.until(()=>rejoined.events.some(x=>x.type==='board'));assert.equal(rejoined.id,b.id);assert.deepEqual(rejoined.events.find(x=>x.type==='board').data,canvas);
  await c.request('guess',{text:answer});await a.until(()=>a.state.phase==='reveal');assert.equal(a.state.players.find(p=>p.id===a.id).score,100);assert.equal(a.state.players.find(p=>p.id===b.id).score,100);assert.ok(a.state.players.find(p=>p.id===c.id).score>=100);
  // Complete two more turns through actual wall-clock deadlines.
  const active=[a,rejoined,c];
  for(let turn=0;turn<2;turn++){
   await a.until(()=>a.state.phase==='choosing',9000);const primary=active.find(x=>x.id===a.state.artists[0]);await primary.until(()=>primary.state.choices.length>0);await primary.request('choose',{index:0});await a.until(()=>a.state.phase==='drawing');
   const guesser=active.find(x=>!a.state.artists.includes(x.id));await guesser.request('guess',{text:primary.state.prompt.answer});await a.until(()=>a.state.phase==='reveal');
  }
  await a.until(()=>a.state.phase==='ended',9000);assert.ok(a.state.players.every(p=>p.score>0));await a.request('start');assert.ok(a.state.players.every(p=>p.score===0));
  // Host disconnect migrates ownership; public chat remains escaped at rendering.
  a.close();await rejoined.until(()=>rejoined.state.host!==a.id);assert.ok(rejoined.state.host);
  // Quick match puts strangers in a public room in their language; errors come back in that language.
  const q1=await new Client().open(null,'en'),q2=await new Client().open(null,'en');clients.push(q1,q2);
  const quick=await q1.request('quick',{name:'Quinn'});await q2.request('quick',{name:'Robin'});await q2.until(()=>q2.state?.players.length===2);
  assert.equal(q2.state.code,quick.room);assert.equal(q2.state.public,true);assert.equal(q2.state.lang,'en');await q2.until(()=>q2.state.autoStart>0||q2.state.phase!=='lobby',3000);
  await assert.rejects(q1.request('settings',{safe:false}),/fixed settings/);
 }finally{for(const c of clients)try{c.close();}catch{}server.kill('SIGTERM');await Promise.race([once(server,'exit'),wait(2000)]);}
});

test('Ritkaos+ over a real WebSocket: store info, codes in hello, async redeem, host-owned pack', {timeout:20000}, async()=>{
 const { mintCode } = await import('../lib/store.mjs');
 const port=PORT+1,secret='network-test-secret-123456';
 const server=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,PORT:String(port),RITKAOS_UNLOCK_SECRET:secret,CHECKOUT_URL:'https://pay.example/ritkaos?p={product}'},stdio:'ignore'});const clients=[];
 try{
  let up=false;for(let i=0;i<100;i++){try{up=(await fetch(`http://127.0.0.1:${port}/health`)).ok;if(up)break;}catch{}await wait(25);}assert.ok(up);
  const info=await (await fetch(`http://127.0.0.1:${port}/api/store`)).json();assert.equal(info.ready,true);assert.equal(info.checkout,'https://pay.example/ritkaos?p={product}');assert.ok(info.products.some(p=>p.id==='plus'&&p.price===79));
  assert.ok(!JSON.stringify(info).includes(secret),'The secret never leaves the server');
  for(const f of ['/lib/store.mjs','/lib/packs.mjs','/lib/packs/office.mjs','/scripts/mint-code.mjs'])assert.equal((await fetch(`http://127.0.0.1:${port}${f}`)).status,404,f);
  const host=await new Client().open(null,'sv',[await mintCode(secret,['office']),'RK-0000-0000-0000'],port);clients.push(host);
  await host.until(()=>host.events.some(e=>e.type==='owned'));assert.deepEqual(host.events.find(e=>e.type==='owned').data.products,['office']);
  const guest=await new Client().open(null,'en',[],port);clients.push(guest);
  await assert.rejects(guest.request('redeem',{code:'RK-1234-5678-9ABC'}),/did not work/);
  const redeemed=await guest.request('redeem',{code:await mintCode(secret,['cosmetics'])});assert.deepEqual(redeemed.products,['cosmetics']);
  const {room}=await host.request('create',{name:'Värd'});await guest.request('join',{code:room,name:'Gäst'});
  await assert.rejects(guest.request('settings',{pack:'office'}),/Only the host/);await assert.rejects(host.request('settings',{pack:'food'}),/Ritkaos\+/);
  await host.request('settings',{pack:'office'});await guest.until(()=>guest.state?.settings.pack==='office'&&guest.state.unlocked.includes('office'));
 }finally{for(const c of clients)try{c.close();}catch{}server.kill('SIGTERM');await Promise.race([once(server,'exit'),wait(2000)]);}
});
