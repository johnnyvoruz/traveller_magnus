# Streams: lanes that never stop

Issued 2026-10-17 by the orchestrator, on Johnny's word: "the goal is maximum productivity where
agents can just be working full stop." A lane on a stream doesn't wait for a prompt, a review or a
push. It works its queue (`streams/<lane>.md`) from the top, item after item, until Johnny stops it.
Nothing here is pushed until the orchestrator reviews it; work piles up safely in the tree.

## The loop
1. **Take the first open item** in your queue (`- [ ]`). Mark it in progress: `- [~]`, with the time.
2. **Claim the files** you will edit: add one line per file to `directives/streams/claims.md`
   ("L 14:05 apps/web/src/orbit/OrbitHeader.vue"). Before claiming, read that file and the board:
   - if another lane claims the file, or the board names it in a lane's current prompt, **skip the
     item**: leave it `- [ ]`, add "(waiting on <file>, <lane>)" and take the next;
   - never edit a file you haven't claimed;
   - **claim only what this item edits, when you start it, and release it the moment the item is
     done** (added 2026-10-17 14:50: other lanes are queued behind long claims). If your item holds a
     file that another lane's queue names as "waiting on", finish that file's part first and release it.
3. **Do the item.** Everything in `CLAUDE.md` and the manifesto holds: no git but read-only, no
   deploy, no `rules/`, no Traveller rule from memory, tokens only, the one modal, the one toast.
4. **Gates, every item:** `npm test`, `npm run check`, `npm run typecheck`, `npm run build`, plus what
   the item names. A failure in a file another lane claims is noted, not fixed, and doesn't stop you.
5. **Shots** where the item changes what someone sees: before and after at 1600 and 390 (DPR 1),
   `findings/ui_design_shots/s<lane>_<item>_*`. Use your own ports (L 57xx, M 58xx, N 59xx) and your
   own state folder; stop every server you start.
6. **Write the item's entry** at the bottom of `directives/reports/<lane>_stream.md`:
   ```
   ## <item id> <title> — done | blocked | proposal
   Files: ...
   What changed: 2 to 6 bullets
   Gates: test n/n pass, check, typecheck, build
   Shots: ...
   Questions: none | numbered, recommended answer first
   ```
7. **Mark the item** `- [x]` (or `- [!]` blocked, `- [?]` proposal), **release your claims**, and
   **take the next item at once.** Don't wait for a review.

## When to stop and ask instead of building
- A Traveller rule, a stored-data change, a new server route, a migration, a new dependency, or a
  change to what an existing control does that the item doesn't name: write the entry as a
  **proposal** (what, why, the files, the size) and move on.
- Something can't be done as written: **blocked**, with the specific question; move on.

## When Johnny says "wrap up" (one-day lanes: L, M, N)
Don't start a new item. Finish the one in progress if it can pass its gates in about 15 minutes;
otherwise back it out of the tree (your own edits only), mark it `- [ ]` again with a note of where it
stood. Release every claim, stop every server, write the item's entry, and stop. Nothing half-done may
stay in the tree.

## When the queue runs out
Add your own items at the bottom, under "Found by me", from what you saw while working: defects,
rough edges, manifesto misses in your area. Mark each `(found)`. Work them like the rest, within your
area and the rules above. Never run out: a polish item in your area is always better than stopping.

## Your area
Each queue starts with the lane's area. Stay inside it. A good change outside it is a proposal.
