# One-shot SENVO Wear setup for a Windows laptop, without admin rights or
# passwords. Works in two places:
#
#   From a GitHub clone (after reinstalling Windows):
#     powershell -NoProfile -ExecutionPolicy Bypass -File scripts\setup-windows.ps1
#   From an unzipped portable package (holds SENVO-Wear-source.zip):
#     powershell -NoProfile -ExecutionPolicy Bypass -File setup-senvo.ps1
#
# What it needs and where it looks:
# - Shop data: the newest *.dump in <backup>\DATABASE (or <backup>\SEED with
#   -Fresh: settings and logins only), or the package DATABASE folder. The
#   backup folder is found by itself: X:\SENVO_BACKUP on any drive.
# - Pictures: <backup>\MEDIA\.senvo-media (skipped with -Fresh).
# - Private settings: <backup>\CONFIG\.env (AUTH_SECRET and other keys are
#   reused; database and folder paths are written fresh).
# - Tools: Node 22 and PostgreSQL 17 from <backup>\TOOLS or package TOOLS,
#   otherwise downloaded (nodejs.org, get.enterprisedb.com). pnpm from npm.
#
# Modes, chosen by itself:
# - NEW:    the project has no .env yet. Installs portable tools under
#           C:\SENVO, a portable PostgreSQL (localhost only, no password;
#           port 5433 if 5432 is taken), restores the data and pictures,
#           writes .env, installs packages, migrates, sets up the daily
#           backup and desktop shortcuts, and starts everything.
# - UPDATE: the project already has a .env. Keeps it, the pictures and the
#           database; backs the database up first; applies new migrations.
#           In package mode the old code folder is renamed, never deleted.
#
# Safety: never drops, resets or overwrites a database, never deletes a
# folder, never prints secrets. Re-running is safe. Log: C:\SENVO\setup-logs.
param(
  [string]$PackageDir = $PSScriptRoot,
  [string]$ProjectDir = "",
  [string]$ToolsRoot = "C:\SENVO",
  [string]$BackupDir = "",
  # Start with settings and logins only (no products, stock, sales).
  [switch]$Fresh,
  # Rehearsal on a machine that already runs SENVO: does not create the daily
  # task or the desktop shortcuts and does not change the user PATH.
  [switch]$Rehearsal
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$logDir = Join-Path $ToolsRoot "setup-logs"
New-Item -ItemType Directory -Force -Path $ToolsRoot, $logDir | Out-Null
Start-Transcript -Path (Join-Path $logDir "setup-$stamp.log") | Out-Null

$database = "senvo_wear_dev"
$pnpmVersion = "11.11.0"
$pgDownload = "https://get.enterprisedb.com/postgresql/postgresql-17.11-1-windows-x64-binaries.zip"
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
  if ($Rehearsal) { $env:Path = "$dir;$env:Path"; return }
  $user = [Environment]::GetEnvironmentVariable("Path", "User")
  $parts = @()
  if ($user) { $parts = $user -split ";" | Where-Object { $_ -and ($_ -ne $dir) } }
  [Environment]::SetEnvironmentVariable("Path", (@($dir) + $parts) -join ";", "User")
  $env:Path = "$dir;$env:Path"
}
function Read-DotEnv([string]$path) {
  $values = [ordered]@{}
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
function Find-PgBin($envValues) {
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
}
function Find-Tool([string]$relative) {
  # A file or folder under TOOLS in the package or the backup folder.
  foreach ($base in @($PackageDir, $BackupDir)) {
    if (-not $base) { continue }
    $found = Get-ChildItem (Join-Path $base "TOOLS") -Filter $relative -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($found) { return $found.FullName }
  }
  return $null
}
function Get-Download([string]$url, [string]$file) {
  Note "Downloading $url"
  Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $file
}

# ---------------------------------------------------------------- where am I
Step "Checking where to work"
$sourceZip = Join-Path $PackageDir "SENVO-Wear-source.zip"
$packageMode = Test-Path $sourceZip
if (-not $packageMode) {
  # Run from scripts\ inside a clone: the project is this repository.
  $repoRoot = Split-Path -Parent $PSScriptRoot
  if (-not (Test-Path (Join-Path $repoRoot "package.json"))) {
    Fail "Run this from the project's scripts folder or from an unzipped SENVO package."
  }
  $ProjectDir = $repoRoot
} elseif (-not $ProjectDir) {
  $ProjectDir = "C:\xampp\htdocs\SENVO Wear"
}
Get-ChildItem $PackageDir -Recurse -File -Include *.ps1, *.cmd -ErrorAction SilentlyContinue | Unblock-File -ErrorAction SilentlyContinue

if (-not $BackupDir) {
  $BackupDir = Get-PSDrive -PSProvider FileSystem | Sort-Object { $_.Name -eq "C" } |
    ForEach-Object { Join-Path $_.Root "SENVO_BACKUP" } | Where-Object { Test-Path $_ } | Select-Object -First 1
}
if ($BackupDir) { Note "Backup folder: $BackupDir" } else { Note "No SENVO_BACKUP folder found on any drive" }

$freeGb = [math]::Round((Get-PSDrive ($ProjectDir.Substring(0, 1))).Free / 1GB, 1)
Note "Project: $ProjectDir (free space $freeGb GB)"
if ($freeGb -lt 4) { Fail "At least 4 GB free space is needed on $($ProjectDir.Substring(0, 2))." }
$mode = "NEW"
if (Test-Path (Join-Path $ProjectDir ".env")) { $mode = "UPDATE" }
$summary["Mode"] = $mode
Note "Mode: $mode"

# Daily backups go off C: when a backup folder exists, so they survive a
# Windows reinstall.
$dailyDir = Join-Path $ToolsRoot "backups"
if ($BackupDir -and -not $BackupDir.StartsWith("C:", "OrdinalIgnoreCase")) { $dailyDir = Join-Path $BackupDir "DATABASE" }
New-Item -ItemType Directory -Force -Path $dailyDir | Out-Null

# ---------------------------------------------------------------- Node
Step "Node.js 22"
$nodeOk = $false
if (Get-Command node -ErrorAction SilentlyContinue) {
  $v = [version]((& node -v).TrimStart("v"))
  $nodeOk = $v -ge [version]"22.13.0"
  Note "Found Node $v"
}
if (-not $nodeOk) {
  $nodeHome = Join-Path $ToolsRoot "node"
  if (-not (Test-Path (Join-Path $nodeHome "node.exe"))) {
    $nodeZip = Find-Tool "node-v22*-win-x64.zip"
    if (-not $nodeZip) {
      $version = ((Invoke-RestMethod "https://nodejs.org/dist/index.json") | Where-Object { $_.version -like "v22.*" } | Select-Object -First 1).version
      $nodeZip = Join-Path $ToolsRoot "node-$version-win-x64.zip"
      Get-Download "https://nodejs.org/dist/$version/node-$version-win-x64.zip" $nodeZip
      $sums = (Invoke-WebRequest -UseBasicParsing "https://nodejs.org/dist/$version/SHASUMS256.txt").Content
      $expected = (($sums -split "`n" | Where-Object { $_ -match "node-$version-win-x64.zip" }) -split "\s+")[0]
      if ((Get-FileHash $nodeZip -Algorithm SHA256).Hash.ToLower() -ne $expected) { Fail "Node download checksum does not match." }
    }
    $tmp = Join-Path $ToolsRoot "node-unzip"
    Expand-Archive -Path $nodeZip -DestinationPath $tmp -Force
    Move-Item (Get-ChildItem $tmp -Directory | Select-Object -First 1).FullName $nodeHome
    Remove-Item $tmp -Recurse -Force
  }
  Add-UserPath $nodeHome
  Note "Portable Node $((& node -v)) in $nodeHome"
}
$summary["Node"] = (& node -v)

# ---------------------------------------------------------------- pnpm
Step "pnpm $pnpmVersion"
$pnpmOk = $false
if (Get-Command pnpm -ErrorAction SilentlyContinue) { $pnpmOk = ((& pnpm -v 2>$null) -eq $pnpmVersion) }
if (-not $pnpmOk) {
  $pnpmHome = Join-Path $ToolsRoot "pnpm"
  if (-not (Test-Path (Join-Path $pnpmHome "pnpm.cmd"))) {
    $npm = Join-Path (Split-Path (Get-Command node).Source) "npm.cmd"
    Invoke-Checked "Installing pnpm" { & $npm install --global --prefix $pnpmHome "pnpm@$pnpmVersion" --no-audit --no-fund --loglevel error }
  }
  Add-UserPath $pnpmHome
}
$summary["pnpm"] = (& pnpm -v)

# ---------------------------------------------------------------- code
Step "Project code"
$oldDir = $null
if ($packageMode) {
  $packageCommit = (Get-Content (Join-Path $PackageDir "SOURCE_COMMIT.txt") -First 1).Trim()
  $marker = Join-Path $ProjectDir ".senvo-source-commit"
  $current = $null
  if (Test-Path $marker) { $current = (Get-Content $marker -First 1).Trim() }
  if ((Test-Path $ProjectDir) -and ($current -ne $packageCommit)) {
    # Different or unknown code: set the folder aside (renamed, never deleted).
    Stop-SenvoPorts
    Get-CimInstance Win32_Process -Filter "Name = 'node.exe' OR Name = 'cmd.exe'" -ErrorAction SilentlyContinue |
      Where-Object { $_.CommandLine -and $_.CommandLine.Contains($ProjectDir) -and $_.ProcessId -ne $PID } |
      ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    $oldDir = "$ProjectDir.old-$stamp"
    $renamed = $false
    for ($try = 0; $try -lt 6 -and -not $renamed; $try++) {
      try { Rename-Item -Path $ProjectDir -NewName (Split-Path $oldDir -Leaf); $renamed = $true }
      catch { Start-Sleep -Seconds 5 }
    }
    if (-not $renamed) { Fail "Could not rename $ProjectDir. Close VS Code, terminals and browsers using it, then run setup again." }
    Note "Old folder kept as $oldDir"
  }
  if (-not (Test-Path $ProjectDir)) {
    $tmp = Join-Path $ToolsRoot "source-unzip-$stamp"
    Expand-Archive -Path $sourceZip -DestinationPath $tmp -Force
    New-Item -ItemType Directory -Force -Path (Split-Path $ProjectDir) | Out-Null
    Move-Item (Get-ChildItem $tmp -Directory | Select-Object -First 1).FullName $ProjectDir
    Remove-Item $tmp -Recurse -Force
    Set-Content -Path $marker -Value $packageCommit -Encoding ASCII
  }
  if ($oldDir) {
    foreach ($keep in ".env", ".senvo-media") {
      $from = Join-Path $oldDir $keep
      $to = Join-Path $ProjectDir $keep
      if ((Test-Path $from) -and -not (Test-Path $to)) { Copy-Item $from $to -Recurse }
    }
  }
  $summary["Code version"] = $packageCommit
} else {
  $summary["Code version"] = (& git -C $ProjectDir log -1 --format="%h %cd" --date=short 2>$null)
}
Note "Code: $($summary['Code version'])"

# ---------------------------------------------------------------- PostgreSQL
Step "PostgreSQL 17"
$envPath = Join-Path $ProjectDir ".env"
$pgData = $null
if ($mode -eq "NEW") {
  $pgHome = Join-Path $ToolsRoot "pgsql"
  $pgData = Join-Path $ToolsRoot "pgdata"
  if (-not (Test-Path (Join-Path $pgHome "bin\pg_ctl.exe"))) {
    $bundled = Find-Tool "pgsql"
    if ($bundled) {
      Copy-Item $bundled $pgHome -Recurse
    } else {
      $zip = Join-Path $ToolsRoot "postgresql-binaries.zip"
      Get-Download $pgDownload $zip
      $tmp = Join-Path $ToolsRoot "pg-unzip"
      Expand-Archive -Path $zip -DestinationPath $tmp -Force
      New-Item -ItemType Directory -Force -Path $pgHome | Out-Null
      foreach ($d in "bin", "lib", "share") { Move-Item (Join-Path $tmp "pgsql\$d") (Join-Path $pgHome $d) }
      Remove-Item $tmp -Recurse -Force
      Remove-Item $zip
    }
  }
  $pgBin = Join-Path $pgHome "bin"
  if (Test-Path (Join-Path $pgData "PG_VERSION")) {
    $portLine = Select-String -Path (Join-Path $pgData "postgresql.conf") -Pattern '^\s*port\s*=\s*(\d+)' | Select-Object -Last 1
    $pgPort = [int]$portLine.Matches[0].Groups[1].Value
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
  $existing = Read-DotEnv $envPath
  $databaseUrl = $existing["DATABASE_URL"]
  if (-not $databaseUrl) { Fail "The existing .env has no DATABASE_URL." }
  $pgBin = Find-PgBin $existing
  if (-not $pgBin) { Fail "PostgreSQL tools (pg_dump) were not found on this laptop." }
  $pgPort = ([Uri]$databaseUrl).Port
  if ($existing["SENVO_PG_BIN"] -and $existing["SENVO_PG_DATA"] -and -not (Test-Port $pgPort)) {
    Invoke-Checked "Starting PostgreSQL" { & (Join-Path $existing["SENVO_PG_BIN"] "pg_ctl.exe") -D $existing["SENVO_PG_DATA"] -l (Join-Path $existing["SENVO_PG_DATA"] "server.log") -w start }
  }
  if (-not (Test-Port $pgPort)) {
    Get-Service -ErrorAction SilentlyContinue | Where-Object { $_.Name -like "*postgresql*" -and $_.Status -ne "Running" } |
      ForEach-Object { try { Start-Service $_.Name } catch { } }
    Start-Sleep -Seconds 3
  }
  if (-not (Test-Port $pgPort)) { Fail "PostgreSQL is not running on port $pgPort and could not be started." }
}
$database = ([Uri]$databaseUrl).AbsolutePath.TrimStart("/")
Set-PgEnvFromUrl $databaseUrl
$psql = Join-Path $pgBin "psql.exe"
$summary["PostgreSQL"] = "$((& (Join-Path $pgBin 'postgres.exe') --version)) on port $pgPort"

# ---------------------------------------------------------------- .env
Step ".env"
if (-not (Test-Path $envPath)) {
  $values = [ordered]@{
    APP_ENV                      = "development"
    NEXT_PUBLIC_APP_ENV          = "development"
    STOREFRONT_ORGANIZATION_CODE = "SENVO"
    NEXT_PUBLIC_SENVO_API_URL    = "http://localhost:4000"
    SENVO_API_PORT               = "4000"
    SENVO_API_ALLOWED_ORIGIN     = "http://localhost:3000,http://localhost:3001,http://127.0.0.1:3000,http://127.0.0.1:3001,http://localhost:3002,http://127.0.0.1:3002"
    AUTH_SECRET                  = ""
    SSLCOMMERZ_ENABLED           = "false"
    GOOGLE_CLIENT_ID             = ""
    GOOGLE_CLIENT_SECRET         = ""
    GOOGLE_REDIRECT_URI          = ""
  }
  $savedEnv = $null
  if ($BackupDir) { $savedEnv = Join-Path $BackupDir "CONFIG\.env" }
  if ($savedEnv -and (Test-Path $savedEnv)) {
    # Reuse the saved private settings (AUTH_SECRET, payment keys, ...).
    $saved = Read-DotEnv $savedEnv
    foreach ($key in $saved.Keys) { $values[$key] = $saved[$key] }
    Note "Reused the saved settings from $savedEnv"
  }
  if (-not $values["AUTH_SECRET"]) {
    $values["AUTH_SECRET"] = & node -e "process.stdout.write(require('crypto').randomBytes(32).toString('base64'))"
  }
  # Paths and the database always match this laptop.
  $values["DATABASE_URL"] = $databaseUrl
  $values["MEDIA_STORAGE_ROOT"] = (Join-Path $ProjectDir ".senvo-media") -replace "\\", "/"
  $values["SENVO_PG_BIN"] = $pgBin
  $values["SENVO_PG_DATA"] = $pgData
  $lines = @("# Created by setup-windows.ps1 on $stamp. Private: never commit or share.")
  foreach ($key in $values.Keys) {
    $value = $values[$key]
    if ($key -eq "MEDIA_STORAGE_ROOT") { $value = "`"$value`"" }
    $lines += "$key=$value"
  }
  Set-Content -Path $envPath -Value $lines -Encoding ASCII
  Note "Created .env (values not shown)"
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
New-Item -ItemType Directory -Force -Path $mediaRoot | Out-Null
$hasMedia = Get-ChildItem $mediaRoot -Recurse -File -ErrorAction SilentlyContinue | Select-Object -First 1
$sourceMedia = $null
foreach ($base in @($PackageDir, $BackupDir)) {
  if ($base -and (Test-Path (Join-Path $base "MEDIA\.senvo-media"))) { $sourceMedia = Join-Path $base "MEDIA\.senvo-media"; break }
}
if (-not $hasMedia -and $sourceMedia -and -not $Fresh) {
  Copy-Item (Join-Path $sourceMedia "*") $mediaRoot -Recurse -Force
  Note "Copied pictures from $sourceMedia"
} else {
  Note "Pictures folder: $mediaRoot"
}

# ---------------------------------------------------------------- database
Step "Database $database"
$exists = (& $psql -d postgres -At -c "SELECT 1 FROM pg_database WHERE datname = '$database'") -eq "1"
if ($exists) {
  $before = Join-Path $dailyDir "pre-setup-$database-$stamp.dump"
  Invoke-Checked "Backup before update" { & (Join-Path $pgBin "pg_dump.exe") -Fc -f $before $database }
  Invoke-Checked "Checking the backup" { & (Join-Path $pgBin "pg_restore.exe") --list $before | Out-Null }
  Note "Existing data kept. Safety backup: $before"
  $summary["Data"] = "kept the existing database (backup $before)"
} else {
  if ($mode -eq "UPDATE") { Fail "The existing .env points to database '$database', which does not exist. Nothing was changed." }
  $dumpFolders = @()
  if ($packageMode) { $dumpFolders += (Join-Path $PackageDir "DATABASE") }
  if ($BackupDir) {
    if ($Fresh) { $dumpFolders += (Join-Path $BackupDir "SEED") } else { $dumpFolders += (Join-Path $BackupDir "DATABASE") }
  }
  $dump = $dumpFolders | ForEach-Object { Get-ChildItem $_ -Filter "*.dump" -ErrorAction SilentlyContinue } |
    Where-Object { $_.Name -notlike "pre-*" } | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if (-not $dump) {
    Fail "No shop data found. A new database has no login, so restore a backup: put it in X:\SENVO_BACKUP\DATABASE (or SEED for fresh) on any drive, then run setup again."
  }
  Invoke-Checked "createdb" { & (Join-Path $pgBin "createdb.exe") $database }
  & (Join-Path $pgBin "pg_restore.exe") -d $database --no-owner --no-privileges $dump.FullName
  $tables = & $psql -d $database -At -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'"
  if ([int]$tables -lt 50) { Fail "Restore looks incomplete ($tables tables). See the log in $logDir." }
  Note "Restored $($dump.FullName) ($tables tables)"
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
Set-Location $ProjectDir
$summary["Users"] = (& $psql -d $database -At -c "SELECT count(*) FROM users")
$summary["Products"] = (& $psql -d $database -At -c "SELECT count(*) FROM products")

# ---------------------------------------------------------------- backups
Step "Daily backup at 23:30 to $dailyDir"
if ($env:PGPASSWORD) {
  $pgpassDir = Join-Path $env:APPDATA "postgresql"
  New-Item -ItemType Directory -Force -Path $pgpassDir | Out-Null
  $pgpassFile = Join-Path $pgpassDir "pgpass.conf"
  if (-not ((Test-Path $pgpassFile) -and (Select-String -Path $pgpassFile -SimpleMatch "127.0.0.1:${pgPort}:*:" -Quiet))) {
    Add-Content -Path $pgpassFile -Value "127.0.0.1:${pgPort}:*:$($env:PGUSER):$($env:PGPASSWORD)"
  }
}
$backupCmd = Join-Path $ToolsRoot "senvo-backup.cmd"
Set-Content -Path $backupCmd -Encoding ASCII -Value @(
  "@echo off",
  "powershell -NoProfile -ExecutionPolicy Bypass -File `"$ProjectDir\scripts\backup-db.ps1`" -Database $database -Port $pgPort -PgBin `"$pgBin`" -OutDir `"$dailyDir`""
)
if ($Rehearsal) {
  Note "Rehearsal: daily task not created"
} else {
  & schtasks /Create /F /SC DAILY /ST 23:30 /TN "SENVO DB Backup" /TR $backupCmd | Out-Null
  if ($LASTEXITCODE -eq 0) { Note "Task 'SENVO DB Backup' created" } else { Note "WARNING: could not create the daily task; run $backupCmd by hand." }
}
& cmd /c "`"$backupCmd`""
$latest = Get-ChildItem $dailyDir -Filter "$database-daily-*.dump" -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($latest) { $summary["Backups"] = "$dailyDir (latest $($latest.Name))" } else { $summary["Backups"] = "WARNING: first backup failed" }

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
