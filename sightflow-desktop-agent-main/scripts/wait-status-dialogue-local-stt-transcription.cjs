const fs = require('node:fs')
const path = require('node:path')

const repoRoot = path.resolve(__dirname, '..')
const zhinengRoot = process.env.ZHINENG_PROJECT_ROOT
  ? path.resolve(process.env.ZHINENG_PROJECT_ROOT)
  : path.resolve(repoRoot, '..')
const defaultLogDir = path.join(zhinengRoot, 'runtime', 'status-dialogue-logs')
const outputDir = path.join(repoRoot, 'runtime', 'verification-reports')
const expectedAdapterId = 'local_whisper_persistent_service'

function argValue(name, fallback) {
  const index = process.argv.indexOf(name)
  if (index === -1 || index + 1 >= process.argv.length) return fallback
  return process.argv[index + 1]
}

function hasFlag(name) {
  return process.argv.includes(name)
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function voiceFlowLogs(logDir) {
  if (!fs.existsSync(logDir)) return []
  return fs
    .readdirSync(logDir)
    .filter((name) => /^voice-flow-\d{8}\.jsonl$/.test(name))
    .map((name) => {
      const filePath = path.join(logDir, name)
      return { filePath, mtimeMs: fs.statSync(filePath).mtimeMs }
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
}

function parseJsonl(filePath) {
  const events = []
  const parseErrors = []
  if (!filePath || !fs.existsSync(filePath)) return { events, parseErrors }
  const lines = fs
    .readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
  for (const [index, line] of lines.entries()) {
    try {
      events.push({ ...JSON.parse(line), __file: filePath, __line: index + 1 })
    } catch (error) {
      parseErrors.push({
        file: filePath,
        line: index + 1,
        error: String(error?.message ?? error).slice(0, 200)
      })
    }
  }
  return { events, parseErrors }
}

function eventTimeMs(event) {
  const raw = typeof event.ts === 'string' ? event.ts : typeof event.generated_at === 'string' ? event.generated_at : undefined
  const ms = raw ? Date.parse(raw) : NaN
  return Number.isFinite(ms) ? ms : 0
}

function compactEvent(event) {
  if (!event) return undefined
  return {
    event: event.event,
    ts: event.ts ?? event.generated_at,
    session_id: event.session_id,
    adapter_id: event.adapter_id,
    selected_adapter: event.selected_adapter,
    model: event.model,
    language: event.language,
    success: event.success,
    latency_ms: event.latency_ms,
    transcript_length: event.transcript_length,
    sample_count: event.sample_count,
    chunk_count: event.chunk_count,
    audio_rms: event.audio_rms,
    audio_peak: event.audio_peak,
    audio_dbfs: event.audio_dbfs,
    non_silent_ratio: event.non_silent_ratio,
    voice_detected: event.voice_detected,
    voice_ms: event.voice_ms,
    recorded_ms: event.recorded_ms,
    peak_rms: event.peak_rms,
    peak_level: event.peak_level,
    rms_threshold: event.rms_threshold,
    peak_threshold: event.peak_threshold,
    error: event.error,
    fallback_reason: event.fallback_reason,
    file: event.__file,
    line: event.__line
  }
}

function latest(events, name, predicate = () => true) {
  return events
    .filter((event) => event.event === name && predicate(event))
    .sort((a, b) => eventTimeMs(b) - eventTimeMs(a))[0]
}

function inspectLocalStt({ logDir, sinceMs, requireSince }) {
  const logs = voiceFlowLogs(logDir).slice(0, 3)
  const parseErrors = []
  const allEvents = []
  for (const log of logs) {
    const parsed = parseJsonl(log.filePath)
    parseErrors.push(...parsed.parseErrors)
    allEvents.push(...parsed.events)
  }

  const runtimeEvents = allEvents.filter((event) => event.marker_probe !== true && !event.runtime_probe)
  const latestRuntimeMarker = latest(runtimeEvents, 'status_dialogue_ui_runtime_loaded')
  const effectiveSinceMs = requireSince ? sinceMs : eventTimeMs(latestRuntimeMarker)
  const effectiveRequireSince = requireSince || Boolean(latestRuntimeMarker)
  const actionEvents = runtimeEvents.filter((event) => !effectiveRequireSince || eventTimeMs(event) >= effectiveSinceMs)

  const adapterEvent = latest(runtimeEvents, 'stt_adapter_runtime_selected', (event) => event.source === expectedAdapterId || event.selected_adapter === 'local')
  const health = latest(runtimeEvents, 'local_stt_health_check', (event) => event.adapter_id === expectedAdapterId)
  const sttButtonPointerDown = latest(actionEvents, 'stt_button_pointer_down')
  const sttStartRequest = latest(actionEvents, 'stt_start_requested')
  const recordingStartRequest = latest(actionEvents, 'local_stt_recording_start_request', (event) => event.adapter_id === expectedAdapterId)
  const recordingStarted = latest(actionEvents, 'local_stt_recording_started', (event) => event.adapter_id === expectedAdapterId)
  const recordingStopped = latest(actionEvents, 'local_stt_recording_stopped', (event) => event.adapter_id === expectedAdapterId)
  const transcribeRequest = latest(actionEvents, 'local_stt_transcribe_request', (event) => event.adapter_id === expectedAdapterId)
  const mainStart = latest(actionEvents, 'local_stt_start')
  const mainComplete = latest(actionEvents, 'local_stt_complete')
  const rendererResult = latest(actionEvents, 'local_stt_transcribe_result')
  const mainFailed = latest(actionEvents, 'local_stt_failed')
  const recordingFailed = latest(actionEvents, 'local_stt_recording_failed')
  const silenceDetected = latest(actionEvents, 'local_stt_silence_detected', (event) => event.adapter_id === expectedAdapterId)
  const mainCompleteFailed = Boolean(mainComplete && mainComplete.success !== true)
  const rendererResultFailed = Boolean(rendererResult && rendererResult.success !== true)

  const persistentComplete =
    mainComplete?.adapter_id === expectedAdapterId && mainComplete.success === true && Number(mainComplete.transcript_length ?? 0) > 0
  const persistentRendererResult =
    rendererResult?.adapter_id === expectedAdapterId &&
    rendererResult.success === true &&
    Number(rendererResult.transcript_length ?? 0) > 0

  const checks = {
    adapter_selected_local: Boolean(adapterEvent),
    health_ready: health?.status === 'ready' && health?.reachable === true,
    stt_start_requested: Boolean(sttStartRequest),
    local_recording_start_requested: Boolean(recordingStartRequest),
    recording_started: Boolean(recordingStarted),
    recording_stopped: Boolean(recordingStopped),
    audible_voice_detected: Boolean(recordingStopped?.voice_detected === true || latest(actionEvents, 'local_stt_voice_detected')),
    transcribe_requested: Boolean(transcribeRequest),
    main_transcribe_started: Boolean(mainStart),
    main_transcribe_completed_persistent: persistentComplete,
    renderer_transcribe_completed_persistent: persistentRendererResult,
    no_recording_failure: !recordingFailed,
    no_main_failure: !mainFailed && !mainCompleteFailed && !rendererResultFailed
  }
  const missing = Object.entries(checks)
    .filter(([, ok]) => !ok)
    .map(([name]) => name)
  const result = (() => {
    if (missing.length === 0) return 'passed'
    if (!adapterEvent) return 'local_adapter_not_selected'
    if (health?.status !== 'ready' || health?.reachable !== true) return 'local_stt_health_not_ready'
    if (sttButtonPointerDown && !sttStartRequest) return 'stt_button_pointer_seen_without_start_request'
    if (!sttStartRequest) return 'no_stt_start_request_after_wait'
    if (sttStartRequest?.selected_adapter !== 'local') return 'stt_request_not_routed_to_local'
    if (recordingFailed) return 'local_recording_failed'
    if (silenceDetected) return 'local_recording_silence_detected'
    if (mainFailed || mainCompleteFailed || rendererResultFailed) return 'local_transcription_failed_or_empty'
    if (!recordingStartRequest) return 'local_recording_not_requested_after_click'
    if (!recordingStarted) return 'local_recording_not_started'
    if (!recordingStopped) return 'local_recording_not_stopped'
    if (!transcribeRequest) return 'local_transcribe_not_requested'
    if (!persistentComplete || !persistentRendererResult) return 'missing_local_stt_transcription'
    return 'missing_local_stt_transcription'
  })()

  return {
    passed: missing.length === 0,
    result,
    checks,
    missing,
    event_window: {
      runtime_event_count: runtimeEvents.length,
      action_event_count: actionEvents.length,
      require_since: effectiveRequireSince,
      since_ms: effectiveRequireSince ? effectiveSinceMs : undefined,
      since_source: requireSince ? 'explicit' : latestRuntimeMarker ? 'latest_runtime_marker' : 'full_log'
    },
    evidence: {
      adapter_event: compactEvent(adapterEvent),
      health: compactEvent(health),
      latest_runtime_marker: compactEvent(latestRuntimeMarker),
      stt_button_pointer_down: compactEvent(sttButtonPointerDown),
      stt_start_request: compactEvent(sttStartRequest),
      recording_start_request: compactEvent(recordingStartRequest),
      recording_started: compactEvent(recordingStarted),
      recording_stopped: compactEvent(recordingStopped),
      transcribe_request: compactEvent(transcribeRequest),
      main_start: compactEvent(mainStart),
      main_complete: compactEvent(mainComplete),
      renderer_result: compactEvent(rendererResult),
      main_failed: compactEvent(mainFailed),
      recording_failed: compactEvent(recordingFailed),
      silence_detected: compactEvent(silenceDetected)
    },
    inspected_logs: logs.map((log) => log.filePath),
    parse_errors: parseErrors
  }
}

function buildPreflight(result) {
  const localReady = result.checks.adapter_selected_local === true && result.checks.health_ready === true
  const readyForOperatorAction =
    localReady &&
    result.passed !== true &&
    (result.result === 'no_stt_start_request_after_wait' ||
      result.result === 'stt_button_pointer_seen_without_start_request' ||
      result.result === 'local_transcription_failed_or_empty' ||
      result.result === 'local_recording_silence_detected')
  const nextAction = (() => {
    if (result.passed) return 'local_stt_transcription_already_proved'
    if (!result.checks.adapter_selected_local) return 'restart_real_gui_or_select_local_stt_adapter'
    if (!result.checks.health_ready) return 'start_or_fix_local_whisper_persistent_service'
    if (result.result === 'stt_button_pointer_seen_without_start_request') return 'inspect_stt_button_handler_before_retry'
    if (result.result === 'stt_request_not_routed_to_local') return 'check_stt_adapter_selector_and_retry_local_mode'
    if (result.result === 'local_recording_failed') return 'check_microphone_permission_device_and_retry'
    if (result.result === 'local_recording_silence_detected') return 'retry_after_confirming_gui_shows_mic_local_and_speak_after_recording_starts'
    if (result.result === 'local_transcription_failed_or_empty') return 'retry_with_audible_speech_or_inspect_local_whisper_empty_transcript'
    if (readyForOperatorAction) return 'click_right_bottom_electron_gui_stt_and_speak_one_complete_chinese_sentence'
    return 'continue_from_report_result'
  })()
  return {
    schema: 'status_dialogue_local_stt_retest_preflight.v1',
    ready_for_operator_action: readyForOperatorAction,
    completion_proof: result.passed,
    result: result.passed ? 'local_stt_transcription_already_proved' : readyForOperatorAction ? 'ready_for_operator_stt_test' : result.result,
    next_action: nextAction,
    boundary:
      'preflight only; this does not prove microphone recording, local transcription, W3 handoff, or TTS interruption'
  }
}

async function main() {
  const waitMs = Number(argValue('--wait-ms', '120000'))
  const intervalMs = Number(argValue('--interval-ms', '1000'))
  const preflightMode = hasFlag('--preflight')
  const explicitSinceMs = Number(argValue('--since-ms', 'NaN'))
  const hasExplicitSinceMs = Number.isFinite(explicitSinceMs) && explicitSinceMs > 0
  const requireSince = hasFlag('--since-now') || hasExplicitSinceMs
  const sinceMs = hasExplicitSinceMs ? explicitSinceMs : Date.now()
  const startedAt = new Date().toISOString()
  const deadlineMs = sinceMs + Math.max(0, waitMs)
  let latestResult

  do {
    latestResult = inspectLocalStt({ logDir: defaultLogDir, sinceMs, requireSince })
    if (latestResult.passed) break
    if (waitMs <= 0 || Date.now() >= deadlineMs) break
    await sleep(Math.max(100, intervalMs))
  } while (true)

  const report = {
    schema: 'status_dialogue_local_stt_realtime_wait.v1',
    generated_at: new Date().toISOString(),
    started_at: startedAt,
    zhineng_root: zhinengRoot,
    log_dir: defaultLogDir,
    expected_adapter_id: expectedAdapterId,
    require_since: requireSince,
    since_ms: requireSince ? sinceMs : undefined,
    wait_ms: waitMs,
    result: latestResult.result,
    preflight: buildPreflight(latestResult),
    ...latestResult
  }
  const ok = report.passed || (preflightMode && report.preflight.ready_for_operator_action)

  fs.mkdirSync(outputDir, { recursive: true })
  const outputPath = path.join(outputDir, `status-dialogue-local-stt-realtime-wait-${Date.now()}-${process.pid}.json`)
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf8')

  console.log(
    JSON.stringify(
      {
        ok,
        outputPath,
        result: report.result,
        preflight: report.preflight,
        checks: report.checks,
        missing: report.missing,
        event_window: report.event_window,
        evidence: report.evidence,
        inspected_logs: report.inspected_logs,
        wait_ms: waitMs,
        require_since: requireSince
      },
      null,
      2
    )
  )

  if (!ok) {
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
