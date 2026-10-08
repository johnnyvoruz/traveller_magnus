# Agent B — a provisional ruling on v6's unresolved liquids, in the policy

Issued 2026-10-07 by the orchestrator. Do this after `b_hardening_2.md` is reported. Low
urgency: Johnny wants to move on from this for now, so it is done quietly and brought to
him as one command when it is ready.

## The ruling, and whose it is

Asked the three questions of `findings/v6_open_cases.md` (handoff §197), Johnny said:
*"I want to move on from ice and stuff for now, so just do your best with 1 - 3."* He is
the rules authority and he has delegated these three. The orchestrator's best is below.
It uses **only what is already in `rules/`** (the liquid windows of
`atmosphereExtended.exoticLiquids`, the vacuum list) and **only labels and statuses the
data already has** (`Ice`, `Unknown Exotic Liquid`; `resolved`, `none`, `unknown`). No
liquid, window or number is added. Every one of these is **provisional**, marked so in
the policy, and one edit away from a different answer when he returns to it.

| Open case | Bodies | Becomes |
|---|---|---|
| 1, 4. Ice, atmosphere 0 or 1, mean below Water's melting point | 123,473 | **Ice**, `resolved` (frozen at its mean) |
| 2, 3. Ice, atmosphere 0, mean at or above Water's melting point | 212,363 | **no free liquid**, `none` (a vacuum admits no liquid, and it is not frozen at its mean) |
| 5. Ice, atmosphere 1, mean above Water's boiling point | 16,716 | **no free liquid**, `none` |
| 6, 8. Water, atmosphere 2–9 or 13–15, mean below Water's melting point | 131,957 | **Ice**, `resolved` |
| 7, 9. Water, atmosphere 2–9 or 13–15, mean above Water's boiling point | 40,008 | **no free liquid**, `none` |
| 10, 11, 12. A named liquid on atmosphere 10–12, outside its own window, no listed liquid in range | 58,311 | **Unknown Exotic Liquid**, `unknown` |
| 13. Unknown Exotic Liquid on atmosphere 10–12, no listed liquid in range | 112,091 | **Unknown Exotic Liquid** kept (not cleared), `unknown` |
| 14. No finite mean | 27 | unchanged: unresolved, a data defect (see below) |

The coverage figure is never touched: a body with "no free liquid" keeps the
hydrographics the generator gave it, and `reconciliation.original` keeps what was
stored, as now. If your own counts for these rows differ from the table by a single
body, stop and say so before building.

## Build

1. **The policy (`packages/engines/src/reconcile_environment.js`, `liquidPolicy` /
   `decideLiquid`).** The rows above, as data in the policy and not as branches
   scattered through the function, each carrying `provisional: true` and a `source`
   ("Johnny, 2026-10-07: 'just do your best with 1 - 3'; orchestrator's choice; not from
   the book"). The policy digest changes; say the old and the new.
2. **Tests** for each row at its boundary (a mean one kelvin either side of the melting
   and the boiling point; atmosphere 0, 1, 2, 9, 10, 12, 13, 15), and that nothing
   already resolved in v6 changes: on the nine sectors of your evidence, every body that
   was `resolved` in v6 has the same liquid and status under the new policy.
3. **What it would do to the whole chart**, without building it: from the per-sector
   reports and the trees you can read, the count each row moves, and what is left
   unresolved (expected: the 27, and whatever the blocking 1,247 are). Golden fixtures:
   the engines' parity suite must not move (this is the reconcile transform, not
   generation); say so with the run.
4. **The data defects, looked at, not ruled on:** the 27 bodies with no finite mean, the
   43 with a mean stored as NaN, the 1,247 whose coverage is not a number. For each
   group: what in generation produces it (the function and the input), three examples,
   and whether it is one bug. Findings only, into `findings/v6_data_defects.md`. And
   take the 43,333 empty orbits out of the "no climate word" diagnostic: an empty orbit
   has no climate, and that is not a fault to count.
5. **`directives/plan_engine_corrections.md`:** the provisional rows recorded where the
   policy is described, with the date and his words.

## Not in this step

No derived build, no deploy, no release, no production call. When this and the hardening
are pushed, Johnny starts v7 from the console with one command the orchestrator gives
him, looks at it through the preview from `b_hardening_2.md`, and decides.

## Check

`npm test`, `npm run check`, `npx tsc --noEmit -p apps/api`, pasted. `rules/` is
read-only. `apps/web`, `packages/shared` are not yours. No git. Stop and report.
