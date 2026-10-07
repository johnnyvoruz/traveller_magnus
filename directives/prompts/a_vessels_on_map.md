# Agent A — every vessel on the sector map

Issued 2026-10-06 by the orchestrator. **Do this after `a_course_preview.md` is reported.**
Places in open space are accepted and pushed (the anchor's `point`, places as
body-or-point, `pictureOfAu`, `pointWords`, ships beside their body, the stand-in).

## First, two small things from Agent D's use of your points

- **`pointWords` names a body always.** Within 0.05 AU it says "near A-II"; further out it
  gives only the distance from the primary, and "Holding at 26.9 AU" does not tell a
  referee where the ship is. Beyond the near distance, add the nearest body and how far it
  is ("26.9 AU · 3.1 AU from A-X", in the readout's number form). Still no invented names;
  a system with no bodies keeps the bare distance. Tests for near, far and none.
- **The hairline readout and a ship's name.** In `findings/ui_design_shots/
  k21_wired_point.png` the readout is drawn through the selected ship's name when the
  pointer is near the ship. Keep the readout clear of the marks' names (move it to the
  pointer's other side when it would collide). A test of the placement rule.

## Why

Johnny: *"I want to see it on the map."* Asked whether that includes the sector map, he said
yes. Today the hex map's campaign layer draws one mark: the party's. A campaign's other
vessels are not there.

## Build

1. **Where each vessel is, at the campaign date:** your `placeAt` already answers (its
   track at the date, else its anchor; a ship on a flight is in that system; a ship in jump
   is at no hex). One pure function, tested, that turns the campaign's live vessels and the
   campaign date into the marks the map needs: for each vessel its id, name, hex key, and
   whether it is the party's ship; a vessel in jump carries the system it left and an
   "in jump" state, as the party's marker does today (read `workspace/party_where.ts`,
   Agent D's, for the rule and the words; do not edit it; if the two would disagree, say
   so). Vessels with no place are left out.
2. **Drawing (`apps/web/src/map/campaign_layer.ts`).** Each vessel is a mark at its hex in
   the layer's own style, quieter than the party's, which stays the one the eye goes to.
   Several at one hex sit side by side or stack without overlapping, in a fixed order, with
   a count when there are more than the hex can show (say the number). Names at the zoom
   tiers where the party's name shows; none where it does not. Tokens only; the reduced
   motion rule the layer already follows.
3. **Feeding it (`views/MapView.vue`, `snapshotFromStore` and the snapshot's type only).**
   The snapshot carries the vessels beside the party. Agent D may be in that file: re-read
   it before each edit and list your lines. A press on a vessel's mark opens that vessel's
   record in the campaign pane, through `shell/pane.ts`, as the party's mark opens the
   Party tab.
4. Signed out, or with no campaign: nothing new is drawn.

## Check

Tests: the pure function at four dates of a track (before departure, in flight, in jump,
arrived) and for a vessel with no track; two and five vessels at one hex; the layer's draw
test extended. `npm test`, `npm run check`, `npm run typecheck`, `npm run build` green,
pasted. In a browser on the real chart, signed in to a local campaign with at least three
vessels in two systems: frames `fu27_map_vessels_{sector,subsector,system}.png`, one with
a vessel in jump, and a press on a mark. No frame over 50 ms while panning with the layer
drawn. Stop your dev server. No git. Stop and report.

## Not yours

`orbit/`, `workspace/` (read only), `dossier/`, `surface/`, `apps/api`, `packages/`.
