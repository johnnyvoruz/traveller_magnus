# Lane Z package-covers report
Prompt: prompts/z_package_covers.md
Status: done

## Changed files
- `apps/api/src/db/migrations/0019_package_covers.sql`: new. Adds `packages.cover_hash` and `packages.cover_thumb_hash`, and `package_versions.art_hash`, `art_thumb_hash`, `image_hashes` and `art_filled`. Lane B had not taken 0019.
- `apps/api/src/db/schema.ts`: adds those six columns only.
- `apps/api/src/routes/package_covers.ts`: new.
  - Works out the cover in Johnny's order: an upload, then record art, then null.
  - Adds `PUT` and `DELETE /api/packages/:packageId/cover`, with the WebP size read from the file header.
  - The "still named" check, the takedown and restore of an uploaded cover, and the lazy backfill.
- `apps/api/src/routes/packages.ts`: the catalogue and the page carry `cover`, and the cover routes are mounted. A hidden package shows no cover to anyone but an admin.
- `apps/api/src/routes/admin_packages.ts`:
  - Takedown moves an uploaded cover to `takedown/covers/<packageId>/<hash>`, and restore puts it back.
  - Both write `details.covers` to the audit log.
- `apps/api/src/jobs/publish_queue.ts`:
  - The publish job writes the record-art pair and every image hash on the version row.
  - The probe, `recordArt`, `storeArt` and `fillArt` live here, so `packages_job.test.js` still imports the job in node.
  - If the probe query errors, covers count as unavailable.
- `packages/shared/src/schemas/package.ts`: `PackageCover`, and `cover` on `PackageCard` and `PackagePublicPage`. The field is nullable and optional, so a card from an older server still parses.
- `packages/shared/src/index.ts`: one export line, for `PackageCover`.
- `tools/examples/build_local.mjs`: reads and checks a listing's `cover` (`coverFiles`), and uploads it through the route after publishing (`uploadCover`).
- `tools/examples/seed_production.mjs`:
  - The dry run names each cover pair.
  - `--apply` copies the pair. The script refuses a target without 0019.
  - `--remove --apply` deletes the cover objects no other package names (`coversToDelete`).
- `tools/examples/covers/feri-terraces{,_640}.webp` and `hollow-verge{,_640}.webp`: new.
  - Headless shots of the local map, with the map canvas 1600x900, signed in as the house account.
    - Feri terraces: `Spinward_Marches/2005`, zoom 70.
    - Hollow Verge: its own sector, zoom 140.
  - The full images are WebP at 1600x900; the `_640` thumbnails are 640x360. Both were made with `sharp`.
- The six `listing.json` files gained a `"cover"` line and nothing else. Lane A's four covers were already in `covers/` when I finished, so all six are done.
- `tools/examples/README.md`: a Covers section.
- Tests:
  - `tests/api/package_covers.test.js`: new, two tests (with 0019 and without).
  - `tests/shared/package_cover.test.js`: new.
  - `tests/tools/examples.test.js`: 3 new tests.
  - `tests/api/packages_migration.test.js`: the upgrade case now holds back 0019 with 0010, because 0019 alters `packages`. It also checks that the new columns arrive.
- `contracts/b_marketplace.md`: F17.

## Gates
npm test:      pass (1791 tests, 1756 pass, 0 fail, 35 skipped)
npm run check: pass
typecheck:     pass
fourth gate:   npm run build pass. API suites with `RUN_API_TESTS=1`:
- **With 0019:** packages, packages_job, packages_migration, install, install_delete, install_links, install_source_gone and package_covers. 11 of 12 passed on the run. The 12th, `install.test.js`, failed only on an EPERM when deleting its temp folder (the known Windows flake); alone it passed, 1 of 1.
- **Without 0019** (the migration file was renamed for the run, then restored): packages, packages_job, install, install_delete, install_links and install_source_gone, 9 of 9. The no-0019 state is also tested inside `package_covers.test.js`.

`package_covers.test.js` covers:
- every refusal sentence, a mismatch of each hash, and a request from someone who is not the author;
- the hidden package;
- the record-art order: the first record has no image, so the third record's first image wins;
- the backfill: the art row is cleared, and the next read fills it;
- takedown and restore moving an uploaded cover; record art stays;
- delete: an object nothing names is deleted; one a record names, or one another package uploaded, is kept;
- the card's keys and the page's shape.

Example tools: 9 of 9, including "the seeding dry run names each cover".

Rehearsal:
1. A fresh `build_local.mjs` in `findings/examples/local_covers` uploaded all six covers.
2. A stand-in (`findings/examples/standin_covers`, made with `--bare`):
   - The dry run named 6 covers, and `--apply` wrote them.
   - All six packages show `source: 'upload'` on the card and the page, and both objects are present with matching hashes (`findings/examples/covers_rehearsal.txt`).
   - `--remove --apply` deleted 12 cover objects; a count found 0 left and 0 packages.

Servers I started, all stopped:
- API 38436 (port 8871), vite 53208 (port 5239) and Edge 7840 (port 9439), for the cover shots;
- the build API 44676, then 59932 for the fresh build;
- the stand-in API 41328.

Ports 8871, 8872, 9871, 9872, 5239, 9439, 18887 and 18888 are free.

## Contract published
contracts/b_marketplace.md F17

## Needs from others
- Lane D: show `cover` (upload or record) and fall back to A's default for the kind when it is null. Build the address as `https://cdn.traveller.voyage/objects/<hash>` (use the thumbnail on cards). Send the upload as one multipart form with `image`, `thumb`, `hash` and `thumbHash` (F17).
- Lane A: none. The four covers arrived and are in their listings.

## Questions for Johnny
1. Covers count against no quota: one pair per package, at most 2.2 MB, and a replaced pair is deleted. Is that right? Suggested: yes. The alternative is to count them against the source universe's 250 MB.
2. The author does not see their own cover while the package is hidden; only admins do. Is that right? Suggested: yes, as the prompt says. The alternative is to show it to the author too.
3. I could not look at the two map covers. The tools refuse to copy images off Lazarus, so I checked them by pixel counts only: the Hollow Verge shot has about 10 times the bright pixels of an empty slot. Please look at `tools/examples/covers/feri-terraces.webp` and `hollow-verge.webp` before the push. Suggested: retake by hand if the names do not show.

## Fix 1 (2026-10-15 evening): the two map covers, retaken
Prompt: prompts/z_package_covers.md, Fix 1
Status: done (I could not look at the images; see the questions)

### Changed files
- `tools/examples/covers/feri-terraces.webp`: 133,962 bytes, 1600x900. The thumbnail `feri-terraces_640.webp` is 31,196 bytes, 640x360.
- `tools/examples/covers/hollow-verge.webp`: 33,208 bytes, 1600x900. The thumbnail `hollow-verge_640.webp` is 8,478 bytes, 640x360.
- `findings/examples/shot_cover2.mjs`: new headless script.
  - Signs in as the house account in the local build, with the cookie value URL-encoded.
  - Injects `* { visibility: hidden } canvas { visible }` and moves the cursor off the map, so no search box, date chip, rail, panel or toast shows.
  - Crops 1600x900 around the centre of a 1732x1100 canvas. No app file was changed.
  - `findings/examples/make_covers2.mjs` makes the WebP pair with `sharp`, as before.

### Framing
- **Feri terraces:** centred on `Spinward_Marches/2005` at zoom 70, the names zoom used before.
- **Hollow Verge:** the first shot was off-centre. The map draws this own sector about 15 hexes left of where my slot arithmetic put it.
  - I found the systems by stepping out to zoom 40, then re-centred.
  - At zoom 240 the systems fill most of the frame's height, about 600x700 px of 1600x900. The map would not zoom further: a shot at 270 matched the one at 240.
  - The piece is three columns wide and three rows tall, so it cannot fill the width as well.

### Checks
- `tests/tools/examples.test.js`: 9 of 9.
- The new pair was uploaded to the local build `findings/examples/local_covers` through the route. The local dry run against `findings/examples/standin_covers` names the new pair:
  - Feri terraces: `objects/148a25df598d…` and thumbnail `720c6eb1e7dc…`.
  - Hollow Verge: `objects/f443c6d143e2…` and thumbnail `fc59e7ab5ec5…`.
- Nothing ran against production.
- Servers, all stopped: API 43284 (port 8871), vite 13236 (port 5239), Edge 46792 (port 9439). The ports are free.

### Questions for Johnny
1. I could not look at the PNGs. Read and CopyToBox both refuse paths on Lazarus, so the visual check is left to the orchestrator, as Fix 1 step 3 allows. Please look at `findings/ui_design_shots/fix1_feri.png` and `fix1_hollow.png`, which are the sources of the covers. Suggested: if anything is off, point me at it and I retake.
2. The map draws Hollow Verge about 15 hexes away from where the slot-to-hex arithmetic in the map's geometry puts it. Should Lane D check that? Suggested: yes, as a note only. My slot arithmetic for this own sector may be wrong rather than the map.
