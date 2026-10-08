# Character MVP — closing the first turn (2026-10-08)

Every part is on disk: B's server, A's client, E's screens, D's sheet with its second
wiring against a stand-in. One sheet, one live channel, share by link, claim, presence
were seen working by E on a private API. What is left before the two pushes is small,
and each agent's part is below. Read `directives/character_mvp.md` if you are new.
Common rules: `directives/swarm_restart.md`. No git, no deploy, your own API port.

## Agent D — connect the sheet to the real store, and clear the build

1. `workspace/character_sheet.ts` line 11: the `@ts-expect-error` is unused now that the
   generated rules file has a `.d.ts`. Remove it. **The build is red for everyone until
   you do.**
2. Register Agent A's store behind `workspace/person_character.ts` (the one hookup file
   you described). A's signatures: `openCharacter(id)` (a handle: `character`, `role`,
   `fields`, `who`, `status`, `setField`, `focusField`, `close`), `characters`,
   `loadCharacters`, `createCharacter(name, from?)`, `bindSheet(handle)` giving
   `{ doc, editable, presence, change, enter, leave }` with `presence` as box to
   `{ name, tone }` where `tone` is a CSS variable name. If `bindSheet`'s shape and your
   component's differ, adapt in your hookup, not in `characters/`.
3. In the browser, two signed-in accounts (Agent E's way: two session rows on a copy of
   the local D1, sent as cookies; its notes are `findings/characters_screens.md`): on a
   person's page, "Make this a Character", type in three boxes, see them in the second
   account's Characters pane and the reverse, presence both ways, Detach and Undo,
   access removed. Screenshots `kc_live_*`.
4. The four gates green, pasted. Report.

## Agent B — the share link's address, and the push list

1. Agent E found the invite's `url` is written as `http://traveller.voyage/claim/…`.
   It must be `https` in production and must carry the origin the request came from in
   local use (the same rule the sign-in return address uses: read it and follow it),
   never a host built from a constant. A test for both.
2. **Write `findings/push/characters_server_files.txt`:** every file of the character
   server, one path a line, and nothing of the parked truth-build work (the hardening,
   `release_seal`, `TruthPreview.vue`). `tests/api/server.js`, `tests/api/session.js`
   and `scripts/dev_make_admin.js` carry edits from the parked step: say for each
   whether the character tests need those edits; if they do, say exactly which lines,
   and whether the file can be pushed whole without shipping anything parked.
   `apps/api/wrangler.toml` and `routes/` index files that hold lines of both: list the
   lines of each.
3. `RUN_API_TESTS=1` over the whole `tests/api` suite once, on your own port. Gates
   pasted. Report.

## Agent E — what was not clicked

In the browser on your own port: Duplicate, Make pregens (four), Revoke, "Make them the
owner", the account-menu item, and a keyboard pass through the list, the sheet's header
and the share panel with the focus ring visible. The share link shown after Agent B's
fix. `kch2_*`. Then `prompts/e_journal_build_2.md`. Gates pasted. Report.

## Agent A — back to the dragging

The lost-save fix is accepted and called for push on its own. The character client is
accepted. Resume `prompts/a_nav_drag.md` from where your audit left it (the readout's
`avoid` boxes and `holdAt` are in; every world and moon at the held arrival, the teal
wireframe ghost, laying against editing, the grab cursor and right-click are not). You
hold D's orbit files for it, as that prompt says.
