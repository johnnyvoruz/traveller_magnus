# Lane E — the command palette lists only commands that can run

Issued 2026-10-11 by the orchestrator. You may be a fresh session with no memory. Read
`CLAUDE.md`, `directives/manifesto.md`, `directives/board.md`, `directives/lanes/E.md`,
then this file. No git but read-only, no deploy, no `rules/`, no Traveller rule from
memory. Your record-visibility report is accepted.

## Goal

Johnny, 2026-10-11: yes, the palette hides commands that cannot run. Today
`apps/web/src/components/OmniBox.vue` lists every registered command; choosing one
whose `runnable()` is false does nothing and says nothing (Lane D found it with
"Publish selection…" on an empty hex). `Rail.vue` and the key handler already skip
such commands; make the palette agree with them.

## What to build

- In `OmniBox.vue` (lent to you for this), a command whose `runnable()` returns false
  is not listed and cannot be chosen. A command with no `runnable` is listed as now.
- The list follows state: a command that becomes runnable while the palette is open
  appears; say how you checked.
- If hiding leaves a search with no result, the palette's existing empty sentence
  shows; if it has none, add one plain sentence in the Google developer documentation
  style.
- Read how `runnable` is declared in `shell/registry.ts` first; do not change the
  registry.

## Also: the Lightbox lets keyboard focus out

Lane D found that Tab leaves `apps/web/src/workspace/Lightbox.vue` for the page behind,
the same hole its orbit picker had. D's fix is the pattern: `wrapFocus` in
`apps/web/src/workspace/build/orbit_pick.ts` and the `focusin` guard in
`build/OrbitPicker.vue` (read them; do not import from `build/`, which is D's: copy the
few lines or lift them to a file of your own beside the Lightbox). Hold focus inside
the Lightbox while it is open and return it to the opener on close. One test.

## Owned files (this pass)

Lent: `apps/web/src/components/OmniBox.vue`, `apps/web/src/workspace/Lightbox.vue`. Yours: its test in `tests/web/`,
`directives/reports/e_palette_runnable.md`. Not yours: `shell/registry.ts`,
`workspace/build/`, `workspace/market/`.

## Gates

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, pasted. Fourth gate:
a browser pass on your own ports with your own Vite cache directory, stopped after:
the palette on an empty hex (no "Publish selection…"), on a system (it is there), with
Build off, and by keyboard only.

## Stop rule

Stop when it works and the report is written.

Write `directives/reports/e_palette_runnable.md` from `directives/reports/_TEMPLATE.md`.
After each meaningful step append one line under Progress: "done: X. next: Y."

## Progress
