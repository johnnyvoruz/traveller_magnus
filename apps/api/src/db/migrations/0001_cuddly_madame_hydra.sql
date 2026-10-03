ALTER TABLE `truth_versions` ADD `milieu` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `truth_versions` ADD `seed` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `truth_versions` ADD `settings` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `truth_versions` ADD `sectors` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `truth_versions` ADD `sectors_failed` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
UPDATE `truth_versions`
SET
	`milieu` = COALESCE(json_extract(`notes`, '$.milieu'), 'M1105'),
	`seed` = COALESCE(json_extract(`notes`, '$.seed'), `seed`),
	`settings` = CASE WHEN json_type(`notes`, '$.settings') IS NULL THEN `settings` ELSE json_extract(`notes`, '$.settings') END,
	`sectors` = CASE WHEN json_type(`notes`, '$.sectors') IS NULL THEN `sectors` ELSE json_extract(`notes`, '$.sectors') END,
	`notes` = NULL
WHERE `notes` IS NOT NULL AND json_valid(`notes`) AND json_type(`notes`, '$.seed') IS NOT NULL;