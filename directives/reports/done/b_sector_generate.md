# B sector generate report
Prompt: prompts/b_sector_generate.md
Status: done

## Changed files
- directives/contracts/b_builder.md: the one-act generate and undo-generate sections are the route, marked on disk, unpushed.
- packages/shared/src/schemas/sector.ts: SectorSeed, SectorGenerate, SectorGenerateDone, SectorGenerateUndo, SectorGenerateUndone.
- packages/shared/src/index.ts: those names are exported.
- apps/api/src/routes/builder.ts: POST .../generate branches on a non-empty makeSectors. POST .../sectors/undo-generate is the one undo.
- apps/api/src/universe/sectors.ts: resolveMadeSectors, commitGenerate, and the door paths. One transaction. A throw leaves no sector row.
- apps/api/src/universe/hexes.ts: insertJob has no transaction of its own. A batch that arrives after any job undo returns without writing.
- tests/api/builder_sector_logic.test.js: the six points and the mixed box, in memory.
- tests/api/builder_sector_generate.test.js: the same points on the worker, port 18836.

## Gates
npm test:      pass (1308 pass, 0 fail, 15 skipped)
npm run check: pass (manifesto: clean)
typecheck:     pass (tsc --noEmit -p apps/api, exit 0)
build:         pass (492 modules)
fourth gate:   pass. RUN_API_TESTS=1 tests/api/builder_sector_generate.test.js (18836/19836) pass. Then tests/api/builder_sector.test.js (18833/19833) pass. stopDev ran in each finally. Neither port is listening.

## Contract published
contracts/b_builder.md

## Needs from others
- Lane D: replace the two-step grow (make sectors, then generateMany, then two undos) with one call. Nothing in apps/web was changed here.

Request: `POST /api/universes/:id/generate`

```json
{
  "hexKeys": ["Spinward_Marches/1910", "~slot_3_120/1910", "~slot_-1_4/0101"],
  "edition": "MgT2E",
  "generator": "top-down",
  "roll": 0,
  "filledToo": false,
  "makeSectors": [
    { "name": "Far Reach", "slot": { "x": 3, "y": 120 } },
    { "name": "Near", "slot": { "x": -1, "y": 4 } }
  ]
}
```

A hex already in a sector keeps its real key. A hex in a sector that does not exist yet is `~slot_<x>_<y>/<hhhh>`, the same placeholder `slotSlug` builds. No zero padding. Negatives are the slot integers. `baseRev` is required only when `hexKeys` has one entry, and it is `0` for a new slot hex. Omit `baseRev` when there is more than one hex. An empty `makeSectors` array is ignored, and that call still answers the old generate body.

Answer, one hex in the whole box, status 201:

```json
{ "sectors": [ "<RefereeSector, rev 1>" ], "rows": [ "<BuilderHex>" ], "skipped": [], "jobId": null }
```

Answer, more than one hex, status 202:

```json
{ "sectors": [ "<RefereeSector, rev 1>", "<RefereeSector, rev 1>" ], "rows": [], "skipped": [], "jobId": "<id>" }
```

`sectors[].id` is `~` plus a ULID. `sectors[].slot` is the slot that was asked for. Remap `~slot_<x>_<y>/hhhh` to `<id>/hhhh` from that list. `skipped` on this answer is always empty. A held hex is skipped later, inside the job, when `filledToo` is false.

Undo request: `POST /api/universes/:id/sectors/undo-generate`

Inline (the 201, `jobId` null): `{ "sectorId": "<sectors[0].id>", "baseRev": 1 }`

Queued (the 202): `{ "jobId": "<jobId>" }`

One call. It stops a queued or running job, deletes every sector this act made, and puts every hex it wrote back. Do not call `POST .../jobs/:jobId/undo` for this act. That route is unchanged: it does not delete these sectors, and a running job still answers 400 `The job is still running.`

Undo answer:

```json
{
  "sectors": [ { "id": "<made sector>", "toRev": 2, "baseRev": 2 } ],
  "restored": 1,
  "hexes": [ { "hexKey": "Spinward_Marches/1910", "toRev": 4, "baseRev": 5 } ]
}
```

`sectors[].toRev` and `sectors[].baseRev` are the delete rev. `hexes` lists only hexes that were already in a sector. Hexes in a sector this act made are not in `hexes`. They sit on that sector's delete history.

Undo of that undo, one call per made sector: `POST /api/universes/:id/sectors/:sectorId/undo` with `{ "toRev": <sectors[i].toRev>, "baseRev": <sectors[i].baseRev> }`. That puts the sector and its hexes back.

Undo of an existing-sector hex: `POST /api/universes/:id/hexes/:sector/:local/revert` with `{ "toRev": <hexes[i].toRev>, "baseRev": <hexes[i].baseRev> }`. `baseRev` is `0` when the row was deleted.

A second `undo-generate` on a job is 400 `Already undone.` A second `undo-generate` on the inline act is 404 `No such sector.` The sector is already deleted. The way back is the sector undo above.

Errors, same words as make and generate: 401 `Sign in required.` 404 `No such universe.` 400 `The chart is not loaded.` 400 `That slot holds a charted sector.` 409 `That slot is in use.` 400 `That engine and generator are not available yet.` 400 `The generator refused this hex.` 409 `The hex changed.` 409 `The sector changed.` 400 `That slot is named twice.` 400 `A hex names a slot that is not being made.` 400 `A new sector has no hexes.` A stale rev writes nothing.

## Questions for Johnny
1. none
