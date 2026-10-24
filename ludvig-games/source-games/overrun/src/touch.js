// Touch controls for phones and tablets. They feed the same Input state as keyboard, mouse and gamepad,
// so movement, aiming and weapons behave exactly as on desktop. Shown only while a match runs in touch mode.
const ICONS={
 pause:'<path d="M9 5v14M15 5v14"/>',
 fire:'<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="1.6"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4"/>',
 aim:'<circle cx="12" cy="12" r="8"/><path d="M12 4v5m0 6v5M4 12h5m6 0h5"/>',
 jump:'<path d="m6 13 6-6 6 6M6 19l6-6 6 6"/>',
 crouch:'<path d="m6 5 6 6 6-6M6 11l6 6 6-6"/><path d="M5 21h14"/>',
 reload:'<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 5v6h-6"/>',
 swap:'<path d="M4 8h14m-4-4 4 4-4 4"/><path d="M20 16H6m4-4-4 4 4 4"/>'
};
const svg=name=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
const LOOK_GAIN=4.2,STICK=56;

export function setupTouch(input,ui){
 const root=document.createElement('div');root.id='touch-ui';root.setAttribute('aria-hidden','true');
 root.innerHTML=`<div id="touch-move" class="touch-zone"><i class="stick-base"><b class="stick-knob"></b></i></div><div id="touch-look" class="touch-zone"></div>
 <button id="touch-pause" class="touch-btn" aria-label="Pause">${svg('pause')}</button>
 <button id="touch-fire" class="touch-btn big" aria-label="Fire">${svg('fire')}</button>
 <button id="touch-ads" class="touch-btn" aria-label="Aim">${svg('aim')}</button>
 <button id="touch-jump" class="touch-btn" aria-label="Jump">${svg('jump')}</button>
 <button id="touch-crouch" class="touch-btn" aria-label="Crouch or slide">${svg('crouch')}</button>
 <button id="touch-reload" class="touch-btn" aria-label="Reload">${svg('reload')}</button>
 <button id="touch-swap" class="touch-btn" aria-label="Switch weapon">${svg('swap')}</button>`;
 document.body.append(root);
 const $=id=>root.querySelector('#'+id),base=root.querySelector('.stick-base'),knob=root.querySelector('.stick-knob');
 const code=a=>input.bind(a);
 let move=null,look=null,fire=null;
 const live=()=>input.touchMode&&input.locked;
 function sync(){document.body.classList.toggle('touch',input.touchMode);document.body.classList.toggle('touch-live',live());ui.touch=input.touchMode;if(!live())reset();}
 function enable(){if(input.touchMode||document.pointerLockElement)return;input.touchMode=true;sync();}
 function reset(){move=look=fire=null;base.classList.remove('on');knob.style.transform='';input.touchMove.x=input.touchMove.y=0;input.keys.delete(code('sprint'));$('touch-ads').classList.remove('on');for(const b of root.querySelectorAll('.touch-btn'))b.classList.remove('down');}
 const orig=input.onLock;input.onLock=(locked,error)=>{orig?.(locked,error);sync();};
 input.onClear=()=>{if(input.touchMode){move=look=fire=null;base.classList.remove('on');knob.style.transform='';input.keys.delete(code('sprint'));$('touch-ads').classList.remove('on');}};
 if(matchMedia('(pointer: coarse)').matches||(navigator.maxTouchPoints>0&&matchMedia('(hover: none)').matches))enable();
 window.addEventListener('touchstart',enable,{passive:true,capture:true});
 // Keep the browser from scrolling, zooming or sending emulated mouse clicks during play.
 root.addEventListener('touchstart',e=>{if(live())e.preventDefault();},{passive:false});
 root.addEventListener('contextmenu',e=>e.preventDefault());

 const zoneMove=$('touch-move');
 zoneMove.addEventListener('pointerdown',e=>{if(!live()||move)return;e.preventDefault();zoneMove.setPointerCapture?.(e.pointerId);move={id:e.pointerId,x:e.clientX,y:e.clientY};base.style.left=e.clientX+'px';base.style.top=e.clientY+'px';base.classList.add('on');stick(e);});
 zoneMove.addEventListener('pointermove',e=>{if(move&&e.pointerId===move.id)stick(e);});
 const endMove=e=>{if(!move||e.pointerId!==move.id)return;move=null;base.classList.remove('on');knob.style.transform='';input.touchMove.x=input.touchMove.y=0;input.keys.delete(code('sprint'));};
 zoneMove.addEventListener('pointerup',endMove);zoneMove.addEventListener('pointercancel',endMove);
 function stick(e){let dx=e.clientX-move.x,dy=e.clientY-move.y;const d=Math.hypot(dx,dy);if(d>STICK){dx*=STICK/d;dy*=STICK/d;}knob.style.transform=`translate(${dx}px,${dy}px)`;const x=dx/STICK,y=dy/STICK;const dead=v=>Math.abs(v)<.12?0:v;input.touchMove.x=dead(x);input.touchMove.y=dead(y);
  if(d>STICK*1.15&&y<-.55)input.keys.add(code('sprint'));else input.keys.delete(code('sprint'));}

 function lookBy(state,e){const dx=e.clientX-state.x,dy=e.clientY-state.y;state.x=e.clientX;state.y=e.clientY;input.mouse.x+=dx*LOOK_GAIN;input.mouse.y+=dy*LOOK_GAIN;}
 const zoneLook=$('touch-look');
 zoneLook.addEventListener('pointerdown',e=>{if(!live()||look)return;e.preventDefault();zoneLook.setPointerCapture?.(e.pointerId);look={id:e.pointerId,x:e.clientX,y:e.clientY};});
 zoneLook.addEventListener('pointermove',e=>{if(look&&e.pointerId===look.id)lookBy(look,e);});
 const endLook=e=>{if(look&&e.pointerId===look.id)look=null;};
 zoneLook.addEventListener('pointerup',endLook);zoneLook.addEventListener('pointercancel',endLook);

 function press(id,down,up,{drag=false}={}){const b=$(id);let active=null;
  b.addEventListener('pointerdown',e=>{if(!live())return;e.preventDefault();e.stopPropagation();b.setPointerCapture?.(e.pointerId);active={id:e.pointerId,x:e.clientX,y:e.clientY};b.classList.add('down');down?.();});
  if(drag)b.addEventListener('pointermove',e=>{if(active&&e.pointerId===active.id)lookBy(active,e);});
  const end=e=>{if(!active||e.pointerId!==active.id)return;active=null;b.classList.remove('down');up?.();};
  b.addEventListener('pointerup',end);b.addEventListener('pointercancel',end);b.addEventListener('lostpointercapture',end);
  b.addEventListener('click',e=>e.preventDefault());}
 const hold=action=>[()=>{const c=code(action);input.pressed.add(c);input.keys.add(c);},()=>input.keys.delete(code(action))];
 press('touch-fire',()=>{input.fire=true;input.firePressed=true;},()=>{input.fire=false;},{drag:true});
 press('touch-ads',()=>{input.ads=!input.ads;$('touch-ads').classList.toggle('on',input.ads);});
 press('touch-jump',...hold('jump'));
 press('touch-crouch',...hold('crouch'));
 press('touch-reload',()=>input.pressed.add(code('reload')));
 press('touch-swap',()=>{input.wheel++;});
 press('touch-pause',null,()=>input.unlock());
 sync();
 return {get visible(){return live()&&getComputedStyle(root).display!=='none';},enable};
}
