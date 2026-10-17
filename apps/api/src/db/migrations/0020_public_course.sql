-- A public ship's course, and the referee's switch (contracts/b_public_games.md).
-- Until both columns exist the Worker answers course: [] and refuses a showCourse write.
-- show_course stays off the Drizzle universes table: a whole-row select would fail before this migration.
ALTER TABLE `universes` ADD COLUMN `show_course` integer NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `public_cards` ADD COLUMN `course` text NOT NULL DEFAULT '[]';
