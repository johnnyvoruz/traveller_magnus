# Lane D — harden the marketplace: one app, steady filters, the manifesto applied

Issued 2026-10-17 by the orchestrator. **Start after your `d_import_style` report is filed.** You may
be a fresh session with no memory. Read `CLAUDE.md`, `directives/manifesto.md` (all of §1),
`directives/design_reference.md`, `directives/board.md`, `directives/lanes/D.md`, your reports
`reports/done/d_store_2.md` and `d_store_3.md`, then this file. No git but read-only, no deploy, no
`rules/`.

## Johnny's words (2026-10-17)

"Let's harden the marketplace experience, I don't think we used our design manifesto at all to build
it. Everything is so disorientating on clicks when I use the left filters. I also feel like it's a
totally different experience, maybe we keep the logo or some top nav or something to tie the two
features together."

## What the orchestrator measured on production (1.2.5, Chrome, 1512 × 812)

Scrolled to 131, then ticked Systems in the column:
- `.mk-scroll` went from 131 to 0 in the first frame: the results shrank below the window, so the
  scroller clamped. **The column jumped 131 px under the pointer.**
- The other sections rebuilt around the click: Tags went from ten choices and "See more" to five,
  and "Records only" vanished from Contents. Every choice below moved.
- The featured row vanished and the grid moved up 145 px; the "Imports" block at the foot followed it.
- Each tick pushed a history entry (24 after a short session).
- The view itself did not remount, and no image loaded again. That part is right.

## Decided (orchestrator; build it)

### 1. One app: the store keeps the app's frame
- The store and the product page render **inside the same frame as the map**: `shell/Rail.vue` on
  the left, with Marketplace the active item and the account button at its foot, exactly as on the
  map. The store's page scrolls in the space right of the rail.
- "← Map" goes; the rail's map item is the way back. Back still works.
- At the top of the store: **the brand from the version videos**, the red-V mark
  (`apps/web/public/favicon.svg`) and the wordmark "TRAVELLER.VOYAGE" (Orbitron 700, letter-spacing
  0.14em, the dot in the mark's red), then "Marketplace". The videos draw it in
  `versionvideo/scene/scene.css` (`.mark`, `.wordmark`): copy the look, not the file.
- Below 640 px the rail does what it does on the map at that width.
- `Rail.vue` and how `MapView.vue` mounts it are shared: change only what the store needs, and list
  every change in your report.

### 2. Filters that hold still (manifesto: Graceful, "nothing pops"; no layout shift)
- **The control you click never moves.** Ticking or unticking a choice, "See more", a chip's ×,
  Clear all, the Updated buttons and Sort leave the column where it was on screen: 0 px.
  - The results area keeps at least the window's height, so the scroller never clamps.
  - When the results' top is above the window after a change, bring it into view with the motion
    token's scroll, and only the results: the column stays put (it is sticky).
- **Sections and choices don't vanish.** Every choice a section showed this visit stays listed.
  At a count of 0 it dims and can't be ticked (a ticked one stays clickable). "See more" keeps its
  place. A section shows when any loaded card has a value for it.
- **Results change in place:** the grid dissolves to the new set with the panel motion token, cards
  keep their size, and nothing flashes. The featured row's coming and going is part of the same
  change, not a second jump.
- **History:** a filter, chip or sort change **replaces** the current entry (the URL stays shareable);
  a search submit, opening a package and the Filters sheet push. Back leaves the filtered store in
  one step.
- The "Imports" block at the store's foot leaves the storefront. Put the campaign's imports under
  "My packages" (a section "In this campaign"), or say where else it fits better.

### 3. The manifesto, rule by rule
Write a table in your report: every rule in manifesto §1 and every item in `design_reference.md`
that applies to a page, against the store, the product page, the import panel, the publish dialogs
and the sheet: pass, or what you changed. At least:
- tokens only, no literal colour or `ms`; the shared modal frame; the one toast; `.ui-btn` and the
  design system's controls instead of local copies;
- **Connected:** every name is a link: the author's handle filters by publisher, a tag filters by
  tag, the kind filters by kind, and a package page links back to the store with that filter.
  `/packages` and `/packages/:id` each have a cold-load render test;
- the command palette: "Open the Marketplace", "My packages", "Publish records" (opens the dialog
  for the open campaign) and "Publish selection" (with Build on and a selection);
- no layout shift on data arrival: the catalogue's first paint holds the grid's size (sized
  placeholders), cover images have their size;
- focus: the one amber ring, a visible order through the column, the results and the grid;
- the publish forms' limits line ("A package holds up to…") in `PublishForm.vue` and
  `RecordsPublish.vue` uses `mk-fine`, not the Build pane's `build-fine` (decided 2026-10-17).

### 4. Publishing, findable from the store
Johnny asked how campaign items get published and shared; the store doesn't say. Replace
"Publish a package" (today a link to the map) with **Publish** in the store's header, opening a short
chooser in the shared modal frame:
- **Records** (people, ships, organizations): "Publish records from your campaign." It opens the
  Publish records dialog for the open campaign. Signed out, or with no campaign record, say what to
  do first in one sentence.
- **Map hexes** (systems, a subsector, a sector, with their records): "Publish part of your map."
  It goes to the map with Build on and the hint to select hexes, then Publish selection.
The empty store's sentence names both ways.

### 5. The look: the version videos (Johnny, 2026-10-17)
"We are building these great traveller-voyage version videos, that's the sort of look and feel that
I'd love on the marketplace."

The videos are `versionvideo/out/traveller-voyage-1.2.3-1080x1080.mp4` (and 1.2.2, 1.2.0), drawn
by `versionvideo/scene/scene.css`, `scene.js` and `spotlight.js`. Watch one end to end, or take a
frame every 3 s with ffmpeg, before you design. Read those files; don't edit or import them
(`versionvideo/` is Johnny's tool). What to carry into the store and the product page:
- **The ground:** the radial gradient from `--bg-1` at upper left to `--bg-0`, with the faint hex
  grid and the sparse star field behind the content (static on the page; no animation behind text).
- **Kickers:** small Orbitron capitals, wide letter-spacing (about 0.4em), in `--signal-dim`, over
  each section ("FEATURED", "BROWSE BY KIND", the filter column's headings). The red "NEW" tag on a
  package updated in the last 7 days.
- **Rules:** a hairline under the page heading that fades from `--signal`/the mark's red to nothing,
  as under the version number.
- **Headings:** Orbitron for the page heading, the package title and section heads; Inter for text.
- **Frames:** the store's panels (featured, the product page's "What's inside", the import panel) as
  the videos' framed panels: a thin `--line-1` border, a small corner label in kicker style, and a
  count in Orbitron where there is one ("RECORDS 11", "HEXES 6").
- **Dates** in the small outlined Orbitron box, as "OCTOBER 15, 2026" in the videos.
- **Motion:** the videos' easing on the dissolve in item 2, from the motion tokens.
- **Covers:** keep the package covers. (The videos draw their cards in code because covers stay
  out of promo; that rule is for videos, not the store.)
- **Tokens only.** `scene.css` copies colours as hex because it's outside the app. Use the tokens;
  where the videos use a value with no token (the mark's red `#d8202a`, the glow), append one token
  line each in `tokens.css` with a comment.
- **Do this first:** the header, the ground, the kickers and one framed panel, with shots at 1600 and
  390 (`kb30_look_*`). Then finish the rest in the same look.

## Gates
- `npm test`, `npm run check`, the typecheck and `npm run build`.
- **The steadiness measurement**, scripted in a browser at 1600 × 900 and 390 × 844, on a local build
  with the seven packs: scroll the store 300 px, then click ten controls in turn (four kinds, a tag,
  "See more", a chip ×, Clear all, Last 7 days, Sort). For each click log the clicked element's
  `getBoundingClientRect().top` before and after (must be equal), `.mk-scroll.scrollTop`, and
  `history.length`. Put the log in `findings/storefront/steady.log`.
- A recording of five filter clicks at 1600: `findings/ui_design_shots/kb30_filters.gif`.
- kb30 shots: the store and a product page inside the rail at 1600, 1024 and 390; the Publish chooser;
  the dimmed zero-count choices; My packages with "In this campaign".

## Report
Write `directives/reports/d_store_harden.md` from the template, with the manifesto table.

**Owned:** `apps/web/src/workspace/market/`; `apps/web/src/shell/Rail.vue` and the lines of
`views/MapView.vue` that mount it (shared: list every change); the router lines for `/packages`; the
command registrations in `market/command.ts`; tests under `tests/web/` (not `renderer.test.js`); your
shots, logs and report.

After each meaningful step, append one line under Progress: "done: X. next: Y."

## Progress
