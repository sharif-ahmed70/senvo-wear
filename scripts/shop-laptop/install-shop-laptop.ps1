# Puts the shop laptop helpers in place after setup-senvo.ps1 (new laptop or
# UPDATE): copies the Start/Stop/backup scripts to C:\SENVO and points the
# desktop "SENVO Start" / "SENVO Stop" icons at them. No admin rights needed.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\shop-laptop\install-shop-laptop.ps1
#
# Printers are set up separately (needs one admin "Yes"): see README.md.
param([string]$ToolsRoot = "C:\SENVO")

$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force -Path $ToolsRoot | Out-Null

foreach ($file in "senvo-start.ps1", "senvo-start.cmd", "senvo-stop.cmd", "senvo-db.ps1", "senvo-backup.cmd") {
  Copy-Item -Path (Join-Path $PSScriptRoot $file) -Destination (Join-Path $ToolsRoot $file) -Force
  Write-Host "Copied $file to $ToolsRoot"
}

$shell = New-Object -ComObject WScript.Shell
$desktop = [Environment]::GetFolderPath("Desktop")
$icons = @(
  @{ Name = "SENVO Start"; Target = Join-Path $ToolsRoot "senvo-start.cmd"; Icon = "shell32.dll,137" },
  @{ Name = "SENVO Stop"; Target = Join-Path $ToolsRoot "senvo-stop.cmd"; Icon = "shell32.dll,27" }
)
foreach ($icon in $icons) {
  $link = $shell.CreateShortcut((Join-Path $desktop "$($icon.Name).lnk"))
  $link.TargetPath = $icon.Target
  $link.Arguments = ""
  $link.WorkingDirectory = "C:\xampp\htdocs\SENVO Wear"
  $link.IconLocation = "C:\Windows\System32\$($icon.Icon)"
  $link.Save()
  Write-Host "Desktop icon '$($icon.Name)' -> $($icon.Target)"
}

# The daily backup task (created by setup-senvo.ps1) runs at 21:00 and calls
# C:\SENVO\senvo-backup.cmd (copied above). Set-ScheduledTask never asks for a
# password, unlike "schtasks /Change".
try {
  Set-ScheduledTask -TaskName "SENVO DB Backup" -Trigger (New-ScheduledTaskTrigger -Daily -At "21:00") | Out-Null
  Write-Host "Daily backup at 21:00 uses $ToolsRoot\senvo-backup.cmd"
} catch {
  Write-Warning "Backup task 'SENVO DB Backup' not found; run setup-senvo.ps1 first."
}
Write-Host "Done."
