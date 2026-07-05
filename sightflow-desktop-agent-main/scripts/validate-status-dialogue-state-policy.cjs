const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const rendererPath = path.join(root, 'src', 'renderer', 'src', 'zhineng-console', 'ZhinengConsole.tsx')
const rendererCssPath = path.join(root, 'src', 'renderer', 'src', 'zhineng-console', 'zhineng-console.css')
const contractsPath = path.join(root, 'src', 'core', 'status-dialogue', 'contracts.ts')
const mainPath = path.join(root, 'src', 'main', 'index.ts')
const pipelinePath = path.join(root, 'src', 'core', 'status-dialogue', 'voice-output-pipeline.ts')
const xiaozhiPath = path.join(root, 'src', 'core', 'status-dialogue', 'xiaozhi-voice-bridge.ts')
const dialoguePolicyPath = path.join(root, 'src', 'core', 'status-dialogue', 'dialogue-policy.ts')

function read(file) {
  return fs.readFileSync(file, 'utf8')
}

const renderer = read(rendererPath)
const rendererCss = read(rendererCssPath)
const contracts = read(contractsPath)
const main = read(mainPath)
const pipeline = read(pipelinePath)
const xiaozhi = read(xiaozhiPath)
const dialoguePolicy = read(dialoguePolicyPath)

const shortFinalFunction = renderer.slice(
  renderer.indexOf('function buildStatusDialogueShortFinalVoice'),
  renderer.indexOf('function stripAlreadySpokenVoicePrefix')
)

const checks = {
  context_contract_has_voice_bridge_state:
    contracts.includes('voiceBridgeState?:') &&
    contracts.includes('listen_active: boolean') &&
    contracts.includes('speaking_active: boolean'),
  renderer_context_accepts_voice_bridge_state:
    renderer.includes('voiceBridgeState?: XiaozhiStyleVoiceBridgeState') &&
    renderer.includes('voiceBridgeState: voiceBridgeState'),
  prompt_includes_xiaozhi_state:
    renderer.includes('xiaozhi_style_voice_bridge_state: context.voiceBridgeState') &&
    renderer.includes('use the voice bridge stage and emotion'),
  system_prompt_defines_xiaozhi_boundary:
    renderer.includes('Xiaozhi-style bridge: use xiaozhi_style_voice_bridge_state.v1'),
  submit_passes_current_bridge_state:
    renderer.includes('voiceBridgeState: xiaozhiBridgeState'),
  request_model_accepts_bridge_state:
    renderer.includes('voiceBridgeState,') &&
    renderer.includes('voiceBridgeState?: XiaozhiStyleVoiceBridgeState'),
  runtime_voice_diagnostic_contract_available:
    contracts.includes('StatusDialogueRuntimeVoiceDiagnostic') &&
    contracts.includes('status_dialogue_runtime_voice_diagnostic.v1') &&
    contracts.includes('runtimeVoiceDiagnostic?: StatusDialogueRuntimeVoiceDiagnostic') &&
    contracts.includes('entry_snapshot?:') &&
    contracts.includes('stt_button_center?:'),
  runtime_voice_diagnostic_ipc_available:
    main.includes('zhineng:status-dialogue:runtime-voice-diagnostic:get') &&
    main.includes('readLatestStatusDialogueRuntimeVoiceDiagnostic') &&
    main.includes('status-dialogue-real-voice-retest-suite-') &&
    main.includes('status-dialogue-real-stt-entry-diagnosis-') &&
    main.includes('compactStatusDialogueEntrySnapshot'),
  runtime_voice_diagnostic_renderer_loaded:
    renderer.includes('requestStatusDialogueRuntimeVoiceDiagnostic') &&
    renderer.includes('runtimeVoiceDiagnosticState') &&
    renderer.includes('setRuntimeVoiceDiagnosticState'),
  runtime_voice_diagnostic_prompt_included:
    renderer.includes('runtime_voice_diagnostic: context.runtimeVoiceDiagnostic') &&
    renderer.includes('remote_config_missing: context.runtimeVoiceDiagnostic.summary.remote_config_missing') &&
    renderer.includes('entry_snapshot: context.runtimeVoiceDiagnostic.summary.entry_snapshot'),
  runtime_voice_diagnostic_local_fallback_included:
    renderer.includes('voice_retest: ${runtimeVoiceDiagnostic.result}') &&
    renderer.includes('right_bottom_gui_pointer_entry') &&
    renderer.includes('right_bottom_gui_stt_button_click') &&
    renderer.includes('voice_entry_button_center') &&
    renderer.includes('status_dialogue_runtime_voice_diagnostic.v1'),
  runtime_voice_diagnostic_ui_visible:
    renderer.includes('voice diagnostic') &&
    renderer.includes('voice diag <strong>{runtimeVoiceDiagnosticLabel}</strong>') &&
    renderer.includes('target <strong>{runtimeVoiceDiagnosticButtonCenterLabel}</strong>') &&
    renderer.includes('hit <strong>{runtimeVoiceDiagnosticButtonHitLabel}</strong>'),
  patrol_dialogue_read_index_contract_available:
    contracts.includes('SYSTEM_PATROL_DIALOGUE_READ_INDEX_SCHEMA') &&
    contracts.includes('SystemPatrolDialogueIndexSummary') &&
    contracts.includes('normalizeSystemPatrolDialogueReadIndex') &&
    contracts.includes('summarizeSystemPatrolDialogueReadIndex') &&
    contracts.includes('systemPatrolIndexSummary?: SystemPatrolDialogueIndexSummary'),
  patrol_dialogue_read_index_ipc_available:
    main.includes('zhineng:status-dialogue:patrol-index:get') &&
    main.includes('readStatusPatrolDialogueIndex') &&
    main.includes('resolveStatusPatrolDialogueIndexPath') &&
    main.includes('DEFAULT_SYSTEM_PATROL_DIALOGUE_READ_INDEX_PATH'),
  patrol_dialogue_read_index_renderer_loaded:
    renderer.includes('requestStatusPatrolDialogueIndex') &&
    renderer.includes('statusPatrolIndexState') &&
    renderer.includes('setStatusPatrolIndexState') &&
    renderer.includes('systemPatrolIndexSummary: nextPatrolIndexState.summary'),
  patrol_dialogue_read_index_prompt_included:
    renderer.includes('system_patrol_index_summary: context.systemPatrolIndexSummary') &&
    renderer.includes('modules_by_source_hash_status: context.systemPatrolIndexSummary.modules_by_source_hash_status') &&
    renderer.includes('buildPatrolFindingInsertFromSystemPatrolIndexSummary') &&
    dialoguePolicy.includes("| 'system_patrol_index'"),
  patrol_dialogue_read_index_ui_visible:
    renderer.includes('patrol index <strong>{patrolIndexSummary.gate_decision}</strong>') &&
    renderer.includes('refresh patrol index') &&
    renderer.includes('patrolIndexSourceHashBlocked'),
  dynamic_voice_opening_uses_status_counts:
    pipeline.includes('missingStatusCount > 0') &&
    pipeline.includes('staleStatusCount > 0') &&
    pipeline.includes('conflictCount > 0') &&
    pipeline.includes('readErrorCount > 0'),
  local_state_lines_drive_fallback_reply:
    renderer.includes('function buildStatusDialogueStateLines') &&
    renderer.includes('stateLines.conclusion') &&
    renderer.includes('stateLines.evidence') &&
    renderer.includes('stateLines.attention') &&
    renderer.includes('state_conclusion: ${stateLines.conclusion}'),
  model_prompt_uses_state_specific_opening:
    renderer.includes('const stateVoiceLines = snapshot') &&
    renderer.includes('state_evidence: stateVoiceLines') &&
    renderer.includes('Do not replace concrete counts with a generic status-gap sentence.'),
  short_final_voice_no_missing_status_template_override:
    !shortFinalFunction.includes('if (output.missingStatus?.length)'),
  xiaozhi_state_machine_available:
    xiaozhi.includes('reduceXiaozhiStyleVoiceBridgeEvent') &&
    xiaozhi.includes('buildXiaozhiStyleDialoguePolicyMapping') &&
    xiaozhi.includes('XIAOZHI_STYLE_DIALOGUE_POLICY_STAGE_ORDER'),
  dialogue_turn_intent_gate_available:
    dialoguePolicy.includes('DIALOGUE_TURN_INTENT_SCHEMA') &&
    dialoguePolicy.includes('deriveDialogueTurnIntent') &&
    dialoguePolicy.includes('ambient_or_unclear') &&
    dialoguePolicy.includes('capability_question') &&
    dialoguePolicy.includes('turn_intent: turnIntent'),
  renderer_prompt_includes_turn_intent:
    renderer.includes('dialogue_turn_intent: policyDecision.turn_intent') &&
    renderer.includes('First answer the user') &&
    renderer.includes('ambient_or_unclear'),
  renderer_fallback_applies_turn_intent:
    renderer.includes('applyDialogueTurnIntentToOutput') &&
    renderer.includes('patrolSkippedForTurn') &&
    renderer.includes('patrol_skipped: ${patrolSkippedForTurn}'),
  renderer_execution_status_bar_visible:
    renderer.includes('StatusDialogueExecutionState') &&
    renderer.includes('STATUS_DIALOGUE_EXECUTION_STEPS') &&
    renderer.includes('zg-dialogue-execution-bar') &&
    renderer.includes('zg-execution-step-row') &&
    renderer.includes('dialogueExecutionState.action') &&
    rendererCss.includes('.zg-dialogue-execution-bar') &&
    rendererCss.includes('.zg-execution-step-row'),
  renderer_delayed_ack_policy_available:
    renderer.includes('STATUS_DIALOGUE_VOICE_ACK_DELAY_MS = 1500') &&
    renderer.includes('scheduleDelayedVoiceAck') &&
    renderer.includes("logStatusDialogueVoiceEvent('status_dialogue_visual_ack_shown'") &&
    renderer.includes("logStatusDialogueVoiceEvent('status_dialogue_delayed_voice_ack_fired'") &&
    renderer.includes("clearDelayedVoiceAckTimer('model_stream_sentence_ready'") &&
    renderer.includes("clearDelayedVoiceAckTimer('model_result_received'") &&
    !renderer.includes('void speakVoiceAck(ackText') &&
    !renderer.includes('void speakVoiceAck(inputKind')
}

const ok = Object.values(checks).every(Boolean)
const outputDir = path.join(root, 'runtime', 'verification-reports')
fs.mkdirSync(outputDir, { recursive: true })
const outputPath = path.join(outputDir, `status-dialogue-state-policy-${Date.now()}.json`)
fs.writeFileSync(
  outputPath,
  JSON.stringify(
    {
      schema: 'status_dialogue_state_policy_validation.v1',
      generated_at: new Date().toISOString(),
      renderer: rendererPath,
      rendererCss: rendererCssPath,
      contracts: contractsPath,
      main: mainPath,
      pipeline: pipelinePath,
      xiaozhi: xiaozhiPath,
      dialoguePolicy: dialoguePolicyPath,
      checks,
      result: ok ? 'passed' : 'failed'
    },
    null,
    2
  )
)

console.log(JSON.stringify({ ok, outputPath, checks }, null, 2))
process.exit(ok ? 0 : 1)
