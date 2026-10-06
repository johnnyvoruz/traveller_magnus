# Agent D — the visible fixes first (this replaces the order in `d_combined.md`)

Issued 2026-10-06 by the orchestrator. Johnny has now used the live panes signed in and
reports them fine (the campaign list and a record, the Party tab, Campaign pressed in the
orbit view staying in orbit). He is looking at the orbit header and the ship strip and
wants those fixes live first. **If you have already begun `d_combined.md`, finish the item
you are on, then follow this order.** Everything in `d_combined.md` under "What is true now"
still holds; read it.

## Part 1: what Johnny can see. Then stop and report, so it can be pushed.

From `d_orbit_small_fixes.md`, items **1, 2, 3, 5 and 8**:

1. the date readout's right padding (`orbit/HeaderClock.vue`);
2. "No ships here" on one line (`orbit/ShipStrip.vue`);
3. the campaign mark button out of the header, the way back in the Time drawer
   (`HeaderClock.vue`, `TimeControls.vue`, `orbit/commands.ts`, your drawers note);
5. the plot card's title must not wrap inside a name (`ShipStrip.vue`);
8. the reaction-drive line over the assumed hull (`orbit/estimates.ts`, `ShipStrip.vue`).

Johnny's screenshot of today's header and strip is what you are fixing: the readout's text
against its right edge, the calendar-star button beside it, "No ships here" on two lines.

Check for Part 1: `npm test`, `npm run check`, `npm run typecheck`, `npm run build`, pasted;
in the browser, the header at rest and with each drawer open, on and off the campaign date,
signed in and signed out; a scrub across the campaign date with the pointer held; the empty
ship list and the plot card at column, half, full, 520 px and 1,100 px. Screenshots
`fu19_*`. **Report Part 1 on its own** (the brief's format, short), listing every file
touched, and stop.

## Part 2: after Johnny says go on (a second paste will say so)

In this order: item 4 (a mark with `jump` set is not a ship on the picture; Agent A is
adding a `preview` prop to `OrbitCanvas.vue`, so re-read it before each edit and list your
lines); `settleFlight`, pure and unwired (`d_fixes_now.md` section 2); items 6, 7, 9 and 10
(`d_after_panes.md` section 2); and last, what is left of the signed-in pass
(`d_after_panes.md` section 1): Johnny has seen the screens work, so what remains is the
focus after each swap against the design's focus table, the cold loads and Back and Forward
signed in, and the look at each width. Fix what you find and list it.

No git. Stop and report after Part 1.
