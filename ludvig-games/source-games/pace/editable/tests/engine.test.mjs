import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const E = require('../../engine.js');

function type(run, text, start = 1000, interval = 100) {
  for (let i = 1; i <= text.length; i++) E.applyInput(run, text.slice(0, i), start + (i - 1) * interval);
  return run;
}

test('the clock does not start before a printable character, including time zero', () => {
  const run = E.createRun({ text: 'hello world', duration: 30 }, 0);
  E.tick(run, 900000);
  assert.equal(run.startedAt, null);
  assert.equal(run.finished, false);
  assert.equal(run.remaining, 30);
  E.applyInput(run, '\n', 0);
  assert.equal(run.startedAt, null);
  E.applyInput(run, 'h', 0);
  assert.equal(run.startedAt, 0);
  assert.equal(E.getStats(run, 0).wpm, 0);
  assert.equal(E.getStats(run, 1000).wpm, 12);
});

test('backspace and correction preserve historical error penalties and missed words', () => {
  const run = E.createRun({ text: 'cat dog', mode: 'accuracy' });
  type(run, 'cx', 1000);
  assert.equal(E.getStats(run, 1200).accuracy, 50);
  E.applyInput(run, 'c', 1300);
  assert.equal(E.getStats(run, 1400).accuracy, 50);
  E.applyInput(run, 'ca', 1500);
  E.applyInput(run, 'cat', 1600);
  E.applyInput(run, 'cat ', 1700);
  assert.equal(run.errors, 1);
  assert.equal(run.attempts, 5);
  assert.equal(E.getStats(run, 1700).accuracy, 80);
  assert.deepEqual(E.getStats(run, 1700).missedWords, ['cat']);
  assert.equal(E.getStats(run, 1700).perfectWords, 0);
  assert.equal(E.getStats(run, 1700).completedWords, 1);
});

test('retyping correct progress cannot farm points or XP', () => {
  const clean = E.createRun({ text: 'cat dog' });
  const retry = E.createRun({ text: 'cat dog' });
  type(clean, 'cat ', 1000);
  type(retry, 'cat ', 1000);
  const points = E.getStats(retry, 1600).points;
  E.applyInput(retry, '', 1700);
  type(retry, 'cat ', 2000);
  assert.equal(E.getStats(retry, 2500).points, points);
  assert.equal(E.getStats(retry, 2500).completedWords, 1);
  const cleanResult = E.finish(clean, 3000, 'time');
  const retryResult = E.finish(retry, 3000, 'time');
  assert.equal(retryResult.xp, cleanResult.xp);
  assert.equal(retryResult.points, cleanResult.points);
});

test('a completed word can lose perfect status after a later error', () => {
  const run = E.createRun({ text: 'cat dog', mode: 'accuracy' });
  type(run, 'cat ', 1000);
  assert.equal(E.getStats(run, 1500).perfectWords, 1);
  E.applyInput(run, 'c', 1600);
  E.applyInput(run, 'cx', 1700);
  assert.equal(E.getStats(run, 1800).perfectWords, 0);
});

test('timeout clamps elapsed and refuses input after the deadline', () => {
  const run = E.createRun({ text: 'hello world', duration: 3, runId: 'deadline-test' });
  E.applyInput(run, 'h', 1000);
  E.applyInput(run, 'he', 2000);
  const event = E.applyInput(run, 'hel', 4001);
  assert.equal(event.accepted, false);
  assert.equal(event.finished, true);
  assert.equal(run.value, 'he');
  assert.equal(run.result.elapsed, 3);
  assert.equal(run.result.reason, 'time');
  assert.equal(run.result.runId, 'deadline-test');
  assert.equal(run.result.wpm, 8);
  assert.equal(E.finish(run, 9000, 'complete'), run.result);
});

test('accuracy mode ignores timers and requires all mistakes to be corrected', () => {
  const run = E.createRun({ text: 'cat', duration: 1, mode: 'accuracy' });
  type(run, 'cxt', 1000);
  E.tick(run, 90000);
  assert.equal(run.finished, false);
  assert.equal(run.duration, null);
  E.applyInput(run, 'cat', 91000);
  assert.equal(run.finished, true);
  assert.equal(run.result.reason, 'complete');
  assert.equal(run.result.correctChars, 3);
  assert.equal(run.result.accuracy, 75);
  assert.equal(run.result.perfectWords, 0);
});

test('a timed passage can finish with errors and retains imperfect accuracy', () => {
  const run = E.createRun({ text: 'cat', mode: 'sprint' });
  type(run, 'cxt', 1000);
  assert.equal(run.finished, true);
  assert.equal(run.result.completed, true);
  assert.equal(run.result.correctChars, 2);
  assert.ok(run.result.accuracy < 100);
});

test('multi-character insertions and replacements count only inserted attempts', () => {
  const run = E.createRun({ text: 'the cat', mode: 'accuracy' });
  E.applyInput(run, 'teh', 1000);
  assert.equal(run.attempts, 3);
  assert.equal(run.errors, 2);
  E.applyInput(run, 'the', 2000);
  assert.equal(run.attempts, 5);
  assert.equal(run.correctAttempts, 3);
  assert.deepEqual(E.getStats(run, 2500).missedWords, ['the']);
  assert.equal(E.getStats(run, 2500).correctChars, 3);
});

test('replacing an earlier typo preserves the unchanged suffix and its attempt count', () => {
  const run = E.createRun({ text: 'cat dog', mode: 'accuracy' });
  E.applyInput(run, 'cxt do', 1000);
  const response = E.applyInput(run, 'cat do', 2000);
  assert.equal(response.correct, 1);
  assert.equal(response.wrong, 0);
  assert.equal(run.attempts, 7);
  assert.equal(run.errors, 1);
  assert.equal(run.value, 'cat do');
  assert.equal(E.getStats(run, 2000).correctChars, 6);
});

test('an error on a word separator belongs to the preceding word', () => {
  const run = E.createRun({ text: 'cat dog', mode: 'accuracy' });
  E.applyInput(run, 'catx', 1000);
  assert.deepEqual(E.getStats(run, 1500).missedWords, ['cat']);
  E.applyInput(run, 'cat', 2000);
  const response = E.applyInput(run, 'cat ', 2100);
  assert.equal(response.completedWords, 1);
  assert.equal(E.getStats(run, 2200).perfectWords, 0);
  assert.equal(run.errors, 1);
});

test('deleting a completed prefix preserves earned rewards but removes retained WPM characters', () => {
  const run = E.createRun({ text: 'cat dog', mode: 'accuracy' });
  type(run, 'cat ', 1000);
  const earned = E.getStats(run, 1500);
  E.applyInput(run, '', 2000);
  const deleted = E.getStats(run, 2500);
  assert.equal(deleted.correctChars, 0);
  assert.equal(deleted.wpm, 0);
  assert.equal(deleted.perfectWords, 1);
  assert.equal(deleted.points, earned.points);
  assert.equal(deleted.attempts, earned.attempts);
  assert.equal(deleted.accuracy, earned.accuracy);
});

test('one committed multi-character composition receives the same attempt accounting as typing', () => {
  const batched = E.createRun({ text: 'hello world', mode: 'accuracy' });
  const typed = E.createRun({ text: 'hello world', mode: 'accuracy' });
  E.applyInput(batched, 'hello ', 1000);
  type(typed, 'hello ', 1000);
  const a = E.getStats(batched, 2000);
  const b = E.getStats(typed, 2000);
  for (const key of ['attempts', 'errors', 'correctChars', 'accuracy', 'points', 'perfectWords']) {
    assert.equal(a[key], b[key], key);
  }
});

test('combo rewards are awarded once and deletion breaks the streak', () => {
  const text = 'abcdefghijklmnopqrstuvwxyz abcdefghijklmnopqrstuvwxyz';
  const run = E.createRun({ text });
  const first = E.applyInput(run, text.slice(0, 25), 1000);
  assert.equal(first.comboMilestone, 25);
  const initialPoints = E.getStats(run, 1000).points;
  E.applyInput(run, '', 2000);
  assert.equal(run.combo, 0);
  const repeat = E.applyInput(run, text.slice(0, 25), 3000);
  assert.equal(repeat.comboMilestone, null);
  assert.equal(E.getStats(run, 3000).points, initialPoints);
  E.applyInput(run, text.slice(0, 25) + 'x', 4000);
  assert.equal(run.combo, 0);
  assert.equal(run.bestCombo, 25);
});

test('untimed lesson configuration and explicit abort earn no XP', () => {
  const run = E.createRun({ text: 'practice makes progress', mode: 'lesson', duration: null, levelId: 2 });
  type(run, 'practice ', 1000);
  assert.equal(E.tick(run, 900000).finished, false);
  const result = E.finish(run, 900001, 'abort');
  assert.equal(result.xp, 0);
  assert.equal(result.completed, false);
  assert.equal(result.levelId, 2);
});

test('finish without input and zero-time input remain finite', () => {
  const empty = E.createRun({ text: 'cat' });
  const result = E.finish(empty, 0, 'abort');
  assert.equal(result.wpm, 0);
  assert.equal(result.xp, 0);
  assert.equal(result.elapsed, 0);
  const immediate = E.createRun({ text: 'cat' });
  E.applyInput(immediate, 'cat', 0);
  assert.equal(immediate.result.wpm, 0);
  assert.ok(Number.isFinite(immediate.result.accuracy));
});

test('streaks use calendar days, deduplicate, and keep yesterday active', () => {
  const days = ['2026-10-28', '2026-10-27', '2026-10-27', '2026-10-26'];
  assert.equal(E.getStreak(days, '2026-10-29'), 3);
  assert.equal(E.getStreak([...days, '2026-10-29'], '2026-10-29'), 4);
  assert.equal(E.getStreak(days, '2026-10-30'), 0);
  assert.equal(E.getStreak(['2026-10-29', '2026-10-27'], '2026-10-29'), 1);
  assert.equal(E.getStreak(['2026-11-01', 'bad', '2026-02-30'], '2026-10-29'), 0);
  assert.equal(E.shiftDateKey('2024-03-01', -1), '2024-02-29');
  assert.equal(E.shiftDateKey('2026-01-01', -1), '2025-12-31');
});

test('local date keys respect Stockholm midnight instead of UTC midnight', () => {
  const previous = process.env.TZ;
  try {
    process.env.TZ = 'Europe/Stockholm';
    assert.equal(E.dateKey(new Date('2026-10-28T23:30:00.000Z')), '2026-10-29');
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});

test('player level thresholds are stable at exact XP boundaries', () => {
  assert.equal(E.getLevel(-20).level, 1);
  assert.equal(E.getLevel(249).level, 1);
  assert.equal(E.getLevel(250).level, 2);
  assert.equal(E.getLevel(250).xpIntoLevel, 0);
  assert.equal(E.getLevel(375).progress, 0.5);
  assert.equal(E.getLevel(Infinity).level, 1);
});
