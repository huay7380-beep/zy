# Build Timeline Protocol And Dialogue Chain

Status: implemented as an additive patrol protocol on 2026-07-05.

This document defines the missing construction-time feedback loop for the dialogue system patrol layer.

## Goal

The patrol layer must not only report a module's final or current state. It must also expose how a visible module is being constructed, changed, validated, blocked, and made readable to the dialogue module.

The target chain is:

```text
module construction or modification
  -> module patrol block update
  -> append-only build timeline event
  -> system patrol validation
  -> status card and status event publication
  -> module gate validation
  -> dialogue read index aggregation
  -> dialogue module reads precise state and latest construction phase
```

## Bottom Rule

Every visible module must have four patrol surfaces:

| Surface | Path | Purpose |
| --- | --- | --- |
| Patrol block | `dialogue-system-patrol/blocks/<module_id>.patrol.json` | Stable module identity, data flow, evidence, boundaries and state. |
| Status card | `runtime/status-cards/<module_id>.json` | Current summary snapshot for status dialogue readers. |
| Status event | `runtime/status-events/<module_id>.json` | Current event summary and voice/broadcast decision. |
| Build timeline | `runtime/module-build-timelines/<module_id>.jsonl` | Append-only construction history and latest build phase. |

The registry field `build_timeline_output` is mandatory for every required module.

## Build Timeline Event

Each timeline line is one `module_build_timeline_event.v1` JSON object.

Required meaning:

- `module_id`: the module under construction or modification.
- `operation_id`: the construction/change session.
- `sequence`: append order inside that module timeline.
- `phase`: lifecycle step such as `contract_declared`, `implementation_changed`, `validation_passed`, or `dialogue_visibility_ready`.
- `status`: `started`, `in_progress`, `blocked`, `failed`, `passed`, `completed`, or `skipped`.
- `construction_depth`: how deep the change reached: patrol block, data flow, runtime status surface, validation, or dialogue surface.
- `source_refs`, `evidence_refs`, `validation_refs`: proof paths the dialogue module may cite.
- `source_hash` and `module_gate`: latest machine-check state when the event was recorded.
- `dialogue_visibility`: whether the module is present in `runtime/dialogue-system-patrol/dialogue-read-index.json`.

## Double Loop

### Loop 1: Construction Guidance

For new or modified visible modules:

```text
register process-tree node if needed
run system-patrol:scaffold when patrol coverage is missing
update patrol block data_flow/state/evidence
record build timeline event
refresh source_hash after review
run system-patrol:maintain
```

This loop prevents new modules from being invisible to patrol.

### Loop 2: Feedback Verification

The gate verifies:

```text
registry entry exists
patrol block exists and matches module
source_hash is current
status card exists
status event exists
build timeline exists
latest timeline event matches module
timeline is newer than patrol/status inputs
system patrol validation passed
process-tree validation passed
```

If any feedback surface is missing, invalid, stale, or mismatched, the module is blocked from current-state claims.

## Dialogue Index Aggregation

`system-patrol:surfaces` writes:

```text
runtime/dialogue-system-patrol/dialogue-read-index.json
```

Each module entry includes:

- `build_timeline_output`
- `build_timeline_events_total`
- `build_timeline_event_id`
- `build_timeline_generated_at`
- `build_timeline_phase`
- `build_timeline_status`
- `build_timeline_summary`
- `build_timeline_operation_id`
- `build_timeline_required_failures`

The dialogue module can read this index directly and explain:

- which module is current or blocked,
- which construction phase is latest,
- whether source drift exists,
- whether the module gate passed,
- which evidence path should be inspected next.

## Commands

Append a module build timeline event:

```text
npm.cmd run system-patrol:timeline -- --module-id=<module_id> --phase=implementation_changed --status=in_progress --summary=<summary>
```

Append for all registered modules:

```text
npm.cmd run system-patrol:timeline -- --all --phase=dialogue_visibility_ready --status=completed --summary=<summary>
```

Run the full maintainer chain:

```text
npm.cmd run system-patrol:maintain -- --module-id=<module_id>
npm.cmd run system-patrol:maintain -- --all
```

Refresh source hash after reviewed source or patrol edits:

```text
npm.cmd run system-patrol:source-drift -- --update --module-id=<module_id>
```

## Boundaries

This protocol does not rewrite business modules, send messages, execute external actions, or publish raw private payloads.

The timeline is a status-feedback channel, not a source of business truth. It tells the dialogue module what the patrol system observed, what phase was reached, what validation ran, and what evidence paths support that claim.
