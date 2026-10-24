// Run: node source-games/six-clues/tests/friends.test.mjs
// League and Race rules (no spoilers before you finish, merging, week summary, race countries) plus parse checks.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let fails = 0, passes = 0;
const ok = (c, m) => { if (c) passes++; else { fails++; console.error('FAIL', m); } };

const src = fs.readFileSync(path.join(dir, 'friends.js'), 'utf8');
try { new vm.Script(src, { filename: 'friends.js' }); passes++; } catch (e) { fails++; console.error('FAIL parse friends.js', e.message); }
const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
ok(/<script src="countries.js"><\/script>\s*<script src="friends.js"><\/script>/.test(html), 'index.html loads friends.js after countries.js');

const ctx = vm.createContext({ Math, Object, Array, Set, Map, String, Number, JSON });
vm.runInContext(fs.readFileSync(path.join(dir, 'countries.js'), 'utf8'), ctx);
vm.runInContext(src, ctx, { filename: 'friends.js' });
const R = ctx.SixFriendsRules, S = ctx.SixClues;
ok(R && !ctx.SixFriends, 'rules load without a DOM, UI does not');

// Codes.
for (let i = 0; i < 50; i++) ok(R.cleanCode(R.makeCode()) !== null, 'generated codes are valid');
ok(R.cleanCode(' abc234 ') === 'ABC234', 'codes are trimmed and upper-cased');
ok(R.cleanCode('ABC10O') === null && R.cleanCode('ABC') === null, 'look-alike characters and short codes are refused');

// Merging results.
const today = 50, a = 'a'.repeat(12), b = 'b'.repeat(12), c = 'c'.repeat(12);
const res = {};
ok(R.merge(res, [[a, 'Ada', today, 3], [b, 'Bo', today - 1, 0], [c, 'Cy', today, 6]], today) === 3, 'valid entries merge');
ok(R.merge(res, [[a, 'Ada', today, 3]], today) === 0, 'repeats change nothing');
ok(R.merge(res, [['NOTHEX', 'X', today, 2], [a, 'A', today + 1, 2], [a, 'A', today - 20, 2], [a, 'A', today, 9], [a, 'A', today, 1.5], 'junk', [a]], today) === 0, 'bad entries are ignored');
ok(R.merge(res, 'nope', today) === 0, 'non-list input is ignored');
R.merge(res, [[a, '<b>Ada</b>', today - 2, 2]], today);
ok(!res[today - 2][a].n.includes('<'), 'names lose markup');

// No spoilers: today's results only go to members who finished today.
const before = R.outgoing(res, today, false), after = R.outgoing(res, today, true);
ok(before.every(e => e[2] !== today) && before.length === 2, 'nothing about today before the peer has finished');
ok(after.filter(e => e[2] === today).length === 2, 'today is shared once the peer has finished');
ok(after.every(e => e.length === 4 && !S.byIso[e[1]]), 'entries hold no country');
ok(JSON.stringify(after).length < 4000, 'payload stays small');
ok(R.chunks(Array.from({ length: 95 }, (_, i) => i), 40).map(x => x.length).join() === '40,40,15', 'long lists are chunked');

// Today and week rows.
const rows = R.todayRows(res, today, { [b]: 'Bo' });
ok(rows.map(r => r.m).join() === [a, c, b].join(), 'fewest clues first, not yet played last');
ok(rows[2].k === null, 'members without a result are "not yet"');
R.merge(res, [[a, 'Ada', today - 1, 4], [c, 'Cy', today - 3, 0]], today);
const week = R.weekRows(res, today, true), ada = week.find(w => w.m === a);
ok(ada.played === 3 && ada.solved === 3 && ada.avg === 3, 'week summary counts and averages');
ok(R.weekRows(res, today, false).find(w => w.m === a).played === 2, 'today stays out of the week until you finish');
R.merge(res, [[a, 'Old', today - 30 + 20, 2]], today);
R.prune(res, today);
ok(Object.keys(res).every(d => +d > today - 14), 'old days are pruned');

// Race.
const isos = S.countries.map(x => x.iso), daily = S.countryForPuzzle(today).iso;
let r = 1; const rand = () => (r = (r * 16807) % 2147483647) / 2147483647;
const picks = R.raceIsos(isos, rand, [daily]);
ok(picks.length === R.ROUNDS && new Set(picks).size === R.ROUNDS, 'five different race countries');
ok(!picks.includes(daily), 'the race never uses today’s country');
ok(R.cluesShown(0) === 1 && R.cluesShown(R.CLUE_MS - 1) === 1 && R.cluesShown(R.CLUE_MS) === 2 && R.cluesShown(1e9) === 6, 'a clue every 7 s, six at most');
ok(R.ROUND_MS > 5 * R.CLUE_MS, 'time to guess after the last clue');
ok(R.raceOver({ x: 3, y: 1 }, 1) && !R.raceOver({ x: 2, y: 2 }, 3) && R.raceOver({ x: 2, y: 2 }, 4), 'first to 3, or after round 5');
const st = R.standings(['x', 'y', 'z'], { x: 'X', y: 'Y', z: 'Z' }, { x: 2, y: 2 });
ok(st[0].rank === 1 && st[1].rank === 1 && st[2].rank === 3, 'race ties share first place');

console.log(`${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
