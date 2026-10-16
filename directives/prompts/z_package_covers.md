# Lane Z — package covers: upload, record art, defaults, takedown, and the example packs

Issued 2026-10-15 by the orchestrator. You may be a fresh session with no memory. Read
`CLAUDE.md`, `directives/manifesto.md`, `directives/board.md`, `directives/lanes/Z.md`,
`directives/contracts/b_marketplace.md` (yours since 2026-10-14, F1 to F16), then this
file. Also read `directives/prompts/a_store_art.md` and `directives/prompts/d_storefront.md`:
A makes the art and D builds the storefront on what you build. No git but read-only, no
deploy, no `rules/`, nothing against production.

## Johnny's words (2026-10-15)

- The marketplace "needs to be like an ecommerce storefront", with art by the Grok agents.
- "If an image exists for a campaign item, use that art for the store."
- Sectors "probably need a generic art or a screenshot of the sector. I don't know if we
  can dynamically generate that or not. To start, let's just have people upload a
  screenshot via copy/paste or whatever."

## Today (read it in the tree before you build)

- A record's images are `{ hash, thumbHash, ... }` (WebP, 2048 px and 320 px, made in the
  browser by `apps/web/src/campaign/images.ts`). The first image is the record's avatar.
- Publishing copies each record image into the public bucket at `objects/<hash>`
  (`jobs/publish_queue.ts` `copyObject`), so it is already served at
  `https://cdn.traveller.voyage/objects/<hash>`. The manifest lists them in
  `records.imageHashes`.
- An image upload is `PUT /api/universes/:id/objects/:hash` (`routes/objects.ts`): WebP
  only, hash checked, 8 MB, counted against the universe's 250 MB.
- A takedown moves each version's manifest to the private bucket and keeps
  content-addressed objects (`routes/admin_packages.ts`).
- The browser reads the catalogue without strict parsing (`marketplace/catalogue.ts`
  casts), so a new field cannot break an open tab. Check that this is still true.

## Do

1. **The cover, chosen in this order** (Johnny's order):
   1. **an upload:** the publisher's own image, for example a screenshot of their sector;
   2. **record art:** the first image of the first record, in the package's record order,
      that has one, in the **latest done version**;
   3. **nothing:** the browser shows the default for the package's kind (A's art, D's
      mapping). The server never names a default.
2. **On the wire:** `PackageCard` and `PackagePublicPage` gain
   `cover: { hash, thumbHash, source: 'upload' | 'record' } | null`. Both hashes are
   objects in the public bucket, so the browser builds the CDN address itself.
   - Add it in `packages/shared/src/schemas/package.ts`.
   - Say in the contract that an old tab ignores it.
3. **Upload:** `PUT /api/packages/:packageId/cover`, the author only.
   - **Body:** the full image and its thumbnail, both WebP, with their hashes, checked as
     `routes/objects.ts` checks. Pick the request's shape (one multipart body, or two
     calls as objects use) and write it in the contract.
   - **Limits:** at most 1600 px on the long side and 2 MB; the thumbnail at most 640 px
     and 200 KB; any aspect ratio (D crops to 16:9 on the card and shows it whole on the
     page). Refusals in the copy standard, for example "A cover is at most 2 MB.".
   - **Storage:** the bytes go straight to the public bucket at `objects/<hash>`. Say
     what quota they count against, if any, and why. A hidden package refuses an upload.
   - **Remove:** `DELETE /api/packages/:packageId/cover`, a plain delete. The cover goes
     back to record art or nothing. No undo.
   - **Replacing or removing** leaves the old object in the bucket only while another
     package or record still names it. Otherwise it is deleted. Say how you know.
4. **Record art is worked out at publish.** The publish job records the record-art pair
   on the version row, so the catalogue never opens a manifest. Versions published before
   this have none; give them theirs from their manifests once (a script under
   `apps/api/scripts/` or a lazy fill on first read, your call, said in the contract).
5. **Migration:** the next free number in `apps/api/src/db/migrations/` when you write it
   (0019 unless Lane B has taken it for an index this turn; then 0020). Columns for the
   upload pair on `packages` and the record-art pair on `package_versions`. The Worker
   probes for them like 0017 and 0018: without the migration, `cover` is null everywhere
   and an upload answers "Covers are not available yet." Test both states.
6. **Takedown and restore:**
   - A takedown takes an **uploaded** cover off the public bucket into the private one,
     as manifests go (a publisher's own picture is the riskiest thing in a listing).
     Restore puts it back.
   - Record art stays, as record objects do today.
   - The catalogue never shows a hidden package's cover to a non-admin.
   - The report form covers the cover too: no change unless the wording needs it.
7. **The example packs** (`tools/examples/`, yours):
   - A `listing.json` may name `"cover": "covers/<pack-folder>.webp"`.
     - `build_local.mjs` uploads it to the local state after publishing.
     - `seed_production.mjs` plans it in the dry run and uploads it with `--apply`.
     - `--remove` removes it.
   - **Lane A** makes covers for the four records packs (`tools/examples/covers/`,
     arriving this turn). **You** make the two map packs' covers: screenshots of Feri
     terraces and Hollow Verge on the local map, taken headless at 1600×900, framed on
     the piece with names showing, saved as `tools/examples/covers/feri-terraces.webp`
     and `hollow-verge.webp` plus `_640` versions (made with `sharp`, which is already
     installed). This is the same thing a publisher will do by hand.
   - Add the cover line to all six `listing.json` files. Your two can go in now. Add A's
     four once A's files exist; if they don't exist when you finish, leave those four
     out and say so.
   - Rehearse on the local state: all six packs show their cover, and `--remove` leaves
     no cover object behind.
8. **Contract:** a section "F17. Covers" in `contracts/b_marketplace.md`. It covers:
   - the order;
   - the wire shape;
   - the upload and delete routes, with every refusal sentence;
   - the limits;
   - the storage and quota;
   - takedown;
   - the migration and its probe;
   - the backfill.

## Owned files (this pass)

`apps/api/src/routes/packages.ts`, `routes/admin_packages.ts`, `jobs/publish_queue.ts`, a
new `routes/package_covers.ts` if you prefer, the new migration, `apps/api/src/db/schema.ts`
(your columns only), `apps/api/scripts/` (a backfill script, if you write one),
`packages/shared/src/schemas/package.ts`, `packages/shared/src/index.ts` (append your
export lines only; Lane B is adding its own this turn), `tools/examples/` (not
`covers/<A's four>`, not the four `packs/` folders but their `listing.json` cover line),
tests under `tests/api/`, `tests/shared/`, `tests/tools/`, `contracts/b_marketplace.md`,
`directives/reports/z_package_covers.md`. Lane B is in `routes/public_games.ts` and
`schemas/public_games.ts`. Lane D owns the browser.

## Gates

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, and `RUN_API_TESTS=1`
for the package, install and admin suites with and without the new migration, pasted.
In the tests:
- the upload's refusals;
- a hash mismatch;
- not the author;
- the hidden package;
- the record-art order;
- the backfill;
- takedown and restore moving an uploaded cover;
- delete removing an object nothing else names, and keeping one that something does;
- the catalogue and page shapes;
- the example tools' dry run naming the cover.

## Stop rule

Stop when the gates pass, the local rehearsal is done and the report is written. Write
`directives/reports/z_package_covers.md` from `directives/reports/_TEMPLATE.md`. After
each meaningful step append one line under Progress: "done: X. next: Y."

## Fix 1 (orchestrator, 2026-10-15 10:05): retake the two map covers

Your report is accepted. The orchestrator looked at both map covers:
- **The app chrome is in both.** The search box and the "No campaign date" chip sit in
  the top left.
- **Hollow Verge** is six systems in one corner of a mostly empty dark grid.

Retake both, with the same paths, sizes and `sharp` steps:
1. **No app chrome:** no search box, date chip, rail, panel, toast or cursor. Hide them
   for the shot (a style injected by your headless script is fine; change no app file),
   or shoot a larger canvas and crop.
2. **Frame the piece so it fills the picture:**
   - Hollow Verge: zoom until its systems take up most of the frame, names showing.
   - Feri terraces: centred on Feri (Spinward_Marches/2005) at the names zoom, so the
     package's own hexes are in the middle.
3. **Look at both yourself** before you finish: read the PNG you made with your image
   reader. If your tools refuse, say so and leave it to the orchestrator. Do not rely
   on pixel counts.
4. Re-run `tests/tools/examples.test.js`. The hashes change, so re-run the local dry run
   and confirm it names the new pair. Nothing goes against production.

Owned: `tools/examples/covers/feri-terraces*.webp` and `hollow-verge*.webp`, your
headless script under `findings/`, and your report (append "Fix 1" with the two new file
sizes). Stop when they are retaken.

## Progress

done: 0019, shared PackageCover, routes/package_covers.ts (order, upload, delete, takedown, backfill), publish art, API test 2 of 2 green. next: example tools and the two map covers.
done: build_local and seed_production cover support, two map covers shot (1600x900 canvas) and made with sharp, cover lines in all six listings (A's four had arrived). next: fresh build with covers, stand-in rehearsal, remove.
done: fresh build with six covers, stand-in seed (dry run names 6 covers, apply, all six show source upload with objects), --remove --apply leaves 0 cover objects; contract F17; gates. next: report.
done: report written (reports/z_package_covers.md), Status done. next: none; stopped.
done: Fix 1, both map covers retaken without chrome (injected style, crop), Hollow Verge re-centred at max zoom 240, examples test 9/9, local dry run names the new pair, report appended. next: orchestrator looks at the images (my tools refuse them).
