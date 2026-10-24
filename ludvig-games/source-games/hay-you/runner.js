import { createRunnerModel } from './runner-model.js';
import { makeRunnerScene } from './runner-scene.js';

/** Owns one date, including every input handler, animation frame, observer and GPU resource. */
export function startDateGame({ canvas, horse = {}, onUpdate = () => {}, onComplete = () => {}, onSound = () => {} }) {
  if (!canvas?.getContext) throw new TypeError('Sunset Sprint needs a canvas.');
  const model = createRunnerModel({ seed: horse.id || horse.name || 'sunset', duration: 30, countdown: 3 });
  const scene = makeRunnerScene(canvas, horse, model.objects);
  let running = true, complete = false, raf = 0, lastTime = 0, sinceUpdate = 1, pointer = null;
  const originalTouchAction = canvas.style.touchAction;
  canvas.style.touchAction = 'none';
  function emit() {
    const s = model.state;
    onUpdate({ progress: s.progress, score: s.score, hearts: s.hearts, hits: s.hits, combo: s.combo, message: s.message, countdown: s.countdown, remaining: s.remaining, phase: s.phase, pauseReason: s.pauseReason, rhythm: Math.min(1, s.combo / 9), airborne: s.airborne, nearObstacle: s.nearObstacle, chemistry: model.result().chemistry });
    sinceUpdate = 0;
  }
  function sound(event) { try { onSound(event); } catch (_) { /* Sound never interrupts the trail. */ } }
  function jump() { if (running && !complete) model.jump(); }
  function move(direction) { if (running && !complete) model.move(direction); }
  function pauseFor(reason = 'manual') {
    if (!running || complete || model.state.phase === 'paused') return;
    model.pause(reason); pointer = null; lastTime = 0; cancelAnimationFrame(raf); raf = 0; emit();
  }
  function pause() { pauseFor(); }
  function resume() {
    if (!running || complete || model.state.phase !== 'paused') return;
    model.resume(); lastTime = 0; emit(); if (!raf) raf = requestAnimationFrame(frame);
  }
  function keydown(e) {
    if (e.target?.matches?.('input,textarea,select,[contenteditable="true"]')) return;
    if (e.target?.closest?.('button,a,[role="button"]') && (e.code === 'Space' || e.key === ' ' || e.key === 'Enter')) return;
    const key = e.key.toLowerCase();
    if (['arrowleft', 'arrowright', 'arrowup', 'a', 'd', 'w', ' '].includes(key)) {
      e.preventDefault(); if (e.repeat) return;
      if (key === 'arrowleft' || key === 'a') move(-1);
      else if (key === 'arrowright' || key === 'd') move(1);
      else jump();
    }
  }
  function pointerdown(e) {
    if (!running || model.state.phase === 'paused' || e.isPrimary === false || (e.button !== undefined && e.button !== 0)) return;
    pointer = { x: e.clientX, y: e.clientY, id: e.pointerId };
    canvas.setPointerCapture?.(e.pointerId); canvas.focus({ preventScroll: true });
  }
  function pointerup(e) {
    if (!pointer || pointer.id !== e.pointerId) return;
    const dx = e.clientX - pointer.x, dy = e.clientY - pointer.y;
    pointer = null;
    if (canvas.hasPointerCapture?.(e.pointerId)) canvas.releasePointerCapture?.(e.pointerId);
    if (Math.abs(dx) >= 28 && Math.abs(dx) > Math.abs(dy) * .8) move(Math.sign(dx)); else jump();
  }
  function pointercancel() { pointer = null; }
  function visibility() { if (document.hidden) pauseFor('hidden'); }
  function contextlost(e) { e.preventDefault(); pauseFor('graphics'); }
  function resize() { if (running) { scene.resize(); if (model.state.phase === 'paused') scene.render(model.state, 0); } }
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;
  observer?.observe(canvas);
  window.addEventListener('resize', resize);
  window.addEventListener('keydown', keydown, { passive: false });
  document.addEventListener('visibilitychange', visibility);
  canvas.addEventListener('pointerdown', pointerdown);
  canvas.addEventListener('pointerup', pointerup);
  canvas.addEventListener('pointercancel', pointercancel);
  canvas.addEventListener('lostpointercapture', pointercancel);
  canvas.addEventListener('webglcontextlost', contextlost);
  function stop() {
    if (!running) return; running = false;
    cancelAnimationFrame(raf); observer?.disconnect(); pointer = null;
    window.removeEventListener('resize', resize); window.removeEventListener('keydown', keydown);
    document.removeEventListener('visibilitychange', visibility);
    canvas.removeEventListener('pointerdown', pointerdown); canvas.removeEventListener('pointerup', pointerup); canvas.removeEventListener('pointercancel', pointercancel); canvas.removeEventListener('lostpointercapture', pointercancel); canvas.removeEventListener('webglcontextlost', contextlost);
    canvas.style.touchAction = originalTouchAction; scene.dispose();
  }
  function frame(now) {
    raf = 0; if (!running) return;
    let dt = lastTime ? Math.max(0, (now - lastTime) / 1000) : 0; lastTime = now;
    if (dt > 1 && model.state.phase !== 'paused' && model.state.phase !== 'complete') {
      pauseFor('performance'); dt = 0;
    }
    dt = Math.min(dt, .25);
    model.step(dt);
    let finishResult = null;
    for (const event of model.drainEvents()) {
      scene.event(event);
      if (event.type === 'jump') sound('jump');
      else if (event.type === 'collect') sound('heart');
      else if (event.type === 'hit') sound('hit');
      else if (event.type === 'complete') { complete = true; finishResult = event.result; }
    }
    if (!running) return;
    scene.render(model.state, dt);
    sinceUpdate += dt;
    if (sinceUpdate >= .05 || finishResult) emit();
    if (finishResult) { sound('finish'); stop(); onComplete(finishResult); }
    if (running && !complete && model.state.phase !== 'paused' && !raf) raf = requestAnimationFrame(frame);
  }
  scene.render(model.state, 0); emit(); raf = requestAnimationFrame(frame);
  return { stop, pause, resume, jump, move };
}
