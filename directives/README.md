# Directives

Markdown is the source of truth here. The AI orchestrator reads these files, writes recipes
from them, and the implementer executes recipes. Code follows documents, never the reverse.

## Current plan — Traveller.voyage (adopted 2026-10-02)

Read in this order.

| File | Holds |
|---|---|
| `implementer_brief.md` | what a fresh implementer session reads first: the rules, the commands, what already exists, how to report |
| `manifesto.md` | the rules every session obeys and their checks; decisions taken |
| `plan.md` | what we are building, roles and protocol, the six slices, milestones |
| `handoff.md` | where the work stands right now, what is in flight, traps already hit; kept current by the orchestrator |
| `architecture.md` | stack, topology, repo layout, Worker configuration, sync model, budgets |
| `data_model.md` | D1 tables, R2 key schemes, truth files, overlay v3, package format |
| `api.md` | every endpoint by slice, envelope, auth, errors |
| `design_reference.md` | the sci-fi look: tokens, components, motion, legacy sources |
| `feature_inventory.md` | every legacy feature with keep / wrap / rebuild / drop and its slice |
| `slice_0_foundation.md` | the slice 0 recipe (legacy oracle, golden fixtures, monorepo, engines as ESM, parsers, generation package, Worker with Queues, truth v1 on the platform, CI) |
| `slice_1_viewer.md` | the slice 1 recipe: part A (overview file, map data path, the rebuilt map renderer) in full; parts B and C as outlines |
| `legacy_map_inventory.md` | what the legacy renderer draws, rule by rule with line references; the evidence for slice 1 part B |
| `slice_N_*.md` | written just-in-time when slice N starts |

## Still current from before

| File | Holds |
|---|---|
| `campaign_manager_plan.md` | campaign data model v2 and the ten feelings; the source for slice 3 |
| `persistence_v2.md` | §2.1 overlay document v3 is the client/server contract; the rest is legacy |

## Legacy (frozen with the single-file app)

`bugfix_pass.md` (stopped after Step 2), `fog_of_war_field_tags.md`, `html_extract_manifest.md`,
`planet_rendering.md`, `project_manifest.md`, `route_*_spec.md`, `update_version.md`.

## Principles

- Directives are living documents; when the code and a directive disagree, fix the directive
  first, then the code.
- Do not delete or overwrite a directive without Johnny's confirmation.
- A recipe never changes the approach. If it cannot be written without doing so, the spec is
  wrong and is fixed first.
