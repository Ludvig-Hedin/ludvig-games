export const DEFAULT_BINDINGS = { throttle:'KeyW', reverse:'KeyS', left:'KeyA', right:'KeyD', jump:'Space', boost:'ShiftLeft', powerslide:'ControlLeft', camera:'KeyC', rollLeft:'KeyQ', rollRight:'KeyE', reset:'KeyR', ballOnCar:'KeyT', next:'KeyN' };
export const BINDING_LABELS={throttle:'Accelerate / pitch forward',reverse:'Brake / pitch back',left:'Steer left / yaw left',right:'Steer right / yaw right',jump:'Jump / double jump / dodge',boost:'Boost',powerslide:'Powerslide / air roll',camera:'Toggle ball camera',rollLeft:'Air roll left',rollRight:'Air roll right',reset:'Reset training / free play',ballOnCar:'Ball on car (free play)',next:'Next training exercise'};
export const GAMEPAD_LABELS={throttle:'RT / R2',reverse:'LT / L2',left:'Left stick',right:'Left stick',jump:'A / Cross',boost:'B / Circle',powerslide:'X / Square',camera:'Y / Triangle',rollLeft:'LB / L1',rollRight:'RB / R1',reset:'D-pad down',next:'D-pad right',ballOnCar:'D-pad up'};
export function keyLabel(code){return({Space:'SPACE',ShiftLeft:'L SHIFT',ShiftRight:'R SHIFT',ControlLeft:'L CTRL',ControlRight:'R CTRL',AltLeft:'L ALT',AltRight:'R ALT',ArrowUp:'↑',ArrowDown:'↓',ArrowLeft:'←',ArrowRight:'→',Escape:'ESC'})[code]||code.replace(/^Key/,'').replace(/^Digit/,'');}
const deadzone=(v,d=.13)=>Math.abs(v)<d?0:Math.sign(v)*(Math.abs(v)-d)/(1-d);
export class Input {
  constructor(canvas,bindings,action){
    this.canvas=canvas;this.bindings={...DEFAULT_BINDINGS,...bindings};this.action=action;this.keys=new Set();this.enabled=false;this.look={x:0,y:0};this.mouseLook=false;this.padButtons={};this.pad=null;this.capture=null;this.gamepadName='';this.touch={x:0,y:0,jump:false,boost:false,slide:false};this.touchReset=null;this.abort=new AbortController();const signal=this.abort.signal;
    window.addEventListener('keydown',e=>{
      if(this.capture){e.preventDefault();if(e.code==='Escape'){this.capture(null);this.capture=null;return;}if(['MetaLeft','MetaRight'].includes(e.code))return;const cb=this.capture;this.capture=null;cb(e.code);return;}
      if(e.target.matches('input,select,textarea'))return;
      if(e.code==='Escape'){if(!e.repeat)this.action('pause');return;}
      if(!this.enabled)return;
      if(Object.values(this.bindings).includes(e.code)||e.code==='Tab'||e.code==='Space')e.preventDefault();
      if(!e.repeat){if(e.code===this.bindings.camera)this.action('camera');if(e.code===this.bindings.reset)this.action('reset');if(e.code===this.bindings.next)this.action('next');if(e.code===this.bindings.ballOnCar)this.action('ballOnCar');if(e.code===this.bindings.jump)this.action('jump');if(e.code==='F3'){e.preventDefault();this.action('fps');}}
      this.keys.add(e.code);
    },{signal});
    window.addEventListener('keyup',e=>{this.keys.delete(e.code);},{signal});
    window.addEventListener('blur',()=>this.clear(),{signal});
    canvas.addEventListener('contextmenu',e=>e.preventDefault(),{signal});
    canvas.addEventListener('mousedown',e=>{if(e.button===2&&this.enabled){this.mouseLook=true;const p=canvas.requestPointerLock?.();p?.catch?.(()=>{});}}, {signal});
    window.addEventListener('mouseup',e=>{if(e.button===2){this.mouseLook=false;if(document.pointerLockElement===canvas)document.exitPointerLock();}},{signal});
    window.addEventListener('mousemove',e=>{if(this.enabled&&this.mouseLook){this.look.x-=e.movementX*.004;this.look.y=Math.max(-.8,Math.min(.7,this.look.y+e.movementY*.003));}},{signal});
    document.addEventListener('pointerlockchange',()=>{if(!document.pointerLockElement)this.mouseLook=false;},{signal});
  }
  setBindings(bindings){this.bindings={...DEFAULT_BINDINGS,...bindings};this.clear();}
  clear(){this.keys.clear();this.touchReset?.();this.capture=null;this.mouseLook=false;this.look.x=0;this.look.y=0;}
  captureKey(callback){this.clear();this.capture=callback;}
  update(dt){
    this.pad=Array.from(navigator.getGamepads?.()||[]).find(p=>p?.connected)||null;
    const actions={0:'jump',3:'camera',9:'pause',13:'reset',15:'next',12:'ballOnCar'};
    if(this.pad){this.gamepadName=this.pad.id;for(const [index,action]of Object.entries(actions)){const down=!!this.pad.buttons[index]?.pressed;if(down&&!this.padButtons[index]&&(this.enabled||action==='pause'))this.action(action);this.padButtons[index]=down;}
      const rx=deadzone(this.pad.axes[2]||0),ry=deadzone(this.pad.axes[3]||0);if(this.enabled&&(rx||ry)){this.look.x-=rx*dt*2.5;this.look.y=Math.max(-.8,Math.min(.7,this.look.y+ry*dt*1.8));}else if(!this.mouseLook){this.look.x*=Math.exp(-dt*5);this.look.y*=Math.exp(-dt*5);}
    }else{this.padButtons={};if(!this.mouseLook){this.look.x*=Math.exp(-dt*5);this.look.y*=Math.exp(-dt*5);}}
  }
  read(){
    if(!this.enabled||this.capture)return {};
    const k=action=>this.keys.has(this.bindings[action]);let throttle=Number(k('throttle'))-Number(k('reverse'));let steer=Number(k('right'))-Number(k('left'));let jump=k('jump'),boost=k('boost'),powerslide=k('powerslide');const t=this.touch;if(t.x||t.y){if(Math.abs(t.y)>.03)throttle=-t.y;if(Math.abs(t.x)>.03)steer=t.x;}jump=jump||t.jump;boost=boost||t.boost;powerslide=powerslide||t.slide;
    let pitch=throttle,yaw=steer,roll=Number(k('rollRight'))-Number(k('rollLeft'));
    if(powerslide){roll=roll||steer;yaw=0;}
    const p=this.pad;if(p){const x=deadzone(p.axes[0]||0),y=deadzone(p.axes[1]||0);const triggers=(p.buttons[7]?.value||0)-(p.buttons[6]?.value||0);if(Math.abs(triggers)>.03)throttle=triggers;if(Math.abs(x)>.03)steer=x;if(Math.abs(y)>.03)pitch=-y;else if(Math.abs(triggers)>.03)pitch=0;
      jump=jump||!!p.buttons[0]?.pressed;boost=boost||!!p.buttons[1]?.pressed;powerslide=powerslide||!!p.buttons[2]?.pressed;const shoulder=Number(!!p.buttons[5]?.pressed)-Number(!!p.buttons[4]?.pressed);if(shoulder)roll=shoulder;if(Math.abs(x)>.03){if(powerslide){roll=x;yaw=0;}else yaw=x;}
    }
    return {throttle,steer,jump,boost,powerslide,pitch,yaw,roll};
  }
  dispose(){this.abort.abort();if(document.pointerLockElement===this.canvas)document.exitPointerLock();}
}
