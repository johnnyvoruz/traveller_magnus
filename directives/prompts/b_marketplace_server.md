# Lane B — build the marketplace stub's server (size b)

Issued 2026-10-11 by the orchestrator. You may be a fresh session with no memory. Read
`CLAUDE.md`, `directives/manifesto.md`, `directives/board.md`, `directives/lanes/B.md`,
then this file. No git but read-only, no deploy (migrations are written, never applied
to production), no `rules/`, no Traveller rule from memory. Your hand-orbit report is
accepted as partial: the orbit data is in; the profile roll is not built and waits on
Johnny (the engines export no one-body roll).

## Goal

Build what `directives/contracts/b_marketplace.md` describes, exactly: a signed-in
referee creates a package, publishes a version of a named part of a universe they own,
lists their own packages and reads one. Nobody else browses; nobody installs. Lane A
has already built the browser client against the contract
(`apps/web/src/marketplace/`, `findings/marketplace_client_ready.md`), so the contract
is now fixed from both sides: **if the build shows the contract must change, stop and
report; do not change it silently.**

## Johnny's decisions (2026-10-10 and 2026-10-11)

- A listing shows title, author handle, kind, truth version, edition, hex count, tags,
  latest version number. Any signed-in owner publishes a subset of a universe they
  own. No moderation in the stub.
- A universe that is not on a published chart cannot publish: 400
  `This universe is not on a published chart.`
- The manifest and its objects go to the public bucket, as `architecture.md` §2 says,
  although the stub has no browse route; the API hides another account's listing.

## Owned files (this pass)

- `packages/shared/src/schemas/package.ts` (the seven names Lane A declared locally:
  `PackageCreate`, `PackagePublish`, `PackageListing`, `PackageVersion`, `PackagePage`,
  `PackagePublishAccepted`, `PackageListPage`), `packages/shared/src/index.ts`
- `apps/api/src/`: the D1 schema and a new migration for `packages` and
  `package_versions` only; a routes file for `/api/packages`; the publish job on the
  existing Queue pattern; R2 writes for objects and the manifest
- `tests/api/packages*.test.js`, `tests/shared/` for the schemas
- `directives/contracts/b_marketplace.md`: each route's mark from "not built" to
  **on disk, unpushed**; fill the three points Lane A found open (below)
- `directives/reports/b_marketplace_server.md`

Not yours: `apps/web` (Lane A switches its local types to the shared ones in its own
pass), `packages/engines`, the parked truth-build files under `apps/api/src/jobs/`
(`inputs.ts`, `reconcile_transform.ts`, `truth_build.ts`, `release_seal.ts`) and
`routes/admin.ts`: leave them exactly as they are on disk.

## Points Lane A found open in the contract: settle each in the contract first

1. `PackageListPage.nextCursor`: A typed it `string | null` after `BuilderHexPage`.
   Confirm or correct.
2. The `pk_` id alphabet marked "proposed": state it, with the generator used.
3. The version poll interval: the contract sets none and A waits 400 ms. Give the
   number, or say the client chooses.
Also say what a caller gets for a package id that exists but is not theirs (A shows
`No such package.` on the 404).

## What must be true (each with a test)

1. Every route answers exactly as the contract says, for the owner, for another
   signed-in account (404, never 403, so existence does not leak) and signed out (401).
2. Publish is a snapshot: after it, changing or deleting the universe's hexes changes
   nothing in the published version. Objects are content-addressed; publishing the
   same content twice writes no new object.
3. The publish job reports the states the contract lists; a failed job leaves the
   package's latest version where it was; a retry is safe.
4. Only hexes and records of a universe the caller owns can be named; anything else is
   refused before any write.
5. A universe with a null truth version is refused with the sentence above.
6. The limits in the contract are enforced with the contract's words.
7. Nothing reads or writes `package_installs`, `reports` or `proposals`; they are not
   created.
8. The migration applies to a fresh local D1 and to one that has today's schema.

## Gates

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, pasted. Fourth gate:
`RUN_API_TESTS=1` on the new test files and on one existing Builder API test file, on
your own port and state directory, stopped after.

## Stop rule

Stop when the eight points pass and the report is written. Stop early with a blocked
report on a contract change, on a limit marked "proposed" that Johnny has not
approved (list them in full as questions), or on anything that needs a Cloudflare
resource that does not exist locally.

Write `directives/reports/b_marketplace_server.md` from
`directives/reports/_TEMPLATE.md`; under "Needs from others" tell Lane A which local
types to replace and anything that moved. Questions for Johnny written out in full,
recommended answer first. After each meaningful step append one line under Progress:
"done: X. next: Y."

## Added 2026-10-11 16:35: Johnny's answers to your blocked report

Your blocked report is accepted. Both questions are answered **yes**; this prompt is
go again after `prompts/b_hand_roll_belt.md` is reported.

1. Add `hex_keys` and `record_ids` JSON columns on `package_versions`, written before
   the queue message is sent, left off `PackageVersion`. The queue message stays as it
   is. Put this in the contract's Storage and publish-job sections.
2. The limits are approved as you wrote them; remove "proposed" from each: 1,280 hexes
   (`A package holds at most 1280 hexes.`), 500 records (`A package holds at most 500
   records.`), title 1 to 80 trimmed, description 0 to 2000, kind 1 to 40 trimmed, at
   most 32 tags of 1 to 40 each, 100 versions (`This package has too many versions.`).

## Added 2026-10-11 16:45: for a session replacing one that froze

The session before you froze before writing any server code: the only thing on disk
from this prompt is the contract edit of its first pass (`nextCursor`, the `pk_`
alphabet, the poll interval, the other-account 404). Both of its questions are
answered yes (the 16:35 section above). The two Progress lines saying "stay blocked"
are out of date: **build now.** `packages/generation/src/form.ts`, `hand.ts` and
`apps/api/src/routes/builder.ts` carry your accepted hand-designer follow-ups,
unpushed: leave them as they are. Lane A is changing message strings in those three
files and in `sectors.ts` and `hexes.ts` this turn (`prompts/a_builder_messages.md`):
do not edit them; your work is in new files and the D1 schema.

After this prompt, the board names your next one.

## Progress

done: settled nextCursor, the pk_ alphabet, the poll interval, and the other-account 404 in contracts/b_marketplace.md. The publish job has nowhere to read hexKeys and recordIds. next: blocked report, no server code.
done: rechecked the 16:00 board. The two questions are still unanswered. next: stay blocked, no server code.
done: found only the contract settlements on disk, no server code, nothing to back out. Johnny answered yes to the JSON columns and the limits. next: write those into the contract, then the schema and migration.
done: contract marks the routes on disk, and the schema, migration, routes, and publish job are written. next: tests, then the gates.
done: job, migration, and HTTP contract tests pass. The job reads the profile with SQL and does not import ensureProfile. next: the four gates, then the report.
done: npm test, check, typecheck, and build passed, and the Builder API test passed on its own port. next: the report.
done: report is directives/reports/b_marketplace_server.md. next: none.
