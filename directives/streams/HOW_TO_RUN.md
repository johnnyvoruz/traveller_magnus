# How to run stream mode (for Johnny and the orchestrator)

Written 2026-10-17, after the first day of streams (A, B, C, D, E, L, M, N and Z). Lanes read
`README.md` in this folder (the loop); this page is for whoever turns streams on and off.

**Stream mode is the default (Johnny, 2026-10-17 16:50).** Every lane runs on a stream; a one-off
prompt is the exception, for a single bounded job.

## What it is
A lane on a stream works a queue, item after item, without waiting for a prompt, a review or a
push. It claims the files it edits in `claims.md`, writes one entry per item to
`reports/<lane>_stream.md`, and turns anything that needs Johnny or a rule into a proposal or a
blocked entry instead of stopping. When its queue runs out it adds polish items it found in its
own area. Work piles up in the tree until Johnny asks for a push.

## Turn a lane into a stream (orchestrator)
1. **Queue:** write or refresh `streams/<X>.md`: an **Area** paragraph (which files and folders
   are the lane's, which are others' this turn), then `## Queue` with items `- [ ] <id> **title**`,
   each naming its source (a backlog step, a report, Johnny's words), the files and the check, then
   `## Found by me`. Put the most important item first; 4 to 10 items is a good start.
2. **Board:** set the lane's row to status `stream` and prompt `streams/<X>.md`.
3. **Lane file:** `lanes/<X>.md` must exist. For an extra lane (L, M, N, or a new letter), copy
   `lanes/L.md` and change the letter, the area and the port range (one range per lane: A to E and Z
   use their usual ports; L 57xx, M 58xx, N 59xx, C 62xx).
4. **Areas must not overlap** between lanes running at the same time. Where two lanes need one file
   (today: `CampaignPanel.vue`), say who goes first in both queues; the claims file does the rest.
5. Feed queues from `backlog_players_landing_trade.md` and `backlog_ux_industry_best.md`, from
   stream entries ("Found", proposals), and from the board's Queue.

## Start a lane (Johnny)
- A new session: paste the block in `lanes/START.md` with the lane's letter (or point it at `BOOT.md`;
  both send a "stream" row to its queue since 2026-10-17), then say **go**.
- A lane that is already open: say **go**; a lane in the middle of a prompt finishes it, files its
  report, and is told **go** again to move to its stream.

## While streams run
- **Johnny** says "<X> reported" now and then, or nothing at all; nothing waits on him unless a
  question is marked as holding something.
- **The orchestrator**, each turn: reads new entries in `reports/*_stream.md`; accepts or sends back;
  answers a proposal or a blocked item **under the item in the queue** (a lane mid-item won't see it:
  Johnny tells that lane "re-read <id>"); moves leftovers between queues; refills short queues; keeps
  `claims.md` from holding files for long (claim per item, release at its end); writes decisions to
  `decisions.md`.
- Questions for Johnny go in `questions_for_johnny.md` and the reply, numbered, recommended answer
  first. Johnny's answers go under the items they change.

## Stop a lane
- **"wrap up"** to the lane: it finishes the item in progress if its gates pass in about 15 minutes,
  otherwise backs it out; releases its claims; stops its servers; writes a wrap-up entry. Say it
  about 20 minutes before a session must end.
- The orchestrator then sets the row to `wrapped <time>` with the queue file marked resumable, and
  moves any item another lane needs now into that lane's queue (as "EN1" took N's leftovers).

## Resume later (any lane, including L, M and N)
1. The queue file is still there with its open `- [ ]` items. Refresh it: tick what other lanes have
   done since, strike what is no longer wanted, add new items at the top.
2. Set the board row back to `stream`.
3. Johnny boots the lane (`START.md` or `BOOT.md`) and says **go**. It reads the README and its queue and
   carries on from the first open item.

## Going back to one-off prompts
Set the row to `go` with a prompt path in `prompts/`. A lane on a prompt stops after its report; a
lane on a stream never does. Both can run at once; a prompt lane treats claimed files as taken.

## Before the next push
Streams leave a lot of work in the tree. The orchestrator rehearses one large push in a clean copy
(the integration sweep, `prompts/x_integration_sweep.md`, is a good first look), adds the release's
`changelog.ts` entry, and writes the push page as usual.
