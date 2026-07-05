# Minimal Implementation Plan

Status: Phase 1 validated; process-tree and Obsidian registration completed on 2026-07-01. Strict required coverage, source_hash/source drift detection, module onboarding gate, patrol-maintainer workflow, scaffold entry, dialogue read index, and source-only 3D projection are active.

## Goal

Implement the global patrol layer with the smallest useful change:

- keep existing system behavior unchanged,
- reuse the dialogue module's existing status-card and status-event contracts,
- add required patrol visibility for modules,
- detect source drift when module source refs change without a refreshed patrol baseline,
- make missing or stale module status explicit,
- support module construction timelines through events.

## Boundary

This plan does not authorize implementation yet.

After user confirmation, implementation should still follow read-only and staged gates.

Forbidden by default:

- no real external action,
- no message sending,
- no business data mutation,
- no direct platform operation,
- no replacement of existing modules,
- no 3D particle OS source mutation beyond confirmed projection references,
- no status guessing when patrol data is missing.

## Phase 0: Design Review

Current phase.

Inputs:

- user goal,
- current process tree,
- current capability patrol design,
- current status dialogue contracts.

Outputs:

- `dialogue-system-patrol/README.md`,
- `dialogue-system-patrol/TARGET.md`,
- `dialogue-system-patrol/docs/current-structure-comparison.md`,
- `dialogue-system-patrol/docs/minimal-implementation-plan.md`.

Verification:

- manual inspection only,
- no code execution required,
- no runtime artifacts written.

Exit condition:

- user confirms or revises the design.

## Phase 1: Contract Drafts Only

Purpose:

Create machine-readable draft contracts without changing runtime behavior.

Proposed files:

- `schemas/system-patrol-block.schema.json`,
- `schemas/system-patrol-registry.schema.json`,
- `schemas/system-patrol-validation.schema.json`,
- `templates/system-patrol-block.template.json`,
- `registry/system-patrol-registry.json`.

Inputs:

- `examples/system-process-tree.json`,
- `TARGET.md`,
- existing `module_status_card.v1` and `module_status_event.v1` contracts.

Outputs:

- draft schema files,
- initial registry draft,
- template for future modules.

Validation:

- JSON parse checks,
- schema self-consistency checks,
- no runtime publication yet.

Stop conditions:

- schema duplicates existing contracts unnecessarily,
- registry tries to replace process tree,
- private/raw data fields enter the patrol block.

## Phase 2: Read-Only Validator

Purpose:

Check that every visible process-tree node has a patrol block or explicit parent coverage.

Proposed script:

- `scripts/validate-system-patrol.mjs`.

Inputs:

- `examples/system-process-tree.json`,
- `dialogue-system-patrol/registry/system-patrol-registry.json`,
- `dialogue-system-patrol/schemas/*.json`,
- module patrol blocks.

Outputs:

- `runtime/dialogue-system-patrol-validations/<validation_id>/system-patrol-validation.json`,
- `runtime/dialogue-system-patrol-validations/latest.json`,
- optional Markdown report.

Validation command:

```text
npm.cmd run system-patrol:validate
```

This command should be added only after user confirmation.

Checks:

- every required module has a patrol block,
- every patrol block has identity, data flow, current state, evidence, boundaries,
- every patrol block has `updated_at` and `ttl_ms`,
- every module has a status-card output target,
- every module has a status-event output target or explicit reason for no events,
- no output path escapes the workspace,
- no raw private data fields are present.

Stop conditions:

- missing patrol block for registered module,
- stale required status,
- conflicting module ids,
- output path outside allowed runtime directories.

## Phase 3: Status Publisher

Purpose:

Generate dialogue-readable status cards and status events from patrol blocks.

Proposed script:

- `scripts/publish-status-cards.mjs`.

Inputs:

- patrol registry,
- module patrol blocks,
- latest validation result,
- optional latest runtime evidence paths.

Outputs:

- `runtime/status-cards/<module_id>.json`,
- `runtime/status-events/<module_id>.json`,
- `runtime/dialogue-system-patrol/latest.json`,
- `runtime/dialogue-system-patrol/latest.md`.

Validation command:

```text
npm.cmd run system-patrol:publish
npm.cmd run system-patrol:validate
```

Rules:

- publisher writes summaries only,
- publisher never writes module source code,
- publisher never writes business data,
- publisher must preserve stale/missing/conflict status,
- publisher must include evidence refs for every non-unknown claim.

Dialogue module impact:

- no dialogue code change should be needed at first,
- existing snapshot reader should start seeing status cards/events.

## Phase 4: Process Tree And Documentation Sync

Purpose:

Make the patrol layer visible in the canonical system tree only after it works.

Inputs:

- passing Phase 2 and Phase 3 evidence,
- user confirmation.

Outputs:

- add `dialogue_system_patrol` node to `examples/system-process-tree.json`,
- register docs, schemas, scripts, runtime outputs in `artifact_registry`,
- update `views/obsidian/system-process-tree.md`,
- update `views/obsidian/system-process-tree.canvas`,
- optionally update docs/15.

Validation:

```text
npm.cmd run process-tree:validate
npm.cmd run system-patrol:validate
```

Stop conditions:

- process-tree validation fails,
- Obsidian sync missing,
- new files not registered.

## Phase 5: Module Onboarding Gate

Purpose:

Make patrol block creation part of future module work.

Current strict boundary:

- report missing process-tree, registry, patrol block, status card/event, or validation evidence,
- enforce missing required patrol evidence as a blocking validation result,
- use `system-patrol:maintain` as the default future module gate,
- do not migrate business-module code without a separate confirmation,
- do not change dialogue-reader source code without a separate confirmation,
- keep 3D projection source-only unless explicitly confirmed otherwise.

Rule:

Any future visible module change must update:

1. process-tree node or artifact registry,
2. patrol block,
3. status card/event output,
4. validation report.

Expected verification sequence for future module changes:

```text
npm.cmd run system-patrol:module-gate -- --module-id=<module_id>
npm.cmd run system-patrol:maintain -- --module-id=<module_id>
npm.cmd run system-patrol:validate
npm.cmd run system-patrol:publish
npm.cmd run process-tree:validate
```

If capability replacement or optimization is involved, also run:

```text
npm.cmd run capability:patrol
```

## Phase 6: Construction Timeline Supervision

Purpose:

Make in-progress module construction visible to the dialogue module.

Required behavior:

- every build phase emits a status event,
- latest event updates the status card,
- failed validation remains visible until superseded,
- user confirmation events are explicit,
- stale or missing build events are surfaced as warnings.

Minimum build event sequence:

```text
module_registered
design_started
design_locked
files_created
contract_declared
implementation_changed
validation_started
validation_failed or validation_passed
process_tree_synced
dialogue_visibility_ready
```

Dialogue output target:

The dialogue module should be able to report exact current phase, last event, evidence, blocker, next action, and freshness.

## Impact-Minimized Order

Recommended order after confirmation:

1. create schemas and templates,
2. create registry draft from current 16 process-tree nodes,
3. write validator,
4. validate only,
5. write publisher,
6. publish status cards/events,
7. inspect dialogue module snapshot behavior,
8. only then register the patrol module in process tree and Obsidian.

This order keeps current runtime behavior stable while making each step reversible.

## Acceptance Criteria

The first implementation should be considered acceptable when:

- all current process-tree nodes are either mapped or explicitly parent-covered,
- status cards exist for mapped modules,
- at least one status event route is proven with sample or generated events,
- stale and missing status are detected,
- validator fails when a required patrol block is removed,
- publisher never outputs raw business data,
- `process-tree:validate` still passes after registration,
- the user can ask the dialogue module about module status without it guessing.
