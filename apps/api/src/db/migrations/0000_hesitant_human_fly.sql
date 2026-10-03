CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`at` text NOT NULL,
	`actor_id` text,
	`action` text NOT NULL,
	`target_kind` text,
	`target_id` text,
	`details` text
);
--> statement-breakpoint
CREATE TABLE `oauth_accounts` (
	`provider` text NOT NULL,
	`provider_user_id` text NOT NULL,
	`user_id` text NOT NULL,
	`email` text,
	`created_at` text NOT NULL,
	PRIMARY KEY(`provider`, `provider_user_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL,
	`user_agent` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `truth_systems` (
	`version` text NOT NULL,
	`sector_slug` text NOT NULL,
	`hex` text NOT NULL,
	`name` text,
	`uwp` text,
	`allegiance` text,
	`zone` text,
	`tree_hash` text,
	PRIMARY KEY(`version`, `sector_slug`, `hex`)
);
--> statement-breakpoint
CREATE TABLE `truth_versions` (
	`version` text PRIMARY KEY NOT NULL,
	`engine_version` text NOT NULL,
	`state` text NOT NULL,
	`started_at` text NOT NULL,
	`released_at` text,
	`notes` text,
	`manifest_hash` text,
	`sectors_total` integer NOT NULL,
	`sectors_done` integer NOT NULL,
	CONSTRAINT "truth_versions_state_check" CHECK("truth_versions"."state" in ('building', 'released', 'withdrawn'))
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`handle` text NOT NULL,
	`display_name` text NOT NULL,
	`avatar_url` text,
	`role` text NOT NULL,
	`created_at` text NOT NULL,
	`last_seen_at` text,
	`disabled_at` text,
	CONSTRAINT "users_role_check" CHECK("users"."role" in ('user', 'reviewer', 'admin'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_handle_unique` ON `users` (`handle`);