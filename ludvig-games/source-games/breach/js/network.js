/**
 * BREACH multiplayer: host-authoritative transport, up to four humans.
 * On the static site this uses locally bundled PeerJS + WebRTC data channels.
 * The downloadable Node server supplies a same-origin WebSocket relay.
 */
const VERSION = 1;
const MAX_PLAYERS = 4;
const MAX_BYTES = 65536;
const CONNECT_TIMEOUT = 18000;
const ID_PREFIX = 'breach-fps-v1-';
const textEncoder = new TextEncoder();
let peerLoader;

function cleanName(value) {
  return String(value || 'Operator').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 18) || 'Operator';
}
function cleanCode(value) {
  const code = String(value || '').replace(/[\s-]/g, '');
  if (!/^\d{6}$/.test(code)) throw new Error('Enter the six-digit room code.');
  return code;
}
function roomNumber() {
  const n = new Uint32Array(1);
  crypto.getRandomValues(n);
  return String(100000 + (n[0] % 900000));
}
function packetSize(data) {
  try {
    const json = JSON.stringify(data);
    return json && textEncoder.encode(json).byteLength <= MAX_BYTES;
  } catch { return false; }
}
function errorText(error) {
  const type = error?.type || error?.code;
  if (type === 'peer-unavailable') return 'Room not found. Check the code and make sure the host is still online.';
  if (type === 'unavailable-id') return 'That room code is already in use. Try creating another room.';
  if (type === 'browser-incompatible') return 'This browser does not support multiplayer. Try current Safari, Chrome, or Firefox.';
  if (type === 'network' || type === 'server-error' || type === 'socket-error') return 'The multiplayer connection failed. Check your internet connection or use the included LAN server.';
  return error?.message || 'The multiplayer connection was interrupted.';
}
async function loadPeerJS() {
  if (globalThis.Peer) return globalThis.Peer;
  if (!peerLoader) {
    peerLoader = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = new URL('../vendor/peerjs.min.js', import.meta.url).href;
      script.async = true;
      script.onload = () => globalThis.Peer ? resolve(globalThis.Peer) : reject(new Error('Multiplayer could not load. Reload and try again.'));
      script.onerror = () => reject(new Error('Multiplayer could not load. Reload and try again.'));
      document.head.appendChild(script);
    }).catch(error => { peerLoader = null; throw error; });
  }
  return peerLoader;
}
function getRelayURL() {
  const query = new URLSearchParams(location.search);
  let value = query.get('relay');
  if (value === 'off' || value === 'peer') return null;
  if (!value) value = document.querySelector('meta[name="breach-relay"]')?.content;
  const hostname = location.hostname;
  const local = /^(localhost|127\.0\.0\.1|\[?::1\]?)$/.test(hostname) || /^10\./.test(hostname) || /^192\.168\./.test(hostname) || /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) || hostname.endsWith('.local');
  if (!value && !local) return null;
  if (!value || value === 'same' || value === '1') return `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/signal`;
  let url;
  try { url = new URL(value, location.href); } catch { throw new Error('The relay address is invalid.'); }
  if (url.protocol === 'https:') url.protocol = 'wss:';
  if (url.protocol === 'http:') url.protocol = 'ws:';
  if (!['ws:', 'wss:'].includes(url.protocol)) throw new Error('The relay must use a ws:// or wss:// address.');
  if (location.protocol === 'https:' && url.protocol !== 'wss:') throw new Error('Use a secure wss:// relay from this page.');
  if (url.pathname === '/') url.pathname = '/signal';
  return url.href;
}

export class Multiplayer {
  constructor(callbacks = {}) {
    this.callbacks = callbacks;
    this.isHost = false;
    this.localId = '';
    this.roomCode = '';
    this.name = 'Operator';
    this.peers = new Map();
    this.ping = 0;
    this.transport = '';
    this.connected = false;
    this._epoch = 0;
    this._connections = new Map();
    this._closed = true;
    this._pending = null;
    this._peer = null;
    this._ws = null;
    this._heartbeat = null;
    this._reconnectTimer = null;
    this._hostId = '';
  }
  _emit(name, ...args) {
    try { this.callbacks[name]?.(...args); } catch (error) { console.error(`BREACH ${name}:`, error); }
  }
  _status(state, message) { this._emit('onStatus', { state, message }); }
  _begin(isHost, name, code = '') {
    this.close();
    this._closed = false;
    this.isHost = isHost;
    this.name = cleanName(name);
    this.roomCode = code;
    this._status('connecting', isHost ? 'Creating room…' : 'Connecting to room…');
    return this._epoch;
  }
  async host(name = 'Operator') {
    const epoch = this._begin(true, name);
    try {
      const relay = getRelayURL();
      if (relay) return await this._connectRelay(relay, true, epoch);
      this.transport = 'webrtc';
      const Peer = await loadPeerJS();
      if (epoch !== this._epoch) throw new Error('Connection cancelled.');
      for (let attempt = 0; attempt < 4; attempt++) {
        this.roomCode = roomNumber();
        try {
          await this._openPeer(Peer, ID_PREFIX + this.roomCode, epoch);
          break;
        } catch (error) {
          if (error?.type !== 'unavailable-id' || attempt === 3) throw error;
          this._peer?.destroy();
          this._peer = null;
        }
      }
      if (epoch !== this._epoch) throw new Error('Connection cancelled.');
      this.connected = true;
      this._hostId = this.localId;
      this._startHeartbeat();
      this._status('hosting', `Room ${this.roomCode} ready. Share the code with a friend.`);
      return { code: this.roomCode, id: this.localId };
    } catch (error) {
      if (epoch === this._epoch) { this.close(); this._status('error', errorText(error)); }
      throw new Error(errorText(error));
    }
  }
  async join(code, name = 'Operator') {
    const normalized = cleanCode(code);
    const epoch = this._begin(false, name, normalized);
    try {
      const relay = getRelayURL();
      if (relay) return await this._connectRelay(relay, false, epoch);
      this.transport = 'webrtc';
      const Peer = await loadPeerJS();
      if (epoch !== this._epoch) throw new Error('Connection cancelled.');
      await this._openPeer(Peer, undefined, epoch);
      if (epoch !== this._epoch) throw new Error('Connection cancelled.');
      const result = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Could not reach the host. The room may be closed, or this network may block direct connections. Try the included LAN server.')), CONNECT_TIMEOUT);
        this._pending = { resolve: value => { clearTimeout(timer); this._pending = null; resolve(value); }, reject: error => { clearTimeout(timer); this._pending = null; reject(error); } };
        const conn = this._peer.connect(ID_PREFIX + normalized, { reliable: true, serialization: 'json', label: 'breach-fps-v1', metadata: { version: VERSION, name: this.name } });
        this._hostId = conn.peer;
        this._wireConnection(conn, false, epoch);
      });
      this._startHeartbeat();
      return result;
    } catch (error) {
      if (epoch === this._epoch) { this.close(); this._status('error', errorText(error)); }
      throw new Error(errorText(error));
    }
  }
  _openPeer(Peer, id, epoch) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const peer = new Peer(id, { debug: 0, secure: true, config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] } });
      this._peer = peer;
      const timer = setTimeout(() => finish(new Error('The room service did not respond. Check your connection or use the included LAN server.')), 14000);
      const finish = error => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this._pending = null;
        error ? reject(error) : resolve();
      };
      this._pending = { reject: finish };
      peer.on('open', peerId => {
        if (epoch !== this._epoch) return;
        this.localId = peerId;
        if (!settled) finish();
        else if (this.connected) this._status(this.isHost ? 'hosting' : 'connected', 'Multiplayer connection restored.');
      });
      peer.on('connection', conn => {
        if (epoch !== this._epoch || !this.isHost || this._closed || this._connections.size >= 8) { conn.close(); return; }
        this._wireConnection(conn, true, epoch);
      });
      peer.on('error', error => {
        if (epoch !== this._epoch) return;
        if (!settled) { finish(error); return; }
        if (this._pending) this._pending.reject(error);
        else if (['network', 'server-error', 'socket-error', 'socket-closed'].includes(error?.type)) {
          this._status('degraded', 'Room service interrupted. Existing players can keep playing.');
        } else if (!this.connected) this._lose(errorText(error));
      });
      peer.on('disconnected', () => {
        if (epoch !== this._epoch || this._closed) return;
        this._status('degraded', 'Room service disconnected. Reconnecting…');
        clearTimeout(this._reconnectTimer);
        this._reconnectTimer = setTimeout(() => {
          if (epoch === this._epoch && !peer.destroyed && peer.disconnected) {
            try { peer.reconnect(); } catch { this._status('degraded', 'Room service unavailable. Existing players can keep playing.'); }
          }
        }, 2500);
      });
      peer.on('close', () => {
        if (epoch !== this._epoch || this._closed || this._peer !== peer) return;
        if (!settled) finish(new Error('The room service disconnected.'));
        else if (this.connected) this._lose('Multiplayer closed. Create or join a room again.');
      });
    });
  }
  _wireConnection(conn, incoming, epoch) {
    const entry = { id: conn.peer, name: 'Operator', conn, accepted: false, lastSeen: Date.now(), rtt: 0, count: 0, window: Date.now() };
    const handshakeTimer = setTimeout(() => { if (!entry.accepted) conn.close(); }, CONNECT_TIMEOUT);
    if (this._connections.has(conn.peer)) { clearTimeout(handshakeTimer); conn.close(); return; }
    this._connections.set(conn.peer, entry);
    conn.on('open', () => {
      if (epoch !== this._epoch) { conn.close(); return; }
      entry.lastSeen = Date.now();
      if (!incoming) this._sendConnection(entry, { b: VERSION, type: 'hello', name: this.name });
    });
    conn.on('data', msg => {
      if (epoch !== this._epoch || this._closed || !msg || typeof msg !== 'object' || msg.b !== VERSION || !packetSize(msg)) return;
      const now = Date.now();
      if (now - entry.window > 1000) { entry.window = now; entry.count = 0; }
      if (++entry.count > 160) { conn.close(); return; }
      entry.lastSeen = now;
      if (msg.type === 'hello' && incoming && !entry.accepted) {
        if (this.peers.size >= MAX_PLAYERS - 1 || conn.metadata?.version !== VERSION) {
          this._sendConnection(entry, { b: VERSION, type: 'rejected', reason: this.peers.size >= MAX_PLAYERS - 1 ? 'This room is full (four players).' : 'Game versions do not match. Reload the game.' });
          setTimeout(() => conn.close(), 150);
          return;
        }
        entry.accepted = true;
        clearTimeout(handshakeTimer);
        entry.name = cleanName(msg.name);
        this.peers.set(entry.id, entry);
        this._sendConnection(entry, { b: VERSION, type: 'welcome', host: { id: this.localId, name: this.name }, code: this.roomCode, peers: this._roster() });
        this._broadcastRoster();
        this._emit('onPeerJoin', { id: entry.id, name: entry.name });
      } else if (msg.type === 'welcome' && !incoming && !entry.accepted) {
        if (msg.code !== this.roomCode || !msg.host?.id) return;
        entry.accepted = true;
        clearTimeout(handshakeTimer);
        entry.name = cleanName(msg.host.name);
        this.connected = true;
        this._hostId = entry.id;
        this._syncRoster(msg.peers);
        this._status('connected', `Connected to room ${this.roomCode}.`);
        this._pending?.resolve({ id: this.localId, code: this.roomCode });
      } else if (msg.type === 'rejected' && !incoming) {
        this._pending?.reject(new Error(String(msg.reason || 'Unable to join room.').slice(0, 160)));
      } else if (entry.accepted) {
        if (msg.type === 'data') this._emit('onMessage', msg.data, entry.id);
        else if (msg.type === 'roster' && !incoming) this._syncRoster(msg.peers);
        else if (msg.type === 'ping') this._sendConnection(entry, { b: VERSION, type: 'pong', time: msg.time });
        else if (msg.type === 'pong' && Number.isFinite(msg.time)) { entry.rtt = Math.max(0, Math.min(10000, now - msg.time)); this._updatePing(); }
        else if (msg.type === 'bye') conn.close();
      }
    });
    conn.on('close', () => {
      clearTimeout(handshakeTimer);
      if (epoch !== this._epoch || this._closed || this._connections.get(entry.id) !== entry) return;
      this._connections.delete(entry.id);
      if (incoming) {
        if (this.peers.delete(entry.id)) { this._emit('onPeerLeave', { id: entry.id, name: entry.name }); this._broadcastRoster(); }
      } else if (!this.connected) this._pending?.reject(new Error('The host closed the connection. Check the room code and try again.'));
      else this._lose('The host left the room. Create or join another room.');
    });
    conn.on('error', error => {
      if (epoch !== this._epoch || this._closed) return;
      if (!incoming && !this.connected) this._pending?.reject(new Error(errorText(error)));
      conn.close();
    });
  }
  _roster() {
    return [{ id: this.localId, name: this.name }, ...Array.from(this.peers.values(), p => ({ id: p.id, name: p.name }))];
  }
  _syncRoster(list) {
    if (!Array.isArray(list)) return;
    const next = new Map();
    const added = [];
    const removed = [];
    for (const item of list.slice(0, MAX_PLAYERS)) {
      if (!item || typeof item.id !== 'string' || item.id === this.localId) continue;
      const entry = this._connections.get(item.id) || this.peers.get(item.id) || { id: item.id };
      entry.name = cleanName(item.name);
      next.set(item.id, entry);
      if (!this.peers.has(item.id)) added.push({ id: item.id, name: entry.name });
    }
    for (const [id, old] of this.peers) if (!next.has(id)) removed.push({ id, name: old.name });
    this.peers = next;
    for (const peer of added) this._emit('onPeerJoin', peer);
    for (const peer of removed) this._emit('onPeerLeave', peer);
  }
  _broadcastRoster() {
    const msg = { b: VERSION, type: 'roster', peers: this._roster() };
    for (const entry of this._connections.values()) if (entry.accepted) this._sendConnection(entry, msg);
  }
  _sendConnection(entry, msg) {
    try {
      if (!entry?.conn?.open || (entry.conn.dataChannel?.bufferedAmount || 0) > 262144) return false;
      entry.conn.send(msg);
      return true;
    } catch { return false; }
  }
  async _connectRelay(url, hosting, epoch) {
    this.transport = 'relay';
    return await new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      this._ws = ws;
      this._relaySeen = Date.now();
      const timer = setTimeout(() => reject(new Error('The multiplayer server did not respond. Check the server address and your connection.')), CONNECT_TIMEOUT);
      this._pending = {
        resolve: value => { clearTimeout(timer); this._pending = null; resolve(value); },
        reject: error => { clearTimeout(timer); this._pending = null; reject(error); }
      };
      ws.addEventListener('open', () => {
        if (epoch !== this._epoch) { ws.close(); return; }
        ws.send(JSON.stringify({ kind: hosting ? 'host' : 'join', version: VERSION, name: this.name, code: this.roomCode }));
      });
      ws.addEventListener('message', event => {
        if (epoch !== this._epoch || typeof event.data !== 'string' || event.data.length > MAX_BYTES + 2048) return;
        let msg;
        try { msg = JSON.parse(event.data); } catch { return; }
        this._relaySeen = Date.now();
        if (msg.kind === 'ready') {
          this.localId = msg.id;
          this.roomCode = msg.code;
          this._hostId = msg.host?.id || this.localId;
          this.connected = true;
          this._syncRoster(msg.peers);
          this._startHeartbeat();
          this._status(hosting ? 'hosting' : 'connected', hosting ? `Room ${this.roomCode} ready. Share the code with a friend.` : `Connected to room ${this.roomCode}.`);
          this._pending?.resolve({ id: this.localId, code: this.roomCode });
        } else if (msg.kind === 'joined' && msg.peer?.id && msg.peer.id !== this.localId) {
          const entry = { id: msg.peer.id, name: cleanName(msg.peer.name) };
          if (!this.peers.has(entry.id)) { this.peers.set(entry.id, entry); this._emit('onPeerJoin', entry); }
        } else if (msg.kind === 'left' && this.peers.has(msg.id)) {
          const entry = this.peers.get(msg.id);
          this.peers.delete(msg.id);
          this._emit('onPeerLeave', { id: msg.id, name: entry.name });
        } else if (msg.kind === 'roster') this._syncRoster(msg.peers);
        else if (msg.kind === 'data' && typeof msg.from === 'string') this._emit('onMessage', msg.data, msg.from);
        else if (msg.kind === 'pong' && Number.isFinite(msg.time)) this.ping = Math.max(0, Math.min(10000, Date.now() - msg.time));
        else if (msg.kind === 'error') {
          const reason = String(msg.message || 'Unable to connect.').slice(0, 180);
          if (this._pending) this._pending.reject(new Error(reason));
          else this._status('error', reason);
        } else if (msg.kind === 'roomClosed') this._lose(String(msg.reason || 'The host left the room.'));
      });
      ws.addEventListener('error', () => {
        if (epoch !== this._epoch || this._closed) return;
        const error = new Error('Could not connect to the multiplayer server. Check that the server is running.');
        if (this._pending) this._pending.reject(error);
        else this._lose(error.message);
      });
      ws.addEventListener('close', () => {
        if (epoch !== this._epoch || this._closed) return;
        if (this._pending) this._pending.reject(new Error('The multiplayer server disconnected.'));
        else this._lose('The multiplayer server disconnected. Rejoin the room to continue.');
      });
    });
  }
  send(data, targetId) {
    if (!this.connected || !packetSize(data)) return false;
    if (this.transport === 'relay') {
      try {
        if (this._ws?.readyState !== WebSocket.OPEN || this._ws.bufferedAmount > 262144) return false;
        this._ws.send(JSON.stringify({ kind: 'data', data, ...(this.isHost && targetId ? { target: targetId } : {}) }));
        return true;
      } catch { return false; }
    }
    const msg = { b: VERSION, type: 'data', data };
    if (!this.isHost) return this._sendConnection(this._connections.get(this._hostId), msg);
    if (targetId) return this._sendConnection(this._connections.get(targetId), msg);
    let sent = false;
    for (const entry of this._connections.values()) if (entry.accepted) sent = this._sendConnection(entry, msg) || sent;
    return sent;
  }
  _startHeartbeat() {
    clearInterval(this._heartbeat);
    this._heartbeat = setInterval(() => {
      if (this._closed || !this.connected) return;
      const now = Date.now();
      if (this.transport === 'relay') {
        if (now - this._relaySeen > 21000) { this._lose('The multiplayer connection timed out. Rejoin the room to continue.'); return; }
        if (this._ws?.readyState === WebSocket.OPEN) this._ws.send(JSON.stringify({ kind: 'ping', time: now }));
      } else {
        for (const entry of this._connections.values()) {
          if (now - entry.lastSeen > 21000) { entry.conn.close(); continue; }
          if (entry.accepted) this._sendConnection(entry, { b: VERSION, type: 'ping', time: now });
        }
      }
    }, 3000);
  }
  _updatePing() {
    const peers = Array.from(this._connections.values()).filter(p => p.accepted);
    this.ping = peers.length ? Math.round(peers.reduce((sum, p) => sum + p.rtt, 0) / peers.length) : 0;
  }
  _lose(reason) {
    if (this._closed) return;
    this.close();
    this._status('disconnected', reason);
    this._emit('onDisconnect', reason);
  }
  close() {
    this._closed = true;
    this._epoch++;
    clearInterval(this._heartbeat);
    clearTimeout(this._reconnectTimer);
    this._heartbeat = null;
    if (this._pending) { const pending = this._pending; this._pending = null; pending.reject(new Error('Connection cancelled.')); }
    for (const entry of this._connections.values()) {
      try { if (entry.conn.open) entry.conn.send({ b: VERSION, type: 'bye' }); entry.conn.close(); } catch { /* Already closed. */ }
    }
    this._connections.clear();
    try { this._peer?.destroy(); } catch { /* Already closed. */ }
    try { this._ws?.close(1000, 'Leaving room'); } catch { /* Already closed. */ }
    this._peer = null;
    this._ws = null;
    this.peers.clear();
    this.connected = false;
    this.localId = '';
    this.roomCode = '';
    this._hostId = '';
    this.ping = 0;
  }
}
