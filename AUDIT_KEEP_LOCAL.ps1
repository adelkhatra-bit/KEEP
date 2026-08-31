$ErrorActionPreference = 'SilentlyContinue'
$Out = Join-Path $env:USERPROFILE 'Desktop\KEEP_AUDIT_RESULT.txt'
"KEEP LOCAL HARD AUDIT - $(Get-Date -Format s)" | Set-Content $Out
"" | Add-Content $Out

function Add-Line($s='') { $s | Add-Content $Out }

Add-Line '=== PORTS 8081 / 3001 / 3010 ==='
$ports = 8081,3001,3010
foreach ($p in $ports) {
  $conns = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue
  if (-not $conns) { Add-Line "PORT $p : AUCUN PROCESSUS EN ECOUTE"; continue }
  foreach ($c in $conns) {
    $pid = $c.OwningProcess
    $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$pid"
    Add-Line "PORT $p -> PID $pid"
    Add-Line "  Name: $($proc.Name)"
    Add-Line "  Executable: $($proc.ExecutablePath)"
    Add-Line "  CommandLine: $($proc.CommandLine)"
  }
}

Add-Line ''
Add-Line '=== PROCESSUS NODE / EXPO / NEXT ==='
Get-CimInstance Win32_Process | Where-Object { $_.Name -match 'node|npm|npx|cmd|powershell' -and $_.CommandLine -match '8081|3001|3010|expo|next|KEEP|keep' } | ForEach-Object {
  Add-Line "PID $($_.ProcessId) | $($_.Name)"
  Add-Line "  $($_.CommandLine)"
}

Add-Line ''
Add-Line '=== PROJET CANONIQUE ==='
$repo='C:\Users\97156\keep'
Add-Line "Path: $repo"
if (Test-Path "$repo\.git") {
  Push-Location $repo
  Add-Line "Branch: $(git branch --show-current)"
  Add-Line "HEAD: $(git rev-parse HEAD)"
  Add-Line "HEAD short: $(git rev-parse --short HEAD)"
  Add-Line "Remote: $(git remote get-url origin)"
  Add-Line "Status:"
  (git status -sb) | ForEach-Object { Add-Line "  $_" }
  Add-Line "Onboarding contains old subtitle: $([bool](Select-String -Path 'packages\mobile\src\screens\onboarding\OnboardingScreen.tsx' -Pattern 'Accéder immédiatement à KEEP sans créer de compte' -Quiet))"
  Add-Line "Onboarding demo button occurrences: $((Select-String -Path 'packages\mobile\src\screens\onboarding\OnboardingScreen.tsx' -Pattern 'ENTRER EN MODE DÉMO').Count)"
  Add-Line "Home start button file hash: $((Get-FileHash 'packages\mobile\src\screens\HomeScreen.tsx' -Algorithm SHA256).Hash)"
  Pop-Location
} else { Add-Line 'ERREUR: repo canonique absent' }

Add-Line ''
Add-Line '=== AUTRES DEPOTS KEEP TROUVES ==='
$roots = @("$env:USERPROFILE\Desktop", "$env:USERPROFILE\Documents", "$env:USERPROFILE\OneDrive", "$env:USERPROFILE") | Select-Object -Unique
$seen=@{}
foreach ($r in $roots) {
  if (!(Test-Path $r)) { continue }
  Get-ChildItem -Path $r -Directory -Recurse -Depth 4 -Force -ErrorAction SilentlyContinue | Where-Object { Test-Path (Join-Path $_.FullName '.git') } | ForEach-Object {
    $path=$_.FullName
    if ($seen[$path]) { return }
    $seen[$path]=$true
    Push-Location $path
    $remote=(git remote get-url origin 2>$null)
    if ($remote -match 'KEEP|adelkhatra-bit') {
      Add-Line "REPO: $path"
      Add-Line "  Branch: $(git branch --show-current)"
      Add-Line "  HEAD: $(git rev-parse --short HEAD)"
      Add-Line "  Remote: $remote"
    }
    Pop-Location
  }
}

Add-Line ''
Add-Line '=== CACHE / BUILD LOCAUX ==='
foreach ($d in @("$repo\packages\mobile\.expo", "$repo\packages\mobile\dist", "$repo\packages\admin\.next", "$repo\node_modules\.cache")) {
  if (Test-Path $d) { Add-Line "PRESENT: $d | Modified: $((Get-Item $d).LastWriteTime)" } else { Add-Line "ABSENT: $d" }
}

Add-Line ''
Add-Line '=== FIN AUDIT ==='
Write-Host "Audit terminé: $Out"
Get-Content $Out
