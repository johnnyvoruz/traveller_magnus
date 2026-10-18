# Z z_marketplace_4b report
Prompt: prompts/z_marketplace.md (phase 4b, with the 15:45 addition)
Status: done

## Changed files
- apps/api/src/routes/packages.ts (item 5):
  - `GET /api/packages/:id` now returns a hidden package to an admin (`roleSatisfies`), with `hidden: true` and `takedownReason`. Everyone else still gets the 404.
  - `?hidden=1` lists only hidden packages, for admins only. Anyone else, signed out or signed in, gets 403 `forbidden`, "Role required."
- packages/shared/src/schemas/package.ts: `PackageCatalogueQuery.hidden` (literal "1") and an optional `PackagePublicPage.takedownReason`. Both are schema fields the item needs.
- tests/api/packages.test.js: hidden page as a non-admin (404), as an admin (200, with the reason), and `?hidden=1` signed out, as a reader, and as the author (403 each), then as an admin (200, hidden only).
- apps/web/src/marketplace/catalogue.ts: the catalogue query takes `hidden`.
- apps/web/src/workspace/market/PackagesView.vue:
  - Any 404 shows "Listing not found." with Back to the Marketplace.
  - An admin sees "Hidden. Reason: ..." and Restore, plus a Hidden filter in the catalogue that only admins see (`?hidden=1`).
- apps/web/src/workspace/market/place.ts:
  - Added `hexWords` and `landingWords`.
  - "Already imported" became "Already the same": the server's outcome means the tree is identical.
  - `placementWords` uses the address in words.
- apps/web/src/workspace/market/PlaceMarks.vue:
  - The outline recomputes once the map learns the piece's sectors. Before this, a charted package always read "The piece cannot go there." because the chart loads after the outline.
  - The bar now says "N hexes, starting at Spinward Marches 3110." instead of raw ids.
- apps/web/src/workspace/market/MarketAsk.vue: the reason box's state was named `text` and hid the `text` prop, so every modal sentence (Remove, Report, Take down) was blank. Renamed to `reasonText`.
- apps/web/src/workspace/market/ImportPanel.vue: the campaign select has `aria-label="Campaign"`, and "Placed, starting at ..." is in words.
- Lent apps/web/src/views/MapView.vue (placement only): the outline is centred on the first draw after the camera is placed (`centrePlacing`), not on mount. On mount it landed at `~slot_0_0`, off screen.
- tests/web/market_place.test.js (new):
  - The client agrees with `placeCells`/`placeKeys` in place, for an odd and an even column drag, across a sector edge (sideways and down), and onto empty space.
  - Off the map and a bad anchor are refused.
  - `anchorUnder`, plus the outcome, preview, Remove, placement and landing sentences.
- tests/web/market_catalogue.test.js (new):
  - The URL, method and body of every call: catalogue filters, `mine=1`, `hidden=1`, cursor, report, takedown, restore, installs, preview with and without placement or an import id, install, and DELETE.
  - Server sentences, status and details pass through unchanged, and unreadable replies fall back to the read-failed sentence.
  - `versionKeys`.
- findings/marketplace/ (scripts for the pass):
  - setup.mjs: its own wrangler.toml with a throwaway local secret, so `.dev.vars` is never read, plus three local accounts and the v10 metadata.
  - seed_objects.mjs, api.mjs, vite.config.mjs (its own cache, and `/cdn/` serving `packages/*` from the local bucket), drive.mjs, start.ps1, p1 to p8.

## Gates
npm test:      pass (1704 tests, 1675 pass, 0 fail, 29 skipped)
npm run check: pass
typecheck:     pass
fourth gate:   build pass (index-Bs_zP0ph.js).
- RUN_API_TESTS=1 on a fresh persist dir: install, install_delete, packages, packages_job and packages_migration pass 8/8.
- Browser pass: done on my own ports: API 8819, Vite 5219 (cache findings/marketplace/vite_cache_z), Edge 9419. All stopped after: PIDs 54208/52752 API, 59792 Vite, 22996 Edge; nothing listens on those ports now.

## Browser pass (shots findings/ui_design_shots/kb18_market_*)
- **Signed out:** the rail item, the catalogue, a package page with its outline (33 hexes), and a wrong id showing "Listing not found." (rail_out, catalogue_out, page_out, notfound_out). Taken at 1600 and 520, except notfound_out, which is 1600 only.
- **Reader, signed in:** the catalogue with Imports, and the package page (catalogue_in, page_in), at 1600 and 520.
- **In-place import with a conflict:** Regina subsector into a campaign where the reader kept their own system at Spinward Marches 1701. One conflict, Mine chosen, 32 hexes already the same. Import opens /s/Spinward_Marches/1701, which shows "Reader star" (conflict, preview, result).
- **Placed import:** Zed Reach cluster from an own map, dragged across the Deneb/Corridor edge onto charted space. The server placed it on Deneb 3110, 3111, 3210, 3211 and Corridor 0110 (place_start, dragging, placed_preview, placed_result). Also taken at 520 onto Spinward Marches 1808.
- **Update:** the author published v2 (6 hexes). The importer saw Update available and updated; the placement stayed `Deneb/3110` (update_available, update_preview, update_result).
- **Remove:** "Removes 6 systems and 0 records that came from this package, including any you changed." Then the row is gone (remove, removed).
- **Second import:** placed into the campaign that holds the package. Refused with "This campaign already has this package. Remove it first, or take its update." (second_import).
- **Report:** "Thanks. An admin will look at it." (report, reported).
- **Admin:**
  - Take down: "It leaves the catalogue..." (takedown).
  - Signed out and the reader see "Listing not found." for the hidden package and for a wrong id (notfound_hidden_out, notfound_hidden_in).
  - The admin sees Hidden, the reason and Restore (hidden_admin).
  - The admin-only Hidden filter (hidden_filter): the reader has no filter, and `?hidden=1` for the reader shows the normal list.
  - Restore makes it public again (restore).
- Horizontal overflow is 0 at both widths, and the page logged no errors.

## Item 2, manifests
- Locally: `VITE_CDN_BASE=http://localhost:5219/cdn`. The pass's Vite serves `packages/*` from the local bucket through `wrangler r2 object get --pipe` and passes everything else to the real CDN.
- Production: `https://cdn.traveller.voyage/truth/v10/overview.json` answers 200. The production catalogue is empty (`{"items":[]}`), so there is no published manifest to fetch. A made-up `packages/pk_none/1/manifest.json` answers 404, which is the expected miss.

## Not done through the UI
- The author's packages and the v2 publish, the conflict edit, and the second campaign were made through the API (findings/marketplace/api.mjs, conflict.mjs, v2.mjs), not with Build and Publish selection.
- No 520 shots of the in-place import result, the update result, Remove confirmed, the second import, report, takedown or restore. Those were 1600 only.

## Contract published
none. The admin hidden read and `?hidden=1` are covered by this report.

## Needs from others
- none

## Notes
- **Foreign uncommitted edits, untouched:** design/base.css, views/Account.vue, workspace/StardateChip.vue, workspace/build/OrbitPicker.vue, routes/admin.ts, AccountMenu.vue, passkey/*, jobs/*, directives/prompts/d_small_polish.md, versionvideo/, and the earlier list.
- **Reports moved:** someone moved `reports/z_marketplace_4.md` to `reports/done/`.

## Questions for Johnny
1. A second in-place import of a package the campaign already holds in place is not refused today. The 3c server takes it as the same import, a re-apply. Only a placed copy, or a copy of a placed import, gets the 409 sentence. Suggested: keep this, and say so in the contract. The alternative is to refuse every second import, including in place.
2. An admin's view of a hidden package has no outline and no Import, because takedown deletes the manifests. Suggested: keep it that way.