import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, grantVerificationFromEnv } from '../lib/game.mjs';
import { mintCode } from '../lib/store.mjs';
import { snapshot, restore } from '../lib/snapshot.mjs';
import { createGrantSigner } from '../../ludvig-games/commerce/grant.mjs';

const SECRET='operator-proof-legacy-test-secret';
const KEY='00000000-0000-4000-8000-000000000099';
class Peer {
  constructor(){this.messages=[];}
  send(value){this.messages.push(structuredClone(value));}
  close(){}
}
async function fixture(environment='test') {
  let time=1800000000000;
  const pair=await crypto.subtle.generateKey({name:'Ed25519'},true,['sign','verify']);
  const privateJwk=await crypto.subtle.exportKey('jwk',pair.privateKey);
  const publicJwk=await crypto.subtle.exportKey('jwk',pair.publicKey);
  const publicKeys={'test-operator':publicJwk},storeId='504842';
  const verification={publicKeys,storeId,environment};
  const sign=createGrantSigner({privateJwk,kid:'test-operator',storeId,environment,now:()=>time});
  const game=new Game({secret:SECRET,now:()=>time,licenseEnvironment:environment,grantVerification:verification});
  const connect=(g=game,token)=>{const peer=new Peer(),player=g.connect(peer,token);return {peer,player,welcome:peer.messages.find(message=>message.type==='welcome').data};};
  const proof=welcome=>sign({entitlements:['ritkaos'],audience:welcome.licenseAudience,challenge:welcome.licenseChallenge});
  return {game,verification,publicJwk,connect,proof,advance:ms=>{time+=ms;},now:()=>time};
}

test('verified operator proof grants Plus to its actual connection and unlocks private host settings',async()=>{
  const f=await fixture(),{player,welcome}=f.connect();
  f.game.handle(player,'create',{name:'Host'});
  const result=await f.game.handle(player,'license-grant',{proof:await f.proof(welcome)});
  assert.deepEqual(result.added,['plus']);assert.ok(result.products.includes('plus'));
  await f.game.handle(player,'settings',{pack:'office'});
  assert.ok(player.owned.has('plus'));
  assert.equal(f.game.nativeCodes.get(player).length,0,'no bearer licence is supplied to the room host');
});

test('proof replay on another connection, reconnect or game instance fails',async()=>{
  const f=await fixture(),first=f.connect(),proof=await f.proof(first.welcome);
  await f.game.handle(first.player,'license-grant',{proof});
  const other=f.connect();
  await assert.rejects(f.game.handle(other.player,'license-grant',{proof}));
  assert.deepEqual([...other.player.owned],[]);
  const again=f.connect(f.game,first.player.token);
  assert.notEqual(again.welcome.licenseChallenge,first.welcome.licenseChallenge);
  assert.deepEqual([...again.player.owned],[]);
  await assert.rejects(f.game.handle(again.player,'license-grant',{proof}));
  const nextGame=new Game({grantVerification:f.verification,now:f.now});
  const next=f.connect(nextGame);
  assert.notEqual(next.welcome.licenseAudience,first.welcome.licenseAudience);
  await assert.rejects(nextGame.handle(next.player,'license-grant',{proof}));
});

test('a proof still being checked cannot grant ownership after its socket is replaced',async()=>{
  const f=await fixture(),first=f.connect(),proof=await f.proof(first.welcome);
  const pending=f.game.handle(first.player,'license-grant',{proof});
  const next=f.connect(f.game,first.player.token);
  await assert.rejects(pending);
  assert.deepEqual([...next.player.owned],[]);
});

test('expiry removes only operator ownership and requests a refreshed connection-bound proof',async()=>{
  const f=await fixture(),{player,peer,welcome}=f.connect();
  f.game.handle(player,'create',{name:'Host'});
  await f.game.handle(player,'redeem',{code:await mintCode(SECRET,['office'])});
  await f.game.handle(player,'license-grant',{proof:await f.proof(welcome)});
  f.advance(60001);
  await f.game.handle(player,'settings',{pack:'office'});
  assert.deepEqual([...player.owned],['office']);
  assert.throws(()=>f.game.handle(player,'settings',{pack:'nineties'}));
  const refresh=peer.messages.find(message=>message.type==='license-refresh');
  assert.equal(refresh.data.licenseAudience,welcome.licenseAudience);
  assert.equal(refresh.data.licenseChallenge,welcome.licenseChallenge);
});

test('clearing and rejecting proofs preserve independent native and legacy grants',async()=>{
  const f=await fixture();
  f.game.resolveLicense=async()=>({ok:true,environment:'test',entitlements:['ritkaos']});
  const {player,welcome}=f.connect();
  await f.game.handle(player,'redeem',{code:await mintCode(SECRET,['office'])});
  await f.game.unlock(player,[KEY]);
  await f.game.handle(player,'license-grant',{proof:await f.proof(welcome)});
  await f.game.handle(player,'license-grant',{proof:null});
  assert.deepEqual([...player.owned].sort(),['office','plus']);
  await f.game.handle(player,'license-grant',{proof:await f.proof(welcome)});
  await f.game.unlock(player,[]);
  assert.ok(player.owned.has('plus'),'native refresh must preserve the independent valid operator grant');
  await assert.rejects(f.game.handle(player,'license-grant',{proof:'not-an-operator-proof'}));
  assert.deepEqual([...player.owned],['office']);
});

test('operator proofs, challenges and their ownership never enter hibernation snapshots',async()=>{
  const f=await fixture(),{player,welcome}=f.connect();
  f.game.handle(player,'create',{name:'Host'});
  await f.game.handle(player,'redeem',{code:await mintCode(SECRET,['office'])});
  const proof=await f.proof(welcome);
  await f.game.handle(player,'license-grant',{proof});
  const saved=snapshot(f.game);
  for(const secret of [proof,welcome.licenseAudience,welcome.licenseChallenge])assert.equal(saved.includes(secret),false);
  const next=new Game({secret:SECRET,grantVerification:f.verification,now:f.now});
  assert.equal(restore(next,saved),true);
  assert.deepEqual([...next.sessions.get(player.token).owned],['office']);
});

test('game proof validation rejects wrong store, environment, signing key and missing configuration',async()=>{
  const f=await fixture('live');
  for(const changed of [null,{...f.verification,storeId:'1'},
    {...f.verification,environment:'test'},{...f.verification,publicKeys:{other:f.publicJwk}}]){
    const game=new Game({licenseEnvironment:'live',grantVerification:changed,now:f.now});
    const {player,welcome}=f.connect(game);
    await assert.rejects(game.handle(player,'license-grant',{proof:await f.proof(welcome)}));
    assert.deepEqual([...player.owned],[]);
  }
});

test('environment loading accepts only public verifier keys and keeps malformed settings closed',async()=>{
  const f=await fixture();
  const env={LS_STORE_ID:'504842',LS_GRANT_PUBLIC_KEYS:JSON.stringify(f.verification.publicKeys)};
  assert.deepEqual(grantVerificationFromEnv(env,'test'),f.verification);
  for(const bad of ['{','null','{}',JSON.stringify({key:{...f.publicJwk,d:'must-never-be-bundled'}})]){
    assert.equal(grantVerificationFromEnv({...env,LS_GRANT_PUBLIC_KEYS:bad},'test'),null);
  }
  assert.equal(grantVerificationFromEnv(env,''),null);
});
