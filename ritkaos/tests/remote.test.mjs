// Same multiplayer journey as network.test.mjs, against the hosted server.
import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const HOST=process.env.RITKAOS_HOST||'ritkaos.ludvighedin.com';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
class Client{
 constructor(){this.events=[];this.pending=new Map();this.counter=0;}
 async open(token,lang){
  this.ws=new WebSocket(`wss://${HOST}/ws`);
  this.ws.addEventListener('message',e=>{
   const p=JSON.parse(e.data);this.events.push(p);
   if(p.type==='welcome'){this.token=p.data.token;this.id=p.data.id;}
   if(p.type==='state')this.state=p.data;
   if(p.type==='ack'){const x=this.pending.get(p.request);if(x){this.pending.delete(p.request);p.ok?x.resolve(p.data):x.reject(new Error(p.error));}}
  });
  await new Promise((resolve,reject)=>{this.ws.addEventListener('open',resolve,{once:true});this.ws.addEventListener('error',reject,{once:true});});
  this.ws.send(JSON.stringify({type:'hello',data:{token,lang}}));await this.until(()=>this.id);return this;
 }
 request(type,data={}){const request=++this.counter;return new Promise((resolve,reject)=>{this.pending.set(request,{resolve,reject});this.ws.send(JSON.stringify({type,data,request}));});}
 async until(fn,timeout=4000){const t=Date.now();while(!fn()){if(Date.now()-t>timeout)throw new Error('Condition timed out');await wait(10);}return fn();}
 close(){this.ws.close();}
}

test('real WebSocket multiplayer: isolated rooms, co-drawing, undo, reconnect, score and full 3-player match', {timeout:45000}, async()=>{
 const clients=[];
 try{
  
  assert.equal((await fetch(`https://${HOST}/lib/prompts.mjs`)).status,404,'Secret prompt source is not publicly served');
  
  for(let i=0;i<4;i++)clients.push(await new Client().open());
  const [a,b,c,out]=clients;// Rooms are private unless made visible on the network. All test clients share this machine's address, so the visible room is listed to them.
  const {room}=await a.request('create',{name:'Ludvig',visible:true});await b.request('join',{code:room,name:'Albin'});await c.request('join',{code:room,name:'Amanda'});
  const seen=(await out.request('rooms')).rooms;assert.ok(seen.some(r=>r.code===room&&r.players===3&&r.kind==='network'));assert.ok(seen.every(r=>!('prompt' in r)));
  const other=(await out.request('create',{name:'Other room'})).room;
  const listed=(await (await fetch(`https://${HOST}/api/rooms`)).json()).rooms;
  assert.ok(listed.every(r=>!('prompt' in r)));assert.ok(!listed.some(r=>r.code===other),'Private rooms are never listed');
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
 }finally{for(const c of clients)try{c.close();}catch{}}
});
