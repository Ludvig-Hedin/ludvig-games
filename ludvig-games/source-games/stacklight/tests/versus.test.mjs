// Run: node source-games/stacklight/tests/versus.test.mjs
// Versus helpers (seeded bag, garbage, board encoding, standings) plus a parse check of the game's scripts.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let fails = 0, passes = 0;
const ok = (c, m) => { if (c) passes++; else { fails++; console.error('FAIL', m); } };

const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
[...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].forEach((m, i) => {
  try { new vm.Script(m[1], { filename: `inline-${i}.js` }); passes++; } catch (e) { fails++; console.error('FAIL parse inline', i, e.message); }
});
ok(html.indexOf('<script src="versus.js"></script>') > 0, 'index.html loads versus.js');
const ctx = vm.createContext({ Math, Array, Object, String, Number });
vm.runInContext(fs.readFileSync(path.join(dir, 'versus.js'), 'utf8'), ctx, { filename: 'versus.js' });
const V = ctx.StacksVersus;
const blank = () => Array.from({ length: V.ROWS }, () => Array(V.COLS).fill(0));

// Seeded bag: same seed, same order; each bag holds all seven pieces.
const seq = seed => { const r = V.rng(seed); return Array.from({ length: 6 }, () => V.bag(r).join('')).join('|'); };
ok(seq(99) === seq(99), 'same seed gives the same piece order');
ok(seq(99) !== seq(100), 'different seeds differ');
ok(seq(5).split('|').every(b => [...b].sort().join('') === 'IJLOSTZ'), 'every bag has the seven pieces');

// Garbage table and cancelling.
ok([0, 1, 2, 3, 4].map(V.garbageFor).join() === '0,0,1,2,4', 'garbage: 1→0, 2→1, 3→2, 4→4');
let c = V.cancel([{ n: 2, h: 3 }, { n: 1, h: 5 }], 1);
ok(c.send === 0 && V.pendingRows(c.pending) === 2 && c.pending[0].n === 1, 'clearing cancels incoming first');
c = V.cancel([{ n: 1, h: 3 }], 4);
ok(c.send === 3 && c.pending.length === 0, 'leftover lines are sent on');
const src = [{ n: 2, h: 1 }]; V.cancel(src, 2);
ok(src[0].n === 2, 'cancel does not mutate its input');

// Adding garbage rows.
let g = blank(); g[V.ROWS - 1][0] = 3;
let r = V.addGarbage(g, 2, 4);
ok(!r.overflow, 'garbage into an empty top does not overflow');
ok(g[V.ROWS - 3][0] === 3, 'existing blocks move up');
ok(g[V.ROWS - 1][4] === 0 && g[V.ROWS - 1].filter(Boolean).length === 9 && g[V.ROWS - 1][0] === V.GARBAGE, 'garbage row has one hole');
ok(g.length === V.ROWS && g.every(row => row.length === V.COLS), 'grid keeps its size');
g = blank(); g[0][5] = 2;
ok(V.addGarbage(g, 1, 0).overflow, 'pushing blocks out of the top is an overflow');
g = blank(); V.addGarbage(g, 3, 99);
ok(g[V.ROWS - 1][V.COLS - 1] === 0, 'hole is clamped to the board');

// Board encoding for the 4 Hz mini boards.
g = blank(); g[V.ROWS - 1][2] = 5; g[V.HIDDEN][9] = 8; g[0][0] = 1; // hidden rows are not sent
const piece = { x: 3, y: V.HIDDEN, m: [[0, 3, 0], [3, 3, 3], [0, 0, 0]] };
const s = V.encode(g, piece);
ok(s.length === 200 && /^[0-8]+$/.test(s), 'encoding is 200 digits');
const d = V.decode(s);
ok(d[V.ROWS - V.HIDDEN - 1][2] === 5 && d[0][9] === 8, 'decode restores locked cells');
ok(d[0][4] === 3 && d[1][3] === 3 && d[1][5] === 3, 'falling piece is included');
ok(V.decode('').length === 20 && V.decode('x'.repeat(200))[0][0] === 0, 'bad input decodes to an empty board');

// Targets and standings.
ok(V.target('a', ['a', 'b'], () => 0.9) === 'b', '1v1 always targets the opponent');
ok(V.target('a', ['a'], Math.random) === null, 'no target when alone');
const seen = new Set(); for (let i = 0; i < 50; i++) seen.add(V.target('a', ['a', 'b', 'c', 'd']));
ok(seen.size === 3 && !seen.has('a'), 'free-for-all spreads garbage over the others');
ok(V.standings(['a', 'b', 'c'], ['b', 'a']).join() === 'c,a,b', 'last standing wins, last out is second');
ok(V.standings(['a', 'b'], ['a', 'b']).join() === 'b,a', 'if both go out, the later one ranks higher');

console.log(`${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
