import assert from 'node:assert/strict';
import { COURSES, MAX_STROKES, makeBall, planShot, sampleHeight, simulateShot } from '../lib/golf.ts';
assert.equal(COURSES.length,18);
for(const hole of COURSES){
  assert.notEqual(sampleHeight(hole,hole.start.x,hole.start.z),null);
  assert.notEqual(sampleHeight(hole,hole.cup.x,hole.cup.z),null);
  let ball=makeBall(hole),time=0,strokes=0,hazards=0;
  for(;strokes<MAX_STROKES&&!ball.sunk;strokes++){
    const before={...ball};
    const shot=planShot(hole,ball,4,time,()=>0.5);
    const result=simulateShot(hole,ball,shot.angle,shot.power,time+shot.wait);
    assert.ok(Number.isFinite(result.ball.x+result.ball.y+result.ball.z));
    assert.ok(result.duration>0&&result.duration<=20.01);
    assert.ok(result.ball.stopped);
    const repeat=simulateShot(hole,ball,shot.angle,shot.power,time+shot.wait);
    assert.deepEqual(result,repeat,'fixed-step simulation must be deterministic');
    time+=result.duration+shot.wait;
    if(result.ball.hazard){ball={...before,stopped:true};hazards++;strokes++;}else ball=result.ball;
  }
  console.log(`${String(hole.id).padStart(2)} ${hole.name.padEnd(22)} ${ball.sunk?'IN':'FAIL'} ${strokes} strokes, ${hazards} water, at ${ball.x.toFixed(2)}, ${ball.z.toFixed(2)}`);
  assert.ok(ball.sunk,`Expert must be able to finish ${hole.name} within stroke limit`);
}
const hole=COURSES[0];
for(let i=0;i<24;i++){
  const result=simulateShot(hole,makeBall(hole),i*Math.PI/12,1,0);
  assert.ok(!result.ball.hazard,'maximum-power shot cannot tunnel through enclosing walls');
  assert.ok(Math.abs(result.ball.x)<3&&Math.abs(result.ball.z)<8);
}
console.log('18 courses playable; deterministic replay, finite state, settling, and rail containment verified.');
