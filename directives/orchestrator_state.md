# Orchestrator state — 2026-10-17 22:45 (written for the next orchestrator session)

Overwritten every turn. History: `handoff.md` (sections 291 on; the next is 322) and
`archive/handoff_sections_1_to_290.md`. This file and `board.md` are the state; `decisions.md` holds every decision.
Use `date` for time labels (labels between 18:50 and 20:20 on 10-17 ran ~35 minutes ahead).

## Where the roadmap is
Live: **1.2.6 (`d6658f5`)**, engine e1.2, truth v10. **1.3.0 commands handed 2026-10-18 14:00** (`findings/push/release_2026-10-18.md`); confirm with `git log origin/campaign`, then lift the FREEZE lines.
Direction (Johnny, 10-17): players first (Epic P), the landing, trade first (Epic T), the UX backlog; then session
ingest (spec done; build after P2), living systems (chatter and traffic, building), X-boat news ripples (building),
your own table sets (designed; contract written). Public API paused except the session-ingest MCP.

**Epic P:** P1b, P1c done (A). B: contract done (P2a + B2c), leak suite skeleton (P2b1), data 0021 (P2b2), the DO
(P2b3) done; **P2b4, the Worker routes, is next**; done when all 35 leak cases pass and §3 of the review is re-read.
Then P3 (A), P9, P4 to P8, P10 (`players_build_plan.md`).

## Lanes
All on streams. A, B, C, D, E, Z running; L, M, N wrapped (resumable); F retired. Lane `X` (high effort, one prompt)
finished the city lights fix 22:30: the band was the lock glow in `OrbitRenderer.ts`, not the renderers; report in
`reports/done/x_city_lights_fix.md`. C may take the surface files again (CW1, CS9), not `OrbitRenderer.ts` `selection()`.

## Next turn
0. **2026-10-18: remind Johnny first thing** to run the example-pack production seed (board, "Open with Johnny";
   `reports/z_stream.md` Z10 has the commands and checks). Delete the memory `reminder-2026-10-18-seed.md` once done.
1. Questions 79 to 83 answered 22:40 (decisions.md): 80 done (spec rewritten), 81 queued as C's CS10 with Johnny's
   "up the glow, very sci-fi" folded in (G6 holds: glow inside the disc, X's pixel test untouched). Review CS10's shots
   with Johnny's eye; expect a second round on the look. Johnny has not yet said X's fix looks right on his screen.
2. Review stream entries; refill queues from the backlogs and the three specs (`spec_session_ingest.md`,
   `spec_living_systems.md`, `spec_xboat_ripples.md`; Johnny answered all their questions 20:27).
3. **Push 1.3.0 called (09:20).** Waiting on C CC1b and B SI1b; then re-run `clean_copy28.sh` (scratchpad), `test:api:all` on the tree (`generate_speed`, `builder_density` alone), finish `findings/push/release_2026-10-18.md` and hand Johnny: commit the staged cleanup first, then `git add --pathspec-from-file=findings/push/release_2026-10-18_files.txt` (rebuild the list after the cleanup commit or as is: staged-only paths are left out), commit, push; after deploy, `d1_migrations` shows 0021 to 0024; then the example seed (10-18 reminder).

## Versions
Each push bumps `APP_VERSION` in `apps/web/src/version.ts` (1.2.6 live; next 1.3.0); `CHANGELOG[0]` must equal it.

## Traps
- **Read `decisions.md` before deciding anything; do not re-decide.**
- **QUESTIONS, GO, PUSH.** No item released while a question could change it (HOLD in the queue). Questions in full,
  numbered, recommended answer first. Never ask Johnny to paste anything.
- **"Pushed" is checked** with `git log` and `git log origin/campaign`.
- **Read new server code before pushing**; every migration safe in either order.
- **Rules files:** edit only on Johnny's word, as a minimal insertion (a whole-file rewrite reformatted
  `mgt2e_space_travel.json` once on 10-17 and was restored).
- **`questions_for_johnny.md` holds only open questions:** add new ones after the open ones; move an answered one to `decisions.md`. Never replace the section wholesale (10-18 09:40 dropped 84 to 92; restored).
- **Never trade sharpness for speed** (half resolution was rejected and removed, DF6).
- **Never put backticks in a double-quoted shell string.** Directive edits by script files; heredocs with quotes
  have failed: write the script with the Write tool.
- `findings/` is git-ignored. Push lists from `git status --porcelain -z`; no `.wav`, no `versionvideo/`. Z2 shelved
  the parked truth-build files under `findings/parked/`.
- **Clean copy:** `clean_copyNN.sh` in the session scratchpad (last outer27).
- Local dev is `npm run dev` (state in `apps/api/.wrangler/dev`).
- Google developer style for all copy. Legacy polish is the bar.
