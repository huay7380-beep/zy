const { spawn, spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const repoRoot = path.resolve(__dirname, '..')
const zhinengRoot = process.env.ZHINENG_PROJECT_ROOT
  ? path.resolve(process.env.ZHINENG_PROJECT_ROOT)
  : path.resolve(repoRoot, '..')
const outputDir = path.join(repoRoot, 'runtime', 'verification-reports')
const devLogDir = path.join(repoRoot, 'runtime', 'dev-runtime-logs')

function hasFlag(name) {
  return process.argv.includes(name)
}

function argValue(name, fallback) {
  const prefix = `${name}=`
  const inline = process.argv.find((item) => item.startsWith(prefix))
  if (inline) return inline.slice(prefix.length)
  const index = process.argv.indexOf(name)
  if (index === -1 || index + 1 >= process.argv.length) return fallback
  return process.argv[index + 1]
}

function powershellJson(command) {
  const result = spawnSync('powershell.exe', ['-NoProfile', '-Command', command], {
    encoding: 'utf8',
    windowsHide: true
  })
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || `powershell failed: ${command}`).trim())
  }
  const text = result.stdout.trim()
  if (!text) return []
  const parsed = JSON.parse(text)
  return Array.isArray(parsed) ? parsed : [parsed]
}

function listProcesses(name) {
  return powershellJson(
    `Get-CimInstance Win32_Process -Filter "name = '${name}'" | Select-Object ProcessId,ParentProcessId,CommandLine | ConvertTo-Json -Depth 3`
  )
}

function findRuntimeProcesses() {
  const electronProcesses = listProcesses('electron.exe')
  const nodeProcesses = listProcesses('node.exe')
  const cmdProcesses = listProcesses('cmd.exe')
  const repoNeedle = repoRoot.toLowerCase()
  const devParents = nodeProcesses.filter((processInfo) => {
    const command = String(processInfo.CommandLine || '').toLowerCase()
    return command.includes(repoNeedle) && command.includes('electron-vite') && command.includes(' dev')
  })
  const devLaunchParents = nodeProcesses.filter((processInfo) => {
    const command = String(processInfo.CommandLine || '').toLowerCase()
    return (
      command.includes(repoNeedle) &&
      (command.includes('scripts/dev-launch.mjs') || command.includes('scripts\\dev-launch.mjs'))
    )
  })
  const cmdParents = cmdProcesses.filter((processInfo) => {
    const command = String(processInfo.CommandLine || '').toLowerCase()
    return command.includes(repoNeedle) && command.includes('npm.cmd run dev')
  })
  const parentIds = new Set(
    [...devParents, ...devLaunchParents, ...cmdParents].map((processInfo) => Number(processInfo.ProcessId))
  )
  const mainElectron = electronProcesses.filter((processInfo) => {
    const command = String(processInfo.CommandLine || '').toLowerCase()
    return (
      command.includes('electron.exe .') &&
      !command.includes('--type=') &&
      (command.includes(repoNeedle) || parentIds.has(Number(processInfo.ParentProcessId)))
    )
  })
  const electronChildren = electronProcesses.filter((processInfo) =>
    mainElectron.some((main) => Number(processInfo.ParentProcessId) === Number(main.ProcessId))
  )
  return { mainElectron, electronChildren, devParents, devLaunchParents, cmdParents }
}

function stopProcesses(processes) {
  const ids = processes.map((processInfo) => Number(processInfo.ProcessId)).filter((id) => Number.isInteger(id) && id > 0)
  if (!ids.length) return
  const idList = ids.join(',')
  const result = spawnSync('powershell.exe', ['-NoProfile', '-Command', `Stop-Process -Id ${idList} -Force`], {
    encoding: 'utf8',
    windowsHide: true
  })
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || `failed to stop ${idList}`).trim())
  }
}

function startDevRuntime({
  runtimeProbe,
  chromeSttTestAudio,
  chromeSttTestLanguage,
  chromeSttMaxAttempts,
  chromeSttTimeoutMs,
  remoteSttTestAudio
} = {}) {
  const extraEnv = {}
  if (runtimeProbe) {
    extraEnv.ZHINENG_STATUS_DIALOGUE_RUNTIME_PROBE = runtimeProbe
  }
  if (chromeSttTestAudio) {
    extraEnv.ZHINENG_CHROME_STT_TEST_AUDIO = chromeSttTestAudio
  }
  if (chromeSttTestLanguage) {
    extraEnv.ZHINENG_CHROME_STT_TEST_LANGUAGE = chromeSttTestLanguage
  }
  if (chromeSttMaxAttempts) {
    extraEnv.ZHINENG_CHROME_STT_MAX_ATTEMPTS = chromeSttMaxAttempts
  }
  if (chromeSttTimeoutMs) {
    extraEnv.ZHINENG_CHROME_STT_TIMEOUT_MS = chromeSttTimeoutMs
  }
  if (remoteSttTestAudio) {
    extraEnv.ZHINENG_STATUS_DIALOGUE_REMOTE_STT_TEST_AUDIO = remoteSttTestAudio
  }
  fs.mkdirSync(devLogDir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const stdoutPath = path.join(devLogDir, `status-dialogue-dev-${stamp}.stdout.log`)
  const stderrPath = path.join(devLogDir, `status-dialogue-dev-${stamp}.stderr.log`)
  const stdoutFd = fs.openSync(stdoutPath, 'a')
  const stderrFd = fs.openSync(stderrPath, 'a')
  const child = spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', 'npm.cmd run dev'], {
    cwd: repoRoot,
    detached: true,
    stdio: ['ignore', stdoutFd, stderrFd],
    windowsHide: true,
    env: {
      ...process.env,
      ZHINENG_PROJECT_ROOT: zhinengRoot,
      ZHINENG_STATUS_DIALOGUE_OPEN_GRAPH_ON_START: '1',
      ...extraEnv
    }
  })
  child.unref()
  return {
    pid: child.pid,
    stdoutPath,
    stderrPath
  }
}

function runWaitMarker(sinceMs, { allowProbe = false, requireTtsBudgetMarker = false } = {}) {
  const args = ['scripts/wait-status-dialogue-runtime-marker.cjs', '--since-ms', String(sinceMs), '--wait-ms', '120000']
  if (allowProbe) args.push('--allow-probe')
  if (requireTtsBudgetMarker) args.push('--require-tts-budget-marker')
  const result = spawnSync('node', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    windowsHide: true
  })
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr
  }
}

function writeReport(report) {
  fs.mkdirSync(outputDir, { recursive: true })
  const outputPath = path.join(outputDir, `status-dialogue-real-gui-retest-preflight-${Date.now()}.json`)
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf8')
  return outputPath
}

function waitForProcessTableToSettle() {
  spawnSync('powershell.exe', ['-NoProfile', '-Command', 'Start-Sleep -Milliseconds 1500'], {
    encoding: 'utf8',
    windowsHide: true
  })
}

function countRuntimeProcesses(processes) {
  return (
    processes.mainElectron.length +
    processes.electronChildren.length +
    processes.devParents.length +
    processes.devLaunchParents.length +
    processes.cmdParents.length
  )
}

function main() {
  const execute = hasFlag('--execute')
  const runtimeProbe = argValue('--runtime-probe', '')
  const requireTtsBudgetMarker = hasFlag('--require-tts-budget-marker')
  const rawChromeSttTestAudio = argValue('--chrome-stt-test-audio', '')
  const chromeSttTestLanguage = argValue('--chrome-stt-test-language', '')
  const chromeSttMaxAttempts = argValue('--chrome-stt-max-attempts', '')
  const chromeSttTimeoutMs = argValue('--chrome-stt-timeout-ms', '')
  const rawRemoteSttTestAudio = argValue('--remote-stt-test-audio', '')
  const chromeSttTestAudio = rawChromeSttTestAudio
    ? path.resolve(repoRoot, rawChromeSttTestAudio)
    : ''
  const remoteSttTestAudio = rawRemoteSttTestAudio
    ? path.resolve(repoRoot, rawRemoteSttTestAudio)
    : ''
  const processes = findRuntimeProcesses()
  const report = {
    schema: 'status_dialogue_real_gui_retest_preflight.v1',
    generated_at: new Date().toISOString(),
    repo_root: repoRoot,
    zhineng_root: zhinengRoot,
    execute,
    runtime_probe: runtimeProbe || undefined,
    require_tts_budget_marker: requireTtsBudgetMarker,
    chrome_stt_test_audio: chromeSttTestAudio || undefined,
    chrome_stt_test_audio_exists: chromeSttTestAudio ? fs.existsSync(chromeSttTestAudio) : undefined,
    chrome_stt_test_language: chromeSttTestLanguage || undefined,
    chrome_stt_max_attempts: chromeSttMaxAttempts || undefined,
    chrome_stt_timeout_ms: chromeSttTimeoutMs || undefined,
    remote_stt_test_audio: remoteSttTestAudio || undefined,
    remote_stt_test_audio_exists: remoteSttTestAudio ? fs.existsSync(remoteSttTestAudio) : undefined,
    target_processes: processes,
    actions: []
  }

  if (execute) {
    const stopTargets = [...processes.mainElectron, ...processes.devParents, ...processes.devLaunchParents, ...processes.cmdParents]
    report.actions.push({
      action: 'stop_runtime_processes',
      process_ids: stopTargets.map((processInfo) => processInfo.ProcessId)
    })
    stopProcesses(stopTargets)
    const restartSinceMs = Date.now()
    const started = startDevRuntime({
      runtimeProbe,
      chromeSttTestAudio,
      chromeSttTestLanguage,
      chromeSttMaxAttempts,
      chromeSttTimeoutMs,
      remoteSttTestAudio
    })
    report.actions.push({
      action: 'start_dev_runtime',
      pid: started.pid,
      since_ms: restartSinceMs,
      stdout_log: started.stdoutPath,
      stderr_log: started.stderrPath,
      env: {
        ZHINENG_STATUS_DIALOGUE_OPEN_GRAPH_ON_START: '1',
        ZHINENG_STATUS_DIALOGUE_RUNTIME_PROBE: runtimeProbe || undefined,
        ZHINENG_CHROME_STT_TEST_AUDIO: chromeSttTestAudio || undefined,
        ZHINENG_CHROME_STT_TEST_LANGUAGE: chromeSttTestLanguage || undefined,
        ZHINENG_CHROME_STT_MAX_ATTEMPTS: chromeSttMaxAttempts || undefined,
        ZHINENG_CHROME_STT_TIMEOUT_MS: chromeSttTimeoutMs || undefined,
        ZHINENG_STATUS_DIALOGUE_REMOTE_STT_TEST_AUDIO: remoteSttTestAudio || undefined
      },
      require_tts_budget_marker: requireTtsBudgetMarker
    })
    const markerResult = runWaitMarker(restartSinceMs, {
      allowProbe: Boolean(runtimeProbe),
      requireTtsBudgetMarker
    })
    report.actions.push({
      action: 'wait_runtime_marker',
      status: markerResult.status,
      stdout: markerResult.stdout.slice(-4000),
      stderr: markerResult.stderr.slice(-2000)
    })
    waitForProcessTableToSettle()
    const postStartProcesses = findRuntimeProcesses()
    const postStartRuntimeProcessCount = countRuntimeProcesses(postStartProcesses)
    report.post_start_processes = postStartProcesses
    report.post_start_runtime_process_count = postStartRuntimeProcessCount
    report.actions.push({
      action: 'verify_runtime_process_alive',
      runtime_process_count: postStartRuntimeProcessCount,
      main_electron_process_ids: postStartProcesses.mainElectron.map((processInfo) => processInfo.ProcessId),
      dev_parent_process_ids: postStartProcesses.devParents.map((processInfo) => processInfo.ProcessId),
      dev_launch_process_ids: postStartProcesses.devLaunchParents.map((processInfo) => processInfo.ProcessId),
      cmd_parent_process_ids: postStartProcesses.cmdParents.map((processInfo) => processInfo.ProcessId)
    })
    if (markerResult.status !== 0) {
      report.result = 'marker_missing'
    } else if (postStartRuntimeProcessCount < 1) {
      report.result = 'process_missing_after_marker'
    } else {
      report.result = 'marker_found'
    }
    if (report.result !== 'marker_found') {
      process.exitCode = 1
    }
  } else {
    report.actions.push({
      action: 'dry_run_only',
      note: 'Use --execute to stop exact repo electron-vite/electron processes, restart dev runtime, open graph, and wait for marker.'
    })
    report.result = 'dry_run'
  }

  const outputPath = writeReport(report)
  console.log(
    JSON.stringify(
      {
        ok: report.result === 'dry_run' || report.result === 'marker_found',
        outputPath,
        result: report.result,
        execute,
        main_electron_process_ids: processes.mainElectron.map((processInfo) => processInfo.ProcessId),
        electron_child_process_ids: processes.electronChildren.map((processInfo) => processInfo.ProcessId),
        dev_parent_process_ids: processes.devParents.map((processInfo) => processInfo.ProcessId),
        actions: report.actions
      },
      null,
      2
    )
  )
}

main()
