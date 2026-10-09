# API — `/api/*` on the voyage Worker

**Status:** ADOPTED 2026-10-02 (revised the same day: platform generation, jobs, search,
admin). Hono routes in `apps/api/src/routes/`; universe routes are forwarded to the universe's
Durable Object after the owner check. Every body and query is validated with the zod schema
named in the last column, defined in `packages/shared`.
Envelope: `{ ok: true, data }` or `{ ok: false, error: { code, message, details? } }`.
Auth: `public`, `user`, `owner` (of `:id`), `author` (of `:packageId`), `reviewer`, `admin`.
Long work returns **202** with `{ jobId }`; progress at `/jobs/:jobId` or the SSE stream.

Pagination: `?cursor=&limit=` (limit ≤ 100) → `{ items, nextCursor }`.

Public static data is **not** behind the API: truth indexes and objects, package manifests and
players' views are read from `https://cdn.traveller.voyage`.

---

## Slice 0

| Method | Path | Auth | Purpose | Schema |
|---|---|---|---|---|
| GET | `/api/health` | public | `{ version, engineVersion, truthVersion, db: 'ok' }`; runs `SELECT 1` | — |
| ANY | `/api/auth/*` | public | owned by better-auth: `POST /api/auth/sign-in/social` (`{ provider, callbackURL }`), `GET /api/auth/callback/:provider`, `POST /api/auth/sign-out`, `GET /api/auth/get-session`, admin plugin routes. A provider whose secrets are absent is not registered, and better-auth answers its sign-in with its own 4xx | better-auth's |
| GET | `/api/me` | user | current user: better-auth session user (id, email, role) plus our `profile` row | `User` |
| POST | `/api/generate/preview` | user | **Built.** Stateless `{ edition, mode, seed, settings, hexKey, inputs }` → `{ envelope, hash, entry }`. `entry` is `chartEntry` of that body. Nothing is stored. The hash matches Node. | `GeneratePreview` |
| GET | `/api/truth/versions` | public | released truth versions | — |
| GET | `/api/truth/search?q=&version=` | public | FTS over `truth_systems`: name, hex, UWP, sector | — |
| POST | `/api/admin/truth/build` | admin | `{ version, milieu, engineVersion, seed, settings, sectors, from?, transform? }` → 202 `{ version, enqueued }`; `sectors` is a slug array or `'all'` (every slug in `inputs/<version>/sectors.json`); `from` copies a released version and requires `sectors: 'all'` plus the same milieu, seed, engine version, and settings; `transform: 'reconcile-environment'` (only with `from`) reconciles each stored tree and writes `truth/<version>/reconciliation.json`; enqueues one message per sector at offset 0; 409 if the version exists; `milieu` is a TravellerMap milieu code such as `M1105` | `TruthBuild` |
| GET | `/api/admin/truth/builds/:version` | admin | progress and per-sector state, read from `truth_build_sectors` | — |
| POST | `/api/admin/truth/builds/:version/retry` | admin | `{ sectors?: string[] }`; re-enqueues at offset 0 every `failed` sector and every `building` sector not updated for 10 minutes, or the named slugs in any state; a `reconcile-environment` build is re-queued with that transform; → 202 `{ version, enqueued }`; 409 if released; audit logged (`architecture.md` §5) | `TruthRetry` |
| POST | `/api/admin/truth/builds/:version/remove` | admin | `{ version }` must equal the path; removes a `building` or `failed` version that never released: its `truth_versions`, `truth_build_sectors` and `truth_systems` rows, and every key under `truth/<version>/`; objects, inputs and the reconcile cache stay; 400 when the names differ; 409 when released, withdrawn, or any other state; audit logged (`truth.remove`) | local zod in `admin.ts` |
| POST | `/api/admin/truth/release/:version` | admin | refuses unless every sector is `done`; rewrites each sector index with `Cache-Control: public, max-age=31536000, immutable` (same bytes); a build that has `truth/<version>/reconciliation.json` also seals each sector reconciliation report and the total, and a missing one of those is 409; any other public reconciliation file that is present is sealed too; then writes overview, polities and the manifest and marks released; a seal failure writes none of those three and leaves the version unreleased; audit logged | — |
| GET | `/api/admin/truth/preview?version=&sector=&hex=` | admin | reads that version's public sector index and the one tree object and returns the hex entry plus the tree for the dossier; also returns the same hex from the latest other released version when that index has it; writes nothing and does not pin a universe | local zod in `admin.ts` |

## Slice 2 — universes, generation, changes

| Method | Path | Auth | Purpose | Schema |
|---|---|---|---|---|
| GET | `/api/universes` | user | **Built.** my universes, not deleted | — |
| POST | `/api/universes` | user | **Built.** create `{ name, truthVersion \| null, editionDefault, id? }`. The response is the row just built. `truthVersion` is a released version or null. An eleventh live universe is `too_large`. `engineVersion` is the current one. Creates the Durable Object. A thrown failure after the insert deletes that row. The same caller posting the same `id` again gets that universe, `200`, and no second row. | `UniverseCreate` |
| GET | `/api/universes/:id` | owner | **Built.** the catalogue row. Missing, deleted, or not yours is 404 | — |
| PATCH | `/api/universes/:id` | owner | **Built.** rename (`name`) | `UniverseUpdate` |
| DELETE | `/api/universes/:id` | owner | **Built.** soft delete; `purge_after` 30 days on | — |
| GET | `/api/providers` | public | **Built.** `{ twitter, discord, google }` booleans. A provider is true only when both of its secrets are set. The sign-in card offers those. | `SignInProviders` |
| GET | `/api/universes/:id/hexes?sector=&cursor=&limit=` | owner | **Built.** override rows for one sector, newest key order, `limit` ≤ 100. No row means the chart (or empty, on an own map). A universe that has never generated returns an empty page. | `BuilderHexPage` |
| GET | `/api/universes/:id/hexes/:sector/:local` | owner | **Built.** one stored row. The hex key is the two segments. No row is 404. | `BuilderHex` |
| POST | `/api/universes/:id/hexes/:sector/:local/remove` | owner | **Built.** `{ baseRev }`. A pinned map tombstones the row (`state: removed`, tree cleared, `baseHash` kept, `entry` kept). A chart hex with no row, at `baseRev` 0, writes that tombstone and sets `baseHash` to the chart tree. An own map deletes the row and returns `rev: 0`. An empty hex is 400 `validation` `details.reason` `empty`. Stale `baseRev` is 409 `conflict` with `details.current`. | `HexRemove` |
| POST | `/api/universes/:id/hexes/:sector/:local/restore` | owner | **Built.** `{ baseRev }`. Deletes the override so the chart shows. An own map is 400 `validation` `details.reason` `no_chart`. | `HexRestore` |
| POST | `/api/universes/:id/hexes/:sector/:local/revert` | owner | **Built.** `{ toRev, baseRev }`. Copies that history row forward as a new rev. `toRev: 0` deletes the row. | `HexRevert` |
| GET | `/api/universes/:id/objects/:hash` | owner | **Built.** streams the private object to its owner with the stored type and `Cache-Control: private, immutable`. Another account, a missing universe, or a missing hash is 404 | — |
| PUT | `/api/universes/:id/objects/:hash` | owner | **Built.** body is the image. `:hash` is 64 lowercase hex and the SHA-256 of the body. The body starts `RIFF....WEBP` and is at most 8 MB. Origin is checked. Key `u/<universeId>/objects/<hash>` in the private bucket. An existing key is 200 and is not written. A new key is 201 and its length is added to `object_bytes`. Over 250 MB per universe is `too_large` | — |
| POST | `/api/universes/:id/generate` | owner | **Built.** `{ hexKeys, edition, generator, roll?, filledToo?, baseRev? }`. One hex runs inline and returns `{ rows, skipped }`. Each row includes `entry`. `baseRev` is required for one hex. More than one hex returns 202 `{ jobId }` and a `voyage-generate` job in batches of 64. `roll` 0 uses the universe seed; a higher roll is `<seed>/roll/<n>`. `filledToo` defaults false and leaves a hex that already has a system. A `removed` hex is empty and can be generated. Ready pairs are Mongoose top-down and Architect of Worlds bottom-up. Anything else is 400 `validation` `details.reason` `generator_unavailable`. The tree is `generateHex`'s envelope, stored unread. `entry` is `chartEntry` of that body. | `BuilderGenerate` / `BuilderGenerateDone` / `BuilderJobAccepted` |
| GET | `/api/universes/:id/hexes/:sector/:local/form` | owner | **Built.** The stored system as an edit form. `hash` is the envelope a draft or Keep must name. No stored tree, including a removed row, is 404. | `FormRead` |
| POST | `/api/universes/:id/hexes/:sector/:local/draft` | owner | **Built.** `{ hash, changes, roll? }`. Applies the draft and returns the new form, the ids that moved, and any engine message. Nothing is stored. An unknown id, a `read` id, or a hash that is not the stored envelope is 400 or 404. A message with `holds: true` is still 200. | `FormDraft` / `FormAnswer` |
| POST | `/api/universes/:id/hexes/:sector/:local/keep` | owner | **Built.** `{ hash, baseRev, changes, roll? }`. One new object and one new rev, history action `keep`, `entry` rebuilt with `chartEntry`. `roll` and `baseHash` stay as they were. Undo is revert of the previous rev. A message with `holds: true` stores nothing and is 400 `validation` with `details.messages`. A stale `baseRev` is 409 `conflict` and stores nothing. | `FormKeep` / `BuilderHex` |
| POST | `/api/universes/:id/hexes/:sector/:local/blank` | owner | **Built.** `{ edition, baseRev, starType?, starSubtype?, starClass? }`. One star, then the editor's own preview. Omitted star fields are G, 2, and V. The row's roll is 0. History action is `keep`. A hex that already has a tree is 400. A star the editor does not offer is 400 and stores nothing. | `FormBlank` / `BuilderHex` |
| POST | `/api/universes/:id/generate/sector` | owner | `{ sectorSlug, density, edition, mode }` → 202 job (populate then generate). **Not built.** | `GenerateSector` |
| GET | `/api/universes/:id/jobs/:jobId` | owner | **Built.** generate job: state, total, done, failed, skipped, failures by hex key | `BuilderJob` |
| POST | `/api/universes/:id/jobs/:jobId/stop` | owner | **Built.** stops a queued or running job. Hexes already written stay. | `BuilderJob` |
| POST | `/api/universes/:id/jobs/:jobId/undo` | owner | **Built.** puts every hex that job wrote back to the copy taken when the job was accepted, when that hex is still at the rev the job wrote. A later edit of the same hex is listed in `conflicts` and left alone. | `BuilderJobUndo` |
| GET | `/api/universes/:id/events` | owner | Server-Sent Events: job progress and row changes from other tabs | — |
| PATCH | `/api/universes/:id/changes` | owner | batched edits `{ hexes[], lists[] }` with rev; edited trees inline, hashed server-side; 409 rows returned as `conflicts` | `ChangesPatch` |
| GET | `/api/universes/:id/history?hexKey=&cursor=` | owner | `hex_history` newest first | — |
| POST | `/api/universes/:id/hexes/:sector/:local/revert` | owner | **Built.** See the row above. Body is `{ toRev, baseRev }`. | `HexRevert` |
| GET | `/api/universes/:id/snapshots` | owner | list | — |
| POST | `/api/universes/:id/snapshots` | owner | `{ label, trigger }` | `SnapshotCreate` |
| POST | `/api/universes/:id/snapshots/:snapId/restore` | owner | snapshot current, then replace | — |
| POST | `/api/universes/:id/import` | owner | overlay v3 or legacy v1/v2 file (gzip allowed) → 202 job: hash trees, store objects, write pointers; snapshot first | `OverlayDoc` |
| GET | `/api/universes/:id/export` | owner | overlay v3 assembled from rows and objects, gzip | — |
| GET | `/api/universes/:id/search?q=` | owner | FTS over the universe's override rows merged with truth search for its pinned version | — |
| POST | `/api/universes/:id/regenerate` | owner | `{ hexKeys[] }` → new trees with the current engine (explicit, snapshot first); ≤ 64 inline, else 202 | `GenerateRequest` |

`ChangesPatch`: at most 500 hex rows or 20 list rows per call. A hex row is one of
`{ hexKey, rev, tree, summary }` (edited tree inline), `{ hexKey, rev, summary }` (sector-scale
edit), or `{ hexKey, rev, deleted: true }`. Response: `{ applied: [hexKey...], conflicts: [{ hexKey, current }] }`.

## Slice 3 — campaign

| Method | Path | Auth | Purpose | Schema |
|---|---|---|---|---|
| GET | `/api/universes/:id/campaign?after=&limit=` | owner | **Built.** records, links, and journal entries with `seq` greater than `after`, tombstones included, merged in `seq` order under one cap. `limit` defaults to 1000 and is capped at 1000. `journal` is on every page, `[]` when the page has none. `settings` is the current document. `clock` is the campaign date (`{ days, rev }`) or null, on every page. `done` is true when no later row remains. | — |
| PATCH | `/api/universes/:id/campaign/changes` | owner | **Built.** batched records, links, journal entries, settings, and the clock. `baseRev` must match the stored `rev` (0 creates, stored `rev` 1). A journal change is an `EntryChange`; applied rows use table `journal`. Stored `mentions` are `mentionsOf(body)`. A session with no `sequence` is `validation`. 20,000 live entries. A clock change is `{ days, baseRev }` and counts as one row; applied id `campaignTime`, table `clock`. A mismatch returns the stored row in `conflicts` (the stored clock, or null before the first set; a journal conflict carries the stored entry). Deleting a record tombstones its links in the same write. Tombstones are not purged; a restore sends the row with `deleted: false` and that `rev` as `baseRev`. 120 mutations a minute per universe. | `CampaignChanges` |
| PUT | `/api/universes/:id/objects/:hash` | owner | **Built.** the slice 2 object route: images and thumbnails, hash verified, 8 MB cap, 250 MB per universe | — |
| GET | `/api/universes/:id/campaign/search?q=` | owner | **Deferred.** FTS over records is not built in this slice | — |
| GET | `/api/universes/:id/campaign/export` | owner | **Built.** one JSON file `{ universe: { id, name, truthVersion }, exportedAt, records, links, journal, settings, clock }`. The Worker joins `readCampaign` pages and keeps every live row; tombstones are omitted. `Content-Disposition: attachment`, file name `<campaign-name>-<DDD-YYYY>.json` for the UTC day of the export. Image files are not included; a record lists its images by the stored hash. Another account is 404. | — |

## Slice 4 — sharing

| Method | Path | Auth | Purpose | Schema |
|---|---|---|---|---|
| GET | `/api/packages?kind=&q=&tag=&sort=` | public | catalogue (FTS over title, description, tags) | — |
| GET | `/api/packages/:packageId` | public | listing + versions | — |
| POST | `/api/packages` | user | create listing | `PackageCreate` |
| POST | `/api/packages/:packageId/versions` | author | `{ universeId, hexKeys[], recordIds[] }` → 202 `publish` job | `PackagePublish` |
| PATCH | `/api/packages/:packageId` | author | edit listing text/tags, hide | `PackageUpdate` |
| GET | `/api/universes/:id/install/preview?packageId=&version=` | owner | three-way merge result per hex | — |
| POST | `/api/universes/:id/install` | owner | `{ packageId, version, resolutions }` → snapshot, copy objects, write pointers with provenance | `InstallRequest` |
| POST | `/api/packages/:packageId/report` | user | `{ reason }` | `Report` |
| POST | `/api/universes/:id/players/publish` | owner | `{ label, disclosure }` → 202 `publish` job: the Worker renders the players' site from rows with the fog-of-war filter and writes it to the public prefix | `PlayerPublish` |
| DELETE | `/api/universes/:id/players/:publishId` | owner | revoke | — |
| POST | `/api/admin/packages/:packageId/takedown` | admin | `{ reason }`; hides and deletes public objects; audit logged | `Takedown` |

## Slice 5 — merge

| Method | Path | Auth | Purpose | Schema |
|---|---|---|---|---|
| POST | `/api/proposals` | user | `{ packageId, version }` against the current truth version | `ProposalCreate` |
| GET | `/api/proposals?state=` | reviewer | queue | — |
| GET | `/api/proposals/:id/diff` | reviewer | per-hex hash diff | — |
| POST | `/api/proposals/:id/decide` | reviewer | accept / reject with note; audit logged | `ProposalDecide` |
| GET | `/api/universes/:id/migrate/preview?to=` | owner | hash comparison per override row | — |
| POST | `/api/universes/:id/migrate` | owner | `{ to, keep: [hexKey...] }` → snapshot, re-pin, advance base hashes, drop overrides not kept | `MigrateRequest` |

## Admin (all slices, as needed)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/admin/users?q=` | admin | lookup |
| POST | `/api/admin/users/:id/role` | admin | set role; audit logged |
| POST | `/api/admin/users/:id/disable` | admin | disable sign-in; audit logged |
| GET | `/api/admin/jobs?state=` | admin | jobs across universes (from the dead-letter queue and job records) |
| GET | `/api/admin/audit?cursor=` | admin | audit log |

## Characters

A Character is owned by an account and shared by a grant. It does not need a universe.
The catalogue rows are in D1. The boxes and the open sockets live in `CharacterRoom`, one
SQLite Durable Object per character, named by the character id. No access, a missing id,
and a deleted character are 404. An editor calling an owner-only route is 403.
Mutations check `Origin` the same way universe mutations do. Claim is limited to 3
requests in 10 seconds per signed-in user (`Retry-After: 10`), the same window as
better-auth's sign-in rule.

| Method | Path | Auth | Purpose | Schema |
|---|---|---|---|---|
| GET | `/api/characters` | user | **Built.** mine and those shared with me: `{ character, role, ownerName }[]` | `CharacterListItem` |
| POST | `/api/characters` | user | **Built.** `{ name?, from? }`. Without `from`, `name` is required and this account owns the new character. With `from`, the caller must be able to read that character and every box is copied. A `name` on that request is kept. With no `name`, the copy's name is the source name suffixed (` (copy)`, then ` (copy 2)`). 201 `{ character, role }` | `CharacterCreate` / `CharacterHeld` |
| GET | `/api/characters/:id` | access | **Built.** `{ character, role, doc }`. `doc` is `{ fields, revs, seq }`. A cleared box is absent from `fields` and `revs` | `CharacterOpen` |
| PATCH | `/api/characters/:id` | owner | **Built.** `{ name?, summary? }`. Open pages get `{ t: 'meta', name, summary }` | `CharacterPatch` / `CharacterHeld` |
| DELETE | `/api/characters/:id` | owner | **Built.** soft delete. Open pages get `{ t: 'gone', why: 'deleted' }` and the socket closes | `CharacterHeld` |
| POST | `/api/characters/:id/fields` | access | **Built.** `{ sets: [{ field, value }] }`, at most 64. The same write as a live `set`, for a page with no socket. The batch is checked first; one bad box writes nothing. A text box is a string (2,000 characters, 20,000 for `History & Background`). A checkbox is a boolean. `""` or `false` clears the box. Names outside the 420 widgets are refused | `CharacterFieldsWrite` / `CharacterFieldsResult` |
| GET | `/api/characters/:id/access` | access | **Built.** who has access, with display name | `CharacterAccessRow` |
| DELETE | `/api/characters/:id/access/:userId` | owner | **Built.** removes an editor. That person's pages get `{ t: 'gone', why: 'removed' }` and close. The owner is refused until ownership is handed over | `CharacterAccessRemoved` |
| POST | `/api/characters/:id/owner` | owner | **Built.** `{ userId }` of an editor. That person becomes owner; the caller becomes editor. Open pages get a fresh `hello` with the new role | `CharacterOwnerChange` / `CharacterHeld` |
| POST | `/api/characters/:id/invites` | owner | **Built.** 201 `{ id, url, expiresAt }`. `url` is `{origin}/claim/{token}`. The origin is the request's own host: a loopback host stays `http`, and any other host is `https`. The token is random, returned once, and stored as a SHA-256 hash. One claim, 14 days | `CharacterInviteCreate` |
| GET | `/api/characters/:id/invites` | owner | **Built.** every invite for the character. The token is never returned | `CharacterInvite` |
| DELETE | `/api/characters/:id/invites/:inviteId` | owner | **Built.** revoke. A later claim is `validation` with `details.reason` `revoked` | `CharacterInvite` |
| POST | `/api/characters/claim` | user | **Built.** `{ token }`. Grants editor, or leaves an existing owner or editor in place, and consumes the link. `{ characterId }`. Unknown token is 404. Used, expired, and revoked are 400 `validation` with `details.reason` `claimed`, `expired`, or `revoked` | `CharacterClaim` / `CharacterClaimResult` |
| GET | `/api/characters/:id/live` | access | **Built.** WebSocket upgrade into that character's room | `CharacterClientMessage` / `CharacterServerMessage` |

Live frames are JSON text. On open the server sends `hello`: `{ t, you: { id, name, colour, role }, doc, who }`. `colour` is 0 to 7. `who` is one entry per connected user, including you: `{ id, name, colour, field }`, and `field` is null when that person is not in a box. The client sends `{ t: 'set', id, field, value }`. The server applies it in arrival order, bumps that box's `rev` and the room `seq`, sends `{ t: 'ack', id, rev }` to the sender, and `{ t: 'set', field, value, rev, seq, by }` to everyone. `by` is the user id. A bad frame is `{ t: 'no', id, why }` to the sender only. `{ t: 'focus', field }` (`field` null on blur) is answered with `{ t: 'who', who }` to everyone. Presence is the socket attachment. It is not stored. A closed socket drops off `who`.

## Errors

| code | when |
|---|---|
| `validation` | zod failure; `details` is the flattened issue list |
| `unauthenticated` | no or expired session |
| `forbidden` | role or ownership |
| `not_found` | |
| `conflict` | stale `rev`; `details.current` holds the server rows |
| `hash_mismatch` | `PUT` body does not hash to the path |
| `too_large` | body or object over limit |
| `provider_unconfigured` | OAuth secrets absent |
| `job_failed` | returned by job state, with `failures` |
| `rate_limited` | `Retry-After` header set |
| `internal` | logged with `details.requestId` |
