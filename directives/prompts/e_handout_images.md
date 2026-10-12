# Lane E — an image on a journal entry (handouts)

Issued 2026-10-11 by the orchestrator. You may be a fresh session with no memory. Read
`CLAUDE.md`, `directives/manifesto.md`, `directives/board.md`, `directives/lanes/E.md`,
then this file. No git but read-only, no deploy, no `rules/`, no Traveller rule from
memory. Your record-dates report is accepted; it goes out in version 1.1.6.

## Goal

Step 6 of your own Campaign order (`findings/campaign_gap_audit.md` §4, approved by
Johnny): "Handout images, using the existing upload. No new server route if the image
object path records already use is enough. Confirm that with B's image contract before
E stores an image id on an entry."

## Step 1: confirm before you build (write it at the top of the report)

Read how a record's image is uploaded, stored and shown today (`workspace/images.ts`,
`RecordAvatar.vue`, `RecordGallery.vue`, the upload route's section in
`directives/api.md` or the contract that covers it; name the file and section), and
the journal entry's schema in `packages/shared`. Answer:

- Can a journal entry hold image ids today, in a field the schema already has? Quote
  the field.
- Does the upload route accept an image that belongs to an entry and not a record
  (what it keys the object by, what it checks)?
- Who can fetch a stored image (the owner only, or anyone with the address)?

**If the schema has no field for it, or the upload is tied to a record id, stop
there**: write the exact field or route change you need from Lane B and report. Do
not store an image id in a text field or in a record made only to carry it.

## Step 2: if step 1 says it can be done with what exists

- On an entry of any kind (session, note, handout, rumor), "Add an image" in the
  entry page, in the same pattern and words as on a record: choose a file or drop
  one, the same size and type limits, the same progress and error sentences.
- Images show in the entry as a small gallery; choosing one opens the Lightbox (it
  holds focus now); Remove takes one out, with the house way of taking that back.
- The journal list shows the entry's first image as its row's avatar, as records do
  (a record's first image is its avatar: Johnny, 2026-10-11); the timeline row too.
- An entry marked for players shows its images to players when a player view exists;
  none exists yet, so say only what the stored visibility is.
- Nothing about the entry's date or the campaign clock changes.

## Copy

Every sentence follows the Google developer documentation style guide; reuse the
record page's words for the same acts.

## Owned files (this pass)

`apps/web/src/workspace/journal/`, `workspace/timeline.ts` and `TimelineList.vue` (the
row avatar), new small components beside them, and lent: `workspace/images.ts` only if
a helper there must take an entry as well as a record (say the lines). Tests in
`tests/web/`, shots `ke6_*`, `directives/reports/e_handout_images.md`. Not yours:
`campaign/` (Lane A), `packages/`, `apps/api` (Lane B), `workspace/build/`,
`workspace/market/`.

## Gates

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, pasted. Fourth gate:
a browser pass on your own ports and Vite cache, stopped after: add two images to a
handout by choosing and by dropping, reload, open one in the Lightbox by keyboard,
remove one and take it back, the list and timeline avatars, a file too large and a
file of the wrong type, column, half, full, 520 px.

## Stop rule

Stop after step 1 if it needs Lane B. Otherwise stop when step 2 works and the report
is written.

Write `directives/reports/e_handout_images.md` from `directives/reports/_TEMPLATE.md`.
Questions for Johnny written out in full, recommended answer first. After each
meaningful step append one line under Progress: "done: X. next: Y."

## Progress
