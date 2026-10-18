# Lane Z — the record count on the catalogue card

Issued 2026-10-17 by the orchestrator. You may be a fresh session with no memory. Read
`CLAUDE.md`, `directives/manifesto.md`, `directives/board.md`, `directives/lanes/Z.md`,
`directives/contracts/b_marketplace.md`, then this file. No git but read-only, no deploy, no `rules/`.

## Johnny's word (2026-10-16)
Yes to D's question: a records-only card should read "People · 12 records", not "People · Records
only · 1 import".

## Today
- `PackageCard` (`packages/shared/src/schemas/package.ts` 130) has `hexCount` and no `recordCount`.
- `routes/packages.ts` `listingOf` (about line 120) reads `hex_count` from `package_versions` for the
  latest version, one query per card.
- The browser already shows the count when it is present (`storefront.ts` `sizeWords`). Lane D
  changes nothing.

## Do
1. `PackageCard.recordCount`: **optional**, a non-negative int, from the latest version (the same
   version `hexCount` comes from). Optional because the schema is `.strict()` and an open tab must
   still parse an older server's card, and the reverse.
2. Read it in the **same** query as `hexCount` (`SELECT hex_count, record_count ...`): no second query per card.
   A package with no done version sends `recordCount: 0`, like `hexCount`.
3. Every route that answers a `PackageCard` sends it: the catalogue, My packages, Hidden and the page's
   card. Name each in your report.
4. Contract: one line in `contracts/b_marketplace.md`, in the card's field list and in "Records-only packages".

## Gates
- `npm test`, `npm run check`, the typecheck.
- Shared tests: a card with and without `recordCount` parses; a negative one is refused.
- The worker suites on your own `wrangler dev`, port and state: `packages`, `install_records_only`, with
  one assertion that a records-only package's card carries its `recordCount`.

## Report
Write `directives/reports/z_card_record_count.md` from the template.

**Owned:** `apps/api/src/routes/packages.ts`, `packages/shared/src/schemas/package.ts`,
`contracts/b_marketplace.md`, tests under `tests/api/` and `tests/shared/`, your report.

After each meaningful step, append one line under Progress: "done: X. next: Y."

## Progress

done: PackageCard and PackagePublicPage gain optional recordCount; packages.ts reads hex_count and record_count in one query (countedListingOf) for every card (catalogue, mine=1, hidden=1, the page); contract lines at the card field list and Records-only packages; shared and API assertions added. next: gates.
done: gates pass (npm test 1845/1808 pass 0 fail; check clean; typecheck clean; packages, install_records_only, packages_job, install, packages_migration pass; no server of mine left); report directives/reports/z_card_record_count.md written. next: orchestrator review.
