$ErrorActionPreference = 'Stop'

$root = $PSScriptRoot
$pidFile = Join-Path $root 'server.pid'

function Stop-ByPid([int]$pid) {
  if ($pid -le 0) { return $false }
  try {
    $proc = Get-Process -Id $pid -ErrorAction Stop
    Stop-Process -Id $proc.Id -Force
    Write-Host "Stopped server process PID $pid."
    return $true
  } catch {
    return $false
  }
}

$stopped = $false

if (Test-Path $pidFile) {
  $existingPid = [int](Get-Content $pidFile -ErrorAction SilentlyContinue | Select-Object -First 1)
  if (Stop-ByPid $existingPid) {
    $stopped = $true
  }
  Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
}

if (-not $stopped) {
  $existing = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($existing) {
    try {
      Stop-Process -Id $existing.OwningProcess -Force
      Write-Host "Stopped process listening on port 3000 (PID $($existing.OwningProcess))."
      $stopped = $true
    } catch {
      Write-Host "Could not stop process on port 3000."
    }
  }
}

if (-not $stopped) {
  Write-Host "No running server found."
}
