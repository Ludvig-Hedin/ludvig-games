// Determinism check for the battle simulator. Not shipped (build.py skips tests/).
// 1. The same fighters + seed give identical fingerprints when run twice, in separate VM contexts.
// 2. Results do not depend on engine-approximated Math functions: a context where
//    Math.sin/cos/exp/pow/atan2/hypot/log are nudged in the last bits still matches.
// 3. Share codes round-trip and replay the same battle.
// Usage: node tests/determinism.cjs
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const dir = path.resolve(__dirname, '..');
const code = ['roster.js', 'engine.js'].map(f => [f, fs.readFileSync(path.join(dir, f), 'utf8')]);

function context(perturb) {
  const ctx = { console };
  vm.createContext(ctx);
  if (perturb) vm.runInContext(`for (const k of ['sin','cos','exp','pow','atan2','hypot','log','atan']) { const o = Math[k]; Math[k] = (...a) => { const r = o(...a); return r * (1 + 3e-16) + 1e-300; }; }`, ctx);
  for (const [f, src] of code) vm.runInContext(src, ctx, { filename: f });
  return ctx;
}
function battle(ctx, a, b, seed) {
  const Sim = ctx.ArenaEngine.require('sim').Simulation, by = ctx.ARENA_ROSTER_BY_ID;
  const s = new Sim(a.map(id => by[id]), b.map(id => by[id]), seed).runToEnd();
  return { winner: s.winner, ticks: s.tick, kos: s.totalKOs, fp: s.fingerprint() };
}
const cases = [
  [['gorilla'], ['knights'], 12345],
  [['alg'], ['surstromming'], 0xdeadbeef],
  [['ants', 'dragon'], ['grandmas', 'yule-goat'], 42],
  [['tornado', 'bees', 'wizard', 'fridge'], ['volcano', 'spam', 'ninjas', 'kraken'], 987654321],
  [['popcorn', 'hail', 'meatballs'], ['vacuum', 'snowman', 'cat'], 7]
];
const one = context(false), two = context(false), odd = context(true);
assert.notEqual(vm.runInContext('Math.sin(1)', odd), vm.runInContext('Math.sin(1)', one), 'perturbation did not apply');
const t0 = Date.now();
for (const [a, b, seed] of cases) {
  const r1 = battle(one, a, b, seed), r1b = battle(one, a, b, seed), r2 = battle(two, a, b, seed), r3 = battle(odd, a, b, seed);
  assert.equal(r1.fp, r1b.fp, 'same context rerun differs');
  assert.equal(r1.fp, r2.fp, 'separate context differs');
  assert.equal(r1.fp, r3.fp, 'result depends on Math.* implementation');
  console.log(`ok  ${a.join('+')} vs ${b.join('+')} seed ${seed}: winner ${r1.winner === -1 ? 'draw' : r1.winner === 0 ? 'A' : 'B'}, ${r1.ticks} ticks, ${r1.kos} KOs, fingerprint ${r1.fp.length} chars identical x4`);
}
// Different seeds should usually give different battles.
const seeds = new Set([1, 2, 3, 4, 5].map(s => battle(one, ['gorilla'], ['knights'], s).fp));
assert.ok(seeds.size > 1, 'seed has no effect');
// Share code round trip.
const S = one.ArenaEngine.require('schema'), by = one.ARENA_ROSTER_BY_ID;
const d = { roster: one.ARENA_ROSTER_VERSION, a: [by['alg'], by['bees']], b: [by['knights'], by['toaster']], seed: 3141592653 };
const packed = S.packFight(d), back = S.unpackFight(packed, id => by[id], one.ARENA_ROSTER_VERSION);
assert.equal(back.a.map(f => f.id).join(), 'alg,bees');
assert.equal(back.seed, d.seed);
assert.equal(battle(one, back.a.map(f => f.id), back.b.map(f => f.id), back.seed).fp, battle(two, ['alg', 'bees'], ['knights', 'toaster'], 3141592653).fp);
assert.throws(() => S.unpackFight(packed, id => by[id], one.ARENA_ROSTER_VERSION + 1));
console.log(`ok  share code "${packed}" round-trips and replays identically`);
// Deterministic math stays close to real math.
const dm = one.ArenaEngine.require('dmath');
let worst = 0;
for (let i = 0; i < 2000; i++) {
  const x = (i - 1000) / 37, y = ((i * 7919) % 2000 - 1000) / 53;
  worst = Math.max(worst, Math.abs(dm.sin(x) - Math.sin(x)), Math.abs(dm.atan2(y, x) - Math.atan2(y, x)), Math.abs(dm.exp(-Math.abs(x)) - Math.exp(-Math.abs(x))));
  if (i > 0) worst = Math.max(worst, Math.abs(dm.pow(i / 10, .65) - Math.pow(i / 10, .65)) / Math.pow(i / 10, .65));
}
assert.ok(worst < 1e-6, 'dmath drifted: ' + worst);
console.log(`ok  deterministic math max error ${worst.toExponential(1)}; all checks passed in ${Date.now() - t0} ms`);
