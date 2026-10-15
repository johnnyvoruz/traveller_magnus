Found: the party panel's ship list was half written, and it called resolveAnchor without importing it. Public on the journal and the name switch were not started.
Finished: the ship list, the Public choice and list mark, the name switch, the tests, the gates, and the shots.
Backed out: nothing.

# E party_panel_public_journal report
Prompt: prompts/e_party_panel_public_journal.md
Status: done

## Changed files
- `apps/web/src/workspace/PartyPanel.vue`: the party's ships in order, the lead marked, add (withVesselAdded only), remove, and make lead. At 20 the add shows "A party can have 20 ships." and saves nothing. Each member has an Aboard choice, including No ship, and someone aboard no ship is shown where the party stands. Removing a ship that has people aboard names them before the save. The rows wrap at 390 px.
- `apps/web/src/workspace/journal/EntryPage.vue`: Public after Referee and Players, with "Shown on your ships' public cards when this game is public."
- `apps/web/src/workspace/journal/list.ts`: a row face records whether the entry is public.
- `apps/web/src/workspace/journal/JournalList.vue`: a Public mark on those rows.
- `apps/web/src/workspace/public_games.ts`: showRefereeOf and setShowReferee. setPublicGames still sends `{ public }` only.
- `apps/web/src/workspace/AccountMenu.vue`: "Show my name on public cards", only while public is on and showReferee is a boolean. Default off.
- `tests/web/party_panel_public_e.test.js`: the panel wiring, the Public mark, and the name switch's body.
- `findings/ui_design_shots/kb22_party_panel_1600.png`, `kb22_party_panel_390.png`, `kb22_party_panel_journal.png`, `kb22_party_panel_account_on.png`, `kb22_party_panel_account_off.png`, `kb22_party_panel_account_before_0018.png`.

## Gates
npm test: pass. 1753 tests, 1721 pass, 0 fail, 32 skipped.
npm run check: pass. manifesto: clean.
typecheck: pass. tsc --noEmit -p apps/api.
npm run build: pass. vue-tsc -b and vite build, 673 modules.

Browser, isolated Chrome, Vite on 127.0.0.1:5206 with its own cache. The server was stopped and the lane config removed.
- 1600 px: Bright Ledger (lead), Paper Kite, and Cold Manifest. Mael Dorr aboard Bright Ledger, Idra Solm aboard Paper Kite, Vess Okun aboard no ship and shown at Regina system, Spinward Marches 1910. Removing Paper Kite said "Idra Solm will be left aboard no ship." Keep it left the ship in place.
- 390 px: the phone sheet. The aboard choice stays inside the card. Full sheet shows the three ships and the three members.
- Journal: Public is the third choice and the line under it is the one above. Choosing Players and then Public sent a journal write with visibility public. The campaign read and the changes call sent `X-Voyage-Journal: public`. The list shows a Public mark on "The Regina lien".
- Account: public on shows the name switch off. Turning it on sends `{ public: true, showReferee: true }`. Public off hides the name switch. A universe with neither publicGames nor showReferee shows neither switch.

## Contract published
none

## Needs from others
Lane B's report for prompts/b_public_card.md is still the first pass. Fix 1 is in the working tree: campaign/store.ts and commit.ts send the journal header. This pass did not run the worker. The screen was checked against a mocked campaign read that returns public, and the browser did send the header.

## Questions for Johnny
none
