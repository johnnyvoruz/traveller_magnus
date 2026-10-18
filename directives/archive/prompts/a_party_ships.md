# Lane A — more than one ship per party: the browser's party logic

Issued 2026-10-14 by the orchestrator. You may be a fresh session with no memory. Read
`CLAUDE.md`, `directives/manifesto.md`, `directives/board.md`, `directives/lanes/A.md`,
`directives/contracts/b_party_ships.md` (all of it; "What A and D need" is your list),
then this file. No git but read-only, no deploy, no `rules/`.

## Johnny's words (2026-10-14)

"Let's do more than one ship per party." Ships move separately: each has its own track and
position, and each party member is aboard one ship or none.

## What is there now

Lane B changed the party to `vesselIds` (ordered; the first is the lead) and `aboard`
(member id to vessel id), and made the smallest edits so the browser compiles. Every
screen still works on the first ship only, and `withVessel` replaces the whole list with
one ship. This pass makes the logic hold several ships. Lane D's next pass draws them, so
**no `.vue` work here** beyond step 7.

## Do

1. **`workspace/party.ts`, the list.** Add these and give each one a test:
   - `partyVessels(party, records)`: the live vessels in list order.
   - `withVesselAdded(party, id)`: appends the ship. If it is the party's **first** ship,
     every member goes aboard it, which is how a party behaved until now. Later ships
     start with nobody aboard. At `CAMPAIGN_LIMITS.partyShips` it refuses with a
     sentence the screen can show.
   - `withVesselRemoved(party, id)`: removes the ship and every `aboard` entry naming it.
     Those members are then aboard no ship and stand at `party.anchor`.
   - `withLeadVessel(party, id)`: moves the ship to the front.
   - `withAboard(party, memberId, vesselId | null)`: puts a member aboard a ship, or
     aboard none.
   - `memberVessel(party, memberId)`: the ship a member is aboard, or null.
   - `withMember`: a new member goes aboard the lead ship when there is one.
     `withoutMember` also drops their `aboard` entry.
   - `isAboard` reads `aboard`, not the member's anchor.
   - `partyWords` names every ship.
   - Remove `withVessel` and move every caller onto the functions above.
2. **`workspace/party_where.ts`** (lent to you this pass): `shipsWhere(party, records,
   days)` returns each party ship's place (one `vesselWhere` per ship, in list order).
   `memberWhere` returns a member's ship's place, or `party.anchor` when they are aboard
   none. `partyWhere` stays "where the lead ship is", for every screen that asks "where
   are we".
3. **`map/vessel_marks.ts` and `map/campaign_layer.ts`:** one party marker per party
   ship, each at its own position, the lead one flagged, each carrying the names of the
   members aboard for a label. Data only: D wires the drawing in `MapView.vue` next.
   Keep today's single-marker output available until D's pass replaces its use, and say
   which function D should switch to.
4. **`campaign/track.ts`:** "where are we" follows the lead ship. Any helper that took
   "the party's ship" takes a vessel id instead.
5. **`campaign/journal.ts`:** a new entry's place still follows the lead ship. Leave a
   one-line comment saying so.
6. **`pack/plan.ts`:** the Player Pack lists every party ship, each with the members
   aboard it, and names the members aboard no ship separately.
7. **Callers in `.vue` files** (`workspace/PartyPanel.vue`, `views/OrbitView.vue` and any
   others that called `withVessel`): only the smallest edit so they compile and behave as
   today. For example, the panel's one-ship picker sets the lead with `withLeadVessel`
   after `withVesselAdded`. List every such edit in the report.

## Owned files (this pass)

`workspace/party.ts`, `workspace/party_where.ts`, `campaign/track.ts`,
`campaign/journal.ts`, `map/vessel_marks.ts`, `map/campaign_layer.ts`, `pack/plan.ts`,
the `.vue` callers for step 7's one-line edits only, tests under `tests/web/`,
`directives/reports/a_party_ships.md`.

**Do not touch:** `map/public_games.ts`, `map/MapRenderer.ts` and `views/MapView.vue`
(Lane D this turn), anything under `apps/api` or `packages/shared` (Lane B), the ten
parked truth-build files, `versionvideo/`, `tools/examples/`.

## Gates

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, pasted.

## Stop rule

Stop when the gates pass and the report is written. The report ends with a short table
for D: each new function, what it returns, and which screen should call it.

Write `directives/reports/a_party_ships.md` from `directives/reports/_TEMPLATE.md`. After
each meaningful step append one line under Progress: "done: X. next: Y."

## Progress

done: party list functions, places per ship, per-ship marks, lead-ship where and journal, Player Pack ships. next: gates and the report.
done: gates. npm test and check and the web build passed. API typecheck fails in Lane B's public files. next: the report.
