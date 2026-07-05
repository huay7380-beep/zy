const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')

const repoRoot = path.resolve(__dirname, '..')
const zhinengRoot = process.env.ZHINENG_PROJECT_ROOT
  ? path.resolve(process.env.ZHINENG_PROJECT_ROOT)
  : path.resolve(repoRoot, '..')
const defaultLogDir = path.join(zhinengRoot, 'runtime', 'status-dialogue-logs')
const outputDir = path.join(repoRoot, 'runtime', 'verification-reports')
const expectedRuntimeFixMarker = 'stt-local-observability-2026-06-29-v3'
const expectedTtsBudgetRuntimeMarker = 'tts-spoken-budget-2026-07-01-v2'
const ttsFinalVoiceBudgetEventNames = new Set([
  'tts_final_voice_budget_applied',
  'tts_shortest_voice_path_selected'
])

function argValue(name, fallback) {
  const index = process.argv.indexOf(name)
  if (index === -1 || index + 1 >= process.argv.length) return fallback
  return process.argv[index + 1]
}

function hasFlag(name) {
  return process.argv.includes(name)
}

function latestVoiceFlowLog(logDir) {
  if (!fs.existsSync(logDir)) return undefined
  return fs
    .readdirSync(logDir)
    .filter((name) => /^voice-flow-\d{8}\.jsonl$/.test(name))
    .map((name) => {
      const filePath = path.join(logDir, name)
      return { filePath, mtimeMs: fs.statSync(filePath).mtimeMs }
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs)[0]?.filePath
}

function parseJsonl(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return { events: [], parseErrors: [], lineCount: 0 }
  }

  const lines = fs
    .readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
  const events = []
  const parseErrors = []

  for (const [index, line] of lines.entries()) {
    try {
      events.push(JSON.parse(line))
    } catch (error) {
      parseErrors.push({
        line: index + 1,
        error: String(error?.message ?? error).slice(0, 240)
      })
    }
  }

  return { events, parseErrors, lineCount: lines.length }
}

function eventText(event) {
  return [
    event.event,
    event.type,
    event.stage,
    event.source,
    event.reason,
    event.adapter_id,
    event.voice_profile_id,
    event.error,
    event.fallback,
    event.fallback_reason,
    event.text,
    ...(Array.isArray(event.refs) ? event.refs : [])
  ]
    .filter(Boolean)
    .join(' ')
}

function isTtsFinalVoiceBudgetEvent(event) {
  return ttsFinalVoiceBudgetEventNames.has(event.event)
}

function eventIncludesAny(event, needles) {
  const text = eventText(event)
  return needles.some((needle) => text.includes(needle))
}

function maxNumber(events, field) {
  const values = events.map((event) => event[field]).filter((value) => typeof value === 'number')
  return values.length ? Math.max(...values) : 0
}

function averageNumber(events, field) {
  const values = events.map((event) => event[field]).filter((value) => typeof value === 'number')
  if (!values.length) return 0
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
}

function percentileNumber(events, field, percentile) {
  const values = events
    .map((event) => event[field])
    .filter((value) => typeof value === 'number')
    .sort((a, b) => a - b)
  if (!values.length) return 0
  const index = Math.min(values.length - 1, Math.max(0, Math.ceil((percentile / 100) * values.length) - 1))
  return values[index]
}

function latestByTime(events) {
  return [...events].sort((a, b) => eventTimeMs(b) - eventTimeMs(a))[0]
}

function countBy(events, field) {
  return events.reduce((acc, event) => {
    const key = event[field] ?? 'unknown'
    acc[key] = (acc[key] ?? 0) + 1
    return acc
  }, {})
}

function eventTimeMs(event) {
  const raw = typeof event.ts === 'string' ? event.ts : typeof event.generated_at === 'string' ? event.generated_at : undefined
  const ms = raw ? Date.parse(raw) : NaN
  return Number.isFinite(ms) ? ms : 0
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

function buildAudit(events, parseErrors, lineCount, logPath) {
  const runtimeProbeWindows = buildRuntimeProbeWindows(events)
  const runtimeLoadedEvents = events.filter((event) => event.event === 'status_dialogue_ui_runtime_loaded')
  const latestRuntimeLoadedEvent = runtimeLoadedEvents.at(-1)
  const isRuntimeProbe = (event) => {
    if (event.marker_probe === true || event.runtime_probe) return true
    const timeMs = eventTimeMs(event)
    if (!timeMs) return false
    return runtimeProbeWindows.some((window) => timeMs >= window.startMs && timeMs <= window.endMs)
  }
  const isRealRuntimeEvent = (event) => event.marker_probe !== true && !isRuntimeProbe(event)
  const probeRuntimeLoadedEvents = runtimeLoadedEvents.filter((event) => event.marker_probe === true || isRuntimeProbe(event))
  const realRuntimeLoadedEvents = runtimeLoadedEvents.filter(isRealRuntimeEvent)
  const latestRealRuntimeLoadedEvent = realRuntimeLoadedEvents.at(-1)
  const latestProbeRuntimeLoadedEvent = probeRuntimeLoadedEvents.at(-1)
  const ttsBudgetRuntimeLoadedEvents = runtimeLoadedEvents.filter(
    (event) => event.tts_spoken_budget_marker === expectedTtsBudgetRuntimeMarker
  )
  const realTtsBudgetRuntimeLoadedEvents = realRuntimeLoadedEvents.filter(
    (event) => event.tts_spoken_budget_marker === expectedTtsBudgetRuntimeMarker
  )
  const probeTtsBudgetRuntimeLoadedEvents = probeRuntimeLoadedEvents.filter(
    (event) => event.tts_spoken_budget_marker === expectedTtsBudgetRuntimeMarker
  )
  const latestRealRuntimeLoadedMs = latestRealRuntimeLoadedEvent ? eventTimeMs(latestRealRuntimeLoadedEvent) : 0
  const currentRealEvents =
    latestRealRuntimeLoadedMs > 0
      ? events.filter((event) => isRealRuntimeEvent(event) && eventTimeMs(event) >= latestRealRuntimeLoadedMs)
      : events.filter(isRealRuntimeEvent)
  const latestContinuousTwoTurnWindow = runtimeProbeWindows
    .filter((window) => window.probe === 'continuous_voice_two_turn')
    .sort((a, b) => b.startMs - a.startMs)[0]
  const latestTtsVoiceBudgetWindow = runtimeProbeWindows
    .filter((window) => window.probe === 'tts_voice_budget')
    .sort((a, b) => b.startMs - a.startMs)[0]
  const latestSttClickDuringTtsWindow = runtimeProbeWindows
    .filter((window) => window.probe === 'stt_click_during_tts')
    .sort((a, b) => b.startMs - a.startMs)[0]
  const latestContinuousTwoTurnEvents = latestContinuousTwoTurnWindow
    ? events.filter((event) => {
        const timeMs = eventTimeMs(event)
        return timeMs >= latestContinuousTwoTurnWindow.startMs && timeMs <= latestContinuousTwoTurnWindow.endMs
      })
    : []
  const latestTtsVoiceBudgetEvents = latestTtsVoiceBudgetWindow
    ? events.filter((event) => {
        const timeMs = eventTimeMs(event)
        return timeMs >= latestTtsVoiceBudgetWindow.startMs && timeMs <= latestTtsVoiceBudgetWindow.endMs
      })
    : []
  const latestSttClickDuringTtsEvents = latestSttClickDuringTtsWindow
    ? events.filter((event) => {
        const timeMs = eventTimeMs(event)
        return timeMs >= latestSttClickDuringTtsWindow.startMs && timeMs <= latestSttClickDuringTtsWindow.endMs
      })
    : []
  const chromeSttEvents = events.filter((event) => event.event === 'chrome_stt_complete')
  const chromeSttSuccesses = chromeSttEvents.filter((event) => event.success === true)
  const chromeSttFailures = chromeSttEvents.filter((event) => event.success === false)
  const remoteSttHealthEvents = events.filter((event) => event.event === 'remote_stt_health_check')
  const remoteSttStartEvents = events.filter((event) => event.event === 'remote_stt_start')
  const remoteSttCompleteEvents = events.filter((event) => event.event === 'remote_stt_complete')
  const remoteSttSuccesses = remoteSttCompleteEvents.filter((event) => event.success === true)
  const remoteSttFailures = remoteSttCompleteEvents.filter((event) => event.success !== true)
  const localSttEvidenceEvents = events.filter(
    (event) =>
      isRealRuntimeEvent(event) &&
      [
        'local_stt_health_request',
        'local_stt_health_result',
        'local_stt_recording_start_request',
        'local_stt_recording_started',
        'local_stt_recording_stopped',
        'local_stt_recording_failed',
        'local_stt_voice_detected',
        'local_stt_low_signal_candidate',
        'local_stt_low_signal_transcribe_allowed',
        'local_stt_borderline_transcribe_allowed',
        'local_stt_silence_detected',
        'local_stt_transcribe_request',
        'local_stt_transcribe_result',
        'local_stt_start',
        'local_stt_complete',
        'local_stt_failed',
        'local_stt_service_ready',
        'local_stt_service_fallback',
        'local_stt_health_check'
      ].includes(event.event)
  )
  const localAdapterSelectionEvents = events.filter(
    (event) => isRealRuntimeEvent(event) && event.event === 'stt_adapter_runtime_selected' && event.selected_adapter === 'local'
  )
  const cloudAdapterSelectionEvents = events.filter(
    (event) => isRealRuntimeEvent(event) && event.event === 'stt_adapter_runtime_selected' && event.selected_adapter === 'cloud'
  )
  const remoteAdapterSelectionEvents = events.filter(
    (event) => isRealRuntimeEvent(event) && event.event === 'stt_adapter_runtime_selected' && event.selected_adapter === 'remote'
  )
  const probeAdapterSelectionEvents = events.filter(
    (event) => (event.marker_probe === true || isRuntimeProbe(event)) && event.event === 'stt_adapter_runtime_selected'
  )
  const localRecordingEvents = events.filter((event) =>
    isRealRuntimeEvent(event) &&
    [
      'local_stt_recording_start_request',
      'local_stt_recording_started',
      'local_stt_recording_stopped',
      'local_stt_recording_failed',
      'local_stt_voice_detected',
      'local_stt_low_signal_candidate',
      'local_stt_low_signal_transcribe_allowed',
      'local_stt_borderline_transcribe_allowed',
      'local_stt_silence_detected'
    ].includes(event.event)
  )
  const localTranscriptionEvents = events.filter((event) =>
    isRealRuntimeEvent(event) &&
    ['local_stt_transcribe_request', 'local_stt_transcribe_result', 'local_stt_start', 'local_stt_complete', 'local_stt_failed'].includes(event.event)
  )
  const localVoiceDetectedEvents = localRecordingEvents.filter((event) => event.event === 'local_stt_voice_detected')
  const localLowSignalCandidateEvents = localRecordingEvents.filter((event) => event.event === 'local_stt_low_signal_candidate')
  const localLowSignalTranscribeAllowedEvents = localRecordingEvents.filter((event) => event.event === 'local_stt_low_signal_transcribe_allowed')
  const localBorderlineTranscribeAllowedEvents = localRecordingEvents.filter((event) => event.event === 'local_stt_borderline_transcribe_allowed')
  const localSilenceDetectedEvents = localRecordingEvents.filter((event) => event.event === 'local_stt_silence_detected')
  const cloudRetryOneShotEvents = events.filter((event) => event.event === 'cloud_stt_retry_one_shot')
  const xiaozhiEvents = events.filter((event) => event.event === 'xiaozhi_style_voice_bridge_event')
  const ttsSynthesisEvents = events.filter((event) => event.event === 'tts_synthesis_complete')
  const ttsQueueCompleteEvents = events.filter((event) => event.event === 'tts_queue_complete')
  const currentRealTtsQueueCompleteEvents = currentRealEvents.filter((event) => event.event === 'tts_queue_complete')
  const latestContinuousTwoTurnTtsQueueCompleteEvents = latestContinuousTwoTurnEvents.filter(
    (event) => event.event === 'tts_queue_complete'
  )
  const latestContinuousTwoTurnTtsTimeoutEvents = latestContinuousTwoTurnEvents.filter(
    (event) => event.event === 'tts_stream_frame_wait_timeout'
  )
  const ttsCacheHits = events.filter((event) => event.event === 'tts_chunk_cache_hit' || event.event === 'tts_synthesis_cache_hit')
  const ttsStreamBudgetSkipEvents = events.filter((event) => event.event === 'tts_stream_sentence_skipped_by_voice_budget')
  const ttsFinalVoiceBudgetEvents = events.filter(isTtsFinalVoiceBudgetEvent)
  const ttsShortestVoicePathEvents = events.filter((event) => event.event === 'tts_shortest_voice_path_selected')
  const latestTtsVoiceBudgetFinalEvents = latestTtsVoiceBudgetEvents.filter(isTtsFinalVoiceBudgetEvent)
  const latestTtsVoiceBudgetShortestEvents = latestTtsVoiceBudgetEvents.filter(
    (event) => event.event === 'tts_shortest_voice_path_selected'
  )
  const latestTtsVoiceBudgetQueueCompleteEvents = latestTtsVoiceBudgetEvents.filter(
    (event) => event.event === 'tts_queue_complete'
  )
  const latestTtsVoiceBudgetCompleteEvent = latestByTime(
    latestTtsVoiceBudgetEvents.filter((event) => event.event === 'status_dialogue_tts_voice_budget_probe_complete')
  )
  const latestSttClickDuringTtsCompleteEvent = latestByTime(
    latestSttClickDuringTtsEvents.filter((event) => event.event === 'status_dialogue_stt_click_during_tts_probe_complete')
  )
  const latestSttClickDuringTtsInterruptEvents = latestSttClickDuringTtsEvents.filter((event) =>
    ['voice_playback_interrupted_for_formal_input', 'tts_queue_interrupted'].includes(event.event)
  )
  const latestSttClickDuringTtsTranscribeEvents = latestSttClickDuringTtsEvents.filter((event) =>
    ['local_stt_transcribe_request', 'local_stt_transcribe_result'].includes(event.event)
  )
  const latestTtsVoiceBudgetSlowQueueEvents = latestTtsVoiceBudgetQueueCompleteEvents.filter(
    (event) =>
      Number(event.end_to_end_ms ?? 0) >= 8_000 ||
      Number(event.total_tts_ms ?? 0) >= 5_000 ||
      Number(event.total_playback_ms ?? 0) >= 8_000
  )
  const inputQueuedEvents = events.filter((event) => event.event === 'stt_input_queued' || event.event === 'dialogue_input_queued')
  const inputDequeuedEvents = events.filter(
    (event) => event.event === 'dialogue_input_dequeued' || event.event === 'dialogue_input_dequeued_after_tts_complete'
  )
  const staleSkipEvents = events.filter((event) =>
    ['tts_chunk_skipped_stale_after_synthesis', 'tts_queue_interrupted'].includes(event.event)
  )
  const formalInterruptEvents = events.filter((event) =>
    ['voice_playback_interrupted_for_formal_input', 'dialogue_input_barge_in'].includes(event.event)
  )
  const controlledTtsInputProbeEvents = events.filter((event) => event.runtime_probe === 'tts_input_interrupt')
  const slowTtsEvents = ttsSynthesisEvents.filter((event) => event.latency_ms >= 10_000)
  const slowTtsQueueEvents = ttsQueueCompleteEvents.filter(
    (event) =>
      Number(event.end_to_end_ms ?? 0) >= 8_000 ||
      Number(event.total_tts_ms ?? 0) >= 5_000 ||
      Number(event.total_playback_ms ?? 0) >= 8_000
  )
  const currentRealSlowTtsQueueEvents = currentRealTtsQueueCompleteEvents.filter(
    (event) =>
      Number(event.end_to_end_ms ?? 0) >= 8_000 ||
      Number(event.total_tts_ms ?? 0) >= 5_000 ||
      Number(event.total_playback_ms ?? 0) >= 8_000
  )
  const latestContinuousTwoTurnSlowTtsQueueEvents = latestContinuousTwoTurnTtsQueueCompleteEvents.filter(
    (event) =>
      Number(event.end_to_end_ms ?? 0) >= 8_000 ||
      Number(event.total_tts_ms ?? 0) >= 5_000 ||
      Number(event.total_playback_ms ?? 0) >= 8_000
  )
  const slowCloudSttEvents = chromeSttSuccesses.filter((event) => event.latency_ms >= 5_000)
  const queueWaitEvents = inputDequeuedEvents.filter((event) => typeof event.age_ms === 'number')

  const dominantSttPath =
    chromeSttEvents.length > 0 && localSttEvidenceEvents.length > 0
      ? 'mixed'
      : localSttEvidenceEvents.length > 0
        ? 'local'
        : chromeSttEvents.length > 0
          ? 'cloud'
          : 'none'

  const xiaozhiTypes = Array.from(new Set(xiaozhiEvents.map((event) => event.type).filter(Boolean))).sort()
  const xiaozhiRequiredTypes = [
    'hello',
    'listen_start',
    'listen_detect',
    'stt_result',
    'llm_start',
    'tts_start',
    'tts_stop'
  ]
  const xiaozhiMissingTypes = xiaozhiRequiredTypes.filter((type) => !xiaozhiTypes.includes(type))

  const checks = {
    log_file_found: Boolean(logPath && fs.existsSync(logPath)),
    jsonl_parsed_without_errors: parseErrors.length === 0 && lineCount > 0,
    expected_runtime_fix_marker_seen: runtimeLoadedEvents.some(
      (event) => event.runtime_fix_marker === expectedRuntimeFixMarker
    ),
    probe_runtime_fix_marker_seen: probeRuntimeLoadedEvents.some(
      (event) => event.runtime_fix_marker === expectedRuntimeFixMarker
    ),
    real_gui_runtime_fix_marker_seen: realRuntimeLoadedEvents.some(
      (event) => event.runtime_fix_marker === expectedRuntimeFixMarker
    ),
    expected_tts_budget_runtime_marker_seen: ttsBudgetRuntimeLoadedEvents.length > 0,
    probe_tts_budget_runtime_marker_seen: probeTtsBudgetRuntimeLoadedEvents.length > 0,
    real_gui_tts_budget_runtime_marker_seen: realTtsBudgetRuntimeLoadedEvents.length > 0,
    latest_runtime_tts_budget_caps_seen:
      latestRuntimeLoadedEvent?.tts_spoken_budget_marker === expectedTtsBudgetRuntimeMarker &&
      latestRuntimeLoadedEvent?.tts_budget_final_cap_enabled === true &&
      latestRuntimeLoadedEvent?.tts_event_broadcast_voice_max_chars === 24 &&
      latestRuntimeLoadedEvent?.tts_final_voice_max_chars === 44,
    latest_real_tts_budget_caps_seen:
      latestRealRuntimeLoadedEvent?.tts_spoken_budget_marker === expectedTtsBudgetRuntimeMarker &&
      latestRealRuntimeLoadedEvent?.tts_budget_final_cap_enabled === true &&
      latestRealRuntimeLoadedEvent?.tts_event_broadcast_voice_max_chars === 24 &&
      latestRealRuntimeLoadedEvent?.tts_final_voice_max_chars === 44,
    xiaozhi_bridge_events_seen: xiaozhiEvents.length > 0,
    xiaozhi_core_stages_seen: xiaozhiMissingTypes.length === 0,
    cloud_stt_events_seen: chromeSttEvents.length > 0,
    cloud_stt_success_seen: chromeSttSuccesses.length > 0,
    remote_stt_health_seen: remoteSttHealthEvents.length > 0,
    remote_stt_events_seen: remoteSttStartEvents.length > 0 || remoteSttCompleteEvents.length > 0,
    remote_stt_success_seen: remoteSttSuccesses.length > 0,
    local_stt_events_seen: localSttEvidenceEvents.length > 0,
    local_stt_adapter_selected_seen: localAdapterSelectionEvents.length > 0,
    local_stt_recording_seen: localRecordingEvents.length > 0,
    local_stt_transcription_seen: localTranscriptionEvents.length > 0,
    cloud_retry_one_shot_seen: cloudRetryOneShotEvents.length > 0,
    input_queue_events_seen: inputQueuedEvents.length > 0,
    input_dequeue_events_seen: inputDequeuedEvents.length > 0,
    formal_input_interrupt_seen: formalInterruptEvents.length > 0,
    stale_tts_skip_or_interrupt_seen: staleSkipEvents.length > 0,
    slow_tts_synthesis_seen: slowTtsEvents.length > 0,
    slow_tts_queue_seen: slowTtsQueueEvents.length > 0,
    current_real_slow_tts_queue_seen: currentRealSlowTtsQueueEvents.length > 0,
    latest_continuous_two_turn_tts_queue_fast_seen:
      latestContinuousTwoTurnTtsQueueCompleteEvents.length > 0 &&
      latestContinuousTwoTurnSlowTtsQueueEvents.length === 0 &&
      latestContinuousTwoTurnTtsTimeoutEvents.length === 0,
    tts_voice_budget_events_seen: ttsStreamBudgetSkipEvents.length > 0 || ttsFinalVoiceBudgetEvents.length > 0,
    latest_tts_voice_budget_probe_complete_seen: Boolean(latestTtsVoiceBudgetCompleteEvent),
    latest_tts_voice_budget_final_cap_seen:
      latestTtsVoiceBudgetFinalEvents.length > 0 &&
      maxNumber(latestTtsVoiceBudgetFinalEvents, 'final_voice_length') <= 58 &&
      maxNumber(latestTtsVoiceBudgetFinalEvents, 'event_voice_length') <= 36,
    latest_tts_voice_budget_queue_fast_seen:
      latestTtsVoiceBudgetQueueCompleteEvents.length > 0 && latestTtsVoiceBudgetSlowQueueEvents.length === 0,
    latest_stt_click_during_tts_probe_complete_seen: Boolean(latestSttClickDuringTtsCompleteEvent),
    latest_stt_click_during_tts_interrupt_seen:
      latestSttClickDuringTtsInterruptEvents.some((event) => event.event === 'voice_playback_interrupted_for_formal_input') &&
      latestSttClickDuringTtsInterruptEvents.some((event) => event.event === 'tts_queue_interrupted'),
    latest_stt_click_during_tts_local_transcription_seen:
      latestSttClickDuringTtsTranscribeEvents.some((event) => event.event === 'local_stt_transcribe_request') &&
      latestSttClickDuringTtsTranscribeEvents.some((event) => event.event === 'local_stt_transcribe_result'),
    slow_cloud_stt_seen: slowCloudSttEvents.length > 0,
    edge_tts_low_latency_default_seen:
      latestRuntimeLoadedEvent?.edge_tts_low_latency_default === true ||
      latestRealRuntimeLoadedEvent?.edge_tts_low_latency_default === true
  }

  const metrics = {
    event_count: events.length,
    line_count: lineCount,
    expected_runtime_fix_marker: expectedRuntimeFixMarker,
    expected_tts_budget_runtime_marker: expectedTtsBudgetRuntimeMarker,
    runtime_probe_windows: runtimeProbeWindows,
    latest_runtime_fix_marker: latestRuntimeLoadedEvent?.runtime_fix_marker ?? 'missing',
    latest_real_runtime_fix_marker: latestRealRuntimeLoadedEvent?.runtime_fix_marker ?? 'missing',
    latest_probe_runtime_fix_marker: latestProbeRuntimeLoadedEvent?.runtime_fix_marker ?? 'missing',
    latest_runtime_tts_budget_marker: latestRuntimeLoadedEvent?.tts_spoken_budget_marker ?? 'missing',
    latest_real_runtime_tts_budget_marker: latestRealRuntimeLoadedEvent?.tts_spoken_budget_marker ?? 'missing',
    latest_probe_runtime_tts_budget_marker: latestProbeRuntimeLoadedEvent?.tts_spoken_budget_marker ?? 'missing',
    latest_runtime_tts_final_voice_max_chars: latestRuntimeLoadedEvent?.tts_final_voice_max_chars ?? 0,
    latest_real_tts_final_voice_max_chars: latestRealRuntimeLoadedEvent?.tts_final_voice_max_chars ?? 0,
    latest_probe_tts_final_voice_max_chars: latestProbeRuntimeLoadedEvent?.tts_final_voice_max_chars ?? 0,
    latest_runtime_tts_event_broadcast_voice_max_chars:
      latestRuntimeLoadedEvent?.tts_event_broadcast_voice_max_chars ?? 0,
    latest_real_tts_event_broadcast_voice_max_chars:
      latestRealRuntimeLoadedEvent?.tts_event_broadcast_voice_max_chars ?? 0,
    latest_probe_tts_event_broadcast_voice_max_chars:
      latestProbeRuntimeLoadedEvent?.tts_event_broadcast_voice_max_chars ?? 0,
    runtime_loaded_event_count: runtimeLoadedEvents.length,
    real_runtime_loaded_event_count: realRuntimeLoadedEvents.length,
    probe_runtime_loaded_event_count: probeRuntimeLoadedEvents.length,
    controlled_tts_input_probe_event_count: controlledTtsInputProbeEvents.length,
    latest_runtime_default_stt_adapter: latestRuntimeLoadedEvent?.default_stt_adapter ?? 'unknown',
    latest_real_runtime_default_stt_adapter: latestRealRuntimeLoadedEvent?.default_stt_adapter ?? 'unknown',
    latest_runtime_default_voice_output_mode: latestRuntimeLoadedEvent?.default_voice_output_mode ?? 'unknown',
    latest_real_runtime_default_voice_output_mode: latestRealRuntimeLoadedEvent?.default_voice_output_mode ?? 'unknown',
    event_types: countBy(events, 'event'),
    xiaozhi_types: xiaozhiTypes,
    xiaozhi_missing_required_types: xiaozhiMissingTypes,
    dominant_stt_path: dominantSttPath,
    local_stt_adapter_selected_count: localAdapterSelectionEvents.length,
    cloud_stt_adapter_selected_count: cloudAdapterSelectionEvents.length,
    remote_stt_adapter_selected_count: remoteAdapterSelectionEvents.length,
    probe_stt_adapter_selected_count: probeAdapterSelectionEvents.length,
    local_stt_recording_event_count: localRecordingEvents.length,
    local_stt_voice_detected_count: localVoiceDetectedEvents.length,
    local_stt_low_signal_candidate_count: localLowSignalCandidateEvents.length,
    local_stt_low_signal_transcribe_allowed_count: localLowSignalTranscribeAllowedEvents.length,
    local_stt_borderline_transcribe_allowed_count: localBorderlineTranscribeAllowedEvents.length,
    local_stt_silence_detected_count: localSilenceDetectedEvents.length,
    local_stt_transcription_event_count: localTranscriptionEvents.length,
    cloud_stt_retry_one_shot_count: cloudRetryOneShotEvents.length,
    chrome_stt_success_count: chromeSttSuccesses.length,
    chrome_stt_failure_count: chromeSttFailures.length,
    chrome_stt_max_ms: maxNumber(chromeSttSuccesses, 'latency_ms'),
    chrome_stt_avg_ms: averageNumber(chromeSttSuccesses, 'latency_ms'),
    chrome_stt_p95_ms: percentileNumber(chromeSttSuccesses, 'latency_ms', 95),
    remote_stt_health_count: remoteSttHealthEvents.length,
    remote_stt_start_count: remoteSttStartEvents.length,
    remote_stt_complete_count: remoteSttCompleteEvents.length,
    remote_stt_success_count: remoteSttSuccesses.length,
    remote_stt_failure_count: remoteSttFailures.length,
    remote_stt_max_ms: maxNumber(remoteSttSuccesses, 'latency_ms'),
    remote_stt_avg_ms: averageNumber(remoteSttSuccesses, 'latency_ms'),
    local_stt_event_count: localSttEvidenceEvents.length,
    tts_synthesis_complete_count: ttsSynthesisEvents.length,
    tts_synthesis_cache_hit_count: ttsCacheHits.length,
    tts_synthesis_max_ms: maxNumber(ttsSynthesisEvents, 'latency_ms'),
    tts_synthesis_avg_ms: averageNumber(ttsSynthesisEvents, 'latency_ms'),
    tts_queue_complete_count: ttsQueueCompleteEvents.length,
    tts_queue_slow_count: slowTtsQueueEvents.length,
    tts_queue_end_to_end_max_ms: maxNumber(ttsQueueCompleteEvents, 'end_to_end_ms'),
    tts_queue_total_tts_max_ms: maxNumber(ttsQueueCompleteEvents, 'total_tts_ms'),
    tts_queue_total_playback_max_ms: maxNumber(ttsQueueCompleteEvents, 'total_playback_ms'),
    current_real_tts_queue_complete_count: currentRealTtsQueueCompleteEvents.length,
    current_real_tts_queue_slow_count: currentRealSlowTtsQueueEvents.length,
    current_real_tts_queue_end_to_end_max_ms: maxNumber(currentRealTtsQueueCompleteEvents, 'end_to_end_ms'),
    current_real_tts_queue_total_tts_max_ms: maxNumber(currentRealTtsQueueCompleteEvents, 'total_tts_ms'),
    current_real_tts_queue_total_playback_max_ms: maxNumber(currentRealTtsQueueCompleteEvents, 'total_playback_ms'),
    latest_continuous_two_turn_tts_queue_complete_count: latestContinuousTwoTurnTtsQueueCompleteEvents.length,
    latest_continuous_two_turn_tts_queue_slow_count: latestContinuousTwoTurnSlowTtsQueueEvents.length,
    latest_continuous_two_turn_tts_queue_end_to_end_max_ms: maxNumber(
      latestContinuousTwoTurnTtsQueueCompleteEvents,
      'end_to_end_ms'
    ),
    latest_continuous_two_turn_tts_queue_total_tts_max_ms: maxNumber(
      latestContinuousTwoTurnTtsQueueCompleteEvents,
      'total_tts_ms'
    ),
    latest_continuous_two_turn_tts_queue_total_playback_max_ms: maxNumber(
      latestContinuousTwoTurnTtsQueueCompleteEvents,
      'total_playback_ms'
    ),
    latest_continuous_two_turn_tts_timeout_count: latestContinuousTwoTurnTtsTimeoutEvents.length,
    latest_continuous_two_turn_tts_queue: latestByTime(latestContinuousTwoTurnTtsQueueCompleteEvents),
    tts_stream_sentence_budget_skip_count: ttsStreamBudgetSkipEvents.length,
    tts_final_voice_budget_applied_count: ttsFinalVoiceBudgetEvents.length,
    tts_shortest_voice_path_selected_count: ttsShortestVoicePathEvents.length,
    latest_tts_voice_budget_final_event_count: latestTtsVoiceBudgetFinalEvents.length,
    latest_tts_voice_budget_shortest_event_count: latestTtsVoiceBudgetShortestEvents.length,
    latest_tts_voice_budget_final_voice_max_chars: maxNumber(latestTtsVoiceBudgetFinalEvents, 'final_voice_length'),
    latest_tts_voice_budget_event_voice_max_chars: maxNumber(latestTtsVoiceBudgetFinalEvents, 'event_voice_length'),
    latest_tts_voice_budget_concise_final_max_chars: maxNumber(latestTtsVoiceBudgetFinalEvents, 'concise_final_length'),
    latest_tts_voice_budget_queue_complete_count: latestTtsVoiceBudgetQueueCompleteEvents.length,
    latest_tts_voice_budget_queue_slow_count: latestTtsVoiceBudgetSlowQueueEvents.length,
    latest_tts_voice_budget_queue_end_to_end_max_ms: maxNumber(latestTtsVoiceBudgetQueueCompleteEvents, 'end_to_end_ms'),
    latest_tts_voice_budget_queue_total_tts_max_ms: maxNumber(latestTtsVoiceBudgetQueueCompleteEvents, 'total_tts_ms'),
    latest_tts_voice_budget_queue_total_playback_max_ms: maxNumber(latestTtsVoiceBudgetQueueCompleteEvents, 'total_playback_ms'),
    latest_tts_voice_budget_complete: latestTtsVoiceBudgetCompleteEvent,
    latest_stt_click_during_tts_complete: latestSttClickDuringTtsCompleteEvent,
    latest_stt_click_during_tts_interrupt_event_count: latestSttClickDuringTtsInterruptEvents.length,
    latest_stt_click_during_tts_transcribe_event_count: latestSttClickDuringTtsTranscribeEvents.length,
    input_queued_count: inputQueuedEvents.length,
    input_dequeued_count: inputDequeuedEvents.length,
    input_queue_wait_max_ms: maxNumber(queueWaitEvents, 'age_ms'),
    input_queue_wait_avg_ms: averageNumber(queueWaitEvents, 'age_ms'),
    formal_interrupt_count: formalInterruptEvents.length,
    stale_tts_skip_or_interrupt_count: staleSkipEvents.length
  }

  const knownBottlenecks = []
  if (!checks.expected_runtime_fix_marker_seen) {
    knownBottlenecks.push('latest_gui_runtime_marker_not_observed')
  }
  if (checks.expected_runtime_fix_marker_seen && !checks.real_gui_runtime_fix_marker_seen) {
    knownBottlenecks.push('right_bottom_gui_runtime_marker_not_observed')
  }
  if (!checks.expected_tts_budget_runtime_marker_seen) {
    knownBottlenecks.push('tts_budget_runtime_marker_not_observed')
  }
  if (checks.expected_tts_budget_runtime_marker_seen && !checks.real_gui_tts_budget_runtime_marker_seen) {
    knownBottlenecks.push('right_bottom_gui_tts_budget_marker_not_observed')
  }
  if (checks.slow_tts_synthesis_seen) {
    knownBottlenecks.push(
      checks.edge_tts_low_latency_default_seen
        ? 'historical_cosyvoice_local_http_slow_synthesis'
        : 'cosyvoice_local_http_slow_synthesis'
    )
  }
  if (checks.slow_tts_queue_seen) {
    knownBottlenecks.push(
      checks.current_real_slow_tts_queue_seen
        ? 'tts_queue_end_to_end_latency'
        : 'historical_tts_queue_end_to_end_latency'
    )
  }
  if (checks.slow_cloud_stt_seen) {
    knownBottlenecks.push('chrome_cloud_stt_latency')
  }
  if (metrics.input_queue_wait_max_ms >= 5_000) {
    knownBottlenecks.push('formal_input_waited_behind_tts_queue')
  }
  if (chromeSttFailures.length > 0) {
    knownBottlenecks.push('cloud_stt_failure_events')
  }
  if (remoteAdapterSelectionEvents.length > 0 && remoteSttSuccesses.length === 0) {
    knownBottlenecks.push('remote_stt_selected_without_success')
  }
  if (!checks.local_stt_events_seen) {
    knownBottlenecks.push('local_whisper_path_not_observed_in_gui_log')
  }
  if (checks.cloud_retry_one_shot_seen && cloudAdapterSelectionEvents.length > localAdapterSelectionEvents.length) {
    knownBottlenecks.push('cloud_stt_adapter_selected_after_retry')
  }

  const needsRealGuiRetest =
    !checks.real_gui_runtime_fix_marker_seen ||
    !checks.real_gui_tts_budget_runtime_marker_seen ||
    !checks.formal_input_interrupt_seen ||
    !checks.stale_tts_skip_or_interrupt_seen ||
    !checks.local_stt_transcription_seen

  const recommendations = []
  if (checks.probe_tts_budget_runtime_marker_seen && !checks.real_gui_tts_budget_runtime_marker_seen) {
    recommendations.push('TTS spoken-budget marker is visible in probe only; restart or refresh the real right-bottom GUI before judging live latency.')
  }
  if (!checks.expected_tts_budget_runtime_marker_seen) {
    recommendations.push('TTS spoken-budget runtime marker is missing; rebuild/restart before measuring the latest spoken caps.')
  }
  if (!checks.expected_runtime_fix_marker_seen) {
    recommendations.push('当前日志没有最新 GUI 运行时修复标记；需要重启右下角 GUI 后再测试。')
  }
  if (checks.probe_runtime_fix_marker_seen && !checks.real_gui_runtime_fix_marker_seen) {
    recommendations.push('当前只观察到独立 marker probe，不代表右下角真实 GUI 已加载最新构建；仍需重启右下角 GUI。')
  }
  if (checks.slow_tts_synthesis_seen) {
    recommendations.push(
      checks.edge_tts_low_latency_default_seen
        ? 'Historical CosyVoice slow synthesis samples remain; current normal GUI default is edge_readaloud_stream, so run a fresh real GUI voice turn to verify live latency.'
        : 'TTS bottleneck is CosyVoice local synthesis; switch the live UI to edge_readaloud_stream or prewarm/cache short sentences.'
    )
  }
  if (checks.slow_tts_queue_seen) {
    recommendations.push(
      checks.current_real_slow_tts_queue_seen
        ? 'TTS queue latency is still present in the current real GUI window; keep STT local/fast, then reduce spoken event inserts, cap post-stream final voice, and avoid replaying long patrol/event text.'
        : 'Historical TTS queue latency remains in the log set, but the latest current/probe window is no longer slow; run a fresh real GUI voice turn before treating TTS as still slow.'
    )
  }
  if (checks.latest_continuous_two_turn_tts_queue_fast_seen) {
    recommendations.push(
      'Latest controlled continuous two-turn probe had no slow TTS queue and no stream frame timeout; remaining lag claims need fresh real GUI evidence.'
    )
  }
  if (checks.latest_tts_voice_budget_final_cap_seen && checks.latest_tts_voice_budget_queue_fast_seen) {
    recommendations.push(
      'Latest controlled TTS voice-budget probe kept final spoken text within the cap and had no slow queue; remaining TTS latency needs fresh real GUI evidence.'
    )
  }
  if (
    checks.latest_stt_click_during_tts_probe_complete_seen &&
    checks.latest_stt_click_during_tts_interrupt_seen &&
    checks.latest_stt_click_during_tts_local_transcription_seen
  ) {
    recommendations.push(
      'Latest controlled STT-click-during-TTS probe interrupted playback before local recording and reached local transcription; remaining missed-input claims need fresh real GUI evidence.'
    )
  }
  if (metrics.input_queue_wait_max_ms >= 5_000) {
    recommendations.push('多次语音输入只有一次有效的体感来自输入排队；需要实测新补丁是否触发正式输入中断旧 TTS。')
  }
  if (!checks.formal_input_interrupt_seen) {
    recommendations.push('当前日志未观察到 voice_playback_interrupted_for_formal_input，需要重启 GUI 后做两轮 TTS 播放中插入输入测试。')
  }
  if (!checks.local_stt_events_seen) {
    recommendations.push('当前 GUI 日志未观察到本地 Whisper STT 路径；仍在走 Chrome/WebSpeech 云端 STT。')
  }
  if (checks.local_stt_adapter_selected_seen && !checks.local_stt_transcription_seen) {
    recommendations.push('当前日志只证明本地 STT 被选中，尚未证明真实麦克风输入进入本地 Whisper 转写。')
  }
  if (checks.cloud_retry_one_shot_seen && cloudAdapterSelectionEvents.length > localAdapterSelectionEvents.length) {
    recommendations.push('云端重试后仍观察到 cloud adapter 被选中，需要确认 GUI 是否为最新构建。')
  }
  if (checks.slow_cloud_stt_seen) {
    recommendations.push('云端 STT 成功但延迟偏高；需要保留云端路径，同时准备本地常驻 STT 作为低延迟降级。')
  }

  const status =
    !checks.log_file_found || !checks.jsonl_parsed_without_errors
      ? 'fail'
      : knownBottlenecks.length > 0 || needsRealGuiRetest
        ? 'warn'
        : 'pass'

  return {
    schema: 'status_dialogue_runtime_voice_flow_audit.v1',
    generated_at: new Date().toISOString(),
    log_path: logPath,
    zhineng_root: zhinengRoot,
    parse_errors: parseErrors,
    checks,
    metrics,
    known_bottlenecks: knownBottlenecks,
    needs_real_gui_retest: needsRealGuiRetest,
    recommendations,
    status
  }
}

function main() {
  const strict = hasFlag('--strict')
  const logPath = path.resolve(argValue('--log', latestVoiceFlowLog(defaultLogDir) ?? ''))
  const { events, parseErrors, lineCount } = parseJsonl(logPath)
  const audit = buildAudit(events, parseErrors, lineCount, logPath)

  fs.mkdirSync(outputDir, { recursive: true })
  const outputPath = path.join(outputDir, `status-dialogue-runtime-voice-flow-audit-${Date.now()}.json`)
  fs.writeFileSync(outputPath, JSON.stringify(audit, null, 2), 'utf8')

  console.log(
    JSON.stringify(
      {
        ok: audit.status !== 'fail',
        status: audit.status,
        outputPath,
        log_path: audit.log_path,
        checks: audit.checks,
        metrics: audit.metrics,
        known_bottlenecks: audit.known_bottlenecks,
        needs_real_gui_retest: audit.needs_real_gui_retest,
        recommendations: audit.recommendations
      },
      null,
      2
    )
  )

  if (strict) {
    assert.equal(audit.checks.log_file_found, true, 'voice-flow log file not found')
    assert.equal(audit.checks.jsonl_parsed_without_errors, true, 'voice-flow log has parse errors or is empty')
    assert.equal(audit.checks.expected_runtime_fix_marker_seen, true, 'latest GUI runtime fix marker was not observed')
    assert.equal(audit.checks.real_gui_runtime_fix_marker_seen, true, 'right-bottom GUI runtime fix marker was not observed')
    assert.equal(audit.checks.expected_tts_budget_runtime_marker_seen, true, 'TTS spoken-budget runtime marker was not observed')
    assert.equal(audit.checks.real_gui_tts_budget_runtime_marker_seen, true, 'right-bottom GUI TTS budget marker was not observed')
    assert.equal(audit.checks.xiaozhi_bridge_events_seen, true, 'xiaozhi bridge events not observed')
    assert.equal(audit.checks.cloud_stt_success_seen || audit.checks.local_stt_events_seen, true, 'no successful STT evidence observed')
    assert.equal(audit.checks.local_stt_transcription_seen, true, 'local Whisper transcription was not observed in real GUI log')
    assert.equal(audit.needs_real_gui_retest, false, 'post-fix real GUI evidence is incomplete')
    assert.equal(audit.known_bottlenecks.length, 0, `runtime bottlenecks remain: ${audit.known_bottlenecks.join(', ')}`)
  }
}

main()
