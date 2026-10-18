# Lane D storefront report
Prompt: prompts/d_storefront.md
Status: done

Found: no Progress lines and no storefront edits in my files; a fresh start. The other changes in git status (PublicShipCard, ShipPings, the public-games tests) are from accepted passes.
Finished: nothing half-done to finish.
Backed out: nothing.

## Changed files
- `apps/web/src/marketplace/covers.ts` (new): the kind table (first match, case-insensitive, keyword anywhere in the kind), `kindFamily`, the chip words, the CDN and default-cover addresses, `shownCover` (upload, record, else A's default) and the author's source words.
- `apps/web/src/marketplace/catalogue.ts`: `putCover` and `dropCover` (F17). The cover is sent as one multipart form (`coverForm`) without `apiFetch`'s JSON content type. `versionContents` reads the manifest, then the records list by `records.contentHash`; `publicRecords` keeps rows loosely. `PackageCover` is re-exported. The `cover` type itself came with Z's schema.
- `apps/web/src/workspace/market/storefront.ts` (new, pure): the featured row (top 3 by imports, hidden below 6 packages), chips present, family filter, card facts (kind, hexes, imports), "Updated …" relative dates, sectors inside, records by kind, the gallery images, and More by.
- `apps/web/src/workspace/market/cover_image.ts` (new): reads a file into the F17 pair, 1600 px / 2 MB and 640 px / 200 KB. The quality steps down 0.85 → 0.72 → 0.6 → 0.45 until both files fit. Same approach as `campaign/images.ts`, whose encoder is not exported (see Needs).
- `apps/web/src/workspace/market/CoverEditor.vue` (new): "Add a cover" with a file chooser, a drop target and paste. The preview is the card's 16:9 crop. It shows the source line ("Your upload", "From your records", "Default for its kind") and a plain "Remove cover".
- `apps/web/src/workspace/market/StoreCard.vue` (new): the product card. The whole card is one link, with the cover in a fixed 16:9 box (`loading="lazy"`, a placeholder tone), one kind badge, then the title, "by @handle", the facts and "Updated". `wide` is the featured banner.
- `apps/web/src/workspace/market/ProductPage.vue` (new; the package page moved here from PackagesView):
  - The hero: the whole cover on the left, and the kind, title, author, facts, version, edition and chart, and Import on the right.
  - What's inside: hexes and their sectors with the outline, and records by kind with avatars.
  - The gallery opens `Lightbox.vue`.
  - Then About (the description, with tags as links to `?tag=`), Versions as a changelog, More by @handle (up to 4), and Report at the foot.
  - Below 640 px, Import is a fixed bar at the bottom.
  - The author's cover editor.
  - Watching a version as before.
- `apps/web/src/workspace/market/PackagesView.vue` (rewritten):
  - The storefront head: the featured row, a store toolbar (search and sort; the Tag box is gone, since search already covers tags) and kind chips (`?kind=<family>`; an old free-text `?kind=` reads as its family).
  - A tag from a page shows as a removable chip.
  - The grid of cards: 4 columns at 1600, 2 at 768, 1 at 390.
  - Empty states: "No packages match." with Clear filters, and "No packages yet." with the `other` art and "Publish a package" for a signed-in reader.
- `apps/web/src/workspace/market/market.ts`:
  - `coverDraft`: a new package's cover, sent with `putCover` once the package exists (after the version is accepted), so a second try after a failed version still sends it.
  - `coverMissed`: a refused cover, said on that package's page; it does not stop the publish.
  - `useCoverSender`: for tests.
  - `marketUi.madeId`.
- `apps/web/src/workspace/market/PublishForm.vue`: the cover editor on a new package. For a new version of an existing package: "To change it, open the package's page."
- `apps/web/src/workspace/Lightbox.vue`: one optional prop, `urlOf`, so it can show CDN images. When it is absent, nothing changes.
- `apps/web/src/design/tokens.css`: two lines appended, `--store-placeholder` and `--store-badge` (neutral, no tint).
- `tests/web/market_storefront.test.js` (new, 13 tests):
  - the kind table;
  - the 16 default files present;
  - the cover chosen and its addresses;
  - the featured row;
  - chips;
  - facts and dates;
  - sectors;
  - records by kind, the gallery, and More by;
  - `versionContents`;
  - the multipart form and refusals;
  - the quality steps;
  - the draft cover sent after create, kept on refusal, and not sent for an existing package;
  - no money words, and a neutral badge.
- `tests/web/packages_entry.test.js`: the package route's shell is now the hero ghost ("Loading the package"); the bar's `mk-title` h1 no longer shows on a package page, so the title is not a second h1.
- `findings/storefront/` (mine): `vite.store.mjs` (a local CDN from the pass's bucket), `drive.mjs` (copied from Z's, my ports), `cookies.mjs`, `variety.mjs`, `shots.mjs`, `author.mjs`, `publish.mjs`, `empty.mjs`, `explore.mjs`, the local state and logs.
- `findings/ui_design_shots/kb26_store_*`: 55 shots, named under Gates.

## Gates
npm test:      pass (1804 tests, 1769 pass, 0 fail, 35 skipped), re-run on the final tree
npm run check: pass (manifesto: clean)
typecheck:     pass (`tsc -p apps/api`; also `vue-tsc -p apps/web/tsconfig.app.json` clean)
fourth gate:   `npm run build` pass

**Browser.** Headless Edge on a fresh local state (`build_local.mjs --state findings/storefront/local --port 8941`). It carried Z's six packs with their uploaded covers. Vite ran on 5341 with its own cache dir, and Edge on 9541. Before the shots, I made one package of each source with the app's own routes (`variety.mjs`):
- **upload:** Free traders of the Marches.
- **record:** The Glass Hand. I added A's art to four of its records, published version 2, then used `DELETE .../cover`, which answered `source: 'record'`.
- **default:** Jewell patrons. `DELETE .../cover` answered `null`, because it has no record images.

What the shots show:
- **The catalogue with the featured row:** `catalogue_{out,in}_{1600,768,390}`.
  - 4 columns at 1600, 2 at 768, 1 at 390.
  - The featured row swipes sideways at 390.
  - All six packs have 0 imports, so the row is the latest three.
  - The `_full` catalogue shots were taken before I fixed the full-page height. They show the viewport only.
- **One chip chosen:** `chip_{1600,768,390}` (People). **Empty search:** `empty_{…}`. **No packages at all:** `none_in_{1600,390}` and `none_out_1600`, with the catalogue call answered empty through CDP Fetch.
- **A package page of each source:** `page_{upload,record,default}_{out,in}_{1600,768,390}`, plus `_full`.
- **What's inside and the gallery:** `page_record_out_1600_full` and `lightbox_1600` ("1 of 5 · 1,600 × 900 · 49 kB").
- **The author's cover on Hollow Verge:**
  - `author_before_{1600,390}`: an upload.
  - `author_pasted_1600`: a 680 KB PNG screenshot pasted as a real `ClipboardEvent`; it was encoded, the PUT answered, and the source reads "Your upload".
  - `author_removed_1600`: "Remove cover" answered null, and the page shows the map default ("Default for its kind").
- **The publish form with a pasted screenshot and its crop preview:** `publish_pasted_{1600,390}`. It is opened from Build, then More build actions, then Publish selection, on Feri 2005.
- **Sticky Import on a phone:** `page_*_in_390` and `import_in_390`. **Import opened:** `import_in_1600` (a reader with a campaign: the import panel under the hero).
- **Signed out, Import** (`import_out_1600`) calls `signIn()` as before and comes back to the package page. Locally there is no social provider, so the server's sentence ("Provider not found") now shows by the button; before, nothing showed.
- **Not shot at every width:** the author's cover at 768, the lightbox at 768 and 390, and the publish form at 768.
- Console errors on every script: none.

**First-paint image bytes at 1600 (signed out, cache cleared):** 6 images, 140,634 bytes (encoded). All six are `_640` thumbnails: five uploads or record art from the CDN, and `patrons_640.webp`. The featured row reuses the grid's addresses, so it adds nothing. No full-size file loads on the catalogue.

**Servers I started, all stopped:** the API (wrangler and workerd) on 8941 and inspector 9941, Vite on 5341, and Edge on 9541 (user data `findings/storefront/edge_d`). A check afterwards found none of these ports listening.

## Contract published
none (I consume F17 as written)

## Needs from others
- **Lane A:** export `encodeWebp` (and `sha256Hex`) from `apps/web/src/campaign/images.ts`. `cover_image.ts` then imports them instead of carrying a 25-line copy at the cover's limits. Until then there are two copies of one encoder.
- **Lane B (later, not blocking):** the catalogue's `kind` filter is an exact match and there is no author filter. Chips and "More by" therefore filter on the client over the first page (up to 100 cards). If you agree (question 1), a `family=` and an `author=` query would finish this.
- **Lane Z:** none. The Hollow Verge cover shows as the map shot in the grid. Its Fix 1 retake will land without any change on my side.

## Questions for Johnny
1. **Kind chips filter in the browser, over the cards loaded (up to 100 per page).** The server's kind filter matches the exact kind text, so a "Maps" chip cannot ask it for sector, subsector and sector piece at once. Is the browser filter right for now? Suggested: yes, while the catalogue is under 100 packages. Then Lane B adds a `family` query. The alternative is a server change now. "More by @handle" works the same way, with an `author` query later.
2. **Focus stays the app's one amber ring, not cyan.** The prompt names cyan for focus. The manifesto says one ring everywhere (`--focus-ring` is amber), so cards, chips and the cover box use it. Cyan is only on Import, the active chip and hover borders. Is that right? Suggested: yes, keep one ring. The alternative is a cyan ring inside the store only.
3. **A new package's cover goes up right after its first version is accepted, not when the version finishes.** If the cover is refused, the version still publishes, and the package page tells the author to add the cover again. An existing package's cover changes only on its page, not on the publish form. Is that right? Suggested: yes. The alternative is a cover box on the new-version form too, which would need the package's current cover on the listing.
4. **Signed out, Import still goes straight to social sign-in (`signIn()`), as before.** There is no separate sign-in card on this page. Locally that shows "Provider not found". Is that right? Suggested: yes, unchanged. The alternative is to open the passkey sign-in body (`workspace/passkey/SignInBody.vue`) in a modal here once B's username and passkey sign-in is in pushes.
