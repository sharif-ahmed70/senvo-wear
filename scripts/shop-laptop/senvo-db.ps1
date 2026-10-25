# Starts / stops the portable PostgreSQL in C:\SENVO and runs the daily backup.
# Used by senvo-start.cmd, senvo-stop.cmd and senvo-backup.cmd.
#   -Action start   start the database (hidden, waits up to 10 min for recovery)
#   -Action stop    shut the database down cleanly
#   -Action backup  run the daily backup; starts the database first if needed
#                   and stops it again afterwards
param([ValidateSet("start", "stop", "backup")][string]$Action = "start")

$bin = "C:\SENVO\pgsql\bin"
$data = "C:\SENVO\pgdata"
$ctl = Join-Path $bin "pg_ctl.exe"

function Test-DbRunning {
  & $ctl -D $data status *> $null
  return $LASTEXITCODE -eq 0
}

function Test-DbReady {
  & (Join-Path $bin "pg_isready.exe") -h 127.0.0.1 -p 5432 -t 5 *> $null
  return $LASTEXITCODE -eq 0
}

function Clear-DbPort {
  # Another program on 5432 (not this SENVO PostgreSQL) would block ours.
  $ours = Join-Path $bin "postgres.exe"
  Get-NetTCPConnection -LocalPort 5432 -State Listen -ErrorAction SilentlyContinue | ForEach-Object {
    $proc = Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue
    if ($proc -and $proc.Path -ne $ours) {
      Write-Host "  Port 5432 onno program ($($proc.ProcessName)) dhore rekhechilo, bondho korchi..."
      Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
      Start-Sleep -Seconds 2
    }
  }
}

function Start-Db {
  if (-not (Test-DbRunning)) {
    Clear-DbPort
    # Own hidden console, so closing the SENVO window never kills the database.
    # A crash-recovery after a hard power-off can take minutes on this HDD.
    $p = Start-Process $ctl -WindowStyle Hidden -PassThru -ArgumentList @(
      "-D", "`"$data`"", "-l", "`"$data\server.log`"", "-w", "-t", "600", "start")
    $p.WaitForExit()
  }
  for ($i = 0; $i -lt 120 -and -not (Test-DbReady); $i++) { Start-Sleep -Seconds 5 }
  return (Test-DbReady)
}

function Stop-Db {
  if (Test-DbRunning) { & $ctl -D $data -m fast -w -t 120 stop *> $null }
}

switch ($Action) {
  "start" {
    if (Start-Db) { Write-Host "  Database OK." ; exit 0 }
    Write-Host "  Database chalu hoyni. $data\server.log dekhun." -ForegroundColor Red
    exit 1
  }
  "stop" { Stop-Db; exit 0 }
  "backup" {
    $wasRunning = Test-DbRunning
    if (-not (Start-Db)) { exit 1 }
    & powershell -NoProfile -ExecutionPolicy Bypass -File "C:\xampp\htdocs\SENVO Wear\scripts\backup-db.ps1" `
      -Database senvo_wear_dev -Port 5432 -PgBin $bin -OutDir "C:\SENVO\backups"
    $code = $LASTEXITCODE
    if (-not $wasRunning) { Stop-Db }
    exit $code
  }
}
