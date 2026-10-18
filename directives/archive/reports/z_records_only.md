# Report: z_records_only

## Prompt

`directives/prompts/z_records_only.md`, built to the orchestrator's answer at its foot (2026-10-15 22:20). The earlier halt is filed as `reports/done/z_records_only_halt.md`.

## Status

Done. All gates pass.

## Changed files

- `packages/shared/src/schemas/package.ts`:
  - `PackagePublish.hexKeys` has no minimum.
  - `InstallPreview.records.anchorsDropped` is an optional non-negative int.
- `apps/api/src/routes/packages.ts`: a version with no hexes and no records is 400 `validation`, "A package needs at least one hex or one record." The caps are unchanged.
- `apps/api/src/routes/installs.ts`, in `load()`, for a package whose manifest has no hexes:
  - A placement is 400 `validation`, "Invalid request." This covers the preview's `anchor`/`to` and the install's `placement`.
  - A system anchor with a `~` key is set to null and counted. Chart anchors are kept, and nothing is rewritten.
  - `answerOf()` sends `records.anchorsDropped` on every preview.
- Not changed: the publish job and `universe/install.ts`. Both already handle an empty `hexes` map, and the new suite shows it.
- `directives/contracts/b_marketplace.md`: new section "Records-only packages (F18)" for Lane D. It covers the publish entry, the card and the page without the hex box, and import without placement or anchors.
- `tests/api/install_records_only.test.js` (new) runs on its own wrangler dev, port 18889. It covers:
  - the empty publish refused;
  - a records-only publish (manifest `hexes` `{}`, `hexCount` 0);
  - a preview on another truth version (`anchorsDropped` 1);
  - a placement refused on both the preview and the install;
  - an install in place (chart anchor kept, own-sector anchor null, provenance `package`).
- `tests/shared/package_records_only.test.js` (new): schema checks.
- `tests/shared/package.test.js`: one assertion now expects an empty publish to pass the schema. The route refuses it now.
- `directives/prompts/z_records_only.md`: Progress lines.
- Example packs: not changed.

## Gates

- `npm test`: 1828 tests, 1791 pass, 0 fail, the rest skipped.
  - `tests/web/store_scroll.test.js` failed once in the full run and passed alone and on the rerun. It belongs to another lane, and I didn't change it.
- `npm run check`: manifesto clean.
- `npm run typecheck`: clean.
- With `RUN_API_TESTS=1`, each suite on its own port and state: packages 1/1, packages_job 4/4, install 1/1, install_delete 1/1, install_links 1/1, packages_migration 1/1, install_records_only 1/1.
- Servers: each suite starts and stops its own wrangler dev. No wrangler or workerd process was left.
- Nothing ran against production.

## Contract published

`directives/contracts/b_marketplace.md`, section "Records-only packages (F18)". The only new wire field is `records.anchorsDropped`.

## Needs from others

Lane D needs to build:

- a publish entry from records;
- a page that hides the hex box when `hexCount` is 0;
- an import with no placement step;
- a dropped-anchors notice when `anchorsDropped` is above 0.

## Questions for Johnny

1. Should the example packs become records-only? Recommended: leave them until this ships and Lane D's page is in. This is your call, per the answer.
2. Is the anchor count on the install answer needed as well as the preview? Recommended: no, the preview is enough and the prompt lists nothing else on the wire.
