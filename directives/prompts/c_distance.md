# Agent C — the real distance between two bodies, and one tidy-up

Issued 2026-10-06 by the orchestrator. Follow-up 14 (the toggle motion) is accepted and live.

## 1. `apps/web/src/orbit/distance.ts`, new, pure

Agent D's plotting preview must show how far a flight is and how long it takes. The
picture's own units are compressed, so the distance cannot be measured on the picture.

- `realDistanceKm(plan, fromKey, toKey, days): number | null`: the straight-line distance in
  kilometres between two bodies of the plan at that date, from the plan's **real** orbit
  data: the `au` values and the same angles `layoutScene` gives the bodies at `days`
  (`bodyAngle`, the periods and epochs in `orbit/maths.ts`), and `AU_KM` from `layout.ts`.
  Keys are the body keys the picture uses (`s0`, `w3`, `w3m1`).
- `realPositionAu(plan, key, days): { x, y } | null` if that is the natural half of it.
- **Invent nothing.** Where the plan holds no real distance for a kind of body (a moon's
  orbit round its world, a companion star, a belt), return null for it and say in the report
  exactly what is missing and where the engines' output would hold it, if anywhere. Do not
  estimate from the drawn radius.
- The same key twice is 0. An unknown key is null.

`tests/web/orbit_distance.test.js`: two worlds on one star at a date where the angles are
known (opposition and conjunction give the sum and the difference of the two `au`); the same
body; an unknown key; each null case you found. A test that the answer does not change with
the view (zoom, linear scale), because it never reads the picture.

## 2. `OrbitRenderer.keepHeld`

It copies every band, ring and path object on every frame while a layer is on. Hold what the
shrink needs without allocating each frame (the references, if the picture's objects are not
reused; say which is true). The settled frame and the toggle test stay as they are.

## Check

`npm test` and `npm run check` green, pasted. Do not touch `OrbitCanvas.vue`, `views/`,
`ShipStrip.vue`, `ship_list.ts`, `ship_marks.ts`, `campaign/`, `orbit/ships.ts` beyond what
section 1 needs to import. Stop and report.
