# Lane Z — the marketplace, end to end: publish anything, browse, import in place or placed like a puzzle piece

Issued 2026-10-14 by the orchestrator, for Lane Z (heavy effort). You may be a fresh
session with no memory. This is a four-phase job with **a stop after each phase**: write
the phase's report, then wait for the orchestrator's "go" for the next one. Do not start
a later phase early, and do not write outside the files a phase names. Last time a Z
pass changed files outside the bus before review; that cost a re-review. Everything
here goes through this file and your reports.

## Read first, in this order

1. `CLAUDE.md`, `directives/manifesto.md`, `directives/lanes/Z.md`, `directives/board.md`.
2. The design: `directives/architecture.md` §2 (git-shaped storage: blobs, pointers,
   manifests; "patch" is a package, "merge" is install), `directives/data_model.md` §5
   ("Where homebrew lives": the Homebrew Expanse band, own sector slugs `handle~Name`)
   and §7 (package manifest, publish job, the three-way install merge),
   `directives/api.md` "Slice 4 — sharing".
3. What is built: `directives/contracts/b_marketplace.md` (the size-b stub, live since
   1.1.2), `directives/reports/done/b_marketplace_server.md`,
   `d_marketplace_screens.md`, `a_marketplace_client.md`, `d_publish_single.md`,
   `c_marketplace_audit.md`, `directives/handoff.md` §240-247, §266-267.
4. The code (read all of it before writing anything):
   - Shared: `packages/shared/src/schemas/package.ts`.
   - Server: `apps/api/src/routes/packages.ts`, `jobs/publish_queue.ts`,
     `universe/publish_read.ts`, `auth/profile.ts`, migration
     `db/migrations/0010_packages.sql`, `db/schema.ts`; the universe Durable Object
     `universe/UniverseDO.ts`, `universe/hexes.ts` (a hex is `own`, `override` or
     `truth`; `ownSectorKey`, `chartTree`, history, snapshots at ~506),
     `universe/sectors.ts` (own sectors and their band positions), `universe/campaign.ts`
     (records and journal entries carry an `anchor`), `universe/budget.ts`.
   - Browser: `apps/web/src/marketplace/` (store, types), `apps/web/src/workspace/market/`
     (`PackagesView.vue`, `PublishForm.vue`, `market.ts`, `command.ts`, `fake_store.ts`).
   - Tests: `tests/api/packages.test.js`, `packages_job.test.js`,
     `packages_migration.test.js`.

## Johnny's goal and his answers (2026-10-14)

Goal, in his words: "people make a map / sector or whatever and then publish it, and
then be able to import it into their campaign either in the same place or place it like
a puzzle piece somewhere else."

Answers ("yes to all five"):
1. **Own maps publish.** A universe with no chart version (`truth_version` null) may
   publish. The stub's refusal ("This universe is not on a published chart.") goes;
   `PackageManifest.truthVersion` becomes nullable.
2. **Anyone browses.** The catalogue and the package page are public, signed out
   included. Importing needs an account. A signed-in user can report a package; an
   admin takes it down (audit logged).
3. **Any package moves as one rigid shape** that snaps to the hex grid: one system, a
   subsector or a sector all move the same way.
4. **A piece may land anywhere, charted space included.** Placed systems replace the
   chart's systems in that campaign only. The preview lists every hex it would replace
   before the person confirms.
5. **Updates:** a campaign keeps its imported copy. When the author publishes a newer
   version, the campaign shows "update available"; the referee takes it or ignores it.

## Facts already found (check them; do not take them on trust)

- **A stored tree carries its own location.** Regina's live v10 tree
  (`https://cdn.traveller.voyage/objects/b6272eab87eebb66b3afb38028b2c4f47cf2ed3b2f72055f6b4da4946681e310`)
  has top-level `hexKey`, and `hexId: "Spinward_Marches/1910"` and
  `parentId: "Spinward_Marches/1910-GG-pre"` inside bodies. A placed copy must rewrite
  every such field, so it is a new object with a new hash.
- Hex keys are `<sector_slug>/<ccrr>` on an offset hex grid (32 columns by 40 rows a
  sector, `packages/engines/src/core/hex.js` 26 and 57; subsectors A to P of 8 by 10). Shifting a shape by an odd number of columns on
  an offset grid changes which hexes neighbour which, unless the shift is done in cube
  or axial coordinates.
- The Worker refuses a generate that spans more than one sector ("The limit is one sector
  per request."). An install copies; it does not generate.
- A universe has a byte quota (250 MB) and a daily cap of 100 generated systems
  (`budget.ts`); say whether an install counts against either.

## Phase 1 — audit and contract (this go)

1. **Audit the stub against its contract**: what is built, what differs, what is
   missing for the five answers. Short, in the report.
2. **Location census**: a test, `tests/generation/package_location_fields.test.js`, that
   walks every tree in `tests/golden/fixtures/engine_1.2.0/` and lists **every** field
   (by path pattern) whose value names a hex key, hex id or sector slug, and fails if a
   new one appears. Tests may only read tracked files: `universe/raw/*.tsv` other than
   `Spinward_Marches.tsv` is git-ignored and absent on CI.
3. **The contract.** Extend `directives/contracts/b_marketplace.md` with new sections
   (keep the stub's text; mark each new route **contract only**). For every route: who
   may call, body, answer, every error sentence (plain, Google style, as the stub's),
   storage, the shared zod names. Cover:
   - Publishing from an own map (answer 1): what `baseHash` means with no chart.
   - The public catalogue and package page (answer 2): signed-out reads of non-hidden
     packages; search `q`, `kind`, `tag`, sort; what the card adds (`installs`,
     `updatedAt`). Report and takedown.
   - **Import in place**: `GET /api/universes/:id/install/preview` and
     `POST /api/universes/:id/install`: the three-way merge of `data_model.md` §7, a
     snapshot first, `provenance: { packageId, version }` on every written hex row and
     record, `package_installs`, and the referee's per-hex choices on a conflict.
   - **Place elsewhere** (answers 3, 4): the same two routes with a placement. Define the
     placement exactly (an anchor hex, an offset, or both) and settle:
     - Rigid shifts on the offset grid (the odd-column case), with a worked example.
     - A piece that crosses a sector or subsector edge.
     - Landing in empty space where no sector exists: what is created (an own sector?
       which slug and position?) and how §5's band rule changes now that answer 4 lets
       a piece land in charted space.
     - The rewrite: every field from the census, the routes and border lists in the
       package, and campaign records and journal anchors that name a hex. Where it runs:
       one pure, deterministic module in `packages/shared` or `packages/generation`,
       never `packages/engines` (engine output is pinned; nothing here changes it).
     - The preview's answer per hex: `new`, `replaces chart`, `replaces own`,
       `conflict`, `already installed`.
   - **Updates** (answer 5): how a campaign learns a newer version exists (a field on its
     list of imports, not a push), and that taking it is the same preview and install,
     its placement remembered.
   - Migration `0015_*.sql` if one is needed: it must be safe in either order (the
     Worker deployed before or after it), as every migration here.
   - Limits: the stub's (1,280 hexes, 500 records); whether an install counts against
     the byte quota and the daily cap.
4. **Phases 2 to 4 as recipes**: at the end of the contract, a numbered build plan for
   phases 2, 3 and 4 below, naming each file and test. Adjust the split if the code says
   otherwise, and say why.

Anything that is Johnny's (a product behaviour the five answers do not cover, or any
Traveller rule) goes under "Questions for Johnny" in the report, recommendation first,
spelled out in full. Do not decide it. State no Traveller rule from memory.

**Phase 1 may write only:** `directives/contracts/b_marketplace.md`,
`tests/generation/package_location_fields.test.js`, notes under
`findings/marketplace/`, `directives/reports/z_marketplace_1.md`. Gates: `npm test`,
`npm run check`, pasted.

## Phase 2 — server: own maps, the public catalogue, import in place, updates (after a go)

Shared schemas, the migration if any, `routes/packages.ts`, the install routes, the
publish job's changes, report and takedown, with worker tests (`RUN_API_TESTS=1`) for
every route and every error sentence, including signed out, another account, a hidden
package, a conflict, an already-installed version and an update. Report
`directives/reports/z_marketplace_2.md`.

## Phase 3 — placement (after a go)

The pure rewrite module with unit tests (every census field moved; a round trip that
moves a piece away and back gives the original hashes; the odd-column case), then the
preview and install with a placement, with worker tests including a piece over charted
space and a piece across a sector edge. Report `directives/reports/z_marketplace_3.md`.

## Phase 4 — browser (after a go; the orchestrator lends the files then)

The store in `apps/web/src/marketplace/`, the screens in `apps/web/src/workspace/market/`:
the catalogue and the package page (signed out), Import with its preview, and placement
by dragging the piece's outline on the map before confirming (`views/MapView.vue` and
`map/` are Lane D's; you get a lend at that point, not before). Shots in a real browser.
Report `directives/reports/z_marketplace_4.md`.

## Working rules (every phase)

- No git (read-only commands are fine), no deploy, no secrets, no `rules/`, `js/`,
  `hex_map.html`, `style.css`. Do not edit `directives/board.md` or `handoff.md`.
- `npm run check` must pass: no globals, no native dialogs, no hex colours outside
  `design/tokens.css`. Copy follows Google's developer style: short, plain, no flourish.
- Other lanes are working this turn: A in `workspace/CharacterSheet.vue`,
  `workspace/character_sheet.ts`, `apps/api/src/character/widgets.ts`,
  `packages/shared/src/character_extra.ts`; D in `workspace/Lightbox.vue`,
  `PersonCard.vue`, `PlanModal.vue`, `workspace/build/`, `design/base.css`; E in
  `apps/web/src/shell/`, `map/camera.ts`. A failure in their files during your gates goes
  under "Needs from others"; do not fix it.
- Browser work (phase 4): start Vite with its own cache directory; a local API has no truth files, so put
  `truth-local/v10/overview.json` in its bucket or the chart's dots are blank.
- After each meaningful step append one line under Progress below: "done: X. next: Y."
- Each report from `directives/reports/_TEMPLATE.md`: what was written, what was
  skipped, every question, the gates pasted. Then stop.

## Progress

done: read the rules, prompt, stub contract, shared schema, routes, publish job, DO tables, geometry; checked the live Regina v10 tree (hexKey plus six body hexId/parentId paths, slug form). next: write the location census test.
done: tests/generation/package_location_fields.test.js, 17 location paths over 11 fixtures, 2/2 pass. next: extend contracts/b_marketplace.md.
done: contract sections F0-F11 appended to directives/contracts/b_marketplace.md. next: gates, then report.
done: phase 1 gates (npm test 1624 pass 0 fail 27 skipped; check clean) and directives/reports/z_marketplace_1.md. next: stop; wait for the go on phase 2.

## Orchestrator review of phase 1 (2026-10-14)

Accepted. Checked: the census test passes and walks only tracked files; own sector ids are
`~` + 26 Crockford (`hexes.ts` 113, `sector.ts`); the quota is `generate_queue.ts` 5-9 and
the cap is per user (`auth/allowance.ts`); the odd-column example is right (0201 (1,0)
to (2,1), still the down-right neighbour). `data_model.md` §5 is now corrected.

**Corrections for phase 2 and 3 (they change the contract; fold them in when phase 2 starts):**
1. **There is no band rule in the code.** An own sector may take any slot from −1000 to
   1000 (`SectorSlot`) that holds no chart sector and no other own sector (`refuseSlot`,
   `universe/sectors.ts` 107). F5's "own sectors made by hand stay in the band" is not
   true today; drop it. Report question 1 is moot: a placed install creates an own
   sector at any free non-chart slot, the same rule as the Builder. Reuse `refuseSlot`.
2. **"The piece does not fit on the map"** must use the `SectorSlot` bounds (−1000..1000),
   not the comment on `geometry.ts` 68, which describes the chart's drawn span and is not
   enforced anywhere.
3. **The census covers the fixtures' body shape, not the stored envelope.** Phase 3's
   test must also walk a real stored envelope: build one in the test with `generateHex`
   for `Spinward_Marches/1910` (the tracked TSV), and a hand-made tree, and pin
   `$.hexKey` plus the `$.body.*` paths. The live Regina v10 tree has exactly these:
   `$.hexKey`, `$.body.mgt2eData.{hexId,parentId}`, `$.body.mgtSocio.{hexId,parentId}`,
   `$.body.mgtSystem.hexId`, `$.body.mgtSystem.mainworld.{hexId,parentId}`,
   `$.body.mgtSystem.worlds[].moons[].{hexId,parentId}`; nothing in `derivation`.
4. Check that a snapshot **restore** path exists before F4 says "undo is the existing
   snapshot restore". If none exists, say so in the phase 2 report; do not build one
   without a go.

Phase 2 waits for Johnny's answers to report questions 2 to 6 (asked 2026-10-14). The
go will be written here.

## Phase 2 — GO (2026-10-14)

Johnny, "yes to all five" on your report questions 2 to 6, each as you suggested:
routes and border paths that leave the piece are dropped on publish (F7); a package for
another edition is refused, "This package is for a different edition."; a conflict is
theirs or mine per hex (per-field is later); a takedown hides the package and deletes its
manifests but keeps the content-addressed objects; an install counts against the 250 MB
quota and not against the daily cap. Question 1 is moot (review, correction 1).

Do F11 phase 2, steps 1 to 5, with the four review corrections above folded in. First
update the contract where the corrections change it (F5 band text, "does not fit",
F6 envelope note, F4 undo), then build.

**Phase 2 may write:**
- `directives/contracts/b_marketplace.md`
- `apps/api/src/db/migrations/0015_marketplace.sql` (new; safe in either order), `apps/api/src/db/schema.ts`
- `packages/shared/src/schemas/package.ts`, and its export line in `packages/shared/src/index.ts` if needed
- `apps/api/src/routes/packages.ts`, `apps/api/src/jobs/publish_queue.ts`, `apps/api/src/universe/publish_read.ts`
- `apps/api/src/universe/install.ts` (new), `apps/api/src/routes/installs.ts` (new), `apps/api/src/universe/UniverseDO.ts` (the two routes), `apps/api/src/index.ts` (mount lines only)
- `apps/api/src/universe/hexes.ts` and `universe/campaign.ts`: only what install needs (provenance on insert, history action `install`); say each change in the report
- **Takedown and restore go in a new `apps/api/src/routes/admin_packages.ts`**, mounted under `/api/admin/packages` in `index.ts`. Do **not** edit `routes/admin.ts`: it holds parked, unpushed truth-build hunks and is pushed by patch.
- tests: `tests/api/packages.test.js`, `tests/api/packages_migration.test.js`, `tests/api/install.test.js` (new), `tests/shared/package_schema.test.js` (new)
- `findings/marketplace/`, `directives/reports/z_marketplace_2.md`

The browser client keeps working unchanged in between (F2: signed in with no query
keeps the stub's answer). Phase 3 (placement) is not in this go.

**Gates:** `npm test`, `RUN_API_TESTS=1` for the worker suites you touch (and
`packages_job.test.js`), `npm run check`, `npm run typecheck`, `npm run build`, pasted.
The migration run both orders (Worker before and after). Then the report, then stop.
done: packages, install, migration, job worker suites and tests/shared/package_schema.test.js green. next: contract corrections, full gates, report.
done: phase 2 gates (npm test 1641 pass 0 fail 28 skipped; check clean; typecheck clean; build ok; worker suites packages, install, migration, job green) and directives/reports/z_marketplace_2.md. next: stop; wait for the go on phase 3.

## Orchestrator review of phase 2 (2026-10-14 11:30)

Accepted; in push 1.1.13. One correction for every later phase: **never change code to
keep a test green that is stale or wrong** (the "reports" to "flags" comment). Report the
test under "Needs from others" and leave it red. The orchestrator rewrote that guard.
Phase 3 waits for Johnny's answers to your three questions; the go will be written here.

## Phase 3 — GO (2026-10-14): placement, the package on imported records, undo an import

**Start only after push 1.1.13 is committed** (`git log -1` shows the 1.1.13 commit). Your
phase 3 files overlap that push's list; editing them before the commit would put
unfinished work in it. If the commit is not there, stop and write that in Progress.

Johnny, "yes to all four" (2026-10-14):
- Your question 1: imported records name their package. Add a `package` mode to
  `CampaignProvenance`: `{ mode: 'package', packageId, version, installId, at }`. Today's
  `copy` and `shared` stay valid; `packages/shared/src/campaign_copy.ts` and every reader
  must still parse old rows.
- Your question 2: build the restore of an import's undo point, as part B below, after
  placement.
- Your question 3: a takedown keeps a private manifest copy so restore can bring it back,
  as you built. No change.
- D's picker fade stays. Nothing for you.

### Part A: placement (F11 phase 3, with the four review corrections)

1. `packages/shared/src/package_place.ts` (new, imports nothing): `placeKeys`,
   `placeTree`, `placeSummary`, `placeRecord`, `placeLists`, as F5. `Placement` in
   `schemas/package.ts`.
2. The census (correction 3): extend `package_location_fields.test.js` to build a stored
   envelope with `generateHex` for `Spinward_Marches/1910` (the tracked TSV) and a
   hand-made tree, and pin `$.hexKey` and the `$.body.*` paths.
3. `tests/generation/package_place.test.js`: every census field moved; the F5 odd-column
   example; a piece across a sector edge; a round trip (away and back) gives the original
   hashes; determinism.
4. `install.ts` and `routes/installs.ts` take `placement`; own-sector creation at a free
   non-chart slot through the Builder's existing rule (`refuseSlot`, `universe/sectors.ts`),
   bounds from `SectorSlot`; "update available" reuses the stored placement.
5. Records: anchors rewritten; provenance `package` mode (above).
6. Worker tests in `install.test.js`: a piece over charted space (`replaces chart`, the
   truth untouched), across a sector edge, into empty space (a sector created), an update
   keeping its placement, an edition refusal with a placement.

### Part B: undo an import

Contract first (a new F section): `POST /api/universes/:id/snapshots/:snapshotId/restore`,
owner only, **`install` snapshots only** in this pass (others: 400 `validation` with a
plain sentence). It puts back every captured hex row and record exactly as captured
(rows the install created are removed), writes history action `restore`, marks the
`package_installs` row removed (the imports list shows `removed: true`), and refunds the
quota charge for objects nothing else in the universe points at, or says in the report
why not. All or nothing in one Durable Object call. A second restore of the same snapshot
is 409 `conflict` with a plain sentence. A restore after a later edit to one of the same
hexes: say what happens in the contract (suggested: refused, 409, listing the hexes),
and put it under questions if you are unsure.

**Phase 3 may write:** `directives/contracts/b_marketplace.md`;
`packages/shared/src/package_place.ts` (new), `packages/shared/src/index.ts`,
`packages/shared/src/schemas/package.ts`, `packages/shared/src/schemas/campaign.ts` (lent:
`CampaignProvenance` only), `packages/shared/src/campaign_copy.ts` (lent, only if the new
mode needs it); `apps/api/src/universe/install.ts`, `routes/installs.ts`,
`universe/UniverseDO.ts` (routes), `universe/hexes.ts`, `universe/sectors.ts` and
`universe/campaign.ts` (additions for install and restore only; name each in the report);
`apps/api/src/db/migrations/0016_*.sql` only if D1 needs it (safe in either order);
tests: `tests/generation/package_location_fields.test.js`,
`tests/generation/package_place.test.js` (new), `tests/api/install.test.js`,
`tests/api/install_restore.test.js` (new), `tests/shared/package_schema.test.js`;
`findings/marketplace/`, `directives/reports/z_marketplace_3.md`. Not `routes/admin.ts`.

**Gates:** `npm test`, `RUN_API_TESTS=1` for every suite you touch plus
`tests/api/packages.test.js`, `packages_job.test.js` and the campaign suites (the
provenance change), `npm run check`, `npm run typecheck`, `npm run build`, pasted. One
report for parts A and B, then stop. Phase 4 (browser) is a separate go.
done: phase 3 start (1.1.13 commit cfe88a4 present); CampaignProvenance package mode, Placement/OwnSectorPlan/InstallRestored schemas, packages/shared/src/package_place.ts, census extended with a flesh-mode Regina envelope and a hand tree, tests/generation/package_place.test.js green. next: placement in install.ts and routes/installs.ts.
done: part A placement built (install.ts, routes/installs.ts, sectors.ts makeImportSector) with Worker tests in install.test.js green; package_schema.test.js moved to the new shapes. next: contract F13, then restore route and install_restore.test.js.
done: part B contract F13, restore route (DO /install/restore, POST /api/universes/:id/snapshots/:snapshotId/restore), migration 0016, install_restore.test.js green. next: gates and report.
done: phase 3 gates green (npm test 1657/0/29 skipped; API suites install, install_restore, packages, packages_job, packages_migration, campaign x4 all pass; check, typecheck, build ok); report directives/reports/z_marketplace_3.md. next: stop; phase 4 is a separate go.
