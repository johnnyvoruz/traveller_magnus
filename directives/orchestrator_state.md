# Orchestrator state — 2026-10-14 19:55 (written for the next orchestrator session)

Overwritten every turn. History: `handoff.md` (last section 282; read by offset, it is large).
`orchestrator_start_here.md` is the 2026-10-07 page and is stale. This file and
`board.md` are the state.

## Where the roadmap is
Live and deployed: **1.2.0 (`20fc3c8`), engine e1.2**, HEAD and origin. Truth v10 live
(released 2026-10-14). **On disk, unpushed, gates
green at 20:45:** public games (server, feed), the first-visit fixes, the dossier codes,
and **engine 1.2.0** (Lane Z's water and ice patch, applied by Z at 20:11 before C's
review came back). **This leg:** 1.1.12 with all of it once Z's fix is in; then Johnny
rebuilds, uploads and releases truth v10.

## Lanes (2026-10-13 21:50)
All free. F is retired: never assign or propose.

## Naming
Engine versions are **e1.2** to Johnny and in prose (his word, 2026-10-14); app versions 1.1.N.
Code and fixture paths keep `1.2.0`. **App 1.2.0 = the push that finishes the marketplace**
(Z phase 4); pushes before it stay 1.1.N.

## Next turn
1. Check push 1.2.1: origin, live index `index-UTD7M5x3.js`, signed-out `GET /api/public-games?truthVersion=v10&sector=Spinward_Marches` is 200 (0018 applied).
2. Give Johnny the package copy, then the example games seed (tools/examples/README.md, `--production`, dry run first, then `--apply`). Check the catalogue and the map signed out after each.
3. Go B `b_public_overview` and D `d_public_overview_map` (overview, phone tap, stacks). Later: Party tab on one ship.

## Versions
Each push list bumps `APP_VERSION` in `apps/web/src/version.ts` (1.2.1 on disk, not pushed) and the commit message starts with it. Engine version is 1.2.0 on disk, 1.1.0
live.

## Traps
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
