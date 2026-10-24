-- 24 Oct 2026 (Workers Free move): per-IP limits now use the Workers rate-limit
-- binding, so the D1 counter table is gone.
DROP TABLE `room_rate_limits`;
