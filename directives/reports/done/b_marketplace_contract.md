# B marketplace contract report
Prompt: prompts/b_marketplace_contract.md
Status: done

## Changed files
- directives/contracts/b_marketplace.md: size b. Create, publish, the author's list, the author's package. No install.
- directives/contracts/b_public_games.md: the opt-in hex mark and the sector read.
- directives/prompts/b_marketplace_contract.md: Progress lines.
- No schema, no migration, no product file.

## Gates
npm test:      not run (no code)
npm run check: not run (no code)
typecheck:     not run (no code)
fourth gate:   decisions 1–10 are cited by number in the two contracts. `git status --porcelain` before:

```
 M apps/api/src/jobs/inputs.ts
 M apps/api/src/jobs/reconcile_transform.ts
 M apps/api/src/jobs/truth_build.ts
 M apps/api/src/routes/admin.ts
 M apps/web/src/router.ts
 M directives/board.md
 M directives/handoff.md
 M directives/orchestrator_state.md
 M directives/prompts/b_marketplace_contract.md
 M directives/prompts/d_grow_one_act.md
 M packages/engines/src/mgt2e_world_engine.js
 M scripts/dev_make_admin.js
 M tests/api/truth_build.test.js
 M tests/generation/reconcile_derived.test.js
 M tests/golden/fixtures/engine_1.1.0/mgt2e_flesh_from_tsv.json
 M tests/golden/fixtures/engine_1.1.0/mgt2e_society_expand.json
 M tests/golden/fixtures/engine_1.1.0/mgt2e_topdown_bare.json
 M tests/golden/fixtures/engine_1.1.0/orbit_normalize_1.json
 M tests/golden/fixtures/engine_1.1.0/orbit_normalize_2.json
?? apps/api/src/jobs/release_seal.ts
?? apps/web/src/views/TruthPreview.vue
?? assets/HybridSurfaceMap_Design.md
?? directives/prompts/a_store_grow.md
?? directives/prompts/c_golden_red.md
?? directives/reports/done/b_marketplace_contract_blocked.md
?? directives/reports/done/d_grow_one_act_blocked.md
?? tests/generation/release_seal.test.js
```

After, this pass added `directives/contracts/b_marketplace.md`, `directives/contracts/b_public_games.md`, and this report. The prompt was already modified. Other lanes dirtied `directives/prompts/e_checker_colours.md`, `scripts/check_allowlist.json`, `scripts/check_manifesto.js`, and `directives/reports/e_checker_colours.md` while this pass ran. This pass did not edit them.

## Contract published
contracts/b_marketplace.md and contracts/b_public_games.md

## Where the specs and Johnny disagree

Johnny wins. The specs were not edited.

- `api.md` Slice 4 `GET /api/packages` is a public catalogue. Size b and decision 1 make it the caller's list only.
- `api.md` `GET /api/packages/:packageId` is public. Size b returns 404 for anyone but the author.
- `api.md` includes install, report, and takedown. Decision 3 and size b leave those, and proposals, unbuilt. The tables `package_installs`, `reports`, and `proposals` are not created.
- `PackageManifest.truthVersion` is a required string. A universe with `truth_version` null cannot fill it. The stub refuses that publish. Question 1.
- `CampaignSettings.party` stores one `vesselId`. Decision 10 asks for a list with one current ship. The public-games contract follows `vesselId` and does not change the campaign schema. Question 3.
- `architecture.md` §2 puts the manifest on the public CDN. Size b has no browse route. Question 2.

## Needs from others
- Lane A: marketplace client calls are in `contracts/b_marketplace.md`, "What the browser lanes call". Public games: `GET /api/public-games?truthVersion=&sector=` when the map's pin is non-null, and no poll. Draw `PublicGamesSector`.
- Lane D: the publish form and the owner's list use `PackageCreate`, `PackagePublish`, and `PackageListing` in that same section. No install control.
- Whoever is given `map/` next: one dot and a count per hex. `name` only when the count is 1. The prompt that builds it has to name `MapRenderer.ts`.

## Questions for Johnny
1. A from-scratch universe has `truth_version` null, and `PackageManifest.truthVersion` is a required string. Recommended: the stub refuses that publish with 400 `This universe is not on a published chart.` A later pass can make the field nullable if own-map packages should exist. Blocks: publishing from a universe that is not pinned to a chart. Pinned universes are not blocked.
2. The manifest and its objects go to the public bucket, as `architecture.md` §2 and `data_model.md` §7 say, while the stub has no browse route. Recommended: write them there. The API still hides another account's listing. Blocks: whether someone who learns a package id can fetch the manifest from the CDN before browse exists.
3. Decision 10 wants a list of vessel ids with one flagged current. The campaign schema has one `vesselId`. Recommended: the public mark follows `vesselId` until a campaign pass stores the list, and that pass is not this contract. Blocks: nothing in the feed. It would block the campaign settings schema if this contract were the one that grows the list.
