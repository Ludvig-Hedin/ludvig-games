-- Leaderboards for games.ludvighedin.com (see docs/platform-api.md).
CREATE TABLE IF NOT EXISTS scores (id INTEGER PRIMARY KEY, game TEXT NOT NULL, player TEXT NOT NULL, name TEXT NOT NULL, score REAL NOT NULL, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS scores_game_time ON scores (game, created_at);
CREATE INDEX IF NOT EXISTS scores_game_player ON scores (game, player);
-- Ranking and top lists read only the rows ahead of a score.
CREATE INDEX IF NOT EXISTS scores_game_score ON scores (game, score);
-- Renames and "My records" look up one player across boards.
CREATE INDEX IF NOT EXISTS scores_player ON scores (player);

-- Fixed-window request counters (score submits, renames, room creation). Keys hold hashed IPs, never raw ones.
CREATE TABLE IF NOT EXISTS rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, reset_at INTEGER NOT NULL);
