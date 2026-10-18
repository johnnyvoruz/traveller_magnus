# Lane D — the marketplace as a storefront

Issued 2026-10-15 by the orchestrator. **Start after `d_traffic_display` is reported.**
You may be a fresh session with no memory. Read `CLAUDE.md`, `directives/manifesto.md`,
`directives/board.md`, `directives/lanes/D.md`, `directives/prompts/z_package_covers.md`
(the cover on the wire; Z builds it this turn), `directives/prompts/a_store_art.md` (the
default art; A makes it this turn), your marketplace shots `findings/ui_design_shots/kb18_market_*`,
then this file. No git but read-only, no deploy, no `rules/`.

## Johnny's words (2026-10-14 and 15)

- "It's a decent start." The marketplace "needs to be like an ecommerce storefront", with
  art by the Grok agents.
- "If an image exists for a campaign item, use that art for the store."
- Sectors: "To start, let's just have people upload a screenshot via copy/paste or
  whatever."
- Art style: RPG concept art. "Don't focus on colours or everything feels too same-y."

## Today

The catalogue is a list of text rows: a title, one grey line of facts, and tag chips
under the box (`kb18_market_catalogue_out_1600.png`). There are no pictures, and every row
looks alike.

## The storefront (decided; build it)

Everything is free: there are no prices, cart or checkout. **Import is the buy button.**
Johnny, 2026-10-15: "We can't charge money for anything, but the UX/UI for a store is a
known entity when it comes to user patterns." Borrow the store's patterns because people
already know them; never add a price, a "free" badge or any money word.

1. **Covers everywhere.**
   - **Which image:** `cover` from the server (Z) when it is there. Otherwise A's default
     for the package's kind family. Map kind to a family by keyword, case-insensitive:
     - `map`: sector, subsector, piece, map, region;
     - `system`: system;
     - `ship`: ship, ships, vessel, fleet;
     - `people`: people, contact, NPC, crew, character;
     - `patrons`: patron, job, mission, hook;
     - `organization`: organization, organisation, faction, corporation, house;
     - `adventure`: adventure, scenario, event, campaign;
     - `other`: anything else.

     Put the table in one file with a test.
   - **Sizes:** the 640 px file (thumbnail) on cards, the full file on the page. Use
     `loading="lazy"`, a fixed 16:9 box so nothing jumps while images load, and a quiet
     placeholder tone while loading.
   - **Alt text:** the package's title.
   - **No text over the art except a single kind badge.** Titles sit below the image.
2. **The catalogue is a grid of product cards.**
   - **Columns:** 3 or 4 at 1600 px, 2 at 768 px, 1 at 390 px.
   - **A card:** the cover; the title; "by @handle"; one line of facts in priority order
     (kind, hex or record count, imports); "Updated" as a relative date. Tags move to the
     page.
   - The whole card is one link, keyboard-reachable, with a visible focus ring.
3. **A storefront head** above the grid:
   - **A featured row:** the three most-imported packages as wide banner cards, in one
     row at 1600 px and swiping sideways at 390 px. Hide the row while the catalogue has
     fewer than six packages.
   - **Kind chips** in place of the free-text Kind box: one chip per family present in the
     catalogue, plus "All".
   - Search and sort stay, laid out as a store's toolbar. Free-text tag search stays in
     search.
4. **The package page is a product page.**
   - **The hero:** a large cover on the left (whole, uncropped, at most 16:9 tall), and the
     title, author, kind, facts, the latest version and a prominent **Import** button on
     the right. At 390 px, the cover sits on top and Import is sticky at the bottom.
   - **What's inside:** the hexes (count, and the sectors they fall in) and the records,
     grouped by their kind, each with its avatar when it has one. The records list and its
     images are public objects on the CDN (`records.contentHash` and the record image
     hashes in the manifest; you already read manifests through `versionKeys`).
   - **A gallery** of the package's record images (thumbnails, opening `Lightbox.vue`),
     only when it has any.
   - **Then:** the description, the tags, versions as a short changelog, and "More by
     @handle" (up to four cards).
   - Report stays, quiet, at the foot.
5. **Covers for publishers.**
   - **On the publish form and on the author's own package page:** "Add a cover" with a
     file chooser, a drop target and **paste** (`RecordGallery.vue` already takes all
     three; reuse its approach and the WebP encoder in `campaign/images.ts` at Z's
     limits).
   - **One line of help,** in the Google style. For example: "Add a picture for your
     package. For a map, take a screenshot of it and paste it here." The words are yours.
   - **The preview shows the 16:9 crop the card will use.** "Remove cover" is a plain
     delete, with no undo.
   - The cover's source is visible to the author: "Your upload", "From your records", or
     "Default for its kind".
6. **The empty and thin states:**
   - **No packages match:** a message and a "Clear filters" button.
   - **No packages at all:** an illustration (the `other` default) and a "Publish a
     package" call to action for a signed-in reader.
7. **The art must not make the store one colour.** A's covers have no shared palette on
   purpose. Keep the chrome around them neutral: dark cards, a hairline border, no
   coloured frames or tints over the images. Use cyan only for actions (Import, focus,
   the active chip).
8. **Signed out:** browsing works. Import opens the sign-in card, as now.

## Already in (orchestrator, 2026-10-15 10:05)

- **Z's server is done:** `contracts/b_marketplace.md` F17 and
  `reports/z_package_covers.md`. `cover` is optional and nullable on the card and the
  page. Upload is one multipart form with `image`, `thumb`, `hash` and `thumbHash`.
  Objects are served at `https://cdn.traveller.voyage/objects/<hash>`, and the local
  state serves them the way your map's CDN base does. The six example packs carry covers
  after `build_local.mjs`.
- **A's art is in:** `apps/web/public/covers/<family>.webp` and `<family>_640.webp` for
  the eight families. A's kind table, in `reports/done/a_store_art.md`, matches the one
  above.
- You may use A's art in your shots. Johnny passes the contact sheet before it ships.

## Build order

Build against `fake_store.ts` with covers of every source (upload, record and default)
until Z's report is in. Then run on the local state with Z's six example packs seeded,
which carry real covers. A's images may land during your pass. Until they do, use a plain
placeholder per family and say so. **Johnny reviews A's contact sheet before the store
shows A's art in a push.**

## Owned files (this pass)

`apps/web/src/workspace/market/` (all of it), `apps/web/src/marketplace/catalogue.ts`
(the `cover` type, once Z's schema is in), a new `apps/web/src/marketplace/covers.ts` (the
kind table and the address builder), `workspace/Lightbox.vue` (reuse only), design
tokens (your own lines), tests under `tests/web/`, shots
`findings/ui_design_shots/kb26_store_*`, `directives/reports/d_storefront.md`.
`apps/web/public/covers/` is A's: read it, don't write it.

## Gates

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, pasted. **Browser,** at
1600, 768 and 390 px, signed in and out:
- the catalogue with the featured row;
- kind chips, with one chosen;
- empty search;
- a package page of each cover source;
- what's inside and the gallery;
- the publish form with a pasted screenshot and its crop preview;
- the author's "Remove cover";
- the sticky Import on a phone.

Report the catalogue's first-paint image bytes at 1600 px (only thumbnails on the grid).
Start Vite with its own cache directory; stop every server after.

## Stop rule

Stop when the gates pass and the report is written. Write
`directives/reports/d_storefront.md` from `directives/reports/_TEMPLATE.md`. After each
meaningful step append one line under Progress: "done: X. next: Y."

## Progress
done: read the brief, Z's F17 and A's table; wrote marketplace/covers.ts (kind table, addresses), catalogue.ts putCover/dropCover/versionContents, market/cover_image.ts, market/storefront.ts, Lightbox urlOf prop. next: the Vue screens (store head, card grid, product page, cover editor).
done: CoverEditor, StoreCard, ProductPage, PackagesView storefront, publish-form cover (sent after create), tokens, tests/web/market_storefront.test.js (13 pass), packages_entry updated. next: npm test/check/build, then local state with the six packs and browser shots.
done: gates green (npm test 1769 pass 0 fail, check clean, typecheck, build). next: browser pass on local state (API 8941, vite 5341, Edge 9541).
done: browser pass (catalogue, chips, empty, none, three cover sources, inside/gallery/lightbox, author paste + Remove cover, publish form paste, sticky Import, Import signed out/in); servers stopped; gates re-run green. next: the report.
done: report written (directives/reports/d_storefront.md). next: none, stopped.
