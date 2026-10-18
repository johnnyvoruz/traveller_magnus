# Lane E — make the manifesto checker see colour literals in scripts

Issued 2026-10-11 by the orchestrator. **Start only after the board says the Builder
push is made.** You may be a fresh session with no memory. Read `CLAUDE.md`,
`directives/manifesto.md`, `directives/board.md`, `directives/lanes/E.md`, then this
file. No git but read-only, no deploy, no `rules/`, no Traveller rule from memory. Your
`@` mention report is accepted.

## Goal

The manifesto says no colour outside `apps/web/src/design/tokens.css`, and
`npm run check` is meant to enforce it. Your predecessor's audit
(`findings/checker_colour_audit.md`) found the checker does not look at colour literals
in `.ts` and `.js` files, listed 145 of them, and wrote a patch for the checker under
"Patch, not applied". Since then Lane C moved its 19 (`surface/`,
`dossier/SurfaceStage.vue`) and Lane A moved its 9 (`orbit/system.ts`) to tokens. The
117 in `packages/generation/src` are published chart colours (regions, routes,
territories): data, to be allowlisted, not moved. Apply the patch so a new literal
fails the check.

## Owned files (this pass)

- `scripts/check_manifesto.js`: the audit's patch, adjusted only where the file has
  moved since
- `scripts/check_allowlist.json`: entries for the generation files, each with the
  reason "published chart colour tables", and for whatever the audit's section "Data
  that must stay literals" names (for example the Vanilla palette in
  `surface/map_palette.ts`), each with its reason
- a test for the checker if one exists beside it (look in `tests/`); else none
- `directives/reports/e_checker_colours.md`

You edit **no product file**. If, with the patch applied, the checker reports a literal
that is neither on the audit's allowlist plan nor data, do not fix it and do not
allowlist it: list it in the report with file, line and the lane that owns the folder
(`directives/lanes/*.md`).

## Steps

1. Run `npm run check` as found; paste the result.
2. Apply the patch. Run the check with an empty allowlist addition first and paste the
   count per folder, so the report shows what the checker now sees.
3. Add the allowlist entries the audit names. Run again.
4. Prove it bites: in a scratch copy of one file outside the repository tree, or by a
   unit test of the checker's matcher, show that a new `#rrggbb` and a new `rgb(…)` in
   a script are reported. Do not leave a deliberate violation in the tree.

## Gates

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, pasted. Fourth gate:
the per-folder counts before the allowlist, and the final check output. The final
check must be clean, or else every remaining line is in your report with its owner.

## Stop rule

Stop when the check is clean with the allowlist, or when the only things left are
other lanes' literals, listed. Never widen the allowlist to make the check pass.

Write `directives/reports/e_checker_colours.md` from `directives/reports/_TEMPLATE.md`.
Questions for Johnny written out in full, recommended answer first. After each
meaningful step append one line under Progress: "done: X. next: Y."

## Progress

done: npm run check before the patch: manifesto: clean. next: apply the patch and count hits with no new allowlist.
done: patch applied. Before the allowlist, 3 colour literals, all in packages/generation/src (regions, route_colours, territories). next: allowlist those three and prove a new literal fails.
done: those three allowlisted; a scratch hex and rgb() both fail; the tree check is clean. next: the report.
