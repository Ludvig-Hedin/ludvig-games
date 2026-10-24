"use client";
import { useRef, useState } from "react";
import { FleetOcean } from "./Ocean";
import { SHIPS, cellsFor, isValidPlacement, type Fleet, type Cell, type ShipId, type Shot } from "../lib/game";

export type BoardEvent = { x: number; y: number; result: "hit" | "miss" | "sunk"; id: number };
type Props = {
  fleet: Fleet; shots: Shot[]; event?: BoardEvent; placement?: boolean; enabled?: boolean;
  selected?: ShipId; horizontal?: boolean; quality: "high" | "low";
  onSelect?: (id: ShipId) => void; onPlace?: (id: ShipId, cell: Cell, horizontal: boolean) => void;
  onFire?: (cell: Cell) => void; onAim?: (cell: Cell | null) => void;
};
export default function TacticalBoard({fleet, shots, event, placement=false, enabled=false, selected, horizontal=true, quality, onSelect, onPlace, onFire, onAim}:Props) {
  const grid=useRef<HTMLDivElement>(null);
  const [hover,setHover]=useState<Cell|null>(null);
  const [dragging,setDragging]=useState(false);
  const [focusIndex,setFocusIndex]=useState(0);
  const drag=useRef<{id:ShipId;offsetX:number;offsetY:number;horizontal:boolean;existing:boolean;startX:number;startY:number;moved:boolean}|null>(null);
  const point=(event:{clientX:number;clientY:number})=>{
    const rect=grid.current!.getBoundingClientRect();
    return {x:Math.floor((event.clientX-rect.left)/rect.width*10),y:Math.floor((event.clientY-rect.top)/rect.height*10)};
  };
  const hoveredShip=drag.current?.id??selected;
  const candidate=hover&&hoveredShip?{id:hoveredShip,x:hover.x,y:hover.y,horizontal:drag.current?.horizontal??horizontal}:null;
  const ghost=placement&&enabled&&candidate?cellsFor(candidate):[];
  const ghostValid=candidate?isValidPlacement(fleet,candidate):false;
  const shotMap=new Map(shots.map(s=>[s.y*10+s.x,s]));
  const sunkCells=new Set(shots.filter(s=>s.result==="sunk").flatMap(s=>s.sunk?.cells??[]).map(c=>c.y*10+c.x));
  const inBounds=(c:Cell)=>c.x>=0&&c.x<10&&c.y>=0&&c.y<10;
  function pointerDown(e:React.PointerEvent<HTMLDivElement>){
    if(!enabled||!placement||!e.isPrimary||e.button!==0)return;
    const c=point(e);if(!inBounds(c))return;
    const existing=fleet.find(s=>cellsFor(s).some(p=>p.x===c.x&&p.y===c.y));
    const id=existing?.id??selected;if(!id)return;
    onSelect?.(id);
    drag.current={id,offsetX:existing?c.x-existing.x:0,offsetY:existing?c.y-existing.y:0,horizontal:existing?.horizontal??horizontal,existing:!!existing,startX:e.clientX,startY:e.clientY,moved:false};
    e.currentTarget.setPointerCapture(e.pointerId);
    setHover({x:c.x-drag.current.offsetX,y:c.y-drag.current.offsetY});
  }
  function pointerMove(e:React.PointerEvent<HTMLDivElement>){
    if(!enabled||!e.isPrimary)return;
    const c=point(e),d=drag.current;
    if(d){d.moved ||= Math.hypot(e.clientX-d.startX,e.clientY-d.startY)>5;setDragging(d.moved);c.x-=d.offsetX;c.y-=d.offsetY;}
    setHover(c);if(!placement&&inBounds(c)&&!shotMap.has(c.y*10+c.x))onAim?.(c);
  }
  function pointerUp(e:React.PointerEvent<HTMLDivElement>){
    if(!enabled||!e.isPrimary||e.button!==0)return;
    const c=point(e),d=drag.current;
    if(placement&&d){
      c.x-=d.offsetX;c.y-=d.offsetY;
      if(!d.existing||d.moved)onPlace?.(d.id,c,d.horizontal);
      drag.current=null;setDragging(false);
      if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);
    }else if(!placement&&inBounds(c)&&!shotMap.has(c.y*10+c.x)){
      setHover(c);onAim?.(c);
      if(e.pointerType!=="touch")onFire?.(c);
    }
  }
  function keyboard(e:React.KeyboardEvent<HTMLButtonElement>,index:number){
    const moves:Record<string,number>={ArrowRight:1,ArrowLeft:-1,ArrowUp:-10,ArrowDown:10};
    if(e.key in moves){e.preventDefault();const next=Math.max(0,Math.min(99,index+moves[e.key]));setFocusIndex(next);grid.current?.querySelectorAll<HTMLButtonElement>("button")[next]?.focus();}
    if((e.key==="Enter"||e.key===" ")&&enabled){e.preventDefault();const c={x:index%10,y:Math.floor(index/10)};if(placement&&selected)onPlace?.(selected,c,horizontal);else if(!shotMap.has(index))onFire?.(c);}
  }
  return <div className={`board-frame ${placement?"placement-board":""} ${enabled?"interactive":""} ${dragging?"dragging":""}`}>
    <div className="board-labels board-labels-top" aria-hidden="true">{"ABCDEFGHIJ".split("").map(c=><span key={c}>{c}</span>)}</div>
    <div className="board-labels board-labels-left" aria-hidden="true">{Array.from({length:10},(_,i)=><span key={i}>{String(i+1).padStart(2,"0")}</span>)}</div>
    <div className="ocean-board" ref={grid} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={()=>{drag.current=null;setDragging(false);setHover(null);}} onPointerLeave={()=>{if(!drag.current)setHover(null);}}>
      <FleetOcean fleet={fleet} shots={shots} selectedShip={placement?selected:undefined} quality={quality} event={event}/>
      <div className="board-grid" role="grid" aria-label={placement?"Place your fleet":"Battlefield"}>
        {Array.from({length:100},(_,i)=>{
          const x=i%10,y=Math.floor(i/10),shot=shotMap.get(i);
          const isGhost=ghost.some(c=>c.x===x&&c.y===y);
          const aiming=!placement&&enabled&&!shot&&hover?.x===x&&hover?.y===y;
          const ship=placement?fleet.find(s=>s.id===selected&&cellsFor(s).some(c=>c.x===x&&c.y===y)):null;
          return <button key={i} role="gridcell" tabIndex={i===focusIndex?0:-1} aria-label={`${String.fromCharCode(65+x)}${y+1}${shot?`, ${sunkCells.has(i)?"sunk":shot.result}`:placement?", place ship":enabled?", fire":""}`} aria-disabled={!enabled||!!shot} className={`grid-cell ${shot?"shot-"+shot.result:""} ${sunkCells.has(i)?"cell-sunk":""} ${isGhost?ghostValid?"ghost-valid":"ghost-invalid":""} ${ship?"selected-ship":""} ${aiming?"aiming":""}`} onKeyDown={e=>keyboard(e,i)} onClick={e=>{if(e.detail===0&&enabled){if(placement&&selected)onPlace?.(selected,{x,y},horizontal);else if(!shot)onFire?.({x,y});}}} onFocus={()=>{setHover({x,y});if(!placement&&enabled&&!shot)onAim?.({x,y});}}>
            {shot&&<span className={shot.result==="miss"?"miss-mark":"hit-mark"}/>}
            {aiming&&<span className="crosshair"/>}
            {event&&event.x===x&&event.y===y&&<span key={event.id} className={`impact-ring ${event.result}`}/>}
          </button>;
        })}
      </div>
      <div className="board-vignette"/>
    </div>
    <i className="corner corner-tl"/><i className="corner corner-tr"/><i className="corner corner-bl"/><i className="corner corner-br"/>
  </div>;
}

export function ShipSilhouette({id,className=""}:{id:ShipId,className?:string}){
  if(id==="submarine")return <svg className={className} viewBox="0 0 120 30" fill="currentColor" aria-hidden="true"><path d="M8 18c0-7 12-10 23-10h58c15 0 24 4 24 10s-12 10-25 10H27C15 28 8 23 8 18Z"/><path d="M52 9V2h15v7M2 14h11v7H2M112 9h5v18h-5"/></svg>;
  if(id==="carrier")return <svg className={className} viewBox="0 0 120 30" fill="currentColor" aria-hidden="true"><path d="m3 11 13-7 93 1 9 10-5 12H8Z"/><path d="M72 2h19v11H72Z"/><path d="M12 13h89v2H12Z" fill="var(--bg)" opacity=".6"/></svg>;
  return <svg className={className} viewBox="0 0 120 30" fill="currentColor" aria-hidden="true"><path d="m2 15 17-9 86 1 13 8-13 11-86-1Z"/><path d="M50 4h25v23H50ZM60 0h4v28h-4M21 13h23v4H21M79 13h24v4H79Z"/><path d="M53 10h18v11H53Z" fill="var(--bg)" opacity=".4"/></svg>;
}

export function MiniFleet({fleet,shots}:{fleet:Fleet,shots:Shot[]}){
  const occupied=new Set(fleet.flatMap(cellsFor).map(c=>c.y*10+c.x));
  const shotMap=new Map(shots.map(s=>[s.y*10+s.x,s]));
  return <div className="mini-fleet" aria-label="Your fleet overview">{Array.from({length:100},(_,i)=><i key={i} className={`${occupied.has(i)?"occupied":""} ${shotMap.get(i)?.result??""}`}/>)}</div>;
}
