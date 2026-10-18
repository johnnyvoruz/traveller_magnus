-- Agent access tokens and the kill switch (contracts/b_session_ingest.md).
-- The proposal tables live in the universe Durable Object, so either can land first.
CREATE TABLE `access_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`prefix` text NOT NULL,
	`token_hash` text NOT NULL,
	`scopes` text NOT NULL,
	`universe_id` text,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`last_used_at` text,
	`revoked_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `access_tokens_token_hash` ON `access_tokens` (`token_hash`);
--> statement-breakpoint
CREATE INDEX `access_tokens_user_id` ON `access_tokens` (`user_id`);
--> statement-breakpoint
CREATE TABLE `platform_flags` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text NOT NULL,
	`updated_by` text NOT NULL
);
