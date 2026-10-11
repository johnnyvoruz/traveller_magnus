# E campaign_gap_audit report
Prompt: prompts/e_campaign_gap_audit.md
Status: done

## Changed files
- findings/campaign_gap_audit.md: the four-section gap list. Counts: 26 live, 4 part built, 37 not started, 5 dropped by a ruling, 0 on disk unpushed (72 lines).
- directives/prompts/e_campaign_gap_audit.md: two Progress lines only.

No product code. No file outside this lane's audit outputs. Dirty builder, orbit, and map files were left untouched and are not claimed as campaign work.

## Gates
npm test:      not run (read-only pass, no product code)
npm run check: not run (read-only pass, no product code)
typecheck:     not run (read-only pass, no product code)
fourth gate:   not run (no browser, no server; the web build was not run)

## Contract published
none

## Needs from others
none

## Questions for Johnny
1. Which fields on the MgT2E ship sheet are the hull tonnage, the thrust, and the jump rating? This blocks fuel warnings, refuelling, and deducting fuel. Suggested answer: you name the PDF fields, and the 100-ton stand-in stays until you do.
2. What rule should a slingshot follow when a course passes a body and gains from it instead of stopping? This blocks any slingshot course. Suggested answer: leave slingshots parked. The only supplied travel rule is rest to rest.
3. May the referee re-aim a ship that is already in the middle of a leg, and what formula applies while the ship is moving? This blocks any change to replaceLegsFrom. Suggested answer: keep the MVP. The ship finishes the leg. An edited route starts at the end of that leg.
4. What should a dice roll mean in this app: target numbers, effect, or any other convention the roller should show? This blocks interpreting dice. Suggested answer: when a roller is built, it shows the dice and interprets nothing.
5. Are recurring ship costs (mortgage, maintenance, salaries) derived from the ship sheet, or does the referee always type them? This blocks the ledger. Suggested answer: the referee types them.
6. Should a cargo row connect to an MgT2E trade-goods table? That table is not in rules/ today. This blocks cargo. Suggested answer: cargo rows are free text.
7. Is player visibility one switch on the whole record plus player notes, or is it per section (summary versus details)? This blocks the Player Pack filter. Suggested answer: record-level, which is the plan's own until.
8. When the party has more than one ship, is the stored shape a list of vessel ids, and which of those ships is the one "Where are we" follows? This blocks the party model. Suggested answer: store vesselIds, flag one ship as current, and keep whereAreWe on that one ship. You pick the shape before anyone designs it.

The full list, the places that assume one vessel, and the proposed order are in findings/campaign_gap_audit.md.
