ALTER TABLE `universes` ADD COLUMN `public_games` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
CREATE TABLE `public_marks` (
	`universe_id` text PRIMARY KEY NOT NULL,
	`truth_version` text NOT NULL,
	`sector_slug` text NOT NULL,
	`local_hex` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`universe_id`) REFERENCES `universes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `public_marks_chart` ON `public_marks` (`truth_version`, `sector_slug`);
