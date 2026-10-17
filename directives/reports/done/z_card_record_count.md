# Report: z_card_record_count

## Prompt

`directives/prompts/z_card_record_count.md` (issued 2026-10-17). Johnny's word: a records-only card reads "People · 12 records".

## Status

Done. All gates pass.

## Changed files

- `packages/shared/src/schemas/package.ts`:
  - `PackageCard.recordCount`: optional, an integer, 0 or more.
  - `PackagePublicPage.recordCount`: the same. The page is `.strict()` and spreads the card, so it needs the field too.
- `apps/api/src/routes/packages.ts`:
  - New `countedListingOf` reads `hex_count` and `record_count` in one query, from the latest version that `hexCount` already used. With no version it gives 0 for both.
  - `listingOf` wraps it, so the listing shape is unchanged.
  - `cardOf` sends `recordCount`. No second query per card.
- Routes that answer a card, all through `cardOf`:
  - the catalogue, `GET /api/packages` with catalogue params;
  - My packages, `?mine=1`;
  - Hidden, `?hidden=1`, admin only;
  - the page's card, `GET /api/packages/:id`.
- Not changed: the author's stub list (`GET /api/packages` with no catalogue params). It answers `PackageListing`, not a card (contract F2, line 526).
- `directives/contracts/b_marketplace.md`: `recordCount` added to the `PackageCard` field list. The "Records-only packages" card line now names it.
- `tests/shared/package_card_count.test.js` (new): the card and the page with and without `recordCount`; -1 and 1.5 refused.
- `tests/api/packages.test.js`:
  - the catalogue card's and the page's `recordCount` equal the latest version's;
  - an unpublished package on `mine=1` counts 0.
- `tests/api/install_records_only.test.js`: the records-only card carries 3 on the catalogue (`kind=people`) and on `mine=1`, with `hexCount` 0. The page carries 3.
- `directives/prompts/z_card_record_count.md`: Progress lines.

## Gates

- `npm test`: 1845 tests, 1808 pass, 0 fail, 37 skipped.
- `npm run check`: manifesto clean.
- `npm run typecheck`: clean.
- With `RUN_API_TESTS=1`, each suite on its own wrangler dev port and state:
  - packages 1/1, install_records_only 1/1;
  - also packages_job 4/4, install 1/1, packages_migration 1/1.
- Servers: each suite started and stopped its own wrangler dev. None of mine were left.
  - Two short `wrangler r2 object get` processes, PIDs 25200 and 5400, ran on `findings/examples/local_covers` during the full test run.
  - They weren't mine, and both had exited when I checked at 12:10 PM (UTC-5).
- Nothing ran against production.

## Contract published

`directives/contracts/b_marketplace.md`: the `PackageCard` field list and the "Records-only packages" card line. Lane D changes nothing (`storefront.ts` `sizeWords` already reads the count).

## Needs from others

None.

## Questions for Johnny

1. Should the author's stub list (`PackageListing`) carry `recordCount` too? Recommended: no. It isn't a card, and the prompt names only cards.
