# Agent E — the screens around a Character: mine, shared with me, share by link, claim

Issued 2026-10-07 by the orchestrator. **This goes ahead of `e_journal_build_2.md`**,
which waits (the journal's screens stay held with it). Johnny: *"let's focus full speed
ahead on getting character MVP done in the fewest amount of turns as possible."*

## Read `directives/character_mvp.md` first. It is the contract.

Agent B builds the server, Agent A the browser's store (`apps/web/src/characters/`:
`store.ts`, `open.ts`, `share.ts`; its report ends with the signatures you call), Agent
D the sheet itself and its place on a person's page. **You build everything around the
sheet.** A and B are working this same turn: write to the spec's shapes and to A's
signatures as they land; where a function is not there yet, a thin stand-in in your own
folder that you delete when it is, listed in your report.

## Build: `apps/web/src/characters/screens/`, new, in the workspace's design language

No design round: the language is the campaign workspace's (the record list, the record
page, the Undo toast, `EditableText`), which your journal screens already speak.

1. **"Characters", a pane of its own** in the shell's one panel system, reachable with
   no campaign open and from the account menu and the command palette (`shell/pane.ts`:
   the addresses `panel=characters` and `panel=characters&character=ch_…`, with tests,
   as you did for the journal). Two groups: **Mine** and **Shared with me**, each row
   the name, the summary's first line, the owner for a shared one, and who is on it
   right now if the list knows. Empty states that say what a Character is in one
   sentence. Signed out: the sign-in card the workspace already has.
2. **New and duplicate.** "New character" (a name, then straight into the sheet).
   "Duplicate" on one of mine, and "Make pregens" (a number, 2 to 12: that many
   duplicates named with a suffix, listed together).
3. **One character open:** the header (the name, editable by the owner; the owner; the
   live status from A's handle, quietly; the others here as small named marks in their
   colours) and, under it, **Agent D's sheet component fed by A's adapter**. If D's
   component is not on disk when you reach this, mount a plain list of the first
   twenty boxes through the same adapter so the live path can be seen, and say so.
4. **Share.** For the owner: "Share by link" makes a link, shows it once with Copy, and
   says what it does (one person, edit access, 14 days); the links outstanding with
   Revoke; the people with access with Remove; "Make them the owner" behind a second
   press. For an editor: who else has access, read only.
5. **The claim page a link opens** (`/claim/…`, a route of its own): signed out, it says
   what this is and offers sign-in, and returns here after; signed in, one press claims
   it and opens the character; a used, expired or revoked link says so plainly.
6. Command first for every control; tokens only; the 2 px amber ring; reduced motion;
   contrast pairs for anything new, in their own block of `tests/web/contrast.test.js`.

## Check

Tests for the list's groups and rows, the pane addresses, the share panel's states, the
claim page's four states. `npm test`, `npm run check`, `npm run typecheck`,
`npm run build`, pasted. In the browser on **your own API port** (B's server on disk),
with two signed-in accounts in two browser profiles if the local sign-in allows two (say
how; if it cannot make a second account, say so and what you did instead): make a
character, share it, claim it in the other profile, type in a box in one and see it in
the other, see the other's presence, remove access and see the page close. Screenshots
`kch_*`. Column, half, full, 520 px.

Shared files, the least lines, listed: `shell/pane.ts`, `shell/PanelHost.vue`,
`router.ts` (Agent C has one dev route in it: re-read before editing), the account
menu. Not yours: `apps/api`, `packages/`, `characters/*.ts` outside `screens/`,
`workspace/` (Agent D is building the sheet there), `orbit/`. No git. Stop and report.
