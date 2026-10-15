# Daily backup of the SENVO Wear development database (pg_dump, custom format).
#
# Writes senvo_wear_dev-daily-YYYYMMDD-HHmmss.dump into the target folder and
# keeps only the newest N of THOSE files. Any other file in the folder (for
# example the manual pre-migration dumps) is never touched.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts\backup-db.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\backup-db.ps1 -Keep 14 -PgBin "C:\Program Files\PostgreSQL\17\bin"
#
# Credentials: uses PGUSER/PGPASSWORD/PGPASSFILE or a trust-auth local server.
# No password is read from or written to the repo .env.
param(
  [string]$Database = "senvo_wear_dev",
  [string]$PgHost = "127.0.0.1",
  [int]$Port = 5432,
  [string]$User = "postgres",
  [string]$OutDir = "C:\SENVO_TRANSFER\DATABASE",
  [int]$Keep = 14,
  [string]$PgBin = ""
)
$ErrorActionPreference = "Stop"

function Find-PgTool($name) {
  if ($PgBin) { $p = Join-Path $PgBin "$name.exe"; if (Test-Path $p) { return $p } }
  $cmd = Get-Command $name -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  foreach ($dir in @("C:\Users\$env:USERNAME\pgsql\bin", "C:\Program Files\PostgreSQL\17\bin")) {
    $p = Join-Path $dir "$name.exe"
    if (Test-Path $p) { return $p }
  }
  throw "$name.exe not found. Pass -PgBin <folder containing pg_dump.exe>."
}

$pgDump = Find-PgTool "pg_dump"
$pgRestore = Find-PgTool "pg_restore"
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$final = Join-Path $OutDir "$Database-daily-$stamp.dump"
$partial = "$final.partial"

& $pgDump -h $PgHost -p $Port -U $User -w -Fc -f $partial $Database
if ($LASTEXITCODE -ne 0) { Remove-Item $partial -ErrorAction SilentlyContinue; throw "pg_dump failed (exit $LASTEXITCODE)." }

# Verify the archive is readable before it counts as a backup.
& $pgRestore --list $partial | Out-Null
if ($LASTEXITCODE -ne 0) { Remove-Item $partial -ErrorAction SilentlyContinue; throw "Backup verification failed; dump removed." }

Move-Item $partial $final
Write-Host ("Backup OK: {0} ({1:N0} bytes)" -f $final, (Get-Item $final).Length)

# Retention: only our own daily files, newest $Keep kept.
$mine = Get-ChildItem -Path $OutDir -Filter "$Database-daily-*.dump" -File | Sort-Object Name -Descending
$mine | Select-Object -Skip $Keep | ForEach-Object {
  Write-Host "Removing old daily backup: $($_.Name)"
  Remove-Item $_.FullName
}
