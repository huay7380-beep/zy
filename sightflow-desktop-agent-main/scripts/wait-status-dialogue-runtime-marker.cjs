const fs = require('node:fs')
const path = require('node:path')

const repoRoot = path.resolve(__dirname, '..')
const zhinengRoot = process.env.ZHINENG_PROJECT_ROOT
  ? path.resolve(process.env.ZHINENG_PROJECT_ROOT)
  : path.resolve(repoRoot, '..')
const defaultLogDir = path.join(zhinengRoot, 'runtime', 'status-dialogue-logs')
const outputDir = path.join(repoRoot, 'runtime', 'verification-reports')
const expectedRuntimeFixMarker = 'stt-local-observability-2026-06-29-v3'
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
      events.push(JSON.parse(line))
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

function findRuntimeMarker({ logDir, sinceMs, requireSince, allowProbe, requireTtsBudgetMarker }) {
  const logs = voiceFlowLogs(logDir).slice(0, 3)
  const parseErrors = []
  const markers = []
  for (const log of logs) {
    const parsed = parseJsonl(log.filePath)
    parseErrors.push(...parsed.parseErrors)
    for (const event of parsed.events) {
      if (event.event !== 'status_dialogue_ui_runtime_loaded') continue
      if (event.runtime_fix_marker !== expectedRuntimeFixMarker) continue
      if (requireTtsBudgetMarker && event.tts_spoken_budget_marker !== expectedTtsBudgetRuntimeMarker) continue
      if (!allowProbe && (event.marker_probe === true || event.runtime_probe)) continue
      const tsMs = eventTimeMs(event)
      if (requireSince && tsMs < sinceMs) continue
      markers.push({
        file: log.filePath,
        ts: event.ts ?? event.generated_at,
        ts_ms: tsMs,
        runtime_fix_marker: event.runtime_fix_marker,
        tts_spoken_budget_marker: event.tts_spoken_budget_marker,
        tts_budget_final_cap_enabled: event.tts_budget_final_cap_enabled,
        tts_event_broadcast_voice_max_chars: event.tts_event_broadcast_voice_max_chars,
        tts_final_voice_max_chars: event.tts_final_voice_max_chars,
        default_stt_adapter: event.default_stt_adapter,
        stt_model: event.stt_model,
        electron_ipc_available: event.electron_ipc_available,
        local_whisper_observability: event.local_whisper_observability,
        cloud_retry_one_shot: event.cloud_retry_one_shot,
        tts_input_interrupt_observability: event.tts_input_interrupt_observability,
        marker_probe: event.marker_probe === true,
        runtime_probe: event.runtime_probe
      })
    }
  }
  markers.sort((a, b) => b.ts_ms - a.ts_ms)
  return { marker: markers[0], marker_count: markers.length, inspected_logs: logs.map((log) => log.filePath), parse_errors: parseErrors }
}

async function main() {
  const waitMs = Number(argValue('--wait-ms', '120000'))
  const intervalMs = Number(argValue('--interval-ms', '1000'))
  const explicitSinceMs = Number(argValue('--since-ms', 'NaN'))
  const hasExplicitSinceMs = Number.isFinite(explicitSinceMs) && explicitSinceMs > 0
  const requireSince = hasFlag('--since-now') || hasExplicitSinceMs
  const allowProbe = hasFlag('--allow-probe')
  const requireTtsBudgetMarker = hasFlag('--require-tts-budget-marker')
  const sinceMs = hasExplicitSinceMs ? explicitSinceMs : Date.now()
  const startedAt = new Date().toISOString()
  const deadlineMs = sinceMs + Math.max(0, waitMs)
  let latest

  do {
    latest = findRuntimeMarker({ logDir: defaultLogDir, sinceMs, requireSince, allowProbe, requireTtsBudgetMarker })
    if (latest.marker) break
    if (waitMs <= 0 || Date.now() >= deadlineMs) break
    await sleep(Math.max(100, intervalMs))
  } while (true)

  const report = {
    schema: 'status_dialogue_runtime_marker_wait.v1',
    generated_at: new Date().toISOString(),
    started_at: startedAt,
    zhineng_root: zhinengRoot,
    log_dir: defaultLogDir,
    expected_runtime_fix_marker: expectedRuntimeFixMarker,
    expected_tts_budget_runtime_marker: expectedTtsBudgetRuntimeMarker,
    require_tts_budget_marker: requireTtsBudgetMarker,
    require_since_now: requireSince,
    since_ms: requireSince ? sinceMs : undefined,
    allow_probe_marker: allowProbe,
    wait_ms: waitMs,
    marker_found: Boolean(latest.marker),
    marker: latest.marker,
    marker_count: latest.marker_count,
    inspected_logs: latest.inspected_logs,
    parse_errors: latest.parse_errors,
    result: latest.marker ? 'passed' : 'missing_runtime_marker'
  }

  fs.mkdirSync(outputDir, { recursive: true })
  const outputPath = path.join(outputDir, `status-dialogue-runtime-marker-wait-${Date.now()}.json`)
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf8')

  console.log(
    JSON.stringify(
      {
        ok: report.marker_found,
        outputPath,
        result: report.result,
        marker: report.marker,
        inspected_logs: report.inspected_logs,
        wait_ms: waitMs,
        require_since_now: requireSince,
        allow_probe_marker: allowProbe,
        require_tts_budget_marker: requireTtsBudgetMarker
      },
      null,
      2
    )
  )

  if (!report.marker_found) {
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
