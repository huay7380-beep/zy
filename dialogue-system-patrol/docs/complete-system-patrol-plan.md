# Complete System Patrol Plan

Status: confirmed design baseline on 2026-07-01; Phase 1 validated and process-tree plus Obsidian registration completed. Strict required coverage, source_hash/source drift detection, module onboarding gate, patrol-maintainer workflow, scaffold entry, dialogue read index, and source-only 3D projection are active.

This file merges the previous global patrol plan, the double-loop confirmation design, and the later refactor-control rules into one implementation-ready plan.

The first goal is functional integration with the current system. Path optimization, richer automation, and deeper UI projection should come later.

## 1. Current-System Fit

The current workspace already has the main pieces needed for a dialogue-readable patrol layer:

| Existing part | Current role | Patrol-layer use |
| --- | --- | --- |
| `examples/system-process-tree.json` | Canonical process-tree and artifact registration source. | Source of expected modules that must be mapped to patrol coverage. |
| `npm.cmd run process-tree:validate` | Validates process-tree, issue register, and Obsidian sync. | Must remain the final registration sync gate after patrol files are added. |
| `capability-upgrade-registry/` | Read-only capability patrol and optimization/replacement analysis. | Optional evidence source, not the live dialogue-status source. |
| `runtime/capability-upgrade-patrols/latest.json` | Latest capability patrol report. | Useful for optimization signals and module decomposition evidence. |
| `sightflow-desktop-agent-main/src/core/status-dialogue/contracts.ts` | Defines `module_status_card.v1` and `status_snapshot.v1`. | Target status-card contract for dialogue module reads. |
| `sightflow-desktop-agent-main/src/core/status-dialogue/status-events.ts` | Defines `module_status_event.v1` and `system_event_snapshot.v1`. | Target event contract for progress, risk, fault, and confirmation feedback. |
| `sightflow-desktop-agent-main/src/main/index.ts` | Reads status card and status event directories from the project root. | Existing reader path. First implementation should not need dialogue-module rewrites. |
| `runtime/status-cards/` | Status-card output directory. | Patrol publisher writes summary cards here for the existing dialogue reader. |
| `runtime/status-events/` | Status-event output directory. | Patrol publisher writes summary events here for the existing dialogue reader. |

The current gap is not that the dialogue module lacks a read model. The gap is that the root system lacks a required status publisher and validator for all visible modules.

## 2. Target

Build `dialogue-system-patrol/` into a read-only patrol publication and verification layer.

It must let the dialogue module answer:

- what modules exist,
- which modules are visible or missing,
- what each module currently does,
- what data flows through each module,
- what changed recently,
- whether the state is fresh or stale,
- what evidence proves the status,
- what is blocked or risky,
- whether a module under construction is progressing correctly,
- whether a module modification has updated its patrol contract,
- whether current source refs have drifted from the stored patrol `source_hash`.

The patrol layer must not:

- replace `examples/system-process-tree.json`,
- replace `capability-upgrade-registry/`,
- mutate business data,
- execute real external actions,
- send messages,
- hide missing status,
- require the dialogue module to parse raw source code,
- store raw private payloads or raw audio.

## 3. Core Architecture

Use a double-loop architecture:

```text
construction constraint loop
  -> requires patrol coverage before and during module work
  -> checks identity, scope, data flow, boundary, validation, status outlet

feedback verification loop
  -> checks whether the expected work happened
  -> checks status card, event stream, freshness, validation, and direction

both loops pass
  -> publish module_status_card.v1 and module_status_event.v1
  -> dialogue module can report the module as readable and current
```

The minimum system objects are:

| Object | Purpose |
| --- | --- |
| `system-patrol-registry` | Global index of modules that require patrol coverage. |
| `module-patrol-block` | Module-owned status contract: identity, data flow, state, evidence, boundaries, validation. |
| `module-status-card` | Current-state summary compatible with `module_status_card.v1`. |
| `module-status-event` | Time-ordered event compatible with `module_status_event.v1`. |
| `system-patrol-validation` | Validation report proving patrol coverage, freshness, and consistency. |

## 4. Required Files For First Implementation

After confirmation, create these implementation files:

```text
dialogue-system-patrol/
  schemas/
    module-patrol-block.schema.json
    system-patrol-registry.schema.json
    system-patrol-validation.schema.json
  registry/
    system-patrol-registry.json
  templates/
    module-patrol-block.template.json
  scripts/
    validate-system-patrol.mjs
    publish-system-patrol.mjs
```

Generate these runtime outputs:

```text
runtime/status-cards/<module_id>.json
runtime/status-events/<module_id>.json
runtime/dialogue-system-patrol/latest.json
runtime/dialogue-system-patrol/latest.md
runtime/dialogue-system-patrol-validations/latest.json
runtime/dialogue-system-patrol-validations/<validation_id>/system-patrol-validation.json
```

Add package commands only after the scripts exist:

```text
npm.cmd run system-patrol:validate
npm.cmd run system-patrol:publish
```

## 5. Module Coverage Rule

Any module must have patrol coverage when it meets any condition below:

- it is registered in `examples/system-process-tree.json`,
- it writes runtime artifacts used by other modules,
- it changes data flow, schema, state, validation gates, or user-visible behavior,
- it should be visible to the dialogue module,
- it should appear in the 3D particle OS or other global views,
- it is part of a module construction, modification, replacement, or migration.

Small helpers may be covered by a parent module only when they have no independent state, runtime output, user-visible behavior, or validation boundary.

If a registered or visible module has no patrol block, the system must report `missing`. The dialogue module must not guess the module status.

After the first validator exists, every visible module construction, modification, replacement, migration, or refactor must trigger the `patrol-maintainer` workflow or an equivalent `system-patrol` validation gate.

This rule is mandatory, but it does not mean every change rebuilds the patrol core. Normal module changes should update only the affected module patrol block and runtime status outputs, or explicitly record that the patrol block is unchanged with evidence.

## 6. Patrol Block Contract

Each `module-patrol-block` should contain:

| Area | Required fields |
| --- | --- |
| Identity | `module_id`, `display_name`, `owner`, `source_dir`, `process_tree_node_id`, `gate`, `compass`. |
| Lifecycle | `planned`, `designing`, `building`, `testing`, `blocked`, `ready`, `validated`, `deprecated`. |
| Data flow | Inputs, processing surface, outputs, downstream consumers, upstream dependencies. |
| State | Headline, current task, progress, blockers, risks, next action. |
| Time | `updated_at`, `ttl_ms`, `change_session_id`, latest event ref. |
| Evidence | File refs, runtime report refs, validation commands, latest validation output refs. |
| Boundaries | Read/write paths, forbidden actions, confirmation gates, private-data restrictions. |
| Dialogue limits | What the dialogue module may state and what it must not infer. |
| Versioning | `patrol_contract_version`, `supersedes`, `source_hash`. |

## 7. Dialogue Module Output Mapping

The publisher converts patrol blocks into existing dialogue-readable outputs.

### `module_status_card.v1`

Write one current card per module:

```text
runtime/status-cards/<module_id>.json
```

It must include the existing card fields:

- `schema`,
- `module_id`,
- `display_name`,
- `owner`,
- `gate`,
- `status`,
- `updated_at`,
- `ttl_ms`,
- `headline`,
- `current_focus`,
- `current_task`,
- `inputs`,
- `outputs`,
- `blockers`,
- `risks`,
- `next`,
- `confidence`,
- `source_refs`,
- `visibility`.

### `module_status_event.v1`

Write one event file or event collection per module:

```text
runtime/status-events/<module_id>.json
```

Events must use the current event contract:

- `schema`,
- `event_id`,
- `generated_at`,
- `source_module`,
- `source_node`,
- `event_type`,
- `severity`,
- `headline`,
- `summary`,
- `completion`,
- `gate`,
- `compass`,
- `evidence_refs`,
- `recommended_broadcast`,
- `ttl_ms`,
- `dedupe_key`,
- `boundary`.

The current dialogue reader already accepts a single event object or an object with an `events` array.

## 8. Standard Status Model

The patrol validator and publisher should normalize module state into these outcomes:

| Patrol state | Meaning |
| --- | --- |
| `validated` | Patrol block exists, state is fresh, events exist, validation passed. |
| `building` | Construction or modification is active and event sequence is fresh. |
| `blocked` | Missing input, user confirmation, boundary, or validation failure prevents progress. |
| `feedback_missing` | Construction constraint exists but feedback event or status card is missing. |
| `stale` | Status card or event exceeded `ttl_ms`. |
| `direction_drift` | Actual evidence does not match the declared target or data-flow contract. |
| `validation_failed` | Required validation command failed or required proof is absent. |
| `missing` | Expected module has no patrol block or no parent coverage. |
| `unknown` | Evidence is insufficient; dialogue must not guess. |

Map these to current dialogue statuses:

| Patrol state | `module_status_card.v1.status` |
| --- | --- |
| `validated` | `ok` |
| `building` | `warn` |
| `blocked` | `blocked` |
| `feedback_missing` | `warn` |
| `stale` | `warn` |
| `direction_drift` | `blocked` |
| `validation_failed` | `blocked` |
| `missing` | `unknown` |
| `unknown` | `unknown` |

## 9. Construction Event Sequence

For new module work, the minimum event sequence is:

```text
construction_intent
module_registered
design_started
design_locked
files_created
contract_declared
implementation_changed
validation_started
validation_failed or validation_passed
status_card_published
status_event_published
dialogue_visibility_ready
```

Current `module_status_event.v1` only supports these event types:

```text
system_change
nebula_change
progress_update
completion
risk
fault
confirmation_needed
```

Therefore the implementation should store detailed construction phase names in `headline`, `summary`, `dedupe_key`, `gate`, `compass`, or an allowed extension field if the schema is extended later. For the first implementation, do not change the dialogue event schema unless necessary.

## 10. Refactor And Modification Rules

The patrol core must not be rebuilt for every business-module modification.

Separate the system into three layers:

```text
patrol core protocol
  schemas / registry / validator / publisher
  low-frequency changes only

module patrol block
  one contract per visible module or parent-covered module group
  updated when that module changes

runtime status output
  status cards, status events, validation reports
  generated frequently and safe to refresh
```

When a business module changes:

```text
module change detected or requested
  -> create change_session_id
  -> inspect whether identity, inputs, outputs, schema, boundary, or validation changed
  -> update only that module patrol block when needed
  -> emit implementation_changed or contract_declared status event
  -> refresh that module status card
  -> run system-patrol validation
  -> publish dialogue_visibility_ready only when validation passes
```

Internal-only changes may keep the patrol block version unchanged, but they must still emit an `implementation_changed` event and refresh the status card if they affect current status or evidence.

## 11. Refactor Anti-Confusion Rules

To prevent repeated modifications from corrupting patrol state, every patrol block and event must carry stable identity and version fields:

| Field | Role |
| --- | --- |
| `module_id` | Stable module identity. It must not change during refactors. |
| `patrol_contract_version` | Version of the module patrol block. |
| `change_session_id` | One module construction, modification, or refactor session. |
| `supersedes` | Previous patrol block, status card, or event superseded by this update. |
| `source_hash` | Hash or fingerprint of relevant source/evidence files. |

Rules:

- Latest status card may be overwritten.
- Historical events must not be silently deleted.
- A new event should supersede old failure events only when it carries evidence of the later pass.
- If source files changed but patrol block version and source hash did not change, validator should flag `direction_drift` or `feedback_missing`.
- If two patrol blocks claim the same `module_id`, validator should flag a conflict.
- If a module disappears from the process tree but still has active status output, validator should flag orphaned status.

## 12. Patrol Protocol Refactor

Changing the patrol protocol itself is a separate migration, not a normal module modification.

Protocol refactor is allowed only when these change:

- schema shape,
- status model,
- validation rules,
- publisher output paths,
- dialogue-module contract mapping,
- required module coverage rules.

Protocol refactor must emit its own sequence:

```text
patrol_protocol_migration_started
schema_changed
registry_migration_started
module_blocks_migrated
publisher_compatibility_checked
validation_passed
migration_completed
```

Rules:

- Keep old patrol blocks readable during migration when practical.
- Do not break existing `module_status_card.v1` or `module_status_event.v1` output without a separate dialogue-module migration.
- Do not delete old runtime evidence during the migration.
- Mark incompatible modules as `blocked`, not `validated`.

## 13. Patrol Maintainer Subagent

A dedicated patrol maintainer subagent is the preferred maintenance surface, but it should be a maintenance executor, not the source of truth.

After the first validator exists, this role becomes the mandatory workflow entry for visible module construction, modification, migration, replacement, and refactor work. If a true separate subagent is not available in the tool environment, the same duties must still be performed by an equivalent `system-patrol` validation workflow before the module can be marked current.

Suggested name:

```text
patrol-maintainer
```

Allowed responsibilities:

- inspect new or modified modules for missing patrol coverage,
- draft or update module patrol blocks,
- emit status events,
- refresh status cards,
- run patrol validation,
- detect `missing`, `stale`, `feedback_missing`, `direction_drift`, and `validation_failed`,
- request user confirmation when protocol-level migration or unclear boundaries appear.

Forbidden responsibilities:

- directly rewrite business logic,
- replace business-module tests,
- invent unverified module state,
- delete old status history,
- bypass user confirmation,
- mutate process tree or Obsidian views without a confirmed sync step.

The deterministic validator remains the judge. The subagent can propose and update, but validation decides whether the system is acceptable.

The patrol maintainer must not rebuild the patrol core for normal business-module changes. It may update only the affected module patrol block, status card, status event, and validation evidence unless the user confirms a protocol-level migration.

## 14. Validation Gates

First implementation should use this sequence:

```text
npm.cmd run system-patrol:validate
npm.cmd run system-patrol:publish
npm.cmd run process-tree:validate
npm.cmd run system-patrol:module-gate -- --module-id=<module_id>
npm.cmd run system-patrol:maintain -- --module-id=<module_id>
```

If capability replacement, optimization, or candidate discovery is involved:

```text
npm run capability:patrol
```

Validator checks:

- every visible process-tree node has a patrol block or explicit parent coverage,
- every patrol block has identity, data flow, state, evidence, boundaries, validation, and dialogue limits,
- every required output path is inside allowed runtime directories,
- every status card uses `module_status_card.v1`,
- every status event uses `module_status_event.v1`,
- every timestamp and TTL is valid,
- missing, stale, conflicting, or orphaned status is reported,
- source hash drift is reported,
- no raw private payloads are published,
- process-tree sync still passes after registering the patrol module.

## 15. Minimal Implementation Phases

### Phase 1: Contracts And Registry

Create schemas, template, and initial registry from the current process tree.

No runtime publication yet.

### Phase 2: Read-Only Validator

Implement `validate-system-patrol.mjs`.

It should read the process tree, registry, patrol blocks, and existing runtime evidence, then write validation reports.

### Phase 3: Status Publisher

Implement `publish-system-patrol.mjs`.

It should generate summary-only status cards and status events for the dialogue module.

### Phase 4: Dialogue Read Check

Use the existing dialogue reader paths to verify cards and events load.

Do not rewrite dialogue-module logic unless the existing reader cannot consume valid outputs.

### Phase 5: Process Tree Registration

Completed after validation and publication work:

- add the patrol module node to `examples/system-process-tree.json`,
- register docs, schemas, scripts, and runtime outputs,
- update Obsidian Markdown and Canvas views,
- run `npm.cmd run process-tree:validate`.

### Phase 6: Future Module Gate

Make patrol coverage a required checklist for future visible module work.

Current implementation provides the module gate and the strict patrol-maintainer workflow:

```text
npm.cmd run system-patrol:module-gate -- --module-id=<module_id>
npm.cmd run system-patrol:module-gate -- --all
npm.cmd run system-patrol:maintain -- --module-id=<module_id>
npm.cmd run system-patrol:maintain -- --all
```

Every future module change should end with:

```text
patrol block updated or explicitly unchanged with evidence
status card refreshed
status event emitted
system-patrol validation passed
process-tree validation passed when registration changes
module onboarding gate passed
dialogue read index and source-only projection refreshed
```

## 16. Acceptance Criteria

The first implementation is acceptable when:

- all current process-tree nodes are mapped or explicitly parent-covered,
- root `runtime/status-cards/` exists and contains readable cards,
- root `runtime/status-events/` exists and contains readable events,
- the dialogue module can load `status_snapshot.v1` and `system_event_snapshot.v1` from those outputs,
- deleting a required patrol block triggers `missing`,
- letting a status exceed TTL triggers `stale`,
- modifying module evidence without patrol update triggers `feedback_missing` or `direction_drift`,
- validation failures remain visible until superseded by later passing evidence,
- publisher outputs summary-only data,
- `npm.cmd run process-tree:validate` still returns synced state after patrol registration.

## 17. Recommended First Concrete Build

Start with the smallest useful working path:

1. Create schemas and a template.
2. Create `system-patrol-registry.json` from the 16 current process-tree nodes.
3. Write a validator that detects missing patrol blocks.
4. Write one initial patrol block for `dialogue_system_patrol`.
5. Publish one status card and one status event.
6. Confirm the existing dialogue reader loads them.
7. Expand coverage to the remaining process-tree nodes.
8. Register the patrol module in process tree and Obsidian only after the above works.

This keeps implementation simple while making the future rule enforceable: every visible module must remain readable by the dialogue module through patrol status, and every modification must either update patrol state or prove that no patrol contract changed.
