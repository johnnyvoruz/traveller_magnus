# Lane D — the store, second pass: scroll, a filter column, solid routes

Issued 2026-10-15 by the orchestrator. You may be a fresh session with no memory. Read
`CLAUDE.md`, `directives/manifesto.md`, `directives/board.md`, `directives/lanes/D.md`, your
report `directives/reports/done/d_storefront.md`, then this file. No git but read-only, no
deploy, no `rules/`. Start after `d_store_scroll` is reported. Work in the order below.

## Johnny's words (2026-10-15, after 1.2.2 went live)

- "Looks fantastic, exactly what we were going for."
- "The dots for where the ships are going though on the main map should probably be solid lines."
- "There's a critical missing aspect to the packages that there's no scroll."
- "Let's also put all the filters and stuff into a left column and borrow some UX from Amazon."
- Earlier the same day: yes to the public ship card in the lime traffic colour.

## 1. The store does not scroll

Done in `d_store_scroll.md` before this pass, and pushed on its own. Build on it.

## 2. Filters in a left column, with Amazon's patterns

Borrow the patterns people know from Amazon's search results, never its money. Still no price,
cart, "free" badge or money word.

### At 1024 px and wider

- **A left column, about 240 px, sticky under the store head and scrolling on its own when tall.**
  Sections, top to bottom, each a heading and a list of checkboxes or links with counts in grey:
  1. **Kind:** the families from `marketplace/covers.ts`, each with its count. Within this
     section the choices combine with OR. This replaces the chip row.
  2. **Contents:** "Has map hexes" and "Records only". "Records only" shows only when such a
     package exists; Lane Z is adding records-only packages, so hide it while its count is 0.
  3. **Edition:** for example MgT2E, with counts.
  4. **Tags:** the ten most used, with counts, and "See more" to show the rest.
  5. **Updated:** "Last 7 days", "Last 30 days", "Any time".
  6. **Publisher:** the handles, with counts, when there is more than one.
- **Above the results:**
  - a results line, "1–24 of 31 results for 'regina'" (the search words only when searched);
  - the active filters as removable chips with "Clear all";
  - sort on the right: "Recently updated", "Most imported", "Title".
- **The grid fills the space to the right of the column**, with 3 columns at 1600.
- **The featured row:**
  - It stays on the plain storefront and hides as soon as a search or a filter is active,
    because Amazon's results pages carry no banner.
  - Head it truthfully: "Most imported" only when at least one package has an import.
    Otherwise use "New in the store" (it shows the latest three).
- **Filters live in the URL query**, so Back and a shared link restore them. An old `?kind=`
  still works.
- **Counts and filtering stay in the browser**, over the loaded page (decision of 2026-10-15).
  The B server queries for `family=` and `author=` come later.

### Below 1024 px

- No column. A "Filters" button sits beside sort, showing the active count, for example
  "Filters (2)".
- It opens a sheet from the left (on a phone, full height) holding the same sections, with
  "Show 12 results" at its foot.
- Back closes the sheet.

### The search box

The search box stays at the top, full width, as today.

## 3. Ship routes as solid lines, and the course ahead

Johnny, later on 2026-10-15: "Make course public, and then give it a checkbox I guess for refs to
turn off the course if they don't want it published." Lane B has built the server for it:
`contracts/b_public_games.md`, section "Course ahead (0020) — for Lane D". Read the whole section.

**What is drawn.** Every ship route on the sector map that is drawn as dots today (the open public
card's route in lime, and your own ships' routes) becomes a solid line:
- **The course ahead** (`course`, and for your own ships their planned legs): the bright line.
  - about 2 px, cased like the tracks so it reads on every chart ink;
  - rounded joins;
  - an arrowhead at its end, the last planned hex.
- **The finished track** (`legs`): the same colour, dimmed (about 45% alpha), no arrowhead. It
  runs into the ship's present hex, where the course starts.
- **An empty `course`:** only the finished track is drawn, with a small arrowhead at the present
  hex, pointing the way the ship came in.
- **The `course` key absent:** an older server. Treat it as empty, and never require the key
  in a parser.

Keep the 3:1 contrast you measured for the tracks. Measure both the bright line and the dimmed
track the same way, and give both numbers.

## 4. The public ship card in lime

Johnny said yes. On the read-only card, the ship's name, the border and the route line use
`--chart-traffic`. Update the token's comment, which says "nothing else".

**Remove the card's "Route" row** ("One finished leg, drawn on the map." / "N finished legs,
drawn on the map.", `workspace/public_card.ts` 119 to 123, and its place on the card). Johnny,
2026-10-15: "Remove the whole 'X finished legs, drawn on the map'." The line on the map stays.
`public_card.ts` is yours for this pass.

## 4b. The referee's course switch

Put a checkbox beside "Show my name on public cards", wherever that one lives, with the label
"Publish my ships' course".
- It is on by default.
- It sends `PATCH /api/universes/:id/public-games` with `{ public: true, showCourse }`, then
  refetches an open card.
- When the universe has no `showCourse` key (before 0020), show it on and disabled, and add the
  hint "Available after the next update." If the PATCH answers 503 `course_unavailable`, show the
  server's sentence by the box.

## 4c. Back to the same place in the store

D's question from the scroll fix, decided: the store remembers its own scroll position for Back.
Save the scroller's `scrollTop` per history entry. A new path still starts at the top. Back and
Forward restore the saved position once the cards have their height.

## 5. (Dropped)

The orchestrator now looks at production in Chrome itself. No live look is needed in this pass.

## Owned files (this pass)

- `apps/web/src/workspace/market/` (all of it)
- `apps/web/src/marketplace/covers.ts`
- `apps/web/src/map/MapRenderer.ts`
- `apps/web/src/map/traffic.ts`
- `apps/web/src/views/MapView.vue`
- `apps/web/src/workspace/PublicShipSheet.vue`
- `apps/web/src/workspace/public_card.ts`
- the file that holds "Show my name on public cards" (name it in your report)
- your own token lines in `design/tokens.css`
- tests under `tests/web/`
- shots `findings/ui_design_shots/kb27_*`
- `directives/reports/d_store_2.md`

If the scroll cause sits in a file outside this list, name the file and the fix under
"Needs from others" and stop on item 1.

## Gates

- `npm test`, `npm run check`, the typecheck and `npm run build`.
- A browser pass on a local build with the six packs: kb27 shots of the column, the sheet at
  390, filters in the URL, Back, the results line, the empty result, and the solid route with
  its arrow.

Write `directives/reports/d_store_2.md` from the template. After each meaningful step append
one line under Progress: "done: X. next: Y."

## Progress
