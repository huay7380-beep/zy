const fs = require('node:fs')
const path = require('node:path')

const repoRoot = path.resolve(__dirname, '..')
const zhinengRoot = process.env.ZHINENG_PROJECT_ROOT
  ? path.resolve(process.env.ZHINENG_PROJECT_ROOT)
  : path.resolve(repoRoot, '..')
const logDir = path.join(zhinengRoot, 'runtime', 'status-dialogue-logs')
const reportDir = path.join(repoRoot, 'runtime', 'verification-reports')

function argValue(name, fallback) {
  const inline = process.argv.find((item) => item.startsWith(`${name}=`))
  if (inline) return inline.slice(name.length + 1)
  const index = process.argv.indexOf(name)
  if (index === -1 || index + 1 >= process.argv.length) return fallback
  return process.argv[index + 1]
}

function hasFlag(name) {
  return process.argv.includes(name)
}

function parseJsonl(filePath) {
  if (!fs.existsSync(filePath)) return []
  return fs
    .readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line, index) => {
      try {
        return { ...JSON.parse(line), __file: filePath, __line: index + 1 }
      } catch (error) {
        return {
          event: 'json_parse_error',
          error: String(error?.message ?? error),
          __file: filePath,
          __line: index + 1
        }
      }
    })
}

function loadEvents() {
  if (!fs.existsSync(logDir)) return []
  return fs
    .readdirSync(logDir)
    .filter((name) => /^voice-flow-\d{8}\.jsonl$/.test(name))
    .flatMap((name) => parseJsonl(path.join(logDir, name)))
}

function eventTimeMs(event) {
  const raw = typeof event.ts === 'string' ? event.ts : typeof event.generated_at === 'string' ? event.generated_at : undefined
  const ms = raw ? Date.parse(raw) : NaN
  return Number.isFinite(ms) ? ms : 0
}

function latest(events, eventName) {
  return events
    .filter((event) => event.event === eventName)
    .sort((a, b) => eventTimeMs(b) - eventTimeMs(a))[0]
}

function compact(event) {
  if (!event) return undefined
  return {
    event: event.event,
    ts: event.ts,
    runtime_probe: event.runtime_probe,
    success: event.success,
    configured: event.configured,
    reachable: event.reachable,
    status: event.status,
    base_url_host: event.base_url_host,
    endpoint_path: event.endpoint_path,
    model: event.model,
    transcript_length: event.transcript_length,
    latency_ms: event.latency_ms,
    error: event.error,
    fallback_reason: event.fallback_reason,
    boundary: event.boundary,
    file: event.__file,
    line: event.__line
  }
}

function buildReport({ sinceMs, runtimeProbe }) {
  const events = loadEvents()
    .filter((event) => eventTimeMs(event) >= sinceMs)
    .filter((event) => !runtimeProbe || event.runtime_probe === runtimeProbe)
  const healthChecks = events.filter((event) => event.event === 'remote_stt_health_check')
  const starts = events.filter((event) => event.event === 'remote_stt_start')
  const completes = events.filter((event) => event.event === 'remote_stt_complete')
  const probeStart = latest(events, 'status_dialogue_remote_stt_configured_probe_start')
  const probeComplete = latest(events, 'status_dialogue_remote_stt_configured_probe_complete')
  const latestHealthCheck = healthChecks.sort((a, b) => eventTimeMs(b) - eventTimeMs(a))[0]
  const result = probeComplete?.success === true ? 'passed' : probeComplete ? 'failed' : 'waiting'
  const remoteDefaultsVisible =
    latestHealthCheck?.base_url_host &&
    latestHealthCheck.base_url_host !== 'not_configured' &&
    latestHealthCheck.base_url_host !== 'invalid_url'
  return {
    schema: 'status_dialogue_remote_stt_wait.v1',
    generated_at: new Date().toISOString(),
    runtime_probe: runtimeProbe || undefined,
    since_ms: sinceMs,
    result,
    success: result === 'passed',
    counts: {
      events: events.length,
      health_checks: healthChecks.length,
      starts: starts.length,
      completes: completes.length,
      successes: completes.filter((event) => event.success === true && Number(event.transcript_length ?? 0) > 0).length,
      failures: completes.filter((event) => event.success !== true).length
    },
    latest: {
      probe_start: compact(probeStart),
      health_check: compact(latestHealthCheck),
      remote_start: compact(starts.sort((a, b) => eventTimeMs(b) - eventTimeMs(a))[0]),
      remote_complete: compact(completes.sort((a, b) => eventTimeMs(b) - eventTimeMs(a))[0]),
      probe_complete: compact(probeComplete)
    },
    next_action:
      result === 'passed'
        ? 'remote_stt_configured_probe_passed'
        : probeComplete?.fallback_reason === 'remote_stt_not_configured'
          ? remoteDefaultsVisible
            ? 'configure_remote_stt_api_key'
            : 'configure_remote_stt_api_key_base_url_and_model'
          : probeComplete?.fallback_reason === 'remote_stt_health_not_ready'
            ? 'fix_remote_stt_host_or_endpoint_reachability'
            : probeComplete
              ? 'inspect_remote_stt_probe_error'
              : 'wait_for_remote_stt_configured_probe_complete'
  }
}

async function main() {
  const waitMs = Number(argValue('--wait-ms', '0'))
  const sinceMs = hasFlag('--since-now') ? Date.now() : Number(argValue('--since-ms', '0')) || 0
  const runtimeProbe = argValue('--runtime-probe', 'remote_stt_configured')
  const startedAt = Date.now()
  let report = buildReport({ sinceMs, runtimeProbe })
  while (report.result === 'waiting' && Date.now() - startedAt < waitMs) {
    await new Promise((resolve) => setTimeout(resolve, 500))
    report = buildReport({ sinceMs, runtimeProbe })
  }
  fs.mkdirSync(reportDir, { recursive: true })
  const outputPath = path.join(reportDir, `status-dialogue-remote-stt-wait-${Date.now()}.json`)
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf8')
  console.log(JSON.stringify({ ok: report.success, outputPath, ...report }, null, 2))
  process.exitCode = report.success ? 0 : 1
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
