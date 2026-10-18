# Agent C — the surface map's colour literals, before the push

Issued 2026-10-10 by the orchestrator, for after your warm-open report. Common rules:
`directives/swarm_restart.md`.

Agent E's audit (`findings/checker_colour_audit.md`) lists the colour literals the
manifesto checker cannot see. **17 are in `apps/web/src/surface/` and 2 in
`apps/web/src/dossier/SurfaceStage.vue`**, among them `hybrid/daynight_layer.ts` and
`hybrid/symbols.ts`: new code of this work, about to be pushed. The rule is no colour
outside `tokens.css`.

1. Read the audit's lines for `surface/` and `SurfaceStage.vue`. Move every one that is
   a design colour to a token, read the way `iconPaint()` reads `--icon-*`. Reuse a
   token where the colour is the same; name new ones by what they paint.
2. What the audit marks as data stays as it is (the Vanilla palette in
   `map_palette.ts` is channel numbers pinned by `tests/web/surface_map.test.js`): do not
   touch it, and confirm the Vanilla checksums and `scripts/surface_parity.js` are
   unchanged.
3. A colour computed per pixel (a gradient stop, a LUT) may read its end colours from
   tokens once, when the layer is built, never per frame: show that the terminator
   frame cost has not moved.
4. Add the files and the token lines to `findings/push/hybrid_surface_files.txt` and
   `hybrid_surface_notes.md` if they are not there.

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`,
`scripts/surface_parity.js`, pasted; one before and after shot of a day/night map and a
Symbols map to show nothing changed colour. No git, no deploy. Stop and report.

## File bus (added 2026-10-10, replaces "report in chat")

Lane rules: `directives/lanes/C.md`. Nothing is pasted to Johnny any more.
`design/tokens.css` is not in your lane's folders: this prompt allows new token lines there and nothing else; list each one.
When finished or blocked, write `directives/reports/c_hybrid_colours.md` from
`directives/reports/_TEMPLATE.md` (status, every changed file with one line each
including files outside your lane, the four gates, contract, needs, questions written
out in full with your recommended answer first), then stop. After each meaningful step
append one line under Progress below: "done: X. next: Y."

## Progress
done: warm-open report is on the bus. next: move the 19 audit colours in surface/ and SurfaceStage.vue onto tokens, read once per layer.
done: the 19 colours are tokens, read once per layer; after shots show the day/night map and the Symbols map; gates passed, including surface_parity.js exit 0. next: report filed, stop.
