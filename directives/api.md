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
| POST | `/api/generate/preview` | user | stateless: `{ edition, mode, seed, settings, hexKey, inputs }` → tree document; nothing stored; proves the Worker and Node produce the same hash | `GeneratePreview` |
| GET | `/api/truth/versions` | public | released truth versions | — |
| GET | `/api/truth/search?q=&version=` | public | FTS over `truth_systems`: name, hex, UWP, sector | — |
| POST | `/api/admin/truth/build` | admin | `{ version, milieu, engineVersion, seed, settings, sectors }` → 202 `{ version, enqueued }`; `sectors` is a slug array or `'all'` (every slug in `inputs/<version>/sectors.json`); enqueues one `truth-build` message per sector at offset 0; 409 if the version exists; `milieu` is a TravellerMap milieu code such as `M1105` | `TruthBuild` |
| GET | `/api/admin/truth/builds/:version` | admin | progress and per-sector state, read from `truth_build_sectors` | — |
| POST | `/api/admin/truth/builds/:version/retry` | admin | `{ sectors?: string[] }`; re-enqueues at offset 0 every `failed` sector and every `building` sector not updated for 10 minutes, or the named slugs in any state; → 202 `{ version, enqueued }`; 409 if released; audit logged (`architecture.md` §5) | `TruthRetry` |
| POST | `/api/admin/truth/release/:version` | admin | refuses unless every sector is `done`; writes the manifest from `truth_build_sectors`; marks released; audit logged | — |

## Slice 2 — universes, generation, changes

| Method | Path | Auth | Purpose | Schema |
|---|---|---|---|---|
| GET | `/api/universes` | user | **Built.** my universes, not deleted | — |
| POST | `/api/universes` | user | **Built.** create `{ name, truthVersion \| null, editionDefault, id? }`. The response is the row just built. `truthVersion` is a released version or null. An eleventh live universe is `too_large`. `engineVersion` is the current one. Creates the Durable Object. A thrown failure after the insert deletes that row. The same caller posting the same `id` again gets that universe, `200`, and no second row. | `UniverseCreate` |
| GET | `/api/universes/:id` | owner | **Built.** the catalogue row. Missing, deleted, or not yours is 404 | — |
| PATCH | `/api/universes/:id` | owner | **Built.** rename (`name`) | `UniverseUpdate` |
| DELETE | `/api/universes/:id` | owner | **Built.** soft delete; `purge_after` 30 days on | — |
| GET | `/api/universes/:id/hexes?sector=` | owner | override rows for one sector | — |
| GET | `/api/universes/:id/hexes/:hexKey` | owner | one row | — |
| GET | `/api/universes/:id/objects/:hash` | owner | stream object | — |
| PUT | `/api/universes/:id/objects/:hash` | owner | image upload only (`image/webp`); hash verified; 8 MB cap | — |
| POST | `/api/universes/:id/generate` | owner | `{ hexKeys[], edition, mode, stage? }`; ≤ 64 keys runs inline and returns rows; more returns 202 with a job | `GenerateRequest` |
| POST | `/api/universes/:id/generate/sector` | owner | `{ sectorSlug, density, edition, mode }` → 202 job (populate then generate) | `GenerateSector` |
| GET | `/api/universes/:id/jobs/:jobId` | owner | job state, counts, failures by hex key | — |
| GET | `/api/universes/:id/events` | owner | Server-Sent Events: job progress and row changes from other tabs | — |
| PATCH | `/api/universes/:id/changes` | owner | batched edits `{ hexes[], lists[] }` with rev; edited trees inline, hashed server-side; 409 rows returned as `conflicts` | `ChangesPatch` |
| GET | `/api/universes/:id/history?hexKey=&cursor=` | owner | `hex_history` newest first | — |
| POST | `/api/universes/:id/hexes/:hexKey/revert` | owner | `{ toRev }` → pointer copy, new rev | `Revert` |
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
| GET | `/api/universes/:id/campaign?after=&limit=` | owner | **Built.** records and links with `seq` greater than `after`, tombstones included, ordered by `seq`. `limit` defaults to 1000 and is capped at 1000. `settings` is the current document. `clock` is the campaign date (`{ days, rev }`) or null, on every page. `done` is true when no later row remains. Journal is not in this slice. | — |
| PATCH | `/api/universes/:id/campaign/changes` | owner | **Built.** batched records, links, settings, and the clock. `baseRev` must match the stored `rev` (0 creates). A clock change is `{ days, baseRev }` and counts as one row; applied id `campaignTime`, table `clock`. A mismatch returns the stored row in `conflicts` (the stored clock, or null before the first set). Deleting a record tombstones its links in the same write. Tombstones are not purged; a restore sends the row with `deleted: false` and that `rev` as `baseRev`. 120 mutations a minute per universe. | `CampaignChanges` |
| PUT | `/api/universes/:id/objects/:hash` | owner | images and thumbnails as objects | — |
| GET | `/api/universes/:id/campaign/search?q=` | owner | **Deferred.** FTS over records is not built in this slice | — |

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
