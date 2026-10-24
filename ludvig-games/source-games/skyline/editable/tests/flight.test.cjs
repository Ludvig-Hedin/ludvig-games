const assert=require('node:assert/strict');
const S=require('../src/flight.js');const results=[];
function run(name,test){try{test();results.push({name,status:'PASS'});}catch(e){results.push({name,status:'FAIL',error:e.message});}}
function sim(s,input,seconds,dt=1/120){for(let i=0;i<Math.round(seconds/dt);i++)S.stepFlight(s,input,dt);return s;}
run('Runway idle does not creep or crash',()=>{let s=sim(S.createFlight('runway'),{},30);assert.equal(s.crashed,false);assert.equal(s.speed,0);assert.equal(s.z,355);});
run('Hold W: accelerates forward and takes off safely',()=>{let s=sim(S.createFlight('runway'),{throttle:1},8);assert(!s.crashed);assert(!s.grounded);assert(s.z<180);assert(s.y>35);assert(s.speed>50);});
run('Holding W in flight changes speed, not pitch or altitude',()=>{let s=sim(S.createFlight(),{throttle:1},5);assert.equal(s.pitch,0);assert.equal(s.y,68);assert(s.speed>80);});
run('D turns right (east), A turns left (west)',()=>{let r=sim(S.createFlight(),{turn:1},2);let l=sim(S.createFlight(),{turn:-1},2);assert(r.x>20&&r.heading>0);assert(l.x< -20&&l.heading<0);assert(r.bank<0&&l.bank>0);});
run('Bank angle stays limited even with a held turn',()=>{let s=sim(S.createFlight(),{turn:1},12);assert(!s.crashed);assert(Math.abs(s.bank)<.88);});
run('Releasing controls levels wings and stops the turn',()=>{let s=sim(S.createFlight(),{turn:1,climb:1},1);sim(s,{},3);assert(Math.abs(s.bank)<.003);assert(Math.abs(s.pitch)<.002);assert(Math.abs(s.vy)<.1);});
run('Up climbs, Down descends; no inverted mapping',()=>{let u=sim(S.createFlight(),{climb:1},1.8);let d=sim(S.createFlight(),{climb:-1},1.8);assert(u.y>80);assert(d.y<56);});
run('Brake slows down without reversing',()=>{let s=sim(S.createFlight(),{brake:true},3);assert(s.speed>0&&s.speed<33);assert(!s.crashed);});
run('Ground brake brings plane to a complete stop',()=>{let s=S.createFlight('runway');s.speed=20;sim(s,{brake:true},2);assert.equal(s.speed,0);assert(s.grounded);});
run('Boost gives extra speed and consumes finite energy',()=>{let s=sim(S.createFlight(),{boost:true},3);assert(s.speed>80);assert(s.energy<.5);assert(s.energy>=0);});
run('Boost recharges after release',()=>{let s=S.createFlight();s.energy=.2;sim(s,{},4);assert(s.energy>.5);});
run('Stable airborne cruise at no input',()=>{let s=S.createFlight();s.y=350;sim(s,{},20);assert(!s.crashed);assert.equal(s.y,350);});
run('Gentle runway landing succeeds',()=>{let s=S.createFlight();Object.assign(s,{x:0,y:17.0,z:200,speed:40,vy:-1,pitch:-.03,throttle:.25});sim(s,{climb:-.06},1);assert(!s.crashed);assert(s.grounded);assert.equal(s.landings,1);});
run('Hard impact triggers crash',()=>{let s=S.createFlight();Object.assign(s,{y:18,z:200,vy:-20,pitch:-.39,speed:70});sim(s,{climb:-1},.3);assert(s.crashed);});
run('Water strike is detected',()=>{let s=S.createFlight();Object.assign(s,{x:1250,z:0,y:1.5,vy:-10});sim(s,{},.1);assert(s.crashed);});
run('Swept ring crossing works at high speed',()=>{let g={x:0,y:70,z:-100,nx:0,nz:-1,radius:38};assert(S.crossedGate({x:0,y:70,z:-50},{x:0,y:70,z:-160},g));assert(!S.crossedGate({x:70,y:70,z:-50},{x:70,y:70,z:-160},g));assert(!S.crossedGate({x:0,y:70,z:-160},{x:0,y:70,z:-50},g));});
run('30 / 60 / 120 Hz physics are consistent',()=>{let states=[30,60,120].map(hz=>sim(S.createFlight('runway'),{throttle:1},8,1/hz));assert(Math.max(...states.map(s=>s.z))-Math.min(...states.map(s=>s.z))<4);assert(states.every(s=>!s.crashed&&!s.grounded));});
run('Terrain vertices and physics sampler agree',()=>{for(let z=1;z<208;z+=13)for(let x=1;x<208;x+=13)assert(Math.abs(S.heightAt(x*25-2600,z*25-2600)-S.terrain[z*209+x])<1e-5);});
run('Fresh reset clears all input-related state',()=>{let s=S.createFlight('runway');assert.equal(s.turn,0);assert.equal(s.climb,0);assert.equal(s.bank,0);assert.equal(s.pitch,0);assert(!s.crashed);assert.equal(s.energy,1);});
run('Complete all 20 gates with terrain clearance',()=>{let s=S.createFlight(),gate=0;
 for(let i=0;i<180*120;i++){const g=S.route[gate],dx=g.x-s.x,dz=g.z-s.z,d=Math.hypot(dx,dz);S.stepFlight(s,{turn:S.clamp(S.wrap(Math.atan2(dx,-dz)-s.heading)*3,-1,1),climb:S.clamp(Math.atan2(g.y-s.y,Math.max(20,d))/.39*1.35,-1,1),throttle:s.throttle>.50?-.3:s.throttle<.49?.3:0},1/120);assert(!s.crashed);if(S.crossedGate(s.previous,s,g)){gate++;if(gate===20)break;}}assert.equal(gate,20);
});
run('Landing assist makes a held down arrow safe on approach',()=>{let s=S.createFlight();Object.assign(s,{x:0,y:81,z:900,speed:51,throttle:.37});for(let i=0;i<23*120;i++)S.stepFlight(s,{climb:-1,brake:s.grounded},1/120);assert(!s.crashed);assert(s.grounded);assert.equal(s.landings,1);assert(s.speed<1);});
console.log(JSON.stringify(results,null,2));if(results.some(r=>r.status==='FAIL'))process.exitCode=1;
