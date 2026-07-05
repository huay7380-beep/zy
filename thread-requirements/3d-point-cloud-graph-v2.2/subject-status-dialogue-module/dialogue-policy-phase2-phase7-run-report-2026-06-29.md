# Dialogue Policy Phase 2-7 Run Report

Date: 2026-06-29
Owner: `status-dialogue-system`
Scope: execute and verify Phase 2 through Phase 7 after Phase 0/1 policy freeze.

## Summary

Phase 2-7 have been implemented and verified at code, build, boundary and preview-service levels.

- No new parallel dialogue system was created.
- New contracts and conversion logic are under `src/core/status-dialogue`.
- New 3D nodes are child particles under `status-dialogue-system`.
- Requirement forwarding remains disabled by default.
- No real `requirement_packet.v1` was created.
- No world-model fact write was added.

## Phase 2: Code Contract Added

Implemented file:

- `D:\zhineng\sightflow-desktop-agent-main\src\core\status-dialogue\dialogue-policy.ts`

Added:

- `DIALOGUE_POLICY_DECISION_SCHEMA = "dialogue_policy_decision.v1"`
- `PATROL_FINDING_INSERT_SCHEMA = "patrol_finding_insert.v1"`
- `DialoguePolicyDecision`
- `DialoguePolicyDecisionInput`
- `DialoguePolicyIntentLane`
- `DialoguePolicyResponsePlan`
- `PatrolFindingInsert`
- `PatrolFindingTtsPolicy`

Export paths updated:

- `src/core/status-dialogue/index.ts`
- `src/core/status-dialogue-contracts.ts`

## Phase 3: `patrol_finding_insert` Conversion Logic

Implemented:

- `buildPatrolFindingInsertFromStatusCard`
- `buildPatrolFindingInsertFromFocus`
- `buildPatrolFindingInsertsFromSnapshot`
- `selectTopPatrolFindingInserts`
- `summarizePatrolFindingInsertsForPrompt`

Supported sources:

- `status_snapshot.v1`
- `module_status_card.v1`
- focused nebula context
- missing modules
- stale modules
- conflict modules
- read errors
- compact snapshot patrol findings

Boundary: `patrol_finding_insert.v1` is a derived patrol/dialogue layer. It does not replace status cards, snapshots or module events.

## Phase 4: Prompt, Guard And Fallback Synced

Updated:

- `src/core/status-dialogue/contracts.ts`
- `src/renderer/src/zhineng-console/ZhinengConsole.tsx`

Changes:

- `STATUS_DIALOGUE_SYSTEM_PROMPT` now references `dialogue-policy.v1`.
- Model JSON output now includes `intent_lane`, `response_plan`, `patrol_insertions`, `attention_log`, `status_refs`, `missing_status`, `boundary_notes`, `tts_playback_intent`.
- `voice` remains first for streaming TTS.
- `guardStatusDialogueOutput` now injects:
  - `policy: conclusion_evidence_attention_next`
  - `tts: voiceText only`
  - `missing_status: do not guess`
- `parseStatusDialogueModelOutput` now accepts `attention_log`, `statusRefs`, and `missingStatus`.
- Local fallback now builds `DialoguePolicyDecision` and `patrolInsertions`.

## Phase 5: Xiaozhi-Style State Machine Mapped

Updated:

- `src/core/status-dialogue/xiaozhi-voice-bridge.ts`

Added:

- `XIAOZHI_STYLE_DIALOGUE_POLICY_STAGE_ORDER`
- `XIAOZHI_STYLE_DIALOGUE_POLICY_BOUNDARY`
- `buildXiaozhiStyleDialoguePolicyMapping`

Boundary:

- Route A remains a desktop virtual device bridge.
- Manual STT remains available.
- Wake window does not equal full continuous listening.
- TTS playback pauses wake detector only.
- Formal STT and manual input are not closed by TTS playback.
- ESP32 firmware, OTA and hardware binding are not connected.

## Phase 6: 3D Nebula Policy Nodes Added

Updated:

- `src/renderer/src/zhineng-console/ZhinengConsole.tsx`

Added under `status-dialogue-system`:

- `policy.identity_rules`
- `policy.intent_router`
- `policy.patrol_insertion`
- `policy.response_composer`
- `policy.emotion_style`
- `policy.tts_opening`
- `policy.fallback_guard`
- `policy.xiaozhi_state_machine`
- `policy.boundary_gate`
- `policy.io_contract`

Each child particle includes input, output, refs, owner, gate, compass and implementation status.

## Phase 7: Verification

Static contract search:

```powershell
rg -n "DialoguePolicyDecision|patrol_finding_insert|buildPatrolFindingInsertsFromSnapshot|buildDialoguePolicyDecision|deriveDialoguePolicyIntentLane" "D:\zhineng\sightflow-desktop-agent-main\src\core\status-dialogue"
```

Result: found the new contract and conversion logic in `dialogue-policy.ts`.

Renderer / 3D mapping search:

```powershell
rg -n "dialogue_policy|patrol_insertions|policy\.identity_rules|policy\.intent_router|policy\.patrol_insertion|policy\.response_composer|policy\.xiaozhi_state_machine|policy\.io_contract" "D:\zhineng\sightflow-desktop-agent-main\src\renderer\src\zhineng-console\ZhinengConsole.tsx"
```

Result: found prompt payload fields and required policy child particle labels.

Xiaozhi mapping search:

```powershell
rg -n "buildXiaozhiStyleDialoguePolicyMapping|XIAOZHI_STYLE_DIALOGUE_POLICY_STAGE_ORDER|tts_playback_pauses_wake_detector_only" "D:\zhineng\sightflow-desktop-agent-main\src\core\status-dialogue\xiaozhi-voice-bridge.ts"
```

Result: found state order, boundary and mapping function.

Boundary search:

```powershell
rg -n "requirement_packet\.v1|world_model_requirement_inbox|no_world_model_write|no_external_action" "D:\zhineng\sightflow-desktop-agent-main\src"
```

Result:

- `world_model_requirement_inbox` remains a config target.
- Existing `no_world_model_write` and `no_external_action` boundaries remain present.
- No executable `requirement_packet.v1` creation path was added in this phase.

Typecheck:

```powershell
npm.cmd run typecheck
```

Result: passed. npm emitted existing `Unknown env config "store-dir"` warnings.

Build:

```powershell
npm.cmd run build
```

Result: passed. Vite emitted an existing dynamic/static import chunking warning for `vision-utils.ts`.

Preview service:

```powershell
Invoke-WebRequest -Uri "http://[::1]:5173/?window=zhineng-graph" -UseBasicParsing -TimeoutSec 5
```

Result: HTTP `200`.

Browser preview check:

- URL: `http://[::1]:5173/?window=zhineng-graph`
- Title: `人类社交辅助系统v.0.1.0`
- Body text length: `1494`
- Canvas count: `1`
- Default visible focus: `世界系统核心`

Renderer bundle check:

```powershell
rg -n "policy\.identity_rules|policy\.intent_router|policy\.patrol_insertion|policy\.response_composer|policy\.emotion_style|policy\.tts_opening|policy\.fallback_guard|policy\.xiaozhi_state_machine|policy\.boundary_gate|policy\.io_contract" "D:\zhineng\sightflow-desktop-agent-main\out\renderer"
```

Result: all 10 policy child particles were found in the built renderer bundle.

Note: the preview opens at world-core by default, so the policy children are not visible in the default DOM text until `status-dialogue-system` is selected. Source and production bundle both prove the policy child particles are present in the 3D nebula data.

## Files Changed

Code:

- `D:\zhineng\sightflow-desktop-agent-main\src\core\status-dialogue\dialogue-policy.ts`
- `D:\zhineng\sightflow-desktop-agent-main\src\core\status-dialogue\contracts.ts`
- `D:\zhineng\sightflow-desktop-agent-main\src\core\status-dialogue\xiaozhi-voice-bridge.ts`
- `D:\zhineng\sightflow-desktop-agent-main\src\core\status-dialogue\index.ts`
- `D:\zhineng\sightflow-desktop-agent-main\src\core\status-dialogue-contracts.ts`
- `D:\zhineng\sightflow-desktop-agent-main\src\renderer\src\zhineng-console\ZhinengConsole.tsx`

Documentation:

- `D:\zhineng\thread-requirements\3d-point-cloud-graph-v2.2\subject-status-dialogue-module\dialogue-policy-phase2-phase7-run-report-2026-06-29.md`

## Final Status

- Phase 2: complete.
- Phase 3: complete.
- Phase 4: complete.
- Phase 5: complete.
- Phase 6: complete.
- Phase 7: complete, with the visual note above.
