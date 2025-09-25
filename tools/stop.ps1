Param()
Write-Host "Stopping dev servers..." -ForegroundColor Cyan

$ErrorActionPreference = 'SilentlyContinue'

# Ports to target (Vite and backend)
$ports = @(5173,5174,5175,5176,5177,5178,5179,5180,5181,5182,5183,5184)

# Kill listeners on ports
$conns = Get-NetTCPConnection -State Listen | Where-Object { $ports -contains $_.LocalPort }
if ($conns) {
  $pids = $conns | Select-Object -ExpandProperty OwningProcess -Unique
  if ($pids) {
    Write-Host "Killing by port PIDs: $($pids -join ', ')"
    foreach ($procId in $pids) { Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue }
  }
}

# Kill node/tsx processes started from this repo path
$repo = Split-Path $PSScriptRoot -Parent
$procs = Get-CimInstance Win32_Process | Where-Object {
  ($_.Name -match 'node.exe|tsx.exe') -and ($_.CommandLine -like "*$repo*")
}
if ($procs) {
  $p2 = $procs | Select-Object -ExpandProperty ProcessId
  if ($p2) {
    Write-Host "Killing by path PIDs: $($p2 -join ', ')"
    foreach ($procId in $p2) { Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue }
  }
}

Start-Sleep -Milliseconds 200

# Show remaining listeners on target ports
$left = Get-NetTCPConnection -State Listen | Where-Object { $ports -contains $_.LocalPort }
if ($left) {
  Write-Host "Still listening:" -ForegroundColor Yellow
  $left | Select-Object LocalAddress,LocalPort,OwningProcess | Sort-Object LocalPort | Format-Table -AutoSize
} else {
  Write-Host "All target ports are free." -ForegroundColor Green
}
