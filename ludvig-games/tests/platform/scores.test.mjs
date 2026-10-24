import test from 'node:test';
import assert from 'node:assert/strict';
import { fakeD1 } from './d1-fake.mjs';
import { cleanName, isBlockedName, validPlayerId, publicId } from '../../worker/util.mjs';
import { MAX_ROWS_PER_PLAYER, RANK_SCAN, prune, rankOf, rankRows, records, rename, since, standing, submit, top, validateSubmission } from '../../worker/scores.mjs';

const DAY = 864e5;
const NOW = Date.UTC(2026, 9, 22, 12);
const BOARDS = {
  pigeon: { order: 'desc', format: 'int', min: 0, max: 1000 },
  jailbreak: { order: 'asc', format: 'time-s', min: 1, max: 86400 },
  'flappy-first-person:chill': { order: 'desc', format: 'int', min: 0, max: 100000 },
};
const id = n => `player${String(n).padStart(16, '0')}`;

async function add(db, game, player, score, at, name = `Name ${player.slice(-2)}`) {
  const check = validateSubmission({ game, player, name, score }, BOARDS);
  assert.ok(check.value, JSON.stringify(check));
  return submit(db, check.value, at);
}

test('names are cleaned, bounded and blocklisted', () => {
  assert.equal(cleanName('  Brave   Pigeon 42 '), 'Brave Pigeon 42');
  assert.equal(cleanName('<b>Bo</b>'), 'bBo/b');
  assert.equal(cleanName('a\u0000b​c'), 'abc');
  assert.equal(cleanName('x'), null);
  assert.equal(cleanName('seventeen chars!!'), null);
  assert.equal(cleanName('Åsa Öberg'), 'Åsa Öberg');
  assert.equal(cleanName(42), null);
  assert.ok(isBlockedName('FuCk you'));
  assert.ok(isBlockedName('sh1t'));
  assert.ok(isBlockedName('n4zi'));
  assert.equal(cleanName('Peacock'), 'Peacock');
  assert.equal(cleanName('Grape Ape'), 'Grape Ape');
});

test('submissions are validated against the board config', () => {
  const base = { game: 'pigeon', player: id(1), name: 'Bo', score: 10 };
  assert.ok(validateSubmission(base, BOARDS).value);
  assert.equal(validateSubmission({ ...base, game: 'nope' }, BOARDS).error, 'unknown-game');
  assert.equal(validateSubmission({ ...base, game: '__proto__' }, BOARDS).error, 'unknown-game');
  assert.equal(validateSubmission({ ...base, game: 'constructor' }, BOARDS).error, 'unknown-game');
  assert.equal(validateSubmission({ ...base, player: 'short' }, BOARDS).error, 'bad-player');
  assert.equal(validateSubmission({ ...base, score: NaN }, BOARDS).error, 'bad-score');
  assert.equal(validateSubmission({ ...base, score: Infinity }, BOARDS).error, 'bad-score');
  assert.equal(validateSubmission({ ...base, score: '12abc' }, BOARDS).error, 'bad-score');
  assert.equal(validateSubmission({ ...base, score: null }, BOARDS).error, 'bad-score');
  assert.equal(validateSubmission({ ...base, score: 1001 }, BOARDS).error, 'out-of-range');
  assert.equal(validateSubmission({ ...base, score: -1 }, BOARDS).error, 'out-of-range');
  assert.equal(validateSubmission({ ...base, name: 'fuck' }, BOARDS).value.name, 'Player');
  assert.equal(validateSubmission([], BOARDS).error, 'bad-request');
  assert.ok(validPlayerId('abcdefghijklmnopqrstuv'));
  assert.ok(!validPlayerId('abc def ghi jkl mno pq'));
});

test('ranking keeps one row per player, best inside each period (desc)', async () => {
  const db = fakeD1();
  await add(db, 'pigeon', id(1), 500, NOW - 40 * DAY); // only all-time
  await add(db, 'pigeon', id(1), 100, NOW - 2 * DAY);
  await add(db, 'pigeon', id(2), 300, NOW - 20 * DAY);
  await add(db, 'pigeon', id(2), 200, NOW - DAY);
  await add(db, 'pigeon', id(2), 250, NOW - 3 * DAY);
  await add(db, 'pigeon', id(3), 250, NOW - 3 * DAY);
  const all = await top(db, 'pigeon', 'desc', 'all', 10, NOW);
  assert.deepEqual(all.map(e => [e.rank, e.player, e.score]), [[1, id(1), 500], [2, id(2), 300], [3, id(3), 250]]);
  const month = await top(db, 'pigeon', 'desc', '30d', 10, NOW);
  assert.deepEqual(month.map(e => [e.rank, e.player, e.score]), [[1, id(2), 300], [2, id(3), 250], [3, id(1), 100]]);
  const week = await top(db, 'pigeon', 'desc', '7d', 10, NOW);
  // Ties share a rank; the earlier run is listed first.
  assert.deepEqual(week.map(e => [e.rank, e.player, e.score]), [[1, id(2), 250], [1, id(3), 250], [3, id(1), 100]]);
  assert.deepEqual(await standing(db, 'pigeon', 'desc', '7d', id(1), NOW), { rank: 3, score: 100 });
  assert.deepEqual(await standing(db, 'pigeon', 'desc', '7d', id(3), NOW), { rank: 1, score: 250 });
  assert.deepEqual(await standing(db, 'pigeon', 'desc', 'all', id(1), NOW), { rank: 1, score: 500 });
  assert.equal(await standing(db, 'pigeon', 'desc', '7d', id(9), NOW), null);
  assert.equal((await top(db, 'pigeon', 'desc', 'all', 2, NOW)).length, 2);
});

test('ascending boards rank lower times first', async () => {
  const db = fakeD1();
  await add(db, 'jailbreak', id(1), 90, NOW - DAY);
  await add(db, 'jailbreak', id(1), 60, NOW - 10 * DAY);
  await add(db, 'jailbreak', id(2), 75, NOW - DAY);
  const result = await add(db, 'jailbreak', id(3), 120, NOW);
  assert.deepEqual(result, { ok: true, best: 120, rank: 3, week: { rank: 3, score: 120 } });
  assert.deepEqual((await top(db, 'jailbreak', 'asc', 'all', 10, NOW)).map(e => [e.rank, e.score]), [[1, 60], [2, 75], [3, 120]]);
  assert.deepEqual((await top(db, 'jailbreak', 'asc', '7d', 10, NOW)).map(e => [e.player, e.score]), [[id(2), 75], [id(1), 90], [id(3), 120]]);
  assert.deepEqual(await standing(db, 'jailbreak', 'asc', '7d', id(1), NOW), { rank: 2, score: 90 });
});

test('submit returns all-time best and rank and refreshes the name', async () => {
  const db = fakeD1();
  await add(db, 'pigeon', id(2), 400, NOW - DAY);
  assert.deepEqual(await add(db, 'pigeon', id(1), 300, NOW - 5000, 'Old Name'), { ok: true, best: 300, rank: 2, week: { rank: 2, score: 300 } });
  assert.deepEqual(await add(db, 'pigeon', id(1), 100, NOW, 'New Name'), { ok: true, best: 300, rank: 2, week: { rank: 2, score: 300 } });
  assert.deepEqual(await add(db, 'pigeon', id(1), 450, NOW), { ok: true, best: 450, rank: 1, week: { rank: 1, score: 450 } });
  const names = db.raw.prepare('SELECT DISTINCT name FROM scores WHERE player = ?').all(id(1)).map(r => r.name);
  assert.deepEqual(names, ['Name 01']);
  await rename(db, id(1), 'Renamed');
  assert.equal((await top(db, 'pigeon', 'desc', 'all', 1, NOW))[0].name, 'Renamed');
});

test('pruning keeps at most 50 rows per player and the recent bests', async () => {
  const db = fakeD1();
  // 60 strong old runs, then weak recent runs: the recent ones must survive for the 7-day board.
  for (let i = 0; i < 60; i++) await add(db, 'pigeon', id(1), 900 - i, NOW - 60 * DAY + i);
  for (let i = 0; i < 15; i++) await add(db, 'pigeon', id(1), 10 + i, NOW - DAY + i);
  await add(db, 'pigeon', id(2), 5, NOW);
  const count = db.raw.prepare('SELECT COUNT(*) AS n FROM scores WHERE game = ? AND player = ?').get('pigeon', id(1)).n;
  assert.ok(count <= MAX_ROWS_PER_PLAYER && MAX_ROWS_PER_PLAYER === 50, `kept ${count}`);
  assert.deepEqual(await standing(db, 'pigeon', 'desc', 'all', id(1), NOW), { rank: 1, score: 900 });
  assert.deepEqual(await standing(db, 'pigeon', 'desc', '7d', id(1), NOW), { rank: 1, score: 24 });
  const kept = db.raw.prepare('SELECT score FROM scores WHERE player = ? ORDER BY score DESC').all(id(1)).map(r => r.score);
  assert.equal(kept[0], 900);
  assert.ok(kept.includes(871) && !kept.includes(870), 'best 30 overall kept');
  // Other players and boards are untouched.
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM scores WHERE player = ?').get(id(2)).n, 1);
  await prune(db, 'pigeon', 'desc', id(2), NOW);
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM scores WHERE player = ?').get(id(2)).n, 1);
});

test('ranks read a bounded number of rows: exact near the top, unknown far down a big board', async () => {
  const db = fakeD1();
  const insert = db.raw.prepare('INSERT INTO scores (game, player, name, score, created_at) VALUES (?, ?, ?, ?, ?)');
  db.raw.exec('BEGIN');
  // 3,000 players, ten old runs each plus one run this week.
  for (let p = 0; p < 3000; p++) {
    for (let r = 0; r < 10; r++) insert.run('pigeon', id(p), 'N', 100000 - p * 10 - r, NOW - 60 * DAY);
    insert.run('pigeon', id(p), 'N', 50 + p, NOW - DAY);
  }
  db.raw.exec('COMMIT');
  // Near the top: exact, one per player ahead.
  assert.equal(await rankOf(db, 'pigeon', 'desc', 'all', 100000 - 40 * 10, NOW), 41);
  assert.deepEqual(await standing(db, 'pigeon', 'desc', 'all', id(40), NOW), { rank: 41, score: 99600 });
  // Far down: more than RANK_SCAN rows ahead, so the rank is unknown instead of reading the whole board.
  assert.equal(await rankOf(db, 'pigeon', 'desc', 'all', 1000, NOW), null);
  assert.deepEqual(await standing(db, 'pigeon', 'desc', 'all', id(2999), NOW), { rank: null, score: 100000 - 2999 * 10 });
  // Ascending boards count the other way.
  assert.equal(await rankOf(db, 'jailbreak', 'asc', 'all', 5, NOW), 1);
  // The query walks the (game, score) index from the score and stops after RANK_SCAN rows.
  const plans = [];
  const spy = { prepare: sql => { plans.push(sql); return db.prepare(sql); } };
  await rankOf(spy, 'pigeon', 'desc', '7d', 900, NOW);
  const plan = db.raw.prepare(`EXPLAIN QUERY PLAN ${plans[0].replace(/\?4/g, String(RANK_SCAN))}`).all('pigeon', 900, since('7d', NOW)).map(row => row.detail).join(' | ');
  assert.match(plan, /SEARCH scores USING INDEX scores_game_score \(game=\? AND score>\?\)/, plan);
  assert.match(plans[0], /LIMIT \?4/);
  assert.equal(RANK_SCAN, 1000);
  // Records use the same bounded count.
  const list = await records(db, BOARDS, id(2999), NOW);
  assert.deepEqual(list, [{ game: 'pigeon', best: 100000 - 2999 * 10, rank: null }]);
  assert.deepEqual(await records(db, BOARDS, id(3), NOW), [{ game: 'pigeon', best: 99970, rank: 4 }]);
});

test('records list every board the player has played with rank', async () => {
  const db = fakeD1();
  await add(db, 'pigeon', id(1), 50, NOW);
  await add(db, 'pigeon', id(2), 80, NOW);
  await add(db, 'jailbreak', id(1), 30, NOW);
  await add(db, 'jailbreak', id(1), 20, NOW);
  db.raw.prepare('INSERT INTO scores (game, player, name, score, created_at) VALUES (?, ?, ?, ?, ?)').run('removed-game', id(1), 'x', 1, NOW);
  const list = await records(db, BOARDS, id(1), NOW);
  assert.deepEqual(list.sort((a, b) => a.game.localeCompare(b.game)), [{ game: 'jailbreak', best: 20, rank: 1 }, { game: 'pigeon', best: 50, rank: 2 }]);
  assert.deepEqual(await records(db, BOARDS, id(5), NOW), []);
});

test('helpers', async () => {
  assert.equal(since('all', NOW), 0);
  assert.equal(since('7d', NOW), NOW - 7 * DAY);
  assert.equal(since('1y', NOW), null);
  assert.deepEqual(rankRows([{ player: 'a', score: 3, name: 'A' }, { player: 'a', score: 2, name: 'A' }, { player: 'b', score: 3, name: 'B' }, { player: 'c', score: 1, name: 'C' }], 10).map(e => e.rank), [1, 1, 3]);
  const pub = await publicId(id(1));
  assert.match(pub, /^[0-9a-f]{12}$/);
  assert.notEqual(pub, await publicId(id(2)));
});
