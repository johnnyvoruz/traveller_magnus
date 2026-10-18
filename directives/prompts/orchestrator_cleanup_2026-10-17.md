# Orchestrator task: clean the directives folder (2026-10-17)

Written by a review session for the orchestrator, on Johnny's word. This is a tidy-up, not new
product work. The goal: a fresh orchestrator or lane session reads only what is true today, and
old plans, old prompts and old state stop bleeding into context. **Nothing is deleted.** Stale files
move into `directives/archive/`; live files are rewritten to say only what is true now.

Do this in one sitting, in the order below. Lanes are working while you do it: the rules in
"Never touch" keep you out of their way. When finished, reply to Johnny in the ORCHESTRATOR.md
shape, with the move list and the CLAUDE.md changes written out in full for his review.

## Never touch
- `directives/streams/*`, `directives/streams/claims.md`, `directives/contracts/*`,
  `directives/lanes/*.md` (one exception in step 6), `directives/reports/<lane>_stream.md`,
  `directives/reports/x_integration_sweep.md`, `directives/reports/_TEMPLATE.md`.
- The lane table in `board.md`: every row stays word for word.
- Any prompt file named in `board.md`, in any `streams/*.md`, or in any `backlog_*.md`.
- Any report in `directives/reports/` (not `done/`).
- `rules/`, `js/`, `hex_map.html`, `style.css`, any file under `apps/`, `packages/`, `tests/`, `tools/`.
- Git, except `git status`, `git diff`, `git log`, `git show`. Johnny stages the moves; git records them as renames.
- Nothing in `directives/` is deleted. Not one file. A file you think is worthless still goes to `archive/`.
- Directive files are written with the Write tool. No backticks inside a double-quoted shell string.

## What is wrong today (verified 2026-10-17 by the review session)
- `handoff.md` is 585 KB and 298 sections. ORCHESTRATOR.md tells you to read it by offset; a cold session cannot.
- `orchestrator_state.md` says "Engine version is 1.2.0 on disk, 1.1.0 live." False: `git show d6658f5:packages/engines/package.json` is 1.2.0, so e1.2 is live, as the board's own header says.
- `board.md` carries dead sections: "Engine 1.2.0 (every lane, 2026-10-13)" says the patch is "not pushed"; "Naming" says pushes stay 1.1.N until the marketplace push (we are at 1.2.6); "Pending push" describes 1.2.2; two "Shared files this turn" sections and "Shared files, example packages" are from 2026-10-14 and `claims.md` replaced them; "Known, not fixed" lists items marked fixed on disk that are now live; the Queue says "After 1.1.12: Johnny rebuilds v10" while the header says truth v10 is live. "Decisions from Johnny" is 277 lines of ledger that is not board state.
- `README.md` was last true on 2026-10-05: it names `orchestrator_start_here.md` as current, knows nothing of `BOOT.md`, `ORCHESTRATOR.md`, `board.md`, `orchestrator_state.md`, `lanes/`, `streams/`, `prompts/`, `reports/`, `contracts/` or the two backlogs, and lists `planet_rendering.md` as both current and legacy.
- Five orientation files describe a workflow that no longer exists (Johnny pasting reports between sessions, Agents A to F, recipes): `orchestrator_start_here.md`, `orchestrator_handoff_2026-10-09.md`, `swarm_restart.md`, `agent_d_brief.md`, `implementer_brief.md`. `update_version.md` is the legacy app's procedure.
- `CLAUDE.md` still says the reading order is manifesto, plan, handoff; still describes implementer sessions executing recipes with Johnny relaying; still says the legacy tree "is deleted at milestone M2".
- `questions_for_johnny.md` is 41 KB, 58 answered questions, and a header from 2026-10-04 saying "Six are open".
- `prompts/` holds 237 files; 158 have a report in `reports/done/`; 50 have no report anywhere, 17 of those from 2026-10-07 or earlier.

## Step 1. Make the archive
Create `directives/archive/` with `archive/prompts/`, `archive/reports/`, `archive/legacy/`.
Write `directives/archive/README.md` (ten lines): what the folder is (history, never read at
session start, searched only when a live file cites it), the date, and that nothing in it is
deleted or edited.

## Step 2. Archive the completed prompts and reviewed reports
Move with plain file moves (`mv`), never git.
1. Every file in `directives/reports/done/` moves to `directives/archive/reports/`.
2. Every file in `directives/prompts/` that has a same-named file now in `archive/reports/`
   moves to `directives/archive/prompts/`.
3. Every file in `directives/prompts/` with no report anywhere and a modification date before
   2026-10-10 also moves to `archive/prompts/` (these are from the pre-file-bus era).
4. A prompt named in `board.md`, any `streams/*.md` or any `backlog_*.md` never moves, whatever
   steps 2 and 3 say. Check with `grep -l <name> directives/board.md directives/streams/*.md directives/backlog_*.md` before each move.
5. Leave `reports/done/` in place, empty. BOOT.md and ORCHESTRATOR.md still name it.
Check: `ls directives/prompts | wc -l` is far below 237; every remaining prompt is either on the board, in a stream, in a backlog, or dated 2026-10-10 or later with no report yet. List those last ones in your report as "prompts with no report, kept".

## Step 3. Shrink handoff.md
1. Copy `directives/handoff.md` whole to `directives/archive/handoff_sections_1_to_290.md`. Do not edit the copy.
2. Rewrite `directives/handoff.md` to hold: a four-line header (what this file is, that sections 1 to 290 are in the archive copy, that you append one section per turn, that `orchestrator_state.md` and `board.md` are the state), then sections 291 to 297 copied exactly as they are. Section numbering continues at 298.
3. Fix the header's claim "New orchestrator session: read orchestrator_start_here.md first": that file is archived in step 5; point to `ORCHESTRATOR.md` instead.
Check: `wc -c directives/handoff.md` is under 40 KB; `grep -c '^## ' directives/handoff.md` is 7.

## Step 4. Split the board into state and ledger
1. Create `directives/decisions.md`: a dated ledger, newest first, with two parts: "Decisions from Johnny" and "Decided by the orchestrator". Move into it, unchanged in wording, every line now under the board's "Decisions from Johnny", "Open with Johnny" (as answered decisions), "Johnny, 2026-10-17 15:20: a public API and MCP server are PAUSED", and the six "Decided by the orchestrator" sections. Also move into it every **answered** question from `questions_for_johnny.md` (question and Answer line together, under its date).
2. Rewrite `questions_for_johnny.md` to hold only the open questions (currently: whatever still has no Answer line; the board says nothing is open with Johnny, so the file may be a header and "none"). Keep its one-line instruction to Johnny on how to answer.
3. Rewrite `board.md` so it holds only: the header (last push, version, truth, deploy-on-push rule), the lane table word for word, "Restarting a frozen lane", the Naming rule (e1.2 written, 1.2.0 in code; drop the sentence about 1.1.N and the marketplace push), "Contracts", "Direction (Johnny, 2026-10-10)" refreshed to today's direction (players first, landing page now, trade first; API and MCP paused; cite `decisions.md` for the words), a "Known, not fixed" list with only items that are still unfixed on the live site, "Open with Johnny", and the Queue with its stale lines removed (the 1.1.12 line, anything already on a stream). Remove: "Engine 1.2.0 (every lane, 2026-10-13)", "Shared files this turn" (both), "Shared files, example packages", "Pending push" (replace with one line: "none called; next is 1.2.7, see orchestrator_state.md"). `claims.md` is the shared-file mechanism now; say so in one line.
Check: `wc -c directives/board.md` is under 12 KB; the lane table diff against the old board is empty (`git diff directives/board.md` shows no change inside the table rows).

## Step 5. Archive the stale orientation files
Move to `directives/archive/`: `orchestrator_start_here.md`, `orchestrator_handoff_2026-10-09.md`, `swarm_restart.md`, `agent_d_brief.md`, `implementer_brief.md`.
Move to `directives/archive/legacy/`: `update_version.md`, `bugfix_pass.md`, `fog_of_war_field_tags.md`, `html_extract_manifest.md`, `project_manifest.md`, `route_extend_spec.md`, `route_file_spec.md`, `route_partial_spec.md`.
Completed recipes: for each of `slice_0_foundation.md`, `slice_1_viewer.md`, `slice_2_campaign.md`, `recipe_planet_surfaces.md`, `plan_planet_surfaces.md`, `character_mvp.md`, `campaign_manager_plan.md`, `persistence_v2.md`: if `grep -l <filename> directives/board.md directives/streams/*.md directives/backlog_*.md directives/contracts/*.md directives/prompts/*.md` finds nothing live, move it to `archive/`; otherwise keep it and add one line at its top: "Status 2026-10-17: completed recipe, kept because <file> cites it. History, not a plan." Keep `plan_engine_corrections.md` (parked, cited by the Queue) with the same kind of status line.
Keep in place, untouched: `manifesto.md`, `plan.md`, `architecture.md`, `data_model.md`, `api.md`, `design_reference.md`, `feature_inventory.md`, `legacy_map_inventory.md`, `planet_rendering.md`, the two backlogs, `BOOT.md`, `ORCHESTRATOR.md`, `orchestrator_state.md`.
Then fix every reference: `grep -rn` each moved filename across `directives/*.md`, `directives/lanes/`, `directives/streams/`, `directives/backlog_*.md`, `directives/contracts/`, `CLAUDE.md`. In a live file, change the path to `directives/archive/...`. Inside archived files, change nothing.

## Step 6. Bring the orientation files up to date
1. `README.md`: rewrite the tables. Part one, "Read first": `BOOT.md` (lanes), `ORCHESTRATOR.md` (orchestrator), `orchestrator_state.md`, `board.md`, `decisions.md`, `questions_for_johnny.md`. Part two, "The file bus": `lanes/`, `streams/` (and `claims.md`), `prompts/`, `reports/` (and `done/`), `contracts/`, the two backlogs, `handoff.md`. Part three, "Specs": manifesto, plan, architecture, data_model, api, design_reference, feature_inventory, legacy_map_inventory, planet_rendering, plan_engine_corrections and whichever recipes stayed. Part four, one line: `archive/` is history. Keep the Principles section; add "Do not delete a directive; move it to archive/ and say so in the report."
2. `orchestrator_state.md`: fix "Versions" to "Engine e1.2 (1.2.0 in code) is live since 1.2.0; the app is 1.2.6, next 1.2.7." Add to Traps: "Read `decisions.md` before deciding anything; do not re-decide." Update the History line to name the archive copy of handoff.
3. `ORCHESTRATOR.md`: step 4 reads "the last sections of handoff.md" (it is short now); add `decisions.md` to the reading list after board.md; the last line about stale files now says "everything under archive/ is history".
4. `BOOT.md`, one line only, step 2: "reports/, reports/done/ or archive/reports/" where it checks for an existing report. This is the one edit to anything lanes read on "go"; make it and nothing else there. `lanes/START.md` carries the same sentence six times: make the same one-word change in each copy and nothing else.
5. `plan.md`: do not rewrite. Add a dated note under the title: "Status 2026-10-17: slices 0 to 2 built and live, slice 3 (campaign) largely built, slice 4 (sharing) is the marketplace and public games, live. Current direction and the next work: `orchestrator_state.md`, `board.md`, the two `backlog_*.md`. The milestone table in §5 is the 2026-10-02 plan, kept for history."

## Step 7. CLAUDE.md
Edit `CLAUDE.md` and list every change in your reply, line by line, so Johnny reviews it before staging:
- "Start every session by reading": lanes read `directives/BOOT.md`; the orchestrator reads `directives/ORCHESTRATOR.md`; both then follow what those files say. Remove the manifesto, plan, handoff chain and the sentence that README and the handoff repeat it.
- "Roles and protocol": Johnny unchanged. Orchestrator: writes lane prompts and stream queues as files in `directives/`, reviews reports against the tree, keeps `board.md`, `orchestrator_state.md`, `decisions.md` and `handoff.md` true. Lanes (A to E, L, M, N on prompts or streams; Z heavy-effort; F retired): read their prompt or queue from files, claim files in `streams/claims.md`, report to files, never to chat. Johnny says "go" and nothing is pasted. Replace "recipe" and "implementer" wording accordingly; keep the "Done means" sentence with today's four gates (test, check, typecheck, build).
- "It is deleted at milestone M2": the Builder is live and the legacy tree still exists. Do not decide this. Change the sentence to "Its removal is Johnny's call (question in `questions_for_johnny.md`)" and add that question to the file, recommended answer first.
- Everything under "Critical rules", "Commands", "Layout", "Determinism" and "Legacy notes" stays unless a path you moved appears there.

## Step 8. Report
Run `npm run check` (it reads only `apps/*/src` and `packages/*/src`; it must stay clean, proving you touched no code). Then reply in the ORCHESTRATOR.md shape. QUESTIONS: the legacy-tree question, and anything you could not classify. PUSH: none; instead a "STAGE" list: every path created, moved (old path, new path) and edited, so Johnny can `git add` them in one go. Board: one line per lane, unchanged, plus one for Johnny. Append handoff §298 describing this cleanup.

## Progress
done: steps 1 to 8 (orchestrator, 2026-10-17 ~16:10): archive made, 379 prompt and report moves plus 20 orientation, recipe and legacy files; handoff 17.7 KB, 7 sections before §298; decisions.md; questions open only; board 6.9 KB, lane table unchanged; README, BOOT (one line), START (six copies), ORCHESTRATOR, state, plan note; CLAUDE.md; npm run check clean. Stage list findings/push/cleanup_2026-10-17_files.txt. next: Johnny stages.
