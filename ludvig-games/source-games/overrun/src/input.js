export const DEFAULT_BINDINGS={forward:'KeyW',backward:'KeyS',left:'KeyA',right:'KeyD',jump:'Space',sprint:'ShiftLeft',crouch:'KeyC',reload:'KeyR',primary:'Digit1',secondary:'Digit2',melee:'KeyV',inspect:'KeyI',scoreboard:'Tab',walk:'AltLeft'};
export class Input {
  constructor(canvas,settings,onLock){this.canvas=canvas;this.settings=settings;this.onLock=onLock;this.keys=new Set();this.pressed=new Set();this.mouse={x:0,y:0};this.fire=false;this.ads=false;this.firePressed=false;this.wheel=0;this.locked=false;this.lastShift=-1000;this.tactical=false;this.padPrevious=[];this.padMove={x:0,y:0};this.padLook={x:0,y:0};this.usingPad=false;this.rebinding=null;this.touchMode=false;this.touchMove={x:0,y:0};
    document.addEventListener('keydown',e=>{if(this.rebinding){e.preventDefault();if(e.code!=='Escape'){this.settings.bindings[this.rebinding]=e.code;this.onRebind?.(this.rebinding,e.code);}this.rebinding=null;return;}if(e.target.matches('input,select,textarea')&&!this.locked)return;if(['Tab','Space','AltLeft','ControlLeft','ControlRight'].includes(e.code)&&this.locked)e.preventDefault();if(!this.keys.has(e.code)){this.pressed.add(e.code);if(e.code===this.bind('sprint')){this.tactical=performance.now()-this.lastShift<300;this.lastShift=performance.now();}}this.keys.add(e.code);});
    document.addEventListener('keyup',e=>{this.keys.delete(e.code);if(e.code===this.bind('sprint'))this.tactical=false;});
    document.addEventListener('mousemove',e=>{if(this.locked){this.mouse.x+=e.movementX;this.mouse.y+=e.movementY;this.usingPad=false;}});
    canvas.addEventListener('mousedown',e=>{if(!this.locked)return;if(e.button===0){this.fire=true;this.firePressed=true;}if(e.button===2)this.ads=true;});
    document.addEventListener('mouseup',e=>{if(this.touchMode&&this.locked)return;if(e.button===0)this.fire=false;if(e.button===2)this.ads=false;});
    canvas.addEventListener('contextmenu',e=>e.preventDefault());
    canvas.addEventListener('wheel',e=>{if(this.locked){e.preventDefault();this.wheel+=Math.sign(e.deltaY);}},{passive:false});
    document.addEventListener('pointerlockchange',()=>{if(this.touchMode&&!document.pointerLockElement)return;this.locked=document.pointerLockElement===canvas;if(!this.locked)this.clear();this.onLock?.(this.locked);});
    window.addEventListener('blur',()=>this.clear());document.addEventListener('visibilitychange',()=>{if(document.hidden){this.clear();if(this.touchMode&&this.locked)this.unlock();}});
  }
  bind(action){return this.settings.bindings?.[action]||DEFAULT_BINDINGS[action];}
  down(action){return this.keys.has(this.bind(action))||(action==='crouch'&&(this.keys.has('ControlLeft')||this.keys.has('ControlRight')));}
  take(action){const code=this.bind(action);let v=this.pressed.delete(code);if(action==='crouch'){v=this.pressed.delete('ControlLeft')||this.pressed.delete('ControlRight')||v;}return v;}
  clear(){this.touchMove.x=this.touchMove.y=0;this.onClear?.();this.keys.clear();this.pressed.clear();this.fire=this.ads=this.firePressed=this.tactical=false;this.mouse.x=this.mouse.y=this.wheel=0;this.padMove.x=this.padMove.y=this.padLook.x=this.padLook.y=0;}
  async lock(){if(this.touchMode){if(!this.locked){this.locked=true;this.clear();this.onLock?.(true);}return;}try{await this.canvas.requestPointerLock({unadjustedMovement:true});}catch{try{await this.canvas.requestPointerLock();}catch{this.onLock?.(false,'Pointer lock unavailable. Open the game in its own tab.');}}}
  unlock(){if(this.touchMode&&this.locked&&!document.pointerLockElement){this.locked=false;this.clear();this.onLock?.(false);return;}document.exitPointerLock?.();}
  pollPad(dt){this.pollGamepad(dt);if(this.touchMode&&this.locked){this.padMove.x+=this.touchMove.x;this.padMove.y+=this.touchMove.y;}}
  pollGamepad(dt){const p=Array.from(navigator.getGamepads?.()||[]).find(Boolean);if(!p){this.padMove.x=this.padMove.y=this.padLook.x=this.padLook.y=0;if(this.usingPad){for(const a of ['jump','crouch','reload','scoreboard','sprint','melee','inspect'])this.keys.delete(this.bind(a));this.fire=this.ads=this.firePressed=this.tactical=false;this.usingPad=false;this.padPrevious=[];}return;}const dz=v=>Math.abs(v)<.14?0:Math.sign(v)*(Math.abs(v)-.14)/.86;this.padMove.x=dz(p.axes[0]||0);this.padMove.y=dz(p.axes[1]||0);this.padLook.x=dz(p.axes[2]||0);this.padLook.y=dz(p.axes[3]||0);if(this.padMove.x||this.padMove.y||this.padLook.x||this.padLook.y)this.usingPad=true;if(!this.locked)return;
    const actions={0:'jump',1:'crouch',2:'reload',8:'scoreboard',10:'sprint',11:'melee',12:'inspect'};
    for(const [n,a]of Object.entries(actions)){const i=+n,down=!!p.buttons[i]?.pressed;if(down&&!this.padPrevious[i]){this.pressed.add(this.bind(a));this.usingPad=true;if(a==='sprint')this.tactical=true;if(a==='primary')this.wheel++;}if(down)this.keys.add(this.bind(a));else if(this.padPrevious[i])this.keys.delete(this.bind(a));}
    if(p.buttons[3]?.pressed&&!this.padPrevious[3]){this.wheel++;this.usingPad=true;}if(p.buttons[9]?.pressed&&!this.padPrevious[9])this.unlock();
    if(p.buttons[7]?.pressed&&!this.padPrevious[7]){this.firePressed=true;this.usingPad=true;}if(this.usingPad){this.fire=!!p.buttons[7]?.pressed;this.ads=!!p.buttons[6]?.pressed;}
    this.padPrevious=p.buttons.map(b=>b.pressed);
  }
}
