import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Run with: node tests/runner-lifecycle.test.mjs
// Execute the real input/lifecycle wrapper and physics. Only its WebGL boundary
// is replaced, so these checks need neither a browser nor third-party packages.
const SCENE_FACTORY = Symbol.for('HorseTinder.lifecycle-test.scene');
let source = await readFile(new URL('../dist/runner.js', import.meta.url), 'utf8');
assert.match(source, /import \{ makeRunnerScene \} from '\.\/runner-scene\.js';/);
source = source
  .replace("from './runner-model.js'", `from '${new URL('../dist/runner-model.js', import.meta.url).href}'`)
  .replace("import { makeRunnerScene } from './runner-scene.js';", "const makeRunnerScene = (...args) => globalThis[Symbol.for('HorseTinder.lifecycle-test.scene')](...args);");
const { startDateGame } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

class Surface {
  listeners = new Map();
  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(fn);
  }
  removeEventListener(type, fn) { this.listeners.get(type)?.delete(fn); }
  fire(type, props = {}) {
    const event = { target: this, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...props };
    for (const fn of [...(this.listeners.get(type) || [])]) fn(event);
    return event;
  }
  get listenerCount() { return [...this.listeners.values()].reduce((sum, set) => sum + set.size, 0); }
  matches() { return false; }
  closest() { return null; }
}

function environment(t) {
  const window = new Surface(), document = new Surface(), canvas = new Surface();
  document.hidden = false;
  canvas.style = { touchAction: 'pan-y' };
  canvas.getContext = () => ({});
  canvas.focus = () => {};
  const captures = new Set();
  canvas.setPointerCapture = id => captures.add(id);
  canvas.hasPointerCapture = id => captures.has(id);
  canvas.releasePointerCapture = id => { captures.delete(id); canvas.fire('lostpointercapture', { pointerId: id }); };
  const frames = new Map(), observers = new Set(), scenes = [], games = [], updates = [];
  let nextFrame = 0, now = 100;
  const globals = {
    window, document,
    requestAnimationFrame(fn) { const id = ++nextFrame; frames.set(id, fn); return id; },
    cancelAnimationFrame(id) { frames.delete(id); },
    ResizeObserver: class {
      observe() { observers.add(this); }
      disconnect() { observers.delete(this); }
    },
    [SCENE_FACTORY]: () => {
      const scene = {
        renderCount: 0, disposeCount: 0, events: [], state: null,
        render(state) { assert.equal(this.disposeCount, 0, 'disposed scenes must never render'); this.renderCount++; this.state = structuredClone(state); },
        resize() {}, event(event) { this.events.push(event); }, dispose() { this.disposeCount++; },
      };
      scenes.push(scene);
      return scene;
    },
  };
  const old = new Map();
  for (const key of Reflect.ownKeys(globals)) { old.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: globals[key] }); }
  t.after(() => {
    for (const game of games) game.stop();
    for (const [key, descriptor] of old) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
  });
  const env = {
    window, document, canvas, frames, observers, scenes, updates,
    start(options = {}) {
      const { onUpdate, ...rest } = options;
      const game = startDateGame({ canvas, horse: { id: 'sir-neighs' }, ...rest, onUpdate(state) { updates.push(structuredClone(state)); onUpdate?.(state); } });
      games.push(game);
      return game;
    },
    frame(milliseconds = 1000 / 60) {
      now += milliseconds;
      for (const [id, callback] of [...frames]) { frames.delete(id); callback(now); }
    },
    advance(seconds) { for (let i = 0; i < Math.ceil(seconds * 60); i++) this.frame(); },
    assertReleased(scene = scenes.at(-1)) {
      assert.equal(frames.size, 0, 'no outstanding animation frame');
      assert.equal(window.listenerCount + document.listenerCount + canvas.listenerCount, 0, 'all input and visibility handlers removed');
      assert.equal(observers.size, 0, 'resize observer disconnected');
      assert.equal(scene.disposeCount, 1, 'graphics resources disposed exactly once');
      assert.equal(canvas.style.touchAction, 'pan-y', 'original canvas scrolling behavior restored');
    },
  };
  return env;
}

test('pause callbacks may re-enter pause without recursion; pause stops rendering and resume starts one loop', t => {
  const env = environment(t);
  let game, appPaused = false;
  game = env.start({ onUpdate(state) {
    // This recreates the integration regression: the HUD asks the runner to pause
    // while processing its paused notification, before updating its own flag.
    if (state.phase === 'paused' && !appPaused) { game.pause(); appPaused = true; }
  } });
  env.advance(.2);
  assert.doesNotThrow(() => game.pause());
  assert.equal(appPaused, true);
  assert.equal(env.updates.filter(s => s.phase === 'paused').length, 1);
  assert.equal(env.frames.size, 0);
  const rendered = env.scenes[0].renderCount;
  game.pause();
  env.advance(2);
  assert.equal(env.scenes[0].renderCount, rendered, 'a paused game does not continuously redraw WebGL');
  game.resume(); game.resume(); game.resume();
  assert.equal(env.frames.size, 1, 'repeated resume cannot create duplicate animation loops');
  env.frame();
  assert.equal(env.frames.size, 1);
  game.stop();
  env.assertReleased();
});

test('stopping and retrying on the same canvas never accumulates handlers, observers or frames', t => {
  const env = environment(t);
  let activeListenerCount;
  for (let retry = 0; retry < 4; retry++) {
    const game = env.start();
    const count = env.window.listenerCount + env.document.listenerCount + env.canvas.listenerCount;
    if (retry === 0) { activeListenerCount = count; assert.ok(count > 0); }
    else assert.equal(count, activeListenerCount);
    assert.equal(env.frames.size, 1);
    assert.equal(env.observers.size, 1);
    assert.equal(env.canvas.style.touchAction, 'none');
    env.advance(.2);
    game.stop(); game.stop();
    env.assertReleased();
    const rendered = env.scenes.at(-1).renderCount;
    env.advance(.2);
    assert.equal(env.scenes.at(-1).renderCount, rendered);
  }
});

test('Space preserves native buttons; repeated keys, cancelled touches and other fingers cannot double-jump', t => {
  const env = environment(t), game = env.start();
  env.advance(3.2);
  const scene = env.scenes[0];
  assert.equal(scene.state.phase, 'running');
  const button = { matches: () => false, closest: () => ({ tagName: 'BUTTON' }) };
  const buttonSpace = env.window.fire('keydown', { target: button, key: ' ', code: 'Space', repeat: false });
  assert.equal(buttonSpace.defaultPrevented, false, 'focused Pause/Resume/Jump buttons retain native Space activation');
  env.frame();
  assert.equal(scene.events.filter(e => e.type === 'jump').length, 0);
  const canvasSpace = env.window.fire('keydown', { target: env.canvas, key: ' ', code: 'Space', repeat: false });
  assert.equal(canvasSpace.defaultPrevented, true);
  env.window.fire('keydown', { target: env.canvas, key: ' ', code: 'Space', repeat: true });
  env.frame();
  assert.equal(scene.events.filter(e => e.type === 'jump').length, 1);
  env.advance(.9);
  env.canvas.fire('pointerdown', { pointerId: 1, clientX: 20, clientY: 30, isPrimary: true, button: 0 });
  env.canvas.fire('pointerdown', { pointerId: 2, clientX: 40, clientY: 50, isPrimary: false, button: 0 });
  env.canvas.fire('pointerup', { pointerId: 2, clientX: 40, clientY: 50 });
  env.canvas.fire('pointercancel', { pointerId: 1 });
  env.canvas.fire('pointerup', { pointerId: 1, clientX: 20, clientY: 30 });
  env.frame();
  assert.equal(scene.events.filter(e => e.type === 'jump').length, 1, 'cancelled or secondary pointers cannot trigger a jump');
  env.canvas.fire('pointerdown', { pointerId: 3, clientX: 20, clientY: 30, isPrimary: true, button: 0 });
  env.canvas.fire('pointerup', { pointerId: 3, clientX: 20, clientY: 30 });
  env.frame();
  assert.equal(scene.events.filter(e => e.type === 'jump').length, 2, 'one tap creates one jump');
  game.stop();
  env.assertReleased();
});

test('hidden tabs, graphics loss and long frame gaps pause instead of applying unseen penalties', t => {
  const env = environment(t), game = env.start();
  env.advance(3.2);
  const scene = env.scenes[0], beforeHidden = scene.state.elapsed;
  env.document.hidden = true;
  env.document.fire('visibilitychange');
  assert.equal(env.updates.at(-1).pauseReason, 'hidden');
  assert.equal(env.frames.size, 0);
  env.document.hidden = false;
  env.document.fire('visibilitychange');
  assert.equal(env.frames.size, 0, 'returning to a tab waits for the player to resume');
  game.resume();
  env.frame(5000);
  assert.equal(scene.state.elapsed, beforeHidden, 'the first resumed frame must not consume hidden time');
  env.frame();
  const beforeGap = scene.state.elapsed;
  env.frame(2000);
  assert.equal(env.updates.at(-1).pauseReason, 'performance');
  assert.equal(scene.state.elapsed, beforeGap);
  assert.equal(env.frames.size, 0);
  game.resume();
  const loss = env.canvas.fire('webglcontextlost');
  assert.equal(loss.defaultPrevented, true);
  assert.equal(env.updates.at(-1).pauseReason, 'graphics');
  assert.equal(env.frames.size, 0);
  game.stop();
  env.assertReleased();
});

test('completion releases resources before notifying the app and fires only once', t => {
  const env = environment(t);
  let completions = 0;
  const game = env.start({ onComplete(result) { completions++; env.assertReleased(); assert.equal(result.duration, 30); } });
  env.advance(34);
  assert.equal(completions, 1);
  env.assertReleased();
  env.advance(5);
  game.resume(); game.jump(); game.move(1);
  assert.equal(completions, 1);
  assert.equal(env.frames.size, 0);
});

test('a failing application completion callback still leaves no active game resources', t => {
  const env = environment(t);
  env.start({ onComplete() { throw new Error('application callback failed'); } });
  assert.throws(() => env.advance(34), /application callback failed/);
  env.assertReleased();
});
