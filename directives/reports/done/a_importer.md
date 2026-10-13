Found: an exported campaign file includes `journal`, and `apps/web/src/campaign/import.ts` did not read it, so export then import dropped every entry.
Finished: import reads `journal` the way export writes it. Entries go out as `EntryChange` with `baseRev: 0`, after links and before settings. An entry whose id is already in the open campaign is refused with "That campaign is not empty."
Backed out: nothing.

# Lane A a_importer report
Prompt: prompts/a_signout_fix.md (part 3)
Status: done

## Changed files
- apps/web/src/campaign/import.ts: `journal` is an optional document key. Absent means `[]`, so a file from before the journal still parses. Each entry is sent with `baseRev: 0`, keeping `when`, `visibility`, `mentions`, and `images`. `CampaignEntry` fills a missing `images` with null, so an entry from before images still parses. Any existing journal row, like an existing record or link, makes the target "That campaign is not empty."
- tests/web/campaign_import.test.js: a round trip of one entry, an entry with no `images`, a file with no `journal` key, and a target that already has an entry.

## Gates
npm test:      pass (1534 pass, 0 fail, 23 skip)
npm run check: pass
typecheck:     pass (`tsc --noEmit -p apps/api`)
fourth gate:   pass (`tests/web/campaign_import.test.js`, including the two journal tests)

The index chunk is in `directives/reports/a_signout_fix.md`: `index-H-OJSFqz.js` 171.50 kB, gzip 57.87. `npm run build` still stops on Lane E's `apps/web/src/pack/plan.ts` before Vite. That file was not edited here.

## Contract published
none

## Needs from others
none

## Questions for Johnny
none
