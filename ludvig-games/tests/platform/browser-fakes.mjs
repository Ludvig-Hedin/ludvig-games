/** Tiny browser stand-ins for running assets/*.js under Node with mocked timers. */
import { readFileSync } from 'node:fs';

export function makeStorage() {
  // A fresh class per test, because the scripts patch Storage.prototype.
  return class Storage {
    constructor() { this.map = new Map(); }
    getItem(key) { return this.map.has(String(key)) ? this.map.get(String(key)) : null; }
    setItem(key, value) { this.map.set(String(key), String(value)); }
    removeItem(key) { this.map.delete(String(key)); }
    clear() { this.map.clear(); }
    key(index) { return [...this.map.keys()][index] ?? null; }
    get length() { return this.map.size; }
  };
}

const NAMES = ['window', 'localStorage', 'Storage', 'location', 'document', 'navigator', 'fetch', 'crypto', 'WebSocket', 'RTCPeerConnection',
  'addEventListener', 'removeEventListener', 'dispatchEvent', 'CustomEvent', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'URLSearchParams'];

/** Just enough DOM for Ludvig.ui: elements, text, shadow roots, events, focus. */
export class FakeElement {
  constructor(tag, doc) { Object.assign(this, { tagName: tag.toUpperCase(), doc, children: [], attributes: {}, listeners: {}, parentNode: null, hidden: false, html: '' }); }
  setAttribute(name, value) { this.attributes[name] = String(value); if (name === 'hidden') this.hidden = true; }
  getAttribute(name) { return this.attributes[name] ?? null; }
  removeAttribute(name) { delete this.attributes[name]; if (name === 'hidden') this.hidden = false; }
  append(...nodes) { for (const node of nodes) { if (node instanceof FakeElement) { node.remove(); node.parentNode = this; } this.children.push(node); } }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(c => c !== this); this.parentNode = null; }
  set textContent(value) { this.children = [String(value)]; }
  get textContent() { return this.children.map(c => (c instanceof FakeElement ? c.textContent : c)).join(''); }
  set innerHTML(value) { this.html = value; }
  get innerHTML() { return this.html; }
  attachShadow() { this.shadowRoot = new FakeElement('#shadow', this.doc); this.shadowRoot.host = this; return this.shadowRoot; }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  dispatch(type, extra = {}) {
    const event = { type, target: this, stopped: false, defaultPrevented: false, stopPropagation() { this.stopped = true; }, preventDefault() { this.defaultPrevented = true; }, ...extra };
    for (let node = this; node && !event.stopped; node = node.parentNode || node.host) (node.listeners[type] || []).forEach(fn => fn(event));
    return event;
  }
  click() { return this.dispatch('click'); }
  focus() { this.doc.activeElement = this; }
  get isConnected() { let node = this; while (node.parentNode || node.host) node = node.parentNode || node.host; return node === this.doc.body; }
  /** All descendant elements, crossing into shadow roots. */
  all() {
    const out = [];
    const walk = node => { for (const c of node.children) if (c instanceof FakeElement) { out.push(c); walk(c); if (c.shadowRoot) walk(c.shadowRoot); } };
    walk(this);
    if (this.shadowRoot) walk(this.shadowRoot);
    return out;
  }
  find(test) { return this.all().find(test); }
  findAll(test) { return this.all().filter(test); }
}

export function fakeDocument() {
  const doc = { readyState: 'complete', activeElement: null, listeners: {}, addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); } };
  doc.createElement = tag => new FakeElement(tag, doc);
  doc.body = new FakeElement('body', doc);
  return doc;
}

export function browser({ path = '/games/test/', fetch, WebSocket, RTCPeerConnection, parent, dom = false, game, api } = {}) {
  const Storage = makeStorage();
  const localStorage = new Storage();
  const listeners = {};
  const docListeners = {};
  const events = [];
  const window = {
    localStorage, Storage, posted: [], events,
    location: { pathname: path, origin: 'https://games.ludvighedin.com', host: 'games.ludvighedin.com', protocol: 'https:' },
    document: dom ? Object.assign(fakeDocument(), { visibilityState: 'visible' }) : { visibilityState: 'visible', addEventListener: (type, fn) => { (docListeners[type] ||= []).push(fn); } },
    navigator: { onLine: true },
    fetch, WebSocket, RTCPeerConnection,
    crypto: globalThis.crypto,
    addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn); },
    removeEventListener: (type, fn) => { listeners[type] = (listeners[type] || []).filter(f => f !== fn); },
    dispatchEvent: event => { events.push(event); (listeners[event.type] || []).forEach(fn => fn(event)); },
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
    setTimeout: (...a) => setTimeout(...a), clearTimeout: id => clearTimeout(id),
    setInterval: (...a) => setInterval(...a), clearInterval: id => clearInterval(id),
    Date: { now: () => Date.now() },
    URLSearchParams,
    fire: type => (listeners[type] || []).forEach(fn => fn({ type })),
    fireDocument: type => (docListeners[type] || []).forEach(fn => fn({ type })),
  };
  if (game) window.__LUDVIG_GAME = game;
  if (api !== undefined) window.__LUDVIG_API = api; // what build.py prepends to ludvig.js for LUDVIG_API_BASE
  window.window = window;
  window.parent = parent === undefined ? { postMessage: (data, origin) => window.posted.push({ data, origin }) } : parent;
  window.run = file => {
    const code = readFileSync(new URL(`../../assets/${file}`, import.meta.url), 'utf8');
    new Function(...NAMES, code)(...NAMES.map(name => window[name]));
  };
  return window;
}

export const flush = () => new Promise(resolve => setImmediate(resolve));

/** Fake WebRTC. Two connections pair up once each has the other's description (sdp carries a token);
    their negotiated channels then open and pass messages. FakeRTC.blocked makes every connection fail to connect. */
export class FakeChannel {
  constructor(pc, label, options) { Object.assign(this, { pc, label, options, readyState: 'connecting', sent: [] }); }
  send(text) {
    if (this.readyState !== 'open') throw new Error('not open');
    this.sent.push(text);
    FakeRTC.log.push({ label: this.label, text });
    const other = this.pc.peer?.channels[this.label];
    if (other && other.readyState === 'open') setImmediate(() => other.onmessage?.({ data: text }));
  }
  close() { if (this.readyState === 'closed') return; this.readyState = 'closed'; this.onclose?.(); }
}

export class FakeRTC {
  static all = [];
  static log = [];
  static blocked = false;
  static reset() { FakeRTC.all = []; FakeRTC.log = []; FakeRTC.blocked = false; }
  constructor(config) {
    Object.assign(this, { config, channels: {}, localDescription: null, remoteDescription: null, signalingState: 'stable', connectionState: 'new', added: [], peer: null });
    this.token = `t${FakeRTC.all.length}`;
    FakeRTC.all.push(this);
  }
  createDataChannel(label, options) { const channel = new FakeChannel(this, label, options); this.channels[label] = channel; return channel; }
  async createOffer() { return { type: 'offer', sdp: `sdp:${this.token}` }; }
  async createAnswer() { return { type: 'answer', sdp: `sdp:${this.token}` }; }
  async setLocalDescription(description) {
    this.localDescription = description;
    this.signalingState = description.type === 'offer' ? 'have-local-offer' : 'stable';
    const token = this.token;
    setImmediate(() => {
      this.onicecandidate?.({ candidate: { candidate: `host:${token}`, toJSON: () => ({ candidate: `host:${token}`, sdpMid: '0' }) } });
      this.onicecandidate?.({ candidate: null });
    });
    this.connect();
  }
  async setRemoteDescription(description) {
    this.remoteDescription = description;
    this.peer = FakeRTC.all.find(pc => `sdp:${pc.token}` === description.sdp) || null;
    this.signalingState = description.type === 'offer' ? 'have-remote-offer' : 'stable';
    this.connect();
  }
  async addIceCandidate(candidate) { this.added.push(candidate); }
  connect() {
    const other = this.peer;
    if (FakeRTC.blocked || !other || other.peer !== this || !this.remoteDescription || !other.remoteDescription || !this.localDescription || !other.localDescription) return;
    for (const pc of [this, other]) {
      if (pc.connectionState === 'connected') continue;
      pc.connectionState = 'connected';
      for (const channel of Object.values(pc.channels)) setImmediate(() => { channel.readyState = 'open'; channel.onopen?.(); });
    }
  }
  close() {
    this.connectionState = 'closed';
    for (const channel of Object.values(this.channels)) channel.close();
    const other = this.peer;
    if (other && other.connectionState !== 'closed') for (const channel of Object.values(other.channels)) setImmediate(() => channel.close());
  }
}
