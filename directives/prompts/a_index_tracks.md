# Agent A — the campaign index follows a ship's track

Issued 2026-10-06 by the orchestrator. `reactionFuelTons`, the empty-track rule and the
`VOYAGE_TRUTH_API` proxy are accepted as built.

## Why

A vessel's track now says where the ship is at a date, and Agent D is making the Party tab
and the party's marker read it (`whereAreWe`). The campaign index does not: `campaign/index.ts`
resolves every record through `locate`, which follows anchors only. So after a jump to Feri
the Party tab will say Feri while "Your records here", the people aboard, and the omnibox's
"At Regina" still say Regina. The manifesto: if two things are related, the relation shows
on both pages.

## Build, in `apps/web/src/campaign/` (and `packages/shared` only if step 1 needs it)

1. **One answer to "where is this record at this date".** A pure function (name it; say
   where it lives) that walks a record's anchors exactly as `locate` does (depth 8,
   cycle-safe), with one difference: when the walk reaches a vessel that has a track and a
   date is given, the vessel's place is `positionAt(track, days)`:
   - an anchor: carry on from that anchor (a system anchor is the place; a record anchor
     walks on);
   - a fix on a **flight**: in the system of the leg, at no body;
   - a fix on a **jump**: at no hex; the answer says it is in jump, with the leg's two ends
     and its arrival;
   - **before the first departure: the vessel's own anchor.**
   With no date given, tracks are not consulted and the answer is `locate`'s.
   **No second copy of the chain walk.** If `locate` must take a hook to do this, add the
   hook in `packages/shared` with its test, and keep `locate`'s present behaviour and tests
   for callers that pass none.
2. **`whereAreWe` agrees with it:** before the first departure it answers the vessel's
   anchor, not null. Its other answers are unchanged.
3. **The index uses it.** `rebuildCampaignIndex` takes the campaign date (`campaign.clock`'s
   days, or none when the campaign has no date) and fills `byHex` and `byBody` from the
   function of step 1. A record in jump is in neither. Every caller passes the date; a
   change of the campaign date rebuilds the index (it is rebuilt on every change today;
   check that the clock's path does too, and say what you found).
   `recordsAtHex` and `recordsAtBody` keep their signatures.
4. Read `apps/web/src/workspace/party_where.ts` (Agent D's, new, in flight). **Do not edit
   it.** If its answers for "no campaign date" or "the track has not begun" differ from
   steps 1 and 2, say exactly how in your report.

## Tests

A person aboard a vessel whose anchor is Regina and whose track has jumped to another system:
found at the anchor's hex before the first departure, in the departure system at no body
mid-flight, at no hex mid-jump, at the destination's hex and body after arrival; moving the
campaign date moves them; with no campaign date they are at the anchor; an emptied track is
the anchor; a cycle of "aboard" anchors ends; `locate`'s own tests untouched and green.

`npm test`, `npm run check`, `npm run build` green, pasted.

Do not touch `workspace/`, `orbit/`, `views/`, `components/` (Agent D is mid-step) or
`router.ts`. Stop and report.
