import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createStore, key } = require('../../progress.js');

function memory(initial = {}) {
  const data = new Map(Object.entries(initial));
  return { getItem: name => data.get(name) || null, setItem: (name, value) => data.set(name, value), data };
}
const date = new Date(2026, 9, 29, 12);
function result(overrides = {}) {
  return { id: 'run-1', reason: 'time', attempts: 150, errors: 3, accuracy: 98, wpm: 45, elapsed: 30,
    correctChars: 145, points: 500, bestCombo: 75, perfectWords: 20, missedWords: ['Separate,', 'receive'], xp: 50, ...overrides };
}
function config(overrides = {}) { return { runId: 'run-1', mode: 'sprint', difficulty: 'easy', duration: 30, device: 'desktop', ...overrides }; }

test('new profile has sensible settings, snapshots cannot mutate saved state', () => {
  const store = createStore(memory());
  const snapshot = store.get();
  assert.deepEqual(snapshot.settings, { sound: false, motion: true, difficulty: 'easy', duration: 60, mode: 'sprint' });
  snapshot.xp = 999;
  snapshot.days.push('2026-10-29');
  assert.equal(store.get().xp, 0);
  assert.equal(store.get().days.length, 0);
  assert.equal(store.available, true);
});

test('qualifying round records rewards, normalized mistake words, device and date once', () => {
  const storage = memory(), store = createStore(storage);
  const first = store.record(result(), config(), date);
  assert.equal(first.saved, true);
  assert.equal(first.xpEarned, 50);
  assert.equal(first.streak, 1);
  assert.equal(first.state.history[0].device, 'desktop');
  assert.deepEqual(first.state.missedWords, { separate: 1, receive: 1 });
  assert.equal(first.state.days[0], '2026-10-29');
  const duplicate = store.record(result(), config(), date);
  assert.equal(duplicate.saved, false);
  assert.equal(duplicate.reason, 'duplicate');
  assert.equal(store.get().xp, 50);
  assert.equal(store.get().history.length, 1);
  const reloaded = createStore(storage);
  assert.equal(reloaded.record(result(), config(), date).saved, false);
});

test('abort, tiny or anonymous rounds cannot create XP, days or daily goal credit', () => {
  const store = createStore(memory());
  for (const run of [result({ reason: 'abort' }), result({ attempts: 9 }), result({ elapsed: 4.99 }), result({ id: undefined })]) {
    const saved = store.record(run, config({ runId: undefined }), date);
    assert.equal(saved.saved, false);
  }
  assert.equal(store.get().xp, 0);
  assert.deepEqual(store.get().days, []);
  assert.deepEqual(store.get().history, []);
});

test('daily bonus is granted once per local calendar date; new day earns it again', () => {
  const store = createStore(memory());
  const first = store.record(result(), config({ mode: 'daily' }), date);
  assert.equal(first.dailyFirst, true);
  assert.equal(first.xpEarned, 90);
  const second = store.record(result(), config({ runId: 'run-2', mode: 'daily' }), date);
  assert.equal(second.dailyFirst, false);
  assert.equal(second.xpEarned, 50);
  const third = store.record(result(), config({ runId: 'run-3', mode: 'daily' }), new Date(2026, 9, 30, 0, 1));
  assert.equal(third.dailyFirst, true);
  assert.equal(third.streak, 2);
  assert.equal(third.state.dailyResults['2026-10-29'].attempts, 2);
});

test('lesson only passes when speed and accuracy targets occur in one completed passage', () => {
  const store = createStore(memory());
  const lessonConfig = { mode: 'lesson', levelId: 1, targetWpm: 40, targetAccuracy: 95, completed: true };
  const incomplete = store.record(result({ reason: 'time' }), config(lessonConfig), date);
  assert.equal(incomplete.completedLesson, false);
  const tooInaccurate = store.record(result({ reason: 'complete', accuracy: 90, wpm: 60 }), config({ ...lessonConfig, runId: 'run-2' }), date);
  assert.equal(tooInaccurate.completedLesson, false);
  const tooSlow = store.record(result({ reason: 'complete', accuracy: 100, wpm: 30 }), config({ ...lessonConfig, runId: 'run-3' }), date);
  assert.equal(tooSlow.completedLesson, false);
  const passes = store.record(result({ reason: 'complete', accuracy: 97, wpm: 45 }), config({ ...lessonConfig, runId: 'run-4' }), date);
  assert.equal(passes.completedLesson, true);
  assert.equal(passes.state.lessons['1'].completed, true);
  assert.equal(passes.state.lessons['1'].bestWpm, 60);
  const repeat = store.record(result({ reason: 'complete' }), config({ ...lessonConfig, runId: 'run-5' }), date);
  assert.equal(repeat.completedLesson, false);
});

test('corrupt storage and denied access recover without crashing or fabricating saved state', () => {
  const corrupt = createStore(memory({ [key]: '{broken' }));
  assert.equal(corrupt.get().xp, 0);
  assert.match(corrupt.storageError, /could not be read/);
  assert.equal(corrupt.record(result(), config(), date).saved, true);
  assert.equal(corrupt.storageError, null);
  const denied = createStore({ getItem() { throw new Error('Denied'); }, setItem() { throw new Error('Denied'); } });
  assert.equal(denied.available, false);
  const response = denied.record(result(), config(), date);
  assert.equal(response.saved, true);
  assert.equal(response.persisted, false);
  assert.equal(denied.get().xp, 50);
  assert.match(denied.storageError, /only saved in this tab/);
  const none = createStore(null);
  assert.equal(none.available, false);
  assert.equal(none.record(result(), config(), date).persisted, false);
});

test('export/import preserves progress; invalid imports leave current progress intact', () => {
  const first = createStore(memory());
  first.record(result(), config({ device: 'mobile' }), date);
  first.settings({ sound: true, difficulty: 'hard', duration: 120 });
  const second = createStore(memory());
  assert.equal(second.importData(first.exportData()).ok, true);
  assert.equal(second.get().xp, 50);
  assert.equal(second.get().history[0].device, 'mobile');
  assert.equal(second.get().settings.sound, true);
  assert.equal(second.importData('{bad').ok, false);
  assert.equal(second.importData(JSON.stringify({ v: 2 })).ok, false);
  assert.equal(second.importData(JSON.stringify({ v: 1, xp: 1, days: ['2026-02-30'], history: [] })).ok, false);
  assert.equal(second.get().xp, 50);
  assert.equal(second.record(result(), config(), date).reason, 'duplicate');
});

test('settings whitelist and imported dictionaries cannot introduce prototype keys', () => {
  const store = createStore(memory());
  assert.deepEqual(store.settings({ sound: 'yes', duration: -1, difficulty: 'impossible', mode: 'other' }), store.get().settings);
  const data = JSON.parse(store.exportData());
  data.missedWords = JSON.parse('{"__proto__":10,"constructor":2,"receive":4}');
  data.lessons = JSON.parse('{"__proto__":{"completed":true}}');
  assert.equal(store.importData(JSON.stringify(data)).ok, true);
  assert.equal(Object.prototype.completed, undefined);
  assert.deepEqual(Object.keys(store.get().lessons), []);
  assert.equal(store.get().missedWords.receive, 4);
});

test('history is bounded while previous IDs remain deduplicated', () => {
  const store = createStore(memory());
  for (let i = 0; i < 205; i++) store.record(result(), config({ runId: `run-${i}` }), date);
  assert.equal(store.get().history.length, 200);
  assert.equal(store.get().recordedIds.length, 205);
  assert.equal(store.record(result(), config({ runId: 'run-0' }), date).reason, 'duplicate');
});

test('XP is bounded by practice time and cannot be granted to zero correct characters', () => {
  const store = createStore(memory());
  const inflated = store.record(result({ xp: 1000000, elapsed: 5 }), config(), date);
  assert.equal(inflated.xpEarned, 20);
  const empty = store.record(result({ correctChars: 0 }), config({ runId: 'empty', mode: 'daily' }), date);
  assert.equal(empty.xpEarned, 0);
  assert.equal(empty.dailyFirst, false);
});

test('stale tabs retain other tabs progress when saving settings or recording rounds', () => {
  const storage = memory();
  const tabA = createStore(storage), tabB = createStore(storage);
  tabA.record(result(), config(), date);
  tabB.settings({ sound: true });
  let reloaded = createStore(storage).get();
  assert.equal(reloaded.xp, 50);
  assert.equal(reloaded.history.length, 1);
  assert.equal(reloaded.settings.sound, true);
  tabB.record(result(), config({ runId: 'run-2' }), date);
  tabA.record(result(), config({ runId: 'run-3' }), date);
  reloaded = createStore(storage).get();
  assert.equal(reloaded.xp, 150);
  assert.deepEqual(reloaded.history.map(item => item.id), ['run-3', 'run-2', 'run-1']);
  assert.equal(tabB.get().xp, 150);
  assert.equal(JSON.parse(tabB.exportData()).xp, 150);
  assert.equal(tabB.record(result(), config({ runId: 'run-3' }), date).reason, 'duplicate');
});

test('fresh reads never discard newer in-memory progress after a failed write', () => {
  const backing = memory();
  let denyWrites = true;
  const storage = { getItem: backing.getItem, setItem(name, value) { if (denyWrites) throw new Error('Quota'); backing.setItem(name, value); } };
  const store = createStore(storage);
  assert.equal(store.record(result(), config(), date).persisted, false);
  assert.equal(store.get().xp, 50);
  assert.equal(JSON.parse(store.exportData()).xp, 50);
  assert.equal(backing.getItem(key), null);
  denyWrites = false;
  store.record(result(), config({ runId: 'run-2' }), date);
  assert.equal(store.available, true);
  assert.equal(createStore(backing).get().xp, 100);
});

test('daily passage date keeps its own bonus across midnight while practice counts on finish day', () => {
  const store = createStore(memory());
  const midnight = new Date(2026, 9, 30, 0, 1);
  const previousChallenge = store.record(result(), config({ mode: 'daily', dailyDate: '2026-10-29' }), midnight);
  assert.equal(previousChallenge.dailyFirst, true);
  assert.deepEqual(previousChallenge.state.days, ['2026-10-30']);
  assert.equal(previousChallenge.state.history[0].date, '2026-10-30');
  assert.equal(previousChallenge.state.history[0].dailyDate, '2026-10-29');
  assert.equal(previousChallenge.state.dailyResults['2026-10-29'].bonusClaimed, true);
  assert.equal(previousChallenge.state.dailyResults['2026-10-30'], undefined);
  const repeat = store.record(result(), config({ runId: 'repeat', mode: 'daily', dailyDate: '2026-10-29' }), midnight);
  assert.equal(repeat.dailyFirst, false);
  const current = store.record(result(), config({ runId: 'current', mode: 'daily', dailyDate: '2026-10-30' }), midnight);
  assert.equal(current.dailyFirst, true);
  assert.equal(current.state.dailyResults['2026-10-30'].bonusClaimed, true);
  assert.equal(current.state.history.length, 3);
});
