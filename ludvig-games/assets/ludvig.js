/* Ludvig Games platform client: shared player identity, leaderboards and multiplayer rooms.
   Contract: docs/platform-api.md. No dependencies. Score and list calls never throw or reject,
   even offline; mp.join/create reject with an Error whose .code says why (e.g. 'full').
   Ludvig.ui adds the in-game leaderboard (board, open, toast, floating trophy button).
   The API (/api/* and /mp/ws) lives at window.__LUDVIG_API, which build.py sets from LUDVIG_API_BASE;
   empty means same origin. When the API is out (daily limit, busy, unreachable) leaderboards hide quietly. */
(() => {
  'use strict';
  if (window.Ludvig) return;
  const PLAYER_KEY = 'ludvig:player';
  const ID_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const ADJECTIVES = ['Brave', 'Swift', 'Lucky', 'Sneaky', 'Mighty', 'Sunny', 'Fuzzy', 'Jolly', 'Clever', 'Cosmic', 'Rapid', 'Quiet', 'Wild', 'Bold', 'Happy', 'Zesty'];
  const ANIMALS = ['Pigeon', 'Otter', 'Badger', 'Falcon', 'Panda', 'Moose', 'Gecko', 'Walrus', 'Lynx', 'Puffin', 'Llama', 'Beaver', 'Koala', 'Ferret', 'Bison', 'Raven'];

  // Captured before game-storage.js scopes window.localStorage, so identity is shared by every game.
  let store = null;
  try { store = window.localStorage; store.getItem(PLAYER_KEY); } catch { store = null; }
  const memory = {};
  const read = key => { try { return store ? store.getItem(key) : memory[key] ?? null; } catch { return memory[key] ?? null; } };
  const write = (key, value) => { memory[key] = value; try { if (store) store.setItem(key, value); } catch { /* Storage full or blocked. */ } };

  // A game calling localStorage.clear() must not wipe the shared player.
  try {
    const clear = Storage.prototype.clear;
    Storage.prototype.clear = function () {
      const saved = this === store ? read(PLAYER_KEY) : null;
      const result = clear.apply(this, arguments);
      if (saved) try { Storage.prototype.setItem.call(this, PLAYER_KEY, saved); } catch { /* Ignore. */ }
      return result;
    };
  } catch { /* Leave Storage untouched. */ }

  const randomInt = n => {
    try { return crypto.getRandomValues(new Uint32Array(1))[0] % n; } catch { return Math.floor(Math.random() * n); }
  };
  const newId = () => Array.from({ length: 22 }, () => ID_CHARS[randomInt(64)]).join('');
  const funName = () => `${ADJECTIVES[randomInt(ADJECTIVES.length)]} ${ANIMALS[randomInt(ANIMALS.length)]} ${10 + randomInt(90)}`;

  function cleanName(value) {
    if (typeof value !== 'string') return null;
    const name = value.normalize('NFKC').replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, '')
      .replace(/[<>&"'`\\]/g, '').replace(/\s+/g, ' ').trim();
    const length = Array.from(name).length;
    return length >= 2 && length <= 16 ? name : null;
  }

  function load() {
    let player = null;
    try { player = JSON.parse(read(PLAYER_KEY)); } catch { /* Corrupt value, replaced below. */ }
    if (!player || typeof player.id !== 'string' || !/^[A-Za-z0-9_-]{16,40}$/.test(player.id)) {
      player = { id: newId(), name: funName() };
      write(PLAYER_KEY, JSON.stringify(player));
    } else if (!cleanName(player.name)) {
      player = { id: player.id, name: funName() };
      write(PLAYER_KEY, JSON.stringify(player));
    }
    return { id: player.id, name: player.name };
  }

  // One API base for every call and the room socket: an https origin (or a local http one), else same origin.
  const API = (() => {
    const base = typeof window.__LUDVIG_API === 'string' ? window.__LUDVIG_API.trim().replace(/\/+$/, '') : '';
    return /^(?:https:\/\/[a-z0-9.-]+|http:\/\/(?:127\.0\.0\.1|localhost))(?::\d{1,5})?$/i.test(base) ? base : '';
  })();

  // API health. A 429 or 5xx, a Cloudflare daily-limit page (unreadable cross-origin, so status 0) or no network
  // marks the API out; the leaderboard UI then hides until a later call succeeds. A refused score (too many runs
  // in a minute) is not an outage.
  const OUT = new Set([0, 429, 502, 503, 504]);
  let apiOut = false;
  const apiWatchers = new Set();
  function noteApi(status, data, method) {
    const out = OUT.has(status) && !(method === 'POST' && status === 429 && data && data.error === 'rate-limited');
    const next = out || Boolean(data && data.error === 'daily-limit');
    if (next === apiOut) return;
    apiOut = next;
    for (const watch of [...apiWatchers]) try { watch(apiOut); } catch { /* UI is optional. */ }
  }

  async function request(url, options, api) {
    let result = { status: 0, data: null };
    try {
      const response = await fetch(url, { credentials: api && API ? 'omit' : 'same-origin', ...options });
      let data = null;
      try { data = await response.json(); } catch { /* Not JSON. */ }
      result = { status: response.status, data };
    } catch { /* Offline, blocked or refused: status 0. */ }
    if (api) noteApi(result.status, result.data, options.method);
    return result;
  }
  // JSON sent as text/plain: a CORS "simple" request, so a cross-origin post needs no preflight (half the requests,
  // and keepalive posts on page hide work everywhere). The API checks the Origin itself.
  const post = (path, body) => request(API + path, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body: JSON.stringify(body), keepalive: true }, true);
  const get = path => request(API + path, { cache: 'no-store' }, true);
  const getStatic = path => request(path, { cache: 'no-store' }, false);

  // One retry for network errors and server outages; waits for the connection to return when offline.
  const retryDelay = () => new Promise(resolve => {
    if (navigator.onLine === false) {
      const done = () => { removeEventListener('online', done); clearTimeout(timer); setTimeout(resolve, 500); };
      const timer = setTimeout(done, 60e3);
      addEventListener('online', done);
    } else {
      setTimeout(resolve, 5e3);
    }
  });

  function notify(board) {
    try { dispatchEvent(new CustomEvent('ludvig:score', { detail: { board } })); } catch { /* Old browser. */ }
    try { if (window.parent && window.parent !== window) window.parent.postMessage({ type: 'ludvig-score', board }, location.origin); } catch { /* Cross-origin parent. */ }
  }

  async function score(board, value, options = {}) {
    const number = typeof value === 'string' ? Number(value) : value;
    if (typeof board !== 'string' || typeof number !== 'number' || !Number.isFinite(number)) return { ok: false, error: 'bad-score' };
    const send = () => { const player = load(); return post('/api/scores', { game: board, player: player.id, name: player.name, score: number }); };
    let result = await send();
    if (result.status === 0 || result.status >= 500) { await retryDelay(); result = await send(); }
    if (result.data && result.data.ok) {
      notify(board);
      try { maybeToast(board, number, result.data, options || {}); } catch { /* UI is optional. */ }
      return result.data;
    }
    return { ok: false, error: (result.data && result.data.error) || 'offline' };
  }

  async function top(board, period = 'all', options = {}) {
    const query = new URLSearchParams({ game: String(board), period, player: load().id, limit: String(options.limit || 10) });
    const { data } = await get(`/api/scores?${query}`);
    return data && Array.isArray(data.entries) ? data : { entries: [], you: null, error: (data && data.error) || 'offline' };
  }

  async function records() {
    const { data } = await get(`/api/me?player=${encodeURIComponent(load().id)}`);
    return data && Array.isArray(data.records) ? data : { records: [], player: null, error: (data && data.error) || 'offline' };
  }

  let boardsPromise = null;
  function boards() {
    boardsPromise ||= getStatic('/assets/boards.json').then(({ data }) => {
      if (!data || typeof data !== 'object') { boardsPromise = null; return {}; }
      return data;
    });
    return boardsPromise;
  }

  /** Saves locally at once (works offline) and renames existing leaderboard rows. Resolves { ok, name, error }. */
  async function setName(value) {
    const name = cleanName(value);
    if (!name) return { ok: false, error: 'bad-name' };
    const player = load();
    const { status, data } = await post('/api/name', { player: player.id, name });
    if (data && data.error === 'bad-name') return { ok: false, error: 'bad-name' };
    write(PLAYER_KEY, JSON.stringify({ id: player.id, name }));
    try { dispatchEvent(new CustomEvent('ludvig:name', { detail: { name } })); } catch { /* Old browser. */ }
    return { ok: true, name, synced: status === 200 };
  }

  const pad = (n, width) => String(n).padStart(width, '0');
  function clock(seconds, decimals) {
    const sign = seconds < 0 ? '-' : '';
    const factor = 10 ** decimals;
    let total = Math.round(Math.abs(seconds) * factor) / factor;
    if (total < 60) return `${sign}${total.toFixed(decimals)} s`;
    const hours = Math.floor(total / 3600);
    total -= hours * 3600;
    const minutes = Math.floor(total / 60);
    const rest = (total - minutes * 60).toFixed(decimals).padStart(decimals ? decimals + 3 : 2, '0');
    return hours ? `${sign}${hours}:${pad(minutes, 2)}:${rest}` : `${sign}${minutes}:${rest}`;
  }
  function formatValue(value, kind = 'int') {
    const n = Number(value);
    if (!Number.isFinite(n)) return '–';
    if (kind === 'float1') return n.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    if (kind === 'time-ms') return clock(n / 1000, 2);
    if (kind === 'time-s') return clock(n, Number.isInteger(n) ? 0 : 2);
    if (kind === 'money') return `$${Math.round(n).toLocaleString('en-US')}`;
    return Math.round(n).toLocaleString('en-US');
  }

  /* Multiplayer (docs/platform-api.md, docs/p2p-online.md). The room server pairs players and keeps membership, host
     and meta. Gameplay goes device to device: every pair of peers shares one RTCPeerConnection with two data channels,
     'u' (unordered, no retransmits) for frequent state and 'r' (ordered, reliable) for everything else. The server
     only relays the WebRTC offers, answers and ICE candidates ('sig'), so a running match costs it nothing. */
  const socketOrigin = () => (API ? API.replace(/^http/i, 'ws') : `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}`);
  const socketUrl = params => `${socketOrigin()}/mp/ws?${new URLSearchParams(params)}`;
  const failure = code => Object.assign(new Error(`Room unavailable: ${code}`), { code });
  const CLOSE_REASONS = { 4000: 'replaced', 4400: 'bad-request', 4404: 'not-found', 4409: 'full', 4429: 'rate-limited', 4503: 'unavailable' };
  const PING = '{"t":"ping"}'; // Exact text: the server answers it without waking the room (auto-response).
  const MP = {
    pingMs: 50e3, // keep-alive for the signaling socket; never more often than every 30 s
    connectMs: 10e3, // a peer whose channels are not open by then counts as gone ("Couldn't connect on this network.")
    lostMs: 5e3, // a channel that closes with no server 'leave' within this time counts as a leave
    maxData: 16384, // bytes per message; larger ones are refused with an 'error' event ('too-big')
    queue: 64, // messages kept per peer until its channels open
    iceBatchMs: 120, // ICE candidates are sent in small batches to keep signaling to a few messages per peer
    unreliableMax: 1000, // only small state messages go over 'u' (larger ones fragment and drop more often)
    quietMs: 300, // when a frequent stream pauses, its last 'u' message is repeated once over 'r'
    hiddenMs: 5 * 60e3, // a tab hidden this long leaves the room (no idle socket) and rejoins when shown again
  };
  // Public STUN only (owner rule: online play must cost nothing). No TURN relay, so a few strict networks
  // cannot connect; they get "Couldn't connect on this network." instead of a paid fallback.
  const STUN = [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] }];
  const HAS_RTC = typeof RTCPeerConnection === 'function';

  /* Channel choice. Messages that must arrive (events, hits, chunks, direct messages) need 'r'; only a stream of
     look-alike state updates is safe to lose a packet of. A broadcast goes over 'u' only when its kind (the t/k/type
     field) is sent at least 4 times a second, it is small, and it has the same flat shape as the last few of its kind:
     the same keys, only numbers/strings/booleans or fixed-length vectors, and no event lists. Any change in shape (an
     extra 'hit' flag, a non-empty event list) goes reliable. Games can force it: send(data, { reliable: true|false }). */
  const KIND_FIELDS = ['t', 'k', 'type', 'kind'];
  const EVENT_KEYS = new Set(['e', 'ev', 'evs', 'events', 'h', 'bh', 'hits', 'r', 'fx', 'el', 'ex', 'eaten', 'q']);
  const kindOf = data => {
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      for (const field of KIND_FIELDS) if (typeof data[field] === 'string' || typeof data[field] === 'number') return `${field}:${data[field]}`;
      return 'obj';
    }
    return Array.isArray(data) ? 'arr' : typeof data;
  };
  /** Shape signature, or null when the message is not plain state (nested objects, lists of lists, event lists). */
  function shapeOf(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
    let shape = '';
    for (const key of Object.keys(data)) {
      const value = data[key];
      if (value === null || ['number', 'string', 'boolean'].includes(typeof value)) { shape += `${key}:${typeof value},`; continue; }
      if (!Array.isArray(value) || EVENT_KEYS.has(key) || value.length > 32) return null;
      if (!value.every(item => item === null || ['number', 'string', 'boolean'].includes(typeof item))) return null;
      shape += `${key}[${value.length}],`;
    }
    return shape;
  }

  class Streams {
    constructor() { this.kinds = new Map(); }
    /** True when this broadcast should go over 'u'. */
    unreliable(data, size, now) {
      const kind = kindOf(data);
      let stream = this.kinds.get(kind);
      if (!stream) { stream = { times: [], shapes: [] }; this.kinds.set(kind, stream); if (this.kinds.size > 64) this.kinds.delete(this.kinds.keys().next().value); }
      stream.times.push(now);
      if (stream.times.length > 4) stream.times.shift();
      const shape = shapeOf(data);
      stream.shapes.push(shape);
      if (stream.shapes.length > 4) stream.shapes.shift();
      if (size > MP.unreliableMax || shape === null || stream.times.length < 4) return false;
      if (now - stream.times[0] > 1000) return false; // fewer than 4 per second
      return stream.shapes.every(s => s === shape);
    }
  }

  function open(params) {
    return new Promise((resolve, reject) => {
      let socket;
      try { socket = new WebSocket(socketUrl(params)); } catch { reject(failure('offline')); return; }
      let settled = false, error = null;
      const timer = setTimeout(() => { if (!settled) { settled = true; reject(failure('timeout')); try { socket.close(); } catch { /* Ignore. */ } } }, 10e3);
      socket.onmessage = event => {
        let message;
        try { message = JSON.parse(event.data); } catch { return; }
        if (message.t === 'error') { error = message.code; return; }
        if (message.t === 'welcome' && !settled) { settled = true; clearTimeout(timer); resolve({ socket, welcome: message }); }
      };
      socket.onclose = event => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(failure(error || CLOSE_REASONS[event.code] || (navigator.onLine === false ? 'offline' : 'network')));
      };
    });
  }

  const randomTag = () => Array.from({ length: 8 }, () => ID_CHARS[randomInt(64)]).join('');

  /** One direct connection to one other peer. The peer with the lower id makes the offer. */
  class Link {
    constructor(room, peerId, remoteTag = null) {
      this.room = room;
      this.id = peerId;
      this.remoteTag = remoteTag; // the other instance's tag, so a reloaded page gets a fresh connection
      this.queue = [];
      this.pendingIce = [];
      this.outIce = [];
      this.iceTimer = null;
      this.opened = false; // both channels were open at least once
      this.dead = false;
      this.lostTimer = null;
      this.offerer = room.self.id < peerId;
      const pc = this.pc = new RTCPeerConnection({ iceServers: STUN });
      // Negotiated channels: both sides create them with fixed ids, so no ondatachannel handshake is needed.
      this.u = pc.createDataChannel('u', { negotiated: true, id: 0, ordered: false, maxRetransmits: 0 });
      this.r = pc.createDataChannel('r', { negotiated: true, id: 1, ordered: true });
      for (const channel of [this.u, this.r]) {
        channel.onopen = () => this.ready();
        channel.onclose = () => this.closedChannel();
        channel.onmessage = event => this.receive(event.data);
      }
      pc.onicecandidate = event => {
        if (event.candidate) this.outIce.push(event.candidate.toJSON ? event.candidate.toJSON() : event.candidate);
        if (!this.iceTimer) this.iceTimer = setTimeout(() => this.flushIce(), event.candidate ? MP.iceBatchMs : 0);
      };
      pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed') this.closedChannel(); };
      this.connectTimer = setTimeout(() => { if (!this.opened && !this.dead) room.unreachable(this); }, MP.connectMs);
    }

    get isOpen() { return !this.dead && this.r.readyState === 'open'; }

    signal(data) { this.room.raw({ t: 'sig', to: this.id, data: { ...data, tag: this.room.tag } }); }

    flushIce() {
      this.iceTimer = null;
      if (this.dead || !this.outIce.length) return;
      this.signal({ d: 'ice', c: this.outIce.splice(0) });
    }

    async offer() {
      try {
        await this.pc.setLocalDescription(await this.pc.createOffer());
        this.signal({ d: 'offer', sdp: this.pc.localDescription.sdp });
      } catch { /* The connect timer reports the failure. */ }
    }

    async handle(data) {
      if (this.dead) return;
      try {
        if (data.d === 'offer') {
          await this.pc.setRemoteDescription({ type: 'offer', sdp: String(data.sdp) });
          await this.flushRemoteIce();
          await this.pc.setLocalDescription(await this.pc.createAnswer());
          this.signal({ d: 'answer', sdp: this.pc.localDescription.sdp });
        } else if (data.d === 'answer') {
          if (this.pc.signalingState !== 'have-local-offer') return;
          await this.pc.setRemoteDescription({ type: 'answer', sdp: String(data.sdp) });
          await this.flushRemoteIce();
        } else if (data.d === 'ice' && Array.isArray(data.c)) {
          if (!this.pc.remoteDescription) { this.pendingIce.push(...data.c.slice(0, 32)); return; }
          for (const candidate of data.c.slice(0, 32)) await this.pc.addIceCandidate(candidate).catch(() => {});
        }
      } catch { /* Bad or stale description; the connect timer reports the failure. */ }
    }

    async flushRemoteIce() {
      for (const candidate of this.pendingIce.splice(0)) await this.pc.addIceCandidate(candidate).catch(() => {});
    }

    ready() {
      if (this.dead || this.u.readyState !== 'open' || this.r.readyState !== 'open') return;
      this.opened = true;
      clearTimeout(this.connectTimer);
      clearTimeout(this.lostTimer);
      this.lostTimer = null;
      for (const frame of this.queue.splice(0)) this.write(frame, false);
    }

    /** text is the encoded frame; unreliable picks 'u'. Queued until the channels open. */
    write(text, unreliable) {
      if (this.dead) return false;
      if (!this.opened || this.r.readyState !== 'open') {
        if (this.queue.length < MP.queue) this.queue.push(text);
        return false;
      }
      const channel = unreliable && this.u.readyState === 'open' ? this.u : this.r;
      try { channel.send(text); return true; } catch { return false; }
    }

    receive(text) {
      if (this.dead || typeof text !== 'string') return;
      let frame;
      try { frame = JSON.parse(text); } catch { return; }
      if (frame && typeof frame === 'object' && 'm' in frame) this.room.emit('message', this.id, frame.m, frame.d === 1);
    }

    closedChannel() {
      if (this.dead || !this.opened || this.lostTimer) return;
      // A closed channel with no 'leave' from the server soon after counts as a leave.
      this.lostTimer = setTimeout(() => { if (!this.dead) this.room.vanished(this); }, MP.lostMs);
    }

    close() {
      if (this.dead) return;
      this.dead = true;
      clearTimeout(this.connectTimer);
      clearTimeout(this.lostTimer);
      clearTimeout(this.iceTimer);
      try { this.u.close(); } catch { /* Ignore. */ }
      try { this.r.close(); } catch { /* Ignore. */ }
      try { this.pc.close(); } catch { /* Ignore. */ }
    }
  }

  class Room {
    constructor(params, socket, welcome) {
      this.params = params;
      this.handlers = {};
      this.buffer = [];
      this.closed = false;
      this.reconnecting = false;
      this.tag = randomTag(); // this page's instance, so peers can tell a reload from a duplicate message
      this.links = new Map();
      this.gone = new Set(); // peers we gave up on (no direct connection); hidden until the server says otherwise
      this.streams = new Streams();
      this.quiet = new Map();
      this.sentMeta = null;
      this.metaPending = false;
      this.parked = false; // left the server room while the tab was hidden; rejoins when it is shown
      this.hiddenTimer = null;
      this.apply(welcome);
      this.attach(socket);
      this.connectAll();
      this.startPing();
      this.onVisibility = () => this.visibility();
      try { document.addEventListener('visibilitychange', this.onVisibility); } catch { /* No document events. */ }
      this.visibility();
    }

    startPing() {
      clearInterval(this.ping);
      this.ping = setInterval(() => this.raw({ t: 'ping' }), MP.pingMs);
    }

    /** A tab hidden for MP.hiddenMs leaves the room, so no socket idles on the server; showing it rejoins. */
    visibility() {
      if (this.closed) return;
      if (document.visibilityState === 'hidden') {
        if (!this.hiddenTimer && !this.parked) this.hiddenTimer = setTimeout(() => { this.hiddenTimer = null; this.park(); }, MP.hiddenMs);
        return;
      }
      clearTimeout(this.hiddenTimer);
      this.hiddenTimer = null;
      if (this.parked) { this.parked = false; this.rejoin(); }
    }

    park() {
      if (this.closed || this.parked || this.reconnecting || document.visibilityState !== 'hidden') return;
      this.parked = true;
      clearInterval(this.ping);
      this.ping = null;
      for (const id of [...this.links.keys()]) this.dropLink(id);
      const socket = this.socket;
      socket.onclose = null;
      try { if (socket.readyState === 1) socket.send(JSON.stringify({ t: 'bye' })); } catch { /* Ignore. */ }
      try { socket.close(1000); } catch { /* Ignore. */ }
    }

    apply(welcome) {
      this.code = welcome.code;
      this.self = welcome.self;
      this.serverHost = welcome.host;
      this.peers = welcome.peers.filter(p => !this.gone.has(p.id));
      this.host = this.pickHost();
      this.seed = welcome.seed;
      this.meta = welcome.meta || {};
      this.max = welcome.max;
      this.public = welcome.public;
    }

    /** The server's host, unless we could not reach them; then the oldest peer we can reach. */
    pickHost() {
      if (this.peers.some(p => p.id === this.serverHost)) return this.serverHost;
      const oldest = [...this.peers].sort((a, b) => a.joinedAt - b.joinedAt)[0];
      return oldest ? oldest.id : this.serverHost;
    }

    setHost() {
      const before = this.host;
      this.host = this.pickHost();
      if (this.host !== before) this.emit('host', this.host);
    }

    /** Connect to every peer we have no live link to. The higher id asks the lower to offer ('hi'). */
    connectAll() {
      for (const peer of this.peers) if (peer.id !== this.self.id) this.link(peer.id);
    }

    link(peerId, remoteTag = null) {
      if (!HAS_RTC || this.closed || this.parked) return null;
      const existing = this.links.get(peerId);
      if (existing && !existing.dead) return existing;
      const link = new Link(this, peerId, remoteTag);
      this.links.set(peerId, link);
      if (link.offerer) link.offer(); else link.signal({ d: 'hi' });
      return link;
    }

    dropLink(peerId) {
      const link = this.links.get(peerId);
      if (link) { link.close(); this.links.delete(peerId); }
    }

    signaled(from, data) {
      if (!data || typeof data !== 'object' || from === this.self.id || this.gone.has(from)) return;
      if (!this.peers.some(p => p.id === from)) return;
      let link = this.links.get(from);
      const fresh = link && data.tag && link.remoteTag && link.remoteTag !== data.tag; // the other page reloaded
      if (data.d === 'hi') {
        // A new or reloaded peer asks for an offer; only the lower id offers.
        if (this.self.id > from) return;
        if (link && !link.dead && link.remoteTag === data.tag) return; // Already connecting to that page.
        if (link && !link.dead && !link.remoteTag && !link.opened) { link.remoteTag = data.tag; return; } // Our offer is on its way.
        this.dropLink(from);
        this.link(from, data.tag);
        return;
      }
      if (data.d === 'offer' && link && (fresh || link.opened || link.pc.signalingState !== 'stable')) { this.dropLink(from); link = null; }
      if (!link || link.dead) {
        if (data.d !== 'offer') return;
        link = new Link(this, from, data.tag);
        this.links.set(from, link);
      }
      if (data.tag) link.remoteTag ||= data.tag;
      link.handle(data);
    }

    /** No direct connection within MP.connectMs: tell the game the peer is gone and say why. */
    unreachable(link) {
      if (this.links.get(link.id) !== link) return;
      this.emit('error', 'connect-failed');
      try { showToast("Couldn't connect on this network.", ''); } catch { /* UI is optional. */ }
      this.vanished(link);
    }

    vanished(link) {
      if (this.links.get(link.id) !== link) return;
      this.dropLink(link.id);
      const peer = this.peers.find(p => p.id === link.id);
      if (!peer) return;
      this.gone.add(peer.id);
      this.peers = this.peers.filter(p => p.id !== peer.id);
      this.emit('leave', peer);
      this.setHost();
    }

    attach(socket) {
      this.socket = socket;
      socket.onmessage = event => {
        let message;
        try { message = JSON.parse(event.data); } catch { return; }
        this.receive(message);
      };
      socket.onclose = event => { if (this.socket === socket) this.lost(event.code); };
    }

    receive(message) {
      switch (message.t) {
        case 'sig': this.signaled(message.from, message.data); break;
        case 'join':
          // A peer we had given up on came back as a new member: try again.
          this.gone.delete(message.peer.id);
          this.dropLink(message.peer.id);
          if (!this.peers.some(p => p.id === message.peer.id)) this.peers = [...this.peers, message.peer];
          this.emit('join', message.peer);
          // The newcomer asks or offers (it knows everyone from its welcome); nothing to start here.
          break;
        case 'leave': {
          this.dropLink(message.peer.id);
          const known = this.peers.some(p => p.id === message.peer.id);
          this.gone.delete(message.peer.id);
          this.peers = this.peers.filter(p => p.id !== message.peer.id);
          if (known) this.emit('leave', message.peer);
          this.setHost();
          break;
        }
        case 'host': this.serverHost = message.id; this.setHost(); break;
        case 'meta': this.meta = message.meta; this.metaPending = false; this.emit('meta', message.meta); break;
        case 'error': if (message.code === 'meta-too-big') this.metaPending = false; this.emit('error', message.code); break;
        default: break;
      }
    }

    async lost(code) {
      if (this.closed) return;
      const reason = CLOSE_REASONS[code];
      // Reconnect once, unless the server ended the session on purpose. Open data channels keep working meanwhile.
      if (reason || this.reconnecting) { this.finish(reason || 'network'); return; }
      this.reconnecting = true;
      await new Promise(resolve => setTimeout(resolve, 600));
      if (this.closed) return;
      await this.rejoin();
    }

    /** Open a new socket to the same room and turn the difference into normal join/leave/host/meta events. */
    async rejoin() {
      this.reconnecting = true;
      try {
        const { socket, welcome } = await open({ ...this.params, room: this.code });
        if (this.closed) { try { socket.close(1000); } catch { /* Ignore. */ } return; }
        const before = this.peers, host = this.host, meta = JSON.stringify(this.meta);
        this.apply(welcome);
        this.attach(socket);
        this.reconnecting = false;
        for (const peer of before) if (!this.peers.some(p => p.id === peer.id)) { this.dropLink(peer.id); this.emit('leave', peer); }
        for (const peer of this.peers) if (!before.some(p => p.id === peer.id)) this.emit('join', peer);
        if (host !== this.host) this.emit('host', this.host);
        if (meta !== JSON.stringify(this.meta)) this.emit('meta', this.meta);
        const queued = this.buffer.splice(0);
        queued.forEach(message => this.raw(message));
        if (!this.ping) this.startPing();
        this.connectAll();
        this.visibility();
      } catch (error) {
        this.finish(error.code || 'network');
      }
    }

    finish(reason) {
      if (this.closed) return;
      this.closed = true;
      clearInterval(this.ping);
      clearTimeout(this.hiddenTimer);
      try { document.removeEventListener('visibilitychange', this.onVisibility); } catch { /* No document events. */ }
      for (const timer of this.quiet.values()) clearTimeout(timer);
      for (const id of [...this.links.keys()]) this.dropLink(id);
      try { this.socket.close(1000); } catch { /* Ignore. */ }
      this.emit('close', reason);
    }

    /** Signaling socket (server): sig, meta, ping, bye. */
    raw(message) {
      if (this.closed) return false;
      if (this.parked || this.reconnecting || this.socket.readyState !== 1) {
        if (message.t !== 'ping' && this.buffer.length < 32) this.buffer.push(message);
        return false;
      }
      try { this.socket.send(JSON.stringify(message)); return true; } catch { return false; }
    }

    /** Gameplay: straight to the other devices. */
    deliver(targets, data, direct, options) {
      if (this.closed) return false;
      let text;
      try { text = JSON.stringify(direct ? { m: data, d: 1 } : { m: data }); } catch { return false; }
      if (text === undefined) return false;
      const size = text.length > MP.maxData / 4 ? new TextEncoder().encode(text).length : text.length;
      if (size > MP.maxData) { this.emit('error', 'too-big'); return false; }
      const choice = options && typeof options === 'object' && typeof options.reliable === 'boolean' ? !options.reliable : null;
      const unreliable = choice ?? (!direct && this.streams.unreliable(data, size, Date.now()));
      let sent = false;
      for (const id of targets) {
        const link = this.links.get(id) || this.link(id);
        if (link && link.write(text, unreliable)) sent = true;
      }
      if (!direct) this.trail(data, text, unreliable, targets);
      return sent;
    }

    /** After a frequent stream pauses, repeat its last 'u' message once over 'r', so the final state arrives. */
    trail(data, text, unreliable, targets) {
      const kind = kindOf(data);
      clearTimeout(this.quiet.get(kind));
      if (!unreliable) { this.quiet.delete(kind); return; }
      this.quiet.set(kind, setTimeout(() => {
        this.quiet.delete(kind);
        for (const id of targets) this.links.get(id)?.write(text, false);
      }, MP.quietMs));
    }

    send(data, options) { return this.deliver(this.peers.filter(p => p.id !== this.self.id).map(p => p.id), data, false, options); }
    sendTo(peerId, data, options) {
      if (peerId === this.self.id || !this.peers.some(p => p.id === peerId)) return false;
      return this.deliver([peerId], data, true, options);
    }
    setMeta(meta) {
      // Skip a repeat of what we already sent and the room already has: it would only cost the server a message.
      let text = null;
      try { text = JSON.stringify(meta); } catch { /* Sent as is; the server answers with an error. */ }
      if (text !== null && text === this.sentMeta && (this.metaPending || text === JSON.stringify(this.meta))) return true;
      this.sentMeta = text;
      this.metaPending = true; // until the server's meta event comes back
      return this.raw({ t: 'meta', meta });
    }

    on(type, handler) {
      (this.handlers[type] ||= new Set()).add(handler);
      return () => this.off(type, handler);
    }
    off(type, handler) { this.handlers[type]?.delete(handler); }
    emit(type, ...args) {
      for (const handler of [...(this.handlers[type] || [])]) {
        try { handler(...args); } catch (error) { setTimeout(() => { throw error; }); }
      }
    }

    leave() {
      if (this.closed) return;
      try { if (this.socket.readyState === 1) this.socket.send(JSON.stringify({ t: 'bye' })); } catch { /* Ignore. */ }
      this.finish('left');
    }
  }

  async function connect(options, mode) {
    const player = load();
    const game = String(options && options.game || '');
    const params = { game, player: player.id, name: player.name, max: String(options.max || 8) };
    if (mode === 'join') {
      if (!options.room) throw failure('bad-request');
      params.room = String(options.room).trim().toUpperCase();
    } else if (mode === 'create') { params.create = '1'; if (options.visible) params.visible = '1'; }
    else params.quick = '1';
    const { socket, welcome } = await open(params);
    return new Room({ game, player: player.id, name: player.name, max: params.max }, socket, welcome);
  }

  const mp = {
    join: options => connect(options || {}, options && options.quick ? 'quick' : 'join'),
    create: options => connect(options || {}, 'create'),
    async list(options) {
      const { data } = await get(`/api/mp/list?game=${encodeURIComponent(String(options && options.game || ''))}`);
      return data && Array.isArray(data.rooms) ? data.rooms : [];
    },
  };

  /* In-game leaderboard UI (docs/platform-api.md, "In-game leaderboard UI").
     Everything renders in Shadow DOM so game CSS cannot reach it; board() inherits the host's font and color. */
  const svg = paths => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths}</svg>`;
  const ICONS = {
    trophy: svg('<path d="M8 4h8v5a4 4 0 0 1-8 0Z"/><path d="M16 5.5h2.5v1A3.5 3.5 0 0 1 15.4 10"/><path d="M8 5.5H5.5v1A3.5 3.5 0 0 0 8.6 10"/><path d="M12 13v3.5"/><path d="M8.5 20h7"/><path d="M9.5 16.5h5V20h-5Z"/>'),
    close: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
    left: svg('<path d="M15 6l-6 6 6 6"/>'),
    right: svg('<path d="M9 6l6 6-6 6"/>'),
  };
  const PERIOD_LABELS = { '7d': '7 days', '30d': '30 days', all: 'All time' };
  const SHORT_PERIODS = { '7d': 'Week', '30d': 'Month', all: 'All' };
  const game = () => (window.__LUDVIG_GAME && typeof window.__LUDVIG_GAME === 'object' ? window.__LUDVIG_GAME : {});
  const SANS = '-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, "Helvetica Neue", Arial, sans-serif';

  function h(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (value === false || value === null || value === undefined) continue;
      if (key === 'text') node.textContent = value;
      else if (key === 'html') node.innerHTML = value;
      else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, value === true ? '' : String(value));
    }
    for (const child of children) if (child !== null && child !== undefined && child !== false) node.append(child);
    return node;
  }

  function shadowHost(css, attrs = {}) {
    const host = h('div', { 'data-ludvig-ui': '', ...attrs });
    const root = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;
    root.append(h('style', { text: css }));
    return { host, root };
  }

  // Keep taps and keys inside our UI from reaching the game's own listeners.
  const shield = node => ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'click', 'wheel', 'keydown', 'keyup', 'keypress']
    .forEach(type => node.addEventListener(type, event => event.stopPropagation()));

  let metaPromise = null;
  async function meta(id) {
    metaPromise ||= boards();
    const all = await metaPromise;
    const entry = all && all[id];
    return entry || { label: 'Score', format: 'int' };
  }

  const LIST_CSS = `ol{list-style:none;margin:0;padding:0;font-variant-numeric:tabular-nums}
li{display:grid;grid-template-columns:2.2ch minmax(0,1fr) auto;gap:.75em;align-items:baseline;padding:.4em .5em;margin:0 -.5em;border-top:1px solid rgba(127,127,127,.22);border-top:1px solid color-mix(in srgb,currentColor 12%,transparent)}
li:first-child{border-top-color:transparent}
li.you{border-radius:.4em;background:rgba(127,127,127,.16);background:color-mix(in srgb,currentColor 10%,transparent)}
li.you+li{border-top-color:transparent}
.rank{opacity:.55}.name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.score{font-weight:600}
.note,.mine{opacity:.65;padding:.4em 0}.mine{opacity:.85;font-variant-numeric:tabular-nums}
.periods{display:flex;gap:.25em;margin:0 0 .4em}
.periods button{all:unset;cursor:pointer;font-size:.78em;padding:.35em .7em;border-radius:999px;opacity:.6}
.periods button[aria-pressed="true"]{opacity:1;background:rgba(127,127,127,.18);background:color-mix(in srgb,currentColor 12%,transparent)}
.periods button:focus-visible{outline:1px solid currentColor}`;

  function rows(list, data, format, limit) {
    const you = data.you;
    const shown = data.entries.slice(0, limit);
    list.replaceChildren(...shown.map(entry => h('li', { class: you && entry.player === you.player ? 'you' : null },
      h('span', { class: 'rank', text: String(entry.rank) }),
      h('span', { class: 'name', text: entry.name }),
      h('span', { class: 'score', text: formatValue(entry.score, format) }))));
    return Boolean(you && shown.some(entry => entry.player === you.player));
  }

  /** Compact list for results screens. Inherits font and color from `el`. */
  function board(el, options = {}) {
    if (!el || !el.append || typeof options.board !== 'string') return null;
    const id = options.board;
    const limit = Math.max(1, Math.min(20, Number(options.limit) || 5));
    const periods = (Array.isArray(options.periods) ? options.periods : ['7d', '30d', 'all']).filter(p => PERIOD_LABELS[p]);
    let period = periods[0] || 'all';
    let request = 0;
    const { host, root } = shadowHost(`:host{display:block;font:inherit;color:inherit;line-height:1.35}:host([hidden]){display:none}${LIST_CSS}`);
    const list = h('ol');
    const note = h('div', { class: 'note', role: 'status' });
    const mine = h('div', { class: 'mine' });
    const toggle = periods.length > 1 ? h('div', { class: 'periods', role: 'group', 'aria-label': 'Period' },
      ...periods.map(p => h('button', { type: 'button', 'aria-pressed': String(p === period), 'data-period': p, text: SHORT_PERIODS[p],
        onclick: () => { period = p; for (const b of toggle.children) b.setAttribute('aria-pressed', String(b.getAttribute('data-period') === p)); refresh(); } }))) : null;
    if (toggle) root.append(toggle);
    root.append(list, note, mine);
    shield(host);
    el.append(host);
    async function refresh() {
      const mineRequest = ++request;
      const [data, info] = await Promise.all([top(id, period, { limit: Math.max(limit, 10) }), meta(id)]);
      if (mineRequest !== request) return;
      // A board that cannot load (API out, unknown board) hides quietly and comes back on a later refresh.
      if (data.error) host.setAttribute('hidden', ''); else host.removeAttribute('hidden');
      const listed = rows(list, data, info.format, limit);
      note.textContent = data.error ? '' : data.entries.length ? '' : 'No scores yet';
      note.hidden = !note.textContent;
      const rank = data.you && data.you.rank ? `#${data.you.rank} · ` : '';
      mine.textContent = data.you && !listed ? `You · ${rank}${formatValue(data.you.score, info.format)}` : '';
      mine.hidden = !mine.textContent;
    }
    const onScore = event => { if (event.detail && event.detail.board === id) refresh(); };
    addEventListener('ludvig:score', onScore);
    refresh();
    return { refresh, destroy() { removeEventListener('ludvig:score', onScore); host.remove(); } };
  }

  const SHEET_CSS = `:host{all:initial}
.backdrop{position:fixed;inset:0;z-index:2147483646;display:flex;justify-content:flex-end;background:rgba(0,0,0,.42);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);font:400 14px/1.45 ${SANS};color:#f2f2f2;-webkit-font-smoothing:antialiased;-webkit-user-select:none;user-select:none}
.sheet{box-sizing:border-box;display:flex;flex-direction:column;gap:14px;width:min(400px,100%);height:100%;padding:max(16px,env(safe-area-inset-top)) max(20px,env(safe-area-inset-right)) max(16px,env(safe-area-inset-bottom)) 20px;background:rgba(12,12,12,.94);border-left:1px solid rgba(255,255,255,.08);box-shadow:0 0 40px rgba(0,0,0,.35)}
@media (prefers-reduced-motion:no-preference){.backdrop{animation:fade .18s ease-out}.sheet{animation:slide .22s cubic-bezier(.2,.8,.2,1)}}
@keyframes fade{from{opacity:0}}@keyframes slide{from{transform:translateX(24px);opacity:.4}}
header{display:flex;align-items:flex-start;gap:12px}
.titles{flex:1;min-width:0;padding-top:10px}.title{margin:0;font-size:15px;font-weight:500}.sub{margin:2px 0 0;color:#8e8d8d;font-size:13px}
.icon{all:unset;box-sizing:border-box;display:inline-grid;place-items:center;width:44px;height:44px;border-radius:999px;color:#f2f2f2;cursor:pointer;flex:none}
.icon:hover{background:rgba(255,255,255,.08)}.icon:focus-visible,.seg button:focus-visible,.link:focus-visible{outline:1px solid #f2f2f2;outline-offset:2px}
.icon[disabled]{opacity:.3;cursor:default}
.modes{display:flex;align-items:center;justify-content:space-between;margin:-6px -10px}.mode{font-weight:500}
.seg{display:flex;gap:2px;padding:3px;border-radius:10px;background:rgba(255,255,255,.06)}
.seg button{all:unset;flex:1;text-align:center;cursor:pointer;min-height:36px;line-height:36px;border-radius:7px;color:#8e8d8d;font-size:13px;font-weight:500}
.seg button[aria-pressed="true"]{background:rgba(255,255,255,.1);color:#f2f2f2}
.scroll{flex:1;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch;margin:0 -20px;padding:0 20px}
${LIST_CSS}
li{padding:9px 10px;margin:0 -10px;border-top-color:rgba(255,255,255,.08)}li.you{background:rgba(255,255,255,.08)}.rank{color:#8e8d8d;opacity:1}.score{font-weight:500}
.note{color:#8e8d8d;opacity:1;padding:12px 0}
.you-line{margin:0;padding-top:12px;border-top:1px solid rgba(255,255,255,.08);font-variant-numeric:tabular-nums}
.you-line:empty{display:none}
.name-row{display:flex;align-items:center;gap:6px;min-height:44px;color:#8e8d8d}.name-row strong{color:#f2f2f2;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.link{all:unset;cursor:pointer;color:#f2f2f2;text-decoration:underline;text-decoration-color:rgba(255,255,255,.3);text-underline-offset:4px;padding:10px 4px}
form{display:flex;gap:8px;align-items:center}form[hidden],.name-row[hidden]{display:none}
input{box-sizing:border-box;flex:1;min-width:0;height:44px;padding:0 12px;border:1px solid rgba(255,255,255,.14);border-radius:8px;background:rgba(255,255,255,.05);color:#f2f2f2;font:inherit;font-size:16px;-webkit-user-select:text;user-select:text}
input:focus{outline:none;border-color:rgba(255,255,255,.4)}
.save{all:unset;cursor:pointer;height:44px;padding:0 14px;border-radius:8px;background:#f2f2f2;color:#0c0c0c;font-weight:500}
.err{margin:-6px 0 0;color:#ff8a80;font-size:12px}.err:empty{display:none}`;

  let openSheet = null;

  /** Full-height sheet: 7 days / 30 days / All time, top 20, your rank and an inline name edit. */
  function sheet(options = {}) {
    if (openSheet) openSheet.close();
    const config = game();
    const ids = Array.isArray(config.boards) ? config.boards.filter(id => typeof id === 'string') : [];
    let id = typeof options.board === 'string' ? options.board : ids[0];
    if (!id || !document.body) return null;
    const siblings = ids.includes(id) ? ids : [id];
    let period = PERIOD_LABELS[options.period] ? options.period : 'all';
    let request = 0;
    const previousFocus = document.activeElement;
    const { host, root } = shadowHost(SHEET_CSS);
    const title = h('h2', { class: 'title', id: 'ludvig-sheet-title' });
    const sub = h('p', { class: 'sub' });
    const closeButton = h('button', { class: 'icon', type: 'button', 'aria-label': 'Close leaderboard', html: ICONS.close, onclick: () => close() });
    const modeLabel = h('span', { class: 'mode' });
    const step = delta => { id = siblings[(siblings.indexOf(id) + delta + siblings.length) % siblings.length]; refresh(); };
    const modes = siblings.length > 1 ? h('div', { class: 'modes' },
      h('button', { class: 'icon', type: 'button', 'aria-label': 'Previous mode', html: ICONS.left, onclick: () => step(-1) }), modeLabel,
      h('button', { class: 'icon', type: 'button', 'aria-label': 'Next mode', html: ICONS.right, onclick: () => step(1) })) : null;
    const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Period' }, ...Object.entries(PERIOD_LABELS).map(([p, label]) =>
      h('button', { type: 'button', 'data-period': p, 'aria-pressed': String(p === period), text: label, onclick: () => {
        period = p;
        for (const b of seg.children) b.setAttribute('aria-pressed', String(b.getAttribute('data-period') === p));
        refresh();
      } })));
    const list = h('ol');
    const note = h('p', { class: 'note', role: 'status' });
    const youLine = h('p', { class: 'you-line' });
    const nameText = h('strong');
    const input = h('input', { type: 'text', maxlength: '16', autocomplete: 'nickname', spellcheck: 'false', enterkeyhint: 'done', 'aria-label': 'Your name' });
    const err = h('p', { class: 'err', role: 'status' });
    const nameRow = h('div', { class: 'name-row' }, 'Playing as ', nameText,
      h('button', { class: 'link', type: 'button', text: 'Edit', onclick: () => { input.value = load().name; err.textContent = ''; nameRow.hidden = true; form.hidden = false; input.focus(); } }));
    const form = h('form', { hidden: true }, input, h('button', { class: 'save', type: 'submit', text: 'Save' }));
    const showName = () => { nameText.textContent = load().name; form.hidden = true; nameRow.hidden = false; };
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (!cleanName(input.value)) { err.textContent = 'Use 2–16 letters or numbers.'; return; }
      const result = await setName(input.value);
      if (!result.ok) { err.textContent = 'That name isn’t allowed.'; return; }
      err.textContent = '';
      showName();
      refresh();
    });
    const panel = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'ludvig-sheet-title' },
      h('header', {}, h('div', { class: 'titles' }, title, sub), closeButton), modes, seg,
      h('div', { class: 'scroll' }, list, note), youLine, nameRow, form, err);
    const backdrop = h('div', { class: 'backdrop', onclick: event => { if (event.target === backdrop) close(); } }, panel);
    root.append(backdrop);
    shield(host);
    host.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); if (!form.hidden) showName(); else close(); }
    });
    document.body.append(host);
    showName();
    closeButton.focus();

    async function refresh() {
      const mine = ++request;
      const info = await meta(id);
      if (mine !== request) return;
      title.textContent = info.gameName || config.name || 'Leaderboard';
      sub.textContent = [info.mode, info.label].filter(Boolean).join(' · ');
      modeLabel.textContent = info.mode || info.label || '';
      note.textContent = 'Loading…';
      const data = await top(id, period, { limit: 20 });
      if (mine !== request) return;
      rows(list, data, info.format, 20);
      note.textContent = data.error ? 'Leaderboard unavailable right now.' : data.entries.length ? '' : 'No scores yet. Finish a run to set the first one.';
      note.hidden = !note.textContent;
      youLine.textContent = data.you ? `Your best: ${formatValue(data.you.score, info.format)}${data.you.rank ? ` · #${data.you.rank}` : ''}` : data.error ? '' : 'No score from you yet.';
    }
    const onScore = event => { if (event.detail && event.detail.board === id) refresh(); };
    addEventListener('ludvig:score', onScore);
    function close() {
      if (openSheet !== controller) return;
      openSheet = null;
      removeEventListener('ludvig:score', onScore);
      host.remove();
      try { if (previousFocus && previousFocus.focus) previousFocus.focus({ preventScroll: true }); } catch { /* Gone. */ }
    }
    const controller = { close, refresh };
    openSheet = controller;
    refresh();
    return controller;
  }

  const TOAST_CSS = `:host{all:initial}
.toast{all:unset;position:fixed;z-index:2147483645;top:max(12px,env(safe-area-inset-top));left:50%;transform:translateX(-50%);display:inline-flex;align-items:center;gap:8px;max-width:calc(100vw - 32px);box-sizing:border-box;padding:8px 14px 8px 12px;border-radius:999px;background:rgba(12,12,12,.82);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,.1);color:#f2f2f2;font:500 13px/1.3 ${SANS};font-variant-numeric:tabular-nums;cursor:pointer;white-space:nowrap}
.toast svg{width:15px;height:15px;opacity:.8}
@media (prefers-reduced-motion:no-preference){.toast{animation:in .2s ease-out}}@keyframes in{from{opacity:0;transform:translate(-50%,-6px)}}`;
  let toastNode = null;
  function showToast(text, icon = ICONS.trophy) {
    if (!document.body) return;
    if (toastNode) toastNode.remove();
    const { host, root } = shadowHost(TOAST_CSS);
    const hide = () => { clearTimeout(timer); host.remove(); if (toastNode === host) toastNode = null; };
    root.append(h('button', { class: 'toast', type: 'button', 'aria-label': `${text}. Dismiss`, html: icon, onclick: hide }, h('span', { text, role: 'status' })));
    shield(host);
    document.body.append(host);
    toastNode = host;
    const timer = setTimeout(hide, 3200);
  }

  /** "New best · #3 this week" after a submit, when this run is the player's best this week. */
  function maybeToast(board, value, result, options) {
    const wanted = options.toast ?? (ui.toast === true ? true : ui.toast === false ? false : options.source === 'bridge');
    if (!wanted || !result || !result.week || result.week.score !== value || !result.week.rank) return;
    showToast(result.best === value ? `New best · #${result.week.rank} this week` : `#${result.week.rank} this week`);
  }

  const BUTTON_CSS = `:host{all:initial}:host([hidden]){display:none}
.lb{all:unset;position:fixed;z-index:2147483640;box-sizing:border-box;display:grid;place-items:center;width:36px;height:36px;border-radius:999px;background:rgba(10,10,10,.34);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,.14);color:rgba(255,255,255,.92);cursor:pointer;opacity:.78;-webkit-tap-highlight-color:transparent}
.lb:hover,.lb:focus-visible{opacity:1}.lb:focus-visible{outline:1px solid #fff;outline-offset:2px}
.lb::before{content:"";position:absolute;inset:-4px}
.tl{top:max(12px,env(safe-area-inset-top));left:max(12px,env(safe-area-inset-left))}
.tr{top:max(12px,env(safe-area-inset-top));right:max(12px,env(safe-area-inset-right))}
.bl{bottom:max(12px,env(safe-area-inset-bottom));left:max(12px,env(safe-area-inset-left))}
.br{bottom:max(12px,env(safe-area-inset-bottom));right:max(12px,env(safe-area-inset-right))}`;
  let buttonHost = null, buttonWatch = null;
  /** Floating trophy button for games without their own leaderboard entry point (games.json "lbButton"). */
  function button(position = 'br', options = {}) {
    if (!['tl', 'tr', 'bl', 'br'].includes(position) || !document.body) return null;
    if (buttonHost) { apiWatchers.delete(buttonWatch); buttonHost.remove(); }
    const { host, root } = shadowHost(BUTTON_CSS);
    root.append(h('button', { class: `lb ${position}`, type: 'button', 'aria-label': 'Leaderboard', title: 'Leaderboard', html: ICONS.trophy, onclick: () => sheet(options) }));
    shield(host);
    // Hidden while the API is out, so nobody opens an empty leaderboard; it comes back when a call succeeds.
    const watch = out => { if (out) host.setAttribute('hidden', ''); else host.removeAttribute('hidden'); };
    watch(apiOut);
    apiWatchers.add(watch);
    document.body.append(host);
    buttonHost = host;
    buttonWatch = watch;
    return { remove() { apiWatchers.delete(watch); host.remove(); if (buttonHost === host) buttonHost = null; } };
  }

  const ui = { board, open: sheet, button, toast: undefined, icons: ICONS };

  function autoButton() {
    const config = game();
    if (Array.isArray(config.boards) && config.boards.length && ['tl', 'tr', 'bl', 'br'].includes(config.button)) button(config.button);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', autoButton); else autoButton();

  const format = formatValue;
  const Ludvig = { score, top, records, boards, setName, format, mp, cleanName, ui };
  Object.defineProperty(Ludvig, 'player', { enumerable: true, get: load });
  window.Ludvig = Object.freeze(Ludvig);
})();
