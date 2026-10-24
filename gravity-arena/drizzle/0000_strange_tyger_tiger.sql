CREATE TABLE `arena_rooms` (
	`code` text PRIMARY KEY NOT NULL,
	`version` integer NOT NULL,
	`state` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`last_seen_1` integer DEFAULT 0 NOT NULL,
	`last_seen_2` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `arena_rooms_expiry` ON `arena_rooms` (`expires_at`);