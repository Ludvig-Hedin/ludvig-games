// Headless harness: runs No Brakes' inline scripts in a vm with a stub DOM so the
// physics, courses and meta layer can be exercised from node (no browser).
import fs from 'node:fs';
import vm from 'node:vm';

export function scripts(html) {
  const out = [];
  const re = /<script(\b[^>]*)>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html))) if (!/\bsrc=/.test(m[1])) out.push({ attrs: m[1], code: m[2] });
  return out;
}

export function fakeStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    map,
    getItem: k => (map.has(String(k)) ? map.get(String(k)) : null),
    setItem: (k, v) => { map.set(String(k), String(v)); },
    removeItem: k => { map.delete(String(k)); },
    clear: () => map.clear(),
    key: i => [...map.keys()][i] ?? null,
    get length() { return map.size; },
  };
}

function ctx2d() {
  const grad = { addColorStop() {} };
  return new Proxy({}, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => grad;
      if (k === 'createPattern') return () => ({});
      if (k === 'createImageData') return (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
      if (k === 'measureText') return () => ({ width: 10 });
      return () => {};
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}

class ClassList {
  constructor() { this.s = new Set(); }
  add(...c) { c.forEach(x => this.s.add(x)); }
  remove(...c) { c.forEach(x => this.s.delete(x)); }
  toggle(c, f) { const on = f === undefined ? !this.s.has(c) : !!f; on ? this.s.add(c) : this.s.delete(c); return on; }
  contains(c) { return this.s.has(c); }
}

export class El {
  constructor(tag = 'div', id = '') {
    this.tagName = tag.toUpperCase(); this.id = id; this.style = {}; this.classList = new ClassList();
    this.dataset = {}; this.children = []; this.listeners = {}; this._html = ''; this.textContent = '';
    this.value = ''; this.checked = false; this.hidden = false; this.attrs = {};
    this.width = 300; this.height = 150;
  }
  set innerHTML(v) { this._html = String(v); this.children = []; }
  get innerHTML() { return this._html; }
  get firstElementChild() { return this._first || (this._first = new El()); }
  get lastElementChild() { return this._last || (this._last = new El()); }
  set className(v) { this.classList = new ClassList(); String(v).split(/\s+/).filter(Boolean).forEach(c => this.classList.add(c)); }
  get className() { return [...this.classList.s].join(' '); }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return this.attrs[k] ?? null; }
  removeAttribute(k) { delete this.attrs[k]; }
  addEventListener(t, f) { (this.listeners[t] ||= []).push(f); }
  removeEventListener() {}
  appendChild(c) { this.children.push(c); return c; }
  append(...c) { c.forEach(x => this.children.push(x)); }
  remove() {}
  replaceChildren(...c) { this.children = c; this._html = ''; }
  insertAdjacentHTML() {}
  querySelector() { return new El(); }
  querySelectorAll() { return []; }
  closest() { return null; }
  contains() { return false; }
  focus() {} blur() {} click() { this.onclick?.({}); }
  setPointerCapture() {}
  getContext() { return ctx2d(); }
  getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 100 }; }
}

export function makeContext({ storage = fakeStorage(), withDom = true, extra = {} } = {}) {
  const els = new Map();
  const listeners = {};
  const document = {
    getElementById: id => { if (!els.has(id)) els.set(id, new El(id === 'game' ? 'canvas' : 'div', id)); return els.get(id); },
    querySelectorAll: () => [],
    querySelector: () => new El(),
    createElement: t => new El(t),
    addEventListener: () => {},
    removeEventListener: () => {},
    body: new El('body'),
    documentElement: new El('html'),
    hidden: false,
    activeElement: null,
  };
  const win = {
    innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1,
    localStorage: storage,
    addEventListener: (t, f) => { (listeners[t] ||= []).push(f); },
    removeEventListener: () => {},
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    requestAnimationFrame: f => { win.__raf = f; return 1; },
    cancelAnimationFrame: () => {},
    performance: { now: () => 0 },
    setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
    structuredClone, console, Math, JSON, Date, Number, String, Array, Object, Set, Map, Error,
    Int16Array, Int32Array, Uint8Array, Float32Array, Float64Array, Uint8ClampedArray, Promise, Proxy,
    btoa: s => Buffer.from(s, 'binary').toString('base64'),
    atob: s => Buffer.from(s, 'base64').toString('binary'),
    URL: { createObjectURL: () => '', revokeObjectURL: () => {} }, Blob: class {},
    ...extra,
  };
  if (withDom) win.document = document;
  win.window = win; win.self = win; win.globalThis = win;
  win.__listeners = listeners; win.__els = els;
  return vm.createContext(win);
}

export function loadGame(file, opts = {}) {
  const html = fs.readFileSync(file, 'utf8');
  const context = makeContext(opts);
  for (const s of scripts(html)) vm.runInContext(s.code, context, { filename: 'inline.js' });
  return context;
}
