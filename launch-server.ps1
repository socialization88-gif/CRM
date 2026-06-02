$ErrorActionPreference = 'Stop'

$root = $PSScriptRoot
$node = (Get-Command node -ErrorAction Stop).Source
$pidFile = Join-Path $root 'server.pid'
$outLog = Join-Path $root 'server.out.log'
$errLog = Join-Path $root 'server.err.log'

if (Test-Path $pidFile) {
  $existingPid = [int](Get-Content $pidFile -ErrorAction SilentlyContinue | Select-Object -First 1)
  if ($existingPid -gt 0) {
    try {
      $proc = Get-Process -Id $existingPid -ErrorAction Stop
      Write-Host "Server is already running (PID $existingPid)."
      exit 0
    } catch {
      Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
    }
  }
}

$existing = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($existing) {
  Write-Host "Port 3000 is already in use by PID $($existing.OwningProcess)."
  Write-Host "If this is your server, it is already running."
  exit 0
}

$process = Start-Process `
  -FilePath $node `
  -ArgumentList 'server.js' `
  -WorkingDirectory $root `
  -WindowStyle Hidden `
  -PassThru `
  -RedirectStandardOutput $outLog `
  -RedirectStandardError $errLog

Set-Content -Path $pidFile -Value $process.Id
Write-Host "Server started in background."
Write-Host "PID: $($process.Id)"
Write-Host "Logs: $outLog and $errLog"
