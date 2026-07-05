const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')

const repoRoot = path.resolve(__dirname, '..')
const rendererPath = path.join(repoRoot, 'src', 'renderer', 'src', 'zhineng-console', 'ZhinengConsole.tsx')
const bridgePath = path.join(repoRoot, 'src', 'core', 'status-dialogue', 'xiaozhi-voice-bridge.ts')
const waitPath = path.join(repoRoot, 'scripts', 'wait-status-dialogue-w3-wake.cjs')
const packagePath = path.join(repoRoot, 'package.json')

const renderer = fs.readFileSync(rendererPath, 'utf8')
const bridge = fs.readFileSync(bridgePath, 'utf8')
const waitScript = fs.readFileSync(waitPath, 'utf8')
const packageSource = fs.readFileSync(packagePath, 'utf8')

const checks = {
  wake_phrases_are_current:
    renderer.includes("phrases: ['小张', '高手', '小天才']") &&
    bridge.includes("phrases: ['小张', '高手', '小天才']") &&
    !renderer.includes('张博'),
  w3_config_enables_continuous_wake_word:
    renderer.includes("voice_input_mode: enabled ? 'wake_word' : 'manual_click'") &&
    renderer.includes('continuous_listen_enabled: enabled') &&
    renderer.includes('buildW3BrowserWakeConfig(true)'),
  w3_uses_browser_phrase_adapter:
    renderer.includes("adapter_id: enabled ? 'browser_phrase_match_reserved' : 'none'") &&
    renderer.includes('buildW3BrowserWakeDetectorConfig(true)'),
  detector_continuous_recognition_enabled:
    renderer.includes('recognition.continuous = true') &&
    renderer.includes('recognition.interimResults = true') &&
    renderer.includes('detectWakePhrase(transcriptText, loopWakeConfig.wake_word.phrases)'),
  tts_and_formal_stt_pause_detector_only:
    renderer.includes("setW3WakeStage('paused_tts')") &&
    renderer.includes('TTS playback active; wake detector paused only') &&
    renderer.includes("setW3WakeStage('paused_stt')") &&
    renderer.includes('formal STT active; wake detector paused without closing input'),
  wake_detection_opens_window_before_handoff:
    renderer.includes("setW3WakeStage('wake_window')") &&
    renderer.includes("logStatusDialogueVoiceEvent('w3_wake_detected'") &&
    renderer.includes("boundary: 'wake_window_only_then_existing_stt'") &&
    renderer.includes('wake_window_open: true') &&
    renderer.includes('dialogue_triggered: false'),
  wake_handoff_invokes_existing_stt:
    bridge.includes('dialogue_triggered: boolean') &&
    renderer.includes("setW3WakeStage('handoff_stt')") &&
    renderer.includes("logStatusDialogueVoiceEvent('w3_wake_handoff_stt'") &&
    renderer.includes('selected_stt_adapter: selectedSttAdapter') &&
    renderer.includes("boundary: 'detector_does_not_submit_dialogue_audio'") &&
    renderer.includes('dialogue_triggered: true') &&
    renderer.includes('void startSpeechRecognition()'),
  detector_restart_and_shutdown_boundaries:
    renderer.includes('stopWakeDetectorRecognition()') &&
    renderer.includes('wakeDetectorRestartTimerRef.current') &&
    renderer.includes('wakeWindowTimerRef.current') &&
    renderer.includes("setW3WakeStage('off')") &&
    renderer.includes('W3 detector is off; manual STT remains available'),
  no_raw_audio_persistence:
    renderer.includes('store_raw_audio: false') &&
    bridge.includes('no_raw_audio_persistence') &&
    !renderer.includes('save_raw_audio') &&
    !renderer.includes('writeFileSync(audio') &&
    !renderer.includes('audio_samples'),
  runtime_probe_mode_available:
    renderer.includes("'w3_wake_handoff'") &&
    renderer.includes('status_dialogue_w3_wake_handoff_probe_start') &&
    renderer.includes('status_dialogue_w3_wake_handoff_probe_complete'),
  runtime_probe_is_non_audio_controlled:
    renderer.includes('controlled probe; no microphone recording; no dialogue audio submitted') &&
    renderer.includes('controlled_probe_does_not_start_microphone') &&
    renderer.includes('production path still calls existing startSpeechRecognition'),
  runtime_wait_script_available:
    waitScript.includes('status_dialogue_w3_wake_handoff_wait.v1') &&
    waitScript.includes('w3_wake_detected') &&
    waitScript.includes('w3_wake_handoff_stt') &&
    waitScript.includes('xiaozhi_listen_detect_seen'),
  package_scripts_registered:
    packageSource.includes('voice:runtime-flow:probe-w3-wake') &&
    packageSource.includes('voice:runtime-flow:wait-w3-wake')
}

for (const [name, ok] of Object.entries(checks)) {
  assert.equal(ok, true, `${name} failed`)
}

const report = {
  schema: 'status_dialogue_w3_wake_detector_validation.v1',
  generated_at: new Date().toISOString(),
  renderer: rendererPath,
  bridge: bridgePath,
  wait_script: waitPath,
  checks,
  result: 'passed'
}

const outputDir = path.join(repoRoot, 'runtime', 'verification-reports')
fs.mkdirSync(outputDir, { recursive: true })
const outputPath = path.join(outputDir, `status-dialogue-w3-wake-detector-${Date.now()}.json`)
fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf8')

console.log(JSON.stringify({ ok: true, outputPath, checks }, null, 2))
