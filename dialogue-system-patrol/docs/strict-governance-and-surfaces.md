# Strict Governance And Read Surfaces

Status: strict required coverage, source drift detection, scaffold entry, and patrol-maintainer workflow introduced on 2026-07-01.

This document records the next-stage patrol behavior after the user confirmed all follow-up directions.

## What Changed

The patrol layer now has seven active next-stage controls:

| Control | Command or file | Purpose |
| --- | --- | --- |
| Strict coverage | `system-patrol-registry.json` | Missing required patrol blocks, cards, events, or validation evidence now block current-state claims. |
| Source drift detection | `npm.cmd run system-patrol:source-drift -- --module-id=<module_id>` | Computes source_hash from each patrol block's `evidence.source_refs` and blocks stale patrol baselines. |
| Patrol maintainer | `npm.cmd run system-patrol:maintain -- --module-id=<module_id>` | Runs source drift check, validation, publication, process-tree sync, module gate, dialogue index, and projection workflow. |
| Unified enforcement | `npm.cmd run system-patrol:enforce` | Runs the all-module maintainer gate for CI and local hook use. |
| Module scaffold | `npm.cmd run system-patrol:scaffold -- --module-id=<module_id> --verify` | Creates patrol registry/block coverage for a process-tree module and can immediately verify it. |
| Build timeline | `runtime/module-build-timelines/<module_id>.jsonl` | Gives every module an append-only construction-time feedback channel. |
| Dialogue read index | `runtime/dialogue-system-patrol/dialogue-read-index.json` | Gives the dialogue module and operators one summary-only index of readable patrol status and latest construction phase. |
| 3D source-only projection | `dialogue-system-patrol/os-particle-projection.json` | Exposes patrol state to the 3D particle OS as display/status reference only. |

## Strict Mode

The registry is now expected to remain:

```text
mode: strict_required_coverage
strict_missing_blocks: true
```

Strict mode means:

- every process-tree visible module needs a patrol registry entry,
- every required registry entry needs a readable patrol block,
- every required module needs a status card and status event,
- every required module needs an append-only build timeline,
- every required patrol block needs a current `versioning.source_hash`,
- latest system-patrol validation must pass,
- latest source drift check must pass,
- latest process-tree validation must pass after registration or Obsidian changes,
- latest module onboarding gate must pass before the dialogue module treats the module as current.

Strict mode does not prove business behavior correctness. It proves patrol visibility, freshness, and evidence wiring.

## Patrol Maintainer Workflow

For one module:

```text
npm.cmd run system-patrol:maintain -- --module-id=<module_id>
```

For all modules:

```text
npm.cmd run system-patrol:maintain -- --all
```

The workflow runs:

```text
source_hash/source drift check
system-patrol validation
system-patrol publication
system-patrol validation after publication
process-tree validation
build timeline event record
module onboarding gate
dialogue read index and 3D source-only projection publication
```

It writes:

```text
runtime/dialogue-system-patrol-maintenance/latest.json
runtime/dialogue-system-patrol-maintenance/latest.md
runtime/dialogue-system-patrol-maintenance/<maintenance_id>/patrol-maintainer-report.json
runtime/dialogue-system-patrol-maintenance/<maintenance_id>/patrol-maintainer-report.md
runtime/module-build-timelines/<module_id>.jsonl
```

## Source Drift Loop

Each patrol block stores:

```text
versioning.source_hash
versioning.source_hash_algorithm
versioning.source_hash_generated_at
versioning.source_hash_refs
versioning.source_hash_excluded_refs
```

The hash is computed from non-runtime `evidence.source_refs`. Runtime summaries and generated projection files are excluded so validation does not fail just because the patrol publisher refreshed output.

For a reviewed source or patrol change, refresh the baseline with:

```text
npm.cmd run system-patrol:source-drift -- --update --module-id=<module_id>
```

Then run:

```text
npm.cmd run system-patrol:maintain -- --module-id=<module_id>
```

If source files change but the patrol block is not refreshed, `source_hash_invalid` or `source_hash_drift` blocks current-state claims and is visible through status cards/events and the dialogue read index.

## Dialogue Read Surface

The read index writes:

```text
runtime/dialogue-system-patrol/dialogue-read-index.json
runtime/dialogue-system-patrol/dialogue-read-index.md
```

It does not replace `runtime/status-cards/**` or `runtime/status-events/**`. Those remain the primary contracts already understood by the dialogue module.

The index exists so the dialogue module and operators can read:

- strict mode state,
- latest validation refs,
- latest module gate refs,
- latest source drift refs,
- status card and event paths per module,
- build timeline path and latest construction phase per module,
- source_hash status per module,
- module gate decisions per module,
- summary-only dialogue boundaries.

## 3D Projection Surface

The patrol 3D projection writes:

```text
dialogue-system-patrol/os-particle-projection.json
```

The 3D OS region map references it from:

```text
3d-particle-display-os/original-system-region-map.json
```

This is source-only projection. It must not:

- connect IPC,
- write to the world model,
- mutate business data,
- execute tools,
- send messages,
- become the source of patrol truth.

The source of truth remains:

```text
examples/system-process-tree.json
dialogue-system-patrol/registry/system-patrol-registry.json
dialogue-system-patrol/blocks/**
runtime/dialogue-system-patrol-validations/latest.json
runtime/dialogue-system-patrol-source-drift/latest.json
```

## Future Module Rule

Every visible module construction, modification, migration, replacement, or refactor should finish with:

```text
npm.cmd run system-patrol:timeline -- --module-id=<module_id> --phase=implementation_changed --status=in_progress --summary=<summary>
npm.cmd run system-patrol:source-drift -- --update --module-id=<module_id>
npm.cmd run system-patrol:maintain -- --module-id=<module_id>
```

Use the global version when the change touches shared patrol contracts, process-tree sync, or multiple modules:

```text
npm.cmd run system-patrol:maintain -- --all
```

If this command fails, the module must not be reported as current to the dialogue module.

For a new module, first register the process-tree node, then scaffold patrol coverage:

```text
npm.cmd run system-patrol:scaffold -- --module-id=<module_id> --verify
```

For CI or local hook enforcement, use:

```text
npm.cmd run system-patrol:enforce
```
