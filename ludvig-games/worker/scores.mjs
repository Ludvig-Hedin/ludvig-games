/** Leaderboard rules on top of a D1-compatible database (prepare/bind/first/all/run, batch).
    Pure apart from the database handle, so tests run it against node:sqlite. Request limits are not kept here:
    they use Workers rate-limit bindings (worker/util.mjs RATE_LIMITS), so a refused request writes no rows. */
import { cleanName, validPlayerId } from './util.mjs';

export const BOARD_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*(?::[a-z0-9]+(?:-[a-z0-9]+)*)?$/;
export const PERIODS = { '7d': 7 * 864e5, '30d': 30 * 864e5, all: Infinity };
// A rank reads at most this many score rows (the ones just ahead, through the (game, score) index), so its cost
// does not grow with the board. Further down the board the rank is unknown (null) and the UI leaves it out.
export const RANK_SCAN = 1000;
// Rows kept per player per board: best overall, plus best recent ones so 7/30-day boards stay right.
export const KEEP = { all: 30, '30d': 10, '7d': 10 };
export const MAX_ROWS_PER_PLAYER = KEEP.all + KEEP['30d'] + KEEP['7d'];

export function since(period, now) {
  const span = PERIODS[period];
  if (span === undefined) return null;
  return span === Infinity ? 0 : now - span;
}

export function boardConfig(boards, id) {
  if (typeof id !== 'string' || !BOARD_ID.test(id) || !Object.hasOwn(boards, id)) return null;
  const board = boards[id];
  return board && (board.order === 'asc' || board.order === 'desc') ? board : null;
}

/** Returns { value } or { error, status }. */
export function validateSubmission(body, boards) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'bad-request', status: 400 };
  const board = boardConfig(boards, body.game);
  if (!board) return { error: 'unknown-game', status: 404 };
  if (!validPlayerId(body.player)) return { error: 'bad-player', status: 400 };
  const score = typeof body.score === 'string' && body.score.trim() !== '' ? Number(body.score) : body.score;
  if (typeof score !== 'number' || !Number.isFinite(score)) return { error: 'bad-score', status: 400 };
  if (score < board.min || score > board.max) return { error: 'out-of-range', status: 400 };
  // A rejected nickname never blocks a score; it is stored as "Player".
  const name = cleanName(body.name) ?? 'Player';
  return { value: { game: body.game, player: body.player, name, score, board } };
}

const better = order => (order === 'asc' ? '<' : '>');
const direction = order => (order === 'asc' ? 'ASC' : 'DESC');
const aggregate = order => (order === 'asc' ? 'MIN' : 'MAX');

/** Deduplicate rows sorted best-first to one per player and assign competition ranks (1, 2, 2, 4). */
export function rankRows(rows, limit) {
  const seen = new Set();
  const entries = [];
  for (const row of rows) {
    if (seen.has(row.player)) continue;
    seen.add(row.player);
    const previous = entries[entries.length - 1];
    const rank = previous && previous.score === row.score ? previous.rank : entries.length + 1;
    entries.push({ rank, name: row.name, score: row.score, player: row.player });
    if (entries.length >= limit) break;
  }
  return entries;
}

/** Top players for a board and period, one row per player (their best inside the period). */
export async function top(db, game, order, period, limit, now) {
  const from = since(period, now);
  // Every player keeps at most MAX_ROWS_PER_PLAYER rows, so this window always holds `limit` distinct players.
  const { results } = await db.prepare(
    `SELECT player, name, score FROM scores WHERE game = ?1 AND created_at >= ?2
     ORDER BY score ${direction(order)}, created_at ASC LIMIT ?3`,
  ).bind(game, from, limit * MAX_ROWS_PER_PLAYER).all();
  return rankRows(results, limit);
}

/** Rank of a score: 1 + players strictly better inside the period, or null when more than RANK_SCAN rows are
    ahead. The inner query reads only index-ordered rows ahead of the score and stops after RANK_SCAN of them. */
function rankQuery(db, game, order, score, from) {
  return db.prepare(
    `SELECT COUNT(*) AS seen, COUNT(DISTINCT CASE WHEN created_at >= ?3 THEN player END) AS n
     FROM (SELECT player, created_at FROM scores WHERE game = ?1 AND score ${better(order)} ?2 LIMIT ?4)`,
  ).bind(game, score, from, RANK_SCAN);
}
const rankFrom = row => (Number(row?.seen) >= RANK_SCAN ? null : Number(row?.n) + 1);

export async function rankOf(db, game, order, period, score, now) {
  return rankFrom(await rankQuery(db, game, order, score, since(period, now)).first());
}

/** The player's best inside the period and their rank (null far down a big board), or null when they have none. */
export async function standing(db, game, order, period, player, now, rank = rankOf) {
  const from = since(period, now);
  const mine = await db.prepare(
    `SELECT ${aggregate(order)}(score) AS score FROM scores WHERE game = ?1 AND player = ?2 AND created_at >= ?3`,
  ).bind(game, player, from).first();
  if (mine?.score === null || mine?.score === undefined) return null;
  return { rank: await rank(db, game, order, period, mine.score, now), score: mine.score };
}

export async function prune(db, game, order, player, now) {
  const by = `ORDER BY score ${direction(order)}, created_at ASC`;
  const keep = (window, n) => `SELECT id FROM (SELECT id, ROW_NUMBER() OVER (${by}) AS r FROM scores
    WHERE game = ?1 AND player = ?2 AND created_at >= ${window}) WHERE r <= ${n}`;
  await db.prepare(
    `DELETE FROM scores WHERE game = ?1 AND player = ?2 AND id NOT IN (
      ${keep('0', KEEP.all)} UNION ${keep('?3', KEEP['30d'])} UNION ${keep('?4', KEEP['7d'])})`,
  ).bind(game, player, since('30d', now), since('7d', now)).run();
}

/** Store a validated run, refresh the player's name on that board, prune, and report all-time best and rank
    plus this week's best and rank (used by the in-game "#3 this week" toast). */
export async function submit(db, { game, player, name, score, board }, now, rank = rankOf) {
  await db.batch([
    db.prepare('INSERT INTO scores (game, player, name, score, created_at) VALUES (?1, ?2, ?3, ?4, ?5)').bind(game, player, name, score, now),
    db.prepare('UPDATE scores SET name = ?3 WHERE game = ?1 AND player = ?2 AND name <> ?3').bind(game, player, name),
  ]);
  await prune(db, game, board.order, player, now);
  const result = await standing(db, game, board.order, 'all', player, now, rank);
  const week = await standing(db, game, board.order, '7d', player, now, rank);
  return { ok: true, best: result.score, rank: result.rank, week };
}

/** Rename a player on every board. */
export async function rename(db, player, name) {
  await db.prepare('UPDATE scores SET name = ?2 WHERE player = ?1 AND name <> ?2').bind(player, name).run();
}

/** The player's all-time best and rank on every configured board they have played. */
export async function records(db, boards, player, now) {
  const { results } = await db.prepare(
    'SELECT game, MAX(score) AS high, MIN(score) AS low FROM scores WHERE player = ?1 GROUP BY game',
  ).bind(player).all();
  const rows = results.map(row => ({ row, board: boardConfig(boards, row.game) })).filter(item => item.board);
  if (!rows.length) return [];
  const counts = await db.batch(rows.map(({ row, board }) =>
    rankQuery(db, row.game, board.order, board.order === 'asc' ? row.low : row.high, 0)));
  return rows.map(({ row, board }, index) => ({
    game: row.game,
    best: board.order === 'asc' ? row.low : row.high,
    rank: rankFrom(counts[index].results[0]),
  }));
}
