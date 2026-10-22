-- One example universe for a signed-out read (BL8). 0024 is table_sets, so this took the next free number.
-- Johnny sets `demo` by hand on a universe made for this. The route does not choose one by name.
-- The column stays off the Drizzle `universes` table so a whole-row select works before this lands.
ALTER TABLE `universes` ADD COLUMN `demo` integer NOT NULL DEFAULT 0;
