CREATE VIRTUAL TABLE `truth_systems_fts` USING fts5(
	`name`,
	`hex`,
	`uwp`,
	`sector_slug`,
	content='truth_systems',
	content_rowid='rowid'
);

CREATE TRIGGER `truth_systems_ai` AFTER INSERT ON `truth_systems` BEGIN
	INSERT INTO `truth_systems_fts`(`rowid`, `name`, `hex`, `uwp`, `sector_slug`)
	VALUES (new.`rowid`, new.`name`, new.`hex`, new.`uwp`, new.`sector_slug`);
END;

CREATE TRIGGER `truth_systems_ad` AFTER DELETE ON `truth_systems` BEGIN
	INSERT INTO `truth_systems_fts`(`truth_systems_fts`, `rowid`, `name`, `hex`, `uwp`, `sector_slug`)
	VALUES ('delete', old.`rowid`, old.`name`, old.`hex`, old.`uwp`, old.`sector_slug`);
END;

CREATE TRIGGER `truth_systems_au` AFTER UPDATE ON `truth_systems` BEGIN
	INSERT INTO `truth_systems_fts`(`truth_systems_fts`, `rowid`, `name`, `hex`, `uwp`, `sector_slug`)
	VALUES ('delete', old.`rowid`, old.`name`, old.`hex`, old.`uwp`, old.`sector_slug`);
	INSERT INTO `truth_systems_fts`(`rowid`, `name`, `hex`, `uwp`, `sector_slug`)
	VALUES (new.`rowid`, new.`name`, new.`hex`, new.`uwp`, new.`sector_slug`);
END;
