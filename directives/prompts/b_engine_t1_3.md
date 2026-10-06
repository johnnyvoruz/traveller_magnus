# Agent B — engine corrections T1.3: liquids

Issued 2026-10-06 by the orchestrator. T1.2 (`reconcile_environment.js`) is accepted as built.

Read `directives/plan_engine_corrections.md` sections 3.3 and 3.4, and section 4 questions
Q2 and Q3 in full. **Johnny answered both "yes, as recommended"** (`questions_for_johnny.md`
F3 and F4, 2026-10-04): Q2 pick (a), Q3 pick (a). Those two picks, exactly as the plan words
them, are the policy; nothing else in section 4 is built in this step.

Extend the reconciliation so that `reconcileTree` also reconciles each body's liquid:

1. The policy gains the two answers as data (Q2: the highest-abundance eligible row, ties in
   table order, a valid original kept first; Q3: identity by the mean temperature, phase
   notes from low and high, table limits inclusive) and its version string changes with them.
2. Validate `hydroPercent` first, as section 3.3 says: explicit zero is no liquid; a missing
   or invalid percentage is unknown with a blocking diagnostic, never zero.
3. Every row of the outcomes table in section 3.3, one branch each, nothing more. Keep the
   existing atmosphere 10 to 12 exotic-candidate restriction, water and ice for the ordinary
   path, and the no-liquid-in-vacuum safeguard, as Q3 says. An impossible ordinary world is
   **unresolved**, never converted to an exotic. Magma is not a fallback.
4. Substances, abundances and their melting and boiling points come from the generated rules
   module only (`exoticLiquids` in `mgt2e_data`). No number of them in code. No pressure
   correction.
5. The write allowlist grows by exactly the liquid fields section 3.1 names (the reconciled
   `liquidType` and the explicit liquid and phase status); the original string is kept once
   in `reconciliation.original`. Idempotent as before. `hydro`, `hydroCode`, `hydroPercent`,
   the temperatures and everything else stay byte-identical.

Tests (`tests/generation/reconcile_environment.test.js`, extended): each row of the 3.3
table; a valid old liquid unchanged; zero coverage; a missing percentage; the limits read
from the rules module, at and either side; idempotence; the Regina and Zeycude fixtures.
Then run T1.1's audit (`tests/generation/environment_audit.js`) over the Spinward Marches
before and after `reconcileTree`, and report the counts: bodies whose liquid changed, by
outcome row; bodies left unresolved; diagnostics by kind. Change no tree on disk.

`npm test` and `npm run check` green, pasted; the golden parity tests untouched and green.

Where the plan, the rules data and the engine's own liquid code disagree, or a case fits no
row of the table, stop and write the question in plain words; do not pick. Do not touch
`rules/`, `js/`, `apps/` or any copied engine. Stop and report.
