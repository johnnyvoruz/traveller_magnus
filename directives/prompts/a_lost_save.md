# Agent A — a live defect: edits made while a save is in flight are lost

Issued 2026-10-08 by the orchestrator. **Do this the moment you reach a green point in
`a_characters_client.md`, before finishing it.** It is on the live site today and loses
a referee's typing.

## What happens (found by Agent D; its repro is `findings/lost_save_repro.mjs.txt`)

A person commits one change, then a second while the first save is travelling, then a
third. The second and third revert on screen and never reach the server, with the toast
"Saved changes conflicted with a newer copy. The server copy is now shown." Until the
third, the page sits on "Saving…". It is not specific to sheets: every record edit, link,
journal entry, settings and clock change rides the same queue. D lost 7 of 110 boxes
typing at 120 ms a box against a 20 ms local server; production is slower, so worse.

## Where (`apps/web/src/campaign/commit.ts`), as D read it; confirm before you change

1. **Nothing is sent after a send.** `scheduleFlush()` returns early while `sending`, and
   `flushCampaign()`'s `finally` only sets `pending`. A change queued during a request
   waits for another change or for the page to be hidden.
2. **The queued change keeps a stale `baseRev`.** It was built before the first save
   came back; the applied row bumps the stored `rev`, the queued row's `baseRev` is not
   moved, and `rememberBase()` hands the stale one on. The server rightly calls it a
   conflict and the handler replaces the local row with the server's.

## Fix

- When a row in `result.applied` has a change for the same id still queued (records,
  links, journal, and the settings and clock singles), that queued change's `baseRev`
  becomes the applied `rev`.
- In `finally`, after `sending = false`: if the queue has rows and no retry is pending,
  schedule the flush.
- Look for the same shape in your new `characters/` store and say whether it can occur
  there (it has no `baseRev`, but it has an unsent queue).

## Tests

Commit A, start the flush, commit B to the same record before it resolves, resolve:
a second request goes out carrying B with `baseRev` equal to A's applied `rev`; no
conflict; no toast; the store holds A and B. The same for a link, a journal entry, the
clock and the settings. Three changes in a row during one slow request. A real conflict
(another tab) still shows the server's copy and the toast.

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, pasted. Then go back to
`a_characters_client.md`. No git. Report this fix on its own, at once, so it can be
pushed alone.
