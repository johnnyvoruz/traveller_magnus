# Lane E — the party panel for several ships, Public journal entries, "show my name"

Issued 2026-10-14 by the orchestrator. You may be a fresh session with no memory. Read
`CLAUDE.md`, `directives/manifesto.md`, `directives/board.md`, `directives/lanes/E.md`,
`directives/contracts/b_party_ships.md` (all of it, including "The public card"),
`directives/reports/a_party_ships.md`, then this file. No git but read-only, no deploy,
no `rules/`.

## Johnny's words (2026-10-14)

- "Let's do more than one ship per party." Ships move separately; each member is aboard
  one ship or none.
- A referee can mark a journal entry "Public" so it shows on that game's public card.
- "Let the ref account determine what's published, either the name only or name and ref
  name."
- App copy follows developers.google.com/style. The bar for the look is the legacy app.

## Do

1. **The party panel** (`workspace/PartyPanel.vue`, lent to you from D this pass), on A's
   functions in `workspace/party.ts`:
   - A list of the party's ships in order, the lead first and marked as the lead.
   - Add a ship (the existing vessel picker, then `withVesselAdded`), remove one
     (`withVesselRemoved`), make one the lead (`withLeadVessel`). At 20 the add shows
     A's sentence and saves nothing.
   - Each member row has an "Aboard" choice: one of the party's ships, or "No ship"
     (`withAboard`). A member aboard no ship shows where the party stands.
   - Removing a ship with people aboard says, before it saves, who will be left aboard no
     ship. A plain delete, no undo (Johnny's standing rule).
   - It works at 390 px in the phone bottom sheet.
2. **Public journal entries** (`workspace/journal/`, yours): the visibility switch gets a
   third choice, "Public", after "Referee" and "Players", with one short line under it:
   "Shown on your ships' public cards when this game is public." Entries marked Public
   carry a small mark in the journal list.
   - **Lane B is adding, this same turn, the header that makes the server return `public`
     to this bundle** (`prompts/b_public_card.md`, Fix 1; the header is
     `X-Voyage-Journal: public`, sent from `campaign/store.ts` and `commit.ts`). Until it
     lands, a public entry reads back as `players`. Build the screen anyway; do the
     browser check of this item only once B's report is in. If it is not in when
     everything else is done, say so and stop.
3. **"Show my name"** beside the public games switch (`workspace/AccountMenu.vue` and
   `workspace/public_games.ts`, lent to you): a second switch, shown only while public
   is on: "Show my name on public cards". It sends
   `PATCH /api/universes/:id/public-games` with `{ public, showReferee }` and reads
   `showReferee` from the universe. When the field is absent (a server before 0018),
   the switch is not shown. Default off.

## Owned files (this pass)

`workspace/PartyPanel.vue` (lent), `workspace/journal/`, `workspace/AccountMenu.vue`
(lent, the public games section only), `workspace/public_games.ts` (lent),
`design/tokens.css` (your own lines), tests under `tests/web/`, shots
`findings/ui_design_shots/kb22_party_panel_*`,
`directives/reports/e_party_panel_public_journal.md`.

**Do not touch:** `workspace/party.ts` and `party_where.ts` (A's; if a function is
missing, write it under "Needs from others"); `campaign/` (Lane B this turn);
`views/MapView.vue`, `map/`, `workspace/PublicShipCard.vue` (Lane D); `apps/api`,
`packages/shared` (B); `tools/examples/` and Z's three files; the ten parked truth-build
files; `versionvideo/`.

## Gates

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, pasted. **Browser:**
the panel with three ships and members aboard different ships, at 1600 and 390 px; the
journal switch with Public; the account menu with public on and off, and on a server
without 0018. Start Vite with its own cache directory; stop every server after.

## Stop rule

Stop when the gates pass and the report is written.

Write `directives/reports/e_party_panel_public_journal.md` from
`directives/reports/_TEMPLATE.md`. After each meaningful step append one line under
Progress: "done: X. next: Y."

## Progress

done: the prompt is new and the party panel still shows one ship. next: the ship list, then Public and the name switch.
done: the ship list, Public on the journal, and the name switch are in the screens. next: the tests, then the gates and the browser.
done: tests and the four gates passed, and the browser shots are in. next: the report.
