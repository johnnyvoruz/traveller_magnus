# Lane B marketplace server report

Found: the frozen session had left only the contract settlements (nextCursor, pk_ alphabet, poll interval, other-account 404). No server code was on disk.
Finished: the size-b marketplace stub: shared schemas, migration 0010, package routes, the publish job, and the eight contract tests.
Backed out: nothing.

Prompt: prompts/b_marketplace_server.md
Status: done

## Changed files
- packages/shared/src/schemas/package.ts: PackageCreate, PackagePublish, PackageListing, PackageVersion, PackagePage, PackagePublishAccepted, PackageListPage, and a PackageHex type alias.
- packages/shared/src/index.ts: exports those names.
- apps/api/src/db/schema.ts and apps/api/src/db/migrations/0010_packages.sql: packages and package_versions, including hex_keys and record_ids. No install, proposal, or report tables.
- apps/api/src/routes/packages.ts: create, list, read, and publish. The version route calls ensureProfile before it writes a row.
- apps/api/src/jobs/publish_queue.ts: snapshot copy onto public objects, manifest, done or failed. A later finish does not move latest_version backwards. The job reads profile.handle and does not create the row.
- apps/api/src/auth/profile.ts and apps/api/src/routes/auth.ts: ensureProfile is the same create GET /api/me uses.
- apps/api/src/universe/publish_read.ts, UniverseDO.ts, campaign.ts: POST /publish-read returns the stored hex summary and campaign records.
- apps/api/src/jobs/dead_letter.ts: a dead publish message marks that version failed and leaves latest_version.
- apps/api/src/index.ts: mounts /api/packages and the voyage-publish consumer.
- directives/contracts/b_marketplace.md: routes marked on disk, unpushed; limits and the version-row lists written in.
- tests/shared/package.test.js, tests/api/packages_job.test.js, tests/api/packages_migration.test.js, tests/api/packages.test.js.

A retry that finds the manifest already stored counts the manifest and the records object, and omits image bytes from that recovery total. The first write counts image bytes this attempt put.

## Gates
npm test:      pass (1380 pass, 16 skipped, 0 fail)
npm run check: pass
typecheck:     pass
fourth gate:   pass. RUN_API_TESTS=1 tests/api/packages.test.js and tests/api/builder.test.js. The HTTP server used port 18874 and inspector 19874, and was stopped.

## Contract published
contracts/b_marketplace.md

## Needs from others
- Lane A: in apps/web/src/marketplace/types.ts, replace PackageCreate, PackagePublish, PackageListing, PackageVersion, PackagePage, PackagePublishAccepted, and PackageListPage with the exports from @voyage/shared. Leave MarketplaceAccount, PublishSource, PackageListQuery, and PublishHandle. PackageVersionState is the shared state's enum and is not a separate export. No wire field moved.

## Questions for Johnny
none
