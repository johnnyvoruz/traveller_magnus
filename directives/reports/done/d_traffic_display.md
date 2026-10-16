# D traffic_display report
Prompt: prompts/d_traffic_display.md
Status: done

Found: a fresh prompt with no Progress lines. My files held the finished `d_public_overview_map` work, which this pass builds on.
Finished: everything the prompt asks, with every gate run on the final code.
Backed out: nothing.

## What changed for the eye

- **Ships are tracks.** Each ship is one cased diamond, 12 px corner to corner at every zoom, drawn on its own
  canvas over the chart. Someone else's ship is open in `--chart-traffic` (lime `#d4ff3a`); yours is filled in
  the party cyan. An inner diamond means more than one ship here. The violet darts, glow, name tags, "Example"
  chips, "+N" counts and ring pings are all gone.
- **The colour was measured, not picked by eye** (`findings/traffic_colour.md`). Twelve candidates were scored
  against the chart's own pixels at seven views. Lime keeps contrast within 0.3 of the best, and it is the only
  bright colour far from every chart ink: white, ice and pale yellow read as world dots or borders. The contact
  sheet compares lime, phosphor and ice at four zooms.
- **The sweep.** An invisible sweep turns every 6 s round the middle of the view. As it passes a track, the track
  goes to full brightness and 1.5 times its size, then fades back to 75% over 1.2 s. Nothing else moves; the old
  route march is gone too. With reduced motion there is no sweep and the tracks rest at full brightness.
- **No text at rest.** Hovering with a mouse shows a data block: the name in capitals in `--font-data`, on a dark
  plate, joined by a leader up and to the right, clear of the hex's name and profile. A stack's fourth track
  reads like "HULL 4 +3". A finger never shows the block.
- **Where tracks sit.** Zoomed out, a track is centred on its system, so the open diamond frames the world dot.
  Tracks within 12 px merge into one with an inner diamond. At the hex zoom, tracks sit at the hex's upper right,
  side by side: yours first, then theirs, up to three, and a fourth with an inner diamond for the rest.
- **Zoomed out, a press on a track flies the camera to that hex** at the names zoom (z 63.75). The ship's own
  track then takes the next click.
- **A selected ship** gets corner brackets while its card is open. Its finished route draws as still lime dots,
  cased in the chart's dark, with the oldest leg faintest.
- **Your ships.** The lead keeps its chevron at the hex zoom, but without its name tag; the name is its hover
  block. Your other ships are filled diamonds. Zoomed out, all your ships are filled tracks, and where yours and
  theirs share a system, theirs stands one step to the right.
- **The card** has lost its "Example" chip. An example's card has one quiet footer line, "Example game".

## Measured (acceptance)

- **Contrast.** All 602 tracks in 25 shots (1600 and 390 px, every zoom, at rest and mid-sweep) are at least 3:1
  against the median of the ring just outside their outline. The worst five:
  - 3.13: a track mid-swell on the grey Imperial fill (`kb25_traffic_sweep_1.png`, 771, 439);
  - 3.21, 3.21, 3.26 and 3.31: the 300-track stress shot, on the same fill.

  Outside the stress shot, the worst after the first is 4.60. Method: `findings/traffic_colour.md`.
- **Size.** Tests check that a track's box is the same in pixels at z 1, 3, 10, 22.5, 40, 64.75 and 150, and that
  the drawn half-diagonal is TRACK_PX / 2 whatever the zoom.
- **No text.** A test checks that the layer calls neither `fillText` nor `measureText` until a track is hovered,
  then writes exactly one block.
- **The chart is still.** A test turns the sweep for 6 s and the chart's draw count does not move; `traffic.ts`
  never references the renderer. In the browser, a MutationObserver on the chart's draw stamp counted 0 chart
  draws while the layer painted 172 frames in about 6 s.
- **Every ship is visible at every zoom.** This was checked on the traffic canvas's pixels on my local state: all
  19 public ships plus my 3 at the galaxy and sector zooms (22 of 22), and each of the 19 at its own hex at z 40
  and z 100 (19 of 19). The 19 are Z's 18 example ships plus Lantern Run's Pale Heron.
- **Phones (390 px):**
  - zoomed out at galaxy and sector, a tap 7 px off a track flies in to z 63.75;
  - at the hex zoom, a finger 16 px off a track opens Copper List "1 of 2";
  - at the names zoom, a finger 11 px off the second track opens Kestrel's Due "2 of 2";
  - a finger on Roup opens Roup;
  - the hover key stayed empty after every tap.
- **Performance, 300 tracks on screen** (a faked overview of 300 hexes, two apart, so none merge):
  - the layer paints 30 frames a second, each in 0.5 ms (p95 0.7, max 0.9);
  - the browser stays at 120 frames a second (p95 gap 8.4 ms);
  - the chart drew 0 times;
  - the first paint after a zoom-level change takes about 4 ms once, to build the sprites.

  My first version drew each track as paths every frame. In headless Edge's software renderer that dropped the
  browser to 24 fps (p95 gap 92 ms) and the layer to 11 fps, though its script ran in 0.4 ms. Each kind of track
  is now drawn once into small sprites at seven swell steps and stamped each frame.
- **Stopping.** The sweep runs only while there are tracks and the tab is visible, and never with reduced motion
  (0 frames painted in 2 s at rest). The hidden-tab stop is checked by a unit test, because headless Edge cannot
  hide a tab.

## Choices I made that you may want to undo

- **The diamond is 12 px corner to corner, not 11.** With a 2 px stroke and a 1.5 px casing on both sides, 11 px
  leaves under 2 px open inside, and the diamond stops framing the world dot. The constant is `TRACK_PX` in
  `map/traffic.ts`.
- **Zoomed out, a press on one of your own tracks flies in** like any other track instead of opening the Party
  tab. At the hex zoom, your tracks and the lead's chevron open the Party tab as before.
- **The card's own colours are still the old violet** (`--chart-public`), because the prompt reserves
  `--chart-traffic` for the tracks. That is question 1.

## Changed files
- `apps/web/src/map/traffic.ts` (new): the traffic layer: tracks, the sweep, sprites, the data block, the bracket, a 30 fps clock that stops when the tab is hidden, and `fitLabel` (moved here).
- `apps/web/src/map/MapRenderer.ts`: builds tracks (`hexTracks`, `farTracks`, `trackAt`, `setSelectedShip`, `selectedTrackKey`, `setTrafficColour`) instead of drawing darts, glow, tags and pings; the route is still dots in the traffic colour; the campaign layer gets only the lead at the hex zoom, with no tag.
- `apps/web/src/views/MapView.vue`: adds the traffic canvas and its wiring; the hover is now the data block; zoomed out, a press on a track flies in; the pings, the hover card and their state are removed.
- `apps/web/src/workspace/PublicShipSheet.vue`: the "Example" chip becomes the footer line "Example game".
- `apps/web/src/workspace/ShipPings.vue`, `apps/web/src/workspace/PublicShipCard.vue`: deleted, nothing used them.
- `apps/web/src/design/tokens.css`: adds `--chart-traffic: #d4ff3a`; retires my `--ship-ping`, `--ship-ping-reach` and `--ship-ping-reach-far`.
- `tests/web/traffic_display.test.js` (new, 12 tests). `party_ships_map`, `public_ships_map`, `public_overview_map` and `public_games` tests rewritten for tracks.
- `findings/traffic_colour.md` (new): the measurement.
- `findings/ui_design_shots/kb25_traffic_*` (36 shots):
  - `contact_sheet` (lime, phosphor and ice at four zooms) and the twelve `cand_*` shots it is cut from;
  - `before_after_1600` (kb24 beside kb25 at the galaxy, sector and names zooms);
  - `after_1600_*` and `after_390_*` at the galaxy, sector, hex and names zooms, with your ships beside others',
    plus `after_390_hex_rest`;
  - `hover_1600`, `selected_names_1600`, `selected_route_1600`, `390_stack_tap`, `390_selected`;
  - `reduced_1600_sector` and `reduced_1600_hex`;
  - `sweep_1` to `sweep_4` and `sweep_strip` (four frames 1.5 s apart);
  - `300_tracks_1600`.

## Gates
npm test:      pass (1791 tests: 1756 pass, 0 fail, 35 skipped)
npm run check: pass (manifesto: clean)
typecheck:     pass (`tsc --noEmit -p apps/api`, exit 0; `vue-tsc` on the web app also clean)
fourth gate:   pass (`npm run build`, `index-AhKLQxxr.js` 209.84 kB, gzip 70.56; `index-EuNhL108.css` 28.14 kB). Browser pass on my own ports (8794, 5194, Edge on 9394, inspector 9294), Edge headless; all stopped and the four ports are free.

The browser pass used Lane B's `/api/public-games/overview` from the working tree on my local API. B's report
(`reports/b_public_overview.md`) landed during this pass, so the zoomed-out check left open in
`d_public_overview_map` has now run on B's real route: 18 hexes, signed out and signed in. The 300-track measure
alone used a faked overview, in the page.

## Contract published
none

## Needs from others
- none

## Questions for Johnny
1. Should the read-only card's ship name, border and route line use the lime traffic colour, so the card matches
   the track it opened from? **My recommendation: yes.** A violet card on a lime track looks like two different
   things. The prompt says `--chart-traffic` is "used for nothing else", so I left the card on `--chart-public`.
   The alternative is to keep the card violet.
2. Should the lead ship's name tag come back at rest at the hex zoom? **My recommendation: no.** It is the only
   ship text left on the map, and "no text at rest" is the point of this pass; hovering the chevron shows the
   name and who is aboard. The alternative is to keep the tag as before, for your own lead only.
