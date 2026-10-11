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
