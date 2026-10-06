# Agent D — three small things in the orbit header and the ship strip

Issued 2026-10-06 by the orchestrator. **Do this after you have reported ship MVP part 2**
(`d_ship_mvp_2_resume.md`), not in the middle of it. Read `directives/agent_d_brief.md` first
if this is a fresh session.

Johnny, looking at the live orbit view:

1. **"orbit-btn orbit-readout needs a little more right padding as well."** The date readout
   in the header (`orbit/HeaderClock.vue`, `.orbit-btn.orbit-readout`): its text sits too
   close to the right edge. Give it even breathing room at both ends, at the wide form and
   the narrow one. The width must stay fixed at its longest reading (the scrub glitch of
   2026-10-05 came from this readout changing width under the pointer;
   `orbit/time_row.ts` and its test pin it): change the allowance, not the rule. Measure
   the gap left and right in the browser, both forms, and report the numbers.
2. **"The 'no ships here' maybe should be centered or long enough that there's no word
   wrapping."** `orbit/ShipStrip.vue`, `.orbit-ships-none`. It wraps onto two lines. It must
   sit on one line at every width the strip takes (column, half, full, a 520 px and a
   1,100 px window). Centred in its place, or the place made wide enough: your call from the
   look of the strip; say which and why.
3. **"Also this does nothing? … let's remove?"** He pasted the calendar-star icon at 12 px.
   The orchestrator reads that as the **campaign mark button** to the right of the readout
   (`.orbit-btn.orbit-campaign-mark`, command `orbit-go-campaign`): the view opens on the
   campaign date, so pressing it does nothing, and in the narrow form it is a bare icon.
   **Remove it from the header at rest.** Keep the command and its key (C). The way back to
   the campaign date lives in the Time drawer, beside "Set as campaign date", and shows only
   when the view is off that date. The readout itself should say, quietly, when the view is
   off the campaign date (your design call; tokens only; nothing that changes its width).
   The Keys table, the test that every command has a control, and your drawers note
   (`findings/orbit_drawers_design.md`, where the mark was choice D2: now superseded by
   Johnny) all stay true.

4. **A mark that is a jump is not a ship on the picture.** Agent C's jump bubble is in:
   `placeShips` now also returns, while a jump is in progress, a mark with `jump: 'out'`
   (where the ship left) or `jump: 'in'` (where it will arrive), for the renderer's bubble
   only. Read `orbit/ships.ts`. Anything of yours that looks a ship up among the canvas's
   marks (`shipStatus` in `OrbitCanvas.vue`, `ship_marks.ts`, the plotting "from") must
   pass over a mark that has `jump` set, so a ship in jump is never measured against the
   100D rings or plotted from. A test for it. Then see the bubble with a real vessel: jump
   one from Regina and watch it leave; open the destination system at the arrival date and
   scrub across it.

5. **The plot card's title wraps inside a name** ("Regina A-X-" / "b" in
   `k12b_plot_estimate.png`). A body's name stays whole: one line with the dates beneath, or
   whatever keeps the card's width fixed; nothing may shift when the destination changes.
6. **The vessel's own Where block follows the track**, as the Party tab does: on a vessel
   with a track it shows the track's answer at the campaign date, in the same words, and
   its change control does what "Move the party" does (a docked leg). A vessel with no
   track is as today.
7. **The jump's parsecs and fuel (step 2 of part 2).** Agent A is adding
   `parsecsBetween(hexKeyA, hexKeyB, sectorAt)` to `apps/web/src/map/geometry.ts`, where
   `sectorAt(slug)` gives a sector's grid position from the truth overview the map's client
   already loads. Show the line you prepared: the parsecs through `jumpParsecsCounted`, and
   `jumpFuelTons(ASSUMED_HULL_TONS, parsecs)` with the assumption in words. **If
   `parsecsBetween` is absent when you reach this, leave the line hidden and say so.**

8. **The reaction-drive line on a long flight.** When `reactionFuelTons` is more than the
   assumed hull, the line reads "Reaction drive: more than the ship's tonnage" in place of
   the number. Johnny was asked and said to keep it easy; this is the orchestrator's pick
   and he may change it. One pure function, tested at just under, at and just over the hull.

9. **The pinned body card and the open dossier.** Agent E is giving `orbit/BodyCard.vue` an
   optional prop `surveyElsewhere`: true, and the card shows only what the picture is doing
   now (orbit, distance, season, today's temperatures, daylight), leaving the survey to the
   sidebar. Pass it from where the card is mounted, true exactly when the dossier is open on
   the same body. `BodyCard.vue`, `orbit/card.ts` and `dossier/` are Agent E's: do not edit
   them. **If the prop is not there when you reach this, skip the item and say so.**

**Your four questions from part 2, ruled:** (1) the hex distance is item 7, and Agent A's
`parsecsBetween(hexKeyA, hexKeyB, sectorAt)` is now in `map/geometry.ts`; a sector's grid
position is `x` and `y` on `SectorOverview` (`TruthOverview.sectors`), so
`sectorAt = (slug) => { const s = overview.sectors.find((i) => i.slug === slug); return s ? { sx: s.x, sy: s.y } : null }`. (2) The size of
the reaction-drive figure on long flights is item 8. (3)
Before a track's first departure the ship is at its anchor: Agent A has changed `whereAreWe`
to answer so; check the Party tab and the marker agree, with no workaround on your side.
(4) "Move the party" does **not** write the ship's anchor when there is a track: Agent A has
made the campaign index follow the track, so "Records here" and the list's "At" move with
the ship; check both after a jump.

Also: you ran one read-only `git status`. The rule is no git at all; to see whose files are
changing, ask in your report, or look at what your own step touched.

## Check

`npm test`, `npm run check`, `npm run typecheck`, `npm run build` green, pasted. In the
browser: the header at rest and with each drawer open, signed in and signed out, on and off
the campaign date; a scrub across the campaign date with the pointer held (nothing in the
row moves); the empty ship list at each width. Contrast pairs for anything new. Screenshots
`fu19_*` beside the current ones. Notes into `findings/orbit_view_design.md`. Do not touch
`OrbitRenderer.ts`, `orbit/ships.ts`, `campaign/`, `surface/`, `deckplan/`. Stop and report,
in the brief's format.
