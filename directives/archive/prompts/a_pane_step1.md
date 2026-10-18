# Agent A — panes swap, step 1: the pure address helper

Issued 2026-10-06 by the orchestrator. `campaign/travel.ts` is accepted as built.

This is step 1 of your own design, `findings/panes_swap_design.md` (accepted: shape A, the
`panel` query). Read its sections 1, 3, 5 and 6 again; build step 1 exactly as section 5
says and pin exactly what section 6 lists. Nothing else changes in this step: the router is
not touched, the views are not touched, old addresses behave as they do now.

1. `apps/web/src/shell/pane.ts`, pure, runs under Node with type stripping:
   - `paneOf(path, query)`: the view and the pane an address names, by the pane table of
     section 1 (absent `panel` is the dossier on a hex or orbit path and shut elsewhere;
     `closed`; `campaign` with an optional decoded `record`; `party`; anything else as
     absent; `panel=dossier` reported as the dossier).
   - `withQuery(query, changes)`: the one writer of the query. It sets what it is given and
     keeps `panel`, `record`, `x`, `y`, `z`, `date`, `time` and `campaignStandIn`.
   - `campaignRedirect(path, query)`: the three old `/campaign` paths onto `/` with the
     query of section 3, and the strip of `panel=dossier`.
   - `focusTarget(previous, next)`: the focus table of section 2; no previous pane is
     "leave focus".
2. `tests/web/pane.test.js`: every bullet of your section 6.

`npm test`, `npm run check` and `npm run build` green, pasted.

Do not touch `router.ts`, `App.vue`, `views/`, `workspace/`, `orbit/`, `components/` (Agent D
is mid-step there), `campaign/` or `packages/`. Stop and report.
