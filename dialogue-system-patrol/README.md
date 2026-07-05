# Dialogue System Patrol

Status: Phase 1 validated on 2026-07-01; process-tree and Obsidian registration executed after user confirmation. Strict required coverage, source_hash/source drift detection, patrol-maintainer automation, module scaffolding, dialogue read index, source-only 3D projection, and construction-time build timeline feedback are now active. Business-module code migration and non-source-only 3D behavior still require explicit confirmation.

This directory is the proposed source area for a global patrol layer that lets the dialogue module understand every visible system module through stable, machine-readable status contracts.

The current implementation adds Phase 1 schemas, template, registry, module patrol blocks, validator, publisher, package commands, summary-only runtime status outputs, confirmed process-tree plus Obsidian registration, strict coverage, source drift detection, patrol-maintainer automation, a scaffold entry, a dialogue read index, and source-only 3D projection. It does not change business-module logic, dialogue-reader code, or external platform behavior.

## Purpose

The global patrol layer is a read-only coordination and observability layer.

Its job is to make every system-visible module publish:

- what the module is,
- what data flows through it,
- what state it is currently in,
- what changed recently,
- what construction or modification phase was most recently recorded,
- what evidence proves the state,
- what is blocked or risky,
- what the dialogue module is allowed to say about it.

The dialogue module should read this layer instead of guessing module state from source files, scattered runtime reports, or historical notes.

## Core Idea

Every future module that should be visible to the dialogue module must have a patrol block.

A patrol block is the module's own status contract. It is not the module's implementation, and it is not a full source-code summary. It is a compact, versioned explanation of the module's identity, lifecycle, data flow, state, evidence, and boundaries.

The intended flow is:

```text
module files and runtime evidence
  -> module patrol block
  -> module_build_timeline_event.v1 append-only timeline
  -> global patrol registry
  -> module_status_card.v1 and module_status_event.v1
  -> status_snapshot.v1 and system_event_snapshot.v1
  -> dialogue module response
```

## Why This Is Separate

The workspace already has useful pieces:

- `examples/system-process-tree.json` is the current process-tree source of truth.
- `capability-upgrade-registry/` can run read-only capability patrol and replacement analysis.
- `sightflow-desktop-agent-main` already defines status card and status event contracts that the dialogue module can read.

This directory is meant to connect those pieces with minimal impact. It should become the explicit onboarding and status-publication layer between modules and the dialogue module.

## Directory Roles

Current roles:

| Path | Role |
| --- | --- |
| `README.md` | Entry point and boundary statement. |
| `TARGET.md` | Full target, terminology, contracts, lifecycle, and input/output design. |
| `docs/current-structure-comparison.md` | Comparison between the current system and the proposed patrol layer. |
| `docs/minimal-implementation-plan.md` | Low-risk phased implementation plan, gates, inputs, outputs, and verification. |
| `docs/module-onboarding-gate.md` | Phase 5 module onboarding gate for future visible module construction and modification. |
| `docs/strict-governance-and-surfaces.md` | Strict coverage, patrol-maintainer workflow, dialogue read index, and source-only 3D projection rules. |
| `docs/build-timeline-protocol-and-dialogue-chain.md` | Additive construction-time feedback protocol and dialogue index aggregation chain. |
| `schemas/` | Schema files for patrol block, registry, and validation report. |
| `registry/` | Machine-readable registry of modules that must publish patrol output. |
| `templates/` | Copyable patrol block template. |
| `blocks/` | Module patrol blocks, including generated process-tree coverage blocks. |
| `scripts/` | Validator, publisher, source drift checker, patrol-block initializer, build timeline writer, module onboarding gate, patrol maintainer, scaffold, hook installer, and read-surface publisher scripts. |
| `targets/` | Future current-target snapshots generated from the process tree. |

Phase 1 now includes the documentation files plus schemas, template, registry, 17 patrol blocks, validator, publisher, initializer, and runtime status output directories.

## Phase 1 Implementation Report

Confirmed by user and recorded on 2026-07-01.

Implemented:

- `module_patrol_block.v1`, `system_patrol_registry.v1`, and `system_patrol_validation.v1` schemas.
- `module-patrol-block.template.json`.
- `system-patrol-registry.json` with 17 required entries.
- `dialogue_system_patrol` self patrol block.
- 16 process-tree-derived module patrol blocks.
- `validate-system-patrol.mjs`, `publish-system-patrol.mjs`, and `init-module-patrol-blocks.mjs`.
- `system-patrol:validate`, `system-patrol:publish`, and `system-patrol:blocks:init` package commands.
- 17 `module_status_card.v1` files under `runtime/status-cards/`.
- 17 `module_status_event.v1` files under `runtime/status-events/`.
- `runtime/dialogue-system-patrol/latest.json` and `runtime/dialogue-system-patrol-validations/latest.json`.

Verification:

```text
npm.cmd run system-patrol:blocks:init
npm.cmd run system-patrol:publish
npm.cmd run system-patrol:validate
npm.cmd run process-tree:validate
node --check dialogue-system-patrol/scripts/init-module-patrol-blocks.mjs
node --check dialogue-system-patrol/scripts/validate-system-patrol.mjs
node --check dialogue-system-patrol/scripts/publish-system-patrol.mjs
```

Final verified state:

```text
system_patrol gate: system_patrol_validated
system_patrol required_failures: 0
system_patrol warning_failures: 0
process_tree gate: process_tree_synced
process_tree required_failures: 0
process_tree warning_failures: 0
patrol_blocks: 17
status_cards: 17
status_events: 17
```

The initial Phase 1 proof intentionally did not modify business modules, dialogue-module readers, 3D projection files, process-tree nodes, or Obsidian views. The confirmed registration step later added `dialogue_system_patrol` to the process tree and Obsidian views without changing business modules, dialogue-module readers, 3D projection files, or external platform behavior.

## Step 10-12 Registration Report

Confirmed by user and recorded on 2026-07-01 after process-tree and Obsidian registration.

Implemented:

- Added `dialogue_system_patrol` to `examples/system-process-tree.json`.
- Registered patrol docs, schemas, registry, blocks, scripts, status cards, status events, and validation outputs in the process-tree artifact registry.
- Synchronized `views/obsidian/system-process-tree.md`.
- Synchronized `views/obsidian/system-process-tree.canvas`.
- Changed the self registry entry from `local_bootstrap` to `process_tree`.
- Updated `dialogue-system-patrol/blocks/dialogue_system_patrol.patrol.json` to registered and validated state.
- Refreshed 17 `module_status_card.v1` files under `runtime/status-cards/`.
- Refreshed 17 `module_status_event.v1` files under `runtime/status-events/`.

Verification:

```text
npm.cmd run system-patrol:blocks:init
npm.cmd run system-patrol:publish
npm.cmd run system-patrol:validate
npm.cmd run process-tree:validate
```

Final verified state:

```text
system_patrol validation_id: system_patrol_validation_20260701T115537
system_patrol gate: system_patrol_validated
system_patrol required_failures: 0
system_patrol warning_failures: 0
process_tree validation_id: process_tree_validation_20260701115348
process_tree gate: process_tree_synced
process_tree required_failures: 0
process_tree warning_failures: 0
patrol_blocks: 17
status_cards: 17
status_events: 17
```

Boundary at that registration step:

- `canonical_flow` was not changed.
- Business modules were not rewritten.
- Dialogue-module readers were not rewritten.
- 3D projection files were not changed.
- Strict required coverage had not yet been enabled at that registration step; it is now active in the later strict governance step.
- A patrol-maintainer workflow was not added until the later strict governance step.

## Phase 5 Non-Enforcing Gate Report

Recorded on 2026-07-01.

Implemented:

- `dialogue-system-patrol/docs/module-onboarding-gate.md`.
- `dialogue-system-patrol/scripts/check-module-onboarding-gate.mjs`.
- `system-patrol:module-gate` package command.
- Runtime gate report output under `runtime/dialogue-system-patrol-module-gates/**`.

Purpose:

- Check future visible module work for process-tree, registry, patrol block, status card, status event, system-patrol validation, and process-tree validation evidence.
- Report missing evidence as `module_onboarding_blocked`.
- This was introduced before strict enforcement; strict enforcement and patrol-maintainer workflow were activated later in the strict governance step.

Command:

```text
npm.cmd run system-patrol:module-gate -- --module-id=<module_id>
npm.cmd run system-patrol:module-gate -- --all
```

## Strict Governance And Surface Report

Recorded on 2026-07-01 after user confirmed all follow-up directions.

Implemented:

- `strict_required_coverage` registry mode.
- `strict_missing_blocks: true`.
- `system-patrol:source-drift` source_hash/source drift checker.
- `system-patrol:maintain` patrol-maintainer workflow command.
- `system-patrol:enforce` unified local/CI gate.
- `system-patrol:scaffold` module patrol scaffold entry.
- `.githooks/pre-commit` hook template and `system-patrol:hooks:install` installer.
- `.github/workflows/system-patrol.yml` CI gate.
- `system-patrol:surfaces` dialogue read index and 3D source-only projection publisher.
- `runtime/dialogue-system-patrol-source-drift/**`.
- `runtime/dialogue-system-patrol/dialogue-read-index.json`.
- `dialogue-system-patrol/os-particle-projection.json`.
- `runtime/dialogue-system-patrol-maintenance/**`.
- Source-only 3D region-map reference in `3d-particle-display-os/original-system-region-map.json`.

Commands:

```text
npm.cmd run system-patrol:source-drift -- --module-id=<module_id>
npm.cmd run system-patrol:source-drift -- --update --module-id=<module_id>
npm.cmd run system-patrol:scaffold -- --module-id=<module_id> --verify
npm.cmd run system-patrol:maintain -- --module-id=<module_id>
npm.cmd run system-patrol:maintain -- --all
npm.cmd run system-patrol:enforce
npm.cmd run system-patrol:surfaces
```

Boundary:

- strict mode blocks missing patrol evidence,
- source drift blocks current-state claims when source refs changed without a refreshed patrol baseline,
- patrol-maintainer automation is a local validation workflow, not a business-code editor,
- CI/pre-commit entries call the same `system-patrol:enforce` workflow but do not rewrite business modules,
- dialogue read index is summary-only and does not replace status cards/events,
- 3D projection is source-only and has no write or execution authority.

## Boundaries

The proposed module must remain read-only by default:

- It must not execute external actions.
- It must not send messages or operate platforms.
- It must not become the source of business facts.
- It must not replace `examples/system-process-tree.json` as the process-tree source of truth.
- It must not replace `capability-upgrade-registry/` for candidate replacement analysis.
- It must not require the dialogue module to read raw business payloads.

Its first implementation should only validate and publish status summaries.

## Confirmation Gate

Further implementation should wait until the user confirms:

1. whether to migrate business-module code patterns beyond patrol-block/status evidence,
2. whether to modify dialogue-reader source code beyond the existing card/event read contracts,
3. whether to add non-source-only 3D behavior,
4. whether to perform patrol protocol migration that changes schemas, output paths, or validator semantics.

See:

- [TARGET.md](TARGET.md)
- [docs/current-structure-comparison.md](docs/current-structure-comparison.md)
- [docs/minimal-implementation-plan.md](docs/minimal-implementation-plan.md)
