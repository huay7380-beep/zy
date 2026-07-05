# Module Onboarding Gate

Status: Phase 5 gate introduced on 2026-07-01 and now used under strict required coverage.

This gate is the next step after process-tree and Obsidian registration. It makes future visible module work checkable under strict required coverage without migrating business-module code.

## Purpose

Before a visible module is reported as current to the dialogue module, the workspace should be able to prove that the module has:

- a process-tree node,
- a system patrol registry entry,
- a module patrol block,
- a current `versioning.source_hash` that matches the module patrol block's source refs,
- a dialogue-readable status card,
- a dialogue-readable status event,
- a passing latest system-patrol validation,
- a passing latest process-tree validation.

The gate reports missing evidence. It does not rewrite module code and does not infer status from source files.

## Command

Check one module:

```text
npm.cmd run system-patrol:module-gate -- --module-id=<module_id>
```

Check all registered patrol modules:

```text
npm.cmd run system-patrol:module-gate -- --all
```

The command writes:

```text
runtime/dialogue-system-patrol-module-gates/latest.json
runtime/dialogue-system-patrol-module-gates/latest.md
runtime/dialogue-system-patrol-module-gates/<gate_id>/module-onboarding-gate.json
runtime/dialogue-system-patrol-module-gates/<gate_id>/module-onboarding-gate.md
```

## Gate Decision

| Decision | Meaning |
| --- | --- |
| `module_onboarding_ready` | Required evidence exists and current validations pass. |
| `module_onboarding_blocked` | Required evidence is missing, invalid, stale, or contradicted by validation. |

## Required Checks

| Check | Purpose |
| --- | --- |
| `process_tree_node_registered` | The module is visible in `examples/system-process-tree.json`. |
| `registry_entry_registered` | The module is represented by `system-patrol-registry.json`. |
| `registry_maps_process_tree_node` | The registry entry maps back to the process-tree node. |
| `patrol_block_exists` | The module patrol block exists and is readable. |
| `patrol_block_matches_module` | The patrol block `module_id` matches the checked module. |
| `source_hash_current` | The patrol block `versioning.source_hash` matches the current non-runtime `evidence.source_refs` content. |
| `status_card_exists` | A `module_status_card.v1` output exists and matches the module. |
| `status_event_exists` | A `module_status_event.v1` output exists and matches the module. |
| `system_patrol_validation_passed` | Latest system-patrol validation has no failures. |
| `system_patrol_validation_fresh` | Latest system-patrol validation is newer than registry, patrol block, status card, and status event inputs. |
| `module_finding_validated` | Latest system-patrol validation marks this module `validated`. |
| `process_tree_validation_synced` | Latest process-tree validation reports `process_tree_synced`. |
| `process_tree_validation_fresh` | Latest process-tree validation is newer than the process tree and Obsidian view inputs. |

## Future Module Change Sequence

For visible module construction, modification, migration, replacement, or refactor:

```text
update process-tree node or artifact registry
update or confirm module patrol block
npm.cmd run system-patrol:source-drift -- --update --module-id=<module_id>
npm.cmd run system-patrol:validate
npm.cmd run system-patrol:publish
npm.cmd run process-tree:validate
npm.cmd run system-patrol:module-gate -- --module-id=<module_id>
```

Only after this sequence passes should the dialogue module treat the module status as current.

For a new visible module, use the scaffold entry after adding the process-tree node:

```text
npm.cmd run system-patrol:scaffold -- --module-id=<module_id> --verify
```

For CI or local pre-commit enforcement, use the all-module entry:

```text
npm.cmd run system-patrol:enforce
```

## Boundaries

This gate does not:

- rewrite business-module code,
- replace `system-patrol:maintain`,
- rewrite dialogue-module readers,
- mutate business data,
- send messages,
- execute external platform actions,
- perform non-source-only 3D behavior.

Business-module code migration, dialogue-reader source changes, non-source-only 3D behavior, and patrol protocol migration still require explicit user confirmation.
