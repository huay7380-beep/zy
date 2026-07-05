const fs = require('node:fs')
const path = require('node:path')

const repoRoot = path.resolve(__dirname, '..')
const zhinengRoot = process.env.ZHINENG_PROJECT_ROOT
  ? path.resolve(process.env.ZHINENG_PROJECT_ROOT)
  : path.resolve(repoRoot, '..')
const defaultLogDir = path.join(zhinengRoot, 'runtime', 'status-dialogue-logs')
const outputDir = path.join(repoRoot, 'runtime', 'verification-reports')
const expectedTtsBudgetRuntimeMarker = 'tts-spoken-budget-2026-07-01-v2'

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

function latest(events, name, predicate = () => true) {
  return events
    .filter((event) => event.event === name && predicate(event))
    .sort((a, b) => eventTimeMs(b) - eventTimeMs(a))[0]
}

function isRealEvent(event) {
  return event.marker_probe !== true && !event.runtime_probe
}

function compactEvent(event) {
  if (!event) return undefined
  return {
    event: event.event,
    ts: event.ts ?? event.generated_at,
    line: event.__line,
    selected_adapter: event.selected_adapter,
    source: event.source,
    adapter_id: event.adapter_id,
    status: event.status,
    success: event.success,
    latency_ms: event.latency_ms,
    transcript_length: event.transcript_length,
    total_tts_ms: event.total_tts_ms,
    total_playback_ms: event.total_playback_ms,
    end_to_end_ms: event.end_to_end_ms,
    reason: event.reason,
    error: event.error,
    target: event.target,
    active_element: event.active_element,
    is_stt_button_target: event.is_stt_button_target,
    client_x: event.client_x,
    client_y: event.client_y,
    stt_button_found: event.stt_button_found,
    stt_button_disabled: event.stt_button_disabled,
    stt_button_aria_label: event.stt_button_aria_label,
    stt_button_rect: event.stt_button_rect,
    stt_button_center: event.stt_button_center,
    stt_button_center_hit: event.stt_button_center_hit,
    pointer: event.pointer,
    pointer_hit: event.pointer_hit,
    panel_found: event.panel_found,
    panel_rect: event.panel_rect,
    entry_snapshot: event.entry_snapshot,
    window_inner_width: event.window_inner_width,
    window_inner_height: event.window_inner_height,
    file: event.__file
  }
}

function centerHitLooksLikeSttButton(event) {
  const hit = event?.stt_button_center_hit
  if (!hit || typeof hit !== 'object') return false
  const className = String(hit.class_name ?? '')
  const ariaLabel = String(hit.aria_label ?? '')
  const text = String(hit.text ?? '')
  return (
    className.includes('zg-dialogue-stt-button') ||
    ariaLabel === 'start speech input' ||
    ariaLabel === 'stop speech input' ||
    text === 'STT' ||
    text === 'stop'
  )
}

function count(events, name) {
  return events.filter((event) => event.event === name).length
}

function isSttSuccess(event) {
  if (['local_stt_complete', 'local_stt_transcribe_result', 'remote_stt_complete', 'chrome_stt_complete'].includes(event.event)) {
    return event.success === true && Number(event.transcript_length ?? 0) > 0
  }
  return false
}

function isSttFailure(event) {
  if (['local_stt_failed', 'local_stt_recording_failed', 'chrome_stt_failure'].includes(event.event)) return true
  if (['local_stt_complete', 'local_stt_transcribe_result', 'remote_stt_complete', 'chrome_stt_complete'].includes(event.event)) {
    return event.success === false
  }
  return false
}

function isSlowTtsQueue(event) {
  return (
    Number(event.end_to_end_ms ?? 0) >= 8000 ||
    Number(event.total_tts_ms ?? 0) >= 5000 ||
    Number(event.total_playback_ms ?? 0) >= 8000
  )
}

function inspectEntry({ logDir, sinceMs, requireSince, minTurns }) {
  const logs = voiceFlowLogs(logDir).slice(0, 3)
  const parseErrors = []
  const allEvents = []
  for (const log of logs) {
    const parsed = parseJsonl(log.filePath)
    parseErrors.push(...parsed.parseErrors)
    allEvents.push(...parsed.events)
  }

  const realEvents = allEvents.filter(isRealEvent)
  const markers = realEvents.filter((event) => event.event === 'status_dialogue_ui_runtime_loaded')
  const latestRuntimeMarker = latest(markers, 'status_dialogue_ui_runtime_loaded')
  const latestTtsBudgetMarker = latest(markers, 'status_dialogue_ui_runtime_loaded', (event) => {
    return event.tts_spoken_budget_marker === expectedTtsBudgetRuntimeMarker
  })
  const effectiveMarker = latestTtsBudgetMarker ?? latestRuntimeMarker
  const effectiveSinceMs = requireSince ? sinceMs : eventTimeMs(effectiveMarker)
  const actionEvents = realEvents
    .filter((event) => !effectiveSinceMs || eventTimeMs(event) >= effectiveSinceMs)
    .sort((a, b) => eventTimeMs(a) - eventTimeMs(b))

  const globalPointerEvents = actionEvents.filter((event) => event.event === 'status_dialogue_global_pointer_down')
  const globalPointerSttTargets = globalPointerEvents.filter((event) => event.is_stt_button_target === true)
  const entrySnapshotEvents = actionEvents.filter((event) => event.event === 'status_dialogue_stt_entry_snapshot')
  const latestEntrySnapshot = entrySnapshotEvents.at(-1)
  const entrySnapshotButtonFound = latestEntrySnapshot?.stt_button_found === true
  const entrySnapshotButtonDisabled = latestEntrySnapshot?.stt_button_disabled === true
  const entrySnapshotCenterHitOk = centerHitLooksLikeSttButton(latestEntrySnapshot)
  const pointerDownEvents = actionEvents.filter((event) => event.event === 'stt_button_pointer_down')
  const clickEvents = actionEvents.filter((event) => event.event === 'stt_button_click')
  const clickStartFailedEvents = actionEvents.filter((event) => event.event === 'stt_button_click_start_failed')
  const startEvents = actionEvents.filter((event) => event.event === 'stt_start_requested')
  const recordingRequests = actionEvents.filter((event) => event.event === 'local_stt_recording_start_request')
  const recordingStarted = actionEvents.filter((event) => event.event === 'local_stt_recording_started')
  const voiceDetected = actionEvents.filter((event) => event.event === 'local_stt_voice_detected')
  const recordingStopped = actionEvents.filter((event) => event.event === 'local_stt_recording_stopped')
  const transcribeRequests = actionEvents.filter((event) => event.event === 'local_stt_transcribe_request')
  const sttSuccesses = actionEvents.filter(isSttSuccess)
  const sttFailures = actionEvents.filter(isSttFailure)
  const dialogueEvents = actionEvents.filter((event) =>
    ['dialogue_input_dequeued', 'dialogue_input_dequeued_after_tts_complete', 'model_stream_delta_received'].includes(event.event) ||
    String(event.source ?? '').includes('fallback')
  )
  const ttsQueues = actionEvents.filter((event) => event.event === 'tts_queue_complete')
  const slowTtsQueues = ttsQueues.filter(isSlowTtsQueue)
  const xiaozhiEvents = actionEvents.filter((event) => event.event === 'xiaozhi_style_voice_bridge_event')

  const checks = {
    real_runtime_marker_seen: Boolean(latestRuntimeMarker),
    real_tts_budget_marker_seen: Boolean(latestTtsBudgetMarker),
    graph_window_pointer_seen: globalPointerEvents.length >= minTurns,
    graph_window_pointer_on_stt_seen: globalPointerSttTargets.length >= minTurns,
    button_pointer_seen: pointerDownEvents.length >= minTurns,
    button_click_seen: clickEvents.length >= minTurns,
    click_handler_no_rejection: clickStartFailedEvents.length === 0,
    stt_start_seen: startEvents.length >= minTurns,
    recording_request_seen: recordingRequests.length >= minTurns,
    recording_started_seen: recordingStarted.length >= minTurns,
    voice_detected_seen: voiceDetected.length >= minTurns,
    recording_stopped_seen: recordingStopped.length >= minTurns,
    transcribe_request_seen: transcribeRequests.length >= minTurns,
    stt_success_seen: sttSuccesses.length >= minTurns,
    no_stt_failure_seen: sttFailures.length === 0,
    dialogue_chain_seen: dialogueEvents.length > 0,
    tts_queue_seen: ttsQueues.length >= minTurns,
    no_slow_tts_queue_seen: slowTtsQueues.length === 0,
    xiaozhi_events_seen: xiaozhiEvents.length > 0
  }

  const result = (() => {
    if (!latestRuntimeMarker) return 'no_real_runtime_marker'
    if (!latestTtsBudgetMarker) return 'real_tts_budget_marker_missing'
    if (pointerDownEvents.length < minTurns && clickEvents.length < minTurns && startEvents.length < minTurns) {
      if (entrySnapshotEvents.length > 0 && !entrySnapshotButtonFound) return 'stt_button_not_rendered_after_marker'
      if (entrySnapshotButtonDisabled) return 'stt_button_disabled_after_marker'
      if (entrySnapshotButtonFound && !entrySnapshotCenterHitOk) return 'stt_button_center_obstructed_after_marker'
      if (entrySnapshotButtonFound && entrySnapshotCenterHitOk && globalPointerEvents.length < minTurns) {
        return 'stt_button_visible_without_real_pointer_after_marker'
      }
      if (globalPointerEvents.length < minTurns) return 'no_graph_window_pointer_activity_after_marker'
      if (globalPointerSttTargets.length < minTurns) return 'graph_window_pointer_not_on_stt_button'
      return 'stt_target_pointer_without_button_handler'
    }
    if (pointerDownEvents.length >= minTurns && clickEvents.length < minTurns) return 'pointer_without_click'
    if (clickStartFailedEvents.length > 0) return 'click_handler_rejected'
    if (clickEvents.length >= minTurns && startEvents.length < minTurns) return 'click_without_start_speech'
    if (startEvents.length >= minTurns && recordingRequests.length < minTurns) return 'start_without_recording_request'
    if (recordingRequests.length >= minTurns && recordingStarted.length < minTurns) return 'recording_request_without_started'
    if (recordingStarted.length >= minTurns && sttFailures.length > 0) return 'stt_failure_seen'
    if (recordingStarted.length >= minTurns && sttSuccesses.length < minTurns) return 'recording_without_enough_success'
    if (sttSuccesses.length >= minTurns && dialogueEvents.length === 0) return 'stt_success_without_dialogue_chain'
    if (dialogueEvents.length > 0 && ttsQueues.length < minTurns) return 'dialogue_without_enough_tts_queue'
    if (slowTtsQueues.length > 0) return 'slow_tts_queue_seen'
    if (Object.values(checks).every(Boolean)) return 'passed'
    return 'entry_chain_partially_observed'
  })()

  const nextAction = (() => {
    if (result === 'passed') return 'real_gui_stt_entry_chain_proved'
    if (result === 'no_real_runtime_marker') return 'restart_right_bottom_gui'
    if (result === 'real_tts_budget_marker_missing') return 'restart_gui_with_latest_tts_budget_build'
    if (result === 'stt_button_not_rendered_after_marker') return 'inspect_dialogue_panel_rendering_or_stt_button_ref'
    if (result === 'stt_button_disabled_after_marker') return 'inspect_voice_listening_busy_or_disabled_state'
    if (result === 'stt_button_center_obstructed_after_marker') return 'inspect_overlay_z_index_or_button_hit_target'
    if (result === 'stt_button_visible_without_real_pointer_after_marker') return 'click_reported_stt_button_center_or_check_external_window_focus'
    if (result === 'no_graph_window_pointer_activity_after_marker') return 'click_inside_right_bottom_gui_or_check_window_focus_overlay'
    if (result === 'graph_window_pointer_not_on_stt_button') return 'click_exact_stt_button_or_inspect_dialogue_panel_layout'
    if (result === 'stt_target_pointer_without_button_handler') return 'inspect_stt_button_handler_or_css_pointer_events'
    if (result === 'pointer_without_click') return 'inspect_button_overlay_or_pointer_capture_preventing_click'
    if (result === 'click_without_start_speech') return 'inspect_click_handler_startSpeechRecognition_binding'
    if (result === 'start_without_recording_request') return 'inspect_selected_stt_adapter_and_remote_cloud_fallback_gate'
    if (result === 'recording_request_without_started') return 'inspect_microphone_permission_or_media_recorder_start'
    if (result === 'recording_without_enough_success') return 'inspect_vad_audio_level_and_transcribe_result'
    if (result === 'stt_success_without_dialogue_chain') return 'inspect_dialogue_submit_after_transcript'
    if (result === 'dialogue_without_enough_tts_queue') return 'inspect_tts_queue_submission_or_voice_off_state'
    if (result === 'slow_tts_queue_seen') return 'inspect_latest_tts_latency_segments'
    return 'continue_from_entry_report_result'
  })()

  const missing = Object.entries(checks)
    .filter(([, ok]) => !ok)
    .map(([name]) => name)

  return {
    passed: result === 'passed',
    result,
    next_action: nextAction,
    checks,
    missing,
    event_window: {
      real_event_count: realEvents.length,
      action_event_count: actionEvents.length,
      since_ms: effectiveSinceMs || undefined,
      since_source: requireSince
        ? 'explicit'
        : latestTtsBudgetMarker
          ? 'latest_real_tts_budget_marker'
          : latestRuntimeMarker
            ? 'latest_real_runtime_marker'
            : 'full_log',
      min_turns: minTurns
    },
    counts: {
      global_pointer: globalPointerEvents.length,
      global_pointer_stt_target: globalPointerSttTargets.length,
      entry_snapshot: entrySnapshotEvents.length,
      pointer_down: pointerDownEvents.length,
      click: clickEvents.length,
      click_start_failed: clickStartFailedEvents.length,
      stt_start: startEvents.length,
      recording_request: recordingRequests.length,
      recording_started: recordingStarted.length,
      voice_detected: voiceDetected.length,
      recording_stopped: recordingStopped.length,
      transcribe_request: transcribeRequests.length,
      stt_success: sttSuccesses.length,
      stt_failure: sttFailures.length,
      dialogue_chain: dialogueEvents.length,
      tts_queue: ttsQueues.length,
      slow_tts_queue: slowTtsQueues.length,
      xiaozhi_event: xiaozhiEvents.length
    },
    latest: {
      runtime_marker: compactEvent(latestRuntimeMarker),
      tts_budget_marker: compactEvent(latestTtsBudgetMarker),
      global_pointer: compactEvent(globalPointerEvents.at(-1)),
      global_pointer_stt_target: compactEvent(globalPointerSttTargets.at(-1)),
      entry_snapshot: compactEvent(latestEntrySnapshot),
      pointer_down: compactEvent(pointerDownEvents.at(-1)),
      click: compactEvent(clickEvents.at(-1)),
      click_start_failed: compactEvent(clickStartFailedEvents.at(-1)),
      stt_start: compactEvent(startEvents.at(-1)),
      recording_request: compactEvent(recordingRequests.at(-1)),
      recording_started: compactEvent(recordingStarted.at(-1)),
      voice_detected: compactEvent(voiceDetected.at(-1)),
      transcribe_request: compactEvent(transcribeRequests.at(-1)),
      stt_success: compactEvent(sttSuccesses.at(-1)),
      stt_failure: compactEvent(sttFailures.at(-1)),
      dialogue: compactEvent(dialogueEvents.at(-1)),
      tts_queue: compactEvent(ttsQueues.at(-1)),
      slow_tts_queue: compactEvent(slowTtsQueues.at(-1))
    },
    inspected_logs: logs.map((log) => log.filePath),
    parse_errors: parseErrors
  }
}

async function main() {
  const waitMs = Math.max(0, Number(argValue('--wait-ms', '0')))
  const intervalMs = Math.max(100, Number(argValue('--interval-ms', '1000')))
  const minTurns = Math.max(1, Number(argValue('--min-turns', '2')))
  const preflightMode = hasFlag('--preflight')
  const explicitSinceMs = Number(argValue('--since-ms', 'NaN'))
  const hasExplicitSinceMs = Number.isFinite(explicitSinceMs) && explicitSinceMs > 0
  const requireSince = hasFlag('--since-now') || hasExplicitSinceMs
  const sinceMs = hasExplicitSinceMs ? explicitSinceMs : Date.now()
  const startedAt = new Date().toISOString()
  const deadlineMs = Date.now() + waitMs
  let latestResult

  do {
    latestResult = inspectEntry({ logDir: defaultLogDir, sinceMs, requireSince, minTurns })
    if (latestResult.passed) break
    if (waitMs <= 0 || Date.now() >= deadlineMs) break
    await sleep(intervalMs)
  } while (true)

  const report = {
    schema: 'status_dialogue_real_stt_entry_diagnosis.v1',
    generated_at: new Date().toISOString(),
    started_at: startedAt,
    zhineng_root: zhinengRoot,
    log_dir: defaultLogDir,
    boundary: 'read-only runtime log diagnosis; no microphone open; no audio upload; no world write',
    require_since: requireSince,
    since_ms: requireSince ? sinceMs : undefined,
    wait_ms: waitMs,
    min_turns: minTurns,
    ...latestResult
  }
  const ok = report.passed || preflightMode

  fs.mkdirSync(outputDir, { recursive: true })
  const outputPath = path.join(outputDir, `status-dialogue-real-stt-entry-diagnosis-${Date.now()}.json`)
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf8')

  console.log(
    JSON.stringify(
      {
        ok,
        outputPath,
        result: report.result,
        next_action: report.next_action,
        checks: report.checks,
        missing: report.missing,
        counts: report.counts,
        latest: report.latest,
        event_window: report.event_window,
        boundary: report.boundary
      },
      null,
      2
    )
  )

  if (!ok) process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
