# Lane B — urgent: Keep fails on a freshly generated system; then a dots route for the map

Issued 2026-10-11 by the orchestrator. You may be a fresh session with no memory. Read
`CLAUDE.md`, `directives/manifesto.md`, `directives/board.md`, `directives/lanes/B.md`,
then this file. No git but read-only, no deploy, no `rules/`, no Traveller rule from
memory. Your density report is accepted, with the job as one resumable message for
now (Johnny decides on your question; `prompts/b_generate_speed.md` measures a split
later). This prompt goes **before** `prompts/b_generate_cap.md`.

## 1. Urgent: Keep on a generated system's draft throws

Lane D, browser pass, production bundle against a local API: on seven of eight freshly
generated MgT2E systems, Edit, type a new mainworld name, Keep answers
"w.solarDayHours.toFixed is not a function" (shown twice at the top of the editor).
Repro: an empty hex in a sector of your own, Generate, Keep, Edit, a new mainworld
name, Keep. It blocks editing any newly generated system, and may be live.

What the orchestrator read: the only `solarDayHours.toFixed` is a trace line in
`packages/engines/src/mgt2e_world_engine.js` line 1692 (`generateRotationalDynamics`),
which assumes a number. `packages/generation/src/form.ts` line 150 lists
`solarDayHours` among the fields the form carries. So on Keep the reconcile probably
hands the engine a `solarDayHours` that is not a number (a string from the form, or
null) and marks it manual or preserved, and the trace line falls over.

- Reproduce in a test first (a generated tree, the draft a rename produces, Keep),
  failing on today's code. Say which value and type reach line 1692 and why one system
  in eight escapes.
- **Fix it in `packages/generation` (the caller): the engine must be handed the types
  it produced.** Do not edit the engine file. If you find the only correct fix is in
  the engine, stop on this item and report the line and the change: an engine edit
  needs Johnny's word.
- Then check the same class of fault for every numeric field in that list (`form.ts`
  about lines 148 to 150): a test that round-trips each through a draft with an
  unrelated change and Keep, for MgT2E top-down and AoW bottom-up, and for a hand
  system.
- Say since which commit (git log, read-only), and whether the live site has it.

## 2. A route the map can draw dots from

Lane A is blocked on it (`findings/map_own_dots.md`; read it). Zoomed out, the map
draws one dot per occupied cell from the published chart's overview string; a
referee's generated, hand-made and removed systems are not reflected, and a sector of
their own is empty.

Contract first (`b_builder.md`), then code: `GET /api/universes/:id/hexes/:sector/dots`
(or the shape you judge better; A's note has the ask) answering `{ cells }`, a string
of 1,280 characters in the overview's own cell order (say the order, citing where the
truth build writes it), `.` for empty and any other character for a system: the
chart's string for that sector at the universe's pinned version with the referee's
rows applied on top (a held system sets the cell, a removed one clears it), and for a
sector of their own, the rows alone. Owner only. Say the cost of one call (rows read,
bytes) and give an ETag or a rev the browser can use to skip unchanged sectors. If
many sectors in one call is cheap (`?sectors=a,b,c`, bounded), offer it and say the
bound.

## Owned files (this pass)

`apps/api/`, `packages/generation/`, `packages/shared/`, `tests/api/`,
`tests/generation/`, `tests/shared/`, the contract,
`directives/reports/b_keep_crash_dots.md`. No engine file. Not yours: `apps/web`.

## Gates

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, pasted. Fourth gate:
`RUN_API_TESTS=1` Builder suites on your own ports, server stopped: the Keep repro
before and after; the round-trip test; the dots route for a charted sector with a
generated, a hand-made and a removed system, and for an own sector; golden and parity
green with no fixture touched.

## Stop rule

Part 1 first. Stop when both pass and the report is written, or at an engine line.

Write `directives/reports/b_keep_crash_dots.md` from `directives/reports/_TEMPLATE.md`.
Under "Needs from others" give Lane A the dots route in three lines. Questions for
Johnny written out in full, recommended answer first. After each meaningful step
append one line under Progress: "done: X. next: Y."

## Progress

done: read the Keep path. stable() stores Infinity as {$num}; load parses it back as an object and physSeed marks it manual. next: a failing rename test on a stored MgT2E tree.
done: the rename test failed on 12 of 16 stored MgT2E systems. The value at the trace line is the object {$num:Infinity}. Four systems escape because every solar day is a finite number or null. next: revive that object in physSeed.
done: physSeed and the gas-giant copy hand the engine a number again. The rename, the numeric round-trip, AoW, and a hand rename pass. The bug is in pushed 1.1.5 and the live bundle says 1.1.5. next: the dots contract and route.
done: the contract records the dots routes. next: the route, then the worker suite.
done: the route, the shared types, and the worker test were already on disk; no half-written file to finish or back out. next: the Keep and dots unit tests.
done: Keep, dots, the worker suites, npm test, check, typecheck, and build passed. next: the report.
