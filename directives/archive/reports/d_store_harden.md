# Lane D d_store_harden report
Prompt: prompts/d_store_harden.md
Status: done

Found: a fresh prompt (Progress empty); 1.2.6 pushed (`d6658f5` on origin). Lane M's shared pieces landed in `base.css` while I did items 1 to 4.
Finished: items 1 to 5, the steadiness measurement, the GIF, the kb30 shots, the gates.
Backed out: nothing.

## What changed, by item

### 1. One app: the store keeps the app's frame
- The store and the product page render inside the rail, as the map does: `PackagesView.vue` mounts `Rail.vue` and `AccountMenu.vue`.
  - The scroller is everything right of the rail (`inset: 0 0 0 var(--rail-width)`), and an expanded rail pushes it, as it pushes the chart.
  - Marketplace is the current item.
  - The account button and its pop-up work as on the map.
- The rail's items run commands, so the store registers the ones the map would:
  - Map: "Return to map", back to the map address the store was opened from, else `/`.
  - Account.
  - Campaign: the map with the Campaign panel.
  - Build: the map with Build on.
- System stays switched off on the store, as on the map with no world selected.
- "← Map" is gone. Back still works.
- The header is the brand from the videos (`.ui-brand`: the red-V mark and TRAVELLER.VOYAGE), then "Marketplace", with My packages and Publish on the right. Below 640 px it is the brand alone, a size down.
- The rail at 390 px does what it does on the map at that width: it stays 68 px.
- **Changes to `shell/Rail.vue`** (shared; these are all of them):
  - a new optional prop `marketOpen` (default false);
  - the Marketplace button gets `:aria-current="marketOpen ? 'page' : undefined"` (the button was split over several lines to fit it);
  - `.rail-item[aria-current="page"]` and its `.ui-icon` join the existing pressed/expanded selectors, so the current item looks like a pressed one.
- **`views/MapView.vue`: no change.** It mounts the rail as before, and `marketOpen` defaults to false.

### 2. Filters that hold still
- **Choices never vanish.**
  - `filters.ts` keeps every choice listed this visit (`seen`, `remember()`). At a count of 0 a choice dims (`.is-dim`) and can't be ticked; a ticked one stays clickable.
  - The order is the loaded cards', so a tick never reorders a list.
  - A section shows when any loaded card has a value for it. That now includes Publisher with one publisher, because author links filter by it.
  - "See more" keeps its place: the extra tags open below the button.
- **The column never moves** (0 px on every click, measured below):
  - The results hold their height through a change (`heldHeight`), so the scroller can't clamp.
  - When the results' top has left the window, the scroller glides back to it (`steady.ts`). The sticky column stays at 12 px throughout, and the hold then lets go.
  - The page's bottom room moved inside the results row, so the sticky column holds to the very end of the page.
  - `.mk-results` keeps at least the window's height.
- **Results change in place.** The results body (featured row, Browse by kind and grid together) dissolves up from 30 % over `--t-base` with the videos' ease. Cards keep their size and nothing goes blank.
- **History.**
  - A filter, chip, Clear all, Updated or Sort change replaces the entry.
  - A search submit, opening a package and the Filters sheet push.
  - Back leaves the filtered store in one step.
- Below 1024 px the results bar (count, Filters, Sort) sticks to the top as the page scrolls. Filters is always one tap away and never moves.
- **Imports** left the storefront. They are under My packages as "In this campaign", with the campaign picker.

### 3. The manifesto: changes (the table follows)
- **Every name is a link.**
  - On a card, the title is the card's link (stretched over the card), the kind badge goes to `?kind=`, and "by @handle" goes to `?by=`. Tab order is title, kind, author, and the card shows the amber ring while its title has focus.
  - On the product page: a breadcrumb "Marketplace / Maps" back to the store filtered by the kind, the kind kicker and the author as links, "See all by @handle", and tags as before.
- **The one toast.** The report, take-down and restore confirmations, and an import's removal, now go through `showToast`, not lines of their own.
- **The command palette:**
  - "Open the Marketplace" (renamed from "Marketplace").
  - "My packages".
  - "Publish records" (new, signed in). On the store it opens the dialog there; anywhere else it opens the records list, which opens the dialog once the campaign is open.
  - "Publish selection…" (Build's, with Build on and a selection) was already there.
- **No layout shift on data arrival.** On the plain storefront the first paint now has placeholders for the featured frame and Browse by kind too, and placeholder cards made of the real card's lines.
  - Measured at 1600 with the catalogue request held, then let go: featured 221/341, Browse by kind 581/63, grid 664/577, first card 664/280 (top/height in px), identical before and after.
  - Covers keep their 640 × 360 size.
- **Shared controls instead of local copies:**
  - the active filter chips and the tag links use `.ui-chip`;
  - Browse by kind uses `.ui-btn`;
  - the chooser and the sheet use `.ui-modal`.
- **The publish forms' limits line, and the hint "No campaign records are on these hexes.",** use `mk-fine` (in `PublishForm.vue` and `RecordsPublish.vue`). No `build-fine` is left in `market/`.

### 4. Publishing, findable from the store
- **Publish** (primary, in the header) opens `PublishChooser.vue` in the shared modal frame: Tab stays in it, Escape and the scrim close it, and focus starts on the first way.
- **Records** (people, ships, organizations): "Publish records from your campaign."
  - On a cold store it opens your campaign first ("Opening your campaign…"), then opens Publish records over the store; publishing lands on the new package's page.
  - When it can't go yet, one sentence says what to do first:
    - Signed out: "Sign in first: records are published from your own campaign." with Sign in.
    - No campaign: "Make a campaign first: …".
    - Someone else's campaign: "Open a campaign you made first: …".
    - No records: "Add records to your campaign first: …".
- **Map hexes** (systems, a subsector, a sector): "Publish part of your map, with its records."
  - It goes to the map with Build on and Select hexes on, with the toast "Select the hexes to publish, and then select Publish selection."
  - Signed out, it says to sign in first.
- The empty store, and an empty My packages, name both ways and offer Publish. "Publish a package" (a link to the map) is gone.

### 5. The look of the version videos
I studied the 1.2.3 video as a frame every 3 s first. Everything below uses Lane M's shared pieces:
- `.ui-ground` behind the page. It stays still while the page scrolls over it.
- `.ui-brand` in the header.
- `.ui-kicker` on the filter column's headings, "Browse by kind", "In this campaign" and the product page's sections.
- `.ui-rule` under the page heading and under the package title.
- `.ui-frame` for the featured row ("MOST IMPORTED 3"), "What's inside" ("WHAT'S INSIDE · HEXES 6 · RECORDS 6") and the import panel.
- `.ui-new` on packages updated in the last 7 days, on the card and the product page (NEW beside the kind's kicker, as in the videos).
- `.ui-date` for dates ("OCTOBER 16, 2026") on cards and the product page. The relative words ("Updated yesterday") are the tooltip.
- Headings are Orbitron, as they were.
- **Browse by kind**, a row of kind buttons with counts under the featured row, as in the videos' storefront.
- Covers kept.
- New token `--ease-video: cubic-bezier(0.33, 1, 0.68, 1)`: GSAP's power2.out, the videos' ease (`versionvideo/scene/lib.js`). It drives the dissolve and the glide. Reduced motion makes both instant.
- First shots `kb30_look_1600/390.png`; the rest is in the kb30 set.

**Candidates for the shared set** (now in `market/`):
- the text button `.mk-link`;
- the input box `.mk-box`;
- a tap-sized chip button (`.ui-chip.mk-chip`);
- the dimmed choice (`.is-dim`);
- the placeholder card built from the real card's lines;
- the store's header line (`.mk-brand` with `.mk-brand-where`);
- the publish chooser's way tile (`.mk-way`).

## The steadiness measurement (gate)
How it was run (`findings/storefront/steady.mjs`, log `steady.log`):
- In headless Edge at 1600 × 900 and 390 × 844, signed out, with the seven packs, on my Vite dev server against my local API (not a production build).
- The store scrolled 300 px.
- Ten controls clicked with the mouse: Maps, Systems, People, Ships, the Regina tag, See more, a chip's ×, Clear all, Last 7 days, Sort. At 390 the column's controls are in the Filters sheet, which is opened first and closed before the page's.

What was logged for each click:
- the clicked element's top before, one frame after, and after the motion settled;
- the column's top;
- `scrollTop`;
- `history.length` and the router's history position. Chromium stops `history.length` at 50, so the position is what shows a push.

| | 1600 × 900 | 390 × 844 |
|---|---|---|
| Clicks steady (element and column top equal before, next frame, settled) | 10 of 10 | 12 of 12 (including the sheet's open and close) |
| Column top | 12 px throughout | (in the sheet) |
| History position | held on all 10 | Filters sheet +1, closing it −1, held on the rest |
| One Back after the last click | leaves the store | leaves the store |

A removed control (a chip's ×, Clear all) is measured by its row, the results bar, which held still.

GIF: `findings/ui_design_shots/kb30_filters.gif`, the first five clicks at 1600 (33 frames).

## The manifesto, rule by rule
| Rule (manifesto §1, design_reference) | Store, product page, import panel, publish dialogs, sheet |
|---|---|
| One panel system, one show/hide | The store is a route page in the app frame; the sheet, the chooser, Publish records and the questions are the one modal (`.ui-modal`). Pass |
| One toast | Was: status lines of its own for report, take-down, restore and import removal. Changed: `showToast`. Publish progress on a product page stays a status line on the page (it is the page's state, not a message). |
| One modal | `.ui-modal` for the sheet, chooser, Publish records and MarketAsk. Pass |
| One shortcut registry, one command palette | The store registers its rail commands in the registry; the palette offers Open the Marketplace, My packages, Publish records, and Publish selection with Build on. Changed (two commands added or renamed). The store page itself has no omnibox; the palette is the map's. |
| No native dialogs; no `window.`, `innerHTML`, `getElementById` | `npm run check` clean. Pass |
| Extendability: registries, ES modules, boundaries | Commands through the registry; `check` clean. Pass |
| Tokens only, no literal colour or `ms` | `check` clean. One token appended: `--ease-video`. Pass |
| One panel at three widths | A page, designed and shot at 1600, 1024 and 390, never wider than the window (measured). Pass |
| A feature gets no chrome until it works from the palette | Publish records is now in the palette as well as the store's Publish. Changed |
| Connected: every name is a link | Was: author and kind were plain text on cards and the product page. Changed: the card's kind and author, and the product page's breadcrumb, kind, author and See all, link to the filtered store; tags already did. |
| Connected: the relation shows on both pages | A card links to its page; the page links back to the store by kind, author and tag, and to more by the author. Pass |
| Connected: cold-load render test per route | `tests/web/packages_entry.test.js` renders `/packages` and `/packages/:id` cold, now asserting the rail, the current Marketplace, the brand, the ground and the rule. Pass, updated |
| Graceful: nothing pops | Results dissolve; choices dim instead of vanishing; the column holds still; the featured row comes and goes in the same dissolve. Changed |
| Graceful: no layout shift on data arrival | Was: the featured frame and Browse by kind arrived after the placeholders and pushed the grid. Changed: placeholders for all three, measured identical at 1600. |
| Graceful: nothing seen before shows a loading state again | Covers come from the HTTP cache. Not met: the catalogue is fetched again on each visit, so its placeholders show again (not changed; see Found). |
| Graceful: lists virtualize | The grid is paged (24, Show more), not virtualized. Not changed; at today's size it is moot. |
| Graceful: main thread under 50 ms; Lighthouse no CLS | Not measured in this pass. Layout shift was measured directly instead (above). |
| Sci-fi (design_reference + the videos) | Item 5. Changed |
| §2.1 Dark field, thin light (amended: shadows on floating chrome) | Ground, hairline frames, the frame's faint halo (M's piece). Pass |
| §2.2 Teal is signal, amber is attention | Links and counts teal; the focus ring amber; dimmed choices grey. The red is the videos' NEW tag and rule (`--mark-red`, M's token). Pass |
| §2.3 Numbers are instruments | Filter counts and frame counts use tabular figures. Pass |
| §2.4 Reveal, do not pop; reduced motion | Dissolve and glide from motion tokens; both instant under reduced motion, as are the scroller's and the ground's slide with the rail. Pass |
| §2.6 Chrome is quiet; buttons outlined; the 2 px amber focus ring | `.ui-btn` throughout. The ring was measured as `rgb(255, 206, 115) 2px` on focus, with the card showing it round itself while its title link has focus. Pass |
| Focus order | Measured: header, search, the column (each choice, See more, Updated, Publisher), then the results (Sort, then each card's title, kind and author, then Browse by kind). Pass |
| §3 Empty state: one sentence, one action | The empty store and empty My packages: one sentence naming both ways, and Publish. Changed |
| §3 Badge / chip | Chips and tag links are `.ui-chip`; the NEW tag is `.ui-new`. Changed |
| §5 Typography | Orbitron for the page heading, the package title, card titles and kickers; Inter for text. Pass |
| Publish forms' limits line in `mk-fine` | Changed, in `PublishForm.vue` and `RecordsPublish.vue`, with the records hint. |

## Changed files
- `apps/web/src/workspace/market/PackagesView.vue`:
  - the frame (Rail, AccountMenu, the ground);
  - the brand header with Publish;
  - steady results (hold, glide, dissolve, the `seen` choices, history that replaces);
  - Browse by kind;
  - the placeholders;
  - the chooser wiring;
  - imports under My packages;
  - the narrow sticky results bar.
- `StoreFilters.vue`: dimmed choices, See more in place, kicker headings.
- `filters.ts`: `facets()` keeps seen choices with `dim`; `remember()`; the Publisher rule.
- `steady.ts` (new): `dissolve`, `glide`, `backToResults`, `tokenMs`, `easeOut`.
- `PublishChooser.vue` (new): the Publish chooser.
- `StoreCard.vue`: the title link over the card, kind and author links, NEW, the date box.
- `ProductPage.vue`: breadcrumb, kind and author links, See all, NEW with the kicker, the rule, the date box, kickers, What's inside framed with counts, toasts, the buy bar right of the rail, tags as `.ui-chip`.
- `ImportPanel.vue`: the panel as `.ui-frame`.
- `ImportsList.vue`: "In this campaign", the toast.
- `PublishForm.vue`, `RecordsPublish.vue`: `mk-fine`.
- `command.ts`: Open the Marketplace, Publish records, `publishAsk`, `askPublishRecords`.
- `market.ts`: `kindPath`, `byPath`, `tagPath`.
- `storefront.ts`: `dateWords`, `isNew`.
- `market.css`: the header line (`.mk-brand`, `.mk-brand-where`) replaces my first brand styles.
- `apps/web/src/workspace/CampaignList.vue`: takes the palette's Publish records ask once the campaign is open, or says why it can't in a toast.
- `apps/web/src/shell/Rail.vue`: `marketOpen` (listed in full under item 1).
- `apps/web/src/design/tokens.css`: one line appended, `--ease-video`.
- Tests:
  - `tests/web/store_harden.test.js` (new, 11);
  - `store_filters.test.js` (keep-and-dim, one publisher, `remember`);
  - `store_scroll.test.js` (the frame and the ground);
  - `packages_entry.test.js` (cold loads in the frame).
- Findings:
  - `findings/storefront/steady.mjs` and `steady.log`;
  - `harden_look.mjs`, `harden_flow.mjs`, `harden_shots.mjs`;
  - gate logs `s5_*.log`;
  - `findings/ui_design_shots/kb30_*` (mine: look, store, product and product_inside, dimmed, mine, publish_chooser, first_paint, filters.gif) and scratch `kbh_*`.
- `directives/prompts/d_store_harden.md`: Progress lines.

## Gates
npm test:      pass (1909 tests: 1871 pass, 0 fail, 38 skipped)
npm run check: pass (manifesto: clean)
typecheck:     pass (`tsc -p apps/api`; `vue-tsc -b` in the build)
build:         pass
browser:       pass. Steadiness 22 of 22 (above); kb30 shots at 1600, 1024 and 390; GIF. My servers (Vite 5341, API 8941/9941, Edge 9541) are stopped. Test data is only in my local state; nothing was published or installed in this pass.

## Found, not fixed
- **The catalogue is fetched again on each visit to the store**, so the (now steady) placeholders show again. The manifesto's "nothing seen before shows a loading state again" would want the last list kept in memory for the session. A small change for a next pass.
- **Another lane also used the kb30 prefix** (`kb30_changes_*`). No file of theirs was overwritten.
- **Halfway through, `vue-tsc` failed in `workspace/RecordMentions.vue`**, another lane's new file. It was fixed in their lane before my gates ran.

## Contract published
none

## Needs from others
none

## Questions for Johnny
1. **The NEW tag shows on every example package today.** All seven were updated in the last 7 days, so every card carries the red NEW. Keep "updated in the last 7 days"? I suggest yes: it fades out on its own and matches the videos' "NEW" for what changed. The alternative is NEW only for packages first published in the last 7 days, which needs a creation date on the card from Lane B.
2. **Cards show the date in the outlined date box ("OCTOBER 16, 2026") where they said "Updated yesterday".** The relative words are now the tooltip. Keep the date box? I suggest yes, as the prompt's look asks. The alternative is the relative words in the box ("UPDATED YESTERDAY").
3. **"Browse by kind" is new: a row of kind buttons with counts under the featured row,** taken from the videos' storefront. Keep it? I suggest yes: it is the one-click way into a kind, and it filters like the column (steady, replacing the entry). The alternative is to drop it and leave kinds to the column.
4. **Below 1024 px the results bar (count, Filters, Sort) now sticks to the top.** I added it so Filters is reachable at any scroll. Keep it? I suggest yes. The alternative is the bar scrolling away with the page, as before.
