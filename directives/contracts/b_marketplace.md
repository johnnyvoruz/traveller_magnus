# Marketplace stub contract (size b)

Written 2026-10-11. Updated 2026-10-11: the stub is on disk, unpushed. Browser lanes build against this file.
The zod names below are in `packages/shared/src/schemas/package.ts`. The D1 migration is `apps/api/src/db/migrations/0010_packages.sql`.

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

**Sentences (Z7, 2026-10-17).** The `message` strings quoted below are the codes' old words. Since B3 and Z7, the server sends the sentence a person reads, and `code` is unchanged. Match on `code`, never on `message`:

- `Invalid JSON.`, `Invalid request.`, `Invalid limit.`: "That request could not be read. Try again."
- `Origin check failed.`: "That request was blocked. Reload the page and try again."
- `Role required.`: "You do not have access to that."
- `Sign in required.`: "Sign in to continue." (`requireUser`, B3)

## Shared shapes

| Name | File |
|---|---|
| `PackageHex`, `PackageManifest` | `packages/shared/src/schemas/package.ts` (already exported) |
| `PackageCreate`, `PackagePublish`, `PackageListing`, `PackagePage`, `PackageVersion`, `PackagePublishAccepted`, `PackageListPage` | `packages/shared/src/schemas/package.ts` |

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

### `POST /api/packages` — **on disk, unpushed**

Who: a signed-in user (decision 2).

Body: `PackageCreate`.

```
{ title, kind, description, tags, universeId }
```

All four text fields are required. `tags` may be empty. `universeId` is the universe this package will publish from. The server copies `edition_default`, `engine_version`, and `truth_version` from that row onto the package. A later version cannot name a different universe.

Answer: 201 `PackageListing`. `latestVersion` is 0 and `hexCount` is 0. No R2 object is written.

Storage: one `packages` row. `author_id` is the caller. `slug` is generated and unique. `hidden` is 0. `installs` is 0. `takedown_reason` and `takedown_by` are null. `latest_version` is 0.

Errors: 404 `No such universe.` 400 `Invalid request.` A universe whose `truth_version` is null is 400 `validation`, `This universe is not on a published chart.` Johnny approved that refusal on 2026-10-11. The existing `PackageManifest.truthVersion` is a required string (`packages/shared/src/schemas/package.ts`).

### `POST /api/packages/:packageId/versions` — **on disk, unpushed**

Who: the author (decision 2).

Body: `PackagePublish`, the shape `api.md` already names.

```
{ universeId, hexKeys, recordIds }
```

`hexKeys` is 1–1280 unique `HexKey`s. `recordIds` is 0–500 campaign record ids. Johnny approved both caps on 2026-10-11. 1280 is `BUILDER_LIMITS.hexesPerJob` in `packages/shared/src/schemas/builder.ts`, one sector of 32 by 40.

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

### `GET /api/packages` — **on disk, unpushed**

Who: the signed-in caller. Decision 1 and size b: this is their list, not a catalogue. `api.md` Slice 4's public `GET /api/packages?kind=&q=&tag=&sort=` is not this route. No query filters in the stub.

Query: `cursor` optional, `limit` optional. `limit` defaults to 100 and is clamped to 1–100, the same page rule as `api.md`.

Answer: 200 `{ items: PackageListing[], nextCursor }`. `nextCursor` is a string, or null when the page ends, the same rule as `BuilderHexPage`. Newest `updated_at` first. Another account's rows are absent, not redacted in place. Settled 2026-10-11.

Errors: 400 `validation`, `Invalid limit.`

### `GET /api/packages/:packageId` — **on disk, unpushed**

Who: the author. `api.md` makes this public. Size b does not. Another account, and an id that is not a package, are both 404 `not_found`, `No such package.` The missing row and someone else's row use the same answer. Settled 2026-10-11.

Answer: 200 `PackagePage`.

Errors: 404 `No such package.`

### `GET /api/packages/:packageId/versions/:version` — **on disk, unpushed**

Who: the author. This is how the form reads progress. `api.md` points long work at `/jobs/:jobId`. The stub does not add a package job onto the universe generate route, so that route's answer stays as it is.

`:version` is an integer ≥ 1.

Answer: 200 `PackageVersion`.

Errors: 404 `No such package.` 404 `not_found`, `No such version.`

## Storage

D1, from `data_model.md` §2, plus the columns below that the spec row does not have. Johnny approved them on 2026-10-11. They lock a publish to one universe, report progress, and tell the job which hexes and records to copy.

`packages`

| Column | From | Stub |
|---|---|---|
| `id` | spec | `pk_` + 26 Crockford, as settled above |
| `author_id` | spec | the caller |
| `universe_id` | approved | the universe named at create. Versions cannot switch it. |
| `kind`, `title`, `slug`, `description`, `tags`, `edition`, `truth_version`, `engine_version` | spec | copied as the create route says. `slug` is unique. `tags` is JSON. |
| `latest_version` | spec | 0 until a version is `done`, then that number |
| `installs` | spec | stays 0. No install route. |
| `created_at`, `updated_at` | spec | ISO timestamps |
| `hidden`, `takedown_reason`, `takedown_by` | spec | `hidden` 0, takedown null. No route writes them. |

`package_versions`

| Column | From | Stub |
|---|---|---|
| `package_id`, `version` | spec | version starts at 1 |
| `state` | approved | `queued`, `running`, `done`, `failed` |
| `error` | approved | null, or the failure text sliced to 200 characters |
| `manifest_hash` | spec | sha256 of the manifest's stable bytes. Null until `done`. |
| `content_hash` | spec | sha256 of the records-subset object. Null until `done`. |
| `bytes` | spec | size of the manifest plus the records object plus image bytes this version put |
| `hex_count`, `record_count` | spec | the body lengths |
| `hex_keys`, `record_ids` | approved | JSON arrays, the body lists. The route writes them before it sends the queue message. They are not copied onto `PackageVersion`. |
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

1. The route inserts the version row at `queued`, including `hex_keys` and `record_ids`, and then sends the message. The HTTP answer is 202. The route does not copy objects. The message stays `{ kind: 'publish', packageId, version, universeId }`. The job reads the two lists from the version row.
2. The consumer sets `state` to `running`. A row that is already `done` is left alone, so a retry does not publish twice. A later finish does not move `latest_version` backwards.
3. It reads the hex rows and the named records from that universe's Durable Object, and the truth object when the hex has no row.
4. It copies each missing object to `objects/<sha256>` on the public bucket.
5. It writes the records-subset object, then `packages/<id>/<version>/manifest.json`.
6. It sets the version to `done`, fills `manifest_hash`, `content_hash`, and `bytes`, and sets `packages.latest_version` to this version.

A throw after the row exists sets `state` to `failed` and `error` to the message sliced to 200 characters. `latest_version` stays where it was. Objects already copied stay. They are content-addressed and carry no listing.

Progress: `GET /api/packages/:packageId/versions/:version`. There is no SSE stream in the stub. The server sets no poll interval. The client chooses it. The client built in this tree waits 400 ms. Settled 2026-10-11.

## Lists on the version row (settled 2026-10-11)

Johnny approved two JSON columns on `package_versions`, `hex_keys` and `record_ids`. The route writes them before it sends the queue message. `PackageVersion` does not include them. The queue message stays `{ kind: 'publish', packageId, version, universeId }`.

## Limits

Johnny approved these numbers on 2026-10-11.

| Limit | Number | Where it comes from |
|---|---|---|
| Hexes in one version | 1280 | Not in the package spec. Same number as `BUILDER_LIMITS.hexesPerJob`. Over the cap: 400 `too_large`, `A package holds at most 1280 hexes.` |
| Records in one version | 500 | Not in a spec. Over the cap: 400 `too_large`, `A package holds at most 500 records.` |
| Title | 1–80 characters, trimmed | The sector-name cap. Campaign names allow 200. |
| Description | 0–2000 characters | Not in a spec. |
| Kind | 1–40 characters, trimmed | `PackageManifest.kind` is an unbounded string today. The example in `data_model.md` §7 is `subsector`. No enum is declared. |
| Tags | at most 32, each 1–40 characters | The same numbers as `CAMPAIGN_LIMITS.tags` and `CAMPAIGN_LIMITS.tag`. |
| Versions kept | 100 | Not in a spec. Version 101 is 400 `too_large`, `This package has too many versions.` |
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

---

# Full marketplace (Lane Z, 2026-10-14) — **contract only** below this line

Johnny's five answers of 2026-10-14 (`directives/prompts/z_marketplace.md`). Everything above this line is the stub as built and stays true until phase 2 lands. Every route and change below is **contract only** until its phase report says it is on disk. Where this section and the stub disagree, this section is the target.

## F0. What the code says (checked 2026-10-14)

- The stub's refusal lives in two places: `routes/packages.ts` (create and version) and `jobs/publish_queue.ts` `runPublish` (throws `This universe is not on a published chart.`). D1 `packages.truth_version` is `NOT NULL` (`0010_packages.sql`). `PackageManifest.truthVersion` is a required string. `PackageListing.truthVersion` is already nullable.
- Own sector ids in code are `~` plus 26 Crockford characters (`packages/shared/src/schemas/sector.ts` 12, `OwnSectorId`). `data_model.md` A5 still says `johnny~Sandbox_Alpha`. The code wins; A5 needs a line (orchestrator's file).
- The 250 MB byte quota is `OBJECT_QUOTA_BYTES` in `apps/api/src/jobs/generate_queue.ts` 9, charged on D1 `universes.object_bytes`. The daily cap of 100 is per **user**, not per universe: `DEFAULT_DAILY_LIMIT` in `apps/api/src/auth/allowance.ts` 9, table `generation_allowance`. `universe/budget.ts` is the 120-a-minute mutation budget, not either of those.
- `hexes.provenance` and `campaign_records.provenance` / `campaign_links.provenance` columns already exist in the Durable Object (`hexes.ts` 226, `campaign.ts` 68, 88). `campaign_journal` has no `provenance` column. `insertHex` always writes `provenance` NULL.
- Snapshots: `insertJob` writes a `snapshots` row with `trigger 'generate'` and keeps the captured rows in `meta` (`hexes.ts` 506). An install snapshot uses the same table with `trigger 'install'`.
- Grid: odd-q offset. `apps/web/src/map/geometry.ts` `toGlobal(sx, sy, col, row) = { q: sx*32 + col-1, r: sy*40 + row-1 }`; odd global `q` sits half a row lower (`hexCentre`); cube from offset is `x = q`, `z = r - (q - (q&1))/2`, `y = -x - z` (`hexDistance`).
- A stored tree object (live Regina v10) has top-level `hexKey` and, in `body`, `hexId` and `parentId` at the paths in F6. The engine fixtures carry the legacy slot form (`1-C-1910`); stored trees carry the hex key form (`Spinward_Marches/1910`).

## F1. Publishing from an own map (answer 1)

`POST /api/packages` and `POST /api/packages/:packageId/versions`: the refusal `This universe is not on a published chart.` is removed from both routes and from `runPublish`. No other change to who may call, bodies or errors.

- `packages.truth_version` is stored NULL for an own-map universe (migration F9).
- `PackageManifest.truthVersion` becomes `z.string().nullable()`. `schemaVersion` stays 1: a null is a new value, not a new shape, and every manifest already written has a string.
- `baseHash` with no chart: every `PackageHex.baseHash` is `null`, the same rule the stub already uses for an own-sector key. On install, `baseHash: null` means "the publisher had no chart under this hex"; F4's merge treats a target hex with no row and no chart entry as matching it.
- The chart fallback in `resolvePublish` is skipped when `truthVersion` is null: a key with no row is 400 `validation`, `A hex is not in this universe.`

## F2. Public catalogue and package page (answer 2)

### `GET /api/packages` — **contract only**

Who: anyone, signed out included. Hidden packages and packages with `latest_version = 0` are absent.

Query:

| Name | Rule |
|---|---|
| `q` | optional, 1–100 characters after trim; matches title, description and tags (case-insensitive `LIKE` in phase 2; FTS is later) |
| `kind` | optional, exact match after trim |
| `family` | optional, repeatable, one of `map`, `system`, `ship`, `people`, `patrons`, `organization`, `adventure`, `other`. A package is in the family the store gives its kind: the first row of `PACKAGE_KIND_FAMILIES` (`packages/shared/src/schemas/package.ts`, the same table as `KIND_FAMILIES` in `apps/web/src/marketplace/covers.ts`) with a word anywhere in the kind, case-insensitive; no word is `other`. Repeated values are OR. Any other value is 400 `validation`, `Invalid request.` |
| `author` | optional, 1-64 characters after trim; the publisher's current profile handle, exact match. A handle nobody has answers an empty page |
| `tag` | optional, exact match on one tag |
| `sort` | `updated` (default, newest `updated_at` first), `installs` (most first), `title` (A to Z) |
| `mine` | `1` returns the caller's own packages, hidden and unpublished included: the stub's list. Signed out with `mine=1` is 401 `unauthenticated`, `Sign in required.` |
| `cursor`, `limit` | as the stub; the cursor is opaque and only valid for the same `sort` |

Keys combine with AND (`kind`, `family`, `author`, `tag`, `q`, `mine`). For Lane D: the store can ask for `family=` and `author=` instead of counting and filtering the first 100 cards in the browser. `family` or `author` alone also selects the catalogue, not the stub's list.

Answer: 200 `PackageListPage` of `PackageCard`.

`PackageCard` = `PackageListing` plus `recordCount` (integer, 0 or more: the latest version's count, from the same version and query as `hexCount`, 0 with no version; optional in the schema so an older server's card parses; the page carries it too), `installs` (integer ≥ 0), `updatedAt` (ISO), `hidden` (boolean; always false on the public list, true possible with `mine=1`).

Errors: 400 `validation`, `Invalid limit.` 400 `validation`, `Invalid request.` (bad `sort`, `q` too long, bad cursor).

The client in this tree that calls `GET /api/packages` for "my packages" moves to `?mine=1` in phase 4. Until then the route keeps the stub answer when the caller is signed in and sends no query, so nothing breaks in between. Signed in with any of `q`, `kind`, `tag`, `sort` gives the catalogue.

### `GET /api/packages/facets` (Z6, 2026-10-17)

Who: anyone, signed out included. It counts the same packages as the public catalogue: not hidden, `latest_version > 0`.

The store's filter column, counted over the whole catalogue for a query instead of the loaded cards, so the column is right past 100 packages.

Query (any other key is 400 `validation`, `Invalid request.`; `PackageFacetsQuery` in `packages/shared/src/schemas/package.ts`):

| Name | Rule |
|---|---|
| `q` | optional, 1-100 characters after trim; the same match as the catalogue's `q` |
| `family` | optional, repeatable; the catalogue's families and first-match rule |
| `contents` | optional, repeatable, `hexes` (the latest version has a hex) or `records` (it has none) |
| `edition` | optional, repeatable, exact |
| `tag` | optional, repeatable; a package with any of the tags |
| `updated` | optional, `7` or `30`: `updated_at` within that many days |
| `author` | optional, repeatable; the publisher's current profile handle, exact |

Values of one key are OR; keys are AND, the store's own rule (`apps/web/src/workspace/market/filters.ts`).

Answer: 200 `PackageFacets`:

- `total`: the packages that pass every key, for "N results".
- `scanned`: the packages that match `q`.
- `capped`: true when more than 5,000 match `q`; then the counts cover the 5,000 most recently updated.
- `kinds`, `contents`, `editions`, `tags`, `by`: lists of `{ value, count }`. Each section is counted over the packages every other key lets through, so a count is what ticking that box would show. A value is listed when a package matching `q` has it, or it is in the query, at 0 if nobody has it. `kinds` and `contents` are in the store's fixed order. The others are ranked by how many packages matching `q` have the value, then by name. Blank values are left out, so a package with no handle counts in `total` but has no `by` row.
- `updated`: always three rows, `7`, `30` and `''` (any time), counted over the packages the other keys let through.

For Lane D: send the URL filters as they are (`kinds` → `family`, `by` → `author`) and use the answer's counts in place of `facets()` over the loaded cards. Keep the visit's `seen` values on your side. Words (`FAMILY_WORDS`, `@handle`) stay in the browser.

Errors: 400 `validation`, `Invalid request.` (an unknown key, a bad value, `q` too long).

### `GET /api/packages/:packageId` — **contract only**

Who: anyone, for a package that is not hidden and has a `done` version. The author also sees their own hidden or unpublished package. Everything else is 404 `not_found`, `No such package.`

Answer: 200 `PackagePage`, extended with `installs`, `updatedAt`, `hidden`, and `manifestUrl` (the public URL of the latest done manifest, or null). Non-authors see only `done` versions; the author sees all states.

### `GET /api/packages/:packageId/versions/:version`

Unchanged: author only.

### `POST /api/packages/:packageId/report` — **contract only**

Who: signed in, not the author. Body `PackageReport`: `{ reason }`, 1–500 characters after trim.

Answer: 201 `{ reported: true }`. One open report per user per package; a second is 200 with the same answer and changes nothing.

Storage: D1 `package_reports` (F9).

Errors: 401 `Sign in required.` 403 `Origin check failed.` 404 `No such package.` (missing or hidden). 400 `validation`, `You cannot report your own package.` 400 `Invalid request.`

### `POST /api/admin/packages/:packageId/takedown` — **contract only**

Who: role `admin` (the existing `roleSatisfies`). Body `PackageTakedown`: `{ reason }`, 1–500 characters.

Answer: 200 `{ hidden: true }`. Sets `hidden = 1`, `takedown_reason`, `takedown_by`; marks open reports `closed`; writes the admin audit row the rest of `routes/admin.ts` writes. Public objects are **not** deleted: they are content-addressed and may be shared by other packages and by installed campaigns (A2). The manifest key `packages/<id>/<v>/manifest.json` **is** deleted for every version so the package cannot be fetched by URL.

Errors: 401, 403 `forbidden`, `Role required.` (the sentence `requireRole` in `auth/session.ts` 69 already sends), 404 `No such package.`

`POST /api/admin/packages/:packageId/restore` reverses `hidden` only (manifests are rewritten from the stored version rows' hashes on the next publish; until then a restored package shows no `manifestUrl`). Same callers and errors.

## F3. Imports list and updates (answer 5)

### `GET /api/universes/:id/installs` — **contract only**

Who: the universe owner. Answer: 200 `{ items: InstallRow[] }`, newest first.

`InstallRow`: `{ installId, packageId, title, version, latestVersion, updateAvailable, placement, hexCount, installedAt, removed }`. `updateAvailable` is `latestVersion > version` and the package is not hidden. A hidden package shows `latestVersion` equal to `version` and `updateAvailable` false; the copy stays (answer 5: the campaign keeps its imported copy). Nothing is pushed: the field is computed on read.

Taking an update is the same preview and install (F4, F5) with the newer `version` and **no** placement in the body: the server reuses the placement stored on the install row. Declining is doing nothing.

Errors: 401, 404 `No such universe.`

## F4. Import in place

### `GET /api/universes/:id/install/preview?packageId=&version=` — **contract only**

Who: the universe owner, signed in. The package must be visible to the caller (F2 rules). Optional `placement` (F5) as one JSON query parameter; absent means in place.

Answer: 200 `InstallPreview`:

```
{ packageId, version, placement, hexes: InstallPreviewHex[], records: { add, replace }, sectorsCreated: OwnSectorPlan[], bytes, conflicts }
```

`InstallPreviewHex`: `{ from, to, outcome, current }`. `from` is the key in the manifest, `to` the key it lands on (equal when in place). `outcome` is one of:

| outcome | when (target is `to` in this universe) |
|---|---|
| `already installed` | the target's tree hash equals the (rewritten) `treeHash` |
| `new` | no row, and no chart entry (own map, own sector, or empty chart hex) |
| `replaces chart` | no row, and the chart has a system there, and the chart tree equals `baseHash` (in place) or placement is set |
| `replaces own` | a row exists whose tree equals `baseHash`, or placement is set and the row is an own or override row with provenance from this same install (an update) |
| `conflict` | anything else: a row the referee changed, a chart hex whose tree differs from `baseHash`, or a placed piece over a row with no provenance from this install |

`current` is `{ name, uwp, treeHash }` of what is there now, or null. A `deleted: true` manifest hex previews as `replaces chart` / `replaces own` / `conflict` by the same rules with `to` shown as removed.

`records.add` and `records.replace` count records by id: a record whose id already exists in the universe with the same `provenance.packageId` is `replace`; one with that id and no matching provenance is a conflict listed in `conflicts`; else `add`.

`bytes` is the sum of object bytes this universe does not yet hold (the quota check, F8). `conflicts` is the count of `conflict` rows plus record conflicts.

Errors: 401, 404 `No such universe.`, 404 `No such package.`, 404 `No such version.` (missing or not `done`), 400 `validation`, `Invalid request.` (bad placement), 400 `validation`, `This package is for a different edition.` when `packages.edition` differs from `universes.edition_default` (see question 3 in the phase-1 report: this may need Johnny), 400 `validation`, `The piece does not fit on the map.` (F5), 409 `conflict`, `A sector is already at that position.` (F5).

### `POST /api/universes/:id/install` — **contract only**

Body `InstallRequest`:

```
{ packageId, version, placement?, resolutions: { [toHexKey]: 'theirs' | 'mine' }, recordResolutions: { [recordId]: 'theirs' | 'mine' }, expect: { conflicts } }
```

Every `conflict` row in the preview must have a resolution; a missing one is 409 `conflict`, `Choose theirs or mine for every conflict.` with `details.hexKeys`. `expect.conflicts` must equal the server's fresh count; otherwise 409 `conflict`, `The map changed. Preview again.` (the map moved under the referee). Per-field merge is not in this contract (`data_model.md` A7 names it; see report question 4).

Steps, in one Durable Object call so it is all or nothing:

1. (Taken out in 1.1.15, F14: no snapshot and no undo capture. 1.1.13 and 1.1.14 wrote one; those rows stay and nothing reads them.)
2. Objects: copy each tree, image and rewritten tree object into `u/<universeId>/objects/<hash>` from the public bucket (rewritten ones are written by the rewrite module, F6).
3. Hexes: each `new`, `replaces chart`, `replaces own`, and `conflict` resolved `theirs` writes a row through `insertHex`/`updateHex` with `base_hash` = the target's chart tree or null, `tree_hash` = (rewritten) `treeHash`, summary from the manifest (rewritten), `provenance = { packageId, version, installId }`, history action `install`. `mine` and `already installed` write nothing.
4. Records: each record is written with `provenance = { packageId, version, installId }` and its anchors rewritten (F6). Journal entries are not in packages today (`PackagePublish` names records only), so no journal row is written.
5. Lists: routes and border paths from the manifest's `lists` objects are merged into `lists` (phase 2 publishes them for real; F7).
6. D1: one `package_installs` row; `packages.installs` + 1 on the first install of that package into that universe only.

Answer: 200 `InstallResult`: `{ installId, written, skipped, records }` (`snapshotId` dropped in 1.1.15, F14).

Removing an import: see F14 (a plain delete; no undo, no restore).

Errors: the preview's errors, the two 409s above, 400 `too_large`, `This universe is out of space.` (F8), 403 `Origin check failed.`

## F5. Place elsewhere (answers 3 and 4)

### Placement

`Placement` (shared zod): `{ anchor: HexKey, to: HexKey }`. `anchor` must be a key in the manifest's `hexes`; `to` is where that hex lands. Both keys are resolved to global odd-q coordinates with `toGlobal` and the sector positions this universe knows (chart sectors from the pinned truth's overview, own sectors from `sectors`). The piece moves by the **cube** vector between them:

```
cube(q, r) = { x: q, z: r - (q - (q&1))/2 }
d = cube(to) - cube(anchor)
for each hex h: cube(h') = cube(h) + d, then back: q' = x', r' = z' + (q' - (q'&1))/2
```

An offset (`{dq, dr}`) alone is not accepted: the anchor pair is what the map drag produces, and it carries the sector positions. A placement whose `to` equals `anchor` is in place.

**Worked example (odd column shift).** A piece of three hexes in one sector at slot (0,0): `0101`, `0102`, `0201` (`0101` and `0201` are neighbours; `0201` sits half a row lower, being an odd global q). Anchor `0101` → `0201`, one column right.

| hex | global (q,r) | cube (x,z) | + (1,0) | back to (q,r) | lands on |
|---|---|---|---|---|---|
| 0101 | (0,0) | (0,0) | (1,0) | (1,0) | 0201 |
| 0102 | (0,1) | (0,1) | (1,1) | (1,1) | 0202 |
| 0201 | (1,0) | (1,0) | (2,0) | (2,1) | **0302** |

Adding one to the column in offset form would put `0201` on `0301`, which is no longer next to `0202`'s new place the way it was next to `0102`'s: the shape would shear. The cube shift keeps every neighbour pair. A shift by an even number of columns gives the same answer in both forms.

### Crossing a sector or subsector edge

Allowed. A moved hex whose `(q', r')` falls in another sector takes that sector's slug via `fromGlobal`. Subsector letters are not part of a hex key, so a subsector edge changes nothing in the data. The 1280-hex cap still holds, so a piece can touch at most four sectors.

### Landing where no sector exists

If `fromGlobal` gives a sector position with no chart sector and no own sector, the install creates an own sector there (`OwnSectorId`, a fresh `~` + 26 Crockford id, display name `<package title>` trimmed to 80, empty subsector names), at that exact slot. The preview lists it in `sectorsCreated: [{ id: null, slot: {x,y}, name }]`; the id is minted at install. A slot taken by another own sector is not "empty": hexes land in that sector.

Slot rule (review correction 1, 2026-10-14): there is no band rule in the code. A sector created by a placed install takes any slot that `refuseSlot` (`universe/sectors.ts` 107) accepts for the Builder: inside `SectorSlot` (−1000..1000), holding no chart sector and no other own sector. Phase 3 reuses `refuseSlot`. A slot that holds a chart sector never gets an own sector: hexes there become overrides of the chart (`replaces chart`).

A piece landing in charted space, answer 4: each `to` key in a chart sector is an override row in this campaign only; the truth is not touched. The preview lists every such hex as `replaces chart` before confirm.

`The piece does not fit on the map.`: any moved hex whose sector slot falls outside the `SectorSlot` bounds (−1000..1000), the limit the server enforces (review correction 2). The `geometry.ts` 68 comment is the drawn chart span and is not enforced.

### The rewrite (one pure module)

`packages/shared/src/package_place.ts` (shared because the Worker and, in phase 4, the browser preview outline both need it; `packages/engines` is never touched). Exports:

- `placeKeys(keys, placement, sectorAt) → Map<from, to>`, pure, deterministic.
- `placeTree(tree, map) → tree'`: a deep copy where every census field (F6) whose value names a `from` key gets the `to` key, and `parentId` suffixes are kept (`Spinward_Marches/1910-GG-pre` → `<to>-GG-pre`). Stable-encoded, hashed: a new object with a new hash.
- `placeSummary`, `placeRecord` (anchors), `placeLists` (route and border endpoints).

A field that names a key not in the map (a route endpoint outside the piece) is left as is. A round trip (move away, move back) must give back the original hashes (phase 3 test).

## F6. Location fields (the census)

`tests/generation/package_location_fields.test.js` fails if this list changes in the engine 1.2.0 fixtures:

```
$.hexId  $.hex  $.bodies[].profile.id  ("<ccrr>|<body>")
$.mainworld.hexId  $.mainworld.parentId
$.worlds[].hexId  $.worlds[].moons[].hexId  $.worlds[].moons[].parentId
$.mgt2eData.hexId  $.mgt2eData.parentId  $.mgtSocio.hexId  $.mgtSocio.parentId
$.mgtSystem.hexId  $.mgtSystem.mainworld.hexId  $.mgtSystem.mainworld.parentId
$.mgtSystem.worlds[].moons[].hexId  $.mgtSystem.worlds[].moons[].parentId
```

The rewrite also covers fields the fixtures do not hold: the stored tree's top-level `hexKey` (and the same body paths under `$.body`), `PackageHex.summary` keys that name a hex, `CampaignAnchor` `{ kind: 'system', hexKey }` on records, and route and border-path endpoints in `lists`. `$.bodies[].profile.id` and `$.hex` are profile fixtures (render output, not stored trees); they are listed so a change shows, but no stored object carries them today. The census covers the fixtures' body shape, not the stored envelope (review correction 3). Phase 3's test also walks a real stored envelope (built with `generateHex` for `Spinward_Marches/1910` from the tracked TSV, plus a hand-made tree) and pins `$.hexKey`, `$.body.mgt2eData.{hexId,parentId}`, `$.body.mgtSocio.{hexId,parentId}`, `$.body.mgtSystem.hexId`, `$.body.mgtSystem.mainworld.{hexId,parentId}`, `$.body.mgtSystem.worlds[].moons[].{hexId,parentId}`; nothing in `derivation`.

## F7. Lists on publish

Phase 2 replaces the stub's empty-array hashes: `lists.routes` is the hash of the routes from `lists` whose both ends are in `hexKeys`; `lists.borderPaths` likewise for border paths wholly inside. Edges that leave the piece are dropped (report question 2).

## F8. Limits and charges

| Limit | Rule |
|---|---|
| Hexes, records | the stub's 1280 and 500, per version and so per install |
| Byte quota (250 MB, `OBJECT_QUOTA_BYTES`) | An install **counts**: objects copied into the universe's private prefix are charged to `universes.object_bytes` through `chargeObjectBytes`, keyed by `installId`. Over the quota: 400 `too_large`, `This universe is out of space.` checked at preview (`bytes`) and again at install. |
| Daily cap (100 systems a user a day) | An install **does not count**: it copies, it does not generate (the allowance guards generation compute). |
| Mutation budget (120 a minute) | One install is one mutation. |

## F9. Migration `0015_marketplace.sql`

Safe in either order:

- `packages.truth_version` nullable: SQLite cannot drop `NOT NULL` in place, so the migration builds `packages_new` with the same columns (nullable `truth_version`), copies rows, drops and renames, recreates both indexes. The old Worker only ever writes a string, so it runs before or after.
- `CREATE TABLE package_installs (id TEXT PRIMARY KEY, universe_id, package_id, version, placement TEXT NULL, hex_count, created_at, updated_at)` with index on `(universe_id)`. An update rewrites `version` and `updated_at` on the same row.
- `CREATE TABLE package_reports (id, package_id, user_id, reason, state 'open'|'closed', created_at)`, unique `(package_id, user_id, state)` where open.
- New Worker code that reads `package_installs` or `package_reports` before the migration answers 503 `unavailable`, `The marketplace is being updated. Try again soon.` by the probe pattern `object_charge.ts` uses. Old code ignores the new tables.

## F10. Shared zod names (phase 2 and 3)

`PackageCard`, `PackageCatalogueQuery`, `PackageReport`, `PackageTakedown`, `Placement`, `InstallPreview`, `InstallPreviewHex`, `InstallOutcome`, `OwnSectorPlan`, `InstallRequest`, `InstallResult`, `InstallRow`, `InstallList`, in `packages/shared/src/schemas/package.ts`; `PackageManifest.truthVersion` nullable.

## F11. Build plan, phases 2 to 4

Phase 2 — server, in place (needs: migration, shared, routes, DO):
1. `apps/api/src/db/migrations/0015_marketplace.sql` and `db/schema.ts` (F9). Test: `tests/api/packages_migration.test.js` extended (both orders).
2. `packages/shared/src/schemas/package.ts`: F10 names except `Placement`'s use; `truthVersion` nullable. Test: a new `tests/shared/package_schema.test.js`.
3. `routes/packages.ts` + `jobs/publish_queue.ts`: own-map publish (F1), catalogue and page (F2), report; `routes/admin.ts`: takedown and restore. Lists published (F7).
4. `apps/api/src/universe/install.ts` (new): preview and install in the DO (F4), snapshot, provenance, records; `UniverseDO.ts` routes `/install/preview`, `/install`; Worker routes in a new `routes/installs.ts`; `package_installs` and installs list (F3).
5. Tests `RUN_API_TESTS=1`: `tests/api/packages.test.js` (signed out, other account, hidden, report, takedown), new `tests/api/install.test.js` (each outcome, conflict both ways, already installed, update, quota, every error sentence).
Phase 3 — placement: `packages/shared/src/package_place.ts` and `tests/generation/package_place.test.js` (every F6 field, round trip, odd-column example above, edge crossing); `install.ts` takes `placement`, own-sector creation; tests in `install.test.js` over charted space and across a sector edge.
Phase 4 — browser, as the prompt says; the outline drag calls `placeKeys` from shared for its preview.

Split change from the prompt: none, except the rewrite module lives in `packages/shared` (not `packages/generation`) because the browser needs it and `shared` may import only zod: the module imports nothing.

## F12. Phase 2 as built (2026-10-14) — **on disk, unpushed**

Johnny's phase-2 answers: routes and border paths that leave the piece are dropped; another edition is refused, `This package is for a different edition.`; a conflict is theirs or mine per hex; a takedown hides the package, removes its manifests from the public bucket and keeps the objects; an install counts against the 250 MB quota, not the daily cap. Where F1 to F11 and this section differ, this section is what the code does.

- **F1, own maps.** Both refusals and the job's refusal are gone. `packages.truth_version` stays `NOT NULL`; an own-map package stores `''` (`OWN_MAP` in `routes/packages.ts`) and every answer shows `truthVersion: null`. No table rebuild, so no migration risk on `packages` (this replaces F9's rebuild). `PackageManifest.truthVersion` is nullable. A key with no row on an own map is 400 `A hex is not in this universe.`
- **F2, catalogue.** `GET /api/packages` signed in with none of `q`, `kind`, `tag`, `sort`, `mine` returns the stub's own list (`PackageListPage` of `PackageListing`), so the screens in this tree are unchanged. Otherwise it is the catalogue: `PackageCardPage` of `PackageCard` (`installs`, `updatedAt`, `hidden`). Search is case-insensitive `LIKE` over title, description and the tags JSON. The cursor is opaque and tied to its `sort`; a cursor from another sort is 400 `Invalid request.` Unknown query keys other than `cursor` and `limit` are ignored.
- **F2, page.** `GET /api/packages/:packageId` answers `PackagePublicPage` (= `PackagePage` + `installs`, `updatedAt`, `hidden`). `manifestUrl` is **not** built: the Worker has no public base URL binding; the client can derive the manifest key `packages/<id>/<v>/manifest.json` from `versions`.
- **F2, report.** As F2. 503 `The marketplace is being updated. Try again soon.` when `package_reports` is absent.
- **F2, takedown and restore** are in `apps/api/src/routes/admin_packages.ts`, mounted at `/api/admin/packages` (not in `routes/admin.ts`). 403 is `Role required.` (`requireRole`, `auth/session.ts` 69). Takedown moves each done version's manifest to the private bucket at `takedown/packages/<id>/<v>/manifest.json` and deletes the public key; restore moves it back. Objects are never deleted. Audit actions `package.takedown`, `package.restore`. Restore takes no body.
- **F3, imports list.** `GET /api/universes/:id/installs` → `InstallList` of `InstallRow` (`installId, packageId, title, version, latestVersion, updateAvailable, placement: null, hexCount, installedAt, updatedAt`). There is no `removed` field.
- **F4, preview.** `GET /api/universes/:id/install/preview?packageId=&version=` → `InstallPreview`. Each `InstallPreviewHex` also carries `removes` (the manifest marks the hex deleted). `records.conflicts` is the list of record ids, `records.add` and `records.replace` are counts. Any `placement` query is 400 `Invalid request.` until phase 3. The edition check compares `packages.edition` with `universes.edition_default`.
  Outcome rules as coded (`universe/install.ts` `outcomeOf`): `already installed` when the target already holds the package's tree (or is already empty for a removed hex); with a stored row, `replaces own` when the row's tree is `baseHash` or the row still holds the tree an earlier install of this package wrote (provenance `treeHash` equals the row's tree), else `conflict`; with no row on a chart hex, `replaces chart` when the chart tree is `baseHash`, else `conflict`; with no row and no chart, `new` when `baseHash` is null, else `conflict`.
- **F4, install.** `POST /api/universes/:id/install`, body `InstallRequest` (`packageId, version, resolutions, recordResolutions, expect: { conflicts }`), strict, no `placement`. Answer `InstallResult`: `{ installId, written, skipped, records, snapshotId }`. Order: preview again, 409s, quota, copy missing objects public → `u/<id>/objects/<hash>`, then one Durable Object call: snapshot row + captured rows in one transaction with the hex writes; records then go through the campaign change path (its own transaction). Hex rows carry `provenance = { packageId, version, installId, treeHash }`, history action `install`. A removed hex writes a chart tombstone, or deletes the row on a non-chart key. An update reuses the in-place `package_installs` row (same `installId`); `packages.installs` counts universes, not updates.
- **Record provenance.** `CampaignProvenance` is strict (`mode, universeId, recordId, rev, at`, `schemas/campaign.ts` 126), and that file is not in this go. Installed records carry `{ mode: 'copy', universeId: <the package's source universe>, recordId, rev, at: <manifest publishedAt> }`; a record whose id is already here with that `copy` provenance is `replace`, any other is a conflict. The package id is not on the record (report question 1).
- **Journal entries** are not in packages (`PackagePublish` has no journal ids), so none are written.
- **F7, lists.** The Durable Object stores no routes or border paths (only `campaignSettings` and `campaignTime` rows in `lists`), so publish still writes the empty-array hashes. Johnny's "drop the ones that leave the piece" applies when routes are stored.
- **F8, limits.** Quota: 400 `too_large`, `This universe is out of space.`, checked at preview and install against `universes.object_bytes` + bytes not yet held; charged with `chargeObjectBytes` keyed by `installId`. The install also goes through the universe's reservation (`contracts/b_builder.md`): before the copy it reserves the preview's `bytes` under its charge id with `POST /quota/reserve`, and it releases that id after `chargeObjectBytes`, or on any failure on the way (a failed put, a 409 or 429 from the Durable Object). A refusal while another writer holds the room is the same 400 `too_large`, `This universe is out of space.` The preview still reads D1 only. Daily cap: not touched. Mutation budget: `/install` takes one mutation in the Durable Object (429 `Too many requests.`).
- **F9, migration** `0015_marketplace.sql`: `package_installs` and `package_reports`, every statement `IF NOT EXISTS`, no change to existing tables. Worker before migration: install, installs list and report answer 503 `The marketplace is being updated. Try again soon.` (probed per request); catalogue, page and publish keep working. Migration before Worker: the old Worker never names the new tables.
- **Undo.** No restore route (see F4 undo). The undo point is written.
## F13. Phase 3 as built (2026-10-14) - **on disk, unpushed**

### Placement (part A)

- `GET /api/universes/:id/install/preview` takes `anchor` and `to` (both hex keys, both or neither), or `installId` to preview an update of that import. Both together is 400 `validation` "An update keeps its placement. Leave the anchor out." The old `placement` query is still 400 `Invalid request.`
- `POST /api/universes/:id/install` takes `placement: { anchor, to }` or `installId` (zod refuses both). A placement makes a new import row each time; `installId` reuses the row and its stored placement; neither reuses the in-place row.
- The shift is `packages/shared/src/package_place.ts` (F5 cube shift). Source slots: the package's truth manifest `sectors[]` plus the source universe's own sectors. Target slots: the target truth manifest plus its own sectors; `~slot_x_y` names empty space.
- Refusals, 400 `validation`: "The piece does not fit on the map." (a slot outside -1000..1000), "The anchor is not in the package.", "A sector of the piece is not on the map.", "That hex address is not valid."
- Empty space: the preview lists `sectorsCreated [{ id, slot, name }]`. The id is `~` plus 26 Crockford characters from sha256(universe | row or package+placement | slot), so the preview and the install agree. The DO makes the sectors in the install transaction (`makeImportSector`); a taken slot is 409 "The empty space for this piece was taken. Open the preview again."
- Every tree is rewritten (`placeTree`), stored as a new private object and charged to quota. Summaries get `entry.tree` = the new hash; records go through `placeRecord`.
- With a placement the package base hash is not used: a charted hex is `replaces chart` (the chart in R2 is not touched; the row is an override), an untouched row of this package is `replaces own`, any other row is `conflict`, empty is `new`.
- Records carry `{ mode: 'package', packageId, version, installId, at }`. `copy` and `shared` still parse. A record is replaced without asking when it is package mode with this package, or legacy copy mode from the source universe.
- The universe must be pinned (opened once) before an import. Hex reads in an unpinned universe already say "This universe has no generation pin."

### Undo of an import (part B) - **taken out in 1.1.15; see F14**

- Shipped in 1.1.14 and removed in 1.1.15 (Johnny, 2026-10-14). The route, its DO route `/install/restore`, `InstallRestored` and `InstallRow.removed` are gone. Migration 0016 stays as pushed; its `removed_at` column is no longer read or written. The text below is history.
- `POST /api/universes/:id/snapshots/:snapshotId/restore`. Owner only (`ownedUniverse`). Answer `InstallRestored { snapshotId, hexes, records, sectors }`.
- One DO call (`/install/restore`), one transaction: the checks, then every write.
- Only `install` snapshots: other triggers are 400 `validation` "Only an undo point made by an import can be restored here." An unknown id is 404 "There is no such undo point."
- Every hex the import wrote goes back to the captured row; a hex the import created is removed. Every record goes back to its captured row; a record the import created is tombstoned. Each has a new rev (and seq for records) so devices pull it. History action `restore`.
- Own sectors the import made are marked deleted, unless a system is still stored in them.
- A second restore is 409 `conflict` "This import is already undone."
- After later edits: refused, 409 `conflict` "Some systems or records changed after the import. Undo those changes first, then try again." with `details { hexKeys, recordIds }`. The DO compares the current rev with the rev the import wrote (meta `installed:<installId>`).
- A later import of the same row in place: 409 "Undo the later import of this package first." Undo goes newest first.
- Imports from before phase 3 have no `installed:` record: 409 "This import was made before undo was possible, so it cannot be undone."
- D1: undoing a first import sets `package_installs.removed_at` (migration `0016_package_installs_removed.sql`); the list shows `removed: true` and `updateAvailable: false`. Undoing an update puts the earlier version back on the row. Importing again clears `removed_at`. A Worker without 0016 answers the restore route with 503 and lists `removed: false`; 0016 without the new Worker is ignored.
- Quota: no refund. The trees stay in private storage and are still named by hex history, generate snapshots and other imports; R2 has no reference count to say an object is free.

## F14. Phase 3c: one import per package, remove is a plain delete (1.1.15) - **on disk, unpushed**

Johnny, 2026-10-14: "make the record and then CRUD delete it vs. all this undo." No quota refund when an import is removed.

### One import per package per campaign

- A campaign holds a package once: one `package_installs` row per (universe, package).
- `GET /api/universes/:id/install/preview` and `POST /api/universes/:id/install`: an import of a package the campaign already holds is 409 `conflict`, "This campaign already has this package. Remove it first, or take its update."
- Taking an update is the same row and keeps its placement: name the row with `installId`, or, for an in-place import, leave both `installId` and the placement out (the in-place row is found, as in 1.1.13). A placement given for a package the campaign holds is the 409 above; to move a piece, remove it and import it again.
- A 1.1.14 campaign that already holds one package twice keeps both rows; each updates by `installId`, and an import without one is the 409.
- Hex rows and records now carry the row id as `provenance.installId`. Rows from 1.1.13 and 1.1.14 carry a per-call id; the delete below still finds them.
- No snapshot, no `install:`, `installed:`, `installrow:` or `restored:` meta keys are written. Own sectors an import makes are listed in meta `installsectors:<installId>` so the delete can take them away.

### `DELETE /api/universes/:id/installs/:installId`

- Owner only (`ownedUniverse`), origin-checked.
- One Durable Object call (`/install/remove`), one transaction, all or nothing.
- Deletes every hex row whose provenance names this import, edited since or not: a charted hex shows the chart again; an own-sector hex is empty. History action `remove`.
- Deletes every record (provenance mode `package`) of this import the way the campaign's own delete does it: a tombstone at a new rev and seq, and its links too.
- An own sector the import made is deleted when no row is left in it (sector history action `delete`).
- Then the `package_installs` row is deleted; it is gone from the imports list. `packages.installs` is not lowered (it counts universes that ever imported).
- Which rows: when this row is the only import of the package in the campaign, every row and record of the package. Otherwise (a 1.1.14 campaign with the package twice), rows naming this row id, or a per-call id that 1.1.14 meta `installed:<id>` / `installrow:<rowId>` ties to this row.
- Answer: 200 `InstallRemoved { hexes, records, sectors }` (counts).
- Errors: 401 `Sign in required.`, 403 `Origin check failed.`, 404 `No such universe.`, 404 `No such import.`, 503 `The marketplace is being updated. Try again soon.` before 0015.
- Quota: no refund. Bytes stay charged.
- Imports made on 1.1.13 and 1.1.14 delete the same way. Their snapshot rows and meta keys stay where they are.

Single systems and records from an import stay editable and deletable through the normal Builder and campaign routes.

## F15. The manifest carries own-sector slots - **on disk, unpushed**

- `PackageManifest.ownSectors` (optional): `{ [ownSectorId]: { x, y } }` for each own sector a published hex sits in. The publish job writes it from the source universe at publish time; it is left out when the piece has no own-sector hex.
- `place()` in `routes/installs.ts` reads source slots from `manifest.ownSectors` first. Only a manifest without the field (published before F15) falls back to the source universe's Durable Object.
- So a placed preview and a placed import land the same after the source universe is emptied or deleted.
- Deleting content never claws it back from anyone who installed it: deleting the source universe or taking the package down leaves the installed hexes, objects and records in other campaigns byte-identical.
- Test: `tests/api/install_source_gone.test.js`.
## F16. Links travel in a package - **on disk, unpushed**

- `PackageManifest.records.links` (optional): `{ contentHash, count }`, a content-addressed list of the source campaign's live links whose two ends are both published records, sorted by id, each as stored (visibility, role, notes, order, since, until included).
- The publish job reads them from the source universe's object (`GET /campaign`, paged) at publish time. No such link: the field is left out.
- An install writes them after the records, through the campaign change path, each with provenance `{ mode: 'package', packageId, version, installId, at }`. Record ids are kept on install, so the ends need no rewrite. A link lands only when both its ends are live records in the campaign.
- `InstallResult.links` (optional): links written.
- Remove (F14) deletes the links of the import with its records: a tombstone at a new rev and seq, also when both ends stay because they were kept as "mine".
- A manifest without `links` parses and installs as before.
- Test: `tests/api/install_links.test.js`.
## F17. Covers - **on disk, unpushed**

### The order
1. **An upload:** the publisher's own image (for example a screenshot of their sector), set with `PUT /api/packages/:packageId/cover`.
2. **Record art:** the first image (`images[0]`) of the first record that has one, in the package's record order, in the **latest done version**.
3. **Nothing:** `cover: null`. The browser shows the default for the package's kind. The server never names a default.

### On the wire
- `PackageCard.cover` and `PackagePublicPage.cover`: `{ hash, thumbHash, source: 'upload' | 'record' } | null` (`PackageCover` in `packages/shared/src/schemas/package.ts`).
- Both hashes name objects in the public bucket. The browser builds the addresses itself: `https://cdn.traveller.voyage/objects/<hash>` and `.../objects/<thumbHash>`.
- This server always sends the field. The schema marks it optional, so a card from an older server still parses.
- An open tab from before F17 ignores the field: `marketplace/catalogue.ts` casts the payload (`payload.data as T`) and does not parse it strictly. Checked on 2026-10-15.
- `cover` is null:
  - before 0019;
  - when there is neither an upload nor record art;
  - on a hidden package for anyone but an admin. That includes the author, in `?mine=1` and on the page.

### `PUT /api/packages/:packageId/cover`
- The author only. Anyone else gets 404 "No such package.". The origin is checked as on every write.
- **Body:** one `multipart/form-data` request with four parts:
  - `image`: the full image, a WebP file;
  - `thumb`: the thumbnail, a WebP file;
  - `hash`: the SHA-256 of `image`, as 64 lowercase hex characters;
  - `thumbHash`: the SHA-256 of `thumb`, in the same form.
- **Limits:**
  - The image is at most 2 MB and at most 1600 px on its long side.
  - The thumbnail is at most 200 KB and at most 640 px on its long side.
  - Any aspect ratio is accepted. D crops to 16:9 on the card and shows the image whole on the page.
  - The size is read from the WebP header (VP8, VP8L or VP8X).
- **Answer:** 200 `{ cover: { hash, thumbHash, source: 'upload' } }`.
- **Refusals,** in the order they are checked:

| Status | Code | Message |
|---|---|---|
| 401 / 403 | (session and origin, as elsewhere) | |
| 503 | unavailable | Covers are not available yet. (no 0019) |
| 404 | not_found | No such package. (not the author, or no such id) |
| 403 | forbidden | A hidden package cannot change its cover. |
| 400 | too_large | A cover is at most 2 MB. (when the body is larger than both limits plus 64 KB) |
| 400 | validation | Send the cover as a form with image, thumb, hash, and thumbHash. |
| 400 | validation | Hash must be 64 lowercase hex characters. (either hash) |
| 400 | too_large | A cover is at most 2 MB. |
| 400 | validation | A cover is a WebP image. |
| 400 | validation | A cover is at most 1600 px on its long side. |
| 400 | validation | The hash does not match the cover. |
| 400 | too_large | A cover thumbnail is at most 200 KB. |
| 400 | validation | A cover thumbnail is a WebP image. |
| 400 | validation | A cover thumbnail is at most 640 px on its long side. |
| 400 | validation | The thumbHash does not match the thumbnail. |

- **Storage:** the bytes go straight to the public bucket at `objects/<hash>` with content type `image/webp`. An object that is already there is not written again.
- **Quota:** covers count against no quota. Each package has one pair, at most 2.2 MB, and a replaced or removed pair is deleted. The universe's 250 MB is for the publisher's private objects, and a cover is not one of them.

### `DELETE /api/packages/:packageId/cover`
- A plain delete. It has the same author, origin, 0019 and hidden refusals as the upload.
- It answers 200 `{ cover }`: whatever now shows, either record art or null. There is no undo.
- It succeeds when there is no upload.

### Replacing and removing
- The old object is deleted from the public bucket unless something still names it:
  - another package's upload (`packages.cover_hash` or `cover_thumb_hash`), or
  - an image of any record in any done version, this package's included (`package_versions.image_hashes`, a JSON array the publish job writes from `records.imageHashes`).
- That is how we know an object is still named: one D1 query each, with no manifest read. Any done version whose row has not been filled yet is filled first (see the backfill).

### Takedown and restore
- **Takedown** copies the uploaded pair to the private bucket at `takedown/covers/<packageId>/<hash>`. It then deletes the public object, unless another package or a published record names it (the same check as above).
- **Restore** puts each held object back on the public bucket and deletes the held copy.
- Both are written to the audit log under `details.covers`.
- Record art stays on takedown, as record objects do today.
- A hidden package cannot take or drop a cover, and its cover shows to admins only.
- The report form covers the cover with no change in wording: a reader reports the package, cover included.

### Migration 0019 and the probe
- `0019_package_covers.sql` adds:
  - on `packages`: `cover_hash` and `cover_thumb_hash`;
  - on `package_versions`: `art_hash`, `art_thumb_hash`, `image_hashes` and `art_filled` (integer, default 0).
- The Worker probes for `packages.cover_hash` (`coversReady` in `jobs/publish_queue.ts`). A yes is kept for the isolate. A no is asked again, so applying the migration needs no redeploy.
- Without 0019:
  - `cover` is null everywhere;
  - an upload or delete answers 503 "Covers are not available yet.";
  - publish, takedown and restore work as before.
- Both states are tested.

### Record art at publish, and the backfill
- The publish job writes `art_hash`, `art_thumb_hash`, `image_hashes` and `art_filled = 1` on the version row as it stores the manifest. The catalogue never opens a manifest for a version published after 0019.
- **The backfill is a lazy fill on first read.** A done version with `art_filled = 0` (published before 0019) is filled once from its manifest and its records object. This happens when its cover is first read, or before an "is it still named" check.
  - The manifest is read from the public bucket, or from the takedown copy for a hidden package.
  - There is no script to run.
- Tests: `tests/api/package_covers.test.js` (both states), `tests/shared/package_cover.test.js`, `tests/tools/examples.test.js`.

### The example packs
- A `listing.json` may name `"cover": "covers/<pack-folder>.webp"`. `covers/<pack-folder>_640.webp` beside it is the thumbnail.
- `build_local.mjs` uploads the cover through the route after publishing.
- `seed_production.mjs`:
  - names each cover in the dry run;
  - copies the pair with `--apply`;
  - refuses a target without 0019;
  - with `--remove --apply`, deletes each cover object that no package outside the examples names.

## Records-only packages (F18)

A package version can carry records and no hexes: a cast of people, a set of factions. This
section is for Lane D. Nothing new is on the wire except `records.anchorsDropped`.

### Publishing from records

- `POST /api/packages/:id/versions` accepts `hexKeys: []` with a non-empty `recordIds`.
- With both empty, the server answers 400 `validation`, "A package needs at least one hex or one record."
- The caps are unchanged.
- The manifest has an empty `hexes` map. `truthVersion` and `edition` are recorded as for any version.
- Offer a publish entry from the records list. Don't ask for a hex selection.

### The card and the page

- The card and the page show `hexCount` 0 and the latest version's `recordCount`, which `PackageCard` and `PackagePublicPage` now carry: "People · 12 records".
- On the page, hide the hex box when `hexCount` is 0. Show the record count instead.

### Import

- A records-only package has no placement. A `placement` on `POST /api/universes/:id/install`,
  or `anchor` and `to` on the preview, is 400 `validation`, "Invalid request." Don't show the placement step.
- It installs into a campaign on any truth version. Records are written with provenance, as for any package.
- Anchors:
  - Chart anchors (`Sector/0000`) are kept, whatever the target's truth version.
  - Own-sector anchors (`~` keys) are dropped: the record is installed with no anchor.
  - No anchor is rewritten.
- The preview's `records.anchorsDropped` counts the dropped anchors. It's sent for every
  package, 0 when none are dropped, and is optional in the schema for older servers.
  When it's above 0, say so before the install, for example "2 records lose their place on the map."
- Packages with hexes are unchanged (F6).
