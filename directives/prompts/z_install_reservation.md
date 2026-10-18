# Lane Z — imports through the quota reservation; the catalogue's family and author queries

Issued 2026-10-17 by the orchestrator. Read `CLAUDE.md`, `directives/manifesto.md`,
`directives/board.md`, `directives/lanes/Z.md`, `directives/contracts/b_builder.md` (the reservation,
new today), `directives/contracts/b_marketplace.md`, Lane B's report
`reports/done/b_quota_reservation.md` ("Needs from others"), then this file. No git but read-only, no
deploy, no `rules/`.

## 1. An install through the reservation (Lane B's need)
`routes/installs.ts` reads only D1 `object_bytes`, copies objects, then calls `chargeObjectBytes`, so
an install can pass 250 MB while a generate job holds a reservation.
- Before the puts, `POST /quota/reserve` on the universe's stub with `{ id, bytes, universeId }`, the id
  being the install's charge id. A refusal is the same 400 and sentence as a full universe.
- Release after `chargeObjectBytes`, and release if a put fails.
- Suite: an install refused while a reservation holds the room; the same install accepted after
  release; an install alone as before.

## 2. The catalogue's `family=` and `author=` queries (queued since 2026-10-15)
The store counts and filters in the browser over the first 100 cards. Add to `GET /api/packages`:
`family=` (repeatable: the store's Kind families, as `storefront.ts` maps kinds to families) and
`author=` (a handle). Both optional, combined with AND, OR within a repeated key; the existing
`kind=` keeps working. Contract lines for Lane D, who switches the store to them later. No browser change.

## Gates
`npm test`, `npm run check`, the typecheck; worker suites on your own port and state: `install`,
`install_delete`, `install_links`, `install_records_only`, `packages`, `quota_reservation`, and yours.

## Report
`directives/reports/z_install_reservation.md`. **Owned:** `routes/installs.ts`, `routes/packages.ts`,
`packages/shared/src/schemas/package.ts`, `contracts/b_marketplace.md`, tests under `tests/api/` and
`tests/shared/`, your report.

After each meaningful step, append one line under Progress: "done: X. next: Y."

## Progress

done: installs.ts reserves the preview's bytes under the charge id before the copy and releases in a finally after chargeObjectBytes (a refusal is 400 too_large "This universe is out of space."); catalogue family= (repeatable, PACKAGE_KIND_FAMILIES in package.ts, the store's first-match rule) and author= (profile handle) in packages.ts; one export line in shared index.ts; contract lines at F2 query table and F8; tests/shared/package_family.test.js and tests/api/install_reservation.test.js pass. next: gates.
done: gates pass (npm test 1927/1888 pass 0 fail; check clean; typecheck clean; install, install_links, install_records_only, packages, install_reservation pass; install_delete (EPERM cleanup) and quota_reservation (401 once) failed in the batch and passed alone); report directives/reports/z_install_reservation.md written; no server of mine left. next: orchestrator review.
