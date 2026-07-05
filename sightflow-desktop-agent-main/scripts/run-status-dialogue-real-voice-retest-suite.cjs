const childProcess = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const repoRoot = path.resolve(__dirname, '..')
const outputDir = path.join(repoRoot, 'runtime', 'verification-reports')

function argValue(name, fallback) {
  const index = process.argv.indexOf(name)
  if (index === -1 || index + 1 >= process.argv.length) return fallback
  return process.argv[index + 1]
}

function hasFlag(name) {
  return process.argv.includes(name)
}

function parseJsonOutput(stdout) {
  const text = String(stdout ?? '').trim()
  if (!text) return undefined
  try {
    return JSON.parse(text)
  } catch (_) {
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1))
      } catch (_) {
        return undefined
      }
    }
    return undefined
  }
}

function runNodeStep(id, scriptName, args = []) {
  const child = childProcess.spawnSync(process.execPath, [path.join('scripts', scriptName), ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: process.env,
    windowsHide: true
  })
  const parsed = parseJsonOutput(child.stdout)
  return {
    id,
    command: ['node', path.join('scripts', scriptName), ...args].join(' '),
    exit_code: typeof child.status === 'number' ? child.status : 1,
    ok: child.status === 0,
    parsed,
    stderr_tail: String(child.stderr ?? '').trim().slice(-1200),
    stdout_tail: parsed ? undefined : String(child.stdout ?? '').trim().slice(-1200)
  }
}

function statusOf(step) {
  if (!step) return undefined
  const parsed = step.parsed ?? {}
  return parsed.result ?? parsed.status ?? (parsed.ok === true ? 'passed' : undefined)
}

function nextActionFromReport({ entry, turns, remoteConfig, goal }) {
  const entryAction = entry?.parsed?.next_action
  const turnAction = turns?.parsed?.preflight?.next_action
  const remoteAction = remoteConfig?.parsed?.next_action
  const goalNext = goal?.parsed?.next_required_evidence?.[0]

  if (turns?.parsed?.passed !== true) {
    if (entryAction && entryAction !== 'real_gui_stt_entry_chain_proved') return entryAction
    if (turnAction) return turnAction
  }
  if (remoteConfig?.parsed?.ready_for_remote_probe === false && remoteAction) return remoteAction
  if (goal?.parsed?.result === 'incomplete' && goalNext) return goalNext
  return 'real_voice_retest_suite_passed'
}

function compactStep(step) {
  return {
    id: step.id,
    ok: step.ok,
    exit_code: step.exit_code,
    status: statusOf(step),
    outputPath: step.parsed?.outputPath,
    next_action: step.parsed?.next_action ?? step.parsed?.preflight?.next_action,
    result: step.parsed?.result,
    status_value: step.parsed?.status,
    passed: step.parsed?.passed,
    checks: step.parsed?.checks,
    metrics: step.parsed?.metrics,
    counts: step.parsed?.counts,
    missing: step.parsed?.missing,
    preflight: step.parsed?.preflight,
    remote_missing: step.parsed?.missing,
    stderr_tail: step.stderr_tail || undefined,
    stdout_tail: step.stdout_tail || undefined
  }
}

function main() {
  const waitMs = Math.max(0, Number(argValue('--wait-ms', '0')))
  const minTurns = Math.max(1, Number(argValue('--min-turns', '2')))
  const sinceNow = hasFlag('--since-now')
  const explicitSinceMs = Number(argValue('--since-ms', 'NaN'))
  const hasExplicitSinceMs = Number.isFinite(explicitSinceMs) && explicitSinceMs > 0
  const sinceMs = hasExplicitSinceMs ? explicitSinceMs : sinceNow ? Date.now() : undefined
  const sinceArgs = sinceMs ? ['--since-ms', String(sinceMs)] : []
  const commonTurnArgs = ['--min-turns', String(minTurns), ...sinceArgs]

  const startedAt = new Date().toISOString()
  const preEntry = runNodeStep('pre_entry_diagnosis', 'diagnose-status-dialogue-real-stt-entry.cjs', [
    ...commonTurnArgs,
    '--wait-ms',
    '0'
  ])
  const turns = runNodeStep('real_voice_turns', 'wait-status-dialogue-real-voice-turns.cjs', [
    ...commonTurnArgs,
    '--wait-ms',
    String(waitMs)
  ])
  const postEntry = runNodeStep('post_entry_diagnosis', 'diagnose-status-dialogue-real-stt-entry.cjs', [
    ...commonTurnArgs,
    '--wait-ms',
    '0'
  ])
  const runtimeAudit = runNodeStep('runtime_voice_flow_audit', 'audit-status-dialogue-runtime-voice-flow.cjs')
  const remoteConfig = runNodeStep('remote_stt_config_preflight', 'validate-status-dialogue-remote-stt-config.cjs')
  const goal = runNodeStep('goal_completion_audit', 'audit-status-dialogue-goal-completion.cjs')

  const suitePassed =
    turns.parsed?.passed === true &&
    postEntry.parsed?.passed === true &&
    runtimeAudit.parsed?.ok === true &&
    remoteConfig.parsed?.ok === true &&
    goal.parsed?.ok === true
  const report = {
    schema: 'status_dialogue_real_voice_retest_suite.v1',
    generated_at: new Date().toISOString(),
    started_at: startedAt,
    boundary:
      'read-only orchestration of existing diagnostics; does not open microphone by itself; no audio upload; no world write; no requirement packet',
    wait_ms: waitMs,
    min_turns: minTurns,
    since_ms: sinceMs,
    result: suitePassed ? 'passed' : 'incomplete',
    passed: suitePassed,
    next_action: nextActionFromReport({ entry: postEntry, turns, remoteConfig, goal }),
    summary: {
      pre_entry: statusOf(preEntry),
      turns: statusOf(turns),
      post_entry: statusOf(postEntry),
      runtime_audit: statusOf(runtimeAudit),
      remote_config_ready_for_probe: remoteConfig.parsed?.ready_for_remote_probe,
      remote_config_missing: remoteConfig.parsed?.missing,
      goal_result: goal.parsed?.result,
      goal_summary: goal.parsed?.summary
    },
    steps: [preEntry, turns, postEntry, runtimeAudit, remoteConfig, goal].map(compactStep)
  }

  fs.mkdirSync(outputDir, { recursive: true })
  const outputPath = path.join(outputDir, `status-dialogue-real-voice-retest-suite-${Date.now()}.json`)
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf8')

  console.log(
    JSON.stringify(
      {
        ok: report.passed,
        outputPath,
        result: report.result,
        next_action: report.next_action,
        summary: report.summary,
        wait_ms: report.wait_ms,
        min_turns: report.min_turns,
        since_ms: report.since_ms,
        boundary: report.boundary
      },
      null,
      2
    )
  )

  if (!report.passed) process.exitCode = 1
}

main()
