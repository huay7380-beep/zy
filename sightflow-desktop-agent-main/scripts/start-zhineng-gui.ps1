$ErrorActionPreference = 'Stop'

$appTitle = '人类社交辅助系统v.0.1.0'
$appDir = Split-Path -Parent $PSScriptRoot
$projectRoot = Split-Path -Parent $appDir

$existing = Get-CimInstance Win32_Process | Where-Object {
  $_.ProcessId -ne $PID -and
  $_.Name -eq 'electron.exe' -and
  $_.CommandLine -like '*sightflow-desktop-agent-main*' -and
  $_.CommandLine -like '*electron.exe .*'
} | Select-Object -First 1

if ($existing) {
  try {
    $shell = New-Object -ComObject WScript.Shell
    [void]$shell.AppActivate($appTitle)
  } catch {
    # Existing instance is enough; ignore focus failures.
  }
  exit 0
}

$env:ZHINENG_PROJECT_ROOT = $projectRoot
$env:SIGHTFLOW_OPEN_ZHINENG_CONSOLE = '1'
$env:SIGHTFLOW_FORCE_ZHINENG_BRIDGE = '1'
Set-Location $appDir
npm.cmd run dev
