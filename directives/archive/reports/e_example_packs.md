# E example packs report
Prompt: prompts/e_example_packs.md
Status: done

Found: both packs already written. Sera Quill and Bram Keller matched two different people in C's Regina pack.
Finished: renamed them to Wynn Solas and Edric Holm, and added the cross-pack name test.
Backed out: nothing.

## Changed files
- tools/examples/packs/free-traders-of-the-marches/campaign.json: five ships, crews, and one hook each
- tools/examples/packs/free-traders-of-the-marches/listing.json: kind ships
- tools/examples/packs/the-glass-hand/campaign.json: the ring, six people, three places, three rumours
- tools/examples/packs/the-glass-hand/listing.json: kind organization
- tests/web/example_packs_e.test.js: parseExport, v10 hexes, link ends, no record name shared across packs
- findings/examples/e_example_packs.md: truth facts each record relied on
- directives/prompts/e_example_packs.md: progress lines

The export envelope includes empty settings and clock null. parseExport requires both keys. The packs set no party, no custom kinds and no clock.

## Records

free-traders-of-the-marches:
- Bright Ledger (Regina). Mael Dorr. Joss Pell, Ren Aoki, Salle Venn. Hook: The Regina lien.
- Paper Kite (Lanth). Idra Solm. Hob Tench, Pria Noll. Hook: Cal Derrow.
- Cold Manifest (Rhylanor). Vess Okun. Tam Brice, Ludo Fenn, Ara Silt. Hook: Unplated crate.
- Second Bell (Aramis). Nila Kest. Orun Vale, Sef Marin. Hook: The Aramis yard bill.
- Moth Orchard (Mora). Harl Ibo. Denni Crowe, Ysa Quen, Kato Benn. Hook: Eda Voss.

the-glass-hand:
- The Glass Hand. Wynn Solas (leader). Ivo Tarn, Nessa Holt, Edric Holm, Odile Venn, Harun Peck.
- Lantern Chandlery (Regina), Unmarked berth (Efate), Green Cabin (Whanga).
- Letters with no address (Regina), The door with no name (Efate), A log line left blank (Dentus).

## Gates
npm test:      pass (1717 tests, 1687 pass, 0 fail, 30 skipped)
npm run check: pass (manifesto: clean)
typecheck:     not required
fourth gate:   not required

## Contract published
none

## Needs from others
none

## Questions for Johnny
none

Fix 2: hex checks skip with "truth-local/v10 is not in this checkout" when `truth-local/v10/sectors` is absent, or when `EXAMPLE_PACKS_TRUTH_SECTORS` points at a missing folder. Parsing, link ends, and the name check still run. With the chart present the hex test passed (6 pass, 0 skip). With the path missing, that one test skipped and the other five passed. `npm run check` passed. `npm test` is red in `tests/tools/example_games.test.js` (SyntaxError, not this file).
