# Agent B — engine corrections T1.4: the generation hook, off unless asked for

Issued 2026-10-06 by the orchestrator. T1.3a is accepted as built (8,066 Marches bodies
validated, 1,274 left alone, 2 blocking; the audit rows as in your T1.3 report).

Read `directives/plan_engine_corrections.md` sections 3.1 (the last paragraph of 3.4 too),
7.1 ("Tier 1 proof") and 7.2 in full before you start. Section 7.2 is the rule for every
existing test in this step.

## What T1.4 is

The same `reconcileTree` must be reachable as the **last step of generation**, so that a
future build or the Builder can produce reconciled trees directly, and so that the derived
build of T1.6 and fresh generation are proven to give the same bodies. **Nothing that
generates today may change its output in this step.**

## Build

1. `packages/generation/src/index.ts`, `generateHex`: one new optional input, a
   reconciliation policy (the `environmentPolicy` shape of
   `packages/engines/src/reconcile_environment.js`). **Absent, `generateHex` returns
   byte-for-byte what it returns today.** Present, it returns
   `reconcileTree(<today's result>, policy).tree`, applied after everything else
   `generateHex` does, so no later write can undo it; the changes and diagnostics are
   returned beside the tree in whatever way fits the function's present return (say how).
   `buildSector` and `buildSectorSlice` pass the option through, also absent by default.
2. No caller is switched on: not the truth build, not `tools/truth`, not the Worker. Turning
   it on for a build is a later step that needs Johnny's word.
3. **Schema support.** Find every schema or type that a generated tree's bodies pass
   through on the way to a truth object or to the browser (`packages/shared/src/schemas/`,
   the truth files, the API envelopes). If any would reject or strip `surfaceTempBand`,
   `orbitalTempBand`, `reconciliation`, or the liquid status fields of T1.3, extend it with
   those as optional, with a test. If the tree body is carried without a schema over its
   bodies, change nothing and say exactly where you looked.

## Tests

- `tests/generation/`: for each generation fixture input the suite already has for MgT2E
  (the Regina flesh tree and the others `tests/generation/parity.test.js` and
  `tests/golden/esm.test.js` use), `generateHex` with the policy equals
  `reconcileTree(generateHex without it, policy).tree` through the canonical serializer,
  byte for byte; and the two trees differ only in the fields of the allowlist
  (`RECONCILE_FIELDS` and the liquid fields).
- **Every existing parity and golden test stays exactly as it is and stays green**, because
  the default is off. No mask, no regenerated fixture, no `UPDATE_GOLDEN`. If any existing
  test fails, stop and report it; do not adjust it.
- RNG access during `reconcileTree` throws in a test (section 7.1), and the input is
  deep-frozen.

`npm test`, `npm run check`, `npm run typecheck` green, pasted.

If the plan and the code disagree, or a step cannot be done as written, stop and ask. Do not
touch `rules/`, `js/`, `apps/web`, any copied engine, or `tools/truth` beyond reading it.
T1.6 is not this step. Stop and report.
