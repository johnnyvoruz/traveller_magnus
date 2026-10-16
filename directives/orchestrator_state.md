# Orchestrator state — 2026-10-15 22:25 (written for the next orchestrator session)

Overwritten every turn. History: `handoff.md` (last section 291; read by offset, it is large).
`orchestrator_start_here.md` is the 2026-10-07 page and is stale. This file and
`board.md` are the state. Lane sessions D and Z were restarted at 19:30.

## Where the roadmap is
Live: **1.2.2 (`7b6f4e5`)**. **Called: 1.2.3** (`findings/push/release_2026-10-15b.md`, 37 paths: scroll fix, surface zoom, UWP tiles, seed guard). Held for 1.2.4: B's public course (ships with D's checkbox). Johnny has Z's cover-seed commands.

## Lanes
D go `d_store_2`; Z go `z_records_only` (answer at its foot); A, B, C, E free. F retired. Use the claude-in-chrome extension for live looks (Johnny's signed-in Chrome).

## Next turn
1. Verify 1.2.3 (`git log origin/campaign -1`, GitHub run, live index `index-CTGrh87X.js`), then in Chrome: /packages scrolls, a dossier's UWP tiles, the surface zoom.
2. After Johnny runs the cover seed: `GET /api/packages` cards carry `cover`; then delete `findings/examples/local_backup_pre_covers`.
3. Review D `d_store_2` and Z `z_records_only`. 1.2.4 = D's pass + B's held course paths (0020; read the code again) + Z's records-only if accepted.

## Versions
Each push list bumps `APP_VERSION` in `apps/web/src/version.ts` (1.2.2 live; 1.2.3 called; next 1.2.4) and the commit message starts with it. Engine version is 1.2.0 on disk, 1.1.0
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
