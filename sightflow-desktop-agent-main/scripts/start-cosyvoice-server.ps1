param(
  [string]$Python = "D:\zhineng\third_party\envs\cosyvoice\python.exe",
  [string]$Server = "D:\zhineng\sightflow-desktop-agent-main\scripts\cosyvoice-openai-compatible-server.py",
  [string]$WorkingDirectory = "D:\zhineng\third_party\CosyVoice",
  [string]$HostName = "127.0.0.1",
  [int]$Port = 8000
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $Python)) {
  throw "CosyVoice Python not found: $Python"
}

if (-not (Test-Path -LiteralPath $Server)) {
  throw "CosyVoice server script not found: $Server"
}

Push-Location $WorkingDirectory
try {
  & $Python $Server --host $HostName --port $Port
} finally {
  Pop-Location
}
