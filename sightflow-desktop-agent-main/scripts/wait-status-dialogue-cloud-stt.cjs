const fs = require('node:fs')
const path = require('node:path')

const repoRoot = path.resolve(__dirname, '..')
const zhinengRoot = process.env.ZHINENG_PROJECT_ROOT
  ? path.resolve(process.env.ZHINENG_PROJECT_ROOT)
  : path.resolve(repoRoot, '..')
const defaultLogDir = path.join(zhinengRoot, 'runtime', 'status-dialogue-logs')
const outputDir = path.join(repoRoot, 'runtime', 'verification-reports')

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
  if (!event) return 0
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
    success: event.success,
    attempt: event.attempt,
    attempt_count: event.attempt_count,
    max_attempts: event.max_attempts,
    language: event.language,
    test_audio: event.test_audio,
    fake_audio_requested: event.fake_audio_requested,
    fake_audio_path: event.fake_audio_path,
    fake_audio_exists: event.fake_audio_exists,
    fake_audio_enabled: event.fake_audio_enabled,
    latency_ms: event.latency_ms,
    transcript_length: event.transcript_length,
    error: event.error,
    fallback_reason: event.fallback_reason,
    events: event.events,
    runtime_probe: event.runtime_probe,
    file: event.__file,
    line: event.__line
  }
}

function latest(events, name, predicate = () => true) {
  return events
    .filter((event) => event.event === name && predicate(event))
    .sort((a, b) => eventTimeMs(b) - eventTimeMs(a))[0]
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

function isRuntimeProbeEvent(event, runtimeProbeWindows, allowedRuntimeProbe) {
  if (allowedRuntimeProbe && event.runtime_probe === allowedRuntimeProbe) return false
  if (event.marker_probe === true || event.runtime_probe) return true
  const timeMs = eventTimeMs(event)
  if (!timeMs) return false
  return runtimeProbeWindows.some((window) => window.probe !== allowedRuntimeProbe && timeMs >= window.startMs && timeMs <= window.endMs)
}

function inspectCloudStt({ logDir, sinceMs, requireSince, runtimeProbe }) {
  const logs = voiceFlowLogs(logDir).slice(0, 3)
  const parseErrors = []
  const allEvents = []
  for (const log of logs) {
    const parsed = parseJsonl(log.filePath)
    parseErrors.push(...parsed.parseErrors)
    allEvents.push(...parsed.events)
  }

  const runtimeProbeWindows = buildRuntimeProbeWindows(allEvents)
  const baseEvents = allEvents.filter((event) => !isRuntimeProbeEvent(event, runtimeProbeWindows, runtimeProbe))
  const latestRuntimeMarker = latest(
    baseEvents,
    'status_dialogue_ui_runtime_loaded',
    (event) => !event.runtime_probe || event.runtime_probe === runtimeProbe
  )
  const effectiveSinceMs = requireSince ? sinceMs : eventTimeMs(latestRuntimeMarker)
  const effectiveRequireSince = requireSince || Boolean(latestRuntimeMarker)
  const actionEvents = baseEvents.filter((event) => {
    if (effectiveRequireSince && eventTimeMs(event) < effectiveSinceMs) return false
    if (runtimeProbe && event.runtime_probe && event.runtime_probe !== runtimeProbe) return false
    return true
  })

  const starts = actionEvents.filter((event) => event.event === 'chrome_stt_start')
  const launches = actionEvents.filter((event) => event.event === 'chrome_stt_bridge_launch')
  const completes = actionEvents.filter((event) => event.event === 'chrome_stt_complete')
  const attemptStarts = actionEvents.filter((event) => event.event === 'status_dialogue_cloud_stt_fake_audio_probe_attempt_start')
  const attemptCompletes = actionEvents.filter((event) => event.event === 'status_dialogue_cloud_stt_fake_audio_probe_attempt_complete')
  const success = latest(completes, 'chrome_stt_complete', (event) => event.success === true && Number(event.transcript_length ?? 0) > 0)
  const failure = latest(completes, 'chrome_stt_complete', (event) => event.success !== true)
  const failureClassified = latest(actionEvents, 'cloud_stt_failure_classified')
  const probeStart = latest(actionEvents, 'status_dialogue_cloud_stt_fake_audio_probe_start')
  const probeComplete = latest(actionEvents, 'status_dialogue_cloud_stt_fake_audio_probe_complete')
  const latestSuccessMs = eventTimeMs(success)
  const latestFailureMs = eventTimeMs(failure)
  const latestSuccessRecoveredFailure = Boolean(success) && (!failure || latestSuccessMs >= latestFailureMs)
  const probeCompletedSuccess = runtimeProbe ? probeComplete?.success === true : true
  const checks = {
    chrome_stt_started: starts.length > 0,
    chrome_stt_completed: completes.length > 0,
    chrome_stt_success_with_transcript: Boolean(success),
    no_unrecovered_cloud_stt_failure: !failure || latestSuccessRecoveredFailure,
    probe_completed: runtimeProbe ? Boolean(probeComplete) : true,
    probe_completed_success: probeCompletedSuccess
  }
  const missing = Object.entries(checks)
    .filter(([, ok]) => !ok)
    .map(([name]) => name)

  return {
    passed: missing.length === 0,
    result: missing.length === 0 ? 'passed' : failure ? 'cloud_stt_failed' : 'missing_cloud_stt_completion',
    checks,
    missing,
    runtime_probe: runtimeProbe || undefined,
    metrics: {
      start_count: starts.length,
      complete_count: completes.length,
      launch_count: launches.length,
      fake_audio_enabled_count: launches.filter((event) => event.fake_audio_enabled === true).length,
      success_count: completes.filter((event) => event.success === true && Number(event.transcript_length ?? 0) > 0).length,
      failure_count: completes.filter((event) => event.success !== true).length,
      attempt_start_count: attemptStarts.length,
      attempt_complete_count: attemptCompletes.length
    },
    event_window: {
      base_event_count: baseEvents.length,
      action_event_count: actionEvents.length,
      require_since: effectiveRequireSince,
      since_ms: effectiveRequireSince ? effectiveSinceMs : undefined,
      since_source: requireSince ? 'explicit' : latestRuntimeMarker ? 'latest_runtime_marker' : 'full_log',
      runtime_probe_window_count: runtimeProbeWindows.length
    },
    evidence: {
      latest_runtime_marker: compactEvent(latestRuntimeMarker),
      latest_launch: compactEvent(launches.sort((a, b) => eventTimeMs(b) - eventTimeMs(a))[0]),
      latest_start: compactEvent(starts.sort((a, b) => eventTimeMs(b) - eventTimeMs(a))[0]),
      latest_complete: compactEvent(completes.sort((a, b) => eventTimeMs(b) - eventTimeMs(a))[0]),
      latest_success: compactEvent(success),
      latest_failure: compactEvent(failure),
      failure_classified: compactEvent(failureClassified),
      probe_start: compactEvent(probeStart),
      probe_complete: compactEvent(probeComplete),
      latest_attempt_start: compactEvent(attemptStarts.sort((a, b) => eventTimeMs(b) - eventTimeMs(a))[0]),
      latest_attempt_complete: compactEvent(attemptCompletes.sort((a, b) => eventTimeMs(b) - eventTimeMs(a))[0])
    },
    inspected_logs: logs.map((log) => log.filePath),
    parse_errors: parseErrors
  }
}

async function main() {
  const waitMs = Number(argValue('--wait-ms', '120000'))
  const intervalMs = Number(argValue('--interval-ms', '1000'))
  const runtimeProbe = argValue('--runtime-probe', '')
  const explicitSinceMs = Number(argValue('--since-ms', 'NaN'))
  const hasExplicitSinceMs = Number.isFinite(explicitSinceMs) && explicitSinceMs > 0
  const requireSince = hasFlag('--since-now') || hasExplicitSinceMs
  const sinceMs = hasExplicitSinceMs ? explicitSinceMs : Date.now()
  const startedAt = new Date().toISOString()
  const deadlineMs = sinceMs + Math.max(0, waitMs)
  let latestResult

  do {
    latestResult = inspectCloudStt({ logDir: defaultLogDir, sinceMs, requireSince, runtimeProbe })
    if (latestResult.passed) break
    if (waitMs <= 0 || Date.now() >= deadlineMs) break
    await sleep(Math.max(100, intervalMs))
  } while (true)

  const report = {
    schema: 'status_dialogue_cloud_stt_realtime_wait.v1',
    generated_at: new Date().toISOString(),
    started_at: startedAt,
    zhineng_root: zhinengRoot,
    log_dir: defaultLogDir,
    require_since: requireSince,
    since_ms: requireSince ? sinceMs : undefined,
    wait_ms: waitMs,
    ...latestResult
  }

  fs.mkdirSync(outputDir, { recursive: true })
  const outputPath = path.join(outputDir, `status-dialogue-cloud-stt-realtime-wait-${Date.now()}-${process.pid}.json`)
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf8')

  console.log(
    JSON.stringify(
      {
        ok: report.passed,
        outputPath,
        result: report.result,
        checks: report.checks,
        missing: report.missing,
        metrics: report.metrics,
        evidence: report.evidence,
        event_window: report.event_window,
        inspected_logs: report.inspected_logs,
        runtime_probe: report.runtime_probe
      },
      null,
      2
    )
  )

  if (!report.passed) {
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
