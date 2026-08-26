$ErrorActionPreference = 'Stop'

$Repo = 'C:\Users\97156\keep'
$Branch = 'reconcile/claude-main-20260825'
$SupabaseUrl = 'https://rrhqsqzcplvmwxizqnla.supabase.co'
$SupabaseAnon = 'sb_publishable_TUz-oaWk8QZDl4pTfCvkPw_3_iwJJru'
$ToolsDir = Join-Path $Repo '.tools'
$Cloudflared = Join-Path $ToolsDir 'cloudflared.exe'
$LogDir = Join-Path $env:TEMP 'KEEP_PRO'
$BrowserProfile = Join-Path $env:LOCALAPPDATA 'KEEP_TEST_BROWSER_PROFILE'
$Desktop = [Environment]::GetFolderPath('Desktop')
$ShareFile = Join-Path $Desktop 'KEEP_LIEN_PARTAGE.txt'
$VersionFile = Join-Path $Desktop 'KEEP_VERSION_ACTIVE.txt'

function Write-Step([string]$Text) {
  Write-Host "`n=== $Text ===" -ForegroundColor Cyan
}

function Stop-Port([int]$Port) {
  Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | ForEach-Object {
    try { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue } catch {}
  }
}

function Wait-Http([string]$Url, [int]$Seconds = 90) {
  for ($i = 0; $i -lt $Seconds; $i++) {
    try {
      $r = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 2
      if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 500) { return $true }
    } catch {}
    Start-Sleep -Seconds 1
  }
  return $false
}

function Wait-TunnelUrl([string]$LogPath, [int]$Seconds = 45) {
  for ($i = 0; $i -lt $Seconds; $i++) {
    if (Test-Path $LogPath) {
      $text = Get-Content $LogPath -Raw -ErrorAction SilentlyContinue
      $m = [regex]::Match($text, 'https://[a-z0-9-]+\.trycloudflare\.com')
      if ($m.Success) { return $m.Value }
    }
    Start-Sleep -Seconds 1
  }
  return $null
}

function Start-Tunnel([string]$LocalUrl, [string]$LogPath) {
  if (Test-Path $LogPath) { Remove-Item $LogPath -Force -ErrorAction SilentlyContinue }
  $args = @('tunnel','--url',$LocalUrl,'--no-autoupdate','--logfile',$LogPath)
  return Start-Process -FilePath $Cloudflared -ArgumentList $args -PassThru -WindowStyle Hidden
}

function Stop-DedicatedBrowser {
  Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
    $_.Name -match 'msedge|chrome' -and $_.CommandLine -and $_.CommandLine.Contains($BrowserProfile)
  } | ForEach-Object {
    try { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue } catch {}
  }
}

Write-Host 'KEEP - MODE PRO / SOURCE UNIQUE / LIEN PARTAGE' -ForegroundColor Green
Write-Host 'Aucun fichier de design n est modifie par ce lanceur.' -ForegroundColor DarkGray

if (!(Test-Path (Join-Path $Repo '.git'))) {
  throw "Depot KEEP introuvable: $Repo"
}
New-Item -ItemType Directory -Force -Path $ToolsDir, $LogDir, $BrowserProfile | Out-Null

Write-Step '1. Synchronisation de la seule branche autorisee'
Set-Location $Repo
$dirty = git status --porcelain
if ($LASTEXITCODE -ne 0) { throw 'git status a echoue' }
if ($dirty) {
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  git stash push -u -m "KEEP_PRO_AUTO_BACKUP_$stamp" | Out-Host
  if ($LASTEXITCODE -ne 0) { throw 'Impossible de sauvegarder les changements locaux' }
}
git fetch origin | Out-Host
if ($LASTEXITCODE -ne 0) { throw 'git fetch a echoue' }
git switch $Branch | Out-Host
if ($LASTEXITCODE -ne 0) { git switch -c $Branch --track "origin/$Branch" | Out-Host }
if ($LASTEXITCODE -ne 0) { throw 'Impossible de selectionner la branche KEEP' }
git pull --ff-only origin $Branch | Out-Host
if ($LASTEXITCODE -ne 0) { throw 'git pull --ff-only a echoue' }
$Sha = (git rev-parse HEAD).Trim()
$ShortSha = (git rev-parse --short HEAD).Trim()

@(
  "KEEP VERSION ACTIVE"
  "Branch: $Branch"
  "SHA: $Sha"
  "Date: $(Get-Date -Format s)"
  "Repo: $Repo"
) | Set-Content -Encoding UTF8 $VersionFile

Write-Step "2. Nettoyage des anciens runtimes KEEP - SHA $ShortSha"
Stop-Port 8081
Stop-Port 3010
Stop-Port 3001
Stop-DedicatedBrowser
Get-Process cloudflared -ErrorAction SilentlyContinue | ForEach-Object {
  try {
    $p = Get-CimInstance Win32_Process -Filter "ProcessId=$($_.Id)" -ErrorAction SilentlyContinue
    if ($p.CommandLine -and ($p.CommandLine -match '127\.0\.0\.1:8081|127\.0\.0\.1:3010|localhost:8081|localhost:3010')) {
      Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
    }
  } catch {}
}

foreach ($d in @(
  (Join-Path $Repo '.expo'),
  (Join-Path $Repo '.metro-cache'),
  (Join-Path $Repo 'packages\mobile\.expo'),
  (Join-Path $Repo 'packages\mobile\dist'),
  (Join-Path $Repo 'packages\mobile\dist-web'),
  (Join-Path $Repo 'packages\mobile\web-build'),
  (Join-Path $Repo 'packages\admin\.next'),
  (Join-Path $Repo 'node_modules\.cache'),
  (Join-Path $Repo 'packages\mobile\node_modules\.cache')
)) {
  if (Test-Path $d) { Remove-Item $d -Recurse -Force -ErrorAction SilentlyContinue }
}

Write-Step '3. Verification source unique et dependances'
node scripts\verify-source-of-truth.cjs
if ($LASTEXITCODE -ne 0) { throw 'Verification source unique en echec' }
npm ci
if ($LASTEXITCODE -ne 0) { throw 'npm ci en echec' }

Write-Step '4. Installation automatique du tunnel gratuit si necessaire'
if (!(Test-Path $Cloudflared)) {
  $download = 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe'
  Write-Host 'Telechargement cloudflared officiel...'
  Invoke-WebRequest -UseBasicParsing -Uri $download -OutFile $Cloudflared
}

$BackendOut = Join-Path $LogDir 'backend.out.log'
$BackendErr = Join-Path $LogDir 'backend.err.log'
$MobileOut = Join-Path $LogDir 'mobile.out.log'
$MobileErr = Join-Path $LogDir 'mobile.err.log'
$BackendTunnelLog = Join-Path $LogDir 'backend-tunnel.log'
$MobileTunnelLog = Join-Path $LogDir 'mobile-tunnel.log'
foreach ($f in @($BackendOut,$BackendErr,$MobileOut,$MobileErr,$BackendTunnelLog,$MobileTunnelLog)) {
  Remove-Item $f -Force -ErrorAction SilentlyContinue
}

Write-Step '5. Backend local propre'
$env:PORT = '3010'
$env:SUPABASE_URL = $SupabaseUrl
$env:SUPABASE_ANON_KEY = $SupabaseAnon
$BackendProc = Start-Process -FilePath 'cmd.exe' -ArgumentList '/c','npm run dev --workspace=packages/backend' -WorkingDirectory $Repo -PassThru -WindowStyle Hidden -RedirectStandardOutput $BackendOut -RedirectStandardError $BackendErr
if (!(Wait-Http 'http://127.0.0.1:3010/health' 90)) {
  throw "Backend 3010 non pret. Log: $BackendErr"
}

Write-Step '6. Tunnel HTTPS du backend'
$BackendTunnelProc = Start-Tunnel 'http://127.0.0.1:3010' $BackendTunnelLog
$BackendPublic = Wait-TunnelUrl $BackendTunnelLog 60
if (!$BackendPublic) { throw "Tunnel backend impossible. Log: $BackendTunnelLog" }
Write-Host "Backend public: $BackendPublic" -ForegroundColor DarkGreen

Write-Step '7. Mobile 8081 construit avec CE backend public'
$env:EXPO_PUBLIC_SUPABASE_URL = $SupabaseUrl
$env:EXPO_PUBLIC_SUPABASE_ANON_KEY = $SupabaseAnon
$env:EXPO_PUBLIC_DEMO_MODE = 'false'
$env:EXPO_PUBLIC_API_URL = $BackendPublic
$MobileProc = Start-Process -FilePath 'cmd.exe' -ArgumentList '/c','npm run start:web --workspace=packages/mobile -- --port 8081 --clear' -WorkingDirectory $Repo -PassThru -WindowStyle Hidden -RedirectStandardOutput $MobileOut -RedirectStandardError $MobileErr
if (!(Wait-Http 'http://127.0.0.1:8081/' 120)) {
  throw "Mobile 8081 non pret. Log: $MobileErr"
}

Write-Step '8. Tunnel HTTPS de l application pour le telephone'
$MobileTunnelProc = Start-Tunnel 'http://127.0.0.1:8081' $MobileTunnelLog
$MobilePublic = Wait-TunnelUrl $MobileTunnelLog 60
if (!$MobilePublic) { throw "Tunnel mobile impossible. Log: $MobileTunnelLog" }

$LocalUrl = "http://localhost:8081/?keep_sha=$ShortSha&source=reconcile"
$ShareUrl = "$MobilePublic/?keep_sha=$ShortSha&source=reconcile"

@(
  'KEEP - LIEN DE TEST A PARTAGER'
  ''
  $ShareUrl
  ''
  "Branche: $Branch"
  "SHA: $Sha"
  "Cree: $(Get-Date -Format s)"
  ''
  'IMPORTANT: garder la fenetre START_KEEP_PRO ouverte pendant le test distant.'
) | Set-Content -Encoding UTF8 $ShareFile
Set-Clipboard -Value $ShareUrl

Write-Step '9. Une seule fenetre KEEP dediee sur cet ordinateur'
$Edge = "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
$Chrome = "$env:ProgramFiles\Google\Chrome\Application\chrome.exe"
$ChromeX86 = "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe"
if (Test-Path $Edge) {
  Start-Process $Edge -ArgumentList "--user-data-dir=$BrowserProfile","--app=$LocalUrl",'--no-first-run'
} elseif (Test-Path $Chrome) {
  Start-Process $Chrome -ArgumentList "--user-data-dir=$BrowserProfile","--app=$LocalUrl",'--no-first-run'
} elseif (Test-Path $ChromeX86) {
  Start-Process $ChromeX86 -ArgumentList "--user-data-dir=$BrowserProfile","--app=$LocalUrl",'--no-first-run'
} else {
  Start-Process $LocalUrl
}

Write-Host ''
Write-Host '============================================================' -ForegroundColor Green
Write-Host 'KEEP EST LANCE SUR UNE SOURCE UNIQUE' -ForegroundColor Green
Write-Host "SHA LOCAL : $ShortSha" -ForegroundColor White
Write-Host "LIEN FRERE: $ShareUrl" -ForegroundColor Yellow
Write-Host "Le lien a ete copie dans le presse-papiers et sur: $ShareFile" -ForegroundColor White
Write-Host 'NE PAS utiliser un ancien onglet Firefox/Chrome localhost.' -ForegroundColor Red
Write-Host 'GARDER CETTE FENETRE OUVERTE PENDANT LE TEST A DISTANCE.' -ForegroundColor Yellow
Write-Host '============================================================' -ForegroundColor Green
Write-Host ''

Read-Host 'Appuie sur ENTREE uniquement quand les tests sont termines'

foreach ($p in @($MobileTunnelProc,$BackendTunnelProc,$MobileProc,$BackendProc)) {
  if ($p -and !$p.HasExited) { try { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue } catch {} }
}
Stop-Port 8081
Stop-Port 3010
Write-Host 'KEEP arrete proprement.'
