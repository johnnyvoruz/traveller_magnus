# Lane C (high effort) — water, ice and temperature: one pass that ends it

Issued 2026-10-13 by the orchestrator, on Johnny's word: "the water ice thing is
starting to get on my nerves... tackle this and solve it once and for all." This
replaces `c_regina_engine_trial.md` (withdrawn, never started).

You may be a fresh session with no memory. You are expected to think hard, read
widely and finish. No git but read-only, no deploy.

## The problem, in one paragraph

A stored world contradicts itself. Regina (Spinward Marches 1910) is charted
`A788899-C`: dense breathable air, 80% water. The page says -84 C, an ethane sea and
"Fluid Oceans". 126 of the 246 Spinward Marches mainworlds with a breathable-range
atmosphere and water are frozen, boiling or carry a non-water sea. This has been
looked at five times since 2026-10-04 (a correction plan, a reconciler, a derived
build that took nine hours and was never released, nine held engine lines, two
traces) and each pass fixed one symptom or was parked. Nobody has yet owned the whole
chain from the chart row to the stored body. You do.

## What "solved" means

Write these as an executable census before you change anything, and make it the
judge. Sharpen the wording; do not weaken it.

1. **A charted mainworld keeps its chart.** For a world generated from a chart row,
   the physical atmosphere and hydrographics codes equal the chart's digits, and no
   trade code is stored that the chart digits forbid. The UWP has one reading, not two.
2. **The liquid agrees with the stored temperature.** Whatever liquid a body stores is
   one that the tables in `rules/` allow at the temperatures stored on that same body.
   It is decided once, after the last write of those temperatures, by one function.
3. **Water against ice is decided once, by one rule, with one citation**, and every
   reader (the engine, the reconciler, the surface map's `seaIce`, the dossier) agrees
   with it or reads its result.
4. **No placeholder is a result.** "Unknown Exotic Liquid", a missing `liquidType` on a
   body that has hydrographics, and a temperature that is not a finite number are each
   either impossible or counted and explained.
5. **Temperature is computed one way.** Today it is written three times with three
   different inputs (star, AU, day cap, albedo, greenhouse). One pass, or passes that
   provably agree.
6. **It stays solved.** The census runs in `npm test` on a fixed sample and fails on
   any regression.

Where an invariant cannot reach zero without a ruling, the remainder is counted,
listed by cause, and put to Johnny once.

## The Johnny Protocol binds, and how to work inside it

`CLAUDE.md` rules 1 to 4. You state no Traveller rule from memory. Every rule you rely
on is quoted from `rules/` or `assets/` with file and line. `rules/` is not edited.
Sort every cause you find into exactly one of three bins, and treat them differently:

- **A defect of order or plumbing** (a value read before it is written, an argument
  dropped, a stale value never recomputed, two passes that use different stars). No
  rule is in question. Fix it.
- **A departure from text you can quote.** Fix it toward the text; quote both sides.
- **A gap: the files are silent or the engine uses something that is not in them**
  (the blackbody formula in `mgt2e_math.js`; the exotic liquid windows marked "WBH" with
  no page in `assets/`; what a published `Sa` remark means for the orbit; what happens
  when a companion's forbidden zone covers the habitable zone). Do not fill it. Write
  one question per gap with the count of worlds it decides, your recommended answer
  first, and build the recommended answer in the trial **so that "yes to all" from
  Johnny needs no second design pass**. Mark each such choice provisional in the code
  and in the note.

Johnny has already ruled, and these stand (cite them, do not reopen them):
- 2026-10-13: keep a charted mainworld's atmosphere and hydrographics when it is a
  moon; stop defaulting a missing temperature band to Temperate (the book's roll:
  `assets/2eWorldCreation.txt` 408 to 462, `assets/2eWorldGeneration_EngineSpec.md`
  4.3 and 6.2 row 5); not the lock alone; not a screen-only cover.
- 2026-10-07 (handoff section 198, provisional, "do your best"): Ice or Water whose
  mean is below Water's melting point is Ice; Water or Ice above the boiling point,
  and Ice on a vacuum at or above melting, is no free liquid with the coverage figure
  untouched; on atmospheres 10 to 12 with no listed liquid in range, Unknown Exotic
  Liquid. Note that the engine's own line and the nine held lines test the **high**
  temperature against 273, not the mean: that conflict is yours to lay out and settle
  with one question.
- 2026-10-07 (section 199): the derived build was too slow, and he wants a generator
  "built right from the start with a foundation I understand". So: prefer the simplest
  design a person can hold in their head, and say plainly, with evidence, whether a
  repair in place reaches the invariants or whether the atmosphere-temperature-liquid
  stage should be rewritten as one small module. Recommend one. Do not rebuild the
  whole generator in this pass.

## Read first

`CLAUDE.md`, `directives/manifesto.md`, `directives/board.md`, `directives/lanes/C.md`,
then: `findings/regina_temperature.md` (the trace, 2026-10-12),
`findings/regina_liquid_temperature.md` (thirteen unanswered questions: answer each
from the files or carry it into your batch), `findings/golden_red_on_head.md`,
`findings/v6_open_cases.md`, `findings/v6_shadow_evidence.md`,
`findings/engine_1_1_0_rule_fixes.md`, `directives/plan_engine_corrections.md`,
`directives/handoff.md` sections 60, 132 to 153, 197 to 199, 225 (read by offset: grep
`^## 198\.` and so on), `packages/engines/src/reconcile_environment.js`,
`packages/engines/src/mgt2e_world_engine.js` (`generateAtmospherics`,
`generateRotationalDynamics`, `generateBiospherics`), `mgt2e_stellar_engine.js`
(`allocateOrbits`, `isMainworldInHZ`, the `Sa` intercept), `mgt2e_topdown_generator.js`,
`mgt2e_socio_engine.js` (`refreshMainworldSocialInPlace`, the `Object.assign` from the
chart), `mgt2e_math.js`, `apps/web/src/surface/enhanced/seas.ts` (read only).

The working tree carries uncommitted work you must account for, not trip over: nine
held lines in `mgt2e_world_engine.js` with five edited fixtures in
`tests/golden/fixtures/engine_1.1.0/`, and parked truth-build paths
(`apps/api/src/jobs/`, `routes/admin.ts`, `tests/api/truth_build.test.js`,
`tests/generation/reconcile_derived.test.js`, `release_seal.*`). Say for each: kept,
absorbed into your change, or to be discarded, and why.

## Do

1. **Work in a copy outside the repository.** Four other lanes run `npm test` on this
   tree; an engine edit turns it red for all of them. Copy what generation needs.
   Trap already hit (board, "Withdrawn: the last commit fails five golden tests"): a
   borrowed `node_modules/@voyage/*` link points back at the working tree. Prove the
   copy runs its own engines: unchanged, it reproduces stored Regina (`meanTempK`
   189.60630776703493, `atmCode` 10, Ethane).
2. **Build the census** for the six invariants over every body, not only mainworlds,
   on the pinned seed and `tools/truth/settings.js`: the Spinward Marches whole, and
   at least three other charted sectors of different character plus a few hundred
   uncharted (bottom-up) systems, so a fix that only suits Regina shows. Baseline
   counts by invariant and by cause.
3. **Trace every cause to its line** and sort it into the three bins.
4. **Design the smallest change that makes the census pass**, write it down in a page a
   referee can read (inputs, order of steps, the one place each value is decided), then
   build it in the copy. Measure after each step, not only at the end. Report Regina
   and the twenty-two-world table from `findings/regina_temperature.md` before and after.
5. **Check you broke nothing else**: every golden fixture and parity test in the copy,
   each difference explained by a named change. Count how much of each stored system
   changes (an added dice draw moves every later roll: say whether you avoided that,
   and at what price).
6. **Look for the next Regina.** Before you stop, list the ten worst-looking worlds
   that still pass the census and say why each is right by the files, or which
   invariant is missing.
7. **Prepare the landing, do not land.** No file under `packages/`, `tests/`, `rules/`,
   `tools/` or `apps/` in the repository changes in this pass. Deliver:
   - `findings/liquid_temperature_once.md`: the design page, the causes, the
     citations, the before and after counts, what is left and why.
   - `findings/liquid_temperature_once.patch` against the working tree, the census as a
     test file for `tests/generation/`, the new fixture folder for the next engine
     version (propose the number; 1.1.0 is current), the entries for a new
     `tests/generation/parity_deviations_<version>.json`, the lines for
     `packages/engines/package.json`.
   - `findings/liquid_temperature_once_landing.md`: a numbered recipe an implementer
     session can execute without judgment when the orchestrator says the tree is quiet
     (file, change, one-line check per step, the four gates at the end), then what the
     browser lanes must change (surface `seaIce`, the dossier's liquid row, captions)
     and what a truth rebuild needs: the command, a measured time for one sector, an
     estimate for the chart, and anything that would make it faster than last time.
   - The questions for Johnny: one batch, numbered, each written out in full with the
     count of worlds it decides and your recommended answer first, phrased so he can
     answer "yes to all".

## Owned files (this pass)

`findings/liquid_temperature_once*`, `directives/reports/c_liquid_temperature_once.md`,
your copy outside the repo. Nothing else in the repository.

## Contract

None.

## Gates

No product file changes, so the four gates are run **in your copy** with the patch
applied and the new fixtures in place: `npm test`, `npm run check`,
`npm run typecheck`, `npm run build`, results in the report (never paste golden
assertion output; counts only). In the repository: `git status --short` shows nothing
of yours outside `findings/` and `directives/reports/`.

## Stop rule

Stop when the census passes in the copy, or every remaining failure is counted,
attributed and covered by a question; and the note, the patch, the landing recipe and
the report are written. Do not stop at "needs Johnny" while there is anything in the
first two bins left to fix or anything left to measure. If a step cannot be done as
written, say so in the report and carry on with the rest.

Write `directives/reports/c_liquid_temperature_once.md` from
`directives/reports/_TEMPLATE.md`. After each meaningful step append one line under
Progress: "done: X. next: Y."

## Progress

