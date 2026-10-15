# Lane A party ships report
Prompt: prompts/a_party_ships.md
Status: done

Found: `withVessel` still replaced the whole list with one ship, and every place still followed that first ship.
Finished: the ordered ship list, who is aboard, a place per ship, the per-ship map data, and the Player Pack list.
Backed out: nothing.

## Changed files
- `apps/web/src/workspace/party.ts`: `partyVessels`, `withVesselAdded`, `withVesselRemoved`, `withLeadVessel`, `withAboard`, `memberVessel`. A new member boards the lead ship. `isAboard` reads `aboard`. `partyWords` names every live ship. `withVessel` is gone. `sameParty` compares the full list and the aboard map, so a second ship is saved.
- `apps/web/src/workspace/party_where.ts`: `shipsWhere` and `memberWhere`. `partyWhere` is still the lead ship.
- `apps/web/src/map/vessel_marks.ts`: `partyShipMarks`, one mark per party ship. `vesselsOnMap` still flags only the lead.
- `apps/web/src/map/campaign_layer.ts`: `partyShipLabels` for those marks. `resolvePartyHex` and the single drawn mark are unchanged.
- `apps/web/src/campaign/track.ts`: `whereIsVessel(vesselId, …)`. `whereAreWe` follows the lead ship.
- `apps/web/src/campaign/journal.ts`: a new entry's place follows the lead ship. One comment says so.
- `apps/web/src/pack/plan.ts`: every players ship, the players members aboard it, and the players members aboard no ship.
- `apps/web/src/pack/html.ts`: the Player Pack file renders that list. Not named in the prompt; the file is what a player reads.
- `apps/web/src/workspace/PartyPanel.vue`: see the screen edits below.
- `tests/web/workspace_party.test.js`, `workspace_party_where.test.js`, `vessel_marks.test.js`, `campaign_layer.test.js`, `campaign_track.test.js`, `campaign_place.test.js`, `campaign_journal.test.js`, `player_pack.test.js`: one test per new function, and the old `{ vesselId }` fixtures those functions no longer read.

## Screen edits
- `PartyPanel.vue` `picked`: `withVesselAdded`, then `withLeadVessel`. A refusal is shown and not saved. The sentence is "A party can have 20 ships."
- `PartyPanel.vue` `noShip`: `withVesselRemoved` of the lead ship.
- `PartyPanel.vue` `board`: `withAboard` onto the lead ship. It no longer writes the member's own anchor.
- `PartyPanel.vue` rows: the role names the ship that member is aboard.
- `OrbitView.vue`: no edit. It already reads `vesselIds[0]`.

## Gates
npm test:      pass (1731 tests, 1700 pass, 0 fail, 31 skipped)
npm run check: pass
typecheck:     fail
```
apps/api/src/routes/public_games.ts(69,40): error TS2339: Property 'id' does not exist on type 'Response | SessionUser'.
apps/api/src/universe/public_mark.ts(91,50): error TS2345: Argument of type 'CampaignEntry[]' is not assignable to parameter of type 'readonly JournalLike[]'.
```
fourth gate:   pass (`npm run build`). Web `vue-tsc` passed. `dist/assets/index-CeKzwQwy.js` 188.20 kB, gzip 63.70 kB.

## Contract published
none

## Needs from others
- Lane B: `npm run typecheck` fails in `apps/api/src/routes/public_games.ts` and `apps/api/src/universe/public_mark.ts`. Not this pass.
- Lane D: switch the party marker to `partyShipMarks`. `partyMarker` and `vesselsOnMap`'s `party` flag still describe the lead ship only. `drawCampaignLayer` still paints one mark.

## Questions for Johnny
none

## For D

| Function | Returns | Which screen calls it |
|---|---|---|
| `partyShipMarks` (`map/vessel_marks.ts`) | One mark per live party ship that has a place, in list order. `lead` on the first ship. `aboard` is the member names on that ship. `hexKey` and `inJump` follow `vesselWhere`. | The map. This replaces `partyMarker` and the `party` flag on `vesselsOnMap`. |
| `partyShipLabels` (`map/campaign_layer.ts`) | The same rows as label text: `"Far Margin · Voss"`, or the ship name alone. | The campaign layer, when it draws one tag per ship. The draw still paints `snapshot.party` once. |
| `shipsWhere` | `{ id, name, where }[]`, one `vesselWhere` per live party ship, in list order. | Any screen that places each ship. |
| `memberWhere` | That member's ship's place, or `party.anchor` when they are aboard none. | A member's place. Not a public mark. |
| `partyWhere` / `partyMarker` | The lead ship only. | "Where are we", until the map switches. |
| `partyVessels` | The live vessels, in list order. | A ship list. |
| `plan.party.ships` / `plan.party.ashore` | Players ships with who is aboard, and players members aboard no ship. | The Player Pack. Already rendered. |
