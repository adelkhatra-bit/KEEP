@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul

title KEEP - SOURCE UNIQUE VERIFIEE
color 0A

set "REPO=C:\Users\97156\keep"
set "BRANCH=reconcile/claude-main-20260825"
set "SUPABASE_URL=https://rrhqsqzcplvmwxizqnla.supabase.co"
set "SUPABASE_KEY=sb_publishable_TUz-oaWk8QZDl4pTfCvkPw_3_iwJJru"

echo ==============================================
echo   KEEP - RUNTIME ISOLE
echo   Projet : %REPO%
echo   Branche: %BRANCH%
echo ==============================================
echo.

if not exist "%REPO%\.git" (
  echo ERREUR: %REPO% n'est pas le depot KEEP attendu.
  pause
  exit /b 1
)

echo [1/11] Fermeture TOTALE des anciens Node/Expo/Next...
taskkill /F /IM node.exe >nul 2>&1
timeout /t 2 /nobreak >nul

echo [2/11] Verification outils...
where git >nul 2>&1 || (echo ERREUR Git. & pause & exit /b 1)
where node >nul 2>&1 || (echo ERREUR Node. & pause & exit /b 1)
where npm >nul 2>&1 || (echo ERREUR npm. & pause & exit /b 1)

cd /D "%REPO%"

echo [3/11] Sauvegarde changements locaux non publies...
set "DIRTY="
for /f "delims=" %%A in ('git status --porcelain') do set "DIRTY=1"
if defined DIRTY (
  git stash push -u -m "KEEP_AUTO_BACKUP_BEFORE_RUNTIME_SYNC"
  if errorlevel 1 (echo ERREUR sauvegarde locale. & pause & exit /b 1)
)

echo [4/11] Synchronisation STRICTE de la seule branche autorisee...
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

echo [5/11] Verification anti-ancienne-version...
findstr /C:"ENTRER EN MODE DEMO" "packages\mobile\src\screens\onboarding\OnboardingScreen.tsx" >nul 2>&1
if errorlevel 1 (
  findstr /C:"ENTRER EN MODE DÉMO" "packages\mobile\src\screens\onboarding\OnboardingScreen.tsx" >nul 2>&1
)
if errorlevel 1 (echo ERREUR: bouton demo attendu absent du code courant. & pause & exit /b 1)
findstr /C:"Acceder immediatement a KEEP sans creer de compte" "packages\mobile\src\screens\onboarding\OnboardingScreen.tsx" >nul 2>&1
if not errorlevel 1 (echo ERREUR: ancien texte demo encore present. & pause & exit /b 1)

echo [6/11] Nettoyage caches Expo/Metro/Next/web...
if exist "%REPO%\.expo" rmdir /S /Q "%REPO%\.expo"
if exist "%REPO%\packages\mobile\.expo" rmdir /S /Q "%REPO%\packages\mobile\.expo"
if exist "%REPO%\packages\admin\.next" rmdir /S /Q "%REPO%\packages\admin\.next"
if exist "%REPO%\node_modules\.cache" rmdir /S /Q "%REPO%\node_modules\.cache"

echo [7/11] Controle source unique...
node scripts\verify-source-of-truth.cjs
if errorlevel 1 (echo ERREUR source unique. & pause & exit /b 1)

echo [8/11] Dependances...
call npm ci
if errorlevel 1 (echo ERREUR npm ci. & pause & exit /b 1)

echo [9/11] Backend 3010 + Admin 3001...
start "KEEP BACKEND - %KEEP_SHA%" cmd /k "cd /D \"%REPO%\" && set SUPABASE_URL=%SUPABASE_URL%&& set SUPABASE_ANON_KEY=%SUPABASE_KEY%&& set PORT=3010&& npm run dev --workspace=packages/backend"
start "KEEP ADMIN - %KEEP_SHA%" cmd /k "cd /D \"%REPO%\" && set NEXT_PUBLIC_SUPABASE_URL=%SUPABASE_URL%&& set NEXT_PUBLIC_SUPABASE_ANON_KEY=%SUPABASE_KEY%&& set NEXT_PUBLIC_API_URL=http://localhost:3010&& npm run dev --workspace=packages/admin -- -p 3001"

echo [10/11] Mobile 8081 depuis CE DOSSIER et CE SHA uniquement...
start "KEEP MOBILE - %KEEP_SHA%" cmd /k "cd /D \"%REPO%\" && set EXPO_PUBLIC_SUPABASE_URL=%SUPABASE_URL%&& set EXPO_PUBLIC_SUPABASE_ANON_KEY=%SUPABASE_KEY%&& set EXPO_PUBLIC_DEMO_MODE=false&& set EXPO_PUBLIC_API_URL=http://localhost:3010&& npm run start:web --workspace=packages/mobile -- --port 8081 --clear"

echo [11/11] Ouverture avec cache-buster SHA...
timeout /t 18 /nobreak >nul
start "" "http://localhost:3001/login?v=%KEEP_SHA%"
start "" "http://localhost:8081/?v=%KEEP_SHA%"

echo.
echo ==============================================
echo KEEP ISOLE ET LANCE
echo SHA : %KEEP_SHA%
echo APP : http://localhost:8081/?v=%KEEP_SHA%
echo ADMIN: http://localhost:3001/login?v=%KEEP_SHA%
echo ==============================================
echo.
pause
