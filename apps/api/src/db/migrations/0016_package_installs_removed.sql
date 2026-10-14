-- Undo of an import (contracts/b_marketplace.md F13): a restored first import is
-- kept as a removed row. Safe in either order: the Worker probes for the column.
ALTER TABLE package_installs ADD COLUMN removed_at TEXT;