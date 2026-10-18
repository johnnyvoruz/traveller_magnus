# Agent B — engine corrections T1.2: the reconciliation module and the climate classifier

Issued 2026-10-06 by the orchestrator. The engine corrections restart: Johnny answered F2.

Read `directives/plan_engine_corrections.md` sections 0, 1, 3.1, 3.2, 3.4 and 7.1, and
`directives/handoff.md` section 65 only (T1.1 is done: `tests/generation/environment_audit.js`
and the fixtures in `tests/golden/fixtures/engine_corrections/`). You take T1.2; the plan
names Agent A, who is on the router.

The climate table is `rules/mgt2e_climate_bands.json`. **If that file is absent, stop and
say so.** Run `npm run rules:gen`. It holds five bands in Celsius; each runs up to and
including its `maxC`; the last has no upper limit. Johnny calls it provisional and will edit
it, so nothing about its numbers may be written in code or in a test's expectations except
by reading the file.

1. `packages/engines/src/reconcile_environment.js`: a pure `reconcileTree(tree, policy)`
   returning `{ tree, changes, diagnostics }`. No RNG, no clock, the input never mutated.
   A new file; no copied engine is edited.
2. The policy: a frozen object made from the generated rules module (the limits in kelvin,
   C + 273.15) with a version string.
3. `surfaceTempBand` from a valid final `meanTempK` only. Missing or non-finite is an
   explicit unknown status. No default temperature.
4. `orbitalTempBand` reconstructed as section 3.2 says, provenance "reconstructed"; unknown
   with a diagnostic when the inputs are missing. `tempBand` stays as the legacy alias.
5. The original values kept once in provenance; a second run changes no bytes. Only the
   section 3.1 allowlist is written. Liquids are T1.3, not this step.

Tests: just below, at and just above each limit, the limits read from the file; idempotence;
the input unchanged; the Regina and Zeycude fixtures; every field off the allowlist
byte-identical. `npm test` and `npm run check` green, pasted; the golden parity tests
untouched and green.

If the plan and the code disagree, or a rule is missing, stop and ask; do not improvise.
Do not touch `rules/`, `js/`, `apps/` or any copied engine. Stop and report.
