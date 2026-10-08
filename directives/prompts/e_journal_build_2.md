# Agent E — the journal's screens, second pass: five small things

Issued 2026-10-07 by the orchestrator. The journal's screens are **accepted**: the tab,
the list with its filter and search, the entry page, the four commands, the token chips
(a `<script>` stayed text), the pane addresses, built as designed and exercised on your
own API port, which is the right way. **They are held from the next push** only because
production would drop every entry until Agent B's table is deployed; they go live with
it.

## 1. A row never shows raw token text

In `kj_built_pane_full.png` the session's row reads "The courier reached
[[cr_e90c5bad-3539-4ea8-8af…". The row's body line shows what a reader would read: each
token replaced by its label; a token with no label by the record's name or the system's
name if it can be found, else left out; no brackets, no ids. One pure function, tested
(a record token, a hex token, one with no label, an unknown id, two in a row, a line
that is only a token). Search still searches the stored text, and also matches a label.

## 2. The entry starts where the list starts

In the same frame the entry's title sits about 95 px lower than the top of the list
beside it, with empty space above. Your mockup (`kj_pane_full.png`) has them level. Make
it so at half and full, and say what pushed it down.

## 3. The orbit view's Campaign control with a journal open

You found it and rightly did not touch `views/OrbitView.vue`: there, the Campaign control
treats an open journal as closed and opens the record list instead of closing. Fix it
with the least lines in that file (Agent D has finished there for now: re-read before
you edit, list your lines), using `shell/pane.ts`'s own test for "the campaign pane is
showing" rather than a second rule. A test beside the pane tests.

## 4. What was not exercised

In the browser, on your own API port: the Referee / Players switch (and that a handout
defaults to Players, and that either can be changed); the handout and rumour entries of
the "new" menu; Locate; Show in orbit; a 1,100 px window. Screenshots `kj_built2_*`.

## 5. Search at 2,000 entries, measured

Make 2,000 entries with bodies of a few hundred words in a test or in the browser, type
a five-letter word, and report the longest time one keystroke takes to filter and to
draw. If any is over 50 ms, say what you would do (a debounce, a word index in the
store, which would be Agent A's) and do nothing more in this step.

## Check

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, pasted. `campaign/`,
`orbit/`, `surface/`, `packages/`, `apps/api` are not yours; in `workspace/` only
`journal/` and your lines in `CampaignPanel.vue` (Agent D is building the character
sheet in `workspace/` now: re-read before every edit). No git. Stop and report.
