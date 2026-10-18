# Z z_marketplace report (phase 1: audit, contract, location census)
Prompt: prompts/z_marketplace.md
Status: done (phase 1 only; phases 2 to 4 wait for a go)

## Changed files
- tests/generation/package_location_fields.test.js: new. Walks the 11 engine 1.2.0 fixtures and pins 17 location paths; fails on any new or vanished one.
- directives/contracts/b_marketplace.md: stub text kept; sections F0 to F11 appended, every new route marked contract only.
- directives/prompts/z_marketplace.md: Progress lines only.
- directives/reports/z_marketplace_1.md: this report.

## Audit of the stub against its contract
- Built as the contract says: create, publish (queue job), own list, page, version progress; 1280 / 500 / 100-version caps; the error sentences match.
- Differs: none found in behaviour. The contract's "Later" list is all still missing.
- Missing for the five answers: (1) the chart refusal is in three places (two routes and runPublish), D1 `packages.truth_version` is NOT NULL, `PackageManifest.truthVersion` is a required string; (2) every read is author-only, no catalogue query, no report or takedown route or table; (3, 4) no install, no placement, no rewrite; (5) no `package_installs`, no install list. `lists` publishes empty-array hashes.
- Prompt facts checked: the live Regina tree holds `hexKey` plus hexId/parentId in body (confirmed). Two prompt facts are wrong: own sector slugs are `~` + 26 Crockford in code (`sector.ts` 12), not `handle~Name` as `data_model.md` A5 says; and the 250 MB quota and 100-a-day cap are not in `budget.ts` (quota: `generate_queue.ts` 9; cap: `auth/allowance.ts` 9, per user, not per universe).

## Gates
npm test:      pass (1651 tests, 1624 pass, 0 fail, 27 skipped)
npm run check: pass (manifesto: clean)
typecheck:     not run (no TS written in phase 1)
fourth gate:   n/a

## Contract published
contracts/b_marketplace.md, sections F0 to F11

## Needs from others
- Orchestrator: `data_model.md` A5 says own slugs are `handle~Name`; code uses `~` + 26 Crockford. One line to make the spec true.

## Questions for Johnny
1. A placed piece that lands in empty space outside the Homebrew Expanse band: may the install create an own sector there? Suggested: yes; the band rule stays for sectors made by hand, and a slot holding a chart sector never gets an own sector (its hexes become campaign-only overrides).
2. Routes and borders that leave the published piece: suggested: drop them on publish; keep only routes and border paths with every end inside the piece.
3. Installing a package whose edition differs from the campaign's default edition: suggested: refuse with "This package is for a different edition."; allowing it is a later decision.
4. Per-field merge on a conflict (data_model A7 names theirs / mine / per-field): suggested: theirs or mine per hex now; per-field later.
5. Takedown: suggested: hide the package and delete its manifests, but keep the content-addressed objects, because installed campaigns and other packages share them. The api.md row says "deletes public objects".
6. Does an install count against the 250 MB quota and the 100-a-day cap? Suggested: the quota yes (it stores bytes), the daily cap no (it copies, it does not generate).