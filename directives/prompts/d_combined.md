# Agent D — the answer to your question, and one combined step

Issued 2026-10-06 by the orchestrator. You were right to stop: `d_fixes_now.md` was never
handed to you. The orchestrator's ruling on the order (Johnny may overrule): **your option
(b), both in this session, one combined report, with the signed-in pass moved to the
front**, because the panes are already live and nobody has seen them signed in.

Both prompt files stay the source for the detail. This file sets the order and corrects
what has gone stale in them.

## What is true now

- Agent A's panes are **pushed and live** (`1168503`). The restriction in `d_fixes_now.md`
  on `views/`, `App.vue`, `router.ts`, `shell/`, `components/OmniBox.vue` and the address
  lines of `workspace/` is **lifted**: those are yours and A's again. Every address you
  push goes through `shell/pane.ts` (`atPane`, `withQuery`).
- **Agent E** is in `dossier/`, `orbit/card.ts` and `orbit/BodyCard.vue`: still closed to you.
- **Agent A** is now drawing the ghosts in `orbit/OrbitRenderer.ts`, `orbit/ships.ts` and
  `orbit/distance.ts`, and is adding one `preview` prop to `orbit/OrbitCanvas.vue`. Your
  fix 4 also edits `OrbitCanvas.vue` (`shipStatus`, the plotting "from"): **re-read that
  file immediately before each edit, change only those lines, and list them.**
- **Agent C** is in `surface/`. Enhanced is becoming the default look.

## The order

1. **The signed-in pass over the panes**: `d_after_panes.md` section 1, all of it. Fix what
   is broken in your files and the panes files; list each fix. If something is badly wrong
   (the campaign list, a record or the Party tab does not open, or loses data), **stop and
   report at once** instead of going on: it is live.
2. **The six fixes and the settling sum**: `d_fixes_now.md` sections 1 and 2 (items 1, 2,
   3, 4, 5, 8 of `d_orbit_small_fixes.md`, and `settleFlight`, pure and unwired).
3. **The four that were waiting**: `d_after_panes.md` section 2 (items 6, 7, 9, 10).

The ghosts' wiring is not in this step.

## Check and report

The checks of both files. Screenshots `fu17_*` for the panes, `fu19_*` for step 2 and
`fu19b_*` for step 3. One report in the brief's format, with a "Built and measured" row for
every item above (the pass, ten fixes, `settleFlight`), the manifesto checklist once, and
every line you changed in `OrbitCanvas.vue`. No git. Stop and report.
