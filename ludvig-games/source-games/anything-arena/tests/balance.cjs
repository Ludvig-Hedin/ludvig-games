// Offline balance calibration. Not shipped (build.py skips tests/).
// Plays each fighter 1v1 against a fixed set of opponents and nudges its `tune`
// (hit point multiplier) toward a 50% win rate. Prints a TUNE map for roster.js.
// Usage: node tests/balance.cjs [rounds=3] [opponents=16]
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const dir = path.resolve(__dirname, '..');
const ctx = { console };
vm.createContext(ctx);
for (const f of ['roster.js', 'engine.js']) vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx, { filename: f });
const Sim = ctx.ArenaEngine.require('sim').Simulation;
const base = ctx.ARENA_ROSTER.map(f => ({ ...f }));
const rounds = Number(process.argv[2] || 3), K = Number(process.argv[3] || 16);
const tune = Object.fromEntries(base.map(f => [f.id, f.tune || 1]));
const N = base.length;
for (let r = 0; r < rounds; r++) {
  const roster = base.map(f => ({ ...f, tune: tune[f.id] }));
  const score = new Array(N).fill(0), games = new Array(N).fill(0);
  for (let i = 0; i < N; i++) for (let k = 1; k <= K; k++) {
    const j = (i + Math.round(k * N / (K + 1))) % N;
    if (j === i) continue;
    for (const [seed, sideA] of [[1000 + i * 31 + k, true], [7 + i * 17 + k * 3, false]]) {
      const A = sideA ? roster[i] : roster[j], B = sideA ? roster[j] : roster[i];
      const s = new Sim([A], [B], seed).runToEnd();
      const mine = sideA ? 0 : 1, v = s.winner === -1 ? .5 : s.winner === mine ? 1 : 0;
      score[i] += v; games[i]++;
      score[j] += 1 - v; games[j]++;
    }
  }
  const rates = base.map((f, i) => [f.id, score[i] / games[i]]);
  const spread = rates.map(x => x[1]).sort((a, b) => a - b);
  console.log(`round ${r + 1}: min ${spread[0].toFixed(2)} p10 ${spread[Math.floor(N * .1)].toFixed(2)} median ${spread[Math.floor(N / 2)].toFixed(2)} p90 ${spread[Math.floor(N * .9)].toFixed(2)} max ${spread[N - 1].toFixed(2)}`);
  for (const [id, wr] of rates) {
    const step = Math.max(.6, Math.min(1.6, Math.pow(.5 / Math.max(.04, Math.min(.96, wr)), .55)));
    tune[id] = Math.max(.02, Math.min(6, tune[id] * step));
  }
  if (r === rounds - 1) console.log('outliers', rates.filter(x => x[1] < .25 || x[1] > .75).map(x => `${x[0]} ${x[1].toFixed(2)}`).join(', '));
}
const out = Object.entries(tune).filter(([, v]) => Math.abs(v - 1) > .005).map(([k, v]) => `'${k}': ${v.toFixed(3)}`).join(', ');
console.log('TUNE = { ' + out + ' }');
