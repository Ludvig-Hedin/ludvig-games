// Direct device-to-device link (docs/p2p-online.md in the hub repo).
// The room server only pairs the two seats and relays WebRTC setup. Once the
// data channels are open, the room socket stays silent apart from runtime
// pings (answered without waking the room) and join/leave events.
//   u: unordered, no retransmits, for frequent state and controls
//   r: ordered and reliable, for actions, points, serves and results

export const p2pTransport = {
  socket: url => new WebSocket(url),
  origin: () => `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`,
  rtc: config => new RTCPeerConnection(config),
};

const PING_MS = 30_000;
const CONNECT_TIMEOUT_MS = 10_000;
const LOST_AFTER_MS = 5_000;
const CANDIDATE_BATCH_MS = 250;
const REPLACED_CLOSE = 4000;
const TERMINAL_CLOSE = 4004;
export const CONNECT_FAILED = "Couldn't connect on this network.";

// STUN only (owner zero-cost rule, 24 Oct 2026): no TURN and no server call.
const ICE_SERVERS = [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] }];

function failure(message, status) { const error = new Error(message); error.status = status; return error; }

export class PeerLink {
  /**
   * handlers: onPeers(peers), onOpen(), onDown(), onLost(reason), onMessage(kind, data), onTerminal(message)
   */
  constructor(code, handlers = {}) {
    this.code = code;
    this.h = handlers;
    this.side = 0;
    this.token = '';
    this.peers = null;
    this.serverMessages = 0;
    this._ws = null;
    this._pc = null;
    this._u = null;
    this._r = null;
    this._open = false;
    this._disposed = false;
    this._pending = [];
    this._remoteSet = false;
    this._queuedRemote = [];
    this._connectTimer = null;
    this._lostTimer = null;
    this._pingTimer = null;
    this._retry = null;
    this._failures = 0;
    this._offerAt = 0;
  }

  get open() { return this._open; }

  /** Open the room socket and resolve with the welcome, or reject with the room's plain error. */
  start(hello) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const ws = this._socket(hello, message => {
        if (settled) return;
        if (message.t === 'welcome') { settled = true; resolve(message); }
        else if (message.t === 'err') { settled = true; reject(failure(message.message, message.status)); }
      }, () => { if (!settled) { settled = true; reject(failure('Could not reach the room. Check your connection.', 503)); } });
      setTimeout(() => { if (!settled) { settled = true; try { ws.close(); } catch { /* Ignore. */ } reject(failure('The room did not answer. Check your connection and try again.', 504)); } }, 10_000);
    });
  }

  send(kind, data) {
    const channel = kind === 'r' ? this._r : this._u;
    if (!channel || channel.readyState !== 'open') return false;
    try { channel.send(JSON.stringify(data)); return true; } catch { return false; }
  }

  /** Tell the room we are leaving, then close everything. */
  leave() {
    this._roomSend({ t: 'leave' });
    setTimeout(() => this.dispose(), 300);
  }

  dispose() {
    this._disposed = true;
    for (const t of [this._connectTimer, this._lostTimer, this._retry]) if (t) clearTimeout(t);
    if (this._pingTimer) clearInterval(this._pingTimer);
    this._closePeer();
    const ws = this._ws; this._ws = null;
    if (ws) { ws.onmessage = ws.onclose = ws.onerror = null; try { ws.close(1000); } catch { /* Ignore. */ } }
  }

  // ---- room socket ----

  _socket(hello, first, failed) {
    const ws = p2pTransport.socket(`${p2pTransport.origin()}/api/rooms/${encodeURIComponent(this.code)}/ws`);
    this._ws = ws;
    ws.onopen = () => this._roomSend(hello);
    ws.onmessage = event => {
      if (typeof event.data !== 'string' || event.data === 'pong') return;
      let message; try { message = JSON.parse(event.data); } catch { return; }
      first?.(message);
      this._room(message);
    };
    ws.onclose = event => {
      if (this._ws !== ws) return;
      this._ws = null;
      if (this._disposed) return;
      if (event.code === REPLACED_CLOSE) return this.h.onTerminal?.('This room is open in another tab.');
      if (event.code === TERMINAL_CLOSE) return;
      failed?.();
      if (this.token) this._reconnectSocket();
    };
    if (!this._pingTimer) this._pingTimer = setInterval(() => { try { this._ws?.readyState === 1 && this._ws.send('ping'); } catch { /* Ignore. */ } }, PING_MS);
    return ws;
  }

  _reconnectSocket() {
    if (this._retry || this._disposed) return;
    const delay = Math.min(8000, 500 * 2 ** Math.min(this._failures++, 4));
    this._retry = setTimeout(() => { this._retry = null; if (!this._disposed) this._socket({ t: 'hello', token: this.token }); }, delay);
  }

  _roomSend(message) {
    const ws = this._ws;
    if (!ws || ws.readyState !== 1) return false;
    try { ws.send(JSON.stringify(message)); this.serverMessages++; return true; } catch { return false; }
  }

  _room(message) {
    if (message.t === 'welcome' || message.t === 'peers') {
      this._failures = 0;
      if (message.token) this.token = message.token;
      this.side = message.side;
      this.peers = message;
      this.h.onPeers?.(message);
      const other = message.seats?.[this.side === 0 ? 1 : 0];
      if (other?.connected) {
        // The lower seat makes the offer. A fresh socket from the other side means a fresh connection.
        if (this.side === 0 && !this._open && (!this._pc || Date.now() - this._offerAt > 2500)) void this._offer();
      } else if (other?.left) {
        this._closePeer();
      }
    } else if (message.t === 'sig') {
      void this._signal(message.data);
    } else if (message.t === 'err') {
      this.h.onTerminal?.(message.message);
    }
  }

  // ---- peer connection ----

  async _peer() {
    this._closePeer();
    const pc = p2pTransport.rtc({ iceServers: ICE_SERVERS });
    this._pc = pc;
    this._remoteSet = false;
    this._queuedRemote = [];
    pc.onicecandidate = event => {
      if (this._pc !== pc) return;
      if (event.candidate) this._pending.push(event.candidate.toJSON ? event.candidate.toJSON() : event.candidate);
      if (!this._batch) this._batch = setTimeout(() => this._flushCandidates(), event.candidate ? CANDIDATE_BATCH_MS : 0);
    };
    pc.onconnectionstatechange = () => {
      if (this._pc !== pc) return;
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected' || pc.connectionState === 'closed') this._down();
    };
    pc.ondatachannel = event => this._channel(event.channel);
    if (this._connectTimer) clearTimeout(this._connectTimer);
    this._connectTimer = setTimeout(() => { if (!this._open && this._pc === pc) this.h.onLost?.(CONNECT_FAILED); }, CONNECT_TIMEOUT_MS);
    return pc;
  }

  async _offer() {
    this._offerAt = Date.now();
    const pc = await this._peer();
    this._channel(pc.createDataChannel('u', { ordered: false, maxRetransmits: 0 }));
    this._channel(pc.createDataChannel('r', { ordered: true }));
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    this._roomSend({ t: 'sig', data: { sdp: pc.localDescription } });
  }

  async _signal(data) {
    try {
      if (data?.sdp?.type === 'offer') {
        const pc = await this._peer();
        await pc.setRemoteDescription(data.sdp);
        this._remoteSet = true;
        for (const c of this._queuedRemote.splice(0)) await pc.addIceCandidate(c).catch(() => {});
        await pc.setLocalDescription(await pc.createAnswer());
        this._roomSend({ t: 'sig', data: { sdp: pc.localDescription } });
      } else if (data?.sdp?.type === 'answer' && this._pc) {
        await this._pc.setRemoteDescription(data.sdp);
        this._remoteSet = true;
        for (const c of this._queuedRemote.splice(0)) await this._pc.addIceCandidate(c).catch(() => {});
      }
      if (Array.isArray(data?.candidates) && this._pc) {
        for (const c of data.candidates) {
          if (this._remoteSet) await this._pc.addIceCandidate(c).catch(() => {});
          else this._queuedRemote.push(c);
        }
      }
    } catch { /* A broken offer ends in the connect timeout. */ }
  }

  _flushCandidates() {
    this._batch = null;
    if (!this._pending.length) return;
    this._roomSend({ t: 'sig', data: { candidates: this._pending.splice(0) } });
  }

  _channel(channel) {
    if (channel.label === 'u') this._u = channel; else this._r = channel;
    channel.onopen = () => this._checkOpen();
    channel.onclose = () => this._down();
    channel.onmessage = event => {
      let data; try { data = JSON.parse(event.data); } catch { return; }
      this.h.onMessage?.(channel.label, data);
    };
  }

  _checkOpen() {
    if (this._u?.readyState === 'open' && this._r?.readyState === 'open' && !this._open) {
      this._open = true;
      if (this._connectTimer) { clearTimeout(this._connectTimer); this._connectTimer = null; }
      if (this._lostTimer) { clearTimeout(this._lostTimer); this._lostTimer = null; }
      this.h.onOpen?.();
    }
  }

  _down() {
    if (!this._open) return;
    this._open = false;
    this.h.onDown?.();
    if (this._lostTimer) clearTimeout(this._lostTimer);
    // A closed channel with no leave event and no reconnect within 5 s counts as a leave.
    this._lostTimer = setTimeout(() => { this._lostTimer = null; if (!this._open && !this._disposed) this.h.onLost?.('left'); }, LOST_AFTER_MS);
  }

  _closePeer() {
    const pc = this._pc;
    this._pc = null; this._u = null; this._r = null;
    if (this._batch) { clearTimeout(this._batch); this._batch = null; }
    this._pending = [];
    const wasOpen = this._open;
    this._open = false;
    if (pc) { pc.onicecandidate = pc.onconnectionstatechange = pc.ondatachannel = null; try { pc.close(); } catch { /* Ignore. */ } }
    if (wasOpen && !this._disposed) this.h.onDown?.();
  }
}
