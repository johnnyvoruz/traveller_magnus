# B keep crash dots report
Prompt: prompts/b_keep_crash_dots.md
Status: done

Found: a frozen session had already fixed Keep in `packages/generation` and written the dots contract, route, and tests. The worker was not still running.
Finished: those tests and the gates. No new engine edit.
Backed out: nothing. Other dirty files outside this prompt were left as they were.

## Changed files
- packages/generation/src/form.ts: `physSeed` and the gas-giant copy turn `{ $num: "Infinity" | "-Infinity" | "NaN" }` back into a number, and they do not mark a non-number manual.
- packages/generation/src/overview.ts: `dotIndex`, `dotMark`, and `applyDotRows`.
- packages/generation/src/index.ts: exports those three.
- packages/shared/src/schemas/builder.ts: `BuilderDots`, `BuilderDotsPage`, and `BUILDER_LIMITS.dots` (32).
- packages/shared/src/index.ts: exports the two schemas.
- apps/api/src/routes/builder.ts: `GET /:id/hexes/:sector/dots` and `GET /:id/hexes/dots?sectors=`.
- apps/api/src/universe/hexes.ts: `GET /hexes/dot-rows`, one SQL read per sector.
- directives/contracts/b_builder.md: both routes, cell order, cost, and ETag.
- tests/generation/keep_crash.test.js: stored MgT2E rename, numeric round-trip, AoW, hand.
- tests/generation/dots.test.js: cell order and overlay.
- tests/api/builder_dots.test.js: Keep on the worker, chart overlay, own sector, page of 32.

## Gates
npm test:      pass (1465 tests, 1447 pass, 0 fail, 18 skipped)
npm run check: pass
typecheck:     pass
fourth gate:   pass. `RUN_API_TESTS=1` on ports 18831–18836, 18841, 18842: Keep rename, numeric round-trip is the unit test, dots for a charted sector with a generated system, a hand system, and a removed system, plus an own sector. The other Builder worker suites passed. Servers stopped. Golden and parity are in the green `npm test`. No fixture was edited by this pass.

The first `npm run build` failed in `apps/web/src/dossier/SurfaceStage.vue` while that file was mid-edit. A retry passed (`vue-tsc` clean, Vite built).

## Contract published
contracts/b_builder.md

## Needs from others
- Lane A: `GET /api/universes/:id/hexes/:sector/dots` returns `{ cells, stamp }`. `cells` is 1,280 characters in overview order: index `(col - 1) * 40 + (row - 1)`, column `floor(i / 40) + 1`, row `(i % 40) + 1`. `.` is empty. `ETag` is the quoted sha256 of `cells`. `If-None-Match` is 304.
- Lane A: `GET /api/universes/:id/hexes/dots?sectors=a,b,c` does the same for up to 32 sectors and returns `{ sectors: [{ sector, cells, stamp }], stamp }`. Owner only. 401 signed out, 404 for a stranger.
- Lane A: a chart sector starts from that version's overview string. A held row sets the first character of the UWP, or `?` when that character is missing or `.`. A removed row sets `.`. A sector of their own starts as 1,280 dots.

## Questions for Johnny
1. none

## What the Keep crash was
`stable()` stores a non-finite number as `{ $num: "Infinity" }`. A stored tree loads that back as an object. `physSeed` copied it onto the world and marked `solarDayHours` manual. `generateRotationalDynamics` (`packages/engines/src/mgt2e_world_engine.js` line 1692) then calls `toFixed` because the object is not the number `Infinity`. The gas-giant size copy had the same object. The engine file was not edited.

On the earlier failing run, 12 of 16 stored MgT2E systems had at least one wrapped solar day. The other four escaped because every `solarDayHours` was a finite number or null, so `stable()` left it as a number. That is why some fresh systems Keep and most do not. Lane D saw seven of eight.

The same restore covers `siderealHours`, `axialTilt`, `solarDayHours`, `eccentricity`, `albedo`, `greenhouseFactor`, `density`, `diamKm`, `mass`, and `gravity`, including a planted `Infinity`, `-Infinity`, and `NaN`, for an MgT2E top-down tree, an AoW bottom-up tree, and a hand rename.

This has been in the tree since `3d28e33` (2026-10-08), which is an ancestor of `cdb6385`. The live site's bundle is `1.1.5`, so the worker that is deployed still throws. The fix is on disk only.
