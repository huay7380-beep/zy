# Current Structure Comparison

Status: updated after Phase 1 validation.

## Summary

The current system already contains most of the technical ingredients needed for global patrol, but they are not yet connected by a required module-onboarding rule.

The proposed `dialogue-system-patrol/` directory should add that missing rule with minimal impact.

## Current Structure

| Current Part | Current Role | Strength | Gap |
| --- | --- | --- | --- |
| `examples/system-process-tree.json` | Source of process nodes, artifact registry, issue register. | Strong canonical registration point. | Does not require every module to publish dialogue-readable status. |
| `npm.cmd run process-tree:validate` | Validates process-tree and Obsidian sync. | Recent validation passed with no required or warning failures. | Does not validate status card or status event availability. |
| `capability-upgrade-registry/` | Read-only capability patrol and replacement analysis. | Good for decomposing modules and finding optimization candidates. | Optimizes and ranks modules, but is not a live dialogue-status publication layer. |
| `runtime/capability-upgrade-patrols/latest.json` | Latest capability patrol report. | Useful for priority queue and analogical search tasks. | Not directly consumed as per-module status cards/events by dialogue module. |
| `sightflow-desktop-agent-main/src/core/status-dialogue/contracts.ts` | Defines `module_status_card.v1` and `status_snapshot.v1`. | Dialogue module already has status-card shape. | Status card producer is missing at root level. |
| `sightflow-desktop-agent-main/src/core/status-dialogue/status-events.ts` | Defines `module_status_event.v1` and event broadcast route. | Dialogue module already has event shape and voice routing. | Status event producer and mandatory publisher list are missing at root level. |
| `runtime/status-cards/` | Intended status-card directory. | Read path is already supported by dialogue main process. | Directory currently absent. |
| `runtime/status-events/` | Intended status-event directory. | Read path is already supported by dialogue main process. | Directory currently absent. |
| `thread-requirements/3d-point-cloud-graph-v2.2/` | Requirement and scheme history for status dialogue and 3D particle OS. | Contains the global status scan and status event concepts. | It is requirement history, not an enforced runtime contract. |

## Proposed New Role

`dialogue-system-patrol/` should become the module-status publication control area.

It should not replace current sources. It should connect them:

```text
process tree registration
  + module patrol block
  + runtime evidence
  -> status card and event publication
  -> dialogue module readable snapshot
```

## What Changes Minimally

First confirmed implementation should be narrow:

| Area | Minimal Change |
| --- | --- |
| Existing code | No runtime behavior changes in Phase 1. |
| Existing docs | Add references only after user confirms the design. |
| Process tree | Add the patrol module only after docs are accepted. |
| Dialogue module | No change initially, because it already reads status cards and events. |
| Runtime | Create `runtime/status-cards` and `runtime/status-events` only when publisher phase is confirmed. |
| Capability registry | Keep as optimization and replacement analysis, not live status publication. |

## What The New Layer Adds

| Proposed Capability | Why It Matters |
| --- | --- |
| Required patrol block per visible module | Prevents hidden modules and undocumented status drift. |
| Global patrol registry | Gives dialogue module a stable list of expected publishers. |
| Status card publisher | Converts module patrol blocks into current-state snapshots. |
| Status event publisher | Converts lifecycle and build changes into time-ordered events. |
| Validator | Proves that every visible module has required status outputs. |
| Freshness gate | Prevents stale status from being reported as current. |
| Construction timeline | Lets dialogue explain a module while it is being built. |

## Current Strengths To Preserve

- Keep `examples/system-process-tree.json` as the system registration source of truth.
- Keep `capability-upgrade-registry/` read-only and focused on optimization/replacement discovery.
- Keep the 3D particle OS as a source-only projection target.
- Keep status dialogue read-only by default.
- Keep real external actions blocked unless separately confirmed.
- Keep Windows validation commands using `npm.cmd` when PowerShell blocks `npm.ps1`.

## Current Weaknesses The Proposal Addresses

| Weakness | Proposed Fix |
| --- | --- |
| Dialogue module has status read contracts but no guaranteed publishers. | Require every visible module to publish patrol block, status card, and event outlet. |
| Capability patrol is useful but not live enough for current dialogue. | Use capability patrol as optional evidence, not primary status source. |
| Runtime evidence is scattered across many folders. | Each patrol block points to current evidence refs. |
| New modules can be added without dialogue visibility. | Add patrol validation as a new module-onboarding gate. |
| Build progress is hard to explain precisely. | Emit lifecycle events with timestamps, completion, evidence, and supersession. |

## Main Design Risk

The biggest risk is overbuilding the patrol layer into another large subsystem.

The safe direction is:

1. define contracts,
2. validate presence and freshness,
3. publish summaries,
4. only later add richer automation.

Do not start by rewriting the dialogue module, process-tree validator, 3D OS, or capability patrol.
