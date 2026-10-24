// Run: node source-games/six-clues/tests/check.mjs
// Validates data, daily puzzle maths, guess matching, game rules, and parse-checks index.html.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let failures = 0, passes = 0;
const ok = (cond, msg) => { if (cond) passes++; else { failures++; console.error('FAIL', msg); } };

function load() {
  const ctx = vm.createContext({ Intl, Date, Math, Map, Set, Object, String, Number, Array, JSON });
  vm.runInContext(fs.readFileSync(path.join(dir, 'countries.js'), 'utf8'), ctx, { filename: 'countries.js' });
  return ctx.SixClues;
}
const S = load();
const C = S.countries;

// ---------- data ----------
ok(C.length >= 180, `at least 180 countries (got ${C.length})`);
const isos = new Set();
for (const c of C) {
  ok(/^[a-z]{2}$/.test(c.iso), `${c.iso}: iso code`);
  ok(!isos.has(c.iso), `${c.iso}: duplicate iso`); isos.add(c.iso);
  ok(c.en && c.sv, `${c.iso}: names in both languages`);
  ok(S.REGIONS[c.region], `${c.iso}: region ${c.region}`);
  ok(c.pop > 0, `${c.iso}: population`);
  for (const n of c.nb) ok(S.byIso[n] && n !== c.iso, `${c.iso}: neighbour ${n} exists`);
  for (const lang of ['en', 'sv']) {
    const cl = S.clues(c, lang);
    ok(cl.length === 6, `${c.iso}/${lang}: six clues`);
    cl.forEach((t, i) => {
      ok(typeof t === 'string' && t.trim().length > 8, `${c.iso}/${lang}: clue ${i + 1} present`);
      ok(!/undefined|null|NaN/.test(t), `${c.iso}/${lang}: clue ${i + 1} clean: ${t}`);
      if (i === 5) return; // clue 6 may name neighbours, never the answer (checked below)
      // The answer's own names must not appear in its clues.
      const words = ' ' + S.normalize(t) + ' ';
      for (const nm of [c.en, c.sv]) {
        const n = S.normalize(nm);
        ok(!words.includes(' ' + n + ' '), `${c.iso}/${lang}: clue ${i + 1} reveals "${nm}": ${t}`);
      }
    });
    const c6 = ' ' + S.normalize(cl[5]) + ' ';
    ok(!c6.includes(' ' + S.normalize(S.name(c, lang)) + ' '), `${c.iso}/${lang}: clue 6 reveals name`);
  }
}
// Every name and alias points to exactly one country.
const owner = new Map();
for (const c of C) for (const k of c.keys) {
  ok(!owner.has(k) || owner.get(k) === c.iso, `name key "${k}" used by ${owner.get(k)} and ${c.iso}`);
  owner.set(k, c.iso);
}
// No two countries share identical clue text in the same slot (copy-paste guard), except flags that truly match.
for (const slot of ['fact', 'food', 'sight']) {
  const seen = new Map();
  for (const c of C) { const t = c[slot][0]; ok(!seen.has(t), `${slot} duplicated: ${seen.get(t)} and ${c.iso}`); seen.set(t, c.iso); }
}

// ---------- daily puzzle ----------
const at = iso => new Date(iso);
ok(S.puzzleNumber(at('2026-10-22T21:59:59Z')) === 1, 'before launch shows #1');
ok(S.puzzleNumber(at('2026-10-22T22:00:00Z')) === 1, 'launch day 00:00 Stockholm (CEST) is #1');
ok(S.puzzleNumber(at('2026-10-23T21:59:59Z')) === 1, '#1 lasts until 23:59:59 Stockholm');
ok(S.puzzleNumber(at('2026-10-23T22:00:00Z')) === 2, '#2 starts 00:00 Stockholm');
ok(S.puzzleNumber(at('2026-10-25T23:00:00Z')) === 4, 'after DST ends, midnight is 23:00Z');
ok(S.puzzleNumber(at('2026-10-25T22:59:59Z')) === 3, 'just before that midnight');
ok(S.puzzleNumber(at('2027-03-28T21:59:59Z')) === 157, 'DST start day still running');
ok(S.puzzleNumber(at('2027-03-28T22:00:00Z')) === 158, 'midnight after DST starts is 22:00Z');
ok(S.puzzleNumber(at('2026-12-03T12:00:00Z')) === 42, '#42 on 2026-12-03');
ok(S.msUntilNextPuzzle(at('2026-10-23T21:00:00Z')) === 3600000, 'countdown one hour before midnight');
ok(S.msUntilNextPuzzle(at('2026-10-25T21:00:00Z')) === 7200000, 'countdown across DST end (CET)');
ok(S.msUntilNextPuzzle(at('2026-10-24T22:30:00Z')) === 23.5 * 3600000 + 3600000, 'countdown on the 25-hour day');
ok(S.stockholmDate(S.dateForPuzzle(42)) === '2026-12-03', 'dateForPuzzle(42)');

const N = C.length;
const fresh = load();
for (let n = 1; n <= N * 3 + 5; n++) {
  ok(S.countryForPuzzle(n).iso === fresh.countryForPuzzle(n).iso, `puzzle ${n} stable across loads`);
}
for (let cyc = 0; cyc < 3; cyc++) {
  const order = S.orderForCycle(cyc);
  ok(new Set(order).size === N && order.length === N, `cycle ${cyc} is a permutation`);
}
let adj = 0;
for (let n = 2; n <= N * 3; n++) {
  const a = S.countryForPuzzle(n - 1).iso, b = S.countryForPuzzle(n).iso;
  if (S.related(a, b)) { adj++; console.error(`  related consecutive: #${n - 1} ${a} -> #${n} ${b}`); }
}
ok(adj === 0, `no neighbours or same-region countries on consecutive days (${adj} found)`);
const today = S.puzzleNumber(new Date());
ok(S.countryForPuzzle(today).iso !== S.countryForPuzzle(today + 1).iso, "today's and tomorrow's puzzles differ");
ok(S.countryForPuzzle(today).iso === S.countryForPuzzle(today).iso, "today's puzzle repeatable");

// ---------- matching ----------
const expect = {
  'sweden': 'se', 'Sverige': 'se', '  SVERIGE ': 'se', "Côte d'Ivoire": 'ci', 'cote divoire': 'ci', 'Cote d Ivoire': 'ci',
  'elfenbenskusten': 'ci', 'ivory coast': 'ci', 'USA': 'us', 'U.S.A.': 'us', 'united states of america': 'us',
  'holland': 'nl', 'Nederländerna': 'nl', 'nederlanderna': 'nl', 'tjeckien': 'cz', 'czech republic': 'cz',
  'São Tomé and Príncipe': 'st', 'sao tome': 'st', 'St Kitts and Nevis': 'kn', 'saint kitts & nevis': 'kn',
  'Bosnien och Hercegovina': 'ba', 'bosnia & herzegovina': 'ba', 'bosnia and herzegovina': 'ba',
  'Türkiye': 'tr', 'turkiye': 'tr', 'Österrike': 'at', 'osterrike': 'at', 'Moçambique': 'mz', 'mocambique': 'mz',
  'mozambique': 'mz', 'burma': 'mm', 'drc': 'cd', 'Kongo-Kinshasa': 'cd', 'congo': 'cg', 'Kongo': 'cg',
  'Nya Zeeland': 'nz', 'newzealand': 'nz', 'UK': 'gb', 'Storbritannien': 'gb', 'england': 'gb',
  'Trinidad och Tobago': 'tt', 'trinidad and tobago': 'tt', 'Vatikanen': 'va', 'holy see': 'va',
  'swaziland': 'sz', 'east timor': 'tl', 'Östtimor': 'tl', 'cabo verde': 'cv', 'Kap Verde': 'cv',
  'north macedonia': 'mk', 'Förenade Arabemiraten': 'ae', 'uae': 'ae', 'Kirgizistan': 'kg', 'Island': 'is',
  'the gambia': 'gm', 'The Bahamas': 'bs', 'Saint Vincent och Grenadinerna': 'vc', 'guinea-bissau': 'gw', 'guinea bissau': 'gw',
};
for (const [input, iso] of Object.entries(expect)) {
  const m = S.match(input);
  ok(m && m.iso === iso, `match("${input}") -> ${iso} (got ${m && m.iso})`);
}
for (const bad of ['', '   ', 'atlantis', 'swe', 'greenland', 'taiwan']) ok(S.match(bad) === null, `no match for "${bad}"`);
ok(S.suggest('swe', 'en')[0].country.iso === 'se', 'suggest swe -> Sweden first');
ok(S.suggest('sver', 'sv')[0].country.iso === 'se', 'suggest sver -> Sverige first');
ok(S.suggest('guinea', 'en').length >= 3, 'suggest guinea lists several');
ok(S.suggest('niger', 'en')[0].country.iso === 'ne', 'suggest niger -> Niger before Nigeria');
ok(S.suggest('kongo', 'sv').some(s => s.country.iso === 'cd'), 'suggest kongo includes DR Congo');
ok(S.suggest('elfen', 'en')[0].country.iso === 'ci', 'Swedish name works in English UI');

// ---------- rules, share, streaks ----------
let r = S.newRound('se');
r = S.applyGuess(r, 'no').round; r = S.applyGuess(r, null).round;
ok(S.applyGuess(r, 'no').result === 'repeat', 'repeat guess ignored');
let res = S.applyGuess(r, 'se'); r = res.round;
ok(res.result === 'won' && r.guesses.length === 3, 'won with 3 clues');
ok(S.shareText(42, r) === 'Six Clues #42 3/6\n🟥🟥🟩⬜⬜⬜\nhttps://games.ludvighedin.com/six-clues/', 'share text');
let l = S.newRound('se');
for (const g of ['no', 'fi', 'dk', null, 'is', 'ee']) l = S.applyGuess(l, g).round;
ok(l.status === 'lost' && S.shareText(1, l).startsWith('Six Clues #1 X/6\n🟥🟥🟥🟥🟥🟥'), 'loss after six clues');
let st = S.emptyStats();
st = S.recordResult(st, 1, r); st = S.recordResult(st, 2, r); st = S.recordResult(st, 2, r);
ok(st.played === 2 && st.streak === 2 && st.maxStreak === 2 && st.hist[3] === 2, 'streak grows, same day counted once');
ok(S.currentStreak(st, 3) === 2 && S.currentStreak(st, 4) === 0, 'streak shown only if unbroken');
st = S.recordResult(st, 3, l);
ok(st.streak === 0 && st.maxStreak === 2 && st.hist[0] === 1, 'loss resets streak');
st = S.recordResult(st, 5, r);
ok(st.streak === 1, 'gap restarts streak at 1');

// ---------- index.html parse check ----------
const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
ok(scripts.length > 0, 'index.html has inline script');
scripts.forEach((code, i) => { try { new vm.Script(code, { filename: `index.html#${i}` }); ok(true); } catch (e) { ok(false, `index.html script ${i}: ${e.message}`); } });
ok(/<script src="\/assets\/ludvig\.js"/.test(html), 'loads /assets/ludvig.js');
ok(html.indexOf('/assets/ludvig.js') < html.indexOf('</head>'), 'ludvig.js in head');
ok(/Ludvig\.score\('six-clues', /.test(html) && /Ludvig\.score\('six-clues:streak', /.test(html), 'submits both boards');

console.log(`${C.length} countries, today #${today}. ${passes} checks passed, ${failures} failed.`);
process.exit(failures ? 1 : 0);
