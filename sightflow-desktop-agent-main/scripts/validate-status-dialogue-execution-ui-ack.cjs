const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const rendererPath = path.join(root, 'src', 'renderer', 'src', 'zhineng-console', 'ZhinengConsole.tsx')
const cssPath = path.join(root, 'src', 'renderer', 'src', 'zhineng-console', 'zhineng-console.css')
const packagePath = path.join(root, 'package.json')

function read(file) {
  return fs.readFileSync(file, 'utf8')
}

const renderer = read(rendererPath)
const css = read(cssPath)
const packageJson = read(packagePath)

const submitStart = renderer.indexOf('const submitDialogue = useCallback')
const submitEnd = renderer.indexOf('  useEffect(() => {\n    if (runtimeProbeMode !== \'tts_input_interrupt\')', submitStart)
const submitSlice = submitStart >= 0 && submitEnd > submitStart ? renderer.slice(submitStart, submitEnd) : ''

const localSttStart = renderer.indexOf('const startLocalSpeechTranscription = useCallback')
const localSttEnd = renderer.indexOf('const startChromeSpeechBridgeTranscription', localSttStart)
const localSttSlice = localSttStart >= 0 && localSttEnd > localSttStart ? renderer.slice(localSttStart, localSttEnd) : ''

const chromeSttStart = renderer.indexOf('const startChromeSpeechBridgeTranscription = useCallback')
const chromeSttEnd = renderer.indexOf('useEffect(() => {\n    if (runtimeProbeMode !== \'cloud_stt_fake_audio\')', chromeSttStart)
const chromeSttSlice = chromeSttStart >= 0 && chromeSttEnd > chromeSttStart ? renderer.slice(chromeSttStart, chromeSttEnd) : ''

const startSpeechStart = renderer.indexOf('const startSpeechRecognition = useCallback')
const startSpeechEnd = renderer.indexOf('  useEffect(() => {\n    if (runtimeProbeMode !== \'stt_click_during_tts\')', startSpeechStart)
const startSpeechSlice = startSpeechStart >= 0 && startSpeechEnd > startSpeechStart ? renderer.slice(startSpeechStart, startSpeechEnd) : ''

const requiredPhases = [
  'listening',
  'transcribing',
  'understanding',
  'patrolling',
  'generating',
  'speaking',
  'complete'
]

const checks = {
  execution_state_contract_defined:
    renderer.includes("schema: 'status_dialogue_execution_state.v1'") &&
    renderer.includes('type StatusDialogueExecutionPhase') &&
    renderer.includes('interface StatusDialogueExecutionState'),
  execution_steps_cover_required_phases:
    renderer.includes('STATUS_DIALOGUE_EXECUTION_STEPS') &&
    requiredPhases.every((phase) => renderer.includes(`phase: '${phase}'`)),
  execution_state_helper_avoids_array_at:
    renderer.includes('function buildStatusDialogueExecutionState') &&
    renderer.includes('STATUS_DIALOGUE_EXECUTION_STEPS[STATUS_DIALOGUE_EXECUTION_STEPS.length - 1]') &&
    !renderer.includes('STATUS_DIALOGUE_EXECUTION_STEPS.at(-1)'),
  visible_execution_status_bar_rendered:
    renderer.includes('zg-dialogue-execution-bar') &&
    renderer.includes('zg-dialogue-execution-status') &&
    renderer.includes('role="img"') &&
    renderer.includes('data-phase={dialogueExecutionState.phase}') &&
    renderer.includes('data-step={dialogueExecutionState.step_index}') &&
    renderer.includes('dialogueExecutionState.action') &&
    renderer.includes('zg-execution-glyph') &&
    renderer.includes('zg-execution-core') &&
    renderer.includes('zg-execution-orbit') &&
    renderer.includes('zg-execution-mark') &&
    renderer.includes('zg-execution-tail') &&
    renderer.includes('zg-execution-copy') &&
    renderer.includes('zg-execution-step-row') &&
    renderer.includes('STATUS_DIALOGUE_EXECUTION_STEPS.map'),
  execution_bar_not_old_player_ui:
    !renderer.includes('zg-execution-pulse') &&
    !renderer.includes('zg-execution-steps') &&
    !css.includes('.zg-execution-steps') &&
    !css.includes('.zg-execution-pulse'),
  css_execution_bar_and_morph_icon_available:
    css.includes('.zg-dialogue-execution-bar') &&
    css.includes('.zg-dialogue-execution-status') &&
    css.includes('.zg-execution-glyph') &&
    css.includes('.zg-execution-core') &&
    css.includes('.zg-execution-orbit') &&
    css.includes('.zg-execution-mark') &&
    css.includes('.zg-execution-tail') &&
    css.includes('.zg-execution-copy') &&
    css.includes('.zg-execution-step-row') &&
    requiredPhases.every((phase) => css.includes(`.zg-dialogue-execution-status.${phase}`)) &&
    requiredPhases.every((phase) => css.includes(`.zg-dialogue-execution-bar.${phase}`)) &&
    css.includes('@keyframes zg-execution-breathe') &&
    css.includes('@keyframes zg-execution-bars') &&
    css.includes('@keyframes zg-execution-radar') &&
    css.includes('@keyframes zg-execution-spark'),
  css_layout_rows_compact:
    css.includes('grid-template-rows: auto auto auto auto minmax(120px, 1fr) auto') &&
    css.includes('grid-template-rows: auto auto minmax(0, 360px) auto auto minmax(100px, 1fr) auto') &&
    css.includes('grid-template-columns: auto minmax(0, 1fr) minmax(0, 1fr) auto') &&
    css.includes('grid-template-columns: 32px minmax(0, 1fr)'),
  local_stt_updates_visible_state:
    localSttSlice.includes("updateDialogueExecutionState(\n        'listening'") &&
    localSttSlice.includes("updateDialogueExecutionState(\n            'transcribing'") &&
    localSttSlice.includes('updateDialogueExecutionState'),
  chrome_stt_updates_visible_state:
    chromeSttSlice.includes("updateDialogueExecutionState('listening', '正在听取麦克风，随后调用 Chrome STT Bridge'") &&
    chromeSttSlice.includes("updateDialogueExecutionState('transcribing', '正在调用 Chrome STT Bridge'"),
  start_speech_prepares_visible_state:
    startSpeechSlice.includes("updateDialogueExecutionState(\n      'listening'") &&
    startSpeechSlice.includes('正在准备 Cloudflare STT 录音') &&
    startSpeechSlice.includes('正在准备远端 STT 录音') &&
    startSpeechSlice.includes('正在准备本地 Whisper 录音'),
  dialogue_flow_updates_visible_state:
    submitSlice.includes("updateDialogueExecutionState(\n        'understanding'") &&
    submitSlice.includes("updateDialogueExecutionState('patrolling'") &&
    submitSlice.includes("updateDialogueExecutionState('generating'") &&
    submitSlice.includes("updateDialogueExecutionState('error'"),
  tts_flow_updates_visible_state:
    renderer.includes("'speaking',") &&
    renderer.includes("failedCount > 0 && completedCount === 0 ? 'error' : 'complete'") &&
    renderer.includes('回复播放完成'),
  visual_ack_default_and_delayed_speech_ack:
    renderer.includes('const STATUS_DIALOGUE_VOICE_ACK_DELAY_MS = 1500') &&
    renderer.includes('status_dialogue_visual_ack_shown') &&
    renderer.includes('status_dialogue_delayed_voice_ack_fired') &&
    renderer.includes('status_dialogue_delayed_voice_ack_cancelled') &&
    submitSlice.includes('scheduleDelayedVoiceAck(') &&
    !submitSlice.includes('void speakVoiceAck('),
  delayed_ack_cancelled_when_model_responds:
    submitSlice.includes("clearDelayedVoiceAckTimer('model_stream_sentence_ready'") &&
    submitSlice.includes("clearDelayedVoiceAckTimer('model_result_received'") &&
    submitSlice.includes("clearDelayedVoiceAckTimer('model_error'") &&
    submitSlice.includes("clearDelayedVoiceAckTimer('dialogue_turn_finished'"),
  package_script_registered:
    packageJson.includes('"voice:execution-ui-ack:validate"') &&
    packageJson.includes('validate-status-dialogue-execution-ui-ack.cjs')
}

const ok = Object.values(checks).every(Boolean)
const outputDir = path.join(root, 'runtime', 'verification-reports')
fs.mkdirSync(outputDir, { recursive: true })
const outputPath = path.join(outputDir, `status-dialogue-execution-ui-ack-${Date.now()}.json`)
fs.writeFileSync(
  outputPath,
  JSON.stringify(
    {
      schema: 'status_dialogue_execution_ui_ack_validation.v1',
      generated_at: new Date().toISOString(),
      renderer: rendererPath,
      css: cssPath,
      package: packagePath,
      checks,
      result: ok ? 'passed' : 'failed'
    },
    null,
    2
  )
)

console.log(JSON.stringify({ ok, outputPath, checks }, null, 2))
process.exit(ok ? 0 : 1)
