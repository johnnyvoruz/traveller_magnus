-- Players of a universe (contracts/b_players.md). The owner is not a row.
-- The campaign journal author_id column lives in the universe Durable Object, so either can land first.
CREATE TABLE `universe_members` (
	`universe_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`person_id` text,
	`status` text NOT NULL DEFAULT 'active',
	`archived_at` text,
	`archived_by` text,
	`created_at` text NOT NULL,
	PRIMARY KEY(`universe_id`, `user_id`),
	FOREIGN KEY (`universe_id`) REFERENCES `universes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT `universe_members_role_check` CHECK(`role` = 'player'),
	CONSTRAINT `universe_members_status_check` CHECK(`status` in ('active', 'archived')),
	CONSTRAINT `universe_members_archived_by_check` CHECK(`archived_by` is null or `archived_by` in ('owner', 'self'))
);
--> statement-breakpoint
CREATE INDEX `universe_members_user_id` ON `universe_members` (`user_id`);
--> statement-breakpoint
CREATE TABLE `universe_invites` (
	`id` text PRIMARY KEY NOT NULL,
	`universe_id` text NOT NULL,
	`token` text,
	`token_hash` text NOT NULL,
	`role` text NOT NULL,
	`expires_at` text NOT NULL,
	`revoked_at` text,
	`uses` integer NOT NULL DEFAULT 0,
	`created_at` text NOT NULL,
	FOREIGN KEY (`universe_id`) REFERENCES `universes`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT `universe_invites_role_check` CHECK(`role` = 'player')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `universe_invites_token_hash` ON `universe_invites` (`token_hash`);
--> statement-breakpoint
CREATE INDEX `universe_invites_universe_id` ON `universe_invites` (`universe_id`);
