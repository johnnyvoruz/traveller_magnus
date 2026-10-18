# Lane C — where does an own sector sit? (Hollow Verge, 15 hexes)

Issued 2026-10-17 by the orchestrator. You may be a fresh session with no memory. Read `CLAUDE.md`,
`directives/manifesto.md`, `directives/board.md`, `directives/lanes/C.md`, then this file. No git but
read-only, no deploy, no `rules/`. **This is an investigation first. Change no product file unless
step 4 says so.**

## The note (Lane Z, 2026-10-15, `reports/done/z_package_covers.md`)
For the Hollow Verge cover, Z computed where its six systems sit on the map from the own sector's
slot (`~` keys) and found the map draws that own sector about **15 hexes** from Z's result. One of the
two is wrong: the map, or Z's arithmetic.

## Do
1. Find every place that turns an own-sector slot or `~` key into chart position: the map renderer,
   the Build pane, the package placement (`package_place.ts`), the example tools
   (`tools/examples/`), the cover shot scripts. List each with file and line.
2. Work the Hollow Verge case by hand through each: its slot, its six hexes, the world position each
   path gives. Put the numbers in a table.
3. Say which path is the odd one out and why (an off-by-one in columns, a sector width of 32 vs 40
   rows, a half-hex column offset, a different origin).
4. **Fix only if the wrong one is in a file you own** (`apps/web/src/surface/`, `dossier/SurfaceStage.vue`)
   **or is a tool or script under `tools/examples/` or `findings/`.** If it is in the map, the Build pane
   or `package_place.ts`, write the fix as a diff in your report and stop: the orchestrator gives it
   to the owner. If production data placed with the wrong arithmetic (an installed package, a cover),
   say which.

## Gates
`npm test` and `npm run check` (unchanged if you changed nothing).

## Report
Write `directives/reports/c_own_sector_offset.md` from the template, with the table.

**Owned:** read-only everywhere; writes only as step 4 allows; your notes under `findings/`; your report.

After each meaningful step, append one line under Progress: "done: X. next: Y."

## Progress
done: listed every slot-to-chart path. next: the Hollow Verge numbers.
done: Hollow Verge at slot -8,-5; the six hexes sit 15.33 columns left of the sector centre. The chart formula agrees with itself. next: the report.
done: report written at directives/reports/c_own_sector_offset.md. next: nothing.
