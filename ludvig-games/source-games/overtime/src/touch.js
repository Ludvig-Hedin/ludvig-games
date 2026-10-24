// On-screen controls for touch screens: a floating stick on the left, Jump / Boost / Powerslide on the right.
// They only write into input.touch; Input.read() merges them with keyboard and gamepad.
export const STICK_RADIUS=56;
export function stickVector(dx,dy,radius=STICK_RADIUS,dead=.14){
  const len=Math.hypot(dx,dy);if(!len||!Number.isFinite(len))return {x:0,y:0};
  const n=Math.min(1,len/radius);if(n<dead)return {x:0,y:0};
  const mag=(n-dead)/(1-dead);return {x:dx/len*mag,y:dy/len*mag};
}
export function isTouchDevice(){return !!(window.matchMedia?.('(pointer: coarse)').matches||navigator.maxTouchPoints>0&&'ontouchstart' in window);}
export function attachTouch(input,{onFirstTouch}={}){
  const $=id=>document.getElementById(id);
  const zone=$('touch-stick-zone'),stick=$('touch-stick'),knob=$('touch-knob');
  const state=input.touch;let stickId=null,origin=null;
  const mark=()=>{if(!document.body.classList.contains('touch')){document.body.classList.add('touch');onFirstTouch?.();}};
  window.addEventListener('touchstart',mark,{passive:true,capture:true});
  if(isTouchDevice())mark();
  const place=(x,y)=>{stick.style.left=x+'px';stick.style.top=y+'px';};
  const knobAt=(x,y)=>{knob.style.transform=`translate(${x}px,${y}px)`;};
  const releaseStick=()=>{stickId=null;origin=null;state.x=state.y=0;stick.classList.remove('active');stick.style.left=stick.style.top='';knobAt(0,0);};
  zone.addEventListener('pointerdown',e=>{if(stickId!==null)return;e.preventDefault();mark();stickId=e.pointerId;zone.setPointerCapture?.(e.pointerId);const r=zone.getBoundingClientRect();origin={x:e.clientX,y:e.clientY};place(e.clientX-r.left,e.clientY-r.top);stick.classList.add('active');knobAt(0,0);});
  zone.addEventListener('pointermove',e=>{if(e.pointerId!==stickId)return;e.preventDefault();const dx=e.clientX-origin.x,dy=e.clientY-origin.y,len=Math.hypot(dx,dy),c=len>STICK_RADIUS?STICK_RADIUS/len:1;knobAt(dx*c,dy*c);const v=stickVector(dx,dy);state.x=v.x;state.y=v.y;});
  for(const type of ['pointerup','pointercancel','lostpointercapture'])zone.addEventListener(type,e=>{if(e.pointerId===stickId)releaseStick();});
  const hold=(id,key,onPress)=>{const el=$(id);let pid=null;
    el.addEventListener('pointerdown',e=>{e.preventDefault();mark();if(pid!==null)return;pid=e.pointerId;el.setPointerCapture?.(e.pointerId);state[key]=true;el.classList.add('down');onPress?.();});
    const up=e=>{if(e.pointerId!==pid)return;pid=null;state[key]=false;el.classList.remove('down');};
    for(const type of ['pointerup','pointercancel','lostpointercapture'])el.addEventListener(type,up);
    el.addEventListener('contextmenu',e=>e.preventDefault());
    return ()=>{pid=null;state[key]=false;el.classList.remove('down');};};
  const resets=[hold('touch-jump','jump',()=>{if(input.enabled)input.action('jump');}),hold('touch-boost','boost'),hold('touch-slide','slide')];
  $('touch').addEventListener('contextmenu',e=>e.preventDefault());
  input.touchReset=()=>{releaseStick();resets.forEach(r=>r());};
}
