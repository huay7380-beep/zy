# Global Patrol Target And Contract

Status: confirmed design baseline; Phase 1 validated on 2026-07-01; construction-time build timeline protocol added on 2026-07-05.

## Objective

Build a global patrol layer that lets the dialogue module discover, inspect, and explain the current state and latest construction phase of every system-visible module.

The layer should give the dialogue module precise, time-aware, evidence-backed feedback about:

- module identity,
- module lifecycle,
- module data flow,
- current module state,
- recent changes,
- build or validation progress,
- blockers and risks,
- next actions,
- freshness and confidence,
- read/write boundaries.

The final goal is not only "system health". The final goal is that the dialogue module can answer the user accurately when asked:

- What modules exist?
- What is this module doing?
- What data goes into and out of it?
- What changed recently?
- Is the state fresh or stale?
- Is the module blocked?
- What evidence proves this?
- What is still unsafe or unconfirmed?
- During construction, where exactly is the build process now?

## Terminology

| Term | Meaning |
| --- | --- |
| Global patrol layer | The proposed coordination layer under `dialogue-system-patrol/`. |
| Patrol block | A module-owned machine-readable contract describing identity, data flow, state, evidence, and boundaries. |
| Patrol registry | The global index of modules that must publish patrol blocks. |
| Status card | A compact current-state snapshot for one module, compatible with `module_status_card.v1`. |
| Status event | A time-ordered event describing a change, progress update, fault, risk, or confirmation need, compatible with `module_status_event.v1`. |
| Build timeline | An append-only `module_build_timeline_event.v1` JSONL sequence emitted while a module is being designed, built, tested, validated, or changed. |
| Dialogue snapshot | Aggregated status cards/events read by the dialogue module as `status_snapshot.v1` and `system_event_snapshot.v1`. |

## Required Rule For Future Modules

Any future module must publish a patrol block and build timeline when it meets any of these conditions:

- it is registered in `examples/system-process-tree.json`,
- it writes runtime artifacts used by the system,
- it changes user-facing behavior,
- it changes data flow, schema, state, or validation gates,
- it should be visible in the 3D particle OS,
- the dialogue module may need to explain it to the user.

Small helpers can be covered by a parent module only when they do not introduce independent state, data flow, runtime artifacts, or user-visible behavior.

If a visible module has no patrol block or build timeline, the dialogue module should not guess. It should report:

```text
This module is registered or referenced, but patrol evidence is missing. Current state and construction phase cannot be confirmed.
```

## Patrol Block Responsibilities

A patrol block must explain the module at a level useful for dialogue and system inspection.

It should not duplicate all source code. It should expose a verified summary and point to evidence.

Required responsibility areas:

| Area | Required Content |
| --- | --- |
| Identity | `module_id`, display name, owner, gate, compass, source directory. |
| Lifecycle | planned, designing, building, testing, blocked, ready, validated, deprecated. |
| Data flow | inputs, processing surface, outputs, downstream consumers, upstream dependencies. |
| Current state | headline, current task, progress, blockers, risks, next action. |
| Time | `updated_at`, `ttl_ms`, event sequence, build run id when applicable. |
| Evidence | file refs, runtime report refs, validation commands, latest validation outputs. |
| Boundaries | read-only or write paths, forbidden actions, confirmation gates. |
| Dialogue limits | what the dialogue module may say, what it must not infer. |

## Current State Snapshot

The current-state output should map to `module_status_card.v1`.

Suggested fields:

| Field | Purpose |
| --- | --- |
| `schema` | `module_status_card.v1`. |
| `module_id` | Stable id matching process tree or patrol registry. |
| `display_name` | Human-readable name. |
| `owner` | Responsible module or area. |
| `gate` | Decision or validation gate. |
| `status` | `ok`, `warn`, `blocked`, or `unknown`. |
| `updated_at` | Exact timestamp for freshness checks. |
| `ttl_ms` | How long the status can be trusted before stale. |
| `headline` | One-sentence state. |
| `current_task` | What is happening now. |
| `inputs` | Important current input contracts or sources. |
| `outputs` | Important current output contracts or artifacts. |
| `blockers` | Concrete blockers. |
| `risks` | Known risks or uncertainty. |
| `next` | Next actions. |
| `confidence` | 0 to 1 confidence in the state. |
| `source_refs` | Evidence paths. |
| `visibility` | Always summary-only for dialogue. |

## Time-Ordered Event Stream

The current event output should map to `module_status_event.v1`.

Construction and modification history should map to the append-only `module_build_timeline_event.v1` stream under `runtime/module-build-timelines/<module_id>.jsonl`.

Required event classes:

| Event Type | When To Emit |
| --- | --- |
| `module_registered` | Module appears in process tree or patrol registry. |
| `design_started` | Design work begins. |
| `contract_declared` | Input/output contract is declared or changed. |
| `implementation_changed` | Code or module structure changes. |
| `validation_started` | Validation begins. |
| `validation_failed` | A validation command fails or required evidence is missing. |
| `validation_passed` | A validation command passes. |
| `publication_done` | Status card/event publication completed. |
| `source_drift_checked` | Source hash check ran without updating the baseline. |
| `source_drift_updated` | Reviewed source hash baseline was refreshed. |
| `dialogue_visibility_ready` | Status card/event output can be read by dialogue module. |
| `blocked` | Work cannot continue without confirmation or missing input. |
| `confirmed` | User or operator confirms a gate. |

Each current status event should include:

- `event_id`,
- `generated_at`,
- `source_module`,
- `source_node`,
- `event_type`,
- `severity`,
- `headline`,
- `summary`,
- `completion.current`,
- `completion.label`,
- `gate`,
- `compass`,
- `evidence_refs`,
- `recommended_broadcast`,
- `ttl_ms`,
- `dedupe_key`,
- `boundary`.

Each build timeline event should include:

- `event_id`,
- `generated_at`,
- `module_id`,
- `operation_id`,
- `sequence`,
- `phase`,
- `status`,
- `summary`,
- `construction_depth`,
- `source_refs`,
- `evidence_refs`,
- `validation_refs`,
- `source_hash`,
- `module_gate`,
- `dialogue_visibility`,
- `boundaries`.

## Construction Supervision Example

When a new module is being built, the patrol layer should emit a current status card, a current status event, and an append-only build timeline sequence.

Example timeline:

```text
T1 module_registered
T2 design_started
T3 contract_declared
T4 implementation_changed
T5 validation_started
T6 validation_failed
T7 implementation_changed
T8 validation_passed
T9 publication_done
T10 source_drift_updated
T11 dialogue_visibility_ready
```

At T7, the dialogue module should be able to say:

```text
The module is in testing. The latest validation failed. The failed command is referenced in the event evidence. The current blocker is the schema mismatch, and the next action is to update the patrol block or implementation until the validator passes.
```

At T11, it should be able to say:

```text
The module is visible to the dialogue layer. Its status card is fresh, process-tree sync has passed, and the latest status event reports dialogue visibility ready.
```

## Data Flow

Proposed input sources:

| Input | Role |
| --- | --- |
| `examples/system-process-tree.json` | Source of registered system nodes and artifact references. |
| `package.json` | Source of available validation commands. |
| Module patrol block | Module-owned explanation of state and data flow. |
| Module build timeline | Append-only construction, modification, validation, and dialogue visibility history. |
| Runtime report paths | Evidence for validation and current state. |
| Process-tree validation output | Evidence that system registration is synced. |
| Capability patrol output | Optional optimization and replacement insight. |

Proposed outputs:

| Output | Consumer |
| --- | --- |
| `runtime/status-cards/<module_id>.json` | Dialogue module status snapshot reader. |
| `runtime/status-events/<module_id>.json` | Dialogue module event reader and voice broadcast logic. |
| `runtime/module-build-timelines/<module_id>.jsonl` | Patrol validator, module gate, and dialogue read index aggregation. |
| `runtime/dialogue-system-patrol/latest.json` | Human and script inspection. |
| `runtime/dialogue-system-patrol/latest.md` | Human-readable audit view. |
| Validation report | Process-tree and implementation gates. |

## Freshness And Precision

State must be time-aware. Every status card and event must carry a timestamp and TTL.

Rules:

- fresh state can be summarized as current,
- stale state can only be described as the last known state,
- missing state must not be guessed,
- conflicting state must be reported as a conflict,
- failed validation must remain visible until a later passing event supersedes it,
- build progress must use event order and `completion.current`, not vague wording.

The dialogue module should prefer exact dates and evidence refs when discussing recent changes.

## Module Modification Rules

When an existing module changes, the patrol layer should require:

1. update the module patrol block if identity, data flow, output, gate, boundary, or validation changes,
2. emit an `implementation_changed` or `contract_declared` event,
3. rerun the patrol validator,
4. refresh the module status card,
5. emit `validation_failed` or `validation_passed`,
6. keep old failure events visible until superseded.

If code changes but no patrol block changes, the validator should flag a drift warning:

```text
implementation changed, patrol block unchanged, dialogue state may be stale
```

## Non-Goals

This layer should not:

- execute real external actions,
- send messages,
- mutate business data,
- replace process-tree governance,
- replace capability-upgrade candidate evaluation,
- require the dialogue module to parse full source code,
- store raw private user data,
- store raw audio,
- hide missing or stale state.

## Success Criteria

The design is successful when:

- every process-tree node can be mapped to a patrol block or explicit parent coverage,
- every visible module can publish a status card,
- important changes can publish status events,
- the dialogue module can report fresh/stale/missing/conflict states accurately,
- a module under construction can expose its build timeline,
- validators prevent silent drift between module changes and patrol visibility.
