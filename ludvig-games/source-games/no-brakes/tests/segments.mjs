// Section check: starts the bot at the spawn and every checkpoint, reports how far it gets and why it died.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadGame } from './harness.mjs';
const here = path.dirname(fileURLToPath(import.meta.url));
const ctx = loadGame(path.join(here, '..', 'index.html'));
const api = ctx.__NO_BRAKES__;
function run(start, vehicle, hop) {
  start();
  let st = api.getState();
  const wait = process.env.WAIT ? Math.random() * 2.5 : 0;
  if (wait) st = api.test.advance(wait, {});
  for (let t = 0; t < 60 && st.mode === 'play'; t += 1 / 30) {
    const pose = api.test.pose(), rear = pose[0], front = pose[1];
    const a = Math.atan2(front.y - rear.y, front.x - rear.x), ground = rear.ground || front.ground;
    const held = { ArrowUp: true };
    if (!ground) { if (a < -0.25) held.ArrowRight = true; else if (a > 0.3) held.ArrowLeft = true; }
    if (hop && ground && vehicle !== 1 && Math.random() < 0.02) held.Space = true;
    st = api.test.advance(1 / 30, held);
  }
  return st;
}
const ids = process.argv.slice(2).map(Number);
for (const id of ids.length ? ids : [6, 7, 8, 9]) {
  const l = api.test.course(id);
  const cps = l.objects.filter(o => o.type === 'checkpoint').map(o => o.x).sort((a, b) => a - b);
  const starts = [null, ...cps];
  const out = [];
  starts.forEach((cp, k) => {
    const goal = k + 1 < starts.length ? starts[k + 1] : l.finish;
    let pass = 0, tries = 0; const why = {};
    for (const v of [0, 1, 2]) for (let h = 0; h < 4; h++) {
      tries++;
      const st = run(() => (cp == null ? api.test.start(id, v) : api.test.startAt(id, cp + 65, v)), v, h > 0);
      if ((st.position?.x ?? 0) >= goal || st.mode === 'win') pass++;
      else { const r = st.mode === 'dead' ? st.reason.slice(0, 28) + '@' + Math.round(st.position.x / 50) * 50 : st.mode + '@' + Math.round((st.position?.x ?? 0) / 50) * 50; why[r] = (why[r] || 0) + 1; }
    }
    out.push(`  from ${cp ?? 'spawn'} to ${goal}: ${pass}/${tries} ` + Object.entries(why).map(([r, c]) => `${c}x ${r}`).join('; '));
  });
  console.log(id, l.name); console.log(out.join('\n'));
}
