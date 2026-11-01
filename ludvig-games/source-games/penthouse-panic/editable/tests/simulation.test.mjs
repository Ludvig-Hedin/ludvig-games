import test from 'node:test';
import assert from 'node:assert/strict';
import {GameSimulation,cleanInput,dailySeed,FLOORS} from '../../simulation.js';

const solids=[
  {pos:[0,-.3,0],size:[24,.6,16]},
  {pos:[0,-1,11],size:[11,.4,5]},
  {pos:[-5.55,-.64,11],size:[.13,.6,5]},
  {pos:[5.55,-.64,11],size:[.13,.6,5]},
  {pos:[0,-.65,13.55],size:[11.2,.54,.12]},
];
function create(options={}) {
  const events=[];const sim=new GameSimulation(solids,[],event=>events.push(event));
  sim.reset({seed:987,mode:'practice',...options});sim.start();
  return {sim,events};
}
function advance(sim,seconds,inputs=[]) {
  for(let n=0;n<Math.ceil(seconds*60);n++)sim.step(1/60,inputs);
}
function prepareBox(sim,id=0,x=0,z=4.8,itemId=1) {
  const p=sim.players[id],item=sim.props[itemId];
  p.body.position.set(x,.9,z);p.body.velocity.setZero();p.face={x:0,z:1};
  item.body.position.set(x+.1,.5,z+.2);item.body.velocity.setZero();item.body.angularVelocity.setZero();item.body.quaternion.set(0,0,0,1);item.body.aabbNeedsUpdate=true;item.body.wakeUp();
  p.body.aabbNeedsUpdate=true;
  return {p,item};
}

test('sanitizes untrusted input and reset configuration',()=>{
  assert.deepEqual(cleanInput(null),{mx:0,mz:0,ax:0,az:0,act:false,jump:false,dash:false,drop:false});
  assert.deepEqual(cleanInput({mx:Infinity,mz:NaN,ax:NaN,az:-Infinity,act:1,jump:'true'}),cleanInput());
  const input=cleanInput({mx:99,mz:-99,ax:4,az:4,act:true});
  assert.ok(Math.abs(Math.hypot(input.mx,input.mz)-1)<1e-9);
  assert.ok(Math.abs(Math.hypot(input.ax,input.az)-1)<1e-9);
  const {sim}=create({level:NaN,players:1000,seed:Infinity,mode:'bogus'});
  assert.equal(sim.level,0);assert.equal(sim.players.length,2);assert.equal(sim.mode,'shift');assert.equal(sim.seed,12345);
  const before=sim.snapshot();sim.step(NaN);sim.step(Infinity);sim.step(-10);sim.releasePlayer(999);
  assert.equal(sim.elapsed,before.elapsed);assert.ok(Number.isFinite(sim.players[0].body.position.y));
});

test('pickup needs a separate second press before charging and throwing',()=>{
  const {sim,events}=create();const {p,item}=prepareBox(sim);
  sim.step(1/60,[{act:true}]);assert.equal(p.carry,item.id);assert.equal(p.charging,false);
  advance(sim,.15,[{act:true}]);sim.step(1/60,[{}]);
  assert.equal(p.carry,item.id);assert.equal(sim.totalThrows,0);
  advance(sim,.25,[{act:true,ax:0,az:1}]);assert.ok(p.charge>.23&&p.charge<.28);
  sim.step(1/60,[{}]);assert.equal(p.carry,null);assert.equal(item.carrier,null);assert.equal(sim.totalThrows,1);
  assert.equal(events.filter(e=>e.type==='throw').length,1);assert.ok(item.body.velocity.z>7);
});

test('a quarter-charge throw from spawn lands on the truck and scores once',()=>{
  const {sim,events}=create();const {p,item}=prepareBox(sim);
  sim.step(1/60,[{act:true}]);sim.step(1/60,[{}]);advance(sim,.25,[{act:true,az:1}]);sim.step(1/60,[{}]);
  advance(sim,1.8);
  assert.equal(item.delivered,true);assert.equal(sim.delivered,1);assert.ok(sim.score>=100);
  const score=sim.score;sim.deliver(item);advance(sim,1);
  assert.equal(sim.score,score);assert.equal(events.filter(e=>e.type==='score').length,1);
});

test('a prop flying below the cargo deck does not count as a delivery',()=>{
  const {sim}=create();const item=sim.props[1];
  item.body.position.set(0,-2,10);item.body.velocity.set(0,0,0);item.body.wakeUp();item.throwOrigin=[0,4];
  sim.step(1/60);assert.equal(item.delivered,false);assert.equal(sim.delivered,0);
});

test('a carried prop over the cargo deck cannot score',()=>{
  const {sim}=create();const {p,item}=prepareBox(sim);
  sim.step(1/60,[{act:true}]);p.body.position.set(0,.9,11);p.body.velocity.setZero();
  advance(sim,.4);assert.equal(item.carrier,p.id);assert.equal(item.delivered,false);assert.equal(sim.score,0);
});

test('a thrown box breaks each pane once and continues through the glass',()=>{
  const events=[];const sim=new GameSimulation(solids,[{pos:[-9,1.51,7.9],size:[5.4,2.75,.06]}],e=>events.push(e));
  sim.reset({mode:'practice'});sim.start();const item=sim.props[1];
  item.body.position.set(-9,1.7,6.7);item.body.quaternion.set(0,0,0,1);item.body.velocity.set(0,1,12);item.body.angularVelocity.setZero();item.body.aabbNeedsUpdate=true;
  item.thrown=0;item.throwOrigin=[-9,6.7];advance(sim,.25);
  assert.equal(sim.glass[0].broken,true);assert.equal(item.glassBonus,50);
  assert.equal(events.filter(e=>e.type==='glass').length,1);assert.ok(item.body.velocity.z>7);assert.ok(item.body.position.z>7.9);
  sim.reset({mode:'practice'});assert.equal(sim.glass[0].broken,false);assert.ok(sim.world.bodies.includes(sim.glass[0].body));
});

test('falling furniture respawns at its original position and can be recovered',()=>{
  const {sim,events}=create();const item=sim.props[1];
  item.body.position.set(18,-8,18);item.body.wakeUp();sim.step(1/60);
  assert.equal(sim.lost,1);assert.ok(item.respawn>0);
  advance(sim,1.4);assert.equal(item.respawn,0);assert.equal(item.delivered,false);assert.equal(item.carrier,null);
  assert.ok(Math.abs(item.body.position.x-item.spawn[0])<.1);assert.ok(item.body.position.y>0);
  assert.equal(events.filter(e=>e.type==='restore'&&e.id===item.id).length,1);
  const p=sim.players[0];p.body.position.set(item.body.position.x,.9,item.body.position.z);
  sim.step(1/60,[{act:true}]);assert.equal(p.carry,item.id);
});

test('falling player respawns, releases furniture, and costs only two seconds',()=>{
  const {sim}=create({mode:'shift'});const {p,item}=prepareBox(sim);
  sim.step(1/60,[{act:true}]);const before=sim.time;p.body.position.y=-7;sim.step(1/60,[{}]);
  assert.equal(sim.falls,1);assert.equal(p.carry,null);assert.equal(item.carrier,null);
  assert.ok(p.body.position.y>0);assert.ok(sim.time<before-2&&sim.time>before-2.1);
});

test('ground contacts support one jump; holding jump does not auto-bounce',()=>{
  const {sim,events}=create();advance(sim,.5);
  const p=sim.players[0];assert.equal(p.grounded,true);
  sim.step(1/60,[{jump:true}]);assert.ok(p.body.velocity.y>7.5);
  advance(sim,1.6,[{jump:true}]);assert.equal(events.filter(e=>e.type==='jump').length,1);assert.equal(p.grounded,true);
  sim.step(1/60,[{}]);sim.step(1/60,[{jump:true}]);assert.equal(events.filter(e=>e.type==='jump').length,2);
});

test('two local players own separate items and disconnect release is safe',()=>{
  const {sim}=create({players:2});const a=prepareBox(sim,0,-3,4.5,1),b=prepareBox(sim,1,3,4.5,8);
  sim.step(1/60,[{act:true},{act:true}]);
  assert.equal(a.p.carry,a.item.id);assert.equal(b.p.carry,b.item.id);assert.notEqual(a.p.carry,b.p.carry);
  assert.equal(a.item.carrier,0);assert.equal(b.item.carrier,1);
  sim.releasePlayer(1);assert.equal(b.p.carry,null);assert.equal(b.item.carrier,null);assert.equal(a.p.carry,a.item.id);
  sim.releasePlayer(1);assert.equal(sim.totalThrows,1);
});

test('finishing is idempotent and reset clears result, score, and bodies',()=>{
  const {sim,events}=create({mode:'shift'});
  for(const item of sim.props){item.throwOrigin=[0,4];sim.deliver(item);}
  sim.finish();const first=sim.score;assert.equal(sim.result.won,true);assert.equal(sim.result.stars,3);
  sim.finish();sim.start();sim.step(1/60);assert.equal(sim.score,first);assert.equal(events.filter(e=>e.type==='end').length,1);
  const count=sim.world.bodies.length;sim.reset({seed:987,mode:'shift'});assert.equal(sim.world.bodies.length,count);
  assert.equal(sim.score,0);assert.equal(sim.delivered,0);assert.equal(sim.result,null);assert.equal(sim.phase,'ready');
});

test('failure at timeout and moon gravity are consistent',()=>{
  const {sim}=create({mode:'shift',level:3});assert.equal(sim.world.gravity.y,-13);sim.time=.01;sim.step(1/60);
  assert.equal(sim.phase,'ended');assert.equal(sim.result.won,false);assert.equal(sim.result.stars,0);
  sim.reset({mode:'shift',level:0});assert.equal(sim.world.gravity.y,-22);assert.equal(sim.config.duration,FLOORS[0].duration);
});

test('daily seed uses the Stockholm calendar day and is deterministic',()=>{
  const a=dailySeed(new Date('2026-10-23T22:30:00Z')),b=dailySeed(new Date('2026-10-24T10:00:00Z'));
  assert.equal(a.date,'2026-10-24');assert.deepEqual(a,b);
});
