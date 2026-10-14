# Lane D — the account menu under a panel; the one-sector limit said in Build

Issued 2026-10-13 by the orchestrator. You may be a fresh session with no memory. Read
`CLAUDE.md`, `directives/manifesto.md`, `directives/board.md` (the "Engine 1.2.0"
notice too), `directives/lanes/D.md`, `directives/agent_d_brief.md`,
`directives/reports/done/d_public_games_wire.md` (yours),
`directives/reports/done/b_one_sector_followups.md`, `directives/contracts/b_builder.md`
(the cap), then this file. No git but read-only, no deploy, no `rules/`, no Traveller
rule from memory.

Your `d_public_games_wire` report is accepted. Item 1 below holds push 1.1.12.

## Do, in this order

1. **The account menu opens above an open panel** (your fault 2; orchestrator: fix
   it now). `.account-pop` sits inside `.map`'s stacking context and loses to the
   panel. Teleport it to `body` in the house pattern, with the rail's position
   variables carried over. Check it over the Campaign panel, the dossier and Build,
   at column, half, full and 520 px, by pointer and by keyboard (focus goes in, Esc
   returns it to the button).
2. **`MapView.vue`: drop `ownName` from the `watchPublicGames` call** once Lane A's
   `a_feed_draw_all` has made the field optional (check `map/public_games.ts`; if it
   has not landed, leave the line and say so). The server already leaves out the
   caller's own games; every game it sends is drawn.
3. **Build says the one-sector limit before it sends.** The server refuses a request
   that spans two sectors: "The limit is one sector per request." From Lane B's
   contract, the three actions that can send two: Generate and "Generate with…" on a
   selection with hexes in two sectors (the right-click line too), and "Create
   sectors and generate" across two empty slots. For each: the action is switched
   off or answers in place with one sentence that says what to do instead (select
   inside one sector, or make the sectors one at a time), Google developer style.
   A sector or a subsector opened by its address is one sector and is still sent.
   No request is sent that the server will refuse for this reason.
4. **A job that failed with a sentence shows it.** `BuilderJob.error` (new, optional,
   `packages/shared/src/schemas/builder.ts`) is set when a job ends `failed` with no
   failure rows. `progressOf`, `jobToast` and `jobLine` read only `failures`: when
   the job is `failed`, `failures` is empty and `error` is set, the toast and the
   line beside Generate say that sentence.
5. **Lane E's words:** the generator label "Full system, top down"
   (`workspace/build/state.ts`) becomes "Full system, from the star outward."
6. **No longer held (Johnny, 2026-10-13 21:10: yes).** Under the public games switch,
   when it is on and the party has no place on the chart, one line: "Your party isn't
   on the chart yet. Choose the ship and set where it is." It goes when the party has
   a place. The switch keeps its place in the account menu and its words (Johnny:
   yes).

## Owned files (this pass)

`apps/web/src/workspace/` except `journal/`, `apps/web/src/views/MapView.vue`, tests
in `tests/web/`, shots `kb20_*`, `directives/reports/d_menu_and_job_error.md`. Not
yours: `shell/Rail.vue` (Lane E adds your `signInFrom` line this turn),
`map/public_games.ts` (Lane A), `apps/web/src/builder/store.ts` (Lane A),
`apps/web/src/surface/` (Lane C, mid-step).

## Gates

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, pasted, with the
`index` chunk size. A red test in `surface/` or the engine fixtures while Lane C is
mid-step goes under "Needs from others". Fourth gate: a browser pass on your own
ports, state directory and Vite cache, stopped after: item 1 as written; item 3
with a drag across the Spinward Marches and Deneb border and with two empty slots;
item 4 by reading a job you fail by hand if the server gives you a way, otherwise
the unit test and say so.

## Stop rule

Stop when the gates pass and the report is written.

Write `directives/reports/d_menu_and_job_error.md` from
`directives/reports/_TEMPLATE.md`. Questions for Johnny written out in full,
recommended answer first. After each meaningful step append one line under Progress:
"done: X. next: Y."

## Progress

- done: items 1 to 6 written (AccountMenu.vue teleported; ownName dropped, Lane A's change had landed; build/one_sector.ts with guards in acts, grow_acts, density_ask, commands and BuildPane; the failed job's sentence in state, acts, grow_acts, job_toast, seam; the label; the no-place line). next: tests, the gates, the browser pass.
- done: the four command gates (one red test, Lane C's profile_regina) and the browser pass for items 1, 3 and 6 on ports 8794/5194/9394, servers stopped; item 4 by unit test (the store does not hand the sentence on yet). next: nothing, the report is written.
