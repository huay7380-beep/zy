# Execution Compass

Status: confirmed compass; Phase 1 validated and registered in the process tree plus Obsidian views on 2026-07-01. Strict required coverage, source_hash/source drift detection, module onboarding gate, patrol-maintainer workflow, scaffold entry, dialogue read index, and source-only 3D projection are active. Business-module code migration, dialogue-reader code changes, non-source-only 3D behavior, and protocol migration still require explicit confirmation.

This compass turns the confirmed system patrol design into a narrow implementation path. Phase 1 is complete and the next-stage patrol governance is active; later phases still require confirmation before business-module code migration, dialogue-reader source changes, non-source-only 3D behavior, or protocol-migration changes.

## North Star

Make the current system readable by the dialogue module through patrol-generated status cards and status events.

Phase 1 has proven this path:

```text
process tree
  -> patrol registry
  -> module patrol blocks or explicit missing coverage
  -> source_hash/source drift check
  -> validation report
  -> runtime/status-cards
  -> runtime/status-events
  -> existing dialogue module reader
```

Do not optimize the architecture before this path works.

## Current Position

The confirmed current state is:

- `dialogue-system-patrol/docs/complete-system-patrol-plan.md`
- `examples/system-process-tree.json` remains the registration source of truth.
- The dialogue module already knows how to read `module_status_card.v1` and `module_status_event.v1`.
- Root `runtime/status-cards/` and `runtime/status-events/` exist and contain 17 summary outputs each.
- Patrol schemas, registry, patrol blocks, validator, initializer, and publisher exist.
- Phase 5 module onboarding gate exists as `system-patrol:module-gate`.
- Strict required coverage is enabled in the registry.
- Source drift detection exists as `system-patrol:source-drift`.
- Patrol-maintainer workflow exists as `system-patrol:maintain`.
- Unified local/CI enforcement exists as `system-patrol:enforce`.
- Module scaffold entry exists as `system-patrol:scaffold`.
- Dialogue read index and source-only 3D projection are published by `system-patrol:surfaces`.
- Latest validation reports `system_patrol_validated` with no required or warning failures.
- `dialogue_system_patrol` is registered in the process tree and Obsidian Markdown/Canvas views.

## Recommended First Path

Phase 1 used a missing-aware bootstrap first.

The implementation first made the system capable of saying:

```text
this module is covered
this module is parent-covered
this module is missing patrol coverage
this module has stale status
this module has invalid status output
```

That path is now validated. The generated process-tree patrol blocks are summary coverage, not a deep code interpretation of each module.

## Phase 1 Scope

Completed after user confirmation:

- create patrol schemas under `dialogue-system-patrol/schemas/`,
- create patrol templates under `dialogue-system-patrol/templates/`,
- create the first registry under `dialogue-system-patrol/registry/`,
- create a read-only validator under `dialogue-system-patrol/scripts/`,
- create a publisher under `dialogue-system-patrol/scripts/`,
- add `system-patrol:validate` and `system-patrol:publish` package commands after scripts exist,
- write summary-only runtime outputs under `runtime/status-cards/`, `runtime/status-events/`, and `runtime/dialogue-system-patrol*/`.

Also completed:

- create `system-patrol:blocks:init`,
- initialize 16 process-tree-derived module patrol blocks,
- publish 17 status cards and 17 status events,
- validate the patrol layer with no required or warning failures.

Not allowed in Phase 1:

- rewrite the dialogue module,
- rewrite business modules,
- mutate business data,
- send messages,
- execute external platform actions,
- change 3D particle OS projection files,
- register the patrol module in the process tree before validator and publisher are proven,
- mark missing modules as healthy.

## First Implementation Units

Build in this order:

1. `module-patrol-block.schema.json`
2. `system-patrol-registry.schema.json`
3. `system-patrol-validation.schema.json`
4. `module-patrol-block.template.json`
5. `system-patrol-registry.json`
6. `validate-system-patrol.mjs`
7. `publish-system-patrol.mjs`
8. `package.json` scripts
9. runtime status-card and status-event publication
10. process-tree registration only after successful proof

## Registry Rule

The initial registry should be derived from the current process tree.

For every process-tree node, the registry should say one of:

- `required`: this node needs its own patrol block,
- `parent_covered`: this node is covered by another module patrol block,
- `missing`: this node is expected but not yet covered,
- `excluded`: this node is intentionally outside patrol scope with a reason.

Default should be `required` unless there is explicit parent coverage.

## Validator Rule

The validator is the judge.

It should read:

- `examples/system-process-tree.json`,
- `dialogue-system-patrol/registry/system-patrol-registry.json`,
- `dialogue-system-patrol/schemas/*.json`,
- module patrol blocks when they exist,
- generated status cards and status events when they exist.

It should write:

```text
runtime/dialogue-system-patrol-validations/latest.json
runtime/dialogue-system-patrol-validations/<validation_id>/system-patrol-validation.json
```

It should detect:

- missing patrol blocks,
- missing registry entries,
- invalid schema files,
- invalid status-card output,
- invalid status-event output,
- stale outputs,
- duplicate module ids,
- orphaned status outputs,
- path escapes,
- raw private payload fields,
- source drift without patrol update when source hashes are available.

## Publisher Rule

The publisher should be summary-only.

It should never inspect or publish raw private payloads. It should convert validation and patrol-block state into:

```text
runtime/status-cards/<module_id>.json
runtime/status-events/<module_id>.json
runtime/dialogue-system-patrol/latest.json
runtime/dialogue-system-patrol/latest.md
```

For modules with no patrol block, it may publish an `unknown` or `warn` card that clearly says patrol coverage is missing. That is allowed because it reports absence of evidence instead of guessing system state.

## Status Decision Table

| Condition | Status card | Event severity | Patrol finding |
| --- | --- | --- | --- |
| Patrol block valid and fresh | `ok` | `info` | `validated` |
| Work in progress with fresh events | `warn` | `notice` | `building` |
| Patrol block missing | `unknown` | `warn` | `missing` |
| Event or card expired | `warn` | `warn` | `stale` |
| Expected event/card absent | `warn` | `warn` | `feedback_missing` |
| Validation failed | `blocked` | `blocked` | `validation_failed` |
| Evidence contradicts patrol block | `blocked` | `blocked` | `direction_drift` |

## Refactor Compass

Normal module refactors must not rebuild the patrol core.

Use this split:

```text
patrol core
  schemas / registry / validator / publisher
  changed only through patrol protocol migration

module patrol block
  changed when that module identity, data flow, boundary, validation, or output changes

runtime status output
  regenerated frequently and safely
```

Every module modification should carry:

- stable `module_id`,
- `change_session_id`,
- `patrol_contract_version`,
- `supersedes` when replacing earlier evidence,
- `source_hash` when practical.
- `source_hash_algorithm`, `source_hash_generated_at`, `source_hash_refs`, and `source_hash_excluded_refs`.

Repeated changes should create a timeline, not overwrite the story.

## Patrol Maintainer Role

The `patrol-maintainer` role is the preferred maintenance surface.

After the first validator exists, it becomes mandatory as a workflow entry for every visible module construction, modification, migration, replacement, or refactor. If a true separate subagent is not available in the tool environment, an equivalent `system-patrol` validation workflow must perform the same checks before the module can be marked current.

It should:

- check whether new or modified modules need patrol coverage,
- draft patrol block updates,
- emit status events,
- refresh status cards,
- run patrol validation,
- report missing, stale, drift, or failed validation states.

It must not:

- rewrite business logic,
- bypass validation,
- invent state,
- delete history,
- perform protocol migration without user confirmation.

During Phase 1 before the validator exists, this can be a documented role and workflow. A true separate subagent can be added later if the tool environment supports it cleanly.

Mandatory post-validator rule:

```text
visible module change
  -> update process-tree node first when the module is new
  -> scaffold patrol coverage through system-patrol:scaffold when needed
  -> review or update affected module patrol block
  -> refresh source_hash through system-patrol:source-drift -- --update --module-id=<module_id>
  -> patrol-maintainer workflow through system-patrol:maintain
  -> refresh status event and status card
  -> run validation
  -> run module onboarding gate for the affected module
  -> refresh dialogue read index and source-only projection
  -> only then report current state to dialogue module
```

Normal module changes must not rebuild the patrol core. Only protocol-level migration can change schemas, registry semantics, validator rules, publisher output paths, or dialogue contract mapping.

## Real-Time Build Verification

During execution, each meaningful build step should end with one local check:

| Build step | Check |
| --- | --- |
| schema created | JSON parse and basic required-field check |
| registry created | process-tree node ids are represented |
| validator created | validator produces a validation report |
| publisher created | publisher writes valid status cards and events |
| package scripts added | scripts run through `npm.cmd run ...` |
| source drift checker added | `npm.cmd run system-patrol:source-drift -- --all` returns `source_hash_current` after reviewed baselines are updated |
| runtime outputs created | existing dialogue reader can load cards/events |
| process tree updated | `npm.cmd run process-tree:validate` returns synced state |
| module onboarding gate added | `npm.cmd run system-patrol:module-gate -- --module-id=dialogue_system_patrol` returns `module_onboarding_ready` |
| strict patrol governance active | `npm.cmd run system-patrol:maintain -- --all` returns `patrol_maintainer_ready` |
| CI/pre-commit entry active | `npm.cmd run system-patrol:enforce` returns `patrol_maintainer_ready` |

## Stop Conditions

Stop and ask before continuing if:

- a change would modify business-module logic,
- a change would alter dialogue-module reader contracts,
- a generated output would include raw private payloads,
- process-tree validation fails after registration,
- status-card/event contracts need schema changes,
- two modules claim the same `module_id`,
- implementation requires choosing parent coverage for ambiguous modules,
- a visible module change tries to skip the patrol-maintainer or equivalent `system-patrol` gate after the validator exists,
- source files changed but the affected module patrol block has not been reviewed and its source_hash baseline has not been refreshed,
- a normal business-module refactor would rebuild the patrol core,
- patrol protocol migration becomes necessary.

## Confirmation Request

If this compass is confirmed, the next execution should start with Phase 1:

```text
create schemas
create template
create registry
create read-only validator
validate before publishing
```

Only after that should status publication, package scripts, runtime outputs, and process-tree registration happen.
