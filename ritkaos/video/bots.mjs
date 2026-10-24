// Two scripted players for recording a Ritkaos clip: Maja hosts and draws, Sam guesses badly.
import { writeFileSync } from 'node:fs';
const HOST = 'wss://ritkaos.ludvighedin.com/ws';
const wait = ms => new Promise(r => setTimeout(r, ms));
class Bot {
  constructor(name) { this.name = name; this.n = 0; this.pending = new Map(); this.state = null; }
  async open() {
    this.ws = new WebSocket(HOST);
    this.ws.addEventListener('message', e => { const p = JSON.parse(e.data);
      if (p.type === 'welcome') this.id = p.data.id;
      if (p.type === 'state') this.state = p.data;
      if (p.type === 'ack') { const x = this.pending.get(p.request); if (x) { this.pending.delete(p.request); p.ok ? x.res(p.data) : x.rej(new Error(p.error)); } } });
    await new Promise((res, rej) => { this.ws.addEventListener('open', res, { once: true }); this.ws.addEventListener('error', rej, { once: true }); });
    this.ws.send(JSON.stringify({ type: 'hello', data: { token: null, lang: 'en' } }));
    while (!this.id) await wait(20); return this;
  }
  req(type, data = {}) { const request = ++this.n; return new Promise((res, rej) => { this.pending.set(request, { res, rej }); this.ws.send(JSON.stringify({ type, data, request })); }); }
  async until(fn, ms = 120000) { const t = Date.now(); while (!fn()) { if (Date.now() - t > ms) throw new Error('timeout ' + this.name); await wait(30); } }
}
// A cat (orange), a bowl (blue) and one long noodle from bowl to mouth.
const circle = (cx, cy, rx, ry, n = 28, a0 = 0, a1 = Math.PI * 2) => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + (a1 - a0) * i / n; return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)]; });
const line = (pts, n = 10) => pts.slice(1).flatMap((b, k) => { const a = pts[k]; return Array.from({ length: n }, (_, i) => [a[0] + (b[0] - a[0]) * (i + 1) / n, a[1] + (b[1] - a[1]) * (i + 1) / n]); });
const INK = '#262626', ORANGE = '#e8913a', NOODLE = '#e3b23c', SAUCE = '#d6463a', BOWL = '#3f74d6';
const strokes = [
  { c: INK, w: .012, p: circle(.36, .38, .13, .12, 36) },                       // head
  { c: INK, w: .012, p: [[.25, .31], [.24, .18], [.32, .27]].flatMap((q, i, a) => i ? line([a[i - 1], q], 6) : [q]) }, // ear
  { c: INK, w: .012, p: [[.40, .27], [.48, .18], [.47, .31]].flatMap((q, i, a) => i ? line([a[i - 1], q], 6) : [q]) },
  { c: INK, w: .02, p: circle(.31, .37, .012, .012, 8) }, { c: INK, w: .02, p: circle(.42, .37, .012, .012, 8) }, // eyes
  { c: SAUCE, w: .014, p: circle(.37, .45, .03, .02, 12, 0, Math.PI) },          // messy mouth
  { c: INK, w: .006, p: line([[.25, .43], [.13, .40]], 6) }, { c: INK, w: .006, p: line([[.25, .46], [.13, .48]], 6) },
  { c: INK, w: .006, p: line([[.48, .43], [.60, .40]], 6) },
  { c: ORANGE, w: .03, p: circle(.36, .70, .15, .16, 34) },                       // body
  { c: ORANGE, w: .025, p: line([[.22, .78], [.12, .70], [.10, .56], [.15, .50]], 8) }, // tail
  { c: BOWL, w: .02, p: circle(.74, .74, .16, .10, 26, 0, Math.PI) },             // bowl
  { c: BOWL, w: .014, p: line([[.58, .74], [.90, .74]], 14) },
  { c: NOODLE, w: .012, p: line([[.70, .73], [.66, .62], [.72, .55], [.62, .50], [.55, .52], [.48, .47], [.40, .46]], 9) }, // the noodle
  { c: NOODLE, w: .01, p: line([[.78, .73], [.80, .64], [.74, .62], [.79, .55]], 8) },
  { c: SAUCE, w: .02, p: circle(.74, .69, .05, .025, 14) },
];
const [maja, sam] = [await new Bot('Maja').open(), await new Bot('Sam').open()];
const { room } = await maja.req('create', { name: 'Maja', avatar: 2, lang: 'en' });
await sam.req('join', { code: room, name: 'Sam', avatar: 5 });
await maja.req('settings', { mode: 'classic', rounds: 1, seconds: 60, custom: 'a cat eating spaghetti' });
writeFileSync(new URL('./room.txt', import.meta.url), room);
console.log('ROOM', room);
await maja.until(() => maja.state?.players?.filter(p => p.connected !== false).length >= 3, 300000);
await wait(2500);
await maja.req('start');
await maja.until(() => maja.state.phase === 'choosing');
if (maja.state.artists?.[0] !== maja.id) { console.log('NOT_MAJA_TURN'); process.exit(2); }
await wait(1200); await maja.req('choose', { index: 0 });
await maja.until(() => maja.state.phase === 'drawing');
const epoch = maja.state.epoch; const t0 = Date.now();
const lines = [[2600, 'a potato??'], [5200, 'dog with worms'], [7800, 'WAIT is that a cat'], [12500, 'cat eating spaghetti']];
(async () => { for (const [at, text] of lines) { await wait(Math.max(0, at - (Date.now() - t0))); await sam.req('guess', { text }).catch(e => console.log('guess', e.message)); } })();
let k = 0;
for (const s of strokes) {
  const id = 'm' + (k++); await maja.req('stroke.begin', { epoch, stroke: id, point: s.p[0], width: s.w, color: s.c, cid: k });
  for (let i = 1; i < s.p.length; i += 3) { await maja.req('stroke.points', { epoch, stroke: id, points: s.p.slice(i, i + 3) }); await wait(45); }
  await maja.req('stroke.end', { epoch, stroke: id }); await wait(120);
}
console.log('DRAWN', ((Date.now() - t0) / 1000).toFixed(1));
await wait(25000); console.log('DONE'); process.exit(0);
