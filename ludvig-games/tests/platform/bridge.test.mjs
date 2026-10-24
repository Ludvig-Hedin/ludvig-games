import test from 'node:test';
import assert from 'node:assert/strict';
import { browser, flush } from './browser-fakes.mjs';

function setup(config, path = '/games/demo/', before) {
  const w = browser({ path });
  const sent = [];
  w.Ludvig = { score: (board, value) => { sent.push([board, value]); return Promise.resolve({ ok: true }); } };
  before?.(w);
  w.__LUDVIG_SCORES = config;
  w.run('score-bridge.js');
  return { w, sent, set: (key, value) => w.localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value)) };
}
const desc = { order: 'desc', min: 0, max: 100000, match: 'exact' };

test('waits until the best value is stable for 4 s, then submits once', t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1e9 });
  const { sent, set, w } = setup({ demo: { ...desc, key: 'best' } });
  for (let i = 1; i <= 10; i++) { set('best', String(i * 10)); t.mock.timers.tick(300); }
  assert.deepEqual(sent, []);
  t.mock.timers.tick(4000);
  assert.deepEqual(sent, [['demo', 100]]);
  assert.equal(w.localStorage.getItem('best'), '100', 'the game value is stored unchanged');
});

test('never more than one submit per board per 30 s', t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1e9 });
  const { sent, set } = setup({ demo: { ...desc, key: 'best' } });
  set('best', '5');
  t.mock.timers.tick(4000);
  set('best', '7');
  t.mock.timers.tick(5000);
  set('best', '9');
  t.mock.timers.tick(10000);
  assert.deepEqual(sent, [['demo', 5]]);
  t.mock.timers.tick(16000);
  assert.deepEqual(sent, [['demo', 5], ['demo', 9]]);
});

test('compares the value at path, split on dots only, and ignores other JSON changes', t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1e9 });
  const { sent, set } = setup({
    'demo:pop': { ...desc, key: 'popisland-best-v1', path: '0:normal.score' },
    'demo:lvl': { ...desc, key: 'nobrakes-v1', path: 'scores.0-0' },
  });
  set('popisland-best-v1', { '0:normal': { score: 40, at: 1 } });
  set('nobrakes-v1', { scores: { '0-0': 12, '0-1': 3 }, volume: 1 });
  t.mock.timers.tick(4000);
  assert.deepEqual(sent.sort(), [['demo:lvl', 12], ['demo:pop', 40]]);
  // Settings and other levels change, the tracked value does not: nothing is sent.
  t.mock.timers.tick(31000);
  set('popisland-best-v1', { '0:normal': { score: 40, at: 2 }, other: 1 });
  set('nobrakes-v1', { scores: { '0-0': 12, '0-1': 8 }, volume: 0.5 });
  t.mock.timers.tick(40000);
  assert.equal(sent.length, 2);
});

test('strips the game-storage prefix and handles ascending, zero and out-of-range values', t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1e9 });
  const { sent, set } = setup({
    demo: { order: 'asc', min: 1, max: 86400, key: 'best.time', match: 'exact' },
    'demo:score': { ...desc, key: 'score' },
  });
  set('ludvig-games:demo:best.time', '90');
  t.mock.timers.tick(1000);
  set('ludvig-games:demo:best.time', '75');
  t.mock.timers.tick(1000);
  set('ludvig-games:demo:best.time', '80'); // worse than pending 75: ignored
  set('score', '0');
  set('score', '999999');
  set('ludvig-games:other-game:score', '50'); // another game's scoped key is a different key
  t.mock.timers.tick(5000);
  assert.deepEqual(sent, [['demo', 75]], 'zero, out-of-range and other games are ignored');
});

test('a hidden page flushes; values blocked by the 30 s gap wait for the next visit', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1e9 });
  const first = setup({ demo: { ...desc, key: 'best' } });
  first.set('best', '10');
  first.w.document.visibilityState = 'hidden';
  first.w.fireDocument('visibilitychange');
  assert.deepEqual(first.sent, [['demo', 10]], 'sent immediately on hide');
  first.set('best', '20');
  first.w.fire('pagehide');
  assert.equal(first.sent.length, 1, 'within 30 s of the last submit');
  const state = first.w.localStorage.getItem('ludvig:bridge');
  // Next visit, same browser storage.
  const second = setup({ demo: { ...desc, key: 'best' } }, '/games/demo/', w => w.localStorage.setItem('ludvig:bridge', state));
  t.mock.timers.tick(4000);
  assert.deepEqual(second.sent, [], 'still inside the 30 s gap');
  t.mock.timers.tick(27000);
  assert.deepEqual(second.sent, [['demo', 20]]);
  await flush();
});

test('other games keep their pending entries in shared state', t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1e9 });
  const stored = JSON.stringify({ sent: {}, pending: { 'other:x': { value: 5, at: 1e9 } } });
  const { set, w } = setup({ demo: { ...desc, key: 'best' } }, '/games/demo/', b => b.localStorage.setItem('ludvig:bridge', stored));
  set('best', '3');
  const state = JSON.parse(w.localStorage.getItem('ludvig:bridge'));
  assert.deepEqual(state.pending['other:x'], { value: 5, at: 1e9 });
  assert.equal(state.pending.demo.value, 3);
});
