# One-shot SENVO Wear setup for a Windows laptop, without admin rights.
#
# Run it from an unzipped SENVO portable package (the folder that holds
# SENVO-Wear-source.zip, TOOLS\, DATABASE\ and MEDIA\):
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File setup-senvo.ps1
#
# It picks the mode by itself:
# - NEW:    no project .env yet. Installs portable Node 22, pnpm 11.11.0 and a
#           portable PostgreSQL 17 (localhost only, no password) under
#           C:\SENVO, unpacks the code, restores the bundled shop data and
#           pictures, and starts everything.
# - UPDATE: the project folder already has a .env. Keeps that .env, the
#           pictures and the existing database. Takes a database backup first,
#           swaps in the new code (the old folder is renamed, never deleted),
#           applies new migrations and starts everything.
#
# Safety: never drops, resets or overwrites a database, never deletes a
# folder, never prints secrets. Re-running is safe: finished steps are
# skipped. Log: C:\SENVO\setup-logs\.
param(
  [string]$PackageDir = $PSScriptRoot,
  [string]$ProjectDir = "C:\xampp\htdocs\SENVO Wear",
  [string]$ToolsRoot = "C:\SENVO",
  # Rehearsal on a machine that already runs SENVO: does not create the daily
  # task or the desktop shortcuts (they would replace the real ones).
  [switch]$Rehearsal
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$logDir = Join-Path $ToolsRoot "setup-logs"
$backupDir = Join-Path $ToolsRoot "backups"
New-Item -ItemType Directory -Force -Path $ToolsRoot, $logDir, $backupDir | Out-Null
Start-Transcript -Path (Join-Path $logDir "setup-$stamp.log") | Out-Null

$database = "senvo_wear_dev"
$pnpmVersion = "11.11.0"
$summary = [ordered]@{}

function Step($text) { Write-Host ""; Write-Host "==> $text" -ForegroundColor Cyan }
function Note($text) { Write-Host "    $text" }
function Fail($text) {
  Write-Host ""; Write-Host "SETUP STOPPED: $text" -ForegroundColor Red
  Stop-Transcript | Out-Null
  exit 1
}
function Invoke-Checked([string]$label, [scriptblock]$block) {
  & $block
  if ($LASTEXITCODE -ne 0) { Fail "$label failed (exit $LASTEXITCODE). See the log in $logDir." }
}
function Add-UserPath([string]$dir) {
  $user = [Environment]::GetEnvironmentVariable("Path", "User")
  $parts = @()
  if ($user) { $parts = $user -split ";" | Where-Object { $_ -and ($_ -ne $dir) } }
  [Environment]::SetEnvironmentVariable("Path", (@($dir) + $parts) -join ";", "User")
  $env:Path = "$dir;$env:Path"
}
function Read-DotEnv([string]$path) {
  $values = @{}
  Get-Content $path | ForEach-Object {
    if ($_ -match '^\s*([A-Z0-9_]+)=(.*)$') {
      $v = $Matches[2].Trim()
      if ($v.Length -ge 2 -and $v.StartsWith('"') -and $v.EndsWith('"')) { $v = $v.Substring(1, $v.Length - 2) }
      $values[$Matches[1]] = $v
    }
  }
  return $values
}
function Test-Port([int]$port) {
  return [bool](Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
}
function Stop-SenvoPorts {
  foreach ($port in 3000, 3001, 4000) {
    Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
      ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
  }
}
function Find-PgBin([hashtable]$envValues) {
  $candidates = @()
  if ($envValues -and $envValues["SENVO_PG_BIN"]) { $candidates += $envValues["SENVO_PG_BIN"] }
  $candidates += (Join-Path $ToolsRoot "pgsql\bin")
  $candidates += "C:\Users\$env:USERNAME\pgsql\bin"
  $candidates += Get-ChildItem "C:\Program Files\PostgreSQL" -Directory -ErrorAction SilentlyContinue |
    Sort-Object Name -Descending | ForEach-Object { Join-Path $_.FullName "bin" }
  foreach ($dir in $candidates) { if (Test-Path (Join-Path $dir "pg_dump.exe")) { return $dir } }
  $cmd = Get-Command pg_dump -ErrorAction SilentlyContinue
  if ($cmd) { return Split-Path $cmd.Source }
  return $null
}
function Set-PgEnvFromUrl([string]$url) {
  # postgresql://user[:password]@host:port/db  (password only into this process)
  $u = [Uri]$url
  $userInfo = $u.UserInfo -split ":", 2
  $env:PGHOST = $u.Host
  $env:PGPORT = [string]$u.Port
  $env:PGUSER = [Uri]::UnescapeDataString($userInfo[0])
  if ($userInfo.Count -gt 1) { $env:PGPASSWORD = [Uri]::UnescapeDataString($userInfo[1]) }
  else { Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue }
  return $u.Port
}

# ---------------------------------------------------------------- checks
Step "Checking the package"
$sourceZip = Join-Path $PackageDir "SENVO-Wear-source.zip"
foreach ($required in $sourceZip, (Join-Path $PackageDir "TOOLS"), (Join-Path $PackageDir "SOURCE_COMMIT.txt")) {
  if (-not (Test-Path $required)) { Fail "Missing $required. Unzip the whole package first." }
}
Get-ChildItem $PackageDir -Recurse -File -Include *.ps1, *.cmd -ErrorAction SilentlyContinue | Unblock-File -ErrorAction SilentlyContinue
$freeGb = [math]::Round((Get-PSDrive ($ProjectDir.Substring(0, 1))).Free / 1GB, 1)
Note "Free space on $($ProjectDir.Substring(0, 2)) $freeGb GB"
if ($freeGb -lt 4) { Fail "At least 4 GB free space is needed on $($ProjectDir.Substring(0, 2))." }

$existingEnvPath = Join-Path $ProjectDir ".env"
$mode = "NEW"
if (Test-Path $existingEnvPath) { $mode = "UPDATE" }
$summary["Mode"] = $mode
Note "Mode: $mode"

# ---------------------------------------------------------------- Node
Step "Node.js 22"
$nodeOk = $false
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if ($nodeCmd) {
  $v = [version]((& node -v).TrimStart("v"))
  $nodeOk = $v -ge [version]"22.13.0"
  Note "Found Node $v at $($nodeCmd.Source)"
}
if (-not $nodeOk) {
  $nodeZip = Get-ChildItem (Join-Path $PackageDir "TOOLS") -Filter "node-v22*-win-x64.zip" | Select-Object -First 1
  if (-not $nodeZip) { Fail "TOOLS\node-v22*-win-x64.zip is missing from the package." }
  $nodeHome = Join-Path $ToolsRoot "node"
  if (-not (Test-Path (Join-Path $nodeHome "node.exe"))) {
    $tmp = Join-Path $ToolsRoot "node-unzip"
    Expand-Archive -Path $nodeZip.FullName -DestinationPath $tmp -Force
    $inner = Get-ChildItem $tmp -Directory | Select-Object -First 1
    Move-Item $inner.FullName $nodeHome
    Remove-Item $tmp -Recurse -Force
  }
  Add-UserPath $nodeHome
  Note "Installed portable Node $((& node -v)) in $nodeHome"
}
$summary["Node"] = (& node -v)

# ---------------------------------------------------------------- pnpm
Step "pnpm $pnpmVersion"
$pnpmOk = $false
if (Get-Command pnpm -ErrorAction SilentlyContinue) {
  $pnpmOk = ((& pnpm -v 2>$null) -eq $pnpmVersion)
}
if (-not $pnpmOk) {
  $pnpmHome = Join-Path $ToolsRoot "pnpm"
  if (-not (Test-Path (Join-Path $pnpmHome "pnpm.cmd"))) {
    $npm = Join-Path (Split-Path (Get-Command node).Source) "npm.cmd"
    Invoke-Checked "Installing pnpm" { & $npm install --prefix $pnpmHome "pnpm@$pnpmVersion" --no-audit --no-fund --loglevel error }
  }
  Add-UserPath $pnpmHome
}
$summary["pnpm"] = (& pnpm -v)
Note "pnpm $($summary['pnpm'])"

# ---------------------------------------------------------------- code
Step "Project code"
$packageCommit = (Get-Content (Join-Path $PackageDir "SOURCE_COMMIT.txt") -First 1).Trim()
$summary["Code version"] = $packageCommit
$marker = Join-Path $ProjectDir ".senvo-source-commit"
$oldDir = $null
if ($mode -eq "UPDATE") { $envValues = Read-DotEnv $existingEnvPath }
$current = $null
if (Test-Path $marker) { $current = (Get-Content $marker -First 1).Trim() }
if ((Test-Path $ProjectDir) -and ($current -ne $packageCommit)) {
  # Different or unknown code: set the folder aside (renamed, never deleted).
  Stop-SenvoPorts
  $oldDir = "$ProjectDir.old-$stamp"
  try { Rename-Item -Path $ProjectDir -NewName (Split-Path $oldDir -Leaf) }
  catch { Fail "Could not rename $ProjectDir. Close VS Code, terminals and browsers using it, then run setup again." }
  Note "Old folder kept as $oldDir"
}
if (-not (Test-Path $ProjectDir)) {
  $tmp = Join-Path $ToolsRoot "source-unzip-$stamp"
  Expand-Archive -Path $sourceZip -DestinationPath $tmp -Force
  $inner = Get-ChildItem $tmp -Directory | Select-Object -First 1
  New-Item -ItemType Directory -Force -Path (Split-Path $ProjectDir) | Out-Null
  Move-Item $inner.FullName $ProjectDir
  Remove-Item $tmp -Recurse -Force
  Set-Content -Path $marker -Value $packageCommit -Encoding ASCII
  Note "Code $packageCommit unpacked to $ProjectDir"
} else {
  Note "Code $packageCommit is already in $ProjectDir"
}
if ($oldDir) {
  foreach ($keep in ".env", ".senvo-media") {
    $from = Join-Path $oldDir $keep
    $to = Join-Path $ProjectDir $keep
    if ((Test-Path $from) -and -not (Test-Path $to)) { Copy-Item $from $to -Recurse }
  }
  Note "Copied the old .env and pictures into the new folder"
}

# ---------------------------------------------------------------- PostgreSQL
Step "PostgreSQL 17"
if ($mode -eq "NEW") {
  $pgHome = Join-Path $ToolsRoot "pgsql"
  $pgData = Join-Path $ToolsRoot "pgdata"
  if (-not (Test-Path (Join-Path $pgHome "bin\pg_ctl.exe"))) {
    Copy-Item (Join-Path $PackageDir "TOOLS\pgsql") $pgHome -Recurse
  }
  $pgBin = Join-Path $pgHome "bin"
  if (Test-Path (Join-Path $pgData "PG_VERSION")) {
    $pgPort = [int]((Select-String -Path (Join-Path $pgData "postgresql.auto.conf"), (Join-Path $pgData "postgresql.conf") -Pattern '^\s*port\s*=\s*(\d+)' |
      Select-Object -Last 1).Matches[0].Groups[1].Value)
    Note "Reusing the existing data folder $pgData (port $pgPort)"
  } else {
    $pgPort = 5432
    if (Test-Port 5432) { $pgPort = 5433; Note "Port 5432 is used by another PostgreSQL; using 5433" }
    Invoke-Checked "initdb" { & (Join-Path $pgBin "initdb.exe") -D $pgData -U postgres -A trust -E UTF8 --locale=C }
    Add-Content -Path (Join-Path $pgData "postgresql.conf") -Value "`nlisten_addresses = '127.0.0.1'`nport = $pgPort"
  }
  if (-not (Test-Port $pgPort)) {
    Invoke-Checked "Starting PostgreSQL" { & (Join-Path $pgBin "pg_ctl.exe") -D $pgData -l (Join-Path $pgData "server.log") -w start }
  }
  $databaseUrl = "postgresql://postgres@127.0.0.1:$pgPort/$database"
} else {
  $databaseUrl = $envValues["DATABASE_URL"]
  if (-not $databaseUrl) { Fail "The existing .env has no DATABASE_URL." }
  $pgBin = Find-PgBin $envValues
  if (-not $pgBin) { Fail "PostgreSQL tools (pg_dump) were not found on this laptop." }
  $pgPort = ([Uri]$databaseUrl).Port
  if ($envValues["SENVO_PG_BIN"] -and $envValues["SENVO_PG_DATA"] -and -not (Test-Port $pgPort)) {
    Invoke-Checked "Starting PostgreSQL" { & (Join-Path $envValues["SENVO_PG_BIN"] "pg_ctl.exe") -D $envValues["SENVO_PG_DATA"] -l (Join-Path $envValues["SENVO_PG_DATA"] "server.log") -w start }
  }
  if (-not (Test-Port $pgPort)) {
    Get-Service -ErrorAction SilentlyContinue | Where-Object { $_.Name -like "*postgresql*" -and $_.Status -ne "Running" } |
      ForEach-Object { try { Start-Service $_.Name } catch { } }
    Start-Sleep -Seconds 3
  }
  if (-not (Test-Port $pgPort)) { Fail "PostgreSQL is not running on port $pgPort and could not be started." }
}
$database = ([Uri]$databaseUrl).AbsolutePath.TrimStart("/")
Set-PgEnvFromUrl $databaseUrl | Out-Null
$psql = Join-Path $pgBin "psql.exe"
Note "PostgreSQL tools: $pgBin, port $pgPort"
$summary["PostgreSQL"] = (& (Join-Path $pgBin "postgres.exe") --version)

# ---------------------------------------------------------------- .env
Step ".env"
$envPath = Join-Path $ProjectDir ".env"
if (-not (Test-Path $envPath)) {
  $secret = & node -e "process.stdout.write(require('crypto').randomBytes(32).toString('base64'))"
  $media = (Join-Path $ProjectDir ".senvo-media") -replace "\\", "/"
  $lines = @(
    "# Created by setup-senvo.ps1 on $stamp. Private: never commit or share.",
    "APP_ENV=development",
    "NEXT_PUBLIC_APP_ENV=development",
    "DATABASE_URL=$databaseUrl",
    "STOREFRONT_ORGANIZATION_CODE=SENVO",
    "NEXT_PUBLIC_SENVO_API_URL=http://localhost:4000",
    "SENVO_API_PORT=4000",
    "SENVO_API_ALLOWED_ORIGIN=http://localhost:3000,http://localhost:3001,http://127.0.0.1:3000,http://127.0.0.1:3001,http://localhost:3002,http://127.0.0.1:3002",
    "AUTH_SECRET=$secret",
    "MEDIA_STORAGE_ROOT=`"$media`"",
    "SSLCOMMERZ_ENABLED=false",
    "GOOGLE_CLIENT_ID=",
    "GOOGLE_CLIENT_SECRET=",
    "GOOGLE_REDIRECT_URI=",
    "# Portable PostgreSQL started by scripts\start-local.ps1",
    "SENVO_PG_BIN=$pgBin",
    "SENVO_PG_DATA=$pgData"
  )
  Set-Content -Path $envPath -Value $lines -Encoding ASCII
  Note "Created .env with a fresh AUTH_SECRET (not shown)"
} else {
  Note "Using the existing .env"
}
$envValues = Read-DotEnv $envPath
foreach ($key in $envValues.Keys) { Set-Item -Path "Env:$key" -Value $envValues[$key] }

# ---------------------------------------------------------------- pictures
Step "Product pictures"
$mediaRoot = $envValues["MEDIA_STORAGE_ROOT"]
if (-not $mediaRoot) { $mediaRoot = Join-Path $ProjectDir ".senvo-media" }
$mediaRoot = $mediaRoot -replace "/", "\"
$bundledMedia = Join-Path $PackageDir "MEDIA\.senvo-media"
$hasMedia = (Test-Path $mediaRoot) -and (Get-ChildItem $mediaRoot -Recurse -File -ErrorAction SilentlyContinue | Select-Object -First 1)
if (-not $hasMedia -and (Test-Path $bundledMedia)) {
  New-Item -ItemType Directory -Force -Path $mediaRoot | Out-Null
  Copy-Item (Join-Path $bundledMedia "*") $mediaRoot -Recurse -Force
  Note "Copied the bundled pictures to $mediaRoot"
} else {
  Note "Pictures folder: $mediaRoot"
}

# ---------------------------------------------------------------- database
Step "Database $database"
$exists = (& $psql -d postgres -At -c "SELECT 1 FROM pg_database WHERE datname = '$database'") -eq "1"
if ($exists) {
  $before = Join-Path $backupDir "pre-setup-$database-$stamp.dump"
  Invoke-Checked "Backup before update" { & (Join-Path $pgBin "pg_dump.exe") -Fc -f $before $database }
  Invoke-Checked "Checking the backup" { & (Join-Path $pgBin "pg_restore.exe") --list $before | Out-Null }
  Note "Existing data kept. Safety backup: $before"
  $summary["Data"] = "kept existing database (backup $before)"
} else {
  if ($mode -eq "UPDATE") { Fail "The existing .env points to database '$database', which does not exist. Nothing was changed in PostgreSQL." }
  $dump = Get-ChildItem (Join-Path $PackageDir "DATABASE") -Filter "*.dump" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if (-not $dump) { Fail "No .dump file in the package DATABASE folder." }
  Invoke-Checked "createdb" { & (Join-Path $pgBin "createdb.exe") $database }
  & (Join-Path $pgBin "pg_restore.exe") -d $database --no-owner --no-privileges $dump.FullName
  $tables = & $psql -d $database -At -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'"
  if ([int]$tables -lt 50) { Fail "Restore looks incomplete ($tables tables). See the log in $logDir." }
  Note "Restored $($dump.Name) ($tables tables)"
  $summary["Data"] = "restored $($dump.Name)"
}

# ---------------------------------------------------------------- packages
Step "Installing packages (needs internet, a few minutes)"
Set-Location $ProjectDir
Invoke-Checked "pnpm install" { & pnpm install --frozen-lockfile }
Invoke-Checked "pnpm db:generate" { & pnpm db:generate }

Step "Applying database migrations (adds only)"
Set-Location (Join-Path $ProjectDir "packages\database")
Invoke-Checked "prisma migrate deploy" { & pnpm exec prisma migrate deploy }
& pnpm exec prisma migrate status
Set-Location $ProjectDir
$summary["Users"] = (& $psql -d $database -At -c "SELECT count(*) FROM users")
$summary["Products"] = (& $psql -d $database -At -c "SELECT count(*) FROM products")

# ---------------------------------------------------------------- backups
Step "Daily backup at 23:30"
$pgPass = $env:PGPASSWORD
if ($pgPass) {
  $pgpassDir = Join-Path $env:APPDATA "postgresql"
  New-Item -ItemType Directory -Force -Path $pgpassDir | Out-Null
  $pgpassFile = Join-Path $pgpassDir "pgpass.conf"
  $line = "127.0.0.1:${pgPort}:*:$($env:PGUSER):$pgPass"
  if (-not ((Test-Path $pgpassFile) -and (Select-String -Path $pgpassFile -SimpleMatch "127.0.0.1:${pgPort}:*:" -Quiet))) {
    Add-Content -Path $pgpassFile -Value $line
  }
}
$backupCmd = Join-Path $ToolsRoot "senvo-backup.cmd"
Set-Content -Path $backupCmd -Encoding ASCII -Value @(
  "@echo off",
  "powershell -NoProfile -ExecutionPolicy Bypass -File `"$ProjectDir\scripts\backup-db.ps1`" -Database $database -Port $pgPort -PgBin `"$pgBin`" -OutDir `"$backupDir`""
)
if ($Rehearsal) {
  Note "Rehearsal: daily task not created"
} else {
  & schtasks /Create /F /SC DAILY /ST 23:30 /TN "SENVO DB Backup" /TR $backupCmd | Out-Null
  if ($LASTEXITCODE -eq 0) { Note "Task 'SENVO DB Backup' created" } else { Note "WARNING: could not create the daily task; run $backupCmd by hand." }
}
& cmd /c "`"$backupCmd`""
$latest = Get-ChildItem $backupDir -Filter "$database-daily-*.dump" -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($latest) { $summary["Backups"] = "$backupDir (latest $($latest.Name))" } else { $summary["Backups"] = "WARNING: first backup failed" }

# ---------------------------------------------------------------- shortcuts
Step "Desktop shortcuts"
if ($Rehearsal) {
  Note "Rehearsal: shortcuts not created"
} else {
  $shell = New-Object -ComObject WScript.Shell
  $desktop = [Environment]::GetFolderPath("Desktop")
  foreach ($item in @(@("SENVO Start", ""), @("SENVO Stop", " -Stop"))) {
    $link = $shell.CreateShortcut((Join-Path $desktop "$($item[0]).lnk"))
    $link.TargetPath = "powershell.exe"
    $link.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$ProjectDir\scripts\start-local.ps1`"$($item[1])"
    $link.WorkingDirectory = $ProjectDir
    $link.Save()
  }
  Note "Created 'SENVO Start' and 'SENVO Stop' on the desktop"
}

# ---------------------------------------------------------------- start
Step "Starting SENVO"
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $ProjectDir "scripts\start-local.ps1")

Write-Host ""
Write-Host "==================== SUMMARY ====================" -ForegroundColor Green
foreach ($key in $summary.Keys) { Write-Host ("{0,-14} {1}" -f $key, $summary[$key]) }
Write-Host ("{0,-14} {1}" -f "Project", $ProjectDir)
Write-Host ("{0,-14} {1}" -f "Pictures", $mediaRoot)
Write-Host ("{0,-14} {1}" -f "Admin", "http://localhost:3001  (sign in yourself)")
Write-Host ("{0,-14} {1}" -f "Shop", "http://localhost:3000")
Write-Host ("{0,-14} {1}" -f "Setup log", $logDir)
if ($oldDir) { Write-Host ("{0,-14} {1}" -f "Old code", "$oldDir (delete later to free space)") }
Stop-Transcript | Out-Null
