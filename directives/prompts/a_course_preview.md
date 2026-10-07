# Agent A — a course of several waypoints in the picture

Issued 2026-10-06 by the orchestrator. Places in open space are **accepted and pushed**.
**Do this first**; `a_vessels_on_map.md` follows it (Agent D's waypoint controls wait on
this, and plotting is what Johnny is working with now).

## Why

Johnny, on course plotting: *"we would want to support in-system waypoints … Think Homeworld
RTS where the user can control units and set waypoints, click play, speed up or down time
and watch the ship signal fly to the location. If a ship is docked on a planet, I want a
sci-fi tag to pop out to indicate the ship is on the planet and the user can click on the
tag to select the ship."*

Agent D builds the controls (the waypoint list, the tag, selecting a ship). The picture is
yours: `orbit/OrbitRenderer.ts`, `orbit/ships.ts`, `orbit/distance.ts`, their tests, and
your lines in `orbit/OrbitCanvas.vue`.

## Build

1. **The preview takes a course.** Today `preview` is one leg (`{ toKey, departs, arrives,
   tag? }`). It becomes an ordered list of legs, each with its own end (a body key or a
   point), departure and arrival; the one-leg form keeps working, so nothing of D's breaks
   before D moves to the list. The renderer draws the whole course: a line through the
   waypoints in order, from the ship; at a body waypoint, that body's ghost at **that
   leg's** arrival (a body visited later is drawn where it will be then); at a point
   waypoint, the target; each waypoint numbered in the tag's style; the last one carrying
   the arrival tag. The other worlds' ghosts follow the design's option 1 at the course's
   final arrival. Motion as the ghosts': a waypoint added fades in over `--t-base`; one
   removed leaves over `--t-fast`; nothing on first paint; none under reduced motion.
2. **Hit-testing for D, as pure functions in `orbit/ships.ts`:** given the frame's marks and
   a picture point, which ship (if any) is under it, with the same slop the bodies use; and
   **where a docked ship is drawn beside its body** (the rule you built: down and to the
   right, clear of the disc and the name, further ships stepping along the diagonal), given
   the body's place, its drawn radius and the ship's index there. D places its tag from
   that function, so the tag and the picture can never disagree. Do not draw the tag.
3. **A switch D can use:** when D's tag stands for a docked ship, the renderer must not also
   draw that ship's designator. One optional flag on what the canvas hands the renderer
   (name it), default off, so today's picture is unchanged until D sets it.
4. The stand-in shows a three-leg course (body, point, body) and two ships docked at one
   body, so D can build against it.

## Check

Tests: a three-leg course's waypoints and ghosts at their own arrival dates; the one-leg
form unchanged; the hit test at, near and off a mark; the docked places for one, two and
four ships; the settled frame with no preview and no ships unchanged. `npm test`,
`npm run check`, `npm run build` green, pasted. Frames `k28_course_{two,three}_legs.png`,
`k28_course_point_then_body.png`. No frame over 50 ms with a four-leg course at Regina.
Your lines in `OrbitCanvas.vue` listed (Agent D is in that file). Stop your dev server.
No git. Stop and report.
