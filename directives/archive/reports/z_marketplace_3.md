# Lane Z - marketplace phase 3 (place elsewhere, undo an import)

Date: 2026-10-14. Base: 1.1.13 (cfe88a4). Nothing committed, pushed or deployed.

## Built

### Part A - placement
- `packages/shared/src/package_place.ts` (new, imports nothing): `cubeOf`, `offsetOf`, `placeCells`, `placeKeys`, `placeTree`, `placeSummary`, `placeRecord`, `placeLists`, `PlaceError`. The F5 cube shift on the odd-q grid, with slots in -1000..1000 and `~slot_x_y` for empty space.
- `packages/shared/src/schemas/campaign.ts` (lent, CampaignProvenance only): a union of copy|shared (unchanged) and `{ mode: 'package', packageId, version, installId, at }`.
- `packages/shared/src/schemas/package.ts`:
  - `Placement`, `OwnSectorPlan`, `InstallRestored`.
  - InstallPreview gets `placement` and `sectorsCreated`.
  - InstallRequest gets `placement?` / `installId?` (not both).
  - InstallRow gets `placement` and `removed`.
- `packages/shared/src/index.ts`: exports for the above.
- `apps/api/src/routes/installs.ts`:
  - The preview takes `anchor`, `to` and `installId`.
  - Additions: `chartSlots`, `ownSlots` (reads the source and target DO `/sectors`), `plannedSectorId` (a deterministic `~` + 26 Crockford id), `targetOf` (which import row is written and its stored placement), and `place` (shifts keys, rewrites trees into new private objects charged to quota, rewrites summaries and records).
  - The install row stores its placement and is reused on update.
- `apps/api/src/universe/install.ts`:
  - `from` and `placed` on hex input. With a placement: `replaces chart`, `replaces own`, `conflict` or `new`, without the base hash.
  - Own sectors are made in the install transaction. A taken slot is 409.
  - Records use package provenance; package mode from the same package counts as a replace.
  - Records are captured as raw rows. Meta `installed:<id>` and `installrow:<rowId>` hold what undo needs.
- `apps/api/src/universe/sectors.ts`: `makeImportSector` (wraps make/refuseSlot, and revives a deleted id) and `dropImportSector`.
- Census (`tests/generation/package_location_fields.test.js`): a stored Regina envelope from generateHex (truth flesh path, the tracked `universe/raw/Spinward_Marches.tsv` row 1910) plus a hand tree. It pins `$.hexKey` and nine `$.body.*` paths.

### Part B - undo (contract F13 in `directives/contracts/b_marketplace.md`)
- `POST /api/universes/:id/snapshots/:snapshotId/restore`: owner only, one DO call (`/install/restore` in UniverseDO.ts, rate-limited like install), one transaction.
- `apps/api/src/universe/install.ts` `restoreInstall`:
  - 404 for an unknown id. 400 for a non-install snapshot.
  - 409 in these cases:
    - the import is already undone;
    - hexes or records were edited after the import (the 409 lists `hexKeys` and `recordIds`);
    - a later import of the same row exists;
    - the import was made before phase 3.
- `apps/api/src/universe/hexes.ts` `restoreInstalledHex`: puts the captured row back or deletes a created one. History action `restore`, with a new rev.
- `apps/api/src/universe/campaign.ts` `rawCampaignRecord` and `restoreInstalledRecord`: put the captured row back or tombstone the record, with a new rev and seq.
- `apps/api/src/db/migrations/0016_package_installs_removed.sql`: adds `removed_at`. The Worker probes for the column, so it is safe in either order: without 0016 the restore route answers 503 and the list shows `removed: false`.
- The list shows `removed: true` and no update after a first import is undone. Undoing an update puts the old version back.
- Quota: **no refund**. The trees stay in private storage and are still referenced by hex history, snapshots and other imports. R2 has no reference count.

## Tests
- `tests/generation/package_place.test.js` (new, 8 tests): the F5 example, an even shift, a sector edge and empty space, distances kept for every shift, every census field moved (parentId keeps its suffix), a round trip that gives back the original hash, determinism, record anchors, and the refusals.
- `tests/shared/package_schema.test.js`: placement, provenance package mode with old copy/shared rows still parsing, InstallRestored, and removed. The old "placement refused" assertion was changed because the go changes that behaviour.
- `tests/api/install.test.js`: the record provenance assertion is now `package` (a spec change). The truth manifest now has Chart (0,0) and Demo (1,0). Added:
  - a piece over charted space (`replaces chart`, state override, R2 truth index byte-identical);
  - across the Chart|Demo edge into empty slot (-1,0), where a sector is created, its moved tree carries the new hexKey, and the preview and install agree on the id;
  - an update keeping its placement;
  - placement plus installId refused;
  - an edition refusal with a placement;
  - off-map and bad-anchor refusals.
- `tests/api/install_restore.test.js` (new, port 18878):
  - signed out 401, non-owner 404, unknown id 404;
  - a generate snapshot gives 400;
  - an undo gives back hexes 2, records 1, sectors 0; the hex is gone, the chart reads as before, the record is tombstoned, the list shows removed, and there is no refund;
  - a second undo is 409;
  - re-import, then an edit, then an undo is 409 naming Demo/1910 with nothing written;
  - an undo of a placed import removes its 2 own sectors.

## Gates
- npm test: 1686 tests, 1657 pass, 0 fail, 29 skipped.
- RUN_API_TESTS=1 (each suite is a single test):
  - install 1/1, install_restore 1/1, packages 1/1, packages_migration 1/1, campaign_export 1/1, campaign_entry_images 1/1;
  - packages_job 4/4, campaign 2/2, campaign_logic 13/13;
  - 0 fail.
- npm run check: clean. npm run typecheck: 0. npm run build: ok.
- Note: with RUN_API_TESTS left set, the builder suites fail only at `rmSync` of the temp dir with Windows EPERM after their assertions. This is environmental and is not from this phase. The builder suites were not rerun on their own.

## Not done / limits
- The "Undo the later import of this package first." path has no Worker test.
- The drizzle `apps/api/src/db/schema.ts` has no `removed_at`, because that file is not on the go list. The code uses raw SQL.
- An import needs a pinned universe (opened once). The test opens the map first.
- Two placements of the same package share record ids, so the second one replaces the first one's records.
- The order of part B: code was drafted before the contract text, but F13 was written before the restore tests.

## Foreign edits
- My files are intact: the Progress lines and contract are unchanged between my writes, and there is no foreign 11:07-style rewrite.
- The working tree also has other lanes' changes, which I did not touch:
  - jobs/inputs.ts, reconcile_transform.ts, truth_build.ts, release_seal.ts (new);
  - routes/admin.ts, board.md, handoff.md, scripts/dev_make_admin.js;
  - tests truth_build, reconcile_derived, release_seal;
  - web TruthPreview.vue.

## Questions for Johnny (recommended answer first)
1. Quota on undo: no refund (recommended; objects are shared), or refund the bytes charged by that import even if it over-counts free space?
2. Should importing into a never-opened universe pin it automatically? Recommended: yes, in phase 4, through the Builder's pin, not here.
3. Should two placements of one package share records or get copies? Recommended: share (as built); copies need new record ids.