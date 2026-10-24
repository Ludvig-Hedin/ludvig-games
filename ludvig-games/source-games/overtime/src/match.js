import { BotManager } from './ai.js';
import { ARENA } from './physics.js';
export const STEP=1/120;
export const DRILLS=[
  {title:'First touch',help:'Drive through the ball. Aim at the orange goal. Add boost for a stronger shot.',car:{x:0,y:1,z:28},ball:{x:0,y:1.85,z:0},velocity:{x:0,y:0,z:0}},
  {title:'Meet the pass',help:'Read the moving ball. Approach from behind it and send a shot into the orange goal.',car:{x:3,y:1,z:21},ball:{x:-18,y:2.2,z:-8},velocity:{x:10,y:0,z:1}},
  {title:'Take flight',help:'Jump, release W, pitch back with S, then boost. Use W/S in the air to line up your touch.',car:{x:0,y:1,z:18},ball:{x:0,y:7,z:-1},velocity:{x:0,y:9,z:-3}},
  {title:'Last line',help:'Protect the blue goal. Meet the incoming shot and clear it back upfield.',car:{x:0,y:1,z:44},ball:{x:-5,y:3,z:4},velocity:{x:2,y:5,z:28}},
];
const blankStats=c=>({id:c.id,name:c.name,team:c.team,isPlayer:c.isPlayer,goals:0,assists:0,saves:0,shots:0,points:0,lastShot:-100,lastSave:-100});
// A bounded ballistic estimate for score attribution. Rebounds from the floor
// matter: a low rolling clear can still be a shot, while a high backboard hit
// must not count merely because its horizontal trajectory crosses the goal.
function projectsIntoGoal(position,velocity,goalZ,maxTime){
  const time=(goalZ-position.z)/velocity.z;
  if(!Number.isFinite(time)||time<=0||time>=maxTime)return false;
  const radius=ARENA.ballRadius,x=position.x+velocity.x*time;
  if(Math.abs(x)>ARENA.goalWidth/2-radius)return false;
  const gravity=19.6;let y=Math.max(radius,position.y),vy=velocity.y,left=time;
  for(let bounce=0;bounce<12&&left>1e-6;bounce++){
    if(y<=radius+1e-5&&Math.abs(vy)<.6){y=radius;left=0;break;}
    const hitTime=Math.max(0,(vy+Math.sqrt(vy*vy+2*gravity*(y-radius)))/gravity);
    if(hitTime>=left){y+=vy*left-.5*gravity*left*left;left=0;break;}
    left-=hitTime;vy=-(vy-gravity*hitTime)*.73;y=radius;
  }
  return left<=1e-6&&y>=radius-.01&&y<=ARENA.goalHeight-radius;
}
export class Match {
  constructor(physics,onEvent=()=>{}){this.physics=physics;this.bots=new BotManager(physics);this.onEvent=onEvent;this.phase='idle';this.kind='exhibition';this.score=[0,0];this.remaining=300;this.elapsed=0;this.overtime=false;this.overtimeTime=0;this.phaseTime=0;this.accumulator=0;this.current=physics.snapshot();this.previous=this.current;this.frames=[];this.replayFrames=[];this.sampleTicks=0;this.stats=[];this.touchHistory=[];this.drill=0;this.trainingComplete=false;this.ended=false;this.paused=false;}
  emit(type,data={}){this.onEvent({type,...data});}
  start(kind='exhibition',config={}){
    this.kind=kind;this.config={teamSize:1,playerTeam:0,difficulty:'pro',length:300,...config};if(kind==='training')this.config.playerTeam=0;
    this.physics.reset({teamSize:this.config.teamSize,playerTeam:this.config.playerTeam,freePlay:kind!=='exhibition'});this.bots.setDifficulty(this.config.difficulty);this.bots.reset();
    this.score=[0,0];this.remaining=this.config.length;this.elapsed=0;this.overtime=false;this.overtimeTime=0;this.phaseTime=0;this.accumulator=0;this.frames=[];this.replayFrames=[];this.sampleTicks=0;this.stats=this.physics.cars.map(blankStats);this.touchHistory=[];this.ended=false;this.paused=false;this.pendingEnd=false;this.lastCountdown=3;this.drill=0;this.trainingComplete=false;
    this.current=this.physics.snapshot();this.previous=this.current;
    if(kind==='training')this.resetTraining();else if(kind==='freeplay')this.setPhase('live');else{this.setPhase('countdown');this.emit('countdown',{number:3});}
  }
  setPhase(phase){this.phase=phase;this.phaseTime=0;this.emit('phase',{phase});}
  update(dt,input={}){
    if(this.paused||this.phase==='idle'||this.phase==='results')return;
    this.accumulator+=Math.min(dt,.08);let steps=0;
    while(this.accumulator>=STEP&&steps++<12){this.tick(STEP,input);this.accumulator-=STEP;}
  }
  tick(dt,input){
    this.phaseTime+=dt;
    if(this.phase==='countdown'){
      const n=Math.max(0,3-Math.floor(this.phaseTime));if(n!==this.lastCountdown){this.lastCountdown=n;this.emit('countdown',{number:n});}
      if(this.phaseTime>=3){this.setPhase('live');this.emit('go');}
      return;
    }
    if(this.phase==='replay'){
      if(this.phaseTime>=Math.min(5,this.replayFrames.length/30)/.85)this.afterGoal();return;
    }
    if(this.phase==='goal'){
      this.simulate(dt,{},false);if(this.phaseTime>=1.8){if(this.kind==='exhibition'&&this.frames.length>20){this.replayFrames=this.frames.slice(-150);this.setPhase('replay');}else this.afterGoal();}return;
    }
    if(this.phase!=='live')return;
    this.elapsed+=dt;
    // Advance the clock before processing the physics result. A goal on the
    // final simulation step must see 0:00 and finish the match when untied.
    if(this.kind==='exhibition'){
      if(this.overtime)this.overtimeTime+=dt;
      else{const was=this.remaining;this.remaining=Math.max(0,this.remaining-dt);if(was>0&&this.remaining===0)this.emit('message',{text:'KEEP IT UP',duration:1.3});}
    }
    this.simulate(dt,input,true);
    if(this.phase!=='live')return;
    if(this.kind==='training'){this.checkTraining();return;}
    if(this.kind!=='exhibition')return;
    if(!this.overtime){
      if(this.remaining===0&&this.physics.ball.position.y<=ARENA.ballRadius+.13&&this.physics.ball.velocity.y<=.6){
        if(this.score[0]===this.score[1])this.enterOvertime();else this.finish();
      }
    }
  }
  simulate(dt,input,active){
    this.previous=this.current;
    const before={position:{...this.physics.ball.position},velocity:{...this.physics.ball.velocity}};
    const controls=active?this.bots.update(dt):new Map();controls.set(0,active?input:{});
    this.physics.step(dt,controls);this.current=this.physics.snapshot();
    if(active&&++this.sampleTicks%4===0){this.frames.push(this.current);if(this.frames.length>180)this.frames.shift();}
    for(const event of this.physics.events){
      if(active&&event.type==='ballHit')this.registerTouch(event,before);
      if(active&&event.type==='goal'){this.goal(event);continue;}
      if(event.type!=='goal')this.emit('physics',{event});
    }
  }
  registerTouch(e,before){
    const s=this.stats.find(x=>x.id===e.carId);if(!s)return;const ball=this.physics.ball;const attack=s.team===0?-1:1;const vz=ball.velocity.z;
    this.touchHistory.push({id:e.carId,team:s.team,time:this.elapsed});if(this.touchHistory.length>16)this.touchHistory.shift();
    if(vz*attack>8&&this.elapsed-s.lastShot>1.6&&projectsIntoGoal(ball.position,ball.velocity,attack*ARENA.halfLength,2.4)){s.shots++;s.points+=10;s.lastShot=this.elapsed;this.emit('stat',{id:s.id,text:'SHOT ON GOAL',points:10});}
    const own=-attack;const old=before.velocity;const toward=old.z*own>7;
    if(toward&&projectsIntoGoal(before.position,old,own*ARENA.halfLength,1.8)&&before.position.z*own>27&&(ball.velocity.z*own<3||Math.abs(ball.velocity.x-old.x)>8)&&this.elapsed-s.lastSave>2){s.saves++;s.points+=50;s.lastSave=this.elapsed;this.emit('stat',{id:s.id,text:'SAVE',points:50});}
  }
  goal(event){
    this.score[event.team]++;const scorer=this.stats.find(s=>s.id===event.carId);let name=scorer?.name||'TEAM '+(event.team===0?'BLUE':'ORANGE');let ownGoal=false;
    if(scorer&&scorer.team===event.team){scorer.goals++;scorer.points+=100;const prior=[...this.touchHistory].reverse().find(t=>t.id!==scorer.id);if(prior&&prior.team===event.team&&this.elapsed-prior.time<10){const assist=this.stats.find(s=>s.id===prior.id);if(assist){assist.assists++;assist.points+=50;}}}else if(scorer)ownGoal=true;
    this.pendingEnd=this.kind==='exhibition'&&(this.overtime||(this.remaining<=0&&this.score[0]!==this.score[1]));
    this.frames.push(this.current);this.setPhase('goal');this.emit('physics',{event});this.emit('goal',{team:event.team,name,ownGoal,score:[...this.score]});
    if(this.kind==='training'&&event.team===0&&!this.trainingComplete){this.trainingComplete=true;this.emit('trainingSuccess',{drill:this.drill});}
  }
  afterGoal(){
    if(this.pendingEnd){this.finish();return;}
    if(this.kind==='training'){this.resetTraining();return;}
    this.physics.kickoff();this.bots.reset();this.current=this.physics.snapshot();this.previous=this.current;this.frames=[];this.touchHistory=[];this.sampleTicks=0;
    if(this.kind==='exhibition'){
      if(this.remaining<=0&&this.score[0]===this.score[1])this.enterOvertime();
      else{this.lastCountdown=3;this.setPhase('countdown');this.emit('countdown',{number:3});}
    }else this.setPhase('live');
  }
  enterOvertime(){this.overtime=true;this.overtimeTime=0;this.physics.kickoff();this.bots.reset();this.current=this.physics.snapshot();this.previous=this.current;this.frames=[];this.touchHistory=[];this.sampleTicks=0;this.lastCountdown=3;this.setPhase('countdown');this.emit('countdown',{number:3});this.emit('overtime');}
  skipReplay(){if(this.phase==='replay')this.afterGoal();}
  finish(){if(this.ended)return;this.ended=true;this.setPhase('results');const winner=this.score[0]>this.score[1]?0:1;this.emit('matchEnd',{winner,won:winner===this.config.playerTeam,score:[...this.score],stats:this.stats.map(s=>({...s})),elapsed:this.elapsed,mvp:[...this.stats].sort((a,b)=>b.points-a.points||b.goals-a.goals)[0]});}
  resetBall(onCar=false){
    if(this.kind==='training'){this.resetTraining();return;}if(this.kind!=='freeplay')return;
    if(onCar){const car=this.physics.cars[0];this.physics.setBall({x:car.position.x,y:car.position.y+2.7,z:car.position.z},{...car.velocity});}else{this.physics.kickoff();}
    this.current=this.physics.snapshot();this.previous=this.current;this.setPhase('live');
  }
  resetTraining(){
    const d=DRILLS[this.drill];this.physics.kickoff();const car=this.physics.cars[0];car.body.setTranslation(d.car,true);car.body.setRotation({x:0,y:0,z:0,w:1},true);car.body.setLinvel({x:0,y:0,z:0},true);car.body.setAngvel({x:0,y:0,z:0},true);this.physics.setBall({...d.ball},{...d.velocity});this.trainingComplete=false;this.trainingTouched=false;this.current=this.physics.snapshot();this.previous=this.current;this.setPhase('live');this.emit('training',{drill:this.drill,...d});
  }
  nextTraining(){if(this.kind!=='training')return;this.drill=(this.drill+1)%DRILLS.length;this.resetTraining();}
  checkTraining(){
    if(this.trainingComplete)return;
    if(this.drill===2&&this.physics.lastTouch===0&&this.physics.ball.position.y>4.5&&this.physics.cars[0].position.y>2.2){this.trainingComplete=true;this.emit('trainingSuccess',{drill:this.drill});}
    if(this.drill===3&&this.physics.lastTouch===0&&this.physics.ball.velocity.z<4){this.trainingComplete=true;this.emit('trainingSuccess',{drill:this.drill});}
  }
  view(){
    if(this.phase==='replay'&&this.replayFrames.length){const at=Math.min(this.replayFrames.length-1,this.phaseTime*30*.85),i=Math.floor(at);return {current:this.replayFrames[Math.min(i+1,this.replayFrames.length-1)],previous:this.replayFrames[i],alpha:at-i};}
    return {current:this.current,previous:this.previous,alpha:this.phase==='live'||this.phase==='goal'?Math.min(1,this.accumulator/STEP):1};
  }
  get clock(){if(this.kind==='freeplay')return 'FREE';if(this.kind==='training')return 'TRAIN';const t=this.overtime?Math.floor(this.overtimeTime):Math.ceil(this.remaining);return `${this.overtime?'+':''}${Math.floor(t/60)}:${String(t%60).padStart(2,'0')}`;}
}
