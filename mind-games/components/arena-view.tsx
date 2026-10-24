'use client';
import { useEffect, useRef } from 'react';
import type { Arena } from '../lib/arena';
import { MoveIcon } from './icons';

export type ArenaState = {phase:'idle'|'locked'|'reveal'|'result'; moves?:[number,number];winner?:number|null};
export default function ArenaView({home,state,reducedMotion,hover}:{home:boolean;state:ArenaState;reducedMotion:boolean;hover:number|null}) {
  const host=useRef<HTMLDivElement>(null);
  const instance=useRef<Arena|null>(null);
  const props=useRef({home,state,reducedMotion,hover});
  props.current={home,state,reducedMotion,hover};
  useEffect(()=>{
    let cancelled=false;
    import('../lib/arena').then(({Arena})=>{
      if(cancelled||!host.current)return;
      const arena=instance.current=new Arena(host.current,{reducedMotion:props.current.reducedMotion});
      arena.setMode(props.current.home?'home':'game');
      arena.setRound(props.current.state);
      arena.setHover(props.current.hover);
    }).catch(()=>host.current?.classList.add('arena-unavailable'));
    return()=>{cancelled=true;instance.current?.dispose();instance.current=null;};
  },[]);
  useEffect(()=>{instance.current?.setMode(home?'home':'game');},[home]);
  useEffect(()=>{instance.current?.setRound(state);},[state]);
  useEffect(()=>{instance.current?.setReducedMotion(reducedMotion);},[reducedMotion]);
  useEffect(()=>{instance.current?.setHover(hover);},[hover]);
  return <div className="arena-render" ref={host} aria-label={home?'Sculpted rock, paper and scissors in a three-dimensional arena':'Three-dimensional match arena'} role="img">
    <div className="arena-loading">{[0,1,2].map(m=><MoveIcon key={m} move={m}/>)}</div>
  </div>;
}
