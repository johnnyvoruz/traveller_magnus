# E handout images report
Prompt: prompts/e_handout_images.md
Status: blocked

found: Progress was empty. No earlier report. No image field on a journal entry.
finished: step 1 only. Confirmed the schema, the object route, and who can fetch a stored image.
backed out: nothing.

## Step 1

There is no `contracts/b_*.md` for images. The built contract is `directives/api.md`, the two object rows (GET and PUT `/api/universes/:id/objects/:hash`). The Worker is `apps/api/src/routes/objects.ts` (`mountObjectRoutes`). The screen side is `apps/web/src/workspace/images.ts`, `RecordAvatar.vue`, and `RecordGallery.vue`. Records store the list on `CampaignRecord.images`.

A journal entry cannot hold image ids today. `CampaignEntryObject` in `packages/shared/src/schemas/campaign.ts` is strict and has no image field. Its fields are `id`, `kind`, `title`, `body`, `when`, `realDate`, `sequence`, `author`, `visibility`, `anchor`, `mentions`, `rev`, `createdAt`, `updatedAt`, and `deleted`. A record's field, the one an entry does not have, is:

```
images: z.array(CampaignImage).max(CAMPAIGN_LIMITS.images).nullable(),
```

`CampaignImage` is `hash`, `thumbHash`, `width`, `height`, `bytes`, and an optional `caption`. The cap is `CAMPAIGN_LIMITS.images` (12). `EntryChange` extends that same object, so a patch cannot carry images either.

The upload is not tied to a record id. `PUT /api/universes/:id/objects/:hash` checks that the caller owns the universe, that `:hash` is 64 lowercase hex and the SHA-256 of the body, that the body starts `RIFF....WEBP` and is at most 8 MB, and that the universe stays within 250 MB of objects. The key is `u/<universeId>/objects/<hash>` in the private bucket. An existing key is 200 and is not written again.

A stored image is readable by the owner only. `GET` on the same path uses `ownedUniverse`. Another account, a missing universe, or a missing hash is 404. The response is `Cache-Control: private, immutable`. The address alone is not enough.

The Durable Object table matches the schema. `campaign_journal` in `apps/api/src/universe/campaign.ts` has no `images` column. `entryFrom` does not read one, and the insert and update do not write one. `installCampaignSchema` uses `CREATE TABLE IF NOT EXISTS`, so a column added only there would not appear on a universe that already has the table.

No image id was stored on an entry, in the body, or on a stand-in record. Step 2 was not started. Player visibility is already on the entry as `visibility` (`referee` or `players`). No player view exists. Even an entry marked for players cannot show its bytes to a player until a later read path exists, because GET stays owner-only.

## Changed files
- directives/prompts/e_handout_images.md: one Progress line
- directives/reports/e_handout_images.md: this report

## Gates
npm test:      not run (stopped at step 1)
npm run check: not run
typecheck:     not run
fourth gate:   not run

## Contract published
none

## Needs from others
- Lane B: add `images` to `CampaignEntry` with the same shape as `CampaignRecord.images`: `z.array(CampaignImage).max(CAMPAIGN_LIMITS.images).nullable()`. Because the object is strict, the field has to be on `CampaignEntryObject` so `CampaignEntry` and the full `EntryChange` both accept it. On the Durable Object, add `images TEXT` to `campaign_journal` for new universes and `ALTER TABLE` for ones that already exist, then read it in `entryFrom` and write `jsonText(change.images)` on insert and on a full update, the way `campaign_records` already does. Existing rows should read as null. No new upload route. The object key is already the universe id plus the hash.

## Questions for Johnny
none
