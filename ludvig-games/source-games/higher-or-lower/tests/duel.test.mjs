// Run: node source-games/higher-or-lower/tests/duel.test.mjs
// Duel rules (pairs from a seed, points, standings) plus a parse check of every script in the game.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let fails = 0, passes = 0;
const ok = (c, m) => { if (c) passes++; else { fails++; console.error('FAIL', m); } };

const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
inline.forEach((code, i) => { try { new vm.Script(code, { filename: `inline-${i}.js` }); passes++; } catch (e) { fails++; console.error('FAIL parse inline', i, e.message); } });
const duelSrc = fs.readFileSync(path.join(dir, 'duel.js'), 'utf8');
try { new vm.Script(duelSrc, { filename: 'duel.js' }); passes++; } catch (e) { fails++; console.error('FAIL parse duel.js', e.message); }
ok(html.indexOf('<script src="duel.js"></script>') > 0, 'index.html loads duel.js');

const ctx = vm.createContext({ Math, Object, Array, Set, Map, String, Number, JSON });
vm.runInContext(inline.find(c => c.includes('const DATA')), ctx, { filename: 'data.js' });
vm.runInContext(duelSrc, ctx, { filename: 'duel.js' });
const R = ctx.HLDuelRules, DATA = vm.runInContext('DATA', ctx);
ok(R && typeof R.pairs === 'function', 'rules exported without a DOM');

for (const cat of ['mix', 'searches', 'followers', 'salaries', 'prices']) {
  for (const seed of [1, 42, 0xdeadbeef, 123456789]) {
    const a = R.pairs(DATA, cat, seed), b = R.pairs(DATA, cat, seed);
    ok(a.length === R.ROUNDS, `${cat}/${seed}: ten pairs`);
    ok(JSON.stringify(a.map(p => [p.cat, p.left.id, p.right.id])) === JSON.stringify(b.map(p => [p.cat, p.left.id, p.right.id])), `${cat}/${seed}: same seed, same pairs`);
    ok(a.every(p => p.left.id !== p.right.id && p.left.value !== p.right.value), `${cat}/${seed}: no identical or equal pairs`);
    ok(new Set(a.map(p => p.cat + [p.left.id, p.right.id].sort())).size === a.length, `${cat}/${seed}: no repeated pair`);
    if (cat !== 'mix') ok(a.every(p => p.cat === cat), `${cat}/${seed}: one category`);
    else ok(new Set(a.map(p => p.cat)).size === 4, `mix/${seed}: all four categories`);
  }
}
const s1 = JSON.stringify(R.pairs(DATA, 'mix', 1).map(p => p.left.id)), s2 = JSON.stringify(R.pairs(DATA, 'mix', 2).map(p => p.left.id));
ok(s1 !== s2, 'different seeds give different games');

const p = R.pairs(DATA, 'searches', 7)[0];
const higher = p.left.value > p.right.value ? 'left' : 'right';
ok(R.correct(p, higher) === true && R.correct(p, higher === 'left' ? 'right' : 'left') === false, 'correct() picks the higher card');
ok(R.points(false, 100) === 0, 'wrong answer scores 0');
ok(R.points(true, 0) === 1000, 'instant correct answer scores 1000');
ok(R.points(true, R.ANSWER_MS) === 500, 'last-moment correct answer scores 500');
ok(R.points(true, 99999) === 500 && R.points(true, -5) === 1000, 'points are clamped');
ok(R.points(true, 2000) > R.points(true, 6000), 'faster scores more');

const st = R.standings(['a', 'b', 'c', 'd'], { a: 'Ada', b: 'Bo', c: 'Cy', d: 'Di' }, { a: 900, b: 1500, c: 900 });
ok(st[0].id === 'b' && st[0].rank === 1, 'highest score ranks first');
ok(st[1].rank === 2 && st[2].rank === 2, 'ties share a rank');
ok(st[3].id === 'd' && st[3].rank === 4 && st[3].score === 0, 'missing scores count as 0');

console.log(`${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
