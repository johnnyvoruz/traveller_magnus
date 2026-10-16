-- Package covers (contracts/b_marketplace.md F17). The publisher's upload on the package;
-- the record-art pair and every published image hash on the version. Until these columns
-- exist the Worker answers `cover: null` everywhere and refuses an upload.
ALTER TABLE `packages` ADD COLUMN `cover_hash` text;
--> statement-breakpoint
ALTER TABLE `packages` ADD COLUMN `cover_thumb_hash` text;
--> statement-breakpoint
ALTER TABLE `package_versions` ADD COLUMN `art_hash` text;
--> statement-breakpoint
ALTER TABLE `package_versions` ADD COLUMN `art_thumb_hash` text;
--> statement-breakpoint
ALTER TABLE `package_versions` ADD COLUMN `image_hashes` text;
--> statement-breakpoint
ALTER TABLE `package_versions` ADD COLUMN `art_filled` integer NOT NULL DEFAULT 0;
