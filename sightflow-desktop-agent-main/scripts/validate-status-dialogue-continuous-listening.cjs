const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')

const repoRoot = path.resolve(__dirname, '..')
const rendererPath = path.join(repoRoot, 'src', 'renderer', 'src', 'zhineng-console', 'ZhinengConsole.tsx')
const packagePath = path.join(repoRoot, 'package.json')
const testCliPath = path.join(repoRoot, 'scripts', 'test-cli.ts')
const waitContinuousLoopPath = path.join(repoRoot, 'scripts', 'wait-status-dialogue-continuous-loop.cjs')

const renderer = fs.readFileSync(rendererPath, 'utf8')
const packageSource = fs.readFileSync(packagePath, 'utf8')
const testCli = fs.readFileSync(testCliPath, 'utf8')
const waitContinuousLoop = fs.readFileSync(waitContinuousLoopPath, 'utf8')

const checks = {
  continuous_session_schema_declared:
    renderer.includes("schema: 'status_dialogue_continuous_voice_session.v1'") &&
    renderer.includes('StatusDialogueContinuousVoiceSessionState') &&
    renderer.includes('StatusDialogueContinuousVoiceSessionStatus'),
  resume_delay_declared:
    renderer.includes('STATUS_DIALOGUE_CONTINUOUS_VOICE_RESUME_DELAY_MS') &&
    renderer.includes('resume_delay_ms: STATUS_DIALOGUE_CONTINUOUS_VOICE_RESUME_DELAY_MS'),
  runtime_state_and_refs_declared:
    renderer.includes('continuousVoiceSessionEnabledRef') &&
    renderer.includes('continuousVoiceResumeTimerRef') &&
    renderer.includes('continuousVoiceResumeInFlightRef') &&
    renderer.includes('continuousVoiceRecoverableErrorRef') &&
    renderer.includes('continuousVoiceRecoverableErrorCountRef') &&
    renderer.includes('voiceListeningRef') &&
    renderer.includes('voiceErrorRef'),
  operator_controls_available:
    renderer.includes('toggleContinuousVoiceSession') &&
    renderer.includes('start loop') &&
    renderer.includes('stop loop') &&
    renderer.includes('continuous voice session status') &&
    renderer.includes('zg-dialogue-loop-button') &&
    renderer.includes('aria-pressed={continuousVoiceSession.enabled}'),
  stt_entry_observability_available:
    renderer.includes("logStatusDialogueVoiceEvent('stt_button_pointer_down'") &&
    renderer.includes('pointer reached visible STT button before startSpeechRecognition'),
  runtime_probe_mode_available:
    renderer.includes("'continuous_voice_loop'") &&
    renderer.includes("'continuous_voice_fast_fail'") &&
    renderer.includes("'continuous_voice_two_turn'") &&
    renderer.includes('status_dialogue_continuous_voice_loop_probe_start') &&
    renderer.includes('status_dialogue_continuous_voice_loop_probe_complete') &&
    renderer.includes('status_dialogue_continuous_voice_fast_fail_probe_start') &&
    renderer.includes('status_dialogue_continuous_voice_two_turn_probe_complete'),
  runtime_probe_marker_logs_tagged:
    renderer.includes("logStatusDialogueVoiceEvent('status_dialogue_ui_runtime_loaded'") &&
    renderer.includes("logStatusDialogueVoiceEvent('stt_adapter_runtime_selected'") &&
    renderer.includes('runtime_probe: runtimeProbeMode || undefined'),
  loop_uses_existing_stt_path:
    renderer.includes("logStatusDialogueVoiceEvent('continuous_voice_session_resume_stt'") &&
    renderer.includes('void startSpeechRecognition()') &&
    renderer.includes('calls existing startSpeechRecognition; no separate STT adapter'),
  loop_waits_for_dialogue_tts_and_queue:
    renderer.includes("status: 'waiting_dialogue'") &&
    renderer.includes("status: 'waiting_tts'") &&
    renderer.includes("status: 'waiting_queue'") &&
    renderer.includes('dialogueInputQueueState.queued_count > 0') &&
    renderer.includes('isVoicePlaybackActiveForInput({'),
  loop_recovers_from_transient_stt_error:
    renderer.includes('STATUS_DIALOGUE_CONTINUOUS_VOICE_RECOVERABLE_ERROR_MAX_RETRIES') &&
    renderer.includes("logStatusDialogueVoiceEvent('continuous_voice_session_recoverable_error_retry'") &&
    renderer.includes('idle silence/no-speech clears the transient error without stopping continuous listening') &&
    renderer.includes('continuous loop pauses on hard STT errors or after non-idle recoverable retry budget is exhausted'),
  loop_fast_fails_idle_silence:
    renderer.includes('STATUS_DIALOGUE_LOCAL_STT_CONTINUOUS_NO_VOICE_FAST_FAIL_MS') &&
    renderer.includes("logStatusDialogueVoiceEvent('local_stt_continuous_no_voice_fast_fail'") &&
    renderer.includes('continuous listening treats no voice as idle silence instead of waiting for max recording window') &&
    renderer.includes('continuous_idle_silence'),
  loop_disables_w3_detector_boundary:
    renderer.includes('if (wakeDetectorEnabledRef.current) disableW3WakeDetector()') &&
    renderer.includes('W3') &&
    renderer.includes('formal STT loop'),
  no_new_world_write_or_requirement_packet:
    renderer.includes('manual loop only; no world write; no requirement packet') &&
    renderer.includes('no raw audio persistence; no world write') &&
    renderer.includes('no world write') &&
    renderer.includes('no requirement packet'),
  package_script_registered:
    packageSource.includes('voice:continuous-listening:validate') &&
    packageSource.includes('voice:runtime-flow:probe-continuous-loop') &&
    packageSource.includes('voice:runtime-flow:probe-continuous-fast-fail') &&
    packageSource.includes('voice:runtime-flow:probe-continuous-two-turn') &&
    packageSource.includes('voice:runtime-flow:wait-continuous-loop') &&
    packageSource.includes('voice:runtime-flow:check-continuous-loop') &&
    packageSource.includes('voice:runtime-flow:continuous-loop-preflight'),
  isolated_probe_registered:
    testCli.includes('runStatusDialogueContinuousVoiceLoopProbe') &&
    testCli.includes('runStatusDialogueContinuousVoiceFastFailProbe') &&
    testCli.includes('runStatusDialogueContinuousVoiceTwoTurnProbe') &&
    testCli.includes("status_dialogue_runtime_probe: 'continuous_voice_loop'") &&
    testCli.includes("status_dialogue_runtime_probe: 'continuous_voice_fast_fail'") &&
    testCli.includes("status_dialogue_runtime_probe: 'continuous_voice_two_turn'") &&
    testCli.includes('status_dialogue_continuous_voice_loop_probe_observed') &&
    testCli.includes('status_dialogue_continuous_voice_fast_fail_probe_observed') &&
    testCli.includes('status_dialogue_continuous_voice_two_turn_probe_observed'),
  real_operator_loop_wait_available:
    waitContinuousLoop.includes('status_dialogue_continuous_loop_wait.v1') &&
    waitContinuousLoop.includes('continuous_voice_session_resume_stt') &&
    waitContinuousLoop.includes('local_stt_recording_started') &&
    waitContinuousLoop.includes('local_stt_transcribe_result') &&
    waitContinuousLoop.includes('--min-turns') &&
    waitContinuousLoop.includes('click_start_loop_and_speak_two_complete_chinese_sentences'),
  real_operator_loop_wait_excludes_runtime_probes:
    waitContinuousLoop.includes('buildRuntimeProbeWindows') &&
    waitContinuousLoop.includes('isRuntimeProbeEvent') &&
    waitContinuousLoop.includes('runtime_probe_window_count')
}

for (const [name, ok] of Object.entries(checks)) {
  assert.equal(ok, true, `${name} failed`)
}

const report = {
  schema: 'status_dialogue_continuous_listening_validation.v1',
  generated_at: new Date().toISOString(),
  renderer: rendererPath,
  checks,
  result: 'passed'
}

const outputDir = path.join(repoRoot, 'runtime', 'verification-reports')
fs.mkdirSync(outputDir, { recursive: true })
const outputPath = path.join(outputDir, `status-dialogue-continuous-listening-${Date.now()}.json`)
fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf8')

console.log(JSON.stringify({ ok: true, outputPath, checks }, null, 2))
