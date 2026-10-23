# Starts SENVO Wear on a local Windows machine: API :4000, Storefront :3000,
# Admin :3001. Works from any clone location (the repo is this script's parent).
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\start-local.ps1
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\start-local.ps1 -Stop
#
# Reads the repo .env into the services' environment (values are never
# printed). Logs: .senvo-runtime\logs\*.log (gitignored).
param([switch]$Stop)

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
$runtime = Join-Path $repo ".senvo-runtime"
$logs = Join-Path $runtime "logs"
$ports = 3000, 3001, 4000

function Stop-Ports {
  foreach ($port in $ports) {
    Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
      ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
  }
}

if ($Stop) {
  Stop-Ports
  Write-Host "Stopped anything listening on ports $($ports -join ', ')."
  return
}

if (-not (Test-Path (Join-Path $repo ".env"))) {
  throw ".env is missing. Copy .env.example to .env and fill it in (see docs/LOCAL_SETUP.md)."
}
if (-not (Test-Path (Join-Path $repo "node_modules"))) {
  throw "Dependencies are missing. Run: pnpm install; pnpm db:generate"
}

# Start PostgreSQL if it is installed as a Windows service and stopped.
Get-Service -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -like "*postgresql*" -and $_.Status -ne "Running" } |
  ForEach-Object {
    try { Start-Service $_.Name } catch { Write-Warning "Could not start $($_.Name): run this window as Administrator or start PostgreSQL yourself." }
  }

Stop-Ports
New-Item -ItemType Directory -Force -Path $logs | Out-Null

# Services are launched through WMI so they keep running after this window
# closes; they do not inherit this shell's environment, so .env is written to
# a cmd file in the gitignored runtime folder and called first.
$envCmd = Join-Path $runtime "runtime-env.cmd"
$lines = @("@echo off")
Get-Content (Join-Path $repo ".env") | ForEach-Object {
  if ($_ -match '^\s*([A-Z0-9_]+)=(.*)$') {
    $value = $Matches[2].Trim()
    if ($value.Length -ge 2 -and $value.StartsWith('"') -and $value.EndsWith('"')) {
      $value = $value.Substring(1, $value.Length - 2)
    }
    $lines += "set `"$($Matches[1])=$value`""
  }
}
Set-Content -Path $envCmd -Value $lines -Encoding ASCII

function Start-Service-Detached($name, $command) {
  $log = Join-Path $logs "$name.log"
  $line = "cmd.exe /c `"call `"$envCmd`" && $command > `"$log`" 2>&1`""
  $result = Invoke-CimMethod -ClassName Win32_Process -MethodName Create `
    -Arguments @{ CommandLine = $line; CurrentDirectory = $repo }
  if ($result.ReturnValue -ne 0) { throw "Failed to start $name." }
}

Start-Service-Detached "api" "pnpm dev:api"
Start-Service-Detached "storefront" "pnpm dev:storefront"
Start-Service-Detached "admin" "pnpm dev:admin"

Write-Host "Starting... the API builds first, so this takes 1-3 minutes."
$checks = [ordered]@{
  "API       " = "http://localhost:4000/storefront/catalog?page=1&pageSize=1"
  "Admin     " = "http://localhost:3001/login"
  "Storefront" = "http://localhost:3000/"
}
foreach ($entry in $checks.GetEnumerator()) {
  $ok = $false
  for ($i = 0; $i -lt 100 -and -not $ok; $i++) {
    try {
      $ok = (Invoke-WebRequest -UseBasicParsing -TimeoutSec 60 $entry.Value).StatusCode -eq 200
    } catch { Start-Sleep -Seconds 3 }
  }
  Write-Host ("{0}  {1}  {2}" -f $entry.Key, $(if ($ok) { "OK  " } else { "FAIL" }), $entry.Value)
}
Write-Host "Logs: $logs"
Write-Host "If something shows FAIL, read its log, then run this script again (servers sometimes stop on the first start)."
