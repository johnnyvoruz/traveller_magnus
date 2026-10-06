# Agent B — engine corrections T1.6: the derived build that reconciles a truth

Issued 2026-10-06 by the orchestrator. T1.4 is accepted as built (the hook behind an option,
equal to the standalone transform, nothing switched on; the tree body carried without a
body schema).

Read `directives/plan_engine_corrections.md` section 8, the two paragraphs under the Tier 1
table ("Tier 1 build reads each existing immutable tree…" and "Existing derived-build
safeguards…"), and sections 3.1, 3.4 and 7.3 again. Those two paragraphs are the recipe.
Then read the derived build as it is: `apps/api/src/jobs/truth_build.ts` (`deriveSector`),
`routes/admin.ts`, `db/schema.ts` (`derivedFrom`), `tests/api/truth_build.test.js`.

## What T1.6 is

A derived build that makes a new truth version from a released one by passing every stored
tree through `reconcileTree`, with **no engine generation call**. It is how the corrected
labels and liquids reach the released chart (v6 from v5). **This step builds and proves it
locally. It runs nothing in production**; those commands are Johnny's.

## Build

1. **A named transform on the derived build.** Today a derived build copies a sector's
   trees forward and rebuilds what depends on them. Add an optional, named transform
   (`reconcile-environment`) that, for each tree of the source version, reads the object,
   applies `reconcileTree(tree, environmentPolicy)`, writes a new content-addressed object
   only when the canonical bytes changed, reuses the source object when they did not, and
   points the sector index at the result. Everything that depends on a tree's hash is
   rebuilt as it is today. Chart summaries, partly surveyed rows, the source's seed,
   settings and engine version are carried over untouched.
2. **Provenance, not a disguise.** The new version records its source version, the
   transform's name, the policy's version digest and a digest of the rules files the policy
   read, beside (not in place of) the source's generation provenance. The existing
   safeguard that a derived build must match its source's generation provenance stays, and
   is extended to allow exactly this transform by name. Do not relax it, and do not write a
   different engine version.
3. **A report beside the truth files,** not inside the bodies: per sector and in total, the
   bodies seen, the bodies changed by field, the liquid outcomes (the table of your T1.3a
   report), the diagnostics by kind, and the unresolved and the blocking bodies listed by
   hex key and body path. Say where it is written and how large it is for one sector.
4. **Resume and repeat.** A sector already transformed for this source and this policy
   digest is not done again; a run interrupted mid-sector finishes cleanly; a second full
   run writes nothing and yields the same manifest hash. A different policy digest
   invalidates what was cached.
5. **Staged, not released.** The job ends with a new version in the built state, checked
   (every index entry's object exists; counts match the source). Releasing is the existing
   separate act. The source version is never written to.

## Prove it, locally

- Unit tests where the logic is pure; then the black-box suite against your own
  `wrangler dev` (`RUN_API_TESTS=1`): derive from a local released version of one sector
  with the transform; the report's counts equal an in-memory `reconcileTree` over the same
  trees; an unchanged tree keeps its hash; the source's files and row are untouched; a second
  run is a no-op; without the transform the derived build is byte-for-byte what it is today.
  **Say plainly that the suite ran, and paste it.** Nobody else is editing `apps/api` or
  `packages/`, so the tree is quiet for it.
- `npm test`, `npm run check`, `npm run typecheck` green, pasted.

## Report, in addition to the usual

- In five lines, how a derived build works today (for the orchestrator's notes).
- The exact production commands a v6 shadow build would need, **written out and not run**,
  with what each does and how long v5's 512 sectors should take, by your estimate.
- Anything in the plan's two paragraphs you could not do as written.

If the plan and the code disagree, stop and ask. Do not touch `rules/`, `js/`, `apps/web`,
any copied engine. No production command, no deploy, no git. T1.7 is not this step.
Stop and report.
