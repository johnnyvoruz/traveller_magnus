# Lane E — toasts live in the app shell, can show a spinner, and can keep an action open

Issued 2026-10-11 by the orchestrator. You may be a fresh session with no memory. Read
`CLAUDE.md`, `directives/manifesto.md`, `directives/board.md`, `directives/lanes/E.md`,
then this file. No git but read-only, no deploy, no `rules/`, no Traveller rule from
memory. Your palette, Lightbox and signed-out rail report is accepted.

## Why

Johnny wants a running generate job shown "in the lower right corner as a toast so
that a user can do other things while it's generating". Lane D built the job toast
(`apps/web/src/workspace/build/job_toast.ts`; read it, do not edit it) and hit three
limits of the toast strip, which is not D's:

1. The strip is mounted by `views/MapView.vue` and `views/OrbitView.vue`, so on the
   account page, `/packages` and the character pages no toast shows.
2. A toast cannot show that something is running.
3. Choosing a toast's action always closes the toast, so Stop has to swap toasts.

## What to build

- **One strip, in the app shell.** Mount `shell/ToastStrip.vue` once where every route
  gets it (find where `App.vue` or the shell frame mounts the rail), in the same
  corner and stacking as today, and remove the two mounts in the views. Lent for
  exactly that: one line and its import in `views/MapView.vue` and in
  `views/OrbitView.vue`. Nothing else in either file. Check every route cold: a toast
  raised on the map is still there on `/account`, `/packages`, a character page, and
  back; it does not sit over a route's own fixed controls at 520 px.
- **`busy`:** an optional flag on a toast (`shell/toast.ts`); the strip shows a small
  spinner before the words while it is set, still under reduced motion. The app's one
  spinner is `workspace/build/BuildSpin.vue` (Lane D's): do not import from `build/`;
  ask in the report for it to be lifted to `design/`, and until then draw the same
  ring from the same tokens in the strip.
- **An action that does not close its toast:** an optional flag on the action
  (default: closes, as today). Existing callers are unchanged.
- A busy toast is announced once (`role="status"`), not on every count change.
- Tests for each, and for the strip being mounted once.

## Owned files (this pass)

Lent: `apps/web/src/shell/ToastStrip.vue`, `shell/toast.ts`, the shell file that
mounts it (name it), one line and its import in `views/MapView.vue` and
`views/OrbitView.vue`. Yours: tests in `tests/web/`, shots `ke3_*`,
`directives/reports/e_toast_shell.md`. Not yours: `workspace/build/`, `builder/`.

## Gates

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, pasted (four of Lane
C's surface tests may be red in flight: name them and go on). Fourth gate: a browser
pass on your own ports and Vite cache, stopped after: a toast on every route, a
subsector job's toast followed across routes and back, Undo from the result toast,
520 px, reduced motion.

## Stop rule

Stop when the three work and the report is written. Under "Needs from others" give
Lane D the two new flags in three lines.

Write `directives/reports/e_toast_shell.md` from `directives/reports/_TEMPLATE.md`.
Questions for Johnny written out in full, recommended answer first. After each
meaningful step append one line under Progress: "done: X. next: Y."

## Progress
