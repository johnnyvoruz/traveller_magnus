CREATE TABLE `truth_build_sectors` (
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
	CONSTRAINT "truth_build_sectors_state_check" CHECK("truth_build_sectors"."state" in ('building', 'done', 'failed'))
);
