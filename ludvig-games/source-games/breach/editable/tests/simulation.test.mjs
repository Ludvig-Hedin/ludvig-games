import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation, WEAPONS, moveActor, canStand, direction, obstruction } from '../../js/simulation.js';

const bounds={minX:-12,maxX:12,minZ:-12,maxZ:12};
const arena=(colliders=[])=>({bounds,colliders,spawns:[{x:-8,z:9,yaw:0},{x:8,z:-9,yaw:Math.PI},{x:-8,z:-9,yaw:0}]});
function fixedRandom(fn){const previous=Math.random;Math.random=()=>.5;try{return fn();}finally{Math.random=previous;}}
function advance(sim,seconds){for(let t=0;t<seconds-1e-8;t+=.05)sim.update(Math.min(.05,seconds-t));}
function place(p,x,z,extra={}){Object.assign(p,{x,z,y:0,yaw:0,pitch:0,invuln:0,vx:0,vz:0,hp:100,input:{},...extra});return p;}
function pair(options={},colliders=[]){const s=new Simulation(arena(colliders),{botCount:0,duration:300,...options});const a=place(s.addPlayer('a','A'),0,5),b=place(s.addPlayer('b','B'),0,-5);s.drainEvents();return {s,a,b};}

test('movement cannot tunnel through tall cover, including jumps and sustained sprint',()=>fixedRandom(()=>{
  const cover={minX:-5,maxX:5,minZ:-.25,maxZ:.25,minY:0,maxY:4};
  const p={x:0,y:0,z:5,yaw:0,vx:0,vz:0};let maxY=0;
  for(let i=0;i<360;i++){
    moveActor(p,{forward:1,sprint:true,jump:i%45<10},1/60,[cover],bounds);
    maxY=Math.max(maxY,p.y);assert.ok(p.z>=.63-1e-8,'actor crossed cover');assert.ok(p.y>=0);
  }
  assert.ok(maxY>.4,'jump must actually happen');assert.ok(p.z<.65,'actor must reach the wall');
}));

test('solid walls stop hitscan bullets before the opponent',()=>fixedRandom(()=>{
  const cover={minX:-2,maxX:2,minZ:-.2,maxZ:.2,minY:0,maxY:4};
  const {s,a,b}=pair({},[cover]);a.pitch=-Math.atan2(.62,10);s.time=1;s.shoot(a);
  assert.equal(b.hp,100);assert.equal(a.ammo[0],29);
  const shot=s.drainEvents().find(e=>e.type==='shot');assert.equal(shot.hit,null);assert.ok(Math.abs(shot.to.z-.2)<1e-8);
}));

test('standing torso and head shots agree with operator height and deal different damage',()=>fixedRandom(()=>{
  const {s,a,b}=pair();s.time=1;a.pitch=-Math.atan2(.62,10);s.shoot(a);
  assert.equal(b.hp,100-WEAPONS[0].damage);
  s.time=2;a.pitch=0;s.shoot(a);
  assert.ok(Math.abs(b.hp-(100-WEAPONS[0].damage-WEAPONS[0].damage*1.8))<1e-8);
  assert.equal(s.drainEvents().filter(e=>e.type==='shot').at(-1).headshot,true);
}));

test('downward shots hit the floor rather than continuing below the world',()=>fixedRandom(()=>{
  const s=new Simulation(arena(),{botCount:0});const p=place(s.addPlayer('p','P'),0,5,{pitch:-.7});s.time=1;s.drainEvents();s.shoot(p);
  const shot=s.drainEvents().find(e=>e.type==='shot');assert.ok(Math.abs(shot.to.y)<1e-8,`floor impact y=${shot.to.y}`);
  const expectedZ=5-1.62/Math.tan(.7);assert.ok(Math.abs(shot.to.z-expectedZ)<1e-8);
}));

test('spawn protection, deaths, score and timed respawn form one consistent lifecycle',()=>fixedRandom(()=>{
  const {s,a,b}=pair();b.invuln=1;s.damage(b,a,120);assert.equal(b.hp,100);
  b.invuln=0;s.damage(b,a,120,true);assert.equal(b.hp,0);assert.equal(b.deaths,1);assert.equal(a.kills,1);
  s.damage(b,a,120);assert.equal(a.kills,1,'dead actor must not award another elimination');
  advance(s,2.9);assert.equal(b.hp,0);advance(s,.15);
  assert.equal(b.hp,100);assert.ok(b.invuln>1.5);assert.equal(b.deaths,1);assert.deepEqual(b.ammo,[30,15]);
  const events=s.drainEvents();assert.equal(events.filter(e=>e.type==='kill').length,1);assert.equal(events.filter(e=>e.type==='spawn').length,1);
}));

test('health regeneration waits after damage and then restores health',()=>fixedRandom(()=>{
  const {s,a,b}=pair();s.damage(b,a,40);advance(s,5);assert.equal(b.hp,60);
  advance(s,1);assert.ok(b.hp>60&&b.hp<100);advance(s,3);assert.equal(b.hp,100);
}));

test('ammo, empty-magazine reload and weapon switch preserve ammunition accounting',()=>fixedRandom(()=>{
  const {s,a}=pair();a.ammo[0]=1;a.reserve[0]=4;s.time=1;s.shoot(a);assert.equal(a.ammo[0],0);
  s.time+=.2;s.shoot(a);assert.equal(a.reloadLeft,WEAPONS[0].reload);assert.equal(a.ammo[0],0);
  advance(s,1.9);assert.equal(a.ammo[0],4);assert.equal(a.reserve[0],0);
  a.ammo[0]=10;a.reserve[0]=20;s.reload(a);s.setInput('a',{weapon:1});s.update(.05);
  assert.equal(a.weapon,1);assert.equal(a.reloadLeft,0);assert.equal(a.ammo[0],10);assert.equal(a.reserve[0],20);
}));

test('hard bots react sooner, deal more damage and fire more frequently than easy bots',()=>fixedRandom(()=>{
  const results={};
  for(const difficulty of ['easy','hard']){
    const s=new Simulation(arena(),{difficulty,botCount:0}),bot=place(s.addPlayer('bot-0','BOT',true),0,5),target=place(s.addPlayer('p','P'),0,-5);
    s.botInput(bot,.05);const reaction=bot.reaction;bot.pitch=-Math.atan2(.62,10);bot.input={aim:true};s.time=1;s.shoot(bot);
    const damage=100-target.hp;s.time=1.2;s.shoot(bot);results[difficulty]={reaction,damage,ammo:bot.ammo[0]};
  }
  assert.ok(results.hard.reaction<results.easy.reaction);assert.ok(results.hard.damage>results.easy.damage);
  assert.equal(results.easy.ammo,29);assert.equal(results.hard.ammo,28);
}));

test('bot routes go around thin walls between open grid centers and navigation makes progress',()=>fixedRandom(()=>{
  const wall={minX:-.12,maxX:.12,minZ:-8,maxZ:8,minY:0,maxY:4};
  const s=new Simulation(arena([wall]),{botCount:0}),bot=place(s.addPlayer('bot-0','BOT',true),-5,0),target=place(s.addPlayer('p','P'),5,0);
  bot.ammo=[0,0];bot.reserve=[0,0];const route=s.route(bot.x,bot.z,target.x,target.z);assert.ok(route.length>0);
  let previous={x:bot.x,z:bot.z};
  for(const point of route){
    const length=Math.hypot(point.x-previous.x,point.z-previous.z),steps=Math.max(1,Math.ceil(length/.1));
    for(let i=0;i<=steps;i++)assert.ok(canStand(previous.x+(point.x-previous.x)*i/steps,previous.z+(point.z-previous.z)*i/steps,[wall],.38),'navigation segment crosses a wall');
    previous=point;
  }
  let gotSight=false,maxDetour=0;
  for(let i=0;i<500;i++){
    s.update(.05);assert.ok(canStand(bot.x,bot.z,[wall],.379),'bot penetrated cover');maxDetour=Math.max(maxDetour,Math.abs(bot.z));
    const distance=Math.hypot(target.x-bot.x,target.z-bot.z),dir={x:(target.x-bot.x)/distance,y:0,z:(target.z-bot.z)/distance};
    if(obstruction({x:bot.x,y:1.5,z:bot.z},dir,[wall],distance)>=distance-.05){gotSight=true;break;}
  }
  assert.ok(maxDetour>8.3,'bot did not navigate around the wall');assert.equal(gotSight,true,'bot never reached a clear firing lane');
}));

test('score limit and timer end the match, and an ended match stops advancing',()=>fixedRandom(()=>{
  const first=pair({limit:2});first.a.kills=2;first.s.update(.05);assert.equal(first.s.ended,true);assert.equal(first.s.winner,'a');
  const time=first.s.time;first.s.update(.05);assert.equal(first.s.time,time);assert.equal(first.s.drainEvents().filter(e=>e.type==='end').length,1);
  const second=pair({duration:.1});second.b.kills=1;advance(second.s,.1);assert.equal(second.s.ended,true);assert.equal(second.s.winner,'b');
}));
