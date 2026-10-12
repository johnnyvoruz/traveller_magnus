# Lane C — two small surface faults: a high-tilt world's disc, and a dry world's caption

Issued 2026-10-11 by the orchestrator. You may be a fresh session with no memory. Read
`CLAUDE.md`, `directives/manifesto.md`, `directives/board.md`, `directives/lanes/C.md`,
then this file. No git but read-only, no deploy, no `rules/`, no Traveller rule from
memory. Your second surface-map pass is accepted and goes out in version 1.1.7; the
column figure stays at 379 px.

## 1. A high-tilt world's orbit disc puts its ice in the wrong place (Johnny: yes)

Your ice-cap report: on a world with a large axial tilt (your 85 degree case) the
dossier's hybrid sheet keeps an ice belt on the equator, because that is the cold
place in its temperature model (`surface/hybrid/model.ts`, `Aeff`, `tempAt`), while
the orbit disc's shader still shades by `sinLat²` (`surface/vanilla/gl_shaders.ts`,
`localC`) and keeps the cap on the geographic pole. One world, two pictures.

- Make the disc agree with the sheet: the disc's ice and snow follow the same
  temperature by latitude the sheet uses for that world, including tilt. Say where
  the sheet's rule comes from by file and line, and state nothing about climate that
  is not in that code or in `rules/`.
- Worlds with small tilt must not change by a pixel: show it (the parity script's
  pins for the existing worlds stay as they are; if any moves, stop and report).
- Before and after shots of the disc and the sheet side by side at tilts 0, 23, 45,
  60, 85 and 90 degrees, and the tilt at which the belt takes over from the caps.
- A tidally locked world is a separate rule already; show one to prove it is untouched.

## 2. A dry frozen body is captioned "Water · frozen" (your own finding)

Vech A-IV-a (`/s/Mavuzog/2922/b/w5m0`), hydrographics 0: the caption builder emits
"Surface map · Enhanced · Water · frozen" for its frozen layout, over a grey ice
ball. Find why (`surface/caption.ts` and what it is handed), and make the caption say
what the world's own data says: read the liquid from the world, not from the layout's
name; a body with no surface liquid names none. Cover with a test over a dry frozen
body, a water world, a frozen water world, and an exotic liquid. If the word comes
from the engine's `liquidType` and that is what is wrong, stop and report: that is an
engine matter (the held water-against-ice lines are Johnny's).

## Owned files (this pass)

`apps/web/src/surface/`, `apps/web/src/dossier/SurfaceStage.vue`, `scripts/surface_parity.js`,
your tests in `tests/web/`, shots `kc_tilt_*` and `kc_caption_*`,
`directives/reports/c_disc_tilt_caption.md`. No engine file, no `rules/`.

## Gates

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, pasted. Fourth gate:
`node scripts/surface_parity.js`; the shots; bake time for a disc batch before and
after (not more than 10 percent slower).

## Stop rule

Stop when both pass and the report is written, or at an engine line.

Write `directives/reports/c_disc_tilt_caption.md` from `directives/reports/_TEMPLATE.md`.
Questions for Johnny written out in full, recommended answer first. After each
meaningful step append one line under Progress: "done: X. next: Y."

## Progress
