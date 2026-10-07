# Agent A — a ship's route on the picture, and the means to edit it

Issued 2026-10-06 by the orchestrator. Vessels on the sector map, `pointWords`, the readout's
placement and the `shipTags` switch are **accepted and pushed** (`d4bb7e8`).

## Why

Johnny, using the live waypoints: *"when I click on the vessel to select it, I want to see
its pathing and be able to edit it. Think basic RTS controls."* And: *"I want to be able to
click and drag to move waypoints that have been placed."*

Today the picture draws a course only while it is being plotted (the `preview`). Once
"Add course" has written the legs, the route disappears: a selected ship shows no path, and
a stored leg cannot be changed, only removed from the end. Agent D builds the controls
(`d_nav_console.md`); the data and the picture are yours.

## Build

1. **`campaign/track.ts`: `replaceLegsFrom(recordId, index, legs, notBefore)`.** Replaces
   the track from leg `index` to its end with `legs` (which may be empty: the tail is
   removed), in one commit, with the same validation as `appendLeg` (each leg a `TrackLeg`,
   the whole track in time order, the 500-leg limit). **A leg that has already departed at
   `notBefore` is history and is refused**, with a plain message; so is an `index` past the
   end. `appendLeg` and `removeLastLeg` stay. Tests: replace the tail, replace with nothing,
   move one waypoint (the legs after it re-dated by the caller), each refusal.
2. **The route in the picture (`orbit/OrbitRenderer.ts`, `orbit/ships.ts`).** A new optional
   `route` on the draw state, beside `preview`: the selected ship's stored legs from the
   frame's date on (the leg under way, then those to come), as the course preview takes
   them. The renderer draws it as **the committed course**: the same line through numbered
   waypoints, each body at its own arrival, a target at a point, but in a settled style
   that reads as "this is the plan" beside the preview's dashed "this is being changed"
   (say what differs: solid against dashed, weight, alpha; tokens only). When a `preview`
   is also given, the preview is drawn over the route from the waypoint where they part.
   The leg under way shows what is left of it, from the ship to its end. No route, no
   change to the settled frame.
3. **Waypoints you can pick up, as pure functions in `orbit/ships.ts`:**
   `waypointAt(course, point)`: which waypoint of a drawn course (route or preview) is
   under a picture point, with the body snap (`BODY_SNAP_PX`), and null on the ship itself;
   and whatever D needs to know where each waypoint was drawn on this frame, so a drag
   starts from the right place. While D feeds a preview whose waypoint is being dragged,
   the picture simply follows it; nothing new for the drag itself.
4. **`OrbitCanvas.vue`:** the `route` prop and its hand-off, and nothing else in that file
   (Agent D is in it; re-read before each edit and list your lines).
5. **The stand-in** (`?campaignStandIn=`) gives its Surveyor a stored three-leg route, so
   the committed style and `waypointAt` can be seen before D's controls exist.

## Check

`npm test`, `npm run check`, `npm run typecheck`, `npm run build` green, pasted. Frames
`k30_route_{selected,with_preview,under_way}.png` at Regina. No frame over 50 ms with a
route and a preview drawn together. Do not touch `ShipStrip.vue`, `ShipTags.vue`,
`course.ts`, `ship_marks.ts`, `views/`, `workspace/`, `surface/`, `dossier/`. Agent C is in
the ring code of `OrbitRenderer.ts` (the day/night sweep): leave those lines. Stop your dev
server. No git. Stop and report.
