# Lane A — the marketplace client takes its wire types from the shared package

Issued 2026-10-11 by the orchestrator. You may be a fresh session with no memory. Read
`CLAUDE.md`, `directives/manifesto.md`, `directives/board.md`, `directives/lanes/A.md`,
then this file. No git but read-only, no deploy, no `rules/`, no Traveller rule from
memory. Do `prompts/a_roll_again.md` first if it has no report yet.

## Goal

Lane B built the marketplace server and published its shapes in `@voyage/shared`
(`packages/shared/src/schemas/package.ts`). Your client (`apps/web/src/marketplace/`)
was written before that against local copies. Make the shared package the one source.

## What to build

- In `apps/web/src/marketplace/types.ts`, replace the local `PackageCreate`,
  `PackagePublish`, `PackageListing`, `PackageVersion`, `PackagePage`,
  `PackagePublishAccepted` and `PackageListPage` with the exports of the same names
  from `@voyage/shared`. Keep `MarketplaceAccount`, `PublishSource`, `PackageListQuery`
  and `PublishHandle`: they are the browser's own. `PackageVersionState` is the shared
  state's enum, not a separate export: derive it from the shared type.
- B says no wire field moved. Check that against `directives/contracts/b_marketplace.md`
  and the schema file; if a field differs from what your client sends or reads, fix
  the client and name the field in the report.
- Read the contract's settled points (cursor name `nextCursor`, the `pk_` id alphabet,
  the poll interval, another account's package answers 404) and make sure the client
  and `apps/web/src/marketplace/screen.ts` agree with each.
- Lane D's screens (`workspace/market/`) import from your `types.ts` or `screen.ts`.
  Keep every name they import exported as it is, so no file of theirs changes.

## Owned files (this pass)

`apps/web/src/marketplace/`, its tests in `tests/web/`, `findings/marketplace_client_ready.md`
(update the lines that change), `directives/reports/a_market_types.md`. Not yours:
`workspace/`, `packages/`, `apps/api`.

## Gates

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, pasted. Fourth gate:
your own API on your own port and state directory, stopped after: with the real
client, create a package, publish a version of a small selection, poll it to done,
list, read the page; paste the five answers' status codes. If the local server has no
released truth version and publish is refused for that reason (the stub publishes only
from a universe on a published chart), say so and show the refusal instead.

## Stop rule

Stop when the types are shared, the gates pass and the report is written.

Write `directives/reports/a_market_types.md` from `directives/reports/_TEMPLATE.md`.
After each meaningful step append one line under Progress: "done: X. next: Y."

## Progress
