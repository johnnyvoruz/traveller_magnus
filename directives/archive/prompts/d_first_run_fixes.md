# Lane D — the first ten minutes: fix what your own review ranked first

Issued 2026-10-12 by the orchestrator. You may be a fresh session with no memory. Read
`CLAUDE.md`, `directives/manifesto.md`, `directives/board.md`, `directives/lanes/D.md`,
`directives/agent_d_brief.md`, `findings/first_run_review.md` (your review, accepted),
then this file. No git but read-only, no deploy, no `rules/`, no Traveller rule from
memory. Passkey sign-in is out and deployed in version 1.1.11 (`ef92359`).

## Johnny's rulings on your three questions (2026-10-12)

- **Regina:** a read-only pass was done (Lane C, `findings/regina_temperature.md`);
  the fault is in the generated system, not on your screens. Nothing for you.
- **The map has its own name: yes.** The Build strip says "Your map" and the
  universe's name; "My campaign" stays for the records.
- **A first visit opens somewhere readable: yes.** The Spinward Marches at the
  subsector tier with Regina in view, and one dismissible line: "Search for a world,
  or select a hex to read its system."

## Added 2026-10-13: the sign-in card (Johnny, live on 1.1.11). Do this first.

`workspace/passkey/SignInBody.vue` and `workspace/passkey/words.ts`:

- **"Create an account" goes to the top** of the card and is the filled (primary)
  button; its username form opens in place as it does now.
- **The passkey sign-in button moves to the bottom of the list**, below the
  "Or sign in with another account" rows, and reads **"Sign in"** (`SIGN_IN_PASSKEY`).
  It is a plain button, not the filled one. "I lost my passkey" stays directly under it.
- **Remove the helper sentence** `PASSKEY_EXPLAIN` ("A passkey signs you in with your
  fingerprint, face, or device PIN...") from the card and from `words.ts` if nothing
  else reads it. Remove no other sentence; if you think another line on the card is
  "helper text around passkey", name it in your report as a question.
- Focus on opening the card lands on the top button. Tab order follows the new
  order. A browser with no passkeys keeps today's fallback (the note, the first
  provider filled). Update `tests/web/passkey_screens.test.js` for the order and the
  label; `data-signin` values stay.
- In the browser pass: the card at column, half, full and 520 px, signed out, with
  and without providers offered.

## Do, in this order (numbers are your review's findings)

1. **Finding 1 and the ruling above: the first screen.** A first visit (no stored
   camera, no address in the URL) opens on the Spinward Marches with Regina in view;
   the one line, dismissible, remembered per browser, never shown again once
   dismissed or once a hex has been opened; an address in the URL always wins; a
   returning person's last view always wins. Say what "first visit" is keyed on.
2. **Finding 7 and the ruling: "Your map".** The Build strip and every place that
   names the map a person builds on (the date chip excepted if it is the campaign's:
   say which is which) use the universe's name, with "Your map" as the label. List
   every string you changed.
3. **Finding 5:** Clear on a selection clears it; it must not turn into the whole
   sector.
4. **Finding 6:** Build gives a first step: with Build on and nothing selected, the
   pane says what to do first, in one or two sentences, with the one control that
   starts it.
5. **Finding 8:** the hand designer's copy names controls that are not there. Make
   every sentence name what is on screen.
6. **Finding 12** (a subsector address opens no subsector) and **finding 16** (Undo
   after Blank system says nothing; small, because Undo is low priority: one
   sentence, no new machinery), if they are in your files and small.
7. **Lane A's `linkProvider`:** when `directives/reports/a_public_games_feed.md` or
   its copy in done/ exists, use it and delete `workspace/passkey/link.ts`.
8. **The public games switch: held.** It needs `publicGames` on the universe list
   from Lane B and the migration shipped. Do not build it this pass.

Not yours this pass (Lane E has them): findings 4, 9, 13, 14, 19. Left for a later
turn: 11, 15, 18, the modal frame, the `h1`/`p` reset.

## Copy

Every sentence follows the Google developer documentation style guide.

## Owned files (this pass)

`apps/web/src/views/MapView.vue`, `apps/web/src/map/input.ts`, `map/camera.ts`,
`apps/web/src/workspace/build/`, `apps/web/src/workspace/passkey/`, tests in
`tests/web/`, shots `kb18_*`, `directives/reports/d_first_run_fixes.md`. Not yours:
`apps/web/src/map/MapRenderer.ts`, `account/` (Lane A), `components/OmniBox.vue`,
`shell/Rail.vue`, `workspace/journal/`, `workspace/timeline.ts` (Lane E this turn).

## Gates

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, pasted, with the
`index` chunk size. Fourth gate: a browser pass on your own ports and Vite cache,
stopped after, in a fresh profile: the first visit, a second visit, an addressed
visit; each fix above by pointer and by keyboard; column, half, full, 520 px.

## Stop rule

Stop when the sign-in card and items 1 to 5 pass and the report is written; 6 and 7 if they were small
and ready.

Write `directives/reports/d_first_run_fixes.md` from `directives/reports/_TEMPLATE.md`.
Questions for Johnny written out in full, recommended answer first. After each
meaningful step append one line under Progress: "done: X. next: Y."

## Progress

- done: fresh start, nothing half-done in my files (no Progress lines, no diff). next: the sign-in card.
- done: the sign-in card reordered (SignInBody.vue, words.ts, passkey_screens.test.js). next: item 1, the first screen.
- done: items 1 to 5 and finding 16 written (first_visit.ts, FirstHint.vue, build/clear.ts, MapView.vue, BuildStrip.vue, state.ts, HandDesigner.vue, undo_words.ts, edit.ts) with tests/web/first_run_fixes.test.js. next: the four gates, then the browser pass.
- done: restart 2026-10-13: the written work read and kept; item 7 done (AccountPage.vue calls Lane A's linkProvider, workspace/passkey/link.ts deleted, its test replaced). next: the four gates, then the browser pass.
- done: the four command gates and the browser pass on ports 8794/5194/9394 (fresh Edge profile), servers stopped; two fixes from the pass (focus without passkeys; a narrow first visit opens on Regina at the names zoom). next: nothing, the report is written.
