# B entry images report
Prompt: prompts/b_entry_images.md
Status: done

found: a journal entry had no `images` field. `campaign_journal` had no column, and `CREATE TABLE IF NOT EXISTS` would not add one to a universe that already had the table.
finished: the field, the column for a new table and an old one, the omit-or-clear write, and the export round trip.
backed out: nothing.

## Changed files
- `packages/shared/src/schemas/campaign.ts`: `images` on `CampaignEntryObject`, the same list as a record, at most 12. A parse of an entry that omits the field yields null. `EntryChange` still omits the key when the patch omits it, so the server can tell "leave them" from "clear them". The TypeScript type of `CampaignEntry` keeps `images` optional so the screen's existing entries still typecheck.
- `apps/api/src/universe/campaign.ts`: `images TEXT` on a new `campaign_journal`, and `ALTER TABLE` after `pragma_table_info` when an old table has no column. `entryFrom` reads it (null when the cell is empty). Insert writes the list. A full update writes it only when the patch includes the key. Thirteen images are `400` `validation`, `An entry can hold 12 images.`
- `directives/api.md`: section "Images on a record and on a journal entry", beside the object rows.
- `tests/shared/campaign.test.js`, `tests/api/campaign_logic.test.js`, `tests/api/campaign_entry_images.test.js`.

## Gates
npm test:      pass (1480 pass, 0 fail, 20 skipped)
npm run check: pass
typecheck:     pass
fourth gate:   pass. `RUN_API_TESTS=1` `tests/api/campaign_entry_images.test.js` on 18844/19844. The server is stopped. An entry saved with two images reads them back. A patch that omits `images` keeps them. `images: null` clears them. Thirteen are refused with `An entry can hold 12 images.` and nothing is written. The export lists the hashes. Applying that journal entry to a second universe keeps the images. An entry with the field removed imports as null. A universe whose table was rebuilt without the column reads the old row as null and then saves one image.

## Contract published
directives/api.md, section "Images on a record and on a journal entry"

## Needs from others
- Lane E: `images` is on `CampaignEntry` and on a full `EntryChange`. The shape matches `CampaignRecord.images`. The cap is 12. The bytes are the existing object route. Only the owner can read them.
- A patch that leaves `images` out does not change the stored list. Send `null` to clear it. An older entry parses as null.
- The browser importer in `apps/web/src/campaign/import.ts` still does not read `journal`. This pass did not change that file. The export file does include `journal`, and a server-side apply of that journal keeps the images.

## Questions for Johnny
none
