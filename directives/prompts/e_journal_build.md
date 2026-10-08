# Agent E — build the journal's screens

Issued 2026-10-07 by the orchestrator. Your design (`findings/journal_design.md`, mockups
`kj_*`) is **accepted**: the Journal tab beside Records and Party, the list, "New session"
in one press, the entry page with its dates, place, Referee/Players switch and the
Mentioned rail's place kept. Build it as designed.

## What is on disk for you

- **The store (Agent A, accepted):** `campaign.journal`, and in `campaign/journal.ts`:
  `entriesNewestFirst(kind?)`, `entriesAtHex(hexKey)`, `entriesMentioning(target)`,
  `nextSessionNumber()`, `draftSession()`, `draftNote()`, `saveEntry(entry)`,
  `deleteEntry(id)`, `restoreEntry(id)`; `newEntryId()` in `campaign/commit.ts`.
  Read them; do not edit `campaign/`.
- **Two of those are being changed by A to match your design while you build**
  (`prompts/a_journal_3.md`): `entriesNewestFirst` becomes newest by `updatedAt`, as your
  design says (today it is by in-fiction date); `nextSessionNumber` will never reuse a
  number, deleted sessions included (your question 2, recommended answer). Call them as
  they are; the behaviour arrives under you. Do not work around either in the screen.
- **The server (Agent B):** the Durable Object's journal table is on disk in B's tree and
  not yet deployed. Your local API (`npm run dev:api`) runs that tree, so entries save
  locally. Production will drop them until B's step is pushed: do not test there.
- **The schema:** `CampaignEntry`, `CAMPAIGN_ENTRY_KINDS`, `mentionsOf` in
  `@voyage/shared`.

## Your two questions, as taken until Johnny says otherwise

1. **No title:** the row shows the first line of the body; "Untitled note" (or handout,
   or rumour) only when the body is empty too; a session with no title shows
   "Session 14".
2. **Session numbers:** never reused (above).

## Build

New files under `apps/web/src/workspace/journal/`, in the workspace's own patterns
(`list_state.ts`, `RecordPage.vue`, `EditableText.vue`, `WhereBlock.vue`, the Undo toast
in `actions.ts`): the tab's body, the list with its kind filter and search (a plain
filter over title and body is enough for this step: say how it behaves at 2,000
entries), the entry page, the two "new" actions, the token chips in the body
(`[[cr_…|label]]` and `[[hex:…|label]]` drawn as chips that open the record or the
system; anything else is plain text; no HTML is ever interpreted).

**Shared files, the least you need, lines listed in the report:**
`workspace/CampaignPanel.vue` (the third tab and its count), `shell/pane.ts` (the
addresses `panel=journal` and `panel=journal&entry=cj_…`, as the record addresses are
written, with tests beside the existing pane tests), the command palette's source for the
two "new" commands if the workspace registers commands there (command first: no control
without its command). Agent D owns `workspace/`: re-read each shared file before every
edit and change nothing else in it.

Not in this step, room kept as your design says: `@` to insert a token, images on
handouts, "Promote to job", players' notes and replies.

## Check

Tests for the list's rows (each kind, untitled, a session with no title), the filter and
search, the token chips (a record, a hex, an unknown id drawn as plain text, a `<script>`
in a body shown as text), the pane addresses. `npm test`, `npm run check`,
`npm run typecheck`, `npm run build`, pasted. In a browser, signed in locally, on the
real chart (`agent_d_brief.md` has the harness: read its "local harness" part): New
session at Regina with the clock set, type a body with one record token and one hex
token, see Saved, reload and find it; a note; delete and Undo; the filter; column, half,
full and 520 px; keyboard through the list and the entry; reduced motion. Screenshots
`kj_built_*` beside your mockups. The contrast pairs your design named go into
`tests/web/contrast.test.js` (Agent D has lines there: add yours in their own block).

`orbit/`, `views/OrbitView.vue`, `surface/`, `campaign/`, `packages/`, `apps/api` are not
yours. No git. Stop and report.
