# Lane A — density and landed hexes through the store; then the dots, then the allowance

Issued 2026-10-11 by the orchestrator. You may be a fresh session with no memory. Read
`CLAUDE.md`, `directives/manifesto.md`, `directives/board.md`, `directives/lanes/A.md`,
then this file. No git but read-only, no deploy, no `rules/`, no Traveller rule from
memory. Your form follow-ups report is accepted; your own-dots report is accepted as
blocked, and the route you asked for is with Lane B (`prompts/b_keep_crash_dots.md`).
Johnny: yes, a referee's own system is the same dot as a charted one.

## 1. Density (Lane B has reported: `directives/reports/done/b_generate_density.md`)

Read the contract (`directives/contracts/b_builder.md`, both generate sections), not
B's code.

- `density` (`every` | `sparse` | `standard` | `dense`; absent means `every`) on the
  store's three generate calls: one hex, many, and with new sectors.
- `leftEmpty` in progress and in the final result, beside done, skipped and failed.
- **`placed`**: the job now lists the hex keys written, in order, and
  `GET .../jobs/:jobId?since=<n>` returns the keys after the first n. Poll with
  `since`, and give the screen the keys that landed since the last callback, so Lane D
  can mark each hex as it lands without reading revisions. B's warning: `done` counts
  skipped, failed and left-empty hexes too; "systems generated" is `placed.length`.
  Make the result say both, named so they cannot be confused.
- The job is one queue message that posts every 32 hexes: progress arrives in steps of
  up to 32. Nothing for you to change; say it in the note so D words it honestly.
- Update `findings/builder_density_ready.md`: the option on each call, the new
  progress and result fields, and the two seam additions D still lacks (`job`,
  `stopJob`).

## 2. The dots, when B's route exists

Only when `directives/reports/b_keep_crash_dots.md` or its copy in `reports/done/`
exists and says the dots route is built: do `prompts/a_own_dots.md` as written, with
that route. If it is not there, skip and say so.

## 3. The daily allowance, when B's cap exists

Only when `directives/reports/b_generate_cap.md` or its copy exists: as item 5 of
`prompts/a_form_followups.md`. If not, skip and say so.

## Owned files (this pass)

`apps/web/src/builder/`, `tests/web/builder_*.test.js`, the note, and for part 2 only
`apps/web/src/map/MapRenderer.ts` (`overviewPoints`, `setChart`, one new setter);
`directives/reports/a_density_store.md`. Not yours: `workspace/`, `shell/`,
`packages/`, `apps/api`.

## Gates

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, pasted. Fourth gate:
your own API on your own port and state directory, stopped after: a subsector at each
density through the store, the counts and `placed` pasted, the keys handed to the
callback in order; one hex always written; Undo after.

## Stop rule

Stop when part 1 passes (and 2, 3 if their reports were there) and the report is
written.

Write `directives/reports/a_density_store.md` from `directives/reports/_TEMPLATE.md`.
After each meaningful step append one line under Progress: "done: X. next: Y."

## Progress
