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
  const prefix = `${name}=`
  const inline = process.argv.find((item) => item.startsWith(prefix))
  if (inline) return inline.slice(prefix.length)
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
  const raw = typeof event?.ts === 'string' ? event.ts : typeof event?.generated_at === 'string' ? event.generated_at : undefined
  const ms = raw ? Date.parse(raw) : NaN
  return Number.isFinite(ms) ? ms : 0
}

function latest(events, name, predicate = () => true) {
  return events
    .filter((event) => event.event === name && predicate(event))
    .sort((a, b) => eventTimeMs(b) - eventTimeMs(a))[0]
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
    status: event.status,
    success: event.success,
    transcript_length: event.transcript_length,
    latency_ms: event.latency_ms,
    voice_ms: event.voice_ms,
    recorded_ms: event.recorded_ms,
    reason: event.reason,
    source: event.source,
    runtime_probe: event.runtime_probe,
    marker_probe: event.marker_probe === true,
    file: event.__file,
    line: event.__line
  }
}

function count(events, predicate) {
  return events.filter(predicate).length
}

function buildRuntimeProbeWindows(events) {
  const windows = []
  const activeByProbe = new Map()
  const sortedEvents = [...events].sort((a, b) => eventTimeMs(a) - eventTimeMs(b))

  for (const event of sortedEvents) {
    const probe = event.runtime_probe
    const timeMs = eventTimeMs(event)
    if (!probe || !timeMs) continue

    const eventName = String(event.event ?? '')
    const isProbeStart = eventName.includes('_probe_start') && !eventName.includes('_attempt_')
    const isProbeEnd =
      (eventName.includes('_probe_complete') && !eventName.includes('_attempt_')) || eventName.includes('_probe_observed')

    if (isProbeStart && !activeByProbe.has(probe)) {
      activeByProbe.set(probe, { probe, startMs: Math.max(0, timeMs - 1500), endMs: timeMs + 60_000 })
    }

    const activeWindow = activeByProbe.get(probe)
    if (activeWindow) activeWindow.endMs = Math.max(activeWindow.endMs, timeMs + 1500)

    if (isProbeEnd && activeWindow) {
      windows.push({ ...activeWindow, endMs: timeMs + 1500 })
      activeByProbe.delete(probe)
    }
  }

  for (const activeWindow of activeByProbe.values()) {
    windows.push(activeWindow)
  }

  return windows
}

function isRuntimeProbeEvent(event, runtimeProbeWindows) {
  if (event.marker_probe === true || event.runtime_probe) return true
  const timeMs = eventTimeMs(event)
  if (!timeMs) return false
  return runtimeProbeWindows.some((window) => timeMs >= window.startMs && timeMs <= window.endMs)
}

function inspectContinuousLoop({ logDir, sinceMs, requireSince, minTurns }) {
  const logs = voiceFlowLogs(logDir).slice(0, 3)
  const parseErrors = []
  const allEvents = []
  for (const log of logs) {
    const parsed = parseJsonl(log.filePath)
    parseErrors.push(...parsed.parseErrors)
    allEvents.push(...parsed.events)
  }

  const runtimeProbeWindows = buildRuntimeProbeWindows(allEvents)
  const runtimeEvents = allEvents.filter((event) => !isRuntimeProbeEvent(event, runtimeProbeWindows))
  const latestRuntimeMarker = latest(runtimeEvents, 'status_dialogue_ui_runtime_loaded')
  const effectiveSinceMs = requireSince ? sinceMs : eventTimeMs(latestRuntimeMarker)
  const effectiveRequireSince = requireSince || Boolean(latestRuntimeMarker)
  const actionEvents = runtimeEvents.filter((event) => !effectiveRequireSince || eventTimeMs(event) >= effectiveSinceMs)

  const adapterEvent = latest(runtimeEvents, 'stt_adapter_runtime_selected', (event) => event.source === expectedAdapterId || event.selected_adapter === 'local')
  const health = latest(runtimeEvents, 'local_stt_health_check', (event) => event.adapter_id === expectedAdapterId)
  const loopEnabled = latest(actionEvents, 'continuous_voice_session_enabled')
  const loopDisabled = latest(actionEvents, 'continuous_voice_session_disabled')
  const loopCurrentlyEnabled = Boolean(loopEnabled && (!loopDisabled || eventTimeMs(loopEnabled) > eventTimeMs(loopDisabled)))
  const loopScheduled = latest(actionEvents, 'continuous_voice_session_resume_scheduled')
  const loopResume = latest(actionEvents, 'continuous_voice_session_resume_stt')
  const loopPausedError = latest(actionEvents, 'continuous_voice_session_paused_error')
  const recoverableRetry = latest(actionEvents, 'continuous_voice_session_recoverable_error_retry')
  const blockingLoopPausedError = Boolean(
    loopPausedError &&
      (!loopEnabled || eventTimeMs(loopPausedError) > eventTimeMs(loopEnabled)) &&
      (!recoverableRetry || eventTimeMs(recoverableRetry) < eventTimeMs(loopPausedError))
  )
  const fastFail = latest(actionEvents, 'local_stt_continuous_no_voice_fast_fail', (event) => event.adapter_id === expectedAdapterId)
  const silenceDetected = latest(actionEvents, 'local_stt_silence_detected', (event) => event.adapter_id === expectedAdapterId)
  const sttStarts = actionEvents.filter((event) => event.event === 'stt_start_requested' && event.selected_adapter === 'local')
  const recordingStarts = actionEvents.filter(
    (event) => event.event === 'local_stt_recording_started' && event.adapter_id === expectedAdapterId
  )
  const transcribeRequests = actionEvents.filter(
    (event) => event.event === 'local_stt_transcribe_request' && event.adapter_id === expectedAdapterId
  )
  const successes = actionEvents.filter(
    (event) =>
      event.event === 'local_stt_transcribe_result' &&
      event.adapter_id === expectedAdapterId &&
      event.success === true &&
      Number(event.transcript_length ?? 0) > 0
  )
  const failures = actionEvents.filter(
    (event) =>
      event.event === 'local_stt_failed' ||
      event.event === 'local_stt_recording_failed' ||
      (event.event === 'local_stt_transcribe_result' && event.adapter_id === expectedAdapterId && event.success !== true) ||
      (event.event === 'local_stt_complete' && event.adapter_id === expectedAdapterId && event.success !== true)
  )

  const checks = {
    adapter_selected_local: Boolean(adapterEvent),
    health_ready: health?.status === 'ready' && health?.reachable === true,
    loop_started: Boolean(loopEnabled),
    loop_currently_enabled: loopCurrentlyEnabled,
    loop_resume_scheduled: Boolean(loopScheduled),
    loop_resume_stt: Boolean(loopResume),
    no_loop_paused_error: !blockingLoopPausedError,
    silence_does_not_hard_stop_loop: !silenceDetected || Boolean(recoverableRetry) || Boolean(loopDisabled),
    stt_started_min_turns: sttStarts.length >= minTurns,
    recording_started_min_turns: recordingStarts.length >= minTurns,
    transcribe_requested_min_turns: transcribeRequests.length >= minTurns,
    transcribe_success_min_turns: successes.length >= minTurns,
    no_stt_failure: failures.length === 0
  }
  const missing = Object.entries(checks)
    .filter(([, ok]) => !ok)
    .map(([name]) => name)

  const result = (() => {
    if (missing.length === 0) return 'passed'
    if (!adapterEvent) return 'local_adapter_not_selected'
    if (health?.status !== 'ready' || health?.reachable !== true) return 'local_stt_health_not_ready'
    if (!loopEnabled) return 'continuous_loop_not_started'
    if (recoverableRetry && sttStarts.length >= 2 && recordingStarts.length >= 2) {
      return 'continuous_loop_recoverable_retry_proved_without_transcript'
    }
    if (silenceDetected && recoverableRetry && eventTimeMs(recoverableRetry) > eventTimeMs(silenceDetected)) {
      return 'continuous_loop_recovering_after_silence'
    }
    if (silenceDetected) return loopDisabled && eventTimeMs(loopDisabled) > eventTimeMs(silenceDetected)
      ? 'continuous_loop_stopped_after_silence'
      : 'continuous_loop_silence_detected'
    if (loopDisabled && eventTimeMs(loopDisabled) > eventTimeMs(loopEnabled)) return 'continuous_loop_stopped_after_attempt'
    if (blockingLoopPausedError) return 'continuous_loop_paused_error'
    if (!loopScheduled) return 'continuous_loop_resume_not_scheduled'
    if (!loopResume) return 'continuous_loop_resume_not_seen'
    if (sttStarts.length < minTurns) return 'not_enough_stt_start_requests'
    if (recordingStarts.length < minTurns) return 'not_enough_recording_starts'
    if (transcribeRequests.length < minTurns) return 'not_enough_transcribe_requests'
    if (failures.length > 0) return 'continuous_loop_stt_failure_seen'
    return 'not_enough_successful_transcriptions'
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
      since_source: requireSince ? 'explicit' : latestRuntimeMarker ? 'latest_runtime_marker' : 'full_log',
      min_turns: minTurns,
      runtime_probe_window_count: runtimeProbeWindows.length
    },
    counts: {
      stt_start_requested: sttStarts.length,
      recording_started: recordingStarts.length,
      transcribe_requested: transcribeRequests.length,
      transcribe_success: successes.length,
      fast_no_voice_fail: count(actionEvents, (event) => event.event === 'local_stt_continuous_no_voice_fast_fail'),
      recoverable_error_retry: count(actionEvents, (event) => event.event === 'continuous_voice_session_recoverable_error_retry'),
      stt_failures: failures.length
    },
    evidence: {
      latest_runtime_marker: compactEvent(latestRuntimeMarker),
      adapter_event: compactEvent(adapterEvent),
      health: compactEvent(health),
      loop_enabled: compactEvent(loopEnabled),
      loop_disabled: compactEvent(loopDisabled),
      loop_scheduled: compactEvent(loopScheduled),
      loop_resume: compactEvent(loopResume),
      loop_paused_error: compactEvent(loopPausedError),
      blocking_loop_paused_error: compactEvent(blockingLoopPausedError ? loopPausedError : undefined),
      fast_no_voice_fail: compactEvent(fastFail),
      recoverable_retry: compactEvent(recoverableRetry),
      silence_detected: compactEvent(silenceDetected),
      latest_stt_start: compactEvent(latest(sttStarts, 'stt_start_requested')),
      latest_recording_started: compactEvent(latest(recordingStarts, 'local_stt_recording_started')),
      latest_transcribe_request: compactEvent(latest(transcribeRequests, 'local_stt_transcribe_request')),
      latest_success: compactEvent(latest(successes, 'local_stt_transcribe_result')),
      latest_failure: compactEvent(failures.sort((a, b) => eventTimeMs(b) - eventTimeMs(a))[0])
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
    (result.result === 'continuous_loop_not_started' ||
      result.result === 'continuous_loop_recoverable_retry_proved_without_transcript' ||
      result.result === 'continuous_loop_recovering_after_silence' ||
      result.result === 'continuous_loop_stopped_after_silence' ||
      result.result === 'continuous_loop_stopped_after_attempt')
  const nextAction = (() => {
    if (result.passed) return 'continuous_loop_transcription_already_proved'
    if (!result.checks.adapter_selected_local) return 'restart_real_gui_or_select_local_stt_adapter'
    if (!result.checks.health_ready) return 'start_or_fix_local_whisper_persistent_service'
    if (result.result === 'continuous_loop_not_started') return 'click_start_loop_and_speak_two_complete_chinese_sentences'
    if (result.result === 'continuous_loop_recoverable_retry_proved_without_transcript') return 'speak_two_audible_complete_chinese_sentences_to_prove_transcripts'
    if (result.result === 'continuous_loop_recovering_after_silence') return 'speak_audible_complete_chinese_sentence_on_next_listen_start'
    if (result.result === 'continuous_loop_stopped_after_silence') return 'restart_loop_and_speak_two_audible_complete_chinese_sentences'
    if (result.result === 'continuous_loop_stopped_after_attempt') return 'restart_loop_and_wait_for_next_resume'
    if (result.result === 'continuous_loop_silence_detected') return 'stop_loop_then_restart_with_audible_speech'
    if (result.result === 'continuous_loop_paused_error') return 'inspect_stt_error_then_restart_continuous_loop'
    if (result.result === 'not_enough_stt_start_requests') return 'keep_loop_enabled_and_wait_for_next_resume'
    if (result.result === 'not_enough_successful_transcriptions') return 'speak_two_audible_complete_chinese_sentences_after_each_listen_start'
    return 'continue_from_report_result'
  })()
  return {
    schema: 'status_dialogue_continuous_loop_preflight.v1',
    ready_for_operator_action: readyForOperatorAction,
    completion_proof: result.passed,
    result: result.passed
      ? 'continuous_loop_transcription_already_proved'
      : readyForOperatorAction
        ? 'ready_for_operator_continuous_loop_test'
        : result.result,
    next_action: nextAction,
    boundary:
      'preflight only; this does not prove real continuous listening until two successful local STT turns are observed'
  }
}

async function main() {
  const waitMs = Number(argValue('--wait-ms', '120000'))
  const intervalMs = Number(argValue('--interval-ms', '1000'))
  const minTurns = Math.max(1, Number(argValue('--min-turns', '2')))
  const preflightMode = hasFlag('--preflight')
  const explicitSinceMs = Number(argValue('--since-ms', 'NaN'))
  const hasExplicitSinceMs = Number.isFinite(explicitSinceMs) && explicitSinceMs > 0
  const requireSince = hasFlag('--since-now') || hasExplicitSinceMs
  const sinceMs = hasExplicitSinceMs ? explicitSinceMs : Date.now()
  const startedAt = new Date().toISOString()
  const deadlineMs = sinceMs + Math.max(0, waitMs)
  let latestResult

  do {
    latestResult = inspectContinuousLoop({ logDir: defaultLogDir, sinceMs, requireSince, minTurns })
    if (latestResult.passed) break
    if (waitMs <= 0 || Date.now() >= deadlineMs) break
    await sleep(Math.max(100, intervalMs))
  } while (true)

  const report = {
    schema: 'status_dialogue_continuous_loop_wait.v1',
    generated_at: new Date().toISOString(),
    started_at: startedAt,
    zhineng_root: zhinengRoot,
    log_dir: defaultLogDir,
    expected_adapter_id: expectedAdapterId,
    require_since: requireSince,
    since_ms: requireSince ? sinceMs : undefined,
    wait_ms: waitMs,
    min_turns: minTurns,
    result: latestResult.result,
    preflight: buildPreflight(latestResult),
    ...latestResult
  }
  const ok = report.passed || (preflightMode && report.preflight.ready_for_operator_action)

  fs.mkdirSync(outputDir, { recursive: true })
  const outputPath = path.join(outputDir, `status-dialogue-continuous-loop-wait-${Date.now()}-${process.pid}.json`)
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf8')

  console.log(
    JSON.stringify(
      {
        ok,
        outputPath,
        result: report.result,
        preflight: report.preflight,
        checks: report.checks,
        counts: report.counts,
        missing: report.missing,
        event_window: report.event_window,
        evidence: report.evidence,
        inspected_logs: report.inspected_logs,
        wait_ms: waitMs,
        min_turns: minTurns,
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
