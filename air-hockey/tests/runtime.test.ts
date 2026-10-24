import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { GameRuntime } from '../lib/game/runtime';
import type { OnlineGame } from '../lib/game/online';
import { createGame } from '../lib/game/physics';
import type { GameState, Vec2 } from '../lib/game/types';

// This is a runtime integration test, not a visual browser test. It executes
// the real runtime, input listeners and physics. Only graphics, audio, network
// transport and the browser event surface are replaced. No extra dependencies.
// Node's transformer writes disposable ESM modules so GPU modules can be
// replaced without requiring experimental VM/module-mocking flags.

function event(name: string, fields: Record<string, unknown> = {}, target?: EventTarget): Event {
  const value = new Event(name, { cancelable: true });
  for (const [key, field] of Object.entries(fields)) Object.defineProperty(value, key, { value: field });
  if (target) Object.defineProperty(value, 'target', { value: target });
  return value;
}

class ElementStub extends EventTarget {
  captures = new Set<number>();
  style = {};
  isContentEditable = false;
  focused = false;
  constructor(public tagName = 'DIV') { super(); }
  querySelectorAll(): ElementStub[] { return []; }
  querySelector(): null { return null; }
  getBoundingClientRect() { return { left: 0, top: 0, width: 8, height: 14 }; }
  closest(selector: string) { return selector.split(',').some(s => s.trim() === this.tagName.toLowerCase()) ? this : null; }
  focus() { this.focused = true; }
  hasPointerCapture(id: number) { return this.captures.has(id); }
  setPointerCapture(id: number) { this.captures.add(id); }
  releasePointerCapture(id: number) {
    if (this.captures.delete(id)) this.dispatchEvent(event('lostpointercapture', { pointerId: id }));
  }
  requestPointerLock() {
    documentStub.pointerLockElement = this;
    documentStub.dispatchEvent(new Event('pointerlockchange'));
    return Promise.resolve();
  }
}

const windowStub = new EventTarget();
const documentStub = Object.assign(new EventTarget(), {
  hidden: false,
  pointerLockElement: null as ElementStub | null,
  querySelector: () => null,
  exitPointerLock(): void { documentStub.pointerLockElement = null; documentStub.dispatchEvent(new Event('pointerlockchange')); },
});
const originals = new Map<string, PropertyDescriptor | undefined>();
const frames = new Map<number, FrameRequestCallback>();
let frameId = 0;
let directory = '';
let Runtime: typeof GameRuntime;
let mocks: {
  ArenaRenderer: { fail: boolean };
  OnlineGame: new () => {
    session: { side: 1 }; status: string; snapshot: { state: GameState; status: string };
    target: Vec2; resolve: () => void;
  };
};

function setGlobal(name: string, value: unknown) {
  originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  Object.defineProperty(globalThis, name, { value, writable: true, configurable: true });
}
function frame(now: number) {
  const queued = [...frames.values()]; frames.clear();
  for (const callback of queued) callback(now);
}
function start() {
  const element = new ElementStub();
  return { element, runtime: new Runtime(element as unknown as HTMLElement) };
}
function key(code: string, target = new ElementStub('BUTTON'), name = 'keydown') {
  windowStub.dispatchEvent(event(name, { code, repeat: false }, target));
}
function pointer(element: ElementStub, name: string, id: number, type: string, x: number, y: number) {
  element.dispatchEvent(event(name, { pointerId: id, pointerType: type, clientX: x, clientY: y, button: 0, buttons: 0 }));
}

before(async () => {
  setGlobal('HTMLElement', ElementStub);
  setGlobal('window', windowStub);
  setGlobal('document', documentStub);
  setGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  setGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++frameId, callback); return frameId; });
  setGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  directory = await mkdtemp(join(tmpdir(), 'air-runtime-tests-'));
  for (const name of ['types', 'physics', 'preferences', 'runtime']) {
    const source = await readFile(new URL(`../lib/game/${name}.ts`, import.meta.url), 'utf8');
    let code = stripTypeScriptTypes(source, { mode: 'transform' });
    for (const actual of ['types', 'physics', 'preferences']) code = code.replaceAll(`'./${actual}'`, `'./${actual}.mjs'`);
    for (const mock of ['renderer', 'fallback-renderer', 'audio', 'online']) code = code.replaceAll(`'./${mock}'`, "'./mocks.mjs'");
    await writeFile(join(directory, `${name}.mjs`), code);
  }
  await writeFile(join(directory, 'mocks.mjs'), `
export class ArenaRenderer {
  static fail = false;
  constructor() { if (ArenaRenderer.fail) throw Error('GPU unavailable'); this.canvas = new globalThis.HTMLElement(); this.side = 0; }
  resize() {} setQuality() {} effects() {} update() {} dispose() {}
  setView(side) { this.side = side; }
  screenToWorld(x, y) { const sign = this.side ? -1 : 1; return { x: (x - 4) * sign, y: (y - 7) * sign }; }
}
export class FallbackArenaRenderer extends ArenaRenderer {
  constructor() { const failed = ArenaRenderer.fail; ArenaRenderer.fail = false; super(); ArenaRenderer.fail = failed; }
}
export class ArcadeAudio { configure() {} unlock() { return Promise.resolve(); } play() {} suspend() {} dispose() {} }
export class OnlineGame {
  static clearSession() {}
  session = { side: 1 }; status = 'playing'; snapshot = null; calls = []; target = null;
  action(action) { this.calls.push(action); return new Promise(resolve => this.resolve = resolve); }
  dispose() {} setTarget(target) { this.target = { ...target }; } sample() { return this.snapshot.state; }
}
`);
  Runtime = (await import(pathToFileURL(join(directory, 'runtime.mjs')).href)).GameRuntime;
  mocks = await import(pathToFileURL(join(directory, 'mocks.mjs')).href);
});

after(async () => {
  for (const [name, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  }
  if (directory) await rm(directory, { recursive: true, force: true });
});

test('mouse hover controls the mallet without holding a button', () => {
  const { element, runtime } = start();
  try {
    runtime.startAI('Easy', 7); runtime.game.phase = 'playing';
    pointer(element, 'pointermove', 1, 'mouse', 7, 10);
    frame(1000);
    assert.ok(runtime.game.mallets[0].x > 0);
    assert.ok(runtime.game.mallets[0].y < 4.85);
  } finally { runtime.dispose(); }
});

test('HUD button focus permits movement, input focus does not, and keyup stops movement', () => {
  const { runtime } = start();
  try {
    runtime.startAI('Easy', 7); runtime.game.phase = 'playing';
    key('KeyD'); frame(1000);
    assert.ok(runtime.game.mallets[0].x > 0);
    key('KeyD', new ElementStub('BUTTON'), 'keyup'); frame(1017);
    const x = runtime.game.mallets[0].x;
    key('KeyA', new ElementStub('INPUT')); frame(1034);
    assert.equal(runtime.game.mallets[0].x, x);
  } finally { runtime.dispose(); }
});

test('Escape pauses even after focusing a HUD control', () => {
  const { runtime } = start();
  try {
    runtime.startAI('Medium', 7); runtime.game.phase = 'playing'; frame(1000);
    key('Escape');
    const tick = runtime.game.tick;
    assert.equal(runtime.paused, true); frame(1017); assert.equal(runtime.game.tick, tick);
  } finally { runtime.dispose(); }
});

test('two local touch pointers control opposite halves independently and release on pause', () => {
  const { element, runtime } = start();
  try {
    runtime.startLocal(7, true); runtime.game.phase = 'playing';
    pointer(element, 'pointerdown', 1, 'touch', 4, 11.85);
    pointer(element, 'pointerdown', 2, 'touch', 4, 2.15);
    pointer(element, 'pointermove', 1, 'touch', 6, 10);
    pointer(element, 'pointermove', 2, 'touch', 2, 4);
    frame(1000);
    assert.ok(runtime.game.mallets[0].x > 0 && runtime.game.mallets[1].x < 0);
    assert.equal(element.captures.size, 2);
    runtime.pause(true); assert.equal(element.captures.size, 0);
  } finally { runtime.dispose(); }
});

test('releasing Pointer Lock pauses even when the browser consumes Escape', () => {
  const { element, runtime } = start();
  try {
    runtime.startAI('Easy', 7); runtime.game.phase = 'playing';
    void element.requestPointerLock(); documentStub.exitPointerLock();
    assert.equal(runtime.paused, true);
  } finally { runtime.dispose(); }
});

test('online side-one keyboard movement follows its rotated view', () => {
  const { runtime } = start();
  try {
    const online = new mocks.OnlineGame();
    online.snapshot = { state: createGame(7), status: 'playing' }; online.snapshot.state.phase = 'playing';
    runtime.attachOnline(online as unknown as OnlineGame);
    key('ArrowRight'); frame(1000);
    assert.ok(online.target.x < 0, 'screen-right is negative world x for side one');
  } finally { runtime.dispose(); }
});

test('a stale playing snapshot cannot undo a pause while its request is pending', async () => {
  const { runtime } = start();
  try {
    const online = new mocks.OnlineGame();
    online.snapshot = { state: createGame(7), status: 'playing' }; online.snapshot.state.phase = 'playing';
    runtime.attachOnline(online as unknown as OnlineGame);
    runtime.pause(true); frame(1000); assert.equal(runtime.paused, true);
    online.status = 'paused'; online.snapshot.status = 'paused'; online.resolve(); await Promise.resolve();
    frame(1017); assert.equal(runtime.paused, true);
  } finally { runtime.dispose(); }
});

test('graphics loss stops simulation and restoration does not fast-forward the match', () => {
  const { runtime } = start();
  try {
    runtime.startAI('Medium', 7); runtime.game.phase = 'playing'; frame(1000);
    const before = runtime.game.tick;
    const availability: boolean[] = []; runtime.onGraphicsChange = value => availability.push(value);
    const lost = event('webglcontextlost'); runtime.renderer.canvas.dispatchEvent(lost);
    assert.equal(lost.defaultPrevented, true); assert.equal(runtime.paused, true);
    frame(5000); assert.equal(runtime.game.tick, before);
    runtime.renderer.canvas.dispatchEvent(new Event('webglcontextrestored'));
    assert.deepEqual(availability, [false, true]); runtime.pause(false); frame(9000);
    assert.ok(runtime.game.tick > before && runtime.game.tick < before + 10);
  } finally { runtime.dispose(); }
});

test('the finished attract match resets into a new faceoff', () => {
  const { runtime } = start();
  try {
    runtime.game.phase = 'finished'; frame(1000); frame(4000);
    assert.equal(runtime.mode, 'demo'); assert.equal(runtime.game.phase, 'faceoff');
  } finally { runtime.dispose(); }
});

test('failed WebGL construction keeps gameplay available through the fallback', () => {
  mocks.ArenaRenderer.fail = true;
  const { runtime } = start();
  try {
    assert.equal(runtime.compatibility, true);
    runtime.startAI('Easy', 3); frame(1000);
    assert.ok(runtime.game.tick > 0);
  } finally { runtime.dispose(); mocks.ArenaRenderer.fail = false; }
});
