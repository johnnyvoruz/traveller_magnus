# Lane C — the ice caps, second look

Issued 2026-10-12 by the orchestrator. You may be a fresh session with no memory. Read
`CLAUDE.md`, `directives/manifesto.md`, `directives/board.md`, `directives/lanes/C.md`,
then this file. No git but read-only, no deploy, no `rules/`, no Traveller rule from
memory. Your city-lights and tilt warm-up report is accepted and goes out in version
1.1.9.

## What Johnny said

2026-10-11, before your first pass: "anything with an icecap on it looks like it's got
nearly a perfect circle on the top, we need something to sorta nibble at the edges at
least a little more... or that the oceans would cut into it." After your first pass
(`reports/done/c_ice_caps.md`, in 1.1.4): "They look good enough for now, we will
want to come back to it later." 2026-10-12: come back to it now.

## Do

1. **Look first, and say what is still wrong.** On the live page
   (https://traveller.voyage, Chrome with WebGL; the sector in a URL is
   `Spinward_Marches`) take the orbit disc and the dossier map of six worlds with
   caps: a water world, a world of continents, a mostly dry world with small seas, a
   cold world with large caps, a small-cap warm world, and one with a tilt between 20
   and 45 degrees. Shots `kc_ice2_before_*`, pole-on where the view allows and at the
   usual three-quarter view. Write, plainly, what still reads as a drawn circle:
   the edge's shape, its width, one noise scale showing as a regular scallop, the
   same edge on sea and on land, a hard colour step, no broken ice beyond the edge,
   the two poles being twins. Read your first pass's code and say what it does today,
   with lines.
2. **Then build toward this, in order of what the shots say matters most:**
   - the cap's edge follows the surface: it reaches further over land and high
     ground, and the sea cuts into it (bays of open water, a ragged shelf), using the
     height and sea the bake already has;
   - more than one scale of raggedness, so no regular scallop shows at any zoom;
   - a broken margin: loose patches and leads beyond the solid edge, thinning out;
   - a soft step in colour and brightness from old ice to thin ice to water or
     ground, not one line;
   - the two poles differ on the same world;
   - the disc and the dossier map still agree with each other on where the ice is
     (they share the temperature rule; a raggedness one has and the other lacks is a
     fault).
3. **What must not change:** how much ice a world has. The cap's mean latitude and
   area come from the world's data through the existing rule; the raggedness moves
   the edge around that line and adds none and removes none on average. Show the ice
   area before and after for the six worlds (within 2 percent). A world with no cap
   gains none; a frozen world stays whole; a tidally locked world and the high-tilt
   belt keep their own rules: show one of each unchanged or improved in the same way.
4. **Cost:** bake time for a disc batch and the sheet's draw time before and after,
   not more than 10 percent slower warmed; no new first-use stall (your last pass
   found one: check for it).
5. Pins: `node scripts/surface_parity.js`. Pins that hold ice will move; list each
   with its before and after and re-pin only those, saying so. A cache version moves
   if stored pictures would be stale.
6. After shots `kc_ice2_after_*`, the same worlds and views, and one sheet of
   before-and-after pairs side by side that Johnny can judge at a glance.

## Owned files (this pass)

`apps/web/src/surface/`, `apps/web/src/dossier/SurfaceStage.vue`,
`scripts/surface_parity.js`, your tests in `tests/web/`, shots `kc_ice2_*`,
`directives/reports/c_ice_caps_2.md`. No engine file, no `rules/`.

## Gates

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, pasted. Fourth gate:
the parity script, the area table, the timings, the shots.

## Stop rule

Stop when the gates pass and the report is written. If the look wants a rule about
where ice forms that the code and `rules/` do not hold, write the question and stop
that part.

Write `directives/reports/c_ice_caps_2.md` from `directives/reports/_TEMPLATE.md`.
Questions for Johnny written out in full, recommended answer first. After each
meaningful step append one line under Progress: "done: X. next: Y."

## Progress

done: the prompt is read. next: look at live caps and the first pass before any change.
done: the six dossier maps and the mainworld discs are shot. next: break the scallop, soften the step, and keep the ice area.
done: the after shots are in. next: parity, timings, and the gates.
done: the six dossier maps and the mainworld discs are shot. next: break the scallop, soften the step, and keep the ice area.


