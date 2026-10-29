-- The ship sheet's Class box, copied onto the public row when a ship is made public.
-- Null when that box was empty, and on every row written before this column.
-- The column stays off the Drizzle tables. A missing column keeps the old card sentence.
ALTER TABLE `public_ships` ADD COLUMN `ship_class` text;
