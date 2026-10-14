CREATE TABLE IF NOT EXISTS `package_installs` (
	`id` text PRIMARY KEY NOT NULL,
	`universe_id` text NOT NULL,
	`package_id` text NOT NULL,
	`version` integer NOT NULL,
	`placement` text,
	`hex_count` integer NOT NULL,
	`record_count` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `package_installs_universe` ON `package_installs` (`universe_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `package_installs_package` ON `package_installs` (`package_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `package_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`package_id` text NOT NULL,
	`user_id` text NOT NULL,
	`reason` text NOT NULL,
	`state` text NOT NULL,
	`created_at` text NOT NULL,
	CONSTRAINT `package_reports_state_check` CHECK(`state` in ('open', 'closed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `package_reports_open` ON `package_reports` (`package_id`, `user_id`) WHERE `state` = 'open';