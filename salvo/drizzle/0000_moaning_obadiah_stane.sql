CREATE TABLE `naval_rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer DEFAULT 1 NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `naval_rate_limits_expiry_idx` ON `naval_rate_limits` (`expires_at`);--> statement-breakpoint
CREATE TABLE `naval_rooms` (
	`code` text PRIMARY KEY NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`data` text NOT NULL,
	`p0_hash` text NOT NULL,
	`p1_hash` text,
	`p0_seen` integer NOT NULL,
	`p1_seen` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `naval_rooms_expiry_idx` ON `naval_rooms` (`expires_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `naval_rooms_host_token_idx` ON `naval_rooms` (`p0_hash`);