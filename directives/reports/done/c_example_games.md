# Lane C example games report

Found an empty Progress list and no files under tools/examples/games/. Finished twelve game files, the shape test, and the chart notes. Backed out nothing. The route scan was scratch and is gone.

Prompt: prompts/c_example_games.md
Status: done

## Changed files

- tools/examples/games/*.json: twelve games, eighteen ships, finished legs on v10 systems, public journal entries.
- tests/web/example_games_c.test.js: shape, truth hexes, finished legs, getHexDistance at most 2, handles, unique names, and a shared final hex.
- findings/examples/c_example_games.md: every chart fact the logs rely on.
- directives/prompts/c_example_games.md: Progress lines only.

## Games

The Long Haul. Referee quiet_navigator, shown. Kestrel's Due ends at Spinward_Marches/2007. Crew: Mara Quell, Tobin Ashe.

Two Locks. Referee berth_pencil, hidden. Copper List ends at Spinward_Marches/2007. Crew: Orla Bex, Cam Harrow. This is the stacked pair.

The Slow List. Referee even_column, shown. Salt Lantern ends at Spinward_Marches/0104. Crew: Idris Cho, Willa Brant, Poe Lumen.

A Short Margin. Referee salt_stamp, hidden. Red Thread ends at Spinward_Marches/0114. Crew: Soren Dal, Kit Amos.

Dry Hold Run. Referee north_copy, shown. Dry Hold ends at Spinward_Marches/0326. Crew: Renna Quist.

The Even Column. Referee low_orbit_note, hidden. Even Keel ends at Spinward_Marches/0304. Crew: Noor Est, Pim Jad, Cora Lenz, Wes Talbot.

A Smaller Loop. Referee third_margin, shown. Small Orbit ends at Spinward_Marches/0311. Crew: Ana Vesk, Bo Tern, Cira Dodd, Fal Unwin, Gita Shore.

Counted Miles. Referee open_keel, hidden. Mile Marker ends at Spinward_Marches/0526. Crew: Jem Oak, Tovi Rend.

Two Holds. Referee lamp_on_two, shown. Grey Parcel ends at Spinward_Marches/0618. Crew: Oda Kline, Ruf Bennet. Cold Lamp ends at Spinward_Marches/0429. Crew: Mina Sol, Paz Iven.

Past the Marches. Referee dry_receipt, hidden. North Copy ends at Deneb/0209. Crew: Len Maru, Sia Kade. Shore Step ends at Deneb/0311. Crew: Brogan Ives.

Three Short Hops. Referee mile_note, shown. Open Hold ends at Trojan_Reach/0204. Crew: Tess Arlo, Vic Penn. Last Receipt ends at Trojan_Reach/0310. Crew: Ada Fen, Gil Mott, Joze Rill. Third Copy ends at Trojan_Reach/0119. Crew: Nils Acker, Opal Dern, Quin Sabe, Rhee Tol, Uma Zet.

The Farther List. Referee last_cabin, hidden. Low Cabin ends at Gvurrdon/0402. Crew: Ryn Cole. Pale Stamp ends at Gvurrdon/0411. Crew: Tamsin Bole, Uri Dane, Vera Lott, Ned Nair. Far Column ends at Gvurrdon/0231. Crew: Xela Dorn, Yorim Blake.

Eight games have one ship. Four have two or three. Six handles are shown. Lane Z's seed tool was not run.

## Gates

npm test: pass. 1759 tests, 1726 pass, 0 fail, 33 skipped.
npm run check: pass. manifesto: clean.
typecheck: not run. This pass does not change TypeScript sources.
fourth gate: none.

## Contract published

none

## Needs from others

none

## Questions for Johnny

none

Fix 1: chart checks skip with `truth-local/v10 is not in this checkout` when `truth-local/v10/sectors` is absent. Parsing, links, names, finished legs, distances, and handles still run.
