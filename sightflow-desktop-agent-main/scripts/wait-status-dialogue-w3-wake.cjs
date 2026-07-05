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
    phrase: event.phrase,
    transcript: event.transcript,
    selected_stt_adapter: event.selected_stt_adapter,
    stage: event.stage,
    latency_ms: event.latency_ms,
    runtime_probe: event.runtime_probe,
    boundary: event.boundary,
    file: event.__file,
    line: event.__line
  }
}

function latest(events, name, predicate = () => true) {
  return events
    .filter((event) => event.event === name && predicate(event))
    .sort((a, b) => eventTimeMs(b) - eventTimeMs(a))[0]
}

function inspectW3Wake({ logDir, sinceMs, requireSince, runtimeProbe }) {
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
    (event) => !event.runtime_probe || event.runtime_probe === runtimeProbe
  )
  const effectiveSinceMs = requireSince ? sinceMs : eventTimeMs(latestRuntimeMarker)
  const effectiveRequireSince = requireSince || Boolean(latestRuntimeMarker)
  const actionEvents = baseEvents.filter((event) => {
    if (effectiveRequireSince && eventTimeMs(event) < effectiveSinceMs) return false
    if (runtimeProbe && event.runtime_probe && event.runtime_probe !== runtimeProbe) return false
    return true
  })

  const probeStart = latest(actionEvents, 'status_dialogue_w3_wake_handoff_probe_start')
  const wakeDetected = latest(actionEvents, 'w3_wake_detected')
  const wakeHandoff = latest(actionEvents, 'w3_wake_handoff_stt')
  const probeComplete = latest(actionEvents, 'status_dialogue_w3_wake_handoff_probe_complete')
  const xiaozhiListenDetect = latest(
    actionEvents,
    'xiaozhi_style_voice_bridge_event',
    (event) => event.type === 'listen_detect'
  )
  const checks = {
    probe_started: Boolean(probeStart),
    wake_detected: Boolean(wakeDetected),
    handoff_logged: Boolean(wakeHandoff),
    xiaozhi_listen_detect_seen: Boolean(xiaozhiListenDetect),
    probe_completed: runtimeProbe ? Boolean(probeComplete) : true,
    probe_completed_success: runtimeProbe ? probeComplete?.success === true : true
  }
  const missing = Object.entries(checks)
    .filter(([, ok]) => !ok)
    .map(([name]) => name)

  return {
    passed: missing.length === 0,
    result: missing.length === 0 ? 'passed' : probeComplete?.success === false ? 'w3_wake_probe_failed' : 'missing_w3_wake_handoff',
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
      wake_detected: compactEvent(wakeDetected),
      wake_handoff: compactEvent(wakeHandoff),
      xiaozhi_listen_detect: compactEvent(xiaozhiListenDetect),
      probe_complete: compactEvent(probeComplete)
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
    latestResult = inspectW3Wake({ logDir: defaultLogDir, sinceMs, requireSince, runtimeProbe })
    if (latestResult.passed) break
    if (waitMs <= 0 || Date.now() >= deadlineMs) break
    await sleep(Math.max(100, intervalMs))
  } while (true)

  const report = {
    schema: 'status_dialogue_w3_wake_handoff_wait.v1',
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
  const outputPath = path.join(outputDir, `status-dialogue-w3-wake-handoff-wait-${Date.now()}-${process.pid}.json`)
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

main()
