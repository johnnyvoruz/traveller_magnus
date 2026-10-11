# Lane C — find why five golden fixtures are red on the committed tree (read-only)

Issued 2026-10-11 by the orchestrator. You may be a fresh session with no memory. Read
`CLAUDE.md` (rule 4, "Engine output is pinned", is the subject), `directives/manifesto.md`,
`directives/board.md`, `directives/lanes/C.md`, then this file. This pass is outside
your usual folders and is **read-only**: you change no file in the repository but your
findings note, this prompt's Progress and your report. Git read-only only (`git log`,
`git show`, `git diff`, `git archive`). No deploy. No Traveller rule from memory, and
no opinion on which output is right: that is Johnny's.

## What is known

- On Johnny's working tree `npm test` is green. On a fresh copy of the committed tree
  it is not: `tests/golden/esm.test.js` fails five cases: `mgt2e_topdown_bare`,
  `mgt2e_flesh_from_tsv`, `mgt2e_society_expand`, `orbit_normalize_1`,
  `orbit_normalize_2`. Seen on `3d28e33` and unchanged by `8118f72` (today's push).
- The working tree differs from the commit in six engine paths that Johnny is
  **holding** for the generator rebuild (`findings/push/engine_water_ice_files.txt`):
  nine lines in `packages/engines/src/mgt2e_world_engine.js`
  (`generateRotationalDynamics`, water against ice) and the same five fixtures under
  `tests/golden/fixtures/engine_1.1.0/`. With them on disk the tests pass.
- So the committed engine output and the committed fixtures disagree, and the held
  set hides it. In one failing case the first difference seen was two characters long,
  deep in a world record. Nobody has looked further.

## Goal

Write `findings/golden_red_on_head.md` that lets Johnny decide in five minutes:

1. **Which committed change made the five go red.** Build a scratch copy outside the
   repository (your scratchpad; `git archive <commit> | tar -x`), with junctions to the
   repository's `node_modules` and `apps/api/node_modules`, then `npm run rules:gen`
   and `npm run names:gen`, then `node --test tests/golden/esm.test.js`. Walk back
   through `git log --oneline -- packages/engines tests/golden packages/generation rules scripts`
   until the five pass, and name the first commit where they fail, the file and the
   lines. Check it is not a line-ending artefact: the repository has
   `core.autocrlf=true`, an archive is LF (`8d80bff` is "oracle hashes over LF").
2. **What exactly differs**, per case: the field paths and the two values (committed
   engine against committed fixture), never the whole record. **Never print an
   assertion's raw output: each is a whole system on one line.** Parse both sides and
   diff by key.
3. **How the held nine lines relate:** do they alone turn the five green on the
   committed tree with the committed fixtures, or only together with the five held
   fixtures; what the held fixtures change beyond the fields in point 2.
4. **Whether production is affected:** the live Worker runs the committed engine. Say
   what a generated world shows differently from what the committed fixtures pin, in
   plain words, from point 2. Say whether `tests/generation/parity.test.js` and
   `tests/generation/parity_deviations_1.1.0.json` cover the difference (it passes on
   the commit) and what that means under CLAUDE.md rule 4.
5. **The options, without choosing:** for example commit the held set as it is;
   regenerate the five fixtures from the committed engine; revert the committed change
   that moved the output. For each: which files, whether it needs a deviation entry
   and a version bump under rule 4, and what it does to systems already stored.

## Gates

None of the four apply. Yours: `git status --porcelain` before and after, identical
except this prompt and your report (the note is under git-ignored `findings/`); paste
both. The scratch copies are deleted or left only in your scratchpad.

## Stop rule

Stop when the note answers the five points, or when a point cannot be answered without
changing a file or running git beyond read-only: say which. Fix nothing. Recommend
nothing about the rules.

Write `directives/reports/c_golden_red.md` from `directives/reports/_TEMPLATE.md`, with
the first bad commit, the field paths, and the options in one line each. Questions for
Johnny written out in full, each with what it blocks. After each meaningful step append
one line under Progress: "done: X. next: Y."

## Progress
done: HEAD is 8118f72. The held edit is nine lines inside generateRotationalDynamics. Engine, rules, and the five fixtures last changed in 3d28e33; 8118f72 does not touch them. next: diff the fixtures by key and run the committed tree in a scratch copy.
done: a clean archive of 8118f72 passes the five. The nine lines are what turn them red. next: write the note and the report.
done: wrote findings/golden_red_on_head.md and reports/c_golden_red.md. next: stop.
