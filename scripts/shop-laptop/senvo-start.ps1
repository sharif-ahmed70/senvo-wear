# SENVO Start (desktop icon): gets the database, API, Admin and Storefront
# running no matter what state the laptop is in, then opens the Admin login
# page in Microsoft Edge.
$ErrorActionPreference = "Continue"
$host.UI.RawUI.WindowTitle = "SENVO Start"
$loginUrl = "http://localhost:3001/login"
$checks = [ordered]@{
  "API       " = "http://localhost:4000/storefront/catalog?page=1&pageSize=1"
  "Admin     " = "http://localhost:3001/login"
  "Storefront" = "http://localhost:3000/"
}

# A click inside the window must not pause it: switch off QuickEdit for this
# console (shared by every program this window starts).
try {
  Add-Type -Namespace Senvo -Name Console -MemberDefinition @'
[DllImport("kernel32.dll")] public static extern IntPtr GetStdHandle(int h);
[DllImport("kernel32.dll")] public static extern bool GetConsoleMode(IntPtr h, out uint m);
[DllImport("kernel32.dll")] public static extern bool SetConsoleMode(IntPtr h, uint m);
'@
  $in = [Senvo.Console]::GetStdHandle(-10)
  $mode = 0
  if ([Senvo.Console]::GetConsoleMode($in, [ref]$mode)) {
    [Senvo.Console]::SetConsoleMode($in, ($mode -band (-bnot 0x40)) -bor 0x80) | Out-Null
  }
} catch { }

function Test-AllUp {
  foreach ($url in $checks.Values) {
    try { if ((Invoke-WebRequest -UseBasicParsing -TimeoutSec 20 $url).StatusCode -ne 200) { return $false } }
    catch { return $false }
  }
  return $true
}

function Open-Edge {
  Write-Host "  Edge-e login page khulche: $loginUrl"
  try { Start-Process "msedge.exe" $loginUrl -ErrorAction Stop }
  catch { Start-Process $loginUrl }
}

Write-Host ""
Write-Host "  SENVO chalu hocche... 2-5 minute opekkha korun." -ForegroundColor Cyan
Write-Host "  Window bondho korben na. Ekhane click korleo kono somossa nei."
Write-Host ""

# Only one Start at a time: a second double-click just waits for the first.
$mutex = New-Object System.Threading.Mutex($false, "Local\SENVOStart")
if (-not $mutex.WaitOne(0)) {
  Write-Host "  SENVO Start age thekei cholche, sheta shesh howar opekkhay..."
  $mutex.WaitOne() | Out-Null
}

try {
  if (Test-AllUp) {
    Write-Host "  SENVO age thekei chalu ache." -ForegroundColor Green
    Open-Edge
    return
  }

  $ok = $false
  for ($attempt = 1; $attempt -le 3 -and -not $ok; $attempt++) {
    if ($attempt -gt 1) { Write-Host ""; Write-Host "  Abar cheshta korchi ($attempt/3)..." -ForegroundColor Yellow }
    Write-Host "  Database chalu hocche..."
    & powershell -NoProfile -ExecutionPolicy Bypass -File "C:\SENVO\senvo-db.ps1" -Action start
    if ($LASTEXITCODE -ne 0) { continue }
    # start-local.ps1 frees ports 3000, 3001 and 4000 itself before starting.
    & powershell -NoProfile -ExecutionPolicy Bypass -File "C:\xampp\htdocs\SENVO Wear\scripts\start-local.ps1"
    $ok = Test-AllUp
  }

  Write-Host ""
  if ($ok) {
    Write-Host "  SENVO chalu hoyeche." -ForegroundColor Green
    Open-Edge
    Write-Host "  Ei window 15 second pore nije bondho hobe."
    Start-Sleep -Seconds 15
  } else {
    Write-Host "  SENVO 3 bar cheshta koreo chalu hoyni." -ForegroundColor Red
    Write-Host "  Laptop restart kore abar SENVO Start chapun."
    Write-Host "  Log: C:\xampp\htdocs\SENVO Wear\.senvo-runtime\logs"
    Read-Host "  Enter chapun bondho korte" | Out-Null
  }
} finally {
  $mutex.ReleaseMutex()
}
