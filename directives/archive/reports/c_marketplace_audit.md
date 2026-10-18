# C marketplace audit report
Prompt: prompts/c_marketplace_audit.md
Status: done

## Changed files
- findings/marketplace_gap_audit.md: the only note. `findings/` is gitignored, so porcelain does not list it.
- directives/prompts/c_marketplace_audit.md: Progress lines.
- directives/reports/c_marketplace_audit.md: this report.

No spec, schema, route, or screen was edited.

## Gates
npm test:      not run. This pass changes no code.
npm run check: not run.
typecheck:     not run.
fourth gate:   `git status --porcelain` before and after. Pasted below. The two listings match. The note is ignored by `.gitignore` line 48.

Before:

```
 M CLAUDE.md
 M apps/api/src/jobs/inputs.ts
 M apps/api/src/jobs/reconcile_transform.ts
 M apps/api/src/jobs/truth_build.ts
 M apps/api/src/routes/admin.ts
 M apps/api/src/routes/builder.ts
 M apps/api/src/universe/UniverseDO.ts
 M apps/api/src/universe/hexes.ts
 M apps/api/src/universe/schema.ts
 M apps/web/src/builder/bind.ts
 M apps/web/src/builder/draft.ts
 M apps/web/src/builder/index.ts
 M apps/web/src/builder/store.ts
 M apps/web/src/design/tokens.css
 M apps/web/src/dossier/DossierBody.vue
 M apps/web/src/dossier/DossierPanel.vue
 M apps/web/src/dossier/SurfaceStage.vue
 M apps/web/src/dossier/model.ts
 M apps/web/src/map/input.ts
 M apps/web/src/map/truth_client.ts
 M apps/web/src/orbit/layout.ts
 M apps/web/src/orbit/system.ts
 M apps/web/src/platform/browser.ts
 M apps/web/src/router.ts
 M apps/web/src/shell/Panel.vue
 M apps/web/src/shell/PanelHost.vue
 M apps/web/src/shell/pane.ts
 M apps/web/src/shell/registry.ts
 M apps/web/src/surface/caption.ts
 M apps/web/src/surface/contracts.ts
 M apps/web/src/surface/enhanced/climate.ts
 M apps/web/src/surface/preferences.ts
 M apps/web/src/surface/service.ts
 M apps/web/src/surface/surface.worker.ts
 M apps/web/src/views/MapView.vue
 M apps/web/src/views/OrbitView.vue
 M apps/web/src/workspace/build/BuildBar.vue
 M apps/web/src/workspace/build/BuildMarks.vue
 M apps/web/src/workspace/build/BuildPane.vue
 M apps/web/src/workspace/build/BuildScope.vue
 M apps/web/src/workspace/build/BuildStrip.vue
 M apps/web/src/workspace/build/acts.ts
 M apps/web/src/workspace/build/commands.ts
 M apps/web/src/workspace/build/marks.ts
 M apps/web/src/workspace/build/seam.ts
 M directives/api.md
 M directives/data_model.md
 M directives/handoff.md
 M packages/engines/src/mgt2e_world_engine.js
 M packages/generation/src/form.ts
 M packages/generation/src/index.ts
 M packages/shared/src/index.ts
 M packages/shared/src/schemas/form.ts
 M scripts/dev_make_admin.js
 M tests/api/builder_form.test.js
 M tests/api/builder_logic.test.js
 M tests/api/truth_build.test.js
 M tests/generation/form.test.js
 M tests/generation/reconcile_derived.test.js
 M tests/golden/fixtures/engine_1.1.0/mgt2e_flesh_from_tsv.json
 M tests/golden/fixtures/engine_1.1.0/mgt2e_society_expand.json
 M tests/golden/fixtures/engine_1.1.0/mgt2e_topdown_bare.json
 M tests/golden/fixtures/engine_1.1.0/orbit_normalize_1.json
 M tests/golden/fixtures/engine_1.1.0/orbit_normalize_2.json
 M tests/web/builder_draft.test.js
 M tests/web/builder_store.test.js
 M tests/web/contrast.test.js
 M tests/web/dossier_model.test.js
 M tests/web/orbit_system.test.js
 M tests/web/pane.test.js
 M tests/web/surface_climate.test.js
 M tests/web/surface_service.test.js
 M tests/web/truth_client.test.js
?? apps/api/src/jobs/release_seal.ts
?? apps/api/src/universe/sectors.ts
?? apps/web/public/surface-icons/
?? apps/web/src/builder/sectors.ts
?? apps/web/src/dossier/SurfaceTimeBar.vue
?? apps/web/src/orbit/hand_present.ts
?? apps/web/src/orbit/sim_clock.ts
?? apps/web/src/orbit/sun.ts
?? apps/web/src/orbit/tree_source.ts
?? apps/web/src/surface/hybrid/
?? apps/web/src/views/TruthPreview.vue
?? apps/web/src/workspace/build/DesignAsk.vue
?? apps/web/src/workspace/build/EditField.vue
?? apps/web/src/workspace/build/HandDesigner.vue
?? apps/web/src/workspace/build/SectorBar.vue
?? apps/web/src/workspace/build/SectorPane.vue
?? apps/web/src/workspace/build/SystemEditor.vue
?? apps/web/src/workspace/build/edit.ts
?? apps/web/src/workspace/build/grow_acts.ts
?? apps/web/src/workspace/build/hand.ts
?? apps/web/src/workspace/build/hand_acts.ts
?? apps/web/src/workspace/build/pointer.ts
?? apps/web/src/workspace/build/sector_acts.ts
?? apps/web/src/workspace/build/sectors.ts
?? assets/HybridSurfaceMap_Design.md
?? directives/board.md
?? directives/contracts/
?? directives/lanes/
?? directives/orchestrator_handoff_2026-10-09.md
?? directives/orchestrator_state.md
?? directives/prompts/a_draft_handle_close.md
?? directives/prompts/a_next_2026-10-09.md
?? directives/prompts/a_orbit_colours.md
?? directives/prompts/a_orbit_leftovers.md
?? directives/prompts/a_orbit_loading_2026-10-10.md
?? directives/prompts/b_builder_contract.md
?? directives/prompts/b_sector_generate.md
?? directives/prompts/b_step3_close.md
?? directives/prompts/builder_step2_close.md
?? directives/prompts/builder_step3.md
?? directives/prompts/c_hybrid_close.md
?? directives/prompts/c_hybrid_colours.md
?? directives/prompts/c_hybrid_surface.md
?? directives/prompts/c_hybrid_warm_open.md
?? directives/prompts/c_marketplace_audit.md
?? directives/prompts/d_restart_2026-10-09.md
?? directives/prompts/d_select_hexes.md
?? directives/prompts/d_step3_close.md
?? directives/prompts/d_step3_close_2.md
?? directives/prompts/e_campaign_gap_audit.md
?? directives/prompts/e_checker_audit.md
?? directives/prompts/e_journal_mention.md
?? directives/reports/
?? packages/generation/src/hand.ts
?? packages/shared/src/schemas/hand.ts
?? packages/shared/src/schemas/sector.ts
?? tests/api/builder_close.test.js
?? tests/api/builder_sector.test.js
?? tests/api/builder_sector_logic.test.js
?? tests/generation/hand.test.js
?? tests/generation/release_seal.test.js
?? tests/web/build_editor.test.js
?? tests/web/build_hand.test.js
?? tests/web/build_pointer.test.js
?? tests/web/build_sectors.test.js
?? tests/web/builder_bind.test.js
?? tests/web/builder_sectors.test.js
?? tests/web/orbit_hand.test.js
?? tests/web/orbit_tree_source.test.js
?? tests/web/surface_hybrid.test.js
```

After: same listing. Confirmed by a second `git status --porcelain` once the note and this report existed. `findings/marketplace_gap_audit.md` does not appear.

## Contract published
none

## Needs from others
none

## Questions for Johnny
1. What does a catalogue listing show before someone opens the package? Recommended answer: title, author handle, kind, truth version, edition, hex count, tags, and the latest version number. The trees and the records stay on the package page. This blocks the `GET /api/packages` row and the catalogue card.
2. Who may publish? Recommended answer: any signed-in owner, and only a subset of a universe they own. This blocks `POST /api/packages` and the publish job's auth.
3. Is a new package moderated before it is listed? Recommended answer: no, for the stub in section 2c. Report and takedown stay in the full Slice 4, after the stub. This blocks whether a finished publish is publicly readable.
4. What does a public game show? Recommended answer: one hex mark and the universe's name. No referee name, no player names, no "in jump". This blocks the feed's fields.
5. How stale may a public position be? Recommended answer: it is the hex from the owner's last save of the party track, with no heartbeat and no expiry. It stays until they turn public off. Readers load it with the sector, not on a timer. This blocks a presence service.
6. May a referee be public at hex precision only? Recommended answer: yes. Body, open-space point, and jump state stay private. The chart marker is already hex-only. This blocks the feed from copying `PartyWhere`.
7. Is public opt-in? Recommended answer: yes, and the default is off. A new universe publishes no position. This blocks the settings field.
8. Which games share a map? Recommended answer: the same non-null `truth_version` only. A from-scratch universe and a `~` hex are omitted. This blocks the match key.
9. How many public marks may one hex draw? Recommended answer: one dot and a count, not one glyph per game. The owner's other ships already stop at three (`VESSELS_PER_HEX`). This blocks the layer in `map/`.

Counts in the note: 0 live, 0 on disk unpushed, 2 part built (the manifest type, and the truth attribution sentence), 9 not started.
