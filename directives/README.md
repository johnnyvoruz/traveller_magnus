# Directives

Markdown is the source of truth here. The orchestrator writes lane prompts and stream queues
from these files; lanes work from them and report to files. Code follows documents, never the
reverse. Rewritten 2026-10-17 (the directives cleanup).

## Read first

| File | Holds |
|---|---|
| `BOOT.md` | what a lane reads when Johnny boots it (`lanes/START.md` is the paste block) |
| `ORCHESTRATOR.md` | what an orchestrator session reads first, and the shape of its reply |
| `orchestrator_state.md` | where things stand right now; overwritten every orchestrator turn |
| `board.md` | the lane table, direction, known faults, what is open with Johnny, the queue |
| `decisions.md` | every decision, Johnny's and the orchestrator's, dated, newest first; read before deciding anything |
| `questions_for_johnny.md` | only the questions still open, each with an Answer line |

## The file bus

| Path | Holds |
|---|---|
| `lanes/` | one file per lane: its area and its rules; `START.md`, the boot block |
| `streams/` | the queues lanes work without stopping (`README.md` is the loop; `HOW_TO_RUN.md` starts, stops and resumes stream mode); `claims.md` locks files |
| `prompts/` | one-off lane prompts, each with a Progress section |
| `reports/` | lane reports and stream reports; `reports/done/` takes reviewed ones until the next cleanup |
| `contracts/` | the server's promises to the browser lanes, one file per area |
| `backlog_players_landing_trade.md`, `backlog_ux_industry_best.md` | the backlog (2026-10-17): Epics P, L, T and U1 to U44 |
| `handoff.md` | the orchestrator's log, one section per turn (sections 1 to 290 are in the archive) |

## Specs

| File | Holds |
|---|---|
| `manifesto.md` | the rules every session obeys and their checks |
| `plan.md` | what we are building, the slices and milestones (status note at its top) |
| `architecture.md` | stack, topology, repo layout, Worker configuration, sync model, budgets |
| `data_model.md` | D1 tables, R2 key schemes, truth files, overlay v3, package format |
| `api.md` | every endpoint, envelope, auth, errors |
| `design_reference.md` | the sci-fi look: tokens, components, motion, legacy sources |
| `feature_inventory.md` | every legacy feature with keep / wrap / rebuild / drop |
| `legacy_map_inventory.md` | what the legacy renderer draws, rule by rule |
| `planet_rendering.md` | the data-to-appearance specification for planets |
| `plan_engine_corrections.md` | parked: the engine defects and the two-tier fix |
| `campaign_manager_plan.md` | campaign data model v2; cited by the trade backlog and stream A |

`archive/` is history: finished prompts and reviewed reports, old orientation pages, finished
recipes, the legacy app's specs, and the handoff's first 290 sections. Never read at session start.

## Principles

- Directives are living documents; when the code and a directive disagree, fix the directive
  first, then the code.
- Do not delete or overwrite a directive without Johnny's confirmation.
- Do not delete a directive; move it to `archive/` and say so in the report.
- A prompt never changes the approach. If it cannot be written without doing so, the spec is
  wrong and is fixed first.
