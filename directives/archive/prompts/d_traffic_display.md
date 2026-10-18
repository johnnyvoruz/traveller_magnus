# Lane D — traffic display: ships read like tracks on a CIC or air traffic scope

Issued 2026-10-14 by the orchestrator. You may be a fresh session with no memory. Read
`CLAUDE.md`, `directives/manifesto.md`, `directives/board.md`, `directives/lanes/D.md`,
your reports `reports/done/d_public_ships_map.md`, `reports/done/d_party_ships_map.md`
and `reports/d_public_overview_map.md`, then this file. No git but read-only, no deploy, no
`rules/`.

**This replaces the look in `d_public_overview_map.md`.** Keep what that pass built
underneath: the overview reader and its once-a-minute watch, the 44 px touch targets, the
"1 of N" stepping in the card, the card itself. Replace how ships are **drawn**: the
violet darts, the glow halos, the ship-name tags, the "Example" tags and the ring pings
(`ShipPings.vue`) all go.

## Johnny's words (2026-10-14, looking at the live map and your previews)

- "They are barely visible and you can't see them at all on the zoomed out dots where it
  is just as important."
- "Lose the 'example' text."
- "Think tactical CIC or air traffic control, and these blips can't fight with the rest
  of the map. Way way way too cluttered."
- Earlier: "make the blips sing." Public ships are flavour, "a 'Community' feeling vibe".

## Why the current look fails (orchestrator, from the shots)

- **Colour can't do it alone.** The chart already uses nearly every hue: orange, olive,
  grey, purple, teal, pink and red polity fills, white borders, blue and white world
  dots, green routes, amber and red zones. A pale violet mark sits at almost the same
  lightness as half of them, so it disappears (`kb24_public_overview_preview_1600_*`).
- **The tags are the clutter.** At the names zoom every ship carries an italic name tag
  and an "Example" chip that run across other hexes' names and profiles (Johnny's shot:
  "Dry Hold [Example] Mile Marker [Example]" over Rorre and 494-908).
- **The glow and rings add soft light everywhere** and still don't make a ship findable.

## The design (decided; build it)

A traffic scope works like this: the map is a dim underlay, and tracks are small, bright,
hard-edged and alone in moving. Text shows only for the track you point at. Apply that.

1. **One track symbol, the same at every zoom.** It is drawn at a **constant size on
   screen** (about 11 px across, never scaled by zoom) and **on top of everything** on the
   chart.
   - **Shape:** a diamond. Not a square (systems are squares when zoomed out), not a
     circle (worlds), not an arrow (no heading is published), not a star or triangle
     (bases).
   - **Other people's ships:** an open diamond (a 2 px stroke) in one **traffic colour**.
   - **Your own ships:** the same diamond, filled, in the party cyan you use today. Your
     lead ship keeps its chevron at the hex zoom. Solid means yours and open means theirs,
     the same idea as friendly and unknown tracks on a scope.
2. **A dark outline is what makes it readable on any fill.** Every symbol has a dark
   outline on both sides of its stroke (`--bg-0` at high opacity, about 1.5 px). That is
   how map symbols stay readable on any background. It does more for legibility than the
   choice of colour.
3. **The traffic colour** is one new token, `--chart-traffic`, used for nothing else.
   Choose it by measuring, not by eye:
   - Take every colour the chart can draw under a ship: the background, every polity fill
     and border in the stylesheet and allegiance tables, the world dots, the routes, and
     the zone rings.
   - Rule out the party cyan, zone amber, zone red and the route greens.
   - Pick the colour with the best worst-case contrast against that set. A bright radar
     phosphor green or a pale ice white are good first candidates.
   - Put three candidates side by side on one contact sheet, at every zoom, on the
     busiest stretch you can find (the Spinward Marches, Deneb and Vargr border). Choose
     one and say why in the report.
4. **Where the symbol sits:**
   - **Zoomed out (the galaxy and sector zooms):** centred on the system, so the open
     diamond frames the world's dot like a target box on a radar return.
   - **At the hex zoom:** at the hex's upper right, clear of the starport letter, the
     profile, the name and the gas giant mark, as your darts were.
   - **Several ships on one hex:** up to three diamonds side by side, and a fourth means
     "more", without a numeral.
   - **When symbols would overlap on screen** (zoomed far out, ships within about 12 px),
     merge them into one symbol with a second, inner diamond, which means "more than one
     here".
5. **Motion: the radar sweep.** An **invisible** sweep turns once every 6 seconds around
   the middle of the map view. As it passes a symbol's bearing, that symbol "paints": it
   brightens to full and swells about 1.5 times, then fades back to its resting
   brightness (about 75%) over about 1.2 seconds, like phosphor fading.
   - The symbols flare in turn around the screen, and nothing else on the chart moves.
     Motion is what the eye finds first, so this is what makes them visible without
     making them big.
   - No rings and no glow.
   - With reduced motion, there is no sweep and the symbols rest at full brightness.
6. **No text at rest.**
   - No ship names, no "Example", no counts on the map.
   - **Hover** (a mouse) shows a small data block: the ship's name in capitals in
     `--font-data`, on a dark plate, joined to the symbol by a short leader line.
     Place it so it doesn't cover the hex's name or profile. For a stack it reads
     "KESTREL'S DUE +1".
   - **A tap or click** opens the card, as now.
   - **A selected ship** gets a bracket around its symbol while its card is open. Its
     finished route draws as fading dots in the traffic colour, the oldest faintest, like
     a track's history. That replaces the violet dots.
7. **Zoomed out, a click on a symbol flies the camera to that hex at the hex zoom**, where
   the ship's own symbol takes the click. The overview carries no names, so a hover there
   shows no data block.
8. **The card loses its "Example" tag.** Instead, one quiet line in the card's footer
   reads "Example game" when `example` is true. That is an orchestrator call and Johnny
   may drop it. The feed and overview still carry `example`; only the drawing changes.
9. **Performance:**
   - The sweep must never redraw the chart. Draw the symbols on their own layer (a
     canvas over the chart, or the DOM layer you already use), moved with the camera.
   - Cap that layer at 30 frames a second.
   - Stop it when the tab is hidden.
   - Measure the frame time with 300 symbols on screen and report it.

## Acceptance (measured, in the report)

- **Contrast:** in every shot, for every symbol, the stroke's luminance contrast against
  the median of the ring of pixels just outside its outline is at least 3:1. Measure it
  from the screenshot pixels with a small script, and list the worst five.
- **Size:** the symbol is the same size in pixels at every zoom (a test on the renderer's
  numbers).
- **No text:** the traffic layer draws no text at rest (a test).
- **The chart is still:** the chart's draw count does not rise while the sweep runs (a
  test).
- **Every example ship is visible at every zoom:** all 18 of Z's example games, on a
  local state seeded with `tools/examples/seed_games.mjs --to-local`, and your own three
  ships.
- **Phones:** taps keep working at 390 px at every zoom (the 44 px rule), and the hover
  data block never appears on touch.

## Owned files (this pass)

`map/MapRenderer.ts` (the party and public layers), `map/public_games.ts`,
`views/MapView.vue`, `workspace/ShipPings.vue` (delete it if nothing uses it),
`workspace/PublicShipSheet.vue`, `workspace/public_card.ts`,
`workspace/public_ship_card.ts`, new files of yours under `map/` or `workspace/` for the
traffic layer, `design/tokens.css` (your own lines: `--chart-traffic` and any you
retire), tests under `tests/web/`, shots `findings/ui_design_shots/kb25_traffic_*`,
`directives/reports/d_traffic_display.md`. Lane B is adding the overview route in
`routes/public_games.ts` this turn. Nothing else is yours this pass.

## Gates

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, pasted. **Browser,** at
1600 and 390 px:
- the galaxy, sector and hex zooms on the busiest stretch, before (from your kb24 shots)
  and after;
- the three-colour contact sheet;
- a hover data block, a stack, and a selected ship with its route;
- your own ships beside someone else's;
- reduced motion;
- a short screen recording or a frame strip of the sweep (four frames across one turn).

Use B's overview route if its report is in. If it isn't, use the in-page answer you used
in kb24 and say so. Start Vite with its own cache directory; stop every server after.

## Stop rule

Stop when the gates pass and the report is written. Johnny reviews the shots before any
second step: a dedicated "scope" view that dims the chart, plus a track list, comes only
if he asks for it after seeing this.

Write `directives/reports/d_traffic_display.md` from `directives/reports/_TEMPLATE.md`.
After each meaningful step append one line under Progress: "done: X. next: Y."

## Progress
done: traffic layer built (map/traffic.ts: constant-size cased diamonds, sweep, data block, bracket, 30 fps clock); renderer builds tracks instead of darts, glow, tags and pings; ShipPings.vue and PublicShipCard.vue deleted; card's Example tag is a footer line. next: colour measured and chosen (lime #d4ff3a), then tests.
done: colour measured on the chart's own pixels and chosen (lime #d4ff3a, findings/traffic_colour.md); contact sheet of lime, phosphor and ice. next: tests.
done: tests (traffic_display.test.js new; four test files rewritten for tracks). next: browser pass.
done: browser pass at 1600 and 390 on my ports, on B's overview route; every ship visible at every zoom; taps, hover, stack, selection, reduced motion, sweep strip; 300 tracks moved to sprites (30 fps layer, 120 fps browser); 602 tracks all at least 3:1. next: gates and report.
done: gates pass (1791 tests, 0 fail; check clean; typecheck; build); servers and Edge stopped; report written as done. next: none; d_storefront is next on the board once Johnny has seen the shots.
