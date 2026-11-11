-- A member's characters, in the referee's order. person_id on universe_members stays the first id.
-- Adds a table and copies. Safe in either order with a Worker that still reads only the column.
CREATE TABLE `universe_member_people` (
	`universe_id` text NOT NULL,
	`user_id` text NOT NULL,
	`person_id` text NOT NULL,
	`position` integer NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`universe_id`, `user_id`, `person_id`),
	FOREIGN KEY (`universe_id`, `user_id`) REFERENCES `universe_members`(`universe_id`, `user_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `universe_member_people_order` ON `universe_member_people` (`universe_id`, `user_id`, `position`);
--> statement-breakpoint
INSERT INTO `universe_member_people` (`universe_id`, `user_id`, `person_id`, `position`, `created_at`)
SELECT `universe_id`, `user_id`, `person_id`, 0, `created_at`
FROM `universe_members`
WHERE `person_id` IS NOT NULL;
