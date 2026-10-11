# Builder server contract

Written 2026-10-10 from the code on disk. Browser lanes build against this file.
No route here changes behaviour. **Proposed, not built** at the end is not a route.

Public prefix: `/api/universes`. `:id` is the universe id. `:sector` and `:local` together are the hex key `<sector>/<local>`. `:local` is four digits. A referee sector id is `~` plus 26 Crockford characters (`OwnSectorId` in `packages/shared/src/schemas/sector.ts`). Chart slugs never contain `~`.

Each route is marked **live at `3d28e33`** or **on disk, unpushed**. `3d28e33` is `HEAD`. Unpushed means the working tree, not that commit.

## Who may call

Every route uses `ownedUniverse`. There is no admin path.

| Caller | Result |
|---|---|
| Signed out | 401 `unauthenticated`, `Sign in required.` |
| Signed in, universe missing, deleted, or not owned by this user | 404 `not_found`, `No such universe.` |
| Owner, `GET` or `HEAD` | Allowed. Origin is not checked. |
| Owner, any other method, `Origin` header present and not this request's origin | 403 `forbidden`, `Origin check failed.` |
| Owner, any other method, no `Origin` header | Allowed. |

## Envelope

Success: `{ ok: true, data }`. Status 200 unless a route says 201 or 202.

Failure: `{ ok: false, error: { code, message, details? } }`.

`details`, when the schema parse fails, is Zod `flatten()`. Conflict `details.current` is described on the route. The hex door's conflict `current` is a `BuilderHex` or a `BuilderAbsent` and includes `rev`. The Worker's hash check on form, draft, keep, and design returns a thinner `current`: `{ state, treeHash, baseHash, roll }` with no `rev` and no `hexKey`.

## Shared shapes

| Name | File |
|---|---|
| `HexKey`, `BuilderHex`, `BuilderAbsent`, `BuilderHexView`, `BuilderHexPage`, `HexRemove`, `HexRestore`, `HexRevert`, `BuilderGenerate`, `BuilderGenerateDone`, `BuilderJobAccepted`, `BuilderJob`, `BuilderJobUndo` | `packages/shared/src/schemas/builder.ts` |
| `FormRead`, `FormDraft`, `FormAnswer`, `FormKeep`, `FormBlank`, `FormDesign`, `FormChange`, `FormMessage`, `EditForm` | `packages/shared/src/schemas/form.ts` |
| `HandEnvelope`, `HandSystem`, `HandBody` | `packages/shared/src/schemas/hand.ts` |
| `SectorMake`, `SectorRename`, `SectorMove`, `SectorRev`, `SectorUndo`, `SubsectorRename`, `RefereeSector`, `RefereeSectorPage`, `SectorSeed`, `SectorGenerate`, `SectorGenerateDone`, `SectorGenerateUndo`, `SectorGenerateUndone` | `packages/shared/src/schemas/sector.ts` |

`HexRemove` and `HexRestore` are `{ baseRev }` with `baseRev` an integer ≥ 0. `BuilderHex.rev` is ≥ 1. `BuilderAbsent.rev` is 0. A page of rows never includes rev 0.

A stale `baseRev` writes nothing. Hex: 409 `conflict`, `The hex changed.` Sector: 409 `conflict`, `The sector changed.` Slot taken: 409 `conflict`, `That slot is in use.`

Object cap: a new private object that would pass 250 MB is 400 `too_large`, `250 MB of objects per universe.` The door write is not applied, and the new object is deleted.

## Routes in `apps/api/src/routes/builder.ts`

### `GET /:id/hexes` — **live at `3d28e33`**

Query: `sector` (required), `cursor` (optional), `limit` (optional, default 100, clamped 1–100).

Answer data: `BuilderHexPage` `{ items, nextCursor }`.

Rev: read only.

Errors: 400 `validation` `sector is required.` or `Invalid limit.` With no generation pin, data is `{ items: [], nextCursor: null }`.

A stored hex whose key starts with `~` has `state: 'own'` even on a pinned universe. That state rule is **on disk, unpushed**.

### `GET /:id/hexes/:sector/:local` — **live at `3d28e33`**

Answer data: `BuilderHex` when a row exists.

Rev: read only. A missing row is 404 `not_found` `No such hex.` This GET does not return `BuilderAbsent`. `BuilderAbsent` is the answer of restore, of revert to rev 0, and of remove on an own map or a `~` sector.

Errors: 400 `validation` `Invalid hex key.`

`state: 'own'` for a `~` key is **on disk, unpushed**.

### `POST /:id/hexes/:sector/:local/remove` — **live at `3d28e33`**

Body: `HexRemove`.

Answer data: `BuilderHex` with `state: 'removed'` and `treeHash: null` on a chart hex. The chart entry is kept on the row. Rev becomes the next history rev.

On an own map the row is deleted and the answer is `BuilderAbsent` (`state: 'own'`, `rev: 0`). The same delete-the-row answer for a `~` key, on any universe, is **on disk, unpushed**.

Errors: 400 `validation` `Nothing to remove.` `details.reason` `empty` (already removed, or no row and no chart system, or a `~` key with no row). 400 `The chart entry is not a sector hex.` 409 as above. Invalid JSON 400 `Invalid JSON.` Bad shape 400 `Invalid request.`

### `POST /:id/hexes/:sector/:local/restore` — **live at `3d28e33`**

Body: `HexRestore` (same as `HexRemove`).

Answer data: `BuilderAbsent`. The row is deleted. A pinned chart hex then reads as the chart (`state: 'truth'`, `rev: 0`). An own map reads as `state: 'own'`.

Errors: 400 `This universe has no chart.` `details.reason` `no_chart` on an own map, and **on disk, unpushed** for any `~` key. 400 `Nothing to restore.` `details.reason` `empty` when no row. 409 as above.

### `POST /:id/hexes/:sector/:local/revert` — **live at `3d28e33`**

Body: `HexRevert` `{ toRev, baseRev }`, both integers ≥ 0.

`toRev: 0` deletes the row and returns `BuilderAbsent`. Any other `toRev` copies that history row forward as a new rev (`action: 'revert'`) and returns `BuilderHex`.

Errors: 404 `not_found` `No such revision.` 400 `Invalid hex key.` 409 as above.

History rows are kept. Nothing in the code expires them.

### `GET /:id/jobs/:jobId` — **live at `3d28e33`**

Answer data: `BuilderJob`. `kind` is `generate`. `state` is `queued`, `running`, `done`, `stopped`, or `failed`. `failures` holds at most 100 `{ hexKey, reason }`.

Errors: 404 `not_found` `No such job.`

### `POST /:id/jobs/:jobId/stop` — **live at `3d28e33`**

Body: none.

Answer data: `BuilderJob`. A job already `done`, `failed`, or `stopped` is returned as it is. Otherwise `state` becomes `stopped`.

Errors: 404 `No such job.`

### `POST /:id/jobs/:jobId/undo` — **live at `3d28e33`**

Body: none. The job id is the undo token. See **Undo** below.

Answer data: `BuilderJobUndo` `{ restored, conflicts }`.

Errors: 404 `No such job.` 400 `The job is still running.` `details.reason` `running` (state is not `done` or `stopped`). 400 `Already undone.` `details.reason` `already_undone`.

### `GET /:id/hexes/:sector/:local/form` — route **live at `3d28e33`**; hand documents **on disk, unpushed**

Answer data: `FormRead` `{ hash, form: EditForm }`. `hash` is the envelope a draft must name.

`EditForm.mode` omitted means generated. `mode: 'hand'` is a hand document. `edition` is `MgT2E` or `AoW` when set, and omitted on a blank that named none. Both the hand mode and the optional edition are **on disk, unpushed**.

Errors: 404 `not_found` `No stored tree.` (no row and no chart system, a removed row, a missing object, or a document that fails its schema or names another hex). 409 from the hash check when the row's `treeHash` is set and differs from the hash being loaded. That 409 is **on disk, unpushed**.

### `POST /:id/hexes/:sector/:local/draft` — route **live at `3d28e33`**; hand changes **on disk, unpushed**

Body: `FormDraft` `{ hash, changes, roll? }`. `changes` max 400. `roll` max 40.

Answer data: `FormAnswer` `{ form, changed, messages }`. Nothing is stored. The hex rev does not move. The same `changes` against the same `hash` produce the same hand ids.

Errors: the form errors below, plus 404 and the hash 409 from load. Invalid JSON and invalid shape as on remove.

### `POST /:id/hexes/:sector/:local/keep` — route **live at `3d28e33`**; hand keep **on disk, unpushed**

Body: `FormKeep` `{ hash, baseRev, changes, roll? }`. `baseRev` integer ≥ 0.

Answer data: `BuilderHex`. One new private object when the bytes are new. History `action` is `keep`. Rev is the next history rev. `roll` stays the row's roll, or 0 when there was no row.

A message with `holds: true` refuses the keep: 400 `validation` `The engine could not build this system.` `details.messages` is the answer's messages. The row is unchanged.

Other errors: form errors, 404, hash 409, rev 409, 400 `too_large`.

### `GET /:id/sectors` — **on disk, unpushed**

Answer data: `RefereeSectorPage` `{ items }`. Live referee sectors only, ordered by `y`, `x`, id. A universe with no pin returns `{ items: [] }`.

Rev: read only. Each item's `rev` is ≥ 1.

### `POST /:id/sectors` — **on disk, unpushed**

Body: `SectorMake` `{ name, slot }`. `name` is trimmed, 1–80 characters. `slot` is `{ x, y }`, integers from -1000 to 1000. The client does not send `id`. The server sets `id` to `~` plus a new ULID.

Answer data: `RefereeSector`. Status 201. `rev` is 1. `deleted` is false. `subsectors` is sixteen empty strings, index 0 is A and index 15 is P. Subsectors A–P always exist; this route does not create one.

Errors: 400 `The chart is not loaded.` when the universe has a truth version and `truth/<version>/manifest.json` is missing. 400 `That slot holds a charted sector.` `details.reason` `charted`. 409 `That slot is in use.` `details.current` is the `RefereeSector` already there. 409 `That sector already exists.` 400 `Invalid sector.` 400 `The universe has no generation pin.`

### `POST /:id/sectors/:sectorId/rename` — **on disk, unpushed**

Body: `SectorRename` `{ name, baseRev }`. `baseRev` integer ≥ 1.

Answer data: `RefereeSector`. Rev becomes `baseRev + 1`.

Errors: 404 `No such sector.` (missing, deleted, or not a referee id). 400 `Invalid sector.` 409 `The sector changed.`

### `POST /:id/sectors/:sectorId/move` — **on disk, unpushed**

Body: `SectorMove` `{ slot, baseRev }`. The server decides `charted` from the truth manifest. The client does not send it.

Answer data: `RefereeSector`. Rev becomes `baseRev + 1`. Hex keys are not rewritten.

Errors: the rename errors, plus 400 `The chart is not loaded.`, 400 `That slot holds a charted sector.`, 409 `That slot is in use.`

### `POST /:id/sectors/:sectorId/delete` — **on disk, unpushed**

Body: `SectorRev` `{ baseRev }` with `baseRev` ≥ 1.

Answer data: `RefereeSector` with `deleted: true` and rev `baseRev + 1`. Every hex row of that sector is dropped. The history payload at the new rev holds the sector as it was before the delete and those hex rows.

Errors: as rename.

### `POST /:id/sectors/:sectorId/undo` — **on disk, unpushed**

Body: `SectorUndo` `{ toRev, baseRev }`, both integers ≥ 1.

Answer data: `RefereeSector`. The history payload at `toRev` is copied forward as rev `baseRev + 1`. When that payload holds hex rows, they are inserted again. See **Undo**.

Errors: 404 `No such sector.` 404 `No such revision.` 400 `Invalid sector.` 409 `The sector changed.` 409 `That slot is in use.` when the restored sector is not deleted and the slot has another live sector. 409 `A hex in that copy is already stored.` `details.hexKey` when a stored hex blocks the restore.

### `POST /:id/sectors/:sectorId/subsectors/:letter/clear` — **on disk, unpushed**

`:letter` is `A`–`P`. Body: `SectorRev`.

Answer data: `{ sector: RefereeSector, removed: number }`. Sector rev becomes `baseRev + 1`. Hex rows whose local hex falls in that letter are dropped and stored on that history rev. The sixteen names stay.

Errors: 400 `Invalid subsector.` As rename for the sector.

### `POST /:id/sectors/:sectorId/subsectors/:letter` — **on disk, unpushed**

Body: `SubsectorRename` `{ name, baseRev }`. `name` is at most 80 characters and is not trimmed. Empty is an unnamed subsector.

Answer data: `RefereeSector`. One of the sixteen names changes. Rev becomes `baseRev + 1`.

Errors: 400 `Invalid subsector.` As rename.

### `POST /:id/hexes/:sector/:local/blank` — route **live at `3d28e33`**; body **on disk, unpushed**

Body: `FormBlank`. Required field is `baseRev` only (integer ≥ 0). `edition`, `starType`, `starSubtype`, and `starClass` may be sent and are ignored. The stored document omits `edition` when the client omits it.

Answer data: `BuilderHex`. The object is a hand envelope: `kind: 'hand'`, empty `system.name`, no stars, no bodies. Row `roll` is 0. History `action` is `keep`. Rev is the next history rev.

Errors: 400 `This hex already has a system.` when a row or the chart already has a tree. 409 on a stale `baseRev`. 400 `too_large`.

### `POST /:id/hexes/:sector/:local/design` — **on disk, unpushed**

Body: `FormDesign` `{ baseRev }`, integer ≥ 0. `0` matches a chart hex with no row.

The route reads the current tree (the row, or the chart object when there is no row), stores one hand document built from that form, and does not write the chart object. Row `state` is `override` on a chart hex, `own` on a `~` key. `roll` is the row's roll, or 0 when there was no row. History `action` is `keep`. Rev is the next history rev (1 when `baseRev` was 0).

Answer data: `BuilderHex`.

Errors: 404 `No stored tree.` 400 `This system is already designed by hand.` 400 `That system cannot be stored.` Form refusals from the hand conversion. 409 on hash or rev. 400 `too_large`.

Undo of this write is hex revert. Revert `{ toRev: 0, baseRev: <the new rev> }` drops the row and the hex reads as the chart again.

### `POST /:id/generate` — **live at `3d28e33`**; hand chart entry **on disk, unpushed**

Body: `BuilderGenerate`.

- `hexKeys`: 1–1280 unique `HexKey`s.
- `edition`: `MgT2E`, `CT`, `T5`, `RTT`, or `AoW`.
- `generator`: `top-down` or `bottom-up`.
- `roll`: integer ≥ 0, default 0. `0` is the universe seed. A higher roll is a different repeatable system.
- `filledToo`: default false.
- `baseRev`: required when `hexKeys` has one entry. Integer ≥ 0. Omitted for more than one hex.

Pairs the server runs: `MgT2E` with `top-down`, and `AoW` with `bottom-up`. Anything else is 400 `validation` `That engine and generator are not available yet.` `details.reason` `generator_unavailable`.

One hex, and the hex already holds a system (a stored tree whose state is not `removed`, or a chart system when there is no row), and `filledToo` is false: 200 `{ rows: [], skipped: [hexKey] }`. The row is unchanged. A hand document counts as a held system. **On disk, unpushed:** the chart entry of a stored hand document uses the hand entry. The generate call itself replaces whatever object the hex holds.

One hex, `filledToo: true`, or the hex is empty: the server generates, stores a tree (`kind: 'tree'`), and returns 200 `BuilderGenerateDone` `{ rows: [BuilderHex], skipped: [] }`. History `action` is `generate`. Rev is the next history rev. This replaces a hand document. The hand object remains in the bucket. Hex revert to the hand rev returns it.

More than one hex: 202 `{ jobId }`. Schema `BuilderJobAccepted`. The job is queued. `baseRev` is not used. Each hex's rev is captured when the job is created. A hex whose rev moved before the batch is a failure `{ hexKey, reason: 'conflict' }` and is not written. `filledToo: false` skips a hex that already holds a system.

Errors for one hex: 400 `The generator refused this hex.` `details.reason` is the error text, at most 200 characters. 409 `The hex changed.` 400 `too_large`. 400 `duplicate hex key` and `baseRev is required for one hex` are `Invalid request.`

A body with `makeSectors` of one or more entries is not this answer. It is the next route section. The same path without `makeSectors` still answers 200 or 202 as above. An empty `makeSectors` array is ignored.

### `POST /:id/generate` with `makeSectors` — **on disk, unpushed**

Body: `SectorGenerate`. The same fields as `BuilderGenerate`, plus `makeSectors`: 1–1280 of `SectorSeed` `{ name, slot }`. `name` is trimmed, 1–80 characters. `slot` is `{ x, y }`, integers from -1000 to 1000.

This one call makes every named sector and generates every hex in the box. Hexes already in a sector use their real key (`Spinward_Marches/1910`, or `~<id>/1910`). A hex in a sector that does not exist yet is named `~slot_<x>_<y>/<hhhh>`, the same placeholder the Build screen uses. `<x>` and `<y>` are the slot's integers, and `<hhhh>` is the local hex. The server assigns `~` plus a ULID, rewrites those keys, and returns the sectors.

One hex in the whole box: status 201. The sector row and that hex are written in one transaction. `jobId` is null. More than one hex: status 202, one job of kind `generate`, the same job `POST .../generate` queues. Sectors are created before the job runs. `rows` is empty until the job writes.

Answer data: `SectorGenerateDone`.

```
{ sectors: RefereeSector[], rows: BuilderHex[], skipped: HexKey[], jobId: string | null }
```

`skipped` is empty on this answer. A held hex in the queued job is still skipped later when `filledToo` is false, and the job's own counts say so.

Errors, same code and words as make and as generate: 400 `The chart is not loaded.` 400 `That slot holds a charted sector.` `details.reason` `charted`. 409 `That slot is in use.` `details.current` is the `RefereeSector` already there. 400 `That engine and generator are not available yet.` `details.reason` `generator_unavailable`. 400 `The generator refused this hex.` 409 `The hex changed.` 400 `too_large`. 400 `The universe has no generation pin.` 400 `Invalid sector.` 409 `That sector already exists.` Plus 400 `That slot is named twice.` 400 `A hex names a slot that is not being made.` 400 `A new sector has no hexes.` Invalid JSON and invalid shape as on remove.

If the inline generate throws, no sector row is written.

Who may call: the owner, same as `POST .../sectors`. Signed out is 401. A non-owner is 404.

### `POST /:id/sectors/undo-generate` — **on disk, unpushed**

Body: `SectorGenerateUndo`. One of:

- `{ sectorId, baseRev }` for the inline act (one hex, `jobId` null). `sectorId` is the id from `sectors[0]`. `baseRev` is that sector's `rev`.
- `{ jobId }` for the queued act. One call covers every sector that job made and every hex it wrote, including hexes that were already in a sector.

It stops the job when the job is `queued` or `running`, then undoes. A second call is 400 `Already undone.` `details.reason` `already_undone`. 404 `No such job.` 404 `No such sector.`

Each made sector is deleted the way `POST .../delete` deletes one: `deleted: true`, and the hex rows of that sector are kept on that delete history rev. Hexes the job wrote in a sector it did not make are restored to the row captured when the job was created, or the row is deleted when there was none.

Answer data: `SectorGenerateUndone`.

```
{ sectors: [{ id, toRev, baseRev }], restored, hexes: [{ hexKey, toRev, baseRev }] }
```

`sectors[].toRev` and `sectors[].baseRev` are the delete rev. `POST .../sectors/:id/undo` with that pair puts that sector and its hexes back. That is the undo of this undo, one call per sector made. `hexes` lists only hexes that were not in a made sector. `POST .../revert` with that pair puts the generated tree back. `restored` is how many written hexes this call took back.

A moved sector rev is 409 `The sector changed.` A moved hex rev is 409 `The hex changed.` Nothing is written in either case. No clock expires the job or the history.

## Draft cycle

**On disk, unpushed** for a hand document. Generated mode is **live at `3d28e33`**, with the hash 409 **on disk, unpushed**.

Open: `GET .../form`. The draft and the keep name that `hash`.

`changes` apply in order. A generated document refuses an id that is not already on the form: `Unknown field <id>.` A hand document does not: an id created earlier in the same array is valid.

Hand adds:

- `star.add` / `body.add`. `true`, `'true'`, or `1` assigns the next `sN` or `bN`. A string is the client id: 1–40 characters, a letter or digit, then letters, digits, `.`, `_`, or `-`. `false`, `'false'`, `0`, `null`, and `''` add nothing.
- An id that duplicates another id, or that is a prefix of one (or the reverse), is `<id> is already in this system.`
- `body.add` appends an empty world under the first star that exists at that point. A world before any star is `A world needs a star.` Kind and parent are later changes in the same array.
- `<id>.parent` is one id, or two ids joined by `+`. Either order is accepted. Storage is the parent star, then the companion, on `parentId` and `alsoParentId`. `alsoParentId` is omitted when absent.
- `<starId>.remove` true removes that star, every star whose `parentId` chain leads to it, and every world or moon that orbits any of them (`parentId` or `alsoParentId`). The answer message is `<starId>.remove`, text `N bodies go with this star.` (`1 body goes` for one, `0 bodies go` for zero), `holds: false`. The count omits the named star.
- `<bodyId>.remove` true on a world removes moons whose `parentId` chain leads to it. A moon removes only itself. No count message.
- A later change that names something this remove already dropped is `Unknown field <id>.`
- A world that has moons cannot be given to another world: `A world that has moons cannot be given to another world.` The document is unchanged. A world with no moons can, by setting `kind` to `moon` and `parent` to that world.
- Unpairing two stars is `These two stars are not paired.` A pair that names a missing star is `A body orbits these two stars together. Give it to one star first.` A moon given two parents is `A moon orbits one world.`

`roll` on a hand field adds `{ id, text: 'Nothing rolls this field.', holds: false }`. The value stays.

Keep sends the same `changes` and `roll` as the draft, plus `baseRev`. Discard is local: the server has no discard route. A draft leaves the stored hash and rev as they were.

Generated structural switches (`*.addWorld`, `*.addMoon`, `*.remove`, and the other add switches) still have to exist on the form before the draft. A generated roll can set `holds: true`. Keep then returns 400 and writes nothing.

Other hand refusals, all 400 `validation`, document unchanged: `<id> cannot be edited.` `<id> cannot hold that.` `star.add cannot hold that.` `body.add cannot hold that.` `A moon whose parent does not exist.` `A world orbits a star.` `A star orbits a star that is not in this system.` `That system cannot be stored.`

The form field `name` on a generated system writes the envelope `body.name` (the chart title). The mainworld's own name is a different field, `<bodyId>.name`.

## Generate on a hand-made system

**Live at `3d28e33`** for the generate call. The hand document it replaces is **on disk, unpushed**.

`POST .../generate` with `filledToo: true`, a `roll`, and `baseRev` of the hand row replaces the hand document with a generated tree. One new hex rev. Undo is `POST .../revert` with `toRev` of the hand rev and `baseRev` of the generate rev.

Without `filledToo`, the hex is skipped and the hand document stays.

A second `POST .../design` on a hand document is 400 `This system is already designed by hand.`

`POST /api/generate/preview` is not a route in `builder.ts`. It is stateless, stores nothing, and does not read the hand document. Body `GeneratePreview` in `packages/shared/src/schemas/generate.ts`.

## Sectors and own-sector hexes

**On disk, unpushed.**

Make, rename, move, delete, undo, subsector rename, and subsector clear are the sector routes above. Move does not change hex keys. Delete drops the sector's hex rows and keeps them on that history rev. Restore of a `~` hex is 400 `no_chart`. Remove of a `~` hex with a row deletes the row.

`POST .../generate` does not look for a sector row. A hex key `~<id>/<hhhh>` can be generated whether or not `POST .../sectors` created `<id>`.

## Undo

Nothing in this code expires an undo by time.

| Act | What comes back | How long it lives |
|---|---|---|
| One-hex generate, keep, blank, design, remove | The answer's `rev`. Undo is `POST .../revert` `{ toRev: <rev before>, baseRev: <rev now> }`. `toRev: 0` when the act created the first row. | The history row stays. No clock. |
| Generate of more than one hex | `jobId` in the 202. `POST .../jobs/:jobId/undo` with an empty body, once the job is `done` or `stopped`. Each written hex returns to the row captured at job create, or the row is deleted when there was none. A hex whose rev is no longer the rev the job wrote is listed in `conflicts` and left alone. | The job row stays. A second undo is 400 `Already undone.` No clock. |
| Sector rename, move, subsector rename, subsector clear, delete | The act's new `rev`. `POST .../sectors/:id/undo` `{ toRev: <that rev>, baseRev: <rev now> }` copies that history payload forward. Delete's payload puts the sector and its hexes back. Clear's payload puts that letter's hexes back. | History rows stay. No clock. |
| `POST .../sectors` (make) | Rev 1. Undo to that rev copies the made sector forward. It does not delete the sector. Its payload's hex list is null, so hexes generated afterwards stay. | Same history. This is not an undo of the make. |

## Make sectors and generate, as one Undo

**On disk, unpushed.** The two sections above are the act. One `POST .../generate` with `makeSectors` covers hexes in existing sectors and hexes in any number of new slots. One `POST .../sectors/undo-generate` takes back every sector that act made and every hex it wrote. `POST .../jobs/:jobId/undo` is unchanged: it does not delete those sectors, and a running job still answers 400 `The job is still running.`

## Hand: orbit data

**On disk, unpushed.** Extends the draft cycle. `order` is unchanged.

The orbit view places a companion when the star row carries `orbitAU` or `orbitId` (`apps/web/src/orbit/distance.ts` lines 7 to 8 and 39 to 41; `starCompanionAU` prefers `orbitAU`, otherwise `orbitToAU(orbitId)` at `apps/web/src/orbit/maths.ts` lines 79 to 82). It places a world from numeric `au` (`distance.ts` lines 74 to 75; `layout.ts` line 375). A world is drawn on a star only when `orbitType` is `P-Type` or `S-Type` and `au` is greater than 0 (`layout.ts` lines 341 to 343 and 393 to 395). A moon's measured place is `pd` times the parent's `diamKm` (`distance.ts` lines 86 to 92). The drawn moon ring uses the moon's index, not `pd` (`layout.ts` lines 75 to 77). The card reads `pd` and `eccentricity` (`apps/web/src/orbit/card.ts`). `presentHand` fills none of these (`apps/web/src/orbit/hand_present.ts`).

Generated MgT2E output, read from the engine: a companion star gets `separation`, `orbitId`, and `eccentricity` (`packages/engines/src/mgt2e_stellar_engine.js` lines 809 to 813 and 823 to 827; the primary's `orbitId` is null at line 683). A world gets `orbitId` and `au` from the orbit-number interpolation at lines 1817 to 1825, plus `eccentricity` and `orbitType`. A moon gets `pd` in planetary diameters, `eccentricity`, and `periodHrs` (`packages/engines/src/mgt2e_world_engine.js` lines 669 to 682). A planetoid belt gets `size` 0 and `eccentricity` 0 (lines 315 to 316), then `beltM`, `beltS`, `beltC`, and `composition` (lines 345 to 348). The same period block writes `periodYears`, `periodDays`, and `periodHours` when `au` is set (lines 354 to 367). The hand document stores none of the belt composition fields.

### Stored fields

All of these are optional. A document that omits them still parses. Empty `''` or `null` removes the key. Any other value must be a finite number or the draft is `<id> cannot hold that.` `rules/` states no minimum and no maximum for a typed orbit, so the server does not add one.

| Form id | Who | Stored key | Unit |
|---|---|---|---|
| `<starId>.orbit.id` | star | `orbitId` | MgT2E orbit number. The table is `rules/mgt2e_data.js` lines 394 to 396 (`orbitAu`, 21 entries, orbit 0 at 0 AU through orbit 20 at 78700 AU). The same array is `packages/engines/src/core/constants.js` lines 125 to 127. |
| `<starId>.orbit.au` | star | `orbitAU` | AU. The viewer prefers this over `orbitId`. |
| `<starId>.orbit.eccentricity` | star | `eccentricity` | Dimensionless. `rules/mgt2e_data.js` lines 533 to 538 give eccentricity dice modifiers by anomalous-orbit type, not a numeric maximum. |
| `<starId>.orbit.years` | star | `periodYears` | Years. The viewer uses `periodYears` when it is greater than 0 (`layout.ts` line 327). |
| `<bodyId>.orbit.id` | world, gas, belt | `orbitId` | Same orbit number as a star. |
| `<bodyId>.orbit.au` | world, gas, belt | `au` | AU. This is the key `layout.ts` line 375 reads. |
| `<bodyId>.orbit.eccentricity` | world, gas, belt, moon | `eccentricity` | Same as a star. The engine sets a belt's eccentricity to 0 (`mgt2e_world_engine.js` lines 316 to 317). That is engine output, not a `rules/` lock, so the hand field stays editable. |
| `<bodyId>.orbit.years` | world, gas | `periodYears` | Years. `packages/engines/src/mgt2e_math.js` lines 103 to 105 returns years. The world engine copies that onto `periodYears` (`mgt2e_world_engine.js` line 365). |
| `<bodyId>.orbit.pd` | moon | `pd` | Planetary diameters. The engine writes `pd` at `mgt2e_world_engine.js` line 669. |

A moon's form does not carry `.orbit.id`, `.orbit.au`, or `.orbit.years`. A world, gas giant, belt, or star does not carry `.orbit.pd`. Sending one of those is `Unknown field <id>.`

`order` stays the nonnegative integer list order. It is not an orbit number. Setting both does not make them match, and the server does not require them to match. No rule in `rules/` and no hand check says two bodies cannot share an orbit number. The draft allows it.

The engine auditor refuses a non-moon world whose `orbitId` is below the star's destroying inner limit: `packages/engines/src/mgt2e_uwp_auditor.js` lines 169 to 171, `Orbit Violation: World at orbit ${w.orbitId} is inside the star's destroying inner limit (${innerLimit}).` The hand path does not run that auditor. A hand draft does not refuse an orbit inside the star.

`handWalk` copies a stored finite number onto the row keys above. It does not invent a missing one. For a world, gas giant, or belt that has `au` or `orbitId` and no `alsoParentId`, the walk also sets `orbitType` to `S-Type` and `parentStarIdx` to that body's star. A body with `alsoParentId` stays `P-Type`, as it already was. A belt's `periodYears` is not copied onto the walk. Lane A copies these keys in `presentHand`. `separation` on a companion stays the word `Companion`. The generated engine uses `Close`, `Near`, `Far`, and `Companion` (`mgt2e_stellar_engine.js` lines 809 and 823). `rules/` was not quoted for that enum here, so the hand walk does not pick one.

### Conversion helper

`packages/shared` exports `MGT2E_ORBIT_AU`, `mgt2eOrbitToAu`, and `mgt2eAuToOrbit`. Shared imports no engine. The array is the table at `rules/mgt2e_data.js` lines 394 to 396. `mgt2eOrbitToAu` is the interpolation in `orbitNumberToAu` (`mgt2e_stellar_engine.js`). `allocateOrbits` calls that function. An orbit number past 20 uses the last entry the way that block does. `mgt2eAuToOrbit` is `convertAuToOrbit` at lines 189 to 197 (an AU past the last interval returns 20). The screen calls these to draw the picker line, then writes the number it chose into `.orbit.id` or `.orbit.au` as an ordinary draft change. The server does not convert one stored field into the other.

`rules/` also has `rules/ct_data.js` lines 3 to 5 (`ORBIT_AU`, first entry 0.2, later entries differ, 20 entries) and `rules/t5_data.js` line 37 (`ORBIT_AU`, first entry 0.2, 20 entries). The hand editions are MgT2E and AoW (`HandEnvelope.edition`). `rules/aow_data.js` has no orbit-distance table. The helper is the MgT2E table only. It is not applied to an AoW system. See Questions.

A moon's period is not a form field. The engine sets `periodHrs` with `Math.sqrt(moonKm^3 / w.mass) / 361730` (`mgt2e_world_engine.js` lines 680 to 682). The viewer uses `periodHrs / (365.25 * 24)` when `periodHrs` is greater than 0, otherwise a different formula from `pd`, parent mass, and parent diameter (`apps/web/src/orbit/maths.ts` lines 139 to 151). `rules/` was not found stating which one a typed moon period uses. The form omits it.

### Belt year fields

Johnny's decision: a belt has no year data. The form for kind `belt` does not include these ids, and a draft change with one of them on a belt is dropped (no write, no error):

- `<beltId>.orbit.years`
- `<beltId>.orbit.days`
- `<beltId>.orbit.hours`

`.orbit.days` and `.orbit.hours` are not stored for any kind. On a world, gas giant, star, or moon they are `Unknown field <id>.` A stored belt that already has `periodYears` still parses. The form does not show it, and `handWalk` does not copy it. Generated belts still receive `periodYears` when `au` is set. That engine output is unchanged.

Lane D stops showing `<beltId>.orbit.years`, `<beltId>.orbit.days`, and `<beltId>.orbit.hours`. Lane A does not read `periodYears`, `periodDays`, `periodHours`, `siderealHours`, or `solarDayHours` off a hand belt. The dossier and the orbit card are theirs.

## Hand: roll a profile

**On disk, unpushed.**

The field id is `<bodyId>.profile.roll`. It is sent in the draft's `roll` array. It is not a typed change, and it is not a row on the form. Lane D's Roll profile button sends that id.

`rollBodyProfile` is `packages/engines/src/mgt2e_roll_body.js`. It calls `isolateRng` (`packages/engines/src/core/rng.js`): `reseedForHex` of `hexId|bodyId|roll`, then the previous generator is put back. `roll` is the body's `profileRoll`, or 0 when that field is absent. A roll that writes a cell stores the next number. Discard drops the draft, so the stored number stays. The same master seed, hex, body, and number return the same cells. Rolling again uses the next number.

MgT2E only. A moon, an edition that is not MgT2E, and any other id still answer `Nothing rolls this field.` `holds` is false.

For a world or a belt the function builds a one-body system and calls `generatePhysicals`, `generateAtmospherics`, `generateRotationalDynamics`, `generateBiospherics`, and, when another body is the mainworld and its eight cells are filled, `generateCoreSocial`. The body is passed as `Terrestrial Planet` or `Planetoid Belt`, not as `Mainworld`, so the mainworld lock does not copy a baseline over the roll. Those step functions were not rewritten. `generateSubordinateSocial` stays unexported; `generateCoreSocial` calls it.

Cells written back are the one-character profile cells the engine set. Orbit numbers on the hand body are not changed.

A gas giant's `size` is `GG` and its profile is `uwpGG`. Neither fits one of these cells, so nothing is written. See Questions.

A belt's size is 0. When a mainworld baseline is present, atmosphere and hydrographics are 0 as well, and the social cells are rolled. The form does not lock a belt cell.

When the star has no spectral type, `generateStarObject` is not called. The atmosphere step uses luminosity 1 where luminosity is missing (`mgt2e_world_engine.js`, `lum || 1.0`). The moon pass then reads `primary.mass` and throws. That throw is caught. Cells already written are kept. The message says the star has no spectral type.

A star with a type, subtype, and class is looked up with `generateStarObject`. That lookup does not roll. A white dwarf's rolled mass and cooling (`applyWhiteDwarfPhysics`) are not run, because that step rolls. The typed `D` branch of `generateStarObject` uses the brown-dwarf table. See Questions.

`orbitNumberToAu` is the orbit-number interpolation `allocateOrbits` already used, moved to one function in `mgt2e_stellar_engine.js`. `allocateOrbits` calls it. The engines version stays `1.1.0`.

Architect of Worlds is not this extraction. Its profile is built across the disk steps, including `generateUWPPhysicals`. None of them takes one hand body. Not built.

## What may orbit what

**On disk, unpushed.** A belt may orbit a star, a world, or a gas giant. A world or a gas giant whose parent is not a star is still refused: `A world orbits a star.`

A belt around a world or a gas giant uses the moon's fields, `<id>.orbit.pd` and `<id>.orbit.eccentricity`, and no year. That parent clears `orbitId`, `au`, and `periodYears`. A star parent clears `pd`.

Removing the world or the gas giant removes the belt, by the same cascade as a moon. The count is the number of ids that left. The star's sentence is unchanged: `N bodies go with this star.`

`handWalk` does not give that belt its own world row. It nests it in the parent's `moons`:

- `type` is `Planetoid Belt`
- `name` and `notes`
- `uwp` when the eight cells are filled
- `pd` and `eccentricity` when they are stored
- `isMoon` is not set
- `periodYears` is not set

No generator produces a belt around a world. The generators are untouched.

Lane A draws that nested row. Lane D's parent list still turns a body given to a world into a moon. A belt given to a world or a gas giant stays kind `belt`. The server accepts that. The screen has to send it.

Hand editions are MgT2E and AoW.

`rules/guideline_4_2_gas_giants_and_belts.md` places gas giants, then planetoid belts, into stellar orbits (section 1, lines 4 to 9, Classic Traveller; section 2, lines 11 to 21, Mongoose, belt composition by HZCO). It does not say a belt orbits a world. `rules/guideline_1_4_orbital_allocation.md` line 7 says a habitable-zone displacement must not overwrite a planetoid belt; the search targets an empty slot or a gas giant. Lines 14 to 17 (Mongoose) place planetoid belts in stellar slots after gas giants, and a size-1 mainworld that collides with a belt becomes a subordinate world inside that belt. That is a world in a belt's slot, not a belt orbiting a world. `rules/mgt2e_data.js` lines 545 to 553 list moon quantities for terrestrial sizes and for SGG, MGG, and LGG. Belts are not in that list. **rules/ is silent** on a belt orbiting a world or a gas giant.

Rings: `rules/mgt2e_data.js` lines 417 to 419 say size `0` and size `R` (ring) have no diameter. Generated worlds start with `rings` as an array (`mgt2e_world_engine.js` line 375). Each ring then gets `center` and `span` (lines 720 to 722). The viewer treats moon size `R` as a ring and also reads `raw.rings` (`layout.ts` lines 70 to 72 and 353). The hand model has no `rings` array and no size `R`. This pass does not add them.

### A belt's profile

`rules/guideline_4_2_gas_giants_and_belts.md` lines 25 to 26 (Traveller 5 only): belt size is 0, and the string is `St000PGL-T`, so atmosphere and hydrographics are 0. T5 is not a hand edition. That string is not copied onto MgT2E or AoW.

Mongoose section 2 of the same file (lines 17 to 21) and `rules/mgt2e_data.js` lines 778 to 793 give belt composition percentages (M, S, C). They do not fix UWP digits. **rules/ is silent** on a fixed MgT2E belt UWP.

What the MgT2E engine emits for a generated belt, from the source: `size` 0 and `eccentricity` 0 (`mgt2e_world_engine.js` lines 315 to 316); `gravity`, `mass`, `density`, `escapeVel`, and `orbitalVelSurface` null (lines 318 to 322); `beltM`, `beltS`, `beltC`, and `composition` (lines 345 to 348); `periodYears`, `periodDays`, and `periodHours` when `au` is set (lines 354 to 367); `siderealHours`, `solarDayHours`, `axialTilt`, `highTempK`, and `lowTempK` null, `tidallyLocked` false, and `albedo` and `meanTempK` still set (`mgt2e_world_engine.js` lines 1598 to 1614). Moons are not generated for a belt (the belt branch does not build them). `generateCoreSocial` does not skip a belt (`mgt2e_socio_engine.js` lines 450 to 453 skip only Empty and Gas Giant). `generateSubordinateSocial` (lines 161 to 184) forces atmosphere 0 when size is 0 and hydrographics 0 when size is 1 or less, then rolls population, government, law, starport, and tech level. `syncUWP` (lines 375 to 377) writes `uwp` and `uwpSecondary`.

AoW: `packages/engines/src/aow_uwp_auditor.js` lines 51 to 54 fail a planetoid belt whose `size` is not 0. `aow_seed_bridge.js` line 433 maps a belt's mass to 0 and says `stepPhysicalParameters` skips belts. `aow_world_engine.js` lines 1240 and 1252 to 1254 skip planetoid belts in that step. **rules/ is silent** on an AoW belt UWP. The editions differ. No profile digit is locked, and no profile cell is removed from the belt form.

### Rulings left as they were

- A hand system that is not MgT2E stores a typed AU. The orbit helper is the MgT2E table only, and it does not convert a stored field (`tests/generation/hand.test.js`, the helper test). The picker that works in AU only is the screen's.
- A moon's period stays off the form. `moon.orbit.years` is `Unknown field` (`tests/generation/roll_body.test.js`).
- No belt profile cell is locked. All eight are permission `type` (same test). A belt roll may still write size 0, which is what the engine does. The referee can type over it.
- Eccentricity accepts any finite number. Infinity is refused with `cannot hold that` (same test).
- A world at orbit 0, and two bodies on orbit 0, are stored. The screen does not call them out (same test). Nothing in `hand.ts` refuses an inner limit or a shared orbit.
