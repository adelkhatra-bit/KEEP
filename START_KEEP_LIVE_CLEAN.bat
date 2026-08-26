@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul

title KEEP - SOURCE UNIQUE VERIFIEE / CACHE PURGE
color 0A

set "REPO=C:\Users\97156\keep"
set "BRANCH=reconcile/claude-main-20260825"
set "SUPABASE_URL=https://rrhqsqzcplvmwxizqnla.supabase.co"
set "SUPABASE_KEY=sb_publishable_TUz-oaWk8QZDl4pTfCvkPw_3_iwJJru"

echo ==============================================
echo   KEEP - RUNTIME ISOLE + CACHE PURGE
echo   Projet : %REPO%
echo   Branche: %BRANCH%
echo ==============================================
echo.

if not exist "%REPO%\.git" (
  echo ERREUR: %REPO% n'est pas le depot KEEP attendu.
  pause
  exit /b 1
)

echo [1/12] Fermeture TOTALE des anciens Node/Expo/Next...
taskkill /F /IM node.exe >nul 2>&1
timeout /t 2 /nobreak >nul

echo [2/12] Verification outils...
where git >nul 2>&1 || (echo ERREUR Git. & pause & exit /b 1)
where node >nul 2>&1 || (echo ERREUR Node. & pause & exit /b 1)
where npm >nul 2>&1 || (echo ERREUR npm. & pause & exit /b 1)

cd /D "%REPO%"

echo [3/12] Sauvegarde changements locaux non publies...
set "DIRTY="
for /f "delims=" %%A in ('git status --porcelain') do set "DIRTY=1"
if defined DIRTY (
  git stash push -u -m "KEEP_AUTO_BACKUP_BEFORE_RUNTIME_SYNC"
  if errorlevel 1 (echo ERREUR sauvegarde locale. & pause & exit /b 1)
)

echo [4/12] Synchronisation STRICTE de la seule branche autorisee...
git fetch origin
if errorlevel 1 (echo ERREUR git fetch. & pause & exit /b 1)
git switch "%BRANCH%"
if errorlevel 1 git switch -c "%BRANCH%" --track "origin/%BRANCH%"
if errorlevel 1 (echo ERREUR branche. & pause & exit /b 1)
git pull --ff-only origin "%BRANCH%"
if errorlevel 1 (echo ERREUR pull ff-only. & pause & exit /b 1)

for /f %%S in ('git rev-parse --short HEAD') do set "KEEP_SHA=%%S"
echo.
echo ===== KEEP RUNTIME =====
echo DOSSIER : %CD%
echo BRANCHE : %BRANCH%
echo SHA     : %KEEP_SHA%
echo ========================

echo [5/12] Verification anti-ancienne-version...
findstr /C:"ENTRER EN MODE DEMO" "packages\mobile\src\screens\onboarding\OnboardingScreen.tsx" >nul 2>&1
if errorlevel 1 findstr /C:"ENTRER EN MODE DÉMO" "packages\mobile\src\screens\onboarding\OnboardingScreen.tsx" >nul 2>&1
if errorlevel 1 (echo ERREUR: bouton demo attendu absent du code courant. & pause & exit /b 1)
findstr /C:"Accéder immédiatement à KEEP sans créer de compte" "packages\mobile\src\screens\onboarding\OnboardingScreen.tsx" >nul 2>&1
if not errorlevel 1 (echo ERREUR: ancien texte demo encore present. & pause & exit /b 1)

echo [6/12] NETTOYAGE TOTAL caches KEEP / Expo / Metro / Next...
if exist "%REPO%\.expo" rmdir /S /Q "%REPO%\.expo"
if exist "%REPO%\.metro-cache" rmdir /S /Q "%REPO%\.metro-cache"
if exist "%REPO%\packages\mobile\.expo" rmdir /S /Q "%REPO%\packages\mobile\.expo"
if exist "%REPO%\packages\mobile\dist" rmdir /S /Q "%REPO%\packages\mobile\dist"
if exist "%REPO%\packages\mobile\dist-web" rmdir /S /Q "%REPO%\packages\mobile\dist-web"
if exist "%REPO%\packages\mobile\web-build" rmdir /S /Q "%REPO%\packages\mobile\web-build"
if exist "%REPO%\packages\admin\.next" rmdir /S /Q "%REPO%\packages\admin\.next"
if exist "%REPO%\node_modules\.cache" rmdir /S /Q "%REPO%\node_modules\.cache"
if exist "%REPO%\packages\mobile\node_modules\.cache" rmdir /S /Q "%REPO%\packages\mobile\node_modules\.cache"
for /d %%D in ("%TEMP%\metro-cache*" "%TEMP%\metro-*" "%TEMP%\haste-map*") do if exist "%%~fD" rmdir /S /Q "%%~fD" >nul 2>&1

echo [7/12] Controle ports avant relance...
for %%P in (8081 3001 3010) do (
  for /f "tokens=5" %%I in ('netstat -ano ^| findstr ":%%P " ^| findstr LISTENING') do taskkill /F /PID %%I >nul 2>&1
)

echo [8/12] Controle source unique...
node scripts\verify-source-of-truth.cjs
if errorlevel 1 (echo ERREUR source unique. & pause & exit /b 1)

echo [9/12] Dependances...
call npm ci
if errorlevel 1 (echo ERREUR npm ci. & pause & exit /b 1)

echo [10/12] Backend 3010 + Admin 3001...
start "KEEP BACKEND - %KEEP_SHA%" cmd /k "cd /D \"%REPO%\" && set SUPABASE_URL=%SUPABASE_URL%&& set SUPABASE_ANON_KEY=%SUPABASE_KEY%&& set PORT=3010&& npm run dev --workspace=packages/backend"
start "KEEP ADMIN - %KEEP_SHA%" cmd /k "cd /D \"%REPO%\" && set NEXT_PUBLIC_SUPABASE_URL=%SUPABASE_URL%&& set NEXT_PUBLIC_SUPABASE_ANON_KEY=%SUPABASE_KEY%&& set NEXT_PUBLIC_API_URL=http://localhost:3010&& npm run dev --workspace=packages/admin -- -p 3001"

echo [11/12] Mobile 8081 depuis CE DOSSIER et CE SHA uniquement...
start "KEEP MOBILE - %KEEP_SHA%" cmd /k "cd /D \"%REPO%\" && set EXPO_PUBLIC_SUPABASE_URL=%SUPABASE_URL%&& set EXPO_PUBLIC_SUPABASE_ANON_KEY=%SUPABASE_KEY%&& set EXPO_PUBLIC_DEMO_MODE=false&& set EXPO_PUBLIC_API_URL=http://localhost:3010&& npm run start:web --workspace=packages/mobile -- --port 8081 --clear"

echo [12/12] Attente REELLE de /Main/Listen avant ouverture navigateur...
set "READY="
for /L %%I in (1,1,90) do (
  powershell -NoProfile -Command "try { $r=Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:8081/Main/Listen' -TimeoutSec 2; if($r.StatusCode -ge 200 -and $r.StatusCode -lt 500 -and $r.Content.Length -gt 100){exit 0}else{exit 1} } catch { exit 1 }" >nul 2>&1
  if not errorlevel 1 (
    set "READY=1"
    goto :mobile_ready
  )
  timeout /t 1 /nobreak >nul
)

:mobile_ready
if not defined READY (
  echo ERREUR: KEEP /Main/Listen n'est pas pret sur 8081.
  echo La page blanche n'est PAS ouverte. Regarde la fenetre KEEP MOBILE pour l'erreur Expo.
  pause
  exit /b 1
)

set "ADMIN_READY="
for /L %%I in (1,1,45) do (
  powershell -NoProfile -Command "try { $r=Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:3001/login' -TimeoutSec 2; if($r.StatusCode -ge 200 -and $r.StatusCode -lt 500){exit 0}else{exit 1} } catch { exit 1 }" >nul 2>&1
  if not errorlevel 1 (
    set "ADMIN_READY=1"
    goto :admin_ready
  )
  timeout /t 1 /nobreak >nul
)

:admin_ready
set "APP_URL=http://localhost:8081/Main/Listen?keep_sha=%KEEP_SHA%&nocache=%RANDOM%%RANDOM%"
set "ADMIN_URL=http://localhost:3001/login?keep_sha=%KEEP_SHA%&nocache=%RANDOM%%RANDOM%"
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" (
  start "" "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" --inprivate --new-window "%APP_URL%"
  if defined ADMIN_READY start "" "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" --inprivate --new-window "%ADMIN_URL%"
) else if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
  start "" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" --incognito --new-window "%APP_URL%"
  if defined ADMIN_READY start "" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" --incognito --new-window "%ADMIN_URL%"
) else (
  start "" "%APP_URL%"
  if defined ADMIN_READY start "" "%ADMIN_URL%"
)

echo.
echo ==============================================
echo KEEP ISOLE / CACHE VIDE / ROUTE ECOUTE VERIFIEE
echo SHA : %KEEP_SHA%
echo APP : %APP_URL%
if defined ADMIN_READY (echo ADMIN: %ADMIN_URL%) else (echo ADMIN: demarrage trop lent, fenetre admin non ouverte automatiquement)
echo ==============================================
echo.
pause
