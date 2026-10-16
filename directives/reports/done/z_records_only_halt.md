# Lane Z records-only report
Prompt: prompts/z_records_only.md
Status: blocked (Halt & Challenge on Decided item 4, anchors). No code was changed.

## Changed files
- none. I stopped before building, as item 4 says to when today's behaviour contradicts the rules.

## Halt & Challenge: anchors to hexes outside the package
The prompt says: "First read what the install does today with a record anchored to a hex that is not in the package, and keep that behaviour if it exists ... If the existing behaviour contradicts these rules, stop and report."

What the install does today is defined, and it keeps every such anchor unchanged:
- **In place:** `routes/installs.ts` `load()` (lines 186 to 196) passes each record through as stored. There is no anchor check and no truth-version check.
- **Placed:** `place()` rewrites records with `placeRecord` (`routes/installs.ts` line 268), which is `placeTree` (`packages/shared/src/package_place.ts`). The doc comment at line 131 says: "Keys outside the piece are left alone."
- **Contract:** `contracts/b_marketplace.md` line 463 lists `placeRecord` (anchors) next to `placeLists` ("route and border endpoints"). The `placeLists` doc in the same file says: "endpoints inside the piece move, the rest stay."
- **Truth version:** no install refuses or changes anything when the target's truth version differs from the package's. Only the edition is checked: "This package is for a different edition." (`routes/installs.ts` line 167).

That contradicts two of the new rules:
- "An anchor to an own-sector hex (`~` key) is always dropped." Today it is kept, and dangles in the target campaign.
- "An anchor to a chart hex is ... dropped" when the truth versions differ. Today it is kept.

For a records-only package, every anchor is outside the piece. So the two readings give different results for every record that has an anchor.

## Needs from others
- Orchestrator: choose one of these.
  1. **Apply the new rules to records-only packages only**, and keep today's behaviour (anchors kept) for packages with hexes. Recommended: it changes no existing import, and the new rules only cover the new case.
  2. Apply the new rules to every import, which changes F6 for packages with hexes as well.
  3. Keep today's behaviour everywhere: anchors are never dropped, and `anchorsDropped` is always 0 or left out.

Once that is answered, I build items 1, 2, 3, 5 and 6 as written. They do not depend on the choice.

## The example packs (read only, none changed)

| Pack | Mode | Records | Hexes | Why it has hexes | Recommendation for its next version |
|---|---|---|---|---|---|
| Free traders of the Marches | records | 28 | 5 | the records' anchor systems, unchanged chart hexes | records-only |
| Jewell patrons | records | 14 | 6 | the same | records-only |
| Regina highport contacts | records | 13 | 1 | the same; the card reads "People · 1 hex" | records-only first: its single hex is the clearest case |
| The Glass Hand | records | 13 | 4 | the same | records-only |
| Feri terraces | charted | 8 | 1 | the system is the subject | keep its hex |
| Hollow Verge | sector | 6 | 6 | the hexes are the piece | keep its hexes |

All the records in the four records packs have anchors to charted hexes on v10. Under option 1 they keep their anchors in a v10 campaign and lose them elsewhere.

## Gates
npm test:      not run for this prompt (nothing changed). The cover-seed pass ran it this session: 1777 pass, 0 fail.
npm run check: not run for this prompt (nothing changed)
typecheck:     not run
fourth gate:   not run; no worker suite was needed for a read-only halt

## Contract published
none

## Questions for Johnny
1. Which anchor rule should apply? Suggested: option 1, the new rules for records-only packages only.
