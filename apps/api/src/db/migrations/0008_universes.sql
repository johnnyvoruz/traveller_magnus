CREATE TABLE `universes` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`truth_version` text,
	`engine_version` text NOT NULL,
	`edition_default` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`purge_after` text,
	`hex_override_count` integer NOT NULL DEFAULT 0,
	`object_bytes` integer NOT NULL DEFAULT 0,
	`last_snapshot_at` text,
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);

CREATE INDEX `universes_owner_id` ON `universes` (`owner_id`);
