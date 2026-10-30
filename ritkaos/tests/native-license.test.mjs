import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../lib/game.mjs';
import { mintCode, storeInfo, PRODUCTS } from '../lib/store.mjs';
import { snapshot, restore } from '../lib/snapshot.mjs';

const KEY = '12345678-1234-1234-1234-123456789abc';
const OTHER = '22345678-1234-1234-1234-123456789abc';
const SECRET = 'native-license-test-legacy-secret';
class Peer {
  constructor() { this.messages=[]; }
  send(value) { this.messages.push(structuredClone(value)); }
  close() {}
}
const accepted = entitlements => ({ok:true,environment:'test',entitlements});
const invalid = () => { const error=new Error('Provider data must not reach a player');error.code='invalid-license';throw error; };

test('drawing commands preserve wire order during a pending licence refresh',async()=>{
  let now=1000,finish,wait=false;
  const g=new Game({now:()=>now,resolveLicense:()=>wait?new Promise(resolve=>{finish=resolve;}):Promise.resolve(accepted(['ritkaos']))});
  const p=g.connect(new Peer());g.handle(p,'create',{name:'Host'});await g.unlock(p,[KEY]);
  const seen=[];g.draw=(_player,_room,type)=>{seen.push(type);return {};};
  wait=true;now+=30001;
  const begin=g.handle(p,'stroke.begin',{}),points=g.handle(p,'stroke.points',{}),end=g.handle(p,'stroke.end',{});
  assert.deepEqual(seen,[]);
  finish(accepted(['ritkaos']));await Promise.all([begin,points,end]);
  assert.deepEqual(seen,['stroke.begin','stroke.points','stroke.end']);
});

test('native Ritkaos/bundle entitlement unlocks the nine extras without a legacy secret', async()=>{
  for(const entitlements of [['ritkaos'],['ritkaos','pigeon','karts']]){
    const g=new Game({resolveLicense:async key=>{assert.equal(key,KEY);return accepted(entitlements);}});
    const p=g.connect(new Peer());
    const result=await g.handle(p,'redeem',{code:KEY.toUpperCase()});
    assert.equal(result.products.length,10);
    assert.ok(result.products.includes('telephone')&&result.products.includes('cosmetics'));
    assert.ok(!result.products.includes('pigeon')&&!result.products.includes('karts'));
    assert.ok(!JSON.stringify(p.peer.messages).includes(KEY));
  }
});

test('wrong game, wrong environment, invalid keys and absent resolver fail closed',async()=>{
  for(const resolveLicense of [async()=>accepted(['pigeon']),async()=>({...accepted(['ritkaos']),environment:'live'}),async()=>invalid(),null]){
    const g=new Game({resolveLicense}),p=g.connect(new Peer());
    await assert.rejects(g.handle(p,'redeem',{code:KEY}));
    assert.deepEqual([...p.owned],[]);
  }
  const g=new Game({resolveLicense:async()=>accepted(['ritkaos'])}),p=g.connect(new Peer());
  await assert.rejects(g.handle(p,'redeem',{code:'not-a-license'}));
  assert.deepEqual([...p.owned],[]);
});

test('legacy grants survive provider revocation and subsequent legacy redemption',async()=>{
  let valid=true,time=1000;
  const g=new Game({secret:SECRET,now:()=>time,resolveLicense:async()=>valid?accepted(['ritkaos']):invalid()});
  const p=g.connect(new Peer());
  await g.handle(p,'redeem',{code:await mintCode(SECRET,['office'])});
  await g.handle(p,'redeem',{code:KEY});
  await g.handle(p,'redeem',{code:await mintCode(SECRET,['speed'])});
  assert.ok(p.owned.has('plus'));
  valid=false;time+=30001;
  g.handle(p,'create',{name:'Host'});
  await g.handle(p,'settings',{pack:'office'});
  assert.deepEqual([...p.owned].sort(),['office','speed']);
  assert.throws(()=>g.handle(p,'settings',{pack:'nineties'}));
});

test('reconnecting clears provider ownership until the browser presents the key again',async()=>{
  const g=new Game({resolveLicense:async()=>accepted(['ritkaos'])});
  const p=g.connect(new Peer());await g.unlock(p,[KEY]);assert.ok(p.owned.has('plus'));
  const same=g.connect(new Peer(),p.token);
  assert.equal(same,p);assert.deepEqual([...p.owned],[]);
  await g.unlock(p,[KEY]);assert.ok(p.owned.has('plus'));
});

test('snapshots never persist native keys or their ownership; legacy ownership survives',async()=>{
  const g=new Game({secret:SECRET,resolveLicense:async()=>accepted(['ritkaos'])});
  const p=g.connect(new Peer());g.handle(p,'create',{name:'Host'});
  await g.handle(p,'redeem',{code:await mintCode(SECRET,['office'])});
  await g.handle(p,'redeem',{code:KEY});
  const text=snapshot(g);
  assert.ok(!text.includes(KEY));assert.ok(!text.includes('nativeOwned'));assert.ok(!text.includes('nativeUntil'));
  const restored=new Game({secret:SECRET,resolveLicense:async()=>accepted(['ritkaos'])});
  assert.equal(restore(restored,text),true);
  const next=restored.sessions.get(p.token);
  assert.deepEqual([...next.owned],['office']);
  await restored.unlock(next,[KEY]);assert.ok(next.owned.has('plus'));
});

test('a late verification cannot restore an older key over a newer empty refresh',async()=>{
  let finish;
  const g=new Game({resolveLicense:()=>new Promise(resolve=>{finish=resolve;})}),p=g.connect(new Peer());
  const pending=g.unlock(p,[KEY]);await g.unlock(p,[]);
  finish(accepted(['ritkaos']));await pending;
  assert.deepEqual([...p.owned],[]);
});

test('disabled key on deliberate redemption loses its prior native grant without provider error text',async()=>{
  let valid=true;
  const g=new Game({resolveLicense:async()=>valid?accepted(['ritkaos']):invalid()}),p=g.connect(new Peer());
  await g.handle(p,'redeem',{code:KEY});valid=false;
  await assert.rejects(g.handle(p,'redeem',{code:KEY}),e=>!e.message.includes('Provider data'));
  assert.deepEqual([...p.owned],[]);
});

test('native shop exposes only the exact configured test checkout; generic legacy URL cannot activate it',()=>{
  const off=storeInfo({secret:SECRET,checkout:'https://pay.example/anything',catalog:{ready:false,environment:'test',products:[]}});
  assert.equal(off.nativeReady,false);assert.equal(off.checkout,'');assert.equal(off.ready,true);
  const checkout='https://ludviggames.lemonsqueezy.com/buy/'+OTHER;
  const on=storeInfo({catalog:{ready:true,environment:'test',products:[{id:'ritkaos',checkout}]}});
  assert.equal(on.nativeReady,true);assert.equal(on.checkout,checkout);
  const live=storeInfo({catalog:{ready:true,environment:'live',products:[{id:'ritkaos',checkout}]}});
  assert.equal(live.nativeReady,false);assert.equal(live.checkout,'');
  assert.equal(PRODUCTS.find(p=>p.id==='plus').price,59);
});
