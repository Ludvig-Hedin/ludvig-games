/* Penthouse Panic: private, two-player rooms over WebRTC.
 * Signalling uses PeerJS Cloud. Game state and input travel peer-to-peer.
 * No public lobby, account, remote game server, or simulated connection.
 */
const ROOM_PREFIX = 'penthouse-panic-v1-';
const TIMEOUT = 18000;
const MAX_BYTES = 100000;
const NOOP = () => {};
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const encoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;

function roomCode() {
  const bytes = new Uint8Array(6);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, n => CODE_ALPHABET[n % CODE_ALPHABET.length]).join('');
}

function readableError(error) {
  switch (error?.type || error?.code) {
    case 'peer-unavailable': return 'Rummet hittades inte. Kontrollera koden och att värden har spelet öppet.';
    case 'unavailable-id': return 'Rumskoden används redan. Skapa ett nytt rum.';
    case 'browser-incompatible': return 'Webbläsaren stöder inte onlinespel. Prova senaste Chrome, Firefox eller Safari.';
    case 'invalid-id': return 'Rumskoden är ogiltig. Ange de sex tecknen från din kompis.';
    case 'network':
    case 'server-error':
    case 'socket-error':
    case 'socket-closed':
    case 'ssl-unavailable': return 'Onlinetjänsten kunde inte nås. Kontrollera internet eller spela tillsammans på samma skärm.';
    case 'webrtc':
    case 'negotiation-failed': return 'Era nätverk kunde inte ansluta till varandra. Prova ett annat nätverk eller spela på samma skärm.';
    case 'room-full': return 'Rummet är fullt. Två spelare får plats.';
    case 'timeout': return 'Anslutningen tog för lång tid. Kontrollera koden, prova ett annat nätverk eller spela på samma skärm.';
    default: return error?.message || 'Anslutningen misslyckades. Försök igen eller spela på samma skärm.';
  }
}

function validMessage(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  const prototype = Object.getPrototypeOf(data);
  if (prototype !== Object.prototype && prototype !== null) return false;
  if (typeof data.type !== 'string' || !/^[a-z][a-z0-9_-]{0,31}$/i.test(data.type)) return false;
  try {
    const json = JSON.stringify(data);
    if (json.length > MAX_BYTES) return false;
    return (encoder ? encoder.encode(json).length : json.length * 2) <= MAX_BYTES;
  } catch { return false; }
}

export class RoomConnection {
  constructor(callbacks = {}) {
    this.callbacks = Object.fromEntries(['onStatus', 'onPeer', 'onMessage', 'onClose', 'onError'].map(key => [key, typeof callbacks[key] === 'function' ? callbacks[key] : NOOP]));
    this.isHost = false;
    this.connected = false;
    this.code = '';
    this.peer = null;
    this.connection = null;
    this._generation = 0;
    this._closed = true;
    this._listeners = [];
    this._timers = new Set();
    this._rejects = new Set();
    this._pendingConnection = null;
    this._signalingRetries = 0;
    this._closeReported = false;
  }

  _emit(name, value) {
    // A UI callback cannot leave the transport in a half-open state.
    try { this.callbacks[name](value); } catch (error) { console.error('Room callback:', error); }
  }

  _listen(emitter, event, callback) {
    emitter.on(event, callback);
    this._listeners.push({ emitter, event, callback });
  }

  _detach(emitter) {
    this._listeners = this._listeners.filter(entry => {
      if (entry.emitter !== emitter) return true;
      try { emitter.off ? emitter.off(entry.event, entry.callback) : emitter.removeListener?.(entry.event, entry.callback); } catch {}
      return false;
    });
  }

  _later(callback, delay) {
    const id = setTimeout(() => { this._timers.delete(id); callback(); }, delay);
    this._timers.add(id);
    return id;
  }

  _clearTimer(id) {
    clearTimeout(id);
    this._timers.delete(id);
  }

  _prepare() {
    this.close();
    this._closed = false;
    this._closeReported = false;
    this._signalingRetries = 0;
    return this._generation;
  }

  async _createPeer(id, generation) {
    const PeerConstructor = globalThis.Peer;
    if (typeof PeerConstructor !== 'function') {
      throw new Error('Online kunde inte laddas. Ladda om sidan eller spela på samma skärm.');
    }
    const peer = id
      ? new PeerConstructor(id, { debug: 0, secure: true })
      : new PeerConstructor({ debug: 0, secure: true });
    this.peer = peer;

    this._listen(peer, 'connection', connection => {
      if (generation !== this._generation || this._closed) { connection.close(); return; }
      if (!this.isHost || this.connected || this._pendingConnection) {
        const refuse = () => {
          try { connection.send({ type: 'room_rejected', reason: 'full' }); } catch {}
          this._later(() => { try { connection.close(); } catch {} }, 150);
        };
        this._listen(connection, 'open', refuse);
        // Some implementations may deliver an already-open connection.
        if (connection.open) refuse();
        this._later(() => { try { connection.close(); } catch {} }, 2000);
        return;
      }
      this._acceptConnection(connection, generation).catch(error => {
        if (generation === this._generation && !this._closed) this._emit('onError', readableError(error));
      });
    });

    this._listen(peer, 'disconnected', () => {
      if (this._closed || generation !== this._generation) return;
      // An established WebRTC channel survives signalling interruption.
      this._emit('onStatus', this.connected ? 'Direktanslutningen är aktiv.' : 'Återansluter till onlinetjänsten…');
      if (this._signalingRetries++ < 2) this._later(() => {
        if (!this._closed && generation === this._generation && !peer.destroyed && peer.disconnected) {
          try { peer.reconnect(); } catch {}
        }
      }, 900);
    });

    this._listen(peer, 'close', () => {
      if (!this._closed && generation === this._generation) this._lostConnection('Rummet stängdes.');
    });

    return new Promise((resolve, reject) => {
      let settled = false;
      const fail = error => {
        if (settled) return;
        settled = true;
        this._clearTimer(timer);
        this._rejects.delete(fail);
        reject(error);
      };
      const timer = this._later(() => fail({ type: 'timeout' }), TIMEOUT);
      this._rejects.add(fail);
      this._listen(peer, 'open', () => {
        if (generation !== this._generation || this._closed) return;
        this._signalingRetries = 0;
        if (!settled) {
          settled = true;
          this._clearTimer(timer);
          this._rejects.delete(fail);
          resolve(peer);
        }
      });
      this._listen(peer, 'error', error => {
        if (generation !== this._generation || this._closed) return;
        if (!settled) { fail(error); return; }
        if (this._pendingConnection) {
          // PeerJS emits unknown-room errors on Peer rather than DataConnection.
          for (const pendingReject of Array.from(this._rejects)) pendingReject(error);
          return;
        }
        if (this.connected && ['network', 'socket-error', 'socket-closed', 'server-error', 'unavailable-id'].includes(error?.type)) {
          this._emit('onStatus', 'Direktanslutningen är aktiv.');
          return;
        }
        this._emit('onError', readableError(error));
      });
    });
  }

  async host() {
    const generation = this._prepare();
    this.isHost = true;
    this.code = roomCode();
    this._emit('onStatus', 'Skapar ett privat rum…');
    try {
      await this._createPeer(ROOM_PREFIX + this.code, generation);
      if (generation !== this._generation || this._closed) throw new Error('Anslutningen avbröts.');
      this._emit('onStatus', 'Rummet är öppet. Dela koden med din kompis.');
      return { code: this.code };
    } catch (error) {
      const message = readableError(error);
      if (generation === this._generation) {
        this.close();
        this._emit('onError', message);
      }
      throw new Error(message);
    }
  }

  async join(value) {
    const code = String(value || '').trim().toUpperCase().replace(/[\s-]/g, '');
    if (!/^[A-Z0-9]{6}$/.test(code)) {
      const message = 'Ange en rumskod med sex bokstäver eller siffror.';
      this._emit('onError', message);
      throw new Error(message);
    }
    const generation = this._prepare();
    this.isHost = false;
    this.code = code;
    this._emit('onStatus', 'Ansluter till rummet…');
    try {
      const peer = await this._createPeer(undefined, generation);
      if (generation !== this._generation || this._closed) throw new Error('Anslutningen avbröts.');
      const connection = peer.connect(ROOM_PREFIX + code, {
        label: 'penthouse-panic-v1', reliable: true, serialization: 'json', metadata: { game: 'penthouse-panic', version: 1 }
      });
      await this._acceptConnection(connection, generation);
    } catch (error) {
      const message = readableError(error);
      if (generation === this._generation) {
        this.close();
        this._emit('onError', message);
      }
      throw new Error(message);
    }
  }

  _acceptConnection(connection, generation) {
    this._pendingConnection = connection;
    return new Promise((resolve, reject) => {
      let settled = false;
      const fail = error => {
        if (settled) return;
        settled = true;
        this._clearTimer(timer);
        this._rejects.delete(fail);
        if (this._pendingConnection === connection) this._pendingConnection = null;
        this._detach(connection);
        try { connection.close(); } catch {}
        reject(error);
      };
      const timer = this._later(() => fail({ type: 'timeout' }), TIMEOUT);
      this._rejects.add(fail);
      const ready = () => {
        if (generation !== this._generation || this._closed || settled) return;
        settled = true;
        this._clearTimer(timer);
        this._rejects.delete(fail);
        this._pendingConnection = null;
        this.connection = connection;
        this.connected = true;
        this._closeReported = false;
        this._emit('onStatus', 'Ni är anslutna!');
        this._emit('onPeer');
        resolve();
      };
      const opened = () => {
        if (generation !== this._generation || this._closed || settled) return;
        if (this.isHost) {
          try { connection.send({ type: 'room_accepted', version: 1 }); } catch {}
          ready();
        }
        // Guests wait for the host's admission handshake, not merely an open
        // transport: a full room also briefly opens to deliver its rejection.
      };
      this._listen(connection, 'open', opened);
      this._listen(connection, 'data', data => {
        if (generation !== this._generation || this._closed || !validMessage(data)) return;
        if (data.type === 'room_rejected') {
          if (!settled) fail({ type: 'room-full' });
          return;
        }
        if (data.type === 'room_accepted' && !this.isHost && data.version === 1) { ready(); return; }
        if (connection !== this.connection || !this.connected) return;
        this._emit('onMessage', data);
      });
      this._listen(connection, 'close', () => {
        if (generation !== this._generation || this._closed) return;
        if (!settled) { fail(new Error('Rummet stängdes innan anslutningen blev klar.')); return; }
        if (connection === this.connection) this._lostConnection('Din kompis lämnade rummet.');
      });
      this._listen(connection, 'error', error => {
        if (generation !== this._generation || this._closed) return;
        if (!settled) { fail(error); return; }
        this._emit('onError', readableError(error));
        if (connection === this.connection) this._lostConnection('Anslutningen till din kompis bröts.');
      });
      if (connection.open) opened();
    });
  }

  _lostConnection(message) {
    const old = this.connection;
    this.connected = false;
    this.connection = null;
    if (old) { this._detach(old); try { old.close(); } catch {} }
    this._pendingConnection = null;
    this._emit('onStatus', message);
    if (!this._closeReported) {
      this._closeReported = true;
      this._emit('onClose');
    }
  }

  send(data) {
    if (!this.connected || !this.connection?.open || !validMessage(data)) return false;
    // Don't accumulate seconds of stale game snapshots on a slow connection.
    if ((this.connection.bufferSize || 0) > 12 || (this.connection.dataChannel?.bufferedAmount || 0) > 262144) return false;
    try { this.connection.send(data); return true; }
    catch { return false; }
  }

  close() {
    this._closed = true;
    this._generation++;
    this.connected = false;
    for (const id of this._timers) clearTimeout(id);
    this._timers.clear();
    for (const { emitter, event, callback } of this._listeners) {
      try { emitter.off ? emitter.off(event, callback) : emitter.removeListener?.(event, callback); } catch {}
    }
    this._listeners.length = 0;
    for (const reject of Array.from(this._rejects)) reject(new Error('Anslutningen avbröts.'));
    this._rejects.clear();
    try { this.connection?.close(); } catch {}
    try { this._pendingConnection?.close(); } catch {}
    try { this.peer?.destroy(); } catch {}
    this.connection = null;
    this._pendingConnection = null;
    this.peer = null;
    this.code = '';
    this.isHost = false;
  }
}
