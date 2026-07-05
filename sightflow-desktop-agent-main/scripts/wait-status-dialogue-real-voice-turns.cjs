const fs = require('node:fs')
const path = require('node:path')

const repoRoot = path.resolve(__dirname, '..')
const zhinengRoot = process.env.ZHINENG_PROJECT_ROOT
  ? path.resolve(process.env.ZHINENG_PROJECT_ROOT)
  : path.resolve(repoRoot, '..')
const defaultLogDir = path.join(zhinengRoot, 'runtime', 'status-dialogue-logs')
const outputDir = path.join(repoRoot, 'runtime', 'verification-reports')
const expectedTtsBudgetRuntimeMarker = 'tts-spoken-budget-2026-07-01-v2'
const slowTtsQueueThresholds = {
  end_to_end_ms: 8_000,
  total_tts_ms: 5_000,
  total_playback_ms: 8_000
}

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
    line: event.__line,
    selected_adapter: event.selected_adapter,
    source: event.source,
    adapter_id: event.adapter_id,
    status: event.status,
    success: event.success,
    latency_ms: event.latency_ms,
    transcript_length: event.transcript_length,
    text_length: event.text_length,
    total_tts_ms: event.total_tts_ms,
    total_playback_ms: event.total_playback_ms,
    end_to_end_ms: event.end_to_end_ms,
    completed_count: event.completed_count,
    failed_count: event.failed_count,
    type: event.type,
    reason: event.reason,
    error: event.error,
    file: event.__file
  }
}

function latest(events, name, predicate = () => true) {
  return events
    .filter((event) => event.event === name && predicate(event))
    .sort((a, b) => eventTimeMs(b) - eventTimeMs(a))[0]
}

function isRealEvent(event) {
  return event.marker_probe !== true && !event.runtime_probe
}

function isSttSuccess(event) {
  if (event.event === 'local_stt_transcribe_result' || event.event === 'local_stt_complete') {
    return event.success === true && Number(event.transcript_length ?? 0) > 0
  }
  if (event.event === 'remote_stt_complete' || event.event === 'chrome_stt_complete') {
    return event.success === true && Number(event.transcript_length ?? 0) > 0
  }
  return false
}

function isSttFailure(event) {
  if (['local_stt_failed', 'local_stt_recording_failed'].includes(event.event)) return true
  if (['local_stt_complete', 'local_stt_transcribe_result', 'remote_stt_complete', 'chrome_stt_complete'].includes(event.event)) {
    return event.success === false
  }
  if (event.event === 'chrome_stt_failure') return true
  return false
}

function isSlowTtsQueue(event) {
  return (
    Number(event.end_to_end_ms ?? 0) >= slowTtsQueueThresholds.end_to_end_ms ||
    Number(event.total_tts_ms ?? 0) >= slowTtsQueueThresholds.total_tts_ms ||
    Number(event.total_playback_ms ?? 0) >= slowTtsQueueThresholds.total_playback_ms
  )
}

function maxNumber(events, field) {
  const values = events.map((event) => event[field]).filter((value) => typeof value === 'number')
  return values.length ? Math.max(...values) : 0
}

function pairSttToTts(sttSuccesses, ttsQueues) {
  const pairs = []
  const sortedStt = [...sttSuccesses].sort((a, b) => eventTimeMs(a) - eventTimeMs(b))
  const sortedQueues = [...ttsQueues].sort((a, b) => eventTimeMs(a) - eventTimeMs(b))
  for (const [index, sttEvent] of sortedStt.entries()) {
    const startMs = eventTimeMs(sttEvent)
    const nextSttMs = sortedStt[index + 1] ? eventTimeMs(sortedStt[index + 1]) : Number.POSITIVE_INFINITY
    const queue = sortedQueues.find((candidate) => {
      const queueMs = eventTimeMs(candidate)
      return queueMs >= startMs && queueMs < nextSttMs
    })
    pairs.push({
      stt: compactEvent(sttEvent),
      tts: compactEvent(queue),
      complete: Boolean(queue),
      slow_tts: queue ? isSlowTtsQueue(queue) : false
    })
  }
  return pairs
}

function buildVoiceTurnRecords(sttStartEvents, actionEvents) {
  const sortedStarts = [...sttStartEvents].sort((a, b) => eventTimeMs(a) - eventTimeMs(b))
  return sortedStarts.map((startEvent, index) => {
    const startMs = eventTimeMs(startEvent)
    const nextStartMs = sortedStarts[index + 1] ? eventTimeMs(sortedStarts[index + 1]) : Number.POSITIVE_INFINITY
    const turnEvents = actionEvents.filter((event) => {
      const timeMs = eventTimeMs(event)
      return timeMs >= startMs && timeMs < nextStartMs
    })
    const sttSuccesses = turnEvents.filter(isSttSuccess)
    const sttFailures = turnEvents.filter(isSttFailure)
    const dialogueEvents = turnEvents.filter((event) =>
      ['dialogue_input_dequeued', 'dialogue_input_dequeued_after_tts_complete', 'model_stream_delta_received'].includes(event.event) ||
      String(event.source ?? '').includes('fallback')
    )
    const ttsQueues = turnEvents.filter((event) => event.event === 'tts_queue_complete')
    const ttsFailures = turnEvents.filter((event) =>
      ['tts_stream_failed', 'tts_chunk_synthesis_error'].includes(event.event)
    )
    const slowTtsQueues = ttsQueues.filter(isSlowTtsQueue)
    const xiaozhiEvents = turnEvents.filter((event) => event.event === 'xiaozhi_style_voice_bridge_event')
    const latestTtsQueue = ttsQueues.at(-1)
    const complete =
      sttSuccesses.length > 0 &&
      dialogueEvents.length > 0 &&
      ttsQueues.length > 0 &&
      sttFailures.length === 0 &&
      ttsFailures.length === 0 &&
      slowTtsQueues.length === 0

    return {
      index: index + 1,
      start: compactEvent(startEvent),
      stt_success: compactEvent(sttSuccesses.at(-1)),
      stt_failure: compactEvent(sttFailures.at(-1)),
      dialogue: compactEvent(dialogueEvents.at(-1)),
      tts_queue: compactEvent(latestTtsQueue),
      tts_failure: compactEvent(ttsFailures.at(-1)),
      slow_tts_queue: compactEvent(slowTtsQueues.at(-1)),
      xiaozhi_types: Array.from(new Set(xiaozhiEvents.map((event) => event.type).filter(Boolean))).sort(),
      complete,
      checks: {
        stt_success: sttSuccesses.length > 0,
        no_stt_failure: sttFailures.length === 0,
        dialogue_chain: dialogueEvents.length > 0,
        tts_queue_complete: ttsQueues.length > 0,
        no_tts_failure: ttsFailures.length === 0,
        no_slow_tts_queue: slowTtsQueues.length === 0,
        xiaozhi_events: xiaozhiEvents.length > 0
      }
    }
  })
}

function inspectRealTurns({ logDir, sinceMs, requireSince, minTurns }) {
  const logs = voiceFlowLogs(logDir).slice(0, 3)
  const parseErrors = []
  const allEvents = []
  for (const log of logs) {
    const parsed = parseJsonl(log.filePath)
    parseErrors.push(...parsed.parseErrors)
    allEvents.push(...parsed.events)
  }

  const realEvents = allEvents.filter(isRealEvent)
  const realMarkers = realEvents.filter((event) => event.event === 'status_dialogue_ui_runtime_loaded')
  const latestTtsBudgetMarker = latest(realMarkers, 'status_dialogue_ui_runtime_loaded', (event) => {
    return event.tts_spoken_budget_marker === expectedTtsBudgetRuntimeMarker
  })
  const latestRuntimeMarker = latest(realMarkers, 'status_dialogue_ui_runtime_loaded')
  const effectiveMarker = latestTtsBudgetMarker ?? latestRuntimeMarker
  const effectiveSinceMs = requireSince ? sinceMs : eventTimeMs(effectiveMarker)
  const effectiveRequireSince = requireSince || Boolean(effectiveMarker)
  const actionEvents = realEvents
    .filter((event) => !effectiveRequireSince || eventTimeMs(event) >= effectiveSinceMs)
    .sort((a, b) => eventTimeMs(a) - eventTimeMs(b))

  const adapterEvent = latest(actionEvents, 'stt_adapter_runtime_selected')
  const localHealth = latest(actionEvents, 'local_stt_health_check')
  const sttStartEvents = actionEvents.filter((event) => event.event === 'stt_start_requested')
  const sttSuccesses = actionEvents.filter(isSttSuccess)
  const sttFailures = actionEvents.filter(isSttFailure)
  const dialogueDequeued = actionEvents.filter((event) =>
    ['dialogue_input_dequeued', 'dialogue_input_dequeued_after_tts_complete'].includes(event.event)
  )
  const modelDeltas = actionEvents.filter((event) => event.event === 'model_stream_delta_received')
  const fallbackReplies = actionEvents.filter((event) => String(event.source ?? '').includes('fallback'))
  const ttsQueues = actionEvents.filter((event) => event.event === 'tts_queue_complete')
  const slowTtsQueues = ttsQueues.filter(isSlowTtsQueue)
  const ttsFailures = actionEvents.filter((event) =>
    ['tts_stream_failed', 'tts_chunk_synthesis_error'].includes(event.event)
  )
  const xiaozhiEvents = actionEvents.filter((event) => event.event === 'xiaozhi_style_voice_bridge_event')
  const xiaozhiTypes = Array.from(new Set(xiaozhiEvents.map((event) => event.type).filter(Boolean))).sort()
  const sttTtsPairs = pairSttToTts(sttSuccesses, ttsQueues)
  const voiceTurnRecords = buildVoiceTurnRecords(sttStartEvents, actionEvents)
  const turnSttSuccesses = voiceTurnRecords.filter((turn) => turn.checks.stt_success)
  const turnDialogueChains = voiceTurnRecords.filter((turn) => turn.checks.dialogue_chain)
  const turnTtsQueues = voiceTurnRecords.filter((turn) => turn.checks.tts_queue_complete)
  const closedLoopTurns = voiceTurnRecords.filter((turn) => turn.complete).length

  const checks = {
    real_runtime_marker_seen: Boolean(latestRuntimeMarker),
    real_tts_budget_marker_seen: Boolean(latestTtsBudgetMarker),
    adapter_or_health_seen: Boolean(adapterEvent || localHealth),
    stt_start_seen: sttStartEvents.length >= minTurns,
    stt_success_seen: turnSttSuccesses.length >= minTurns,
    dialogue_chain_seen: turnDialogueChains.length >= minTurns,
    tts_queue_complete_seen: turnTtsQueues.length >= minTurns,
    closed_loop_turns_seen: closedLoopTurns >= minTurns,
    no_stt_failures: sttFailures.length === 0,
    no_tts_failures: ttsFailures.length === 0,
    no_slow_tts_queue: slowTtsQueues.length === 0,
    xiaozhi_events_seen: voiceTurnRecords.filter((turn) => turn.checks.xiaozhi_events).length >= minTurns
  }
  const missing = Object.entries(checks)
    .filter(([, ok]) => !ok)
    .map(([name]) => name)

  const result = (() => {
    if (missing.length === 0) return 'passed'
    if (!latestRuntimeMarker) return 'no_real_runtime_marker'
    if (!latestTtsBudgetMarker) return 'real_tts_budget_marker_missing'
    if (!adapterEvent && !localHealth) return 'no_adapter_or_health_after_marker'
    if (sttFailures.length > 0) return 'stt_failure_seen'
    if (ttsFailures.length > 0) return 'tts_failure_seen'
    if (slowTtsQueues.length > 0) return 'slow_tts_queue_seen'
    if (sttStartEvents.length < minTurns) return 'waiting_for_real_voice_turns'
    if (turnSttSuccesses.length < minTurns) return 'missing_stt_success'
    if (turnDialogueChains.length < minTurns) return 'missing_dialogue_chain'
    if (turnTtsQueues.length < minTurns) return 'missing_tts_queue_complete'
    if (closedLoopTurns < minTurns) return 'missing_stt_to_tts_pair'
    if (!checks.xiaozhi_events_seen) return 'missing_xiaozhi_events'
    return 'incomplete_real_voice_turns'
  })()

  return {
    passed: missing.length === 0,
    result,
    checks,
    missing,
    event_window: {
      real_event_count: realEvents.length,
      action_event_count: actionEvents.length,
      require_since: effectiveRequireSince,
      since_ms: effectiveRequireSince ? effectiveSinceMs : undefined,
      since_source: requireSince
        ? 'explicit'
        : latestTtsBudgetMarker
          ? 'latest_real_tts_budget_marker'
          : latestRuntimeMarker
            ? 'latest_real_runtime_marker'
            : 'full_log',
      min_turns: minTurns
    },
    metrics: {
      stt_start_count: sttStartEvents.length,
      stt_success_count: sttSuccesses.length,
      turn_count: voiceTurnRecords.length,
      turn_stt_success_count: turnSttSuccesses.length,
      turn_dialogue_chain_count: turnDialogueChains.length,
      turn_tts_queue_count: turnTtsQueues.length,
      stt_failure_count: sttFailures.length,
      dialogue_dequeued_count: dialogueDequeued.length,
      model_delta_count: modelDeltas.length,
      tts_queue_complete_count: ttsQueues.length,
      tts_failure_count: ttsFailures.length,
      slow_tts_queue_count: slowTtsQueues.length,
      closed_loop_turn_count: closedLoopTurns,
      tts_queue_end_to_end_max_ms: maxNumber(ttsQueues, 'end_to_end_ms'),
      tts_queue_total_tts_max_ms: maxNumber(ttsQueues, 'total_tts_ms'),
      tts_queue_total_playback_max_ms: maxNumber(ttsQueues, 'total_playback_ms'),
      xiaozhi_types: xiaozhiTypes
    },
    evidence: {
      latest_runtime_marker: compactEvent(latestRuntimeMarker),
      latest_tts_budget_marker: compactEvent(latestTtsBudgetMarker),
      adapter_event: compactEvent(adapterEvent),
      local_health: compactEvent(localHealth),
      latest_stt_start: compactEvent(sttStartEvents.at(-1)),
      latest_stt_success: compactEvent(sttSuccesses.at(-1)),
      latest_stt_failure: compactEvent(sttFailures.at(-1)),
      latest_tts_queue: compactEvent(ttsQueues.at(-1)),
      latest_slow_tts_queue: compactEvent(slowTtsQueues.at(-1)),
      latest_tts_failure: compactEvent(ttsFailures.at(-1)),
      voice_turns: voiceTurnRecords,
      stt_tts_pairs: sttTtsPairs.map((pair) => ({
        stt: pair.stt,
        tts: pair.tts,
        complete: pair.complete,
        slow_tts: pair.slow_tts
      }))
    },
    inspected_logs: logs.map((log) => log.filePath),
    parse_errors: parseErrors
  }
}

function buildPreflight(result) {
  const readyForOperatorAction =
    result.checks.real_runtime_marker_seen &&
    result.checks.real_tts_budget_marker_seen &&
    result.checks.adapter_or_health_seen &&
    result.result === 'waiting_for_real_voice_turns'
  const nextAction = (() => {
    if (result.passed) return 'real_voice_turns_already_proved'
    if (!result.checks.real_runtime_marker_seen) return 'restart_real_gui_and_wait_runtime_marker'
    if (!result.checks.real_tts_budget_marker_seen) return 'restart_real_gui_with_tts_budget_marker'
    if (!result.checks.adapter_or_health_seen) return 'wait_for_stt_adapter_health_or_restart_gui'
    if (result.result === 'stt_failure_seen') return 'inspect_stt_failure_event_then_retry'
    if (result.result === 'tts_failure_seen') return 'inspect_tts_failure_event_then_retry'
    if (result.result === 'slow_tts_queue_seen') return 'inspect_latest_tts_queue_latency_segments'
    if (readyForOperatorAction) return 'run_two_real_voice_turns_in_right_bottom_gui'
    return 'continue_from_report_result'
  })()
  return {
    schema: 'status_dialogue_real_voice_turns_preflight.v1',
    ready_for_operator_action: readyForOperatorAction,
    completion_proof: result.passed,
    result: result.passed ? 'real_voice_turns_already_proved' : readyForOperatorAction ? 'ready_for_operator_real_voice_turns' : result.result,
    next_action: nextAction,
    boundary:
      'preflight/readiness only unless completion_proof=true; this does not configure remote STT or write world model'
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
    latestResult = inspectRealTurns({ logDir: defaultLogDir, sinceMs, requireSince, minTurns })
    if (latestResult.passed) break
    if (waitMs <= 0 || Date.now() >= deadlineMs) break
    await sleep(Math.max(100, intervalMs))
  } while (true)

  const report = {
    schema: 'status_dialogue_real_voice_turns_wait.v1',
    generated_at: new Date().toISOString(),
    started_at: startedAt,
    zhineng_root: zhinengRoot,
    log_dir: defaultLogDir,
    require_since: requireSince,
    since_ms: requireSince ? sinceMs : undefined,
    wait_ms: waitMs,
    min_turns: minTurns,
    slow_tts_queue_thresholds: slowTtsQueueThresholds,
    result: latestResult.result,
    preflight: buildPreflight(latestResult),
    ...latestResult
  }
  const ok = report.passed || (preflightMode && report.preflight.ready_for_operator_action)

  fs.mkdirSync(outputDir, { recursive: true })
  const outputPath = path.join(outputDir, `status-dialogue-real-voice-turns-wait-${Date.now()}-${process.pid}.json`)
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
        metrics: report.metrics,
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
