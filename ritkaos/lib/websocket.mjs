/** Small dependency-free RFC 6455 text transport. All game rules live elsewhere. */
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
const MAX = 128 * 1024;
const decoder = new TextDecoder('utf-8', { fatal: true });
export class Peer extends EventEmitter {
  constructor(socket, head) {
    super(); this.socket = socket; this.buffer = Buffer.alloc(0); this.fragments = [];
    this.fragmentSize = 0; this.fragmenting = false; this.alive = true; this.closed = false;
    socket.setNoDelay(true);
    socket.on('data', b => this.read(b));
    socket.on('error', () => this.close());
    socket.on('close', () => { if (!this.closed) { this.closed = true; this.emit('close'); } });
    if (head.length) queueMicrotask(() => this.read(head));
  }
  frame(op, data = Buffer.alloc(0)) {
    if (this.closed || this.socket.destroyed) return;
    if (this.socket.writableLength > 2 * 1024 * 1024) return this.close(1013);
    const b = Buffer.isBuffer(data) ? data : Buffer.from(data);
    let header;
    if (b.length < 126) header = Buffer.from([0x80 | op, b.length]);
    else if (b.length <= 65535) { header = Buffer.alloc(4); header[0] = 0x80 | op; header[1] = 126; header.writeUInt16BE(b.length, 2); }
    else { header = Buffer.alloc(10); header[0] = 0x80 | op; header[1] = 127; header.writeBigUInt64BE(BigInt(b.length), 2); }
    this.socket.write(Buffer.concat([header, b]));
  }
  send(data) { this.frame(1, JSON.stringify(data)); }
  close(code = 1000) {
    if (this.closed) return;
    const payload = Buffer.alloc(2); payload.writeUInt16BE(code);
    this.frame(8, payload); this.closed = true; this.socket.end(); this.emit('close');
    const timeout = setTimeout(() => this.socket.destroy(), 500); timeout.unref();
  }
  ping() { if (!this.alive) return this.close(); this.alive = false; this.frame(9); }
  read(chunk) {
    if (this.closed) return;
    this.buffer = Buffer.concat([this.buffer, chunk]);
    if (this.buffer.length > MAX * 2) return this.close(1009);
    while (this.buffer.length >= 2 && !this.closed) {
      const a = this.buffer[0], b = this.buffer[1], fin = !!(a & 128), op = a & 15;
      if ((a & 112) || !(b & 128)) return this.close(1002);
      let len = b & 127, offset = 2;
      if (len === 126) { if (this.buffer.length < 4) return; len = this.buffer.readUInt16BE(2); offset = 4; }
      else if (len === 127) {
        if (this.buffer.length < 10) return;
        const big = this.buffer.readBigUInt64BE(2);
        if (big > BigInt(MAX)) return this.close(1009);
        len = Number(big); offset = 10;
      }
      if (len > MAX || (op >= 8 && (!fin || len > 125))) return this.close(1002);
      if (this.buffer.length < offset + 4 + len) return;
      const mask = this.buffer.subarray(offset, offset + 4), data = Buffer.from(this.buffer.subarray(offset + 4, offset + 4 + len));
      this.buffer = this.buffer.subarray(offset + 4 + len);
      for (let i = 0; i < len; i++) data[i] ^= mask[i % 4];
      if (op === 8) { this.close(); return; }
      if (op === 9) { this.frame(10, data); continue; }
      if (op === 10) { this.alive = true; continue; }
      if (![0, 1].includes(op) || (op === 0 && !this.fragmenting) || (op === 1 && this.fragmenting)) return this.close(1002);
      if (op === 1) { this.fragments = []; this.fragmentSize = 0; }
      this.fragments.push(data); this.fragmentSize += len;
      if (this.fragmentSize > MAX) return this.close(1009);
      this.fragmenting = !fin;
      if (fin) {
        let text;
        try { text = decoder.decode(Buffer.concat(this.fragments)); } catch { return this.close(1007); }
        this.fragments = []; this.fragmentSize = 0;
        this.emit('message', text);
      }
    }
  }
}
export function upgrade(req, socket, head) {
  const key = req.headers['sec-websocket-key'];
  if (req.headers.upgrade?.toLowerCase() !== 'websocket' || req.headers['sec-websocket-version'] !== '13' || typeof key !== 'string' || Buffer.from(key, 'base64').length !== 16) {
    socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n'); return null;
  }
  const accept = createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
  return new Peer(socket, head);
}
