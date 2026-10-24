CREATE TABLE `rooms` (
	`code` text PRIMARY KEY NOT NULL,
	`state` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`match_number` integer DEFAULT 1 NOT NULL,
	`x_token_hash` text NOT NULL,
	`o_token_hash` text,
	`x_ready` integer DEFAULT 0 NOT NULL,
	`o_ready` integer DEFAULT 0 NOT NULL,
	`closed` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`x_seen_at` integer NOT NULL,
	`o_seen_at` integer
);
--> statement-breakpoint
CREATE INDEX `rooms_expiry_idx` ON `rooms` (`expires_at`);