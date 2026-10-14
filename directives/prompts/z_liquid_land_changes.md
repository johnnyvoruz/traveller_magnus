# Lane Z — three changes to the 1.2.0 water and ice patch before it is pushed

Issued 2026-10-13 by the orchestrator. Read `CLAUDE.md`, `directives/board.md`,
`directives/lanes/Z.md`, `directives/reports/done/c_liquid_minimal_review.md` and
`findings/liquid_minimal_review.md` (Lane C's second read of your patch), then this
file. No git but read-only, no deploy, no production command, no `rules/`, no
Traveller rule from memory.

Your patch is on the working tree and the four gates pass there (2026-10-13 20:45:
`npm test` 0 fail, checker clean, typecheck, build). **It is not pushed, and v10 is
not to be uploaded, until the three changes below are in**: change 1 alters engine
output, so a push or an upload now would have to be done twice.

## Do, in this order

1. **The late exotic liquid die must not move any later roll.**
   `decideSurfaceLiquid(w, () => rng())` at `packages/engines/src/mgt2e_world_engine.js`
   line 2387 draws from the shared generator when an exotic body has candidates and
   no stored `liquidRoll` (`surface_liquid.js` line 65). That call comes before the
   belt, tectonic, biomass and biocomplexity rolls (lines 2412, 2439, 2455, 2519).
   Lane C measured it: 38 systems of a 281-hex sample, 52 late draws, and every one
   of the 38 had later `rng()` calls that moved. Draw that die on a side stream
   (`isolateRng`, `packages/engines/src/core/rng.js` line 38, or the same idea),
   seeded so that it is the same for the same body on every run. Add a test that
   fails if a late draw changes any roll after it. The chart lock's own shift (the
   skipped atmosphere and hydrographics rolls, lines 800 to 803 and 1419 to 1421)
   stays as it is.
2. **Regenerate what rule 4 pins**, after change 1 and from the engine as it then
   stands: `tests/golden/fixtures/engine_1.2.0/` and
   `tests/generation/parity_deviations_1.2.0.json`. The version stays 1.2.0 (nothing
   of 1.2.0 has been pushed). Report the ledger's row count before and after, sorted
   by cause as Lane C sorted them, and re-run your census: the six invariants and
   the Regina row.
3. **`tools/truth/upload_truth.js` refuses a version that is not `building`** before
   any R2 put or D1 write, on every path. Today `--endpoint <url>` writes with no
   `--yes`, missing keys fall back to `test` / `test` (line 169), and for a released
   version the sector-row upsert (lines 104 to 106) and the R2 puts (lines 171 to
   181) are not guarded. No fallback keys; `--yes` is required for every write that
   is not the local emulation. A test for each refusal in `tests/tools/`.
4. **Comments that describe the patch you withdrew.** Replace every comment that
   cites `findings/liquid_temperature_once.md` or says a mainworld temperature was
   rolled or held in a book band: `parity_deviations_1.2.0.json` line 4,
   `tests/generation/parity.test.js` line 18, `tests/golden/esm.test.js` lines 42 to
   44, and the census test and helper headers.

## Not yours in this pass

- `apps/api/` and `tests/api/` (Lane B has the two one-sector follow-ups,
  `prompts/b_one_sector_followups.md`).
- `apps/web/` (Lane C has the surfaces, `prompts/c_no_sea.md`).
- The book temperature roll: parked until Johnny decides it.

## How to work

In your copy, not in the repo, until all four changes pass there. Then apply them to
the repo in one step, check the files are byte-identical, and run the four gates
**in the repo** yourself (`npm test`, `npm run check`, `npm run typecheck`,
`npm run build`), pasted. Other lanes are editing `apps/`; a failure in their files
goes under "Needs from others". Start no truth build in the repo.

## Report

`directives/reports/z_liquid_land_changes.md` from `directives/reports/_TEMPLATE.md`.
Say plainly whether the local v10 build of 20:11 must be thrown away (it must, if
any stored value changed). Questions for Johnny in full, recommended answer first.
After each meaningful step append one line under Progress: "done: X. next: Y."

## Progress

- done: copy D:\webstorm\lane_z_land made from the working tree (20:49); baseline hashes of 1,735 systems taken. next: change 1.
- done: change 1, late liquid die on isolateRng keyed hex|liquid|world|moon|orbit (mgt2e_world_engine.js liquidDieKey); new tests/generation/liquid_late_die.test.js passes, and fails on the old wiring. 220 of 1,735 systems moved, exactly the 220 that take a late draw (343 draws). next: change 4 then 2.
- done: change 4, comments citing liquid_temperature_once.md replaced (parity.test.js, esm.test.js, census test and helper, ledger note). next: change 2.
- done: change 2, engine_1.2.0 fixtures and parity_deviations_1.2.0.json regenerated; ledger 456 rows before and after, all 456 identical, note rewritten; fixtures orbit_normalize_2 and profile_zeycude changed, nine unchanged. Census 2,135 hexes / 49,739 bodies: I1-I3, I5, I6 zero failures, I4R 2,641 counted, same before and after; test sample 281 hexes, 353 counted, Regina row passes. next: change 3.
- done: change 3, upload_truth.js refuses --endpoint/--remote without --yes, --endpoint without S3_ENDPOINT_* keys (no default, never R2_*), and any version that exists and is not building or whose state cannot be read, before any put or D1 write; every D1 statement guarded; r2_s3.js bulkPut refuses missing endpoint/keys. tests/tools/upload_truth.test.js 20 tests. next: apply to repo, gates.
- done: applied to the repo in one step (22 files, byte-identical). Gates in the repo: npm test 1639 / 1610 pass / 2 fail / 27 skipped (both failures from Lane C surface edits landed 20:57-20:59), check clean, typecheck pass, build pass. next: report.
