import { ArenaRenderer } from './renderer';
import { FallbackArenaRenderer } from './fallback-renderer';
import { ArcadeAudio } from './audio';
import { createGame, createAI, stepGame, clampTarget } from './physics';
import { OnlineGame } from './online';
import { TABLE, type Difficulty, type GameState, type Side, type Targets, type Vec2 } from './types';
import { DEFAULT_PREFERENCES, type Preferences } from './preferences';

export type PlayMode = 'demo' | 'ai' | 'local' | 'online';
export type HudState = {
  scores: [number,number]; phase: GameState['phase']; timer: number; elapsed: number;
  rally: number; scorer: Side | null; target: number; paused: boolean; mode: PlayMode; ping: number;
};
export class GameRuntime {
  renderer: ArenaRenderer | FallbackArenaRenderer;
  audio = new ArcadeAudio();
  mode: PlayMode = 'demo';
  game = createGame(7);
  side: Side = 0;
  paused = false;
  online: OnlineGame | null = null;
  onHud?: (state: HudState) => void;
  onPause?: (paused: boolean) => void;
  onControl?: (method: 'mouse'|'keyboard'|'touch') => void;
  onError?: (message: string) => void;
  onGraphicsChange?: (available: boolean) => void;
  private bots = [createAI('Hard', 0), createAI('Medium', 1)];
  private preferences: Preferences = structuredClone(DEFAULT_PREFERENCES);
  private targets: Targets = [{x:0,y:5.2},{x:0,y:-5.2}];
  private keys = new Set<string>();
  private touches = new Map<number, {side:Side;offset:Vec2}>();
  private raf = 0;
  private lastFrame = 0;
  private accumulator = 0;
  private lastHud = 0;
  private finishedAt = 0;
  private destroyed = false;
  private resizeObserver: ResizeObserver;
  private cleanup: (()=>void)[] = [];
  private lastControl = 'mouse';
  private localTouch = false;
  private contextLost = false;
  private pointerLocked = false;
  private pauseIntent: boolean | null = null;
  private pauseRequest = 0;
  private focusOnNextFrame = false;

  get compatibility(): boolean { return this.renderer instanceof FallbackArenaRenderer; }

  constructor(private container: HTMLElement) {
    const existingCanvases = new Set(container.querySelectorAll('canvas'));
    try {
      this.renderer = new ArenaRenderer(container);
    } catch {
      // A blocked GPU still gets the same controls, physics and network game.
      // Remove a canvas left by an interrupted WebGL constructor, if any.
      for (const canvas of container.querySelectorAll('canvas')) if (!existingCanvases.has(canvas)) canvas.remove();
      this.renderer = new FallbackArenaRenderer(container);
    }
    this.resizeObserver = new ResizeObserver(() => { if (!this.contextLost) this.renderer.resize(); });
    this.resizeObserver.observe(container);
    this.listen(container, 'pointermove', this.pointerMove as EventListener);
    this.listen(container, 'pointerdown', this.pointerDown as EventListener);
    this.listen(container, 'pointerup', this.pointerUp as EventListener);
    this.listen(container, 'pointercancel', this.pointerUp as EventListener);
    this.listen(container, 'lostpointercapture', ((event: PointerEvent) => { this.touches.delete(event.pointerId); }) as EventListener);
    this.listen(window, 'keydown', this.keyDown as EventListener);
    this.listen(window, 'keyup', ((e:KeyboardEvent) => { this.keys.delete(e.code); }) as EventListener);
    this.listen(window, 'blur', () => { this.clearInput(); if(this.mode !== 'demo' && this.mode !== 'online') this.pause(true); });
    this.listen(document, 'pointerlockchange', () => {
      const locked = document.pointerLockElement === this.container;
      const released = this.pointerLocked && !locked;
      this.pointerLocked = locked;
      // Browsers can consume Escape while releasing Pointer Lock, so the
      // keydown listener alone cannot reliably pause that interaction.
      if (released && !this.paused && this.mode !== 'demo') this.pause(true);
    });
    this.listen(this.renderer.canvas, 'webglcontextlost', this.graphicsLost);
    this.listen(this.renderer.canvas, 'webglcontextrestored', this.graphicsRestored);
    this.listen(document, 'visibilitychange', () => {
      this.clearInput(); this.lastFrame = 0; this.accumulator = 0;
      if (document.hidden) { this.audio.suspend(); if (this.mode !== 'demo' && this.mode !== 'online') this.pause(true); }
      else if(this.mode !== 'demo' && !this.contextLost) void this.audio.unlock();
    });
    this.raf = requestAnimationFrame(this.frame);
  }
  private listen(target: EventTarget, name: string, fn: EventListener) {
    target.addEventListener(name, fn); this.cleanup.push(() => target.removeEventListener(name, fn));
  }
  private clearInput() {
    this.keys.clear();
    for (const id of this.touches.keys()) {
      try { if (this.container.hasPointerCapture(id)) this.container.releasePointerCapture(id); } catch { /* A cancelled pointer may already be released. */ }
    }
    this.touches.clear();
    this.targets = this.game.mallets.map(m => ({ x: m.x, y: m.y })) as Targets;
  }
  private graphicsLost = (event: Event) => {
    event.preventDefault();
    if (this.destroyed || this.contextLost) return;
    this.contextLost = true;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.clearInput();
    this.pause(true);
    this.audio.suspend();
    this.onGraphicsChange?.(false);
    this.onError?.('Graphics were interrupted. Waiting for your browser to restore the table. Reload if it does not recover.');
  };
  private graphicsRestored = () => {
    if (this.destroyed || !this.contextLost) return;
    this.contextLost = false;
    this.lastFrame = 0; this.accumulator = 0;
    this.renderer.resize();
    this.onGraphicsChange?.(true);
    this.raf = requestAnimationFrame(this.frame);
  };
  configure(preferences: Preferences) {
    this.preferences = preferences;
    this.audio.configure(preferences.volume, preferences.ambience, preferences.muted);
    this.renderer.setQuality?.(preferences.quality);
  }
  async unlock() { await this.audio.unlock(); }
  private initialize(mode:PlayMode, targetScore:number) {
    if (this.online) { this.online.dispose(); this.online = null; }
    this.clearInput(); this.pauseIntent = null; this.pauseRequest++;
    this.mode = mode; this.side = 0; this.paused = this.contextLost; this.localTouch = false;
    this.game = createGame(targetScore, (Date.now() % 2147483647) || 1);
    this.targets = [{x:0,y:5.2},{x:0,y:-5.2}]; this.accumulator = 0; this.finishedAt=0; this.lastFrame=0;
    this.renderer.setView(0, mode === 'demo'); this.onPause?.(this.paused); this.lastHud = 0;
    this.focusOnNextFrame = mode !== 'demo';
    if (mode !== 'demo') this.control('mouse');
    if (mode !== 'demo' && !this.contextLost) void this.unlock();
  }
  startAI(difficulty:Difficulty, target:number) {
    this.initialize('ai', target); this.bots = [createAI('Hard',0),createAI(difficulty,1)];
  }
  startLocal(target:number, touch = false) {
    this.initialize('local', target); this.localTouch = touch; this.control(touch ? 'touch' : 'keyboard');
  }
  attachOnline(online:OnlineGame) {
    this.initialize('online', online.snapshot?.state.targetScore || 7);
    this.online = online; this.side = online.session.side;
    this.renderer.setView(this.side);
    online.onEvents = events => { this.renderer.effects(events); this.audio.play(events, this.side); };
    if(online.snapshot) this.game = online.snapshot.state;
    this.targets[this.side] = {x:0,y:this.side === 0 ? 5.2 : -5.2};
  }
  home() {
    if (this.online) {
      const online = this.online; this.online = null;
      const leaveDeadline = setTimeout(() => online.dispose(), 1000);
      void online.action('leave').catch(()=>{}).finally(()=>{
        clearTimeout(leaveDeadline); online.dispose();
      });
      OnlineGame.clearSession();
    }
    document.exitPointerLock?.();
    this.initialize('demo', 7); this.bots = [createAI('Hard',0),createAI('Hard',1)];
  }
  pause(value = !this.paused) {
    if(this.mode === 'demo' || this.game.phase === 'finished') return;
    if (this.contextLost && !value) {
      this.onError?.('The graphics connection is still recovering. Reload the page if the table does not return.');
      this.onGraphicsChange?.(false);
      return;
    }
    this.clearInput();
    if (this.mode === 'online' && this.online) {
      if (value === this.paused && this.pauseIntent === null) return;
      const online = this.online;
      const request = ++this.pauseRequest;
      this.pauseIntent = value;
      void online.action(value ? 'pause' : 'resume').then(() => {
        if (this.online === online && this.pauseRequest === request) this.pauseIntent = null;
      }).catch(error => {
        if (this.online !== online || this.pauseRequest !== request || this.destroyed) return;
        this.pauseIntent = null;
        this.paused = online.snapshot?.status === 'paused' || online.snapshot?.status === 'disconnected' || this.contextLost;
        this.onPause?.(this.paused);
        this.onError?.(error instanceof Error ? error.message : 'The pause request could not be completed.');
      });
    }
    this.paused = value; this.accumulator = 0; this.onPause?.(value);
    if (value) document.exitPointerLock?.(); else { this.focusOnNextFrame = true; void this.unlock(); }
  }
  private control(method:'mouse'|'keyboard'|'touch') {
    if(this.lastControl !== method) { this.lastControl = method; this.onControl?.(method); }
  }
  private canInput() {
    return !this.contextLost && this.mode !== 'demo' && !this.paused && this.game.phase !== 'finished'
      && (this.mode !== 'online' || this.online?.status === 'playing');
  }
  private pointerMove = (event:PointerEvent) => {
    if (!this.canInput()) return;
    if (event.pointerType === 'touch' || event.pointerType === 'pen') {
      const touch = this.touches.get(event.pointerId);
      if(!touch) return;
      const point = this.renderer.screenToWorld(event.clientX,event.clientY);
      if(point) this.targets[touch.side] = clampTarget(touch.side, {x:point.x + touch.offset.x,y:point.y + touch.offset.y});
      return;
    }
    if(this.mode === 'local') return;
    this.control('mouse');
    if(document.pointerLockElement === this.container) {
      const rect = this.renderer.canvas.getBoundingClientRect();
      const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
      const origin = this.renderer.screenToWorld(x, y);
      const shifted = this.renderer.screenToWorld(x + event.movementX, y + event.movementY);
      const old = this.targets[this.side];
      if (origin && shifted) this.targets[this.side] = clampTarget(this.side,{x:old.x + shifted.x - origin.x,y:old.y + shifted.y - origin.y});
    } else {
      const point = this.renderer.screenToWorld(event.clientX,event.clientY);
      if(point) this.targets[this.side] = clampTarget(this.side,point);
    }
  };
  private pointerDown = (event:PointerEvent) => {
    if(!this.canInput()) return;
    void this.unlock();
    if(event.pointerType !== 'touch' && event.pointerType !== 'pen') {
      if (event.button !== 0) return;
      if(this.preferences.pointerLock && this.mode !== 'local' && !document.pointerLockElement) {
        try { const p = this.container.requestPointerLock(); if(p) p.catch(()=>this.onError?.('Pointer lock is unavailable in this browser. Mouse tracking still works.')); } catch {}
      }
      this.pointerMove(event); return;
    }
    event.preventDefault(); this.control('touch');
    const point = this.renderer.screenToWorld(event.clientX,event.clientY);
    if(!point) return;
    const side:Side = this.mode === 'local' ? (point.y >= 0 ? 0 : 1) : this.side;
    if([...this.touches.values()].some(t=>t.side===side)) return;
    const mallet = this.game.mallets[side];
    const near = Math.hypot(point.x-mallet.x,point.y-mallet.y)<1.3;
    const offset = near ? {x:mallet.x-point.x,y:mallet.y-point.y} : {x:0,y:0};
    this.touches.set(event.pointerId,{side,offset});
    try { this.container.setPointerCapture(event.pointerId); } catch { this.touches.delete(event.pointerId); return; }
    this.targets[side] = clampTarget(side,{x:point.x+offset.x,y:point.y+offset.y});
  };
  private pointerUp = (event:PointerEvent) => {
    this.touches.delete(event.pointerId);
    if(this.container.hasPointerCapture(event.pointerId)) this.container.releasePointerCapture(event.pointerId);
  };
  private keyDown = (event:KeyboardEvent) => {
    const target = event.target instanceof HTMLElement ? event.target : null;
    if(event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
    if(target?.closest('input,select,textarea,[role="dialog"]') || target?.isContentEditable) return;
    // Movement still works after clicking a HUD button. Space retains normal
    // button activation, while Escape can pause regardless of HUD focus.
    if(event.code === 'Space' && target?.closest('button')) return;
    if((event.code==='Escape' || event.code==='Space') && !event.repeat && this.mode !== 'demo') {
      event.preventDefault(); this.pause(); return;
    }
    if(!this.canInput()) return;
    const mapped = this.preferences.keys.flatMap(key=>Object.values(key));
    if(mapped.includes(event.code) || event.code.startsWith('Arrow')) {
      event.preventDefault(); this.keys.add(event.code); this.control('keyboard');
    }
  };
  private updateKeys(dt:number) {
    if(this.keys.size===0 || this.paused) return;
    const sides:Side[] = this.mode === 'local' ? [0,1] : [this.side];
    for (const side of sides) {
      const map = this.preferences.keys[this.mode === 'local' ? side : 0];
      const has = (key:string,arrow:string) => this.keys.has(key) || (this.mode !== 'local' && this.keys.has(arrow));
      let dx = Number(has(map.right,'ArrowRight')) - Number(has(map.left,'ArrowLeft'));
      let dy = Number(has(map.down,'ArrowDown')) - Number(has(map.up,'ArrowUp'));
      const length = Math.hypot(dx,dy); if(!length) continue;
      dx/=length; dy/=length;
      const flip = this.mode==='online' && side===1 ? -1 : 1;
      const from = this.game.mallets[side];
      this.targets[side] = clampTarget(side,{x:from.x+dx*TABLE.maxMalletSpeed*dt*flip,y:from.y+dy*TABLE.maxMalletSpeed*dt*flip});
    }
  }
  private frame = (now:number) => {
    if(this.destroyed || this.contextLost) return;
    if (this.focusOnNextFrame && !this.paused && !document.querySelector('[role="dialog"]')) {
      this.focusOnNextFrame = false;
      this.container.focus({ preventScroll: true });
    }
    const dt = this.lastFrame ? Math.min(.05,(now-this.lastFrame)/1000) : 1/60;
    this.lastFrame = now;
    if(this.mode === 'online' && this.online) {
      this.updateKeys(dt);
      this.online.setTarget(this.targets[this.side]);
      const sampled = this.online.sample(dt);
      if(sampled) this.game = sampled;
      const unavailable = this.online.status === 'reconnecting' || this.online.status === 'disconnected' || this.online.status === 'error';
      const paused = unavailable || (this.pauseIntent ?? (this.online.snapshot?.status === 'paused' || this.online.snapshot?.status === 'disconnected'));
      if(paused !== this.paused) { this.paused=paused; this.clearInput(); this.onPause?.(paused); }
    } else if(!this.paused) {
      this.accumulator = Math.min(.1,this.accumulator + dt);
      while(this.accumulator >= TABLE.fixedDt) {
        this.updateKeys(TABLE.fixedDt);
        if(this.mode==='demo') this.targets[0] = this.bots[0].update(this.game,TABLE.fixedDt);
        if(this.mode==='demo'||this.mode==='ai') this.targets[1] = this.bots[1].update(this.game,TABLE.fixedDt);
        const events = stepGame(this.game,this.targets,TABLE.fixedDt);
        if(events.length) {
          this.renderer.effects(events);
          if(this.mode !== 'demo') {
            this.audio.play(events,this.side);
            if(events.some(e=>e.type==='goal') && this.lastControl==='touch') navigator.vibrate?.(25);
          }
        }
        this.accumulator-=TABLE.fixedDt;
      }
      if(this.mode==='demo' && this.game.phase==='finished') {
        if(!this.finishedAt) this.finishedAt=now;
        if(now-this.finishedAt>2200) this.home();
      }
    }
    this.renderer.update(this.game,dt,{idle:this.mode==='demo',reducedMotion:this.preferences.reducedMotion});
    if(now-this.lastHud>80) {
      this.lastHud=now;
      this.onHud?.({ scores:[...this.game.scores],phase:this.game.phase,timer:this.game.timer,elapsed:this.game.elapsed,
        rally:this.game.rally,scorer:this.game.lastScorer,target:this.game.targetScore,paused:this.paused,mode:this.mode,ping:this.online?.ping||0 });
    }
    this.raf=requestAnimationFrame(this.frame);
  };
  dispose() {
    this.destroyed=true; this.clearInput(); this.pauseRequest++; cancelAnimationFrame(this.raf); this.resizeObserver.disconnect();
    this.cleanup.forEach(fn=>fn()); this.online?.dispose(); this.audio.dispose(); this.renderer.dispose();
    if(document.pointerLockElement===this.container) document.exitPointerLock?.();
  }
}
