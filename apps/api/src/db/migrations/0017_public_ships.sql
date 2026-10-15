-- One public row per party ship (contracts/b_party_ships.md).
-- `public_marks` stays. The Worker probes for this table and, until it exists,
-- keeps writing the single mark for the first ship.
CREATE TABLE `public_ships` (
	`mark_id` text PRIMARY KEY NOT NULL,
	`universe_id` text NOT NULL,
	`truth_version` text NOT NULL,
	`sector_slug` text NOT NULL,
	`local_hex` text NOT NULL,
	`ship_name` text NOT NULL,
	`aboard_names` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`universe_id`) REFERENCES `universes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `public_ships_chart` ON `public_ships` (`truth_version`, `sector_slug`);
--> statement-breakpoint
CREATE INDEX `public_ships_universe` ON `public_ships` (`universe_id`);
