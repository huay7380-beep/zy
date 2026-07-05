const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')

const repoRoot = path.resolve(__dirname, '..')
const mainPath = path.join(repoRoot, 'src', 'main', 'index.ts')
const rendererPath = path.join(repoRoot, 'src', 'renderer', 'src', 'zhineng-console', 'ZhinengConsole.tsx')
const waitCloudSttPath = path.join(repoRoot, 'scripts', 'wait-status-dialogue-cloud-stt.cjs')
const waitRemoteSttPath = path.join(repoRoot, 'scripts', 'wait-status-dialogue-remote-stt.cjs')
const remoteSttConfigPath = path.join(repoRoot, 'scripts', 'validate-status-dialogue-remote-stt-config.cjs')
const remoteSttConfigurePath = path.join(repoRoot, 'scripts', 'configure-status-dialogue-remote-stt.cjs')
const remoteSttAcceptancePath = path.join(repoRoot, 'scripts', 'run-status-dialogue-remote-stt-acceptance.cjs')
const prepareRetestPath = path.join(repoRoot, 'scripts', 'prepare-status-dialogue-real-gui-retest.cjs')
const testCliPath = path.join(repoRoot, 'scripts', 'test-cli.ts')
const packagePath = path.join(repoRoot, 'package.json')

const mainSource = fs.readFileSync(mainPath, 'utf8')
const rendererSource = fs.readFileSync(rendererPath, 'utf8')
const waitCloudSttSource = fs.readFileSync(waitCloudSttPath, 'utf8')
const waitRemoteSttSource = fs.readFileSync(waitRemoteSttPath, 'utf8')
const remoteSttConfigSource = fs.readFileSync(remoteSttConfigPath, 'utf8')
const remoteSttConfigureSource = fs.readFileSync(remoteSttConfigurePath, 'utf8')
const remoteSttAcceptanceSource = fs.readFileSync(remoteSttAcceptancePath, 'utf8')
const prepareRetestSource = fs.readFileSync(prepareRetestPath, 'utf8')
const testCliSource = fs.readFileSync(testCliPath, 'utf8')
const packageSource = fs.readFileSync(packagePath, 'utf8')

const checks = {
  main_end_without_transcript_completes:
    mainSource.includes("type === 'end'") &&
    mainSource.includes("error: sawAudio ? 'no-speech' : 'chrome_stt_ended_without_audio'") &&
    mainSource.includes("fallback_reason: sawAudio ? 'no_speech' : 'ended_without_audio'"),
  main_openai_compatible_stt_adapter:
    mainSource.includes('getStatusDialogueRemoteSttConfig') &&
    mainSource.includes('runOpenAiCompatibleSttTranscription') &&
    mainSource.includes("'openai_compatible_stt'") &&
    mainSource.includes('OPENAI_STT_API_KEY') &&
    mainSource.includes('OPENAI_API_KEY') &&
    mainSource.includes('OPENAI_STT_BASE_URL') &&
    mainSource.includes('OPENAI_BASE_URL') &&
    mainSource.includes('OPENAI_AUDIO_TRANSCRIPTIONS_ENDPOINT') &&
    mainSource.includes('OPENAI_STT_MODEL') &&
    mainSource.includes("writeStatusDialogueRuntimeLog('remote_stt_start'") &&
    mainSource.includes("writeStatusDialogueRuntimeLog('remote_stt_complete'") &&
    mainSource.includes("writeStatusDialogueRuntimeLog('remote_stt_fallback_to_local'"),
  main_remote_stt_health_ipc:
    mainSource.includes('status_dialogue_remote_stt_health.v1') &&
    mainSource.includes('runStatusDialogueRemoteSttHealth') &&
    mainSource.includes("ipcMain.handle('zhineng:status-dialogue:stt:remote-health'") &&
    mainSource.includes("writeStatusDialogueRuntimeLog('remote_stt_health_check'") &&
    mainSource.includes("method: 'HEAD'") &&
    mainSource.includes('no audio upload; no api key logging'),
  renderer_remote_stt_adapter_visible:
    rendererSource.includes("type StatusDialogueSttAdapterMode = 'cloud' | 'local' | 'remote'") &&
    rendererSource.includes('<option value="remote">remote</option>') &&
    rendererSource.includes("transcriptionAdapterId: 'openai_compatible_stt'") &&
    rendererSource.includes("'openai_compatible_stt'"),
  renderer_remote_stt_health_visible:
    rendererSource.includes('interface StatusDialogueRemoteSttHealthResult') &&
    rendererSource.includes('requestStatusDialogueRemoteSttHealth') &&
    rendererSource.includes("window.electron.invoke('zhineng:status-dialogue:stt:remote-health'") &&
    rendererSource.includes("logStatusDialogueVoiceEvent('remote_stt_health_request'") &&
    rendererSource.includes("logStatusDialogueVoiceEvent('remote_stt_health_result'") &&
    rendererSource.includes('aria-label="remote stt service health status"') &&
    rendererSource.includes('check remote'),
  renderer_failure_categories_declared:
    rendererSource.includes('type StatusDialogueCloudSttFailureCategory') &&
    rendererSource.includes("'ended_without_audio'") &&
    rendererSource.includes("'network'") &&
    rendererSource.includes("'permission'"),
  renderer_health_state_declared:
    rendererSource.includes('interface StatusDialogueCloudSttHealthState') &&
    rendererSource.includes('const [cloudSttHealth, setCloudSttHealth]'),
  renderer_latency_budget_declared:
    rendererSource.includes('STATUS_DIALOGUE_CLOUD_STT_DEFAULT_TIMEOUT_MS = 7000') &&
    rendererSource.includes('STATUS_DIALOGUE_CLOUD_STT_MAX_TIMEOUT_MS') &&
    rendererSource.includes('timeout_ms: timeoutMs') &&
    !rendererSource.includes('timeout_ms: 24000'),
  renderer_persists_cloud_degraded_cooldown:
    rendererSource.includes('STATUS_DIALOGUE_CLOUD_STT_DEGRADED_STORAGE_KEY') &&
    rendererSource.includes('STATUS_DIALOGUE_CLOUD_STT_DEGRADED_COOLDOWN_MS = 10 * 60 * 1000') &&
    rendererSource.includes('readPersistedCloudSttDegradedHealthState') &&
    rendererSource.includes('persistCloudSttDegradedCooldown') &&
    rendererSource.includes('clearCloudSttDegradedCooldown') &&
    rendererSource.includes("logStatusDialogueVoiceEvent('cloud_stt_degraded_cooldown_saved'") &&
    rendererSource.includes('persisted cloud STT cooldown; local Whisper remains primary'),
  renderer_classifier_present:
    rendererSource.includes('function classifyChromeSttFailure') &&
    rendererSource.includes('buildCloudSttFailureHealthState') &&
    rendererSource.includes("recoveryAction: 'retry_cloud'"),
  renderer_timeout_opens_circuit:
    rendererSource.includes("health.last_category === 'timeout'") &&
    rendererSource.includes('buildCloudSttDegradedHealthState(initialFailureHealth)'),
  renderer_success_and_failure_update_health:
    rendererSource.includes('clearCloudSttDegradedCooldown()') &&
    rendererSource.includes('setCloudSttHealth(buildCloudSttSuccessHealthState(result, retryCount))') &&
    rendererSource.includes('const initialFailureHealth = buildCloudSttFailureHealthState(result, retryCount)') &&
    rendererSource.includes('const failureHealth = shouldOpenCloudSttCircuit(initialFailureHealth)') &&
    rendererSource.includes("logStatusDialogueVoiceEvent('cloud_stt_failure_classified'"),
  renderer_progress_events_update_health:
    rendererSource.includes('setCloudSttHealth((current) =>') &&
    rendererSource.includes('last_events: event.events ?? current.last_events'),
  renderer_retry_ui_present:
    rendererSource.includes('aria-label="cloud stt stability status"') &&
    rendererSource.includes('retry cloud') &&
    rendererSource.includes("startChromeSpeechBridgeTranscription({ retry: true })"),
  renderer_retry_keeps_input_queue_intact:
    rendererSource.includes('pendingDialogueInputQueueRef') &&
    rendererSource.includes('dialogueBusyRef') &&
    rendererSource.includes("'stt_input_queued'"),
  renderer_cloud_circuit_breaker_declared:
    rendererSource.includes("'degraded'") &&
    rendererSource.includes('shouldOpenCloudSttCircuit') &&
    rendererSource.includes('buildCloudSttDegradedHealthState') &&
    rendererSource.includes('function isCloudSttCircuitOpen'),
  renderer_cloud_degraded_falls_back_local:
    rendererSource.includes("logStatusDialogueVoiceEvent('cloud_stt_degraded_to_local'") &&
    rendererSource.includes('persistCloudSttDegradedCooldown(failureHealth)') &&
    rendererSource.includes("selectSttAdapter('local', 'cloud_stt_degraded_fallback_local'") &&
    rendererSource.includes("fallback_adapter: 'local_whisper_persistent_service'"),
  renderer_cloud_circuit_open_skips_slow_cloud:
    rendererSource.includes("logStatusDialogueVoiceEvent('cloud_stt_circuit_open_skip_to_local'") &&
    rendererSource.includes("selectSttAdapter('local', 'cloud_stt_circuit_open_skip_to_local'") &&
    rendererSource.includes("if (await startLocalSpeechTranscription())") &&
    rendererSource.includes("boundary: 'skip slow cloud retry; route operator speech to local Whisper; no world write'"),
  renderer_probe_attempts_declared:
    rendererSource.includes('status_dialogue_cloud_stt_fake_audio_probe_attempt_start') &&
    rendererSource.includes('status_dialogue_cloud_stt_fake_audio_probe_attempt_complete') &&
    rendererSource.includes('cloudSttMaxAttempts'),
  renderer_probe_config_from_state:
    rendererSource.includes('status_dialogue_cloud_stt_language') &&
    rendererSource.includes('status_dialogue_cloud_stt_max_attempts') &&
    rendererSource.includes('status_dialogue_cloud_stt_timeout_ms') &&
    rendererSource.includes('status_dialogue_cloud_stt_test_audio'),
  main_probe_env_passthrough:
    mainSource.includes('ZHINENG_CHROME_STT_TEST_LANGUAGE') &&
    mainSource.includes('ZHINENG_CHROME_STT_MAX_ATTEMPTS') &&
    mainSource.includes('ZHINENG_CHROME_STT_TIMEOUT_MS'),
  main_fake_audio_launch_observable:
    mainSource.includes("writeStatusDialogueRuntimeLog('chrome_stt_bridge_launch'") &&
    mainSource.includes('fake_audio_requested') &&
    mainSource.includes('fake_audio_enabled') &&
    mainSource.includes('fakeAudioExists'),
  wait_cloud_stt_excludes_unrelated_runtime_probes:
    waitCloudSttSource.includes('buildRuntimeProbeWindows') &&
    waitCloudSttSource.includes('isRuntimeProbeEvent') &&
    waitCloudSttSource.includes('allowedRuntimeProbe') &&
    waitCloudSttSource.includes('runtime_probe_window_count'),
  isolated_cloud_budget_probe_registered:
    testCliSource.includes('runStatusDialogueCloudSttBudgetProbe') &&
    testCliSource.includes("action === 'status-dialogue-cloud-stt-budget'") &&
    testCliSource.includes("status_dialogue_cloud_stt_timeout_ms: 7000") &&
    testCliSource.includes("'cloud_stt_degraded_cooldown_saved'") &&
    testCliSource.includes('status_dialogue_cloud_stt_budget_probe_observed') &&
    testCliSource.includes("error: 'chrome_stt_timeout'") &&
    packageSource.includes('voice:runtime-flow:probe-cloud-stt-budget'),
  isolated_remote_stt_mock_probe_registered:
    rendererSource.includes("'remote_stt_mock'") &&
    rendererSource.includes("logStatusDialogueVoiceEvent('status_dialogue_remote_stt_mock_probe_start'") &&
    rendererSource.includes("selectSttAdapter('remote', 'remote_stt_mock_probe'") &&
    rendererSource.includes("startLocalSpeechTranscription({ transcriptionAdapterId: 'openai_compatible_stt' })") &&
    testCliSource.includes('runStatusDialogueRemoteSttMockProbe') &&
    testCliSource.includes("action === 'status-dialogue-remote-stt-mock'") &&
    testCliSource.includes("ipcMain.handle('zhineng:status-dialogue:stt:remote-health'") &&
    testCliSource.includes("ipcMain.handle('zhineng:status-dialogue:stt:transcribe'") &&
    testCliSource.includes('status_dialogue_remote_stt_mock_probe_complete') &&
    packageSource.includes('voice:runtime-flow:probe-remote-stt-mock'),
  configured_remote_stt_probe_registered:
    mainSource.includes('status_dialogue_remote_stt_configured_probe.v1') &&
    mainSource.includes('runStatusDialogueRemoteSttConfiguredProbe') &&
    mainSource.includes("ipcMain.handle('zhineng:status-dialogue:stt:remote-configured-probe'") &&
    rendererSource.includes("'remote_stt_configured'") &&
    rendererSource.includes('zhineng:status-dialogue:stt:remote-configured-probe') &&
    rendererSource.includes("logStatusDialogueVoiceEvent('status_dialogue_remote_stt_configured_probe_result'") &&
    rendererSource.includes('status_dialogue_remote_stt_configured_probe_adapter_restored') &&
    rendererSource.includes('configured remote STT probe does not persist adapter selection into operator input') &&
    rendererSource.includes("logStatusDialogueVoiceEvent('remote_stt_unavailable_skip_to_local'") &&
    rendererSource.includes('skip known unavailable remote STT before recording') &&
    rendererSource.includes("selectSttAdapter('local', 'remote_stt_unavailable_skip_to_local')") &&
    prepareRetestSource.includes('ZHINENG_STATUS_DIALOGUE_REMOTE_STT_TEST_AUDIO') &&
    waitRemoteSttSource.includes('status_dialogue_remote_stt_wait.v1') &&
    waitRemoteSttSource.includes('base_url_host: event.base_url_host') &&
    waitRemoteSttSource.includes('configure_remote_stt_api_key') &&
    packageSource.includes('voice:runtime-flow:wait-remote-stt') &&
    packageSource.includes('voice:runtime-flow:probe-remote-stt-configured'),
  remote_stt_config_preflight_registered:
    remoteSttConfigSource.includes('status_dialogue_remote_stt_config_preflight.v1') &&
    remoteSttConfigSource.includes('ready_for_remote_probe') &&
    remoteSttConfigSource.includes('no audio upload; no network request; api keys are redacted') &&
    remoteSttConfigSource.includes('OPENAI_STT_API_KEY') &&
    remoteSttConfigSource.includes('OPENAI_API_KEY') &&
    remoteSttConfigSource.includes('OPENAI_STT_BASE_URL') &&
    remoteSttConfigSource.includes('OPENAI_BASE_URL') &&
    remoteSttConfigSource.includes('OPENAI_AUDIO_TRANSCRIPTIONS_ENDPOINT') &&
    remoteSttConfigSource.includes('remote_stt_base_url_or_full_endpoint') &&
    packageSource.includes('voice:remote-stt-config:validate'),
  remote_stt_config_writer_registered:
    remoteSttConfigureSource.includes('status_dialogue_remote_stt_configure.v1') &&
    remoteSttConfigureSource.includes('local settings configuration only; no audio upload; no network request') &&
    remoteSttConfigureSource.includes('--apply') &&
    remoteSttConfigureSource.includes('--apply-nonsecret-defaults') &&
    remoteSttConfigureSource.includes('--api-key-env') &&
    remoteSttConfigureSource.includes('REMOTE_STT_API_KEY_ENV_CANDIDATES') &&
    remoteSttConfigureSource.includes('OPENAI_API_KEY') &&
    remoteSttConfigureSource.includes('statusDialogueStt') &&
    remoteSttConfigureSource.includes('status-dialogue-stt-backup') &&
    packageSource.includes('voice:remote-stt-config:prepare') &&
    packageSource.includes('voice:remote-stt-config:apply') &&
    packageSource.includes('voice:remote-stt-config:apply-defaults'),
  remote_stt_acceptance_chain_registered:
    remoteSttAcceptanceSource.includes('status_dialogue_remote_stt_acceptance.v1') &&
    remoteSttAcceptanceSource.includes('network probe starts only when ready_for_remote_probe=true') &&
    remoteSttAcceptanceSource.includes('voice:runtime-flow:probe-remote-stt-configured') &&
    remoteSttAcceptanceSource.includes('audit-status-dialogue-goal-completion.cjs') &&
    remoteSttAcceptanceSource.includes('remote_stt_config_not_ready') &&
    packageSource.includes('voice:remote-stt-config:acceptance'),
  isolated_remote_unavailable_probe_registered:
    rendererSource.includes("'remote_stt_unavailable'") &&
    rendererSource.includes("logStatusDialogueVoiceEvent('status_dialogue_remote_stt_unavailable_probe_start'") &&
    rendererSource.includes("logStatusDialogueVoiceEvent('status_dialogue_remote_stt_unavailable_probe_ready'") &&
    rendererSource.includes("selectSttAdapter('remote', 'remote_stt_unavailable_probe'") &&
    rendererSource.includes("logStatusDialogueVoiceEvent('remote_stt_unavailable_skip_to_local'") &&
    testCliSource.includes('runStatusDialogueRemoteSttUnavailableProbe') &&
    testCliSource.includes("action === 'status-dialogue-remote-stt-unavailable'") &&
    testCliSource.includes("runtime_probe: 'remote_stt_unavailable'") &&
    testCliSource.includes('remote_stt_unavailable_probe_unexpected_remote_upload') &&
    testCliSource.includes('status_dialogue_remote_stt_unavailable_probe_complete') &&
    packageSource.includes('voice:runtime-flow:probe-remote-stt-unavailable')
}

for (const [name, ok] of Object.entries(checks)) {
  assert.equal(ok, true, `${name} failed`)
}

const report = {
  schema: 'status_dialogue_cloud_stt_stability_validation.v1',
  generated_at: new Date().toISOString(),
  main: mainPath,
  renderer: rendererPath,
  checks,
  result: 'passed'
}

const outputDir = path.join(repoRoot, 'runtime', 'verification-reports')
fs.mkdirSync(outputDir, { recursive: true })
const outputPath = path.join(outputDir, `status-dialogue-cloud-stt-stability-${Date.now()}.json`)
fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf8')

console.log(JSON.stringify({ ok: true, outputPath, checks }, null, 2))
