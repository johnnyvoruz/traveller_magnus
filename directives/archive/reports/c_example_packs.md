# Lane C example packs report

Found an empty Progress list and no pack files. Finished both campaign exports, their listings, the parse test, and the chart notes. Backed out nothing. The generator script was scratch and is gone.

Prompt: prompts/c_example_packs.md
Status: done

## Changed files

- tools/examples/packs/regina-highport-contacts/campaign.json: 8 persons, 3 businesses, 2 places, all on Spinward_Marches/1910, with owns, contact, ally, and rival links.
- tools/examples/packs/regina-highport-contacts/listing.json: kind people.
- tools/examples/packs/jewell-patrons/campaign.json: 6 jobs, each with a patron, on six charted worlds, plus 2 events.
- tools/examples/packs/jewell-patrons/listing.json: kind patrons.
- tests/web/example_packs_c.test.js: both files parse through the app importer, every anchor is a v10 system, and every link joins two records of an allowed pair of types.
- findings/examples/c_example_packs.md: the chart facts each record uses, with the file.

The importer requires a settings object and a clock. Both files carry the empty default (no party, no custom kinds, imperial dates, rev 0) and clock null. They add no campaign settings of their own. Every sheet is null. No record prints a world profile, a price, or a characteristic.

## Records

Regina highport contacts:

- Sera Quill, broker, books berths in Gallery C.
- Harun Pell, owns Pell Freight Desk.
- Ivo Marsh, files scout-base supply notes.
- Nia Calder, checks naval-gate passes. Referee only.
- Tomas Reed, owns the Second Watch Clinic.
- Laleh Voss, owns The Amber Berth.
- Bram Keller, moves crates on the night shift.
- Odette Parr, sells names from The Quiet Lock. Referee only.
- Places: Gallery C (public), The Quiet Lock (referee).

Jewell patrons:

- Adele Quinn, Jewell 1106, job The unlogged crate.
- Colm Asher, Mongo 1204, job The harvest tally.
- Petra Lang, Emerald 1006, job The empty scout berth.
- Kenzo Hale, Ruby 1005, job The missing suit.
- Maris Ode, Esalin 1004, job The amber exit.
- Yara Tesh, Riverland 1102, job The Riverland letter. The patron record is referee-only.
- Event One crate, two books ties the Jewell crate to the Mongo tally.
- Event The ship that skipped ties the Emerald berth to the Ruby suit.
- The Riverland letter targets The amber exit. Each job ends with "Pay: the referee's call."

## Gates

npm test: pass. 1709 tests, 1680 pass, 0 fail, 29 skipped.
npm run check: pass (manifesto: clean).

## Contract published

none

## Needs from others

none

## Questions for Johnny

none
