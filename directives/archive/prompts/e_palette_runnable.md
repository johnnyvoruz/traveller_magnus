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

## Also: signed out, the rail shows Campaign and Build, switched off

Johnny, 2026-10-11: "let's disable toolbar items if you're not logged in, so people
can see all the cool stuff that might spur them to create an account … I just mean the
campaign and system creation stuff."

Today `apps/web/src/shell/Rail.vue` leaves the Campaign item (`v-if="has('campaign')"`,
about line 117) and the Build item (`v-if="buildOffered"`, about line 130) out when
nobody is signed in. Change that for a signed-out visitor only:

- Both items are **shown, in their usual places, visibly switched off** (the rail's
  existing disabled look, plus whatever small sign the design language already has for
  "needs an account"; do not invent an icon set).
- Each says why and what to do, in the Google developer documentation style, as its
  tooltip and its accessible name: for example "Campaign: sign in to keep a party,
  records, and a journal." and "Build: sign in to make your own systems and sectors."
  (write the final words from what each feature does today, not from these examples).
- They stay reachable by keyboard and by a screen reader (`aria-disabled`, not the
  `disabled` attribute, so the reason can be read). **Choosing one opens the sign-in
  card**, the same one the account button opens, and does nothing else. If you judge
  that a switched-off item should do nothing at all, build it this way anyway and say
  so in the report: it is a question for Johnny.
- Until the session has been read, the rail must not flash the switched-off state at
  a signed-in person: follow the rule the account button already uses.
- Signed in, nothing changes: an item that is off for another reason (no campaign yet,
  Build not offered on this map) behaves exactly as it does today.
- The palette is the opposite case on purpose: it lists only what can run. Do not
  list these two there for a signed-out visitor.
- Only these two. No other rail item, no banner, no "coming soon".

## Owned files (this pass)

Lent: `apps/web/src/components/OmniBox.vue`, `apps/web/src/workspace/Lightbox.vue`,
`apps/web/src/shell/Rail.vue` (the two items only). Yours: its test in `tests/web/`,
`directives/reports/e_palette_runnable.md`. Not yours: `shell/registry.ts`,
`workspace/build/`, `workspace/market/`.

## Gates

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, pasted. Fourth gate:
a browser pass on your own ports with your own Vite cache directory, stopped after:
the palette on an empty hex (no "Publish selection…"), on a system (it is there), with
Build off, and by keyboard only; signed out: the rail with both items switched off
(expanded and collapsed, 520 px), each chosen by pointer and by keyboard opening the
sign-in card; a signed-in reload with no flash of the switched-off state. Shots `ke2_*`.

## Stop rule

Stop when it works and the report is written.

Write `directives/reports/e_palette_runnable.md` from `directives/reports/_TEMPLATE.md`.
After each meaningful step append one line under Progress: "done: X. next: Y."

## Progress

done: read the prompt, registry, OmniBox, Rail, Lightbox, and the orbit-picker trap. Lent files were clean; the prompt already had the signed-out rail. next: hide non-runnable commands and refresh the open list.
done: OmniBox hides a command whose runnable() is false, and Campaign and Build while signed out; the open list refreshes from a stamp of the session, the campaign, Build, the route, and every runnable(). Empty searches say "Nothing can run right now." or "No results match your search." next: trap Lightbox focus.
done: Lightbox copies wrapFocus into workspace/focus_trap.ts, holds focus on focusin, and returns it on close. One test in tests/web/lightbox_focus.test.js. next: signed-out rail.
done: Rail shows Campaign and Build switched off only after the session read says signed out, with aria-disabled and the sign-in card on choose. next: the focus test, then the gates.
done: lightbox test passed. check and typecheck passed. build passed. npm test failed in four Lane C surface files. Browser pass passed on ports 8861 and 5207, then both servers were stopped. next: write the report.
