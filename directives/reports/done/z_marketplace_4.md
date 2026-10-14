# Z z_marketplace_4 report
Prompt: prompts/z_marketplace.md (phase 4)
Status: partial (code and gates done; browser shots not taken)

## Changed files
- apps/api/src/routes/installs.ts: pinFor plus ensurePinned (DO /pin) runs before preview and install; installs list returns recordCount.
- packages/shared/src/schemas/package.ts: InstallRow gains recordCount, a schema field needed for the Remove sentence.
- tests/shared/package_schema.test.js: fixture has recordCount.
- tests/api/install_delete.test.js: an unopened universe can preview, install and read the hex (pin test).
- apps/web/src/marketplace/catalogue.ts (new): catalogue, package, report, takedown/restore, installs, preview, install, remove (DELETE) wire, plus a CDN manifest reader for the outline.
- apps/web/src/workspace/market/place.ts (new): placement state, placedKeys/anchorUnder, outcome and Remove sentences.
- apps/web/src/workspace/market/PlaceMarks.vue (new): draggable placement outline on the map with Cancel and Preview.
- apps/web/src/workspace/market/ImportPanel.vue (new): campaign pick, In place or Place on the map, preview by outcome with Theirs/Mine, server sentences, Import or Update, then opens the campaign at the piece.
- apps/web/src/workspace/market/ImportsList.vue (new): imports, Update available plus Update, and Remove (DELETE) in the modal.
- apps/web/src/workspace/market/MarketAsk.vue (new): a .ui-modal confirm with an optional reason, used for Report, Take down, Restore and Remove.
- apps/web/src/workspace/market/PackagesView.vue: catalogue (search, kind, tag, sort, works signed out), mine=1, package page.
- apps/web/src/workspace/market/command.ts: offerMarketplace and offerMyPackages.
- apps/web/src/workspace/market/PublishForm.vue, market.ts, marketplace/store.ts: own maps can publish (chart refusal removed).
- Lent apps/web/src/shell/Rail.vue: one Marketplace item after Build.
- Lent apps/web/src/shell/registry.ts: one offerMarketplace call.
- Lent apps/web/src/views/MapView.vue: async PlaceMarks, placeEl.place in the draw step, placeSlugAt/placeSlotOf/placeKeyAt, a watch that recentres the outline. Placement only.
- tests/web/marketplace_store.test.js, tests/web/packages_entry.test.js: updated for own-map publish and the catalogue shell.
- router.ts and design/tokens.css: not changed.

## Gates
npm test:      pass
npm run check: pass
typecheck:     pass
fourth gate:   build pass. RUN_API_TESTS=1 install, install_delete, packages, packages_job, packages_migration on fresh local data: 8/8 pass.

## Contract published
none (pin and recordCount are covered here)

## Needs from others
- none

## Notes
- Browser shots (kb18_market_*) were not taken. They need a local Vite, an API and a passkey sign-in session.
- The outline reads packages/<id>/<v>/manifest.json from the CDN. Locally it is blank unless VITE_CDN_BASE serves the manifests, and Place on the map stays disabled without them.
- An outline that spans several of the source's own sectors may draw inexactly. The server preview is authoritative.
- No new unit tests for place.ts or catalogue.ts.
- Uncommitted work from other lanes was left alone: jobs/*, routes/admin.ts, AccountMenu.vue, passkey/*, board, handoff, orchestrator_state, dev_make_admin, truth_build and reconcile tests, release_seal, TruthPreview, d_version_label.

## Questions for Johnny
1. Admin Restore shows only where the page loads, and a hidden package returns 404 on the public page. Suggested: an admin list of hidden packages. Or allow admins to read hidden pages.
2. Should the browser shots be done in a follow-up step? Suggested: yes, by Z with the passkey recipe.