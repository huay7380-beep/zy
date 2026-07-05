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
  const raw = typeof event.ts === 'string' ? event.ts : typeof event.generated_at === 'string' ? event.generated_at : undefined
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
    source_output_id: event.source_output_id,
    success: event.success,
    voice_mode: event.voice_mode,
    adapter_id: event.adapter_id,
    streaming_adapter_id: event.streaming_adapter_id,
    latency_ms: event.latency_ms,
    first_frame_ms: event.first_frame_ms,
    total_stream_ms: event.total_stream_ms,
    total_tts_ms: event.total_tts_ms,
    total_playback_ms: event.total_playback_ms,
    chunks: event.chunks,
    failed_count: event.failed_count,
    cached_count: event.cached_count,
    error: event.error,
    runtime_probe: event.runtime_probe,
    file: event.__file,
    line: event.__line
  }
}

function inspectEdgeTts({ logDir, sinceMs, requireSince, runtimeProbe }) {
  const logs = voiceFlowLogs(logDir).slice(0, 3)
  const parseErrors = []
  const allEvents = []
  for (const log of logs) {
    const parsed = parseJsonl(log.filePath)
    parseErrors.push(...parsed.parseErrors)
    allEvents.push(...parsed.events)
  }

  const baseEvents = allEvents.filter((event) => event.marker_probe !== true)
  const latestRuntimeMarker = latest(
    baseEvents,
    'status_dialogue_ui_runtime_loaded',
    (event) => !runtimeProbe || !event.runtime_probe || event.runtime_probe === runtimeProbe
  )
  const effectiveSinceMs = requireSince ? sinceMs : eventTimeMs(latestRuntimeMarker)
  const effectiveRequireSince = requireSince || Boolean(latestRuntimeMarker)
  const actionEvents = baseEvents.filter((event) => {
    if (effectiveRequireSince && eventTimeMs(event) < effectiveSinceMs) return false
    if (runtimeProbe && event.runtime_probe && event.runtime_probe !== runtimeProbe) return false
    return true
  })

  const probeStart = latest(actionEvents, 'status_dialogue_edge_tts_playback_probe_start')
  const probeComplete = latest(actionEvents, 'status_dialogue_edge_tts_playback_probe_complete')
  const probeSessionId = probeComplete?.session_id || probeStart?.session_id
  const sameSession = (event) => {
    if (!probeSessionId) return true
    const sessionId = typeof event.session_id === 'string' ? event.session_id : ''
    const sourceOutputId = typeof event.source_output_id === 'string' ? event.source_output_id : ''
    return (
      sessionId === probeSessionId ||
      sourceOutputId === probeSessionId ||
      sessionId.startsWith(`${probeSessionId}:`) ||
      sourceOutputId.startsWith(`${probeSessionId}:`)
    )
  }
  const edgeReady = latest(actionEvents, 'tts_edge_readaloud_stream_ready', sameSession)
  const streamStart = latest(actionEvents, 'tts_stream_start', (event) =>
    event.adapter_id === 'edge_readaloud_websocket' && sameSession(event)
  )
  const streamComplete = latest(actionEvents, 'tts_stream_complete', (event) =>
    event.adapter_id === 'edge_readaloud_websocket' && sameSession(event)
  )
  const queueComplete = latest(actionEvents, 'tts_queue_complete', sameSession)
  const failure = latest(actionEvents, 'tts_stream_failed', sameSession) || latest(actionEvents, 'tts_chunk_playback_error', sameSession)

  const checks = {
    probe_started: Boolean(probeStart),
    edge_stream_started: Boolean(streamStart),
    edge_stream_ready: Boolean(edgeReady),
    edge_stream_completed: Boolean(streamComplete),
    queue_completed: Boolean(queueComplete),
    probe_completed_success: probeComplete?.success === true,
    no_edge_tts_failure: !failure
  }
  const missing = Object.entries(checks)
    .filter(([, ok]) => !ok)
    .map(([name]) => name)

  return {
    passed: missing.length === 0,
    result: missing.length === 0 ? 'passed' : failure ? 'edge_tts_failed' : 'missing_edge_tts_completion',
    checks,
    missing,
    runtime_probe: runtimeProbe || undefined,
    event_window: {
      base_event_count: baseEvents.length,
      action_event_count: actionEvents.length,
      require_since: effectiveRequireSince,
      since_ms: effectiveRequireSince ? effectiveSinceMs : undefined,
      since_source: requireSince ? 'explicit' : latestRuntimeMarker ? 'latest_runtime_marker' : 'full_log'
    },
    evidence: {
      latest_runtime_marker: compactEvent(latestRuntimeMarker),
      probe_start: compactEvent(probeStart),
      stream_start: compactEvent(streamStart),
      edge_ready: compactEvent(edgeReady),
      stream_complete: compactEvent(streamComplete),
      queue_complete: compactEvent(queueComplete),
      probe_complete: compactEvent(probeComplete),
      failure: compactEvent(failure)
    },
    inspected_logs: logs.map((log) => log.filePath),
    parse_errors: parseErrors
  }
}

async function main() {
  const waitMs = Number(argValue('--wait-ms', '120000'))
  const intervalMs = Number(argValue('--interval-ms', '1000'))
  const runtimeProbe = argValue('--runtime-probe', 'edge_tts_playback')
  const explicitSinceMs = Number(argValue('--since-ms', 'NaN'))
  const hasExplicitSinceMs = Number.isFinite(explicitSinceMs) && explicitSinceMs > 0
  const requireSince = hasFlag('--since-now') || hasExplicitSinceMs
  const sinceMs = hasExplicitSinceMs ? explicitSinceMs : Date.now()
  const startedAt = new Date().toISOString()
  const deadlineMs = sinceMs + Math.max(0, waitMs)
  let latestResult

  do {
    latestResult = inspectEdgeTts({ logDir: defaultLogDir, sinceMs, requireSince, runtimeProbe })
    if (latestResult.passed) break
    if (waitMs <= 0 || Date.now() >= deadlineMs) break
    await sleep(Math.max(100, intervalMs))
  } while (true)

  const report = {
    schema: 'status_dialogue_edge_tts_playback_wait.v1',
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
  const outputPath = path.join(outputDir, `status-dialogue-edge-tts-playback-wait-${Date.now()}-${process.pid}.json`)
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf8')

  console.log(
    JSON.stringify(
      {
        ok: report.passed,
        outputPath,
        result: report.result,
        checks: report.checks,
        missing: report.missing,
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
