Found: Progress was empty. JobProgress had no error field, and progressOf did not copy BuilderJob.error.
Finished: a failed job's sentence is on the progress the screens already read. A job with no sentence has no error key.
Backed out: nothing.

# Lane A a_job_error report
Prompt: prompts/a_job_error.md
Status: done

## Changed files
- apps/web/src/builder/types.ts: JobProgress has optional error.
- apps/web/src/builder/store.ts: progressOf adds error only when the job has one.
- tests/web/builder_store.test.js: a failed job with a sentence and no failures carries that sentence; a failed job without error has no error key.

## Gates
npm test:      pass. 1649 tests, 1622 pass, 0 fail, 27 skipped.
npm run check: pass
typecheck:     pass
build:         pass. dist/assets/index-D7GMJuX1.js 176.30 kB, gzip 59.22 kB
fourth gate:   not run. The prompt says no browser pass.

## Contract published
none

## Needs from others
none

## Questions for Johnny
none
