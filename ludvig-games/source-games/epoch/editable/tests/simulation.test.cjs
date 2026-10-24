const assert=require('node:assert/strict');
const {Battle,AGES,unitStats,turretStats}=require('../sim.js');
function bot(b,style){let t=b.teams[0];b.evolve(0);const es=b.units.filter(u=>u.side===1),count=es.filter(u=>u.x<3).length;
 if(t.power>=1&&count>2)b.power(0,es.filter(u=>u.x<4).reduce((s,u)=>s+u.x,0)/count);
 if(style==='defend'&&t.turrets.filter(Boolean).length<2&&b.time>20&&t.gold>turretStats(t.age,0).cost+55)b.build(0,0);
 if(t.queue.length>2)return;
 if(style==='spam')b.recruit(0,0);
 else if(style==='ranged')b.recruit(0,1);
 else if(style==='heavy'){if(t.age===4||b.units.filter(u=>u.side===0&&u.type===2).length<2)b.recruit(0,2);else b.recruit(0,1);}
 else if(style==='siege'){if(t.age===4){if(t.power>=1)b.power(0,17);b.recruit(0,2);}else b.recruit(0,1);}
 else {const allies=b.units.filter(u=>u.side===0),m=allies.filter(u=>u.type!==1).length,r=allies.filter(u=>u.type===1).length;if(r<m*.8+1)b.recruit(0,1);else if(t.gold>unitStats(t.age,2).cost)b.recruit(0,2);else b.recruit(0,0);}
}
let checks=0;
for(const d of ['easy','normal','hard'])for(const style of ['balanced','heavy','siege']){
 const results=[];for(let seed=1;seed<=3;seed++){
 const b=new Battle({difficulty:d,seed});let evo=[];
 for(let i=0;i<12000&&!b.result;i++){if(i%7===0)bot(b,style);b.step(.1);for(const e of b.drain())if(e.type==='evolve')evo.push([e.side,e.age,Math.round(b.time)]);
 if(i%100===0){checks++;for(const t of b.teams){assert(t.gold>=0);assert.equal(t.pop,b.units.filter(u=>u.side===t.side&&!u.dead).length);assert(t.queue.length<=6);assert(Number.isFinite(t.hp));}for(const u of b.units){assert(Number.isFinite(u.x));assert(Math.abs(u.x)<=20);}}
 }results.push({result:b.result,t:Math.round(b.time),ages:b.teams.map(t=>t.age),hp:b.teams.map(t=>Math.round(t.hp)),evo});}
 console.log(d,style,JSON.stringify(results));
}
console.log('INVARIANT CHECKS',checks);
