# Lane D — public games on the map: the feed's lines, the switch, the Build pitch

Issued 2026-10-13 by the orchestrator. **Second in your queue: finish
`prompts/d_first_run_fixes.md` and write its report first** (it stopped before its
gates and browser pass; item 7 there, `linkProvider`, is now unblocked). You may be a
fresh session with no memory. Read `CLAUDE.md`, `directives/manifesto.md`,
`directives/board.md`, `directives/lanes/D.md`, `directives/agent_d_brief.md`,
`directives/contracts/b_public_games.md`,
`directives/reports/a_public_games_feed.md`, then this file. No git but read-only, no
deploy, no `rules/`, no Traveller rule from memory.

## Do, in this order

1. **Lane A's feed in `views/MapView.vue`.** Add the import and the lines in
   `frame()` after `renderer.draw`, exactly as written in
   `reports/a_public_games_feed.md` ("Lane D adds the import and..."). Pass an empty
   sector list when the tier is not hex. Do not edit `map/public_games.ts` or
   `map/MapRenderer.ts`; a fault there goes under "Needs from others".
2. **The public games switch.** It was held; Lane B's field is built. The owner's
   universe carries `publicGames` on `GET /api/universes` and
   `GET /api/universes/:id`: a boolean when the server has it, **absent otherwise.
   Absent is not on: show no switch at all.** The write is
   `PATCH /api/universes/:id/public-games` with `{ public: true | false }`; the
   answer is the raw object `{ public: boolean }`. Handle 401, 403, 404, 400 and
   503 ("Public games are not available yet.") with the server's sentence. Place it
   with the universe's own settings, where a referee would look for it; default off.
   One sentence beside it says what turning it on shows other people, from the
   decision on the board: one mark on the party's hex and the universe's name, to
   people on the same published chart; nothing else. Google developer style.
3. **The sign-in card's pitch when it opens from Build** (Lane E's need,
   `workspace/passkey/SignInBody.vue`, `workspace/account.ts`). Opened from the
   rail's Build item the card reads "Sign in to use Build. It generates systems on a
   copy of the map that's yours." Opened from anywhere else it keeps today's line.

## Owned files (this pass)

`apps/web/src/views/MapView.vue`, `apps/web/src/workspace/` except `journal/`, tests
in `tests/web/`, `directives/reports/d_public_games_wire.md`. `shell/Rail.vue` is
lent to Lane E: if the Build pitch needs a line there, write the line in your report.

## Gates

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, pasted, with the
`index` chunk size. Fourth gate: a browser pass on your own ports, state directory
and Vite cache, stopped after, with a local API that has migrations 0013 and 0014
applied: two accounts on the same chart; the first turns the switch on and saves a
party position; the second sees one diamond and the name on that hex, and no
diamond for their own game; the switch off removes it on the next sector load. Then
once against an API without 0013: no switch, no mark, no error on screen.

## Stop rule

Stop when the gates pass and the report is written.

Write `directives/reports/d_public_games_wire.md` from
`directives/reports/_TEMPLATE.md`. Questions for Johnny written out in full,
recommended answer first. After each meaningful step append one line under Progress:
"done: X. next: Y."

## Progress

- done: the feed's lines in MapView.vue, the switch (workspace/public_games.ts, AccountMenu.vue), the Build pitch (account.ts, SignInBody.vue), tests/web/public_games_wire.test.js. next: the command gates, then the browser pass with two accounts.
- done: four command gates; the browser pass (two accounts on v5, the switch on and off, the mark seen and gone, an API without 0013, the Build pitch), servers stopped. next: nothing, the report is written.
