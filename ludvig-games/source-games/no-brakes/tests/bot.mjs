// Course sanity bot: a simple "hold gas, keep level in the air, hop at gaps" driver.
// Usage: node tests/bot.mjs [file] [courseIds...]   (ids: numbers, or daily:YYYY-MM-DD)
// It is not a good player. It shows whether a course is roughly as passable as the originals.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadGame } from './harness.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const file = process.argv[2] && process.argv[2].endsWith('.html') ? process.argv[2] : path.join(here, '..', 'index.html');
const ids = process.argv.slice(process.argv[2]?.endsWith('.html') ? 3 : 2);

function drive(api, course, vehicle, spaceAt = true) {
  if (typeof course === 'string' && course.startsWith('daily:')) api.test.startDaily(course.slice(6), vehicle);
  else if (typeof course === 'string' && course.startsWith('chaos:')) api.test.start(api.test.generate(course.slice(6)), vehicle);
  else api.test.start(course, vehicle);
  let st = api.getState();
  for (let t = 0; t < 150 && st.mode === 'play'; t += 1 / 30) {
    const pose = api.test.pose();
    const rear = pose[0], front = pose[1];
    const a = Math.atan2(front.y - rear.y, front.x - rear.x);
    const ground = rear.ground || front.ground;
    const held = { ArrowUp: true };
    if (!ground) { if (a < -0.25) held.ArrowRight = true; else if (a > 0.3) held.ArrowLeft = true; }
    if (spaceAt && ground && vehicle !== 1 && Math.random() < 0.02) held.Space = true;
    st = api.test.advance(1 / 30, held);
  }
  return { course, vehicle, mode: st.mode, x: Math.round(st.position?.x ?? 0), t: +st.time.toFixed(1), score: Math.round(st.score), health: Math.round(st.health ?? 0) };
}

const ctx = loadGame(file);
const api = ctx.__NO_BRAKES__;
const list = ids.length ? ids.map(v => (/^\d+$/.test(v) ? +v : v)) : [0, 1, 2, 3, 4, 5];
for (const id of list) {
  const len = typeof id === 'number' ? api.test.course(id).finish : 0;
  const rows = [];
  for (const v of [0, 1, 2]) for (let k = 0; k < 4; k++) rows.push(drive(api, id, v, k > 0));
  const wins = rows.filter(r => r.mode === 'win').length;
  const avgX = Math.round(rows.reduce((s, r) => s + r.x, 0) / rows.length);
  console.log(String(id).padEnd(18), 'finish', String(len).padEnd(6), 'wins', wins + '/' + rows.length, 'avgX', avgX, rows.map(r => r.mode[0] + r.x).join(' '));
}
