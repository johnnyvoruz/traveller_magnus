# Lane A store art report
Prompt: prompts/a_store_art.md
Status: done

Found: no store covers, and no brief.
Finished: the brief, eight kind defaults, four example covers, the originals, the shipped WebP, and the contact sheet.
Backed out: nothing.

## Changed files
- `findings/art/store_art.md`: the house brief and one prompt per cover.
- `findings/art/export_covers.cjs`: sharp export. Originals, WebP under the byte caps, metadata stripped, contact sheet with the file name under each image.
- `findings/art/originals/<name>.png`: the twelve kept sources. Not shipped.
- `findings/art/store_art_contact_sheet.png`: 1710×899, 2904824 bytes.
- `apps/web/public/covers/`: eight defaults, each 1280×720 and 640×360.
- `tools/examples/covers/`: four example covers, each 1600×900 and 640×360.
- `listing.json`: not edited. Z adds the cover line.

## Kept images

Each line is the prompt name, the number of tries, and why this one was kept. The 640 px files of these twelve were checked by eye. None of the kept files has legible lettering.

- `map`: 2 tries. Kept the take where the lamp and the chart stay one subject at card size. No lettering.
- `system`: 2 tries. The other take drew a five-point star. Kept the moon, the station, and the giant.
- `ship`: 2 tries. Kept the whole hull. The other take was a ramp crop.
- `people`: 2 tries. Kept four adults. The first take included a youth.
- `patrons`: 2 tries. The other take had writing on bottle labels.
- `organization`: 2 tries. The first take had an exit sign. Kept the same scene with the sign removed.
- `adventure`: 2 tries. Kept the take in work clothes. The other take read as western costume. No lettering.
- `other`: 3 tries. The first take had a caption. A later take still had a paper and a crate label. Kept the take with the caption removed.
- `free-traders-of-the-marches`: 4 tries. A seagoing hull, a ferry with a signature, and crate arrows were dropped. Kept the spacecraft in the hangar. No lettering.
- `jewell-patrons`: 2 tries. The first take had a caption. Kept the same scene with the caption removed.
- `regina-highport-contacts`: 4 tries. Stickers, a harbour, and crate text were dropped. Kept the orbital gallery with the crate plain.
- `the-glass-hand`: 3 tries. A caption, then scribbles on labels, were dropped. Kept the counter with blank labels.

## Shipped files

All WebP were written at quality 78. Caps are 220 KB for the wide files and 60 KB for the 640 px files. Sharp was not asked to keep metadata.

| File | Pixels | Bytes |
|---|---|---|
| `apps/web/public/covers/map.webp` | 1280×720 | 65174 |
| `apps/web/public/covers/map_640.webp` | 640×360 | 24322 |
| `apps/web/public/covers/system.webp` | 1280×720 | 63930 |
| `apps/web/public/covers/system_640.webp` | 640×360 | 23406 |
| `apps/web/public/covers/ship.webp` | 1280×720 | 77898 |
| `apps/web/public/covers/ship_640.webp` | 640×360 | 28338 |
| `apps/web/public/covers/people.webp` | 1280×720 | 50316 |
| `apps/web/public/covers/people_640.webp` | 640×360 | 19412 |
| `apps/web/public/covers/patrons.webp` | 1280×720 | 73776 |
| `apps/web/public/covers/patrons_640.webp` | 640×360 | 26424 |
| `apps/web/public/covers/organization.webp` | 1280×720 | 36092 |
| `apps/web/public/covers/organization_640.webp` | 640×360 | 14108 |
| `apps/web/public/covers/adventure.webp` | 1280×720 | 90902 |
| `apps/web/public/covers/adventure_640.webp` | 640×360 | 28432 |
| `apps/web/public/covers/other.webp` | 1280×720 | 40326 |
| `apps/web/public/covers/other_640.webp` | 640×360 | 15676 |
| `tools/examples/covers/free-traders-of-the-marches.webp` | 1600×900 | 98806 |
| `tools/examples/covers/free-traders-of-the-marches_640.webp` | 640×360 | 29964 |
| `tools/examples/covers/jewell-patrons.webp` | 1600×900 | 57656 |
| `tools/examples/covers/jewell-patrons_640.webp` | 640×360 | 16736 |
| `tools/examples/covers/regina-highport-contacts.webp` | 1600×900 | 82118 |
| `tools/examples/covers/regina-highport-contacts_640.webp` | 640×360 | 25160 |
| `tools/examples/covers/the-glass-hand.webp` | 1600×900 | 70294 |
| `tools/examples/covers/the-glass-hand_640.webp` | 640×360 | 21816 |

## Gates
npm test:      fail (1767 tests, 1721 pass, 11 fail, 35 skipped)
npm run check: pass
typecheck:     not run (not a gate on this pass)
fourth gate:   pass (pixel size and bytes in the table above; contact sheet `findings/art/store_art_contact_sheet.png`)

```
tests/api/packages_job.test.js — Cannot find module apps/api/src/auth/session imported from apps/api/src/routes/package_covers.ts
tests/api/packages_migration.test.js — package tables apply on a fresh local D1 and on today's schema: no such table: packages
tests/shared/package_schema.test.js — a card adds installs, updatedAt and hidden to the listing: cover is Required
tests/web/party_ships_map.test.js — SHIP_PAD is not defined; ROUTE_MARCH_MS is not defined (MapRenderer.ts)
tests/web/public_games.test.js — PUBLIC_X is not defined (MapRenderer.ts)
tests/web/public_overview_map.test.js — GLOW_HALO_ALPHA is not defined; SHIP_PAD is not defined (MapRenderer.ts)
tests/web/public_ships_map.test.js — MapRenderer.ts does not provide an export named fitLabel
```

## Contract published
none

## Needs from others
- Lane Z: add `"cover": "covers/<pack-folder>.webp"` on the six example `listing.json` files. The four example covers above are ready. Feri terraces and Hollow Verge are still Z's screenshots. The three package-cover test failures above are in Z's files. Not fixed here.
- Lane D: the eight map-renderer failures above are in `apps/web/src/map/MapRenderer.ts`. Not fixed here. Do not show these covers until Johnny has reviewed `findings/art/store_art_contact_sheet.png`. Kind keywords, first match, case-insensitive: map (sector, subsector, piece, map, region), system, ship (ship, ships, vessel, fleet), people (people, contact, npc, crew, character), patrons (patron, job, mission, hook), organization (organization, organisation, faction, corporation, house), adventure (adventure, scenario, event, campaign), other. Cards use the `_640` file. The page uses the wide file. Defaults live in `apps/web/public/covers/`.

## Questions for Johnny
none
