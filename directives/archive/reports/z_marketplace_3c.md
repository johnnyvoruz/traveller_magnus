# Lane Z marketplace phase 3c report
Prompt: prompts/z_marketplace.md (Phase 3c)
Status: done

## Changed files
- apps/api/src/routes/installs.ts: restore route, removed_at probe/reads and `removed` taken out; one import per package (409 "This campaign already has this package. Remove it first, or take its update." at preview and install); `DELETE /api/universes/:id/installs/:installId`; the row id is the provenance installId; a separate per-call id keys the byte charge.
- apps/api/src/universe/install.ts: snapshot row, captured rows, `install:`/`installed:`/`installrow:`/`restored:` meta, `snapshotId`, `restoreInstall` taken out; `removeInstall` added (one transaction); own sectors an import makes kept in meta `installsectors:<installId>`.
- apps/api/src/universe/UniverseDO.ts (routes): `/install/restore` became `/install/remove`.
- apps/api/src/universe/hexes.ts (install addition): `restoreInstalledHex` replaced by `deleteInstalledHex` (row deleted, history `remove`).
- apps/api/src/universe/campaign.ts (install addition): `rawCampaignRecord`, `restoreInstalledRecord` replaced by `deleteInstalledRecord` (tombstone and links, as the campaign delete does).
- apps/api/src/universe/sectors.ts (install addition): `dropImportSector` history action `restore` became `delete`; comment.
- packages/shared/src/schemas/package.ts, index.ts: `InstallRestored` became `InstallRemoved { hexes, records, sectors }`; `InstallResult.snapshotId` and `InstallRow.removed` dropped.
- tests/api/install_restore.test.js: deleted.
- tests/api/install_delete.test.js (new): 401, 404 other account, 404 unknown; placed import over charted space plus a made sector, removed (the chart shows again, sector gone, record gone, list empty); an edited hex removed too; second import 409 at preview (in place and placed) and at install; update keeps placement; importing again after remove works.
- tests/api/install.test.js: `removed` assert dropped; test name.
- tests/shared/package_schema.test.js: InstallRemoved; InstallRow without `removed`.
- directives/contracts/b_marketplace.md: F4 step 1, answer and undo line replaced; F13 part B marked taken out; new F14.
- Migration 0016: untouched, as told. No new migration.

## Gates
npm test:      pass (1686 tests: 1657 pass, 0 fail, 29 skipped)
npm run check: pass (manifesto: clean)
typecheck:     pass
build:         pass
RUN_API_TESTS=1: install, install_delete, packages, packages_job, packages_migration, campaign_entry_images, campaign_export, campaign_logic, builder_logic, builder_sector_logic pass. campaign.test.js failed on the shared .wrangler state ("Ten universes per account.", built up by earlier runs) and passed on a fresh VOYAGE_PERSIST_TO with migrations applied. Not a code failure.

## Contract published
contracts/b_marketplace.md F14

## Needs from others
- Lane D/A (phase 4): a Remove button calls the DELETE; nothing in the browser called restore.
- No foreign edits found in my files (they matched HEAD d8f8ec3 before I began). The tree also holds other lanes' uncommitted work (jobs/truth_build, routes/admin, release_seal, TruthPreview.vue, board, handoff); I did not touch it.

## Questions for Johnny
1. In-place update without naming the import: allow it, as 1.1.13 did (recommended), or require `installId` on every update?
2. `packages.installs` after a remove: leave it as "universes that ever imported" (recommended), or count down?
3. A 1.1.14 campaign holding one package twice keeps both until removed (recommended), or merge them now?
