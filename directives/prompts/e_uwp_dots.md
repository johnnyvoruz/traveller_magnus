# Lane E — no dotted underline in the UWP tiles

Issued 2026-10-15 by the orchestrator. You may be a fresh session with no memory. Read `CLAUDE.md`,
`directives/manifesto.md`, `directives/board.md`, `directives/lanes/E.md`, then this file. No git
but read-only, no deploy, no `rules/`.

## Johnny's words (2026-10-15)

"For the UWP let's get rid of these ... that are in each square, they look horrible." His
screenshot shows the dossier's UWP ribbon: a tile per code (PORT, SIZE, ATM, HYD, POP, GOV, LAW,
TL), each big cyan digit sitting on a dotted underline.

## Cause

`dossier/UwpRibbon.vue` 26 wraps each digit in `CodeNote`. `.doss-note-term` in `dossier/CodeNote.vue`
95 gives every note term `text-decoration: underline dotted`, which marks "hover for a note" in
running text.

## Do

1. **The ribbon's tiles lose the underline.**
   - A tile already reads as a thing to point at, so the note still opens on hover, focus and
     tap, as it does today.
   - Keep the tooltip, the focus ring and `cursor: help`.
   - Do it with a prop or a class that the ribbon passes, for example `bare`, so every other
     `CodeNote` (`StatRows`, `SocioBlock`, `BodyRow`, `StellarLines`, the ribbon's whole-code
     line at 34) keeps its underline.
2. **A gentle hover state on the tile**, so the note is still discoverable: the tile's border
   or background lifts with existing tokens only.
3. **A test** that the ribbon's cells render without the underline class and the others keep it.

## Gates

- `npm test`, `npm run check`, the typecheck and `npm run build`.
- Shots of a world's dossier with the ribbon at 1600 and 390, at rest and with one tile
  hovered: `findings/ui_design_shots/kb27_uwp_*`.

## Report

Write `directives/reports/e_uwp_dots.md` from the template.

**Owned:** `apps/web/src/dossier/UwpRibbon.vue`, `apps/web/src/dossier/CodeNote.vue`, tests under
`tests/web/`, your shots and your report.

After each meaningful step, append one line under Progress: "done: X. next: Y."

## Progress
done: bare prop on CodeNote and cell hover on the ribbon. next: render test, then gates.
done: tests/web/uwp_dots.test.js green (tiles have no underline class; the plain line and a stat row keep it). next: npm test, check, typecheck, build, then shots.
done: npm test 1774 pass, 0 fail; check clean; typecheck clean; build clean (vue-tsc included). next: dossier shots at 1600 and 390.
done: Regina world dossier shots, ribbon in frame, rest and hover, at 1600 and 390. next: the report.
