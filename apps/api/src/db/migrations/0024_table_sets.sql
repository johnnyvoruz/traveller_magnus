-- Account table sets (contracts/b_table_sets.md). One row and one R2 object each.
-- 0022 is universe_summaries and 0023 is access_tokens, so this took the next free number.
-- Campaign settings.tableSets is optional, so either can land first.
CREATE TABLE `table_sets` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`based_on` text,
	`edition` text NOT NULL,
	`object_key` text NOT NULL,
	`bytes` integer NOT NULL,
	`sha256` text NOT NULL,
	`rev` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `table_sets_owner_kind` ON `table_sets` (`owner_id`, `kind`, `updated_at`);
