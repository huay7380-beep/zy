const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const repoRoot = path.resolve(__dirname, '..')
const zhinengRoot = process.env.ZHINENG_PROJECT_ROOT
  ? path.resolve(process.env.ZHINENG_PROJECT_ROOT)
  : path.resolve(repoRoot, '..')
const outputDir = path.join(repoRoot, 'runtime', 'verification-reports')

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
    `[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; Get-CimInstance Win32_Process -Filter "name = '${name}'" | Select-Object ProcessId,ParentProcessId,CommandLine | ConvertTo-Json -Depth 4`
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

function listTopLevelWindows() {
  const command = String.raw`
[Console]::OutputEncoding=[System.Text.Encoding]::UTF8
Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;

public class ZhinengWindowDiagnostics {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

  [DllImport("user32.dll")]
  public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

  [DllImport("user32.dll")]
  public static extern bool IsWindowVisible(IntPtr hWnd);

  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  public static extern int GetWindowTextLength(IntPtr hWnd);

  [DllImport("user32.dll")]
  public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

  [DllImport("user32.dll")]
  public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

  [DllImport("user32.dll", EntryPoint = "GetWindowLongPtr")]
  public static extern IntPtr GetWindowLongPtr64(IntPtr hWnd, int nIndex);

  [DllImport("user32.dll", EntryPoint = "GetWindowLong")]
  public static extern IntPtr GetWindowLong32(IntPtr hWnd, int nIndex);

  public static IntPtr GetWindowLongPtr(IntPtr hWnd, int nIndex) {
    return IntPtr.Size == 8 ? GetWindowLongPtr64(hWnd, nIndex) : GetWindowLong32(hWnd, nIndex);
  }

  public struct RECT {
    public int Left;
    public int Top;
    public int Right;
    public int Bottom;
  }
}
"@

$windows = New-Object System.Collections.Generic.List[object]
$callback = [ZhinengWindowDiagnostics+EnumWindowsProc]{
  param([IntPtr]$hWnd, [IntPtr]$lParam)
  if (-not [ZhinengWindowDiagnostics]::IsWindowVisible($hWnd)) { return $true }

  [uint32]$processId = 0
  [void][ZhinengWindowDiagnostics]::GetWindowThreadProcessId($hWnd, [ref]$processId)

  $length = [ZhinengWindowDiagnostics]::GetWindowTextLength($hWnd)
  $capacity = [Math]::Max($length + 1, 256)
  $builder = New-Object System.Text.StringBuilder $capacity
  [void][ZhinengWindowDiagnostics]::GetWindowText($hWnd, $builder, $builder.Capacity)

  $rect = New-Object ZhinengWindowDiagnostics+RECT
  [void][ZhinengWindowDiagnostics]::GetWindowRect($hWnd, [ref]$rect)

  $style = [ZhinengWindowDiagnostics]::GetWindowLongPtr($hWnd, -16).ToInt64()
  $exStyle = [ZhinengWindowDiagnostics]::GetWindowLongPtr($hWnd, -20).ToInt64()
  $width = $rect.Right - $rect.Left
  $height = $rect.Bottom - $rect.Top

  $windows.Add([pscustomobject]@{
    hwnd = $hWnd.ToInt64()
    process_id = [int]$processId
    title = $builder.ToString()
    visible = $true
    left = $rect.Left
    top = $rect.Top
    right = $rect.Right
    bottom = $rect.Bottom
    width = $width
    height = $height
    style = $style
    ex_style = $exStyle
    layered = (($exStyle -band 0x80000) -ne 0)
    transparent = (($exStyle -band 0x20) -ne 0)
    topmost = (($exStyle -band 0x8) -ne 0)
  })
  return $true
}
[void][ZhinengWindowDiagnostics]::EnumWindows($callback, [IntPtr]::Zero)
$windows | ConvertTo-Json -Depth 5
`
  return powershellJson(command)
}

function processSummary(processInfo) {
  return {
    process_id: Number(processInfo.ProcessId),
    parent_process_id: Number(processInfo.ParentProcessId),
    command: String(processInfo.CommandLine || '').slice(0, 500)
  }
}

function main() {
  const processes = findRuntimeProcesses()
  const windows = listTopLevelWindows()
  const runtimeProcessIds = new Set(
    [...processes.mainElectron, ...processes.electronChildren].map((processInfo) => Number(processInfo.ProcessId))
  )
  const zhinengTitlePattern = /zhineng|世界系统|主体状态|sightflow/i
  const candidateWindows = windows
    .filter((win) => {
      const processId = Number(win.process_id)
      const title = String(win.title || '')
      return (
        runtimeProcessIds.has(processId) ||
        zhinengTitlePattern.test(title)
      ) && Number(win.width) > 0 && Number(win.height) > 0
    })
    .sort((a, b) => Number(b.width) * Number(b.height) - Number(a.width) * Number(a.height))

  const result = candidateWindows.length > 0
    ? 'graph_window_candidates_found'
    : runtimeProcessIds.size > 0
      ? 'runtime_process_found_but_no_visible_graph_window_candidate'
      : 'runtime_process_not_found'

  const report = {
    schema: 'status_dialogue_real_gui_window_diagnosis.v1',
    generated_at: new Date().toISOString(),
    repo_root: repoRoot,
    zhineng_root: zhinengRoot,
    boundary: 'read-only GUI process/window diagnosis; no microphone open; no audio upload; no world write',
    result,
    runtime_processes: {
      main_electron: processes.mainElectron.map(processSummary),
      electron_children: processes.electronChildren.map(processSummary),
      dev_parents: processes.devParents.map(processSummary),
      dev_launch_parents: processes.devLaunchParents.map(processSummary),
      cmd_parents: processes.cmdParents.map(processSummary)
    },
    runtime_process_ids: [...runtimeProcessIds],
    candidate_windows: candidateWindows,
    visible_window_count: windows.length
  }

  fs.mkdirSync(outputDir, { recursive: true })
  const outputPath = path.join(outputDir, `status-dialogue-real-gui-window-diagnosis-${Date.now()}.json`)
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf8')

  console.log(
    JSON.stringify(
      {
        ok: result !== 'runtime_process_not_found',
        outputPath,
        result,
        runtime_process_ids: report.runtime_process_ids,
        candidate_window_count: candidateWindows.length,
        candidate_windows: candidateWindows.slice(0, 6),
        boundary: report.boundary
      },
      null,
      2
    )
  )
}

main()
