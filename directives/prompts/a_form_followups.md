# Lane A — lookups on the first form, a refusal at its field, the job across routes

Issued 2026-10-11 by the orchestrator. You may be a fresh session with no memory. Read
`CLAUDE.md`, `directives/manifesto.md`, `directives/board.md`, `directives/lanes/A.md`,
then this file. No git but read-only, no deploy, no `rules/`, no Traveller rule from
memory. Your Undo-faults report is accepted (the stale Undo is refused with the server's
sentence; a job Undo returns what it left).

## What to build (all found by Lane D in its browser pass)

1. **`cloneForm` drops `lookup`** (`apps/web/src/builder/draft.ts`, about line 104), so
   a star's looked-up mass, diameter, temperature and luminosity show only after the
   first change. Copy it. Then check `cloneForm` against the shared `FormField` schema
   for any other optional property it drops, and add a test that fails when the schema
   gains one the clone does not carry.
2. **A field refusal reaches the editor as a loose message at the top.** With
   `details.code` `field` and `details.id` (the contract's "Codes the browser reads"),
   hand the screen the refused field's id with the sentence, so Lane D can show it at
   the field. Say the shape in `findings/builder_density_ready.md` (rename the note if
   you like; tell D its name in the report).
3. **A job across routes.** Leaving the map closes the Builder store (`bind.ts`
   `close`), which clears every toast (`store.ts` about line 1152) while the job runs
   on. Decide and build what is right in `builder/`: the store that follows a job
   outlives the view until the job ends, or a new store picks the running job up from
   the server (`GET .../jobs`), with its progress and its Undo token. Test: start a
   job, close the store, open a new one: progress continues, and Undo on the result
   works on the new store. D could not test that last point; do.
4. **Density through the store**, only when `directives/reports/b_generate_density.md`
   or its copy in `reports/done/` exists: the field on the three generate calls, the
   left-empty count in progress and result, the note updated. If it is not there,
   skip and say so.
5. **The daily allowance**, only when `directives/reports/b_generate_cap.md` or its
   copy exists: read the allowance where B's contract puts it, keep it current from
   each generate answer, expose it to the screen, and turn the refusal's code into a
   result the screen can show without matching a sentence. If it is not there, skip.

## Owned files (this pass)

`apps/web/src/builder/`, `tests/web/builder_*.test.js`, the note,
`directives/reports/a_form_followups.md`. Not yours: `workspace/`, `shell/`,
`packages/`, `apps/api`.

## Gates

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, pasted (Lane C's ice
cap work is in flight: four surface tests may be red; name them and go on). Fourth
gate: the tests named above, and item 3 against a local API on your own port, stopped
after.

## Stop rule

Stop when items 1 to 3 pass (and 4, 5 if their reports were there) and the report is
written.

Write `directives/reports/a_form_followups.md` from `directives/reports/_TEMPLATE.md`.
After each meaningful step append one line under Progress: "done: X. next: Y."

## Progress
