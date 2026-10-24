// Run: node source-games/six-clues/tests/smoke.mjs
// Runs index.html's real script against a tiny stub DOM (no browser): a daily win, a practice loss,
// language switch, and checks localStorage state and leaderboard calls.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');

function el(id) {
  const e = {
    id, innerHTML: '', textContent: '', value: '', hidden: false, dataset: {}, style: {}, open: false, children: [],
    attrs: {}, listeners: {},
    classList: { set: new Set(), add(c) { this.set.add(c); }, remove(c) { this.set.delete(c); }, toggle(c, on) { on ? this.set.add(c) : this.set.delete(c); }, contains(c) { return this.set.has(c); } },
    setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k]; }, removeAttribute(k) { delete this.attrs[k]; },
    addEventListener(t, f) { (this.listeners[t] ||= []).push(f); },
    fire(t, ev = {}) { (this.listeners[t] || []).forEach(f => f({ preventDefault() {}, target: e, key: '', ...ev })); },
    querySelectorAll() { return []; }, querySelector() { return { onclick: null }; },
    scrollIntoView() {}, focus() {}, select() {}, remove() {}, close() { this.open = false; }, showModal() { this.open = true; },
    get offsetWidth() { return 1; }
  };
  return e;
}
const els = {};
const langButtons = ['en', 'sv'].map(l => { const b = el('lang-' + l); b.dataset.lang = l; return b; });
const storage = new Map();
const scores = [];
const ctx = {
  console, Intl, Date, Math, JSON, Promise, String, Number, Array, Object, Map, Set, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0,
  navigator: { language: 'sv-SE' },
  localStorage: { getItem: k => storage.has(k) ? storage.get(k) : null, setItem: (k, v) => storage.set(k, String(v)) },
  matchMedia: () => ({ matches: false }),
  document: {
    documentElement: { lang: '' }, body: { appendChild() {} }, hidden: false,
    getElementById: id => (els[id] ||= el(id)),
    querySelectorAll: sel => sel === '.lang button' ? langButtons : [],
    addEventListener() {}, createElement: () => el('x'), execCommand: () => true
  },
  getComputedStyle: () => ({ getPropertyValue: () => '#000' }),
  requestAnimationFrame() {}, performance: { now: () => 0 }, innerWidth: 400, innerHeight: 800,
  scrollTo() {},
  Ludvig: { score: (b, v) => { scores.push([b, v]); return Promise.resolve({ ok: true }); } }
};
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(dir, 'countries.js'), 'utf8'), ctx);
vm.runInContext(inline, ctx, { filename: 'index.html' });

const S = ctx.SixClues;
const fail = m => { console.error('FAIL', m); process.exitCode = 1; };
const $ = id => els[id];
const n = S.puzzleNumber();
const answer = S.countryForPuzzle(n);

if ($('tabDaily').textContent !== 'Idag #' + n) fail('Swedish auto-detected: ' + $('tabDaily').textContent);
if (!$('dlgHelp').open) fail('help opens on first visit');
if (!$('clues').innerHTML.includes('Kuriosa')) fail('first clue shown in Swedish');

// Wrong guess, skip, then the right answer.
const wrong = S.countries.find(c => c.iso !== answer.iso);
const guess = v => { $('guess').value = v; $('form').fire('submit'); };
guess(S.name(wrong, 'sv'));
if (!$('clues').innerHTML.includes('</svg>' + S.name(wrong, 'sv'))) fail('wrong guess chip');
$('btnSkip').onclick();
guess('zzzz'); // not a country: nothing happens
guess(answer.en); // English name works in Swedish UI
const saved = JSON.parse(storage.get('six-clues.v1'));
const day = saved.days[n];
if (day.status !== 'won' || day.guesses.length !== 3) fail('daily won with 3 clues: ' + JSON.stringify(day));
if (!day.submitted) fail('submitted flag');
if (saved.stats.streak !== 1 || saved.stats.hist[3] !== 1) fail('stats recorded');
if (JSON.stringify(scores) !== JSON.stringify([['six-clues', 3], ['six-clues:streak', 1]])) fail('scores ' + JSON.stringify(scores));
if ($('result').hidden || !$('result').innerHTML.includes(S.name(answer, 'sv'))) fail('result card shows answer');
if (!$('dock').hidden) fail('input hidden after finishing');

// Language switch re-renders in English.
langButtons[0].onclick();
if (!$('result').innerHTML.includes('Solved with 3 clues')) fail('English result text');

// Practice: six skips lose, stats unchanged, no extra scores.
$('tabPractice').onclick();
for (let i = 0; i < 6; i++) $('btnSkip').onclick();
$('btnSkip').onclick(); // confirm give up
const after = JSON.parse(storage.get('six-clues.v1'));
if (after.practice.status !== 'lost') fail('practice lost: ' + after.practice.status);
if (after.stats.played !== 1) fail('practice must not touch stats');
if (scores.length !== 2) fail('practice must not submit scores');
$('btnAnother').onclick();
if (JSON.parse(storage.get('six-clues.v1')).practice.status !== 'playing') fail('another practice round');

// Stats and archive dialogs render.
$('btnStats').onclick(); if (!$('statsBody').innerHTML.includes('Played')) fail('stats dialog');
$('btnArchive').onclick(); if (!$('archiveBody').innerHTML.includes('#' + n)) fail('archive dialog');

// Without ludvig.js the game still runs.
delete ctx.Ludvig; delete ctx.window.Ludvig;
if (!process.exitCode) console.log('Smoke test passed: daily win, scores, language switch, practice, dialogs.');
