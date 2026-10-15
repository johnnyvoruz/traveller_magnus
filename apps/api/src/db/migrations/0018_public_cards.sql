-- The public card, the referee's name, and the example flag (contracts/b_party_ships.md).
-- Until this table exists the Worker keeps the 0017 feed, refuses the card, and ignores showReferee.
ALTER TABLE `universes` ADD COLUMN `show_referee` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `universes` ADD COLUMN `example` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
CREATE TABLE `public_cards` (
	`mark_id` text PRIMARY KEY NOT NULL,
	`universe_id` text NOT NULL,
	`legs` text NOT NULL,
	`journal` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`universe_id`) REFERENCES `universes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`mark_id`) REFERENCES `public_ships`(`mark_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `public_cards_universe` ON `public_cards` (`universe_id`);
