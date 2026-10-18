# The world panel, streamlined, with collapsible sections (Lane C, stream item CW1)

Issued 2026-10-17 by the orchestrator from Johnny's brief (pasted 20:55, below unchanged). Lane C works it as stream
item CW1 in `streams/C.md`; the entry goes to `reports/c_stream.md`, shots `findings/ui_design_shots/sc_CW1_*`.

## The orchestrator's notes (read before the brief)
- **Files you will meet** (verify in Step 0): `dossier/DossierPanel.vue`, `dossier/DossierBody.vue`,
  `dossier/SurfaceStage.vue` (the caption, scale bar, Day/Night, Symbols, Map and key), `dossier/DayNight.vue` (the
  DAY AND NIGHT / SCOUT SURVEY block), `dossier/StellarLines.vue`, `dossier/StatRows.vue` (if the stat cards live
  there), `workspace/RecordsHere.vue` ("Nothing of yours here yet"), `shell/Panel.vue` (the header: D's DF7 made the
  Column header two rows today; this brief's Step 1 supersedes DF7 **for panels with a pager**; keep DF7's behaviour
  everywhere else), and `dossier/model.ts` for the subtitle string "Mainworld of the …" (Lane A's file: claim it for
  that string only; no data or calculation change).
- **Claims:** claim each file per step in `streams/claims.md`. `CampaignPanel.vue` is not in this item.
- **Order with your other items:** after CS8 (city lights), before CS9 (the surface hex hover builds on this item's
  new map toolbar) and LS4 (the ticker sits under the dossier header).
- **Shared look:** `design/base.css` and `design/tokens.css` only; no hex colours outside `tokens.css` (`npm run check`).
  The accordion's chevron, the segmented control and the icon buttons: reuse what `base.css` already has (`.ui-btn`,
  `.is-icon`, the segmented switch the header uses) before adding anything.
- **Words:** Google style; the brief's strings are Johnny's and stand.
- **No rules change:** Kelvin is removed from display only; values come from the existing model.
- **localStorage** for the open sections is a per-device convenience: wrapped in try/catch, the panel renders with
  everything open if storage throws.
- **Gates:** `npm test`, `npm run check`, `npm run typecheck`, `npm run build`. Tests: SSR of the panel at the three
  widths for a tidally locked world and a rotating one; the accordion's `aria-expanded` and persistence; the popover's
  Escape and outside click; "no Kelvin" (no `K` value in the rendered panel). Shots at Column, Half and Full, at 1600
  and 390, for Youghal (Spinward Marches 3039, or whatever hex the brief's world is) and one rotating world, before
  and after. Check in Edge without a GPU too.
- **Report** as the brief's "Report back" asks, plus the acceptance checklist ticked per width.

---

## Johnny's brief (unchanged)

Task: Streamline the world detail panel (column and half modes) and make its sections collapsible
Context

The world detail panel opens when a user selects a world (example: Youghal, hex 3039). It has three width modes: COLUMN, HALF and FULL. Full mode looks acceptable. Column and half modes are cluttered under the surface map: controls wrap onto extra rows and the same facts appear several times.

This task changes layout and markup only. Do not change the map renderer, the world data model or any calculations.

Use the project's existing colors, fonts, spacing tokens, icon set and button components. Do not introduce new colors or fonts.

Step 0: Locate the code (do this before editing)
Find the component that renders the world detail panel. Search for these strings: Mainworld of the, Surface map, Day/Night, Map and key, DAY AND NIGHT, SCOUT SURVEY, YOUR RECORDS, Nothing of yours here yet, Twilight zone.
Find where the panel width mode (column / half / full) is set.
Find the time controls (pause button, speed select 1 min/s, date input, Go, Now) and the status line that starts with Year 1,105 · Day 2.
List the files you will change before you change them.
Step 1: Header
Move the pager (‹ 12 / 22 ›) out of its own row and into the header, on the right side.
Column mode: right side of header has two rows. Row 1: width toggle (COLUMN / HALF / FULL) and close button. Row 2: pager.
Half and full mode: one row on the right: pager, width toggle, close button.
Delete the standalone pager row below the header.
Move the MAINWORLD badge from under the map into the header, inline after the world name.
Change the subtitle from Mainworld of the Youghal system · 3039 to Youghal system · Hex 3039 (use the real system name and hex). Show the MAINWORLD badge only when the world is the mainworld.
Step 2: Map toolbar (one row under the map)

Replace everything between the map and the UWP strip with a single row:

Left: the scale bar and 1 hex ≈ 884 km text.
Right, in this order:
A segmented control with two toggle buttons: Day/Night and Symbols. Keep existing behavior.
An icon-only info button. Its title and aria-label contain the current map description text (the text that today reads Surface map · Enhanced · Water · locked, night side centred, minus the lighting part).
An icon-only expand button that opens the existing Map and key view. aria-label="Open map and key".

Remove:

The separate caption line (Surface map · Enhanced · ...).
The MAINWORLD badge from this area (moved to header in Step 1).

Add a small label overlaid on the bottom-left corner of the map that shows the lighting state, for example Night side centred. Position absolute inside the map container, small text, dark semi-opaque background, 1px border.

Responsive rule (important):

Put container-type: inline-size on the left/main column that holds the map.
Use an @container query so that when that column is narrower than 480px, the Day/Night and Symbols buttons show icon only (hide the text label, keep aria-label and title).
Do not use viewport @media queries for this. Half mode must get the compact toolbar because its column is narrow, even on a wide screen.
The toolbar must never wrap to a second line in column or half mode.
Step 3: Time controls
If the world is tidally locked, do not render the time controls or the time status line at all.
If the world rotates, render one row:
Pause/play icon button.
Speed select (existing options). Give it a visually hidden <label>.
A clock readout button that fills the remaining width, for example Year 1,105 · Day 2 · 06:14. Clicking it opens a small popover anchored below it containing the date input (format DDD-YYYY) and the Go button. Close the popover on Go, on Escape and on outside click. Set aria-haspopup="dialog" and aria-expanded on the readout button.
Now button.
Delete the separate status line (Year 1,105 · Day 2 · ... locked to its star: the shadow is still). The readout button replaces it.
Step 4: UWP strip

Keep it as is. Place it directly below the map toolbar (or below the time row when that row is shown).

Step 5: Stat panel

Replace the five separate stat cards (Diameter, Gravity, Mean temp, Rotation, Year) with one bordered panel:

CSS grid, 3 equal columns, 1px internal dividers, one outer border with rounded corners.
Row 1: Diameter, Gravity, Mean temp.
Row 2: Rotation (spans 2 columns), Year.
Each cell: small uppercase label above, value below.
Mean temp value: 11 °C followed by smaller muted 52 °F on the same line. Remove Kelvin.
Rotation value: Tidally locked followed by smaller muted twilight band when the world has a twilight zone. For rotating worlds show the rotation period instead.
Year value: orbital period to one decimal, for example 232.7 followed by smaller muted std days.
Step 6: Remove the Day and Night block

Delete the DAY AND NIGHT / SCOUT SURVEY terminal-style block entirely. Its data is covered by the stat panel and the Orbit section.

Step 7: Detail sections (Orbit, Physical, Life & Resources)

Remove fields that the stat panel already shows:

Orbit: remove Tidally locked, Twilight zone and Orbital period (days). Keep Orbit, Distance, Eccentricity, Axial tilt.

Move units from labels into values:

Distance (AU) → label Distance, value 0.67 AU.
Axial tilt (°) → label Axial tilt, value 0.5°.
Mass (M⊕) → label Mass, value 2.167 M⊕.
Atmospheric pressure (bar) → label Atmospheric pressure, value 2.28 bar.
High and low temperature: one line, 31 °C · 87 °F. Remove Kelvin.

Apply the same unit rule to any other field in these sections that has a unit in its label.

Step 8: Collapsible sections (accordion)

Make these sections collapsible: Your Records, Orbit, Physical, Life & Resources. Each section opens and closes independently. More than one can be open at once.

For each section:

The section heading text becomes a <button> inside the <h2>, full width, left aligned, keeping the current heading style.
A chevron icon sits before the heading text. Open: points down. Closed: rotated -90° (points right). Animate the rotation over 150ms.
The button has aria-expanded="true|false" and aria-controls pointing at the section body's id.
When closed, the section body is not rendered (or is hidden), and the heading shows a small muted summary aligned right: the field count for data sections (for example 7 fields) and None yet / record count for Your Records.
Each section has a 1px top border so collapsed sections read as a list of rows.
Your Records: the Add here split button stays on the right of the heading row, outside the toggle button. Do not nest buttons.
Default state: all sections open.
Persist each section's open/closed state per user in localStorage under one key, for example worldPanel.sections storing { "records": true, "orbit": true, "physical": false, "life": true }. Wrap reads and writes in try/catch. If storage is unavailable, fall back to all open.
The state applies in all three width modes.
Step 9: Layout order

Column mode, top to bottom:

Header
Map (with lighting label overlay)
Map toolbar
Time row (rotating worlds only)
UWP strip
Stat panel
Your Records (collapsible)
Orbit (collapsible)
Physical (collapsible)
Life & Resources (collapsible)

Half and full mode: left column holds items 2 to 6. Right column holds items 7 to 10.

Acceptance checklist

Verify each item in column, half and full mode before reporting done:

 No standalone pager row. Pager is in the header.
 MAINWORLD badge appears once, in the header.
 Map toolbar is one row and does not wrap. Half mode shows icon-only layer toggles.
 No separate map caption line and no separate time status line.
 Tidally locked world: no time controls rendered.
 Rotating world: one time row; the readout opens a date popover; Escape and outside click close it.
 Five stat cards replaced by one panel with a 3+2 layout.
 Day and Night / Scout Survey block is gone.
 Tidally locked, Twilight zone and Orbital period no longer appear in the Orbit section.
 No Kelvin values anywhere in the panel.
 All four sections collapse and expand by mouse and by keyboard (Tab to the heading, Enter or Space toggles).
 aria-expanded updates on toggle.
 Collapsed state survives a page reload.
 Full mode still looks as good as before.
 No new colors, fonts or spacing values were added outside the existing tokens.
Report back

When done, report:

Files changed.
Any field from the old panel that you could not place according to this spec.
Any acceptance item that did not pass, with the reason.
