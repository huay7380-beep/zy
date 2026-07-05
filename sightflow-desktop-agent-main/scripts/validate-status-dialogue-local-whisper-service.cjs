const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')

const repoRoot = path.resolve(__dirname, '..')
const mainPath = path.join(repoRoot, 'src', 'main', 'index.ts')
const rendererPath = path.join(repoRoot, 'src', 'renderer', 'src', 'zhineng-console', 'ZhinengConsole.tsx')
const servicePath = path.join(repoRoot, 'scripts', 'local-whisper-service.py')
const streamLoopPath = path.join(repoRoot, 'scripts', 'validate-status-dialogue-voice-stream-loop.cjs')
const runtimeMarkerWaitPath = path.join(repoRoot, 'scripts', 'wait-status-dialogue-runtime-marker.cjs')
const localSttRealtimeWaitPath = path.join(repoRoot, 'scripts', 'wait-status-dialogue-local-stt-transcription.cjs')
const goalAuditPath = path.join(repoRoot, 'scripts', 'audit-status-dialogue-goal-completion.cjs')
const realGuiRetestPath = path.join(repoRoot, 'scripts', 'prepare-status-dialogue-real-gui-retest.cjs')
const realGuiWindowDiagnosisPath = path.join(repoRoot, 'scripts', 'diagnose-status-dialogue-real-gui-window.cjs')
const realSttEntryDiagnosisPath = path.join(repoRoot, 'scripts', 'diagnose-status-dialogue-real-stt-entry.cjs')
const testCliPath = path.join(repoRoot, 'scripts', 'test-cli.ts')
const packagePath = path.join(repoRoot, 'package.json')

const mainSource = fs.readFileSync(mainPath, 'utf8')
const rendererSource = fs.readFileSync(rendererPath, 'utf8')
const serviceSource = fs.readFileSync(servicePath, 'utf8')
const streamLoopSource = fs.readFileSync(streamLoopPath, 'utf8')
const runtimeMarkerWaitSource = fs.readFileSync(runtimeMarkerWaitPath, 'utf8')
const localSttRealtimeWaitSource = fs.existsSync(localSttRealtimeWaitPath) ? fs.readFileSync(localSttRealtimeWaitPath, 'utf8') : ''
const goalAuditSource = fs.existsSync(goalAuditPath) ? fs.readFileSync(goalAuditPath, 'utf8') : ''
const realGuiRetestSource = fs.readFileSync(realGuiRetestPath, 'utf8')
const realGuiWindowDiagnosisSource = fs.existsSync(realGuiWindowDiagnosisPath) ? fs.readFileSync(realGuiWindowDiagnosisPath, 'utf8') : ''
const realSttEntryDiagnosisSource = fs.existsSync(realSttEntryDiagnosisPath) ? fs.readFileSync(realSttEntryDiagnosisPath, 'utf8') : ''
const testCliSource = fs.readFileSync(testCliPath, 'utf8')
const packageSource = fs.readFileSync(packagePath, 'utf8')

const checks = {
  service_script_exists: fs.existsSync(servicePath),
  service_uses_threaded_local_http:
    serviceSource.includes('ThreadingHTTPServer') &&
    serviceSource.includes('127.0.0.1') &&
    serviceSource.includes('def do_GET') &&
    serviceSource.includes('def do_POST'),
  service_exposes_health_and_transcribe:
    serviceSource.includes('self.path != "/health"') &&
    serviceSource.includes('self.path != "/transcribe"') &&
    serviceSource.includes('local_whisper_persistent_service'),
  service_caches_loaded_models:
    serviceSource.includes('self.models: Dict[str, Any] = {}') &&
    serviceSource.includes('if model_key in self.models') &&
    serviceSource.includes('self.models[model_key] = model'),
  main_declares_service_adapter:
    mainSource.includes("'local_whisper_ipc' | 'local_whisper_persistent_service'") &&
    rendererSource.includes("'local_whisper_ipc' | 'local_whisper_persistent_service'"),
  renderer_defaults_to_local_stt_fast_path:
    rendererSource.includes("useState<StatusDialogueSttAdapterMode>('local')") &&
    rendererSource.includes("refs: ['xiaozhi_style_bridge.listen_start', 'local_whisper_persistent_service']"),
  renderer_logs_runtime_fix_marker:
    rendererSource.includes("STATUS_DIALOGUE_STT_RUNTIME_FIX_MARKER = 'stt-local-observability-2026-06-29-v3'") &&
    rendererSource.includes("logStatusDialogueVoiceEvent('status_dialogue_ui_runtime_loaded'") &&
    rendererSource.includes('runtime_fix_marker: STATUS_DIALOGUE_STT_RUNTIME_FIX_MARKER'),
  runtime_marker_wait_script_exists:
    fs.existsSync(runtimeMarkerWaitPath) &&
    runtimeMarkerWaitSource.includes("expectedRuntimeFixMarker = 'stt-local-observability-2026-06-29-v3'") &&
    runtimeMarkerWaitSource.includes("event.event !== 'status_dialogue_ui_runtime_loaded'") &&
    runtimeMarkerWaitSource.includes('event.marker_probe === true') &&
    runtimeMarkerWaitSource.includes('status_dialogue_runtime_marker_wait.v1'),
  runtime_marker_probe_test_mode_exists:
    testCliSource.includes("STATUS_DIALOGUE_RUNTIME_FIX_MARKER = 'stt-local-observability-2026-06-29-v3'") &&
    testCliSource.includes('runStatusDialogueMarkerTest') &&
    testCliSource.includes("action === 'status-dialogue-marker'") &&
    testCliSource.includes("event === 'status_dialogue_ui_runtime_loaded'") &&
    testCliSource.includes('status_dialogue_marker_probe_complete'),
  runtime_marker_probe_npm_entry_exists:
    packageSource.includes('"voice:runtime-flow:probe-marker"') &&
    packageSource.includes('TEST_MODE=status-dialogue-marker') &&
    packageSource.includes('electron ./out/main/test-cli.js'),
  main_supports_retest_graph_open_env:
    mainSource.includes("process.env.ZHINENG_STATUS_DIALOGUE_OPEN_GRAPH_ON_START === '1'") &&
    mainSource.includes("opened_by: 'ZHINENG_STATUS_DIALOGUE_OPEN_GRAPH_ON_START'"),
  real_gui_retest_preflight_script_exists:
    fs.existsSync(realGuiRetestPath) &&
    realGuiRetestSource.includes('status_dialogue_real_gui_retest_preflight.v1') &&
    realGuiRetestSource.includes("ZHINENG_STATUS_DIALOGUE_OPEN_GRAPH_ON_START: '1'") &&
    realGuiRetestSource.includes('scripts/wait-status-dialogue-runtime-marker.cjs') &&
    realGuiRetestSource.includes('--execute'),
  real_gui_retest_npm_entries_exist:
    packageSource.includes('"voice:runtime-flow:retest-preflight"') &&
    packageSource.includes('"voice:runtime-flow:restart-for-retest"') &&
    packageSource.includes('prepare-status-dialogue-real-gui-retest.cjs --execute'),
  local_stt_realtime_wait_script_exists:
    fs.existsSync(localSttRealtimeWaitPath) &&
    localSttRealtimeWaitSource.includes('status_dialogue_local_stt_realtime_wait.v1') &&
    localSttRealtimeWaitSource.includes('stt_start_requested') &&
    localSttRealtimeWaitSource.includes('no_stt_start_request_after_wait') &&
    localSttRealtimeWaitSource.includes('event_window') &&
    localSttRealtimeWaitSource.includes('status_dialogue_local_stt_retest_preflight.v1') &&
    localSttRealtimeWaitSource.includes('ready_for_operator_action') &&
    localSttRealtimeWaitSource.includes('click_right_bottom_electron_gui_stt_and_speak_one_complete_chinese_sentence') &&
    localSttRealtimeWaitSource.includes('local_transcription_failed_or_empty') &&
    localSttRealtimeWaitSource.includes('retry_with_audible_speech_or_inspect_local_whisper_empty_transcript') &&
    localSttRealtimeWaitSource.includes('audio_rms') &&
    localSttRealtimeWaitSource.includes('non_silent_ratio') &&
    localSttRealtimeWaitSource.includes('local_recording_silence_detected') &&
    localSttRealtimeWaitSource.includes('local_stt_silence_detected') &&
    localSttRealtimeWaitSource.includes('local_stt_recording_started') &&
    localSttRealtimeWaitSource.includes('local_stt_transcribe_result') &&
    localSttRealtimeWaitSource.includes('local_whisper_persistent_service'),
  local_stt_realtime_wait_npm_entries_exist:
    packageSource.includes('"voice:runtime-flow:wait-local-stt"') &&
    packageSource.includes('"voice:runtime-flow:check-local-stt"') &&
    packageSource.includes('"voice:runtime-flow:stt-retest-preflight"') &&
    packageSource.includes('wait-status-dialogue-local-stt-transcription.cjs --since-now'),
  goal_audit_exposes_local_stt_retest_readiness:
    goalAuditSource.includes('status_dialogue_goal_manual_retest_readiness.v1') &&
    goalAuditSource.includes('manual_retest_readiness') &&
    goalAuditSource.includes('ready_for_operator_action') &&
    goalAuditSource.includes('click_right_bottom_electron_gui_stt_and_speak_one_complete_chinese_sentence') &&
    goalAuditSource.includes('current_local_complete_failure') &&
    goalAuditSource.includes('retry_right_bottom_gui_stt_with_audible_speech_or_inspect_empty_transcript'),
  renderer_logs_stt_adapter_runtime_selection:
    rendererSource.includes("logStatusDialogueVoiceEvent('stt_adapter_runtime_selected'") &&
    rendererSource.includes("selectedSttAdapter === 'local'") &&
    rendererSource.includes("'local_whisper_persistent_service'") &&
    rendererSource.includes("selectedSttAdapter === 'remote'") &&
    rendererSource.includes("'openai_compatible_stt'") &&
    rendererSource.includes("'chrome_stt_bridge'"),
  renderer_migrates_existing_cloud_default_to_local:
    rendererSource.includes('sttDefaultMigrationRef') &&
    rendererSource.includes("logStatusDialogueVoiceEvent('stt_default_migrated_to_local'") &&
    rendererSource.includes("reason: 'local_whisper_persistent_service_fast_path'"),
  renderer_cloud_retry_is_one_shot:
    rendererSource.includes("logStatusDialogueVoiceEvent('cloud_stt_retry_one_shot'") &&
    !rendererSource.includes("setSelectedSttAdapter('cloud')"),
  renderer_logs_local_recording_and_transcription:
    rendererSource.includes("logStatusDialogueVoiceEvent('local_stt_recording_start_request'") &&
    rendererSource.includes("logStatusDialogueVoiceEvent('local_stt_recording_started'") &&
    rendererSource.includes("logStatusDialogueVoiceEvent('local_stt_recording_stopped'") &&
    rendererSource.includes('audio_rms') &&
    rendererSource.includes('audio_peak') &&
    rendererSource.includes('non_silent_ratio') &&
    rendererSource.includes('audio_dbfs') &&
    rendererSource.includes("logStatusDialogueVoiceEvent('local_stt_voice_detected'") &&
    rendererSource.includes("logStatusDialogueVoiceEvent('local_stt_silence_detected'") &&
    rendererSource.includes('STATUS_DIALOGUE_LOCAL_STT_MAX_WINDOW_MS') &&
    rendererSource.includes('STATUS_DIALOGUE_LOCAL_STT_SILENCE_TAIL_MS') &&
    rendererSource.includes("logStatusDialogueVoiceEvent('local_stt_transcribe_request'") &&
    rendererSource.includes("logStatusDialogueVoiceEvent('local_stt_transcribe_result'"),
  renderer_low_signal_vad_gate:
    rendererSource.includes("'local_stt_low_signal'") &&
    rendererSource.includes('status_dialogue_local_stt_low_signal_probe_start') &&
    rendererSource.includes('STATUS_DIALOGUE_LOCAL_STT_LOW_SIGNAL_RMS_THRESHOLD = 0.00025') &&
    rendererSource.includes('STATUS_DIALOGUE_LOCAL_STT_LOW_SIGNAL_PEAK_THRESHOLD = 0.0015') &&
    rendererSource.includes('STATUS_DIALOGUE_LOCAL_STT_LOW_SIGNAL_TRANSCRIBE_MS = 4200') &&
    rendererSource.includes("logStatusDialogueVoiceEvent('local_stt_low_signal_candidate'") &&
    rendererSource.includes("logStatusDialogueVoiceEvent('local_stt_low_signal_transcribe_allowed'") &&
    rendererSource.includes("'borderline_candidate'") &&
    rendererSource.includes('low-level speech candidate is sent to Whisper') &&
    rendererSource.includes('!lowSignalDetected &&') &&
    rendererSource.includes('vad_gate: vadGate') &&
    rendererSource.includes('low_signal_candidate: lowSignalCandidate'),
  renderer_borderline_vad_gate:
    rendererSource.includes("'local_stt_borderline'") &&
    rendererSource.includes('status_dialogue_local_stt_borderline_probe_start') &&
    rendererSource.includes('STATUS_DIALOGUE_LOCAL_STT_BORDERLINE_RMS_THRESHOLD = 0.00015') &&
    rendererSource.includes('STATUS_DIALOGUE_LOCAL_STT_BORDERLINE_PEAK_THRESHOLD = 0.001') &&
    rendererSource.includes("local_stt_borderline_transcribe_allowed") &&
    rendererSource.includes("'borderline_candidate'") &&
    rendererSource.includes('borderline_candidate: borderlineCandidate'),
  isolated_low_signal_probe_registered:
    testCliSource.includes('writeSineWav') &&
    testCliSource.includes('configureLocalSttLowSignalFakeAudio') &&
    testCliSource.includes('runStatusDialogueLocalSttLowSignalProbe') &&
    testCliSource.includes("status_dialogue_runtime_probe: 'local_stt_low_signal'") &&
    testCliSource.includes('status_dialogue_local_stt_low_signal_probe_observed') &&
    testCliSource.includes("action === 'status-dialogue-local-stt-low-signal'") &&
    packageSource.includes('"voice:runtime-flow:probe-local-stt-low-signal"') &&
    packageSource.includes('TEST_MODE=status-dialogue-local-stt-low-signal'),
  isolated_borderline_probe_registered:
    testCliSource.includes('configureLocalSttBorderlineFakeAudio') &&
    testCliSource.includes('runStatusDialogueLocalSttBorderlineProbe') &&
    testCliSource.includes("status_dialogue_runtime_probe: 'local_stt_borderline'") &&
    testCliSource.includes('status_dialogue_local_stt_borderline_probe_observed') &&
    testCliSource.includes("action === 'status-dialogue-local-stt-borderline'") &&
    packageSource.includes('"voice:runtime-flow:probe-local-stt-borderline"') &&
    packageSource.includes('TEST_MODE=status-dialogue-local-stt-borderline'),
  isolated_visible_stt_button_probe_registered:
    rendererSource.includes("logStatusDialogueVoiceEvent('status_dialogue_stt_entry_snapshot'") &&
    rendererSource.includes('buildSttEntrySnapshotPayload') &&
    rendererSource.includes("logStatusDialogueVoiceEvent('stt_button_pointer_down'") &&
    rendererSource.includes("logStatusDialogueVoiceEvent('stt_button_click'") &&
    rendererSource.includes("logStatusDialogueVoiceEvent('stt_button_click_start_failed'") &&
    testCliSource.includes('runStatusDialogueVisibleSttButtonClickProbe') &&
    testCliSource.includes("action === 'status-dialogue-visible-stt-button-click'") &&
    testCliSource.includes('status_dialogue_visible_stt_button_click_probe_submitted') &&
    testCliSource.includes('status_dialogue_visible_stt_button_click_probe_complete') &&
    testCliSource.includes("button[aria-label=\"start speech input\"], button.zg-dialogue-stt-button") &&
    packageSource.includes('"voice:runtime-flow:probe-visible-stt-button"') &&
    packageSource.includes('TEST_MODE=status-dialogue-visible-stt-button-click'),
  real_gui_pointer_entry_diagnosis_registered:
    rendererSource.includes("logStatusDialogueVoiceEvent('status_dialogue_global_pointer_down'") &&
    rendererSource.includes("logStatusDialogueVoiceEvent('status_dialogue_stt_entry_snapshot'") &&
    rendererSource.includes('capture-phase pointerdown inside graph window') &&
    fs.existsSync(realSttEntryDiagnosisPath) &&
    realSttEntryDiagnosisSource.includes('status_dialogue_stt_entry_snapshot') &&
    realSttEntryDiagnosisSource.includes('stt_button_visible_without_real_pointer_after_marker') &&
    realSttEntryDiagnosisSource.includes('stt_button_center_obstructed_after_marker') &&
    realSttEntryDiagnosisSource.includes('status_dialogue_global_pointer_down') &&
    realSttEntryDiagnosisSource.includes('no_graph_window_pointer_activity_after_marker') &&
    realSttEntryDiagnosisSource.includes('graph_window_pointer_not_on_stt_button') &&
    realSttEntryDiagnosisSource.includes('stt_target_pointer_without_button_handler') &&
    packageSource.includes('"voice:runtime-flow:diagnose-stt-entry"'),
  real_gui_window_diagnosis_registered:
    fs.existsSync(realGuiWindowDiagnosisPath) &&
    realGuiWindowDiagnosisSource.includes('status_dialogue_real_gui_window_diagnosis.v1') &&
    realGuiWindowDiagnosisSource.includes('EnumWindows') &&
    realGuiWindowDiagnosisSource.includes('graph_window_candidates_found') &&
    realGuiWindowDiagnosisSource.includes('runtime_process_found_but_no_visible_graph_window_candidate') &&
    packageSource.includes('"voice:runtime-flow:diagnose-gui-window"'),
  dock_voice_entry_probe_registered:
    rendererSource.includes("launchIntent?: 'status_dialogue_voice_entry'") &&
    rendererSource.includes("logStatusDialogueVoiceEvent('dock_voice_entry_click'") &&
    rendererSource.includes("logStatusDialogueVoiceEvent('status_dialogue_voice_entry_focused'") &&
    rendererSource.includes('zg-dock-action-button voice') &&
    testCliSource.includes('runStatusDialogueDockVoiceEntryProbe') &&
    testCliSource.includes("action === 'status-dialogue-dock-voice-entry'") &&
    testCliSource.includes('status_dialogue_dock_voice_entry_probe_complete') &&
    packageSource.includes('"voice:runtime-flow:probe-dock-voice-entry"') &&
    packageSource.includes('TEST_MODE=status-dialogue-dock-voice-entry'),
  main_finds_and_starts_service:
    mainSource.includes('getStatusDialogueSttServiceScriptPath') &&
    mainSource.includes('ensureLocalWhisperService') &&
    mainSource.includes('localWhisperServiceProcess = spawn'),
  main_uses_localhost_health_and_transcribe:
    mainSource.includes("statusDialogueLocalWhisperServiceUrl('/health')") &&
    mainSource.includes("statusDialogueLocalWhisperServiceUrl('/transcribe')") &&
    mainSource.includes('runLocalWhisperServiceTranscription'),
  main_exposes_local_stt_health_ipc:
    mainSource.includes("schema: 'status_dialogue_local_stt_health.v1'") &&
    mainSource.includes('runStatusDialogueLocalSttHealth') &&
    mainSource.includes("ipcMain.handle('zhineng:status-dialogue:stt:health'"),
  renderer_requests_local_stt_health:
    rendererSource.includes('requestStatusDialogueLocalSttHealth') &&
    rendererSource.includes("window.electron.invoke('zhineng:status-dialogue:stt:health'") &&
    rendererSource.includes('refreshLocalSttHealth'),
  renderer_exposes_local_stt_runtime_state:
    rendererSource.includes('StatusDialogueLocalSttRuntimeState') &&
    rendererSource.includes('lastResult?: StatusDialogueSttTranscriptionResult') &&
    rendererSource.includes('aria-label="local stt service health status"') &&
    rendererSource.includes('localSttLastResultLabel'),
  stream_loop_defaults_to_persistent_service:
    streamLoopSource.includes("argValue('--stt-mode', 'service')") &&
    streamLoopSource.includes('transcribeWithPersistentWhisperService') &&
    streamLoopSource.includes('stt_uses_persistent_service') &&
    streamLoopSource.includes('stt_service_health_ok'),
  main_falls_back_to_cold_subprocess:
    mainSource.includes('serviceResult.service_available === false') &&
    mainSource.includes('runLocalWhisperTranscription') &&
    mainSource.includes("local_stt_service_fallback"),
  main_cleans_service_on_quit:
    mainSource.includes('function stopLocalWhisperService') &&
    mainSource.includes('stopLocalWhisperService()'),
  no_raw_audio_persistence_added:
    !serviceSource.includes('shutil.copy') &&
    !mainSource.includes('save_raw_audio')
}

for (const [name, ok] of Object.entries(checks)) {
  assert.equal(ok, true, `${name} failed`)
}

const report = {
  schema: 'status_dialogue_local_whisper_service_validation.v1',
  generated_at: new Date().toISOString(),
  service: servicePath,
  main: mainPath,
  renderer: rendererPath,
  checks,
  result: 'passed'
}

const outputDir = path.join(repoRoot, 'runtime', 'verification-reports')
fs.mkdirSync(outputDir, { recursive: true })
const outputPath = path.join(outputDir, `status-dialogue-local-whisper-service-${Date.now()}.json`)
fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf8')

console.log(JSON.stringify({ ok: true, outputPath, checks }, null, 2))
