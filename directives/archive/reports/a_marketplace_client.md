# A marketplace_client report
Prompt: prompts/a_marketplace_client.md
Status: done

The browser store speaks `contracts/b_marketplace.md` through a fake transport. The server is not built. No shared schema was added. `workspace/` was not edited.

## Changed files
- apps/web/src/marketplace/types.ts: local shapes from the contract, each marked for the shared schema.
- apps/web/src/marketplace/store.ts: create, publish with progress, watch by package and version, list, read.
- apps/web/src/marketplace/screen.ts: `asMarketplaceStore`, the interface Lane D calls.
- apps/web/src/marketplace/index.ts: exports.
- tests/web/marketplace_store.test.js: eight tests.
- findings/marketplace_client_ready.md: signatures for Lane D.
- directives/prompts/a_marketplace_client.md: Progress lines.
- directives/reports/a_marketplace_client.md: this report.

Local types, from `contracts/b_marketplace.md`, replace with the shared schema: `PackageCreate`, `PackagePublish`, `PackageListing`, `PackageVersion`, `PackagePage`, `PackagePublishAccepted`, `PackageListPage`.

## Gates
npm test:      pass (1345 tests, 1330 pass, 0 fail, 15 skipped, 20187 ms)
npm run check: pass (manifesto: clean)
typecheck:     pass (tsc --noEmit -p apps/api, exit 0)
fourth gate:   pass. The tests, against the seven points:

1. each call posts the contract body and rejects an answer it cannot read
2. publish reports each version state, and a reload watches that version and updates the listing
2. a loaded package page takes the finished version without another fetch
3. every contract error reaches the caller as the server message
4. signed out, or not the owner, the client refuses before any request
5. a universe with no truth version is refused before any request
6. the store is the screen state, and the folder has no window and no native dialog
7. sentences the client writes are plain, and a failed publish leaves the listing version

| Contract route | Client function |
|---|---|
| `POST /api/packages` | `create` |
| `POST /api/packages/:packageId/versions` | `publish` |
| `GET /api/packages/:packageId/versions/:version` | `watch`, and `publish` until `done` or `failed` |
| `GET /api/packages` | `list` |
| `GET /api/packages/:packageId` | `read` |

`npm run build` also passed (vue-tsc, then vite, 492 modules, built in 695 ms). Nothing in the app imports the new folder yet, so the bundle does not contain it.

## Contract published
none

## Needs from others
- Lane D: call `asMarketplaceStore(openMarketplace(...))`. Signatures, the sentences, and the poll are in `findings/marketplace_client_ready.md`. Pass `account()` and, on create and publish, `PublishSource` (`ownerId`, `truthVersion`). Re-read `listings()`, `page()`, and `tick()` after a change. `publish` returns `{ accepted, finished }`. Progress is the `PackageVersion`, not a percent. A failed version resolves `finished` and leaves `latestVersion` in place. There is no install and no stop.
- Lane B: add the seven names above to `packages/shared/src/schemas/package.ts` and the client will switch to them. `PackageListPage.nextCursor` is typed `string | null` because the contract cites the `api.md` page rule and `BuilderHexPage` is `z.string().nullable()`. The contract line is `Answer: 200 { items: PackageListing[], nextCursor }`. The proposed `pk_` alphabet is not checked. The listing has no author id, so a package that is not in memory yet is requested and a 404 comes back as `No such package.` The version poll waits 400 ms, which the contract does not set.

## Questions for Johnny
none
