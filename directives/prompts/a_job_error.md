# Lane A — hand a failed job's sentence to the screens (two lines)

Issued 2026-10-13 by the orchestrator. You may be a fresh session with no memory. Read
`CLAUDE.md`, `directives/board.md`, `directives/lanes/A.md`,
`directives/reports/done/d_menu_and_job_error.md` ("Needs from others", Lane A), then
this file. No git but read-only, no deploy, no `rules/`.

Your `a_feed_draw_all` report is accepted. This is the last item before push 1.1.12.

## Do

1. `apps/web/src/builder/types.ts`: add `error?: string;` to `JobProgress`.
2. `apps/web/src/builder/store.ts` `progressOf`: add
   `...(job.error ? { error: job.error } : {})` to the returned object.
   (`BuilderJob.error` is optional in `packages/shared/src/schemas/builder.ts`; the
   server sets it when a job fails with no failure rows. Lane D's toast and line
   already read it.)
3. One test in `tests/web/`: a `failed` job with `error` and no failures gives a
   progress that carries the sentence; a job without `error` has no `error` key.

## Owned files (this pass)

`apps/web/src/builder/types.ts`, `apps/web/src/builder/store.ts`, the test,
`directives/reports/a_job_error.md`.

## Gates

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, pasted. No browser
pass.

## Stop rule

Stop when the gates pass and the report is written.

Write `directives/reports/a_job_error.md` from `directives/reports/_TEMPLATE.md`.
After each meaningful step append one line under Progress: "done: X. next: Y."

## Progress

done: JobProgress carries an optional error, and progressOf copies the job's sentence only when the server sent one. next: the four gates and the report.
done: tests 1622 pass and 0 fail, check clean, typecheck clean, build index 176.30 kB. next: the report.
done: directives/reports/a_job_error.md written. next: stop.

