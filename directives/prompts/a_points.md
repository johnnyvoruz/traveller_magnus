# Agent A — a place in open space: ships that are not on a planet

Issued 2026-10-06 by the orchestrator. Do this after `a_ghosts.md` is reported.

## Why

Johnny, using the live ship MVP: *"right now we can only attach a ship to a planet, I want to
see it on the map and I want to plot points in-system and watch it fly around."*

Today a place is a system, or a body in it. A leg can only end on a body, so a ship is
always sitting on a planet's disc, a jump has to "cut" a flight, and nothing can be plotted
to empty space. This step makes **a point in a system a place**: data, geometry and
drawing. Agent D adds the plotting click and the words afterwards.

## Build

1. **The anchor (`packages/shared/src/schemas/campaign.ts`).** A system anchor gains an
   optional `point: { x, y }`: a position in astronomical units from the system's primary,
   in the system's own frame (the frame `realPositionAu` answers in). Finite numbers; a
   generous bound on magnitude as a sanity limit (name it, with its reason). A point and a
   `bodyKey` are not given together: a point is not a body. `locationLabel` carries its
   words as it does for a body. Everything that already accepts an anchor (a record's
   anchor, a party's, a track leg's two ends) accepts it with no other change. Tests for
   the schema; the existing tests untouched and green. Say in your report what the Worker
   does with it (it validates with the same shared schema; if any server code reads
   `bodyKey` in a way a point breaks, list it and do not edit `apps/api`).
2. **Where things are (`campaign/place.ts`, `campaign/track.ts`).** A record at a point is
   in that system, at no body. Check `placeAt`, `whereAreWe` and the index give that
   without change, and add the tests.
3. **Geometry (`orbit/distance.ts`).** A "place" is a body key or a point.
   `realDistanceKmBetween` and its kin take either end as either kind (a point's real
   place is itself, at any date). The forward mapping from a real point to the picture,
   beside the inverse Agent C wrote for the readout: the two round-trip (a test: picture
   → AU → picture, in the orbits layout, log and linear scale, two zooms). A helper that
   words a point for a label, from the plan and the point alone: its distance from the
   primary in AU, and the nearest body if one is close (say how close); no invented names.
4. **Drawing (`orbit/ships.ts`, `OrbitRenderer.ts`).** `placeShips` places a ship whose
   anchor is a point at that point on the picture, and a flight to or from a point on the
   straight line you built for the ghosts (a point does not move, so it needs no ghost; the
   preview draws a small target at it instead, in the destination's style). The mapping
   needs the frame's view: `OrbitCanvas.vue` hands it over; **your lines there are the
   `preview` prop and this hand-off, nothing else**; list them. A jump that leaves from a
   point swells its bubble at the point.
5. **A ship at a body can be seen.** Today a docked ship's designator is drawn on the
   body's own centre, over its disc. Draw it **beside** the body (clear of the disc and its
   label; several ships at one body fan out in a fixed order and never overlap), with the
   same rule for a ship in orbit there. The settled frame with no ships is unchanged. Say
   the rule in one sentence.
6. **The stand-in** (`?campaignStandIn=`, dev only) gains a ship that flies body → point →
   body and holds at the point between, so all of this can be seen before D's click exists.

## Not yours in this step

`orbit/ShipStrip.vue`, `ship_list.ts`, `ship_marks.ts`, `estimates.ts`, `views/`,
`workspace/` (Agent D's: the click in plotting mode, the card's words, the strip's status
for a ship at a point, and the 100D test for one, come in D's next prompt; if
`ship_marks.ts` `bodiesAtOf` stands in your way, do not edit it: say exactly what it must
become). `surface/` (Agent C), `dossier/` (Agent E), `apps/api` (Agent B).

## Check

`npm test`, `npm run check`, `npm run typecheck`, `npm run build` green, pasted. In a
browser with the stand-in: frames `k22_point_{held,flight_early,flight_late}.png`,
`k22_docked_beside.png` with two ships at one body, and the jump bubble at a point. No
frame over 50 ms at Regina. Stop your dev server. No git. Stop and report.
