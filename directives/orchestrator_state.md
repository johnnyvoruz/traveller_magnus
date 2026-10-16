# Orchestrator state — 2026-10-15 20:55 (written for the next orchestrator session)

Overwritten every turn. History: `handoff.md` (last section 288; read by offset, it is large).
`orchestrator_start_here.md` is the 2026-10-07 page and is stale. This file and
`board.md` are the state. Lane sessions D and Z were restarted at 19:30.

## Where the roadmap is
Live: **1.2.1 (`55fe998`), engine e1.2**, truth v10; 0017 and 0018 applied; six example
packages and twelve example games on production. **Called, not yet pushed (20:55): 1.2.2**,
103 paths: the storefront, the ship traffic display, the published overview, package covers
(0019), A's default art, the example covers (Z's Fix 1 accepted). Note
`findings/push/release_2026-10-15.md`; rehearsed green in this session's scratchpad `outer23`.

## Lanes
All free (A, B, C, D, E, Z). F retired: never assign or propose. Next prompts are in the
board's Queue (D: lime card and the featured row's heading; A: encoder export; B later:
`family=`/`author=`).

## Next turn
1. Verify the push: `git log origin/campaign -1` must show "1.2.2 the marketplace as a
   storefront…". Then: `d1_migrations` has 0019 (`wrangler d1 execute voyage --remote`),
   the live index is the new one and holds a storefront string (e.g. "Most imported"),
   `GET /api/public-games/overview?truthVersion=v10` signed out = 200 with
   `public, max-age=60`, a catalogue card carries `cover`.
2. Then give Johnny the `tools/examples/seed_production.mjs` cover commands (dry run first;
   read the script's usage before writing them).
3. Write D's follow-up prompt (lime public card; the featured heading) and A's encoder export.

## Versions
Each push list bumps `APP_VERSION` in `apps/web/src/version.ts` (1.2.1 live; 1.2.2 called and on disk) and the commit message starts with it. Engine version is 1.2.0 on disk, 1.1.0
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
