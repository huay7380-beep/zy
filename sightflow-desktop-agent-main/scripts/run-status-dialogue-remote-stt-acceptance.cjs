const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const repoRoot = path.resolve(__dirname, '..')
const reportDir = path.join(repoRoot, 'runtime', 'verification-reports')

function commandName(base) {
  return process.platform === 'win32' ? `${base}.cmd` : base
}

function runNodeScript(scriptPath) {
  return spawnSync(process.execPath, [scriptPath], {
    cwd: repoRoot,
    encoding: 'utf8',
    windowsHide: true
  })
}

function runNpmScript(scriptName) {
  return spawnSync(commandName('npm'), ['run', scriptName], {
    cwd: repoRoot,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 180_000
  })
}

function extractFirstJsonObject(text) {
  if (!text) return undefined
  let start = -1
  let depth = 0
  let inString = false
  let escaped = false
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (start === -1) {
      if (char === '{') {
        start = index
        depth = 1
      }
      continue
    }
    if (escaped) {
      escaped = false
      continue
    }
    if (char === '\\') {
      escaped = true
      continue
    }
    if (char === '"') {
      inString = !inString
      continue
    }
    if (inString) continue
    if (char === '{') depth += 1
    if (char === '}') depth -= 1
    if (depth === 0) {
      const candidate = text.slice(start, index + 1)
      try {
        return JSON.parse(candidate)
      } catch {
        start = -1
        depth = 0
      }
    }
  }
  return undefined
}

function readJsonIfExists(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return undefined
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''))
}

function compactChildResult(result, parsed) {
  return {
    exit_code: typeof result.status === 'number' ? result.status : undefined,
    signal: result.signal,
    stdout_json_output_path: parsed?.outputPath,
    stderr_tail: result.stderr ? result.stderr.slice(-800) : undefined,
    error: result.error ? String(result.error.message ?? result.error).slice(0, 240) : undefined
  }
}

function safeConfigSummary(report) {
  return {
    ready_for_remote_probe: report?.ready_for_remote_probe === true,
    missing: Array.isArray(report?.missing) ? report.missing : [],
    settings_found: report?.settings?.found,
    status_dialogue_stt_keys: report?.settings?.status_dialogue_stt_keys,
    sources: report?.sources,
    config: {
      enabled: report?.config?.enabled === true,
      api_key: report?.config?.api_key ? { present: true, length: report.config.api_key.length } : undefined,
      base_url_host: report?.config?.base_url_host,
      endpoint_path_or_url: report?.config?.endpoint_path_or_url,
      endpoint_host: report?.config?.endpoint_host,
      model: report?.config?.model,
      timeout_ms: report?.config?.timeout_ms
    }
  }
}

function main() {
  const configChild = runNodeScript(path.join('scripts', 'validate-status-dialogue-remote-stt-config.cjs'))
  const configParsed = extractFirstJsonObject(configChild.stdout)
  const configReport = readJsonIfExists(configParsed?.outputPath) ?? configParsed
  const configReady = configChild.status === 0 && configReport?.ready_for_remote_probe === true

  const report = {
    schema: 'status_dialogue_remote_stt_acceptance.v1',
    generated_at: new Date().toISOString(),
    boundary:
      'remote STT acceptance chain; config preflight is always read-only; runtime network probe starts only when ready_for_remote_probe=true; no api key logging',
    config_validation: compactChildResult(configChild, configParsed),
    remote_stt_config: safeConfigSummary(configReport),
    network_probe_started: false,
    goal_audit_started: false,
    result: 'remote_stt_config_not_ready',
    ok: true,
    passed: false,
    next_action: 'complete_remote_stt_configuration_before_runtime_probe'
  }

  if (configChild.status !== 0 || !configReport) {
    report.ok = false
    report.result = 'remote_stt_config_validation_failed'
    report.next_action = 'inspect_remote_stt_config_validation_output'
  } else if (!configReady) {
    report.probe_skipped = true
    report.network_allowed = false
    const missing = Array.isArray(configReport?.missing) ? configReport.missing : []
    report.next_action =
      missing.length === 1 && missing.includes('remote_stt_api_key')
        ? 'provide_remote_stt_api_key_then_run_acceptance'
        : missing.includes('remote_stt_enable_flag') &&
            missing.includes('remote_stt_api_key') &&
            missing.includes('remote_stt_base_url_or_full_endpoint')
          ? 'run_voice_remote_stt_config_apply_defaults_then_provide_api_key'
          : 'complete_remote_stt_configuration_before_runtime_probe'
  } else {
    report.network_probe_started = true
    report.network_allowed = true
    const probeChild = runNpmScript('voice:runtime-flow:probe-remote-stt-configured')
    const probeParsed = extractFirstJsonObject(probeChild.stdout)
    const probeReport = readJsonIfExists(probeParsed?.outputPath) ?? probeParsed
    report.remote_probe = {
      ...compactChildResult(probeChild, probeParsed),
      parsed_result: probeReport?.result,
      parsed_ok: probeReport?.ok,
      parsed_passed: probeReport?.passed,
      fallback_reason: probeReport?.evidence?.probe_complete?.fallback_reason ?? probeReport?.fallback_reason
    }

    report.goal_audit_started = true
    const goalChild = runNodeScript(path.join('scripts', 'audit-status-dialogue-goal-completion.cjs'))
    const goalParsed = extractFirstJsonObject(goalChild.stdout)
    const goalReport = readJsonIfExists(goalParsed?.outputPath) ?? goalParsed
    report.goal_audit = {
      ...compactChildResult(goalChild, goalParsed),
      result: goalReport?.result,
      summary: goalReport?.summary,
      next_required_evidence: goalReport?.next_required_evidence
    }

    const probePassed = probeChild.status === 0 && (probeReport?.passed === true || probeReport?.ok === true)
    const goalComplete = goalChild.status === 0 && goalReport?.result === 'complete'
    report.passed = probePassed && goalComplete
    report.ok = report.passed
    report.result = report.passed
      ? 'remote_stt_acceptance_passed'
      : probePassed
        ? 'remote_stt_probe_passed_goal_still_incomplete'
        : 'remote_stt_probe_failed'
    report.next_action = report.passed ? 'remote_stt_goal_completed' : 'inspect_remote_probe_and_goal_audit_evidence'
  }

  fs.mkdirSync(reportDir, { recursive: true })
  const outputPath = path.join(reportDir, `status-dialogue-remote-stt-acceptance-${Date.now()}.json`)
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf8')

  console.log(
    JSON.stringify(
      {
        ok: report.ok,
        outputPath,
        result: report.result,
        passed: report.passed,
        network_probe_started: report.network_probe_started,
        probe_skipped: report.probe_skipped,
        remote_stt_config: report.remote_stt_config,
        remote_probe: report.remote_probe,
        goal_audit: report.goal_audit,
        next_action: report.next_action,
        boundary: report.boundary
      },
      null,
      2
    )
  )

  if (!report.ok && report.network_probe_started) process.exitCode = 1
}

main()
