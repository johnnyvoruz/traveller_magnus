# Agent C — the plotting readout in real units

Issued 2026-10-06 by the orchestrator. The third motion pass is accepted and pushed; Johnny
judges it live. Your city-light diagnosis is right and is with Johnny as a choice: the port
matches the legacy disc, so nothing changes there until he rules.

## What is wrong

In plotting mode the hairlines carry a readout such as `468.0, 682.0  86.4`. Those are the
picture's own units: they change with the zoom and mean nothing to a referee. You now own
`orbit/distance.ts`, which knows real places.

## Build, in `OrbitRenderer.ts`, `orbit/ships.ts` and `orbit/distance.ts`

1. **From a point on the picture to a real place.** The picture places a body at a radius
   compressed from its `au` (`scaleR` and its kin in `orbit/maths.ts`, as `layoutScene` uses
   them) at its true angle about its star. Give `distance.ts` the inverse for the primary's
   frame: a picture point and the frame's view in, a place in AU from the primary out, or
   null where the picture has no single answer (inside the star's hole, in a line-up layout,
   beyond the scale's range). It must agree with the forward mapping: a test that a world's
   drawn point maps back to its `realPositionAu`, in the orbits layout, log and linear
   scale, at two zooms.
2. **The readout says two things:** how far the pointer is from the primary, in AU; and,
   when a ship is selected, how far the pointer is from that ship in real distance (km under
   a tenth of an AU, AU above: use the formatter Agent D added to `design/units.ts`; read it,
   do not edit it). Where the inverse is null the readout shows nothing rather than a
   picture number. The words are short and in the readout's present place and style.
3. The moons are drawn at exaggerated orbits, so a pointer near a world is "at" that world
   for this purpose: say in the report how close, in pixels, the pointer must be to a body
   to read that body's own real place instead of the inverse of the picture.
4. `plotText` and `PlotReadout` may change shape as this needs; `OrbitCanvas.vue` builds the
   readout from the pointer and the selected ship's mark, and it is not your file: keep
   what it passes today working unchanged, and if you need more from it, say exactly what.

## Check

`npm test` and `npm run check` green, pasted. Frames
`findings/ui_design_shots/k12_readout_{near,far,line_up}.png`. Do not touch `OrbitCanvas.vue`,
`views/`, `ShipStrip.vue`, `estimates.ts`, `design/`, `campaign/`,
`dossier/`, `workspace/`. Stop and report.
