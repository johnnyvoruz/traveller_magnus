# Lane Z — packages with records and no hexes

Issued 2026-10-15 by the orchestrator. **Start after `z_cover_seed` is reported.** You may be a
fresh session. Read `CLAUDE.md`, `directives/manifesto.md`, `directives/board.md`,
`directives/lanes/Z.md`, `directives/contracts/b_marketplace.md`, then this file. No git but
read-only, no deploy, no `rules/`.

## Johnny's words (2026-10-15)

"I see that there's always one hex, can we just have campaign elements that don't need a hex
attached?"

## Today

`PackagePublish.hexKeys` is `z.array(HexKey).min(1)` (`packages/shared/src/schemas/package.ts`),
so every package carries at least one hex. A pack of people or patrons carries a hex only
because the schema requires one: "Regina highport contacts" reads "People · 1 hex".

## Decided (orchestrator; build it)

1. **A version may have 0 hexes.** `hexKeys` becomes `min(0)`, and a version needs at least one
   hex **or** one record. Otherwise the answer is 400 `validation`, with the sentence "A package
   needs at least one hex or one record." Caps unchanged.
2. **The manifest of a records-only version** has an empty `hexes` map, and `hexCount` is 0.
   `truthVersion` and `edition` are recorded as today: they describe where the records came
   from.
3. **Import of a records-only package:**
   - It has no placement. "In place" and "placed on the map" don't apply, and a `placement` in
     the request is 400 `Invalid request.`
   - The preview lists records only (`add`, `replace`, conflicts as today), and the install
     writes them with provenance as today.
   - It goes into a campaign on any truth version.
4. **Anchors on imported records.** First read what the install does today with a record
   anchored to a hex that is not in the package, and keep that behaviour if it exists. If
   nothing defines it, use these rules:
   - An anchor to a chart hex (a `Sector/0000` key) is kept when the target universe's truth
     version equals the package's, and dropped otherwise.
   - An anchor to an own-sector hex (`~` key) is always dropped.
   - The preview counts the dropped anchors (`records.anchorsDropped`).
   - A dropped anchor leaves the record unplaced. The record itself is never refused.

   If the existing behaviour contradicts these rules, stop and report: Halt & Challenge.
5. **The catalogue and the page** already carry `hexCount` and `recordCount`. Nothing new on
   the wire beyond `anchorsDropped`.
6. **Contract:** add a section "Records-only packages" to `contracts/b_marketplace.md` with the
   rules above and every sentence, written for Lane D. D builds the screens after your report:
   - a publish entry from the campaign's records;
   - the card's facts;
   - the product page without the hex box;
   - import without placement.

## Also

List the example packs (`tools/examples/packs*/`) that carry a hex only because one was required.
For each, recommend whether its next version should be records-only. **Change none of them** in
this pass: re-seeding is Johnny's call.

## Gates

- `npm test` and `npm run check`.
- The worker suites, run against your own `wrangler dev` on your own port and state:
  - `packages`, `packages_job`, `install`, `install_delete`, `install_links`, `packages_migration`;
  - a new suite for a records-only package: publish, preview, install in place, install with a
    placement refused, and an anchor dropped across truth versions.

## Report

Write `directives/reports/z_records_only.md` from the template.

**Owned:**
- the marketplace server: `routes/packages.ts`, `installs.ts`, `universe/install.ts`;
- the publish job;
- `packages/shared/src/schemas/package.ts`;
- `contracts/b_marketplace.md`;
- tests under `tests/api/` and `tests/shared/`;
- your report.

After each meaningful step, append one line under Progress: "done: X. next: Y."

## Progress

done: read today's anchor behaviour (kept unchanged in place and outside a placement: installs.ts load/place, package_place.ts:131, contract :463); it contradicts Decided item 4, so Halt & Challenge with three options; example packs listed, none changed; report written, Status blocked. next: orchestrator's answer on anchors.

## Answer to the halt (orchestrator, 2026-10-15 22:20)

Your reading is right, and the prompt's rule 4 was wrong to add a truth-version rule that the
install never had. **Decided:**

- **Packages with hexes:** unchanged (F6 as today).
- **Records-only packages:**
  - **Chart anchors (`Sector/0000`):** kept, whatever the target's truth version, as an
    in-place import does today. A chart key names the same hex in every truth version.
  - **Own-sector anchors (`~` keys):** dropped on import, because they cannot resolve in
    another universe. Count them in `records.anchorsDropped` on the preview. The record stays,
    unplaced.
- **No anchor is ever rewritten** for a records-only package: there is no placement.

This is option 1, with the truth-version clause removed. Build items 1, 2, 3, 5 and 6 as written,
and item 4 as above. Write the contract section to match. Start again from the top: your earlier
report is filed as `reports/done/z_records_only_halt.md`.

**The example packs:** leave them as they are. Johnny decides on converting them after this ships.
