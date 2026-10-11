CREATE TABLE `packages` (
	`id` text PRIMARY KEY NOT NULL,
	`author_id` text NOT NULL,
	`universe_id` text NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`slug` text NOT NULL,
	`description` text NOT NULL,
	`tags` text NOT NULL,
	`edition` text NOT NULL,
	`truth_version` text NOT NULL,
	`engine_version` text NOT NULL,
	`latest_version` integer NOT NULL DEFAULT 0,
	`installs` integer NOT NULL DEFAULT 0,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`hidden` integer NOT NULL DEFAULT 0,
	`takedown_reason` text,
	`takedown_by` text,
	FOREIGN KEY (`author_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`universe_id`) REFERENCES `universes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `packages_author_id` ON `packages` (`author_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `packages_slug_unique` ON `packages` (`slug`);
--> statement-breakpoint
CREATE TABLE `package_versions` (
	`package_id` text NOT NULL,
	`version` integer NOT NULL,
	`state` text NOT NULL,
	`error` text,
	`manifest_hash` text,
	`content_hash` text,
	`bytes` integer,
	`hex_count` integer NOT NULL,
	`record_count` integer NOT NULL,
	`hex_keys` text NOT NULL,
	`record_ids` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`package_id`, `version`),
	FOREIGN KEY (`package_id`) REFERENCES `packages`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT `package_versions_state_check` CHECK(`state` in ('queued', 'running', 'done', 'failed'))
);
