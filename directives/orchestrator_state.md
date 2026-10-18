# Orchestrator state — 2026-10-17 15:25 (written for the next orchestrator session)

Overwritten every turn. History: `handoff.md` (sections 291 on; the next is 298) and
`archive/handoff_sections_1_to_290.md` (history). This file and `board.md` are the state;
`decisions.md` holds every decision.

## Where the roadmap is
Live: **1.2.6 (`d6658f5`)**, index `index-CF1BRS3K.js`. **No push for a while (Johnny, 14:00):** "the goal is maximum productivity where agents can just be working full stop." Work piles up in the tree; the next push is a big one, rehearsed with care (the changelog needs a 1.2.7 entry, `CHANGELOG[0]` is tested against APP_VERSION).

## Lanes
- **Streams** (`directives/streams/`, README = the loop; `claims.md` = file locks): L, M, N, today only. They never stop; entries land in `reports/<lane>_stream.md`. Review those entries by item; nothing to say "go" to.
- Streams also: D, E, Z (Z1 = `z_install_reservation`). Prompts: A `a_encoder_merge`, B `b_universes_pin`. C free. F retired. All started 14:15.

## Next turn
- Stream mode on and off: `streams/HOW_TO_RUN.md`. L, M, N wrapped with resumable queues.
- Before the next push: rerun `public_games.test.js` ("tracks at the hex tier") on the settled tree; it failed in M's run while L5 changed the grid. Review `reports/x_integration_sweep.md`.
0. The two backlogs (`directives/backlog_*.md`) are the source for new work: issue from them into streams; Epic P's build (P2+) waits on Johnny's P questions and B2's contract review.
1. Read new entries in `reports/l_stream.md`, `m_stream.md`, `n_stream.md`; answer proposals and blocked items in their queues (write the answer under the item).
2. Review D `d_store_harden` (steady.log, kb30_filters.gif, the manifesto table, the look) when filed.
3. When A or B reports: put it on a stream too (areas: A builder/characters logic; B the Worker outside the marketplace).
4. Before the next push: a full clean-copy rehearsal of everything (many lanes' work), `test:api:all` once B has it, and the 1.2.7 changelog entry.

## Versions
Each push list bumps `APP_VERSION` in `apps/web/src/version.ts` (1.2.6 live; next 1.2.7) and the commit message starts with it. Engine e1.2 (1.2.0 in code) is live since 1.2.0; the app is 1.2.6, next 1.2.7.

## Traps
- **Read `decisions.md` before deciding anything; do not re-decide.**
- **Flow: QUESTIONS, GO, PUSH.** No GO for a lane while a question could change its
  prompt; a held part is named inside the prompt. Questions in full, numbered,
  recommended answer first. Never ask Johnny to paste anything.
- **"Pushed" is checked** with `git log` and `git log origin/campaign` before a hash
  is recorded. **Push before go**: lanes keep editing after a list is checked.
- **Read new server code before pushing**: per-request reads and dependence on
  migration order are deploy hazards. Every migration must be safe either order.
- **Lane Z works outside the file bus** and has applied a patch to the tree unasked.
  `ls -lt findings | head` and `git status` each turn. A checklist in a Z report is
  Z's, not Johnny's: check it against the other lanes' reports before following it.
- **Never put backticks in a double-quoted shell string.** It happened again on
  2026-10-13 (a `node -e "..."` holding markdown): the shell ran each quoted name,
  including `npm run deploy:ci\`, which failed only because of the stray backslash.
  Directive files are written with the Write tool or a script file, never inline.
- A live fault: look at the live site first (`curl` is enough for a route). Sector
  slug `Spinward_Marches`.
- `findings/` is git-ignored: never in a push list. Push notes live there anyway.
- **Clean copy:** `scratchpad/clean_copy.sh` in this session's scratchpad does it all (last: outer16); `outerN/node_modules` =
  junction to the repo's; `clean` = `git archive HEAD` + push paths; junctions
  `clean/node_modules/@voyage/{engines,generation,shared}` -> `clean/packages/*`,
  `api` -> `clean/apps/api`; `gen_rules_esm.js`, `gen_names_esm.js`, `node --test
  "tests/**/*.test.js"`, `check_manifesto.js`. Known: one zod failure in
  `tests/web/campaign_import.test.js` ("a bad document is refused").
- Always out of pushes: the ten parked truth-build paths (named in
  `prompts/c_liquid_minimal_review.md` question 2), except the cap's hunks in
  `routes/admin.ts`. The six engine paths are no longer held: 1.2.0 replaces them.
- "All reported" and "frozen" are checked against `reports/`, Progress lines, file
  times (`find ... -newermt`). Read "Needs from others" before writing the next prompt.
- Undo is low priority. Google developer style for all copy. Legacy polish is the bar.
- Prompts with the Write tool; scripts as files; `date` for time stamps; never print
  golden assertion output; rules questions from `rules/` with citations only.
