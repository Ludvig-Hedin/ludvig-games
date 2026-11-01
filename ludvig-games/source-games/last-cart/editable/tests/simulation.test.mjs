import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation, ARENAS, COLORS} from '../src/simulation.js';

const DT=1/120;
function advance(sim, seconds, input=[]) {
  for(let i=0;i<Math.ceil(seconds/DT);i++) sim.step(DT,typeof input==='function'?input(i*DT,sim):input);
}
function quietSim(options={}) {
  const sim=new Simulation(options);
  sim.state='playing';sim.countdown=0;
  sim.players.forEach((p,i)=>{p.human=true;p.slot=i;});
  sim.takeEvents();
  return sim;
}

test('each arena has eight safe spawns and reachable pickups',()=>{
  assert.equal(COLORS.length,8);
  for(let arena=0;arena<ARENAS.length;arena++){
    const sim=new Simulation({arena,mode:'local'});
    assert.equal(sim.players.length,8);
    assert.equal(sim.players.filter(p=>p.human).length,2);
    for(const p of sim.players){
      assert.ok(Math.abs(p.x)<18 && Math.abs(p.z)<18);
      for(const o of sim.obstacles) assert.ok(Math.hypot(p.x-o.x,p.z-o.z)>.92+o.r,`${sim.arena.id}: player ${p.id} overlaps obstacle ${o.id}`);
      for(const q of sim.players) if(q.id!==p.id) assert.ok(Math.hypot(p.x-q.x,p.z-q.z)>1.84);
    }
    for(const item of sim.pickups) for(const o of sim.obstacles) assert.ok(Math.hypot(item.x-o.x,item.z-o.z)>o.r+.7,`${sim.arena.id}: blocked pickup`);
  }
});

test('countdown holds the arena still and starts once',()=>{
  const sim=new Simulation();
  advance(sim,2.9,[{x:1,z:0,boost:true}]);
  assert.equal(sim.state,'countdown');
  assert.equal(sim.players[0].x,0);
  advance(sim,.2);
  assert.equal(sim.state,'playing');
  const values=sim.takeEvents().filter(e=>e.type==='countdown').map(e=>e.value);
  assert.deepEqual(values,[3,2,1,0]);
});

test('local players receive independent screen-direction controls',()=>{
  const sim=quietSim({mode:'local'});
  advance(sim,.5,[{x:1,z:0},{x:-1,z:0}]);
  assert.ok(sim.players[0].x>1);
  assert.ok(sim.players[1].x< -1);
  assert.ok(Math.abs(sim.players[0].x+sim.players[1].x)<1e-8);
  assert.equal(sim.players[0].slot,0);
  assert.equal(sim.players[1].slot,1);
});

test('turbo is edge-triggered, refills, and rearms after release',()=>{
  const sim=quietSim();
  advance(sim,5,[{boost:true}]);
  assert.equal(sim.takeEvents().filter(e=>e.type==='boost'&&e.playerId===0).length,1);
  assert.ok(sim.players[0].boost>.99);
  assert.equal(sim.players[0].alive,true);
  sim.step(DT,[{boost:false}]);
  sim.step(DT,[{boost:true}]);
  assert.equal(sim.takeEvents().filter(e=>e.type==='boost'&&e.playerId===0).length,1);
  assert.ok(sim.players[0].boost<.02);
});

test('a sustained turning drift earns a release boost',()=>{
  const sim=quietSim();
  const p=sim.players[0];p.x=0;p.z=0;p.vz=-8;p.angle=Math.PI;
  advance(sim,.9,[{x:1,z:0,drift:true}]);
  assert.ok(p.driftCharge>.4,`charge was ${p.driftCharge}`);
  sim.step(DT,[{x:1,z:0,drift:false}]);
  assert.equal(sim.takeEvents().filter(e=>e.type==='driftboost'&&e.playerId===0).length,1);
  assert.equal(p.driftCharge,0);
});

test('pickups apply their effect once and respawn',()=>{
  const sim=quietSim();const p=sim.players[0];
  const shield=sim.pickups.find(i=>i.type==='shield');
  p.x=shield.x;p.z=shield.z;p.wobble=40;
  sim.step(DT);
  assert.equal(shield.active,false);
  assert.ok(p.shield>6.9);
  assert.ok(p.wobble<23);
  p.x=12;p.z=0;
  advance(sim,15);
  assert.equal(shield.active,true);
  assert.equal(sim.takeEvents().filter(e=>e.type==='pickup'&&e.itemId===shield.id).length,1);
});

test('crossing the roof edge creates one knockout and a finite falling animation',()=>{
  const sim=quietSim();const p=sim.players[0];
  p.x=18.1;p.z=0;p._lastHitId=1;p._lastHitTime=0;
  sim.step(DT);
  assert.equal(p.alive,false);assert.equal(p.falling,true);
  assert.equal(p.placement,8);assert.equal(sim.players[1].kills,1);
  advance(sim,1);
  assert.ok(p.y< -10);assert.equal(p.falling,true);
  advance(sim,2);
  assert.equal(p.falling,false);
  assert.equal(sim.takeEvents().filter(e=>e.type==='eliminate'&&e.playerId===0).length,1);
});

test('seeded AI and chaos produce identical replay states',()=>{
  const a=new Simulation({seed:12345,arena:2});
  const b=new Simulation({seed:12345,arena:2});
  const controls=t=>[{x:Math.sin(t*1.7),z:Math.cos(t*1.7),boost:Math.floor(t*2)%9===0,drift:Math.floor(t)%3===0}];
  advance(a,35,controls);advance(b,35,controls);
  assert.deepEqual(a.snapshot(),b.snapshot());
  assert.deepEqual(a.takeEvents(),b.takeEvents());
});

test('all arena/difficulty combinations remain finite and finish by the hard deadline',()=>{
  for(let arena=0;arena<3;arena++)for(const difficulty of ['normal','spicy'])for(const seed of [7,31]){
    const sim=new Simulation({arena,difficulty,seed});
    sim.players.forEach(p=>p.human=false);
    for(let i=0;i<120*86&&sim.state!=='finished';i++){
      sim.step(DT);
      for(const p of sim.players)for(const key of ['x','y','z','vx','vz','angle','boost','wobble','score']) assert.ok(Number.isFinite(p[key]),`invalid ${key}`);
    }
    assert.equal(sim.state,'finished');
    assert.ok(sim.winnerId>=0&&sim.winnerId<8);
    assert.equal(sim.players[sim.winnerId].placement,1);
    assert.ok(sim.time<=82.01);
    assert.ok(sim.effects.length<=240);
  }
});

test('safe zone shrinks and the simulation ignores invalid time deltas',()=>{
  const sim=quietSim();
  const snap=sim.snapshot();sim.step(NaN);sim.step(-1);sim.step(0);
  assert.deepEqual(sim.snapshot(),snap);
  sim.time=45;
  sim.step(DT);
  assert.ok(sim.safeRadius<11);
  sim.time=81.99;
  advance(sim,.1);
  assert.equal(sim.state,'finished');
  assert.equal(sim.finishReason,'time');
});

test('high wobble amplifies a real hit and a shield reduces its effect',()=>{
  const hit=(wobble,shield)=>{
    const sim=quietSim();const a=sim.players[0],b=sim.players[1];
    a.x=-1.5;a.z=0;a.angle=Math.PI/2;a.vx=20;a.vz=0;
    b.x=.3;b.z=0;b.vx=0;b.vz=0;b.wobble=wobble;b.shield=shield;
    sim.step(DT);return {speed:b.vx,damage:b.wobble,hitstun:b.hitstun};
  };
  const fresh=hit(0,0),wobbly=hit(80,0),shielded=hit(80,6);
  assert.ok(fresh.speed>5);
  assert.ok(wobbly.speed>fresh.speed*1.5);
  assert.ok(shielded.speed<wobbly.speed);
  assert.ok(shielded.damage<wobbly.damage);
  assert.ok(shielded.hitstun<wobbly.hitstun);
});

test('the opening gives a new idle player time to read controls',()=>{
  for(const arena of [0,1,2])for(const seed of [1,2,16,26]){
    const sim=new Simulation({arena,seed});
    advance(sim,9); // Includes the three-second countdown.
    assert.equal(sim.players[0].alive,true,`opening KO: arena${arena}, seed${seed}`);
  }
});
