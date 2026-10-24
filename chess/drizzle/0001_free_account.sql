-- 24 Oct 2026 (Workers Free move): per-IP limits now use the Workers rate-limit
-- binding, so the D1 counter table and its unindexed cleanup scan are gone.
DROP TABLE `chess_rate_limits`;
