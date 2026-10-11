# Marketplace stub contract (size b)

Written 2026-10-11. Nothing in this file is built. Browser lanes build against it after Johnny accepts it.
No schema file and no migration is part of this pass. The zod names below are the names the build will add beside the manifest that already exists.

This is Johnny's size b (2026-10-10), decisions 1, 2, and 3. A signed-in referee publishes a named part of a universe they own and lists their own packages. Another account cannot list or read them. Nobody installs one. Sharing is free. A publish is a snapshot locked to the hex ids in the body.

Public prefix for these routes: `/api/packages`.

## Who may call

The same session check as the rest of the API.

| Caller | Result |
|---|---|
| Signed out | 401 `unauthenticated`, `Sign in required.` |
| Signed in, no `Origin` on a mutation | Allowed. |
| Signed in, `Origin` present and not this request's origin | 403 `forbidden`, `Origin check failed.` |
| Signed in, reading or changing a package whose `author_id` is someone else | 404 `not_found`, `No such package.` The row is not revealed. |
| Signed in, publishing from a universe they do not own, or that is missing or deleted | 404 `not_found`, `No such universe.` |

Decision 2: any signed-in owner may publish, and only a subset of a universe they own. There is no admin path and no reviewer path in the stub. Decision 3: nothing is held for moderation. A finished publish is visible to its author at once.

The author handle on a manifest is `profile.handle`. If that row is missing, the publish creates it the same way `GET /api/me` does.

## Envelope

Success: `{ ok: true, data }`. Status 200 unless a route says 201 or 202.

Failure: `{ ok: false, error: { code, message, details? } }`. A bad shape sends Zod `flatten()` as `details`. Invalid JSON is 400 `validation`, `Invalid JSON.`

## Shared shapes

| Name | File |
|---|---|
| `PackageHex`, `PackageManifest` | `packages/shared/src/schemas/package.ts` (already exported) |
| `PackageCreate`, `PackagePublish`, `PackageListing`, `PackagePage`, `PackageVersion`, `PackagePublishAccepted` | `packages/shared/src/schemas/package.ts` (named here, not added in this pass) |

`PackageListing` is the card. Decision 1: title, author handle, kind, truth version, edition, hex count, tags, latest version number. The list also carries `id`, because the client has to open the package. Trees and records are not on this shape.

```
{ id, title, authorHandle, kind, truthVersion, edition, hexCount, tags, latestVersion }
```

`id` is `pk_` plus 26 characters from the Crockford alphabet `0123456789ABCDEFGHJKMNPQRSTVWXYZ` (no I, L, O, or U). Each character is one draw from `crypto.getRandomValues`, the same alphabet as `ulid` in `apps/api/src/auth/session.ts`. It is not a ULID: a ULID is time plus random, and this id is 26 random characters. Settled 2026-10-11. `authorHandle` is the handle stored on the latest done manifest, or the profile handle when nothing has been published. `truthVersion` is a string or null. `hexCount` is the latest done version's count, or 0. `latestVersion` is that version number, or 0. `tags` is an array of strings.

`PackagePage` is `PackageListing` plus `description` and `versions`. `versions` is `PackageVersion[]`, newest first. This is the package page. The hex map and the record object stay in the manifest, which this page points at. They are not copied onto the list.

`PackageVersion`:

```
{ version, state, hexCount, recordCount, manifestHash, error }
```

`state` is `queued`, `running`, `done`, or `failed`. `manifestHash` is null until `done`. `error` is null unless `failed`.

`PackagePublishAccepted`: `{ jobId, version }`. `jobId` is the text `pk_…:N` for that version.

## Routes

### `POST /api/packages` — **not built**

Who: a signed-in user (decision 2).

Body: `PackageCreate`.

```
{ title, kind, description, tags, universeId }
```

All four text fields are required. `tags` may be empty. `universeId` is the universe this package will publish from. The server copies `edition_default`, `engine_version`, and `truth_version` from that row onto the package. A later version cannot name a different universe.

Answer: 201 `PackageListing`. `latestVersion` is 0 and `hexCount` is 0. No R2 object is written.

Storage: one `packages` row. `author_id` is the caller. `slug` is generated and unique. `hidden` is 0. `installs` is 0. `takedown_reason` and `takedown_by` are null. `latest_version` is 0.

Errors: 404 `No such universe.` 400 `Invalid request.` A universe whose `truth_version` is null is 400 `validation`, `This universe is not on a published chart.` See Questions in the lane report. The existing `PackageManifest.truthVersion` is a required string (`packages/shared/src/schemas/package.ts`).

### `POST /api/packages/:packageId/versions` — **not built**

Who: the author (decision 2).

Body: `PackagePublish`, the shape `api.md` already names.

```
{ universeId, hexKeys, recordIds }
```

`hexKeys` is 1–1280 unique `HexKey`s. `recordIds` is 0–500 campaign record ids. Both caps are **proposed**. The package spec gives no cap. 1280 is `BUILDER_LIMITS.hexesPerJob` in `packages/shared/src/schemas/builder.ts`, one sector of 32 by 40. 500 records is not in a spec.

`universeId` must be the universe stored on the package. Another id is 400 `validation`, `This package publishes from a different universe.`

Answer: 202 `PackagePublishAccepted`. The version row exists before the queue runs. `latest_version` on the package stays on the last `done` version until this one finishes.

Storage and the job are the section below.

Errors, and nothing is queued when any of these fire:

- 404 `No such package.`
- 404 `No such universe.`
- 400 `This package publishes from a different universe.`
- 400 `This universe is not on a published chart.`
- 400 `Invalid request.` including a duplicate hex key, flattened as on generate.
- 400 `validation`, `A hex is not in this universe.` `details.hexKey` is the first key that is neither a row in that universe nor a hex of its pinned truth.
- 400 `validation`, `No such record.` `details.recordId` is the first id that is missing or deleted.
- 400 `too_large`, `A package holds at most 1280 hexes.`
- 400 `too_large`, `A package holds at most 500 records.`

A hex in a referee sector (`~` plus an id) is allowed. `data_model.md` §6 says a package made from own sectors carries those slugs. That is a package. It is not the public-games mark.

### `GET /api/packages` — **not built**

Who: the signed-in caller. Decision 1 and size b: this is their list, not a catalogue. `api.md` Slice 4's public `GET /api/packages?kind=&q=&tag=&sort=` is not this route. No query filters in the stub.

Query: `cursor` optional, `limit` optional. `limit` defaults to 100 and is clamped to 1–100, the same page rule as `api.md`.

Answer: 200 `{ items: PackageListing[], nextCursor }`. `nextCursor` is a string, or null when the page ends, the same rule as `BuilderHexPage`. Newest `updated_at` first. Another account's rows are absent, not redacted in place. Settled 2026-10-11.

Errors: 400 `validation`, `Invalid limit.`

### `GET /api/packages/:packageId` — **not built**

Who: the author. `api.md` makes this public. Size b does not. Another account, and an id that is not a package, are both 404 `not_found`, `No such package.` The missing row and someone else's row use the same answer. Settled 2026-10-11.

Answer: 200 `PackagePage`.

Errors: 404 `No such package.`

### `GET /api/packages/:packageId/versions/:version` — **not built**

Who: the author. This is how the form reads progress. `api.md` points long work at `/jobs/:jobId`. The stub does not add a package job onto the universe generate route, so that route's answer stays as it is.

`:version` is an integer ≥ 1.

Answer: 200 `PackageVersion`.

Errors: 404 `No such package.` 404 `not_found`, `No such version.`

## Storage

D1, from `data_model.md` §2, plus three columns the spec row does not have. Those three are **proposed** and are what makes a publish lock to one universe and report progress.

`packages`

| Column | From | Stub |
|---|---|---|
| `id` | spec | `pk_` + 26 Crockford. Proposed alphabet. |
| `author_id` | spec | the caller |
| `universe_id` | **proposed** | the universe named at create. Versions cannot switch it. |
| `kind`, `title`, `slug`, `description`, `tags`, `edition`, `truth_version`, `engine_version` | spec | copied as the create route says. `slug` is unique. `tags` is JSON. |
| `latest_version` | spec | 0 until a version is `done`, then that number |
| `installs` | spec | stays 0. No install route. |
| `created_at`, `updated_at` | spec | ISO timestamps |
| `hidden`, `takedown_reason`, `takedown_by` | spec | `hidden` 0, takedown null. No route writes them. |

`package_versions`

| Column | From | Stub |
|---|---|---|
| `package_id`, `version` | spec | version starts at 1 |
| `state` | **proposed** | `queued`, `running`, `done`, `failed` |
| `error` | **proposed** | null, or the failure text sliced to 200 characters |
| `manifest_hash` | spec | sha256 of the manifest's stable bytes. Null until `done`. |
| `content_hash` | spec | sha256 of the records-subset object. Null until `done`. |
| `bytes` | spec | size of the manifest plus the records object plus image bytes this version put |
| `hex_count`, `record_count` | spec | the body lengths |
| `created_at` | spec | when the row was inserted |

Not created in the stub: `package_installs`, `proposals`, `reports`. Decision 3: report and takedown come with the full marketplace.

R2, `architecture.md` §2 and `data_model.md` §7. The public bucket, written by the job only:

| Key | Body |
|---|---|
| `packages/<packageId>/<version>/manifest.json` | the `PackageManifest` |
| `objects/<sha256>` | a tree, a records-subset object, or an image, named by the sha256 of its stable bytes |

A key that is already there is left as it is. Content-addressed bytes are not rewritten. The private universe prefix `u/<universeId>/objects/<sha256>` is read and not modified.

The CDN can fetch a manifest if the caller knows the key. The stub has no browse route and no install route. That split is a question in the lane report.

## The manifest

`PackageManifest` in `packages/shared/src/schemas/package.ts`, which already matches `data_model.md` §7. The stub writes it. It does not add fields.

| Field | What the job writes |
|---|---|
| `format` | the literal `voyage-package` |
| `schemaVersion` | `1` |
| `packageId` | the package id |
| `version` | this version's integer |
| `kind` | the listing's kind |
| `title` | the listing's title |
| `author` | `{ id, handle }`. `id` is the user id. `handle` is `profile.handle` at the time the job runs. |
| `edition` | the listing's edition |
| `engineVersion` | the universe's `engine_version` |
| `truthVersion` | the universe's `truth_version` |
| `hexes` | one `PackageHex` per key in the body, keyed by the hex key |
| `lists.routes` | sha256 of the stable bytes of `[]` |
| `lists.borderPaths` | sha256 of the stable bytes of `[]` |
| `records.contentHash` | sha256 of the records-subset object |
| `records.count` | how many records were copied |
| `records.imageHashes` | the image hashes copied for those records |
| `publishedAt` | ISO time when the manifest was written |

`PackagePublish` does not name lists. The manifest still requires `lists.routes` and `lists.borderPaths`. The stub publishes the hash of an empty array for each. A later slice can name the routes and borders that touch the hexes.

`PackageHex` for one key:

- A live row with a tree: `baseHash` is the row's base hash or null on an own-sector key, `treeHash` is the row's tree, `summary` is the row's stored summary object.
- A chart hex with no row: `baseHash` and `treeHash` are the truth object's hash, `summary` is the chart entry fields the truth index already stores for that hex.
- A row with `deleted` set: `{ baseHash, deleted: true }`. `treeHash` is omitted.

The records-subset object is a JSON array of the campaign records, in the order of `recordIds`, stable-encoded. Images on those records are copied by the hash already stored on the record. The private object is the source. The public key is `objects/<sha256>`.

## The publish job

Queue: `PUBLISH_QUEUE` / `voyage-publish`, already bound in `apps/api/wrangler.toml`. Message: `{ kind: 'publish', packageId, version, universeId }`.

Steps, in order:

1. The route inserts the version row at `queued` and sends the message. The HTTP answer is 202. The route does not copy objects.
2. The consumer sets `state` to `running`. A row that is already `done` is left alone, so a retry does not publish twice.
3. It reads the hex rows and the named records from that universe's Durable Object, and the truth object when the hex has no row.
4. It copies each missing object to `objects/<sha256>` on the public bucket.
5. It writes the records-subset object, then `packages/<id>/<version>/manifest.json`.
6. It sets the version to `done`, fills `manifest_hash`, `content_hash`, and `bytes`, and sets `packages.latest_version` to this version.

A throw after the row exists sets `state` to `failed` and `error` to the message sliced to 200 characters. `latest_version` stays where it was. Objects already copied stay. They are content-addressed and carry no listing.

Progress: `GET /api/packages/:packageId/versions/:version`. There is no SSE stream in the stub. The server sets no poll interval. The client chooses it. The client built in this tree waits 400 ms. Settled 2026-10-11.

## Blocked at build (2026-10-11)

The route accepts `hexKeys` and `recordIds`, then the queue message is only `{ kind: 'publish', packageId, version, universeId }`. `package_versions` has no column for those two lists. The job cannot know which hexes and records to copy. Nothing is built until that is settled. Recommended: two JSON columns on `package_versions`, `hex_keys` and `record_ids`, written by the route before the message is sent, and not copied onto `PackageVersion`. The queue message stays as written.

## Limits

| Limit | Number | Where it comes from |
|---|---|---|
| Hexes in one version | 1280 | **Proposed.** Not in the package spec. Same number as `BUILDER_LIMITS.hexesPerJob`. |
| Records in one version | 500 | **Proposed.** Not in a spec. |
| Title | 1–80 characters, trimmed | **Proposed.** The sector-name cap. Campaign names allow 200. |
| Description | 0–2000 characters | **Proposed.** Not in a spec. |
| Kind | 1–40 characters, trimmed | **Proposed.** `PackageManifest.kind` is an unbounded string today. The example in `data_model.md` §7 is `subsector`. No enum is declared. |
| Tags | at most 32, each 1–40 characters | **Proposed.** The same numbers as `CAMPAIGN_LIMITS.tags` and `CAMPAIGN_LIMITS.tag`. |
| Versions kept | 100 | **Proposed.** Not in a spec. Version 101 is 400 `too_large`, `This package has too many versions.` |
| Page size | 100 | `api.md` pagination. |

## What the browser lanes call

Lane A, a client that sends this contract and does not merge:

- `POST /api/packages` with `PackageCreate`.
- `POST /api/packages/:packageId/versions` with `PackagePublish`.
- `GET /api/packages/:packageId/versions/:version` until `state` is `done` or `failed`.
- `GET /api/packages` and `GET /api/packages/:packageId` to refresh.

Lane D, the publish form: `title`, `kind`, `description`, `tags`, and the universe it publishes from. The hex picker and the record picker fill `hexKeys` and `recordIds` on the version call. The owner's list is `PackageListing`: title, author handle, kind, truth version, edition, hex count, tags, latest version. The package page adds `description` and the version states. No install button, no catalogue of other people, no report button.

## Later, not in the stub

- Public browse: `GET /api/packages` becomes the catalogue in `api.md`, with `kind`, `q`, `tag`, and `sort`, for every signed-in reader and then the public.
- Install and merge: preview and `POST /api/universes/:id/install` copy pointers when the target hex still matches `baseHash`, and ask on a conflict. `package_installs` records the version.
- Updates: a later version is a new snapshot at the same hex ids. Installing a version the universe already has changes nothing.
- Propose to canonical: `POST /api/proposals` offers one version against the current truth. A reviewer accepts or rejects it. An accept feeds the next truth build.
- Report and takedown: a reader reports a package, and an admin hides it and deletes the public objects. Decision 3: that arrives with the full marketplace, not this stub.
