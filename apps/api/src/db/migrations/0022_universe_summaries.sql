-- Campaign list summary (contracts/b_campaign_summary.md). The Durable Object keeps its own row.
-- Either can land first: the list omits `summary` until this table exists.
CREATE TABLE `universe_summaries` (
	`universe_id` text PRIMARY KEY NOT NULL,
	`vessels` text NOT NULL,
	`aboard` integer NOT NULL,
	`clock_days` real,
	`record_count` integer NOT NULL,
	`changed_at` text NOT NULL,
	FOREIGN KEY (`universe_id`) REFERENCES `universes`(`id`) ON UPDATE no action ON DELETE no action
);
