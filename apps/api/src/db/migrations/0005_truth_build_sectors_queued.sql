CREATE TABLE `truth_build_sectors_new` (
	`version` text NOT NULL,
	`sector_slug` text NOT NULL,
	`state` text NOT NULL,
	`systems` integer NOT NULL DEFAULT 0,
	`built` integer NOT NULL DEFAULT 0,
	`partial` integer NOT NULL DEFAULT 0,
	`index_hash` text,
	`error` text,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`version`, `sector_slug`),
	CONSTRAINT "truth_build_sectors_state_check" CHECK("state" in ('queued', 'building', 'done', 'failed'))
);
--> statement-breakpoint
INSERT INTO `truth_build_sectors_new` (`version`, `sector_slug`, `state`, `systems`, `built`, `partial`, `index_hash`, `error`, `updated_at`)
SELECT `version`, `sector_slug`, `state`, `systems`, `built`, `partial`, `index_hash`, `error`, `updated_at` FROM `truth_build_sectors`;
--> statement-breakpoint
DROP TABLE `truth_build_sectors`;
--> statement-breakpoint
ALTER TABLE `truth_build_sectors_new` RENAME TO `truth_build_sectors`;
