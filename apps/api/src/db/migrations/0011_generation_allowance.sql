CREATE TABLE `generation_allowance` (
	`user_id` text PRIMARY KEY NOT NULL,
	`daily_limit` integer NOT NULL DEFAULT 100,
	`day` text NOT NULL DEFAULT '',
	`used` integer NOT NULL DEFAULT 0,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
